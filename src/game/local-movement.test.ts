import { expect, test } from 'bun:test';
import { createAdventure } from './adventure.js';
import type { AdventureSnapshot } from './adventure-types.js';
import type { MovementCheckpoint, MovementFrame } from './movement.js';
import { LocalMovement } from '../host/local-movement.js';
import { terrainHeight } from './cave-layout.js';

function near(actual: AdventureSnapshot['player']['position'], expected: AdventureSnapshot['player']['position']): void {
  expect(actual.x).toBeCloseTo(expected.x, 6);
  expect(actual.y).toBeCloseTo(expected.y, 6);
  expect(actual.z).toBeCloseTo(expected.z, 6);
}

function slopeServer(x: number, z: number) {
  const saved = JSON.parse(createAdventure({ now: () => 1000 }).save());
  Object.assign(saved.state, { phase: 'expedition', position: { x, y: terrainHeight(x!, z!), z } });
  for (const threat of saved.state.threats) if (threat.active) Object.assign(threat, { health: 0, phase: 'cleared', lootClaimed: true, respawnAt: 121000 });
  const server = createAdventure({ save: JSON.stringify(saved), now: () => 1000 });
  server.enableNetworkMovement!();
  return server;
}

test('grounded slope acknowledgments tolerate terrain rounding without interrupting locomotion', () => {
  for (const [x, z] of [[-62, -11], [35, -46]]) for (const direction of [-1, 1]) {
    const server = slopeServer(x!, z!), local = new LocalMovement(server.snapshot, server.movementCheckpoint!);
    const action = direction === 1 ? 'forward' : 'backward';
    local.setCameraForward(1, 0); local.setAction(action, true);
    for (let tick = 0; tick < 60; tick++) {
      local.advance(1 / 60); server.enqueueMovement!(local.takeOutgoing()); server.advance(1 / 60);
      const snapshot = server.snapshot;
      // Server and browser terrain arithmetic can differ by a few ulps.
      const y = snapshot.player.position.y + (tick % 2 ? -1 : 1) * Number.EPSILON * Math.max(1, Math.abs(snapshot.player.position.y)) * 2;
      const rounded = { ...snapshot, player: { ...snapshot.player, position: { ...snapshot.player.position, y } } };
      local.reconcile(rounded, server.movementCheckpoint!, tick / 60);
      expect(local.player.grounded).toBe(true);
      expect(local.player.moving).toBe(true);
      expect(local.player.backpedaling).toBe(direction === -1);
      expect(local.player.position.y).toBe(terrainHeight(local.player.position.x, local.player.position.z));
    }
    local.setAction(action, false); local.advance(1 / 60);
    expect(local.player.moving).toBe(false);
    server.enqueueMovement!(local.takeOutgoing()); server.advance(1 / 60);
    local.reconcile(server.snapshot, server.movementCheckpoint!, 2);
    expect(local.player.moving).toBe(false);
  }
});

test('grounded terrain rounding still permits a jump and airborne reconciliation preserves airtime', () => {
  const server = slopeServer(-62, -11), snapshot = server.snapshot;
  const y = snapshot.player.position.y - Number.EPSILON * Math.abs(snapshot.player.position.y) * 2;
  const rounded = { ...snapshot, player: { ...snapshot.player, position: { ...snapshot.player.position, y } } };
  const local = new LocalMovement(rounded, server.movementCheckpoint!);
  local.setAction('jump', true); local.advance(.1);
  expect(local.player.grounded).toBe(false);
  expect(local.player.position.y - terrainHeight(local.player.position.x, local.player.position.z)).toBeGreaterThan(.4);
  server.enqueueMovement!(local.takeOutgoing()); server.advance(.1);
  local.reconcile(server.snapshot, server.movementCheckpoint!, .1);
  near(local.player.position, server.snapshot.player.position);
  expect(local.player.grounded).toBe(false);
  local.setAction('jump', false);
  for (let tick = 0; tick < 60; tick++) local.advance(1 / 60);
  expect(local.player.grounded).toBe(true);
});

test('prediction rebuilt after a pause continues above the last acknowledged movement sequence', () => {
  const server = createAdventure(); server.enableNetworkMovement!();
  const before = new LocalMovement(server.snapshot, server.movementCheckpoint!);
  before.setAction('forward', true); before.advance(.05);
  server.enqueueMovement!(before.takeOutgoing()); server.advance(.05);
  const checkpoint = server.movementCheckpoint!;
  expect(checkpoint.sequence).toBeGreaterThan(0);
  const resumed = new LocalMovement(server.snapshot, checkpoint);
  resumed.setAction('right', true); resumed.advance(.05);
  const frames = resumed.takeOutgoing();
  expect(frames[0]!.sequence).toBe(checkpoint.sequence + 1);
  expect(server.enqueueMovement!(frames)).toBe(true);
  server.advance(.05);
  near(resumed.player.position, server.snapshot.player.position);
});

test('active combat clears held locomotion and does not replay stale movement frames', () => {
  const server = createAdventure(); server.enableNetworkMovement!();
  const local = new LocalMovement(server.snapshot, server.movementCheckpoint!);
  local.setAction('forward', true); local.advance(.1);
  expect(local.player.position.z).toBeGreaterThan(server.snapshot.player.position.z);
  const active = { ...server.snapshot, player: { ...server.snapshot.player, inCombat: true }, combat: { ...server.snapshot.combat, phase: 'active' as const } };
  local.reconcile(active, server.movementCheckpoint!, 1);
  const locked = local.player.position;
  local.setAction('forward', true); local.setMouseForward(true); local.setAction('jump', true); local.advance(.2);
  expect(local.player.position.x).toBeCloseTo(locked.x, 7);
  expect(local.player.position.z).toBeCloseTo(locked.z, 7);
  expect(local.takeOutgoing().slice(-12).every(frame => frame.input.forward === 0 && frame.input.strafe === 0 && !frame.input.jump)).toBe(true);
});

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
      const speed = tick >= 140 && tick < 170 ? 3.328 : 5.2;
      expect(Math.hypot(local.player.position.x - before.x, local.player.position.z - before.z)).toBeCloseTo(speed / 60, 7);
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
    save.state.position = { x, y: terrainHeight(x!, z!), z };
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
  expect(local.player.position.z).toBeCloseTo(-8 + 5.2 / 60, 7);
  server.advance(1 / 120); local.setAction('forward', false);
  const snapshot = server.snapshot;
  const corrected = { ...snapshot, player: { ...snapshot.player, position: { ...snapshot.player.position, x: 0.5 } } };
  local.reconcile(corrected, server.movementCheckpoint!, 1);
  expect(local.player.position.x).toBeCloseTo(0, 7);
  for (let i = 0; i < 60; i++) local.advance(1 / 60);
  expect(local.player.position.x).toBeCloseTo(0.5, 6);
  const lost = { ...corrected, phase: 'lost' as const, player: { ...corrected.player, health: 0, position: { x: 0, y: terrainHeight(0, -8), z: -8 } } };
  local.reconcile(lost, server.movementCheckpoint!, 2);
  near(local.player.position, lost.player.position);
});

test('authoritative physics lands a jump while network input is temporarily absent', () => {
  const server = createAdventure();
  server.enableNetworkMovement!();
  server.enqueueMovement!([{ sequence: 1, seconds: 1 / 60, input: { forward: 0, strafe: 0, cameraX: 0, cameraZ: 1, jump: true } }]);
  server.advance(1 / 60);
  expect(server.snapshot.player.position.y).toBeGreaterThan(0);
  expect(server.snapshot.player.grounded).toBe(false);

  // A hidden tab may stop producing packets, but the server must still run
  // neutral physics rather than freezing the player in midair.
  server.advance(2);
  expect(server.snapshot.player.position.y).toBe(terrainHeight(server.snapshot.player.position.x, server.snapshot.player.position.z));
  expect(server.snapshot.player.grounded).toBe(true);
  expect(server.snapshot.player.position.x).toBeCloseTo(0, 8);
  expect(server.snapshot.player.position.z).toBeCloseTo(-8, 8);

  server.enqueueMovement!([{ sequence: 2, seconds: 1 / 60, input: { forward: 1, strafe: 0, cameraX: 0, cameraZ: 1, jump: false } }]);
  server.advance(1 / 60);
  expect(server.snapshot.player.position.z).toBeCloseTo(-8 + 5.2 / 60, 7);
});

test('server-announced maneuvers advance between snapshots without predicting combat outcomes', () => {
  const snapshot = createAdventure().snapshot;
  const player = { ...snapshot.player, maneuver: 'bait' as const, maneuverSeconds: 0.45 };
  const local = new LocalMovement({ ...snapshot, player }, { sequence: 0, elapsed: 0, verticalSpeed: 0,
    maneuver: { kind: 'bait', start: player.position, destination: { ...player.position, z: -13 }, remainingSeconds: 0.45, duration: 0.45 } });
  const start = local.player.position;
  local.advance(1 / 60);
  expect(local.player.position.z).toBeLessThan(start.z);
  expect(local.player.position.y).toBe(terrainHeight(local.player.position.x, local.player.position.z));
  expect(local.player.health).toBe(snapshot.player.health);
  const first = local.player.position.z;
  local.advance(1 / 60);
  expect(local.player.position.z - first).toBeCloseTo(first - start.z, 8);
  for (let tick = 2; tick < 60; tick++) local.advance(1 / 60);
  expect(local.player.position.z).toBeCloseTo(-13, 7);
  expect(local.player.grounded).toBe(true);
});

test('entering combat preserves the rendered follow position while locking locomotion', () => {
  const game = createAdventure(); game.enableNetworkMovement!();
  const local = new LocalMovement(game.snapshot, game.movementCheckpoint!);
  local.reconcile(game.snapshot, game.movementCheckpoint!, 0);
  local.setAction('forward', true); local.advance(.1);
  const before = local.player.position;
  const snapshot = game.snapshot;
  const combat = { ...snapshot, player: { ...snapshot.player, inCombat: true } };
  local.reconcile(combat, game.movementCheckpoint!, .1);
  near(local.player.position, before);
  local.setAction('forward', true);
  local.advance(.25);
  expect(local.takeOutgoing().every(frame => frame.input.forward === 0 && frame.input.strafe === 0)).toBe(true);
  expect(Math.abs(local.player.position.z-snapshot.player.position.z)).toBeLessThan(.01);
});
