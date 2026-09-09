import { COMBAT_RULES } from "../../src/game/adventure.js";
import { check, openBrowser } from "./session.js";

const page = await openBrowser("combat-fifth-slot");
try {
  await page.enter();
  await page.key("KeyW", true);
  await page.waitFor('Number(document.body.dataset.gamePlayerZ) > 2.4');
  await page.key("KeyW", false);
  await page.waitFor('document.getElementById("combat-plan").dataset.phase === "idle"');
  await page.press("KeyQ"); await page.press("KeyE");
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
