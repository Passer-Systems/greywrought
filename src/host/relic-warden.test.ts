import { expect, test } from "bun:test";
import { AnimationMixer, Bone, Box3, Mesh, SkinnedMesh, Vector3 } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import { createAdventure, getMonsterLore } from "../game/adventure.js";

if (typeof globalThis.ProgressEvent === "undefined") Object.defineProperty(globalThis, "ProgressEvent", {
  value: class extends Event { constructor(type: string, fields: object = {}) { super(type); Object.assign(this, fields); } },
});

test("Relic Warden clips bind to the cloned rig and surfaces remain finite", async () => {
  const look = {idle:"Idle",walk:"Run",attack:"SwordSlash",hit:"HitRecieve_1"};
  const gltf = await new GLTFLoader().parseAsync(await Bun.file("assets/external/relic-warden/relic-warden-runtime.glb").arrayBuffer(), "");
  const model = clone(gltf.scene), mixer = new AnimationMixer(model);
  const required = [look.idle, look.walk, look.attack, look.hit, "Death"];
  for (const clip of required) expect(gltf.animations.some(a => a.name === clip)).toBe(true);
  let skinned = 0, attachments = 0;
  model.traverse(o => {
    if (o instanceof SkinnedMesh) { skinned++; expect(o.skeleton.bones.length).toBeGreaterThan(10); }
    if (o instanceof Mesh && o.userData.authoredSurface && !(o instanceof SkinnedMesh)) { attachments++; expect(o.parent instanceof Bone).toBe(true); }
  });
  expect(skinned).toBe(2); expect(attachments).toBeGreaterThan(8);
  const poses = new Set<string>();
  for (const clip of gltf.animations) {
    mixer.stopAllAction(); mixer.clipAction(clip).reset().play();
    for (const time of [0, clip.duration * .35, clip.duration * .85]) {
      mixer.setTime(time); model.updateMatrixWorld(true);
      const box = new Box3().setFromObject(model, true), size = box.getSize(new Vector3());
      expect([...box.min.toArray(), ...box.max.toArray()].every(Number.isFinite)).toBe(true);
      expect(Math.max(...size.toArray())).toBeLessThan(8);
      expect(Math.max(...size.toArray())).toBeGreaterThan(.5);
      const joints: number[] = [];
      model.traverse(o => { if (o instanceof Bone) joints.push(...o.matrixWorld.elements); });
      poses.add(joints.map(n => n.toFixed(4)).join(","));
    }
  }
  expect(poses.size).toBeGreaterThan(gltf.animations.length);
});

test("Relic Warden retains the warder save identity", () => {
  const game=createAdventure(), restored=createAdventure({save:game.save()});
  expect(restored.snapshot.threats.find(t=>t.id==="warder")?.name).toBe("Relic Warden");
  expect(getMonsterLore().find(t=>t.id==="warder")?.name).toBe("Relic Warden");
});
