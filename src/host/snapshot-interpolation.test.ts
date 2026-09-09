import {expect, test} from 'bun:test';
import {createAdventure} from '../game/adventure.js';
import {createSnapshotInterpolation} from './snapshot-interpolation.js';

test('remote motion advances continuously between unevenly delivered 20 Hz snapshots', () => {
  const base = createAdventure().snapshot;
  const buffer = createSnapshotInterpolation();
  const packets = Array.from({length: 81}, (_, index) => {
    const time = index / 20;
    return {time, arrival: time + [0.08, 0.12, 0.09, 0.1][index % 4]!};
  });
  let next = 0, previous: number | undefined;
  const speeds: number[] = [];
  for (let frame = 0; frame < 240; frame++) {
    const now = frame / 60;
    while (packets[next] && packets[next]!.arrival <= now) {
      const {time} = packets[next++]!;
      buffer.push(base, [{id: 'walker', name: 'Walker', player: {...base.player, position: {x: time * 4.5, y: 0, z: 0}}}], time);
    }
    const current = buffer.sample(1 / 60).players[0]?.player.position.x;
    if (now > 0.5 && current !== undefined && previous !== undefined) speeds.push((current - previous) * 60);
    previous = current;
  }
  expect(speeds.length).toBeGreaterThan(150);
  expect(Math.min(...speeds)).toBeGreaterThan(4.2);
  expect(Math.max(...speeds)).toBeLessThan(4.8);
});

test('server restart and teleport do not interpolate across unrelated positions', () => {
  const base = createAdventure().snapshot;
  const buffer = createSnapshotInterpolation();
  const push = (time: number, x: number) => buffer.push(base, [{id: 'walker', name: 'Walker', player: {...base.player, position: {x, y: 0, z: 0}}}], time);
  push(10, 0); push(10.05, 30);
  expect(buffer.sample(0.17).players[0]!.player.position.x).toBe(0);
  expect(buffer.sample(0.1).players[0]!.player.position.x).toBe(30);
  push(0, -5);
  expect(buffer.sample(0).players[0]!.player.position.x).toBe(-5);
});

test('a corpse stays at its death position until its respawn snapshot', () => {
  const base = createAdventure().snapshot;
  const threat = base.threats[0]!;
  const buffer = createSnapshotInterpolation();
  buffer.push({...base, threats: [{...threat, health: 0, phase: 'cleared', position: {x: -5, y: 0, z: 10}}]}, [], 10);
  buffer.push({...base, threats: [threat]}, [], 10.05);
  const corpse = buffer.sample(0.17).threats[0]!;
  expect(corpse.health).toBe(0);
  expect(corpse.position.x).toBe(-5);
  const respawn = buffer.sample(0.1).threats[0]!;
  expect(respawn.health).toBe(threat.maximumHealth);
  expect(respawn.position).toEqual(threat.position);
});
