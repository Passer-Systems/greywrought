import { BufferGeometry, Float32BufferAttribute, LineBasicMaterial, LineSegments, Mesh, MeshBasicMaterial, type Object3D } from 'three';
import { COMBAT_CELL_SIZE, combatCell, combatRouteDistance, reachableCombatCells } from '../game/combat-grid.js';
import { combatSurfaceHeight } from './terrain-geometry.js';
import { blockedPosition } from '../game/movement.js';
import { classKit } from '../game/class-kit.js';
import type { AdventureSnapshot, Position } from '../game/adventure-types.js';

export function createCombatGrid(scene: Object3D, canvas: HTMLCanvasElement) {
  const geometry = new BufferGeometry(), material = new LineBasicMaterial({ color: 0xd9c16f, transparent: true, opacity: .3, depthWrite: false });
  const positions = new Float32BufferAttribute(new Float32Array(9 * 2 * 32 * 2 * 3), 3);
  geometry.setAttribute('position', positions);
  const lines = new LineSegments(geometry, material); lines.visible = false; lines.frustumCulled = false; lines.renderOrder = 2; scene.add(lines);
  const cellsGeometry = new BufferGeometry(), cellsMaterial = new MeshBasicMaterial({ color: 0x7fe8ad, transparent: true, opacity: .25, depthWrite: false });
  const cells = new Mesh(cellsGeometry, cellsMaterial); cells.frustumCulled = false; cells.renderOrder = 2; scene.add(cells);
  const hoverGeometry = new BufferGeometry(), hoverMaterial = new MeshBasicMaterial({ color: 0xc0ffe0, transparent: true, opacity: .6, depthWrite: false });
  const hover = new Mesh(hoverGeometry, hoverMaterial); hover.frustumCulled = false; hover.renderOrder = 3; scene.add(hover);
  let reference: Position | undefined;
  const sampleHeight = (x: number, z: number) => combatSurfaceHeight(x,z,reference);
  let previousX = NaN, previousZ = NaN, previousY = NaN, cellSignature = '', hoverSignature = '';
  let destinations: Position[] = [];
  const surface = (target: BufferGeometry, tiles: readonly Position[], lift: number) => {
    const vertices: number[] = [], half = COMBAT_CELL_SIZE * .46;
    for (const tile of tiles) {
      const corners = [[tile.x-half,tile.z-half],[tile.x-half,tile.z+half],[tile.x+half,tile.z+half],[tile.x+half,tile.z-half]];
      for (const index of [0,1,2,0,2,3]) { const [x,z] = corners[index]!; vertices.push(x!, sampleHeight(x!,z!) + lift, z!); }
    }
    target.setAttribute('position', new Float32BufferAttribute(vertices,3));
    target.setDrawRange(0, vertices.length / 3);
  };
  return {
    accepts(destination: Position) { return destinations.some(cell => cell.x === destination.x && cell.z === destination.z); },
    update(snapshot: AdventureSnapshot, aiming: boolean, pointer: Position | null, others: readonly Position[] = [], route: readonly Position[] = []) {
      reference = snapshot.player.position;
      lines.visible = snapshot.player.inCombat;
      canvas.dataset.combatGrid = lines.visible ? String(COMBAT_CELL_SIZE) : '0';
      cells.visible = hover.visible = lines.visible && aiming && snapshot.combat.phase === 'preparation';
      if (!lines.visible) { destinations = []; canvas.dataset.moveTiles = '[]'; return; }
      const x = combatCell(snapshot.player.position.x), z = combatCell(snapshot.player.position.z);
      if (x !== previousX || z !== previousZ || reference.y !== previousY) {
        previousX = x; previousZ = z; previousY = reference.y;
        let vertex = 0;
        const segment = (ax: number, az: number, bx: number, bz: number) => {
          if (blockedPosition((ax + bx) / 2, (az + bz) / 2)) return;
          positions.setXYZ(vertex++, ax, sampleHeight(ax, az) + .05, az);
          positions.setXYZ(vertex++, bx, sampleHeight(bx, bz) + .05, bz);
        };
        const startX = x - 4.5 * COMBAT_CELL_SIZE, startZ = z - 4.5 * COMBAT_CELL_SIZE;
        for (let edge = 0; edge <= 8; edge++) for (let step = 0; step < 32; step++) {
          const a = step * COMBAT_CELL_SIZE / 4, b = (step + 1) * COMBAT_CELL_SIZE / 4;
          segment(startX + edge * COMBAT_CELL_SIZE, startZ + a, startX + edge * COMBAT_CELL_SIZE, startZ + b);
          segment(startX + a, startZ + edge * COMBAT_CELL_SIZE, startX + b, startZ + edge * COMBAT_CELL_SIZE);
        }
        positions.needsUpdate = true; geometry.setDrawRange(0, vertex);
      }
      if (!cells.visible) return;
      const occupied = [...snapshot.threats.filter(t=>t.active&&t.health>0).map(t=>t.position), ...others];
      const origin = route.at(-1) ?? snapshot.player.position;
      const remaining = Math.max(0, classKit(snapshot.player.archetype).movementTiles - combatRouteDistance(snapshot.player.position, route) / COMBAT_CELL_SIZE);
      const signature = JSON.stringify([origin, remaining, occupied]);
      if (signature !== cellSignature) {
        cellSignature = signature;
        destinations = reachableCombatCells(origin, remaining, occupied);
        surface(cellsGeometry, destinations, .06);
        canvas.dataset.moveTiles = JSON.stringify(destinations);
      }
      const selected = pointer && destinations.find(cell=>cell.x===pointer.x&&cell.z===pointer.z);
      const selectedSignature = selected ? `${selected.x},${selected.y},${selected.z}` : '';
      if (selectedSignature !== hoverSignature) { hoverSignature = selectedSignature; surface(hoverGeometry, selected ? [selected] : [], .075); }
    },
    dispose() { lines.removeFromParent(); cells.removeFromParent(); hover.removeFromParent(); geometry.dispose(); material.dispose(); cellsGeometry.dispose(); cellsMaterial.dispose(); hoverGeometry.dispose(); hoverMaterial.dispose(); delete canvas.dataset.combatGrid; delete canvas.dataset.moveTiles; },
  };
}
