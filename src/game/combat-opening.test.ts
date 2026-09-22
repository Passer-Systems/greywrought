import { expect, test } from 'bun:test';
import { createAdventure, createSharedAdventure } from './adventure.js';
import { tap } from './yard-test-fixtures.js';

function seed() {
  const saved = JSON.parse(createAdventure({ archetype: 'mage', now: () => 1000 }).save());
  Object.assign(saved.state, { phase: 'expedition', position: { x: -3, y: 0, z: 22 } });
  for (const threat of saved.state.threats) if (threat.active && threat.id !== 'scout') Object.assign(threat, { health: 0, phase: 'cleared', lootClaimed: true, respawnAt: 121000 });
  return saved;
}

function detected() {
  const saved = seed(); saved.state.position.z = 28;
  const game = createAdventure({ save: JSON.stringify(saved), now: () => 1000 }); game.advance(.01); return game;
}

test('an unaware enemy takes one immediate opening hit with no duplicate queued attack', () => {
  const game = createAdventure({ save: JSON.stringify(seed()), now: () => 1000 });
  game.selectTarget('scout');
  expect(game.snapshot.combat.openingStrikeAvailable).toBe(true);
  const before = game.snapshot;
  tap(game, 'strike');
  expect(game.snapshot.player.attackSequence).toBe(before.player.attackSequence + 1);
  expect(game.snapshot.threats[0]!.health).toBeLessThan(before.threats[0]!.health);
  expect(game.snapshot.player.stamina).toBe(before.player.stamina);
  expect(game.snapshot.combat.queued).toEqual([]);
  expect(game.snapshot.combat.gatheringRemainingSeconds).toBe(5);
  expect(game.snapshot.combat.openingStrikeAvailable).toBe(false);
  const struck = game.snapshot.threats[0]!.health;
  expect(game.readyCombat()).toBe(true);
  expect(game.snapshot.combat.phase).toBe('active');
  game.advance(.1);
  expect(game.snapshot.threats[0]!.health).toBe(struck);
  expect(game.snapshot.player.attackSequence).toBe(before.player.attackSequence + 1);
});

test('detected attacks queue normally and Ready starts the turn immediately', () => {
  const game = detected(), before = game.snapshot.threats[0]!.health;
  expect(game.snapshot.combat.openingStrikeAvailable).toBe(false);
  tap(game, 'strike'); expect(game.snapshot.threats[0]!.health).toBe(before);
  expect(game.snapshot.combat.queued).toHaveLength(1);
  expect(game.readyCombat()).toBe(true);
  expect(game.snapshot.combat.phase).toBe('active');
  expect(game.snapshot.threats[0]!.health).toBeLessThan(before);
});

test('a lethal opening hit immediately credits the defeat and preserves its rewards through saving', () => {
  const saved = seed(); saved.state.threats[0].health = 1;
  saved.state.chapter.accepted.push('roll-call');
  const game = createAdventure({ save: JSON.stringify(saved), now: () => 1000 });
  game.selectTarget('scout'); tap(game, 'strike');
  expect(game.snapshot.threats[0]!.health).toBe(0);
  expect(game.snapshot.player.attackSequence).toBe(1);
  expect(game.snapshot.progression.experience).toBe(0);
  expect(game.snapshot.quests.find(quest => quest.id === 'roll-call')!.status).toBe('ready');
  expect(game.snapshot.loot.find(loot => loot.sourceId === 'scout')!.available).toBe(true);
  expect(game.snapshot.combat.queued).toEqual([]);
  expect(game.snapshot.combat.phase).toBe('idle');
  const restored = createAdventure({ save: game.save(), now: () => 1000 });
  expect(restored.snapshot.progression.experience).toBe(0);
  expect(restored.snapshot.threats[0]!.health).toBe(0);
});

test.each([4.99, 5, 5.01])('a newly attacked enemy joins the opening cycle only before the fixed deadline (%s seconds)', elapsed => {
  const game = detected(); game.advance(elapsed);
  const saved = JSON.parse(game.save());
  Object.assign(saved.state.threats.find((threat: { id: string }) => threat.id === 'nest'), { health: 72, phase: 'patrol', lootClaimed: false, position: { x: 0, y: 0, z: 29 }, targetPosition: { x: 0, y: 0, z: 29 } });
  const restored = createAdventure({ save: JSON.stringify(saved), now: () => 1000 });
  const scout = restored.snapshot.threats[0]!.windowAction, cycle = restored.snapshot.combat.cycle;
  restored.selectTarget('nest'); tap(restored, 'strike');
  expect(restored.snapshot.combat.cycle).toBe(cycle);
  expect(restored.snapshot.threats[0]!.windowAction).toEqual(scout);
  expect(restored.snapshot.threats[1]!.joinsNextWindow).toBe(elapsed >= 5);
  expect(restored.snapshot.threats[1]!.windowAction !== null).toBe(elapsed < 5);
  expect(restored.snapshot.combat.gatheringRemainingSeconds).toBeCloseTo(Math.max(0, 5 - elapsed), 7);
});

test('social helpers join opening planning before Ready without rerolling casts', () => {
  const saved = seed(); saved.state.position = { x: -3, y: 0, z: 50 };
  Object.assign(saved.state.threats[0], { health: 0, phase: 'cleared', lootClaimed: true });
  Object.assign(saved.state.threats.find((threat: { id: string }) => threat.id === 'warder'), { health: 72, phase: 'patrol', lootClaimed: false, position: { x: -3, y: 0, z: 47 }, targetPosition: { x: -3, y: 0, z: 47 } });
  Object.assign(saved.state.threats.find((threat: { id: string }) => threat.id === 'patrol'), { health: 72, phase: 'patrol', lootClaimed: false, position: { x: 0, y: 0, z: 39 }, targetPosition: { x: 0, y: 0, z: 39 } });
  const game = createAdventure({ save: JSON.stringify(saved), now: () => 1000 });
  game.selectTarget('warder'); tap(game, 'strike');
  const before = game.snapshot, rng = JSON.parse(game.save()).state.threats[2].rng;
  game.advance(.1);
  expect(game.snapshot.threats[3]!.aggro).toBe(true);
  expect(game.snapshot.threats[3]!.joinsNextWindow).toBe(false);
  expect(game.snapshot.threats[3]!.windowAction).not.toBeNull();
  expect(game.snapshot.threats[2]!.windowAction).toEqual(before.threats[2]!.windowAction);
  expect(JSON.parse(game.save()).state.threats[2].rng).toBe(rng);
  expect(game.snapshot.combat.queued).toEqual(before.combat.queued);
  expect(game.snapshot.combat.ready).toBe(false);
});

test('social helpers arriving after Ready join the next safe planning cycle', () => {
  const saved = seed(); saved.state.position = { x: -3, y: 0, z: 50 };
  Object.assign(saved.state.threats[0], { health: 0, phase: 'cleared', lootClaimed: true });
  Object.assign(saved.state.threats.find((threat: { id: string }) => threat.id === 'warder'), { health: 72, phase: 'patrol', lootClaimed: false, position: { x: -3, y: 0, z: 47 }, targetPosition: { x: -3, y: 0, z: 47 } });
  Object.assign(saved.state.threats.find((threat: { id: string }) => threat.id === 'patrol'), { health: 72, phase: 'patrol', lootClaimed: false, position: { x: 0, y: 0, z: 39 }, targetPosition: { x: 0, y: 0, z: 39 } });
  const game = createAdventure({ save: JSON.stringify(saved), now: () => 1000 });
  game.selectTarget('warder'); tap(game, 'strike'); game.readyCombat();
  const before = game.snapshot, rng = JSON.parse(game.save()).state.threats[2].rng;
  game.advance(.1);
  expect(game.snapshot.threats[3]!.aggro).toBe(true);
  expect(game.snapshot.threats[3]!.joinsNextWindow).toBe(true);
  // Ready starts the current turn immediately; a social add that arrives
  // during execution is retained for the next safe planning cycle.
  expect(game.snapshot.threats[3]!.windowAction).toBeNull();
  expect(game.snapshot.threats[2]!.windowAction).toEqual(before.threats[2]!.windowAction);
  expect(JSON.parse(game.save()).state.threats[2].rng).toBe(rng);
  expect(game.snapshot.combat.queued).toEqual(before.combat.queued);
  expect(game.snapshot.combat.ready).toBe(true);
  expect(game.snapshot.combat.gatheringRemainingSeconds).toBe(0);
});

test('party pause and restored saves freeze the collection clock while forecasts still execute a full turn', () => {
  const base = seed(), seedWorld = createSharedAdventure({ now: () => 1000 });
  seedWorld.join('alice', 'Alice', 'mage'); seedWorld.join('bob', 'Bob', 'warrior');
  const saved = JSON.parse(seedWorld.save()); saved.world.threats = base.state.threats;
  Object.assign(saved.characters[0].state, { phase: 'expedition', position: { x: -3, y: 0, z: 28 } });
  const world = createSharedAdventure({ save: JSON.stringify(saved), now: () => 1000 });
  const alice = world.join('alice', 'Alice', 'mage'); world.join('bob', 'Bob', 'warrior');
  world.advance(.01); tap(alice, 'strike'); world.advance(2);
  const forecast = alice.snapshot.combat.forecast!;
  expect(forecast.events.some(event => event.sourceId === 'alice' && event.kind === 'hit')).toBe(true);
  const remaining = alice.snapshot.combat.gatheringRemainingSeconds;
  world.pause('bob', ['alice', 'bob']); world.advance(50);
  expect(alice.snapshot.combat.gatheringRemainingSeconds).toBe(remaining);
  const restored = createSharedAdventure({ save: world.save(), now: () => 1000 });
  const returned = restored.join('alice', 'Alice', 'mage');
  expect(returned.snapshot.combat.gatheringRemainingSeconds).toBe(remaining);
  expect(restored.resume('alice')).toBe(true); returned.readyCombat();
  expect(returned.snapshot.combat.phase).toBe('active');
  restored.advance(3.1);
  expect(returned.snapshot.threats[0]!.health).toBe(forecast.outcomes.find(outcome => outcome.id === 'scout')!.health);
  expect(returned.snapshot.player.health).toBe(forecast.outcomes.find(outcome => outcome.id === 'alice')!.health);
});

test('legacy planning saves resume without a new collection delay', () => {
  const game = detected(), saved = JSON.parse(game.save()); delete saved.state.combat.gatheringRemainingSeconds;
  const restored = createAdventure({ save: JSON.stringify(saved), now: () => 1000 });
  expect(restored.snapshot.combat.gatheringRemainingSeconds).toBe(0);
  expect(restored.readyCombat()).toBe(true); expect(restored.snapshot.combat.phase).toBe('active');
});
