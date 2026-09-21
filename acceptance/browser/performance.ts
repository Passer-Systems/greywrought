import { createSharedAdventure } from '../../src/game/adventure.js';
import { terrainHeight } from '../../src/game/cave-layout.js';
import { classKit } from '../../src/game/class-kit.js';
import { createWorldService, type WorldSocketData } from '../../src/server/world-service.js';
import { check, openBrowser } from './session.js';
import { performanceProbe } from './performance-probe.js';

const seattleNoon = Date.parse('2026-07-15T12:00:00-07:00');

const url = 'http://127.0.0.1:4300/';
Object.assign(Bun.env, { GREYWROUGHT_GAME_URL: url, GREYWROUGHT_VULKAN: '1', GREYWROUGHT_DEBUG_PORT: '9451' });
const label = Bun.env.GREYWROUGHT_PERFORMANCE_LABEL ?? 'performance';
const locations = [
  { id: 'town', x: 0, z: -25 }, { id: 'woods', x: 37, z: -79 },
  { id: 'lake', x: 10, z: -99 }, { id: 'cave', x: 45, z: -46 },
  { id: 'hills', x: 60, z: 15 }, { id: 'combat', x: -7.5, z: 27.5 },
  { id: 'rain', x: 0, z: -25 },
];
const characters = locations.map(location => ({ id: `performance-${location.id}`, name: 'Frame Walker', archetype: 'warrior' as const, createdAtMillis: 1 }));
const token = 'performance-fixture-token-000000000000000';
const seed = createSharedAdventure();
for (const character of characters) seed.join(character.id, character.name, character.archetype);
const saved = JSON.parse(seed.save());
for (const [index, location] of locations.entries()) Object.assign(saved.characters[index].state, {
  phase: location.id === 'town' ? 'town' : 'expedition', position: { x: location.x, y: terrainHeight(location.x, location.z), z: location.z },
});
for (const [index, threat] of saved.world.threats.entries()) threat.rng = 1000 + index;
const savePath = `${process.cwd()}/build/browser/performance-world-${process.pid}.json`;
await Bun.write(savePath, JSON.stringify({ version: 1, accounts: characters.map(character => ({ character, tokenHash: new Bun.CryptoHasher('sha256').update(token).digest('hex') })), world: JSON.stringify(saved), chat: [], nextChatId: 1 }));
const service = await createWorldService({ savePath, allowedOrigins: [url.slice(0, -1)] });
const server = Bun.serve<WorldSocketData>({ hostname: '127.0.0.1', port: 4301, fetch: (request, host) => service.fetch(request, host), websocket: service.websocket });
const frontend = Bun.spawn([process.execPath, Bun.env.GREYWROUGHT_PERFORMANCE_STATIC === '1' ? 'scripts/static-server.ts' : 'scripts/dev-server.ts'], {
  env: { ...Bun.env, GREYWROUGHT_PORT: '4300', GREYWROUGHT_LOCAL_WORLD: '0' },
  stdout: Bun.file(`build/browser/performance-${process.pid}-frontend.log`), stderr: Bun.file(`build/browser/performance-${process.pid}-frontend-errors.log`),
});
let page: Awaited<ReturnType<typeof openBrowser>> | undefined;
const results: unknown[] = [], loading: unknown[] = [];
type Position = { x: number; y: number; z: number };
type Sample = { timestamp: number; duration: number; interval: number; renderMs: number; calls: number; triangles: number; passes: number; reflectionPasses: number; position: Position; serverPosition: Position };
function summarize(values: number[], milliseconds = false) {
  values.sort((a, b) => a - b);
  return { median: values[Math.floor(values.length * .5)], p95: values[Math.floor(values.length * .95)], p99: values[Math.floor(values.length * .99)], max: values.at(-1), ...(milliseconds ? { over33ms: values.filter(v => v > 33.5).length, over50ms: values.filter(v => v > 50).length, over100ms: values.filter(v => v > 100).length } : {}) };
}
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(url)).ok) break; } catch {} await Bun.sleep(100); }
  page = await openBrowser(label, { localOnly: true, beforeNavigate: async call => {
    await call('Emulation.setDeviceMetricsOverride', { width: Number(Bun.env.GREYWROUGHT_PERFORMANCE_WIDTH ?? 1440), height: Number(Bun.env.GREYWROUGHT_PERFORMANCE_HEIGHT ?? 900), deviceScaleFactor: 1, mobile: false });
    await call('Page.addScriptToEvaluateOnNewDocument', { source: `window.EventSource=class{};
      localStorage.setItem('greywrought/local-profile-v1',${JSON.stringify(JSON.stringify({ version: 1, displayName: 'Performance', characters, selectedCharacterId: characters[0]!.id, savedAtMillis: 1 }))});
      localStorage.setItem('greywrought/world-token',${JSON.stringify(token)});
      const clockStart=performance.now();const Native=WebSocket;window.WebSocket=class extends Native{constructor(url,...args){super(String(url).includes('/world')?'ws://127.0.0.1:4301/world':url,...args);}
        set onmessage(callback){super.onmessage=event=>{const m=JSON.parse(event.data);if(m.type==='state'){m.serverWallTimeMillis=${seattleNoon}+performance.now()-clockStart;m.rainIntensity=window.performanceRain??0;window.performanceState=m.snapshot;}callback?.call(this,new MessageEvent('message',{data:JSON.stringify(m)}));};}};` });
  } });
  await page.waitFor('document.body.dataset.entryRoute === "roster"');
  await page.evaluate(performanceProbe);
  await page.call('Profiler.enable'); await page.call('Performance.enable');
  async function enter(id: string) {
    const browser = page!;
    await browser.evaluate(`window.performanceRain=${id === 'rain' ? 1 : 0}`);
    await browser.evaluate(`document.querySelector('[data-character-id="performance-${id}"]').scrollIntoView({block:'center'})`);
    await browser.click(`[data-character-id="performance-${id}"]`);
    const start = performance.now();
    await browser.click('#entry-enter-world');
    await browser.waitFor('document.body.dataset.entryRoute==="world"&&document.body.dataset.rigState==="ready"&&document.body.dataset.creatureRigState==="ready"&&document.body.dataset.environmentState==="ready"&&!!window.performanceProbe.renderer', 30000);
    if ((await browser.read()).encounterMode === 'paused') { await browser.click('#pause-resume'); await browser.waitFor('document.body.dataset.gamePaused==="false"'); }
    if ((await browser.read()).encounterMode === 'private') { await browser.click('#encounter-rejoin'); await browser.waitFor('document.body.dataset.encounterMode==="shared"'); }
    if (await browser.evaluate('!document.getElementById("pause-panel").hidden')) await browser.press('Escape');
    loading.push({ id, milliseconds: performance.now() - start, metrics: (await browser.call('Performance.getMetrics')).result });
    await Bun.sleep(1500);
    if (id === 'lake') {
      await browser.call('Input.dispatchMouseEvent', { type: 'mousePressed', x: 500, y: 400, button: 'right', buttons: 2, clickCount: 1 });
      await browser.call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 814, y: 280, button: 'right', buttons: 2 });
      await browser.call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 814, y: 280, button: 'right', buttons: 0, clickCount: 1 });
      await Bun.sleep(500);
    }
  }
  async function leave() {
    const browser = page!;
    await browser.click('#pause-open'); await browser.click('#pause-tab-settings'); await browser.click('#return-roster');
    await browser.waitFor('document.body.dataset.entryRoute==="roster"&&window.performanceProbe.renderer===null');
    check(await browser.evaluate('!document.getElementById("world-canvas")'), 'Returning to roster must remove the world canvas');
  }
  async function measure(phase: string, milliseconds = 4000, action?: () => Promise<void>) {
    const browser = page!;
    const before = await browser.call('Performance.getMetrics');
    await browser.call('Profiler.start');
    await browser.evaluate('void Object.assign(window.performanceProbe,{samples:[],gpu:[],callbacks:0,skipped:0,lastFrame:0,measuring:true})');
    if (action) await action(); else await Bun.sleep(milliseconds);
    const data = await browser.evaluate<{ samples: Sample[]; gpu: { milliseconds: number }[]; callbacks: number; skipped: number; details: unknown }>('window.performanceProbe.measuring=false;({samples:window.performanceProbe.samples,gpu:window.performanceProbe.gpu,callbacks:window.performanceProbe.callbacks,skipped:window.performanceProbe.skipped,details:window.performanceProbe.details})');
    const profile = await browser.call('Profiler.stop');
    const after = await browser.call('Performance.getMetrics');
    await Bun.write(`${browser.output}/${phase}.cpuprofile`, JSON.stringify((profile.result as unknown as { profile: unknown }).profile));
    await Bun.write(`${browser.output}/${phase}-samples.json`, JSON.stringify(data));
    check(data.samples.length > 20, `${phase} must produce actual rendered frames`);
    const first = data.samples[0]!, last = data.samples.at(-1)!, seconds = (last.timestamp - first.timestamp) / 1000;
    const speed = (key: 'position' | 'serverPosition') => Math.hypot(last[key].x - first[key].x, last[key].z - first[key].z) / seconds;
    const intervals = data.samples.map(s => s.interval).filter(Boolean);
    const result = { phase, frames: data.samples.length, seconds, fps: intervals.length * 1000 / intervals.reduce((sum, interval) => sum + interval, 0), callbacks: data.callbacks, skipped: data.skipped,
      callbackMs: summarize(data.samples.map(s => s.duration), true), renderMs: summarize(data.samples.map(s => s.renderMs), true), frameMs: summarize(data.samples.map(s => s.interval).filter(Boolean), true),
      draws: summarize(data.samples.map(s => s.calls)), triangles: summarize(data.samples.map(s => s.triangles)), reflectionFrames: data.samples.filter(s => s.reflectionPasses > 0).length,
      gpuMs: data.gpu.length ? summarize(data.gpu.map(s => s.milliseconds), true) : null, renderer: data.details,
      movement: { renderedMetresPerSecond: speed('position'), serverMetresPerSecond: speed('serverPosition'), expectedLandSpeed: classKit('warrior').movementSpeed, start: first.position, end: last.position }, before: before.result, after: after.result };
    results.push(result);
    console.log(JSON.stringify(result));
    await Bun.write(`${browser.output}/summary.json`, JSON.stringify({ results, loading }, null, 2));
  }
  for (const location of locations) {
    if (Bun.env.GREYWROUGHT_PERFORMANCE_LOCATIONS && !Bun.env.GREYWROUGHT_PERFORMANCE_LOCATIONS.split(',').includes(location.id)) continue;
    await enter(location.id);
    console.log('Entered', location.id);
    if (location.id === 'combat') {
      await page.waitFor('document.body.dataset.gameCombatPhase==="preparation"');
      await measure('planning');
      await page.evaluate('window.performanceProbe.combatOnly=true');
      await measure('combat', 0, async () => {
        for (let round = 0; round < 3; round++) {
          await page!.press('KeyR');
          await page!.waitFor('document.body.dataset.gameCombatPhase==="active"');
          await page!.waitFor('document.body.dataset.gameCombatPhase==="preparation"');
        }
      });
      await page.evaluate('window.performanceProbe.combatOnly=false');
    } else {
      await measure(location.id);
      if (['town', 'hills', 'lake'].includes(location.id)) {
        await page.key('KeyW', true); await measure(`${location.id}-running`, 4000); await page.key('KeyW', false);
      }
      if (location.id === 'woods') await measure('camera-orbit', 4000, async () => {
        await page!.call('Input.dispatchMouseEvent', { type: 'mousePressed', x: 800, y: 400, button: 'right', buttons: 2, clickCount: 1 });
        for (let step = 1; step <= 40; step++) { await page!.call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 800 + Math.sin(step / 8) * 200, y: 400 - Math.sin(step / 16) * 90, button: 'right', buttons: 2 }); await Bun.sleep(100); }
        await page!.call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 600, y: 350, button: 'right', buttons: 0, clickCount: 1 });
      });
    }
    await page.shot(location.id); await leave();
  }
  const lifecycle = await page.evaluate('window.performanceProbe.lifecycle');
  await Bun.write(`${page.output}/lifecycle.json`, JSON.stringify({ loading, disposals: lifecycle, metrics: (await page.call('Performance.getMetrics')).result }, null, 2));
  check(page.errors.length === 0, 'Performance journey must have no browser exceptions');
  console.log('PASS rendered-frame profiling, movement, camera, combat and renderer teardown', page.output);
} catch (error) { await page?.shot('failure'); throw error; }
finally { await page?.key('KeyW', false).catch(() => {}); await page?.close(); await service.close(); server.stop(true); frontend.kill(); await frontend.exited; }
