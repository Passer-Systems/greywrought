import { TOWN_FENCE_BARRIERS } from "./town-elevation.js";
import { REGION_BUILDINGS } from './world-regions.js';
import type { Barrier } from './movement.js';
import type { Position } from './adventure-types.js';

/** Roof footprints leave the square, shop approaches and central road open. */
export const TOWN_BUILDINGS = [
  { model: 'House_1', x: -14, z: -10, width: 6, depth: 6, height: 6.2, turn: -1, sign: 'NINE-BELL BANK' },
  { model: 'Inn', x: 8.7, z: -12, width: 6, depth: 6, height: 5.8, turn: 1, sign: 'THE MISSING BELL' },
  { model: 'House_1', x: 10, z: -5, width: 6, depth: 5, height: 5.6, turn: 1, sign: 'MARA’S APOTHECARY' },
  { model: 'House_1', x: -19, z: -4, width: 5, depth: 5, height: 5.1, turn: -1, sign: '' },
  { model: 'House_3', x: -18, z: -19, width: 6, depth: 6, height: 4.9, turn: -1, sign: '' },
  { model: 'House_1', x: 18, z: -6, width: 5, depth: 5, height: 5.3, turn: 1, sign: '' },
  { model: 'House_3', x: 18, z: -18, width: 6, depth: 6, height: 4.8, turn: 1, sign: '' },
  { model: 'House_1', x: -7, z: -20, width: 5, depth: 5, height: 5.5, turn: 0, sign: '' },
  { model: 'House_1', x: -18, z: -29, width: 7, depth: 7, height: 6.1, turn: -1, sign: 'IRON & EDGE · WEAPONS' },
  { model: 'House_1', x: 18, z: -29, width: 7, depth: 7, height: 6.1, turn: 1, sign: 'THE IRON COAT · ARMOR' },
  { model: 'House_3', x: -10, z: -36, width: 7, depth: 5, height: 4.9, turn: 0, sign: 'OAK & IRON · SHIELDS' },
  { model: 'House_3', x: 10, z: -36, width: 6, depth: 5, height: 4.9, turn: 0, sign: '' },
] as const;

export const TOWN_BUILDING_BARRIERS: readonly Barrier[] = [...TOWN_BUILDINGS, ...REGION_BUILDINGS].map(building => [
  building.x - building.width / 2, building.x + building.width / 2,
  building.z - building.depth / 2, building.z + building.depth / 2,
]);

export function restoreTownPosition(position: Position): { x: number; y: number; z: number } {
  const inside = (p: Position, [left, right, bottom, top]: Barrier) => p.x > left && p.x < right && p.z >= bottom && p.z <= top;
  const obstacles = [...TOWN_BUILDING_BARRIERS, ...TOWN_FENCE_BARRIERS];
  const building = obstacles.find(barrier => inside(position, barrier));
  if (!building) return { ...position };
  const [left, right, bottom, top] = building;
  // A former patch of open ground may now contain a wall or fence.
  const exits = [
    { ...position, x: left - .35 }, { ...position, x: right + .35 },
    { ...position, z: bottom - .35 }, { ...position, z: top + .35 },
  ].filter(p => !obstacles.some(barrier => inside(p, barrier)));
  exits.sort((a, b) => Math.hypot(a.x - position.x, a.z - position.z) - Math.hypot(b.x - position.x, b.z - position.z));
  const exit = exits[0];
  if (!exit) throw new Error('Town obstacle has no accessible edge.');
  return exit;
}
