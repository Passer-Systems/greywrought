import { mkdir } from "node:fs/promises";
import { createSharedAdventure } from "../../src/game/adventure.js";
import { VENDORS } from "../../src/game/economy.js";
import { check, openBrowser } from "./session.js";

const character = {id:"economy-tester",name:"Coin Tester",archetype:"mage" as const,createdAtMillis:1};
const token = "local-economy-fixture-token-000000000000";
const world = createSharedAdventure(); world.join(character.id,character.name,character.archetype);
const saved = JSON.parse(world.save());
Object.assign(saved.characters[0].state,{position:{x:-13,y:0,z:-27},coins:30});
saved.characters[0].state.chapter.experience=590;
saved.world.threats[0].health=1;
await mkdir("build/browser",{recursive:true});
const savePath=`build/browser/economy-${process.pid}-world.json`;
await Bun.write(savePath,JSON.stringify({version:1,accounts:[{character,tokenHash:new Bun.CryptoHasher('sha256').update(token).digest('hex')}],world:JSON.stringify(saved),chat:[],nextChatId:1}));
Bun.env.GREYWROUGHT_GAME_URL="http://127.0.0.1:4217/";
Bun.env.GREYWROUGHT_DEBUG_PORT="9417";
const server=Bun.spawn([process.execPath,"scripts/dev-server.ts"],{env:{...Bun.env,GREYWROUGHT_PORT:"4217",GREYWROUGHT_LOCAL_WORLD:"1",GREYWROUGHT_WORLD_SAVE:savePath},stdout:Bun.file(`build/browser/economy-${process.pid}-server.log`),stderr:"inherit"});
let page: Awaited<ReturnType<typeof openBrowser>> | undefined;
try {
  for(let i=0;i<100;i++){try{if((await fetch(Bun.env.GREYWROUGHT_GAME_URL)).ok)break;}catch{} await Bun.sleep(100);}
  page=await openBrowser("economy",{localOnly:true,beforeNavigate:async call=>{await call('Page.addScriptToEvaluateOnNewDocument',{source:`
    localStorage.setItem('greywrought/local-profile-v1',${JSON.stringify(JSON.stringify({version:1,displayName:'Economy Test',characters:[character],selectedCharacterId:character.id,savedAtMillis:Date.now()}))});
    localStorage.setItem('greywrought/world-token',${JSON.stringify(token)});
    const Native=WebSocket;window.WebSocket=class extends Native{constructor(...args){super(...args);window.economySocket=this;this.addEventListener('message',event=>{const data=JSON.parse(event.data);if(data.type==='state')window.economyState=data;});}};
  `});}});
  await page.enter();await page.waitFor('document.body.dataset.vendorsState==="ready"');
  check(await page.evaluate('window.economySocket.url')==='ws://127.0.0.1:4217/world','Browser must use isolated local world');
  const held=new Set<string>();
  const hold=async(keys:string[])=>{for(const k of held)if(!keys.includes(k)){await page!.key(k,false);held.delete(k);}for(const k of keys)if(!held.has(k)){await page!.key(k,true);held.add(k);}};
  const move=async(x:number,z:number)=>{
    const deadline=performance.now()+30000;
    while(performance.now()<deadline){const d=await page!.read(),dx=x-Number(d.gamePlayerX),dz=z-Number(d.gamePlayerZ);if(Math.hypot(dx,dz)<.55){await hold([]);return;}await hold([...(Math.abs(dx)>.3?[dx>0?'KeyA':'KeyD']:[]),...(Math.abs(dz)>.3?[dz>0?'KeyW':'KeyS']:[])]);await Bun.sleep(80);}
    await hold([]);throw Error(`Cannot reach ${x},${z}: ${JSON.stringify(await page!.read())}`);
  };
  for(const vendor of VENDORS){
    await move(vendor.position.x,vendor.position.z+1);
    await page.click(`[data-overhead-name="npc:${vendor.id}"]`);
    await page.waitFor(`document.getElementById('gear-shop').dataset.vendor==='${vendor.id}'&&!document.getElementById('gear-shop').hidden`);
    await page.shot(vendor.id);
    await page.click('#gear-buy');
    await page.waitFor(`window.economyState.snapshot.progression.ownedGear.includes('${vendor.item}')`);
    await page.click('#gear-shop-close');
  }
  await page.click('#equipment-open');
  for(const [slot,item] of [['mainhand','travel-weapon'],['chest','padded-coat'],['offhand','yard-shield']]){
    await page.click(`[data-equipment-slot="${slot}"]`);await page.click(`[data-gear-item="${item}"]`);
    await page.waitFor(`window.economyState.snapshot.progression.equipment.${slot}==='${item}'`);
  }
  await page.shot('purchased-equipment');await page.click('#equipment-close');
  check(await page.evaluate('window.economyState.snapshot.coins')===3,'All three purchases deduct their prices');
  await move(0,-23);await move(0,0);await move(-3,28);
  await page.press('Digit1');
  await page.waitFor('window.economyState.snapshot.combat.queued.length>0');
  await page.press('KeyR');
  await page.waitFor('Number(document.body.dataset.gameLevel)===4');
  check(await page.evaluate('document.getElementById("experience-label").textContent')==='Level 4 · 0 / 400 XP','Visible XP bar uses current level progress and next threshold');
  check(await page.evaluate('document.getElementById("level-up-notice").textContent.includes("Level up")'),'Level-up feedback is visible');
  await page.shot('level-up');
  await page.waitFor('window.economyState.snapshot.combat.phase!=="active"');
  const corpse=await page.evaluate<{x:number;z:number}>('window.economyState.snapshot.loot.find(item=>item.sourceId==="scout").position');
  await move(corpse.x,corpse.z-1);
  await page.press('KeyF');await page.waitFor('!document.getElementById("loot-window").hidden');
  check(await page.evaluate('document.getElementById("loot-item-category").textContent.includes("3 copper")'),'Corpse shows its copper reward');
  await page.click('#loot-item');await page.waitFor('Number(document.body.dataset.gameCoins)===6');
  await page.reload();await page.waitFor('document.body.dataset.entryRoute==="world"&&document.body.dataset.gameLevel==="4"&&document.body.dataset.gameCoins==="6"');
  check(await page.evaluate('window.economyState.snapshot.progression.equipment.offhand')==='yard-shield','Shield persists through reload');
  check(page.errors.length===0,'Economy journey has no browser exceptions');
  await Bun.write(`${page.output}/result.json`,JSON.stringify({status:'passed',checks:['local world','three labeled animated vendors','three purchases','equipped weapon armor shield','XP level four','visible level-up','coin loot','reload saves coins XP equipment']},null,2));
  console.log(`Economy browser passed: ${page.output}`);
} finally {await page?.close();server.kill();await server.exited;}
