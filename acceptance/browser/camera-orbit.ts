import { createSharedAdventure } from '../../src/game/adventure.js';
import { terrainHeight } from '../../src/game/cave-layout.js';
import { createWorldService, type WorldSocketData } from '../../src/server/world-service.js';
import { openBrowser, check } from './session.js';

const before = Bun.env.CAMERA_PHASE === 'before';
const url = 'http://127.0.0.1:4435/';
Object.assign(Bun.env, { GREYWROUGHT_GAME_URL: url, GREYWROUGHT_DEBUG_PORT: '9635', GREYWROUGHT_VULKAN: '1' });
const locations = [{ id: 'town', x: 0, z: -1 }, { id: 'hill', x: -30, z: -75 }, { id: 'cave', x: 47, z: -46 }];
const characters = locations.map(location => ({ id: `camera-${location.id}`, name: 'Camera Walker', archetype: 'alchemist' as const, createdAtMillis: 1 }));
const token = 'camera-fixture-token-0000000000000000000';
const seed = createSharedAdventure();
for (const character of characters) seed.join(character.id, character.name, character.archetype);
const saved = JSON.parse(seed.save());
for (const [index, location] of locations.entries()) Object.assign(saved.characters[index].state, {
  phase: location.id === 'town' ? 'town' : 'expedition', position: { x: location.x, y: terrainHeight(location.x, location.z), z: location.z },
});
for (const enemy of saved.world.threats) if (enemy.active) Object.assign(enemy, { health: 0, phase: 'cleared', lootClaimed: true, respawnAt: Date.now() + 3_600_000 });
const savePath = `${process.cwd()}/build/browser/camera-${process.pid}.json`;
await Bun.write(savePath, JSON.stringify({ version: 1, accounts: characters.map(character => ({ character, tokenHash: new Bun.CryptoHasher('sha256').update(token).digest('hex') })), world: JSON.stringify(saved), chat: [], nextChatId: 1 }));
const service = await createWorldService({ savePath, allowedOrigins: [url.slice(0, -1)] });
const server = Bun.serve<WorldSocketData>({ hostname: '127.0.0.1', port: 4436, fetch: (request, host) => service.fetch(request, host), websocket: service.websocket });
const frontend = Bun.spawn([process.execPath, before ? 'scripts/static-server.ts' : 'scripts/dev-server.ts'], {
  env: { ...Bun.env, GREYWROUGHT_PORT: '4435', GREYWROUGHT_LOCAL_WORLD: '0' },
  stdout: Bun.file('build/browser/camera-frontend.log'), stderr: Bun.file('build/browser/camera-frontend-errors.log'),
});
let page: Awaited<ReturnType<typeof openBrowser>> | undefined;
interface CameraFrame { camera: { x: number; y: number; z: number }; player: { x: number; y: number; z: number }; direction: { x: number; y: number; z: number }; offset: { x: number; y: number }; viewOffset: boolean; }
const reports: { name: string; frame: CameraFrame }[] = [];
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(url)).ok) break; } catch {} await Bun.sleep(100); }
  page = await openBrowser(`camera-${before ? 'before' : 'after'}`, { beforeNavigate: async call => {
    await call('Page.addScriptToEvaluateOnNewDocument', { source: `window.EventSource=class{};
      localStorage.setItem('greywrought/local-profile-v1',${JSON.stringify(JSON.stringify({ version: 1, displayName: 'Camera Test', characters, selectedCharacterId: characters[0]!.id, savedAtMillis: Date.now() }))});
      localStorage.setItem('greywrought/world-token',${JSON.stringify(token)});
      const Native=WebSocket;window.WebSocket=class extends Native{constructor(url,...args){super(String(url).includes('/world')?'ws://127.0.0.1:4436/world':url,...args);this.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.type==='state')window.cameraState=m.snapshot;});}};` });
  } });
  async function enter() {
    await page!.waitFor('document.body.dataset.entryRoute==="roster"');
    await page!.evaluate(`(async()=>{window.cameraFrame=null;const{Scene,Vector3}=await import('three');Scene.prototype.onAfterRender=function(renderer,scene,camera){
      if(renderer.domElement.id!=='world-canvas')return;window.cameraScene=scene;
      let player;scene.traverse(o=>{if(o.userData.localPlayer)player=o;});if(!player)return;
      const anchor=player.position.clone().add(new Vector3(0,1.1,0)).project(camera),rect=renderer.domElement.getBoundingClientRect();
      window.cameraFrame={camera:camera.position.clone(),player:player.position.clone(),direction:camera.getWorldDirection(new Vector3()),offset:{x:anchor.x*rect.width/2,y:-anchor.y*rect.height/2},viewOffset:!!camera.view?.enabled};
      if(window.trackCamera)window.cameraFrames.push(window.cameraFrame);
    };})()`);
    await page!.click('#entry-enter-world');
    await page!.waitFor('document.body.dataset.rigState==="ready"&&document.body.dataset.environmentState==="ready"&&!!window.cameraFrame');
    await page!.waitFor('document.body.dataset.gamePaused==="false"');
    await page!.evaluate(`window.sceneryState=()=>{const items=[];window.cameraScene.traverse(o=>{if(o.isMesh&&(o.matrixWorldAutoUpdate===false||o.isInstancedMesh&&o.castShadow||o.name==='Rock_Medium_3')){let visible=true;for(let p=o;p;p=p.parent)visible&&=p.visible;items.push([o.id,visible,o.matrixWorld.elements,o.isInstancedMesh?Array.from(o.instanceMatrix.array):null]);}});return JSON.stringify(items);};window.initialScenery=window.sceneryState();`);
    check(await page!.evaluate(`(()=>{let rocks=0;window.cameraScene.traverse(o=>{if(o.isMesh&&o.name==='Rock_Medium_3')rocks++;});return rocks>20;})()`), 'Scenery comparison includes the cave walls and roof');
  }
  async function capture(name: string, assertCentered = true) {
    await Bun.sleep(450);
    const frame = await page!.evaluate<CameraFrame>('window.cameraFrame');
    reports.push({ name, frame }); console.log(name, JSON.stringify(frame));
    await page!.shot(name);
    if (!before && assertCentered) {
      check(Math.hypot(frame.offset.x, frame.offset.y) < 4, `${name}: character torso stays at screen center`);
      check(!frame.viewOffset, `${name}: HUD does not shift the camera projection`);
      check(frame.camera.y >= terrainHeight(frame.camera.x, frame.camera.z) + .1, `${name}: camera stays above ground`);
    }
    return frame;
  }
  async function drag(dy: number, dx = 0) {
    const start = { x: 900, y: dy < 0 ? 550 : 160 };
    await page!.call('Input.dispatchMouseEvent', { type: 'mouseMoved', ...start, buttons: 0 });
    await page!.call('Input.dispatchMouseEvent', { type: 'mousePressed', ...start, button: 'right', buttons: 2, clickCount: 1 });
    for (let step = 1; step <= 10; step++) await page!.call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: start.x + dx * step / 10, y: start.y + dy * step / 10, button: 'right', buttons: 2 });
    await page!.call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: start.x + dx, y: start.y + dy, button: 'right', buttons: 0, clickCount: 1 });
  }
  await enter();
  const normal = await capture('town-default');
  await drag(-390);
  const low = await capture('town-looking-up');
  if (before) {
    check(Math.abs(normal.offset.y) > 20, 'Reproduces the visible upward framing offset');
    check(low.direction.y < 0, 'Reproduces the inability to look upward');
  } else {
    check(low.direction.y > 0, 'Camera can aim upward into the sky past the centered player');
    check(Math.hypot(low.camera.x - low.player.x, low.camera.z - low.player.z) >= 5, 'Low angle keeps a readable distance instead of clipping into the character');
    check(low.camera.y - terrainHeight(low.camera.x, low.camera.z) < 1, 'Camera reaches ground level');
    check(await page.evaluate('window.sceneryState()===window.initialScenery'), 'Town scenery remains visible and unchanged when camera lowers');
    await page.call('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 900, y: 450, deltaX: 0, deltaY: 1500 });
    const far = await capture('town-low-zoomed-out');
    check(far.direction.y > 0, 'Zooming out preserves the upward camera angle');
    check(Math.hypot(far.camera.x - far.player.x, far.camera.z - far.player.z) > Math.hypot(low.camera.x - low.player.x, low.camera.z - low.player.z) + 2, 'Zooming out at ground level actually moves the camera farther away');
    await drag(390);
    await capture('town-overhead');
    await page.call('Emulation.setDeviceMetricsOverride', { width: 1100, height: 760, deviceScaleFactor: 1, mobile: false });
    await capture('town-resized');
    await page.call('Emulation.clearDeviceMetricsOverride');
    for (const location of ['hill', 'cave']) {
      await page.click('#pause-open'); await page.click('#pause-tab-settings'); await page.click('#return-roster');
      await page.waitFor('document.body.dataset.entryRoute==="roster"'); await page.click(`[data-character-id="camera-${location}"]`); await enter();
      const expected = locations.find(entry => entry.id === location)!;
      await page.waitFor(`window.cameraState.player.position.x===${expected.x}&&window.cameraState.player.position.z===${expected.z}`);
      const normal = await capture(`${location}-default`);
      if (location === 'cave') check(Math.hypot(normal.camera.x-normal.player.x, normal.camera.y-normal.player.y-1.1, normal.camera.z-normal.player.z) < 13, 'Cave ceiling pulls camera closer to the player');
      if (location === 'hill') {
        await page.evaluate('window.cameraFrames=[];window.trackCamera=true');
        await page.key('KeyW', true); await Bun.sleep(1800); await page.key('KeyW', false);
        const frames = await page.evaluate<CameraFrame[]>('window.trackCamera=false;window.cameraFrames');
        check(frames.length > 30 && frames.at(-1)!.player.z > frames[0]!.player.z + 5, 'Character actually runs down the hill');
        check(frames.every(frame => Math.hypot(frame.offset.x, frame.offset.y) < 4), 'Camera keeps the moving character centered on slopes');
      }
      await drag(-390);
      await capture(`${location}-low`);
      check(await page.evaluate('window.sceneryState()===window.initialScenery'), `${location}: trees, rocks and cave geometry remain intact during camera motion`);
    }
  }
  await Bun.write(`${page.output}/measurements.json`, JSON.stringify(reports, null, 2));
  check(page.errors.length === 0, 'Camera journey has no browser exceptions');
  console.log('PASS camera journey', page.output);
} catch (error) { try { await page?.shot('failure'); } catch {} throw error; }
finally { await page?.close(); await service.close(); server.stop(true); frontend.kill(); await frontend.exited; }
