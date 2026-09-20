import { expect, test } from 'bun:test';
import { createAdventure, createSharedAdventure } from './adventure.js';
import { inTown, migrateSpatialLayout, WORLD_BOUNDS } from './world-layout.js';
import { blockedPosition, movePosition } from './movement.js';
import { terrainHeight } from './cave-layout.js';

function walk(game: ReturnType<typeof createAdventure>, x: number, z: number) {
  const from = game.snapshot.player.position;
  game.setCameraForward(x - from.x, z - from.z); game.setAction('forward', true);
  game.advance(Math.hypot(x - from.x, z - from.z) / 5.2); game.setAction('forward', false);
  expect(game.snapshot.player.position.x).toBeCloseTo(x, 5);
  expect(game.snapshot.player.position.z).toBeCloseTo(z, 5);
}

test('town has a physical boundary; the southern meadow and east trail remain expeditions', () => {
  expect(inTown({ x: 0, z: -39 })).toBe(true);
  expect(inTown({ x: 0, z: -41 })).toBe(false);
  expect(inTown({ x: 28, z: -46 })).toBe(false);
  const game = createAdventure();
  walk(game, 0, -42); expect(game.snapshot.phase).toBe('expedition');
  walk(game, 0, -122); walk(game, -62, -122); walk(game, -62, -76); walk(game, 20, -76); walk(game, 20, -46); walk(game, 28, -46);
  expect(game.snapshot.phase).toBe('expedition');
  expect(game.snapshot.threats.some(t => t.aggro)).toBe(false);
  walk(game, 0, -46); walk(game, 0, -22);
  expect(game.snapshot.phase).toBe('town');
  walk(game, 0, 19);
  expect(game.snapshot.threats.some(t => t.aggro)).toBe(false);
  expect(game.snapshot.threats.find(t => t.id === 'scout')!.homePosition.z).toBe(30);
});

test('salvage extracts only on returning to town and quest items stay carried', () => {
  const seed = JSON.parse(createAdventure().save());
  Object.assign(seed.state, { phase: 'expedition', position: { x: 0, y: 0, z: -46 }, cargo: 6, carriedSalvage: 2, carriedRelics: 1 });
  seed.state.chapter.accepted = ['cold-hands', 'last-shift'];
  const game = createAdventure({ save: JSON.stringify(seed) });
  const supplies = game.snapshot.supplies;
  game.advance(.1); expect(game.snapshot.supplies).toBe(supplies);
  walk(game, 0, -23);
  expect(game.snapshot.supplies).toBe(supplies + 5);
  const saved = JSON.parse(game.save()).state;
  expect(saved.cargo).toBe(3); expect(saved.carriedRelics).toBe(1);
  expect(saved.carriedSalvage).toBe(0);
});

test('movement reaches the larger world bounds and expanded positions survive save reload', () => {
  const p = { x: 20, y: 0, z: -70 };
  movePosition(p, 1000, -1000);
  expect(p).toEqual({ x: WORLD_BOUNDS.maxX, y: terrainHeight(WORLD_BOUNDS.maxX, WORLD_BOUNDS.minZ), z: WORLD_BOUNDS.minZ });
  const seed = JSON.parse(createAdventure().save());
  seed.state.phase = 'expedition'; seed.state.position = p;
  expect(createAdventure({ save: JSON.stringify(seed) }).snapshot.player.position).toEqual(p);
});

test('returning characters resume clear of newly built town walls, including private origins', () => {
  const world = createSharedAdventure(); world.join('resident', 'Resident', 'warrior'); world.pause('resident');
  const saved = JSON.parse(world.save());
  Object.assign(saved.characters[0].state, { position: { x: -14, y: 0, z: -10 }, supplies: 37, health: 71 });
  saved.instances[0].origin = { x: -14, y: 0, z: -10 };
  const restored = createSharedAdventure({ save: JSON.stringify(saved) });
  const resident = restored.join('resident', 'Resident', 'warrior');
  expect(blockedPosition(resident.snapshot.player.position.x, resident.snapshot.player.position.z)).toBe(false);
  expect(resident.snapshot.supplies).toBe(37); expect(resident.snapshot.player.health).toBe(71);
  expect(restored.resume('resident')).toBe(true); expect(restored.rejoin('resident')).toBe(true);
  expect(blockedPosition(resident.snapshot.player.position.x, resident.snapshot.player.position.z)).toBe(false);
  expect(blockedPosition(-14, -10)).toBe(true);
  const before = resident.snapshot.player.position.x;
  resident.setAction('forward', true); resident.setCameraForward(-1, 0); restored.advance(.2);
  expect(resident.snapshot.player.position.x).toBeLessThan(before);
});

test('old spatial saves move points once while preserving combat directions and progress', () => {
  const base = createSharedAdventure(); base.join('traveler', 'Traveler', 'warrior');
  const seed = JSON.parse(base.save()); delete seed.spatialLayout; delete seed.terrainLayout;
  seed.world.threats = seed.world.threats.filter((threat: { id: string }) => !threat.id.startsWith('cave-'));
  Object.assign(seed.characters[0].state, { phase: 'expedition', position: { x: -3, y: 0, z: 12 }, health: 73, cargo: 3, supplies: 19 });
  for (const t of seed.world.threats) {
    t.position.z -= 20; t.targetPosition.z -= 20;
    if (t.wolf) t.wolf.attackOrigin.z -= 20;
  }
  const migrated = createSharedAdventure({ save: JSON.stringify(seed) });
  const game = migrated.join('traveler', 'Traveler', 'warrior');
  expect(game.snapshot.player.position.z).toBe(32);
  expect(game.snapshot.player.health).toBe(73);
  expect(game.snapshot.supplies).toBe(19);
  expect(JSON.parse(migrated.save()).characters[0].state.cargo).toBe(3);
  expect(game.snapshot.threats.find(t => t.id === 'scout')!.position.z).toBe(30);
  const reloaded = createSharedAdventure({ save: migrated.save() }).join('traveler', 'Traveler', 'warrior');
  expect(reloaded.snapshot.player.position).toEqual(game.snapshot.player.position);
  const motion = { state: { position: { x: 0, y: 0, z: 10 }, maneuver: { start: { z: 10 }, destination: { z: 15 }, facing: { x: 0, y: 0, z: 1 } } } };
  migrateSpatialLayout(motion);
  expect(motion.state.maneuver.destination.z).toBe(35);
  expect(motion.state.maneuver.facing.z).toBe(1);
});
