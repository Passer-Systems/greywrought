import { Box3, Mesh, Vector3, type BufferGeometry, type Object3D } from 'three';

const collars = new WeakMap<BufferGeometry, readonly Vector3[]>();

/** Plant the authored root collar, rather than the centre of the canopy bounds. */
export function groundTree(model: Object3D, x: number, z: number, heightAt: (x: number, z: number) => number): void {
  model.updateWorldMatrix(true, true);
  const roots: Vector3[] = [];
  model.traverse(object => {
    if (!(object instanceof Mesh)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    if (!materials.some(material => material.name.startsWith('Bark_'))) return;
    let collar = collars.get(object.geometry);
    if (!collar) {
      const positions = object.geometry.getAttribute('position');
      object.geometry.computeBoundingBox();
      const bottom = object.geometry.boundingBox!.min.y;
      const tolerance = object.geometry.boundingBox!.getSize(new Vector3()).y * .001;
      const points: Vector3[] = [];
      for (let index = 0; index < positions.count; index++) {
        if (positions.getY(index) <= bottom + tolerance) points.push(new Vector3().fromBufferAttribute(positions, index));
      }
      collar = points; collars.set(object.geometry, collar);
    }
    for (const point of collar) roots.push(point.clone().applyMatrix4(object.matrixWorld));
  });
  if (!roots.length) return;
  const center = new Box3().setFromPoints(roots).getCenter(new Vector3());
  const dx = x - center.x, dz = z - center.z;
  // The downhill rim must meet soil too; sampling only the trunk centre leaves
  // the wide roots of mature trees hanging over steep slopes.
  let dy = Infinity;
  for (const root of roots) dy = Math.min(dy, heightAt(root.x + dx, root.z + dz) - root.y);
  model.position.add(new Vector3(dx, dy, dz));
  model.updateWorldMatrix(true, true);
}
