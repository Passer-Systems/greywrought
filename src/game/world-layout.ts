import type { Position } from './adventure-types.js';
import { EXPANDED_WORLD_BOUNDS, settlementAt } from './world-regions.js';

export const FOREST_OFFSET = 20;
export const WORLD_BOUNDS = EXPANDED_WORLD_BOUNDS;
export const TOWN_BOUNDS = { minX: -26, maxX: 26, minZ: -40, maxZ: 0 } as const;
export function inTown(position: Pick<Position, 'x' | 'z'>): boolean {
  return Boolean(settlementAt(position.x, position.z)) || position.x >= TOWN_BOUNDS.minX && position.x <= TOWN_BOUNDS.maxX
    && position.z >= TOWN_BOUNDS.minZ && position.z <= TOWN_BOUNDS.maxZ;
}

// Only spatial points move; facing vectors and saved combat clocks remain intact.
export function migrateSpatialLayout(root: Record<string, unknown>): void {
  if (root.spatialLayout === 1) return;
  const spatialKeys = new Set(['position', 'targetPosition', 'origin', 'start', 'destination', 'attackOrigin']);
  function visit(value: unknown): void {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) { value.forEach(visit); return; }
    for (const [key, child] of Object.entries(value)) {
      if (spatialKeys.has(key) && child && typeof child === 'object' && 'z' in child && typeof child.z === 'number' && child.z > 0) child.z += FOREST_OFFSET;
      else visit(child);
    }
  }
  visit(root);
  root.spatialLayout = 1;
}
