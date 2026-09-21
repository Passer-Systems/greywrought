import { terrainHeight } from "./cave-layout.js";
import { expect, test } from 'bun:test';
import { createAdventure } from './adventure.js';
import { tap } from './yard-test-fixtures.js';
function outside() {
  const save=JSON.parse(createAdventure().save());
  Object.assign(save.state,{phase:'expedition',position:{x:0,y:0,z:8},cargo:3,carriedSalvage:4});
  return createAdventure({save:JSON.stringify(save)});
}
test('Hearthstone completes after five seconds and uses ordinary return rewards',()=>{
  const game=outside(); tap(game,'hearthstone'); game.advance(2);
  const restored=createAdventure({save:game.save()}); restored.advance(2.99);
  expect(restored.snapshot.phase).toBe('expedition'); expect(restored.snapshot.cargo).toBe(3);
  restored.advance(.02); expect(restored.snapshot.phase).toBe('town');
  expect(restored.snapshot.player.position).toEqual({x: 0, y: terrainHeight(0, -8), z: -8}); expect(restored.snapshot.supplies).toBe(22);
  expect(restored.snapshot.cargo).toBe(0); tap(restored,'hearthstone'); expect(restored.snapshot.player.currentAction).toBe('hearthstone');
});
test('movement, another action and explicit cancel interrupt Hearthstone without securing loot',()=>{
  for(const action of ['forward','jump','brace','cancelHearthstone'] as const){
    const game=outside(); tap(game,'hearthstone'); game.advance(1); tap(game,action); game.advance(5);
    expect(game.snapshot.phase).toBe('expedition'); expect(game.snapshot.cargo).toBe(3);
    expect(game.snapshot.player.currentAction).not.toBe('hearthstone');
  }
});
