import { expect, test } from "bun:test";
import { AnimationMixer, Bone, Box3, Vector3 } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import { createAdventure, getMonsterLore } from "../game/adventure.js";

if (typeof globalThis.ProgressEvent === "undefined") Object.defineProperty(globalThis, "ProgressEvent", {
  value: class extends Event { constructor(type: string, fields: object = {}) { super(type); Object.assign(this, fields); } },
});

test("Rattagane's encounter clips animate a cloned rig with finite bounds", async () => {
  const gltf = await new GLTFLoader().parseAsync(await Bun.file("assets/external/openai/rattagane/rattagane.glb").arrayBuffer(), "");
  const model = clone(gltf.scene), mixer = new AnimationMixer(model);
  for (const name of ["Idle", "Walk", "Weapon", "HitReact", "Death"]) {
    const clip = gltf.animations.find(clip => clip.name === name);
    expect(clip).toBeDefined();
    mixer.stopAllAction(); mixer.clipAction(clip!).play();
    const poses = new Set<string>();
    for (const time of [0, clip!.duration * .35, clip!.duration * .85]) {
      mixer.setTime(time); model.updateMatrixWorld(true);
      const bounds = new Box3().setFromObject(model, true);
      expect([...bounds.min.toArray(), ...bounds.max.toArray()].every(Number.isFinite)).toBe(true);
      expect(bounds.getSize(new Vector3()).length()).toBeLessThan(10);
      const joints: number[] = [];
      model.traverse(object => { if (object instanceof Bone) joints.push(...object.matrixWorld.elements); });
      poses.add(joints.map(n => n.toFixed(4)).join(","));
    }
    expect(poses.size).toBeGreaterThan(1);
  }
});

test("existing cave boss saves show Rattagane without resetting damage", () => {
  const saved = JSON.parse(createAdventure().save());
  Object.assign(saved.state.threats.find((t: { id: string }) => t.id === "cave-crab"), { health: 78 });
  const game = createAdventure({ save: JSON.stringify(saved) });
  expect(game.snapshot.threats.find(t => t.id === "cave-crab")).toMatchObject({ name: "Rattagane", health: 78, maximumHealth: 624 });
  const lore = getMonsterLore().find(t => t.id === "cave-crab")!;
  expect(lore.name).toBe("Rattagane");
  expect(lore.abilities[0]).toMatchObject({ name: "Hook Sweep", damage: 52, noticeSeconds: 1.1, range: 4.5 });
  expect(lore.abilities[0]!.description).toContain("iron hook");
});
