import { BufferGeometry, Float32BufferAttribute } from 'three';
import { LAKE_WATER_LEVEL, STREAM_POINTS, lakeDepthAt, overworldHeight } from '../game/world-elevation.js';

/**
 * Build the visible stream ribbon from the same samples that carve the floor.
 * Terrain is sampled directly for the signed depth. The ground mesh is
 * refined around this corridor separately, so this helper does not hide
 * occlusion with an artificial lift or positive depth floor.
 */
export function buildStreamGeometry(): BufferGeometry {
  const positions: number[] = [], depths: number[] = [], flows: number[] = [], indices: number[] = [];
  const across = 8;
  for (let i = 0; i < STREAM_POINTS.length; i++) {
    const point = STREAM_POINTS[i]!;
    const before = STREAM_POINTS[Math.max(0, i - 1)]!;
    const after = STREAM_POINTS[Math.min(STREAM_POINTS.length - 1, i + 1)]!;
    const dx = after.x - before.x, dz = after.z - before.z, length = Math.hypot(dx, dz) || 1;
    const flowX = dx / length, flowZ = dz / length;
    for (let side = 0; side <= across; side++) {
      const sideways = (side / across * 2 - 1) * point.width;
      const x = point.x - dz / length * sideways;
      const z = point.z + dx / length * sideways;
      const y = point.y;
      positions.push(x, -z, y - LAKE_WATER_LEVEL);
      const depth = y - overworldHeight(x, z);
      depths.push(y <= LAKE_WATER_LEVEL + .02 && lakeDepthAt(x, z) > .02 ? 0 : depth);
      flows.push(flowX, flowZ);
    }
    if (i === 0) continue;
    for (let side = 0; side < across; side++) {
      const a = (i - 1) * (across + 1) + side;
      const b = a + across + 1;
      indices.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('waterDepth', new Float32BufferAttribute(depths, 1));
  geometry.setAttribute('current', new Float32BufferAttribute(flows, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
