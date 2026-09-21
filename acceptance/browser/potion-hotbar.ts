import { createSharedAdventure } from '../../src/game/adventure.js';
import { createWorldService, type WorldSocketData } from '../../src/server/world-service.js';
import { check, openBrowser } from './session.js';

const url = 'http://127.0.0.1:4335/';
Bun.env.GREYWROUGHT_GAME_URL = url;
Bun.env.GREYWROUGHT_DEBUG_PORT = '9535';
Bun.env.GREYWROUGHT_VULKAN = '1';
const character = { id: 'potion-fixture', name: 'Apothecary', archetype: 'warrior' as const, createdAtMillis: Date.now() };
const token = 'potion-fixture-token-000000000000000000';
const seed = createSharedAdventure(); seed.join(character.id, character.name, character.archetype);
const saved = JSON.parse(seed.save());
Object.assign(saved.characters[0].state, { phase: 'expedition', position: {x: -3, y: 0, z: 35}, health: 5, potions: 3 });
saved.characters[0].state.combat.phase = 'preparation';
Object.assign(saved.clock, { phase: 'preparation', elapsedSeconds: 0, cycle: 1 });
for (const threat of saved.world.threats) {
  if (threat.id === 'scout') {
    const position = { x: -4, y: 0, z: 32 };
    Object.assign(threat, { position, targetPosition: {...position}, aggro: true, targetPlayerId: character.id, combatants: [character.id], phase: 'preparation', joinCycle: 1, windowCycle: 1, specialOffset: 2, castDuration: 2, remainingSeconds: 2, comboOpened: true });
    Object.assign(threat.head, { ability: 'fireball', opened: true });
  } else if (threat.active) Object.assign(threat, { health: 0, phase: 'cleared', lootClaimed: true, respawnAt: Date.now() + 3_600_000 });
}
const savePath = `${process.cwd()}/build/browser/potion-${process.pid}.json`;
await Bun.write(savePath, JSON.stringify({ version: 1, accounts: [{ character, tokenHash: new Bun.CryptoHasher('sha256').update(token).digest('hex') }], world: JSON.stringify(saved), chat: [], nextChatId: 1 }));
const service = await createWorldService({ savePath, allowedOrigins: [url.slice(0, -1)] });
const server = Bun.serve<WorldSocketData>({ hostname: '127.0.0.1', port: 4336, fetch: (request, host) => service.fetch(request, host), websocket: service.websocket });
const frontend = Bun.spawn(['bun', 'scripts/dev-server.ts'], { env: { ...Bun.env, GREYWROUGHT_PORT: '4335' }, stdout: Bun.file('build/browser/potion-frontend.log'), stderr: Bun.file('build/browser/potion-errors.log') });
let page: Awaited<ReturnType<typeof openBrowser>> | undefined;
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(url)).ok) break; } catch {} await Bun.sleep(100); }
  page = await openBrowser('potion-hotbar', { beforeNavigate: async call => {
    await call('Network.enable'); await call('Network.setBlockedURLs', { urls: [url + '__dev/events'] });
    await call('Page.addScriptToEvaluateOnNewDocument', { source: `localStorage.setItem('greywrought/local-profile-v1',${JSON.stringify(JSON.stringify({ version: 1, displayName: 'Potion Test', characters: [character], selectedCharacterId: character.id, savedAtMillis: Date.now() }))});localStorage.setItem('greywrought/world-token',${JSON.stringify(token)});const Native=WebSocket;window.WebSocket=class extends Native{constructor(url,...args){super(String(url).includes('/world')?'ws://127.0.0.1:4336/world':url,...args);this.addEventListener('message',event=>{const d=JSON.parse(event.data);if(d.type==='state')window.potionState=d.snapshot;});}};` });
  } });
  await page.waitFor('document.body.dataset.entryRoute==="roster"');
  await page.click('#entry-enter-world');
  await page.waitFor('document.body.dataset.entryRoute==="world"&&document.body.dataset.rigState==="ready"&&window.potionState.combat.phase==="preparation"');
  check(await page.evaluate('window.potionState.player.inCombat'), 'Potion journey starts in combat');
  await page.click('#bag-open');
  await page.click('[data-bag-item="potions"]');
  await page.click('#bag-use-potion');
  await page.waitFor('window.potionState.potions===2&&window.potionState.player.health===35');
  const browser = page;
  async function drag(source: string, target: string) {
    const points = await browser.evaluate<{ from: { x: number; y: number }; to: { x: number; y: number } }>(`(() => { const point = s => {const r=document.querySelector(s).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};};return {from:point(${JSON.stringify(source)}),to:point(${JSON.stringify(target)})};})()`);
    await browser.call('Input.setInterceptDrags', { enabled: true });
    await browser.call('Input.dispatchMouseEvent', { type: 'mouseMoved', ...points.from, buttons: 0 });
    await browser.call('Input.dispatchMouseEvent', { type: 'mousePressed', ...points.from, button: 'left', buttons: 1, clickCount: 1 });
    await browser.call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: points.from.x + 15, y: points.from.y, button: 'left', buttons: 1 });
    const fromBag = source.includes('bag-item');
    await browser.waitFor(fromBag ? 'document.getElementById("bag-details").hidden' : `document.querySelector(${JSON.stringify(source)}).classList.contains("action-dragging")`);
    for (const type of ['dragEnter', 'dragOver', 'drop']) await browser.call('Input.dispatchDragEvent', { type, ...points.to, data: { items: [{ mimeType: fromBag ? 'application/x-greywrought-potion' : 'text/plain', data: 'drinkPotion' }], dragOperationsMask: 16 } });
    await browser.call('Input.dispatchMouseEvent', { type: 'mouseReleased', ...points.to, button: 'left', buttons: 0, clickCount: 1 });
    await browser.call('Input.setInterceptDrags', { enabled: false });
  }
  await drag('[data-bag-item="potions"]', '[data-action-slot="3"]');
  await page.waitFor(`document.querySelector('[data-action="drinkPotion"]')?.dataset.actionSlot==="3"`);
  await page.waitFor(`document.querySelector('[data-action="drinkPotion"]')?.dataset.quantity==="2"`);
  await Bun.sleep(300);
  await page.click('[data-action="drinkPotion"]');
  await page.waitFor('window.potionState.potions===1&&window.potionState.player.health===65');
  await drag('[data-action="drinkPotion"]', '[data-action-slot="4"]');
  await page.waitFor(`document.querySelector('[data-action="drinkPotion"]')?.dataset.actionSlot==="4"`);
  await page.shot('potion-bound');
  console.log("Backpack, drag, bar click and reorder passed; reloading");
  await page.call("Page.reload");
  await Bun.sleep(300);
  await page.waitFor('document.body.dataset.entryRoute==="roster"'); await page.click('#entry-enter-world');
  await page.waitFor('document.body.dataset.entryRoute==="world"&&window.potionState?.phase==="expedition"&&document.body.dataset.rigState==="ready"');
  if (await page.evaluate('!document.getElementById("pause-panel").hidden')) await page.click('#pause-resume');
  await page.waitFor(`document.querySelector('[data-action="drinkPotion"]')?.dataset.actionSlot==="4"`);
  await page.waitFor('document.getElementById("pause-panel").hidden&&document.body.dataset.gamePaused==="false"');
  await page.press('Digit5');
  await page.waitFor('window.potionState.potions===0&&window.potionState.player.health===95');
  await page.waitFor(`document.querySelector('[data-action="drinkPotion"]').disabled&&document.querySelector('[data-action="drinkPotion"]').dataset.quantity==="0"`);
  check(await page.evaluate(`document.querySelectorAll("#adventure-actions > button").length===12&&["strike","brace","bait"].every(a=>document.querySelector('[data-action="'+a+'"]'))`), 'Original abilities and twelve slots remain');
  await page.shot('potion-empty');
  check(page.errors.length === 0, 'No browser exceptions');
  console.log('PASS in-combat backpack drink, native drag to bar, click, reorder, reload, hotkey and empty-stack disable', page.output);
} catch (error) { console.error(error); await page?.shot('failure').catch(() => {}); throw error; }
finally { await page?.close(); await service.close(); server.stop(true); frontend.kill(); await frontend.exited; }
