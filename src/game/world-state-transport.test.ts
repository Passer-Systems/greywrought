import { expect, test } from 'bun:test';
import { createAdventure } from './adventure.js';
import type { WorldStateMessage, ServerWorldMessage } from './multiplayer-types.js';
import { createWorldMessageDecoder } from './world-state-transport.js';
import { createWorldStateEncoder } from '../server/world-state-encoder.js';

function state(): WorldStateMessage {
  const game = createAdventure({ now: () => 1000 });
  return { type: 'state', snapshot: game.snapshot, players: [], chat: [], serverTime: 1, serverWallTimeMillis: 1000, rainIntensity: 0,
    movement: game.movementCheckpoint!, session: { id: 'shared', mode: 'shared', returnPlan: null, canRejoin: false, origin: null }, party: null, partyInvites: [] };
}
const wire = <T extends ServerWorldMessage>(message: T): T => JSON.parse(JSON.stringify(message));

test('threat patches round-trip exact public snapshots without mutating earlier states', () => {
  const encode = createWorldStateEncoder(), decode = createWorldMessageDecoder();
  const initial = state(), original = JSON.stringify(initial);
  expect(decode(wire(encode.encode(initial)))).toEqual(wire(initial));
  const threat = initial.snapshot.threats[0]!;
  const changed: WorldStateMessage = { ...initial, serverTime: 2, snapshot: { ...initial.snapshot,
    threats: [{ ...threat, health: 0, active: false, selected: true, targetPlayerId: null, position: { ...threat.position, x: 12 },
      fireballs: [{ id: 1, origin: threat.position, position: { ...threat.position, z: 10 }, remainingSeconds: .5, duration: 1, damage: 8 }] }, ...initial.snapshot.threats.slice(1)] } };
  const patch = encode.encode(changed);
  expect(patch.type).toBe('stateDelta');
  expect(JSON.stringify(patch).length).toBeLessThan(JSON.stringify(changed).length / 2);
  const decoded = decode(wire(patch));
  expect(decoded).toEqual(wire(changed));
  expect(JSON.stringify(initial)).toBe(original);
  const emptyArrays = { ...changed, snapshot: { ...changed.snapshot, threats: [{ ...changed.snapshot.threats[0]!, fireballs: [], inRangeActions: [] }, ...changed.snapshot.threats.slice(1)] } };
  expect(decode(wire(encode.encode(emptyArrays)))).toEqual(wire(emptyArrays));
  expect(decoded).toEqual(wire(changed));
  expect(decode(wire(encode.encode(emptyArrays)))).toEqual(wire(emptyArrays));
});

test('field removal, threat membership, encounter changes and dropped sends renew the baseline', () => {
  const encode = createWorldStateEncoder(), decode = createWorldMessageDecoder();
  const initial = state();
  decode(wire(encode.encode(initial)));
  const { targetPlayerId: _target, ...withoutTarget } = initial.snapshot.threats[0]!;
  const removed = { ...initial, snapshot: { ...initial.snapshot, threats: [withoutTarget, ...initial.snapshot.threats.slice(1)] } };
  expect(encode.encode(removed).type).toBe('state');
  for (const threats of [initial.snapshot.threats.slice(1), [...initial.snapshot.threats].reverse(), initial.snapshot.threats]) {
    const changed = { ...initial, snapshot: { ...initial.snapshot, threats } };
    const message = encode.encode(changed);
    expect(message.type).toBe('state');
    expect(decode(wire(message))).toEqual(wire(changed));
  }
  const privateState: WorldStateMessage = { ...initial, session: { ...initial.session, id: 'private:a', mode: 'private' } };
  expect(encode.encode(privateState).type).toBe('state');
  encode.reset();
  expect(encode.encode(privateState).type).toBe('state');
  const reconnect = createWorldMessageDecoder();
  expect(() => reconnect(wire(encode.encode(privateState)))).toThrow('baseline');
  encode.reset();
  expect(reconnect(wire(encode.encode(privateState)))).toEqual(wire(privateState));
});

test('public threat views exclude simulation internals while forecasts remain available', () => {
  const game = createAdventure({ now: () => 1000 });
  const snapshot = game.snapshot;
  const before = JSON.stringify(snapshot.threats);
  game.advance(1);
  expect(JSON.stringify(game.snapshot.threats)).not.toBe(before);
  expect(JSON.stringify(snapshot.threats)).toBe(before);
  for (const threat of snapshot.threats) {
    for (const field of ['rng', 'head', 'wolf', 'combatants', 'contributors', 'turnTarget', 'respawnAt']) expect(threat).not.toHaveProperty(field);
    expect(threat).toHaveProperty('currentAbility');
    expect(threat).toHaveProperty('forecast');
    expect(threat).toHaveProperty('targetPlayerId');
  }
});
