import { expect, test } from "bun:test";
import { createAdventure, createSharedAdventure } from "./adventure.js";
import { earnedChapter, foremanFixture, tap } from "./yard-test-fixtures.js";

test("owned gear changes immediately in town and in the field; slot and ownership still apply", () => {
  for (const phase of ["town", "expedition"] as const) {
    const save = JSON.parse(createAdventure().save());
    save.state.chapter = earnedChapter(1);
    Object.assign(save.state, { phase, position: { x: 0, y: 0, z: phase === "town" ? -5 : 3 } });
    const game = createAdventure({ save: JSON.stringify(save) });
    game.equip("mainhand", "insulated-coat"); game.equip("mainhand", "yard-weapon");
    expect(game.snapshot.progression.equipment.mainhand).toBeNull();
    game.equip("chest", "insulated-coat");
    expect(game.snapshot.progression.damageReduction).toBe(2);
    expect(game.snapshot.combat.queued).toHaveLength(0);
    game.equip("chest", null);
    expect(game.snapshot.progression.damageReduction).toBe(0);
  }
});

test("combat gear takes a zero-stamina turn, moves within the plan, and changes stats only on resolution", () => {
  const game = foremanFixture(true);
  game.equip("chest", null);
  const move = game.snapshot.combat.queued[0]!;
  expect(move).toMatchObject({ action: "equip", cost: 0, status: "pending", gear: { slot: "chest", item: null } });
  game.moveQueuedAction(move.id, 2);
  tap(game, "guard"); tap(game, "guard");
  expect(game.snapshot.combat.queued).toHaveLength(3);
  game.equip("mainhand", null);
  expect(game.snapshot.report).toContain("Three moves already fill");
  expect(game.snapshot.combat.queued).toHaveLength(3);
  expect(game.snapshot.progression.damageReduction).toBe(2);
  const restored = createAdventure({ save: game.save() });
  expect(restored.snapshot.combat).toEqual(game.snapshot.combat);
  restored.advance(restored.snapshot.combat.remainingSeconds + 1.999);
  expect(restored.snapshot.progression.damageReduction).toBe(2);
  restored.advance(.002);
  expect(restored.snapshot.progression.damageReduction).toBe(0);
  expect(restored.snapshot.player.stamina).toBe(5);
  expect(restored.snapshot.player.currentAction).toBe("equip");
  expect(createAdventure({ save: restored.save() }).snapshot.progression.damageReduction).toBe(0);
});

test("pending gear can be swapped, cancelled, or replaced without applying its stats", () => {
  const game = foremanFixture(true);
  game.equip("chest", null); tap(game, "guard");
  const gear = game.snapshot.combat.queued[0]!, guard = game.snapshot.combat.queued[1]!;
  game.moveQueuedAction(gear.id, 1);
  expect(game.snapshot.combat.queued.map(move => move.id)).toEqual([guard.id, gear.id]);
  expect(game.replaceQueuedAction(gear.id, "brace")).toBe(true);
  expect(game.snapshot.combat.queued[1]).not.toHaveProperty("gear");
  game.equip("mainhand", null);
  const removal = game.snapshot.combat.queued[2]!;
  game.removeQueuedAction(removal.id);
  expect(game.snapshot.combat.queued).toHaveLength(2);
  expect(game.snapshot.progression.equipment).toEqual({ chest: "insulated-coat", mainhand: "yard-weapon" });
});

test("planned gear rejects invalid slots and unowned saved items", () => {
  const game = foremanFixture(true);
  game.equip("mainhand", "insulated-coat");
  expect(game.snapshot.combat.queued).toHaveLength(0);
  game.equip("chest", "insulated-coat");
  const save = JSON.parse(game.save());
  save.state.combat.queued[0].gear.slot = "mainhand";
  expect(() => createAdventure({ save: JSON.stringify(save) })).toThrow("gear does not fit");
  save.state.combat.queued[0].gear.slot = "chest";
  save.state.chapter.ownedGear = ["yard-weapon"];
  save.state.chapter.equipment.chest = null;
  expect(() => createAdventure({ save: JSON.stringify(save) })).toThrow("planned gear is not owned");
});

test("shared-world gear plans persist through saved rejoin and resolve on the shared turn", () => {
  const seed = createSharedAdventure(); seed.join("mage", "Mage", "mage");
  seed.join("town", "Town", "warrior");
  const saved = JSON.parse(seed.save());
  saved.characters[0].state.chapter = earnedChapter(2);
  saved.characters[1].state.chapter = earnedChapter(2);
  Object.assign(saved.characters[0].state, { phase: "expedition", position: { x: -3, y: 0, z: 8 } });
  const world = createSharedAdventure({ save: JSON.stringify(saved) });
  const mage = world.join("mage", "Mage", "mage");
  tap(mage, "strike"); world.advance(.01);
  const town = world.join("town", "Town", "warrior");
  town.equip("chest", "insulated-coat");
  expect(town.snapshot.progression.damageReduction).toBe(2);
  expect(town.snapshot.combat.queued).toHaveLength(0);
  mage.equip("mainhand", "yard-weapon");
  expect(mage.snapshot.combat.queued[1]).toMatchObject({ action: "equip", offsetSeconds: 1, status: "pending" });
  expect(mage.snapshot.progression.equipment.mainhand).toBeNull();
  const reopened = createSharedAdventure({ save: world.save() });
  const rejoined = reopened.join("mage", "Mage", "mage");
  expect(rejoined.snapshot.combat.queued).toEqual(mage.snapshot.combat.queued);
  reopened.advance(1);
  expect(rejoined.snapshot.progression.equipment.mainhand).toBe("yard-weapon");
  expect(rejoined.snapshot.progression.attackBonus).toBe(mage.snapshot.progression.attackBonus + 3);
});
