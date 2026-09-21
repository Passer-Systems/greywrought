import { expect, test } from 'bun:test';
import { BoxGeometry, Group, InstancedMesh, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import { createSceneryCutaway } from './scenery-cutaway.js';

test('cutaway keeps shared actor material and walkable ground intact, including instanced scenery', () => {
  const original = new MeshStandardMaterial(), geometry = new BoxGeometry();
  const terrain = new Group(), tree = new InstancedMesh(geometry, original, 2), ground = new Mesh(geometry, original);
  ground.userData.walkableGround = true;
  const npc = new Group(), body = new Mesh(geometry, original); npc.add(body); terrain.add(tree, ground, npc);
  const matrices = Array.from(tree.instanceMatrix.array), cutaway = createSceneryCutaway();
  cutaway.install(terrain, [npc]);
  expect(body.material).toBe(original);
  expect(ground.material).toBe(original);
  expect(tree.material).not.toBe(original);
  expect((tree.material as MeshStandardMaterial).transparent).toBe(false);
  expect(Array.from(tree.instanceMatrix.array)).toEqual(matrices);
  const eye = new Vector3(0, 10, -10);
  cutaway.update(eye, { x: 0, y: 0, z: 0 }, 1.1, [{x: 6, y: 0, z: 2}, {x: 2, y: 0, z: 4}], .25);
  expect(eye.toArray()).toEqual([0, 10, -10]);
  expect(cutaway.uniforms.cutawayGrid.value.x).toBe(4);
  const expanded = cutaway.uniforms.cutawayGrid.value.w;
  expect(expanded).toBeGreaterThan(2);
  cutaway.update(eye, { x: 0, y: 0, z: 0 }, 1.1, [], .1);
  expect(cutaway.uniforms.cutawayGrid.value.w).toBeGreaterThan(0);
  expect(cutaway.uniforms.cutawayGrid.value.w).toBeLessThan(expanded);
  cutaway.update(eye, { x: 0, y: 0, z: 0 }, 1.65, [], .1, false);
  expect(cutaway.uniforms.cutawayEnabled.value).toBe(0);
});
