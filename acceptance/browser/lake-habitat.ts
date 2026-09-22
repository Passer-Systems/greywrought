import { createSharedAdventure } from '../../src/game/adventure.js';
import { supportHeight } from '../../src/game/movement.js';
import { terrainHeight } from '../../src/game/cave-layout.js';
import { createWorldService, type WorldSocketData } from '../../src/server/world-service.js';
import { openBrowser, check } from './session.js';

const url = 'http://127.0.0.1:4497/';
Object.assign(Bun.env, { GREYWROUGHT_GAME_URL:url, GREYWROUGHT_DEBUG_PORT:'9697', GREYWROUGHT_VULKAN:'1' });
const locations = [{id:'source',x:-71,z:-86},{id:'fall',x:-49,z:-83},{id:'basin',x:-43,z:-104}];
const characters = locations.map(p=>({id:`lake-${p.id}`,name:'Lake Walker',archetype:'hunter' as const,createdAtMillis:1}));
const token = 'lake-habitat-fixture-00000000000000000000';
const seed = createSharedAdventure();
for (const character of characters) seed.join(character.id,character.name,character.archetype);
const saved = JSON.parse(seed.save());
for (const [i,p] of locations.entries()) Object.assign(saved.characters[i].state, {phase:'expedition',position:{x:p.x,y:supportHeight(p.x,p.z),z:p.z}});
for (const threat of saved.world.threats) if (threat.active && threat.id !== 'lake-dreadnought')
  Object.assign(threat,{health:0,phase:'cleared',lootClaimed:true,respawnAt:Date.now()+3_600_000});
const savePath = `${process.cwd()}/build/browser/lake-habitat-${process.pid}.json`;
await Bun.write(savePath,JSON.stringify({version:1,accounts:characters.map(character=>({character,tokenHash:new Bun.CryptoHasher('sha256').update(token).digest('hex')})),world:JSON.stringify(saved),chat:[],nextChatId:1}));
const service = await createWorldService({savePath,allowedOrigins:[url.slice(0,-1)]});
const server = Bun.serve<WorldSocketData>({hostname:'127.0.0.1',port:4498,fetch:(r,h)=>service.fetch(r,h),websocket:service.websocket});
const frontend = Bun.spawn([process.execPath,Bun.env.LAKE_STATIC==='1'?'scripts/static-server.ts':'scripts/dev-server.ts'],{
  env:{...Bun.env,GREYWROUGHT_PORT:'4497',GREYWROUGHT_LOCAL_WORLD:'0'},stdout:Bun.file('build/browser/lake-habitat-frontend.log'),stderr:Bun.file('build/browser/lake-habitat-errors.log'),
});
let page: Awaited<ReturnType<typeof openBrowser>> | undefined;
try {
  for (let i=0;i<100;i++) { try { if ((await fetch(url)).ok) break; } catch {} await Bun.sleep(100); }
  page = await openBrowser('lake-habitat',{localOnly:true,beforeNavigate:async call=>{
    await call('Page.addScriptToEvaluateOnNewDocument',{source:`window.EventSource=class{};
      localStorage.setItem('greywrought/local-profile-v1',${JSON.stringify(JSON.stringify({version:1,displayName:'Lake Test',characters,selectedCharacterId:characters[0]!.id,savedAtMillis:1}))});
      localStorage.setItem('greywrought/world-token',${JSON.stringify(token)});
      const Native=WebSocket;window.WebSocket=class extends Native{constructor(url,...args){super(String(url).includes('/world')?'ws://127.0.0.1:4498/world':url,...args);}set onmessage(callback){super.onmessage=e=>{const m=JSON.parse(e.data),d=window.decodeWorldMessage(e);if(d.type==='state')window.lakeState=d.snapshot;if(m.type==='state'||m.type==='stateDelta'){m.serverWallTimeMillis=${Date.parse('2026-07-15T12:00:00-07:00')};m.rainIntensity=0;}callback?.call(this,new MessageEvent('message',{data:JSON.stringify(m)}));};}};`});
  }});
  await page.waitFor('document.body.dataset.entryRoute==="roster"');
  await page.evaluate(`(async()=>{const{Scene}=await import('three');Scene.prototype.onAfterRender=function(r,s,c){if(r.domElement.id==='world-canvas'&&c.isPerspectiveCamera&&s.children.some(o=>o.userData.localPlayer)){window.lakeScene=s;window.lakeCamera=c;window.lakeRenderer=r;}};})()`);
  async function orbit(dx:number,dy=0) {
    await page!.call('Input.dispatchMouseEvent',{type:'mousePressed',x:800,y:400,button:'right',buttons:2,clickCount:1});
    await page!.call('Input.dispatchMouseEvent',{type:'mouseMoved',x:800+dx,y:400+dy,button:'right',buttons:2});
    await page!.call('Input.dispatchMouseEvent',{type:'mouseReleased',x:800+dx,y:400+dy,button:'right',buttons:0,clickCount:1});
    await Bun.sleep(300);
  }
  for (const location of locations) {
    await page.click(`[data-character-id="lake-${location.id}"]`);
    await page.evaluate('window.lakeScene=null');
    await page.click('#entry-enter-world');
    await page.waitFor('document.body.dataset.entryRoute==="world"&&document.body.dataset.environmentState==="ready"&&document.body.dataset.creatureRigState==="ready"&&!!window.lakeScene',30000);
    if (location.id==='source') await orbit(-210,-60);
    if (location.id==='fall') await orbit(125,-65);
    if (location.id==='basin') {
      await page.evaluate('document.getElementById("world-canvas").focus()');
      await page.key('ControlLeft',true); await Bun.sleep(1800); await page.key('ControlLeft',false);
      await page.waitFor('window.lakeState.player.position.y < -3');
      await orbit(-260,-120);
      await page.click('.enemy-nameplate[data-enemy-id="lake-dreadnought"] .nameplate-target');
      await page.waitFor('document.getElementById("target-frame").dataset.targetId==="lake-dreadnought"');
      const depth = await page.evaluate<{position:{x:number;y:number;z:number};renderY:number}>(`(()=>{const t=lakeState.threats.find(t=>t.id==='lake-dreadnought'),r=lakeScene.children.find(o=>o.userData.threatId===t.id);return{position:t.position,renderY:r.position.y};})()`);
      check(depth.position.y>=terrainHeight(depth.position.x,depth.position.z)-.01,'Dredgeback stays above the lakebed');
      check(Math.abs(depth.position.y-depth.renderY)<.5,'The rendered Dredgeback follows its authoritative swimming depth');
      await Bun.write(`${page.output}/dredgeback.json`,JSON.stringify(depth,null,2));
    }
    await page.shot(location.id);
    if (location.id==='source') {
      await page.evaluate(`lakeScene.onBeforeRender=function(r,s,c){if(c===lakeCamera){c.position.set(-66,30,-94);c.lookAt(-66,14,-81);c.updateMatrixWorld();}}`);
      await Bun.sleep(200); await page.shot('source-overview');
      await page.evaluate('lakeScene.onBeforeRender=function(){}');
    }
    check(await page.evaluate('lakeRenderer.info.programs.every(p=>p.diagnostics?.runnable!==false)'),'Lake and waterfall shaders compile');
    await page.click('#pause-open'); await page.click('#pause-tab-settings'); await page.click('#return-roster');
    await page.waitFor('document.body.dataset.entryRoute==="roster"');
  }
  check(page.errors.length===0,'Lake journey has no browser exceptions');
  console.log('PASS lake source, waterfall, diving and Dredgeback selection',page.output);
} catch(error) { try { await page?.shot('failure'); } catch {} throw error; }
finally { await page?.key('ControlLeft',false).catch(()=>{}); await page?.close(); await service.close(); server.stop(true); frontend.kill(); await frontend.exited; }
