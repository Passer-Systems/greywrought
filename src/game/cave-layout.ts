import { overworldHeight } from './world-elevation.js';
import type { Position } from './adventure-types.js';
import type { Barrier } from './movement.js';

export const CAVE_ENTRANCE = { x: 28, y: 0, z: -46 } as const;
export const CAVE_DEPTH = 9;
export function terrainHeight(x: number, z: number): number {
  if (!inCave({ x, z })) return overworldHeight(x, z);
  const descent = (start: number, end: number) => {
    const t = Math.max(0, Math.min(1, (x - start) / (end - start)));
    return t * t * (3 - 2 * t);
  };
  return -5 * descent(28, 42) - 4 * descent(51, 63);
}
export const CAVE_BARRIERS: readonly Barrier[] = [
  [28, 86, -64, -60], [28, 86, -34, -30], [82, 86, -60, -34],
  [28, 35, -60, -50], [28, 35, -42, -34],
  [35, 51, -60, -56], [35, 51, -36, -34],
  [51, 59, -60, -50], [51, 59, -42, -34],
];
export function inCave(position: Pick<Position, 'x' | 'z'>): boolean {
  return position.x >= 28 && position.x <= 86 && position.z >= -64 && position.z <= -30;
}
export function caveBlockedPosition(x: number, z: number): boolean {
  return CAVE_BARRIERS.some(([left, right, bottom, top]) => x > left && x < right && z >= bottom && z <= top);
}

// Preserve height above the old floor when the landscape changes.
export function migrateTerrainLayout(root: Record<string, unknown>): void {
  if (root.terrainLayout === 2) return;
  const spatialKeys = new Set(['position', 'targetPosition', 'origin', 'start', 'destination', 'attackOrigin']);
  function visit(value: unknown): void {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) { value.forEach(visit); return; }
    for (const [key, child] of Object.entries(value)) {
      if (spatialKeys.has(key) && child && typeof child === 'object'
        && 'x' in child && typeof child.x === 'number' && 'y' in child && typeof child.y === 'number'
        && 'z' in child && typeof child.z === 'number') child.y += root.terrainLayout === 1 ? overworldHeight(child.x, child.z) : terrainHeight(child.x, child.z);
      else visit(child);
    }
  }
  visit(root);
  root.terrainLayout = 2;
}
