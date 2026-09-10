import { createAdventure } from './adventure.js';
import {test,expect} from 'bun:test';
import type {AdventureGame, AdventureAction} from './adventure-types.js';
import type {CharacterArchetype} from '../host/character-profile.js';
import { earnedChapter } from './yard-test-fixtures.js';
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
 const data=JSON.parse(createAdventure().save());data.state.phase='expedition';data.state.position={x:-3,y:0,z:20};
 for(const t of data.state.threats){
  if(t.id==='warder')t.position={x:-3,y:0,z:27};
  if(t.id==='patrol')t.position={x:-8,y:0,z:28};
 }
 const g=createAdventure({save:JSON.stringify(data)});g.advance(.01);
 expect(g.snapshot.threats.find(t=>t.id==='warder')!.aggro).toBe(true);
 expect(g.snapshot.threats.find(t=>t.id==='patrol')!.aggro).toBe(true);
 expect(g.snapshot.threats.find(t=>t.id==='patrol')!.cast!.duration).toBeGreaterThanOrEqual(3);
 expect(g.snapshot.threats.find(t=>t.id==='nest')!.aggro).toBe(false);
 expect(g.snapshot.log.some(e=>e.text.includes("ally's call"))).toBe(true);
});
test('summoning gives three full seconds and preserves an independent existing cast',()=>{
 const data=JSON.parse(createAdventure({archetype:'mage'}).save());
 Object.assign(data.state,{phase:'expedition',position:{x:2,y:0,z:38.5},cargo:6});
 const warder=data.state.threats.find((t:{id:string})=>t.id==='warder');
 Object.assign(warder,{aggro:true,phase:'preparation',position:{x:0,y:0,z:36}});
 const game=createAdventure({save:JSON.stringify(data)});game.advance(.01);
 const previous=game.snapshot.threats.find(t=>t.id==='warder')!.cast;
 tap(game,'ritual');
 const boss=game.snapshot.threats.find(t=>t.id==='ritual-guardian')!;
 expect(boss.cast!.remainingSeconds).toBeGreaterThanOrEqual(3);
 expect(game.snapshot.threats.find(t=>t.id==='warder')!.cast).toEqual(previous);
 const restored=createAdventure({save:game.save()});
 expect(restored.snapshot.threats.find(t=>t.id==='ritual-guardian')!.cast).toEqual(boss.cast);
 game.advance(2.99);expect(game.snapshot.threats.find(t=>t.id==='ritual-guardian')!.actionSequence).toBe(0);
});

test('engaging another enemy starts its own cast without resetting an existing one',()=>{
 const data=JSON.parse(createAdventure({archetype:'mage'}).save());
 Object.assign(data.state,{phase:'expedition',position:{x:-3,y:0,z:14}});
 for(const t of data.state.threats)if(t.active&&!['scout','nest'].includes(t.id))Object.assign(t,{health:0,phase:'cleared',lootClaimed:true});
 const game=createAdventure({save:JSON.stringify(data)});game.advance(.01);
 const scout=()=>game.snapshot.threats.find(t=>t.id==='scout')!;
 const bee=()=>game.snapshot.threats.find(t=>t.id==='nest')!;
 const first=scout().cast!;expect(first.duration).toBeGreaterThanOrEqual(3);
 game.advance(1);const remaining=scout().cast!.remainingSeconds;
 game.selectTarget('nest');tap(game,'strike');game.advance(.01);
 expect(bee().cast!.duration).toBeGreaterThanOrEqual(3);
 expect(bee().cast!.remainingSeconds).toBeGreaterThanOrEqual(2.99);
 expect(scout().cast!.remainingSeconds).toBeCloseTo(remaining-.01);
 expect(scout().cast!.ability).toEqual(first.ability);
 expect(game.snapshot.player.health).toBe(100);
});

function pressure(count:number,defend:boolean,archetype:CharacterArchetype='warrior') {
 const data=JSON.parse(createAdventure({archetype}).save());
 Object.assign(data.state,{phase:'expedition',position:{x:-3,y:0,z:24}});
 data.state.chapter=earnedChapter(2);data.state.chapter.equipment={chest:'insulated-coat',mainhand:'yard-weapon'};
 const ids=['warder','patrol'].slice(0,count);
 for(const t of data.state.threats){
  if(!ids.includes(t.id)&&t.active)Object.assign(t,{health:0,phase:'cleared',lootClaimed:true});
  if(ids.includes(t.id))Object.assign(t,{aggro:true,phase:'preparation',rng:2000});
 }
 const game=createAdventure({save:JSON.stringify(data)});
 for(let elapsed=0;elapsed<12&&game.snapshot.player.health>0;elapsed+=.05){
  const s=game.snapshot;
  if(defend&&s.combat.globalCooldown===0&&s.threats.some(t=>t.cast&&t.cast.ability.damage>0&&t.cast.remainingSeconds<.25))tap(game,'brace');
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
  data.state.phase='expedition'; data.state.position={x:-3,y:0,z:4};
  for(const t of data.state.threats) if(t.id!=='scout' && t.id!=='ritual-guardian'){t.active=true;t.health=0;t.phase='cleared';t.lootClaimed=true;}
  const game=createAdventure({archetype,save:JSON.stringify(data)}); game.selectTarget('scout'); tap(game,'strike'); game.advance(.01);
  expect(game.snapshot.threats.find(t=>t.id==='scout')!.aggro).toBe(true);
  game.advance(8);
  expect(game.snapshot.player.health).toBeLessThan(100);
  expect(game.snapshot.threats.find(t=>t.id==='scout')!.health).toBeLessThan(96);
 }
});

test('retreating from a committed double pull breaks contact and preserves the run',()=>{
 const data=JSON.parse(createAdventure({archetype:'warrior'}).save());
 data.state.phase='expedition'; data.state.position={x:-3,y:0,z:24};
 data.state.chapter=earnedChapter(2);
 data.state.chapter.equipment={chest:'insulated-coat',mainhand:'yard-weapon'};
 for(const t of data.state.threats) if(t.id==='scout') {t.health=0;t.phase='cleared';t.lootClaimed=true;}
 const game=createAdventure({archetype:'warrior',save:JSON.stringify(data)});
 game.selectTarget('patrol'); tap(game,'brace'); game.advance(.01);
 expect(game.snapshot.threats.filter(t=>t.aggro).map(t=>t.id).sort()).toEqual(['patrol','warder']);
 game.setCameraForward(0,-1); game.setAction('forward',true); game.advance(7); game.setAction('forward',false);
 expect(game.snapshot.player.position.z).toBeLessThan(0);
 expect(game.snapshot.phase).toBe('town'); expect(game.snapshot.player.health).toBeGreaterThan(0);
 expect(game.snapshot.threats.filter(t=>t.aggro).length).toBe(0);
});
