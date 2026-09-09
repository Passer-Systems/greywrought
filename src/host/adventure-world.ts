import {
  AnimationMixer, Box3, BoxGeometry, CanvasTexture, CircleGeometry, Color,
  ConeGeometry, CylinderGeometry, DirectionalLight, Fog, Group, HemisphereLight,
  LoopOnce, LoopRepeat, Material, Mesh, MeshBasicMaterial, MeshStandardMaterial,
  Object3D, PerspectiveCamera, PlaneGeometry, RingGeometry, Scene, SphereGeometry,
  Sprite, SpriteMaterial, SRGBColorSpace, Texture, Vector2, Vector3, WebGLRenderer,
  Raycaster, type AnimationAction, type BufferGeometry,
} from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import type { AdventureSnapshot, ThreatView } from "../game/adventure-types.js";
import {
  disposeMountedArenaRig, mountArenaRig, playMountedArenaAttack,
  setMountedArenaLocomotion, updateMountedArenaRig, type MountedArenaRig,
} from "./rig-socket-lab.js";
import { publicUrl } from "./public-url.js";

interface ThreatRig {
  readonly root: Group;
  readonly body: Group;
  readonly mixer: AnimationMixer;
  readonly attack: AnimationAction;
  readonly walk: AnimationAction;
  readonly warning: Mesh<CircleGeometry, MeshBasicMaterial>;
  readonly ring: Mesh<RingGeometry, MeshBasicMaterial>;
  readonly label: Sprite;
  health: number;
  sequence: number;
  phase: ThreatView["phase"];
  hitTime: number;
  deathTime: number;
}

export interface AdventureWorld {
  readonly canvas: HTMLCanvasElement;
  readonly ready: Promise<void>;
  render(snapshot: AdventureSnapshot, delta: number): void;
  orbit(dx: number, dy: number): void;
  zoom(delta: number): void;
  forward(): { x: number; z: number };
  pick(x: number, y: number): string | null;
  dispose(): void;
}

function disposeObjects(root: Object3D): void {
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();
  const textures = new Set<Texture>();
  root.traverse((object) => {
    if (object instanceof Mesh) geometries.add(object.geometry);
    if (!(object instanceof Mesh || object instanceof Sprite)) return;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      materials.add(material);
      for (const value of Object.values(material)) if (value instanceof Texture) textures.add(value);
    }
  });
  for (const item of textures) item.dispose();
  for (const item of materials) item.dispose();
  for (const item of geometries) item.dispose();
}

function label(text: string, color = "#fff1ce", scale = 3): Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 96;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas text is unavailable");
  ctx.fillStyle = "#101b26d9";
  ctx.fillRect(0, 4, 512, 84);
  ctx.strokeStyle = "#b9975e";
  ctx.strokeRect(2, 6, 508, 80);
  ctx.font = "bold 32px Georgia";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = color;
  ctx.fillText(text, 256, 48, 495);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  const sprite = new Sprite(new SpriteMaterial({ map: texture, depthTest: false, transparent: true }));
  sprite.scale.set(scale, scale * 96 / 512, 1);
  sprite.renderOrder = 5;
  return sprite;
}

export function createAdventureWorld(host: HTMLElement, initial: AdventureSnapshot): AdventureWorld {
  const scene = new Scene();
  scene.background = new Color(0x8099a4);
  scene.fog = new Fog(0x8099a4, 35, 82);
  const camera = new PerspectiveCamera(48, 1, 0.1, 110);
  const renderer = new WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.outputColorSpace = SRGBColorSpace;
  const canvas = renderer.domElement;
  canvas.id = "world-canvas";
  canvas.tabIndex = 0;
  canvas.setAttribute("aria-label", "Frostwood adventure. W A S D move, drag the mouse to turn the view.");
  host.prepend(canvas);
  scene.add(new HemisphereLight(0xdbedff, 0x777049, 2.5));
  const sun = new DirectionalLight(0xffe2ae, 3.1);
  sun.position.set(-12, 25, -8);
  scene.add(sun);
  const terrain = new Group();
  scene.add(terrain);
  const material = (color: number) => new MeshStandardMaterial({ color, roughness: 0.9 });
  const addBox = (x: number, y: number, z: number, w: number, h: number, d: number, color: number, parent: Group = terrain): Mesh => {
    const mesh = new Mesh(new BoxGeometry(w, h, d), material(color));
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  };
  addBox(0, -0.3, 18, 64, 0.5, 88, 0x42695f);
  addBox(0, -0.025, -8, 21, 0.08, 16, 0xa48c5c);
  addBox(0, 0.015, 21, 3.6, 0.06, 58, 0x89927d);
  for (let z = -12; z < 45; z += 3) {
    addBox(-1.8, 0.09, z, 0.16, 0.16, 0.55, 0xc2bea0);
    addBox(1.8, 0.09, z, 0.16, 0.16, 0.55, 0xc2bea0);
  }
  // The full north-south route remains free of tall foliage at every camera yaw.
  for (const x of [-3.3, 3.3]) {
    addBox(x, 1.5, 0, 0.7, 3, 0.8, 0x697b79);
    const cap = new Mesh(new ConeGeometry(0.6, 0.7, 4), material(0xb89b63));
    cap.position.set(x, 3.3, 0);
    terrain.add(cap);
  }
  const gateSign = label("NORTH GATE · FROSTWOOD", "#daefff", 4.8);
  gateSign.position.set(0, 3.8, 0);
  terrain.add(gateSign);
  for (const x of [-7.5, 7.5]) addBox(x, 0.6, 1.75, 9, 1.2, 4.5, 0x667c72);
  const thicket = new Group();
  for (let z = 18; z <= 24; z += 0.75) {
    for (let x = 2.4; x <= 12; x += 1.2) {
      const briar = new Mesh(new ConeGeometry(0.65, 0.85, 5), material(0x6b5948));
      briar.position.set(x, 0.45, z);
      thicket.add(briar);
    }
  }
  terrain.add(thicket);
  const townSign = label("HEARTHSTEAD · SAFE HAVEN", "#ffe1a2", 5.2);
  townSign.position.set(0, 3.5, -12);
  terrain.add(townSign);
  for (const [x, z] of [[-7, -8], [7, -12], [-7, -14]] as const) {
    addBox(x, 1.2, z, 3.5, 2.4, 3.6, 0xd2bd8b);
    const roof = new Mesh(new ConeGeometry(2.85, 1.6, 4), material(0x653c3a));
    roof.rotation.y = Math.PI / 4;
    roof.position.set(x, 3.1, z);
    terrain.add(roof);
    addBox(x, 0.8, z + 1.82, 0.75, 1.6, 0.08, 0x483e30);
  }
  const mara = new Group();
  mara.position.set(3.4, 0, -7.5);
  const robe = new Mesh(new ConeGeometry(0.45, 1.35, 8), material(0x8c548c));
  robe.position.y = 0.75;
  const head = new Mesh(new SphereGeometry(0.24, 12, 8), material(0xe1b88e));
  head.position.y = 1.55;
  const maraName = label("MARA · F to talk", "#ffe4b4", 3.2);
  maraName.position.y = 2.15;
  mara.add(robe, head, maraName);
  terrain.add(mara);
  addBox(3.4, 0.5, -6.5, 1.7, 1, 0.65, 0x624a35);
  for (const x of [2.9, 3.4, 3.9]) {
    const potion = new Mesh(new CylinderGeometry(0.09, 0.13, 0.3, 8), material(0xcf4782));
    potion.position.set(x, 1.15, -6.5);
    terrain.add(potion);
  }
  const coreRoot = new Group();
  coreRoot.position.set(-2, 0, 12);
  const coreMaterial = new MeshStandardMaterial({ color: 0x86ebff, emissive: 0x2090ae, emissiveIntensity: 0.55 });
  for (let index = 0; index < 5; index++) {
    const core = new Mesh(new ConeGeometry(0.2, 0.7 + index * 0.08, 5), coreMaterial);
    core.position.set(Math.sin(index * 2) * 0.6, 0.5, Math.cos(index * 2) * 0.6);
    coreRoot.add(core);
  }
  const coreLabel = label("FROST CORES · G to gather", "#a2edff", 3.7);
  coreLabel.position.y = 1.9;
  coreRoot.add(coreLabel);
  terrain.add(coreRoot);
  const ritualPlace = initial.places.find((place) => place.kind === "ritual");
  const ritualPosition = ritualPlace?.position ?? { x: 0, y: 0, z: 43 };
  const ritual = new Mesh(new RingGeometry(2.25, 2.6, 48), new MeshBasicMaterial({ color: 0x91c6ff, side: 2 }));
  ritual.rotation.x = -Math.PI / 2;
  ritual.position.set(ritualPosition.x, 0.08, ritualPosition.z);
  terrain.add(ritual);
  for (let index = 0; index < 7; index++) {
    const angle = index * Math.PI * 2 / 7;
    addBox(ritualPosition.x + Math.sin(angle) * 3.1, 0.75, ritualPosition.z + Math.cos(angle) * 3.1, 0.55, 1.5, 0.65, 0x6b8090);
  }
  const groveLabel = label("DEEP GROVE · R · 6 CORES", "#c8d8ff", 4.2);
  groveLabel.position.set(ritualPosition.x, 3, ritualPosition.z);
  terrain.add(groveLabel);
  const player = new Group();
  const placeholder = new Group();
  player.add(placeholder);
  scene.add(player);
  const shield = new Mesh(new SphereGeometry(0.95, 20, 12), new MeshBasicMaterial({ color: 0x9bdfff, transparent: true, opacity: 0.22, wireframe: true, depthWrite: false }));
  shield.position.y = 0.9;
  player.add(shield);
  const playerHalo = new Mesh(new RingGeometry(0.5, 0.57, 32), new MeshBasicMaterial({ color: 0xffdf8a, side: 2 }));
  playerHalo.rotation.x = -Math.PI / 2;
  playerHalo.position.y = 0.04;
  player.add(playerHalo);
  const rigs = new Map<string, ThreatRig>();
  let knight: MountedArenaRig | null = null;
  let disposed = false;
  let elapsed = 0;
  let yaw = 0;
  let pitch = 0.68;
  let distance = 12;
  let lastAttack = initial.player.attackSequence;
  let lastHealth = initial.player.health;
  let playerHitRemaining = 0;
  let playerDead = false;
  const cameraTarget = new Vector3(initial.player.position.x, 0, initial.player.position.z);
  const loader = new GLTFLoader();
  const knightReady = mountArenaRig(player, placeholder).then((mounted) => {
    if (disposed) { disposeMountedArenaRig(mounted); return; }
    knight = mounted;
    document.body.dataset.rigState = "ready";
  }).catch((cause: unknown) => { document.body.dataset.rigState = "failed"; throw cause; });
  const boarsReady = loader.loadAsync(publicUrl("assets/opengameart/teh-bucket-boar/boar.glb")).then((gltf) => {
    if (disposed) { disposeObjects(gltf.scene); return; }
    const attackClip = gltf.animations.find((clip) => clip.name === "attack");
    const walkClip = gltf.animations.find((clip) => clip.name === "walk");
    if (!attackClip || !walkClip) throw new Error("Boar attack and walk clips are required");
    for (const threat of initial.threats) {
      const root = new Group();
      const body = new Group();
      const model = clone(gltf.scene);
      model.rotation.y = Math.PI / 2;
      model.updateWorldMatrix(true, true);
      const bounds = new Box3().setFromObject(model);
      const size = bounds.getSize(new Vector3());
      const scale = (threat.id.includes("guardian") ? 3 : 2.1) / Math.max(size.x, size.z);
      model.scale.setScalar(scale);
      model.updateWorldMatrix(true, true);
      const fitted = new Box3().setFromObject(model);
      const center = fitted.getCenter(new Vector3());
      model.position.set(-center.x, -fitted.min.y, -center.z);
      body.add(model);
      root.add(body);
      root.userData.threatId = threat.id;
      scene.add(root);
      const mixer = new AnimationMixer(model);
      const attack = mixer.clipAction(attackClip).setLoop(LoopOnce, 1);
      attack.clampWhenFinished = true;
      const walk = mixer.clipAction(walkClip).setLoop(LoopRepeat, Infinity);
      const warning = new Mesh(new CircleGeometry(1, 64), new MeshBasicMaterial({ color: 0xf49a43, transparent: true, opacity: 0.23, depthWrite: false }));
      warning.rotation.x = -Math.PI / 2;
      warning.visible = false;
      scene.add(warning);
      const ring = new Mesh(new RingGeometry(0.97, 1.04, 48), new MeshBasicMaterial({ color: 0xffd278, side: 2 }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.05;
      root.add(ring);
      const name = label(threat.name, "#ffd6ac", 3.2);
      name.position.y = 2.4;
      root.add(name);
      rigs.set(threat.id, { root, body, mixer, attack, walk, warning, ring, label: name,
        health: threat.health, sequence: threat.actionSequence, phase: threat.phase, hitTime: 0, deathTime: 0 });
    }
    document.body.dataset.boarRigState = "ready";
  }).catch((cause: unknown) => { document.body.dataset.boarRigState = "failed"; throw cause; });
  const natureReady = Promise.all(["Pine_5", "CommonTree_2", "Rock_Medium_3", "Grass_Common_Short"].map(async (name, kind) => {
    const gltf = await loader.loadAsync(publicUrl(`assets/quaternius/nature/${name}.gltf`));
    if (disposed) { disposeObjects(gltf.scene); return; }
    const count = kind < 2 ? 16 : 30;
    for (let index = 0; index < count; index++) {
      const model = gltf.scene.clone(true);
      const side = index % 2 ? 1 : -1;
      const x = side * (kind < 2 ? 14 + (index % 3) * 3 : 5.5 + (index % 5) * 1.8);
      const z = -15 + (index / count) * 65;
      model.position.set(x, 0, z);
      model.rotation.y = index * 2.39;
      model.scale.setScalar(kind < 2 ? 0.6 : kind === 2 ? 0.35 : 0.55);
      terrain.add(model);
    }
  })).then(() => { document.body.dataset.environmentState = "ready"; }).catch((cause: unknown) => { document.body.dataset.environmentState = "failed"; throw cause; });
  document.body.dataset.rigState = "loading";
  document.body.dataset.boarRigState = "loading";
  document.body.dataset.environmentState = "loading";
  const ready = Promise.all([knightReady, boarsReady, natureReady]).then(() => undefined);
  const raycaster = new Raycaster();
  const point = new Vector2();
  const forward = () => ({ x: Math.sin(yaw), z: Math.cos(yaw) });
  return {
    canvas, ready, forward,
    orbit(dx, dy) { yaw -= dx * 0.005; pitch = Math.max(0.42, Math.min(1.22, pitch + dy * 0.004)); },
    zoom(delta) { distance = Math.max(6, Math.min(18, distance * Math.exp(delta * 0.001))); },
    pick(x, y) {
      const rect = canvas.getBoundingClientRect();
      point.set((x - rect.left) / rect.width * 2 - 1, -(y - rect.top) / rect.height * 2 + 1);
      raycaster.setFromCamera(point, camera);
      const targets = [...rigs.values()].filter((rig) => rig.health > 0 && rig.root.visible).map((rig) => rig.root);
      for (const hit of raycaster.intersectObjects(targets, true)) {
        let object: Object3D | null = hit.object;
        while (object) {
          if (typeof object.userData.threatId === "string") return object.userData.threatId;
          object = object.parent;
        }
      }
      return null;
    },
    render(snapshot, delta) {
      if (disposed) return;
      elapsed += delta;
      const { position } = snapshot.player;
      player.position.set(position.x, position.y, position.z);
      const face = snapshot.player.cameraForward;
      if (snapshot.player.moving) player.rotation.y = Math.atan2(face.x, face.z);
      const selected = snapshot.threats.find((threat) => threat.id === snapshot.selectedThreat);
      if (snapshot.player.attackSequence !== lastAttack && knight) {
        if (selected) player.rotation.y = Math.atan2(selected.position.x - position.x, selected.position.z - position.z);
        playMountedArenaAttack(knight);
        lastAttack = snapshot.player.attackSequence;
      }
      if (knight) {
        if (snapshot.player.health <= 0 && !playerDead) {
          playerDead = true;
          knight.instance.mixer.stopAllAction();
          const action = knight.instance.mixer.clipAction(knight.clips.death).setLoop(LoopOnce, 1);
          action.clampWhenFinished = true;
          action.reset().play();
        } else if (snapshot.player.health < lastHealth && snapshot.player.health > 0) {
          playerHitRemaining = 0.4;
          knight.instance.mixer.stopAllAction();
          knight.instance.mixer.clipAction(knight.clips.hit).setLoop(LoopOnce, 1).reset().play();
        }
        if (playerDead || playerHitRemaining > 0) {
          knight.instance.mixer.update(delta);
          if (!playerDead) {
            playerHitRemaining -= delta;
            if (playerHitRemaining <= 0) {
              knight.instance.mixer.stopAllAction();
              knight.mode = "attack";
              knight.attackRemaining = 0;
            }
          }
        } else {
          setMountedArenaLocomotion(knight, snapshot.player.moving, !snapshot.player.grounded);
          updateMountedArenaRig(knight, delta);
        }
        document.body.dataset.rigAnimationMode = playerDead ? "death" : playerHitRemaining > 0 ? "hit" : knight.mode;
      }
      lastHealth = snapshot.player.health;
      shield.visible = snapshot.player.guardSeconds > 0;
      shield.rotation.y = elapsed;
      coreRoot.visible = snapshot.resourceRemaining > 0;
      thicket.visible = snapshot.threats.some((threat) => threat.id === "nest" && threat.health > 0);
      for (const threat of snapshot.threats) {
        const rig = rigs.get(threat.id);
        if (!rig) continue;
        rig.root.visible = threat.active || threat.phase === "cleared";
        rig.root.position.set(threat.position.x, threat.position.y, threat.position.z);
        const nearby = Math.hypot(threat.position.x - position.x, threat.position.z - position.z) < 15;
        rig.label.visible = threat.health > 0 && nearby;
        rig.ring.visible = threat.selected && threat.health > 0;
        if (threat.health > 0) rig.root.rotation.y = Math.atan2(position.x - threat.position.x, position.z - threat.position.z);
        if (threat.health > 0 && rig.health <= 0) rig.deathTime = 0;
        if (threat.health < rig.health) rig.hitTime = 0.3;
        if (threat.actionSequence !== rig.sequence || (threat.phase === "action" && rig.phase !== "action")) {
          rig.walk.stop();
          rig.attack.reset().setDuration(0.35).play();
        }
        if (threat.phase === "preparation" && rig.phase !== "preparation") {
          rig.attack.stop();
          rig.walk.reset().setEffectiveTimeScale(0.3).play();
        }
        if (threat.phase === "recovery" && rig.phase !== "recovery") {
          rig.attack.fadeOut(0.2);
          rig.walk.stop();
        }
        if (threat.phase === "cleared") {
          rig.walk.stop();
          rig.attack.stop();
          rig.deathTime = Math.min(1, rig.deathTime + delta);
          rig.body.rotation.z = -Math.PI * 0.46 * Math.min(1, rig.deathTime / 0.8);
          rig.body.position.y = 0.12 * Math.sin(rig.deathTime * Math.PI);
        } else {
          const preparation = threat.phase === "preparation" ? 1 - threat.remainingSeconds / Math.max(threat.phaseDuration, 0.01) : 0;
          rig.body.rotation.x = threat.phase === "preparation" ? -0.16 * preparation : threat.phase === "recovery" ? 0.1 : 0;
          rig.body.position.z = threat.phase === "preparation" ? -0.32 * preparation : threat.phase === "action" ? 0.6 * Math.sin((1 - threat.remainingSeconds / 0.35) * Math.PI) : 0;
          rig.hitTime = Math.max(0, rig.hitTime - delta);
          rig.body.position.y = rig.hitTime > 0 ? Math.sin(rig.hitTime * 35) * 0.13 : 0;
          rig.body.rotation.z = rig.hitTime > 0 ? Math.sin(rig.hitTime * 40) * 0.12 : 0;
        }
        rig.warning.visible = threat.active && (threat.phase === "preparation" || threat.phase === "action");
        rig.warning.position.set(threat.targetPosition.x, 0.065, threat.targetPosition.z);
        rig.warning.scale.setScalar(threat.reach);
        rig.warning.material.color.setHex(threat.damage === 0 ? 0x8badd4 : threat.phase === "action" ? 0xff4936 : 0xf5a43e);
        rig.warning.material.opacity = threat.damage === 0 ? 0.025 : threat.phase === "action" ? 0.55 : 0.2 + 0.13 * (1 - threat.remainingSeconds / 3);
        rig.mixer.update(delta);
        rig.phase = threat.phase;
        rig.sequence = threat.actionSequence;
        rig.health = threat.health;
      }
      const width = Math.max(1, host.clientWidth);
      const height = Math.max(1, host.clientHeight);
      if (canvas.width !== Math.floor(width * renderer.getPixelRatio()) || canvas.height !== Math.floor(height * renderer.getPixelRatio())) {
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
      }
      cameraTarget.lerp(new Vector3(position.x, position.y, position.z), 1 - Math.exp(-delta * 12));
      const facing = forward();
      camera.position.set(cameraTarget.x - facing.x * Math.cos(pitch) * distance, cameraTarget.y + Math.sin(pitch) * distance, cameraTarget.z - facing.z * Math.cos(pitch) * distance);
      camera.lookAt(cameraTarget.x, cameraTarget.y + 0.6, cameraTarget.z);
      renderer.render(scene, camera);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (knight) disposeMountedArenaRig(knight);
      for (const rig of rigs.values()) { rig.mixer.stopAllAction(); rig.mixer.uncacheRoot(rig.mixer.getRoot()); }
      disposeObjects(scene);
      scene.clear();
      renderer.dispose();
      canvas.remove();
    },
  };
}
