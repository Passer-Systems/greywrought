import type { Position } from './adventure-types.js';

export type Barrier = readonly [left: number, right: number, bottom: number, top: number];
export const THICKET: Barrier = [2, Infinity, 18, 24];
export const MOVEMENT_BARRIERS: readonly Barrier[] = [[-Infinity, -3, -0.5, 4], [3, Infinity, -0.5, 4], THICKET];
export interface MovementInput { forward: number; strafe: number; cameraX: number; cameraZ: number; jump: boolean; }
export interface MovementFrame { sequence: number; seconds: number; input: MovementInput; }
export interface MovementManeuver { kind: 'lunge' | 'disengage'; start: Position; destination: Position; remainingSeconds: number; duration: number; }
export interface MovementCheckpoint { sequence: number; elapsed: number; verticalSpeed: number; maneuver?: MovementManeuver | null; }
export interface MovementState { position: { x: number; y: number; z: number }; verticalSpeed: number; }

export function blockedPosition(x: number, z: number): boolean {
  return MOVEMENT_BARRIERS.some(([left, right, bottom, top]) => x > left && x < right && z >= bottom && z <= top);
}
export function movePosition(p: MovementState['position'], dx: number, dz: number): void {
  const nextX = Math.max(-12, Math.min(12, p.x + dx)), nextZ = Math.max(-14, Math.min(45, p.z + dz));
  if (!blockedPosition(nextX, nextZ)) { p.x = nextX; p.z = nextZ; }
  else {
    if (!blockedPosition(nextX, p.z)) p.x = nextX;
    if (!blockedPosition(p.x, nextZ)) p.z = nextZ;
  }
}
export function startJump(state: MovementState): void {
  if (state.position.y === 0 && state.verticalSpeed === 0) state.verticalSpeed = 5.5;
}
export function moveManeuverPosition(state: MovementState, maneuver: MovementManeuver, seconds: number): boolean {
  const old = { ...state.position }, elapsed = Math.min(seconds, maneuver.remainingSeconds);
  movePosition(state.position, (maneuver.destination.x - maneuver.start.x) * elapsed / maneuver.duration,
    (maneuver.destination.z - maneuver.start.z) * elapsed / maneuver.duration);
  maneuver.remainingSeconds = Math.max(0, maneuver.remainingSeconds - seconds);
  const progress = 1 - maneuver.remainingSeconds / maneuver.duration;
  state.position.y = maneuver.kind === 'disengage' ? 4 * 1.2 * progress * (1 - progress) : 0;
  if (maneuver.remainingSeconds <= 1e-9) { state.position.y = 0; state.verticalSpeed = 0; }
  return Math.hypot(state.position.x - old.x, state.position.z - old.z) > 1e-9;
}
export function moveLocomotion(state: MovementState, input: MovementInput, seconds: number): { moving: boolean; backpedaling: boolean } {
  if (input.jump) startJump(state);
  const length = Math.max(1, Math.hypot(input.forward, input.strafe));
  const x = (input.cameraX * input.forward - input.cameraZ * input.strafe) / length;
  const z = (input.cameraZ * input.forward + input.cameraX * input.strafe) / length;
  const old: Position = { ...state.position };
  let remaining = seconds;
  while (remaining > 1e-9) {
    const dt = Math.min(remaining, 1 / 60);
    movePosition(state.position, x * 4.5 * dt, z * 4.5 * dt);
    if (state.position.y > 0 || state.verticalSpeed > 0) {
      state.position.y = Math.max(0, state.position.y + state.verticalSpeed * dt - 7 * dt * dt);
      state.verticalSpeed = state.position.y > 0 ? state.verticalSpeed - 14 * dt : 0;
    }
    remaining -= dt;
  }
  const moving = Math.hypot(state.position.x - old.x, state.position.z - old.z) > 1e-9;
  return { moving, backpedaling: moving && input.forward < 0 };
}
