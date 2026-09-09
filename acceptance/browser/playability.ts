import { check, openBrowser } from "./session.js";

const page = await openBrowser("playability");
try {
  await page.enter();
  const initial = await page.read();
  check(Number(initial.gamePlayerVitality) === 100, "New character did not enter town healthy");
  await page.key("KeyD", true);
  // Software-rendered frames vary in duration; verify input through observed motion.
  await page.waitFor(`Number(document.body.dataset.gamePlayerX) < ${Number(initial.gamePlayerX) - 0.5}`, 5_000);
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
  await page.waitFor(`Number(document.body.dataset.gamePlayerZ) > ${Number(beforeMouse.gamePlayerZ) + 0.5}`, 5_000);
  const afterMouse = await page.read();
  check(Number(afterMouse.gamePlayerZ) > Number(beforeMouse.gamePlayerZ) + 0.5, "Both mouse buttons did not override backpedaling");
  await page.call("Input.dispatchMouseEvent", { type: "mouseReleased", x: 650, y: 410, button: "right", buttons: 1, clickCount: 1 });
  await page.waitFor(`Number(document.body.dataset.gamePlayerZ) < ${Number(afterMouse.gamePlayerZ) - 0.3}`, 5_000);
  const afterRelease = await page.read();
  check(Number(afterRelease.gamePlayerZ) < Number(afterMouse.gamePlayerZ) - 0.3, "Releasing the mouse chord did not restore held backpedaling");
  await page.call("Input.dispatchMouseEvent", { type: "mouseReleased", x: 650, y: 410, button: "left", buttons: 0, clickCount: 1 });
  await page.key("KeyS", false);
  await page.shot("town");
  await page.call("Page.reload");
  await page.waitFor('["roster", "world"].includes(document.body.dataset.entryRoute)');
  check(await page.evaluate<boolean>('localStorage.getItem("greywrought/local-profile-v1") !== null'), "Character profile missing after reload");
  await page.evaluate('if(document.body.dataset.entryRoute === "roster") document.getElementById("entry-enter-world").click()');
  await page.waitFor('document.body.dataset.entryRoute === "world"');
  check(page.errors.length === 0, "Browser exceptions occurred");
  await Bun.write(`${page.output}/result.json`, JSON.stringify({ initial, strafe, beforeMouse, afterMouse, errors: page.errors }, null, 2));
  console.log(`PASS: character entry, strafe, jump, mouse priority, reload. Evidence: ${page.output}`);
} finally { await page.close(); }
