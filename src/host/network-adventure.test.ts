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
  return { type: 'state', snapshot: game.snapshot, players: [], chat: [], party: null, partyInvites: [], serverTime: 1, serverWallTimeMillis: 1, rainIntensity: 0,
    movement: game.movementCheckpoint!, session: { id: mode === 'shared' ? 'shared' : 'private:test', mode, returnPlan: null, canRejoin: mode !== 'shared', origin: mode === 'shared' ? null : { x: 0, y: 0, z: -8 } } };
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

test('a brief closed transport reconnects in the same encounter without a pause or stale movement', async () => {
  const { game, socket } = await connected();
  game.setAction('forward', true);
  socket.close();
  expect(game.online).toBe(false);
  expect(game.reconnecting).toBe(true);
  expect(game.inputEnabled).toBe(false);
  expect(game.session.mode).toBe('shared');
  advance(1000);
  const replacement = TestSocket.instances[1]!;
  replacement.open(); replacement.receive(state('shared'));
  expect(game.reconnecting).toBe(false);
  expect(game.inputEnabled).toBe(true);
  game.advance(0.1);
  expect(game.renderPlayer.position).toEqual(game.snapshot.player.position);
  expect(replacement.sent.some(message => message.type === 'command' && message.command.type === 'pause')).toBe(false);
  game.close();
  expect(timers.size).toBe(0);
});

test('disconnect grace expires at five seconds even when reconnect has not completed', async () => {
  const { game, socket } = await connected();
  let notifications = 0;
  game.subscribe(() => notifications++);
  socket.close();
  advance(4999);
  expect(game.reconnecting).toBe(true);
  expect(game.online).toBe(false);
  expect(game.inputEnabled).toBe(false);
  const before = notifications;
  advance(1);
  expect(game.reconnecting).toBe(false);
  expect(notifications).toBe(before + 1);
  game.close();
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

test('Bait sends its selected ground point without predicting combat movement', async () => {
  const { game, socket } = await connected();
  const before = game.snapshot.player.position, destination = { x: 1, y: 0, z: 15 };
  expect(game.queueBait(destination)).toBe(true);
  expect(socket.sent.at(-1)).toMatchObject({ type: 'command', command: { type: 'bait', destination } });
  expect(game.snapshot.player.position).toEqual(before);
  game.close();
});

test('action timing sends only its named placement', async () => {
  const { game, socket } = await connected();
  expect(game.setActionTiming('during')).toBe(true);
  expect(socket.sent.at(-1)).toMatchObject({ type: 'command', command: { type: 'actionTiming', timing: 'during' } });
  game.close();
});

test('route submission awaits its actual receipt and forwards intermediate preview stops', async () => {
  const { game, socket } = await connected();
  const destination = { x: 0, y: 0, z: 25 }, via = [{ x: -2.5, y: 0, z: 25 }];
  let accepted: boolean | undefined;
  const submitted = game.submitBait(destination, via).then(value => { accepted = value; });
  const message = socket.sent.at(-1)!;
  expect(message).toMatchObject({ type: 'command', command: { type: 'bait', destination, via } });
  expect(accepted).toBeUndefined();
  if (message.type !== 'command') throw new Error('Missing movement command');
  socket.receive({ type: 'result', sequence: message.sequence, accepted: false });
  await submitted; expect(accepted).toBe(false);
  const next = game.submitBait(destination, via), receipt = socket.sent.at(-1)!;
  if (receipt.type !== 'command') throw new Error('Missing movement command');
  socket.receive({ type: 'result', sequence: receipt.sequence, accepted: true });
  expect(await next).toBe(true);
  const preview = game.previewBait(destination, via);
  const request = socket.sent.at(-1)!;
  expect(request).toMatchObject({ type: 'command', command: { type: 'previewBait', destination, via } });
  if (request.type !== 'command') throw new Error('Missing preview command');
  socket.receive({ type: 'movePreview', sequence: request.sequence, forecast: null });
  expect(await preview).toBeNull();
  const pending = game.submitBait(destination, via); socket.close();
  expect(await pending).toBe(false);
  expect(await game.submitBait(destination, via)).toBe(false);
  game.close();
});

test('closing the game settles a pending movement submission as rejected', async () => {
  const { game } = await connected();
  const pending = game.submitBait({ x: 0, y: 0, z: 25 });
  game.close();
  expect(await pending).toBe(false);
});

test('party state and invitations stay available while paused and social commands reach the server', async () => {
  const { game, socket } = await connected('paused');
  const update = state('paused');
  socket.receive({ ...update, party: { id: 'party', leaderId: character.id, members: [], pings: [] },
    partyInvites: [{ id: 'invite', inviterId: 'other', inviterName: 'Other', expiresAtMillis: 60000 }] });
  expect(game.party?.id).toBe('party');
  expect(game.partyInvites[0]!.id).toBe('invite');
  game.partyCommand({ type: 'partyDecline', inviteId: 'invite' });
  expect(socket.sent.at(-1)).toMatchObject({ type: 'command', command: { type: 'partyDecline', inviteId: 'invite' } });
  game.close();
});

test('follow cancels on manual movement and mouse movement, and toggles off', async () => {
  const { game, socket } = await connected();
  const initial = state('shared');
  const start = initial.snapshot.player.position;
  const friend = { id: 'friend', name: 'Friend', player: { ...initial.snapshot.player, position: { ...start, x: start.x + 10 } } };
  socket.receive({ ...initial, players: [friend] });
  game.followPlayer('friend'); game.advance(.1);
  expect(game.renderPlayer.position.x).toBeGreaterThan(start.x);
  game.setAction('jump', true); game.setAction('jump', false);
  const after = game.renderPlayer.position.x;
  game.advance(.1);
  expect(game.renderPlayer.position.x).toBeCloseTo(after, 6);
  game.followPlayer('friend'); game.setMouseForward(true); game.setMouseForward(false);
  game.advance(.1);
  expect(game.renderPlayer.position.x).toBeCloseTo(after, 6);
  game.followPlayer('friend'); game.followPlayer('friend'); game.advance(.1);
  expect(game.renderPlayer.position.x).toBeCloseTo(after, 6);
  expect(game.chat.at(-1)?.text).toBe('Stopped following.');
  game.close();
});

test('viewing blocks gameplay while return selection and confirmation stay available', async () => {
  const { game, socket } = await connected('private');
  game.rejoin();
  const message = state('viewing');
  const center = message.snapshot.player.position;
  const destination = { ...center, x: center.x + 2.5 };
  const returnPlan = { center, destination: center, remainingSeconds: 15, confirmed: false, spots: [{ position: center, dangerous: false }, { position: destination, dangerous: true }] };
  socket.receive({ ...message, session: { ...message.session, returnPlan } });
  expect(game.pendingTransition).toBeNull();
  expect(game.inputEnabled).toBe(false);
  const sent = socket.sent.length;
  game.setAction('forward', true); game.setAction('strike', true); game.setMouseForward(true); game.advance(.1);
  expect(socket.sent).toHaveLength(sent);
  expect(game.renderPlayer.position).toEqual(center);
  expect(game.selectReturnSpot(destination)).toBe(true);
  expect(socket.sent.at(-1)).toMatchObject({ type: 'command', command: { type: 'returnSpot', destination } });
  game.rejoin();
  expect(socket.sent.at(-1)).toMatchObject({ type: 'command', command: { type: 'rejoin' } });
  socket.receive({ ...message, session: { ...message.session, returnPlan: { ...returnPlan, destination, confirmed: true } } });
  expect(game.pendingTransition).toBeNull();
  expect(game.selectReturnSpot(center)).toBe(false);
  socket.receive(state('shared'));
  expect(game.inputEnabled).toBe(true);
  expect(game.renderPlayer.position).toEqual(center);
  game.setAction('forward', true); game.advance(.1);
  expect(game.renderPlayer.position.z).toBeGreaterThan(center.z);
  game.close();
});

test('autorun toggles forward motion, follows the camera, and stops on manual movement or combat', async () => {
  const { game, socket } = await connected();
  const start = game.renderPlayer.position;
  game.toggleAutorun(); game.advance(.1);
  expect(game.autorunning).toBe(true);
  expect(game.renderPlayer.position.z).toBeGreaterThan(start.z);
  game.setCameraForward(1,0); game.advance(.1);
  expect(game.renderPlayer.position.x).toBeGreaterThan(start.x);
  game.toggleAutorun();
  const stopped = game.renderPlayer.position;
  game.advance(.1);
  expect(game.renderPlayer.position).toEqual(stopped);
  game.toggleAutorun(); game.setAction('backward',true);
  expect(game.autorunning).toBe(false);
  game.setAction('backward',false); game.toggleAutorun();
  const combat = state('shared');
  socket.receive({ ...combat, snapshot: { ...combat.snapshot, player: { ...combat.snapshot.player, inCombat:true } } });
  expect(game.autorunning).toBe(false);
  game.toggleAutorun(); expect(game.autorunning).toBe(false);
  socket.receive(state('shared')); game.toggleAutorun();
  socket.close(); expect(game.autorunning).toBe(false);
  game.close();
});

test('Sprint forwards its explicit choice and is blocked while viewing', async () => {
  const {game,socket}=await connected();
  expect(game.setSprint(true)).toBe(true);
  expect(socket.sent.at(-1)).toMatchObject({command:{type:'sprint',active:true}});
  socket.receive(state('viewing'));
  const sent=socket.sent.length;
  expect(game.setSprint(false)).toBe(false);
  expect(socket.sent.length).toBe(sent);
  game.close();
});

test('regional rain intensity follows authoritative states without changing the world clock', async () => {
  const { game, socket } = await connected();
  const message = state('shared');
  socket.receive({ ...message, rainIntensity: .75 });
  expect(game.rainIntensity).toBe(.75);
  expect(game.serverWallTimeMillis).toBe(message.serverWallTimeMillis);
  socket.receive({ ...message, rainIntensity: 0 });
  expect(game.rainIntensity).toBe(0);
  game.close();
});
