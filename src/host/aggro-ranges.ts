import { DoubleSide, Group, Mesh, MeshBasicMaterial, RingGeometry, type Object3D } from 'three';
import type { AdventureSnapshot } from '../game/adventure-types.js';

export function createAggroRanges(scene: Object3D, canvas: HTMLCanvasElement) {
  const root = new Group();
  root.visible = false;
  scene.add(root);
  const directGeometry = new RingGeometry(0.985, 1, 128);
  const helpGeometry = new RingGeometry(0.985, 1, 128);
  const source = helpGeometry.getIndex()!;
  const dashes: number[] = [];
  for (let segment = 0; segment < 128; segment++) {
    if (segment % 4 >= 2) continue;
    for (let vertex = 0; vertex < 6; vertex++) dashes.push(source.getX(segment * 6 + vertex));
  }
  helpGeometry.setIndex(dashes);
  const directMaterial = new MeshBasicMaterial({ color: 0xff655c, transparent: true, opacity: 0.9, side: DoubleSide, depthWrite: false });
  const helpMaterial = new MeshBasicMaterial({ color: 0xffc45c, transparent: true, opacity: 0.9, side: DoubleSide, depthWrite: false });
  const ranges = new Map<string, { direct: Mesh<RingGeometry, MeshBasicMaterial>; help: Mesh<RingGeometry, MeshBasicMaterial> }>();
  let latest: AdventureSnapshot | undefined;
  function update(snapshot: AdventureSnapshot) {
    latest = snapshot;
    const visible = [];
    for (const pair of ranges.values()) { pair.direct.visible = false; pair.help.visible = false; }
    if (root.visible) for (const threat of snapshot.threats) {
      if (!threat.active || threat.health <= 0 || threat.phase === 'returning') continue;
      let pair = ranges.get(threat.id);
      if (!pair) {
        pair = { direct: new Mesh(directGeometry, directMaterial), help: new Mesh(helpGeometry, helpMaterial) };
        for (const ring of [pair.direct, pair.help]) {
          ring.rotation.x = -Math.PI / 2;
          ring.renderOrder = 1;
          root.add(ring);
        }
        ranges.set(threat.id, pair);
      }
      for (const [ring, radius, kind] of [[pair.direct, threat.aggroRange, 'direct'], [pair.help, threat.callForHelpRange, 'help']] as const) {
        ring.visible = radius > 0;
        ring.position.set(threat.position.x, 0.09, threat.position.z);
        ring.scale.setScalar(radius);
        if (ring.visible) visible.push({ enemy: threat.id, kind, radius, x: ring.position.x, z: ring.position.z });
      }
    }
    const serialized = JSON.stringify(visible);
    if (canvas.dataset.aggroRanges !== serialized) canvas.dataset.aggroRanges = serialized;
  }
  return {
    update,
    setVisible(visible: boolean) { root.visible = visible; if (latest) update(latest); },
    dispose() {
      root.removeFromParent();
      directGeometry.dispose(); helpGeometry.dispose(); directMaterial.dispose(); helpMaterial.dispose();
      ranges.clear();
    },
  };
}
