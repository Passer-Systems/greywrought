import { describe, expect, test } from "bun:test";
import { createSharedAdventure } from "./adventure.js";
import type { AdventureAction, AdventureGame, SharedAdventure } from "./adventure-types.js";

function tap(player: AdventureGame, action: AdventureAction): void {
  player.setAction(action, true); player.setAction(action, false);
}
function enemy(player: AdventureGame) { return player.snapshot.threats.find(t => t.id === "scout")!; }
function fixture(second = true): SharedAdventure {
  const world = createSharedAdventure();
  world.join("a", "Ada", "mage");
  if (second) world.join("b", "Bram", "hunter");
  const save = JSON.parse(world.save());
  for (const entry of save.characters) {
    entry.state.phase = "expedition";
    entry.state.position = { x: -3, y: 0, z: entry.id === "a" ? 8 : 7 };
  }
  for (const t of save.world.threats) {
    t.rng = 9844;
    if (t.id === "scout") t.remainingSeconds = 0.75;
    else if (t.active) Object.assign(t, { health: 0, phase: "cleared", lootClaimed: true });
  }
  const restored = createSharedAdventure({ save: JSON.stringify(save) });
  restored.join("a", "Ada", "mage");
  if (second) restored.join("b", "Bram", "hunter");
  return restored;
}

describe("one shared Frostwood", () => {
  test("characters move independently and only the world advances time", () => {
    const world = createSharedAdventure(), a = world.join("a", "Ada", "mage"), b = world.join("b", "Bram", "hunter");
    a.setCameraForward(1, 0); b.setCameraForward(-1, 0);
    a.setAction("forward", true); b.setAction("forward", true);
    world.advance(1);
    expect(a.snapshot.player.position.x).toBeCloseTo(4.5);
    expect(b.snapshot.player.position.x).toBeCloseTo(-4.5);
    expect(world.players().map(p => p.name)).toEqual(["Ada", "Bram"]);
    expect(() => a.advance(1)).toThrow("shared adventure");
  });

  test("both characters damage one enemy and only the threatened character's defense absorbs its cast", () => {
    const world = fixture(), a = world.getPlayer("a")!, b = world.getPlayer("b")!;
    tap(a, "strike"); tap(b, "strike"); world.advance(.01);
    expect(enemy(a).health).toBe(78); expect(enemy(b).health).toBe(78);
    expect(enemy(a).targetPlayerId).toBe("a");
    expect(enemy(a).actionSequence).toBe(0);
    expect(a.snapshot.player.health).toBe(100); expect(b.snapshot.player.health).toBe(100);
    tap(a, "strike"); tap(b, "strike");
    const cast = enemy(a).cast!;
    world.advance(cast.remainingSeconds - .1); tap(a, "brace");
    world.advance(.2);
    expect(a.snapshot.player.health).toBe(100);
    expect(a.snapshot.player.block).toBe(24 - cast.ability.damage);
    expect(b.snapshot.player.block).toBe(0);
    expect(b.snapshot.player.stamina).toBe(5);
  });

  test("another character neither doubles enemy time nor redirects damage to their block", () => {
    const solo = fixture(false), shared = fixture();
    const a = shared.getPlayer("a")!, b = shared.getPlayer("b")!;
    solo.advance(.01); shared.advance(.01);
    const cast = enemy(a).cast!;
    expect(enemy(solo.getPlayer("a")!).cast).toEqual(cast);
    solo.advance(cast.remainingSeconds - .1); shared.advance(cast.remainingSeconds - .1);
    tap(b, "brace"); solo.advance(.2); shared.advance(.2);
    expect(a.snapshot.player.health).toBe(solo.getPlayer("a")!.snapshot.player.health);
    expect(a.snapshot.player.health).toBe(100 - cast.ability.damage);
    expect(b.snapshot.player.health).toBe(100); expect(b.snapshot.player.block).toBe(24);
    expect(enemy(a).actionSequence).toBe(enemy(solo.getPlayer("a")!).actionSequence);
  });

  test("disconnect retains the character and shared save retains online and offline progress", () => {
    const world = fixture(), a = world.getPlayer("a")!, b = world.getPlayer("b")!;
    tap(a, "strike"); world.advance(0.02);
    const health = a.snapshot.player.health, position = a.snapshot.player.position;
    a.setAction("forward", true); world.leave("a"); world.advance(0.1);
    expect(world.getPlayer("a")?.snapshot.player.health).toBe(health);
    expect(world.session("a").mode).toBe("paused");
    expect(enemy(b).targetPlayerId).toBe("b");
    const restored = createSharedAdventure({ save: world.save() });
    const returned = restored.join("a", "Ada", "mage"), partner = restored.join("b", "Bram", "hunter");
    expect(restored.session("a").mode).toBe("paused");
    expect(restored.resume("a")).toBe(true);
    expect(restored.rejoin("a")).toBe(false);
    expect(returned.snapshot.player.health).toBe(health);
    expect(returned.snapshot.player.position).toEqual(position);
    expect(enemy(returned).health).toBe(87);
    expect(partner.snapshot.player.health).toBe(b.snapshot.player.health);
    expect(returned.snapshot.combat.autoAttack).toBe(false);
    restored.advance(0.1);
    expect(returned.snapshot.player.position).toEqual(position);
    expect(() => restored.join("a", "Ada", "warrior")).toThrow("calling");
  });

  test("one corpse yields one shared reward and a town visit never resets the forest", () => {
    const seed = JSON.parse(fixture().save()); seed.world.threats[0].health = 9; seed.world.resourceRemaining = 3;
    const world = createSharedAdventure({ save: JSON.stringify(seed) });
    const a = world.join("a", "Ada", "mage"), b = world.join("b", "Bram", "hunter");
    tap(a, "strike"); world.advance(0.01);
    a.openLoot("scout"); b.openLoot("scout");
    tap(a, "takeLoot"); tap(b, "takeLoot");
    expect(a.snapshot.carriedSalvage).toBe(1);
    expect(b.snapshot.carriedSalvage).toBe(0);
    a.setCameraForward(0, -1); a.setAction("forward", true); world.advance(2); a.setAction("forward", false);
    expect(a.snapshot.phase).toBe("town");
    expect(b.snapshot.phase).toBe("expedition");
    expect(a.snapshot.supplies).toBe(16);
    a.setCameraForward(0, 1); a.setAction("forward", true); world.advance(1); a.setAction("forward", false);
    expect(a.snapshot.phase).toBe("expedition");
    expect(enemy(a).health).toBe(0);
    expect(enemy(b).health).toBe(0);
    expect(a.snapshot.resourceRemaining).toBe(3);
    expect(b.snapshot.loot.find(t => t.sourceId === "scout")!.available).toBe(false);
  });
});
