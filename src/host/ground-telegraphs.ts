import { BufferGeometry, CircleGeometry, Float32BufferAttribute, Group, Mesh, MeshBasicMaterial, Object3D, PlaneGeometry, RingGeometry } from "three";
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
  const fill = new MeshBasicMaterial({ color: COLOR, transparent: true, opacity: 0.09, depthWrite: false });
  const lineGeometry = new PlaneGeometry(1, 1);
  const ringGeometry = new RingGeometry(0.98, 1, 48);
  const landingGeometry = new RingGeometry(0.2, 0.26, 24);
  const areaGeometry = new CircleGeometry(1, 48);
  const arrowGeometry = new BufferGeometry();
  arrowGeometry.setAttribute("position", new Float32BufferAttribute([0, 0, 0.38, 0.17, 0, -0.16, -0.17, 0, -0.16], 3));
  let signature = "";

  function line(from: Position, to: Position, width: number) {
    const length = Math.hypot(to.x - from.x, to.z - from.z);
    if (length < 0.005) return;
    const mesh = new Mesh(lineGeometry, stroke);
    mesh.rotation.set(-Math.PI / 2, 0, Math.atan2(to.x - from.x, to.z - from.z));
    mesh.scale.set(width, length, 1);
    mesh.position.set((from.x + to.x) / 2, GROUND_HEIGHT, (from.z + to.z) / 2);
    mesh.renderOrder = 3;
    root.add(mesh);
  }

  function marker(position: Position, radius: number, area: boolean) {
    const edge = new Mesh(area ? ringGeometry : landingGeometry, stroke);
    edge.rotation.x = -Math.PI / 2;
    edge.position.set(position.x, GROUND_HEIGHT + 0.01, position.z);
    edge.scale.setScalar(area ? radius : 1);
    edge.renderOrder = 3;
    root.add(edge);
    if (area) {
      const disk = new Mesh(areaGeometry, fill);
      disk.rotation.x = -Math.PI / 2;
      disk.position.set(position.x, GROUND_HEIGHT, position.z);
      disk.scale.setScalar(radius);
      disk.renderOrder = 2;
      root.add(disk);
    }
  }

  return {
    update(snapshot: Pick<AdventureSnapshot, "combat">, preview: CombatPreview | null) {
      const forecast = snapshot.combat.phase === "preparation" && preview ? snapshot.combat.forecast : null;
      const paths = forecast?.paths.filter(path => preview?.kind === "enemy"
        ? path.actorId === preview.threatId
        : preview?.kind === "move" && path.queueId === preview.queueId && path.actorId === forecast.playerId) ?? [];
      const events = forecast?.events.filter(event => (event.kind === "collision" || event.kind === "ignition" || event.kind === "interruption")
        && (preview?.kind === "enemy" ? event.sourceId === preview.threatId
          : preview?.kind === "move" && event.queueId === preview.queueId && event.sourceId === forecast.playerId)) ?? [];
      const nextSignature = JSON.stringify({ preview, paths, events });
      if (nextSignature === signature) return;
      signature = nextSignature;
      root.clear();
      const diagnostics: object[] = [];
      const selection = preview?.kind === "enemy" ? { previewKind: "enemy", enemy: preview.threatId }
        : { previewKind: "move", queueId: preview?.queueId };
      for (const path of paths) {
        const last = path.points.at(-1);
        if (!last) continue;
        for (let index = 1; index < path.points.length; index++) line(path.points[index - 1]!, path.points[index]!, 0.065);
        const before = [...path.points].reverse().find(point => Math.hypot(last.x - point.x, last.z - point.z) > 0.1);
        if (before) {
          const arrow = new Mesh(arrowGeometry, stroke);
          arrow.position.set(last.x, GROUND_HEIGHT + 0.02, last.z);
          arrow.rotation.y = Math.atan2(last.x - before.x, last.z - before.z);
          arrow.renderOrder = 3;
          root.add(arrow);
        }
        const area = path.kind === "attack" && path.radius > 0;
        if (area || path.kind !== "attack") marker(last, area ? path.radius : 0.26, area);
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
          position: event.position, radius: event.radius, targetId: event.targetId });
      }
      canvas.dataset.telegraphs = JSON.stringify(diagnostics);
    },
    dispose() {
      root.clear(); root.removeFromParent();
      lineGeometry.dispose(); ringGeometry.dispose(); landingGeometry.dispose(); areaGeometry.dispose(); arrowGeometry.dispose();
      stroke.dispose(); fill.dispose();
      canvas.dataset.telegraphs = "[]";
    },
  };
}
