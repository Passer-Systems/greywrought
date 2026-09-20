import { BufferGeometry, Float32BufferAttribute, Matrix4, Mesh, Vector3 } from 'three';
import { terrainHeight } from '../game/cave-layout.js';
import { lakeWaterAt } from '../game/world-elevation.js';

/** Visible combat surface: lake overlays sit above the buried walkable bed. */
export function combatSurfaceHeight(x: number, z: number): number {
  const ground = terrainHeight(x, z);
  return Math.max(ground, lakeWaterAt(x, z) ?? ground);
}

/** World-space floor, with upward winding and one-metre slope samples. */
export function caveFloorGeometry(): BufferGeometry {
  const positions: number[] = [], uv: number[] = [], indices: number[] = [];
  const columns = 58, rows = 17;
  for (let row = 0; row <= rows; row++) for (let col = 0; col <= columns; col++) {
    const x = 28 + col, z = -64 + row * 2;
    positions.push(x, terrainHeight(x, z), z); uv.push(col / 8, row / 4);
  }
  for (let row = 0; row < rows; row++) for (let col = 0; col < columns; col++) {
    const a = row * (columns + 1) + col, b = a + columns + 1;
    indices.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals(); geometry.computeBoundingSphere();
  return geometry;
}

const flatPositions = new WeakMap<BufferGeometry, Float32Array>();
const conformed = new WeakMap<BufferGeometry, { matrix: Matrix4; lift: number; sample: (x: number, z: number) => number }>();
const vertex = new Vector3(), inverse = new Matrix4();
/** Each mesh must own its geometry: a warning follows the ground even on a slope. */
export function conformToTerrain(mesh: Mesh, lift: number, sample: (x: number, z: number) => number = terrainHeight): void {
  const geometry = mesh.geometry, positions = geometry.getAttribute('position');
  let flat = flatPositions.get(geometry);
  if (!flat) { flat = new Float32Array(positions.array); flatPositions.set(geometry, flat); }
  mesh.updateWorldMatrix(true, false);
  const previous = conformed.get(geometry);
  // Terrain is static. Include the full world transform so parent movement,
  // rotation and radius changes invalidate the cached vertices as well.
  if (previous?.lift === lift && previous.sample === sample && previous.matrix.equals(mesh.matrixWorld)) return;
  inverse.copy(mesh.matrixWorld).invert();
  for (let index = 0; index < positions.count; index++) {
    vertex.fromArray(flat, index * 3).applyMatrix4(mesh.matrixWorld);
    vertex.y = sample(vertex.x, vertex.z) + lift;
    vertex.applyMatrix4(inverse); positions.setXYZ(index, vertex.x, vertex.y, vertex.z);
  }
  positions.needsUpdate = true; geometry.computeBoundingSphere();
  if (previous) { previous.matrix.copy(mesh.matrixWorld); previous.lift = lift; previous.sample = sample; }
  else conformed.set(geometry, { matrix: mesh.matrixWorld.clone(), lift, sample });
}
