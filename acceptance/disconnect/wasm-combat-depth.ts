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

function verifyUnauthorizedBehaviorAdmission(module: object, request: unknown): void {
  const target = openCartridgeSession(module, request);

  const targetCandidateResult: Cell<CandidateCompletion | null> = { value: null };
  target.port.runCandidate(
    target.session,
    createFixedTick(16),
    emptyInputConfiguration(1),
    (result) => {
      targetCandidateResult.value = result;
    },
  );
  const targetCandidate = requireCandidate(targetCandidateResult.value);
  const targetCandidateRecord = requireForeignRecord(
    targetCandidate,
    "target behavior Candidate",
  );
  const targetCandidateId = requireField(
    targetCandidateRecord,
    "candidateId",
    "target behavior Candidate",
  );
  requireCondition(
    Array.isArray(targetCandidateId) &&
      targetCandidateId.length === 32 &&
      targetCandidateId.every(
        (byte) => Number.isInteger(byte) && byte >= 0 && byte <= 255,
      ),
    "target behavior Candidate has no exact identity",
  );
  const unauthorizedCandidateId = [...targetCandidateId];
  unauthorizedCandidateId[0] ^= 1;
  const unauthorizedCandidate = Object.freeze({
    candidateId: Object.freeze(unauthorizedCandidateId),
    base: requireField(targetCandidateRecord, "base", "target behavior Candidate"),
  });

  const rejectedResult: Cell<AdmissionCompletion | null> = { value: null };
  target.port.requestAdmission(target.session, unauthorizedCandidate, (result) => {
    rejectedResult.value = result;
  });
  requireCondition(
    rejectedResult.value?._tag === "AdmissionRejected",
    "the target Wasm session admitted an unauthorized behavior Candidate",
  );

  const acceptedResult: Cell<AdmissionCompletion | null> = { value: null };
  target.port.requestAdmission(target.session, targetCandidate, (result) => {
    acceptedResult.value = result;
  });
  const accepted = requireAdmission(acceptedResult.value);
  requireCondition(
    identityString(accepted.revision) !== identityString(target.revision),
    "authorized behavior Admission did not establish a successor after rejection",
  );

  target.port.disposeSession(target.session);
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

function physicalScalarEnvelope(
  inputPolicy: WorkbenchPolicy,
  channel: string,
  value: number,
) {
  return createWorkbenchEnvelope(
    inputPolicy,
    JSON.stringify([JSON.stringify({ kind: "scalar-input", channel, value })]),
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

function scalarInputConfiguration(
  inputPolicy: WorkbenchPolicy,
  revision: number,
  sequence: number,
  channel: string,
  value: number,
): InputConfiguration {
  return createInputConfiguration(
    revision,
    Object.freeze([
      createInputObservation(
        sequence,
        physicalScalarEnvelope(inputPolicy, channel, value),
      ),
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

function admitScalar(
  opened: OpenedSession,
  revision: Cell<unknown>,
  configurationRevision: Cell<number>,
  inputSequence: Cell<number>,
  channel: string,
  value: number,
): AdmittedTick {
  configurationRevision.value += 1;
  inputSequence.value += 1;
  const tick = admitTick(
    opened,
    revision.value,
    scalarInputConfiguration(
      policy(),
      configurationRevision.value,
      inputSequence.value,
      channel,
      value,
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

type MovementKey = "KeyW" | "KeyA" | "KeyS" | "KeyD";

function movementToward(
  playerX: number,
  playerZ: number,
  targetX: number,
  targetZ: number,
  tolerance: number,
): ReadonlySet<MovementKey> {
  const desired = new Set<MovementKey>();
  if (playerX < targetX - tolerance) desired.add("KeyD");
  if (playerX > targetX + tolerance) desired.add("KeyA");
  if (playerZ < targetZ - tolerance) desired.add("KeyS");
  if (playerZ > targetZ + tolerance) desired.add("KeyW");
  return desired;
}

function choosePerpendicularDodge(
  playerX: number,
  playerZ: number,
  enemyX: number,
  enemyZ: number,
): MovementKey {
  const chargeX = playerX - enemyX;
  const chargeZ = playerZ - enemyZ;
  if (Math.abs(chargeX) >= Math.abs(chargeZ)) {
    return playerZ >= 0 ? "KeyW" : "KeyS";
  }
  return playerX >= 0 ? "KeyA" : "KeyD";
}

function verifyResourceGatedFrontier(module: object, request: unknown): void {
  const opened = openCartridgeSession(module, request);
  const revision: Cell<unknown> = { value: opened.revision };
  const configurationRevision = { value: 0 };
  const inputSequence = { value: 0 };
  const held = new Set<MovementKey>();

  const settleReset = (): AdmittedTick => {
    let latest = admitKey(
      opened,
      revision,
      configurationRevision,
      inputSequence,
      "KeyR",
      "down",
    );
    for (let ordinal = 0; ordinal < 3; ordinal += 1) {
      latest = admitEmpty(opened, revision, configurationRevision);
    }
    return latest;
  };
  const setHeld = (desired: ReadonlySet<MovementKey>): AdmittedTick => {
    let latest: AdmittedTick | null = null;
    for (const code of [...held]) {
      if (desired.has(code)) continue;
      latest = admitKey(
        opened,
        revision,
        configurationRevision,
        inputSequence,
        code,
        "up",
      );
      held.delete(code);
    }
    for (const code of desired) {
      if (held.has(code)) continue;
      latest = admitKey(
        opened,
        revision,
        configurationRevision,
        inputSequence,
        code,
        "down",
      );
      held.add(code);
    }
    return latest ?? admitEmpty(opened, revision, configurationRevision);
  };

  let current = settleReset();
  for (let expedition = 1; expedition <= 3; expedition += 1) {
    let dodgeKey: MovementKey | null = null;
    let lastAttackSequence = -1;
    let completed = false;

    for (let ordinal = 0; ordinal < 1_600; ordinal += 1) {
      const player = projectedField(current.projection, "player-1", "projection");
      const enemy = projectedField(
        current.projection,
        "cinder-wraith",
        "projection",
      );
      const loot = projectedField(current.projection, "ashen-key", "projection");
      const cephorium = projectedField(
        current.projection,
        "cephorium-cache",
        "projection",
      );
      const objective = projectedField(
        current.projection,
        "game-objective",
        "projection",
      );
      const frontier = projectedField(
        current.projection,
        "ashen-verge",
        "projection",
      );
      const playerPosition = projectedField(player, "position", "player-1");
      const enemyPosition = projectedField(enemy, "enemy-position", "cinder-wraith");
      const lootPosition = projectedField(loot, "loot-position", "ashen-key");
      const cephoriumPosition = projectedField(
        cephorium,
        "loot-position",
        "cephorium-cache",
      );
      const exitPosition = projectedField(
        objective,
        "exit-position",
        "game-objective",
      );
      const playerX = numberField(playerPosition, "x", "position");
      const playerZ = numberField(playerPosition, "z", "position");
      const enemyX = numberField(enemyPosition, "x", "enemy-position");
      const enemyZ = numberField(enemyPosition, "z", "enemy-position");
      const lootX = numberField(lootPosition, "x", "loot-position");
      const lootZ = numberField(lootPosition, "z", "loot-position");
      const cephoriumX = numberField(
        cephoriumPosition,
        "x",
        "cephorium-cache.loot-position",
      );
      const cephoriumZ = numberField(
        cephoriumPosition,
        "z",
        "cephorium-cache.loot-position",
      );
      const exitX = numberField(exitPosition, "x", "exit-position");
      const exitZ = numberField(exitPosition, "z", "exit-position");
      const objectiveState = projectedField(
        objective,
        "objective-state",
        "game-objective",
      );
      const arena = projectedField(current.projection, "jump-arena", "projection");
      const lootPickupRadius = numberField(
        arena,
        "loot-pickup-radius",
        "jump-arena",
      );

      if (numberField(objectiveState, "x", "objective-state") === 1) {
        requireCondition(
          numberField(frontier, "foothold-progress", "ashen-verge") === expedition,
          `Wasm expedition ${expedition} did not advance foothold progress`,
        );
        requireCondition(
          stringField(frontier, "frontier-access", "ashen-verge") ===
            (expedition < 3 ? "temporary-open" : "permanent-open"),
          `Wasm expedition ${expedition} admitted the wrong frontier access`,
        );
        requireCondition(
          numberField(
            projectedField(current.projection, "jump-arena", "projection"),
            "max-x",
            "jump-arena",
          ) === 2048,
          `Wasm expedition ${expedition} did not open the physical frontier bound`,
        );
        completed = true;
        break;
      }

      const lootState = stringField(loot, "loot-state", "ashen-key");
      const custody = stringField(loot, "custody", "ashen-key");
      const cephoriumState = stringField(
        cephorium,
        "loot-state",
        "cephorium-cache",
      );
      const cephoriumCustody = stringField(
        cephorium,
        "custody",
        "cephorium-cache",
      );
      const frontierAccess = stringField(
        frontier,
        "frontier-access",
        "ashen-verge",
      );
      const enemyStatus = stringField(
        enemy,
        "enemy-combat-status",
        "cinder-wraith",
      );
      const pressure = stringField(
        enemy,
        "enemy-pressure-state",
        "cinder-wraith",
      );

      if (lootState === "available") {
        dodgeKey = null;
        if (Math.hypot(playerX - lootX, playerZ - lootZ) > lootPickupRadius * 0.75) {
          current = setHeld(movementToward(playerX, playerZ, lootX, lootZ, 0.18));
        } else {
          current = setHeld(new Set());
          current = admitKey(
            opened,
            revision,
            configurationRevision,
            inputSequence,
            "LootItem",
            "down",
          );
        }
      } else if (lootState === "acquired" && custody === "player-1") {
        dodgeKey = null;
        current = setHeld(movementToward(playerX, playerZ, exitX, exitZ, 0.18));
      } else if (frontierAccess === "temporary-open" && cephoriumState === "available") {
        dodgeKey = null;
        requireCondition(
          numberField(frontier, "foothold-progress", "ashen-verge") ===
            expedition - 1,
          `Wasm expedition ${expedition} granted progress before Cephorium extraction`,
        );
        if (
          Math.hypot(playerX - cephoriumX, playerZ - cephoriumZ) >
          lootPickupRadius * 0.75
        ) {
          current = setHeld(
            movementToward(playerX, playerZ, cephoriumX, cephoriumZ, 0.18),
          );
        } else {
          current = setHeld(new Set());
          current = admitKey(
            opened,
            revision,
            configurationRevision,
            inputSequence,
            "LootItem",
            "down",
          );
        }
      } else if (
        cephoriumState === "acquired" &&
        cephoriumCustody === "player-1"
      ) {
        dodgeKey = null;
        current = setHeld(movementToward(playerX, playerZ, exitX, exitZ, 0.18));
      } else if (enemyStatus === "alive") {
        const pressureClock = numberField(
          enemy,
          "enemy-pressure-clock",
          "cinder-wraith",
        );
        if ((pressure === "telegraph" && pressureClock <= 32) || pressure === "charging") {
          dodgeKey ??= choosePerpendicularDodge(playerX, playerZ, enemyX, enemyZ);
          current = setHeld(new Set([dodgeKey]));
        } else if (pressure === "overrun-recovery" || pressure === "hit-recovery") {
          dodgeKey = null;
          if (Math.hypot(playerX - enemyX, playerZ - enemyZ) > 1.65) {
            current = setHeld(movementToward(playerX, playerZ, enemyX, enemyZ, 1.45));
          } else {
            current = setHeld(new Set());
            const swordClock = numberField(
              player,
              "sword-commitment-clock",
              "player-1",
            );
            const swordSequence = numberField(
              player,
              "sword-action-sequence",
              "player-1",
            );
            if (swordClock === 0 && swordSequence !== lastAttackSequence) {
              lastAttackSequence = swordSequence;
              current = admitKey(
                opened,
                revision,
                configurationRevision,
                inputSequence,
                "KeyJ",
                "down",
              );
            }
          }
        } else {
          dodgeKey = null;
          current = setHeld(new Set());
        }
      } else {
        current = setHeld(new Set());
      }
    }

    requireCondition(completed, `Wasm expedition ${expedition} did not complete`);
    current = settleReset();
    const restoredFrontier = projectedField(
      current.projection,
      "ashen-verge",
      "projection",
    );
    requireCondition(
      numberField(restoredFrontier, "foothold-progress", "ashen-verge") === expedition,
      `Wasm reset erased expedition ${expedition} progress`,
    );
    requireCondition(
      stringField(restoredFrontier, "frontier-access", "ashen-verge") ===
        (expedition < 3 ? "sealed" : "permanent-open"),
      `Wasm reset admitted the wrong access after expedition ${expedition}`,
    );
    requireCondition(
      numberField(
        projectedField(current.projection, "jump-arena", "projection"),
        "max-x",
        "jump-arena",
      ) ===
        (expedition < 3
          ? numberField(restoredFrontier, "frontier-boundary-x", "ashen-verge")
          : 2048),
      `Wasm reset admitted the wrong movement boundary after expedition ${expedition}`,
    );
  }

  opened.port.disposeSession(opened.session);
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

  for (let ordinal = 0; ordinal < 320; ordinal += 1) {
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
  requireCondition(
    sawSpawnReset,
    "boar did not rearm at its spawn after hit recovery",
  );
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

function verifyCameraRelativeHorizontalPropulsion(module: object, request: unknown): void {
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
    "A did not produce default-camera left intent",
  );
  requireCondition(
    vectorField(diagonalPlayer, "horizontal-intent", "z") === -1,
    "W did not produce default-camera forward intent",
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

  admitKey(opened, revision, configurationRevision, inputSequence, "KeyD", "up");
  admitKey(
    opened,
    revision,
    configurationRevision,
    inputSequence,
    "ShiftLeft",
    "up",
  );
  admitScalar(
    opened,
    revision,
    configurationRevision,
    inputSequence,
    "CameraForwardX",
    1,
  );
  admitScalar(
    opened,
    revision,
    configurationRevision,
    inputSequence,
    "CameraForwardZ",
    0,
  );
  const rotated = admitKey(
    opened,
    revision,
    configurationRevision,
    inputSequence,
    "KeyW",
    "down",
  );
  const rotatedPlayer = projectedField(rotated.projection, "player-1", "projection");
  requireCondition(
    vectorField(rotatedPlayer, "horizontal-intent", "x") === 1,
    "quarter-turned camera did not rotate W onto world x",
  );
  requireCondition(
    vectorField(rotatedPlayer, "horizontal-intent", "z") === 0,
    "quarter-turned camera retained world-fixed W movement",
  );
  const rotatedPosition = projectedField(rotatedPlayer, "position", "player-1");
  const advanced = admitEmpty(opened, revision, configurationRevision);
  const advancedPlayer = projectedField(advanced.projection, "player-1", "projection");
  const advancedPosition = projectedField(advancedPlayer, "position", "player-1");
  requireCondition(
    numberField(advancedPosition, "x", "position") >
      numberField(rotatedPosition, "x", "position"),
    "camera-relative W did not advance along the rotated forward axis",
  );
  requireCondition(
    Math.abs(
      numberField(advancedPosition, "z", "position") -
        numberField(rotatedPosition, "z", "position"),
    ) < 1.0e-9,
    "camera-relative W leaked motion along the retired world-forward axis",
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
    vectorField(horizontalPlayer, "position", "z") < -1.4,
    "Q produced no immediate forward horizontal displacement",
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

function verifyProjectileOpeningConversion(module: object, request: unknown): void {
  const opened = openCartridgeSession(module, request);
  const revision: Cell<unknown> = { value: opened.revision };
  const configurationRevision = { value: 0 };
  const inputSequence = { value: 0 };

  const targeted = admitKey(
    opened,
    revision,
    configurationRevision,
    inputSequence,
    "Tab",
    "down",
  );
  const targetedPlayer = projectedField(targeted.projection, "player-1", "projection");
  requireCondition(
    booleanField(targetedPlayer, "target-lock-active", "player-1"),
    "Tab did not acquire the projectile target",
  );

  let current = admitKey(
    opened,
    revision,
    configurationRevision,
    inputSequence,
    "Digit1",
    "down",
  );
  let sawProjectile = false;
  let sawOpening = false;
  for (let ordinal = 0; ordinal < 160; ordinal += 1) {
    const bolt = projectedField(current.projection, "wayfarer-bolt", "projection");
    const enemy = projectedField(current.projection, "cinder-wraith", "projection");
    sawProjectile ||= booleanField(bolt, "projectile-visible", "wayfarer-bolt");
    if (
      stringField(enemy, "enemy-pressure-state", "cinder-wraith") ===
      "projectile-opening"
    ) {
      sawOpening = true;
      break;
    }
    current = admitEmpty(opened, revision, configurationRevision);
  }
  requireCondition(sawProjectile, "Digit1 launched no visible Wasm projectile");
  requireCondition(sawOpening, "the Wasm projectile produced no opening");

  const beforePlayer = projectedField(current.projection, "player-1", "projection");
  const beforeX = vectorField(beforePlayer, "position", "x");
  configurationRevision.value += 1;
  inputSequence.value += 1;
  const directionSequence = inputSequence.value;
  inputSequence.value += 1;
  const burst = admitTick(
    opened,
    revision.value,
    createInputConfiguration(
      configurationRevision.value,
      Object.freeze([
        createInputObservation(
          directionSequence,
          physicalKeyEnvelope(policy(), "KeyD", "down"),
        ),
        createInputObservation(
          inputSequence.value,
          physicalKeyEnvelope(policy(), "KeyQ", "down"),
        ),
      ]),
    ),
  );
  revision.value = burst.revision;
  const burstPlayer = projectedField(burst.projection, "player-1", "projection");
  requireCondition(
    vectorField(burstPlayer, "position", "x") - beforeX > 5,
    "current D input did not atomically direct the Wasm Q burst",
  );
  requireCondition(
    numberField(burstPlayer, "booster-energy", "player-1") === 80,
    "the Wasm Q burst did not spend exactly 20 energy",
  );

  admitKey(
    opened,
    revision,
    configurationRevision,
    inputSequence,
    "KeyD",
    "up",
  );
  current = admitKey(
    opened,
    revision,
    configurationRevision,
    inputSequence,
    "KeyJ",
    "down",
  );
  let enemyVitality = 6;
  for (let ordinal = 0; ordinal < 24; ordinal += 1) {
    const enemy = projectedField(current.projection, "cinder-wraith", "projection");
    const vitals = projectedField(enemy, "enemy-vitals", "cinder-wraith");
    enemyVitality = numberField(vitals, "x", "enemy-vitals");
    if (enemyVitality < 6) break;
    current = admitEmpty(opened, revision, configurationRevision);
  }
  requireCondition(
    enemyVitality === 4,
    `the committed Wasm sword action produced vitality ${enemyVitality} instead of 4`,
  );
  opened.port.disposeSession(opened.session);
}

function verifySustainedWasmLiveness(
  module: object,
  request: unknown,
  tickCount: number,
): void {
  const opened = openCartridgeSession(module, request);
  let revision = opened.revision;
  const configurationRevision = { value: 0 };
  const inputSequence = { value: 0 };
  const directions: readonly MovementKey[] = ["KeyW", "KeyD", "KeyS", "KeyA"];
  let directionIndex = 0;

  const admit = (configuration: InputConfiguration): void => {
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
    const admissionResult: Cell<AdmissionCompletion | null> = { value: null };
    opened.port.requestAdmission(opened.session, candidate, (result) => {
      admissionResult.value = result;
    });
    revision = requireAdmission(admissionResult.value).revision;
  };

  const key = (code: string, phase: "down" | "up"): void => {
    configurationRevision.value += 1;
    inputSequence.value += 1;
    admit(
      keyInputConfiguration(
        policy(),
        configurationRevision.value,
        inputSequence.value,
        code,
        phase,
      ),
    );
  };

  const scalar = (channel: string, value: number): void => {
    configurationRevision.value += 1;
    inputSequence.value += 1;
    admit(
      scalarInputConfiguration(
        policy(),
        configurationRevision.value,
        inputSequence.value,
        channel,
        value,
      ),
    );
  };

  const empty = (): void => {
    configurationRevision.value += 1;
    admit(emptyInputConfiguration(configurationRevision.value));
  };

  key(directions[directionIndex]!, "down");

  const press = (code: string): void => {
    key(code, "down");
  };

  for (let tick = 1; tick <= tickCount; tick += 1) {
    try {
      if (tick % 1_250 === 0) press("KeyR");
      if (tick % 313 === 0) {
        key(directions[directionIndex]!, "up");
        directionIndex = (directionIndex + 1) % directions.length;
        key(directions[directionIndex]!, "down");
      }
      if (tick % 188 === 0) press("KeyJ");
      if (tick % 250 === 0) {
        press("KeyQ");
        press("KeyF");
      }
      if (tick % 375 === 0) press("Space");
      if (tick % 438 === 0) press("Tab");
      if (tick % 625 === 0) {
        const quarter = (Math.floor(tick / 625) % 4) * (Math.PI / 2);
        scalar("CameraForwardX", Math.sin(quarter));
        scalar("CameraForwardZ", -Math.cos(quarter));
      }
      empty();
    } catch (cause) {
      throw new Error(
        `sustained Wasm liveness failed at tick ${tick}, configuration ${configurationRevision.value}, input ${inputSequence.value}, revision ${identityString(revision)}`,
        { cause },
      );
    }
  }

  opened.port.disposeSession(opened.session);
  console.log(JSON.stringify({ sustainedWasmTicks: tickCount }));
}

async function main(): Promise<void> {
  const [wasmBytes, source] = await Promise.all([
    Bun.file("./build/host/wasm/clause_runtime_bg.wasm").arrayBuffer(),
    Bun.file("./build/embodied/embodied-encounter-v1.cwr1.hex").text(),
  ]);
  const module = initializeSessionModule(wasmBytes);
  const request = createExactProcessRequest(decodeCwr1Hex(source));
  const sustainedTicks = Number.parseInt(
    Bun.env.GREYWROUGHT_WASM_SOAK_TICKS ?? "0",
    10,
  );
  if (sustainedTicks > 0) {
    verifySustainedWasmLiveness(module, request, sustainedTicks);
    return;
  }
  verifyBoarChargeAndBurstCustody(module, request);
  verifyCameraRelativeHorizontalPropulsion(module, request);
  verifyOrthogonalPropulsionAndEnergy(module, request);
  verifyProjectileOpeningConversion(module, request);
  verifyUnauthorizedBehaviorAdmission(module, request);
  verifyResourceGatedFrontier(module, request);
}

await main();
