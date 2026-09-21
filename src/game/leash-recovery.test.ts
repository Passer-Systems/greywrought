import {test,expect} from 'bun:test';
import {createAdventure} from './adventure.js';
import {tap, finishCycle, retreatUntilReleased} from './yard-test-fixtures.js';
import {terrainHeight} from './cave-layout.js';

const wardenPoint=(z:number)=>({x:-2.5,y:terrainHeight(-2.5,z),z});
function wardenSave(z:number) {
 const saved=JSON.parse(createAdventure({archetype:'hunter'}).save());
 Object.assign(saved.state,{phase:'expedition',position:wardenPoint(z)});
 for(const t of saved.state.threats) {
  if(t.id==='warder')t.position=wardenPoint(50);
  else if(t.active)Object.assign(t,{health:0,phase:'cleared',lootClaimed:true});
 }
 return saved;
}

test('a maximum-range Warden pull stays engaged with its wounds',()=>{
 const game=createAdventure({save:JSON.stringify(wardenSave(37.5))});
 game.selectTarget('warder');tap(game,'strike');game.readyCombat();finishCycle(game);
 const warden=game.snapshot.threats.find(t=>t.id==='warder')!;
 expect(warden.health).toBeLessThan(warden.maximumHealth);
 expect(warden.aggro).toBe(true);
 expect(game.snapshot.player.inCombat).toBe(true);
});

test('a planned Warden retreat across the old boundary preserves wounds and matches its forecast after reload',()=>{
 const saved=wardenSave(42.5);
 saved.state.threats.find((t:{id:string})=>t.id==='warder').health=100;
 let game=createAdventure({save:JSON.stringify(saved)});
 game.advance(.01);
 expect(game.snapshot.threats.find(t=>t.id==='warder')!.aggro).toBe(true);
 expect(game.queueBait(wardenPoint(37.5))).toBe(true);
 tap(game,'brace');
 game=createAdventure({save:game.save()});
 const forecast=game.snapshot.combat.forecast!;
 expect(forecast.events.some(e=>e.kind==='retreat'&&e.sourceId==='warder')).toBe(false);
 expect(forecast.outcomes.find(o=>o.id==='warder')!.health).toBe(100);
 game.readyCombat();finishCycle(game);
 expect(game.snapshot.player.position.z).toBe(37.5);
 expect(game.snapshot.player.health).toBe(forecast.outcomes.find(o=>o.id==='solo')!.health);
 const warden=game.snapshot.threats.find(t=>t.id==='warder')!;
 expect(warden.health).toBe(100);expect(warden.aggro).toBe(true);
 expect(game.snapshot.player.inCombat).toBe(true);
});

test('deliberately leaving the expanded Warden territory still releases it and restores its health',()=>{
 const saved=wardenSave(22.5),warden=saved.state.threats.find((t:{id:string})=>t.id==='warder');
 Object.assign(warden,{position:wardenPoint(27.5),health:100,aggro:true,phase:'approach'});
 const game=createAdventure({save:JSON.stringify(saved)});
 game.advance(.01);
 expect(game.snapshot.threats.find(t=>t.id==='warder')!.aggro).toBe(true);
 expect(game.queueBait(wardenPoint(17.5))).toBe(true);
 tap(game,'brace');
 expect(game.snapshot.combat.forecast!.events.some(e=>e.kind==='retreat'&&e.sourceId==='warder')).toBe(true);
 game.readyCombat();finishCycle(game);
 const released=game.snapshot.threats.find(t=>t.id==='warder')!;
 expect(released.aggro).toBe(false);expect(released.health).toBe(released.maximumHealth);
 expect(game.snapshot.player.inCombat).toBe(false);
});

test('a ranged pull cannot chip an enemy down across leash resets or hit its retreat',()=>{
 const saved=JSON.parse(createAdventure({archetype:'mage'}).save());
 saved.state.phase='expedition';saved.state.position={x:7.5,y:0,z:22.5};
 for(const t of saved.state.threats)if(t.active&&t.id!=='nest'){t.health=0;t.phase='cleared';t.lootClaimed=true;}
 let game=createAdventure({archetype:'mage',save:JSON.stringify(saved)});
 const bee=()=>game.snapshot.threats.find(t=>t.id==='nest')!;
 game.selectTarget('nest');tap(game,'strike');game.readyCombat();game.advance(.01);
 expect(bee().health).toBe(54);expect(bee().aggro).toBe(true);
 finishCycle(game);
 retreatUntilReleased(game,'nest');
 expect(bee().phase).toBe('returning');expect(bee().health).toBe(72);
 const returning=JSON.parse(game.save());
 returning.state.position={x:bee().position.x+5,y:0,z:bee().position.z};
 game=createAdventure({save:JSON.stringify(returning)});
 expect(Math.hypot(bee().position.x-game.snapshot.player.position.x,bee().position.z-game.snapshot.player.position.z)).toBeLessThan(10);
 expect(bee().canStrike).toBe(false);
 tap(game,'strike');game.advance(.05);
 expect(bee().health).toBe(72);expect(bee().aggro).toBe(false);
 const reopened=createAdventure({archetype:'mage',save:game.save()});
 expect(reopened.snapshot.threats.find(t=>t.id==='nest')!.health).toBe(72);
 expect(reopened.snapshot.threats.find(t=>t.id==='nest')!.phase).toBe('returning');
});
