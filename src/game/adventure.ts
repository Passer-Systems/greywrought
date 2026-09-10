import { moveLocomotion, moveManeuverPosition, startJump, blockedPosition, MOVEMENT_BARRIERS, THICKET, type Barrier, type MovementFrame, type MovementCheckpoint } from "./movement.js";
import type { CharacterArchetype } from "../host/character-profile.js";
import { YARD, QUESTS, GEAR, gearName, type QuestId, type QuestOperation, type QuestView, type ProgressionView, type GearSlot, type GearItemId } from "./yard-content.js";
import type {
  AdventureAction, AdventureGame, AdventureOptions, AdventureSnapshot, AdventureLogEntry, SharedAdventure,
  CorpseLootView, PlaceView, Position, ThreatPhase, ThreatView, ThreatAbilityView, MonsterLoreEntry, ThreatForecastEntry, CombatAction, CombatMove, QueuedCombatAction, CombatView,
} from "./adventure-types.js";
import { classAction, classKit } from "./class-kit.js";

type Vector = { x: number; y: number; z: number };
type Phase = AdventureSnapshot["phase"];
export const COMBAT_RULES = {
  actionCooldown: 1,
  window: { active: 3, choosing: 1, preparation: 5, actionSlots: 3, maximumActions: 3 },
  stamina: { maximum: 5, recoverySeconds: 5 },
  bloodRage: { cost: 1, maximum: 3, damagePerStack: 4, drainPerStack: 1, drainSeconds: 5, decaySeconds: 2, recovery: 2 },
  strike: { damage: 9, range: 6.5, rangedRange: 10, stopDistance: 1.5, duration: 0.25, cost: 1 },
  disengage: { damage: 6, range: 3.5, distance: 5, duration: 0.8, cost: 1 },
  brace: { block: 24, duration: 2, cost: 2 },
  jab: { damage: 3, range: 2, cost: 0 },
  guard: { block: 2, duration: 1, cost: 0 },
  drinkPotion: { cost: 1, recovery: 1 },
  enemy: { preparation: 5, action: 0.65, recovery: 2 },
  head: { beamDamage: 8, fireballDamage: 18, fireballTravel: 0.9, fireballSpacing: 0.2, warning: 5, ward: 6, wardDuration: 2, kindleDuration: 5 },
  wolf: { circleRange: 5.5, circleRadius: 4.5, circleSpeed: 1.5, lungeDistance: 8, lungeHeight: 0.9, impactRadius: 2 },
} as const;
export const MARA_TRADE_RULES = { suppliesPerPotion: 3, suppliesPerPotionSold: 2 } as const;
export const WORLD_RESPAWN_MILLISECONDS = 120_000;
interface Maneuver {
  kind: "lunge" | "disengage"; targetId: string; remainingSeconds: number;
  start: Vector; destination: Vector; facing: Vector;
}
interface WolfMotion {
  kind: "lunge"; start: Vector; destination: Vector;
  remainingSeconds: number; duration: number;
}
interface WolfState {
  facing: Vector; motion: WolfMotion | null;
  nextAttackSeconds: number; circling: boolean; attackOrigin: Vector;
}
type HeadAbilityId = "ember-beam" | "fireball" | "ember-ward" | "kindle";
interface HeadEvent { offsetSeconds: number; spacing: number; ability: HeadAbilityId; remainingSeconds: number; status: "pending" | "active" | "done"; volley: number; launched: number; }
interface HeadState {
  opened: boolean; events: HeadEvent[];
  block: number; blockSeconds: number;
  volley: number; projectileSequence: number;
  fireballs: { impactOffset: number; id: number; origin: Vector; remainingSeconds: number; duration: number; damage: number }[];
}
interface ThreatDefinition {
  id: string; name: string; level: number; position: Position; health: number; behavior?: "wolf" | "head";
  preparation: string; intention: string; damage: number; reach: number; benefit: string;
  disposition: ThreatView["disposition"]; aggroRange: number; leash: number; speed: number; pursuitSpeed?: number; patrol?: readonly Position[];
}
interface ThreatState {
  id: string; health: number; active: boolean; phase: ThreatPhase;
  contributors: string[]; rollClaims: string[]; shield: number;
  respawnAt: number | null;
  rng: number;
  joinCycle: number; windowCycle: number; specialOffset: number; specialLaunched: boolean; specialResolved: boolean;
  remainingSeconds: number; actionSequence: number; lastActionHit: boolean; damage: number;
  position: Vector; targetPosition: Vector; targetPlayerId: string | null; aggro: boolean; lootClaimed: boolean;
  patrolIndex: number; moving: boolean; abilityIndex: number;
  wolf: WolfState | null; head: HeadState | null;
}
type Mutable<T> = { -readonly [K in keyof T]: T[K] };
type QueueEntry = Mutable<QueuedCombatAction>;
interface CombatClock { phase: CombatView["phase"]; elapsedSeconds: number; cycle: number; }
interface CombatState { clock: CombatClock; queued: QueueEntry[]; nextId: number; }
interface WorldState {
  threats: ThreatState[]; resourceRemaining: number; ritualCalled: boolean;
  resourceRespawns: { at: number; quantity: number }[];
}
interface SharedContext {
  world: WorldState; clock: CombatClock;
  now: () => number;
  online: Map<string, Adventure>;
  characters: Map<string, Adventure>;
}
const newClock = (): CombatClock => ({ phase: "idle", elapsedSeconds: 0, cycle: 0 });
const newCombat = (clock = newClock()): CombatState => ({ clock, queued: [], nextId: 1 });
interface ChapterState {
  accepted: QuestId[]; completed: QuestId[]; scoutDefeated: boolean;
  level: number; ownedGear: GearItemId[]; equipment: Record<GearSlot, GearItemId | null>;
}
const newChapter = (): ChapterState => ({ accepted: [], completed: [], scoutDefeated: false, level: 1, ownedGear: [], equipment: { chest: null, mainhand: null } });
interface State {
  chapter: ChapterState;
  combat: CombatState; world: WorldState;
  phase: Phase; archetype: CharacterArchetype; position: Vector; verticalSpeed: number;
  health: number; supplies: number; cargo: number;
  potions: number; carriedRelics: number; bankedRelics: number; presence: number; carriedSalvage: number;
  actionCooldown: number; currentAction: AdventureAction | "equip" | null; actionDuration: number; guardSeconds: number;
  block: number; stamina: number; staminaRecoverySeconds: number; bloodRage: number; rageDrainSeconds: number; rageDecaySeconds: number; maneuver: Maneuver | null;
  attackSequence: number; selectedThreat: string; report: string;
}

type SavedState = Omit<State, "world" | "combat"> & WorldState & {
  combat: CombatClock & Pick<CombatState, "queued" | "nextId">;
};
function savedState(state: State): SavedState {
  const { world, combat, ...player } = state;
  return { ...player, ...world, combat: { ...combat.clock, queued: combat.queued, nextId: combat.nextId } };
}

const point = (x: number, z: number): Vector => ({ x, y: 0, z });
const DEFINITIONS: readonly ThreatDefinition[] = [
  { id: "scout", level: 1, behavior: "head", disposition: "hostile", aggroRange: 6, leash: 14, speed: 1.6, name: "Cinder Watchman", position: point(-3,10), health: 96,
    patrol: [point(-3,10), point(-5,12), point(-3,14), point(-1,12)],
    preparation: "Gathering fire", intention: "Fireball", damage: 3, reach: 10,
    benefit: "Clear the Cinder Watchman to make the first clearing safer." },
  { id: "nest", level: 2, disposition: "neutral", aggroRange: 0, leash: 18, speed: 1.1, pursuitSpeed: 4.8, name: "Briar bee", position: point(1, 20), health: 72,
    patrol: [point(1,20), point(-0.5,22), point(1,24.5), point(1.5,18)],
    preparation: "Enraged wings gathering", intention: "Enraged Swarm", damage: 16, reach: 3,
    benefit: "Defeat the bee to make the briar passage safer." },
  { id: "warder", level: 3, disposition: "hostile", aggroRange: 8, leash: 11, speed: 2, name: "Cablekeeper", position: point(-3, 30), health: 72,
    patrol: [point(-3,30), point(-5,27), point(-1,30), point(-3,33)],
    preparation: "Raising thorn wards", intention: "Thorn lash", damage: 18, reach: 5,
    benefit: "Clear the warder to gather coolant crystals without cutting thorns." },
  { id: "patrol", level: 2, behavior: "wolf", disposition: "hostile", aggroRange: 6, leash: 30, speed: 4.2, name: "Ash hound", position: point(-6,24), health: 72,
    patrol: [point(-6,24), point(-9,24), point(-9,28), point(-6,28)],
    preparation: "Drawing back to pounce", intention: "Lunging Maul", damage: 4, reach: 2,
    benefit: "Clear the hound to make the deeper trail safer." },
  { id: "ritual-guardian", level: 4, disposition: "hostile", aggroRange: 8, leash: 11, speed: 2.2, name: "Foreman Nine", position: point(2, 40), health: 200,
    patrol: [point(2,40), point(0,38), point(-2,40), point(0,42)],
    preparation: "Charging the works", intention: "Roll-call Pulse", damage: 32, reach: 3.5,
    benefit: "Defeat the called guardian, then carry its Last Shift Roll home." },
];
const PLACES: readonly PlaceView[] = [
  { id: "hearthstead", name: YARD.settlement, position: point(0, -8), kind: "town" },
  { id: "forest-gate", name: YARD.gate, position: point(0, 0), kind: "gate" },
  { id: "frost-cores", name: YARD.resource, position: point(-2, 12), kind: "resource" },
  { id: "ritual-site", name: YARD.works, position: point(2, 40), kind: "ritual" },
  { id: "mara", name: "Mara / Apothecary", position: point(3.4, -7.5), kind: "shop" },
  { id: "inn", name: `Rowan / ${YARD.inn}`, position: point(5, -11), kind: "inn" },
];
const PHASE_SECONDS: Record<ThreatPhase, number> = {
  dormant: 0, patrol: 0, approach: 0, ...COMBAT_RULES.enemy, returning: 0, cleared: 0,
};
const OTHER_PHASE_SECONDS: Record<ThreatPhase, number> = { ...PHASE_SECONDS, preparation: 3, action: 0.35, recovery: 2.65 };
const EPSILON = 1e-9;
const distance = (a: Position, b: Position): number => Math.hypot(a.x - b.x, a.z - b.z);
const definition = (id: string): ThreatDefinition => {
  const found = DEFINITIONS.find(t => t.id === id);
  if (!found) throw new Error(`Unknown threat: ${id}`);
  return found;
};
const newWolf = (): WolfState => ({ facing: point(0, 1), motion: null,
  nextAttackSeconds: COMBAT_RULES.enemy.preparation, circling: false, attackOrigin: point(-3, 10),
});
const newHead = (): HeadState => ({ opened: false, events: [], block: 0, blockSeconds: 0, volley: 1, projectileSequence: 0, fireballs: [] });
const newThreat = (t: ThreatDefinition): ThreatState => ({
  id: t.id, health: t.health, active: t.id !== "ritual-guardian", phase: t.patrol && t.id !== "ritual-guardian" ? "patrol" : "dormant",
  contributors: [], rollClaims: [], shield: 0,
  respawnAt: null,
  rng: crypto.getRandomValues(new Uint32Array(1))[0]!,
  joinCycle: 0, windowCycle: 0, specialOffset: 0, specialLaunched: false, specialResolved: false,
  remainingSeconds: 0, actionSequence: 0, lastActionHit: false, damage: t.behavior === "wolf" ? 18 : t.damage,
  position: { ...t.position }, targetPosition: { ...t.position }, targetPlayerId: null, aggro: false,
  lootClaimed: false, patrolIndex: 1, moving: false, abilityIndex: 0,
  wolf: t.behavior === "wolf" ? { ...newWolf(), attackOrigin: { ...t.position } } : null, head: t.behavior === "head" ? newHead() : null,
});
const newThreats = (): ThreatState[] => DEFINITIONS.map(newThreat);
function refreshWorld(world: WorldState, now: number): void {
  for (const threat of world.threats) {
    if (threat.id !== "ritual-guardian" && threat.health === 0 && threat.respawnAt !== null && threat.respawnAt <= now) {
      Object.assign(threat, newThreat(definition(threat.id)));
    }
  }
  for (const batch of world.resourceRespawns) if (batch.at <= now) world.resourceRemaining += batch.quantity;
  world.resourceRemaining = Math.min(12, world.resourceRemaining);
  world.resourceRespawns = world.resourceRespawns.filter(batch => batch.at > now);
}
function seedForThreat(id: string): number {
  let seed = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) seed = Math.imul(seed ^ id.charCodeAt(i), 0x01000193) >>> 0;
  return seed || 1;
}
function nextThreatRandom(t: ThreatState): number {
  t.rng = (Math.imul(t.rng, 1664525) + 1013904223) >>> 0;
  return t.rng / 0x100000000;
}
function initialState(archetype: CharacterArchetype): State {
  return {
    chapter: newChapter(), phase: "town", archetype, position: point(0, -8), verticalSpeed: 0, health: 100,
    supplies: 15, cargo: 0, potions: 0, carriedRelics: 0,
    bankedRelics: 0, carriedSalvage: 0, presence: 0, actionCooldown: 0, currentAction: null, actionDuration: 0,
    guardSeconds: 0, block: 0, stamina: 5, staminaRecoverySeconds: 0, bloodRage: 0, rageDrainSeconds: 0, rageDecaySeconds: 0, maneuver: null,
    attackSequence: 0, selectedThreat: "scout",
    report: "Visit Mara for potions, then take the north gate. Gather coolant crystals and return alive.",
    world: { threats: newThreats(), resourceRemaining: 12, resourceRespawns: [], ritualCalled: false }, combat: newCombat(),
  };
}

class Adventure implements AdventureGame {
  private state: State;
  private held = new Set<AdventureAction>();
  private mouseForward = false;
  private movementFrames: MovementFrame[] | null = null;
  private movementSequence = 0;
  private movementElapsed = 0;
  get movementCheckpoint(): MovementCheckpoint {
    const maneuver = this.state.maneuver;
    return { sequence: this.movementSequence, elapsed: this.movementElapsed, verticalSpeed: this.state.verticalSpeed,
      maneuver: maneuver ? { ...maneuver, duration: maneuver.kind === 'lunge' ? COMBAT_RULES.strike.duration : COMBAT_RULES.disengage.duration } : null };
  }
  enableNetworkMovement(enabled = true): void { this.movementFrames = enabled ? [] : null; this.movementSequence = 0; this.movementElapsed = 0; }
  enqueueMovement(frames: readonly MovementFrame[]): boolean {
    if (!this.movementFrames) this.enableNetworkMovement();
    if (this.movementFrames!.reduce((sum, frame) => sum + frame.seconds, 0) + frames.reduce((sum, frame) => sum + frame.seconds, 0) > 2) return false;
    for (const frame of frames) if (frame.sequence > (this.movementFrames!.at(-1)?.sequence ?? this.movementSequence)) this.movementFrames!.push(frame);
    return true;
  }
  private cameraForward = point(0, 1);
  private moving = false;
  private backpedaling = false;
  private shopOpen = false;
  private trade: { kind: "supplies" | "potions"; quantity: number } | null = null;
  private innOpen = false;
  private readonly events: AdventureLogEntry[] = [];
  private eventId = 0;
  private lootOpenId: string | null = null;

  static sharedAdventure(options: Pick<AdventureOptions, "save" | "now">): SharedAdventure {
    const context: SharedContext = { world: initialState("warrior").world, clock: newClock(), now: options.now ?? Date.now, online: new Map(), characters: new Map() };
    const characters = new Map<string, { name: string; game: Adventure }>();
    if (options.save !== undefined) {
      const root = record(JSON.parse(options.save));
      if (root.version !== 1 || root.kind !== "shared-adventure" || !Array.isArray(root.characters)) throw new Error("Unsupported shared adventure save.");
      const world = record(root.world), clock = record(root.clock);
      const template = savedState(initialState("warrior"));
      const restored = readSave(JSON.stringify({ version: 9, state: { ...template, ...world, phase: "expedition", combat: { ...clock, queued: [], nextId: 1 } } }), context.now());
      context.world = restored.world; context.clock = restored.combat.clock;
      for (const value of root.characters) {
        const entry = record(value), id = text(entry.id), name = text(entry.name), state = record(entry.state), queue = record(state.combat);
        if (!id || characters.has(id)) throw new Error("Invalid shared character identity.");
        const game = new Adventure({}, context, id);
        game.state = readSave(JSON.stringify({ version: 9, state: {
          ...state, ...world, combat: { ...(state.phase === "expedition" ? clock : newClock()), ...queue },
        } }), context.now());
        game.state.world = context.world; game.state.combat.clock = context.clock;
        characters.set(id, { name, game });
        context.characters.set(id, game);
      }
    }
    const refresh = () => {
      refreshWorld(context.world, context.now());
      for (const { game } of characters.values()) game.closeMissingLoot();
    };
    refresh();
    const retarget = (driver: Adventure, t: ThreatState): Adventure | undefined => {
      const target = driver.chooseTarget(t);
      if (t.aggro && target) t.targetPlayerId = target.playerId;
      return target;
    };
    return {
      join(id, name, archetype) {
        refresh();
        if (!id || !name.trim()) throw new Error("A character needs an identity and name.");
        let entry = characters.get(id);
        if (!entry) {
          entry = { name, game: new Adventure({ archetype }, context, id) };
          characters.set(id, entry);
          context.characters.set(id, entry.game);
        } else if (entry.game.state.archetype !== archetype) throw new Error("The saved character has a different calling.");
        entry.name = name;
        context.online.set(id, entry.game);
        return entry.game;
      },
      leave(id) {
        const game = context.online.get(id);
        if (!game) return;
        game.held.clear(); game.mouseForward = false; game.moving = false; game.backpedaling = false;
        game.state.combat.queued = [];
        context.online.delete(id);
      },
      getPlayer(id) { return context.online.get(id); },
      players() { return [...context.online].map(([id, game]) => ({ id, name: characters.get(id)!.name, player: game.snapshot.player })); },
      advance(seconds) {
        if (!Number.isFinite(seconds) || seconds < 0) throw new Error("Elapsed time must be finite and nonnegative.");
        refresh();
        const players = [...context.online.values()], driver = players[0];
        if (!driver) return;
        let remaining = seconds;
        while (remaining > EPSILON) {
          const running = context.clock.phase !== "idle";
          const phaseRemaining = context.clock.phase === "idle" ? Infinity : COMBAT_RULES.window[context.clock.phase] - context.clock.elapsedSeconds;
          const dt = Math.min(remaining, 1 / 60, phaseRemaining, ...players.map(p => p.nextEventDelay()));
          for (const player of players) player.stepPlayer(dt);
          if (running && context.clock.phase !== "idle") driver.advanceClock(dt);
          for (const t of context.world.threats) {
            t.moving = false;
            const target = retarget(driver, t);
            if (t.aggro && !target) driver.releaseThreat(t);
            else (target ?? driver).acquireOrRelease(t, dt);
          }
          for (const player of players) player.startQueuedCombat();
          // Every character's defense resolves before any enemy's attack on this beat.
          for (const player of players) player.executeQueue();
          for (const t of context.world.threats) {
            const target = retarget(driver, t);
            if (t.aggro && t.active && t.health > 0 && target) target.advanceThreat(t, dt);
            else if (t.aggro && !target) driver.releaseThreat(t);
          }
          driver.finishCombat();
          remaining -= dt;
        }
      },
      save() {
        refresh();
        return JSON.stringify({ version: 1, kind: "shared-adventure", world: context.world, clock: context.clock,
          characters: [...characters].map(([id, { name, game }]) => {
            const { world, combat, ...player } = game.state;
            return { id, name, state: { ...player, combat: { queued: combat.queued, nextId: combat.nextId } } };
          }),
        });
      },
    };
  }

  private readonly now: () => number;
  constructor(options: AdventureOptions, private readonly shared?: SharedContext, private readonly playerId: string | null = null) {
    this.now = shared?.now ?? options.now ?? Date.now;
    this.state = options.save === undefined ? initialState(options.archetype ?? "warrior") : readSave(options.save, this.now());
    if (shared) { this.state.world = shared.world; this.state.combat.clock = shared.clock; }
    else refreshWorld(this.state.world, this.now());
    if (options.archetype !== undefined && options.archetype !== this.state.archetype) {
      throw new Error("The saved character has a different calling.");
    }
    if (!shared && this.state.combat.clock.phase === "preparation") for (const t of this.state.world.threats) if (t.aggro && t.windowCycle === 0) this.planWindow(t, this.state.combat.clock.cycle + 1);
    this.appendLog(options.save === undefined ? "Welcome to Nine-Bell Yard. Visit Mara for potions or Rowan at the inn to rest." : "Welcome back. Your journey has been restored.");
  }

  get snapshot(): AdventureSnapshot {
    const s = this.state;
    return {
      quests: this.questViews(), progression: this.progression(),
      phase: s.phase, combat: { phase: s.combat.clock.phase, elapsedSeconds: s.combat.clock.elapsedSeconds, cycle: s.combat.clock.cycle,
        remainingSeconds: this.nextWindowSeconds(), queued: s.combat.queued.map(e => ({ ...e })),
        reservedStamina: this.reservedStamina(), availableStamina: s.stamina - this.reservedStamina() },
      player: {
        position: { ...s.position }, cameraForward: { ...this.cameraForward }, archetype: s.archetype,
        health: s.health, maximumHealth: 100, grounded: s.position.y === 0,
        moving: this.moving, backpedaling: this.backpedaling, attackSequence: s.attackSequence,
        actionCooldown: s.actionCooldown, currentAction: s.currentAction, actionDuration: s.actionDuration, guardSeconds: s.guardSeconds,
        block: s.block, stamina: s.stamina, maximumStamina: COMBAT_RULES.stamina.maximum, staminaRecoverySeconds: s.stamina < 5 && s.combat.clock.phase === "active" ? COMBAT_RULES.window.active - s.combat.clock.elapsedSeconds : 0,
        bloodRage: s.bloodRage, rageDrainSeconds: s.rageDrainSeconds, rageDecaySeconds: s.rageDecaySeconds, inCombat: this.inCombat(), maneuver: s.maneuver?.kind ?? "none",
        maneuverSeconds: s.maneuver?.remainingSeconds ?? 0, facing: { ...(s.maneuver?.facing ?? this.cameraForward) },
      },
      threats: s.world.threats.map((t): ThreatView => {
        const d = definition(t.id);
        return {
          ...t, name: d.name, level: d.level, position: { ...t.position }, homePosition: { ...d.position },
          joinsNextWindow: t.aggro && t.joinCycle > s.combat.clock.cycle, disposition: d.disposition, moving: s.phase !== "lost" && t.moving, maximumHealth: d.health,
          movementMode: this.movementMode(t), motionProgress: t.wolf?.motion ? 1 - t.wolf.motion.remainingSeconds / t.wolf.motion.duration : 0,
          facing: { ...(t.wolf?.facing ?? this.direction(t.position, t.aggro ? (this.targetPlayer(t)?.state.position ?? s.position) : t.targetPosition)) },
          nextAttackSeconds: t.wolf?.nextAttackSeconds ?? t.remainingSeconds,
          attackOrigin: { ...(t.wolf && t.phase === "action" && t.abilityIndex === 1 ? t.wolf.attackOrigin : t.position), y: 0 },
          block: t.head?.block ?? t.shield, blockSeconds: t.head?.blockSeconds ?? (t.shield > 0 ? this.nextWindowSeconds() : 0), volley: t.head?.volley ?? 0, fireballs: t.head?.fireballs.map(p => ({ ...p, origin: { ...p.origin } })) ?? [],
          rootedSeconds: this.rootedSeconds(t), canStrike: this.canUseAttack(t, "strike"), canDisengage: this.canUseAttack(t, "disengage"),
          selected: t.id === s.selectedThreat, phaseDuration: this.phaseDuration(t),
          preparation: d.preparation, currentActivity: this.currentActivity(t),
          windowAction: !t.aggro || s.combat.clock.phase === "choosing" || t.windowCycle < t.joinCycle ? null : t.head ? t.head.events[0] ? {
            ability: headAbility(t.head.events[0].ability, t.head.events[0].volley), offsetSeconds: t.head.events[0].offsetSeconds,
            status: t.head.events[0].status === "done" ? "resolved" : t.head.events[0].status,
          } : null : { ability: this.ability(t), offsetSeconds: t.specialOffset, status: t.specialResolved ? "resolved" : t.specialLaunched ? "active" : "pending" },
          forecast: this.forecast(t), currentAbility: this.ability(t), nextAbility: this.ability(t, true),
          intention: this.intention(t), damage: t.damage, reach: this.ability(t).range,
          benefit: d.benefit, targetPosition: { ...t.targetPosition },
        };
      }),
      loot: s.world.threats.filter(t => t.health === 0).map((t): CorpseLootView => ({
        sourceId: t.id, sourceName: definition(t.id).name, position: { ...t.position },
        itemName: t.id === "ritual-guardian" ? "Last Shift Roll" : "Forest salvage",
        kind: t.id === "ritual-guardian" ? "relic" : "salvage", quantity: 1,
        available: this.lootAvailable(t), reachable: this.canLoot(t),
      })),
      lootOpenId: this.lootOpenId, carriedSalvage: s.carriedSalvage,
      places: PLACES.map(p => ({ ...p, position: { ...p.position } })),
      selectedThreat: s.selectedThreat, supplies: s.supplies, cargo: s.cargo,
      resourceRemaining: s.world.resourceRemaining, potions: s.potions, carriedRelics: s.carriedRelics,
      bankedRelics: s.bankedRelics, presence: s.presence, ritualCalled: s.world.ritualCalled,
      shopOpen: this.shopOpen, trade: this.tradeView(), innOpen: this.innOpen, log: this.events.map(entry => ({ ...entry })), potionPrice: MARA_TRADE_RULES.suppliesPerPotion, potionHealing: 30, report: s.report,
    };
  }

  save(): string { return JSON.stringify({ version: 9, state: savedState(this.state) }); }
  private progression(): ProgressionView {
    const c = this.state.chapter;
    const gear = Object.values(c.equipment).filter((id): id is GearItemId => id !== null);
    return { level: c.level, ownedGear: [...c.ownedGear], equipment: { ...c.equipment },
      unlockedActions: ["strike", "brace", "drinkPotion", ...(c.completed.includes("roll-call") ? ["disengage" as const] : []), ...(c.completed.includes("last-shift") ? ["bloodRage" as const] : [])],
      attackBonus: (c.level - 1) * 2 + gear.reduce((sum, id) => sum + GEAR[id].attackBonus, 0),
      damageReduction: gear.reduce((sum, id) => sum + GEAR[id].damageReduction, 0) };
  }
  private actionUnlocked(action: CombatMove["action"]): boolean {
    return action !== "disengage" && action !== "bloodRage" || this.progression().unlockedActions.includes(action);
  }
  private questViews(): QuestView[] {
    const s = this.state, c = s.chapter;
    return QUESTS.map(q => {
      const completed = c.completed.includes(q.id), accepted = c.accepted.includes(q.id);
      const progress = completed ? q.required : !accepted ? 0 : q.id === "cold-hands" ? Math.min(s.cargo, q.required) : q.id === "roll-call" ? Number(c.scoutDefeated) : Math.min(s.carriedRelics, 1);
      const status = completed ? "completed" : accepted ? progress >= q.required ? "ready" : "active" : q.prerequisite && !c.completed.includes(q.prerequisite) ? "locked" : "available";
      const nearby = s.phase === "town" && this.near(q.giver, 2.5);
      return { id: q.id, status, progress, required: q.required, canAccept: nearby && status === "available", canTurnIn: nearby && status === "ready" };
    });
  }
  interactNpc(id: "mara" | "inn"): void {
    if (this.state.phase === "lost") return;
    if (this.state.phase !== "town" || !this.near(id, 2.5)) {
      this.report(`Move closer to ${id === "mara" ? "Mara" : "Rowan"} to talk.`);
      return;
    }
    this.lootOpenId = null;
    this.trade = null;
    this.shopOpen = id === "mara";
    this.innOpen = id === "inn";
    this.report(id === "mara" ? "Mara says: A little preparation goes a long way."
      : `Rowan says: Welcome to ${YARD.inn}. Come warm yourself by the hearth; rest is on the house.`);
  }
  quest(id: QuestId, operation: QuestOperation): void {
    const q = QUESTS.find(q => q.id === id), view = this.questViews().find(q => q.id === id);
    if (!q || !view) return;
    if (operation === "accept") {
      if (!view.canAccept) { this.report(`Speak to ${q.giverName} to accept an available task.`); return; }
      this.state.chapter.accepted.push(id); this.report(q.offer); return;
    }
    if (operation !== "turnIn" || !view.canTurnIn) { this.report(`Bring word and requested items back to ${q.giverName}.`); return; }
    const s = this.state, c = s.chapter;
    if (id === "cold-hands") s.cargo -= q.required;
    if (id === "last-shift") { s.carriedRelics--; s.bankedRelics++; }
    c.completed.push(id); c.level = Math.max(c.level, q.reward.level);
    s.potions += q.reward.potions; s.supplies += q.reward.supplies;
    if (q.reward.gear && !c.ownedGear.includes(q.reward.gear)) c.ownedGear.push(q.reward.gear);
    this.report(q.completion);
  }
  equip(slot: GearSlot, item: GearItemId | null): void {
    const s = this.state;
    if (s.phase === "lost" || !(slot === "chest" || slot === "mainhand")) return;
    if (item !== null && (!Object.hasOwn(GEAR, item) || !s.chapter.ownedGear.includes(item) || GEAR[item].slot !== slot)) return;
    if (s.phase === "expedition" && (this.inCombat() || s.combat.clock.phase !== "idle")) {
      this.queueAction({ action: "equip", gear: { slot, item } });
      return;
    }
    s.chapter.equipment[slot] = item;
  }
  private tradeView() {
    if (!this.trade || !this.shopOpen || this.state.phase !== "town" || !this.near("mara", 2.5)) return null;
    const { kind, quantity } = this.trade;
    const step = kind === "supplies" ? MARA_TRADE_RULES.suppliesPerPotion : 1;
    const available = kind === "supplies" ? this.state.supplies : this.state.potions;
    const receivedQuantity = kind === "supplies" ? Math.floor(quantity / MARA_TRADE_RULES.suppliesPerPotion) : quantity * MARA_TRADE_RULES.suppliesPerPotionSold;
    const canAccept = quantity >= step && (kind === "supplies" ? quantity % 3 === 0 && quantity <= available : quantity <= available);
    const reason = canAccept ? "Mara is ready to make this trade." : kind === "supplies" ? (available < step ? "You do not have enough supplies." : "Offer a multiple of 3 supplies.") : "You have no potions to offer.";
    return { kind, quantity, receivedQuantity, available, canAccept, reason, step } as const;
  }
  setTradeOffer(kind: "supplies" | "potions", quantity: number): void {
    if (!this.shopOpen || !this.near("mara", 2.5) || this.state.phase !== "town") return;
    const step = kind === "supplies" ? MARA_TRADE_RULES.suppliesPerPotion : 1;
    const available = kind === "supplies" ? this.state.supplies : this.state.potions;
    const max = kind === "supplies" ? Math.floor(available / step) * step : available;
    this.trade = { kind, quantity: Math.max(step, Math.min(max || step, Math.floor(quantity / step) * step)) };
  }
  private report(text: string, channel: AdventureLogEntry["channel"] = "chat"): void {
    this.state.report = text;
    this.appendLog(text, channel);
  }
  private appendLog(text: string, channel: AdventureLogEntry["channel"] = "chat"): void {
    this.events.push({ id: ++this.eventId, channel, text });
    if (this.events.length > 200) this.events.shift();
  }

  setCameraForward(x: number, z: number): void {
    if (!Number.isFinite(x) || !Number.isFinite(z)) throw new Error("Camera direction must be finite.");
    const length = Math.hypot(x, z);
    if (length > EPSILON) this.cameraForward = point(x / length, z / length);
  }
  setMouseForward(active: boolean): void { this.mouseForward = active; }
  selectTarget(id: string): void {
    definition(id);
    if (this.state.selectedThreat !== id) this.clearQueuedActions();
    this.state.selectedThreat = id;
  }
  private reservedStamina(): number {
    return this.state.combat.queued.filter(e => e.status === "pending").reduce((sum, e) => sum + e.cost, 0);
  }
  private recoveryFor(action: CombatMove["action"]): number { return action === "bloodRage" ? COMBAT_RULES.bloodRage.recovery : COMBAT_RULES.actionCooldown; }
  private actionCost(action: CombatMove["action"]): number {
    if (action === "equip") return 0;
    return classAction(this.state.archetype, action).cost ?? COMBAT_RULES[action].cost;
  }
  private queueAction(input: CombatAction | Extract<CombatMove, { action: "equip" }>): void {
    const move: CombatMove = typeof input === "string" ? { action: input } : input;
    const action = move.action;
    if (!this.actionUnlocked(action)) { this.report("Complete Rowan’s lessons to learn that move.", "combat"); return; }
    const s = this.state, c = s.combat, cost = this.actionCost(action);
    if (c.queued.length >= COMBAT_RULES.window.maximumActions) { this.report("Three moves already fill this plan.", "combat"); return; }
    if (s.stamina - this.reservedStamina() < cost) {
      this.report(`${actionName(action, s.archetype)} needs ${cost} stamina; ${s.stamina - this.reservedStamina()} free. Use Jab or Guard for 0 stamina, or remove a queued move.`, "combat"); return;
    }
    if (action === "drinkPotion" && c.queued.filter(e => e.action === "drinkPotion" && e.status === "pending").length >= s.potions) { this.report("No unreserved health potion is available.", "combat"); return; }
    const earliest = c.clock.phase === "active" ? c.clock.elapsedSeconds + s.actionCooldown : 0;
    let offsetSeconds = Math.max(0, Math.ceil(earliest - EPSILON));
    for (; offsetSeconds < COMBAT_RULES.window.actionSlots; offsetSeconds++) {
      const fits = c.queued.every(entry => entry.offsetSeconds < offsetSeconds
        ? entry.offsetSeconds + this.recoveryFor(entry.action) <= offsetSeconds + EPSILON
        : offsetSeconds + this.recoveryFor(action) <= entry.offsetSeconds + EPSILON);
      if (fits) break;
    }
    if (offsetSeconds >= COMBAT_RULES.window.actionSlots - EPSILON) { this.report("That move cannot fit in the three action slots.", "combat"); return; }
    c.queued.push({ id: c.nextId++, ...move, targetId: action === "strike" || action === "disengage" || action === "jab" ? s.selectedThreat : null,
      offsetSeconds, cost, status: "pending", reason: null });
    c.queued.sort((a, b) => a.offsetSeconds - b.offsetSeconds);
    this.report(`${actionName(action, this.state.archetype)} queued at ${offsetSeconds.toFixed(1)} seconds.`, "combat");
    if (c.clock.phase === "active") this.executeQueue();
  }
  setQueuedDelay(id: number, seconds: number): void {
    const c = this.state.combat, index = c.queued.findIndex(e => e.id === id), entry = c.queued[index];
    if (!entry || entry.status !== "pending") { this.report("That move has already resolved and cannot be changed.", "combat"); return; }
    const previous = c.queued[index - 1], next = c.queued[index + 1];
    const offset = (previous?.offsetSeconds ?? 0) + seconds;
    if (!Number.isInteger(seconds) || seconds < 0 || offset >= COMBAT_RULES.window.actionSlots - EPSILON ||
      (previous && offset < previous.offsetSeconds + this.recoveryFor(previous.action) - EPSILON) ||
      (next && next.offsetSeconds < offset + this.recoveryFor(entry.action) - EPSILON) ||
      (c.clock.phase === "active" && offset < c.clock.elapsedSeconds + this.state.actionCooldown - EPSILON)) {
      this.report("That timing has passed or leaves too little recovery before the next move or preparation.", "combat"); return;
    }
    entry.offsetSeconds = offset;
    this.report(`${actionName(entry.action, this.state.archetype)} moved to ${offset.toFixed(1)} seconds.`, "combat");
    if (c.clock.phase === "active") this.executeQueue();
  }
  moveQueuedAction(id: number, offsetSeconds: number): void {
    const c = this.state.combat, entry = c.queued.find(e => e.id === id);
    if (!entry || entry.status !== "pending" || !Number.isInteger(offsetSeconds) || offsetSeconds < 0 || offsetSeconds >= COMBAT_RULES.window.actionSlots - EPSILON) {
      this.report("Only a pending move can be placed inside the three action slots.", "combat"); return;
    }
    const occupying = c.queued.find(e => Math.abs(e.offsetSeconds - offsetSeconds) < EPSILON && e.id !== id);
    if (occupying && occupying.status !== "pending") { this.report("That turn has already been used.", "combat"); return; }
    const candidate = c.queued.map(e => ({ ...e, offsetSeconds: e.id === id ? offsetSeconds : e.id === occupying?.id ? entry.offsetSeconds : e.offsetSeconds })).sort((a,b) => a.offsetSeconds - b.offsetSeconds);
    const now = c.clock.phase === "active" ? c.clock.elapsedSeconds + this.state.actionCooldown : 0;
    if (candidate.some((e,i) => (e.status === "pending" && e.offsetSeconds < now - EPSILON) || (i > 0 && e.offsetSeconds < candidate[i-1]!.offsetSeconds + this.recoveryFor(candidate[i-1]!.action) - EPSILON))) {
      this.report("That placement has passed or leaves too little recovery between moves.", "combat"); return;
    }
    c.queued = candidate;
    this.report(`${actionName(entry.action, this.state.archetype)} placed at ${offsetSeconds.toFixed(1)} seconds.`, "combat");
    if (c.clock.phase === "active") this.executeQueue();
  }
  replaceQueuedAction(id: number, action: CombatAction): boolean {
    if (!this.actionUnlocked(action)) return false;
    const s = this.state, c = s.combat;
    const index = c.queued.findIndex(e => e.id === id), entry = c.queued[index];
    if (!entry || entry.status !== "pending") {
      this.report("Only a pending move can be replaced.", "combat"); return false;
    }
    const cost = this.actionCost(action);
    const reservedWithoutEntry = this.reservedStamina() - entry.cost;
    if (s.stamina - reservedWithoutEntry < cost) {
      this.report(`${actionName(action, s.archetype)} needs ${cost} stamina; ${s.stamina - reservedWithoutEntry} free.`, "combat"); return false;
    }
    const pendingPotions = c.queued.filter(e => e.status === "pending" && e.action === "drinkPotion" && e.id !== id).length;
    if (action === "drinkPotion" && pendingPotions >= s.potions) {
      this.report("No unreserved health potion is available.", "combat"); return false;
    }
    const replacement: QueuedCombatAction = {
      id: entry.id,
      action,
      targetId: action === "strike" || action === "disengage" || action === "jab" ? s.selectedThreat : null,
      offsetSeconds: entry.offsetSeconds, cost, status: entry.status, reason: entry.reason,
    };
    const candidate = c.queued.map(e => e.id === id ? replacement : { ...e }).sort((a, b) => a.offsetSeconds - b.offsetSeconds);
    const now = c.clock.phase === "active" ? c.clock.elapsedSeconds + s.actionCooldown : 0;
    const invalid = candidate.some((e, i) =>
      (e.status === "pending" && e.offsetSeconds < now - EPSILON) ||
      (i > 0 && e.offsetSeconds < candidate[i - 1]!.offsetSeconds + this.recoveryFor(candidate[i - 1]!.action) - EPSILON));
    if (invalid) {
      this.report("That move cannot be replaced at this timing.", "combat"); return false;
    }
    c.queued = candidate;
    this.report(`${actionName(action, s.archetype)} replaced the queued move.`, "combat");
    if (c.clock.phase === "active") this.executeQueue();
    return true;
  }
  removeQueuedAction(id: number): void {
    const c = this.state.combat, entry = c.queued.find(e => e.id === id);
    if (!entry || entry.status !== "pending") { this.report("Only a pending move can be cancelled.", "combat"); return; }
    c.queued = c.queued.filter(e => e.id !== id);
    this.report(`${actionName(entry.action, this.state.archetype)} cancelled. Its stamina is available again.`, "combat");
  }
  clearQueuedActions(): void { this.state.combat.queued = this.state.combat.queued.filter(e => e.status !== "pending"); }
  private clearTargetQueue(id: string): void {
    if (this.state.selectedThreat === id) this.clearQueuedActions();
    else this.state.combat.queued = this.state.combat.queued.filter(e => e.status !== "pending" || e.targetId !== id);
  }
  private executeQueue(): void {
    const s = this.state, c = s.combat;
    if (c.clock.phase !== "active" || s.phase !== "expedition" || s.health <= 0) return;
    for (const e of c.queued) {
      if (e.status !== "pending" || e.offsetSeconds > c.clock.elapsedSeconds + EPSILON) continue;
      const target = s.world.threats.find(t => t.id === e.targetId);
      let reason: string | null = null;
      if (!this.actionUnlocked(e.action)) reason = "You have not learned that move.";
      else if (!this.ready()) reason = "You are still recovering.";
      else if (s.stamina < e.cost) reason = "Not enough stamina.";
      else if ((e.action === "strike" || e.action === "disengage") && (!target || !this.canUseAttack(target, e.action))) reason = "The target is out of reach, behind cover, or no longer available.";
      else if (e.action === "jab" && (!target || !target.active || target.health <= 0 || target.phase === "returning" || distance(s.position, target.position) > COMBAT_RULES.jab.range + EPSILON || !this.attackPath(target))) reason = "The target is out of reach, behind cover, or no longer available.";
      else if (e.action === "drinkPotion" && (s.potions < 1 || s.health >= 100)) reason = "No potion is available or your health is already full.";
      else if (e.action === "equip" && e.gear.item !== null && (!s.chapter.ownedGear.includes(e.gear.item) || GEAR[e.gear.item].slot !== e.gear.slot)) reason = "You do not own suitable gear for that slot.";
      else if (e.action === "bloodRage" && (!this.inCombat() || s.bloodRage >= COMBAT_RULES.bloodRage.maximum)) reason = `${classKit(s.archetype).powerName} needs a fight and cannot exceed three stacks.`;
      if (reason) { e.status = "failed"; e.reason = reason; this.report(`${actionName(e.action, this.state.archetype)} failed: ${reason}`, "combat"); continue; }
      e.status = "executed";
      if (e.action === "strike" || e.action === "disengage") this.attack(e.action, target!);
      else {
        this.spendStamina(e.cost); this.recover(e.action, this.recoveryFor(e.action));
        if (e.action === "equip") {
          s.chapter.equipment[e.gear.slot] = e.gear.item;
          this.report(e.gear.item ? `${gearName(e.gear.item, s.archetype)} equipped.` : `${e.gear.slot === "chest" ? "Coat" : "Weapon"} unequipped.`, "combat");
        } else if (e.action === "brace" || e.action === "guard") {
          s.guardSeconds = COMBAT_RULES[e.action].duration;
          s.block = e.action === "brace" ? (classAction(s.archetype, "brace").block ?? COMBAT_RULES.brace.block) : COMBAT_RULES[e.action].block;
          const tonic = e.action === "brace" && this.inCombat() ? (classAction(s.archetype, "brace").heal ?? 0) : 0;
          if (tonic > 0) { const healed = Math.min(tonic, 100 - s.health); s.health += healed; if (healed > 0) this.report(`${classKit(s.archetype).abilities.brace.name} restores ${healed} health.`, "combat"); }
          this.report(`You gain ${s.block} block for ${s.guardSeconds} seconds.`, "combat");
        } else if (e.action === "drinkPotion") {
          const healing = Math.min(30, 100 - s.health); s.health += healing; s.potions--;
          this.report(`Your health potion restores ${healing} health.`, "combat");
        } else if (e.action === "jab") {
          this.hit(target!, (classAction(s.archetype, "jab").damage ?? COMBAT_RULES.jab.damage) + s.bloodRage * this.powerDamagePerStack(), "jab");
        } else {
          if (s.bloodRage === 0) s.rageDrainSeconds = COMBAT_RULES.bloodRage.drainSeconds;
          s.bloodRage++; s.rageDecaySeconds = 0;
          this.report(`${classKit(s.archetype).powerName} rises to ${s.bloodRage}. Attacks gain ${s.bloodRage * this.powerDamagePerStack()} damage.`, "combat");
        }
      }
    }
  }
  private eligibleForRoll(t: ThreatState): boolean {
    return t.contributors.includes(this.playerId ?? "solo") && this.state.chapter.accepted.includes("last-shift") && !this.state.chapter.completed.includes("last-shift");
  }
  private lootAvailable(t: ThreatState): boolean {
    if (t.id !== "ritual-guardian") return !t.lootClaimed;
    if (this.state.carriedRelics > 0) return false;
    if (this.state.chapter.accepted.includes("last-shift") && !this.state.chapter.completed.includes("last-shift") && !this.eligibleForRoll(t)) return false;
    return this.eligibleForRoll(t) ? !t.rollClaims.includes(this.playerId ?? "solo") : !t.lootClaimed;
  }
  private canLoot(t: ThreatState): boolean {
    return this.state.phase === "expedition" && t.health === 0 && this.lootAvailable(t) &&
      distance(this.state.position, t.position) <= 3 + EPSILON && this.clearPath(this.state.position, t.position);
  }
  openLoot(sourceId: string): void {
    const corpse = this.state.world.threats.find(t => t.id === sourceId);
    this.lootOpenId = corpse && this.canLoot(corpse) ? corpse.id : null;
    if (this.lootOpenId) { this.shopOpen = false; this.innOpen = false; }
  }
  private takeLoot(): void {
    const s = this.state;
    const corpse = s.world.threats.find(t => t.id === this.lootOpenId);
    this.lootOpenId = null;
    if (!corpse || !this.canLoot(corpse)) return;
    corpse.lootClaimed = true;
    if (corpse.id === "ritual-guardian") {
      if (!corpse.rollClaims.includes(this.playerId ?? "solo")) corpse.rollClaims.push(this.playerId ?? "solo");
      s.carriedRelics += 1;
      this.report("You receive loot: Last Shift Roll × 1. Reach Nine-Bell Yard alive to keep it.");
    } else {
      s.carriedSalvage += 1;
      this.report("You receive loot: Forest salvage × 1. Return alive to exchange it for one supply.");
    }
  }
  setAction(action: AdventureAction, pressed: boolean): void {
    if (!pressed) { this.held.delete(action); return; }
    if (this.held.has(action)) return;
    this.held.add(action);
    this.act(action);
  }

  private near(id: string, range: number): boolean {
    const place = PLACES.find(p => p.id === id);
    return place !== undefined && distance(this.state.position, place.position) <= range + EPSILON;
  }
  private ready(): boolean {
    return this.state.phase === "expedition" && this.state.actionCooldown <= EPSILON && this.state.maneuver === null;
  }
  private act(action: AdventureAction): void {
    const s = this.state;
    if (action === "closeShop") { this.shopOpen = false; this.trade = null; return; }
    if (action === "closeTrade") { this.trade = null; return; }
    if (action === "openTrade") { if (this.shopOpen && this.near("mara", 2.5) && s.phase === "town") this.trade = { kind: "supplies", quantity: 3 }; return; }
    if (action === "acceptTrade") {
      const view = this.tradeView();
      if (!view || !view.canAccept) { this.report(view?.reason ?? "Stay beside Mara to trade."); return; }
      if (view.kind === "supplies") { s.supplies -= view.quantity; s.potions += view.receivedQuantity; this.report(`You trade ${view.quantity} supplies for ${view.receivedQuantity} health potion${view.receivedQuantity === 1 ? "" : "s"}.`); }
      else { s.potions -= view.quantity; s.supplies += view.receivedQuantity; this.report(`You trade ${view.quantity} health potion${view.quantity === 1 ? "" : "s"} for ${view.receivedQuantity} supplies.`); }
      this.trade = null; return;
    }
    if (action === "closeInn") { this.innOpen = false; return; }
    if (action === "closeLoot") { this.lootOpenId = null; return; }
    if (s.phase === "lost") return;
    switch (action) {
      case "jump":
        if (s.maneuver === null) startJump(s);
        break;
      case "target": {
        const nearby = s.world.threats.filter(t => t.active && t.health > 0 && distance(s.position, t.position) <= 15);
        const next = nearby[(nearby.findIndex(t => t.id === s.selectedThreat) + 1) % nearby.length];
        if (next) this.selectTarget(next.id);
        break;
      }
      case "strike": case "disengage": case "brace": case "bloodRage": case "jab": case "guard": this.queueAction(action); break;
      case "gather": this.gather(); break;
      case "ritual": this.ritual(); break;
      case "takeLoot": this.takeLoot(); break;
      case "interact": {
        this.lootOpenId = null;
        const service = s.phase === "town" ? PLACES.filter(p => (p.kind === "shop" || p.kind === "inn") && this.near(p.id, 2.5))
          .sort((a,b) => distance(s.position,a.position) - distance(s.position,b.position))[0] : undefined;
        if (service) this.interactNpc(service.kind === "shop" ? "mara" : "inn");
        else {
          this.shopOpen = false; this.innOpen = false; this.trade = null;
          const corpse = s.world.threats.filter(t => this.canLoot(t))
            .sort((a, b) => distance(s.position, a.position) - distance(s.position, b.position))[0];
          if (corpse) this.openLoot(corpse.id);
          else this.report(s.phase === "town" ? "Approach Mara to trade or Rowan at the inn to rest." : "Move beside a glinting body to search it.");
        }
        break;
      }
      case "buyPotion":
        if (!this.shopOpen || !this.near("mara", 2.5) || s.phase !== "town") {
          this.report("Talk to Mara in Nine-Bell Yard to buy a potion.");
        } else if (s.supplies < MARA_TRADE_RULES.suppliesPerPotion) {
          this.report("Not enough supplies for a health potion.");
        } else {
          s.supplies -= MARA_TRADE_RULES.suppliesPerPotion; s.potions += 1;
          this.report("You buy a health potion for 3 supplies.");
        }
        break;
      case "drinkPotion":
        if (s.phase === "expedition" && (this.inCombat() || s.world.threats.some(t => t.id === s.selectedThreat && t.active && t.health > 0))) { this.queueAction("drinkPotion"); break; }
        if (s.health >= 100) this.report("Your health is already full. Potion kept.");
        else if (s.potions < 1) this.report("No health potions. Visit Mara in Nine-Bell Yard.");
        else { const healing = Math.min(30, 100 - s.health); s.potions -= 1; s.health += healing; this.report(`Your health potion restores ${healing} health.`, "combat"); }
        break;
      case "rest":
        if (s.phase === "town" && this.near("inn", 2.5)) {
          const healing = 100 - s.health;
          s.health = 100;
          this.report(healing > 0 ? `You rest at ${YARD.inn} and recover ${healing} health.` : "Rowan says: You're already rested. May the road bring you safely home.");
        } else this.report("Visit Rowan at The Wayfarer's Rest in Nine-Bell Yard to rest.");
        break;
    }
  }
  private intention(t: ThreatState): string {
    return this.ability(t).name;
  }
  private direction(from: Position, to: Position): Vector {
    const length = distance(from, to);
    return length > EPSILON ? point((to.x - from.x) / length, (to.z - from.z) / length) : point(0, 1);
  }
  private movementMode(t: ThreatState): ThreatView["movementMode"] {
    if (t.health === 0 || this.state.phase === "lost") return "idle";
    if (t.wolf?.motion) return t.wolf.motion.kind;
    return t.moving ? t.wolf?.circling ? "circle" : "walk" : "idle";
  }
  private ability(t: ThreatState, next = false): ThreatAbilityView {
    if (t.head) return this.headAbility(t, next);
    if (t.wolf) return maulAbility(t.damage);
    if (t.id === "ritual-guardian") return foremanAbility(t.abilityIndex, t.damage);
    return ordinaryAbility(definition(t.id), t.damage);
  }
  private phaseDuration(t: ThreatState): number {
    if (t.head) return t.phase === "preparation" || t.phase === "recovery" ? 5 : t.phase === "action" ? 0.6 + (t.head.volley-1)*0.2 : 0;
    return (t.wolf ? PHASE_SECONDS : OTHER_PHASE_SECONDS)[t.phase];
  }
  private rootedSeconds(t: ThreatState): number {
    if (t.health <= 0 || !t.aggro) return 0;
    return Math.max(0, ...this.participants().map(player => {
      const m = player.state.maneuver;
      return m?.kind === "disengage" && m.targetId === t.id ? m.remainingSeconds : 0;
    }));
  }
  private attackPath(t: ThreatState): boolean {
    return this.clearPath(this.state.position, t.position);
  }
  private canUseAttack(t: ThreatState, action: "strike" | "disengage"): boolean {
    const s = this.state;
    const ranged = s.archetype !== "warrior";
    const range = ranged ? COMBAT_RULES.strike.rangedRange : COMBAT_RULES[action].range;
    return this.actionUnlocked(action) && this.ready() && s.stamina >= this.actionCost(action) && s.position.y === 0 && s.verticalSpeed === 0 &&
      t.active && t.health > 0 && t.phase !== "returning" && distance(s.position, t.position) <= range + EPSILON && this.attackPath(t);
  }
  private attack(action: "strike" | "disengage", selected?: ThreatState): void {
    const s = this.state;
    const t = selected ?? s.world.threats.find(t => t.id === s.selectedThreat);
    if (!t || !this.canUseAttack(t, action)) {
      if (this.ready()) this.report("Choose a living threat within reach from clear ground.", "combat");
      return;
    }
    const length = distance(s.position, t.position);
    const facing = length > EPSILON ? point((t.position.x - s.position.x) / length, (t.position.z - s.position.z) / length) : { ...this.cameraForward };
    const ranged = s.archetype !== "warrior";
    if (ranged) {
      this.spendStamina(this.actionCost(action)); this.recover(action, classAction(s.archetype, action).duration ?? COMBAT_RULES.actionCooldown);
      this.hit(t, (classAction(s.archetype, action).damage ?? COMBAT_RULES.strike.damage) + s.bloodRage * this.powerDamagePerStack(),
        `${classAction(s.archetype, action).name} at`);
      if (action === "disengage") {
        const destination = point(Math.max(-12, Math.min(12, s.position.x - facing.x * COMBAT_RULES.disengage.distance)), Math.max(-14, Math.min(45, s.position.z - facing.z * COMBAT_RULES.disengage.distance)));
        s.maneuver = { kind: "disengage", targetId: t.id, start: { ...s.position }, destination, facing: { x: -facing.x, y: 0, z: -facing.z }, remainingSeconds: COMBAT_RULES.disengage.duration };
      }
      return;
    }
    const amount = action === "strike" ? Math.max(0, length - COMBAT_RULES.strike.stopDistance) : -COMBAT_RULES.disengage.distance;
    const destination = point(Math.max(-12, Math.min(12, s.position.x + facing.x * amount)), Math.max(-14, Math.min(45, s.position.z + facing.z * amount)));
    this.spendStamina(this.actionCost(action)); this.recover(action, COMBAT_RULES.actionCooldown);
    s.maneuver = { kind: action === "strike" ? "lunge" : "disengage", targetId: t.id,
      start: { ...s.position }, destination, facing, remainingSeconds: COMBAT_RULES[action].duration };
    if (action === "disengage") this.hit(t, (classAction(s.archetype, action).damage ?? COMBAT_RULES.disengage.damage) + s.bloodRage * this.powerDamagePerStack(), "strike");
  }
  private powerDamagePerStack(): number { return classAction(this.state.archetype, "bloodRage").powerDamagePerStack ?? COMBAT_RULES.bloodRage.damagePerStack; }
  private hit(t: ThreatState, damage: number, verb: string): void {
    if (t.phase === "returning") return;
    damage += this.progression().attackBonus;
    const blocked = Math.min(damage, t.head?.block ?? t.shield);
    if (!t.head) t.shield -= blocked;
    if (t.id === "nest" && t.contributors.length === 0) this.report("Your blow enrages the Briar bee. It rushes toward you; watch the marked ground and Block or move before its swarm lands.", "combat");
    if (!t.contributors.includes(this.playerId ?? "solo")) t.contributors.push(this.playerId ?? "solo");
    if (t.head) { t.head.block -= blocked; if (t.head.block === 0) t.head.blockSeconds = 0; }
    const s = this.state, dealt = Math.min(damage - blocked, t.health);
    t.health -= dealt;
    if (t.health > 0 && !t.aggro) this.engage(t);
    if (t.wolf?.motion && this.rootedSeconds(t) > EPSILON) this.groundWolfMotion(t);
    s.attackSequence += 1; s.presence += 1;
    this.report(`You ${verb} ${definition(t.id).name} for ${dealt} damage${blocked ? ` (${blocked} absorbed by ${t.head ? "Ember Ward" : "Safety Shield"})` : ""}.`, "combat");
    if (t.health === 0) {
      if (t.id === "scout") for (const player of this.shared ? this.shared.characters.values() : [this]) {
        if (t.contributors.includes(player.playerId ?? "solo") && player.state.chapter.accepted.includes("roll-call")) player.state.chapter.scoutDefeated = true;
      }
      t.shield = 0;
      t.respawnAt = this.now() + WORLD_RESPAWN_MILLISECONDS;
      for (const player of this.participants()) player.clearTargetQueue(t.id);
      t.targetPlayerId = null; t.phase = "cleared"; t.remainingSeconds = 0; t.lastActionHit = false; t.aggro = false; t.moving = false;
      if (t.head) { t.head.fireballs = []; t.head.block = 0; t.head.blockSeconds = 0; }
      if (t.wolf) { t.wolf.motion = null; t.wolf.circling = false; t.position.y = 0; }
      this.report(`${definition(t.id).name} dies. ${definition(t.id).benefit}`, "combat");
      if (t.id === "ritual-guardian") {
        this.report("The guardian falls. Search its body for the Last Shift Roll, then carry it home.");
      }
    }
  }
  private gather(): void {
    const s = this.state;
    if (!this.ready()) return;
    if (!this.near("frost-cores", 3)) { this.report("Approach the coolant crystals in the first clearing to gather."); return; }
    if (s.world.resourceRemaining < 3) { this.report("The coolant crystals are regrowing. Return soon to gather more."); return; }
    s.world.resourceRemaining -= 3; s.cargo += 3; s.presence += 4; this.recover("gather", 2);
    // Each harvest returns its three cores two minutes later, independently of later harvests.
    s.world.resourceRespawns.push({ at: this.now() + WORLD_RESPAWN_MILLISECONDS, quantity: 3 });
    this.report("You gather Coolant crystals × 3. Return alive to keep them.");
    if (s.world.threats.some(t => t.id === "warder" && t.health > 0)) {
      this.hurt(8, "The warder's thorns");
    }
  }
  private ritual(): void {
    const s = this.state;
    if (!this.ready()) return;
    if (!this.near("ritual-site", 3)) { this.report("Reach the Ninth Bell Engine to offer six coolant crystals."); return; }
    if (s.cargo < 6) { this.report("The offering needs six carried coolant crystals."); return; }
    const guardian = s.world.threats.find(t => t.id === "ritual-guardian");
    if (!guardian) throw new Error("Missing Foreman Nine.");
    const players = this.shared ? [...this.shared.characters.values()] : [this];
    const pendingRoll = players.some(player => player.state.health > 0 && player.eligibleForRoll(guardian) && !guardian.rollClaims.includes(player.playerId ?? "solo"));
    const claimTimeExpired = guardian.health === 0 && guardian.respawnAt !== null && guardian.respawnAt <= this.now();
    if (guardian.active && (guardian.health > 0 || (!claimTimeExpired && (!guardian.lootClaimed || pendingRoll)))) { this.report("The foreman is still here. Finish the fight and collect the remaining rolls, or wait two minutes after its defeat."); return; }
    Object.assign(guardian, { ...newThreat(definition(guardian.id)), rng: guardian.rng });
    s.cargo -= 6; s.world.ritualCalled = true; s.presence += 12; this.recover("ritual", 1);
    const wasIdle = s.combat.clock.phase === "idle";
    guardian.active = true; this.engage(guardian);
    // A summoned boss announces itself during a full preparation window. The
    // player cannot pre-buffer a defense before the ritual, so never open on
    // an immediate hit.
    if (wasIdle) { s.combat.clock.phase = "preparation"; s.combat.clock.elapsedSeconds = 0; }
    guardian.joinCycle = s.combat.clock.cycle + (wasIdle || s.combat.clock.phase === "active" ? 1 : 2);
    guardian.windowCycle = 0;
    this.planWindow(guardian, guardian.joinCycle);
    guardian.remainingSeconds = Math.max(0, guardian.specialOffset - this.windowTime(guardian));
    this.report("Six coolant crystals offered. Foreman Nine wakes; recover the Last Shift Roll from its remains.");
  }

  advance(seconds: number): void {
    if (this.shared) throw new Error("Advance the shared adventure, not an individual character.");
    if (!Number.isFinite(seconds) || seconds < 0) throw new Error("Elapsed time must be finite and nonnegative.");
    refreshWorld(this.state.world, this.now());
    this.closeMissingLoot();
    let remaining = seconds;
    while (remaining > EPSILON) {
      const phaseLength = this.state.combat.clock.phase === "idle" ? Infinity : COMBAT_RULES.window[this.state.combat.clock.phase];
      const dt = Math.min(remaining, 1 / 60, this.nextEventDelay(), this.state.combat.clock.phase === "idle" ? Infinity : phaseLength - this.state.combat.clock.elapsedSeconds);
      this.step(dt);
      remaining -= dt;
    }
  }
  private nextEventDelay(): number {
    const c = this.state.combat, delays: number[] = [];
    if (c.clock.phase === "idle") return Infinity;
    if (c.clock.phase === "active") for (const e of c.queued) if (e.status === "pending") delays.push(e.offsetSeconds - c.clock.elapsedSeconds);
    for (const t of this.state.world.threats) {
      if (!t.aggro || t.health <= 0) continue;
      const at = this.windowTime(t);
      if (t.head) {
        for (const e of t.head.events) if (e.status !== "done") {
          delays.push(e.offsetSeconds - at);
          if (e.ability === "fireball" && e.launched < e.volley) delays.push(e.offsetSeconds + e.launched * e.spacing - COMBAT_RULES.head.fireballTravel - at);
        }
        for (const p of t.head.fireballs) delays.push(p.impactOffset - at);
      } else if (!t.specialResolved) {
        delays.push(t.specialOffset - at);
        if (!t.specialLaunched) delays.push(t.specialOffset - (t.wolf ? 0.65 : 0.35) - at);
      }
    }
    return Math.min(Infinity, ...delays.filter(value => value > EPSILON));
  }
  private move(dt: number): void {
    const result = moveLocomotion(this.state, { forward: this.mouseForward ? 1 : Number(this.held.has("forward")) - Number(this.held.has("backward")),
      strafe: Number(this.held.has("right")) - Number(this.held.has("left")), cameraX: this.cameraForward.x, cameraZ: this.cameraForward.z, jump: false }, dt);
    this.moving = result.moving; this.backpedaling = result.backpedaling;
  }
  private consumeMovement(dt: number, blocked: boolean): void {
    this.moving = false; this.backpedaling = false;
    let remaining = dt;
    while (remaining > EPSILON && this.movementFrames!.length) {
      const frame = this.movementFrames![0]!;
      if (this.movementSequence !== frame.sequence) { this.movementSequence = frame.sequence; this.movementElapsed = 0; }
      const elapsed = Math.min(remaining, frame.seconds - this.movementElapsed);
      if (!blocked) {
        this.setCameraForward(frame.input.cameraX, frame.input.cameraZ);
        const result = moveLocomotion(this.state, { ...frame.input, jump: frame.input.jump && this.movementElapsed === 0 }, elapsed);
        this.moving = result.moving; this.backpedaling = result.backpedaling;
      }
      this.movementElapsed += elapsed; remaining -= elapsed;
      if (this.movementElapsed >= frame.seconds - EPSILON) this.movementFrames!.shift();
    }
  }
  private moveManeuver(dt: number): void {
    const s = this.state, m = s.maneuver;
    if (!m) return;
    const duration = m.kind === "lunge" ? COMBAT_RULES.strike.duration : COMBAT_RULES.disengage.duration;
    const motion = { ...m, duration };
    this.moving = moveManeuverPosition(s, motion, dt);
    m.remainingSeconds = motion.remainingSeconds;
    this.backpedaling = m.kind === "disengage" && this.moving;
    if (m.remainingSeconds > EPSILON) return;
    s.position.y = 0; s.verticalSpeed = 0; s.maneuver = null;
    if (m.kind === "lunge") {
      const t = s.world.threats.find(t => t.id === m.targetId);
      if (t && t.active && t.health > 0 && distance(s.position, t.position) <= COMBAT_RULES.disengage.range + EPSILON && this.attackPath(t)) this.hit(t, (classAction(s.archetype, "strike").damage ?? COMBAT_RULES.strike.damage) + s.bloodRage * this.powerDamagePerStack(), "lunge at");
      else this.report("Your lunge falls short.", "combat");
    }
  }
  private blocked(x: number, z: number): boolean {
    return blockedPosition(x, z);
  }
  private barriers(): readonly Barrier[] {
    return MOVEMENT_BARRIERS;
  }
  private clearPath(a: Position, b: Position): boolean {
    return !this.barriers().some(([left, right, bottom, top]) => {
      let enter = 0, exit = 1;
      for (const [start, end, min, max] of [[a.x, b.x, left + EPSILON, right - EPSILON], [a.z, b.z, bottom, top]] as const) {
        const delta = end - start;
        if (Math.abs(delta) <= EPSILON) { if (start < min || start > max) return false; }
        else {
          const first = (min - start) / delta, last = (max - start) / delta;
          enter = Math.max(enter, Math.min(first, last));
          exit = Math.min(exit, Math.max(first, last));
        }
      }
      return enter <= exit;
    });
  }
  private closeMissingLoot(): void {
    if (this.lootOpenId !== null && !this.state.world.threats.some(t => t.id === this.lootOpenId && this.canLoot(t))) this.lootOpenId = null;
  }
  private stepPlayer(dt: number): void {
    const s = this.state;
    if (s.phase === "lost") { if (this.movementFrames) this.consumeMovement(dt, true); this.moving = false; this.backpedaling = false; return; }
    if (s.maneuver) { if (this.movementFrames) this.consumeMovement(dt, true); this.moveManeuver(dt); }
    else if (this.movementFrames) this.consumeMovement(dt, false);
    else this.move(dt);
    this.closeMissingLoot();
    if (this.shopOpen && !this.near("mara", 2.5)) { this.shopOpen = false; this.trade = null; }
    if (this.innOpen && !this.near("inn", 2.5)) this.innOpen = false;
    if (s.phase === "town" && s.position.z >= 2) {
      s.phase = "expedition"; s.carriedSalvage = 0; s.presence = 0;
      if (!this.shared) {
        s.world.resourceRemaining = 12; s.world.resourceRespawns = []; s.world.ritualCalled = false;
        const fresh = newThreats();
        for (const t of fresh) {
          const previous = s.world.threats.find(old => old.id === t.id);
          if (previous && previous.health > 0) { t.position = { ...previous.position }; t.patrolIndex = previous.patrolIndex; t.targetPosition = { ...t.position }; }
        }
        s.world.threats = fresh;
      }
      s.actionCooldown = 0; s.guardSeconds = 0; s.block = 0; this.shopOpen = false; this.trade = null; this.innOpen = false;
      this.report("You enter The Last Shift. The forest is listening; Nine-Bell Yard lies behind you.");
    } else if (s.phase === "expedition" && s.position.z <= 0) {
      const reservedCrystals = s.chapter.accepted.includes("cold-hands") && !s.chapter.completed.includes("cold-hands") ? Math.min(3, s.cargo) : 0;
      const reservedRoll = s.chapter.accepted.includes("last-shift") && !s.chapter.completed.includes("last-shift") ? s.carriedRelics : 0;
      s.phase = "town"; s.supplies += s.cargo - reservedCrystals + s.carriedSalvage; s.bankedRelics += s.carriedRelics - reservedRoll;
      s.cargo = reservedCrystals; s.carriedRelics = reservedRoll; s.carriedSalvage = 0; s.guardSeconds = 0; s.block = 0;
      s.maneuver = null; s.position.y = 0; s.verticalSpeed = 0; this.lootOpenId = null; this.trade = null;
      if (!this.shared) for (const t of s.world.threats) if (t.health > 0) this.releaseThreat(t);
      s.combat = newCombat(this.shared?.clock); s.stamina = COMBAT_RULES.stamina.maximum;
      this.report(`You return to ${YARD.settlement}. Salvage and spare crystals are secured.${reservedCrystals ? " Bring your coolant crystals to Mara." : ""}${reservedRoll ? " Bring the Last Shift Roll to Rowan." : ""} Visit the inn before your next trip.`);
    }
    if (s.phase === "expedition") s.presence += (this.moving ? 0.5 : 0.1) * dt;
    s.guardSeconds = Math.max(0, s.guardSeconds - dt);
    if (s.guardSeconds <= EPSILON) { s.guardSeconds = 0; s.block = 0; }
    s.actionCooldown = Math.max(0, s.actionCooldown - dt);
    if (s.actionCooldown <= EPSILON) { s.actionCooldown = 0; s.currentAction = null; s.actionDuration = 0; }
    if (s.health > 0) this.advanceResources(dt);
  }
  private step(dt: number): void {
    const s = this.state, clockWasRunning = s.combat.clock.phase !== "idle";
    this.stepPlayer(dt);
    if (s.health <= 0) return;
    if (clockWasRunning && s.combat.clock.phase !== "idle") this.advanceClock(dt);
    for (const t of s.world.threats) { t.moving = false; this.acquireOrRelease(t, dt); }
    this.startQueuedCombat();
    this.executeQueue();
    for (const t of s.world.threats) if (t.aggro && t.active && t.health > 0 && s.health > 0) this.advanceThreat(t, dt);
    this.finishCombat();
  }
  private startQueuedCombat(): void {
    const s = this.state;
    if (s.combat.clock.phase === "idle" && s.phase === "expedition") {
      const first = s.combat.queued.find(e => e.status === "pending" && (e.action === "strike" || e.action === "disengage" || e.action === "jab"));
      const target = s.world.threats.find(t => t.id === first?.targetId);
      if (first && target && target.health > 0 && target.active && (first.action === "jab" ? distance(s.position, target.position) <= 2 && this.attackPath(target) : (first.action === "strike" || first.action === "disengage") && this.canUseAttack(target, first.action))) this.engage(target);
    }
  }
  private participants(): Adventure[] { return this.shared ? [...this.shared.online.values()] : [this]; }
  private finishCombat(): void {
    const c = this.state.combat.clock;
    if (c.phase === "idle" || this.state.world.threats.some(t => t.active && t.health > 0 && t.aggro)) return;
    c.phase = "idle"; c.elapsedSeconds = 0;
    for (const player of this.participants()) { player.state.combat.queued = []; player.state.stamina = COMBAT_RULES.stamina.maximum; }
  }
  private targetPlayer(t: ThreatState): Adventure | undefined {
    if (!this.shared) return this;
    return t.targetPlayerId === null ? undefined : this.shared.online.get(t.targetPlayerId);
  }
  private chooseTarget(t: ThreatState): Adventure | undefined {
    const d = definition(t.id);
    const eligible = (p: Adventure): boolean => p.state.phase === "expedition" && p.state.health > 0 && p.state.position.z > 2 && distance(p.state.position, d.position) <= d.leash;
    const previous = this.targetPlayer(t);
    if (t.aggro && previous && eligible(previous)) return previous;
    return this.participants().filter(eligible).sort((a,b) => distance(a.state.position,t.position) - distance(b.state.position,t.position))[0];
  }
  private planForTarget(t: ThreatState, cycle: number): void { (this.targetPlayer(t) ?? this).planWindow(t, cycle); }
  private advanceClock(dt: number): void {
    const c = this.state.combat;
    c.clock.elapsedSeconds += dt;
    const phaseLength = c.clock.phase === "idle" ? Infinity : COMBAT_RULES.window[c.clock.phase];
    if (c.clock.elapsedSeconds < phaseLength - EPSILON) return;
    c.clock.elapsedSeconds = 0;
    if (c.clock.phase === "active") {
      c.clock.phase = "choosing";
      for (const player of this.participants()) {
        for (const e of player.state.combat.queued) if (e.status === "pending") player.report(actionName(e.action, player.state.archetype) + " did not fit in the active window.", "combat");
        player.state.combat.queued = [];
      }
      for (const t of this.state.world.threats) if (t.aggro && t.health > 0) this.planForTarget(t, c.clock.cycle + 1);
      for (const player of this.participants()) player.state.stamina = COMBAT_RULES.stamina.maximum;
    } else if (c.clock.phase === "choosing") {
      c.clock.phase = "preparation";
    } else {
      c.clock.phase = "active"; c.clock.cycle++;
      for (const t of this.state.world.threats) if (t.aggro && t.health > 0) {
        if (t.windowCycle !== c.clock.cycle) this.planForTarget(t, c.clock.cycle);
      }
    }
  }
  private engage(t: ThreatState): void {
    const c = this.state.combat;
    t.aggro = true; t.lastActionHit = false; t.targetPlayerId = this.playerId;
    if (c.clock.phase === "idle") {
      c.clock.phase = "active"; c.clock.elapsedSeconds = 0; c.clock.cycle++;
      t.joinCycle = c.clock.cycle; this.planWindow(t, c.clock.cycle, true);
      if (t.id === "nest") {
        t.joinCycle = c.clock.cycle + 1; t.windowCycle = 0;
        this.planWindow(t, t.joinCycle);
      }
    } else {
      t.joinCycle = c.clock.cycle + 1; t.phase = "preparation";
      if (t.id === "nest" && c.clock.phase === "preparation") t.joinCycle++;
      if (c.clock.phase === "preparation" || c.clock.phase === "choosing") this.planWindow(t, t.joinCycle);
    }
  }
  private windowTime(t: ThreatState): number {
    const c = this.state.combat;
    return (c.clock.cycle - t.windowCycle) * (COMBAT_RULES.window.active + COMBAT_RULES.window.choosing + COMBAT_RULES.window.preparation) + c.clock.elapsedSeconds +
      (c.clock.phase === "preparation" ? COMBAT_RULES.window.active + COMBAT_RULES.window.choosing : c.clock.phase === "choosing" ? COMBAT_RULES.window.active : 0);
  }
  private planWindow(t: ThreatState, cycle: number, initial = false): void {
    if (cycle < t.joinCycle) return;
    if (t.windowCycle === cycle) return;
    t.windowCycle = cycle;
    // Commit one of the three active beats up front. The PRNG lives in the save,
    // so a reload cannot silently move an already announced attack.
    t.specialOffset = initial
      ? t.wolf ? 1 + COMBAT_RULES.enemy.action : OTHER_PHASE_SECONDS.action
      : Math.floor(nextThreatRandom(t) * COMBAT_RULES.window.actionSlots) + (t.head ? 0 : t.wolf ? COMBAT_RULES.enemy.action : OTHER_PHASE_SECONDS.action);
    t.specialLaunched = false; t.specialResolved = false;
    t.phase = "preparation"; t.lastActionHit = false;
    // Each resolved action makes the next one more dangerous. The cap keeps
    // the ramp readable and gives a player who stays too long a clear reason
    // to disengage, without multiplying damage merely because allies joined.
    const ramp = Math.min(1, t.actionSequence * 0.15);
    t.damage = t.wolf ? 18 + Math.min(18, t.actionSequence * 2) : Math.ceil(definition(t.id).damage * (1 + this.state.presence / 100 + ramp));
    if (t.id === "ritual-guardian") {
      t.abilityIndex = t.actionSequence % 3;
      t.damage = t.abilityIndex === 2 ? 0 : (t.abilityIndex === 0 ? 32 : 48) + Math.floor(t.actionSequence / 3) * 4;
      t.shield = 0;
      if (t.abilityIndex === 2) t.specialOffset = 0;
    }
    t.targetPosition = { ...t.position };
    if (t.wolf) { t.wolf.motion = null; t.position.y = 0; }
    if (t.head) {
      const h = t.head, ability = this.chooseHeadAbility(t);
      const eventOffset = initial ? 0 : t.specialOffset;
      h.events = [{ offsetSeconds: eventOffset, spacing: volleySpacing(h.volley, eventOffset), ability, remainingSeconds: 0, status: "pending", volley: h.volley, launched: 0 }];
      h.fireballs = [];
    }
  }
  private chooseHeadAbility(t: ThreatState): HeadAbilityId {
    const h = t.head!, s = this.state;
    if (!h.opened) return "ember-beam";
    const previous = h.events[0]?.ability;
    if (previous === "kindle") return "fireball";
    const fireDamage = COMBAT_RULES.head.fireballDamage * h.volley;
    if (t.actionSequence % 3 === 0 || !this.headInRange(t) || s.block >= fireDamage) return "kindle";
    if (previous !== "ember-ward" && (t.health <= definition(t.id).health / 2 || s.bloodRage > 0) &&
      this.canUseAttack(t, "strike") && s.stamina > 0 && s.health > fireDamage) return "ember-ward";
    return "fireball";
  }
  private acquireOrRelease(t: ThreatState, dt: number): void {
    if (!t.active || t.health <= 0) return;
    const d = definition(t.id), s = this.state;
    if (t.phase === "returning") { this.returnHome(t, dt); return; }
    if (!t.aggro) {
      this.patrol(t, dt);
      if (s.phase === "expedition" && s.position.z > 2 && d.disposition === "hostile" && distance(s.position, t.position) <= d.aggroRange && this.clearPath(t.position, s.position)) this.engage(t);
      // Hostile creatures close to an engaged ally answer the call, but only
      // across a short, clear path. This keeps pulls local instead of waking
      // the whole forest and leaves neutral creatures untouched.
      if (!t.aggro && s.phase === "expedition" && s.position.z > 2 && s.combat.clock.phase !== "idle" && distance(s.position,d.position) <= d.leash && d.disposition === "hostile") {
        const ally = s.world.threats.find(other => other !== t && other.aggro && other.health > 0 && distance(t.position, other.position) <= 9 && this.clearPath(t.position, other.position));
        if (ally) { this.engage(t); this.report(`${d.name} answers its ally's call.`, "combat"); }
      }
    } else if (s.phase !== "expedition" || s.position.z <= 2 || distance(s.position, d.position) > d.leash || distance(t.position, d.position) > d.leash) this.releaseThreat(t);
  }
  private recover(action: AdventureAction | "equip", duration: number): void {
    this.state.currentAction = action; this.state.actionDuration = duration; this.state.actionCooldown = duration;
  }
  private inCombat(): boolean {
    return this.state.phase === "expedition" && this.state.world.threats.some(t => t.active && t.health > 0 && t.aggro);
  }
  private spendStamina(cost: number): void {
    const s = this.state;

    s.stamina -= cost;
  }
  private advanceResources(dt: number): void {
    const s = this.state;
    if (s.bloodRage === 0) { s.rageDrainSeconds = 0; s.rageDecaySeconds = 0; return; }
    if (s.archetype !== "hunter") {
      s.rageDrainSeconds -= dt;
      if (s.rageDrainSeconds <= EPSILON) {
        s.rageDrainSeconds += COMBAT_RULES.bloodRage.drainSeconds;
        this.hurt(s.bloodRage * COMBAT_RULES.bloodRage.drainPerStack, classKit(s.archetype).powerName, true);
        if (s.health <= 0) return;
      }
    }
    if (this.inCombat()) s.rageDecaySeconds = 0;
    else {
      if (s.rageDecaySeconds <= EPSILON) s.rageDecaySeconds = COMBAT_RULES.bloodRage.decaySeconds;
      s.rageDecaySeconds -= dt;
      if (s.rageDecaySeconds <= EPSILON) {
        s.bloodRage--; s.rageDecaySeconds = s.bloodRage > 0 ? COMBAT_RULES.bloodRage.decaySeconds : 0;
        if (s.bloodRage === 0) s.rageDrainSeconds = 0;
      }
    }
  }
  private releaseThreat(t: ThreatState): void {
    if (t.health < definition(t.id).health) this.report(`${definition(t.id).name} breaks contact and recovers while returning home.`, "combat");
    t.health = definition(t.id).health;
    t.actionSequence = 0;
    t.shield = 0; t.contributors = [];
    for (const player of this.participants()) player.clearTargetQueue(t.id);
    t.targetPlayerId = null; t.joinCycle = 0; t.windowCycle = 0; t.specialLaunched = false; t.specialResolved = false;
    t.aggro = false; t.remainingSeconds = 0; t.lastActionHit = false; t.moving = false; t.abilityIndex = 0;
    t.damage = definition(t.id).damage;
    if (t.wolf) {
      t.wolf.motion = null; t.wolf.circling = false;
      t.wolf.nextAttackSeconds = COMBAT_RULES.enemy.preparation; t.position.y = 0;
      t.damage = 18;
    }
    if (t.head) t.head = newHead();
    const d = definition(t.id);
    t.phase = !t.active ? "dormant" : distance(t.position, d.position) > EPSILON ? "returning" : d.patrol ? "patrol" : "dormant";
  }
  private returnHome(t: ThreatState, dt: number): void {
    this.moveThreat(t, definition(t.id).position, dt);
    if (distance(t.position, definition(t.id).position) <= EPSILON) {
      t.phase = definition(t.id).patrol ? "patrol" : "dormant"; t.patrolIndex = 1; t.targetPosition = { ...t.position };
    }
  }
  private patrol(t: ThreatState, dt: number): void {
    const route = definition(t.id).patrol;
    if (!route) return;
    t.phase = "patrol";
    if (t.remainingSeconds > 0) { t.remainingSeconds = Math.max(0, t.remainingSeconds - dt); return; }
    const destination = route[t.patrolIndex % route.length]!;
    this.moveThreat(t, destination, dt);
    if (distance(t.position, destination) <= EPSILON) {
      t.patrolIndex = (t.patrolIndex + 1) % route.length;
      t.remainingSeconds = 0.75;
    }
    t.targetPosition = { ...t.position };
  }
  private pursue(t: ThreatState, dt: number): void {
    const d = definition(t.id), gap = distance(t.position, this.state.position) - this.ability(t).range;
    const speed = d.pursuitSpeed ?? d.speed;
    if (gap > EPSILON && speed > 0) this.moveThreat(t, this.state.position, Math.min(dt, gap / speed));
    t.targetPosition = { ...t.position };
  }
  private moveThreat(t: ThreatState, destination: Position, dt: number, speed = t.aggro ? definition(t.id).pursuitSpeed ?? definition(t.id).speed : definition(t.id).speed): void {
    if (speed === 0 || this.rootedSeconds(t) > EPSILON) return;
    let next = destination;
    if (!this.clearPath(t.position, destination)) {
      // The eastern thicket reaches the world edge; its western corners form the passage.
      const south = point(THICKET[0] - 0.05, THICKET[2] - 0.05), north = point(THICKET[0] - 0.05, THICKET[3] + 0.05);
      const routes = [[south], [north], [south, north], [north, south]];
      let shortest = Infinity;
      for (const route of routes) {
        const points = [t.position, ...route, destination];
        let length = 0;
        for (let i = 1; i < points.length; i++) {
          if (!this.clearPath(points[i - 1]!, points[i]!)) { length = Infinity; break; }
          length += distance(points[i - 1]!, points[i]!);
        }
        if (length < shortest) { shortest = length; next = points[1]!; }
      }
      if (!Number.isFinite(shortest)) return;
    }
    const length = distance(t.position, next);
    if (length <= EPSILON) return;
    const amount = Math.min(length, speed * dt) / length;
    t.position.x += (next.x - t.position.x) * amount;
    t.position.z += (next.z - t.position.z) * amount;
    t.moving = true;
    if (t.wolf) t.wolf.facing = this.direction(t.position, next);
  }
  private advanceThreat(t: ThreatState, dt: number): void {
    if (t.id === "ritual-guardian" && t.abilityIndex === 2) {
      if (!t.specialResolved && this.state.combat.clock.phase === "active" && t.windowCycle === this.state.combat.clock.cycle && this.windowTime(t) >= t.specialOffset - EPSILON) {
        t.shield = 60; t.actionSequence++; t.specialLaunched = true; t.specialResolved = true;
        this.report("Foreman Nine raises Safety Shield: 60 Block until this round ends.", "combat");
      }
      t.phase = t.specialResolved ? "recovery" : "preparation"; t.remainingSeconds = this.nextWindowSeconds(); return;
    }
    if (t.head) { this.advanceHead(t, dt); return; }
    if (t.wolf) { this.advanceWolf(t, dt); return; }
    const at = this.windowTime(t), eligible = this.state.combat.clock.phase === "active" && t.windowCycle === this.state.combat.clock.cycle;
    if (!t.specialLaunched) {
      this.pursue(t, dt); t.phase = "preparation"; t.remainingSeconds = Math.max(0, t.specialOffset - at);
      t.targetPosition = { ...t.position };
      if (eligible && at >= t.specialOffset - OTHER_PHASE_SECONDS.action - EPSILON) {
        t.specialLaunched = true; t.phase = "action"; t.targetPosition = { ...t.position };
      }
    }
    if (t.specialLaunched && !t.specialResolved) {
      t.remainingSeconds = Math.max(0, t.specialOffset - at);
      if (eligible && at >= t.specialOffset - EPSILON) { this.resolveAttack(t); t.specialResolved = true; t.phase = "recovery"; }
    } else if (t.specialResolved) {
      t.remainingSeconds = Math.max(0, t.specialOffset + OTHER_PHASE_SECONDS.recovery - at);
      if (t.remainingSeconds <= EPSILON) { t.phase = "preparation"; this.pursue(t, dt); }
    }
  }
  private nextWindowSeconds(): number {
    const c = this.state.combat;
    return c.clock.phase === "idle" ? 0 : COMBAT_RULES.window[c.clock.phase] - c.clock.elapsedSeconds;
  }
  private currentActivity(t: ThreatState): ThreatForecastEntry | null {
    if (t.health <= 0 || !t.active || !t.aggro || this.state.combat.clock.phase === "choosing") return null;
    if (t.head) {
      const h = t.head, at = this.windowTime(t), fireball = h.events.find(e => e.ability === "fireball" && e.status === "active");
      if (fireball) return { ability: headAbility("fireball", fireball.volley), remainingSeconds: Math.max(0, fireball.offsetSeconds + (fireball.volley - 1) * fireball.spacing - at), status: "active" };
      if (h.block > 0 && h.blockSeconds > EPSILON) return { ability: headAbility("ember-ward", h.volley), remainingSeconds: h.blockSeconds, status: "active" };
      return null;
    }
    return t.phase === "action" ? { ability: this.ability(t), remainingSeconds: t.remainingSeconds, status: "active" } : null;
  }
  private forecast(t: ThreatState): ThreatView["forecast"] {
    if (t.health <= 0 || !t.active) return [];
    if (!t.aggro) return [{ ability: t.head ? headAbility("ember-beam", 1) : this.ability(t), remainingSeconds: 0, status: "stored" }];
    if (this.state.combat.clock.phase === "choosing" || t.windowCycle < t.joinCycle) return [];
    const at = this.windowTime(t);
    if (t.head) {
      return t.head.events.filter(e => e.status === "pending").map(e => ({ ability: headAbility(e.ability, e.volley), remainingSeconds: Math.max(0, e.offsetSeconds - at), status: "pending" }));
    }
    return t.specialLaunched || t.specialResolved ? [] : [{ ability: this.ability(t), remainingSeconds: Math.max(0, t.specialOffset - at), status: "pending" }];
  }
  private headAbility(t: ThreatState, next: boolean): ThreatAbilityView {
    const h = t.head!;
    if (!h.opened) return headAbility("ember-beam", 1);
    const events = h.events.filter(e => e.status !== "done"), event = events[next ? 1 : 0] ?? events[0];
    return event ? headAbility(event.ability, event.volley) : headAbility(h.events[0]?.ability ?? "ember-beam", h.volley);
  }
  private headInRange(t: ThreatState): boolean {
    return distance(t.position, this.state.position) <= definition(t.id).reach + EPSILON && this.clearPath(t.position, this.state.position);
  }
  private headWard(t: ThreatState): void {
    const h = t.head!; h.opened = true; h.block = COMBAT_RULES.head.ward; h.blockSeconds = COMBAT_RULES.head.wardDuration;
    this.report("Cinder Watchman raises a ward: 6 block for 2 seconds.", "combat");
  }
  private advanceHead(t: ThreatState, dt: number): void {
    const h = t.head!, c = this.state.combat, at = this.windowTime(t);
    const eligible = c.clock.phase === "active" && t.windowCycle === c.clock.cycle;
    const gap = distance(t.position, this.state.position) - 8;
    if (gap > 0) this.moveThreat(t, this.state.position, Math.min(dt, gap / definition(t.id).speed));
    t.targetPosition = { ...this.state.position };
    h.blockSeconds = Math.max(0, h.blockSeconds - dt);
    if (h.blockSeconds <= EPSILON) { h.blockSeconds = 0; h.block = 0; }
    for (const e of h.events) {
      e.remainingSeconds = e.offsetSeconds - at;
      if (e.status === "done") continue;
      if (e.ability === "fireball") {
        while (e.launched < e.volley && at >= e.offsetSeconds + e.launched * e.spacing - COMBAT_RULES.head.fireballTravel - EPSILON) {
          const impactOffset = e.offsetSeconds + e.launched * e.spacing;
          if (this.headInRange(t)) h.fireballs.push({ impactOffset, id: ++h.projectileSequence, origin: { ...t.position }, remainingSeconds: Math.max(0, impactOffset - at), duration: COMBAT_RULES.head.fireballTravel, damage: COMBAT_RULES.head.fireballDamage });
          e.launched++; e.status = "active";
          if (e.launched === 1) { t.actionSequence++; this.report(`Cinder Watchman prepares ${e.volley} fireball${e.volley === 1 ? "." : "s."}`, "combat"); }
        }
        if (eligible && at >= e.offsetSeconds + (e.volley - 1) * e.spacing - EPSILON) e.status = "done";
      } else if (e.status === "pending" && eligible && at >= e.offsetSeconds - EPSILON) {
        if (e.ability === "ember-beam") {
          if (!this.headInRange(t)) continue;
          h.opened = true; e.status = "done"; this.hurt(COMBAT_RULES.head.beamDamage, "Cinder Watchman — Ember Beam");
        } else if (e.ability === "ember-ward") {
          if (!h.opened && !this.headInRange(t)) continue;
          this.headWard(t); e.status = "active";
        } else { h.volley++; e.status = "done"; this.report(`Cinder Watchman grows stronger: ${h.volley} fireballs per volley.`, "combat"); }
        t.actionSequence++;
      } else if (e.status === "active" && e.ability === "ember-ward" && at >= e.offsetSeconds + COMBAT_RULES.head.wardDuration - EPSILON) e.status = "done";
    }
    for (const ball of h.fireballs) {
      ball.remainingSeconds = Math.max(0, ball.impactOffset - at);
      if (eligible && ball.impactOffset <= at + EPSILON && this.headInRange(t)) this.hurt(ball.damage, "Cinder Watchman — Fireball");
      if (this.state.health <= 0) return;
    }
    h.fireballs = h.fireballs.filter(ball => ball.impactOffset > at + EPSILON);
    const event = h.events.find(e => e.status !== "done");
    t.abilityIndex = event?.ability === "fireball" ? 0 : event?.ability === "kindle" ? 2 : 1;
    t.phase = event?.status === "active" ? event.ability === "ember-ward" ? "recovery" : "action" : "preparation";
    t.remainingSeconds = event ? Math.max(0, event.remainingSeconds) : this.nextWindowSeconds();
    t.damage = event ? headAbility(event.ability, event.volley).damage : 0;
  }
  private reachableEndpoint(from: Position, to: Position): Vector {
    const destination = point(Math.max(-12, Math.min(12, to.x)), Math.max(-14, Math.min(45, to.z)));
    const steps = Math.max(1, Math.ceil(distance(from, destination) / 0.05));
    let reachable = point(from.x, from.z);
    for (let step = 1; step <= steps; step++) {
      const next = point(from.x + (destination.x - from.x) * step / steps, from.z + (destination.z - from.z) * step / steps);
      if (this.blocked(next.x, next.z)) break;
      reachable = next;
    }
    return reachable;
  }
  private wolfEndpoint(t: ThreatState): Vector {
    if (this.rootedSeconds(t) > EPSILON) return point(t.position.x, t.position.z);
    const facing = this.direction(t.position, this.state.position);
    const length = Math.min(distance(t.position, this.state.position), COMBAT_RULES.wolf.lungeDistance);
    return this.reachableEndpoint(t.position, point(t.position.x + facing.x * length, t.position.z + facing.z * length));
  }
  private launchMaul(t: ThreatState): void {
    const w = t.wolf;
    if (!w) return;
    t.position.y = 0;
    w.facing = this.direction(t.position, this.state.position); w.circling = false;
    w.attackOrigin = { ...t.position };
    t.targetPosition = this.wolfEndpoint(t);
    w.motion = { kind: "lunge", start: { ...t.position }, destination: { ...t.targetPosition },
      remainingSeconds: COMBAT_RULES.enemy.action, duration: COMBAT_RULES.enemy.action };
    t.phase = "action"; t.abilityIndex = 1; t.lastActionHit = false;
    t.remainingSeconds = COMBAT_RULES.enemy.action;
    if (this.rootedSeconds(t) > EPSILON) this.groundWolfMotion(t);
  }
  private groundWolfMotion(t: ThreatState): void {
    const motion = t.wolf?.motion;
    if (!motion) return;
    motion.start = point(t.position.x, t.position.z); motion.destination = { ...motion.start };
    t.targetPosition = { ...motion.destination };
  }
  private moveWolfMotion(t: ThreatState, dt: number): void {
    const w = t.wolf, motion = w?.motion;
    if (!w || !motion) return;
    const old = { ...t.position };
    motion.remainingSeconds = Math.max(0, motion.remainingSeconds - dt);
    const progress = 1 - motion.remainingSeconds / motion.duration;
    t.position.x = motion.start.x + (motion.destination.x - motion.start.x) * progress;
    t.position.z = motion.start.z + (motion.destination.z - motion.start.z) * progress;
    t.position.y = 4 * COMBAT_RULES.wolf.lungeHeight * progress * (1 - progress);
    t.moving = Math.hypot(t.position.x - old.x, t.position.y - old.y, t.position.z - old.z) > EPSILON;
    if (distance(motion.start, motion.destination) > EPSILON) w.facing = this.direction(motion.start, motion.destination);
    if (motion.remainingSeconds > EPSILON) return;
    t.position.y = 0; w.motion = null;
  }
  private positionWolf(t: ThreatState, dt: number): void {
    const w = t.wolf;
    if (!w) return;
    w.facing = this.direction(t.position, this.state.position); w.circling = false;
    if (w.motion) { this.moveWolfMotion(t, dt); return; }
    if (this.rootedSeconds(t) > EPSILON) return;
    const gap = distance(t.position, this.state.position);
    if (gap > COMBAT_RULES.wolf.circleRange) {
      this.moveThreat(t, this.state.position, dt);
      w.facing = this.direction(t.position, this.state.position);
    } else {
      const radial = Math.max(-1, Math.min(1, gap - COMBAT_RULES.wolf.circleRadius));
      const tangentX = -w.facing.z, tangentZ = w.facing.x;
      const norm = Math.hypot(tangentX + w.facing.x * radial, tangentZ + w.facing.z * radial);
      const amount = COMBAT_RULES.wolf.circleSpeed * dt / norm;
      const next = this.reachableEndpoint(t.position, point(t.position.x + (tangentX + w.facing.x * radial) * amount,
        t.position.z + (tangentZ + w.facing.z * radial) * amount));
      t.moving = distance(t.position, next) > EPSILON; t.position = next; w.circling = t.moving;
      w.facing = this.direction(t.position, this.state.position);
    }
  }
  private advanceWolf(t: ThreatState, dt: number): void {
    const w = t.wolf!, c = this.state.combat, at = this.windowTime(t);
    const eligible = c.clock.phase === "active" && t.windowCycle === c.clock.cycle;
    w.circling = false;
    if (this.state.health <= 0) return;
    if (!t.specialLaunched && eligible && at >= t.specialOffset - COMBAT_RULES.enemy.action - EPSILON) {
      if (w.motion) { w.motion = null; t.position.y = 0; }
      this.launchMaul(t); t.specialLaunched = true;
    } else if (w.motion?.kind === "lunge") this.moveWolfMotion(t, dt);
    if (t.specialLaunched && !t.specialResolved) {
      t.phase = "action"; t.remainingSeconds = Math.max(0, t.specialOffset - at);
      if (eligible && at >= t.specialOffset - EPSILON) {
        t.position.y = 0; w.motion = null; this.resolveAttack(t); t.specialResolved = true; t.phase = "recovery";
      }
    } else if (t.specialResolved && at < t.specialOffset + COMBAT_RULES.enemy.recovery - EPSILON) {
      t.phase = "recovery"; t.remainingSeconds = t.specialOffset + COMBAT_RULES.enemy.recovery - at;
    } else {
      t.phase = "preparation";
      this.positionWolf(t, dt);
      t.remainingSeconds = Math.max(0, t.specialResolved ? this.nextWindowSeconds() : t.specialOffset - COMBAT_RULES.enemy.action - at);
      t.targetPosition = this.wolfEndpoint(t);
    }
    w.nextAttackSeconds = t.specialResolved ? this.nextWindowSeconds() : Math.max(0, t.specialOffset - COMBAT_RULES.enemy.action - at);
  }
  private resolveAttack(t: ThreatState): void {
    t.lastActionHit = t.id === "ritual-guardian" && t.abilityIndex === 0 ? distance(this.state.position, t.position) <= this.ability(t).range + EPSILON : (distance(this.state.position, t.targetPosition) <= this.ability(t).range + EPSILON &&
      this.clearPath(t.targetPosition, this.state.position));
    t.actionSequence += 1;
    if (t.lastActionHit) this.hurt(t.damage, `${definition(t.id).name} — ${this.intention(t)}`);
    else this.report(`${definition(t.id).name} — ${this.intention(t)} misses you.`, "combat");
  }
  private hurt(damage: number, source: string, bypassBlock = false): void {
    const s = this.state;
    const blocked = !bypassBlock && s.guardSeconds > EPSILON ? Math.min(damage, s.block) : 0;
    s.block -= blocked;
    if (s.block === 0) s.guardSeconds = 0;
    const remainder = damage - blocked;
    const taken = Math.min(s.health, remainder === 0 ? 0 : bypassBlock ? remainder : Math.max(1, remainder - this.progression().damageReduction));
    s.health -= taken;
    this.report(`${source} hits you for ${taken} damage${blocked > 0 ? ` (${blocked} blocked by Brace)` : ""}.`, "combat");
    if (s.health > 0) return;
    s.maneuver = null; s.block = 0; s.guardSeconds = 0; s.combat = newCombat(this.shared?.clock);
    s.phase = "lost"; s.cargo = 0; s.carriedRelics = 0; s.carriedSalvage = 0; s.supplies = 0; s.bankedRelics = 0;
    if (!this.shared) for (const enemy of s.world.threats) if (enemy.head) enemy.head.fireballs = [];
    this.lootOpenId = null;
    s.potions = 0; this.shopOpen = false; this.innOpen = false; this.moving = false; this.backpedaling = false;
    this.report("You fall. Your journey ends; carried rewards and personal stores are lost.", "combat");
  }
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("Invalid adventure save: expected an object.");
  return value as Record<string, unknown>;
}
function number(value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER, integer = false): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) {
    throw new Error("Invalid adventure save: invalid number.");
  }
  return value;
}
function boolean(value: unknown): boolean {
  if (typeof value !== "boolean") throw new Error("Invalid adventure save: invalid flag.");
  return value;
}
function text(value: unknown): string {
  if (typeof value !== "string") throw new Error("Invalid adventure save: invalid text.");
  return value;
}
function choice<T extends string>(value: unknown, choices: readonly T[]): T {
  const match = choices.find(item => item === value);
  if (match === undefined) throw new Error("Invalid adventure save: unknown value.");
  return match;
}
function groundPosition(value: unknown, maximumHeight = 0): Vector {
  const p = record(value);
  return { x: number(p.x, -12, 12), y: number(p.y, 0, maximumHeight), z: number(p.z, -14, 45) };
}
function readSave(serialized: string, now = Date.now()): State {
  let parsed: unknown;
  try { parsed = JSON.parse(serialized); }
  catch { throw new Error("Invalid adventure save: unreadable saved data."); }
  const root = record(parsed);
  if (root.version !== 1 && root.version !== 2 && root.version !== 3 && root.version !== 4 && root.version !== 5 && root.version !== 6 && root.version !== 7 && root.version !== 8 && root.version !== 9) throw new Error("Unsupported adventure save version.");
  const v8 = root.version === 8 || root.version === 9, v7 = root.version === 7 || v8;
  const current = root.version === 4 || root.version === 5 || root.version === 6 || v7, latest = root.version === 5 || root.version === 6 || v7, headVersion = root.version === 6 || v7;
  const s = record(root.state), p = record(s.position);
  if (!Array.isArray(s.threats) || s.threats.length !== DEFINITIONS.length) throw new Error("Invalid adventure save: missing threats.");
  const threats: ThreatState[] = s.threats.map((value: unknown) => {
    const t = record(value);
    const id = choice(t.id, DEFINITIONS.map(d => d.id));
    let phase = choice(t.phase, root.version === 1
      ? ["dormant", "preparation", "action", "recovery", "cleared"] as const
      : current ? ["dormant", "patrol", "approach", "preparation", "action", "recovery", "returning", "cleared"] as const
      : ["dormant", "approach", "preparation", "action", "recovery", "returning", "cleared"] as const);
    const health = id === "ritual-guardian" && t.active === false && s.chapter === undefined ? definition(id).health : number(t.health, 0, definition(id).health);
    const active = boolean(t.active);
    // Town return previously set the unsummoned guardian to patrol.
    if (id === "ritual-guardian" && !active && phase === "patrol" && t.aggro === false && s.ritualCalled === false && health === definition(id).health) phase = "dormant";
    if ((health === 0) !== (phase === "cleared") || (!active && phase !== "dormant") || (id !== "ritual-guardian" && !active)) {
      throw new Error(`Invalid adventure save: inconsistent threat ${id}.`);
    }
    const head = headVersion && id === "scout" ? readHead(t.head, v7, v8, root.version === 8) : null;
    const maxDuration = v8 ? 20 : v7 && id === "scout" ? 10 : headVersion ? id === "scout" ? phase === "action" ? 0.6 + ((head?.volley ?? 1)-1)*0.2 : phase === "preparation" || phase === "recovery" ? 5 : 0 : (id === "patrol" ? PHASE_SECONDS : OTHER_PHASE_SECONDS)[phase] : (current && id === "scout" ? PHASE_SECONDS : OTHER_PHASE_SECONDS)[phase];
    const result: ThreatState = { id, health, active, phase,
      contributors: t.contributors === undefined ? [] : stringList(t.contributors), rollClaims: t.rollClaims === undefined ? [] : stringList(t.rollClaims), shield: t.shield === undefined ? 0 : number(t.shield, 0, 60),
      respawnAt: health === 0
        ? t.respawnAt === undefined || t.respawnAt === null ? now + WORLD_RESPAWN_MILLISECONDS : number(t.respawnAt)
        : null,
      rng: v8 && t.rng !== undefined ? number(t.rng, 0, 0xffffffff, true) : seedForThreat(id),
      joinCycle: v8 ? number(t.joinCycle, 0, Number.MAX_SAFE_INTEGER, true) : 0,
      windowCycle: v8 ? number(t.windowCycle, 0, Number.MAX_SAFE_INTEGER, true) : 0,
      specialOffset: v8 ? number(t.specialOffset, 0, root.version === 8 ? 4.99 : COMBAT_RULES.window.active - 0.01) : 0,
      specialLaunched: v8 ? boolean(t.specialLaunched) : false, specialResolved: v8 ? boolean(t.specialResolved) : false,
      remainingSeconds: number(t.remainingSeconds, 0, maxDuration),
      actionSequence: number(t.actionSequence, 0, Number.MAX_SAFE_INTEGER, true), lastActionHit: boolean(t.lastActionHit),
      damage: number(t.damage, id === "ritual-guardian" || headVersion && id === "scout" || !current && id === "scout" ? 0 : definition(id).damage, Number.MAX_SAFE_INTEGER, true),
      position: root.version === 1 ? { ...definition(id).position } : groundPosition(t.position, latest ? COMBAT_RULES.wolf.lungeHeight : 0),
      targetPosition: root.version === 1 ? { ...definition(id).position } : groundPosition(t.targetPosition),
      targetPlayerId: t.targetPlayerId === undefined || t.targetPlayerId === null ? null : text(t.targetPlayerId),
      aggro: root.version === 1 ? phase !== "dormant" && phase !== "cleared" : boolean(t.aggro),
      lootClaimed: root.version === 3 || current ? boolean(t.lootClaimed) : id === "ritual-guardian" && health === 0,
      patrolIndex: current ? number(t.patrolIndex, 0, !headVersion && id === "scout" ? 4 : definition(id).patrol?.length ?? 1, true) : 1,
      moving: current ? boolean(t.moving) : false,
      abilityIndex: current ? number(t.abilityIndex, 0, headVersion ? id === "scout" || id === "ritual-guardian" ? 2 : id === "patrol" ? 1 : 0 : id === "scout" ? 1 : 0, true) : 0,
      wolf: latest ? id === (headVersion ? "patrol" : "scout") ? readWolf(t.wolf, v8) : null : id === "scout" ? newWolf() : null, head,
    };
    // Retired approach-hop migration: retain the ground location and shared combat clock.
    if (result.wolf && latest && record(t.wolf).motion !== null && record(record(t.wolf).motion).kind === "hop") {
      result.position.y = 0; result.wolf.circling = false;
    }
    // Earlier journeys placed the bee inside the briars that its defeat removed.
    // Keep that creature and any unclaimed loot reachable beside the permanent hedge.
    if (id === "nest" && result.position.x > THICKET[0] && result.position.z >= THICKET[2] && result.position.z <= THICKET[3]) {
      result.position.x = THICKET[0] - 0.5;
      result.targetPosition = { ...result.position };
    }
    if (!current) {
      // Old action saves already applied damage at commitment; never replay that hit.
      if (phase === "action") { result.phase = "recovery"; result.remainingSeconds = id === "scout" ? 2 : 2.65; }
      if (id === "scout") {
        result.abilityIndex = ["preparation", "action", "recovery"].includes(phase) ? 1 : 0;
        result.damage = result.abilityIndex === 1 ? 9 : 4;
        if (result.phase === "recovery") result.remainingSeconds = Math.min(result.remainingSeconds, 2);
      }
      if (active && phase === "dormant" && definition(id).patrol) result.phase = "patrol";
    }
    if (root.version === 1 && id === "nest" && health === definition(id).health) {
      result.aggro = false; result.phase = "dormant"; result.remainingSeconds = 0; result.lastActionHit = false;
    }
    if (!latest && result.wolf) {
      const w = result.wolf;
      w.attackOrigin = { ...result.position };
      if (current && result.phase === "action" && result.abilityIndex === 0) {
        // Version 4 Bite already resolved; resume its follow-up notice without replay.
        result.phase = "preparation"; result.remainingSeconds = COMBAT_RULES.enemy.preparation;
      }
      w.nextAttackSeconds = result.phase === "preparation" ? result.remainingSeconds
        : result.phase === "recovery" ? result.remainingSeconds + 3 : COMBAT_RULES.enemy.preparation;
      result.abilityIndex = 1; result.damage = 18;
    }
    if (!headVersion && (id === "scout" || id === "patrol")) {
      result.head = id === "scout" ? newHead() : null; result.wolf = id === "patrol" ? newWolf() : null;
      result.abilityIndex = id === "scout" ? 0 : 1; result.damage = id === "scout" ? 3 : 9; result.position.y = 0;
      if (result.health > 0) { result.phase = result.aggro ? "preparation" : definition(id).patrol ? "patrol" : "dormant"; result.remainingSeconds = result.aggro ? 5 : 0; }
    }
    if (!v7 && id === "scout" && result.head && result.health > 0) {
      const h = result.head;
      h.fireballs = []; h.opened = result.aggro;
      h.events = [];
      result.abilityIndex = result.aggro ? 0 : 1; result.damage = result.aggro ? h.volley * 3 : 0;
      if (result.aggro) { result.phase = "preparation"; result.remainingSeconds = 5; }
    }
    if (result.aggro !== ["approach", "preparation", "action", "recovery"].includes(result.phase)) {
      throw new Error("Invalid adventure save: inconsistent aggression.");
    }
    if (result.lootClaimed && health > 0) throw new Error("Invalid adventure save: living creature already looted.");
    return result;
  });
  if (new Set(threats.map(t => t.id)).size !== DEFINITIONS.length) throw new Error("Invalid adventure save: duplicate threat.");
  const savedArchetype = choice(s.archetype, ["warrior", "mage", "hunter", "alchemist", "artificer"] as const);
  const state: SavedState = {
    chapter: readChapter(s.chapter),
    phase: choice(s.phase, ["town", "expedition", "lost"] as const),
    archetype: savedArchetype,
    position: { x: number(p.x, -12, 12), y: number(p.y, 0, 2), z: number(p.z, -14, 45) },
    verticalSpeed: number(s.verticalSpeed, -6, 5.5), health: number(s.health, 0, 100),
    supplies: number(s.supplies, 0, Number.MAX_SAFE_INTEGER, true), cargo: number(s.cargo, 0, Number.MAX_SAFE_INTEGER, true),
    resourceRemaining: number(s.resourceRemaining, 0, 12, true), potions: number(s.potions, 0, Number.MAX_SAFE_INTEGER, true),
    resourceRespawns: readResourceRespawns(s.resourceRespawns, number(s.resourceRemaining, 0, 12, true), now),
    carriedRelics: number(s.carriedRelics, 0, 1, true), bankedRelics: number(s.bankedRelics, 0, Number.MAX_SAFE_INTEGER, true),
    carriedSalvage: root.version === 3 || current ? number(s.carriedSalvage, 0, Number.MAX_SAFE_INTEGER, true) : 0,
    presence: number(s.presence), ritualCalled: boolean(s.ritualCalled), actionCooldown: number(s.actionCooldown, 0, 2),
    currentAction: v7 && s.currentAction !== null ? choice(s.currentAction, ["strike", "disengage", "brace", "bloodRage", "jab", "guard", "drinkPotion", "gather", "ritual", "equip"] as const) : null,
    actionDuration: v7 ? number(s.actionDuration, 0, 2) : number(s.actionCooldown, 0, 2),
    guardSeconds: Math.min(number(s.guardSeconds, 0, v7 ? 2 : current ? 5 : 3), COMBAT_RULES.brace.duration),
    block: current ? number(s.block, 0, v7 ? COMBAT_RULES.brace.block : 5) : number(s.guardSeconds, 0, 3) > 0 ? 5 : 0,
    stamina: v8 ? number(s.stamina, 0, 5, true) : 5,
    staminaRecoverySeconds: 0,
    bloodRage: v7 ? number(s.bloodRage, 0, 3, true) : 0,
    rageDrainSeconds: v7 ? number(s.rageDrainSeconds, 0, 5) : 0,
    rageDecaySeconds: v7 ? number(s.rageDecaySeconds, 0, 2) : 0,
    maneuver: current ? readManeuver(s.maneuver) : null,
    attackSequence: number(s.attackSequence, 0, Number.MAX_SAFE_INTEGER, true),
    selectedThreat: choice(s.selectedThreat, DEFINITIONS.map(t => t.id)), report: text(s.report), threats, combat: v8 ? readCombat(s.combat, root.version === 8, savedArchetype) : { ...newClock(), queued: [], nextId: 1 },
  };
  if ((state.phase === "lost") !== (state.health === 0) || threats.find(t => t.id === "ritual-guardian")?.active !== state.ritualCalled) {
    throw new Error("Invalid adventure save: inconsistent expedition.");
  }
  if ((state.block === 0) !== (state.guardSeconds === 0) || (state.maneuver !== null && state.phase !== "expedition")) {
    throw new Error("Invalid adventure save: inconsistent combat state.");
  }
  if (!v8 && state.phase === "expedition" && threats.some(t => t.aggro)) {
    state.combat.phase = "preparation";
    for (const t of threats) if (t.aggro) { t.joinCycle = 1; t.windowCycle = 0; t.phase = "preparation"; t.remainingSeconds = 5; }
  }
  if (root.version === 8 && state.combat.phase !== "idle") {
    const wasPreparing = record(s.combat).phase === "preparation";
    state.combat.phase = "preparation"; state.combat.elapsedSeconds = 0;
    state.combat.queued = wasPreparing ? state.combat.queued.filter(e => e.status === "pending") : [];
    state.stamina = COMBAT_RULES.stamina.maximum;
    for (const t of threats) if (t.aggro && t.health > 0) {
      t.windowCycle = 0; t.joinCycle = state.combat.cycle + 1;
      t.specialLaunched = false; t.specialResolved = false; t.specialOffset = 0;
      t.phase = "preparation"; t.remainingSeconds = COMBAT_RULES.window.preparation;
      if (t.wolf) { t.wolf.motion = null; t.position.y = 0; }
      if (t.head) {
        t.head.events = []; t.head.fireballs = [];
      }
    }
    state.report = "Combat now uses three slots. You have five seconds to prepare your next moves.";
  }
  if (state.combat.queued.some(e => e.action === "equip" && e.gear.item !== null && !state.chapter.ownedGear.includes(e.gear.item))) throw new Error("Invalid adventure save: planned gear is not owned.");
  const reserved = state.combat.queued.filter(e => e.status === "pending").reduce((sum,e) => sum + e.cost, 0);
  if (state.combat.queued.filter(e => e.status === "pending" && e.action === "drinkPotion").length > state.potions || reserved > state.stamina || (state.combat.phase !== "idle" && state.phase !== "expedition") || state.combat.queued.some(e => e.status === "pending" && state.combat.phase === "active" && e.offsetSeconds < state.combat.elapsedSeconds - EPSILON)) throw new Error("Invalid adventure save: inconsistent combat plan.");
  const { threats: restoredThreats, resourceRemaining, resourceRespawns, ritualCalled, combat, ...player } = state;
  const { queued, nextId, ...clock } = combat;
  return { ...player, world: { threats: restoredThreats, resourceRemaining, resourceRespawns, ritualCalled }, combat: { clock, queued, nextId } };
}

function readResourceRespawns(value: unknown, remaining: number, now: number): WorldState["resourceRespawns"] {
  if (value !== undefined && !Array.isArray(value)) throw new Error("Invalid adventure save: invalid core regrowth.");
  const batches = (value ?? []).map((item: unknown) => {
    const batch = record(item);
    return { at: number(batch.at), quantity: number(batch.quantity, 1, 12, true) };
  });
  const missing = 12 - remaining - batches.reduce((sum, batch) => sum + batch.quantity, 0);
  if (missing < 0) throw new Error("Invalid adventure save: too many regrowing cores.");
  if (missing > 0) batches.push({ at: now + WORLD_RESPAWN_MILLISECONDS, quantity: missing });
  return batches;
}

function readWolf(value: unknown, v8 = false): WolfState {
  const w = record(value), f = record(w.facing);
  let motion: WolfMotion | null = null;
  if (w.motion !== null) {
    const m = record(w.motion), kind = choice(m.kind, ["hop", "lunge"] as const);
    const savedDuration = number(m.duration, 0, 1);
    const duration = kind === "hop" ? savedDuration === 0.5 ? 0.5 : 0.7 : COMBAT_RULES.enemy.action;
    const savedMotion = { start: groundPosition(m.start), destination: groundPosition(m.destination),
      remainingSeconds: number(m.remainingSeconds, 0, duration), duration: number(m.duration, duration, duration) };
    if (kind === "lunge") motion = { kind, ...savedMotion };
  }
  return { facing: { x: number(f.x, -1, 1), y: number(f.y, 0, 0), z: number(f.z, -1, 1) }, motion,
    nextAttackSeconds: number(w.nextAttackSeconds, 0, v8 ? 10 : COMBAT_RULES.enemy.preparation), circling: boolean(w.circling),
    attackOrigin: groundPosition(w.attackOrigin) };
}
function readManeuver(value: unknown): Maneuver | null {
  if (value === null) return null;
  const m = record(value), kind = choice(m.kind, ["lunge", "disengage"] as const), f = record(m.facing);
  return { kind, targetId: choice(m.targetId, DEFINITIONS.map(t => t.id)),
    start: groundPosition(m.start), destination: groundPosition(m.destination),
    facing: { x: number(f.x, -1, 1), y: number(f.y, 0, 0), z: number(f.z, -1, 1) },
    remainingSeconds: number(m.remainingSeconds, 0, kind === "lunge" ? COMBAT_RULES.strike.duration : COMBAT_RULES.disengage.duration) };
}

export function createAdventure(options: AdventureOptions = {}): AdventureGame {
  return new Adventure(options);
}

export function createSharedAdventure(options: Pick<AdventureOptions, "save" | "now"> = {}): SharedAdventure {
  return Adventure.sharedAdventure(options);
}

function readHead(value: unknown, v7: boolean, v8 = false, legacyFiveSlotWindow = false): HeadState {
  const h = record(value);
  if (!Array.isArray(h.fireballs)) throw new Error("Invalid adventure save: missing fireballs.");
  const events: HeadEvent[] = [];
  if (v8) {
    if (!Array.isArray(h.events) || h.events.length > 1) throw new Error("Invalid adventure save: missing announced moves.");
    for (const value of h.events) {
      const e = record(value), volley = number(e.volley, 1, Number.MAX_SAFE_INTEGER, true);
      events.push({ offsetSeconds: v8 ? number(e.offsetSeconds, 0, legacyFiveSlotWindow ? 4.99 : COMBAT_RULES.window.active - 0.01) : 0, spacing: v8 ? number(e.spacing, 0, 0.2) : 0.2, ability: choice(e.ability, ["ember-beam", "fireball", "ember-ward", "kindle"] as const),
        remainingSeconds: number(e.remainingSeconds, v8 ? -5 : -(volley - 1) * COMBAT_RULES.head.fireballSpacing - 1, 15),
        status: choice(e.status, ["pending", "active", "done"] as const), volley, launched: number(e.launched, 0, volley, true) });
    }
  }
  return { opened: v7 ? boolean(h.opened) : false, events,
    block: number(h.block,0,6), blockSeconds: number(h.blockSeconds,0,5), volley: number(h.volley,1,Number.MAX_SAFE_INTEGER,true),
    projectileSequence: number(h.projectileSequence,0,Number.MAX_SAFE_INTEGER,true),
    fireballs: h.fireballs.map(value => { const p=record(value); return {impactOffset:v8?number(p.impactOffset,0,legacyFiveSlotWindow ? 4.99 : COMBAT_RULES.window.active - 0.01):0,id:number(p.id,1,Number.MAX_SAFE_INTEGER,true),origin:groundPosition(p.origin),remainingSeconds:number(p.remainingSeconds,0,Number.MAX_SAFE_INTEGER),duration:number(p.duration,0.9,0.9),damage:number(p.damage,3,COMBAT_RULES.head.fireballDamage)}; }) };
}

function foremanAbility(index: number, damage: number): ThreatAbilityView {
  if (index === 2) return { id: "foreman-shield", name: "Safety Shield", description: "Raises 60 Block on turn 1 for the rest of the active round. Attack before it rises or use this round to recover. It deals no damage.", damage: 0, range: 0, noticeSeconds: 5 };
  if (index === 0) return { id: "foreman-pulse", name: "Roll-call Pulse", description: `Deals ${damage} damage to its pursued target at the announced time within 22 metres. It cannot be dodged or stopped by cover; Block absorbs damage. Each completed three-move cycle adds 4 damage.`, damage, range: 22, noticeSeconds: 5 };
  return { id: "foreman-press", name: "Final Press", description: `Deals ${damage} damage within 3.5 metres of the marked ground, 0.35 seconds after its chosen turn. The area follows Foreman Nine until that turn, then stays fixed. Leave the area or Disengage; Block absorbs damage. Each completed three-move cycle adds 4 damage.`, damage, range: 3.5, noticeSeconds: 5 };
}
function headAbility(id: HeadAbilityId, volley: number): ThreatAbilityView {
  if (id === "ember-beam") return { id, name: "Ember Beam", description: "Its single opening action deals 8 damage within 10 metres. Block absorbs it; cover and leaving reach prevent it. A joining head waits for the next shared active opening.", damage: COMBAT_RULES.head.beamDamage, range: 10, noticeSeconds: 0 };
  if (id === "ember-ward") return { id, name: "Ember Ward", description: "Absorbs 6 damage for 2 seconds. The shield rises on its announced turn and persists while you act, then expires.", damage: 0, range: 10, noticeSeconds: 5 };
  if (id === "kindle") return { id, name: "Kindle", description: "Prepares during the shared 5-second preparation, then adds one fireball on its announced turn. Use the unshielded active turns to attack. No enemy attack deals damage during preparation.", damage: 0, range: 0, noticeSeconds: 5 };
  return { id, name: `Fireball ×${volley}`, description: `${volley} homing fireball${volley === 1 ? "" : "s"}, ${COMBAT_RULES.head.fireballDamage} damage each. First impact lands at the announced time; further impacts follow up to 0.2 seconds apart, closer when needed to finish before preparation. Brace around impact. Cover or leaving 10-metre reach prevents damage; defeating the head extinguishes its fireballs.`, damage: COMBAT_RULES.head.fireballDamage * volley, range: 10, noticeSeconds: 5 };
}
function maulAbility(damage = 18): ThreatAbilityView {
  return { id: "maul", name: "Lunging Maul", description: "Leaps up to 8 metres; each preparation chooses one of three active turns (33% each). It leaps on that turn and lands 0.65 seconds later in a 2-metre area, then recovers for 2 seconds. Move as it leaps to dodge, then attack if a turn remains. Its first Maul lands 1.65 seconds after engagement, leaving turn 3 for your counterattack. Additional hounds join the next window. Maul gains 2 damage after each attack, up to 36; read its next damage before committing.", damage, range: COMBAT_RULES.wolf.impactRadius, noticeSeconds: 5 };
}
function ordinaryAbility(d: ThreatDefinition, damage = d.damage): ThreatAbilityView {
  return { id: d.id, name: d.intention, description: `${d.preparation}. ${d.id === "nest" ? "Attacking enrages it: it pursues at 4.8 metres per second within 18 metres of its home. Its first retaliation follows a full five-second preparation. Each preparation chooses one of three turns (33% each)." : "During preparation it announces one of three active turns (33% each)."} Its highlighted area follows it until that turn, then locks in place; the strike lands 0.35 seconds later and recovers for 2.65 seconds. Additional enemies join the next active opening. Each attack raises its next damage by 15% of base damage, up to double. Forest attention adds further damage. The announced damage stays fixed through the window.`, damage, range: d.reach, noticeSeconds: 5 };
}
export function getMonsterLore(): readonly MonsterLoreEntry[] {
  return DEFINITIONS.map(d => {
    if (d.id === "ritual-guardian") return {
      id: d.id, name: d.name, health: d.health, disposition: d.disposition,
      description: "The last foreman of the Ninth Bell Engine. Six coolant crystals wake it. Search its remains for the Last Shift Roll.",
      opener: "Announces Roll-call Pulse and gives at least five seconds to prepare before its first active round.",
      abilities: [foremanAbility(0,32), foremanAbility(1,48), foremanAbility(2,0)],
      sequences: [{ name: "The final shift", abilityIds: ["foreman-pulse", "foreman-press", "foreman-shield"], offsetsSeconds: [], description: "One move per round: Pulse, Press, then Shield. Pulse and Press choose one of three turns; Shield always rises on turn 1. After each cycle Pulse and Press gain 4 damage. Every round has 3 active seconds, 1 Choosing second, and 5 Preparation seconds." }],
      strategy: "Bring your coat, weapon and potions. Block the unavoidable Pulse, leave the Press area, and heal while Shield is raised. Attacking without responding loses to the growing pressure.",
    };
    if (d.behavior === "head") return {
      id: d.id, name: d.name, health: d.health, disposition: d.disposition,
      description: "A floating fire spirit wandering around the first clearing. Notices you within 6 metres and pursues while you remain within 14 metres of its home.",
      opener: "Stored Ember Beam: 8 damage at its first active opening within 10 metres. A joining head waits for the next shared opening. This is its only action in that window.",
      abilities: [headAbility("ember-beam", 1), headAbility("fireball", 1), headAbility("ember-ward", 1), headAbility("kindle", 1)],
      sequences: [
        { name: "Fireball", abilityIds: ["fireball"], offsetsSeconds: [], description: "The usual attack, and always follows Kindle. Favours finishing a wounded opponent over shielding itself." },
        { name: "Ember Ward", abilityIds: ["ember-ward"], offsetsSeconds: [], description: "Shields when at half health or threatened by Blood Rage, if you have stamina and are close enough to strike. Never shields twice in a row." },
        { name: "Kindle", abilityIds: ["kindle"], offsetsSeconds: [], description: "Powers up after every third action, or when you are out of reach or have enough block to absorb its volley. Never powers up twice in a row." },
      ].map(sequence => ({ ...sequence, description: sequence.description + " Chooses after all three active turns resolve, during a fixed one-second Choosing period. Commits one of three turns (33% each) for the full five-second preparation. Later moves are not announced." })),
      strategy: "Wait out the 2-second ward, or use its shielded turns to heal or gain Blood Rage. Attack during the remaining active turns. Time Brace for fireball impacts. Endless defense loses as volleys grow; Blood Rage speeds the kill but drains your health.",
    };
    if (d.behavior === "wolf") return {
      id: d.id, name: d.name, health: d.health, disposition: d.disposition,
      description: "Patrols the deeper western trail; nearby hostile allies within 9 metres join its fight across clear ground. Notices you within 6 metres and pursues within 30 metres of its home. Beyond 5.5 metres it runs toward you around obstacles; nearby it circles at about 4.5 metres.",
      opener: "On first engagement, its sole Maul lands at active offset 2.65. A joining hound approaches immediately and chooses a turn in the next shared active window; Maul lands 0.65 seconds after that turn.",
      abilities: [maulAbility()],
      sequences: [
        { name: "Repeated Maul", abilityIds: ["maul"], offsetsSeconds: [], description: "Each preparation commits Maul to one of three active turns (33% each); its leap starts on that turn and lands 0.65 seconds later. All enemies share 3 seconds active, 1 second choosing, then 5 seconds preparation." },
      ],
      strategy: "Disengage roots the hound while you leap away. Leave the committed landing before impact, then strike during recovery.",
    };
    return {
      id: d.id, name: d.name, health: d.health, disposition: d.disposition,
      description: d.id === "nest" ? "A neutral bee wandering beside the briars. Your attack enrages it into a fast pursuit, even from wand or bow range. It follows within 18 metres of its home; its surrounding shrubs remain after defeat." : d.id === "warder" ? "Guards the coolant crystals. Its living thorns deal 8 damage whenever you gather; defeating it removes this hazard." : "Appears when six coolant crystals are offered in the Ninth Bell Engine. Defeat it and search the body for its relic, then return home alive.",
      opener: d.id === "nest" ? "Closes toward its attacker immediately. Its first Enraged Swarm waits for the next active round after a full five-second preparation, then lands 0.35 seconds into its announced turn." : `Shows ${d.intention} immediately on engagement; commits at its first shared active opening${d.speed === 0 ? "; remains rooted" : "; approaches first when farther away"}.`,
      abilities: [ordinaryAbility(d), ...(d.id === "warder" ? [{ id: "harvest-thorns", name: "Gathering thorns", description: "While the warder lives, gathering coolant crystals deals 8 damage. Brace can absorb it. This happens only when you gather.", damage: 8, range: 0, noticeSeconds: 0 }] : [])],
      sequences: [{ name: `Repeated ${d.intention}`, abilityIds: [d.id], offsetsSeconds: [], description: `${d.id === "nest" ? "After its opening retaliation, each preparation" : "During preparation it"} commits to one of three active turns (33% each), then marks the ground and strikes 0.35 seconds after that turn. The choice stays fixed through the window; it recovers for 2.65 seconds.` }],
      strategy: `Leave the marked ground before the strike lands, or Brace shortly before impact. Attack during recovery.${d.id === "warder" ? " Clear it before gathering to avoid the thorns." : ""}`,
    };
  });
}

function actionName(action: CombatMove["action"], archetype: CharacterArchetype): string {
  return action === "equip" ? "Change gear" : classAction(archetype, action).name;
}

function volleySpacing(volley: number, offset: number): number { return volley <= 1 ? 0.2 : Math.min(0.2, Math.max(0, (COMBAT_RULES.window.active - 0.01 - offset) / (volley - 1))); }

function readCombat(value: unknown, legacyFiveSlotWindow = false, archetype: CharacterArchetype = "warrior"): SavedState["combat"] {
  const c = record(value);
  if (!Array.isArray(c.queued) || c.queued.length > (legacyFiveSlotWindow ? 5 : COMBAT_RULES.window.maximumActions)) throw new Error("Invalid adventure save: invalid plan size.");
  const queued: QueueEntry[] = c.queued.map(value => {
    const e = record(value), action = choice(e.action, ["strike", "brace", "disengage", "bloodRage", "jab", "guard", "drinkPotion", "equip"] as const);
    const status = choice(e.status, ["pending", "executed", "failed"] as const), reason = e.reason === null ? null : text(e.reason);
    const targetId = e.targetId === null ? null : choice(e.targetId, DEFINITIONS.map(t => t.id));
    if ((["strike", "disengage", "jab"].includes(action)) !== (targetId !== null) || (status === "failed") !== (reason !== null)) throw new Error("Invalid adventure save: inconsistent queued move.");
    const expectedCost = action === "equip" ? 0 : classAction(archetype, action).cost ?? COMBAT_RULES[action].cost;
    const id = number(e.id, 1, Number.MAX_SAFE_INTEGER, true);
    const common = { targetId, offsetSeconds: number(e.offsetSeconds, 0, legacyFiveSlotWindow ? 4 : COMBAT_RULES.window.actionSlots - 1, true), cost: number(e.cost, expectedCost, expectedCost), status, reason };
    if (action === "equip") {
      const gear = record(e.gear), slot = choice(gear.slot, ["chest", "mainhand"] as const);
      const item = gear.item === null ? null : choice(gear.item, ["insulated-coat", "yard-weapon"] as const);
      if (item !== null && GEAR[item].slot !== slot) throw new Error("Invalid adventure save: gear does not fit the planned slot.");
      return { id, action, gear: { slot, item }, ...common };
    }
    return { id, action, ...common };
  }).filter(e => !legacyFiveSlotWindow || e.offsetSeconds < COMBAT_RULES.window.actionSlots);
  if (new Set(queued.map(e => e.id)).size !== queued.length || queued.some((e,i) => i > 0 && e.offsetSeconds < queued[i-1]!.offsetSeconds + (queued[i-1]!.action === "bloodRage" ? 2 : 1) - EPSILON)) throw new Error("Invalid adventure save: overlapping queued moves.");
  const nextId = number(c.nextId, 1, Number.MAX_SAFE_INTEGER, true);
  if (queued.some(e => e.id >= nextId)) throw new Error("Invalid adventure save: invalid move identity.");
  const phase = choice(c.phase, ["idle", "active", "choosing", "preparation"] as const);
  const elapsedSeconds = number(c.elapsedSeconds, 0, legacyFiveSlotWindow ? 5 - EPSILON : (phase === "idle" ? COMBAT_RULES.window.preparation : COMBAT_RULES.window[phase]) - EPSILON);
  return { phase, elapsedSeconds, cycle: number(c.cycle, 0, Number.MAX_SAFE_INTEGER, true), queued, nextId };
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value) || value.some(id => typeof id !== "string")) throw new Error("Invalid adventure save: invalid list.");
  return [...new Set(value)];
}
function readChapter(value: unknown): ChapterState {
  if (value === undefined) return newChapter();
  const c = record(value), equipment = record(c.equipment);
  const accepted = stringList(c.accepted).map(id => choice(id, QUESTS.map(q => q.id)));
  const completed = stringList(c.completed).map(id => choice(id, QUESTS.map(q => q.id)));
  const ownedGear = stringList(c.ownedGear).map(id => choice(id, ["insulated-coat", "yard-weapon"] as const));
  const slots = { chest: equipment.chest === null ? null : choice(equipment.chest, ["insulated-coat"] as const), mainhand: equipment.mainhand === null ? null : choice(equipment.mainhand, ["yard-weapon"] as const) };
  if (completed.some(id => !accepted.includes(id)) || Object.values(slots).some(id => id && !ownedGear.includes(id))) throw new Error("Invalid adventure save: inconsistent chapter.");
  return { accepted, completed, scoutDefeated: boolean(c.scoutDefeated), level: number(c.level,1,3,true), ownedGear, equipment: slots };
}
