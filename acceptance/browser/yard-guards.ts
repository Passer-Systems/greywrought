import { createSharedAdventure } from '../../src/game/adventure.js';
import { YARD_GUARDS, guardPatrol } from '../../src/game/yard-guards.js';
import { createWorldService, type WorldSocketData } from '../../src/server/world-service.js';
import { openBrowser, check } from './session.js';

const baseTime=Array.from({length:2000},(_,index)=>1100000+index*100).find(time=>{const state=guardPatrol('guard-iona',time);return !state.moving&&state.position.x===-2&&state.position.z===-5;})!;
const realNow=Date.now;
let fixtureTime=baseTime;
Date.now=()=>fixtureTime;
const url='http://127.0.0.1:4191/';
Object.assign(Bun.env,{GREYWROUGHT_GAME_URL:url,GREYWROUGHT_DEBUG_PORT:'9491',GREYWROUGHT_VULKAN:'1'});
const characters=YARD_GUARDS.map(guard=>({id:`test-${guard.id}`,name:'Guard Visitor',archetype:'warrior' as const,createdAtMillis:1}));
const token='yard-guards-fixture-token-000000000000000000';
const seed=createSharedAdventure();for(const character of characters)seed.join(character.id,character.name,character.archetype);
const saved=JSON.parse(seed.save());
for(const [index,guard]of YARD_GUARDS.entries()){
  const position=guardPatrol(guard.id,baseTime).position;
  saved.characters[index].state.position={...position,z:position.z-1.7};
}
const savePath=`${process.cwd()}/build/browser/yard-guards-${process.pid}.json`;
await Bun.write(savePath,JSON.stringify({version:1,accounts:characters.map(character=>({character,tokenHash:new Bun.CryptoHasher('sha256').update(token).digest('hex')})),world:JSON.stringify(saved),chat:[],nextChatId:1}));
const service=await createWorldService({savePath,allowedOrigins:[url.slice(0,-1)]});
const server=Bun.serve<WorldSocketData>({hostname:'127.0.0.1',port:4192,fetch:(request,host)=>service.fetch(request,host),websocket:service.websocket});
const frontend=Bun.spawn([process.execPath,'scripts/dev-server.ts'],{cwd:Bun.env.GREYWROUGHT_GUARD_FRONTEND_ROOT??process.cwd(),env:{...Bun.env,GREYWROUGHT_PORT:'4191',GREYWROUGHT_LOCAL_WORLD:'0'},stdout:Bun.file(`${process.cwd()}/build/browser/yard-guards-frontend.log`),stderr:Bun.file(`${process.cwd()}/build/browser/yard-guards-frontend-errors.log`)});
let page:Awaited<ReturnType<typeof openBrowser>>|undefined,timer:ReturnType<typeof setInterval>|undefined;
try{
  for(let attempt=0;attempt<100;attempt++){try{if((await fetch(url)).ok)break;}catch{}await Bun.sleep(100);}
  page=await openBrowser('yard-guards',{beforeNavigate:async call=>{
    await call('Page.addScriptToEvaluateOnNewDocument',{source:`window.EventSource=class{};
      localStorage.setItem('greywrought/local-profile-v1',${JSON.stringify(JSON.stringify({version:1,displayName:'Guard Test',characters,selectedCharacterId:characters[0]!.id,savedAtMillis:baseTime}))});
      localStorage.setItem('greywrought/world-token',${JSON.stringify(token)});
      const Native=WebSocket;window.WebSocket=class extends Native{constructor(url,...args){super(String(url).includes('/world')?'ws://127.0.0.1:4192/world':url,...args);this.addEventListener('message',event=>{const message=JSON.parse(event.data);if(message.type==='state')window.guardState=message.snapshot;});}};`});
  }});
  await page.waitFor('document.body.dataset.entryRoute==="roster"');
  await page.evaluate(`(async()=>{const{Scene}=await import('three');Scene.prototype.onAfterRender=function(renderer,scene,camera){if(renderer.domElement.id!=='world-canvas')return;window.guardScene=scene;window.guardActors=['guard-iona','guard-bram'].map(id=>{const root=scene.getObjectByName(id);return root?{id,position:root.position.toArray(),rotation:root.rotation.y,animation:root.userData.animation,time:root.userData.animationTime,sword:!!root.getObjectByName('Warrior_Sword')}:null;});};})()`);
  for(const[index,guard]of YARD_GUARDS.entries()){
    if(index){
      clearInterval(timer);fixtureTime=baseTime;
      await page.click('#pause-open');await page.click('#pause-tab-settings');await page.click('#return-roster');
      await page.waitFor('document.body.dataset.entryRoute==="roster"');await page.click(`[data-character-id="${characters[index]!.id}"]`);
    }
    await page.click('#entry-enter-world');
    await page.waitFor('document.body.dataset.entryRoute==="world"&&document.body.dataset.rigState==="ready"&&window.guardActors?.every(actor=>actor?.animation)');
    await page.waitFor(`!document.querySelector('[data-overhead-name="npc:${guard.id}"]').hidden`);
    await page.click(`[data-overhead-name="npc:${guard.id}"]`);
    await page.waitFor(`window.guardState?.selectedGuard==='${guard.id}'`);
    await page.shot(`${guard.id}-selected`);
    const before=await page.evaluate<{id:string;position:number[];animation:string;time:number;sword:boolean}[]>('window.guardActors');
    check(before.every(actor=>actor.sword),'Both guards carry their authored sword');
    const started=performance.now();timer=setInterval(()=>{fixtureTime=baseTime+performance.now()-started;},50);
    await Bun.sleep(5500);
    const after=await page.evaluate<typeof before>('window.guardActors');
    for(const[actorIndex,actor]of after.entries()){
      const previous=before[actorIndex]!;
      check(Math.hypot(actor.position[0]!-previous.position[0]!,actor.position[2]!-previous.position[2]!)>1,'Both guards advance along their patrol');
      check(actor.animation==='Walk','Moving guards play their native Walk clip');
      check(actor.time!==previous.time,'Authored animation playback advances');
    }
    await page.shot(`${guard.id}-walking`);
  }
  check(page.errors.length===0,'Guard patrol and selection cause no browser exception');
  await Bun.write(`${page.output}/result.json`,JSON.stringify({status:'passed',checks:['two authored armed guards','both patrol positions change','native walk playback advances','each guard selectable and greets nearby visitor']},null,2));
  console.log(`Guard browser passed: ${page.output}`);
}finally{clearInterval(timer);await page?.close();frontend.kill();await frontend.exited;await service.close();server.stop(true);Date.now=realNow;}
