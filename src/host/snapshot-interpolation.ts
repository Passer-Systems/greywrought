import type { AdventureSnapshot, Position, ThreatView } from '../game/adventure-types.js';
import type { RemotePlayerView } from '../game/multiplayer-types.js';

interface Frame {
  time: number;
  threats: readonly ThreatView[];
  players: readonly RemotePlayerView[];
}
const delay = 0.15;
function position(a: Position, b: Position, t: number): Position {
  // Respawns and other discontinuities must not travel through the intervening world.
  if (Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) > 10) return a;
  return {x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t};
}
function facing(a: Position, b: Position, t: number): Position {
  const start = Math.atan2(a.x, a.z), end = Math.atan2(b.x, b.z);
  const angle = start + Math.atan2(Math.sin(end - start), Math.cos(end - start)) * t;
  return {x: Math.sin(angle), y: 0, z: Math.cos(angle)};
}

export function createSnapshotInterpolation() {
  const frames: Frame[] = [];
  let clock: number | undefined;
  return {
    push(snapshot: AdventureSnapshot, players: readonly RemotePlayerView[], time: number) {
      const last = frames.at(-1);
      if (last && time === last.time) return;
      if (last && (time < last.time || time - last.time > 1)) { frames.length = 0; clock = undefined; }
      frames.push({time, threats: snapshot.threats, players});
      if (frames.length > 32) frames.shift();
      clock ??= time - delay;
    },
    sample(delta: number): Pick<Frame, 'threats' | 'players'> {
      const newest = frames.at(-1);
      if (!newest || clock === undefined) return {threats: [], players: []};
      // Advance a playback clock, not a target position reset on each packet arrival.
      const buffered = newest.time - clock;
      const rate = buffered > delay + 0.05 ? 1.05 : buffered < delay - 0.05 ? 0.95 : 1;
      clock = Math.min(newest.time, clock + Math.max(0, delta) * rate);
      while (frames.length > 1 && frames[1]!.time <= clock) frames.shift();
      const a = frames[0]!, b = frames[1];
      if (!b || clock <= a.time) return a;
      const t = Math.min(1, (clock - a.time) / (b.time - a.time));
      return {
        threats: a.threats.map(before => {
          const after = b.threats.find(item => item.id === before.id);
          if (!after) return before;
          if ((before.health === 0) !== (after.health === 0)) return before;
          const sameAction = before.phase === after.phase && before.actionSequence === after.actionSequence;
          return {...before,
            position: position(before.position, after.position, t),
            facing: facing(before.facing, after.facing, t),
            motionProgress: before.movementMode === after.movementMode && after.motionProgress >= before.motionProgress
              ? before.motionProgress + (after.motionProgress - before.motionProgress) * t : before.motionProgress,
            remainingSeconds: sameAction ? before.remainingSeconds + (after.remainingSeconds - before.remainingSeconds) * t : before.remainingSeconds,
            fireballs: before.fireballs.map(ball => {
              const next = after.fireballs.find(item => item.id === ball.id);
              return next ? {...ball, remainingSeconds: ball.remainingSeconds + (next.remainingSeconds - ball.remainingSeconds) * t} : ball;
            }),
          };
        }),
        players: a.players.map(before => {
          const after = b.players.find(item => item.id === before.id);
          return after ? {...before, player: {...before.player,
            position: position(before.player.position, after.player.position, t),
            facing: facing(before.player.facing, after.player.facing, t),
          }} : before;
        }),
      };
    },
  };
}
