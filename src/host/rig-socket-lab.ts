import {
  AmbientLight,
  AnimationAction,
  AnimationClip,
  AnimationMixer,
  Box3,
  BoxGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  Group,
  LoopOnce,
  LoopRepeat,
  Material,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  SRGBColorSpace,
  Texture,
  Vector3,
  WebGLRenderer,
  type BufferGeometry,
} from "three";
import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import { publicUrl } from "./public-url.js";

const BASE_MODEL_URL =
  publicUrl("assets/quaternius/rig/wayfarer/Knight_Golden_Female.gltf");

interface RigSockets {
  readonly back: Group;
  readonly leftBooster: Group;
  readonly rightBooster: Group;
  readonly leftForearm: Group;
  readonly rightHand: Group;
  readonly holster: Group;
}

interface EquipmentRig {
  readonly backpack: Group;
  readonly leftBooster: Group;
  readonly rightBooster: Group;
  readonly forearmBlade: Group;
  readonly activeWeapon: Group;
  readonly holsteredWeapon: Group;
  readonly plumes: readonly Mesh[];
  readonly plumeMaterial: MeshStandardMaterial;
}

interface OwnedEquipmentResources {
  readonly geometries: BufferGeometry[];
  readonly materials: Material[];
}

interface ClipLibrary {
  readonly idle: AnimationClip;
  readonly locomotion: AnimationClip;
  readonly jump: AnimationClip;
  readonly attack: AnimationClip;
  readonly hit: AnimationClip;
  readonly death: AnimationClip;
}

interface RigInstance {
  readonly root: Object3D;
  readonly mixer: AnimationMixer;
  readonly sockets: RigSockets;
  readonly equipment: EquipmentRig;
  current: AnimationAction | null;
}

export interface MountedArenaRig {
  readonly parent: Group;
  readonly placeholder: Group;
  readonly instance: RigInstance;
  readonly clips: ClipLibrary;
  readonly resources: OwnedEquipmentResources;
  mode: "idle" | "locomotion" | "jump" | "attack";
  attackRemaining: number;
  propulsionLevel: number;
  disposed: boolean;
}

export interface RigSocketLab {
  readonly scene: Scene;
  readonly camera: PerspectiveCamera;
  readonly renderer: WebGLRenderer;
  readonly host: HTMLElement;
  readonly status: HTMLElement;
  readonly left: RigInstance;
  readonly right: RigInstance;
  readonly clips: ClipLibrary;
  readonly resources: OwnedEquipmentResources;
  readonly listeners: Array<() => void>;
  width: number;
  height: number;
  startedAt: number;
  lastTime: number;
  demoStage: number;
  frameHandle: number;
  disposed: boolean;
}

function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!(element instanceof HTMLElement)) {
    throw new Error(`Missing rig lab element #${id}`);
  }
  return element as T;
}

function ownGeometry<T extends BufferGeometry>(
  resources: OwnedEquipmentResources,
  geometry: T,
): T {
  resources.geometries.push(geometry);
  return geometry;
}

function equipmentMaterial(
  resources: OwnedEquipmentResources,
  color: number,
  emissive: number,
  metalness: number,
  roughness: number,
  transparent = false,
  opacity = 1,
): MeshStandardMaterial {
  const material = new MeshStandardMaterial({
    color,
    emissive,
    metalness,
    roughness,
    transparent,
    opacity,
  });
  resources.materials.push(material);
  return material;
}

function mesh(geometry: BufferGeometry, material: Material): Mesh {
  return new Mesh(geometry, material);
}

function requireBone(root: Object3D, boneName: string): Object3D {
  const bone = root.getObjectByName(boneName);
  if (bone === undefined) {
    throw new Error(`Quaternius rig is missing bone ${boneName}`);
  }
  return bone;
}

function createSocket(
  root: Object3D,
  boneName: string,
  roleName: string,
): Group {
  const socket = new Group();
  socket.name = roleName;
  requireBone(root, boneName).add(socket);
  return socket;
}

function normalizeSockets(root: Object3D): RigSockets {
  const sockets: RigSockets = {
    back: createSocket(root, "Torso", "greywrought.socket.upper-back"),
    leftBooster: createSocket(
      root,
      "LowerLegL",
      "greywrought.socket.left-lower-leg",
    ),
    rightBooster: createSocket(
      root,
      "LowerLegR",
      "greywrought.socket.right-lower-leg",
    ),
    leftForearm: createSocket(
      root,
      "LowerArmL",
      "greywrought.socket.left-forearm",
    ),
    rightHand: createSocket(root, "FistR", "greywrought.socket.right-hand"),
    holster: createSocket(root, "Hips", "greywrought.socket.hip-holster"),
  };

  sockets.back.position.set(0, 0.08, -0.14);
  sockets.leftBooster.position.set(0, 0.19, -0.075);
  sockets.rightBooster.position.set(0, 0.19, -0.075);
  sockets.leftForearm.position.set(0, 0.12, -0.055);
  sockets.rightHand.position.set(0, 0.08, 0.025);
  sockets.holster.position.set(0.19, 0.02, -0.08);
  return sockets;
}

function addNozzle(
  resources: OwnedEquipmentResources,
  parent: Group,
  shellMaterial: MeshStandardMaterial,
  plumeMaterial: MeshStandardMaterial,
  x: number,
  y: number,
  z: number,
  name: string,
): Mesh {
  const shell = mesh(
    ownGeometry(resources, new CylinderGeometry(0.06, 0.08, 0.19, 10)),
    shellMaterial,
  );
  const plume = mesh(
    ownGeometry(resources, new ConeGeometry(0.075, 0.42, 10)),
    plumeMaterial,
  );
  shell.name = `${name}.shell`;
  plume.name = `${name}.plume`;
  shell.rotation.x = Math.PI / 2;
  plume.rotation.x = -Math.PI / 2;
  shell.position.set(x, y, z);
  plume.position.set(x, y, z + 0.27);
  plume.visible = false;
  parent.add(shell, plume);
  return plume;
}

function buildEquipment(
  sockets: RigSockets,
  resources: OwnedEquipmentResources,
): EquipmentRig {
  const armor = equipmentMaterial(resources, 0x1a2134, 0x040505, 0.88, 0.28);
  const darkMetal = equipmentMaterial(
    resources,
    0x3031f2,
    0x010101,
    0.94,
    0.2,
  );
  const edge = equipmentMaterial(resources, 0x72ff82, 0x52c0c0, 0.7, 0.22);
  const plumeMaterial = equipmentMaterial(
    resources,
    0x66ffff,
    0x33ccff,
    0,
    0.18,
    true,
    0,
  );
  const blade = equipmentMaterial(
    resources,
    0xe0eaff,
    0x839dff,
    0.54,
    0.12,
    true,
    0.92,
  );

  const backpack = new Group();
  const leftBooster = new Group();
  const rightBooster = new Group();
  const forearmBlade = new Group();
  const activeWeapon = new Group();
  const holsteredWeapon = new Group();

  backpack.name = "greywrought.equipment.backpack";
  leftBooster.name = "greywrought.equipment.left-booster";
  rightBooster.name = "greywrought.equipment.right-booster";
  forearmBlade.name = "greywrought.equipment.forearm-blade";
  activeWeapon.name = "greywrought.equipment.active-weapon";
  holsteredWeapon.name = "greywrought.equipment.holstered-weapon";

  const backpackCore = mesh(
    ownGeometry(resources, new BoxGeometry(0.36, 0.44, 0.15)),
    armor,
  );
  backpackCore.name = "greywrought.equipment.backpack.core";
  backpack.add(backpackCore);
  const plumes = [
    addNozzle(
      resources,
      backpack,
      darkMetal,
      plumeMaterial,
      -0.105,
      -0.1,
      -0.04,
      "greywrought.nozzle.back-left",
    ),
    addNozzle(
      resources,
      backpack,
      darkMetal,
      plumeMaterial,
      0.105,
      -0.1,
      -0.04,
      "greywrought.nozzle.back-right",
    ),
    addNozzle(
      resources,
      leftBooster,
      darkMetal,
      plumeMaterial,
      0,
      0,
      0,
      "greywrought.nozzle.left-foot",
    ),
    addNozzle(
      resources,
      rightBooster,
      darkMetal,
      plumeMaterial,
      0,
      0,
      0,
      "greywrought.nozzle.right-foot",
    ),
  ];

  const boosterHousingGeometry = ownGeometry(
    resources,
    new BoxGeometry(0.18, 0.34, 0.18),
  );
  const leftBoosterHousing = mesh(boosterHousingGeometry, armor);
  const rightBoosterHousing = mesh(boosterHousingGeometry, armor);
  leftBoosterHousing.name = "greywrought.equipment.left-booster.housing";
  rightBoosterHousing.name = "greywrought.equipment.right-booster.housing";
  leftBoosterHousing.position.set(0, 0.13, -0.035);
  rightBoosterHousing.position.set(0, 0.13, -0.035);
  leftBooster.add(leftBoosterHousing);
  rightBooster.add(rightBoosterHousing);

  const bladeCore = mesh(
    ownGeometry(resources, new BoxGeometry(0.075, 0.46, 0.035)),
    blade,
  );
  bladeCore.name = "greywrought.equipment.forearm-blade.edge";
  bladeCore.position.set(-0.08, 0.2, -0.01);
  bladeCore.rotation.z = -0.1;
  forearmBlade.add(bladeCore);

  const weaponCore = mesh(
    ownGeometry(resources, new BoxGeometry(0.11, 0.92, 0.1)),
    edge,
  );
  const weaponGuard = mesh(
    ownGeometry(resources, new BoxGeometry(0.31, 0.055, 0.17)),
    darkMetal,
  );
  weaponCore.name = "greywrought.equipment.active-weapon.core";
  weaponGuard.name = "greywrought.equipment.active-weapon.guard";
  weaponCore.position.set(0, 0.44, 0);
  weaponGuard.position.set(0, 0.03, 0);
  activeWeapon.add(weaponCore, weaponGuard);

  const holsterCore = mesh(
    ownGeometry(resources, new BoxGeometry(0.14, 0.62, 0.17)),
    darkMetal,
  );
  holsterCore.name = "greywrought.equipment.holstered-weapon.core";
  holsterCore.position.set(0, -0.2, 0);
  holsterCore.rotation.z = 0.18;
  holsteredWeapon.add(holsterCore);

  sockets.back.add(backpack);
  sockets.leftBooster.add(leftBooster);
  sockets.rightBooster.add(rightBooster);
  sockets.leftForearm.add(forearmBlade);
  sockets.rightHand.add(activeWeapon);
  sockets.holster.add(holsteredWeapon);

  return {
    backpack,
    leftBooster,
    rightBooster,
    forearmBlade,
    activeWeapon,
    holsteredWeapon,
    plumes,
    plumeMaterial,
  };
}

function updateEquipmentPropulsion(
  equipment: EquipmentRig,
  magnitude: number,
  elapsedSeconds: number,
): void {
  const level = Math.max(0, Math.min(1, magnitude));
  const visible = level > 0.01;
  const pulse = visible ? 0.9 + 0.1 * Math.sin(elapsedSeconds * 34) : 0;
  equipment.plumeMaterial.opacity = visible ? (0.34 + level * 0.66) * pulse : 0;
  for (const plume of equipment.plumes) {
    plume.visible = visible;
    plume.scale.set(0.8 + level * 0.5, 0.5 + level * 1.8, 0.8 + level * 0.5);
  }
}

function exactClip(
  clips: AnimationClip[],
  name: string,
  assetName: string,
): AnimationClip {
  const clip = AnimationClip.findByName(clips, name);
  if (clip === null) {
    throw new Error(`${assetName} is missing clip ${name}`);
  }
  return clip;
}

function selectClips(base: GLTF): ClipLibrary {
  return {
    idle: exactClip(base.animations, "Idle", "Wayfarer model"),
    locomotion: exactClip(base.animations, "Run", "Wayfarer model"),
    jump: exactClip(base.animations, "Jump", "Wayfarer model"),
    attack: exactClip(base.animations, "SwordSlash", "Wayfarer model"),
    hit: exactClip(base.animations, "RecieveHit", "Wayfarer model"),
    death: exactClip(base.animations, "Death", "Wayfarer model"),
  };
}

function normalizeRoot(root: Object3D, x: number): void {
  const bounds = new Box3().setFromObject(root);
  const size = bounds.getSize(new Vector3());
  if (size.y <= 0) {
    throw new Error("Quaternius rig has an empty model bound");
  }
  root.scale.setScalar(2.45 / size.y);
  bounds.setFromObject(root);
  root.position.set(x, -bounds.min.y, 0);
}

function createRigInstance(
  source: Group,
  x: number,
  resources: OwnedEquipmentResources,
  name: string,
): RigInstance {
  const root = clone(source);
  root.name = name;
  const sockets = normalizeSockets(root);
  const equipment = buildEquipment(sockets, resources);
  normalizeRoot(root, x);
  return {
    root,
    mixer: new AnimationMixer(root),
    sockets,
    equipment,
    current: null,
  };
}

function playClip(
  instance: RigInstance,
  clip: AnimationClip,
  looping: boolean,
): void {
  instance.current?.fadeOut(0.14);
  const action = instance.mixer.clipAction(clip);
  action.reset();
  action.setEffectiveTimeScale(1);
  action.setEffectiveWeight(1);
  action.setLoop(looping ? LoopRepeat : LoopOnce, looping ? Number.POSITIVE_INFINITY : 1);
  action.clampWhenFinished = !looping;
  action.fadeIn(0.14).play();
  instance.current = action;
}

function disposeEquipmentResources(resources: OwnedEquipmentResources): void {
  for (const geometry of resources.geometries) geometry.dispose();
  for (const material of resources.materials) material.dispose();
}

function disposeLoadedModels(roots: readonly Object3D[]): void {
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();
  const textures = new Set<Texture>();
  for (const root of roots) {
    root.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      geometries.add(object.geometry);
      const meshMaterials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      for (const material of meshMaterials) {
        materials.add(material);
        for (const value of Object.values(material)) {
          if (value instanceof Texture) textures.add(value);
        }
      }
    });
  }
  for (const texture of textures) texture.dispose();
  for (const material of materials) material.dispose();
  for (const geometry of geometries) geometry.dispose();
}

async function loadRigAsset(): Promise<GLTF> {
  const loader = new GLTFLoader();
  try {
    return await loader.loadAsync(BASE_MODEL_URL);
  } catch (cause: unknown) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    throw new Error(`Unable to load the Quaternius rig assets: ${detail}`, {
      cause,
    });
  }
}

export async function mountArenaRig(
  parent: Group,
  placeholder: Group,
): Promise<MountedArenaRig> {
  const base = await loadRigAsset();
  const resources: OwnedEquipmentResources = { geometries: [], materials: [] };
  const clips = selectClips(base);
  const instance = createRigInstance(
    base.scene,
    0,
    resources,
    "greywrought.rig.wayfarer",
  );
  parent.add(instance.root);
  playClip(instance, clips.idle, true);
  placeholder.visible = false;
  return {
    parent,
    placeholder,
    instance,
    clips,
    resources,
    mode: "idle",
    attackRemaining: 0,
    propulsionLevel: 0,
    disposed: false,
  };
}

export function signalMountedArenaPropulsion(
  mounted: MountedArenaRig,
  magnitude: number,
): void {
  if (mounted.disposed) return;
  mounted.propulsionLevel = Math.max(
    mounted.propulsionLevel,
    Math.max(0, Math.min(1, magnitude)),
  );
}

export function setMountedArenaLocomotion(
  mounted: MountedArenaRig,
  moving: boolean,
  airborne: boolean,
): void {
  if (mounted.disposed || mounted.attackRemaining > 0) return;
  const mode = airborne ? "jump" : moving ? "locomotion" : "idle";
  if (mounted.mode === mode) return;
  playClip(mounted.instance, mounted.clips[mode], true);
  mounted.mode = mode;
}

export function playMountedArenaAttack(mounted: MountedArenaRig): void {
  // A sword action is a committed animation. Presentation must never restart
  // the clip while the current action is still running; Clause owns whether a
  // new action is admissible, and this guard keeps a duplicate visual edge
  // from rewinding the already-admitted action.
  if (mounted.disposed || mounted.attackRemaining > 0) return;
  playClip(mounted.instance, mounted.clips.attack, false);
  mounted.mode = "attack";
  mounted.attackRemaining = mounted.clips.attack.duration;
}

export function updateMountedArenaRig(
  mounted: MountedArenaRig,
  deltaSeconds: number,
): void {
  if (mounted.disposed) return;
  mounted.instance.mixer.update(deltaSeconds);
  mounted.propulsionLevel = Math.max(
    0,
    mounted.propulsionLevel - deltaSeconds * 2.6,
  );
  updateEquipmentPropulsion(
    mounted.instance.equipment,
    mounted.propulsionLevel,
    mounted.instance.mixer.time,
  );
  if (mounted.attackRemaining <= 0) return;
  mounted.attackRemaining = Math.max(0, mounted.attackRemaining - deltaSeconds);
  if (mounted.attackRemaining === 0) {
    playClip(mounted.instance, mounted.clips.idle, true);
    mounted.mode = "idle";
  }
}

export function disposeMountedArenaRig(mounted: MountedArenaRig): void {
  if (mounted.disposed) return;
  mounted.disposed = true;
  mounted.instance.mixer.stopAllAction();
  mounted.instance.mixer.uncacheRoot(mounted.instance.root);
  mounted.parent.remove(mounted.instance.root);
  mounted.placeholder.visible = true;
  disposeLoadedModels([mounted.instance.root]);
  disposeEquipmentResources(mounted.resources);
}

function markStage(lab: RigSocketLab, stage: number, label: string): void {
  lab.demoStage = stage;
  lab.status.textContent = label;
  document.body.dataset.demoStage = String(stage);
}

function playStage(lab: RigSocketLab, stage: number): void {
  const { clips } = lab;
  switch (stage) {
    case 0:
      playClip(lab.left, clips.idle, true);
      playClip(lab.right, clips.locomotion, true);
      markStage(lab, 0, "Idle + root-disabled sprint");
      break;
    case 1:
      playClip(lab.left, clips.jump, true);
      playClip(lab.right, clips.attack, false);
      markStage(lab, 1, "Aerial posture + committed sword action");
      break;
    case 2:
      playClip(lab.left, clips.hit, false);
      playClip(lab.right, clips.jump, true);
      markStage(lab, 2, "Hit reaction + aerial posture");
      break;
    case 3:
      playClip(lab.left, clips.attack, false);
      playClip(lab.right, clips.hit, false);
      markStage(lab, 3, "Shared clips, independent mixer state");
      break;
    default:
      playClip(lab.left, clips.idle, true);
      playClip(lab.right, clips.death, false);
      markStage(lab, 4, "Idle + death; all six equipment roots remain socketed");
  }
}

function advanceDemo(lab: RigSocketLab, elapsed: number): void {
  if (lab.demoStage < 1 && elapsed >= 2) playStage(lab, 1);
  if (lab.demoStage < 2 && elapsed >= 4) playStage(lab, 2);
  if (lab.demoStage < 3 && elapsed >= 6) playStage(lab, 3);
  if (lab.demoStage < 4 && elapsed >= 8) playStage(lab, 4);
}

function bindControl(
  lab: RigSocketLab,
  id: string,
  clip: AnimationClip,
  looping: boolean,
  label: string,
): void {
  const target = requireElement<HTMLButtonElement>(id);
  const handler = (): void => {
    playClip(lab.left, clip, looping);
    playClip(lab.right, clip, looping);
    lab.status.textContent = label;
  };
  target.addEventListener("click", handler);
  lab.listeners.push(() => target.removeEventListener("click", handler));
}

function bindControls(lab: RigSocketLab): void {
  bindControl(lab, "clip-idle", lab.clips.idle, true, "Both rigs: idle");
  bindControl(
    lab,
    "clip-sprint",
    lab.clips.locomotion,
    true,
    "Both rigs: root-disabled sprint",
  );
  bindControl(
    lab,
    "clip-jump",
    lab.clips.jump,
    true,
    "Both rigs: aerial posture",
  );
  bindControl(
    lab,
    "clip-attack",
    lab.clips.attack,
    false,
    "Both rigs: committed sword action",
  );
  bindControl(lab, "clip-hit", lab.clips.hit, false, "Both rigs: hit reaction");
  bindControl(lab, "clip-death", lab.clips.death, false, "Both rigs: death");
}

function updateViewport(lab: RigSocketLab): void {
  const width = Math.max(1, lab.host.clientWidth);
  const height = Math.max(1, lab.host.clientHeight);
  if (width === lab.width && height === lab.height) return;
  lab.width = width;
  lab.height = height;
  lab.camera.aspect = width / height;
  lab.camera.updateProjectionMatrix();
  lab.renderer.setSize(width, height, false);
}

function renderFrame(lab: RigSocketLab, timestamp: number): void {
  if (lab.disposed) return;
  const firstFrame = lab.startedAt < 0;
  if (firstFrame) lab.startedAt = timestamp;
  const delta =
    firstFrame || lab.lastTime < 0
      ? 0
      : Math.min(0.05, Math.max(0, (timestamp - lab.lastTime) / 1_000));
  lab.lastTime = timestamp;
  updateViewport(lab);
  lab.left.mixer.update(delta);
  lab.right.mixer.update(delta);
  advanceDemo(lab, (timestamp - lab.startedAt) / 1_000);
  lab.renderer.render(lab.scene, lab.camera);
  lab.frameHandle = requestAnimationFrame((next) => renderFrame(lab, next));
}

export function disposeRigSocketLab(lab: RigSocketLab): void {
  if (lab.disposed) return;
  lab.disposed = true;
  cancelAnimationFrame(lab.frameHandle);
  for (const removeListener of lab.listeners) removeListener();
  for (const instance of [lab.left, lab.right]) {
    instance.mixer.stopAllAction();
    instance.mixer.uncacheRoot(instance.root);
  }
  disposeLoadedModels([lab.left.root, lab.right.root]);
  disposeEquipmentResources(lab.resources);
  lab.renderer.dispose();
  lab.renderer.domElement.remove();
}

function assertEquipment(instance: RigInstance): void {
  const expected = [
    instance.equipment.backpack,
    instance.equipment.leftBooster,
    instance.equipment.rightBooster,
    instance.equipment.forearmBlade,
    instance.equipment.activeWeapon,
    instance.equipment.holsteredWeapon,
  ];
  if (expected.some((root) => root.parent === null)) {
    throw new Error("A modular equipment root is not mounted to its rig socket");
  }
}

export async function startRigSocketLab(): Promise<RigSocketLab> {
  const base = await loadRigAsset();
  const resources: OwnedEquipmentResources = { geometries: [], materials: [] };
  const clips = selectClips(base);
  const left = createRigInstance(base.scene, -1.55, resources, "greywrought.rig.left");
  const right = createRigInstance(base.scene, 1.55, resources, "greywrought.rig.right");
  assertEquipment(left);
  assertEquipment(right);

  const scene = new Scene();
  scene.background = new Color(0x02011b);
  const camera = new PerspectiveCamera(42, 1, 0.1, 50);
  camera.position.set(0, 3.4, 7.4);
  camera.lookAt(0, 1.15, 0);
  const renderer = new WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.max(1, Math.min(2, window.devicePixelRatio)));
  renderer.outputColorSpace = SRGBColorSpace;

  const floorMaterial = equipmentMaterial(resources, 0x0c0d0e, 0, 0.16, 0.82);
  const floor = mesh(
    ownGeometry(resources, new PlaneGeometry(11, 8)),
    floorMaterial,
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.015;
  const ambient = new AmbientLight(0x606874, 1.9);
  const keyLight = new DirectionalLight(0xffdbde, 4.2);
  keyLight.position.set(-4, 7, 5);
  scene.add(floor, ambient, keyLight, left.root, right.root);

  const host = requireElement<HTMLElement>("rig-stage");
  const status = requireElement<HTMLElement>("animation-status");
  host.append(renderer.domElement);
  const lab: RigSocketLab = {
    scene,
    camera,
    renderer,
    host,
    status,
    left,
    right,
    clips,
    resources,
    listeners: [],
    width: 0,
    height: 0,
    startedAt: -1,
    lastTime: -1,
    demoStage: 0,
    frameHandle: 0,
    disposed: false,
  };
  playStage(lab, 0);
  bindControls(lab);

  document.body.dataset.labState = "ready";
  document.body.dataset.socketCount = "6";
  document.body.dataset.equipmentCount = "6";
  document.body.dataset.mixerCount = "2";
  document.body.dataset.clipsShared = "true";
  document.body.dataset.rootMotion = "disabled";
  const unload = (): void => disposeRigSocketLab(lab);
  window.addEventListener("beforeunload", unload, { once: true });
  lab.listeners.push(() => window.removeEventListener("beforeunload", unload));
  lab.frameHandle = requestAnimationFrame((timestamp) => renderFrame(lab, timestamp));
  return lab;
}
