import {
  AnimationMixer,
  Box3,
  BoxGeometry,
  CylinderGeometry,
  Group,
  LoopRepeat,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Object3D,
  SphereGeometry,
  Texture,
  TorusGeometry,
  Vector3,
  type AnimationAction,
  type AnimationClip,
  type BufferGeometry,
  type Material,
  type Scene,
} from "three";
import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js";
import type { UnitClass } from "./rts-presentation.js";

const assetUrl = (path: string): string =>
  new URL(`assets/quaternius/${path}`, document.baseURI).href;

const companyModels: Readonly<Record<UnitClass, string>> = {
  Warrior: "company/Knight_Golden_Female.gltf",
  Artificer: "company/Worker_Female.gltf",
  Rogue: "company/Ninja_Female.gltf",
  Priest: "company/Wizard.gltf",
  Ranger: "company/Elf.gltf",
};

export const companyModelNames: Readonly<Record<UnitClass, string>> = {
  Warrior: "Knight_Golden_Female",
  Artificer: "Worker_Female",
  Rogue: "Ninja_Female",
  Priest: "Wizard",
  Ranger: "Elf",
};

interface DisposableResources {
  readonly geometries: Set<BufferGeometry>;
  readonly materials: Set<Material>;
  readonly textures: Set<Texture>;
}

function collectResources(roots: readonly Object3D[]): DisposableResources {
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();
  const textures = new Set<Texture>();
  for (const root of roots) {
    root.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      geometries.add(object.geometry);
      const surfaces = Array.isArray(object.material) ? object.material : [object.material];
      for (const surface of surfaces) {
        materials.add(surface);
        for (const value of Object.values(surface)) {
          if (value instanceof Texture) textures.add(value);
        }
      }
    });
  }
  return { geometries, materials, textures };
}

function disposeResources(roots: readonly Object3D[]): void {
  const resources = collectResources(roots);
  resources.textures.forEach((texture) => texture.dispose());
  resources.materials.forEach((surface) => surface.dispose());
  resources.geometries.forEach((geometry) => geometry.dispose());
}

function exactClip(animations: readonly AnimationClip[], name: string, source: string): AnimationClip {
  const clip = animations.find((candidate) => candidate.name === name);
  if (clip === undefined) throw new Error(`${source} is missing its native ${name} clip`);
  return clip;
}

function normalizeCharacter(root: Object3D): void {
  let bounds = new Box3().setFromObject(root);
  const height = bounds.max.y - bounds.min.y;
  if (!(height > 0)) throw new Error("Quaternius character has an empty model bound");
  root.scale.setScalar(2.35 / height);
  bounds = new Box3().setFromObject(root);
  const center = bounds.getCenter(new Vector3());
  root.position.set(-center.x, -bounds.min.y, -center.z);
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    object.castShadow = true;
    object.receiveShadow = true;
  });
}

function addArtificerKit(owner: Group): void {
  const brass = new MeshStandardMaterial({ color: 0xb77a25, roughness: 0.38, metalness: 0.72 });
  const iron = new MeshStandardMaterial({ color: 0x4b5353, roughness: 0.42, metalness: 0.78 });
  const cyan = new MeshPhysicalMaterial({
    color: 0x43dbe8,
    emissive: 0x126a73,
    emissiveIntensity: 1.15,
    roughness: 0.16,
    metalness: 0.05,
    transparent: true,
    opacity: 0.88,
  });
  const acid = new MeshPhysicalMaterial({
    color: 0x9ee34d,
    emissive: 0x426d18,
    emissiveIntensity: 1.2,
    roughness: 0.18,
    transparent: true,
    opacity: 0.9,
  });
  const kit = new Group();
  kit.name = "greywrought.artificer.engineer-alchemist-kit";

  const pack = new Mesh(new BoxGeometry(0.46, 0.72, 0.24), iron);
  pack.position.set(0, 1.08, -0.24);
  const leftTank = new Mesh(new CylinderGeometry(0.1, 0.1, 0.62, 10), brass);
  leftTank.position.set(-0.17, 1.14, -0.39);
  const rightTank = leftTank.clone();
  rightTank.position.x = 0.17;
  const gear = new Mesh(new TorusGeometry(0.21, 0.055, 7, 12), brass);
  gear.position.set(0.34, 1.36, -0.25);
  gear.rotation.y = Math.PI / 2;
  const vialLeft = new Mesh(new SphereGeometry(0.11, 12, 8), cyan);
  vialLeft.position.set(-0.31, 0.79, 0.18);
  const vialRight = new Mesh(new SphereGeometry(0.1, 12, 8), acid);
  vialRight.position.set(0.31, 0.77, 0.19);
  const tool = new Mesh(new BoxGeometry(0.08, 0.7, 0.08), iron);
  tool.position.set(0.48, 0.92, 0.02);
  tool.rotation.z = -0.2;
  const toolJaw = new Mesh(new TorusGeometry(0.13, 0.045, 6, 10, Math.PI * 1.35), iron);
  toolJaw.position.set(0.54, 1.27, 0.02);
  toolJaw.rotation.z = -0.85;
  kit.add(pack, leftTank, rightTank, gear, vialLeft, vialRight, tool, toolJaw);
  kit.traverse((object) => {
    if (object instanceof Mesh) object.castShadow = true;
  });
  owner.add(kit);
}

export interface QuaterniusUnitModel {
  readonly root: Group;
  readonly sourceName: string;
  setMoving(moving: boolean): void;
  update(deltaSeconds: number): void;
  dispose(): void;
}

export async function loadQuaterniusUnitModel(unitClass: UnitClass): Promise<QuaterniusUnitModel> {
  const gltf = await new GLTFLoader().loadAsync(assetUrl(companyModels[unitClass]));
  const model = gltf.scene;
  normalizeCharacter(model);
  const root = new Group();
  root.name = `greywrought.company.${unitClass.toLowerCase()}`;
  root.add(model);
  if (unitClass === "Artificer") addArtificerKit(root);

  const mixer = new AnimationMixer(model);
  const idle = exactClip(gltf.animations, "Idle", companyModelNames[unitClass]);
  const run = exactClip(gltf.animations, "Run", companyModelNames[unitClass]);
  let current: AnimationAction = mixer.clipAction(idle);
  let moving = false;
  current.setLoop(LoopRepeat, Number.POSITIVE_INFINITY).play();

  return {
    root,
    sourceName: companyModelNames[unitClass],
    setMoving(nextMoving) {
      if (moving === nextMoving) return;
      moving = nextMoving;
      current.fadeOut(0.16);
      current = mixer.clipAction(moving ? run : idle);
      current.reset().setLoop(LoopRepeat, Number.POSITIVE_INFINITY).fadeIn(0.16).play();
    },
    update(deltaSeconds) {
      mixer.update(deltaSeconds);
    },
    dispose() {
      mixer.stopAllAction();
      mixer.uncacheRoot(model);
      disposeResources([root]);
      root.removeFromParent();
    },
  };
}

interface Placement {
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
  readonly scale: number;
}

interface NatureSpec {
  readonly name: string;
  readonly placements: readonly Placement[];
}

const natureSpecs: readonly NatureSpec[] = [
  { name: "CommonTree_2", placements: [
    { x: -13, z: -7, yaw: 0.3, scale: 0.78 },
    { x: 15, z: 5, yaw: 2.1, scale: 0.7 },
    { x: -17, z: 14, yaw: 4.6, scale: 0.82 },
  ] },
  { name: "CommonTree_5", placements: [
    { x: -12, z: 11, yaw: 3.6, scale: 0.76 },
    { x: 17, z: -10, yaw: 0.7, scale: 0.72 },
    { x: 8, z: 17, yaw: 5.1, scale: 0.8 },
  ] },
  { name: "Pine_2", placements: [
    { x: -18, z: -14, yaw: 1.2, scale: 0.84 },
    { x: 19, z: 14, yaw: 4.4, scale: 0.76 },
  ] },
  { name: "Pine_5", placements: [
    { x: -19, z: 2, yaw: 4.1, scale: 0.8 },
    { x: 13, z: -17, yaw: 2.7, scale: 0.74 },
  ] },
  { name: "Bush_Common", placements: [
    { x: -9, z: -5, yaw: 0.1, scale: 0.72 },
    { x: 10, z: -7, yaw: 1.8, scale: 0.68 },
    { x: -9, z: 8, yaw: 3.2, scale: 0.8 },
    { x: 11, z: 10, yaw: 5.4, scale: 0.74 },
  ] },
  { name: "Grass_Common_Short", placements: [
    { x: -6, z: -8, yaw: 0.2, scale: 0.8 },
    { x: 7, z: -10, yaw: 2.8, scale: 0.74 },
    { x: -11, z: 3, yaw: 4.5, scale: 0.82 },
    { x: 10, z: 3, yaw: 1.5, scale: 0.78 },
    { x: -6, z: 12, yaw: 5.7, scale: 0.76 },
    { x: 5, z: 13, yaw: 3.1, scale: 0.8 },
  ] },
  { name: "Rock_Medium_1", placements: [
    { x: -10, z: -1, yaw: 1.1, scale: 0.46 },
    { x: 12, z: -3, yaw: 4.2, scale: 0.5 },
  ] },
  { name: "Rock_Medium_3", placements: [
    { x: -5, z: 11, yaw: 2.6, scale: 0.44 },
    { x: 12, z: 8, yaw: 5.3, scale: 0.4 },
  ] },
];

function prepareNature(gltf: GLTF, spec: NatureSpec): void {
  let meshes = 0;
  gltf.scene.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    meshes += 1;
    object.castShadow = spec.name.includes("Tree") || spec.name.includes("Pine");
    object.receiveShadow = true;
  });
  if (meshes === 0) throw new Error(`${spec.name} contains no renderable mesh`);
}

export interface QuaterniusBattlefield {
  readonly root: Group;
  readonly ready: Promise<void>;
  dispose(): void;
}

export function createQuaterniusBattlefield(scene: Scene): QuaterniusBattlefield {
  const root = new Group();
  root.name = "greywrought.battlefield.quaternius-stylized-nature";
  scene.add(root);
  let disposed = false;
  let sources: readonly Object3D[] = [];
  const loader = new GLTFLoader();
  const ready = Promise.all(natureSpecs.map(async (spec) => {
    const gltf = await loader.loadAsync(assetUrl(`nature/${spec.name}.gltf`));
    prepareNature(gltf, spec);
    return { spec, gltf };
  })).then((assets) => {
    sources = assets.map(({ gltf }) => gltf.scene);
    if (disposed) {
      disposeResources(sources);
      sources = [];
      return;
    }
    for (const { spec, gltf } of assets) {
      for (const [index, placement] of spec.placements.entries()) {
        const instance = gltf.scene.clone(true);
        instance.name = `greywrought.nature.${spec.name}.${index}`;
        instance.position.set(placement.x, 0, placement.z);
        instance.rotation.y = placement.yaw;
        instance.scale.setScalar(placement.scale);
        root.add(instance);
      }
    }
  });
  return {
    root,
    ready,
    dispose() {
      if (disposed) return;
      disposed = true;
      root.removeFromParent();
      disposeResources([root, ...sources]);
      sources = [];
    },
  };
}
