import { expect, test } from 'bun:test';
import { BufferAttribute, Group, Mesh, MeshBasicMaterial, Raycaster, RingGeometry, Vector3 } from 'three';
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

test('unchanged rings avoid uploads and invalidate for parent transforms, radius, lift and new geometry', () => {
  const parent = new Group();
  const ring = new Mesh(new RingGeometry(.98, 1, 32), new MeshBasicMaterial());
  parent.add(ring); parent.position.set(35, 0, -46);
  ring.rotation.x = -Math.PI / 2;
  const checkGround = (lift: number) => {
    const positions = ring.geometry.getAttribute('position');
    if (!(positions instanceof BufferAttribute)) throw new Error('Expected unshared ring vertices');
    const before = positions.version;
    conformToTerrain(ring, lift);
    expect(positions.version).toBe(before + 1);
    const vertices = new Float32Array(positions.array);
    for (let i = 0; i < positions.count; i++) {
      const vertex = new Vector3().fromBufferAttribute(positions, i).applyMatrix4(ring.matrixWorld);
      expect(vertex.y).toBeCloseTo(terrainHeight(vertex.x, vertex.z) + lift, 5);
    }
    for (let frame = 0; frame < 60; frame++) conformToTerrain(ring, lift);
    expect(positions.version).toBe(before + 1);
    expect(positions.array).toEqual(vertices);
  };
  checkGround(.05);
  parent.position.x = 57; checkGround(.05);
  parent.rotation.y = .7; checkGround(.05);
  ring.scale.setScalar(4); checkGround(.05);
  checkGround(.1);
  ring.geometry.dispose(); ring.geometry = new RingGeometry(.98, 1, 64); checkGround(.1);
  ring.geometry.dispose(); ring.material.dispose();
});
