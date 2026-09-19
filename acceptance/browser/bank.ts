import { check, openBrowser } from "./session.js";
import { mkdir } from "node:fs/promises";

await mkdir('build', { recursive: true });
const port = Bun.env.GREYWROUGHT_BANK_PORT ?? String(44000 + (process.pid % 8000) * 2);
Bun.env.GREYWROUGHT_GAME_URL = `http://127.0.0.1:${port}/`;
Bun.env.GREYWROUGHT_DEBUG_PORT ??= String(Number(port) + 1);
Bun.env.GREYWROUGHT_VULKAN ??= '1';
const server = Bun.spawn([process.execPath, 'scripts/dev-server.ts'], {
  env: { ...Bun.env, GREYWROUGHT_PORT: port, GREYWROUGHT_LOCAL_WORLD: '1', GREYWROUGHT_WORLD_SAVE: `build/bank-world-${process.pid}.json` },
  stdout: Bun.file('build/bank-server.log'), stderr: Bun.file('build/bank-server-errors.log'),
});
let page: Awaited<ReturnType<typeof openBrowser>> | undefined;
try {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null) throw new Error('Bank test server failed to start; see greywrought:build/bank-server-errors.log');
    try { if ((await fetch(Bun.env.GREYWROUGHT_GAME_URL)).ok) break; } catch {}
    await Bun.sleep(100);
  }
  page = await openBrowser('bank');
  const browser = page;
  const held = new Set<string>();
  async function hold(desired: string[]) {
    for (const code of held) if (!desired.includes(code)) { await browser.key(code, false); held.delete(code); }
    for (const code of desired) if (!held.has(code)) { await browser.key(code, true); held.add(code); }
  }
  async function moveTo(x: number, z: number) {
    const deadline = performance.now() + 15_000;
    while (performance.now() < deadline) {
      const state = await browser.read(), dx = x - Number(state.gamePlayerX), dz = z - Number(state.gamePlayerZ);
      if (Math.hypot(dx, dz) < .4) { await hold([]); return; }
      const next: string[] = [];
      if (Math.abs(dx) > .2) next.push(dx > 0 ? 'KeyA' : 'KeyD');
      if (Math.abs(dz) > .2) next.push(dz > 0 ? 'KeyW' : 'KeyS');
      await hold(next); await Bun.sleep(75);
    }
    throw new Error('Could not reach town service');
  }
  async function quantity(kind: 'supplies' | 'potions', amount: number) {
    await browser.evaluate(`(() => {const input=document.getElementById('bank-quantity-${kind}');input.value='${amount}';input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  }
  const balance = (supplies: number, potions: number, storedSupplies: number, storedPotions: number) => browser.waitFor(`Number(document.body.dataset.gameSupplies)===${supplies} && Number(document.body.dataset.gamePotions)===${potions} && document.getElementById('bank-stored-supplies').textContent==='${storedSupplies}' && document.getElementById('bank-stored-potions').textContent==='${storedPotions}'`);
  console.log('Bank journey: enter');
  await page.enter();
  console.log('Bank journey: buy potions');
  await moveTo(3.4, -7.5); await page.press('KeyF');
  await page.waitFor('!document.getElementById("shop-panel").hidden');
  await page.click('[data-npc-service="mara"]');
  await page.click('#shop-buy-potion'); await page.click('#shop-buy-potion');
  await page.waitFor('document.body.dataset.gamePotions === "2"');
  await page.press('Escape');
  console.log('Bank journey: visit bank');
  await moveTo(-8.5, -10); await page.press('KeyF');
  await page.waitFor('!document.getElementById("bank-panel").hidden && document.body.dataset.bankerState === "ready"');
  await quantity('supplies', 7); await page.click('#bank-deposit-supplies');
  await quantity('potions', 2); await page.click('#bank-deposit-potions');
  await balance(2, 0, 7, 2);
  await quantity('supplies', 3); await page.click('#bank-withdraw-supplies');
  await quantity('potions', 1); await page.click('#bank-withdraw-potions');
  await balance(5, 1, 4, 1);
  await page.shot('bank-deposit-withdraw');
  await page.click('#bank-quantity-supplies');
  await page.press('Escape'); await page.waitFor('document.getElementById("bank-panel").hidden');
  await page.press('KeyF'); await page.waitFor('!document.getElementById("bank-panel").hidden');
  await moveTo(-4, -10); await page.waitFor('document.getElementById("bank-panel").hidden');
  console.log('Bank journey: reload');
  const previousPage = await page.evaluate<number>('performance.timeOrigin');
  await page.call('Page.reload');
  for (let attempt = 0; attempt < 150; attempt++) {
    try {
      if (await page.evaluate<boolean>(`performance.timeOrigin > ${previousPage} && document.readyState !== 'loading'`)) break;
    } catch (cause) {
      if (!(cause instanceof Error) || !/Inspected target navigated or closed|Execution context was destroyed|Cannot find context/.test(cause.message)) throw cause;
    }
    await Bun.sleep(100);
  }
  await page.waitFor('document.body.dataset.entryRoute === "world" && document.body.dataset.rigState === "ready"');
  await page.waitFor('document.body.dataset.encounterMode === "paused"');
  await page.click('#pause-resume'); await page.waitFor('document.body.dataset.encounterMode === "private"');
  await page.click('#encounter-rejoin'); await page.waitFor('document.body.dataset.encounterMode === "shared"');
  await moveTo(-8.5, -10); await page.press('KeyF');
  await page.waitFor('!document.getElementById("bank-panel").hidden');
  await balance(5, 1, 4, 1);
  await page.shot('bank-restored');
  check(page.errors.length === 0, 'Bank journey raised a browser error');
  await Bun.write(`${page.output}/result.json`, JSON.stringify({ status: 'passed', checks: ['deposit supplies and potions', 'withdraw supplies and potions', 'Escape closes', 'distance closes', 'reload and rejoin retain bank and inventory'], supplies: 5, potions: 1, bank: { supplies: 4, potions: 1 } }, null, 2));
  console.log(`PASS bank journey: ${page.output}`);
} finally {
  await page?.close(); server.kill(); await server.exited;
}
