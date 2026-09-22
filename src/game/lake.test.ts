import { describe, expect, test } from 'bun:test';
import { LAKE_CENTER, lakeDepthAt, lakeWaterAt, isSwimmingPosition } from './world-elevation.js';
import { terrainHeight } from './cave-layout.js';
import { moveLocomotion, supportHeight, type MovementState } from './movement.js';
import { createAdventure, createSharedAdventure } from './adventure.js';
import { finishCycle } from './yard-test-fixtures.js';

describe('meadow lake', () => {
  test('scattered neutral turtles patrol inside the lake and old worlds acquire its new inhabitants', () => {
    const game = createAdventure();
    const turtles = game.snapshot.threats.filter(t => t.id.startsWith('pond-turtle'));
    expect(turtles).toHaveLength(4);
    for (const turtle of turtles) {
      expect(turtle).toMatchObject({ critter: true, disposition: 'neutral', aggroRange: 0, callForHelpRange: 0 });
      for (const other of turtles) if (other.id !== turtle.id) expect(Math.hypot(turtle.position.x - other.position.x, turtle.position.z - other.position.z)).toBeGreaterThan(18);
    }
    const visited = new Map(turtles.map(t => [t.id, new Set<string>()]));
    for (let i = 0; i < 600; i++) {
      game.advance(.25);
      for (const turtle of game.snapshot.threats.filter(t => t.id.startsWith('pond-turtle'))) {
        expect(lakeWaterAt(turtle.position.x, turtle.position.z)).not.toBeNull();
        expect(turtle.aggro).toBe(false);
        visited.get(turtle.id)!.add(`${Math.round(turtle.position.x)},${Math.round(turtle.position.z)}`);
      }
    }
    for (const positions of visited.values()) expect(positions.size).toBeGreaterThan(10);
    const seed = createSharedAdventure({ now: () => 1000 });
    seed.join('swimmer', 'Swimmer', 'mage'); seed.pause('swimmer');
    const saved = JSON.parse(seed.save());
    const newIds = ['pond-turtle-west', 'pond-turtle-north', 'pond-turtle-south', 'lake-dreadnought'];
    for (const world of [saved.world, saved.instances[0].world]) world.threats = world.threats.filter((t: { id: string }) => !newIds.includes(t.id));
    const restored = createSharedAdventure({ save: JSON.stringify(saved), now: () => 1000 });
    for (const observer of [restored.join('swimmer', 'Swimmer', 'mage'), restored.join('visitor', 'Visitor', 'mage')]) {
      expect(observer.snapshot.threats.filter(t => newIds.includes(t.id))).toHaveLength(4);
      expect(observer.snapshot.threats.find(t => t.id === 'pond-turtle')!.position).toEqual(turtles[0]!.position);
    }
    expect(restored.session('swimmer').mode).toBe('paused');
    const solo = JSON.parse(createAdventure().save());
    solo.state.threats = solo.state.threats.filter((t: { id: string }) => !newIds.includes(t.id));
    expect(createAdventure({ save: JSON.stringify(solo) }).snapshot.threats.filter(t => newIds.includes(t.id))).toHaveLength(4);
  });
  test('Dredgeback guards deep water, announces its slam, hurts swimmers and carries salvage', () => {
    const saved = JSON.parse(createAdventure().save());
    Object.assign(saved.state, { phase: 'expedition', position: { x: -28, y: supportHeight(-28, -103), z: -103 } });
    const game = createAdventure({ save: JSON.stringify(saved) });
    game.advance(.01);
    const enemy = game.snapshot.threats.find(t => t.id === 'lake-dreadnought')!;
    expect(isSwimmingPosition(enemy.position.x, enemy.position.z)).toBe(true);
    expect(enemy).toMatchObject({ aggro: true, disposition: 'hostile', maximumHealth: 180, callForHelpRange: 0 });
    expect(enemy.currentAbility).toMatchObject({ name: 'Hullbreaker Slam', damage: 33, noticeSeconds: 1, range: 3.5 });
    game.readyCombat(); finishCycle(game);
    expect(game.snapshot.player.health).toBeLessThan(100);
    const defeated = JSON.parse(game.save());
    Object.assign(defeated.state.threats.find((t: { id: string }) => t.id === 'lake-dreadnought'), { health: 0, phase: 'cleared', aggro: false, combatants: [], lootClaimed: false });
    const loot = createAdventure({ save: JSON.stringify(defeated) }).snapshot.loot.find(t => t.sourceId === 'lake-dreadnought')!;
    expect(loot).toMatchObject({ available: true, quantity: 4, kind: 'salvage' });
  });
  test('Dredgeback cruises the lakebed and surfaces on a slow deterministic cycle', () => {
    const saved = JSON.parse(createAdventure().save());
    Object.assign(saved.state, { phase: 'expedition', position: { x: 60, y: terrainHeight(60, 60), z: 60 } });
    const game = createAdventure({ save: JSON.stringify(saved) });
    game.advance(.1);
    const dredgeback = () => game.snapshot.threats.find(t => t.id === 'lake-dreadnought')!;
    let previous = dredgeback().position.y, deepSamples = 0, surfaced = false;
    for (let step=0;step<200;step++) {
      game.advance(.25);
      const position = dredgeback().position, bed = terrainHeight(position.x,position.z);
      expect(position.y).toBeGreaterThanOrEqual(bed);
      expect(Math.abs(position.y-previous)).toBeLessThan(.5);
      if (position.y<lakeWaterAt(position.x,position.z)!-3) deepSamples++;
      if (position.y>lakeWaterAt(position.x,position.z)!-2) surfaced=true;
      previous = position.y;
      if (step === 40) {
        const restored = createAdventure({save:game.save()});
        expect(restored.snapshot.threats.find(t=>t.id==='lake-dreadnought')!.position.y).toBeCloseTo(position.y,6);
        restored.advance(.25); game.advance(.25);
        expect(restored.snapshot.threats.find(t=>t.id==='lake-dreadnought')!.position.y).toBeCloseTo(dredgeback().position.y,6);
        previous = dredgeback().position.y;
      }
    }
    expect(deepSamples).toBeGreaterThan(140);
    expect(surfaced).toBe(true);
  });
  test('has a shallow shoreline and deeper swimming basin', () => {
    expect(lakeDepthAt(LAKE_CENTER.x + 13, LAKE_CENTER.z)).toBeGreaterThan(0);
    expect(lakeDepthAt(LAKE_CENTER.x, LAKE_CENTER.z)).toBeGreaterThan(1);
    expect(isSwimmingPosition(LAKE_CENTER.x, LAKE_CENTER.z)).toBe(true);
    expect(lakeWaterAt(LAKE_CENTER.x, LAKE_CENTER.z)).not.toBeNull();
  });
  test('movement settles swimmers at the water surface', () => {
    const state: MovementState = { position: { x: LAKE_CENTER.x, y: lakeWaterAt(LAKE_CENTER.x, LAKE_CENTER.z)! + .1, z: LAKE_CENTER.z }, verticalSpeed: 0 };
    moveLocomotion(state, { forward: 0, strafe: 0, cameraX: 0, cameraZ: 1, jump: false }, 1);
    expect(state.position.y).toBeCloseTo(lakeWaterAt(LAKE_CENTER.x, LAKE_CENTER.z)! - .8);
  });
  test('support keeps cave floors and airborne offsets intact', () => {
    expect(supportHeight(42, -46)).toBeCloseTo(terrainHeight(42, -46));
    const state: MovementState = { position: { x: 0, y: supportHeight(0, 0), z: 0 }, verticalSpeed: 5.5 };
    moveLocomotion(state, { forward: 1, strafe: 0, cameraX: 0, cameraZ: 1, jump: false }, .05);
    expect(state.position.y).toBeGreaterThan(supportHeight(state.position.x, state.position.z));
  });
});
