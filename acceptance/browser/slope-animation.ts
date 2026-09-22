import { createSharedAdventure } from '../../src/game/adventure.js';
import { createWorldService, type WorldSocketData } from '../../src/server/world-service.js';
import { terrainHeight } from '../../src/game/cave-layout.js';
import { openBrowser, check } from './session.js';
const label=Bun.env.SLOPE_PHASE??'after',url='http://127.0.0.1:4421/';
const terrainBuild=await Bun.build({entrypoints:['src/game/cave-layout.ts'],target:'browser',format:'esm'});
check(terrainBuild.success,'Terrain measurement module builds');
const terrainSource=await terrainBuild.outputs[0]!.text();
Object.assign(Bun.env,{GREYWROUGHT_GAME_URL:url,GREYWROUGHT_DEBUG_PORT:'9621',GREYWROUGHT_VULKAN:'1'});
const character={id:'slope-runner',name:'Climber',archetype:'warrior' as const,createdAtMillis:1},token='slope-local-test-token-00000000000000000';
const seed=createSharedAdventure();seed.join(character.id,character.name,character.archetype);
const saved=JSON.parse(seed.save());Object.assign(saved.characters[0].state,{phase:'expedition',position:{x:-62,y:terrainHeight(-62,-11),z:-11}});
const savePath=`${process.cwd()}/build/browser/slope-animation-world-${label}-${process.pid}.json`;
await Bun.write(savePath,JSON.stringify({version:1,accounts:[{character,tokenHash:new Bun.CryptoHasher('sha256').update(token).digest('hex')}],world:JSON.stringify(saved),chat:[],nextChatId:1}));
const service=await createWorldService({savePath,allowedOrigins:[url.slice(0,-1)]});
const server=Bun.serve<WorldSocketData>({hostname:'127.0.0.1',port:4422,fetch:(request,host)=>service.fetch(request,host),websocket:service.websocket});
const frontend=Bun.spawn([process.execPath,'scripts/dev-server.ts'],{env:{...Bun.env,GREYWROUGHT_PORT:'4421',GREYWROUGHT_LOCAL_WORLD:'0'},stdout:Bun.file(`build/browser/slope-animation-${label}-frontend.log`),stderr:Bun.file(`build/browser/slope-animation-${label}-frontend-errors.log`)});
let page:Awaited<ReturnType<typeof openBrowser>>|undefined;
try{
 for(let i=0;i<100;i++){try{if((await fetch(url)).ok)break;}catch{}await Bun.sleep(100);}
 page=await openBrowser(`slope-animation-${label}`,{beforeNavigate:async call=>{
  await call('Network.enable');await call('Network.setBlockedURLs',{urls:[url+'__dev/events']});
  await call('Page.addScriptToEvaluateOnNewDocument',{source:`localStorage.setItem('greywrought/local-profile-v1',${JSON.stringify(JSON.stringify({version:1,displayName:'Slope Test',characters:[character],selectedCharacterId:character.id,savedAtMillis:Date.now()}))});localStorage.setItem('greywrought/world-token',${JSON.stringify(token)});window.slopeDelay=false;const Native=WebSocket;window.WebSocket=class extends Native{
    incoming=0;outgoing=0;countIn=0;countOut=0;
    constructor(url,...args){super(String(url).includes('/world')?'ws://127.0.0.1:4422/world':url,...args);this.addEventListener('message',event=>{const m=window.decodeWorldMessage(event);if(m.type==='state')window.slopeState=m;});}
    set onmessage(callback){super.onmessage=event=>{const now=performance.now(),due=window.slopeDelay?Math.max(this.incoming+1,now+120+[0,60,20,90][this.countIn++%4]):now;this.incoming=due;setTimeout(()=>callback?.call(this,event),due-now);};}
    send(message){const now=performance.now(),due=window.slopeDelay?Math.max(this.outgoing+1,now+100+[0,30,10,50][this.countOut++%4]):now;this.outgoing=due;setTimeout(()=>{if(this.readyState===Native.OPEN)super.send(message);},due-now);}
  };`});
 }});
 await page.waitFor('document.body.dataset.entryRoute === "roster"');
 await page.evaluate(`(async()=>{window.slopeTerrain=(await import(URL.createObjectURL(new Blob([${JSON.stringify(terrainSource)}],{type:'text/javascript'})))).terrainHeight;})()`);
 await page.evaluate(`(async()=>{const{Scene,Vector3,AnimationAction}=await import('three');window.slopeFrames=[];window.slopeResets=[];window.slopeSegment='idle';
   const reset=AnimationAction.prototype.reset;AnimationAction.prototype.reset=function(){let root=this.getRoot();while(root&&!root.userData.localPlayer)root=root.parent;if(root)window.slopeResets.push({time:performance.now(),clip:this.getClip().name,segment:window.slopeSegment});return reset.call(this);};
   Scene.prototype.onAfterRender=function(renderer,scene,camera){const player=scene.children.find(object=>object.userData.localPlayer);if(!player)return;const screen=new Vector3().copy(player.position).project(camera),received=window.slopeState?.snapshot.player.position;window.slopeFrames.push({time:performance.now(),segment:window.slopeSegment,player:{...player.position},camera:{...camera.position},screen:{...screen},grounded:window.slopeState?.snapshot.player.grounded,moving:window.slopeState?.snapshot.player.moving,receivedFloorError:received?received.y-window.slopeTerrain(received.x,received.z):0,clip:document.body.dataset.rigAnimation,clipTime:Number(document.body.dataset.rigAnimationTime)});};})()`);
 await page.click('#entry-enter-world');await page.waitFor('document.body.dataset.rigState === "ready" && document.body.dataset.environmentState === "ready"');
 await page.call('Input.dispatchMouseEvent',{type:'mouseMoved',x:800,y:260});
 await page.call('Input.dispatchMouseEvent',{type:'mousePressed',x:800,y:260,button:'right',buttons:2,clickCount:1});
 await page.call('Input.dispatchMouseEvent',{type:'mouseMoved',x:486,y:260,button:'right',buttons:2});
 await page.call('Input.dispatchMouseEvent',{type:'mouseReleased',x:486,y:260,button:'right',buttons:0,clickCount:1});
 await Bun.sleep(500);await page.evaluate('window.slopeFrames=[];window.slopeResets=[]');
 console.log('Slope browser loaded; recording',label);
 const reports=[];
 for(const delayed of [false,true]){
   await page.evaluate(`window.slopeDelay=${delayed}`);await Bun.sleep(500);
   for(const [direction,key,duration]of [['downhill','KeyW',2600],['uphill','KeyS',4063]] as const){
     const segment=`${direction}-${delayed?'delayed':'normal'}`;
     await page.evaluate(`window.slopeSegment=${JSON.stringify(segment)}`);
     await page.key(key,true);await Bun.sleep(duration);await page.key(key,false);
     await page.evaluate('window.slopeSegment="idle"');await page.shot(segment);await Bun.sleep(500);
     const frames=await page.evaluate<MotionFrame[]>(`window.slopeFrames.filter(f=>f.segment===${JSON.stringify(segment)})`);
     const resets=await page.evaluate<Reset[]>(`window.slopeResets.filter(f=>f.segment===${JSON.stringify(segment)})`);
     const steady=frames.filter(f=>f.time>frames[0]!.time+200);
     const speeds=steady.slice(1).map((f,i)=>Math.hypot(f.player.x-steady[i]!.player.x,f.player.z-steady[i]!.player.z)/((f.time-steady[i]!.time)/1000));
     const report={segment,frames:steady.length,clips:[...new Set(steady.map(f=>f.clip))],resets:resets.length,runRestarts:resets.filter(r=>r.clip==='Run').length-1,
       heightChange:steady.at(-1)!.player.y-steady[0]!.player.y,minimumSpeed:Math.min(...speeds),stalledFrames:speeds.filter(s=>s<.5).length,
       maxFloorError:Math.max(...steady.map(f=>Math.abs(f.player.y-terrainHeight(f.player.x,f.player.z)))),receivedBelowFloorFrames:steady.filter(f=>f.receivedFloorError<0).length,
       minimumReceivedFloorError:Math.min(...steady.map(f=>f.receivedFloorError))};
     reports.push(report);
   }
 }
 const frames=await page.evaluate<MotionFrame[]>('window.slopeFrames'),resets=await page.evaluate<Reset[]>('window.slopeResets');
 await Bun.write(`${page.output}/measurements.json`,JSON.stringify({reports,resets,frames},null,2));console.log(JSON.stringify(reports,null,2));console.log(page.output);
 check(page.errors.length===0,'No browser errors');
 for(const report of reports){
   check(report.frames>30&&Math.abs(report.heightChange)>1,'Each run crosses actual sloped terrain');
   if(label!=='before'){
     check(report.clips.length===1&&report.clips[0]==='Run','Grounded hill running never switches to idle or jump');
     check(report.runRestarts===0,'Run animation starts once and keeps its phase through the slope');
     check(report.stalledFrames===0,'Movement does not stall on the slope');
     check(report.maxFloorError<.000001,'Running stays grounded on the slope');
   }
 }
 await page.waitFor('document.body.dataset.rigAnimation==="Idle"');
 await page.press('Space');await page.waitFor('document.body.dataset.rigAnimation==="Roll"');
 await page.waitFor('document.body.dataset.rigAnimation==="Idle"');
 console.log('PASS slope measurements, intentional stop, and jump return');
}finally{await page?.close();await service.close();server.stop(true);frontend.kill();await frontend.exited;}

interface MotionFrame { time:number; segment:string; player:{x:number;y:number;z:number}; camera:{x:number;y:number;z:number}; clip:string; clipTime:number; grounded:boolean; moving:boolean; receivedFloorError:number; }
interface Reset { time:number; clip:string; segment:string; }
