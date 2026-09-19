import { check, openBrowser } from './session.js';
import { createWorldService, type WorldSocketData } from '../../src/server/world-service.js';

Bun.env.GREYWROUGHT_GAME_URL = 'http://127.0.0.1:4294/';
Bun.env.GREYWROUGHT_VULKAN = '1';
const savePath = `${process.cwd()}/build/browser/sit-world-${process.pid}.json`;
const service = await createWorldService({ savePath, allowedOrigins: ['http://127.0.0.1:4294'] });
const worldServer = Bun.serve<WorldSocketData>({ hostname: '127.0.0.1', port: 4197, fetch: (request, server) => service.fetch(request, server), websocket: service.websocket });
const frontend = Bun.spawn(['bun', 'scripts/dev-server.ts'], {
  env: { ...Bun.env, GREYWROUGHT_PORT: '4294', GREYWROUGHT_LOCAL_WORLD: '0' },
  stdout: Bun.file('build/browser/sit-frontend.log'), stderr: Bun.file('build/browser/sit-frontend-errors.log'),
});
Bun.env.GREYWROUGHT_DEBUG_PORT = '9443';
const routeWorld = `(() => { window.sitErrors=[]; const report=console.error; console.error=(...args)=>{window.sitErrors.push(args.map(arg=>arg?.stack??String(arg)).join(' '));report(...args);}; const Native = WebSocket; window.WebSocket = class extends Native { constructor(url, ...args) { super(String(url).includes('/world') ? 'ws://127.0.0.1:4197/world' : url, ...args); } }; })()`;
let first: Awaited<ReturnType<typeof openBrowser>> | undefined;
let second: Awaited<ReturnType<typeof openBrowser>> | undefined;
try {
  for (let attempt = 0; attempt < 100; attempt++) {
    try { if ((await fetch(Bun.env.GREYWROUGHT_GAME_URL)).ok) break; } catch {}
    await Bun.sleep(100);
  }
  first = await openBrowser('sit-first', { beforeNavigate: async call => { await call('Page.addScriptToEvaluateOnNewDocument', { source: routeWorld }); } });
  await first.enter();
  console.log('First player entered');
  Bun.env.GREYWROUGHT_DEBUG_PORT = '9444';
  second = await openBrowser('sit-second', { beforeNavigate: async call => { await call('Page.addScriptToEvaluateOnNewDocument', { source: routeWorld }); } });
  await second.waitFor('["account","creator","roster"].includes(document.body.dataset.entryRoute)');
  await second.evaluate(`(() => {
    document.getElementById('entry-display-name').value='Sit Companion';
    document.getElementById('entry-account-form').requestSubmit();
    document.querySelector('[data-entry-archetype="mage"]').click();
    document.getElementById('entry-character-name').value='Seated Mage';
    document.getElementById('entry-character-form').requestSubmit();
  })()`);
  await second.enter();
  console.log('Second player entered');
  await second.key('KeyA', true);
  await second.waitFor('Number(document.body.dataset.gamePlayerX) > 2');
  await second.key('KeyA', false);
  await first.waitFor('JSON.parse(document.body.dataset.gameRemotePlayers).length===1');
  await first.click('#chat-log-input');
  await first.call('Input.insertText', { text: '/sit' });
  await first.press('Enter');
  await first.waitFor('document.body.dataset.gamePlayerSitting === "true"');
  await second.waitFor('JSON.parse(document.body.dataset.gameRemotePlayers).some(p=>p.name==="Wayfarer"&&p.player.sitting)');
  await Bun.sleep(2000);
  await first.shot('seated');
  await second.shot('other-player-seated');
  await first.evaluate('document.activeElement.blur()');
  await first.key('KeyD', true);
  await first.waitFor('Number(document.body.dataset.gamePlayerX) < -0.25');
  await first.key('KeyD', false);
  await first.waitFor('document.body.dataset.gamePlayerSitting === "false"');
  await second.waitFor('JSON.parse(document.body.dataset.gameRemotePlayers).some(p=>p.name==="Wayfarer"&&!p.player.sitting)');
  await first.shot('stood-after-moving');
  check(first.errors.length === 0 && second.errors.length === 0, 'Sit browser journey must remain free of errors');
  console.log('PASS /sit local pose, remote visibility, and movement stand-up; '+first.output);
} catch (error) { console.error(await first?.evaluate('window.sitErrors')); await first?.shot('failure'); throw error; }
finally { await first?.close(); await second?.close(); await service.close(); worldServer.stop(true); frontend.kill(); await frontend.exited; }
