import { describe, expect, test } from "bun:test";
import { createAdventure } from "./adventure.js";
import type { AdventureGame } from "./adventure-types.js";
import type { CharacterArchetype } from "../host/character-profile.js";
import { finishCycle, tap } from "./yard-test-fixtures.js";

function setup(archetype: CharacterArchetype = "mage", z = 28.1): AdventureGame {
  const saved = JSON.parse(createAdventure({ archetype }).save());
  Object.assign(saved.state, { phase: "expedition", position: { x: -3, y: 0, z } });
  for (const enemy of saved.state.threats) {
    enemy.rng = 9844;
    if (enemy.active && enemy.id !== "scout") Object.assign(enemy, { health: 0, phase: "cleared", lootClaimed: true });
  }
  const game = createAdventure({ archetype, save: JSON.stringify(saved) });
  game.selectTarget("scout"); game.advance(.01);
  return game;
}
const scout = (game: AdventureGame) => game.snapshot.threats.find(t => t.id === "scout")!;

describe("committed attack resources", () => {
  test("each calling executes only its queued strike without stamina cost or player movement", () => {
    for (const archetype of ["warrior", "mage", "hunter", "alchemist", "artificer"] as const) {
      const game = setup(archetype), position = game.snapshot.player.position;
      const damage = archetype === "alchemist" ? 8 : archetype === "artificer" ? 10 : 9;
      tap(game, "strike");
      expect(scout(game).health).toBe(96);
      game.readyCombat(); game.advance(.001);
      expect(scout(game).health).toBe(96 - damage);
      expect(game.snapshot.player.stamina).toBe(5);
      const sequence = game.snapshot.player.attackSequence;
      finishCycle(game);
      expect(scout(game).health).toBe(96 - damage);
      expect(game.snapshot.player.attackSequence).toBe(sequence);
      expect(game.snapshot.player.position).toEqual(position);
      expect(game.snapshot.player.maneuver).toBe("none");
      game.readyCombat(); finishCycle(game);
      expect(scout(game).health).toBe(96 - damage);
    }
  });

  test("Block reserves stamina during planning and spends it at the chosen slot", () => {
    const game = setup(); game.advance(.001); tap(game, "brace");
    game.moveQueuedAction(game.snapshot.combat.queued[0]!.id, 2);
    expect(game.snapshot.player.block).toBe(0);
    expect(game.snapshot.player.stamina).toBe(5);
    expect(game.snapshot.combat.reservedStamina).toBe(2);
    game.readyCombat(); game.advance(1.99);
    expect(game.snapshot.player.block).toBe(0);
    game.advance(.02);
    expect(game.snapshot.player.block).toBe(24);
    expect(game.snapshot.player.stamina).toBe(3);
  });

  test("stamina recovers outside combat and Block works in town", () => {
    const game = createAdventure(); tap(game, "brace");
    expect(game.snapshot.player.block).toBe(24);
    expect(game.snapshot.player.stamina).toBe(3);
    game.advance(1.499); expect(game.snapshot.player.stamina).toBe(3);
    game.advance(.001); expect(game.snapshot.player.stamina).toBe(4);
    game.advance(1.5); expect(game.snapshot.player.stamina).toBe(5);
  });

  test("an out-of-range melee strike is rejected without lunging or banking damage", () => {
    const game = setup("warrior", 24), position = game.snapshot.player.position;
    tap(game, "strike"); game.readyCombat(); game.advance(.01);
    expect(scout(game).health).toBe(96);
    expect(game.snapshot.combat.queued).toEqual([]);
    expect(game.snapshot.player.position).toEqual(position);
    finishCycle(game);
    game.setCameraForward(0,1);game.setAction("forward",true);game.advance(.5);game.setAction("forward",false);
    game.readyCombat(); game.advance(.1);
    expect(scout(game).health).toBe(96);
  });

  test("the committed spell and queued defense survive saving during planning", () => {
    const game = setup(); game.advance(.01); tap(game, "brace");
    const cast = scout(game).cast!;
    game.setCameraForward(1, 0); game.setAction("forward", true); game.advance(.2); game.setAction("forward", false);
    expect(scout(game).cast).toEqual(cast);
    const reopened = createAdventure({ save: game.save() });
    expect(scout(reopened).cast).toEqual(cast);
    expect(reopened.snapshot.combat).toEqual(game.snapshot.combat);
    expect(reopened.snapshot.player.health).toBe(game.snapshot.player.health);
  });
});
