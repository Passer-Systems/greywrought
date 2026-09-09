import { check, openBrowser } from "./session.js";

const page = await openBrowser("compact-nameplates");
const plate = '.enemy-nameplate[data-enemy-id="scout"]';
try {
  await page.enter();
  await page.waitFor('document.body.dataset.creatureRigState === "ready"');
  await page.key("KeyW", true);
  await page.waitFor('Number(document.body.dataset.gamePlayerZ) > 2.4');
  await page.key("KeyW", false);
  await page.waitFor(`!document.querySelector('${plate}').hidden && getComputedStyle(document.querySelector('${plate}')).visibility === 'visible'`);
  const layout = await page.evaluate<{ headingAbove: boolean; intentsBelow: boolean; iconWidth: number; visibleText: string; level: string }>(`(() => {
    const root=document.querySelector('${plate}');
    const heading=root.querySelector('.nameplate-heading').getBoundingClientRect();
    const health=root.querySelector('.nameplate-health').getBoundingClientRect();
    const intents=root.querySelector('.nameplate-intents').getBoundingClientRect();
    return {headingAbove:heading.bottom<=health.top+1,intentsBelow:intents.top>=health.bottom-1,iconWidth:root.querySelector('.nameplate-ability-square').getBoundingClientRect().width,visibleText:root.innerText,level:root.querySelector('.nameplate-level').textContent};
  })()`);
  check(layout.headingAbove && layout.intentsBelow, "Name and level must sit above health, with intents below health");
  check(layout.iconWidth <= 34, "Intent icons must be compact");
  check(layout.level === "1", "The opening enemy must display its authored level");
  check(!/Active|Watching|Opener|In range|Beam/.test(layout.visibleText), "Redundant labels must not obscure the creature");
  check(!/\b8\b/.test(layout.visibleText), "Damage must not be an unexplained icon overlay");
  check(await page.evaluate<boolean>(`document.querySelectorAll('${plate} .nameplate-ability:not([hidden])').length <= 2`), "Enemy intent display must show at most pause plus one committed move");
  check(await page.evaluate<boolean>(`!document.querySelector('${plate} [data-ability-slot="later"]') && !document.querySelector('${plate} .nameplate-wait')`), "Enemy intent display must not expose future or gap placeholders");
  await page.shot("compact-idle");
  const opener = plate + ' [data-ability-slot="next"]';
  const pointer = await page.evaluate<{x:number;y:number}>(`(() => {const r=document.querySelector('${opener}').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
  await page.call("Input.dispatchMouseEvent", {type:"mouseMoved", ...pointer, buttons:0});
  await page.waitFor(`getComputedStyle(document.querySelector('${opener} .nameplate-tooltip')).display !== 'none'`);
  check(await page.evaluate<boolean>(`document.querySelector('${opener} .nameplate-tooltip').textContent.includes('8 damage')`), "Opener tooltip must explicitly explain damage");
  await page.shot("opener-tooltip");
  await page.call("Input.dispatchMouseEvent", {type:"mouseMoved", x:20,y:20,buttons:0});
  await page.press("KeyE");
  await page.key("KeyW", true);
  await page.waitFor('document.body.dataset.gameCombatPhase === "active"');
  await page.key("KeyW", false);
  await page.waitFor(`document.querySelector('${plate}').dataset.aggro === 'true'`);
  await page.waitFor(`document.body.dataset.gameCombatPhase === "choosing" && document.querySelector('${plate} [data-ability-slot="current"]')?.getAttribute('aria-label')?.includes('Choosing next move')`);
  check(await page.evaluate<boolean>(`document.querySelectorAll('${plate} .nameplate-ability:not([hidden])').length === 1 && !document.querySelector('${plate} [data-ability-slot="next"]:not([hidden])')`), "Choosing window must show only the pause and no announced move");
  check(await page.evaluate<boolean>(`document.querySelector('${plate} [data-ability-slot="current"]')?.getAttribute('aria-label')?.includes('Choosing next move') === true`), "Choosing pause must explain that the enemy is deciding");
  await page.shot("choosing");
  await page.waitFor(`document.body.dataset.gameCombatPhase === "preparation" && !document.querySelector('${plate} [data-ability-slot="next"]').hidden`);
  await page.shot("compact-combat");
  check(await page.evaluate<boolean>(`document.querySelectorAll('${plate} .nameplate-ability:not([hidden])').length <= 2`), "Active enemy intent display must not expose future sequence entries");
  check(page.errors.length === 0, "No browser exceptions");
  console.log(`PASS: compact name/level/health/intent hierarchy, explicit damage tooltip, opening combat. ${page.output}`);
} finally { await page.key("KeyW", false).catch(()=>{}); await page.close(); }
