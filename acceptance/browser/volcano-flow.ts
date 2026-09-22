import { createSharedAdventure } from '../../src/game/adventure.js';
import { terrainHeight } from '../../src/game/cave-layout.js';
import { createWorldService, type WorldSocketData } from '../../src/server/world-service.js';
import { openBrowser, check } from '../../acceptance/browser/session.js';

const seattleNoon = Date.parse('2026-07-15T12:00:00-07:00');
const url='http://127.0.0.1:4482/';
Object.assign(Bun.env,{GREYWROUGHT_GAME_URL:url,GREYWROUGHT_DEBUG_PORT:'9682',GREYWROUGHT_VULKAN:'1'});
const character={id:'volcano-proof',name:'Ridge Walker',archetype:'warrior' as const,createdAtMillis:1},token='volcano-fixture-token-0000000000000000000';
const seed=createSharedAdventure();seed.join(character.id,character.name,character.archetype);
const saved=JSON.parse(seed.save());Object.assign(saved.characters[0].state,{phase:'expedition',position:{x:122,y:terrainHeight(122,60),z:60}});
for(const threat of saved.world.threats)if(threat.active)Object.assign(threat,{health:0,phase:'cleared',lootClaimed:true,respawnAt:Date.now()+3_600_000});
const savePath=`${process.cwd()}/build/browser/volcano-world-${process.pid}.json`;
await Bun.write(savePath,JSON.stringify({version:1,accounts:[{character,tokenHash:new Bun.CryptoHasher('sha256').update(token).digest('hex')}],world:JSON.stringify(saved),chat:[],nextChatId:1}));
const service=await createWorldService({savePath,allowedOrigins:[url.slice(0,-1)]});
const server=Bun.serve<WorldSocketData>({hostname:'127.0.0.1',port:4483,fetch:(r,h)=>service.fetch(r,h),websocket:service.websocket});
const frontend=Bun.spawn([process.execPath,'scripts/dev-server.ts'],{env:{...Bun.env,GREYWROUGHT_PORT:'4482',GREYWROUGHT_LOCAL_WORLD:'0'},stdout:Bun.file('build/browser/volcano-frontend.log'),stderr:Bun.file('build/browser/volcano-frontend-errors.log')});
let page:Awaited<ReturnType<typeof openBrowser>>|undefined;
try{
 for(let i=0;i<100;i++){try{if((await fetch(url)).ok)break;}catch{}await Bun.sleep(100);}
 page=await openBrowser('volcano-flow',{localOnly:true,beforeNavigate:async call=>{
  await call('Page.addScriptToEvaluateOnNewDocument',{source:`window.EventSource=class{};localStorage.setItem('greywrought/local-profile-v1',${JSON.stringify(JSON.stringify({version:1,displayName:'Volcano Test',characters:[character],selectedCharacterId:character.id,savedAtMillis:Date.now()}))});localStorage.setItem('greywrought/world-token',${JSON.stringify(token)});const Native=WebSocket;window.WebSocket=class extends Native{constructor(url,...args){super(String(url).includes('/world')?'ws://127.0.0.1:4483/world':url,...args);}set onmessage(callback){super.onmessage=e=>{const m=JSON.parse(e.data);if((m.type==='state'||m.type==='stateDelta'))m.serverWallTimeMillis=${seattleNoon};callback?.call(this,new MessageEvent('message',{data:JSON.stringify(m)}));};}};`});
 }});
 await page.waitFor('document.body.dataset.entryRoute==="roster"');
 await page.evaluate(`(async()=>{const{Scene}=await import('three');Scene.prototype.onAfterRender=function(renderer,scene,camera){if(renderer.domElement.id==='world-canvas'&&renderer.getRenderTarget()===null&&camera.isPerspectiveCamera){window.volcanoScene=scene;window.volcanoCamera=camera;window.volcanoRenderer=renderer;}};Scene.prototype.onBeforeRender=function(renderer,scene,camera){if(window.volcanoDetail&&renderer.domElement.id==='world-canvas'&&renderer.getRenderTarget()===null&&camera.isPerspectiveCamera){const root=scene.getObjectByName('greywrought.landmark.eastern-volcano');camera.position.set(root.position.x+12,root.position.y+37,root.position.z+43);camera.lookAt(root.position.x-1,root.position.y+10,root.position.z+5);camera.updateMatrixWorld();}};})()`);
 await page.click('#entry-enter-world');
 await page.waitFor('document.body.dataset.entryRoute==="world"&&document.body.dataset.environmentState==="ready"&&!!window.volcanoScene',30000);
 await page.call('Input.dispatchMouseEvent',{type:'mouseMoved',x:800,y:400,buttons:0});
 await page.call('Input.dispatchMouseEvent',{type:'mousePressed',x:800,y:400,button:'right',buttons:2,clickCount:1});
 await page.call('Input.dispatchMouseEvent',{type:'mouseMoved',x:172,y:275,button:'right',buttons:2});
 await page.call('Input.dispatchMouseEvent',{type:'mouseReleased',x:486,y:240,button:'right',buttons:0,clickCount:1});
 await page.call('Input.dispatchMouseEvent',{type:'mouseWheel',x:720,y:400,deltaX:0,deltaY:450});
 await Bun.sleep(400);await page.shot('ridge-view');
 await page.evaluate('window.volcanoDetail=true');await Bun.sleep(400);
 check(await page.evaluate('window.volcanoRenderer.info.programs.every(p=>p.diagnostics?.runnable!==false)'),'Volcano shaders compile in the game renderer');
 const before=await page.evaluate<number>("window.volcanoScene.getObjectByName('greywrought.landmark.eastern-volcano.lava').material.uniforms.time.value");
 check(await page.evaluate("!!window.volcanoScene.getObjectByName('greywrought.landmark.eastern-volcano.lava-river')"),'Winding lava river is present');
 await page.shot('active-crater');await Bun.sleep(1400);
 check(await page.evaluate(`window.volcanoScene.getObjectByName('greywrought.landmark.eastern-volcano.lava').material.uniforms.time.value>${before}+.5`),'Lava and particles receive advancing animation time');
 check(await page.evaluate("['ash','embers'].reduce((n,name)=>n+window.volcanoScene.getObjectByName('greywrought.landmark.eastern-volcano.'+name).geometry.attributes.position.count,0)<=64"),'Particle population remains bounded to 64');
 await page.shot('active-crater-later');
 const sampledTimes:number[]=[];
 for(let frame=0;frame<8;frame++) {
  sampledTimes.push(await page.evaluate<number>("window.volcanoScene.getObjectByName('greywrought.landmark.eastern-volcano.lava').material.uniforms.time.value"));
  await page.shot(`flow-${String(frame).padStart(2,'0')}`);
  await Bun.sleep(600);
 }
 await Bun.write(`${page.output}/timing.json`,JSON.stringify(sampledTimes));
 check(sampledTimes.at(-1)!-sampledTimes[0]!>4,'Capture at least four seconds of visible flow');
 check(page.errors.length===0,'No browser exceptions');console.log('PASS volcano shaders, advancing lava/smoke time, bounded particles; fixed-camera sequence captured',page.output);
}catch(error){await page?.shot('failure');throw error;}finally{await page?.close();await service.close();server.stop(true);frontend.kill();await frontend.exited;}
