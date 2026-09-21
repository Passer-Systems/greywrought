import { expect, test } from 'bun:test';
import { createAdventure, createSharedAdventure } from './adventure.js';
import { terrainHeight } from './cave-layout.js';
import { LAVA_LAKE, LAVA_LAKE_SHORE, lavaLakeRatio, touchesLavaLake } from './lava-layout.js';

function atLake(height = 0) {
  const saved = JSON.parse(createAdventure().save());
  Object.assign(saved.state, { phase: 'expedition', block: 24, guardSeconds: 2, position: { x: LAVA_LAKE.x, y: terrainHeight(LAVA_LAKE.x, LAVA_LAKE.z) + height, z: LAVA_LAKE.z } });
  return createAdventure({ save: JSON.stringify(saved) });
}

test('molten contact follows the rendered irregular shoreline and its shallow floor', () => {
  for (const [index, a] of LAVA_LAKE_SHORE.entries()) {
    const b = LAVA_LAKE_SHORE[(index + 1) % LAVA_LAKE_SHORE.length]!;
    for (const t of [0, .3, .7]) {
      const dx = (a.x + (b.x - a.x) * t) * LAVA_LAKE.radiusX, dz = (a.z + (b.z - a.z) * t) * LAVA_LAKE.radiusZ;
      expect(lavaLakeRatio(LAVA_LAKE.x + dx, LAVA_LAKE.z + dz)).toBeCloseTo(1, 10);
      for (const scale of [.99, 1.01]) {
        const x = LAVA_LAKE.x + dx * scale, z = LAVA_LAKE.z + dz * scale;
        expect(touchesLavaLake({ x, y: terrainHeight(x, z), z })).toBe(scale < 1);
      }
    }
  }
  expect(touchesLavaLake({ ...LAVA_LAKE, y: LAVA_LAKE.surface + 2 })).toBe(false);
  expect(touchesLavaLake({ ...LAVA_LAKE, y: LAVA_LAKE.surface - 3 })).toBe(false);
  expect(touchesLavaLake({ x: 0, y: LAVA_LAKE.surface, z: 0 })).toBe(false);
});

test('lava deals 24 health per second, ignores armor/block, stops on leaving, and uses normal death handling', () => {
  const game = atLake();
  game.advance(1);
  expect(game.snapshot.player.health).toBe(76);
  expect(game.snapshot.combatFeedback).toContainEqual(expect.objectContaining({ kind: 'damage', amount: 6 }));
  expect(game.snapshot.log.some(entry => entry.text.includes('The lava hits you'))).toBe(true);
  game.setCameraForward(1, 0); game.setAction('forward', true); game.advance(2);
  game.setAction('forward', false);
  expect(lavaLakeRatio(game.snapshot.player.position.x, game.snapshot.player.position.z)).toBeGreaterThan(1);
  const health = game.snapshot.player.health; game.advance(1);
  expect(game.snapshot.player.health).toBe(health);
  const lethal = atLake(); lethal.advance(4.25);
  expect(lethal.snapshot.player.health).toBe(0);
  expect(lethal.snapshot.phase).toBe('lost');
});

test('airborne passage and a jump clear the hot surface until landing', () => {
  const airborne = atLake(6); airborne.advance(.5);
  expect(airborne.snapshot.player.health).toBe(100);
  const jumping = atLake(); jumping.setAction('jump', true); jumping.advance(.6);
  expect(jumping.snapshot.player.health).toBe(100);
  jumping.setAction('jump', false); jumping.advance(.7);
  expect(jumping.snapshot.player.health).toBeLessThan(100);
});

test('shared simulation applies contact damage without client movement packets', () => {
  const seed = createSharedAdventure(); seed.join('lava', 'Lava Walker', 'warrior');
  const saved = JSON.parse(seed.save());
  Object.assign(saved.characters[0].state, { phase: 'expedition', block: 24, guardSeconds: 2, position: { x: LAVA_LAKE.x, y: terrainHeight(LAVA_LAKE.x, LAVA_LAKE.z), z: LAVA_LAKE.z } });
  const world = createSharedAdventure({ save: JSON.stringify(saved) });
  const player = world.join('lava', 'Lava Walker', 'warrior');
  player.enableNetworkMovement!(); world.advance(1);
  expect(player.snapshot.player.health).toBe(76);
});
