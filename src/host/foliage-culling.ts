import { Frustum, InstancedMesh, Matrix4, Sphere, type Camera, type Scene } from 'three';

/** Compact a static plant batch to the instances intersecting this render's
 * frustum. Whole-batch bounds remain intact for Three.js and picking. */
export function createFoliageBatchCulling(mesh: InstancedMesh) {
  if (mesh.castShadow) throw new Error('Camera culling cannot remove shadow casters');
  const matrices = new Float32Array(mesh.instanceMatrix.array);
  const count = mesh.count, spheres: Sphere[] = [], selected = new Int32Array(count);
  const transform = new Matrix4(), clip = new Matrix4(), frustum = new Frustum();
  mesh.geometry.computeBoundingSphere();
  mesh.computeBoundingSphere();
  const bounds = mesh.boundingSphere!.clone();
  for (let index = 0; index < count; index++) {
    transform.fromArray(matrices, index * 16);
    spheres.push(mesh.geometry.boundingSphere!.clone().applyMatrix4(transform));
    selected[index] = index;
  }
  return (camera: Camera) => {
    clip.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).multiply(mesh.matrixWorld);
    frustum.setFromProjectionMatrix(clip);
    if (!frustum.intersectsSphere(bounds)) { mesh.count = 0; return; }
    let visible = 0, changed = false;
    for (let index = 0; index < count; index++) {
      if (!frustum.intersectsSphere(spheres[index]!)) continue;
      if (selected[visible] !== index) {
        for (let component = 0; component < 16; component++) mesh.instanceMatrix.array[visible * 16 + component] = matrices[index * 16 + component]!;
        selected[visible] = index; changed = true;
      }
      visible++;
    }
    mesh.count = visible;
    if (changed) mesh.instanceMatrix.needsUpdate = true;
  };
}

/** Runs before Three.js uploads instance buffers for both the main camera and
 * the lake's clipped reflection camera. The minimap is captured before install. */
export function installFoliageCulling(scene: Scene): () => void {
  const batches: ReturnType<typeof createFoliageBatchCulling>[] = [];
  scene.traverse(object => {
    if (object instanceof InstancedMesh && object.userData.staticFoliage && !object.castShadow) batches.push(createFoliageBatchCulling(object));
  });
  const previous = scene.onBeforeRender;
  const beforeRender: Scene['onBeforeRender'] = function(this: Scene, ...args) {
    previous.apply(this, args);
    for (const update of batches) update(args[2]);
  };
  scene.onBeforeRender = beforeRender;
  return () => { if (scene.onBeforeRender === beforeRender) scene.onBeforeRender = previous; batches.length = 0; };
}
