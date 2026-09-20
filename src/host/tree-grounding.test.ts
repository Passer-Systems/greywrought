import { expect, test } from 'bun:test';
import { Box3, BoxGeometry, CylinderGeometry, Group, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import { fit } from './frostwood-assets.js';
import { groundTree } from './tree-grounding.js';

test('a rotated, leaning tree plants its offset root collar across a steep slope', () => {
  const authored = new Group();
  const trunk = new Mesh(new CylinderGeometry(.4, 1.2, 10, 8), new MeshStandardMaterial({ name: 'Bark_NormalTree' }));
  trunk.position.set(2, 5, -1); authored.add(trunk);
  const crown = new Mesh(new BoxGeometry(12, 8, 8), new MeshStandardMaterial({ name: 'Leaves_NormalTree' }));
  crown.position.set(-3, 12, 2); authored.add(crown);
  const model = fit(authored, 26);
  const heightAt = (x: number, z: number) => 12 - .9 * x + .4 * z;
  model.position.set(3, heightAt(3, 4), 4); model.rotation.set(0, .7, .08);
  const roots = () => {
    model.updateWorldMatrix(true, true);
    const positions = trunk.geometry.getAttribute('position'), result: Vector3[] = [];
    for (let i = 0; i < positions.count; i++) if (positions.getY(i) < -4.99) result.push(new Vector3().fromBufferAttribute(positions, i).applyMatrix4(trunk.matrixWorld));
    return result;
  };
  expect(Math.max(...roots().map(p => p.y - heightAt(p.x, p.z)))).toBeGreaterThan(1);
  groundTree(model, 3, 4, heightAt);
  const planted = roots(), center = new Box3().setFromPoints(planted).getCenter(new Vector3());
  expect(center.x).toBeCloseTo(3, 6); expect(center.z).toBeCloseTo(4, 6);
  expect(Math.max(...planted.map(p => p.y - heightAt(p.x, p.z)))).toBeCloseTo(0, 6);
  expect(model.rotation.y).toBe(.7); expect(model.rotation.z).toBe(.08);
});
