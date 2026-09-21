import { BufferGeometry, Float32BufferAttribute, LineBasicMaterial, LineSegments, Mesh, MeshBasicMaterial, type Object3D } from 'three';
import { COMBAT_CELL_SIZE, combatCell, combatRouteDistance, reachableCombatCells } from '../game/combat-grid.js';
import { combatSurfaceHeight } from './terrain-geometry.js';
import { blockedPosition } from '../game/movement.js';
import type { AdventureSnapshot, Position } from '../game/adventure-types.js';

export function createCombatGrid(scene: Object3D, canvas: HTMLCanvasElement) {
  const geometry = new BufferGeometry(), material = new LineBasicMaterial({ color: 0xc4d4d7, transparent: true, opacity: .15, depthWrite: false });
  const positions = new Float32BufferAttribute(new Float32Array(9 * 2 * 32 * 2 * 3), 3);
  geometry.setAttribute('position', positions);
  const lines = new LineSegments(geometry, material); lines.visible = false; lines.frustumCulled = false; lines.renderOrder = 2; scene.add(lines);
  const cellsGeometry = new BufferGeometry(), cellsMaterial = new MeshBasicMaterial({ color: 0x7fe8ad, transparent: true, opacity: .13, depthWrite: false });
  const cells = new Mesh(cellsGeometry, cellsMaterial); cells.frustumCulled = false; cells.renderOrder = 2; scene.add(cells);
  const edgesGeometry = new BufferGeometry(), edgesMaterial = new LineBasicMaterial({ color: 0x7fe8ad, transparent: true, opacity: .75, depthWrite: false });
  const edges = new LineSegments(edgesGeometry, edgesMaterial); edges.frustumCulled = false; edges.renderOrder = 3; scene.add(edges);
  const hoverGeometry = new BufferGeometry(), hoverMaterial = new MeshBasicMaterial({ color: 0xc0ffe0, transparent: true, opacity: .6, depthWrite: false });
  const hover = new Mesh(hoverGeometry, hoverMaterial); hover.frustumCulled = false; hover.renderOrder = 3; scene.add(hover);
  const warningGeometry = new BufferGeometry(), warningMaterial = new MeshBasicMaterial({ color: 0xffb74d, transparent: true, opacity: .7, depthWrite: false });
  const warning = new Mesh(warningGeometry, warningMaterial); warning.name = 'move-retreat-warning'; warning.visible = false; warning.frustumCulled = false; warning.renderOrder = 4; scene.add(warning);
  let warningSignature = '';
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
  const outlines = (tiles: readonly Position[]) => {
    const vertices: number[] = [], half = COMBAT_CELL_SIZE * .46;
    for (const tile of tiles) {
      const corners = [[tile.x-half,tile.z-half],[tile.x-half,tile.z+half],[tile.x+half,tile.z+half],[tile.x+half,tile.z-half]];
      for (let edge = 0; edge < 4; edge++) {
        const from = corners[edge]!, to = corners[(edge + 1) % 4]!;
        for (let step = 0; step < 4; step++) for (const fraction of [step / 4, (step + 1) / 4]) {
          const x = from[0]! + (to[0]! - from[0]!) * fraction, z = from[1]! + (to[1]! - from[1]!) * fraction;
          vertices.push(x, sampleHeight(x, z) + .075, z);
        }
      }
    }
    edgesGeometry.setAttribute('position', new Float32BufferAttribute(vertices, 3));
    edgesGeometry.setDrawRange(0, vertices.length / 3);
  };
  return {
    warnDestination(destination: Position | null) {
      warning.visible = destination !== null;
      const signature = destination ? `${destination.x},${destination.y},${destination.z}` : '';
      if (signature !== warningSignature) { warningSignature = signature; surface(warningGeometry, destination ? [destination] : [], .09); }
      canvas.dataset.moveWarning = JSON.stringify(destination);
    },
    accepts(destination: Position) { return destinations.some(cell => cell.x === destination.x && cell.z === destination.z); },
    update(snapshot: AdventureSnapshot, aiming: boolean, pointer: Position | null, others: readonly Position[] = [], route: readonly Position[] = []) {
      reference = snapshot.player.position;
      lines.visible = snapshot.player.inCombat;
      canvas.dataset.combatGrid = lines.visible ? String(COMBAT_CELL_SIZE) : '0';
      cells.visible = edges.visible = hover.visible = lines.visible && aiming && snapshot.combat.phase === 'preparation' && !snapshot.combat.ready;
      if (!lines.visible) { destinations = []; cellSignature = ''; canvas.dataset.moveTiles = '[]'; delete canvas.dataset.moveOrigin; delete canvas.dataset.moveRemaining; return; }
      const origin = aiming ? route.at(-1) ?? snapshot.player.position : snapshot.player.position;
      const remaining = Math.max(0, snapshot.player.movementTiles - combatRouteDistance(snapshot.player.position, route) / COMBAT_CELL_SIZE);
      const x = combatCell(origin.x), z = combatCell(origin.z);
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
      if (!cells.visible) { destinations = []; cellSignature = ''; canvas.dataset.moveTiles = '[]'; delete canvas.dataset.moveOrigin; delete canvas.dataset.moveRemaining; return; }
      const occupied = [...snapshot.threats.filter(t=>t.active&&t.health>0).map(t=>t.position), ...others];
      const signature = JSON.stringify([origin, remaining, occupied]);
      if (signature !== cellSignature) {
        cellSignature = signature;
        destinations = reachableCombatCells(origin, remaining, occupied);
        surface(cellsGeometry, destinations, .06);
        outlines(destinations);
        canvas.dataset.moveTiles = JSON.stringify(destinations);
        canvas.dataset.moveOrigin = JSON.stringify(origin);
        canvas.dataset.moveRemaining = String(remaining);
      }
      const selected = pointer && destinations.find(cell=>cell.x===pointer.x&&cell.z===pointer.z);
      const selectedSignature = selected ? `${selected.x},${selected.y},${selected.z}` : '';
      if (selectedSignature !== hoverSignature) { hoverSignature = selectedSignature; surface(hoverGeometry, selected ? [selected] : [], .075); }
    },
    dispose() { lines.removeFromParent(); cells.removeFromParent(); edges.removeFromParent(); hover.removeFromParent(); warning.removeFromParent(); geometry.dispose(); material.dispose(); cellsGeometry.dispose(); cellsMaterial.dispose(); edgesGeometry.dispose(); edgesMaterial.dispose(); hoverGeometry.dispose(); hoverMaterial.dispose(); warningGeometry.dispose(); warningMaterial.dispose(); delete canvas.dataset.combatGrid; delete canvas.dataset.moveTiles; delete canvas.dataset.moveOrigin; delete canvas.dataset.moveRemaining; delete canvas.dataset.moveWarning; },
  };
}
