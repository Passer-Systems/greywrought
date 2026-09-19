import { createSharedAdventure } from '../../src/game/adventure.js';
import { earnedChapter } from '../../src/game/yard-test-fixtures.js';
import { createWorldService, type WorldSocketData } from '../../src/server/world-service.js';
import { check, openBrowser } from './session.js';

Bun.env.GREYWROUGHT_GAME_URL = 'http://127.0.0.1:4295/';
Bun.env.GREYWROUGHT_DEBUG_PORT = '9455';
Bun.env.GREYWROUGHT_VULKAN = '1';
const character = { id: 'ability-range', name: 'Range Walker', archetype: 'warrior' as const, createdAtMillis: 1 };
const token = 'ability-range-fixture-token-000000';
const seed = createSharedAdventure(); seed.join(character.id, character.name, character.archetype);
const saved = JSON.parse(seed.save());
Object.assign(saved.characters[0].state, {
  phase: 'expedition', position: { x: -1, y: 0, z: 5 }, chapter: earnedChapter(2), selectedThreat: 'nest',
});
for (const threat of saved.world.threats) {
  if (threat.id === 'nest') threat.remainingSeconds = 60;
  else if (threat.active) Object.assign(threat, { health: 0, phase: 'cleared', lootClaimed: true, respawnAt: Date.now() + 3_600_000 });
}
const path = `${process.cwd()}/build/browser/ability-range-world-${process.pid}.json`;
await Bun.write(path, JSON.stringify({ version: 1, accounts: [
  { character, tokenHash: new Bun.CryptoHasher('sha256').update(token).digest('hex') },
], world: JSON.stringify(saved), chat: [], nextChatId: 1 }));
const service = await createWorldService({ savePath: path, allowedOrigins: ['http://127.0.0.1:4295'] });
const server = Bun.serve<WorldSocketData>({ hostname: '127.0.0.1', port: 4196, fetch: (request, host) => service.fetch(request, host), websocket: service.websocket });
const frontend = Bun.spawn(['bun', 'scripts/dev-server.ts'], {
  env: { ...Bun.env, GREYWROUGHT_PORT: '4295', GREYWROUGHT_LOCAL_WORLD: '0' },
  stdout: Bun.file('build/browser/ability-range-frontend.log'), stderr: Bun.file('build/browser/ability-range-frontend-errors.log'),
});
let page: Awaited<ReturnType<typeof openBrowser>> | undefined;
const glowing = (action: string) => `document.querySelector('.adventure-actions [data-action="${action}"]').classList.contains('action-in-range')`;
try {
  for (let attempt = 0; attempt < 100; attempt++) {
    try { if ((await fetch(Bun.env.GREYWROUGHT_GAME_URL)).ok) break; } catch {}
    await Bun.sleep(100);
  }
  page = await openBrowser('ability-range', { beforeNavigate: async call => {
    await call('Page.addScriptToEvaluateOnNewDocument', { source: `window.EventSource=class{};
      localStorage.setItem('greywrought/local-profile-v1',${JSON.stringify(JSON.stringify({ version: 1, displayName: 'Range Test', characters: [character], selectedCharacterId: character.id, savedAtMillis: Date.now() }))});
      localStorage.setItem('greywrought/world-token',${JSON.stringify(token)});
      const Native=WebSocket; window.WebSocket=class extends Native {
        constructor(url,...args){super(String(url).includes('/world')?'ws://127.0.0.1:4196/world':url,...args);this.addEventListener('message',event=>{const d=JSON.parse(event.data);if(d.type==='state')window.rangeState=d;});}
      };` });
  } });
  await page.waitFor('document.body.dataset.entryRoute==="roster"'); await page.click('#entry-enter-world');
  await page.waitFor('document.body.dataset.entryRoute==="world"&&document.body.dataset.rigState==="ready"&&document.body.dataset.gameCombatPhase==="idle"');
  check(!await page.evaluate<boolean>(glowing('strike')), 'Distant Sword Strike must not glow');
  check(await page.evaluate<boolean>(`document.querySelector('.adventure-actions [data-action="strike"]').dataset.range==='out'`), 'Distant Sword Strike must be dimmed');
  await page.shot('out-of-reach');
  await page.key('KeyW', true); await page.waitFor(glowing('shove')); await page.key('KeyW', false);
  check(await page.evaluate<boolean>(glowing('finish')), 'Finish must glow inside its 5 metre reach');
  check(await page.evaluate<boolean>(glowing('strike')), 'Sword Strike and melee tools must share 5 metre reach');
  check(await page.evaluate<boolean>(`(()=>{const s=window.rangeState.snapshot,p=s.player.position,t=s.threats.find(t=>t.id==='nest').position,d=Math.hypot(p.x-t.x,p.z-t.z);return d<=5&&d>4.5;})()`), 'Melee glow must begin at the 5 metre boundary');
  check(await page.evaluate<boolean>(`getComputedStyle(document.querySelector('.adventure-actions [data-action="strike"] .action-art')).boxShadow!=='none'`), 'Usable attack must have a visible glow');
  await page.shot('strike-in-reach');
  await page.key('KeyS', true); await page.waitFor(`!${glowing('shove')}`); await page.key('KeyS', false);
  check(!await page.evaluate<boolean>(glowing('strike')), 'Moving away must remove the attack glow');
  await page.key('KeyW', true); await page.waitFor(glowing('strike')); await page.key('KeyW', false);
  await page.click('.adventure-actions [data-action="strike"]');
  await page.waitFor('window.rangeState.snapshot.combat.phase==="preparation"&&window.rangeState.snapshot.combat.queued.some(action=>action.action==="strike")');
  await page.waitFor('document.body.dataset.gameCombatPhase==="preparation"&&document.body.dataset.gameCombatPlan==="true"');
  await page.click('.combat-plan-ready');
  await page.waitFor('document.body.dataset.gameCombatPhase==="active"');
  check(!await page.evaluate<boolean>(glowing('strike')), 'Committed combat must stop showing an actionable attack');
  await page.waitFor('window.rangeState.snapshot.threats.find(t=>t.id==="nest").health<72');
  check(page.errors.length === 0, 'Ability range journey must have no browser exceptions');
  console.log('PASS five metre melee reach, actionable glow, movement updates, and queued attack damage', page.output);
} catch (error) { await page?.shot('failure'); throw error; }
finally { await page?.close(); await service.close(); server.stop(true); frontend.kill(); await frontend.exited; }
