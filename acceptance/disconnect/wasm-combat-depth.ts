import {
  "->ExactProcessRequest" as createExactProcessRequest,
  "create-wasm-cartridge-port" as createWasmCartridgePort,
  "cse1-projected-term-json-max-source-units" as projectedTermJsonLimit,
  "cse1-projected-term-max-properties" as projectedTermPropertyLimit,
  "decode-cwr1-hex" as decodeCwr1Hex,
  "decode-projected-term-frame" as decodeProjectedTermFrame,
  type ProjectedObject,
  type ProjectedValue,
} from "../../build/host/jump-arena-shell/wasm-cartridge-port.js";
import {
  "->FixedTick" as createFixedTick,
  "->InputConfiguration" as createInputConfiguration,
  "->InputObservation" as createInputObservation,
  "->WorkbenchPolicy" as createWorkbenchPolicy,
  "->WorkbenchSequenceLimits" as createWorkbenchSequenceLimits,
  "create-workbench-envelope" as createWorkbenchEnvelope,
  type AdmissionCompletion,
  type CandidateCompletion,
  type CartridgePort,
  type InputConfiguration,
  type PackageCheck,
  type SessionCompletion,
  type WorkbenchPolicy,
} from "../../build/host/jump-arena-shell/workbench.js";
import {
  clause_session_v1_command_bulk as commandSession,
  clause_session_v1_event_bulk as readSessionEvent,
  clause_session_v1_open_bulk as openSession,
  clause_session_v1_reclaim_retired as reclaimRetiredSession,
  initSync,
} from "#clause-runtime-wasm";
import {
  identityString,
  requireField,
  requireForeignRecord,
} from "../../src/host/foreign.js";

interface Cell<T> {
  value: T;
}

interface OpenedSession {
  readonly port: CartridgePort;
  readonly session: unknown;
  readonly revision: unknown;
}

interface AdmittedTick {
  readonly revision: unknown;
  readonly projection: ProjectedValue;
}

function requireCondition(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function isProjectedArray(
  value: ProjectedValue,
): value is readonly ProjectedValue[] {
  return Array.isArray(value);
}

function policy(): WorkbenchPolicy {
  const maximum = Number.MAX_SAFE_INTEGER;
  return createWorkbenchPolicy(
    8,
    8,
    32,
    projectedTermPropertyLimit,
    projectedTermJsonLimit,
    createWorkbenchSequenceLimits(
      maximum,
      maximum,
      maximum,
      maximum,
      maximum,
    ),
  );
}

function initializeSessionModule(bytes: ArrayBuffer): object {
  initSync({ module: bytes });
  return Object.freeze({
    clause_session_v1_open_bulk: (request: readonly number[]) =>
      openSession(new Uint8Array(request)),
    clause_session_v1_command_bulk: (request: readonly number[]) =>
      commandSession(new Uint8Array(request)),
    clause_session_v1_event_bulk: readSessionEvent,
    clause_session_v1_reclaim_retired: reclaimRetiredSession,
  });
}

function requirePackage(result: PackageCheck | null): unknown {
  if (result === null) throw new Error("real Wasm returned no PackageCheck");
  if (result._tag === "PackageRejected") {
    throw new Error(`real Wasm rejected the embodied cartridge: ${result.reason}`);
  }
  return result.acceptedPackage;
}

function requireSession(result: SessionCompletion | null): Extract<
  SessionCompletion,
  { readonly _tag: "SessionStarted" }
> {
  if (result === null) throw new Error("real Wasm returned no SessionCompletion");
  if (result._tag === "SessionFailed") {
    throw new Error(`real Wasm did not open the embodied session: ${result.reason}`);
  }
  return result;
}

function openCartridgeSession(module: object, request: unknown): OpenedSession {
  const port = createWasmCartridgePort(module, policy());
  const packageResult: Cell<PackageCheck | null> = { value: null };
  port.acceptPackage(request, (result) => {
    packageResult.value = result;
  });
  const sessionResult: Cell<SessionCompletion | null> = { value: null };
  port.startSession(requirePackage(packageResult.value), 1, (result) => {
    sessionResult.value = result;
  });
  const started = requireSession(sessionResult.value);
  return { port, session: started.session, revision: started.revision };
}

function physicalKeyEnvelope(
  inputPolicy: WorkbenchPolicy,
  code: string,
  phase: "down" | "up",
) {
  return createWorkbenchEnvelope(
    inputPolicy,
    JSON.stringify([JSON.stringify({ kind: "keyboard", code, phase, repeat: false })]),
  );
}

function emptyInputConfiguration(revision: number): InputConfiguration {
  return createInputConfiguration(revision, Object.freeze([]));
}

function keyInputConfiguration(
  inputPolicy: WorkbenchPolicy,
  revision: number,
  sequence: number,
  code: string,
  phase: "down" | "up",
): InputConfiguration {
  return createInputConfiguration(
    revision,
    Object.freeze([
      createInputObservation(sequence, physicalKeyEnvelope(inputPolicy, code, phase)),
    ]),
  );
}

function requireCandidate(result: CandidateCompletion | null): unknown {
  if (result === null) throw new Error("real Wasm returned no CandidateCompletion");
  if (result._tag === "CandidateFailed") {
    throw new Error(`real Wasm Candidate failed: ${result.reason}`);
  }
  return result.candidate;
}

function requireAdmission(result: AdmissionCompletion | null): Extract<
  AdmissionCompletion,
  { readonly _tag: "AdmissionAccepted" }
> {
  if (result === null) throw new Error("real Wasm returned no AdmissionCompletion");
  if (result._tag === "AdmissionRejected") {
    throw new Error(`real Wasm Admission failed: ${result.reason}`);
  }
  return result;
}

function admitTick(
  opened: OpenedSession,
  predecessor: unknown,
  configuration: InputConfiguration,
): AdmittedTick {
  const candidateResult: Cell<CandidateCompletion | null> = { value: null };
  opened.port.runCandidate(
    opened.session,
    createFixedTick(16),
    configuration,
    (result) => {
      candidateResult.value = result;
    },
  );
  const candidate = requireCandidate(candidateResult.value);
  const candidateRecord = requireForeignRecord(candidate, "Wasm candidate");
  requireCondition(
    identityString(requireField(candidateRecord, "base", "Wasm candidate")) ===
      identityString(predecessor),
    "Candidate production advanced the admitted world",
  );
  const admissionResult: Cell<AdmissionCompletion | null> = { value: null };
  opened.port.requestAdmission(opened.session, candidate, (result) => {
    admissionResult.value = result;
  });
  const accepted = requireAdmission(admissionResult.value);
  requireCondition(
    identityString(accepted.revision) !== identityString(predecessor),
    "Admission installed no visible successor",
  );
  return {
    revision: accepted.revision,
    projection: decodeProjectedTermFrame(accepted.frame),
  };
}

function admitKey(
  opened: OpenedSession,
  revision: Cell<unknown>,
  configurationRevision: Cell<number>,
  inputSequence: Cell<number>,
  code: string,
  phase: "down" | "up",
): AdmittedTick {
  configurationRevision.value += 1;
  inputSequence.value += 1;
  const tick = admitTick(
    opened,
    revision.value,
    keyInputConfiguration(
      policy(),
      configurationRevision.value,
      inputSequence.value,
      code,
      phase,
    ),
  );
  revision.value = tick.revision;
  return tick;
}

function admitEmpty(
  opened: OpenedSession,
  revision: Cell<unknown>,
  configurationRevision: Cell<number>,
): AdmittedTick {
  configurationRevision.value += 1;
  const tick = admitTick(
    opened,
    revision.value,
    emptyInputConfiguration(configurationRevision.value),
  );
  revision.value = tick.revision;
  return tick;
}

function projectedObject(value: ProjectedValue, context: string): ProjectedObject {
  if (typeof value !== "object" || value === null || isProjectedArray(value)) {
    throw new Error(`${context} is not a projected object`);
  }
  return value;
}

function projectedField(
  value: ProjectedValue,
  field: string,
  context: string,
): ProjectedValue {
  const result = projectedObject(value, context)[field];
  if (result === undefined) throw new Error(`${context}.${field} is absent`);
  return result;
}

function numberField(value: ProjectedValue, field: string, context: string): number {
  const result = projectedField(value, field, context);
  if (typeof result !== "number") throw new Error(`${context}.${field} is not numeric`);
  return result;
}

function stringField(value: ProjectedValue, field: string, context: string): string {
  const result = projectedField(value, field, context);
  if (typeof result !== "string") throw new Error(`${context}.${field} is not text`);
  return result;
}

function booleanField(value: ProjectedValue, field: string, context: string): boolean {
  const result = projectedField(value, field, context);
  if (typeof result !== "boolean") throw new Error(`${context}.${field} is not boolean`);
  return result;
}

function vectorField(
  value: ProjectedValue,
  field: string,
  component: "x" | "y" | "z",
): number {
  return numberField(projectedField(value, field, "subject"), component, field);
}

function verifyBoarChargeAndBurstCustody(module: object, request: unknown): void {
  const opened = openCartridgeSession(module, request);
  const revision: Cell<unknown> = { value: opened.revision };
  const configurationRevision = { value: 0 };
  const inputSequence = { value: 0 };
  let priorVitality = 4;
  let sawTelegraph = false;
  let sawCharging = false;
  let sawFirstHit = false;
  let sawSpawnReset = false;
  let postHitCharge: AdmittedTick | null = null;

  for (let ordinal = 0; ordinal < 120; ordinal += 1) {
    const tick = admitEmpty(opened, revision, configurationRevision);
    const player = projectedField(tick.projection, "player-1", "projection");
    const enemy = projectedField(tick.projection, "cinder-wraith", "projection");
    const vitals = projectedField(player, "player-vitals", "player-1");
    const vitality = numberField(vitals, "x", "player-vitals");
    const pressure = stringField(enemy, "enemy-pressure-state", "cinder-wraith");
    if (pressure === "telegraph") sawTelegraph = true;
    if (!sawFirstHit && pressure === "charging") sawCharging = true;
    if (!sawFirstHit && vitality === 2) {
      requireCondition(priorVitality === 4, "first boar contact was not vitality 4→2");
      requireCondition(
        pressure === "hit-recovery",
        "first boar contact did not enter hit recovery",
      );
      sawFirstHit = true;
    }
    requireCondition(
      vitality >= 2,
      `boar charge applied unexpected additional damage at tick ${ordinal}`,
    );
    if (sawFirstHit && pressure === "telegraph") {
      const enemyPosition = projectedField(enemy, "enemy-position", "cinder-wraith");
      requireCondition(
        numberField(enemyPosition, "x", "enemy-position") === 4.5 &&
          numberField(enemyPosition, "z", "enemy-position") === 0,
        "hit recovery did not restore the boar spawn",
      );
      sawSpawnReset = true;
    }
    if (sawSpawnReset && pressure === "charging") {
      postHitCharge = tick;
      break;
    }
    priorVitality = vitality;
  }
  requireCondition(sawTelegraph, "boar exposed no telegraph phase");
  requireCondition(sawCharging, "boar never committed its first charge");
  requireCondition(sawFirstHit, "first boar charge produced no admitted contact");
  requireCondition(sawSpawnReset, "boar did not rearm at its spawn after hit recovery");
  requireCondition(
    postHitCharge !== null,
    "boar did not commit a second charge after hit recovery",
  );

  const beforeBurstPlayer = projectedField(
    postHitCharge.projection,
    "player-1",
    "projection",
  );
  const beforeBurstPosition = projectedField(beforeBurstPlayer, "position", "player-1");
  const beforeBurstZ = numberField(beforeBurstPosition, "z", "position");
  admitKey(opened, revision, configurationRevision, inputSequence, "KeyW", "down");
  const burst = admitKey(
    opened,
    revision,
    configurationRevision,
    inputSequence,
    "KeyQ",
    "down",
  );
  const burstPlayer = projectedField(burst.projection, "player-1", "projection");
  requireCondition(
    numberField(burstPlayer, "booster-energy", "player-1") === 80,
    "Q dodge burst did not spend energy 100→80",
  );
  let afterBurst = admitKey(
    opened,
    revision,
    configurationRevision,
    inputSequence,
    "KeyW",
    "up",
  );
  let afterBurstPlayer = projectedField(afterBurst.projection, "player-1", "projection");
  let afterBurstPosition = projectedField(afterBurstPlayer, "position", "player-1");
  requireCondition(
    Math.abs(numberField(afterBurstPosition, "z", "position") - beforeBurstZ) > 0.05,
    "Q dodge burst produced no admitted displacement",
  );

  let sawOverrunRecovery = false;
  for (let ordinal = 0; ordinal < 24; ordinal += 1) {
    afterBurst = admitEmpty(opened, revision, configurationRevision);
    afterBurstPlayer = projectedField(afterBurst.projection, "player-1", "projection");
    afterBurstPosition = projectedField(afterBurstPlayer, "position", "player-1");
    const enemy = projectedField(afterBurst.projection, "cinder-wraith", "projection");
    const vitals = projectedField(afterBurstPlayer, "player-vitals", "player-1");
    requireCondition(
      numberField(vitals, "x", "player-vitals") === 2,
      "dodged second charge changed player vitality",
    );
    if (
      stringField(enemy, "enemy-pressure-state", "cinder-wraith") ===
      "overrun-recovery"
    ) {
      sawOverrunRecovery = true;
      break;
    }
  }
  requireCondition(sawOverrunRecovery, "dodged charge entered no overrun recovery");
  opened.port.disposeSession(opened.session);
}

function verifyWorldFixedHorizontalPropulsion(module: object, request: unknown): void {
  const opened = openCartridgeSession(module, request);
  const revision: Cell<unknown> = { value: opened.revision };
  const configurationRevision = { value: 0 };
  const inputSequence = { value: 0 };
  admitKey(opened, revision, configurationRevision, inputSequence, "KeyW", "down");
  const diagonal = admitKey(
    opened,
    revision,
    configurationRevision,
    inputSequence,
    "KeyA",
    "down",
  );
  const diagonalPlayer = projectedField(diagonal.projection, "player-1", "projection");
  const diagonalPosition = projectedField(diagonalPlayer, "position", "player-1");
  const sustained = admitKey(
    opened,
    revision,
    configurationRevision,
    inputSequence,
    "ShiftLeft",
    "down",
  );
  const sustainedPlayer = projectedField(sustained.projection, "player-1", "projection");
  const sustainedPosition = projectedField(sustainedPlayer, "position", "player-1");
  requireCondition(
    vectorField(diagonalPlayer, "horizontal-intent", "x") === -1,
    "A did not produce world-fixed left intent",
  );
  requireCondition(
    vectorField(diagonalPlayer, "horizontal-intent", "z") === -1,
    "W did not produce world-fixed forward intent",
  );
  requireCondition(
    numberField(sustainedPlayer, "move-speed", "player-1") === 7,
    "held Shift did not select sustained horizontal speed",
  );
  requireCondition(
    numberField(sustainedPlayer, "booster-energy", "player-1") < 100,
    "horizontal sustain spent no shared booster energy",
  );
  requireCondition(
    numberField(sustainedPosition, "x", "position") <
      numberField(diagonalPosition, "x", "position"),
    "sustained diagonal movement did not continue left",
  );
  requireCondition(
    numberField(sustainedPosition, "z", "position") <
      numberField(diagonalPosition, "z", "position"),
    "sustained diagonal movement did not continue forward",
  );
  admitKey(opened, revision, configurationRevision, inputSequence, "KeyW", "up");
  admitKey(opened, revision, configurationRevision, inputSequence, "KeyA", "up");
  const right = admitKey(
    opened,
    revision,
    configurationRevision,
    inputSequence,
    "KeyD",
    "down",
  );
  const rightPlayer = projectedField(right.projection, "player-1", "projection");
  requireCondition(
    vectorField(rightPlayer, "horizontal-intent", "x") === 1,
    "D did not produce world-fixed right intent",
  );
  requireCondition(
    vectorField(rightPlayer, "horizontal-intent", "z") === 0,
    "direction change retained stale forward intent",
  );
  opened.port.disposeSession(opened.session);
}

function verifyOrthogonalPropulsionAndEnergy(module: object, request: unknown): void {
  const noIntent = openCartridgeSession(module, request);
  const noIntentRevision: Cell<unknown> = { value: noIntent.revision };
  const noIntentConfiguration = { value: 0 };
  const noIntentSequence = { value: 0 };
  const noIntentRefused = admitKey(
    noIntent,
    noIntentRevision,
    noIntentConfiguration,
    noIntentSequence,
    "KeyQ",
    "down",
  );
  const noIntentPlayer = projectedField(
    noIntentRefused.projection,
    "player-1",
    "projection",
  );
  requireCondition(
    vectorField(noIntentPlayer, "velocity", "x") === 0 &&
      vectorField(noIntentPlayer, "velocity", "z") === 0,
    "horizontal burst without intent changed velocity",
  );
  requireCondition(
    numberField(noIntentPlayer, "booster-energy", "player-1") === 100,
    "horizontal burst without intent spent energy",
  );
  noIntent.port.disposeSession(noIntent.session);

  const sustain = openCartridgeSession(module, request);
  const sustainRevision: Cell<unknown> = { value: sustain.revision };
  const sustainConfiguration = { value: 0 };
  const sustainSequence = { value: 0 };
  const thrust = admitKey(
    sustain,
    sustainRevision,
    sustainConfiguration,
    sustainSequence,
    "KeyE",
    "down",
  );
  const thrustPlayer = projectedField(thrust.projection, "player-1", "projection");
  const thrustY = vectorField(thrustPlayer, "velocity", "y");
  const coast = admitKey(
    sustain,
    sustainRevision,
    sustainConfiguration,
    sustainSequence,
    "KeyE",
    "up",
  );
  const coastPlayer = projectedField(coast.projection, "player-1", "projection");
  requireCondition(
    !booleanField(thrustPlayer, "grounded", "player-1"),
    "vertical sustain did not leave the ground",
  );
  requireCondition(thrustY > 0, "vertical sustain produced no upward velocity");
  requireCondition(
    numberField(thrustPlayer, "booster-energy", "player-1") < 100,
    "vertical sustain spent no shared booster energy",
  );
  requireCondition(
    vectorField(coastPlayer, "velocity", "y") < thrustY,
    "vertical sustain release did not coast under gravity",
  );
  sustain.port.disposeSession(sustain.session);

  const opened = openCartridgeSession(module, request);
  const revision: Cell<unknown> = { value: opened.revision };
  const configurationRevision = { value: 0 };
  const inputSequence = { value: 0 };
  const jump = admitKey(
    opened,
    revision,
    configurationRevision,
    inputSequence,
    "Space",
    "down",
  );
  const jumpPlayer = projectedField(jump.projection, "player-1", "projection");
  const jumpY = vectorField(jumpPlayer, "velocity", "y");
  const repeatedJump = admitKey(
    opened,
    revision,
    configurationRevision,
    inputSequence,
    "Space",
    "down",
  );
  const repeatedPlayer = projectedField(
    repeatedJump.projection,
    "player-1",
    "projection",
  );
  requireCondition(
    !booleanField(jumpPlayer, "grounded", "player-1"),
    "Space did not perform the grounded jump",
  );
  requireCondition(
    vectorField(repeatedPlayer, "velocity", "y") < jumpY,
    "airborne Space restarted the grounded jump",
  );
  admitKey(opened, revision, configurationRevision, inputSequence, "KeyW", "down");
  const horizontal = admitKey(
    opened,
    revision,
    configurationRevision,
    inputSequence,
    "KeyQ",
    "down",
  );
  const horizontalPlayer = projectedField(
    horizontal.projection,
    "player-1",
    "projection",
  );
  requireCondition(
    vectorField(horizontalPlayer, "velocity", "z") < -20,
    "Q produced no immediate forward horizontal burst",
  );
  requireCondition(
    numberField(horizontalPlayer, "booster-energy", "player-1") === 80,
    "horizontal burst did not spend its source-owned cost",
  );
  const released = admitKey(
    opened,
    revision,
    configurationRevision,
    inputSequence,
    "KeyW",
    "up",
  );
  const releasedPlayer = projectedField(released.projection, "player-1", "projection");
  const horizontalX = vectorField(releasedPlayer, "velocity", "x");
  const horizontalZ = vectorField(releasedPlayer, "velocity", "z");
  const firstBurst = admitKey(
    opened,
    revision,
    configurationRevision,
    inputSequence,
    "KeyF",
    "down",
  );
  const firstPlayer = projectedField(firstBurst.projection, "player-1", "projection");
  requireCondition(
    vectorField(firstPlayer, "velocity", "x") === horizontalX &&
      vectorField(firstPlayer, "velocity", "z") === horizontalZ,
    "vertical burst changed horizontal velocity",
  );
  requireCondition(
    vectorField(firstPlayer, "velocity", "y") >
      vectorField(releasedPlayer, "velocity", "y"),
    "F produced no immediate vertical burst",
  );
  requireCondition(
    numberField(firstPlayer, "booster-energy", "player-1") === 55,
    "vertical burst did not share booster energy",
  );
  admitKey(opened, revision, configurationRevision, inputSequence, "KeyF", "down");
  const exhausted = admitKey(
    opened,
    revision,
    configurationRevision,
    inputSequence,
    "KeyF",
    "down",
  );
  const exhaustedPlayer = projectedField(exhausted.projection, "player-1", "projection");
  const exhaustedY = vectorField(exhaustedPlayer, "velocity", "y");
  let recovered = admitKey(
    opened,
    revision,
    configurationRevision,
    inputSequence,
    "KeyF",
    "down",
  );
  const refusedPlayer = projectedField(recovered.projection, "player-1", "projection");
  requireCondition(
    numberField(exhaustedPlayer, "booster-energy", "player-1") === 5,
    "repeated bursts did not approach propulsion exhaustion",
  );
  requireCondition(
    numberField(refusedPlayer, "booster-energy", "player-1") === 5,
    "burst below ignition threshold spent energy",
  );
  requireCondition(
    vectorField(refusedPlayer, "velocity", "y") < exhaustedY,
    "burst below ignition threshold changed vertical velocity",
  );
  requireCondition(
    numberField(refusedPlayer, "booster-regeneration-delay", "player-1") > 0,
    "energy expenditure installed no regeneration delay",
  );
  for (let ordinal = 0; ordinal < 48; ordinal += 1) {
    const currentPlayer = projectedField(recovered.projection, "player-1", "projection");
    if (numberField(currentPlayer, "booster-energy", "player-1") >= 25) break;
    recovered = admitEmpty(opened, revision, configurationRevision);
  }
  const recoveredPlayer = projectedField(recovered.projection, "player-1", "projection");
  const recoveredEnergy = numberField(recoveredPlayer, "booster-energy", "player-1");
  const recoveredX = vectorField(recoveredPlayer, "velocity", "x");
  const recoveredZ = vectorField(recoveredPlayer, "velocity", "z");
  requireCondition(
    recoveredEnergy === 25,
    "booster did not regenerate to its ignition threshold",
  );
  requireCondition(
    numberField(recoveredPlayer, "booster-regeneration-delay", "player-1") === 0,
    "booster regenerated before its source-owned delay elapsed",
  );
  const reignited = admitKey(
    opened,
    revision,
    configurationRevision,
    inputSequence,
    "KeyF",
    "down",
  );
  const reignitedPlayer = projectedField(reignited.projection, "player-1", "projection");
  requireCondition(
    numberField(reignitedPlayer, "booster-energy", "player-1") < recoveredEnergy,
    "energy at the ignition threshold could not propel",
  );
  requireCondition(
    vectorField(reignitedPlayer, "velocity", "x") === recoveredX &&
      vectorField(reignitedPlayer, "velocity", "z") === recoveredZ,
    "reignition changed horizontal velocity",
  );
  admitKey(opened, revision, configurationRevision, inputSequence, "KeyR", "down");
  let restored = admitEmpty(opened, revision, configurationRevision);
  for (let ordinal = 0; ordinal < 2; ordinal += 1) {
    restored = admitEmpty(opened, revision, configurationRevision);
  }
  const restoredPlayer = projectedField(restored.projection, "player-1", "projection");
  const position = projectedField(restoredPlayer, "position", "player-1");
  requireCondition(
    numberField(position, "x", "position") === -2 &&
      numberField(position, "z", "position") === 0.5,
    "reset did not restore spawn position",
  );
  requireCondition(
    numberField(restoredPlayer, "booster-energy", "player-1") === 100,
    "reset did not restore booster capacity",
  );
  requireCondition(
    numberField(restoredPlayer, "booster-regeneration-delay", "player-1") === 0,
    "reset retained propulsion regeneration delay",
  );
  requireCondition(
    booleanField(restoredPlayer, "grounded", "player-1"),
    "reset did not restore grounded state",
  );
  opened.port.disposeSession(opened.session);
}

async function main(): Promise<void> {
  const [wasmBytes, source] = await Promise.all([
    Bun.file("./build/host/wasm/clause_runtime_bg.wasm").arrayBuffer(),
    Bun.file("./build/embodied/embodied-encounter-v1.cwr1.hex").text(),
  ]);
  const module = initializeSessionModule(wasmBytes);
  const request = createExactProcessRequest(decodeCwr1Hex(source));
  verifyBoarChargeAndBurstCustody(module, request);
  verifyWorldFixedHorizontalPropulsion(module, request);
  verifyOrthogonalPropulsionAndEnergy(module, request);
  console.log(
    "real Wasm combat depth: boar charge, burst dodge, world-fixed orthogonal propulsion, energy recovery, reset, and custody admitted",
  );
}

await main();
