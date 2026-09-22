import { createSharedAdventure } from '../../src/game/adventure.js';
import { createWorldService, type WorldSocketData } from '../../src/server/world-service.js';
import { check, openBrowser } from './session.js';

const url = 'http://127.0.0.1:4491/';
Bun.env.GREYWROUGHT_GAME_URL = url;
Bun.env.GREYWROUGHT_DEBUG_PORT = '9691';
Bun.env.GREYWROUGHT_VULKAN = '1';
const character = { id: 'equipment-fixture', name: 'Wayfarer', archetype: 'warrior' as const, createdAtMillis: Date.now() };
const token = 'equipment-fixture-token-000000000000000000';
const seed = createSharedAdventure(); seed.join(character.id, character.name, character.archetype);
const saved = JSON.parse(seed.save());
Object.assign(saved.characters[0].state, { health: 5, potions: 3 });
Object.assign(saved.characters[0].state.chapter, { ownedGear: ['yard-weapon', 'travel-weapon'], equipment: { mainhand: 'travel-weapon', chest: null, offhand: null } });
const savePath = `${process.cwd()}/build/browser/equipment-${process.pid}.json`;
await Bun.write(savePath, JSON.stringify({ version: 1, accounts: [{ character, tokenHash: new Bun.CryptoHasher('sha256').update(token).digest('hex') }], world: JSON.stringify(saved), chat: [], nextChatId: 1 }));
const service = await createWorldService({ savePath, allowedOrigins: [url.slice(0, -1)] });
const server = Bun.serve<WorldSocketData>({ hostname: '127.0.0.1', port: 4492, fetch: (request, host) => service.fetch(request, host), websocket: service.websocket });
const frontend = Bun.spawn(['bun', 'scripts/dev-server.ts'], { env: { ...Bun.env, GREYWROUGHT_PORT: '4491' }, stdout: Bun.file('build/browser/equipment-frontend.log'), stderr: Bun.file('build/browser/equipment-errors.log') });
let page: Awaited<ReturnType<typeof openBrowser>> | undefined;
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(url)).ok) break; } catch {} await Bun.sleep(100); }
  page = await openBrowser('equipment-tooltips', { beforeNavigate: async call => {
    await call('Network.enable'); await call('Network.setBlockedURLs', { urls: [url + '__dev/events'] });
    await call('Page.addScriptToEvaluateOnNewDocument', { source: `localStorage.setItem('greywrought/local-profile-v1',${JSON.stringify(JSON.stringify({ version: 1, displayName: 'Equipment Test', characters: [character], selectedCharacterId: character.id, savedAtMillis: Date.now() }))});localStorage.setItem('greywrought/world-token',${JSON.stringify(token)});const Native=WebSocket;window.WebSocket=class extends Native{constructor(url,...args){super(String(url).includes('/world')?'ws://127.0.0.1:4492/world':url,...args);this.addEventListener('message',event=>{const d=window.decodeWorldMessage(event);if(d.type==='state')window.equipmentState=d.snapshot;});}};` });
  } });
  await page.waitFor('document.body.dataset.entryRoute==="roster"');
  await page.click('#entry-enter-world');
  await page.waitFor('document.body.dataset.rigState==="ready"&&window.equipmentState?.phase==="town"');
  await page.click('#bag-open');
  await page.click('#equipment-open');
  const browser = page;
  async function hover(selector: string) {
    const point = await browser.evaluate<{ x: number; y: number }>(`(() => { const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}; })()`);
    await browser.call('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point, buttons: 0 });
  }
  async function characterShows(name: string, damage: number, absent: string) {
    await browser.waitFor(`(() => {const text=document.getElementById('equipment-details').textContent;return text.includes(${JSON.stringify(name)})&&text.includes('Adds ${damage} damage')&&!text.includes(${JSON.stringify(absent)});})()`);
  }
  await characterShows('Trail Blade', 2, "Shiftkeeper");
  await hover('[data-bag-item="yard-weapon"]');
  await page.waitFor(`!document.getElementById('bag-details').hidden&&document.getElementById('bag-item-name').textContent.includes('Shiftkeeper')&&document.getElementById('bag-item-description').textContent.includes('Adds 3 damage')&&document.getElementById('bag-item-comparison').hidden&&!document.getElementById('bag-details').textContent.includes('Trail Blade')`);
  await page.call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Shift', code: 'ShiftLeft', windowsVirtualKeyCode: 16, modifiers: 8 });
  await page.waitFor(`!document.getElementById('bag-item-comparison').hidden&&document.getElementById('bag-item-comparison').textContent.includes('Trail Blade')&&document.getElementById('bag-item-comparison').textContent.includes('Adds 2 damage')`);
  await page.call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Shift', code: 'ShiftLeft', windowsVirtualKeyCode: 16, modifiers: 0 });
  await page.waitFor(`document.getElementById('bag-item-comparison').hidden&&!document.getElementById('bag-details').textContent.includes('Trail Blade')`);
  await page.click('[data-bag-item="yard-weapon"]');
  await hover('[data-equipment-slot="mainhand"]');
  await page.waitFor(`document.getElementById('bag-details').hidden&&!document.getElementById('equipment-tooltip').hidden&&document.getElementById('equipment-tooltip').textContent.includes('Trail Blade')&&!document.getElementById('equipment-tooltip').textContent.includes('Shiftkeeper')`);
  await hover('[data-bag-item="yard-weapon"]');
  await page.waitFor(`document.getElementById('equipment-tooltip').hidden&&!document.getElementById('bag-details').hidden`);
  await page.click('[data-bag-item="yard-weapon"]');
  await page.click('#bag-equip');
  await page.waitFor(`window.equipmentState.progression.equipment.mainhand==='yard-weapon'&&!!document.querySelector('[data-bag-item="travel-weapon"]')&&document.getElementById('bag-details').hidden`);
  await characterShows("Shiftkeeper", 3, 'Trail Blade');
  await hover('[data-equipment-slot="mainhand"]');
  await page.waitFor(`document.getElementById('equipment-tooltip').textContent.includes('Adds 3 damage')`);
  await page.shot('swapped-weapon');
  await page.click('#equipment-toggle');
  await page.waitFor(`window.equipmentState.progression.equipment.mainhand===null&&document.getElementById('equipment-details').textContent.includes('Starter sword')&&document.querySelectorAll('[data-bag-item="yard-weapon"],[data-bag-item="travel-weapon"]').length===2`);
  await page.evaluate(`document.querySelector('[data-equipment-slot="mainhand"]').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}))`);
  await Bun.sleep(200);
  check(await page.evaluate('window.equipmentState.progression.equipment.mainhand===null'), 'Empty slot must not auto-equip an owned weapon');
  await page.evaluate(`(() => { const transfer=new DataTransfer();transfer.setData('application/x-greywrought-gear','travel-weapon');document.querySelector('[data-equipment-slot="mainhand"]').dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:transfer})); })()`);
  await page.waitFor(`window.equipmentState.progression.equipment.mainhand==='travel-weapon'`);
  await characterShows('Trail Blade', 2, 'Shiftkeeper');
  await page.click('#equipment-close');
  await page.click('[data-bag-item="potions"]');
  await page.click('#bag-use-potion');
  await page.waitFor('window.equipmentState.potions===2&&window.equipmentState.player.health>5');
  await page.click('[data-bag-item="hearthstone"]');
  await page.click('#bag-use-hearthstone');
  await page.waitFor(`window.equipmentState.player.currentAction==='hearthstone'`);
  check(page.errors.length === 0, 'No browser exceptions');
  console.log('PASS equipped-only details, per-item hover, Shift comparison/release, stale tooltip dismissal, swap, unequip, starter, empty right-click, gear drop, potion and hearthstone buttons', page.output);
} catch (error) { console.error(error); await page?.shot('failure').catch(() => {}); throw error; }
finally { await page?.close(); await service.close(); server.stop(true); frontend.kill(); await frontend.exited; }
