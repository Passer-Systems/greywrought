import { expect, test } from 'bun:test';
import { createAdventure, createSharedAdventure } from './adventure.js';
import { terrainHeight, migrateTerrainLayout } from './cave-layout.js';
import { GRAVITY, JUMP_SPEED, moveLocomotion, moveManeuverPosition, type MovementState } from './movement.js';
import { LocalMovement } from '../host/local-movement.js';
import { finishGathering, earnedChapter, finishCycle, tap } from './yard-test-fixtures.js';
import type { Position } from './adventure-types.js';
import { overworldHeight as oldTerrain, LAKE_WATER_LEVEL } from './terrain-layout-v5.js';

test('lake expansion preserves v5 hillside height and swimming support separately', () => {
  const hillside = { terrainLayout: 5, position: { x: -57, y: oldTerrain(-57, -70) + .6, z: -70 } };
  migrateTerrainLayout(hillside);
  expect(hillside.position.y).toBeCloseTo(terrainHeight(-57, -70) + .6, 7);
  const swimmer = { terrainLayout: 5, position: { x: -28, y: LAKE_WATER_LEVEL - .8, z: -101 } };
  migrateTerrainLayout(swimmer);
  expect(swimmer.position.y).toBeCloseTo(LAKE_WATER_LEVEL - .8, 7);
  const turtle = { terrainLayout: 5, position: { x: -28, y: oldTerrain(-28, -101), z: -101 } };
  migrateTerrainLayout(turtle);
  expect(turtle.position.y).toBeCloseTo(terrainHeight(-28, -101), 7);
  const shallowTurtle = { terrainLayout: 5, position: { x: -.6615055790801115, y: oldTerrain(-.6615055790801115, -97.50387081568988), z: -97.50387081568988 } };
  migrateTerrainLayout(shallowTurtle);
  expect(shallowTurtle.position.y).toBe(terrainHeight(shallowTurtle.position.x, shallowTurtle.position.z));
});

const ground = (x: number, z = -46): Position => ({ x, y: terrainHeight(x, z), z });
const height = (p: Position) => p.y - terrainHeight(p.x, p.z);
function gameAt(x: number, quiet = false) {
  const save = JSON.parse(createAdventure({ now: () => 1000 }).save());
  Object.assign(save.state, { phase: 'expedition', position: ground(x), chapter: earnedChapter(), supplies: 37, potions: 4 });
  if (quiet) for (const threat of save.state.threats) {
    if (threat.active) Object.assign(threat, { health: 0, phase: 'cleared', lootClaimed: true, respawnAt: 121000 });
  }
  return createAdventure({ save: JSON.stringify(save), now: () => 1000 });
}
function near(actual: Position, expected: Position) {
  expect(actual.x).toBeCloseTo(expected.x, 7);
  expect(actual.y).toBeCloseTo(expected.y, 7);
  expect(actual.z).toBeCloseTo(expected.z, 7);
}
// The 0.18 save format stored all spatial heights relative to its flat cave floor.
function flatSave(serialized: string): string {
  const root = JSON.parse(serialized);
  delete root.terrainLayout;
  const spatial = new Set(['position', 'targetPosition', 'turnTarget', 'origin', 'start', 'destination', 'attackOrigin']);
  const flatten = (value: any) => {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value) as [string, any][]) {
      if (spatial.has(key) && child && typeof child.x === 'number' && typeof child.y === 'number' && typeof child.z === 'number') child.y -= terrainHeight(child.x, child.z);
      else flatten(child);
    }
  };
  flatten(root);
  return JSON.stringify(root);
}

test('walking into both chambers and returning follows the same floor on server and client', () => {
  const server = gameAt(27, true); server.enableNetworkMovement!();
  const local = new LocalMovement(server.snapshot, server.movementCheckpoint!);
  for (const direction of [1, -1]) {
    local.setCameraForward(direction, 0); local.setAction('forward', true);
    const duration=54/5.2;
    for (let tick = 0; tick < Math.ceil(duration*30); tick++) {
      const dt=Math.min(1/30,duration-tick/30);
      local.advance(dt); server.enqueueMovement!(local.takeOutgoing()); server.advance(dt);
      near(local.player.position, server.snapshot.player.position);
      expect(height(server.snapshot.player.position)).toBe(0);
      expect(local.player.grounded).toBe(true);
      local.reconcile(server.snapshot, server.movementCheckpoint!, (direction === 1 ? 0 : duration) + tick / 30);
    }
    expect(server.snapshot.player.position.x).toBeCloseTo(direction === 1 ? 81 : 27, 7);
    expect(server.snapshot.player.position.y).toBe(direction === 1 ? -9 : 0);
  }
});

test('jumping down and up the ramp follows a world-height arc and lands on the local floor', () => {
  for (const direction of [1, -1]) {
    const state: MovementState = { position: { ...ground(35) }, verticalSpeed: 0 };
    const startHeight = state.position.y;
    const input = { forward: 1, strafe: 0, cameraX: direction, cameraZ: 0, jump: true };
    moveLocomotion(state, input, .2);
    expect(height(state.position)).toBeCloseTo(startHeight + JUMP_SPEED * .2 - GRAVITY * .2 ** 2 / 2 - terrainHeight(state.position.x, state.position.z), 7);
    expect(state.verticalSpeed).toBeGreaterThan(0);
    expect(state.position.y).toBeLessThan(0);
    expect(state.position.y).toBeCloseTo(startHeight + JUMP_SPEED * .2 - GRAVITY * .2 ** 2 / 2, 7);
    let elapsed = .2;
    while (state.verticalSpeed !== 0 && elapsed < 2) {
      moveLocomotion(state, { ...input, jump: false }, 1 / 60);
      elapsed += 1 / 60;
      const floor = terrainHeight(state.position.x, state.position.z);
      expect(state.position.y).toBeCloseTo(Math.max(floor, startHeight + JUMP_SPEED * elapsed - GRAVITY * elapsed ** 2 / 2), 7);
    }
    if (direction === 1) expect(elapsed).toBeGreaterThan(2 * JUMP_SPEED / GRAVITY);
    else expect(elapsed).toBeLessThan(2 * JUMP_SPEED / GRAVITY);
    expect(height(state.position)).toBe(0);
    expect(state.verticalSpeed).toBe(0);
  }
  let game = gameAt(35, true);
  tap(game, 'jump'); game.advance(.2);
  const airborne = game.snapshot.player.position;
  game = createAdventure({ save: game.save(), now: () => 1000 });
  near(game.snapshot.player.position, airborne);
  expect(game.snapshot.player.grounded).toBe(false);
  game.advance(1);
  expect(game.snapshot.player.grounded).toBe(true);
  expect(height(game.snapshot.player.position)).toBe(0);
});

test('Moves and lunges cross a slope and settle on its floor', () => {
  for (const kind of ['bait', 'lunge'] as const) {
    const state: MovementState = { position: { ...ground(38) }, verticalSpeed: 0 };
    const motion = { kind, start: ground(38), destination: ground(33), remainingSeconds: .8, duration: .8 };
    moveManeuverPosition(state, motion, .4);
    expect(state.position.x).toBeCloseTo(35.5, 7);
    expect(height(state.position)).toBeCloseTo(0, 7);
    moveManeuverPosition(state, motion, .4);
    near(state.position, ground(33));
    expect(state.verticalSpeed).toBe(0);
  }
});

test('cave combat forecasts and executes Move and a saved move at negative elevation', () => {
  const bait = gameAt(40); bait.advance(.01); bait.selectTarget('cave-bat');
  expect(bait.queueBait({ x: 35, y: 0, z: -46 })).toBe(true);
  const forecast = bait.snapshot.combat.forecast!.outcomes.find(outcome => outcome.id === 'solo')!;
  bait.readyCombat(); finishCycle(bait);
  near(bait.snapshot.player.position, {x:35,y:terrainHeight(35,-45),z:-45});
  expect(bait.snapshot.player.health).toBe(forecast.health);
  for (const threat of bait.snapshot.threats.filter(t => t.id.startsWith('cave-'))) expect(height(threat.position)).toBe(0);

  let dodge = gameAt(41); dodge.advance(.01); dodge.selectTarget('cave-bat');
  expect(dodge.queueBait(ground(37.5,-45))).toBe(true); finishGathering(dodge); dodge.readyCombat(); dodge.advance(.5);
  expect(dodge.snapshot.player.maneuver).toBe('bait');
  expect(height(dodge.snapshot.player.position)).toBe(0);
  const saved = dodge.save(), before = dodge.snapshot.player.position;
  const destination = JSON.parse(saved).state.maneuver.destination;
  dodge = createAdventure({ save: saved, now: () => 1000 });
  near(dodge.snapshot.player.position, before);
  finishCycle(dodge);
  expect(dodge.snapshot.player.grounded).toBe(true);
  near(dodge.snapshot.player.position, destination);
});

test('old solo saves migrate jump and maneuver offsets once, preserving progress and directions', () => {
  for (const maneuver of [false, true]) {
    const game = gameAt(maneuver ? 41 : 35, !maneuver);
    if (maneuver) { game.advance(.01); game.selectTarget('cave-bat'); expect(game.queueBait(ground(37.5,-45))).toBe(true); finishGathering(game); game.readyCombat(); }
    else tap(game, 'jump');
    game.advance(.2);
    const expected = JSON.parse(game.save());
    const restored = createAdventure({ save: flatSave(game.save()), now: () => 1000 });
    const saved = JSON.parse(restored.save());
    near(saved.state.position, expected.state.position);
    expect(saved.terrainLayout).toBe(8);
    expect(saved.state.maneuver).toEqual(expected.state.maneuver);
    expect(saved.state.chapter).toEqual(expected.state.chapter);
    expect(saved.state.supplies).toBe(37); expect(saved.state.potions).toBe(4);
    const again = createAdventure({ save: restored.save(), now: () => 1000 });
    near(again.snapshot.player.position, expected.state.position);
    expect(JSON.parse(again.save()).state.threats).toEqual(saved.state.threats);
  }
  const root = { state: { position: { x: 70, y: 1, z: -46 }, facing: { x: 70, y: 0, z: -46 } } };
  migrateTerrainLayout(root);
  expect(root.state.position.y).toBe(-8);
  expect(root.state.facing.y).toBe(0);
  migrateTerrainLayout(root);
  expect(root.state.position.y).toBe(-8);
});

test('old shared private saves retain cave origin, actors and character progress through rejoin', () => {
  const seed = createSharedAdventure({ now: () => 1000 }); seed.join('caver', 'Caver', 'warrior');
  const save = JSON.parse(seed.save());
  Object.assign(save.characters[0].state, { phase: 'expedition', position: ground(55), chapter: earnedChapter(), supplies: 37, potions: 4 });
  let world = createSharedAdventure({ save: JSON.stringify(save), now: () => 1000 });
  let player = world.join('caver', 'Caver', 'warrior');
  expect(world.pause('caver')).toBe(true);
  const expected = JSON.parse(world.save());
  world = createSharedAdventure({ save: flatSave(world.save()), now: () => 1000 });
  player = world.join('caver', 'Caver', 'warrior');
  expect(world.session('caver').mode).toBe('paused');
  near(world.session('caver').origin!, ground(55));
  near(player.snapshot.player.position, ground(55));
  expect(player.snapshot.supplies).toBe(37); expect(player.snapshot.potions).toBe(4);
  expect(JSON.parse(world.save()).characters[0].state.chapter).toEqual(expected.characters[0].state.chapter);
  expect(JSON.parse(world.save()).instances[0].world).toEqual(expected.instances[0].world);
  world = createSharedAdventure({ save: world.save(), now: () => 1000 }); player = world.join('caver', 'Caver', 'warrior');
  expect(world.resume('caver')).toBe(true);
  player.setCameraForward(1, 0); player.setAction('forward', true); world.advance(.2); player.setAction('forward', false);
  const beforeRejoin = player.snapshot.player.position;
  expect(world.rejoin('caver')).toBe(true);
  near(player.snapshot.player.position, beforeRejoin);
  expect(player.snapshot.player.grounded).toBe(true);
});
