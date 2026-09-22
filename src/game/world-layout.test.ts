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
  Object.assign(saved.characters[0].state, { position: { x: -14, y: terrainHeight(-14, -10), z: -10 }, supplies: 37, health: 71 });
  saved.instances[0].members[0].origin = { x: -14, y: terrainHeight(-14, -10), z: -10 };
  const restored = createSharedAdventure({ save: JSON.stringify(saved) });
  const resident = restored.join('resident', 'Resident', 'warrior');
  expect(blockedPosition(resident.snapshot.player.position.x, resident.snapshot.player.position.z)).toBe(false);
  expect(resident.snapshot.supplies).toBe(37); expect(resident.snapshot.player.health).toBe(71);
  expect(restored.resume('resident')).toBe(true); expect(restored.rejoin('resident')).toBe(true);
  expect(restored.session('resident').mode).toBe('viewing');
  expect(restored.rejoin('resident')).toBe(true);
  expect(restored.session('resident').mode).toBe('shared');
  expect(blockedPosition(resident.snapshot.player.position.x, resident.snapshot.player.position.z)).toBe(false);
  expect(blockedPosition(-14, -10)).toBe(true);
  const before = resident.snapshot.player.position.x;
  resident.setAction('forward', true); resident.setCameraForward(-1, 0); restored.advance(.2);
  expect(resident.snapshot.player.position.x).toBeLessThan(before);
});

test('old spatial saves move points once while preserving combat directions and progress', () => {
  const base = createSharedAdventure(); base.join('traveler', 'Traveler', 'warrior');
  const seed = JSON.parse(base.save()); delete seed.spatialLayout; delete seed.terrainLayout; delete seed.forestLayout;
  seed.world.threats = seed.world.threats.filter((threat: { id: string }) => !threat.id.startsWith('cave-'));
  Object.assign(seed.characters[0].state, { phase: 'expedition', position: { x: -3, y: 0, z: 12 }, health: 73, cargo: 3, supplies: 19 });
  for (const t of seed.world.threats) {
    for (const position of [t.position, t.targetPosition, t.turnTarget, ...(t.wolf ? [t.wolf.attackOrigin] : [])]) {
      position.z -= 20; position.y = 0;
    }
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

test('starting creatures patrol separate clearings outside one another’s help range', () => {
  const game = createAdventure();
  for (let tick = 0; tick < 150; tick++) {
    game.advance(.2);
    const threats = game.snapshot.threats.filter(t => ['scout', 'nest', 'patrol', 'warder'].includes(t.id));
    for (const [index, threat] of threats.entries()) {
      expect(blockedPosition(threat.position.x, threat.position.z)).toBe(false);
      expect(threat.position.y).toBeCloseTo(terrainHeight(threat.position.x, threat.position.z), 6);
      for (const other of threats.slice(index + 1)) expect(Math.hypot(threat.position.x - other.position.x, threat.position.z - other.position.z)).toBeGreaterThan(threat.callForHelpRange);
    }
  }
});

test('the first road encounter engages only the Watchman', () => {
  const data = JSON.parse(createAdventure().save());
  Object.assign(data.state, {phase: 'expedition', position: {x: -3, y: 0, z: 25}});
  const game = createAdventure({save: JSON.stringify(data)});
  game.advance(.05);
  expect(game.snapshot.threats.filter(t => t.aggro).map(t => t.id)).toEqual(['scout']);
});

test('old forest saves move idle residents once while preserving corpses, fights and character progress', () => {
  for (const mode of ['idle', 'combat', 'corpse'] as const) {
    const data = JSON.parse(createAdventure().save()); delete data.forestLayout;
    data.state.coins = 12345; data.state.health = 73;
    const hound = data.state.threats.find((t: {id: string}) => t.id === 'patrol');
    Object.assign(hound, {position: {x: -6, y: 0, z: 37}, targetPosition: {x: -6, y: 0, z: 37}});
    if (mode === 'combat') Object.assign(hound, {aggro: true, phase: 'preparation', health: 51, combatants: ['solo']});
    if (mode === 'corpse') Object.assign(hound, {phase: 'cleared', health: 0, lootClaimed: false, respawnAt: Date.now() + 3_600_000});
    const game = createAdventure({save: JSON.stringify(data)});
    const restored = game.snapshot.threats.find(t => t.id === 'patrol')!;
    expect(restored.position).toEqual(mode === 'idle' ? restored.homePosition : hound.position);
    expect(restored.health).toBe(hound.health);
    expect(game.snapshot.coins).toBe(12345); expect(game.snapshot.player.health).toBe(73);
    expect(createAdventure({save: game.save()}).snapshot.threats.find(t => t.id === 'patrol')!.position).toEqual(restored.position);
  }
});

test('shared worlds and private saves restore the separated forest residents', () => {
  const seed = createSharedAdventure(); seed.join('traveler', 'Traveler', 'warrior'); seed.pause('traveler');
  const data = JSON.parse(seed.save()); delete data.forestLayout;
  for (const world of [data.world, data.instances[0].world]) {
    const bee = world.threats.find((t: {id: string}) => t.id === 'nest');
    bee.position = {x: -1, y: 0, z: 35}; bee.targetPosition = {...bee.position};
  }
  const world = createSharedAdventure({save: JSON.stringify(data)});
  const player = world.join('traveler', 'Traveler', 'warrior');
  const bee = () => player.snapshot.threats.find(t => t.id === 'nest')!;
  expect(bee().position).toEqual(bee().homePosition);
  expect(world.resume('traveler')).toBe(true); expect(world.rejoin('traveler')).toBe(true);
  expect(bee().position).toEqual(bee().homePosition);
});
