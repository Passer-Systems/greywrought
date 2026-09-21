import { expect, test } from 'bun:test';
import { createSharedAdventure } from '../game/adventure.js';
import type { AdventureSnapshot } from '../game/adventure-types.js';
import { AttackAutocast } from './attack-autocast.js';

function fixture() {
  const seed=createSharedAdventure();seed.join('p','Planner','warrior');const saved=JSON.parse(seed.save());
  Object.assign(saved.characters[0].state,{phase:'expedition',position:{x:-2.5,y:0,z:27.5}});
  for(const enemy of saved.world.threats)if(enemy.active&&enemy.id!=='scout')Object.assign(enemy,{health:0,phase:'cleared',lootClaimed:true});
  const world=createSharedAdventure({save:JSON.stringify(saved)}),player=world.join('p','Planner','warrior');world.advance(.02);
  const values=new Map<string,string>(),storage={getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value);}};
  return {snapshot:player.snapshot,storage};
}
function nextTurn(snapshot: AdventureSnapshot): AdventureSnapshot {return {...snapshot,combat:{...snapshot.combat,cycle:snapshot.combat.cycle+1,queued:[]}};}

test('off by default; opt-in queues once per turn and persists independently for each character',()=>{
  const {snapshot,storage}=fixture(),auto=new AttackAutocast('p',storage);
  expect(auto.takeTarget(snapshot,'shared')).toBeNull();auto.toggle();
  expect(auto.takeTarget(snapshot,'shared')).toBe('scout');expect(auto.takeTarget(snapshot,'shared')).toBeNull();
  const restored=new AttackAutocast('p',storage);expect(restored.enabled).toBe(true);expect(restored.takeTarget(snapshot,'shared')).toBeNull();
  expect(restored.takeTarget(nextTurn(snapshot),'shared')).toBe('scout');
  restored.toggle();expect(restored.takeTarget(nextTurn(nextTurn(snapshot)),'shared')).toBeNull();
  expect(new AttackAutocast('another',storage).enabled).toBe(false);
});

test('manual Defend or removal owns the current turn even if autocast is toggled again',()=>{
  const {snapshot,storage}=fixture(),auto=new AttackAutocast('p',storage);auto.toggle();
  const defending={...snapshot,combat:{...snapshot.combat,queued:[{id:1,action:'brace' as const,targetId:null,destination:null,via:[],timing:'before' as const,offsetSeconds:0,cost:2,status:'pending' as const,reason:null}]}};
  expect(auto.takeTarget(defending,'shared')).toBeNull();expect(auto.takeTarget(snapshot,'shared')).toBeNull();
  const next=nextTurn(snapshot);auto.suppress(next,'shared');auto.toggle();auto.toggle();
  expect(auto.takeTarget(next,'shared')).toBeNull();expect(auto.takeTarget(nextTurn(next),'shared')).toBe('scout');
});

test('waits for an eligible target and never pulls a neutral creature or another fight',()=>{
  const {snapshot,storage}=fixture(),auto=new AttackAutocast('p',storage);auto.toggle();
  expect(auto.takeTarget({...snapshot,player:{...snapshot.player,inCombat:false}},'shared')).toBeNull();
  expect(auto.takeTarget({...snapshot,threats:snapshot.threats.map(t=>({...t,targetPlayerId:'stranger'}))},'shared')).toBeNull();
  expect(auto.takeTarget({...snapshot,threats:snapshot.threats.map(t=>({...t,aggro:false}))},'shared')).toBeNull();
  expect(auto.takeTarget({...snapshot,combat:{...snapshot.combat,ready:true}},'shared')).toBeNull();
  expect(auto.takeTarget({...snapshot,selectedThreat:'missing'},'shared')).toBe('scout');
});

test('manually chosen class skill is never replaced by basic Attack autocast',()=>{
  const {snapshot,storage}=fixture(),auto=new AttackAutocast('p',storage);auto.toggle();
  const planned={...snapshot,combat:{...snapshot.combat,queued:[{id:1,action:'special' as const,targetId:null,destination:null,via:[],timing:'during' as const,offsetSeconds:.5,cost:40,status:'pending' as const,reason:null}]}};
  expect(auto.takeTarget(planned,'shared')).toBeNull();
  expect(auto.takeTarget(snapshot,'shared')).toBeNull();
  expect(auto.takeTarget(nextTurn(snapshot),'shared')).toBe('scout');
});
