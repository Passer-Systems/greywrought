import { queueMoveToward } from './yard-test-fixtures.js';
import { expect, test } from 'bun:test';
import { createAdventure } from './adventure.js';
import { classKit } from './class-kit.js';
import { COMBAT_CELL_SIZE } from './combat-grid.js';
import { LocalMovement } from '../host/local-movement.js';
import type { CharacterArchetype } from '../host/character-profile.js';
import type { Position } from './adventure-types.js';

const classes = [
  ['warrior', 2, 5.2], ['mage', 2, 5.2], ['hunter', 4, 6], ['alchemist', 3, 5.6], ['artificer', 2, 5.2],
] as const;
const gap = (a: Position, b: Position) => Math.hypot(a.x - b.x, a.z - b.z);

function combat(archetype: CharacterArchetype) {
  const saved = JSON.parse(createAdventure({ archetype }).save());
  Object.assign(saved.state, { phase: 'expedition', position: { x: -10, y: 0, z: 25 } });
  saved.state.combat = { phase: 'preparation', cycle: 1, elapsedSeconds: 0, queued: [], nextId: 1, ready: false };
  for (const threat of saved.state.threats) {
    if (!threat.active) continue;
    if (threat.id !== 'scout') Object.assign(threat, { health: 0, phase: 'cleared', lootClaimed: true });
    else Object.assign(threat, { aggro: true, phase: 'preparation', joinCycle: 1, windowCycle: 1, specialOffset: 2, remainingSeconds: 2, castDuration: 2 });
  }
  return createAdventure({ save: JSON.stringify(saved) });
}

for (const [archetype, tiles, speed] of classes) {
  test(`${archetype} Bait travels its Movement tiles and forecast matches execution`, () => {
    const game = combat(archetype), start = game.snapshot.player.position;
    expect(classKit(archetype).movementTiles).toBe(tiles);
    expect(classKit(archetype).abilities.bait.description).toContain(`${tiles} tiles`);
    expect(queueMoveToward(game, { ...start, x: start.x + 20 })).toBe(true);
    const path = game.snapshot.combat.forecast!.paths.find(path => path.actorId === 'solo' && path.action === 'bait')!;
    const end = path.points.at(-1)!;
    expect(gap(start, end)).toBeCloseTo(tiles * COMBAT_CELL_SIZE, 7);
    game.readyCombat(); game.advance(.5);
    expect(game.snapshot.player.position.x).toBeCloseTo(end.x, 7);
    expect(game.snapshot.player.position.z).toBeCloseTo(end.z, 7);
    expect(game.snapshot.combat.queued[0]!.status).toBe('executed');
  });

  test(`${archetype} diagonal snapping never exceeds Movement`, () => {
    const game = combat(archetype), start = game.snapshot.player.position;
    expect(queueMoveToward(game, { ...start, x: start.x + 20, z: start.z - 20 })).toBe(true);
    const end = game.snapshot.combat.forecast!.paths.find(path => path.actorId === 'solo' && path.action === 'bait')!.points.at(-1)!;
    expect(gap(start, end)).toBeLessThanOrEqual(tiles * COMBAT_CELL_SIZE + 1e-8);
    expect(gap(start, end)).toBeGreaterThan(0);
    expect(end.x / COMBAT_CELL_SIZE).toBeInteger();
    expect(end.z / COMBAT_CELL_SIZE).toBeInteger();
    game.readyCombat(); game.advance(.5);
    expect(gap(start, game.snapshot.player.position)).toBeLessThanOrEqual(tiles * COMBAT_CELL_SIZE + 1e-8);
  });

  test(`${archetype} exploration speed agrees for solo, server and prediction`, () => {
    const server = createAdventure({ archetype }), solo = createAdventure({ archetype });
    server.enableNetworkMovement!();
    const local = new LocalMovement(server.snapshot, server.movementCheckpoint!), start = server.snapshot.player.position;
    local.setAction('forward', true); solo.setAction('forward', true);
    for (let frame = 0; frame < 30; frame++) {
      local.advance(1 / 60); server.enqueueMovement!(local.takeOutgoing()); server.advance(1 / 60); solo.advance(1 / 60);
    }
    expect(gap(start, server.snapshot.player.position)).toBeCloseTo(speed / 2, 7);
    expect(gap(local.player.position, server.snapshot.player.position)).toBeCloseTo(0, 7);
    expect(gap(solo.snapshot.player.position, server.snapshot.player.position)).toBeCloseTo(0, 7);
    local.reconcile(server.snapshot, server.movementCheckpoint!, .5);
    expect(gap(local.player.position, server.snapshot.player.position)).toBeCloseTo(0, 7);
  });
}

test('Move rejects distant and occupied tiles, then chains later beats from the planned destination', () => {
  const game = combat('mage'), start = game.snapshot.player.position;
  expect(game.queueBait({...start,x:start.x+20})).toBe(false);
  expect(game.queueBait(game.snapshot.threats[0]!.position)).toBe(false);
  expect(game.snapshot.combat.queued).toHaveLength(0);
  expect(game.queueBait({...start,z:start.z-5,y:-.06})).toBe(true);
  expect(game.queueBait({...start,z:start.z-10,y:-.06})).toBe(true);
  expect(game.snapshot.combat.queued.map(move=>move.destination?.z)).toEqual([start.z-5,start.z-10]);
  game.readyCombat(); game.advance(1.5);
  expect(game.snapshot.player.position.z).toBeCloseTo(start.z-10,8);
  expect(game.snapshot.combat.queued.every(move=>move.status==='executed')).toBe(true);
});
