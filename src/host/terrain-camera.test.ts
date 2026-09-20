import { expect, test } from 'bun:test';
import { terrainHeight } from '../game/cave-layout.js';
import { terrainCameraLift } from './terrain-camera.js';

function orbit(x: number, z: number, yaw: number, pitch = .7, distance = 15) {
  const target = { x, y: terrainHeight(x, z) + 1, z };
  const camera = { x: x - Math.sin(yaw) * Math.cos(pitch) * distance,
    y: target.y + Math.sin(pitch) * distance, z: z - Math.cos(yaw) * Math.cos(pitch) * distance };
  return { target, camera };
}

test('mountain camera clears the terrain along its entire sightline', () => {
  for (const [x, z, yaw] of [[-55, -11, Math.PI / 2], [89, -69, 7 * Math.PI / 4], [67, 47, -Math.PI / 2]]) {
    for (const pitch of [.42, .7, 1.45]) {
      const { target, camera } = orbit(x!, z!, yaw!, pitch);
      camera.y += terrainCameraLift(target, camera);
      for (let step = 1; step <= 300; step++) {
        const t = step / 300;
        const height = target.y + (camera.y - target.y) * t;
        const ground = terrainHeight(target.x + (camera.x - target.x) * t, target.z + (camera.z - target.z) * t);
        expect(height - ground).toBeGreaterThan(.49);
      }
    }
  }
});

test('terrain lift changes continuously while climbing and descending the western mountain', () => {
  for (const direction of [1, -1]) {
    let previous: number | undefined;
    for (let step = 0; step <= 180; step++) {
      const x = direction === 1 ? -62 + step * 5.2 / 60 : -46.4 - step * 5.2 / 60;
      const { target, camera } = orbit(x, -11, Math.PI / 2);
      const lift = terrainCameraLift(target, camera);
      expect(lift).toBeGreaterThanOrEqual(0);
      if (previous !== undefined) expect(Math.abs(lift - previous)).toBeLessThan(.15);
      previous = lift;
    }
  }
});

test('flat town and ordinary cave ramps keep their existing camera orbit', () => {
  for (const [x, z, yaw] of [[0, -8, 0], [35, -46, Math.PI / 2], [57, -46, Math.PI / 2], [72, -46, 0]]) {
    const { target, camera } = orbit(x!, z!, yaw!);
    expect(terrainCameraLift(target, camera)).toBe(0);
  }
});
