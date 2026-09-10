import { mkdir } from 'node:fs/promises';
import type { ServerWorldMessage } from '../../src/game/multiplayer-types.js';
import { check, openBrowser } from './session.js';

type State = Extract<ServerWorldMessage, { type: 'state' }>;
type Browser = Awaited<ReturnType<typeof openBrowser>>;
const url = 'http://127.0.0.1:4291/';
const savePath = `build/browser/offline-demo-${process.pid}.json`;
await mkdir('build/browser', { recursive: true });
Bun.env.GREYWROUGHT_GAME_URL = url;
Bun.env.GREYWROUGHT_VULKAN = '1';
function startServer() {
  return Bun.spawn(['bun', 'run', 'demo'], {
    env: { ...Bun.env, GREYWROUGHT_PORT: '4291', GREYWROUGHT_WORLD_SAVE: savePath },
    stdout: Bun.file(`build/browser/offline-demo-${process.pid}-server.log`),
    stderr: Bun.file(`build/browser/offline-demo-${process.pid}-server-errors.log`),
  });
}
let server = startServer();
const pages: Browser[] = [];
async function ready() {
  for (let attempt = 0; attempt < 100; attempt++) {
    check(server.exitCode === null, 'Offline demo server exited before becoming ready');
    try { if ((await fetch(url + 'health')).ok) return; } catch {}
    await Bun.sleep(100);
  }
  throw new Error('Offline demo server did not become ready');
}
const state = (page: Browser) => page.evaluate<State>('window.demoState');
const remoteCount = (page: Browser, count: number) => page.waitFor(`window.demoState.players.length === ${count}`);
async function move(page: Browser) {
  const start = (await state(page)).snapshot.player.position;
  await page.key('KeyS', true);
  try {
    await page.waitFor(`Math.hypot(window.demoState.snapshot.player.position.x - (${start.x}), window.demoState.snapshot.player.position.z - (${start.z})) > 0.7`);
  } finally { await page.key('KeyS', false); }
  await page.waitFor('document.body.dataset.rigAnimationMode === "idle"');
}
try {
  await ready();
  const html = await (await fetch(url)).text();
  check(!html.includes('wss://play.greywrought.com/world'), 'Offline demo must not point at the public world');
  for (let index = 0; index < 2; index++) {
    Bun.env.GREYWROUGHT_DEBUG_PORT = String(9491 + index);
    const page = await openBrowser(`offline-demo-${index}`, {
      localOnly: true,
      beforeNavigate: async call => {
        await call('Page.addScriptToEvaluateOnNewDocument', { source: `
          const Native = WebSocket;
          window.WebSocket = class extends Native {
            constructor(...args) {
              super(...args);
              window.demoSocket = this;
              this.addEventListener('message', event => {
                const message = JSON.parse(event.data);
                if (message.type === 'state') window.demoState = message;
              });
            }
          };` });
      },
    });
    pages.push(page);
    await page.enter();
    check(await page.evaluate('window.demoSocket.url') === 'ws://127.0.0.1:4291/world', 'Each client must connect to the local server');
  }
  const [first, second] = pages as [Browser, Browser];
  await remoteCount(first, 1);
  await remoteCount(second, 1);
  check((await (await fetch(url + 'health')).json()).players === 2, 'Both independent clients must share the local server');
  await first.press('Enter');
  const greeting = 'Offline companions ' + process.pid;
  await first.call('Input.insertText', { text: greeting });
  await first.press('Enter');
  await second.waitFor(`window.demoState.chat.some(message => message.text === ${JSON.stringify(greeting)})`);
  await first.evaluate('document.activeElement.blur()');
  await move(first);
  const firstPosition = (await state(first)).snapshot.player.position;
  await second.waitFor(`Math.abs(window.demoState.players[0].player.position.z - (${firstPosition.z})) < 0.1`);

  await first.evaluate('window.demoSocket.close()');
  await first.waitFor('document.body.dataset.gamePersistence === "disconnected"');
  await remoteCount(second, 0);
  await first.waitFor('document.body.dataset.gamePersistence === "server" && document.body.dataset.encounterMode === "paused"');
  const frozen = await state(first);
  await move(second);
  check(JSON.stringify((await state(first)).snapshot) === JSON.stringify(frozen.snapshot), 'Disconnected player must stay frozen while the other client moves');
  check((await state(first)).players.length === 0, 'The paused private zone must exclude the other client');
  await first.click('#pause-resume');
  await first.waitFor('document.body.dataset.encounterMode === "private"');
  await move(first);
  await remoteCount(second, 0);
  await first.click('#encounter-rejoin');
  await first.waitFor('document.body.dataset.encounterMode === "shared"');
  await remoteCount(first, 1);
  await remoteCount(second, 1);
  await move(first);
  await second.waitFor('window.demoState.players[0].player.moving === false');
  await first.shot('local-rejoin');

  const positions = await Promise.all(pages.map(async page => (await state(page)).snapshot.player.position));
  server.kill('SIGTERM');
  check(await server.exited === 0, 'Local demo must save and shut down cleanly');
  for (const page of pages) await page.waitFor('document.body.dataset.gamePersistence === "disconnected"');
  check(await Bun.file(savePath).exists(), 'Local progress must be saved on shutdown');
  server = startServer();
  await ready();
  for (let index = 0; index < pages.length; index++) {
    const page = pages[index]!;
    await page.waitFor('document.body.dataset.gamePersistence === "server" && document.body.dataset.encounterMode === "paused"');
    const restored = await state(page);
    check(JSON.stringify(restored.snapshot.player.position) === JSON.stringify(positions[index]), 'Restart must preserve each player position');
    await page.click('#pause-resume');
    await page.waitFor('document.body.dataset.encounterMode === "private"');
    await page.click('#encounter-rejoin');
    await page.waitFor('document.body.dataset.encounterMode === "shared"');
  }
  for (const page of pages) {
    await remoteCount(page, 1);
    check(page.errors.length === 0, 'Local demo must have no browser exceptions');
    const external = page.requests.filter(request => {
      const parsed = new URL(request);
      return ['http:', 'https:', 'ws:', 'wss:'].includes(parsed.protocol) && parsed.hostname !== '127.0.0.1';
    });
    check(external.length === 0, `Offline demo requested external resources: ${external.join(', ')}`);
    check(page.requests.some(request => request.endsWith('/world')), 'Browser network capture must include the world connection');
  }
  console.log('PASS offline built client, two independent browsers, local movement/chat, disconnect isolation, explicit resume/rejoin, movement after rejoin, saved restart, no external resource requests');
} finally {
  for (const page of pages) await page.close();
  server.kill('SIGTERM');
  await server.exited;
}
