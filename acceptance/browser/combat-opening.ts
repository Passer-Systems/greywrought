import { createSharedAdventure } from '../../src/game/adventure.js';
import { createWorldService, type WorldSocketData } from '../../src/server/world-service.js';
import { openBrowser, check } from './session.js';

Bun.env.GREYWROUGHT_GAME_URL = 'http://127.0.0.1:4411/';
Bun.env.GREYWROUGHT_DEBUG_PORT = '9611';
Bun.env.GREYWROUGHT_VULKAN = '1';
const character = { id: 'combat-opening-fixture', name: 'Trailblazer', archetype: 'hunter' as const, createdAtMillis: 1 };
const token = 'combat-opening-fixture-token-000000000000';
const seed = createSharedAdventure(); seed.join(character.id, character.name, character.archetype);
const saved = JSON.parse(seed.save());
Object.assign(saved.characters[0].state, { phase: 'expedition', position: { x: -2.5, y: 0, z: 25 }, selectedThreat: 'scout' });
for (const enemy of saved.world.threats) {
  if (enemy.id === 'scout' || enemy.id === 'patrol') {
    const position = enemy.id === 'scout' ? { x: -2.5, y: 0, z: 32.5 } : { x: -7.5, y: 0, z: 37.5 };
    Object.assign(enemy, { position, targetPosition: { ...position }, remainingSeconds: 60 });
  } else if (enemy.active) Object.assign(enemy, { health: 0, phase: 'cleared', lootClaimed: true, respawnAt: Date.now() + 3_600_000 });
}
const savePath = `${process.cwd()}/build/browser/combat-opening-${process.pid}.json`;
await Bun.write(savePath, JSON.stringify({ version: 1, accounts: [{ character, tokenHash: new Bun.CryptoHasher('sha256').update(token).digest('hex') }], world: JSON.stringify(saved), chat: [], nextChatId: 1 }));
const service = await createWorldService({ savePath, allowedOrigins: ['http://127.0.0.1:4411'] });
const server = Bun.serve<WorldSocketData>({ hostname: '127.0.0.1', port: 4412, fetch: (request, host) => service.fetch(request, host), websocket: service.websocket });
const frontend = Bun.spawn([process.execPath, 'scripts/dev-server.ts'], {
  env: { ...Bun.env, GREYWROUGHT_PORT: '4411', GREYWROUGHT_LOCAL_WORLD: '0' },
  stdout: Bun.file(`build/browser/combat-opening-${process.pid}-frontend.log`), stderr: Bun.file(`build/browser/combat-opening-${process.pid}-frontend-errors.log`),
});
let page: Awaited<ReturnType<typeof openBrowser>> | undefined;
try {
  for (let attempt = 0; attempt < 100; attempt++) {
    try { if ((await fetch(Bun.env.GREYWROUGHT_GAME_URL)).ok) break; } catch {}
    await Bun.sleep(100);
  }
  page = await openBrowser('combat-opening', { beforeNavigate: async call => {
    await call('Page.addScriptToEvaluateOnNewDocument', { source: `window.EventSource=class{};
      localStorage.setItem('greywrought/local-profile-v1',${JSON.stringify(JSON.stringify({ version: 1, displayName: 'Trailblazer', characters: [character], selectedCharacterId: character.id, savedAtMillis: Date.now() }))});
      localStorage.setItem('greywrought/world-token',${JSON.stringify(token)});
      window.readyCommands=0;window.openingHistory=[];
      const Native=WebSocket;window.WebSocket=class extends Native{
        constructor(url,...args){super(String(url).includes('/world')?'ws://127.0.0.1:4412/world':url,...args);this.addEventListener('message',event=>{const d=window.decodeWorldMessage(event);if(d.type==='state'){window.openingState=d.snapshot;window.openingHistory.push(d.snapshot);}});}
        send(message){const d=JSON.parse(message);if(d.command?.type==='ready')window.readyCommands++;super.send(message);}
      };` });
  } });
  await page.waitFor('document.body.dataset.entryRoute==="roster"');
  await page.evaluate(`(async()=>{const {Scene,Vector3}=await import('three');window.openingVector=Vector3;Scene.prototype.onAfterRender=function(renderer,scene,camera){window.openingCamera=camera;};})()`);
  await page.click('#entry-enter-world');
  await page.waitFor('document.body.dataset.entryRoute==="world"&&document.body.dataset.rigState==="ready"&&window.openingState.combat.openingStrikeAvailable');
  await page.click('.enemy-nameplate[data-enemy-id="scout"] .nameplate-target');
  await page.waitFor('document.body.dataset.gameSelectedThreat==="scout"&&document.getElementById("strike-ready").textContent.includes("Opening strike")');
  check(await page.evaluate('window.openingState.combat.phase==="idle"&&!window.openingState.player.inCombat'), 'Ranger remains undetected outside enemy detection range');
  check(await page.evaluate('document.getElementById("strike-ready").textContent.includes("Opening strike")'), 'Attack explains the opening strike');
  const attackPoint = await page.evaluate<{ x: number; y: number }>('(()=>{const r=document.querySelector(\'.adventure-actions [data-action="strike"]\').getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2};})()');
  await page.call('Input.dispatchMouseEvent', { type: 'mouseMoved', ...attackPoint, buttons: 0 });
  await page.shot('opening-strike-ready');
  const initialHealth = await page.evaluate<number>('window.openingState.threats.find(t=>t.id==="scout").health');
  await page.click('.adventure-actions [data-action="strike"]');
  await page.waitFor('window.openingState.combat.phase==="preparation"&&window.openingState.threats.find(t=>t.id==="patrol").windowAction');
  check(await page.evaluate(`window.openingState.threats.find(t=>t.id==='scout').health===${initialHealth - 18}`), 'Opening strike immediately deals ordinary Attack damage');
  check(await page.evaluate('window.openingState.player.health===100&&window.openingState.combat.queued.length===0&&!window.openingState.combat.openingStrikeAvailable'), 'Opening hit precedes enemy damage and does not duplicate a queued attack');
  check(await page.evaluate('window.openingState.threats.filter(t=>["scout","patrol"].includes(t.id)).every(t=>t.aggro&&!t.joinsNextWindow&&t.windowAction)'), 'Called helper shares the first turn with the attacked enemy');
  check(await page.evaluate('document.getElementById("combat-plan-phase").textContent.startsWith("Gathering enemies")&&document.querySelectorAll(".combat-plan-enemy-move").length===2'), 'Planner shows gathering and both enemy moves');
  await page.shot('opening-pull');
  await page.click('#combat-plan-aim-move');
  await page.waitFor('JSON.parse(document.getElementById("world-canvas").dataset.moveTiles||"[]").length>0&&window.openingCamera');
  const point = await page.evaluate<{ x: number; y: number }>(`(()=>{
    const tiles=JSON.parse(document.getElementById('world-canvas').dataset.moveTiles),hero=window.openingState.player.position;
    const p=tiles.filter(p=>Math.hypot(p.x-hero.x,p.z-hero.z)>.5).sort((a,b)=>Math.hypot(a.x-hero.x,a.z-hero.z)-Math.hypot(b.x-hero.x,b.z-hero.z))[0];
    const v=new window.openingVector(p.x,p.y,p.z).project(window.openingCamera),r=document.getElementById('world-canvas').getBoundingClientRect();
    return{x:r.left+(v.x+1)*r.width/2,y:r.top+(1-v.y)*r.height/2};})()`);
  await page.call('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', buttons: 1, clickCount: 1 });
  await page.call('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', buttons: 0, clickCount: 1 });
  await page.waitFor('window.openingState.combat.queued.some(action=>action.action==="bait")');
  await page.click('.combat-plan-edit[data-action="brace"]');
  await page.waitFor('window.openingState.combat.ready');
  check(await page.evaluate('window.readyCommands===1&&window.openingState.combat.phase==="preparation"&&window.openingState.combat.gatheringRemainingSeconds>0'), 'Auto-ready accepts the plan while gathering still holds the first turn');
  await page.shot('ready-gathering');
  await page.waitFor('window.openingState.combat.phase==="active"');
  check(await page.evaluate('window.openingState.combat.gatheringRemainingSeconds===0&&window.openingState.combat.cycle===1'), 'First turn starts only when the five-second window closes');
  await page.waitFor('window.openingState.combat.phase==="preparation"&&window.openingState.combat.cycle===2');
  check(await page.evaluate('window.openingState.threats.filter(t=>["scout","patrol"].includes(t.id)).every(t=>t.actionSequence===1)'), 'Both enemies act in the same opening turn');
  check(await page.evaluate(`window.openingState.threats.find(t=>t.id==='scout').health===${initialHealth - 18}`), 'The opening attack is applied exactly once');
  check(await page.evaluate('window.openingState.combat.gatheringRemainingSeconds===0&&window.readyCommands===1'), 'Subsequent turns do not repeat gathering or auto-ready an empty plan');
  await page.shot('next-turn');
  check(page.errors.length === 0, 'No browser exceptions');
  console.log('PASS undetected opening strike, social pull, shared opening intentions, five-second ready gate, and ordinary next turn', page.output);
} catch (error) { console.error(error); try { await page?.shot('failure'); } catch {} throw error; }
finally { await page?.close(); await service.close(); server.stop(true); frontend.kill(); await frontend.exited; }
