import { check, openBrowser } from './session.js';
import { createAdventure } from '../../src/game/adventure.js';

const page = await openBrowser('combat-pressure');
async function restoreBoss() {
  const save = JSON.parse(createAdventure().save());
  save.state.phase = 'expedition'; save.state.position = {x:2,y:0,z:42};
  save.state.cargo = 6; save.state.selectedThreat = 'ritual-guardian';
  for (const enemy of save.state.threats) {
    enemy.rng = 2000;
    if (enemy.id !== 'ritual-guardian') { enemy.health = 0; enemy.phase = 'cleared'; enemy.lootClaimed = true; }
  }
  await restore(createAdventure({save:JSON.stringify(save)}).save());
}
async function restore(valid: string) {
  await page.evaluate('document.getElementById("return-roster").click()');
  await page.waitFor('document.body.dataset.entryRoute === "roster"');
  await page.evaluate(`(() => { const id=document.querySelector('#entry-roster-list [data-character-id]').dataset.characterId; localStorage.setItem('greywrought/adventure-v1/'+id,${JSON.stringify(valid)}); })()`);
  const archetype = JSON.parse(valid).state.archetype;
  await page.evaluate(`(() => {const key='greywrought/local-profile-v1',p=JSON.parse(localStorage.getItem(key));p.characters.find(c=>c.id===p.selectedCharacterId).archetype=${JSON.stringify(archetype)};localStorage.setItem(key,JSON.stringify(p));})()`);
  await page.reload(); await page.waitFor('document.body.dataset.entryRoute === "roster"');
  await page.click('#entry-enter-world');
  await page.waitFor('document.body.dataset.entryRoute === "world" && document.body.dataset.rigState === "ready"');
  await page.click('#chat-log-tab-combat');
}
try {
  await page.enter(); await restoreBoss();
  await page.press('KeyR');
  await page.waitFor('document.body.dataset.gameCombatPhase === "preparation"');
  check(Number((await page.read()).gamePlayerVitality) === 100, 'Summoning must not inflict an opening hit');
  const seconds = await page.evaluate<number>('Number(document.getElementById("combat-plan").dataset.remaining)');
  check(seconds > 4, 'Summoning must start a full preparation window');
  const offset = await page.evaluate<number>('Number(document.querySelector(".combat-plan-enemy-move").dataset.offset)');
  await page.press('KeyE');
  await page.waitFor('JSON.parse(document.getElementById("combat-plan").dataset.queued).some(e=>e.action==="brace"&&e.status==="pending")');
  const id = await page.evaluate<number>('JSON.parse(document.getElementById("combat-plan").dataset.queued).find(e=>e.action==="brace").id');
  // The editor uses delay from opening for the first queued action.
  await page.click(`.combat-plan-delay[data-delay="${Math.floor(offset)}"]`);
  check(await page.evaluate<boolean>(`JSON.parse(document.getElementById('combat-plan').dataset.queued).some(e=>e.id===${id}&&e.action==='brace'&&e.status==='pending')`), 'Block must queue during the summon warning');
  await page.waitFor('document.body.dataset.gameCombatPhase === "preparation" && Number(document.body.dataset.gameCombatElapsed) >= 3');
  check(Number((await page.read()).gamePlayerVitality) === 100, 'Boss attacked before preparation ended');
  await page.shot('summon-preparation');
  await page.waitFor('document.getElementById("chat-log-messages").textContent.includes("blocked by Brace")',12000);
  await page.shot('boss-opening-blocked');
  const social = JSON.parse(createAdventure().save());
  social.state.phase = 'expedition'; social.state.position = {x:-3,y:0,z:20};
  social.state.selectedThreat = 'warder';
  for (const enemy of social.state.threats) {
    if (enemy.id === 'ritual-guardian') continue;
    enemy.rng = enemy.id === 'patrol' ? 1500 : 2000;
    if (enemy.id === 'warder') enemy.position = {x:-3,y:0,z:27};
    else if (enemy.id === 'patrol') enemy.position = {x:-8,y:0,z:28};
    else { enemy.active = true; enemy.health = 0; enemy.phase = 'cleared'; enemy.lootClaimed = true; }
    enemy.targetPosition = {...enemy.position};
  }
  await restore(createAdventure({save:JSON.stringify(social)}).save());
  await page.waitFor('document.getElementById("combat-plan").dataset.enemies === "2"');
  check(await page.evaluate<boolean>('!document.getElementById("combat-plan-danger").hidden'), 'A double pull must show its danger');
  await page.waitFor('document.getElementById("chat-log-messages").textContent.includes("ally")');
  await page.shot('social-double-pull');
  for (const archetype of ['mage','hunter'] as const) {
    const data=JSON.parse(createAdventure({archetype}).save());
    data.state.phase='expedition';data.state.position={x:0,y:0,z:2.5};
    for(const t of data.state.threats)if(t.id!=='scout'&&t.id!=='ritual-guardian'){t.health=0;t.phase='cleared';t.lootClaimed=true;}
    await restore(createAdventure({save:JSON.stringify(data)}).save());
    const before=await page.read();
    const icon=archetype==='mage'?'wand-bolt.svg':'bow-shot.svg';
    await page.waitFor(`document.querySelector('[data-action="strike"] img').src.endsWith('${icon}') && document.querySelector('[data-action="strike"] img').naturalWidth > 0`);
    await page.press('KeyQ');
    await page.waitFor('Number(document.querySelector(\'.enemy-nameplate[data-enemy-id="scout"]\').dataset.health) === 87');
    const after=await page.read();
    check(after.gamePlayerX===before.gamePlayerX&&after.gamePlayerZ===before.gamePlayerZ,'Ranged attack must not lunge');
    await page.waitFor(`document.querySelector('.combat-plan-move img').src.endsWith('${icon}') && document.querySelector('.combat-plan-move img').naturalWidth > 0`);
    await page.shot(archetype+'-ranged-attack');
  }
  check(page.errors.length === 0, 'Browser exception');
  console.log('PASS boss preparation and queued defense; social double pull; ranged class attacks and real wand/bow icons: '+page.output);
} finally { await page.close(); }
