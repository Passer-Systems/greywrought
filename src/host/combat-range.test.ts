import { expect, test } from "bun:test";
import { createAdventure } from "../game/adventure.js";
import { enemyRange, playerRange } from "./combat-range.js";

const base = createAdventure().snapshot;
const origin = { x: 0, y: 0, z: 0 };
const scout = { ...base.threats.find(threat => threat.id === "scout")!, position: { x: 8, y: 0, z: 0 }, canStrike: false };
const snapshot = { ...base, player: { ...base.player, position: origin }, selectedThreat: scout.id, threats: [scout] };

test("attack distance follows class and move, independent of readiness", () => {
  expect(playerRange(snapshot, "strike").state).toBe("out");
  for (const archetype of ["mage", "hunter"] as const) expect(playerRange({ ...snapshot, player: { ...snapshot.player, archetype } }, "strike").state).toBe("in");
  const close = { ...snapshot, threats: [{ ...scout, position: { x: 3, y: 0, z: 0 } }] };
  expect(playerRange(close, "strike").state).toBe("in");
  expect(playerRange(close, "disengage").state).toBe("in");
  expect(playerRange(close, "jab").state).toBe("out");
});

test("queued target identity wins over the selected enemy; self moves have no range cue", () => {
  const next = { ...snapshot, threats: [...snapshot.threats, { ...scout, id: "near", position: origin }], selectedThreat: "near" };
  expect(playerRange(next, "strike").state).toBe("in");
  expect(playerRange(next, "strike", scout.id).state).toBe("out");
  for (const action of ["brace", "guard", "bloodRage", "drinkPotion"] as const) expect(playerRange(next, action).state).toBe("none");
  expect(enemyRange(next, scout, { ...scout.currentAbility, id: "ember-ward", range: 10, damage: 0 }).state).toBe("none");
});

test("Maul includes leap and landing radius before launch, then uses its locked area", () => {
  const hound = { ...base.threats.find(threat => threat.id === "patrol")!, phase: "preparation" as const, position: { x: 10, y: 0, z: 0 }, targetPosition: { x: 9, y: 0, z: 0 } };
  expect(enemyRange(snapshot, hound, hound.currentAbility).state).toBe("in");
  expect(enemyRange(snapshot, { ...hound, position: { x: 11.01, y: 0, z: 0 } }, hound.currentAbility).state).toBe("out");
  expect(enemyRange(snapshot, { ...hound, phase: "action", position: origin }, hound.currentAbility).state).toBe("out");
  expect(enemyRange(snapshot, { ...hound, rootedSeconds: 1 }, hound.currentAbility).state).toBe("out");
});

test("homing range tracks attacker, while ordinary committed areas stay locked", () => {
  const threat = { ...scout, phase: "action" as const, position: origin, targetPosition: { x: 20, y: 0, z: 0 } };
  expect(enemyRange(snapshot, threat, { ...scout.currentAbility, id: "fireball", range: 10 }).state).toBe("in");
  expect(enemyRange(snapshot, threat, { ...scout.currentAbility, id: "nest", range: 3 }).state).toBe("out");
});

test("enemy range refers to its actual multiplayer target", () => {
  const threat = { ...scout, targetPlayerId: "companion" };
  const audience = { selfId: "self", players: [{ id: "companion", name: "Rowan", player: { ...base.player, position: { x: 24, y: 0, z: 0 } } }] };
  const cue = enemyRange(snapshot, threat, scout.currentAbility, audience);
  expect(cue.state).toBe("out");
  expect(cue.text).toContain("targeting Rowan");
  expect(enemyRange(snapshot, threat, scout.currentAbility, { ...audience, players: [] }).state).toBe("unknown");
});
