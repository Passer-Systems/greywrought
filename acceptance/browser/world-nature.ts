import { checkMinimap } from "./minimap-check.js";
import { createSharedAdventure } from '../../src/game/adventure.js';
import { terrainHeight } from '../../src/game/cave-layout.js';
import { LAKE_WATER_LEVEL } from '../../src/game/world-elevation.js';
import { createWorldService, type WorldSocketData } from '../../src/server/world-service.js';
import { openBrowser, check } from './session.js';

const seattleNoon = Date.parse('2026-07-15T12:00:00-07:00');

const url='http://127.0.0.1:4451/';
Object.assign(Bun.env,{GREYWROUGHT_GAME_URL:url,GREYWROUGHT_DEBUG_PORT:'9651',GREYWROUGHT_VULKAN:'1'});
const locations=[{id:'lake',x:-4,z:-125},{id:'town',x:-8,z:-3},{id:'ridge',x:60,z:15},{id:'woods',x:-6,z:45},{id:'companion',x:-8,z:-99}];
const characters=locations.map(l=>({id:`nature-${l.id}`,name:'Nature Walker',archetype:'warrior' as const,createdAtMillis:1}));
const token='nature-fixture-token-0000000000000000000';
const seed=createSharedAdventure();for(const c of characters)seed.join(c.id,c.name,c.archetype);
const saved=JSON.parse(seed.save());
for(const [i,l] of locations.entries())Object.assign(saved.characters[i].state,{phase:l.id==='town'?'town':'expedition',position:{x:l.x,y:terrainHeight(l.x,l.z),z:l.z}});
for(const t of saved.world.threats)if(t.active&&!['pond-turtle','meadow-rat','meadow-rat-2'].includes(t.id))Object.assign(t,{health:0,phase:'cleared',lootClaimed:true,respawnAt:Date.now()+3_600_000});
const savePath=`${process.cwd()}/build/browser/nature-${process.pid}.json`;
await Bun.write(savePath,JSON.stringify({version:1,accounts:characters.map(character=>({character,tokenHash:new Bun.CryptoHasher('sha256').update(token).digest('hex')})),world:JSON.stringify(saved),chat:[],nextChatId:1}));
const service=await createWorldService({savePath,allowedOrigins:[url.slice(0,-1)]});
const server=Bun.serve<WorldSocketData>({hostname:'127.0.0.1',port:4452,fetch:(r,h)=>service.fetch(r,h),websocket:service.websocket});
const frontend=Bun.spawn([process.execPath,'scripts/dev-server.ts'],{env:{...Bun.env,GREYWROUGHT_PORT:'4451',GREYWROUGHT_LOCAL_WORLD:'0'},stdout:Bun.file('build/browser/nature-frontend.log'),stderr:Bun.file('build/browser/nature-frontend-errors.log')});
let page:Awaited<ReturnType<typeof openBrowser>>|undefined;
let companion:WebSocket|undefined;
try{
 for(let i=0;i<100;i++){try{if((await fetch(url)).ok)break;}catch{}await Bun.sleep(100);}
 page=await openBrowser('world-nature',{localOnly:true,beforeNavigate:async call=>{
  await call('Page.addScriptToEvaluateOnNewDocument',{source:`window.EventSource=class{};
   window.frameSamples=[];window.measuring=false;window.lastFrame=0;const nativeFrame=requestAnimationFrame;window.requestAnimationFrame=callback=>nativeFrame.call(window,now=>{const start=performance.now();callback(now);if(window.measuring&&callback.name==='tick'){window.frameSamples.push({duration:performance.now()-start,interval:window.lastFrame?now-window.lastFrame:0});window.lastFrame=now;}});
   if(!localStorage.getItem('greywrought/local-profile-v1'))localStorage.setItem('greywrought/local-profile-v1',${JSON.stringify(JSON.stringify({version:1,displayName:'Nature Test',characters,selectedCharacterId:characters[0]!.id,savedAtMillis:Date.now()}))});
   localStorage.setItem('greywrought/world-token',${JSON.stringify(token)});
   const Native=WebSocket;window.WebSocket=class extends Native{constructor(url,...args){super(String(url).includes('/world')?'ws://127.0.0.1:4452/world':url,...args);}set onmessage(callback){super.onmessage=e=>{const m=JSON.parse(e.data);if(m.type==='state'){m.serverWallTimeMillis=${seattleNoon};window.natureState=m.snapshot;}callback?.call(this,new MessageEvent('message',{data:JSON.stringify(m)}));};}};`});
 }});
 async function enter(){
  await page!.waitFor('document.body.dataset.entryRoute==="roster"');
  await page!.evaluate(`(async()=>{window.natureScene=null;const{Scene,Vector3,Box3}=await import('three');window.THREE={Vector3,Box3};Scene.prototype.onAfterRender=function(renderer,scene,camera){if(renderer.domElement.id==='world-canvas'){window.natureScene=scene;window.natureCamera=camera;window.natureRenderer=renderer;}};})()`);
  await page!.click('#entry-enter-world');
  await page!.waitFor('document.body.dataset.entryRoute==="world"&&document.body.dataset.rigState==="ready"&&document.body.dataset.creatureRigState==="ready"&&document.body.dataset.environmentState==="ready"&&!!window.natureScene',25000);
  if(await page!.evaluate('document.body.dataset.encounterMode==="paused"')){await page!.click('#pause-resume');await page!.waitFor('document.body.dataset.gamePaused==="false"');}
  if(await page!.evaluate('document.body.dataset.encounterMode==="private"')){await page!.click('#encounter-rejoin');await page!.waitFor('document.body.dataset.encounterMode==="shared"');}
  if(await page!.evaluate('!document.getElementById("pause-panel").hidden'))await page!.press('Escape');
 }
 async function switchTo(id:string){await page!.click('#pause-open');await page!.click('#pause-tab-settings');await page!.click('#return-roster');await page!.waitFor('document.body.dataset.entryRoute==="roster"');await page!.click(`[data-character-id="nature-${id}"]`);await enter();}
 async function orbit(dx:number,dy:number){await page!.call('Input.dispatchMouseEvent',{type:'mouseMoved',x:800,y:400,buttons:0});await page!.call('Input.dispatchMouseEvent',{type:'mousePressed',x:800,y:400,button:'right',buttons:2,clickCount:1});await page!.call('Input.dispatchMouseEvent',{type:'mouseMoved',x:800+dx,y:400+dy,button:'right',buttons:2});await page!.call('Input.dispatchMouseEvent',{type:'mouseReleased',x:800+dx,y:400+dy,button:'right',buttons:0,clickCount:1});}
 await enter();await checkMinimap(page, "lake");console.log('entered lake');await page.shot('lake-approach');
 await orbit(0,-85);await Bun.sleep(500);await page.shot('lake-shore-low');
 await orbit(0,85);
 check(await page.evaluate("window.natureScene.getObjectByName('swimming-wake').userData.activeStampCount===0"),'Walking on land leaves no swimming trail');
 await page.key('KeyW',true);await page.waitFor('Number(document.body.dataset.gamePlayerZ)>-100',18000);
 await page.waitFor("window.natureScene.getObjectByName('swimming-wake').userData.activeStampCount>3");await page.shot('swimming-wake-moving');await page.key('KeyW',false);
 await page.waitFor('document.body.dataset.rigAnimation==="Swim_Idle_Loop"');await page.shot('lake-swimming');
 const atWater=await page.evaluate<{x:number;y:number;z:number}>('window.natureState.player.position');
 check(Math.abs(atWater.y-(LAKE_WATER_LEVEL-.8))<.12,'Swimmer stays partly submerged at the water surface');
 await page.waitFor("window.natureScene.getObjectByName('swimming-wake').userData.activeStampCount===0",5000);await page.shot('swimming-wake-faded');
 companion=new WebSocket('ws://127.0.0.1:4452/world');
 await new Promise<void>((resolve,reject)=>{companion!.onopen=()=>companion!.send(JSON.stringify({type:'join',token,character:characters[4]}));companion!.onmessage=e=>{if(JSON.parse(String(e.data)).type==='state')resolve();};companion!.onerror=()=>reject(Error('Companion failed to join'));});
 companion.send(JSON.stringify({type:'command',sequence:1,command:{type:'action',action:'forward',pressed:true}}));
 await page.waitFor("window.natureScene.getObjectByName('swimming-wake').userData.activeStampCount>3");await page.shot('companion-swimming-wake');
 companion.send(JSON.stringify({type:'command',sequence:2,command:{type:'action',action:'forward',pressed:false}}));
 await page.waitFor("window.natureScene.getObjectByName('swimming-wake').userData.activeStampCount===0",5000);companion.close();companion=undefined;
 const firstTurtle=await page.evaluate('window.natureState.threats.find(t=>t.id==="pond-turtle").position');
 console.log("reloading lake");await page.call("Page.reload");await Bun.sleep(650);await enter();console.log("reloaded lake");await page.waitFor('document.body.dataset.rigAnimation==="Swim_Idle_Loop"');
 await page.key('KeyW',true);await page.waitFor('document.body.dataset.rigAnimation==="Swim_Fwd_Loop"');await page.shot('lake-swim-forward');
 await page.waitFor('Number(document.body.dataset.gamePlayerZ)>-68',18000);await page.key('KeyW',false);await page.waitFor('document.body.dataset.rigAnimation==="Idle"');await page.shot('lake-exit');
 check(JSON.stringify(firstTurtle)!==JSON.stringify(await page.evaluate('window.natureState.threats.find(t=>t.id==="pond-turtle").position')),'Turtle patrol actually moves');
 check(await page.evaluate('window.natureState.threats.filter(t=>["pond-turtle","meadow-rat","meadow-rat-2"].includes(t.id)).every(t=>!t.aggro&&t.health>0)'),'Wildlife remains neutral');
 console.log('swimming complete');await switchTo('town');await checkMinimap(page, "town");await page.shot('town-signs');
 const sign=await page.evaluate<{x:number;y:number}>(`(()=>{const o=window.natureScene.getObjectByName('sign-shop--14--10');const p=new window.THREE.Box3().setFromObject(o).getCenter(new window.THREE.Vector3());p.y+=.4;p.project(window.natureCamera);const r=document.getElementById('world-canvas').getBoundingClientRect();return{x:r.left+(p.x+1)*r.width/2,y:r.top+(1-p.y)*r.height/2};})()`);
 await page.call('Input.dispatchMouseEvent',{type:'mouseMoved',...sign,buttons:0});await page.waitFor('!document.getElementById("world-hover-tooltip").hidden&&document.getElementById("world-hover-tooltip").textContent.includes("BANK")');await page.shot('bank-sign-hover');
 await switchTo('ridge');await orbit(-314,-160);await Bun.sleep(350);await page.shot('eastern-volcano');
 check(await page.evaluate(`!!window.natureScene.getObjectByName('greywrought.landmark.eastern-volcano.crater-surface')`),'Volcano terrain is present');
 await switchTo('woods');await orbit(0,-110);await Bun.sleep(450);await page.shot('reclaimed-woods');
 check(await page.evaluate('window.natureRenderer.info.programs.every(p=>p.diagnostics?.runnable!==false)'), 'Water and sky shaders compile');
 check(page.errors.length===0,'No browser exceptions');console.log('PASS world nature journey',page.output);
}catch(error){try{await page?.shot('failure');}catch{}throw error;}
finally{companion?.close();await page?.key('KeyW',false).catch(()=>{});await page?.close();await service.close();server.stop(true);frontend.kill();await frontend.exited;}
