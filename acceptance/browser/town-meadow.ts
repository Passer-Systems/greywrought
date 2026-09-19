import { check, openBrowser } from './session.js';

const port = '4381';
Bun.env.GREYWROUGHT_GAME_URL = `http://127.0.0.1:${port}/`;
Bun.env.GREYWROUGHT_DEBUG_PORT = '9581';
Bun.env.GREYWROUGHT_VULKAN = '1';
const server = Bun.spawn(['bun', 'run', 'dev'], {
  env: { ...Bun.env, GREYWROUGHT_PORT: port, GREYWROUGHT_LOCAL_WORLD: '1', GREYWROUGHT_WORLD_SAVE: `build/browser/town-meadow-${process.pid}.json` },
  stdout: Bun.file(`build/browser/town-meadow-${process.pid}-server.log`),
  stderr: Bun.file(`build/browser/town-meadow-${process.pid}-server-errors.log`),
});
let page: Awaited<ReturnType<typeof openBrowser>> | undefined;
try {
  for (let attempt = 0; attempt < 100; attempt++) {
    check(server.exitCode === null, 'Local server exited before startup');
    try { if ((await fetch(Bun.env.GREYWROUGHT_GAME_URL + 'health')).ok) break; } catch {}
    await Bun.sleep(100);
  }
  page = await openBrowser('town-meadow', { localOnly: true, beforeNavigate: async call => {
    await call('Page.addScriptToEvaluateOnNewDocument', { source: `
      const Native = WebSocket;
      window.WebSocket = class extends Native {
        constructor(...args) { super(...args); this.addEventListener('message', event => {
          const state = JSON.parse(event.data); if (state.type === 'state') window.routeState = state;
        }); }
      };` });
  } });
  await page.reload();
  await page.enter();
  await page.waitFor("window.routeState !== undefined");
  await page.waitFor('document.body.dataset.environmentState === "ready"');
  await page.shot('expanded-town');
  await page.key('KeyS', true);
  await page.waitFor('window.routeState.snapshot.player.position.z < -46', 20000);
  await page.key('KeyS', false);
  check(await page.evaluate('window.routeState.snapshot.phase === "expedition" && !window.routeState.snapshot.threats.some(t => t.aggro)'), 'Meadow must be outside town with no forest pursuit');
  check(await page.evaluate('document.getElementById("map-player").style.left === "50%"'), 'Map must follow the player');
  await page.shot('open-southern-meadow');
  await page.key('KeyW', true);
  await page.waitFor('window.routeState.snapshot.phase === "town"', 10000);
  await page.key('KeyW', false);
  check(await page.evaluate('window.routeState.snapshot.log.some(entry => entry.text.includes("You return to"))'), 'Crossing the town edge must extract');
  await page.key('KeyW', true);
  await page.waitFor('window.routeState.snapshot.player.position.z > 18', 12000);
  await page.key('KeyW', false);
  check(await page.evaluate('!window.routeState.snapshot.threats.some(t => t.aggro)'), 'North approach must stay quiet');
  await page.shot('quiet-north-road');
  await page.key('KeyW', true);
  await page.waitFor('window.routeState.snapshot.combat.phase === "preparation"', 8000);
  await page.key('KeyW', false);
  const before = await page.evaluate<number>('window.routeState.snapshot.player.position.z');
  await page.key('KeyS', true);
  await page.waitFor(`window.routeState.snapshot.player.position.z < ${before}`, 5000);
  await page.key('KeyS', false);
  check(await page.evaluate(`window.routeState.snapshot.player.position.z < ${before}`), 'Planning must permit movement');
  await page.click('#pause-toggle');
  await page.waitFor('document.body.dataset.encounterMode === "paused"');
  await page.shot('forest-private-fight');
  check(page.errors.length === 0, 'No browser exceptions');
  console.log('PASS expanded town, southern meadow, extraction, quiet north road, planning movement and private pause', page.output);
} finally {
  await page?.close(); server.kill('SIGTERM'); await server.exited;
}
