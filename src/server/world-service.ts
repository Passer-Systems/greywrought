import { NPC_IDS, VENDORS } from "../game/economy.js";
import { isGearItem } from "../game/yard-content.js";
import { EMOTE_HELP, emoteText, findEmote } from '../game/emotes.js';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomInt } from 'node:crypto';
import type { Server, ServerWebSocket, WebSocketHandler } from 'bun';
import { createSharedAdventure } from '../game/adventure.js';
import { WORLD_BOUNDS } from '../game/world-layout.js';
import type { AdventureAction, AdventureGame } from '../game/adventure-types.js';
import type { PartyCommand, PartyView, PartyInviteView, ServerWorldMessage, SharedChatMessage, WorldCommand } from '../game/multiplayer-types.js';
import { normalizedCharacterName } from '../host/character-profile.js';
import type { LocalCharacter } from '../host/character-profile.js';

const ACTIONS = [
  'forward', 'backward', 'left', 'right', 'jump', 'strike', 'brace', 'bait', 'gather', 'cancelGather', 'ritual', 'interact', 'buyPotion', 'drinkPotion',
  'hearthstone', 'cancelHearthstone', 'rest', 'target', 'openTrade', 'closeTrade', 'acceptTrade',
  'closeShop', 'takeLoot', 'closeLoot', 'closeInn', 'closeBank',
] as const satisfies readonly AdventureAction[];
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
    && member(value.archetype, ['warrior', 'mage', 'hunter', 'alchemist', 'artificer'])
    && finite(value.createdAtMillis, 0, Number.MAX_SAFE_INTEGER, true);
}
function command(value: unknown): value is WorldCommand {
  if (!record(value)) return false;
  switch (value.type) {
    case 'partyInvite': case 'partyKick': return keys(value, ['type', 'playerId']) && identifier(value.playerId);
    case 'partyAccept': case 'partyDecline': return keys(value, ['type', 'inviteId']) && identifier(value.inviteId);
    case 'partyLeave': case 'pause': case 'resume': case 'rejoin': case 'sit': return keys(value, ['type']);
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
    case 'previewBait': case 'bait': return keys(value, ['type', 'destination']) && record(value.destination) && keys(value.destination, ['x','y','z']) && finite(value.destination.x,WORLD_BOUNDS.minX,WORLD_BOUNDS.maxX) && finite(value.destination.y,-100,100) && finite(value.destination.z,WORLD_BOUNDS.minZ,WORLD_BOUNDS.maxZ);
    case 'ready': return keys(value, ['type']);
    case 'actionTiming': return keys(value, ['type','timing']) && member(value.timing,['before','during','after']);
    case 'remove': return keys(value,['type','id']) && finite(value.id,1,Number.MAX_SAFE_INTEGER,true);
    case 'clear': return keys(value,['type']);
    case 'bank': return keys(value, ['type', 'operation', 'kind', 'quantity']) && member(value.operation, ['deposit', 'withdraw']) && member(value.kind, ['supplies', 'potions']) && finite(value.quantity, 1, Number.MAX_SAFE_INTEGER, true);
    case 'trade': return keys(value, ['type', 'kind', 'quantity']) && member(value.kind, ['supplies', 'potions']) && finite(value.quantity, 0, 100_000, true);
    case 'interactNpc': return keys(value, ['type', 'id']) && member(value.id, NPC_IDS);
    case 'buyGear': return keys(value, ['type', 'vendor', 'item']) && member(value.vendor, VENDORS.map(v => v.id)) && isGearItem(value.item);
    case 'quest': return keys(value, ['type', 'id', 'operation']) && member(value.id, ['cold-hands', 'roll-call', 'last-shift']) && member(value.operation, ['accept', 'turnIn']);
    case 'equip': return keys(value, ['type', 'slot', 'item']) && member(value.slot, ['chest', 'mainhand', 'offhand']) && (value.item === null || isGearItem(value.item));
    case 'chat': return keys(value, ['type', 'text']) && typeof value.text === 'string' && value.text.trim().length > 0 && value.text.length <= 280 && !/[\u0000-\u001f\u007f]/.test(value.text);
    default: return false;
  }
}

interface Account { character: LocalCharacter; tokenHash: string; }
interface Party { id: string; leaderId: string; members: string[]; }
interface PartyInvite extends PartyInviteView { recipientId: string; }
interface SavedService { version: 1; parties: Party[]; accounts: Account[]; world: string; chat: SharedChatMessage[]; nextChatId: number; }
export interface WorldSocketData {
  id: string | null;
  openedAt: number;
  lastSequence: number;
  commandsAt: number[];
  chatsAt: number[];
  lastPingAt: number;
  lastPongAt: number;
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
      || (entry.kind !== undefined && entry.kind !== 'emote')
      || (entry.speakerId !== undefined && entry.speakerId !== null && (!identifier(entry.speakerId) || !ids.has(entry.speakerId)))) throw new Error('Invalid saved shared chat');
    chat.push({ id: entry.id, speakerId: typeof entry.speakerId === 'string' ? entry.speakerId : null, name: entry.name, text: entry.text, ...(entry.kind === 'emote' ? { kind: 'emote' as const } : {}) });
  }
  const parties: Party[] = [], grouped = new Set<string>(), partyIds = new Set<string>();
  if (value.parties !== undefined && !Array.isArray(value.parties)) throw new Error('Invalid saved parties');
  for (const valueParty of value.parties ?? []) {
    if (!record(valueParty) || !identifier(valueParty.id) || partyIds.has(valueParty.id) || !identifier(valueParty.leaderId)
      || !Array.isArray(valueParty.members) || valueParty.members.length < 2 || valueParty.members.length > 5
      || !valueParty.members.includes(valueParty.leaderId)) throw new Error('Invalid saved party');
    const members: string[] = [];
    for (const id of valueParty.members) {
      if (!identifier(id) || !ids.has(id) || grouped.has(id)) throw new Error('Invalid saved party member');
      grouped.add(id); members.push(id);
    }
    partyIds.add(valueParty.id); parties.push({ id: valueParty.id, leaderId: valueParty.leaderId, members });
  }
  return { version: 1, accounts, world: value.world, chat, nextChatId: value.nextChatId, parties };
}

export async function createWorldService(options: WorldServiceOptions) {
  let saved: SavedService | undefined;
  try { saved = decodeSave(await readFile(options.savePath, 'utf8')); }
  catch (error) { if (!record(error) || error.code !== 'ENOENT') throw error; }
  const world = createSharedAdventure(saved ? { save: saved.world } : {});
  const accounts = new Map((saved?.accounts ?? []).map(account => [account.character.id, account]));
  const chat = saved?.chat ?? [];
  const parties = new Map((saved?.parties ?? []).map(party => [party.id, party]));
  const invites = new Map<string, PartyInvite>();
  let nextChatId = saved?.nextChatId ?? 1;
  let serverTime = 0;
  const clients = new Set<ServerWebSocket<WorldSocketData>>();
  const online = new Map<string, ServerWebSocket<WorldSocketData>>();
  const privateChat = new Map<string, SharedChatMessage[]>();
  let closed = false;
  let saveQueue = Promise.resolve();
  const onPersistenceError = options.onPersistenceError ?? (() => console.error('Shared world could not be saved.'));

  function persist(): Promise<void> {
    const data: SavedService = { version: 1, accounts: [...accounts.values()], world: world.save(), chat: [...chat], nextChatId, parties: [...parties.values()] };
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
  function partyFor(id: string): Party | undefined { return [...parties.values()].find(party => party.members.includes(id)); }
  function cohort(id: string): readonly string[] { return partyFor(id)?.members ?? [id]; }
  function expireInvites(): void { for (const [id, invite] of invites) if (invite.expiresAtMillis <= Date.now()) invites.delete(id); }
  function partyView(id: string): PartyView | null {
    const party = partyFor(id);
    if (!party) return null;
    return { id: party.id, leaderId: party.leaderId, members: party.members.map(memberId => {
      const account = accounts.get(memberId)!, player = world.getPlayer(memberId)!.snapshot.player;
      return { id: memberId, name: account.character.name, archetype: account.character.archetype,
        health: player.health, maximumHealth: player.maximumHealth, online: online.has(memberId), sameEncounter: world.session(memberId).id === world.session(id).id };
    }) };
  }
  function applyParty(id: string, value: PartyCommand, socket: ServerWebSocket<WorldSocketData>): boolean {
    expireInvites();
    const party = partyFor(id);
    const reject = (text: string) => { error(socket, text); return false; };
    if (value.type === 'partyDecline') {
      const invite = invites.get(value.inviteId);
      if (!invite || invite.recipientId !== id) return reject('That invitation is no longer available.');
      invites.delete(invite.id); return true;
    }
    if (world.session(id).mode !== 'shared') return reject('Return to the shared world before changing your party.');
    switch (value.type) {
      case 'partyInvite': {
        if (party && party.leaderId !== id) return reject('Only the party leader can invite adventurers.');
        if (party && party.members.length >= 5) return reject('Your party is full. Five adventurers can travel together.');
        if (value.playerId === id) return reject('Choose another adventurer to invite.');
        if (!online.has(value.playerId) || world.session(value.playerId).mode !== 'shared') return reject('That adventurer must be here in the shared world to receive an invitation.');
        if (partyFor(value.playerId)) return reject('That adventurer already belongs to a party.');
        if ([...invites.values()].some(invite => invite.inviterId === id && invite.recipientId === value.playerId)) return reject('That adventurer already has your invitation.');
        const invite: PartyInvite = { id: crypto.randomUUID(), inviterId: id, inviterName: accounts.get(id)!.character.name, recipientId: value.playerId, expiresAtMillis: Date.now() + 60_000 };
        invites.set(invite.id, invite); return true;
      }
      case 'partyAccept': {
        const invite = invites.get(value.inviteId);
        if (!invite || invite.recipientId !== id) return reject('That invitation is no longer available.');
        if (party) return reject('Leave your current party before accepting another invitation.');
        if (!online.has(invite.inviterId) || world.session(invite.inviterId).mode !== 'shared') return reject('The inviting adventurer must return to the shared world first.');
        const target = partyFor(invite.inviterId);
        if (target && target.leaderId !== invite.inviterId) return reject('That adventurer is no longer the party leader.');
        if (target && target.members.length >= 5) return reject('That party is full. Five adventurers can travel together.');
        if (target) target.members.push(id);
        else {
          const created: Party = { id: crypto.randomUUID(), leaderId: invite.inviterId, members: [invite.inviterId, id] };
          parties.set(created.id, created);
        }
        for (const [inviteId, pending] of invites) if (pending.recipientId === id || pending.inviterId === id) invites.delete(inviteId);
        return true;
      }
      case 'partyLeave': case 'partyKick': {
        if (!party) return reject('You are not in a party.');
        if (value.type === 'partyKick' && party.leaderId !== id) return reject('Only the party leader can remove adventurers.');
        const targetId = value.type === 'partyLeave' ? id : value.playerId;
        if (value.type === 'partyKick' && targetId === id) return reject('Choose Leave Party to leave your companions.');
        if (!party.members.includes(targetId)) return reject('That adventurer is not in your party.');
        if (party.members.some(memberId => world.session(memberId).mode !== 'shared')) return reject('Return to the shared world together before changing your party.');
        party.members = party.members.filter(memberId => memberId !== targetId);
        if (party.members.length < 2) parties.delete(party.id);
        else if (party.leaderId === targetId) party.leaderId = party.members[0]!;
        for (const [inviteId, invite] of invites) if (invite.inviterId === targetId) invites.delete(inviteId);
        return true;
      }
    }
  }
  function broadcast(): void {
    expireInvites();
    const serverWallTimeMillis = Date.now();
    // Scoped to this synchronous broadcast: never reuse stale or cross-instance views.
    const instancePlayers = new Map<string, ReturnType<typeof world.players>>();
    for (const [id, socket] of online) {
      const player = world.getPlayer(id);
      if (!player) continue;
      const session = world.session(id);
      let players = instancePlayers.get(session.id);
      if (!players) { players = world.players(session.id); instancePlayers.set(session.id, players); }
      send(socket, { type: 'state', snapshot: player.snapshot, players: players.filter(other => other.id !== id), chat: session.mode === 'shared' ? chat : (privateChat.get(session.id) ?? []), serverTime, serverWallTimeMillis, movement: player.movementCheckpoint!, session, party: partyView(id), partyInvites: [...invites.values()].filter(invite => invite.recipientId === id).map(({ recipientId, ...invite }) => invite) });
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
    world.leave(id, cohort(id));
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
    socket.data.lastPongAt = performance.now();
    online.set(selected.id, socket);
    void persist().catch(onPersistenceError);
    broadcast();
  }
  function apply(player: AdventureGame, value: WorldCommand, socket: ServerWebSocket<WorldSocketData>): boolean {
    const id = socket.data.id;
    if (id === null) return false;
    const session = world.session(id);
    switch (value.type) {
      case 'partyInvite': case 'partyAccept': case 'partyDecline': case 'partyLeave': case 'partyKick': return applyParty(id, value, socket);
      case 'pause': return world.pause(id, cohort(id));
      case 'resume': return world.resume(id);
      case 'rejoin': {
        const previous = session.id;
        const accepted = world.rejoin(id);
        if (accepted && previous !== 'shared') privateChat.delete(previous);
        if (!accepted) error(socket, 'Everyone in your party must finish fighting before returning to the shared world.');
        return accepted;
      }
      case 'movement': return player.enqueueMovement!(value.frames);
      case 'sit': player.sit(); break;
      case 'action': player.setAction(value.action, value.pressed); break;
      case 'mouseForward': player.setMouseForward(value.active); break;
      case 'camera': player.setCameraForward(value.x, value.z); break;
      case 'target': player.selectTarget(value.id); break;
      case 'bait': return player.queueBait(value.destination);
      case 'ready': return player.readyCombat();
      case 'actionTiming': return player.setActionTiming(value.timing);
      case 'remove': player.removeQueuedAction(value.id); break;
      case 'clear': player.clearQueuedActions(); break;
      case 'loot': player.openLoot(value.id); break;
      case 'bank': return player.bankTransfer(value.operation, value.kind, value.quantity);
      case 'trade': player.setTradeOffer(value.kind, value.quantity); break;
      case 'buyGear': return player.buyGear(value.vendor, value.item);
      case 'interactNpc': player.interactNpc(value.id); break;
      case 'quest': player.quest(value.id, value.operation); break;
      case 'equip': player.equip(value.slot, value.item); break;
      case 'chat': {
        const now = performance.now();
        socket.data.chatsAt = socket.data.chatsAt.filter(at => now - at < 1000);
        if (socket.data.chatsAt.length >= 3) { error(socket, 'Give others a moment to speak.'); return false; }
        socket.data.chatsAt.push(now);
        const account = accounts.get(socket.data.id!);
        if (!account) return false;
        let text = value.text.trim();
        let kind: 'emote' | undefined;
        if (text.startsWith('/')) {
          const match = /^\/(\S+)(?:\s+(.*))?$/.exec(text);
          if (!match) { error(socket, 'Type /emotes to see the available actions.'); return false; }
          const name = match[1]!.toLowerCase(), argument = match[2]?.trim();
          if (name === 'emotes') { error(socket, EMOTE_HELP); return true; }
          if (name === 'roll') {
            if (argument) { error(socket, 'Use /roll to roll from 1 to 100.'); return false; }
            text = `rolls ${randomInt(1, 101)} (1–100).`; kind = 'emote';
          } else {
            if (session.mode === 'paused') { error(socket, 'Resume your journey to perform an emote.'); return false; }
            if (name === 'sit') { player.sit(); broadcast(); return true; }
            if (name === 'stand') { player.emote('stand'); broadcast(); return true; }
            if (['e', 'em', 'emote', 'me'].includes(name)) {
              if (!argument) { error(socket, 'Try /e followed by what your character does.'); return false; }
              player.emote('stand'); text = argument; kind = 'emote';
            } else {
              const emote = findEmote(name);
              if (!emote) { error(socket, 'Unknown command. Type /emotes to see the available actions.'); return false; }
              let addressed: string | undefined;
              if (argument) {
                const names = [...world.players(session.id).map(other => other.name), ...player.snapshot.threats.map(threat => threat.name)];
                const matches = names.filter(candidate => candidate.toLowerCase() === argument.toLowerCase());
                if (matches.length !== 1) { error(socket, 'Use the full name of one character or creature here.'); return false; }
                addressed = matches[0];
              }
              player.emote(emote.name); text = emoteText(emote, addressed); kind = 'emote';
            }
          }
        }
        const message: SharedChatMessage = { id: nextChatId++, speakerId: account.character.id, name: account.character.name, text, ...(kind ? { kind } : {}) };
        const target = session.mode === 'shared' ? chat : (privateChat.get(session.id) ?? []);
        target.push(message);
        if (target.length > 100) target.shift();
        if (session.mode !== 'shared') privateChat.set(session.id, target);
        broadcast();
        break;
      }
    }
    return true;
  }
  const websocket: WebSocketHandler<WorldSocketData> = {
    maxPayloadLength: MAX_PAYLOAD,
    // Application broadcasts do not prove that a client can receive traffic.
    // The tick below owns an explicit native ping/pong lease instead.
    idleTimeout: 30,
    sendPings: false,
    backpressureLimit: 1024 * 1024,
    closeOnBackpressureLimit: true,
    open(socket) { clients.add(socket); },
    pong(socket) { socket.data.lastPongAt = performance.now(); },
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
        const session = world.session(socket.data.id!);
        const priority = value.command.type === 'pause' || value.command.type === 'resume' || value.command.type === 'rejoin' || stopping;
        const allowedWhilePaused = priority || value.command.type === 'chat' || value.command.type === 'camera' || value.command.type === 'target' || value.command.type.startsWith('party');
        if ((session.mode !== 'paused' || allowedWhilePaused) && (priority || socket.data.commandsAt.length < 120)) {
          socket.data.lastSequence = sequence;
          if (!stopping) socket.data.commandsAt.push(now);
          if (value.command.type === 'previewBait') {
            accepted = true;
            void player.previewBait(value.command.destination).then(forecast => send(socket, { type: 'movePreview', sequence, forecast }));
          } else accepted = apply(player, value.command, socket);
          if (accepted && (value.command.type === 'pause' || value.command.type === 'resume' || value.command.type === 'rejoin' || value.command.type.startsWith('party'))) {
            void persist().catch(onPersistenceError);
            broadcast();
          }
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
    for (const socket of [...clients]) {
      if (socket.data.id === null) continue;
      if (now - socket.data.lastPingAt >= 1_000) {
        socket.data.lastPingAt = now;
        socket.ping();
      }
      if (now - socket.data.lastPongAt > 2_000) {
        disconnect(socket);
        socket.close(4004, 'Connection heartbeat expired');
      }
    }
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
      const openedAt = performance.now();
      if (server.upgrade(request, { data: { id: null, openedAt, lastSequence: -1, commandsAt: [], chatsAt: [], lastPingAt: openedAt, lastPongAt: openedAt } })) return undefined;
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
