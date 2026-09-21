import { expect, test } from "bun:test";
import { AnimationMixer, Bone, Box3, Mesh, SkinnedMesh, Vector3 } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import { authoredActors, actorAssetPath } from "./actor-catalog.js";
import { authoredAssetFiles } from "../../scripts/art/public-assets.js";

if (typeof globalThis.ProgressEvent === "undefined") Object.defineProperty(globalThis, "ProgressEvent", {
  value: class extends Event { constructor(type: string, fields: object = {}) { super(type); Object.assign(this, fields); } },
});

for (const [name, asset] of Object.entries(authoredActors)) {
  test(`${name}: packaged model and attribution resolve through the runtime catalog`, async () => {
    const files = await authoredAssetFiles();
    const source = `assets/external/${asset.path}`;
    expect(actorAssetPath(name)).toBe(`assets/openai/actors/${name}.glb`);
    expect(files).toContainEqual([source, `dist/${actorAssetPath(name)}`]);
    for (const [path] of files) expect(await Bun.file(path).exists()).toBe(true);
    const directory = source.slice(0, source.lastIndexOf("/"));
    expect(files.some(([path]) => path.startsWith(directory + "/") && path.endsWith(".md"))).toBe(true);
    expect(files.some(([path]) => path.endsWith(".blend"))).toBe(false);
  });

  test(`${name}: encounter clips bind to a cloned rig and preserve finite geometry`, async () => {
    const gltf = await new GLTFLoader().parseAsync(await Bun.file(`assets/external/${asset.path}`).arrayBuffer(), "");
    const model = clone(gltf.scene), mixer = new AnimationMixer(model);
    for (const clip of [asset.idle, asset.walk, asset.attack, asset.hit, "Death"]) {
      expect(gltf.animations.some(animation => animation.name === clip)).toBe(true);
    }
    let skinned = 0;
    model.traverse(object => {
      if (object instanceof SkinnedMesh) { skinned++; expect(object.skeleton.bones.length).toBeGreaterThan(10); }
      if (object instanceof Mesh && object.userData.authoredSurface && !(object instanceof SkinnedMesh)) {
        expect(object.parent instanceof Bone).toBe(true);
      }
    });
    expect(skinned).toBeGreaterThan(0);
    for (const clip of gltf.animations) {
      mixer.stopAllAction(); mixer.clipAction(clip).reset().play();
      const poses = new Set<string>();
      for (const time of [0, clip.duration * .35, clip.duration * .85]) {
        mixer.setTime(time); model.updateMatrixWorld(true);
        const bounds = new Box3().setFromObject(model, true), size = bounds.getSize(new Vector3());
        expect([...bounds.min.toArray(), ...bounds.max.toArray()].every(Number.isFinite)).toBe(true);
        expect(size.length()).toBeLessThan(10);
        expect(size.length()).toBeGreaterThan(.5);
        const joints: number[] = [];
        model.traverse(object => { if (object instanceof Bone) joints.push(...object.matrixWorld.elements); });
        poses.add(joints.map(n => n.toFixed(4)).join(","));
      }
      expect(poses.size).toBeGreaterThan(1);
    }
    mixer.stopAllAction(); mixer.uncacheRoot(model);
  });
}
