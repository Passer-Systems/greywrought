import { COMBAT_RULES } from "../../src/game/adventure.js";
import { check, openBrowser } from "./session.js";

const page = await openBrowser("combat-three-slots");
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
try {
  await page.enter();
  await page.key("KeyW", true);
  await page.waitFor('Number(document.body.dataset.gamePlayerZ) > 2.4');
  await page.key("KeyW", false);
  await page.waitFor('document.getElementById("combat-plan").dataset.phase === "idle"');
  await page.press("KeyE");
  await page.press("KeyQ"); await page.press("KeyQ");
  await page.waitFor('JSON.parse(document.getElementById("combat-plan").dataset.queued).length === 3');
  check(await page.evaluate<boolean>('document.querySelector(".combat-plan-resources").textContent.includes("3/3 slots")'), "The plan reports its three action slots");
  check(await page.evaluate<boolean>('document.querySelector("[data-action=brace] .action-cost").textContent === "2" && document.querySelector("[data-action=jab] .action-cost").textContent === "Free"'), "Paid and free moves must show their costs without hovering");
  check(await page.evaluate<boolean>('document.querySelectorAll(".combat-plan-player").length === 3 && document.querySelectorAll(".combat-plan-delay").length === 3'), "Exactly three action slots and placement controls are shown");
  await page.shot("block-first-full-plan");
  await page.press("KeyV");
  await page.waitFor('document.getElementById("combat-plan-feedback").textContent.includes("Three moves already fill this plan")');
  check(await page.evaluate<boolean>('JSON.parse(document.getElementById("combat-plan").dataset.queued).map(move=>move.action).join() === "brace,strike,strike"'), "A fourth move must leave the full Block-first plan intact");
  await page.click(".combat-plan-clear");
  await page.press("KeyE");
  for (let i = 0; i < 2; i++) await page.press("KeyV");
  await page.waitFor('JSON.parse(document.getElementById("combat-plan").dataset.queued).length === 3 && document.body.dataset.gameAvailableStamina === "3"');
  await page.click(".combat-plan-clear");
  await page.press("KeyQ"); await page.press("KeyE");
  await dragMove("strike", "brace");
  await page.waitFor('document.querySelector(".combat-plan-move[data-queued-action=strike]").dataset.offset === "1" && document.querySelector(".combat-plan-move[data-queued-action=brace]").dataset.offset === "0"');
  await dragMove("strike", "brace");
  await page.waitFor('document.querySelector(".combat-plan-move[data-queued-action=strike]").dataset.offset === "0" && document.querySelector(".combat-plan-move[data-queued-action=brace]").dataset.offset === "1"');
  await page.click('.combat-plan-move[data-queued-action=brace]');
  for (const slot of [3,1,2]) {
    await page.press("Digit" + slot);
    await page.waitFor(`document.querySelector('.combat-plan-move[data-queued-action=brace]')?.dataset.offset === '${slot-1}'`);
  }
  await page.click('.combat-plan-move[data-queued-action=strike]');
  await page.press("Digit1");
  await page.waitFor('document.querySelector(".combat-plan-move[data-queued-action=strike]")?.dataset.offset === "0"');
  await page.shot("three-slot-swap");
  for (let i = 0; i < 2; i++) await page.press("KeyV");
  await page.waitFor('document.querySelectorAll(".combat-plan-move").length === 3');
  check(await page.evaluate<boolean>('JSON.parse(document.getElementById("combat-plan").dataset.queued).map(move=>move.offsetSeconds).join() === "0,1,2"'), "Three slots fill the shared action window");
  await page.click(".combat-plan-clear");
  for (let i = 0; i < 3; i++) await page.press("KeyQ");
  await page.waitFor('document.querySelectorAll(".combat-plan-move").length === 3');
  check(await page.evaluate<boolean>('JSON.parse(document.getElementById("combat-plan").dataset.queued).map(move=>move.offsetSeconds).join() === "0,1,2"'), "Three moves must fill all three slots");
  await page.shot("three-queued-skills");
  await page.click(".combat-plan-clear");
  await page.press("KeyE"); await page.press("Digit3");
  await page.key("KeyW", true);
  await page.waitFor('document.body.dataset.gameCombatPhase === "active"');
  await page.key("KeyW", false);
  await page.waitFor('document.querySelector(".combat-plan-move[data-queued-action=brace]")?.dataset.status === "executed"', 7000);
  check(Number((await page.read()).gameBlock) === COMBAT_RULES.brace.block, "Third-slot Block must activate at two seconds");
  await page.shot("third-slot-executed");
  await page.waitFor('document.body.dataset.gameCombatPhase === "preparation"');
  check(await page.evaluate<boolean>('Number(document.getElementById("combat-plan").dataset.remaining) > 4.5 && Number(document.getElementById("combat-plan").dataset.remaining) <= 5'), "Three active slots must be followed by five seconds of preparation");
  check(page.errors.length === 0, "Browser exceptions occurred");
  console.log(`PASS: 1–3 select slots 1–3, occupied slots swap, all three slots fill, third-slot Block executes. ${page.output}`);
} finally { await page.key("KeyW", false).catch(() => {}); await page.close(); }
