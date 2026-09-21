import { expect, test } from 'bun:test';
import { createAdventure, createSharedAdventure } from './adventure.js';
import type { CharacterArchetype } from '../host/character-profile.js';
import { finishCycle, tap } from './yard-test-fixtures.js';
import { combatOutcome } from '../host/combat-outcome.js';

function fixture(archetype: CharacterArchetype, fire = false) {
  const save = JSON.parse(createAdventure({ archetype }).save());
  Object.assign(save.state, { phase: 'expedition', position: { x: -2.5, y: 0, z: 25 } });
  save.state.combat = { phase: 'preparation', cycle: 1, elapsedSeconds: 0, queued: [], nextId: 1, ready: false };
  for (const enemy of save.state.threats) {
    if (!enemy.active) continue;
    if (enemy.id !== 'scout') { Object.assign(enemy, { health: 0, phase: 'cleared', aggro: false, lootClaimed: true }); continue; }
    Object.assign(enemy, { position: { x: -2.5, y: 0, z: 30 }, aggro: true, phase: 'preparation', joinCycle: 1, windowCycle: 1, specialOffset: .5, remainingSeconds: .5, castDuration: .5 });
    Object.assign(enemy.head, { ability: fire ? 'fireball' : 'kindle', opened: true, volley: 1, castVolley: 1 });
  }
  return save;
}
function execute(game: ReturnType<typeof createAdventure>) {
  const before = game.save(), forecast = game.snapshot.combat.forecast!;
  expect(game.save()).toBe(before);
  expect(createAdventure({ save: before }).snapshot.combat.forecast).toEqual(forecast);
  game.readyCombat(); finishCycle(game);
  for (const outcome of forecast.outcomes) expect(outcome.health).toBe(outcome.id === 'solo' ? game.snapshot.player.health : game.snapshot.threats.find(t => t.id === outcome.id)!.health);
  return forecast;
}

test('warrior earns one counterattack by blocking damage, preserves it through save, then spends it', () => {
  const game = createAdventure({ save: JSON.stringify(fixture('warrior', true)) });
  tap(game, 'brace');
  expect(combatOutcome(game.snapshot, game.snapshot.combat.forecast!).text).toContain('Counterattack ready');
  execute(game); expect(game.snapshot.player.counterattackReady).toBe(true);
  const restored = createAdventure({ save: game.save() }); tap(restored, 'strike');
  const forecast = execute(restored);
  expect(forecast.events.find(e => e.kind === 'hit' && e.sourceId === 'solo')?.damage).toBe(30);
  expect(restored.snapshot.player.counterattackReady).toBe(false);
  const quiet = createAdventure({ save: JSON.stringify(fixture('warrior')) }); tap(quiet, 'brace'); execute(quiet);
  expect(quiet.snapshot.player.counterattackReady).toBe(false);
});

test('ranger Attack after a completed Move gains damage; Attack before Move does not, and bonus expires', () => {
  for (const timing of ['before', 'after'] as const) {
    const game = createAdventure({ save: JSON.stringify(fixture('hunter')) });
    expect(game.queueBait({ x: 0, y: 0, z: 25 })).toBe(true); tap(game, 'strike'); game.setActionTiming(timing);
    const forecast = execute(game);
    expect(forecast.events.find(e => e.kind === 'hit' && e.sourceId === 'solo')?.damage).toBe(timing === 'after' ? 26 : 18);
    expect(game.snapshot.player.repositioned).toBe(false);
  }
});

test('Alchemist coats a target, then an Attack detonates residue and harms nearby players', () => {
  const game = createAdventure({ save: JSON.stringify(fixture('alchemist')) }); tap(game, 'strike'); execute(game);
  expect(game.snapshot.threats[0]!.volatileResidue).toBe(true);
  expect(game.snapshot.combat.hazards[0]?.kind).toBe('residue');
  const save = JSON.parse(game.save()); save.state.position = { x: -2.5, y: 0, z: 27.5 };
  Object.assign(save.state.threats[0].head, { ability: 'kindle' });
  const restored = createAdventure({ save: JSON.stringify(save) }); tap(restored, 'strike');
  expect(combatOutcome(restored.snapshot, restored.snapshot.combat.forecast!).text).toContain('Residue ignites');
  const forecast = execute(restored);
  expect(forecast.events.some(e => e.kind === 'ignition' && e.damage === 12)).toBe(true);
  expect(restored.snapshot.player.health).toBe(88);
  expect(restored.snapshot.threats[0]!.health).toBe(52);
  expect(restored.snapshot.threats[0]!.volatileResidue).toBe(false);
});

test('Watchman fire ignites residue, including its own coating', () => {
  const save = fixture('alchemist', true); save.state.threats[0].volatileResidue = true;
  const game = createAdventure({ save: JSON.stringify(save) });
  const forecast = execute(game);
  expect(forecast.events.some(e => e.kind === 'ignition' && e.sourceId === 'scout')).toBe(true);
  expect(game.snapshot.threats[0]!.health).toBe(84);
});

test('Mage Defend focuses without taking a hit, while Move breaks focus', () => {
  const game = createAdventure({ save: JSON.stringify(fixture('mage')) }); tap(game, 'brace'); execute(game);
  expect(game.snapshot.player.focusReady).toBe(true);
  for (const move of [false, true]) {
    const restored = createAdventure({ save: game.save() });
    if (move) expect(restored.queueBait({ x: 0, y: 0, z: 25 })).toBe(true);
    tap(restored, 'strike');
    const forecast = execute(restored);
    expect(forecast.events.find(e => e.kind === 'hit' && e.sourceId === 'solo')?.damage).toBe(move ? 18 : 28);
    expect(restored.snapshot.player.focusReady).toBe(false);
  }
});

test('Artificer exposes a weak point consumed by the next Attack from another class', () => {
  const game = createAdventure({ save: JSON.stringify(fixture('artificer')) }); tap(game, 'strike'); execute(game);
  expect(game.snapshot.threats[0]!.exposed).toBe(true);
  const save = JSON.parse(game.save()); save.state.archetype = 'warrior';
  const ally = createAdventure({ save: JSON.stringify(save) }); tap(ally, 'strike');
  const forecast = execute(ally);
  expect(forecast.events.find(e => e.kind === 'hit' && e.sourceId === 'solo')?.damage).toBe(24);
  expect(ally.snapshot.threats[0]!.exposed).toBe(false);
});

test('shared private encounters save class readiness and coatings without changing forecasts or the shared world', () => {
  const seed = createSharedAdventure(); seed.join('a', 'Ada', 'alchemist'); seed.join('b', 'Bob', 'warrior');
  const save = JSON.parse(seed.save()), combat = fixture('alchemist').state;
  save.world.threats = combat.threats; save.clock = combat.combat;
  for (const character of save.characters) Object.assign(character.state, { phase: 'expedition', position: { ...combat.position }, counterattackReady: character.id === 'b' });
  const scout = save.world.threats[0];
  Object.assign(scout, { volatileResidue: true, exposed: true, targetPlayerId: 'a', combatants: ['a', 'b'], contributors: ['a'] });
  const world = createSharedAdventure({ save: JSON.stringify(save) }); world.join('a', 'Ada', 'alchemist'); world.join('b', 'Bob', 'warrior');
  expect(world.pause('a', ['a', 'b'])).toBe(true);
  const restored = createSharedAdventure({ save: world.save() }), a = restored.join('a', 'Ada', 'alchemist'), b = restored.join('b', 'Bob', 'warrior');
  expect(a.snapshot.threats[0]!.volatileResidue).toBe(true); expect(a.snapshot.threats[0]!.exposed).toBe(true);
  expect(b.snapshot.player.counterattackReady).toBe(true);
  expect(restored.resume('a')).toBe(true); tap(a, 'brace'); tap(b, 'strike');
  const before = restored.save(), forecast = b.snapshot.combat.forecast!; expect(restored.save()).toBe(before);
  expect(forecast.events.find(e => e.kind === 'hit' && e.sourceId === 'b')?.damage).toBe(36);
  a.readyCombat(); b.readyCombat(); finishCycle(b, restored);
  expect(b.snapshot.threats[0]!.health).toBe(forecast.outcomes.find(o => o.id === 'scout')!.health);
  expect(b.snapshot.player.counterattackReady).toBe(false);
  expect(b.snapshot.threats[0]!.volatileResidue).toBe(false);
  expect(JSON.parse(restored.save()).world.threats[0].volatileResidue).toBe(false);
});
