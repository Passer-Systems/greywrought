import { combatSurfaceHeight, conformToTerrain } from "./terrain-geometry.js";
import { CanvasTexture, CircleGeometry, Group, Mesh, MeshBasicMaterial, Object3D, PlaneGeometry, RingGeometry, Sprite, SpriteMaterial } from "three";
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
  const enemyStroke = new MeshBasicMaterial({ color: 0xef6570, transparent: true, opacity: .9, depthWrite: false });
  const pursuitStroke = new MeshBasicMaterial({ color: 0xc4797b, transparent: true, opacity: .55, depthWrite: false });
  const playerStroke = new MeshBasicMaterial({ color: 0xd6efff, transparent: true, opacity: .98, depthWrite: false });
  const attackStroke = new MeshBasicMaterial({ color: 0xffcb69, transparent: true, opacity: .98, depthWrite: false });
  const dangerFill = new MeshBasicMaterial({ color: 0xe64d55, transparent: true, opacity: .15, depthWrite: false });
  const fill = new MeshBasicMaterial({ color: COLOR, transparent: true, opacity: 0.09, depthWrite: false });
  const lineGeometry = new PlaneGeometry(1, 1, 1, 32);
  const ringGeometry = new RingGeometry(0.987, 1, 48);
  const landingGeometry = new RingGeometry(0.2, 0.26, 24);
  const areaGeometry = new CircleGeometry(1, 48);
  let signature = "";
  let reference: Position | undefined;
  const stopLabels = new Map<number, SpriteMaterial>();
  function labelStop(position: Position, number: number) {
    let material = stopLabels.get(number);
    if (!material) {
      const label = document.createElement('canvas'); label.width = label.height = 64;
      const context = label.getContext('2d')!;
      context.fillStyle = '#15212b'; context.fillRect(6, 6, 52, 52);
      context.fillStyle = '#e0f3ff'; context.font = 'bold 40px sans-serif'; context.textAlign = 'center'; context.textBaseline = 'middle';
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

  function marker(position: Position, radius: number, area: boolean, material = stroke, areaFill: MeshBasicMaterial | null = fill) {
    const edge = new Mesh(area ? ringGeometry : landingGeometry, material);
    edge.rotation.x = -Math.PI / 2;
    edge.position.set(position.x, GROUND_HEIGHT + 0.01, position.z);
    edge.scale.setScalar(area ? radius : 1);
    edge.renderOrder = 3;
    addGround(edge, GROUND_HEIGHT + 0.01);
    if (area && areaFill) {
      const disk = new Mesh(areaGeometry, areaFill);
      disk.rotation.x = -Math.PI / 2;
      disk.position.set(position.x, GROUND_HEIGHT, position.z);
      disk.scale.setScalar(radius);
      disk.renderOrder = 2;
      addGround(disk, GROUND_HEIGHT);
    }
  }
  function arrow(position: Position, direction: Position, material: MeshBasicMaterial, size = .24) {
    const back = { ...position, x: position.x - direction.x * size, z: position.z - direction.z * size };
    line({ ...back, x: back.x - direction.z * size * .65, z: back.z + direction.x * size * .65 }, position, .07, material);
    line({ ...back, x: back.x + direction.z * size * .65, z: back.z - direction.x * size * .65 }, position, .07, material);
  }

  function playerRoute(points: readonly Position[]) {
    const legs = points.slice(1).map((to, index) => {
      const from = points[index]!, length = Math.hypot(to.x - from.x, to.z - from.z);
      const direction = { x: length ? (to.x - from.x) / length : 0, y: 0, z: length ? (to.z - from.z) / length : 0 };
      return { order: index + 1, from, to, length, direction };
    }).filter(leg => leg.length > .005);
    return legs.map((leg, index) => {
      // Collinear legs can retrace only part of an earlier leg, not just its endpoints.
      const overlaps = legs.flatMap((other, otherIndex) => {
        const dx = other.from.x - leg.from.x, dz = other.from.z - leg.from.z;
        if (Math.abs(dx * leg.direction.z - dz * leg.direction.x) > .01
          || Math.abs(other.direction.x * leg.direction.z - other.direction.z * leg.direction.x) > .001) return [];
        const start = dx * leg.direction.x + dz * leg.direction.z;
        const end = start + (other.to.x - other.from.x) * leg.direction.x + (other.to.z - other.from.z) * leg.direction.z;
        return Math.min(leg.length, Math.max(start, end)) - Math.max(0, Math.min(start, end)) > .01 ? [otherIndex] : [];
      });
      const lane = (overlaps.indexOf(index) - (overlaps.length - 1) / 2) * .34;
      const sign = leg.direction.x < -.001 || Math.abs(leg.direction.x) <= .001 && leg.direction.z < 0 ? -1 : 1;
      const offset = { x: -leg.direction.z * sign * lane, y: 0, z: leg.direction.x * sign * lane };
      const from = { ...leg.from, x: leg.from.x + offset.x, z: leg.from.z + offset.z };
      const to = { ...leg.to, x: leg.to.x + offset.x, z: leg.to.z + offset.z };
      line(from, to, .085, playerStroke);
      if (lane) { line(leg.from, from, .085, playerStroke); line(to, leg.to, .085, playerStroke); }
      const arrowCount = Math.max(1, Math.floor(leg.length / 1.5));
      const arrows = Array.from({ length: arrowCount }, (_, arrowIndex) => {
        const fraction = (arrowIndex + .65) / arrowCount;
        const position = { ...from, x: from.x + (to.x - from.x) * fraction, z: from.z + (to.z - from.z) * fraction };
        arrow(position, leg.direction, playerStroke);
        return { position, direction: leg.direction };
      });
      return { order: leg.order, from: leg.from, to: leg.to, offset, arrows };
    });
  }

  return {
    update(snapshot: Pick<AdventureSnapshot, "combat"> & Partial<Pick<AdventureSnapshot,"player">>, preview: CombatPreview | { readonly kind: "destination"; readonly route?: readonly Position[] } | null) {
      reference = snapshot.player?.position;
      const forecast = snapshot.combat.phase === "preparation" && preview ? snapshot.combat.forecast : null;
      const hasMove = preview?.kind === "move" && forecast?.paths.some(path => path.actorId === forecast.playerId && path.queueId === preview.queueId);
      const paths = forecast?.paths.filter(path => preview?.kind === "destination" || (preview?.kind === "enemy"
        ? path.actorId === preview.threatId
        : preview?.kind === "move" && hasMove)) ?? [];
      const events = forecast?.events.filter(event => preview?.kind === "destination" ? event.kind === "hit" && event.targetId === forecast.playerId : (event.kind === "collision" || event.kind === "ignition" || event.kind === "interruption")
        && (preview?.kind === "enemy" ? event.sourceId === preview.threatId
          : preview?.kind === "move" && hasMove && event.queueId === preview.queueId && event.sourceId === forecast.playerId)) ?? [];
      const move = preview?.kind === 'move' && hasMove ? snapshot.combat.queued.find(entry => entry.action === 'bait') : null;
      const stops = preview?.kind === 'destination' ? preview.route ?? [] : move?.destination ? [...move.via, move.destination] : [];
      const hits = forecast?.events.filter(event => event.kind === "hit" && event.targetId === forecast.playerId) ?? [];
      const nextSignature = JSON.stringify({ preview, paths, events, hits, reference, stops });
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
        const area = path.kind === "attack" && path.radius > 0;
        // Enemies commit one area attack per turn. Homing volleys and their
        // ignitions share a source id, so they cannot use this attribution.
        const attackHits = area ? hits.filter(event => event.sourceId === path.actorId && event.time >= path.beat) : [];
        const damage = attackHits.reduce((sum, event) => sum + event.damage, 0);
        const danger = damage > 0;
        const friendly = isPlayer || forecast?.actions.some(action => action.actorId === path.actorId);
        const material = friendly ? path.kind === 'attack' ? attackStroke : playerStroke : path.kind === "move" ? pursuitStroke : enemyStroke;
        const legs = isPlayer && path.kind === "move" ? playerRoute(path.points) : undefined;
        if (!legs) {
          for (let index = 1; index < path.points.length; index++) line(path.points[index - 1]!, path.points[index]!, .055, material);
          const before = [...path.points].reverse().find(point => Math.hypot(last.x - point.x, last.z - point.z) > .1);
          if (before) {
            const length = Math.hypot(last.x - before.x, last.z - before.z);
            arrow(last, { x: (last.x - before.x) / length, y: 0, z: (last.z - before.z) / length }, material);
          }
        }
        if (area || path.kind !== "attack") marker(last, area ? path.radius : .26, area, area && !danger ? stroke : material, area && danger ? dangerFill : null);
        diagnostics.push({ ...selection, actorId: path.actorId, ability: path.action, beat: path.beat,
          kind: area ? "area" : path.kind === "attack" ? "target" : "movement",
          path: path.points, position: last, x: last.x, z: last.z, radius: area ? path.radius : 0, color: material.color.getHex(),
          ...(area ? { danger, damage, hitTimes: attackHits.map(event => event.time) } : {}),
          ...(legs ? { legs } : {}) });
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
      if (stops.length && forecast) stops.forEach((stop, index) => {
        const repeated = stops.flatMap((other, otherIndex) => Math.hypot(other.x - stop.x, other.z - stop.z) < .01 ? [otherIndex] : []);
        const labelPosition = { ...stop, x: stop.x + (repeated.indexOf(index) - (repeated.length - 1) / 2) * .8 };
        labelStop(labelPosition, index + 1);
        diagnostics.push({ ...selection, kind: 'stop', order: index + 1, position: stop, labelPosition });
      });
      canvas.dataset.telegraphs = JSON.stringify(diagnostics);
    },
    dispose() {
      clear(); root.removeFromParent();
      lineGeometry.dispose(); ringGeometry.dispose(); landingGeometry.dispose(); areaGeometry.dispose();
      stroke.dispose(); enemyStroke.dispose(); pursuitStroke.dispose(); playerStroke.dispose(); attackStroke.dispose(); dangerFill.dispose(); fill.dispose();
      for (const material of stopLabels.values()) { material.map?.dispose(); material.dispose(); }
      canvas.dataset.telegraphs = "[]";
    },
  };
}
