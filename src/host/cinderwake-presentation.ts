import {
  AmbientLight,
  AnimationMixer,
  BoxGeometry,
  Box3,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  Group,
  HemisphereLight,
  Material,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  PointLight,
  Raycaster,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  TorusGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
  LoopOnce,
  LoopRepeat,
  type AnimationAction,
  type BufferGeometry,
} from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import {
  disposeMountedArenaRig,
  mountArenaRig,
  playMountedArenaAttack,
  setMountedArenaLocomotion,
  signalMountedArenaPropulsion,
  updateMountedArenaRig,
  type MountedArenaRig,
} from "./rig-socket-lab.js";
import {
  createOpenFieldEnvironment,
  type FrontierGateAccess,
  type OpenFieldEnvironment,
} from "./open-field-environment.js";

export type { FrontierGateAccess } from "./open-field-environment.js";

export interface CinderwakeSubjectIds {
  readonly wayfarer: string;
  readonly wraith: string;
  readonly boar: string;
  readonly bolt: string;
  readonly relic: string;
  readonly cache: string;
  readonly moonwell: string;
}

export interface ProjectedPosition {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface AdmittedSubjectFrame {
  readonly subject: string;
  readonly position: ProjectedPosition;
  readonly visible: boolean;
  readonly vitalityRatio: number;
}

export interface AdmittedPresentationFrame {
  readonly ordinal: number;
  readonly subjects: readonly AdmittedSubjectFrame[];
  readonly cameraTarget: ProjectedPosition;
  readonly wayfarerMotion: {
    readonly moving: boolean;
    readonly airborne: boolean;
    readonly directionX: number;
    readonly directionZ: number;
  };
}

interface EffectShell {
  readonly telegraph: Object3D;
  readonly telegraphMaterial: MeshStandardMaterial;
  readonly afterimage: Object3D;
  readonly afterimageMaterial: MeshStandardMaterial;
  readonly impact: Object3D;
  readonly impactMaterial: MeshStandardMaterial;
  readonly death: Object3D;
  readonly deathMaterial: MeshStandardMaterial;
}

interface SubjectPresentation extends EffectShell {
  readonly subject: string;
  readonly root: Group;
  readonly placeholder: Group | null;
  readonly coreMaterial: MeshStandardMaterial;
  readonly lootSparkles: Group | null;
  readonly lootSparkleMaterial: MeshStandardMaterial | null;
  readonly baseElevation: number;
  readonly baseScale: number;
  telegraphLevel: number;
  attackLevel: number;
  recoveryLevel: number;
  impactLevel: number;
  propulsionLevel: number;
  deathLevel: number;
  lastImpact: number;
  lastPropulsion: number;
  lastDeath: number;
  facingYaw: number;
  lootable: boolean;
}

interface MountedBoarRig {
  readonly root: Object3D;
  readonly mixer: AnimationMixer;
  readonly walk: AnimationAction;
  readonly attack: AnimationAction;
  mode: "still" | "walk" | "charge" | "attack" | "dead";
}

interface OwnedPresentationResources {
  readonly geometries: BufferGeometry[];
  readonly materials: Material[];
}

export interface CinderwakePresentation {
  readonly scene: Scene;
  readonly camera: PerspectiveCamera;
  readonly renderer: WebGLRenderer;
  readonly subjects: readonly SubjectPresentation[];
  readonly chargeCorridor: Object3D;
  readonly chargeCorridorFill: Object3D;
  readonly chargeCorridorFillMaterial: MeshStandardMaterial;
  readonly resources: OwnedPresentationResources;
  readonly environment: OpenFieldEnvironment;
  readonly environmentReady: Promise<void>;
  readonly rigReady: Promise<void>;
  readonly boarReady: Promise<void>;
  readonly cacheReady: Promise<void>;
  width: number;
  height: number;
  lastTime: number;
  cameraImpulse: number;
  cameraTargetX: number;
  cameraTargetY: number;
  cameraTargetZ: number;
  cameraFollowX: number;
  cameraFollowY: number;
  cameraFollowZ: number;
  cameraOrbitYaw: number;
  cameraOrbitPitch: number;
  cameraDistance: number;
  wayfarerRig: MountedArenaRig | null;
  boarRig: MountedBoarRig | null;
  cacheRoot: Object3D | null;
  boarMoving: boolean;
  boarCharging: boolean;
  boarDead: boolean;
  pendingWayfarerAttack: boolean;
  pendingWayfarerPropulsion: number;
  disposed: boolean;
}

const clampUnit = (value: number): number => Math.max(0, Math.min(1, value));
const DEFAULT_CAMERA_HEIGHT = 9.6;
const DEFAULT_CAMERA_REACH = 8.2;
const DEFAULT_CAMERA_DISTANCE = Math.hypot(
  DEFAULT_CAMERA_HEIGHT,
  DEFAULT_CAMERA_REACH,
);
const DEFAULT_CAMERA_PITCH = Math.atan2(
  DEFAULT_CAMERA_HEIGHT,
  DEFAULT_CAMERA_REACH,
);
const MIN_CAMERA_PITCH = 0.55;
const MAX_CAMERA_PITCH = 1.35;
const MIN_CAMERA_DISTANCE = 5.5;
const MAX_CAMERA_DISTANCE = 18;

export function orbitPresentationCamera(
  presentation: CinderwakePresentation,
  horizontalPixels: number,
  verticalPixels: number,
): void {
  presentation.cameraOrbitYaw -= horizontalPixels * 0.005;
  presentation.cameraOrbitPitch = Math.max(
    MIN_CAMERA_PITCH,
    Math.min(
      MAX_CAMERA_PITCH,
      presentation.cameraOrbitPitch + verticalPixels * 0.004,
    ),
  );
}

export function zoomPresentationCamera(
  presentation: CinderwakePresentation,
  wheelDeltaY: number,
): void {
  presentation.cameraDistance = Math.max(
    MIN_CAMERA_DISTANCE,
    Math.min(
      MAX_CAMERA_DISTANCE,
      presentation.cameraDistance * Math.exp(wheelDeltaY * 0.001),
    ),
  );
}

function ownGeometry<T extends BufferGeometry>(
  resources: OwnedPresentationResources,
  geometry: T,
): T {
  resources.geometries.push(geometry);
  return geometry;
}

function standardMaterial(
  resources: OwnedPresentationResources,
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

function createEffectShell(
  resources: OwnedPresentationResources,
  root: Group,
  radius: number,
  telegraphColor: number,
  impactColor: number,
): EffectShell {
  const telegraphMaterial = standardMaterial(
    resources,
    telegraphColor,
    telegraphColor,
    0,
    0.28,
    true,
    0,
  );
  const telegraph = mesh(
    ownGeometry(resources, new TorusGeometry(radius, 0.035, 8, 48)),
    telegraphMaterial,
  );
  const afterimageMaterial = standardMaterial(
    resources,
    0xa9bfd0,
    0xa9bfd0,
    0,
    0.32,
    true,
    0,
  );
  const afterimage = mesh(
    ownGeometry(resources, new TorusGeometry(radius * 0.66, 0.11, 8, 36)),
    afterimageMaterial,
  );
  const impactMaterial = standardMaterial(
    resources,
    impactColor,
    impactColor,
    0,
    0.24,
    true,
    0,
  );
  const impact = mesh(
    ownGeometry(resources, new SphereGeometry(radius * 0.76, 18, 12)),
    impactMaterial,
  );
  const deathMaterial = standardMaterial(
    resources,
    0xde21c2,
    0xde21c2,
    0,
    0.3,
    true,
    0,
  );
  const death = mesh(
    ownGeometry(resources, new TorusGeometry(radius * 0.66, 0.12, 8, 40)),
    deathMaterial,
  );
  telegraph.rotation.x = -Math.PI / 2;
  afterimage.rotation.x = -Math.PI / 2;
  death.rotation.x = -Math.PI / 2;
  telegraph.position.y = 0.035;
  afterimage.position.y = 0.08;
  death.position.y = 0.055;
  telegraph.visible = false;
  afterimage.visible = false;
  impact.visible = false;
  death.visible = false;
  root.add(telegraph, afterimage, impact, death);
  return {
    telegraph,
    telegraphMaterial,
    afterimage,
    afterimageMaterial,
    impact,
    impactMaterial,
    death,
    deathMaterial,
  };
}

function subjectPresentation(
  subject: string,
  root: Group,
  placeholder: Group | null,
  coreMaterial: MeshStandardMaterial,
  effects: EffectShell,
  baseElevation = 0,
  baseScale = 1,
  lootSparkles: Group | null = null,
  lootSparkleMaterial: MeshStandardMaterial | null = null,
): SubjectPresentation {
  root.visible = false;
  return {
    subject,
    root,
    placeholder,
    coreMaterial,
    lootSparkles,
    lootSparkleMaterial,
    ...effects,
    baseElevation,
    baseScale,
    telegraphLevel: 0,
    attackLevel: 0,
    recoveryLevel: 0,
    impactLevel: 0,
    propulsionLevel: 0,
    deathLevel: 0,
    lastImpact: -1,
    lastPropulsion: -1,
    lastDeath: -1,
    facingYaw: placeholder === null ? 0 : Math.PI / 2,
    lootable: false,
  };
}

function createWayfarer(
  subject: string,
  resources: OwnedPresentationResources,
): SubjectPresentation {
  const root = new Group();
  const placeholder = new Group();
  placeholder.name = "greywrought.wayfarer.placeholder";
  const bodyMaterial = standardMaterial(
    resources,
    0xdda8d0,
    0x160bd0,
    0.42,
    0.54,
  );
  const body = mesh(
    ownGeometry(resources, new ConeGeometry(0.5, 1.34, 7)),
    bodyMaterial,
  );
  body.position.y = 0.67;
  body.scale.set(1, 1, 0.78);
  const hood = mesh(
    ownGeometry(resources, new SphereGeometry(0.31, 12, 8)),
    standardMaterial(resources, 0x323232, 0x030201, 0.18, 0.82),
  );
  hood.position.set(0, 1.26, -0.04);
  const blade = mesh(
    ownGeometry(resources, new BoxGeometry(0.1, 0.72, 0.08)),
    standardMaterial(resources, 0xf1eb67, 0x5d461e, 0.92, 0.24),
  );
  blade.position.set(0.46, 0.72, 0.12);
  blade.rotation.z = -0.34;
  placeholder.add(body, hood, blade);
  root.add(placeholder);
  return subjectPresentation(
    subject,
    root,
    placeholder,
    bodyMaterial,
    createEffectShell(resources, root, 0.78, 0xffd2b7, 0xffe853),
  );
}

function createWraith(
  subject: string,
  resources: OwnedPresentationResources,
): SubjectPresentation {
  const root = new Group();
  const coreMaterial = standardMaterial(
    resources,
    0x6a0fe7,
    0x2613c4,
    0.22,
    0.34,
    true,
    0.84,
  );
  const core = mesh(
    ownGeometry(resources, new SphereGeometry(0.64, 20, 14)),
    coreMaterial,
  );
  core.position.y = 0.92;
  const halo = mesh(
    ownGeometry(resources, new TorusGeometry(0.82, 0.045, 8, 40)),
    standardMaterial(resources, 0xc78fff, 0xc78fff, 0, 0.3, true, 0.5),
  );
  halo.rotation.x = Math.PI / 2;
  halo.position.y = 0.92;
  const tail = mesh(
    ownGeometry(resources, new ConeGeometry(0.49, 1.45, 7)),
    standardMaterial(resources, 0x2c0c5b, 0x17042a, 0.1, 0.48, true, 0.56),
  );
  tail.position.y = 0.16;
  root.add(core, halo, tail);
  return subjectPresentation(
    subject,
    root,
    null,
    coreMaterial,
    createEffectShell(resources, root, 1.02, 0xe64e58, 0xff7fce),
  );
}

function createBoar(
  subject: string,
  resources: OwnedPresentationResources,
): SubjectPresentation {
  const root = new Group();
  const bodyMaterial = standardMaterial(
    resources,
    0x5a462d,
    0x161720,
    0.78,
    0.36,
  );
  const sparkleGeometry = ownGeometry(
    resources,
    new SphereGeometry(0.055, 6, 4),
  );
  const sparkleMaterial = standardMaterial(
    resources,
    0xffed8a,
    0xffc12d,
    0,
    0.12,
    true,
    0.9,
  );
  const lootSparkles = new Group();
  lootSparkles.name = "greywrought.boar.loot-sparkles";
  const sparklePositions = [
    [-0.74, 0.58, -0.46],
    [-0.48, 1.02, 0.38],
    [-0.08, 1.26, -0.34],
    [0.34, 1.1, 0.4],
    [0.72, 0.72, -0.42],
    [0.18, 0.5, 0.5],
  ] as const;
  for (const [x, y, z] of sparklePositions) {
    const sparkle = mesh(sparkleGeometry, sparkleMaterial);
    sparkle.position.set(x, y, z);
    sparkle.userData.baseY = y;
    lootSparkles.add(sparkle);
  }
  lootSparkles.visible = false;
  const interactionProxyMaterial = new MeshBasicMaterial({
    transparent: true,
    opacity: 0,
    depthWrite: false,
    colorWrite: false,
  });
  resources.materials.push(interactionProxyMaterial);
  const interactionProxy = mesh(
    ownGeometry(resources, new BoxGeometry(3.0, 2.0, 2.2)),
    interactionProxyMaterial,
  );
  interactionProxy.name = "greywrought.boar.interaction-proxy";
  interactionProxy.position.y = 0.75;
  root.add(interactionProxy, lootSparkles);
  return subjectPresentation(
    subject,
    root,
    null,
    bodyMaterial,
    createEffectShell(resources, root, 1.18, 0xffa000, 0xff2c00),
    0,
    1,
    lootSparkles,
    sparkleMaterial,
  );
}

async function mountBoarRig(
  subject: SubjectPresentation,
): Promise<MountedBoarRig> {
  const gltf = await new GLTFLoader().loadAsync(
    "/assets/opengameart/teh-bucket-boar/boar.glb",
  );
  gltf.scene.name = "greywrought.boar.authored-rig";
  gltf.scene.rotation.y = -Math.PI / 2;
  subject.root.add(gltf.scene);
  gltf.scene.updateWorldMatrix(true, true);
  const initialBounds = new Box3().setFromObject(gltf.scene);
  const initialSize = initialBounds.getSize(new Vector3());
  const horizontalLength = Math.max(initialSize.x, initialSize.z);
  if (!Number.isFinite(horizontalLength) || horizontalLength <= 0) {
    subject.root.remove(gltf.scene);
    throw new Error("CC0 boar has no finite renderable bounds");
  }
  gltf.scene.scale.setScalar(2.2 / horizontalLength);
  gltf.scene.updateWorldMatrix(true, true);
  const fittedBounds = new Box3().setFromObject(gltf.scene);
  const fittedCenter = fittedBounds.getCenter(new Vector3());
  gltf.scene.position.set(
    gltf.scene.position.x - fittedCenter.x,
    gltf.scene.position.y - fittedBounds.min.y,
    gltf.scene.position.z - fittedCenter.z,
  );
  gltf.scene.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    object.castShadow = true;
    object.receiveShadow = true;
  });
  const walkClip = gltf.animations.find(({ name }) => name === "walk");
  const attackClip = gltf.animations.find(({ name }) => name === "attack");
  if (walkClip === undefined || attackClip === undefined) {
    subject.root.remove(gltf.scene);
    throw new Error("CC0 boar is missing its authored walk or attack action");
  }
  const mixer = new AnimationMixer(gltf.scene);
  const walk = mixer.clipAction(walkClip);
  walk.setLoop(LoopRepeat, Infinity);
  const attack = mixer.clipAction(attackClip);
  attack.setLoop(LoopOnce, 1);
  attack.clampWhenFinished = true;
  return { root: gltf.scene, mixer, walk, attack, mode: "still" };
}

function createCephoriumCache(
  subject: string,
  resources: OwnedPresentationResources,
): SubjectPresentation {
  const root = new Group();
  const coreMaterial = standardMaterial(
    resources,
    0x4fffe1,
    0x16d9c8,
    0.18,
    0.24,
    true,
    0.82,
  );
  const core = mesh(
    ownGeometry(resources, new SphereGeometry(0.34, 8, 6)),
    coreMaterial,
  );
  core.name = "greywrought.cephorium-cache.core";
  core.position.y = 0.66;
  core.scale.set(0.72, 1.55, 0.72);

  const sparkleMaterial = standardMaterial(
    resources,
    0xc9fff5,
    0x3fffe8,
    0,
    0.08,
    true,
    0.92,
  );
  const sparkleGeometry = ownGeometry(
    resources,
    new SphereGeometry(0.06, 6, 4),
  );
  const lootSparkles = new Group();
  lootSparkles.name = "greywrought.cephorium-cache.loot-sparkles";
  const sparklePositions = [
    [-0.68, 0.54, -0.38],
    [-0.36, 1.12, 0.32],
    [0.0, 1.46, -0.16],
    [0.42, 1.08, 0.36],
    [0.72, 0.62, -0.34],
  ] as const;
  for (const [x, y, z] of sparklePositions) {
    const sparkle = mesh(sparkleGeometry, sparkleMaterial);
    sparkle.position.set(x, y, z);
    sparkle.userData.baseY = y;
    lootSparkles.add(sparkle);
  }
  lootSparkles.visible = false;

  const interactionProxyMaterial = new MeshBasicMaterial({
    transparent: true,
    opacity: 0,
    depthWrite: false,
    colorWrite: false,
  });
  resources.materials.push(interactionProxyMaterial);
  const interactionProxy = mesh(
    ownGeometry(resources, new BoxGeometry(2.8, 2.1, 2.5)),
    interactionProxyMaterial,
  );
  interactionProxy.name = "greywrought.cephorium-cache.interaction-proxy";
  interactionProxy.position.y = 0.8;
  root.add(core, interactionProxy, lootSparkles);
  return subjectPresentation(
    subject,
    root,
    null,
    coreMaterial,
    createEffectShell(resources, root, 1.08, 0x6effee, 0x26ffe4),
    0,
    1,
    lootSparkles,
    sparkleMaterial,
  );
}

async function mountCephoriumCache(
  subject: SubjectPresentation,
): Promise<Object3D> {
  const gltf = await new GLTFLoader().loadAsync(
    "/assets/quaternius/nature/Rock_Medium_3.gltf",
  );
  gltf.scene.name = "greywrought.cephorium-cache.quaternius-rock";
  gltf.scene.updateWorldMatrix(true, true);
  const initialBounds = new Box3().setFromObject(gltf.scene);
  const initialSize = initialBounds.getSize(new Vector3());
  const horizontalLength = Math.max(initialSize.x, initialSize.z);
  if (!Number.isFinite(horizontalLength) || horizontalLength <= 0) {
    throw new Error("Quaternius Cephorium cache has no finite renderable bounds");
  }
  gltf.scene.scale.setScalar(2.25 / horizontalLength);
  gltf.scene.updateWorldMatrix(true, true);
  const fittedBounds = new Box3().setFromObject(gltf.scene);
  const fittedCenter = fittedBounds.getCenter(new Vector3());
  gltf.scene.position.set(
    gltf.scene.position.x - fittedCenter.x,
    gltf.scene.position.y - fittedBounds.min.y,
    gltf.scene.position.z - fittedCenter.z,
  );
  gltf.scene.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    object.castShadow = true;
    object.receiveShadow = true;
  });
  subject.root.add(gltf.scene);
  return gltf.scene;
}

function playBoarMode(
  rig: MountedBoarRig,
  mode: "still" | "walk" | "charge" | "dead",
): void {
  if (rig.mode === "attack" && rig.attack.isRunning()) return;
  if (rig.mode === mode) return;
  rig.mode = mode;
  rig.attack.stop();
  if (mode === "walk" || mode === "charge") {
    rig.walk
      .reset()
      .setEffectiveTimeScale(mode === "charge" ? 2.05 : 1)
      .fadeIn(0.1)
      .play();
    return;
  }
  rig.walk.fadeOut(0.1);
}

function updateBoarRig(
  presentation: CinderwakePresentation,
  delta: number,
): void {
  const rig = presentation.boarRig;
  if (rig === null) return;
  const desired = presentation.boarDead
    ? "dead"
    : presentation.boarCharging
      ? "charge"
      : presentation.boarMoving
        ? "walk"
        : "still";
  playBoarMode(rig, desired);
  rig.mixer.update(delta);
}

export function playBoarAttack(
  presentation: CinderwakePresentation,
): void {
  const rig = presentation.boarRig;
  if (rig === null || presentation.boarDead) return;
  rig.walk.fadeOut(0.06);
  rig.attack.reset().fadeIn(0.04).play();
  rig.mode = "attack";
}

export function setSubjectLootable(
  presentation: CinderwakePresentation,
  subjectId: string,
  lootable: boolean,
): void {
  const subject = subjectById(presentation, subjectId);
  if (subject !== undefined) subject.lootable = lootable;
}

export function setFrontierAccess(
  presentation: CinderwakePresentation,
  boundaryX: number,
  access: FrontierGateAccess,
): void {
  presentation.environment.setFrontierAccess(boundaryX, access);
  document.body.dataset.frontierGateAccess = access;
  document.body.dataset.frontierGateBoundaryX = String(boundaryX);
  document.body.dataset.frontierGateSealed = String(access === "sealed");
}

export function pickPresentationSubject(
  presentation: CinderwakePresentation,
  subjectId: string,
  clientX: number,
  clientY: number,
): boolean {
  const subject = subjectById(presentation, subjectId);
  if (subject === undefined || !subject.root.visible) return false;
  const rectangle = presentation.renderer.domElement.getBoundingClientRect();
  if (
    rectangle.width <= 0 ||
    rectangle.height <= 0 ||
    clientX < rectangle.left ||
    clientX > rectangle.right ||
    clientY < rectangle.top ||
    clientY > rectangle.bottom
  ) {
    return false;
  }
  const pointer = new Vector2(
    ((clientX - rectangle.left) / rectangle.width) * 2 - 1,
    -((clientY - rectangle.top) / rectangle.height) * 2 + 1,
  );
  subject.root.updateWorldMatrix(true, true);
  const raycaster = new Raycaster();
  raycaster.setFromCamera(pointer, presentation.camera);
  return raycaster.intersectObject(subject.root, true).length > 0;
}

function createBolt(
  subject: string,
  resources: OwnedPresentationResources,
): SubjectPresentation {
  const root = new Group();
  const coreMaterial = standardMaterial(
    resources,
    0xffb328,
    0xff56b3,
    0.08,
    0.18,
    true,
    0.96,
  );
  const core = mesh(
    ownGeometry(resources, new SphereGeometry(0.2, 16, 10)),
    coreMaterial,
  );
  const wake = mesh(
    ownGeometry(resources, new TorusGeometry(0.29, 0.045, 8, 24)),
    standardMaterial(resources, 0xfff000, 0xff8700, 0, 0.24, true, 0.72),
  );
  wake.rotation.y = Math.PI / 2;
  root.add(core, wake);
  return subjectPresentation(
    subject,
    root,
    null,
    coreMaterial,
    createEffectShell(resources, root, 0.34, 0xfff000, 0xffffb7),
  );
}

function createRelic(
  subject: string,
  resources: OwnedPresentationResources,
): SubjectPresentation {
  const root = new Group();
  const ringMaterial = standardMaterial(
    resources,
    0xeea290,
    0x618000,
    0.88,
    0.24,
  );
  const ring = mesh(
    ownGeometry(resources, new TorusGeometry(0.31, 0.095, 10, 28)),
    ringMaterial,
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.4;
  const ember = mesh(
    ownGeometry(resources, new SphereGeometry(0.095, 10, 8)),
    standardMaterial(resources, 0xffd2b7, 0xffd2b7, 0, 0.24),
  );
  ember.position.y = 0.4;
  root.add(ring, ember);
  return subjectPresentation(
    subject,
    root,
    null,
    ringMaterial,
    createEffectShell(resources, root, 0.56, 0xfffa49, 0xfff046),
  );
}

function createMoonwell(
  subject: string,
  resources: OwnedPresentationResources,
): SubjectPresentation {
  const root = new Group();
  const basinMaterial = standardMaterial(
    resources,
    0x243e45,
    0x06090a,
    0.54,
    0.76,
  );
  const basin = mesh(
    ownGeometry(resources, new CylinderGeometry(0.94, 1.12, 0.44, 10)),
    basinMaterial,
  );
  basin.position.y = 0.22;
  const wake = mesh(
    ownGeometry(resources, new TorusGeometry(0.71, 0.065, 8, 40)),
    standardMaterial(resources, 0x59d7ff, 0x59d7ff, 0, 0.32, true, 0.68),
  );
  wake.rotation.x = Math.PI / 2;
  wake.position.y = 0.48;
  root.add(basin, wake);
  return subjectPresentation(
    subject,
    root,
    null,
    basinMaterial,
    createEffectShell(resources, root, 1.18, 0x66b0ff, 0x9900ed),
  );
}

function subjectById(
  presentation: CinderwakePresentation,
  subjectId: string,
): SubjectPresentation | undefined {
  return presentation.subjects.find(({ subject }) => subject === subjectId);
}

function updateViewport(
  presentation: CinderwakePresentation,
  viewportWidth: number,
  viewportHeight: number,
): void {
  const width = Math.max(1, viewportWidth);
  const height = Math.max(1, viewportHeight);
  if (width === presentation.width && height === presentation.height) return;
  presentation.width = width;
  presentation.height = height;
  presentation.camera.aspect = width / height;
  presentation.camera.updateProjectionMatrix();
  // Keep the CSS canvas full-size while bounding the actual framebuffer. On
  // integrated/software GPUs a large retina framebuffer can block the main
  // thread long enough to look like a game freeze.
  const maxFramebufferPixels = 360_000; // 600 × 600; keeps SwiftShader responsive
  const framebufferScale = Math.min(
    1,
    Math.sqrt(maxFramebufferPixels / (width * height)),
  );
  presentation.renderer.setSize(
    Math.max(1, Math.round(width * framebufferScale)),
    Math.max(1, Math.round(height * framebufferScale)),
    false,
  );
}

export function applyAdmittedFrame(
  presentation: CinderwakePresentation,
  frame: AdmittedPresentationFrame,
): void {
  if (presentation.disposed) return;
  presentation.cameraTargetX = frame.cameraTarget.x;
  presentation.cameraTargetY = frame.cameraTarget.y;
  presentation.cameraTargetZ = frame.cameraTarget.z;
  presentation.cameraFollowX = frame.cameraTarget.x;
  presentation.cameraFollowY = frame.cameraTarget.y;
  presentation.cameraFollowZ = frame.cameraTarget.z;
  for (const admitted of frame.subjects) {
    const subject = subjectById(presentation, admitted.subject);
    if (subject === undefined) continue;
    if (subject.subject === "magitek-boar") {
      presentation.boarMoving =
        admitted.visible &&
        Math.hypot(
          admitted.position.x - subject.root.position.x,
          admitted.position.z - subject.root.position.z,
        ) > 0.0001;
      presentation.boarDead = admitted.vitalityRatio <= 0;
    }
    const ratio = clampUnit(admitted.vitalityRatio);
    subject.root.position.set(
      admitted.position.x,
      admitted.position.y + subject.baseElevation,
      admitted.position.z,
    );
    subject.root.visible = admitted.visible;
    subject.coreMaterial.opacity = 0.34 + ratio * 0.66;
    subject.root.scale.setScalar(subject.baseScale * (0.9 + ratio * 0.1));
  }
  if (frame.wayfarerMotion.moving) {
    const wayfarer = presentation.subjects.find(
      ({ placeholder }) => placeholder !== null,
    );
    if (wayfarer !== undefined) {
      wayfarer.facingYaw = Math.atan2(
        frame.wayfarerMotion.directionX,
        frame.wayfarerMotion.directionZ,
      );
    }
  }
  if (presentation.wayfarerRig !== null) {
    setMountedArenaLocomotion(
      presentation.wayfarerRig,
      frame.wayfarerMotion.moving,
      frame.wayfarerMotion.airborne,
    );
  }
}

export function playWayfarerSwordAction(
  presentation: CinderwakePresentation,
  directionX: number,
  directionZ: number,
): void {
  const wayfarer = presentation.subjects.find(
    ({ placeholder }) => placeholder !== null,
  );
  if (
    wayfarer !== undefined &&
    (Math.abs(directionX) > 0.0001 || Math.abs(directionZ) > 0.0001)
  ) {
    wayfarer.facingYaw = Math.atan2(directionX, directionZ);
    document.body.dataset.lastAttackFacingYaw = String(wayfarer.facingYaw);
  }
  document.body.dataset.lastRigAction = "attack";
  if (presentation.wayfarerRig === null) {
    presentation.pendingWayfarerAttack = true;
    return;
  }
  playMountedArenaAttack(presentation.wayfarerRig);
}

export function setActivityCue(
  presentation: CinderwakePresentation,
  subjectId: string,
  telegraph: number,
  attack: number,
  recovery: number,
): void {
  const subject = subjectById(presentation, subjectId);
  if (subject === undefined) return;
  subject.telegraphLevel = clampUnit(telegraph);
  subject.attackLevel = clampUnit(attack);
  subject.recoveryLevel = clampUnit(recovery);
  if (subject.subject === "magitek-boar") {
    presentation.boarCharging = subject.attackLevel > 0.001;
  }
}

export function faceSubjectToward(
  presentation: CinderwakePresentation,
  subjectId: string,
  target: ProjectedPosition,
): void {
  const subject = subjectById(presentation, subjectId);
  if (subject === undefined) return;
  const directionX = target.x - subject.root.position.x;
  const directionZ = target.z - subject.root.position.z;
  if (Math.abs(directionX) < 0.0001 && Math.abs(directionZ) < 0.0001) return;
  subject.facingYaw = Math.atan2(directionX, directionZ);
}

export function setChargeCorridor(
  presentation: CinderwakePresentation,
  start: ProjectedPosition,
  end: ProjectedPosition,
  radius: number,
  fillProgress: number,
  charging: boolean,
): void {
  const corridor = presentation.chargeCorridor;
  const fill = presentation.chargeCorridorFill;
  const progress = clampUnit(fillProgress);
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const dz = end.z - start.z;
  const horizontal = Math.sqrt(dx * dx + dz * dz);
  const length = Math.sqrt(horizontal * horizontal + dy * dy);
  corridor.position.set(
    (start.x + end.x) / 2,
    (start.y + end.y) / 2,
    (start.z + end.z) / 2,
  );
  corridor.scale.set(length, radius * 2, radius * 2);
  corridor.rotation.y = -Math.atan2(dz, dx);
  corridor.rotation.z = Math.atan2(dy, horizontal);
  corridor.visible = true;
  fill.visible = progress > 0.001;
  fill.position.x = (progress - 1) / 2;
  fill.scale.set(Math.max(0.001, progress), 0.82, 0.82);
  presentation.chargeCorridorFillMaterial.opacity = charging
    ? 0.58
    : 0.16 + progress * 0.38;
}

export function hideChargeCorridor(
  presentation: CinderwakePresentation,
): void {
  presentation.chargeCorridor.visible = false;
}

export function signalImpact(
  presentation: CinderwakePresentation,
  subjectId: string,
  occurrenceOrdinal: number,
  magnitude: number,
): void {
  const subject = subjectById(presentation, subjectId);
  if (subject === undefined || occurrenceOrdinal <= subject.lastImpact) return;
  subject.lastImpact = occurrenceOrdinal;
  subject.impactLevel = clampUnit(magnitude);
  presentation.cameraImpulse = Math.max(
    presentation.cameraImpulse,
    0.16 * clampUnit(magnitude),
  );
}

export function signalPropulsion(
  presentation: CinderwakePresentation,
  subjectId: string,
  occurrenceOrdinal: number,
  magnitude: number,
): void {
  const subject = subjectById(presentation, subjectId);
  if (subject === undefined || occurrenceOrdinal <= subject.lastPropulsion) return;
  subject.lastPropulsion = occurrenceOrdinal;
  subject.propulsionLevel = clampUnit(magnitude);
  if (subject.placeholder === null) return;
  if (presentation.wayfarerRig === null) {
    presentation.pendingWayfarerPropulsion = Math.max(
      presentation.pendingWayfarerPropulsion,
      subject.propulsionLevel,
    );
    return;
  }
  signalMountedArenaPropulsion(
    presentation.wayfarerRig,
    subject.propulsionLevel,
  );
}

export function signalDeath(
  presentation: CinderwakePresentation,
  subjectId: string,
  occurrenceOrdinal: number,
): void {
  const subject = subjectById(presentation, subjectId);
  if (subject === undefined || occurrenceOrdinal <= subject.lastDeath) return;
  subject.lastDeath = occurrenceOrdinal;
  subject.deathLevel = 1;
}

function animateSubject(
  subject: SubjectPresentation,
  elapsed: number,
  delta: number,
): void {
  const pulse = 1 + 0.18 * Math.sin(elapsed * 6.4);
  subject.impactLevel = Math.max(0, subject.impactLevel - delta * 4.8);
  subject.propulsionLevel = Math.max(0, subject.propulsionLevel - delta * 3.7);
  subject.deathLevel = Math.max(0, subject.deathLevel - delta * 0.55);

  subject.telegraph.visible = subject.telegraphLevel > 0.001;
  subject.telegraphMaterial.opacity = subject.telegraphLevel * 0.56 * pulse;
  subject.telegraph.scale.setScalar(0.72 + 0.42 * subject.telegraphLevel * pulse);
  subject.telegraph.rotation.z = elapsed * (0.45 + subject.attackLevel);

  subject.afterimage.visible = subject.propulsionLevel > 0.001;
  subject.afterimageMaterial.opacity = 0.4 * subject.propulsionLevel;
  subject.afterimage.scale.setScalar(
    0.72 + 1.45 * (1 - subject.propulsionLevel),
  );
  subject.impact.visible = subject.impactLevel > 0.001;
  subject.impactMaterial.opacity = 0.46 * subject.impactLevel;
  subject.impact.scale.setScalar(0.78 + 0.72 * (1 - subject.impactLevel));
  subject.death.visible = subject.deathLevel > 0.001;
  subject.deathMaterial.opacity = 0.62 * subject.deathLevel;
  subject.death.scale.setScalar(0.55 + 2.4 * (1 - subject.deathLevel));
  if (subject.lootSparkles !== null) {
    subject.lootSparkles.visible = subject.lootable;
    if (subject.lootable) {
      subject.lootSparkles.rotation.y = elapsed * 1.25;
      subject.lootSparkles.children.forEach((sparkle, index) => {
        const phase = elapsed * 4.8 + index * 1.7;
        const pulseScale = 0.45 + 0.8 * (0.5 + 0.5 * Math.sin(phase));
        sparkle.scale.setScalar(pulseScale);
        sparkle.position.y = Number(sparkle.userData.baseY) + Math.sin(phase) * 0.08;
      });
      if (subject.lootSparkleMaterial !== null) {
        subject.lootSparkleMaterial.opacity =
          0.5 + 0.45 * (0.5 + 0.5 * Math.sin(elapsed * 6.2));
      }
    }
  }
  subject.root.rotation.y = subject.facingYaw;
}

export function renderPresentationFrame(
  presentation: CinderwakePresentation,
  elapsedSeconds: number,
  viewportWidth: number,
  viewportHeight: number,
): void {
  if (presentation.disposed) return;
  const delta =
    presentation.lastTime === 0
      ? 0
      : Math.min(0.05, Math.max(0, elapsedSeconds - presentation.lastTime));
  presentation.lastTime = elapsedSeconds;
  presentation.cameraImpulse = Math.max(
    0,
    presentation.cameraImpulse - delta * 0.76,
  );
  updateViewport(presentation, viewportWidth, viewportHeight);
  for (const subject of presentation.subjects) {
    animateSubject(subject, elapsedSeconds, delta);
  }
  if (presentation.wayfarerRig !== null) {
    updateMountedArenaRig(presentation.wayfarerRig, delta);
    document.body.dataset.rigAnimationMode = presentation.wayfarerRig.mode;
    document.body.dataset.rigPropulsionLevel = String(
      presentation.wayfarerRig.propulsionLevel,
    );
  }
  updateBoarRig(presentation, delta);
  const impulse = presentation.cameraImpulse;
  const horizontalReach =
    Math.cos(presentation.cameraOrbitPitch) * presentation.cameraDistance;
  const verticalReach =
    Math.sin(presentation.cameraOrbitPitch) * presentation.cameraDistance;
  presentation.camera.position.set(
    presentation.cameraFollowX +
      Math.sin(presentation.cameraOrbitYaw) * horizontalReach +
      impulse * 0.52,
    presentation.cameraFollowY + verticalReach + impulse * 0.34,
    presentation.cameraFollowZ +
      Math.cos(presentation.cameraOrbitYaw) * horizontalReach -
      impulse * 0.28,
  );
  presentation.camera.lookAt(
    presentation.cameraFollowX,
    presentation.cameraFollowY + 0.45,
    presentation.cameraFollowZ,
  );
  presentation.renderer.render(presentation.scene, presentation.camera);
}

export function createCinderwakePresentation(
  ids: CinderwakeSubjectIds,
  pixelRatio: number,
): CinderwakePresentation {
  const scene = new Scene();
  const camera = new PerspectiveCamera(43, 1, 0.1, 90);
  // Keep the presentation path responsive on integrated/software GPUs. The
  // semantic session runs independently in the resident worker; rendering
  // must never consume the browser's frame budget with multisample overhead.
  const renderer = new WebGLRenderer({
    antialias: false,
    alpha: false,
    powerPreference: "high-performance",
  });
  const resources: OwnedPresentationResources = { geometries: [], materials: [] };
  document.body.dataset.environmentState = "loading";
  document.body.dataset.environmentLoadStartedAt = String(
    Math.round(performance.now()),
  );
  const environment = createOpenFieldEnvironment(scene);
  const environmentReady = environment.ready.then(
    () => {
      document.body.dataset.environmentState = "ready";
      document.body.dataset.environmentReadyAt = String(
        Math.round(performance.now()),
      );
    },
    (cause: unknown) => {
      document.body.dataset.environmentState = "failed";
      document.body.dataset.environmentFailedAt = String(
        Math.round(performance.now()),
      );
      document.body.dataset.environmentFailureMessage =
        cause instanceof Error ? cause.message : String(cause);
      throw cause;
    },
  );
  const wayfarer = createWayfarer(ids.wayfarer, resources);
  const wraith = createWraith(ids.wraith, resources);
  const boar = createBoar(ids.boar, resources);
  const cache = createCephoriumCache(ids.cache, resources);
  const subjects = [
    wayfarer,
    wraith,
    boar,
    createBolt(ids.bolt, resources),
    createRelic(ids.relic, resources),
    cache,
    createMoonwell(ids.moonwell, resources),
  ];
  const chargeCorridor = new Group();
  const chargeCorridorGeometry = ownGeometry(resources, new BoxGeometry(1, 1, 1));
  const chargeCorridorOutlineMaterial = standardMaterial(
    resources,
    0xff7b61,
    0xff2400,
    0,
    0.18,
    true,
    0.72,
  );
  chargeCorridorOutlineMaterial.wireframe = true;
  const chargeCorridorFillMaterial = standardMaterial(
    resources,
    0xff3b24,
    0xff0000,
    0,
    0.24,
    true,
    0.2,
  );
  const chargeCorridorOutline = mesh(
    chargeCorridorGeometry,
    chargeCorridorOutlineMaterial,
  );
  const chargeCorridorFill = mesh(
    chargeCorridorGeometry,
    chargeCorridorFillMaterial,
  );
  chargeCorridor.add(chargeCorridorOutline, chargeCorridorFill);
  chargeCorridor.visible = false;
  const presentation: CinderwakePresentation = {
    scene,
    camera,
    renderer,
    subjects,
    chargeCorridor,
    chargeCorridorFill,
    chargeCorridorFillMaterial,
    resources,
    environment,
    environmentReady,
    rigReady: Promise.resolve(),
    boarReady: Promise.resolve(),
    cacheReady: Promise.resolve(),
    width: 0,
    height: 0,
    lastTime: 0,
    cameraImpulse: 0,
    cameraTargetX: 0,
    cameraTargetY: 0,
    cameraTargetZ: 0,
    cameraFollowX: 0,
    cameraFollowY: 0,
    cameraFollowZ: 0,
    cameraOrbitYaw: 0,
    cameraOrbitPitch: DEFAULT_CAMERA_PITCH,
    cameraDistance: DEFAULT_CAMERA_DISTANCE,
    wayfarerRig: null,
    boarRig: null,
    cacheRoot: null,
    boarMoving: false,
    boarCharging: false,
    boarDead: false,
    pendingWayfarerAttack: false,
    pendingWayfarerPropulsion: 0,
    disposed: false,
  };

  scene.background = new Color(0x13221d);
  camera.position.set(0, DEFAULT_CAMERA_HEIGHT, DEFAULT_CAMERA_REACH);
  camera.lookAt(0, 0.45, 0);
  const ambient = new AmbientLight(0x485250, 0.65);
  const skyLight = new HemisphereLight(0xc2ddcd, 0x38241b, 2.15);
  const keyLight = new DirectionalLight(0xffe1bd, 4.1);
  keyLight.position.set(-4, 8.5, 4);
  const emberLight = new PointLight(0xff7e28, 26, 8.4, 2);
  emberLight.position.set(3.8, 1.9, -1.8);
  const wellLight = new PointLight(0x57adff, 18, 5.6, 2);
  wellLight.position.set(-3.3, 1.1, 2.7);
  scene.add(
    ...subjects.map(({ root }) => root),
    chargeCorridor,
    ambient,
    skyLight,
    keyLight,
    emberLight,
    wellLight,
  );
  // A device pixel ratio of 2 quadruples the framebuffer work and can make a
  // software WebGL path appear frozen. One logical pixel is sufficient for
  // this legible prototype and preserves input/tick responsiveness.
  renderer.setPixelRatio(Math.max(1, Math.min(1, pixelRatio)));
  renderer.outputColorSpace = SRGBColorSpace;

  if (wayfarer.placeholder === null) {
    throw new Error("Wayfarer presentation has no rig placeholder");
  }
  document.body.dataset.rigState = "loading";
  document.body.dataset.rigLoadStartedAt = String(Math.round(performance.now()));
  const rigReady = mountArenaRig(wayfarer.root, wayfarer.placeholder).then(
    (mounted) => {
      if (presentation.disposed) {
        disposeMountedArenaRig(mounted);
        return;
      }
      presentation.wayfarerRig = mounted;
      if (presentation.pendingWayfarerAttack) {
        presentation.pendingWayfarerAttack = false;
        playMountedArenaAttack(mounted);
      }
      if (presentation.pendingWayfarerPropulsion > 0) {
        signalMountedArenaPropulsion(
          mounted,
          presentation.pendingWayfarerPropulsion,
        );
        presentation.pendingWayfarerPropulsion = 0;
      }
      document.body.dataset.rigState = "ready";
      document.body.dataset.rigReadyAt = String(Math.round(performance.now()));
      document.body.dataset.rigEquipmentCount = "6";
      document.body.dataset.rigSocketCount = "6";
    },
    (cause: unknown) => {
      document.body.dataset.rigState = "failed";
      document.body.dataset.rigFailedAt = String(Math.round(performance.now()));
      document.body.dataset.rigFailureMessage =
        cause instanceof Error ? cause.message : String(cause);
      throw cause;
    },
  );
  Object.defineProperty(presentation, "rigReady", {
    configurable: false,
    enumerable: true,
    value: rigReady,
    writable: false,
  });
  document.body.dataset.boarRigState = "loading";
  const boarReady = mountBoarRig(boar).then(
    (mounted) => {
      if (presentation.disposed) {
        mounted.mixer.stopAllAction();
        mounted.mixer.uncacheRoot(mounted.root);
        return;
      }
      presentation.boarRig = mounted;
      document.body.dataset.boarRigState = "ready";
      document.body.dataset.boarRigAnimations = "walk,attack";
    },
    (cause: unknown) => {
      document.body.dataset.boarRigState = "failed";
      document.body.dataset.boarRigFailureMessage =
        cause instanceof Error ? cause.message : String(cause);
      throw cause;
    },
  );
  Object.defineProperty(presentation, "boarReady", {
    configurable: false,
    enumerable: true,
    value: boarReady,
    writable: false,
  });
  document.body.dataset.cacheState = "loading";
  const cacheReady = mountCephoriumCache(cache).then(
    (mounted) => {
      if (presentation.disposed) {
        mounted.removeFromParent();
        return;
      }
      presentation.cacheRoot = mounted;
      document.body.dataset.cacheState = "ready";
    },
    (cause: unknown) => {
      document.body.dataset.cacheState = "failed";
      document.body.dataset.cacheFailureMessage =
        cause instanceof Error ? cause.message : String(cause);
      throw cause;
    },
  );
  Object.defineProperty(presentation, "cacheReady", {
    configurable: false,
    enumerable: true,
    value: cacheReady,
    writable: false,
  });
  return presentation;
}

export function disposeCinderwakePresentation(
  presentation: CinderwakePresentation,
): void {
  if (presentation.disposed) return;
  presentation.disposed = true;
  if (presentation.wayfarerRig !== null) {
    disposeMountedArenaRig(presentation.wayfarerRig);
  }
  if (presentation.boarRig !== null) {
    const { root, mixer } = presentation.boarRig;
    mixer.stopAllAction();
    mixer.uncacheRoot(root);
    root.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      object.geometry.dispose();
      const materials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      for (const material of materials) {
        if (material instanceof MeshStandardMaterial) material.map?.dispose();
        material.dispose();
      }
    });
    root.removeFromParent();
    presentation.boarRig = null;
  }
  if (presentation.cacheRoot !== null) {
    const root = presentation.cacheRoot;
    root.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      object.geometry.dispose();
      const materials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      for (const material of materials) {
        if (material instanceof MeshStandardMaterial) material.map?.dispose();
        material.dispose();
      }
    });
    root.removeFromParent();
    presentation.cacheRoot = null;
  }
  presentation.environment.dispose();
  for (const geometry of presentation.resources.geometries) geometry.dispose();
  for (const material of presentation.resources.materials) material.dispose();
  presentation.renderer.dispose();
}
