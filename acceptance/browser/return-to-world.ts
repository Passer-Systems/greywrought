import { createSharedAdventure } from '../../src/game/adventure.js';
import { supportHeight } from '../../src/game/movement.js';
import { createWorldService, type WorldSocketData } from '../../src/server/world-service.js';
import type { ServerWorldMessage } from '../../src/game/multiplayer-types.js';
import { openBrowser, check } from './session.js';

const url = 'http://127.0.0.1:4491/';
Object.assign(Bun.env, { GREYWROUGHT_GAME_URL: url, GREYWROUGHT_DEBUG_PORT: '9691', GREYWROUGHT_VULKAN: '1' });
const characters = [
  { id: 'return-fighter', name: 'Return Tester', archetype: 'mage' as const, createdAtMillis: 1 },
  { id: 'water-jumper', name: 'Water Jumper', archetype: 'hunter' as const, createdAtMillis: 2 },
];
const token = 'return-browser-fixture-00000000000000000000';
const seed = createSharedAdventure();
for (const c of characters) seed.join(c.id, c.name, c.archetype);
const saved = JSON.parse(seed.save());
Object.assign(saved.characters[0].state, { phase: 'expedition', position: { x: -3, y: supportHeight(-3,28), z: 28 } });
Object.assign(saved.characters[1].state, { phase: 'expedition', position: { x: -27, y: supportHeight(-27,-95), z: -95 } });
for (const threat of saved.world.threats) {
  if (threat.id === 'scout') Object.assign(threat, { health: 5, position: { x: -3, y: supportHeight(-3,32), z: 32 } });
  else if (threat.active) Object.assign(threat, { health: 0, phase: 'cleared', lootClaimed: true, respawnAt: Date.now() + 3_600_000 });
}
const savePath = `${process.cwd()}/build/browser/return-${process.pid}.json`;
await Bun.write(savePath, JSON.stringify({ version: 1, accounts: characters.map(character => ({ character, tokenHash: new Bun.CryptoHasher('sha256').update(token).digest('hex') })), world: JSON.stringify(saved), chat: [], nextChatId: 1 }));
const service = await createWorldService({ savePath, allowedOrigins: [url.slice(0,-1)] });
const server = Bun.serve<WorldSocketData>({ hostname: '127.0.0.1', port: 4492, fetch: (r,h) => service.fetch(r,h), websocket: service.websocket });
const frontend = Bun.spawn([process.execPath, 'scripts/dev-server.ts'], { env: { ...Bun.env, GREYWROUGHT_PORT: '4491', GREYWROUGHT_LOCAL_WORLD: '0' }, stdout: Bun.file('build/browser/return-frontend.log'), stderr: Bun.file('build/browser/return-frontend-errors.log') });
let page: Awaited<ReturnType<typeof openBrowser>> | undefined;
type State = Extract<ServerWorldMessage, { type: 'state' }>;
try {
  for (let i=0; i<100; i++) { try { if ((await fetch(url)).ok) break; } catch {} await Bun.sleep(100); }
  page = await openBrowser('return-to-world', { localOnly: true, beforeNavigate: async call => {
    await call('Page.addScriptToEvaluateOnNewDocument', { source: `window.EventSource=class{};
      localStorage.setItem('greywrought/local-profile-v1',${JSON.stringify(JSON.stringify({ version:1, displayName:'Return Test', characters, selectedCharacterId:characters[0]!.id,savedAtMillis:Date.now() }))});
      localStorage.setItem('greywrought/world-token',${JSON.stringify(token)});
      const Native=WebSocket;window.WebSocket=class extends Native{constructor(url,...args){super(String(url).includes('/world')?'ws://127.0.0.1:4492/world':url,...args);this.addEventListener('message',event=>{const d=window.decodeWorldMessage(event);if(d.type==='state')window.returnState=d;});}};` });
  } });
  await page.waitFor('document.body.dataset.entryRoute==="roster"');
  await page.evaluate(`(async()=>{const{Scene}=await import('three');Scene.prototype.onAfterRender=function(renderer,scene,camera){if(renderer.domElement.id==='world-canvas'&&renderer.getRenderTarget()===null&&camera.isPerspectiveCamera){window.testScene=scene;window.testCamera=camera;}};})()`);
  await page.click('#entry-enter-world');
  await page.waitFor('document.body.dataset.entryRoute==="world"&&document.body.dataset.rigState==="ready"&&!!window.testScene', 30000);
  await page.waitFor('document.body.dataset.gameInCombat==="true"');
  await page.click('#pause-toggle');
  await page.waitFor('document.body.dataset.encounterMode==="paused"');
  const before = await page.evaluate<State>('window.returnState');
  await page.click('#pause-resume');
  await page.waitFor('document.body.dataset.encounterMode==="private"&&document.body.dataset.gameCombatPhase==="preparation"');
  await page.click('.adventure-actions [data-action="strike"]');
  await page.click('.combat-plan-ready');
  await page.waitFor('document.body.dataset.encounterMode==="viewing"', 15000);
  const viewing = await page.evaluate<State>('window.returnState');
  check(viewing.snapshot.threats.find(t=>t.id==='scout')!.health > 0, 'Viewing must immediately show the living main-world enemy');
  check(viewing.session.returnPlan!.remainingSeconds > 10, 'Combat end starts a fresh 15-second choice');
  check(viewing.snapshot.carriedSalvage === before.snapshot.carriedSalvage && viewing.snapshot.cargo === before.snapshot.cargo, 'Private kill gives no rewards');
  check(!viewing.snapshot.player.inCombat, 'Ethereal viewer stays outside main combat');
  check(await page.evaluate('document.getElementById("encounter-title").textContent==="Viewing main world"'), 'Preview names main world');
  const enemy = viewing.snapshot.threats.find(t=>t.id==='scout')!.position;
  await page.key('KeyS',true); await Bun.sleep(700); await page.key('KeyS',false);
  const later = await page.evaluate<State>('window.returnState');
  check(Math.hypot(later.snapshot.threats.find(t=>t.id==='scout')!.position.x-enemy.x,later.snapshot.threats.find(t=>t.id==='scout')!.position.z-enemy.z) > .05, 'Main enemy keeps moving with only a viewer online');
  check(JSON.stringify(later.snapshot.player.position)===JSON.stringify(viewing.snapshot.player.position), 'Movement cannot move an ethereal viewer');
  const target = await page.evaluate<{ x:number; y:number; position:{x:number;y:number;z:number} }>(`(()=>{
    const r=document.getElementById('world-canvas').getBoundingClientRect();
    const markers=window.testScene.getObjectByName('return-preview-spots').children;
    for(const marker of markers){
      if(marker.userData.returnDangerous||marker.scale.x>1)continue;
      const p=marker.position.clone().project(window.testCamera),x=r.x+(p.x+1)*r.width/2,y=r.y+(1-p.y)*r.height/2;
      if(p.z<1&&document.elementFromPoint(x,y)?.id==='world-canvas')return{x,y,position:marker.userData.returnSpot};
    }
    throw Error('No visible safe return marker');
  })()`);
  await page.call('Input.dispatchMouseEvent',{type:'mouseMoved',x:target.x,y:target.y,buttons:0});
  await page.call('Input.dispatchMouseEvent',{type:'mousePressed',x:target.x,y:target.y,button:'left',buttons:1,clickCount:1});
  await page.call('Input.dispatchMouseEvent',{type:'mouseReleased',x:target.x,y:target.y,button:'left',buttons:0,clickCount:1});
  await page.waitFor(`Math.hypot(window.returnState.session.returnPlan.destination.x-(${target.position.x}),window.returnState.session.returnPlan.destination.z-(${target.position.z}))<.01`);
  check(await page.evaluate('window.returnState.session.mode==="viewing"&&!window.returnState.session.returnPlan.confirmed'), 'Selecting a spot previews without confirming');
  await page.shot('ethereal-main-world');
  await page.click('#encounter-rejoin');
  await page.waitFor('document.body.dataset.encounterMode==="shared"');
  const returned = await page.evaluate<State>('window.returnState');
  check(Math.hypot(returned.snapshot.player.position.x-target.position.x,returned.snapshot.player.position.z-target.position.z)<.01,'Materialize at selected spot');
  check(returned.snapshot.player.health===later.snapshot.player.health,'Returning preserves remaining health');
  await Bun.sleep(900); await page.shot('materialized');

  await page.click('#pause-open'); await page.click('#pause-tab-settings'); await page.click('#return-roster');
  await page.waitFor('document.body.dataset.entryRoute==="roster"');
  await page.click('[data-character-id="water-jumper"]'); await page.click('#entry-enter-world');
  await page.waitFor('document.body.dataset.entryRoute==="world"&&document.body.dataset.rigState==="ready"&&window.returnState.snapshot.player.archetype==="hunter"',30000);
  const surface = supportHeight(-27,-95);
  await page.key('Space',true);
  await page.waitFor(`window.returnState.snapshot.player.position.y>${surface+.3}`);
  await page.shot('water-surface-jump'); await page.key('Space',false);
  await page.waitFor(`Math.abs(window.returnState.snapshot.player.position.y-(${surface}))<.01`);
  await page.key('ControlLeft',true); await Bun.sleep(650); await page.key('ControlLeft',false);
  check(await page.evaluate(`window.returnState.snapshot.player.position.y<${surface-.5}`),'Ctrl dives beneath surface');
  await page.key('Space',true); await page.waitFor(`Math.abs(window.returnState.snapshot.player.position.y-(${surface}))<.01`); await page.key('Space',false);
  check(await page.evaluate('window.returnState.snapshot.player.health===100'),'Diving remains harmless');
  check(page.errors.length===0,'No browser exceptions');
  console.log('PASS automatic live-world preview, intangible input, visible marker selection, confirmation, surface jump and underwater ascent', page.output);
} catch(error) { await page?.shot('failure'); throw error; }
finally { await page?.close(); await service.close(); server.stop(true); frontend.kill(); await frontend.exited; }
