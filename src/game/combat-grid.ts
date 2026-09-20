import type { Position } from './adventure-types.js';
import { blockedPosition } from './movement.js';
import { terrainHeight } from './cave-layout.js';

/** Combat uses a 2.5m tactical lattice while an encounter is engaged. */
export const COMBAT_CELL_SIZE = 2.5;
export function combatCell(value: number): number { return Math.round(value / COMBAT_CELL_SIZE) * COMBAT_CELL_SIZE; }
export function snapCombatPosition(position: Position): Position {
  let x = combatCell(position.x), z = combatCell(position.z);
  if (blockedPosition(x, z)) {
    const candidates: Array<[number, number]> = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]];
    const open = candidates.map(([dx,dz]) => [x + dx * COMBAT_CELL_SIZE, z + dz * COMBAT_CELL_SIZE] as const).find(([cx,cz]) => !blockedPosition(cx,cz));
    if (open) [x,z] = open;
  }
  return { x, z, y: terrainHeight(x, z) };
}
