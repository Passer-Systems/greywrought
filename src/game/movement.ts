import { TOWN_FENCE_BARRIERS } from "./town-elevation.js";
import { WORLD_BOUNDS } from './world-layout.js';
import { CAVE_BARRIERS, terrainHeight } from './cave-layout.js';
import { lakeWaterAt, isSwimmingPosition } from './world-elevation.js';
import { TOWN_BUILDING_BARRIERS } from './town-layout.js';
import type { Position } from './adventure-types.js';

export type Barrier = readonly [left: number, right: number, bottom: number, top: number];
export const THICKET: Barrier = [2, 12, 38, 44];
export const REGION_LANDMARK_BARRIERS: readonly Barrier[] = [
  [198, 206, -28, -20], [103.5, 108.5, 210.5, 215.5],
  [114.2, 119.8, 214.2, 219.8], [-85.5, -78.5, 151.5, 158.5], [27.8, 30.2, 169.8, 172.2],
];
export const MOVEMENT_BARRIERS: readonly Barrier[] = [...TOWN_FENCE_BARRIERS, THICKET, ...CAVE_BARRIERS, ...TOWN_BUILDING_BARRIERS, ...REGION_LANDMARK_BARRIERS];
export interface MovementInput { forward: number; strafe: number; cameraX: number; cameraZ: number; jump: boolean; rise?: boolean; dive?: boolean; }
export interface MovementFrame { sequence: number; seconds: number; input: MovementInput; }
export interface MovementManeuver { kind: 'lunge' | 'bait'; start: Position; destination: Position; remainingSeconds: number; duration: number; }
export interface MovementCheckpoint { sequence: number; elapsed: number; verticalSpeed: number; maneuver?: MovementManeuver | null; }
export interface MovementState { position: { x: number; y: number; z: number }; verticalSpeed: number; breathSeconds?: number; autoSurfacing?: boolean; }
/** Feet support: terrain on land, and 0.8m below the surface once water is deep enough to swim. */
export function supportHeight(x: number, z: number): number {
  const terrain = terrainHeight(x, z), water = lakeWaterAt(x, z);
  return water === null ? terrain : Math.max(terrain, water - 0.8);
}

export const MAX_BREATH_SECONDS = 60;
export function isSubmerged(position: Position): boolean {
  const water = lakeWaterAt(position.x, position.z);
  return water !== null && position.y + 1.15 < water;
}
export function isSwimming(position: Position): boolean {
  return isSwimmingPosition(position.x, position.z) && position.y <= supportHeight(position.x, position.z) + .001;
}
/** Submerged movement preserves world depth while the rising bed still supports feet. */
function swimmingDepth(reference: Position): number | null {
  return isSwimming(reference) && reference.y < supportHeight(reference.x, reference.z) - .001 ? reference.y : null;
}
function heightAtDepth(x: number, z: number, depth: number | null): number {
  const surface = supportHeight(x, z);
  return depth === null ? surface : Math.max(terrainHeight(x, z), Math.min(surface, depth));
}
export function movementHeight(x: number, z: number, reference: Position): number {
  return heightAtDepth(x, z, swimmingDepth(reference));
}
/** Sample a whole movement overlay without rechecking the same swimmer at every vertex. */
export function movementHeightSampler(reference: Position): (x: number, z: number) => number {
  const depth = swimmingDepth(reference);
  return (x, z) => heightAtDepth(x, z, depth);
}
function advanceBreath(state: MovementState, seconds: number): void {
  const breath = state.breathSeconds ?? MAX_BREATH_SECONDS;
  if (isSubmerged(state.position)) {
    state.breathSeconds = Math.max(0, breath - seconds);
    if (state.breathSeconds === 0) state.autoSurfacing = true;
  } else state.breathSeconds = Math.min(MAX_BREATH_SECONDS, breath + seconds * 12);
  if (!isSwimming(state.position) || state.position.y >= supportHeight(state.position.x, state.position.z) - .001) state.autoSurfacing = false;
}
export function blockedPosition(x: number, z: number): boolean {
  return MOVEMENT_BARRIERS.some(([left, right, bottom, top]) => x > left && x < right && z >= bottom && z <= top);
}
export function movePosition(p: MovementState['position'], dx: number, dz: number): void {
  const previous = { ...p };
  const offset = p.y - supportHeight(p.x, p.z);
  const nextX = Math.max(WORLD_BOUNDS.minX, Math.min(WORLD_BOUNDS.maxX, p.x + dx)), nextZ = Math.max(WORLD_BOUNDS.minZ, Math.min(WORLD_BOUNDS.maxZ, p.z + dz));
  if (!blockedPosition(nextX, nextZ)) { p.x = nextX; p.z = nextZ; }
  else {
    if (!blockedPosition(nextX, p.z)) p.x = nextX;
    if (!blockedPosition(p.x, nextZ)) p.z = nextZ;
  }
  p.y = movementHeight(p.x, p.z, previous) + Math.max(0, offset);
}
export function startJump(state: MovementState): void {
  // A swimmer can breach from the surface.  Underwater Space is handled by
  // the rise input in moveLocomotion; only a swimmer already at the surface
  // receives a jump impulse so holding Space cannot launch from the lake bed.
  if (state.position.y === supportHeight(state.position.x, state.position.z) && state.verticalSpeed === 0) state.verticalSpeed = 5.5;
}
export function moveManeuverPosition(state: MovementState, maneuver: MovementManeuver, seconds: number): boolean {
  const old = { ...state.position }, elapsed = Math.min(seconds, maneuver.remainingSeconds);
  movePosition(state.position, (maneuver.destination.x - maneuver.start.x) * elapsed / maneuver.duration,
    (maneuver.destination.z - maneuver.start.z) * elapsed / maneuver.duration);
  maneuver.remainingSeconds = Math.max(0, maneuver.remainingSeconds - seconds);
  const progress = 1 - maneuver.remainingSeconds / maneuver.duration;
  const water = lakeWaterAt(state.position.x, state.position.z);
  const ground = movementHeight(state.position.x, state.position.z, maneuver.start);
  state.position.y = ground;
  advanceBreath(state, elapsed);
  if (maneuver.remainingSeconds <= 1e-9) { state.position.y = ground; state.verticalSpeed = 0; }
  return Math.hypot(state.position.x - old.x, state.position.z - old.z) > 1e-9;
}
export function moveLocomotion(state: MovementState, input: MovementInput, seconds: number, movementSpeed = 5.2): { moving: boolean; backpedaling: boolean } {
  if (input.jump) startJump(state);
  const length = Math.max(1, Math.hypot(input.forward, input.strafe));
  const x = (input.cameraX * input.forward - input.cameraZ * input.strafe) / length;
  const z = (input.cameraZ * input.forward + input.cameraX * input.strafe) / length;
  const old: Position = { ...state.position };
  const speed = movementSpeed * (input.forward < 0 ? 0.64 : 1);
  let remaining = seconds;
  while (remaining > 1e-9) {
    const dt = Math.min(remaining, 1 / 60);
    movePosition(state.position, x * speed * dt, z * speed * dt);
    const water = lakeWaterAt(state.position.x, state.position.z);
    const ground = supportHeight(state.position.x, state.position.z);
    if (water !== null && isSwimmingPosition(state.position.x, state.position.z) && state.position.y <= ground && state.verticalSpeed <= 0) {
      const vertical = state.autoSurfacing ? 1 : Number(input.rise ?? input.jump) - Number(input.dive ?? false);
      state.position.y = Math.max(terrainHeight(state.position.x, state.position.z), Math.min(ground, state.position.y + vertical * 2.2 * dt));
      state.verticalSpeed = 0;
      advanceBreath(state, dt);
      remaining -= dt;
      continue;
    }
    if (state.position.y > ground || state.verticalSpeed > 0) {
      state.position.y = Math.max(ground, state.position.y + state.verticalSpeed * dt - 7 * dt * dt);
      state.verticalSpeed = state.position.y > ground ? state.verticalSpeed - 14 * dt : 0;
    }
    advanceBreath(state, dt);
    remaining -= dt;
  }
  const moving = Math.hypot(state.position.x - old.x, isSwimming(state.position) ? state.position.y - old.y : 0, state.position.z - old.z) > 1e-9;
  return { moving, backpedaling: moving && input.forward < 0 };
}
