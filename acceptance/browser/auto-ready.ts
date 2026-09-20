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
        constructor(url,...args){super(String(url).includes('/world')?'ws://127.0.0.1:4392/world':url,...args);this.addEventListener('message',event=>{const d=JSON.parse(event.data);if(d.type==='state')window.autoReadySnapshot=d.snapshot;});}
        send(message){const d=JSON.parse(message);if(d.command?.type==='ready')window.readyCommands++;super.send(message);}
      };` });
  } });
  async function enter(): Promise<void> {
    await page!.waitFor('document.body.dataset.entryRoute==="roster"');
    await page!.evaluate(`(async()=>{const {Scene,Vector3}=await import('three');window.planVector=Vector3;Scene.prototype.onAfterRender=function(renderer,scene,camera){window.planCamera=camera;};})()`);
    await page!.click('#entry-enter-world');
    await page!.waitFor('document.body.dataset.entryRoute==="world"&&document.body.dataset.rigState==="ready"&&window.autoReadySnapshot.combat.phase==="preparation"');
    if (await page!.evaluate('document.body.dataset.encounterMode==="paused"')) {
      await page!.click('#pause-resume');
      await page!.waitFor('document.getElementById("pause-panel").hidden');
    }
  }
  async function chooseMovement(): Promise<void> {
    await page!.click('#combat-plan-aim-move');
    await page!.waitFor('JSON.parse(document.getElementById("world-canvas").dataset.moveTiles||"[]").length>0&&window.planCamera');
    const point = await page!.evaluate<{ x: number; y: number }>(`(()=>{
      const tiles=JSON.parse(document.getElementById('world-canvas').dataset.moveTiles),hero=window.autoReadySnapshot.player.position;
      const p=tiles.filter(p=>Math.hypot(p.x-hero.x,p.z-hero.z)>.5).sort((a,b)=>Math.hypot(a.x-hero.x,a.z-hero.z)-Math.hypot(b.x-hero.x,b.z-hero.z))[0];
      const v=new window.planVector(p.x,p.y,p.z).project(window.planCamera),r=document.getElementById('world-canvas').getBoundingClientRect();
      return{x:r.left+(v.x+1)*r.width/2,y:r.top+(1-v.y)*r.height/2};})()`);
    await page!.call('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', buttons: 1, clickCount: 1 });
    await page!.call('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', buttons: 0, clickCount: 1 });
    await page!.waitFor('window.autoReadySnapshot.combat.queued.some(action=>action.action==="bait")');
  }
  await enter();
  check(await page.evaluate('document.getElementById("combat-plan-auto-ready").checked'), 'Auto-ready defaults on');
  check(await page.evaluate('window.readyCommands===0'), 'Empty plan does not auto-ready');
  await chooseMovement();
  await Bun.sleep(250);
  check(await page.evaluate('window.readyCommands===0&&window.autoReadySnapshot.combat.phase==="preparation"&&!window.autoReadySnapshot.combat.ready'), 'Movement alone stays editable');
  const cycle = await page.evaluate<number>('window.autoReadySnapshot.combat.cycle');
  await page.click('.combat-plan-edit[data-action="brace"]');
  await page.waitFor('window.autoReadySnapshot.combat.phase==="active"');
  check(await page.evaluate('window.readyCommands===1'), 'Complete plan sends Ready once');
  await page.shot('auto-ready-playing');
  await page.waitFor(`window.autoReadySnapshot.combat.phase==="preparation"&&window.autoReadySnapshot.combat.cycle>${cycle}`, 15000);
  check(await page.evaluate('window.readyCommands===1'), 'Resolution and next empty plan do not send another Ready');
  await page.click('#combat-plan-auto-ready');
  await page.click('.combat-plan-edit[data-action="brace"]');
  await chooseMovement();
  await Bun.sleep(250);
  check(await page.evaluate('window.readyCommands===1&&window.autoReadySnapshot.combat.phase==="preparation"&&!window.autoReadySnapshot.combat.ready'), 'Disabled complete plan remains editable');
  await page.click('.combat-plan-timing[data-timing="before"]');
  await page.waitFor('window.autoReadySnapshot.combat.queued.some(action=>action.action==="brace"&&action.timing==="before")');
  await page.shot('manual-timing');
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
