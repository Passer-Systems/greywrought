import { expect, test } from 'bun:test';
import { createAdventure } from './adventure.js';
import type { AdventureSnapshot } from './adventure-types.js';
import type { MovementCheckpoint, MovementFrame } from './movement.js';
import { LocalMovement } from '../host/local-movement.js';

function near(actual: AdventureSnapshot['player']['position'], expected: AdventureSnapshot['player']['position']): void {
  expect(actual.x).toBeCloseTo(expected.x, 6);
  expect(actual.y).toBeCloseTo(expected.y, 6);
  expect(actual.z).toBeCloseTo(expected.z, 6);
}

test('delayed and jittered acknowledgments preserve immediate speed, turns, release, mouse priority and jumping', () => {
  const server = createAdventure(), solo = createAdventure();
  server.enableNetworkMovement!();
  const local = new LocalMovement(server.snapshot, server.movementCheckpoint!);
  local.reconcile(server.snapshot, server.movementCheckpoint!, 0);
  const uplink: { at: number; frames: MovementFrame[] }[] = [];
  const downlink: { at: number; snapshot: AdventureSnapshot; checkpoint: MovementCheckpoint; time: number }[] = [];
  let lastUpload = 0, lastDownload = 0;
  for (let tick = 0; tick < 240; tick++) {
    if (tick === 0) { local.setAction('forward', true); solo.setAction('forward', true); }
    if (tick === 25) { local.setAction('jump', true); solo.setAction('jump', true); }
    if (tick === 45) { local.setCameraForward(1, 0); solo.setCameraForward(1, 0); }
    if (tick === 65) { local.setAction('right', true); solo.setAction('right', true); }
    if (tick === 80) {
      for (const game of [local, solo]) { game.setAction('forward', false); game.setAction('right', false); }
    }
    if (tick === 110) for (const game of [local, solo]) { game.setAction('backward', true); game.setMouseForward(true); }
    if (tick === 140) for (const game of [local, solo]) { game.setMouseForward(false); }
    if (tick === 170) for (const game of [local, solo]) { game.setAction('backward', false); }
    const before = local.player.position;
    local.advance(1 / 60); solo.advance(1 / 60);
    near(local.player.position, solo.snapshot.player.position);
    if (tick < 80 || (tick >= 110 && tick < 170)) {
      expect(Math.hypot(local.player.position.x - before.x, local.player.position.z - before.z)).toBeCloseTo(4.5 / 60, 7);
    } else {
      expect(local.player.position.x).toBeCloseTo(before.x, 7);
      expect(local.player.position.z).toBeCloseTo(before.z, 7);
    }
    if (tick % 3 === 0) {
      const frames = local.takeOutgoing();
      lastUpload = Math.max(lastUpload, tick + 5 + (tick % 11));
      uplink.push({ at: lastUpload, frames });
    }
    while (uplink[0] && uplink[0].at <= tick) server.enqueueMovement!(uplink.shift()!.frames);
    server.advance(1 / 60);
    if (tick % 3 === 0) {
      lastDownload = Math.max(lastDownload, tick + 7 + (tick % 13));
      downlink.push({ at: lastDownload, snapshot: server.snapshot, checkpoint: server.movementCheckpoint!, time: tick / 60 });
    }
    while (downlink[0] && downlink[0].at <= tick) {
      const frame = downlink.shift()!, position = local.player.position;
      local.reconcile(frame.snapshot, frame.checkpoint, frame.time);
      near(local.player.position, position);
    }
  }
  expect(local.player.grounded).toBe(true);
  expect(local.player.moving).toBe(false);
});

test('prediction and server retain gate, thicket, world bounds and jump collision', () => {
  for (const [x, z, cameraX, cameraZ] of [[5, -1, 0, 1], [3, 17.5, 0, 1], [11.8, -8, 1, 0]]) {
    const save = JSON.parse(createAdventure().save());
    save.state.position = { x, y: 0, z };
    const server = createAdventure({ save: JSON.stringify(save) }); server.enableNetworkMovement!();
    const local = new LocalMovement(server.snapshot, server.movementCheckpoint!);
    local.setCameraForward(cameraX!, cameraZ!); local.setAction('forward', true); local.setAction('jump', true);
    for (let tick = 0; tick < 90; tick++) {
      local.advance(1 / 60); server.enqueueMovement!(local.takeOutgoing()); server.advance(1 / 60);
      near(local.player.position, server.snapshot.player.position);
      local.reconcile(server.snapshot, server.movementCheckpoint!, tick / 60);
    }
  }
});

test('partial input acknowledgments replay only remaining duration and authoritative corrections settle', () => {
  const server = createAdventure(); server.enableNetworkMovement!();
  const local = new LocalMovement(server.snapshot, server.movementCheckpoint!);
  local.reconcile(server.snapshot, server.movementCheckpoint!, 0);
  local.setAction('forward', true); local.advance(1 / 60);
  server.enqueueMovement!(local.takeOutgoing()); server.advance(1 / 120);
  expect(server.movementCheckpoint!.elapsed).toBeCloseTo(1 / 120, 8);
  local.reconcile(server.snapshot, server.movementCheckpoint!, 1 / 120);
  expect(local.player.position.z).toBeCloseTo(-8 + 4.5 / 60, 7);
  server.advance(1 / 120); local.setAction('forward', false);
  const snapshot = server.snapshot;
  const corrected = { ...snapshot, player: { ...snapshot.player, position: { ...snapshot.player.position, x: 0.5 } } };
  local.reconcile(corrected, server.movementCheckpoint!, 1);
  expect(local.player.position.x).toBeCloseTo(0, 7);
  for (let i = 0; i < 60; i++) local.advance(1 / 60);
  expect(local.player.position.x).toBeCloseTo(0.5, 6);
  const lost = { ...corrected, phase: 'lost' as const, player: { ...corrected.player, health: 0, position: { x: 0, y: 0, z: -8 } } };
  local.reconcile(lost, server.movementCheckpoint!, 2);
  near(local.player.position, lost.player.position);
});

test('server-announced maneuvers advance between snapshots without predicting combat outcomes', () => {
  const snapshot = createAdventure().snapshot;
  const player = { ...snapshot.player, maneuver: 'disengage' as const, maneuverSeconds: 0.8 };
  const local = new LocalMovement({ ...snapshot, player }, { sequence: 0, elapsed: 0, verticalSpeed: 0,
    maneuver: { kind: 'disengage', start: player.position, destination: { ...player.position, z: -13 }, remainingSeconds: 0.8, duration: 0.8 } });
  const start = local.player.position;
  local.advance(1 / 60);
  expect(local.player.position.z).toBeLessThan(start.z);
  expect(local.player.position.y).toBeGreaterThan(0);
  expect(local.player.health).toBe(snapshot.player.health);
  const first = local.player.position.z;
  local.advance(1 / 60);
  expect(local.player.position.z - first).toBeCloseTo(first - start.z, 8);
  for (let tick = 2; tick < 60; tick++) local.advance(1 / 60);
  expect(local.player.position.z).toBeCloseTo(-13, 7);
  expect(local.player.grounded).toBe(true);
});
