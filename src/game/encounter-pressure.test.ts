import { COMBAT_RULES, createAdventure } from './adventure.js';
import {test,expect} from 'bun:test';
import type {AdventureGame, AdventureAction} from './adventure-types.js';
function tap(g:AdventureGame,a:AdventureAction){g.setAction(a,true);g.setAction(a,false);}
test('all available creatures patrol, including the bee; pauses stay brief',()=>{
 const g=createAdventure(),before=g.snapshot;
 g.advance(2);
 for(const t of g.snapshot.threats.filter(t=>t.active)) {
  expect(t.position).not.toEqual(before.threats.find(b=>b.id===t.id)!.position);
  expect(t.phase).toBe('patrol');expect(t.aggro).toBe(false);
 }
 const saved=g.save();expect(createAdventure({save:saved}).save()).toBe(saved);
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
 expect(g.snapshot.threats.find(t=>t.id==='patrol')!.joinsNextWindow).toBe(true);
 expect(g.snapshot.threats.find(t=>t.id==='nest')!.aggro).toBe(false);
 expect(g.snapshot.log.some(e=>e.text.includes("ally's call"))).toBe(true);
});
test('summon guarantees five seconds, preserves its plan on reload and leaves a running clock intact',()=>{
 for(const phase of ['idle','active','preparation'] as const){
  const data=JSON.parse(createAdventure().save());data.state.phase='expedition';data.state.position={x:2,y:0,z:42};data.state.cargo=6;
  if(phase!=='idle'){
   Object.assign(data.state.combat,{phase,cycle:1,elapsedSeconds:COMBAT_RULES.window[phase]-.2});
   const warder=data.state.threats.find((t:{id:string})=>t.id==='warder');
   Object.assign(warder,{aggro:true,phase:'preparation',joinCycle:1,windowCycle:1,position:{x:-2,y:0,z:38}});
  }
  const g=createAdventure({save:JSON.stringify(data)});tap(g,'ritual');
  const boss=g.snapshot.threats.find(t=>t.id==='ritual-guardian')!;
  expect(boss.forecast[0]!.remainingSeconds).toBeGreaterThanOrEqual(5);
  if(phase!=='idle'){expect(g.snapshot.combat.phase).toBe(phase);expect(g.snapshot.combat.elapsedSeconds).toBe(COMBAT_RULES.window[phase]-.2);}
  const restored=createAdventure({save:g.save()});expect(restored.save()).toBe(g.save());
  const sequence=boss.actionSequence;g.advance(4.99);
  expect(g.snapshot.threats.find(t=>t.id==='ritual-guardian')!.actionSequence).toBe(sequence);
 }
});
function fight(factory:typeof createAdventure,count:number,defend:boolean,seed=2000){
 const data=JSON.parse(factory().save()); const ids=['warder','patrol','ritual-guardian'].slice(0,count);
 data.state.phase='expedition';data.state.position={x:-3,y:0,z:34};data.state.ritualCalled=true;
 data.state.selectedThreat=ids[0]; data.state.combat={phase:'preparation',elapsedSeconds:0,cycle:1,queued:[],nextId:1};
 for(const t of data.state.threats){
  if(!ids.includes(t.id)){t.active=true;t.health=0;t.phase='cleared';t.lootClaimed=true;continue;}
  Object.assign(t,{active:true,aggro:true,phase:'preparation',windowCycle:0,joinCycle:2,rng:seed+ids.indexOf(t.id)*500,position:{x:-3+ids.indexOf(t.id)*.6,y:0,z:33},targetPosition:{x:-3,y:0,z:33}});
 }
 const g=factory({save:JSON.stringify(data)});let planned=0,elapsed=0;
 for(;elapsed<240&&g.snapshot.phase!=='lost'&&g.snapshot.threats.some(t=>ids.includes(t.id)&&t.health>0);elapsed+=.05){
  let s=g.snapshot;const target=s.threats.find(t=>ids.includes(t.id)&&t.health>0)!;
  if(s.selectedThreat!==target.id)g.selectTarget(target.id);
  const dx=target.position.x-s.player.position.x,dz=target.position.z-s.player.position.z;
  g.setCameraForward(dx,dz);g.setAction('forward',Math.hypot(dx,dz)>2.5);
  if(s.combat.phase==='preparation'&&planned!==s.combat.cycle){
   planned=s.combat.cycle;let block=-1;
   if(defend){let best=0;for(let beat=0;beat<COMBAT_RULES.window.actionSlots;beat++){const damage=s.threats.filter(t=>t.aggro&&t.health>0&&t.windowAction&&t.windowAction.offsetSeconds>=beat&&t.windowAction.offsetSeconds<beat+COMBAT_RULES.brace.duration).reduce((n,t)=>n+t.windowAction!.ability.damage,0);if(damage>best){best=damage;block=beat;}}}
   for(let beat=0;beat<COMBAT_RULES.window.actionSlots;beat++){
    tap(g,beat===block?'brace':'strike');
   }
  } else if(s.combat.phase==='active'&&!s.combat.queued.some(e=>e.status==='pending')&&s.combat.queued.length<COMBAT_RULES.window.maximumActions&&s.player.stamina>=1) tap(g,'strike');
  g.advance(.05);
 }
 return {count,defend,seed,hp:g.snapshot.player.health,seconds:Math.round(elapsed),remaining:g.snapshot.threats.filter(t=>ids.includes(t.id)).map(t=>[t.id,t.health]),lost:g.snapshot.phase==='lost'};
}
test('three-slot committed pulls reward defense; attack spam loses against two or three',()=>{
 const solo=fight(createAdventure,1,false),soloDefense=fight(createAdventure,1,true);
 const pair=fight(createAdventure,2,false),pairDefense=fight(createAdventure,2,true);
 const triple=fight(createAdventure,3,false),tripleDefense=fight(createAdventure,3,true);
 for(const result of [solo,soloDefense,pairDefense]){expect(result.lost).toBe(false);expect(result.remaining.every(([,hp])=>hp===0)).toBe(true);}
 expect(solo.hp).toBe(35);expect(soloDefense.hp).toBe(99);
 expect(pair.lost).toBe(true);expect(pair.hp).toBe(0);expect(pairDefense.hp).toBe(1);
 expect(triple.lost).toBe(true);expect(tripleDefense.lost).toBe(true);
});
