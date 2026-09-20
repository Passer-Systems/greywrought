import { createSharedAdventure } from '../../src/game/adventure.js';
import { terrainHeight } from '../../src/game/cave-layout.js';
import { WORLD_DAY_MILLISECONDS } from '../../src/game/world-time.js';
import { createWorldService, type WorldSocketData } from '../../src/server/world-service.js';
import { openBrowser, check } from './session.js';

const label = Bun.env.LIGHTING_PHASE ?? 'after';
const url = 'http://127.0.0.1:4431/';
Object.assign(Bun.env, { GREYWROUGHT_GAME_URL: url, GREYWROUGHT_DEBUG_PORT: '9631', GREYWROUGHT_VULKAN: '1' });
const locations = [{ id: 'town', x: 0, z: -18 }, { id: 'field', x: -30, z: -75 }, { id: 'cave', x: 47, z: -46 }];
const characters = locations.map(location => ({ id: `light-${location.id}`, name: 'Light Walker', archetype: 'warrior' as const, createdAtMillis: 1 }));
const token = 'lighting-fixture-token-0000000000000000000';
const seed = createSharedAdventure();
for (const character of characters) seed.join(character.id, character.name, character.archetype);
const saved = JSON.parse(seed.save());
for (const [index, location] of locations.entries()) Object.assign(saved.characters[index].state, {
  phase: location.id === 'town' ? 'town' : 'expedition', position: { x: location.x, y: terrainHeight(location.x, location.z), z: location.z },
});
for (const enemy of saved.world.threats) if (enemy.active) Object.assign(enemy, { health: 0, phase: 'cleared', lootClaimed: true, respawnAt: Date.now() + 3_600_000 });
const savePath = `${process.cwd()}/build/browser/day-night-${label}-${process.pid}.json`;
await Bun.write(savePath, JSON.stringify({ version: 1, accounts: characters.map(character => ({ character, tokenHash: new Bun.CryptoHasher('sha256').update(token).digest('hex') })), world: JSON.stringify(saved), chat: [], nextChatId: 1 }));
const service = await createWorldService({ savePath, allowedOrigins: [url.slice(0, -1)] });
const server = Bun.serve<WorldSocketData>({ hostname: '127.0.0.1', port: 4432, fetch: (request, host) => service.fetch(request, host), websocket: service.websocket });
const frontend = Bun.spawn([process.execPath, label === 'before' ? 'scripts/static-server.ts' : 'scripts/dev-server.ts'], {
  env: { ...Bun.env, GREYWROUGHT_PORT: '4431', GREYWROUGHT_LOCAL_WORLD: '0' },
  stdout: Bun.file(`build/browser/day-night-${label}-frontend.log`), stderr: Bun.file(`build/browser/day-night-${label}-frontend-errors.log`),
});
let page: Awaited<ReturnType<typeof openBrowser>> | undefined;
const reports: Record<string, unknown>[] = [];
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(url)).ok) break; } catch {} await Bun.sleep(100); }
  page = await openBrowser(`day-night-${label}`, { beforeNavigate: async call => {
    await call('Page.addScriptToEvaluateOnNewDocument', { source: `window.EventSource=class{};
      if(!localStorage.getItem('greywrought/local-profile-v1'))localStorage.setItem('greywrought/local-profile-v1',${JSON.stringify(JSON.stringify({ version: 1, displayName: 'Lighting Test', characters, selectedCharacterId: characters[0]!.id, savedAtMillis: Date.now() }))});
      localStorage.setItem('greywrought/world-token',${JSON.stringify(token)});
      window.lightingHour=12;window.lightSamples=[];window.measureLight=false;window.lastLightFrame=0;
      const raf=requestAnimationFrame;window.requestAnimationFrame=callback=>raf(now=>{const start=performance.now();callback(now);if(window.measureLight&&callback.name==='tick'){window.lightSamples.push({duration:performance.now()-start,interval:window.lastLightFrame?now-window.lastLightFrame:0});window.lastLightFrame=now;}});
      const Native=WebSocket;window.WebSocket=class extends Native{
        constructor(url,...args){super(String(url).includes('/world')?'ws://127.0.0.1:4432/world':url,...args);}
        set onmessage(callback){super.onmessage=event=>{const message=JSON.parse(event.data);if(message.type==='state'){message.serverWallTimeMillis=Math.floor(message.serverWallTimeMillis/${WORLD_DAY_MILLISECONDS})*${WORLD_DAY_MILLISECONDS}+window.lightingHour/24*${WORLD_DAY_MILLISECONDS};window.lightingState=message;}callback?.call(this,new MessageEvent('message',{data:JSON.stringify(message)}));};}
      };` });
  } });
  async function enter() {
    await page!.waitFor('document.body.dataset.entryRoute==="roster"');
    await page!.evaluate(`(async()=>{window.lightingScene=null;const{Scene}=await import('three');Scene.prototype.onAfterRender=function(renderer,scene,camera){if(renderer.domElement.id!=='world-canvas')return;window.lightingScene=scene;window.lightingRenderer=renderer;window.lightRender={...renderer.info.render};};})()`);
    await page!.click('#entry-enter-world');
    await page!.waitFor('document.body.dataset.rigState==="ready"&&document.body.dataset.environmentState==="ready"&&!!window.lightingScene');
    if (await page!.evaluate('document.body.dataset.encounterMode==="paused"')) await page!.click('#pause-resume');
    await page!.waitFor('document.body.dataset.gamePaused==="false"');
    if (await page!.evaluate('document.body.dataset.encounterMode==="private"')) {
      await page!.click('#encounter-rejoin');
      await page!.waitFor('document.body.dataset.encounterMode==="shared"');
    }
  }
  async function capture(location: string, hour: number, phase: string) {
    await page!.evaluate(`window.lightingHour=${hour}`);
    const expected = locations.find(entry => entry.id === location)!;
    await page!.waitFor(`window.lightingState?.snapshot.player.position.x===${expected.x}&&window.lightingState?.snapshot.player.position.z===${expected.z}`);
    if (label !== 'before') await page!.waitFor(`Number(document.getElementById('world-canvas').dataset.worldHour)===${hour}`);
    await Bun.sleep(900);
    await page!.evaluate('window.lightSamples=[];window.lastLightFrame=0;window.measureLight=true');
    await Bun.sleep(2200);
    const data = await page!.evaluate<{ samples: { duration: number; interval: number }[]; scene: Record<string, unknown>; calls: number }>(`(()=>{
      window.measureLight=false;const scene=window.lightingScene,renderer=window.lightingRenderer,lights=[],casters=[],receivers=[];
      scene.traverse(o=>{if(o.isLight)lights.push({name:o.name,type:o.type,intensity:o.intensity,color:o.color.getHex(),position:o.position.toArray(),shadow:o.castShadow,shadowSize:o.shadow?.mapSize.toArray(),hasShadowMap:!!o.shadow?.map});if(o.isMesh){if(o.castShadow)casters.push(o.id);if(o.receiveShadow)receivers.push(o.id);}});
      return{samples:window.lightSamples,calls:window.lightRender.calls,scene:{skyZenith:scene.getObjectByName('sky')?.material.uniforms.zenith.value.getHex(),fog:scene.fog?.color.getHex(),lights,casters:casters.length,receivers:receivers.length,shadowsEnabled:renderer.shadowMap.enabled,canvas:{...renderer.domElement.dataset}}};})()`);
    const durations = data.samples.map(sample => sample.duration).sort((a, b) => a - b);
    check(durations.length > 30, 'Lighting measurement renders actual frames');
    const report = { location, phase, hour, callbackMedianMs: durations[Math.floor(durations.length * .5)], callbackP95Ms: durations[Math.floor(durations.length * .95)], ...data.scene, calls: data.calls };
    reports.push(report); console.log(JSON.stringify(report));
    await page!.shot(`${location}-${phase}`);
    if (label !== 'before' && location !== 'cave') {
      check(data.scene.shadowsEnabled && Number(data.scene.casters) > 10 && Number(data.scene.receivers) > 10, 'Outdoor scene has real caster and receiver geometry');
      const lights = data.scene.lights as { shadow: boolean; intensity: number; hasShadowMap: boolean }[];
      check(lights.some(light => light.shadow && light.hasShadowMap && ((hour !== 12 && hour !== 0) || light.intensity > 0)), 'A celestial light produces a real shadow map');
    }
  }
  await enter(); console.log('Lighting baseline/source loaded', label);
  await capture('town', 12, 'day');
  if (label !== 'before') {
    await capture('town', 18, 'dusk'); await capture('town', 0, 'night'); await capture('town', 6, 'dawn');
    for (const location of ['field', 'cave']) {
      await page.click('#pause-open');
      await page.click('#pause-tab-settings');
      await page.click('#return-roster');
      await page.waitFor('document.body.dataset.entryRoute==="roster"');
      await page.click(`[data-character-id="light-${location}"]`);
      await enter();
      await capture(location, 12, 'day'); await capture(location, 0, 'night');
    }
    const town = reports.filter(report => report.location === 'town');
    check(new Set(town.map(report => report.skyZenith)).size > 2, 'Sky palette visibly changes across the day');
    const daylight = (town.find(report => report.phase === 'day')!.lights as { type: string; intensity: number }[]).filter(light => light.type === 'DirectionalLight').reduce((sum, light) => sum + light.intensity, 0);
    const moonlight = (town.find(report => report.phase === 'night')!.lights as { type: string; intensity: number }[]).filter(light => light.type === 'DirectionalLight').reduce((sum, light) => sum + light.intensity, 0);
    check(daylight > moonlight && moonlight > 0, 'Sunlight is stronger than readable moonlight');
  }
  await Bun.write(`${page.output}/measurements.json`, JSON.stringify(reports, null, 2));
  check(page.errors.length === 0, 'Lighting journey has no browser exceptions');
  console.log('PASS day-night journey', page.output);
} catch (error) { console.error(error); try { await page?.shot('failure'); } catch {} throw error; }
finally { await page?.close(); await service.close(); server.stop(true); frontend.kill(); await frontend.exited; }
