import { createSharedAdventure } from '../../src/game/adventure.js';
import { terrainHeight } from '../../src/game/cave-layout.js';
import { createWorldService, type WorldSocketData } from '../../src/server/world-service.js';
import { openBrowser, check } from './session.js';
const forest = Bun.env.CAMERA_SCENERY === 'forest';
const url = 'http://127.0.0.1:4437/';
Object.assign(Bun.env, { GREYWROUGHT_GAME_URL: url, GREYWROUGHT_DEBUG_PORT: '9637', GREYWROUGHT_VULKAN: '1' });
const character = { id: 'camera-grid', name: 'Cave Planner', archetype: 'warrior' as const, createdAtMillis: 1 };
const token = 'camera-grid-token-0000000000000000000';
const seed = createSharedAdventure(); seed.join(character.id, character.name, character.archetype);
const saved = JSON.parse(seed.save()), position = forest ? {x:37,y:terrainHeight(37,-79),z:-79} : { x: 47, y: terrainHeight(47, -46), z: -46 };
Object.assign(saved.characters[0].state, { phase: 'expedition', position });
saved.characters[0].state.combat.phase = 'preparation';
Object.assign(saved.clock, { phase: 'preparation', elapsedSeconds: 0, cycle: 1 });
for (const enemy of saved.world.threats) {
  if (!forest && enemy.id === 'cave-bat') Object.assign(enemy, { position: { ...position, x: 49 }, targetPosition: position, aggro: true, targetPlayerId: character.id, combatants: [character.id], phase: 'preparation', joinCycle: 1, windowCycle: 1 });
  else if (enemy.active) Object.assign(enemy, { health: 0, phase: 'cleared', lootClaimed: true, respawnAt: Date.now() + 3_600_000 });
}
const fixture = createSharedAdventure({save: JSON.stringify(saved)}); const fixturePlayer = fixture.join(character.id, character.name, character.archetype); fixture.advance(.2);
check(fixturePlayer.snapshot.player.inCombat === !forest, 'Fixture begins in the intended combat state');
const savePath = `${process.cwd()}/build/browser/camera-grid-${process.pid}.json`;
await Bun.write(savePath, JSON.stringify({ version: 1, accounts: [{ character, tokenHash: new Bun.CryptoHasher('sha256').update(token).digest('hex') }], world: JSON.stringify(saved), chat: [], nextChatId: 1 }));
const service = await createWorldService({ savePath, allowedOrigins: [url.slice(0, -1)] });
const server = Bun.serve<WorldSocketData>({ hostname: '127.0.0.1', port: 4438, fetch: (request, host) => service.fetch(request, host), websocket: service.websocket });
const frontend = Bun.spawn([process.execPath, Bun.env.CAMERA_STATIC === '1' ? 'scripts/static-server.ts' : 'scripts/dev-server.ts'], { env: { ...Bun.env, GREYWROUGHT_PORT: '4437', GREYWROUGHT_LOCAL_WORLD: '0' }, stdout: Bun.file('build/browser/camera-grid-frontend.log'), stderr: Bun.file('build/browser/camera-grid-errors.log') });
let page: Awaited<ReturnType<typeof openBrowser>> | undefined;
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(url)).ok) break; } catch {} await Bun.sleep(100); }
  page = await openBrowser(forest ? 'camera-forest' : 'camera-obstruction', { beforeNavigate: async call => {
    await call('Page.addScriptToEvaluateOnNewDocument', { source: `window.EventSource=class{};
      localStorage.setItem('greywrought/local-profile-v1',${JSON.stringify(JSON.stringify({ version: 1, displayName: 'Camera Test', characters: [character], selectedCharacterId: character.id, savedAtMillis: Date.now() }))});
      localStorage.setItem('greywrought/world-token',${JSON.stringify(token)});
      const Native=WebSocket;window.WebSocket=class extends Native{constructor(url,...args){super(String(url).includes('/world')?'ws://127.0.0.1:4438/world':url,...args);this.addEventListener('message',e=>{const m=window.decodeWorldMessage(e);if(m.type==='state')window.cameraState=m.snapshot;});}};` });
  } });
  await page.waitFor('document.body.dataset.entryRoute==="roster"');
  await page.evaluate(`(async()=>{const{Scene,Vector3}=await import('three');window.V3=Vector3;Scene.prototype.onAfterRender=function(renderer,scene,camera){if(renderer.domElement.id==='world-canvas'&&camera.isPerspectiveCamera&&scene.children.some(child=>child.userData.localPlayer)){window.scene=scene;window.renderer=renderer;window.camera=camera;}};})()`);
  await page.click('#entry-enter-world');
  await page.waitFor('document.body.dataset.entryRoute==="world"&&document.body.dataset.rigState==="ready"&&document.body.dataset.environmentState==="ready"&&window.cameraState?.player&&window.camera');
  await page.waitFor('document.body.dataset.gamePaused==="false"');
  await page.evaluate(`window.frame=()=>{const p=scene.children.find(child=>child.userData.localPlayer).position,t=new V3(p.x,p.y+1.1,p.z),v=t.clone().project(camera);return {distance:camera.position.distanceTo(t),offset:Math.hypot(v.x,v.y),position:camera.position.toArray()};};
    window.scenery=()=>{const result=[];scene.traverse(o=>{if(o.isMesh&&(o.matrixWorldAutoUpdate===false||o.isInstancedMesh&&o.castShadow||o.name==='Rock_Medium_3'))result.push([o.id,o.visible,o.matrixWorld.elements,o.isInstancedMesh?Array.from(o.instanceMatrix.array):null,[].concat(o.material).map(m=>[m.id,m.transparent,m.opacity,m.depthWrite,m.customProgramCacheKey()])]);});return JSON.stringify(result);};window.initialScenery=scenery();`);
  const start = await page.evaluate<{ distance: number; offset: number; position: number[] }>('frame()');
  check(start.distance > .05 && start.offset < .01, `Obstructed camera keeps the player centered: ${JSON.stringify(start)}`);
  await page.shot(forest ? 'forest-solid-default' : 'cave-solid-default');
  const point = await page.evaluate<{x:number;y:number} | undefined>(`[{x:900,y:450},{x:700,y:150},{x:250,y:250}].find(p=>document.elementFromPoint(p.x,p.y)?.id==='world-canvas')`);
  check(point, 'Camera input receives a point on the world canvas');
  if (!forest) {
    await page.call('Input.dispatchMouseEvent', { type: 'mouseWheel', ...point, deltaX: 0, deltaY: 10000 });
    await Bun.sleep(400);
    const obstructed = await page.evaluate<typeof start>('frame()');
    check(obstructed.distance < 20.9 && obstructed.offset < .01, `The cave roof stops the fully extended 21m boom: ${JSON.stringify(obstructed)}`);
    await page.shot('cave-solid-obstructed');
  }
  await page.call('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point, buttons: 0 });
  await page.call('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'right', buttons: 2, clickCount: 1 });
  for (let step=1;step<=8;step++) await page.call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x+step*15, y: point.y, button: 'right', buttons: 2 });
  await page.call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x+120, y: point.y, button: 'right', buttons: 0, clickCount: 1 });
  await Bun.sleep(400);
  const orbited = await page.evaluate<typeof start>('frame()');
  check(orbited.offset < .01, 'Orbiting around solid scenery keeps the player centered');
  check(await page.evaluate('scenery()===initialScenery'), 'Orbiting preserves scenery visibility, materials and instances');
  await page.shot('solid-orbit');
  await page.call('Input.dispatchMouseEvent', { type: 'mouseWheel', ...point, deltaX: 0, deltaY: -10000 });
  await page.waitFor('Math.hypot(camera.position.x-cameraState.player.position.x,camera.position.z-cameraState.player.position.z)<.05');
  check(await page.evaluate('scenery()===initialScenery'), 'Approaching scenery preserves its solid materials and geometry');
  check(await page.evaluate('Math.abs(camera.position.y-cameraState.player.position.y-1.65)<.05'), 'Manual zoom still reaches eye height');
  await page.shot('first-person-solid-scenery');
  await page.call('Input.dispatchMouseEvent', { type: 'mouseWheel', ...point, deltaX: 0, deltaY: 10000 });
  await page.waitFor('frame().distance>1.8&&frame().offset<.01');
  const restored = await page.evaluate<typeof start>('frame()');
  check(await page.evaluate('scenery()===initialScenery'), 'Returning to third person preserves all static scenery');
  check(page.errors.length === 0, 'Solid scenery camera journey has no browser exceptions');
  await Bun.write(`${page.output}/measurements.json`, JSON.stringify({ start, orbited, restored }, null, 2));
  console.log('PASS camera obstruction', page.output);
} catch(error) { try { await page?.shot('failure'); } catch {} throw error; }
finally { await page?.close(); await service.close(); server.stop(true); frontend.kill(); await frontend.exited; }
