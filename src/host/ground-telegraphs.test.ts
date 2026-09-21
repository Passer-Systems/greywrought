import { expect, test } from "bun:test";
import { CircleGeometry, Group, Mesh, MeshBasicMaterial, RingGeometry, Sprite } from "three";
import type { CombatForecast, CombatView, Position } from "../game/adventure-types.js";
import { createAdventure } from "../game/adventure.js";
import { terrainHeight } from "../game/cave-layout.js";
import { earnedChapter, finishGathering, tap } from "../game/yard-test-fixtures.js";
import { createGroundTelegraphs } from "./ground-telegraphs.js";

const origin = { x: 1, y: 0, z: 2 }, landing = { x: 4, y: 0, z: 7 };
const forecast: CombatForecast = {
  playerId: "self",
  paths: [
    { actorId: "scout", kind: "attack", action: "fireball", beat: 0, queueId: null, points: [origin, landing], radius: 0 },
    { actorId: "patrol", kind: "attack", action: "maul", beat: 1, queueId: null, points: [origin, landing], radius: 2 },
    { actorId: "self", kind: "move", action: "bait", beat: 0, queueId: 1, points: [origin, landing], radius: 0 },
    { actorId: "other", kind: "move", action: "bait", beat: 0, queueId: 1, points: [landing, origin], radius: 0 },
  ],
  events: [], outcomes: [], actions: [],
};
const combat: CombatView = {
  gatheringRemainingSeconds: 0, openingStrikeAvailable: false,
  ready: false, phase: "preparation", remainingSeconds: 30, elapsedSeconds: 0, cycle: 1,
  queued: [], reservedStamina: 0, availableStamina: 5, forecast, hazards: [], effects: [],
};
function setup() {
  const scene = new Group(), canvas = { dataset: {} as DOMStringMap };
  const telegraphs = createGroundTelegraphs(scene, canvas);
  return { scene, canvas, telegraphs };
}

test("previews require inspection and clear during playback", () => {
  const { scene, canvas, telegraphs } = setup();
  telegraphs.update({ combat }, null);
  expect(canvas.dataset.telegraphs).toBe("[]");
  telegraphs.update({ combat }, { kind: "enemy", threatId: "patrol" });
  expect(JSON.parse(canvas.dataset.telegraphs!)).toMatchObject([{ previewKind: "enemy", enemy: "patrol", kind: "area", radius: 2, position: landing }]);
  expect(scene.children[0]!.children.length).toBeGreaterThan(0);
  telegraphs.update({ combat: { ...combat, phase: "active" } }, { kind: "enemy", threatId: "patrol" });
  expect(canvas.dataset.telegraphs).toBe("[]");
  expect(scene.children[0]!.children).toHaveLength(0);
  telegraphs.dispose();
  expect(scene.children).toHaveLength(0);
});

test("homing previews draw the forecast path without a dodgeable target circle", () => {
  const { scene, canvas, telegraphs } = setup();
  telegraphs.update({ combat }, { kind: "enemy", threatId: "scout" });
  expect(JSON.parse(canvas.dataset.telegraphs!)).toMatchObject([{ kind: "target", path: [origin, landing], radius: 0 }]);
  let rings = 0;
  scene.traverse(object => { if (object instanceof Mesh && object.geometry instanceof RingGeometry) rings++; });
  expect(rings).toBe(0);
  telegraphs.dispose();
});

test("a queued move previews the local move and enemy pursuit", () => {
  const { canvas, telegraphs } = setup();
  const attack: CombatForecast['paths'][number] = { actorId: 'self', kind: 'attack', action: 'strike', beat: 1.5, queueId: 2, points: [landing, origin], radius: 0 };
  telegraphs.update({ combat: { ...combat, forecast: { ...forecast, paths: [...forecast.paths, attack] } } }, { kind: "move", queueId: 1 });
  const paths = JSON.parse(canvas.dataset.telegraphs!).filter((entry: { path?: unknown }) => entry.path);
  expect(paths.map((entry: { actorId: string }) => entry.actorId)).toEqual(["scout", "patrol", "self", "other", "self"]);
  expect(paths.find((entry: { ability: string }) => entry.ability === 'strike').color).not.toBe(paths.find((entry: { actorId: string; ability: string }) => entry.actorId === 'self' && entry.ability === 'bait').color);
  telegraphs.update({ combat }, { kind: "move", queueId: 9 });
  expect(canvas.dataset.telegraphs).toBe("[]");
  telegraphs.dispose();
});

test("destination hover displays enemy tracking and player paths together", () => {
  const { canvas, telegraphs } = setup();
  telegraphs.update({ combat }, { kind: "destination" });
  const paths = JSON.parse(canvas.dataset.telegraphs!);
  expect(paths.map((path: { actorId: string }) => path.actorId)).toEqual(["scout", "patrol", "self", "other"]);
  expect(paths.every((path: { previewKind: string }) => path.previewKind === "destination")).toBe(true);
  telegraphs.dispose();
});

function localHit(sourceId: string, targetId = "self", damage = 12): CombatForecast["events"][number] {
  return { kind: "hit", sourceId, targetId, damage, time: 1.65, position: landing, text: "", radius: 0, queueId: null };
}

test("area warnings use local hit damage, update with identical geometry, and ignore ally hits and final health", () => {
  const { scene, canvas, telegraphs } = setup();
  const update = (events: CombatForecast["events"]) => {
    telegraphs.update({ combat: { ...combat, forecast: { ...forecast, events, outcomes: [{ id: "self", health: 100, staggered: false, inCombat: true }] } } }, { kind: "enemy", threatId: "patrol" });
    const meshes = scene.children[0]!.children.filter((object): object is Mesh => object instanceof Mesh);
    const ring = meshes.find(mesh => mesh.geometry instanceof RingGeometry)!;
    return { area: JSON.parse(canvas.dataset.telegraphs!)[0], color: (ring.material as MeshBasicMaterial).color.getHex(), disks: meshes.filter(mesh => mesh.geometry instanceof CircleGeometry) };
  };
  const hit = update([localHit("patrol")]);
  expect(hit.area).toMatchObject({ danger: true, damage: 12, hitTimes: [1.65], radius: 2 });
  expect(hit.color).toBe(0xef6570);
  expect(hit.disks).toHaveLength(1);
  const miss = update([localHit("patrol", "ally"), localHit("scout"), { ...localHit("patrol"), time: .5 }]);
  expect(miss.area).toMatchObject({ danger: false, damage: 0, hitTimes: [], radius: 2 });
  expect(miss.color).toBe(0xc4d4d7);
  expect(miss.disks).toHaveLength(0);
  expect(update([localHit("patrol", "self", 0)]).area).toMatchObject({ danger: false, damage: 0, hitTimes: [1.65] });
  telegraphs.dispose();
});

test("a homing attack with no local damage retains its target warning without an escape circle", () => {
  const { scene, canvas, telegraphs } = setup();
  telegraphs.update({ combat: { ...combat, forecast: { ...forecast, events: [localHit("scout", "ally")] } } }, { kind: "enemy", threatId: "scout" });
  expect(JSON.parse(canvas.dataset.telegraphs!)[0]).not.toHaveProperty("danger");
  scene.traverse(object => {
    if (object instanceof Mesh) {
      expect((object.material as MeshBasicMaterial).color.getHex()).toBe(0xef6570);
      expect(object.geometry instanceof RingGeometry).toBe(false);
    }
  });
  telegraphs.dispose();
});

test("out-and-back routes have separate pale lanes, opposing chevrons, and ordered stops", () => {
  const documentProperty = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "document", { configurable: true, value: {
    createElement: () => ({ getContext: () => ({ fillRect() {}, fillText() {} }) }),
  } });
  try {
    const { scene, canvas, telegraphs } = setup();
    const start = { x: -10, y: 0, z: 25 }, stop = { ...start, x: -5 };
    const path = { ...forecast.paths[2]!, points: [start, stop, start, stop] };
    telegraphs.update({ combat: { ...combat, forecast: { ...forecast, paths: [path] } } }, { kind: "destination", route: [stop, start, stop] });
    const entries = JSON.parse(canvas.dataset.telegraphs!);
    const legs: { order: number; offset: Position; arrows: { direction: Position }[] }[] = entries[0].legs;
    expect(legs.map(leg => leg.order)).toEqual([1, 2, 3]);
    expect(new Set(legs.map(leg => leg.offset.z)).size).toBe(3);
    expect(legs.map(leg => leg.arrows[0]!.direction.x)).toEqual([1, -1, 1]);
    expect(legs.every(leg => leg.arrows.length > 1)).toBe(true);
    const stops = entries.filter((entry: { kind: string }) => entry.kind === "stop");
    expect(stops.map((entry: { order: number }) => entry.order)).toEqual([1, 2, 3]);
    expect(stops[0].labelPosition.x).not.toBe(stops[2].labelPosition.x);
    expect(scene.children[0]!.children.filter(object => object instanceof Sprite)).toHaveLength(3);
    scene.traverse(object => { if (object instanceof Mesh) expect((object.material as MeshBasicMaterial).color.getHex()).toBe(0xd6efff); });
    const shortened = { ...path, points: [start, { ...start, x: -7.5 }] };
    telegraphs.update({ combat: { ...combat, forecast: { ...forecast, paths: [shortened] } } }, { kind: "destination", route: [stop] });
    expect(JSON.parse(canvas.dataset.telegraphs!).filter((entry: { kind: string }) => entry.kind === "stop")).toHaveLength(0);
    expect(scene.children[0]!.children.filter(object => object instanceof Sprite)).toHaveLength(0);
    telegraphs.update({ combat: { ...combat, phase: "active" } }, { kind: "destination", route: [stop, start, stop] });
    expect(scene.children[0]!.children).toHaveLength(0);
    telegraphs.dispose();
  } finally {
    if (documentProperty) Object.defineProperty(globalThis, "document", documentProperty);
    else Reflect.deleteProperty(globalThis, "document");
  }
});

test("a real Maul turns pale when the planned return escapes its committed landing", async () => {
  const saved = JSON.parse(createAdventure({ archetype: "hunter" }).save());
  Object.assign(saved.state, { phase: "expedition", position: { x: -17.5, y: terrainHeight(-17.5, 40), z: 40 }, chapter: earnedChapter(2) });
  for (const threat of saved.state.threats) if (threat.active && threat.id !== "patrol") Object.assign(threat, { health: 0, phase: "cleared", lootClaimed: true });
  const game = createAdventure({ save: JSON.stringify(saved) });
  game.selectTarget("patrol"); tap(game, "strike"); game.advance(.01); finishGathering(game);
  const start = game.snapshot.player.position, stop = { ...start, z: 35 };
  const { canvas, telegraphs } = setup();
  const areas = [];
  for (const [destination, via] of [[stop, []], [start, [stop]]] as const) {
    const prediction = await game.previewBait(destination, via);
    expect(prediction).not.toBeNull();
    telegraphs.update({ ...game.snapshot, combat: { ...game.snapshot.combat, forecast: prediction } }, { kind: "destination" });
    areas.push(JSON.parse(canvas.dataset.telegraphs!).find((entry: { ability: string }) => entry.ability === "maul"));
  }
  expect(areas[0]).toMatchObject({ kind: "area", danger: true, radius: 2 });
  expect(areas[0].damage).toBeGreaterThan(0);
  expect(areas[1]).toMatchObject({ kind: "area", danger: false, damage: 0, radius: 2 });
  expect(areas[0].position.z).toBeCloseTo(stop.z, 7);
  expect(Math.abs(areas[1].position.z-stop.z)).toBeLessThan(1);
  expect(Math.abs(areas[1].position.z-start.z)).toBeGreaterThan(areas[1].radius);
  telegraphs.dispose();
});
