import { mkdir } from 'node:fs/promises';
import { GameTools } from '../../src/mcp/tools.js';
import { check, openBrowser } from './session.js';

await mkdir('build/browser', { recursive: true });
const port = 4396;
Bun.env.GREYWROUGHT_GAME_URL = `http://127.0.0.1:${port}/`;
Bun.env.GREYWROUGHT_DEBUG_PORT = '9496';
Bun.env.GREYWROUGHT_VULKAN = '1';
const frontend = Bun.spawn(['bun', 'scripts/dev-server.ts'], {
  env: { ...Bun.env, GREYWROUGHT_PORT: String(port), GREYWROUGHT_LOCAL_WORLD: '1', GREYWROUGHT_WORLD_SAVE: `build/browser/mcp-world-${process.pid}.json` },
  stdout: Bun.file(`build/browser/mcp-${process.pid}-server.log`), stderr: Bun.file(`build/browser/mcp-${process.pid}-errors.log`),
});
const agent = new GameTools({ url: `ws://127.0.0.1:${port}/world`, profilePath: `build/browser/mcp-agent-${process.pid}.json`, name: 'Codex', archetype: 'mage' });
let page: Awaited<ReturnType<typeof openBrowser>> | undefined;
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(Bun.env.GREYWROUGHT_GAME_URL)).ok) break; } catch {} await Bun.sleep(100); }
  await agent.call('connect', {});
  page = await openBrowser('mcp-player', { localOnly: true, beforeNavigate: async call => {
    await call('Emulation.setDeviceMetricsOverride', { width: 640, height: 480, deviceScaleFactor: 1, mobile: false });
  } });
  await page.enter();
  await page.waitFor('document.body.dataset.creatureRigState === "ready"');
  await Bun.sleep(3000);
  // A cold virtual GPU can miss a heartbeat. Recover through ordinary UI controls.
  async function resumeBrowser() {
    const browser = page!;
    for (let attempt = 0; attempt < 4; attempt++) {
      await browser.waitFor('document.body.dataset.gameOnline === "true"');
      if ((await browser.read()).encounterMode === 'paused') {
        await browser.click('#pause-resume'); await browser.waitFor('document.body.dataset.encounterMode === "private"');
      }
      if (await browser.evaluate('!document.getElementById("pause-panel").hidden')) await browser.press('Escape');
      if ((await browser.read()).encounterMode === 'private') {
        // Setup uses the normal button handler even if the reconnect menu
        // reopens between the Escape key and the click on a slow virtual GPU.
        await browser.evaluate('document.getElementById("encounter-rejoin").click()');
      }
      await Bun.sleep(2000);
      if ((await browser.read()).encounterMode === 'shared' && (await browser.read()).gamePaused === 'false') return;
    }
    throw new Error('Browser must remain in the shared world after graphics warmup');
  }
  await resumeBrowser();
  await page.waitFor('JSON.parse(document.body.dataset.gameRemotePlayers).some(p => p.name === "Codex")');
  await page.waitFor('JSON.parse(document.body.dataset.rigRemoteAnimations).length > 0');
  await resumeBrowser();
  const before = agent.client.current.snapshot.player.position.x;
  await agent.call('move', { x: 1, z: 0, seconds: .4 });
  const after = agent.client.current.snapshot.player.position.x;
  check(after > before + .5, 'MCP character must move through the authoritative world');
  await resumeBrowser();
  await page.waitFor(`JSON.parse(document.body.dataset.gameRemotePlayers).some(p => p.name === "Codex" && Math.abs(p.player.position.x - ${after}) < .01)`);
  await page.waitFor('Array.from(document.querySelectorAll("[data-overhead-name]")).some(n => n.dataset.label === "Codex" && !n.hidden)');
  check((await page.read()).characterName !== 'Codex', 'The browser keeps its own character');
  await page.shot('browser-sees-codex');
  await agent.call('disconnect', {});
  await page.waitFor('!JSON.parse(document.body.dataset.gameRemotePlayers).some(p => p.name === "Codex")');
  check(page.errors.length === 0, 'No browser exceptions');
  console.log('PASS independent MCP character visible in browser, authoritative movement, separate player identity and disconnect', page.output);
} catch (error) { await page?.shot('failure'); throw error; }
finally { agent.close(); await page?.close(); frontend.kill(); await frontend.exited; }
