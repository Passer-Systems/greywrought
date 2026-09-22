import { expect, test } from 'bun:test';
import { BoxGeometry, Group, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import { createCameraCollision } from './camera-collision.js';

test('solid scenery shortens the obstructed boom immediately and restores it smoothly', () => {
  const root = new Group(), material = new MeshStandardMaterial();
  const wall = new Mesh(new BoxGeometry(4, 4, 1), material);
  wall.position.z = 6; root.add(wall);
  const collision = createCameraCollision(); collision.install(root);
  const camera = new Vector3(0, 0, 10), target = new Vector3();
  collision.update(target, camera, 1 / 60);
  expect(camera.z).toBeCloseTo(5.25);
  expect(wall.visible).toBe(true); expect(wall.material).toBe(material); expect(material.opacity).toBe(1);
  camera.set(10, 0, 0); collision.update(target, camera, 1 / 60);
  expect(camera.x).toBeGreaterThan(5.25); expect(camera.x).toBeLessThan(10);
  camera.set(10, 0, 0); collision.update(target, camera, 2);
  expect(camera.x).toBeCloseTo(10);
  camera.set(2, 0, 0); collision.update(target, camera, 1 / 60);
  expect(camera.x).toBe(2);
  camera.set(0, 0, 0); collision.update(target, camera, 1 / 60);
  expect(camera.length()).toBe(0);
  collision.dispose();
});

test('nearby instances and empty space inside a mesh bound never count as blockers', () => {
  const root = new Group(), material = new MeshStandardMaterial();
  const trees = new InstancedMesh(new BoxGeometry(1, 8, 1), material, 2);
  trees.setMatrixAt(0, new Matrix4().makeTranslation(4, 0, 5));
  trees.setMatrixAt(1, new Matrix4().makeTranslation(-4, 0, 5));
  // A diagonal thin beam has a wide world AABB containing empty space.
  const beam = new Mesh(new BoxGeometry(10, 1, .1), material);
  beam.rotation.y = Math.PI / 4; beam.position.set(3, 0, 5); root.add(trees, beam);
  const matrices = Array.from(trees.instanceMatrix.array);
  const collision = createCameraCollision(); collision.install(root);
  const camera = new Vector3(0, 0, 6), target = new Vector3();
  collision.update(target, camera, 1 / 60);
  expect(camera.z).toBe(6);
  expect(Array.from(trees.instanceMatrix.array)).toEqual(matrices);
  expect(trees.material).toBe(material);
  camera.set(4, 0, 10); target.set(4, 0, 0); collision.update(target, camera, 1 / 60);
  expect(camera.z).toBeLessThan(4.5);
  collision.dispose();
});

test('walkable ground, actors and transparent decorations do not block the boom', () => {
  const root = new Group(), npc = new Group();
  const ground = new Mesh(new BoxGeometry(3, 3, 3), new MeshStandardMaterial()); ground.userData.walkableGround = true;
  npc.add(new Mesh(new BoxGeometry(3, 3, 3), new MeshStandardMaterial()));
  const decoration = new Mesh(new BoxGeometry(3, 3, 3), new MeshStandardMaterial({ transparent: true }));
  root.add(ground, npc, decoration);
  const collision = createCameraCollision(); collision.install(root, [npc]);
  const camera = new Vector3(0, 0, 10); collision.update(new Vector3(), camera, 1 / 60);
  expect(camera.z).toBe(10); collision.dispose();
});

test('soft vegetation does not block the boom, including instanced foliage', () => {
  const root = new Group(), material = new MeshStandardMaterial();
  const grass = new Mesh(new BoxGeometry(3, 3, 3), material);
  grass.userData.cameraCollisionBlocker = false;
  const ferns = new InstancedMesh(new BoxGeometry(3, 3, 3), material, 1);
  ferns.userData.cameraCollisionBlocker = false;
  ferns.setMatrixAt(0, new Matrix4().makeTranslation(0, 0, 6));
  root.add(grass, ferns);
  const collision = createCameraCollision(); collision.install(root);
  const camera = new Vector3(0, 0, 10);
  collision.update(new Vector3(), camera, 1 / 60);
  expect(camera.z).toBe(10);
  collision.dispose();
});

test('solid scenery remains a camera blocker beside soft vegetation', () => {
  const root = new Group(), material = new MeshStandardMaterial();
  const grass = new Mesh(new BoxGeometry(3, 3, 3), material);
  grass.userData.cameraCollisionBlocker = false;
  const rock = new Mesh(new BoxGeometry(3, 3, 3), material);
  rock.position.z = 6;
  root.add(grass, rock);
  const collision = createCameraCollision(); collision.install(root);
  const camera = new Vector3(0, 0, 10);
  collision.update(new Vector3(), camera, 1 / 60);
  expect(camera.z).toBeLessThan(6);
  collision.dispose();
});
