import {
  conventionalPartyAttack,
  type PartyAttackFixture,
  type PartyAttackOutput,
} from "../comparison/party-attack-reference.js";

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

function exactPartyAttack(explanationValue: unknown): Readonly<{
  fixture: PartyAttackFixture;
  output: PartyAttackOutput;
  changedStateSlots: readonly number[];
  guardStateSlots: Readonly<{ encounterState: number; chosenTarget: number }>;
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
  const stateFor = (subject: string, relation: string): ExplainedState => {
    const matching = states.filter((state) =>
      state.source.subject === subject && state.source.relation === relation && state.source.field === undefined
    );
    requireCondition(matching.length === 1, `recorded ${subject} ${relation} state count was ${matching.length}`);
    return matching[0]!;
  };
  const stateFieldFor = (subject: string, relation: string, field: string): ExplainedState => {
    const matching = states.filter((state) =>
      state.source.subject === subject && state.source.relation === relation && state.source.field === field
    );
    requireCondition(matching.length === 1,
      `recorded ${subject} ${relation}.${field} state count was ${matching.length}`);
    return matching[0]!;
  };
  const beforeNumber = (subject: string, relation: string) =>
    finite(stateFor(subject, relation).before, `${subject} ${relation} before`);
  const beforeBoolean = (subject: string, relation: string) =>
    boolean(stateFor(subject, relation).before, `${subject} ${relation} before`);
  const beforePosition = (subject: string) => {
    return {
      x: finite(stateFieldFor(subject, "actor-position", "x").before, `${subject} position.x`),
      z: finite(stateFieldFor(subject, "actor-position", "z").before, `${subject} position.z`),
    };
  };

  const selectedRules = values(explanation.rules, "recorded rules").filter((rule) => {
    if (rule.selected !== true) return false;
    const source = object(rule.source, "selected rule source");
    return source.designation === "party-attack";
  });
  requireCondition(selectedRules.length === 5, `expected five selected party-attack occurrences, received ${selectedRules.length}`);

  const contributors = selectedRules.map((rule, index) => {
    const effects = values(rule.effects, `selected party-attack ${index} effects`);
    const cooldownEffects = effects.filter((effect) => {
      if (effect.additive !== false) return false;
      const state = stateAt(finite(effect.slot, `selected party-attack ${index} cooldown slot`));
      return state.source.relation === "action-cooldown";
    });
    const damageEffects = effects.filter((effect) => {
      if (effect.additive !== true) return false;
      const state = stateAt(finite(effect.slot, `selected party-attack ${index} damage slot`));
      return state.source.relation === "vitality";
    });
    requireCondition(cooldownEffects.length === 1 && damageEffects.length === 1,
      `selected party-attack ${index} did not expose one cooldown replacement and one vitality contribution`);
    const cooldownState = stateAt(finite(cooldownEffects[0]!.slot, `selected party-attack ${index} cooldown slot`));
    const damageState = stateAt(finite(damageEffects[0]!.slot, `selected party-attack ${index} damage slot`));
    const evaluated = object(damageEffects[0]!.evaluated, `selected party-attack ${index} evaluated damage`);
    return {
      unitId: text(cooldownState.source.subject, `selected party-attack ${index} unit subject`),
      targetId: text(damageState.source.subject, `selected party-attack ${index} target subject`),
      cooldownSlot: cooldownState.slot,
      targetVitalitySlot: damageState.slot,
      delta: finite(evaluated.value, `selected party-attack ${index} evaluated damage`),
    };
  });
  const unitIds = contributors.map((contributor) => contributor.unitId).sort();
  requireCondition(new Set(unitIds).size === unitIds.length, "recorded party Attack repeated a contributing unit");
  const targetIds = new Set(contributors.map((contributor) => contributor.targetId));
  requireCondition(targetIds.size === 1, `recorded party Attack targeted ${targetIds.size} subjects`);
  const targetId = contributors[0]!.targetId;
  requireCondition(targetId === "cinder-1", `bounded comparison targeted ${targetId}, not cinder-1`);
  const targetSlots = new Set(contributors.map((contributor) => contributor.targetVitalitySlot));
  requireCondition(targetSlots.size === 1, "recorded party Attack contributions did not share one vitality slot");

  // These relational values are retained verbatim in the explanation state
  // table below. The conventional fixture receives their checked truth as a
  // normalized guard because referent equality is compiler-owned.
  const encounterState = stateFor("encounter", "encounter-state");
  const chosenTarget = stateFor("player-1", "chosen-target");
  requireCondition(encounterState.before !== undefined && chosenTarget.before !== undefined,
    "recorded party Attack omitted its relational guard state");

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
  const targetVitalityState = stateAt(contributors[0]!.targetVitalitySlot);
  const fixture: PartyAttackFixture = {
    encounterActive: true,
    chosenTargetMatches: true,
    target: {
      id: targetId,
      x: targetPosition.x,
      z: targetPosition.z,
      vitality: finite(targetVitalityState.before, `${targetId} vitality before`),
      hostile: beforeBoolean(targetId, "hostile"),
    },
    units,
  };
  const clauseOutput: PartyAttackOutput = {
    targetVitality: finite(targetVitalityState.after, `${targetId} vitality after`),
    actionCooldowns: Object.fromEntries(unitIds.map((id) => [
      id,
      finite(stateFor(id, "action-cooldown").after, `${id} action-cooldown after`),
    ])),
    contributors: unitIds,
    accumulatedDamage:
      finite(targetVitalityState.before, `${targetId} vitality before`) -
      finite(targetVitalityState.after, `${targetId} vitality after`),
  };
  const effectSlots = new Set([
    contributors[0]!.targetVitalitySlot,
    ...contributors.map((contributor) => contributor.cooldownSlot),
  ]);
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
    guardStateSlots: { encounterState: encounterState.slot, chosenTarget: chosenTarget.slot },
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
  await click("target-cinder-1");
  const readiness = await waitFor<Record<string, any>>(
    `(() => { const p=(window.__GREYWROUGHT_GAME_EVENTS__||[]).filter(e=>e.phase==='projection').at(-1);
      return p?.target==='cinder-1' && p?.selected?.length===5 && Object.values(p?.cooldowns||{}).every(v=>v<=0) ? p : {}; })()`,
    (value) => typeof value.vitality?.["cinder-1"] === "number",
    "settled party attack precondition",
  );
  const readinessVitality = finite(readiness.vitality["cinder-1"], "readiness vitality");
  const gameEventIndex = await evaluate<number>("window.__GREYWROUGHT_GAME_EVENTS__.length");
  await evaluate("window.__GREYWROUGHT_MEASUREMENTS__.length=0");
  const clauseStarted = performance.now();
  await click("command-attack");
  await waitFor<number>(
    `(window.__GREYWROUGHT_GAME_EVENTS__||[]).slice(${gameEventIndex}).filter(e=>e.phase==='projection').at(-1)?.vitality?.['cinder-1'] ?? ${readinessVitality}`,
    (value) => value < readinessVitality,
    "party Attack admitted projection",
  );
  await click("explain-attack");
  const diagnostic = await waitFor<Record<string, any>>(
    `(window.__GREYWROUGHT_GAME_EVENTS__||[]).slice(${gameEventIndex}).findLast(e=>e.phase==='diagnostic'&&e.entry==='attack') || {}`,
    (value) => typeof value.explanation?.step === "string",
    "recorded party Attack explanation",
  );
  const clauseCaptureWallMillis = performance.now() - clauseStarted;
  await Bun.write(`${outputPath}.explanation.json`, `${JSON.stringify(diagnostic.explanation, null, 2)}\n`);
  const exact = exactPartyAttack(diagnostic.explanation);

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
    "window.__GREYWROUGHT_GAME_EVENTS__.filter(e=>e.phase==='action-requested'&&e.action==='Attack')",
  );
  requireCondition(requestedAttacks.length === 1,
    `expected one ordinary Attack request on this page, received ${requestedAttacks.length}`);
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
    schema: "greywrought-party-attack-comparison-v2",
    recordedAt: new Date().toISOString(),
    conditions: {
      viewport: [1280, 900],
      dpr: 1,
      renderer: "SwiftShader",
      sourceSha256: new Bun.CryptoHasher("sha256").update(source).digest("hex"),
      clausePin: "c8a7a48fa79b2b54734a926f161bd39f3b463630",
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
      guardStateSlots: exact.guardStateSlots,
      contributionDeltas: exact.contributionDeltas,
      note: "This is one positive five-contributor case. Referent-valued encounter/target guards and the contributor domain are normalized only after the compiler trace selected the five party-attack occurrences; their exact values remain in recordedExplanation.states.",
    },
    clause: { output: exact.output, captureJourneyWallMillis: clauseCaptureWallMillis },
    conventionalReference: { output: referenceOutput, isolatedFunctionWallMillis: referenceWallMillis },
    parity: true,
    serviceBoundary: {
      clause: ["checked source package", "typed input", "relational specialization", "hidden candidate", "atomic accumulation/conflict checks", "Admission", "authority budget", "projection", "same-Step execution trace"],
      reference: ["trusted normalized fixture", "synchronous predicate/filter", "matching finite-binary64 delta ordering", "plain object result"],
    },
  };
  await Bun.write(outputPath, `${JSON.stringify(artifact, null, 2)}\n`);
  console.log(`Party Attack parity passed from recorded Step ${String(explanation.step)}: ${exact.fixture.target.vitality} -> ${exact.output.targetVitality}; ${exact.output.contributors.length} contributors; raw ${outputPath}`);
} finally {
  socket?.close();
  chrome.kill();
  server.kill();
}
