import { createSharedAdventure } from '../../src/game/adventure.js';
import { earnedChapter, tap } from '../../src/game/yard-test-fixtures.js';
import { createWorldService, type WorldSocketData } from '../../src/server/world-service.js';
import type { ServerWorldMessage } from '../../src/game/multiplayer-types.js';
import { openBrowser, check } from './session.js';

Bun.env.GREYWROUGHT_GAME_URL = 'http://127.0.0.1:4293/';
Bun.env.GREYWROUGHT_DEBUG_PORT = '9433';
Bun.env.GREYWROUGHT_VULKAN = '1';
const character = { id: 'foreman-recovery', name: 'Roll Keeper', archetype: 'mage' as const, createdAtMillis: 1 };
const token = 'foreman-recovery-fixture-token-000000';
const seed = createSharedAdventure();
seed.join(character.id, character.name, character.archetype);
const saved = JSON.parse(seed.save());
const chapter = earnedChapter(2);
chapter.accepted.push('last-shift');
chapter.equipment = { chest: 'insulated-coat', mainhand: 'yard-weapon' };
Object.assign(saved.characters[0].state, {
  phase: 'expedition', position: { x: 2, y: 0, z: 58.5 }, chapter, cargo: 12,
});
for (const threat of saved.world.threats) if (threat.id !== 'ritual-guardian') {
  Object.assign(threat, { health: 0, phase: 'cleared', lootClaimed: true, respawnAt: Date.now() + 3_600_000 });
}
const world = createSharedAdventure({ save: JSON.stringify(saved) });
const player = world.join(character.id, character.name, character.archetype);
tap(player, 'ritual');
world.advance(1.1);
player.selectTarget('ritual-guardian');
check(world.pause(character.id), 'Summoned fight must fork');
const forked = JSON.parse(world.save());
const privateGuardian = forked.instances[0].world.threats.find((threat: { id: string }) => threat.id === 'ritual-guardian');
privateGuardian.health = 1;
// Reproduce the abandoned shared summon written by releases before this fix.
const abandoned = forked.world.threats.find((threat: { id: string }) => threat.id === 'ritual-guardian');
Object.assign(abandoned, { active: true, health: 200, phase: 'dormant', aggro: false, contributors: [], combatants: [], targetPlayerId: null });
forked.world.ritualCalled = true;
const path = `${process.cwd()}/build/browser/foreman-recovery-${process.pid}.json`;
await Bun.write(path, JSON.stringify({ version: 1, accounts: [
  { character, tokenHash: new Bun.CryptoHasher('sha256').update(token).digest('hex') },
], world: JSON.stringify(forked), chat: [], nextChatId: 1 }));
const service = await createWorldService({ savePath: path, allowedOrigins: ['http://127.0.0.1:4293'] });
const server = Bun.serve<WorldSocketData>({ hostname: '127.0.0.1', port: 4199, fetch: (request, host) => service.fetch(request, host), websocket: service.websocket });
const frontend = Bun.spawn(['bun', 'scripts/dev-server.ts'], {
  env: { ...Bun.env, GREYWROUGHT_PORT: '4293', GREYWROUGHT_LOCAL_WORLD: '0' },
  stdout: Bun.file('build/browser/foreman-frontend.log'), stderr: Bun.file('build/browser/foreman-frontend-errors.log'),
});
type State = Extract<ServerWorldMessage, { type: 'state' }>;
let page: Awaited<ReturnType<typeof openBrowser>> | undefined;
try {
  for (let attempt = 0; attempt < 100; attempt++) {
    try { if ((await fetch(Bun.env.GREYWROUGHT_GAME_URL)).ok) break; } catch {}
    await Bun.sleep(100);
  }
  page = await openBrowser('foreman-recovery', { beforeNavigate: async call => {
    await call('Page.addScriptToEvaluateOnNewDocument', { source: `window.EventSource=class{};
      localStorage.setItem('greywrought/local-profile-v1',${JSON.stringify(JSON.stringify({ version: 1, displayName: 'Recovery Test', characters: [character], selectedCharacterId: character.id, savedAtMillis: Date.now() }))});
      localStorage.setItem('greywrought/world-token',${JSON.stringify(token)});
      const Native=WebSocket;
      window.WebSocket=class extends Native{
        constructor(url,...args){super(String(url).includes('/world')?'ws://127.0.0.1:4199/world':url,...args);this.addEventListener('message',event=>{const d=JSON.parse(event.data);if(d.type==='state')window.recoveryState=d;});}
      };` });
  } });
  await page.waitFor('document.body.dataset.entryRoute==="roster"');
  await page.click('#entry-enter-world');
  await page.waitFor('document.body.dataset.entryRoute==="world"&&document.body.dataset.rigState==="ready"');
  await page.waitFor('document.body.dataset.encounterMode==="paused"');
  check(await page.evaluate<boolean>('window.recoveryState.snapshot.player.inCombat'), 'Restored private Foreman must retain combat');
  await page.click('#pause-resume');
  await page.waitFor('document.body.dataset.encounterMode==="private"&&document.body.dataset.gameCombatPhase==="preparation"');
  await page.click('.adventure-actions [data-action="strike"]');
  await page.click('.combat-plan-ready');
  await page.waitFor('window.recoveryState.snapshot.threats.find(t=>t.id==="ritual-guardian").health===0', 15000);
  const finished = await page.evaluate<State>('window.recoveryState');
  check(finished.session.canRejoin, 'Private Foreman kill must allow rejoining');
  check(finished.snapshot.carriedRelics === 0 && !finished.snapshot.loot.some(loot => loot.available), 'Private kill must not award the quest roll');
  await page.click('#encounter-rejoin');
  await page.waitFor('document.body.dataset.encounterMode==="shared"');
  const rejoined = await page.evaluate<State>('window.recoveryState');
  check(!rejoined.snapshot.ritualCalled && !rejoined.snapshot.player.inCombat, 'Abandoned shared Foreman must be dormant');
  check(rejoined.snapshot.cargo === 6, 'Rejoining must retain the six remaining crystals');
  await page.waitFor('document.getElementById("route-detail").textContent.includes("offer six carried crystals")');
  await page.shot('ready-to-summon-again');
  await page.press('KeyR');
  await page.waitFor('window.recoveryState.snapshot.ritualCalled&&window.recoveryState.snapshot.cargo===0');
  const summoned = await page.evaluate<State>('window.recoveryState');
  const foreman = summoned.snapshot.threats.find(threat => threat.id === 'ritual-guardian')!;
  check(foreman.health === foreman.maximumHealth && foreman.aggro, 'Crystals must summon a fresh shared Foreman fight');
  check(summoned.snapshot.quests.find(quest => quest.id === 'last-shift')?.status === 'active', 'The final quest must remain available to complete');
  await page.shot('foreman-summoned-again');
  check(page.errors.length === 0, 'No browser exceptions');
  console.log('PASS saved abandoned summon recovery, private Foreman kill, rejoin, quest guidance, and crystal resummon', page.output);
} catch (error) { await page?.shot('failure'); throw error; }
finally { await page?.close(); await service.close(); server.stop(true); frontend.kill(); await frontend.exited; }
