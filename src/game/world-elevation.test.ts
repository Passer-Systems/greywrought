import { expect, test } from 'bun:test';
import { createAdventure } from './adventure.js';
import { migrateTerrainLayout, terrainHeight } from './cave-layout.js';
import { overworldHeight } from './world-elevation.js';
import { dryOverworldHeight, overworldHeight as oldFloor } from './terrain-layout-v3.js';
import { moveLocomotion } from './movement.js';

test('hills rise gently in the meadow, mountains frame it, and authored town and cave floors stay level', () => {
  expect(terrainHeight(-35, -60)).toBeGreaterThan(4);
  expect(terrainHeight(29, -100)).toBeGreaterThan(5);
  expect(terrainHeight(-84, -8)).toBeGreaterThan(25);
  for (const [x,z] of [[0,-8],[-20,-30],[20,-25]]) expect(terrainHeight(x!,z!)).toBe(1.6);
  for (const [x,z] of [[0,50],[28,-46]]) expect(Math.abs(terrainHeight(x!,z!))).toBe(0);
  expect(terrainHeight(72,-46)).toBe(-9);
  const state = {position:{x:29,y:terrainHeight(29,-100),z:-100},verticalSpeed:0};
  const start = state.position.y;
  for (let i=0;i<180;i++) {
    const previous = state.position.y;
    moveLocomotion(state,{forward:1,strafe:0,cameraX:0,cameraZ:1,jump:false},1/30);
    expect(Math.abs(state.position.y-previous)).toBeLessThan(.1);
    expect(state.position.y).toBe(terrainHeight(state.position.x,state.position.z));
  }
  expect(state.position.y).toBeLessThan(start-3);
});

test('existing cave-era saves rise with the meadow exactly once and retain character progress', () => {
  const saved = JSON.parse(createAdventure().save());
  for (const threat of saved.state.threats) {
    for (const position of [threat.position, threat.targetPosition, threat.turnTarget, threat.wolf?.attackOrigin].filter(Boolean)) {
      position.y -= overworldHeight(position.x, position.z);
    }
  }
  saved.terrainLayout = 1;
  Object.assign(saved.state,{phase:'expedition',position:{x:-27,y:0,z:-79},health:83,coins:47});
  const game = createAdventure({save:JSON.stringify(saved)});
  expect(game.snapshot.player.position.y).toBe(terrainHeight(-27,-79));
  expect(game.snapshot.player.health).toBe(83); expect(game.snapshot.coins).toBe(47);
  expect(createAdventure({save:game.save()}).snapshot.player.position).toEqual(game.snapshot.player.position);
  const cave = {terrainLayout:1,state:{position:{x:72,y:-9,z:-46}}};
  migrateTerrainLayout(cave); expect(cave.state.position.y).toBe(-9);
});

test('saved lake and stream positions follow the new bed once, preserving airborne height', () => {
  for (const [x,z] of [[-4,-98],[-25,-84]]) {
    const before=dryOverworldHeight(x!,z!);
    const root={terrainLayout:2,state:{position:{x:x!,y:before+.6,z:z!}},instances:[{members:[{origin:{x:x!,y:before,z:z!}}]}]};
    migrateTerrainLayout(root);
    expect(root.state.position.y).toBeCloseTo(terrainHeight(x!,z!)+.6,10);
    expect(root.instances[0]!.members[0]!.origin.y).toBe(terrainHeight(x!,z!));
    const once=JSON.stringify(root);migrateTerrainLayout(root);expect(JSON.stringify(root)).toBe(once);
  }
});


test('deployed terrain saves migrate town, lake and private combat coordinates exactly once', () => {
  for (const [x,z] of [[0,-8],[-12,-103],[-28,-87],[20,-25]]) {
    const old = oldFloor(x!,z!);
    const ground = {x:x!,y:old,z:z!};
    const root = {terrainLayout:3,state:{position:{...ground,y:old+.5},coins:1492},instances:[{members:[{origin:{...ground}}],world:{threats:[{position:{...ground},targetPosition:{...ground},turnTarget:{...ground},wolf:{attackOrigin:{...ground},motion:{start:{...ground},destination:{...ground}}}}]}}]};
    migrateTerrainLayout(root);
    const expected={x:x!,y:terrainHeight(x!,z!),z:z!};
    expect(root.state.position.y).toBeCloseTo(expected.y+.5,10);
    expect(root.instances[0]!.members[0]!.origin).toEqual(expected);
    const threat=root.instances[0]!.world.threats[0]!;
    for (const position of [threat.position,threat.targetPosition,threat.turnTarget,threat.wolf.attackOrigin,threat.wolf.motion.start,threat.wolf.motion.destination]) expect(position).toEqual(expected);
    expect(root.state.coins).toBe(1492);
    const once=JSON.stringify(root);migrateTerrainLayout(root);expect(JSON.stringify(root)).toBe(once);
  }
});

test('version four saves follow folded mountains while preserving cave and airborne offsets', async () => {
  const { overworldHeight: floorV4 } = await import('./terrain-layout-v4.js');
  for (const [x,z] of [[-84,-8],[99,47],[40,-109],[-60,-83],[-27,-95],[0,-8],[72,-46]]) {
    const before = x === 72 ? -9 : floorV4(x!,z!);
    const root = {terrainLayout:4,state:{position:{x:x!,y:before+.6,z:z!}},instances:[{members:[{origin:{x:x!,y:before,z:z!}}]}]};
    migrateTerrainLayout(root);
    expect(root.state.position.y).toBeCloseTo(terrainHeight(x!,z!)+.6,10);
    expect(root.instances[0]!.members[0]!.origin.y).toBe(terrainHeight(x!,z!));
    const once=JSON.stringify(root);migrateTerrainLayout(root);expect(JSON.stringify(root)).toBe(once);
  }
});

test('folded mountain shoulders stay grounded across uphill and downhill travel', () => {
  for (const [x,z] of [[-69,-8],[48,47],[-65,72]]) {
    const state = {position:{x:x!,y:terrainHeight(x!,z!),z:z!},verticalSpeed:0};
    for (let i=0;i<480;i++) {
      const previous = state.position.y;
      moveLocomotion(state,{forward:1,strafe:0,cameraX:1,cameraZ:0,jump:false},1/60);
      expect(state.position.y).toBe(terrainHeight(state.position.x,state.position.z));
      expect(Math.abs(state.position.y-previous)).toBeLessThan(.3);
      expect(state.verticalSpeed).toBe(0);
    }
  }
});

test('stream stays downhill through the folded western mountain into the lake', async () => {
  const { STREAM_POINTS, LAKE_WATER_LEVEL } = await import('./world-elevation.js');
  for (let i=1;i<STREAM_POINTS.length;i++) {
    const point = STREAM_POINTS[i]!;
    expect(point.y).toBeLessThanOrEqual(STREAM_POINTS[i-1]!.y);
    expect(point.y).toBeGreaterThanOrEqual(LAKE_WATER_LEVEL);
    expect(overworldHeight(point.x,point.z)).toBeLessThanOrEqual(point.y);
  }
});
