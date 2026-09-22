import { expect, test } from 'bun:test';
import { createAdventure } from './adventure.js';
import { migrateTerrainLayout, terrainHeight } from './cave-layout.js';
import { dryOverworldHeight as currentDryFloor, overworldHeight } from './world-elevation.js';
import { dryOverworldHeight, overworldHeight as oldFloor } from './terrain-layout-v3.js';
import { moveLocomotion } from './movement.js';
import { dryOverworldHeight as savedDryFloor } from './terrain-layout-v5.js';
import { WORLD_SETTLEMENTS } from './world-regions.js';

test('regional mountains preserve the original dry terrain and settlement foundations', () => {
  for (let x=-70;x<=90;x+=2) for (let z=-130;z<=76;z+=2) {
    expect(currentDryFloor(x,z)).toBe(savedDryFloor(x,z));
  }
  for (const town of WORLD_SETTLEMENTS) {
    const foundation=town.id === 'suture' ? 2.4 : 1.8;
    for (let x=town.minX;x<=town.maxX;x+=2) for (let z=town.minZ;z<=town.maxZ;z+=2) {
      expect(overworldHeight(x,z)).toBeCloseTo(foundation,12);
    }
  }
});

test('hills rise gently in the meadow, mountains frame it, and authored town and cave floors stay level', () => {
  expect(terrainHeight(-35, -60)).toBeGreaterThan(4);
  expect(terrainHeight(29, -100)).toBeGreaterThan(5);
  expect(terrainHeight(90, 45)).toBeGreaterThan(25);
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

test('the meadow road keeps a dry bank beside the lake', async () => {
  const { lakeWaterAt } = await import('./world-elevation.js');
  const road = [[0,-55],[1,-77],[12,-89],[16,-104],[14,-124]] as const;
  for (let i=1;i<road.length;i++) for (let step=0;step<=40;step++) {
    const a=road[i-1]!,b=road[i]!,t=step/40;
    const x=a[0]+(b[0]-a[0])*t,z=a[1]+(b[1]-a[1])*t;
    // The trail is at most 3.2m across; this also preserves a grassy bank.
    expect(lakeWaterAt(x-3.5,z)).toBeNull();
    expect(lakeWaterAt(x,z)).toBeNull();
  }
  // The eastern deep pocket must not leave a separate puddle beside the road.
  expect(overworldHeight(-4,-82)).toBeGreaterThan(.08);
});

test('the stream stays on its bluff until an unobstructed drop into the lake', async () => {
  const { STREAM_POINTS, WATERFALL_POINTS, lakeDepthAt, LAKE_WATER_LEVEL } = await import('./world-elevation.js');
  for (const p of STREAM_POINTS.slice(0,-6)) {
    expect(lakeDepthAt(p.x,p.z)).toBe(0);
    expect(p.y-overworldHeight(p.x,p.z)).toBeLessThan(.7);
    expect(currentDryFloor(p.x,p.z)-overworldHeight(p.x,p.z)).toBeLessThan(1.1);
  }
  const lip=WATERFALL_POINTS[0]!,bottom=WATERFALL_POINTS.at(-1)!;
  expect(lip.y-bottom.y).toBeGreaterThan(7);
  expect(Math.hypot(lip.x-bottom.x,lip.z-bottom.z)).toBeLessThan(4);
  for (const p of WATERFALL_POINTS) expect(overworldHeight(p.x,p.z)).toBeLessThan(p.y);
  expect(bottom.y).toBeCloseTo(LAKE_WATER_LEVEL,10);
  expect(lakeDepthAt(bottom.x,bottom.z)).toBeGreaterThan(.8);
});

test('version six ground and swimming saves follow the new banks exactly once', async () => {
  const { overworldHeight: floorV6, isSwimmingPosition: swimmingV6 } = await import('./terrain-layout-v6.js');
  const { lakeWaterAt } = await import('./world-elevation.js');
  for (const [x,z] of [[1,-77],[-60,-83],[-54,-76],[-27,-95],[72,-46]]) {
    const before=x===72?-9:floorV6(x!,z!);
    const root={terrainLayout:6,state:{position:{x:x!,y:before+.3,z:z!}},instances:[{members:[{origin:{x:x!,y:before,z:z!}}]}]};
    migrateTerrainLayout(root);
    expect(root.state.position.y).toBeCloseTo(terrainHeight(x!,z!)+.3,10);
    expect(root.instances[0]!.members[0]!.origin.y).toBeCloseTo(terrainHeight(x!,z!),10);
    const once=JSON.stringify(root);migrateTerrainLayout(root);expect(JSON.stringify(root)).toBe(once);
    if (swimmingV6(x!,z!)) {
      const swimmer={terrainLayout:6,state:{position:{x:x!,y:-.72,z:z!}}};
      migrateTerrainLayout(swimmer);
      expect(swimmer.state.position.y).toBeCloseTo(Math.max(terrainHeight(x!,z!), (lakeWaterAt(x!,z!)??-Infinity)-.8),10);
    }
  }
});

test('version seven saves settle on the deeper lake and rerouted stream without losing progress', async () => {
  const { overworldHeight: oldFloor } = await import('./terrain-layout-v7.js');
  for (const [x, z] of [[-27, -95], [-65, -84.5], [-57, -78], [72, -46]] as const) {
    const oldGround = x === 72 ? -9 : oldFloor(x, z);
    const position = { x, y: oldGround, z };
    const root = { terrainLayout: 7, state: { position: { ...position, y: oldGround + .3 }, coins: 1492 },
      world: { threats: [{ position: { ...position }, targetPosition: { ...position } }] },
      instances: [{ members: [{ origin: { ...position } }] }] };
    migrateTerrainLayout(root);
    expect(root.terrainLayout).toBe(8);
    expect(root.state.position.y).toBeCloseTo(terrainHeight(x, z) + .3, 10);
    expect(root.world.threats[0]!.position.y).toBe(terrainHeight(x, z));
    expect(root.world.threats[0]!.targetPosition.y).toBe(terrainHeight(x, z));
    expect(root.instances[0]!.members[0]!.origin.y).toBe(terrainHeight(x, z));
    expect(root.state.coins).toBe(1492);
    const once = JSON.stringify(root); migrateTerrainLayout(root); expect(JSON.stringify(root)).toBe(once);
  }
  const swimmer = { terrainLayout: 7, state: { position: { x: -27, y: -.72, z: -95 } } };
  migrateTerrainLayout(swimmer);
  expect(swimmer.state.position.y).toBeCloseTo(-.72, 10);
});
