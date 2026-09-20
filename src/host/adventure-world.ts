import { VENDORS, type NpcId } from "../game/economy.js";
import {
  BufferGeometry, CanvasTexture, Color, Float32BufferAttribute,
  CylinderGeometry, DirectionalLight, Fog, Group, HemisphereLight,
  Material, Mesh, InstancedMesh, MeshBasicMaterial, MeshStandardMaterial,
  Object3D, PerspectiveCamera, Points, PointsMaterial, RingGeometry, Scene, SphereGeometry,
  Sprite, SpriteMaterial, SRGBColorSpace, Texture, Vector2, Vector3, WebGLRenderer,
  Raycaster,
} from "three";
import type { AdventureSnapshot, CombatView, CombatForecast, Position } from "../game/adventure-types.js";
import { actor, prop, type ForestActor } from "./frostwood-assets.js";
import { buildFrostwood } from "./frostwood-scenery.js";
import { conformToTerrain } from "./terrain-geometry.js";
import { buildHollowdeep } from "./hollowdeep-scenery.js";
import { createGroundTelegraphs, type CombatPreview } from "./ground-telegraphs.js";
import { createAggroRanges } from "./aggro-ranges.js";
import { createRemotePlayers, type RemotePlayerView } from "./remote-player.js";
import { createSocialAnimation } from "./social-animation.js";
import { createPhotonChair } from "./photon-chair.js";
import { createSnapshotInterpolation } from "./snapshot-interpolation.js";
import { createOverheadNames, npcQuestMarker } from "./overhead-names.js";
import { createChatBubbles } from "./chat-bubbles.js";
import { createFloatingCombatText } from "./floating-combat-text.js";
import type { SharedChatMessage } from "../game/multiplayer-types.js";
import { YARD } from "../game/yard-content.js";
import { createMovementPreview } from "./movement-preview.js";
import { createCombatGrid } from "./combat-grid.js";
import { combatCell } from "../game/combat-grid.js";
import { updateThreatAnimation, type ThreatAnimationState } from "./threat-animation.js";
import { terrainHeight } from "../game/cave-layout.js";

interface ThreatRig extends ThreatAnimationState {
  readonly root: Group;
  readonly body: Group;
  readonly actor: ForestActor;
  readonly selection: Mesh<RingGeometry, MeshBasicMaterial>;
  readonly ring: Mesh<RingGeometry, MeshBasicMaterial>;
  readonly lootGlint: Sprite;
  readonly beam: Mesh<CylinderGeometry, MeshBasicMaterial>;
  readonly ward: Mesh<SphereGeometry, MeshBasicMaterial>;
  readonly fireballs: Map<number, Mesh<SphereGeometry, MeshBasicMaterial>>;
  readonly height: number;
  lootable: boolean;
}

export type WorldPick = { readonly kind: "threat"; readonly id: string }
  | { readonly kind: "chest"; readonly id: "ironback-chest" }
  | { readonly kind: "npc"; readonly id: NpcId }
  | { readonly kind: "resource"; readonly id: "frost-cores" }
  | { readonly kind: "place"; readonly id: string };

interface HoverTarget {
  readonly root: Object3D;
  readonly pick: WorldPick;
  readonly name: string;
  readonly anchor: Vector3;
}

export interface AdventureWorld {
  readonly canvas: HTMLCanvasElement;
  readonly ready: Promise<void>;
  render(snapshot: AdventureSnapshot, delta: number, localPlayer?: AdventureSnapshot['player'], serverTime?: number, connectionRevision?: number): void;
  updatePlayers(players: readonly RemotePlayerView[]): void;
  updateChat(messages: readonly SharedChatMessage[], localPlayerId: string): void;
  orbit(dx: number, dy: number): void;
  zoom(delta: number): void;
  forward(): { x: number; z: number };
  pick(x: number, y: number): WorldPick | null;
  pickGround(clientX: number, clientY: number): Position | null;
  hover(x: number, y: number): void;
  clearHover(): void;
  setThreatNameplateVisible(id: string, visible: boolean): void;
  setAggroRangesVisible(visible: boolean): void;
  setCombatPreview(preview: CombatPreview | null): void;
  setCombatHudHeight(height: number): void;
  setMoveAiming(active: boolean): void;
  canMoveTo(destination: Position): boolean;
  projectThreat(id: string): { x: number; y: number; feetY: number } | null;
  dispose(): void;
}

function disposeObjects(root: Object3D): void {
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();
  const textures = new Set<Texture>();
  root.traverse((object) => {
    if (object instanceof InstancedMesh) object.dispose();
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

function createCombatEffects(scene: Scene) {
  const swarms = new Map<string, Points<BufferGeometry, PointsMaterial>>();
  const swarmMaterial = new PointsMaterial({ color: 0xe2c66b, size: 0.1, transparent: true, opacity: 0.85, depthWrite: false });
  const burstGeometry = new SphereGeometry(1, 16, 10);
  const bursts: { mesh: Mesh<SphereGeometry, MeshBasicMaterial>; remaining: number; radius: number }[] = [];
  let highwater: number | undefined;
  let connection: number | undefined;
  let lastUpdate = 0;
  const clearBursts = () => {
    for (const burst of bursts) { burst.mesh.removeFromParent(); burst.mesh.material.dispose(); }
    bursts.length = 0;
  };
  return {
    update(combat: CombatView, elapsed: number, delta: number, revision: number) {
      const live = new Set(combat.hazards.map(hazard => hazard.id));
      for (const [id, swarm] of swarms) if (!live.has(id)) {
        swarm.removeFromParent(); swarm.geometry.dispose(); swarms.delete(id);
      }
      for (const hazard of combat.hazards) {
        let swarm = swarms.get(hazard.id);
        if (!swarm) {
          const geometry = new BufferGeometry();
          geometry.setAttribute("position", new Float32BufferAttribute(new Float32Array(28 * 3), 3));
          swarm = new Points(geometry, swarmMaterial);
          swarm.frustumCulled = false;
          scene.add(swarm); swarms.set(hazard.id, swarm);
        }
        swarm.position.set(hazard.position.x, hazard.position.y, hazard.position.z);
        const positions = swarm.geometry.getAttribute("position");
        for (let index = 0; index < positions.count; index++) {
          const angle = index * 2.4 + elapsed * (index % 2 ? 1.5 : -1.2);
          const radius = hazard.radius * Math.sqrt((index + 0.5) / positions.count);
          positions.setXYZ(index, Math.cos(angle) * radius, 0.35 + 0.25 * Math.sin(elapsed * 9 + index * 3), Math.sin(angle) * radius);
        }
        positions.needsUpdate = true;
      }
      const now = performance.now(), latest = combat.effects.at(-1)?.id ?? 0;
      if (highwater === undefined || connection !== revision || latest < highwater || now - lastUpdate > 500) {
        highwater = latest; connection = revision; clearBursts();
      } else {
        for (const effect of combat.effects) if (effect.id > highwater) {
          const mesh = new Mesh(burstGeometry, new MeshBasicMaterial({ color: 0xff8a35, transparent: true, opacity: 0.5, depthWrite: false }));
          mesh.position.set(effect.position.x, effect.position.y + 0.3, effect.position.z);
          scene.add(mesh); bursts.push({ mesh, remaining: 0.65, radius: effect.radius });
        }
        highwater = latest;
      }
      lastUpdate = now;
      for (let index = bursts.length - 1; index >= 0; index--) {
        const burst = bursts[index]!;
        burst.remaining -= delta;
        if (burst.remaining <= 0) { burst.mesh.removeFromParent(); burst.mesh.material.dispose(); bursts.splice(index, 1); continue; }
        const progress = 1 - burst.remaining / 0.65;
        const radius = burst.radius * (0.25 + 0.75 * Math.min(1, progress * 3));
        burst.mesh.scale.set(radius, 0.3 + progress * 0.75, radius);
        burst.mesh.material.opacity = (1 - progress) * 0.5;
      }
    },
    dispose() {
      clearBursts(); burstGeometry.dispose();
      for (const swarm of swarms.values()) { swarm.removeFromParent(); swarm.geometry.dispose(); }
      swarms.clear(); swarmMaterial.dispose();
    },
  };
}

export function createAdventureWorld(host: HTMLElement, initial: AdventureSnapshot, onNpcInteract?: (id: NpcId) => void, previewBait?: (destination: Position) => Promise<CombatForecast | null>): AdventureWorld {
  const scene = new Scene();
  const remotePlayers = createRemotePlayers(scene);
  let interpolation = createSnapshotInterpolation();
  let lastConnectionRevision = -1;
  scene.background = new Color(0x16242d);
  scene.fog = new Fog(0x16242d, 38, 160);
  const camera = new PerspectiveCamera(48, 1, 0.1, 210);
  const renderer = new WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.outputColorSpace = SRGBColorSpace;
  const canvas = renderer.domElement;
  canvas.id = "world-canvas";
  canvas.tabIndex = 0;
  canvas.setAttribute("aria-label", `${YARD.region}. W A S D move, drag the mouse to turn the view.`);
  host.prepend(canvas);
  scene.add(new HemisphereLight(0x9eafc8, 0x26342f, 1.15));
  const nightFill = new DirectionalLight(0x90acc9, 0.9);
  nightFill.position.set(-12, 25, -8);
  scene.add(nightFill);
  const terrain = new Group();
  scene.add(terrain);
  const thicket = new Group(); terrain.add(thicket);
  const chestRoot = new Group();
  const chestPosition = initial.loot.find(loot => loot.sourceId === "ironback-chest")?.position ?? { x: 79, y: terrainHeight(79, -52), z: -52 };
  chestRoot.position.set(chestPosition.x, chestPosition.y, chestPosition.z);
  chestRoot.userData.chestId = "ironback-chest";
  terrain.add(chestRoot);
  const chestReady = prop("pirate/Prop_Chest_Closed", 1.8).then(chest => {
    if (disposed) { disposeObjects(chest); return; }
    chest.position.y = 0; chestRoot.add(chest);
  });
  const mara = new Group(); mara.position.set(3.4, 0, -7.5); mara.rotation.y = -Math.PI/2;
  terrain.add(mara);
  const innPlace = initial.places.find(place => place.id === "inn");
  if (!innPlace) throw new Error("Inn service position is missing");
  const innPosition = innPlace.position;
  const rowan = new Group(); rowan.position.set(innPosition.x, innPosition.y, innPosition.z); rowan.rotation.y = -Math.PI / 3;
  terrain.add(rowan);
  const bankPosition = initial.places.find(place => place.id === "bank")!.position;
  const elian = new Group(); elian.position.set(bankPosition.x, bankPosition.y, bankPosition.z); elian.rotation.y = Math.PI / 2;
  terrain.add(elian);
  const vendorActors = VENDORS.map(vendor => {
    const root = new Group(); root.position.set(vendor.position.x, 0, vendor.position.z);
    root.rotation.y = vendor.position.x < 0 ? Math.PI / 2 : -Math.PI / 2;
    terrain.add(root);
    return { vendor, root, actor: null as ForestActor | null };
  });
  const coreRoot = new Group();
  const corePlace = initial.places.find(place => place.id === "frost-cores")!;
  coreRoot.position.set(corePlace.position.x, 0, corePlace.position.z);
  const coresReady = Promise.all([1.2, 0.75, 0.65].map(async (height, index) => {
    const crystal = await prop("Crystal2", height);
    if (disposed) return;
    crystal.position.set(index === 0 ? 0 : index === 1 ? -0.5 : 0.55, 0, index === 2 ? 0.4 : -0.2);
    crystal.rotation.y = index * 2;
    crystal.traverse(object => {
      if (!(object instanceof Mesh)) return;
      object.material = new MeshStandardMaterial({ color: 0x86ebff, emissive: 0x2090ae, emissiveIntensity: 0.75, roughness: 0.35 });
    });
    coreRoot.add(crystal);
    canvas.dataset.resourceModel = "Crystal2";
  }));
  terrain.add(coreRoot);
  const ritualPlace = initial.places.find((place) => place.kind === "ritual");
  const ritualPosition = ritualPlace?.position ?? { x: 0, y: 0, z: 43 };
  const ritual = new Mesh(new RingGeometry(2.25, 2.6, 48), new MeshBasicMaterial({ color: 0x91c6ff, side: 2 }));
  ritual.rotation.x = -Math.PI / 2;
  ritual.position.set(ritualPosition.x, 0.08, ritualPosition.z);
  terrain.add(ritual);

  const hoverTargets: HoverTarget[] = [
    { root: chestRoot, pick: { kind: "chest", id: "ironback-chest" }, name: "Ironback Crab’s cache", anchor: new Vector3(chestPosition.x, chestPosition.y + 1.3, chestPosition.z) },
    ...vendorActors.map(({vendor, root}): HoverTarget => ({ root, pick: {kind: "npc", id: vendor.id}, name: `${vendor.name} · ${vendor.trade}`, anchor: new Vector3(vendor.position.x, 2.45, vendor.position.z) })),
    { root: coreRoot, pick: { kind: "resource", id: "frost-cores" }, name: YARD.resource, anchor: new Vector3(corePlace.position.x, 1.4, corePlace.position.z) },
    { root: mara, pick: { kind: "npc", id: "mara" }, name: "Mara · Supplies", anchor: new Vector3(3.4, 2.45, -7.5) },
    { root: elian, pick: { kind: "npc", id: "bank" }, name: "Elian · Banker", anchor: new Vector3(bankPosition.x, 2.45, bankPosition.z) },
    { root: rowan, pick: { kind: "npc", id: "inn" }, name: "Rowan · Innkeeper", anchor: new Vector3(innPosition.x, 2.45, innPosition.z) },
    { root: ritual, pick: { kind: "place", id: "ritual" }, name: YARD.works, anchor: new Vector3(ritualPosition.x, 0.4, ritualPosition.z) },
  ];
  const tooltip = document.createElement("div");
  tooltip.id = "world-hover-tooltip";
  tooltip.setAttribute("role", "tooltip");
  tooltip.hidden = true;
  tooltip.style.cssText = "position:absolute;z-index:4;pointer-events:none;max-width:calc(100% - 16px);padding:7px 11px;border:1px solid #ad9160;border-radius:4px;background:#111b28ed;color:#fff0cb;font:var(--ui-font-body)/1.4 Georgia,serif;text-align:center;box-shadow:0 2px 8px #0008;transform:translate(-50%,-100%)";
  host.append(tooltip);
  const gatherCursor = `url("data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><path d="M5 28L22 10" stroke="#15212b" stroke-width="7"/><path d="M5 28L22 10" stroke="#b48649" stroke-width="4"/><path d="M9 5Q22 1 29 17L21 11Z" fill="#bceeff" stroke="#15212b" stroke-width="2"/></svg>')}") 9 5, pointer`;
  let hoverPointer: { x: number; y: number } | null = null;
  let hoverSnapshot = initial;
  const clearHover = () => {
    hoverPointer = null;
    tooltip.hidden = true;
    delete canvas.dataset.hoverKind;
    delete canvas.dataset.hoverId;
    canvas.style.cursor = "";
  };
  const player = new Group();
  const photonChair = createPhotonChair(player);
  player.userData.localPlayer = true;
  scene.add(player);
  const overheadNames = createOverheadNames(host, camera);
  const chatBubbles = createChatBubbles(host, scene, camera, player);
  const combatText = createFloatingCombatText(host);
  const combatAnchor = new Vector3();
  const playerArchetype = initial.player.archetype;
  const shield = new Mesh(new SphereGeometry(0.95, 20, 12), new MeshBasicMaterial({ color: 0x9bdfff, transparent: true, opacity: 0.22, wireframe: true, depthWrite: false }));
  shield.position.y = 0.9;
  player.add(shield);
  const playerHalo = new Mesh(new RingGeometry(0.5, 0.57, 32), new MeshBasicMaterial({ color: 0xffdf8a, side: 2 }));
  playerHalo.rotation.x = -Math.PI / 2;
  playerHalo.position.y = 0.04;
  player.add(playerHalo);
  const alchemist = playerArchetype === "alchemist", artificer = playerArchetype === "artificer";
  const playerProjectile = new Mesh(new SphereGeometry(0.16, 12, 8), new MeshStandardMaterial({ color: playerArchetype === "mage" ? 0xb78cff : alchemist ? 0x7ed36d : artificer ? 0xffb347 : 0xffd36b, emissive: playerArchetype === "mage" ? 0x5420a8 : alchemist ? 0x245c28 : artificer ? 0x6d3200 : 0x8a4a00, emissiveIntensity: 1.2 }));
  playerProjectile.visible = false; scene.add(playerProjectile);
  const rigs = new Map<string, ThreatRig>();
  let knight: ForestActor | null = null;
  const playerAnimation = playerArchetype === "mage" ? { attack: "Staff_Attack", hit: "RecieveHit", jump: "Roll" } : playerArchetype === "hunter" ? { attack: "Bow_Shoot", hit: "RecieveHit", jump: "Roll" } : playerArchetype === "alchemist" || playerArchetype === "artificer" ? { attack: "Shoot_OneHanded", hit: "RecieveHit", jump: "Roll" } : { attack: "Sword_Attack", hit: "RecieveHit", jump: "Roll" };
  let merchant: ForestActor | null = null;
  let innkeeper: ForestActor | null = null;
  let banker: ForestActor | null = null;
  let playerAttackRemaining = 0;
  const playSocialAnimation = createSocialAnimation();
  let disposed = false;
  let otherPlayers: readonly RemotePlayerView[] = [];
  let updateScenery: ((coolingRestored: boolean, shiftEnded: boolean, player: Position, camera: Vector3) => void) | undefined;
  let elapsed = 0;
  let yaw = 0;
  let pitch = 0.48;
  let distance = 15;
  let lastAttack = initial.player.attackSequence;
  let playerProjectileTime = 0;
  let playerProjectileFrom = new Vector3();
  let playerProjectileTo = new Vector3();
  let lastHealth = initial.player.health;
  let lastFacing = initial.player.facing;
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
  const vendorsReady = Promise.all(vendorActors.map(async (entry, index) => {
    const mounted = await actor(index === 1 ? "Knight" : "Cleric", index === 1 ? 2 : 1.85, index === 1 ? "warrior" : undefined);
    if (disposed) { mounted.dispose(); return; }
    entry.actor = mounted; entry.root.add(mounted.root); mounted.play("Idle");
  })).then(() => { document.body.dataset.vendorsState = "ready"; });
  const bankerReady = actor("Cleric", 1.95).then(mounted => {
    if (disposed) { mounted.dispose(); return; }
    banker = mounted; elian.add(mounted.root); mounted.play("Idle");
    document.body.dataset.bankerState = "ready";
  });
  const innkeeperReady = actor("Chef_Male", 1.95).then(mounted => {
    if (disposed) { mounted.dispose(); return; }
    innkeeper = mounted; rowan.add(mounted.root); mounted.play("Idle");
    document.body.dataset.innkeeperState = "ready";
  });
  const appearances: Record<string, {model: string; height: number; idle: string; walk: string; attack: string; hit: string}> = {
    "cave-bat": {model:"Bat",height:1.5,idle:"Flying",walk:"Flying",attack:"Bite_Front",hit:"HitRecieve"},
    "cave-crab": {model:"Crab",height:2.3,idle:"Idle",walk:"Walk",attack:"Bite_InPlace",hit:"HitRecieve"},
    scout: {model:"Skull",height:1.6,idle:"Idle",walk:"Walk",attack:"Bite_Front",hit:"HitRecieve"},
    nest: {model:"Armabee",height:1.6,idle:"Flying_Idle",walk:"Fast_Flying",attack:"Headbutt",hit:"HitReact"},
    warder: {model:"MushroomKing",height:2.4,idle:"Idle",walk:"Run",attack:"Punch",hit:"HitReact"},
    patrol: {model:"Wolf",height:1.6,idle:"Idle",walk:"Gallop",attack:"Attack",hit:"Idle_HitReact1"},
    "ritual-guardian": {model:"Leela",height:3.2,idle:"Idle",walk:"Walk",attack:"Kick",hit:"HitRecieve_1"},
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
    const beam = new Mesh(new CylinderGeometry(0.045,0.045,1,8),new MeshBasicMaterial({color:0xffbc71,transparent:true,opacity:0.85,depthWrite:false})); beam.visible=false;scene.add(beam);
    const ward = new Mesh(new SphereGeometry(1.05,20,12),new MeshBasicMaterial({color:0x80c6ff,transparent:true,opacity:0.2,depthWrite:false}));ward.position.y=look.height*0.55;ward.visible=false;root.add(ward);
    if (threat.id === "ritual-guardian") ward.scale.setScalar(1.45);
    rigs.set(threat.id,{root,body,actor:creature,idle:look.idle,walk:look.walk,selection,attack:look.attack,hit:look.hit,ring,lootGlint:glint,beam,beamTime:0,ward,fireballs:new Map(),height:look.height,
      health:threat.health,sequence:threat.actionSequence,attackTime:0,phase:threat.phase,hitTime:0,lootable:false});
  })).then(()=>{document.body.dataset.boarRigState="ready";document.body.dataset.creatureRigState="ready";});
  const natureReady = buildFrostwood(terrain, thicket, innPosition, (root, name) => {
    const place = name === "House_1" ? { id: "town", name: root.position.x === -14 ? "Nine-Bell Bank" : YARD.settlement }
      : name === "Inn" ? { id: "inn", name: YARD.inn }
      : name === "Fence" ? { id: `gate-${root.id}`, name: YARD.gate } : null;
    if (place) hoverTargets.push({ root, pick: { kind: "place", id: place.id }, name: place.name, anchor: root.position.clone().add(new Vector3(0, 2, 0)) });
    return place !== null;
  }).then(update=>{updateScenery=update;document.body.dataset.environmentState="ready";});
  let updateCave = (_position: Position, _camera: Vector3) => {};
  const caveReady = buildHollowdeep(terrain).then(update => { updateCave = update; });
  const telegraphs = createGroundTelegraphs(scene, canvas);
  const combatEffects = createCombatEffects(scene);
  let combatPreview: CombatPreview | null = null;
  let combatHudHeight = 0;
  const aggroRanges = createAggroRanges(scene, canvas);
  const combatGrid = createCombatGrid(scene, canvas);
  let moveAiming = false;
  const movementPreview = createMovementPreview(destination => previewBait?.(destination) ?? Promise.resolve(null));
  const moveOutcome = document.createElement("div"); moveOutcome.id = "move-preview-outcome"; moveOutcome.hidden = true;
  moveOutcome.setAttribute("role", "status");
  Object.assign(moveOutcome.style, { position: "absolute", zIndex: "8", pointerEvents: "none", padding: "8px 10px", maxWidth: "280px", whiteSpace: "pre-line", background: "#112126ef", color: "#fff0cc", border: "1px solid #a9c8b4", borderRadius: "3px", font: "12px/1.45 system-ui" });
  host.append(moveOutcome);
  const ready = Promise.all([knightReady, merchantReady, innkeeperReady, bankerReady, vendorsReady, creaturesReady, coresReady, natureReady, caveReady, chestReady]).then(()=>undefined);
  const raycaster = new Raycaster();
  const point = new Vector2();
  const groundSurfaces: Object3D[] = [];
  void ready.then(() => terrain.traverse(object => { if (object.userData.walkableGround) groundSurfaces.push(object); }));
  const forward = () => ({ x: Math.sin(yaw), z: Math.cos(yaw) });
  const pickGround = (x: number, y: number): Position | null => {
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0 || x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) return null;
    point.set((x - rect.left) / rect.width * 2 - 1, -(y - rect.top) / rect.height * 2 + 1);
    raycaster.setFromCamera(point, camera);
    const hit = raycaster.intersectObjects(groundSurfaces, false)[0];
    if (!hit) return null;
    const cellX = combatCell(hit.point.x), cellZ = combatCell(hit.point.z);
    return { x: cellX, y: terrainHeight(cellX, cellZ), z: cellZ };
  };
  const pick = (x: number, y: number): WorldPick | null => {
    const rect = canvas.getBoundingClientRect();
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) return null;
    point.set((x - rect.left) / rect.width * 2 - 1, -(y - rect.top) / rect.height * 2 + 1);
    raycaster.setFromCamera(point, camera);
    const targets: Object3D[] = [...rigs.values()].filter(rig => (rig.health > 0 || rig.lootable) && rig.root.visible).map(rig => rig.root);
    targets.push(...hoverTargets.filter(target => target.root.visible).map(target => target.root));
    for (const hit of raycaster.intersectObjects(targets, true)) {
      let object: Object3D | null = hit.object;
      while (object) {
        if (typeof object.userData.threatId === "string") return { kind: "threat", id: object.userData.threatId };
        const target = hoverTargets.find(target => target.root === object);
        if (target) return target.pick;
        object = object.parent;
      }
    }
    return null;
  };
  const updateHover = () => {
    if (!hoverPointer || document.elementFromPoint(hoverPointer.x, hoverPointer.y) !== canvas) { clearHover(); return; }
    const hit = pick(hoverPointer.x, hoverPointer.y);
    const target = hit && hoverTargets.find(target => target.pick.kind === hit.kind && target.pick.id === hit.id);
    tooltip.hidden = !target;
    canvas.style.cursor = hit?.kind === "resource" ? gatherCursor : hit?.kind === "npc" ? "pointer" : "";
    if (hit) { canvas.dataset.hoverKind = hit.kind; canvas.dataset.hoverId = hit.id; }
    else { delete canvas.dataset.hoverKind; delete canvas.dataset.hoverId; }
    if (!target) return;
    const anchor = target.anchor.clone().project(camera);
    if (anchor.z < -1 || anchor.z > 1) { tooltip.hidden = true; return; }
    const cores = Math.min(hoverSnapshot.cargo, 6);
    tooltip.textContent = target.pick.kind === "resource" ? `${YARD.resource} · ${cores}/6 carried for the engine` : target.name;
    tooltip.dataset.worldId = target.pick.id;
    const rect = canvas.getBoundingClientRect();
    const hostRect = host.getBoundingClientRect();
    const halfWidth = tooltip.offsetWidth / 2;
    const x = rect.left - hostRect.left + (anchor.x + 1) * rect.width / 2;
    const y = rect.top - hostRect.top + (1 - anchor.y) * rect.height / 2 - 10;
    tooltip.style.left = `${Math.max(halfWidth + 8, Math.min(host.clientWidth - halfWidth - 8, x))}px`;
    tooltip.style.top = `${Math.max(tooltip.offsetHeight + 8, y)}px`;
  };
  return {
    canvas, ready, forward, pick, pickGround, clearHover,
    hover(x, y) { hoverPointer = { x, y }; },
    updatePlayers(players) { if (!disposed) otherPlayers = players; },
    updateChat(messages, selfId) { if (!disposed) chatBubbles.update(messages, selfId); },
    orbit(dx, dy) { yaw -= dx * 0.005; pitch = Math.max(0.42, Math.min(1.22, pitch + dy * 0.004)); },
    zoom(delta) { distance = Math.max(6, Math.min(21, distance * Math.exp(delta * 0.001))); },
    setThreatNameplateVisible(id, visible) { overheadNames.suppress(`threat:${id}`, visible); },
    setAggroRangesVisible(visible) { aggroRanges.setVisible(visible); },
    setCombatHudHeight(height) { combatHudHeight = height; },
    setMoveAiming(active) { moveAiming = active; if (!active) { movementPreview.clear(); moveOutcome.hidden = true; } },
    canMoveTo(destination) { return combatGrid.accepts(destination); },
    setCombatPreview(preview) { combatPreview = preview; },
    projectThreat(id) {
      const rig = rigs.get(id); if (!rig || !rig.root.visible) return null;
      const head = rig.root.position.clone().add(new Vector3(0, rig.height + rig.body.position.y + 0.25, 0)).project(camera);
      const feet = rig.root.position.clone().project(camera);
      if (head.z < -1 || head.z > 1 || Math.abs(head.x) > 1 || Math.abs(head.y) > 1) return null;
      return { x: (head.x + 1) * host.clientWidth / 2, y: (1 - head.y) * host.clientHeight / 2, feetY: (1 - feet.y) * host.clientHeight / 2 };
    },
    render(snapshot, delta, localPlayer = snapshot.player, serverTime, connectionRevision = 0) {
      if (disposed) return;
      if (lastConnectionRevision !== connectionRevision) {
        interpolation = createSnapshotInterpolation();
        combatPreview = null; movementPreview.clear();
        lastConnectionRevision = connectionRevision;
      }
      hoverSnapshot = snapshot;
      elapsed += delta;
      let visiblePlayers = otherPlayers;
      if (serverTime !== undefined) {
        interpolation.push(snapshot, otherPlayers, serverTime);
        const visible = interpolation.sample(delta);
        visiblePlayers = visible.players;
        snapshot = {...snapshot, threats: visible.threats, player: localPlayer};
      } else snapshot = {...snapshot, player: localPlayer};
      remotePlayers.update(visiblePlayers);
      remotePlayers.render(delta);
      document.body.dataset.rigRemoteAnimations = JSON.stringify(Array.from(remotePlayers.entries(), ([id, rig]) => ({ id, animation: rig.root.userData.animation, time: rig.root.userData.animationTime })));
      player.position.set(localPlayer.position.x, localPlayer.position.y, localPlayer.position.z);
      const position = player.position;
      const face = snapshot.player.facing;
      if (snapshot.player.moving || snapshot.player.maneuver !== "none" || face.x !== lastFacing.x || face.z !== lastFacing.z) {
        player.rotation.y = Math.atan2(face.x, face.z);
      }
      lastFacing = face;
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
        const swing = 0.4;
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
      photonChair.update(snapshot.player.sitting && snapshot.player.health > 0 && !snapshot.player.moving);
      if (knight) {
        if(snapshot.player.health<=0 && !playerDead) { playerDead=true; knight.play("Death",false); }
        else if(snapshot.player.health<lastHealth && snapshot.player.health>0) { playerHitRemaining=0.4; knight.play(playerAnimation.hit,false,0.4); }
        if(!playerDead) {
          playerHitRemaining=Math.max(0,playerHitRemaining-delta); playerAttackRemaining=Math.max(0,playerAttackRemaining-delta);
          if(playerHitRemaining===0&&playerAttackRemaining===0) {
            if (!playSocialAnimation(knight, snapshot.player.sitting, snapshot.player.moving ? null : snapshot.player.emote)) {
              knight.play(!snapshot.player.grounded ? playerAnimation.jump : snapshot.player.moving ? "Run" : "Idle");
            }
          }
        }
        knight.mixer.update(delta);
        document.body.dataset.rigAnimation = knight.action?.getClip().name ?? '';
        document.body.dataset.rigAnimationTime = String(knight.action?.time ?? 0);
        document.body.dataset.rigAnimationMode=playerDead?"death":playerHitRemaining>0?"hit":playerAttackRemaining>0?"attack":snapshot.player.moving?"locomotion":"idle";
      }
      if (merchant) {
        mara.rotation.y = snapshot.shopOpen ? Math.atan2(position.x - mara.position.x, position.z - mara.position.z) : -Math.PI / 2;
        merchant.play(snapshot.shopOpen ? "Idle_Weapon" : "Idle"); merchant.mixer.update(delta);
      }
      for (const entry of vendorActors) {
        if (snapshot.vendorOpen === entry.vendor.id) entry.root.rotation.y = Math.atan2(position.x - entry.root.position.x, position.z - entry.root.position.z);
        entry.actor?.mixer.update(delta);
      }
      if (banker) {
        elian.rotation.y = snapshot.bankOpen ? Math.atan2(position.x - bankPosition.x, position.z - bankPosition.z) : Math.PI / 2;
        banker.mixer.update(delta);
      }
      if (innkeeper) {
        rowan.rotation.y = snapshot.innOpen ? Math.atan2(position.x - innPosition.x, position.z - innPosition.z) : -Math.PI / 3;
        innkeeper.mixer.update(delta);
      }
      lastHealth = snapshot.player.health;
      shield.visible = snapshot.player.block > 0;
      shield.rotation.y = elapsed;
      coreRoot.visible = snapshot.resourceRemaining > 0;
      const coolingRestored = snapshot.quests.some(quest => quest.id === "cold-hands" && quest.status === "completed");
      const shiftEnded = snapshot.quests.some(quest => quest.id === "last-shift" && quest.status === "completed");
      canvas.dataset.coolingRestored = String(coolingRestored);
      canvas.dataset.shiftEnded = String(shiftEnded);
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
        conformToTerrain(rig.ring, 0.05);
        conformToTerrain(rig.selection, 0.06);
        const preparation = updateThreatAnimation(rig, threat, delta);
        rig.body.position.y = threat.id === "scout" ? 1.25 : threat.id === "cave-bat" && threat.health > 0 ? 1.1 : 0;
        rig.body.rotation.x = -0.12*preparation;
        rig.body.position.z = -0.18*preparation;
        rig.ward.position.y = rig.height*0.55 + rig.body.position.y;
        rig.ward.visible = threat.block > 0;
        rig.beamTime=Math.max(0,rig.beamTime-delta);rig.beam.visible=rig.beamTime>0;
        if (rig.beam.visible) {
          const mouth=new Vector3(threat.position.x,threat.position.y+rig.body.position.y+rig.height*0.65,threat.position.z);
          const recipient = visiblePlayers.find(other => other.id === threat.targetPlayerId)?.player.position ?? position;
          const end=new Vector3(recipient.x,recipient.y+1.2,recipient.z),direction=end.clone().sub(mouth);
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
        if (threat.id === "ritual-guardian") {
          canvas.dataset.foremanAnimation = rig.actor.action?.getClip().name ?? "";
          canvas.dataset.foremanAnimationTime = String(rig.actor.action?.time ?? 0);
        }
      }
      const width = Math.max(1, host.clientWidth);
      const height = Math.max(1, host.clientHeight);
      if (canvas.width !== Math.floor(width * renderer.getPixelRatio()) || canvas.height !== Math.floor(height * renderer.getPixelRatio())) {
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
      }
      const viewOffset = snapshot.player.inCombat ? Math.min(height * .45, combatHudHeight) / 2 : 0;
      if (viewOffset > 0) {
        if (camera.view?.offsetY !== viewOffset || camera.view.fullWidth !== width || camera.view.fullHeight !== height) camera.setViewOffset(width, height, 0, viewOffset, width, height);
      } else if (camera.view?.enabled) camera.clearViewOffset();
      if (delta === 0 || cameraTarget.distanceToSquared(position) > 100) cameraTarget.copy(position);
      else cameraTarget.lerp(position, 1 - Math.exp(-delta * 12));
      const facing = forward();
      if (snapshot.combat.phase !== "preparation") combatPreview = null;

      combatEffects.update(snapshot.combat, elapsed, delta, connectionRevision);
      aggroRanges.update(snapshot);
      const hoveredTile = moveAiming && hoverPointer ? pickGround(hoverPointer.x, hoverPointer.y) : null;
      combatGrid.update(snapshot, moveAiming, hoveredTile, otherPlayers.map(p => p.player.position));
      const destination = hoveredTile && combatGrid.accepts(hoveredTile) ? hoveredTile : null;
      movementPreview.update(hoverSnapshot, destination);
      const forecast = movementPreview.forecast;
      telegraphs.update(forecast ? { combat: { ...snapshot.combat, forecast } } : snapshot, forecast ? { kind: "destination" } : combatPreview);
      moveOutcome.hidden = !destination || snapshot.combat.phase !== "preparation" || snapshot.combat.ready;
      const previewData = JSON.stringify(destination ? { destination, pending: movementPreview.pending, forecast } : null);
      if (canvas.dataset.movePreview !== previewData) canvas.dataset.movePreview = previewData;
      if (!moveOutcome.hidden && hoverPointer) {
        const health = forecast?.outcomes.find(outcome => outcome.id === forecast.playerId)?.health;
        const lines = snapshot.threats.filter(t => t.active && t.health > 0 && t.aggro).map(threat => {
          const damage = forecast?.events.filter(event => event.sourceId === threat.id && event.targetId === forecast.playerId && event.kind === "hit").reduce((sum, event) => sum + event.damage, 0) ?? 0;
          return threat.name + " · " + (damage > 0 ? Math.ceil(damage) + " damage" : "No damage");
        });
        const outcomeText = movementPreview.pending ? "Checking this move…" : !forecast ? "Move preview unavailable" : "If you move here · Health " + Math.ceil(snapshot.player.health) + " → " + Math.ceil(health ?? snapshot.player.health) + "\n" + lines.join("\n");
        if (moveOutcome.textContent !== outcomeText) moveOutcome.textContent = outcomeText;
        const rect = host.getBoundingClientRect();
        moveOutcome.style.left = Math.max(8, Math.min(rect.width - 290, hoverPointer.x - rect.left + 18)) + "px";
        moveOutcome.style.top = Math.max(8, Math.min(rect.height - moveOutcome.offsetHeight - 8, hoverPointer.y - rect.top + 18)) + "px";
      }
      camera.position.set(cameraTarget.x - facing.x * Math.cos(pitch) * distance, cameraTarget.y + Math.sin(pitch) * distance, cameraTarget.z - facing.z * Math.cos(pitch) * distance);
      camera.lookAt(cameraTarget.x, cameraTarget.y + 0.6, cameraTarget.z);
      updateScenery?.(coolingRestored, shiftEnded, snapshot.player.position, camera.position);
      updateCave(snapshot.player.position, camera.position);
      renderer.render(scene, camera);
      updateHover();
      overheadNames.begin();
      for (const {vendor, root} of vendorActors) overheadNames.show(`npc:${vendor.id}`, `${vendor.name} · ${vendor.trade}`, root, 2.35, "friendly", true, null, onNpcInteract ? () => onNpcInteract(vendor.id) : undefined);
      overheadNames.show("npc:mara", "Mara", mara, 2.35, "friendly", true, npcQuestMarker(snapshot.quests,"mara"));
      overheadNames.show("npc:elian", "Elian · Bank", elian, 2.35, "friendly", true);
      overheadNames.show("npc:rowan", "Rowan", rowan, 2.35, "friendly", true, npcQuestMarker(snapshot.quests,"inn"));
      for (const [id, rig] of remotePlayers.entries()) overheadNames.show(`player:${id}`, rig.name, rig.root, 2.35, "player", rig.alive);
      for (const threat of snapshot.threats) {
        const rig = rigs.get(threat.id);
        if (rig) overheadNames.show(`threat:${threat.id}`, threat.name, rig.root, rig.height + rig.body.position.y + 0.25, threat.aggro ? "hostile" : threat.disposition, threat.active && threat.health > 0);
      }
      overheadNames.end();
      chatBubbles.render();
      const feedbackTime = performance.now();
      combatText.update(snapshot.combatFeedback, feedbackTime, connectionRevision);
      combatText.render(feedbackTime, id => {
        const rig = id === null ? undefined : rigs.get(id);
        if (id !== null && (!rig || !rig.root.visible)) return null;
        combatAnchor.copy(rig ? rig.root.position : player.position);
        combatAnchor.y += rig ? rig.body.position.y + rig.height * .65 : 1.8;
        combatAnchor.project(camera);
        if (combatAnchor.z < -1 || combatAnchor.z > 1 || Math.abs(combatAnchor.x) > 1 || Math.abs(combatAnchor.y) > 1) return null;
        return { x: (combatAnchor.x + 1) * width / 2, y: (1 - combatAnchor.y) * height / 2 };
      });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      clearHover();
      tooltip.remove(); moveOutcome.remove(); movementPreview.clear();
      remotePlayers.dispose();
      chatBubbles.dispose();
      combatText.dispose();
      overheadNames.dispose();
      aggroRanges.dispose();
      combatGrid.dispose();
      photonChair.dispose();
      telegraphs.dispose();
      combatEffects.dispose();
      vendorActors.forEach(entry => entry.actor?.dispose());
      knight?.dispose(); merchant?.dispose(); innkeeper?.dispose(); banker?.dispose();
      for (const rig of rigs.values()) rig.actor.dispose();
      disposeObjects(scene);
      scene.clear();
      renderer.dispose();
      canvas.remove();
    },
  };
}
