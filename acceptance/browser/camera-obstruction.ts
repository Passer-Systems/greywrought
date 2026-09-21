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
const frontend = Bun.spawn([process.execPath, 'scripts/dev-server.ts'], { env: { ...Bun.env, GREYWROUGHT_PORT: '4437', GREYWROUGHT_LOCAL_WORLD: '0' }, stdout: Bun.file('build/browser/camera-grid-frontend.log'), stderr: Bun.file('build/browser/camera-grid-errors.log') });
let page: Awaited<ReturnType<typeof openBrowser>> | undefined;
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(url)).ok) break; } catch {} await Bun.sleep(100); }
  page = await openBrowser(forest ? 'camera-forest' : 'camera-obstruction', { beforeNavigate: async call => {
    await call('Page.addScriptToEvaluateOnNewDocument', { source: `window.EventSource=class{};
      localStorage.setItem('greywrought/local-profile-v1',${JSON.stringify(JSON.stringify({ version: 1, displayName: 'Camera Test', characters: [character], selectedCharacterId: character.id, savedAtMillis: Date.now() }))});
      localStorage.setItem('greywrought/world-token',${JSON.stringify(token)});
      const Native=WebSocket;window.WebSocket=class extends Native{constructor(url,...args){super(String(url).includes('/world')?'ws://127.0.0.1:4438/world':url,...args);this.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.type==='state')window.cameraState=m.snapshot;});}};` });
  } });
  await page.waitFor('document.body.dataset.entryRoute==="roster"');
  await page.evaluate(`(async()=>{const{Scene,Vector3}=await import('three');window.V3=Vector3;Scene.prototype.onAfterRender=function(renderer,scene,camera){if(renderer.domElement.id==='world-canvas'){window.scene=scene;window.renderer=renderer;window.camera=camera;}};})()`);
  await page.click('#entry-enter-world');
  await page.waitFor('document.body.dataset.rigState==="ready"&&document.body.dataset.environmentState==="ready"&&window.cameraState?.player&&window.camera');
  await page.waitFor(`(()=>{let found=false;scene.traverse(o=>{if(o.isMesh)for(const m of [].concat(o.material))if(renderer.properties.get(m).uniforms?.cutawayEnabled)found=true;});return found;})()`, 30000);
  await page.evaluate(`window.cutaway=(()=>{let found;scene.traverse(o=>{if(o.isMesh)for(const m of [].concat(o.material))if(renderer.properties.get(m).uniforms?.cutawayEnabled)found=renderer.properties.get(m).uniforms;});return found;})();
    window.frame=()=>{const p=cameraState.player.position,t=new V3(p.x,p.y+1.1,p.z),v=t.clone().project(camera);return {distance:camera.position.distanceTo(t),offset:Math.hypot(v.x,v.y),position:camera.position.toArray()};};
    window.scenery=()=>{const result=[];scene.traverse(o=>{if(o.isMesh&&[].concat(o.material).some(m=>m.customProgramCacheKey().includes('scenery-cutaway')))result.push([o.id,o.visible,(o.matrixWorldAutoUpdate===false||o.isInstancedMesh||o.name==='Rock_Medium_3')?o.matrixWorld.elements:null,o.isInstancedMesh?Array.from(o.instanceMatrix.array):null]);});return JSON.stringify(result);};window.initialScenery=scenery();`);
  const start = await page.evaluate<{ distance: number; offset: number; position: number[] }>('frame()');
  check(start.distance >= 14.9 && start.offset < .01, 'Roof obstruction preserves the chosen orbit and player framing');
  check(await page.evaluate('cutaway.cutawayGround.value.w>=10'), 'Surrounding ground is revealed before selecting Move');
  await page.shot(forest ? 'forest-before-move' : 'cave-before-move');
  if (!forest) {
    await page.click('[data-action="bait"]');
    await page.waitFor('JSON.parse(document.getElementById("world-canvas").dataset.moveTiles).length>3');
  }
  await Bun.sleep(400);
  const pixels = await page.evaluate<{ changed: number; unchanged: number; restored: number; distantChanged: number; groundPatched: boolean; instanceCount: number }>(`(()=>{
    const gl=renderer.getContext(),w=renderer.domElement.width,h=renderer.domElement.height;
    const draw=enabled=>{cutaway.cutawayEnabled.value=enabled;renderer.render(scene,camera);const p=new Uint8Array(w*h*4);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,p);return p;};
    const faded=draw(1),solid=draw(0),again=draw(1);let changed=0,unchanged=0,restored=0,distantChanged=0;
    for(let i=0;i<faded.length;i+=4){const d=Math.abs(faded[i]-solid[i])+Math.abs(faded[i+1]-solid[i+1])+Math.abs(faded[i+2]-solid[i+2]);if(d>6){changed++;if(i/4/w>h*.92)distantChanged++;}else unchanged++;if(Math.abs(faded[i]-again[i])+Math.abs(faded[i+1]-again[i+1])+Math.abs(faded[i+2]-again[i+2])>6)restored++;}
    let groundPatched=false,instanceCount=0;scene.traverse(o=>{if(!o.isMesh)return;const patched=[].concat(o.material).some(m=>m.customProgramCacheKey().includes('scenery-cutaway'));if(o.userData.walkableGround&&patched)groundPatched=true;if(o.isInstancedMesh&&patched)instanceCount+=o.count;});
    return {changed,unchanged,restored,distantChanged,groundPatched,instanceCount};})()`);
  console.log('rendered cutaway', JSON.stringify(pixels));
  check(pixels.changed > 1000, 'Cutaway actually reveals ground through the obstruction');
  if (forest) check(pixels.distantChanged === 0, 'The distant canopy above the expanded ground view remains intact');
  else check(pixels.unchanged > pixels.changed * 2, 'Most of the world remains visually intact');
  check(pixels.restored < 20, 'Clearing and restoring obstruction gives a stable rendered result');
  check(!pixels.groundPatched && pixels.instanceCount > 100, 'Ground remains solid and instanced scenery retains its batches');
  await page.shot(forest ? 'forest-ground-revealed' : 'cave-grid-revealed');
  let destination;
  if (!forest) {
  destination = await page.evaluate<{ x: number; y: number; z: number; screenX: number; screenY: number }>(`(()=>{const r=renderer.domElement.getBoundingClientRect();return JSON.parse(renderer.domElement.dataset.moveTiles).map(t=>{const v=new V3(t.x,t.y+.06,t.z).project(camera);return {...t,screenX:r.left+(v.x+1)*r.width/2,screenY:r.top+(1-v.y)*r.height/2};}).find(t=>Math.hypot(t.x-cameraState.player.position.x,t.z-cameraState.player.position.z)>1&&t.screenX>250&&t.screenX<innerWidth-300&&t.screenY>100&&t.screenY<innerHeight-260&&document.elementFromPoint(t.screenX,t.screenY)?.id==='world-canvas');})()`);
  check(destination, 'A movement destination is visible through the obstruction');
  for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await page.call('Input.dispatchMouseEvent', { type, x: destination.screenX, y: destination.screenY, button: type === 'mouseMoved' ? 'none' : 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1 });
  await page.click('#combat-plan-finish-move');
  await page.waitFor(`cameraState.combat.queued.some(m=>m.action==='bait'&&m.destination?.x===${destination.x}&&m.destination?.z===${destination.z})`);
  }
  check(await page.evaluate('scenery()===initialScenery'), 'Fading and selecting preserve scenery visibility, static transforms and instances');
  const end = await page.evaluate<typeof start>('frame()');
  check(Math.abs(end.distance-start.distance)<.01, 'Selecting a grid tile does not pull the camera in');
  await page.call('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 850, y: 400, deltaX: 0, deltaY: -10000 });
  await page.waitFor('cutaway.cutawayEnabled.value===0');
  await page.shot('first-person-solid-scenery');
  check(page.errors.length === 0, 'Obstructed grid journey has no browser exceptions');
  await Bun.write(`${page.output}/measurements.json`, JSON.stringify({ start, end, pixels, destination }, null, 2));
  console.log('PASS camera obstruction', page.output);
} catch(error) { try { await page?.shot('failure'); } catch {} throw error; }
finally { await page?.close(); await service.close(); server.stop(true); frontend.kill(); await frontend.exited; }
