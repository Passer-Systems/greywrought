import { createSharedAdventure } from '../../src/game/adventure.js';
import { createWorldService, type WorldSocketData } from '../../src/server/world-service.js';
import { openBrowser, check } from './session.js';
Bun.env.GREYWROUGHT_GAME_URL = 'http://127.0.0.1:4301/';
Bun.env.GREYWROUGHT_DEBUG_PORT = '9452';
Bun.env.GREYWROUGHT_VULKAN = '1';
const character = { id: 'vertical-plan-fixture', name: 'Planner', archetype: 'warrior' as const, createdAtMillis: Date.now() };
const companion = { ...character, id: 'planner-companion', name: 'Mira of Frostwood' };
const companionToken = 'planner-companion-token-0000000000000000';
const token = 'vertical-plan-fixture-token-00000000000000000';
const seed = createSharedAdventure(); seed.join(character.id, character.name, character.archetype);
seed.join(companion.id, companion.name, companion.archetype);
const saved = JSON.parse(seed.save());
Object.assign(saved.characters[0].state, { phase: 'expedition', position: { x: -3, y: 0, z: 35 } });
Object.assign(saved.characters[1].state, { phase: 'expedition', position: { x: -2, y: 0, z: 35 } });
saved.characters[0].state.combat.phase = 'preparation';
Object.assign(saved.clock, { phase: 'preparation', elapsedSeconds: 0, cycle: 1 });
for (const enemy of saved.world.threats) {
  if (['scout', 'nest', 'patrol'].includes(enemy.id)) {
    const position = enemy.id === 'scout' ? { x: -4, y: 0, z: 32 } : enemy.id === 'nest' ? { x: 0, y: 0, z: 35 } : { x: -6, y: 0, z: 36 };
    Object.assign(enemy, { position, targetPosition: {...position}, aggro: true, targetPlayerId: companion.id, combatants: [character.id, companion.id], phase: 'preparation', joinCycle: 1, windowCycle: 1, specialOffset: 2, castDuration: 2, remainingSeconds: 2, comboOpened: true });
    if (enemy.id === 'scout') { enemy.health = 9; Object.assign(enemy.head, { ability: 'fireball', opened: true }); }
  } else if (enemy.active) Object.assign(enemy, { health: 0, phase: 'cleared', lootClaimed: true, respawnAt: Date.now() + 3_600_000 });
}
const savePath = process.cwd() + '/build/browser/vertical-planner-' + process.pid + '.json';
await Bun.write(savePath, JSON.stringify({ version: 1, accounts: [{ character, tokenHash: new Bun.CryptoHasher('sha256').update(token).digest('hex') }, { character: companion, tokenHash: new Bun.CryptoHasher('sha256').update(companionToken).digest('hex') }], world: JSON.stringify(saved), chat: [], nextChatId: 1 }));
const service = await createWorldService({savePath, allowedOrigins:['http://127.0.0.1:4301']});
const server = Bun.serve<WorldSocketData>({hostname:'127.0.0.1',port:4302,fetch:(request,host)=>service.fetch(request,host),websocket:service.websocket});
const frontend = Bun.spawn(['bun', 'scripts/dev-server.ts'], {
  env: { ...Bun.env, GREYWROUGHT_PORT: '4301', GREYWROUGHT_LOCAL_WORLD: '0' },
  stdout: Bun.file(`build/browser/vertical-planner-${process.pid}-frontend.log`),
  stderr: Bun.file(`build/browser/vertical-planner-${process.pid}-frontend-errors.log`),
});
let page: Awaited<ReturnType<typeof openBrowser>> | undefined;
let companionSocket: WebSocket | undefined;
try {
  for (let attempt = 0; attempt < 100; attempt++) {
    try { if ((await fetch(Bun.env.GREYWROUGHT_GAME_URL)).ok) break; } catch {}
    await Bun.sleep(100);
  }
  companionSocket = new WebSocket('ws://127.0.0.1:4302/world');
  await new Promise<void>((resolve, reject) => {
    companionSocket!.onopen = () => companionSocket!.send(JSON.stringify({ type: 'join', character: companion, token: companionToken }));
    companionSocket!.onerror = () => reject(new Error('Companion connection failed'));
    companionSocket!.onmessage = event => { if (JSON.parse(String(event.data)).type === 'state') resolve(); };
  });
  page = await openBrowser('vertical-planner');
  await page.call('Page.addScriptToEvaluateOnNewDocument',{source:`localStorage.setItem('greywrought/local-profile-v1',${JSON.stringify(JSON.stringify({version:1,displayName:'Planner',characters:[character],selectedCharacterId:character.id,savedAtMillis:Date.now()}))});localStorage.setItem('greywrought/world-token',${JSON.stringify(token)});const Native=WebSocket;window.WebSocket=class extends Native{constructor(url,...args){super(String(url).includes('/world')?'ws://127.0.0.1:4302/world':url,...args);this.addEventListener('message',event=>{const d=JSON.parse(event.data);if(d.type==='state')window.planSnapshot=d.snapshot;});}};`});
  await page.reload(); await page.waitFor('document.body.dataset.entryRoute==="roster"');
  await page.click('#entry-enter-world');
  await page.waitFor('document.body.dataset.entryRoute==="world"&&document.body.dataset.rigState==="ready"&&document.querySelectorAll(".combat-plan-portrait[src]").length===3');
  check(await page.evaluate(`(()=>{const rows=[...document.querySelectorAll('.combat-plan-beat')];return rows.length===3&&rows.every((row,i)=>{const p=row.querySelector('.combat-plan-player').getBoundingClientRect(),e=row.querySelector('.combat-plan-enemy').getBoundingClientRect();return Math.abs(p.top-e.top)<1&&p.right<e.left&&(i===0||p.top>rows[i-1].getBoundingClientRect().bottom);});})()`),'Three vertical beats align player and enemy actions');
  check(await page.evaluate(`document.querySelector('.combat-plan-enemy[data-beat="2"]').children.length===3&&[...document.querySelectorAll('.combat-plan-enemy-name')].every(n=>n.textContent.length>2)`),'Three enemy identities share a beat');
  await page.waitFor(`[...document.querySelectorAll('.combat-plan-enemy-target')].every(n=>n.textContent==='→ Mira of Frostwood')`);
  await page.shot('companion-target');
  companionSocket.close();
  await page.waitFor(`[...document.querySelectorAll('.combat-plan-enemy-target')].every(n=>n.textContent==='→ You')`);
  check(await page.evaluate(`[...document.querySelectorAll('.combat-plan-enemy-move')].every(n=>n.dataset.targetId===${JSON.stringify(character.id)})`), 'Enemy targets update from named companion to You on departure');
  await page.click('.adventure-actions [data-action="strike"]');
  await page.waitFor(`document.querySelector('.combat-plan-move[data-queued-action="strike"] .combat-plan-move-target')?.textContent==='→ Cinder Watchman'`);
  await page.evaluate(`document.querySelector('#enemy-intents [data-enemy-id="nest"]').click()`);
  await page.waitFor(`window.planSnapshot.threats.find(t=>t.id==='nest').selected`);
  check(await page.evaluate(`document.querySelector('.combat-plan-move[data-queued-action="strike"] .combat-plan-move-target').textContent==='→ Cinder Watchman'`), 'Queued attack keeps its actual target when selection changes');
  await page.call('Input.dispatchMouseEvent',{type:'mouseMoved',x:20,y:20,buttons:0});
  await page.shot('queued-target-desktop');
  await page.call('Emulation.setDeviceMetricsOverride',{width:600,height:800,deviceScaleFactor:1,mobile:false});
  check(await page.evaluate(`(()=>{const label=document.querySelector('.combat-plan-move-target'),r=label.getBoundingClientRect(),cell=label.closest('.combat-plan-player').getBoundingClientRect();return r.left>=cell.left&&r.right<=cell.right&&r.top>=cell.top&&r.bottom<=cell.bottom;})()`), 'Queued enemy name fits its player beat at narrow width');
  await page.shot('queued-target-narrow');
  await page.call('Emulation.clearDeviceMetricsOverride');
  await page.evaluate(`document.querySelector('#enemy-intents [data-enemy-id="scout"]').click()`);
  await page.waitFor(`window.planSnapshot.threats.find(t=>t.id==='scout').selected`);
  await page.click('.combat-plan-clear');
  await page.waitFor(`document.querySelectorAll('.combat-plan-move').length===0`);
  await page.press('Digit2'); await page.waitFor('document.querySelector(".combat-plan-move")');
  check(await page.evaluate(`document.querySelector('.combat-plan-move-target').textContent==='→ Self'`), 'Block labels its own player as Self');
  await page.click('.combat-plan-delay[data-slot="3"]');
  await page.waitFor(`document.querySelector('.combat-plan-player[data-beat="2"] .combat-plan-move')`);
  await page.evaluate(`(()=>{const move=document.querySelector('.combat-plan-move'),target=document.querySelector('.combat-plan-player[data-beat="1"]'),data=new DataTransfer();move.dispatchEvent(new DragEvent('dragstart',{bubbles:true,dataTransfer:data}));target.dispatchEvent(new DragEvent('drop',{bubbles:true,dataTransfer:data}));})()`);
  await page.waitFor(`document.querySelector('.combat-plan-player[data-beat="1"] .combat-plan-move')`);
  await page.click('.combat-plan-enemy-move[data-threat-id="nest"]');
  await page.call('Input.dispatchMouseEvent',{type:'mouseMoved',x:20,y:20,buttons:0});
  check(await page.evaluate('!document.querySelector(".combat-plan-inspect").hidden&&!document.querySelector(".combat-plan-forecast-summary").hidden&&JSON.parse(document.getElementById("world-canvas").dataset.telegraphs).some(t=>t.enemy==="nest")'),'Pinned preview and forecast survive pointer exit');
  await page.shot('desktop-preview');
  await page.click('.combat-plan-unpin');
  await page.call('Input.dispatchMouseEvent',{type:'mouseMoved',x:20,y:20,buttons:0});
  await page.shot('desktop-plan');
  await page.call('Emulation.setDeviceMetricsOverride',{width:600,height:800,deviceScaleFactor:1,mobile:false});
  check(await page.evaluate(`(()=>{const r=document.getElementById('combat-plan').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<innerHeight;})()`),'Planner remains within narrow viewport');
  await page.click('.combat-plan-enemy-move[data-threat-id="scout"]');
  await page.shot('narrow-plan');
  await page.click('.adventure-actions [data-action="strike"]');
  await page.waitFor('window.planSnapshot.combat.queued.some(move=>move.action==="strike")');
  await page.press('KeyR'); await page.waitFor('window.planSnapshot.combat.phase==="active"');
  await page.waitFor('document.querySelector(\'.combat-plan-enemy-move[data-threat-id="scout"][data-status="cancelled"]\')');
  check(await page.evaluate('getComputedStyle(document.querySelector(\'.combat-plan-enemy-move[data-status="cancelled"] .combat-plan-enemy-art\'),"::after").content.includes("×")'), 'Interrupted action displays a red cross');
  await page.shot('cancelled-move');
  check(page.errors.length===0,'No browser exceptions');
  console.log('PASS queued attack target, Self, named companion and target change to You, vertical geometry, identities/portraits, slot editing, drag retiming, pinned preview/forecast, narrow viewport, Ready and interrupted action',page.output);
} catch(error) {await page?.shot('failure');throw error;}
finally {companionSocket?.close();await page?.close();await service.close();server.stop(true);frontend.kill();await frontend.exited;}
