import { combatSurfaceHeight, conformToTerrain } from "./terrain-geometry.js";
import { BufferGeometry, CanvasTexture, CircleGeometry, Float32BufferAttribute, Group, Mesh, MeshBasicMaterial, Object3D, PlaneGeometry, RingGeometry, Sprite, SpriteMaterial } from "three";
import { combatCell, COMBAT_CELL_SIZE } from "../game/combat-grid.js";
import type { AdventureSnapshot, Position } from "../game/adventure-types.js";

export type CombatPreview = { readonly kind: "enemy"; readonly threatId: string }
  | { readonly kind: "move"; readonly queueId: number };

const COLOR = 0xc4d4d7;
const GROUND_HEIGHT = 0.1;

export function createGroundTelegraphs(scene: Object3D, canvas: Pick<HTMLCanvasElement, "dataset">) {
  const root = new Group();
  scene.add(root);
  canvas.dataset.telegraphs = "[]";
  const stroke = new MeshBasicMaterial({ color: COLOR, transparent: true, opacity: 0.82, depthWrite: false });
  const enemyStroke = new MeshBasicMaterial({ color: 0xf08b72, transparent: true, opacity: .9, depthWrite: false });
  const playerStroke = new MeshBasicMaterial({ color: 0x84edb1, transparent: true, opacity: .95, depthWrite: false });
  const enemyTile = new MeshBasicMaterial({ color: 0xe64d55, transparent: true, opacity: .34, depthWrite: false });
  const playerTile = new MeshBasicMaterial({ color: 0x84edb1, transparent: true, opacity: .2, depthWrite: false });
  const fill = new MeshBasicMaterial({ color: COLOR, transparent: true, opacity: 0.09, depthWrite: false });
  const lineGeometry = new PlaneGeometry(1, 1, 1, 32);
  const tileGeometry = new PlaneGeometry(COMBAT_CELL_SIZE * .82, COMBAT_CELL_SIZE * .82);
  const ringGeometry = new RingGeometry(0.98, 1, 48);
  const landingGeometry = new RingGeometry(0.2, 0.26, 24);
  const areaGeometry = new CircleGeometry(1, 48);
  const arrowGeometry = new BufferGeometry();
  arrowGeometry.setAttribute("position", new Float32BufferAttribute([0, 0, 0.38, 0.17, 0, -0.16, -0.17, 0, -0.16], 3));
  let signature = "";
  let reference: Position | undefined;
  const stopLabels = new Map<number, SpriteMaterial>();
  function labelStop(position: Position, number: number) {
    let material = stopLabels.get(number);
    if (!material) {
      const label = document.createElement('canvas'); label.width = label.height = 64;
      const context = label.getContext('2d')!;
      context.fillStyle = '#111d19'; context.fillRect(6, 6, 52, 52);
      context.fillStyle = '#afffd0'; context.font = 'bold 40px sans-serif'; context.textAlign = 'center'; context.textBaseline = 'middle';
      context.fillText(String(number), 32, 34);
      material = new SpriteMaterial({ map: new CanvasTexture(label), transparent: true, depthTest: false, depthWrite: false });
      stopLabels.set(number, material);
    }
    const label = new Sprite(material); label.scale.setScalar(.8);
    label.position.set(position.x, combatSurfaceHeight(position.x, position.z, reference) + .65, position.z);
    label.renderOrder = 4; root.add(label);
  }
  function addGround(mesh: Mesh, lift: number) {
    mesh.geometry = mesh.geometry.clone(); root.add(mesh); conformToTerrain(mesh, lift, (x,z)=>combatSurfaceHeight(x,z,reference));
  }
  function clear() {
    for (const mesh of root.children) if (mesh instanceof Mesh) mesh.geometry.dispose();
    root.clear();
  }

  function line(from: Position, to: Position, width: number, material = stroke) {
    const length = Math.hypot(to.x - from.x, to.z - from.z);
    if (length < 0.005) return;
    const mesh = new Mesh(lineGeometry, material);
    mesh.rotation.set(-Math.PI / 2, 0, Math.atan2(to.x - from.x, to.z - from.z));
    mesh.scale.set(width, length, 1);
    mesh.position.set((from.x + to.x) / 2, GROUND_HEIGHT, (from.z + to.z) / 2);
    mesh.renderOrder = 3;
    addGround(mesh, GROUND_HEIGHT);
  }

  function marker(position: Position, radius: number, area: boolean, material = stroke) {
    const edge = new Mesh(area ? ringGeometry : landingGeometry, material);
    edge.rotation.x = -Math.PI / 2;
    edge.position.set(position.x, GROUND_HEIGHT + 0.01, position.z);
    edge.scale.setScalar(area ? radius : 1);
    edge.renderOrder = 3;
    addGround(edge, GROUND_HEIGHT + 0.01);
    if (area) {
      const disk = new Mesh(areaGeometry, fill);
      disk.rotation.x = -Math.PI / 2;
      disk.position.set(position.x, GROUND_HEIGHT, position.z);
      disk.scale.setScalar(radius);
      disk.renderOrder = 2;
      addGround(disk, GROUND_HEIGHT);
    }
  }
  function routeTiles(points: readonly Position[], material: MeshBasicMaterial) {
    const seen = new Set<string>();
    for (const point of points) {
      const x = combatCell(point.x), z = combatCell(point.z), key = `${x},${z}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const tile = new Mesh(tileGeometry, material);
      tile.rotation.x = -Math.PI / 2;
      tile.position.set(x, GROUND_HEIGHT + .015, z);
      tile.renderOrder = 2;
      addGround(tile, GROUND_HEIGHT + .015);
    }
  }

  return {
    update(snapshot: Pick<AdventureSnapshot, "combat"> & Partial<Pick<AdventureSnapshot,"player">>, preview: CombatPreview | { readonly kind: "destination"; readonly route?: readonly Position[] } | null) {
      reference = snapshot.player?.position;
      const forecast = snapshot.combat.phase === "preparation" && preview ? snapshot.combat.forecast : null;
      const hasMove = preview?.kind === "move" && forecast?.paths.some(path => path.actorId === forecast.playerId && path.queueId === preview.queueId);
      const paths = forecast?.paths.filter(path => preview?.kind === "destination" || (preview?.kind === "enemy"
        ? path.actorId === preview.threatId
        : preview?.kind === "move" && hasMove && (path.actorId !== forecast.playerId || (path.queueId === preview.queueId && path.actorId === forecast.playerId)))) ?? [];
      const events = forecast?.events.filter(event => preview?.kind === "destination" ? event.kind === "hit" && event.targetId === forecast.playerId : (event.kind === "collision" || event.kind === "ignition" || event.kind === "interruption")
        && (preview?.kind === "enemy" ? event.sourceId === preview.threatId
          : preview?.kind === "move" && hasMove && event.queueId === preview.queueId && event.sourceId === forecast.playerId)) ?? [];
      const move = preview?.kind === 'move' ? snapshot.combat.queued.find(entry => entry.id === preview.queueId) : null;
      const stops = preview?.kind === 'destination' ? preview.route ?? [] : move?.destination ? [...move.via, move.destination] : [];
      const nextSignature = JSON.stringify({ preview, paths, events, reference, stops });
      if (nextSignature === signature) return;
      signature = nextSignature;
      clear();
      const diagnostics: object[] = [];
      const selection = preview?.kind === "enemy" ? { previewKind: "enemy", enemy: preview.threatId }
        : preview?.kind === "move" ? { previewKind: "move", queueId: preview.queueId } : { previewKind: "destination" };
      for (const path of paths) {
        const last = path.points.at(-1);
        if (!last) continue;
        const isPlayer = path.actorId === forecast?.playerId;
        const material = preview?.kind === "destination" || preview?.kind === "move" ? isPlayer ? playerStroke : enemyStroke : stroke;
        if (path.kind === "move") routeTiles(path.points, isPlayer ? playerTile : enemyTile);
        for (let index = 1; index < path.points.length; index++) line(path.points[index - 1]!, path.points[index]!, 0.065, material);
        const before = [...path.points].reverse().find(point => Math.hypot(last.x - point.x, last.z - point.z) > 0.1);
        if (before) {
          const arrow = new Mesh(arrowGeometry, material);
          arrow.position.set(last.x, GROUND_HEIGHT + 0.02, last.z);
          arrow.rotation.y = Math.atan2(last.x - before.x, last.z - before.z);
          arrow.renderOrder = 3;
          addGround(arrow, GROUND_HEIGHT + 0.02);
        }
        const area = path.kind === "attack" && path.radius > 0;
        if (area || path.kind !== "attack") marker(last, area ? path.radius : 0.26, area, material);
        diagnostics.push({ ...selection, actorId: path.actorId, ability: path.action, beat: path.beat,
          kind: area ? "area" : path.kind === "attack" ? "target" : "movement",
          path: path.points, position: last, x: last.x, z: last.z, radius: area ? path.radius : 0 });
      }
      for (const event of events) {
        if (event.kind === "ignition") marker(event.position, event.radius, true);
        else {
          const { x, y, z } = event.position;
          line({ x: x - 0.23, y, z: z - 0.23 }, { x: x + 0.23, y, z: z + 0.23 }, 0.08);
          line({ x: x - 0.23, y, z: z + 0.23 }, { x: x + 0.23, y, z: z - 0.23 }, 0.08);
        }
        diagnostics.push({ ...selection, kind: event.kind === "ignition" ? "area" : "target", event: event.kind,
          position: event.position, radius: event.radius, targetId: event.targetId, damage: event.damage, sourceId: event.sourceId });
      }
      if (stops.length > 1 && forecast) stops.forEach((stop, index) => {
        labelStop(stop, index + 1);
        diagnostics.push({ ...selection, kind: 'stop', order: index + 1, position: stop });
      });
      canvas.dataset.telegraphs = JSON.stringify(diagnostics);
    },
    dispose() {
      clear(); root.removeFromParent();
      lineGeometry.dispose(); ringGeometry.dispose(); landingGeometry.dispose(); areaGeometry.dispose(); arrowGeometry.dispose();
      tileGeometry.dispose(); stroke.dispose(); enemyStroke.dispose(); playerStroke.dispose(); enemyTile.dispose(); playerTile.dispose(); fill.dispose();
      for (const material of stopLabels.values()) { material.map?.dispose(); material.dispose(); }
      canvas.dataset.telegraphs = "[]";
    },
  };
}
