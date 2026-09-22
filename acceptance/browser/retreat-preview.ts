import { createSharedAdventure } from '../../src/game/adventure.js';
import { createWorldService, type WorldSocketData } from '../../src/server/world-service.js';
import { openBrowser, check } from './session.js';

Bun.env.GREYWROUGHT_GAME_URL = 'http://127.0.0.1:4397/';
Bun.env.GREYWROUGHT_DEBUG_PORT = '9597';
Bun.env.GREYWROUGHT_VULKAN = '1';
const character = { id: 'retreat-fixture', name: 'Planner', archetype: 'warrior' as const, createdAtMillis: 1 };
const token = 'retreat-fixture-token-0000000000000000000';
const seed = createSharedAdventure(); seed.join(character.id, character.name, character.archetype);
const saved = JSON.parse(seed.save());
Object.assign(saved.characters[0].state, { phase: 'expedition', position: { x: -2.5, y: 0, z: 42.5 } });
saved.characters[0].state.combat.phase = 'preparation';
Object.assign(saved.clock, { phase: 'preparation', elapsedSeconds: 0, cycle: 1 });
for (const enemy of saved.world.threats) {
  if (enemy.id === 'scout') {
    const position = { x: -2.5, y: 0, z: 40 };
    Object.assign(enemy, { position, targetPosition: { ...position }, aggro: true, targetPlayerId: character.id, combatants: [character.id], phase: 'preparation', joinCycle: 1, windowCycle: 1, specialOffset: .1, castDuration: .1, remainingSeconds: .1, comboOpened: true });
    Object.assign(enemy.head, { ability: 'ember-beam', opened: true });
  } else if (enemy.active) Object.assign(enemy, { health: 0, phase: 'cleared', lootClaimed: true, respawnAt: Date.now() + 3_600_000 });
}
const savePath = `${process.cwd()}/build/browser/retreat-preview-${process.pid}.json`;
const waiting = createSharedAdventure({ save: JSON.stringify(saved) });
waiting.join(character.id, character.name, character.archetype); waiting.pause(character.id);
await Bun.write(savePath, JSON.stringify({ version: 1, accounts: [{ character, tokenHash: new Bun.CryptoHasher('sha256').update(token).digest('hex') }], world: waiting.save(), chat: [], nextChatId: 1 }));
const service = await createWorldService({ savePath, allowedOrigins: ['http://127.0.0.1:4397'] });
const server = Bun.serve<WorldSocketData>({ hostname: '127.0.0.1', port: 4398, fetch: (request, host) => service.fetch(request, host), websocket: service.websocket });
const frontend = Bun.spawn([process.execPath, 'scripts/dev-server.ts'], { env: { ...Bun.env, GREYWROUGHT_PORT: '4397', GREYWROUGHT_LOCAL_WORLD: '0' }, stdout: Bun.file('build/browser/retreat-frontend.log'), stderr: Bun.file('build/browser/retreat-frontend-errors.log') });
let page: Awaited<ReturnType<typeof openBrowser>> | undefined;
try {
  for (let attempt = 0; attempt < 100; attempt++) { try { if ((await fetch(Bun.env.GREYWROUGHT_GAME_URL)).ok) break; } catch {} await Bun.sleep(100); }
  page = await openBrowser('retreat-preview', { localOnly: true, beforeNavigate: async call => {
    await call('Page.addScriptToEvaluateOnNewDocument', { source: `window.EventSource=class{};
      localStorage.setItem('greywrought/local-profile-v1',${JSON.stringify(JSON.stringify({ version: 1, displayName: 'Planner', characters: [character], selectedCharacterId: character.id, savedAtMillis: Date.now() }))});
      localStorage.setItem('greywrought/world-token',${JSON.stringify(token)});
      const Native=WebSocket;window.WebSocket=class extends Native{constructor(url,...args){super(String(url).includes('/world')?'ws://127.0.0.1:4398/world':url,...args);this.addEventListener('message',event=>{const d=window.decodeWorldMessage(event);if(d.type==='state')window.retreatState=d.snapshot;});}};` });
  } });
  await page.waitFor('document.body.dataset.entryRoute==="roster"');
  await page.evaluate(`(async()=>{const {Scene,Vector3}=await import('three');window.planVector=Vector3;Scene.prototype.onAfterRender=function(renderer,scene,camera){if(camera.isPerspectiveCamera&&renderer.getRenderTarget()===null){window.planCamera=camera;window.planScene=scene;}};})()`);
  await page.click('#entry-enter-world');
  await page.waitFor('document.body.dataset.entryRoute==="world"&&document.body.dataset.rigState==="ready"&&window.retreatState.combat.phase==="preparation"');
  if (await page.evaluate('document.body.dataset.encounterMode==="paused"')) { await page.click('#pause-resume'); await page.waitFor('document.getElementById("pause-panel").hidden'); }
  await page.click('#combat-plan-aim-move');
  await page.waitFor('JSON.parse(document.getElementById("world-canvas").dataset.moveTiles||"[]").length>0&&window.planCamera');
  async function pointAt(x: number, z: number) {
    return page!.evaluate<{x:number;y:number}>(`(()=>{const r=document.getElementById('world-canvas').getBoundingClientRect(),v=new window.planVector(${x},0,${z}).project(window.planCamera);return {x:r.left+(v.x+1)*r.width/2,y:r.top+(1-v.y)*r.height/2};})()`);
  }
  const safe = await pointAt(-5, 42.5);
  await page.call('Input.dispatchMouseEvent', { type: 'mouseMoved', ...safe });
  await page.waitFor('JSON.parse(document.getElementById("world-canvas").dataset.movePreview||"null")?.forecast');
  check(await page.evaluate('!document.getElementById("combat-plan-outcome").textContent.includes("Leaves combat")&&!window.planScene.getObjectByName("move-retreat-warning").visible'), 'Ordinary destination remains unmarked');
  const retreat = await pointAt(-2.5, 47.5);
  await page.call('Input.dispatchMouseEvent', { type: 'mouseMoved', ...retreat });
  await page.waitFor('document.getElementById("combat-plan-outcome").textContent.includes("Leaves combat")&&window.planScene.getObjectByName("move-retreat-warning").visible');
  check(await page.evaluate('document.getElementById("combat-plan-outcome").textContent.includes("Take 8 damage")&&window.planScene.getObjectByName("move-retreat-warning").material.color.getHex()===0xffb74d'), 'Retreat destination is amber and damage remains visible');
  await page.shot('hover-leaves-combat');
  await page.call('Input.dispatchMouseEvent', { type: 'mousePressed', ...retreat, button: 'left', buttons: 1, clickCount: 1 });
  await page.call('Input.dispatchMouseEvent', { type: 'mouseReleased', ...retreat, button: 'left', buttons: 0, clickCount: 1 });
  await page.waitFor('JSON.parse(document.getElementById("world-canvas").dataset.moveRoute||"[]").length>0');
  await page.click('#combat-plan-finish-move');
  await page.waitFor('window.retreatState.combat.queued.some(a=>a.action==="bait")&&document.getElementById("combat-plan-outcome").dataset.source==="plan"&&document.getElementById("combat-plan-outcome").textContent.includes("Leaves combat")');
  check(await page.evaluate('window.planScene.getObjectByName("move-retreat-warning").visible'), 'Committed Move retains the warning tile');
  await page.shot('planned-leaves-combat');
  await page.click('.combat-plan-ready');
  await page.waitFor('!window.retreatState.player.inCombat&&window.retreatState.player.health===92');
  check(await page.evaluate('!window.retreatState.threats.find(t=>t.id==="scout").aggro&&!window.planScene.getObjectByName("move-retreat-warning").visible'), 'Execution agrees with the warning and clears the tile');
  check(page.errors.length === 0, 'No browser exceptions');
  console.log('PASS safe tile, amber retreat hover and committed destination, retained incoming damage, and matching execution', page.output);
} catch (error) { try { await page?.shot('failure'); console.error(await page?.evaluate('({state:window.retreatState,outcome:document.getElementById("combat-plan-outcome")?.textContent,grid:{...document.getElementById("world-canvas")?.dataset}})')); } catch {} throw error; }
finally { await page?.close(); await service.close(); server.stop(true); frontend.kill(); await frontend.exited; }
