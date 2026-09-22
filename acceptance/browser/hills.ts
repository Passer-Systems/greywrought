import { createSharedAdventure } from '../../src/game/adventure.js';
import { terrainHeight } from '../../src/game/cave-layout.js';
import { createWorldService, type WorldSocketData } from '../../src/server/world-service.js';
import { check, openBrowser } from './session.js';

const url = 'http://127.0.0.1:4325/';
Bun.env.GREYWROUGHT_GAME_URL = url;
Bun.env.GREYWROUGHT_DEBUG_PORT = '9525';
Bun.env.GREYWROUGHT_VULKAN = '1';
const character = {id:'hills-fixture',name:'Hill Walker',archetype:'hunter' as const,createdAtMillis:Date.now()};
const token = 'hills-fixture-token-000000000000000';
const seed = createSharedAdventure(); seed.join(character.id,character.name,character.archetype);
const saved = JSON.parse(seed.save());
Object.assign(saved.characters[0].state,{phase:'expedition',position:{x:-27,y:terrainHeight(-27,-79),z:-79}});
const savePath = `${process.cwd()}/build/browser/hills-${process.pid}.json`;
await Bun.write(savePath,JSON.stringify({version:1,accounts:[{character,tokenHash:new Bun.CryptoHasher('sha256').update(token).digest('hex')}],world:JSON.stringify(saved),chat:[],nextChatId:1}));
const service = await createWorldService({savePath,allowedOrigins:[url.slice(0,-1)]});
const server = Bun.serve<WorldSocketData>({hostname:'127.0.0.1',port:4326,fetch:(request,host)=>service.fetch(request,host),websocket:service.websocket});
const frontend = Bun.spawn(['bun','scripts/dev-server.ts'],{env:{...Bun.env,GREYWROUGHT_PORT:'4325'},stdout:Bun.file('build/browser/hills-frontend.log'),stderr:Bun.file('build/browser/hills-frontend-errors.log')});
let page: Awaited<ReturnType<typeof openBrowser>> | undefined;
try {
  for(let i=0;i<100;i++){try{if((await fetch(url)).ok)break;}catch{}await Bun.sleep(100);}
  page=await openBrowser('hills',{beforeNavigate:async call=>{
    await call('Network.enable'); await call('Network.setBlockedURLs',{urls:[url+'__dev/events']});
    await call('Page.addScriptToEvaluateOnNewDocument',{source:`localStorage.setItem('greywrought/local-profile-v1',${JSON.stringify(JSON.stringify({version:1,displayName:'Hill Walker',characters:[character],selectedCharacterId:character.id,savedAtMillis:Date.now()}))});localStorage.setItem('greywrought/world-token',${JSON.stringify(token)});const Native=WebSocket;window.WebSocket=class extends Native{constructor(url,...args){super(String(url).includes('/world')?'ws://127.0.0.1:4326/world':url,...args);this.addEventListener('message',e=>{const d=window.decodeWorldMessage(e);if(d.type==='state')window.hillState=d.snapshot;});}};`});
  }});
  await page.waitFor('document.body.dataset.entryRoute==="roster"'); await page.click('#entry-enter-world');
  await page.waitFor('document.body.dataset.rigState==="ready"&&document.body.dataset.environmentState==="ready"');
  await page.evaluate(`(async()=>{const {Scene}=await import('three');Scene.prototype.onAfterRender=function(){this.traverse(o=>{if(o.userData.localPlayer)window.hillRendered=o.position.toArray();});};})()`);
  await page.waitFor('window.hillRendered');
  check(await page.evaluate('window.hillState.player.position.y>4&&Math.abs(window.hillRendered[1]-window.hillState.player.position.y)<.1'),'Player stands on the meadow hill');
  await page.shot('meadow-hills-and-mountains');
  await page.key('KeyW',true); await Bun.sleep(2200); await page.key('KeyW',false); await Bun.sleep(250);
  const p=await page.evaluate<{x:number;y:number;z:number}>('window.hillState.player.position');
  check(p.z>-68&&p.y<4,'Walking descends the hill');
  check(Math.abs(p.y-terrainHeight(p.x,p.z))<.001,'Server follows the hill surface');
  check(await page.evaluate('Math.abs(window.hillRendered[1]-window.hillState.player.position.y)<.1'),'Rendered player stays on the same hillside');
  await page.shot('hillside-walk');
  check(page.errors.length===0,'No browser exceptions');
  console.log('PASS meadow hill, mountain scenery, walking descent and server/render agreement',page.output);
} catch(error){await page?.shot('failure');throw error;}
finally {await page?.close();await service.close();server.stop(true);frontend.kill();await frontend.exited;}
