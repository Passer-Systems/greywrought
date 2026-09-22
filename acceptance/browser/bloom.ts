import { createSharedAdventure } from '../../src/game/adventure.js';
import { terrainHeight } from '../../src/game/cave-layout.js';
import { createWorldService, type WorldSocketData } from '../../src/server/world-service.js';
import { openBrowser, check } from './session.js';
import { performanceProbe } from './performance-probe.js';

const before = Bun.env.BLOOM_PHASE === 'before';
const label = before ? 'before' : 'after';
const url = 'http://127.0.0.1:4441/';
const midnight = Date.parse('2026-07-15T00:00:00-07:00');
Object.assign(Bun.env, { GREYWROUGHT_GAME_URL: url, GREYWROUGHT_DEBUG_PORT: '9641', GREYWROUGHT_VULKAN: '1' });
const locations = [{ id: 'town', x: 0, z: -18 }, { id: 'lake', x: 10, z: -99 }, { id: 'woods', x: 37, z: -79 }, { id: 'clearing', x: -16, z: 45 }, { id: 'meadow', x: 25, z: -85 }, { id: 'brinewood', x: -145, z: 115 }, { id: 'cave', x: 47, z: -46 }, { id: 'underwater', x: -27, z: -95 }];
const characters = locations.map(location => ({ id: `bloom-${location.id}`, name: 'Light Walker', archetype: 'warrior' as const, createdAtMillis: 1 }));
const token = 'bloom-fixture-token-00000000000000000000';
const seed = createSharedAdventure();
for (const character of characters) seed.join(character.id, character.name, character.archetype);
const saved = JSON.parse(seed.save());
for (const [index, location] of locations.entries()) Object.assign(saved.characters[index].state, { phase: location.id === 'town' ? 'town' : 'expedition', position: { x: location.x, y: terrainHeight(location.x, location.z), z: location.z } });
for (const enemy of saved.world.threats) if (enemy.active) Object.assign(enemy, { health: 0, phase: 'cleared', lootClaimed: true, respawnAt: Date.now() + 3_600_000 });
const savePath = `${process.cwd()}/build/browser/bloom-${label}-${process.pid}.json`;
await Bun.write(savePath, JSON.stringify({ version: 1, accounts: characters.map(character => ({ character, tokenHash: new Bun.CryptoHasher('sha256').update(token).digest('hex') })), world: JSON.stringify(saved), chat: [], nextChatId: 1 }));
const service = await createWorldService({ savePath, allowedOrigins: [url.slice(0, -1)] });
const server = Bun.serve<WorldSocketData>({ hostname: '127.0.0.1', port: 4442, fetch: (request, host) => service.fetch(request, host), websocket: service.websocket });
const frontend = Bun.spawn([process.execPath, before || Bun.env.BLOOM_STATIC === '1' ? 'scripts/static-server.ts' : 'scripts/dev-server.ts'], { env: { ...Bun.env, GREYWROUGHT_PORT: '4441', GREYWROUGHT_LOCAL_WORLD: '0' }, stdout: Bun.file(`build/browser/bloom-${label}-frontend.log`), stderr: Bun.file(`build/browser/bloom-${label}-frontend-errors.log`) });
let page: Awaited<ReturnType<typeof openBrowser>> | undefined;
const reports: unknown[] = [];
const summary = (values: number[]) => { values.sort((a,b)=>a-b); return { median: values[Math.floor(values.length * .5)], p95: values[Math.floor(values.length * .95)] }; };
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(url)).ok) break; } catch {} await Bun.sleep(100); }
  page = await openBrowser(`bloom-${label}`, { localOnly: true, beforeNavigate: async call => {
    await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await call('Log.enable');
    await call('Page.addScriptToEvaluateOnNewDocument', { source: `window.EventSource=class{};
      localStorage.setItem('greywrought/local-profile-v1',${JSON.stringify(JSON.stringify({ version: 1, displayName: 'Bloom Test', characters, selectedCharacterId: characters[0]!.id, savedAtMillis: 1 }))});
      localStorage.setItem('greywrought/world-token',${JSON.stringify(token)});window.lightingHour=12;
      const Native=WebSocket;window.WebSocket=class extends Native{constructor(url,...args){super(String(url).includes('/world')?'ws://127.0.0.1:4442/world':url,...args);}set onmessage(callback){super.onmessage=event=>{const m=JSON.parse(event.data);if((m.type==='state'||m.type==='stateDelta')){m.serverWallTimeMillis=${midnight}+window.lightingHour*3600000;m.rainIntensity=0;window.performanceState=window.decodeWorldMessage(event,m).snapshot;}callback?.call(this,new MessageEvent('message',{data:JSON.stringify(m)}));};}};` });
  } });
  await page.waitFor('document.body.dataset.entryRoute==="roster"');
  await page.evaluate(performanceProbe);
  async function enter(id: string) {
    await page!.evaluate(`document.querySelector('[data-character-id="bloom-${id}"]').scrollIntoView({block:'center'})`);
    await page!.click(`[data-character-id="bloom-${id}"]`); await page!.click('#entry-enter-world');
    await page!.waitFor('document.body.dataset.rigState==="ready"&&document.body.dataset.environmentState==="ready"&&!!window.performanceProbe.renderer', 30000);
    await Bun.sleep(1500);
    console.log('Entered', id);
    if (await page!.evaluate('document.body.dataset.encounterMode==="paused"')) await page!.click('#pause-resume');
    if (await page!.evaluate('document.body.dataset.encounterMode==="private"')) { await page!.click('#encounter-rejoin'); await page!.waitFor('document.body.dataset.encounterMode==="shared"'); }
    if (await page!.evaluate('!document.getElementById("pause-panel").hidden')) await page!.press('Escape');
    if (id === 'lake') {
      await page!.call('Input.dispatchMouseEvent', { type: 'mousePressed', x: 500, y: 400, button: 'right', buttons: 2, clickCount: 1 });
      await page!.call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 814, y: 280, button: 'right', buttons: 2 });
      await page!.call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 814, y: 280, button: 'right', buttons: 0, clickCount: 1 });
    }
    await Bun.sleep(1500);
  }
  async function capture(location: string, hour: number) {
    const shaderErrors = await page!.evaluate<unknown[]>(`(()=>{const r=performanceProbe.renderer,g=r.getContext();return r.info.programs.filter(p=>!g.getProgramParameter(p.program,g.LINK_STATUS)).map(p=>({log:g.getProgramInfoLog(p.program),vertex:g.getShaderInfoLog(p.vertexShader),fragment:g.getShaderInfoLog(p.fragmentShader)}))})()`);
    check(shaderErrors.length === 0, `World shaders compile: ${JSON.stringify(shaderErrors)}`);
    await page!.evaluate(`window.lightingHour=${hour}`);
    await page!.waitFor(`Math.abs(Number(document.getElementById('world-canvas').dataset.worldHour)-${hour})<.01`);
    await Bun.sleep(1200);
    await page!.evaluate('void Object.assign(window.performanceProbe,{samples:[],gpu:[],callbacks:0,skipped:0,lastFrame:0,measuring:true})');
    await Bun.sleep(3000);
    const data = await page!.evaluate<{ samples: Record<string, number>[]; gpu: {milliseconds:number}[]; details: unknown; canvas: Record<string, string>; camera: number[] }>('window.performanceProbe.measuring=false;({samples:window.performanceProbe.samples,gpu:window.performanceProbe.gpu,details:window.performanceProbe.details,canvas:{...window.performanceProbe.renderer.domElement.dataset},camera:window.performanceProbe.camera.position.toArray()})');
    await Bun.write(`${page!.output}/${location}-${hour}-samples.json`, JSON.stringify(data));
    check(data.samples.length > 25, 'Bloom comparison measures whole rendered frames');
    const report = { location, hour, frames: data.samples.length, frameMs: summary(data.samples.map(s=>s.interval!).filter(Boolean)), callbackMs: summary(data.samples.map(s=>s.duration!)), renderMs: summary(data.samples.map(s=>s.renderMs!)), calls: summary(data.samples.map(s=>s.calls!)), passes: summary(data.samples.map(s=>s.passes!)), gpuMs: data.gpu.length ? summary(data.gpu.map(s=>s.milliseconds)) : null, details: data.details, canvas: data.canvas, camera: data.camera };
    reports.push(report); console.log(JSON.stringify(report));
    await page!.shot(`${location}-${hour}`);
    await Bun.write(`${page!.output}/measurements.json`, JSON.stringify(reports,null,2));
    if (!before) check(data.samples.every(s=>s.passes! > 2), 'The complete scene and postprocessing render each measured frame');
  }
  for (const location of locations) {
    if (Bun.env.BLOOM_LOCATIONS && !Bun.env.BLOOM_LOCATIONS.split(',').includes(location.id)) continue;
    await enter(location.id);
    for (const hour of location.id === 'cave' ? [0] : location.id === 'underwater' ? [12] : location.id === 'lake' ? [12,17] : [12,0]) await capture(location.id,hour);
    if (!before && location.id === 'lake') {
      await page.call('Emulation.setDeviceMetricsOverride', {width:1024,height:768,deviceScaleFactor:1.5,mobile:false});
      await Bun.sleep(600); await page.shot('lake-resized');
      check(await page.evaluate('performanceProbe.renderer.domElement.width===1536'), 'Drawing buffer resizes with pixel ratio');
      await page.call('Emulation.setDeviceMetricsOverride', {width:1440,height:900,deviceScaleFactor:1,mobile:false});
      await page.call('Input.dispatchMouseEvent', {type:'mouseWheel',x:850,y:400,deltaX:0,deltaY:-10000});
      await Bun.sleep(600); await page.shot('lake-first-person');
    }
    await page.click('#pause-open'); await page.click('#pause-tab-settings'); await page.click('#return-roster');
    await page.waitFor('document.body.dataset.entryRoute==="roster"&&window.performanceProbe.renderer===null');
  }
  const lifecycle = await page.evaluate('window.performanceProbe.lifecycle');
  await Bun.write(`${page.output}/lifecycle.json`, JSON.stringify(lifecycle,null,2));
  check(page.errors.length===0,'Bloom journey has no browser exceptions');
  console.log('PASS bloom comparison',page.output);
} catch(error) { try { await page?.shot('failure'); } catch {} throw error; }
finally { await page?.close(); await service.close(); server.stop(true); frontend.kill(); await frontend.exited; }
