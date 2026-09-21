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
  await page.click('#pause-toggle');
  await page.waitFor('document.body.dataset.encounterMode === "paused"');
  await page.click('#pause-resume');
  await page.waitFor('document.body.dataset.encounterMode === "private"');
  const forkPosition = await page.evaluate<AdventureSnapshot['player']['position']>('window.lastState.snapshot.player.position');
  await page.key('KeyS', true);
  await Bun.sleep(1000);
  await page.key('KeyS', false);
  // Accumulate enough old frame numbers to expose reuse after the server resets.
  await Bun.sleep(4000);
  const exitPosition = await page.evaluate<AdventureSnapshot['player']['position']>('window.lastState.snapshot.player.position');
  check(Math.hypot(exitPosition.x - forkPosition.x, exitPosition.z - forkPosition.z) > 1, 'Private travel must leave the fork location');
  console.log('Before rejoin', await page.evaluate('window.lastState.movement'));
  await page.click('#encounter-rejoin');
  check(await page.evaluate('document.getElementById("pause-panel").hidden'), 'Rejoining must keep the pause menu closed');
  await page.waitFor('document.body.dataset.encounterMode === "viewing"');
  check(await page.evaluate('document.getElementById("encounter-title").textContent === "Viewing main world"'), 'Return preview must clearly name the live world');
  check(await page.evaluate('document.body.dataset.gamePaused === "false" && document.querySelector("canvas[data-return-preview=active]") !== null'), 'Return preview must keep rendering');
  const preview = await page.evaluate('window.lastState.session.returnPlan');
  console.log('Return preview', preview);
  await page.key('KeyS', true); await Bun.sleep(500); await page.key('KeyS', false);
  check(await page.evaluate(`Math.hypot(window.lastState.snapshot.player.position.x-(${exitPosition.x}), window.lastState.snapshot.player.position.z-(${exitPosition.z})) < .001`), 'Viewing must not move the player');
  await page.shot('viewing-main-world');
  await page.click('#encounter-rejoin');
  await page.waitFor('document.body.dataset.encounterMode === "shared"');
  const start = await page.evaluate<AdventureSnapshot['player']['position']>('window.lastState.snapshot.player.position');
  check(Math.hypot(start.x - exitPosition.x, start.y - exitPosition.y, start.z - exitPosition.z) < .001, 'Rejoin keeps the current position instead of returning to the fork location');
  await page.key('KeyS', true);
  await Bun.sleep(1000);
  await page.key('KeyS', false);
  const end = await page.evaluate<AdventureSnapshot['player']['position']>('window.lastState.snapshot.player.position');
  console.log(JSON.stringify({ start, end, checkpoint: await page.evaluate('window.lastState.movement') }));
  await page.shot('rejoin-motion');
  check(Math.hypot(end.x - start.x, end.z - start.z) > 1, 'Movement stalled after delayed rejoin');
  await Bun.sleep(400);
  check(await page.evaluate('document.body.dataset.rigAnimationMode === "idle"'), 'Animation stops after release');
  await page.click('#pause-toggle');
  await page.waitFor('document.body.dataset.encounterMode === "paused"');
  await page.click('#pause-resume');
  await page.waitFor('document.body.dataset.encounterMode === "private"');
  await page.click('#encounter-rejoin');
  await page.waitFor('document.body.dataset.encounterMode === "viewing"');
  await page.waitFor('document.body.dataset.encounterMode === "shared"', 18000);
  check(await page.evaluate('document.querySelector("canvas[data-return-preview=hidden]") !== null'), 'Timer must clear return markers');
  const autoStart = await page.evaluate<AdventureSnapshot['player']['position']>('window.lastState.snapshot.player.position');
  await page.press('Backquote');
  await page.waitFor('document.body.dataset.autorunning === "true"');
  await page.press('KeyM');
  await Bun.sleep(650);
  const autoEnd = await page.evaluate<AdventureSnapshot['player']['position']>('window.lastState.snapshot.player.position');
  check(Math.hypot(autoEnd.x-autoStart.x,autoEnd.z-autoStart.z)>1,'Backtick autorun moves while the map is open');
  await page.press('Backquote');
  await page.waitFor('document.body.dataset.autorunning === "false"');
  await page.press('KeyM');
  await page.press('Backquote'); await page.press('KeyS');
  await page.waitFor('document.body.dataset.autorunning === "false"');
  console.log('PASS current-position rejoin and movement after delayed rejoin', page.output);
} finally {
  await page?.close();
  server.kill();
  await server.exited;
}
