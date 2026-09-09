import { check, openBrowser } from "./session.js";

const page = await openBrowser("character-deletion");
try {
  await page.enter();
  await page.evaluate('document.getElementById("return-roster").click()');
  await page.waitFor('document.body.dataset.entryRoute === "roster"');
  await page.click("#entry-change-character");
  await page.waitFor('document.body.dataset.entryRoute === "creator"');
  await page.evaluate('document.getElementById("entry-character-name").value="Second"; document.getElementById("entry-character-form").requestSubmit()');
  await page.waitFor('document.body.dataset.entryRoute === "roster" && document.querySelectorAll("#entry-roster-list [data-character-id]").length === 2');
  const ids = await page.evaluate<string[]>('[...document.querySelectorAll("#entry-roster-list [data-character-id]")].map(e=>e.dataset.characterId)');
  await page.evaluate(`document.querySelector('[data-character-id="${ids[0]}"]').click()`);
  await page.click("#entry-delete-character");
  check(await page.evaluate<boolean>('!document.getElementById("entry-delete-confirm").hidden'), "Delete confirmation should open");
  await page.press("Escape");
  check(await page.evaluate<boolean>('document.getElementById("entry-delete-confirm").hidden'), "Escape should cancel deletion");
  await page.click("#entry-delete-character");
  await page.click("#entry-delete-accept");
  await page.waitFor('document.body.dataset.entryRoute === "roster" && document.querySelectorAll("#entry-roster-list [data-character-id]").length === 1');
  check(await page.evaluate<boolean>(`localStorage.getItem("greywrought/adventure-v1/${ids[0]}") === null`), "Deleted journey save should be removed");
  check(await page.evaluate<boolean>('document.querySelector("#entry-roster-list [data-character-id]")?.textContent?.includes("Second") === true'), "Other character should remain");
  await page.reload();
  await page.waitFor('document.body.dataset.entryRoute === "roster" && document.querySelectorAll("#entry-roster-list [data-character-id]").length === 1');
  check(await page.evaluate<boolean>('document.querySelector("#entry-roster-list [data-character-id]")?.textContent?.includes("Second") === true'), "Reload lost the surviving character");
  await page.click("#entry-delete-character"); await page.click("#entry-delete-accept");
  await page.waitFor('document.body.dataset.entryRoute === "creator"');
  await page.reload();
  await page.waitFor('document.body.dataset.entryRoute === "creator"');
  check(page.errors.length === 0, "Character deletion caused a browser exception");
  console.log(`Character deletion passed: ${page.output}`);
} finally { await page.close(); }
