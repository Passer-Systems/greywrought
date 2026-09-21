import { Box3, DoubleSide, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, Raycaster, Vector3, type Intersection, type Object3D } from 'three';
import type { Position } from '../game/adventure-types.js';

type Blocker = { source: Mesh; bounds: Box3; matrix: Matrix4 };

/** Static scenery is indexed once; cells only select candidates, never block the camera. */
export function createCameraCollision() {
  const cells = new Map<string, Blocker[]>(), cellSize = 12;
  const raycaster = new Raycaster(), direction = new Vector3(), hit = new Vector3();
  const probe = new Mesh(undefined, new MeshBasicMaterial({ side: DoubleSide }));
  const candidates = new Set<Blocker>(), hits: Intersection[] = [];
  let resolvedDistance = Infinity;
  return {
    install(root: Object3D, excludedRoots: readonly Object3D[] = []) {
      cells.clear();
      resolvedDistance = Infinity;
      const excluded = new Set(excludedRoots);
      root.updateWorldMatrix(true, true);
      root.traverse(object => {
        if (!(object instanceof Mesh) || object.type === 'SkinnedMesh') return;
        for (let parent: Object3D | null = object; parent; parent = parent.parent) {
          if (excluded.has(parent) || parent.userData.walkableGround) return;
        }
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        if (materials.every(material => material.transparent || !material.visible)) return;
        object.geometry.computeBoundingBox();
        const localBounds = object.geometry.boundingBox;
        if (!localBounds || localBounds.isEmpty()) return;
        const count = object instanceof InstancedMesh ? object.count : 1;
        for (let index = 0; index < count; index++) {
          const matrix = new Matrix4();
          if (object instanceof InstancedMesh) {
            object.getMatrixAt(index, matrix);
            matrix.premultiply(object.matrixWorld);
          } else matrix.copy(object.matrixWorld);
          const bounds = localBounds.clone().applyMatrix4(matrix);
          const blocker = { source: object, bounds, matrix };
          for (let x = Math.floor(bounds.min.x / cellSize); x <= Math.floor(bounds.max.x / cellSize); x++) {
            for (let z = Math.floor(bounds.min.z / cellSize); z <= Math.floor(bounds.max.z / cellSize); z++) {
              const key = `${x}:${z}`;
              const cell = cells.get(key);
              if (cell) cell.push(blocker); else cells.set(key, [blocker]);
            }
          }
        }
      });
    },
    update(target: Position, camera: Vector3, delta: number) {
      raycaster.ray.origin.set(target.x, target.y, target.z);
      direction.subVectors(camera, raycaster.ray.origin);
      const desiredDistance = direction.length();
      if (desiredDistance < .001) { resolvedDistance = Infinity; return; }
      raycaster.ray.direction.copy(direction).normalize();
      raycaster.near = 0;
      raycaster.far = desiredDistance;
      candidates.clear();
      for (let x = Math.floor(Math.min(target.x, camera.x) / cellSize); x <= Math.floor(Math.max(target.x, camera.x) / cellSize); x++) {
        for (let z = Math.floor(Math.min(target.z, camera.z) / cellSize); z <= Math.floor(Math.max(target.z, camera.z) / cellSize); z++) {
          for (const blocker of cells.get(`${x}:${z}`) ?? []) candidates.add(blocker);
        }
      }
      let nearest = desiredDistance;
      for (const blocker of candidates) {
        let visible = true;
        for (let parent: Object3D | null = blocker.source; parent; parent = parent.parent) if (!parent.visible) { visible = false; break; }
        if (!visible || !raycaster.ray.intersectBox(blocker.bounds, hit)) continue;
        if (!blocker.bounds.containsPoint(raycaster.ray.origin) && hit.distanceTo(raycaster.ray.origin) > desiredDistance) continue;
        probe.geometry = blocker.source.geometry;
        probe.matrixWorld.copy(blocker.matrix);
        hits.length = 0;
        probe.raycast(raycaster, hits);
        for (const intersection of hits) nearest = Math.min(nearest, Math.max(.05, intersection.distance - .25));
      }
      // Obstructions shorten immediately; clearing them eases back to the selected zoom.
      resolvedDistance = !Number.isFinite(resolvedDistance) ? nearest
        : Math.min(nearest, resolvedDistance + (nearest - resolvedDistance) * (1 - Math.exp(-Math.max(0, delta) * 8)));
      camera.copy(raycaster.ray.origin).addScaledVector(raycaster.ray.direction, resolvedDistance);
    },
    dispose() { cells.clear(); probe.material.dispose(); },
  };
}
