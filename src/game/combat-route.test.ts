import { expect, test } from 'bun:test';
import { createAdventure } from './adventure.js';
import { combatRouteDistance, reachableCombatCells, validateCombatRoute } from './combat-grid.js';
import { moveManeuverPosition, type MovementManeuver } from './movement.js';
import { terrainHeight } from './cave-layout.js';
import { finishGathering, finishCycle, earnedChapter, tap } from './yard-test-fixtures.js';
import { LocalMovement } from '../host/local-movement.js';
import { COMBAT_TURN } from './combat-turn.js';

function combat(archetype: 'warrior' | 'hunter' = 'warrior') {
  const saved = JSON.parse(createAdventure({ archetype }).save());
  Object.assign(saved.state, { phase: 'expedition', position: { x: -2.5, y: 0, z: 25 } });
  for (const enemy of saved.state.threats) if (enemy.active && enemy.id !== 'scout') Object.assign(enemy, { health: 0, phase: 'cleared', lootClaimed: true });
  const game = createAdventure({ save: JSON.stringify(saved) });
  game.selectTarget('scout'); game.advance(.02); finishGathering(game);
  return game;
}

test('a returning route spends total movement and preserves the Attack after movement', async () => {
  const game = combat(), start = game.snapshot.player.position, stop = { ...start, x: start.x - 2.5 };
  expect(game.queueBait(start)).toBe(false);
  expect(game.queueBait(start, [{ ...start, x: start.x - 5 }])).toBe(false);
  expect(game.queueBait(start, [stop])).toBe(true);
  tap(game, 'strike');
  const forecast = await game.previewBait(start, [stop]);
  expect(forecast!.paths.find(path => path.action === 'bait')!.points.map(p => [p.x, p.z])).toEqual([start, stop, start].map(p => [p.x, p.z]));
  expect(game.snapshot.combat.queued).toHaveLength(2);
  expect(game.snapshot.combat.reservedStamina).toBe(0);
  game.readyCombat(); game.advance(.85);
  expect(game.snapshot.player.position.x).toBeCloseTo(stop.x, 7);
  expect(game.snapshot.combat.queued.find(entry => entry.action === 'strike')!.status).toBe('pending');
  game.advance(.51);
  expect(game.snapshot.player.position.x).toBeCloseTo(start.x, 7);
  game.advance(.15);
  expect(game.snapshot.combat.queued.find(entry => entry.action === 'strike')!.status).toBe('executed');
  const attack = forecast!.paths.find(path => path.actorId === 'solo' && path.action === 'strike')!;
  expect(attack.points[0]!.x).toBeCloseTo(start.x, 7);
  finishCycle(game);
  expect(game.snapshot.threats.find(t => t.id === 'scout')!.health).toBe(forecast!.outcomes.find(o => o.id === 'scout')!.health);
});

test('every leg checks walls, occupied cells and bounds; fractional remaining budget keeps grid cells', () => {
  const origin = { x: 0, y: 0, z: 40 }, end = { x: 15, y: 0, z: 40 };
  expect(validateCombatRoute(origin, [end], 10)).toBeNull();
  const around = [{ x: 0, y: 0, z: 45 }, { x: 15, y: 0, z: 45 }, end];
  expect(validateCombatRoute(origin, around, 10)).not.toBeNull();
  expect(validateCombatRoute(origin, around, 10, [{ x: 7.5, y: 0, z: 45 }])).toBeNull();
  expect(validateCombatRoute(origin, [{ x: 9999, y: 0, z: 40 }], 5000)).toBeNull();
  const start = { x: -10, y: 0, z: 25 }, stop = { x: -7.5, y: 0, z: 27.5 };
  const remaining = 3 - combatRouteDistance(start, [stop]) / 2.5;
  const cells = reachableCombatCells(stop, remaining);
  expect(cells.some(cell => cell.x === start.x && cell.z === start.z)).toBe(true);
  expect(cells.every(cell => Number.isInteger(cell.x / 2.5) && Number.isInteger(cell.z / 2.5))).toBe(true);
});

test('polyline motion crosses unequal legs at constant speed, including a whole route in one update', () => {
  const start = { x: -10, y: 0, z: 25 }, via = [{ ...start, x: -5 }], end = { ...start, x: -7.5 };
  const state = { position: { ...start }, verticalSpeed: 0 };
  const maneuver: MovementManeuver = { kind: 'bait', start, via, destination: end, duration: 1, remainingSeconds: 1 };
  moveManeuverPosition(state, maneuver, .5);
  expect(state.position.x).toBeCloseTo(-6.25, 8);
  moveManeuverPosition(state, maneuver, .5);
  expect(state.position.x).toBeCloseTo(-7.5, 8);
  expect(maneuver.traveledDistance).toBeCloseTo(7.5, 8);
  const returning: MovementManeuver = { ...maneuver, destination: start, remainingSeconds: 1, traveledDistance: 0 };
  state.position = { ...start };
  expect(moveManeuverPosition(state, returning, 1)).toBe(true);
  expect(state.position.x).toBeCloseTo(start.x, 8);
  expect(returning.traveledDistance).toBeCloseTo(10, 8);
});

test('Ranger earns movement damage from an out-and-back route despite zero displacement', () => {
  const game = combat('hunter'), start = game.snapshot.player.position;
  expect(game.queueBait(start, [{ ...start, x: start.x - 2.5 }])).toBe(true);
  tap(game, 'strike');
  const forecast = game.snapshot.combat.forecast!;
  game.readyCombat(); game.advance(.86);
  expect(game.snapshot.player.position.x).toBeCloseTo(start.x, 7);
  expect(JSON.parse(game.save()).state.repositioned).toBe(true);
  game.advance(.2);
  expect(game.snapshot.threats.find(t => t.id === 'scout')!.health).toBe(70);
  expect(forecast.outcomes.find(o => o.id === 'scout')!.health).toBe(70);
});

test('planned and in-flight routes survive saves and advance identically in client prediction', () => {
  const game = combat('hunter'), start = game.snapshot.player.position, via = [{ ...start, x: start.x - 5 }];
  game.queueBait(start, via);
  const planned = createAdventure({ save: game.save() });
  expect(planned.snapshot.combat.queued[0]!.via).toHaveLength(1);
  game.readyCombat(); game.advance(.6);
  const reopened = createAdventure({ save: game.save() });
  const checkpoint = game.movementCheckpoint!;
  expect(checkpoint.maneuver!.via).toHaveLength(1);
  const local = new LocalMovement(game.snapshot, checkpoint);
  for (let tick = 0; tick < 48; tick++) {
    local.advance(1 / 60); game.advance(1 / 60); reopened.advance(1 / 60);
    expect(local.player.position.x).toBeCloseTo(game.snapshot.player.position.x, 7);
    expect(reopened.snapshot.player.position.x).toBeCloseTo(game.snapshot.player.position.x, 7);
  }
  const old = JSON.parse(planned.save()); delete old.state.combat.queued[0].via;
  old.state.combat.queued[0].destination.x -= 2.5;
  expect(createAdventure({ save: JSON.stringify(old) }).snapshot.combat.queued[0]!.via).toEqual([]);
});

test('a real Maul commits to the intermediate stop and misses the player returning to the starting tile', () => {
  const saved = JSON.parse(createAdventure({ archetype: 'hunter' }).save());
  Object.assign(saved.state, { phase: 'expedition', position: { x: -17.5, y: terrainHeight(-17.5, 40), z: 40 }, chapter: earnedChapter(2) });
  for (const threat of saved.state.threats) if (threat.active && threat.id !== 'patrol') Object.assign(threat, { health: 0, phase: 'cleared', lootClaimed: true });
  const game = createAdventure({ save: JSON.stringify(saved) });
  game.selectTarget('patrol'); tap(game, 'strike'); game.advance(.01); finishGathering(game);
  const standing = createAdventure({ save: game.save() });
  const start = game.snapshot.player.position;
  expect(game.queueBait(start, [{ ...start, z: 35 }])).toBe(true);
  const forecast = game.snapshot.combat.forecast!;
  const landing = forecast.paths.find(path => path.action === 'maul')!.points.at(-1)!;
  expect(landing.z).toBeCloseTo(35 + 5 / 6, 7);
  standing.readyCombat(); finishCycle(standing);
  expect(standing.snapshot.player.health).toBeLessThan(100);
  game.readyCombat(); finishCycle(game);
  expect(game.snapshot.player.position.z).toBeCloseTo(start.z, 7);
  expect(game.snapshot.player.health).toBe(100);
  expect(game.snapshot.threats.find(t => t.id === 'patrol')!.lastActionHit).toBe(false);
  expect(game.snapshot.player.health).toBe(forecast.outcomes.find(o => o.id === 'solo')!.health);
});

test('two quarter-second waits bait Maul before a one-tile dodge; forecasts and saves keep the delay', async () => {
  const saved = JSON.parse(createAdventure({ archetype: 'warrior' }).save());
  Object.assign(saved.state, { phase: 'expedition', position: { x: -17.5, y: terrainHeight(-17.5, 40), z: 40 }, chapter: earnedChapter(2) });
  for (const threat of saved.state.threats) if (threat.active && threat.id !== 'patrol') Object.assign(threat, { health: 0, phase: 'cleared', lootClaimed: true });
  const seed = createAdventure({ save: JSON.stringify(saved) });
  seed.selectTarget('patrol'); tap(seed, 'strike'); seed.advance(.01); finishGathering(seed); seed.clearQueuedActions();
  const start = seed.snapshot.player.position, destination = { ...start, z: start.z - 2.5 };
  for (const waitTicks of [0, 2]) {
    const game = createAdventure({ save: seed.save() });
    const preview = await game.previewBait(destination, [], waitTicks);
    expect(game.queueBait(destination, [], waitTicks)).toBe(true);
    expect(game.snapshot.combat.forecast).toEqual(preview);
    const forecast = game.snapshot.combat.forecast!;
    expect(forecast.paths.find(p => p.action === 'bait')!.beat).toBeCloseTo(.35 + waitTicks * .25, 6);
    const planned = createAdventure({ save: game.save() });
    expect(planned.snapshot.combat.queued[0]!.waitTicks).toBe(waitTicks);
    game.readyCombat(); game.advance(.3);
    const restored = createAdventure({ save: game.save() });
    if (waitTicks) {
      game.advance(.5); restored.advance(.5);
      expect(game.snapshot.player.position).toEqual(start);
      expect(restored.snapshot.player.position).toEqual(start);
    }
    finishCycle(game); finishCycle(restored);
    const predicted = forecast.outcomes.find(o => o.id === 'solo')!.health;
    expect(game.snapshot.player.health).toBe(predicted);
    expect(restored.snapshot.player.health).toBe(predicted);
    expect(waitTicks ? predicted === 100 : predicted < 100).toBe(true);
    expect(game.snapshot.player.position.z).toBeCloseTo(destination.z, 7);
  }
});

test('wait preserves before/in-reach/after ordering, Sprint timing and the last action of the turn', () => {
  const game = combat(), start = game.snapshot.player.position, destination = { ...start, x: start.x - 5 };
  for (const invalid of [-1, .5, 5, NaN]) expect(game.queueBait(destination, [], invalid)).toBe(false);
  expect(game.queueBait(destination, [], COMBAT_TURN.maxWaitTicks)).toBe(true);
  tap(game, 'brace');
  for (const [timing, offset] of [['before', 0], ['during', 1.35], ['after', 2.5]] as const) {
    game.setActionTiming(timing);
    expect(game.snapshot.combat.queued.find(e => e.action === 'brace')!.offsetSeconds).toBeCloseTo(offset, 8);
  }
  game.setSprint(true);
  expect(game.snapshot.combat.queued.find(e => e.action === 'brace')!.offsetSeconds).toBeCloseTo(2, 8);
  game.setSprint(false);
  const forecast = game.snapshot.combat.forecast!;
  expect(forecast.actions.find(a => a.action === 'brace')!.result).toBe('executed');
  game.readyCombat(); game.advance(2.4);
  const restored = createAdventure({ save: game.save() });
  expect(restored.snapshot.combat.queued.find(e => e.action === 'brace')!.offsetSeconds).toBeCloseTo(2.5, 8);
  finishCycle(game); finishCycle(restored);
  expect(restored.snapshot.player.health).toBe(game.snapshot.player.health);
});
