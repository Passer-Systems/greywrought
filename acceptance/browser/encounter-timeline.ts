import { createAdventure } from '../../src/game/adventure.js';
import { check, openBrowser } from './session.js';
const page=await openBrowser('encounter-timeline');
function timelineFixture() {
 const data=JSON.parse(createAdventure().save());
 Object.assign(data.state,{phase:'expedition',position:{x:-3,y:0,z:34},ritualCalled:true,selectedThreat:'warder'});
 data.state.combat={phase:'preparation',elapsedSeconds:0,cycle:1,queued:[],nextId:1};
 const ids=['warder','patrol','ritual-guardian'];
 for (const t of data.state.threats) {
  const index=ids.indexOf(t.id);
  if(index<0){t.active=true;t.health=0;t.phase='cleared';t.lootClaimed=true;continue;}
  Object.assign(t,{active:true,aggro:true,phase:'preparation',windowCycle:0,joinCycle:2,rng:index===2?500:2000,position:{x:-3+index*1.4,y:0,z:33},targetPosition:{x:-3,y:0,z:34}});
 }
 return createAdventure({save:JSON.stringify(data)});
}
async function dragMove(fromAction: string, toAction: string): Promise<void> {
  await page.waitFor(`JSON.parse(document.getElementById('combat-plan').dataset.queued).map(move=>move.action).sort().join() === ${JSON.stringify([fromAction,toAction].sort().join())}`);
  await page.evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
  const points = await page.evaluate<{x:number;y:number}[]>(`[${JSON.stringify(fromAction)},${JSON.stringify(toAction)}].map(action=>{const r=document.querySelector('.combat-plan-move[data-queued-action="'+action+'"] img').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})`);
  const [from, to] = points;
  check(from && to, "Both queued abilities must be visible");
  await page.call("Input.dispatchMouseEvent", {type:"mouseMoved", ...from, buttons:0});
  await page.call("Input.dispatchMouseEvent", {type:"mousePressed", ...from, button:"left", buttons:1, clickCount:1});
  for (let step=1;step<=16;step++) {
    await page.call("Input.dispatchMouseEvent", {type:"mouseMoved", x:from.x+(to.x-from.x)*step/16, y:from.y+(to.y-from.y)*step/16, button:"left", buttons:1});
    await Bun.sleep(16);
  }
  await page.call("Input.dispatchMouseEvent", {type:"mouseReleased", ...to, button:"left", buttons:0, clickCount:1});
}
async function restore(source:string) {
 await page.evaluate('document.getElementById("return-roster").click()');
 await page.waitFor('document.body.dataset.entryRoute === "roster"');
 await page.evaluate(`(() => {const id=document.querySelector('#entry-roster-list [data-character-id]').dataset.characterId;localStorage.setItem('greywrought/adventure-v1/'+id,${JSON.stringify(source)});})()`);
 await page.click('#entry-enter-world');
 await page.waitFor('document.body.dataset.entryRoute === "world" && document.body.dataset.creatureRigState === "ready"');
}
try {
 await page.enter();
 await page.key('KeyW',true);
 await page.waitFor('Number(document.body.dataset.gamePlayerZ)>2.4');
 await page.key('KeyW',false);
 await page.waitFor('document.getElementById("combat-plan").dataset.phase === "idle"');
 await page.press('KeyQ');await page.press('KeyE');
 await dragMove('strike','brace');
 await page.waitFor('document.querySelector(".combat-plan-move[data-queued-action=brace]").dataset.offset === "0"');
 await page.press('KeyQ');
 await page.waitFor('document.querySelectorAll(".combat-plan-move").length === 3');
 const rows=await page.evaluate<{y:number;playerX:number;enemyX:number}[]>(`[...document.querySelectorAll('.combat-plan-beat-row')].map(r=>({y:r.getBoundingClientRect().y,playerX:r.querySelector('.combat-plan-player').getBoundingClientRect().x,enemyX:r.querySelector('.combat-plan-enemy').getBoundingClientRect().x}))`);
 check(rows.length===3&&rows[0]!.y<rows[1]!.y&&rows[1]!.y<rows[2]!.y,'Beats must be three vertical rows');
 check(rows.every(r=>r.playerX<r.enemyX),'Player moves must be left of incoming moves');
 check(await page.evaluate<number>('document.getElementById("combat-plan").getBoundingClientRect().width')===360,'The desktop timeline must use half its former 720px width');
 check(await page.evaluate<boolean>('document.getElementById("combat-plan-phase").textContent.startsWith("Combat · ") && !document.querySelector(".combat-plan-axis,.combat-plan-editor")'),'The compact timeline must omit redundant headings and footer controls');
 check(await page.evaluate<number>('document.getElementById("combat-plan").getBoundingClientRect().height')<220,'The compact timeline must save vertical space');
 await page.shot('vertical-opening-plan');
 const source=timelineFixture().save();
 await restore(source);
 await page.waitFor('document.querySelectorAll(".combat-plan-enemy-move").length === 3');
 await page.press('KeyE');await page.press('KeyQ');await page.press('KeyQ');
 await page.call('Input.dispatchMouseEvent',{type:'mouseMoved',x:20,y:10,buttons:0});
 const incoming=await page.evaluate<{beat:string;ids:string[]}[]>(`[...document.querySelectorAll('.combat-plan-beat-row')].map(r=>({beat:r.dataset.beat,ids:[...r.querySelectorAll('.combat-plan-enemy-move')].map(e=>e.dataset.enemyId)}))`);
 check(incoming[0]!.ids.join() === 'warder,patrol' && incoming[1]!.ids.join() === 'ritual-guardian' && incoming[2]!.ids.length===0,'All engaged moves must group on their committed beat');
 check(await page.evaluate<boolean>(`[...document.querySelectorAll('.combat-plan-enemy-move')].every(e=>e.querySelector('.combat-plan-enemy-source').textContent.length>0 && e.querySelector('.combat-plan-enemy-health span').style.width==='100%')`),'Every move must identify its caster and health');
 check(await page.evaluate<boolean>(`(()=>{const p=document.querySelector('#player-frame').getBoundingClientRect(),t=document.querySelector('#target-frame').getBoundingClientRect();return p.width===t.width&&p.height===t.height&&!document.querySelector('#player-stamina,#player-rage')})()`),'Player and enemy frames must match in size without the removed resource section');
 await page.shot('three-enemies-two-overlapping');
 const planTop=await page.evaluate<number>('document.getElementById("combat-plan").getBoundingClientRect().top');
 await page.evaluate(`document.querySelector('.enemy-nameplate[data-enemy-id="patrol"] .nameplate-target').click()`);
 await page.waitFor('document.body.dataset.gameSelectedThreat === "patrol"');
 check(await page.evaluate<number>('document.querySelectorAll(".combat-plan-enemy-move").length')===3,'Changing target must retain every engaged enemy intention');
 check(await page.evaluate<number>('document.getElementById("combat-plan").getBoundingClientRect().top')===planTop,'Clearing the queue on target change must not move the timeline');
 const point=await page.evaluate<{x:number;y:number}>(`(()=>{const r=document.querySelector('.combat-plan-enemy-move[data-enemy-id="warder"]').getBoundingClientRect();return {x:r.x+10,y:r.y+10}})()`);
 await page.call('Input.dispatchMouseEvent',{type:'mouseMoved',...point,buttons:0});
 await page.waitFor(`getComputedStyle(document.querySelector('.combat-plan-enemy-move[data-enemy-id="warder"] .combat-plan-tooltip')).display !== 'none'`);
 check(await page.evaluate<boolean>(`document.querySelector('.combat-plan-enemy-move[data-enemy-id="warder"] .combat-plan-tooltip').textContent.includes('Thorn lash')`),'Hover must explain the incoming ability');
 await page.shot('incoming-tooltip');
 await page.waitFor('document.body.dataset.gameCombatPhase === "choosing"',12000);
 check(await page.evaluate<number>('document.querySelectorAll(".combat-plan-enemy-move").length')===0,'Choosing must not leak the next decisions');
 await page.shot('choosing-no-future-moves');
 await page.waitFor('document.body.dataset.gameCombatPhase === "preparation"');
 check(await page.evaluate<number>('document.querySelectorAll(".combat-plan-enemy-move").length')===3,'Next preparation must show all three committed moves');
 await page.call('Emulation.setDeviceMetricsOverride',{width:1024,height:768,deviceScaleFactor:1,mobile:false});
 await restore(source);
 await page.waitFor('document.querySelectorAll(".combat-plan-enemy-move").length === 3');
 await page.call('Input.dispatchMouseEvent',{type:'mouseMoved',x:20,y:10,buttons:0});
 check(await page.evaluate<boolean>(`(()=>{const p=document.querySelector('.combat-plan').getBoundingClientRect();const f=document.querySelector('#player-frame').getBoundingClientRect();const t=document.querySelector('#target-frame').getBoundingClientRect();return p.left>=0&&p.right<=innerWidth&&p.bottom<=innerHeight&&f.right<t.left&&p.top>=f.bottom})()`),'Timeline and flanking frames must fit at 1024x768');
 await page.shot('three-enemies-1024');
 check(page.errors.length===0,'Browser must not throw');
 console.log('PASS vertical rows, actual drag swap, three enemies grouped by beat, source health, target-independent forecast, tooltip and Choosing; '+page.output);
} finally {await page.key('KeyW',false).catch(()=>{});await page.close();}
