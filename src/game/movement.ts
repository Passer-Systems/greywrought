import { WORLD_BOUNDS } from './world-layout.js';
import { CAVE_BARRIERS, terrainHeight } from './cave-layout.js';
import type { Position } from './adventure-types.js';

export type Barrier = readonly [left: number, right: number, bottom: number, top: number];
export const THICKET: Barrier = [2, 12, 38, 44];
export const MOVEMENT_BARRIERS: readonly Barrier[] = [[-22, -3, -0.5, 4], [3, 22, -0.5, 4], THICKET, ...CAVE_BARRIERS];
export interface MovementInput { forward: number; strafe: number; cameraX: number; cameraZ: number; jump: boolean; }
export interface MovementFrame { sequence: number; seconds: number; input: MovementInput; }
export interface MovementManeuver { kind: 'lunge' | 'disengage' | 'bait'; start: Position; destination: Position; remainingSeconds: number; duration: number; }
export interface MovementCheckpoint { sequence: number; elapsed: number; verticalSpeed: number; maneuver?: MovementManeuver | null; }
export interface MovementState { position: { x: number; y: number; z: number }; verticalSpeed: number; }

export function blockedPosition(x: number, z: number): boolean {
  return MOVEMENT_BARRIERS.some(([left, right, bottom, top]) => x > left && x < right && z >= bottom && z <= top);
}
export function movePosition(p: MovementState['position'], dx: number, dz: number): void {
  const height = p.y - terrainHeight(p.x, p.z);
  const nextX = Math.max(WORLD_BOUNDS.minX, Math.min(WORLD_BOUNDS.maxX, p.x + dx)), nextZ = Math.max(WORLD_BOUNDS.minZ, Math.min(WORLD_BOUNDS.maxZ, p.z + dz));
  if (!blockedPosition(nextX, nextZ)) { p.x = nextX; p.z = nextZ; }
  else {
    if (!blockedPosition(nextX, p.z)) p.x = nextX;
    if (!blockedPosition(p.x, nextZ)) p.z = nextZ;
  }
  p.y = terrainHeight(p.x, p.z) + height;
}
export function startJump(state: MovementState): void {
  if (state.position.y === terrainHeight(state.position.x, state.position.z) && state.verticalSpeed === 0) state.verticalSpeed = 5.5;
}
export function moveManeuverPosition(state: MovementState, maneuver: MovementManeuver, seconds: number): boolean {
  const old = { ...state.position }, elapsed = Math.min(seconds, maneuver.remainingSeconds);
  movePosition(state.position, (maneuver.destination.x - maneuver.start.x) * elapsed / maneuver.duration,
    (maneuver.destination.z - maneuver.start.z) * elapsed / maneuver.duration);
  maneuver.remainingSeconds = Math.max(0, maneuver.remainingSeconds - seconds);
  const progress = 1 - maneuver.remainingSeconds / maneuver.duration;
  const ground = terrainHeight(state.position.x, state.position.z);
  state.position.y = ground + (maneuver.kind === 'disengage' ? 4 * 1.2 * progress * (1 - progress) : 0);
  if (maneuver.remainingSeconds <= 1e-9) { state.position.y = ground; state.verticalSpeed = 0; }
  return Math.hypot(state.position.x - old.x, state.position.z - old.z) > 1e-9;
}
export function moveLocomotion(state: MovementState, input: MovementInput, seconds: number): { moving: boolean; backpedaling: boolean } {
  if (input.jump) startJump(state);
  const length = Math.max(1, Math.hypot(input.forward, input.strafe));
  const x = (input.cameraX * input.forward - input.cameraZ * input.strafe) / length;
  const z = (input.cameraZ * input.forward + input.cameraX * input.strafe) / length;
  const old: Position = { ...state.position };
  const speed = 4.5 * (input.forward < 0 ? 0.64 : 1);
  let remaining = seconds;
  while (remaining > 1e-9) {
    const dt = Math.min(remaining, 1 / 60);
    movePosition(state.position, x * speed * dt, z * speed * dt);
    const ground = terrainHeight(state.position.x, state.position.z);
    if (state.position.y > ground || state.verticalSpeed > 0) {
      state.position.y = Math.max(ground, state.position.y + state.verticalSpeed * dt - 7 * dt * dt);
      state.verticalSpeed = state.position.y > ground ? state.verticalSpeed - 14 * dt : 0;
    }
    remaining -= dt;
  }
  const moving = Math.hypot(state.position.x - old.x, state.position.z - old.z) > 1e-9;
  return { moving, backpedaling: moving && input.forward < 0 };
}
