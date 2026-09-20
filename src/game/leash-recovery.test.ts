import {test,expect} from 'bun:test';
import {createAdventure} from './adventure.js';
import {tap, finishCycle, retreatUntilReleased} from './yard-test-fixtures.js';

test('a ranged pull cannot chip an enemy down across leash resets or hit its retreat',()=>{
 const saved=JSON.parse(createAdventure({archetype:'mage'}).save());
 saved.state.phase='expedition';saved.state.position={x:-8,y:0,z:35};
 for(const t of saved.state.threats)if(t.active&&t.id!=='nest'){t.health=0;t.phase='cleared';t.lootClaimed=true;}
 let game=createAdventure({archetype:'mage',save:JSON.stringify(saved)});
 const bee=()=>game.snapshot.threats.find(t=>t.id==='nest')!;
 game.selectTarget('nest');tap(game,'strike');game.readyCombat();game.advance(.01);
 expect(bee().health).toBe(63);expect(bee().aggro).toBe(true);
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
