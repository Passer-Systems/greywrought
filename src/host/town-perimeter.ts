import { TOWN_FENCE_RUNS } from '../game/town-elevation.js';

type PlaceFence = (x: number, z: number, length: number, rotation: number) => void;

/** Use the scenery owner's loading and instancing so repeated rails share resources. */
export function buildTownPerimeter(placeFence: PlaceFence): void {
  for (const { x1, z1, x2, z2 } of TOWN_FENCE_RUNS) {
    const length = Math.hypot(x2 - x1, z2 - z1);
    const pieces = Math.ceil(length / 2.5);
    const rotation = -Math.atan2(z2 - z1, x2 - x1);
    for (let piece = 0; piece < pieces; piece++) {
      const t = (piece + .5) / pieces;
      placeFence(x1 + (x2 - x1) * t, z1 + (z2 - z1) * t, length / pieces, rotation);
    }
  }
}
