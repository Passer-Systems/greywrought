import { createSharedAdventure } from '../../src/game/adventure.js';
import { createWorldService, type WorldSocketData } from '../../src/server/world-service.js';
import { openBrowser, check } from './session.js';

const url='http://127.0.0.1:4397/';
Bun.env.GREYWROUGHT_GAME_URL=url;Bun.env.GREYWROUGHT_DEBUG_PORT='9597';Bun.env.GREYWROUGHT_VULKAN='1';
const character={id:'gather-fixture',name:'Crystal Gatherer',archetype:'warrior' as const,createdAtMillis:Date.now()};
const token='gather-fixture-token-0000000000000000';
const seed=createSharedAdventure();seed.join(character.id,character.name,character.archetype);
const saved=JSON.parse(seed.save());Object.assign(saved.characters[0].state,{phase:'expedition',position:{x:7.2,y:0,z:36.1}});
for(const enemy of saved.world.threats)if(['scout','nest','patrol'].includes(enemy.id))Object.assign(enemy,{health:0,phase:'cleared',lootClaimed:true});
const savePath=`${process.cwd()}/build/browser/gathering-${process.pid}.json`;
await Bun.write(savePath,JSON.stringify({version:1,accounts:[{character,tokenHash:new Bun.CryptoHasher('sha256').update(token).digest('hex')}],world:JSON.stringify(saved),chat:[],nextChatId:1}));
const service=await createWorldService({savePath,allowedOrigins:[url.slice(0,-1)]});
const server=Bun.serve<WorldSocketData>({hostname:'127.0.0.1',port:4398,fetch:(r,h)=>service.fetch(r,h),websocket:service.websocket});
const dev=Bun.spawn(['bun','scripts/dev-server.ts'],{env:{...Bun.env,GREYWROUGHT_PORT:'4397'},stdout:Bun.file('build/browser/gathering-dev.log'),stderr:Bun.file('build/browser/gathering-dev-errors.log')});
for(let n=0;n<100;n++){try{if((await fetch(url)).ok)break;}catch{}await Bun.sleep(100);}
const page=await openBrowser('gathering');
try {
  await page.call('Page.addScriptToEvaluateOnNewDocument',{source:`localStorage.setItem('greywrought/local-profile-v1',${JSON.stringify(JSON.stringify({version:1,displayName:'Gather Test',characters:[character],selectedCharacterId:character.id,savedAtMillis:Date.now()}))});localStorage.setItem('greywrought/world-token',${JSON.stringify(token)});const Native=WebSocket;window.WebSocket=class extends Native{constructor(url,...args){super(String(url).includes('/world')?'ws://127.0.0.1:4398/world':url,...args);this.addEventListener('message',e=>{const d=window.decodeWorldMessage(e);if(d.type==='state')window.gatherState=d.snapshot;});}};`});
  await page.reload();await page.waitFor('document.body.dataset.entryRoute==="roster"');await page.click('#entry-enter-world');
  await page.waitFor('document.body.dataset.entryRoute==="world" && document.body.dataset.rigState==="ready" && document.body.dataset.environmentState==="ready"');
  await page.press('KeyG');await page.waitFor('!document.getElementById("player-action-bar").hidden');
  check(await page.evaluate('window.gatherState.cargo===0 && window.gatherState.resourceRemaining===12'),'Cast start grants nothing');
  await page.shot('gathering-before-reward');
  await page.press('Escape');await page.waitFor('window.gatherState.player.currentAction===null');
  await Bun.sleep(2100);
  check(await page.evaluate('window.gatherState.cargo===0 && window.gatherState.resourceRemaining===12 && document.getElementById("pause-panel").hidden'),'Escape cancels gathering without loot or opening menu');
  await page.press('KeyG');await page.waitFor('window.gatherState.player.currentAction==="gather"');
  await page.key('KeyA',true);await Bun.sleep(100);await page.key('KeyA',false);
  await page.waitFor('window.gatherState.player.currentAction===null');await Bun.sleep(2100);
  check(await page.evaluate('window.gatherState.cargo===0 && window.gatherState.resourceRemaining===12'),'Movement cancels gathering without loot');
  await page.press('KeyG');await page.waitFor('window.gatherState.player.currentAction==="gather"');
  check(await page.evaluate('window.gatherState.cargo===0'),'Retry has not granted loot');
  await page.waitFor('window.gatherState.cargo===3 && window.gatherState.resourceRemaining===9 && window.gatherState.player.currentAction===null');
  await page.shot('gathering-complete');check(page.errors.length===0,'No browser exceptions');
  await Bun.write(`${page.output}/result.json`,JSON.stringify({status:'passed',checks:['cast start: no loot','Esc cancellation: no loot or depletion','movement cancellation: no loot or depletion','completion: exactly three crystals, stock minus three']}));
  console.log('PASS gathering cast, Escape cancellation, movement cancellation and completion',page.output);
} catch(error){await page.shot('failure');throw error;}
finally{await page.close();await service.close();server.stop(true);dev.kill();await dev.exited;}
