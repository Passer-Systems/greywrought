import { terrainHeight } from "./cave-layout.js";
import { expect, test } from "bun:test";
import { createAdventure, createSharedAdventure } from "./adventure.js";

function atBank() {
  const save = JSON.parse(createAdventure().save());
  Object.assign(save.state, { position: { x: -9, y: terrainHeight(-9, -10), z: -10 }, potions: 3 });
  return createAdventure({ save: JSON.stringify(save) });
}

test("bank exchanges actual goods, rejects stale quantities, and restores holdings", () => {
  const game = atBank();
  game.interactNpc("bank");
  expect(game.snapshot.bankOpen).toBe(true);
  expect(game.bankTransfer("deposit", "supplies", 10)).toBe(true);
  expect(game.bankTransfer("deposit", "supplies", 10)).toBe(false);
  expect(game.bankTransfer("deposit", "potions", 2)).toBe(true);
  expect(game.bankTransfer("withdraw", "potions", 3)).toBe(false);
  for (const quantity of [0, -1, 1.5, NaN, Infinity]) expect(game.bankTransfer("withdraw", "supplies", quantity)).toBe(false);
  expect(game.bankTransfer("withdraw", "supplies", 4)).toBe(true);
  expect(game.bankTransfer("withdraw", "potions", 1)).toBe(true);
  expect(game.snapshot).toMatchObject({ supplies: 9, potions: 2, bank: { supplies: 6, potions: 1 } });
  const restored = createAdventure({ save: game.save() });
  expect(restored.snapshot).toMatchObject({ supplies: 9, potions: 2, bank: { supplies: 6, potions: 1 }, bankOpen: false });
  game.setCameraForward(1, 0); game.setAction("forward", true); game.advance(1); game.setAction("forward", false);
  expect(game.snapshot.bankOpen).toBe(false);
  expect(game.bankTransfer("withdraw", "supplies", 1)).toBe(false);
  const older = JSON.parse(game.save()); delete older.state.bank;
  expect(createAdventure({ save: JSON.stringify(older) }).snapshot.bank).toEqual({ supplies: 0, potions: 0 });
});

test("bank stays character-owned through private fork, saved pause, and rejoin", () => {
  const seed = createSharedAdventure();
  seed.join("alice", "Alice", "warrior"); seed.join("bob", "Bob", "mage");
  const saved = JSON.parse(seed.save());
  for (const entry of saved.characters) entry.state.position = { x: -9, y: terrainHeight(-9, -10), z: -10 };
  let world = createSharedAdventure({ save: JSON.stringify(saved) });
  let alice = world.join("alice", "Alice", "warrior");
  const bob = world.join("bob", "Bob", "mage");
  alice.interactNpc("bank"); bob.interactNpc("bank");
  expect(alice.bankTransfer("deposit", "supplies", 10)).toBe(true);
  expect(bob.bankTransfer("withdraw", "supplies", 10)).toBe(false);
  expect(world.pause("alice")).toBe(true);
  expect(alice.bankTransfer("withdraw", "supplies", 1)).toBe(false);
  world = createSharedAdventure({ save: world.save() }); alice = world.join("alice", "Alice", "warrior");
  expect(world.resume("alice")).toBe(true); alice.interactNpc("bank");
  expect(alice.bankTransfer("deposit", "supplies", 1)).toBe(false);
  expect(alice.bankTransfer("withdraw", "supplies", 1)).toBe(false);
  expect(world.rejoin("alice")).toBe(true); alice.interactNpc("bank");
  expect(world.session("alice").mode).toBe("viewing");
  expect(alice.bankTransfer("withdraw", "supplies", 10)).toBe(false);
  expect(world.rejoin("alice")).toBe(true);
  expect(world.session("alice").mode).toBe("shared");
  alice.interactNpc("bank");
  expect(alice.bankTransfer("withdraw", "supplies", 10)).toBe(true);
  expect(alice.bankTransfer("withdraw", "supplies", 10)).toBe(false);
  expect(alice.snapshot).toMatchObject({ supplies: 15, bank: { supplies: 0, potions: 0 } });
  expect(world.join("bob", "Bob", "mage").snapshot).toMatchObject({ supplies: 15, bank: { supplies: 0, potions: 0 } });
});
