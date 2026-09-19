import { AnimationMixer, Box3, CanvasTexture, CircleGeometry, Group, LoopOnce, LoopRepeat, Mesh, MeshBasicMaterial, MeshStandardMaterial, SkinnedMesh, Vector3, type AnimationAction, type Object3D, type Material } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import { MTLLoader } from "three/addons/loaders/MTLLoader.js";
import { clone, retargetClip } from "three/addons/utils/SkeletonUtils.js";
import { publicUrl } from "./public-url.js";

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
export async function actor(name: string, height: number, playerModel?: "warrior" | "mage" | "hunter" | "alchemist" | "artificer"): Promise<ForestActor> {
  const playerPath = playerModel ? `assets/quaternius/class-characters/${playerModel === "hunter" ? "Ranger.glb" : playerModel === "mage" ? "Wizard.glb" : playerModel === "alchemist" ? "Alchemist.gltf" : playerModel === "artificer" ? "Artificer.gltf" : "Warrior.glb"}` : null;
  const gltf = await source(playerPath ?? `${root}actors/${name}.glb`);
  const model = clone(gltf.scene);
  const animations = [...gltf.animations];
  if (playerPath !== null) {
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
    for (const clip of donor.animations) {
      sourceRig.skeleton.pose(); sourceModel.updateMatrixWorld(true);
      const social = retargetClip(targetRig, sourceRig, clip, {
        hip: sourceBody.name, scale, fps: 24,
        names: Object.fromEntries(targetRig.skeleton.bones.map(bone => [bone.name, sourceRig!.skeleton.bones.find(sourceBone => boneName(sourceBone) === (boneName(bone) === "Root" ? "Bone" : boneName(bone)))?.name ?? bone.name])),
      });
      for (const track of social.tracks) track.name = track.name.replace(/^\.bones\[([^\]]+)\]/, "$1");
      animations.push(social);
      targetRig.skeleton.pose(); model.updateMatrixWorld(true);
    }
  }
  const localMaterials: Material[] = [];
  if (name === "Leela") model.traverse(object => {
    if (!(object instanceof Mesh)) return;
    const lightEye = (material: Material) => {
      if (!(material instanceof MeshStandardMaterial) || material.name !== "Eye") return material;
      const eye = material.clone(); eye.emissive.setHex(0x9cdfff); eye.emissiveIntensity = 1.2; localMaterials.push(eye); return eye;
    };
    object.material = Array.isArray(object.material) ? object.material.map(lightEye) : lightEye(object.material);
  });
  const wrapper = fit(model, height);
  const shadowCanvas = document.createElement("canvas"); shadowCanvas.width=shadowCanvas.height=64;
  const context=shadowCanvas.getContext("2d")!;
  const gradient=context.createRadialGradient(32,32,4,32,32,32); gradient.addColorStop(0,"#17251565"); gradient.addColorStop(1,"#17251500"); context.fillStyle=gradient; context.fillRect(0,0,64,64);
  const shadow=new Mesh(new CircleGeometry(height*0.5,24),new MeshBasicMaterial({map:new CanvasTexture(shadowCanvas),transparent:true,depthWrite:false})); shadow.rotation.x=-Math.PI/2; shadow.position.y=0.035; wrapper.add(shadow);
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
    promise = name.startsWith("nature/") ? source(`${root}${name}.gltf`).then(g => g.scene) : (async () => {
      const base = publicUrl(`${root}${name.startsWith("works/") ? name : `village/${name}`}`);
      const materials = await new MTLLoader().loadAsync(`${base}.mtl`);
      const response = await fetch(`${base}.obj`);
      if (!response.ok) throw Error(`Unable to load ${base}.obj: ${response.status}`);
      // Mixed OBJ face/edge objects become LineSegments in OBJLoader; retain their surfaces.
      const surfaces = (await response.text()).replace(/^l[ \t].*$/gm, "");
      const mesh = new OBJLoader().setMaterials(materials).parse(surfaces);
      mesh.traverse(o => {
        if (!(o instanceof Mesh)) return;
        const surface = (m: Material) => {
          const color = "color" in m ? (m as MeshStandardMaterial).color.clone().convertLinearToSRGB() : 0xffffff;
          const flame = name === "WoodenTorch_Fire" && (m.name === "Fire" || m.name === "Yellow");
          return new MeshStandardMaterial({ name: m.name, color, roughness: 0.95, transparent: m.transparent, opacity: m.opacity,
            emissive: flame ? m.name === "Fire" ? 0xff712b : 0xffc461 : 0x000000, emissiveIntensity: flame ? 1.5 : 0 });
        };
        // A material array requires geometry groups; preserve single-surface meshes.
        o.material = Array.isArray(o.material) ? o.material.map(surface) : surface(o.material);
      });
      return mesh;
    })();
    props.set(name, promise);
  }
  return fit((await promise).clone(true), size, axis);
}
