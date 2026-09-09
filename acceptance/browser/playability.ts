import { check, openBrowser } from "./session.js";

const page = await openBrowser("playability");
try {
  await page.enter();
  const initial = await page.read();
  check(Number(initial.gamePlayerVitality) === 100, "New character did not enter town healthy");
  await page.key("KeyD", true);
  await Bun.sleep(500);
  await page.key("KeyD", false);
  const strafe = await page.read();
  check(Math.abs(Number(strafe.gamePlayerX) - Number(initial.gamePlayerX)) > 0.5, "D did not strafe");
  check(Math.abs(Number(strafe.gamePlayerZ) - Number(initial.gamePlayerZ)) < 0.1, "Strafing changed forward position");
  await page.press("Space");
  await page.waitFor('Number(document.body.dataset.gamePlayerY) > 0.1');
  await Bun.sleep(900);
  const beforeMouse = await page.read();
  await page.key("KeyS", true);
  await page.call("Input.dispatchMouseEvent", { type: "mousePressed", x: 650, y: 410, button: "left", buttons: 1, clickCount: 1 });
  await page.call("Input.dispatchMouseEvent", { type: "mousePressed", x: 650, y: 410, button: "right", buttons: 3, clickCount: 1 });
  await Bun.sleep(500);
  await page.call("Input.dispatchMouseEvent", { type: "mouseReleased", x: 650, y: 410, button: "right", buttons: 1, clickCount: 1 });
  await page.call("Input.dispatchMouseEvent", { type: "mouseReleased", x: 650, y: 410, button: "left", buttons: 0, clickCount: 1 });
  await page.key("KeyS", false);
  const afterMouse = await page.read();
  check(Number(afterMouse.gamePlayerZ) > Number(beforeMouse.gamePlayerZ) + 0.5, "Both mouse buttons did not override backpedaling");
  await page.shot("town");
  await page.call("Page.reload");
  await page.waitFor('document.body.dataset.entryRoute === "roster"');
  check(await page.evaluate<boolean>('localStorage.getItem("greywrought/local-profile-v1") !== null'), "Character profile missing after reload");
  await page.evaluate('document.getElementById("entry-enter-world").click()');
  await page.waitFor('document.body.dataset.entryRoute === "world"');
  check(page.errors.length === 0, "Browser exceptions occurred");
  await Bun.write(`${page.output}/result.json`, JSON.stringify({ initial, strafe, beforeMouse, afterMouse, errors: page.errors }, null, 2));
  console.log(`PASS: character entry, strafe, jump, mouse priority, reload. Evidence: ${page.output}`);
} finally { await page.close(); }
