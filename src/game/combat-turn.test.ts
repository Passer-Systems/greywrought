import { expect, test } from 'bun:test';
import { createAdventure } from './adventure.js';
import { finishGathering, tap, finishCycle } from './yard-test-fixtures.js';
import { reachableCombatCells } from './combat-grid.js';

function setup() {
  const saved = JSON.parse(createAdventure({ archetype: 'warrior' }).save());
  Object.assign(saved.state, { phase: 'expedition', position: { x: -2.5, y: 0, z: 25 } });
  for (const enemy of saved.state.threats) if (enemy.active && enemy.id !== 'scout') Object.assign(enemy, { health: 0, phase: 'cleared', lootClaimed: true });
  const game = createAdventure({ save: JSON.stringify(saved) }); game.selectTarget('scout'); game.advance(.02); finishGathering(game);
  return game;
}

test('a turn reserves one Move and one replaceable action, with category timing', () => {
  const game = setup(); tap(game, 'strike'); tap(game, 'strike');
  expect(game.snapshot.combat.queued).toHaveLength(1);
  const cells = reachableCombatCells(game.snapshot.player.position, 2, game.snapshot.threats.filter(t => t.active && t.health > 0).map(t => t.position));
  expect(game.queueBait(cells[0]!)).toBe(true); expect(game.queueBait(cells[1]!)).toBe(true);
  expect(game.snapshot.combat.queued).toHaveLength(2);
  expect(game.snapshot.combat.reservedStamina).toBe(1);
  expect(game.setActionTiming('during')).toBe(false);
  tap(game, 'brace'); expect(game.setActionTiming('during')).toBe(true);
  expect(game.snapshot.combat.reservedStamina).toBe(3);
  tap(game, 'brace'); expect(game.snapshot.combat.queued.find(e => e.action === 'brace')!.timing).toBe('during');
  tap(game, 'strike'); expect(game.snapshot.combat.queued.find(e => e.action === 'strike')!.timing).toBe('after');
  const move = game.snapshot.combat.queued.find(e => e.action === 'bait')!; game.removeQueuedAction(move.id);
  expect(game.snapshot.combat.queued[0]!.offsetSeconds).toBe(0);
});

test('movement interpolates and Defend executes during its movement cooldown', () => {
  const game = setup(), start = game.snapshot.player.position;
  const end = reachableCombatCells(start, 2, game.snapshot.threats.filter(t => t.active && t.health > 0).map(t => t.position)).find(p => p.z === start.z && p.x !== start.x)!;
  game.queueBait(end); tap(game, 'brace'); game.setActionTiming('during');
  const reopened = createAdventure({ save: game.save() }); expect(reopened.snapshot.combat).toEqual(game.snapshot.combat);
  game.readyCombat(); game.advance(.34); expect(game.snapshot.player.position).toEqual(start);
  game.advance(.52); expect(game.snapshot.player.maneuver).toBe('bait');
  expect(game.snapshot.player.position).not.toEqual(start); expect(game.snapshot.player.position).not.toEqual(end);
  expect(game.snapshot.combat.queued.find(e => e.action === 'brace')!.status).toBe('executed');
  expect(game.snapshot.player.block).toBeGreaterThan(0);
  game.advance(.51); expect(game.snapshot.player.position.x).toBeCloseTo(end.x, 8); expect(game.snapshot.player.position.z).toBeCloseTo(end.z, 8);
  expect(game.setActionTiming('before')).toBe(false);
});

test('Attack order changes range and the forecast matches execution', () => {
  for (const timing of ['before', 'after'] as const) {
    const game = setup();
    const saved = JSON.parse(game.save()); saved.state.position = {x:-2.5,y:0,z:22.5};
    const play = createAdventure({ save:JSON.stringify(saved) });
    expect(play.queueBait({x:-2.5,y:0,z:27.5})).toBe(true); tap(play,'strike'); play.setActionTiming(timing);
    const forecast = play.snapshot.combat.forecast!;
    play.readyCombat(); finishCycle(play);
    expect(play.snapshot.threats.find(t=>t.id==='scout')!.health).toBe(forecast.outcomes.find(o=>o.id==='scout')!.health);
    expect(play.snapshot.threats.find(t=>t.id==='scout')!.health).toBe(timing==='before'?96:78);
  }
});

test('old plans retain one action and one movement and preserve character data', () => {
  const game=setup(); tap(game,'brace'); const old=JSON.parse(game.save());
  delete old.state.combat.queued[0].timing;
  old.state.combat.queued.push({...old.state.combat.queued[0],id:2,action:'strike',targetId:'scout',offsetSeconds:1,cost:0});
  old.state.combat.nextId=3; old.state.coins=43;
  const restored=createAdventure({save:JSON.stringify(old)});
  expect(restored.snapshot.coins).toBe(43); expect(restored.snapshot.combat.queued).toHaveLength(1);
  expect(restored.snapshot.combat.queued[0]!.action).toBe('brace');
  expect(createAdventure({save:restored.save()}).snapshot.combat).toEqual(restored.snapshot.combat);
});

test('changing an allowance clears readiness until every participant commits', async () => {
  const { createSharedAdventure } = await import('./adventure.js');
  const seed=createSharedAdventure(); seed.join('a','Ada','warrior'); seed.join('b','Bob','warrior');
  const saved=JSON.parse(seed.save());
  for(const [index,character] of saved.characters.entries()) Object.assign(character.state,{phase:'expedition',position:{x:-2.5+index*2.5,y:0,z:27.5}});
  const world=createSharedAdventure({save:JSON.stringify(saved)}), a=world.join('a','Ada','warrior'),b=world.join('b','Bob','warrior'); world.advance(.02); finishGathering(a, world);
  a.selectTarget('scout'); b.selectTarget('scout'); tap(a,'strike'); tap(b,'strike');
  expect(a.readyCombat()).toBe(true); expect(a.snapshot.combat.phase).toBe('preparation');
  tap(a,'brace'); expect(a.snapshot.combat.ready).toBe(false);
  expect(b.readyCombat()).toBe(true); expect(a.snapshot.combat.phase).toBe('preparation');
  a.readyCombat(); expect(a.snapshot.combat.phase).toBe('active');
  expect(a.setActionTiming('before')).toBe(false);
});

test('a destination committed at Ready stays reserved through enemy pursuit and the next turn', async () => {
  const { createSharedAdventure } = await import('./adventure.js');
  const seed=createSharedAdventure(); seed.join('p','Player','mage'); const save=JSON.parse(seed.save());
  Object.assign(save.characters[0].state,{phase:'expedition',position:{x:40,y:-4.723032069970846,z:-45}});
  for(const enemy of save.world.threats) {
    if(enemy.id==='cave-bat') Object.assign(enemy,{health:18,position:{x:45,y:-5,z:-47.5},patrolIndex:0});
    else if(enemy.active) Object.assign(enemy,{health:0,phase:'cleared',lootClaimed:true});
  }
  const world=createSharedAdventure({save:JSON.stringify(save)}),player=world.join('p','Player','mage'); world.advance(.02);
  expect(player.queueBait({x:42.5,y:-5,z:-45})).toBe(true); tap(player,'brace'); player.setActionTiming('during');
  const forecast=player.snapshot.combat.forecast!; player.readyCombat(); finishGathering(player, world); world.advance(1.4);
  expect(player.snapshot.player.position.x).toBeCloseTo(42.5,8);
  finishCycle(player,world); expect(player.snapshot.player.position).toEqual({x:42.5,y:-5,z:-45});
  expect(player.snapshot.player.health).toBe(forecast.outcomes.find(o=>o.id==='p')!.health);
});
