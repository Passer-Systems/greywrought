import { afterEach, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createWorldService } from '../server/world-service.js';
import { createSharedAdventure } from '../game/adventure.js';
import { GameTools, toolDefinitions, valid } from './tools.js';
import { GameClient, delay } from './client.js';
import { loadProfile, worldUrl } from './profile.js';
import { McpServer } from './protocol.js';

const cleanup: (() => void | Promise<void>)[] = [];
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close(); });
async function directory() { await mkdir('build/mcp', { recursive: true }); return mkdtemp(resolve('build/mcp/test-')); }
async function localWorld(saved?: string) {
  const dir = await directory(), savePath = dir + '/world.json';
  if (saved) await writeFile(savePath, saved);
  const service = await createWorldService({ savePath });
  const server = Bun.serve({ hostname: '127.0.0.1', port: 0, websocket: service.websocket, fetch: (request, host) => service.fetch(request, host) ?? new Response('Missing', { status: 404 }) });
  cleanup.push(async () => { await service.close(); server.stop(true); });
  return { dir, url: `ws://127.0.0.1:${server.port}/world` };
}
function tools(dir: string, url: string) {
  const game = new GameTools({ url, profilePath: dir + '/player.json', name: 'Codex', archetype: 'mage' });
  cleanup.push(() => game.close()); return game;
}
async function until(check: () => boolean, milliseconds = 5000) {
  const deadline = Date.now() + milliseconds;
  while (!check()) { if (Date.now() > deadline) throw new Error('Condition timed out'); await delay(30); }
}

test('saved agent identity is private, persistent, endpoint-bound, and never replaces invalid data', async () => {
  const dir = await directory(), path = dir + '/player.json', url = worldUrl('https://play.greywrought.com');
  const first = await loadProfile(path, url);
  expect(await loadProfile(path, url)).toEqual(first);
  expect((await stat(path)).mode & 0o777).toBe(0o600);
  expect(url).toBe('wss://play.greywrought.com/world');
  await expect(loadProfile(path, worldUrl('http://127.0.0.1:4181'))).rejects.toThrow('another world');
  await expect(loadProfile(path, url, 'Another')).rejects.toThrow('differs');
  expect(await loadProfile(path, url)).toEqual(first);
  await writeFile(path, '{broken');
  await expect(loadProfile(path, url)).rejects.toThrow('preserved');
  expect(await readFile(path, 'utf8')).toBe('{broken');
  expect(() => worldUrl('https://name:secret@example.com')).toThrow();
});

test('tool schemas reject held controls, extra properties, out-of-bounds destinations and long movement', () => {
  const schema = (name: string) => toolDefinitions.find(t => t.name === name)!.inputSchema;
  expect(valid(schema('move'), { x: 0, z: 1, seconds: 100 })).toBe(false);
  expect(valid(schema('move'), { x: 0, z: 1, seconds: .2 })).toBe(true);
  expect(valid(schema('act'), { action: 'forward' })).toBe(false);
  expect(valid(schema('command'), { command: { type: 'movement', frames: [] } })).toBe(false);
  expect(valid(schema('command'), { command: { type: 'bait', destination: { x: 999, z: 0 } } })).toBe(false);
  expect(valid(schema('command'), { command: { type: 'ready', force: true } })).toBe(false);
  expect(valid(schema('command'), { command: { type: 'equip', slot: 'chest', item: null } })).toBe(true);
});

test('MCP negotiation, discovery, errors and observation do not join or create a character', async () => {
  const dir = await directory(), game = tools(dir, worldUrl());
  const replies: any[] = [], protocol = new McpServer(game, reply => replies.push(reply));
  protocol.receive('{'); expect(replies.pop().error.code).toBe(-32700);
  protocol.receive(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' })); expect(replies.pop().error.code).toBe(-32002);
  protocol.receive(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } } }));
  expect(replies.pop().result.protocolVersion).toBe('2025-06-18');
  protocol.receive(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }));
  protocol.receive(JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/list' })); expect(replies.pop().result.tools.length).toBe(8);
  protocol.receive(JSON.stringify({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'observe' } })); await protocol.settled();
  expect(replies.pop().result.structuredContent.connected).toBe(false);
  expect(await Bun.file(dir + '/player.json').exists()).toBe(false);
  protocol.receive(JSON.stringify({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'act', arguments: { action: 'forward' } } })); await protocol.settled();
  expect(replies.pop().result.isError).toBe(true);
  protocol.receive(JSON.stringify({ jsonrpc: '2.0', id: 6, method: 'unknown' })); expect(replies.pop().error.code).toBe(-32601);
  protocol.close();
});

test('real server movement stops, cancellation releases controls, sessions and reconnect preserve identity', async () => {
  const { dir, url } = await localWorld(), game = tools(dir, url);
  await game.call('connect', {});
  const initial = game.client.current.snapshot.player.position;
  await game.call('move', { x: 0, z: 1, seconds: .2 });
  const moved = game.client.current.snapshot.player.position;
  expect(moved.z).toBeGreaterThan(initial.z + .3);
  await game.call('wait', { seconds: .2 });
  expect(game.client.current.snapshot.player.position.z).toBeCloseTo(moved.z, 3);
  const abort = new AbortController();
  const move = game.call('move', { x: 1, z: 0, seconds: 3 }, abort.signal);
  await delay(100); abort.abort(); await expect(move).rejects.toThrow('cancelled');
  await game.client.fresh(); const stopped = game.client.current.snapshot.player.position;
  await delay(200); await game.client.fresh(); expect(game.client.current.snapshot.player.position).toEqual(stopped);
  await game.call('command', { command: { type: 'pause' } });
  expect(game.client.current.session.mode).toBe('paused');
  await expect(game.call('move', { x: 1, z: 0, seconds: 1 })).rejects.toThrow('unavailable');
  await game.call('command', { command: { type: 'resume' } }); expect(game.client.current.session.mode).toBe('private');
  await game.call('command', { command: { type: 'rejoin' } }); expect(game.client.current.session.mode).toBe('shared');
  const identity = JSON.parse(await readFile(dir + '/player.json', 'utf8'));
  expect(JSON.stringify(game.observe(true))).not.toContain(identity.token);
  await game.call('disconnect', {}); await delay(100);
  await game.call('connect', {});
  expect(JSON.parse(await readFile(dir + '/player.json', 'utf8'))).toEqual(identity);
  expect(game.client.current.snapshot.player.position).toEqual(stopped);
}, 15000);

test('a second client cannot take over the same character', async () => {
  const { dir, url } = await localWorld(), profile = await loadProfile(dir + '/player.json', url);
  const first = new GameClient(), second = new GameClient(); cleanup.push(() => first.disconnect(), () => second.disconnect());
  await first.connect(profile);
  await expect(second.connect(profile)).rejects.toThrow('already playing');
  expect(first.connected).toBe(true);
});

test('combat targeting, preview, queued attack, ready and resulting health use authoritative game rules', async () => {
  const dir = await directory(), character = { id: crypto.randomUUID(), name: 'Codex', archetype: 'mage' as const, createdAtMillis: 1 }, token = crypto.randomUUID() + crypto.randomUUID();
  const world = createSharedAdventure(); world.join(character.id, character.name, character.archetype);
  const save = JSON.parse(world.save());
  Object.assign(save.characters[0].state, { phase: 'expedition', position: { x: -3, y: 0, z: 28 } });
  for (const threat of save.world.threats) {
    if (threat.id === 'scout') { threat.position = { x: -1, y: 0, z: 30 }; threat.targetPosition = { ...threat.position }; }
    else if (threat.active) Object.assign(threat, { health: 0, phase: 'cleared', lootClaimed: true, respawnAt: Date.now() + 3_600_000 });
  }
  const server = await localWorld(JSON.stringify({ version: 1, accounts: [{ character, tokenHash: new Bun.CryptoHasher('sha256').update(token).digest('hex') }], world: JSON.stringify(save), chat: [], nextChatId: 1 }));
  await writeFile(dir + '/player.json', JSON.stringify({ version: 1, worldUrl: server.url, character, token }), { mode: 0o600 });
  const game = tools(dir, server.url); await game.call('connect', {});
  await until(() => game.client.current.snapshot.combat.phase === 'preparation');
  await game.call('command', { command: { type: 'target', id: 'scout' } });
  const forecast = await game.call('command', { command: { type: 'previewBait', destination: { x: -3, z: 27 } } }) as { forecast: unknown };
  expect(forecast).toHaveProperty('forecast');
  await game.call('act', { action: 'strike' });
  expect(game.client.current.snapshot.combat.queued.some(q => q.action === 'strike')).toBe(true);
  const before = game.client.current.snapshot.threats.find(t => t.id === 'scout')!.health;
  await game.call('command', { command: { type: 'ready' } });
  await until(() => game.client.current.snapshot.combat.phase === 'preparation');
  expect(game.client.current.snapshot.threats.find(t => t.id === 'scout')!.health).toBeLessThan(before);
}, 15000);

test('stdio subprocess supports discovery and a live local move; EOF disconnects its character', async () => {
  const { dir, url } = await localWorld();
  const child = Bun.spawn([process.execPath, 'scripts/greywrought-mcp.ts'], {
    env: { ...Bun.env, GREYWROUGHT_MCP_WORLD: url, GREYWROUGHT_MCP_PROFILE: dir + '/stdio.json' }, stdin: 'pipe', stdout: 'pipe', stderr: 'pipe',
  });
  cleanup.push(() => { child.kill(); });
  const replies = new Map<number, any>();
  const reading = (async () => {
    let buffer = ''; const decoder = new TextDecoder();
    const output = child.stdout.getReader();
    while (true) {
      const { value: chunk, done } = await output.read(); if (done) break;
      buffer += decoder.decode(chunk, { stream: true }); let index;
      while ((index = buffer.indexOf('\n')) >= 0) { const reply = JSON.parse(buffer.slice(0, index)); buffer = buffer.slice(index + 1); replies.set(reply.id, reply); }
    }
    output.releaseLock();
  })();
  const send = (message: object) => { child.stdin.write(JSON.stringify(message) + '\n'); child.stdin.flush(); };
  const response = async (id: number) => { await until(() => replies.has(id)); return replies.get(id); };
  send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'Codex-test', version: '1' } } });
  expect((await response(1)).result.serverInfo.name).toBe('greywrought');
  send({ jsonrpc: '2.0', method: 'notifications/initialized' });
  send({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'connect', arguments: {} } });
  expect((await response(2)).result.structuredContent.connected).toBe(true);
  send({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'move', arguments: { x: 0, z: 1, seconds: 3 } } });
  await delay(150);
  send({ jsonrpc: '2.0', method: 'notifications/cancelled', params: { requestId: 3 } });
  expect((await response(3)).result.isError).toBe(true);
  send({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'move', arguments: { x: 1, z: 0, seconds: 3 } } });
  await delay(100);
  child.stdin.end(); expect(await child.exited).toBe(0); await reading;
  const healthUrl = url.replace('ws:', 'http:').replace('/world', '/health');
  await delay(100); expect((await (await fetch(healthUrl)).json() as { players: number }).players).toBe(0);
}, 15000);
