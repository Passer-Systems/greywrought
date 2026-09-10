import {test,expect} from 'bun:test';
import {createAdventure} from './adventure.js';
import {tap} from './yard-test-fixtures.js';

test('a ranged pull cannot chip an enemy down across leash resets or hit its retreat',()=>{
 const saved=JSON.parse(createAdventure({archetype:'mage'}).save());
 saved.state.phase='expedition';saved.state.position={x:-8,y:0,z:20};
 for(const t of saved.state.threats)if(t.active&&t.id!=='nest'){t.health=0;t.phase='cleared';t.lootClaimed=true;}
 const game=createAdventure({archetype:'mage',save:JSON.stringify(saved)});
 const bee=()=>game.snapshot.threats.find(t=>t.id==='nest')!;
 game.selectTarget('nest');tap(game,'strike');game.advance(.01);
 expect(bee().health).toBe(63);expect(bee().aggro).toBe(true);
 game.setCameraForward(0,-1);game.setAction('forward',true);game.advance(3.8);game.setAction('forward',false);
 expect(bee().phase).toBe('returning');expect(bee().health).toBe(72);
 expect(Math.hypot(bee().position.x-game.snapshot.player.position.x,bee().position.z-game.snapshot.player.position.z)).toBeLessThan(10);
 expect(bee().canStrike).toBe(false);
 tap(game,'strike');game.advance(.05);
 expect(bee().health).toBe(72);expect(bee().aggro).toBe(false);
 const reopened=createAdventure({archetype:'mage',save:game.save()});
 expect(reopened.snapshot.threats.find(t=>t.id==='nest')!.health).toBe(72);
 expect(reopened.snapshot.threats.find(t=>t.id==='nest')!.phase).toBe('returning');
});
