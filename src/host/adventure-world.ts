import { createYardGuards } from "./yard-guards.js";
import { createCinderFlames, createFlameTexture } from './cinder-flames.js';
import { threatAppearances as appearances } from "./threat-appearances.js";
import { createBellrunnerFleet } from "./bellrunner.js";
import { BELLRUNNER_STOPS, flightMasterId, flightMasterPosition } from "../game/bellrunner.js";
import { VENDORS, REST_SPOTS, type NpcId } from "../game/economy.js";
import {
  BufferGeometry, CanvasTexture, Color, Float32BufferAttribute,
  CylinderGeometry, Fog, Group,
  Material, Mesh, InstancedMesh, MeshBasicMaterial, MeshStandardMaterial,
  Object3D, PerspectiveCamera, Points, PointsMaterial, RingGeometry, Scene, SphereGeometry,
  Sprite, SpriteMaterial, SRGBColorSpace, Texture, Vector2, Vector3, WebGLRenderer,
  Raycaster,
} from "three";
import type { AdventureSnapshot, CombatView, CombatForecast, EncounterSession, Position } from "../game/adventure-types.js";
import { actor, prop, type ForestActor } from "./frostwood-assets.js";
import { buildWorldSigns } from "./world-signs.js";
import { captureMinimap } from "./minimap.js";
import { buildFrostwood } from "./frostwood-scenery.js";
import { combatSurfaceHeight, conformToTerrain } from "./terrain-geometry.js";
import { terrainCameraLift } from "./terrain-camera.js";
import { createSceneryCutaway } from './scenery-cutaway.js';
import { buildHollowdeep } from "./hollowdeep-scenery.js";
import { createWorldLighting } from "./world-lighting.js";
import { createGroundTelegraphs, type CombatPreview } from "./ground-telegraphs.js";
import { createAggroRanges } from "./aggro-ranges.js";
import type { UnitSelection } from "./unit-selection.js";
import { createPartyPings } from "./party-pings.js";
import { createRemotePlayers, type RemotePlayerView } from "./remote-player.js";
import { createSocialAnimation } from "./social-animation.js";
import { createPhotonChair } from "./photon-chair.js";
import { createSnapshotInterpolation } from "./snapshot-interpolation.js";
import { createOverheadNames, npcQuestMarker } from "./overhead-names.js";
import { createChatBubbles } from "./chat-bubbles.js";
import { createFloatingCombatText } from "./floating-combat-text.js";
import type { SharedChatMessage, PartyPingView } from "../game/multiplayer-types.js";
import { YARD } from "../game/yard-content.js";
import { createMovementPreview, type MovementPlanPreview } from "./movement-preview.js";
import { createCombatGrid } from "./combat-grid.js";
import { movementRetreat } from "./combat-outcome.js";
import { combatCell } from "../game/combat-grid.js";
import { updateThreatAnimation, type ThreatAnimationState } from "./threat-animation.js";
import { terrainHeight } from "../game/cave-layout.js";
import { isSwimmingPosition, lakeWaterAt, lakeSurface } from "../game/world-elevation.js";
import { buildVolcanoLandmark } from "./volcano-landmark.js";
import { mechanicalTurtle } from "./mechanical-turtle.js";
import { robotCritter, ROBOT_CRITTER_COLORS } from "./robot-critter.js";
import { selectionCircles } from './selection-circle.js';
import { createUnderwater } from "./underwater.js";
import { isSwimming, isSubmerged, movementHeight, movementHeightSampler, supportHeight } from "../game/movement.js";
import { createSwimmingWake } from "./swimming-wake.js";
import { createEnvironmentAtmosphere } from "./environment-atmosphere.js";
import { Reflector } from "three/addons/objects/Reflector.js";

interface ThreatRig extends ThreatAnimationState {
  readonly root: Group;
  readonly body: Group;
  readonly actor: ForestActor;
  readonly selection: Mesh<RingGeometry, MeshBasicMaterial>;
  readonly lootGlint: Sprite;
  readonly beam: Mesh<CylinderGeometry, MeshBasicMaterial>;
  readonly ward: Mesh<SphereGeometry, MeshBasicMaterial>;
  readonly fireballs: Map<number, Mesh<SphereGeometry, MeshBasicMaterial>>;
  readonly flames: ReturnType<typeof createCinderFlames> | null;
  readonly height: number;
  lootable: boolean;
}

export type WorldPick = { readonly kind: "threat"; readonly id: string }
  | { readonly kind: "player"; readonly id: string }
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
  readonly minimap: HTMLCanvasElement;
  readonly ready: Promise<void>;
  render(snapshot: AdventureSnapshot, delta: number, localPlayer?: AdventureSnapshot['player'], serverTime?: number, connectionRevision?: number, worldTimeMillis?: number, rainIntensity?: number): void;
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
  setHelpRangesVisible(visible: boolean): void;
  setCombatPreview(preview: CombatPreview | null): void;
  /** Show the short live-world re-entry window after a forked encounter. */
  setReturnPreview(plan: EncounterSession["returnPlan"]): void;
  /** Pick one of the server-offered re-entry markers from canvas coordinates. */
  pickReturnSpot(clientX: number, clientY: number): Position | null;
  setSelectedUnit(selection: UnitSelection): void;
  setPartyMembers(ids: readonly string[]): void;
  setPartyPings(pings: readonly PartyPingView[]): void;
  setMoveAiming(active: boolean): void;
  setMoveRoute(route: readonly Position[]): void;
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
  const fireTexture = createFlameTexture();
  const fireMaterial = new PointsMaterial({ map: fireTexture, color: 0xffb365, size: .38, transparent: true, opacity: .85, depthWrite: false });
  const residueMaterial = new PointsMaterial({ color: 0xb8cf65, size: 0.13, transparent: true, opacity: 0.75, depthWrite: false });
  const burstGeometry = new SphereGeometry(1, 16, 10);
  const bursts: { mesh: Mesh<SphereGeometry, MeshBasicMaterial>; remaining: number; radius: number; length?: number }[] = [];
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
          swarm = new Points(geometry, hazard.kind === "fire" ? fireMaterial : hazard.kind === "residue" ? residueMaterial : swarmMaterial);
          swarm.name = hazard.kind + ":" + hazard.id;
          swarm.frustumCulled = false;
          scene.add(swarm); swarms.set(hazard.id, swarm);
        }
        swarm.position.set(hazard.position.x, hazard.position.y, hazard.position.z);
        const positions = swarm.geometry.getAttribute("position");
        for (let index = 0; index < positions.count; index++) {
          const residue = hazard.kind === "residue";
          const angle = index * 2.4 + elapsed * (residue ? 0.18 : index % 2 ? 1.5 : -1.2);
          const radius = hazard.radius * Math.sqrt((index + 0.5) / positions.count);
          positions.setXYZ(index, Math.cos(angle) * radius, hazard.kind === "fire" ? .08 + ((elapsed * .75 + index * .137) % 1) * .5 : residue ? 0.12 + 0.18 * (1 + Math.sin(elapsed * 2 + index)) : 0.35 + 0.25 * Math.sin(elapsed * 9 + index * 3), Math.sin(angle) * radius);
        }
        positions.needsUpdate = true;
      }
      const now = performance.now(), latest = combat.effects.at(-1)?.id ?? 0;
      if (highwater === undefined || connection !== revision || latest < highwater || now - lastUpdate > 500) {
        highwater = latest; connection = revision; clearBursts();
      } else {
        for (const effect of combat.effects) if (effect.id > highwater) {
          const color = { ignition: 0xff8a35, whirlwind: 0xffda85, "frost-nova": 0x83dfff, "volatile-flask": 0xb8e56a, "piercing-arrow": 0xffe1a1, "disruptor-shot": 0xb3a0ff }[effect.kind];
          const mesh = new Mesh(burstGeometry, new MeshBasicMaterial({ color, transparent: true, opacity: 0.5, depthWrite: false }));
          mesh.position.set(effect.position.x, effect.position.y + 0.3, effect.position.z);
          scene.add(mesh); bursts.push({ mesh, remaining: 0.65, radius: effect.radius });
          if (effect.destination) {
            const from = new Vector3(effect.position.x, effect.position.y + 1, effect.position.z);
            const to = new Vector3(effect.destination.x, effect.destination.y + 1, effect.destination.z);
            const direction = to.clone().sub(from), length = direction.length();
            if (length > .01) {
              const trace = new Mesh(burstGeometry, new MeshBasicMaterial({ color, transparent: true, opacity: .8, depthWrite: false }));
              trace.position.copy(from).lerp(to, .5);
              trace.quaternion.setFromUnitVectors(new Vector3(0, 0, 1), direction.normalize());
              scene.add(trace); bursts.push({ mesh: trace, remaining: .65, radius: .12, length });
            }
          }
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
        if (burst.length) burst.mesh.scale.set(.1, .1, burst.length / 2);
        else burst.mesh.scale.set(radius, 0.3 + progress * 0.75, radius);
        burst.mesh.material.opacity = (1 - progress) * 0.5;
      }
    },
    dispose() {
      clearBursts(); burstGeometry.dispose();
      for (const swarm of swarms.values()) { swarm.removeFromParent(); swarm.geometry.dispose(); }
      swarms.clear(); swarmMaterial.dispose(); residueMaterial.dispose(); fireMaterial.dispose(); fireTexture.dispose();
    },
  };
}

export function createAdventureWorld(host: HTMLElement, initial: AdventureSnapshot, onNpcInteract?: (id: NpcId) => void, previewBait?: (destination: Position, via: readonly Position[]) => Promise<CombatForecast | null>, playerSelection?: { selfId: string; selfName: string; showSelfName?: () => boolean; onSelect: (id: string) => void; onContextMenu?: (id: string, x: number, y: number) => void }, onMovementPreview?: (preview: MovementPlanPreview | null) => void): AdventureWorld {
  const scene = new Scene();
  const remotePlayers = createRemotePlayers(scene);
  const partyPings = createPartyPings(scene);
  const bellrunners = createBellrunnerFleet(scene);
  const yardGuards = createYardGuards(scene);
  let interpolation = createSnapshotInterpolation();
  let lastConnectionRevision = -1;
  let selectionDepth: number | null = null;
  let selectionHeight = combatSurfaceHeight;
  scene.background = new Color(0x263d46);
  scene.fog = new Fog(0x263d46, 58, 175);
  const camera = new PerspectiveCamera(48, 1, 0.1, 210);
  const renderer = new WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.outputColorSpace = SRGBColorSpace;
  const canvas = renderer.domElement;
  const minimap = document.createElement("canvas");
  canvas.id = "world-canvas";
  canvas.tabIndex = 0;
  canvas.setAttribute("aria-label", `${YARD.region}. W A S D move, drag the mouse to turn the view.`);
  host.prepend(canvas);
  const lighting = createWorldLighting(scene, renderer);
  const atmosphere = createEnvironmentAtmosphere(scene);
  const terrain = new Group();
  scene.add(terrain);
  const thicket = new Group(); terrain.add(thicket);
  const volcano = buildVolcanoLandmark(terrain);
  const chestRoot = new Group();
  const chestPosition = initial.loot.find(loot => loot.sourceId === "ironback-chest")?.position ?? { x: 79, y: terrainHeight(79, -52), z: -52 };
  chestRoot.position.set(chestPosition.x, chestPosition.y, chestPosition.z);
  chestRoot.userData.chestId = "ironback-chest";
  terrain.add(chestRoot);
  const chestReady = prop("pirate/Prop_Chest_Closed", 1.8).then(chest => {
    if (disposed) { disposeObjects(chest); return; }
    chest.position.y = 0; chestRoot.add(chest);
  });
  const mara = new Group(); mara.position.set(3.4, terrainHeight(3.4, -7.5), -7.5); mara.rotation.y = -Math.PI/2;
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
    const root = new Group(); root.position.set(vendor.position.x, terrainHeight(vendor.position.x, vendor.position.z), vendor.position.z);
    root.rotation.y = vendor.position.x < 0 ? Math.PI / 2 : -Math.PI / 2;
    terrain.add(root);
    return { vendor, root, actor: null as ForestActor | null };
  });
  const regionalHosts = REST_SPOTS.filter(spot => spot.id !== "inn").map(spot => {
    const root = new Group(); root.position.set(spot.position.x,spot.position.y,spot.position.z);
    root.rotation.y = spot.position.x > 0 ? -Math.PI/2 : Math.PI/2;
    terrain.add(root);
    return { spot, root, actor: null as ForestActor | null };
  });
  const flightMasters = BELLRUNNER_STOPS.map(stop => {
    const root = new Group(), position = flightMasterPosition(stop.id);
    root.position.set(position.x,position.y,position.z); root.rotation.y = -Math.PI / 2;
    terrain.add(root);
    return {stop,root,actor:null as ForestActor | null};
  });
  const coreRoot = new Group();
  const corePlace = initial.places.find(place => place.id === "frost-cores")!;
  coreRoot.position.set(corePlace.position.x, corePlace.position.y, corePlace.position.z);
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
    ...yardGuards.guards.map(({guard,root,anchor}): HoverTarget => ({root,anchor,pick:{kind:"npc",id:guard.id},name:`${guard.name} · Yard guard`})),
    ...flightMasters.map(({stop,root}): HoverTarget => ({root,pick:{kind:"npc",id:flightMasterId(stop.id)},name:`${stop.master} · Flight master`,anchor:root.position.clone().add(new Vector3(0,2.45,0))})),
    { root: chestRoot, pick: { kind: "chest", id: "ironback-chest" }, name: "Rattagane’s cache", anchor: new Vector3(chestPosition.x, chestPosition.y + 1.3, chestPosition.z) },
    ...vendorActors.map(({vendor, root}): HoverTarget => ({ root, pick: {kind: "npc", id: vendor.id}, name: `${vendor.name} · ${vendor.trade}`, anchor: new Vector3(vendor.position.x, root.position.y + 2.45, vendor.position.z) })),
    ...regionalHosts.map(({spot,root}): HoverTarget => ({ root, pick: {kind: "npc", id: spot.id}, name: `${spot.name} · ${spot.lodging}`, anchor: root.position.clone().add(new Vector3(0,2.45,0)) })),
    { root: coreRoot, pick: { kind: "resource", id: "frost-cores" }, name: YARD.resource, anchor: new Vector3(corePlace.position.x, corePlace.position.y + 1.4, corePlace.position.z) },
    { root: mara, pick: { kind: "npc", id: "mara" }, name: "Mara · Supplies", anchor: new Vector3(3.4, mara.position.y + 2.45, -7.5) },
    { root: elian, pick: { kind: "npc", id: "bank" }, name: "Elian · Banker", anchor: new Vector3(bankPosition.x, bankPosition.y + 2.45, bankPosition.z) },
    { root: rowan, pick: { kind: "npc", id: "inn" }, name: "Rowan · Innkeeper", anchor: new Vector3(innPosition.x, innPosition.y + 2.45, innPosition.z) },
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
  // Re-entry markers are deliberately kept in a small, dedicated group. They
  // are rebuilt only when the server's plan changes, rather than traversing the
  // terrain or adding a large projected HUD overlay every frame.
  const returnPreviewGroup = new Group();
  returnPreviewGroup.name = "return-preview-spots";
  scene.add(returnPreviewGroup);
  const returnSpotGeometry = new RingGeometry(.3, .52, 24);
  let returnPlan: EncounterSession["returnPlan"] = null;
  let returnPlanKey = "";
  let returnGhostBlend = 0;
  let returnGhostTarget = 0;
  let lastGhostScan = -Infinity;
  const returnSpotMeshes: Mesh<RingGeometry, MeshBasicMaterial>[] = [];
  type GhostMaterial = Material & { opacity?: number; transparent?: boolean; depthWrite?: boolean; color?: Color; emissive?: Color; emissiveIntensity?: number };
  type GhostRecord = { readonly mesh: Mesh; readonly original: Material | Material[]; readonly ghosts: GhostMaterial[]; readonly baseOpacity: number[] };
  const ghostRecords = new Set<GhostRecord>();
  const ghostMeshes = new WeakSet<Mesh>();
  const ghostTint = new Color(0x74d7df);
  const makeGhostMaterial = (source: Material): GhostMaterial => {
    const ghost = source.clone() as GhostMaterial;
    const base = ghost as GhostMaterial;
    base.transparent = true;
    base.depthWrite = false;
    if (base.color instanceof Color) base.color.lerp(ghostTint, .28);
    if (base.emissive instanceof Color) {
      base.emissive.lerp(ghostTint, .62);
      base.emissiveIntensity = Math.max(base.emissiveIntensity ?? 0, .38);
    }
    return base;
  };
  const ghostRoot = (root: Object3D) => {
    root.traverse(object => {
      if (!(object instanceof Mesh) || ghostMeshes.has(object)) return;
      const original = object.material;
      const sources = Array.isArray(original) ? original : [original];
      const ghosts = sources.map(makeGhostMaterial);
      ghostRecords.add({ mesh: object, original, ghosts, baseOpacity: ghosts.map((material, index) => material.opacity ?? (Array.isArray(original) ? original[index]!.opacity : (original as Material & { opacity?: number }).opacity) ?? 1) });
      ghostMeshes.add(object);
      object.material = Array.isArray(original) ? ghosts : ghosts[0]!;
    });
  };
  const restoreGhosts = () => {
    for (const record of ghostRecords) {
      record.mesh.material = record.original;
      for (const material of record.ghosts) material.dispose();
      ghostMeshes.delete(record.mesh);
    }
    ghostRecords.clear();
  };
  const updateGhostOpacity = (blend: number) => {
    const factor = 1 - blend * .62;
    for (const record of ghostRecords) record.ghosts.forEach((material, index) => { material.opacity = record.baseOpacity[index]! * factor; });
  };
  const rebuildReturnSpots = (plan: EncounterSession["returnPlan"]) => {
    for (const mesh of returnSpotMeshes) { mesh.removeFromParent(); mesh.material.dispose(); }
    returnSpotMeshes.length = 0;
    if (!plan) return;
    for (const spot of plan.spots) {
      const selected = Math.hypot(spot.position.x - plan.destination.x, spot.position.z - plan.destination.z) < .08 && Math.abs(spot.position.y - plan.destination.y) < .08;
      const mesh = new Mesh(returnSpotGeometry, new MeshBasicMaterial({ color: spot.dangerous ? 0xf08773 : 0x69d4d4, transparent: true, opacity: selected ? .95 : .64, depthWrite: false }));
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(spot.position.x, spot.position.y + .035, spot.position.z);
      mesh.scale.setScalar(selected ? 1.16 : 1);
      mesh.userData.returnSpot = spot.position;
      mesh.userData.returnDangerous = spot.dangerous;
      returnPreviewGroup.add(mesh); returnSpotMeshes.push(mesh);
    }
  };
  const swimmingWake = createSwimmingWake(scene);
  const underwater = createUnderwater(scene, host, canvas);
  const photonChair = createPhotonChair(player);
  player.userData.localPlayer = true;
  player.userData.playerId = playerSelection?.selfId;
  let selectedUnit: UnitSelection = { kind: "enemy", id: initial.selectedThreat };
  let partyMembers = new Set<string>();
  scene.add(player);
  const overheadNames = createOverheadNames(host, camera, player);
  const chatBubbles = createChatBubbles(host, scene, camera, player);
  const combatText = createFloatingCombatText(host);
  const combatAnchor = new Vector3();
  const playerArchetype = initial.player.archetype;
  const shield = new Mesh(new SphereGeometry(0.95, 20, 12), new MeshBasicMaterial({ color: 0x9bdfff, transparent: true, opacity: 0.22, wireframe: true, depthWrite: false }));
  shield.position.y = 0.9;
  player.add(shield);
  const selectionCircle = selectionCircles();
  const friendlySelection = selectionCircle(.9, 0x63f076);
  const npcSelection = selectionCircle(.95, 0x63f076); scene.add(npcSelection);
  friendlySelection.rotation.x = -Math.PI / 2; friendlySelection.visible = false; scene.add(friendlySelection);
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
  let updateScenery: ((coolingRestored: boolean, shiftEnded: boolean, wallTimeMillis: number) => void) | undefined;
  let elapsed = 0;
  let yaw = 0;
  let pitch = 0.7;
  let distance = 15;
  let cameraTerrainLift = 0;
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
    const mounted = entry.vendor.id === "suture-vendor" ? await actor("Leela",2.1)
      : entry.vendor.id === "brinewick-vendor" ? await actor("Cleric",1.95,"alchemist")
      : await actor(index === 1 ? "Knight" : "Cleric", index === 1 ? 2 : 1.85, index === 1 ? "warrior" : undefined);
    if (disposed) { mounted.dispose(); return; }
    entry.actor = mounted; entry.root.add(mounted.root); mounted.play("Idle");
  })).then(() => { document.body.dataset.vendorsState = "ready"; });
  const regionalHostsReady = Promise.all(regionalHosts.map(async entry => {
    const mounted = entry.spot.id === "suture-inn" ? await actor("Leela",1.8) : await actor("Cleric",1.9,"mage");
    if (disposed) { mounted.dispose(); return; }
    entry.actor = mounted; entry.root.add(mounted.root); mounted.play("Idle");
  }));
  const flightMastersReady = Promise.all(flightMasters.map(async entry => {
    const mounted = await actor("Cleric",1.95,"artificer");
    if (disposed) { mounted.dispose(); return; }
    entry.actor=mounted; entry.root.add(mounted.root); mounted.play("Idle");
  }));
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
  const creaturesReady = Promise.all(initial.threats.map(async threat => {
    const look = appearances[threat.id.startsWith("pond-turtle") ? "pond-turtle" : threat.id]; if(!look) throw Error(`No appearance for ${threat.id}`);
    const creature = (threat.id.startsWith("pond-turtle") || threat.id === "lake-dreadnought") ? mechanicalTurtle(threat.id === "lake-dreadnought") : look.metalColor !== undefined ? await robotCritter(look.height, look.metalColor) : await actor(look.model, look.height, undefined, look.materialFill);
    if (disposed) { creature.dispose(); return; }
    if (look.tint !== undefined) creature.model.traverse(object => {
      if (!(object instanceof Mesh)) return;
      const tint = (source: Material) => {
        if (!(source instanceof MeshStandardMaterial)) return source;
        const material = source.clone(); material.color.lerp(new Color(look.tint!),.6);
        material.metalness = Math.max(material.metalness,.28); material.roughness = .7;
        if (look.glow !== undefined) { material.emissive.setHex(look.glow); material.emissiveIntensity = .3; }
        return material;
      };
      object.material = Array.isArray(object.material) ? object.material.map(tint) : tint(object.material);
    });
    const root = new Group(), body = creature.root;
    root.add(body); root.userData.threatId = threat.id; scene.add(root);
    creature.play(threat.health <= 0 ? "Death" : look.idle, threat.health > 0);
    const selection = selectionCircle(Math.max(.55, look.height * .6), 0xff3232);
    selection.rotation.x = -Math.PI/2; selection.position.y=0.06; root.add(selection);
    const glint = lootGlint(); glint.visible = false; root.add(glint);
    const beam = new Mesh(new CylinderGeometry(0.045,0.045,1,8),new MeshBasicMaterial({color:0xffbc71,transparent:true,opacity:0.85,depthWrite:false})); beam.visible=false;scene.add(beam);
    const ward = new Mesh(new SphereGeometry(1.05,20,12),new MeshBasicMaterial({color:0x80c6ff,transparent:true,opacity:0.2,depthWrite:false}));ward.position.y=look.height*0.55;ward.visible=false;root.add(ward);
    if (threat.id === "ritual-guardian") ward.scale.setScalar(1.45);
    rigs.set(threat.id,{root,body,actor:creature,flames:threat.id === "scout" ? createCinderFlames(creature,scene) : null,idle:look.idle,walk:look.walk,selection,attack:look.attack,hit:look.hit,lootGlint:glint,beam,beamTime:0,ward,fireballs:new Map(),height:look.height,
      health:threat.health,sequence:threat.actionSequence,attackTime:0,phase:threat.phase,hitTime:0,lootable:false});
  })).then(()=>{document.body.dataset.boarRigState="ready";document.body.dataset.creatureRigState="ready";});
  const signsReady = buildWorldSigns(terrain, (root, id, name) => {
    hoverTargets.push({ root, pick: { kind: "place", id }, name, anchor: root.position.clone().add(new Vector3(0, 2, 0)) });
  });
  const natureReady = buildFrostwood(terrain, thicket, innPosition, (root,id,name) => {
    hoverTargets.push({ root, pick: {kind:"place",id}, name, anchor: root.position.clone().add(new Vector3(0,2,0)) });
  }).then(update=>{updateScenery=update;document.body.dataset.environmentState="ready";});
  const caveReady = buildHollowdeep(terrain);
  const sceneryCutaway = createSceneryCutaway();
  const telegraphs = createGroundTelegraphs(scene, canvas);
  const combatEffects = createCombatEffects(scene);
  let combatPreview: CombatPreview | null = null;
  const aggroRanges = createAggroRanges(scene, canvas);
  const combatGrid = createCombatGrid(scene, canvas);
  let moveAiming = false;
  let moveRoute: readonly Position[] = [];
  const movementPreview = createMovementPreview((destination, via) => previewBait?.(destination, via) ?? Promise.resolve(null));
  let shownMovementPreview: MovementPlanPreview | null = null;
  function showMovementPreview(next: MovementPlanPreview | null): void {
    const previous = shownMovementPreview;
    if (previous === next || previous && next && previous.forecast === next.forecast && previous.pending === next.pending
      && previous.destination.x === next.destination.x && previous.destination.z === next.destination.z && previous.candidate === next.candidate && JSON.stringify(previous.via) === JSON.stringify(next.via)) return;
    shownMovementPreview = next;
    onMovementPreview?.(next);
  }
  const ready = Promise.all([yardGuards.ready, bellrunners.ready, flightMastersReady, knightReady, merchantReady, innkeeperReady, bankerReady, vendorsReady, regionalHostsReady, creaturesReady, coresReady, signsReady, natureReady, caveReady, chestReady]).then(async()=>{
    if(disposed)return;
    lighting.collectLamps();
    await captureMinimap(renderer, terrain, minimap);
    if(disposed)return;
    sceneryCutaway.install(terrain, [mara, rowan, elian, chestRoot, coreRoot, ...vendorActors.map(entry => entry.root), ...regionalHosts.map(entry => entry.root), ...flightMasters.map(entry => entry.root)]);
    atmosphere.attach();
    const lake = terrain.getObjectByName('meadow-lake');
    if (lake instanceof Reflector) {
      // Reflections use linear output and therefore a different shader variant
      // from the screen. Prepare it without blocking the first playable frame.
      const previousTarget = renderer.getRenderTarget();
      try {
        renderer.setRenderTarget(lake.getRenderTarget());
        await renderer.compileAsync(scene, camera);
      } finally { renderer.setRenderTarget(previousTarget); }
    }
    if(disposed)return;
    await renderer.compileAsync(scene, camera);
  });
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
    // During route editing the character is the start tile's click target;
    // projecting through its body would select ground farther behind it.
    if (moveAiming && moveRoute.length && player.visible && knight && raycaster.intersectObject(knight.model, true).length) {
      return { ...hoverSnapshot.player.position };
    }
    const hit = raycaster.intersectObjects(groundSurfaces, false)[0];
    let hitPoint = hit?.point;
    const denominator = raycaster.ray.direction.y;
    if (Math.abs(denominator) >= 1e-6) {
      const waterHeight = hoverSnapshot && isSubmerged(hoverSnapshot.player.position) ? hoverSnapshot.player.position.y : lakeSurface.waterLevel;
      const distance = (waterHeight - raycaster.ray.origin.y) / denominator;
      if (distance >= 0 && (!hit || distance < hit.distance)) {
        const lakePoint = raycaster.ray.origin.clone().addScaledVector(raycaster.ray.direction, distance);
        if (lakeWaterAt(lakePoint.x, lakePoint.z) !== null && terrainHeight(lakePoint.x, lakePoint.z) < lakeSurface.waterLevel) hitPoint = lakePoint;
      }
    }
    if (!hitPoint) return null;
    const cellX = combatCell(hitPoint.x), cellZ = combatCell(hitPoint.z);
    return { x: cellX, y: hoverSnapshot ? movementHeight(cellX, cellZ, hoverSnapshot.player.position) : terrainHeight(cellX, cellZ), z: cellZ };
  };
  const pick = (x: number, y: number): WorldPick | null => {
    const rect = canvas.getBoundingClientRect();
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) return null;
    point.set((x - rect.left) / rect.width * 2 - 1, -(y - rect.top) / rect.height * 2 + 1);
    raycaster.setFromCamera(point, camera);
    const targets: Object3D[] = [...rigs.values()].filter(rig => rig.root.visible)
      .flatMap(rig => [rig.body, rig.lootGlint].filter(object => object.visible));
    for (const [, rig] of remotePlayers.entries()) if (rig.root.visible && rig.model) targets.push(rig.model);
    if (playerSelection && player.visible && knight) targets.push(knight.model);
    targets.push(...hoverTargets.filter(target => target.root.visible).map(target => target.root));
    for (const hit of raycaster.intersectObjects(targets, true)) {
      let object: Object3D | null = hit.object;
      while (object) {
        if (typeof object.userData.threatId === "string") return { kind: "threat", id: object.userData.threatId };
        if (typeof object.userData.playerId === "string") return { kind: "player", id: object.userData.playerId };
        const target = hoverTargets.find(target => target.root === object);
        if (target) return target.pick;
        object = object.parent;
      }
    }
    return null;
  };
  const pickReturnSpot = (clientX: number, clientY: number): Position | null => {
    if (!returnPlan || returnSpotMeshes.length === 0) return null;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0 || clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return null;
    point.set((clientX - rect.left) / rect.width * 2 - 1, -(clientY - rect.top) / rect.height * 2 + 1);
    raycaster.setFromCamera(point, camera);
    const hit = raycaster.intersectObjects(returnSpotMeshes, false)[0];
    if (hit?.object.userData.returnSpot) return hit.object.userData.returnSpot as Position;
    let nearest: Position | null = null; let nearestDistance = 24;
    for (const mesh of returnSpotMeshes) {
      const projected = mesh.position.clone().project(camera);
      const sx = rect.left + (projected.x + 1) * rect.width / 2;
      const sy = rect.top + (1 - projected.y) * rect.height / 2;
      const distance = Math.hypot(clientX - sx, clientY - sy);
      if (distance < nearestDistance) { nearestDistance = distance; nearest = mesh.userData.returnSpot as Position; }
    }
    return nearest;
  };
  const updateHover = () => {
    if (!hoverPointer || document.elementFromPoint(hoverPointer.x, hoverPointer.y) !== canvas) { clearHover(); return; }
    const hit = pick(hoverPointer.x, hoverPointer.y);
    const target = hit && hoverTargets.find(target => target.pick.kind === hit.kind && target.pick.id === hit.id);
    tooltip.hidden = !target;
    canvas.style.cursor = hit?.kind === "resource" ? gatherCursor : (hit?.kind === "npc" || hit?.kind === "player") ? "pointer" : "";
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
    canvas, minimap, ready, forward, pick, pickGround, clearHover,
    hover(x, y) { hoverPointer = { x, y }; },
    updatePlayers(players) { if (!disposed) otherPlayers = players; },
    updateChat(messages, selfId) { if (!disposed) chatBubbles.update(messages, selfId); },
    orbit(dx, dy) { yaw -= dx * 0.005; pitch = Math.max(-1.2, Math.min(1.45, pitch + dy * 0.004)); },
    zoom(delta) { distance = Math.max(0, Math.min(21, (distance + 1) * Math.exp(delta * 0.001) - 1)); },
    setThreatNameplateVisible(id, visible) { overheadNames.suppress(`threat:${id}`, visible); },
    setAggroRangesVisible(visible) { aggroRanges.setVisible("direct", visible); },
    setHelpRangesVisible(visible) { aggroRanges.setVisible("help", visible); },
    setMoveAiming(active) { moveAiming = active; if (!active) { movementPreview.clear(); showMovementPreview(null); } },
    setMoveRoute(route) { moveRoute = route; },
    canMoveTo(destination) { return combatGrid.accepts(destination); },
    setCombatPreview(preview) { combatPreview = preview; },
    setReturnPreview(plan) {
      returnPlan = plan;
      const key = plan ? JSON.stringify({ destination: plan.destination, spots: plan.spots }) : "";
      if (key !== returnPlanKey) { returnPlanKey = key; rebuildReturnSpots(plan); }
      returnGhostTarget = plan ? 1 : 0;
      returnPreviewGroup.visible = Boolean(plan);
      canvas.dataset.returnPreview = plan ? "active" : "hidden";
    },
    pickReturnSpot,
    setSelectedUnit(selection) { selectedUnit = selection; },
    setPartyMembers(ids) { partyMembers = new Set(ids); },
    setPartyPings(pings) { partyPings.update(pings); },
    projectThreat(id) {
      const rig = rigs.get(id); if (!rig || !rig.root.visible) return null;
      const head = rig.root.position.clone().add(new Vector3(0, rig.height + rig.body.position.y + 0.25, 0)).project(camera);
      const feet = rig.root.position.clone().project(camera);
      if (head.z < -1 || head.z > 1 || Math.abs(head.x) > 1 || Math.abs(head.y) > 1) return null;
      return { x: (head.x + 1) * host.clientWidth / 2, y: (1 - head.y) * host.clientHeight / 2, feetY: (1 - feet.y) * host.clientHeight / 2 };
    },
    render(snapshot, delta, localPlayer = snapshot.player, serverTime, connectionRevision = 0, worldTimeMillis = Date.now(), rainIntensity) {
      if (disposed) return;
      if (lastConnectionRevision !== connectionRevision) {
        interpolation = createSnapshotInterpolation();
        lastHealth = localPlayer.health; lastAttack = localPlayer.attackSequence;
        swimmingWake.clear();
        combatPreview = null; movementPreview.clear(); showMovementPreview(null);
        lastConnectionRevision = connectionRevision;
      }
      hoverSnapshot = snapshot;
      elapsed += delta;
      volcano.update(elapsed);
      let visiblePlayers = otherPlayers;
      if (serverTime !== undefined) {
        interpolation.push(snapshot, otherPlayers, serverTime);
        const visible = interpolation.sample(delta);
        visiblePlayers = visible.players;
        snapshot = {...snapshot, threats: visible.threats, player: localPlayer};
      } else snapshot = {...snapshot, player: localPlayer};
      const depth = isSubmerged(localPlayer.position) ? localPlayer.position.y : null;
      if (depth !== selectionDepth) {
        selectionDepth = depth;
        selectionHeight = depth === null ? combatSurfaceHeight : movementHeightSampler(localPlayer.position);
      }
      yardGuards.update(worldTimeMillis,delta);
      bellrunners.update(localPlayer, visiblePlayers, elapsed);
      remotePlayers.update(visiblePlayers);
      remotePlayers.render(delta);
      for (const [id,rig] of remotePlayers.entries()) {
        const remote=visiblePlayers.find(entry=>entry.id===id);
        if (remote?.player.flight) rig.root.position.y += bellrunners.riderLift(remote.player);
      }
      document.body.dataset.rigRemoteAnimations = JSON.stringify(Array.from(remotePlayers.entries(), ([id, rig]) => ({ id, animation: rig.root.userData.animation, time: rig.root.userData.animationTime })));
      const displayedPosition = returnPlan?.destination ?? localPlayer.position;
      player.position.set(displayedPosition.x, displayedPosition.y + bellrunners.riderLift(localPlayer), displayedPosition.z);
      returnGhostBlend += (returnGhostTarget - returnGhostBlend) * (1 - Math.exp(-delta / .7));
      if (returnGhostTarget > 0) {
        // Models can finish loading after the transition starts, so rescan at
        // a low cadence for newcomers instead of traversing every actor every
        // render frame.
        if (elapsed - lastGhostScan > .5) {
          ghostRoot(player);
          for (const rig of rigs.values()) ghostRoot(rig.root);
          for (const [, rig] of remotePlayers.entries()) ghostRoot(rig.root);
          lastGhostScan = elapsed;
        }
        updateGhostOpacity(returnGhostBlend);
      } else if (returnGhostBlend > .001) {
        updateGhostOpacity(returnGhostBlend);
      } else if (ghostRecords.size > 0) {
        returnGhostBlend = 0;
        restoreGhosts();
      }
      returnPreviewGroup.visible = Boolean(returnPlan);
      for (const mesh of returnSpotMeshes) {
        const selected = mesh.scale.x > 1;
        mesh.material.opacity = (selected ? .84 : .56) + Math.sin(elapsed * 2.2) * (selected ? .08 : .04);
      }
      const swimmers = [{ id: 'self', position: localPlayer.position, active: localPlayer.health > 0 && localPlayer.moving && isSwimming(localPlayer.position) && localPlayer.position.y >= supportHeight(localPlayer.position.x, localPlayer.position.z) - .15 },
        ...visiblePlayers.map(other => ({ id: other.id, position: other.player.position, active: other.player.health > 0 && other.player.moving && isSwimming(other.player.position) && other.player.position.y >= supportHeight(other.player.position.x, other.player.position.z) - .15 }))];
      swimmingWake.update(delta, swimmers, worldTimeMillis);
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
              knight.play(snapshot.player.flight ? "Idle" : isSwimming(snapshot.player.position) ? (snapshot.player.moving ? "Swim_Fwd_Loop" : "Swim_Idle_Loop") : !snapshot.player.grounded ? playerAnimation.jump : snapshot.player.moving ? "Run" : "Idle");
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
      for (const entry of flightMasters) {
        if (snapshot.flightMasterOpen === entry.stop.id) entry.root.rotation.y = Math.atan2(position.x-entry.root.position.x,position.z-entry.root.position.z);
        entry.actor?.mixer.update(delta);
      }
      for (const entry of regionalHosts) {
        if (snapshot.restSpot === entry.spot.id) entry.root.rotation.y = Math.atan2(position.x-entry.root.position.x,position.z-entry.root.position.z);
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
        rig.body.visible = threat.health > 0 ? threat.active : threat.corpseVisible;
        const water = (threat.id.startsWith("pond-turtle") || threat.id === "lake-dreadnought") ? lakeWaterAt(threat.position.x, threat.position.z) : null;
        rig.root.position.set(threat.position.x, water === null ? threat.position.y : Math.max(threat.position.y, water - .25), threat.position.z);

        rig.lootable = snapshot.loot.some(item => item.sourceId === threat.id && item.available);
        rig.root.visible = rig.body.visible || rig.lootable;
        rig.lootGlint.visible = rig.lootable;
        rig.lootGlint.position.set(0, 0.8 + 0.08 * Math.sin(elapsed * 2), 0);
        rig.lootGlint.scale.setScalar(0.55 + 0.08 * Math.sin(elapsed * 3));
        rig.lootGlint.material.opacity = 0.75 + 0.2 * Math.sin(elapsed * 2);
        rig.selection.visible = selectedUnit?.kind === "enemy" && selectedUnit.id === threat.id && rig.body.visible;
        const relationColor = threat.disposition === "hostile" || threat.aggro ? 0xff3232 : 0xf5df38;
        rig.selection.material.color.setHex(relationColor);
        if (threat.health > 0) rig.root.rotation.y = Math.atan2(threat.facing.x, threat.facing.z);
        if (rig.root.visible && rig.selection.visible) conformToTerrain(rig.selection, 0.06, selectionHeight);
        const preparation = updateThreatAnimation(rig, threat, delta);
        rig.body.position.y = threat.health > 0 ? appearances[threat.id]?.lift ?? (threat.id === "cave-bat" ? 1.1 : threat.id.startsWith("meadow-bird") ? 4.2 + Math.sin(elapsed * 2.1 + threat.id.length) * .25 : 0) : 0;
        if (threat.id === "scout" && threat.health <= 0) {
          const death = rig.actor.action!;
          const fall = Math.min(1, (death.time + delta) / death.getClip().duration);
          rig.body.position.y = appearances.scout!.lift! * (1 - fall * fall);
        }
        rig.body.rotation.x = -0.12*preparation;
        rig.body.position.z = -0.18*preparation;
        rig.ward.position.y = rig.height*0.55 + rig.body.position.y;
        rig.ward.visible = threat.block > 0;
        rig.beamTime=Math.max(0,rig.beamTime-delta);rig.beam.visible=rig.beamTime>0;
        if (rig.beam.visible) {
          const mouth=new Vector3(threat.position.x,threat.position.y+rig.body.position.y+rig.height*0.65,threat.position.z);
          const recipient = visiblePlayers.find(other => other.id === threat.targetPlayerId)?.player.position
            ?? (threat.targetPlayerId === playerSelection?.selfId ? position : threat.targetPosition);
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
          ball.position.set(projectile.position.x,
            (projectile.origin.y+rig.body.position.y+rig.height*0.65)*(1-progress)+(projectile.position.y+1.2)*progress+Math.sin(progress*Math.PI)*0.35,
            projectile.position.z);
          ball.scale.setScalar(1+Math.sin(elapsed*28+projectile.id)*0.12);
        }
        rig.actor.mixer.update(delta);
        rig.flames?.update(elapsed, delta, threat.health > 0 && threat.active, threat.moving);
        if (threat.id === "ritual-guardian") {
          canvas.dataset.foremanCorpseVisible = String(threat.corpseVisible);
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
      // Keep the player at the actual center of the canvas. The HUD overlays
      // the world and no longer shifts the projection with a view offset.
      cameraTarget.copy(position);
      const facing = forward();
      if (snapshot.combat.phase !== "preparation") combatPreview = null;

      combatEffects.update(snapshot.combat, elapsed, delta, connectionRevision);
      aggroRanges.update(snapshot);
      const hoveredTile = moveAiming && hoverPointer ? pickGround(hoverPointer.x, hoverPointer.y) : null;
      combatGrid.update(snapshot, moveAiming, hoveredTile, otherPlayers.map(p => p.player.position), moveRoute);
      const candidate = hoveredTile && combatGrid.accepts(hoveredTile) ? hoveredTile : null;
      const destination = moveAiming ? candidate ?? moveRoute.at(-1) ?? null : null;
      const via = candidate ? moveRoute : moveRoute.slice(0, -1);
      movementPreview.update(hoverSnapshot, destination, via);
      const forecast = movementPreview.forecast;
      const choosingDestination = destination && snapshot.combat.phase === "preparation" && !snapshot.combat.ready;
      const selectedMovement = snapshot.combat.queued.find(move => move.action === "bait" && move.status === "pending");
      const warningForecast = choosingDestination ? forecast : snapshot.combat.forecast;
      const warningDestination = choosingDestination ? destination : selectedMovement?.destination ?? null;
      combatGrid.warnDestination(snapshot.combat.phase === "preparation" && warningForecast && movementRetreat(snapshot, warningForecast) ? warningDestination : null);
      const planPreview = combatPreview ?? (selectedMovement ? { kind: "move" as const, queueId: selectedMovement.id } : null);
      telegraphs.update(forecast ? { player: snapshot.player, threats: snapshot.threats, combat: { ...snapshot.combat, forecast } } : snapshot,
        choosingDestination ? forecast ? { kind: "destination", route: [...via, destination] } : null : planPreview);
      showMovementPreview(choosingDestination ? { destination, via, candidate: Boolean(candidate), pending: movementPreview.pending, forecast } : null);
      const previewData = JSON.stringify(choosingDestination ? { destination, via, candidate: Boolean(candidate), pending: movementPreview.pending, forecast } : null);
      if (canvas.dataset.movePreview !== previewData) canvas.dataset.movePreview = previewData;
      // Transition the look target toward eye level as the boom reaches the
      // player. This gives a usable first-person view without a zero-distance
      // lookAt singularity or the character model covering the camera.
      const firstPersonBlend = Math.max(0, Math.min(1, (1.8 - distance) / 1.2));
      const submerged = isSubmerged(snapshot.player.position);
      const orbitDistance = submerged ? Math.min(distance, 6) : distance;
      const aimHeight = 1.1 + firstPersonBlend * .55;
      const target = { x: cameraTarget.x, y: cameraTarget.y + aimHeight, z: cameraTarget.z };
      if (distance === 0) {
        camera.position.set(target.x, target.y, target.z);
      } else {
        camera.position.set(target.x - facing.x * Math.cos(pitch) * orbitDistance, target.y + Math.sin(pitch) * orbitDistance, target.z - facing.z * Math.cos(pitch) * orbitDistance);
      }
      if (submerged) camera.position.y = Math.min(camera.position.y, lakeSurface.waterLevel - .12);
      const requiredLift = distance === 0 ? 0 : terrainCameraLift(target, camera.position);
      // Raise immediately when the sightline enters terrain; ease only while
      // returning to a lower orbit so the camera never clips through a hill.
      cameraTerrainLift = distance === 0 ? 0 : delta === 0 ? requiredLift : Math.max(requiredLift, cameraTerrainLift + (requiredLift - cameraTerrainLift) * (1 - Math.exp(-delta * 8)));
      camera.position.y += cameraTerrainLift;
      updateScenery?.(coolingRestored, shiftEnded, worldTimeMillis);
      if (distance === 0) {
        camera.lookAt(target.x + facing.x * Math.cos(pitch), target.y - Math.sin(pitch), target.z + facing.z * Math.cos(pitch));
      } else {
        const collisionLift = terrainCameraLift(target, camera.position);
        if (collisionLift > 0) camera.position.y += collisionLift;
        camera.lookAt(target.x, target.y, target.z);
      }
      sceneryCutaway.update(camera.position, snapshot.player.position, aimHeight, combatGrid.revealTiles, delta, firstPersonBlend < .8);
      player.visible = firstPersonBlend < .8 && Math.hypot(camera.position.x-target.x, camera.position.y-target.y, camera.position.z-target.z) > 1.8;
      const selectedPlayer = selectedUnit?.kind === "player" ? selectedUnit.id : null;
      const friendlyRoot = [...remotePlayers.entries()].find(([id]) => id === selectedPlayer)?.[1].root;
      friendlySelection.visible = Boolean(friendlyRoot?.visible);
      if (friendlyRoot && friendlySelection.visible) { friendlySelection.position.copy(friendlyRoot.position); conformToTerrain(friendlySelection, .06, combatSurfaceHeight); }
      const interactingNpc = snapshot.selectedGuard ? yardGuards.guards.find(entry=>entry.guard.id===snapshot.selectedGuard)?.root : snapshot.flightMasterOpen ? flightMasters.find(entry=>entry.stop.id===snapshot.flightMasterOpen)?.root : snapshot.shopOpen ? mara : snapshot.bankOpen ? elian : snapshot.innOpen ? regionalHosts.find(entry => entry.spot.id === snapshot.restSpot)?.root ?? rowan
        : vendorActors.find(entry => entry.vendor.id === snapshot.vendorOpen)?.root;
      npcSelection.visible = Boolean(interactingNpc);
      if (interactingNpc) { npcSelection.position.copy(interactingNpc.position); conformToTerrain(npcSelection, .06, combatSurfaceHeight); }
      canvas.dataset.selectedPlayer = selectedPlayer ?? "";
      lighting.update(worldTimeMillis, snapshot.player.position, camera, rainIntensity);
      const far = lakeWaterAt(camera.position.x, camera.position.z) !== null && camera.position.y < lakeSurface.waterLevel - .035 ? 25 : 210;
      if (camera.far !== far) { camera.far = far; camera.updateProjectionMatrix(); }
      underwater.update(elapsed, camera.position, snapshot.player);
      atmosphere.update(worldTimeMillis * 0.001, delta, snapshot.player.position, rainIntensity);
      renderer.render(scene, camera);
      updateHover();
      overheadNames.begin();
      for (const {vendor, root} of vendorActors) overheadNames.show(`npc:${vendor.id}`, `${vendor.name} · ${vendor.trade}`, root, 2.35, "friendly", true, null, onNpcInteract ? () => onNpcInteract(vendor.id) : undefined);
      for (const {guard,root} of yardGuards.guards) overheadNames.show(`npc:${guard.id}`, `${guard.name} · Yard guard`, root, 2.45, "friendly", true, null, onNpcInteract ? () => onNpcInteract(guard.id) : undefined);
      for (const {stop,root} of flightMasters) overheadNames.show(`npc:${flightMasterId(stop.id)}`, `${stop.master} · Flight master`, root, 2.35, "friendly", true, null, onNpcInteract ? () => onNpcInteract(flightMasterId(stop.id)) : undefined);
      for (const {spot,root} of regionalHosts) overheadNames.show(`npc:${spot.id}`, `${spot.name} · Rest`, root, 2.35, "friendly", true, null, onNpcInteract ? () => onNpcInteract(spot.id) : undefined);
      overheadNames.show("npc:mara", "Mara", mara, 2.35, "friendly", true, npcQuestMarker(snapshot.quests,"mara"));
      overheadNames.show("npc:elian", "Elian · Bank", elian, 2.35, "friendly", true);
      overheadNames.show("npc:rowan", "Rowan", rowan, 2.35, "friendly", true, npcQuestMarker(snapshot.quests,"inn"));
      if (playerSelection?.showSelfName?.()) overheadNames.show(`player:${playerSelection.selfId}`, playerSelection.selfName, player, 2.35, "player", snapshot.player.health > 0, null, () => playerSelection.onSelect(playerSelection.selfId), {
        health: snapshot.player.health, maximumHealth: snapshot.player.maximumHealth, selected: selectedPlayer === playerSelection.selfId, party: partyMembers.has(playerSelection.selfId),
        onContextMenu: (x, y) => playerSelection.onContextMenu?.(playerSelection.selfId, x, y),
      });
      for (const [id, rig] of remotePlayers.entries()) {
        const view = visiblePlayers.find(other => other.id === id);
        overheadNames.show(`player:${id}`, rig.name, rig.root, 2.35, "player", rig.alive, null, playerSelection ? () => playerSelection.onSelect(id) : undefined, view && playerSelection ? {
          health: view.player.health, maximumHealth: view.player.maximumHealth, selected: selectedPlayer === id, party: partyMembers.has(id),
          onContextMenu: (x, y) => playerSelection.onContextMenu?.(id, x, y),
        } : undefined);
      }
      for (const threat of snapshot.threats) {
        const rig = rigs.get(threat.id);
        if (rig && (threat.disposition !== "neutral" || threat.critter !== true || threat.aggro || document.body.dataset.showNeutralCritterNames === "true")) overheadNames.show(`threat:${threat.id}`, threat.name, rig.root, rig.height + rig.body.position.y + 0.25, threat.aggro ? "hostile" : threat.disposition, threat.active && threat.health > 0);
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
      tooltip.remove(); movementPreview.clear(); showMovementPreview(null);
      remotePlayers.dispose();
      partyPings.dispose();
      yardGuards.dispose();
      bellrunners.dispose();
      swimmingWake.dispose();
      underwater.dispose();
      chatBubbles.dispose();
      combatText.dispose();
      overheadNames.dispose();
      aggroRanges.dispose();
      combatGrid.dispose();
      photonChair.dispose();
      telegraphs.dispose();
      combatEffects.dispose();
      lighting.dispose();
      atmosphere.dispose();
      vendorActors.forEach(entry => entry.actor?.dispose());
      regionalHosts.forEach(entry => entry.actor?.dispose());
      flightMasters.forEach(entry => entry.actor?.dispose());
      knight?.dispose(); merchant?.dispose(); innkeeper?.dispose(); banker?.dispose();
      for (const rig of rigs.values()) { rig.flames?.dispose(); rig.actor.dispose(); }
      restoreGhosts();
      for (const mesh of returnSpotMeshes) mesh.material.dispose();
      returnSpotMeshes.length = 0;
      returnSpotGeometry.dispose();
      returnPreviewGroup.removeFromParent();
      disposeObjects(scene);
      scene.clear();
      renderer.dispose();
      canvas.remove();
    },
  };
}
