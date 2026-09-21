/** The molten basin at the eastern volcano's outlet, in world coordinates. */
export const LAVA_LAKE = { x: 122, z: 52, radiusX: 9, radiusZ: 8, surface: .78, damagePerSecond: 24 } as const;
const segments = 80;
export const LAVA_LAKE_SHORE = Array.from({ length: segments }, (_, index) => {
  const angle = index / segments * Math.PI * 2;
  const radius = 1 + .12 * Math.sin(angle * 3 + .5) + .07 * Math.sin(angle * 5 - .8) + .035 * Math.cos(angle * 9);
  return { x: Math.cos(angle) * radius, z: Math.sin(angle) * radius };
});

/** Normalized distance to the exact polygon used by the molten surface. */
export function lavaLakeRatio(x: number, z: number): number {
  const dx = (x - LAVA_LAKE.x) / LAVA_LAKE.radiusX, dz = (z - LAVA_LAKE.z) / LAVA_LAKE.radiusZ;
  if (Math.abs(dx) > 1.7 || Math.abs(dz) > 1.7) return Infinity;
  const angle = (Math.atan2(dz, dx) + Math.PI * 2) % (Math.PI * 2);
  const index = Math.floor(angle / (Math.PI * 2) * segments) % segments;
  const a = LAVA_LAKE_SHORE[index]!, b = LAVA_LAKE_SHORE[(index + 1) % segments]!;
  return (dx * (b.z - a.z) - dz * (b.x - a.x)) / (a.x * b.z - a.z * b.x);
}

export function touchesLavaLake(position: { x: number; y: number; z: number }): boolean {
  return position.y >= LAVA_LAKE.surface - .2 && position.y <= LAVA_LAKE.surface + .12
    && lavaLakeRatio(position.x, position.z) <= 1;
}
