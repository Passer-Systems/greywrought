import { createSharedAdventure } from '../../src/game/adventure.js';
import { earnedChapter } from '../../src/game/yard-test-fixtures.js';
import { createWorldService, type WorldSocketData } from '../../src/server/world-service.js';
import { openBrowser, check } from './session.js';
import type { AdventureSnapshot } from '../../src/game/adventure-types.js';

Bun.env.GREYWROUGHT_GAME_URL = 'http://127.0.0.1:4173/';
Bun.env.GREYWROUGHT_DEBUG_PORT = '9424';
Bun.env.GREYWROUGHT_VULKAN = '1';
const character = { id: 'floating-fixture', name: 'Cast Tester', archetype: 'mage' as const, createdAtMillis: Date.now() };
const token = 'floating-fixture-token-000000000000000000';
const seed = createSharedAdventure(); seed.join(character.id, character.name, character.archetype);
const saved = JSON.parse(seed.save());
const chapter = earnedChapter(2); chapter.equipment.chest = 'insulated-coat';
Object.assign(saved.characters[0].state, { phase: 'expedition', position: { x: -3, y: 0, z: 8 }, chapter, health: 75, potions: 1 });
for (const enemy of saved.world.threats) {
  if (enemy.id !== 'scout' && enemy.active) Object.assign(enemy, { health: 0, phase: 'cleared', lootClaimed: true, respawnAt: Date.now() + 3_600_000 });
}
const savePath = process.cwd() + '/build/browser/floating-' + process.pid + '.json';
await Bun.write(savePath, JSON.stringify({ version: 1, accounts: [{ character, tokenHash: new Bun.CryptoHasher('sha256').update(token).digest('hex') }], world: JSON.stringify(saved), chat: [], nextChatId: 1 }));
const service = await createWorldService({ savePath, allowedOrigins: ['http://127.0.0.1:4173'] });
const server = Bun.serve<WorldSocketData>({ hostname: '127.0.0.1', port: 4195, fetch: (request, host) => service.fetch(request, host), websocket: service.websocket });
const page = await openBrowser('floating-combat');
try {
  await page.call('Page.addScriptToEvaluateOnNewDocument', { source: `window.EventSource=class{};
    localStorage.setItem('greywrought/local-profile-v1',${JSON.stringify(JSON.stringify({ version: 1, displayName: 'Combat Test', characters: [character], selectedCharacterId: character.id, savedAtMillis: Date.now() }))});
    localStorage.setItem('greywrought/world-token',${JSON.stringify(token)});
    window.feedbackAdded=[];const Native=WebSocket;
    window.WebSocket=class extends Native{constructor(url,...args){super(String(url).includes('/world')?'ws://127.0.0.1:4195/world':url,...args);this.addEventListener('message',event=>{const d=JSON.parse(event.data);if(d.type==='state')window.combatSnapshot=d.snapshot;});}};
    document.addEventListener('DOMContentLoaded',()=>new MutationObserver(records=>{for(const r of records)for(const n of r.addedNodes)if(n instanceof Element&&n.matches('.floating-combat-hit'))window.feedbackAdded.push({id:n.dataset.eventId,kind:n.dataset.kind,target:n.dataset.target,text:n.textContent});}).observe(document.body,{childList:true,subtree:true}));` });
  await page.reload();
  await page.waitFor('document.body.dataset.entryRoute==="roster"');
  await page.click('#entry-enter-world');
  await page.waitFor('document.body.dataset.entryRoute==="world"&&document.body.dataset.rigState==="ready"');
  await page.press('Digit1');
  await page.waitFor('document.querySelector(\'.floating-combat-hit[data-kind="damage"][data-target="scout"]\')!==null');
  await page.press('Digit1');
  const damage = await page.evaluate<{id:string;text:string}>('( () => {const e=document.querySelector(\'.floating-combat-hit[data-kind="damage"][data-target="scout"]\'); return {id:e.dataset.eventId,text:e.textContent};})()');
  check(damage.text==='11','Outgoing number must include the actual level bonus');
  check(await page.evaluate<boolean>('getComputedStyle(document.querySelector(".floating-combat-hit")).pointerEvents==="none"'), 'Feedback must not intercept mouse input');
  await page.shot('outgoing-damage');
  await page.waitFor('document.querySelector(\'.floating-combat-hit[data-kind="damage"][data-target="player"]\')!==null');
  await page.shot('incoming-damage');
  await page.waitFor('(()=>{const c=window.combatSnapshot.threats.find(t=>t.id==="scout").cast;return c?.status==="casting"&&c.ability.damage>0&&c.remainingSeconds<.9&&c.remainingSeconds>.4;})()');
  await page.press('Digit2');
  await page.waitFor('document.querySelector(\'.floating-combat-hit[data-kind="block"][data-target="player"]\')!==null');
  await page.shot('actual-damage-blocked');
  await page.waitFor('window.combatSnapshot.combat.globalCooldown===0');
  await page.click('.adventure-actions [data-action="drinkPotion"]');
  await page.waitFor('document.querySelector(\'.floating-combat-hit[data-kind="heal"]\')!==null');
  check(await page.evaluate<string>('document.querySelector(\'.floating-combat-hit[data-kind="heal"]\').textContent')==='+30','Potion must float its actual restored health');
  await page.shot('healing');
  await Bun.sleep(1600);
  check(await page.evaluate<boolean>('document.querySelector(\'.floating-combat-hit[data-kind="heal"]\')===null'), 'Old numbers must fade and disappear');
  const added = await page.evaluate<{id:string;kind:string;target:string;text:string}[]>('window.feedbackAdded');
  check(new Set(added.map(e=>e.id)).size===added.length,'Repeated server snapshots must not replay feedback');
  check(added.some(e=>e.kind==='damage'&&e.target==='scout')&&added.some(e=>e.kind==='damage'&&e.target==='player')&&added.some(e=>e.kind==='block')&&added.some(e=>e.kind==='heal'),'All actual result categories must render');
  await page.waitFor('JSON.parse(document.getElementById("world-canvas").dataset.telegraphs).some(t=>t.kind==="target")');
  check(await page.evaluate<boolean>('JSON.parse(document.getElementById("world-canvas").dataset.telegraphs).filter(t=>t.kind==="target").every(t=>t.badgeVisible===false)'), 'The floating BLOCK warning must be removed');
  await page.shot('cast-bar-without-block-warning');
  check(page.errors.length===0,'No browser exceptions');
  console.log('PASS actual outgoing/incoming damage, absorbed block, healing, no repeated numbers, fade/cleanup, pointer pass-through and removed BLOCK warning',page.output);
} catch(error) {await page.shot('failure');throw error;}
finally {await page.close();await service.close();server.stop(true);}
