import {
  conventionalPartyAttack,
  type PartyAttackFixture,
  type PartyAttackOutput,
} from "../comparison/party-attack-reference.js";
import { CLAUSE_COMMIT } from "../../scripts/clause-pin.js";

const chromePath = Bun.env.CHROME_PATH ?? "google-chrome";
const debugPort = 9253;
const gamePort = 4187;
const gameUrl = `http://127.0.0.1:${gamePort}/?measure=1`;
const sourcePath = "src/world/embodied-encounter.clause";
const sourceFixture = "build/comparison/party-attack-source.clause";
const outputPath = "build/comparison/party-attack.json";

type JsonObject = Readonly<Record<string, unknown>>;

interface ExplainedState {
  readonly slot: number;
  readonly source: JsonObject;
  readonly before: unknown;
  readonly after: unknown;
}

function requireCondition(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function object(value: unknown, context: string): JsonObject {
  requireCondition(typeof value === "object" && value !== null && !Array.isArray(value), `${context} is not an object`);
  return value as JsonObject;
}

function finite(value: unknown, context: string): number {
  requireCondition(typeof value === "number" && Number.isFinite(value), `${context} is not a finite number`);
  return value;
}

function boolean(value: unknown, context: string): boolean {
  requireCondition(typeof value === "boolean", `${context} is not Boolean`);
  return value;
}

function text(value: unknown, context: string): string {
  requireCondition(typeof value === "string", `${context} is not text`);
  return value;
}

function values(value: unknown, context: string): readonly JsonObject[] {
  return Object.values(object(value, context)).map((entry, index) => object(entry, `${context}[${index}]`));
}

function exactPartyAttack(explanationValue: unknown, expectedTarget: string, expectedContributors: number): Readonly<{
  fixture: PartyAttackFixture;
  output: PartyAttackOutput;
  changedStateSlots: readonly number[];
  guardReferences: Readonly<{ encounterState: unknown; chosenTarget: unknown }>;
  contributionDeltas: readonly number[];
}> {
  const explanation = object(explanationValue, "recorded Attack explanation");
  requireCondition(/^[0-9a-f]{64}$/.test(text(explanation.step, "recorded Step identity")), "explanation omitted exact Step identity");
  requireCondition(/^[0-9a-f]{64}$/.test(text(explanation["physical-plan"], "recorded physical-plan identity")), "explanation omitted exact physical plan");
  requireCondition(explanation["rule-applied"] === true, "recorded Attack applied no rule");
  requireCondition(explanation.truncated === false, "recorded Attack trace was truncated");

  const states = Object.entries(object(explanation.states, "recorded states")).map(([coordinate, value]) => {
    const state = object(value, `recorded state ${coordinate}`);
    return {
      slot: finite(Number(coordinate), `recorded state coordinate ${coordinate}`),
      source: object(state.source, `recorded state ${coordinate} source`),
      before: state.before,
      after: state.after,
    } satisfies ExplainedState;
  });
  const stateAt = (slot: number): ExplainedState => {
    const result = states.find((state) => state.slot === slot);
    requireCondition(result !== undefined, `recorded state slot ${slot} is absent`);
    return result;
  };
  const before = object(explanation["before-projection"], "recorded before view");
  const after = object(explanation["after-projection"], "recorded after view");
  const referentKey = (value: unknown): string => {
    const reference = object(value, "recorded subject reference");
    requireCondition(reference.kind === "referent", "recorded subject is not a referent");
    return JSON.stringify(reference);
  };
  const idsByReferent = new Map<string, string>();
  for (const [id, value] of Object.entries(before)) {
    const subject = object(value, `recorded subject ${id}`);
    const references = subject.$referent === undefined
      ? Object.values(object(subject.$referents ?? {}, `${id} referents`))
      : [subject.$referent];
    for (const reference of references) idsByReferent.set(referentKey(reference), id);
  }
  const subjectId = (reference: unknown): string => {
    const id = idsByReferent.get(referentKey(reference));
    requireCondition(id !== undefined, "recorded reference has no subject in the same Step");
    return id;
  };
  const viewValue = (view: JsonObject, id: string, relation: string): unknown =>
    object(view[id], `recorded ${id}`)[relation];
  const beforeNumber = (id: string, relation: string) =>
    finite(viewValue(before, id, relation), `${id} ${relation} before`);
  const beforeBoolean = (id: string, relation: string) =>
    boolean(viewValue(before, id, relation), `${id} ${relation} before`);
  const beforePosition = (id: string) => {
    const position = object(viewValue(before, id, "actor-position"), `${id} position`);
    return { x: finite(position.x, `${id} position.x`), z: finite(position.z, `${id} position.z`) };
  };
  const effectRelation = (effect: JsonObject): unknown =>
    stateAt(finite(effect.slot, "effect slot")).source.relation;
  const allSelectedRules = values(explanation.rules, "recorded rules").filter((rule) => rule.selected === true);
  const selectedRules = allSelectedRules.filter((rule) => {
    const source = object(rule.source, "selected rule source");
    return source.designation === "party-attack" && values(rule.effects, "selected effects").some(
      (effect) => effect.additive === true && effectRelation(effect) === "vitality",
    );
  });
  requireCondition(selectedRules.length === expectedContributors,
    `expected ${expectedContributors} damage-contributing party-attack occurrences, received ${selectedRules.length}`);

  const contributionSubjects = new Set<string>();
  const checkRecordedEffect = (effect: JsonObject): void => {
    const relation = text(effectRelation(effect), "effect relation");
    const id = subjectId(effect.subject);
    const value = object(effect.evaluated, "evaluated effect").value;
    if (effect.additive === false) {
      requireCondition(JSON.stringify(viewValue(after, id, relation)) === JSON.stringify(value),
        `${id} ${relation} after view differed from its recorded replacement`);
    }
  };

  const contributors = selectedRules.map((rule, index) => {
    const effects = values(rule.effects, `selected party-attack ${index} effects`);
    const cooldownEffects = effects.filter((effect) => {
      if (effect.additive !== false) return false;
      return effectRelation(effect) === "action-cooldown";
    });
    const damageEffects = effects.filter((effect) => {
      if (effect.additive !== true) return false;
      return effectRelation(effect) === "vitality";
    });
    requireCondition(cooldownEffects.length === 1 && damageEffects.length === 1,
      `selected party-attack ${index} did not expose one cooldown replacement and one vitality contribution`);
    const evaluated = object(damageEffects[0]!.evaluated, `selected party-attack ${index} evaluated damage`);
    const unitId = subjectId(cooldownEffects[0]!.subject);
    requireCondition(!contributionSubjects.has(unitId), "recorded party Attack repeated a contributing unit");
    contributionSubjects.add(unitId);
    return {
      unitId,
      targetId: subjectId(damageEffects[0]!.subject),
      targetVitalitySlot: finite(damageEffects[0]!.slot, "target vitality slot"),
      delta: finite(evaluated.value, `selected party-attack ${index} evaluated damage`),
    };
  });
  // Include the whole recorded company so selection/eligibility are evaluated
  // independently by the reference, rather than pre-filtered by the trace.
  const unitIds = Object.entries(before).filter(([, value]) =>
    "unit-class" in object(value, "recorded company subject"),
  ).map(([id]) => id).sort();
  requireCondition(unitIds.length === 5, `recorded company has ${unitIds.length} units`);
  const guardReferences = {
    encounterState: viewValue(before, "encounter", "encounter-state"),
    chosenTarget: viewValue(before, "player-1", "chosen-target"),
  };
  const targetId = subjectId(guardReferences.chosenTarget);
  requireCondition(targetId === expectedTarget, `bounded comparison targeted ${targetId}, expected ${expectedTarget}`);
  requireCondition(contributors.every((contributor) => contributor.targetId === targetId),
    "recorded contributions did not all address the chosen target");
  const targetSlots = new Set(contributors.map((contributor) => contributor.targetVitalitySlot));
  requireCondition(targetSlots.size === (expectedContributors === 0 ? 0 : 1),
    "recorded party Attack contributions did not share one vitality slot");

  const targetPosition = beforePosition(targetId);
  const units = unitIds.map((id) => {
    const position = beforePosition(id);
    return {
      id,
      selected: beforeBoolean(id, "selected"),
      alive: beforeBoolean(id, "alive"),
      vitality: beforeNumber(id, "vitality"),
      x: position.x,
      z: position.z,
      attackDamage: beforeNumber(id, "attack-damage"),
      attackRange: beforeNumber(id, "attack-range"),
      actionCooldown: beforeNumber(id, "action-cooldown"),
      actionPeriod: beforeNumber(id, "action-period"),
    };
  });
  for (const contributor of contributors) {
    const unit = units.find((candidate) => candidate.id === contributor.unitId)!;
    requireCondition(Object.is(contributor.delta, 0 - unit.attackDamage),
      `${contributor.unitId} recorded delta ${contributor.delta} differed from source damage ${unit.attackDamage}`);
  }
  const fixture: PartyAttackFixture = {
    encounterActive: subjectId(guardReferences.encounterState) === "active",
    chosenTargetMatches: subjectId(guardReferences.chosenTarget) === expectedTarget,
    target: {
      id: targetId,
      x: targetPosition.x,
      z: targetPosition.z,
      vitality: beforeNumber(targetId, "vitality"),
      hostile: beforeBoolean(targetId, "hostile"),
    },
    units,
  };
  const clauseOutput: PartyAttackOutput = {
    targetVitality: finite(viewValue(after, targetId, "vitality"), `${targetId} vitality after`),
    actionCooldowns: Object.fromEntries(unitIds.map((id) => [
      id,
      finite(viewValue(after, id, "action-cooldown"), `${id} action-cooldown after`),
    ])),
    contributors: contributors.map((contributor) => contributor.unitId).sort(),
    accumulatedDamage:
      fixture.target.vitality - finite(viewValue(after, targetId, "vitality"), `${targetId} vitality after`),
  };
  const effects = allSelectedRules.flatMap((rule) => values(rule.effects, "selected effects"));
  effects.forEach(checkRecordedEffect);
  const effectSlots = new Set(effects.map((effect) => finite(effect.slot, "selected effect slot")));
  const changedStateSlots = states
    .filter((state) => JSON.stringify(state.before) !== JSON.stringify(state.after))
    .map((state) => state.slot)
    .sort((left, right) => left - right);
  requireCondition(changedStateSlots.every((slot) => effectSlots.has(slot)),
    `recorded Attack changed unexplained state slots ${JSON.stringify(changedStateSlots.filter((slot) => !effectSlots.has(slot)))}`);
  return {
    fixture,
    output: clauseOutput,
    changedStateSlots,
    guardReferences,
    contributionDeltas: contributors.map((contributor) => contributor.delta),
  };
}

const source = await Bun.file(sourcePath).arrayBuffer();
await Bun.write(sourceFixture, source);
const server = Bun.spawn({
  cmd: [process.execPath, "build/host/play-server.js"],
  env: { ...process.env, GREYWROUGHT_PORT: String(gamePort), GREYWROUGHT_RESIDENT_SOURCE: sourceFixture },
  stdout: "pipe",
  stderr: "inherit",
});
const chrome = Bun.spawn({
  cmd: [chromePath, "--headless=new", "--no-sandbox", "--disable-dev-shm-usage",
    `--remote-debugging-port=${debugPort}`, `--user-data-dir=/tmp/greywrought-cdp-compare-${process.pid}`,
    "--window-size=1280,900", "--enable-unsafe-swiftshader", "--use-angle=swiftshader", "about:blank"],
  stdout: "ignore",
  stderr: "ignore",
});

let socket: WebSocket | null = null;
try {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    try { if ((await fetch(`http://127.0.0.1:${gamePort}/`)).ok) break; } catch {}
    await Bun.sleep(25);
  }
  for (let attempt = 0; attempt < 160; attempt += 1) {
    try { if ((await fetch(`http://127.0.0.1:${debugPort}/json/version`)).ok) break; } catch {}
    await Bun.sleep(25);
  }
  const tabResponse = await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`, { method: "PUT" });
  requireCondition(tabResponse.ok, "comparison Chrome tab did not open");
  const tab = await tabResponse.json() as { webSocketDebuggerUrl?: string };
  requireCondition(typeof tab.webSocketDebuggerUrl === "string", "comparison tab omitted debugger URL");
  socket = new WebSocket(tab.webSocketDebuggerUrl);
  let nextId = 1;
  const pending = new Map<number, (value: any) => void>();
  socket.onmessage = (event) => {
    const message = JSON.parse(String(event.data));
    if (message.id) { pending.get(message.id)?.(message); pending.delete(message.id); }
  };
  await Promise.race([
    new Promise<void>((resolve) => { socket!.onopen = () => resolve(); }),
    Bun.sleep(10_000).then(() => { throw new Error("comparison CDP socket timed out"); }),
  ]);
  const call = (method: string, params: Record<string, unknown> = {}) => {
    const id = nextId++;
    socket!.send(JSON.stringify({ id, method, params }));
    return Promise.race([
      new Promise<any>((resolve) => pending.set(id, resolve)),
      Bun.sleep(15_000).then(() => { throw new Error(`comparison CDP timeout in ${method}`); }),
    ]);
  };
  const evaluate = async <T>(expression: string): Promise<T> => {
    const message = await call("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (message.result?.exceptionDetails) throw new Error(message.result.exceptionDetails.exception?.description ?? message.result.exceptionDetails.text);
    return message.result?.result?.value as T;
  };
  const waitFor = async <T>(expression: string, accept: (value: T) => boolean, label: string, attempts = 400): Promise<T> => {
    let value = await evaluate<T>(expression);
    for (let attempt = 0; attempt < attempts && !accept(value); attempt += 1) {
      await Bun.sleep(25);
      value = await evaluate<T>(expression);
    }
    requireCondition(accept(value), `${label} did not settle: ${JSON.stringify(value)}`);
    return value;
  };
  const click = (id: string) => evaluate(`document.getElementById(${JSON.stringify(id)}).click()`);

  await call("Runtime.enable");
  await call("Page.enable");
  await call("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await call("Page.navigate", { url: gameUrl });
  await waitFor<string>("document.body?.dataset.gamePhase || ''", (value) => value === "ready", "comparison world ready");
  await click("begin-encounter");
  await waitFor<string>("document.body.dataset.encounterPhase || ''", (value) => value === "Battle joined", "comparison encounter");
  await click("select-all");
  for (const scenario of [
    { name: "accepted", target: "cinder-1", contributors: 5, report: "Attack — Accepted", output: outputPath },
    { name: "rejected-friendly-target", target: "moonwell", contributors: 0, report: "Attack — Wrong target", output: "build/comparison/party-attack-rejected.json" },
  ]) {
    await click(`target-${scenario.target}`);
    const readiness = await waitFor<Record<string, any>>(
      `(() => { const p=(window.__GREYWROUGHT_GAME_EVENTS__||[]).filter(e=>e.phase==='projection').at(-1);
        return p?.target===${JSON.stringify(scenario.target)} && p?.selected?.length===5 && Object.values(p?.cooldowns||{}).every(v=>v<=0) ? p : {}; })()`,
      (value) => typeof value.vitality?.[scenario.target] === "number",
      "settled party attack precondition",
    );
    requireCondition(readiness.encounter === "Battle joined", "comparison encounter ended before the order");
    const gameEventIndex = await evaluate<number>("window.__GREYWROUGHT_GAME_EVENTS__.length");
    await evaluate("window.__GREYWROUGHT_MEASUREMENTS__.length=0");
    const clauseStarted = performance.now();
    await click("command-attack");
    await waitFor<string>(
      "document.getElementById('command-status').textContent",
      (value) => value.includes(scenario.report),
      "processed party Attack report",
    );
    await click("explain-attack");
    const diagnostic = await waitFor<Record<string, any>>(
      `(window.__GREYWROUGHT_GAME_EVENTS__||[]).slice(${gameEventIndex}).findLast(e=>e.phase==='diagnostic'&&e.entry==='attack') || {}`,
      (value) => typeof value.explanation?.step === "string",
      "recorded party Attack explanation",
    );
    const clauseCaptureWallMillis = performance.now() - clauseStarted;
    await Bun.write(`${scenario.output}.explanation.json`, `${JSON.stringify(diagnostic.explanation, null, 2)}\n`);
    const exact = exactPartyAttack(diagnostic.explanation, scenario.target, scenario.contributors);

    const referenceStarted = performance.now();
    const referenceOutput = conventionalPartyAttack(exact.fixture);
    const referenceWallMillis = performance.now() - referenceStarted;
    requireCondition(Object.is(referenceOutput.targetVitality, exact.output.targetVitality),
      `reference target vitality ${referenceOutput.targetVitality} differed from Clause ${exact.output.targetVitality}`);
    requireCondition(Object.is(referenceOutput.accumulatedDamage, exact.output.accumulatedDamage),
      `reference accumulated damage ${referenceOutput.accumulatedDamage} differed from Clause ${exact.output.accumulatedDamage}`);
    requireCondition(JSON.stringify(referenceOutput.actionCooldowns) === JSON.stringify(exact.output.actionCooldowns),
      `reference cooldowns diverged: ${JSON.stringify({ clause: exact.output.actionCooldowns, reference: referenceOutput.actionCooldowns })}`);
    requireCondition(JSON.stringify(referenceOutput.contributors) === JSON.stringify(exact.output.contributors),
      `reference contributors diverged: ${JSON.stringify({ clause: exact.output.contributors, reference: referenceOutput.contributors })}`);

    const measurements = await evaluate<Record<string, any>[]>("window.__GREYWROUGHT_MEASUREMENTS__");
    const requestedAttacks = await evaluate<Record<string, any>[]>(
      `window.__GREYWROUGHT_GAME_EVENTS__.slice(${gameEventIndex}).filter(e=>e.phase==='action-requested'&&e.action==='Attack')`,
    );
    requireCondition(requestedAttacks.length === 1,
      `expected one ordinary Attack request in this case, received ${requestedAttacks.length}`);
    const observedAttackInputs = measurements.filter((measurement) =>
      measurement.metric === "observed-input" && measurement.input?.kind === "keyboard" &&
      measurement.input?.code === "Attack" && measurement.input?.phase === "down"
    );
    requireCondition(observedAttackInputs.length === 1, `expected one observed Attack input, received ${observedAttackInputs.length}`);
    const observedInput = observedAttackInputs[0]!;
    const lifecycle = measurements.filter((measurement) => measurement.metric === "lifecycle");
    const configurationReceipt = lifecycle.find((receipt) =>
      receipt.event === "configuration-observed" && receipt.sequence === observedInput.receiptSequence
    );
    requireCondition(configurationReceipt !== undefined, "Attack input omitted its exact configuration-observed receipt");
    requireCondition(configurationReceipt.configurationRevision === observedInput.configurationRevision,
      "Attack input/configuration receipt revision diverged");
    requireCondition(configurationReceipt.activeGeneration === observedInput.activeGeneration,
      "Attack input/configuration receipt generation diverged");
    const candidateReceipt = lifecycle.find((receipt) =>
      receipt.event === "candidate-requested" && receipt.sequence > configurationReceipt.sequence &&
      receipt.activeGeneration === observedInput.activeGeneration &&
      receipt.configurationRevision === observedInput.configurationRevision + 1
    );
    requireCondition(candidateReceipt !== undefined, "Attack configuration omitted its next candidate request");
    const operationReceipts = lifecycle.filter((receipt) =>
      receipt.operationId === candidateReceipt.operationId && receipt.activeGeneration === candidateReceipt.activeGeneration
    );
    for (const required of ["candidate-requested", "candidate-produced", "admission-requested", "admission-accepted"]) {
      requireCondition(operationReceipts.some((receipt) => receipt.event === required), `comparison operation omitted ${required}`);
  }

  const explanation = object(diagnostic.explanation, "recorded Attack explanation");
  const artifact = {
    schema: "greywrought-party-attack-comparison-v3",
    scenario: scenario.name,
    recordedAt: new Date().toISOString(),
    conditions: {
      viewport: [1280, 900],
      dpr: 1,
      renderer: "SwiftShader",
      sourceSha256: new Bun.CryptoHasher("sha256").update(source).digest("hex"),
      clausePin: CLAUSE_COMMIT,
      numericSemantics: "finite IEEE-754 binary64; Clause and reference sort numeric deltas ascending before folding; contributor IDs are sorted only for output presentation",
    },
    inputEvidence: {
      exactObservedInput: observedInput.input,
      configurationReceipt,
      operationId: candidateReceipt.operationId,
      lifecycle: operationReceipts,
      recordedStep: explanation.step,
      physicalPlan: explanation["physical-plan"],
    },
    recordedExplanation: diagnostic.explanation,
    normalizedFixture: exact.fixture,
    normalizationEvidence: {
      changedStateSlots: exact.changedStateSlots,
      guardReferences: exact.guardReferences,
      contributionDeltas: exact.contributionDeltas,
      note: "Inputs include every company unit and untouched constants from the exact recorded before view; encounter/target referents resolve within that view. Output vitality/cooldowns come from the recorded after view. Damage occurrences are distinct from processed-order reports, whose recorded replacements are also checked. Both complete views and the relational trace are retained.",
    },
    clause: { output: exact.output, captureJourneyWallMillis: clauseCaptureWallMillis },
    conventionalReference: { output: referenceOutput, isolatedFunctionWallMillis: referenceWallMillis },
    parity: true,
    serviceBoundary: {
      clause: ["checked source package", "typed input", "relational specialization", "hidden candidate", "atomic accumulation/conflict checks", "Admission", "authority budget", "projection", "same-Step execution trace"],
      reference: ["trusted normalized fixture", "synchronous predicate/filter", "matching finite-binary64 delta ordering", "plain object result"],
    },
  };
  await Bun.write(scenario.output, `${JSON.stringify(artifact, null, 2)}\n`);
  console.log(`Party Attack ${scenario.name} parity passed from recorded Step ${String(explanation.step)}: ${exact.fixture.target.vitality} -> ${exact.output.targetVitality}; ${exact.output.contributors.length} contributors; raw greywrought:${scenario.output}`);
  }
} finally {
  socket?.close();
  chrome.kill();
  server.kill();
}
