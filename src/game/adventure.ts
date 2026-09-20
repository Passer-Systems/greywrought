import { formatMoney } from "./currency.js";
import { snapCombatPosition, combatCell, reachableCombatCells, COMBAT_CELL_SIZE } from './combat-grid.js';
import { terrainHeight, migrateTerrainLayout } from './cave-layout.js';
import { lakeWaterAt, isSwimmingPosition, supportHeight } from './world-elevation.js';
import { restoreTownPosition } from './town-layout.js';
import { VENDORS, experienceForLevel, levelForExperience, enemyExperience, enemyCoins, type NpcId, type VendorId } from "./economy.js";
import { inTown, WORLD_BOUNDS, migrateSpatialLayout } from './world-layout.js';
import { findEmote } from './emotes.js';
import { moveLocomotion, moveManeuverPosition, startJump, blockedPosition, MOVEMENT_BARRIERS, THICKET, type Barrier, type MovementFrame, type MovementCheckpoint } from "./movement.js";
import type { CharacterArchetype } from "../host/character-profile.js";
import { YARD, QUESTS, GEAR, gearName, type QuestId, type QuestOperation, type QuestView, type ProgressionView, type GearSlot, type GearItemId } from "./yard-content.js";
import type {
  AdventureAction, AdventureGame, AdventureOptions, AdventureSnapshot, AdventureLogEntry, SharedAdventure, CombatFeedback,
  CorpseLootView, PlaceView, Position, ThreatPhase, ThreatView, ThreatAbilityView, MonsterLoreEntry, ThreatForecastEntry, CombatAction, CombatActionTiming, CombatMove, EncounterSession, CombatForecast, CombatEffect,
} from "./adventure-types.js";
import { COMBAT_TURN, actionTimingOffset } from "./combat-turn.js";
import { classAction, classKit, MELEE_RANGE } from "./class-kit.js";

type Vector = { x: number; y: number; z: number };
type Phase = AdventureSnapshot["phase"];
export const COMBAT_RULES = {
  actionCooldown: 1,
  bait: { duration: COMBAT_TURN.moveDuration, cost: 1 },
  swarm: { radius: 3, damage: 36 },
  window: { active: COMBAT_TURN.duration, choosing: 0, preparation: 30, gathering: 5 },
  stamina: { maximum: 5, recoverySeconds: 1.5 },
  strike: { damage: 18, range: MELEE_RANGE, rangedRange: 10, stopDistance: 1.5, duration: 0.25, cost: 0 },
  brace: { block: 24, duration: 2, cost: 2 },
  drinkPotion: { cost: 1, recovery: 1 },
  enemy: { preparation: 3, action: 0.65, recovery: 2 },
  head: { beamDamage: 8, fireballDamage: 18, fireballTravel: 0.9, fireballSpacing: 0.2, warning: 3, ward: 6, wardDuration: 2, kindleDuration: 5 },
  wolf: { circleRange: 5.5, circleRadius: 4.5, circleSpeed: 1.5, lungeDistance: 8, lungeHeight: 0.9, impactRadius: 2 },
} as const;
/** The player-facing combat vocabulary is intentionally limited to three choices. */
export const PLAYER_COMBAT_ACTIONS = ["strike", "brace", "bait"] as const;
export const MARA_TRADE_RULES = { suppliesPerPotion: 3, suppliesPerPotionSold: 2 } as const;
export const WORLD_RESPAWN_MILLISECONDS = 120_000;
const CALL_FOR_HELP_RANGE = 9;
interface Maneuver {
  kind: "lunge" | "bait"; targetId: string; remainingSeconds: number;
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
interface HeadState {
  opened: boolean; ability: HeadAbilityId; castVolley: number;
  block: number; blockSeconds: number;
  volley: number; projectileSequence: number; pendingFireballs: number; nextFireballSeconds: number;
  fireballs: { id: number; origin: Vector; position: Vector; remainingSeconds: number; duration: number; damage: number }[];
}
interface ThreatDefinition {
  id: string; name: string; level: number; position: Position; health: number; behavior?: "wolf" | "head";
  preparation: string; intention: string; damage: number; reach: number; benefit: string;
  disposition: ThreatView["disposition"]; aggroRange: number; leash: number; speed: number; pursuitSpeed?: number; patrol?: readonly Position[];
}
interface ThreatState {
  cancelledWindow: boolean;
  comboOpened: boolean; staggered: boolean; swarm: { position: Vector; expiresCycle: number } | null;
  id: string; health: number; maximumHealth: number; active: boolean; phase: ThreatPhase;
  contributors: string[]; combatants: string[]; rollClaims: string[]; shield: number;
  respawnAt: number | null;
  joinCycle: number; windowCycle: number; specialOffset: number; approaching: boolean;
  rng: number;
  castDuration: number; shieldSeconds: number;
  remainingSeconds: number; actionSequence: number; lastActionHit: boolean; damage: number;
  position: Vector; turnTarget: Vector; targetPosition: Vector; targetPlayerId: string | null; aggro: boolean; lootClaimed: boolean;
  patrolIndex: number; moving: boolean; abilityIndex: number;
  wolf: WolfState | null; head: HeadState | null;
}
type Mutable<T> = { -readonly [K in keyof T]: T[K] };
type QueueEntry = Mutable<import("./adventure-types.js").QueuedCombatAction>;
interface CombatClock { gatheringRemainingSeconds: number; pendingSeconds: number; phase: import("./adventure-types.js").CombatView["phase"]; elapsedSeconds: number; cycle: number; }
interface CombatState { clock: CombatClock; queued: QueueEntry[]; nextId: number; ready: boolean; }
const newClock = (): CombatClock => ({ gatheringRemainingSeconds: 0, pendingSeconds: 0, phase: "idle", elapsedSeconds: 0, cycle: 0 });
const newCombat = (clock = newClock()): CombatState => ({ clock, queued: [], nextId: 1, ready: false });
interface WorldState {
  threats: ThreatState[]; resourceRemaining: number; ritualCalled: boolean; chestClaimed: boolean;
  resourceRespawns: { at: number; quantity: number }[];
}
interface ForecastCache { key: string; value: CombatForecast }
interface SharedContext {
  forecastCache?: ForecastCache;
  world: WorldState; clock: CombatClock;
  now: () => number;
  online: Map<string, Adventure>;
  characters: Map<string, Adventure>;
  readonly id: string;
  mode: "shared" | "paused" | "private";
  readonly origins: Map<string, Vector>;
}
interface ChapterState {
  accepted: QuestId[]; completed: QuestId[]; scoutDefeated: boolean;
  level: number; experience: number; ownedGear: GearItemId[]; equipment: Record<GearSlot, GearItemId | null>;
}
const newChapter = (): ChapterState => ({ accepted: [], completed: [], scoutDefeated: false, level: 1, experience: 0, ownedGear: [], equipment: { chest: null, mainhand: null, offhand: null } });
interface State {
  chapter: ChapterState;
  combat: CombatState;
  world: WorldState;
  phase: Phase; archetype: CharacterArchetype; position: Vector; verticalSpeed: number;
  health: number; supplies: number; coins: number; cargo: number;
  bank: { supplies: number; potions: number };
  potions: number; carriedRelics: number; bankedRelics: number; presence: number; carriedSalvage: number;
  actionCooldown: number; currentAction: AdventureAction | "equip" | null; actionDuration: number; actionRemainingSeconds: number; gatherPending: boolean; guardSeconds: number;
  block: number; stamina: number; staminaRecoverySeconds: number; maneuver: Maneuver | null; sitting: boolean;
  attackSequence: number; selectedThreat: string; report: string;
}

type SavedState = Omit<State, "world" | "combat"> & WorldState & { combat: CombatClock & Pick<CombatState, "queued" | "nextId" | "ready"> };
function savedState(state: State): SavedState {
  const { world, combat, ...player } = state;
  return { ...player, ...world, combat: { ...combat.clock, queued: combat.queued, nextId: combat.nextId, ready: combat.ready } };
}

const point = (x: number, z: number): Vector => ({ x, y: terrainHeight(x, z), z });
const DEFINITIONS: readonly ThreatDefinition[] = [
  { id: "scout", level: 1, behavior: "head", disposition: "hostile", aggroRange: 6, leash: 14, speed: 1.6, name: "Cinder Watchman", position: point(-3, 30), health: 96,
    patrol: [point(-3, 30), point(-5, 32), point(-3, 34), point(-1, 32)],
    preparation: "Gathering fire", intention: "Fireball", damage: 3, reach: 10,
    benefit: "Clear the Cinder Watchman to make the first clearing safer." },
  { id: "nest", level: 2, disposition: "neutral", aggroRange: 0, leash: 18, speed: 1.1, pursuitSpeed: 4.8, name: "Briar bee", position: point(14, 24), health: 72,
    patrol: [point(14, 24), point(16, 26), point(18, 24), point(16, 22)],
    preparation: "Enraged wings gathering", intention: "Enraged Swarm", damage: 16, reach: 3,
    benefit: "Defeat the bee to make the briar passage safer." },
  { id: "warder", level: 3, disposition: "hostile", aggroRange: 8, leash: 11, speed: 2, name: "Cablekeeper", position: point(-3, 50), health: 72,
    patrol: [point(-3, 50), point(-5, 47), point(-1, 50), point(-3, 53)],
    preparation: "Raising thorn wards", intention: "Thorn lash", damage: 18, reach: 5,
    benefit: "Clear the warder to gather coolant crystals without cutting thorns." },
  { id: "patrol", level: 2, behavior: "wolf", disposition: "hostile", aggroRange: 6, leash: 30, speed: 4.2, name: "Ash hound", position: point(-17, 45), health: 72,
    patrol: [point(-17, 45), point(-19, 43), point(-21, 46), point(-18, 48)],
    preparation: "Drawing back to pounce", intention: "Lunging Maul", damage: 4, reach: 2,
    benefit: "Clear the hound to make the deeper trail safer." },
  { id: "ritual-guardian", level: 4, disposition: "hostile", aggroRange: 8, leash: 11, speed: 2.2, name: "Foreman Nine", position: point(2, 60), health: 200,
    patrol: [point(2, 60), point(0, 58), point(-2, 60), point(0, 62)],
    preparation: "Charging the works", intention: "Roll-call Pulse", damage: 32, reach: 3.5,
    benefit: "Defeat the called guardian, then carry its Last Shift Roll home." },
  { id: "cave-bat", level: 4, disposition: "hostile", aggroRange: 7, leash: 17, speed: 2.5, pursuitSpeed: 5.2,
    name: "Hollowwing bat", position: point(43,-46), health: 108,
    patrol: [point(43,-46),point(45,-50),point(48,-46),point(43,-42)],
    preparation: "Folding its wings for a bite", intention: "Echo Bite", damage: 26, reach: 2.2,
    benefit: "Search its remains for three pieces of cave salvage." },
  { id: "cave-crab", level: 5, disposition: "hostile", aggroRange: 8, leash: 16, speed: 2.1, pursuitSpeed: 4.2,
    name: "Ironback cave crab", position: point(69,-47), health: 624,
    patrol: [point(69,-47),point(73,-51),point(77,-47),point(73,-41)],
    preparation: "Raising both heavy claws", intention: "Cavern Slam", damage: 52, reach: 4.5,
    benefit: "Search its shell for six pieces of cave salvage." },
  { id: "pond-turtle", level: 1, disposition: "neutral", aggroRange: 0, leash: 10, speed: 0.45, pursuitSpeed: 0.8,
    name: "Lake turtle", position: point(-4, -98), health: 38,
    patrol: [point(-8, -98), point(-4, -95), point(0, -98), point(-4, -101)],
    preparation: "Tucking into its shell", intention: "Shell nudge", damage: 3, reach: 1.5,
    benefit: "A peaceful turtle gliding through the lake." },
  { id: "meadow-rat", level: 1, disposition: "neutral", aggroRange: 0, leash: 14, speed: 1.35, pursuitSpeed: 2.2,
    name: "Meadow rat", position: point(8, 13), health: 24,
    patrol: [point(5, 12), point(9, 15), point(13, 12), point(9, 10)],
    preparation: "Watching the grass", intention: "Hop away", damage: 2, reach: 1.2,
    benefit: "A harmless little rat foraging at the woodland edge." },
  { id: "meadow-rat-2", level: 1, disposition: "neutral", aggroRange: 0, leash: 14, speed: 1.2, pursuitSpeed: 2,
    name: "Field rat", position: point(-12, 18), health: 24,
    patrol: [point(-15, 17), point(-11, 20), point(-8, 17), point(-11, 15)],
    preparation: "Nibbling clover", intention: "Hop away", damage: 2, reach: 1.2,
    benefit: "A harmless little rat foraging in the meadow." },
];
const IRONBACK_CHEST_ID = "ironback-chest";
const IRONBACK_CHEST_POSITION = point(78, -52);
const PLACES: readonly PlaceView[] = [
  ...VENDORS.map(v => ({ id: v.id, name: `${v.name} / ${v.trade}`, position: v.position, kind: "shop" as const })),
  { id: "hollowdeep", name: "Hollowdeep Cave · Danger", position: point(28,-46), kind: "gate" },
  { id: "hollowdeep-exit", name: "Exit to the meadow", position: point(30,-46), kind: "gate" },
  { id: "hearthstead", name: YARD.settlement, position: point(0, -8), kind: "town" },
  { id: "forest-gate", name: YARD.gate, position: point(0, 0), kind: "gate" },
  { id: "frost-cores", name: YARD.resource, position: point(-2, 32), kind: "resource" },
  { id: "ritual-site", name: YARD.works, position: point(2, 60), kind: "ritual" },
  { id: "mara", name: "Mara / Apothecary", position: point(3.4, -7.5), kind: "shop" },
  { id: "bank", name: "Elian / Bank", position: point(-9, -10), kind: "bank" },
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
const newWolf = (): WolfState => ({ facing: { x: 0, y: 0, z: 1 }, motion: null,
  nextAttackSeconds: COMBAT_RULES.enemy.preparation, circling: false, attackOrigin: point(-3, 10),
});
const newHead = (): HeadState => ({ opened: false, ability: "ember-beam", castVolley: 1, block: 0, blockSeconds: 0, volley: 1, projectileSequence: 0, pendingFireballs: 0, nextFireballSeconds: 0, fireballs: [] });
const newThreat = (t: ThreatDefinition): ThreatState => ({
  cancelledWindow: false,
  id: t.id, health: t.health, maximumHealth: t.health, active: t.id !== "ritual-guardian", phase: t.patrol && t.id !== "ritual-guardian" ? "patrol" : "dormant",
  comboOpened: false, staggered: false, swarm: null, contributors: [], combatants: [], rollClaims: [], shield: 0,
  respawnAt: null, joinCycle: 0, windowCycle: 0, specialOffset: 0, approaching: false,
  rng: crypto.getRandomValues(new Uint32Array(1))[0]!,
  castDuration: 0, shieldSeconds: 0,
  remainingSeconds: 0, actionSequence: 0, lastActionHit: false, damage: t.behavior === "wolf" ? 18 : t.damage,
  position: { ...t.position }, turnTarget: { ...t.position }, targetPosition: { ...t.position }, targetPlayerId: null, aggro: false,
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
    chapter: newChapter(), combat: newCombat(), phase: "town", archetype, position: point(0, -8), verticalSpeed: 0, health: 100,
    bank: { supplies: 0, potions: 0 }, supplies: 15, coins: 0, cargo: 0, potions: 0, carriedRelics: 0,
    bankedRelics: 0, carriedSalvage: 0, presence: 0, actionCooldown: 0, currentAction: null, actionDuration: 0, actionRemainingSeconds: 0, gatherPending: false,
    guardSeconds: 0, block: 0, stamina: 5, staminaRecoverySeconds: 0, maneuver: null, sitting: false,
    attackSequence: 0, selectedThreat: "scout",
    report: "Visit Mara for potions, then take the north gate. Gather coolant crystals and return alive.",
    world: { threats: newThreats(), resourceRemaining: 12, resourceRespawns: [], ritualCalled: false, chestClaimed: false },
  };
}

class Adventure implements AdventureGame {
  private state: State;
  private activeEmote: AdventureSnapshot["player"]["emote"] = null;
  private emoteSequence = 0;
  private emoteSeconds = 0;
  private held = new Set<AdventureAction>();
  private mouseForward = false;
  private movementFrames: MovementFrame[] | null = null;
  private movementSequence = 0;
  private movementElapsed = 0;
  get movementCheckpoint(): MovementCheckpoint {
    const maneuver = this.state.maneuver;
    return { sequence: this.movementSequence, elapsed: this.movementElapsed, verticalSpeed: this.state.verticalSpeed,
      maneuver: maneuver ? { ...maneuver, duration: maneuver.kind === 'bait' ? COMBAT_RULES.bait.duration : COMBAT_RULES.strike.duration } : null };
  }
  enableNetworkMovement(enabled = true): void { this.movementFrames = enabled ? [] : null; this.movementSequence = 0; this.movementElapsed = 0; }
  enqueueMovement(frames: readonly MovementFrame[]): boolean {
    if (this.instancePaused()) return false;
    if (!this.movementFrames) this.enableNetworkMovement();
    if (this.movementFrames!.reduce((sum, frame) => sum + frame.seconds, 0) + frames.reduce((sum, frame) => sum + frame.seconds, 0) > 2) return false;
    for (const frame of frames) if (frame.sequence > (this.movementFrames!.at(-1)?.sequence ?? this.movementSequence)) this.movementFrames!.push(frame);
    return true;
  }
  private cameraForward: Vector = { x: 0, y: 0, z: 1 };
  private moving = false;
  private backpedaling = false;
  private shopOpen = false;
  private vendorOpen: VendorId | null = null;
  private trade: { kind: "supplies" | "potions"; quantity: number } | null = null;
  private innOpen = false;
  private bankOpen = false;
  private readonly events: AdventureLogEntry[] = [];
  private eventId = 0;
  private readonly combatFeedback: CombatFeedback[] = [];
  private combatFeedbackId = 0;
  private effects: CombatEffect[] = [];
  private effectId = 0;
  private recording: { paths: CombatForecast["paths"][number][]; events: CombatForecast["events"][number][]; outcomes: CombatForecast["outcomes"][number][] } | null = null;
  private forecastCache: ForecastCache | null = null;
  private movementForecastCache: ForecastCache | null = null;
  private executingQueueId: number | null = null;
  private lootOpenId: string | null = null;

  static sharedAdventure(options: Pick<AdventureOptions, "save" | "now">): SharedAdventure {
    const context: SharedContext = { world: initialState("warrior").world, clock: newClock(), now: options.now ?? Date.now, online: new Map(), characters: new Map(), id: "shared", mode: "shared", origins: new Map() };
    const sessions = new Map<string, SharedContext>();
    const characters = new Map<string, { name: string; game: Adventure }>();
    if (options.save !== undefined) {
      const root = record(JSON.parse(options.save));
      migrateSpatialLayout(root);
      migrateTerrainLayout(root);
      if ((root.version !== 1 && root.version !== 2 && root.version !== 3 && root.version !== 4 && root.version !== 5) || root.kind !== "shared-adventure" || !Array.isArray(root.characters)) throw new Error("Unsupported shared adventure save.");
      const world = record(root.world), version = root.version === 1 ? 9 : root.version >= 4 ? 11 : 10;
      const template = savedState(initialState("warrior"));
      context.world = readSave(JSON.stringify({ version, spatialLayout: 1, terrainLayout: 2, forestLayout: root.forestLayout, state: { ...template, ...world, phase: "expedition" } }), context.now()).world;
      for (const value of root.characters) {
        const legacyClaim = record(record(value).state).chestClaimed;
        if (legacyClaim !== undefined && boolean(legacyClaim)) context.world.chestClaimed = true;
      }
      context.clock = root.version >= 4 ? readClock(root.clock) : newClock();
      const instances = new Map<string, SharedContext>();
      const instanceIds = new Set<string>();
      if (root.version >= 3) {
        if (!Array.isArray(root.instances)) throw new Error("Missing saved private encounters.");
        for (const value of root.instances) {
          const entry = record(value), id = text(entry.id);
          if (!id.startsWith('private:') || instanceIds.has(id)) throw new Error("Invalid private encounter identity.");
          instanceIds.add(id);
          const members = root.version >= 5 ? entry.members : [{ id: entry.ownerId, origin: entry.origin }];
          if (!Array.isArray(members) || members.length === 0) throw new Error("Missing private encounter members.");
          const instance: SharedContext = {
            id, now: context.now, mode: 'paused', online: new Map(), characters: new Map(), origins: new Map(),
            clock: root.version >= 4 ? readClock(entry.clock) : newClock(),
            world: readSave(JSON.stringify({ version, spatialLayout: 1, terrainLayout: 2, forestLayout: root.forestLayout, state: { ...template, ...record(entry.world), phase: 'expedition' } }), context.now()).world,
          };
          for (const value of members) {
            const member = record(value), memberId = text(member.id);
            if (!memberId || instances.has(memberId)) throw new Error("Invalid private encounter member.");
            instance.origins.set(memberId, restoreTownPosition(groundPosition(member.origin)));
            instances.set(memberId, instance);
          }
        }
      }
      for (const value of root.characters) {
        const entry = record(value), id = text(entry.id), name = text(entry.name), state = record(entry.state);
        if (!id || characters.has(id)) throw new Error("Invalid shared character identity.");
        const instance = instances.get(id);
        const ownContext = instance ?? context;
        const game = new Adventure({}, ownContext, id);
        game.state = readSave(JSON.stringify({ version, spatialLayout: 1, terrainLayout: 2, forestLayout: root.forestLayout, state: { ...state, ...ownContext.world } }), context.now());
        game.state.world = ownContext.world; game.state.combat.clock = ownContext.clock;
        characters.set(id, { name, game });
        ownContext.characters.set(id, game);
        if (instance) sessions.set(id, ownContext);
      }
      if ([...instances.keys()].some(id => !characters.has(id))) throw new Error("Missing private encounter character.");
    }
    const refresh = () => {
      refreshWorld(context.world, context.now());
      const guardian = context.world.threats.find(t => t.id === "ritual-guardian");
      if (guardian?.active && guardian.health === definition(guardian.id).health && !guardian.aggro &&
        guardian.targetPlayerId === null && guardian.combatants.length === 0 && guardian.contributors.length === 0 &&
        (guardian.phase === "dormant" || guardian.phase === "returning")) {
        // Older shared saves kept abandoned summons alive after their last fighter left.
        Object.assign(guardian, { ...newThreat(definition(guardian.id)), rng: guardian.rng });
        context.world.ritualCalled = false;
      }
      for (const { game } of characters.values()) game.closeMissingLoot();
    };
    refresh();
    const clearInputs = (game: Adventure) => {
      game.cancelGather();
      game.held.clear(); game.mouseForward = false; game.moving = false; game.backpedaling = false;
      game.enableNetworkMovement(false); game.vendorOpen = null; game.shopOpen = false; game.innOpen = false; game.bankOpen = false; game.trade = null; game.lootOpenId = null;
    };
    const pause = (id: string, memberIds: readonly string[] = [id]): boolean => {
      const existing = sessions.get(id);
      if (existing) {
        for (const game of existing.characters.values()) clearInputs(game);
        existing.mode = "paused";
        return true;
      }
      const game = context.online.get(id);
      const members = new Set([id, ...memberIds]);
      if (!game || [...members].some(memberId => !context.characters.has(memberId) || sessions.has(memberId))) return false;
      const clone = structuredClone(context.world);
      for (const threat of clone.threats) {
        threat.contributors = threat.contributors.filter(memberId => members.has(memberId));
        threat.combatants = threat.combatants.filter(memberId => members.has(memberId));
        if (threat.aggro && (members.has(threat.targetPlayerId ?? '') || threat.combatants.length > 0 || threat.contributors.length > 0)) {
          if (!members.has(threat.targetPlayerId ?? '')) threat.targetPlayerId = threat.combatants[0] ?? threat.contributors[0] ?? id;
          if (!threat.combatants.includes(threat.targetPlayerId!)) threat.combatants.push(threat.targetPlayerId!);
          continue;
        }
        threat.targetPlayerId = null;
        if (!threat.aggro) continue;
        threat.aggro = false; threat.castDuration = 0; threat.remainingSeconds = 0; threat.moving = false;
        threat.phase = !threat.active ? 'dormant' : threat.health === 0 ? 'cleared' : 'returning';
        if (threat.head) { threat.head.fireballs = []; threat.head.pendingFireballs = 0; threat.head.nextFireballSeconds = 0; }
        if (threat.wolf) { threat.wolf.motion = null; threat.wolf.circling = false; threat.position.y = terrainHeight(threat.position.x, threat.position.z); }
      }
      const privateContext: SharedContext = {
        world: clone, clock: structuredClone(context.clock), now: context.now, online: new Map(), characters: new Map(),
        id: 'private:' + crypto.randomUUID(), mode: "paused", origins: new Map(),
      };
      for (const memberId of members) {
        const member = context.characters.get(memberId)!;
        privateContext.origins.set(memberId, point(member.state.position.x, member.state.position.z));
        privateContext.characters.set(memberId, member);
        if (context.online.has(memberId)) privateContext.online.set(memberId, member);
        context.online.delete(memberId); context.characters.delete(memberId);
        sessions.set(memberId, privateContext);
      }
      for (const threat of context.world.threats) {
        threat.contributors = threat.contributors.filter(contributor => !members.has(contributor));
        threat.combatants = threat.combatants.filter(combatant => !members.has(combatant));
        if (members.has(threat.targetPlayerId ?? '')) threat.targetPlayerId = null;
        if (threat.aggro && threat.combatants.length > 0 && threat.targetPlayerId === null) {
          const replacement = threat.combatants.find(combatant => context.online.has(combatant));
          if (replacement !== undefined) {
            threat.targetPlayerId = replacement;
            threat.targetPosition = { ...context.online.get(replacement)!.state.position };
          }
        }
        if (threat.aggro && threat.combatants.length === 0) {
          game.releaseThreat(threat);
          if (context.online.size === 0 && threat.phase === "returning") {
            threat.position = { ...definition(threat.id).position };
            threat.targetPosition = { ...threat.position };
            threat.patrolIndex = 1;
            threat.phase = definition(threat.id).patrol ? "patrol" : "dormant";
          }
        }
      }
      if (!context.world.threats.some(t => t.aggro && t.health > 0)) { context.clock.phase = "idle"; context.clock.elapsedSeconds = 0; context.clock.gatheringRemainingSeconds = 0; }
      for (const member of privateContext.characters.values()) {
        member.shared = privateContext;
        member.state.world = privateContext.world; member.state.combat.clock = privateContext.clock;
        clearInputs(member);
      }
      return true;
    };
    const resume = (id: string): boolean => {
      const privateContext = sessions.get(id);
      if (!privateContext || !privateContext.online.has(id) || privateContext.characters.get(id)!.state.health <= 0 || privateContext.mode !== "paused") return false;
      privateContext.mode = "private";
      for (const game of privateContext.characters.values()) clearInputs(game);
      return true;
    };
    const rejoin = (id: string): boolean => {
      const privateContext = sessions.get(id);
      if (!privateContext || !privateContext.online.has(id) || privateContext.characters.get(id)!.state.health <= 0
        || [...privateContext.characters.values()].some(game => game.state.health > 0 && game.inCombat())) return false;
      for (const [memberId, game] of privateContext.characters) {
        game.shared = context; game.state.world = context.world; game.state.combat = newCombat(context.clock);
        game.state.maneuver = null;
        game.state.phase = game.state.health <= 0 ? 'lost' : inTown(game.state.position) ? 'town' : 'expedition';
        clearInputs(game); sessions.delete(memberId); context.characters.set(memberId, game);
        if (privateContext.online.has(memberId)) context.online.set(memberId, game);
      }
      return true;
    };
    const session = (id: string): EncounterSession => {
      const game = characters.get(id)?.game, privateContext = sessions.get(id);
      if (privateContext && game) return game.sessionView();
      return { id: "shared", mode: "shared", canRejoin: false, origin: null };
    };
    const stepContext = (ctx: SharedContext, seconds: number): void => {
      if (ctx.mode === "paused") return;
      const players = [...ctx.online.values()], driver = players[0];
      if (!driver) return;
      driver.advanceSimulation(seconds);
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
        const privateContext = sessions.get(id);
        if (privateContext) { entry.game.shared = privateContext; entry.game.state.world = privateContext.world; entry.game.state.combat.clock = privateContext.clock; privateContext.online.set(id, entry.game); }
        else context.online.set(id, entry.game);
        return entry.game;
      },
      leave(id, memberIds) {
        pause(id, memberIds);
        const ownContext = sessions.get(id) ?? context;
        const game = ownContext.characters.get(id);
        if (game) clearInputs(game);
        ownContext.online.delete(id);
      },
      pause, resume, rejoin, session,
      getPlayer(id) { return characters.get(id)?.game; },
      players(instanceId?: string) {
        const ctx = instanceId && instanceId !== "shared" ? [...sessions.values()].find(instance => instance.id === instanceId) : context;
        return [...(ctx?.online ?? new Map())].map(([id, game]) => ({ id, name: characters.get(id)!.name, player: game.playerView() }));
      },
      advance(seconds) {
        if (!Number.isFinite(seconds) || seconds < 0) throw new Error("Elapsed time must be finite and nonnegative.");
        refresh();
        stepContext(context, seconds);
        for (const privateContext of new Set(sessions.values())) stepContext(privateContext, seconds);
      },
      save() {
        refresh();
        return JSON.stringify({ version: 5, spatialLayout: 1, terrainLayout: 2, forestLayout: 1, kind: "shared-adventure", world: context.world, clock: context.clock,
          characters: [...characters].map(([id, { name, game }]) => {
            const { threats, resourceRemaining, resourceRespawns, ritualCalled, chestClaimed, ...player } = savedState(game.state);
            return { id, name, state: player };
          }),
          instances: [...new Set(sessions.values())].map(instance => ({ id: instance.id, members: [...instance.origins].map(([id, origin]) => ({ id, origin })), mode: instance.mode, world: instance.world, clock: instance.clock })) });
      },
    };
  }

  private readonly now: () => number;
  constructor(options: AdventureOptions, private shared?: SharedContext, private readonly playerId: string | null = null) {
    this.now = shared?.now ?? options.now ?? Date.now;
    this.state = options.save === undefined ? initialState(options.archetype ?? "warrior") : readSave(options.save, this.now());
    if (shared) { this.state.world = shared.world; this.state.combat.clock = shared.clock; }
    else refreshWorld(this.state.world, this.now());
    if (options.archetype !== undefined && options.archetype !== this.state.archetype) {
      throw new Error("The saved character has a different calling.");
    }
    this.appendLog(options.save === undefined ? "Welcome to Nine-Bell Yard. Visit Mara for potions or Rowan at the inn to rest." : "Welcome back. Your journey has been restored.");
  }

  private inPrivateInstance(): boolean { return this.shared !== undefined && this.shared.id !== "shared"; }
  private instancePaused(): boolean { return this.shared?.mode === "paused"; }
  private sessionView(): EncounterSession {
    const c = this.shared;
    if (!c || c.id === "shared") return { id: "shared", mode: "shared", canRejoin: false, origin: null };
    const origin = c.origins.get(this.playerId!);
    return { id: c.id, mode: c.mode, canRejoin: this.state.health > 0 && [...c.characters.values()].every(game => game.state.health <= 0 || !game.inCombat()), origin: origin ? { ...origin } : null };
  }

  private playerView(): AdventureSnapshot["player"] {
    const s = this.state;
    return {
      position: { ...s.position }, cameraForward: { ...this.cameraForward }, archetype: s.archetype,
      health: s.health, maximumHealth: 100, grounded: s.position.y === supportHeight(s.position.x, s.position.z),
      moving: this.moving, backpedaling: this.backpedaling, attackSequence: s.attackSequence,
      actionCooldown: s.actionCooldown, currentAction: s.currentAction, actionDuration: s.actionDuration, guardSeconds: s.guardSeconds,
      block: s.block, stamina: s.stamina, maximumStamina: COMBAT_RULES.stamina.maximum, staminaRecoverySeconds: s.staminaRecoverySeconds,
      inCombat: this.inCombat(), sitting: s.sitting, emote: this.activeEmote, maneuver: s.maneuver?.kind ?? "none",
      maneuverSeconds: s.maneuver?.remainingSeconds ?? 0, facing: { ...(s.maneuver?.facing ?? this.cameraForward) },
    };
  }

  get snapshot(): AdventureSnapshot {
    const s = this.state;
    return {
      quests: this.questViews(), progression: this.progression(),
      combatFeedback: this.combatFeedback.map(entry => ({ ...entry })),
      phase: s.phase, combat: { gatheringRemainingSeconds: s.combat.clock.gatheringRemainingSeconds, openingStrikeAvailable: this.openingStrikeAvailable(), forecast: this.forecast(), hazards: s.world.threats.flatMap(t => t.swarm ? [{ id: t.id + ":swarm", kind: "swarm" as const, position: { ...t.swarm.position }, radius: COMBAT_RULES.swarm.radius }] : []), effects: this.effects.map(e => ({ ...e, position: { ...e.position } })), ready: s.combat.ready, phase: s.combat.clock.phase, remainingSeconds: s.combat.clock.phase === "idle" ? 0 : Math.max(0, (s.combat.clock.phase === "active" ? COMBAT_RULES.window.active : COMBAT_RULES.window.preparation) - s.combat.clock.elapsedSeconds), elapsedSeconds: s.combat.clock.elapsedSeconds, cycle: s.combat.clock.cycle, queued: s.combat.queued.map(e => ({ ...e })), reservedStamina: this.reservedStamina(), availableStamina: s.stamina - this.reservedStamina() },
      player: this.playerView(),
      threats: s.world.threats.map((t): ThreatView => {
        const d = definition(t.id);
        return {
          ...t, name: d.name, level: d.level, position: { ...t.position }, homePosition: { ...d.position },
          staggered: t.staggered, disposition: d.disposition, joinsNextWindow: t.aggro && t.joinCycle > s.combat.clock.cycle, moving: s.phase !== "lost" && t.moving, maximumHealth: d.health,
          aggroRange: d.aggroRange, callForHelpRange: CALL_FOR_HELP_RANGE,
          movementMode: this.movementMode(t), motionProgress: t.wolf?.motion ? 1 - t.wolf.motion.remainingSeconds / t.wolf.motion.duration : 0,
          facing: { ...(t.wolf?.facing ?? this.direction(t.position, t.aggro ? (this.targetPlayer(t)?.state.position ?? s.position) : t.targetPosition)) },
          nextAttackSeconds: t.wolf?.nextAttackSeconds ?? t.remainingSeconds,
          attackOrigin: t.wolf && t.phase === "action" && t.abilityIndex === 1 ? { ...t.wolf.attackOrigin } : point(t.position.x, t.position.z),
          block: t.head?.block ?? t.shield, blockSeconds: t.head?.blockSeconds ?? t.shieldSeconds, volley: t.head?.volley ?? 0, fireballs: t.head?.fireballs.map(p => ({ ...p, origin: { ...p.origin } })) ?? [],
          canStrike: this.canUseAttack(t, "strike"), cast: this.castView(t),
          inRangeActions: (t.active && this.attackInRange(t, "strike") ? ["strike"] : []),
          selected: t.id === s.selectedThreat, phaseDuration: this.phaseDuration(t), windowAction: (t.aggro || t.cancelledWindow && s.combat.clock.phase === "active") && t.windowCycle === s.combat.clock.cycle && t.joinCycle <= s.combat.clock.cycle ? { ability: this.ability(t), offsetSeconds: t.specialOffset, status: t.cancelledWindow ? "cancelled" : t.phase === "recovery" || t.phase === "approach" ? "resolved" : t.phase === "action" ? "active" : "pending" } : null, forecast: t.aggro && t.windowCycle === s.combat.clock.cycle ? [{ ability: this.ability(t), remainingSeconds: Math.max(0, t.specialOffset - s.combat.clock.elapsedSeconds), status: t.phase === "recovery" || t.phase === "approach" ? "active" : "pending" }] : [],
          preparation: d.preparation,
          currentActivity: this.currentActivity(t), currentAbility: this.ability(t),
          intention: this.intention(t), damage: t.damage, reach: this.ability(t).range,
          benefit: d.benefit, targetPosition: { ...t.targetPosition },
        };
      }),
      loot: [...s.world.threats.filter(t => t.health === 0).map((t): CorpseLootView => ({
        sourceId: t.id, sourceName: definition(t.id).name, position: { ...t.position },
        itemName: t.id === "ritual-guardian" ? "Last Shift Roll" : t.id.startsWith("cave-") ? "Cave salvage" : "Forest salvage",
        kind: t.id === "ritual-guardian" ? "relic" : "salvage", quantity: salvageQuantity(t.id), coins: t.lootClaimed ? 0 : enemyCoins(definition(t.id).level),
        available: this.lootAvailable(t), reachable: this.canLoot(t),
      })), {
        sourceId: IRONBACK_CHEST_ID, sourceName: "Ironback Crab’s cache", position: { ...IRONBACK_CHEST_POSITION },
        itemName: `${formatMoney(18)} and 2 health potions`, kind: "salvage", quantity: 2, coins: 18,
        available: this.chestLootAvailable(), reachable: this.canLootChest(),
      }],
      lootOpenId: this.lootOpenId, carriedSalvage: s.carriedSalvage,
      places: PLACES.map(p => ({ ...p, position: { ...p.position } })),
      selectedThreat: s.selectedThreat, supplies: s.supplies, coins: s.coins, vendorOpen: this.vendorOpen, cargo: s.cargo,
      resourceRemaining: s.world.resourceRemaining, potions: s.potions, carriedRelics: s.carriedRelics,
      bankedRelics: s.bankedRelics, presence: s.presence, ritualCalled: s.world.ritualCalled,
      bank: { ...s.bank }, bankOpen: this.bankOpen, shopOpen: this.shopOpen, trade: this.tradeView(), innOpen: this.innOpen, log: this.events.map(entry => ({ ...entry })), potionPrice: MARA_TRADE_RULES.suppliesPerPotion, potionHealing: 30, report: s.report,
    };
  }

  save(): string { return JSON.stringify({ version: 11, spatialLayout: 1, terrainLayout: 2, forestLayout: 1, state: savedState(this.state) }); }
  private progression(): ProgressionView {
    const c = this.state.chapter;
    const gear = Object.values(c.equipment).filter((id): id is GearItemId => id !== null);
    return { level: c.level, experience: c.experience, levelExperience: c.experience - experienceForLevel(c.level), nextLevelExperience: experienceForLevel(c.level + 1) - experienceForLevel(c.level), ownedGear: [...c.ownedGear], equipment: { ...c.equipment },
      unlockedActions: [...PLAYER_COMBAT_ACTIONS],
      attackBonus: (c.level - 1) * 2 + gear.reduce((sum, id) => sum + GEAR[id].attackBonus, 0),
      damageReduction: gear.reduce((sum, id) => sum + GEAR[id].damageReduction, 0) };
  }
  private actionUnlocked(action: CombatMove["action"]): boolean {
    return action === "strike" || action === "brace" || action === "bait";
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
  interactNpc(id: NpcId): void {
    const vendor = VENDORS.find(v => v.id === id);
    if (this.instancePaused() || this.inPrivateInstance()) { this.report("Services are available only in the shared world."); return; }
    if (this.state.phase === "lost") return;
    if (this.state.phase !== "town" || !this.near(id, 2.5)) {
      this.report(`Move closer to ${vendor?.name ?? (id === "mara" ? "Mara" : id === "bank" ? "Elian" : "Rowan")} to talk.`);
      return;
    }
    this.lootOpenId = null;
    this.trade = null;
    this.vendorOpen = vendor?.id ?? null;
    this.shopOpen = id === "mara";
    this.innOpen = id === "inn";
    this.bankOpen = id === "bank";
    this.report(vendor ? `${vendor.name} says: Good gear earns its keep. Take a look.` : id === "mara" ? "Mara says: A little preparation goes a long way."
      : id === "bank" ? "Elian says: Store supplies and potions for your next expedition."
      : `Rowan says: Welcome to ${YARD.inn}. Come warm yourself by the hearth; rest is on the house.`);
  }
  buyGear(vendorId: VendorId, item: GearItemId): boolean {
    const s = this.state, vendor = VENDORS.find(v => v.id === vendorId);
    if (!vendor || vendor.item !== item || this.instancePaused() || this.inPrivateInstance() || s.phase !== "town" || this.vendorOpen !== vendorId || !this.near(vendorId, 2.5)) return false;
    if (s.chapter.ownedGear.includes(item)) { this.report("You already own this item. Equip it from your bags."); return false; }
    if (s.coins < vendor.price) { this.report(`You need ${formatMoney(vendor.price)} for ${gearName(item, s.archetype)}.`); return false; }
    s.coins -= vendor.price; s.chapter.ownedGear.push(item);
    this.report(`You buy ${gearName(item, s.archetype)} for ${formatMoney(vendor.price)}. Equip it from your bags.`);
    return true;
  }
  private gainExperience(amount: number): void {
    if (amount <= 0) return;
    const c = this.state.chapter, previous = c.level;
    c.experience += amount; c.level = levelForExperience(c.experience);
    this.report(`You gain ${amount} experience.`, "combat");
    if (c.level > previous) this.report(`Level up! You reach level ${c.level}. Your attacks deal ${2 * (c.level - 1)} extra damage.`, "combat");
  }
  bankTransfer(operation: "deposit" | "withdraw", kind: "supplies" | "potions", quantity: number): boolean {
    const s = this.state;
    if (this.instancePaused() || this.inPrivateInstance() || s.phase !== "town" || !this.bankOpen || !this.near("bank", 2.5)) {
      this.report("Visit Elian at the bank to store or collect your goods."); return false;
    }
    if ((operation !== "deposit" && operation !== "withdraw") || (kind !== "supplies" && kind !== "potions") || !Number.isSafeInteger(quantity) || quantity <= 0) return false;
    const source = operation === "deposit" ? s : s.bank;
    const destination = operation === "deposit" ? s.bank : s;
    if (source[kind] < quantity || !Number.isSafeInteger(destination[kind] + quantity)) {
      this.report("That quantity is not available. Check your bags and bank balance."); return false;
    }
    source[kind] -= quantity; destination[kind] += quantity;
    this.report(`You ${operation === "deposit" ? "store" : "collect"} ${quantity} ${kind === "potions" ? "health potion" + (quantity === 1 ? "" : "s") : "supplies"}.`);
    return true;
  }
  quest(id: QuestId, operation: QuestOperation): void {
    if (this.instancePaused() || this.inPrivateInstance()) { this.report("Quest progress is available only in the shared world."); return; }
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
    c.completed.push(id); this.gainExperience(Math.max(0, experienceForLevel(q.reward.level) - c.experience));
    s.potions += q.reward.potions; s.supplies += q.reward.supplies;
    if (q.reward.gear && !c.ownedGear.includes(q.reward.gear)) c.ownedGear.push(q.reward.gear);
    this.report(q.completion);
  }
  equip(slot: GearSlot, item: GearItemId | null): void {
    const s = this.state;
    if (this.instancePaused() || this.executionLocked()) return;
    if (s.phase === "lost" || !(slot === "chest" || slot === "mainhand" || slot === "offhand")) return;
    if (item !== null && (!Object.hasOwn(GEAR, item) || !s.chapter.ownedGear.includes(item) || GEAR[item].slot !== slot)) return;

    this.cancelHearthstone();
    s.chapter.equipment[slot] = item;
  }
  private tradeView() {
    if (this.inPrivateInstance()) return null;
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
    if (this.instancePaused() || this.inPrivateInstance()) return;
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
    if (length > EPSILON) this.cameraForward = { x: x / length, y: 0, z: z / length };
  }
  setMouseForward(active: boolean): void { if (!active) this.mouseForward = false; else if (!this.instancePaused() && !this.inCombat()) { this.cancelGather(); this.cancelHearthstone(); this.mouseForward = true; } }
  sit(): void {
    if (this.instancePaused() || this.state.phase === "lost" || this.inCombat()) return;
    this.activeEmote = null;
    this.cancelGather();
    this.cancelHearthstone();
    this.state.sitting = true;
  }
  emote(name: string): void {
    if (this.instancePaused() || this.state.phase === "lost" || this.inCombat()) return;
    if (name === "stand") { this.state.sitting = false; this.activeEmote = null; return; }
    this.cancelGather();
    const definition = findEmote(name);
    if (!definition) return;
    this.state.sitting = false;
    this.activeEmote = { name: definition.name, sequence: ++this.emoteSequence };
    this.emoteSeconds = definition.name === "dance" ? Infinity : 3;
  }
  selectTarget(id: string): void {
    definition(id);
    this.state.selectedThreat = id;
  }
  private executionLocked(): boolean { return this.inCombat() && this.state.combat.clock.phase === "active"; }
  private combatants(): Adventure[] { return this.participants().filter(player => player.inCombat()); }
  private occupiedCells(exclude: Position): Position[] {
    return [...this.participants().filter(p => p.state.health > 0).map(p => p.state.position),
      ...this.state.world.threats.filter(t => t.active && t.health > 0).map(t => t.position)].filter(p => p !== exclude);
  }
  private engagementPositions(threat: ThreatState): { player: Position; threat: Position } {
    const origin = this.state.position;
    const player = this.inCombat() ? origin : snapCombatPosition(origin, origin, 4, this.occupiedCells(origin));
    const occupied = this.occupiedCells(threat.position).map(position => position === origin ? player : position);
    return { player, threat: threat.aggro ? threat.position : snapCombatPosition(threat.position, threat.position, 4, occupied) };
  }
  private settleCombatCell(keepCell = false): void {
    const s = this.state;
    s.position = snapCombatPosition(s.position, s.position, 4, keepCell ? this.participants().filter(player => player !== this && player.state.health > 0).map(player => player.state.position) : this.occupiedCells(s.position));
    s.verticalSpeed = 0; this.held.clear(); this.mouseForward = false; this.moving = false; this.backpedaling = false;
  }
  readyCombat(): boolean {
    if (this.instancePaused() || !this.inCombat() || this.state.combat.clock.phase !== "preparation") return false;
    this.state.combat.ready = true;
    if (this.combatants().every(player => player.state.combat.ready)) this.beginExecution();
    return true;
  }
  private beginExecution(): void {
    const clock = this.state.combat.clock;
    if (clock.phase !== "preparation" || clock.gatheringRemainingSeconds > EPSILON) return;
    clock.phase = "active"; clock.elapsedSeconds = 0; clock.pendingSeconds = 0;
    const destinations: Position[] = [];
    for (const player of this.combatants()) {
      const move = player.state.combat.queued.find(entry => entry.action === "bait" && entry.status === "pending");
      if (move?.destination) {
        const reachable = reachableCombatCells(player.state.position, classKit(player.state.archetype).movementTiles, [...player.occupiedCells(player.state.position), ...destinations]);
        if (!reachable.some(cell => cell.x === move.destination!.x && cell.z === move.destination!.z)) {
          move.status = "failed"; move.reason = "Another combatant has claimed that destination.";
        } else destinations.push(move.destination);
      }
      player.cancelGather();
      player.held.clear(); player.mouseForward = false;
      player.state.actionCooldown = 0; player.state.currentAction = null;
      if (player.movementFrames) player.consumeMovement(2, true);
    }
    this.resolveTurnActions();
  }
  private resolveTurnActions(): void {
    if (this.state.combat.clock.phase !== "active") return;
    for (const player of this.combatants()) player.executeQueued();
    for (const threat of this.state.world.threats) {
      const target = this.targetPlayer(threat);
      if (target && threat.aggro && threat.health > 0 && threat.phase === "preparation") target.advanceThreat(threat, 0);
    }
  }
  private beginPlanning(): void {
    const clock = this.state.combat.clock;
    if (clock.phase !== "idle") clock.gatheringRemainingSeconds = 0;
    clock.phase = "choosing"; clock.elapsedSeconds = 0; clock.cycle++;
    for (const player of this.participants()) {
      player.state.combat.queued = []; player.state.combat.ready = false;
      player.state.guardSeconds = 0; player.state.block = 0;
      if (player.inCombat()) player.settleCombatCell(true);
    }
    for (const threat of this.state.world.threats) {
      threat.staggered = false; threat.cancelledWindow = false;
      if (threat.swarm && threat.swarm.expiresCycle < clock.cycle) threat.swarm = null;
      const target = this.targetPlayer(threat);
      if (target && threat.aggro && threat.health > 0) {
        threat.position = snapCombatPosition(threat.position, threat.position, 4, this.occupiedCells(threat.position));
        target.commitThreat(threat);
      }
    }
    if (this.recording) this.captureOutcomes();
    const trio = ["scout", "nest", "patrol"].map(id => this.state.world.threats.find(t => t.id === id)!);
    if (!trio[0]!.comboOpened && trio.every(t => t.aggro && t.health > 0 && t.joinCycle <= clock.cycle)) {
      for (const threat of trio) {
        threat.comboOpened = true; threat.specialOffset = threat.wolf ? .85 : 1.7;
        threat.castDuration = threat.specialOffset; threat.remainingSeconds = threat.specialOffset;
        if (threat.head) { threat.head.ability = "fireball"; threat.damage = this.ability(threat).damage; }
      }
    }
    clock.phase = "preparation";
  }
  private finishCombatStep(dt: number): void {
    const clock = this.state.combat.clock;
    const engaged = this.combatants().length > 0;
    if (!engaged && !this.state.world.threats.some(t => t.head?.fireballs.length)) {
      if (this.recording) this.captureOutcomes();
      clock.phase = "idle"; clock.elapsedSeconds = 0; clock.gatheringRemainingSeconds = 0;
      for (const player of this.participants()) { player.state.combat.queued = []; player.state.combat.ready = false; }
      return;
    }
    if (clock.phase === "idle" || clock.phase === "choosing") { this.beginPlanning(); return; }
    if (clock.phase === "preparation") {
      clock.gatheringRemainingSeconds = Math.max(0, clock.gatheringRemainingSeconds - dt);
      if (clock.gatheringRemainingSeconds < EPSILON) clock.gatheringRemainingSeconds = 0;
      clock.elapsedSeconds += dt;
      if (clock.elapsedSeconds >= COMBAT_RULES.window.preparation - EPSILON || this.combatants().every(p => p.state.combat.ready)) this.beginExecution();
      return;
    }
    clock.elapsedSeconds += dt;
    this.resolveTurnActions();
    const pending = this.state.world.threats.some(t => (t.head?.fireballs.length ?? 0) > 0) || this.state.world.threats.some(t => t.aggro && t.health > 0 && t.windowCycle === clock.cycle && (t.phase === "preparation" || t.phase === "action")) || this.participants().some(p => p.state.maneuver !== null);
    if (clock.elapsedSeconds >= COMBAT_RULES.window.active - EPSILON && !pending) this.beginPlanning();
  }
  private reservedStamina(): number { return this.state.combat.queued.filter(e => e.status === "pending").reduce((n, e) => n + e.cost, 0); }
  private queueReason(action: CombatAction, excludedId?: number): string | null {
    const s = this.state, pending = s.combat.queued.filter(entry => entry.id !== excludedId && entry.status === "pending");
    if (s.stamina - pending.reduce((sum, entry) => sum + entry.cost, 0) < this.actionCost(action)) return "Not enough stamina.";
    if (action === "strike") {
      const target = s.world.threats.find(threat => threat.id === s.selectedThreat);
      if (!target?.active || target.health <= 0 || target.phase === "returning" || this.inPrivateInstance() && !target.aggro) return "Select a living enemy in this encounter.";
      // Movement and enemy charges can change range before the action.
      if (!(this.inCombat() && target.aggro) && !this.attackInRange(target, "strike")) return "The target is out of reach.";
    }
    return null;
  }
  private derivePlanTiming(): void {
    const queued = this.state.combat.queued, hasMovement = queued.some(e => e.action === "bait");
    for (const entry of queued) entry.offsetSeconds = entry.action === "bait" ? COMBAT_TURN.moveStart : actionTimingOffset(entry.timing!, hasMovement);
  }
  queueBait(destination: Position): boolean {
    const c = this.state.combat, existing = c.queued.find(e => e.action === "bait");
    if (!this.editableQueue() || !this.inCombat() || c.clock.phase !== "preparation" || this.queueReason("bait", existing?.id)) return false;
    if (!destination || !Number.isFinite(destination.x) || !Number.isFinite(destination.z)) { this.report("Choose a highlighted tile.", "combat"); return false; }
    const x = combatCell(destination.x), z = combatCell(destination.z);
    const target = reachableCombatCells(this.state.position, classKit(this.state.archetype).movementTiles, this.occupiedCells(this.state.position)).find(cell => cell.x === x && cell.z === z);
    if (!target) { this.report("That tile is blocked or out of reach. Choose a highlighted tile.", "combat"); return false; }
    if (existing) existing.destination = target;
    else c.queued.push({ id: c.nextId++, action: "bait", destination: target, targetId: null, timing: null, offsetSeconds: COMBAT_TURN.moveStart, cost: 1, status: "pending", reason: null });
    this.derivePlanTiming(); c.ready = false; return true;
  }
  private queueAction(action: CombatAction): void {
    if (action === "bait") { this.report("Choose a grid tile for Move.", "combat"); return; }
    if (action === "brace" && !this.inCombat()) { this.useAbility("brace"); return; }
    const c = this.state.combat;
    if (this.instancePaused() || this.state.phase === "lost" || c.clock.phase === "active") return;
    const existing = c.queued.find(e => e.action !== "bait");
    const reason = this.queueReason(action, existing?.id);
    if (reason) { this.report(reason, "combat"); return; }
    const target = action === "strike" ? this.state.world.threats.find(t => t.id === this.state.selectedThreat)! : null;
    if (target && this.openingStrikeAvailable()) {
      this.state.sitting = false; this.activeEmote = null;
      this.spendStamina(this.actionCost("strike"));
      this.recover("strike", COMBAT_RULES.strike.duration);
      this.hit(target, classAction(this.state.archetype, "strike").damage ?? COMBAT_RULES.strike.damage, "Attack at");
      if (this.inCombat() && c.clock.phase === "idle") this.beginPlanning();
      return;
    }
    if (target) {
      this.state.sitting = false; this.activeEmote = null;
      if (target.aggro && !this.inCombat()) this.settleCombatCell();
      if (!target.aggro) this.engage(target);
      if (!target.combatants.includes(this.playerId ?? "solo")) target.combatants.push(this.playerId ?? "solo");
      if (c.clock.phase === "idle") this.beginPlanning();
    }
    const timing = existing?.timing && !(existing.timing === "during" && classAction(this.state.archetype, action).movementProfile === "stationary") ? existing.timing : "after";
    const entry: QueueEntry = { id: existing?.id ?? c.nextId++, action, destination: null, targetId: target?.id ?? null, timing, offsetSeconds: 0, cost: this.actionCost(action), status: "pending", reason: null };
    c.queued = [...c.queued.filter(e => e.action === "bait"), entry];
    this.derivePlanTiming(); c.ready = false;
  }
  private editableQueue(): boolean { return !this.instancePaused() && !this.executionLocked(); }
  setActionTiming(timing: CombatActionTiming): boolean {
    const c = this.state.combat, entry = c.queued.find(e => e.action !== "bait" && e.status === "pending");
    if (!this.editableQueue() || c.clock.phase !== "preparation" || !entry || !["before", "during", "after"].includes(timing)
      || timing === "during" && classAction(this.state.archetype, entry.action).movementProfile === "stationary") return false;
    entry.timing = timing; this.derivePlanTiming(); c.ready = false; return true;
  }
  removeQueuedAction(id: number): void { if (this.editableQueue()) { this.state.combat.queued = this.state.combat.queued.filter(e => e.id !== id); this.derivePlanTiming(); this.state.combat.ready = false; } }
  clearQueuedActions(): void { if (this.editableQueue()) { this.state.combat.queued = []; this.state.combat.ready = false; } }
  private actionCost(action:CombatMove["action"]):number{if(action==="equip"||action==="strike")return 0;return classAction(this.state.archetype,action).cost??1;}
  private useAbility(action:"brace", committed = false):void{const s=this.state,cost=this.actionCost(action);if(!committed&&!this.ready()){this.report("You are still recovering.","combat");return;}if(s.stamina<cost){this.report("Not enough stamina.","combat");return;}this.spendStamina(cost);this.recover(action,COMBAT_RULES.actionCooldown);s.guardSeconds=committed?COMBAT_TURN.duration:COMBAT_RULES.brace.duration;s.block=classAction(s.archetype,"brace").block??COMBAT_RULES.brace.block;const h=this.inCombat()?Math.min(classAction(s.archetype,"brace").heal??0,100-s.health):0;s.health+=h;this.feedback(null,"heal",h);this.report("You gain "+s.block+" block "+(committed?"for the rest of this turn.":"for "+s.guardSeconds+" seconds.")+(h?" Restored "+h+" health.":""),"combat");}
  private eligibleForRoll(t: ThreatState): boolean {
    return t.contributors.includes(this.playerId ?? "solo") && this.state.chapter.accepted.includes("last-shift") && !this.state.chapter.completed.includes("last-shift");
  }
  private lootAvailable(t: ThreatState): boolean {
    if (this.inPrivateInstance()) return false;
    if (t.id !== "ritual-guardian") return !t.lootClaimed;
    if (this.state.carriedRelics > 0) return false;
    if (this.state.chapter.accepted.includes("last-shift") && !this.state.chapter.completed.includes("last-shift") && !this.eligibleForRoll(t)) return false;
    return this.eligibleForRoll(t) ? !t.rollClaims.includes(this.playerId ?? "solo") : !t.lootClaimed;
  }
  private chestLootAvailable(): boolean {
    return !this.inPrivateInstance() && !this.state.world.chestClaimed && this.state.world.threats.find(t => t.id === "cave-crab")?.health === 0;
  }
  private canLootChest(): boolean {
    return this.state.phase === "expedition" && this.chestLootAvailable() && distance(this.state.position, IRONBACK_CHEST_POSITION) <= 3 + EPSILON && this.clearPath(this.state.position, IRONBACK_CHEST_POSITION);
  }
  private canLoot(t: ThreatState): boolean {
    return this.state.phase === "expedition" && t.health === 0 && this.lootAvailable(t) &&
      distance(this.state.position, t.position) <= 3 + EPSILON && this.clearPath(this.state.position, t.position);
  }
  openLoot(sourceId: string): void {
    if (sourceId === IRONBACK_CHEST_ID) { this.lootOpenId = this.canLootChest() ? sourceId : null; return; }
    const corpse = this.state.world.threats.find(t => t.id === sourceId);
    this.lootOpenId = corpse && this.canLoot(corpse) ? corpse.id : null;
    if (this.lootOpenId) { this.vendorOpen = null; this.shopOpen = false; this.innOpen = false; this.bankOpen = false; }
  }
  private takeLoot(): void {
    const s = this.state;
    if (this.lootOpenId === IRONBACK_CHEST_ID) {
      this.lootOpenId = null;
      if (!this.canLootChest()) return;
      s.world.chestClaimed = true; s.coins += 18; s.potions += 2;
      this.report(`You open the Ironback Crab’s cache: ${formatMoney(18)} and 2 health potions.`);
      return;
    }
    const corpse = s.world.threats.find(t => t.id === this.lootOpenId);
    this.lootOpenId = null;
    if (!corpse || !this.canLoot(corpse)) return;
    const coins = corpse.lootClaimed ? 0 : enemyCoins(definition(corpse.id).level);
    s.coins += coins;
    corpse.lootClaimed = true;
    if (corpse.id === "ritual-guardian") {
      if (!corpse.rollClaims.includes(this.playerId ?? "solo")) corpse.rollClaims.push(this.playerId ?? "solo");
      s.carriedRelics += 1;
      this.report(`You receive loot: Last Shift Roll × 1 and ${formatMoney(coins)}. Reach Nine-Bell Yard alive to keep it.`);
    } else {
      const quantity = salvageQuantity(corpse.id);
      s.carriedSalvage += quantity;
      this.report(`You receive loot: ${corpse.id.startsWith("cave-") ? "Cave" : "Forest"} salvage × ${quantity} and ${formatMoney(coins)}. Return alive to exchange it for supplies.`);
    }
  }
  setAction(action: AdventureAction, pressed: boolean): void {
    if (this.instancePaused()) { if (!pressed) this.held.delete(action); return; }
    if (!pressed) { this.held.delete(action); return; }
    if (this.inCombat() && ["forward", "backward", "left", "right", "jump"].includes(action)) return;
    if (this.held.has(action)) return;
    this.held.add(action);
    if (action !== "hearthstone") this.cancelHearthstone();
    if (["forward", "backward", "left", "right", "jump", "strike", "bait", "brace", "drinkPotion", "ritual", "cancelGather"].includes(action)) this.cancelGather();
    this.act(action);
  }

  private near(id: string, range: number): boolean {
    const place = PLACES.find(p => p.id === id);
    return place !== undefined && distance(this.state.position, place.position) <= range + EPSILON;
  }
  private ready(): boolean {
    return this.state.phase !== "lost" && this.state.actionCooldown <= EPSILON && this.state.maneuver === null;
  }
  private act(action: AdventureAction): void {
    const s = this.state;
    if (this.instancePaused() || this.executionLocked()) return;
    if (this.inPrivateInstance() && ["openTrade", "acceptTrade", "buyPotion", "rest", "gather", "ritual", "interact"].includes(action)) {
      this.report("Services and world rewards are unavailable during a private encounter.");
      return;
    }
    if (action === "closeBank") { this.bankOpen = false; return; }
    if (action === "closeShop") { this.vendorOpen = null; this.shopOpen = false; this.trade = null; return; }
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
      case "hearthstone": this.hearthstone(); break;
      case "cancelHearthstone": this.cancelHearthstone(); break;
      case "jump":
        if (s.maneuver === null) startJump(s);
        break;
      case "target": {
        const nearby = s.world.threats.filter(t => t.active && t.health > 0 && distance(s.position, t.position) <= 15);
        const next = nearby[(nearby.findIndex(t => t.id === s.selectedThreat) + 1) % nearby.length];
        if (next) this.selectTarget(next.id);
        break;
      }
      case "strike":
        if (s.phase === "expedition") this.queueAction("strike");
        break;
      case "bait": case "brace": this.queueAction(action); break;
      case "gather": this.gather(); break;
      case "ritual": this.ritual(); break;
      case "takeLoot": this.takeLoot(); break;
      case "interact": {
        this.lootOpenId = null;
        const service = s.phase === "town" ? PLACES.filter(p => (p.kind === "shop" || p.kind === "inn" || p.kind === "bank") && this.near(p.id, 2.5))
          .sort((a,b) => distance(s.position,a.position) - distance(s.position,b.position))[0] : undefined;
        if (service) this.interactNpc(service.id as NpcId);
        else {
          this.vendorOpen = null; this.shopOpen = false; this.innOpen = false; this.bankOpen = false; this.trade = null;
          const corpse = s.world.threats.filter(t => this.canLoot(t))
            .sort((a, b) => distance(s.position, a.position) - distance(s.position, b.position))[0];
          if (corpse) this.openLoot(corpse.id);
          else if (this.canLootChest()) this.openLoot(IRONBACK_CHEST_ID);
          else this.report(s.phase === "town" ? "Approach Mara to trade, Elian to bank your goods, or Rowan at the inn to rest." : "Move beside a glinting body to search it.");
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
        if (!this.inCombat() && s.potions > 0 && s.health < 100) { const healing = Math.min(30, 100 - s.health); s.health += healing; s.potions--; this.feedback(null, "heal", healing); this.report(`Your health potion restores ${healing} health.`); }
        else this.report(s.potions < 1 ? "No health potions. Visit Mara." : this.inCombat() ? "Unavailable in combat." : "Your health is already full.");
        break;
      case "rest":
        if (s.phase === "town" && this.near("inn", 2.5)) {
          const healing = 100 - s.health;
          s.health = 100;
          this.feedback(null, "heal", healing);
          this.report(healing > 0 ? `You rest at ${YARD.inn} and recover ${healing} health.` : "Rowan says: You're already rested. May the road bring you safely home.");
        } else this.report("Visit Rowan at The Wayfarer's Rest in Nine-Bell Yard to rest.");
        break;
    }
  }
  private castView(t: ThreatState): ThreatView["cast"] {
    if (!t.aggro || t.health <= 0 || (t.phase !== "preparation" && t.phase !== "action")) return null;
    return { ability: this.ability(t), remainingSeconds: t.remainingSeconds, duration: t.phase === "action" ? this.phaseDuration(t) : t.castDuration,
      status: t.phase === "preparation" ? "casting" : "resolving" };
  }
  private intention(t: ThreatState): string {
    return this.ability(t).name;
  }
  private direction(from: Position, to: Position): Vector {
    const length = distance(from, to);
    return length > EPSILON ? { x: (to.x - from.x) / length, y: 0, z: (to.z - from.z) / length } : { x: 0, y: 0, z: 1 };
  }
  private movementMode(t: ThreatState): ThreatView["movementMode"] {
    if (t.health === 0 || this.state.phase === "lost") return "idle";
    if (t.wolf?.motion) return t.wolf.motion.kind;
    return t.moving ? t.wolf?.circling ? "circle" : "walk" : "idle";
  }
  private ability(t: ThreatState): ThreatAbilityView {
    if (t.head) return headAbility(t.head.ability, t.head.castVolley);
    if (t.wolf) return maulAbility(t.damage);
    if (t.id === "ritual-guardian") return foremanAbility(t.abilityIndex, t.damage);
    return ordinaryAbility(definition(t.id), t.damage);
  }
  private phaseDuration(t: ThreatState): number {
    if (t.phase === "preparation") return t.castDuration;
    if (t.phase === "recovery") return COMBAT_RULES.enemy.recovery;
    if (t.phase === "action") return t.head ? COMBAT_RULES.head.fireballTravel + (t.head.castVolley - 1) * COMBAT_RULES.head.fireballSpacing : t.wolf ? COMBAT_RULES.enemy.action : this.ability(t).noticeSeconds;
    return 0;
  }
  private attackPath(t: ThreatState): boolean {
    return this.clearPath(this.state.position, t.position);
  }
  private attackInRange(t: ThreatState, action: "strike"): boolean {
    const s = this.state;
    const range = classAction(s.archetype, "strike").range ?? COMBAT_RULES.strike.range;
    if (!(s.phase === "expedition" && t.active && t.health > 0 && t.phase !== "returning" && (!this.inPrivateInstance() || t.aggro) && distance(s.position, t.position) <= range + EPSILON && this.attackPath(t))) return false;
    if (this.inCombat() && t.aggro) return true;
    const settled = this.engagementPositions(t);
    return distance(settled.player, settled.threat) <= range + EPSILON && this.clearPath(settled.player, settled.threat);
  }
  private openingStrikeAvailable(): boolean {
    const target = this.state.world.threats.find(threat => threat.id === this.state.selectedThreat);
    if (!target || target.aggro || this.inCombat() || this.inPrivateInstance() || this.instancePaused()
      || this.state.combat.clock.phase === "active" || !this.ready() || !this.attackInRange(target, "strike")
      || this.state.stamina < this.actionCost("strike")) return false;
    return !this.state.world.threats.some(threat => {
      const d = definition(threat.id);
      return threat.active && threat.health > 0 && threat.phase !== "returning" && d.disposition === "hostile"
        && distance(this.state.position, threat.position) <= d.aggroRange && this.clearPath(this.state.position, threat.position);
    });
  }
  private canUseAttack(t: ThreatState, action: "strike"): boolean {
    return this.attackInRange(t, action);
  }
  private hit(t: ThreatState, damage: number, verb: string): void {
    if (t.phase === "returning") return;
    damage += this.progression().attackBonus;
    const blocked = Math.min(damage, t.head?.block ?? t.shield);
    if (!t.head) t.shield -= blocked;
    if (t.id === "nest" && t.contributors.length === 0) this.report("Your blow enrages the Briar bee. It rushes toward you; plan a collision to interrupt its swarm, or queue Block before impact.", "combat");
    if (!t.contributors.includes(this.playerId ?? "solo")) t.contributors.push(this.playerId ?? "solo");
    if (!t.combatants.includes(this.playerId ?? "solo")) t.combatants.push(this.playerId ?? "solo");
    if (t.head) { t.head.block -= blocked; if (t.head.block === 0) t.head.blockSeconds = 0; }
    const s = this.state, dealt = Math.min(damage - blocked, t.health);
    t.health -= dealt;
    this.feedback(t.id, "block", blocked);
    this.feedback(t.id, "damage", dealt);
    if (t.health > 0 && !t.aggro) this.engage(t);
    s.attackSequence += 1; s.presence += 1;
    this.report(`You ${verb} ${definition(t.id).name} for ${dealt} damage${blocked ? ` (${blocked} absorbed by ${t.head ? "Ember Ward" : "Safety Shield"})` : ""}.`, "combat");
    this.traceEvent("hit", this.playerId ?? "solo", t.id, t.position, dealt, verb + " " + definition(t.id).name);
    this.defeat(t, this.playerId ?? "solo");
  }
  private defeat(t: ThreatState, sourceId: string): void {
    if (t.health === 0 && t.phase !== "cleared") {
      if (!this.inPrivateInstance()) for (const player of this.shared ? this.shared.characters.values() : [this]) {
        if (player.state.health > 0 && t.contributors.includes(player.playerId ?? "solo")) player.gainExperience(enemyExperience(definition(t.id).level));
      }
      if (this.hasUnresolvedCast(t)) t.cancelledWindow = true;
      this.traceEvent("defeat", sourceId, t.id, t.position, 0, definition(t.id).name + " falls.");
      if (t.id === "scout" && !this.inPrivateInstance()) for (const player of this.shared ? this.shared.characters.values() : [this]) {
        if (t.contributors.includes(player.playerId ?? "solo") && player.state.chapter.accepted.includes("roll-call")) player.state.chapter.scoutDefeated = true;
      }
      t.shield = 0;
      t.respawnAt = this.now() + WORLD_RESPAWN_MILLISECONDS;
      if (!t.head?.fireballs.length) t.targetPlayerId = null; t.phase = "cleared"; t.remainingSeconds = 0; t.lastActionHit = false; t.aggro = false; t.moving = false; t.combatants = [];
      if (t.head) { t.head.pendingFireballs = 0; t.head.block = 0; t.head.blockSeconds = 0; }
      if (t.wolf) { t.wolf.motion = null; t.wolf.circling = false; t.position.y = terrainHeight(t.position.x, t.position.z); }
      this.report(`${definition(t.id).name} dies. ${definition(t.id).benefit}`, "combat");
      if (t.id === "ritual-guardian") {
        this.report("The guardian falls. Search its body for the Last Shift Roll, then carry it home.");
      }
    }
  }
  private tracePath(actorId: string, kind: CombatForecast["paths"][number]["kind"], action: string, points: readonly Position[], radius: number): void {
    this.recording?.paths.push({ actorId, kind, action, beat: this.state.combat.clock.elapsedSeconds, queueId: this.executingQueueId, points: points.map(p => ({ ...p })), radius });
  }
  private traceEvent(kind: CombatForecast["events"][number]["kind"], sourceId: string, targetId: string | null, position: Position, damage: number, text: string, radius = 0): void {
    this.recording?.events.push({ time: this.state.combat.clock.elapsedSeconds, kind, sourceId, targetId, position: { ...position }, damage, text, radius, queueId: this.executingQueueId });
  }
  private captureOutcomes(): void {
    if (!this.recording || this.recording.outcomes.length) return;
    this.recording.outcomes = [...this.state.world.threats.map(t => ({ id: t.id, health: t.health, staggered: t.staggered })), ...this.participants().map(p => ({ id: p.playerId ?? "solo", health: p.state.health, staggered: false }))];
  }
  async previewBait(destination: Position): Promise<CombatForecast | null> {
    return this.forecast(destination);
  }
  private forecast(destination?: Position): CombatForecast | null {
    if (this.recording || this.state.combat.clock.phase !== "preparation" || !this.inCombat()) return null;
    const players = this.participants();
    if (!players.includes(this)) players.push(this);
    // Every participant predicts the same execution; only the viewing player id differs.
    // Keep the full state key so plans, movement and clocks invalidate immediately.
    const key = JSON.stringify([destination, players.map(p => ({ id: p.playerId, state: p.state, camera: p.cameraForward }))]);
    const cached = destination ? this.movementForecastCache : this.shared ? this.shared.forecastCache : this.forecastCache;
    if (cached?.key === key) return { ...cached.value, playerId: this.playerId ?? "solo" };
    const world = structuredClone(this.state.world), clock = structuredClone(this.state.combat.clock), recording = { paths: [] as CombatForecast["paths"][number][], events: [] as CombatForecast["events"][number][], outcomes: [] as CombatForecast["outcomes"][number][] };
    const context: SharedContext | undefined = this.shared ? { ...this.shared, world, clock, mode: this.shared.mode === "paused" ? "private" : this.shared.mode, online: new Map(), characters: new Map() } : undefined;
    const copies = players.map(player => {
      // Copy live execution state without constructing fresh enemies or consuming randomness.
      const copy: Adventure = Object.assign(Object.create(Adventure.prototype), player, {
        state: structuredClone(player.state), shared: context, held: new Set<AdventureAction>(), mouseForward: false,
        movementFrames: null, cameraForward: { ...player.cameraForward }, events: [], combatFeedback: [], effects: [], recording, forecastCache: null,
      });
      copy.state.world = world; copy.state.combat.clock = clock;
      if (context) { context.online.set(copy.playerId!, copy); context.characters.set(copy.playerId!, copy); }
      return copy;
    });
    if (destination && !copies[players.indexOf(this)]!.queueBait(destination)) return null;
    const driver = copies[0]!;
    clock.gatheringRemainingSeconds = 0;
    driver.beginExecution();
    // Bound forecasts for exceptionally long enemy pursuits or volleys.
    const motion = new Map<string, Position[]>();
    for (let tick = 0; tick < 1800 && clock.phase === "active"; tick++) {
      const before = world.threats.map(t => ({ ...t.position }));
      context ? driver.stepShared(1 / 60) : driver.step(1 / 60);
      world.threats.forEach((threat, index) => {
        if (!threat.aggro || distance(before[index]!, threat.position) <= EPSILON) return;
        let points = motion.get(threat.id);
        if (!points) {
          points = [before[index]!]; motion.set(threat.id, points);
          recording.paths.push({ actorId: threat.id, kind: "move", action: "pursuit", beat: clock.elapsedSeconds, queueId: null, points, radius: 0 });
        }
        const previous = points.at(-2), last = points.at(-1)!;
        const dx = last.x - (previous?.x ?? last.x), dz = last.z - (previous?.z ?? last.z);
        const nx = threat.position.x - last.x, nz = threat.position.z - last.z;
        if (previous && Math.abs(dx * nz - dz * nx) < 0.000001 && dx * nx + dz * nz > 0) points[points.length - 1] = { ...threat.position };
        else points.push({ ...threat.position });
      });
    }
    if (clock.phase === "active") return null;
    driver.captureOutcomes();
    const value: CombatForecast = { playerId: this.playerId ?? "solo", ...recording };
    if (destination) this.movementForecastCache = { key, value };
    else if (this.shared) this.shared.forecastCache = { key, value };
    else this.forecastCache = { key, value };
    return value;
  }
  private contactPoint(from: Position, to: Position, center: Position, radius: number): Vector {
    const dx = to.x - from.x, dz = to.z - from.z, length = dx * dx + dz * dz;
    const fx = from.x - center.x, fz = from.z - center.z;
    if (fx * fx + fz * fz <= radius * radius || length <= EPSILON) return point(from.x, from.z);
    const b = fx * dx + fz * dz, discriminant = b * b - length * (fx * fx + fz * fz - radius * radius);
    const at = discriminant < 0 ? 1 : Math.max(0, Math.min(1, (-b - Math.sqrt(discriminant)) / length));
    return point(from.x + dx * at, from.z + dz * at);
  }
  private segmentTouches(from: Position, to: Position, center: Position, radius: number): boolean {
    const dx = to.x - from.x, dz = to.z - from.z, length = dx * dx + dz * dz;
    const at = length <= EPSILON ? 0 : Math.max(0, Math.min(1, ((center.x - from.x) * dx + (center.z - from.z) * dz) / length));
    return distance(point(from.x + dx * at, from.z + dz * at), center) <= radius + EPSILON;
  }
  private firstCollision(actor: ThreatState, from: Position, to: Position, radius = 1.1): ThreatState | undefined {
    return this.state.world.threats.filter(t => t !== actor && t.active && t.health > 0 && t.phase !== "returning" && this.segmentTouches(from, to, t.position, radius))
      .sort((a,b) => distance(from, this.contactPoint(from,to,a.position,radius)) - distance(from, this.contactPoint(from,to,b.position,radius)))[0];
  }
  private hasUnresolvedCast(t: ThreatState): boolean {
    return t.phase === "preparation" || t.phase === "action" && (!t.head || t.head.pendingFireballs > 0);
  }
  private interrupt(t: ThreatState, sourceId: string): void {
    if (t.health <= 0) return;
    if (this.hasUnresolvedCast(t)) t.cancelledWindow = true;
    const interrupted = t.phase === "preparation" || t.phase === "action";
    t.staggered = true; t.approaching = false; t.position.y = terrainHeight(t.position.x, t.position.z);
    if (t.wolf) { t.wolf.motion = null; t.wolf.circling = false; }
    if (t.head) t.head.pendingFireballs = 0;
    t.phase = "recovery"; t.remainingSeconds = 0;
    if (interrupted) {
      const text = definition(t.id).name + " is staggered — " + this.intention(t) + " interrupted.";
      this.report(text, "combat"); this.traceEvent("interruption", sourceId, t.id, t.position, 0, text);
    }
  }
  private collide(actor: ThreatState, victim: ThreatState, damage: number, sourceId: string): void {
    const text = definition(actor.id).name + " collides with " + definition(victim.id).name + ".";
    this.report(text, "combat"); this.traceEvent("collision", sourceId, victim.id, actor.position, damage, text);
    for (const t of [actor, victim]) {
      if (t.id === "nest") t.swarm = { position: point(t.position.x, t.position.z), expiresCycle: this.state.combat.clock.cycle + 1 };
      if (!t.aggro) this.engage(t);
      this.interrupt(t, sourceId);
      this.enemyHit(t, damage, sourceId);
    }
    const path = this.recording?.paths.slice().reverse().find(p => p.actorId === actor.id && p.action === "maul");
    if (path) this.recording!.paths[this.recording!.paths.indexOf(path)] = { ...path, radius: 0, points: [path.points[0]!, { ...actor.position }] };
  }
  private enemyHit(t: ThreatState, damage: number, sourceId: string): void {
    if (t.health <= 0) return;
    const sourceThreat = this.state.world.threats.find(enemy => enemy.id === sourceId);
    const contributor = sourceThreat ? this.targetPlayer(sourceThreat) : this.participants().find(player => (player.playerId ?? "solo") === sourceId);
    if (contributor && !t.contributors.includes(contributor.playerId ?? "solo")) t.contributors.push(contributor.playerId ?? "solo");
    const blocked = Math.min(damage, t.head?.block ?? t.shield);
    if (t.head) { t.head.block -= blocked; if (!t.head.block) t.head.blockSeconds = 0; } else t.shield -= blocked;
    const dealt = Math.min(t.health, damage - blocked); t.health -= dealt;
    for (const player of this.participants()) { player.feedback(t.id, "block", blocked); player.feedback(t.id, "damage", dealt); }
    this.traceEvent("hit", sourceId, t.id, t.position, dealt, definition(t.id).name + " takes " + dealt + " damage.");
    if (t.health > 0 && !t.aggro) this.engage(t);
    this.defeat(t, sourceId);
  }
  private ignite(t: ThreatState, sourceId: string): void {
    const cloud = t.swarm;
    if (!cloud) return;
    t.swarm = null;
    const radius = COMBAT_RULES.swarm.radius;
    this.traceEvent("ignition", sourceId, t.id, cloud.position, COMBAT_RULES.swarm.damage, "Spilled swarm ignites!", radius);
    for (const player of this.participants()) {
      player.effects.push({ id: ++player.effectId, kind: "ignition", position: { ...cloud.position }, radius });
      if (player.effects.length > 16) player.effects.shift();
      player.report("Spilled swarm ignites!", "combat");
    }
    for (const enemy of this.state.world.threats) if (enemy.active && enemy.health > 0 && distance(enemy.position, cloud.position) <= radius) this.enemyHit(enemy, COMBAT_RULES.swarm.damage, sourceId);
    for (const player of this.participants()) if (player.state.health > 0 && distance(player.state.position, cloud.position) <= radius) player.hurt(COMBAT_RULES.swarm.damage, "Burning swarm", false, sourceId);
  }
  private hearthstone(): void {
    const s = this.state;
    if (this.inCombat() || this.inPrivateInstance() || s.phase === "lost") { this.report("Reach safety before using your Hearthstone."); return; }
    if (!this.ready()) return;
    this.cancelGather(); this.activeEmote = null; s.sitting = false;
    this.recover("hearthstone", 5);
    this.report("Returning to Nine-Bell Yard. Stay still for 5 seconds.");
  }
  private cancelHearthstone(): void {
    const s = this.state;
    if (s.currentAction !== "hearthstone") return;
    s.currentAction = null; s.actionDuration = 0; s.actionRemainingSeconds = 0; s.actionCooldown = 0;
    this.report("Hearthstone cancelled.");
  }
  private gather(): void {
    const s = this.state;
    if (this.inPrivateInstance()) { this.report("Private encounters do not grant resources."); return; }
    if (s.phase !== "expedition" || !this.ready()) return;
    if (!this.near("frost-cores", 3)) { this.report("Approach the coolant crystals in the first clearing to gather."); return; }
    if (s.world.resourceRemaining < 3) { this.report("The coolant crystals are regrowing. Return soon to gather more."); return; }
    this.recover("gather", 2); s.gatherPending = true;
    this.report("Gathering coolant crystals. Move or press Esc to cancel.");
  }
  private cancelGather(): void {
    const s = this.state;
    if (!s.gatherPending) return;
    s.gatherPending = false; s.currentAction = null;
    s.actionCooldown = 0; s.actionRemainingSeconds = 0; s.actionDuration = 0;
    this.report("Gathering cancelled.");
  }
  private completeGather(): void {
    const s = this.state;
    if (!s.gatherPending) return;
    s.gatherPending = false;
    if (this.inPrivateInstance() || s.phase !== "expedition" || s.health <= 0 || !this.near("frost-cores", 3)) return;
    if (s.world.resourceRemaining < 3) { this.report("The coolant crystals are regrowing. Return soon to gather more."); return; }
    s.world.resourceRemaining -= 3; s.cargo += 3; s.presence += 4;
    // Each harvest returns its three cores two minutes later, independently of later harvests.
    s.world.resourceRespawns.push({ at: this.now() + WORLD_RESPAWN_MILLISECONDS, quantity: 3 });
    this.report("You gather Coolant crystals × 3. Return alive to keep them.");
    if (s.world.threats.some(t => t.id === "warder" && t.health > 0)) {
      this.hurt(8, "The warder's thorns");
    }
  }
  private ritual(): void {
    const s = this.state;
    if (this.inPrivateInstance()) { this.report("Private encounters do not grant world progress."); return; }
    if (s.phase !== "expedition" || !this.ready()) return;
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
    guardian.active = true; this.engage(guardian);
    this.report("Six coolant crystals offered. Foreman Nine wakes; recover the Last Shift Roll from its remains.");
  }

  advance(seconds: number): void {
    if (this.shared) throw new Error("Advance the shared adventure, not an individual character.");
    if (!Number.isFinite(seconds) || seconds < 0) throw new Error("Elapsed time must be finite and nonnegative.");
    refreshWorld(this.state.world, this.now());
    this.closeMissingLoot();
    this.advanceSimulation(seconds);
  }
  private advanceSimulation(seconds: number): void {
    let remaining = seconds;
    const clock = this.state.combat.clock, tick = 1 / 60;
    this.resolveTurnActions();
    while (remaining > EPSILON) {
      let dt = Math.min(remaining, tick);
      if (clock.phase === "active") {
        // Execution and its forecast share fixed ticks; retain partial host frames across calls and saves.
        const needed = tick - clock.pendingSeconds;
        if (remaining + EPSILON < needed) { clock.pendingSeconds += remaining; return; }
        remaining = Math.max(0, remaining - needed); clock.pendingSeconds = 0; dt = tick;
      } else remaining -= dt;
      if (this.shared) this.stepShared(dt); else this.step(dt);
    }
  }
  private move(dt: number): void {
    if (this.mouseForward || this.held.has("forward") || this.held.has("backward") || this.held.has("left") || this.held.has("right") || this.held.has("jump")) { this.cancelGather(); this.state.sitting = false; this.activeEmote = null; }
    const result = moveLocomotion(this.state, { forward: this.mouseForward ? 1 : Number(this.held.has("forward")) - Number(this.held.has("backward")),
      strafe: Number(this.held.has("right")) - Number(this.held.has("left")), cameraX: this.cameraForward.x, cameraZ: this.cameraForward.z, jump: false }, dt, classKit(this.state.archetype).movementSpeed);
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
        if (Math.abs(frame.input.forward) > EPSILON || Math.abs(frame.input.strafe) > EPSILON || frame.input.jump) { this.cancelGather(); this.state.sitting = false; this.activeEmote = null; }
        this.setCameraForward(frame.input.cameraX, frame.input.cameraZ);
        const result = moveLocomotion(this.state, { ...frame.input, jump: frame.input.jump && this.movementElapsed === 0 }, elapsed, classKit(this.state.archetype).movementSpeed);
        this.moving = result.moving; this.backpedaling = result.backpedaling;
      }
      this.movementElapsed += elapsed; remaining -= elapsed;
      if (this.movementElapsed >= frame.seconds - EPSILON) this.movementFrames!.shift();
    }
    // Network input is a stream of short-lived commands.  An empty stream
    // means the player is neutral, not that world physics has stopped.  Keep
    // advancing locomotion so jumps land and vertical velocity settles while
    // a backgrounded client is not sending fresh packets.
    if (remaining > EPSILON && !blocked) {
      moveLocomotion(this.state, {
        forward: 0, strafe: 0, cameraX: this.cameraForward.x, cameraZ: this.cameraForward.z, jump: false,
      }, remaining, classKit(this.state.archetype).movementSpeed);
    }
  }
  private moveManeuver(dt: number): void {
    const s = this.state, m = s.maneuver;
    if (!m) return;
    const duration = m.kind === "bait" ? COMBAT_RULES.bait.duration : COMBAT_RULES.strike.duration;
    const motion = { ...m, duration };
    this.moving = moveManeuverPosition(s, motion, dt);
    m.remainingSeconds = motion.remainingSeconds;
    this.backpedaling = false;
    if (m.remainingSeconds > EPSILON) return;
    const water = lakeWaterAt(s.position.x, s.position.z);
    s.position.y = water !== null && isSwimmingPosition(s.position.x, s.position.z) ? water : terrainHeight(s.position.x, s.position.z);
    s.verticalSpeed = 0; s.maneuver = null;
    if (m.kind === "lunge") {
      const t = s.world.threats.find(t => t.id === m.targetId);
      if (t && t.active && t.health > 0 && distance(s.position, t.position) <= COMBAT_RULES.strike.range + EPSILON && this.attackPath(t)) this.hit(t, classAction(s.archetype, "strike").damage ?? COMBAT_RULES.strike.damage, "Attack at");
      else { this.feedback(m.targetId, "miss", 0); this.report("Your lunge falls short.", "combat"); }
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
    if (this.lootOpenId === IRONBACK_CHEST_ID) { if (!this.canLootChest()) this.lootOpenId = null; return; }
    if (this.lootOpenId !== null && !this.state.world.threats.some(t => t.id === this.lootOpenId && this.canLoot(t))) this.lootOpenId = null;
  }
  private stepPlayer(dt: number): void {
    const s = this.state;
    if (this.activeEmote) {
      this.emoteSeconds -= dt;
      if (this.emoteSeconds <= EPSILON || this.inCombat() || s.phase === "lost") this.activeEmote = null;
    }
    if (s.phase === "lost") { if (this.movementFrames) this.consumeMovement(dt, true); this.moving = false; this.backpedaling = false; return; }
    if (s.maneuver) { if (this.movementFrames) this.consumeMovement(dt, true); this.moveManeuver(dt); }
    else if (this.inCombat()) {
      if (this.movementFrames) this.consumeMovement(dt, true);
      moveLocomotion(s, { forward: 0, strafe: 0, cameraX: this.cameraForward.x, cameraZ: this.cameraForward.z, jump: false }, dt, classKit(this.state.archetype).movementSpeed);
      this.moving = false; this.backpedaling = false;
    }
    else if (this.movementFrames) this.consumeMovement(dt, false);
    else this.move(dt);
    if (s.currentAction === "hearthstone" && (this.moving || s.verticalSpeed !== 0 || this.inCombat() || this.inPrivateInstance())) this.cancelHearthstone();
    this.closeMissingLoot();
    if (this.vendorOpen && (this.state.phase !== "town" || !this.near(this.vendorOpen, 2.5))) this.vendorOpen = null;
    if (this.shopOpen && !this.near("mara", 2.5)) { this.shopOpen = false; this.trade = null; }
    if (this.innOpen && !this.near("inn", 2.5)) this.innOpen = false;
    if (this.bankOpen && !this.near("bank", 2.5)) this.bankOpen = false;
    if (s.phase === "town" && !inTown(s.position)) {
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
      s.actionCooldown = 0; s.guardSeconds = 0; s.block = 0; this.shopOpen = false; this.trade = null; this.innOpen = false; this.bankOpen = false;
      this.report("You leave Nine-Bell Yard. Return to town to secure what you carry.");
    } else if (s.phase === "expedition" && inTown(s.position) && !this.inPrivateInstance()) {
      this.returnToTown();
    }
    if (s.phase === "expedition") s.presence += (this.moving ? 0.5 : 0.1) * dt;
    if (this.inCombat() && s.combat.clock.phase === "preparation") {
      if (s.currentAction === "gather") this.advanceAction(dt);
      return;
    }
    if (s.combat.clock.phase !== "active") s.guardSeconds = Math.max(0, s.guardSeconds - dt);
    if (s.guardSeconds <= EPSILON) { s.guardSeconds = 0; s.block = 0; }
    this.advanceAction(dt);
    if (s.health > 0) this.advanceResources(dt);
  }
  private returnToTown(): void {
    const s = this.state;
      const reservedCrystals = s.chapter.accepted.includes("cold-hands") && !s.chapter.completed.includes("cold-hands") ? Math.min(3, s.cargo) : 0;
      const reservedRoll = s.chapter.accepted.includes("last-shift") && !s.chapter.completed.includes("last-shift") ? s.carriedRelics : 0;
      s.phase = "town"; s.supplies += s.cargo - reservedCrystals + s.carriedSalvage; s.bankedRelics += s.carriedRelics - reservedRoll;
      s.cargo = reservedCrystals; s.carriedRelics = reservedRoll; s.carriedSalvage = 0; s.guardSeconds = 0; s.block = 0;
      s.maneuver = null; s.position.y = supportHeight(s.position.x, s.position.z); s.verticalSpeed = 0; this.lootOpenId = null; this.trade = null;
      if (!this.shared) for (const t of s.world.threats) if (t.health > 0) this.releaseThreat(t);

      this.report(`You return to ${YARD.settlement}. Salvage and spare crystals are secured.${reservedCrystals ? " Bring your coolant crystals to Mara." : ""}${reservedRoll ? " Bring the Last Shift Roll to Rowan." : ""} Visit the inn before your next trip.`);
  }
  private advanceAction(dt: number): void {
    const s = this.state;
    s.actionCooldown = Math.max(0, s.actionCooldown - dt);
    if (s.actionCooldown <= EPSILON) s.actionCooldown = 0;
    s.actionRemainingSeconds = Math.max(0, s.actionRemainingSeconds - dt);
    if (s.actionRemainingSeconds <= EPSILON) {
      if (s.currentAction === "gather") this.completeGather();
      if (s.currentAction === "hearthstone" && !this.inCombat() && !this.inPrivateInstance() && s.phase !== "lost") {
        s.position = point(0, -8); s.verticalSpeed = 0; this.held.clear(); this.mouseForward = false;
        this.returnToTown();
      }
      s.currentAction = null; s.actionDuration = 0;
    }
  }
  private stepShared(dt: number): void {
    const players = this.participants();
    for (const player of players) player.stepPlayer(dt);
    for (const t of this.state.world.threats) {
      t.moving = false; const target = this.chooseTarget(t);
      if (t.aggro && target && t.targetPlayerId !== target.playerId) {
        // A departing player does not rewind the creature's current cast or
        // ramp. The replacement target inherits the live encounter beat.
        if (!target.inCombat()) target.settleCombatCell();
        t.targetPlayerId = target.playerId;
        if (target.playerId !== null && !t.combatants.includes(target.playerId)) t.combatants.push(target.playerId);
        t.targetPosition = { ...target.state.position };
      }
      if (t.aggro && target?.playerId !== null && target?.playerId !== undefined && !t.combatants.includes(target.playerId)) t.combatants.push(target.playerId);
      if (t.aggro && !target) this.releaseThreat(t); else (target ?? this).acquireOrRelease(t, dt);
    }
    if (this.state.combat.clock.phase === "active") {
      for (const player of players) if (player.inCombat()) player.executeQueued();
      for (const t of this.state.world.threats) {
        const target = this.targetPlayer(t);
        if (t.head?.fireballs.length && (!t.aggro || t.health <= 0) && target) target.advanceFireballs(t, dt);
        else if (t.aggro && t.active && t.health > 0 && target) target.advanceThreat(t, dt);
      }
    }
    this.finishCombatStep(dt);
  }
  private step(dt: number): void {
    this.stepPlayer(dt);
    if (this.state.health <= 0) { this.finishCombatStep(0); return; }
    for (const threat of this.state.world.threats) { threat.moving = false; this.acquireOrRelease(threat, dt); }
    if (this.state.combat.clock.phase === "active") {
      this.executeQueued();
      for (const threat of this.state.world.threats) {
        if (threat.head?.fireballs.length && (!threat.aggro || threat.health <= 0) && this.state.health > 0) this.advanceFireballs(threat, dt);
        else if (threat.aggro && threat.active && threat.health > 0 && this.state.health > 0) this.advanceThreat(threat, dt);
      }
    }
    this.finishCombatStep(dt);
  }
  private executeQueued(): void {
    const s = this.state, c = s.combat;
    for (const entry of c.queued) {
      if (entry.status !== "pending" || entry.offsetSeconds > c.clock.elapsedSeconds + EPSILON) continue;
      const selected = s.selectedThreat;
      if (entry.targetId) s.selectedThreat = entry.targetId;
      const target = s.world.threats.find(t => t.id === entry.targetId);
      const before = s.attackSequence; this.executingQueueId = entry.id;
      if (entry.action === "strike") {
        if (target && this.attackInRange(target, "strike") && s.maneuver === null) {
          this.tracePath(this.playerId ?? "solo", "attack", "strike", [s.position, target.position], 0);
          this.recover("strike", COMBAT_RULES.strike.duration);
          this.hit(target, classAction(s.archetype, "strike").damage ?? COMBAT_RULES.strike.damage, "Attack at");
        } else this.report("The target is out of reach, behind cover, or no longer available.", "combat");
        entry.status = s.attackSequence > before ? "executed" : "failed";
      } else {
        s.currentAction = null;
        if (entry.action === "bait") {
          const desired = entry.destination!;
          const end = reachableCombatCells(s.position, classKit(s.archetype).movementTiles).find(cell => cell.x === desired.x && cell.z === desired.z);
          if (!end) { entry.status = "failed"; entry.reason = "The destination is no longer reachable."; this.report(entry.reason, "combat"); s.selectedThreat = selected; this.executingQueueId = null; continue; }
          const facing = this.direction(s.position, end);
          this.spendStamina(1); this.recover("bait", COMBAT_RULES.bait.duration);
          s.maneuver = { kind: "bait", targetId: s.selectedThreat, start: { ...s.position }, destination: end, facing, remainingSeconds: COMBAT_RULES.bait.duration };
          this.tracePath(this.playerId ?? "solo", "move", "bait", [s.position, end], 0);
        } else this.useAbility("brace", true);
        entry.status = s.currentAction === entry.action ? "executed" : "failed";
      }
      entry.reason = entry.status === "failed" ? s.report : null;
      s.selectedThreat = selected; this.executingQueueId = null;
    }
  }
  private participants(): Adventure[] { return this.shared ? [...this.shared.online.values()] : [this]; }
  private targetPlayer(t: ThreatState): Adventure | undefined {
    if (!this.shared) return this;
    return t.targetPlayerId === null ? undefined : this.shared.online.get(t.targetPlayerId);
  }
  private chooseTarget(t: ThreatState): Adventure | undefined {
    const previous = this.targetPlayer(t);
    if (t.aggro && previous?.canBeTargetedBy(t)) return previous;
    return this.participants().filter(p => p.canBeTargetedBy(t)).sort((a,b) => distance(a.state.position,t.position) - distance(b.state.position,t.position))[0];
  }
  private canBeTargetedBy(t: ThreatState): boolean {
    const s = this.state, d = definition(t.id);
    return s.phase === "expedition" && s.health > 0 && !inTown(s.position) && distance(s.position, d.position) <= d.leash;
  }
  private engage(t: ThreatState): void {
    const clock = this.state.combat.clock;
    if (clock.phase === "idle" && !this.state.world.threats.some(threat => threat.aggro && threat.health > 0)) clock.gatheringRemainingSeconds = COMBAT_RULES.window.gathering;
    this.cancelHearthstone();
    this.state.sitting = false; this.activeEmote = null;
    const settled = this.engagementPositions(t);
    if (!this.inCombat()) this.settleCombatCell();
    t.position = { ...settled.threat };
    t.aggro = true; t.lastActionHit = false; t.targetPlayerId = this.playerId;
    if (this.playerId !== null && !t.combatants.includes(this.playerId)) t.combatants.push(this.playerId);
    t.joinCycle = clock.phase === "preparation" && clock.gatheringRemainingSeconds > EPSILON ? clock.cycle : clock.cycle + 1; t.windowCycle = 0;
    t.phase = "approach"; t.castDuration = 0; t.remainingSeconds = 0;
    if (clock.phase === "preparation" && t.joinCycle === clock.cycle) this.commitThreat(t);
  }
  private commitThreat(t: ThreatState): void {
    const clock = this.state.combat.clock;
    if (!t.aggro || t.health <= 0 || t.windowCycle === clock.cycle || t.joinCycle > clock.cycle) return;
    t.windowCycle = clock.cycle; t.approaching = false; t.specialOffset = t.wolf ? .85 : .9 + nextThreatRandom(t) * .2; t.phase = "preparation"; this.beginCast(t);
  }
  private beginCast(t: ThreatState): void {
    t.phase = "preparation"; t.lastActionHit = false;
    const ramp = Math.min(1, t.actionSequence * 0.15);
    t.damage = t.wolf ? 18 + Math.min(18, t.actionSequence * 2) : Math.ceil(definition(t.id).damage * (1 + this.state.presence / 100 + ramp));
    if (t.id === "ritual-guardian") {
      t.abilityIndex = t.actionSequence % 3;
      t.damage = t.abilityIndex === 2 ? 0 : (t.abilityIndex === 0 ? 24 : 48);
    }
    if (t.head) {
      t.head.ability = this.chooseHeadAbility(t); t.head.castVolley = t.head.volley;
      t.damage = this.ability(t).damage;
    }
    t.turnTarget = { ...this.state.position };
    t.castDuration = t.specialOffset;
    t.remainingSeconds = t.specialOffset;
    t.targetPosition = t.wolf ? this.wolfEndpoint(t) : { ...t.position };
    if (t.wolf) { t.wolf.nextAttackSeconds = t.remainingSeconds; t.wolf.motion = null; t.position.y = terrainHeight(t.position.x, t.position.z); }
  }
  private chooseHeadAbility(t: ThreatState): HeadAbilityId {
    const h = t.head!, s = this.state;
    if (!h.opened) return "ember-beam";
    const previous = h.ability;
    if (previous === "kindle") return "fireball";
    const fireDamage = COMBAT_RULES.head.fireballDamage * h.volley;
    if (t.actionSequence % 3 === 0 || !this.headInRange(t) || s.block >= fireDamage) return "kindle";
    if (previous !== "ember-ward" && t.health <= definition(t.id).health / 2 &&
      this.canUseAttack(t, "strike") && s.stamina > 0 && s.health > fireDamage) return "ember-ward";
    return "fireball";
  }
  private acquireOrRelease(t: ThreatState, dt: number): void {
    if (!t.active || t.health <= 0) return;
    const d = definition(t.id), s = this.state;
    if (this.inPrivateInstance() && !t.aggro) return;
    if (t.phase === "returning") { this.returnHome(t, dt); return; }
    if (!t.aggro) {
      this.patrol(t, dt);
      if (s.phase === "expedition" && !inTown(s.position) && d.disposition === "hostile" && distance(s.position, t.position) <= d.aggroRange && this.clearPath(t.position, s.position)) this.engage(t);
      // Hostile creatures close to an engaged ally answer the call, but only
      // across a short, clear path. This keeps pulls local instead of waking
      // the whole forest and leaves neutral creatures untouched.
      if (!t.aggro && d.disposition === "hostile" && distance(t.position, d.position) <= d.leash) {
        for (const ally of s.world.threats) {
          if (ally === t || !ally.active || !ally.aggro || ally.health <= 0 || distance(t.position, ally.position) > CALL_FOR_HELP_RANGE || !this.clearPath(t.position, ally.position)) continue;
          const opponent = this.targetPlayer(ally);
          if (!opponent?.canBeTargetedBy(ally) || !opponent.canBeTargetedBy(t)) continue;
          opponent.engage(t);
          opponent.report(`${d.name} answers its ally's call.`, "combat");
          break;
        }
      }
    } else if (s.phase !== "expedition" || inTown(s.position) || distance(s.position, d.position) > d.leash || distance(t.position, d.position) > d.leash) this.releaseThreat(t);
  }
  private recover(action: AdventureAction | "equip", duration: number): void {
    this.state.currentAction = action; this.state.actionDuration = duration; this.state.actionCooldown = duration; this.state.actionRemainingSeconds = duration;
  }
  private inCombat(): boolean {
    const id = this.playerId ?? "solo";
    return this.state.phase === "expedition" && this.state.world.threats.some(t => t.active && t.health > 0 && t.aggro &&
      (t.combatants.includes(id) || (!this.shared || t.targetPlayerId === this.playerId)));
  }
  private spendStamina(cost: number): void {
    const s = this.state;

    if (cost > 0 && s.stamina === COMBAT_RULES.stamina.maximum) s.staminaRecoverySeconds = COMBAT_RULES.stamina.recoverySeconds;
    s.stamina -= cost;
  }
  private advanceResources(dt: number): void {
    const s = this.state;
    if (s.stamina < COMBAT_RULES.stamina.maximum) {
      s.staminaRecoverySeconds -= dt;
      if (s.staminaRecoverySeconds <= EPSILON) { s.stamina++; s.staminaRecoverySeconds = s.stamina < COMBAT_RULES.stamina.maximum ? COMBAT_RULES.stamina.recoverySeconds : 0; }
    }

  }
  private releaseThreat(t: ThreatState): void {
    if (t.id === "ritual-guardian" && this.shared?.mode === "shared") {
      Object.assign(t, { ...newThreat(definition(t.id)), rng: t.rng });
      this.state.world.ritualCalled = false;
      return;
    }
    if (t.health < definition(t.id).health) this.report(`${definition(t.id).name} breaks contact and recovers while returning home.`, "combat");
    t.comboOpened = false; t.staggered = false; t.swarm = null; t.cancelledWindow = false;
    t.health = definition(t.id).health;
    t.actionSequence = 0;
    t.shield = 0; t.contributors = []; t.combatants = [];
    t.targetPlayerId = null; t.castDuration = 0; t.shieldSeconds = 0;
    t.joinCycle = 0; t.windowCycle = 0; t.approaching = false;
    t.aggro = false; t.remainingSeconds = 0; t.lastActionHit = false; t.moving = false; t.abilityIndex = 0;
    t.damage = definition(t.id).damage;
    if (t.wolf) {
      t.wolf.motion = null; t.wolf.circling = false;
      t.wolf.nextAttackSeconds = COMBAT_RULES.enemy.preparation; t.position.y = terrainHeight(t.position.x, t.position.z);
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
    const d = definition(t.id), target = this.pursuitTarget(t), gap = distance(t.position, target) - this.ability(t).range;
    const speed = d.pursuitSpeed ?? d.speed;
    if (gap > EPSILON && speed > 0) this.moveThreat(t, target, Math.min(dt, gap / speed));
    t.targetPosition = { ...t.position };
  }
  /** Resolve the target's live position on every fixed simulation tick. */
  private pursuitTarget(t: ThreatState): Vector {
    return this.targetPlayer(t)?.state.position ?? t.turnTarget;
  }
  private moveThreat(t: ThreatState, destination: Position, dt: number, speed = t.aggro ? definition(t.id).pursuitSpeed ?? definition(t.id).speed : definition(t.id).speed): void {
    if (speed === 0) return;
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
    const x = t.position.x + (next.x - t.position.x) * amount, z = t.position.z + (next.z - t.position.z) * amount;
    if (this.state.combat.clock.phase === "active" && this.participants().some(player => player.state.combat.queued.some(entry => {
      if (entry.action !== "bait" || entry.status === "failed" || !entry.destination) return false;
      const before = distance(t.position, entry.destination), after = Math.hypot(x-entry.destination.x, z-entry.destination.z);
      return after < COMBAT_CELL_SIZE * .8 && after < before;
    }))) return;
    t.position.x = x; t.position.z = z;
    t.position.y = terrainHeight(t.position.x, t.position.z);
    t.moving = true;
    if (t.wolf) t.wolf.facing = this.direction(t.position, next);
  }
  private positionThreat(t: ThreatState, dt: number): void {
    if (t.wolf) { this.positionWolf(t, dt); t.targetPosition = this.wolfEndpoint(t); }
    else if (t.head) {
      const target = this.pursuitTarget(t), gap = distance(t.position, target) - 8;
      if (gap > 0) this.moveThreat(t, target, Math.min(dt, gap / definition(t.id).speed));
      t.targetPosition = { ...target };
    } else this.pursue(t, dt);
  }
  private advanceThreat(t: ThreatState, dt: number): void {
    const clock = this.state.combat.clock;
    if (t.windowCycle !== clock.cycle || t.joinCycle > clock.cycle) return;
    t.shieldSeconds = Math.max(0, t.shieldSeconds - dt);
    if (t.shieldSeconds <= EPSILON) t.shield = 0;
    if (t.head) {
      t.head.blockSeconds = Math.max(0, t.head.blockSeconds - dt);
      if (t.head.blockSeconds <= EPSILON) t.head.block = 0;
    }
    if (t.staggered) { if (t.head?.fireballs.length) this.advanceFireballs(t, dt); return; }
    if (t.phase === "preparation") {
      this.positionThreat(t, dt);
      t.remainingSeconds = Math.max(0, t.specialOffset - clock.elapsedSeconds);
      if (t.wolf) t.wolf.nextAttackSeconds = t.remainingSeconds;
      if (t.remainingSeconds > EPSILON) return;
      if (t.head) this.resolveHeadCast(t);
      else if (t.wolf) this.launchMaul(t);
      else if (t.id === "ritual-guardian" && t.abilityIndex === 2) {
        t.shield = 60; t.shieldSeconds = Math.max(0, COMBAT_TURN.duration - clock.elapsedSeconds); t.actionSequence++;
        this.report("Foreman Nine raises Safety Shield: 60 Block for the rest of this turn.", "combat"); this.beginRecovery(t);
      } else { t.phase = "action"; t.approaching = distance(t.position, this.pursuitTarget(t)) > this.ability(t).range; t.remainingSeconds = this.ability(t).noticeSeconds; t.targetPosition = { ...t.position };
        if (!t.approaching) this.tracePath(t.id, "attack", this.ability(t).id, [t.position, t.targetPosition], this.ability(t).range);
      }
      return;
    }
    if (t.phase === "action") {
      if (t.approaching) {
        const before = { ...t.position };
        this.pursue(t, dt);
        if (distance(t.position, this.pursuitTarget(t)) > this.ability(t).range + EPSILON && distance(before, t.position) > EPSILON && clock.elapsedSeconds < COMBAT_TURN.duration - this.ability(t).noticeSeconds) return;
        t.approaching = false; t.targetPosition = { ...t.position };
        this.tracePath(t.id, "attack", this.ability(t).id, [t.position, t.targetPosition], this.ability(t).range);
      }
      if (t.head) { this.advanceFireballs(t, dt); return; }
      if (t.wolf) this.moveWolfMotion(t, dt);
      if (t.staggered || t.health <= 0) return;
      t.remainingSeconds = Math.max(0, t.remainingSeconds - dt);
      if (t.remainingSeconds <= EPSILON) { this.resolveAttack(t); this.beginRecovery(t); }
      return;
    }
    if (t.phase === "recovery") {
      t.remainingSeconds = Math.max(0, t.remainingSeconds - dt);
      if (t.remainingSeconds <= EPSILON) { t.phase = "approach"; t.remainingSeconds = 0; }
    }
  }
  private beginRecovery(t: ThreatState): void {
    if (!t.aggro || t.health <= 0) return;
    t.phase = "recovery"; t.remainingSeconds = COMBAT_RULES.enemy.recovery;
  }
  private currentActivity(t: ThreatState): ThreatForecastEntry | null {
    if (!t.aggro || t.health <= 0 || t.phase !== "action") return null;
    return { ability: this.ability(t), remainingSeconds: t.remainingSeconds, status: "active" };
  }
  private headInRange(t: ThreatState): boolean {
    return distance(t.position, this.state.position) <= definition(t.id).reach + EPSILON && this.clearPath(t.position, this.state.position);
  }
  private resolveHeadCast(t: ThreatState): void {
    const h = t.head!;
    h.opened = true; t.actionSequence++;
    if (h.ability === "fireball") {
      t.phase = "action"; h.pendingFireballs = h.castVolley; h.nextFireballSeconds = 0;
      t.remainingSeconds = COMBAT_RULES.head.fireballTravel + (h.castVolley - 1) * COMBAT_RULES.head.fireballSpacing;
      this.advanceFireballs(t, 0);
      this.report("Cinder Watchman casts " + h.castVolley + " fireball" + (h.castVolley === 1 ? "." : "s."), "combat");
      return;
    }
    if (h.ability === "ember-beam") {
      this.tracePath(t.id, "attack", h.ability, [t.position, this.state.position], 0);
      t.lastActionHit = this.headInRange(t);
      if (t.lastActionHit) this.hurt(COMBAT_RULES.head.beamDamage, "Cinder Watchman — Ember Beam", false, t.id);
      else this.feedback(null, "miss", 0);
    } else if (h.ability === "ember-ward") {
      h.block = COMBAT_RULES.head.ward; h.blockSeconds = COMBAT_RULES.head.wardDuration;
      this.report("Cinder Watchman raises a ward: 6 block for 2 seconds.", "combat");
    } else { h.volley++; this.report("Cinder Watchman grows stronger: " + h.volley + " fireballs per volley.", "combat"); }
    this.beginRecovery(t);
  }
  private advanceFireballs(t: ThreatState, dt: number): void {
    const h = t.head!;
    for (const ball of [...h.fireballs]) {
      const old = { ...ball.position };
      const fraction = ball.remainingSeconds <= EPSILON ? 1 : Math.min(1, dt / ball.remainingSeconds);
      const end = point(old.x + (this.state.position.x - old.x) * fraction, old.z + (this.state.position.z - old.z) * fraction);
      const victim = this.firstCollision(t, old, end, .75);
      ball.position = victim ? this.contactPoint(old, end, victim.position, .75) : end;
      ball.remainingSeconds = Math.max(0, ball.remainingSeconds - dt);
      const path = this.recording?.paths.slice().reverse().find(p => p.actorId === t.id && p.action === "fireball:" + ball.id);
      if (path) (path.points as Position[]).push({ ...ball.position });
      for (const bee of this.state.world.threats) if (bee.swarm && this.segmentTouches(old, ball.position, bee.swarm.position, COMBAT_RULES.swarm.radius)) this.ignite(bee, t.id);
      if (victim) { this.enemyHit(victim, ball.damage, t.id); ball.remainingSeconds = 0; }
      else if (ball.remainingSeconds <= EPSILON) {
        if (distance(ball.origin, this.state.position) <= definition(t.id).reach + EPSILON && this.clearPath(ball.origin, this.state.position)) this.hurt(ball.damage, "Cinder Watchman — Fireball", false, t.id);
        else this.feedback(null, "miss", 0);
      }
      if (this.state.health <= 0) return;
    }
    h.fireballs = h.fireballs.filter(ball => ball.remainingSeconds > EPSILON);
    h.nextFireballSeconds = Math.max(-1, h.nextFireballSeconds - dt);
    if (t.health > 0 && !t.staggered && h.pendingFireballs > 0 && h.nextFireballSeconds <= EPSILON) {
      if (this.headInRange(t)) {
        const ball = { id: ++h.projectileSequence, origin: point(t.position.x, t.position.z), position: point(t.position.x, t.position.z), remainingSeconds: COMBAT_RULES.head.fireballTravel, duration: COMBAT_RULES.head.fireballTravel, damage: COMBAT_RULES.head.fireballDamage };
        h.fireballs.push(ball);
        this.tracePath(t.id, "attack", "fireball:" + ball.id, [ball.position], 0);
      }
      h.pendingFireballs--; h.nextFireballSeconds = COMBAT_RULES.head.fireballSpacing;
    }
    t.remainingSeconds = Math.max(0, t.remainingSeconds - dt);
    if (h.pendingFireballs === 0 && h.fireballs.length === 0) this.beginRecovery(t);
  }
  private reachableEndpoint(from: Position, to: Position): Vector {
    const destination = point(Math.max(WORLD_BOUNDS.minX, Math.min(WORLD_BOUNDS.maxX, to.x)), Math.max(WORLD_BOUNDS.minZ, Math.min(WORLD_BOUNDS.maxZ, to.z)));
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
    const target = this.pursuitTarget(t);
    const facing = this.direction(t.position, target);
    const length = Math.min(distance(t.position, target), COMBAT_RULES.wolf.lungeDistance);
    return this.reachableEndpoint(t.position, point(t.position.x + facing.x * length, t.position.z + facing.z * length));
  }
  private launchMaul(t: ThreatState): void {
    const w = t.wolf;
    if (!w) return;
    t.position.y = terrainHeight(t.position.x, t.position.z);
    const target = this.pursuitTarget(t);
    w.facing = this.direction(t.position, target); w.circling = false;
    w.attackOrigin = { ...t.position };
    t.targetPosition = this.wolfEndpoint(t);
    w.motion = { kind: "lunge", start: { ...t.position }, destination: { ...t.targetPosition },
      remainingSeconds: COMBAT_RULES.enemy.action, duration: COMBAT_RULES.enemy.action };
    this.tracePath(t.id, "attack", "maul", [t.position, t.targetPosition], COMBAT_RULES.wolf.impactRadius);
    t.phase = "action"; t.abilityIndex = 1; t.lastActionHit = false;
    t.remainingSeconds = COMBAT_RULES.enemy.action;
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
    const victim = this.firstCollision(t, old, t.position);
    if (victim) {
      t.position = this.contactPoint(old, t.position, victim.position, 1.1);
      this.collide(t, victim, t.damage, t.id); return;
    }
    t.position.y = terrainHeight(t.position.x, t.position.z) + 4 * COMBAT_RULES.wolf.lungeHeight * progress * (1 - progress);
    t.moving = Math.hypot(t.position.x - old.x, t.position.y - old.y, t.position.z - old.z) > EPSILON;
    if (distance(motion.start, motion.destination) > EPSILON) w.facing = this.direction(motion.start, motion.destination);
    if (motion.remainingSeconds > EPSILON) return;
    t.position.y = terrainHeight(t.position.x, t.position.z); w.motion = null;
  }
  private positionWolf(t: ThreatState, dt: number): void {
    const w = t.wolf;
    if (!w) return;
    const target = this.pursuitTarget(t);
    w.facing = this.direction(t.position, target); w.circling = false;
    if (w.motion) { this.moveWolfMotion(t, dt); return; }
    const gap = distance(t.position, target);
    if (gap > COMBAT_RULES.wolf.circleRange) {
      this.moveThreat(t, target, dt);
      w.facing = this.direction(t.position, target);
    } else {
      const radial = Math.max(-1, Math.min(1, gap - COMBAT_RULES.wolf.circleRadius));
      const tangentX = -w.facing.z, tangentZ = w.facing.x;
      const norm = Math.hypot(tangentX + w.facing.x * radial, tangentZ + w.facing.z * radial);
      const amount = COMBAT_RULES.wolf.circleSpeed * dt / norm;
      const next = this.reachableEndpoint(t.position, point(t.position.x + (tangentX + w.facing.x * radial) * amount,
        t.position.z + (tangentZ + w.facing.z * radial) * amount));
      t.moving = distance(t.position, next) > EPSILON; t.position = next; w.circling = t.moving;
      w.facing = this.direction(t.position, target);
    }
  }
  private resolveAttack(t: ThreatState): void {
    t.lastActionHit = t.id === "ritual-guardian" && t.abilityIndex === 0 ? distance(this.state.position, t.position) <= this.ability(t).range + EPSILON : (distance(this.state.position, t.targetPosition) <= this.ability(t).range + EPSILON &&
      this.clearPath(t.targetPosition, this.state.position));
    t.actionSequence += 1;
    if (t.lastActionHit) this.hurt(t.damage, `${definition(t.id).name} — ${this.intention(t)}`, false, t.id);
    else { this.feedback(null, "miss", 0); this.report(`${definition(t.id).name} — ${this.intention(t)} misses you.`, "combat"); }
  }
  private feedback(targetId: string | null, kind: CombatFeedback["kind"], amount: number): void {
    if (kind !== "miss" && amount <= 0) return;
    this.combatFeedback.push({ id: ++this.combatFeedbackId, targetId, kind, amount });
    if (this.combatFeedback.length > 32) this.combatFeedback.shift();
  }
  private hurt(damage: number, source: string, bypassBlock = false, sourceId = source): void {
    const s = this.state;
    const blocked = !bypassBlock && s.guardSeconds > EPSILON ? Math.min(damage, s.block) : 0;
    s.block -= blocked;
    if (s.block === 0) s.guardSeconds = 0;
    const remainder = damage - blocked;
    const taken = Math.min(s.health, remainder === 0 ? 0 : bypassBlock ? remainder : Math.max(1, remainder - this.progression().damageReduction));
    s.health -= taken;
    this.traceEvent("hit", sourceId, this.playerId ?? "solo", s.position, taken, source + " hits for " + taken + ".");
    this.feedback(null, "block", blocked);
    this.feedback(null, "damage", taken);
    this.report(`${source} hits you for ${taken} damage${blocked > 0 ? ` (${blocked} blocked by Brace)` : ""}.`, "combat");
    if (s.health > 0) return;
    this.cancelGather();
    s.maneuver = null; s.block = 0; s.guardSeconds = 0;
    s.phase = "lost"; s.coins = 0; s.cargo = 0; s.carriedRelics = 0; s.carriedSalvage = 0; s.supplies = 0; s.bankedRelics = 0;
    if (!this.shared) for (const enemy of s.world.threats) if (enemy.aggro) this.releaseThreat(enemy);
    this.lootOpenId = null;
    s.bank = { supplies: 0, potions: 0 }; s.potions = 0; this.vendorOpen = null; this.shopOpen = false; this.innOpen = false; this.bankOpen = false; this.moving = false; this.backpedaling = false;
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
  const x = number(p.x, WORLD_BOUNDS.minX, WORLD_BOUNDS.maxX), z = number(p.z, WORLD_BOUNDS.minZ, WORLD_BOUNDS.maxZ);
  const ground = terrainHeight(x, z);
  return { x, y: number(p.y, ground, ground + maximumHeight), z };
}
function readSave(serialized: string, now = Date.now()): State {
  let parsed: unknown;
  try { parsed = JSON.parse(serialized); } catch { throw new Error("Invalid adventure save: unreadable saved data."); }
  const root = record(parsed);
  migrateSpatialLayout(root);
  migrateTerrainLayout(root);
  const version = number(root.version, 1, 11, true), realtime = version >= 10;
  const s = record(root.state);
  if (!Array.isArray(s.threats)) throw new Error("Invalid adventure save: missing threats.");
  const threats: ThreatState[] = s.threats.map(value => {
    const t = record(value), id = choice(t.id, DEFINITIONS.map(d => d.id)), d = definition(id);
    const savedMaximum = t.maximumHealth === undefined ? (id === "cave-crab" ? 156 : d.health) : number(t.maximumHealth, 1);
    const health = id === "ritual-guardian" && t.active === false && s.chapter === undefined ? d.health : Math.min(d.health, number(t.health, 0, Math.max(savedMaximum, d.health)));
    const active = boolean(t.active);
    let phase = choice(t.phase, ["dormant", "patrol", "approach", "preparation", "action", "recovery", "returning", "cleared"] as const);
    if (!active && id === "ritual-guardian" && phase === "patrol" && t.aggro === false) phase = "dormant";
    if ((health === 0) !== (phase === "cleared") || (!active && phase !== "dormant") || (id !== "ritual-guardian" && !active)) throw new Error("Invalid adventure save: inconsistent threat.");
    const aggro = version === 1 ? phase !== "dormant" && phase !== "cleared" : boolean(t.aggro);
    const legacyCombatants = t.combatants === undefined
      ? (aggro && health > 0 ? [...new Set([
        ...(t.targetPlayerId === undefined || t.targetPlayerId === null ? [] : [text(t.targetPlayerId)]),
        ...(t.contributors === undefined ? [] : stringList(t.contributors)),
      ])] : [])
      : stringList(t.combatants);
    const result: ThreatState = {
      ...newThreat(d), id, health, active, phase, aggro,
      cancelledWindow: t.cancelledWindow === undefined ? false : boolean(t.cancelledWindow),
      comboOpened: t.comboOpened === undefined ? false : boolean(t.comboOpened),
      staggered: t.staggered === undefined ? false : boolean(t.staggered),
      swarm: t.swarm === undefined || t.swarm === null ? null : { position: groundPosition(record(t.swarm).position), expiresCycle: number(record(t.swarm).expiresCycle, 0, Number.MAX_SAFE_INTEGER, true) },
      contributors: t.contributors === undefined ? [] : stringList(t.contributors),
      combatants: legacyCombatants,
      rollClaims: t.rollClaims === undefined ? [] : stringList(t.rollClaims),
      shield: t.shield === undefined ? 0 : number(t.shield, 0, 60), shieldSeconds: realtime ? number(t.shieldSeconds, 0, 5) : 0,
      respawnAt: health === 0 ? t.respawnAt === undefined || t.respawnAt === null ? now + WORLD_RESPAWN_MILLISECONDS : number(t.respawnAt) : null,
      joinCycle: t.joinCycle === undefined ? 0 : number(t.joinCycle, 0, Number.MAX_SAFE_INTEGER, true), windowCycle: t.windowCycle === undefined ? 0 : number(t.windowCycle, 0, Number.MAX_SAFE_INTEGER, true), specialOffset: t.specialOffset === undefined ? 0 : number(t.specialOffset, 0, 2), approaching: t.approaching === undefined ? false : boolean(t.approaching),
      rng: t.rng === undefined ? seedForThreat(id) : number(t.rng, 0, 0xffffffff, true),
      castDuration: realtime ? number(t.castDuration, 0, 5) : 0,
      remainingSeconds: realtime ? number(t.remainingSeconds) : 0,
      actionSequence: number(t.actionSequence, 0, Number.MAX_SAFE_INTEGER, true), lastActionHit: boolean(t.lastActionHit),
      damage: number(t.damage, 0, Number.MAX_SAFE_INTEGER, true),
      position: version === 1 ? { ...d.position } : groundPosition(t.position, COMBAT_RULES.wolf.lungeHeight),
      turnTarget: t.turnTarget === undefined ? groundPosition(s.position, 2) : groundPosition(t.turnTarget, 2),
      targetPosition: version === 1 ? { ...d.position } : groundPosition(t.targetPosition, 2),
      targetPlayerId: t.targetPlayerId === undefined || t.targetPlayerId === null ? null : text(t.targetPlayerId),
      lootClaimed: version >= 3 ? boolean(t.lootClaimed) : id === "ritual-guardian" && health === 0,
      patrolIndex: t.patrolIndex === undefined ? 1 : number(t.patrolIndex, 0, d.patrol?.length ?? 1, true), moving: t.moving === undefined ? false : boolean(t.moving),
      abilityIndex: t.abilityIndex === undefined ? 0 : number(t.abilityIndex, 0, 2, true),
      wolf: id === "patrol" ? realtime ? readWolf(t.wolf, true) : newWolf() : null,
      head: id === "scout" ? t.head ? readHead(t.head, realtime) : newHead() : null,
    };
    // Old saves lack the spawn maximum; the crab's original full health was 156.
    // Only an untouched idle spawn may adopt new balance without erasing damage.
    if (savedMaximum !== d.health && health === savedMaximum && !aggro && (phase === "patrol" || phase === "dormant")
      && result.targetPlayerId === null && result.combatants.length === 0 && result.contributors.length === 0 && result.actionSequence === 0) {
      result.health = d.health;
      result.damage = d.behavior === "wolf" ? 18 : d.damage;
    }
    if (!realtime) {
      result.position.y = terrainHeight(result.position.x, result.position.z); result.shield = 0;
      result.phase = health === 0 ? "cleared" : !active ? "dormant" : aggro ? "preparation" : phase === "returning" ? "returning" : d.patrol ? "patrol" : "dormant";
    }
    if (id === "nest" && result.position.x > THICKET[0] && result.position.z >= THICKET[2] && result.position.z <= THICKET[3]) { result.position.x = THICKET[0] - 0.5; result.targetPosition = { ...result.position }; }
    if (result.aggro !== ["approach", "preparation", "action", "recovery"].includes(result.phase)) throw new Error("Invalid adventure save: inconsistent aggression.");
    if (result.lootClaimed && health > 0) throw new Error("Invalid adventure save: living creature already looted.");
    if (root.forestLayout !== 1 && (id === "nest" || id === "patrol") && !aggro && phase === "patrol") {
      // Move idle residents into the new clearings; fights and unclaimed corpses stay put.
      result.position = { ...d.position }; result.targetPosition = { ...d.position }; result.turnTarget = { ...d.position };
      result.patrolIndex = 1; result.moving = false;
      if (result.wolf) result.wolf.attackOrigin = { ...d.position };
    }
    return result;
  });
  if (new Set(threats.map(t => t.id)).size !== threats.length) throw new Error("Invalid adventure save: duplicate threat.");
  for (const d of DEFINITIONS) if (!threats.some(t => t.id === d.id)) {
    if (!d.id.startsWith("cave-")) throw new Error("Invalid adventure save: missing threats.");
    threats.push(newThreat(d));
  }
  const state: State = {
    chapter: readChapter(s.chapter), combat: newCombat(), phase: choice(s.phase, ["town", "expedition", "lost"] as const),
    archetype: choice(s.archetype, ["warrior", "mage", "hunter", "alchemist", "artificer"] as const),
    position: restoreTownPosition(groundPosition(s.position, 2)),
    verticalSpeed: number(s.verticalSpeed, -6, 5.5), health: number(s.health, 0, 100),
    bank: s.bank === undefined ? { supplies: 0, potions: 0 } : { supplies: number(record(s.bank).supplies, 0, Number.MAX_SAFE_INTEGER, true), potions: number(record(s.bank).potions, 0, Number.MAX_SAFE_INTEGER, true) },
    coins: s.coins === undefined ? 0 : number(s.coins, 0, Number.MAX_SAFE_INTEGER, true),
    supplies: number(s.supplies, 0, Number.MAX_SAFE_INTEGER, true), cargo: number(s.cargo, 0, Number.MAX_SAFE_INTEGER, true),
    world: { threats, chestClaimed: s.chestClaimed === undefined ? false : boolean(s.chestClaimed), resourceRemaining: number(s.resourceRemaining, 0, 12, true), resourceRespawns: readResourceRespawns(s.resourceRespawns, number(s.resourceRemaining, 0, 12, true), now), ritualCalled: boolean(s.ritualCalled) },
    potions: number(s.potions, 0, Number.MAX_SAFE_INTEGER, true),
    carriedRelics: number(s.carriedRelics, 0, 1, true), bankedRelics: number(s.bankedRelics, 0, Number.MAX_SAFE_INTEGER, true),
    carriedSalvage: version >= 3 ? number(s.carriedSalvage, 0, Number.MAX_SAFE_INTEGER, true) : 0,
    presence: number(s.presence), actionCooldown: realtime ? number(s.actionCooldown, 0, 5) : 0,
    currentAction: realtime && typeof s.currentAction === "string" && ["hearthstone", "bait", "strike", "brace", "drinkPotion", "gather", "ritual", "equip"].includes(s.currentAction) ? choice(s.currentAction, ["hearthstone", "bait", "strike", "brace", "drinkPotion", "gather", "ritual", "equip"] as const) : null,
    actionDuration: realtime ? number(s.actionDuration, 0, 5) : 0,
    actionRemainingSeconds: realtime ? number(s.actionRemainingSeconds, 0, 5) : 0,
    // Older saves already awarded crystals at cast start.
    gatherPending: realtime && s.currentAction === "gather" && s.gatherPending !== undefined ? boolean(s.gatherPending) : false,
    guardSeconds: number(s.guardSeconds, 0, 5),
    block: version >= 4 ? number(s.block, 0, 28) : number(s.guardSeconds, 0, 3) > 0 ? 5 : 0,
    stamina: version >= 8 ? number(s.stamina, 0, 5, true) : 5,
    staminaRecoverySeconds: realtime ? number(s.staminaRecoverySeconds, 0, COMBAT_RULES.stamina.recoverySeconds) : s.stamina === 5 ? 0 : COMBAT_RULES.stamina.recoverySeconds,
    maneuver: realtime ? readManeuver(s.maneuver) : null,
    sitting: s.sitting === undefined ? false : boolean(s.sitting),
    attackSequence: number(s.attackSequence, 0, Number.MAX_SAFE_INTEGER, true),
    selectedThreat: choice(s.selectedThreat, DEFINITIONS.map(t => t.id)), report: text(s.report),
  };
  if ((state.phase === "lost") !== (state.health === 0) || threats.find(t => t.id === "ritual-guardian")?.active !== state.world.ritualCalled) throw new Error("Invalid adventure save: inconsistent expedition.");
  if ((state.block === 0) !== (state.guardSeconds === 0) || (state.maneuver !== null && state.phase !== "expedition")) throw new Error("Invalid adventure save: inconsistent combat state.");
  const { threats: restoredThreats, resourceRemaining, resourceRespawns, ritualCalled, chestClaimed } = state.world;
  const { world: _world, ...player } = state;
  const storedCombat: Record<string, unknown> | undefined = version < 11 || s.combat === undefined ? undefined : record(s.combat) as Record<string, unknown>;
  const combatValue: Record<string, unknown> | undefined = storedCombat ? (storedCombat.clock === undefined ? storedCombat : record(storedCombat.clock) as Record<string, unknown>) : undefined;
  const clock = combatValue ? readClock(combatValue) : newClock();
  const rawCombat = storedCombat;
  const savedQueue = rawCombat && Array.isArray(rawCombat.queued) ? rawCombat.queued.map(record) : [];
  const legacyPlan = savedQueue.some(e => e.timing === undefined);
  if (legacyPlan && player.maneuver?.kind === "bait") player.maneuver.remainingSeconds *= COMBAT_TURN.moveDuration / .45;
  const queued: QueueEntry[] = [];
  for (const e of savedQueue) {
    if (e.action !== "bait" && e.action !== "strike" && e.action !== "brace") continue;
    if (legacyPlan && queued.some(existing => (existing.action === "bait") === (e.action === "bait"))) continue;
    const action = e.action;
    const timing = action === "bait" ? null : e.timing === undefined ? "after" : choice(e.timing, ["before", "during", "after"] as const);
    if (action === "strike" && timing === "during") throw new Error("Invalid adventure save: Attack cannot occur during movement.");
    queued.push({ id: number(e.id,1,Number.MAX_SAFE_INTEGER,true), action, targetId: e.targetId === null ? null : text(e.targetId), destination: e.destination === undefined || e.destination === null ? null : groundPosition(e.destination), timing, offsetSeconds: number(e.offsetSeconds,0,2), cost: classAction(player.archetype, action).cost ?? 0, status: choice(e.status,["pending","executed","failed"] as const), reason: e.reason === null ? null : text(e.reason) });
  }
  if (queued.some(e => e.action === "bait" && e.destination === null || e.action !== "bait" && e.destination !== null) || queued.filter(e => e.action === "bait").length > 1 || queued.filter(e => e.action !== "bait").length > 1 || new Set(queued.map(e => e.id)).size !== queued.length) throw new Error("Invalid adventure save: invalid combat plan.");
  const movement = queued.some(e => e.action === "bait");
  for (const entry of queued) entry.offsetSeconds = entry.action === "bait" ? COMBAT_TURN.moveStart : actionTimingOffset(entry.timing!, movement);
  return { ...player, combat: { clock, queued, ready: legacyPlan || rawCombat?.ready === undefined ? false : boolean(rawCombat.ready), nextId: rawCombat ? number(rawCombat.nextId, 1, Number.MAX_SAFE_INTEGER, true) : 1 }, world: { threats: restoredThreats, resourceRemaining, resourceRespawns, ritualCalled, chestClaimed } };
}

function readClock(value: unknown): CombatClock {
  const c = record(value);
  return { gatheringRemainingSeconds: c.gatheringRemainingSeconds === undefined ? 0 : number(c.gatheringRemainingSeconds, 0, COMBAT_RULES.window.gathering), pendingSeconds: c.pendingSeconds === undefined ? 0 : number(c.pendingSeconds, 0, 1 / 60), phase: choice(c.phase, ["idle", "active", "choosing", "preparation"] as const), elapsedSeconds: number(c.elapsedSeconds), cycle: number(c.cycle, 0, Number.MAX_SAFE_INTEGER, true) };
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
  const m = record(value);
  if (m.kind !== "lunge" && m.kind !== "bait") return null;
  const kind = m.kind, f = record(m.facing);
  return { kind, targetId: choice(m.targetId, DEFINITIONS.map(t => t.id)),
    start: groundPosition(m.start, 2), destination: groundPosition(m.destination),
    facing: { x: number(f.x, -1, 1), y: number(f.y, 0, 0), z: number(f.z, -1, 1) },
    remainingSeconds: number(m.remainingSeconds, 0, kind === "bait" ? COMBAT_RULES.bait.duration : COMBAT_RULES.strike.duration) };
}

export function createAdventure(options: AdventureOptions = {}): AdventureGame {
  return new Adventure(options);
}

export function createSharedAdventure(options: Pick<AdventureOptions, "save" | "now"> = {}): SharedAdventure {
  return Adventure.sharedAdventure(options);
}

function readHead(value: unknown, realtime: boolean): HeadState {
  const h = record(value), fresh = newHead();
  if (!realtime) return { ...fresh, opened: h.opened === undefined ? false : boolean(h.opened), volley: number(h.volley, 1, Number.MAX_SAFE_INTEGER, true) };
  if (!Array.isArray(h.fireballs)) throw new Error("Invalid adventure save: missing fireballs.");
  const volley = number(h.volley, 1, Number.MAX_SAFE_INTEGER, true), castVolley = number(h.castVolley, 1, volley, true);
  return { opened: boolean(h.opened), ability: choice(h.ability, ["ember-beam", "fireball", "ember-ward", "kindle"] as const), volley, castVolley,
    block: number(h.block, 0, 6), blockSeconds: number(h.blockSeconds, 0, 2), projectileSequence: number(h.projectileSequence, 0, Number.MAX_SAFE_INTEGER, true),
    pendingFireballs: number(h.pendingFireballs, 0, castVolley, true), nextFireballSeconds: number(h.nextFireballSeconds, -1, COMBAT_RULES.head.fireballSpacing),
    fireballs: h.fireballs.map(value => { const p = record(value); return { id: number(p.id, 1, Number.MAX_SAFE_INTEGER, true), origin: groundPosition(p.origin), position: p.position === undefined ? groundPosition(p.origin) : groundPosition(p.position), remainingSeconds: number(p.remainingSeconds, 0, COMBAT_RULES.head.fireballTravel), duration: number(p.duration, COMBAT_RULES.head.fireballTravel, COMBAT_RULES.head.fireballTravel), damage: number(p.damage, COMBAT_RULES.head.fireballDamage, COMBAT_RULES.head.fireballDamage) }; }),
  };
}

function foremanAbility(index: number, damage: number): ThreatAbilityView {
  if (index === 2) return { id: "foreman-shield", name: "Safety Shield", description: "Raises 60 Block for the rest of the turn. Attack before the shield rises.", damage: 0, range: 0, noticeSeconds: 0 };
  if (index === 0) return { id: "foreman-pulse", name: "Roll-call Pulse", description: "Pulses within 22 metres. Cannot be dodged or stopped by cover. Defend before the pulse.", damage, range: 22, noticeSeconds: .35 };
  return { id: "foreman-press", name: "Final Press", description: "Strikes the marked ground. Move away or Defend before impact.", damage, range: 3.5, noticeSeconds: .35 };
}
function headAbility(id: HeadAbilityId, volley: number): ThreatAbilityView {
  if (id === "ember-beam") return { id, name: "Ember Beam", description: "Deals 8 damage during the turn within 10 metres. Defend before impact, or plan a move behind cover or out of reach before it fires.", damage: COMBAT_RULES.head.beamDamage, range: 10, noticeSeconds: 0 };
  if (id === "ember-ward") return { id, name: "Ember Ward", description: "Raises 6 Block for 2 seconds during the turn. Attack before the shield rises or recover while it holds.", damage: 0, range: 10, noticeSeconds: 0 };
  if (id === "kindle") return { id, name: "Kindle", description: "Adds one fireball to every later volley during the turn. Use the opening to attack.", damage: 0, range: 0, noticeSeconds: 0 };
  return { id, name: "Fireball ×" + volley, description: "Launches " + volley + " homing fireballs for 18 damage each during the turn. Travel time is 0.9 seconds; launches are 0.2 seconds apart. Plan Block for impact. Cover or leaving 10-metre reach prevents damage. Fired shots survive interruption; enemies in their path intercept them. Fire ignites spilled swarms for 36 damage within 3 metres, including you.", damage: COMBAT_RULES.head.fireballDamage * volley, range: 10, noticeSeconds: .9 };
}
function maulAbility(damage = 18): ThreatAbilityView {
  return { id: "maul", name: "Lunging Maul", description: "Leaps up to 8 metres during the turn, landing 0.65 seconds later in a 2-metre area. Bait its leap through another enemy: the collision damages and staggers both, interrupting their attacks. Each Maul gains 2 damage, up to 36.", damage, range: COMBAT_RULES.wolf.impactRadius, noticeSeconds: .65 };
}
function salvageQuantity(id: string): number { return id === "cave-crab" ? 6 : id === "cave-bat" ? 3 : 1; }
function ordinaryAbility(d: ThreatDefinition, damage = d.damage): ThreatAbilityView {
  if (d.id === "cave-bat") return { id: "echo-bite", name: d.intention, description: "Closes to 2.2 metres, then bites 0.3 seconds after winding up. Block at impact or retreat before the bite. Its next bite grows stronger.", damage, range: d.reach, noticeSeconds: .3 };
  if (d.id === "cave-crab") return { id: "cavern-slam", name: d.intention, description: "Raises both claws and slams the marked 4.5-metre area 1.1 seconds after winding up. Retreat out of the ring or Block; one Block may not absorb the whole slam. Its next slam grows stronger.", damage, range: d.reach, noticeSeconds: 1.1 };
  if (d.id === "nest") return { id: d.id, name: d.intention, description: "Swarm hits within 3 metres, 0.35 seconds after winding up. Collisions interrupt it and spill a cloud. Bait a hound through the bee or Move to lure enemies together. Watchman fireballs ignite the cloud; stay clear or Block.", damage, range: d.reach, noticeSeconds: .35 };
  return { id: d.id, name: d.intention, description: d.preparation + ". Approaches during its windup, then strikes the marked area after 0.35 seconds. Plan a retreat or Block. Each attack raises its next damage by 15% of base damage, up to double.", damage, range: d.reach, noticeSeconds: .35 };
}
export function getMonsterLore(): readonly MonsterLoreEntry[] {
  return DEFINITIONS.map(d => {
    if (d.id.startsWith("cave-")) return {
      id: d.id, name: d.name, health: d.health, disposition: d.disposition,
      description: d.id === "cave-bat" ? "A swift winged hunter in Hollowdeep’s first chamber. Its narrow bite is quick, and it pursues fleeing explorers." : "A heavy-shelled predator in Hollowdeep’s deepest chamber. It closes quickly before raising its claws for a crushing slam.",
      opener: d.preparation + ". Its attack is announced before you plan.", abilities: [ordinaryAbility(d)],
      sequences: [{ name: d.intention, abilityIds: [ordinaryAbility(d).id], offsetsSeconds: [], description: "One committed attack per sequence. Damage increases as the fight continues." }],
      strategy: d.id === "cave-bat" ? "Defend against its bite, then attack next turn. Take potions and return with its salvage." : "Use the long windup to retreat clear of the slam. Strike from the edge of melee reach. The western tunnel leads home.",
    };
    if (d.behavior === "head") return {
      id: d.id, name: d.name, health: d.health, disposition: d.disposition,
      description: "A floating fire spirit wandering around the first clearing. Notices you within 6 metres and pursues within 14 metres of home.",
      opener: "Ember Beam opens the turn. Defend before impact.",
      abilities: [headAbility("ember-beam",1), headAbility("fireball",1), headAbility("ember-ward",1), headAbility("kindle",1)],
      sequences: [
        { name: "Fireball", abilityIds: ["fireball"], offsetsSeconds: [], description: "Its usual attack, always following Kindle. Prefers attacking a wounded opponent to shielding." },
        { name: "Ember Ward", abilityIds: ["ember-ward"], offsetsSeconds: [], description: "Shields when below half health, if you have stamina and are close enough to strike. Never shields twice in a row." },
        { name: "Kindle", abilityIds: ["kindle"], offsetsSeconds: [], description: "Powers up after every third action, when out of reach, or when your block can absorb its volley. Never powers up twice in a row." },
      ], strategy: "Lure its fireballs through other enemies or a spilled swarm. Burning swarms hurt you too: move clear or plan Block. Attack during Kindle.",
    };
    if (d.behavior === "wolf") return {
      id: d.id, name: d.name, health: d.health, disposition: d.disposition,
      description: "Patrols the western trail. Runs toward you beyond 5.5 metres, then circles at about 4.5 metres. Nearby hostile allies answer its call.",
      opener: "Announces its first leap before you plan.", abilities: [maulAbility()],
      sequences: [{ name: "Repeated Maul", abilityIds: ["maul"], offsetsSeconds: [], description: "One committed leap per sequence, with a new choice before the next plan." }],
      strategy: "Bait Maul through the bee to cancel its swarm, then Attack the staggered hound. Block protects you if the burning swarm reaches your position.",
    };
    if (d.id === "ritual-guardian") return {
      id: d.id, name: d.name, health: d.health, disposition: d.disposition,
      description: "The last foreman of the Ninth Bell Engine. Six coolant crystals wake it. Search its remains for the Last Shift Roll.",
      opener: "Announces Roll-call Pulse before your planning window.", abilities: [foremanAbility(0,24),foremanAbility(1,48),foremanAbility(2,0)],
      sequences: [{ name: "The final shift", abilityIds: ["foreman-pulse","foreman-press","foreman-shield"], offsetsSeconds: [], description: "Pulse, Press, Shield across successive turns. Defend against Pulse, retreat from Press, and attack before Shield." }],
      strategy: "Bring your coat, weapon and potions. Plan Block for Pulse, a retreat for Press, and healing while Shield is raised.",
    };
    return { id:d.id, name:d.name, health:d.health, disposition:d.disposition,
      description: d.id === "nest" ? "A neutral bee in the eastern flower glade. Attacking enrages it into a fast pursuit within 18 metres of home. Collisions spill its swarm; Watchman fireballs ignite the cloud." : "Guards the coolant crystals. Its living thorns deal 8 damage whenever you gather; defeating it removes the hazard.",
      opener: "Announces its first attack before you plan.",
      abilities: [ordinaryAbility(d), ...(d.id === "warder" ? [{ id: "harvest-thorns", name: "Gathering thorns", description: "Gathering while the Cablekeeper lives deals 8 damage. Block absorbs it.", damage: 8, range: 0, noticeSeconds: 0 }] : [])],
      sequences: [{ name: d.intention, abilityIds:[d.id], offsetsSeconds:[], description:"Commits one attack per turn, then chooses again before the next plan." }],
      strategy: d.id === "nest" ? "Make a hound collide with the bee to interrupt Swarm. The spilled cloud lasts through the next sequence; Watchman fireballs ignite it for 36 damage within 3 metres. Move clear or Block the blast." : "Plan a retreat or Block before its attack.",
    };
  });
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
  const ownedGear = stringList(c.ownedGear).map(id => choice(id, Object.keys(GEAR) as GearItemId[]));
  const slots = Object.fromEntries((["chest", "mainhand", "offhand"] as const).map(slot => {
    const item = equipment[slot] == null ? null : choice(equipment[slot], Object.keys(GEAR) as GearItemId[]);
    if (item && GEAR[item].slot !== slot) throw new Error("Invalid adventure save: wrong gear slot.");
    return [slot, item];
  })) as ChapterState["equipment"];
  const oldLevel = number(c.level, 1, 10_000_000, true);
  const experience = Math.max(experienceForLevel(oldLevel), c.experience === undefined ? 0 : number(c.experience, 0, Number.MAX_SAFE_INTEGER, true));
  if (completed.some(id => !accepted.includes(id)) || Object.values(slots).some(id => id && !ownedGear.includes(id))) throw new Error("Invalid adventure save: inconsistent chapter.");
  return { accepted, completed, scoutDefeated: boolean(c.scoutDefeated), level: levelForExperience(experience), experience, ownedGear, equipment: slots };
}
