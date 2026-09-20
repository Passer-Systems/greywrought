import { TOWN_BOUNDS } from './world-layout.js';
import type { Barrier } from './movement.js';

export const TOWN_HEIGHT = 1.6;
export const TOWN_RIM_WIDTH = 6;
export const TOWN_GATE_HALF_WIDTH = 4;

/** A level village foundation with a gentle apron along its surrounding meadow. */
export function townHeight(x: number, z: number): number {
  const dx = Math.max(TOWN_BOUNDS.minX - x, 0, x - TOWN_BOUNDS.maxX);
  const dz = Math.max(TOWN_BOUNDS.minZ - z, 0, z - TOWN_BOUNDS.maxZ);
  const t = Math.min(1, Math.hypot(dx, dz) / TOWN_RIM_WIDTH);
  return TOWN_HEIGHT * (1 - t * t * (3 - 2 * t));
}

export const TOWN_FENCE_RUNS = [
  { x1: TOWN_BOUNDS.minX, z1: TOWN_BOUNDS.maxZ, x2: -TOWN_GATE_HALF_WIDTH, z2: TOWN_BOUNDS.maxZ },
  { x1: TOWN_GATE_HALF_WIDTH, z1: TOWN_BOUNDS.maxZ, x2: TOWN_BOUNDS.maxX, z2: TOWN_BOUNDS.maxZ },
  { x1: TOWN_BOUNDS.minX, z1: TOWN_BOUNDS.minZ, x2: -TOWN_GATE_HALF_WIDTH, z2: TOWN_BOUNDS.minZ },
  { x1: TOWN_GATE_HALF_WIDTH, z1: TOWN_BOUNDS.minZ, x2: TOWN_BOUNDS.maxX, z2: TOWN_BOUNDS.minZ },
  { x1: TOWN_BOUNDS.minX, z1: TOWN_BOUNDS.minZ, x2: TOWN_BOUNDS.minX, z2: TOWN_BOUNDS.maxZ },
  { x1: TOWN_BOUNDS.maxX, z1: TOWN_BOUNDS.minZ, x2: TOWN_BOUNDS.maxX, z2: TOWN_BOUNDS.maxZ },
] as const;

// The rails plus body clearance; both road openings retain nearly eight metres.
export const TOWN_FENCE_BARRIERS: readonly Barrier[] = TOWN_FENCE_RUNS.map(({ x1, z1, x2, z2 }) => [
  Math.min(x1, x2) - .2, Math.max(x1, x2) + .2,
  Math.min(z1, z2) - .2, Math.max(z1, z2) + .2,
]);
