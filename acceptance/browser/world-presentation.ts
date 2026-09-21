import { checkMinimap } from "./minimap-check.js";
import { createSharedAdventure } from '../../src/game/adventure.js';
import { terrainHeight } from '../../src/game/cave-layout.js';
import { LAKE_WATER_LEVEL } from '../../src/game/world-elevation.js';
import { WORLD_DAY_MILLISECONDS } from '../../src/game/world-time.js';
import { createWorldService, type WorldSocketData } from '../../src/server/world-service.js';
import { openBrowser, check } from './session.js';

const url='http://127.0.0.1:4453/';
Object.assign(Bun.env,{GREYWROUGHT_GAME_URL:url,GREYWROUGHT_DEBUG_PORT:'9653',GREYWROUGHT_VULKAN:'1'});
const locations=[{id:'lake',x:-33,z:-78},{id:'town',x:0,z:-8},{id:'bird',x:-1,z:-112},{id:'woods',x:-6,z:45},{id:'combat',x:-3,z:22}];
const characters=locations.map(l=>({id:`nature-${l.id}`,name:'Nature Walker',archetype:'hunter' as const,createdAtMillis:1}));
const token='nature-fixture-token-0000000000000000000';
const seed=createSharedAdventure();for(const c of characters)seed.join(c.id,c.name,c.archetype);
const saved=JSON.parse(seed.save());
for(const [i,l] of locations.entries())Object.assign(saved.characters[i].state,{phase:l.id==='town'?'town':'expedition',position:{x:l.x,y:terrainHeight(l.x,l.z),z:l.z}});
for(const t of saved.world.threats)if(t.active&&!['pond-turtle','meadow-rat','meadow-rat-2','meadow-bird','meadow-bird-2','meadow-bird-3','scout','nest'].includes(t.id))Object.assign(t,{health:0,phase:'cleared',lootClaimed:true,respawnAt:Date.now()+3_600_000});
const savePath=`${process.cwd()}/build/browser/nature-${process.pid}.json`;
await Bun.write(savePath,JSON.stringify({version:1,accounts:characters.map(character=>({character,tokenHash:new Bun.CryptoHasher('sha256').update(token).digest('hex')})),world:JSON.stringify(saved),chat:[],nextChatId:1}));
const service=await createWorldService({savePath,allowedOrigins:[url.slice(0,-1)]});
const server=Bun.serve<WorldSocketData>({hostname:'127.0.0.1',port:4454,fetch:(r,h)=>service.fetch(r,h),websocket:service.websocket});
const frontend=Bun.spawn([process.execPath,'scripts/dev-server.ts'],{env:{...Bun.env,GREYWROUGHT_PORT:'4453',GREYWROUGHT_LOCAL_WORLD:'0'},stdout:Bun.file('build/browser/nature-frontend.log'),stderr:Bun.file('build/browser/nature-frontend-errors.log')});
let page:Awaited<ReturnType<typeof openBrowser>>|undefined;
let companion:WebSocket|undefined;
try{
 for(let i=0;i<100;i++){try{if((await fetch(url)).ok)break;}catch{}await Bun.sleep(100);}
 page=await openBrowser('world-presentation',{localOnly:true,beforeNavigate:async call=>{
  await call('Page.addScriptToEvaluateOnNewDocument',{source:`window.EventSource=class{};window.connectionEvents=[];new PerformanceObserver(list=>{for(const e of list.getEntries())window.connectionEvents.push({type:'longtask',at:e.startTime,duration:e.duration});}).observe({type:'longtask',buffered:true});
   window.frameSamples=[];window.measuring=false;window.lastFrame=0;const nativeFrame=requestAnimationFrame;window.requestAnimationFrame=callback=>nativeFrame.call(window,now=>{const start=performance.now();callback(now);if(window.measuring&&callback.name==='tick'){window.frameSamples.push({duration:performance.now()-start,interval:window.lastFrame?now-window.lastFrame:0});window.lastFrame=now;}});
   if(!localStorage.getItem('greywrought/local-profile-v1'))localStorage.setItem('greywrought/local-profile-v1',${JSON.stringify(JSON.stringify({version:1,displayName:'Nature Test',characters,selectedCharacterId:characters[0]!.id,savedAtMillis:Date.now()}))});
   localStorage.setItem('greywrought/world-token',${JSON.stringify(token)});
   const Native=WebSocket;window.WebSocket=class extends Native{constructor(url,...args){super(String(url).includes('/world')?'ws://127.0.0.1:4454/world':url,...args);this.addEventListener('open',()=>window.connectionEvents.push({type:'open',at:performance.now()}));this.addEventListener('close',e=>window.connectionEvents.push({type:'close',at:performance.now(),code:e.code,reason:e.reason}));}set onmessage(callback){super.onmessage=e=>{const m=JSON.parse(e.data);if(m.type==='state'){m.serverWallTimeMillis=Math.floor(m.serverWallTimeMillis/${WORLD_DAY_MILLISECONDS})*${WORLD_DAY_MILLISECONDS}+(window.natureNight?0:${WORLD_DAY_MILLISECONDS/2});window.natureState=m.snapshot;}callback?.call(this,new MessageEvent('message',{data:JSON.stringify(m)}));};}};`});
 }});
 async function enter(){
  await page!.waitFor('document.body.dataset.entryRoute==="roster"');
  await page!.evaluate(`(async()=>{window.natureScene=null;const{Scene,Vector3,Box3}=await import('three');window.THREE={Vector3,Box3};Scene.prototype.onAfterRender=function(renderer,scene,camera){if(renderer.domElement.id==='world-canvas'&&renderer.getRenderTarget()===null&&camera.isPerspectiveCamera){window.natureScene=scene;window.natureCamera=camera;window.natureRenderer=renderer;}};})()`);
  await page!.click('#entry-enter-world');
  await page!.waitFor('document.body.dataset.entryRoute==="world"&&document.body.dataset.rigState==="ready"&&document.body.dataset.creatureRigState==="ready"&&document.body.dataset.environmentState==="ready"&&!!window.natureScene',25000);
  if(await page!.evaluate('document.body.dataset.encounterMode==="paused"')){await page!.click('#pause-resume');await page!.waitFor('document.body.dataset.gamePaused==="false"');}
  if(await page!.evaluate('document.body.dataset.encounterMode==="private"')){await page!.click('#encounter-rejoin');await page!.waitFor('document.body.dataset.encounterMode==="shared"');}
  if(await page!.evaluate('!document.getElementById("pause-panel").hidden'))await page!.press('Escape');
 }
 async function switchTo(id:string){await page!.click('#pause-open');await page!.click('#pause-tab-settings');await page!.click('#return-roster');await page!.waitFor('document.body.dataset.entryRoute==="roster"');await page!.evaluate(`document.querySelector('[data-character-id="nature-${id}"]').scrollIntoView({block:'center'})`);await page!.click(`[data-character-id="nature-${id}"]`);await enter();}
 async function orbit(dx:number,dy:number){await page!.call('Input.dispatchMouseEvent',{type:'mouseMoved',x:800,y:400,buttons:0});await page!.call('Input.dispatchMouseEvent',{type:'mousePressed',x:800,y:400,button:'right',buttons:2,clickCount:1});await page!.call('Input.dispatchMouseEvent',{type:'mouseMoved',x:800+dx,y:400+dy,button:'right',buttons:2});await page!.call('Input.dispatchMouseEvent',{type:'mouseReleased',x:800+dx,y:400+dy,button:'right',buttons:0,clickCount:1});}
 await enter(); await Bun.sleep(900); await page.shot('waterfall-and-fog');
 check(await page.evaluate('window.natureRenderer.info.programs.every(p=>p.diagnostics?.runnable!==false)'), 'Atmosphere shaders compile');
 await switchTo('woods'); await orbit(0,-70); await Bun.sleep(650); await page.shot('woods-mist-high');
 await page.click('#pause-open'); await page.click('#pause-tab-settings');
 await page.evaluate("(()=>{const q=document.getElementById('atmosphere-quality');q.value='off';q.dispatchEvent(new Event('change'));})()");await page.press('Escape');
 await Bun.sleep(350);await page.shot('woods-mist-off');
 check(await page.evaluate("window.natureScene.getObjectByName('environment-atmosphere').visible===false"),'Atmosphere off hides only environment effects');
 await switchTo('bird');
 check(await page.evaluate("document.querySelector('.enemy-nameplate[data-enemy-id=meadow-bird-2]').hidden"),'Critter plate defaults off');
 const bird=await page.evaluate<{x:number;y:number}>(`(()=>{const o=window.natureScene.children.find(o=>o.userData.threatId==='meadow-bird-2'),p=o.position.clone();p.y+=4.5;p.project(window.natureCamera);const r=document.getElementById('world-canvas').getBoundingClientRect();return{x:r.left+(p.x+1)*r.width/2,y:r.top+(1-p.y)*r.height/2};})()`);
 await page.call('Input.dispatchMouseEvent',{type:'mousePressed',...bird,button:'left',buttons:1,clickCount:1});await page.call('Input.dispatchMouseEvent',{type:'mouseReleased',...bird,button:'left',buttons:0,clickCount:1});
 await page.waitFor("document.getElementById('target-frame').dataset.targetId==='meadow-bird-2'");
 check(await page.evaluate("window.natureScene.children.find(o=>o.userData.threatId==='meadow-bird-2').getObjectByName('unit-selection-circle').material.color.getHex()===0xf5df38"),'Neutral selection circle is yellow');
 await page.shot('selected-bird');
 await page.click('#pause-open');await page.click('#pause-tab-settings');await page.click('#show-neutral-critter-names');
 await page.evaluate("(()=>{const q=document.getElementById('atmosphere-quality');q.value='high';q.dispatchEvent(new Event('change'));})()");await page.press('Escape');
 await page.waitFor("!document.querySelector('.enemy-nameplate[data-enemy-id=meadow-bird-2]').hidden");
 await page.shot('critter-plates-enabled');
 await page.click('.adventure-actions [data-action=strike]');
 await page.waitFor("window.natureState.threats.find(t=>t.id==='meadow-bird-2').health===0",8000);await page.shot('bird-defeated');
 await switchTo('town');
 check(await page.evaluate("!document.getElementById('player-rest-status').hidden&&document.getElementById('player-combat-status').hidden&&document.querySelector('#player-frame .unit-frame-level').hidden"),'Town shows zzz instead of level');
 await page.shot('resting-badge');await page.evaluate('window.natureNight=true');await Bun.sleep(500);await page.shot('town-lamps-night');await page.evaluate('window.natureNight=false');
 await switchTo('combat');
 check(await page.evaluate("document.getElementById('player-rest-status').hidden&&document.getElementById('player-combat-status').hidden&&!document.querySelector('#player-frame .unit-frame-level').hidden"),'Exploration shows level only');
 const cameraState=()=>page!.evaluate<{x:number;y:number;z:number;offset:number}>(`(()=>{const p=window.natureScene.children.find(o=>o.userData.localPlayer).position.clone();p.y+=1.1;const c=window.natureCamera;const projected=p.clone().project(c);return{x:c.position.x-p.x,y:c.position.y-p.y,z:c.position.z-p.z,offset:Math.hypot(projected.x,projected.y)};})()`);
 const before=await cameraState();await page.key('KeyW',true);await page.waitFor('window.natureState.player.inCombat',6000);await page.key('KeyW',false);await Bun.sleep(450);
 const after=await cameraState();check(Math.hypot(after.x-before.x,after.y-before.y,after.z-before.z)<.2&&after.offset<.01,'Combat preserves exploration camera orbit and centered player');
 check(await page.evaluate("!document.getElementById('player-combat-status').hidden&&document.getElementById('player-rest-status').hidden&&document.querySelector('#player-frame .unit-frame-level').hidden"),'Combat replaces level with swords');
 await page.click('.enemy-nameplate[data-enemy-id=scout] .nameplate-target');
 check(await page.evaluate("window.natureScene.children.find(o=>o.userData.threatId==='scout').getObjectByName('unit-selection-circle').material.color.getHex()===0xff3232"),'Hostile selection circle is red');await page.shot('combat-swords-red-circle');
 await orbit(-45,-30);const orbited=await cameraState();check(Math.abs(orbited.x-after.x)>.5&&orbited.offset<.01,'Camera orbit remains usable in combat');
 await page.call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
 check(await page.evaluate("getComputedStyle(document.querySelector('#player-combat-status svg')).animationName==='none'"),'Reduced motion disables sword pulse');
 check(await page.evaluate('window.natureRenderer.info.programs.every(p=>p.diagnostics?.runnable!==false)'), 'All presentation shaders compile');
 check(page.errors.length===0,'No browser exceptions');console.log('PASS world presentation journey',page.output);
}catch(error){try{await page?.shot('failure');console.log('Connection diagnostics',await page?.evaluate('window.connectionEvents'));}catch{}throw error;}
finally{companion?.close();await page?.key('KeyW',false).catch(()=>{});await page?.close();await service.close();server.stop(true);frontend.kill();await frontend.exited;}
