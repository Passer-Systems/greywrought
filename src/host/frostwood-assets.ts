import { actorAssetPath, type PlayerModel } from "../art/actor-catalog.js";
import { AnimationMixer, Box3, Color, Float32BufferAttribute, Group, LoopOnce, LoopRepeat, Mesh, MeshStandardMaterial, SkinnedMesh, Vector3, type AnimationAction, type Object3D, type Material } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import { MTLLoader } from "three/addons/loaders/MTLLoader.js";
import { clone, retargetClip } from "three/addons/utils/SkeletonUtils.js";
import { publicUrl } from "./public-url.js";
import { canopyMaterial } from "./canopy-material.js";
import { replaceTorchFire } from './torch-flame.js';

const root = "assets/quaternius/frostwood/";
const loader = new GLTFLoader();
const models = new Map<string, ReturnType<GLTFLoader["loadAsync"]>>();
function source(path: string) {
  let promise = models.get(path);
  if (!promise) { promise = loader.loadAsync(publicUrl(path)); models.set(path, promise); }
  return promise;
}
export function fit(model: Object3D, size: number, axis: "height" | "width" = "height"): Group {
  const wrapper = new Group();
  // Cloned skins need current bone and bind matrices before measuring their pose.
  model.updateMatrixWorld(true);
  const bounds = new Box3().setFromObject(model);
  const dimensions = bounds.getSize(new Vector3());
  model.scale.multiplyScalar(size / (axis === "height" ? dimensions.y : Math.max(dimensions.x, dimensions.z)));
  bounds.setFromObject(model);
  const center = bounds.getCenter(new Vector3());
  model.position.add(new Vector3(-center.x, -bounds.min.y, -center.z));
  wrapper.add(model);
  return wrapper;
}
export interface ForestActor {
  root: Group; model: Object3D; mixer: AnimationMixer; action: AnimationAction | null;
  play(name: string, loop?: boolean, duration?: number, fade?: number): AnimationAction;
  dispose(): void;
}
export async function actor(name: string, height: number, playerModel?: PlayerModel, materialFill?: number): Promise<ForestActor> {
  const gltf = await source(actorAssetPath(name, playerModel));
  const model = clone(gltf.scene);
  const animations = [...gltf.animations];
  if (playerModel) {
    const donor = await source("assets/quaternius/class-characters/Social.glb");
    const sourceModel = clone(donor.scene);
    let targetRig: SkinnedMesh | undefined, sourceRig: SkinnedMesh | undefined;
    model.traverse(object => { if (object instanceof SkinnedMesh) targetRig ??= object; });
    sourceModel.traverse(object => { if (object instanceof SkinnedMesh) sourceRig ??= object; });
    const boneName = (bone: Object3D): string => bone.userData.name ?? bone.name;
    const targetBody = targetRig?.skeleton.bones.find(bone => boneName(bone) === "Body"), sourceBody = sourceRig?.skeleton.bones.find(bone => boneName(bone) === "Body");
    if (!targetRig || !sourceRig || !targetBody || !sourceBody) throw Error("Missing character social animation rig");
    model.updateMatrixWorld(true); sourceModel.updateMatrixWorld(true);
    const scale = targetBody.getWorldPosition(new Vector3()).y / sourceBody.getWorldPosition(new Vector3()).y;
    // Retarget rotations and hip motion while preserving each class's bind proportions.
    let sliceStarted = performance.now();
    for (const clip of donor.animations) {
      sourceRig.skeleton.pose(); sourceModel.updateMatrixWorld(true);
      const social = retargetClip(targetRig, sourceRig, clip, {
        hip: sourceBody.name, scale, fps: 24,
        names: Object.fromEntries(targetRig.skeleton.bones.map(bone => [bone.name, sourceRig!.skeleton.bones.find(sourceBone => boneName(sourceBone) === (boneName(bone) === "Root" ? "Bone" : boneName(bone)))?.name ?? bone.name])),
      });
      for (const track of social.tracks) track.name = track.name.replace(/^\.bones\[([^\]]+)\]/, "$1");
      animations.push(social);
      targetRig.skeleton.pose(); model.updateMatrixWorld(true);
      if (performance.now() - sliceStarted > 8) {
        await new Promise<void>(resolve => setTimeout(resolve, 0));
        sliceStarted = performance.now();
      }
    }
  }
  const localMaterials: Material[] = [];
  if (materialFill !== undefined) model.traverse(object => {
    if (!(object instanceof Mesh)) return;
    const caveFill = (material: Material) => {
      if (!(material instanceof MeshStandardMaterial) || material.emissiveIntensity > 0 && material.emissive.getHex() !== 0) return material;
      // Preserve the authored colors while keeping dark fur and metal readable underground.
      const surface = material.clone();
      surface.emissive.copy(surface.color); surface.emissiveIntensity = materialFill;
      localMaterials.push(surface); return surface;
    };
    object.material = Array.isArray(object.material) ? object.material.map(caveFill) : caveFill(object.material);
  });
  if (name === "Leela") model.traverse(object => {
    if (!(object instanceof Mesh)) return;
    const lightEye = (material: Material) => {
      if (!(material instanceof MeshStandardMaterial) || material.name !== "Eye") return material;
      const eye = material.clone(); eye.emissive.setHex(0x9cdfff); eye.emissiveIntensity = 1.2; localMaterials.push(eye); return eye;
    };
    object.material = Array.isArray(object.material) ? object.material.map(lightEye) : lightEye(object.material);
  });
  model.traverse(object => {
    if (object instanceof Mesh) { object.castShadow = true; object.receiveShadow = true; }
  });
  const wrapper = fit(model, height);
  const mixer = new AnimationMixer(model);
  const result: ForestActor = {
    root: wrapper, model, mixer, action: null,
    play(name, loop = true, duration, fade = 0.12) {
      const clip = animations.find(c => c.name === name);
      if (!clip) throw Error(`${name} is missing from ${model.name}`);
      const next = mixer.clipAction(clip);
      if (result.action === next && next.isRunning()) return next;
      result.action?.fadeOut(fade);
      next.reset().setEffectiveWeight(1).setEffectiveTimeScale(1).setLoop(loop ? LoopRepeat : LoopOnce, loop ? Infinity : 1);
      if (duration) next.setDuration(duration);
      next.clampWhenFinished = !loop;
      next.fadeIn(fade).play(); result.action = next;
      return next;
    },
    dispose() { mixer.stopAllAction(); mixer.uncacheRoot(model); for (const material of localMaterials) material.dispose(); },
  };
  return result;
}
const props = new Map<string, Promise<Object3D>>();
export async function prop(name: string, size: number, axis: "height" | "width" = "height"): Promise<Group> {
  let promise = props.get(name);
  if (!promise) {
  promise = name.startsWith("nature/") ? source(`${root}${name}.gltf`).then(g => g.scene) : name.startsWith("pirate/") ? source(`assets/quaternius/${name}.gltf`).then(g => g.scene) : (async () => {
      const base = publicUrl(name.startsWith("reclaimed/") ? `assets/quaternius/reclaimed-robot/${name.slice("reclaimed/".length)}` : `${root}${name.startsWith("works/") ? name : `village/${name}`}`);
      const materials = await new MTLLoader().loadAsync(`${base}.mtl`);
      const response = await fetch(`${base}.obj`);
      if (!response.ok) throw Error(`Unable to load ${base}.obj: ${response.status}`);
      // Mixed OBJ face/edge objects become LineSegments in OBJLoader; retain their surfaces.
      const surfaces = (await response.text()).replace(/^l[ \t].*$/gm, "");
      const mesh = new OBJLoader().setMaterials(materials).parse(surfaces);
      const weathered = !name.startsWith('reclaimed/') && !['Sword', 'Crystal2', 'WoodenTorch_Fire', 'Sign_LeftRight'].includes(name);
      const bounds = weathered ? new Box3().setFromObject(mesh) : null;
      mesh.traverse(o => {
        if (!(o instanceof Mesh)) return;
        if (bounds) {
          const positions = o.geometry.getAttribute('position'), colors = new Float32Array(positions.count * 3);
          const height = Math.max(.01, bounds.max.y - bounds.min.y);
          for (let i = 0; i < positions.count; i++) {
            const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
            const grain = Math.sin(x * 37.1 + y * 17.7 + z * 91.3) * 43758.5453;
            const damp = Math.max(0, 1 - (y - bounds.min.y) / (height * .32));
            const value = .84 + (grain - Math.floor(grain)) * .15 - damp * .14;
            colors.set([value * (1 - damp * .06), value, value * .97], i * 3);
          }
          o.geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
        }
        const surface = (m: Material) => {
          const color = "color" in m ? (m as MeshStandardMaterial).color.clone().convertLinearToSRGB() : new Color(0xffffff);
          if (weathered) color.lerp(new Color(name.startsWith('works/') ? '#777968' : '#858074'), .24);
          return new MeshStandardMaterial({ name: m.name, color, vertexColors: weathered, roughness: 0.98, metalness: name.startsWith('works/') ? .16 : 0, transparent: m.transparent, opacity: m.opacity });
        };
        // A material array requires geometry groups; preserve single-surface meshes.
        o.material = Array.isArray(o.material) ? o.material.map(surface) : surface(o.material);
      });
      return mesh;
    })();
    props.set(name, promise);
  }
  const model = (await promise).clone(true);
  model.traverse(object => {
    if (!(object instanceof Mesh)) return;
    object.material = Array.isArray(object.material) ? object.material.map(canopyMaterial) : canopyMaterial(object.material);
    object.receiveShadow = true;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    object.castShadow = !materials.some(material => material.transparent);
  });
  const fitted = fit(model, size, axis);
  if (name === 'WoodenTorch_Fire') replaceTorchFire(fitted);
  return fitted;
}
