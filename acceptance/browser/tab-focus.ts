import { createSharedAdventure } from '../../src/game/adventure.js';
import { createWorldService, type WorldSocketData } from '../../src/server/world-service.js';
import type { ServerWorldMessage } from '../../src/game/multiplayer-types.js';
import { openBrowser, check } from './session.js';

Bun.env.GREYWROUGHT_GAME_URL = 'http://127.0.0.1:4173/';
Bun.env.GREYWROUGHT_DEBUG_PORT = '9426';
Bun.env.GREYWROUGHT_VULKAN = '1';
const character = { id:'tab-focus', name:'Tab Tester', archetype:'mage' as const, createdAtMillis:1 };
const observer = { id:'tab-observer', name:'Bram', archetype:'warrior' as const, createdAtMillis:2 };
const token = 'tab-focus-token-0000000000000000000000', observerToken = 'tab-observer-token-0000000000000000000';
const seed = createSharedAdventure();
seed.join(character.id,character.name,character.archetype); seed.join(observer.id,observer.name,observer.archetype);
const saved = JSON.parse(seed.save());
Object.assign(saved.characters[0].state,{phase:'expedition',position:{x:-3,y:0,z:8}});
for(const enemy of saved.world.threats) if(enemy.id!=='scout'&&enemy.active) Object.assign(enemy,{health:0,phase:'cleared',lootClaimed:true,respawnAt:Date.now()+3_600_000});
const savePath=process.cwd()+'/build/browser/tab-focus-'+process.pid+'.json';
await Bun.write(savePath,JSON.stringify({version:1,accounts:[
  {character,tokenHash:new Bun.CryptoHasher('sha256').update(token).digest('hex')},
  {character:observer,tokenHash:new Bun.CryptoHasher('sha256').update(observerToken).digest('hex')},
],world:JSON.stringify(saved),chat:[],nextChatId:1}));
const service=await createWorldService({savePath,allowedOrigins:['http://127.0.0.1:4173']});
const server=Bun.serve<WorldSocketData>({hostname:'127.0.0.1',port:4197,fetch:(request,host)=>service.fetch(request,host),websocket:service.websocket});
type State=Extract<ServerWorldMessage,{type:'state'}>;
let observed:State|undefined;
const socket=new WebSocket('ws://127.0.0.1:4197/world');
socket.onmessage=event=>{const state=JSON.parse(String(event.data)) as ServerWorldMessage;if(state.type==='state')observed=state;};
await new Promise<void>(resolve=>{socket.onopen=()=>{socket.send(JSON.stringify({type:'join',token:observerToken,character:observer}));resolve();};});
const page=await openBrowser('tab-focus');
try {
  await page.call('Page.addScriptToEvaluateOnNewDocument',{source:`window.EventSource=class{};
    localStorage.setItem('greywrought/local-profile-v1',${JSON.stringify(JSON.stringify({version:1,displayName:'Tab Test',characters:[character],selectedCharacterId:character.id,savedAtMillis:Date.now()}))});
    localStorage.setItem('greywrought/world-token',${JSON.stringify(token)});
    window.sentCommands=[];const Native=WebSocket;window.WebSocket=class extends Native{
      constructor(url,...args){super(String(url).includes('/world')?'ws://127.0.0.1:4197/world':url,...args);window.gameSocket=this;this.addEventListener('message',event=>{const d=JSON.parse(event.data);if(d.type==='state')window.gameState=d;});}
      send(data){window.sentCommands.push(JSON.parse(data));super.send(data);}
    };`});
  await page.reload();
  await page.waitFor('document.body.dataset.entryRoute==="roster"');
  await page.call('Emulation.setFocusEmulationEnabled',{enabled:false});
  const created=await page.call('Target.createTarget',{url:'about:blank'});
  const targetId=(created.result as {targetId?:string})?.targetId;
  check(targetId,'Companion tab must open');
  await page.call('Target.activateTarget',{targetId});
  await page.waitFor('document.hidden&&!document.hasFocus()');
  await page.evaluate('document.getElementById("entry-enter-world").click()');
  await page.waitFor('document.body.dataset.entryRoute==="world"&&document.body.dataset.rigState==="ready"');
  check(await page.evaluate<boolean>('document.hidden&&window.gameState.session.mode==="shared"&&document.getElementById("pause-panel").hidden'),'Entering an unfocused tab must stay shared without opening pause');
  await page.waitFor('window.gameState.snapshot.threats.find(t=>t.id==="scout").cast!==null');
  const healthBefore=await page.evaluate<number>('window.gameState.snapshot.player.health');
  await Bun.sleep(6500);
  const activePlayer=observed?.players.find(p=>p.id===character.id);
  check(activePlayer,'A background tab must remain in the shared world beyond the disconnect deadline');
  check(activePlayer.player.health<healthBefore,'Combat must continue while the tab is hidden');
  await page.call('Page.bringToFront');
  await page.call('Emulation.setFocusEmulationEnabled',{enabled:true});
  await page.waitFor('!document.hidden&&document.body.dataset.gamePaused==="false"&&window.gameState.session.mode==="shared"');
  check(await page.evaluate<boolean>('!window.sentCommands.some(message=>message.command?.type==="pause")'),'Blur, visibility and unfocused entry must send no pause command');
  check(await page.evaluate<boolean>('document.getElementById("pause-panel").hidden'),'Returning to the tab must not show a pause menu');
  await page.shot('returned-with-combat-still-running');
  await page.press('Escape');
  await page.waitFor('window.gameState.session.mode==="paused"&&!document.getElementById("pause-panel").hidden');
  await page.call('Emulation.setFocusEmulationEnabled',{enabled:false});
  await page.call('Target.activateTarget',{targetId});
  await page.waitFor('document.hidden');
  await page.call('Page.bringToFront');
  await page.call('Emulation.setFocusEmulationEnabled',{enabled:true});
  await page.waitFor('!document.hidden');
  check(await page.evaluate<boolean>('window.gameState.session.mode==="paused"&&!document.getElementById("pause-panel").hidden'),'Refocusing must retain an explicitly paused encounter');
  await page.shot('explicit-pause-retained');
  check(page.errors.length===0,'No browser exceptions');
  console.log('PASS unfocused entry, real background tab beyond disconnect deadline, continued combat, no focus pause commands, explicit pause retained',page.output);
} catch(error) {
  console.error('Focus failure state', {
    observer: {mode:observed?.session.mode, time:observed?.serverTime, players:observed?.players.map(p=>p.id), readyState:socket.readyState},
    browser:await page.evaluate('({hidden:document.hidden,focus:document.hasFocus(),mode:window.gameState?.session.mode,health:window.gameState?.snapshot.player.health,readyState:window.gameSocket?.readyState,pauses:window.sentCommands?.filter(message=>message.command?.type==="pause").length})'),
  });
  await page.shot('failure');throw error;
}
finally {await page.close();socket.close();await service.close();server.stop(true);}
