import { createAdventure } from '../../src/game/adventure.js';
import { check, openBrowser } from './session.js';

// Exercise the real component and CSS in Chrome, including synchronous layout.
// No world connection, test-only DOM implementation, or added dependency.
const bundle = await Bun.build({ entrypoints: ['src/host/enemy-nameplates.ts'], target: 'browser' });
check(bundle.success && bundle.outputs[0], 'Nameplate module must build');
const server = Bun.serve({ hostname: '127.0.0.1', port: 4395, fetch(request) {
  const path = new URL(request.url).pathname;
  if (path === '/nameplates.js') return new Response(bundle.outputs[0]);
  if (path === '/style.css') return new Response(Bun.file('src/host/cinderwake.css'));
  return new Response('<!doctype html><link rel="stylesheet" href="/style.css"><div id="encounter-status" hidden></div><div id="enemy-intents"></div>', { headers: { 'content-type': 'text/html' } });
} });
Bun.env.GREYWROUGHT_GAME_URL = 'http://127.0.0.1:4395/';
Bun.env.GREYWROUGHT_DEBUG_PORT = '9495';
let page: Awaited<ReturnType<typeof openBrowser>> | undefined;
try {
  page = await openBrowser('nameplate-updates', { localOnly: true });
  const snapshot = createAdventure().snapshot;
  const result = await page.evaluate<{ mutations: number; elapsedMs: number; checks: number }>(`(async () => {
    const { createEnemyNameplates } = await import('/nameplates.js');
    const snapshot = ${JSON.stringify(snapshot)};
    snapshot.player.position = { x: 0, y: 0, z: 0 };
    snapshot.combat.phase = 'active';
    const threats = snapshot.threats.slice(0, 3);
    snapshot.threats = threats;
    for (const [i, threat] of threats.entries()) Object.assign(threat, {
      active: true, health: 90, maximumHealth: 100, aggro: true, block: 0, cast: null,
      position: { x: i, y: 0, z: 1 }, selected: i === 0,
    });
    const host = document.getElementById('enemy-intents');
    const component = createEnemyNameplates(host, snapshot);
    const hidden = new Set(), suppressed = new Map();
    const world = {
      projectThreat(id) { return hidden.has(id) ? null : { x: 250 + threats.findIndex(t => t.id === id) * 300, y: 300, feetY: 330 }; },
      setThreatNameplateVisible(id, value) { suppressed.set(id, value); },
    };
    let clock = performance.now(), checks = 0;
    const nativeNow = performance.now.bind(performance);
    Object.defineProperty(performance, 'now', { configurable: true, value: () => clock });
    const render = () => { clock += 60; component.render(snapshot, world); };
    const assert = (condition, message) => { if (!condition) throw new Error(message); checks++; };
    const plate = host.querySelector('.enemy-nameplate');
    const observer = new MutationObserver(() => {});
    try {
      render();
      observer.observe(host, { subtree: true, attributes: true, childList: true, characterData: true });
      const start = nativeNow();
      for (let i = 0; i < 100; i++) render();
      const elapsedMs = nativeNow() - start;
      const mutations = observer.takeRecords().length;
      assert(mutations === 0, 'Unchanged nameplates must not mutate DOM: ' + mutations);
      threats[0].health = 42; threats[0].selected = false;
      threats[0].block = 12; threats[0].blockSeconds = 1.4;
      threats[0].cast = { ability: threats[0].currentAbility, remainingSeconds: .8, duration: 1, status: 'casting' };
      render();
      assert(plate.querySelector('.nameplate-health-value').textContent === '42 (42%)', 'Health stays current');
      assert(plate.querySelector('.nameplate-target').getAttribute('aria-pressed') === 'false', 'Selection stays accessible');
      assert(!plate.querySelector('.nameplate-shield').hidden, 'Shield becomes visible');
      assert(!plate.querySelector('.enemy-cast-bar').hidden, 'Cast becomes visible');
      assert(plate.querySelector('.enemy-cast-clock').textContent === '0.8s', 'Cast countdown stays current');
      threats[0].cast.remainingSeconds = .3; render();
      assert(plate.querySelector('.enemy-cast-clock').textContent === '0.3s', 'Cast countdown advances');
      hidden.add(threats[0].id); render();
      assert(plate.hidden && suppressed.get(threats[0].id) === false, 'Offscreen plate hides and releases overhead label');
      threats[0].health = 21; render();
      assert(plate.dataset.health === '21', 'Hidden diagnostic attributes stay current');
      hidden.delete(threats[0].id); threats[0].cast = null; render();
      assert(!plate.hidden && plate.querySelector('.nameplate-health-value').textContent === '21 (21%)', 'Returning plate refreshes immediately');
      assert(plate.querySelector('.enemy-cast-bar').hidden, 'Finished cast hides');
      // A newly visible plate must refresh even before the next 50ms content tick.
      hidden.add(threats[0].id); render(); hidden.delete(threats[0].id);
      threats[0].health = 19; clock += 1; component.render(snapshot, world);
      assert(!plate.hidden && plate.querySelector('.nameplate-health-value').textContent === '19 (19%)', 'Visibility return bypasses content throttle');
      host.style.width = '500px'; render();
      const bounds = plate.getBoundingClientRect();
      assert(bounds.left >= 0 && bounds.right <= 500, 'Resize keeps nameplate inside viewport');
      threats[0].position = { x: 36.576, y: 0, z: 0 }; render();
      assert(!plate.hidden && plate.querySelector('.nameplate-name').textContent === threats[0].name && plate.querySelector('.nameplate-health-value').textContent === '19 (19%)', 'Full enemy name and health are visible at exactly 40 yards');
      threats[0].position.x = 36.586; render();
      assert(plate.hidden, 'Nameplate hides beyond 40 yards');
      snapshot.player.position.x = 1; render();
      assert(!plate.hidden, 'Walking back within 40 yards restores name and health');
      threats[0].health = 0; render();
      assert(plate.hidden, 'Dead enemy plate hides');
      return { mutations, elapsedMs, checks };
    } finally { observer.disconnect(); delete performance.now; }
  })()`);
  check(result.checks === 17, 'All freshness and visibility checks must run');
  check(page.errors.length === 0, 'No browser exceptions');
  await Bun.write(`${page.output}/result.json`, JSON.stringify(result, null, 2));
  console.log('PASS nameplate DOM stability, health, selection, shield, casts, visibility and resize', result, page.output);
} finally { await page?.close(); server.stop(true); }
