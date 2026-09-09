import type { CharacterArchetype } from "../host/character-profile.js";
import type {
  AdventureAction, AdventureGame, AdventureOptions, AdventureSnapshot, AdventureLogEntry,
  CorpseLootView, PlaceView, Position, ThreatPhase, ThreatView, ThreatAbilityView, MonsterLoreEntry, ThreatForecastEntry, CombatAction, QueuedCombatAction, CombatView,
} from "./adventure-types.js";

type Vector = { x: number; y: number; z: number };
type Phase = AdventureSnapshot["phase"];
export const COMBAT_RULES = {
  actionCooldown: 1,
  window: { active: 5, preparation: 5, maximumActions: 5 },
  stamina: { maximum: 5, recoverySeconds: 5 },
  bloodRage: { cost: 1, maximum: 3, damagePerStack: 2, drainPerStack: 1, drainSeconds: 5, decaySeconds: 2, recovery: 2 },
  strike: { damage: 9, range: 6.5, stopDistance: 1.5, duration: 0.25, cost: 1 },
  disengage: { damage: 6, range: 3.5, distance: 5, duration: 0.8, cost: 1 },
  brace: { block: 10, duration: 2, cost: 2 },
  jab: { damage: 3, range: 2, cost: 0 },
  guard: { block: 2, duration: 1, cost: 0 },
  drinkPotion: { cost: 1, recovery: 1 },
  enemy: { preparation: 5, action: 0.65, recovery: 2 },
  head: { beamDamage: 1, fireballDamage: 3, fireballTravel: 0.9, fireballSpacing: 0.2, warning: 5, ward: 6, wardDuration: 2, kindleDuration: 5 },
  wolf: { hopDuration: 0.5, hopDistance: 2.8, hopHeight: 0.6, circleRange: 5.5, circleRadius: 4.5, circleSpeed: 1.5, lungeDistance: 8, lungeHeight: 0.9 },
} as const;
export const MARA_TRADE_RULES = { suppliesPerPotion: 3, suppliesPerPotionSold: 2 } as const;
interface Maneuver {
  kind: "lunge" | "disengage"; targetId: string; remainingSeconds: number;
  start: Vector; destination: Vector; facing: Vector;
}
interface WolfMotion {
  kind: "hop" | "lunge"; start: Vector; destination: Vector;
  remainingSeconds: number; duration: number;
}
interface WolfState {
  rng: number; facing: Vector; motion: WolfMotion | null;
  nextAttackSeconds: number; circling: boolean; attackOrigin: Vector;
}
type HeadAbilityId = "ember-beam" | "fireball" | "ember-ward" | "kindle";
const HEAD_ROTATION: readonly HeadAbilityId[] = ["fireball", "ember-ward", "kindle"];
interface HeadEvent { offsetSeconds: number; spacing: number; ability: HeadAbilityId; remainingSeconds: number; status: "pending" | "active" | "done"; volley: number; launched: number; }
interface HeadState {
  opened: boolean; rotationIndex: number; events: HeadEvent[];
  block: number; blockSeconds: number;
  volley: number; projectileSequence: number;
  fireballs: { impactOffset: number; id: number; origin: Vector; remainingSeconds: number; duration: number; damage: number }[];
}
interface ThreatDefinition {
  id: string; name: string; position: Position; health: number; behavior?: "wolf" | "head";
  preparation: string; intention: string; damage: number; reach: number; benefit: string;
  disposition: ThreatView["disposition"]; aggroRange: number; leash: number; speed: number; patrol?: readonly Position[];
}
interface ThreatState {
  id: string; health: number; active: boolean; phase: ThreatPhase;
  joinCycle: number; windowCycle: number; specialOffset: number; specialLaunched: boolean; specialResolved: boolean;
  remainingSeconds: number; actionSequence: number; lastActionHit: boolean; damage: number;
  position: Vector; targetPosition: Vector; aggro: boolean; lootClaimed: boolean;
  patrolIndex: number; moving: boolean; abilityIndex: number;
  wolf: WolfState | null; head: HeadState | null;
}
type QueueEntry = { -readonly [K in keyof QueuedCombatAction]: QueuedCombatAction[K] };
interface CombatState { phase: CombatView["phase"]; elapsedSeconds: number; cycle: number; queued: QueueEntry[]; nextId: number; }
const newCombat = (): CombatState => ({ phase: "idle", elapsedSeconds: 0, cycle: 0, queued: [], nextId: 1 });
interface State {
  combat: CombatState;
  phase: Phase; archetype: CharacterArchetype; position: Vector; verticalSpeed: number;
  health: number; supplies: number; cargo: number; resourceRemaining: number;
  potions: number; carriedRelics: number; bankedRelics: number; presence: number; carriedSalvage: number;
  ritualCalled: boolean; actionCooldown: number; currentAction: AdventureAction | null; actionDuration: number; guardSeconds: number;
  block: number; stamina: number; staminaRecoverySeconds: number; bloodRage: number; rageDrainSeconds: number; rageDecaySeconds: number; maneuver: Maneuver | null;
  attackSequence: number; selectedThreat: string; report: string; threats: ThreatState[];
}

const point = (x: number, z: number): Vector => ({ x, y: 0, z });
const DEFINITIONS: readonly ThreatDefinition[] = [
  { id: "scout", behavior: "head", disposition: "hostile", aggroRange: 6, leash: 14, speed: 1.6, name: "Ember head", position: point(-3,10), health: 72,
    preparation: "Gathering fire", intention: "Fireball", damage: 3, reach: 10,
    benefit: "Clear the Ember head to make the first clearing safer." },
  { id: "nest", disposition: "neutral", aggroRange: 0, leash: 7, speed: 0, name: "Thorn nest", position: point(5, 20), health: 24,
    preparation: "Rousing the swarm", intention: "Swarm rush", damage: 7, reach: 3,
    benefit: "Clear the nest to open the passage through the thicket." },
  { id: "warder", disposition: "hostile", aggroRange: 8, leash: 11, speed: 2, name: "Root warder", position: point(-3, 30), health: 30,
    preparation: "Raising thorn wards", intention: "Thorn lash", damage: 8, reach: 5,
    benefit: "Clear the warder to gather frost cores without cutting thorns." },
  { id: "patrol", behavior: "wolf", disposition: "hostile", aggroRange: 6, leash: 30, speed: 4.2, name: "Ash hound", position: point(-6,24), health: 54,
    patrol: [point(-6,24), point(-9,24), point(-9,28), point(-6,28)],
    preparation: "Drawing back to pounce", intention: "Lunging Maul", damage: 4, reach: 2,
    benefit: "Clear the hound to make the deeper trail safer." },
  { id: "ritual-guardian", disposition: "hostile", aggroRange: 8, leash: 11, speed: 2.2, name: "Called frost guardian", position: point(2, 40), health: 48,
    preparation: "Drawing a freezing breath", intention: "Frost torrent", damage: 20, reach: 3,
    benefit: "Defeat the called guardian, then carry its frost relic home." },
];
const PLACES: readonly PlaceView[] = [
  { id: "hearthstead", name: "Hearthstead", position: point(0, -8), kind: "town" },
  { id: "forest-gate", name: "North gate / return to safety", position: point(0, 0), kind: "gate" },
  { id: "frost-cores", name: "Frost cores", position: point(-2, 12), kind: "resource" },
  { id: "ritual-site", name: "Deep grove", position: point(2, 40), kind: "ritual" },
  { id: "mara", name: "Mara / Apothecary", position: point(3.4, -7.5), kind: "shop" },
  { id: "inn", name: "Rowan / The Wayfarer's Rest", position: point(5, -11), kind: "inn" },
];
const PHASE_SECONDS: Record<ThreatPhase, number> = {
  dormant: 0, patrol: 0, approach: 0, ...COMBAT_RULES.enemy, returning: 0, cleared: 0,
};
const OTHER_PHASE_SECONDS: Record<ThreatPhase, number> = { ...PHASE_SECONDS, preparation: 3, action: 0.35, recovery: 2.65 };
const EPSILON = 1e-9;
type Barrier = readonly [left: number, right: number, bottom: number, top: number];
const THICKET: Barrier = [2, Infinity, 18, 24];
const GATE_WALLS: readonly Barrier[] = [[-Infinity, -3, -0.5, 4], [3, Infinity, -0.5, 4]];
const distance = (a: Position, b: Position): number => Math.hypot(a.x - b.x, a.z - b.z);
const definition = (id: string): ThreatDefinition => {
  const found = DEFINITIONS.find(t => t.id === id);
  if (!found) throw new Error(`Unknown threat: ${id}`);
  return found;
};
const newWolf = (): WolfState => ({ rng: 0x6d2b79f5, facing: point(0, 1), motion: null,
  nextAttackSeconds: COMBAT_RULES.enemy.preparation, circling: false, attackOrigin: point(-3, 10),
});
const newHead = (): HeadState => ({ opened: false, rotationIndex: 0, events: [], block: 0, blockSeconds: 0, volley: 1, projectileSequence: 0, fireballs: [] });
const newThreats = (): ThreatState[] => DEFINITIONS.map(t => ({
  id: t.id, health: t.health, active: t.id !== "ritual-guardian", phase: t.patrol ? "patrol" : "dormant",
  joinCycle: 0, windowCycle: 0, specialOffset: 0, specialLaunched: false, specialResolved: false,
  remainingSeconds: 0, actionSequence: 0, lastActionHit: false, damage: t.behavior === "wolf" ? 9 : t.damage,
  position: { ...t.position }, targetPosition: { ...t.position }, aggro: false,
  lootClaimed: false, patrolIndex: 1, moving: false, abilityIndex: 0,
  wolf: t.behavior === "wolf" ? newWolf() : null, head: t.behavior === "head" ? newHead() : null,
}));
function initialState(archetype: CharacterArchetype): State {
  return {
    phase: "town", archetype, position: point(0, -8), verticalSpeed: 0, health: 100,
    supplies: 15, cargo: 0, resourceRemaining: 12, potions: 0, carriedRelics: 0,
    bankedRelics: 0, carriedSalvage: 0, presence: 0, ritualCalled: false, actionCooldown: 0, currentAction: null, actionDuration: 0,
    guardSeconds: 0, block: 0, stamina: 5, staminaRecoverySeconds: 0, bloodRage: 0, rageDrainSeconds: 0, rageDecaySeconds: 0, maneuver: null,
    attackSequence: 0, selectedThreat: "scout",
    report: "Visit Mara for potions, then take the north gate. Gather frost cores and return alive.",
    threats: newThreats(), combat: newCombat(),
  };
}

class Adventure implements AdventureGame {
  private state: State;
  private held = new Set<AdventureAction>();
  private mouseForward = false;
  private cameraForward = point(0, 1);
  private moving = false;
  private backpedaling = false;
  private shopOpen = false;
  private trade: { kind: "supplies" | "potions"; quantity: number } | null = null;
  private innOpen = false;
  private readonly events: AdventureLogEntry[] = [];
  private eventId = 0;
  private lootOpenId: string | null = null;

  constructor(options: AdventureOptions) {
    this.state = options.save === undefined ? initialState(options.archetype ?? "warrior") : readSave(options.save);
    if (options.archetype !== undefined && options.archetype !== this.state.archetype) {
      throw new Error("The saved character has a different calling.");
    }
    if (this.state.combat.phase !== "idle") for (const t of this.state.threats) if (t.aggro && t.windowCycle === 0) this.planWindow(t, this.state.combat.cycle + 1);
    this.appendLog(options.save === undefined ? "Welcome to Hearthstead. Visit Mara for potions or Rowan at the inn to rest." : "Welcome back. Your journey has been restored.");
  }

  get snapshot(): AdventureSnapshot {
    const s = this.state;
    return {
      phase: s.phase, combat: { phase: s.combat.phase, elapsedSeconds: s.combat.elapsedSeconds, cycle: s.combat.cycle,
        remainingSeconds: s.combat.phase === "idle" ? 0 : 5 - s.combat.elapsedSeconds, queued: s.combat.queued.map(e => ({ ...e })),
        reservedStamina: this.reservedStamina(), availableStamina: s.stamina - this.reservedStamina() },
      player: {
        position: { ...s.position }, cameraForward: { ...this.cameraForward }, archetype: s.archetype,
        health: s.health, maximumHealth: 100, grounded: s.position.y === 0,
        moving: this.moving, backpedaling: this.backpedaling, attackSequence: s.attackSequence,
        actionCooldown: s.actionCooldown, currentAction: s.currentAction, actionDuration: s.actionDuration, guardSeconds: s.guardSeconds,
        block: s.block, stamina: s.stamina, maximumStamina: COMBAT_RULES.stamina.maximum, staminaRecoverySeconds: s.stamina < 5 && s.combat.phase === "active" ? 5 - s.combat.elapsedSeconds : 0,
        bloodRage: s.bloodRage, rageDrainSeconds: s.rageDrainSeconds, rageDecaySeconds: s.rageDecaySeconds, inCombat: this.inCombat(), maneuver: s.maneuver?.kind ?? "none",
        maneuverSeconds: s.maneuver?.remainingSeconds ?? 0, facing: { ...(s.maneuver?.facing ?? this.cameraForward) },
      },
      threats: s.threats.map((t): ThreatView => {
        const d = definition(t.id);
        return {
          ...t, name: d.name, position: { ...t.position }, homePosition: { ...d.position },
          joinsNextWindow: t.aggro && t.joinCycle > s.combat.cycle, disposition: d.disposition, moving: s.phase !== "lost" && t.moving, maximumHealth: d.health,
          movementMode: this.movementMode(t), motionProgress: t.wolf?.motion ? 1 - t.wolf.motion.remainingSeconds / t.wolf.motion.duration : 0,
          facing: { ...(t.wolf?.facing ?? this.direction(t.position, t.aggro ? s.position : t.targetPosition)) },
          nextAttackSeconds: t.wolf?.nextAttackSeconds ?? t.remainingSeconds,
          attackOrigin: { ...(t.wolf && t.phase === "action" && t.abilityIndex === 1 ? t.wolf.attackOrigin : t.position), y: 0 },
          block: t.head?.block ?? 0, blockSeconds: t.head?.blockSeconds ?? 0, volley: t.head?.volley ?? 0, fireballs: t.head?.fireballs.map(p => ({ ...p, origin: { ...p.origin } })) ?? [],
          rootedSeconds: this.rootedSeconds(t), canStrike: this.canUseAttack(t, "strike"), canDisengage: this.canUseAttack(t, "disengage"),
          selected: t.id === s.selectedThreat, phaseDuration: this.phaseDuration(t),
          preparation: d.preparation, currentActivity: this.currentActivity(t),
          windowAction: !t.aggro ? null : t.head ? t.head.events[0] ? {
            ability: headAbility(t.head.events[0].ability, t.head.events[0].volley), offsetSeconds: t.head.events[0].offsetSeconds,
            status: t.head.events[0].status === "done" ? "resolved" : t.head.events[0].status,
          } : null : { ability: this.ability(t), offsetSeconds: t.specialOffset, status: t.specialResolved ? "resolved" : t.specialLaunched ? "active" : "pending" },
          forecast: this.forecast(t), currentAbility: this.ability(t), nextAbility: this.ability(t, true),
          intention: this.intention(t), damage: t.damage, reach: this.ability(t).range,
          benefit: d.benefit, targetPosition: { ...t.targetPosition },
        };
      }),
      loot: s.threats.filter(t => t.health === 0).map((t): CorpseLootView => ({
        sourceId: t.id, sourceName: definition(t.id).name, position: { ...t.position },
        itemName: t.id === "ritual-guardian" ? "Frost relic" : "Forest salvage",
        kind: t.id === "ritual-guardian" ? "relic" : "salvage", quantity: 1,
        available: !t.lootClaimed, reachable: this.canLoot(t),
      })),
      lootOpenId: this.lootOpenId, carriedSalvage: s.carriedSalvage,
      places: PLACES.map(p => ({ ...p, position: { ...p.position } })),
      selectedThreat: s.selectedThreat, supplies: s.supplies, cargo: s.cargo,
      resourceRemaining: s.resourceRemaining, potions: s.potions, carriedRelics: s.carriedRelics,
      bankedRelics: s.bankedRelics, presence: s.presence, ritualCalled: s.ritualCalled,
      shopOpen: this.shopOpen, trade: this.tradeView(), innOpen: this.innOpen, log: this.events.map(entry => ({ ...entry })), potionPrice: MARA_TRADE_RULES.suppliesPerPotion, potionHealing: 30, report: s.report,
    };
  }

  save(): string { return JSON.stringify({ version: 8, state: this.state }); }
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
  private recoveryFor(action: CombatAction): number { return action === "bloodRage" ? COMBAT_RULES.bloodRage.recovery : COMBAT_RULES.actionCooldown; }
  private queueAction(action: CombatAction): void {
    const s = this.state, c = s.combat, cost = COMBAT_RULES[action].cost;
    if (c.queued.length >= COMBAT_RULES.window.maximumActions) { this.report("Five moves already fill this plan.", "combat"); return; }
    if (s.stamina - this.reservedStamina() < cost) { this.report("Not enough unreserved stamina for that move.", "combat"); return; }
    if (action === "drinkPotion" && c.queued.filter(e => e.action === "drinkPotion" && e.status === "pending").length >= s.potions) { this.report("No unreserved health potion is available.", "combat"); return; }
    const previous = c.queued.at(-1);
    const earliest = c.phase === "active" ? c.elapsedSeconds + s.actionCooldown : 0;
    const offsetSeconds = Math.max(0, Math.ceil(Math.max(earliest, previous ? previous.offsetSeconds + this.recoveryFor(previous.action) : 0) - EPSILON));
    if (offsetSeconds >= 5 - EPSILON) { this.report("That move cannot fit before preparation begins.", "combat"); return; }
    c.queued.push({ id: c.nextId++, action, targetId: action === "strike" || action === "disengage" || action === "jab" ? s.selectedThreat : null,
      offsetSeconds, cost, status: "pending", reason: null });
    this.report(`${actionName(action)} queued at ${offsetSeconds.toFixed(1)} seconds.`, "combat");
    if (c.phase === "active") this.executeQueue();
  }
  setQueuedDelay(id: number, seconds: number): void {
    const c = this.state.combat, index = c.queued.findIndex(e => e.id === id), entry = c.queued[index];
    if (!entry || entry.status !== "pending") { this.report("That move has already resolved and cannot be changed.", "combat"); return; }
    const previous = c.queued[index - 1], next = c.queued[index + 1];
    const offset = (previous?.offsetSeconds ?? 0) + seconds;
    if (!Number.isInteger(seconds) || seconds < 0 || offset >= 5 - EPSILON ||
      (previous && offset < previous.offsetSeconds + this.recoveryFor(previous.action) - EPSILON) ||
      (next && next.offsetSeconds < offset + this.recoveryFor(entry.action) - EPSILON) ||
      (c.phase === "active" && offset < c.elapsedSeconds + this.state.actionCooldown - EPSILON)) {
      this.report("That timing has passed or leaves too little recovery before the next move or preparation.", "combat"); return;
    }
    entry.offsetSeconds = offset;
    this.report(`${actionName(entry.action)} moved to ${offset.toFixed(1)} seconds.`, "combat");
    if (c.phase === "active") this.executeQueue();
  }
  moveQueuedAction(id: number, offsetSeconds: number): void {
    const c = this.state.combat, entry = c.queued.find(e => e.id === id);
    if (!entry || entry.status !== "pending" || !Number.isInteger(offsetSeconds) || offsetSeconds < 0 || offsetSeconds >= 5 - EPSILON) {
      this.report("Only a pending move can be placed inside the five-second window.", "combat"); return;
    }
    const occupying = c.queued.find(e => Math.abs(e.offsetSeconds - offsetSeconds) < EPSILON && e.id !== id);
    if (occupying && occupying.status !== "pending") { this.report("That beat has already been used.", "combat"); return; }
    const candidate = c.queued.map(e => ({ ...e, offsetSeconds: e.id === id ? offsetSeconds : e.id === occupying?.id ? entry.offsetSeconds : e.offsetSeconds })).sort((a,b) => a.offsetSeconds - b.offsetSeconds);
    const now = c.phase === "active" ? c.elapsedSeconds + this.state.actionCooldown : 0;
    if (candidate.some((e,i) => (e.status === "pending" && e.offsetSeconds < now - EPSILON) || (i > 0 && e.offsetSeconds < candidate[i-1]!.offsetSeconds + this.recoveryFor(candidate[i-1]!.action) - EPSILON))) {
      this.report("That placement has passed or leaves too little recovery between moves.", "combat"); return;
    }
    c.queued = candidate;
    this.report(`${actionName(entry.action)} placed at ${offsetSeconds.toFixed(1)} seconds.`, "combat");
    if (c.phase === "active") this.executeQueue();
  }
  removeQueuedAction(id: number): void {
    const c = this.state.combat, entry = c.queued.find(e => e.id === id);
    if (!entry || entry.status !== "pending") { this.report("Only a pending move can be cancelled.", "combat"); return; }
    c.queued = c.queued.filter(e => e.id !== id);
    this.report(`${actionName(entry.action)} cancelled. Its stamina is available again.`, "combat");
  }
  clearQueuedActions(): void { this.state.combat.queued = this.state.combat.queued.filter(e => e.status !== "pending"); }
  private clearTargetQueue(id: string): void {
    if (this.state.selectedThreat === id) this.clearQueuedActions();
    else this.state.combat.queued = this.state.combat.queued.filter(e => e.status !== "pending" || e.targetId !== id);
  }
  private executeQueue(): void {
    const s = this.state, c = s.combat;
    if (c.phase !== "active" || s.phase !== "expedition" || s.health <= 0) return;
    for (const e of c.queued) {
      if (e.status !== "pending" || e.offsetSeconds > c.elapsedSeconds + EPSILON) continue;
      const target = s.threats.find(t => t.id === e.targetId);
      let reason: string | null = null;
      if (!this.ready()) reason = "You are still recovering.";
      else if (s.stamina < e.cost) reason = "Not enough stamina.";
      else if ((e.action === "strike" || e.action === "disengage") && (!target || !this.canUseAttack(target, e.action))) reason = "The target is out of reach, behind cover, or no longer available.";
      else if (e.action === "jab" && (!target || !target.active || target.health <= 0 || distance(s.position, target.position) > COMBAT_RULES.jab.range + EPSILON || !this.attackPath(target))) reason = "The target is out of reach, behind cover, or no longer available.";
      else if (e.action === "drinkPotion" && (s.potions < 1 || s.health >= 100)) reason = "No potion is available or your health is already full.";
      else if (e.action === "bloodRage" && (!this.inCombat() || s.bloodRage >= COMBAT_RULES.bloodRage.maximum)) reason = "Blood Rage needs a fight and cannot exceed three stacks.";
      if (reason) { e.status = "failed"; e.reason = reason; this.report(`${actionName(e.action)} failed: ${reason}`, "combat"); continue; }
      e.status = "executed";
      if (e.action === "strike" || e.action === "disengage") this.attack(e.action, target!);
      else {
        this.spendStamina(e.cost); this.recover(e.action, this.recoveryFor(e.action));
        if (e.action === "brace" || e.action === "guard") {
          s.guardSeconds = COMBAT_RULES[e.action].duration; s.block = COMBAT_RULES[e.action].block;
          this.report(`You gain ${s.block} block for ${s.guardSeconds} seconds.`, "combat");
        } else if (e.action === "drinkPotion") {
          const healing = Math.min(30, 100 - s.health); s.health += healing; s.potions--;
          this.report(`Your health potion restores ${healing} health.`, "combat");
        } else if (e.action === "jab") {
          this.hit(target!, COMBAT_RULES.jab.damage + s.bloodRage * 2, "jab");
        } else {
          if (s.bloodRage === 0) s.rageDrainSeconds = COMBAT_RULES.bloodRage.drainSeconds;
          s.bloodRage++; s.rageDecaySeconds = 0;
          this.report(`Blood Rage rises to ${s.bloodRage}. Melee attacks gain ${s.bloodRage * 2} damage.`, "combat");
        }
      }
    }
  }
  private canLoot(t: ThreatState): boolean {
    return this.state.phase === "expedition" && t.health === 0 && !t.lootClaimed &&
      distance(this.state.position, t.position) <= 3 + EPSILON && this.clearPath(this.state.position, t.position);
  }
  openLoot(sourceId: string): void {
    const corpse = this.state.threats.find(t => t.id === sourceId);
    this.lootOpenId = corpse && this.canLoot(corpse) ? corpse.id : null;
    if (this.lootOpenId) { this.shopOpen = false; this.innOpen = false; }
  }
  private takeLoot(): void {
    const s = this.state;
    const corpse = s.threats.find(t => t.id === this.lootOpenId);
    this.lootOpenId = null;
    if (!corpse || !this.canLoot(corpse)) return;
    corpse.lootClaimed = true;
    if (corpse.id === "ritual-guardian") {
      s.carriedRelics += 1;
      this.report("You receive loot: Frost relic × 1. Reach Hearthstead alive to keep it.");
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
        if (s.maneuver === null && s.position.y === 0 && s.verticalSpeed === 0) s.verticalSpeed = 5.5;
        break;
      case "target": {
        const nearby = s.threats.filter(t => t.active && t.health > 0 && distance(s.position, t.position) <= 15);
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
        this.shopOpen = service?.kind === "shop"; this.trade = null;
        this.innOpen = service?.kind === "inn";
        if (this.innOpen) this.report("Rowan says: Welcome to The Wayfarer's Rest. Come warm yourself by the hearth; rest is on the house.");
        else if (this.shopOpen) this.report("Mara says: A little preparation goes a long way.");
        else {
          const corpse = s.threats.filter(t => this.canLoot(t))
            .sort((a, b) => distance(s.position, a.position) - distance(s.position, b.position))[0];
          if (corpse) this.openLoot(corpse.id);
          else this.report(s.phase === "town" ? "Approach Mara to trade or Rowan at the inn to rest." : "Move beside a glinting body to search it.");
        }
        break;
      }
      case "buyPotion":
        if (!this.shopOpen || !this.near("mara", 2.5) || s.phase !== "town") {
          this.report("Talk to Mara in Hearthstead to buy a potion.");
        } else if (s.supplies < MARA_TRADE_RULES.suppliesPerPotion) {
          this.report("Not enough supplies for a health potion.");
        } else {
          s.supplies -= MARA_TRADE_RULES.suppliesPerPotion; s.potions += 1;
          this.report("You buy a health potion for 3 supplies.");
        }
        break;
      case "drinkPotion":
        if (s.phase === "expedition" && (this.inCombat() || s.threats.some(t => t.id === s.selectedThreat && t.active && t.health > 0))) { this.queueAction("drinkPotion"); break; }
        if (s.health >= 100) this.report("Your health is already full. Potion kept.");
        else if (s.potions < 1) this.report("No health potions. Visit Mara in Hearthstead.");
        else { const healing = Math.min(30, 100 - s.health); s.potions -= 1; s.health += healing; this.report(`Your health potion restores ${healing} health.`, "combat"); }
        break;
      case "rest":
        if (s.phase === "town" && this.near("inn", 2.5)) {
          const healing = 100 - s.health;
          s.health = 100;
          this.report(healing > 0 ? `You rest at The Wayfarer's Rest and recover ${healing} health.` : "Rowan says: You're already rested. May the road bring you safely home.");
        } else this.report("Visit Rowan at The Wayfarer's Rest in Hearthstead to rest.");
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
    if (t.wolf) return maulAbility();
    return ordinaryAbility(definition(t.id), t.damage);
  }
  private phaseDuration(t: ThreatState): number {
    if (t.head) return t.phase === "preparation" || t.phase === "recovery" ? 5 : t.phase === "action" ? 0.6 + (t.head.volley-1)*0.2 : 0;
    return (t.wolf ? PHASE_SECONDS : OTHER_PHASE_SECONDS)[t.phase];
  }
  private rootedSeconds(t: ThreatState): number {
    const m = this.state.maneuver;
    return t.health > 0 && t.aggro && m?.kind === "disengage" && m.targetId === t.id ? m.remainingSeconds : 0;
  }
  private attackPath(t: ThreatState): boolean {
    if (this.clearPath(this.state.position, t.position)) return true;
    // The nest occupies its own thicket; a melee hit can reach it from the edge.
    return t.id === "nest" && !this.blocked(this.state.position.x, this.state.position.z) &&
      this.state.position.z > 4 && distance(this.state.position, t.position) <= COMBAT_RULES.disengage.range + EPSILON;
  }
  private canUseAttack(t: ThreatState, action: "strike" | "disengage"): boolean {
    const s = this.state;
    return this.ready() && s.stamina >= COMBAT_RULES[action].cost && s.position.y === 0 && s.verticalSpeed === 0 &&
      t.active && t.health > 0 && distance(s.position, t.position) <= COMBAT_RULES[action].range + EPSILON && this.attackPath(t);
  }
  private attack(action: "strike" | "disengage", selected?: ThreatState): void {
    const s = this.state;
    const t = selected ?? s.threats.find(t => t.id === s.selectedThreat);
    if (!t || !this.canUseAttack(t, action)) {
      if (this.ready()) this.report("Choose a living threat within reach from clear ground.", "combat");
      return;
    }
    const length = distance(s.position, t.position);
    const facing = length > EPSILON ? point((t.position.x - s.position.x) / length, (t.position.z - s.position.z) / length) : { ...this.cameraForward };
    const amount = action === "strike" ? Math.max(0, length - COMBAT_RULES.strike.stopDistance) : -COMBAT_RULES.disengage.distance;
    const destination = point(Math.max(-12, Math.min(12, s.position.x + facing.x * amount)), Math.max(-14, Math.min(45, s.position.z + facing.z * amount)));
    this.spendStamina(COMBAT_RULES[action].cost); this.recover(action, COMBAT_RULES.actionCooldown);
    s.maneuver = { kind: action === "strike" ? "lunge" : "disengage", targetId: t.id,
      start: { ...s.position }, destination, facing, remainingSeconds: COMBAT_RULES[action].duration };
    if (action === "disengage") this.hit(t, COMBAT_RULES.disengage.damage + s.bloodRage * COMBAT_RULES.bloodRage.damagePerStack, "strike");
  }
  private hit(t: ThreatState, damage: number, verb: string): void {
    const blocked = Math.min(damage, t.head?.block ?? 0);
    if (t.head) { t.head.block -= blocked; if (t.head.block === 0) t.head.blockSeconds = 0; }
    const s = this.state, dealt = Math.min(damage - blocked, t.health);
    t.health -= dealt;
    if (t.health > 0 && !t.aggro) this.engage(t);
    if (t.wolf?.motion && this.rootedSeconds(t) > EPSILON) this.groundWolfMotion(t);
    s.attackSequence += 1; s.presence += 1;
    this.report(`You ${verb} ${definition(t.id).name} for ${dealt} damage${blocked ? ` (${blocked} absorbed by Ember Ward)` : ""}.`, "combat");
    if (t.health === 0) {
      this.clearTargetQueue(t.id);
      t.phase = "cleared"; t.remainingSeconds = 0; t.lastActionHit = false; t.aggro = false; t.moving = false;
      if (t.head) { t.head.fireballs = []; t.head.block = 0; t.head.blockSeconds = 0; }
      if (t.wolf) { t.wolf.motion = null; t.wolf.circling = false; t.position.y = 0; }
      this.report(`${definition(t.id).name} dies. ${definition(t.id).benefit}`, "combat");
      if (t.id === "ritual-guardian") {
        this.report("The guardian falls. Search its body for the frost relic, then carry it home.");
      }
    }
  }
  private gather(): void {
    const s = this.state;
    if (!this.ready()) return;
    if (!this.near("frost-cores", 3)) { this.report("Approach the frost cores in the first clearing to gather."); return; }
    if (s.resourceRemaining < 3) { this.report("No frost cores remain here this trip."); return; }
    s.resourceRemaining -= 3; s.cargo += 3; s.presence += 4; this.recover("gather", 2);
    this.report("You gather Frost cores × 3. Return alive to keep them.");
    if (s.threats.some(t => t.id === "warder" && t.health > 0)) {
      this.hurt(8, "The warder's thorns");
    }
  }
  private ritual(): void {
    const s = this.state;
    if (!this.ready()) return;
    if (!this.near("ritual-site", 3)) { this.report("Reach the deep grove to offer six frost cores."); return; }
    if (s.ritualCalled) { this.report("The guardian has already been called this trip."); return; }
    if (s.cargo < 6) { this.report("The offering needs six carried frost cores."); return; }
    const guardian = s.threats.find(t => t.id === "ritual-guardian");
    if (!guardian) throw new Error("Missing frost guardian.");
    s.cargo -= 6; s.ritualCalled = true; s.presence += 12; this.recover("ritual", 1);
    guardian.active = true; this.engage(guardian);
    this.report("Six cores offered. The frost guardian answers; carry its relic home.");
  }

  advance(seconds: number): void {
    if (!Number.isFinite(seconds) || seconds < 0) throw new Error("Elapsed time must be finite and nonnegative.");
    let remaining = seconds;
    while (remaining > EPSILON) {
      const dt = Math.min(remaining, 1 / 60, this.nextEventDelay(), this.state.combat.phase === "idle" ? Infinity : 5 - this.state.combat.elapsedSeconds);
      this.step(dt);
      remaining -= dt;
    }
  }
  private nextEventDelay(): number {
    const c = this.state.combat, delays: number[] = [];
    if (c.phase === "idle") return Infinity;
    if (c.phase === "active") for (const e of c.queued) if (e.status === "pending") delays.push(e.offsetSeconds - c.elapsedSeconds);
    for (const t of this.state.threats) {
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
    const s = this.state;
    const forward = this.mouseForward ? 1 : Number(this.held.has("forward")) - Number(this.held.has("backward"));
    const strafe = Number(this.held.has("right")) - Number(this.held.has("left"));
    const length = Math.max(1, Math.hypot(forward, strafe));
    const x = (this.cameraForward.x * forward - this.cameraForward.z * strafe) / length;
    const z = (this.cameraForward.z * forward + this.cameraForward.x * strafe) / length;
    const oldX = s.position.x, oldZ = s.position.z;
    this.movePlayer(x * 4.5 * dt, z * 4.5 * dt);
    this.moving = Math.hypot(s.position.x - oldX, s.position.z - oldZ) > EPSILON;
    this.backpedaling = this.moving && forward < 0;
    if (s.position.y > 0 || s.verticalSpeed > 0) {
      s.position.y = Math.max(0, s.position.y + s.verticalSpeed * dt - 7 * dt * dt);
      s.verticalSpeed = s.position.y > 0 ? s.verticalSpeed - 14 * dt : 0;
    }
  }
  private movePlayer(dx: number, dz: number): void {
    const p = this.state.position;
    const nextX = Math.max(-12, Math.min(12, p.x + dx)), nextZ = Math.max(-14, Math.min(45, p.z + dz));
    if (!this.blocked(nextX, nextZ)) { p.x = nextX; p.z = nextZ; }
    else {
      if (!this.blocked(nextX, p.z)) p.x = nextX;
      if (!this.blocked(p.x, nextZ)) p.z = nextZ;
    }
  }
  private moveManeuver(dt: number): void {
    const s = this.state, m = s.maneuver;
    if (!m) return;
    const duration = m.kind === "lunge" ? COMBAT_RULES.strike.duration : COMBAT_RULES.disengage.duration;
    const elapsed = Math.min(dt, m.remainingSeconds), old = { ...s.position };
    this.movePlayer((m.destination.x - m.start.x) * elapsed / duration, (m.destination.z - m.start.z) * elapsed / duration);
    m.remainingSeconds = Math.max(0, m.remainingSeconds - dt);
    const progress = 1 - m.remainingSeconds / duration;
    s.position.y = m.kind === "disengage" ? 4 * 1.2 * progress * (1 - progress) : 0;
    this.moving = distance(old, s.position) > EPSILON; this.backpedaling = m.kind === "disengage" && this.moving;
    if (m.remainingSeconds > EPSILON) return;
    s.position.y = 0; s.verticalSpeed = 0; s.maneuver = null;
    if (m.kind === "lunge") {
      const t = s.threats.find(t => t.id === m.targetId);
      if (t && t.active && t.health > 0 && distance(s.position, t.position) <= COMBAT_RULES.disengage.range + EPSILON && this.attackPath(t)) this.hit(t, COMBAT_RULES.strike.damage + s.bloodRage * COMBAT_RULES.bloodRage.damagePerStack, "lunge at");
      else this.report("Your lunge falls short.", "combat");
    }
  }
  private blocked(x: number, z: number): boolean {
    return this.barriers().some(([left, right, bottom, top]) => x > left && x < right && z >= bottom && z <= top);
  }
  private barriers(): readonly Barrier[] {
    return this.state.threats.some(t => t.id === "nest" && t.health > 0) ? [...GATE_WALLS, THICKET] : GATE_WALLS;
  }
  private clearPath(a: Position, b: Position): boolean {
    return !this.barriers().some(([left, right, bottom, top]) => {
      let enter = 0, exit = 1;
      for (const [start, end, min, max] of [[a.x, b.x, left, right], [a.z, b.z, bottom, top]] as const) {
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
  private step(dt: number): void {
    const s = this.state;
    if (s.phase === "lost") { this.moving = false; this.backpedaling = false; return; }
    const clockWasRunning = s.combat.phase !== "idle";
    if (s.maneuver) this.moveManeuver(dt); else this.move(dt);
    if (this.lootOpenId !== null && !s.threats.some(t => t.id === this.lootOpenId && this.canLoot(t))) this.lootOpenId = null;
    if (this.shopOpen && !this.near("mara", 2.5)) { this.shopOpen = false; this.trade = null; }
    if (this.innOpen && !this.near("inn", 2.5)) this.innOpen = false;
    if (s.phase === "town" && s.position.z >= 2) {
      s.phase = "expedition"; s.cargo = 0; s.carriedRelics = 0; s.carriedSalvage = 0; s.presence = 0;
      s.resourceRemaining = 12; s.ritualCalled = false;
      const fresh = newThreats();
      for (const t of fresh) {
        const previous = s.threats.find(old => old.id === t.id);
        if (previous && previous.health > 0) { t.position = { ...previous.position }; t.patrolIndex = previous.patrolIndex; t.targetPosition = { ...t.position }; }
      }
      s.threats = fresh;
      s.actionCooldown = 0; s.guardSeconds = 0; s.block = 0; this.shopOpen = false; this.trade = null; this.innOpen = false;
      this.report("You enter Frostwood. The forest is listening; Hearthstead lies behind you.");
    } else if (s.phase === "expedition" && s.position.z <= 0) {
      s.phase = "town"; s.supplies += s.cargo + s.carriedSalvage; s.bankedRelics += s.carriedRelics;
      s.cargo = 0; s.carriedRelics = 0; s.carriedSalvage = 0; s.guardSeconds = 0; s.block = 0;
      s.maneuver = null; s.position.y = 0; s.verticalSpeed = 0; this.lootOpenId = null; this.trade = null;
      for (const t of s.threats) if (t.health > 0) this.releaseThreat(t);
      s.combat = newCombat(); s.stamina = COMBAT_RULES.stamina.maximum;
      this.report("You return to Hearthstead. Cores, salvage and relics are secured. Visit the inn before your next trip.");
    }
    if (s.phase === "expedition") s.presence += (this.moving ? 0.5 : 0.1) * dt;
    s.guardSeconds = Math.max(0, s.guardSeconds - dt);
    if (s.guardSeconds <= EPSILON) { s.guardSeconds = 0; s.block = 0; }
    s.actionCooldown = Math.max(0, s.actionCooldown - dt);
    if (s.actionCooldown <= EPSILON) { s.actionCooldown = 0; s.currentAction = null; s.actionDuration = 0; }
    if (s.health > 0) this.advanceResources(dt);
    if (s.health <= 0) return;
    if (clockWasRunning && s.combat.phase !== "idle") this.advanceClock(dt);
    for (const t of s.threats) { t.moving = false; this.acquireOrRelease(t, dt); }
    if (s.combat.phase === "idle" && s.phase === "expedition") {
      const first = s.combat.queued.find(e => e.status === "pending" && (e.action === "strike" || e.action === "disengage" || e.action === "jab"));
      const target = s.threats.find(t => t.id === first?.targetId);
      if (first && target && target.health > 0 && target.active && (first.action === "jab" ? distance(s.position, target.position) <= 2 && this.attackPath(target) : (first.action === "strike" || first.action === "disengage") && this.canUseAttack(target, first.action))) this.engage(target);
    }
    this.executeQueue();
    for (const t of s.threats) if (t.aggro && t.active && t.health > 0 && s.health > 0) this.advanceThreat(t, dt);
    if (s.combat.phase !== "idle" && !this.inCombat()) { this.clearQueuedActions(); s.combat.phase = "idle"; s.combat.elapsedSeconds = 0; s.combat.queued = []; s.stamina = COMBAT_RULES.stamina.maximum; }
  }
  private advanceClock(dt: number): void {
    const c = this.state.combat;
    c.elapsedSeconds += dt;
    if (c.elapsedSeconds < 5 - EPSILON) return;
    c.elapsedSeconds = 0;
    if (c.phase === "active") {
      c.phase = "preparation";
      for (const e of c.queued) if (e.status === "pending") this.report(`${actionName(e.action)} did not fit in the active window.`, "combat");
      c.queued = []; this.state.stamina = COMBAT_RULES.stamina.maximum;
      for (const t of this.state.threats) if (t.aggro && t.health > 0) this.planWindow(t, c.cycle + 1);
    } else {
      c.phase = "active"; c.cycle++;
      for (const t of this.state.threats) if (t.aggro && t.health > 0) {
        if (t.windowCycle !== c.cycle) this.planWindow(t, c.cycle);
      }
    }
  }
  private engage(t: ThreatState): void {
    const c = this.state.combat;
    t.aggro = true; t.lastActionHit = false;
    if (c.phase === "idle") {
      c.phase = "active"; c.elapsedSeconds = 0; c.cycle++;
      t.joinCycle = c.cycle; this.planWindow(t, c.cycle, true);
    } else { t.joinCycle = c.cycle + 1; this.planWindow(t, t.joinCycle); }
  }
  private windowTime(t: ThreatState): number {
    const c = this.state.combat;
    return (c.cycle - t.windowCycle) * 10 + c.elapsedSeconds + (c.phase === "preparation" ? 5 : 0);
  }
  private planWindow(t: ThreatState, cycle: number, initial = false): void {
    if (t.windowCycle === cycle) return;
    t.windowCycle = cycle; t.specialOffset = t.wolf ? initial ? 4.65 : COMBAT_RULES.enemy.action : OTHER_PHASE_SECONDS.action;
    t.specialLaunched = false; t.specialResolved = false;
    t.phase = "preparation"; t.lastActionHit = false;
    t.damage = t.wolf ? 9 : Math.ceil(definition(t.id).damage * (1 + this.state.presence / 100));
    t.targetPosition = { ...t.position };
    if (t.wolf) { t.wolf.motion = null; t.position.y = 0; }
    if (t.head) {
      const h = t.head, ability = h.opened ? HEAD_ROTATION[h.rotationIndex]! : "ember-beam";
      h.events = [{ offsetSeconds: 0, spacing: volleySpacing(h.volley, 0), ability, remainingSeconds: 0, status: "pending", volley: h.volley, launched: 0 }];
      if (h.opened) h.rotationIndex = (h.rotationIndex + 1) % HEAD_ROTATION.length;
      h.fireballs = [];
    }
  }
  private acquireOrRelease(t: ThreatState, dt: number): void {
    if (!t.active || t.health <= 0) return;
    const d = definition(t.id), s = this.state;
    if (t.phase === "returning") { this.returnHome(t, dt); return; }
    if (!t.aggro) {
      this.patrol(t, dt);
      if (s.phase === "expedition" && s.position.z > 2 && d.disposition === "hostile" && distance(s.position, t.position) <= d.aggroRange && this.clearPath(t.position, s.position)) this.engage(t);
    } else if (s.phase !== "expedition" || s.position.z <= 2 || distance(s.position, d.position) > d.leash || distance(t.position, d.position) > d.leash) this.releaseThreat(t);
  }
  private recover(action: AdventureAction, duration: number): void {
    this.state.currentAction = action; this.state.actionDuration = duration; this.state.actionCooldown = duration;
  }
  private inCombat(): boolean {
    return this.state.phase === "expedition" && this.state.threats.some(t => t.active && t.health > 0 && t.aggro);
  }
  private spendStamina(cost: number): void {
    const s = this.state;

    s.stamina -= cost;
  }
  private advanceResources(dt: number): void {
    const s = this.state;
    if (s.bloodRage === 0) { s.rageDrainSeconds = 0; s.rageDecaySeconds = 0; return; }
    s.rageDrainSeconds -= dt;
    if (s.rageDrainSeconds <= EPSILON) {
      s.rageDrainSeconds += COMBAT_RULES.bloodRage.drainSeconds;
      this.hurt(s.bloodRage * COMBAT_RULES.bloodRage.drainPerStack, "Blood Rage", true);
      if (s.health <= 0) return;
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
    this.clearTargetQueue(t.id); t.joinCycle = 0; t.windowCycle = 0; t.specialLaunched = false; t.specialResolved = false;
    t.aggro = false; t.remainingSeconds = 0; t.lastActionHit = false; t.moving = false; t.abilityIndex = 0;
    t.damage = definition(t.id).damage;
    if (t.wolf) {
      t.wolf.motion = null; t.wolf.circling = false;
      t.wolf.nextAttackSeconds = COMBAT_RULES.enemy.preparation; t.position.y = 0;
      t.damage = 9;
    }
    if (t.head) t.head = newHead();
    const d = definition(t.id);
    t.phase = distance(t.position, d.position) > EPSILON ? "returning" : d.patrol ? "patrol" : "dormant";
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
    const destination = route[t.patrolIndex % route.length]!;
    this.moveThreat(t, destination, dt);
    if (distance(t.position, destination) <= EPSILON) t.patrolIndex = (t.patrolIndex + 1) % route.length;
    t.targetPosition = { ...t.position };
  }
  private pursue(t: ThreatState, dt: number): void {
    const d = definition(t.id), gap = distance(t.position, this.state.position) - this.ability(t).range;
    if (gap > EPSILON && d.speed > 0) this.moveThreat(t, this.state.position, Math.min(dt, gap / d.speed));
    t.targetPosition = { ...t.position };
  }
  private moveThreat(t: ThreatState, destination: Position, dt: number, speed = definition(t.id).speed): void {
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
    if (t.head) { this.advanceHead(t, dt); return; }
    if (t.wolf) { this.advanceWolf(t, dt); return; }
    const at = this.windowTime(t), eligible = this.state.combat.phase === "active" && t.windowCycle === this.state.combat.cycle;
    if (!t.specialLaunched) {
      this.pursue(t, dt); t.phase = "preparation"; t.remainingSeconds = Math.max(0, t.specialOffset - at);
      if (eligible && at >= -EPSILON) {
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
    return c.phase === "idle" ? 0 : (c.phase === "preparation" ? 5 : 10) - c.elapsedSeconds;
  }
  private currentActivity(t: ThreatState): ThreatForecastEntry | null {
    if (t.health <= 0 || !t.active || !t.aggro) return null;
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
    const at = this.windowTime(t);
    if (t.head) {
      const h = t.head;
      const future: ThreatForecastEntry[] = h.events.filter(e => e.status === "pending").map(e => ({ ability: headAbility(e.ability, e.volley), remainingSeconds: Math.max(0, e.offsetSeconds - at), status: !h.opened && at >= 0 ? "stored" : "pending" }));
      if (future.length === 2) return future;
      let volley = h.volley + h.events.filter(e => e.ability === "kindle" && e.status === "pending").length;
      for (let index = 0; future.length < 2; index++) {
        const ability = HEAD_ROTATION[(h.rotationIndex + index) % HEAD_ROTATION.length]!;
        future.push({ ability: headAbility(ability, volley), remainingSeconds: (index + 1) * 10 - at, status: "pending" });
        if (ability === "kindle") volley++;
      }
      return future;
    }
    return [{ ability: this.ability(t), remainingSeconds: Math.max(0, t.specialResolved ? 10 - at + (t.wolf ? 0.65 : 0.35) : t.specialOffset - at), status: "pending" }];
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
    this.report("Ember head raises a ward: 6 block for 2 seconds.", "combat");
  }
  private advanceHead(t: ThreatState, dt: number): void {
    const h = t.head!, c = this.state.combat, at = this.windowTime(t);
    const eligible = c.phase === "active" && t.windowCycle === c.cycle;
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
          if (e.launched === 1) { t.actionSequence++; this.report(`Ember head prepares ${e.volley} fireball${e.volley === 1 ? "." : "s."}`, "combat"); }
        }
        if (eligible && at >= e.offsetSeconds + (e.volley - 1) * e.spacing - EPSILON) e.status = "done";
      } else if (e.status === "pending" && eligible && at >= e.offsetSeconds - EPSILON) {
        if (e.ability === "ember-beam") {
          if (!this.headInRange(t)) continue;
          h.opened = true; e.status = "done"; this.hurt(COMBAT_RULES.head.beamDamage, "Ember head — Ember Beam");
        } else if (e.ability === "ember-ward") {
          if (!h.opened && !this.headInRange(t)) continue;
          this.headWard(t); e.status = "active";
        } else { h.volley++; e.status = "done"; this.report(`Ember head grows stronger: ${h.volley} fireballs per volley.`, "combat"); }
        t.actionSequence++;
      } else if (e.status === "active" && e.ability === "ember-ward" && at >= e.offsetSeconds + COMBAT_RULES.head.wardDuration - EPSILON) e.status = "done";
    }
    for (const ball of h.fireballs) {
      ball.remainingSeconds = Math.max(0, ball.impactOffset - at);
      if (eligible && ball.impactOffset <= at + EPSILON && this.headInRange(t)) this.hurt(ball.damage, "Ember head — Fireball");
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
    t.phase = "action"; t.abilityIndex = 1; t.damage = 9; t.lastActionHit = false;
    t.remainingSeconds = COMBAT_RULES.enemy.action;
    if (this.rootedSeconds(t) > EPSILON) this.groundWolfMotion(t);
  }
  private groundWolfMotion(t: ThreatState): void {
    const motion = t.wolf?.motion;
    if (!motion) return;
    motion.start = point(t.position.x, t.position.z); motion.destination = { ...motion.start };
    if (motion.kind === "lunge") t.targetPosition = { ...motion.destination };
  }
  private moveWolfMotion(t: ThreatState, dt: number): void {
    const w = t.wolf, motion = w?.motion;
    if (!w || !motion) return;
    const old = { ...t.position };
    motion.remainingSeconds = Math.max(0, motion.remainingSeconds - dt);
    const progress = 1 - motion.remainingSeconds / motion.duration;
    t.position.x = motion.start.x + (motion.destination.x - motion.start.x) * progress;
    t.position.z = motion.start.z + (motion.destination.z - motion.start.z) * progress;
    const height = motion.kind === "hop" ? COMBAT_RULES.wolf.hopHeight : COMBAT_RULES.wolf.lungeHeight;
    t.position.y = 4 * height * progress * (1 - progress);
    t.moving = Math.hypot(t.position.x - old.x, t.position.y - old.y, t.position.z - old.z) > EPSILON;
    if (motion.kind === "hop") w.facing = this.direction(t.position, this.state.position);
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
      w.rng = (Math.imul(w.rng, 1664525) + 1013904223) >>> 0;
      const side = w.rng >= 0x80000000 ? 1 : -1, facing = w.facing;
      const length = COMBAT_RULES.wolf.hopDistance / Math.SQRT2;
      const destination = this.reachableEndpoint(t.position, point(
        t.position.x + (facing.x - side * facing.z) * length,
        t.position.z + (facing.z + side * facing.x) * length));
      w.motion = { kind: "hop", start: point(t.position.x, t.position.z), destination,
        remainingSeconds: COMBAT_RULES.wolf.hopDuration, duration: COMBAT_RULES.wolf.hopDuration };
      this.moveWolfMotion(t, dt);
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
    const eligible = c.phase === "active" && t.windowCycle === c.cycle;
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
    t.lastActionHit = distance(this.state.position, t.targetPosition) <= this.ability(t).range + EPSILON &&
      (t.id === "nest" || this.clearPath(t.targetPosition, this.state.position));
    t.actionSequence += 1;
    if (t.lastActionHit) this.hurt(t.damage, `${definition(t.id).name} — ${this.intention(t)}`);
    else this.report(`${definition(t.id).name} — ${this.intention(t)} misses you.`, "combat");
  }
  private hurt(damage: number, source: string, bypassBlock = false): void {
    const s = this.state;
    const blocked = !bypassBlock && s.guardSeconds > EPSILON ? Math.min(damage, s.block) : 0;
    s.block -= blocked;
    if (s.block === 0) s.guardSeconds = 0;
    const taken = Math.min(s.health, damage - blocked);
    s.health -= taken;
    this.report(`${source} hits you for ${taken} damage${blocked > 0 ? ` (${blocked} blocked by Brace)` : ""}.`, "combat");
    if (s.health > 0) return;
    s.maneuver = null; s.block = 0; s.guardSeconds = 0; s.combat = newCombat();
    s.phase = "lost"; s.cargo = 0; s.carriedRelics = 0; s.carriedSalvage = 0; s.supplies = 0; s.bankedRelics = 0;
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
function readSave(serialized: string): State {
  let parsed: unknown;
  try { parsed = JSON.parse(serialized); }
  catch { throw new Error("Invalid adventure save: unreadable saved data."); }
  const root = record(parsed);
  if (root.version !== 1 && root.version !== 2 && root.version !== 3 && root.version !== 4 && root.version !== 5 && root.version !== 6 && root.version !== 7 && root.version !== 8) throw new Error("Unsupported adventure save version.");
  const v8 = root.version === 8, v7 = root.version === 7 || v8;
  const current = root.version === 4 || root.version === 5 || root.version === 6 || v7, latest = root.version === 5 || root.version === 6 || v7, headVersion = root.version === 6 || v7;
  const s = record(root.state), p = record(s.position);
  if (!Array.isArray(s.threats) || s.threats.length !== DEFINITIONS.length) throw new Error("Invalid adventure save: missing threats.");
  const threats: ThreatState[] = s.threats.map((value: unknown) => {
    const t = record(value);
    const id = choice(t.id, DEFINITIONS.map(d => d.id));
    const phase = choice(t.phase, root.version === 1
      ? ["dormant", "preparation", "action", "recovery", "cleared"] as const
      : current ? ["dormant", "patrol", "approach", "preparation", "action", "recovery", "returning", "cleared"] as const
      : ["dormant", "approach", "preparation", "action", "recovery", "returning", "cleared"] as const);
    const health = number(t.health, 0, definition(id).health);
    const active = boolean(t.active);
    if ((health === 0) !== (phase === "cleared") || (!active && phase !== "dormant") || (id !== "ritual-guardian" && !active)) {
      throw new Error("Invalid adventure save: inconsistent threat.");
    }
    const head = headVersion && id === "scout" ? readHead(t.head, v7, v8) : null;
    const maxDuration = v8 ? 10 : v7 && id === "scout" ? 10 : headVersion ? id === "scout" ? phase === "action" ? 0.6 + ((head?.volley ?? 1)-1)*0.2 : phase === "preparation" || phase === "recovery" ? 5 : 0 : (id === "patrol" ? PHASE_SECONDS : OTHER_PHASE_SECONDS)[phase] : (current && id === "scout" ? PHASE_SECONDS : OTHER_PHASE_SECONDS)[phase];
    const result: ThreatState = { id, health, active, phase,
      joinCycle: v8 ? number(t.joinCycle, 0, Number.MAX_SAFE_INTEGER, true) : 0,
      windowCycle: v8 ? number(t.windowCycle, 0, Number.MAX_SAFE_INTEGER, true) : 0,
      specialOffset: v8 ? number(t.specialOffset, 0, 4.99) : 0,
      specialLaunched: v8 ? boolean(t.specialLaunched) : false, specialResolved: v8 ? boolean(t.specialResolved) : false,
      remainingSeconds: number(t.remainingSeconds, 0, maxDuration),
      actionSequence: number(t.actionSequence, 0, Number.MAX_SAFE_INTEGER, true), lastActionHit: boolean(t.lastActionHit),
      damage: number(t.damage, headVersion && id === "scout" || !current && id === "scout" ? 0 : definition(id).damage, Number.MAX_SAFE_INTEGER, true),
      position: root.version === 1 ? { ...definition(id).position } : groundPosition(t.position, latest ? COMBAT_RULES.wolf.lungeHeight : 0),
      targetPosition: root.version === 1 ? { ...definition(id).position } : groundPosition(t.targetPosition),
      aggro: root.version === 1 ? phase !== "dormant" && phase !== "cleared" : boolean(t.aggro),
      lootClaimed: root.version === 3 || current ? boolean(t.lootClaimed) : id === "ritual-guardian" && health === 0,
      patrolIndex: current ? number(t.patrolIndex, 0, !headVersion && id === "scout" ? 4 : definition(id).patrol?.length ?? 1, true) : 1,
      moving: current ? boolean(t.moving) : false,
      abilityIndex: current ? number(t.abilityIndex, 0, headVersion ? id === "scout" ? 2 : id === "patrol" ? 1 : 0 : id === "scout" ? 1 : 0, true) : 0,
      wolf: latest ? id === (headVersion ? "patrol" : "scout") ? readWolf(t.wolf, v8) : null : id === "scout" ? newWolf() : null, head,
    };
    if (!current) {
      // Old action saves already applied damage at commitment; never replay that hit.
      if (phase === "action") { result.phase = "recovery"; result.remainingSeconds = id === "scout" ? 2 : 2.65; }
      if (id === "scout") {
        result.abilityIndex = ["preparation", "action", "recovery"].includes(phase) ? 1 : 0;
        result.damage = result.abilityIndex === 1 ? 9 : 4;
        if (result.phase === "recovery") result.remainingSeconds = Math.min(result.remainingSeconds, 2);
      }
      if (phase === "dormant" && definition(id).patrol) result.phase = "patrol";
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
      result.abilityIndex = 1; result.damage = 9;
    }
    if (!headVersion && (id === "scout" || id === "patrol")) {
      result.head = id === "scout" ? newHead() : null; result.wolf = id === "patrol" ? newWolf() : null;
      result.abilityIndex = id === "scout" ? 0 : 1; result.damage = id === "scout" ? 3 : 9; result.position.y = 0;
      if (result.health > 0) { result.phase = result.aggro ? "preparation" : definition(id).patrol ? "patrol" : "dormant"; result.remainingSeconds = result.aggro ? 5 : 0; }
    }
    if (!v7 && id === "scout" && result.head && result.health > 0) {
      const h = result.head;
      h.fireballs = []; h.opened = result.aggro; h.rotationIndex = 0;
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
  const state: State = {
    phase: choice(s.phase, ["town", "expedition", "lost"] as const),
    archetype: choice(s.archetype, ["warrior", "mage", "hunter"] as const),
    position: { x: number(p.x, -12, 12), y: number(p.y, 0, 2), z: number(p.z, -14, 45) },
    verticalSpeed: number(s.verticalSpeed, -6, 5.5), health: number(s.health, 0, 100),
    supplies: number(s.supplies, 0, Number.MAX_SAFE_INTEGER, true), cargo: number(s.cargo, 0, 12, true),
    resourceRemaining: number(s.resourceRemaining, 0, 12, true), potions: number(s.potions, 0, Number.MAX_SAFE_INTEGER, true),
    carriedRelics: number(s.carriedRelics, 0, 1, true), bankedRelics: number(s.bankedRelics, 0, Number.MAX_SAFE_INTEGER, true),
    carriedSalvage: root.version === 3 || current ? number(s.carriedSalvage, 0, DEFINITIONS.length - 1, true) : 0,
    presence: number(s.presence), ritualCalled: boolean(s.ritualCalled), actionCooldown: number(s.actionCooldown, 0, 2),
    currentAction: v7 && s.currentAction !== null ? choice(s.currentAction, ["strike", "disengage", "brace", "bloodRage", "jab", "guard", "drinkPotion", "gather", "ritual"] as const) : null,
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
    selectedThreat: choice(s.selectedThreat, DEFINITIONS.map(t => t.id)), report: text(s.report), threats, combat: v8 ? readCombat(s.combat) : newCombat(),
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
  const reserved = state.combat.queued.filter(e => e.status === "pending").reduce((sum,e) => sum + e.cost, 0);
  if (state.combat.queued.filter(e => e.status === "pending" && e.action === "drinkPotion").length > state.potions || reserved > state.stamina || (state.combat.phase !== "idle" && state.phase !== "expedition") || state.combat.queued.some(e => e.status === "pending" && state.combat.phase === "active" && e.offsetSeconds < state.combat.elapsedSeconds - EPSILON)) throw new Error("Invalid adventure save: inconsistent combat plan.");
  return state;
}

function readWolf(value: unknown, v8 = false): WolfState {
  const w = record(value), f = record(w.facing);
  let motion: WolfMotion | null = null;
  if (w.motion !== null) {
    const m = record(w.motion), kind = choice(m.kind, ["hop", "lunge"] as const);
    const duration = kind === "hop" ? COMBAT_RULES.wolf.hopDuration : COMBAT_RULES.enemy.action;
    motion = { kind, start: groundPosition(m.start), destination: groundPosition(m.destination),
      remainingSeconds: number(m.remainingSeconds, 0, duration), duration: number(m.duration, duration, duration) };
  }
  return { rng: number(w.rng, 0, 0xffffffff, true),
    facing: { x: number(f.x, -1, 1), y: number(f.y, 0, 0), z: number(f.z, -1, 1) }, motion,
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

function readHead(value: unknown, v7: boolean, v8 = false): HeadState {
  const h = record(value);
  if (!Array.isArray(h.fireballs)) throw new Error("Invalid adventure save: missing fireballs.");
  const events: HeadEvent[] = [];
  if (v8) {
    if (!Array.isArray(h.events) || h.events.length > 1) throw new Error("Invalid adventure save: missing announced moves.");
    for (const value of h.events) {
      const e = record(value), volley = number(e.volley, 1, Number.MAX_SAFE_INTEGER, true);
      events.push({ offsetSeconds: v8 ? number(e.offsetSeconds, 0, 4.99) : 0, spacing: v8 ? number(e.spacing, 0, 0.2) : 0.2, ability: choice(e.ability, ["ember-beam", "fireball", "ember-ward", "kindle"] as const),
        remainingSeconds: number(e.remainingSeconds, v8 ? -5 : -(volley - 1) * COMBAT_RULES.head.fireballSpacing - 1, 15),
        status: choice(e.status, ["pending", "active", "done"] as const), volley, launched: number(e.launched, 0, volley, true) });
    }
  }
  return { opened: v7 ? boolean(h.opened) : false, rotationIndex: v8 ? number(h.rotationIndex, 0, HEAD_ROTATION.length - 1, true) : 0, events,
    block: number(h.block,0,6), blockSeconds: number(h.blockSeconds,0,5), volley: number(h.volley,1,Number.MAX_SAFE_INTEGER,true),
    projectileSequence: number(h.projectileSequence,0,Number.MAX_SAFE_INTEGER,true),
    fireballs: h.fireballs.map(value => { const p=record(value); return {impactOffset:v8?number(p.impactOffset,0,4.99):0,id:number(p.id,1,Number.MAX_SAFE_INTEGER,true),origin:groundPosition(p.origin),remainingSeconds:number(p.remainingSeconds,0,Number.MAX_SAFE_INTEGER),duration:number(p.duration,0.9,0.9),damage:number(p.damage,3,3)}; }) };
}

function headAbility(id: HeadAbilityId, volley: number): ThreatAbilityView {
  if (id === "ember-beam") return { id, name: "Ember Beam", description: "Its single opening action deals 1 damage within 10 metres. Block absorbs it; cover and leaving reach prevent it. A joining head waits for the next shared active opening.", damage: 1, range: 10, noticeSeconds: 0 };
  if (id === "ember-ward") return { id, name: "Ember Ward", description: "Absorbs 6 damage for 2 seconds. The shield rises at its scheduled active opening and persists while you act, then expires.", damage: 0, range: 10, noticeSeconds: 5 };
  if (id === "kindle") return { id, name: "Kindle", description: "Prepares during the shared 5-second preparation, then adds one fireball at the active opening. Use the unshielded active beats to attack. No enemy attack deals damage during preparation.", damage: 0, range: 0, noticeSeconds: 5 };
  return { id, name: `Fireball ×${volley}`, description: `${volley} homing fireball${volley === 1 ? "" : "s"}, 3 damage each. First impact lands at the announced time; further impacts follow up to 0.2 seconds apart, closer when needed to finish before preparation. Brace around impact. Cover or leaving 10-metre reach prevents damage; defeating the head extinguishes its fireballs.`, damage: COMBAT_RULES.head.fireballDamage * volley, range: 10, noticeSeconds: 5 };
}
function maulAbility(): ThreatAbilityView {
  return { id: "maul", name: "Lunging Maul", description: "Leaps up to 8 metres; landing is fixed at takeoff and impact follows 0.65 seconds later within 3 metres. First engagement warns for 4 seconds, then lands at 4.65. Later leaps start at the shared active opening and land at 0.65. Recovers for 2 seconds. Additional hounds join the next opening.", damage: 9, range: 3, noticeSeconds: 5 };
}
function ordinaryAbility(d: ThreatDefinition, damage = d.damage): ThreatAbilityView {
  return { id: d.id, name: d.intention, description: `${d.preparation}. Previews its strike during shared preparation. At each active opening, commits the marked ground and strikes 0.35 seconds later; recovers for 2.65 seconds. Additional enemies join the next active opening. Damage grows with the forest's attention and is fixed when preparation starts.`, damage, range: d.reach, noticeSeconds: 3 };
}
export function getMonsterLore(): readonly MonsterLoreEntry[] {
  return DEFINITIONS.map(d => {
    if (d.behavior === "head") return {
      id: d.id, name: d.name, health: d.health, disposition: d.disposition,
      description: "A floating fire spirit guarding the first clearing. Notices you within 6 metres and pursues while you remain within 14 metres of its home.",
      opener: "Stored Ember Beam: 1 damage at its first active opening within 10 metres. A joining head waits for the next shared opening. This is its only action in that window.",
      abilities: [headAbility("ember-beam", 1), headAbility("fireball", 1), headAbility("ember-ward", 1), headAbility("kindle", 1)],
      sequences: HEAD_ROTATION.map((ability, index) => ({ name: `Window ${index + 1}`, abilityIds: [ability], offsetsSeconds: [0], description: "After its opening Beam, repeats Fireball, then Ember Ward, then Kindle: one ability per active window. All enemies share 5 seconds active and 5 seconds preparation. Kindle adds one projectile to every later Fireball. Volley impacts stay within the active window, at most 0.2 seconds apart." })),
      strategy: "Wait out the 2-second ward, or use its shielded beats to heal or gain Blood Rage. Attack during the remaining active beats. Time Brace for fireball impacts. Endless defense loses as volleys grow; Blood Rage speeds the kill but drains your health.",
    };
    if (d.behavior === "wolf") return {
      id: d.id, name: d.name, health: d.health, disposition: d.disposition,
      description: "Patrols the deeper western trail. Notices you within 6 metres and pursues within 30 metres of its home. Beyond 5.5 metres it approaches in diagonal hops; nearby it circles at about 4.5 metres.",
      opener: "On first engagement, its sole Maul lands at active offset 4.65. A joining hound approaches immediately and waits for the next shared active opening; Maul then lands at offset 0.65.",
      abilities: [maulAbility(), { id: "hop-left", name: "Left diagonal hop", description: "Approaches diagonally left by up to 2.8 metres over 0.5 seconds when farther than 5.5 metres. Faces you and respects obstacles.", damage: 0, range: 0, noticeSeconds: 0 }, { id: "hop-right", name: "Right diagonal hop", description: "Approaches diagonally right by up to 2.8 metres over 0.5 seconds when farther than 5.5 metres. Faces you and respects obstacles.", damage: 0, range: 0, noticeSeconds: 0 }],
      sequences: [
        { name: "Repeated Maul", abilityIds: ["maul"], offsetsSeconds: [0.65], description: "After the first encounter window, each shared active opening starts Maul, landing 0.65 seconds later. All enemies share 5 seconds active, then 5 seconds preparation." },
        { name: "Left approach", abilityIds: ["hop-left"], offsetsSeconds: [0], probability: 0.5, description: "Each new approach hop independently chooses left or right with equal probability; the saved choice resumes unchanged." },
        { name: "Right approach", abilityIds: ["hop-right"], offsetsSeconds: [0], probability: 0.5, description: "Each new approach hop independently chooses left or right with equal probability; any sequence of left and right hops is possible." },
      ],
      strategy: "Disengage roots the hound while you leap away. Leave the committed landing before impact, then strike during recovery.",
    };
    return {
      id: d.id, name: d.name, health: d.health, disposition: d.disposition,
      description: d.id === "nest" ? "A neutral thicket nest. Attacks only when disturbed; defeating it opens the eastern passage." : d.id === "warder" ? "Guards the frost cores. Its living thorns deal 8 damage whenever you gather; defeating it removes this hazard." : "Appears when six frost cores are offered in the deep grove. Defeat it and search the body for its relic, then return home alive.",
      opener: `Shows ${d.intention} immediately on engagement; commits at its first shared active opening${d.speed === 0 ? "; remains rooted" : "; approaches first when farther away"}.`,
      abilities: [ordinaryAbility(d), ...(d.id === "warder" ? [{ id: "harvest-thorns", name: "Gathering thorns", description: "While the warder lives, gathering frost cores deals 8 damage. Brace can absorb it. This happens only when you gather.", damage: 8, range: 0, noticeSeconds: 0 }] : [])],
      sequences: [{ name: `Repeated ${d.intention}`, abilityIds: [d.id], offsetsSeconds: [0.35], description: "Always the same move: previews during the shared 5-second preparation, commits at the next active opening, strikes 0.35 seconds later, then recovers for 2.65 seconds. No random permutations." }],
      strategy: `Leave the marked ground before the strike lands, or Brace shortly before impact. Attack during recovery.${d.id === "warder" ? " Clear it before gathering to avoid the thorns." : ""}`,
    };
  });
}

function actionName(action: CombatAction): string { return ({ strike: "Lunge", brace: "Block", disengage: "Disengage", bloodRage: "Blood Rage", jab: "Jab", guard: "Guard", drinkPotion: "Health potion" } as const)[action]; }

function volleySpacing(volley: number, offset: number): number { return volley <= 1 ? 0.2 : Math.min(0.2, (4.99 - offset) / (volley - 1)); }

function readCombat(value: unknown): CombatState {
  const c = record(value);
  if (!Array.isArray(c.queued) || c.queued.length > 5) throw new Error("Invalid adventure save: invalid plan size.");
  const queued: QueueEntry[] = c.queued.map(value => {
    const e = record(value), action = choice(e.action, ["strike", "brace", "disengage", "bloodRage", "jab", "guard", "drinkPotion"] as const);
    const status = choice(e.status, ["pending", "executed", "failed"] as const), reason = e.reason === null ? null : text(e.reason);
    const targetId = e.targetId === null ? null : choice(e.targetId, DEFINITIONS.map(t => t.id));
    if ((["strike", "disengage", "jab"].includes(action)) !== (targetId !== null) || (status === "failed") !== (reason !== null)) throw new Error("Invalid adventure save: inconsistent queued move.");
    return { id: number(e.id, 1, Number.MAX_SAFE_INTEGER, true), action, targetId, offsetSeconds: number(e.offsetSeconds, 0, 4, true), cost: number(e.cost, COMBAT_RULES[action].cost, COMBAT_RULES[action].cost), status, reason };
  });
  if (new Set(queued.map(e => e.id)).size !== queued.length || queued.some((e,i) => i > 0 && e.offsetSeconds < queued[i-1]!.offsetSeconds + (queued[i-1]!.action === "bloodRage" ? 2 : 1) - EPSILON)) throw new Error("Invalid adventure save: overlapping queued moves.");
  const nextId = number(c.nextId, 1, Number.MAX_SAFE_INTEGER, true);
  if (queued.some(e => e.id >= nextId)) throw new Error("Invalid adventure save: invalid move identity.");
  return { phase: choice(c.phase, ["idle", "active", "preparation"] as const), elapsedSeconds: number(c.elapsedSeconds, 0, 5 - EPSILON), cycle: number(c.cycle, 0, Number.MAX_SAFE_INTEGER, true), queued, nextId };
}
