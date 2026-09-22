import { createSharedAdventure } from '../../src/game/adventure.js';
import { terrainHeight } from '../../src/game/cave-layout.js';
import { createWorldService, type WorldSocketData } from '../../src/server/world-service.js';
import { openBrowser, check } from './session.js';

const url='http://127.0.0.1:4297/';
Bun.env.GREYWROUGHT_GAME_URL=url;Bun.env.GREYWROUGHT_DEBUG_PORT='9497';Bun.env.GREYWROUGHT_VULKAN='1';
const character={id:'hollowdeep-fixture',name:'Cave Explorer',archetype:'warrior' as const,createdAtMillis:Date.now()};
const token='hollowdeep-fixture-token-0000000000000000';
const seed=createSharedAdventure();seed.join(character.id,character.name,character.archetype);
const saved=JSON.parse(seed.save());Object.assign(saved.characters[0].state,{phase:'expedition',position:{x:26,y:0,z:-46},potions:3});
// Wounded creatures keep the visual journey short; cave.test.ts exercises full-health attacks.
for(const enemy of saved.world.threats) if(enemy.id.startsWith('cave-')) enemy.health=18;
const savePath=`${process.cwd()}/build/browser/hollowdeep-${process.pid}.json`;
await Bun.write(savePath,JSON.stringify({version:1,accounts:[{character,tokenHash:new Bun.CryptoHasher('sha256').update(token).digest('hex')}],world:JSON.stringify(saved),chat:[],nextChatId:1}));
const service=await createWorldService({savePath,allowedOrigins:[url.slice(0,-1)]});
const server=Bun.serve<WorldSocketData>({hostname:'127.0.0.1',port:4298,fetch:(r,h)=>service.fetch(r,h),websocket:service.websocket});
const dev=Bun.spawn(['bun','scripts/dev-server.ts'],{env:{...Bun.env,GREYWROUGHT_PORT:'4297'},stdout:Bun.file('build/browser/hollowdeep-dev.log'),stderr:Bun.file('build/browser/hollowdeep-dev-errors.log')});
for(let n=0;n<100;n++){try{if((await fetch(url)).ok)break;}catch{}await Bun.sleep(100);}
const page=await openBrowser('hollowdeep');
async function east(x:number){await page.key('KeyA',true);try{await page.waitFor(`window.caveState.player.position.x>=${x}`,20000);}finally{await page.key('KeyA',false);}}
async function cycle(){const cycle=await page.evaluate<number>('window.caveState.combat.cycle');await page.press('KeyR');await page.waitFor(`window.caveState.combat.phase!=='active' && (window.caveState.combat.cycle>${cycle} || !window.caveState.player.inCombat)`,10000);}
async function checkFloor(label: string) {
  const position = await page.evaluate<{x:number;y:number;z:number}>('window.caveState.player.position');
  check(Math.abs(position.y-terrainHeight(position.x,position.z))<.08, `${label}: feet must follow the cave floor`);
  return position;
}
try {
  await page.call('Page.addScriptToEvaluateOnNewDocument',{source:`localStorage.setItem('greywrought/local-profile-v1',${JSON.stringify(JSON.stringify({version:1,displayName:'Cave Test',characters:[character],selectedCharacterId:character.id,savedAtMillis:Date.now()}))});localStorage.setItem('greywrought/world-token',${JSON.stringify(token)});const Native=WebSocket;window.WebSocket=class extends Native{constructor(url,...args){super(String(url).includes('/world')?'ws://127.0.0.1:4298/world':url,...args);this.addEventListener('message',e=>{const d=window.decodeWorldMessage(e);if(d.type==='state')window.caveState=d.snapshot;});}};`});
  await page.reload();await page.waitFor('document.body.dataset.entryRoute==="roster"');await page.click('#entry-enter-world');
  await page.waitFor('document.body.dataset.rigState==="ready" && document.body.dataset.creatureRigState==="ready" && document.body.dataset.environmentState==="ready"');
  await page.evaluate(`(async()=>{const {SkinnedMesh}=await import('three');window.cavePoses={};SkinnedMesh.prototype.onBeforeRender=function(){for(let root=this;root;root=root.parent)if(root.userData.threatId?.startsWith('cave-')){const id=root.userData.threatId;const poses=window.cavePoses[id]??=[];const pose=Array.from(this.skeleton.boneMatrices).map(n=>n.toFixed(3)).join(',');if(!poses.includes(pose)&&poses.length<8)poses.push(pose);}};})()`);
  await page.shot('entrance');await east(32);
  const slope=await checkFloor('Entrance slope');
  check(slope.y<-.5,'Walking into the mouth must descend below the meadow');
  await page.shot('descending-entrance');
  await page.press('Space');await page.waitFor(`window.caveState.player.position.y>${slope.y+.3}`);
  await page.waitFor('window.caveState.player.grounded');await checkFloor('Landing on the slope');
  await east(39);await checkFloor('First chamber approach');
  await page.waitFor('window.caveState.threats.find(t=>t.id==="cave-bat").aggro');
  check(await page.evaluate('window.caveState.phase==="expedition"'),'Cave is dangerous expedition territory');
  await page.click('.enemy-nameplate[data-enemy-id="cave-bat"] .nameplate-target');
  await page.shot('bat-intent');await cycle();
  check(await page.evaluate('window.caveState.player.health<100'),'Native bat attack damages the player');
  await page.click('.adventure-actions [data-action="strike"]');await page.click('.adventure-actions [data-action="strike"]');await cycle();
  await page.waitFor('window.caveState.threats.find(t=>t.id==="cave-bat").health===0');
  check(await page.evaluate('window.cavePoses["cave-bat"].length>1'),'Bat skeleton plays authored animation');
  await page.press('KeyF');
  await page.waitFor('window.caveState.lootOpenId==="cave-bat"');
  await page.click('#loot-item');
  await page.waitFor('window.caveState.carriedSalvage===3');
  await east(64);await page.waitFor('window.caveState.threats.find(t=>t.id==="cave-crab").aggro');
  const deep=await checkFloor('Deep chamber');check(deep.y<-8.9,'Deep chamber must lie nine metres below the meadow');
  await page.click('.enemy-nameplate[data-enemy-id="cave-crab"] .nameplate-target');await page.shot('crab-intent');
  const health=await page.evaluate<number>('window.caveState.player.health');await cycle();
  check(await page.evaluate<number>('window.caveState.player.health')<health,'Crab slam lands after its longer windup');
  await page.click('.adventure-actions [data-action="strike"]');await page.click('.adventure-actions [data-action="strike"]');await cycle();
  await page.waitFor('window.caveState.threats.find(t=>t.id==="cave-crab").health===0');
  check(await page.evaluate('window.cavePoses["cave-crab"].length>1'),'Crab skeleton plays authored animation');
  const corpseX=await page.evaluate<number>('window.caveState.threats.find(t=>t.id==="cave-crab").position.x');await east(corpseX-1);
  await page.press('KeyF');await page.waitFor('window.caveState.lootOpenId==="cave-crab"');
  await page.click('#loot-item');await page.waitFor('window.caveState.carriedSalvage===9');
  await page.shot('deep-chamber-cleared');
  await page.key('KeyD',true);try{await page.waitFor('window.caveState.player.position.x<27',20000);}finally{await page.key('KeyD',false);}
  const outside=await checkFloor('Return to meadow');check(Math.abs(outside.y)<.08,'Leaving the cave must climb back to meadow height');
  check(await page.evaluate('window.caveState.player.health>0 && window.caveState.carriedSalvage===9'),'Return through entrance alive with cave loot');
  await page.shot('returned-to-meadow');check(page.errors.length===0,'No browser exceptions');
  console.log('PASS Hollowdeep slope descent, jumping, two underground animated creatures, damage, loot and uphill exit',page.output);
} catch(error){await page.shot('failure');throw error;}
finally{await page.close();await service.close();server.stop(true);dev.kill();await dev.exited;}
