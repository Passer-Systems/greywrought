import { moveLocomotion, moveManeuverPosition, startJump, blockedPosition, MOVEMENT_BARRIERS, THICKET, type Barrier, type MovementFrame, type MovementCheckpoint } from "./movement.js";
import type { CharacterArchetype } from "../host/character-profile.js";
import { YARD, QUESTS, GEAR, gearName, type QuestId, type QuestOperation, type QuestView, type ProgressionView, type GearSlot, type GearItemId } from "./yard-content.js";
import type {
  AdventureAction, AdventureGame, AdventureOptions, AdventureSnapshot, AdventureLogEntry, SharedAdventure, CombatFeedback,
  CorpseLootView, PlaceView, Position, ThreatPhase, ThreatView, ThreatAbilityView, MonsterLoreEntry, ThreatForecastEntry, CombatAction, CombatMove, EncounterSession,
} from "./adventure-types.js";
import { classAction, classKit } from "./class-kit.js";

type Vector = { x: number; y: number; z: number };
type Phase = AdventureSnapshot["phase"];
export const COMBAT_RULES = {
  actionCooldown: 1.5,
  autoAttackSeconds: 1.5,
  stamina: { maximum: 5, recoverySeconds: 1.5 },
  bloodRage: { cost: 1, maximum: 3, damagePerStack: 4, drainPerStack: 1, drainSeconds: 5, decaySeconds: 2, recovery: 2 },
  strike: { damage: 9, range: 2, rangedRange: 10, stopDistance: 1.5, duration: 0.25, cost: 0 },
  disengage: { damage: 6, range: 3.5, distance: 5, duration: 0.8, cost: 1 },
  brace: { block: 24, duration: 2, cost: 2 },
  jab: { damage: 3, range: 2, cost: 0 },
  guard: { block: 2, duration: 1, cost: 0 },
  drinkPotion: { cost: 1, recovery: 1 },
  enemy: { preparation: 3, action: 0.65, recovery: 2 },
  head: { beamDamage: 8, fireballDamage: 18, fireballTravel: 0.9, fireballSpacing: 0.2, warning: 3, ward: 6, wardDuration: 2, kindleDuration: 5 },
  wolf: { circleRange: 5.5, circleRadius: 4.5, circleSpeed: 1.5, lungeDistance: 8, lungeHeight: 0.9, impactRadius: 2 },
} as const;
export const MARA_TRADE_RULES = { suppliesPerPotion: 3, suppliesPerPotionSold: 2 } as const;
export const WORLD_RESPAWN_MILLISECONDS = 120_000;
const CALL_FOR_HELP_RANGE = 9;
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
interface HeadState {
  opened: boolean; ability: HeadAbilityId; castVolley: number;
  block: number; blockSeconds: number;
  volley: number; projectileSequence: number; pendingFireballs: number; nextFireballSeconds: number;
  fireballs: { id: number; origin: Vector; remainingSeconds: number; duration: number; damage: number }[];
}
interface ThreatDefinition {
  id: string; name: string; level: number; position: Position; health: number; behavior?: "wolf" | "head";
  preparation: string; intention: string; damage: number; reach: number; benefit: string;
  disposition: ThreatView["disposition"]; aggroRange: number; leash: number; speed: number; pursuitSpeed?: number; patrol?: readonly Position[];
}
interface ThreatState {
  id: string; health: number; active: boolean; phase: ThreatPhase;
  contributors: string[]; combatants: string[]; rollClaims: string[]; shield: number;
  respawnAt: number | null;
  rng: number;
  castDuration: number; shieldSeconds: number;
  remainingSeconds: number; actionSequence: number; lastActionHit: boolean; damage: number;
  position: Vector; targetPosition: Vector; targetPlayerId: string | null; aggro: boolean; lootClaimed: boolean;
  patrolIndex: number; moving: boolean; abilityIndex: number;
  wolf: WolfState | null; head: HeadState | null;
}
interface WorldState {
  threats: ThreatState[]; resourceRemaining: number; ritualCalled: boolean;
  resourceRespawns: { at: number; quantity: number }[];
}
interface SharedContext {
  world: WorldState;
  now: () => number;
  online: Map<string, Adventure>;
  characters: Map<string, Adventure>;
  readonly id: string;
  mode: "shared" | "paused" | "private";
  readonly origin: Vector | null;
}
interface ChapterState {
  accepted: QuestId[]; completed: QuestId[]; scoutDefeated: boolean;
  level: number; ownedGear: GearItemId[]; equipment: Record<GearSlot, GearItemId | null>;
}
const newChapter = (): ChapterState => ({ accepted: [], completed: [], scoutDefeated: false, level: 1, ownedGear: [], equipment: { chest: null, mainhand: null } });
interface State {
  chapter: ChapterState;
  world: WorldState;
  phase: Phase; archetype: CharacterArchetype; position: Vector; verticalSpeed: number;
  health: number; supplies: number; cargo: number;
  potions: number; carriedRelics: number; bankedRelics: number; presence: number; carriedSalvage: number;
  actionCooldown: number; currentAction: AdventureAction | "equip" | null; actionDuration: number; actionRemainingSeconds: number; guardSeconds: number;
  block: number; stamina: number; staminaRecoverySeconds: number; bloodRage: number; rageDrainSeconds: number; rageDecaySeconds: number; maneuver: Maneuver | null;
  attackSequence: number; selectedThreat: string; report: string;
}

type SavedState = Omit<State, "world"> & WorldState;
function savedState(state: State): SavedState {
  const { world, ...player } = state;
  return { ...player, ...world };
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
const newHead = (): HeadState => ({ opened: false, ability: "ember-beam", castVolley: 1, block: 0, blockSeconds: 0, volley: 1, projectileSequence: 0, pendingFireballs: 0, nextFireballSeconds: 0, fireballs: [] });
const newThreat = (t: ThreatDefinition): ThreatState => ({
  id: t.id, health: t.health, active: t.id !== "ritual-guardian", phase: t.patrol && t.id !== "ritual-guardian" ? "patrol" : "dormant",
  contributors: [], combatants: [], rollClaims: [], shield: 0,
  respawnAt: null,
  rng: crypto.getRandomValues(new Uint32Array(1))[0]!,
  castDuration: 0, shieldSeconds: 0,
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
    bankedRelics: 0, carriedSalvage: 0, presence: 0, actionCooldown: 0, currentAction: null, actionDuration: 0, actionRemainingSeconds: 0,
    guardSeconds: 0, block: 0, stamina: 5, staminaRecoverySeconds: 0, bloodRage: 0, rageDrainSeconds: 0, rageDecaySeconds: 0, maneuver: null,
    attackSequence: 0, selectedThreat: "scout",
    report: "Visit Mara for potions, then take the north gate. Gather coolant crystals and return alive.",
    world: { threats: newThreats(), resourceRemaining: 12, resourceRespawns: [], ritualCalled: false },
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
    if (this.instancePaused()) return false;
    if (!this.movementFrames) this.enableNetworkMovement();
    if (this.movementFrames!.reduce((sum, frame) => sum + frame.seconds, 0) + frames.reduce((sum, frame) => sum + frame.seconds, 0) > 2) return false;
    for (const frame of frames) if (frame.sequence > (this.movementFrames!.at(-1)?.sequence ?? this.movementSequence)) this.movementFrames!.push(frame);
    return true;
  }
  private cameraForward = point(0, 1);
  private moving = false;
  private backpedaling = false;
  private autoAttacking = false;
  private autoAttackRemainingSeconds = 0;
  private shopOpen = false;
  private trade: { kind: "supplies" | "potions"; quantity: number } | null = null;
  private innOpen = false;
  private readonly events: AdventureLogEntry[] = [];
  private eventId = 0;
  private readonly combatFeedback: CombatFeedback[] = [];
  private combatFeedbackId = 0;
  private lootOpenId: string | null = null;

  static sharedAdventure(options: Pick<AdventureOptions, "save" | "now">): SharedAdventure {
    const context: SharedContext = { world: initialState("warrior").world, now: options.now ?? Date.now, online: new Map(), characters: new Map(), id: "shared", mode: "shared", origin: null };
    const sessions = new Map<string, SharedContext>();
    const characters = new Map<string, { name: string; game: Adventure }>();
    if (options.save !== undefined) {
      const root = record(JSON.parse(options.save));
      if ((root.version !== 1 && root.version !== 2 && root.version !== 3) || root.kind !== "shared-adventure" || !Array.isArray(root.characters)) throw new Error("Unsupported shared adventure save.");
      const world = record(root.world), version = root.version === 1 ? 9 : 10;
      const template = savedState(initialState("warrior"));
      context.world = readSave(JSON.stringify({ version, state: { ...template, ...world, phase: "expedition" } }), context.now()).world;
      const instances = new Map<string, { id: string; origin: Vector; world: WorldState }>();
      if (root.version === 3) {
        if (!Array.isArray(root.instances)) throw new Error("Missing saved private encounters.");
        for (const value of root.instances) {
          const entry = record(value), ownerId = text(entry.ownerId), id = text(entry.id);
          if (!id.startsWith('private:') || instances.has(ownerId) || [...instances.values()].some(instance => instance.id === id)) throw new Error("Invalid private encounter identity.");
          instances.set(ownerId, { id, origin: groundPosition(entry.origin), world: readSave(JSON.stringify({ version: 10, state: { ...template, ...record(entry.world), phase: 'expedition' } }), context.now()).world });
        }
      }
      for (const value of root.characters) {
        const entry = record(value), id = text(entry.id), name = text(entry.name), state = record(entry.state);
        if (!id || characters.has(id)) throw new Error("Invalid shared character identity.");
        const instance = instances.get(id);
        const ownContext: SharedContext = instance
          ? { world: instance.world, now: context.now, online: new Map(), characters: new Map(), id: instance.id, mode: 'paused', origin: instance.origin }
          : context;
        const game = new Adventure({}, ownContext, id);
        game.state = readSave(JSON.stringify({ version, state: { ...state, ...ownContext.world } }), context.now());
        game.state.world = ownContext.world;
        characters.set(id, { name, game });
        ownContext.characters.set(id, game);
        if (instance) sessions.set(id, ownContext);
      }
      if ([...instances.keys()].some(id => !characters.has(id))) throw new Error("Missing private encounter character.");
    }
    const refresh = () => {
      refreshWorld(context.world, context.now());
      for (const { game } of characters.values()) game.closeMissingLoot();
    };
    refresh();
    const clearInputs = (game: Adventure) => {
      game.held.clear(); game.mouseForward = false; game.moving = false; game.backpedaling = false; game.stopAutoAttack();
      game.enableNetworkMovement(false); game.shopOpen = false; game.innOpen = false; game.trade = null; game.lootOpenId = null;
    };
    const createPrivate = (id: string, game: Adventure): SharedContext => {
      const clone = structuredClone(game.state.world);
      for (const t of clone.threats) {
        if (t.aggro && (t.targetPlayerId === id || t.combatants.includes(id) || t.contributors.includes(id))) {
          t.targetPlayerId = id;
          t.combatants = [id];
          continue;
        }
        t.targetPlayerId = null;
        if (!t.aggro) continue;
        t.aggro = false; t.castDuration = 0; t.remainingSeconds = 0; t.moving = false;
        t.phase = !t.active ? 'dormant' : t.health === 0 ? 'cleared' : 'returning';
        if (t.head) { t.head.fireballs = []; t.head.pendingFireballs = 0; t.head.nextFireballSeconds = 0; }
        if (t.wolf) { t.wolf.motion = null; t.wolf.circling = false; t.position.y = 0; }
      }
      const privateContext: SharedContext = { world: clone, now: context.now, online: new Map(), characters: new Map(), id: `private:${crypto.randomUUID()}`, mode: "paused", origin: { x: game.state.position.x, y: 0, z: game.state.position.z } };
      privateContext.characters.set(id, game); sessions.set(id, privateContext);
      return privateContext;
    };
    const pause = (id: string): boolean => {
      const existing = sessions.get(id);
      if (existing) {
        const existingGame = existing.characters.get(id);
        if (!existingGame) return false;
        clearInputs(existingGame);
        existing.online.delete(id); existing.mode = "paused";
        return true;
      }
      const game = context.online.get(id);
      if (!game || game.shared?.id !== "shared") return false;
      const privateContext = createPrivate(id, game);
      for (const threat of context.world.threats) {
        threat.contributors = threat.contributors.filter(contributor => contributor !== id);
        threat.combatants = threat.combatants.filter(combatant => combatant !== id);
        // Detach before publishing the fork, even when no shared tick will run.
        if (threat.targetPlayerId === id) threat.targetPlayerId = null;
        if (threat.aggro && threat.combatants.length > 0 && threat.targetPlayerId === null) {
          const replacement = threat.combatants.find(combatant => context.online.has(combatant));
          if (replacement !== undefined) {
            threat.targetPlayerId = replacement;
            const replacementGame = context.online.get(replacement);
            if (replacementGame) threat.targetPosition = { ...replacementGame.state.position };
          }
        }
        if (threat.aggro && threat.combatants.length === 0) {
          game.releaseThreat(threat);
          // Empty zones do not tick; complete the unobserved reset before saving.
          if (context.online.size === 1 && threat.phase === "returning") {
            threat.position = { ...definition(threat.id).position };
            threat.targetPosition = { ...threat.position };
            threat.patrolIndex = 1;
            threat.phase = definition(threat.id).patrol ? "patrol" : "dormant";
          }
        }
      }
      game.shared = privateContext;
      game.state.world = privateContext.world;
      clearInputs(game); context.online.delete(id); context.characters.delete(id); privateContext.mode = "paused";
      return true;
    };
    const resume = (id: string): boolean => {
      const privateContext = sessions.get(id);
      const game = privateContext?.characters.get(id);
      if (!privateContext || !game || privateContext.mode !== "paused" || game.state.health <= 0) return false;
      privateContext.mode = "private"; privateContext.online.set(id, game); clearInputs(game); return true;
    };
    const rejoin = (id: string): boolean => {
      const privateContext = sessions.get(id), game = privateContext?.characters.get(id);
      if (!privateContext || !game || (privateContext.mode !== "private" && privateContext.mode !== "paused") || game.state.health <= 0 || game.inCombat()) return false;
      const origin = privateContext.origin ?? game.state.position;
      game.shared = context; game.state.world = context.world;
      const destination = { x: origin.x, y: 0, z: origin.z };
      if (!game.blocked(destination.x, destination.z)) game.state.position = destination;
      game.state.verticalSpeed = 0; game.state.maneuver = null;
      if (game.state.position.z <= 0) game.state.phase = 'town';
      else if (game.state.position.z >= 2) game.state.phase = 'expedition';
      clearInputs(game); sessions.delete(id); context.characters.set(id, game); context.online.set(id, game); return true;
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
      let remaining = seconds;
      while (remaining > EPSILON) {
        const dt = Math.min(remaining, 1 / 60);
        for (const player of players) player.stepPlayer(dt);
        for (const t of ctx.world.threats) {
          t.moving = false; const target = driver.chooseTarget(t);
          if (t.aggro && target && t.targetPlayerId !== target.playerId) {
            // A departing player does not rewind the creature's current cast or
            // ramp. The replacement target inherits the live encounter beat.
            t.targetPlayerId = target.playerId;
            if (target.playerId !== null && !t.combatants.includes(target.playerId)) t.combatants.push(target.playerId);
            t.targetPosition = { ...target.state.position };
          }
          if (t.aggro && target?.playerId !== null && target?.playerId !== undefined && !t.combatants.includes(target.playerId)) t.combatants.push(target.playerId);
          if (t.aggro && !target) driver.releaseThreat(t); else (target ?? driver).acquireOrRelease(t, dt);
        }
        for (const player of players) player.stepAutoAttack(dt);
        for (const t of ctx.world.threats) {
          const target = driver.targetPlayer(t);
          if (t.aggro && t.active && t.health > 0 && target) target.advanceThreat(t, dt); else if (t.aggro && !target) driver.releaseThreat(t);
        }
        remaining -= dt;
      }
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
        if (privateContext) { entry.game.shared = privateContext; entry.game.state.world = privateContext.world; }
        else context.online.set(id, entry.game);
        return entry.game;
      },
      leave(id) {
        const privateContext = sessions.get(id);
        if (privateContext) {
          const game = privateContext.characters.get(id);
          if (game) clearInputs(game);
          privateContext.online.delete(id); privateContext.mode = "paused";
          return;
        }
        if (!pause(id)) { const game = context.online.get(id); if (game) clearInputs(game); context.online.delete(id); }
      },
      pause, resume, rejoin, session,
      getPlayer(id) { return context.online.get(id) ?? sessions.get(id)?.characters.get(id); },
      players(instanceId?: string) {
        const ctx = instanceId && instanceId !== "shared" ? [...sessions.values()].find(instance => instance.id === instanceId) : context;
        return [...(ctx?.online ?? new Map())].map(([id, game]) => ({ id, name: characters.get(id)!.name, player: game.snapshot.player }));
      },
      advance(seconds) {
        if (!Number.isFinite(seconds) || seconds < 0) throw new Error("Elapsed time must be finite and nonnegative.");
        refresh();
        stepContext(context, seconds);
        for (const privateContext of sessions.values()) stepContext(privateContext, seconds);
      },
      save() {
        refresh();
        return JSON.stringify({ version: 3, kind: "shared-adventure", world: context.world,
          characters: [...characters].map(([id, { name, game }]) => {
            const { world, ...player } = game.state;
            return { id, name, state: player };
          }),
          instances: [...sessions].map(([ownerId, instance]) => ({ id: instance.id, ownerId, origin: instance.origin, mode: instance.mode, world: instance.world })) });
      },
    };
  }

  private readonly now: () => number;
  constructor(options: AdventureOptions, private shared?: SharedContext, private readonly playerId: string | null = null) {
    this.now = shared?.now ?? options.now ?? Date.now;
    this.state = options.save === undefined ? initialState(options.archetype ?? "warrior") : readSave(options.save, this.now());
    if (shared) { this.state.world = shared.world; }
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
    return { id: c.id, mode: c.mode, canRejoin: (c.mode === "paused" || c.mode === "private") && this.state.health > 0 && !this.inCombat(), origin: c.origin ? { ...c.origin } : null };
  }

  get snapshot(): AdventureSnapshot {
    const s = this.state;
    return {
      quests: this.questViews(), progression: this.progression(),
      combatFeedback: this.combatFeedback.map(entry => ({ ...entry })),
      phase: s.phase, combat: { autoAttack: this.autoAttacking, autoAttackRemainingSeconds: this.autoAttackRemainingSeconds, globalCooldown: s.actionCooldown, globalCooldownDuration: COMBAT_RULES.actionCooldown },
      player: {
        position: { ...s.position }, cameraForward: { ...this.cameraForward }, archetype: s.archetype,
        health: s.health, maximumHealth: 100, grounded: s.position.y === 0,
        moving: this.moving, backpedaling: this.backpedaling, attackSequence: s.attackSequence,
        actionCooldown: s.actionCooldown, currentAction: s.currentAction, actionDuration: s.actionDuration, guardSeconds: s.guardSeconds,
        block: s.block, stamina: s.stamina, maximumStamina: COMBAT_RULES.stamina.maximum, staminaRecoverySeconds: s.staminaRecoverySeconds,
        bloodRage: s.bloodRage, rageDrainSeconds: s.rageDrainSeconds, rageDecaySeconds: s.rageDecaySeconds, inCombat: this.inCombat(), maneuver: s.maneuver?.kind ?? "none",
        maneuverSeconds: s.maneuver?.remainingSeconds ?? 0, facing: { ...(s.maneuver?.facing ?? this.cameraForward) },
      },
      threats: s.world.threats.map((t): ThreatView => {
        const d = definition(t.id);
        return {
          ...t, name: d.name, level: d.level, position: { ...t.position }, homePosition: { ...d.position },
          disposition: d.disposition, moving: s.phase !== "lost" && t.moving, maximumHealth: d.health,
          aggroRange: d.aggroRange, callForHelpRange: CALL_FOR_HELP_RANGE,
          movementMode: this.movementMode(t), motionProgress: t.wolf?.motion ? 1 - t.wolf.motion.remainingSeconds / t.wolf.motion.duration : 0,
          facing: { ...(t.wolf?.facing ?? this.direction(t.position, t.aggro ? (this.targetPlayer(t)?.state.position ?? s.position) : t.targetPosition)) },
          nextAttackSeconds: t.wolf?.nextAttackSeconds ?? t.remainingSeconds,
          attackOrigin: { ...(t.wolf && t.phase === "action" && t.abilityIndex === 1 ? t.wolf.attackOrigin : t.position), y: 0 },
          block: t.head?.block ?? t.shield, blockSeconds: t.head?.blockSeconds ?? t.shieldSeconds, volley: t.head?.volley ?? 0, fireballs: t.head?.fireballs.map(p => ({ ...p, origin: { ...p.origin } })) ?? [],
          rootedSeconds: this.rootedSeconds(t), canStrike: this.canUseAttack(t, "strike"), canDisengage: this.canUseAttack(t, "disengage"), cast: this.castView(t),
          selected: t.id === s.selectedThreat, phaseDuration: this.phaseDuration(t),
          preparation: d.preparation,
          currentActivity: this.currentActivity(t), currentAbility: this.ability(t),
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

  save(): string { return JSON.stringify({ version: 10, state: savedState(this.state) }); }
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
    if (this.instancePaused() || this.inPrivateInstance()) { this.report("Services are available only in the shared world."); return; }
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
    c.completed.push(id); c.level = Math.max(c.level, q.reward.level);
    s.potions += q.reward.potions; s.supplies += q.reward.supplies;
    if (q.reward.gear && !c.ownedGear.includes(q.reward.gear)) c.ownedGear.push(q.reward.gear);
    this.report(q.completion);
  }
  equip(slot: GearSlot, item: GearItemId | null): void {
    const s = this.state;
    if (this.instancePaused()) return;
    if (s.phase === "lost" || !(slot === "chest" || slot === "mainhand")) return;
    if (item !== null && (!Object.hasOwn(GEAR, item) || !s.chapter.ownedGear.includes(item) || GEAR[item].slot !== slot)) return;
    if (this.inCombat()) {
      if (!this.ready()) { this.report("You are still recovering.", "combat"); return; }
      this.recover("equip", COMBAT_RULES.actionCooldown);
    }
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
    if (length > EPSILON) this.cameraForward = point(x / length, z / length);
  }
  setMouseForward(active: boolean): void { if (!this.instancePaused()) this.mouseForward = active; }
  selectTarget(id: string): void {
    definition(id);
    this.state.selectedThreat = id;
  }
  private actionCost(action: CombatMove["action"]): number {
    if (action === "equip" || action === "strike") return 0;
    return classAction(this.state.archetype, action).cost ?? COMBAT_RULES[action].cost;
  }
  private useAbility(action: Exclude<CombatAction, "strike">): void {
    const s = this.state, cost = this.actionCost(action);
    const target = s.world.threats.find(t => t.id === s.selectedThreat);
    let reason: string | null = null;
    if (!this.actionUnlocked(action)) reason = "Complete Rowan’s lessons to learn that move.";
    else if (!this.ready()) reason = "You are still recovering.";
    else if (s.stamina < cost) reason = "Not enough stamina.";
    else if ((action === "disengage" || action === "jab") && (!target || !this.attackInRange(target, action))) reason = "The target is out of reach, behind cover, or no longer available.";
    else if (action === "drinkPotion" && (s.potions < 1 || s.health >= 100)) reason = s.potions < 1 ? "No health potions. Visit Mara." : "Your health is already full. Potion kept.";
    else if (action === "bloodRage" && (!this.inCombat() || s.bloodRage >= COMBAT_RULES.bloodRage.maximum)) reason = classKit(s.archetype).powerName + " needs a fight and cannot exceed three stacks.";
    if (reason) { this.report(reason, "combat"); return; }
    this.spendStamina(cost); this.recover(action, COMBAT_RULES.actionCooldown);
    if (action === "disengage") {
      const facing = this.direction(s.position, target!.position);
      const destination = this.reachableEndpoint(s.position, point(s.position.x - facing.x * COMBAT_RULES.disengage.distance, s.position.z - facing.z * COMBAT_RULES.disengage.distance));
      s.maneuver = { kind: "disengage", targetId: target!.id, start: { ...s.position }, destination, facing, remainingSeconds: COMBAT_RULES.disengage.duration };
      this.hit(target!, (classAction(s.archetype, action).damage ?? COMBAT_RULES.disengage.damage) + s.bloodRage * this.powerDamagePerStack(), classAction(s.archetype, action).name + " at");
    } else if (action === "brace" || action === "guard") {
      s.guardSeconds = COMBAT_RULES[action].duration;
      s.block = action === "brace" ? classAction(s.archetype, action).block ?? COMBAT_RULES.brace.block : COMBAT_RULES.guard.block;
      const healing = action === "brace" && this.inCombat() ? Math.min(classAction(s.archetype, action).heal ?? 0, 100 - s.health) : 0;
      s.health += healing;
      this.feedback(null, "heal", healing);
      this.report("You gain " + s.block + " block for " + s.guardSeconds + " seconds." + (healing ? " Restored " + healing + " health." : ""), "combat");
    } else if (action === "drinkPotion") {
      const healing = Math.min(30, 100 - s.health); s.health += healing; s.potions--;
      this.feedback(null, "heal", healing);
      this.report("Your health potion restores " + healing + " health.", "combat");
    } else if (action === "jab") {
      this.hit(target!, (classAction(s.archetype, action).damage ?? COMBAT_RULES.jab.damage) + s.bloodRage * this.powerDamagePerStack(), classAction(s.archetype, action).name + " at");
    } else {
      if (s.bloodRage === 0) s.rageDrainSeconds = COMBAT_RULES.bloodRage.drainSeconds;
      s.bloodRage++; s.rageDecaySeconds = 0;
      this.report(classKit(s.archetype).powerName + " rises to " + s.bloodRage + ". Attacks gain " + s.bloodRage * this.powerDamagePerStack() + " damage.", "combat");
    }
  }
  private stopAutoAttack(targetId?: string): void {
    if (targetId !== undefined && this.state.selectedThreat !== targetId) return;
    this.autoAttacking = false;
  }
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
    if (this.instancePaused()) { if (!pressed) this.held.delete(action); return; }
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
    return this.state.phase !== "lost" && this.state.actionCooldown <= EPSILON && this.state.maneuver === null;
  }
  private act(action: AdventureAction): void {
    const s = this.state;
    if (this.instancePaused()) return;
    if (this.inPrivateInstance() && ["openTrade", "acceptTrade", "buyPotion", "rest", "gather", "ritual", "interact"].includes(action)) {
      this.report("Services and world rewards are unavailable during a private encounter.");
      return;
    }
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
      case "strike":
        if (this.autoAttacking) this.stopAutoAttack();
        else if (s.phase === "expedition") { this.autoAttacking = true; this.stepAutoAttack(0); }
        break;
      case "disengage": case "brace": case "bloodRage": case "jab": case "guard": this.useAbility(action); break;
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
      case "drinkPotion": this.useAbility("drinkPotion"); break;
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
    return { ability: this.ability(t), remainingSeconds: t.remainingSeconds, duration: t.castDuration,
      status: t.phase === "preparation" ? "casting" : "resolving" };
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
  private ability(t: ThreatState): ThreatAbilityView {
    if (t.head) return headAbility(t.head.ability, t.head.castVolley);
    if (t.wolf) return maulAbility(t.damage);
    if (t.id === "ritual-guardian") return foremanAbility(t.abilityIndex, t.damage);
    return ordinaryAbility(definition(t.id), t.damage);
  }
  private phaseDuration(t: ThreatState): number {
    if (t.phase === "preparation") return t.castDuration;
    if (t.phase === "recovery") return COMBAT_RULES.enemy.recovery;
    if (t.phase === "action") return t.head ? COMBAT_RULES.head.fireballTravel + (t.head.castVolley - 1) * COMBAT_RULES.head.fireballSpacing : t.wolf ? COMBAT_RULES.enemy.action : OTHER_PHASE_SECONDS.action;
    return 0;
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
  private attackInRange(t: ThreatState, action: "strike" | "disengage" | "jab"): boolean {
    const s = this.state;
    const range = action === "jab" ? COMBAT_RULES.jab.range : classAction(s.archetype, action).range ?? COMBAT_RULES[action].range;
    return s.phase === "expedition" && t.active && t.health > 0 && t.phase !== "returning" && (!this.inPrivateInstance() || t.aggro) && distance(s.position, t.position) <= range + EPSILON && this.attackPath(t);
  }
  private canUseAttack(t: ThreatState, action: "strike" | "disengage"): boolean {
    return this.actionUnlocked(action) && this.attackInRange(t, action) && (action === "strike" || this.ready() && this.state.stamina >= this.actionCost(action));
  }
  private powerDamagePerStack(): number { return classAction(this.state.archetype, "bloodRage").powerDamagePerStack ?? COMBAT_RULES.bloodRage.damagePerStack; }
  private hit(t: ThreatState, damage: number, verb: string): void {
    if (t.phase === "returning") return;
    damage += this.progression().attackBonus;
    const blocked = Math.min(damage, t.head?.block ?? t.shield);
    if (!t.head) t.shield -= blocked;
    if (t.id === "nest" && t.contributors.length === 0) this.report("Your blow enrages the Briar bee. It rushes toward you; watch the marked ground and Block or move before its swarm lands.", "combat");
    if (!t.contributors.includes(this.playerId ?? "solo")) t.contributors.push(this.playerId ?? "solo");
    if (!t.combatants.includes(this.playerId ?? "solo")) t.combatants.push(this.playerId ?? "solo");
    if (t.head) { t.head.block -= blocked; if (t.head.block === 0) t.head.blockSeconds = 0; }
    const s = this.state, dealt = Math.min(damage - blocked, t.health);
    t.health -= dealt;
    this.feedback(t.id, "block", blocked);
    this.feedback(t.id, "damage", dealt);
    if (t.health > 0 && !t.aggro) this.engage(t);
    if (t.wolf?.motion && this.rootedSeconds(t) > EPSILON) this.groundWolfMotion(t);
    s.attackSequence += 1; s.presence += 1;
    this.report(`You ${verb} ${definition(t.id).name} for ${dealt} damage${blocked ? ` (${blocked} absorbed by ${t.head ? "Ember Ward" : "Safety Shield"})` : ""}.`, "combat");
    if (t.health === 0) {
      if (t.id === "scout" && !this.inPrivateInstance()) for (const player of this.shared ? this.shared.characters.values() : [this]) {
        if (t.contributors.includes(player.playerId ?? "solo") && player.state.chapter.accepted.includes("roll-call")) player.state.chapter.scoutDefeated = true;
      }
      t.shield = 0;
      t.respawnAt = this.now() + WORLD_RESPAWN_MILLISECONDS;
      for (const player of this.participants()) player.stopAutoAttack(t.id);
      t.targetPlayerId = null; t.phase = "cleared"; t.remainingSeconds = 0; t.lastActionHit = false; t.aggro = false; t.moving = false; t.combatants = [];
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
    if (this.inPrivateInstance()) { this.report("Private encounters do not grant resources."); return; }
    if (s.phase !== "expedition" || !this.ready()) return;
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
    let remaining = seconds;
    while (remaining > EPSILON) {
      const dt = Math.min(remaining, 1 / 60);
      this.step(dt);
      remaining -= dt;
    }
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
    // Network input is a stream of short-lived commands.  An empty stream
    // means the player is neutral, not that world physics has stopped.  Keep
    // advancing locomotion so jumps land and vertical velocity settles while
    // a backgrounded client is not sending fresh packets.
    if (remaining > EPSILON && !blocked) {
      moveLocomotion(this.state, {
        forward: 0, strafe: 0, cameraX: this.cameraForward.x, cameraZ: this.cameraForward.z, jump: false,
      }, remaining);
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
    } else if (s.phase === "expedition" && s.position.z <= 0 && !this.inPrivateInstance()) {
      const reservedCrystals = s.chapter.accepted.includes("cold-hands") && !s.chapter.completed.includes("cold-hands") ? Math.min(3, s.cargo) : 0;
      const reservedRoll = s.chapter.accepted.includes("last-shift") && !s.chapter.completed.includes("last-shift") ? s.carriedRelics : 0;
      s.phase = "town"; s.supplies += s.cargo - reservedCrystals + s.carriedSalvage; s.bankedRelics += s.carriedRelics - reservedRoll;
      s.cargo = reservedCrystals; s.carriedRelics = reservedRoll; s.carriedSalvage = 0; s.guardSeconds = 0; s.block = 0;
      s.maneuver = null; s.position.y = 0; s.verticalSpeed = 0; this.lootOpenId = null; this.trade = null;
      if (!this.shared) for (const t of s.world.threats) if (t.health > 0) this.releaseThreat(t);
      this.stopAutoAttack();
      this.report(`You return to ${YARD.settlement}. Salvage and spare crystals are secured.${reservedCrystals ? " Bring your coolant crystals to Mara." : ""}${reservedRoll ? " Bring the Last Shift Roll to Rowan." : ""} Visit the inn before your next trip.`);
    }
    if (s.phase === "expedition") s.presence += (this.moving ? 0.5 : 0.1) * dt;
    s.guardSeconds = Math.max(0, s.guardSeconds - dt);
    if (s.guardSeconds <= EPSILON) { s.guardSeconds = 0; s.block = 0; }
    s.actionCooldown = Math.max(0, s.actionCooldown - dt);
    if (s.actionCooldown <= EPSILON) s.actionCooldown = 0;
    s.actionRemainingSeconds = Math.max(0, s.actionRemainingSeconds - dt);
    if (s.actionRemainingSeconds <= EPSILON) { s.currentAction = null; s.actionDuration = 0; }
    this.autoAttackRemainingSeconds = Math.max(0, this.autoAttackRemainingSeconds - dt);
    if (s.health > 0) this.advanceResources(dt);
  }
  private stepAutoAttack(_dt: number): void {
    const s = this.state;
    if (!this.autoAttacking) return;
    if (s.phase !== "expedition" || s.health <= 0) { this.stopAutoAttack(); return; }
    const target = s.world.threats.find(t => t.id === s.selectedThreat && t.active && t.health > 0 && t.phase !== "returning");
    if (!target) { this.stopAutoAttack(); return; }
    if (this.autoAttackRemainingSeconds > EPSILON || s.maneuver || !this.attackInRange(target, "strike") || s.currentAction === "gather" || s.currentAction === "ritual") return;
    s.currentAction = "strike"; s.actionDuration = COMBAT_RULES.strike.duration; s.actionRemainingSeconds = COMBAT_RULES.strike.duration;
    this.hit(target, (classAction(s.archetype, "strike").damage ?? COMBAT_RULES.strike.damage) + s.bloodRage * this.powerDamagePerStack(), classAction(s.archetype, "strike").name + " at");
    this.autoAttackRemainingSeconds = COMBAT_RULES.autoAttackSeconds;
  }
  private step(dt: number): void {
    const s = this.state;
    this.stepPlayer(dt);
    if (s.health <= 0) return;
    for (const t of s.world.threats) { t.moving = false; this.acquireOrRelease(t, dt); }
    this.stepAutoAttack(dt);
    for (const t of s.world.threats) if (t.aggro && t.active && t.health > 0 && s.health > 0) this.advanceThreat(t, dt);
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
    return s.phase === "expedition" && s.health > 0 && s.position.z > 2 && distance(s.position, d.position) <= d.leash;
  }
  private engage(t: ThreatState): void {
    t.aggro = true; t.lastActionHit = false; t.targetPlayerId = this.playerId;
    if (this.playerId !== null && !t.combatants.includes(this.playerId)) t.combatants.push(this.playerId);
    this.beginCast(t);
  }
  private beginCast(t: ThreatState): void {
    t.phase = "preparation"; t.lastActionHit = false;
    const ramp = Math.min(1, t.actionSequence * 0.15);
    t.damage = t.wolf ? 18 + Math.min(18, t.actionSequence * 2) : Math.ceil(definition(t.id).damage * (1 + this.state.presence / 100 + ramp));
    if (t.id === "ritual-guardian") {
      t.abilityIndex = t.actionSequence % 3;
      t.damage = t.abilityIndex === 2 ? 0 : (t.abilityIndex === 0 ? 32 : 48) + Math.floor(t.actionSequence / 3) * 4;
    }
    if (t.head) {
      t.head.ability = this.chooseHeadAbility(t); t.head.castVolley = t.head.volley;
      t.damage = this.ability(t).damage;
    }
    t.castDuration = this.ability(t).noticeSeconds;
    t.remainingSeconds = t.castDuration;
    t.targetPosition = t.wolf ? this.wolfEndpoint(t) : { ...t.position };
    if (t.wolf) { t.wolf.nextAttackSeconds = t.remainingSeconds; t.wolf.motion = null; t.position.y = 0; }
  }
  private chooseHeadAbility(t: ThreatState): HeadAbilityId {
    const h = t.head!, s = this.state;
    if (!h.opened) return "ember-beam";
    const previous = h.ability;
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
    if (this.inPrivateInstance() && !t.aggro) return;
    if (t.phase === "returning") { this.returnHome(t, dt); return; }
    if (!t.aggro) {
      this.patrol(t, dt);
      if (s.phase === "expedition" && s.position.z > 2 && d.disposition === "hostile" && distance(s.position, t.position) <= d.aggroRange && this.clearPath(t.position, s.position)) this.engage(t);
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
    } else if (s.phase !== "expedition" || s.position.z <= 2 || distance(s.position, d.position) > d.leash || distance(t.position, d.position) > d.leash) this.releaseThreat(t);
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
    t.shield = 0; t.contributors = []; t.combatants = [];
    for (const player of this.participants()) player.stopAutoAttack(t.id);
    t.targetPlayerId = null; t.castDuration = 0; t.shieldSeconds = 0;
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
    t.shieldSeconds = Math.max(0, t.shieldSeconds - dt);
    if (t.shieldSeconds <= EPSILON) t.shield = 0;
    if (t.head) {
      t.head.blockSeconds = Math.max(0, t.head.blockSeconds - dt);
      if (t.head.blockSeconds <= EPSILON) t.head.block = 0;
    }
    if (t.phase === "preparation" && t.castDuration === 0) { this.beginCast(t); return; }
    if (t.phase === "preparation") {
      if (t.wolf) { this.positionWolf(t, dt); t.targetPosition = this.wolfEndpoint(t); }
      else if (t.head) {
        const gap = distance(t.position, this.state.position) - 8;
        if (gap > 0) this.moveThreat(t, this.state.position, Math.min(dt, gap / definition(t.id).speed));
        t.targetPosition = { ...this.state.position };
      } else this.pursue(t, dt);
      t.remainingSeconds = Math.max(0, t.remainingSeconds - dt);
      if (t.wolf) t.wolf.nextAttackSeconds = t.remainingSeconds;
      if (t.remainingSeconds > EPSILON) return;
      if (t.head) this.resolveHeadCast(t);
      else if (t.wolf) this.launchMaul(t);
      else if (t.id === "ritual-guardian" && t.abilityIndex === 2) {
        t.shield = 60; t.shieldSeconds = 5; t.actionSequence++;
        this.report("Foreman Nine raises Safety Shield: 60 Block for 5 seconds.", "combat"); this.beginRecovery(t);
      } else { t.phase = "action"; t.remainingSeconds = OTHER_PHASE_SECONDS.action; t.targetPosition = { ...t.position }; }
      return;
    }
    if (t.phase === "action") {
      if (t.head) { this.advanceFireballs(t, dt); return; }
      if (t.wolf) this.moveWolfMotion(t, dt);
      t.remainingSeconds = Math.max(0, t.remainingSeconds - dt);
      if (t.remainingSeconds <= EPSILON) { this.resolveAttack(t); this.beginRecovery(t); }
      return;
    }
    if (t.phase === "recovery") {
      t.remainingSeconds = Math.max(0, t.remainingSeconds - dt);
      if (t.remainingSeconds <= EPSILON) this.beginCast(t);
    }
  }
  private beginRecovery(t: ThreatState): void { t.phase = "recovery"; t.remainingSeconds = COMBAT_RULES.enemy.recovery; }
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
      t.lastActionHit = this.headInRange(t);
      if (t.lastActionHit) this.hurt(COMBAT_RULES.head.beamDamage, "Cinder Watchman — Ember Beam");
      else this.feedback(null, "miss", 0);
    } else if (h.ability === "ember-ward") {
      h.block = COMBAT_RULES.head.ward; h.blockSeconds = COMBAT_RULES.head.wardDuration;
      this.report("Cinder Watchman raises a ward: 6 block for 2 seconds.", "combat");
    } else { h.volley++; this.report("Cinder Watchman grows stronger: " + h.volley + " fireballs per volley.", "combat"); }
    this.beginRecovery(t);
  }
  private advanceFireballs(t: ThreatState, dt: number): void {
    const h = t.head!;
    for (const ball of h.fireballs) {
      ball.remainingSeconds = Math.max(0, ball.remainingSeconds - dt);
      if (ball.remainingSeconds <= EPSILON) {
        if (this.headInRange(t)) this.hurt(ball.damage, "Cinder Watchman — Fireball");
        else this.feedback(null, "miss", 0);
      }
      if (this.state.health <= 0) return;
    }
    h.fireballs = h.fireballs.filter(ball => ball.remainingSeconds > EPSILON);
    h.nextFireballSeconds -= dt;
    if (h.pendingFireballs > 0 && h.nextFireballSeconds <= EPSILON) {
      if (this.headInRange(t)) h.fireballs.push({ id: ++h.projectileSequence, origin: { ...t.position }, remainingSeconds: COMBAT_RULES.head.fireballTravel, duration: COMBAT_RULES.head.fireballTravel, damage: COMBAT_RULES.head.fireballDamage });
      h.pendingFireballs--; h.nextFireballSeconds = COMBAT_RULES.head.fireballSpacing;
    }
    t.remainingSeconds = Math.max(0, t.remainingSeconds - dt);
    if (h.pendingFireballs === 0 && h.fireballs.length === 0) this.beginRecovery(t);
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
  private resolveAttack(t: ThreatState): void {
    t.lastActionHit = t.id === "ritual-guardian" && t.abilityIndex === 0 ? distance(this.state.position, t.position) <= this.ability(t).range + EPSILON : (distance(this.state.position, t.targetPosition) <= this.ability(t).range + EPSILON &&
      this.clearPath(t.targetPosition, this.state.position));
    t.actionSequence += 1;
    if (t.lastActionHit) this.hurt(t.damage, `${definition(t.id).name} — ${this.intention(t)}`);
    else { this.feedback(null, "miss", 0); this.report(`${definition(t.id).name} — ${this.intention(t)} misses you.`, "combat"); }
  }
  private feedback(targetId: string | null, kind: CombatFeedback["kind"], amount: number): void {
    if (kind !== "miss" && amount <= 0) return;
    this.combatFeedback.push({ id: ++this.combatFeedbackId, targetId, kind, amount });
    if (this.combatFeedback.length > 32) this.combatFeedback.shift();
  }
  private hurt(damage: number, source: string, bypassBlock = false): void {
    const s = this.state;
    const blocked = !bypassBlock && s.guardSeconds > EPSILON ? Math.min(damage, s.block) : 0;
    s.block -= blocked;
    if (s.block === 0) s.guardSeconds = 0;
    const remainder = damage - blocked;
    const taken = Math.min(s.health, remainder === 0 ? 0 : bypassBlock ? remainder : Math.max(1, remainder - this.progression().damageReduction));
    s.health -= taken;
    this.feedback(null, "block", blocked);
    this.feedback(null, "damage", taken);
    this.report(`${source} hits you for ${taken} damage${blocked > 0 ? ` (${blocked} blocked by Brace)` : ""}.`, "combat");
    if (s.health > 0) return;
    s.maneuver = null; s.block = 0; s.guardSeconds = 0; this.stopAutoAttack();
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
  try { parsed = JSON.parse(serialized); } catch { throw new Error("Invalid adventure save: unreadable saved data."); }
  const root = record(parsed), version = number(root.version, 1, 10, true), realtime = version === 10;
  const s = record(root.state), p = record(s.position);
  if (!Array.isArray(s.threats) || s.threats.length !== DEFINITIONS.length) throw new Error("Invalid adventure save: missing threats.");
  const threats: ThreatState[] = s.threats.map(value => {
    const t = record(value), id = choice(t.id, DEFINITIONS.map(d => d.id)), d = definition(id);
    const health = id === "ritual-guardian" && t.active === false && s.chapter === undefined ? d.health : number(t.health, 0, d.health);
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
      contributors: t.contributors === undefined ? [] : stringList(t.contributors),
      combatants: legacyCombatants,
      rollClaims: t.rollClaims === undefined ? [] : stringList(t.rollClaims),
      shield: t.shield === undefined ? 0 : number(t.shield, 0, 60), shieldSeconds: realtime ? number(t.shieldSeconds, 0, 5) : 0,
      respawnAt: health === 0 ? t.respawnAt === undefined || t.respawnAt === null ? now + WORLD_RESPAWN_MILLISECONDS : number(t.respawnAt) : null,
      rng: t.rng === undefined ? seedForThreat(id) : number(t.rng, 0, 0xffffffff, true),
      castDuration: realtime ? number(t.castDuration, 0, 5) : 0,
      remainingSeconds: realtime ? number(t.remainingSeconds) : 0,
      actionSequence: number(t.actionSequence, 0, Number.MAX_SAFE_INTEGER, true), lastActionHit: boolean(t.lastActionHit),
      damage: number(t.damage, 0, Number.MAX_SAFE_INTEGER, true),
      position: version === 1 ? { ...d.position } : groundPosition(t.position, COMBAT_RULES.wolf.lungeHeight),
      targetPosition: version === 1 ? { ...d.position } : groundPosition(t.targetPosition),
      targetPlayerId: t.targetPlayerId === undefined || t.targetPlayerId === null ? null : text(t.targetPlayerId),
      lootClaimed: version >= 3 ? boolean(t.lootClaimed) : id === "ritual-guardian" && health === 0,
      patrolIndex: t.patrolIndex === undefined ? 1 : number(t.patrolIndex, 0, d.patrol?.length ?? 1, true), moving: t.moving === undefined ? false : boolean(t.moving),
      abilityIndex: t.abilityIndex === undefined ? 0 : number(t.abilityIndex, 0, 2, true),
      wolf: id === "patrol" ? realtime ? readWolf(t.wolf, true) : newWolf() : null,
      head: id === "scout" ? t.head ? readHead(t.head, realtime) : newHead() : null,
    };
    if (!realtime) {
      result.position.y = 0; result.shield = 0;
      result.phase = health === 0 ? "cleared" : !active ? "dormant" : aggro ? "preparation" : phase === "returning" ? "returning" : d.patrol ? "patrol" : "dormant";
    }
    if (id === "nest" && result.position.x > THICKET[0] && result.position.z >= THICKET[2] && result.position.z <= THICKET[3]) { result.position.x = THICKET[0] - 0.5; result.targetPosition = { ...result.position }; }
    if (result.aggro !== ["approach", "preparation", "action", "recovery"].includes(result.phase)) throw new Error("Invalid adventure save: inconsistent aggression.");
    if (result.lootClaimed && health > 0) throw new Error("Invalid adventure save: living creature already looted.");
    return result;
  });
  if (new Set(threats.map(t => t.id)).size !== DEFINITIONS.length) throw new Error("Invalid adventure save: duplicate threat.");
  const state: SavedState = {
    chapter: readChapter(s.chapter), phase: choice(s.phase, ["town", "expedition", "lost"] as const),
    archetype: choice(s.archetype, ["warrior", "mage", "hunter", "alchemist", "artificer"] as const),
    position: { x: number(p.x, -12, 12), y: number(p.y, 0, 2), z: number(p.z, -14, 45) },
    verticalSpeed: number(s.verticalSpeed, -6, 5.5), health: number(s.health, 0, 100),
    supplies: number(s.supplies, 0, Number.MAX_SAFE_INTEGER, true), cargo: number(s.cargo, 0, Number.MAX_SAFE_INTEGER, true),
    resourceRemaining: number(s.resourceRemaining, 0, 12, true), potions: number(s.potions, 0, Number.MAX_SAFE_INTEGER, true),
    resourceRespawns: readResourceRespawns(s.resourceRespawns, number(s.resourceRemaining, 0, 12, true), now),
    carriedRelics: number(s.carriedRelics, 0, 1, true), bankedRelics: number(s.bankedRelics, 0, Number.MAX_SAFE_INTEGER, true),
    carriedSalvage: version >= 3 ? number(s.carriedSalvage, 0, Number.MAX_SAFE_INTEGER, true) : 0,
    presence: number(s.presence), ritualCalled: boolean(s.ritualCalled), actionCooldown: realtime ? number(s.actionCooldown, 0, 2) : 0,
    currentAction: realtime && s.currentAction !== null ? choice(s.currentAction, ["strike", "disengage", "brace", "bloodRage", "jab", "guard", "drinkPotion", "gather", "ritual", "equip"] as const) : null,
    actionDuration: realtime ? number(s.actionDuration, 0, 2) : 0,
    actionRemainingSeconds: realtime ? number(s.actionRemainingSeconds, 0, 2) : 0,
    guardSeconds: Math.min(number(s.guardSeconds, 0, 5), COMBAT_RULES.brace.duration),
    block: version >= 4 ? number(s.block, 0, 28) : number(s.guardSeconds, 0, 3) > 0 ? 5 : 0,
    stamina: version >= 8 ? number(s.stamina, 0, 5, true) : 5,
    staminaRecoverySeconds: realtime ? number(s.staminaRecoverySeconds, 0, COMBAT_RULES.stamina.recoverySeconds) : s.stamina === 5 ? 0 : COMBAT_RULES.stamina.recoverySeconds,
    bloodRage: version >= 7 ? number(s.bloodRage, 0, 3, true) : 0,
    rageDrainSeconds: version >= 7 ? number(s.rageDrainSeconds, 0, 5) : 0,
    rageDecaySeconds: version >= 7 ? number(s.rageDecaySeconds, 0, 2) : 0,
    maneuver: realtime ? readManeuver(s.maneuver) : null,
    attackSequence: number(s.attackSequence, 0, Number.MAX_SAFE_INTEGER, true),
    selectedThreat: choice(s.selectedThreat, DEFINITIONS.map(t => t.id)), report: text(s.report), threats,
  };
  if ((state.phase === "lost") !== (state.health === 0) || threats.find(t => t.id === "ritual-guardian")?.active !== state.ritualCalled) throw new Error("Invalid adventure save: inconsistent expedition.");
  if ((state.block === 0) !== (state.guardSeconds === 0) || (state.maneuver !== null && state.phase !== "expedition")) throw new Error("Invalid adventure save: inconsistent combat state.");
  const { threats: restoredThreats, resourceRemaining, resourceRespawns, ritualCalled, ...player } = state;
  return { ...player, world: { threats: restoredThreats, resourceRemaining, resourceRespawns, ritualCalled } };
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

function readHead(value: unknown, realtime: boolean): HeadState {
  const h = record(value), fresh = newHead();
  if (!realtime) return { ...fresh, opened: h.opened === undefined ? false : boolean(h.opened), volley: number(h.volley, 1, Number.MAX_SAFE_INTEGER, true) };
  if (!Array.isArray(h.fireballs)) throw new Error("Invalid adventure save: missing fireballs.");
  const volley = number(h.volley, 1, Number.MAX_SAFE_INTEGER, true), castVolley = number(h.castVolley, 1, volley, true);
  return { opened: boolean(h.opened), ability: choice(h.ability, ["ember-beam", "fireball", "ember-ward", "kindle"] as const), volley, castVolley,
    block: number(h.block, 0, 6), blockSeconds: number(h.blockSeconds, 0, 2), projectileSequence: number(h.projectileSequence, 0, Number.MAX_SAFE_INTEGER, true),
    pendingFireballs: number(h.pendingFireballs, 0, castVolley, true), nextFireballSeconds: number(h.nextFireballSeconds, -1, COMBAT_RULES.head.fireballSpacing),
    fireballs: h.fireballs.map(value => { const p = record(value); return { id: number(p.id, 1, Number.MAX_SAFE_INTEGER, true), origin: groundPosition(p.origin), remainingSeconds: number(p.remainingSeconds, 0, COMBAT_RULES.head.fireballTravel), duration: number(p.duration, COMBAT_RULES.head.fireballTravel, COMBAT_RULES.head.fireballTravel), damage: number(p.damage, COMBAT_RULES.head.fireballDamage, COMBAT_RULES.head.fireballDamage) }; }),
  };
}

function foremanAbility(index: number, damage: number): ThreatAbilityView {
  if (index === 2) return { id: "foreman-shield", name: "Safety Shield", description: "After a 5-second cast, absorbs 60 damage for 5 seconds. Heal or build power while it is shielded.", damage: 0, range: 0, noticeSeconds: 5 };
  if (index === 0) return { id: "foreman-pulse", name: "Roll-call Pulse", description: "A 3-second cast, then a pulse within 22 metres. Cannot be dodged or stopped by cover. Block absorbs damage. Grows stronger after each Pulse, Press, Shield cycle.", damage, range: 22, noticeSeconds: 3 };
  return { id: "foreman-press", name: "Final Press", description: "A 3-second cast, then strikes the marked ground after 0.35 seconds. Leave the area or Block.", damage, range: 3.5, noticeSeconds: 3 };
}
function headAbility(id: HeadAbilityId, volley: number): ThreatAbilityView {
  if (id === "ember-beam") return { id, name: "Ember Beam", description: "Casts for 3 seconds, then deals 8 damage within 10 metres. Block, cover or leave its reach.", damage: COMBAT_RULES.head.beamDamage, range: 10, noticeSeconds: 3 };
  if (id === "ember-ward") return { id, name: "Ember Ward", description: "Casts for 5 seconds, then absorbs 6 damage for 2 seconds. Attack before the shield rises or recover while it holds.", damage: 0, range: 10, noticeSeconds: 5 };
  if (id === "kindle") return { id, name: "Kindle", description: "Casts for 5 seconds to add one fireball to every later volley. Attack while it powers up.", damage: 0, range: 0, noticeSeconds: 5 };
  return { id, name: "Fireball ×" + volley, description: "Casts for 3 seconds, then launches " + volley + " homing fireballs for 18 damage each. Travel time is 0.9 seconds; launches are 0.2 seconds apart. Block around impact. Cover or leaving 10-metre reach prevents damage; defeating the head extinguishes its fireballs.", damage: COMBAT_RULES.head.fireballDamage * volley, range: 10, noticeSeconds: 3 };
}
function maulAbility(damage = 18): ThreatAbilityView {
  return { id: "maul", name: "Lunging Maul", description: "Circles during a 3-second warning, then leaps up to 8 metres toward a fixed landing point. Lands 0.65 seconds later in a 2-metre area and recovers for 2 seconds. Move after it commits, then strike. Each Maul gains 2 damage, up to 36.", damage, range: COMBAT_RULES.wolf.impactRadius, noticeSeconds: 3 };
}
function ordinaryAbility(d: ThreatDefinition, damage = d.damage): ThreatAbilityView {
  return { id: d.id, name: d.intention, description: d.preparation + ". Pursues during its 3-second cast, then fixes the marked area and strikes after 0.35 seconds. Leave the area or Block. Recovers for 2 seconds; each attack raises its next damage by 15% of base damage, up to double. Forest attention adds further pressure.", damage, range: d.reach, noticeSeconds: 3 };
}
export function getMonsterLore(): readonly MonsterLoreEntry[] {
  return DEFINITIONS.map(d => {
    if (d.behavior === "head") return {
      id: d.id, name: d.name, health: d.health, disposition: d.disposition,
      description: "A floating fire spirit wandering around the first clearing. Notices you within 6 metres and pursues within 14 metres of home.",
      opener: "Ember Beam: a 3-second cast before its first attack.",
      abilities: [headAbility("ember-beam",1), headAbility("fireball",1), headAbility("ember-ward",1), headAbility("kindle",1)],
      sequences: [
        { name: "Fireball", abilityIds: ["fireball"], offsetsSeconds: [], description: "Its usual attack, always following Kindle. Prefers attacking a wounded opponent to shielding." },
        { name: "Ember Ward", abilityIds: ["ember-ward"], offsetsSeconds: [], description: "Shields when below half health or threatened by your power, if you have stamina and are close enough to strike. Never shields twice in a row." },
        { name: "Kindle", abilityIds: ["kindle"], offsetsSeconds: [], description: "Powers up after every third action, when out of reach, or when your block can absorb its volley. Never powers up twice in a row." },
      ], strategy: "Time Block for fireball impacts. Attack during Kindle. Endless defense loses as volleys grow.",
    };
    if (d.behavior === "wolf") return {
      id: d.id, name: d.name, health: d.health, disposition: d.disposition,
      description: "Patrols the western trail. Runs toward you beyond 5.5 metres, then circles at about 4.5 metres. Nearby hostile allies answer its call.",
      opener: "Shows a full 3-second warning before its first leap.", abilities: [maulAbility()],
      sequences: [{ name: "Repeated Maul", abilityIds: ["maul"], offsetsSeconds: [], description: "Three seconds of circling, a committed leap, then two seconds recovering before its next choice." }],
      strategy: "Leave the committed landing before impact, then attack during recovery. Disengage roots the hound while you retreat.",
    };
    if (d.id === "ritual-guardian") return {
      id: d.id, name: d.name, health: d.health, disposition: d.disposition,
      description: "The last foreman of the Ninth Bell Engine. Six coolant crystals wake it. Search its remains for the Last Shift Roll.",
      opener: "A full 3-second Roll-call Pulse cast after summoning.", abilities: [foremanAbility(0,32),foremanAbility(1,48),foremanAbility(2,0)],
      sequences: [{ name: "The final shift", abilityIds: ["foreman-pulse","foreman-press","foreman-shield"], offsetsSeconds: [], description: "Pulse, Press, Shield. Each cast is followed by two seconds of recovery. Pulse and Press gain 4 damage each cycle." }],
      strategy: "Bring your coat, weapon and potions. Block the unavoidable Pulse, leave the Press area, and heal while Shield is raised.",
    };
    return { id:d.id, name:d.name, health:d.health, disposition:d.disposition,
      description: d.id === "nest" ? "A neutral bee beside the briars. Attacking enrages it into a fast pursuit within 18 metres of home; the surrounding shrubs remain after defeat." : "Guards the coolant crystals. Its living thorns deal 8 damage whenever you gather; defeating it removes the hazard.",
      opener: "Pursues immediately and shows a 3-second cast before striking.",
      abilities: [ordinaryAbility(d), ...(d.id === "warder" ? [{ id: "harvest-thorns", name: "Gathering thorns", description: "Gathering while the Cablekeeper lives deals 8 damage. Block absorbs it.", damage: 8, range: 0, noticeSeconds: 0 }] : [])],
      sequences: [{ name: d.intention, abilityIds:[d.id], offsetsSeconds:[], description:"Commits a cast, strikes, recovers for two seconds, then chooses again. Each enemy acts independently." }],
      strategy:"Leave the marked ground before impact or Block. Strike during recovery.",
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
  const ownedGear = stringList(c.ownedGear).map(id => choice(id, ["insulated-coat", "yard-weapon"] as const));
  const slots = { chest: equipment.chest === null ? null : choice(equipment.chest, ["insulated-coat"] as const), mainhand: equipment.mainhand === null ? null : choice(equipment.mainhand, ["yard-weapon"] as const) };
  if (completed.some(id => !accepted.includes(id)) || Object.values(slots).some(id => id && !ownedGear.includes(id))) throw new Error("Invalid adventure save: inconsistent chapter.");
  return { accepted, completed, scoutDefeated: boolean(c.scoutDefeated), level: number(c.level,1,3,true), ownedGear, equipment: slots };
}
