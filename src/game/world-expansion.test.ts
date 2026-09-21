import { expect, test } from 'bun:test';
import { createAdventure, createSharedAdventure, getMonsterLore } from './adventure.js';
import { REGIONAL_THREATS } from './regional-threats.js';
import { REGION_BUILDINGS, REGION_ROADS, WORLD_SETTLEMENTS } from './world-regions.js';
import { REST_SPOTS, VENDORS } from './economy.js';
import { terrainHeight } from './cave-layout.js';
import { blockedPosition, movePosition } from './movement.js';
import { inTown } from './world-layout.js';
import { finishGathering, tap } from './yard-test-fixtures.js';

const at = (x: number,z: number) => ({x,y:terrainHeight(x,z),z});
test('older shared worlds gain regional residents without resetting live creatures or character progress', () => {
  const world = createSharedAdventure(); world.join('traveller','Traveller','mage');
  const save = JSON.parse(world.save());
  save.world.threats = save.world.threats.filter((threat: {id:string}) => !REGIONAL_THREATS.some(d => d.id === threat.id));
  save.world.threats[0].health = 41;
  save.characters[0].state.health = 73; save.characters[0].state.coins = 47;
  const restored = createSharedAdventure({save:JSON.stringify(save)});
  const game = restored.join('traveller','Traveller','mage');
  expect(game.snapshot.threats.find(t => t.id === 'scout')!.health).toBe(41);
  expect(game.snapshot.player.health).toBe(73); expect(game.snapshot.coins).toBe(47);
  expect(game.snapshot.threats.filter(t => REGIONAL_THREATS.some(d => d.id === t.id))).toHaveLength(10);
  expect(createSharedAdventure({save:restored.save()}).join('traveller','Traveller','mage').snapshot.threats).toEqual(game.snapshot.threats);
});

test('new town walls collide, service approaches stay open, and town arrivals secure salvage', () => {
  for (const building of REGION_BUILDINGS) expect(blockedPosition(building.x,building.z)).toBe(true);
  for (const place of [...VENDORS,...REST_SPOTS]) expect(blockedPosition(place.position.x,place.position.z)).toBe(false);
  for (const town of WORLD_SETTLEMENTS) {
    expect(inTown(town)).toBe(true);
    const save = JSON.parse(createAdventure().save());
    Object.assign(save.state,{phase:'expedition',position:at(town.x,town.z),carriedSalvage:4});
    const game = createAdventure({save:JSON.stringify(save)}), supplies = game.snapshot.supplies;
    game.advance(.1);
    expect(game.snapshot.phase).toBe('town'); expect(game.snapshot.supplies).toBe(supplies+4);
    expect(game.snapshot.report).toContain(town.name);
  }
});

test('regional inns restore health, close out of range and survive save reload in town', () => {
  for (const inn of REST_SPOTS.filter(inn => inn.id !== 'inn')) {
    const save = JSON.parse(createAdventure().save());
    Object.assign(save.state,{phase:'town',position:inn.position,health:34});
    const game = createAdventure({save:JSON.stringify(save)});
    game.interactNpc(inn.id);
    expect(game.snapshot.innOpen).toBe(true); expect(game.snapshot.restSpot).toBe(inn.id);
    expect(game.snapshot.report).toContain(inn.greeting);
    tap(game,'rest'); expect(game.snapshot.player.health).toBe(100);
    expect(game.snapshot.report).toContain(inn.lodging);
    const restored = createAdventure({save:game.save()});
    expect(restored.snapshot.player.position).toEqual(inn.position);
    game.setCameraForward(0,-1); game.setAction('forward',true); game.advance(1); game.setAction('forward',false);
    expect(game.snapshot.innOpen).toBe(false);
  }
});

test('regional patrols have legal ground and hostile combat intentions; peaceful creatures wait', () => {
  for (const d of REGIONAL_THREATS) {
    for (const p of [d.position,...d.patrol ?? []]) {
      expect(blockedPosition(p.x,p.z)).toBe(false); expect(inTown(p)).toBe(false);
      expect(p.y).toBe(terrainHeight(p.x,p.z));
    }
    const save = JSON.parse(createAdventure().save());
    Object.assign(save.state,{phase:'expedition',position:at(d.position.x,d.position.z-2)});
    const game = createAdventure({save:JSON.stringify(save)}); game.advance(.05);
    const threat = game.snapshot.threats.find(t => t.id === d.id)!;
    expect(threat.aggro).toBe(d.disposition === 'hostile');
    if (d.disposition === 'hostile') { expect(threat.currentAbility.damage).toBeGreaterThan(0); expect(threat.cast).not.toBeNull(); }
    expect(getMonsterLore().find(t => t.id === d.id)!.description).toBe(d.description);
  }
});

test('a regional defeat awards experience and recoverable coins and salvage exactly once', () => {
  const d = REGIONAL_THREATS.find(d => d.id === 'ossuary-wing')!;
  const save = JSON.parse(createAdventure({archetype:'mage'}).save());
  Object.assign(save.state,{phase:'expedition',position:at(d.position.x,d.position.z-2)});
  save.state.threats.find((t:{id:string}) => t.id === d.id).health = 1;
  const game = createAdventure({save:JSON.stringify(save)});
  game.selectTarget(d.id); tap(game,'strike'); game.readyCombat(); finishGathering(game); game.advance(.01);
  expect(game.snapshot.threats.find(t => t.id === d.id)!.health).toBe(0);
  expect(game.snapshot.progression.experience).toBe(40);
  game.openLoot(d.id); tap(game,'takeLoot');
  expect(game.snapshot.coins).toBe(12); expect(game.snapshot.carriedSalvage).toBe(2);
  const restored = createAdventure({save:game.save()}); restored.openLoot(d.id); tap(restored,'takeLoot');
  expect(restored.snapshot.coins).toBe(12); expect(restored.snapshot.carriedSalvage).toBe(2);
});

test('all named regional road centerlines can be walked without wall collisions or abrupt terrain seams', () => {
  for (const road of REGION_ROADS) for (let segment=1;segment<road.points.length;segment++) {
    const a=road.points[segment-1]!, b=road.points[segment]!;
    const steps=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])*5), p=at(a[0],a[1]);
    for(let step=1;step<=steps;step++) {
      const x=a[0]+(b[0]-a[0])*step/steps,z=a[1]+(b[1]-a[1])*step/steps,previous=p.y;
      movePosition(p,x-p.x,z-p.z);
      expect(p.x,road.name).toBeCloseTo(x,6); expect(p.z,road.name).toBeCloseTo(z,6);
      expect(Math.abs(p.y-previous),road.name).toBeLessThan(.6);
    }
  }
});
