import { check, openBrowser } from "./session.js";

const page = await openBrowser("expedition");
const held = new Set<string>();
async function hold(desired: readonly string[]) {
  for (const code of held) if (!desired.includes(code)) { await page.key(code, false); held.delete(code); }
  for (const code of desired) if (!held.has(code)) { await page.key(code, true); held.add(code); }
}
async function moveTo(x: number, z: number, tolerance = 0.5) {
  const deadline = performance.now() + 18_000;
  while (performance.now() < deadline) {
    const state = await page.read();
    check(state.gamePhase !== "lost", "Character fell while walking the route");
    const dx = x - Number(state.gamePlayerX), dz = z - Number(state.gamePlayerZ);
    if (Math.hypot(dx, dz) <= tolerance) { await hold([]); return; }
    const next: string[] = [];
    // Initial camera faces north (+z), putting world +x to the player's left.
    if (Math.abs(dx) > tolerance / 2) next.push(dx > 0 ? "KeyA" : "KeyD");
    if (Math.abs(dz) > tolerance / 2) next.push(dz > 0 ? "KeyW" : "KeyS");
    await hold(next);
    await Bun.sleep(100);
  }
  throw new Error(`Could not reach ${x},${z}: ${JSON.stringify(await page.read())}`);
}
try {
  await page.enter();
  await moveTo(3.4, -7.5, 0.6);
  await page.waitFor('document.body.dataset.adventureAudioUnlocked === "true" && Number(document.body.dataset.adventureAudioSamples) === 10');
  const musicTime = await page.evaluate<number>('document.getElementById("adventure-music").currentTime');
  await page.waitFor(`document.getElementById("adventure-music").currentTime > ${musicTime + 0.2}`);
  await page.press("KeyF");
  await page.waitFor('Boolean(document.getElementById("shop-buy-potion")?.getClientRects().length)');
  await page.click('#shop-buy-potion');
  await page.waitFor('Number(document.body.dataset.gamePotions) === 1 && Number(document.body.dataset.gameSupplies) === 12');
  const shopping = await page.read();
  await page.key("KeyW", true);
  await page.waitFor(`Number(document.body.dataset.gamePlayerZ) > ${Number(shopping.gamePlayerZ) + 0.25}`);
  await page.key("KeyW", false);
  check(await page.evaluate<boolean>('!document.getElementById("shop-panel").hidden'), "Movement closed the shop");
  await page.click('#shop-close');
  await moveTo(0, -2);
  await moveTo(0, 5);
  await moveTo(-2, 12);
  await page.waitFor('document.body.dataset.gamePhase === "expedition"');
  await page.press("KeyG");
  await page.waitFor('Number(document.body.dataset.gameCargo) === 3');
  const gathered = await page.read();
  check(Number(gathered.gamePlayerVitality) < 100, "Thorn gathering cost was not applied");
  await page.press("KeyB");
  await page.waitFor('!document.getElementById("bag-panel").hidden');
  await page.click('[data-bag-item="potions"]');
  await page.click('#bag-use-potion');
  await page.waitFor('Number(document.body.dataset.gamePotions) === 0 && Number(document.body.dataset.gamePlayerVitality) === 100');
  await page.press("KeyB");
  await page.waitFor('Number(document.body.dataset.gameActionCooldown) === 0');
  const lookout = '.enemy-nameplate[data-enemy-id="scout"]';
  await page.evaluate(`document.querySelector('${lookout}')?.click()`);
  await page.press("Digit1");
  await page.waitFor(`Number(document.querySelector('${lookout}')?.dataset.health) < 18`);
  await page.waitFor('Number(document.body.dataset.gameActionCooldown) === 0');
  await page.press("Digit1");
  await page.waitFor(`document.querySelector('${lookout}')?.dataset.phase === "cleared"`);
  await page.press("KeyF");
  await page.waitFor('!document.getElementById("loot-window").hidden && document.getElementById("loot-window").dataset.lootSource === "scout"');
  const lootQuantity = await page.evaluate<number>('Number(document.getElementById("loot-window").dataset.lootQuantity)');
  const inspectingLoot = await page.read();
  await page.key("KeyW", true);
  await page.waitFor(`Number(document.body.dataset.gamePlayerZ) > ${Number(inspectingLoot.gamePlayerZ) + 0.25}`);
  check(await page.evaluate<boolean>('!document.getElementById("loot-window").hidden'), "Movement closed nearby loot");
  await page.press("Escape");
  await page.waitFor('document.getElementById("loot-window").hidden && document.body.dataset.gamePaused === "false"');
  const closedLoot = await page.read();
  await page.waitFor(`Number(document.body.dataset.gamePlayerZ) > ${Number(closedLoot.gamePlayerZ) + 0.25}`);
  await page.key("KeyW", false);
  await moveTo(Number(inspectingLoot.gamePlayerX), Number(inspectingLoot.gamePlayerZ), 0.15);
  await page.press("KeyF");
  await page.waitFor('!document.getElementById("loot-window").hidden');
  await page.click("#loot-close");
  await page.waitFor('document.getElementById("loot-window").hidden');
  await page.press("KeyF");
  await page.waitFor('!document.getElementById("loot-window").hidden');
  await page.shot("corpse-loot");
  await page.reload();
  await page.waitFor('document.body.dataset.entryRoute === "world" && document.body.dataset.rigState === "ready"');
  await page.press("KeyF");
  await page.waitFor('!document.getElementById("loot-window").hidden && document.getElementById("loot-window").dataset.lootSource === "scout"');
  await page.click("#loot-item");
  await page.waitFor(`Number(document.body.dataset.gameCarriedSalvage) === ${lootQuantity} && document.getElementById("loot-window").hidden`);
  const looted = await page.read();
  await page.press("KeyB");
  await page.waitFor(`Number(document.querySelector('[data-bag-item="carriedSalvage"]')?.dataset.quantity) === ${lootQuantity}`);
  await page.click('[data-bag-item="carriedSalvage"]');
  await page.shot("backpack-loot");
  await page.press("Escape");
  check(Number(looted.gameSupplies) === 12, "Loot was banked before extraction");
  await page.press("KeyF");
  await page.waitFor('document.getElementById("loot-window").hidden');
  check(Number((await page.read()).gameCarriedSalvage) === lootQuantity, "Corpse loot was duplicated");
  await moveTo(0, 16);
  await moveTo(4.2, 17.65, 0.25);
  const nest = '.enemy-nameplate[data-enemy-id="nest"]';
  await page.evaluate(`document.querySelector('${nest}')?.click()`);
  await page.waitFor(`document.querySelector('${nest}')?.dataset.disposition === "neutral" && document.querySelector('${nest}')?.dataset.aggro === "false"`);
  await page.shot("neutral-nest");
  await page.press("Digit1");
  await page.waitFor(`document.querySelector('${nest}')?.dataset.aggro === "true"`);
  await page.waitFor('Number(document.body.dataset.gameActionCooldown) === 0');
  await page.waitFor(`document.querySelector('${nest}')?.dataset.phase === "preparation" && Number(document.querySelector('${nest}')?.dataset.remaining) > 0.7`);
  const beforeBrace = await page.read();
  const predictedDamage = await page.evaluate<number>(`Number(document.querySelector('${nest}')?.dataset.damage)`);
  const firstSequence = await page.evaluate<number>(`Number(document.querySelector('${nest}')?.dataset.actionSequence)`);
  await page.press("KeyE");
  await page.waitFor('Number(document.body.dataset.gameGuardSeconds) > 0');
  await page.shot("forecast");
  await page.waitFor(`Number(document.querySelector('${nest}')?.dataset.actionSequence) > ${firstSequence}`, 8_000);
  const braced = await page.read();
  check(Number(beforeBrace.gamePlayerVitality) - Number(braced.gamePlayerVitality) === predictedDamage / 2, "Brace did not halve the forecast hit");
  await page.shot("braced-hit");
  await page.waitFor(`document.querySelector('${nest}')?.dataset.phase === "preparation" && Number(document.querySelector('${nest}')?.dataset.remaining) > 2.2`);
  const secondSequence = await page.evaluate<number>(`Number(document.querySelector('${nest}')?.dataset.actionSequence)`);
  await moveTo(0, 16);
  await page.waitFor(`Number(document.querySelector('${nest}')?.dataset.actionSequence) > ${secondSequence}`, 8_000);
  const avoided = await page.read();
  check(Number(avoided.gamePlayerVitality) === Number(braced.gamePlayerVitality), "Stepping outside the warning failed to avoid damage");
  await page.shot("avoided-hit");
  await moveTo(0, 5);
  await moveTo(0, -2);
  await page.waitFor('document.body.dataset.gamePhase === "town" && Number(document.body.dataset.gameCargo) === 0');
  const returned = await page.read();
  check(Number(returned.gameSupplies) === 15 + lootQuantity && Number(returned.gameCarriedSalvage) === 0, "Living return did not bank gathered cores and corpse salvage");
  await page.shot("returned");
  await page.reload();
  await page.waitFor('["roster", "world"].includes(document.body.dataset.entryRoute)');
  await page.evaluate('if(document.body.dataset.entryRoute === "roster") document.getElementById("entry-enter-world").click()');
  await page.waitFor(`document.body.dataset.entryRoute === "world" && Number(document.body.dataset.gameSupplies) === ${15 + lootQuantity}`);
  check(page.errors.length === 0, "Browser exceptions occurred");
  await Bun.write(`${page.output}/result.json`, JSON.stringify({ gathered, lootQuantity, looted, beforeBrace, predictedDamage, braced, avoided, returned, reopened: await page.read(), errors: page.errors }, null, 2));
  console.log(`PASS: music, buy, gather, heal, strike, reopen unclaimed corpse, loot once, provoke neutral enemy, forecast, halve a hit, avoid a hit, extract loot, reload. Evidence: ${page.output}`);
} finally { await hold([]).catch(() => {}); await page.close(); }
