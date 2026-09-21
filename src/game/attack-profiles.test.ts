import { expect, test } from 'bun:test';
import { createAdventure, createSharedAdventure } from './adventure.js';
import { finishCycle, tap } from './yard-test-fixtures.js';
import { terrainHeight } from './cave-layout.js';
import type { CharacterArchetype } from '../host/character-profile.js';

const point = (x: number, z: number) => ({ x, y: terrainHeight(x,z), z });
function fixture(id = 'scout', archetype: CharacterArchetype = 'warrior') {
  const saved = JSON.parse(createAdventure({archetype}).save());
  const z = id === 'glassmire-lantern' ? 143 : 30, x = id === 'glassmire-lantern' ? 20 : 0;
  Object.assign(saved.state, { phase: 'expedition', position: point(x,z), selectedThreat: id });
  saved.state.combat = { phase:'preparation', cycle:1, elapsedSeconds:0, queued:[], nextId:1, ready:false };
  for (const enemy of saved.state.threats) {
    if (!enemy.active) continue;
    Object.assign(enemy, { health:0, phase:'cleared', aggro:false, lootClaimed:true });
    if (enemy.id === id) {
      Object.assign(enemy, {health:enemy.maximumHealth, active:true, phase:'preparation', aggro:true, lootClaimed:false, combatants:['solo'], position:point(x-7.5,z), turnTarget:point(x,z), targetPosition:point(x,z), joinCycle:1, windowCycle:1, specialOffset:.6, castDuration:.6, remainingSeconds:.6});
      if (enemy.head) Object.assign(enemy.head,{opened:true,ability:'fireball'});
    }
  }
  return saved;
}

test('a planned sidestep lets a straight shot hit the enemy behind; seeking shots still follow', () => {
  for (const id of ['scout','glassmire-lantern']) {
    const saved=fixture(id), start=saved.state.position;
    const enemy=saved.state.threats.find((t: {id:string})=>t.id==='nest');
    // Keep this interceptor still through the volley, inside its home leash for the Watchman case.
    if(id==='scout') Object.assign(enemy,{health:72,lootClaimed:false,active:true,aggro:true,phase:'recovery',staggered:true,position:point(2.5,31.65),joinCycle:1,windowCycle:1});
    const game=createAdventure({save:JSON.stringify(saved)});
    expect(game.queueBait(point(start.x,start.z+5))).toBe(true);
    const forecast=game.snapshot.combat.forecast!;
    const fire=forecast.paths.find(p=>p.action.startsWith('fireball:'))!;
    expect(fire).toBeDefined();
    if(id==='scout') {
      expect(forecast.events.some(e=>e.sourceId==='scout'&&e.targetId==='nest'&&e.kind==='hit')).toBe(true);
      expect(forecast.outcomes.find(o=>o.id==='solo')!.health).toBe(100);
    } else expect(forecast.outcomes.find(o=>o.id==='solo')!.health).toBe(82);
    game.readyCombat();finishCycle(game);
    expect(game.snapshot.player.health).toBe(forecast.outcomes.find(o=>o.id==='solo')!.health);
    if(id==='scout') expect(game.snapshot.threats.find(t=>t.id==='nest')!.health).toBe(54);
  }
});

test('short routes end sooner at the same speed and After follows the actual end', () => {
  for(const [tiles,duration] of [[1,.5],[2,1]]) {
    const saved=fixture(); const game=createAdventure({save:JSON.stringify(saved)});
    expect(game.queueBait(point(0,30+2.5*tiles!))).toBe(true); tap(game,'brace');
    expect(game.snapshot.combat.queued.find(e=>e.action==='brace')!.offsetSeconds).toBeCloseTo(.35+duration!+.15,8);
    game.readyCombat();game.advance(.6);
    expect(game.snapshot.player.position.z).toBeCloseTo(31.25,8);
    expect(game.movementCheckpoint!.maneuver!.duration).toBe(duration!);
    const restored=createAdventure({save:game.save()});
    game.advance(.1);restored.advance(.1);
    expect(restored.snapshot.player.position).toEqual(game.snapshot.player.position);
  }
});

test('In reach triggers once: stationary attacks stop the route while Ranger keeps moving', () => {
  for(const archetype of ['warrior','hunter'] as const) {
    const saved=fixture('scout',archetype), source=saved.state.threats.find((t: {id:string})=>t.id==='scout');
    source.staggered=true;source.phase='recovery';source.position=point(archetype==='warrior'?-7.5:-12.5,30);
    const game=createAdventure({save:JSON.stringify(saved)});
    tap(game,'strike');expect(game.queueBait(point(-5,30))).toBe(true);expect(game.setActionTiming('during')).toBe(true);
    const forecast=game.snapshot.combat.forecast!;
    const move=forecast.paths.find(p=>p.kind==='move')!;
    expect(move.points.at(-1)!.x).toBeCloseTo(archetype==='warrior'?-2.5:-5,7);
    expect(forecast.paths.filter(p=>p.actorId==='solo'&&p.action==='strike')).toHaveLength(1);
    game.readyCombat();game.advance(.7);
    const restored=createAdventure({save:game.save()});finishCycle(game);finishCycle(restored);
    expect(game.snapshot.player.attackSequence).toBe(1);
    expect(game.snapshot.threats.find(t=>t.id==='scout')!.health).toBe(archetype==='hunter'?70:78);
    expect(restored.snapshot.player).toEqual(game.snapshot.player);
    expect(game.snapshot.threats.find(t=>t.id==='scout')!.health).toBe(forecast.outcomes.find(o=>o.id==='scout')!.health);
  }
});

test('a committed heavy area strike holds its ground and damages another enemy in the area', () => {
  const saved=fixture('warder'), source=saved.state.threats.find((t:{id:string})=>t.id==='warder'), victim=saved.state.threats.find((t:{id:string})=>t.id==='patrol');
  saved.state.position=point(-2.5,47.5);source.position=point(-2.5,50);source.targetPosition=point(-2.5,50);
  Object.assign(victim,{health:72,lootClaimed:false,active:true,aggro:true,staggered:true,phase:'recovery',position:point(-5,50),windowCycle:1,joinCycle:1});
  const game=createAdventure({save:JSON.stringify(saved)});expect(game.queueBait(point(-2.5,42.5))).toBe(true);
  const forecast=game.snapshot.combat.forecast!;
  expect(forecast.events.some(e=>e.kind==='hit'&&e.sourceId==='warder'&&e.targetId==='patrol')).toBe(true);
  game.readyCombat();game.advance(1.2);
  expect(game.snapshot.threats.find(t=>t.id==='warder')!.position.x).toBe(-2.5);
  finishCycle(game);expect(game.snapshot.player.health).toBe(forecast.outcomes.find(o=>o.id==='solo')!.health);
});

test('Maul follows its committed path into another enemy and staggers both', () => {
  const saved=fixture('patrol'), source=saved.state.threats.find((t:{id:string})=>t.id==='patrol'), bee=saved.state.threats.find((t:{id:string})=>t.id==='nest');
  source.specialOffset=.85;source.remainingSeconds=.85;source.castDuration=.85;
  Object.assign(bee,{health:72,lootClaimed:false,aggro:true,phase:'preparation',position:point(-2,31.25),specialOffset:1.7,castDuration:1.7,remainingSeconds:1.7,windowCycle:1,joinCycle:1});
  const game=createAdventure({save:JSON.stringify(saved)});expect(game.queueBait(point(0,35))).toBe(true);
  const forecast=game.snapshot.combat.forecast!;
  expect(forecast.events.some(e=>e.kind==='collision'&&e.sourceId==='patrol'&&e.targetId==='nest')).toBe(true);
  expect(forecast.events.some(e=>e.kind==='interruption'&&e.targetId==='nest')).toBe(true);
  expect(forecast.outcomes.find(o=>o.id==='solo')!.health).toBe(100);
  game.readyCombat();game.advance(1.5);
  expect(game.snapshot.threats.find(t=>t.id==='patrol')!.staggered).toBe(true);
  expect(game.snapshot.threats.find(t=>t.id==='nest')!.staggered).toBe(true);
  finishCycle(game);expect(game.snapshot.player.health).toBe(100);
});

test('an untriggered In reach action stays unused and the forecast reports the failed range', () => {
  const saved=fixture(),source=saved.state.threats.find((t:{id:string})=>t.id==='scout');
  source.phase='recovery';source.staggered=true;
  const game=createAdventure({save:JSON.stringify(saved)});tap(game,'strike');expect(game.queueBait(point(0,35))).toBe(true);game.setActionTiming('during');
  const forecast=game.snapshot.combat.forecast!;
  expect(forecast.actions.find(a=>a.action==='strike')!.result).toBe('out-of-range');
  game.readyCombat();finishCycle(game);expect(game.snapshot.player.attackSequence).toBe(0);
});

test('a fired straight shot survives source death, private fork and a saved partial shared tick', () => {
  const base=createSharedAdventure();base.join('a','Ada','mage');const saved=JSON.parse(base.save()),solo=fixture().state;
  Object.assign(saved.characters[0].state,{phase:solo.phase,position:solo.position});saved.world.threats=solo.threats;
  Object.assign(saved.clock,{phase:'preparation',cycle:1,elapsedSeconds:0,gatheringRemainingSeconds:0});
  const source=saved.world.threats.find((t:{id:string})=>t.id==='scout');source.targetPlayerId='a';source.combatants=['a'];source.health=1;
  const world=createSharedAdventure({save:JSON.stringify(saved)}),player=world.join('a','Ada','mage');
  expect(player.queueBait(point(0,32.5))).toBe(true);tap(player,'strike');player.setActionTiming('after');
  const forecast=player.snapshot.combat.forecast!;
  player.readyCombat();world.advance(.713);
  expect(player.snapshot.threats.find(t=>t.id==='scout')!.fireballs).toHaveLength(1);
  expect(world.pause('a')).toBe(true);expect(world.resume('a')).toBe(true);
  const restored=createSharedAdventure({save:world.save()}),copy=restored.join('a','Ada','mage');expect(restored.resume('a')).toBe(true);
  world.advance(.34);restored.advance(.34);
  expect(copy.snapshot.threats.find(t=>t.id==='scout')!.health).toBe(0);
  expect(copy.snapshot.threats.find(t=>t.id==='scout')!.fireballs).toHaveLength(1);
  for(const dt of [.017,.031,.083,.011,.058,.1,...Array(30).fill(.1)]) {world.advance(dt);restored.advance(dt);}
  expect(copy.snapshot.player.health).toBe(player.snapshot.player.health);
  expect(copy.snapshot.threats.find(t=>t.id==='scout')!.health).toBe(0);
  expect(copy.snapshot.threats.find(t=>t.id==='scout')!.fireballs).toHaveLength(0);
  expect(player.snapshot.player.health).toBe(forecast.outcomes.find(o=>o.id==='a')!.health);
});

test('an already reachable stationary Attack holds from movement start in either queue order', () => {
  for(const attackFirst of [true,false]) {
    const saved=fixture(),source=saved.state.threats.find((t:{id:string})=>t.id==='scout');source.position=point(-5,30);source.phase='recovery';source.staggered=true;
    const game=createAdventure({save:JSON.stringify(saved)});
    if(attackFirst)tap(game,'strike');expect(game.queueBait(point(0,35))).toBe(true);if(!attackFirst)tap(game,'strike');game.setActionTiming('during');
    const forecast=game.snapshot.combat.forecast!;
    expect(forecast.paths.find(p=>p.kind==='move')!.points.at(-1)).toEqual(point(0,30));
    game.readyCombat();game.advance(1.4);
    expect(game.snapshot.player.position).toEqual(point(0,30));expect(game.snapshot.player.attackSequence).toBe(1);
  }
});

test('a saved seeking shot keeps its target after source death when a different party member drives the fork', () => {
  const seed=createSharedAdventure();seed.join('a','Ada','mage');seed.join('b','Bram','mage');
  const saved=JSON.parse(seed.save()),solo=fixture('glassmire-lantern').state;
  saved.world.threats=solo.threats;Object.assign(saved.clock,{phase:'preparation',cycle:1,elapsedSeconds:0,gatheringRemainingSeconds:0});
  for(const [i,character] of saved.characters.entries())Object.assign(character.state,{phase:'expedition',position:point(20+i*5,142.5),selectedThreat:'glassmire-lantern'});
  const source=saved.world.threats.find((t:{id:string})=>t.id==='glassmire-lantern');source.position=point(12.5,142.5);source.health=1;source.combatants=['a','b'];source.targetPlayerId='a';
  const world=createSharedAdventure({save:JSON.stringify(saved)}),a=world.join('a','Ada','mage'),b=world.join('b','Bram','mage');
  expect(a.queueBait(point(20,145))).toBe(true);tap(a,'strike');a.setActionTiming('after');a.readyCombat();b.readyCombat();world.advance(.713);
  expect(world.pause('a',['a','b'])).toBe(true);
  const restored=createSharedAdventure({save:world.save()}),other=restored.join('b','Bram','mage'),target=restored.join('a','Ada','mage');expect(restored.resume('b')).toBe(true);
  restored.advance(.34);expect(target.snapshot.threats.find(t=>t.id==='glassmire-lantern')!.health).toBe(0);
  expect(target.snapshot.threats.find(t=>t.id==='glassmire-lantern')!.fireballs).toHaveLength(1);
  restored.advance(.6);expect(target.snapshot.player.health).toBe(82);expect(other.snapshot.player.health).toBe(100);
});
