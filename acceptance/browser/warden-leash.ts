import { createSharedAdventure } from '../../src/game/adventure.js';
import { terrainHeight } from '../../src/game/cave-layout.js';
import { createWorldService, type WorldSocketData } from '../../src/server/world-service.js';
import type { AdventureSnapshot } from '../../src/game/adventure-types.js';
import { openBrowser, check } from './session.js';

const url = 'http://127.0.0.1:4515/';
Object.assign(Bun.env, { GREYWROUGHT_GAME_URL: url, GREYWROUGHT_DEBUG_PORT: '9715', GREYWROUGHT_VULKAN: '1' });
const character = { id: 'warden-leash-fixture', name: 'Warden Tester', archetype: 'hunter' as const, createdAtMillis: 1 };
const token = 'warden-leash-fixture-token-00000000000000';
const point = (x: number, z: number) => ({ x, y: terrainHeight(x,z), z });
const seed = createSharedAdventure(); seed.join(character.id, character.name, character.archetype);
const saved = JSON.parse(seed.save());
Object.assign(saved.characters[0].state, { phase: 'expedition', position: point(-2.5,42.5), selectedThreat: 'warder' });
for (const enemy of saved.world.threats) {
  if (enemy.id === 'warder') Object.assign(enemy, { health: 100, position: point(-2.5,50) });
  else if (enemy.active) Object.assign(enemy, { health: 0, phase: 'cleared', aggro: false, lootClaimed: true, respawnAt: Date.now() + 3600000 });
}
const savePath = `${process.cwd()}/build/browser/warden-leash-${process.pid}.json`;
const staged = createSharedAdventure({ save: JSON.stringify(saved) });
staged.join(character.id, character.name, character.archetype);
staged.advance(.01);
check(staged.pause(character.id), 'Fixture preserves the planned encounter while the browser connects');
await Bun.write(savePath, JSON.stringify({ version: 1, accounts: [{ character, tokenHash: new Bun.CryptoHasher('sha256').update(token).digest('hex') }], world: staged.save(), chat: [], nextChatId: 1 }));
const service = await createWorldService({ savePath, allowedOrigins: [url.slice(0,-1)] });
const server = Bun.serve<WorldSocketData>({ hostname: '127.0.0.1', port: 4516, fetch: (request, host) => service.fetch(request,host), websocket: service.websocket });
const frontend = Bun.spawn([process.execPath, 'scripts/dev-server.ts'], { env: { ...Bun.env, GREYWROUGHT_PORT: '4515' }, stdout: Bun.file('build/browser/warden-leash-frontend.log'), stderr: Bun.file('build/browser/warden-leash-errors.log') });
let page: Awaited<ReturnType<typeof openBrowser>> | undefined;
try {
  for (let attempt=0;attempt<100;attempt++) { try { if ((await fetch(url)).ok) break; } catch {} await Bun.sleep(100); }
  page = await openBrowser('warden-leash', { beforeNavigate: async call => {
    await call('Network.enable'); await call('Network.setBlockedURLs', { urls: [url+'__dev/events'] });
    await call('Page.addScriptToEvaluateOnNewDocument', { source: `
      localStorage.setItem('greywrought/local-profile-v1',${JSON.stringify(JSON.stringify({ version:1, displayName:'Warden Tester', characters:[character], selectedCharacterId:character.id, savedAtMillis:1 }))});
      localStorage.setItem('greywrought/world-token',${JSON.stringify(token)});
      localStorage.setItem('greywrought/combat-auto-ready-v1','false');
      window.profileHistory=[]; const Native=WebSocket;
      window.WebSocket=class extends Native { constructor(url,...args) { super(String(url).includes('/world')?'ws://127.0.0.1:4516/world':url,...args); this.addEventListener('message',event=>{const data=JSON.parse(event.data); if(data.type==='state'){window.profileState=data.snapshot;window.profileHistory.push(data.snapshot);}}); } };` });
  } });
  await page.waitFor('document.body.dataset.entryRoute==="roster"'); await page.click('#entry-enter-world');
  await page.waitFor('document.body.dataset.entryRoute==="world"&&document.body.dataset.rigState==="ready"&&document.body.dataset.environmentState==="ready"&&window.profileState?.combat.phase==="preparation"');
  await page.click('#pause-resume');
  await page.waitFor('document.getElementById("pause-panel").hidden');
  await page.evaluate(`(async()=>{const {Scene,Vector3}=await import('three');Scene.prototype.onAfterRender=function(renderer,scene,camera){if(renderer.domElement.id==='world-canvas'&&camera.isPerspectiveCamera&&renderer.getRenderTarget()===null){window.profileCamera=camera;window.profileScene=scene;window.profileRenderer=renderer;}};window.projectProfile=p=>{const v=new Vector3(p.x,p.y,p.z).project(window.profileCamera),r=document.getElementById('world-canvas').getBoundingClientRect();return{x:r.left+(v.x+1)*r.width/2,y:r.top+(1-v.y)*r.height/2};};})()`);
  await page.click('#combat-plan-aim-move');
  await page.waitFor('Boolean(window.profileCamera)&&JSON.parse(document.getElementById("world-canvas").dataset.moveTiles||"[]").length>0');
  await page.call("Input.dispatchMouseEvent",{type:"mouseMoved",x:1050,y:180,buttons:0});
  await page.call("Input.dispatchMouseEvent",{type:"mousePressed",x:1050,y:180,button:"right",buttons:2});
  await page.call("Input.dispatchMouseEvent",{type:"mouseMoved",x:450,y:180,button:"right",buttons:2});
  await page.call("Input.dispatchMouseEvent",{type:"mouseReleased",x:450,y:180,button:"right",buttons:0});
  await Bun.sleep(300);
  const destination = point(-2.5,37.5);
  const screen = await page.evaluate<{ x:number; y:number }>(`window.projectProfile(${JSON.stringify(destination)})`);
  check(await page.evaluate(`document.elementFromPoint(${screen.x},${screen.y})?.id==='world-canvas'`),'Sidestep tile is visible and clickable');
  await page.call('Input.dispatchMouseEvent',{type:'mouseMoved',...screen,buttons:0});
  await page.shot('warden-retreat-preview');
  await page.call('Input.dispatchMouseEvent',{type:'mousePressed',...screen,button:'left',buttons:1});
  await page.call('Input.dispatchMouseEvent',{type:'mouseReleased',...screen,button:'left',buttons:0});
  await page.click('#combat-plan-finish-move');
  await page.waitFor('window.profileState.combat.queued.some(entry=>entry.action==="bait")');
  const planned = await page.evaluate<AdventureSnapshot>('window.profileState');
  const forecast = planned.combat.forecast!;
  check(!forecast.events.some(event=>event.kind==='retreat'&&event.sourceId==='warder'),'Forecast keeps the Warden engaged beyond its old boundary');
  await page.click('.combat-plan-ready');
  await page.waitFor('window.profileState.combat.phase==="active"');
  await page.waitFor(`window.profileState.combat.phase==='preparation'&&window.profileState.combat.cycle>${planned.combat.cycle}`);
  const actual = await page.evaluate<AdventureSnapshot>('window.profileState');
  const warden = actual.threats.find(enemy=>enemy.id==='warder')!;
  check(actual.player.position.z===37.5,'The planned retreat reaches its selected tile');
  check(warden.aggro&&actual.player.inCombat,'Warden keeps pursuing after the retreat');
  check(warden.health===100,'The wounded Warden does not reset or heal');
  for (const id of [character.id,'warder']) {
    const health = id===character.id ? actual.player.health : warden.health;
    check(health===forecast.outcomes.find(outcome=>outcome.id===id)!.health,'Actual '+id+' health agrees with the forecast');
  }
  await page.shot('warden-pursues-after-retreat');
  check(page.errors.length===0,'No browser exceptions');
  console.log('PASS Warden movement preview, clickable retreat, continued pursuit and matching networked execution',page.output);
} catch(error) { await page?.shot('failure'); console.error(await page?.evaluate('({snapshot:window.profileState,preview:document.getElementById("world-canvas")?.dataset.movePreview})')); throw error; }
finally { await page?.close(); await service.close(); server.stop(true); frontend.kill(); await frontend.exited; }
