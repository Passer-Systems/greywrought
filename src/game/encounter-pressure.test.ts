import { createAdventure, createSharedAdventure, getMonsterLore } from './adventure.js';
import {test,expect} from 'bun:test';
import type {AdventureGame, AdventureAction} from './adventure-types.js';
import type {CharacterArchetype} from '../host/character-profile.js';
import { finishGathering, earnedChapter, travel } from './yard-test-fixtures.js';
import { terrainHeight } from './cave-layout.js';
function tap(g:AdventureGame,a:AdventureAction){g.setAction(a,true);g.setAction(a,false);}
test('Relic Warden retains the warder save identity', () => {
  const game = createAdventure(), restored = createAdventure({ save: game.save() });
  expect(restored.snapshot.threats.find(threat => threat.id === 'warder')?.name).toBe('Relic Warden');
  expect(getMonsterLore().find(threat => threat.id === 'warder')?.name).toBe('Relic Warden');
});

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
    ['scout',6,9],['nest',0,9],['warder',8,9],['patrol',6,9],['ritual-guardian',8,9],['cave-bat',7,9],['cave-crab',8,9],['pond-turtle',0,0],['meadow-rat',0,9],['meadow-rat-2',0,9],['meadow-bird',0,9],['meadow-bird-2',0,9],['meadow-bird-3',0,9],['meadow-rat-3',0,0],['meadow-bird-4',0,0],['scrap-skitter',0,0],['rust-skitter',0,0],['moss-skitter',0,0],['pond-turtle-west',0,0],['pond-turtle-north',0,0],['pond-turtle-south',0,0],['lake-dreadnought',7,0],
    ['glassmire-lantern',6,9],['glassmire-stalker',6,9],['glassmire-grazer',0,0],['choir-cantor',7,9],['choir-hound',7,9],['choir-sacristan',7,9],['ossuary-king',6,9],['ossuary-wing',6,9],['brinewood-bee',0,0],['suture-scavenger',0,0],
 ]);
});

test('small scavenger bots remain neutral until attacked and never call hostile help',()=>{
 const data=JSON.parse(createAdventure({archetype:'mage'}).save());
 Object.assign(data.state,{phase:'expedition',position:{x:-12,y:terrainHeight(-12,20),z:20}});
 for(const t of data.state.threats){
  if(t.id==='rust-skitter')t.position={x:-12,y:terrainHeight(-12,21),z:21};
  else if(t.id==='scout')t.position={x:-12,y:terrainHeight(-12,28),z:28};
  else if(t.active)Object.assign(t,{health:0,phase:'cleared',lootClaimed:true});
 }
 const game=createAdventure({save:JSON.stringify(data)});
 game.advance(.01);
 expect(game.snapshot.threats.find(t=>t.id==='rust-skitter')).toMatchObject({critter:true,aggro:false,disposition:'neutral',health:24,callForHelpRange:0});
 game.selectTarget('rust-skitter');tap(game,'strike');game.advance(.01);
 expect(game.snapshot.threats.find(t=>t.id==='rust-skitter')!.aggro).toBe(true);
 expect(game.snapshot.threats.find(t=>t.id==='scout')!.aggro).toBe(false);
});

test('older solo, shared and private worlds gain scavenger bots without resetting existing creatures',()=>{
 const solo=JSON.parse(createAdventure().save());
 solo.state.threats=solo.state.threats.filter((t:{id:string})=>!t.id.endsWith('-skitter'));
 solo.state.threats.find((t:{id:string})=>t.id==='scout').health=53;
 const restoredSolo=createAdventure({save:JSON.stringify(solo)});
 expect(restoredSolo.snapshot.threats.find(t=>t.id==='scout')!.health).toBe(53);
 expect(restoredSolo.snapshot.threats.filter(t=>t.id.endsWith('-skitter'))).toHaveLength(3);
 const seed=createSharedAdventure({now:()=>1000});seed.join('traveller','Traveller','mage');seed.pause('traveller');
 const shared=JSON.parse(seed.save());
 for(const world of [shared.world,shared.instances[0].world]){
  world.threats=world.threats.filter((t:{id:string})=>!t.id.endsWith('-skitter'));
  world.threats.find((t:{id:string})=>t.id==='scout').health=53;
 }
 const restored=createSharedAdventure({save:JSON.stringify(shared),now:()=>1000});
 for(const game of [restored.join('traveller','Traveller','mage'),restored.join('observer','Observer','mage')]){
  expect(game.snapshot.threats.find(t=>t.id==='scout')!.health).toBe(53);
  expect(game.snapshot.threats.filter(t=>t.id.endsWith('-skitter'))).toHaveLength(3);
 }
 expect(restored.session('traveller').mode).toBe('paused');
});

function sharedSocialPull(){
 const seed=createSharedAdventure();seed.join('attacker','Attacker','mage');seed.join('bystander','Bystander','mage');
 const data=JSON.parse(seed.save());
 for(const entry of data.characters)Object.assign(entry.state,{phase:'expedition',position:entry.id==='attacker'?{x:-3,y:0,z:50}:{x:0,y:0,z:32.5}});
 for(const t of data.world.threats){
  if(t.id==='scout')Object.assign(t,{health:0,phase:'cleared',lootClaimed:true});
  if(t.id==='warder')t.position={x:-3,y:0,z:47};
  if(t.id==='patrol')t.position={x:0,y:0,z:39};
  if(t.id==='nest')t.position={x:7.5,y:0,z:30};
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
  Object.assign(data.state,{phase:'expedition',position:obstructed?{x:0,y:0,z:35}:{x:0,y:0,z:30}});
  for(const t of data.state.threats){
   if(t.id==='nest')t.position=obstructed?{x:3,y:0,z:37}:{x:0,y:0,z:32.5};
   else if(t.id==='patrol')t.position=obstructed?{x:3,y:0,z:45}:{x:-5,y:0,z:37.5};
   else if(t.active)Object.assign(t,{health:0,phase:'cleared',lootClaimed:true});
  }
  const game=createAdventure({save:JSON.stringify(data)});game.selectTarget('nest');tap(game,'strike');game.advance(.01);
  expect(game.snapshot.threats.find(t=>t.id==='nest')!.aggro).toBe(true);
  expect(game.snapshot.threats.find(t=>t.id==='patrol')!.aggro).toBe(!obstructed);
 }
});

test('a helper does not inherit an opponent beyond its own leash',()=>{
 const data=JSON.parse(createAdventure({archetype:'mage'}).save());
 Object.assign(data.state,{phase:'expedition',position:{x:-3,y:0,z:17.5}});
 for(const t of data.state.threats){
  if(t.id==='scout')t.position={x:-3,y:0,z:25};
  else if(t.id==='warder')t.position={x:-3,y:0,z:32.5};
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
 Object.assign(data.state,{phase:'expedition',position:{x:0,y:0,z:32.5}});
 Object.assign(data.state.threats.find((t:{id:string})=>t.id==='nest'), { position:{x:7.5,y:0,z:32.5}, remainingSeconds:60 });
 for(const t of data.state.threats)if(t.active&&!['scout','nest'].includes(t.id))Object.assign(t,{health:0,phase:'cleared',lootClaimed:true});
 const game=createAdventure({save:JSON.stringify(data)});game.advance(.01);
 const scout=()=>game.snapshot.threats.find(t=>t.id==='scout')!;
 const bee=()=>game.snapshot.threats.find(t=>t.id==='nest')!;
 const first=scout().cast!;expect(first.duration).toBeGreaterThanOrEqual(.9);expect(first.duration).toBeLessThanOrEqual(1.1);
 finishGathering(game); game.advance(1);const remaining=scout().cast!.remainingSeconds;
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

test("patrolling creatures face travel through turns and hold their heading at stops", () => {
  const game = createAdventure();
  const headings = new Map<string, Set<string>>();
  let previous = game.snapshot;
  for (let step = 0; step < 480; step++) {
    game.advance(1 / 30);
    const current = game.snapshot;
    for (const threat of current.threats.filter(t => t.phase === "patrol")) {
      const before = previous.threats.find(t => t.id === threat.id)!;
      const dx = threat.position.x - before.position.x, dz = threat.position.z - before.position.z;
      const length = Math.hypot(dx, dz);
      if (length > 1e-6) {
        expect((dx * threat.facing.x + dz * threat.facing.z) / length).toBeCloseTo(1, 5);
        const seen = headings.get(threat.id) ?? new Set<string>();
        seen.add(`${threat.facing.x.toFixed(2)},${threat.facing.z.toFixed(2)}`);
        headings.set(threat.id, seen);
      } else expect(threat.facing).toEqual(before.facing);
    }
    previous = current;
  }
  expect(headings.get("warder")!.size).toBeGreaterThan(2);
  const restored = createAdventure({ save: game.save() });
  expect(restored.snapshot.threats.find(t => t.id === "warder")!.facing).toEqual(game.snapshot.threats.find(t => t.id === "warder")!.facing);
});
