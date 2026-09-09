import type { CharacterArchetype } from "../host/character-profile.js";
import type {
  AdventureAction, AdventureGame, AdventureOptions, AdventureSnapshot, AdventureLogEntry,
  CorpseLootView, PlaceView, Position, ThreatPhase, ThreatView, ThreatAbilityView,
} from "./adventure-types.js";

type Vector = { x: number; y: number; z: number };
type Phase = AdventureSnapshot["phase"];
export const COMBAT_RULES = {
  actionCooldown: 1,
  strike: { damage: 9, range: 6.5, stopDistance: 1.5, duration: 0.25, cooldown: 2 },
  disengage: { damage: 6, range: 3.5, distance: 5, duration: 0.8, cooldown: 6 },
  brace: { block: 5, duration: 5, cooldown: 7 },
  enemy: { preparation: 5, action: 0.65, recovery: 2 },
} as const;
interface Maneuver {
  kind: "lunge" | "disengage"; targetId: string; remainingSeconds: number;
  start: Vector; destination: Vector; facing: Vector;
}
interface ThreatDefinition {
  id: string; name: string; position: Position; health: number;
  preparation: string; intention: string; damage: number; reach: number; benefit: string;
  disposition: ThreatView["disposition"]; aggroRange: number; leash: number; speed: number; patrol?: readonly Position[];
}
interface ThreatState {
  id: string; health: number; active: boolean; phase: ThreatPhase;
  remainingSeconds: number; actionSequence: number; lastActionHit: boolean; damage: number;
  position: Vector; targetPosition: Vector; aggro: boolean; lootClaimed: boolean;
  patrolIndex: number; moving: boolean; abilityIndex: number;
}
interface State {
  phase: Phase; archetype: CharacterArchetype; position: Vector; verticalSpeed: number;
  health: number; supplies: number; cargo: number; resourceRemaining: number;
  potions: number; carriedRelics: number; bankedRelics: number; presence: number; carriedSalvage: number;
  ritualCalled: boolean; actionCooldown: number; guardSeconds: number;
  block: number; cooldowns: { strike: number; disengage: number; brace: number }; maneuver: Maneuver | null;
  attackSequence: number; selectedThreat: string; report: string; threats: ThreatState[];
}

const point = (x: number, z: number): Vector => ({ x, y: 0, z });
const DEFINITIONS: readonly ThreatDefinition[] = [
  { id: "scout", disposition: "hostile", aggroRange: 6, leash: 14, speed: 4.2, name: "Ash hound", position: point(-3, 10), health: 54,
    patrol: [point(-3,10), point(-6,10), point(-6,14), point(-3,14)],
    preparation: "Drawing back to pounce", intention: "Bite", damage: 4, reach: 2,
    benefit: "Clear the hound to make the first clearing safer." },
  { id: "nest", disposition: "neutral", aggroRange: 0, leash: 7, speed: 0, name: "Thorn nest", position: point(5, 20), health: 24,
    preparation: "Rousing the swarm", intention: "Swarm rush", damage: 7, reach: 3,
    benefit: "Clear the nest to open the passage through the thicket." },
  { id: "warder", disposition: "hostile", aggroRange: 8, leash: 11, speed: 2, name: "Root warder", position: point(-3, 30), health: 30,
    preparation: "Raising thorn wards", intention: "Thorn lash", damage: 8, reach: 5,
    benefit: "Clear the warder to gather frost cores without cutting thorns." },
  { id: "patrol", disposition: "hostile", aggroRange: 10, leash: 13, speed: 3.2, name: "Ash hound patrol", position: point(3, 35), health: 36,
    patrol: [point(3,35), point(6,35), point(6,38), point(3,38)],
    preparation: "Sweeping the trail", intention: "Charging the company", damage: 10, reach: 7,
    benefit: "Clear the patrol to prevent ambushes during retreat." },
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
const newThreats = (): ThreatState[] => DEFINITIONS.map(t => ({
  id: t.id, health: t.health, active: t.id !== "ritual-guardian", phase: t.patrol ? "patrol" : "dormant",
  remainingSeconds: 0, actionSequence: 0, lastActionHit: false, damage: t.damage,
  position: { ...t.position }, targetPosition: { ...t.position }, aggro: false,
  lootClaimed: false, patrolIndex: 1, moving: false, abilityIndex: 0,
}));
function initialState(archetype: CharacterArchetype): State {
  return {
    phase: "town", archetype, position: point(0, -8), verticalSpeed: 0, health: 100,
    supplies: 15, cargo: 0, resourceRemaining: 12, potions: 0, carriedRelics: 0,
    bankedRelics: 0, carriedSalvage: 0, presence: 0, ritualCalled: false, actionCooldown: 0,
    guardSeconds: 0, block: 0, cooldowns: { strike: 0, disengage: 0, brace: 0 }, maneuver: null,
    attackSequence: 0, selectedThreat: "scout",
    report: "Visit Mara for potions, then take the north gate. Gather frost cores and return alive.",
    threats: newThreats(),
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
  private innOpen = false;
  private readonly events: AdventureLogEntry[] = [];
  private eventId = 0;
  private lootOpenId: string | null = null;

  constructor(options: AdventureOptions) {
    this.state = options.save === undefined ? initialState(options.archetype ?? "warrior") : readSave(options.save);
    if (options.archetype !== undefined && options.archetype !== this.state.archetype) {
      throw new Error("The saved character has a different calling.");
    }
    this.appendLog(options.save === undefined ? "Welcome to Hearthstead. Visit Mara for potions or Rowan at the inn to rest." : "Welcome back. Your journey has been restored.");
  }

  get snapshot(): AdventureSnapshot {
    const s = this.state;
    return {
      phase: s.phase,
      player: {
        position: { ...s.position }, cameraForward: { ...this.cameraForward }, archetype: s.archetype,
        health: s.health, maximumHealth: 100, grounded: s.position.y === 0,
        moving: this.moving, backpedaling: this.backpedaling, attackSequence: s.attackSequence,
        actionCooldown: s.actionCooldown, guardSeconds: s.guardSeconds,
        block: s.block, cooldowns: { ...s.cooldowns }, maneuver: s.maneuver?.kind ?? "none",
        maneuverSeconds: s.maneuver?.remainingSeconds ?? 0, facing: { ...(s.maneuver?.facing ?? this.cameraForward) },
      },
      threats: s.threats.map((t): ThreatView => {
        const d = definition(t.id);
        return {
          ...t, name: d.name, position: { ...t.position }, homePosition: { ...d.position },
          disposition: d.disposition, moving: s.phase !== "lost" && t.moving, maximumHealth: d.health,
          rootedSeconds: this.rootedSeconds(t), canStrike: this.canUseAttack(t, "strike"), canDisengage: this.canUseAttack(t, "disengage"),
          selected: t.id === s.selectedThreat, phaseDuration: this.phaseDuration(t),
          preparation: d.preparation, currentAbility: this.ability(t), nextAbility: this.ability(t, true),
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
      shopOpen: this.shopOpen, innOpen: this.innOpen, log: this.events.map(entry => ({ ...entry })), potionPrice: 3, potionHealing: 30, report: s.report,
    };
  }

  save(): string { return JSON.stringify({ version: 4, state: this.state }); }
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
    this.state.selectedThreat = id;
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
    if (action === "closeShop") { this.shopOpen = false; return; }
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
        if (next) s.selectedThreat = next.id;
        break;
      }
      case "strike": this.attack("strike"); break;
      case "disengage": this.attack("disengage"); break;
      case "brace":
        if (this.ready() && s.cooldowns.brace <= EPSILON) {
          s.guardSeconds = COMBAT_RULES.brace.duration; s.block = COMBAT_RULES.brace.block;
          s.cooldowns.brace = COMBAT_RULES.brace.cooldown; s.actionCooldown = COMBAT_RULES.actionCooldown;
          this.report("You gain 5 block for 5 seconds.", "combat");
        }
        break;
      case "gather": this.gather(); break;
      case "ritual": this.ritual(); break;
      case "takeLoot": this.takeLoot(); break;
      case "interact": {
        this.lootOpenId = null;
        const service = s.phase === "town" ? PLACES.filter(p => (p.kind === "shop" || p.kind === "inn") && this.near(p.id, 2.5))
          .sort((a,b) => distance(s.position,a.position) - distance(s.position,b.position))[0] : undefined;
        this.shopOpen = service?.kind === "shop";
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
        } else if (s.supplies < 3) {
          this.report("Not enough supplies for a health potion.");
        } else {
          s.supplies -= 3; s.potions += 1;
          this.report("You buy a health potion for 3 supplies.");
        }
        break;
      case "drinkPotion":
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
  private ability(t: ThreatState, next = false): ThreatAbilityView {
    if (t.id === "scout") {
      const maul = next ? t.abilityIndex === 0 : t.abilityIndex === 1;
      return maul
        ? { id: "maul", name: "Lunging Maul", description: "Pursues you for 5 seconds, then commits to the marked ground. Leap clear before it lands.", damage: 9, range: 3, noticeSeconds: 5 }
        : { id: "bite", name: "Bite", description: "Bites immediately within 2 metres. Follows with Lunging Maul.", damage: 4, range: 2, noticeSeconds: 0 };
    }
    const d = definition(t.id);
    return { id: t.id, name: d.intention, description: `${d.preparation}. Strikes the marked ground after 3 seconds.`, damage: t.damage, range: d.reach, noticeSeconds: 3 };
  }
  private phaseDuration(t: ThreatState): number {
    return (t.id === "scout" ? PHASE_SECONDS : OTHER_PHASE_SECONDS)[t.phase];
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
    return this.ready() && s.cooldowns[action] <= EPSILON && s.position.y === 0 && s.verticalSpeed === 0 &&
      t.active && t.health > 0 && distance(s.position, t.position) <= COMBAT_RULES[action].range + EPSILON && this.attackPath(t);
  }
  private attack(action: "strike" | "disengage"): void {
    const s = this.state;
    const t = s.threats.find(t => t.id === s.selectedThreat);
    if (!t || !this.canUseAttack(t, action)) {
      if (this.ready()) this.report("Choose a living threat within reach from clear ground.", "combat");
      return;
    }
    const length = distance(s.position, t.position);
    const facing = length > EPSILON ? point((t.position.x - s.position.x) / length, (t.position.z - s.position.z) / length) : { ...this.cameraForward };
    const amount = action === "strike" ? Math.max(0, length - COMBAT_RULES.strike.stopDistance) : -COMBAT_RULES.disengage.distance;
    const destination = point(Math.max(-12, Math.min(12, s.position.x + facing.x * amount)), Math.max(-14, Math.min(45, s.position.z + facing.z * amount)));
    s.cooldowns[action] = COMBAT_RULES[action].cooldown; s.actionCooldown = COMBAT_RULES.actionCooldown;
    s.maneuver = { kind: action === "strike" ? "lunge" : "disengage", targetId: t.id,
      start: { ...s.position }, destination, facing, remainingSeconds: COMBAT_RULES[action].duration };
    if (action === "disengage") this.hit(t, COMBAT_RULES.disengage.damage, "strike");
  }
  private hit(t: ThreatState, damage: number, verb: string): void {
    const s = this.state, dealt = Math.min(damage, t.health);
    t.health -= dealt;
    if (t.health > 0 && !t.aggro) { t.aggro = true; this.prepareOrApproach(t); }
    s.attackSequence += 1; s.presence += 1;
    this.report(`You ${verb} ${definition(t.id).name} for ${dealt} damage.`, "combat");
    if (t.health === 0) {
      t.phase = "cleared"; t.remainingSeconds = 0; t.lastActionHit = false; t.aggro = false; t.moving = false;
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
    s.resourceRemaining -= 3; s.cargo += 3; s.presence += 4; s.actionCooldown = 2;
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
    s.cargo -= 6; s.ritualCalled = true; s.presence += 12; s.actionCooldown = 1;
    guardian.active = true; guardian.aggro = true; this.beginPreparation(guardian);
    this.report("Six cores offered. The frost guardian answers; carry its relic home.");
  }

  advance(seconds: number): void {
    if (!Number.isFinite(seconds) || seconds < 0) throw new Error("Elapsed time must be finite and nonnegative.");
    let remaining = seconds;
    while (remaining > EPSILON) {
      const dt = Math.min(remaining, 1 / 60);
      this.step(dt);
      remaining -= dt;
    }
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
      if (t && t.active && t.health > 0 && distance(s.position, t.position) <= COMBAT_RULES.disengage.range + EPSILON && this.attackPath(t)) this.hit(t, COMBAT_RULES.strike.damage, "lunge at");
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
    if (s.maneuver) this.moveManeuver(dt); else this.move(dt);
    if (this.lootOpenId !== null && !s.threats.some(t => t.id === this.lootOpenId && this.canLoot(t))) this.lootOpenId = null;
    if (this.shopOpen && !this.near("mara", 2.5)) this.shopOpen = false;
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
      s.actionCooldown = 0; s.guardSeconds = 0; s.block = 0; this.shopOpen = false; this.innOpen = false;
      this.report("You enter Frostwood. The forest is listening; Hearthstead lies behind you.");
    } else if (s.phase === "expedition" && s.position.z <= 0) {
      s.phase = "town"; s.supplies += s.cargo + s.carriedSalvage; s.bankedRelics += s.carriedRelics;
      s.cargo = 0; s.carriedRelics = 0; s.carriedSalvage = 0; s.guardSeconds = 0; s.block = 0;
      s.maneuver = null; s.position.y = 0; s.verticalSpeed = 0; this.lootOpenId = null;
      for (const t of s.threats) if (t.health > 0) this.releaseThreat(t);
      this.report("You return to Hearthstead. Cores, salvage and relics are secured. Visit the inn before your next trip.");
    }
    if (s.phase === "expedition") s.presence += (this.moving ? 0.5 : 0.1) * dt;
    s.guardSeconds = Math.max(0, s.guardSeconds - dt);
    if (s.guardSeconds <= EPSILON) { s.guardSeconds = 0; s.block = 0; }
    for (const t of s.threats) {
      t.moving = false;
      if (s.health > 0) this.advanceThreat(t, dt);
    }
    s.actionCooldown = Math.max(0, s.actionCooldown - dt);
    for (const action of ["strike", "disengage", "brace"] as const) s.cooldowns[action] = Math.max(0, s.cooldowns[action] - dt);
  }
  private beginPreparation(t: ThreatState): void {
    t.phase = "preparation"; t.remainingSeconds = this.ability(t).noticeSeconds; t.lastActionHit = false;
    t.targetPosition = { ...t.position };
    t.damage = t.id === "scout" ? this.ability(t).damage : Math.ceil(definition(t.id).damage * (1 + this.state.presence / 100));
    if (t.remainingSeconds === 0) {
      t.phase = "action"; t.remainingSeconds = this.phaseDuration(t);
      this.resolveAttack(t);
    }
  }
  private prepareOrApproach(t: ThreatState): boolean {
    const d = definition(t.id);
    if (t.id === "scout") t.damage = this.ability(t).damage;
    if (d.speed === 0 || distance(this.state.position, t.position) <= this.ability(t).range + EPSILON) {
      this.beginPreparation(t); return true;
    }
    t.phase = "approach"; t.remainingSeconds = 0; t.lastActionHit = false;
    return false;
  }
  private releaseThreat(t: ThreatState): void {
    t.aggro = false; t.remainingSeconds = 0; t.lastActionHit = false; t.moving = false; t.abilityIndex = 0;
    t.damage = definition(t.id).damage;
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
  private moveThreat(t: ThreatState, destination: Position, dt: number): void {
    const speed = definition(t.id).speed;
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
  }
  private advanceThreat(t: ThreatState, dt: number): void {
    if (!t.active || t.health <= 0) return;
    const d = definition(t.id);
    if (t.phase === "returning") { this.returnHome(t, dt); return; }
    if (!t.aggro) {
      this.patrol(t, dt);
      if (this.state.phase !== "expedition" || this.state.position.z <= 2 || d.disposition !== "hostile" ||
        distance(this.state.position, t.position) > d.aggroRange || !this.clearPath(t.position, this.state.position)) return;
      t.aggro = true; this.prepareOrApproach(t);
      return;
    }
    if (this.state.phase !== "expedition" || this.state.position.z <= 2 || distance(this.state.position, d.position) > d.leash || distance(t.position, d.position) > d.leash) {
      this.releaseThreat(t); return;
    }
    if (t.phase === "approach") {
      this.pursue(t, dt);
      if (distance(this.state.position, t.position) <= this.ability(t).range + EPSILON) this.beginPreparation(t);
      return;
    }
    if (t.phase === "preparation" || t.phase === "recovery") this.pursue(t, dt);
    t.remainingSeconds -= dt;
    if (t.remainingSeconds > EPSILON) return;
    const overrun = Math.max(0, -t.remainingSeconds);
    if (t.phase === "preparation") {
      t.phase = "action"; t.remainingSeconds = this.phaseDuration(t) - overrun;
      t.targetPosition = { ...t.position };
    } else if (t.phase === "action") {
      if (t.id === "scout" && t.abilityIndex === 0) {
        t.abilityIndex = 1; this.beginPreparation(t); t.remainingSeconds -= overrun;
      } else {
        this.resolveAttack(t);
        t.phase = "recovery"; t.remainingSeconds = this.phaseDuration(t) - overrun;
      }
    } else {
      t.abilityIndex = 0;
      if (this.prepareOrApproach(t)) t.remainingSeconds -= overrun;
    }
  }
  private resolveAttack(t: ThreatState): void {
    t.lastActionHit = distance(this.state.position, t.targetPosition) <= this.ability(t).range + EPSILON &&
      (t.id === "nest" || this.clearPath(t.targetPosition, this.state.position));
    t.actionSequence += 1;
    if (t.lastActionHit) this.hurt(t.damage, `${definition(t.id).name} — ${this.intention(t)}`);
    else this.report(`${definition(t.id).name} — ${this.intention(t)} misses you.`, "combat");
  }
  private hurt(damage: number, source: string): void {
    const s = this.state;
    const blocked = s.guardSeconds > EPSILON ? Math.min(damage, s.block) : 0;
    s.block -= blocked;
    if (s.block === 0) s.guardSeconds = 0;
    const taken = Math.min(s.health, damage - blocked);
    s.health -= taken;
    this.report(`${source} hits you for ${taken} damage${blocked > 0 ? ` (${blocked} blocked by Brace)` : ""}.`, "combat");
    if (s.health > 0) return;
    s.maneuver = null; s.block = 0; s.guardSeconds = 0;
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
function groundPosition(value: unknown): Vector {
  const p = record(value);
  return { x: number(p.x, -12, 12), y: number(p.y, 0, 0), z: number(p.z, -14, 45) };
}
function readSave(serialized: string): State {
  let parsed: unknown;
  try { parsed = JSON.parse(serialized); }
  catch { throw new Error("Invalid adventure save: unreadable saved data."); }
  const root = record(parsed);
  if (root.version !== 1 && root.version !== 2 && root.version !== 3 && root.version !== 4) throw new Error("Unsupported adventure save version.");
  const current = root.version === 4;
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
    const maxDuration = (current && id === "scout" ? PHASE_SECONDS : OTHER_PHASE_SECONDS)[phase];
    const result: ThreatState = { id, health, active, phase, remainingSeconds: number(t.remainingSeconds, 0, maxDuration),
      actionSequence: number(t.actionSequence, 0, Number.MAX_SAFE_INTEGER, true), lastActionHit: boolean(t.lastActionHit),
      damage: number(t.damage, !current && id === "scout" ? 0 : definition(id).damage, Number.MAX_SAFE_INTEGER, true),
      position: root.version === 1 ? { ...definition(id).position } : groundPosition(t.position),
      targetPosition: root.version === 1 ? { ...definition(id).position } : groundPosition(t.targetPosition),
      aggro: root.version === 1 ? phase !== "dormant" && phase !== "cleared" : boolean(t.aggro),
      lootClaimed: root.version === 3 || current ? boolean(t.lootClaimed) : id === "ritual-guardian" && health === 0,
      patrolIndex: current ? number(t.patrolIndex, 0, definition(id).patrol?.length ?? 1, true) : 1,
      moving: current ? boolean(t.moving) : false,
      abilityIndex: current ? number(t.abilityIndex, 0, id === "scout" ? 1 : 0, true) : 0,
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
    guardSeconds: number(s.guardSeconds, 0, current ? COMBAT_RULES.brace.duration : 3),
    block: current ? number(s.block, 0, COMBAT_RULES.brace.block) : number(s.guardSeconds, 0, 3) > 0 ? COMBAT_RULES.brace.block : 0,
    cooldowns: current ? readCooldowns(s.cooldowns) : { strike: number(s.actionCooldown, 0, 2), disengage: 0, brace: 0 },
    maneuver: current ? readManeuver(s.maneuver) : null,
    attackSequence: number(s.attackSequence, 0, Number.MAX_SAFE_INTEGER, true),
    selectedThreat: choice(s.selectedThreat, DEFINITIONS.map(t => t.id)), report: text(s.report), threats,
  };
  if ((state.phase === "lost") !== (state.health === 0) || threats.find(t => t.id === "ritual-guardian")?.active !== state.ritualCalled) {
    throw new Error("Invalid adventure save: inconsistent expedition.");
  }
  if ((state.block === 0) !== (state.guardSeconds === 0) || (state.maneuver !== null && state.phase !== "expedition")) {
    throw new Error("Invalid adventure save: inconsistent combat state.");
  }
  return state;
}

function readCooldowns(value: unknown): State["cooldowns"] {
  const c = record(value);
  return { strike: number(c.strike, 0, COMBAT_RULES.strike.cooldown), disengage: number(c.disengage, 0, COMBAT_RULES.disengage.cooldown), brace: number(c.brace, 0, COMBAT_RULES.brace.cooldown) };
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
