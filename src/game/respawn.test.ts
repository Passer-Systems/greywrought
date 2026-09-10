import { describe, expect, test } from "bun:test";
import { createSharedAdventure, WORLD_RESPAWN_MILLISECONDS } from "./adventure.js";
import type { AdventureAction, AdventureGame } from "./adventure-types.js";

function tap(game: AdventureGame, action: AdventureAction): void {
  game.setAction(action, true); game.setAction(action, false);
}
function seed() {
  const world = createSharedAdventure();
  world.join("a", "Ada", "mage");
  const saved = JSON.parse(world.save());
  Object.assign(saved.characters[0].state, { phase: "expedition", position: { x: -3, y: 0, z: 8 }, supplies: 47 });
  return saved;
}
function dead(threat: ReturnType<typeof seed>["world"]["threats"][number]): void {
  Object.assign(threat, { health: 0, active: true, phase: "cleared", aggro: false, moving: false, lootClaimed: true });
  delete threat.respawnAt;
}

describe("two-minute world regrowth", () => {
  test("an actual kill respawns at exactly 120 wall-clock seconds and closes every corpse window", () => {
    let time = 10_000;
    const saved = seed(); saved.world.threats[0].health = 9;
    saved.characters.push({ ...structuredClone(saved.characters[0]), id: "b", name: "Bram" });
    const world = createSharedAdventure({ save: JSON.stringify(saved), now: () => time });
    const a = world.join("a", "Ada", "mage");
    const b = world.join("b", "Bram", "mage");
    tap(a, "strike"); world.advance(0.01);
    expect(a.snapshot.threats[0]!.health).toBe(0);
    expect(JSON.parse(world.save()).world.threats[0].respawnAt).toBe(time + WORLD_RESPAWN_MILLISECONDS);
    a.openLoot("scout"); expect(a.snapshot.lootOpenId).toBe("scout");
    b.openLoot("scout"); expect(b.snapshot.lootOpenId).toBe("scout");
    world.leave("b");
    time += 119_999; world.advance(0);
    expect(a.snapshot.threats[0]!.health).toBe(0);
    time += 1; world.advance(0);
    expect(a.snapshot.threats[0]!.health).toBe(96);
    expect(a.snapshot.threats[0]!.position).toEqual({ x: -3, y: 0, z: 10 });
    expect(a.snapshot.loot.some(corpse => corpse.sourceId === "scout")).toBe(false);
    expect(a.snapshot.lootOpenId).toBeNull();
    expect(b.snapshot.lootOpenId).toBeNull();
  });

  test("legacy dead enemies and depleted cores get deadlines without losing characters; the guardian stays dead", () => {
    let time = 20_000;
    const saved = seed();
    for (const threat of saved.world.threats) dead(threat);
    saved.world.ritualCalled = true; saved.world.resourceRemaining = 0;
    delete saved.world.resourceRespawns;
    const world = createSharedAdventure({ save: JSON.stringify(saved), now: () => time });
    const pending = JSON.parse(world.save());
    expect(pending.world.threats[0].respawnAt).toBe(140_000);
    expect(pending.world.threats[4].respawnAt).toBe(140_000);
    time += 119_999; world.advance(0);
    expect(JSON.parse(world.save()).world.resourceRemaining).toBe(0);
    time++; world.advance(0);
    const returned = world.join("a", "Ada", "mage");
    expect(returned.snapshot.threats.filter(t => t.id !== "ritual-guardian").every(t => t.health === t.maximumHealth)).toBe(true);
    expect(returned.snapshot.threats[4]!.health).toBe(0);
    expect(returned.snapshot.ritualCalled).toBe(true);
    expect(returned.snapshot.resourceRemaining).toBe(12);
    expect(returned.snapshot.supplies).toBe(47);
    expect(returned.snapshot.player.position).toEqual(saved.characters[0].state.position);
  });

  test("restart preserves the remaining wait, including downtime, without advancing combat or characters offline", () => {
    let time = 30_000;
    const saved = seed(); dead(saved.world.threats[1]);
    const world = createSharedAdventure({ save: JSON.stringify(saved), now: () => time });
    const player = world.join("a", "Ada", "mage");
    world.advance(0.1);
    world.leave("a");
    const paused = JSON.parse(world.save());
    time += 60_000;
    const restored = createSharedAdventure({ save: JSON.stringify(paused), now: () => time });
    restored.advance(1000);
    const midway = JSON.parse(restored.save());
    expect(midway.world.threats[1].health).toBe(0);
    expect(midway.world.threats[1].respawnAt).toBe(150_000);
    expect(midway).not.toHaveProperty("clock");
    expect(midway.characters).toEqual(paused.characters);
    expect(midway.world.threats[0]).toEqual(paused.world.threats[0]);
    const beforeDowntime = restored.save();
    time += 60_000;
    const afterDowntime = createSharedAdventure({ save: beforeDowntime, now: () => time });
    expect(afterDowntime.join("a", "Ada", "mage").snapshot.threats[1]!.health).toBe(72);
    expect(player.snapshot.player.health).toBe(paused.characters[0].state.health);
  });

  test("respawning rebuilds all enemy runtime, targeting, loot, ramp, shield, and sequence state", () => {
    let time = 40_000;
    const saved = seed();
    const initial = structuredClone(saved.world.threats);
    for (const threat of saved.world.threats.filter((t: { id: string }) => t.id !== "ritual-guardian")) {
      dead(threat);
      Object.assign(threat, { position: { x: -8, y: 0, z: 22 }, targetPosition: { x: -7, y: 0, z: 20 }, targetPlayerId: "a",
        remainingSeconds: 1, actionSequence: 12, lastActionHit: true, damage: 36, patrolIndex: 3 });
      if (threat.head) Object.assign(threat.head, { opened: true, block: 6, blockSeconds: 2, volley: 9, projectileSequence: 11,
        ability: "fireball", castVolley: 9, pendingFireballs: 8, nextFireballSeconds: .2,
        fireballs: [{ id: 11, origin: { x: -3, y: 0, z: 10 }, remainingSeconds: 0.5, duration: 0.9, damage: 18 }] });
      if (threat.wolf) Object.assign(threat.wolf, { circling: true, nextAttackSeconds: 1, facing: { x: 1, y: 0, z: 0 },
        attackOrigin: { x: -8, y: 0, z: 20 }, motion: { kind: "lunge", start: { x: -8, y: 0, z: 20 }, destination: { x: -7, y: 0, z: 20 }, remainingSeconds: 0.5, duration: 0.65 } });
    }
    const world = createSharedAdventure({ save: JSON.stringify(saved), now: () => time });
    time += WORLD_RESPAWN_MILLISECONDS; world.advance(0);
    const fresh = JSON.parse(world.save()).world.threats;
    for (let i = 0; i < 4; i++) {
      const { rng: _oldSeed, ...expected } = initial[i];
      const { rng: _newSeed, ...actual } = fresh[i];
      expect(actual).toEqual(expected);
    }
  });

  test("each harvested batch returns independently after 120 seconds and retains its deadline through restart", () => {
    let time = 50_000;
    const saved = seed();
    saved.characters[0].state.position = { x: -2, y: 0, z: 12 };
    dead(saved.world.threats[0]); dead(saved.world.threats[2]);
    const world = createSharedAdventure({ save: JSON.stringify(saved), now: () => time });
    const player = world.join("a", "Ada", "mage");
    tap(player, "gather"); expect(player.snapshot.resourceRemaining).toBe(9);
    time += 2000; world.advance(2);
    tap(player, "gather"); expect(player.snapshot.resourceRemaining).toBe(6);
    world.leave("a");
    const restored = createSharedAdventure({ save: world.save(), now: () => time });
    time = 169_999; restored.advance(0);
    expect(JSON.parse(restored.save()).world.resourceRemaining).toBe(6);
    time++; restored.advance(0);
    expect(JSON.parse(restored.save()).world.resourceRemaining).toBe(9);
    time += 2000; restored.advance(0);
    expect(JSON.parse(restored.save()).world.resourceRemaining).toBe(12);
    expect(restored.join("a", "Ada", "mage").snapshot.cargo).toBe(6);
  });

  test("repeated harvest and loot rewards survive saves above the old one-trip limits", () => {
    const saved = seed();
    Object.assign(saved.characters[0].state, { cargo: 15, carriedSalvage: 5 });
    const world = createSharedAdventure({ save: JSON.stringify(saved) });
    const player = world.join("a", "Ada", "mage");
    expect(player.snapshot.cargo).toBe(15);
    expect(player.snapshot.carriedSalvage).toBe(5);
  });
});
