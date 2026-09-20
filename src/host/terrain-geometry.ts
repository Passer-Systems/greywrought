import { BufferGeometry, Float32BufferAttribute, Matrix4, Mesh, Vector3 } from 'three';
import { terrainHeight } from '../game/cave-layout.js';

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
const vertex = new Vector3(), inverse = new Matrix4();
/** Each mesh must own its geometry: a warning follows the ground even on a slope. */
export function conformToTerrain(mesh: Mesh, lift: number): void {
  const geometry = mesh.geometry, positions = geometry.getAttribute('position');
  let flat = flatPositions.get(geometry);
  if (!flat) { flat = new Float32Array(positions.array); flatPositions.set(geometry, flat); }
  mesh.updateWorldMatrix(true, false); inverse.copy(mesh.matrixWorld).invert();
  for (let index = 0; index < positions.count; index++) {
    vertex.fromArray(flat, index * 3).applyMatrix4(mesh.matrixWorld);
    vertex.y = terrainHeight(vertex.x, vertex.z) + lift;
    vertex.applyMatrix4(inverse); positions.setXYZ(index, vertex.x, vertex.y, vertex.z);
  }
  positions.needsUpdate = true; geometry.computeBoundingSphere();
}
