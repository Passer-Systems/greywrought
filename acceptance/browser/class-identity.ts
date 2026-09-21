import { createSharedAdventure } from '../../src/game/adventure.js';
import { createWorldService, type WorldSocketData } from '../../src/server/world-service.js';
import { check, openBrowser } from './session.js';

const url = 'http://127.0.0.1:4361/';
Object.assign(Bun.env, { GREYWROUGHT_GAME_URL: url, GREYWROUGHT_DEBUG_PORT: '9561', GREYWROUGHT_VULKAN: '1' });
const character = { id: 'class-fixture', name: 'Retort', archetype: 'alchemist' as const, createdAtMillis: Date.now() };
const token = 'class-fixture-token-00000000000000000';
const seed = createSharedAdventure(); seed.join(character.id, character.name, character.archetype);
const saved = JSON.parse(seed.save());
Object.assign(saved.characters[0].state, { phase: 'expedition', position: { x: -2.5, y: 0, z: 35 } });
saved.clock = { phase: 'preparation', cycle: 1, elapsedSeconds: 0 };
for (const threat of saved.world.threats) {
  if (threat.id === 'scout') {
    Object.assign(threat, { aggro: true, phase: 'preparation', joinCycle: 1, windowCycle: 1, specialOffset: 1.7, remainingSeconds: 1.7, castDuration: 1.7, comboOpened: true, targetPlayerId: character.id, combatants: [character.id] });
    threat.position = {x:-2.5,y:0,z:30};
  } else if (threat.active) Object.assign(threat, { health: 0, phase: 'cleared', lootClaimed: true, respawnAt: Date.now() + 3600000 });
}
const savePath = `${process.cwd()}/build/browser/class-${process.pid}.json`;
await Bun.write(savePath, JSON.stringify({ version: 1, accounts: [{ character, tokenHash: new Bun.CryptoHasher('sha256').update(token).digest('hex') }], world: JSON.stringify(saved), chat: [], nextChatId: 1 }));
const service = await createWorldService({ savePath, allowedOrigins: [url.slice(0,-1)] });
const server = Bun.serve<WorldSocketData>({ hostname:'127.0.0.1', port:4362, fetch:(request,host)=>service.fetch(request,host), websocket:service.websocket });
const frontend = Bun.spawn([process.execPath, 'scripts/dev-server.ts'], {env:{...Bun.env,GREYWROUGHT_PORT:'4361'},stdout:Bun.file('build/browser/class-frontend.log'),stderr:Bun.file('build/browser/class-frontend-errors.log')});
let page: Awaited<ReturnType<typeof openBrowser>> | undefined;
try {
  for(let i=0;i<100;i++){try {if((await fetch(url)).ok)break;}catch{}await Bun.sleep(100);}
  page = await openBrowser('class-identity',{beforeNavigate:async call=>{
    await call('Network.enable'); await call('Network.setBlockedURLs',{urls:[url+'__dev/events']});
    await call('Page.addScriptToEvaluateOnNewDocument',{source:`localStorage.setItem('greywrought/local-profile-v1',${JSON.stringify(JSON.stringify({version:1,displayName:'Hover Test',characters:[character],selectedCharacterId:character.id,savedAtMillis:Date.now()}))});localStorage.setItem('greywrought/combat-auto-ready-v1','false');localStorage.setItem('greywrought/world-token',${JSON.stringify(token)});window.hoverRequests=0;const Native=WebSocket;window.WebSocket=class extends Native{constructor(url,...args){super(String(url).includes('/world')?'ws://127.0.0.1:4362/world':url,...args);this.addEventListener('message',e=>{const d=JSON.parse(e.data);if(d.type==='state')window.hoverState=d.snapshot;});}send(data){if(JSON.parse(data).command?.type==='previewBait')window.hoverRequests++;super.send(data);}};`});
  }});
  await page.waitFor('document.body.dataset.entryRoute==="roster"'); await page.click('#entry-enter-world');
  await page.waitFor('document.body.dataset.entryRoute==="world"&&document.body.dataset.rigState==="ready"&&document.body.dataset.environmentState==="ready"&&window.hoverState?.combat.phase==="preparation"');
  await page.evaluate(`(async()=>{const {Scene}=await import('three');Scene.prototype.onAfterRender=function(renderer,scene,camera){if(camera.isPerspectiveCamera&&renderer.getRenderTarget()===null)window.classScene=scene;};})()`);
  check(await page.evaluate('[...document.querySelectorAll(".combat-plan-edit")].map(b=>b.textContent).join(",")==="Move,Attack,Defend"'),'Only Move, Attack and Defend are offered');
  await page.click('#combat-plan .combat-plan-edit[data-action="strike"]');
  await page.waitFor('document.getElementById("combat-plan-outcome").textContent.includes("Volatile residue applied")');
  check(await page.evaluate('document.querySelector(".combat-plan-move[data-queued-action=strike] img").src.includes("poison-vial")'),'Alchemist plan uses its vial icon');
  await page.shot('alchemist-coating-forecast');
  const cycle=await page.evaluate<number>('window.hoverState.combat.cycle');
  await page.click('.combat-plan-ready');
  await page.waitFor(`window.hoverState.combat.phase==="preparation"&&window.hoverState.combat.cycle>${cycle}`);
  await page.waitFor('window.hoverState.threats.some(t=>t.volatileResidue)');
  check(await page.evaluate('(()=>{let found=false;window.classScene?.traverse(o=>{if(o.name.startsWith("residue:")&&o.material?.color?.getHex()===0xb8cf65)found=true;});return found;})()'),'Live residue has a visible green particle effect');
  await page.click('#combat-plan .combat-plan-edit[data-action="strike"]');
  await page.waitFor('document.getElementById("combat-plan-outcome").textContent.includes("Residue ignites")');
  await page.shot('alchemist-ignition-forecast');
  const next=await page.evaluate<number>('window.hoverState.combat.cycle');
  const expected=await page.evaluate<number>('window.hoverState.combat.forecast.outcomes.find(o=>o.id==="scout").health');
  await page.click('.combat-plan-ready');
  await page.waitFor(`window.hoverState.combat.phase==="preparation"&&window.hoverState.combat.cycle>${next}`);
  check(await page.evaluate<number>('window.hoverState.threats.find(t=>t.id==="scout").health')===expected,'Observed health matches the ignition forecast');
  check(await page.evaluate('!window.hoverState.threats.find(t=>t.id==="scout").volatileResidue'),'Detonation consumes the coating');
  check(page.errors.length===0,'No browser exceptions');
  console.log('PASS three buttons, class icon, coat, particles, ignition forecast and matching execution',page.output);
} catch(error){await page?.shot('failure');console.error(await page?.evaluate('({state:window.hoverState,preview:document.getElementById("world-canvas")?.dataset.movePreview,requests:window.hoverRequests})'));throw error;}
finally{await page?.close();await service.close();server.stop(true);frontend.kill();await frontend.exited;}
