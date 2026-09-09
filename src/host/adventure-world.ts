import {
  CanvasTexture, CircleGeometry, Color,
  ConeGeometry, DirectionalLight, Fog, Group, HemisphereLight,
  Material, Mesh, MeshBasicMaterial, MeshStandardMaterial,
  Object3D, PerspectiveCamera, RingGeometry, Scene, SphereGeometry,
  Sprite, SpriteMaterial, SRGBColorSpace, Texture, Vector2, Vector3, WebGLRenderer,
  Raycaster, type BufferGeometry,
} from "three";
import type { AdventureSnapshot, ThreatView } from "../game/adventure-types.js";
import { actor, prop, type ForestActor } from "./frostwood-assets.js";
import { buildFrostwood } from "./frostwood-scenery.js";

interface ThreatRig {
  readonly root: Group;
  readonly body: Group;
  readonly actor: ForestActor;
  readonly idle: string;
  readonly walk: string;
  readonly selection: Mesh<RingGeometry, MeshBasicMaterial>;
  readonly attack: string;
  readonly hit: string;
  readonly warning: Mesh<CircleGeometry, MeshBasicMaterial>;
  readonly ring: Mesh<RingGeometry, MeshBasicMaterial>;
  readonly height: number;
  health: number;
  sequence: number;
  phase: ThreatView["phase"];
  hitTime: number;
}

export interface AdventureWorld {
  readonly canvas: HTMLCanvasElement;
  readonly ready: Promise<void>;
  render(snapshot: AdventureSnapshot, delta: number): void;
  orbit(dx: number, dy: number): void;
  zoom(delta: number): void;
  forward(): { x: number; z: number };
  pick(x: number, y: number): string | null;
  projectThreat(id: string): { x: number; y: number; feetY: number } | null;
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
  const sprite = new Sprite(new SpriteMaterial({ map: texture, depthTest: false, transparent: true, sizeAttenuation: false }));
  sprite.scale.set(scale * 0.055, scale * 0.055 * 96 / 512, 1);
  sprite.renderOrder = 5;
  return sprite;
}

export function createAdventureWorld(host: HTMLElement, initial: AdventureSnapshot): AdventureWorld {
  const scene = new Scene();
  scene.background = new Color(0x9cbbbd);
  scene.fog = new Fog(0x9cbbbd, 28, 72);
  const camera = new PerspectiveCamera(48, 1, 0.1, 110);
  const renderer = new WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.outputColorSpace = SRGBColorSpace;
  const canvas = renderer.domElement;
  canvas.id = "world-canvas";
  canvas.tabIndex = 0;
  canvas.setAttribute("aria-label", "Frostwood adventure. W A S D move, drag the mouse to turn the view.");
  host.prepend(canvas);
  scene.add(new HemisphereLight(0xe0f1f3, 0x6b7652, 2.0));
  const sun = new DirectionalLight(0xffe4b8, 2.6);
  sun.position.set(-12, 25, -8);
  scene.add(sun);
  const terrain = new Group();
  scene.add(terrain);
  const gateSign = label("NORTH GATE · FROSTWOOD", "#daefff", 3.3);
  gateSign.position.set(-3.5, 2.5, 0);
  terrain.add(gateSign);
  const thicket = new Group(); terrain.add(thicket);
  const townSign = label("HEARTHSTEAD", "#ffe1a2", 3.4);
  townSign.position.set(-7.5, 5.7, -7);
  terrain.add(townSign);
  const mara = new Group(); mara.position.set(3.4, 0, -7.5); mara.rotation.y = -Math.PI/2;
  terrain.add(mara);
  const maraName = label("MARA · F to talk", "#ffe4b4", 2.4);
  maraName.position.set(3.4, 2.45, -7.5); terrain.add(maraName);
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

  const groveLabel = label("DEEP GROVE · R · 6 CORES", "#c8d8ff", 4.2);
  groveLabel.position.set(ritualPosition.x, 3, ritualPosition.z);
  terrain.add(groveLabel);
  const player = new Group();
  scene.add(player);
  const shield = new Mesh(new SphereGeometry(0.95, 20, 12), new MeshBasicMaterial({ color: 0x9bdfff, transparent: true, opacity: 0.22, wireframe: true, depthWrite: false }));
  shield.position.y = 0.9;
  player.add(shield);
  const playerHalo = new Mesh(new RingGeometry(0.5, 0.57, 32), new MeshBasicMaterial({ color: 0xffdf8a, side: 2 }));
  playerHalo.rotation.x = -Math.PI / 2;
  playerHalo.position.y = 0.04;
  player.add(playerHalo);
  const rigs = new Map<string, ThreatRig>();
  let knight: ForestActor | null = null;
  let merchant: ForestActor | null = null;
  let playerAttackRemaining = 0;
  let disposed = false;
  let elapsed = 0;
  let yaw = 0;
  let pitch = 0.72;
  let distance = 15;
  let lastAttack = initial.player.attackSequence;
  let lastHealth = initial.player.health;
  let playerHitRemaining = 0;
  let playerDead = false;
  const cameraTarget = new Vector3(initial.player.position.x, 0, initial.player.position.z);
  document.body.dataset.rigState = "loading";
  document.body.dataset.boarRigState = "loading";
  document.body.dataset.environmentState = "loading";
  const knightReady = actor("Knight", 2.2, true).then(async mounted => {
    if (disposed) { mounted.dispose(); return; }
    knight = mounted; player.add(mounted.root); mounted.play("Idle");
    const sword = await prop("Sword", 1.1);
    const hand = mounted.model.getObjectByName("FistR");
    if (!hand) throw Error("Knight right hand is missing");
    sword.position.set(0, 0.04, 0); sword.rotation.x = Math.PI / 2; hand.add(sword);
    document.body.dataset.rigState = "ready";
  });
  const merchantReady = actor("Cleric", 1.85).then(mounted => {
    if (disposed) { mounted.dispose(); return; }
    merchant = mounted; mara.add(mounted.root); mounted.play("Idle");
  });
  const appearances: Record<string, {model: string; height: number; idle: string; walk: string; attack: string; hit: string}> = {
    scout: {model:"Birb",height:1.35,idle:"Idle",walk:"Walk",attack:"Bite_Front",hit:"HitRecieve"},
    nest: {model:"Armabee",height:1.6,idle:"Flying_Idle",walk:"Fast_Flying",attack:"Headbutt",hit:"HitReact"},
    warder: {model:"MushroomKing",height:2.4,idle:"Idle",walk:"Run",attack:"Punch",hit:"HitReact"},
    patrol: {model:"Wolf",height:1.6,idle:"Idle",walk:"Gallop",attack:"Attack",hit:"Idle_HitReact1"},
    "ritual-guardian": {model:"Yeti",height:3.0,idle:"Idle",walk:"Run",attack:"Punch",hit:"HitReact"},
  };
  const creaturesReady = Promise.all(initial.threats.map(async threat => {
    const look = appearances[threat.id]; if(!look) throw Error(`No appearance for ${threat.id}`);
    const creature = await actor(look.model, look.height);
    if (disposed) { creature.dispose(); return; }
    const root = new Group(), body = creature.root;
    root.add(body); root.userData.threatId = threat.id; scene.add(root);
    creature.play(threat.health <= 0 ? "Death" : look.idle, threat.health > 0);
    const warning = new Mesh(new CircleGeometry(1, 64), new MeshBasicMaterial({ color: 0xf49a43, transparent: true, opacity: 0.23, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    warning.rotation.x = -Math.PI/2; warning.visible = false; warning.renderOrder = 2; scene.add(warning);
    const ring = new Mesh(new RingGeometry(0.93, 1.03, 48), new MeshBasicMaterial({ color: 0xffd278, side: 2 }));
    ring.rotation.x = -Math.PI/2; ring.position.y=0.05; root.add(ring);
    const selection = new Mesh(new RingGeometry(1.09, 1.14, 48), new MeshBasicMaterial({ color: 0xfff6df, side: 2 }));
    selection.rotation.x = -Math.PI/2; selection.position.y=0.06; root.add(selection);
    rigs.set(threat.id,{root,body,actor:creature,idle:look.idle,walk:look.walk,selection,attack:look.attack,hit:look.hit,warning,ring,height:look.height,
      health:threat.health,sequence:threat.actionSequence,phase:threat.phase,hitTime:0});
  })).then(()=>{document.body.dataset.boarRigState="ready";document.body.dataset.creatureRigState="ready";});
  const natureReady = buildFrostwood(terrain, thicket).then(()=>{document.body.dataset.environmentState="ready";});
  const ready = Promise.all([knightReady, merchantReady, creaturesReady, natureReady]).then(()=>undefined);
  const raycaster = new Raycaster();
  const point = new Vector2();
  const forward = () => ({ x: Math.sin(yaw), z: Math.cos(yaw) });
  return {
    canvas, ready, forward,
    orbit(dx, dy) { yaw -= dx * 0.005; pitch = Math.max(0.42, Math.min(1.22, pitch + dy * 0.004)); },
    zoom(delta) { distance = Math.max(6, Math.min(18, distance * Math.exp(delta * 0.001))); },
    projectThreat(id) {
      const rig = rigs.get(id); if (!rig || !rig.root.visible) return null;
      const head = rig.root.position.clone().add(new Vector3(0, rig.height + 0.25, 0)).project(camera);
      const feet = rig.root.position.clone().project(camera);
      if (head.z < -1 || head.z > 1 || Math.abs(head.x) > 1 || Math.abs(head.y) > 1) return null;
      return { x: (head.x + 1) * host.clientWidth / 2, y: (1 - head.y) * host.clientHeight / 2, feetY: (1 - feet.y) * host.clientHeight / 2 };
    },
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
        if (selected) player.rotation.y = Math.atan2(selected.position.x-position.x,selected.position.z-position.z);
        knight.play("SwordSlash",false,0.5); playerAttackRemaining=0.5; lastAttack=snapshot.player.attackSequence;
      }
      if (knight) {
        if(snapshot.player.health<=0 && !playerDead) { playerDead=true; knight.play("Death",false); }
        else if(snapshot.player.health<lastHealth && snapshot.player.health>0) { playerHitRemaining=0.4; knight.play("RecieveHit",false,0.4); }
        if(!playerDead) {
          playerHitRemaining=Math.max(0,playerHitRemaining-delta); playerAttackRemaining=Math.max(0,playerAttackRemaining-delta);
          if(playerHitRemaining===0&&playerAttackRemaining===0) knight.play(!snapshot.player.grounded?"Jump":snapshot.player.moving?"Run":"Idle");
        }
        knight.mixer.update(delta);
        document.body.dataset.rigAnimationMode=playerDead?"death":playerHitRemaining>0?"hit":playerAttackRemaining>0?"attack":snapshot.player.moving?"locomotion":"idle";
      }
      if(merchant) { merchant.play(snapshot.shopOpen?"Idle_Weapon":"Idle"); merchant.mixer.update(delta); }
      lastHealth = snapshot.player.health;
      shield.visible = snapshot.player.guardSeconds > 0;
      shield.rotation.y = elapsed;
      coreRoot.visible = snapshot.resourceRemaining > 0;
      thicket.visible = snapshot.threats.some((threat) => threat.id === "nest" && threat.health > 0);
      for (const threat of snapshot.threats) {
        const rig = rigs.get(threat.id);
        if (!rig) continue;
        rig.root.visible = threat.active || threat.phase === "cleared";
        const dx = threat.position.x - rig.root.position.x, dz = threat.position.z - rig.root.position.z;
        rig.root.position.set(threat.position.x, threat.position.y, threat.position.z);
        rig.ring.visible = threat.health > 0;
        rig.ring.material.color.setHex(threat.disposition === "hostile" || threat.aggro ? 0xf04d4d : 0xf1d34f);
        rig.selection.visible = threat.selected && threat.health > 0;
        if (threat.moving && Math.hypot(dx, dz) > 0.001) rig.root.rotation.y = Math.atan2(dx, dz);
        else if (threat.aggro && threat.health > 0) rig.root.rotation.y = Math.atan2(position.x - threat.position.x, position.z - threat.position.z);
        const changed = threat.phase !== rig.phase;
        if (threat.phase === "cleared") {
          if(rig.health>0) rig.actor.play("Death",false,undefined,0.08);
        } else if(threat.phase === "action") {
          const action = changed ? rig.actor.play(rig.attack,false,undefined,0.035) : rig.actor.action!;
          action.paused = true;
          action.time = action.getClip().duration * (0.3 + 0.7 * Math.max(0, 1-threat.remainingSeconds/0.35));
        } else if(threat.health < rig.health && threat.health>0) {
          rig.hitTime=0.3; rig.actor.play(rig.hit,false,0.3,0.04);
        } else if(threat.phase === "preparation" && rig.hitTime<=delta) {
          const action = changed || rig.actor.action?.getClip().name !== rig.attack ? rig.actor.play(rig.attack,false,undefined,0.12) : rig.actor.action;
          action.paused = true;
          action.time = action.getClip().duration * 0.3 * Math.max(0,1-threat.remainingSeconds/3);
        } else if(rig.hitTime<=delta || changed) {
          rig.actor.play(threat.moving ? rig.walk : rig.idle);
        }
        rig.hitTime=Math.max(0,rig.hitTime-delta);
        // Authored motion supplies the pose; a restrained lean makes the full windup visible.
        const preparation = threat.phase === "preparation" ? Math.max(0,1-threat.remainingSeconds/3) : 0;
        rig.body.rotation.x = -0.12*preparation;
        rig.body.position.z = -0.18*preparation;
        rig.warning.visible = threat.active && (threat.phase === "preparation" || threat.phase === "action");
        rig.warning.position.set(threat.targetPosition.x, 0.1, threat.targetPosition.z);
        rig.warning.scale.setScalar(threat.reach);
        rig.warning.material.color.setHex(threat.damage === 0 ? 0x8badd4 : threat.phase === "action" ? 0xff4936 : 0xf5a43e);
        rig.warning.material.opacity = threat.damage === 0 ? 0.025 : threat.phase === "action" ? 0.55 : 0.2 + 0.13 * (1 - threat.remainingSeconds / 3);
        rig.actor.mixer.update(delta);
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
      knight?.dispose(); merchant?.dispose();
      for (const rig of rigs.values()) rig.actor.dispose();
      disposeObjects(scene);
      scene.clear();
      renderer.dispose();
      canvas.remove();
    },
  };
}
