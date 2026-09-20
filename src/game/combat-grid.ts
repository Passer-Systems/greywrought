import type { Position, QueuedCombatAction } from './adventure-types.js';
import { blockedPosition, MOVEMENT_BARRIERS } from './movement.js';
import { terrainHeight } from './cave-layout.js';
import { WORLD_BOUNDS } from './world-layout.js';

export const COMBAT_CELL_SIZE = 2.5;
export function combatCell(value: number): number { return Math.round(value / COMBAT_CELL_SIZE) * COMBAT_CELL_SIZE; }
export function clearCombatSegment(a: Position, b: Position): boolean {
  return !MOVEMENT_BARRIERS.some(([left, right, bottom, top]) => {
    let enter = 0, exit = 1;
    for (const [start, end, min, max] of [[a.x, b.x, left + 1e-8, right - 1e-8], [a.z, b.z, bottom, top]]) {
      const delta = end! - start!;
      if (Math.abs(delta) < 1e-9) { if (start! < min! || start! > max!) return false; }
      else { const first = (min! - start!) / delta, last = (max! - start!) / delta; enter = Math.max(enter, Math.min(first, last)); exit = Math.min(exit, Math.max(first, last)); }
    }
    return enter <= exit;
  });
}
export function snapCombatPosition(position: Position, from: Position = position, maximumDistance = Infinity, occupied: readonly Position[] = []): Position {
  const centerX = combatCell(position.x), centerZ = combatCell(position.z);
  let best: Position | undefined, score = Infinity;
  for (let dx = -4; dx <= 4; dx++) for (let dz = -4; dz <= 4; dz++) {
    const x = centerX + dx * COMBAT_CELL_SIZE, z = centerZ + dz * COMBAT_CELL_SIZE;
    const candidate = { x, y: terrainHeight(x, z), z };
    if (x < WORLD_BOUNDS.minX || x > WORLD_BOUNDS.maxX || z < WORLD_BOUNDS.minZ || z > WORLD_BOUNDS.maxZ || blockedPosition(x, z)
      || Math.hypot(x - from.x, z - from.z) > maximumDistance + 1e-8 || !clearCombatSegment(from, candidate)
      || occupied.some(p => Math.hypot(p.x - x, p.z - z) < COMBAT_CELL_SIZE * .8)) continue;
    const gap = Math.hypot(x - position.x, z - position.z);
    if (gap < score) { score = gap; best = candidate; }
  }
  // With no reachable empty cell the move stays at its origin.
  return best ?? { ...from };
}

/** Every legal destination for one Move action from an origin cell. */
export function reachableCombatCells(origin: Position, movementTiles: number, occupied: readonly Position[] = []): Position[] {
  const cells: Position[] = [];
  const maxDistance = movementTiles * COMBAT_CELL_SIZE;
  const centerX = combatCell(origin.x), centerZ = combatCell(origin.z);
  for (let dx = -movementTiles; dx <= movementTiles; dx++) for (let dz = -movementTiles; dz <= movementTiles; dz++) {
    if (dx === 0 && dz === 0 || Math.hypot(dx, dz) > movementTiles + 1e-8) continue;
    const x = centerX + dx * COMBAT_CELL_SIZE, z = centerZ + dz * COMBAT_CELL_SIZE;
    const candidate = { x, y: terrainHeight(x, z), z };
    if (x < WORLD_BOUNDS.minX || x > WORLD_BOUNDS.maxX || z < WORLD_BOUNDS.minZ || z > WORLD_BOUNDS.maxZ || blockedPosition(x, z)
      || Math.hypot(x - origin.x, z - origin.z) > maxDistance + 1e-8 || !clearCombatSegment(origin, candidate)
      || occupied.some(p => Math.hypot(p.x - x, p.z - z) < COMBAT_CELL_SIZE * .8)) continue;
    cells.push(candidate);
  }
  return cells;
}

export function combatMoveOrigin(position: Position, queued: readonly QueuedCombatAction[]): Position {
  const beat = [0,1,2].find(slot => !queued.some(action => action.offsetSeconds === slot)) ?? 3;
  return queued.filter(action => action.action === 'bait' && action.offsetSeconds < beat && action.destination !== null)
    .sort((a,b) => a.offsetSeconds-b.offsetSeconds).at(-1)?.destination ?? position;
}
