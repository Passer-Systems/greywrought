import { createSharedAdventure } from '../../src/game/adventure.js';
import { supportHeight } from '../../src/game/movement.js';
import { createWorldService, type WorldSocketData } from '../../src/server/world-service.js';
import { openBrowser, check } from './session.js';

const seattleNoon = Date.parse('2026-07-15T12:00:00-07:00');

const url = 'http://127.0.0.1:4397/';
Object.assign(Bun.env, { GREYWROUGHT_GAME_URL: url, GREYWROUGHT_DEBUG_PORT: '9597', GREYWROUGHT_VULKAN: '1' });
const wallNow = Date.now;
let clockOffset = 0;
Date.now = () => wallNow() + clockOffset;
const character = { id: 'corpse-fixture', name: 'Turtle Watcher', archetype: 'warrior' as const, createdAtMillis: 1 };
const token = 'corpse-fixture-token-000000000000000000';
const seed = createSharedAdventure(); seed.join(character.id, character.name, character.archetype);
const saved = JSON.parse(seed.save());
Object.assign(saved.characters[0].state, { phase: 'expedition', position: { x: -4, y: supportHeight(-4, -105), z: -105 } });
for (const threat of saved.world.threats) if (threat.active) {
  Object.assign(threat, { health: 0, phase: 'cleared', lootClaimed: true, respawnAt: Date.now() + (threat.id === 'pond-turtle' ? 120_000 : 3_600_000) });
}
const savePath = `${process.cwd()}/build/browser/turtle-corpse-${process.pid}.json`;
await Bun.write(savePath, JSON.stringify({ version: 1, accounts: [{ character, tokenHash: new Bun.CryptoHasher('sha256').update(token).digest('hex') }], world: JSON.stringify(saved), chat: [], nextChatId: 1 }));
const service = await createWorldService({ savePath, allowedOrigins: [url.slice(0, -1)] });
const server = Bun.serve<WorldSocketData>({ hostname: '127.0.0.1', port: 4398, fetch: (request, host) => service.fetch(request, host), websocket: service.websocket });
const frontend = Bun.spawn([process.execPath, 'scripts/dev-server.ts'], {
  env: { ...Bun.env, GREYWROUGHT_PORT: '4397', GREYWROUGHT_LOCAL_WORLD: '0' },
  stdout: Bun.file(`build/browser/turtle-corpse-${process.pid}-frontend.log`), stderr: Bun.file(`build/browser/turtle-corpse-${process.pid}-frontend-errors.log`),
});
let page: Awaited<ReturnType<typeof openBrowser>> | undefined;
try {
  for (let attempt = 0; attempt < 100; attempt++) {
    try { if ((await fetch(url)).ok) break; } catch {}
    await Bun.sleep(100);
  }
  page = await openBrowser('turtle-corpse', { localOnly: true, beforeNavigate: async call => {
    await call('Page.addScriptToEvaluateOnNewDocument', { source: `window.EventSource=class{};
      localStorage.setItem('greywrought/local-profile-v1',${JSON.stringify(JSON.stringify({ version: 1, displayName: character.name, characters: [character], selectedCharacterId: character.id, savedAtMillis: Date.now() }))});
      localStorage.setItem('greywrought/world-token',${JSON.stringify(token)});
      const Native=WebSocket;window.WebSocket=class extends Native{
        constructor(url,...args){super(String(url).includes('/world')?'ws://127.0.0.1:4398/world':url,...args);}
        set onmessage(callback){super.onmessage=e=>{const m=JSON.parse(e.data);if((m.type==='state'||m.type==='stateDelta')){m.serverWallTimeMillis=${seattleNoon};window.corpseState=window.decodeWorldMessage(e,m).snapshot;}callback?.call(this,new MessageEvent('message',{data:JSON.stringify(m)}));};}
      };` });
  } });
  await page.waitFor('document.body.dataset.entryRoute==="roster"');
  await page.evaluate(`(async()=>{const {Scene,Vector3,Box3}=await import('three');window.THREE={Vector3,Box3};Scene.prototype.onAfterRender=function(renderer,scene,camera){if(renderer.domElement.id==='world-canvas'){window.corpseScene=scene;window.corpseCamera=camera;}};})()`);
  await page.click('#entry-enter-world');
  await page.waitFor('document.body.dataset.entryRoute==="world"&&document.body.dataset.creatureRigState==="ready"&&document.body.dataset.environmentState==="ready"&&!!window.corpseScene',25000);
  if (await page.evaluate('document.body.dataset.encounterMode==="paused"')) {
    await page.click('#pause-resume'); await page.waitFor('document.body.dataset.gamePaused==="false"');
  }
  await page.evaluate(`void(window.turtle=window.corpseScene.children.find(o=>o.userData.threatId==='pond-turtle'))`);
  await page.waitFor('Math.abs(window.turtle.getObjectByName("TurtleBody").rotation.z-Math.PI/2)<.01');
  check(await page.evaluate(`(()=>{const t=window.corpseState.threats.find(t=>t.id==='pond-turtle'),p=window.corpseState.player.position;return t.corpseVisible&&Math.hypot(t.position.x-p.x,t.position.z-p.z)>3&&!window.corpseState.loot.some(l=>l.sourceId===t.id&&l.available);})()`), 'Fixture is a visible corpse outside loot range');
  const point = await page.evaluate<{ x: number; y: number }>(`(()=>{const p=window.turtle.getObjectByName('Shell').getWorldPosition(new window.THREE.Vector3()).project(window.corpseCamera),r=document.getElementById('world-canvas').getBoundingClientRect();return{x:r.left+(p.x+1)*r.width/2,y:r.top+(1-p.y)*r.height/2};})()`);
  check(await page.evaluate(`document.elementFromPoint(${point.x},${point.y})?.id==='world-canvas'`), 'Corpse is visible and unobscured at the normal camera');
  await page.call('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', buttons: 1, clickCount: 1 });
  await page.call('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', buttons: 0, clickCount: 1 });
  await page.waitFor('document.getElementById("target-frame").dataset.targetId==="pond-turtle"&&document.getElementById("target-frame").textContent.includes("Dead")');
  check(await page.evaluate(`document.querySelector('.adventure-actions [data-action="strike"]').disabled`), 'Attack is disabled for the selected corpse');
  check(await page.evaluate(`JSON.parse(document.body.dataset.selectedUnit).id==='pond-turtle'`), 'Dead target remains selected');
  await page.shot('turtle-corpse-selected');
  clockOffset = 61_000;
  await page.waitFor('!window.corpseState.threats.find(t=>t.id==="pond-turtle").corpseVisible&&!window.turtle.children[0].visible&&JSON.parse(document.body.dataset.selectedUnit)===null');
  check(await page.evaluate('document.getElementById("target-frame").dataset.targetId!=="pond-turtle"'), 'Target clears with corpse disappearance');
  clockOffset = 121_000;
  await page.waitFor('window.corpseState.threats.find(t=>t.id==="pond-turtle").health>0&&window.turtle.children[0].visible&&Math.abs(window.turtle.getObjectByName("TurtleBody").rotation.z)<.01');
  await page.shot('turtle-respawn-upright');
  check(page.errors.length === 0, 'No browser exceptions');
  console.log('PASS visible pond corpse selection outside loot range, Dead frame, disabled Attack, disappearance clears selection, upright respawn', page.output);
} catch (error) { try { await page?.shot('failure'); } catch {} throw error; }
finally { await page?.close(); await service.close(); server.stop(true); frontend.kill(); await frontend.exited; Date.now = wallNow; }
