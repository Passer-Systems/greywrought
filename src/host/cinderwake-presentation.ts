import {
  AmbientLight,
  BoxGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  Group,
  Material,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  PointLight,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  TorusGeometry,
  WebGLRenderer,
  type BufferGeometry,
} from "three";
import {
  disposeMountedArenaRig,
  mountArenaRig,
  playMountedArenaAttack,
  setMountedArenaLocomotion,
  updateMountedArenaRig,
  type MountedArenaRig,
} from "./rig-socket-lab.js";

export interface CinderwakeSubjectIds {
  readonly wayfarer: string;
  readonly wraith: string;
  readonly boar: string;
  readonly bolt: string;
  readonly relic: string;
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
  readonly resources: OwnedPresentationResources;
  readonly rigReady: Promise<void>;
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
  wayfarerRig: MountedArenaRig | null;
  pendingWayfarerAttack: boolean;
  disposed: boolean;
}

const clampUnit = (value: number): number => Math.max(0, Math.min(1, value));

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
): SubjectPresentation {
  return {
    subject,
    root,
    placeholder,
    coreMaterial,
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
  const body = mesh(
    ownGeometry(resources, new BoxGeometry(1.45, 0.82, 0.92)),
    bodyMaterial,
  );
  const head = mesh(
    ownGeometry(resources, new BoxGeometry(0.72, 0.62, 0.78)),
    standardMaterial(resources, 0x2e3842, 0x070500, 0.72, 0.4),
  );
  const tuskGeometry = ownGeometry(resources, new ConeGeometry(0.11, 0.58, 8));
  const tuskMaterial = standardMaterial(
    resources,
    0xe7dfd8,
    0x282828,
    0.88,
    0.26,
  );
  const leftTusk = mesh(tuskGeometry, tuskMaterial);
  const rightTusk = mesh(tuskGeometry, tuskMaterial);
  const boosterGeometry = ownGeometry(
    resources,
    new SphereGeometry(0.18, 12, 8),
  );
  const boosterMaterial = standardMaterial(
    resources,
    0xff7339,
    0xff3333,
    0.16,
    0.18,
    true,
    0.94,
  );
  const leftBooster = mesh(boosterGeometry, boosterMaterial);
  const rightBooster = mesh(boosterGeometry, boosterMaterial);
  body.position.y = 0.62;
  head.position.set(0.86, 0.66, 0);
  leftTusk.rotation.z = -Math.PI / 2;
  rightTusk.rotation.z = -Math.PI / 2;
  leftTusk.position.set(1.22, 0.52, 0.29);
  rightTusk.position.set(1.22, 0.52, -0.29);
  leftBooster.position.set(-0.78, 0.7, 0.31);
  rightBooster.position.set(-0.78, 0.7, -0.31);
  root.add(body, head, leftTusk, rightTusk, leftBooster, rightBooster);
  return subjectPresentation(
    subject,
    root,
    null,
    bodyMaterial,
    createEffectShell(resources, root, 1.18, 0xffa000, 0xff2c00),
  );
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

function addArenaSilhouette(
  scene: Scene,
  resources: OwnedPresentationResources,
): void {
  const floor = mesh(
    ownGeometry(resources, new CylinderGeometry(6.6, 7.1, 0.42, 12)),
    standardMaterial(resources, 0x0c0c0c, 0x010203, 0.16, 0.94),
  );
  floor.position.y = -0.25;
  const scar = mesh(
    ownGeometry(resources, new CylinderGeometry(5.65, 5.65, 0.025, 12)),
    standardMaterial(resources, 0x712009, 0x1f150c, 0.06, 0.84, true, 0.2),
  );
  scar.position.y = -0.025;
  scene.add(floor, scar);

  const wallGeometry = ownGeometry(resources, new BoxGeometry(1, 1, 1));
  const wallMaterial = standardMaterial(resources, 0x19180d, 0, 0.24, 0.92);
  const stones: ReadonlyArray<readonly [number, number, number, number, number, number, number]> = [
    [-5.7, 0.86, -2.5, 0.9, 1.9, 1.2, -0.1],
    [-5.1, 0.55, 2.9, 1.5, 1.15, 0.9, 0.18],
    [-2.9, 0.72, 5.1, 1.3, 1.55, 0.8, -0.28],
    [0.2, 0.43, 5.8, 2.1, 0.92, 0.7, 0.04],
    [3.6, 0.92, 4.8, 0.9, 2, 1, 0.31],
    [5.8, 0.62, 1.8, 1.1, 1.34, 1.5, -0.13],
    [5.5, 0.78, -2.8, 1.4, 1.68, 0.9, 0.24],
    [2.5, 0.47, -5.4, 1.8, 1.02, 0.8, -0.09],
    [-1.7, 0.66, -5.7, 1, 1.44, 0.9, 0.16],
  ];
  for (const [x, y, z, scaleX, scaleY, scaleZ, rotation] of stones) {
    const stone = mesh(wallGeometry, wallMaterial);
    stone.position.set(x, y, z);
    stone.scale.set(scaleX, scaleY, scaleZ);
    stone.rotation.y = rotation;
    scene.add(stone);
  }
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
  presentation.renderer.setSize(width, height, false);
}

export function applyAdmittedFrame(
  presentation: CinderwakePresentation,
  frame: AdmittedPresentationFrame,
): void {
  if (presentation.disposed) return;
  presentation.cameraTargetX = frame.cameraTarget.x;
  presentation.cameraTargetY = frame.cameraTarget.y;
  presentation.cameraTargetZ = frame.cameraTarget.z;
  for (const admitted of frame.subjects) {
    const subject = subjectById(presentation, admitted.subject);
    if (subject === undefined) continue;
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
}

export function setChargeCorridor(
  presentation: CinderwakePresentation,
  start: ProjectedPosition,
  end: ProjectedPosition,
  radius: number,
): void {
  const corridor = presentation.chargeCorridor;
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
  subject.root.rotation.y =
    subject.facingYaw +
    elapsed * 0.22 * subject.attackLevel +
    subject.recoveryLevel * 0.08;
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
  const damping = delta === 0 ? 1 : Math.min(1, delta * 6.5);
  presentation.cameraFollowX +=
    damping * (presentation.cameraTargetX - presentation.cameraFollowX);
  presentation.cameraFollowY +=
    damping * (presentation.cameraTargetY - presentation.cameraFollowY);
  presentation.cameraFollowZ +=
    damping * (presentation.cameraTargetZ - presentation.cameraFollowZ);
  updateViewport(presentation, viewportWidth, viewportHeight);
  for (const subject of presentation.subjects) {
    animateSubject(subject, elapsedSeconds, delta);
  }
  if (presentation.wayfarerRig !== null) {
    updateMountedArenaRig(presentation.wayfarerRig, delta);
  }
  const impulse = presentation.cameraImpulse;
  presentation.camera.position.set(
    presentation.cameraFollowX + impulse * 0.52,
    presentation.cameraFollowY + 9.6 + impulse * 0.34,
    presentation.cameraFollowZ + 8.2 - impulse * 0.28,
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
  const camera = new PerspectiveCamera(43, 1, 0.1, 38);
  const renderer = new WebGLRenderer({ antialias: true, alpha: false });
  const resources: OwnedPresentationResources = { geometries: [], materials: [] };
  const wayfarer = createWayfarer(ids.wayfarer, resources);
  const wraith = createWraith(ids.wraith, resources);
  const boar = createBoar(ids.boar, resources);
  const subjects = [
    wayfarer,
    wraith,
    boar,
    createBolt(ids.bolt, resources),
    createRelic(ids.relic, resources),
    createMoonwell(ids.moonwell, resources),
  ];
  const chargeCorridor = mesh(
    ownGeometry(resources, new BoxGeometry(1, 1, 1)),
    standardMaterial(resources, 0xff4f36, 0xff0000, 0, 0.28, true, 0.2),
  );
  chargeCorridor.visible = false;
  const presentation: CinderwakePresentation = {
    scene,
    camera,
    renderer,
    subjects,
    chargeCorridor,
    resources,
    rigReady: Promise.resolve(),
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
    wayfarerRig: null,
    pendingWayfarerAttack: false,
    disposed: false,
  };

  scene.background = new Color(0x030506);
  addArenaSilhouette(scene, resources);
  camera.position.set(0, 9.6, 8.2);
  camera.lookAt(0, 0.45, 0);
  const ambient = new AmbientLight(0x485250, 1.15);
  const keyLight = new DirectionalLight(0xffceb6, 3.7);
  keyLight.position.set(-4, 8.5, 4);
  const emberLight = new PointLight(0xff7e28, 26, 8.4, 2);
  emberLight.position.set(3.8, 1.9, -1.8);
  const wellLight = new PointLight(0x57adff, 18, 5.6, 2);
  wellLight.position.set(-3.3, 1.1, 2.7);
  scene.add(
    ...subjects.map(({ root }) => root),
    chargeCorridor,
    ambient,
    keyLight,
    emberLight,
    wellLight,
  );
  renderer.setPixelRatio(Math.max(1, Math.min(2, pixelRatio)));
  renderer.outputColorSpace = SRGBColorSpace;

  if (wayfarer.placeholder === null) {
    throw new Error("Wayfarer presentation has no rig placeholder");
  }
  document.body.dataset.rigState = "loading";
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
      document.body.dataset.rigState = "ready";
      document.body.dataset.rigEquipmentCount = "6";
      document.body.dataset.rigSocketCount = "6";
    },
    (cause: unknown) => {
      document.body.dataset.rigState = "failed";
      throw cause;
    },
  );
  Object.defineProperty(presentation, "rigReady", {
    configurable: false,
    enumerable: true,
    value: rigReady,
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
  for (const geometry of presentation.resources.geometries) geometry.dispose();
  for (const material of presentation.resources.materials) material.dispose();
  presentation.renderer.dispose();
}
