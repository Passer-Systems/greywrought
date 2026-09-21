import { expect, test } from 'bun:test';
import { createAdventure, createSharedAdventure } from './adventure.js';
import { classAction, classKit } from './class-kit.js';
import { terrainHeight } from './cave-layout.js';
import type { CharacterArchetype } from '../host/character-profile.js';
import type { AdventureGame } from './adventure-types.js';
import { finishCycle, tap } from './yard-test-fixtures.js';

function fixture(archetype: CharacterArchetype = 'warrior', energy = 100, bee = false) {
  const saved = JSON.parse(createAdventure({ archetype }).save());
  Object.assign(saved.state, { phase: 'expedition', position: { x: -2.5, y: 0, z: 30 }, stamina: energy, energyCombatActive: true });
  saved.state.combat = { phase: 'preparation', cycle: 1, elapsedSeconds: 0, queued: [], nextId: 1, ready: false, sprinting: false };
  for (const threat of saved.state.threats) {
    if (!threat.active) continue;
    if (threat.id !== 'scout' && !(bee && threat.id === 'nest')) {
      Object.assign(threat, { health: 0, phase: 'cleared', aggro: false, lootClaimed: true }); continue;
    }
    Object.assign(threat, { position: { x: threat.id === 'scout' ? 0 : 2.5, y: 0, z: 30 }, aggro: true, phase: 'preparation', joinCycle: 1, windowCycle: 1, specialOffset: 1, remainingSeconds: 1, castDuration: 1 });
    if (threat.head) Object.assign(threat.head, { ability: 'kindle', opened: true, volley: 1, castVolley: 1 });
  }
  return saved;
}
function game(archetype: CharacterArchetype = 'warrior', energy = 100, bee = false) { return createAdventure({ save: JSON.stringify(fixture(archetype, energy, bee)) }); }
function executeAndCompare(game: AdventureGame) {
  const before = game.save(), forecast = game.snapshot.combat.forecast!;
  expect(game.save()).toBe(before);
  expect(createAdventure({ save: before }).snapshot.combat.forecast).toEqual(forecast);
  game.readyCombat(); finishCycle(game);
  for (const outcome of forecast.outcomes) expect(outcome.health).toBe(outcome.id === 'solo' ? game.snapshot.player.health : game.snapshot.threats.find(t => t.id === outcome.id)!.health);
  return forecast;
}

test('energy starts at 100 for a new encounter and stays unchanged during planning', () => {
  const saved = fixture('mage', 7); saved.state.energyCombatActive = false; saved.state.combat.phase = 'idle';
  for (const t of saved.state.threats) if (t.id === 'scout') Object.assign(t, { aggro: false, phase: 'patrol', joinCycle: 0, windowCycle: 0 });
  const g = createAdventure({ save: JSON.stringify(saved) }); g.advance(.05);
  expect(g.snapshot.player.stamina).toBe(100);
  const low = game('warrior', 0); low.advance(10);
  expect(low.snapshot.player.stamina).toBe(0);
  expect(low.snapshot.combat.phase).toBe('preparation');
});

test('zero-energy Attack, Defend and Move remain usable; each completed turn restores 20 capped at 100', () => {
  for (const action of ['strike', 'brace'] as const) {
    const g = game('warrior', 0);
    tap(g, action); expect(g.queueBait({ x: -5, y: 0, z: 30 })).toBe(true);
    expect(g.snapshot.combat.reservedStamina).toBe(0);
    executeAndCompare(g); expect(g.snapshot.player.stamina).toBe(20);
  }
  const g = game('warrior', 95); executeAndCompare(g); expect(g.snapshot.player.stamina).toBe(100);
});

test('Sprint doubles range and speed, reserves only a queued move and refunds cancellation', async () => {
  const g = game(), start = g.snapshot.player.position;
  expect(g.setSprint(true)).toBe(true);
  expect(g.snapshot.player.movementTiles).toBe(4); expect(g.snapshot.player.combatMovementSpeed).toBe(10);
  expect(g.snapshot.combat.reservedStamina).toBe(0); expect(g.snapshot.player.stamina).toBe(100);
  const end = { ...start, x: -10 };
  expect(await g.previewBait(end)).not.toBeNull(); expect(g.snapshot.combat.reservedStamina).toBe(0);
  expect(g.queueBait(end)).toBe(true); expect(g.snapshot.combat.reservedStamina).toBe(30);
  expect(g.setSprint(false)).toBe(false); expect(g.snapshot.report).toContain('Shorten or clear');
  g.removeQueuedAction(g.snapshot.combat.queued[0]!.id); expect(g.snapshot.combat.reservedStamina).toBe(0);
  expect(g.queueBait({ ...start, x: -5 })).toBe(true);
  expect(g.setSprint(false)).toBe(true); expect(g.snapshot.combat.reservedStamina).toBe(0);
  expect(g.setSprint(true)).toBe(true);
  tap(g, 'special'); expect(g.snapshot.combat.queued).toHaveLength(2); expect(g.snapshot.combat.availableStamina).toBe(30);
  g.setActionTiming('before');
  const forecast = g.snapshot.combat.forecast!; g.readyCombat(); g.advance(.6);
  expect(g.snapshot.player.position.x).toBeCloseTo(-5, 6); expect(g.snapshot.player.stamina).toBe(30);
  const reopened = createAdventure({ save: g.save() }); finishCycle(reopened);
  expect(reopened.snapshot.player.stamina).toBe(50); expect(reopened.snapshot.combat.sprinting).toBe(false);
  expect(reopened.snapshot.threats[0]!.health).toBe(forecast.outcomes.find(o => o.id === 'scout')!.health);
});

test('Sprint plus skill cannot overcommit energy; replacing or clearing a skill releases its reservation', () => {
  const g = game('warrior', 60); tap(g, 'special');
  expect(g.setSprint(true)).toBe(false); expect(g.snapshot.combat.reservedStamina).toBe(40);
  tap(g, 'brace'); expect(g.snapshot.combat.reservedStamina).toBe(0);
  expect(g.setSprint(true)).toBe(true); expect(g.queueBait({ x: -5, y: 0, z: 30 })).toBe(true);
  tap(g, 'special'); expect(g.snapshot.combat.queued.some(e => e.action === 'special')).toBe(false);
  g.clearQueuedActions(); expect(g.snapshot.combat.reservedStamina).toBe(0); expect(g.snapshot.player.stamina).toBe(60);
});

for (const archetype of ['warrior', 'hunter', 'mage', 'alchemist', 'artificer'] as const) {
  test(`${archetype} skill costs 40, occupies one action, persists, and forecast equals execution`, () => {
    const g = game(archetype), spec = classAction(archetype, 'special');
    expect(classKit(archetype).abilities.special).toEqual(spec);
    tap(g, 'strike'); tap(g, 'special'); expect(g.snapshot.combat.queued).toHaveLength(1);
    expect(g.snapshot.combat.reservedStamina).toBe(40); expect(g.snapshot.player.stamina).toBe(100);
    const forecast = executeAndCompare(g);
    expect(forecast.actions[0]!.result).toBe('executed');
    expect(forecast.events.find(e => e.kind === 'hit' && e.sourceId === 'solo')!.damage).toBe(spec.damage!);
    expect(g.snapshot.player.stamina).toBe(80);
    expect(g.snapshot.combat.effects.some(e => e.kind !== 'ignition')).toBe(true);
    expect(g.snapshot.combat.queued).toHaveLength(0);
  });
}

test('self skills hit engaged enemies within their radius without needing a selected target', () => {
  for (const archetype of ['warrior', 'mage'] as const) {
    const g = game(archetype, 100, true); g.selectTarget('warder'); tap(g, 'special');
    g.readyCombat();
    expect(g.snapshot.threats.find(t => t.id === 'scout')!.health).toBe(96 - classAction(archetype, 'special').damage!);
    expect(g.snapshot.threats.find(t => t.id === 'nest')!.health).toBe(72 - classAction(archetype, 'special').damage!);
  }
});

test('Piercing Arrow passes through its target in a narrow line and leaves unengaged enemies unharmed', () => {
  const saved = fixture('hunter', 100, true); saved.state.threats.find((t: { id: string }) => t.id === 'nest').position.x = 5;
  const g = createAdventure({ save: JSON.stringify(saved) }); tap(g, 'special'); g.readyCombat();
  expect(g.snapshot.threats.find(t => t.id === 'scout')!.health).toBe(64);
  expect(g.snapshot.threats.find(t => t.id === 'nest')!.health).toBe(40);
  const miss = fixture('hunter', 100, true); miss.state.threats.find((t: { id: string }) => t.id === 'nest').position.z = 32.5;
  const offLine = createAdventure({ save: JSON.stringify(miss) }); tap(offLine, 'special'); offLine.readyCombat();
  expect(offLine.snapshot.threats.find(t => t.id === 'nest')!.health).toBe(72);
  miss.state.threats.find((t: { id: string }) => t.id === 'nest').aggro = false;
  miss.state.threats.find((t: { id: string }) => t.id === 'nest').phase = 'patrol';
  miss.state.threats.find((t: { id: string }) => t.id === 'nest').position.z = 30;
  const neutral = createAdventure({ save: JSON.stringify(miss) }); tap(neutral, 'special'); neutral.readyCombat();
  expect(neutral.snapshot.threats.find(t => t.id === 'nest')!.health).toBe(72);
});

test('Piercing Arrow stops at solid cover and cannot hit an enemy on its far side', () => {
  const saved = fixture('hunter', 100, true);
  saved.state.position = { x: 0, y: terrainHeight(0, 40), z: 40 };
  saved.state.threats[0].position = { x: 1, y: terrainHeight(1, 40), z: 40 };
  const rear = saved.state.threats.find((t: { id: string }) => t.id === 'warder');
  Object.assign(rear, { position: { x: 15, y: terrainHeight(15, 40), z: 40 }, health: 72, lootClaimed: false, aggro: true, phase: 'preparation', joinCycle: 1, windowCycle: 1 });
  const g = createAdventure({ save: JSON.stringify(saved) }); tap(g, 'special'); g.readyCombat();
  expect(g.snapshot.threats[0]!.health).toBe(64);
  expect(g.snapshot.threats.find(t => t.id === 'warder')!.health).toBe(72);
  expect(g.snapshot.combat.effects[0]!.destination!.x).toBeLessThanOrEqual(2.01);
});

test('Frost Nova halves pursuit immediately and expires at the next turn, including through save', () => {
  const slowed = game('mage', 100, true), ordinary = game('mage', 100, true);
  tap(slowed, 'special'); slowed.readyCombat(); ordinary.readyCombat();
  expect(slowed.snapshot.threats.find(t => t.id === 'nest')!.slowed).toBe(true);
  const saved = createAdventure({ save: slowed.save() });
  saved.advance(.1); ordinary.advance(.1);
  const moved = (g: AdventureGame) => 2.5 - g.snapshot.threats.find(t => t.id === 'nest')!.position.x;
  expect(moved(saved)).toBeCloseTo(moved(ordinary) / 2, 6);
  finishCycle(saved); expect(saved.snapshot.threats.find(t => t.id === 'nest')!.slowed).toBe(false);
});

test('Volatile Flask splashes and coats engaged enemies; existing residue ignites', () => {
  const g = game('alchemist', 100, true); tap(g, 'special'); g.readyCombat();
  expect(g.snapshot.threats.find(t => t.id === 'scout')!.health).toBe(72);
  expect(g.snapshot.threats.find(t => t.id === 'nest')!.health).toBe(48);
  expect(g.snapshot.threats.filter(t => t.volatileResidue).map(t => t.id)).toEqual(['scout', 'nest']);
  expect(g.snapshot.combat.effects[0]!.position.x).toBe(0);
  const saved = fixture('alchemist'); saved.state.threats[0].volatileResidue = true;
  const primed = createAdventure({ save: JSON.stringify(saved) }); tap(primed, 'special');
  const forecast = executeAndCompare(primed);
  expect(forecast.events.some(e => e.kind === 'ignition')).toBe(true);
});

test('Disruptor Shot cancels the committed attack for this turn and skills are combat-only', () => {
  const g = game('artificer'); tap(g, 'special'); g.readyCombat();
  expect(g.snapshot.threats[0]!.staggered).toBe(true); expect(g.snapshot.threats[0]!.windowAction!.status).toBe('cancelled');
  finishCycle(g); expect(g.snapshot.threats[0]!.staggered).toBe(false); expect(g.snapshot.threats[0]!.windowAction!.status).toBe('pending');
  const town = createAdventure({ archetype: 'mage' }); tap(town, 'special');
  expect(town.snapshot.player.stamina).toBe(100); expect(town.snapshot.combat.queued).toEqual([]);
});

test('mobile skills preserve the route while stationary skills stop to fire, and failed shots spend no energy', () => {
  for (const archetype of ['warrior', 'hunter'] as const) {
    const g = game(archetype);
    expect(g.queueBait({ x: -2.5, y: 0, z: 35 })).toBe(true); tap(g, 'special'); g.setActionTiming('during');
    const forecast = executeAndCompare(g);
    expect(forecast.actions.find(a => a.action === 'special')!.result).toBe('executed');
    expect(g.snapshot.player.position.z).toBe(archetype === 'warrior' ? 35 : 30);
  }
  const saved = fixture('artificer'); saved.state.threats[0].position = { x: 10, y: terrainHeight(10, 30), z: 30 };
  const g = createAdventure({ save: JSON.stringify(saved) }); tap(g, 'special');
  g.readyCombat(); expect(g.snapshot.combat.queued[0]!.status).toBe('failed'); expect(g.snapshot.player.stamina).toBe(100);
});

test('legacy saves migrate their energy once and new saves preserve low energy', () => {
  const saved = fixture('mage', 2); saved.version = 11; delete saved.state.energyCombatActive;
  const g = createAdventure({ save: JSON.stringify(saved) }); expect(g.snapshot.player.stamina).toBe(40);
  g.advance(2); expect(g.snapshot.player.stamina).toBe(40);
  const reopened = createAdventure({ save: g.save() }); expect(reopened.snapshot.player.stamina).toBe(40);
  expect(JSON.parse(reopened.save()).version).toBe(12);
});

test('shared pause, save and resume preserve spent energy without granting a new combat refill', () => {
  const seed = createSharedAdventure(); seed.join('a', 'Ada', 'mage');
  const saved = JSON.parse(seed.save()), state = fixture('mage', 35).state;
  saved.world.threats = state.threats; saved.clock = state.combat;
  for (const t of saved.world.threats) if (t.aggro) { t.combatants = ['a']; t.targetPlayerId = 'a'; }
  Object.assign(saved.characters[0].state, { ...state, combat: state.combat }); delete saved.characters[0].state.threats;
  const world = createSharedAdventure({ save: JSON.stringify(saved) }), p = world.join('a', 'Ada', 'mage');
  expect(world.pause('a')).toBe(true); expect(p.snapshot.player.stamina).toBe(35);
  const restored = createSharedAdventure({ save: world.save() }), q = restored.join('a', 'Ada', 'mage');
  expect(q.snapshot.player.stamina).toBe(35); expect(restored.resume('a')).toBe(true); restored.advance(2);
  expect(q.snapshot.player.stamina).toBe(35); tap(q, 'brace'); q.readyCombat(); finishCycle(q, restored);
  expect(q.snapshot.player.stamina).toBe(55);
});
