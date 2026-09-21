import { mkdir } from 'node:fs/promises';
import { createServer, createConnection, type Socket } from 'node:net';
import { createSharedAdventure } from '../../src/game/adventure.js';
import { terrainHeight } from '../../src/game/cave-layout.js';
import type { LocalCharacter } from '../../src/host/character-profile.js';
import type { ServerWorldMessage, WorldCommand } from '../../src/game/multiplayer-types.js';

type State = Extract<ServerWorldMessage, { type: 'state' }>;
const output = `${process.cwd()}/build/server-performance/${Bun.env.GREYWROUGHT_PERFORMANCE_LABEL ?? 'profile'}-${process.pid}`;
await mkdir(output, { recursive: true });
function check(value: unknown, message: string): asserts value { if (!value) throw Error(message); }
function stats(values: number[]) {
  values.sort((a, b) => a - b);
  return { count: values.length, median: values[Math.floor(values.length * .5)], p95: values[Math.floor(values.length * .95)], max: values.at(-1) };
}
class Client {
  socket: WebSocket;
  state: State | undefined;
  sequence = 0;
  movementSequence = 0;
  samples: { time: number; bytes: number; serverTime: number; phase: string; payload: string }[] = [];
  latency: number[] = [];
  pending = new Map<number, { start: number; resolve: (accepted: boolean) => void }>();
  errors: string[] = [];
  constructor(readonly character: LocalCharacter, readonly token: string) {
    this.socket = new WebSocket('ws://127.0.0.1:4303/world');
    this.socket.onopen = () => this.socket.send(JSON.stringify({ type: 'join', character, token }));
    this.socket.onmessage = event => {
      const data = String(event.data), message = JSON.parse(data) as ServerWorldMessage;
      if (message.type === 'error') this.errors.push(message.text);
      if (message.type === 'state') {
        this.state = message;
        this.samples.push({ time: performance.now(), bytes: Buffer.byteLength(data), serverTime: message.serverTime, phase: message.snapshot.combat.phase, payload: data });
      }
      if (message.type === 'result') {
        const waiting = this.pending.get(message.sequence);
        if (waiting) { this.latency.push(performance.now() - waiting.start); waiting.resolve(message.accepted); this.pending.delete(message.sequence); }
      }
    };
  }
  command(command: WorldCommand): Promise<boolean> {
    const sequence = ++this.sequence;
    return new Promise(resolve => { this.pending.set(sequence, { start: performance.now(), resolve }); this.socket.send(JSON.stringify({ type: 'command', sequence, command })); });
  }
  move() {
    return this.command({ type: 'movement', frames: Array.from({ length: 3 }, () => ({ sequence: ++this.movementSequence, seconds: 1 / 60, input: { forward: 1, strafe: 0, cameraX: 0, cameraZ: 1, jump: false } })) });
  }
}
const results: unknown[] = [];
for (const count of [1, 5]) for (const combat of [false, true]) {
  const scenario = `${count}-${combat ? 'combat' : 'exploring'}`;
  const characters = Array.from({ length: count }, (_, i): LocalCharacter => ({ id: `server-profile-${i}`, name: `Profiler ${String.fromCharCode(65 + i)}`, archetype: 'warrior', createdAtMillis: 1 }));
  const token = 'server-performance-token-00000000000000000';
  const seed = createSharedAdventure(); for (const c of characters) seed.join(c.id, c.name, c.archetype);
  const saved = JSON.parse(seed.save());
  for (const [index, character] of saved.characters.entries()) {
    const x = combat ? -7.5 + index * .1 : index * .15, z = combat ? 27.5 : -35;
    Object.assign(character.state, { phase: combat ? 'expedition' : 'town', position: { x, y: terrainHeight(x, z), z } });
  }
  for (const [index, threat] of saved.world.threats.entries()) threat.rng = 1000 + index;
  const savePath = `${output}/${scenario}-world.json`;
  await Bun.write(savePath, JSON.stringify({ version: 1, accounts: characters.map(character => ({ character, tokenHash: new Bun.CryptoHasher('sha256').update(token).digest('hex') })), world: JSON.stringify(saved), chat: [], nextChatId: 1 }));
  const server = Bun.spawn([process.execPath, '--cpu-prof', `--cpu-prof-dir=${output}`, `--cpu-prof-name=${scenario}.cpuprofile`, 'acceptance/server/performance-host.ts', savePath], {
    stdout: Bun.file(`${output}/${scenario}.log`), stderr: Bun.file(`${output}/${scenario}-errors.log`),
  });
  const clients: Client[] = [];
  const connections = new Set<Socket>();
  let wireBytes = 0;
  const proxy = createServer(socket => {
    const upstream = createConnection({ host: '127.0.0.1', port: 4302 });
    connections.add(socket); connections.add(upstream);
    upstream.on('data', data => { wireBytes += data.length; });
    socket.pipe(upstream).pipe(socket);
    socket.on('close', () => { connections.delete(socket); upstream.destroy(); });
    upstream.on('close', () => { connections.delete(upstream); socket.destroy(); });
  });
  await new Promise<void>(resolve => proxy.listen(4303, '127.0.0.1', resolve));
  let movement: ReturnType<typeof setInterval> | undefined;
  try {
    for (let i = 0; i < 100; i++) { try { if ((await fetch('http://127.0.0.1:4302/health')).ok) break; } catch {} await Bun.sleep(50); }
    for (const character of characters) clients.push(new Client(character, token));
    async function wait(condition: () => boolean, message: string) {
      const until = performance.now() + 5000;
      while (!condition() && performance.now() < until) await Bun.sleep(20);
      check(condition(), message);
    }
    await wait(() => clients.every(c => c.state), 'All players must join');
    if (combat) await wait(() => clients.every(c => c.state?.snapshot.combat.phase === 'preparation'), 'Combat fixture must enter planning');
    async function measure(phase: string, action: () => Promise<void>) {
      for (const client of clients) { client.samples = []; client.latency = []; }
      const before = await (await fetch('http://127.0.0.1:4302/metrics')).json();
      wireBytes = 0;
      const start = performance.now(); await action(); const seconds = (performance.now() - start) / 1000;
      const wireBytesPerSecond = wireBytes / seconds;
      const after = await (await fetch('http://127.0.0.1:4302/metrics')).json();
      const players = clients.map(client => ({
        states: client.samples.length, bytesPerSecond: client.samples.reduce((sum, s) => sum + s.bytes, 0) / seconds,
        stateBytes: stats(client.samples.map(s => s.bytes)), stateCadenceMs: stats(client.samples.slice(1).map((s, i) => s.time - client.samples[i]!.time)),
        serverTickMs: stats(client.samples.slice(1).map((s, i) => (s.serverTime - client.samples[i]!.serverTime) * 1000)), commandLatencyMs: stats(client.latency),
        phases: [...new Set(client.samples.map(s => s.phase))], position: client.state?.snapshot.player.position,
        extensions: client.socket.extensions,
      }));
      const firstClient = clients[0]!;
      const latest = JSON.parse(firstClient.samples.at(-1)!.payload) as State;
      const sections = Object.fromEntries(Object.entries(latest.snapshot).map(([key, value]) => [key, Buffer.byteLength(JSON.stringify(value))]));
      let totalThreatFieldBytes = 0, repeatedThreatFieldBytes = 0;
      for (let index = 1; index < firstClient.samples.length; index++) {
        const previous = JSON.parse(firstClient.samples[index - 1]!.payload) as State;
        const current = JSON.parse(firstClient.samples[index]!.payload) as State;
        for (const threat of current.snapshot.threats) {
          const old = previous.snapshot.threats.find(candidate => candidate.id === threat.id)!;
          for (const key of Object.keys(threat) as (keyof typeof threat)[]) {
            const bytes = Buffer.byteLength(JSON.stringify({ [key]: threat[key] })) - 2;
            totalThreatFieldBytes += bytes;
            if (JSON.stringify(old[key]) === JSON.stringify(threat[key])) repeatedThreatFieldBytes += bytes;
          }
        }
      }
      const cpuMs = (after.cpu.user - before.cpu.user + after.cpu.system - before.cpu.system) / 1000;
      const result = { scenario, phase, seconds, cpuMs, oneCorePercent: cpuMs / (seconds * 10), wireBytesPerSecond, snapshotSectionBytes: sections,
        repeatedThreatFieldFraction: repeatedThreatFieldBytes / totalThreatFieldBytes, heapBefore: before.memory, heapAfter: after.memory, players };
      results.push(result); console.log(JSON.stringify(result));
      await Bun.write(`${output}/summary.json`, JSON.stringify(results, null, 2));
    }
    if (!combat) {
      movement = setInterval(() => { for (const client of clients) void client.move(); }, 50);
      await measure('running', () => Bun.sleep(6000));
      clearInterval(movement); movement = undefined;
      check(clients.every(c => c.state!.snapshot.player.position.z > -10), 'Explorers must actually run');
    } else {
      await measure('planning', async () => {
        for (let i = 0; i < 20; i++) { await Promise.all(clients.map(c => c.command({ type: 'target', id: 'scout' }))); await Bun.sleep(200); }
      });
      await measure('executing', async () => {
        for (let round = 0; round < 3; round++) {
          await Promise.all(clients.map(c => c.command({ type: 'action', action: 'brace', pressed: true })));
          await Promise.all(clients.map(c => c.command({ type: 'action', action: 'brace', pressed: false })));
          await Promise.all(clients.map(c => c.command({ type: 'ready' })));
          await wait(() => clients.some(c => c.state?.snapshot.combat.phase === 'active'), 'Combat must execute');
          await wait(() => clients.every(c => c.state?.snapshot.combat.phase === 'preparation'), 'Combat must return to planning');
        }
      });
    }
    check(clients.every(c => c.errors.length === 0), `Server errors: ${clients.flatMap(c => c.errors).join('; ')}`);
  } finally {
    clearInterval(movement); for (const client of clients) client.socket.close();
    for (const connection of connections) connection.destroy();
    await new Promise<void>(resolve => proxy.close(() => resolve()));
    server.kill('SIGTERM'); await server.exited;
  }
}
console.log('PASS actual websocket 1/5-player exploration, planning, execution, latency, bytes, server-only CPU/heap', output);
