import { describe, expect, test } from "bun:test";
import { createAdventure } from "./adventure.js";
import type { AdventureGame } from "./adventure-types.js";
import type { CharacterArchetype } from "../host/character-profile.js";
import { tap } from "./yard-test-fixtures.js";

function setup(archetype: CharacterArchetype = "mage", z = 8): AdventureGame {
  const saved = JSON.parse(createAdventure({ archetype }).save());
  Object.assign(saved.state, { phase: "expedition", position: { x: -3, y: 0, z } });
  for (const enemy of saved.state.threats) {
    enemy.rng = 9844;
    if (enemy.active && enemy.id !== "scout") Object.assign(enemy, { health: 0, phase: "cleared", lootClaimed: true });
  }
  const game = createAdventure({ archetype, save: JSON.stringify(saved) });
  game.selectTarget("scout");
  return game;
}
const scout = (game: AdventureGame) => game.snapshot.threats.find(t => t.id === "scout")!;

describe("continuous real-time combat", () => {
  test("autos repeat at 1.5 seconds without stamina or moving the player", () => {
    for (const archetype of ["warrior", "mage", "hunter", "alchemist", "artificer"] as const) {
      const game = setup(archetype, 8.1), position = game.snapshot.player.position;
      const damage = archetype === "alchemist" ? 8 : archetype === "artificer" ? 10 : 9;
      tap(game, "strike"); game.advance(.001);
      expect(scout(game).health).toBe(96 - damage);
      expect(game.snapshot.player.stamina).toBe(5);
      const firstSequence = game.snapshot.player.attackSequence;
      game.advance(1.498);
      expect(scout(game).health).toBe(96 - damage);
      expect(game.snapshot.player.attackSequence).toBe(firstSequence);
      game.advance(.002);
      expect(scout(game).health).toBe(96 - damage * 2);
      expect(game.snapshot.player.attackSequence).toBe(firstSequence + 1);
      expect(game.snapshot.player.stamina).toBe(5);
      expect(game.snapshot.player.position).toEqual(position);
      expect(game.snapshot.player.maneuver).toBe("none");
      tap(game, "strike"); game.advance(1.5);
      expect(game.snapshot.combat.autoAttack).toBe(false);
      expect(scout(game).health).toBe(96 - damage * 2);
    }
  });

  test("Block acts immediately between auto attacks and instant skills share a 1.5-second cooldown", () => {
    const game = setup(); tap(game, "strike"); game.advance(.01);
    const remaining = game.snapshot.combat.autoAttackRemainingSeconds;
    tap(game, "brace");
    expect(game.snapshot.player.currentAction).toBe("brace");
    expect(game.snapshot.player.block).toBe(24);
    expect(game.snapshot.player.stamina).toBe(3);
    expect(game.snapshot.combat.globalCooldown).toBeCloseTo(1.5);
    expect(game.snapshot.combat.autoAttackRemainingSeconds).toBe(remaining);
    tap(game, "brace"); expect(game.snapshot.player.stamina).toBe(3);
    game.advance(1.5); tap(game, "brace");
    expect(game.snapshot.player.stamina).toBe(2);
    expect(game.snapshot.player.attackSequence).toBe(2);
  });

  test("stamina regenerates continuously and Block works in town", () => {
    const game = createAdventure(); tap(game, "brace");
    expect(game.snapshot.player.block).toBe(24);
    expect(game.snapshot.player.stamina).toBe(3);
    game.advance(1.499); expect(game.snapshot.player.stamina).toBe(3);
    game.advance(.001); expect(game.snapshot.player.stamina).toBe(4);
    game.advance(1.5); expect(game.snapshot.player.stamina).toBe(5);
  });

  test("out-of-range melee autos wait, never lunge, and cannot bank burst damage", () => {
    let game = setup("warrior", 5);
    const position = game.snapshot.player.position;
    tap(game, "strike"); game.advance(4);
    expect(scout(game).health).toBe(96);
    expect(game.snapshot.player.position).toEqual(position);
    const saved = JSON.parse(game.save()); saved.state.position = { x: -3, y: 0, z: 8.1 };
    game = createAdventure({ save: JSON.stringify(saved) });
    if (!game.snapshot.combat.autoAttack) tap(game, "strike");
    game.advance(.01);
    expect(scout(game).health).toBe(87);
    const sequence = game.snapshot.player.attackSequence;
    game.advance(.1); expect(game.snapshot.player.attackSequence).toBe(sequence);
  });

  test("committed enemy casts announce at least three seconds and withhold damage", () => {
    const game = setup(); game.advance(.001);
    const cast = scout(game).cast!;
    expect(cast).not.toBeNull(); expect(cast.status).toBe("casting");
    expect(cast.duration).toBeGreaterThanOrEqual(3);
    expect(cast.remainingSeconds).toBeGreaterThanOrEqual(2.999);
    const hp = game.snapshot.player.health;
    game.advance(cast.remainingSeconds - .001);
    expect(game.snapshot.player.health).toBe(hp);
    expect(scout(game).cast!.ability).toEqual(cast.ability);
    game.advance(.002);
    expect(scout(game).actionSequence).toBeGreaterThan(0);
    game.advance(1);
    expect(game.snapshot.player.health).toBeLessThan(hp);
  });

  test("a chosen spell remains committed while its target moves and survives a current save", () => {
    const game = setup(); game.advance(.01);
    const cast = scout(game).cast!;
    tap(game, "brace"); game.setCameraForward(1, 0); game.setAction("forward", true); game.advance(.2); game.setAction("forward", false);
    expect(scout(game).cast!.ability).toEqual(cast.ability);
    expect(scout(game).cast!.remainingSeconds).toBeCloseTo(cast.remainingSeconds - .2);
    const reopened = createAdventure({ save: game.save() });
    expect(scout(reopened).cast).toEqual(scout(game).cast);
    expect(reopened.snapshot.player.health).toBe(game.snapshot.player.health);
  });
});

test("rapid auto toggles cannot shorten the next attack interval", () => {
  const game = setup(); tap(game, "strike");
  const sequence = game.snapshot.player.attackSequence;
  for (let i = 0; i < 5; i++) { tap(game, "strike"); tap(game, "strike"); }
  expect(game.snapshot.player.attackSequence).toBe(sequence);
  expect(scout(game).health).toBe(87);
  game.advance(1.499); expect(scout(game).health).toBe(87);
  game.advance(.001); expect(scout(game).health).toBe(78);
});

test("death and a defeated target stop auto attacks", () => {
  let saved = JSON.parse(setup().save()); saved.state.threats[0].health = 9;
  const victory = createAdventure({ save: JSON.stringify(saved) }); tap(victory, "strike"); victory.advance(.01);
  expect(scout(victory).health).toBe(0); expect(victory.snapshot.combat.autoAttack).toBe(false);
  saved = JSON.parse(setup().save()); saved.state.health = 1;
  const death = createAdventure({ save: JSON.stringify(saved) }); tap(death, "strike"); death.advance(3.1);
  expect(death.snapshot.phase).toBe("lost"); expect(death.snapshot.combat.autoAttack).toBe(false);
});
