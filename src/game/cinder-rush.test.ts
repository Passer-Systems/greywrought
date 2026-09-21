import { expect, test } from 'bun:test';
import { createAdventure, createSharedAdventure, COMBAT_RULES } from './adventure.js';
import { terrainHeight } from './cave-layout.js';
import { finishCycle, tap } from './yard-test-fixtures.js';
const point=(x:number,z:number)=>({x,y:terrainHeight(x,z),z});
function fixture(id='scout') {
  const saved=JSON.parse(createAdventure().save()),z=id==='warder'?50:30;
  Object.assign(saved.state,{phase:'expedition',position:point(0,z),selectedThreat:id});
  saved.state.combat={phase:'preparation',cycle:1,elapsedSeconds:0,queued:[],nextId:1,ready:false};
  for(const enemy of saved.state.threats){if(!enemy.active)continue;Object.assign(enemy,{health:0,phase:'cleared',aggro:false,lootClaimed:true});if(enemy.id===id){Object.assign(enemy,{health:enemy.maximumHealth,phase:'preparation',aggro:true,lootClaimed:false,combatants:['solo'],position:point(-5,z),turnTarget:point(0,z),targetPosition:point(3,z),joinCycle:1,windowCycle:1,specialOffset:1.1,castDuration:1.1,remainingSeconds:1.1,damage:16});if(enemy.head)Object.assign(enemy.head,{opened:true,ability:'fire-rush'});}}
  return saved;
}

test('Fire Rush locks its path, can be sidestepped, burns stationary players and matches forecast',()=>{
  for(const dodge of [false,true]){
    const game=createAdventure({save:JSON.stringify(fixture())});
    const target=game.snapshot.threats.find(t=>t.id==='scout')!.targetPosition;
    if(dodge)expect(game.queueBait(point(0,35))).toBe(true);
    expect(game.snapshot.threats.find(t=>t.id==='scout')!.targetPosition).toEqual(target);
    const forecast=game.snapshot.combat.forecast!;
    expect(forecast.paths.find(p=>p.action==='fire-rush')!.points.at(-1)).toEqual(target);
    const health=forecast.outcomes.find(o=>o.id==='solo')!.health;
    expect(dodge?health===100:health<84).toBe(true);
    game.readyCombat();game.advance(1.4);const restored=createAdventure({save:game.save()});finishCycle(game);finishCycle(restored);
    expect(game.snapshot.player.health).toBe(health);expect(restored.snapshot.player.health).toBe(health);
    expect(game.snapshot.combat.hazards.some(h=>h.kind==='fire')).toBe(true);
    const remaining=game.snapshot.combat.hazards[0]!.remainingSeconds;
    game.advance(2);expect(game.snapshot.combat.hazards[0]!.remainingSeconds).toBe(remaining);
  }
});

test('crossing remaining fire hurts once on entry; expiry and forecast follow combat time',()=>{
  const saved=fixture(),head=saved.state.threats.find((t:{id:string})=>t.id==='scout').head;
  Object.assign(head,{ability:'kindle',fireTrails:[{id:99,points:[point(0,32.5)],remainingSeconds:.9,combatants:['solo'],cooldowns:{}}]});
  const game=createAdventure({save:JSON.stringify(saved)});expect(game.queueBait(point(0,35))).toBe(true);
  const forecast=game.snapshot.combat.forecast!;expect(forecast.outcomes.find(o=>o.id==='solo')!.health).toBe(96);
  game.readyCombat();finishCycle(game);expect(game.snapshot.player.health).toBe(96);expect(game.snapshot.combat.hazards.filter(h=>h.kind==='fire')).toHaveLength(0);
});

test('burning ground respects Block and existing death semantics',()=>{
  for(const defend of [false,true]){
    const saved=fixture(),head=saved.state.threats.find((t:{id:string})=>t.id==='scout').head;
    saved.state.health=3;Object.assign(head,{ability:'kindle',fireTrails:[{id:99,points:[point(0,30)],remainingSeconds:.3,combatants:['solo'],cooldowns:{}}]});
    const game=createAdventure({save:JSON.stringify(saved)});if(defend)tap(game,'brace');const predicted=game.snapshot.combat.forecast!.outcomes.find(o=>o.id==='solo')!.health;
    game.readyCombat();finishCycle(game);expect(game.snapshot.player.health).toBe(predicted);expect(game.snapshot.phase).toBe(defend?'expedition':'lost');
  }
});

test('Relic Warden has 144 health and cycles Sweep, tracking Cut and committed Sealbreaker',()=>{
  const saved=fixture('warder'),warden=saved.state.threats.find((t:{id:string})=>t.id==='warder');
  saved.state.position=point(-2.5,50);warden.targetPosition=point(-5,50);warden.damage=24;
  const game=createAdventure({save:JSON.stringify(saved)});expect(game.snapshot.threats.find(t=>t.id==='warder')!.maximumHealth).toBe(144);
  const ids=[];
  for(let i=0;i<3;i++) { const view=game.snapshot.threats.find(t=>t.id==='warder')!;ids.push(view.currentAbility.id);tap(game,'brace');const predicted=game.snapshot.combat.forecast!.outcomes.find(o=>o.id==='solo')!.health;game.readyCombat();finishCycle(game);expect(game.snapshot.player.health).toBe(predicted); }
  expect(ids).toEqual(['warden-sweep','warden-cut','warden-smash']);
});

test('fire never damages a nearby unrelated player in the shared world or a private fork',()=>{
  const seed=createSharedAdventure();seed.join('fighter','Fighter','warrior');seed.join('bystander','Bystander','warrior');const saved=JSON.parse(seed.save());
  const solo=fixture();saved.world.threats=solo.state.threats;Object.assign(saved.clock,solo.state.combat);
  for(const character of saved.characters){Object.assign(character.state,{phase:'expedition',position:point(0,30)});}
  const scout=saved.world.threats.find((t:{id:string})=>t.id==='scout');Object.assign(scout,{targetPlayerId:'fighter',combatants:['fighter']});
  const world=createSharedAdventure({save:JSON.stringify(saved)});const fighter=world.join('fighter','Fighter','warrior'),bystander=world.join('bystander','Bystander','warrior');
  expect(fighter.snapshot.combat.forecast!.outcomes.find(o=>o.id==='bystander')!.health).toBe(100);
  fighter.readyCombat();finishCycle(fighter,world);expect(bystander.snapshot.player.health).toBe(100);expect(fighter.snapshot.player.health).toBeLessThan(84);
  const fire = fighter.snapshot.combat.hazards.find(h=>h.kind==='fire')!;
  expect(world.pause('fighter')).toBe(true);world.advance(2);
  expect(fighter.snapshot.combat.hazards.find(h=>h.id===fire.id)!.remainingSeconds).toBe(fire.remainingSeconds);
  expect(world.resume('fighter')).toBe(true);tap(fighter,'brace');fighter.readyCombat();finishCycle(fighter,world);
  expect(bystander.snapshot.player.health).toBe(100);
  expect(fighter.snapshot.combat.hazards.find(h=>h.id===fire.id)!.remainingSeconds).toBeLessThan(fire.remainingSeconds!);
});

test('normal opener commits the next rush before movement and Warden health upgrades preserve wounds',()=>{
  const saved=fixture();Object.assign(saved.state.threats.find((t:{id:string})=>t.id==='scout').head,{opened:false,ability:'ember-beam'});
  const game=createAdventure({save:JSON.stringify(saved)});tap(game,'brace');game.readyCombat();finishCycle(game);
  const rush=game.snapshot.threats.find(t=>t.id==='scout')!;expect(rush.currentAbility.id).toBe('fire-rush');expect(rush.targetPosition.x).toBe(3);expect(rush.windowAction!.offsetSeconds).toBe(1.1);
  const warden=fixture('warder');Object.assign(warden.state.threats.find((t:{id:string})=>t.id==='warder'),{maximumHealth:72,health:50});
  const restored=createAdventure({save:JSON.stringify(warden)});expect(restored.snapshot.threats.find(t=>t.id==='warder')!.health).toBe(122);
});

test('a rush near its territory edge ends inside its leash instead of silently retreating mid-path',()=>{
  const saved=fixture(),scout=saved.state.threats.find((t:{id:string})=>t.id==='scout');
  saved.state.position=point(-15,30);scout.position=point(-12.5,30);Object.assign(scout.head,{opened:false,ability:'ember-beam'});
  const game=createAdventure({save:JSON.stringify(saved)});tap(game,'brace');game.readyCombat();finishCycle(game);
  const target=game.snapshot.threats.find(t=>t.id==='scout')!.targetPosition;
  expect(target.x).toBeGreaterThan(-17);expect(game.snapshot.combat.forecast!.events.some(e=>e.kind==='retreat'&&e.sourceId==='scout')).toBe(false);
  tap(game,'brace');game.readyCombat();game.advance(1.8);
  expect(game.snapshot.threats.find(t=>t.id==='scout')!.position.x).toBeCloseTo(target.x,6);
});

test('new rushes end behind close and distant targets rather than at a fixed distance', () => {
  for (const x of [-2.5, 5]) {
    const saved = fixture(); saved.state.position = point(x, 30);
    Object.assign(saved.state.threats.find((t: {id: string}) => t.id === 'scout').head, { opened: false, ability: 'ember-beam' });
    const game = createAdventure({ save: JSON.stringify(saved) });
    tap(game, 'brace'); game.readyCombat(); finishCycle(game);
    const rush = game.snapshot.threats.find(t => t.id === 'scout')!;
    expect(rush.currentAbility.id).toBe('fire-rush');
    expect(rush.targetPosition).toEqual(point(x + COMBAT_RULES.fireRush.overshoot, 30));
    const forecast = game.snapshot.combat.forecast!;
    expect(forecast.paths.find(p => p.action === 'fire-rush')!.points.at(-1)).toEqual(rush.targetPosition);
    expect(forecast.outcomes.find(o => o.id === 'solo')!.health).toBeLessThan(100);
    game.readyCombat(); game.advance(1.8);
    expect(game.snapshot.threats.find(t => t.id === 'scout')!.position.x).toBeCloseTo(rush.targetPosition.x, 6);
  }
});

test('shared rush follows its actual opponent past them even when another player drives the world', () => {
  const seed = createSharedAdventure(); seed.join('driver', 'Driver', 'warrior'); seed.join('opponent', 'Opponent', 'warrior');
  const saved = JSON.parse(seed.save()), solo = fixture();
  saved.world.threats = solo.state.threats; Object.assign(saved.clock, solo.state.combat);
  for (const character of saved.characters) Object.assign(character.state, { phase: 'expedition', position: point(character.id === 'driver' ? -5 : 5, character.id === 'driver' ? 25 : 30) });
  const scout = saved.world.threats.find((t: {id: string}) => t.id === 'scout');
  Object.assign(scout, { targetPlayerId: 'opponent', combatants: ['opponent'] });
  Object.assign(scout.head, { opened: false, ability: 'ember-beam' });
  const world = createSharedAdventure({ save: JSON.stringify(saved) });
  world.join('driver', 'Driver', 'warrior'); const opponent = world.join('opponent', 'Opponent', 'warrior');
  tap(opponent, 'brace'); opponent.readyCombat(); finishCycle(opponent, world);
  const rush = opponent.snapshot.threats.find(t => t.id === 'scout')!;
  expect(rush.targetPlayerId).toBe('opponent');
  expect(rush.targetPosition).toEqual(point(8, 30));
  const forecast = opponent.snapshot.combat.forecast!;
  expect(forecast.paths.find(p => p.action === 'fire-rush')!.points.at(-1)).toEqual(rush.targetPosition);
  opponent.readyCombat(); finishCycle(opponent, world);
  expect(opponent.snapshot.player.health).toBe(forecast.outcomes.find(o => o.id === 'opponent')!.health);
});

test('cover clips the committed rush and its forecast at the same visible endpoint', () => {
  const saved = fixture(), scout = saved.state.threats.find((t: {id: string}) => t.id === 'scout');
  saved.state.position = point(5, 40); scout.position = point(0, 35);
  Object.assign(scout.head, { opened: false, ability: 'ember-beam' });
  const game = createAdventure({ save: JSON.stringify(saved) });
  tap(game, 'brace'); game.readyCombat(); finishCycle(game);
  const rush = game.snapshot.threats.find(t => t.id === 'scout')!;
  expect(rush.currentAbility.id).toBe('fire-rush');
  expect(rush.targetPosition.z).toBeLessThan(38);
  expect(rush.targetPosition.z).toBeGreaterThan(37.9);
  expect(game.snapshot.combat.forecast!.paths.find(p => p.action === 'fire-rush')!.points.at(-1)).toEqual(rush.targetPosition);
  game.readyCombat(); game.advance(1.8);
  expect(game.snapshot.threats.find(t => t.id === 'scout')!.position.z).toBeCloseTo(rush.targetPosition.z, 6);
  expect(game.snapshot.player.health).toBe(100);
});
