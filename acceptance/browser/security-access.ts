import { check, openBrowser } from './session.js';

// Exercise both default launchers without opting into a local world.
for (const [index, launcher] of ['dev-server.ts', 'static-server.ts'].entries()) {
  const port = 4511 + index, url = `http://127.0.0.1:${port}/`;
  const env: Record<string, string | undefined> = { ...Bun.env, GREYWROUGHT_PORT: String(port), GREYWROUGHT_WORLD_SAVE: `build/browser/security-access-${process.pid}-${index}.json` };
  delete env.GREYWROUGHT_LOCAL_WORLD;
  const server = Bun.spawn([process.execPath, `scripts/${launcher}`], {
    env, stdout: Bun.file(`build/browser/security-access-${index}-server.log`), stderr: Bun.file(`build/browser/security-access-${index}-errors.log`),
  });
  let page: Awaited<ReturnType<typeof openBrowser>> | undefined;
  try {
    for (let attempt = 0; attempt < 100; attempt++) {
      check(server.exitCode === null, `${launcher} exited before becoming ready`);
      try { if ((await fetch(url + 'health')).ok) break; } catch {}
      await Bun.sleep(100);
    }
    check((await fetch(url + 'health')).ok, `${launcher} must start its own world by default`);
    check(!(await (await fetch(url)).text()).includes('wss://play.greywrought.com/world'), 'Local play must not target production');
    Bun.env.GREYWROUGHT_GAME_URL = url;
    Bun.env.GREYWROUGHT_DEBUG_PORT = String(9611 + index);
    Bun.env.GREYWROUGHT_VULKAN = '1';
    page = await openBrowser(`security-access-${index}`, { localOnly: true });
    await page.enter();
    await page.waitFor('document.body.dataset.gameOnline === "true"');
    const start = Number((await page.read()).gamePlayerX);
    await page.key('KeyD', true);
    await page.waitFor(`Number(document.body.dataset.gamePlayerX) < ${start - 0.5}`);
    await page.key('KeyD', false);
    await page.reload();
    await page.waitFor('["roster", "world"].includes(document.body.dataset.entryRoute)');
    await page.evaluate('if (document.body.dataset.entryRoute === "roster") document.getElementById("entry-enter-world").click()');
    await page.waitFor('document.body.dataset.entryRoute === "world" && document.body.dataset.gameOnline === "true"');
    check(page.requests.includes(url.replace('http:', 'ws:') + 'world'), 'Browser must use the local world socket');
    check(!page.requests.some(request => /^(https?|wss?):/.test(request) && new URL(request).hostname !== '127.0.0.1'), 'Local play must not request external resources');
    check(page.errors.length === 0, 'Local play must remain free of browser errors');
    console.log(`PASS ${launcher}: default local world, character entry, movement, reload/reconnect, no external requests`);
  } finally {
    await page?.close();
    server.kill('SIGTERM');
    await server.exited;
  }
}
