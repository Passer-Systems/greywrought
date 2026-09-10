import { expect, test } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Server } from 'bun';
import type { ServerWorldMessage, WorldCommand } from '../game/multiplayer-types.js';
import type { LocalCharacter } from '../host/character-profile.js';
import { createWorldService } from './world-service.js';
import type { WorldSocketData } from './world-service.js';

type State = Extract<ServerWorldMessage, { type: 'state' }>;
class Client {
  readonly socket: WebSocket;
  readonly messages: ServerWorldMessage[] = [];
  private watchers = new Set<() => void>();
  private sequence = 0;
  constructor(url: string) {
    this.socket = new WebSocket(url);
    this.socket.onmessage = event => {
      this.messages.push(JSON.parse(String(event.data)) as ServerWorldMessage);
      for (const watcher of this.watchers) watcher();
    };
  }
  async connect(character: LocalCharacter, token: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.socket.onopen = () => resolve();
      this.socket.onerror = () => reject(new Error('Socket failed to connect'));
    });
    this.socket.send(JSON.stringify({ type: 'join', token, character }));
  }
  wait(predicate: (message: ServerWorldMessage) => boolean): Promise<ServerWorldMessage> {
    return new Promise((resolve, reject) => {
      const check = () => {
        const found = this.messages.find(predicate);
        if (found) { clearTimeout(timeout); this.watchers.delete(check); resolve(found); }
      };
      const timeout = setTimeout(() => { this.watchers.delete(check); reject(new Error('Timed out waiting for world message')); }, 3000);
      this.watchers.add(check);
      check();
    });
  }
  async state(predicate: (message: State) => boolean = () => true): Promise<State> {
    return await this.wait(message => message.type === 'state' && predicate(message)) as State;
  }
  async command(command: WorldCommand): Promise<boolean> {
    const sequence = this.sequence++;
    this.socket.send(JSON.stringify({ type: 'command', sequence, command }));
    const response = await this.wait(message => message.type === 'result' && message.sequence === sequence);
    return response.type === 'result' && response.accepted;
  }
  async invalid(command: unknown): Promise<boolean> {
    const sequence = this.sequence++;
    this.socket.send(JSON.stringify({ type: 'command', sequence, command }));
    const response = await this.wait(message => message.type === 'result' && message.sequence === sequence);
    return response.type === 'result' && response.accepted;
  }
}

test('two socket clients share movement and chat; saved identity survives restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'greywrought-world-'));
  const savePath = join(directory, 'world.json');
  const clients: Client[] = [];
  let service = await createWorldService({ savePath });
  let server!: Server<WorldSocketData>;
  function listen() {
    const current = service;
    server = Bun.serve({ hostname: '127.0.0.1', port: 0, websocket: current.websocket, fetch: (request, host) => current.fetch(request, host) });
  }
  function client() { const result = new Client(`ws://127.0.0.1:${server.port}/world`); clients.push(result); return result; }
  const firstCharacter: LocalCharacter = { id: 'first', name: 'Alden', archetype: 'warrior', createdAtMillis: 1 };
  const secondCharacter: LocalCharacter = { id: 'second', name: 'Briar', archetype: 'mage', createdAtMillis: 2 };
  const firstToken = crypto.randomUUID();
  try {
    listen();
    const joinedAt = Date.now();
    const first = client(); await first.connect(firstCharacter, firstToken);
    const firstState = await first.state();
    expect(firstState.serverWallTimeMillis).toBeGreaterThanOrEqual(joinedAt);
    expect(firstState.serverWallTimeMillis).toBeLessThanOrEqual(Date.now());
    const initial = firstState.snapshot.player.position;
    expect(firstState.snapshot.progression.unlockedActions).toEqual(['strike', 'brace', 'drinkPotion']);
    expect(await first.command({ type: 'quest', id: 'cold-hands', operation: 'accept' })).toBe(true);
    expect(await first.invalid({ type: 'quest', id: 'cold-hands', operation: 'complete' })).toBe(false);
    expect(await first.invalid({ type: 'equip', slot: 'head', item: 'yard-weapon' })).toBe(false);
    const second = client(); await second.connect(secondCharacter, crypto.randomUUID());
    const together = await first.state(state => state.players.some(player => player.id === 'second'));
    expect(together.serverWallTimeMillis).toBeGreaterThanOrEqual(firstState.serverWallTimeMillis);
    expect(together.players[0]?.name).toBe('Briar');
    expect((await second.state()).snapshot.player.archetype).toBe('mage');
    expect(await first.command({ type: 'camera', x: 1, z: 0 })).toBe(true);
    expect(await first.command({ type: 'action', action: 'forward', pressed: true })).toBe(true);
    const seenMove = await second.state(state => state.players.some(player => player.id === 'first' && player.player.position.x > initial.x + 1.2));
    expect(seenMove.snapshot.player.position.x).toBe(initial.x);
    expect(await first.command({ type: 'action', action: 'forward', pressed: false })).toBe(true);
    expect(await first.command({ type: 'quest', id: 'cold-hands', operation: 'accept' })).toBe(true);
    expect((await first.state(state => state.snapshot.quests[0]?.status === 'active')).snapshot.quests[0]?.status).toBe('active');
    expect(await first.command({ type: 'equip', slot: 'mainhand', item: 'yard-weapon' })).toBe(true);
    expect((await second.state()).snapshot.progression.equipment.mainhand).toBeNull();
    expect(await first.command({ type: 'chat', text: 'Meet at the gate.' })).toBe(true);
    const heard = await second.state(state => state.chat.some(message => message.text === 'Meet at the gate.'));
    expect(heard.chat.at(-1)?.name).toBe('Alden');
    expect(heard.chat.at(-1)?.speakerId).toBe('first');
    expect(await first.invalid({ type: 'chat', text: 'Forged speaker', speakerId: 'second' })).toBe(false);
    expect(await first.invalid({ type: 'action', action: 'teleport', pressed: true })).toBe(false);
    expect(await first.invalid({ type: 'camera', x: 1e100, z: 0 })).toBe(false);
    expect(await first.invalid({ type: 'action', action: 'forward', pressed: true, save: 'forged' })).toBe(false);
    expect(await first.command({ type: 'chat', text: 'x'.repeat(281) })).toBe(false);
    expect(await first.command({ type: 'chat', text: 'Two' })).toBe(true);
    expect(await first.command({ type: 'chat', text: 'Three' })).toBe(true);
    expect(await first.command({ type: 'chat', text: 'Four' })).toBe(false);
    const duplicate = client(); await duplicate.connect(firstCharacter, firstToken);
    expect((await duplicate.wait(message => message.type === 'error')).type).toBe('error');
    // Disconnect while holding movement; reconnect must not keep walking.
    expect(await first.command({ type: 'action', action: 'forward', pressed: true })).toBe(true);
    first.socket.close();
    await second.state(state => state.players.length === 0);
    await service.close(); server.stop(true);
    const savedSource = await readFile(savePath, 'utf8');
    expect(savedSource.includes(firstToken)).toBe(false);
    const legacySave = JSON.parse(savedSource);
    delete legacySave.chat[1].speakerId;
    await writeFile(savePath, JSON.stringify(legacySave));
    service = await createWorldService({ savePath }); listen();
    const imposter = client(); await imposter.connect(firstCharacter, crypto.randomUUID());
    expect((await imposter.wait(message => message.type === 'error')).type).toBe('error');
    imposter.socket.close();
    const changedClass = client(); await changedClass.connect({ ...firstCharacter, archetype: 'hunter' }, firstToken);
    expect((await changedClass.wait(message => message.type === 'error')).type).toBe('error');
    changedClass.socket.close();
    const returning = client(); await returning.connect(firstCharacter, firstToken);
    const restored = await returning.state();
    expect(restored.snapshot.player.position.x).toBeGreaterThan(initial.x + 0.4);
    expect(restored.snapshot.player.moving).toBe(false);
    expect(restored.snapshot.quests[0]?.status).toBe('active');
    expect(restored.snapshot.progression.equipment.mainhand).toBeNull();
    // A disconnect creates a paused private instance; shared-world chat does
    // not leak across that boundary.
    expect(restored.session.mode).toBe('paused');
    expect(restored.chat.some(message => message.text === 'Meet at the gate.')).toBe(false);
    expect(restored.chat.find(message => message.text === 'Two')?.speakerId).toBeUndefined();
    const latest = await returning.state(state => state !== restored);
    expect(latest.snapshot.player.position).toEqual(restored.snapshot.player.position);
  } finally {
    for (const connection of clients) connection.socket.close();
    await service.close(); server!.stop(true);
    await rm(directory, { recursive: true });
  }
}, 15_000);

test('releasing movement survives a burst of camera input', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'greywrought-release-'));
  const service = await createWorldService({savePath:join(directory,'world.json')});
  const server = Bun.serve({hostname:'127.0.0.1',port:0,websocket:service.websocket,fetch:(request,host)=>service.fetch(request,host)});
  const client = new Client(`ws://127.0.0.1:${server.port}/world`);
  try {
    await client.connect({id:'release',name:'Release',archetype:'warrior',createdAtMillis:1},crypto.randomUUID());
    await client.state();
    expect(await client.command({type:'action',action:'forward',pressed:true})).toBe(true);
    await Promise.all(Array.from({length:130},()=>client.command({type:'camera',x:0,z:1})));
    expect(await client.command({type:'action',action:'forward',pressed:false})).toBe(true);
    expect(await client.command({type:'mouseForward',active:false})).toBe(true);
    client.messages.length=0;
    const stopped=await client.state();
    const next=await client.state(state=>state!==stopped);
    expect(next.snapshot.player.position).toEqual(stopped.snapshot.player.position);
  } finally {client.socket.close();await service.close();server.stop(true);await rm(directory,{recursive:true});}
});

test('NPC interaction accepts named villagers and rejects unrelated targets', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'greywrought-npc-'));
  const service = await createWorldService({savePath:join(directory,'world.json')});
  const server = Bun.serve({hostname:'127.0.0.1',port:0,websocket:service.websocket,fetch:(request,host)=>service.fetch(request,host)});
  const visitor = new Client(`ws://127.0.0.1:${server.port}/world`);
  try {
    await visitor.connect({id:'npc-visitor',name:'Visitor',archetype:'mage',createdAtMillis:1},crypto.randomUUID());
    await visitor.state();
    expect(await visitor.command({type:'interactNpc',id:'mara'})).toBe(true);
    expect(await visitor.command({type:'interactNpc',id:'inn'})).toBe(true);
    expect(await visitor.invalid({type:'interactNpc',id:'scout'})).toBe(false);
  } finally { visitor.socket.close();await service.close();server.stop(true);await rm(directory,{recursive:true,force:true}); }
});

test('pause forks the connection and explicit rejoin returns it to the shared world', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'greywrought-private-'));
  const service = await createWorldService({ savePath: join(directory, 'world.json') });
  const server = Bun.serve({ hostname: '127.0.0.1', port: 0, websocket: service.websocket, fetch: (request, host) => service.fetch(request, host) });
  const visitor = new Client(`ws://127.0.0.1:${server.port}/world`);
  try {
    await visitor.connect({ id: 'private', name: 'Private', archetype: 'warrior', createdAtMillis: 1 }, crypto.randomUUID());
    const shared = await visitor.state();
    expect(shared.session.mode).toBe('shared');
    expect(await visitor.command({ type: 'pause' })).toBe(true);
    const paused = await visitor.state(state => state.session.mode === 'paused');
    expect(paused.session.origin).not.toBeNull();
    expect(paused.session.canRejoin).toBe(true);
    expect(await visitor.command({ type: 'movement', frames: [{ sequence: 1, seconds: 0.05, input: { forward: 1, strafe: 0, cameraX: 0, cameraZ: 1, jump: false } }] })).toBe(false);
    expect(await visitor.command({ type: 'heartbeat' })).toBe(true);
    expect(await visitor.command({ type: 'resume' })).toBe(true);
    expect((await visitor.state(state => state.session.mode === 'private')).session.mode).toBe('private');
    visitor.messages.length = 0;
    expect(await visitor.command({ type: 'rejoin' })).toBe(true);
    const rejoined = await visitor.state(state => state.session.mode === 'shared');
    expect(rejoined.session.mode).toBe('shared');
  } finally {
    visitor.socket.close(); await service.close(); server.stop(true); await rm(directory, { recursive: true, force: true });
  }
});

test('heartbeat expiry forks a silent socket before its close callback', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'greywrought-heartbeat-'));
  const savePath = join(directory, 'world.json');
  const service = await createWorldService({ savePath });
  const server = Bun.serve({ hostname: '127.0.0.1', port: 0, websocket: service.websocket, fetch: (request, host) => service.fetch(request, host) });
  const visitor = new Client(`ws://127.0.0.1:${server.port}/world`);
  try {
    await visitor.connect({ id: 'heartbeat', name: 'Heartbeat', archetype: 'warrior', createdAtMillis: 1 }, crypto.randomUUID());
    await visitor.state();
    await new Promise(resolve => setTimeout(resolve, 5_500));
    const saved = JSON.parse(await readFile(savePath, 'utf8')) as { world: string };
    const world = JSON.parse(saved.world) as { instances?: readonly { ownerId: string; mode: string }[] };
    expect(world.instances?.some(instance => instance.ownerId === 'heartbeat' && instance.mode === 'paused')).toBe(true);
  } finally {
    visitor.socket.close(); await service.close(); server.stop(true); await rm(directory, { recursive: true, force: true });
  }
}, 10_000);
