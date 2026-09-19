import type { Position } from './adventure-types.js';
import type { Barrier } from './movement.js';

export const CAVE_ENTRANCE = { x: 28, y: 0, z: -46 } as const;
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
