import type { Position } from './adventure-types.js';
import { blockedPosition, MOVEMENT_BARRIERS, movementHeight } from './movement.js';
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
    const candidate = { x, y: movementHeight(x, z, from), z };
    if (x < WORLD_BOUNDS.minX || x > WORLD_BOUNDS.maxX || z < WORLD_BOUNDS.minZ || z > WORLD_BOUNDS.maxZ || blockedPosition(x, z)
      || Math.hypot(x - from.x, z - from.z) > maximumDistance + 1e-8 || !clearCombatSegment(from, candidate)
      || occupied.some(p => Math.hypot(p.x - x, p.z - z) < COMBAT_CELL_SIZE * .8)) continue;
    const gap = Math.hypot(x - position.x, z - position.z);
    if (gap < score) { score = gap; best = candidate; }
  }
  // With no reachable empty cell the move stays at its origin.
  return best ?? { ...from };
}

/** Horizontal distance travelled, including every return leg. Route excludes the origin. */
export function combatRouteDistance(origin: Position, route: readonly Position[]): number {
  let total = 0, previous = origin;
  for (const point of route) { total += Math.hypot(point.x - previous.x, point.z - previous.z); previous = point; }
  return total;
}

function clearOccupiedSegment(a: Position, b: Position, occupied: readonly Position[]): boolean {
  const dx = b.x - a.x, dz = b.z - a.z, lengthSquared = dx * dx + dz * dz;
  return occupied.every(p => {
    const fraction = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / lengthSquared));
    return Math.hypot(p.x - a.x - fraction * dx, p.z - a.z - fraction * dz) >= COMBAT_CELL_SIZE * .8;
  });
}

/** Normalize every stop of one Move, allowing a return to its origin. */
export function validateCombatRoute(origin: Position, route: readonly Position[], movementTiles: number, occupied: readonly Position[] = []): Position[] | null {
  if (!route.length) return null;
  const normalized: Position[] = [];
  let previous = origin, remaining = movementTiles * COMBAT_CELL_SIZE;
  for (const stop of route) {
    if (!stop || !Number.isFinite(stop.x) || !Number.isFinite(stop.z)) return null;
    const x = combatCell(stop.x), z = combatCell(stop.z), length = Math.hypot(x - previous.x, z - previous.z);
    const point = { x, y: movementHeight(x, z, origin), z };
    if (length < 1e-8 || length > remaining + 1e-8 || x < WORLD_BOUNDS.minX || x > WORLD_BOUNDS.maxX || z < WORLD_BOUNDS.minZ || z > WORLD_BOUNDS.maxZ
      || blockedPosition(x, z) || !clearCombatSegment(previous, point) || !clearOccupiedSegment(previous, point, occupied)) return null;
    normalized.push(point); previous = point; remaining -= length;
  }
  return normalized;
}

/** Every legal next stop, including when earlier legs leave a fractional tile budget. */
export function reachableCombatCells(origin: Position, movementTiles: number, occupied: readonly Position[] = []): Position[] {
  const cells: Position[] = [];
  const maxDistance = movementTiles * COMBAT_CELL_SIZE;
  const centerX = combatCell(origin.x), centerZ = combatCell(origin.z);
  const radius = Math.ceil(movementTiles);
  for (let dx = -radius; dx <= radius; dx++) for (let dz = -radius; dz <= radius; dz++) {
    if (dx === 0 && dz === 0 || Math.hypot(dx, dz) > movementTiles + 1e-8) continue;
    const x = centerX + dx * COMBAT_CELL_SIZE, z = centerZ + dz * COMBAT_CELL_SIZE;
    const candidate = { x, y: movementHeight(x, z, origin), z };
    if (x < WORLD_BOUNDS.minX || x > WORLD_BOUNDS.maxX || z < WORLD_BOUNDS.minZ || z > WORLD_BOUNDS.maxZ || blockedPosition(x, z)
      || Math.hypot(x - origin.x, z - origin.z) > maxDistance + 1e-8 || !clearCombatSegment(origin, candidate)
      || !clearOccupiedSegment(origin, candidate, occupied)) continue;
    cells.push(candidate);
  }
  return cells;
}
