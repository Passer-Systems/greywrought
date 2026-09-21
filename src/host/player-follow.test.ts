import { expect, test } from 'bun:test';
import { createAdventure } from '../game/adventure.js';
import { terrainHeight } from '../game/cave-layout.js';
import { PlayerFollow } from './player-follow.js';
import { LocalMovement } from './local-movement.js';

test('follow uses ordinary authoritative movement, stops near two metres, and preserves camera direction', () => {
  const saved = JSON.parse(createAdventure({ now: () => 1000 }).save());
  Object.assign(saved.state, { phase: 'expedition', position: { x: -62, y: terrainHeight(-62, -11), z: -11 } });
  for (const threat of saved.state.threats) if (threat.active) Object.assign(threat, { health: 0, phase: 'cleared', lootClaimed: true, respawnAt: 121000 });
  const server = createAdventure({ save: JSON.stringify(saved), now: () => 1000 });
  server.enableNetworkMovement!();
  const local = new LocalMovement(server.snapshot, server.movementCheckpoint!);
  local.setCameraForward(0, -1);
  const destination = { x: -54, z: -11 };
  local.setFollowDestination(destination);
  for (let tick = 0; tick < 150; tick++) {
    local.advance(1 / 60); server.enqueueMovement!(local.takeOutgoing()); server.advance(1 / 60);
    local.reconcile(server.snapshot, server.movementCheckpoint!, tick / 60);
  }
  expect(local.player.position.x).toBeCloseTo(server.snapshot.player.position.x, 6);
  expect(Math.hypot(destination.x - local.player.position.x, destination.z - local.player.position.z)).toBeGreaterThan(1.9);
  expect(Math.hypot(destination.x - local.player.position.x, destination.z - local.player.position.z)).toBeLessThanOrEqual(2);
  expect(local.player.moving).toBe(false);
  expect(local.player.cameraForward).toEqual({ x: 0, y: 0, z: -1 });
  expect(local.player.facing.x).toBeCloseTo(1);
});

test('follow stays selected through either player entering combat', () => {
  const player = createAdventure().snapshot.player;
  const target = { id: 'friend', name: 'Friend', player: { ...player, position: { ...player.position, x: 10 } } };
  const follow = new PlayerFollow(); follow.targetId = target.id;
  expect(follow.destination(player, [{ ...target, player: { ...target.player, inCombat: true } }], null)).toEqual(target.player.position);
  expect(follow.targetId).toBe(target.id);
  expect(follow.destination({ ...player, inCombat: true }, [target], null)).toEqual(target.player.position);
  expect(follow.targetId).toBe(target.id);
  expect(follow.destination(player, [target], null)).toEqual(target.player.position);
});

test('follow ends when either player dies, flies, or the target leaves', () => {
  const player = createAdventure().snapshot.player;
  const target = { id: 'friend', name: 'Friend', player };
  const follow = new PlayerFollow();
  follow.targetId = target.id;
  expect(follow.destination(player, [target], null)).toEqual(player.position);
  for (const changed of [{ ...player, health: 0 }, { ...player, flight: { from: 'yard' as const, to: 'suture' as const, elapsed: 0 } }]) {
    follow.targetId = target.id;
    expect(follow.destination(changed, [target], null)).toBeNull();
    expect(follow.targetId).toBeNull();
    follow.targetId = target.id;
    expect(follow.destination(player, [{ ...target, player: changed }], null)).toBeNull();
  }
  follow.targetId = target.id;
  expect(follow.destination(player, [], null)).toBeNull();
});
