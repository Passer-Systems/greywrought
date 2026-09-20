import { expect, test } from 'bun:test';
import { createAdventure, createSharedAdventure, getMonsterLore } from './adventure.js';
import { caveBlockedPosition, terrainHeight } from './cave-layout.js';
import { finishCycle, tap } from './yard-test-fixtures.js';

function encounter(id: string) {
  const save=JSON.parse(createAdventure().save());
  const threat=save.state.threats.find((t: {id:string})=>t.id===id);
  Object.assign(save.state,{phase:'expedition',position:{x:threat.position.x-2,y:terrainHeight(threat.position.x-2,threat.position.z),z:threat.position.z},potions:5});
  const game=createAdventure({save:JSON.stringify(save)});game.advance(.01);game.selectTarget(id);return game;
}
test('Hollowdeep entrance and chamber passage are open, rock banks block shortcuts',()=>{
  for(let x=25;x<=81;x++) expect(caveBlockedPosition(x,-46)).toBe(false);
  expect(caveBlockedPosition(31,-53)).toBe(true);
  expect(caveBlockedPosition(55,-38)).toBe(true);
  expect(caveBlockedPosition(84,-46)).toBe(true);
});
test('old five-creature solo and shared saves retain progress and acquire cave creatures',()=>{
  const save=JSON.parse(createAdventure().save());save.state.supplies=37;save.state.potions=4;
  save.state.threats=save.state.threats.filter((t:{id:string})=>!t.id.startsWith('cave-'));
  const game=createAdventure({save:JSON.stringify(save)});
  expect(game.snapshot.supplies).toBe(37);expect(game.snapshot.potions).toBe(4);
  expect(game.snapshot.threats).toHaveLength(7);
  const world=createSharedAdventure();world.join('caver','Caver','warrior');
  const shared=JSON.parse(world.save());shared.world.threats=shared.world.threats.filter((t:{id:string})=>!t.id.startsWith('cave-'));
  const restored=createSharedAdventure({save:JSON.stringify(shared)});
  const player=restored.join('caver','Caver','warrior');
  expect(player.snapshot.threats).toHaveLength(7);expect(restored.pause('caver')).toBe(true);
  const fork=createSharedAdventure({save:restored.save()});
  expect(fork.join('caver','Caver','warrior').snapshot.threats).toHaveLength(7);
  expect(fork.session('caver').mode).toBe('paused');
});
test('bat and crab announce different timings and deal their forecast damage',()=>{
  for(const [id,ability,delay] of [['cave-bat','echo-bite',.3],['cave-crab','cavern-slam',1.1]] as const) {
    const game=encounter(id), threat=game.snapshot.threats.find(t=>t.id===id)!;
    expect(threat.currentAbility.id).toBe(ability);expect(threat.currentAbility.noticeSeconds).toBe(delay);
    expect(threat.aggro).toBe(true);expect(threat.maximumHealth).toBeGreaterThan(96);
    const expected=game.snapshot.combat.forecast!.outcomes.find(t=>t.id==='solo')!.health;
    game.readyCombat();finishCycle(game);
    expect(game.snapshot.player.health).toBe(expected);expect(expected).toBeLessThan(100);
    expect(getMonsterLore().find(t=>t.id===id)!.abilities[0]!.id).toBe(ability);
  }
});
test('cave rewards are collected once through normal corpse loot',()=>{
  for(const [id,quantity] of [['cave-bat',3],['cave-crab',6]] as const) {
    const save=JSON.parse(encounter(id).save());const threat=save.state.threats.find((t:{id:string})=>t.id===id);threat.health=1;
    const game=createAdventure({save:JSON.stringify(save)});tap(game,'strike');game.readyCombat();finishCycle(game);
    const loot=game.snapshot.loot.find(t=>t.sourceId===id)!;expect(loot.quantity).toBe(quantity);
    game.openLoot(id);tap(game,'takeLoot');expect(game.snapshot.carriedSalvage).toBe(quantity);
    game.openLoot(id);tap(game,'takeLoot');expect(game.snapshot.carriedSalvage).toBe(quantity);
  }
});
