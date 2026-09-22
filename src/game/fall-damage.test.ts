import { expect, test } from 'bun:test';
import { createAdventure, createSharedAdventure } from './adventure.js';
import { terrainHeight } from './cave-layout.js';
import { fallDamage, moveLocomotion, movePosition, supportHeight, type MovementState } from './movement.js';
import { isSwimmingPosition, lakeWaterAt } from './world-elevation.js';
import { LocalMovement } from '../host/local-movement.js';

const idle = { forward: 0, strafe: 0, cameraX: 0, cameraZ: 1, jump: false };
function drop(height: number, x = 0, z = -8) {
  const save = JSON.parse(createAdventure({ now: () => 1000 }).save());
  Object.assign(save.state, { position: { x, y: supportHeight(x, z) + height, z }, verticalSpeed: 0, fallPeakHeight: supportHeight(x, z) + height });
  for (const threat of save.state.threats) if (threat.active) Object.assign(threat, { health: 0, phase: 'cleared', lootClaimed: true, respawnAt: 121000 });
  return createAdventure({ save: JSON.stringify(save), now: () => 1000 });
}

test('ordinary jumps rise higher and linger, while short drops remain harmless', () => {
  const game = createAdventure();
  const ground = game.snapshot.player.position.y;
  game.setAction('jump', true); game.advance(.46);
  expect(game.snapshot.player.position.y - ground).toBeCloseTo(1.385, 2);
  game.advance(.39);
  expect(game.snapshot.player.grounded).toBe(false);
  game.advance(.15);
  expect(game.snapshot.player.grounded).toBe(true);
  expect(game.snapshot.player.health).toBe(100);
  for (const height of [2, 8, 11]) {
    const falling = drop(height); falling.advance(2);
    expect(falling.snapshot.player.grounded).toBe(true);
    expect(falling.snapshot.player.health).toBe(100);
  }
});

test('land impact scales with maximum health, produces feedback, and a large fall uses death handling', () => {
  expect(fallDamage(20, 200)).toBe(106);
  const game = drop(20); game.advance(1);
  expect(game.snapshot.player.health).toBe(100);
  game.advance(1);
  expect(game.snapshot.player.health).toBe(47);
  expect(game.snapshot.combatFeedback).toContainEqual(expect.objectContaining({ targetId: null, kind: 'damage', amount: 53 }));
  expect(game.snapshot.log.some(entry => entry.text.includes('The fall hits you for 53 damage'))).toBe(true);
  const lethal = drop(28); lethal.advance(3);
  expect(lethal.snapshot.player.health).toBe(0);
  expect(lethal.snapshot.phase).toBe('lost');
});

test('deep water cushions a lethal landing; the shallow lake rim does not', () => {
  expect(isSwimmingPosition(-27, -95)).toBe(true);
  const deep = drop(35, -27, -95); deep.advance(3);
  expect(deep.snapshot.player.health).toBe(100);
  expect(deep.snapshot.player.position.y).toBe(supportHeight(-27, -95));
  const shallowX = -2, shallowZ = -95;
  expect(lakeWaterAt(shallowX, shallowZ)).not.toBeNull();
  expect(lakeWaterAt(shallowX, shallowZ)!).toBeGreaterThan(terrainHeight(shallowX, shallowZ));
  expect(isSwimmingPosition(shallowX, shallowZ)).toBe(false);
  const shallow = drop(20, shallowX, shallowZ); shallow.advance(2);
  expect(shallow.snapshot.player.health).toBe(47);
});

test('hills stay supported while airborne motion preserves world height over changing terrain', () => {
  for (const direction of [-1, 1]) {
    const state: MovementState = { position: { x: -62, y: supportHeight(-62, -11), z: -11 }, verticalSpeed: 0 };
    for (let tick = 0; tick < 180; tick++) {
      const result = moveLocomotion(state, { ...idle, forward: direction, cameraX: 1, cameraZ: 0 }, 1 / 60);
      expect(state.position.y).toBe(supportHeight(state.position.x, state.position.z));
      expect(result.landedDistance).toBe(0);
    }
  }
  const state: MovementState = { position: { x: -62, y: supportHeight(-62, -11) + 3, z: -11 }, verticalSpeed: -2 };
  const previous = state.position.y;
  moveLocomotion(state, { ...idle, forward: 1, cameraX: 1, cameraZ: 0 }, 1 / 60);
  expect(state.position.y).toBeCloseTo(previous - 2 / 60 - 6.5 / 3600, 8);
  const ledge = { x: -62, y: supportHeight(-62, -11), z: -11 };
  const height = ledge.y;
  movePosition(ledge, 12, 0);
  expect(height - terrainHeight(ledge.x, ledge.z)).toBeGreaterThan(.35);
  expect(ledge.y).toBe(height);
});

test('save restoration and network prediction retain the full fall after its first metres', () => {
  let game = drop(20); game.advance(1.2);
  expect(game.movementCheckpoint!.verticalSpeed).toBeLessThan(-6);
  const height = game.snapshot.player.position.y;
  game = createAdventure({ save: game.save(), now: () => 1000 });
  expect(game.snapshot.player.position.y).toBe(height);
  expect(game.movementCheckpoint!.fallPeakHeight).toBe(supportHeight(0, -8) + 20);
  game.enableNetworkMovement!();
  const local = new LocalMovement(game.snapshot, game.movementCheckpoint!);
  for (let tick = 0; tick < 60; tick++) {
    local.advance(1 / 60); game.enqueueMovement!(local.takeOutgoing()); game.advance(1 / 60);
    expect(local.player.position.y).toBeCloseTo(game.snapshot.player.position.y, 8);
    local.reconcile(game.snapshot, game.movementCheckpoint!, tick / 60);
  }
  expect(game.snapshot.player.health).toBe(47);
  expect(game.movementCheckpoint!.fallPeakHeight).toBeNull();
});

test('shared-world reconnect and persistence cannot erase an unfinished fall', () => {
  const seed = createSharedAdventure({ now: () => 1000 }); seed.join('falling', 'Falling', 'warrior');
  const save = JSON.parse(seed.save());
  const peak = supportHeight(0, -8) + 20;
  Object.assign(save.characters[0].state, { position: { x: 0, y: peak, z: -8 }, verticalSpeed: 0, fallPeakHeight: peak });
  let world = createSharedAdventure({ save: JSON.stringify(save), now: () => 1000 });
  world.join('falling', 'Falling', 'warrior'); world.advance(1.2); world.leave('falling');
  world = createSharedAdventure({ save: world.save(), now: () => 1000 });
  const resumed = world.join('falling', 'Falling', 'warrior');
  expect(resumed.movementCheckpoint!.fallPeakHeight).toBe(peak);
  expect(world.resume('falling')).toBe(true);
  world.advance(1);
  expect(resumed.snapshot.player.health).toBe(47);
});
