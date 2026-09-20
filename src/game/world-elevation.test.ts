import { expect, test } from 'bun:test';
import { createAdventure } from './adventure.js';
import { migrateTerrainLayout, terrainHeight } from './cave-layout.js';
import { dryOverworldHeight, overworldHeight } from './world-elevation.js';
import { moveLocomotion } from './movement.js';

test('hills rise gently in the meadow, mountains frame it, and authored town and cave floors stay level', () => {
  expect(terrainHeight(-27, -79)).toBeGreaterThan(4);
  expect(terrainHeight(29, -100)).toBeGreaterThan(5);
  expect(terrainHeight(-84, -8)).toBeGreaterThan(25);
  for (const [x,z] of [[0,-8],[-20,-30],[20,-25],[0,50],[28,-46]]) expect(Math.abs(terrainHeight(x!,z!))).toBe(0);
  expect(terrainHeight(72,-46)).toBe(-9);
  const state = {position:{x:-27,y:terrainHeight(-27,-79),z:-79},verticalSpeed:0};
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
    for (const position of [threat.position, threat.targetPosition, threat.wolf?.attackOrigin].filter(Boolean)) {
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
