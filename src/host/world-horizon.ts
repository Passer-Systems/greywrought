import { BufferGeometry, Float32BufferAttribute } from 'three';
import { terrainHeight } from '../game/cave-layout.js';
import { RENDERED_WORLD_BOUNDS } from './expansion-terrain.js';

/** An outward-only skirt whose inner ring shares the terrain's two-metre edge samples. */
export function worldHorizonGeometry(): BufferGeometry {
  const { left, right, bottom, top } = RENDERED_WORLD_BOUNDS;
  const edge: [number, number][] = [];
  for (let x = left; x < right; x += 2) edge.push([x, bottom]);
  for (let z = bottom; z < top; z += 2) edge.push([right, z]);
  for (let x = right; x > left; x -= 2) edge.push([x, top]);
  for (let z = top; z > bottom; z -= 2) edge.push([left, z]);
  // The terrain margin and camera boom leave the outer ring beyond the haze.
  const offsets = [0, 2, 8, 24, 64, 180];
  const positions: number[] = [], uv: number[] = [], indices: number[] = [];
  const centerX = (left + right) / 2, centerZ = (bottom + top) / 2;
  for (const offset of offsets) for (const [edgeX, edgeZ] of edge) {
    const x = edgeX + (edgeX - centerX) / ((right - left) / 2) * offset;
    const z = edgeZ + (edgeZ - centerZ) / ((top - bottom) / 2) * offset;
    positions.push(x, terrainHeight(x, z) - .06, z);
    uv.push((x + 74) / 168, (z + 134) / 214);
  }
  for (let ring = 0; ring < offsets.length - 1; ring++) for (let i = 0; i < edge.length; i++) {
    const next = (i + 1) % edge.length;
    const a = ring * edge.length + i, b = ring * edge.length + next;
    const c = a + edge.length, d = b + edge.length;
    indices.push(a, b, c, b, d, c);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals(); geometry.computeBoundingSphere();
  return geometry;
}
