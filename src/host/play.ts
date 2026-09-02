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
  "->WorkbenchPolicy" as createWorkbenchPolicy,
  "->WorkbenchSequenceLimits" as createWorkbenchSequenceLimits,
  type CartridgePort,
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
import { Vector3 } from "three";
import {
  applyAdmittedFrame,
  createCinderwakePresentation,
  disposeCinderwakePresentation,
  faceSubjectToward,
  hideChargeCorridor,
  orbitPresentationCamera,
  playWayfarerSwordAction,
  renderPresentationFrame,
  setActivityCue,
  setChargeCorridor,
  signalDeath,
  signalImpact,
  signalPropulsion,
  zoomPresentationCamera,
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
  readonly pointerMoveHandler: (event: PointerEvent) => void;
  readonly pointerReleaseHandler: (event: PointerEvent) => void;
  readonly wheelHandler: (event: WheelEvent) => void;
  readonly enemyNameplate: HTMLElement;
  readonly enemyNameplateFill: HTMLElement;
  readonly enemyNameplateAnchor: Vector3;
  enemyNameplateProjection: EnemyNameplateProjection | null;
  frameHandle: number;
  lastFrameRenderedAt: number;
  alive: boolean;
}

interface EnemyNameplateProjection {
  readonly position: Vector3Projection;
  readonly vitality: number;
  readonly maximumVitality: number;
  readonly alive: boolean;
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
  readonly swordActionSequence: number;
  readonly swordCommitmentClock: number;
  readonly combatTarget: string;
  readonly targetLockActive: boolean;
  readonly targetSelectionSequence: number;
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
  readonly worker: Worker;
  generation: number;
  polling: boolean;
  interval: number;
  pendingHot: GenerationPayload | null;
  lastProjection: GameProjection | null;
  pendingProjectionFrame: string | readonly number[] | null;
  projectionFrameHandle: number;
  admittedOrdinal: number;
  candidateSeen: boolean;
}

type ResidentInput =
  | Readonly<{
      kind: "keyboard";
      code: string;
      phase: "down" | "up";
      repeat: boolean;
    }>
  | Readonly<{
      kind: "scalar-input";
      channel: string;
      value: number;
    }>;

interface ResidentLifecycleReceipt {
  readonly event: string;
  readonly activeGeneration: number;
  readonly operationId: number;
  readonly detail: string;
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

function openResidentLawSession(): ResidentLawSession {
  return {
    worker: new Worker("/app/greywrought-clause/resident-worker.js", {
      type: "module",
      name: "greywrought-clause-resident",
    }),
    generation: -1,
    polling: false,
    interval: 0,
    pendingHot: null,
    lastProjection: null,
    pendingProjectionFrame: null,
    projectionFrameHandle: 0,
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
      swordActionSequence: projectedNumber(
        player,
        "sword-action-sequence",
        "player-1",
      ),
      swordCommitmentClock: projectedNumber(
        player,
        "sword-commitment-clock",
        "player-1",
      ),
      combatTarget: projectedString(player, "combat-target", "player-1"),
      targetLockActive: projectedBoolean(
        player,
        "target-lock-active",
        "player-1",
      ),
      targetSelectionSequence: projectedNumber(
        player,
        "target-selection-sequence",
        "player-1",
      ),
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

function showDamageNumber(amount: number, kind: string, critical: boolean): void {
  const damageNumber = element("enemy-damage-number");
  const kindClass =
    kind === "auto-attack"
      ? "damage-auto-attack"
      : kind === "pet"
        ? "damage-pet"
        : "damage-special";
  damageNumber.textContent = String(amount);
  damageNumber.className = `enemy-damage-number ${kindClass}${critical ? " critical" : ""}`;
  damageNumber.getBoundingClientRect();
  damageNumber.classList.add("active");
}

function boundedGameEvent(event: Record<string, unknown>): void {
  const events = window.__GREYWROUGHT_GAME_EVENTS__;
  events.push({ atMillis: Math.round(performance.now()), ...event });
  if (events.length > 512) events.shift();
}

function renderGameProjection(app: PlayApp, rawProjection: ProjectedValue): void {
  const projection = decodeGameProjection(rawProjection);
  const resident = app.residentLaw;
  const prior = resident.lastProjection;
  const ordinal = resident.admittedOrdinal + 1;
  const { player, enemy, bolt, loot, objective } = projection;
  const objectiveStatus = objectiveLabel(objective.state);
  const terminalFeedback = element("terminal-feedback");
  terminalFeedback.hidden = objectiveStatus === "playing";
  if (objectiveStatus === "failed") {
    element("terminal-feedback-kicker").textContent = "ENCOUNTER TERMINATED";
    element("terminal-feedback-title").textContent = "WAYFARER DISABLED";
    element("terminal-feedback-detail").textContent =
      "The corrupted magitek boar reduced your vitality to zero.";
    element("terminal-feedback-action").textContent =
      "PRESS R TO RESTORE THE REVISION";
  } else if (objectiveStatus === "completed") {
    element("terminal-feedback-kicker").textContent = "REVISION SECURED";
    element("terminal-feedback-title").textContent = "ASHEN KEY ADMITTED";
    element("terminal-feedback-detail").textContent =
      "The moonwell accepted the key and stabilized this world revision.";
    element("terminal-feedback-action").textContent =
      "PRESS R TO RUN THE ENCOUNTER AGAIN";
  }
  resident.admittedOrdinal = ordinal;

  app.scene.enemyNameplateProjection = {
    position: enemy.position,
    vitality: enemy.vitality,
    maximumVitality: enemy.maximumVitality,
    alive: enemy.combatStatus !== "dead",
  };
  app.scene.enemyNameplateFill.style.transform =
    `scaleX(${Math.max(0, Math.min(1, enemy.vitality / Math.max(0.001, enemy.maximumVitality)))})`;
  const hitStunVisible =
    enemy.pressureState === "hit-recovery" ||
    enemy.pressureState === "overrun-recovery";
  const hitStun = element("enemy-hit-stun");
  hitStun.hidden = !hitStunVisible;
  if (hitStunVisible) {
    const maximumTicks =
      enemy.pressureState === "overrun-recovery" ? 31 : 30;
    const remainingTicks = Math.max(
      0,
      Math.min(maximumTicks, enemy.recoveryClock),
    );
    hitStun.classList.toggle(
      "punishable",
      enemy.pressureState === "overrun-recovery",
    );
    hitStun.style.setProperty(
      "--stun-progress",
      String(remainingTicks / maximumTicks),
    );
    element("enemy-hit-stun-timer").textContent =
      (remainingTicks * 0.016).toFixed(2);
  }
  app.scene.enemyNameplate.setAttribute(
    "aria-label",
    `Corrupted Magitek Boar, ${enemy.vitality} of ${enemy.maximumVitality} health`,
  );
  app.scene.enemyNameplate.classList.toggle(
    "targeted",
    player.targetLockActive && player.combatTarget === "cinder-wraith",
  );

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
    wayfarerMotion: {
      moving:
        prior !== null &&
        (Math.abs(player.position.x - prior.player.position.x) > 0.0001 ||
          Math.abs(player.position.z - prior.player.position.z) > 0.0001),
      airborne: !player.grounded,
      directionX:
        prior === null ? 0 : player.position.x - prior.player.position.x,
      directionZ:
        prior === null ? 0 : player.position.z - prior.player.position.z,
    },
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
  if (
    enemy.pressureState === "approach" ||
    enemy.pressureState === "telegraph" ||
    enemy.pressureState === "charging"
  ) {
    faceSubjectToward(
      app.scene.presentation,
      "magitek-boar",
      enemy.pressureState === "approach" ? player.position : enemy.chargeEnd,
    );
  }
  const chargeCorridorVisible =
    enemy.pressureState === "telegraph" || enemy.chargeCommitted;
  if (chargeCorridorVisible) {
    const telegraphProgress = Math.max(
      0,
      Math.min(1, 1 - enemy.pressureClock / 63),
    );
    setChargeCorridor(
      app.scene.presentation,
      enemy.chargeStart,
      enemy.chargeEnd,
      enemy.chargeRadius,
      enemy.pressureState === "telegraph" ? telegraphProgress : 1,
      enemy.pressureState === "charging",
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
    gameEnemyCombatStatus: enemy.combatStatus,
    gameLootState: loot.state,
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
    gameSwordActionSequence: String(player.swordActionSequence),
    gameSwordCommitmentClock: String(player.swordCommitmentClock),
    gameCombatTarget: player.combatTarget,
    gameTargetLockActive: String(player.targetLockActive),
    gameTargetSelectionSequence: String(player.targetSelectionSequence),
    gameProjectileVisible: String(bolt.visible),
    gameEnemyPressure: enemy.pressureState,
    gamePressureClock: String(enemy.pressureClock),
    gameBoarRecoveryClock: String(enemy.recoveryClock),
    gameChargeCorridorVisible: String(chargeCorridorVisible),
    gameChargeTelegraphProgress: String(
      enemy.pressureState === "telegraph"
        ? Math.max(0, Math.min(1, 1 - enemy.pressureClock / 63))
        : enemy.pressureState === "charging"
          ? 1
          : 0,
    ),
  });

  if (prior !== null) {
    element("combat-feedback").textContent = "";
    if (player.swordActionSequence > prior.player.swordActionSequence) {
      const targetsEnemy =
        player.targetLockActive && player.combatTarget === "cinder-wraith";
      playWayfarerSwordAction(
        app.scene.presentation,
        targetsEnemy ? enemy.position.x - player.position.x : 0,
        targetsEnemy ? enemy.position.z - player.position.z : 0,
      );
      element("combat-feedback").textContent = "SWORD ACTION ADMITTED";
    }
    if (player.targetSelectionSequence > prior.player.targetSelectionSequence) {
      element("combat-feedback").textContent = "TARGET ACQUIRED · CORRUPTED MAGITEK BOAR";
    }
    if (enemy.vitality < prior.enemy.vitality) {
      const damage = prior.enemy.vitality - enemy.vitality;
      element("combat-feedback").textContent = `EMBER IMPACT · -${damage}`;
      signalImpact(
        app.scene.presentation,
        "cinder-wraith",
        ordinal,
        damage / Math.max(0.001, enemy.maximumVitality),
      );
      showDamageNumber(damage, "auto-attack", false);
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
    if (player.boosterEnergy < prior.player.boosterEnergy) {
      const spent = prior.player.boosterEnergy - player.boosterEnergy;
      const magnitude = Math.max(
        0.45,
        Math.min(1, spent / Math.max(1, player.boosterThreshold)),
      );
      signalPropulsion(
        app.scene.presentation,
        "ashen-wayfarer",
        ordinal,
        magnitude,
      );
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
    swordActionSequence: player.swordActionSequence,
    swordCommitmentClock: player.swordCommitmentClock,
    combatTarget: player.combatTarget,
    targetLockActive: player.targetLockActive,
    targetSelectionSequence: player.targetSelectionSequence,
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

function handleLifecycleReceipt(app: PlayApp, receipt: ResidentLifecycleReceipt): void {
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
  resident.generation = payload.generation;
  resident.pendingHot = payload.hot ? payload : null;
  document.body.dataset.residentGeneration = String(payload.generation);
  document.body.dataset.residentCompilerMicros = String(payload.compilerMicros);
  element("resident-law").textContent =
    `generation ${payload.generation} · checked\nresident compile ` +
    `${payload.compilerMicros} µs\nawaiting first admitted frame`;
  resident.worker.postMessage({ kind: "install-generation", payload });
}

function parseResidentProjectionFrame(value: unknown): string | readonly number[] {
  if (typeof value === "string") {
    for (let index = 0; index < value.length; index += 1) {
      requireCondition(
        value.charCodeAt(index) <= 255,
        `resident projection frame[${index}] must be a byte`,
      );
    }
    return value;
  }
  return requireArray(value, "resident projection frame").map((byte, index) => {
    const number = requireNumber(byte, `resident projection frame[${index}]`);
    requireCondition(
      Number.isSafeInteger(number) && number >= 0 && number <= 255,
      `resident projection frame[${index}] must be a byte`,
    );
    return number;
  });
}

function queueResidentProjectionFrame(
  app: PlayApp,
  frame: string | readonly number[],
): void {
  const resident = app.residentLaw;
  resident.pendingProjectionFrame = frame;
  if (resident.projectionFrameHandle !== 0) return;
  // Do not couple authoritative projection ingestion to RAF. RAF may be
  // throttled while a tab is backgrounded or a compositor is busy; a timer
  // keeps the latest admitted state and keyboard feedback flowing even then.
  resident.projectionFrameHandle = window.setTimeout(() => {
    resident.projectionFrameHandle = 0;
    const pending = resident.pendingProjectionFrame;
    resident.pendingProjectionFrame = null;
    if (pending === null) return;
    renderGameProjection(
      app,
      decodeProjectedTermFrame(parseResidentProjectionFrame(pending)),
    );
  }, 16);
}

function parseResidentReceipt(value: unknown): ResidentLifecycleReceipt {
  const receipt = requireForeignRecord(value, "resident lifecycle receipt");
  return {
    event: requireString(
      requireField(receipt, "event", "resident lifecycle receipt"),
      "resident lifecycle receipt.event",
    ),
    activeGeneration: requireNumber(
      requireField(receipt, "activeGeneration", "resident lifecycle receipt"),
      "resident lifecycle receipt.activeGeneration",
    ),
    operationId: requireNumber(
      requireField(receipt, "operationId", "resident lifecycle receipt"),
      "resident lifecycle receipt.operationId",
    ),
    detail: requireString(
      requireField(receipt, "detail", "resident lifecycle receipt"),
      "resident lifecycle receipt.detail",
    ),
  };
}

function bindResidentWorker(app: PlayApp, listeners: Array<() => void>): void {
  const { worker } = app.residentLaw;
  const message = (event: MessageEvent<unknown>): void => {
    try {
      const value = requireForeignRecord(event.data, "resident worker event");
      const kind = requireString(
        requireField(value, "kind", "resident worker event"),
        "resident worker event.kind",
      );
      if (kind === "projection-frame") {
        queueResidentProjectionFrame(
          app,
          parseResidentProjectionFrame(
            requireField(value, "frame", "resident worker event"),
          ),
        );
      } else if (kind === "receipt") {
        handleLifecycleReceipt(
          app,
          parseResidentReceipt(
            requireField(value, "receipt", "resident worker event"),
          ),
        );
      } else if (kind === "heartbeat") {
        boundedGameEvent({
          phase: "worker-heartbeat",
          workerTimeMillis: requireNumber(
            requireField(value, "workerTimeMillis", "resident worker heartbeat"),
            "resident worker heartbeat.workerTimeMillis",
          ),
        });
      } else if (kind === "failure") {
        residentLawFailure(
          requireString(
            requireField(value, "message", "resident worker event"),
            "resident worker event.message",
          ),
        );
      } else {
        throw new Error(`unknown resident worker event ${kind}`);
      }
    } catch (cause: unknown) {
      residentLawFailure(cause instanceof Error ? cause.message : String(cause));
    }
  };
  const error = (event: ErrorEvent): void => residentLawFailure(event.message);
  worker.addEventListener("message", message);
  worker.addEventListener("error", error);
  listeners.push(() => worker.removeEventListener("message", message));
  listeners.push(() => worker.removeEventListener("error", error));
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
  const now = performance.now();
  if (shell.lastFrameRenderedAt > 0 && now - shell.lastFrameRenderedAt > 250) {
    boundedGameEvent({
      phase: "frame-gap",
      gapMillis: Math.round(now - shell.lastFrameRenderedAt),
    });
  }
  shell.lastFrameRenderedAt = now;
  const { canvas, presentation } = shell;
  const renderStartedAt = performance.now();
  renderPresentationFrame(
    presentation,
    Date.now() / 1000,
    Math.max(1, Math.trunc(canvas.clientWidth)),
    Math.max(1, Math.trunc(canvas.clientHeight)),
  );
  const renderDuration = performance.now() - renderStartedAt;
  if (renderDuration > 100) {
    boundedGameEvent({
      phase: "render-stall",
      durationMillis: Math.round(renderDuration),
    });
  }
  renderEnemyNameplate(shell);
  boundedGameEvent({ phase: "frame-rendered" });
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
    gameCameraOrbitYaw: String(presentation.cameraOrbitYaw),
    gameCameraOrbitPitch: String(presentation.cameraOrbitPitch),
    gameCameraDistance: String(presentation.cameraDistance),
  });
  shell.frameHandle = requestAnimationFrame(() => renderLoop(shell));
}

function renderEnemyNameplate(shell: SceneShell): void {
  const admitted = shell.enemyNameplateProjection;
  if (admitted === null) {
    shell.enemyNameplate.hidden = true;
    return;
  }
  const projected = shell.enemyNameplateAnchor
    .set(admitted.position.x, admitted.position.y + 1.62, admitted.position.z)
    .project(shell.presentation.camera);
  const visible =
    projected.x >= -1 &&
    projected.x <= 1 &&
    projected.y >= -1 &&
    projected.y <= 1 &&
    projected.z >= -1 &&
    projected.z <= 1;
  const left = `${(projected.x * 0.5 + 0.5) * shell.canvas.clientWidth}px`;
  const top = `${(-projected.y * 0.5 + 0.5) * shell.canvas.clientHeight}px`;
  const damageNumber = element("enemy-damage-number");
  damageNumber.style.left = left;
  damageNumber.style.top = top;
  if (!admitted.alive || admitted.vitality <= 0) {
    shell.enemyNameplate.hidden = true;
    return;
  }
  shell.enemyNameplate.hidden = !visible;
  if (!visible) return;
  shell.enemyNameplate.style.left = left;
  shell.enemyNameplate.style.top = top;
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
  const enemyNameplate = element("enemy-nameplate");
  const enemyNameplateFill = element("enemy-nameplate-health-fill");
  let shell: SceneShell | null = null;
  let cameraPointer: Readonly<{
    pointerId: number;
    clientX: number;
    clientY: number;
  }> | null = null;
  const pointerHandler = (event: PointerEvent): void => {
    if (shell === null) return;
    focusScene(shell);
    if (event.button !== 0) return;
    event.preventDefault();
    cameraPointer = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
    };
    canvas.setPointerCapture(event.pointerId);
  };
  const pointerMoveHandler = (event: PointerEvent): void => {
    if (cameraPointer === null || cameraPointer.pointerId !== event.pointerId) {
      return;
    }
    event.preventDefault();
    orbitPresentationCamera(
      presentation,
      event.clientX - cameraPointer.clientX,
      event.clientY - cameraPointer.clientY,
    );
    cameraPointer = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
    };
  };
  const pointerReleaseHandler = (event: PointerEvent): void => {
    if (cameraPointer === null || cameraPointer.pointerId !== event.pointerId) {
      return;
    }
    cameraPointer = null;
    if (canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
  };
  const wheelHandler = (event: WheelEvent): void => {
    event.preventDefault();
    zoomPresentationCamera(presentation, event.deltaY);
  };
  shell = {
    presentation,
    canvas,
    pointerHandler,
    pointerMoveHandler,
    pointerReleaseHandler,
    wheelHandler,
    enemyNameplate,
    enemyNameplateFill,
    enemyNameplateAnchor: new Vector3(),
    enemyNameplateProjection: null,
    frameHandle: 0,
    lastFrameRenderedAt: 0,
    alive: true,
  };
  canvas.id = "world-canvas";
  canvas.tabIndex = 0;
  canvas.setAttribute("aria-label", "Greywrought semantic world");
  element("world-wrap").prepend(canvas);
  canvas.addEventListener("pointerdown", pointerHandler);
  canvas.addEventListener("pointermove", pointerMoveHandler);
  canvas.addEventListener("pointerup", pointerReleaseHandler);
  canvas.addEventListener("pointercancel", pointerReleaseHandler);
  canvas.addEventListener("wheel", wheelHandler, { passive: false });
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

function queueGameInput(app: PlayApp, input: ResidentInput): void {
  app.residentLaw.worker.postMessage({ kind: "input", input });
}

function observeGameKey(
  app: PlayApp,
  event: PhysicalKey,
  phase: "down" | "up",
): void {
  boundedGameEvent({
    phase: "keyboard-observed",
    code: event.code,
    inputPhase: phase,
    repeat: event.repeat,
  });
  queueGameInput(app, {
    kind: "keyboard",
    code: event.code,
    phase,
    repeat: event.repeat,
  });
}

function observeCameraBasis(app: PlayApp): void {
  const yaw = app.scene.presentation.cameraOrbitYaw;
  queueGameInput(app, {
    kind: "scalar-input",
    channel: "CameraForwardX",
    value: -Math.sin(yaw),
  });
  queueGameInput(app, {
    kind: "scalar-input",
    channel: "CameraForwardZ",
    value: -Math.cos(yaw),
  });
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
  "KeyJ",
  "Tab",
  "Space",
  "KeyR",
]);

function bindGameInput(app: PlayApp, listeners: Array<() => void>): void {
  const { canvas } = app.scene;
  const keyboardListenerOptions: AddEventListenerOptions = { capture: true };
  const heldKeys = new Set<string>();
  const down = (event: KeyboardEvent): void => {
    if (!event.repeat && gameKeys.has(event.code)) {
      event.preventDefault();
      if (heldGameKeys.has(event.code)) heldKeys.add(event.code);
      observeGameKey(
        app,
        {
          code: event.code === "Tab" && event.shiftKey ? "ShiftTab" : event.code,
          repeat: event.repeat,
        },
        "down",
      );
    }
  };
  const up = (event: KeyboardEvent): void => {
    if (heldGameKeys.has(event.code)) {
      event.preventDefault();
      heldKeys.delete(event.code);
      observeGameKey(app, event, "up");
    }
  };
  const releaseHeldKeys = (): void => {
    for (const code of heldKeys) {
      observeGameKey(app, { code, repeat: false }, "up");
    }
    heldKeys.clear();
  };
  const cameraBasis = (event: PointerEvent): void => {
    if ((event.buttons & 1) !== 0) observeCameraBasis(app);
  };
  // Keyboard control follows the active game page rather than canvas focus.
  // Camera/pointer capture remains canvas-local, but clicking another HUD
  // surface must not make ordinary WASD movement appear to stop.
  window.addEventListener("keydown", down, keyboardListenerOptions);
  window.addEventListener("keyup", up, keyboardListenerOptions);
  window.addEventListener("blur", releaseHeldKeys);
  document.addEventListener("visibilitychange", releaseHeldKeys);
  canvas.addEventListener("pointermove", cameraBasis);
  listeners.push(() =>
    window.removeEventListener("keydown", down, keyboardListenerOptions),
  );
  listeners.push(() =>
    window.removeEventListener("keyup", up, keyboardListenerOptions),
  );
  listeners.push(() => window.removeEventListener("blur", releaseHeldKeys));
  listeners.push(() =>
    document.removeEventListener("visibilitychange", releaseHeldKeys),
  );
  listeners.push(() => canvas.removeEventListener("pointermove", cameraBasis));
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
  if (app.residentLaw.projectionFrameHandle !== 0) {
    window.clearTimeout(app.residentLaw.projectionFrameHandle);
    app.residentLaw.projectionFrameHandle = 0;
  }
  app.residentLaw.pendingProjectionFrame = null;
  cancelAnimationFrame(app.scene.frameHandle);
  app.scene.canvas.removeEventListener("pointerdown", app.scene.pointerHandler);
  app.scene.canvas.removeEventListener(
    "pointermove",
    app.scene.pointerMoveHandler,
  );
  app.scene.canvas.removeEventListener(
    "pointerup",
    app.scene.pointerReleaseHandler,
  );
  app.scene.canvas.removeEventListener(
    "pointercancel",
    app.scene.pointerReleaseHandler,
  );
  app.scene.canvas.removeEventListener("wheel", app.scene.wheelHandler);
  for (const removeListener of app.listeners) removeListener();
  disposeCinderwakePresentation(app.scene.presentation);
  app.scene.canvas.remove();
  const processBranch = stageProcessBranch(app.stage);
  if (processBranch !== null) disposeProcessBranch(app.module, processBranch);
  app.effect.port.disposeSession(app.effect.session);
  app.residentLaw.worker.postMessage({ kind: "dispose" });
  app.residentLaw.worker.terminate();
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
  window.__GREYWROUGHT_RESIDENT_EVENTS__ = [];
  window.__GREYWROUGHT_GAME_EVENTS__ = [];
  const branchRequest = createExactProcessRequest(decodeCwr1Hex(branchSource));
  const occurrences = processRequestOccurrences(branchRequest);
  const effectRequest = createExactProcessRequest(decodeCwr1Hex(effectSource));
  const listeners: Array<() => void> = [];
  const app: PlayApp = {
    module,
    branchRequest,
    occurrences,
    effect: openEffectSession(module, effectRequest),
    residentLaw: openResidentLawSession(),
    stage: { kind: "dormant" },
    effectSettled: false,
    scene: createScene(),
    listeners,
  };
  bindResidentWorker(app, listeners);
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
  }, 50);
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
