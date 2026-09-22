import { createSharedAdventure } from '../../src/game/adventure.js';
import { createWorldService, type WorldSocketData } from '../../src/server/world-service.js';
import { openBrowser, check } from './session.js';

interface EnemyFrame {
  readonly cycle: number;
  readonly phase: string;
  readonly ability: string;
  readonly health: number;
  readonly finite: boolean;
  readonly drawn: boolean;
  readonly height: number;
  readonly center: readonly number[];
}

Bun.env.GREYWROUGHT_GAME_URL = 'http://127.0.0.1:4176/';
Bun.env.GREYWROUGHT_DEBUG_PORT = '9446';
Bun.env.GREYWROUGHT_VULKAN = '1';
const character = { id: 'enemy-visibility-fixture', name: 'Visibility Tester', archetype: 'mage' as const, createdAtMillis: Date.now() };
const token = 'enemy-visibility-fixture-token-0000000000000000';
const seed = createSharedAdventure(); seed.join(character.id, character.name, character.archetype);
const saved = JSON.parse(seed.save());
Object.assign(saved.characters[0].state, { phase: 'expedition', position: { x: -3, y: 0, z: 28 } });
saved.characters[0].state.combat.phase = 'preparation';
Object.assign(saved.clock, { phase: 'preparation', elapsedSeconds: 0, cycle: 1 });
for (const enemy of saved.world.threats) {
  if (enemy.id === 'scout') {
    const position = { x: -1, y: 0, z: 30 };
    Object.assign(enemy, { position, targetPosition: { ...position }, aggro: true, targetPlayerId: character.id, combatants: [character.id], phase: 'preparation', joinCycle: 1, windowCycle: 1, specialOffset: 0, castDuration: 0, remainingSeconds: 0 });
  } else if (enemy.active) Object.assign(enemy, { health: 0, phase: 'cleared', lootClaimed: true, respawnAt: Date.now() + 3_600_000 });
}
const savePath = process.cwd() + '/build/browser/enemy-visibility-' + process.pid + '.json';
await Bun.write(savePath, JSON.stringify({ version: 1, accounts: [{ character, tokenHash: new Bun.CryptoHasher('sha256').update(token).digest('hex') }], world: JSON.stringify(saved), chat: [], nextChatId: 1 }));
const service = await createWorldService({ savePath, allowedOrigins: ['http://127.0.0.1:4176'] });
const server = Bun.serve<WorldSocketData>({ hostname: '127.0.0.1', port: 4196, fetch: (request, host) => service.fetch(request, host), websocket: service.websocket });
const page = await openBrowser('enemy-visibility');
try {
  await page.call('Page.addScriptToEvaluateOnNewDocument', { source: `localStorage.setItem('greywrought/local-profile-v1',${JSON.stringify(JSON.stringify({ version: 1, displayName: 'Visibility Test', characters: [character], selectedCharacterId: character.id, savedAtMillis: Date.now() }))});localStorage.setItem('greywrought/world-token',${JSON.stringify(token)});const Native=WebSocket;window.WebSocket=class extends Native{constructor(url,...args){super(String(url).includes('/world')?'ws://127.0.0.1:4196/world':url,...args);this.addEventListener('message',event=>{const d=window.decodeWorldMessage(event);if(d.type==='state')window.combatSnapshot=d.snapshot;});}};` });
  await page.reload();
  await page.waitFor('document.body.dataset.entryRoute==="roster"');
  await page.click('#entry-enter-world');
  await page.waitFor('document.body.dataset.entryRoute==="world"&&document.body.dataset.rigState==="ready"&&document.body.dataset.creatureRigState==="ready"');
  await page.evaluate(`(async () => {
    const { Scene, SkinnedMesh, Box3, Vector3 } = await import('three');
    const drawn = new Set();
    window.enemyFrames = [];
    SkinnedMesh.prototype.onBeforeRender = function () {
      for (let root = this; root; root = root.parent) if (root.userData.threatId) drawn.add(root.userData.threatId);
    };
    Scene.prototype.onAfterRender = function () {
      this.traverse(root => {
        if (root.userData.threatId !== 'scout') return;
        let finite = true;
        const bounds = new Box3();
        root.traverse(object => {
          finite &&= object.matrixWorld.elements.every(Number.isFinite);
          if (object.isSkinnedMesh) bounds.union(new Box3().setFromObject(object, true));
        });
        const threat = window.combatSnapshot.threats.find(enemy=>enemy.id==='scout');
        window.enemyFrames.push({ cycle: window.combatSnapshot.combat.cycle, phase: threat.phase, ability: threat.currentAbility.id, health: threat.health, finite, drawn: drawn.has('scout'), height: bounds.getSize(new Vector3()).y, center: bounds.getCenter(new Vector3()).toArray() });
      });
      drawn.clear();
    };
  })()`);
  for (let cycle = 1; cycle <= 4; cycle++) {
    await page.waitFor('window.combatSnapshot.combat.phase==="preparation"');
    await page.key(cycle % 2 ? 'KeyA' : 'KeyD', true); await Bun.sleep(300); await page.key(cycle % 2 ? 'KeyA' : 'KeyD', false);
    if (cycle === 1) await page.click('.adventure-actions [data-action="strike"]');
    await page.shot(`planning-${cycle}`);
    await page.click('.combat-plan-ready');
    await page.waitFor('window.combatSnapshot.combat.phase==="active"');
    await Bun.sleep(400);
    await page.shot(`active-${cycle}`);
    await page.waitFor(`window.combatSnapshot.combat.phase==="preparation"&&window.combatSnapshot.combat.cycle>${cycle}`, 10000);
  }
  await page.shot('planning-final');
  const frames = await page.evaluate<EnemyFrame[]>('window.enemyFrames');
  await Bun.write(`${page.output}/frames.json`, JSON.stringify(frames));
  const failed = frames.filter(frame => !frame.finite || !frame.drawn || frame.height < 0.4 || !frame.center.every(Number.isFinite));
  console.log(JSON.stringify({ frames: frames.length, phases: [...new Set(frames.map(f=>f.phase))], abilities: [...new Set(frames.map(f=>f.ability))], minimumHeight: Math.min(...frames.map(f=>f.height)), health: [...new Set(frames.map(f=>f.health))], failures: failed.slice(0, 5), output: page.output }));
  check(frames.length > 0 && failed.length === 0, 'Watchman remains finite, drawn, and full-sized through repeated combat cycles');
  check(frames.some(frame => frame.ability === 'ember-beam') && frames.some(frame => frame.ability === 'fireball'), 'Journey includes beam and fireball');
  check(frames.some(frame => frame.health < frames[0]!.health), 'Journey includes a hit reaction');
  check(page.errors.length === 0, 'No browser exceptions');
  console.log('PASS Watchman visibility across four combat cycles');
} catch (error) { await page.shot('failure'); throw error; }
finally { await page.key('KeyA', false).catch(() => {}); await page.key('KeyD', false).catch(() => {}); await page.close(); await service.close(); server.stop(true); }
