import { describe, expect, test } from "bun:test";
import { createAdventure } from "./adventure.js";
import type { AdventureAction, AdventureGame } from "./adventure-types.js";

function tap(game: AdventureGame, action: AdventureAction): void {
  game.setAction(action, true); game.setAction(action, false);
}
function rangedAt(archetype: "mage" | "hunter"): AdventureGame {
  const saved = JSON.parse(createAdventure({ archetype }).save());
  saved.state.phase = "expedition";
  saved.state.position = { x: 0, y: 0, z: 2.5 };
  for (const enemy of saved.state.threats) enemy.rng = 9844;
  return createAdventure({ archetype, save: JSON.stringify(saved) });
}

describe("class ranged attacks", () => {
  test("mage Arcane Bolt hits beyond melee lunge reach without moving the player", () => {
    const game = rangedAt("mage");
    game.selectTarget("scout");
    const before = game.snapshot.player.position;
    tap(game, "strike"); game.advance(0.01); game.advance(5.01);
    expect(game.snapshot.threats.find(t => t.id === "scout")?.health).toBe(87);
    expect(game.snapshot.player.position).toEqual(before);
    expect(game.snapshot.player.maneuver).toBe("none");
  });

  test("ranger Aimed Shot hits beyond melee lunge reach without moving the player", () => {
    const game = rangedAt("hunter");
    game.selectTarget("scout");
    const before = game.snapshot.player.position;
    tap(game, "strike"); game.advance(0.01); game.advance(5.01);
    expect(game.snapshot.threats.find(t => t.id === "scout")?.health).toBe(87);
    expect(game.snapshot.player.position).toEqual(before);
    expect(game.snapshot.player.maneuver).toBe("none");
  });

  test("warrior strike remains a lunge", () => {
    const saved = JSON.parse(createAdventure({ archetype: "warrior" }).save());
    saved.state.phase = "expedition"; saved.state.position = { x: -3, y: 0, z: 8.1 };
    for (const enemy of saved.state.threats) enemy.rng = 9844;
    const game = createAdventure({ archetype: "warrior", save: JSON.stringify(saved) });
    game.selectTarget("scout"); tap(game, "strike"); game.advance(0.01);
    expect(game.snapshot.player.maneuver).toBe("lunge");
  });

  test("mage Froststep and hunter Parting Shot hit at range, then retreat", () => {
    for (const archetype of ["mage", "hunter"] as const) {
      const saved = JSON.parse(createAdventure({ archetype }).save());
      saved.state.phase = "expedition";
      saved.state.position = { x: 0, y: 0, z: 8 };
      saved.state.chapter.accepted = ["cold-hands", "roll-call"];
      saved.state.chapter.completed = ["cold-hands", "roll-call"];
      saved.state.chapter.level = 2;
      const game = createAdventure({ archetype, save: JSON.stringify(saved) });
      game.selectTarget("scout");
      tap(game, "disengage"); game.advance(.01);
      expect(game.snapshot.threats.find(t => t.id === "scout")?.health).toBe(88);
      expect(game.snapshot.player.maneuver).toBe("disengage");
      game.advance(.81);
      expect(game.snapshot.player.maneuver).toBe("none");
      expect(game.snapshot.player.position.z).toBeLessThan(8);
    }
  });
});
