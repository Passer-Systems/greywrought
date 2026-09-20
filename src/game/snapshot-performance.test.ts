import { expect, spyOn, test } from 'bun:test';
import { createSharedAdventure } from './adventure.js';

function fixture() {
  const seed = createSharedAdventure({ now: () => 1000 });
  for (const id of ['a', 'b']) seed.join(id, id, 'mage');
  const saved = JSON.parse(seed.save());
  for (const entry of saved.characters) Object.assign(entry.state, { phase: 'expedition', position: { x: -3, y: 0, z: 28 } });
  const world = createSharedAdventure({ save: JSON.stringify(saved), now: () => 1000 });
  const a = world.join('a', 'a', 'mage'), b = world.join('b', 'b', 'mage');
  world.advance(.05);
  b.selectTarget("scout"); b.setAction("strike", true); b.setAction("strike", false);
  return { world, a, b };
}

test('remote player views match full snapshots without simulating forecasts', () => {
  const { world, a, b } = fixture();
  const clone = spyOn(globalThis, 'structuredClone');
  try {
    const before = world.save();
    const views = world.players('shared');
    expect(clone).not.toHaveBeenCalled();
    expect(views).toEqual([{ id: 'a', name: 'a', player: a.snapshot.player }, { id: 'b', name: 'b', player: b.snapshot.player }]);
    expect(world.save()).toBe(before);
  } finally { clone.mockRestore(); }
});

test('participants reuse an exact forecast with their own viewer id and no live-state mutation', () => {
  const { world, a, b } = fixture();
  const before = world.save();
  const first = a.snapshot.combat.forecast!;
  expect(first).not.toBeNull();
  const clone = spyOn(globalThis, 'structuredClone');
  try {
    expect(b.snapshot.combat.forecast).toEqual({ ...first, playerId: 'b' });
    expect(a.snapshot.combat.forecast).toEqual(first);
    expect(clone).not.toHaveBeenCalled();
    expect(world.save()).toBe(before);
  } finally { clone.mockRestore(); }
});

test('changed plans, camera and clock invalidate the shared forecast immediately', () => {
  const { world, a, b } = fixture();
  const initial = a.snapshot.combat.forecast!;
  a.setAction('brace', true); a.setAction('brace', false);
  const planned = a.snapshot.combat.forecast!;
  expect(planned.outcomes).not.toEqual(initial.outcomes);
  expect(b.snapshot.combat.forecast).toEqual({ ...planned, playerId: 'b' });
  const clone = spyOn(globalThis, 'structuredClone');
  try {
    b.setCameraForward(1, 0);
    a.snapshot;
    expect(clone).toHaveBeenCalled();
    clone.mockClear();
    world.advance(.05);
    a.snapshot;
    expect(clone).toHaveBeenCalled();
  } finally { clone.mockRestore(); }
  a.readyCombat(); b.readyCombat(); world.advance(5);
  for (const outcome of planned.outcomes) {
    const player = world.getPlayer(outcome.id);
    expect(player ? player.snapshot.player.health : a.snapshot.threats.find(t => t.id === outcome.id)!.health).toBe(outcome.health);
  }
});

test('private forecasts and player lists stay isolated after a participant leaves the shared encounter', () => {
  const { world, a, b } = fixture();
  a.snapshot;
  expect(world.pause('b')).toBe(true);
  expect(world.resume('b')).toBe(true);
  b.setAction('brace', true); b.setAction('brace', false);
  const privateForecast = b.snapshot.combat.forecast!;
  const sharedForecast = a.snapshot.combat.forecast!;
  expect(privateForecast).not.toBeNull();
  expect(sharedForecast).not.toBeNull();
  expect(privateForecast.outcomes.some(o => o.id === 'a')).toBe(false);
  expect(sharedForecast.outcomes.some(o => o.id === 'b')).toBe(false);
  expect(world.players('shared').map(p => p.id)).toEqual(['a']);
  expect(world.players(world.session('b').id).map(p => p.id)).toEqual(['b']);
  expect(b.snapshot.combat.forecast).toEqual(privateForecast);
});
