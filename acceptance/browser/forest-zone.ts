import { check, openBrowser } from './session.js';

Bun.env.GREYWROUGHT_GAME_URL = 'http://127.0.0.1:4371/';
Bun.env.GREYWROUGHT_DEBUG_PORT = '9571';
Bun.env.GREYWROUGHT_VULKAN = '1';
const server = Bun.spawn([process.execPath, 'scripts/dev-server.ts'], {
  env: {...Bun.env, GREYWROUGHT_PORT: '4371', GREYWROUGHT_LOCAL_WORLD: '1', GREYWROUGHT_WORLD_SAVE: `build/browser/forest-zone-${process.pid}.json`},
  stdout: Bun.file(`build/browser/forest-zone-${process.pid}-server.log`), stderr: 'inherit',
});
let page: Awaited<ReturnType<typeof openBrowser>> | undefined;
try {
  for (let attempt = 0; attempt < 100; attempt++) {
    try { if ((await fetch(Bun.env.GREYWROUGHT_GAME_URL)).ok) break; } catch {}
    await Bun.sleep(100);
  }
  page = await openBrowser('forest-zone', {localOnly: true, beforeNavigate: async call => {
    await call('Page.addScriptToEvaluateOnNewDocument', {source: `const Native=WebSocket;window.WebSocket=class extends Native{constructor(...args){super(...args);this.addEventListener('message',event=>{const data=JSON.parse(event.data);if(data.type==='state')window.forestState=data.snapshot;});}};`});
  }});
  await page.enter();
  await page.waitFor('document.body.dataset.environmentState==="ready"&&document.body.dataset.creatureRigState==="ready"&&document.body.dataset.gameOnline==="true"');
  await page.key('KeyW', true);
  await page.waitFor('Number(document.body.dataset.gamePlayerZ)>15', 15000);
  await page.key('KeyW', false);
  check(await page.evaluate('!window.forestState.player.inCombat'), 'Town exit and approach stay clear of enemy aggro');
  await page.shot('woodland-approach');
  await page.key('KeyW', true);
  await page.waitFor('window.forestState.player.inCombat', 10000);
  await page.key('KeyW', false);
  check(await page.evaluate('window.forestState.threats.filter(t=>t.aggro).map(t=>t.id).join(",")==="scout"'), 'First encounter pulls only the Watchman');
  await page.click('.enemy-nameplate[data-enemy-id="scout"] .nameplate-target');
  await page.click('.adventure-actions [data-action="brace"]');
  await page.shot('isolated-watchman');
  await page.press('KeyR');
  await page.waitFor('window.forestState.combat.phase==="active"');
  await page.waitFor('window.forestState.combat.phase==="preparation"', 10000);
  check(await page.evaluate('window.forestState.threats.filter(t=>t.aggro).map(t=>t.id).join(",")==="scout"'), 'Bee and hound remain in their own clearings during the first turn');
  check(await page.evaluate('window.forestState.player.health>0'), 'The first encounter remains playable');
  check(page.errors.length === 0, 'No browser exceptions');
  console.log('PASS town exit, woodland approach, isolated Watchman, enemy selection and Defend turn', page.output);
} finally {
  await page?.key('KeyW', false).catch(() => {}); await page?.close(); server.kill(); await server.exited;
}
