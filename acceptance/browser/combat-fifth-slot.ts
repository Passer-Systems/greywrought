import { COMBAT_RULES } from "../../src/game/adventure.js";
import { check, openBrowser } from "./session.js";

const page = await openBrowser("combat-fifth-slot");
async function dragMove(fromAction: string, toAction: string): Promise<void> {
  const points = await page.evaluate<{x:number;y:number}[]>(`[${JSON.stringify(fromAction)},${JSON.stringify(toAction)}].map(action=>{const r=document.querySelector('.combat-plan-move[data-queued-action="'+action+'"] img').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})`);
  const [from, to] = points;
  check(from && to, "Both queued abilities must be visible");
  await page.call("Input.dispatchMouseEvent", {type:"mouseMoved", ...from, buttons:0});
  await page.call("Input.dispatchMouseEvent", {type:"mousePressed", ...from, button:"left", buttons:1, clickCount:1});
  for (let step=1;step<=8;step++) await page.call("Input.dispatchMouseEvent", {type:"mouseMoved", x:from.x+(to.x-from.x)*step/8, y:from.y+(to.y-from.y)*step/8, button:"left", buttons:1});
  await page.call("Input.dispatchMouseEvent", {type:"mouseReleased", ...to, button:"left", buttons:0, clickCount:1});
}
try {
  await page.enter();
  await page.key("KeyW", true);
  await page.waitFor('Number(document.body.dataset.gamePlayerZ) > 2.4');
  await page.key("KeyW", false);
  await page.waitFor('document.getElementById("combat-plan").dataset.phase === "idle"');
  await page.press("KeyE");
  for (let i = 0; i < 4; i++) await page.press("KeyQ");
  await page.waitFor('document.getElementById("combat-plan-feedback").textContent.includes("Lunge needs 1 stamina; 0 free")');
  check(await page.evaluate<boolean>('JSON.parse(document.getElementById("combat-plan").dataset.queued).length === 4'), "Block plus three paid attacks exhausts five stamina");
  check(await page.evaluate<boolean>('!document.querySelector(".combat-plan-stamina-hint").hidden && document.querySelector(".combat-plan-resources").textContent.includes("4/5 slots")'), "An open slot must be distinguished from having stamina available");
  check(await page.evaluate<boolean>('document.querySelector("[data-action=brace] .action-cost").textContent === "2" && document.querySelector("[data-action=jab] .action-cost").textContent === "Free"'), "Paid and free moves must show their costs without hovering");
  await page.shot("block-plus-four-paid-attacks");
  await page.press("KeyV");
  await page.waitFor('document.querySelector(".combat-plan-player[data-beat=\\"4\\"] .combat-plan-move")?.dataset.queuedAction === "jab"');
  await page.click(".combat-plan-clear");
  await page.press("KeyE");
  for (let i = 0; i < 4; i++) await page.press("KeyV");
  await page.waitFor('JSON.parse(document.getElementById("combat-plan").dataset.queued).length === 5 && document.body.dataset.gameAvailableStamina === "3"');
  await page.click(".combat-plan-clear");
  await page.press("KeyQ"); await page.press("KeyE");
  await dragMove("strike", "brace");
  await page.waitFor('document.querySelector(".combat-plan-move[data-queued-action=strike]").dataset.offset === "1" && document.querySelector(".combat-plan-move[data-queued-action=brace]").dataset.offset === "0"');
  await dragMove("strike", "brace");
  await page.waitFor('document.querySelector(".combat-plan-move[data-queued-action=strike]").dataset.offset === "0" && document.querySelector(".combat-plan-move[data-queued-action=brace]").dataset.offset === "1"');
  await page.click('.combat-plan-move[data-queued-action=brace]');
  for (const slot of [3,1,2,4,5]) {
    await page.press("Digit" + slot);
    await page.waitFor(`document.querySelector('.combat-plan-move[data-queued-action=brace]')?.dataset.offset === '${slot-1}'`);
  }
  await page.click('.combat-plan-move[data-queued-action=strike]');
  await page.press("Digit1");
  await page.waitFor('document.querySelector(".combat-plan-move[data-queued-action=strike]")?.dataset.offset === "0"');
  await page.click('.combat-plan-move[data-queued-action=brace]');
  await page.press("Digit5");
  await page.waitFor('document.querySelector(".combat-plan-player[data-beat=\\"4\\"] .combat-plan-move")?.dataset.queuedAction === "brace"');
  check(await page.evaluate<boolean>('document.querySelector(".combat-plan-move[data-queued-action=strike]")?.dataset.offset === "0"'), "Placing Block in slot five moved Lunge");
  await page.shot("block-fifth-slot");
  for (let i = 0; i < 3; i++) await page.press("KeyV");
  await page.waitFor('document.querySelectorAll(".combat-plan-move").length === 5');
  check(await page.evaluate<boolean>('JSON.parse(document.getElementById("combat-plan").dataset.queued).map(move=>move.offsetSeconds).join() === "0,1,2,3,4"'), "Scheduling Block in slot five must leave earlier slots available");
  await page.click(".combat-plan-clear");
  for (let i = 0; i < 5; i++) await page.press("KeyQ");
  await page.waitFor('document.querySelectorAll(".combat-plan-move").length === 5');
  check(await page.evaluate<boolean>('JSON.parse(document.getElementById("combat-plan").dataset.queued).map(move=>move.offsetSeconds).join() === "0,1,2,3,4"'), "Five moves must fill all five slots");
  await page.shot("five-queued-skills");
  await page.click(".combat-plan-clear");
  await page.press("KeyE"); await page.press("Digit5");
  await page.key("KeyW", true);
  await page.waitFor('document.body.dataset.gameCombatPhase === "active"');
  await page.key("KeyW", false);
  await page.waitFor('document.querySelector(".combat-plan-move[data-queued-action=brace]")?.dataset.status === "executed"', 7000);
  check(Number((await page.read()).gameBlock) === COMBAT_RULES.brace.block, "Fifth-slot Block must activate at four seconds");
  await page.shot("fifth-slot-executed");
  check(page.errors.length === 0, "Browser exceptions occurred");
  console.log(`PASS: 1–5 select slots 1–5, occupied slots swap, all five slots fill, fifth-slot Block executes. ${page.output}`);
} finally { await page.key("KeyW", false).catch(() => {}); await page.close(); }
