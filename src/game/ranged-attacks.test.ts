import { describe, expect, test } from "bun:test";
import { createAdventure } from "./adventure.js";
import type { AdventureAction, AdventureGame } from "./adventure-types.js";
import { terrainHeight } from "./cave-layout.js";

function tap(game: AdventureGame, action: AdventureAction): void {
  game.setAction(action, true); game.setAction(action, false);
}
function rangedAt(archetype: "mage" | "hunter"): AdventureGame {
  const saved = JSON.parse(createAdventure({ archetype }).save());
  saved.state.phase = "expedition";
  saved.state.position = { x: 0, y: 0, z: 22.5 };
  for (const enemy of saved.state.threats) enemy.rng = 9844;
  return createAdventure({ archetype, save: JSON.stringify(saved) });
}

describe("class ranged attacks", () => {
  test("Attack readiness accounts for the grid positions used when combat begins", () => {
    for (const [x, z, ready] of [[10.6519, 23.5671, false], [12.5, 22.5, true]] as const) {
      const saved = JSON.parse(createAdventure().save());
      saved.state.phase = "expedition";
      saved.state.position = {x, y: terrainHeight(x, z), z};
      const bee = saved.state.threats.find((t: {id: string}) => t.id === "nest");
      bee.position = {x: 15.2756, y: terrainHeight(15.2756, 25.2756), z: 25.2756};
      const game = createAdventure({save: JSON.stringify(saved)}); game.selectTarget("nest");
      expect(Math.hypot(x - bee.position.x, z - bee.position.z)).toBeLessThan(5);
      expect(game.snapshot.threats.find(t => t.id === "nest")!.canStrike).toBe(ready);
      tap(game, "strike");
      if (ready) { game.readyCombat(); game.advance(.01); }
      expect(game.snapshot.threats.find(t => t.id === "nest")!.health).toBe(ready ? 54 : 72);
    }
  });
  test("mage Arcane Bolt hits beyond melee reach without moving the player", () => {
    const game = rangedAt("mage");
    game.selectTarget("scout");
    const before = game.snapshot.player.position;
    tap(game, "strike"); game.readyCombat(); game.advance(0.01);
    expect(game.snapshot.threats.find(t => t.id === "scout")?.health).toBe(78);
    expect(game.snapshot.player.position).toEqual(before);
    expect(game.snapshot.player.maneuver).toBe("none");
  });

  test("ranger Aimed Shot hits beyond melee reach without moving the player", () => {
    const game = rangedAt("hunter");
    game.selectTarget("scout");
    const before = game.snapshot.player.position;
    tap(game, "strike"); game.readyCombat(); game.advance(0.01);
    expect(game.snapshot.threats.find(t => t.id === "scout")?.health).toBe(78);
    expect(game.snapshot.player.position).toEqual(before);
    expect(game.snapshot.player.maneuver).toBe("none");
  });

  test("warrior queued strike stays in melee without moving", () => {
    const saved = JSON.parse(createAdventure({ archetype: "warrior" }).save());
    saved.state.phase = "expedition"; saved.state.position = { x: -3, y: 0, z: 28.1 };
    for (const enemy of saved.state.threats) enemy.rng = 9844;
    const game = createAdventure({ archetype: "warrior", save: JSON.stringify(saved) });
    game.selectTarget("scout"); tap(game, "strike"); game.readyCombat(); game.advance(0.01);
    expect(game.snapshot.player.maneuver).toBe("none");
  });
});
