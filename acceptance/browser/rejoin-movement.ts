import type { AdventureSnapshot } from '../../src/game/adventure-types.js';
import { openBrowser, check } from './session.js';

Bun.env.GREYWROUGHT_GAME_URL = 'http://127.0.0.1:4289/';
Bun.env.GREYWROUGHT_DEBUG_PORT = '9489';
Bun.env.GREYWROUGHT_VULKAN = '1';
const server = Bun.spawn(['bun', 'scripts/dev-server.ts'], {
  env: { ...Bun.env, GREYWROUGHT_PORT: '4289', GREYWROUGHT_LOCAL_WORLD: '1', GREYWROUGHT_WORLD_SAVE: 'build/rejoin-movement-world.json' },
  stdout: Bun.file('build/rejoin-movement-server.log'),
  stderr: Bun.file('build/rejoin-movement-server-errors.log'),
});
let page: Awaited<ReturnType<typeof openBrowser>> | undefined;
try {
  for (let attempt = 0; attempt < 100; attempt++) {
    try { if ((await fetch(Bun.env.GREYWROUGHT_GAME_URL)).ok) break; } catch {}
    await Bun.sleep(100);
  }
  page = await openBrowser('rejoin-movement');
  await page.call('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.EventSource = class {};
    const Native = WebSocket;
    window.WebSocket = class extends Native {
      constructor(...args) {
        super(...args);
        this.addEventListener('message', event => {
          const data = JSON.parse(event.data);
          if (data.type === 'state') window.lastState = data;
        });
      }
      set onmessage(handler) {
        super.onmessage = event => setTimeout(() => handler.call(this, event), 150);
      }
    };` });
  await page.reload();
  await page.enter();
  await page.press('Escape');
  await page.waitFor('document.body.dataset.encounterMode === "paused"');
  await page.click('#pause-resume');
  await page.waitFor('document.body.dataset.encounterMode === "private"');
  // Accumulate enough old frame numbers to expose reuse after the server resets.
  await Bun.sleep(5000);
  console.log('Before rejoin', await page.evaluate('window.lastState.movement'));
  await page.click('#encounter-rejoin');
  check(await page.evaluate('document.getElementById("pause-panel").hidden'), 'Rejoining must keep the pause menu closed');
  await page.waitFor('document.body.dataset.encounterMode === "shared"');
  const start = await page.evaluate<AdventureSnapshot['player']['position']>('window.lastState.snapshot.player.position');
  await page.key('KeyS', true);
  await Bun.sleep(1000);
  await page.key('KeyS', false);
  const end = await page.evaluate<AdventureSnapshot['player']['position']>('window.lastState.snapshot.player.position');
  console.log(JSON.stringify({ start, end, checkpoint: await page.evaluate('window.lastState.movement') }));
  await page.shot('rejoin-motion');
  check(Math.hypot(end.x - start.x, end.z - start.z) > 1, 'Movement stalled after delayed rejoin');
  await Bun.sleep(400);
  check(await page.evaluate('document.body.dataset.rigAnimationMode === "idle"'), 'Animation stops after release');
  console.log('PASS delayed rejoin movement', page.output);
} finally {
  await page?.close();
  server.kill();
  await server.exited;
}
