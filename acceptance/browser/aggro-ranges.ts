import { createSharedAdventure } from '../../src/game/adventure.js';
import type { ServerWorldMessage } from '../../src/game/multiplayer-types.js';
import { check, openBrowser } from './session.js';

type State = Extract<ServerWorldMessage, { type: 'state' }>;
const character = { id: 'aggro-demo', name: 'Range Tester', archetype: 'mage' as const, createdAtMillis: 1 };
const token = 'aggro-demo-token-00000000000000000';
const seed = createSharedAdventure();
seed.join(character.id, character.name, character.archetype);
const saved = JSON.parse(seed.save());
Object.assign(saved.characters[0].state, { phase: 'expedition', position: { x: -3, y: 0, z: 20 } });
for (const threat of saved.world.threats) {
  if (threat.id === 'warder') threat.position = { x: -3, y: 0, z: 27 };
  if (threat.id === 'patrol') threat.position = { x: -8, y: 0, z: 28 };
  if (threat.id === 'scout') Object.assign(threat, { health: 0, phase: 'cleared', lootClaimed: true, respawnAt: Date.now() + 3_600_000 });
}
const savePath = `build/browser/aggro-ranges-${process.pid}.json`;
await Bun.write(savePath, JSON.stringify({ version: 1, accounts: [
  { character, tokenHash: new Bun.CryptoHasher('sha256').update(token).digest('hex') },
], world: JSON.stringify(saved), chat: [], nextChatId: 1 }));
Bun.env.GREYWROUGHT_GAME_URL = 'http://127.0.0.1:4293/';
Bun.env.GREYWROUGHT_DEBUG_PORT = '9493';
Bun.env.GREYWROUGHT_VULKAN = '1';
const server = Bun.spawn(['bun', 'run', 'demo'], {
  env: { ...Bun.env, GREYWROUGHT_PORT: '4293', GREYWROUGHT_WORLD_SAVE: savePath },
  stdout: Bun.file(`build/browser/aggro-ranges-${process.pid}-server.log`),
  stderr: Bun.file(`build/browser/aggro-ranges-${process.pid}-server-errors.log`),
});
let page: Awaited<ReturnType<typeof openBrowser>> | undefined;
try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    check(server.exitCode === null, 'Demo server exited before startup');
    try { if ((await fetch(Bun.env.GREYWROUGHT_GAME_URL + 'health')).ok) { ready = true; break; } } catch {}
    await Bun.sleep(100);
  }
  check(ready, 'Demo server must become ready');
  page = await openBrowser('aggro-ranges', {
    localOnly: true,
    beforeNavigate: async call => {
      await call('Page.addScriptToEvaluateOnNewDocument', { source: `
        localStorage.setItem('greywrought/local-profile-v1', ${JSON.stringify(JSON.stringify({ version: 1, displayName: 'Ranges', characters: [character], selectedCharacterId: character.id, savedAtMillis: Date.now() }))});
        localStorage.setItem('greywrought/world-token', ${JSON.stringify(token)});
        const Native = WebSocket;
        window.WebSocket = class extends Native {
          constructor(...args) {
            super(...args);
            this.addEventListener('message', event => {
              const state = JSON.parse(event.data);
              if (state.type === 'state') window.rangeState = state;
            });
          }
        };` });
    },
  });
  await page.waitFor('document.body.dataset.entryRoute === "roster"');
  await page.click('#entry-enter-world');
  await page.waitFor('document.body.dataset.entryRoute === "world" && document.body.dataset.rigState === "ready"');
  await page.waitFor('window.rangeState.snapshot.threats.filter(t => t.aggro).length === 2');
  check(await page.evaluate('window.rangeState.snapshot.log.some(entry => entry.text.includes("ally\u0027s call"))'), 'Nearby enemy must answer the call in the real local world');
  check(await page.evaluate('document.getElementById("aggro-ranges-toggle").textContent.includes("H")'), 'The toggle must visibly show its hotkey');
  check(await page.evaluate('document.getElementById("world-canvas").dataset.aggroRanges === "[]"'), 'Ranges start hidden');
  await page.press('Escape');
  await page.waitFor('document.body.dataset.encounterMode === "paused"');
  await page.press('KeyH');
  await page.waitFor('document.getElementById("aggro-ranges-toggle").getAttribute("aria-pressed") === "true"');
  const frozen = await page.evaluate<State>('window.rangeState');
  const ranges = await page.evaluate<Array<{ enemy: string; kind: string; radius: number; x: number; z: number }>>('JSON.parse(document.getElementById("world-canvas").dataset.aggroRanges)');
  check(ranges.length === 5, 'Show direct and help ranges for two hostiles, and only help for the neutral bee');
  for (const range of ranges) {
    const threat = frozen.snapshot.threats.find(threat => threat.id === range.enemy)!;
    check(range.radius === (range.kind === 'direct' ? threat.aggroRange : threat.callForHelpRange), 'Rings must use the server combat radii');
    check(range.x === threat.position.x && range.z === threat.position.z, 'Rings must stay centered on creatures');
  }
  await page.press('KeyH');
  check(await page.evaluate('document.getElementById("world-canvas").dataset.aggroRanges === "[]"'), 'H must hide ranges even while paused');
  await page.click('#pause-resume');
  await page.waitFor('document.body.dataset.encounterMode === "private"');
  await page.click('#aggro-ranges-toggle');
  check(await page.evaluate('!document.getElementById("aggro-ranges-legend").hidden'), 'Clicking the visible control must show the legend');
  check(await page.evaluate('!document.getElementById("aggro-ranges-private").hidden'), 'Private encounters must explain that new enemies cannot join');
  await page.shot('ranges-in-private-encounter');
  await page.press('Enter');
  await page.press('KeyH');
  check(await page.evaluate('document.getElementById("aggro-ranges-toggle").getAttribute("aria-pressed") === "true"'), 'Typing H must not toggle ranges');
  await page.evaluate('document.activeElement.blur()');
  await page.press('KeyH');
  await page.waitFor('document.getElementById("world-canvas").dataset.aggroRanges === "[]"');
  check(page.errors.length === 0, 'No browser exceptions');
  console.log('PASS visible H toggle, distinct authoritative rings, neutral/dead/dormant handling, live call for help, paused/private controls, chat typing', page.output);
} finally {
  await page?.close();
  server.kill('SIGTERM');
  await server.exited;
}
