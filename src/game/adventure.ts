import type { CharacterArchetype } from "../host/character-profile.js";
import type {
  AdventureAction, AdventureGame, AdventureOptions, AdventureSnapshot,
  CorpseLootView, PlaceView, Position, ThreatPhase, ThreatView,
} from "./adventure-types.js";

type Vector = { x: number; y: number; z: number };
type Phase = AdventureSnapshot["phase"];
interface ThreatDefinition {
  id: string; name: string; position: Position; health: number;
  preparation: string; intention: string; damage: number; reach: number; benefit: string;
  disposition: ThreatView["disposition"]; aggroRange: number; leash: number; speed: number;
}
interface ThreatState {
  id: string; health: number; active: boolean; phase: ThreatPhase;
  remainingSeconds: number; actionSequence: number; lastActionHit: boolean; damage: number;
  position: Vector; targetPosition: Vector; aggro: boolean; lootClaimed: boolean;
}
interface State {
  phase: Phase; archetype: CharacterArchetype; position: Vector; verticalSpeed: number;
  health: number; supplies: number; cargo: number; resourceRemaining: number;
  potions: number; carriedRelics: number; bankedRelics: number; presence: number; carriedSalvage: number;
  ritualCalled: boolean; actionCooldown: number; guardSeconds: number;
  attackSequence: number; selectedThreat: string; report: string; threats: ThreatState[];
}

const point = (x: number, z: number): Vector => ({ x, y: 0, z });
const DEFINITIONS: readonly ThreatDefinition[] = [
  { id: "scout", disposition: "hostile", aggroRange: 10, leash: 14, speed: 0, name: "Briar lookout", position: point(-3, 10), health: 18,
    preparation: "Listening for footsteps", intention: "Sounding the alarm", damage: 0, reach: 35,
    benefit: "Clear the lookout to stop its repeated alarms." },
  { id: "nest", disposition: "neutral", aggroRange: 0, leash: 7, speed: 0, name: "Thorn nest", position: point(5, 20), health: 24,
    preparation: "Rousing the swarm", intention: "Swarm rush", damage: 7, reach: 3,
    benefit: "Clear the nest to open the passage through the thicket." },
  { id: "warder", disposition: "hostile", aggroRange: 8, leash: 11, speed: 2, name: "Root warder", position: point(-3, 30), health: 30,
    preparation: "Raising thorn wards", intention: "Thorn lash", damage: 8, reach: 5,
    benefit: "Clear the warder to gather frost cores without cutting thorns." },
  { id: "patrol", disposition: "hostile", aggroRange: 10, leash: 13, speed: 3.2, name: "Ash hound patrol", position: point(3, 35), health: 36,
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
];
const PHASE_SECONDS: Record<ThreatPhase, number> = {
  dormant: 0, approach: 0, preparation: 3, action: 0.35, recovery: 2.65, returning: 0, cleared: 0,
};
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
  id: t.id, health: t.health, active: t.id !== "ritual-guardian", phase: "dormant",
  remainingSeconds: 0, actionSequence: 0, lastActionHit: false, damage: t.damage,
  position: { ...t.position }, targetPosition: { ...t.position }, aggro: false,
  lootClaimed: false,
}));
function initialState(archetype: CharacterArchetype): State {
  return {
    phase: "town", archetype, position: point(0, -8), verticalSpeed: 0, health: 100,
    supplies: 15, cargo: 0, resourceRemaining: 12, potions: 0, carriedRelics: 0,
    bankedRelics: 0, carriedSalvage: 0, presence: 0, ritualCalled: false, actionCooldown: 0,
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
  private lootOpenId: string | null = null;

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
          ...t, name: d.name, position: { ...t.position }, homePosition: { ...d.position },
          disposition: d.disposition, moving: s.phase !== "lost" && (t.phase === "approach" || t.phase === "returning") && d.speed > 0, maximumHealth: d.health,
          selected: t.id === s.selectedThreat, phaseDuration: PHASE_SECONDS[t.phase],
          preparation: d.preparation, intention: d.intention, damage: t.damage, reach: d.reach,
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
      shopOpen: this.shopOpen, potionPrice: 3, potionHealing: 30, report: s.report,
    };
  }

  save(): string { return JSON.stringify({ version: 3, state: this.state }); }

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
    if (this.lootOpenId) this.shopOpen = false;
  }
  private takeLoot(): void {
    const s = this.state;
    const corpse = s.threats.find(t => t.id === this.lootOpenId);
    this.lootOpenId = null;
    if (!corpse || !this.canLoot(corpse)) return;
    corpse.lootClaimed = true;
    if (corpse.id === "ritual-guardian") {
      s.carriedRelics += 1;
      s.report = "The frost relic is in your pack. Reach Hearthstead alive to keep it.";
    } else {
      s.carriedSalvage += 1;
      s.report = "Forest salvage collected. Return alive to exchange it for one supply.";
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
    return this.state.phase === "expedition" && this.state.actionCooldown <= EPSILON;
  }
  private act(action: AdventureAction): void {
    const s = this.state;
    if (action === "closeShop") { this.shopOpen = false; return; }
    if (action === "closeLoot") { this.lootOpenId = null; return; }
    if (s.phase === "lost") return;
    switch (action) {
      case "jump":
        if (s.position.y === 0 && s.verticalSpeed === 0) s.verticalSpeed = 5.5;
        break;
      case "target": {
        const nearby = s.threats.filter(t => t.active && t.health > 0 && distance(s.position, t.position) <= 15);
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
      case "takeLoot": this.takeLoot(); break;
      case "interact": {
        this.lootOpenId = null;
        this.shopOpen = s.phase === "town" && this.near("mara", 2.5);
        if (this.shopOpen) s.report = "Mara: A little preparation goes a long way.";
        else {
          const corpse = s.threats.filter(t => this.canLoot(t))
            .sort((a, b) => distance(s.position, a.position) - distance(s.position, b.position))[0];
          if (corpse) this.openLoot(corpse.id);
          else s.report = s.phase === "town" ? "Approach Mara beside the Hearthstead road to trade." : "Move beside a glinting body to search it.";
        }
        break;
      }
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
    if (distance(s.position, t.position) > 3.5 + EPSILON) {
      s.report = "Move closer to strike your chosen threat."; return;
    }
    t.health = Math.max(0, t.health - 9);
    if (t.health > 0 && !t.aggro) { t.aggro = true; this.prepareOrApproach(t); }
    s.attackSequence += 1; s.actionCooldown = 2; s.presence += 1;
    s.report = `${definition(t.id).name} struck for 9 damage.`;
    if (t.health === 0) {
      t.phase = "cleared"; t.remainingSeconds = 0; t.lastActionHit = false; t.aggro = false;
      s.report = definition(t.id).benefit;
      if (t.id === "ritual-guardian") {
        s.report = "The guardian falls. Search its body for the frost relic, then carry it home.";
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
    guardian.active = true; guardian.aggro = true; this.beginPreparation(guardian);
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
    this.move(dt);
    if (this.lootOpenId !== null && !s.threats.some(t => t.id === this.lootOpenId && this.canLoot(t))) this.lootOpenId = null;
    if (this.shopOpen && !this.near("mara", 2.5)) this.shopOpen = false;
    if (s.phase === "town" && s.position.z >= 2) {
      s.phase = "expedition"; s.cargo = 0; s.carriedRelics = 0; s.carriedSalvage = 0; s.presence = 0;
      s.resourceRemaining = 12; s.ritualCalled = false; s.threats = newThreats();
      s.actionCooldown = 0; s.guardSeconds = 0; this.shopOpen = false;
      s.report = "The forest is listening. Frost cores wait near the lookout; Hearthstead lies behind you.";
    } else if (s.phase === "expedition" && s.position.z <= 0) {
      s.phase = "town"; s.supplies += s.cargo + s.carriedSalvage; s.bankedRelics += s.carriedRelics;
      s.cargo = 0; s.carriedRelics = 0; s.carriedSalvage = 0; s.guardSeconds = 0; this.lootOpenId = null;
      for (const t of s.threats) if (t.health > 0) this.disengage(t);
      s.report = "Safe at Hearthstead. Cores, salvage and relics are secured. Rest before your next trip.";
    }
    if (s.phase === "expedition") {
      s.presence += (this.moving ? 0.5 : 0.1) * dt;
      for (const t of s.threats) {
        if (s.health <= 0) break;
        this.advanceThreat(t, dt);
      }
    }
    if (s.phase === "town") {
      for (const t of s.threats) if (t.phase === "returning") this.returnHome(t, dt);
    }
    s.actionCooldown = Math.max(0, s.actionCooldown - dt);
    s.guardSeconds = Math.max(0, s.guardSeconds - dt);
  }
  private beginPreparation(t: ThreatState): void {
    t.phase = "preparation"; t.remainingSeconds = 3; t.lastActionHit = false;
    t.targetPosition = { ...t.position };
    t.damage = Math.ceil(definition(t.id).damage * (1 + this.state.presence / 100));
  }
  private prepareOrApproach(t: ThreatState): boolean {
    const d = definition(t.id);
    if (d.speed === 0 || distance(this.state.position, t.position) <= d.reach + EPSILON) {
      this.beginPreparation(t); return true;
    }
    t.phase = "approach"; t.remainingSeconds = 0; t.lastActionHit = false;
    return false;
  }
  private disengage(t: ThreatState): void {
    t.aggro = false; t.remainingSeconds = 0; t.lastActionHit = false;
    t.phase = distance(t.position, definition(t.id).position) > EPSILON ? "returning" : "dormant";
  }
  private returnHome(t: ThreatState, dt: number): void {
    this.moveThreat(t, definition(t.id).position, dt);
    if (distance(t.position, definition(t.id).position) <= EPSILON) {
      t.phase = "dormant"; t.targetPosition = { ...t.position };
    }
  }
  private moveThreat(t: ThreatState, destination: Position, dt: number): void {
    const speed = definition(t.id).speed;
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
    t.position.x += (next.x - t.position.x) * amount;
    t.position.z += (next.z - t.position.z) * amount;
  }
  private advanceThreat(t: ThreatState, dt: number): void {
    if (!t.active || t.health <= 0) return;
    const d = definition(t.id);
    if (t.phase === "returning") { this.returnHome(t, dt); return; }
    if (!t.aggro) {
      if (d.disposition !== "hostile" || distance(this.state.position, t.position) > d.aggroRange) return;
      t.aggro = true; this.prepareOrApproach(t);
      return;
    }
    if (this.state.position.z <= 2 || distance(this.state.position, d.position) > d.leash || distance(t.position, d.position) > d.leash) {
      this.disengage(t); return;
    }
    if (t.phase === "approach") {
      this.moveThreat(t, this.state.position, dt);
      if (distance(this.state.position, t.position) <= d.reach + EPSILON) this.beginPreparation(t);
      return;
    }
    t.remainingSeconds -= dt;
    if (t.remainingSeconds > EPSILON) return;
    const overrun = Math.max(0, -t.remainingSeconds);
    if (t.phase === "preparation") {
      t.phase = "action"; t.remainingSeconds = 0.35 - overrun; t.actionSequence += 1;
      t.lastActionHit = distance(this.state.position, t.targetPosition) <= d.reach + EPSILON;
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
    } else {
      if (this.prepareOrApproach(t)) t.remainingSeconds -= overrun;
    }
  }
  private hurt(damage: number): void {
    const s = this.state;
    s.health = Math.max(0, s.health - damage * (s.guardSeconds > EPSILON ? 0.5 : 1));
    if (s.health > 0) return;
    s.phase = "lost"; s.cargo = 0; s.carriedRelics = 0; s.carriedSalvage = 0; s.supplies = 0; s.bankedRelics = 0;
    this.lootOpenId = null;
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
function groundPosition(value: unknown): Vector {
  const p = record(value);
  return { x: number(p.x, -12, 12), y: number(p.y, 0, 0), z: number(p.z, -14, 45) };
}
function readSave(serialized: string): State {
  let parsed: unknown;
  try { parsed = JSON.parse(serialized); }
  catch { throw new Error("Invalid adventure save: unreadable saved data."); }
  const root = record(parsed);
  if (root.version !== 1 && root.version !== 2 && root.version !== 3) throw new Error("Unsupported adventure save version.");
  const s = record(root.state), p = record(s.position);
  if (!Array.isArray(s.threats) || s.threats.length !== DEFINITIONS.length) throw new Error("Invalid adventure save: missing threats.");
  const threats: ThreatState[] = s.threats.map((value: unknown) => {
    const t = record(value);
    const id = choice(t.id, DEFINITIONS.map(d => d.id));
    const phase = choice(t.phase, root.version === 1
      ? ["dormant", "preparation", "action", "recovery", "cleared"] as const
      : ["dormant", "approach", "preparation", "action", "recovery", "returning", "cleared"] as const);
    const health = number(t.health, 0, definition(id).health);
    const active = boolean(t.active);
    if ((health === 0) !== (phase === "cleared") || (!active && phase !== "dormant") || (id !== "ritual-guardian" && !active)) {
      throw new Error("Invalid adventure save: inconsistent threat.");
    }
    const result: ThreatState = { id, health, active, phase, remainingSeconds: number(t.remainingSeconds, 0, PHASE_SECONDS[phase]),
      actionSequence: number(t.actionSequence, 0, Number.MAX_SAFE_INTEGER, true), lastActionHit: boolean(t.lastActionHit),
      damage: number(t.damage, definition(id).damage, Number.MAX_SAFE_INTEGER, true),
      position: root.version === 1 ? { ...definition(id).position } : groundPosition(t.position),
      targetPosition: root.version === 1 ? { ...definition(id).position } : groundPosition(t.targetPosition),
      aggro: root.version === 1 ? phase !== "dormant" && phase !== "cleared" : boolean(t.aggro),
      lootClaimed: root.version === 3 ? boolean(t.lootClaimed) : id === "ritual-guardian" && health === 0,
    };
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
    carriedSalvage: root.version === 3 ? number(s.carriedSalvage, 0, DEFINITIONS.length - 1, true) : 0,
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
