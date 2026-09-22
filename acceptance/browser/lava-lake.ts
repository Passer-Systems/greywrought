import { createSharedAdventure } from '../../src/game/adventure.js';
import { WORLD_DAY_MILLISECONDS } from '../../src/game/world-time.js';
import { terrainHeight } from '../../src/game/cave-layout.js';
import { createWorldService, type WorldSocketData } from '../../src/server/world-service.js';
import { openBrowser, check } from '../../acceptance/browser/session.js';
const url='http://127.0.0.1:4492/';
Object.assign(Bun.env,{GREYWROUGHT_GAME_URL:url,GREYWROUGHT_DEBUG_PORT:'9692',GREYWROUGHT_VULKAN:'1'});
const character={id:'lava-proof',name:'Ridge Walker',archetype:'warrior' as const,createdAtMillis:1},token='volcano-fixture-token-0000000000000000000';
const seed=createSharedAdventure();seed.join(character.id,character.name,character.archetype);
const saved=JSON.parse(seed.save());Object.assign(saved.characters[0].state,{phase:'expedition',position:{x:122,y:terrainHeight(122,64),z:64}});
for(const threat of saved.world.threats)if(threat.active)Object.assign(threat,{health:0,phase:'cleared',lootClaimed:true,respawnAt:Date.now()+3_600_000});
const savePath=`${process.cwd()}/build/browser/lava-world-${process.pid}.json`;
await Bun.write(savePath,JSON.stringify({version:1,accounts:[{character,tokenHash:new Bun.CryptoHasher('sha256').update(token).digest('hex')}],world:JSON.stringify(saved),chat:[],nextChatId:1}));
const service=await createWorldService({savePath,allowedOrigins:[url.slice(0,-1)]});
const server=Bun.serve<WorldSocketData>({hostname:'127.0.0.1',port:4493,fetch:(r,h)=>service.fetch(r,h),websocket:service.websocket});
const frontend=Bun.spawn([process.execPath,'scripts/dev-server.ts'],{env:{...Bun.env,GREYWROUGHT_PORT:'4492',GREYWROUGHT_LOCAL_WORLD:'0'},stdout:Bun.file('build/browser/lava-frontend.log'),stderr:Bun.file('build/browser/lava-frontend-errors.log')});
let page:Awaited<ReturnType<typeof openBrowser>>|undefined;
try{
 for(let i=0;i<100;i++){try{if((await fetch(url)).ok)break;}catch{}await Bun.sleep(100);}
 page=await openBrowser('lava-lake',{localOnly:true,beforeNavigate:async call=>{
  await call('Page.addScriptToEvaluateOnNewDocument',{source:`window.EventSource=class{};localStorage.setItem('greywrought/local-profile-v1',${JSON.stringify(JSON.stringify({version:1,displayName:'Volcano Test',characters:[character],selectedCharacterId:character.id,savedAtMillis:Date.now()}))});localStorage.setItem('greywrought/world-token',${JSON.stringify(token)});const Native=WebSocket;window.WebSocket=class extends Native{constructor(url,...args){super(String(url).includes('/world')?'ws://127.0.0.1:4493/world':url,...args);}set onmessage(callback){super.onmessage=e=>{const m=JSON.parse(e.data);if((m.type==='state'||m.type==='stateDelta'))window.lavaState=window.decodeWorldMessage(e,m).snapshot;if((m.type==='state'||m.type==='stateDelta'))m.serverWallTimeMillis=Math.floor(m.serverWallTimeMillis/${WORLD_DAY_MILLISECONDS})*${WORLD_DAY_MILLISECONDS}+${WORLD_DAY_MILLISECONDS/2};callback?.call(this,new MessageEvent('message',{data:JSON.stringify(m)}));};}};`});
 }});
 await page.waitFor('document.body.dataset.entryRoute==="roster"');
 await page.evaluate(`(async()=>{const{Scene}=await import('three');Scene.prototype.onAfterRender=function(renderer,scene,camera){if(renderer.domElement.id==='world-canvas'&&renderer.getRenderTarget()===null&&camera.isPerspectiveCamera){window.volcanoScene=scene;window.volcanoCamera=camera;window.volcanoRenderer=renderer;}};Scene.prototype.onBeforeRender=function(renderer,scene,camera){if(window.volcanoDetail&&renderer.domElement.id==='world-canvas'&&renderer.getRenderTarget()===null&&camera.isPerspectiveCamera){const root=scene.getObjectByName('greywrought.landmark.eastern-volcano');camera.position.set(root.position.x+22,root.position.y+39,root.position.z+62);camera.lookAt(root.position.x+3,root.position.y+3,root.position.z+24);camera.updateMatrixWorld();}};})()`);
 await page.click('#entry-enter-world');
 await page.waitFor('document.body.dataset.entryRoute==="world"&&document.body.dataset.environmentState==="ready"&&!!window.volcanoScene',30000);

 if(await page.evaluate('document.body.dataset.encounterMode==="paused"'))await page.click('#pause-resume');
 await page.waitFor('document.body.dataset.gamePaused==="false"');
 await page.shot('approach-normal-camera');
 const shaderErrors=await page.evaluate("window.volcanoRenderer.info.programs.filter(p=>p.diagnostics?.runnable===false).map(p=>p.diagnostics)");
 check(Array.isArray(shaderErrors)&&shaderErrors.length===0,'Lava shaders compile: '+JSON.stringify(shaderErrors));
 check(await page.evaluate("!!window.volcanoScene.getObjectByName('greywrought.landmark.eastern-volcano.lava-lake')"),'Irregular lava basin is rendered');
 const before=await page.evaluate<number>("window.volcanoScene.getObjectByName('greywrought.landmark.eastern-volcano.lava-lake').material.uniforms.time.value");
 await Bun.sleep(700);
 check(await page.evaluate('window.volcanoScene.getObjectByName("greywrought.landmark.eastern-volcano.lava-lake").material.uniforms.time.value>'+before+'+.5'),'Molten surface keeps flowing');
 check(await page.evaluate('window.lavaState.player.health===100'),'Scorched approach is safe');
 await page.evaluate('window.volcanoDetail=false');
 await page.key('KeyS',true);
 await page.waitFor('window.lavaState.player.health<100',8000);
 await page.key('KeyS',false);
 const entering=await page.evaluate<{health:number;position:{x:number;y:number;z:number}}>('window.lavaState.player');
 await page.shot('contact-damage-normal-camera');
 await Bun.sleep(1050);
 const standing=await page.evaluate<{health:number;position:{x:number;y:number;z:number}}>('window.lavaState.player');
 console.log('Lava contact',JSON.stringify({entering,standing}));
 check(standing.health<=entering.health-18,'Standing in lava receives substantial server damage');
 await page.key('KeyW',true);
 await page.waitFor('window.lavaState.player.position.z>63',7000);
 await page.key('KeyW',false);await Bun.sleep(250);
 const safe=await page.evaluate<number>('window.lavaState.player.health');await Bun.sleep(600);
 check(await page.evaluate('window.lavaState.player.health==='+safe),'Returning to shore stops damage');
 await page.shot('escaped-to-shore');
 await page.evaluate('window.volcanoDetail=true');await Bun.sleep(400);await page.shot('basin-overview');
 await Bun.write(page.output+'/contact.json',JSON.stringify({entering,standing,safe},null,2));
 check(page.errors.length===0,'No browser exceptions');console.log('PASS lava basin animation, normal-camera entry, authoritative contact damage and escape',page.output);
}catch(error){await page?.shot('failure');throw error;}finally{await page?.close();await service.close();server.stop(true);frontend.kill();await frontend.exited;}
