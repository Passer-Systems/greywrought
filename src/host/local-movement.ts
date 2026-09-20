import { classKit } from '../game/class-kit.js';
import { terrainHeight } from '../game/cave-layout.js';
import type { AdventureAction, AdventureSnapshot } from '../game/adventure-types.js';
import { moveLocomotion, moveManeuverPosition, blockedPosition, supportHeight, type MovementManeuver, type MovementCheckpoint, type MovementFrame, type MovementInput, type MovementState } from '../game/movement.js';

const locomotionActions = new Set<AdventureAction>(['forward', 'backward', 'left', 'right', 'jump']);
export function isLocomotionAction(action: AdventureAction): boolean { return locomotionActions.has(action); }

function movementState(snapshot: AdventureSnapshot, checkpoint: MovementCheckpoint): MovementState {
  const position = { ...snapshot.player.position };
  // Server and browser terrain arithmetic can differ by a few ulps. A
  // grounded checkpoint belongs exactly on the receiving simulation's floor.
  if (snapshot.player.grounded) position.y = supportHeight(position.x, position.z);
  return { position, verticalSpeed: checkpoint.verticalSpeed };
}

export class LocalMovement {
  private snapshot: AdventureSnapshot;
  private state: MovementState;
  private held = new Set<AdventureAction>();
  private mouseForward = false;
  private jump = false;
  private cameraX: number;
  private cameraZ: number;
  private sequence = 0;
  private history: MovementFrame[] = [];
  private outgoing: MovementFrame[] = [];
  private moving = false;
  private backpedaling = false;
  private serverTime = -Infinity;
  private maneuver: MovementManeuver | null = null;
  private correction = { x: 0, y: 0, z: 0 };

  private combatLocked(snapshot = this.snapshot): boolean { return snapshot.player.inCombat; }

  constructor(snapshot: AdventureSnapshot, checkpoint: MovementCheckpoint) {
    this.snapshot = snapshot;
    this.sequence = checkpoint.sequence;
    this.state = movementState(snapshot, checkpoint);
    this.moving = snapshot.player.moving; this.backpedaling = snapshot.player.backpedaling;
    this.maneuver = checkpoint.maneuver ? { ...checkpoint.maneuver } : null;
    this.cameraX = snapshot.player.cameraForward.x; this.cameraZ = snapshot.player.cameraForward.z;
  }
  get player(): AdventureSnapshot['player'] {
    const player = this.snapshot.player;
    if (this.snapshot.phase === 'lost') return player;
    const facing = player.maneuver !== 'none' ? player.facing : { x: this.cameraX, y: 0, z: this.cameraZ };
    const x = this.state.position.x + this.correction.x, z = this.state.position.z + this.correction.z;
    const height = this.state.position.y - supportHeight(this.state.position.x, this.state.position.z);
    const position = { x, y: supportHeight(x, z) + Math.max(0, height + this.correction.y), z };
    return { ...player, position: blockedPosition(position.x, position.z) ? { ...this.state.position } : position, cameraForward: { x: this.cameraX, y: 0, z: this.cameraZ }, facing,
      grounded: this.state.position.y === supportHeight(this.state.position.x, this.state.position.z), moving: this.moving, backpedaling: this.backpedaling };
  }
  setAction(action: AdventureAction, pressed: boolean): void {
    if (this.combatLocked() && isLocomotionAction(action) && pressed) return;
    if (pressed) {
      if (action === 'jump' && !this.held.has(action)) this.jump = true;
      this.held.add(action);
    } else this.held.delete(action);
  }
  setMouseForward(active: boolean): void { this.mouseForward = this.combatLocked() ? false : active; }
  setCameraForward(x: number, z: number): void {
    const length = Math.hypot(x, z);
    if (Number.isFinite(length) && length > 1e-9) { this.cameraX = x / length; this.cameraZ = z / length; }
  }
  advance(seconds: number): void {
    if (!Number.isFinite(seconds) || seconds < 0) throw new Error('Elapsed time must be finite and nonnegative.');
    let remaining = Math.min(seconds, 0.25);
    const decay = Math.exp(-20 * remaining);
    this.correction.x *= decay; this.correction.y *= decay; this.correction.z *= decay;
    while (remaining > 1e-9 && this.history.length < 240) {
      const locked = this.combatLocked();
      const input: MovementInput = { forward: locked ? 0 : this.mouseForward ? 1 : Number(this.held.has('forward')) - Number(this.held.has('backward')),
        strafe: locked ? 0 : Number(this.held.has('right')) - Number(this.held.has('left')), cameraX: this.cameraX, cameraZ: this.cameraZ, jump: locked ? false : this.jump };
      const frame: MovementFrame = { sequence: ++this.sequence, seconds: Math.min(remaining, 1 / 60), input };
      this.jump = false;
      this.history.push(frame); this.outgoing.push(frame);
      this.simulate(frame, frame.seconds, true);
      remaining -= frame.seconds;
    }
  }
  private simulate(frame: MovementFrame, seconds: number, beginning: boolean): void {
    if (this.snapshot.phase === 'lost') return;
    if (this.maneuver) {
      const elapsed = Math.min(seconds, this.maneuver.remainingSeconds);
      this.moving = moveManeuverPosition(this.state, this.maneuver, elapsed);
      this.backpedaling = false;
      if (this.maneuver.remainingSeconds > 1e-9) return;
      this.maneuver = null; seconds -= elapsed;
      if (seconds <= 1e-9) return;
    }
    const motion = moveLocomotion(this.state, { ...frame.input, jump: frame.input.jump && beginning }, seconds, classKit(this.snapshot.player.archetype).movementSpeed);
    this.moving = motion.moving; this.backpedaling = motion.backpedaling;
  }
  takeOutgoing(): MovementFrame[] { return this.outgoing.splice(0, 30); }
  reconcile(snapshot: AdventureSnapshot, checkpoint: MovementCheckpoint, serverTime: number): void {
    if (serverTime < this.serverTime) return;
    const previous = this.player.position;
    const enteredCombat = !this.combatLocked() && this.combatLocked(snapshot);
    if (enteredCombat) {
      this.held.clear(); this.mouseForward = false; this.jump = false;
      this.history = []; this.outgoing = [];
    }
    const initialized = this.serverTime !== -Infinity;
    this.serverTime = serverTime; this.snapshot = snapshot;
    this.state = movementState(snapshot, checkpoint);
    this.maneuver = checkpoint.maneuver ? { ...checkpoint.maneuver } : null;
    this.moving = snapshot.player.moving; this.backpedaling = snapshot.player.backpedaling;
    this.history = this.history.filter(frame => frame.sequence > checkpoint.sequence ||
      (frame.sequence === checkpoint.sequence && frame.seconds - checkpoint.elapsed > 1e-9));
    for (const frame of this.history) {
      const elapsed = frame.sequence === checkpoint.sequence ? checkpoint.elapsed : 0;
      this.simulate(frame, frame.seconds - elapsed, elapsed === 0);
    }
    // Preserve continuity only for a genuine reconciliation error; matching
    // acknowledgments never add render lag to normal predicted locomotion.
    const gap = Math.hypot(previous.x - this.state.position.x, previous.y - this.state.position.y, previous.z - this.state.position.z);
    this.correction = initialized && !enteredCombat && snapshot.phase !== 'lost' && gap < 2
      ? { x: previous.x - this.state.position.x, y: previous.y - supportHeight(previous.x, previous.z) - (this.state.position.y - supportHeight(this.state.position.x, this.state.position.z)), z: previous.z - this.state.position.z }
      : { x: 0, y: 0, z: 0 };
  }
}
