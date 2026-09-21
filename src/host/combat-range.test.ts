import { expect, test } from "bun:test";
import { createAdventure } from "../game/adventure.js";
import { terrainHeight } from "../game/cave-layout.js";
import { enemyRange, playerRange } from "./combat-range.js";

const base = createAdventure().snapshot;
const origin = { x: 0, y: 0, z: 0 };
const scout = { ...base.threats.find(threat => threat.id === "scout")!, position: { x: 8, y: 0, z: 0 }, canStrike: false };
const snapshot = { ...base, player: { ...base.player, position: origin }, selectedThreat: scout.id, threats: [scout] };

test("attack distance follows class and move, independent of readiness", () => {
  for (const archetype of ["warrior", "mage", "hunter"] as const) {
    const saved = JSON.parse(createAdventure({ archetype }).save());
    Object.assign(saved.state, { phase: "expedition", position: { x: -3, y: 0, z: 22 } });
    const ranged = createAdventure({ save: JSON.stringify(saved) }).snapshot;
    expect(playerRange(ranged, "strike").state).toBe(archetype === "warrior" ? "out" : "in");
  }
  const close = { ...snapshot, threats: [{ ...scout, position: { x: 1.5, y: 0, z: 0 }, inRangeActions: ["strike"] as const }] };
  expect(playerRange(close, "strike").state).toBe("in");
});

test("explicit target identity wins over the selected enemy; self moves have no range cue", () => {
  const next = { ...snapshot, threats: [...snapshot.threats, { ...scout, id: "near", position: origin, inRangeActions: ["strike"] as const }], selectedThreat: "near" };
  expect(playerRange(next, "strike").state).toBe("in");
  expect(playerRange(next, "strike", scout.id).state).toBe("out");
  for (const action of ["brace", "bait"] as const) expect(playerRange(next, action).state).toBe("none");
  expect(enemyRange(next, scout, { ...scout.currentAbility, id: "ember-ward", range: 10, damage: 0 }).state).toBe("none");
});

test("targeted tools use their own reach and respect the game's cover check", () => {
  const saved = JSON.parse(createAdventure({ archetype: "mage" }).save());
  Object.assign(saved.state, { phase: "expedition", position: { x: -3, y: 0, z: 25 } });
  const near = createAdventure({ save: JSON.stringify(saved) }).snapshot;
  saved.state.position.z = 24.990000000000002;
  const farther = createAdventure({ save: JSON.stringify(saved) }).snapshot;
  expect(playerRange(farther, "strike").state).toBe("in");
  saved.state.position = { x: 4, y: 0, z: 37 };
  saved.state.threats.find((t: { id: string }) => t.id === "scout").position = { x: 4, y: 0, z: 45 };
  const blocked = createAdventure({ save: JSON.stringify(saved) }).snapshot;
  expect(playerRange(blocked, "strike").state).toBe("out");
  expect(playerRange(blocked, "strike").text).toContain("cover");
});

test("all melee actions reach exactly five metres and stop beyond it", () => {
  const saved = JSON.parse(createAdventure().save());
  Object.assign(saved.state, { phase: "expedition", position: { x: -3, y: 0, z: 25 } });
  for (const z of [25, 24.99]) {
    saved.state.position.z = z;
    const view = createAdventure({ save: JSON.stringify(saved) }).snapshot;
    for (const action of ["strike"] as const) {
      expect(playerRange(view, action).state).toBe(z === 25 ? "in" : "out");
      expect(view.threats.find(threat => threat.id === "scout")!.inRangeActions.includes(action)).toBe(z === 25);
    }
  }
});

test("Maul includes leap and landing radius before launch, then uses its locked area", () => {
  const hound = { ...base.threats.find(threat => threat.id === "patrol")!, phase: "preparation" as const, position: { x: 10, y: 0, z: 0 }, targetPosition: { x: 9, y: 0, z: 0 } };
  expect(enemyRange(snapshot, hound, hound.currentAbility).state).toBe("in");
  expect(enemyRange(snapshot, { ...hound, position: { x: 11.01, y: 0, z: 0 } }, hound.currentAbility).state).toBe("out");
  expect(enemyRange(snapshot, { ...hound, phase: "action", position: origin }, hound.currentAbility).state).toBe("out");
});

test("homing range tracks attacker, while ordinary committed areas stay locked", () => {
  const threat = { ...scout, phase: "action" as const, position: origin, targetPosition: { x: 20, y: 0, z: 0 } };
  expect(enemyRange(snapshot, threat, { ...scout.currentAbility, id: "fireball", range: 10 }).state).toBe("in");
  expect(enemyRange(snapshot, threat, { ...scout.currentAbility, id: "foreman-pulse", range: 22 }).state).toBe("in");
  expect(enemyRange(snapshot, { ...threat, position: { x: 23, y: 0, z: 0 } }, { ...scout.currentAbility, id: "foreman-pulse", range: 22 }).state).toBe("out");
  expect(enemyRange(snapshot, threat, { ...scout.currentAbility, id: "foreman-press", range: 3.5 }).state).toBe("out");
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

test("class skill targeting distinguishes self bursts from aimed skills", () => {
  for (const archetype of ["warrior", "mage", "hunter", "alchemist", "artificer"] as const) {
    const view = {...snapshot, player: {...snapshot.player, archetype}, threats: [{...scout, inRangeActions: ["special"] as const}]};
    expect(playerRange(view, "special").state).toBe(archetype === "warrior" || archetype === "mage" ? "none" : "in");
    if (archetype === "hunter") expect(playerRange({...view, threats: [{...view.threats[0]!, position: {x:15.1,y:0,z:0}}]}, "special").state).toBe("out");
  }
});

test("real Ranger snapshots light Piercing Arrow to its own range, including before combat", () => {
  const saved = JSON.parse(createAdventure({ archetype: "hunter" }).save());
  Object.assign(saved.state, { phase: "expedition", position: { x: 0, y: terrainHeight(0,20), z: 20 }, selectedThreat: "scout" });
  const enemy = saved.state.threats.find((t: { id: string }) => t.id === "scout");
  for (const x of [12.5, 15, 15.01]) {
    enemy.position = { x, y: terrainHeight(x,20), z: 20 };
    const view = createAdventure({ save: JSON.stringify(saved) }).snapshot;
    expect(playerRange(view, "strike").state).toBe(x <= 12.5 ? "in" : "out");
    expect(playerRange(view, "special").state).toBe(x <= 15 ? "in" : "out");
    expect(view.threats.find(t => t.id === "scout")!.inRangeActions.includes("special")).toBe(x <= 15);
  }
  saved.state.position = { x: 4, y: 0, z: 37 };
  enemy.position = { x: 4, y: 0, z: 45 };
  expect(playerRange(createAdventure({ save: JSON.stringify(saved) }).snapshot, "special").state).toBe("out");
});
