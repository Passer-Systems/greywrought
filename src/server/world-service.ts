import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { Server, ServerWebSocket, WebSocketHandler } from 'bun';
import { createSharedAdventure } from '../game/adventure.js';
import type { AdventureAction, AdventureGame, CombatAction } from '../game/adventure-types.js';
import type { ServerWorldMessage, SharedChatMessage, WorldCommand } from '../game/multiplayer-types.js';
import { normalizedCharacterName } from '../host/character-profile.js';
import type { LocalCharacter } from '../host/character-profile.js';

const ACTIONS = [
  'forward', 'backward', 'left', 'right', 'jump', 'strike', 'disengage', 'brace',
  'bloodRage', 'jab', 'guard', 'gather', 'ritual', 'interact', 'buyPotion',
  'drinkPotion', 'rest', 'target', 'openTrade', 'closeTrade', 'acceptTrade',
  'closeShop', 'takeLoot', 'closeLoot', 'closeInn',
] as const satisfies readonly AdventureAction[];
const COMBAT_ACTIONS = ['strike', 'brace', 'disengage', 'bloodRage', 'jab', 'guard', 'drinkPotion'] as const satisfies readonly CombatAction[];
const MAX_PAYLOAD = 16 * 1024;
const MAX_PLAYERS = 32;

type RecordValue = Record<string, unknown>;
function record(value: unknown): value is RecordValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function keys(value: RecordValue, expected: readonly string[]): boolean {
  return Object.keys(value).length === expected.length && expected.every(key => Object.hasOwn(value, key));
}
function finite(value: unknown, minimum: number, maximum: number, integer = false): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum && (!integer || Number.isSafeInteger(value));
}
function member<T extends string>(value: unknown, choices: readonly T[]): value is T {
  return typeof value === 'string' && choices.some(choice => choice === value);
}
function identifier(value: unknown): value is string {
  return typeof value === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(value);
}
function character(value: unknown): value is LocalCharacter {
  return record(value) && keys(value, ['id', 'name', 'archetype', 'createdAtMillis']) && identifier(value.id)
    && typeof value.name === 'string' && normalizedCharacterName(value.name) === value.name
    && member(value.archetype, ['warrior', 'mage', 'hunter'])
    && finite(value.createdAtMillis, 0, Number.MAX_SAFE_INTEGER, true);
}
function command(value: unknown): value is WorldCommand {
  if (!record(value)) return false;
  switch (value.type) {
    case 'movement': return keys(value, ['type', 'frames']) && Array.isArray(value.frames) && value.frames.length > 0 && value.frames.length <= 30 && value.frames.every((frame, index, frames) => {
      if (!record(frame) || !keys(frame, ['sequence', 'seconds', 'input']) || !finite(frame.sequence, 1, Number.MAX_SAFE_INTEGER, true)
        || !finite(frame.seconds, Number.MIN_VALUE, 0.05) || !record(frame.input)) return false;
      const input = frame.input;
      return keys(input, ['forward', 'strafe', 'cameraX', 'cameraZ', 'jump']) && finite(input.forward, -1, 1, true) && finite(input.strafe, -1, 1, true)
        && finite(input.cameraX, -1, 1) && finite(input.cameraZ, -1, 1) && Math.abs(Math.hypot(input.cameraX, input.cameraZ) - 1) < 0.000001
        && typeof input.jump === 'boolean' && (index === 0 || frame.sequence > frames[index - 1].sequence);
    });
    case 'action': return keys(value, ['type', 'action', 'pressed']) && member(value.action, ACTIONS) && typeof value.pressed === 'boolean';
    case 'mouseForward': return keys(value, ['type', 'active']) && typeof value.active === 'boolean';
    case 'camera': return keys(value, ['type', 'x', 'z']) && finite(value.x, -1, 1) && finite(value.z, -1, 1) && Math.hypot(value.x, value.z) > 0.001;
    case 'target': case 'loot': return keys(value, ['type', 'id']) && identifier(value.id);
    case 'delay': case 'move': return keys(value, ['type', 'id', 'seconds']) && finite(value.id, 1, Number.MAX_SAFE_INTEGER, true) && finite(value.seconds, 0, 2, true);
    case 'replace': return keys(value, ['type', 'id', 'action']) && finite(value.id, 1, Number.MAX_SAFE_INTEGER, true) && member(value.action, COMBAT_ACTIONS);
    case 'remove': return keys(value, ['type', 'id']) && finite(value.id, 1, Number.MAX_SAFE_INTEGER, true);
    case 'clear': return keys(value, ['type']);
    case 'trade': return keys(value, ['type', 'kind', 'quantity']) && member(value.kind, ['supplies', 'potions']) && finite(value.quantity, 0, 100_000, true);
    case 'chat': return keys(value, ['type', 'text']) && typeof value.text === 'string' && value.text.trim().length > 0 && value.text.length <= 280 && !/[\u0000-\u001f\u007f]/.test(value.text);
    default: return false;
  }
}

interface Account { character: LocalCharacter; tokenHash: string; }
interface SavedService { version: 1; accounts: Account[]; world: string; chat: SharedChatMessage[]; nextChatId: number; }
export interface WorldSocketData {
  id: string | null;
  openedAt: number;
  lastSequence: number;
  commandsAt: number[];
  chatsAt: number[];
}
export interface WorldServiceOptions {
  savePath: string;
  allowedOrigins?: readonly string[];
  onPersistenceError?: (error: unknown) => void;
}

function decodeSave(source: string): SavedService {
  const value: unknown = JSON.parse(source);
  if (!record(value) || value.version !== 1 || !Array.isArray(value.accounts) || typeof value.world !== 'string'
    || !Array.isArray(value.chat) || value.chat.length > 100 || !finite(value.nextChatId, 1, Number.MAX_SAFE_INTEGER, true)) {
    throw new Error('Invalid shared world save');
  }
  const accounts: Account[] = [];
  const ids = new Set<string>();
  for (const account of value.accounts) {
    if (!record(account) || !character(account.character) || typeof account.tokenHash !== 'string' || !/^[a-f0-9]{64}$/.test(account.tokenHash) || ids.has(account.character.id)) throw new Error('Invalid shared world account');
    ids.add(account.character.id);
    accounts.push({ character: account.character, tokenHash: account.tokenHash });
  }
  const chat: SharedChatMessage[] = [];
  for (const entry of value.chat) {
    if (!record(entry) || !finite(entry.id, 1, value.nextChatId - 1, true) || typeof entry.name !== 'string'
      || normalizedCharacterName(entry.name) !== entry.name || typeof entry.text !== 'string'
      || !command({ type: 'chat', text: entry.text }) || (chat.at(-1)?.id ?? 0) >= entry.id
      || (entry.speakerId !== undefined && entry.speakerId !== null && (!identifier(entry.speakerId) || !ids.has(entry.speakerId)))) throw new Error('Invalid saved shared chat');
    chat.push({ id: entry.id, speakerId: typeof entry.speakerId === 'string' ? entry.speakerId : null, name: entry.name, text: entry.text });
  }
  return { version: 1, accounts, world: value.world, chat, nextChatId: value.nextChatId };
}

export async function createWorldService(options: WorldServiceOptions) {
  let saved: SavedService | undefined;
  try { saved = decodeSave(await readFile(options.savePath, 'utf8')); }
  catch (error) { if (!record(error) || error.code !== 'ENOENT') throw error; }
  const world = createSharedAdventure(saved ? { save: saved.world } : {});
  const accounts = new Map((saved?.accounts ?? []).map(account => [account.character.id, account]));
  const chat = saved?.chat ?? [];
  let nextChatId = saved?.nextChatId ?? 1;
  let serverTime = 0;
  const clients = new Set<ServerWebSocket<WorldSocketData>>();
  const online = new Map<string, ServerWebSocket<WorldSocketData>>();
  let closed = false;
  let saveQueue = Promise.resolve();
  const onPersistenceError = options.onPersistenceError ?? (() => console.error('Shared world could not be saved.'));

  function persist(): Promise<void> {
    const data: SavedService = { version: 1, accounts: [...accounts.values()], world: world.save(), chat: [...chat], nextChatId };
    const source = JSON.stringify(data);
    const next = saveQueue.catch(() => {}).then(async () => {
      await mkdir(dirname(options.savePath), { recursive: true, mode: 0o700 });
      const temporary = `${options.savePath}.tmp`;
      await writeFile(temporary, source, { mode: 0o600 });
      await rename(temporary, options.savePath);
    });
    saveQueue = next;
    return next;
  }
  function send(socket: ServerWebSocket<WorldSocketData>, message: ServerWorldMessage): void {
    socket.send(JSON.stringify(message));
  }
  function error(socket: ServerWebSocket<WorldSocketData>, text: string): void { send(socket, { type: 'error', text }); }
  function broadcast(): void {
    const players = world.players();
    const serverWallTimeMillis = Date.now();
    for (const [id, socket] of online) {
      const player = world.getPlayer(id);
      if (player) send(socket, { type: 'state', snapshot: player.snapshot, players: players.filter(other => other.id !== id), chat, serverTime, serverWallTimeMillis, movement: player.movementCheckpoint! });
    }
  }
  function disconnect(socket: ServerWebSocket<WorldSocketData>): void {
    clients.delete(socket);
    const id = socket.data.id;
    if (id === null || online.get(id) !== socket) return;
    const player = world.getPlayer(id);
    if (player) {
      for (const action of ACTIONS) player.setAction(action, false);
      player.setMouseForward(false);
    }
    world.leave(id);
    online.delete(id);
    socket.data.id = null;
    if (!closed) { void persist().catch(onPersistenceError); broadcast(); }
  }
  function join(socket: ServerWebSocket<WorldSocketData>, value: RecordValue): void {
    if (socket.data.id !== null || !keys(value, ['type', 'token', 'character']) || !character(value.character)
      || typeof value.token !== 'string' || !/^[a-zA-Z0-9_-]{32,128}$/.test(value.token)) {
      error(socket, 'Choose a valid character to enter the world.'); return;
    }
    const selected = value.character;
    const hash = new Bun.CryptoHasher('sha256').update(value.token).digest('hex');
    const existing = accounts.get(selected.id);
    if (existing && (existing.tokenHash !== hash || existing.character.name !== selected.name || existing.character.archetype !== selected.archetype)) {
      error(socket, 'This character belongs to another journey.'); return;
    }
    if (online.has(selected.id)) { error(socket, 'This character is already playing in another window.'); socket.close(4001, 'Character already playing'); return; }
    if (online.size >= MAX_PLAYERS) { error(socket, 'The world is full. Please try again shortly.'); socket.close(4002, 'World full'); return; }
    const account = existing ?? { character: selected, tokenHash: hash };
    world.join(selected.id, account.character.name, account.character.archetype).enableNetworkMovement?.(false);
    accounts.set(selected.id, account);
    socket.data.id = selected.id;
    online.set(selected.id, socket);
    void persist().catch(onPersistenceError);
    broadcast();
  }
  function apply(player: AdventureGame, value: WorldCommand, socket: ServerWebSocket<WorldSocketData>): boolean {
    switch (value.type) {
      case 'movement': return player.enqueueMovement!(value.frames);
      case 'action': player.setAction(value.action, value.pressed); break;
      case 'mouseForward': player.setMouseForward(value.active); break;
      case 'camera': player.setCameraForward(value.x, value.z); break;
      case 'target': player.selectTarget(value.id); break;
      case 'delay': player.setQueuedDelay(value.id, value.seconds); break;
      case 'move': player.moveQueuedAction(value.id, value.seconds); break;
      case 'replace': return player.replaceQueuedAction(value.id, value.action);
      case 'remove': player.removeQueuedAction(value.id); break;
      case 'clear': player.clearQueuedActions(); break;
      case 'loot': player.openLoot(value.id); break;
      case 'trade': player.setTradeOffer(value.kind, value.quantity); break;
      case 'chat': {
        const now = performance.now();
        socket.data.chatsAt = socket.data.chatsAt.filter(at => now - at < 1000);
        if (socket.data.chatsAt.length >= 3) { error(socket, 'Give others a moment to speak.'); return false; }
        socket.data.chatsAt.push(now);
        const account = accounts.get(socket.data.id!);
        if (!account) return false;
        chat.push({ id: nextChatId++, speakerId: account.character.id, name: account.character.name, text: value.text.trim() });
        if (chat.length > 100) chat.shift();
        broadcast();
        break;
      }
    }
    return true;
  }
  const websocket: WebSocketHandler<WorldSocketData> = {
    maxPayloadLength: MAX_PAYLOAD,
    idleTimeout: 30,
    sendPings: true,
    backpressureLimit: 1024 * 1024,
    closeOnBackpressureLimit: true,
    open(socket) { clients.add(socket); },
    message(socket, payload) {
      if (closed) return;
      if (typeof payload !== 'string' || new TextEncoder().encode(payload).byteLength > MAX_PAYLOAD) { error(socket, 'That message is too large.'); socket.close(1009, 'Message too large'); return; }
      let value: unknown;
      try { value = JSON.parse(payload); } catch { error(socket, 'That message could not be read.'); return; }
      if (!record(value)) { error(socket, 'That message could not be read.'); return; }
      if (value.type === 'join') { join(socket, value); return; }
      const sequence = value.sequence;
      if (value.type !== 'command' || !finite(sequence, 0, Number.MAX_SAFE_INTEGER, true)) { error(socket, 'That action could not be read.'); return; }
      const now = performance.now();
      socket.data.commandsAt = socket.data.commandsAt.filter(at => now - at < 1000);
      const player = socket.data.id === null ? undefined : world.getPlayer(socket.data.id);
      let accepted = false;
      if (player && keys(value, ['type', 'sequence', 'command']) && sequence > socket.data.lastSequence && command(value.command)) {
        const stopping = (value.command.type === 'action' && !value.command.pressed) || (value.command.type === 'mouseForward' && !value.command.active);
        if (stopping || socket.data.commandsAt.length < 120) {
          socket.data.lastSequence = sequence;
          if (!stopping) socket.data.commandsAt.push(now);
          accepted = apply(player, value.command, socket);
        }
      }
      send(socket, { type: 'result', sequence, accepted });
    },
    close(socket) { disconnect(socket); },
  };
  // Save newly assigned legacy regrowth deadlines even when nobody has joined yet.
  if (saved) await persist();
  let previousTick = performance.now();
  const tick = setInterval(() => {
    const now = performance.now();
    const elapsed = Math.min((now - previousTick) / 1000, 0.25);
    previousTick = now;
    world.advance(elapsed);
    if (online.size > 0) { serverTime += elapsed; broadcast(); }
    for (const socket of clients) if (socket.data.id === null && now - socket.data.openedAt > 10_000) socket.close(4003, 'Choose a character');
  }, 50);
  const saves = setInterval(() => { if (online.size > 0) void persist().catch(onPersistenceError); }, 5000);
  return {
    websocket,
    fetch(request: Request, server: Server<WorldSocketData>): Response | undefined {
      const url = new URL(request.url);
      if (url.pathname === '/health') return Response.json({ ready: !closed, players: online.size });
      if (url.pathname !== '/world') return undefined;
      if (closed) return new Response('The world is resting. Please return shortly.', { status: 503 });
      const origin = request.headers.get('origin');
      if (origin !== null && origin !== url.origin && !options.allowedOrigins?.includes(origin)) return new Response('Please enter from the game.', { status: 403 });
      if (clients.size >= MAX_PLAYERS * 2) return new Response('The world is busy. Please try again shortly.', { status: 503 });
      if (server.upgrade(request, { data: { id: null, openedAt: performance.now(), lastSequence: -1, commandsAt: [], chatsAt: [] } })) return undefined;
      return new Response('Enter the world through the game.', { status: 426 });
    },
    async close(): Promise<void> {
      if (closed) return saveQueue;
      closed = true;
      clearInterval(tick); clearInterval(saves);
      for (const socket of clients) { disconnect(socket); socket.close(1001, 'World restarting'); }
      await persist();
    },
  };
}
