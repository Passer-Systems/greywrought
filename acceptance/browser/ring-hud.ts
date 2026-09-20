import { mkdir } from "node:fs/promises";
import { check, openBrowser } from './session.js';
Bun.env.GREYWROUGHT_GAME_URL='http://127.0.0.1:4300/';
Bun.env.GREYWROUGHT_VULKAN='1'; Bun.env.GREYWROUGHT_DEBUG_PORT='9451';
await mkdir("build/browser", { recursive: true });
const frontend=Bun.spawn(['bun','scripts/dev-server.ts'],{env:{...Bun.env,GREYWROUGHT_PORT:'4300',GREYWROUGHT_LOCAL_WORLD:'1',GREYWROUGHT_WORLD_SAVE:`build/browser/ring-hud-world-${process.pid}.json`},stdout:Bun.file('build/browser/ring-hud-server.log'),stderr:Bun.file('build/browser/ring-hud-server-errors.log')});
let page:Awaited<ReturnType<typeof openBrowser>>|undefined;
try{
  for(let i=0;i<100;i++){try{if((await fetch(Bun.env.GREYWROUGHT_GAME_URL)).ok)break}catch{}await Bun.sleep(100)}
  page=await openBrowser('ring-hud-gameplay',{beforeNavigate:async call=>{
    await call('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
    await call('Page.addScriptToEvaluateOnNewDocument',{source:`const Native=WebSocket;window.WebSocket=class extends Native{constructor(...args){super(...args);this.addEventListener('message',e=>{const d=JSON.parse(e.data);if(d.type==='state')window.latestSnapshot=d.snapshot;})}};`});
  }});
  await page.enter();await page.waitFor('document.body.dataset.creatureRigState==="ready"');
  await Bun.sleep(3000);
  for(let attempt=0;attempt<4;attempt++){
    await page.waitFor('document.body.dataset.gameOnline==="true"');
    if((await page.read()).encounterMode==='paused'){
      await page.click('#pause-resume');await page.waitFor('document.body.dataset.encounterMode==="private"');
    }
    if(await page.evaluate('!document.getElementById("pause-panel").hidden'))await page.press('Escape');
    if((await page.read()).encounterMode==='private')await page.click('#encounter-rejoin');
    await Bun.sleep(1500);
    if((await page.read()).encounterMode==='shared'&&(await page.read()).gamePaused==='false')break;
  }
  await page.waitFor('document.body.dataset.encounterMode==="shared"&&document.body.dataset.gamePaused==="false"');
  await page.press('KeyH');
  await page.waitFor('JSON.parse(document.getElementById("world-canvas").dataset.aggroRanges).length>0');
  await page.shot('town-ranges');
  const before=Number((await page.read()).gamePlayerZ);
  await page.key('KeyW',true);
  await page.waitFor('document.body.dataset.gameCombatPhase==="preparation"',30000);
  await page.key('KeyW',false);
  check(Number((await page.read()).gamePlayerZ)>before+1,'Player moves into a real encounter');
  await page.waitFor('Array.from(document.querySelectorAll(".enemy-nameplate")).some(p=>!p.hidden&&p.style.visibility!=="hidden")');
  // Choose a visible target with the actual mouse and queue an action.
  const selector=await page.evaluate<string>('Array.from(document.querySelectorAll(".enemy-nameplate")).filter(p=>!p.hidden&&p.style.visibility!=="hidden"&&window.latestSnapshot.threats.find(t=>t.id===p.dataset.enemyId)?.aggro).filter(p=>{const t=p.querySelector(".nameplate-target"),b=t.getBoundingClientRect();return t.contains(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2))}).map(p=>`.enemy-nameplate[data-enemy-id="${p.dataset.enemyId}"] .nameplate-target`)[0]');
  await page.click(selector);
  await page.click('.adventure-actions [data-action="strike"]');
  await page.waitFor('window.latestSnapshot.combat.queued.length>0');
  await page.shot('planning-target-and-rings');
  await page.press('KeyR');await page.waitFor('document.body.dataset.gameCombatPhase==="active"');
  await page.shot('active-combat');
  await page.waitFor('document.body.dataset.gameCombatPhase==="preparation"',15000);
  await page.waitFor(`Array.from(document.querySelectorAll('.enemy-nameplate')).filter(p=>!p.hidden).every(p=>{
    const t=window.latestSnapshot.threats.find(t=>t.id===p.dataset.enemyId);
    return p.querySelector('.nameplate-health-value').textContent.startsWith(String(Math.ceil(t.health))+' ');
  })`);
  await page.press('KeyH');await page.waitFor('document.getElementById("world-canvas").dataset.aggroRanges==="[]"');
  await page.press('Escape');await page.waitFor('!document.getElementById("pause-panel").hidden');
  check((await page.read()).encounterMode==='shared','Escape menu leaves shared world running');
  check(page.errors.length===0,'No browser exceptions');
  console.log('PASS town, range toggle, movement, target click, queued attack, active combat, fresh health, next turn and Escape menu',page.output);
}catch(e){await page?.shot('failure');throw e}finally{await page?.key('KeyW',false).catch(()=>{});await page?.close();frontend.kill();await frontend.exited;}
