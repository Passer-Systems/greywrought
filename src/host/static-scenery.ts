import { Group, Matrix4, Mesh, Vector3 } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Bake immutable opaque scenery into spatial cells, including inverse-transpose
 * normals for the sheared transforms of the cave's stretched rock models. */
export function mergeStaticScenery(root: Group, cellSize = 16): void {
  root.updateWorldMatrix(true, true);
  const inverse = root.matrixWorld.clone().invert(), matrix = new Matrix4(), center = new Vector3();
  const cells = new Map<string, Mesh[]>();
  root.traverse(object => {
    if (!(object instanceof Mesh)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    if (materials.some(material => material.transparent)) return;
    center.setFromMatrixPosition(matrix.multiplyMatrices(inverse, object.matrixWorld));
    const key = [Math.floor(center.x / cellSize), Math.floor(center.z / cellSize), object.geometry.uuid,
      ...materials.map(material => material.uuid), object.castShadow, object.receiveShadow].join(':');
    const cell = cells.get(key);
    if (cell) cell.push(object); else cells.set(key, [object]);
  });
  for (const meshes of cells.values()) {
    if (meshes.length < 2) continue;
    const source = meshes[0]!;
    const geometries = meshes.map(mesh => mesh.geometry.clone().applyMatrix4(matrix.multiplyMatrices(inverse, mesh.matrixWorld)));
    // Material arrays use the authored groups, repeated at each vertex/index offset.
    let offset = 0;
    const groups = geometries.flatMap(geometry => {
      const groups = geometry.groups.map(group => ({ ...group, start: group.start + offset }));
      offset += geometry.index?.count ?? geometry.getAttribute('position').count;
      return groups;
    });
    const geometry = mergeGeometries(geometries);
    for (const part of geometries) part.dispose();
    if (!geometry) throw new Error('Static scenery geometry cannot be merged');
    geometry.groups = groups;
    geometry.computeBoundingSphere();
    const merged = new Mesh(geometry, source.material);
    merged.name = 'static-rock-cell';
    merged.castShadow = source.castShadow;
    merged.receiveShadow = source.receiveShadow;
    merged.matrixAutoUpdate = false;
    root.add(merged);
    for (const mesh of meshes) {
      let container = mesh.parent;
      mesh.removeFromParent();
      while (container && container !== root && container.children.length === 0) {
        const ancestor = container.parent;
        container.removeFromParent();
        container = ancestor;
      }
    }
  }
}
