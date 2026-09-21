import { createSharedAdventure } from '../../src/game/adventure.js';
import { createWorldService, type WorldSocketData } from '../../src/server/world-service.js';
import { check, openBrowser } from './session.js';

const url = 'http://127.0.0.1:4485/';
Bun.env.GREYWROUGHT_GAME_URL = url;
Bun.env.GREYWROUGHT_DEBUG_PORT = '9685';
Bun.env.GREYWROUGHT_VULKAN = '1';
const character = { id: 'hearth-fixture', name: 'Homeward', archetype: 'warrior' as const, createdAtMillis: Date.now() };
const token = 'hearth-fixture-token-000000000000000000';
const seed = createSharedAdventure(); seed.join(character.id, character.name, character.archetype);
const saved = JSON.parse(seed.save());
Object.assign(saved.characters[0].state, { phase: 'expedition', position: { x: 0, y: 0, z: 10 }, cargo: 3, carriedSalvage: 2 });
for (const threat of saved.world.threats) if (threat.active) Object.assign(threat, { health: 0, phase: 'cleared', lootClaimed: true, respawnAt: Date.now() + 3_600_000 });
const savePath = `${process.cwd()}/build/browser/hearth-${process.pid}.json`;
await Bun.write(savePath, JSON.stringify({ version: 1, accounts: [{ character, tokenHash: new Bun.CryptoHasher('sha256').update(token).digest('hex') }], world: JSON.stringify(saved), chat: [], nextChatId: 1 }));
const service = await createWorldService({ savePath, allowedOrigins: [url.slice(0, -1)] });
const server = Bun.serve<WorldSocketData>({ hostname: '127.0.0.1', port: 4486, fetch: (request, host) => service.fetch(request, host), websocket: service.websocket });
const frontend = Bun.spawn(['bun', 'scripts/dev-server.ts'], { env: { ...Bun.env, GREYWROUGHT_PORT: '4485' }, stdout: Bun.file('build/browser/hearth-frontend.log'), stderr: Bun.file('build/browser/hearth-errors.log') });
let page: Awaited<ReturnType<typeof openBrowser>> | undefined;
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(url)).ok) break; } catch {} await Bun.sleep(100); }
  page = await openBrowser('hearthstone-hotbar', { beforeNavigate: async call => {
    await call('Network.enable'); await call('Network.setBlockedURLs', { urls: [url + '__dev/events'] });
    await call('Page.addScriptToEvaluateOnNewDocument', { source: `window.EventSource=class{close(){}};localStorage.setItem('greywrought/local-profile-v1',${JSON.stringify(JSON.stringify({ version: 1, displayName: 'Hearth Test', characters: [character], selectedCharacterId: character.id, savedAtMillis: Date.now() }))});localStorage.setItem('greywrought/world-token',${JSON.stringify(token)});const Native=WebSocket;window.WebSocket=class extends Native{constructor(url,...args){super(String(url).includes('/world')?'ws://127.0.0.1:4486/world':url,...args);this.addEventListener('message',event=>{const d=JSON.parse(event.data);if(d.type==='state')window.hearthState=d.snapshot;});}};` });
  } });
  await page.waitFor('document.body.dataset.entryRoute==="roster"');
  await page.click('#entry-enter-world');
  await page.waitFor('document.body.dataset.entryRoute==="world"&&document.body.dataset.rigState==="ready"&&window.hearthState.phase==="expedition"');
  const supplies = await page.evaluate<number>('window.hearthState.supplies');
  const browser = page;
  async function drag(source: string, target: string) {
    const points = await browser.evaluate<{ from: { x: number; y: number }; to: { x: number; y: number } }>(`(() => { const point = s => {const r=document.querySelector(s).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};};return {from:point(${JSON.stringify(source)}),to:point(${JSON.stringify(target)})};})()`);
    await browser.call('Input.setInterceptDrags', { enabled: true });
    await browser.call('Input.dispatchMouseEvent', { type: 'mouseMoved', ...points.from, buttons: 0 });
    await browser.call('Input.dispatchMouseEvent', { type: 'mousePressed', ...points.from, button: 'left', buttons: 1, clickCount: 1 });
    await browser.call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: points.from.x + 15, y: points.from.y, button: 'left', buttons: 1 });
    const fromBag = source.includes('bag-item');
    await browser.waitFor(fromBag ? 'document.getElementById("bag-details").hidden' : `document.querySelector(${JSON.stringify(source)}).classList.contains("action-dragging")`);
    for (const type of ['dragEnter', 'dragOver', 'drop']) await browser.call('Input.dispatchDragEvent', { type, ...points.to, data: { items: [{ mimeType: fromBag ? 'application/x-greywrought-usable-item' : 'text/plain', data: 'hearthstone' }], dragOperationsMask: 16 } });
    await browser.call('Input.dispatchMouseEvent', { type: 'mouseReleased', ...points.to, button: 'left', buttons: 0, clickCount: 1 });
    await browser.call('Input.setInterceptDrags', { enabled: false });
  }
  await page.click('#bag-open');
  await drag('[data-bag-item="hearthstone"]', '[data-action-slot="0"]');
  await page.waitFor(`document.querySelector('[data-action="hearthstone"]')?.dataset.actionSlot==="0"`);
  await drag('[data-action="hearthstone"]', '[data-action-slot="4"]');
  await page.waitFor(`document.querySelector('[data-action="hearthstone"]')?.dataset.actionSlot==="4"`);
  await page.press('Escape');
  await Bun.sleep(300);
  let useCount = 0;
  async function useStone() {
    if (++useCount === 2) await browser.press('Digit5');
    else await browser.click('[data-action="hearthstone"]');
    await browser.waitFor('window.hearthState.player.currentAction==="hearthstone"');
    await browser.waitFor(`document.querySelector('[data-action="hearthstone"]').disabled`);
  }
  await useStone();
  await page.waitFor('document.getElementById("player-action-name").textContent.includes("Returning")');
  await Bun.sleep(700);
  check(await page.evaluate('window.hearthState.phase==="expedition"&&window.hearthState.cargo===3'), 'Starting the cast neither teleports nor secures loot');
  await page.shot('return-cast');
  await page.press('Escape');
  await page.waitFor('window.hearthState.player.currentAction!=="hearthstone"');
  check(await page.evaluate('window.hearthState.phase==="expedition"'), 'Escape cancels Hearthstone');
  await useStone();
  await page.key('KeyD', true); await Bun.sleep(200); await page.key('KeyD', false);
  await page.waitFor('window.hearthState.player.currentAction!=="hearthstone"');
  check(await page.evaluate('window.hearthState.phase==="expedition"&&window.hearthState.cargo===3'), 'Moving cancels without teleporting or securing loot');
  await useStone();
  await page.waitFor('window.hearthState.phase==="town"', 8000);
  check(await page.evaluate(`window.hearthState.cargo===0&&window.hearthState.carriedSalvage===0&&window.hearthState.supplies===${supplies + 5}`), 'Completed cast returns and secures carried loot normally');
  await page.reload();
  await page.waitFor('document.body.dataset.entryRoute==="roster"'); await page.click('#entry-enter-world');
  await page.waitFor('document.body.dataset.entryRoute==="world"&&window.hearthState?.phase==="town"&&document.body.dataset.rigState==="ready"');
  check(await page.evaluate(`document.querySelector('[data-action="hearthstone"]')?.dataset.actionSlot==="4"`), 'Hearthstone slot persists after reload');
  check(await page.evaluate(`document.querySelectorAll("#adventure-actions > button").length===12&&["strike","brace","bait"].every(a=>document.querySelector('[data-action="'+a+'"]'))`), 'Original abilities and twelve slots remain');
  if (await page.evaluate('!document.getElementById("pause-panel").hidden')) await page.click('#pause-resume');
  await page.waitFor('document.getElementById("pause-panel").hidden');
  await page.click('#bag-open');
  check(await page.evaluate('document.querySelector(\'[data-bag-item="hearthstone"]\').dataset.quantity==="1"'), 'Hearthstone remains in the backpack after use and reload');
  await page.shot('home-with-hearthstone');
  check(page.errors.length === 0, 'No browser exceptions');
  console.log('PASS native Hearthstone drag, occupied-slot displacement, reorder, click, numeric hotkey, reload persistence, visible cast, Escape/movement cancellation, completed return, loot secured once, reusable after reload', page.output);
} catch (error) { console.error(error); await page?.shot('failure').catch(() => {}); throw error; }
finally { await page?.close(); await service.close(); server.stop(true); frontend.kill(); await frontend.exited; }
