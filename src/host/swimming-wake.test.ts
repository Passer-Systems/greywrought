import { test, expect } from 'bun:test';
import { Group, Mesh } from 'three';
import { createSwimmingWake } from './swimming-wake.js';

test('swimming wake emits nondegenerate triangles in aligned draw ranges', () => {
  const root = new Group(); const wake = createSwimmingWake(root);
  wake.update(1 / 60, [{ id: 'p', active: true, position: { x: 0, y: 0, z: -98 } }], 1000);
  wake.update(1 / 60, [{ id: 'p', active: true, position: { x: .7, y: 0, z: -98 } }], 1016);
  const mesh = root.children[0]!;
  if (!(mesh instanceof Mesh)) throw new Error('Wake mesh missing');
  const range = mesh.geometry.drawRange.count;
  expect(range % 3).toBe(0); expect(mesh.userData.activeStampCount).toBeGreaterThan(0);
  const p = mesh.geometry.getAttribute('position'); const alpha=mesh.geometry.getAttribute('alpha');
  for(let i=0;i<range;i+=3){const ax=p.getX(i),az=p.getZ(i),bx=p.getX(i+1),bz=p.getZ(i+1),cx=p.getX(i+2),cz=p.getZ(i+2); expect(Math.abs((bx-ax)*(cz-az)-(bz-az)*(cx-ax))).toBeGreaterThan(1e-8); for(const j of [i,i+1,i+2]) expect(alpha.getX(j)).toBeGreaterThanOrEqual(0);}
  wake.dispose();
});
