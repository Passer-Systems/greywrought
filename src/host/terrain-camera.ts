import type { Position } from '../game/adventure-types.js';
import { terrainHeight } from '../game/cave-layout.js';

export function terrainCameraLift(target: Position, camera: Position): number {
  const dx = camera.x - target.x, dz = camera.z - target.z;
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / .25));
  let lift = 0;
  for (let step = 1; step <= steps; step++) {
    const t = step / steps;
    const ground = terrainHeight(target.x + dx * t, target.z + dz * t);
    const height = target.y + (camera.y - target.y) * t;
    // Raising the camera lifts each point on the sightline by its fraction of the boom.
    lift = Math.max(lift, (ground + .5 - height) / t);
  }
  return lift;
}
