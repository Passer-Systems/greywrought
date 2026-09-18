import { createSharedAdventure } from '../../src/game/adventure.js';
import { createWorldService, type WorldSocketData } from '../../src/server/world-service.js';
import { openBrowser, check } from './session.js';
import type { AdventureSnapshot } from '../../src/game/adventure-types.js';

Bun.env.GREYWROUGHT_GAME_URL = 'http://127.0.0.1:4173/';
Bun.env.GREYWROUGHT_DEBUG_PORT = '9423';
Bun.env.GREYWROUGHT_VULKAN = '1';
const character = { id: 'combat-loop-fixture', name: 'Combat Tester', archetype: 'mage' as const, createdAtMillis: Date.now() };
const token = 'combat-loop-fixture-token-0000000000000000';
const seed = createSharedAdventure(); seed.join(character.id, character.name, character.archetype);
const saved = JSON.parse(seed.save());
Object.assign(saved.characters[0].state, { phase: 'expedition', position: { x: -3, y: 0, z: 8 } });
saved.characters[0].state.combat.phase = 'preparation';
for (const enemy of saved.world.threats) {
  if (enemy.id === 'scout' || enemy.id === 'nest') Object.assign(enemy, { position: { x: enemy.id === 'scout' ? -1 : 0, y: 0, z: 10 }, targetPosition: { x: enemy.id === 'scout' ? -1 : 0, z: 10, y: 0 }, aggro: true, targetPlayerId: character.id, phase: 'preparation' });
  else if (enemy.active) Object.assign(enemy, { health: 0, phase: 'cleared', lootClaimed: true, respawnAt: Date.now() + 3_600_000 });
}
const savePath = process.cwd() + '/build/browser/combat-loop-' + process.pid + '.json';
await Bun.write(savePath, JSON.stringify({ version: 1, accounts: [{ character, tokenHash: new Bun.CryptoHasher('sha256').update(token).digest('hex') }], world: JSON.stringify(saved), chat: [], nextChatId: 1 }));
const service = await createWorldService({ savePath, allowedOrigins: ['http://127.0.0.1:4173'] });
const server = Bun.serve<WorldSocketData>({ hostname: '127.0.0.1', port: 4194, fetch: (request, host) => service.fetch(request, host), websocket: service.websocket });
const page = await openBrowser('combat-loop');
try {
  await page.call('Page.addScriptToEvaluateOnNewDocument', { source: `localStorage.setItem('greywrought/local-profile-v1',${JSON.stringify(JSON.stringify({ version: 1, displayName: 'Combat Test', characters: [character], selectedCharacterId: character.id, savedAtMillis: Date.now() }))});localStorage.setItem('greywrought/world-token',${JSON.stringify(token)});const Native=WebSocket;window.WebSocket=class extends Native{constructor(url,...args){super(String(url).includes('/world')?'ws://127.0.0.1:4194/world':url,...args);this.addEventListener('message',event=>{const d=JSON.parse(event.data);if(d.type==='state')window.combatSnapshot=d.snapshot;});}};` });
  await page.reload();
  await page.waitFor('document.body.dataset.entryRoute==="roster"');
  await page.click('#entry-enter-world');
  await page.waitFor('document.body.dataset.entryRoute==="world"&&document.body.dataset.rigState==="ready"');
  await page.click('.enemy-nameplate[data-enemy-id="scout"] .nameplate-target');
  await page.waitFor('window.combatSnapshot.combat.phase==="preparation"');
  await page.waitFor('document.getElementById("combat-plan")&&!document.getElementById("combat-plan").hidden');
  check(await page.evaluate<number>('window.combatSnapshot.combat.remainingSeconds') <= 30.1, 'Planning window is capped at 30 seconds');
  check(await page.evaluate('document.querySelectorAll(".combat-plan-tick").length===3'), 'Planner exposes three timing slots');
  check(await page.evaluate('document.querySelectorAll(".combat-plan-enemy-move").length>=2'), 'Planner shows committed intentions from multiple enemies');
  await page.click('.adventure-actions [data-action="strike"]');
  await page.waitFor('window.combatSnapshot.combat.queued.length===1');
  await page.call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 10, y: 10, buttons: 0 });
  await page.shot('combat-planning-multiple-enemies');
  await page.click('.combat-plan-ready');
  await page.waitFor('window.combatSnapshot.combat.phase==="active"');
  const cycle = await page.evaluate<number>('window.combatSnapshot.combat.cycle');
  const before = await page.evaluate<AdventureSnapshot>('window.combatSnapshot');
  await page.key('KeyW', true); await Bun.sleep(500); await page.key('KeyW', false);
  const after = await page.evaluate<AdventureSnapshot>('window.combatSnapshot');
  check(after.player.position.x === before.player.position.x && after.player.position.z === before.player.position.z, 'Manual movement is locked while a sequence resolves');
  await page.click('.adventure-actions [data-action="strike"]');
  check(await page.evaluate<number>('window.combatSnapshot.combat.queued.length') === 1, 'New actions are ignored during execution');
  await page.waitFor(`window.combatSnapshot.combat.phase==="preparation"&&window.combatSnapshot.combat.cycle>${cycle}`, 10000);
  await page.shot('combat-loop-ready-and-active');
  check(page.errors.length === 0, 'No browser exceptions');
  console.log('PASS 30-second planning, three slots, Ready starts sequence, execution locks movement and new actions', page.output);
} catch (error) { await page.shot('failure'); throw error; }
finally { await page.key('KeyW', false).catch(() => {}); await page.close(); await service.close(); server.stop(true); }
