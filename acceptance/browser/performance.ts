import { check, openBrowser } from './session.js';

Bun.env.GREYWROUGHT_GAME_URL = 'http://127.0.0.1:4300/';
Bun.env.GREYWROUGHT_VULKAN = '1';
Bun.env.GREYWROUGHT_DEBUG_PORT = '9451';
const label = Bun.env.GREYWROUGHT_PERFORMANCE_LABEL ?? 'performance';
const frontend = Bun.spawn(['bun', 'scripts/dev-server.ts'], {
  env: { ...Bun.env, GREYWROUGHT_PORT: '4300', GREYWROUGHT_LOCAL_WORLD: '1', GREYWROUGHT_WORLD_SAVE: `build/browser/performance-world-${process.pid}.json` },
  stdout: Bun.file(`build/browser/performance-${process.pid}-frontend.log`), stderr: Bun.file(`build/browser/performance-${process.pid}-frontend-errors.log`),
});
let page: Awaited<ReturnType<typeof openBrowser>> | undefined;
const results: unknown[] = [];
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(Bun.env.GREYWROUGHT_GAME_URL)).ok) break; } catch {} await Bun.sleep(100); }
  page = await openBrowser(label, { beforeNavigate: async call => {
    if (Bun.env.GREYWROUGHT_PERFORMANCE_WIDTH && Bun.env.GREYWROUGHT_PERFORMANCE_HEIGHT) {
      await call('Emulation.setDeviceMetricsOverride', {
        width: Number(Bun.env.GREYWROUGHT_PERFORMANCE_WIDTH), height: Number(Bun.env.GREYWROUGHT_PERFORMANCE_HEIGHT),
        deviceScaleFactor: 1, mobile: false,
      });
    }
    await call('Page.addScriptToEvaluateOnNewDocument', { source: `
      window.frameSamples=[]; window.measuring=false; window.lastFrame=0;
      const nativeFrame=requestAnimationFrame;
      window.requestAnimationFrame=callback=>nativeFrame.call(window,now=>{
        const start=performance.now(); callback(now);
        if(window.measuring && callback.name==='tick') {
          window.frameSamples.push({duration:performance.now()-start,interval:window.lastFrame?now-window.lastFrame:0});
          window.lastFrame=now;
        }
      });` });
  } });
  await page.enter();
  await page.waitFor('document.body.dataset.creatureRigState === "ready"');
  async function resumeSharedWorld() {
    const browser = page!;
    await browser.waitFor('document.body.dataset.gameOnline === "true"');
    if ((await browser.read()).encounterMode === 'paused') {
      await browser.click('#pause-resume');
      await browser.waitFor('document.body.dataset.encounterMode === "private"');
    }
    if ((await browser.read()).encounterMode === 'private') {
      if (await browser.evaluate('!document.getElementById("pause-panel").hidden')) await browser.press('Escape');
      await browser.click('#encounter-rejoin');
    }
    await browser.waitFor('document.body.dataset.encounterMode === "shared" && document.body.dataset.gamePaused === "false"');
  }
  // Cold shader compilation can miss a heartbeat; measure the resumed game, never a paused menu.
  await resumeSharedWorld();
  await page.evaluate(`(async()=>{
    const {Scene}=await import('three');
    let rendererName;
    Scene.prototype.onAfterRender=function(renderer){
      if(renderer.domElement.id!=='world-canvas')return;
      // Driver queries can synchronize GPU work; sample identity once, outside the measured loop.
      if(rendererName===undefined){
        const gl=renderer.getContext(),debug=gl.getExtension('WEBGL_debug_renderer_info');
        rendererName=debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);
      }
      window.rendererDetails={...renderer.info.render,geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures,
        width:renderer.domElement.width,height:renderer.domElement.height,pixelRatio:renderer.getPixelRatio(),
        renderer:rendererName};
    };
  })()`);
  await page.waitFor('window.rendererDetails !== undefined');
  await resumeSharedWorld();
  await page.call('Profiler.enable');
  await page.call('Performance.enable');
  await Bun.sleep(3000);
  async function measure(phase: string, milliseconds: number) {
    const browser = page!;
    await browser.evaluate('window.frameSamples=[];window.lastFrame=0;window.measuring=true');
    const before = await browser.call('Performance.getMetrics');
    await browser.call('Profiler.start');
    await Bun.sleep(milliseconds);
    const profile = await browser.call('Profiler.stop');
    const after = await browser.call('Performance.getMetrics');
    const data = await browser.evaluate<{ samples: { duration: number; interval: number }[]; renderer: unknown; state: unknown }>('window.measuring=false;({samples:window.frameSamples,renderer:window.rendererDetails,state:{...document.body.dataset}})');
    await Bun.write(`${browser.output}/${phase}.cpuprofile`, JSON.stringify((profile.result as unknown as {profile: unknown}).profile));
    const summarize = (values: number[]) => {
      values.sort((a,b)=>a-b);
      return { median: values[Math.floor(values.length*.5)], p95: values[Math.floor(values.length*.95)], over33ms: values.filter(v=>v>33.5).length, over50ms: values.filter(v=>v>50).length };
    };
    check(data.samples.length > 20, `${phase} must render enough frames to measure`);
    const result = { phase, frames: data.samples.length, callbackMs: summarize(data.samples.map(s=>s.duration)), frameMs: summarize(data.samples.map(s=>s.interval).filter(Boolean)), renderer: data.renderer, before: before.result, after: after.result };
    results.push(result);
    await Bun.write(`${browser.output}/${phase}-samples.json`, JSON.stringify(data));
    console.log(JSON.stringify(result));
  }
  await measure('town', 6000);
  const before = Number((await page.read()).gamePlayerZ);
  await page.key('KeyW', true);
  await measure('movement', 2000);
  check(Number((await page.read()).gamePlayerZ) > before + 1, 'Forward movement must remain responsive');
  await page.waitFor('document.body.dataset.gameCombatPhase === "preparation"', 15000);
  await page.key('KeyW', false);
  await measure('planning', 6000);
  await page.shot('planning');
  await page.press('KeyR');
  await page.waitFor('document.body.dataset.gameCombatPhase === "active"');
  await measure('combat', 2000);
  await page.shot('combat');
  await page.press('Escape');
  await page.waitFor('!document.getElementById("pause-panel").hidden');
  check((await page.read()).encounterMode === 'shared', 'Escape must leave the shared world running');
  check(page.errors.length === 0, 'Performance journey must have no browser exceptions');
  await Bun.write(`${page.output}/summary.json`, JSON.stringify(results, null, 2));
  console.log('PASS town, movement, planning, combat and live Escape menu', page.output);
} catch (error) { await page?.shot('failure'); throw error; }
finally { await page?.key('KeyW', false).catch(()=>{}); await page?.close(); frontend.kill(); await frontend.exited; }
