import { CanvasTexture, Group, Mesh, MeshBasicMaterial, Object3D, RingGeometry, Sprite, SpriteMaterial, SRGBColorSpace } from 'three';
import type { PartyPingView } from '../game/multiplayer-types.js';

/** Party locations are deliberate ground markers, separate from people and scenery. */
export function createPartyPings(host: Object3D) {
  const root = new Group(); root.name = 'party-pings'; host.add(root);
  const ringGeometry = new RingGeometry(.8, 1.05, 40);
  const ringMaterial = new MeshBasicMaterial({ color: 0xffd76d, transparent: true, opacity: .9, depthWrite: false });
  const markers = new Map<string, { group: Group; label: Sprite; stamp: string }>();
  function remove(id: string): void {
    const marker = markers.get(id); if (!marker) return;
    marker.group.removeFromParent(); marker.label.material.map?.dispose(); marker.label.material.dispose(); markers.delete(id);
  }
  return {
    update(pings: readonly PartyPingView[]): void {
      const ids = new Set(pings.map(ping => ping.playerId));
      for (const id of markers.keys()) if (!ids.has(id)) remove(id);
      for (const ping of pings) {
        const stamp = `${ping.expiresAtMillis}:${ping.name}`;
        if (markers.get(ping.playerId)?.stamp === stamp) continue;
        remove(ping.playerId);
        const group = new Group(); group.name = `party-ping:${ping.playerId}`;
        group.position.set(ping.position.x, ping.position.y + .08, ping.position.z);
        const ring = new Mesh(ringGeometry, ringMaterial); ring.rotation.x = -Math.PI / 2; group.add(ring);
        const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 80;
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = '#10251ce6'; ctx.fillRect(0, 0, 512, 80);
        ctx.fillStyle = '#ffdf86'; ctx.font = 'bold 32px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(`${ping.name} · Here`, 256, 40, 490);
        const texture = new CanvasTexture(canvas); texture.colorSpace = SRGBColorSpace;
        const label = new Sprite(new SpriteMaterial({ map: texture, depthWrite: false })); label.position.y = 2.8; label.scale.set(4.2, .66, 1); group.add(label);
        root.add(group); markers.set(ping.playerId, { group, label, stamp });
      }
    },
    dispose(): void { for (const id of markers.keys()) remove(id); root.removeFromParent(); ringGeometry.dispose(); ringMaterial.dispose(); },
  };
}
