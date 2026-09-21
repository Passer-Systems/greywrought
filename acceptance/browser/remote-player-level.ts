import { createSharedAdventure } from '../../src/game/adventure.js';
import { terrainHeight } from '../../src/game/cave-layout.js';
import { createWorldService, type WorldSocketData } from '../../src/server/world-service.js';
import { check, openBrowser } from './session.js';

const url = 'http://127.0.0.1:4371/';
Object.assign(Bun.env, { GREYWROUGHT_GAME_URL: url, GREYWROUGHT_DEBUG_PORT: '9571', GREYWROUGHT_VULKAN: '1' });
const viewer = { id:'selection-viewer',name:'Target Explorer',archetype:'warrior' as const,createdAtMillis:1 };
const companion = { id:'selection-companion',name:'Mira',archetype:'mage' as const,createdAtMillis:2 };
const viewerToken='selection-viewer-token-0000000000000', companionToken='selection-companion-token-0000000000';
const seed=createSharedAdventure();seed.join(viewer.id,viewer.name,viewer.archetype);seed.join(companion.id,companion.name,companion.archetype);
const saved=JSON.parse(seed.save());
Object.assign(saved.characters[0].state,{phase:'town',position:{x:-1,y:terrainHeight(-1,-10),z:-10}});
Object.assign(saved.characters[1].state,{phase:'town',position:{x:4,y:terrainHeight(4,-10),z:-10},health:70,potions:1});
saved.characters[0].state.chapter.experience=100;
saved.characters[1].state.chapter.experience=1000;
const savePath=`${process.cwd()}/build/browser/remote-player-level-${process.pid}.json`;
await Bun.write(savePath,JSON.stringify({version:1,accounts:[{character:viewer,tokenHash:new Bun.CryptoHasher('sha256').update(viewerToken).digest('hex')},{character:companion,tokenHash:new Bun.CryptoHasher('sha256').update(companionToken).digest('hex')}],world:JSON.stringify(saved),chat:[],nextChatId:1}));
const service=await createWorldService({savePath,allowedOrigins:[url.slice(0,-1)]});
const server=Bun.serve<WorldSocketData>({hostname:'127.0.0.1',port:4372,fetch:(request,host)=>service.fetch(request,host),websocket:service.websocket});
const frontend=Bun.spawn([process.execPath,'scripts/dev-server.ts'],{env:{...Bun.env,GREYWROUGHT_PORT:'4371',GREYWROUGHT_LOCAL_WORLD:'0'},stdout:Bun.file('build/browser/remote-player-level-frontend.log'),stderr:Bun.file('build/browser/remote-player-level-frontend-errors.log')});
const bot=new WebSocket('ws://127.0.0.1:4372/world');
await new Promise<void>((resolve,reject)=>{bot.onopen=()=>bot.send(JSON.stringify({type:'join',token:companionToken,character:companion}));bot.onmessage=e=>{if(JSON.parse(String(e.data)).type==='state')resolve();};bot.onerror=()=>reject(new Error('Companion failed to connect'));});
let page:Awaited<ReturnType<typeof openBrowser>>|undefined;
try {
  for(let i=0;i<100;i++){try{if((await fetch(url)).ok)break;}catch{}await Bun.sleep(100);}
  page=await openBrowser('remote-player-level',{beforeNavigate:async call=>{
    await call('Network.enable');await call('Network.setBlockedURLs',{urls:[url+'__dev/events']});
    await call('Page.addScriptToEvaluateOnNewDocument',{source:`localStorage.setItem('greywrought/local-profile-v1',${JSON.stringify(JSON.stringify({version:1,displayName:'Selection',characters:[viewer],selectedCharacterId:viewer.id,savedAtMillis:Date.now()}))});localStorage.setItem('greywrought/world-token',${JSON.stringify(viewerToken)});window.selectionCommands=[];const Native=WebSocket;window.WebSocket=class extends Native{constructor(url,...args){super(String(url).includes('/world')?'ws://127.0.0.1:4372/world':url,...args);this.addEventListener('message',e=>{const d=JSON.parse(e.data);if(d.type==='state')window.selectionState=d;});}send(data){const d=JSON.parse(data);if(d.command)window.selectionCommands.push(d.command);super.send(data);}};`});
  }});
  await page.waitFor('document.body.dataset.entryRoute==="roster"');await page.click('#entry-enter-world');
  await page.waitFor('document.body.dataset.rigState==="ready"&&document.body.dataset.environmentState==="ready"&&JSON.parse(document.body.dataset.gameRemotePlayers||"[]").some(p=>p.id==="selection-companion")');
  check(await page.evaluate('JSON.parse(document.body.dataset.selectedUnit)===null'),'Entering town starts without an arbitrary enemy target');
  check(await page.evaluate('!document.querySelector(\'[data-overhead-name="player:selection-viewer"]\') && !document.getElementById("show-own-name").checked'),'Own overhead name defaults hidden');
  await page.waitFor('document.querySelector(\'[data-overhead-name="player:selection-companion"]\')?.hidden===false');
  await page.click('[data-overhead-name="player:selection-companion"]');
  await page.waitFor('document.getElementById("target-frame").dataset.kind==="player"&&document.getElementById("target-frame").dataset.targetId==="selection-companion"');
  check(await page.evaluate('document.getElementById("target-frame").dataset.health==="70"&&document.querySelector("#target-frame .unit-frame-name").textContent==="Mira"'),'Friendly name and current health appear');
  check(await page.evaluate('document.querySelector("#target-frame .unit-frame-image").src.endsWith("mage.webp")'),'Friendly frame uses class portrait');
  check(await page.evaluate('window.selectionState.snapshot.player.level===2 && window.selectionState.players.find(p=>p.id==="selection-companion").player.level===5'),'Server sends distinct actual character levels');
  check(await page.evaluate('document.querySelector("#target-frame .unit-frame-level").textContent==="5" && !document.querySelector("#target-frame .unit-frame-level").hidden'),'Selected remote player shows their own level medallion');
  await page.shot('remote-level-five');
  check(page.errors.length===0,'No browser exceptions');
  console.log('PASS remote player level from authoritative progression through nameplate selection',page.output);
} finally {bot.close();await page?.close();await service.close();server.stop(true);frontend.kill();await frontend.exited;}
