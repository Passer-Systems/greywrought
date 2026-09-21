import { supportHeight } from '../../src/game/movement.js';
import { createSharedAdventure } from '../../src/game/adventure.js';
import { createWorldService, type WorldSocketData } from '../../src/server/world-service.js';
import type { Position } from '../../src/game/adventure-types.js';
import { check, openBrowser } from './session.js';

const url = 'http://127.0.0.1:4341/';
Object.assign(Bun.env, { GREYWROUGHT_GAME_URL: url, GREYWROUGHT_DEBUG_PORT: '9541', GREYWROUGHT_VULKAN: '1' });
const character = { id: 'hover-fixture', name: 'Hover Explorer', archetype: 'hunter' as const, createdAtMillis: Date.now() };
const token = 'hover-fixture-token-00000000000000000';
const seed = createSharedAdventure(); seed.join(character.id, character.name, character.archetype);
const saved = JSON.parse(seed.save());
Object.assign(saved.characters[0].state, { phase: 'expedition', position: { x: -17.5, y: supportHeight(-17.5,42.5), z: 42.5 } });
saved.clock = { phase: 'preparation', cycle: 1, elapsedSeconds: 0 };
for (const threat of saved.world.threats) {
  if (threat.id === 'patrol') {
    Object.assign(threat, { aggro: true, phase: 'preparation', joinCycle: 1, windowCycle: 1, specialOffset: threat.id === 'patrol' ? .85 : 1.7, remainingSeconds: 1.7, castDuration: 1.7, comboOpened: true, targetPlayerId: character.id, combatants: [character.id] });
    threat.position = {x:-17.5,y:supportHeight(-17.5,45),z:45};
  } else if (threat.active) Object.assign(threat, { health: 0, phase: 'cleared', lootClaimed: true, respawnAt: Date.now() + 3600000 });
}
const savePath = `${process.cwd()}/build/browser/hover-${process.pid}.json`;
await Bun.write(savePath, JSON.stringify({ version: 1, accounts: [{ character, tokenHash: new Bun.CryptoHasher('sha256').update(token).digest('hex') }], world: JSON.stringify(saved), chat: [], nextChatId: 1 }));
const service = await createWorldService({ savePath, allowedOrigins: [url.slice(0,-1)] });
const server = Bun.serve<WorldSocketData>({ hostname:'127.0.0.1', port:4342, fetch:(request,host)=>service.fetch(request,host), websocket:service.websocket });
const frontend = Bun.spawn([process.execPath, 'scripts/dev-server.ts'], {env:{...Bun.env,GREYWROUGHT_PORT:'4341'},stdout:Bun.file('build/browser/hover-frontend.log'),stderr:Bun.file('build/browser/hover-frontend-errors.log')});
let page: Awaited<ReturnType<typeof openBrowser>> | undefined;
try {
  for(let i=0;i<100;i++){try {if((await fetch(url)).ok)break;}catch{}await Bun.sleep(100);}
  page = await openBrowser('movement-hover',{beforeNavigate:async call=>{
    await call('Network.enable'); await call('Network.setBlockedURLs',{urls:[url+'__dev/events']});
    await call('Page.addScriptToEvaluateOnNewDocument',{source:`localStorage.setItem('greywrought/local-profile-v1',${JSON.stringify(JSON.stringify({version:1,displayName:'Hover Test',characters:[character],selectedCharacterId:character.id,savedAtMillis:Date.now()}))});localStorage.setItem('greywrought/combat-auto-ready-v1','false');localStorage.setItem('greywrought/world-token',${JSON.stringify(token)});window.hoverRequests=0;const Native=WebSocket;window.WebSocket=class extends Native{constructor(url,...args){super(String(url).includes('/world')?'ws://127.0.0.1:4342/world':url,...args);this.addEventListener('message',e=>{const d=JSON.parse(e.data);if(d.type==='state')window.hoverState=d.snapshot;});}send(data){if(JSON.parse(data).command?.type==='previewBait')window.hoverRequests++;super.send(data);}};`});
  }});
  await page.waitFor('document.body.dataset.entryRoute==="roster"'); await page.click('#entry-enter-world');
  await page.waitFor('document.body.dataset.entryRoute==="world"&&document.body.dataset.rigState==="ready"&&document.body.dataset.environmentState==="ready"&&window.hoverState?.combat.phase==="preparation"');
  await page.evaluate(`(async()=>{const {Scene,Vector3}=await import('three');Scene.prototype.onAfterRender=function(renderer,scene,camera){if(camera.isPerspectiveCamera&&renderer.getRenderTarget()===null){window.hoverCamera=camera;window.hoverScene=scene;}};window.projectHover=(p)=>{const v=new Vector3(p.x,p.y,p.z).project(window.hoverCamera),r=document.getElementById('world-canvas').getBoundingClientRect();return{x:r.left+(v.x+1)*r.width/2,y:r.top+(1-v.y)*r.height/2};};})()`);
  await page.call('Input.dispatchMouseEvent',{type:'mouseMoved',x:450,y:200,buttons:0});
  await page.call('Input.dispatchMouseEvent',{type:'mousePressed',x:450,y:200,button:'right',buttons:2});
  for(let step=1;step<=10;step++)await page.call('Input.dispatchMouseEvent',{type:'mouseMoved',x:450+31.4*step,y:200,button:'right',buttons:2});
  await page.call('Input.dispatchMouseEvent',{type:'mouseReleased',x:764,y:200,button:'right',buttons:0});
  await page.click('#combat-plan-aim-move');
  await page.waitFor('JSON.parse(document.getElementById("world-canvas").dataset.moveTiles||"[]").length>0&&Boolean(window.hoverCamera)');
  const before = await page.evaluate<string>('JSON.stringify(window.hoverState.combat.queued)');
  const origin = await page.evaluate<Position>('window.hoverState.player.position');
  const tiles = await page.evaluate<Position[]>('JSON.parse(document.getElementById("world-canvas").dataset.moveTiles)');
  let chosen: Position | undefined;
  const preferred = tiles.find(tile => tile.x===origin.x&&tile.z===origin.z-2.5);
  for(const tile of preferred ? [preferred, ...tiles.filter(tile=>tile!==preferred)] : tiles){
    if (Math.hypot(tile.x-origin.x,tile.z-origin.z)>2.5) continue;
    const p=await page.evaluate<{x:number;y:number}>(`window.projectHover(${JSON.stringify(tile)})`);
    if(!await page.evaluate(`document.elementFromPoint(${p.x},${p.y})?.id==='world-canvas'`))continue;
    await page.call('Input.dispatchMouseEvent',{type:'mouseMoved',...p,buttons:0});
    try {await page.waitFor(`(()=>{const p=JSON.parse(document.getElementById('world-canvas').dataset.movePreview||'null');return p?.forecast&&p.destination.x===${tile.x}&&p.destination.z===${tile.z};})()`,3000);if(await page.evaluate('(()=>{const paths=JSON.parse(document.getElementById("world-canvas").dataset.telegraphs);return paths.some(p=>p.ability==="pursuit")&&paths.some(p=>p.ability==="maul"&&p.danger);})()')){chosen=tile;break;}}catch{}
  }
  check(chosen,'A reachable hovered tile receives its simulation');
  check(await page.evaluate('(()=>{const e=document.getElementById("combat-plan-outcome");return !e.hidden&&e.dataset.source==="destination"&&/damage|You fall/.test(e.textContent)&&getComputedStyle(e).visibility==="visible";})()'),'Hover shows compact consequences beside the visible plan');
  await page.shot('hover-consequences');
  check(await page.evaluate('JSON.parse(document.getElementById("world-canvas").dataset.telegraphs).some(p=>p.previewKind==="destination"&&p.ability==="pursuit")'),'Hover draws actual enemy pursuit');
  check(await page.evaluate<string>('JSON.stringify(window.hoverState.combat.queued)')===before,'Hover preserves the chosen plan');
  check(await page.evaluate('(()=>{let found=false;window.hoverScene?.traverse(o=>{if(o.material?.color?.getHex?.()===0xc4797b)found=true;});return found;})()'),'Hover draws subdued red enemy pursuit');
  const firstPursuit = await page.evaluate<string>('JSON.stringify(JSON.parse(document.getElementById("world-canvas").dataset.telegraphs).filter(p=>p.ability==="pursuit").map(p=>p.path))');
  let alternate: Position | undefined;
  for (const tile of tiles) {
    if(tile.x===chosen!.x&&tile.z===chosen!.z)continue;
    const p=await page.evaluate<{x:number;y:number}>(`window.projectHover(${JSON.stringify(tile)})`);
    if(await page.evaluate(`document.elementFromPoint(${p.x},${p.y})?.id==='world-canvas'`)){alternate=tile;break;}
  }
  check(alternate,'An alternate visible tile is available');
  if (alternate) {
    const p=await page.evaluate<{x:number;y:number}>(`window.projectHover(${JSON.stringify(alternate)})`);
    await page.call('Input.dispatchMouseEvent',{type:'mouseMoved',...p,buttons:0});
    await page.waitFor(`(()=>{const p=JSON.parse(document.getElementById('world-canvas').dataset.movePreview||'null');return p?.forecast&&p.destination.x===${alternate.x}&&p.destination.z===${alternate.z};})()`);
    check(await page.evaluate<string>('JSON.stringify(JSON.parse(document.getElementById("world-canvas").dataset.telegraphs).filter(p=>p.ability==="pursuit").map(p=>p.path))')!==firstPursuit,'Changing destination changes enemy pursuit');
  }
  const clickPoint=await page.evaluate<{x:number;y:number}>(`window.projectHover(${JSON.stringify(chosen)})`);
  await page.call('Input.dispatchMouseEvent',{type:'mouseMoved',...clickPoint,buttons:0});
  await page.call('Input.dispatchMouseEvent',{type:'mousePressed',x:clickPoint.x,y:clickPoint.y,button:'left',buttons:1});
  await page.call('Input.dispatchMouseEvent',{type:'mouseReleased',x:clickPoint.x,y:clickPoint.y,button:'left',buttons:0});
  await page.waitFor('JSON.parse(document.getElementById("world-canvas").dataset.moveRoute||"[]").length===1');
  await page.call('Input.dispatchMouseEvent',{type:'mouseMoved',x:20,y:20,buttons:0});
  await page.waitFor('JSON.parse(document.getElementById("world-canvas").dataset.movePreview||"null")?.forecast');
  const directDanger = await page.evaluate<boolean>('JSON.parse(document.getElementById("world-canvas").dataset.telegraphs).some(p=>p.ability==="maul"&&p.danger)');
  check(directDanger,'Stopping on the first tile shows a red Maul impact');
  await page.shot('stop-in-danger');
  check(await page.evaluate<string>('JSON.stringify(window.hoverState.combat.queued)')===before,'Clicking a stop edits a draft without prematurely committing');
  const remaining = 4 - Math.hypot(chosen.x-origin.x, chosen.z-origin.z) / 2.5;
  await page.waitFor(`Math.abs(Number(document.getElementById('world-canvas').dataset.moveRemaining)-${remaining})<1e-7&&JSON.parse(document.getElementById('world-canvas').dataset.moveOrigin).x===${chosen.x}&&JSON.parse(document.getElementById('world-canvas').dataset.moveOrigin).z===${chosen.z}`);
  check(await page.evaluate(`JSON.parse(document.getElementById('world-canvas').dataset.moveTiles).some(p=>p.x===${origin.x}&&p.z===${origin.z})`),'Starting tile stays reachable after spending the outgoing leg');
  check(await page.evaluate(`JSON.parse(document.getElementById('world-canvas').dataset.moveTiles).every(p=>Math.hypot(p.x-(${chosen.x}),p.z-(${chosen.z}))<=${remaining * 2.5}+1e-7)`),'Green tiles recenter and use only the remaining distance');
  const returnPoint=await page.evaluate<{x:number;y:number}>(`window.projectHover(${JSON.stringify({...origin,y:origin.y+1.1})})`);
  await page.call('Input.dispatchMouseEvent',{type:'mouseMoved',...returnPoint,buttons:0});
  await page.waitFor(`(()=>{const p=JSON.parse(document.getElementById('world-canvas').dataset.movePreview||'null');return p?.forecast&&p.via.length===1&&p.destination.x===${origin.x}&&p.destination.z===${origin.z};})()`);
  check(await page.evaluate('document.body.dataset.baitAiming==="true"'),'Hovering the character previews returning to its starting tile');
  await page.call('Input.dispatchMouseEvent',{type:'mousePressed',...returnPoint,button:'left',buttons:1});
  await page.call('Input.dispatchMouseEvent',{type:'mouseReleased',...returnPoint,button:'left',buttons:0});
  await page.call('Input.dispatchMouseEvent',{type:'mouseMoved',x:20,y:20,buttons:0});
  await page.waitFor('JSON.parse(document.getElementById("world-canvas").dataset.moveRoute||"[]").length===2&&JSON.parse(document.getElementById("world-canvas").dataset.telegraphs||"[]").filter(p=>p.kind==="stop").length===2');
  check(await page.evaluate('JSON.parse(document.getElementById("world-canvas").dataset.telegraphs).some(p=>p.ability==="maul"&&p.danger===false&&p.damage===0)'),'Adding the return leg makes the avoided impact pale');
  await page.shot('out-and-back-route');
  await page.press('Backspace');
  await page.waitFor('JSON.parse(document.getElementById("world-canvas").dataset.moveRoute).length===1');
  await page.waitFor(`Math.abs(Number(document.getElementById('world-canvas').dataset.moveRemaining)-${remaining})<1e-7`);
  await page.call('Input.dispatchMouseEvent',{type:'mouseMoved',...returnPoint,buttons:0});
  await page.call('Input.dispatchMouseEvent',{type:'mousePressed',...returnPoint,button:'left',buttons:1});
  await page.call('Input.dispatchMouseEvent',{type:'mouseReleased',...returnPoint,button:'left',buttons:0});
  await page.press('Enter');
  await page.waitFor('window.hoverState.combat.queued.some(entry=>entry.action==="bait")');
  await page.click('#combat-plan .combat-plan-edit[data-action="strike"]');
  await page.waitFor('JSON.parse(document.getElementById("world-canvas").dataset.telegraphs||"[]").some(p=>p.actorId==="hover-fixture"&&p.ability==="strike"&&p.color===0xffcb69)');
  check(await page.evaluate('window.hoverState.combat.queued.find(entry=>entry.action==="bait").via.length===1'),'Done commits the full returning route');
  await page.waitFor('JSON.parse(document.getElementById("world-canvas").dataset.telegraphs||"[]").some(p=>p.previewKind==="move"&&p.ability==="pursuit")');
  check(await page.evaluate('JSON.parse(document.getElementById("world-canvas").dataset.telegraphs).some(p=>p.previewKind==="move"&&p.ability==="pursuit"&&p.kind==="movement")'),'Queued Move keeps enemy pursuit visible');
  check(await page.evaluate('window.hoverState.combat.queued.some(entry=>entry.action==="bait")'),'Queued Move is retained while inspecting pursuit');
  const requests=await page.evaluate<number>('window.hoverRequests'); await Bun.sleep(700);
  check(await page.evaluate<number>('window.hoverRequests')===requests,'Stationary hover does not request on countdown broadcasts');
  await page.shot('enemy-pursuit-and-damage');
  await page.waitFor('document.getElementById("combat-plan-outcome").dataset.source==="plan"');
  await page.click('#combat-plan-aim-move');
  await page.call('Input.dispatchMouseEvent',{type:'mouseMoved',...clickPoint,buttons:0});
  await page.waitFor('document.getElementById("combat-plan-outcome").dataset.source==="destination"');
  await page.press('Escape');
  await page.waitFor('document.getElementById("combat-plan-outcome").dataset.source==="plan"&&JSON.parse(document.getElementById("world-canvas").dataset.movePreview||"null")===null');
  await page.click('#combat-plan .combat-plan-edit[data-action="brace"]');
  await page.waitFor('document.getElementById("combat-plan-outcome").textContent.includes("Defend activates")');
  await page.shot('committed-plan-consequences');
  await page.click('.combat-plan-ready');
  await page.waitFor('window.hoverState.combat.phase==="active"');
  check(await page.evaluate('document.getElementById("combat-plan-outcome").hidden&&JSON.parse(document.getElementById("world-canvas").dataset.telegraphs||"[]").length===0'),'Playback clears the forecast and pursuit previews');
  check(page.errors.length===0,'No browser exceptions');
  console.log('PASS live hover, actual pursuit, damage, untouched plan, countdown cache, cancellation',page.output);
} catch(error){await page?.shot('failure');console.error(await page?.evaluate('({state:window.hoverState,preview:document.getElementById("world-canvas")?.dataset.movePreview,requests:window.hoverRequests})'));throw error;}
finally{await page?.close();await service.close();server.stop(true);frontend.kill();await frontend.exited;}
