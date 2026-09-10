import { expect, test } from "bun:test";
import { createAdventure, createSharedAdventure } from "./adventure.js";
import { earnedChapter, foremanFixture, tap } from "./yard-test-fixtures.js";

test("gear outside combat changes immediately with slot and ownership validation", () => {
  for (const phase of ["town", "expedition"] as const) {
    const save = JSON.parse(createAdventure().save());
    save.state.chapter = earnedChapter(1);
    Object.assign(save.state, { phase, position: { x: 0, y: 0, z: phase === "town" ? -5 : 3 } });
    const game = createAdventure({ save: JSON.stringify(save) });
    game.equip("mainhand", "insulated-coat"); game.equip("mainhand", "yard-weapon");
    expect(game.snapshot.progression.equipment.mainhand).toBeNull();
    game.equip("chest", "insulated-coat");
    expect(game.snapshot.progression.damageReduction).toBe(2);
    expect(game.snapshot.combat.globalCooldown).toBe(0);
    game.equip("chest", null);
    expect(game.snapshot.progression.damageReduction).toBe(0);
  }
});

test("equipment changes during auto attacks cost no stamina and persist immediately", () => {
  const game = foremanFixture(true); game.advance(1); tap(game, "strike"); game.advance(.01);
  const stamina = game.snapshot.player.stamina;
  game.equip("chest", null);
  expect(game.snapshot.progression.damageReduction).toBe(0);
  expect(game.snapshot.player.stamina).toBe(stamina);
  expect(game.snapshot.player.currentAction).toBe("equip");
  expect(game.snapshot.combat.globalCooldown).toBeCloseTo(1.5);
  game.equip("chest", "insulated-coat");
  expect(game.snapshot.progression.damageReduction).toBe(0);
  expect(game.snapshot.combat.autoAttack).toBe(true);
  expect(createAdventure({ save: game.save() }).snapshot.progression.damageReduction).toBe(0);
});

test("shared-world gear belongs to its character and survives saved rejoin", () => {
  const seed = createSharedAdventure(); seed.join("mage", "Mage", "mage"); seed.join("town", "Town", "warrior");
  const saved = JSON.parse(seed.save());
  for (const character of saved.characters) character.state.chapter = earnedChapter(2);
  Object.assign(saved.characters[0].state, { phase: "expedition", position: { x: -3, y: 0, z: 8 } });
  const world = createSharedAdventure({ save: JSON.stringify(saved) });
  const mage = world.join("mage", "Mage", "mage"), town = world.join("town", "Town", "warrior");
  tap(mage, "strike"); world.advance(.01);
  town.equip("chest", "insulated-coat"); mage.equip("mainhand", "yard-weapon");
  expect(town.snapshot.progression.damageReduction).toBe(2);
  expect(mage.snapshot.progression.damageReduction).toBe(0);
  expect(mage.snapshot.progression.equipment.mainhand).toBe("yard-weapon");
  expect(town.snapshot.progression.equipment.mainhand).toBeNull();
  const rejoined = createSharedAdventure({ save: world.save() }).join("mage", "Mage", "mage");
  expect(rejoined.snapshot.progression).toEqual(mage.snapshot.progression);
});
