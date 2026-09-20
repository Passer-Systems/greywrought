import { createSharedAdventure } from '../../src/game/adventure.js';
import { terrainHeight } from '../../src/game/cave-layout.js';
import { createWorldService, type WorldSocketData } from '../../src/server/world-service.js';
import type { AdventureSnapshot, Position } from '../../src/game/adventure-types.js';
import { check, openBrowser } from './session.js';

const url = 'http://127.0.0.1:4321/';
Bun.env.GREYWROUGHT_GAME_URL = url;
Bun.env.GREYWROUGHT_DEBUG_PORT = '9521';
Bun.env.GREYWROUGHT_VULKAN = '1';
const character = { id: 'grid-fixture', name: 'Grid Explorer', archetype: 'mage' as const, createdAtMillis: Date.now() };
const token = 'grid-fixture-token-000000000000000000';
const seed = createSharedAdventure(); seed.join(character.id, character.name, character.archetype);
const saved = JSON.parse(seed.save());
Object.assign(saved.characters[0].state, { phase: 'expedition', position: { x: 26, y: 0, z: -46 } });
// A wounded bat keeps the input/render journey short; the rules tests cover full fights.
for (const threat of saved.world.threats) {
  if (threat.id === 'cave-bat') threat.health = 18;
  else if (threat.active) Object.assign(threat, { health: 0, phase: 'cleared', lootClaimed: true, respawnAt: Date.now() + 3_600_000 });
}
const savePath = `${process.cwd()}/build/browser/grid-${process.pid}.json`;
await Bun.write(savePath, JSON.stringify({ version: 1, accounts: [{ character, tokenHash: new Bun.CryptoHasher('sha256').update(token).digest('hex') }], world: JSON.stringify(saved), chat: [], nextChatId: 1 }));
const service = await createWorldService({ savePath, allowedOrigins: [url.slice(0, -1)] });
const server = Bun.serve<WorldSocketData>({ hostname: '127.0.0.1', port: 4322, fetch: (request, host) => service.fetch(request, host), websocket: service.websocket });
const frontend = Bun.spawn(['bun', 'scripts/dev-server.ts'], { env: { ...Bun.env, GREYWROUGHT_PORT: '4321' }, stdout: Bun.file('build/browser/grid-frontend.log'), stderr: Bun.file('build/browser/grid-frontend-errors.log') });
let page: Awaited<ReturnType<typeof openBrowser>> | undefined;
const gap = (a: Position, b: Position) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(url)).ok) break; } catch {} await Bun.sleep(100); }
  page = await openBrowser('grid-combat', { beforeNavigate: async call => {
    await call('Page.addScriptToEvaluateOnNewDocument', { source: `localStorage.setItem('greywrought/local-profile-v1',${JSON.stringify(JSON.stringify({ version: 1, displayName: 'Grid Test', characters: [character], selectedCharacterId: character.id, savedAtMillis: Date.now() }))});localStorage.setItem('greywrought/world-token',${JSON.stringify(token)});const Native=WebSocket;window.WebSocket=class extends Native{constructor(url,...args){super(String(url).includes('/world')?'ws://127.0.0.1:4322/world':url,...args);this.addEventListener('message',event=>{const d=JSON.parse(event.data);if(d.type==='state'){window.gridState=d.snapshot;window.gridSession=d.session;}});}};` });
  } });
  const browser = page;
  async function enter() {
    await browser.waitFor('document.body.dataset.entryRoute==="roster"');
    await browser.click('#entry-enter-world');
    await browser.waitFor('document.body.dataset.rigState==="ready"&&document.body.dataset.creatureRigState==="ready"&&document.body.dataset.environmentState==="ready"');
    await browser.evaluate(`(async()=>{const {Scene,Vector3}=await import('three');window.gridFrames=[];Scene.prototype.onAfterRender=function(renderer,scene,camera){window.gridCamera=camera;this.traverse(object=>{if(object.userData.localPlayer)window.gridRendered={x:object.position.x,y:object.position.y,z:object.position.z};});};window.projectGridPoint=(p)=>{const v=new Vector3(p.x,p.y,p.z).project(window.gridCamera),r=document.getElementById('world-canvas').getBoundingClientRect();return {x:r.left+(v.x+1)*r.width/2,y:r.top+(1-v.y)*r.height/2};};})()`);
  }
  async function snapshot() { return browser.evaluate<AdventureSnapshot>('window.gridState'); }
  async function cycle() {
    const cycle = (await snapshot()).combat.cycle;
    await browser.press('KeyR');
    await browser.waitFor(`window.gridState.combat.phase==='active'||window.gridState.combat.cycle>${cycle}||!window.gridState.player.inCombat`);
    await browser.waitFor(`window.gridState.combat.phase!=='active'&&(window.gridState.combat.cycle>${cycle}||!window.gridState.player.inCombat)`, 10000);
  }
  async function clickGround(position: Position) {
    const point = await browser.evaluate<{ x: number; y: number }>(`window.projectGridPoint(${JSON.stringify(position)})`);
    check(await browser.evaluate(`document.elementFromPoint(${point.x},${point.y})?.id==='world-canvas'`), 'Planned destination must be visible ground');
    await browser.call('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', buttons: 1, clickCount: 1 });
    await browser.call('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', buttons: 0, clickCount: 1 });
  }
  await enter();
  await page.key('KeyA', true);
  await page.waitFor('window.gridState.player.inCombat');
  await page.waitFor('window.gridState.combat.phase==="preparation"&&document.getElementById("world-canvas").dataset.combatGrid==="2.5"');
  const entered = await snapshot();
  check(entered.player.position.y < -1, 'Walking into the cave descends before combat');
  check(entered.player.position.x % 2.5 === 0 && entered.player.position.z % 2.5 === 0, 'Combat entry settles on a cell');
  await Bun.sleep(450); await page.key('KeyA', false);
  check(gap((await snapshot()).player.position, entered.player.position) < .001, 'Held exploration input stops immediately on combat entry');
  await page.key('KeyW', true); await page.press('Space');
  await page.call('Input.dispatchMouseEvent', { type: 'mousePressed', x: 800, y: 350, button: 'left', buttons: 1, clickCount: 1 });
  await page.call('Input.dispatchMouseEvent', { type: 'mousePressed', x: 800, y: 350, button: 'right', buttons: 3, clickCount: 1 });
  await Bun.sleep(450);
  await page.call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 800, y: 350, button: 'right', buttons: 1, clickCount: 1 });
  await page.call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 800, y: 350, button: 'left', buttons: 0, clickCount: 1 });
  await page.key('KeyW', false);
  const stopped = await snapshot();
  check(gap(stopped.player.position, entered.player.position) < .001, 'WASD, jump and mouse-forward stay locked while planning');
  check(gap(await page.evaluate<Position>('window.gridRendered'), entered.player.position) < .05, 'Rendered player matches the stationary server position');
  check(gap(stopped.threats.find(t => t.id === 'cave-bat')!.position, entered.threats.find(t => t.id === 'cave-bat')!.position) < .001, 'Enemy waits on its cell during planning');
  await page.shot('cave-grid-planning');
  await page.click('.adventure-actions [data-action="bait"]');
  const destination = { x: entered.player.position.x + 2.5, z: entered.player.position.z };
  await clickGround({ ...destination, y: terrainHeight(destination.x, destination.z) });
  await page.waitFor('window.gridState.combat.queued.length===1');
  await cycle();
  const moved = await snapshot();
  check(gap(moved.player.position, entered.player.position) > 2, 'Planned Bait moves during its beat');
  check(moved.player.position.x % 2.5 === 0 && moved.player.position.z % 2.5 === 0, 'Planned move ends on a cell');
  check(Math.abs(moved.player.position.y - terrainHeight(moved.player.position.x, moved.player.position.z)) < .05, 'Planned movement follows the cave slope');
  await page.key('KeyD', true); await Bun.sleep(250); await page.key('KeyD', false);
  check(gap((await snapshot()).player.position, moved.player.position) < .001, 'Next planning phase remains locked');
  await page.click('#pause-toggle');
  await page.waitFor('window.gridSession.mode==="paused"');
  await page.reload(); await enter();
  await page.waitFor('window.gridSession.mode==="paused"');
  check((await snapshot()).player.inCombat, 'Reload retains the paused encounter');
  await page.click('#pause-resume');
  await page.waitFor('window.gridSession.mode==="private"');
  await page.click('#encounter-rejoin');
  await page.waitFor('window.gridSession.mode==="shared"&&window.gridState.combat.phase==="preparation"');
  await page.click('.enemy-nameplate[data-enemy-id="cave-bat"] .nameplate-target');
  await page.click('.adventure-actions [data-action="strike"]');
  await page.click('.adventure-actions [data-action="strike"]');
  await page.waitFor('window.gridState.combat.queued.length===2');
  check(await page.evaluate('document.querySelector(".combat-plan-move-target").textContent.includes("Hollowwing")'), 'Planner names the creature being attacked');
  await cycle();
  await page.waitFor('!window.gridState.player.inCombat&&document.getElementById("world-canvas").dataset.combatGrid==="0"');
  const cleared = await snapshot(), corpse = cleared.threats.find(t => t.id === 'cave-bat')!.position;
  const dx = corpse.x - cleared.player.position.x;
  if (Math.abs(dx) > 1.5) { await page.key(dx > 0 ? 'KeyA' : 'KeyD', true); await Bun.sleep((Math.abs(dx) - 1.5) / 5.2 * 1000); await page.key(dx > 0 ? 'KeyA' : 'KeyD', false); }
  const dz = corpse.z - (await snapshot()).player.position.z;
  if (Math.abs(dz) > 1) { await page.key(dz > 0 ? 'KeyW' : 'KeyS', true); await Bun.sleep((Math.abs(dz) - 1) / (dz > 0 ? 5.2 : 5.2 * .55) * 1000); await page.key(dz > 0 ? 'KeyW' : 'KeyS', false); }
  await page.press('KeyF'); await page.waitFor('window.gridState.lootOpenId==="cave-bat"');
  await page.click('#loot-item'); await page.waitFor('window.gridState.carriedSalvage===3');
  const beforeWalk = (await snapshot()).player.position;
  await page.key('KeyD', true); await Bun.sleep(500); await page.key('KeyD', false);
  check(gap((await snapshot()).player.position, beforeWalk) > 1, 'Exploration movement resumes after victory');
  await page.shot('cave-grid-victory');
  check(page.errors.length === 0, 'No browser exceptions');
  console.log('PASS cave descent, combat-entry lock, server/render agreement, mouse/jump/WASD lock, visible grid, planned movement, pause/reload, creature targeting, victory loot and exploration', page.output);
} catch (error) { await page?.shot('failure'); throw error; }
finally { await page?.close(); await service.close(); server.stop(true); frontend.kill(); await frontend.exited; }
