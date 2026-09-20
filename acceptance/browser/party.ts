import { createSharedAdventure } from '../../src/game/adventure.js';
import { createWorldService, type WorldSocketData } from '../../src/server/world-service.js';
import { check, openBrowser } from './session.js';

const url = 'http://127.0.0.1:4381/';
Object.assign(Bun.env, { GREYWROUGHT_GAME_URL: url, GREYWROUGHT_VULKAN: '1' });
const leader = { id: 'party-leader', name: 'Aster', archetype: 'warrior' as const, createdAtMillis: 1 };
const member = { id: 'party-member', name: 'Mira', archetype: 'hunter' as const, createdAtMillis: 2 };
const outsider = { id: 'party-outsider', name: 'Outside', archetype: 'mage' as const, createdAtMillis: 3 };
const characters = [leader, member, outsider];
const tokens = characters.map(character => `party-test-token-${character.id}-000000000000`);
const seed = createSharedAdventure();
for (const character of characters) seed.join(character.id, character.name, character.archetype);
const saved = JSON.parse(seed.save());
for (let index = 0; index < characters.length; index++) Object.assign(saved.characters[index].state, { phase: 'town', position: { x: -1 + index * 5, y: 0, z: -10 } });
const savePath = `${process.cwd()}/build/browser/party-${process.pid}.json`;
await Bun.write(savePath, JSON.stringify({ version: 1, accounts: characters.map((character, index) => ({ character, tokenHash: new Bun.CryptoHasher('sha256').update(tokens[index]!).digest('hex') })), world: JSON.stringify(saved), chat: [], nextChatId: 1 }));
const service = await createWorldService({ savePath, allowedOrigins: [url.slice(0, -1)] });
const server = Bun.serve<WorldSocketData>({ hostname: '127.0.0.1', port: 4382, fetch: (request, host) => service.fetch(request, host), websocket: service.websocket });
const frontend = Bun.spawn([process.execPath, 'scripts/dev-server.ts'], { env: { ...Bun.env, GREYWROUGHT_PORT: '4381', GREYWROUGHT_LOCAL_WORLD: '0' }, stdout: Bun.file('build/browser/party-frontend.log'), stderr: Bun.file('build/browser/party-frontend-errors.log') });
const pages: Awaited<ReturnType<typeof openBrowser>>[] = [];
const bot = new WebSocket('ws://127.0.0.1:4382/world');
let outsideMode = '';
bot.onopen = () => bot.send(JSON.stringify({ type: 'join', token: tokens[2], character: outsider }));
bot.onmessage = event => { const message = JSON.parse(String(event.data)); if (message.type === 'state') outsideMode = message.session.mode; };

async function rightClick(page: typeof pages[number], selector: string): Promise<void> {
  const point = await page.evaluate<{ x: number; y: number }>(`(() => { const target = document.querySelector(${JSON.stringify(selector)}); const r = target.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + r.height / 2; if (!target.contains(document.elementFromPoint(x,y))) throw new Error('Covered player control'); return {x,y}; })()`);
  await page.call('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'right', buttons: 2, clickCount: 1 });
  await page.call('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'right', buttons: 0, clickCount: 1 });
}

try {
  for (let attempt = 0; attempt < 100; attempt++) { try { if ((await fetch(url)).ok) break; } catch {} await Bun.sleep(100); }
  for (let index = 0; index < 2; index++) {
    Bun.env.GREYWROUGHT_DEBUG_PORT = String(9581 + index);
    const character = characters[index]!;
    const page = await openBrowser(`party-${index}`, { beforeNavigate: async call => {
      await call('Network.enable'); await call('Network.setBlockedURLs', { urls: [url + '__dev/events'] });
      await call('Page.addScriptToEvaluateOnNewDocument', { source: `localStorage.setItem('greywrought/local-profile-v1',${JSON.stringify(JSON.stringify({ version: 1, displayName: 'Party Test', characters: [character], selectedCharacterId: character.id, savedAtMillis: Date.now() }))});localStorage.setItem('greywrought/world-token',${JSON.stringify(tokens[index])});const Native=WebSocket;window.WebSocket=class extends Native{constructor(url,...args){super(String(url).includes('/world')?'ws://127.0.0.1:4382/world':url,...args);this.addEventListener('message',event=>{const message=JSON.parse(event.data);if(message.type==='state')window.partyState=message;});}};` });
    } });
    pages.push(page);
    await page.waitFor('document.body.dataset.entryRoute === "roster"');
    await page.click('#entry-enter-world');
    await page.waitFor('document.body.dataset.rigState === "ready" && document.body.dataset.environmentState === "ready"');
  }
  const [a, b] = pages as [typeof pages[number], typeof pages[number]];
  await a.waitFor('document.querySelector(\'[data-overhead-name="player:party-member"]\')?.hidden === false');
  await a.click('[data-overhead-name="player:party-member"]');
  await a.waitFor('document.getElementById("target-frame").dataset.targetId === "party-member"');
  await rightClick(a, '[data-overhead-name="player:party-member"]');
  await a.waitFor('!document.getElementById("party-context-menu").hidden');
  await a.press('Escape');
  check(await a.evaluate('document.getElementById("party-context-menu").hidden && document.getElementById("pause-panel").hidden && JSON.parse(document.body.dataset.selectedUnit).id === "party-member"'), 'Escape closes the player menu without clearing the target or pausing');
  await rightClick(a, '[data-overhead-name="player:party-member"]');
  await a.click('[data-party-command="invite"]');
  await b.waitFor('!document.getElementById("party-invite").hidden');
  await b.click('[data-party-command="accept"]');
  for (const page of pages) await page.waitFor('document.querySelectorAll("[data-party-member]").length === 2 && window.partyState.party.members.length === 2');
  check(await a.evaluate('document.querySelector(\'[data-party-member="party-member"] .party-member-status\').textContent === "Ranger"'), 'Party shows Ranger class name');
  await b.click('[data-party-member="party-leader"]');
  await b.waitFor('document.getElementById("target-frame").dataset.targetId === "party-leader"');
  await a.press('Enter');
  await a.call('Input.insertText', { text: '/roll' });
  await a.press('Enter');
  for (const page of pages) await page.waitFor('window.partyState.chat.some(entry => entry.name === "Aster" && /^rolls ([1-9]|[1-9]\\d|100) \\(1–100\\)\\.$/.test(entry.text)) && document.getElementById("chat-log-messages").textContent.includes("Aster rolls")');
  await a.shot('party-nameplates-and-frames');

  await b.click('#pause-toggle');
  for (const page of pages) await page.waitFor('window.partyState.session.mode === "paused" && document.body.dataset.gamePaused === "true"');
  const id = await a.evaluate<string>('window.partyState.session.id');
  check(id === await b.evaluate<string>('window.partyState.session.id'), 'Nonleader Pause moves both members to one encounter');
  check(outsideMode === 'shared', 'Unrelated player stays in the main world');
  for (let index = 0; index < pages.length; index++) check(await pages[index]!.evaluate(`window.partyState.players.some(player => player.id === ${JSON.stringify(characters[1 - index]!.id)})`), 'The other party player remains visible while paused');
  await b.shot('party-paused-together');
  await a.click('#pause-resume');
  for (const page of pages) await page.waitFor('window.partyState.session.mode === "private" && document.body.dataset.gamePaused === "false"');
  check(id === await a.evaluate<string>('window.partyState.session.id') && id === await b.evaluate<string>('window.partyState.session.id'), 'Resume keeps the same shared party encounter');
  await b.press('Enter');
  await b.call('Input.insertText', { text: '/roll' });
  await b.press('Enter');
  for (const page of pages) await page.waitFor('document.getElementById("chat-log-messages").textContent.includes("Mira rolls")');
  await a.waitFor('document.querySelector(\'[data-overhead-name="player:party-member"]\')?.hidden === false');
  await a.click('#encounter-rejoin');
  for (const page of pages) await page.waitFor('window.partyState.session.mode === "shared"');
  check(outsideMode === 'shared', 'Outsider remains unaffected after party rejoin');
  await b.reload();
  await b.waitFor('document.body.dataset.rigState === "ready" && document.querySelectorAll("[data-party-member]").length === 2');
  await b.waitFor('window.partyState.session.mode === "paused"');
  await b.click('#pause-resume');
  for (const page of pages) await page.waitFor('window.partyState.session.mode === "private"');
  await b.click('#encounter-rejoin');
  for (const page of pages) await page.waitFor('window.partyState.session.mode === "shared"');
  await rightClick(b, '[data-party-member="party-member"]');
  await b.click('[data-party-command="leave"]');
  for (const page of pages) await page.waitFor('window.partyState.party === null && document.getElementById("party-panel").hidden');
  check(pages.every(page => page.errors.length === 0), 'No browser exceptions');
  console.log('PASS real player invitation, acceptance, friendly targeting, party pause/resume/rejoin, reconnect, leave, and shared/private /roll', pages.map(page => page.output));
} catch (error) {
  for (const page of pages) { await page.shot('failure'); console.error(await page.evaluate('({party:window.partyState?.party,session:window.partyState?.session,players:window.partyState?.players?.map(player=>player.id)})')); }
  throw error;
} finally {
  bot.close();
  for (const page of pages) await page.close();
  await service.close(); server.stop(true); frontend.kill(); await frontend.exited;
}
