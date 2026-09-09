import type { AdventureAction, AdventureSnapshot } from '../game/adventure-types.js';
import { moveLocomotion, moveManeuverPosition, blockedPosition, type MovementManeuver, type MovementCheckpoint, type MovementFrame, type MovementInput, type MovementState } from '../game/movement.js';

const locomotionActions = new Set<AdventureAction>(['forward', 'backward', 'left', 'right', 'jump']);
export function isLocomotionAction(action: AdventureAction): boolean { return locomotionActions.has(action); }

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

  constructor(snapshot: AdventureSnapshot, checkpoint: MovementCheckpoint) {
    this.snapshot = snapshot;
    this.state = { position: { ...snapshot.player.position }, verticalSpeed: checkpoint.verticalSpeed };
    this.maneuver = checkpoint.maneuver ? { ...checkpoint.maneuver } : null;
    this.cameraX = snapshot.player.cameraForward.x; this.cameraZ = snapshot.player.cameraForward.z;
  }
  get player(): AdventureSnapshot['player'] {
    const player = this.snapshot.player;
    if (this.snapshot.phase === 'lost') return player;
    const facing = player.maneuver !== 'none' ? player.facing : { x: this.cameraX, y: 0, z: this.cameraZ };
    const position = { x: this.state.position.x + this.correction.x, y: Math.max(0, this.state.position.y + this.correction.y), z: this.state.position.z + this.correction.z };
    return { ...player, position: blockedPosition(position.x, position.z) ? { ...this.state.position } : position, cameraForward: { x: this.cameraX, y: 0, z: this.cameraZ }, facing,
      grounded: this.state.position.y === 0, moving: this.moving, backpedaling: this.backpedaling };
  }
  setAction(action: AdventureAction, pressed: boolean): void {
    if (pressed) {
      if (action === 'jump' && !this.held.has(action)) this.jump = true;
      this.held.add(action);
    } else this.held.delete(action);
  }
  setMouseForward(active: boolean): void { this.mouseForward = active; }
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
      const input: MovementInput = { forward: this.mouseForward ? 1 : Number(this.held.has('forward')) - Number(this.held.has('backward')),
        strafe: Number(this.held.has('right')) - Number(this.held.has('left')), cameraX: this.cameraX, cameraZ: this.cameraZ, jump: this.jump };
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
      this.backpedaling = this.moving && this.maneuver.kind === 'disengage';
      if (this.maneuver.remainingSeconds > 1e-9) return;
      this.maneuver = null; seconds -= elapsed;
      if (seconds <= 1e-9) return;
    }
    const motion = moveLocomotion(this.state, { ...frame.input, jump: frame.input.jump && beginning }, seconds);
    this.moving = motion.moving; this.backpedaling = motion.backpedaling;
  }
  takeOutgoing(): MovementFrame[] { return this.outgoing.splice(0, 30); }
  reconcile(snapshot: AdventureSnapshot, checkpoint: MovementCheckpoint, serverTime: number): void {
    if (serverTime < this.serverTime) return;
    const previous = this.player.position;
    const initialized = this.serverTime !== -Infinity;
    this.serverTime = serverTime; this.snapshot = snapshot;
    this.state = { position: { ...snapshot.player.position }, verticalSpeed: checkpoint.verticalSpeed };
    this.maneuver = checkpoint.maneuver ? { ...checkpoint.maneuver } : null;
    this.moving = false; this.backpedaling = false;
    this.history = this.history.filter(frame => frame.sequence > checkpoint.sequence ||
      (frame.sequence === checkpoint.sequence && frame.seconds - checkpoint.elapsed > 1e-9));
    for (const frame of this.history) {
      const elapsed = frame.sequence === checkpoint.sequence ? checkpoint.elapsed : 0;
      this.simulate(frame, frame.seconds - elapsed, elapsed === 0);
    }
    // Preserve continuity only for a genuine reconciliation error; matching
    // acknowledgments never add render lag to normal predicted locomotion.
    const gap = Math.hypot(previous.x - this.state.position.x, previous.y - this.state.position.y, previous.z - this.state.position.z);
    this.correction = initialized && snapshot.phase !== 'lost' && gap < 2
      ? { x: previous.x - this.state.position.x, y: previous.y - this.state.position.y, z: previous.z - this.state.position.z }
      : { x: 0, y: 0, z: 0 };
  }
}
