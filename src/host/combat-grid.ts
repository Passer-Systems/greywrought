import { BufferGeometry, Float32BufferAttribute, LineBasicMaterial, LineSegments, type Object3D } from 'three';
import { COMBAT_CELL_SIZE, combatCell } from '../game/combat-grid.js';
import { terrainHeight } from '../game/cave-layout.js';
import { blockedPosition } from '../game/movement.js';
import type { AdventureSnapshot } from '../game/adventure-types.js';

export function createCombatGrid(scene: Object3D, canvas: HTMLCanvasElement) {
  const geometry = new BufferGeometry(), material = new LineBasicMaterial({ color: 0xd9c16f, transparent: true, opacity: .3, depthWrite: false });
  const positions = new Float32BufferAttribute(new Float32Array(9 * 2 * 32 * 2 * 3), 3);
  geometry.setAttribute('position', positions);
  const lines = new LineSegments(geometry, material); lines.visible = false; lines.frustumCulled = false; scene.add(lines);
  let previousX = NaN, previousZ = NaN;
  return {
    update(snapshot: AdventureSnapshot) {
      lines.visible = snapshot.player.inCombat;
      canvas.dataset.combatGrid = lines.visible ? String(COMBAT_CELL_SIZE) : '0';
      if (!lines.visible) return;
      const x = combatCell(snapshot.player.position.x), z = combatCell(snapshot.player.position.z);
      if (x === previousX && z === previousZ) return;
      previousX = x; previousZ = z;
      let vertex = 0;
      const segment = (ax: number, az: number, bx: number, bz: number) => {
        if (blockedPosition((ax + bx) / 2, (az + bz) / 2)) return;
        positions.setXYZ(vertex++, ax, terrainHeight(ax, az) + .05, az);
        positions.setXYZ(vertex++, bx, terrainHeight(bx, bz) + .05, bz);
      };
      const startX = x - 4.5 * COMBAT_CELL_SIZE, startZ = z - 4.5 * COMBAT_CELL_SIZE;
      for (let edge = 0; edge <= 8; edge++) for (let step = 0; step < 32; step++) {
        const a = step * COMBAT_CELL_SIZE / 4, b = (step + 1) * COMBAT_CELL_SIZE / 4;
        segment(startX + edge * COMBAT_CELL_SIZE, startZ + a, startX + edge * COMBAT_CELL_SIZE, startZ + b);
        segment(startX + a, startZ + edge * COMBAT_CELL_SIZE, startX + b, startZ + edge * COMBAT_CELL_SIZE);
      }
      positions.needsUpdate = true; geometry.setDrawRange(0, vertex);
    },
    dispose() { lines.removeFromParent(); geometry.dispose(); material.dispose(); delete canvas.dataset.combatGrid; },
  };
}
