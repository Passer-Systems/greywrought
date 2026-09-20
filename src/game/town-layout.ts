import type { Barrier } from './movement.js';

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

export const TOWN_BUILDING_BARRIERS: readonly Barrier[] = TOWN_BUILDINGS.map(building => [
  building.x - building.width / 2, building.x + building.width / 2,
  building.z - building.depth / 2, building.z + building.depth / 2,
]);
