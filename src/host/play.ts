import {
  "adjudicate-branch-reconnect!" as adjudicateBranchReconnect,
  "admit-authoritative-occurrences!" as admitAuthoritativeOccurrences,
  "dispose-process-branch!" as disposeProcessBranch,
  "explain-process-branch!" as explainProcessBranch,
  "open-process-branch!" as openProcessBranch,
  "propose-branch-reconnect!" as proposeBranchReconnect,
} from "../../build/host/jump-arena-shell/branch-wasm-port.js";
import {
  "->ExactProcessRequest" as createExactProcessRequest,
  "advance-session-occurrence!" as advanceSessionOccurrence,
  "begin-effect-attempt!" as beginEffectAttempt,
  "create-wasm-cartridge-port" as createWasmCartridgePort,
  "cse1-projected-term-json-max-source-units" as projectedTermJsonLimit,
  "cse1-projected-term-max-properties" as projectedTermPropertyLimit,
  "decode-cwr1-hex" as decodeCwr1Hex,
  "decode-projected-term-frame" as decodeProjectedTermFrame,
  "emit-effect-intent!" as emitEffectIntent,
  "issue-effect-authorization!" as issueEffectAuthorization,
  "process-request-occurrences!" as processRequestOccurrences,
  "resume-session!" as resumeSession,
  "settle-effect-attempt!" as settleEffectAttempt,
  "suspend-session!" as suspendSession,
  type ExactBytes,
  type ExactProcessRequest,
  type ProjectedObject,
  type ProjectedValue,
} from "../../build/host/jump-arena-shell/wasm-cartridge-port.js";
import {
  "->FixedTick" as createFixedTick,
  "->WorkbenchPolicy" as createWorkbenchPolicy,
  "->WorkbenchSequenceLimits" as createWorkbenchSequenceLimits,
  "create-cartridge-workbench!" as createCartridgeWorkbench,
  "create-workbench-envelope" as createWorkbenchEnvelope,
  type CartridgePort,
  type CartridgeWorkbench,
  type LifecycleReceipt,
  type PackageCheck,
  type SessionCompletion,
  type WorkbenchPolicy,
} from "../../build/host/jump-arena-shell/workbench.js";
import {
  clause_branch_v1_command as branchCommand,
  clause_branch_v1_event_byte as branchEventByte,
  clause_branch_v1_event_len as branchEventLength,
  clause_branch_v1_io_reset as resetBranchIo,
  clause_branch_v1_open as openBranch,
  clause_branch_v1_request_push as pushBranchRequest,
  clause_session_v1_command_bulk as commandSession,
  clause_session_v1_event_bulk as readSessionEvent,
  clause_session_v1_open_bulk as openSession,
  clause_session_v1_reclaim_retired as reclaimRetiredSession,
  initSync,
} from "#clause-runtime-wasm";
import {
  applyAdmittedFrame,
  createCinderwakePresentation,
  disposeCinderwakePresentation,
  hideChargeCorridor,
  renderPresentationFrame,
  setActivityCue,
  setChargeCorridor,
  signalDeath,
  signalImpact,
  signalPropulsion,
  type CinderwakePresentation,
  type ProjectedPosition,
} from "./cinderwake-presentation.js";
import {
  identityString,
  parseForeignJson,
  requireArray,
  requireBoolean,
  requireField,
  requireForeignRecord,
  requireNumber,
  requireString,
} from "./foreign.js";

type ProcessBranch = ReturnType<typeof openProcessBranch>;
type AuthoritativeAdvance = ReturnType<typeof admitAuthoritativeOccurrences>;
type ReconnectProposal = ReturnType<typeof proposeBranchReconnect>;
type ReconnectAdmission = ReturnType<typeof adjudicateBranchReconnect>;
type BranchExplanation = ReconnectAdmission["explanation"];

type JourneyStage =
  | Readonly<{ kind: "dormant" }>
  | Readonly<{ kind: "ready" }>
  | Readonly<{ kind: "disconnected"; processBranch: ProcessBranch }>
  | Readonly<{
      kind: "branch-advanced";
      processBranch: ProcessBranch;
      authoritative: AuthoritativeAdvance;
      proposal: ReconnectProposal;
    }>
  | Readonly<{
      kind: "candidate-submitted";
      processBranch: ProcessBranch;
      authoritative: AuthoritativeAdvance;
      proposal: ReconnectProposal;
    }>
  | Readonly<{
      kind: "successor-admitted";
      processBranch: ProcessBranch;
      admitted: ReconnectAdmission;
      explanation: BranchExplanation;
      projection: ProjectedValue;
    }>;

interface StageView {
  readonly label: string;
  readonly summary: string;
  readonly canEnter: boolean;
  readonly canDisconnect: boolean;
  readonly canAdvance: boolean;
  readonly canSubmit: boolean;
  readonly canAdmit: boolean;
  readonly branchVisible: boolean;
  readonly candidateText: string | null;
  readonly projectionText: string;
  readonly explanationText: string;
}

interface SceneShell {
  readonly presentation: CinderwakePresentation;
  readonly canvas: HTMLCanvasElement;
  readonly pointerHandler: (event: PointerEvent) => void;
  frameHandle: number;
  alive: boolean;
}

interface EffectSession {
  readonly port: CartridgePort;
  readonly session: unknown;
}

interface GenerationPayload {
  readonly generation: number;
  readonly compilerMicros: number;
  readonly cwr1: string;
  readonly sourceModifiedMillis: number;
  readonly hot: boolean;
}

interface Vector3Projection extends ProjectedPosition {}

interface PlayerProjection {
  readonly position: Vector3Projection;
  readonly vitality: number;
  readonly maximumVitality: number;
  readonly grounded: boolean;
  readonly boosterEnergy: number;
  readonly boosterCapacity: number;
  readonly boosterThreshold: number;
  readonly boosterDelay: number;
  readonly statusEffect: string;
  readonly statusClock: number;
  readonly combatStatus: string;
}

interface EnemyProjection {
  readonly position: Vector3Projection;
  readonly vitality: number;
  readonly maximumVitality: number;
  readonly pressureState: string;
  readonly pressureClock: number;
  readonly chargeStart: Vector3Projection;
  readonly chargeEnd: Vector3Projection;
  readonly chargeRadius: number;
  readonly chargeCommitted: boolean;
  readonly recoveryClock: number;
  readonly randomSample: number;
  readonly combatStatus: string;
}

interface BoltProjection {
  readonly position: Vector3Projection;
  readonly visible: boolean;
}

interface LootProjection {
  readonly position: Vector3Projection;
  readonly state: string;
  readonly custody: string;
}

interface ObjectiveProjection {
  readonly position: Vector3Projection;
  readonly state: number;
}

interface GameProjection {
  readonly player: PlayerProjection;
  readonly enemy: EnemyProjection;
  readonly bolt: BoltProjection;
  readonly loot: LootProjection;
  readonly objective: ObjectiveProjection;
}

interface ResidentLawSession {
  readonly port: CartridgePort;
  controller: CartridgeWorkbench | null;
  generation: number;
  polling: boolean;
  interval: number;
  pendingHot: GenerationPayload | null;
  lastProjection: GameProjection | null;
  admittedOrdinal: number;
  candidateSeen: boolean;
}

interface PlayApp {
  readonly module: object;
  readonly branchRequest: ExactProcessRequest;
  readonly occurrences: readonly ExactBytes[];
  readonly effect: EffectSession;
  readonly residentLaw: ResidentLawSession;
  readonly scene: SceneShell;
  readonly listeners: Array<() => void>;
  stage: JourneyStage;
  effectSettled: boolean;
}

interface PhysicalKey {
  readonly code: string;
  readonly repeat: boolean;
}

declare global {
  interface Window {
    __GREYWROUGHT_RESIDENT_EVENTS__: Array<Record<string, unknown>>;
    __GREYWROUGHT_GAME_EVENTS__: Array<Record<string, unknown>>;
    __GREYWROUGHT_TEARDOWN__: (() => void) | undefined;
  }
}

function requireCondition(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function requireValue<T>(value: T | undefined, context: string): T {
  if (value === undefined) throw new Error(`${context} is absent`);
  return value;
}

function isProjectedArray(
  value: ProjectedValue,
): value is readonly ProjectedValue[] {
  return Array.isArray(value);
}

function element(id: string): HTMLElement {
  const value = document.getElementById(id);
  if (value === null) throw new Error(`missing browser element #${id}`);
  return value;
}

function button(id: string): HTMLButtonElement {
  const value = element(id);
  if (!(value instanceof HTMLButtonElement)) {
    throw new Error(`browser element #${id} is not a button`);
  }
  return value;
}

function sequenceLimits() {
  const maximum = Number.MAX_SAFE_INTEGER;
  return createWorkbenchSequenceLimits(
    maximum,
    maximum,
    maximum,
    maximum,
    maximum,
  );
}

function branchPolicy(): WorkbenchPolicy {
  return createWorkbenchPolicy(8, 8, 32, 128, 512, sequenceLimits());
}

function residentPolicy(): WorkbenchPolicy {
  return createWorkbenchPolicy(
    8,
    8,
    32,
    projectedTermPropertyLimit,
    projectedTermJsonLimit,
    sequenceLimits(),
  );
}

function initializeRuntime(bytes: ArrayBuffer): object {
  initSync({ module: bytes });
  return Object.freeze({
    clause_branch_v1_io_reset: resetBranchIo,
    clause_branch_v1_request_push: pushBranchRequest,
    clause_branch_v1_open: openBranch,
    clause_branch_v1_command: branchCommand,
    clause_branch_v1_event_len: branchEventLength,
    clause_branch_v1_event_byte: branchEventByte,
    clause_session_v1_open_bulk: (request: readonly number[]) =>
      openSession(new Uint8Array(request)),
    clause_session_v1_command_bulk: (request: readonly number[]) =>
      commandSession(new Uint8Array(request)),
    clause_session_v1_event_bulk: readSessionEvent,
    clause_session_v1_reclaim_retired: reclaimRetiredSession,
  });
}

function requirePackage(result: PackageCheck | null, context: string): unknown {
  if (result === null) throw new Error(`${context} returned no PackageCheck`);
  if (result._tag === "PackageRejected") {
    throw new Error(`${context} rejected its cartridge: ${result.reason}`);
  }
  return result.acceptedPackage;
}

function requireSession(result: SessionCompletion | null, context: string): unknown {
  if (result === null) throw new Error(`${context} returned no SessionCompletion`);
  if (result._tag === "SessionFailed") {
    throw new Error(`${context} did not open: ${result.reason}`);
  }
  return result.session;
}

function openEffectSession(module: object, request: ExactProcessRequest): EffectSession {
  const port = createWasmCartridgePort(module, branchPolicy());
  const packageResult: { value: PackageCheck | null } = { value: null };
  port.acceptPackage(request, (result) => {
    packageResult.value = result;
  });
  const sessionResult: { value: SessionCompletion | null } = { value: null };
  port.startSession(requirePackage(packageResult.value, "effect package"), 1, (result) => {
    sessionResult.value = result;
  });
  return {
    port,
    session: requireSession(sessionResult.value, "effect session"),
  };
}

function openResidentLawSession(module: object): ResidentLawSession {
  return {
    port: createWasmCartridgePort(module, residentPolicy()),
    controller: null,
    generation: -1,
    polling: false,
    interval: 0,
    pendingHot: null,
    lastProjection: null,
    admittedOrdinal: 0,
    candidateSeen: false,
  };
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

function projectedNumber(value: ProjectedValue, field: string, context: string): number {
  const result = projectedField(value, field, context);
  if (typeof result !== "number" || !Number.isFinite(result)) {
    throw new Error(`${context}.${field} is not a finite number`);
  }
  return result;
}

function projectedString(value: ProjectedValue, field: string, context: string): string {
  const result = projectedField(value, field, context);
  if (typeof result !== "string") throw new Error(`${context}.${field} is not text`);
  return result;
}

function projectedBoolean(value: ProjectedValue, field: string, context: string): boolean {
  const result = projectedField(value, field, context);
  if (typeof result !== "boolean") throw new Error(`${context}.${field} is not boolean`);
  return result;
}

function projectedPosition(value: ProjectedValue, context: string): Vector3Projection {
  return {
    x: projectedNumber(value, "x", context),
    y: projectedNumber(value, "y", context),
    z: projectedNumber(value, "z", context),
  };
}

function decodeGameProjection(value: ProjectedValue): GameProjection {
  const player = projectedField(value, "player-1", "game projection");
  const enemy = projectedField(value, "cinder-wraith", "game projection");
  const bolt = projectedField(value, "cinder-bolt", "game projection");
  const loot = projectedField(value, "ashen-key", "game projection");
  const objective = projectedField(value, "game-objective", "game projection");
  const playerVitals = projectedField(player, "player-vitals", "player-1");
  const enemyVitals = projectedField(enemy, "enemy-vitals", "cinder-wraith");
  const objectiveState = projectedField(objective, "objective-state", "game-objective");
  return {
    player: {
      position: projectedPosition(
        projectedField(player, "position", "player-1"),
        "player-1.position",
      ),
      vitality: projectedNumber(playerVitals, "x", "player-vitals"),
      maximumVitality: projectedNumber(playerVitals, "y", "player-vitals"),
      grounded: projectedBoolean(player, "grounded", "player-1"),
      boosterEnergy: projectedNumber(player, "booster-energy", "player-1"),
      boosterCapacity: projectedNumber(player, "booster-capacity", "player-1"),
      boosterThreshold: projectedNumber(
        player,
        "booster-ignition-threshold",
        "player-1",
      ),
      boosterDelay: projectedNumber(
        player,
        "booster-regeneration-delay",
        "player-1",
      ),
      statusEffect: projectedString(player, "status-effect", "player-1"),
      statusClock: projectedNumber(player, "status-clock", "player-1"),
      combatStatus: projectedString(player, "combat-status", "player-1"),
    },
    enemy: {
      position: projectedPosition(
        projectedField(enemy, "enemy-position", "cinder-wraith"),
        "cinder-wraith.enemy-position",
      ),
      vitality: projectedNumber(enemyVitals, "x", "enemy-vitals"),
      maximumVitality: projectedNumber(enemyVitals, "y", "enemy-vitals"),
      pressureState: projectedString(
        enemy,
        "enemy-pressure-state",
        "cinder-wraith",
      ),
      pressureClock: projectedNumber(
        enemy,
        "enemy-pressure-clock",
        "cinder-wraith",
      ),
      chargeStart: projectedPosition(
        projectedField(enemy, "enemy-charge-start", "cinder-wraith"),
        "cinder-wraith.enemy-charge-start",
      ),
      chargeEnd: projectedPosition(
        projectedField(enemy, "enemy-charge-end", "cinder-wraith"),
        "cinder-wraith.enemy-charge-end",
      ),
      chargeRadius: projectedNumber(
        projectedField(enemy, "enemy-charge-envelope", "cinder-wraith"),
        "z",
        "cinder-wraith.enemy-charge-envelope",
      ),
      chargeCommitted: projectedBoolean(
        enemy,
        "enemy-charge-committed",
        "cinder-wraith",
      ),
      recoveryClock: projectedNumber(
        enemy,
        "enemy-recovery-clock",
        "cinder-wraith",
      ),
      randomSample: projectedNumber(
        enemy,
        "enemy-random-sample",
        "cinder-wraith",
      ),
      combatStatus: projectedString(
        enemy,
        "enemy-combat-status",
        "cinder-wraith",
      ),
    },
    bolt: {
      position: projectedPosition(
        projectedField(bolt, "projectile-position", "cinder-bolt"),
        "cinder-bolt.projectile-position",
      ),
      visible: projectedBoolean(bolt, "projectile-visible", "cinder-bolt"),
    },
    loot: {
      position: projectedPosition(
        projectedField(loot, "loot-position", "ashen-key"),
        "ashen-key.loot-position",
      ),
      state: projectedString(loot, "loot-state", "ashen-key"),
      custody: projectedString(loot, "custody", "ashen-key"),
    },
    objective: {
      position: projectedPosition(
        projectedField(objective, "exit-position", "game-objective"),
        "game-objective.exit-position",
      ),
      state: projectedNumber(objectiveState, "x", "objective-state"),
    },
  };
}

function objectiveLabel(state: number): "completed" | "failed" | "playing" {
  if (state === 1) return "completed";
  if (state === -1) return "failed";
  return "playing";
}

function setVitalityBar(
  barId: string,
  valueId: string,
  vitality: number,
  maximum: number,
): void {
  const ratio = Math.max(0, Math.min(1, vitality / Math.max(0.001, maximum)));
  element(barId).style.transform = `scaleX(${ratio})`;
  element(valueId).textContent = `${vitality} / ${maximum}`;
}

function boundedGameEvent(event: Record<string, unknown>): void {
  const events = window.__GREYWROUGHT_GAME_EVENTS__;
  events.push(event);
  if (events.length > 512) events.shift();
}

function renderGameProjection(app: PlayApp, rawProjection: ProjectedValue): void {
  const projection = decodeGameProjection(rawProjection);
  const resident = app.residentLaw;
  const prior = resident.lastProjection;
  const ordinal = resident.admittedOrdinal + 1;
  const { player, enemy, bolt, loot, objective } = projection;
  const objectiveStatus = objectiveLabel(objective.state);
  resident.admittedOrdinal = ordinal;

  applyAdmittedFrame(app.scene.presentation, {
    ordinal,
    subjects: [
      {
        subject: "ashen-wayfarer",
        position: player.position,
        visible: true,
        vitalityRatio: player.vitality / Math.max(0.001, player.maximumVitality),
      },
      {
        subject: "cinder-wraith",
        position: enemy.position,
        visible: false,
        vitalityRatio: enemy.vitality / Math.max(0.001, enemy.maximumVitality),
      },
      {
        subject: "magitek-boar",
        position: enemy.position,
        visible: true,
        vitalityRatio: enemy.vitality / Math.max(0.001, enemy.maximumVitality),
      },
      {
        subject: "cinder-bolt",
        position: bolt.position,
        visible: bolt.visible,
        vitalityRatio: 1,
      },
      {
        subject: "ashen-key",
        position: loot.position,
        visible: loot.state !== "hidden",
        vitalityRatio: 1,
      },
      {
        subject: "moonwell",
        position: objective.position,
        visible: true,
        vitalityRatio: 1,
      },
    ],
    cameraTarget: player.position,
  });
  setActivityCue(
    app.scene.presentation,
    "magitek-boar",
    enemy.pressureState === "telegraph" ? 1 : 0,
    enemy.pressureState === "charging" ? 1 : 0,
    enemy.pressureState === "hit-recovery" ||
      enemy.pressureState === "overrun-recovery"
      ? 1
      : 0,
  );
  if (enemy.chargeCommitted) {
    setChargeCorridor(
      app.scene.presentation,
      enemy.chargeStart,
      enemy.chargeEnd,
      enemy.chargeRadius,
    );
  } else {
    hideChargeCorridor(app.scene.presentation);
  }
  setActivityCue(
    app.scene.presentation,
    "ashen-key",
    loot.state === "available" ? 1 : 0,
    loot.state === "available" ? 0.7 : 0,
    0,
  );
  setVitalityBar(
    "player-vitality-bar",
    "player-vitality",
    player.vitality,
    player.maximumVitality,
  );
  setVitalityBar(
    "enemy-vitality-bar",
    "enemy-vitality",
    enemy.vitality,
    enemy.maximumVitality,
  );
  setVitalityBar(
    "booster-energy-bar",
    "booster-energy",
    player.boosterEnergy,
    player.boosterCapacity,
  );
  element("objective").textContent =
    objectiveStatus === "completed"
      ? "MOONWELL RESTORED · the ashen key is admitted"
      : objectiveStatus === "failed"
        ? "WAYFARER FALLEN · press R to restore the revision"
        : loot.state === "available"
          ? "ASHEN KEY REVEALED · walk over the glowing key"
          : loot.state === "acquired" && loot.custody === "player-1"
            ? "KEY CLAIMED · carry it west to the moonwell"
            : "Read the boar telegraph · burst perpendicular · punish recovery";
  element("stage").textContent = `world · ${objectiveStatus}`;
  element("summary").textContent =
    `wayfarer ${player.combatStatus} · boar ${enemy.combatStatus} / ` +
    `${enemy.pressureState} ${enemy.pressureClock} · recovery ${enemy.recoveryClock} · ` +
    `key ${loot.state} / ` +
    `${loot.custody} · booster ${player.boosterEnergy} / ${player.boosterCapacity} · ` +
    `ignition ${player.boosterThreshold} · regeneration delay ${player.boosterDelay} · ` +
    `status ${player.statusEffect} ${player.statusClock} · fixed sample ${enemy.randomSample}`;
  element("combat-state").textContent =
    `BOOST ${player.boosterEnergy} / ${player.boosterCapacity} · ` +
    `IGNITE ${player.boosterThreshold} · REGEN ${player.boosterDelay}   ` +
    `STATUS ${player.statusEffect} · ${player.statusClock}`;

  Object.assign(document.body.dataset, {
    gamePhase: objectiveStatus,
    gamePlayerVitality: String(player.vitality),
    gameEnemyVitality: String(enemy.vitality),
    gameCustody: loot.custody,
    gamePlayerX: String(player.position.x),
    gamePlayerZ: String(player.position.z),
    gameBoarX: String(enemy.position.x),
    gameBoarZ: String(enemy.position.z),
    gameBoosterEnergy: String(player.boosterEnergy),
    gameBoosterCapacity: String(player.boosterCapacity),
    gameBoosterIgnitionThreshold: String(player.boosterThreshold),
    gameBoosterRegenerationDelay: String(player.boosterDelay),
    gameStatusEffect: player.statusEffect,
    gameStatusClock: String(player.statusClock),
    gameProjectileVisible: String(bolt.visible),
    gameEnemyPressure: enemy.pressureState,
    gamePressureClock: String(enemy.pressureClock),
    gameBoarRecoveryClock: String(enemy.recoveryClock),
    gameChargeCorridorVisible: String(enemy.chargeCommitted),
  });

  if (prior !== null) {
    element("combat-feedback").textContent = "";
    if (enemy.vitality < prior.enemy.vitality) {
      const damage = prior.enemy.vitality - enemy.vitality;
      element("combat-feedback").textContent = `EMBER IMPACT · -${damage}`;
      signalImpact(
        app.scene.presentation,
        "cinder-wraith",
        ordinal,
        damage / Math.max(0.001, enemy.maximumVitality),
      );
    }
    if (player.vitality < prior.player.vitality) {
      const damage = prior.player.vitality - player.vitality;
      element("combat-feedback").textContent = `WRAITH IMPACT · -${damage}`;
      signalImpact(
        app.scene.presentation,
        "ashen-wayfarer",
        ordinal,
        damage / Math.max(0.001, player.maximumVitality),
      );
    }
    if (prior.player.grounded && !player.grounded) {
      signalPropulsion(app.scene.presentation, "ashen-wayfarer", ordinal, 1);
    }
    if (player.combatStatus === "dead" && prior.player.combatStatus !== "dead") {
      signalDeath(app.scene.presentation, "ashen-wayfarer", ordinal);
    }
    if (enemy.combatStatus === "dead" && prior.enemy.combatStatus !== "dead") {
      signalDeath(app.scene.presentation, "cinder-wraith", ordinal);
    }
  }
  resident.lastProjection = projection;
  boundedGameEvent({
    phase: "frame-admitted",
    generation: resident.generation,
    objective: objectiveStatus,
    playerX: player.position.x,
    playerZ: player.position.z,
    boarX: enemy.position.x,
    boarZ: enemy.position.z,
    boosterEnergy: player.boosterEnergy,
    boosterCapacity: player.boosterCapacity,
    boosterIgnitionThreshold: player.boosterThreshold,
    boosterRegenerationDelay: player.boosterDelay,
    statusEffect: player.statusEffect,
    statusClock: player.statusClock,
    projectileVisible: bolt.visible,
    enemyPressure: enemy.pressureState,
    pressureClock: enemy.pressureClock,
    boarRecoveryClock: enemy.recoveryClock,
    chargeCorridorVisible: enemy.chargeCommitted,
    playerVitality: player.vitality,
    enemyVitality: enemy.vitality,
    lootState: loot.state,
    custody: loot.custody,
  });
}

function residentLawFailure(message: string): void {
  element("resident-law").textContent = `Source generation rejected\n${message}`;
  document.body.dataset.residentPhase = "rejected";
}

function handleLifecycleReceipt(app: PlayApp, receipt: LifecycleReceipt): void {
  const resident = app.residentLaw;
  boundedGameEvent({
    phase: receipt.event,
    generation: receipt.activeGeneration,
    operation: receipt.operationId,
    detail: receipt.detail,
  });
  if (receipt.event === "candidate-produced") {
    resident.candidateSeen = true;
    document.body.dataset.gameCustodyPhase = "candidate-hidden";
    element("game-custody").textContent =
      `CandidateDelta retained and hidden\ngeneration ${receipt.activeGeneration} · ` +
      `operation ${receipt.operationId}`;
    return;
  }
  if (receipt.event === "admission-accepted") {
    const ordered = resident.candidateSeen;
    const pending = resident.pendingHot;
    document.body.dataset.gameCustodyPhase = ordered
      ? "candidate-before-admission"
      : "order-violation";
    element("game-custody").textContent =
      `CandidateDelta hidden first\nseparate Admission installed successor\n` +
      `operation ${receipt.operationId}`;
    resident.candidateSeen = false;
    if (pending?.hot === true) {
      const latency = Date.now() - pending.sourceModifiedMillis;
      document.body.dataset.residentLatencyMillis = String(latency);
      element("resident-law").textContent =
        `generation ${pending.generation} · admitted live edit\n` +
        `source-save → behavior ${latency} ms · resident compile ` +
        `${pending.compilerMicros} µs`;
      window.__GREYWROUGHT_RESIDENT_EVENTS__.push({
        phase: "admitted",
        generation: pending.generation,
        latencyMillis: latency,
        compilerMicros: pending.compilerMicros,
      });
      resident.pendingHot = null;
    }
    return;
  }
  if (receipt.event === "session-started") {
    document.body.dataset.residentPhase = "session-started";
    return;
  }
  if (
    receipt.event === "candidate-failed" ||
    receipt.event === "admission-rejected" ||
    receipt.event === "session-failed" ||
    receipt.event === "package-rejected"
  ) {
    residentLawFailure(receipt.detail);
  }
}

function parseGenerationPayload(value: unknown): GenerationPayload {
  const record = requireForeignRecord(value, "resident generation");
  const generation = requireNumber(
    requireField(record, "generation", "resident generation"),
    "resident generation.generation",
  );
  const compilerMicros = requireNumber(
    requireField(record, "compilerMicros", "resident generation"),
    "resident generation.compilerMicros",
  );
  const sourceModifiedMillis = requireNumber(
    requireField(record, "sourceModifiedMillis", "resident generation"),
    "resident generation.sourceModifiedMillis",
  );
  requireCondition(
    Number.isSafeInteger(generation) &&
      Number.isSafeInteger(compilerMicros) &&
      Number.isSafeInteger(sourceModifiedMillis),
    "resident generation counters must be safe integers",
  );
  return {
    generation,
    compilerMicros,
    cwr1: requireString(
      requireField(record, "cwr1", "resident generation"),
      "resident generation.cwr1",
    ),
    sourceModifiedMillis,
    hot: requireBoolean(
      requireField(record, "hot", "resident generation"),
      "resident generation.hot",
    ),
  };
}

function installResidentLaw(app: PlayApp, payload: GenerationPayload): void {
  const resident = app.residentLaw;
  const request = createExactProcessRequest(decodeCwr1Hex(payload.cwr1));
  resident.generation = payload.generation;
  resident.pendingHot = payload.hot ? payload : null;
  document.body.dataset.residentGeneration = String(payload.generation);
  document.body.dataset.residentCompilerMicros = String(payload.compilerMicros);
  element("resident-law").textContent =
    `generation ${payload.generation} · checked\nresident compile ` +
    `${payload.compilerMicros} µs\nawaiting first admitted frame`;
  if (resident.controller === null) {
    resident.controller = createCartridgeWorkbench(
      resident.port,
      createFixedTick(16),
      residentPolicy(),
      (milliseconds, callback) => {
        const handle = window.setInterval(callback, milliseconds);
        return () => window.clearInterval(handle);
      },
      (frame) => {
        if (frame.length === 0) return;
        try {
          renderGameProjection(app, decodeProjectedTermFrame(Array.from(frame)));
        } catch (cause: unknown) {
          const error = cause instanceof Error ? cause : new Error(String(cause));
          residentLawFailure(error.message);
          throw error;
        }
      },
      (receipt) => handleLifecycleReceipt(app, receipt),
      request,
    );
    return;
  }
  if (!resident.controller.reloadPackage(request)) {
    residentLawFailure("resident generation reload was not accepted");
  }
}

async function pollResidentLaw(app: PlayApp): Promise<void> {
  const resident = app.residentLaw;
  if (resident.polling) return;
  resident.polling = true;
  try {
    const response = await fetch(
      `/resident-generation?after=${resident.generation}`,
      { cache: "no-store" },
    );
    if (response.status === 204) return;
    const body: unknown = await response.json();
    if (!response.ok) {
      const record = requireForeignRecord(body, "resident rejection");
      const errorHex = requireString(
        requireField(record, "errorHex", "resident rejection"),
        "resident rejection.errorHex",
      );
      throw new Error(`resident source rejected: ${errorHex}`);
    }
    installResidentLaw(app, parseGenerationPayload(body));
  } catch (cause: unknown) {
    residentLawFailure(cause instanceof Error ? cause.message : String(cause));
  } finally {
    resident.polling = false;
  }
}

function focusScene(shell: SceneShell): void {
  shell.canvas.focus({ preventScroll: true });
  element("selection").textContent =
    "Arena focused. Keyboard input enters the resident Clause session.";
}

function renderLoop(shell: SceneShell): void {
  if (!shell.alive) return;
  const { canvas, presentation } = shell;
  renderPresentationFrame(
    presentation,
    Date.now() / 1000,
    Math.max(1, Math.trunc(canvas.clientWidth)),
    Math.max(1, Math.trunc(canvas.clientHeight)),
  );
  Object.assign(document.body.dataset, {
    gameCameraX: String(presentation.camera.position.x),
    gameCameraY: String(presentation.camera.position.y),
    gameCameraZ: String(presentation.camera.position.z),
    gameCameraTargetX: String(presentation.cameraTargetX),
    gameCameraTargetY: String(presentation.cameraTargetY),
    gameCameraTargetZ: String(presentation.cameraTargetZ),
    gameCameraLookX: String(presentation.cameraFollowX),
    gameCameraLookY: String(presentation.cameraFollowY + 0.45),
    gameCameraLookZ: String(presentation.cameraFollowZ),
  });
  shell.frameHandle = requestAnimationFrame(() => renderLoop(shell));
}

function createScene(): SceneShell {
  const presentation = createCinderwakePresentation(
    {
      wayfarer: "ashen-wayfarer",
      wraith: "cinder-wraith",
      boar: "magitek-boar",
      bolt: "cinder-bolt",
      relic: "ashen-key",
      moonwell: "moonwell",
    },
    Math.max(1, Math.min(2, window.devicePixelRatio)),
  );
  const canvas = presentation.renderer.domElement;
  let shell: SceneShell | null = null;
  const pointerHandler = (_event: PointerEvent): void => {
    if (shell !== null) focusScene(shell);
  };
  shell = {
    presentation,
    canvas,
    pointerHandler,
    frameHandle: 0,
    alive: true,
  };
  canvas.id = "world-canvas";
  canvas.tabIndex = 0;
  canvas.setAttribute("aria-label", "Greywrought semantic world");
  element("world-wrap").prepend(canvas);
  canvas.addEventListener("pointerdown", pointerHandler);
  renderLoop(shell);
  return shell;
}

function stageView(stage: JourneyStage): StageView {
  switch (stage.kind) {
    case "dormant":
      return {
        label: "threshold",
        summary: "Enter the pinned world. Nothing has executed yet.",
        canEnter: true,
        canDisconnect: false,
        canAdvance: false,
        canSubmit: false,
        canAdmit: false,
        branchVisible: false,
        candidateText: null,
        projectionText: "Hidden until Admission.",
        explanationText: "No authoritative successor yet.",
      };
    case "ready":
      return {
        label: "authoritative · R0",
        summary:
          "The wayfarer, wraith, key, and moonwell exist under the exact Clause program.",
        canEnter: false,
        canDisconnect: true,
        canAdvance: false,
        canSubmit: false,
        canAdmit: false,
        branchVisible: false,
        candidateText: null,
        projectionText: "Hidden until Admission.",
        explanationText: "No authoritative successor yet.",
      };
    case "disconnected":
      return {
        label: "forked · tick 41",
        summary:
          "The disconnected branch has exact ancestry and bounded authority. It is not world truth.",
        canEnter: false,
        canDisconnect: false,
        canAdvance: true,
        canSubmit: false,
        canAdmit: false,
        branchVisible: true,
        candidateText: null,
        projectionText: "Hidden until Admission.",
        explanationText: "Branch ancestry retained; no successor yet.",
      };
    case "branch-advanced":
      return {
        label: "branch advanced",
        summary:
          "Combat ran inside the isolated branch while the authoritative world advanced independently.",
        canEnter: false,
        canDisconnect: false,
        canAdvance: false,
        canSubmit: true,
        canAdmit: false,
        branchVisible: true,
        candidateText: null,
        projectionText: "Hidden until Admission.",
        explanationText: "A branch result exists, but has not been submitted.",
      };
    case "candidate-submitted":
      return {
        label: "candidate pending",
        summary:
          "The Candidate Delta is visible as a sealed proposal only. Authoritative geometry is unchanged.",
        canEnter: false,
        canDisconnect: false,
        canAdvance: false,
        canSubmit: false,
        canAdmit: true,
        branchVisible: true,
        candidateText: `Pending CandidateDelta\n${identityString(stage.proposal.evidence.candidate)}`,
        projectionText: "Hidden until Admission.",
        explanationText: "Awaiting explicit authoritative adjudication.",
      };
    case "successor-admitted":
      return {
        label: "admitted successor",
        summary:
          "Admission replayed the branch against the current authority and established a new revision.",
        canEnter: false,
        canDisconnect: false,
        canAdvance: false,
        canSubmit: false,
        canAdmit: false,
        branchVisible: true,
        candidateText: null,
        projectionText: JSON.stringify(stage.projection, null, 2),
        explanationText: JSON.stringify(stage.explanation, null, 2),
      };
  }
}

function renderStage(app: PlayApp): void {
  const view = stageView(app.stage);
  element("stage").textContent = view.label;
  element("summary").textContent = view.summary;
  button("enter-world").disabled = !view.canEnter;
  button("disconnect").disabled = !view.canDisconnect;
  button("continue-branch").disabled = !view.canAdvance;
  button("submit-candidate").disabled = !view.canSubmit;
  button("admit-candidate").disabled = !view.canAdmit;
  element("branch-label").classList.toggle("visible", view.branchVisible);
  const candidate = element("candidate");
  candidate.classList.toggle("visible", view.candidateText !== null);
  candidate.textContent = view.candidateText ?? "";
  element("projection").textContent = view.projectionText;
  element("explanation").textContent = view.explanationText;
  document.body.dataset.journey = view.label;
}

function enterWorld(app: PlayApp): void {
  if (app.stage.kind === "dormant") app.stage = { kind: "ready" };
  renderStage(app);
}

function disconnect(app: PlayApp): void {
  if (app.stage.kind === "ready") {
    const worldShift = requireValue(app.occurrences[0], "world-shift occurrence");
    app.stage = {
      kind: "disconnected",
      processBranch: openProcessBranch(
        app.module,
        app.branchRequest,
        41,
        worldShift,
        8,
      ),
    };
  }
  renderStage(app);
}

function advanceBranch(app: PlayApp): void {
  if (app.stage.kind === "disconnected") {
    const processBranch = app.stage.processBranch;
    const worldShift = requireValue(app.occurrences[0], "world-shift occurrence");
    const combat = app.occurrences.slice(1);
    app.stage = {
      kind: "branch-advanced",
      processBranch,
      authoritative: admitAuthoritativeOccurrences(app.module, processBranch, [
        worldShift,
      ]),
      proposal: proposeBranchReconnect(app.module, processBranch, combat),
    };
  }
  renderStage(app);
}

function submitCandidate(app: PlayApp): void {
  if (app.stage.kind === "branch-advanced") {
    app.stage = { ...app.stage, kind: "candidate-submitted" };
  }
  renderStage(app);
}

function admitCandidate(app: PlayApp): void {
  if (app.stage.kind === "candidate-submitted") {
    const { processBranch, authoritative, proposal } = app.stage;
    const admitted = adjudicateBranchReconnect(
      app.module,
      processBranch,
      proposal,
      authoritative.successor,
      app.occurrences.slice(1),
    );
    requireCondition(
      admitted.projection !== null,
      "branch Admission produced no projection",
    );
    app.stage = {
      kind: "successor-admitted",
      processBranch,
      admitted,
      explanation: explainProcessBranch(app.module, processBranch).explanation,
      projection: decodeProjectedTermFrame(admitted.projection.termBytes),
    };
  }
  renderStage(app);
}

function exactReceipt(value: unknown): readonly number[] {
  return requireArray(value, "moonwell receipt").map((byte, index) => {
    const number = requireNumber(byte, `moonwell receipt[${index}]`);
    requireCondition(
      Number.isSafeInteger(number) && number >= 0 && number <= 255,
      `moonwell receipt[${index}] is not a byte`,
    );
    return number;
  });
}

function pulseMoonwell(app: PlayApp): void {
  if (app.effectSettled) return;
  const { session } = app.effect;
  const { module } = app;
  const first = advanceSessionOccurrence(module, session, 0);
  const suspension = suspendSession(module, session);
  const resumption = resumeSession(module, session);
  const second = advanceSessionOccurrence(module, session, 1);
  const intent = emitEffectIntent(module, session);
  const issued = issueEffectAuthorization(module, session, intent.intentId);
  const attempt = beginEffectAttempt(module, session, issued.authorizationId);
  const key = "greywrought/moonwell-receipt-v1";
  localStorage.setItem(key, JSON.stringify(attempt.payloadBytes));
  const stored = localStorage.getItem(key);
  requireCondition(stored !== null, "moonwell receipt was not retained");
  const receipt = exactReceipt(parseForeignJson(stored, "moonwell receipt"));
  const settled = settleEffectAttempt(
    module,
    session,
    attempt.attemptId,
    0,
    receipt,
  );
  app.effectSettled = true;
  button("pulse-moonwell").disabled = true;
  element("effect").textContent =
    `Activation ${identityString(intent.activation)}\n` +
    `Intent ${identityString(intent.intentId)}\n` +
    `Attempt ${identityString(attempt.attemptId)}\n` +
    `Receipt ${identityString(settled.receiptId)}\n` +
    `Observation ${identityString(settled.observationId)}\n` +
    `Judgment ${identityString(settled.judgmentId)}\n` +
    `State revisions before/after: ${intent.stateRevisionCount}/` +
    `${settled.stateRevisionCount}\nContinuation retained: ` +
    `${identityString(suspension.continuation) === identityString(resumption.continuation)}` +
    `\nSteps observed: ${first.kind}, ${second.kind}`;
}

function bindClick(
  listeners: Array<() => void>,
  id: string,
  action: () => void,
): void {
  const target = button(id);
  const handler = (): void => action();
  target.addEventListener("click", handler);
  listeners.push(() => target.removeEventListener("click", handler));
}

function physicalKeyEnvelope(event: PhysicalKey, phase: "down" | "up") {
  return createWorkbenchEnvelope(
    residentPolicy(),
    JSON.stringify([
      JSON.stringify({ kind: "keyboard", code: event.code, phase, repeat: event.repeat }),
    ]),
  );
}

function observeGameKey(
  app: PlayApp,
  event: PhysicalKey,
  phase: "down" | "up",
): void {
  app.residentLaw.controller?.observeInput(physicalKeyEnvelope(event, phase));
}

const heldGameKeys = new Set([
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "ShiftLeft",
  "ShiftRight",
  "KeyE",
]);

const gameKeys = new Set([
  ...heldGameKeys,
  "KeyQ",
  "KeyF",
  "Space",
  "KeyR",
]);

function bindGameInput(app: PlayApp, listeners: Array<() => void>): void {
  const { canvas } = app.scene;
  const down = (event: KeyboardEvent): void => {
    if (!event.repeat && gameKeys.has(event.code)) {
      event.preventDefault();
      observeGameKey(app, event, "down");
    }
  };
  const up = (event: KeyboardEvent): void => {
    if (heldGameKeys.has(event.code)) {
      event.preventDefault();
      observeGameKey(app, event, "up");
    }
  };
  canvas.addEventListener("keydown", down);
  canvas.addEventListener("keyup", up);
  listeners.push(() => canvas.removeEventListener("keydown", down));
  listeners.push(() => canvas.removeEventListener("keyup", up));
}

function pressReset(app: PlayApp): void {
  app.scene.canvas.focus({ preventScroll: true });
  observeGameKey(app, { code: "KeyR", repeat: false }, "down");
}

function stageProcessBranch(stage: JourneyStage): ProcessBranch | null {
  switch (stage.kind) {
    case "dormant":
    case "ready":
      return null;
    default:
      return stage.processBranch;
  }
}

function teardown(app: PlayApp): void {
  if (!app.scene.alive) return;
  app.scene.alive = false;
  window.clearInterval(app.residentLaw.interval);
  cancelAnimationFrame(app.scene.frameHandle);
  app.scene.canvas.removeEventListener("pointerdown", app.scene.pointerHandler);
  for (const removeListener of app.listeners) removeListener();
  disposeCinderwakePresentation(app.scene.presentation);
  app.scene.canvas.remove();
  const processBranch = stageProcessBranch(app.stage);
  if (processBranch !== null) disposeProcessBranch(app.module, processBranch);
  app.effect.port.disposeSession(app.effect.session);
  app.residentLaw.controller?.dispose();
}

function runSmokeIfRequested(app: PlayApp): void {
  if (new URLSearchParams(window.location.search).get("smoke") !== "1") return;
  for (const id of [
    "enter-world",
    "disconnect",
    "continue-branch",
    "submit-candidate",
    "admit-candidate",
    "pulse-moonwell",
  ]) {
    button(id).click();
  }
  document.body.dataset.smoke =
    document.body.dataset.journey === "admitted successor" && app.effectSettled
      ? "passed"
      : "failed";
}

function startApp(
  module: object,
  branchSource: string,
  effectSource: string,
): PlayApp {
  const branchRequest = createExactProcessRequest(decodeCwr1Hex(branchSource));
  const occurrences = processRequestOccurrences(branchRequest);
  const effectRequest = createExactProcessRequest(decodeCwr1Hex(effectSource));
  const listeners: Array<() => void> = [];
  const app: PlayApp = {
    module,
    branchRequest,
    occurrences,
    effect: openEffectSession(module, effectRequest),
    residentLaw: openResidentLawSession(module),
    stage: { kind: "dormant" },
    effectSettled: false,
    scene: createScene(),
    listeners,
  };
  window.__GREYWROUGHT_RESIDENT_EVENTS__ = [];
  window.__GREYWROUGHT_GAME_EVENTS__ = [];
  bindGameInput(app, listeners);
  bindClick(listeners, "reset-encounter", () => pressReset(app));
  bindClick(listeners, "enter-world", () => enterWorld(app));
  bindClick(listeners, "disconnect", () => disconnect(app));
  bindClick(listeners, "continue-branch", () => advanceBranch(app));
  bindClick(listeners, "submit-candidate", () => submitCandidate(app));
  bindClick(listeners, "admit-candidate", () => admitCandidate(app));
  bindClick(listeners, "pulse-moonwell", () => pulseMoonwell(app));
  renderStage(app);
  window.addEventListener("beforeunload", () => teardown(app), { once: true });
  window.__GREYWROUGHT_TEARDOWN__ = () => teardown(app);
  void pollResidentLaw(app);
  app.residentLaw.interval = window.setInterval(() => {
    void pollResidentLaw(app);
  }, 25);
  runSmokeIfRequested(app);
  return app;
}

async function fetchBytes(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`failed to fetch ${url}: ${response.status}`);
  return response.arrayBuffer();
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`failed to fetch ${url}: ${response.status}`);
  return response.text();
}

const [wasmBytes, branchSource, effectSource] = await Promise.all([
  fetchBytes("/wasm/clause_runtime_bg.wasm"),
  fetchText("/assets/conquest-v1.cwr1.hex"),
  fetchText("/assets/ongoing-effect-v1.cwr1.hex"),
]);
startApp(initializeRuntime(wasmBytes), branchSource, effectSource);
