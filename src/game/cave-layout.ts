import { overworldHeight } from './world-elevation.js';
import { dryOverworldHeight as terrainV2, overworldHeight as terrainV3 } from './terrain-layout-v3.js';
import { overworldHeight as terrainV4 } from './terrain-layout-v4.js';
import { lakeWaterAt as lakeWaterAtV5, overworldHeight as terrainV5 } from './terrain-layout-v5.js';
import { lakeWaterAt } from './world-elevation.js';
import { lakeWaterAt as lakeWaterAtV6, overworldHeight as terrainV6 } from './terrain-layout-v6.js';
import { lakeWaterAt as lakeWaterAtV7, overworldHeight as terrainV7 } from './terrain-layout-v7.js';
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
export const TERRAIN_LAYOUT = 8;
export function migrateTerrainLayout(root: Record<string, unknown>): void {
  if (root.terrainLayout === TERRAIN_LAYOUT) return;
  const spatialKeys = new Set(['position', 'targetPosition', 'turnTarget', 'origin', 'start', 'destination', 'attackOrigin']);
  function visit(value: unknown): void {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) { value.forEach(visit); return; }
    for (const [key, child] of Object.entries(value)) {
      if (spatialKeys.has(key) && child && typeof child === 'object'
        && 'x' in child && typeof child.x === 'number' && 'y' in child && typeof child.y === 'number'
        && 'z' in child && typeof child.z === 'number') {
          const oldCaveFloor = inCave(child) && [1, 2, 3, 4, 5, 6, 7].includes(Number(root.terrainLayout));
          const previousTerrain = root.terrainLayout === 7 ? terrainV7 : root.terrainLayout === 6 ? terrainV6 : terrainV5;
          const oldWater = root.terrainLayout === 7 ? lakeWaterAtV7(child.x, child.z) : root.terrainLayout === 6 ? lakeWaterAtV6(child.x, child.z) : root.terrainLayout === 5 ? lakeWaterAtV5(child.x, child.z) : null;
          const swimming = oldWater !== null && previousTerrain(child.x, child.z) < oldWater - .8
            && child.y >= oldWater - .8 - .000001;
          const oldFloor = oldCaveFloor ? terrainHeight(child.x, child.z)
            : swimming ? oldWater! - .8
            : root.terrainLayout === 7 ? terrainV7(child.x, child.z)
            : root.terrainLayout === 6 ? terrainV6(child.x, child.z)
            : root.terrainLayout === 5 ? terrainV5(child.x, child.z)
            : root.terrainLayout === 4 ? terrainV4(child.x, child.z)
            : root.terrainLayout === 3 ? terrainV3(child.x, child.z)
            : root.terrainLayout === 2 ? terrainV2(child.x, child.z) : 0;
          const newFloor = swimming ? Math.max(terrainHeight(child.x, child.z), (lakeWaterAt(child.x, child.z) ?? -Infinity) - .8) : terrainHeight(child.x, child.z);
          child.y = newFloor + (child.y - oldFloor);
        }
      else visit(child);
    }
  }
  visit(root);
  root.terrainLayout = TERRAIN_LAYOUT;
}
