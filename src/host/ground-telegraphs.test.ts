import { expect, test } from "bun:test";
import { Group, Mesh, RingGeometry } from "three";
import type { CombatForecast, CombatView } from "../game/adventure-types.js";
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
  telegraphs.update({ combat }, { kind: "move", queueId: 1 });
  const paths = JSON.parse(canvas.dataset.telegraphs!).filter((entry: { path?: unknown }) => entry.path);
  expect(paths.map((entry: { actorId: string }) => entry.actorId)).toEqual(["scout", "patrol", "self", "other"]);
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
