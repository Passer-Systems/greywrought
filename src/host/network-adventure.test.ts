import { afterEach, beforeEach, expect, test } from 'bun:test';
import { createAdventure } from '../game/adventure.js';
import type { EncounterSession } from '../game/adventure-types.js';
import type { ClientWorldMessage, ServerWorldMessage } from '../game/multiplayer-types.js';
import { connectAdventure } from './network-adventure.js';

class TestSocket {
  static readonly OPEN = 1;
  static readonly instances: TestSocket[] = [];
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  readonly sent: ClientWorldMessage[] = [];
  constructor(_url: URL) { TestSocket.instances.push(this); }
  open() { this.readyState = 1; this.onopen?.(); }
  send(data: string) { this.sent.push(JSON.parse(data)); }
  receive(message: ServerWorldMessage) { this.onmessage?.({ data: JSON.stringify(message) }); }
  close() { if (this.readyState === 3) return; this.readyState = 3; this.onclose?.(); }
}
const descriptors = new Map<string, PropertyDescriptor | undefined>();
const timers = new Map<number, { at: number; callback: () => void }>();
let time = 0, nextTimer = 0;
function replace(name: string, value: unknown) {
  descriptors.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}
function advance(milliseconds: number) {
  const end = time + milliseconds;
  for (;;) {
    const next = [...timers].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
    if (!next) break;
    time = next[1].at; timers.delete(next[0]); next[1].callback();
  }
  time = end;
}
beforeEach(() => {
  time = 0; nextTimer = 0; timers.clear(); TestSocket.instances.length = 0;
  replace('WebSocket', TestSocket);
  replace('document', { querySelector: () => null });
  replace('location', { href: 'http://127.0.0.1/' });
  replace('localStorage', { getItem: () => 'test-session-token', setItem: () => {} });
  replace('setTimeout', (callback: () => void, ms: number) => { const id = ++nextTimer; timers.set(id, { at: time + ms, callback }); return id; });
  replace('clearTimeout', (id: number) => timers.delete(id));
});
afterEach(() => {
  for (const [name, descriptor] of descriptors) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else Reflect.deleteProperty(globalThis, name);
  }
  descriptors.clear(); timers.clear();
});
const character = { id: 'client-test', name: 'Tester', archetype: 'warrior' as const, createdAtMillis: 1 };
function state(mode: EncounterSession['mode']): Extract<ServerWorldMessage, { type: 'state' }> {
  const game = createAdventure();
  return { type: 'state', snapshot: game.snapshot, players: [], chat: [], serverTime: 1, serverWallTimeMillis: 1,
    movement: game.movementCheckpoint!, session: { id: mode === 'shared' ? 'shared' : 'private:test', mode, canRejoin: mode !== 'shared', origin: mode === 'shared' ? null : { x: 0, y: 0, z: -8 } } };
}
async function connected(mode: EncounterSession['mode'] = 'shared') {
  const ready = connectAdventure(character);
  const socket = TestSocket.instances[0]!;
  socket.open(); socket.receive(state(mode));
  return { game: await ready, socket };
}

test('dead socket messages cannot reactivate play before or after reconnect', async () => {
  const { game, socket } = await connected();
  const lateMessage = socket.onmessage!;
  const lateClose = socket.onclose!;
  socket.close();
  lateMessage({ data: JSON.stringify(state('shared')) });
  expect(game.online).toBe(false);
  expect(game.inputEnabled).toBe(false);
  advance(1000);
  const replacement = TestSocket.instances[1]!;
  replacement.open(); replacement.receive(state('paused'));
  lateMessage({ data: JSON.stringify(state('shared')) }); lateClose();
  expect(game.online).toBe(true);
  expect(game.session.mode).toBe('paused');
  expect(game.inputEnabled).toBe(false);
  advance(1000);
  expect(TestSocket.instances).toHaveLength(2);
  game.close();
  replacement.receive(state('private'));
  expect(game.online).toBe(false);
  expect(timers.size).toBe(0);
});

test('reconnect without an initial state expires and retries without auto-resuming', async () => {
  const { game, socket } = await connected();
  socket.close(); advance(1000);
  const stalled = TestSocket.instances[1]!; stalled.open();
  advance(15000);
  expect(stalled.readyState).toBe(3);
  expect(game.inputEnabled).toBe(false);
  advance(1000);
  const restored = TestSocket.instances[2]!; restored.open(); restored.receive(state('paused'));
  expect(game.online).toBe(true);
  expect(game.session.mode).toBe('paused');
  expect(restored.sent.some(message => message.type === 'command')).toBe(false);
  game.close();
  expect(timers.size).toBe(0);
});

test('silent open connection expires in foreground and blocks prediction until paused reconnect', async () => {
  const { game, socket } = await connected();
  advance(2999);
  expect(game.online).toBe(true);
  advance(1);
  expect(game.online).toBe(false);
  expect(game.inputEnabled).toBe(false);
  expect(socket.readyState).toBe(3);
  game.setAction('forward', true); game.advance(0.1);
  expect(socket.sent.filter(message => message.type === 'command' && message.command.type === 'movement')).toHaveLength(0);
  advance(1000);
  const replacement = TestSocket.instances[1]!;
  replacement.open(); replacement.receive(state('paused'));
  expect(game.online).toBe(true);
  expect(game.session.mode).toBe('paused');
  expect(game.pendingTransition).toBeNull();
  game.close();
});

test('initial connection deadline rejects and disposes every timer', async () => {
  const ready = connectAdventure(character);
  const outcome = ready.then(() => 'unexpected connection', (error: Error) => error.message);
  advance(15000);
  expect(await outcome).toBe('The world could not be reached.');
  expect(TestSocket.instances[0]!.readyState).toBe(3);
  expect(timers.size).toBe(0);
});

test('resume and rejoin reject duplicate actions and release the barrier only on acknowledgement', async () => {
  const { game, socket } = await connected('paused');
  game.resume(); game.resume();
  const resume = socket.sent.at(-1)!;
  expect(socket.sent.filter(message => message.type === 'command')).toHaveLength(1);
  expect(game.pendingTransition).toBe('resume');
  expect(game.inputEnabled).toBe(false);
  if (resume.type !== 'command') throw new Error('Expected resume command');
  socket.receive({ type: 'result', sequence: resume.sequence, accepted: false });
  expect(game.pendingTransition).toBeNull();
  game.resume(); socket.receive(state('private'));
  expect(game.inputEnabled).toBe(true);
  game.rejoin(); game.rejoin();
  const sent = socket.sent.length;
  game.advance(0.1); game.setAction('forward', true); game.setAction('strike', true);
  expect(socket.sent).toHaveLength(sent);
  expect(game.inputEnabled).toBe(false);
  socket.receive(state('shared'));
  expect(game.inputEnabled).toBe(true);
  expect(game.pendingTransition).toBeNull();
  game.setAction('forward', true); game.advance(0.1);
  expect(game.renderPlayer.position.z).toBeGreaterThan(-8);
  game.close();
});
