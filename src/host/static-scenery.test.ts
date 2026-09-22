import { expect, test } from 'bun:test';
import { BoxGeometry, Group, Matrix3, Mesh, MeshBasicMaterial, Vector3 } from 'three';
import { createCameraCollision } from './camera-collision.js';
import { mergeStaticScenery } from './static-scenery.js';

test('rock cells preserve sheared geometry, normals, material groups, shadows and camera collision', () => {
  const root = new Group(); root.position.set(4, 2, 3); root.rotation.y = .2;
  const geometry = new BoxGeometry(2, 2, 2), materials = Array.from({ length: 6 }, () => new MeshBasicMaterial());
  const meshes: Mesh[] = [];
  for (const x of [2, 6, 40]) {
    const wrapper = new Group(); wrapper.position.set(x, 0, 5); wrapper.scale.set(2, 3, 1);
    const mesh = new Mesh(geometry, materials); mesh.rotation.y = .6;
    mesh.castShadow = true; mesh.receiveShadow = true;
    wrapper.add(mesh); root.add(wrapper); meshes.push(mesh);
  }
  root.updateWorldMatrix(true, true);
  const before = meshes.slice(0, 2).map(mesh => ({
    positions: Array.from({ length: geometry.getAttribute('position').count }, (_, i) => new Vector3().fromBufferAttribute(geometry.getAttribute('position'), i).applyMatrix4(mesh.matrixWorld)),
    normals: Array.from({ length: geometry.getAttribute('normal').count }, (_, i) => new Vector3().fromBufferAttribute(geometry.getAttribute('normal'), i).applyNormalMatrix(new Matrix3().getNormalMatrix(mesh.matrixWorld))),
  }));
  const target = new Vector3(2, 0, 0).applyMatrix4(root.matrixWorld);
  const camera = new Vector3(2, 0, 10).applyMatrix4(root.matrixWorld);
  const collision = createCameraCollision(); collision.install(root);
  const beforeCamera = camera.clone(); collision.update(target, beforeCamera, 1);
  mergeStaticScenery(root);
  root.updateWorldMatrix(true, true);
  const merged = root.children.find(object => object instanceof Mesh) as Mesh;
  expect(root.children.length).toBe(2);
  expect(merged.material).toBe(materials);
  expect(merged.castShadow).toBe(true); expect(merged.receiveShadow).toBe(true);
  expect(merged.geometry.index!.count).toBe(geometry.index!.count * 2);
  expect(merged.geometry.groups).toEqual([...geometry.groups, ...geometry.groups.map(group => ({ ...group, start: group.start + geometry.index!.count }))]);
  before.flatMap(value => value.positions).forEach((position, index) => {
    const actual = new Vector3().fromBufferAttribute(merged.geometry.getAttribute('position'), index).applyMatrix4(merged.matrixWorld);
    expect(actual.distanceTo(position)).toBeLessThan(.00001);
  });
  before.flatMap(value => value.normals).forEach((normal, index) => {
    const actual = new Vector3().fromBufferAttribute(merged.geometry.getAttribute('normal'), index).applyNormalMatrix(new Matrix3().getNormalMatrix(merged.matrixWorld));
    expect(actual.distanceTo(normal)).toBeLessThan(.00001);
  });
  collision.install(root);
  collision.update(target, camera, 1);
  expect(camera.distanceTo(beforeCamera)).toBeLessThan(.00001);
  expect(camera.distanceTo(target)).toBeLessThan(10);
  expect(geometry.getAttribute('position').getX(0)).toBe(1);
  collision.dispose();
});
