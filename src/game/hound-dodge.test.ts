import {test,expect} from 'bun:test';
import {createAdventure} from './adventure.js';
import {tap} from './yard-test-fixtures.js';

test('Maul can be dodged on foot after its landing locks, with time to react',()=>{
 const saved=JSON.parse(createAdventure({archetype:'mage'}).save());
 saved.state.phase='expedition';saved.state.position={x:-6,y:0,z:17};
 for(const t of saved.state.threats)if(t.active&&t.id!=='patrol'){t.health=0;t.phase='cleared';t.lootClaimed=true;}
 const game=createAdventure({archetype:'mage',save:JSON.stringify(saved)});
 game.selectTarget('patrol');tap(game,'strike');game.advance(.01);game.advance(1);
 const hound=()=>game.snapshot.threats.find(t=>t.id==='patrol')!;
 expect(hound().movementMode).toBe('lunge');
 const landing={...hound().targetPosition};
 const standing=createAdventure({archetype:'mage',save:game.save()});standing.advance(.66);
 expect(standing.snapshot.player.health).toBeLessThan(100);
 game.advance(.15);
 game.setCameraForward(1,0);game.setAction('forward',true);game.advance(.51);game.setAction('forward',false);
 expect(hound().targetPosition).toEqual(landing);
 expect(hound().lastActionHit).toBe(false);
 expect(game.snapshot.player.health).toBe(100);
 expect(hound().phase).toBe('recovery');
 const before=hound().health;
 tap(game,'strike');game.advance(.4);
 expect(hound().phase).toBe('recovery');
 expect(hound().health).toBeLessThan(before);
 expect(game.snapshot.player.health).toBe(100);
});
