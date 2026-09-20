import { createSharedAdventure } from '../../src/game/adventure.js';
import { createWorldService, type WorldSocketData } from '../../src/server/world-service.js';
import { check, openBrowser } from './session.js';

const url = 'http://127.0.0.1:4361/';
Object.assign(Bun.env, { GREYWROUGHT_GAME_URL: url, GREYWROUGHT_DEBUG_PORT: '9561', GREYWROUGHT_VULKAN: '1' });
const viewer = { id:'selection-viewer',name:'Target Explorer',archetype:'warrior' as const,createdAtMillis:1 };
const companion = { id:'selection-companion',name:'Mira',archetype:'mage' as const,createdAtMillis:2 };
const viewerToken='selection-viewer-token-0000000000000', companionToken='selection-companion-token-0000000000';
const seed=createSharedAdventure();seed.join(viewer.id,viewer.name,viewer.archetype);seed.join(companion.id,companion.name,companion.archetype);
const saved=JSON.parse(seed.save());
Object.assign(saved.characters[0].state,{phase:'town',position:{x:-1,y:0,z:-10}});
Object.assign(saved.characters[1].state,{phase:'town',position:{x:4,y:0,z:-10},health:70,potions:1});
const savePath=`${process.cwd()}/build/browser/player-selection-${process.pid}.json`;
await Bun.write(savePath,JSON.stringify({version:1,accounts:[{character:viewer,tokenHash:new Bun.CryptoHasher('sha256').update(viewerToken).digest('hex')},{character:companion,tokenHash:new Bun.CryptoHasher('sha256').update(companionToken).digest('hex')}],world:JSON.stringify(saved),chat:[],nextChatId:1}));
const service=await createWorldService({savePath,allowedOrigins:[url.slice(0,-1)]});
const server=Bun.serve<WorldSocketData>({hostname:'127.0.0.1',port:4362,fetch:(request,host)=>service.fetch(request,host),websocket:service.websocket});
const frontend=Bun.spawn([process.execPath,'scripts/dev-server.ts'],{env:{...Bun.env,GREYWROUGHT_PORT:'4361',GREYWROUGHT_LOCAL_WORLD:'0'},stdout:Bun.file('build/browser/player-selection-frontend.log'),stderr:Bun.file('build/browser/player-selection-frontend-errors.log')});
const bot=new WebSocket('ws://127.0.0.1:4362/world');
let botSequence=0;
await new Promise<void>((resolve,reject)=>{bot.onopen=()=>bot.send(JSON.stringify({type:'join',token:companionToken,character:companion}));bot.onmessage=e=>{if(JSON.parse(String(e.data)).type==='state')resolve();};bot.onerror=()=>reject(new Error('Companion failed to connect'));});
let page:Awaited<ReturnType<typeof openBrowser>>|undefined;
try {
  for(let i=0;i<100;i++){try{if((await fetch(url)).ok)break;}catch{}await Bun.sleep(100);}
  page=await openBrowser('player-selection',{beforeNavigate:async call=>{
    await call('Network.enable');await call('Network.setBlockedURLs',{urls:[url+'__dev/events']});
    await call('Page.addScriptToEvaluateOnNewDocument',{source:`localStorage.setItem('greywrought/local-profile-v1',${JSON.stringify(JSON.stringify({version:1,displayName:'Selection',characters:[viewer],selectedCharacterId:viewer.id,savedAtMillis:Date.now()}))});localStorage.setItem('greywrought/world-token',${JSON.stringify(viewerToken)});window.selectionCommands=[];const Native=WebSocket;window.WebSocket=class extends Native{constructor(url,...args){super(String(url).includes('/world')?'ws://127.0.0.1:4362/world':url,...args);this.addEventListener('message',e=>{const d=JSON.parse(e.data);if(d.type==='state')window.selectionState=d;});}send(data){const d=JSON.parse(data);if(d.command)window.selectionCommands.push(d.command);super.send(data);}};`});
  }});
  await page.waitFor('document.body.dataset.entryRoute==="roster"');await page.click('#entry-enter-world');
  await page.waitFor('document.body.dataset.rigState==="ready"&&document.body.dataset.environmentState==="ready"&&JSON.parse(document.body.dataset.gameRemotePlayers||"[]").some(p=>p.id==="selection-companion")');
  await page.waitFor('document.querySelector(\'[data-overhead-name="player:selection-companion"]\')?.hidden===false');
  await page.click('[data-overhead-name="player:selection-companion"]');
  await page.waitFor('document.getElementById("target-frame").dataset.kind==="player"&&document.getElementById("target-frame").dataset.targetId==="selection-companion"');
  check(await page.evaluate('document.getElementById("target-frame").dataset.health==="70"&&document.querySelector("#target-frame .unit-frame-name").textContent==="Mira"'),'Friendly name and current health appear');
  check(await page.evaluate('document.querySelector("#target-frame .unit-frame-image").src.endsWith("mage.webp")'),'Friendly frame uses class portrait');
  check(await page.evaluate('document.querySelector(\'.adventure-actions [data-action="strike"]\').disabled'),'Attack is disabled for friendly targets');
  const strikes=await page.evaluate<number>('window.selectionCommands.filter(c=>c.type==="action"&&c.action==="strike"&&c.pressed).length');
  await page.press('Digit1');
  check(await page.evaluate<number>('window.selectionCommands.filter(c=>c.type==="action"&&c.action==="strike"&&c.pressed).length')===strikes,'Attack key sends no strike against the prior enemy');
  bot.send(JSON.stringify({type:'command',sequence:++botSequence,command:{type:'action',action:'rest',pressed:true}}));
  bot.send(JSON.stringify({type:'command',sequence:++botSequence,command:{type:'action',action:'rest',pressed:false}}));
  await page.waitFor('document.getElementById("target-frame").dataset.health==="100"');
  await page.shot('friendly-name-health-and-portrait');
  await page.press('Tab');
  await page.waitFor('document.getElementById("target-frame").dataset.kind==="enemy"&&JSON.parse(document.body.dataset.selectedUnit).kind==="enemy"');
  await page.evaluate(`(async()=>{const {Scene,Vector3}=await import('three');Scene.prototype.onAfterRender=function(renderer,scene,camera){const root=this.children.find(o=>o.userData.playerId==='selection-companion');if(root){const p=root.position.clone().add(new Vector3(0,1.1,0)).project(camera),r=document.getElementById('world-canvas').getBoundingClientRect();window.companionPoint={x:r.left+(p.x+1)*r.width/2,y:r.top+(1-p.y)*r.height/2};}};})()`);
  await page.waitFor('window.companionPoint');
  const center=await page.evaluate<{x:number;y:number}>('window.companionPoint');
  let body:{x:number;y:number}|null=null;
  for(const dy of [0,-10,10,-20,20]){for(const dx of [0,-10,10]){
    const point={x:center.x+dx,y:center.y+dy};
    if(!await page.evaluate(`document.elementFromPoint(${point.x},${point.y})?.id==='world-canvas'`))continue;
    await page.call('Input.dispatchMouseEvent',{type:'mouseMoved',...point,buttons:0});await Bun.sleep(80);
    if(await page.evaluate('document.getElementById("world-canvas").dataset.hoverKind==="player"&&document.getElementById("world-canvas").dataset.hoverId==="selection-companion"')){body=point;break;}
  }if(body)break;}
  check(body,'Visible companion body is pickable');
  await page.call('Input.dispatchMouseEvent',{type:'mousePressed',...body,button:'left',buttons:1,clickCount:1});
  await page.call('Input.dispatchMouseEvent',{type:'mouseReleased',...body,button:'left',buttons:0,clickCount:1});
  await page.waitFor('document.getElementById("target-frame").dataset.kind==="player"&&document.getElementById("world-canvas").dataset.selectedPlayer==="selection-companion"');
  await page.shot('friendly-body-selection');
  await page.click('[data-overhead-name="player:selection-viewer"]');
  await page.waitFor('document.getElementById("target-frame").dataset.targetId==="selection-viewer"');
  await page.click('[data-overhead-name="player:selection-companion"]');
  bot.close();
  await page.waitFor('JSON.parse(document.body.dataset.selectedUnit)===null&&document.querySelector(".unit-frame-target-group").hidden');
  check(page.errors.length===0,'No browser exceptions');
  console.log('PASS player name/body clicks, friendly portrait, live health, blocked attack, Tab enemy selection, self selection and disconnect clearing',page.output);
} catch(error){await page?.shot('failure');console.error(await page?.evaluate('({state:window.selectionState,selected:document.body.dataset.selectedUnit,frame:document.getElementById("target-frame")?.outerHTML,point:window.companionPoint})'));throw error;}
finally{bot.close();await page?.close();await service.close();server.stop(true);frontend.kill();await frontend.exited;}
