const smooth = (value: number) => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); };
/** The southern meadow lake: a shallow, walkable rim around a deeper swimming basin. */
export const LAKE_CENTER = { x: -4, z: -98 } as const;
export const LAKE_RADIUS = { x: 14, z: 11 } as const;
export const LAKE_WATER_LEVEL = 0.08;
function lakeBoundary(x: number, z: number): number {
  const angle = Math.atan2(z - LAKE_CENTER.z, x - LAKE_CENTER.x);
  return 1 + 0.11 * Math.sin(angle * 3 + 0.7) - 0.06 * Math.cos(angle * 2 - 0.4);
}
export function lakeDepthAt(x: number, z: number): number {
  const radial = Math.hypot((x - LAKE_CENTER.x) / LAKE_RADIUS.x, (z - LAKE_CENTER.z) / LAKE_RADIUS.z);
  const boundary = lakeBoundary(x, z);
  return radial >= boundary ? 0 : 1.8 * (1 - smooth(radial / boundary));
}
export function lakeWaterAt(x: number, z: number): number | null {
  const depth = lakeDepthAt(x, z);
  return depth > 0 ? LAKE_WATER_LEVEL : null;
}
export function isSwimmingPosition(x: number, z: number): boolean { return lakeDepthAt(x, z) >= 0.72; }
export const lakeSurface = { center: LAKE_CENTER, radius: LAKE_RADIUS, waterLevel: LAKE_WATER_LEVEL } as const;
export function supportHeight(x: number, z: number): number { return isSwimmingPosition(x, z) ? LAKE_WATER_LEVEL : overworldHeight(x, z); }
function hill(x: number, z: number, cx: number, cz: number, radius: number, height: number): number {
  const t = Math.max(0, 1 - Math.hypot(x-cx,z-cz) / radius);
  return height * t * t * (3 - 2 * t);
}

export function overworldHeight(x: number, z: number): number {
  // Keep the yard, north road and cave mouth on their authored foundations.
  const townClear = smooth((Math.hypot(x / 1.3, z + 16) - 34) / 16);
  const roadClear = z > -46 && z < 76 ? smooth((Math.abs(x) - 8) / 12) : 1;
  const caveClear = smooth(Math.max(28-x,x-86,-64-z,z+30,0)/12);
  const field = hill(x,z,-27,-79,27,4.8) + hill(x,z,29,-100,30,6.2) + hill(x,z,-42,-114,24,4)
    + hill(x,z,33,25,24,5.5) + hill(x,z,-35,48,26,6);
  const mountains = hill(x,z,-76,-84,45,25) + hill(x,z,-84,-8,42,30) + hill(x,z,-57,92,44,32)
    + hill(x,z,31,113,44,38) + hill(x,z,99,47,48,34) + hill(x,z,112,-87,40,31)
    + hill(x,z,64,-156,45,28) + hill(x,z,-12,-165,42,34);
  const land = (field + mountains) * townClear * roadClear * caveClear;
  // Lower the meadow floor beneath the lake so the shoreline has a real slope.
  return land - lakeDepthAt(x, z);
}
