import { createSharedAdventure } from '../../src/game/adventure.js';
import { terrainHeight } from '../../src/game/cave-layout.js';
import { createWorldService, type WorldSocketData } from '../../src/server/world-service.js';
import type { AdventureSnapshot } from '../../src/game/adventure-types.js';
import { openBrowser, check } from './session.js';

const url = 'http://127.0.0.1:4347/';
Object.assign(Bun.env, { GREYWROUGHT_GAME_URL: url, GREYWROUGHT_DEBUG_PORT: '9547', GREYWROUGHT_VULKAN: '1' });
const character = { id: 'attack-profiles-fixture', name: 'Bait Tester', archetype: 'warrior' as const, createdAtMillis: 1 };
const token = 'attack-profiles-fixture-token-00000000000000';
const point = (x: number, z: number) => ({ x, y: terrainHeight(x,z), z });
const seed = createSharedAdventure(); seed.join(character.id, character.name, character.archetype);
const saved = JSON.parse(seed.save());
Object.assign(saved.characters[0].state, { phase: 'expedition', position: point(0,30), selectedThreat: 'scout' });
saved.clock = { phase: 'preparation', cycle: 1, elapsedSeconds: 0 };
for (const enemy of saved.world.threats) {
  if (enemy.active) Object.assign(enemy, { health: 0, phase: 'cleared', aggro: false, lootClaimed: true, respawnAt: Date.now() + 3600000 });
  if (enemy.id === 'scout' || enemy.id === 'nest') {
    Object.assign(enemy, { health: enemy.maximumHealth, active: true, aggro: true, lootClaimed: false, respawnAt: null,
      phase: enemy.id === 'scout' ? 'preparation' : 'recovery', staggered: enemy.id === 'nest', comboOpened: true,
      position: enemy.id === 'scout' ? point(-7.5,30) : point(2.5,31.65), targetPlayerId: character.id,
      combatants: [character.id], joinCycle: 1, windowCycle: 1, specialOffset: .6, castDuration: .6, remainingSeconds: .6 });
    if (enemy.head) Object.assign(enemy.head, { opened: true, ability: 'fireball' });
  }
}
const savePath = `${process.cwd()}/build/browser/attack-profiles-${process.pid}.json`;
const staged = createSharedAdventure({ save: JSON.stringify(saved) });
staged.join(character.id, character.name, character.archetype);
check(staged.pause(character.id), 'Fixture preserves the planned encounter while the browser connects');
await Bun.write(savePath, JSON.stringify({ version: 1, accounts: [{ character, tokenHash: new Bun.CryptoHasher('sha256').update(token).digest('hex') }], world: staged.save(), chat: [], nextChatId: 1 }));
const service = await createWorldService({ savePath, allowedOrigins: [url.slice(0,-1)] });
const server = Bun.serve<WorldSocketData>({ hostname: '127.0.0.1', port: 4348, fetch: (request, host) => service.fetch(request,host), websocket: service.websocket });
const frontend = Bun.spawn([process.execPath, 'scripts/dev-server.ts'], { env: { ...Bun.env, GREYWROUGHT_PORT: '4347' }, stdout: Bun.file('build/browser/attack-profiles-frontend.log'), stderr: Bun.file('build/browser/attack-profiles-errors.log') });
let page: Awaited<ReturnType<typeof openBrowser>> | undefined;
try {
  for (let attempt=0;attempt<100;attempt++) { try { if ((await fetch(url)).ok) break; } catch {} await Bun.sleep(100); }
  page = await openBrowser('attack-profiles', { beforeNavigate: async call => {
    await call('Network.enable'); await call('Network.setBlockedURLs', { urls: [url+'__dev/events'] });
    await call('Page.addScriptToEvaluateOnNewDocument', { source: `
      localStorage.setItem('greywrought/local-profile-v1',${JSON.stringify(JSON.stringify({ version:1, displayName:'Bait Tester', characters:[character], selectedCharacterId:character.id, savedAtMillis:1 }))});
      localStorage.setItem('greywrought/world-token',${JSON.stringify(token)});
      localStorage.setItem('greywrought/combat-auto-ready-v1','false');
      window.profileHistory=[]; const Native=WebSocket;
      window.WebSocket=class extends Native { constructor(url,...args) { super(String(url).includes('/world')?'ws://127.0.0.1:4348/world':url,...args); this.addEventListener('message',event=>{const data=JSON.parse(event.data); if(data.type==='state'){window.profileState=data.snapshot;window.profileHistory.push(data.snapshot);}}); } };` });
  } });
  await page.waitFor('document.body.dataset.entryRoute==="roster"'); await page.click('#entry-enter-world');
  await page.waitFor('document.body.dataset.entryRoute==="world"&&document.body.dataset.rigState==="ready"&&document.body.dataset.environmentState==="ready"&&window.profileState?.combat.phase==="preparation"');
  await page.click('#pause-resume');
  await page.waitFor('document.getElementById("pause-panel").hidden');
  await page.evaluate(`(async()=>{const {Scene,Vector3}=await import('three');Scene.prototype.onAfterRender=function(renderer,scene,camera){if(renderer.domElement.id==='world-canvas'&&camera.isPerspectiveCamera&&renderer.getRenderTarget()===null)window.profileCamera=camera;};window.projectProfile=p=>{const v=new Vector3(p.x,p.y,p.z).project(window.profileCamera),r=document.getElementById('world-canvas').getBoundingClientRect();return{x:r.left+(v.x+1)*r.width/2,y:r.top+(1-v.y)*r.height/2};};})()`);
  const shot = '.combat-plan-enemy-move[data-threat-id="scout"]';
  check(await page.evaluate(`document.querySelector('${shot} .combat-plan-enemy-behavior').textContent==='Straight shot'`),'Planner identifies the straight shot before committing');
  await page.click('#combat-plan-aim-move');
  await page.waitFor('Boolean(window.profileCamera)&&JSON.parse(document.getElementById("world-canvas").dataset.moveTiles||"[]").length>0');
  const destination = point(0,35);
  const screen = await page.evaluate<{ x:number; y:number }>(`window.projectProfile(${JSON.stringify(destination)})`);
  check(await page.evaluate(`document.elementFromPoint(${screen.x},${screen.y})?.id==='world-canvas'`),'Sidestep tile is visible and clickable');
  await page.call('Input.dispatchMouseEvent',{type:'mouseMoved',...screen,buttons:0});
  await page.waitFor('document.getElementById("combat-plan-outcome").textContent.includes("friendly fire")');
  check(await page.evaluate('document.getElementById("combat-plan-outcome").textContent.includes("No damage")'),'Hover predicts that the player avoids the shot');
  await page.shot('sidestep-friendly-fire');
  await page.call('Input.dispatchMouseEvent',{type:'mousePressed',...screen,button:'left',buttons:1});
  await page.call('Input.dispatchMouseEvent',{type:'mouseReleased',...screen,button:'left',buttons:0});
  await page.click('#combat-plan-finish-move');
  await page.waitFor('window.profileState.combat.queued.some(entry=>entry.action==="bait")');
  const planned = await page.evaluate<AdventureSnapshot>('window.profileState');
  const forecast = planned.combat.forecast!;
  check(forecast.events.some(event=>event.kind==='hit'&&event.sourceId==='scout'&&event.targetId==='nest'),'The committed forecast includes the intercepted shot');
  const initialBee = planned.threats.find(enemy=>enemy.id==='nest')!.health;
  await page.click('.combat-plan-ready');
  await page.waitFor('window.profileState.combat.phase==="active"');
  await page.waitFor(`window.profileState.combat.phase==='preparation'&&window.profileState.combat.cycle>${planned.combat.cycle}`);
  const actual = await page.evaluate<AdventureSnapshot>('window.profileState');
  check(actual.player.health===100,'The player actually avoids the straight projectile');
  check(actual.threats.find(enemy=>enemy.id==='nest')!.health===initialBee-18,'The enemy behind takes the projectile damage');
  for (const id of [character.id,'scout','nest']) {
    const health = id===character.id ? actual.player.health : actual.threats.find(enemy=>enemy.id===id)!.health;
    check(health===forecast.outcomes.find(outcome=>outcome.id===id)!.health,`Actual ${id} health agrees with the forecast`);
  }
  await page.shot('friendly-fire-result');
  check(page.errors.length===0,'No browser exceptions');
  console.log('PASS straight-shot intent, clickable sidestep, friendly-fire preview and matching networked execution',page.output);
} catch(error) { await page?.shot('failure'); console.error(await page?.evaluate('({snapshot:window.profileState,preview:document.getElementById("world-canvas")?.dataset.movePreview})')); throw error; }
finally { await page?.close(); await service.close(); server.stop(true); frontend.kill(); await frontend.exited; }
