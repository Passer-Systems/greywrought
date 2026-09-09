import { check, openBrowser } from "./session.js";

const page = await openBrowser("npc-barter");
const held = new Set<string>();
async function hold(desired: readonly string[]) {
  for (const code of held) if (!desired.includes(code)) { await page.key(code, false); held.delete(code); }
  for (const code of desired) if (!held.has(code)) { await page.key(code, true); held.add(code); }
}
async function moveTo(x: number, z: number) {
  const deadline = performance.now() + 15_000;
  while (performance.now() < deadline) {
    const state = await page.read();
    const dx = x - Number(state.gamePlayerX), dz = z - Number(state.gamePlayerZ);
    if (Math.hypot(dx, dz) < 0.4) { await hold([]); return; }
    const next: string[] = [];
    if (Math.abs(dx) > 0.2) next.push(dx > 0 ? "KeyA" : "KeyD");
    if (Math.abs(dz) > 0.2) next.push(dz > 0 ? "KeyW" : "KeyS");
    await hold(next);
    await Bun.sleep(75);
  }
  throw new Error(`Could not reach Mara: ${JSON.stringify(await page.read())}`);
}
const balances = (supplies: number, potions: number) => page.waitFor(`Number(document.body.dataset.gameSupplies) === ${supplies} && Number(document.body.dataset.gamePotions) === ${potions}`);
const openTrade = async () => {
  await page.click("#shop-trade");
  await page.waitFor('!document.getElementById("trade-panel").hidden');
};
try {
  await page.enter();
  await moveTo(3.4, -7.5);
  await page.press("KeyF");
  await page.waitFor('!document.getElementById("shop-panel").hidden');
  await openTrade();
  await balances(15, 0);
  await page.click("#trade-more");
  await balances(15, 0);
  check(await page.evaluate<boolean>('(() => {const panel=document.getElementById("trade-panel").getBoundingClientRect(), close=document.getElementById("trade-close").getBoundingClientRect(); return Math.abs(panel.top+3-close.top)<1 && Math.abs(panel.right-3-close.right)<1;})()'), "Trade close button must sit in the frame corner");
  await page.shot("offer-two-potions");
  await page.click("#trade-accept");
  await balances(9, 2);
  await page.waitFor('document.getElementById("trade-panel").hidden');
  await openTrade();
  await page.click("#trade-offer-potions");
  await balances(9, 2);
  await page.shot("offer-potion-for-supplies");
  await page.click("#trade-accept");
  await balances(11, 1);
  await openTrade();
  await page.click("#trade-cancel");
  await page.waitFor('document.getElementById("trade-panel").hidden');
  await balances(11, 1);
  await openTrade();
  await page.press("Escape");
  await page.waitFor('document.getElementById("trade-panel").hidden && !document.getElementById("shop-panel").hidden');
  await openTrade();
  await page.click("#trade-close");
  await page.waitFor('document.getElementById("trade-panel").hidden');
  await openTrade();
  const before = await page.read();
  await page.key("KeyW", true);
  await page.waitFor(`Number(document.body.dataset.gamePlayerZ) > ${Number(before.gamePlayerZ) + 0.25}`);
  await page.key("KeyW", false);
  check(await page.evaluate<boolean>('!document.getElementById("trade-panel").hidden'), "Nearby movement must keep barter open");
  await moveTo(0, -8);
  await page.waitFor('document.getElementById("trade-panel").hidden && document.getElementById("shop-panel").hidden');
  await balances(11, 1);
  await page.reload();
  await page.waitFor('document.body.dataset.entryRoute === "world" && document.body.dataset.rigState === "ready"');
  await balances(11, 1);
  await page.press("KeyB");
  await page.shot("saved-barter-inventory");
  check(page.errors.length === 0, "Barter caused a browser exception");
  await Bun.write(`${page.output}/result.json`, JSON.stringify({ status: "passed", supplies: 11, potions: 1, checks: ["quote reserves nothing", "buy two", "sell one", "cancel", "Escape", "corner close", "movement", "range closes", "reload preserves inventory"] }, null, 2));
  console.log(`NPC barter passed: ${page.output}`);
} finally { await page.close(); }
