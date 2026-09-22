import { createSharedAdventure } from '../../src/game/adventure.js';
import { createWorldService, type WorldSocketData } from '../../src/server/world-service.js';
import { openBrowser, check } from './session.js';

Bun.env.GREYWROUGHT_GAME_URL = 'http://127.0.0.1:4391/';
Bun.env.GREYWROUGHT_DEBUG_PORT = '9591';
Bun.env.GREYWROUGHT_VULKAN = '1';
const character = { id: 'auto-ready-fixture', name: 'Planner', archetype: 'warrior' as const, createdAtMillis: 1 };
const token = 'auto-ready-fixture-token-0000000000000000';
const seed = createSharedAdventure(); seed.join(character.id, character.name, character.archetype);
const saved = JSON.parse(seed.save());
Object.assign(saved.characters[0].state, { phase: 'expedition', position: { x: -3, y: 0, z: 35 } });
saved.characters[0].state.combat.phase = 'preparation';
Object.assign(saved.clock, { phase: 'preparation', elapsedSeconds: 0, cycle: 1 });
for (const enemy of saved.world.threats) {
  if (enemy.id === 'scout') {
    const position = { x: -4, y: 0, z: 32 };
    Object.assign(enemy, { position, targetPosition: { ...position }, aggro: true, targetPlayerId: character.id, combatants: [character.id], phase: 'preparation', joinCycle: 1, windowCycle: 1, specialOffset: 2, castDuration: 2, remainingSeconds: 2, comboOpened: true });
    Object.assign(enemy.head, { ability: 'fireball', opened: true });
  } else if (enemy.active) Object.assign(enemy, { health: 0, phase: 'cleared', lootClaimed: true, respawnAt: Date.now() + 3_600_000 });
}
const savePath = `${process.cwd()}/build/browser/auto-ready-${process.pid}.json`;
await Bun.write(savePath, JSON.stringify({ version: 1, accounts: [{ character, tokenHash: new Bun.CryptoHasher('sha256').update(token).digest('hex') }], world: JSON.stringify(saved), chat: [], nextChatId: 1 }));
const service = await createWorldService({ savePath, allowedOrigins: ['http://127.0.0.1:4391'] });
const server = Bun.serve<WorldSocketData>({ hostname: '127.0.0.1', port: 4392, fetch: (request, host) => service.fetch(request, host), websocket: service.websocket });
const frontend = Bun.spawn([process.execPath, 'scripts/dev-server.ts'], {
  env: { ...Bun.env, GREYWROUGHT_PORT: '4391', GREYWROUGHT_LOCAL_WORLD: '0' },
  stdout: Bun.file(`build/browser/auto-ready-${process.pid}-frontend.log`), stderr: Bun.file(`build/browser/auto-ready-${process.pid}-frontend-errors.log`),
});
let page: Awaited<ReturnType<typeof openBrowser>> | undefined;
try {
  for (let attempt = 0; attempt < 100; attempt++) {
    try { if ((await fetch(Bun.env.GREYWROUGHT_GAME_URL)).ok) break; } catch {}
    await Bun.sleep(100);
  }
  page = await openBrowser('auto-ready', { beforeNavigate: async call => {
    await call('Page.addScriptToEvaluateOnNewDocument', { source: `window.EventSource=class{};
      localStorage.setItem('greywrought/local-profile-v1',${JSON.stringify(JSON.stringify({ version: 1, displayName: 'Planner', characters: [character], selectedCharacterId: character.id, savedAtMillis: Date.now() }))});
      localStorage.setItem('greywrought/world-token',${JSON.stringify(token)});
      window.readyCommands=0;
      const Native=WebSocket;window.WebSocket=class extends Native{
        constructor(url,...args){super(String(url).includes('/world')?'ws://127.0.0.1:4392/world':url,...args);this.addEventListener('message',event=>{const d=window.decodeWorldMessage(event);if(d.type==='state')window.autoReadySnapshot=d.snapshot;});}
        send(message){const d=JSON.parse(message);if(d.command?.type==='ready')window.readyCommands++;super.send(message);}
      };` });
  } });
  async function enter(): Promise<void> {
    await page!.waitFor('document.body.dataset.entryRoute==="roster"');
    await page!.evaluate(`(async()=>{const {Scene,Vector3}=await import('three');window.planVector=Vector3;Scene.prototype.onAfterRender=function(renderer,scene,camera){if(camera.isPerspectiveCamera&&renderer.getRenderTarget()===null)window.planCamera=camera;};})()`);
    await page!.click('#entry-enter-world');
    await page!.waitFor('document.body.dataset.entryRoute==="world"&&document.body.dataset.rigState==="ready"&&window.autoReadySnapshot.combat.phase==="preparation"');
    if (await page!.evaluate('document.body.dataset.encounterMode==="paused"')) {
      await page!.click('#pause-resume');
      await page!.waitFor('document.getElementById("pause-panel").hidden');
    }
  }
  async function chooseMovement(): Promise<void> {
    const readyBefore = await page!.evaluate<number>('window.readyCommands');
    await page!.click('#combat-plan-aim-move');
    await page!.waitFor('JSON.parse(document.getElementById("world-canvas").dataset.moveTiles||"[]").length>0&&window.planCamera');
    const point = await page!.evaluate<{ x: number; y: number }>(`(()=>{
      const tiles=JSON.parse(document.getElementById('world-canvas').dataset.moveTiles),hero=window.autoReadySnapshot.player.position;
      const r=document.getElementById('world-canvas').getBoundingClientRect();
      for(const p of tiles.filter(p=>Math.hypot(p.x-hero.x,p.z-hero.z)>.5)) {
        const v=new window.planVector(p.x,p.y,p.z).project(window.planCamera);
        const point={x:r.left+(v.x+1)*r.width/2,y:r.top+(1-v.y)*r.height/2};
        if(document.elementFromPoint(point.x,point.y)?.id==='world-canvas')return point;
      }
      throw new Error('No visible movement tile');})()`);
    await page!.call('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', buttons: 1, clickCount: 1 });
    await page!.call('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', buttons: 0, clickCount: 1 });
    await page!.waitFor('JSON.parse(document.getElementById("world-canvas").dataset.moveRoute||"[]").length>0');
    await Bun.sleep(150);
    check(await page!.evaluate<number>('window.readyCommands')===readyBefore,'Auto-ready waits while the movement route is still being edited');
    await page!.click('#combat-plan-finish-move');
    await page!.waitFor('window.autoReadySnapshot.combat.queued.some(action=>action.action==="bait")');
  }
  await enter();
  check(await page.evaluate(`(()=>{const r=document.getElementById('combat-plan').getBoundingClientRect();return r.width<=500&&r.height<230;})()`), 'Planner leaves the world visible in a compact panel');
  check(await page.evaluate(`(()=>{const rows=[...document.querySelectorAll('.combat-plan-row')];return rows.length===2&&rows[0].dataset.category==='movement'&&rows[1].dataset.category==='action'&&rows[1].getBoundingClientRect().top>=rows[0].getBoundingClientRect().bottom;})()`), 'Movement and action have one row each');
  await page.click('.combat-plan-enemy-move[data-threat-id="scout"]');
  await page.call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 20, y: 20, buttons: 0 });
  check(await page.evaluate(`!document.querySelector('.combat-plan-inspect').hidden&&!document.getElementById('combat-plan-outcome').hidden&&document.querySelector('.combat-plan-enemy-target').textContent==='→ You'`), 'Enemy target and pinned forecast remain available');
  await page.click('.combat-plan-unpin');
  check(await page.evaluate('document.getElementById("combat-plan-auto-ready").checked'), 'Auto-ready defaults on');
  check(await page.evaluate('window.readyCommands===0'), 'Empty plan does not auto-ready');
  check(await page.evaluate('!document.querySelector(".combat-plan-editor").hidden'), 'Attack timing is visible before either part of the plan is chosen');
  await chooseMovement();
  await Bun.sleep(250);
  check(await page.evaluate('window.readyCommands===0&&window.autoReadySnapshot.combat.phase==="preparation"&&!window.autoReadySnapshot.combat.ready'), 'Movement alone stays editable');
  const cycle = await page.evaluate<number>('window.autoReadySnapshot.combat.cycle');
  await page.click('.combat-plan-edit[data-action="brace"]');
  await page.waitFor('window.autoReadySnapshot.combat.queued.some(action=>action.action==="brace")');
  await Bun.sleep(250);
  check(await page.evaluate('window.readyCommands===0&&window.autoReadySnapshot.combat.phase==="preparation"&&!window.autoReadySnapshot.combat.ready'),'Move plus Defend waits for a timing choice');
  await page.click('.combat-plan-timing[data-timing="before"]');
  await page.waitFor('window.autoReadySnapshot.combat.phase==="active"');
  check(await page.evaluate('window.readyCommands===1'), 'Complete plan sends Ready once');
  await page.shot('auto-ready-playing');
  await page.waitFor(`window.autoReadySnapshot.combat.phase==="preparation"&&window.autoReadySnapshot.combat.cycle>${cycle}`, 15000);
  check(await page.evaluate('window.readyCommands===1'), 'Resolution and next empty plan do not send another Ready');
  await page.click('#lorebook-open');
  check(await page.evaluate('document.getElementById("lorebook-title").textContent.endsWith("Bestiary")&&document.getElementById("lorebook-open").getAttribute("aria-label")==="Bestiary"'), 'The creature guide is named Bestiary');
  await page.click('#lorebook-close');
  await page.click('.combat-plan-edit[data-action="strike"]');
  await page.waitFor('window.autoReadySnapshot.combat.queued.some(action=>action.action==="strike")');
  const secondCycle = await page.evaluate<number>('window.autoReadySnapshot.combat.cycle');
  await chooseMovement();
  await Bun.sleep(250);
  check(await page.evaluate('window.readyCommands===1&&window.autoReadySnapshot.combat.phase==="preparation"&&!window.autoReadySnapshot.combat.ready'),'Move plus Attack waits for the player to choose attack timing');
  await page.shot('attack-awaits-timing');
  await page.click('.combat-plan-timing[data-timing="during"]');
  await page.waitFor('window.autoReadySnapshot.combat.phase==="active"');
  check(await page.evaluate('window.readyCommands===2'),'Choosing In reach completes the plan and sends Ready exactly once');
  await page.waitFor(`window.autoReadySnapshot.combat.phase==="preparation"&&window.autoReadySnapshot.combat.cycle>${secondCycle}`,15000);
  await page.click('#combat-plan-auto-ready');
  await page.click('.combat-plan-edit[data-action="brace"]');
  await chooseMovement();
  await Bun.sleep(250);
  check(await page.evaluate('window.readyCommands===2&&window.autoReadySnapshot.combat.phase==="preparation"&&!window.autoReadySnapshot.combat.ready'), 'Disabled complete plan remains editable');
  await page.click('.combat-plan-timing[data-timing="before"]');
  await page.waitFor('window.autoReadySnapshot.combat.queued.some(action=>action.action==="brace"&&action.timing==="before")');
  await page.shot('manual-timing');
  await page.call('Emulation.setDeviceMetricsOverride', { width: 600, height: 800, deviceScaleFactor: 1, mobile: false });
  check(await page.evaluate(`(()=>{const r=document.getElementById('combat-plan').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<innerHeight&&r.height<250;})()`), 'Complete plan fits the narrow viewport');
  await page.shot('compact-narrow');
  await page.call('Emulation.clearDeviceMetricsOverride');
  console.log('Reloading to check the saved manual preference');
  await page.reload(); await enter();
  check(await page.evaluate('!document.getElementById("combat-plan-auto-ready").checked'), 'Disabled preference survives reload');
  check(await page.evaluate('window.readyCommands===0'), 'Reload in manual mode does not send Ready');
  await page.click('.combat-plan-ready');
  await page.waitFor('window.autoReadySnapshot.combat.phase==="active"');
  check(await page.evaluate('window.readyCommands===1'), 'Manual Ready still works');
  check(page.errors.length === 0, 'No browser exceptions');
  console.log('PASS default auto-ready, incomplete movement, one Ready for complete plan, disabled manual planning, timing, persisted preference, and manual Ready', page.output);
} catch (error) { console.error(error); try { await page?.shot('failure'); } catch {} throw error; }
finally { await page?.close(); await service.close(); server.stop(true); frontend.kill(); await frontend.exited; }
