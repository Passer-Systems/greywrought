import type { Position } from './adventure-types.js';

export const FOREST_OFFSET = 20;
export const WORLD_BOUNDS = { minX: -70, maxX: 90, minZ: -130, maxZ: 76 } as const;
export const TOWN_BOUNDS = { minX: -22, maxX: 22, minZ: -24, maxZ: 0 } as const;
export function inTown(position: Pick<Position, 'x' | 'z'>): boolean {
  return position.x >= TOWN_BOUNDS.minX && position.x <= TOWN_BOUNDS.maxX
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
