import { createAdventure, createSharedAdventure } from './adventure.js';
import {test,expect} from 'bun:test';
import type {AdventureGame, AdventureAction} from './adventure-types.js';
import type {CharacterArchetype} from '../host/character-profile.js';
import { earnedChapter, travel } from './yard-test-fixtures.js';
function tap(g:AdventureGame,a:AdventureAction){g.setAction(a,true);g.setAction(a,false);}
test('all available creatures patrol, including the bee; pauses stay brief',()=>{
 const g=createAdventure(),before=g.snapshot;
 g.advance(2);
 for(const t of g.snapshot.threats.filter(t=>t.active)) {
  expect(t.position).not.toEqual(before.threats.find(b=>b.id===t.id)!.position);
  expect(t.phase).toBe('patrol');expect(t.aggro).toBe(false);
 }
 const saved=g.save();expect(JSON.parse(createAdventure({save:saved}).save())).toEqual(JSON.parse(saved));
});
test('social aggro reaches a nearby ally outside player detection; neutral bee stays neutral',()=>{
 const data=JSON.parse(createAdventure().save());data.state.phase='expedition';data.state.position={x:-3,y:0,z:40};
 for(const t of data.state.threats){
  if(t.id==='warder')t.position={x:-3,y:0,z:47};
  if(t.id==='patrol')t.position={x:-8,y:0,z:48};
 }
 const g=createAdventure({save:JSON.stringify(data)});g.advance(.01);
 expect(g.snapshot.threats.find(t=>t.id==='warder')!.aggro).toBe(true);
 expect(g.snapshot.threats.find(t=>t.id==='patrol')!.aggro).toBe(true);
 expect(g.snapshot.threats.find(t=>t.id==='patrol')!.windowAction!.offsetSeconds).toBeGreaterThanOrEqual(.75);
 expect(g.snapshot.threats.find(t=>t.id==='patrol')!.windowAction!.offsetSeconds).toBeLessThanOrEqual(.95);
 expect(g.snapshot.threats.find(t=>t.id==='nest')!.aggro).toBe(false);
 expect(g.snapshot.log.some(e=>e.text.includes("ally's call"))).toBe(true);
});
test('threat views expose the gameplay detection and call-for-help radii',()=>{
 const threats=createAdventure().snapshot.threats;
 expect(threats.map(t=>[t.id,t.aggroRange,t.callForHelpRange])).toEqual([
  ['scout',6,9],['nest',0,9],['warder',8,9],['patrol',6,9],['ritual-guardian',8,9],['cave-bat',7,9],['cave-crab',8,9],
 ]);
});

function sharedSocialPull(){
 const seed=createSharedAdventure();seed.join('attacker','Attacker','mage');seed.join('bystander','Bystander','mage');
 const data=JSON.parse(seed.save());
 for(const entry of data.characters)Object.assign(entry.state,{phase:'expedition',position:entry.id==='attacker'?{x:-3,y:0,z:40}:{x:-8,y:0,z:41}});
 for(const t of data.world.threats){
  if(t.id==='scout')Object.assign(t,{health:0,phase:'cleared',lootClaimed:true});
  if(t.id==='warder')t.position={x:-3,y:0,z:47};
  if(t.id==='patrol')t.position={x:-8,y:0,z:48};
 }
 const world=createSharedAdventure({save:JSON.stringify(data)});
 const attacker=world.join('attacker','Attacker','mage'),bystander=world.join('bystander','Bystander','mage');
 attacker.selectTarget('warder');tap(attacker,'strike');
 return {world,attacker,bystander};
}

test('a call recruits against its caller’s opponent despite a nearer bystander or separate fight',()=>{
 for(const separateFight of [false,true]){
  const {world,attacker,bystander}=sharedSocialPull();
  if(separateFight){bystander.selectTarget('nest');tap(bystander,'strike');}
  world.advance(.01);
  const helper=attacker.snapshot.threats.find(t=>t.id==='patrol')!;
  expect(helper.aggro).toBe(true);expect(helper.targetPlayerId).toBe('attacker');
  expect(attacker.snapshot.log.some(e=>e.text.includes("ally's call"))).toBe(true);
  expect(bystander.snapshot.player.inCombat).toBe(separateFight);
 }
});

test('pausing a pull keeps new helpers out of the private encounter',()=>{
 const {world,attacker}=sharedSocialPull();
 expect(world.pause('attacker')).toBe(true);expect(world.resume('attacker')).toBe(true);
 world.advance(.01);
 expect(attacker.snapshot.threats.find(t=>t.id==='warder')!.aggro).toBe(true);
 expect(attacker.snapshot.threats.find(t=>t.id==='patrol')!.aggro).toBe(false);
 expect(world.session('attacker').mode).toBe('private');
});

test('calls cannot recruit a distant, returning, or defeated helper',()=>{
 for(const excluded of ['distant','returning','defeated']){
  const data=JSON.parse(createAdventure({archetype:'mage'}).save());
  Object.assign(data.state,{phase:'expedition',position:{x:-3,y:0,z:40}});
  for(const t of data.state.threats){
   if(t.id==='scout')Object.assign(t,{health:0,phase:'cleared',lootClaimed:true});
   if(t.id==='warder')t.position={x:-3,y:0,z:47};
   if(t.id==='patrol'){
    t.position={x:-8,y:0,z:excluded==='distant'?56:48};
    if(excluded==='returning')t.phase='returning';
    if(excluded==='defeated')Object.assign(t,{health:0,phase:'cleared',lootClaimed:true});
   }
  }
  const game=createAdventure({save:JSON.stringify(data)});game.selectTarget('warder');tap(game,'strike');game.advance(.01);
  expect(game.snapshot.threats.find(t=>t.id==='warder')!.aggro).toBe(true);
  expect(game.snapshot.threats.find(t=>t.id==='patrol')!.aggro).toBe(false);
 }
});

test('calls cannot wake the inactive Foreman before summoning',()=>{
 const data=JSON.parse(createAdventure({archetype:'mage'}).save());
 Object.assign(data.state,{phase:'expedition',position:{x:0,y:0,z:50}});
 for(const t of data.state.threats){
  if(t.id==='warder')t.position={x:0,y:0,z:55};
  else if(t.active)Object.assign(t,{health:0,phase:'cleared',lootClaimed:true});
 }
 const game=createAdventure({save:JSON.stringify(data)});game.selectTarget('warder');tap(game,'strike');game.advance(.01);
 expect(game.snapshot.threats.find(t=>t.id==='warder')!.aggro).toBe(true);
 expect(game.snapshot.threats.find(t=>t.id==='ritual-guardian')!.aggro).toBe(false);
});

test('an attacked neutral creature can call hostile help only across a clear path',()=>{
 for(const obstructed of [false,true]){
  const data=JSON.parse(createAdventure({archetype:'mage'}).save());
  Object.assign(data.state,{phase:'expedition',position:obstructed?{x:3,y:0,z:47}:{x:1,y:0,z:40}});
  for(const t of data.state.threats){
   if(t.id==='nest')t.position=obstructed?{x:3,y:0,z:45}:{x:-3,y:0,z:40};
   else if(t.id==='patrol')t.position=obstructed?{x:3,y:0,z:37}:{x:-8,y:0,z:45};
   else if(t.active)Object.assign(t,{health:0,phase:'cleared',lootClaimed:true});
  }
  const game=createAdventure({save:JSON.stringify(data)});game.selectTarget('nest');tap(game,'strike');game.advance(.01);
  expect(game.snapshot.threats.find(t=>t.id==='nest')!.aggro).toBe(true);
  expect(game.snapshot.threats.find(t=>t.id==='patrol')!.aggro).toBe(!obstructed);
 }
});

test('a helper does not inherit an opponent beyond its own leash',()=>{
 const data=JSON.parse(createAdventure({archetype:'mage'}).save());
 Object.assign(data.state,{phase:'expedition',position:{x:-3,y:0,z:30}});
 for(const t of data.state.threats){
  if(t.id==='scout')t.position={x:-3,y:0,z:36};
  else if(t.id==='warder')t.position={x:-3,y:0,z:44};
  else if(t.active)Object.assign(t,{health:0,phase:'cleared',lootClaimed:true});
 }
 const game=createAdventure({save:JSON.stringify(data)});game.selectTarget('scout');tap(game,'strike');game.advance(.01);
 expect(game.snapshot.threats.find(t=>t.id==='scout')!.aggro).toBe(true);
 expect(game.snapshot.threats.find(t=>t.id==='warder')!.aggro).toBe(false);
});
test('summoning during planning preserves the existing committed cast',()=>{
 const data=JSON.parse(createAdventure({archetype:'mage'}).save());
 Object.assign(data.state,{phase:'expedition',position:{x:2,y:0,z:58.5},cargo:6});
 const warder=data.state.threats.find((t:{id:string})=>t.id==='warder');
 Object.assign(warder,{aggro:true,phase:'preparation',position:{x:0,y:0,z:56}});
 const game=createAdventure({save:JSON.stringify(data)});game.advance(.01);
 const previous=game.snapshot.threats.find(t=>t.id==='warder')!.cast;
 tap(game,'ritual');
 const boss=game.snapshot.threats.find(t=>t.id==='ritual-guardian')!;
 expect(boss.cast).toBeNull();expect(boss.joinsNextWindow).toBe(true);
 expect(game.snapshot.threats.find(t=>t.id==='warder')!.cast).toEqual(previous);
 const restored=createAdventure({save:game.save()});
 expect(restored.snapshot.threats.find(t=>t.id==='ritual-guardian')!.cast).toEqual(boss.cast);
 game.advance(2.99);expect(game.snapshot.threats.find(t=>t.id==='ritual-guardian')!.actionSequence).toBe(0);
});

test('engaging another enemy during planning preserves the existing committed cast',()=>{
 const data=JSON.parse(createAdventure({archetype:'mage'}).save());
 Object.assign(data.state,{phase:'expedition',position:{x:-3,y:0,z:34}});
 for(const t of data.state.threats)if(t.active&&!['scout','nest'].includes(t.id))Object.assign(t,{health:0,phase:'cleared',lootClaimed:true});
 const game=createAdventure({save:JSON.stringify(data)});game.advance(.01);
 const scout=()=>game.snapshot.threats.find(t=>t.id==='scout')!;
 const bee=()=>game.snapshot.threats.find(t=>t.id==='nest')!;
 const first=scout().cast!;expect(first.duration).toBeGreaterThanOrEqual(.9);expect(first.duration).toBeLessThanOrEqual(1.1);
 game.advance(1);const remaining=scout().cast!.remainingSeconds;
 game.selectTarget('nest');tap(game,'strike');game.advance(.01);
 expect(bee().cast).toBeNull();expect(bee().joinsNextWindow).toBe(true);
 expect(scout().cast!.remainingSeconds).toBeCloseTo(remaining);
 expect(scout().cast!.ability).toEqual(first.ability);
 expect(game.snapshot.player.health).toBe(100);
});

function pressure(count:number,defend:boolean,archetype:CharacterArchetype='warrior') {
 const data=JSON.parse(createAdventure({archetype}).save());
 Object.assign(data.state,{phase:'expedition',position:{x:-3,y:0,z:44}});
 data.state.chapter=earnedChapter(2);data.state.chapter.equipment={chest:'insulated-coat',mainhand:'yard-weapon'};
 const ids=['warder','patrol'].slice(0,count);
 for(const t of data.state.threats){
  if(!ids.includes(t.id)&&t.active)Object.assign(t,{health:0,phase:'cleared',lootClaimed:true});
  if(ids.includes(t.id))Object.assign(t,{aggro:true,combatants:['solo'],phase:'preparation',rng:2000});
 }
 const game=createAdventure({save:JSON.stringify(data)});
 for(let elapsed=0;elapsed<5&&game.snapshot.player.health>0;elapsed+=.05){
  const s=game.snapshot;
  if(s.combat.phase==='preparation'){
   if(defend&&s.player.stamina>=2){tap(game,'brace');}
   game.readyCombat();
  }
  game.advance(.05);
 }
 return game.snapshot.player.health;
}
test('ordinary pulls cause attrition, multiple enemies increase pressure, and timely defense mitigates it',()=>{
 for(const archetype of ['warrior','mage','hunter','alchemist','artificer'] as const){
  const solo=pressure(1,false,archetype),pair=pressure(2,false,archetype),defended=pressure(2,true,archetype);
  expect(solo).toBeLessThan(100);expect(pair).toBeLessThan(solo);expect(defended).toBeGreaterThan(pair);
 }
});

test('ranged attacks keep Watchman aggro instead of dropping contact at distance',()=>{
 for(const archetype of ['mage','hunter','alchemist','artificer'] as const){
  const data=JSON.parse(createAdventure({archetype}).save());
  data.state.phase='expedition'; data.state.position={x:-3,y:0,z:24};
  for(const t of data.state.threats) if(t.id!=='scout' && t.id!=='ritual-guardian'){t.active=true;t.health=0;t.phase='cleared';t.lootClaimed=true;}
  const game=createAdventure({archetype,save:JSON.stringify(data)}); game.selectTarget('scout'); tap(game,'strike'); game.advance(.01);
  expect(game.snapshot.threats.find(t=>t.id==='scout')!.aggro).toBe(true);
  game.readyCombat();game.advance(8);
  expect(game.snapshot.player.health).toBeLessThan(100);
  expect(game.snapshot.threats.find(t=>t.id==='scout')!.health).toBeLessThan(96);
 }
});

test('retreating from a committed double pull breaks contact and preserves the run',()=>{
 const data=JSON.parse(createAdventure({archetype:'warrior'}).save());
 data.state.phase='expedition'; data.state.position={x:-3,y:0,z:44};
 data.state.chapter=earnedChapter(2);
 data.state.chapter.equipment={chest:'insulated-coat',mainhand:'yard-weapon'};
 for(const t of data.state.threats) if(t.id==='scout') {t.health=0;t.phase='cleared';t.lootClaimed=true;}
 const hound=data.state.threats.find((t:{id:string})=>t.id==='patrol'); hound.position={x:-6,y:0,z:44};
 const game=createAdventure({archetype:'warrior',save:JSON.stringify(data)});
 game.selectTarget('patrol'); tap(game,'brace'); game.advance(.01);
 expect(game.snapshot.threats.filter(t=>t.aggro).map(t=>t.id).sort()).toEqual(['patrol','warder']);
 travel(game,0,25); travel(game,0,-1);
 expect(game.snapshot.player.position.z).toBeLessThan(0);
 expect(game.snapshot.phase).toBe('town'); expect(game.snapshot.player.health).toBeGreaterThan(0);
 expect(game.snapshot.threats.filter(t=>t.aggro).length).toBe(0);
});
