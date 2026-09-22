import { expect, spyOn, test } from 'bun:test';
import { BoxGeometry, Frustum, InstancedMesh, Matrix4, MeshBasicMaterial, PerspectiveCamera } from 'three';
import { createFoliageBatchCulling } from './foliage-culling.js';

test('per-instance culling retains intersecting plants and restores them when the camera turns', () => {
  const mesh = new InstancedMesh(new BoxGeometry(2, 2, 2), new MeshBasicMaterial(), 4);
  const transform = new Matrix4();
  for (const [index, position] of [[0, 0, -10], [0, 0, 10], [9.9, 0, -10], [40, 0, -10]].entries()) {
    mesh.setMatrixAt(index, transform.makeTranslation(...position as [number, number, number]));
  }
  mesh.computeBoundingSphere();
  const bound = mesh.boundingSphere!.clone();
  const camera = new PerspectiveCamera(90, 1, .1, 100);
  camera.updateMatrixWorld();
  const cull = createFoliageBatchCulling(mesh);
  cull(camera);
  expect(mesh.count).toBe(2);
  mesh.getMatrixAt(1, transform); expect(transform.elements[12]).toBeCloseTo(9.9);
  camera.lookAt(0, 0, 10); camera.updateMatrixWorld();
  cull(camera);
  expect(mesh.count).toBe(1);
  mesh.getMatrixAt(0, transform); expect(transform.elements[14]).toBe(10);
  camera.lookAt(0, 0, -10); camera.updateMatrixWorld();
  cull(camera);
  expect(mesh.count).toBe(2);
  mesh.getMatrixAt(0, transform); expect(transform.elements[14]).toBe(-10);
  expect(mesh.boundingSphere).toEqual(bound);
});

test('shadow casters cannot enter the main-camera foliage culler', () => {
  const mesh = new InstancedMesh(new BoxGeometry(), new MeshBasicMaterial(), 1);
  mesh.castShadow = true;
  expect(() => createFoliageBatchCulling(mesh)).toThrow('shadow casters');
});

test('whole-cell rejection skips plant tests and restores the batch for another camera pass', () => {
  const mesh = new InstancedMesh(new BoxGeometry(), new MeshBasicMaterial(), 100);
  const transform = new Matrix4();
  for (let index = 0; index < mesh.count; index++) mesh.setMatrixAt(index, transform.makeTranslation(index / 100, 0, -10));
  mesh.position.x = 3; mesh.updateMatrixWorld();
  const camera = new PerspectiveCamera(90, 1, .1, 100); camera.lookAt(0, 0, 10); camera.updateMatrixWorld();
  const cull = createFoliageBatchCulling(mesh);
  const intersects = spyOn(Frustum.prototype, 'intersectsSphere');
  try {
    cull(camera);
    expect(mesh.count).toBe(0);
    expect(intersects).toHaveBeenCalledTimes(1);
    camera.lookAt(0, 0, -10); camera.updateMatrixWorld();
    cull(camera);
    expect(mesh.count).toBe(100);
    mesh.getMatrixAt(99, transform);
    expect(transform.elements[12]).toBeCloseTo(.99);
  } finally { intersects.mockRestore(); }
});
