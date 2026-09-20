import { expect, test } from 'bun:test';
import { createAdventure, createSharedAdventure, getMonsterLore } from './adventure.js';
import { caveBlockedPosition, terrainHeight } from './cave-layout.js';
import { finishGathering, finishCycle, travel, tap } from './yard-test-fixtures.js';

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
    travel(game,loot.position.x,loot.position.z); game.openLoot(id);tap(game,'takeLoot');expect(game.snapshot.carriedSalvage).toBe(quantity);
    game.openLoot(id);tap(game,'takeLoot');expect(game.snapshot.carriedSalvage).toBe(quantity);
  }
});
test('Ironback cache opens once after crab defeat and persists without private rewards',()=>{
  const save=JSON.parse(createAdventure().save());
  const crab=save.state.threats.find((t:{id:string})=>t.id==='cave-crab');
  Object.assign(save.state,{phase:'expedition',position:{x:82,y:terrainHeight(82,-52),z:-52},potions:0});
  Object.assign(crab,{health:0,phase:'cleared',active:true,lootClaimed:true,respawnAt:null});
  const game=createAdventure({save:JSON.stringify(save)});
  expect(game.snapshot.loot.find(t=>t.sourceId==='ironback-chest')?.available).toBe(true);
  game.openLoot('ironback-chest');tap(game,'takeLoot');expect(game.snapshot.coins).toBe(0);
  const chest=game.snapshot.loot.find(t=>t.sourceId==='ironback-chest')!;
  travel(game,chest.position.x,chest.position.z);
  game.openLoot('ironback-chest');tap(game,'takeLoot');
  expect(game.snapshot.coins).toBe(18);expect(game.snapshot.potions).toBe(2);
  expect(game.snapshot.loot.find(t=>t.sourceId==='ironback-chest')?.available).toBe(false);
  const restored=createAdventure({save:game.save()});expect(restored.snapshot.coins).toBe(18);expect(restored.snapshot.potions).toBe(2);
});

test('old full-health Ironbacks adopt current health in solo, shared and private saves', () => {
  const solo = JSON.parse(createAdventure().save());
  const crab = solo.state.threats.find((threat: { id: string }) => threat.id === 'cave-crab');
  delete crab.maximumHealth; crab.health = 156;
  const restoredSolo = createAdventure({ save: JSON.stringify(solo) });
  expect(restoredSolo.snapshot.threats.find(threat => threat.id === 'cave-crab')).toMatchObject({ health: 624, maximumHealth: 624 });
  expect(JSON.parse(restoredSolo.save()).state.threats.find((threat: { id: string }) => threat.id === 'cave-crab').maximumHealth).toBe(624);
  const seed = createSharedAdventure({ now: () => 1000 });
  seed.join('miner', 'Miner', 'warrior'); seed.pause('miner');
  const shared = JSON.parse(seed.save());
  for (const world of [shared.world, shared.instances[0].world]) {
    const crab = world.threats.find((threat: { id: string }) => threat.id === 'cave-crab');
    delete crab.maximumHealth; crab.health = 156;
  }
  const restored = createSharedAdventure({ save: JSON.stringify(shared), now: () => 1000 });
  const miner = restored.join('miner', 'Miner', 'warrior');
  expect(miner.snapshot.threats.find(threat => threat.id === 'cave-crab')!.health).toBe(624);
  expect(restored.session('miner').mode).toBe('paused');
  const observer = restored.join('observer', 'Observer', 'mage');
  expect(observer.snapshot.threats.find(threat => threat.id === 'cave-crab')!.health).toBe(624);
});

test('health migration preserves injured creatures, committed fights and defeated Ironbacks', () => {
  for (const mode of ['injured', 'fighting', 'defeated', 'current-damage'] as const) {
    const save = JSON.parse(createAdventure().save());
    const crab = save.state.threats.find((threat: { id: string }) => threat.id === 'cave-crab');
    if (mode !== 'current-damage') delete crab.maximumHealth;
    crab.health = mode === 'injured' ? 78 : mode === 'defeated' ? 0 : 156;
    if (mode === 'fighting') Object.assign(crab, { aggro: true, phase: 'preparation', combatants: ['solo'], contributors: ['solo'], targetPlayerId: 'solo', castDuration: 1, remainingSeconds: 1 });
    if (mode === 'defeated') Object.assign(crab, { phase: 'cleared', respawnAt: 121000 });
    const game = createAdventure({ save: JSON.stringify(save), now: () => 1000 });
    expect(game.snapshot.threats.find(threat => threat.id === 'cave-crab')!.health).toBe(crab.health);
    expect(createAdventure({ save: game.save(), now: () => 1000 }).snapshot.threats.find(threat => threat.id === 'cave-crab')!.health).toBe(crab.health);
  }
});

test('saved spawn maxima allow other untouched creatures to adopt a balance change', () => {
  const save = JSON.parse(createAdventure().save());
  const bat = save.state.threats.find((threat: { id: string }) => threat.id === 'cave-bat');
  bat.health = 90; bat.maximumHealth = 90;
  expect(createAdventure({ save: JSON.stringify(save) }).snapshot.threats.find(threat => threat.id === 'cave-bat')!.health).toBe(108);
});

test('Ironback slams hit harder while retaining their warning and a safe retreat', () => {
  const standing = encounter('cave-crab');
  const slam = standing.snapshot.threats.find(threat => threat.id === 'cave-crab')!.currentAbility;
  expect(getMonsterLore().find(threat => threat.id === 'cave-crab')!.abilities[0]!.damage).toBe(52);
  expect(slam).toMatchObject({ range: 4.5, noticeSeconds: 1.1 });
  expect(slam.damage).toBeGreaterThanOrEqual(52);
  const expected = standing.snapshot.combat.forecast!.outcomes.find(outcome => outcome.id === 'solo')!.health;
  expect(expected).toBe(100 - slam.damage);
  standing.readyCombat(); finishCycle(standing);
  expect(standing.snapshot.player.health).toBe(expected);
  const retreat = encounter('cave-crab');
  expect(retreat.queueBait({ x: 65, y: terrainHeight(65, -42.5), z: -42.5 })).toBe(true);
  const retreatHealth = retreat.snapshot.combat.forecast!.outcomes.find(outcome => outcome.id === 'solo')!.health;
  expect(retreatHealth).toBe(100);
  retreat.readyCombat(); finishCycle(retreat);
  expect(retreat.snapshot.player.health).toBe(retreatHealth);
});

test('Ironback closes ground at its faster pursuit pace before the slam warning', () => {
  const save = JSON.parse(createAdventure().save());
  Object.assign(save.state, { phase: 'expedition', position: { x: 62.5, y: terrainHeight(62.5, -47.5), z: -47.5 } });
  const crab = save.state.threats.find((threat: { id: string }) => threat.id === 'cave-crab');
  Object.assign(crab, { position: { x: 70, y: terrainHeight(70, -47.5), z: -47.5 } });
  const game = createAdventure({ save: JSON.stringify(save) }); game.advance(.01);
  const before = game.snapshot.threats.find(threat => threat.id === 'cave-crab')!;
  expect(before.aggro).toBe(true);
  finishGathering(game); game.readyCombat(); game.advance(.5);
  const after = game.snapshot.threats.find(threat => threat.id === 'cave-crab')!;
  expect(Math.hypot(before.position.x - after.position.x, before.position.z - after.position.z)).toBeCloseTo(2.1, 5);
  expect(after.phase).toBe('preparation');
  expect(game.snapshot.player.health).toBe(100);
});

function sharedChestSave() {
  const seed = createSharedAdventure({ now: () => 1000 });
  seed.join('alice', 'Alice', 'warrior'); seed.join('bob', 'Bob', 'mage');
  const saved = JSON.parse(seed.save());
  for (const character of saved.characters) Object.assign(character.state, { phase: 'expedition', position: { x: 78, y: terrainHeight(78, -52), z: -52 } });
  Object.assign(saved.world.threats.find((threat: { id: string }) => threat.id === 'cave-crab'), { health: 0, phase: 'cleared', respawnAt: 121000 });
  return saved;
}

test('the shared Ironback chest has one winner, stays empty through respawn and restart, and denies private loot', () => {
  let now = 1000;
  const world = createSharedAdventure({ save: JSON.stringify(sharedChestSave()), now: () => now });
  const alice = world.join('alice', 'Alice', 'warrior'), bob = world.join('bob', 'Bob', 'mage');
  expect(world.pause('bob')).toBe(true); expect(world.resume('bob')).toBe(true);
  bob.openLoot('ironback-chest'); tap(bob, 'takeLoot');
  expect(bob.snapshot.coins).toBe(0); expect(bob.snapshot.potions).toBe(0);
  expect(world.rejoin('bob')).toBe(true);
  alice.openLoot('ironback-chest'); bob.openLoot('ironback-chest');
  tap(alice, 'takeLoot'); tap(bob, 'takeLoot');
  expect(alice.snapshot.coins).toBe(18); expect(alice.snapshot.potions).toBe(2);
  expect(bob.snapshot.coins).toBe(0); expect(bob.snapshot.potions).toBe(0);
  expect(bob.snapshot.loot.find(loot => loot.sourceId === 'ironback-chest')?.available).toBe(false);
  const saved = JSON.parse(world.save());
  expect(saved.world.chestClaimed).toBe(true);
  expect(saved.characters.every((character: { state: Record<string, unknown> }) => !Object.hasOwn(character.state, 'chestClaimed'))).toBe(true);
  const restored = createSharedAdventure({ save: JSON.stringify(saved), now: () => now });
  const returned = restored.join('bob', 'Bob', 'mage'); returned.openLoot('ironback-chest'); tap(returned, 'takeLoot');
  expect(returned.snapshot.coins).toBe(0);
  expect(restored.join('alice', 'Alice', 'warrior').snapshot.coins).toBe(18);
  now = 121000;
  const regrown = JSON.parse(restored.save());
  expect(regrown.world.threats.find((threat: { id: string }) => threat.id === 'cave-crab').health).toBe(624);
  expect(regrown.world.chestClaimed).toBe(true);
  Object.assign(regrown.world.threats.find((threat: { id: string }) => threat.id === 'cave-crab'), { health: 0, phase: 'cleared', respawnAt: 241000 });
  const later = createSharedAdventure({ save: JSON.stringify(regrown), now: () => now });
  expect(later.join('bob', 'Bob', 'mage').snapshot.loot.find(loot => loot.sourceId === 'ironback-chest')?.available).toBe(false);
});

test('a legacy claim by an offline or private character consumes the shared chest without changing their loot', () => {
  const seed = createSharedAdventure({ save: JSON.stringify(sharedChestSave()), now: () => 1000 });
  seed.join('alice', 'Alice', 'warrior'); seed.join('bob', 'Bob', 'mage'); seed.pause('alice');
  const saved = JSON.parse(seed.save()); delete saved.world.chestClaimed;
  for (const instance of saved.instances) delete instance.world.chestClaimed;
  Object.assign(saved.characters[0].state, { chestClaimed: true, coins: 18, potions: 2 });
  saved.characters[1].state.chestClaimed = false;
  const restored = createSharedAdventure({ save: JSON.stringify(saved), now: () => 1000 });
  const bob = restored.join('bob', 'Bob', 'mage');
  expect(bob.snapshot.loot.find(loot => loot.sourceId === 'ironback-chest')?.available).toBe(false);
  bob.openLoot('ironback-chest'); tap(bob, 'takeLoot'); expect(bob.snapshot.coins).toBe(0);
  const alice = restored.join('alice', 'Alice', 'warrior');
  expect(alice.snapshot.coins).toBe(18); expect(alice.snapshot.potions).toBe(2);
  expect(restored.rejoin('alice')).toBe(true);
  expect(alice.snapshot.loot.find(loot => loot.sourceId === 'ironback-chest')?.available).toBe(false);
  expect(JSON.parse(restored.save()).world.chestClaimed).toBe(true);
});
