import { expect, test } from 'bun:test';
import { Mesh, MeshBasicMaterial, Raycaster, RingGeometry, Vector3 } from 'three';
import { terrainHeight } from '../game/cave-layout.js';
import { caveFloorGeometry, conformToTerrain } from './terrain-geometry.js';

test('cave floor slopes below the surface and can be picked from above', () => {
  const geometry = caveFloorGeometry(), positions = geometry.getAttribute('position');
  const floor = new Mesh(geometry, new MeshBasicMaterial());
  for (let index = 0; index < positions.count; index++) {
    expect(positions.getY(index)).toBeCloseTo(terrainHeight(positions.getX(index), positions.getZ(index)), 5);
    expect(geometry.getAttribute('normal').getY(index)).toBeGreaterThan(0);
  }
  for (const x of [28.1, 35.5, 43, 57.5, 72]) {
    const ray = new Raycaster(new Vector3(x, 10, -46), new Vector3(0, -1, 0));
    const hit = ray.intersectObject(floor)[0];
    expect(hit).toBeDefined();
    expect(Math.abs(hit!.point.y - terrainHeight(x, -46))).toBeLessThan(.025);
  }
  geometry.dispose(); floor.material.dispose();
});

test('rotated warning rings follow the ramp after movement without accumulating deformation', () => {
  const ring = new Mesh(new RingGeometry(.98, 1, 32), new MeshBasicMaterial());
  ring.rotation.set(-Math.PI/2, 0, .7); ring.scale.setScalar(4);
  for (const x of [35, 57, 72, 35]) {
    ring.position.set(x, terrainHeight(x, -46), -46); conformToTerrain(ring, .1);
    const vertices = ring.geometry.getAttribute('position');
    for (let index=0; index<vertices.count; index++) {
      const vertex = new Vector3().fromBufferAttribute(vertices,index).applyMatrix4(ring.matrixWorld);
      expect(vertex.y).toBeCloseTo(terrainHeight(vertex.x, vertex.z)+.1, 5);
    }
  }
  ring.geometry.dispose(); ring.material.dispose();
});
