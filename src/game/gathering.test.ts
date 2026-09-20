import { expect, test } from 'bun:test';
import { createAdventure, createSharedAdventure } from './adventure.js';
import { tap } from './yard-test-fixtures.js';

function seed() {
  const world = createSharedAdventure({now:()=>1000});
  for (const id of ['a','b']) world.join(id,id,'mage');
  const saved = JSON.parse(world.save());
  for (const character of saved.characters) Object.assign(character.state,{phase:'expedition',position:{x:-2,y:0,z:32}});
  for (const threat of saved.world.threats) if (['scout','nest','patrol'].includes(threat.id)) Object.assign(threat,{health:0,phase:'cleared',lootClaimed:true});
  return saved;
}

test('harvest rewards, depletion, thorns and regrowth happen once at completion',()=>{
  const world=createSharedAdventure({save:JSON.stringify(seed()),now:()=>1000}), a=world.join('a','a','mage');
  tap(a,'gather'); world.advance(1.99);
  expect(a.snapshot.cargo).toBe(0); expect(a.snapshot.resourceRemaining).toBe(12); expect(a.snapshot.player.health).toBe(100);
  expect(JSON.parse(world.save()).world.resourceRespawns).toEqual([]);
  world.advance(.01);
  expect(a.snapshot.cargo).toBe(3); expect(a.snapshot.resourceRemaining).toBe(9); expect(a.snapshot.player.health).toBe(92);
  expect(JSON.parse(world.save()).world.resourceRespawns).toEqual([{at:121000,quantity:3}]);
  world.advance(3); expect(a.snapshot.cargo).toBe(3);
});

test('movement, jump, explicit cancellation, another action and pause abandon the pending reward',()=>{
  for(const action of ['forward','jump','cancelGather','brace','pause'] as const){
    const world=createSharedAdventure({save:JSON.stringify(seed()),now:()=>1000}), a=world.join('a','a','mage');
    tap(a,'gather');world.advance(1);
    if(action==='pause'){world.pause('a');world.resume('a');world.rejoin('a');}else tap(a,action);
    world.advance(3);
    expect(a.snapshot.cargo).toBe(0);expect(a.snapshot.resourceRemaining).toBe(12);expect(a.snapshot.player.health).toBe(100);
    expect(JSON.parse(world.save()).world.resourceRespawns).toEqual([]);
  }
});

test('network movement cancels gathering before the timer can finish',()=>{
  const world=createSharedAdventure({save:JSON.stringify(seed()),now:()=>1000}),a=world.join('a','a','mage');
  a.enableNetworkMovement!();tap(a,'gather');world.advance(1.9);
  a.enqueueMovement!([{sequence:1,seconds:.1,input:{forward:1,strafe:0,cameraX:0,cameraZ:1,jump:false}}]);world.advance(.2);
  expect(a.snapshot.cargo).toBe(0);expect(a.snapshot.resourceRemaining).toBe(12);
});

test('saved pending timer resumes and shared final batch is awarded to only one gatherer',()=>{
  const saved=seed();saved.world.resourceRemaining=3;saved.world.resourceRespawns=[{at:121000,quantity:9}];
  let world=createSharedAdventure({save:JSON.stringify(saved),now:()=>1000});
  for(const id of ['a','b'])tap(world.join(id,id,'mage'),'gather');world.advance(.75);
  world=createSharedAdventure({save:world.save(),now:()=>1000});
  const a=world.join('a','a','mage'),b=world.join('b','b','mage');world.advance(1.24);
  expect(a.snapshot.cargo+b.snapshot.cargo).toBe(0);world.advance(.01);
  expect(a.snapshot.cargo+b.snapshot.cargo).toBe(3);expect(a.snapshot.resourceRemaining).toBe(0);
  expect([a.snapshot.player.health,b.snapshot.player.health].sort((x,y)=>x-y)).toEqual([92,100]);
});

test('old saved gather cooldown cannot award a second batch',()=>{
  const data=JSON.parse(createAdventure().save());Object.assign(data.state,{phase:'expedition',position:{x:-2,y:0,z:32},currentAction:'gather',actionDuration:2,actionCooldown:2,actionRemainingSeconds:2,cargo:3,resourceRemaining:9});delete data.state.gatherPending;
  for(const t of data.state.threats)if(['scout','nest','patrol'].includes(t.id))Object.assign(t,{health:0,phase:'cleared',lootClaimed:true});
  const game=createAdventure({save:JSON.stringify(data),now:()=>1000});game.advance(2);
  expect(game.snapshot.cargo).toBe(3);expect(game.snapshot.resourceRemaining).toBe(9);
});
