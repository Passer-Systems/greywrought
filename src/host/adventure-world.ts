import {
  CanvasTexture, Color,
  ConeGeometry, CylinderGeometry, DirectionalLight, Fog, Group, HemisphereLight,
  Material, Mesh, MeshBasicMaterial, MeshStandardMaterial,
  Object3D, PerspectiveCamera, PlaneGeometry, RingGeometry, Scene, SphereGeometry,
  Sprite, SpriteMaterial, SRGBColorSpace, Texture, Vector2, Vector3, WebGLRenderer,
  Raycaster, type BufferGeometry,
} from "three";
import type { AdventureSnapshot, ThreatView } from "../game/adventure-types.js";
import { actor, prop, type ForestActor } from "./frostwood-assets.js";
import { buildFrostwood } from "./frostwood-scenery.js";
import { createGroundTelegraphs } from "./ground-telegraphs.js";

interface ThreatRig {
  readonly root: Group;
  readonly body: Group;
  readonly actor: ForestActor;
  readonly idle: string;
  readonly walk: string;
  readonly selection: Mesh<RingGeometry, MeshBasicMaterial>;
  readonly attack: string;
  readonly hit: string;
  readonly ring: Mesh<RingGeometry, MeshBasicMaterial>;
  readonly lootGlint: Sprite;
  readonly beam: Mesh<CylinderGeometry, MeshBasicMaterial>;
  readonly ward: Mesh<SphereGeometry, MeshBasicMaterial>;
  readonly fireballs: Map<number, Mesh<SphereGeometry, MeshBasicMaterial>>;
  beamTime: number;
  readonly lungePath: Mesh<PlaneGeometry, MeshBasicMaterial>;
  readonly rootEffect: Mesh<RingGeometry, MeshBasicMaterial>;
  readonly height: number;
  health: number;
  sequence: number;
  attackTime: number;
  phase: ThreatView["phase"];
  hitTime: number;
  lootable: boolean;
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

function lootGlint(): Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 64; canvas.height = 64;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas drawing is unavailable");
  const glow = context.createRadialGradient(32, 32, 0, 32, 32, 28);
  glow.addColorStop(0, "#fff9d8"); glow.addColorStop(0.25, "#ffe8a6c0"); glow.addColorStop(1, "#ffe8a600");
  context.fillStyle = glow; context.fillRect(0, 0, 64, 64);
  context.fillStyle = "#fff6d7";
  context.beginPath();
  context.moveTo(32, 4); context.lineTo(37, 27); context.lineTo(60, 32); context.lineTo(37, 37);
  context.lineTo(32, 60); context.lineTo(27, 37); context.lineTo(4, 32); context.lineTo(27, 27);
  context.closePath(); context.fill();
  const texture = new CanvasTexture(canvas); texture.colorSpace = SRGBColorSpace;
  return new Sprite(new SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
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
  const innPlace = initial.places.find(place => place.id === "inn");
  if (!innPlace) throw new Error("Inn service position is missing");
  const innPosition = innPlace.position;
  const rowan = new Group(); rowan.position.set(innPosition.x, innPosition.y, innPosition.z); rowan.rotation.y = -Math.PI / 3;
  terrain.add(rowan);
  const innSign = label("THE WAYFARER’S REST · INN", "#ffe0a4", 3.2);
  innSign.position.set(innPosition.x - 2.3, 2.9, innPosition.z - 1.8); terrain.add(innSign);
  const rowanName = label("ROWAN · F to talk", "#ffe4b4", 2.3);
  rowanName.position.set(innPosition.x, 2.45, innPosition.z); terrain.add(rowanName);
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
  const playerArchetype = initial.player.archetype;
  const shield = new Mesh(new SphereGeometry(0.95, 20, 12), new MeshBasicMaterial({ color: 0x9bdfff, transparent: true, opacity: 0.22, wireframe: true, depthWrite: false }));
  shield.position.y = 0.9;
  player.add(shield);
  const playerHalo = new Mesh(new RingGeometry(0.5, 0.57, 32), new MeshBasicMaterial({ color: 0xffdf8a, side: 2 }));
  playerHalo.rotation.x = -Math.PI / 2;
  playerHalo.position.y = 0.04;
  player.add(playerHalo);
  const playerProjectile = new Mesh(new SphereGeometry(0.16, 12, 8), new MeshStandardMaterial({ color: playerArchetype === "mage" ? 0xb78cff : 0xffd36b, emissive: playerArchetype === "mage" ? 0x5420a8 : 0x8a4a00, emissiveIntensity: 1.2 }));
  playerProjectile.visible = false; scene.add(playerProjectile);
  const rigs = new Map<string, ThreatRig>();
  let knight: ForestActor | null = null;
  const playerAnimation = playerArchetype === "mage" ? { attack: "Staff_Attack", hit: "RecieveHit", jump: "Roll" } : playerArchetype === "hunter" ? { attack: "Bow_Shoot", hit: "RecieveHit", jump: "Roll" } : { attack: "Sword_Attack", hit: "RecieveHit", jump: "Roll" };
  let merchant: ForestActor | null = null;
  let innkeeper: ForestActor | null = null;
  let playerAttackRemaining = 0;
  let disposed = false;
  let elapsed = 0;
  let yaw = 0;
  let pitch = 0.72;
  let distance = 15;
  let lastAttack = initial.player.attackSequence;
  let playerProjectileTime = 0;
  let playerProjectileFrom = new Vector3();
  let playerProjectileTo = new Vector3();
  let lastHealth = initial.player.health;
  let playerHitRemaining = 0;
  let playerDead = false;
  const cameraTarget = new Vector3(initial.player.position.x, 0, initial.player.position.z);
  document.body.dataset.rigState = "loading";
  document.body.dataset.boarRigState = "loading";
  document.body.dataset.environmentState = "loading";
  const knightReady = actor("Knight", 2.2, playerArchetype).then(mounted => {
    if (disposed) { mounted.dispose(); return; }
    knight = mounted; player.add(mounted.root); mounted.play("Idle");
    document.body.dataset.rigState = "ready";
  });
  const merchantReady = actor("Cleric", 1.85).then(mounted => {
    if (disposed) { mounted.dispose(); return; }
    merchant = mounted; mara.add(mounted.root); mounted.play("Idle");
  });
  const innkeeperReady = actor("Chef_Male", 1.95).then(mounted => {
    if (disposed) { mounted.dispose(); return; }
    innkeeper = mounted; rowan.add(mounted.root); mounted.play("Idle");
    document.body.dataset.innkeeperState = "ready";
  });
  const appearances: Record<string, {model: string; height: number; idle: string; walk: string; attack: string; hit: string}> = {
    scout: {model:"Skull",height:1.6,idle:"Idle",walk:"Walk",attack:"Bite_Front",hit:"HitRecieve"},
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
    const ring = new Mesh(new RingGeometry(0.93, 1.03, 48), new MeshBasicMaterial({ color: 0xffd278, side: 2 }));
    ring.rotation.x = -Math.PI/2; ring.position.y=0.05; root.add(ring);
    const selection = new Mesh(new RingGeometry(1.09, 1.14, 48), new MeshBasicMaterial({ color: 0xfff6df, side: 2 }));
    selection.rotation.x = -Math.PI/2; selection.position.y=0.06; root.add(selection);
    const glint = lootGlint(); glint.visible = false; root.add(glint);
    const rootEffect = new Mesh(new RingGeometry(0.75, 0.92, 6), new MeshBasicMaterial({color:0x77dfc4,transparent:true,opacity:0.9,side:2,depthWrite:false}));
    rootEffect.rotation.x = -Math.PI/2; rootEffect.position.y = 0.12; rootEffect.visible = false; root.add(rootEffect);
    const lungePath = new Mesh(new PlaneGeometry(0.12, 1), new MeshBasicMaterial({color:0xffcf7c,transparent:true,opacity:0.9,depthWrite:false}));
    lungePath.visible = false; lungePath.renderOrder = 3; scene.add(lungePath);
    const beam = new Mesh(new CylinderGeometry(0.045,0.045,1,8),new MeshBasicMaterial({color:0xffbc71,transparent:true,opacity:0.85,depthWrite:false})); beam.visible=false;scene.add(beam);
    const ward = new Mesh(new SphereGeometry(1.05,20,12),new MeshBasicMaterial({color:0x80c6ff,transparent:true,opacity:0.2,depthWrite:false}));ward.position.y=look.height*0.55;ward.visible=false;root.add(ward);
    rigs.set(threat.id,{root,body,actor:creature,idle:look.idle,walk:look.walk,selection,attack:look.attack,hit:look.hit,ring,lootGlint:glint,lungePath,rootEffect,beam,beamTime:0,ward,fireballs:new Map(),height:look.height,
      health:threat.health,sequence:threat.actionSequence,attackTime:0,phase:threat.phase,hitTime:0,lootable:false});
  })).then(()=>{document.body.dataset.boarRigState="ready";document.body.dataset.creatureRigState="ready";});
  const natureReady = buildFrostwood(terrain, thicket, innPosition).then(()=>{document.body.dataset.environmentState="ready";});
  const telegraphs = createGroundTelegraphs(scene, canvas);
  const ready = Promise.all([knightReady, merchantReady, innkeeperReady, creaturesReady, natureReady, telegraphs.ready]).then(()=>undefined);
  const raycaster = new Raycaster();
  const point = new Vector2();
  const forward = () => ({ x: Math.sin(yaw), z: Math.cos(yaw) });
  return {
    canvas, ready, forward,
    orbit(dx, dy) { yaw -= dx * 0.005; pitch = Math.max(0.42, Math.min(1.22, pitch + dy * 0.004)); },
    zoom(delta) { distance = Math.max(6, Math.min(18, distance * Math.exp(delta * 0.001))); },
    projectThreat(id) {
      const rig = rigs.get(id); if (!rig || !rig.root.visible) return null;
      const head = rig.root.position.clone().add(new Vector3(0, rig.height + rig.body.position.y + 0.25, 0)).project(camera);
      const feet = rig.root.position.clone().project(camera);
      if (head.z < -1 || head.z > 1 || Math.abs(head.x) > 1 || Math.abs(head.y) > 1) return null;
      return { x: (head.x + 1) * host.clientWidth / 2, y: (1 - head.y) * host.clientHeight / 2, feetY: (1 - feet.y) * host.clientHeight / 2 };
    },
    pick(x, y) {
      const rect = canvas.getBoundingClientRect();
      point.set((x - rect.left) / rect.width * 2 - 1, -(y - rect.top) / rect.height * 2 + 1);
      raycaster.setFromCamera(point, camera);
      const targets = [...rigs.values()].filter((rig) => (rig.health > 0 || rig.lootable) && rig.root.visible).map((rig) => rig.root);
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
      const face = snapshot.player.facing;
      if (snapshot.player.moving || snapshot.player.maneuver !== "none") player.rotation.y = Math.atan2(face.x, face.z);
      const selected = snapshot.threats.find((threat) => threat.id === snapshot.selectedThreat);
      if (snapshot.player.attackSequence !== lastAttack && knight) {
        if (selected) {
          player.rotation.y = Math.atan2(selected.position.x-position.x,selected.position.z-position.z);
          if (playerArchetype !== "warrior" && snapshot.player.currentAction === "strike") {
            playerProjectileFrom.set(position.x, position.y + 1.15, position.z);
            playerProjectileTo.set(selected.position.x, selected.position.y + 1.05, selected.position.z);
            playerProjectileTime = 0.22;
          }
        }
        const swing = snapshot.player.maneuver === "disengage" ? 0.18 : 0.4;
        knight.play(playerAnimation.attack,false,swing); playerAttackRemaining=swing; lastAttack=snapshot.player.attackSequence;
      }
      playerProjectileTime = Math.max(0, playerProjectileTime - delta);
      playerProjectile.visible = playerArchetype !== "warrior" && playerProjectileTime > 0;
      if (playerProjectile.visible) {
        const progress = 1 - playerProjectileTime / 0.22;
        playerProjectile.position.lerpVectors(playerProjectileFrom, playerProjectileTo, progress);
        if (playerArchetype === "hunter") {
          playerProjectile.scale.set(.3,.3,3); playerProjectile.lookAt(playerProjectileTo);
        } else playerProjectile.scale.setScalar(1 + Math.sin(progress * Math.PI) * 0.9);
      }
      if (knight) {
        if(snapshot.player.health<=0 && !playerDead) { playerDead=true; knight.play("Death",false); }
        else if(snapshot.player.health<lastHealth && snapshot.player.health>0) { playerHitRemaining=0.4; knight.play(playerAnimation.hit,false,0.4); }
        if(!playerDead) {
          playerHitRemaining=Math.max(0,playerHitRemaining-delta); playerAttackRemaining=Math.max(0,playerAttackRemaining-delta);
          if(playerHitRemaining===0&&playerAttackRemaining===0) knight.play(snapshot.player.maneuver === "disengage" || !snapshot.player.grounded ? playerAnimation.jump : snapshot.player.moving ? "Run" : "Idle");
        }
        knight.mixer.update(delta);
        document.body.dataset.rigAnimationMode=playerDead?"death":playerHitRemaining>0?"hit":playerAttackRemaining>0?"attack":snapshot.player.moving?"locomotion":"idle";
      }
      if (merchant) {
        mara.rotation.y = snapshot.shopOpen ? Math.atan2(position.x - mara.position.x, position.z - mara.position.z) : -Math.PI / 2;
        merchant.play(snapshot.shopOpen ? "Idle_Weapon" : "Idle"); merchant.mixer.update(delta);
      }
      if (innkeeper) {
        rowan.rotation.y = snapshot.innOpen ? Math.atan2(position.x - innPosition.x, position.z - innPosition.z) : -Math.PI / 3;
        innkeeper.mixer.update(delta);
      }
      innSign.visible = rowanName.visible = Math.hypot(position.x - innPosition.x, position.z - innPosition.z) < 17;
      lastHealth = snapshot.player.health;
      shield.visible = snapshot.player.block > 0;
      shield.rotation.y = elapsed;
      coreRoot.visible = snapshot.resourceRemaining > 0;
      for (const threat of snapshot.threats) {
        const rig = rigs.get(threat.id);
        if (!rig) continue;
        rig.root.visible = threat.active || threat.phase === "cleared";
        rig.root.position.set(threat.position.x, threat.position.y, threat.position.z);
        rig.lootable = snapshot.loot.some(item => item.sourceId === threat.id && item.available);
        rig.lootGlint.visible = rig.lootable;
        rig.lootGlint.position.set(0, 0.8 + 0.08 * Math.sin(elapsed * 2), 0);
        rig.lootGlint.scale.setScalar(0.55 + 0.08 * Math.sin(elapsed * 3));
        rig.lootGlint.material.opacity = 0.75 + 0.2 * Math.sin(elapsed * 2);
        rig.ring.visible = threat.health > 0;
        rig.ring.material.color.setHex(threat.disposition === "hostile" || threat.aggro ? 0xf04d4d : 0xf1d34f);
        rig.selection.visible = threat.selected && threat.health > 0;
        if (threat.health > 0) rig.root.rotation.y = Math.atan2(threat.facing.x, threat.facing.z);
        rig.ring.position.y = 0.05 - threat.position.y;
        rig.selection.position.y = 0.06 - threat.position.y;
        rig.rootEffect.position.y = 0.12 - threat.position.y;
        rig.rootEffect.visible = threat.rootedSeconds > 0;
        const attackClip = threat.currentAbility.id === "maul" ? "Gallop_Jump" : rig.attack;
        const changed = threat.phase !== rig.phase;
        if (threat.actionSequence > rig.sequence && threat.currentAbility.id === "ember-beam") { rig.attackTime = 0.3; rig.beamTime = 0.18; }
        if (threat.phase === "cleared") {
          if(rig.health>0) rig.actor.play("Death",false,undefined,0.08);
        } else if (threat.movementMode === "hop" || threat.movementMode === "lunge") {
          const action = rig.actor.action?.getClip().name === "Gallop_Jump" ? rig.actor.action : rig.actor.play("Gallop_Jump",false,undefined,0.04);
          action.paused = true; action.time = action.getClip().duration * threat.motionProgress;
        } else if (rig.attackTime > 0) {
          const action = rig.actor.action?.getClip().name === rig.attack ? rig.actor.action : rig.actor.play(rig.attack,false,0.3,0.03);
          action.paused = true; action.time = action.getClip().duration * (1 - rig.attackTime/0.3);
        } else if(threat.phase === "action") {
          const action = changed ? rig.actor.play(attackClip,false,undefined,0.035) : rig.actor.action!;
          action.paused = true;
          const impactStart = 0.3;
          action.time = action.getClip().duration * (impactStart + (1-impactStart) * Math.max(0, 1-threat.remainingSeconds/threat.phaseDuration));
        } else if(threat.health < rig.health && threat.health>0) {
          rig.hitTime=0.3; rig.actor.play(rig.hit,false,0.3,0.04);
        } else if(threat.phase === "preparation" && !threat.moving && rig.hitTime<=delta) {
          const action = changed || rig.actor.action?.getClip().name !== attackClip ? rig.actor.play(attackClip,false,undefined,0.12) : rig.actor.action;
          action.paused = true;
          action.time = action.getClip().duration * 0.3 * Math.max(0,1-threat.remainingSeconds/threat.phaseDuration);
        } else if(rig.hitTime<=delta || changed) {
          rig.actor.play(threat.movementMode === "circle" ? "Walk" : threat.moving ? rig.walk : rig.idle);
        }
        rig.hitTime=Math.max(0,rig.hitTime-delta);
        rig.attackTime=Math.max(0,rig.attackTime-delta);
        // Authored motion supplies the pose; a restrained lean makes the full windup visible.
        const preparation = threat.phase === "preparation" && !threat.moving ? Math.max(0,1-threat.remainingSeconds/threat.phaseDuration) : 0;
        rig.body.position.y = threat.id === "scout" ? 1.25 : 0;
        rig.body.rotation.x = -0.12*preparation;
        rig.body.position.z = -0.18*preparation;
        rig.lungePath.visible = threat.aggro && threat.health > 0 && threat.currentAbility.id === "maul" && threat.windowAction?.status !== "resolved";
        if (rig.lungePath.visible) {
          const from = threat.attackOrigin, to = threat.targetPosition;
          const dx = to.x - from.x, dz = to.z - from.z;
          rig.lungePath.position.set((from.x+to.x)/2, 0.11, (from.z+to.z)/2);
          rig.lungePath.rotation.set(-Math.PI/2, 0, Math.atan2(dx,dz));
          rig.lungePath.scale.y = Math.hypot(dx,dz);
          rig.lungePath.material.color.setHex(threat.movementMode === "lunge" ? 0xff5947 : 0xffcf7c);
        }
        rig.ward.position.y = rig.height*0.55 + rig.body.position.y;
        rig.ward.visible = threat.block > 0;
        rig.beamTime=Math.max(0,rig.beamTime-delta);rig.beam.visible=rig.beamTime>0;
        if (rig.beam.visible) {
          const mouth=new Vector3(threat.position.x,threat.position.y+rig.body.position.y+rig.height*0.65,threat.position.z);
          const end=new Vector3(position.x,position.y+1.2,position.z),direction=end.clone().sub(mouth);
          rig.beam.position.copy(mouth).add(end).multiplyScalar(0.5);
          rig.beam.scale.y=direction.length();rig.beam.quaternion.setFromUnitVectors(new Vector3(0,1,0),direction.normalize());
          rig.beam.material.opacity=rig.beamTime/0.18;
        }
        const activeProjectiles=new Set(threat.fireballs.map(ball=>ball.id));
        for (const [id,ball] of rig.fireballs) if(!activeProjectiles.has(id)) {scene.remove(ball);ball.geometry.dispose();ball.material.dispose();rig.fireballs.delete(id);}
        for (const projectile of threat.fireballs) {
          let ball=rig.fireballs.get(projectile.id);
          if (!ball) {ball=new Mesh(new SphereGeometry(0.23,12,8),new MeshBasicMaterial({color:0xff7c2a}));rig.fireballs.set(projectile.id,ball);scene.add(ball);}
          ball.visible=projectile.remainingSeconds<=projectile.duration;
          const progress=Math.max(0,Math.min(1,1-projectile.remainingSeconds/projectile.duration));
          ball.position.set(projectile.origin.x+(position.x-projectile.origin.x)*progress,
            (projectile.origin.y+rig.body.position.y+rig.height*0.65)*(1-progress)+(position.y+1.2)*progress+Math.sin(progress*Math.PI)*0.35,
            projectile.origin.z+(position.z-projectile.origin.z)*progress);
          const lateral=Math.sin(progress*Math.PI)*0.55*((projectile.id%3)-1);
          const dx=position.x-projectile.origin.x,dz=position.z-projectile.origin.z,length=Math.hypot(dx,dz)||1;
          ball.position.x+=-dz/length*lateral;ball.position.z+=dx/length*lateral;
          ball.scale.setScalar(1+Math.sin(elapsed*28+projectile.id)*0.12);
        }
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
      telegraphs.update(snapshot, facing);
      camera.position.set(cameraTarget.x - facing.x * Math.cos(pitch) * distance, cameraTarget.y + Math.sin(pitch) * distance, cameraTarget.z - facing.z * Math.cos(pitch) * distance);
      camera.lookAt(cameraTarget.x, cameraTarget.y + 0.6, cameraTarget.z);
      renderer.render(scene, camera);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      knight?.dispose(); merchant?.dispose(); innkeeper?.dispose();
      for (const rig of rigs.values()) rig.actor.dispose();
      disposeObjects(scene);
      scene.clear();
      renderer.dispose();
      canvas.remove();
    },
  };
}
