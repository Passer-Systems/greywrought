import { createSharedAdventure } from '../../src/game/adventure.js';
import { createWorldService, type WorldSocketData } from '../../src/server/world-service.js';
import { openBrowser, check } from './session.js';

Bun.env.GREYWROUGHT_GAME_URL = 'http://127.0.0.1:4395/';
Bun.env.GREYWROUGHT_DEBUG_PORT = '9595';
Bun.env.GREYWROUGHT_VULKAN = '1';
const character = { id: 'autocast-fixture', name: 'Planner', archetype: 'warrior' as const, createdAtMillis: 1 };
const token = 'autocast-fixture-token-0000000000000000';
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
const savePath = `${process.cwd()}/build/browser/attack-autocast-${process.pid}.json`;
await Bun.write(savePath, JSON.stringify({ version: 1, accounts: [{ character, tokenHash: new Bun.CryptoHasher('sha256').update(token).digest('hex') }], world: JSON.stringify(saved), chat: [], nextChatId: 1 }));
const service = await createWorldService({ savePath, allowedOrigins: ['http://127.0.0.1:4395'] });
const server = Bun.serve<WorldSocketData>({ hostname: '127.0.0.1', port: 4396, fetch: (request, host) => service.fetch(request, host), websocket: service.websocket });
const frontend = Bun.spawn([process.execPath, 'scripts/dev-server.ts'], {
  env: { ...Bun.env, GREYWROUGHT_PORT: '4395', GREYWROUGHT_LOCAL_WORLD: '0' },
  stdout: Bun.file(`build/browser/attack-autocast-${process.pid}-frontend.log`), stderr: Bun.file(`build/browser/attack-autocast-${process.pid}-frontend-errors.log`),
});
let page: Awaited<ReturnType<typeof openBrowser>> | undefined;
try {
  for (let attempt = 0; attempt < 100; attempt++) {
    try { if ((await fetch(Bun.env.GREYWROUGHT_GAME_URL)).ok) break; } catch {}
    await Bun.sleep(100);
  }
  page = await openBrowser('attack-autocast', { beforeNavigate: async call => {
    await call('Page.addScriptToEvaluateOnNewDocument', { source: `window.EventSource=class{};
      localStorage.setItem('greywrought/local-profile-v1',${JSON.stringify(JSON.stringify({ version: 1, displayName: 'Planner', characters: [character], selectedCharacterId: character.id, savedAtMillis: Date.now() }))});
      localStorage.setItem('greywrought/world-token',${JSON.stringify(token)});
      window.readyCommands=0;window.attackCommands=0;
      const Native=WebSocket;window.WebSocket=class extends Native{
        constructor(url,...args){super(String(url).includes('/world')?'ws://127.0.0.1:4396/world':url,...args);this.addEventListener('message',event=>{const d=window.decodeWorldMessage(event);if(d.type==='state')window.autoReadySnapshot=d.snapshot;});}
        send(message){const d=JSON.parse(message);if(d.command?.type==='ready')window.readyCommands++;if(d.command?.type==='action'&&d.command.action==='strike'&&d.command.pressed)window.attackCommands++;super.send(message);}
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
  const attack='.adventure-actions [data-action="strike"]';
  async function toggle(): Promise<void> {
    const point=await page!.evaluate<{x:number;y:number}>(`(()=>{const r=document.querySelector('.adventure-actions [data-action="strike"]').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
    await page!.call('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'right',buttons:2,clickCount:1});
    await page!.call('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'right',buttons:0,clickCount:1});
  }
  check(await page.evaluate(`document.querySelector('${attack}').dataset.autocast==='false'&&window.attackCommands===0`),'Autocast defaults off');
  await toggle();await page.waitFor('window.autoReadySnapshot.combat.queued.some(a=>a.action==="strike")');
  check(await page.evaluate(`document.querySelector('${attack}').dataset.autocast==='true'&&window.attackCommands===1`),'Right-click visibly enables autocast and queues once');
  await page.waitFor('!document.querySelector(".combat-plan-row[data-category=action] .combat-plan-remove").hidden');
  await page.click('.combat-plan-row[data-category="action"] .combat-plan-remove');
  await page.waitFor('!window.autoReadySnapshot.combat.queued.some(a=>a.action==="strike")');await Bun.sleep(300);
  check(await page.evaluate('window.attackCommands===1'),'Removing the automatic action does not re-add it');
  await page.click('.combat-plan-edit[data-action="brace"]');await page.waitFor('window.autoReadySnapshot.combat.queued.some(a=>a.action==="brace")');
  const cycle=await page.evaluate<number>('window.autoReadySnapshot.combat.cycle');await page.click('.combat-plan-ready');
  await page.waitFor(`window.autoReadySnapshot.combat.phase==="preparation"&&window.autoReadySnapshot.combat.cycle>${cycle}&&window.autoReadySnapshot.combat.queued.some(a=>a.action==="strike")`,15000);
  check(await page.evaluate('window.attackCommands===2'),'Next turn automatically queues exactly one Attack');
  await chooseMovement();await Bun.sleep(250);
  check(await page.evaluate('window.readyCommands===1&&!window.autoReadySnapshot.combat.ready'),'Autocast plus Move still waits for explicit timing');
  await page.click('.combat-plan-edit[data-action="brace"]');await page.waitFor('window.autoReadySnapshot.combat.queued.some(a=>a.action==="brace")');await Bun.sleep(250);
  check(await page.evaluate('window.attackCommands===2&&window.autoReadySnapshot.combat.queued.some(a=>a.action==="brace")'),'Manual Defend replaces Attack and remains selected');
  await page.shot('autocast-manual-override');
  await page.reload();await enter();
  check(await page.evaluate(`document.querySelector('${attack}').dataset.autocast==='true'&&window.autoReadySnapshot.combat.queued.some(a=>a.action==='brace')&&window.attackCommands===0`),'Preference survives reload without replacing Defend');
  await toggle();check(await page.evaluate(`document.querySelector('${attack}').dataset.autocast==='false'`),'Right-click again disables future autocast');
  const lastCycle=await page.evaluate<number>('window.autoReadySnapshot.combat.cycle');await page.click('.combat-plan-ready');
  await page.waitFor(`window.autoReadySnapshot.combat.phase==="preparation"&&window.autoReadySnapshot.combat.cycle>${lastCycle}`,15000);await Bun.sleep(250);
  check(await page.evaluate('window.attackCommands===0&&!window.autoReadySnapshot.combat.queued.some(a=>a.action==="strike")'),'Disabled autocast leaves the next action empty');
  check(page.errors.length===0,'No browser exceptions');
  console.log('PASS right-click Attack autocast, once per turn, removal, manual Defend, explicit timing, saved preference and disable',page.output);
} catch (error) { console.error(error); try { await page?.shot('failure'); } catch {} throw error; }
finally { await page?.close(); await service.close(); server.stop(true); frontend.kill(); await frontend.exited; }
