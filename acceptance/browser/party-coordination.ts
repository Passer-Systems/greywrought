import { createSharedAdventure } from '../../src/game/adventure.js';
import { terrainHeight } from '../../src/game/cave-layout.js';
import { createWorldService, type WorldSocketData } from '../../src/server/world-service.js';
import { check, openBrowser } from './session.js';

const url = 'http://127.0.0.1:4383/';
Object.assign(Bun.env, { GREYWROUGHT_GAME_URL: url, GREYWROUGHT_VULKAN: '1' });
const characters = [
  { id: 'coordination-aster', name: 'Aster', archetype: 'mage' as const, createdAtMillis: 1 },
  { id: 'coordination-mira', name: 'Mira', archetype: 'mage' as const, createdAtMillis: 2 },
];
const token = 'party-coordination-browser-fixture-000000000000';
const seed = createSharedAdventure();
for (const character of characters) seed.join(character.id, character.name, character.archetype);
const saved = JSON.parse(seed.save());
for (const [index, entry] of saved.characters.entries()) Object.assign(entry.state, { phase: 'expedition', position: { x: -3 + index * 2, y: terrainHeight(-3 + index * 2, 28), z: 28 } });
for (const threat of saved.world.threats) {
  if (threat.id === 'scout') Object.assign(threat, { health: 5, phase: 'preparation', aggro: true, targetPlayerId: characters[0]!.id, combatants: characters.map(character => character.id), contributors: characters.map(character => character.id), position: { x: -3, y: terrainHeight(-3, 32), z: 32 } });
  else if (threat.active) Object.assign(threat, { health: 0, phase: 'cleared', lootClaimed: true, respawnAt: Date.now() + 3_600_000 });
}
Object.assign(saved.clock, { phase: 'preparation', elapsedSeconds: 0, gatheringRemainingSeconds: 0 });
const staged = createSharedAdventure({ save: JSON.stringify(saved) });
for (const character of characters) staged.join(character.id, character.name, character.archetype);
staged.pause(characters[0]!.id, characters.map(character => character.id));
const savePath = `${process.cwd()}/build/browser/party-coordination-${process.pid}.json`;
await Bun.write(savePath, JSON.stringify({ version: 1, accounts: characters.map(character => ({ character, tokenHash: new Bun.CryptoHasher('sha256').update(token).digest('hex') })), world: staged.save(), chat: [], nextChatId: 1, parties: [{ id: 'coordination-party', leaderId: characters[0]!.id, members: characters.map(character => character.id) }] }));
const service = await createWorldService({ savePath, allowedOrigins: [url.slice(0, -1)] });
const server = Bun.serve<WorldSocketData>({ hostname: '127.0.0.1', port: 4384, fetch: (request, host) => service.fetch(request, host), websocket: service.websocket });
const frontend = Bun.spawn([process.execPath, 'scripts/dev-server.ts'], { env: { ...Bun.env, GREYWROUGHT_PORT: '4383', GREYWROUGHT_LOCAL_WORLD: '0' }, stdout: Bun.file('build/browser/party-coordination-frontend.log'), stderr: Bun.file('build/browser/party-coordination-frontend-errors.log') });
const pages: Awaited<ReturnType<typeof openBrowser>>[] = [];
try {
  for (let attempt = 0; attempt < 100; attempt++) { try { if ((await fetch(url)).ok) break; } catch {} await Bun.sleep(100); }
  for (let index = 0; index < characters.length; index++) {
    Bun.env.GREYWROUGHT_DEBUG_PORT = String(9583 + index);
    const character = characters[index]!;
    const page = await openBrowser(`party-coordination-${index}`, { localOnly: true, beforeNavigate: async call => {
      await call('Page.addScriptToEvaluateOnNewDocument', { source: `window.EventSource=class{};
        localStorage.setItem('greywrought/local-profile-v1',${JSON.stringify(JSON.stringify({ version: 1, displayName: 'Coordination Test', characters: [character], selectedCharacterId: character.id, savedAtMillis: Date.now() }))});
        localStorage.setItem('greywrought/world-token',${JSON.stringify(token)});
        const Native=WebSocket;window.WebSocket=class extends Native{constructor(url,...args){super(String(url).includes('/world')?'ws://127.0.0.1:4384/world':url,...args);this.addEventListener('message',event=>{const message=JSON.parse(event.data);if(message.type==='state')window.partyState=message;});}};` });
    } });
    pages.push(page);
    await page.waitFor('document.body.dataset.entryRoute === "roster"');
    await page.evaluate(`(async()=>{const{Scene}=await import('three');Scene.prototype.onAfterRender=function(renderer,scene,camera){if(renderer.domElement.id==='world-canvas'&&renderer.getRenderTarget()===null&&camera.isPerspectiveCamera)window.testScene=scene;};})()`);
    await page.click('#entry-enter-world');
    await page.waitFor('document.body.dataset.rigState === "ready" && document.body.dataset.environmentState === "ready" && !!window.testScene', 30000);
  }
  const [a, b] = pages as [typeof pages[number], typeof pages[number]];
  for (const page of pages) await page.waitFor('document.querySelectorAll("[data-party-member]").length === 2');
  await a.click('#pause-resume');
  for (const page of pages) await page.waitFor('window.partyState.session.mode === "private" && document.body.dataset.gameInCombat === "true"');
  await a.click('[data-party-command="ping"]');
  for (const page of pages) {
    await page.waitFor('document.querySelector(".party-pings").textContent.includes("Aster pinged") && !!window.testScene.getObjectByName("party-ping:coordination-aster")');
    await page.waitFor('!!document.querySelector(\'.map-ping[data-player-id="coordination-aster"]\')');
  }
  await a.shot('party-location-ping');

  await a.click('.adventure-actions [data-action="strike"]');
  await a.click('.combat-plan-ready');
  await b.waitFor('document.querySelector(\'[data-party-member="coordination-aster"] .party-coordination\').textContent.includes("Ready") && document.querySelector(\'[data-party-member="coordination-mira"] .party-coordination\').textContent.includes("Not ready")');
  const targetName = await b.evaluate<string>('window.partyState.snapshot.threats.find(threat=>threat.id==="scout").name');
  check(await b.evaluate(`document.querySelector('[data-party-member="coordination-aster"] .party-coordination').textContent.includes(${JSON.stringify('Target: ' + targetName)})`), 'Party shows the actual selected target');
  await b.shot('party-targets-and-ready');
  await b.click('.combat-plan-ready');
  for (const page of pages) await page.waitFor('window.partyState.session.mode === "viewing"', 15000);
  for (const page of pages) await page.waitFor('window.partyState.party.pings.length === 0 && !window.testScene.getObjectByName("party-ping:coordination-aster")');
  await a.click('#encounter-rejoin');
  await b.waitFor('document.querySelector(".party-return").textContent === "Return · waiting for Mira"');
  check(await b.evaluate('document.querySelector(\'[data-party-member="coordination-aster"] .party-coordination\').textContent.includes("Return confirmed") && window.partyState.session.returnPlan.confirmed === false'), 'One member confirms without confirming for the other');
  check(await b.evaluate('window.partyState.snapshot.carriedSalvage === 0'), 'Private combat awards no shared loot');
  await b.shot('party-waiting-for-mira');
  await b.click('#encounter-rejoin');
  for (const page of pages) await page.waitFor('window.partyState.session.mode === "shared" && document.querySelector(".party-return").hidden');
  check(await b.evaluate('window.partyState.party.pings.length === 0 && !window.testScene.getObjectByName("party-ping:coordination-aster")'), 'Pings stay in their original encounter');
  check(pages.every(page => page.errors.length === 0), 'No browser exceptions');
  console.log('PASS party target/Ready, visible location ping on ground and minimap, fork isolation, named return confirmation and unchanged private rewards', pages.map(page => page.output));
} catch (error) {
  for (const page of pages) { await page.shot('failure'); console.error(await page.evaluate('({party:window.partyState?.party,session:window.partyState?.session})')); }
  throw error;
} finally {
  for (const page of pages) await page.close();
  await service.close(); server.stop(true); frontend.kill(); await frontend.exited;
}
