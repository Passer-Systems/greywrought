import { terrainHeight } from '../game/cave-layout.js';
import { expect, test } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createConnection, type Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Server } from 'bun';
import type { ServerWorldMessage, WorldCommand } from '../game/multiplayer-types.js';
import { DEPARTURE_CLOSE_CODE } from '../game/multiplayer-types.js';
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
  wait(predicate: (message: ServerWorldMessage) => boolean, timeoutMillis = 3000): Promise<ServerWorldMessage> {
    return new Promise((resolve, reject) => {
      const check = () => {
        const found = this.messages.find(predicate);
        if (found) { clearTimeout(timeout); this.watchers.delete(check); resolve(found); }
      };
      const timeout = setTimeout(() => { this.watchers.delete(check); reject(new Error('Timed out waiting for world message')); }, timeoutMillis);
      this.watchers.add(check);
      check();
    });
  }
  async state(predicate: (message: State) => boolean = () => true, timeoutMillis = 3000): Promise<State> {
    return await this.wait(message => message.type === 'state' && predicate(message), timeoutMillis) as State;
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

async function silentJoinedSocket(port: number, character: LocalCharacter, token: string): Promise<Socket> {
  const socket = createConnection({ host: '127.0.0.1', port });
  await new Promise<void>((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('error', reject);
  });
  socket.write([
    'GET /world HTTP/1.1',
    'Host: 127.0.0.1',
    'Upgrade: websocket',
    'Connection: Upgrade',
    'Sec-WebSocket-Version: 13',
    `Sec-WebSocket-Key: ${Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64')}`,
    '\r\n',
  ].join('\r\n'));
  const join = JSON.stringify({ type: 'join', token, character });
  const payload = new TextEncoder().encode(join);
  if (payload.length >= 65_536) throw new Error('raw test join unexpectedly exceeded websocket test-frame limit');
  const extended = payload.length >= 126;
  const frame = new Uint8Array((extended ? 4 : 2) + 4 + payload.length);
  frame[0] = 0x81;
  frame[1] = 0x80 | (extended ? 126 : payload.length);
  if (extended) { frame[2] = payload.length >>> 8; frame[3] = payload.length & 0xff; }
  const mask = [0x17, 0x29, 0x3b, 0x4d];
  const maskOffset = extended ? 4 : 2;
  frame.set(mask, maskOffset);
  const payloadOffset = maskOffset + 4;
  for (let index = 0; index < payload.length; index += 1) frame[payloadOffset + index] = (payload[index] ?? 0) ^ (mask[index % 4] ?? 0);
  await new Promise<void>(resolve => setTimeout(resolve, 50));
  socket.write(frame);
  return socket;
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
    expect(firstState.snapshot.progression.unlockedActions).toEqual(['strike', 'brace', 'bait']);
    expect(await first.command({ type: 'quest', id: 'cold-hands', operation: 'accept' })).toBe(true);
    expect(await first.invalid({ type: 'flight', destination: 'missing' })).toBe(false);
    expect(await first.command({ type: 'flight', destination: 'suture' })).toBe(false);
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
    expect(await first.command({ type: 'action', action: 'drinkPotion', pressed: true })).toBe(true);
    expect(await first.command({ type: 'action', action: 'drinkPotion', pressed: false })).toBe(true);
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
    first.socket.close(DEPARTURE_CLOSE_CODE, 'Leaving world');
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

test('pause forks the connection and explicit rejoin opens a return preview', async () => {
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
    expect(await visitor.command({ type: 'resume' })).toBe(true);
    expect((await visitor.state(state => state.session.mode === 'private')).session.mode).toBe('private');
    visitor.messages.length = 0;
    expect(await visitor.command({ type: 'rejoin' })).toBe(true);
    const preview = await visitor.state(state => state.session.mode === 'viewing');
    expect(preview.session.returnPlan?.remainingSeconds).toBeGreaterThan(0);
    expect(preview.session.returnPlan?.spots.length).toBeGreaterThan(0);
    expect(await visitor.command({ type: 'returnSpot', destination: preview.session.returnPlan!.destination })).toBe(true);
    visitor.messages.length = 0;
    expect((await visitor.state()).session).toMatchObject({ mode: 'viewing', returnPlan: { confirmed: false } });
    expect(await visitor.command({ type: 'movement', frames: [{ sequence: 2, seconds: .05, input: { forward: 1, strafe: 0, cameraX: 0, cameraZ: 1, jump: false } }] })).toBe(false);
    expect(await visitor.command({ type: 'rejoin' })).toBe(true);
    const rejoined = await visitor.state(state => state.session.mode === 'shared');
    expect(rejoined.session.mode).toBe('shared');
  } finally {
    visitor.socket.close(); await service.close(); server.stop(true); await rm(directory, { recursive: true, force: true });
  }
});

test('native transport liveness keeps a background socket shared, while deliberate departure forks it immediately', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'greywrought-native-ping-'));
  const savePath = join(directory, 'world.json');
  const service = await createWorldService({ savePath });
  const server = Bun.serve({ hostname: '127.0.0.1', port: 0, websocket: service.websocket, fetch: (request, host) => service.fetch(request, host) });
  const visitor = new Client(`ws://127.0.0.1:${server.port}/world`);
  try {
    await visitor.connect({ id: 'heartbeat', name: 'Heartbeat', archetype: 'warrior', createdAtMillis: 1 }, crypto.randomUUID());
    await visitor.state();
    // No gameplay command or browser heartbeat is sent. Bun's native ping /
    // pong handling keeps this healthy socket in the shared world.
    await new Promise(resolve => setTimeout(resolve, 5_500));
    visitor.messages.length = 0;
    const shared = await visitor.state(state => state.session.mode === 'shared');
    expect(shared.session.mode).toBe('shared');
    visitor.socket.close(DEPARTURE_CLOSE_CODE, 'Leaving world');
    await new Promise(resolve => setTimeout(resolve, 100));
    const saved = JSON.parse(await readFile(savePath, 'utf8')) as { world: string };
    const world = JSON.parse(saved.world) as { instances?: readonly { members: readonly { id: string }[]; mode: string }[] };
    expect(world.instances?.some(instance => instance.members.some(member => member.id === 'heartbeat') && instance.mode === 'paused')).toBe(true);
  } finally {
    visitor.socket.close(); await service.close(); server.stop(true); await rm(directory, { recursive: true, force: true });
  }
}, 10_000);

test('missing native pong waits five seconds before forking despite continuous broadcasts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'greywrought-missing-pong-'));
  const savePath = join(directory, 'world.json');
  const service = await createWorldService({ savePath });
  const server = Bun.serve({ hostname: '127.0.0.1', port: 0, websocket: service.websocket, fetch: (request, host) => service.fetch(request, host) });
  let socket: Socket | undefined;
  try {
    socket = await silentJoinedSocket(server.port!, { id: 'silent', name: 'Silent', archetype: 'warrior', createdAtMillis: 1 }, crypto.randomUUID());
    // The raw socket never answers ping frames. Application state broadcasts
    // still occur, so this proves they do not reset the native lease.
    await new Promise(resolve => setTimeout(resolve, 4_500));
    const before = JSON.parse(await readFile(savePath, 'utf8')) as { world: string };
    expect(JSON.parse(before.world).instances ?? []).toHaveLength(0);
    await new Promise(resolve => setTimeout(resolve, 1_000));
    const saved = JSON.parse(await readFile(savePath, 'utf8')) as { world: string };
    const world = JSON.parse(saved.world) as { instances?: readonly { members: readonly { id: string }[]; mode: string }[] };
    expect(world.instances?.some(instance => instance.members.some(member => member.id === 'silent') && instance.mode === 'paused')).toBe(true);
  } finally {
    socket?.destroy(); await service.close(); server.stop(true); await rm(directory, { recursive: true, force: true });
  }
}, 12_000);

test.each([[-3, 28, 0], [41, -46, 38]])('Bait transport validates ground and queues a real destination from (%s, %s)', async (x, z, destinationX) => {
  const { createSharedAdventure } = await import('../game/adventure.js');
  const directory = await mkdtemp(join(tmpdir(), 'greywrought-bait-'));
  const savePath = join(directory, 'world.json');
  const character: LocalCharacter = { id: 'bait-tester', name: 'Bait Tester', archetype: 'warrior', createdAtMillis: 1 };
  const token = crypto.randomUUID(), seed = createSharedAdventure(); seed.join(character.id, character.name, character.archetype);
  const saved = JSON.parse(seed.save());
  Object.assign(saved.characters[0].state, { phase: 'expedition', position: { x, y: terrainHeight(x, z), z } });
  await writeFile(savePath, JSON.stringify({ version: 1, accounts: [{ character, tokenHash: new Bun.CryptoHasher('sha256').update(token).digest('hex') }], world: JSON.stringify(saved), chat: [], nextChatId: 1 }));
  const service = await createWorldService({ savePath });
  const server = Bun.serve({ hostname: '127.0.0.1', port: 0, websocket: service.websocket, fetch: (request, host) => service.fetch(request, host) });
  const client = new Client(`ws://127.0.0.1:${server.port}/world`);
  try {
    await client.connect(character, token); await client.state(s => s.snapshot.combat.phase === 'preparation');
    for (const destination of [{ x: 100, y: 0, z: 28 }, { x: 0, y: 0, z: '8' }, { x: 0, z: 28 }, { x: null, y: 0, z: 28 }]) {
      expect(await client.invalid({ type: 'bait', destination })).toBe(false);
    }
    expect(await client.command({ type: 'bait', destination: { x: 4, y: 0, z: 40 } })).toBe(false);
    const destination = { x: destinationX, y: terrainHeight(destinationX, z), z };
    expect(await client.command({ type: 'bait', destination: {...destination, y: -.06} })).toBe(true);
    const planned = await client.state(s => s.snapshot.combat.queued.some(e => e.action === 'bait'));
    const snappedX=Math.round(destination.x/2.5)*2.5, snappedZ=Math.round(destination.z/2.5)*2.5;
    expect(planned.snapshot.combat.queued[0]!.destination).toEqual({x:snappedX,y:terrainHeight(snappedX,snappedZ),z:snappedZ});
    expect(await client.command({ type: 'action', action: 'brace', pressed: true })).toBe(true);
    expect(await client.command({ type: 'action', action: 'brace', pressed: false })).toBe(true);
    expect(await client.command({ type: 'actionTiming', timing: 'during' })).toBe(true);
    await client.state(s => s.snapshot.combat.queued.some(e => e.action === 'brace' && e.timing === 'during'));
    expect(await client.invalid({ type: 'actionTiming', timing: 'later' })).toBe(false);
    expect(await client.invalid({ type: 'move', id: 1, seconds: 1 })).toBe(false);
    expect(await client.invalid({ type: 'delay', id: 1, seconds: 1 })).toBe(false);
    expect(await client.invalid({ type: 'replace', id: 1, action: 'strike' })).toBe(false);
    expect(await client.command({ type: 'ready' })).toBe(true);
    const ready = await client.state(s => s.snapshot.combat.ready);
    expect(ready.snapshot.combat.phase).toBe('preparation');
    expect(ready.snapshot.combat.gatheringRemainingSeconds).toBeGreaterThan(0);
    await client.state(s => s.snapshot.combat.phase === 'active', 8000);
    expect(await client.command({ type: 'actionTiming', timing: 'before' })).toBe(false);
    expect(await client.command({ type: 'bait', destination })).toBe(false);
  } finally { client.socket.close(); await service.close(); server.stop(true); await rm(directory, { recursive: true }); }
}, 12000);

test('slash emotes replicate actions and chat while unknown commands stay private', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'greywrought-emotes-'));
  const service = await createWorldService({savePath:join(directory,'world.json')});
  const server = Bun.serve({hostname:'127.0.0.1',port:0,websocket:service.websocket,fetch:(request,host)=>service.fetch(request,host)});
  const dancer = new Client(`ws://127.0.0.1:${server.port}/world`);
  const watcher = new Client(`ws://127.0.0.1:${server.port}/world`);
  try {
    await dancer.connect({id:'dancer',name:'Dancer',archetype:'warrior',createdAtMillis:1},crypto.randomUUID());
    await watcher.connect({id:'watcher',name:'Watcher',archetype:'mage',createdAtMillis:1},crypto.randomUUID());
    await dancer.state(); await watcher.state();
    expect(await dancer.command({type:'chat',text:'/dance'})).toBe(true);
    const dancing = await watcher.state(state => state.players.some(other => other.player.emote?.name === 'dance'));
    expect(dancing.chat.at(-1)).toMatchObject({name:'Dancer',kind:'emote',text:'starts to dance.'});
    expect(await dancer.command({type:'chat',text:'/wave Watcher'})).toBe(true);
    const waving = await watcher.state(state => state.chat.at(-1)?.text.includes('Watcher') === true);
    expect(waving.players.find(other => other.id === 'dancer')?.player.emote?.name).toBe('wave');
    expect(await dancer.command({type:'chat',text:'/unknown'})).toBe(false);
    await dancer.wait(message => message.type === 'error' && message.text.includes('/emotes'));
    expect(watcher.messages.some(message => message.type === 'state' && message.chat.some(entry => entry.text === '/unknown'))).toBe(false);
    expect(await watcher.command({type:'chat',text:'/e admires the trees.'})).toBe(true);
    await dancer.state(state => state.chat.at(-1)?.kind === 'emote' && state.chat.at(-1)?.text === 'admires the trees.');
    expect(await watcher.command({type:'chat',text:'/emotes'})).toBe(true);
    await watcher.wait(message => message.type === 'error' && message.text.includes('/train'));
  } finally {dancer.socket.close();watcher.socket.close();await service.close();server.stop(true);await rm(directory,{recursive:true});}
});

test('/roll produces one shared 1–100 result and remains usable in paused encounters', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'greywrought-roll-'));
  const service = await createWorldService({ savePath: join(directory, 'world.json') });
  const server = Bun.serve({ hostname: '127.0.0.1', port: 0, websocket: service.websocket, fetch: (request, host) => service.fetch(request, host) });
  const roller = new Client(`ws://127.0.0.1:${server.port}/world`), watcher = new Client(`ws://127.0.0.1:${server.port}/world`);
  try {
    await roller.connect({ id: 'roller', name: 'Roller', archetype: 'warrior', createdAtMillis: 1 }, crypto.randomUUID());
    await watcher.connect({ id: 'roll-watcher', name: 'Watcher', archetype: 'mage', createdAtMillis: 1 }, crypto.randomUUID());
    await roller.state(); await watcher.state();
    expect(await roller.command({ type: 'chat', text: '/roll' })).toBe(true);
    const observed = await watcher.state(state => state.chat.some(entry => entry.text.startsWith('rolls ')));
    const result = observed.chat.at(-1)!;
    expect(result).toMatchObject({ speakerId: 'roller', name: 'Roller', kind: 'emote' });
    expect(result.text).toMatch(/^rolls ([1-9]|[1-9]\d|100) \(1–100\)\.$/);
    expect((await roller.state(state => state.chat.some(entry => entry.id === result.id))).chat.at(-1)).toEqual(result);
    expect(await roller.command({ type: 'chat', text: '/roll 100' })).toBe(false);
    await roller.wait(message => message.type === 'error' && message.text.includes('Use /roll'));
    expect(await roller.command({ type: 'pause' })).toBe(true);
    expect(await roller.command({ type: 'chat', text: '/ROLL' })).toBe(true);
    const paused = await roller.state(state => state.session.mode === 'paused' && state.chat.some(entry => entry.text.startsWith('rolls ')));
    expect(paused.chat.at(-1)!.text).toMatch(/^rolls ([1-9]|[1-9]\d|100) \(1–100\)\.$/);
    expect(paused.chat.at(-1)!.id).toBeGreaterThan(result.id);
  } finally { roller.socket.close(); watcher.socket.close(); await service.close(); server.stop(true); await rm(directory, { recursive: true }); }
});

test('bank socket commands reject invalid quantities, remote access, and another character balance', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'greywrought-bank-'));
  const service = await createWorldService({ savePath: join(directory, 'world.json') });
  const server = Bun.serve({ hostname: '127.0.0.1', port: 0, websocket: service.websocket, fetch: (request, host) => service.fetch(request, host) });
  const alice = new Client(`ws://127.0.0.1:${server.port}/world`), bob = new Client(`ws://127.0.0.1:${server.port}/world`);
  try {
    await alice.connect({ id: 'bank-alice', name: 'Alice', archetype: 'warrior', createdAtMillis: 1 }, crypto.randomUUID());
    await bob.connect({ id: 'bank-bob', name: 'Bob', archetype: 'mage', createdAtMillis: 1 }, crypto.randomUUID());
    await alice.state(); await bob.state();
    const deposit = { type: 'bank', operation: 'deposit', kind: 'supplies', quantity: 10 } as const;
    expect(await alice.command(deposit)).toBe(false);
    for (const quantity of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) expect(await alice.invalid({ ...deposit, quantity })).toBe(false);
    expect(await alice.invalid({ ...deposit, kind: 'relics' })).toBe(false);
    await alice.command({ type: 'camera', x: -1, z: 0 });
    await alice.command({ type: 'action', action: 'forward', pressed: true });
    await alice.state(state => state.snapshot.player.position.x < -8.5);
    await alice.command({ type: 'action', action: 'forward', pressed: false });
    await alice.command({ type: 'interactNpc', id: 'bank' });
    await alice.state(state => state.snapshot.bankOpen);
    expect(await alice.command(deposit)).toBe(true);
    expect(await alice.command(deposit)).toBe(false);
    await alice.state(state => state.snapshot.bank.supplies === 10 && state.snapshot.supplies === 5);
    expect(await bob.command({ type: 'bank', operation: 'withdraw', kind: 'supplies', quantity: 10 })).toBe(false);
    expect((await bob.state()).snapshot.bank.supplies).toBe(0);
    expect(await alice.command({ type: 'bank', operation: 'withdraw', kind: 'supplies', quantity: 4 })).toBe(true);
    await alice.state(state => state.snapshot.bank.supplies === 6 && state.snapshot.supplies === 9);
  } finally {
    alice.socket.close(); bob.socket.close(); await service.close(); server.stop(true);
    await rm(directory, { recursive: true });
  }
}, 10_000);

test('coin shop transport validates stock, balance and distance and saves actual shield equipment', async () => {
  const { createSharedAdventure } = await import('../game/adventure.js');
  const directory = await mkdtemp(join(tmpdir(), 'greywrought-shop-'));
  const savePath = join(directory, 'world.json');
  const character: LocalCharacter = { id: 'shop-tester', name: 'Shop Tester', archetype: 'warrior', createdAtMillis: 1 };
  const token = crypto.randomUUID(), seed = createSharedAdventure(); seed.join(character.id, character.name, character.archetype);
  const saved = JSON.parse(seed.save());
  Object.assign(saved.characters[0].state, { position: { x: -9, y: terrainHeight(-9, -32), z: -32 }, coins: 12 });
  await writeFile(savePath, JSON.stringify({ version: 1, accounts: [{ character, tokenHash: new Bun.CryptoHasher('sha256').update(token).digest('hex') }], world: JSON.stringify(saved), chat: [], nextChatId: 1 }));
  const service = await createWorldService({ savePath });
  const server = Bun.serve({ hostname: '127.0.0.1', port: 0, websocket: service.websocket, fetch: (request, host) => service.fetch(request, host) });
  const client = new Client(`ws://127.0.0.1:${server.port}/world`);
  try {
    await client.connect(character, token); await client.state();
    expect(await client.invalid({ type: 'buyGear', vendor: 'shield-vendor', item: 'free-shield' })).toBe(false);
    expect(await client.command({ type: 'buyGear', vendor: 'shield-vendor', item: 'yard-shield' })).toBe(false);
    await client.command({ type: 'interactNpc', id: 'shield-vendor' });
    expect(await client.command({ type: 'buyGear', vendor: 'shield-vendor', item: 'yard-weapon' })).toBe(false);
    expect(await client.command({ type: 'buyGear', vendor: 'shield-vendor', item: 'yard-shield' })).toBe(true);
    expect(await client.command({ type: 'buyGear', vendor: 'shield-vendor', item: 'yard-shield' })).toBe(false);
    expect(await client.command({ type: 'buyGear', vendor: 'armor-vendor', item: 'padded-coat' })).toBe(false);
    await client.command({ type: 'equip', slot: 'offhand', item: 'yard-shield' });
    const state = await client.state(s => s.snapshot.progression.equipment.offhand === 'yard-shield');
    expect(state.snapshot.coins).toBe(0); expect(state.snapshot.progression.damageReduction).toBe(2);
    await service.close();
    const stored = JSON.parse(JSON.parse(await readFile(savePath, 'utf8')).world).characters[0].state;
    expect(stored.coins).toBe(0); expect(stored.chapter.equipment.offhand).toBe('yard-shield');
  } finally { client.socket.close(); await service.close(); server.stop(true); await rm(directory, { recursive: true }); }
});

test('parties require consent, enforce leadership and capacity, and share encounters across disconnect and restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'greywrought-party-'));
  const savePath = join(directory, 'world.json');
  const clients: Client[] = [];
  let service = await createWorldService({ savePath });
  let server!: Server<WorldSocketData>;
  const characters: LocalCharacter[] = ['Alden', 'Briar', 'Cedar', 'Dorian', 'Ember', 'Fern'].map((name, index) => ({ id: `party-${index}`, name, archetype: 'mage', createdAtMillis: index + 1 }));
  const tokens = characters.map(() => crypto.randomUUID());
  function listen() {
    const current = service;
    server = Bun.serve({ hostname: '127.0.0.1', port: 0, websocket: current.websocket, fetch: (request, host) => current.fetch(request, host) });
  }
  async function connect(index: number) {
    const client = new Client(`ws://127.0.0.1:${server.port}/world`); clients.push(client);
    await client.connect(characters[index]!, tokens[index]!); await client.state(); return client;
  }
  async function invite(from: Client, to: Client, recipient: number) {
    to.messages.length = 0;
    expect(await from.command({ type: 'partyInvite', playerId: characters[recipient]!.id })).toBe(true);
    return (await to.state(state => state.partyInvites.length > 0)).partyInvites[0]!.id;
  }
  try {
    listen();
    let alice = await connect(0), bob = await connect(1);
    const observer = await connect(2), fourth = await connect(3), fifth = await connect(4), sixth = await connect(5);
    expect(await alice.command({ type: 'partyInvite', playerId: 'absent' })).toBe(false);
    expect(await alice.invalid({ type: 'partyInvite', playerId: characters[1]!.id, actorId: characters[2]!.id })).toBe(false);
    let invitation = await invite(alice, bob, 1);
    expect((await bob.state(state => state.partyInvites.length > 0)).party).toBeNull();
    expect(await observer.command({ type: 'partyAccept', inviteId: invitation })).toBe(false);
    expect(await bob.command({ type: 'partyDecline', inviteId: invitation })).toBe(true);
    expect(await bob.command({ type: 'partyAccept', inviteId: invitation })).toBe(false);
    invitation = await invite(alice, bob, 1);
    expect(await bob.command({ type: 'partyAccept', inviteId: invitation })).toBe(true);
    expect((await alice.state(state => state.party?.members.length === 2)).party!.leaderId).toBe(characters[0]!.id);
    alice.messages.length = 0;
    expect(await bob.command({ type: 'action', action: 'forward', pressed: true })).toBe(true);
    bob.socket.close();
    const brieflyAway = await alice.state(state => state.party?.members.some(member => !member.online) === true);
    expect(brieflyAway.session.mode).toBe('shared');
    expect(brieflyAway.party!.members.every(member => member.sameEncounter)).toBe(true);
    await new Promise(resolve => setTimeout(resolve, 1000));
    bob = await connect(1);
    expect((await bob.state()).session.mode).toBe('shared');
    expect((await bob.state()).snapshot.player.moving).toBe(false);
    expect(alice.messages.filter((message): message is State => message.type === 'state').every(message => message.session.mode === 'shared')).toBe(true);
    expect(await bob.command({ type: 'partyInvite', playerId: characters[2]!.id })).toBe(false);
    expect(await bob.command({ type: 'partyKick', playerId: characters[0]!.id })).toBe(false);
    alice.messages.length = 0; bob.messages.length = 0;
    expect(await bob.command({ type: 'pause' })).toBe(true);
    const aPaused = await alice.state(state => state.session.mode === 'paused');
    const bPaused = await bob.state(state => state.session.mode === 'paused');
    expect(aPaused.session.id).toBe(bPaused.session.id);
    expect(aPaused.players.map(player => player.id)).toEqual([characters[1]!.id]);
    expect(aPaused.party!.members.every(member => member.sameEncounter)).toBe(true);
    expect(await bob.command({ type: 'partyLeave' })).toBe(false);
    expect(await alice.command({ type: 'partyKick', playerId: characters[1]!.id })).toBe(false);
    expect(await alice.command({ type: 'partyInvite', playerId: characters[2]!.id })).toBe(false);
    expect(await alice.command({ type: 'resume' })).toBe(true);
    await bob.state(state => state.session.mode === 'private');
    observer.messages.length = 0;
    expect((await observer.state()).session.mode).toBe('shared');
    alice.messages.length = 0;
    bob.socket.close();
    const droppedAt = performance.now();
    const grace = await alice.state(state => state.session.mode === 'private' && state.party?.members.some(member => !member.online) === true);
    expect(grace.session.id).toBe(aPaused.session.id);
    const disconnected = await alice.state(state => state.session.mode === 'paused' && state.party?.members.some(member => !member.online) === true, 7000);
    expect(performance.now() - droppedAt).toBeGreaterThanOrEqual(5000);
    expect(disconnected.players).toEqual([]);
    expect(await alice.command({ type: 'resume' })).toBe(true);
    alice.messages.length = 0;
    expect((await alice.state(state => state.session.mode === 'private')).players).toEqual([]);
    bob = await connect(1);
    expect((await bob.state()).session.id).toBe(aPaused.session.id);
    expect((await bob.state()).session.mode).toBe('private');
    await service.close(); server.stop(true);
    const saved = JSON.parse(await readFile(savePath, 'utf8'));
    expect(saved.parties).toHaveLength(1);
    expect(JSON.parse(saved.world).instances.filter((instance: { members: unknown[] }) => instance.members.length === 2)).toHaveLength(1);
    service = await createWorldService({ savePath }); listen();
    alice = await connect(0); bob = await connect(1);
    const restored = await alice.state();
    expect(restored.party!.members).toHaveLength(2);
    expect(restored.session.id).toBe(aPaused.session.id);
    expect(restored.session.mode).toBe('paused');
    expect(await bob.command({ type: 'rejoin' })).toBe(true);
    expect(await bob.command({ type: 'rejoin' })).toBe(true);
    expect(await alice.command({ type: 'rejoin' })).toBe(true);
    await alice.state(state => state.session.mode === 'shared');
    const remaining = [await connect(2), await connect(3), await connect(4), await connect(5)];
    for (const member of remaining) { expect(await member.command({ type: 'rejoin' })).toBe(true); expect(await member.command({ type: 'rejoin' })).toBe(true); }
    for (let index = 0; index < 3; index++) {
      const target = remaining[index]!;
      const id = await invite(alice, target, index + 2);
      expect(await target.command({ type: 'partyAccept', inviteId: id })).toBe(true);
    }
    expect(await alice.command({ type: 'partyInvite', playerId: characters[5]!.id })).toBe(false);
    expect(await alice.command({ type: 'partyKick', playerId: characters[4]!.id })).toBe(true);
    expect(await alice.command({ type: 'partyLeave' })).toBe(true);
    bob.messages.length = 0;
    expect((await bob.state(state => state.party?.leaderId === characters[1]!.id)).party!.members).toHaveLength(3);
    expect(await bob.command({ type: 'partyKick', playerId: characters[3]!.id })).toBe(true);
    expect(await bob.command({ type: 'partyLeave' })).toBe(true);
    remaining[0]!.messages.length = 0;
    expect((await remaining[0]!.state(state => state.party === null)).party).toBeNull();
    const expires = await invite(alice, remaining[3]!, 5);
    const originalNow = Date.now;
    try {
      const later = originalNow() + 61_000; Date.now = () => later;
      expect(await remaining[3]!.command({ type: 'partyAccept', inviteId: expires })).toBe(false);
    } finally { Date.now = originalNow; }
  } finally {
    for (const client of clients) client.socket.close();
    await service.close(); server?.stop(true);
    await rm(directory, { recursive: true, force: true });
  }
}, 15_000);

test('diving movement packets carry rise and dive through the authoritative socket', async()=>{
  const {createSharedAdventure}=await import('../game/adventure.js');
  const {supportHeight}=await import('../game/movement.js');
  const directory=await mkdtemp(join(tmpdir(),'greywrought-diving-')),savePath=join(directory,'world.json');
  const character:LocalCharacter={id:'diver',name:'Diver',archetype:'mage',createdAtMillis:1};
  const token=crypto.randomUUID(),seed=createSharedAdventure();seed.join(character.id,character.name,character.archetype);
  const saved=JSON.parse(seed.save());
  saved.characters[0].state.position={x:-27,y:supportHeight(-27,-95),z:-95};saved.characters[0].state.phase='expedition';
  for(const threat of saved.world.threats)if(threat.active)Object.assign(threat,{health:0,phase:'cleared',aggro:false,lootClaimed:true,respawnAt:Date.now()+120000});
  await writeFile(savePath,JSON.stringify({version:1,accounts:[{character,tokenHash:new Bun.CryptoHasher('sha256').update(token).digest('hex')}],world:JSON.stringify(saved),chat:[],nextChatId:1}));
  const service=await createWorldService({savePath});
  const server=Bun.serve({hostname:'127.0.0.1',port:0,websocket:service.websocket,fetch:(request,host)=>service.fetch(request,host)});
  const client=new Client(`ws://127.0.0.1:${server.port}/world`);
  const frames=(start:number,rise:boolean,dive:boolean)=>Array.from({length:20},(_,i)=>({sequence:start+i,seconds:.05,input:{forward:0,strafe:0,cameraX:0,cameraZ:1,jump:false,rise,dive}}));
  try{
    await client.connect(character,token);await client.state();
    expect(await client.invalid({type:'movement',frames:[{...frames(1,false,true)[0],input:{...frames(1,false,true)[0]!.input,dive:1}}]})).toBe(false);
    expect(await client.command({type:'movement',frames:frames(1,false,true)})).toBe(true);
    const deep=await client.state(s=>s.movement.sequence===20&&s.movement.elapsed>=.049);
    expect(deep.snapshot.player.position.y).toBeCloseTo(supportHeight(-27,-95)-2.2,4);
    expect(deep.snapshot.player.breathSeconds).toBeLessThan(60);
    expect(await client.command({type:'movement',frames:frames(21,true,false)})).toBe(true);
    const surface=await client.state(s=>s.movement.sequence===40&&s.movement.elapsed>=.049);
    expect(surface.snapshot.player.position.y).toBeCloseTo(supportHeight(-27,-95),4);
  }finally{client.socket.close();await service.close();server.stop(true);await rm(directory,{recursive:true});}
},10000);

test('party chat aliases stay private through pause, membership changes and restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'greywrought-party-chat-'));
  const savePath = join(directory, 'world.json');
  let service = await createWorldService({ savePath });
  let server!: Server<WorldSocketData>;
  const clients: Client[] = [];
  const characters: LocalCharacter[] = ['Alden', 'Briar', 'Cedar'].map((name, index) => ({ id: `chat-party-${index}`, name, archetype: 'mage', createdAtMillis: index + 1 }));
  const tokens = characters.map(() => crypto.randomUUID());
  function listen() {
    const current = service;
    server = Bun.serve({ hostname: '127.0.0.1', port: 0, websocket: current.websocket, fetch: (request, host) => current.fetch(request, host) });
  }
  async function connect(index: number) {
    const client = new Client(`ws://127.0.0.1:${server.port}/world`); clients.push(client);
    await client.connect(characters[index]!, tokens[index]!); await client.state(); return client;
  }
  try {
    listen();
    let first = await connect(0), second = await connect(1), outsider = await connect(2);
    expect(await outsider.command({ type: 'chat', text: '/party Nobody hears this' })).toBe(false);
    await outsider.wait(message => message.type === 'error' && message.text === 'You are not in a party.');
    expect(await first.command({ type: 'partyInvite', playerId: characters[1]!.id })).toBe(true);
    const invite = (await second.state(state => state.partyInvites.length > 0)).partyInvites[0]!;
    expect(await second.command({ type: 'partyAccept', inviteId: invite.id })).toBe(true);
    const partyId = (await first.state(state => state.party !== null)).party!.id;
    expect(await first.command({ type: 'chat', text: '/p Secret route' })).toBe(true);
    expect((await first.state(state => state.chat.some(entry => entry.text === 'Secret route'))).chat.at(-1)).toMatchObject({ partyId, text: 'Secret route' });
    await second.state(state => state.chat.some(entry => entry.text === 'Secret route'));
    expect(await first.command({ type: 'pause' })).toBe(true);
    expect(await second.command({ type: 'chat', text: '/party Wait here' })).toBe(true);
    await first.state(state => state.session.mode === 'paused' && state.chat.some(entry => entry.text === 'Wait here'));
    await second.state(state => state.chat.some(entry => entry.text === 'Wait here'));
    outsider.messages.length = 0;
    await outsider.state();
    expect(outsider.messages.some(message => message.type === 'state' && message.chat.some(entry => entry.partyId || entry.text.includes('Nobody hears')))).toBe(false);
    await service.close(); server.stop(true);
    service = await createWorldService({ savePath }); listen();
    first = await connect(0); second = await connect(1); outsider = await connect(2);
    expect((await first.state()).chat.filter(entry => entry.partyId).map(entry => entry.text)).toEqual(['Secret route', 'Wait here']);
    expect((await second.state()).chat.filter(entry => entry.partyId)).toHaveLength(2);
    expect((await outsider.state()).chat.some(entry => entry.partyId)).toBe(false);
    expect(await first.command({ type: 'rejoin' })).toBe(true);
    expect(await first.command({ type: 'rejoin' })).toBe(true);
    expect(await second.command({ type: 'rejoin' })).toBe(true);
    expect(await second.command({ type: 'partyLeave' })).toBe(true);
    second.messages.length = 0;
    expect((await second.state(state => state.party === null)).chat.some(entry => entry.partyId)).toBe(false);
    expect(await second.command({ type: 'chat', text: '/p No longer grouped' })).toBe(false);
    await second.wait(message => message.type === 'error' && message.text === 'You are not in a party.');
    expect(await outsider.command({ type: 'rejoin' })).toBe(true);
    expect(await outsider.command({ type: 'rejoin' })).toBe(true);
    expect(await first.command({ type: 'chat', text: 'Public greeting' })).toBe(true);
    await outsider.state(state => state.chat.some(entry => entry.text === 'Public greeting' && !entry.partyId));
  } finally {
    for (const client of clients) client.socket.close();
    await service.close(); server.stop(true); await rm(directory, { recursive: true });
  }
});

async function coordinationFixture(location: 'combat' | 'chest') {
  const { createSharedAdventure } = await import('../game/adventure.js');
  const directory = await mkdtemp(join(tmpdir(), 'greywrought-coordination-')), savePath = join(directory, 'world.json');
  const characters: LocalCharacter[] = ['Aster', 'Mira', 'Outside'].map((name, index) => ({ id: `coordination-${index}`, name, archetype: 'mage', createdAtMillis: index + 1 }));
  const token = crypto.randomUUID(), seed = createSharedAdventure();
  for (const character of characters) seed.join(character.id, character.name, character.archetype);
  const saved = JSON.parse(seed.save());
  for (const [index, entry] of saved.characters.entries()) {
    const x = location === 'chest' ? 77 + index : index === 2 ? -20 : -3 + index * 2, z = location === 'chest' ? -52 : index === 2 ? -10 : 28;
    Object.assign(entry.state, { phase: 'expedition', position: { x, y: terrainHeight(x, z), z }, coins: 0, potions: 0 });
  }
  for (const threat of saved.world.threats) {
    if (location === 'combat' && threat.id === 'scout') Object.assign(threat, { health: 5, phase: 'preparation', aggro: true, targetPlayerId: characters[0]!.id, combatants: characters.slice(0, 2).map(character => character.id), contributors: characters.slice(0, 2).map(character => character.id), position: { x: -3, y: terrainHeight(-3, 32), z: 32 } });
    else if (threat.active) Object.assign(threat, { health: 0, phase: 'cleared', lootClaimed: true, respawnAt: Date.now() + 3_600_000 });
  }
  if (location === 'combat') Object.assign(saved.clock, { phase: 'preparation', elapsedSeconds: 0, gatheringRemainingSeconds: 0 });
  await writeFile(savePath, JSON.stringify({ version: 1, accounts: characters.map(character => ({ character, tokenHash: new Bun.CryptoHasher('sha256').update(token).digest('hex') })), world: JSON.stringify(saved), chat: [], nextChatId: 1, parties: [{ id: 'coordination-party', leaderId: characters[0]!.id, members: characters.slice(0, 2).map(character => character.id) }] }));
  const service = await createWorldService({ savePath });
  const server = Bun.serve({ hostname: '127.0.0.1', port: 0, websocket: service.websocket, fetch: (request, host) => service.fetch(request, host) });
  const clients: Client[] = [];
  for (const character of characters) { const client = new Client(`ws://127.0.0.1:${server.port}/world`); clients.push(client); await client.connect(character, token); await client.state(); }
  return { clients, characters, close: async () => { for (const client of clients) client.socket.close(); await service.close(); server.stop(true); await rm(directory, { recursive: true }); } };
}

test('party coordination reports actual targets, readiness, scoped pings and each return confirmation', async () => {
  const fixture = await coordinationFixture('combat'), [first, second, outsider] = fixture.clients as [Client, Client, Client];
  try {
    await first.state(state => state.snapshot.combat.phase === 'preparation');
    expect(await first.command({ type: 'target', id: 'scout' })).toBe(true);
    expect(await first.invalid({ type: 'partyPing', position: { x: 99, y: 0, z: 99 } })).toBe(false);
    expect(await first.command({ type: 'partyPing' })).toBe(true);
    const pinged = await second.state(state => state.party!.pings.length === 1);
    expect(pinged.party!.pings[0]!.playerId).toBe(fixture.characters[0]!.id);
    expect(pinged.party!.pings[0]!.position).toEqual(pinged.players.find(player => player.id === fixture.characters[0]!.id)!.player.position);
    expect(pinged.party!.members[0]!.target).toEqual({ id: 'scout', name: pinged.snapshot.threats.find(threat => threat.id === 'scout')!.name });
    expect((await outsider.state()).party).toBeNull();
    expect(await outsider.command({ type: 'partyPing' })).toBe(false);
    expect(await first.command({ type: 'pause' })).toBe(true);
    const paused = await second.state(state => state.session.mode === 'paused');
    expect(paused.party!.pings).toEqual([]);
    expect(await first.command({ type: 'resume' })).toBe(true);
    expect(await first.command({ type: 'action', action: 'strike', pressed: true })).toBe(true);
    expect(await first.command({ type: 'action', action: 'strike', pressed: false })).toBe(true);
    expect(await first.command({ type: 'ready' })).toBe(true);
    const waiting = await second.state(state => state.party!.members[0]!.combat?.ready === true);
    expect(waiting.party!.members[1]!.combat?.ready).toBe(false);
    expect(await second.command({ type: 'ready' })).toBe(true);
    await first.state(state => state.session.mode === 'viewing', 12000);
    const viewing = await second.state(state => state.session.mode === 'viewing');
    expect(viewing.party!.members.map(member => member.returnStatus)).toEqual(['waiting', 'waiting']);
    expect(viewing.snapshot.carriedSalvage).toBe(0);
    expect(await first.command({ type: 'rejoin' })).toBe(true);
    const confirmed = await second.state(state => state.party!.members[0]!.returnStatus === 'confirmed');
    expect(confirmed.party!.members[1]!.returnStatus).toBe('waiting');
    expect(confirmed.session.mode).toBe('viewing');
    expect(await second.command({ type: 'rejoin' })).toBe(true);
    await first.state(state => state.session.mode === 'shared' && state.party!.members.every(member => member.returnStatus === null));
  } finally { await fixture.close(); }
}, 20000);

test('shared chest announces only the successful collector and keeps one shared claim', async () => {
  const fixture = await coordinationFixture('chest'), [first, second, outsider] = fixture.clients as [Client, Client, Client];
  try {
    for (const client of [first, second]) { expect(await client.command({ type: 'loot', id: 'ironback-chest' })).toBe(true); await client.state(state => state.snapshot.lootOpenId === 'ironback-chest'); }
    expect(await first.command({ type: 'action', action: 'takeLoot', pressed: true })).toBe(true);
    const collected = await second.state(state => state.chat.some(entry => entry.text.startsWith('collected ')));
    expect(collected.chat.filter(entry => entry.text.startsWith('collected '))).toHaveLength(1);
    expect(collected.chat.at(-1)).toMatchObject({ name: 'Aster', text: 'collected 18 copper, 2 health potions from Ironback Crab’s cache.' });
    expect(await second.command({ type: 'action', action: 'takeLoot', pressed: true })).toBe(true);
    expect(await first.command({ type: 'action', action: 'takeLoot', pressed: false })).toBe(true);
    expect(await first.command({ type: 'action', action: 'takeLoot', pressed: true })).toBe(true);
    second.messages.length = 0;
    const denied = await second.state();
    expect(denied.snapshot.coins).toBe(0); expect(denied.snapshot.potions).toBe(0);
    expect(denied.chat.filter(entry => entry.text.startsWith('collected '))).toHaveLength(1);
    outsider.messages.length = 0;
    expect((await outsider.state()).chat.filter(entry => entry.text.startsWith('collected '))).toHaveLength(1);
  } finally { await fixture.close(); }
}, 10000);
