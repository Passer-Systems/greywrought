import { mkdir } from "node:fs/promises";
import { createSharedAdventure } from "../../src/game/adventure.js";
import { check, openBrowser } from "./session.js";

const character = {id:"currency-tester",name:"Coin Tester",archetype:"mage" as const,createdAtMillis:1};
const token = "local-currency-fixture-token-000000000000";
const world = createSharedAdventure(); world.join(character.id,character.name,character.archetype);
const saved = JSON.parse(world.save());
Object.assign(saved.characters[0].state,{position:{x:-13,y:0,z:-27},coins:10130});
saved.characters[0].state.chapter.experience=590;
saved.world.threats[0].health=1;
await mkdir("build/browser",{recursive:true});
const savePath=`build/browser/currency-${process.pid}-world.json`;
await Bun.write(savePath,JSON.stringify({version:1,accounts:[{character,tokenHash:new Bun.CryptoHasher('sha256').update(token).digest('hex')}],world:JSON.stringify(saved),chat:[],nextChatId:1}));
Bun.env.GREYWROUGHT_GAME_URL="http://127.0.0.1:4219/";
Bun.env.GREYWROUGHT_DEBUG_PORT="9419";
Bun.env.GREYWROUGHT_VULKAN="1";
const server=Bun.spawn([process.execPath,"scripts/dev-server.ts"],{env:{...Bun.env,GREYWROUGHT_PORT:"4219",GREYWROUGHT_LOCAL_WORLD:"1",GREYWROUGHT_WORLD_SAVE:savePath},stdout:Bun.file(`build/browser/currency-${process.pid}-server.log`),stderr:"inherit"});
let page: Awaited<ReturnType<typeof openBrowser>> | undefined;
try {
  for(let i=0;i<100;i++){try{if((await fetch(Bun.env.GREYWROUGHT_GAME_URL)).ok)break;}catch{} await Bun.sleep(100);}
  console.log("Currency: opening browser");
  page=await openBrowser("currency",{localOnly:true,beforeNavigate:async call=>{await call('Page.addScriptToEvaluateOnNewDocument',{source:`
    localStorage.setItem('greywrought/local-profile-v1',${JSON.stringify(JSON.stringify({version:1,displayName:'Economy Test',characters:[character],selectedCharacterId:character.id,savedAtMillis:Date.now()}))});
    localStorage.setItem('greywrought/world-token',${JSON.stringify(token)});
    const Native=WebSocket;window.WebSocket=class extends Native{constructor(...args){super(...args);window.currencySocket=this;this.addEventListener('message',event=>{const data=JSON.parse(event.data);if(data.type==='state')window.currencyState=data;});}};
  `});}});
  console.log("Currency: entering world");
  await page.waitFor('["account", "creator", "roster"].includes(document.body.dataset.entryRoute)');
  console.log("Currency: roster ready");
  await page.click('#entry-enter-world');
  console.log("Currency: enter clicked");
  await page.waitFor('document.body.dataset.entryRoute === "world" && document.body.dataset.gamePhase === "town"');
  console.log("Currency: world ready");
  await page.waitFor('document.body.dataset.rigState === "ready"');
  console.log("Currency: rig ready");
  await page.evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
  console.log("Currency: frames ready; waiting for vendors");
  await page.waitFor('document.body.dataset.vendorsState==="ready"');
  check(await page.evaluate('window.currencySocket.url')==='ws://127.0.0.1:4219/world','Browser must use isolated local world');

  console.log("Currency: checking denominations");
  check(await page.evaluate('document.getElementById("coin-balance").textContent')==='1 gold 1 silver 30 copper','HUD converts saved copper');
  await page.click('[data-overhead-name="npc:weapon-vendor"]');
  await page.waitFor('!document.getElementById("gear-shop").hidden');
  check(await page.evaluate('document.getElementById("gear-shop-balance").textContent')==='Your purse: 1 gold 1 silver 30 copper','Shop balance uses denominations');
  check(await page.evaluate('document.getElementById("gear-buy").textContent')==='Buy · 9 copper','Original weapon price remains nine copper');
  await page.click('#gear-buy');
  await page.waitFor('window.currencyState.snapshot.coins===10121');
  check(await page.evaluate('document.getElementById("coin-balance").textContent')==='1 gold 1 silver 21 copper','Purchase deducts nine copper');
  await page.shot('purchase-denominations');
  console.log("Currency: reloading saved purchase");
  await page.reload();
  await page.waitFor('document.body.dataset.entryRoute==="world"&&document.body.dataset.gameCoins==="10121"');
  check(await page.evaluate('document.getElementById("coin-balance").textContent')==='1 gold 1 silver 21 copper','Denominations persist after reload');
  check(page.errors.length===0,'Currency journey has no browser exceptions');
  console.log('Currency browser passed: '+page.output);
} finally {await page?.close();server.kill();await server.exited;}
