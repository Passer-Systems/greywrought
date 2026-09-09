import type { CharacterArchetype } from "../host/character-profile.js";
import type {
  AdventureAction, AdventureGame, AdventureOptions, AdventureSnapshot,
  PlaceView, Position, ThreatPhase, ThreatView,
} from "./adventure-types.js";

type Vector = { x: number; y: number; z: number };
type Phase = AdventureSnapshot["phase"];
interface ThreatDefinition {
  id: string; name: string; position: Position; health: number;
  preparation: string; intention: string; damage: number; reach: number; benefit: string;
}
interface ThreatState {
  id: string; health: number; active: boolean; phase: ThreatPhase;
  remainingSeconds: number; actionSequence: number; lastActionHit: boolean; damage: number;
}
interface State {
  phase: Phase; archetype: CharacterArchetype; position: Vector; verticalSpeed: number;
  health: number; supplies: number; cargo: number; resourceRemaining: number;
  potions: number; carriedRelics: number; bankedRelics: number; presence: number;
  ritualCalled: boolean; actionCooldown: number; guardSeconds: number;
  attackSequence: number; selectedThreat: string; report: string; threats: ThreatState[];
}

const point = (x: number, z: number): Vector => ({ x, y: 0, z });
const DEFINITIONS: readonly ThreatDefinition[] = [
  { id: "scout", name: "Briar lookout", position: point(-3, 10), health: 18,
    preparation: "Listening for footsteps", intention: "Sounding the alarm", damage: 0, reach: 35,
    benefit: "Clear the lookout to stop its repeated alarms." },
  { id: "nest", name: "Thorn nest", position: point(5, 20), health: 24,
    preparation: "Rousing the swarm", intention: "Swarm rush", damage: 7, reach: 3,
    benefit: "Clear the nest to open the passage through the thicket." },
  { id: "warder", name: "Root warder", position: point(-3, 30), health: 30,
    preparation: "Raising thorn wards", intention: "Thorn lash", damage: 8, reach: 5,
    benefit: "Clear the warder to gather frost cores without cutting thorns." },
  { id: "patrol", name: "Ash hound patrol", position: point(3, 35), health: 36,
    preparation: "Sweeping the trail", intention: "Charging the company", damage: 10, reach: 7,
    benefit: "Clear the patrol to prevent ambushes during retreat." },
  { id: "ritual-guardian", name: "Called frost guardian", position: point(2, 40), health: 48,
    preparation: "Drawing a freezing breath", intention: "Frost torrent", damage: 20, reach: 3,
    benefit: "Defeat the called guardian, then carry its frost relic home." },
];
const PLACES: readonly PlaceView[] = [
  { id: "hearthstead", name: "Hearthstead", position: point(0, -8), kind: "town" },
  { id: "forest-gate", name: "North gate / return to safety", position: point(0, 0), kind: "gate" },
  { id: "frost-cores", name: "Frost cores", position: point(-2, 12), kind: "resource" },
  { id: "ritual-site", name: "Deep grove", position: point(2, 40), kind: "ritual" },
  { id: "mara", name: "Mara / Apothecary", position: point(3.4, -7.5), kind: "shop" },
];
const PHASE_SECONDS: Record<ThreatPhase, number> = {
  dormant: 0, preparation: 3, action: 0.35, recovery: 2.65, cleared: 0,
};
const EPSILON = 1e-9;
const distance = (a: Position, b: Position): number => Math.hypot(a.x - b.x, a.z - b.z);
const definition = (id: string): ThreatDefinition => {
  const found = DEFINITIONS.find(t => t.id === id);
  if (!found) throw new Error(`Unknown threat: ${id}`);
  return found;
};
const newThreats = (): ThreatState[] => DEFINITIONS.map(t => ({
  id: t.id, health: t.health, active: t.id !== "ritual-guardian", phase: "dormant",
  remainingSeconds: 0, actionSequence: 0, lastActionHit: false, damage: t.damage,
}));
function initialState(archetype: CharacterArchetype): State {
  return {
    phase: "town", archetype, position: point(0, -8), verticalSpeed: 0, health: 100,
    supplies: 15, cargo: 0, resourceRemaining: 12, potions: 0, carriedRelics: 0,
    bankedRelics: 0, presence: 0, ritualCalled: false, actionCooldown: 0,
    guardSeconds: 0, attackSequence: 0, selectedThreat: "scout",
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

  constructor(options: AdventureOptions) {
    this.state = options.save === undefined ? initialState(options.archetype ?? "warrior") : readSave(options.save);
    if (options.archetype !== undefined && options.archetype !== this.state.archetype) {
      throw new Error("The saved character has a different calling.");
    }
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
      },
      threats: s.threats.map((t): ThreatView => {
        const d = definition(t.id);
        return {
          ...t, name: d.name, position: { ...d.position }, maximumHealth: d.health,
          selected: t.id === s.selectedThreat, phaseDuration: PHASE_SECONDS[t.phase],
          preparation: d.preparation, intention: d.intention, damage: t.damage, reach: d.reach,
          benefit: d.benefit, targetPosition: { ...d.position },
        };
      }),
      places: PLACES.map(p => ({ ...p, position: { ...p.position } })),
      selectedThreat: s.selectedThreat, supplies: s.supplies, cargo: s.cargo,
      resourceRemaining: s.resourceRemaining, potions: s.potions, carriedRelics: s.carriedRelics,
      bankedRelics: s.bankedRelics, presence: s.presence, ritualCalled: s.ritualCalled,
      shopOpen: this.shopOpen, potionPrice: 3, potionHealing: 30, report: s.report,
    };
  }

  save(): string { return JSON.stringify({ version: 1, state: this.state }); }

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
    return this.state.phase === "expedition" && this.state.actionCooldown <= EPSILON;
  }
  private act(action: AdventureAction): void {
    const s = this.state;
    if (action === "closeShop") { this.shopOpen = false; return; }
    if (s.phase === "lost") return;
    switch (action) {
      case "jump":
        if (s.position.y === 0 && s.verticalSpeed === 0) s.verticalSpeed = 5.5;
        break;
      case "target": {
        const nearby = s.threats.filter(t => t.active && t.health > 0 && distance(s.position, definition(t.id).position) <= 15);
        const next = nearby[(nearby.findIndex(t => t.id === s.selectedThreat) + 1) % nearby.length];
        if (next) s.selectedThreat = next.id;
        break;
      }
      case "strike": this.strike(); break;
      case "brace":
        if (this.ready()) { s.guardSeconds = 3; s.actionCooldown = 1; s.report = "Braced for three seconds. Incoming hits deal half damage."; }
        break;
      case "gather": this.gather(); break;
      case "ritual": this.ritual(); break;
      case "interact":
        this.shopOpen = s.phase === "town" && this.near("mara", 2.5);
        s.report = this.shopOpen ? "Mara: A little preparation goes a long way." : "Approach Mara beside the Hearthstead road to trade.";
        break;
      case "buyPotion":
        if (!this.shopOpen || !this.near("mara", 2.5) || s.phase !== "town") {
          s.report = "Talk to Mara in Hearthstead to buy a potion.";
        } else if (s.supplies < 3) {
          s.report = "Not enough supplies for a health potion.";
        } else {
          s.supplies -= 3; s.potions += 1;
          s.report = "Health potion purchased. Drink it when hurt.";
        }
        break;
      case "drinkPotion":
        if (s.health >= 100) s.report = "Your health is already full. Potion kept.";
        else if (s.potions < 1) s.report = "No health potions. Visit Mara in Hearthstead.";
        else { s.potions -= 1; s.health = Math.min(100, s.health + 30); s.report = "You drink a health potion and recover health."; }
        break;
      case "rest":
        if (s.phase === "town") { s.health = 100; s.report = "Rested in Hearthstead. Health restored."; }
        break;
    }
  }
  private strike(): void {
    const s = this.state;
    if (!this.ready()) return;
    const t = s.threats.find(t => t.id === s.selectedThreat);
    if (!t || !t.active || t.health <= 0) { s.report = "Choose a living threat to strike."; return; }
    if (distance(s.position, definition(t.id).position) > 3.5 + EPSILON) {
      s.report = "Move closer to strike your chosen threat."; return;
    }
    t.health = Math.max(0, t.health - 9);
    s.attackSequence += 1; s.actionCooldown = 2; s.presence += 1;
    s.report = `${definition(t.id).name} struck for 9 damage.`;
    if (t.health === 0) {
      t.phase = "cleared"; t.remainingSeconds = 0; t.lastActionHit = false;
      s.report = definition(t.id).benefit;
      if (t.id === "ritual-guardian") {
        s.carriedRelics = 1;
        s.report = "The frost relic is in your pack. Reach Hearthstead alive to keep it.";
      }
    }
  }
  private gather(): void {
    const s = this.state;
    if (!this.ready()) return;
    if (!this.near("frost-cores", 3)) { s.report = "Approach the frost cores near the lookout to gather."; return; }
    if (s.resourceRemaining < 3) { s.report = "No frost cores remain here this trip."; return; }
    s.resourceRemaining -= 3; s.cargo += 3; s.presence += 4; s.actionCooldown = 2;
    s.report = "Three frost cores gathered. Return alive to keep them.";
    if (s.threats.some(t => t.id === "warder" && t.health > 0)) {
      s.report += " The warder's thorns cut you; clear it to gather safely.";
      this.hurt(8);
    }
  }
  private ritual(): void {
    const s = this.state;
    if (!this.ready()) return;
    if (!this.near("ritual-site", 3)) { s.report = "Reach the deep grove to offer six frost cores."; return; }
    if (s.ritualCalled) { s.report = "The guardian has already been called this trip."; return; }
    if (s.cargo < 6) { s.report = "The offering needs six carried frost cores."; return; }
    const guardian = s.threats.find(t => t.id === "ritual-guardian");
    if (!guardian) throw new Error("Missing frost guardian.");
    s.cargo -= 6; s.ritualCalled = true; s.presence += 12; s.actionCooldown = 1;
    guardian.active = true; this.beginPreparation(guardian);
    s.report = "Six cores offered. The frost guardian answers; carry its relic home.";
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
    const nextX = Math.max(-12, Math.min(12, s.position.x + x * 4.5 * dt));
    const nextZ = Math.max(-14, Math.min(45, s.position.z + z * 4.5 * dt));
    const oldX = s.position.x, oldZ = s.position.z;
    if (!this.blocked(nextX, nextZ)) { s.position.x = nextX; s.position.z = nextZ; }
    else {
      if (!this.blocked(nextX, s.position.z)) s.position.x = nextX;
      if (!this.blocked(s.position.x, nextZ)) s.position.z = nextZ;
    }
    this.moving = Math.hypot(s.position.x - oldX, s.position.z - oldZ) > EPSILON;
    this.backpedaling = this.moving && forward < 0;
    if (s.position.y > 0 || s.verticalSpeed > 0) {
      s.position.y = Math.max(0, s.position.y + s.verticalSpeed * dt - 7 * dt * dt);
      s.verticalSpeed = s.position.y > 0 ? s.verticalSpeed - 14 * dt : 0;
    }
  }
  private blocked(x: number, z: number): boolean {
    if (z >= -0.5 && z <= 4 && Math.abs(x) > 3) return true;
    return z >= 18 && z <= 24 && x > 2 && this.state.threats.some(t => t.id === "nest" && t.health > 0);
  }
  private step(dt: number): void {
    const s = this.state;
    if (s.phase === "lost") { this.moving = false; this.backpedaling = false; return; }
    this.move(dt);
    if (this.shopOpen && !this.near("mara", 2.5)) this.shopOpen = false;
    if (s.phase === "town" && s.position.z >= 2) {
      s.phase = "expedition"; s.cargo = 0; s.carriedRelics = 0; s.presence = 0;
      s.resourceRemaining = 12; s.ritualCalled = false; s.threats = newThreats();
      s.actionCooldown = 0; s.guardSeconds = 0; this.shopOpen = false;
      s.report = "The forest is listening. Frost cores wait near the lookout; Hearthstead lies behind you.";
    } else if (s.phase === "expedition" && s.position.z <= 0) {
      s.phase = "town"; s.supplies += s.cargo; s.bankedRelics += s.carriedRelics;
      s.cargo = 0; s.carriedRelics = 0; s.guardSeconds = 0;
      for (const t of s.threats) if (t.health > 0) { t.phase = "dormant"; t.remainingSeconds = 0; }
      s.report = "Safe at Hearthstead. Extracted cores and relics are secured. Rest before your next trip.";
    }
    if (s.phase === "expedition") {
      s.presence += (this.moving ? 0.5 : 0.1) * dt;
      for (const t of s.threats) {
        if (s.health <= 0) break;
        this.advanceThreat(t, dt);
      }
    }
    s.actionCooldown = Math.max(0, s.actionCooldown - dt);
    s.guardSeconds = Math.max(0, s.guardSeconds - dt);
  }
  private engaged(t: ThreatState): boolean {
    return distance(this.state.position, definition(t.id).position) <= (t.id === "scout" ? 10 : 8);
  }
  private beginPreparation(t: ThreatState): void {
    t.phase = "preparation"; t.remainingSeconds = 3; t.lastActionHit = false;
    t.damage = Math.ceil(definition(t.id).damage * (1 + this.state.presence / 100));
  }
  private advanceThreat(t: ThreatState, dt: number): void {
    if (!t.active || t.health <= 0) return;
    if (t.phase === "dormant") {
      if (this.engaged(t)) this.beginPreparation(t);
      return;
    }
    t.remainingSeconds -= dt;
    if (t.remainingSeconds > EPSILON) return;
    const overrun = Math.max(0, -t.remainingSeconds);
    if (t.phase === "preparation") {
      t.phase = "action"; t.remainingSeconds = 0.35 - overrun; t.actionSequence += 1;
      const d = definition(t.id);
      t.lastActionHit = distance(this.state.position, d.position) <= d.reach + EPSILON;
      if (t.lastActionHit) {
        if (t.id === "scout") {
          this.state.presence += 3;
          this.state.report = "The lookout sounds an alarm. Rising presence strengthens future enemy attacks.";
        } else {
          this.state.report = `${d.name}: ${d.intention}. ${t.damage * (this.state.guardSeconds > EPSILON ? 0.5 : 1)} damage${this.state.guardSeconds > EPSILON ? " while braced" : ""}.`;
          this.hurt(t.damage);
        }
      }
    } else if (t.phase === "action") {
      t.phase = "recovery"; t.remainingSeconds = 2.65 - overrun;
    } else if (this.engaged(t)) {
      this.beginPreparation(t); t.remainingSeconds -= overrun;
    } else {
      t.phase = "dormant"; t.remainingSeconds = 0; t.lastActionHit = false;
    }
  }
  private hurt(damage: number): void {
    const s = this.state;
    s.health = Math.max(0, s.health - damage * (s.guardSeconds > EPSILON ? 0.5 : 1));
    if (s.health > 0) return;
    s.phase = "lost"; s.cargo = 0; s.carriedRelics = 0; s.supplies = 0; s.bankedRelics = 0;
    s.potions = 0; this.shopOpen = false; this.moving = false; this.backpedaling = false;
    s.report = "The wayfarer is lost. Carried rewards and personal stores are gone. Create a new character to try again.";
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
function readSave(serialized: string): State {
  let parsed: unknown;
  try { parsed = JSON.parse(serialized); }
  catch { throw new Error("Invalid adventure save: unreadable saved data."); }
  const root = record(parsed);
  if (root.version !== 1) throw new Error("Unsupported adventure save version.");
  const s = record(root.state), p = record(s.position);
  if (!Array.isArray(s.threats) || s.threats.length !== DEFINITIONS.length) throw new Error("Invalid adventure save: missing threats.");
  const threats: ThreatState[] = s.threats.map((value: unknown) => {
    const t = record(value);
    const id = choice(t.id, DEFINITIONS.map(d => d.id));
    const phase = choice(t.phase, ["dormant", "preparation", "action", "recovery", "cleared"] as const);
    const health = number(t.health, 0, definition(id).health);
    const active = boolean(t.active);
    if ((health === 0) !== (phase === "cleared") || (!active && phase !== "dormant") || (id !== "ritual-guardian" && !active)) {
      throw new Error("Invalid adventure save: inconsistent threat.");
    }
    return { id, health, active, phase, remainingSeconds: number(t.remainingSeconds, 0, PHASE_SECONDS[phase]),
      actionSequence: number(t.actionSequence, 0, Number.MAX_SAFE_INTEGER, true), lastActionHit: boolean(t.lastActionHit),
      damage: number(t.damage, definition(id).damage, Number.MAX_SAFE_INTEGER, true) };
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
    presence: number(s.presence), ritualCalled: boolean(s.ritualCalled), actionCooldown: number(s.actionCooldown, 0, 2),
    guardSeconds: number(s.guardSeconds, 0, 3), attackSequence: number(s.attackSequence, 0, Number.MAX_SAFE_INTEGER, true),
    selectedThreat: choice(s.selectedThreat, DEFINITIONS.map(t => t.id)), report: text(s.report), threats,
  };
  if ((state.phase === "lost") !== (state.health === 0) || threats.find(t => t.id === "ritual-guardian")?.active !== state.ritualCalled) {
    throw new Error("Invalid adventure save: inconsistent expedition.");
  }
  return state;
}

export function createAdventure(options: AdventureOptions = {}): AdventureGame {
  return new Adventure(options);
}
