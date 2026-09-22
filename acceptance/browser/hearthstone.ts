import { createSharedAdventure } from '../../src/game/adventure.js';
import { createWorldService, type WorldSocketData } from '../../src/server/world-service.js';
import { check, openBrowser } from './session.js';

const url = 'http://127.0.0.1:4325/';
Bun.env.GREYWROUGHT_GAME_URL = url;
Bun.env.GREYWROUGHT_DEBUG_PORT = '9525';
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
const server = Bun.serve<WorldSocketData>({ hostname: '127.0.0.1', port: 4326, fetch: (request, host) => service.fetch(request, host), websocket: service.websocket });
const frontend = Bun.spawn(['bun', 'scripts/dev-server.ts'], { env: { ...Bun.env, GREYWROUGHT_PORT: '4325' }, stdout: Bun.file('build/browser/hearth-frontend.log'), stderr: Bun.file('build/browser/hearth-errors.log') });
let page: Awaited<ReturnType<typeof openBrowser>> | undefined;
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(url)).ok) break; } catch {} await Bun.sleep(100); }
  page = await openBrowser('hearthstone', { beforeNavigate: async call => {
    await call('Network.enable'); await call('Network.setBlockedURLs', { urls: [url + '__dev/events'] });
    await call('Page.addScriptToEvaluateOnNewDocument', { source: `localStorage.setItem('greywrought/local-profile-v1',${JSON.stringify(JSON.stringify({ version: 1, displayName: 'Hearth Test', characters: [character], selectedCharacterId: character.id, savedAtMillis: Date.now() }))});localStorage.setItem('greywrought/world-token',${JSON.stringify(token)});const Native=WebSocket;window.WebSocket=class extends Native{constructor(url,...args){super(String(url).includes('/world')?'ws://127.0.0.1:4326/world':url,...args);this.addEventListener('message',event=>{const d=window.decodeWorldMessage(event);if(d.type==='state')window.hearthState=d.snapshot;});}};` });
  } });
  await page.waitFor('document.body.dataset.entryRoute==="roster"');
  await page.click('#entry-enter-world');
  await page.waitFor('document.body.dataset.rigState==="ready"&&window.hearthState.phase==="expedition"');
  const supplies = await page.evaluate<number>('window.hearthState.supplies');
  const browser = page;
  async function useStone() {
    if (await browser.evaluate('document.getElementById("bag-panel").hidden')) await browser.click('#bag-open');
    await browser.click('[data-bag-item="hearthstone"]');
    await browser.click('#bag-use-hearthstone');
    await browser.waitFor('window.hearthState.player.currentAction==="hearthstone"');
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
  await page.waitFor('window.hearthState?.phase==="town"&&document.body.dataset.rigState==="ready"');
  if (await page.evaluate('!document.getElementById("pause-panel").hidden')) await page.click('#pause-resume');
  await page.waitFor('document.getElementById("pause-panel").hidden');
  await page.click('#bag-open');
  check(await page.evaluate('document.querySelector(\'[data-bag-item="hearthstone"]\').dataset.quantity==="1"'), 'Hearthstone remains in the backpack after use and reload');
  await page.shot('home-with-hearthstone');
  check(page.errors.length === 0, 'No browser exceptions');
  console.log('PASS backpack Hearthstone, visible cast, Escape/movement cancellation, completed return, loot secured once, reusable after reload', page.output);
} catch (error) { console.error(error); await page?.shot('failure').catch(() => {}); throw error; }
finally { await page?.close(); await service.close(); server.stop(true); frontend.kill(); await frontend.exited; }
