import { describe, expect, test } from 'bun:test';
import { LAKE_CENTER, lakeDepthAt, lakeWaterAt, isSwimmingPosition } from './world-elevation.js';
import { terrainHeight } from './cave-layout.js';
import { moveLocomotion, type MovementState } from './movement.js';

describe('meadow lake', () => {
  test('has a shallow shoreline and deeper swimming basin', () => {
    expect(lakeDepthAt(LAKE_CENTER.x + 13, LAKE_CENTER.z)).toBeGreaterThan(0);
    expect(lakeDepthAt(LAKE_CENTER.x, LAKE_CENTER.z)).toBeGreaterThan(1);
    expect(isSwimmingPosition(LAKE_CENTER.x, LAKE_CENTER.z)).toBe(true);
    expect(lakeWaterAt(LAKE_CENTER.x, LAKE_CENTER.z)).not.toBeNull();
  });
  test('movement settles swimmers at the water surface', () => {
    const state: MovementState = { position: { x: LAKE_CENTER.x, y: terrainHeight(LAKE_CENTER.x, LAKE_CENTER.z), z: LAKE_CENTER.z }, verticalSpeed: 0 };
    moveLocomotion(state, { forward: 0, strafe: 0, cameraX: 0, cameraZ: 1, jump: false }, .2);
    expect(state.position.y).toBeCloseTo(lakeWaterAt(LAKE_CENTER.x, LAKE_CENTER.z)!);
  });
});
