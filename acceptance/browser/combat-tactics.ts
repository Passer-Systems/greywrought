import { createSharedAdventure } from '../../src/game/adventure.js';
import { createWorldService, type WorldSocketData } from '../../src/server/world-service.js';
import { openBrowser, check } from './session.js';
import type { AdventureSnapshot, Position } from '../../src/game/adventure-types.js';

Bun.env.GREYWROUGHT_GAME_URL = 'http://127.0.0.1:4173/';
Bun.env.GREYWROUGHT_DEBUG_PORT = '9425';
Bun.env.GREYWROUGHT_VULKAN = '1';
const character = { id: 'combat-tactics-fixture', name: 'Roadside Tester', archetype: 'warrior' as const, createdAtMillis: Date.now() };
const token = 'combat-tactics-fixture-token-0000000000000000';
const seed = createSharedAdventure(); seed.join(character.id, character.name, character.archetype);
const saved = JSON.parse(seed.save());
Object.assign(saved.characters[0].state, { phase: 'expedition', position: { x: -3, y: 0, z: 35 } });
saved.characters[0].state.combat.phase = 'preparation';
Object.assign(saved.clock, { phase: 'preparation', elapsedSeconds: 0, cycle: 1 });
for (const enemy of saved.world.threats) {
  if (['scout', 'nest', 'patrol'].includes(enemy.id)) {
    const offset = enemy.id === 'patrol' ? 1 : 2;
    const position = enemy.id === 'scout' ? { x: -4, y: 0, z: 32 } : enemy.id === 'nest' ? { x: 0, y: 0, z: 35 } : { x: -6, y: 0, z: 36 };
    Object.assign(enemy, { position, targetPosition: { ...position }, aggro: true, targetPlayerId: character.id, combatants: [character.id], phase: 'preparation', joinCycle: 1, windowCycle: 1, specialOffset: offset, castDuration: offset, remainingSeconds: offset, comboOpened: true });
    if (enemy.id === 'scout') Object.assign(enemy.head, { ability: 'fireball', opened: true });
  } else if (enemy.active) Object.assign(enemy, { health: 0, phase: 'cleared', lootClaimed: true, respawnAt: Date.now() + 3_600_000 });
}
const savePath = process.cwd() + '/build/browser/combat-tactics-' + process.pid + '.json';
await Bun.write(savePath, JSON.stringify({ version: 1, accounts: [{ character, tokenHash: new Bun.CryptoHasher('sha256').update(token).digest('hex') }], world: JSON.stringify(saved), chat: [], nextChatId: 1 }));
const service = await createWorldService({ savePath, allowedOrigins: ['http://127.0.0.1:4173'] });
const server = Bun.serve<WorldSocketData>({ hostname: '127.0.0.1', port: 4195, fetch: (request, host) => service.fetch(request, host), websocket: service.websocket });
const page = await openBrowser('combat-tactics');
async function groundClick(destination: Position) {
  const point = await page.evaluate<{ x: number; y: number; top: string }>(`(() => {
    const point = new window.tacticsVector(${destination.x}, 0, ${destination.z}).project(window.tacticsCamera);
    const rect = document.getElementById('world-canvas').getBoundingClientRect();
    const x = rect.left + (point.x + 1) * rect.width / 2, y = rect.top + (1 - point.y) * rect.height / 2;
    return {x, y, top: document.elementFromPoint(x,y)?.id};
  })()`);
  check(point.top === 'world-canvas', 'Bait ground destination is visible and receives the click: ' + JSON.stringify(point));
  await page.call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x, y: point.y, buttons: 0 });
  await page.call('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', buttons: 1, clickCount: 1 });
  await page.call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', buttons: 0, clickCount: 1 });
}
try {
  await page.call('Page.addScriptToEvaluateOnNewDocument', { source: `localStorage.setItem('greywrought/local-profile-v1',${JSON.stringify(JSON.stringify({ version: 1, displayName: 'Tactics Test', characters: [character], selectedCharacterId: character.id, savedAtMillis: Date.now() }))});localStorage.setItem('greywrought/world-token',${JSON.stringify(token)});const Native=WebSocket;window.WebSocket=class extends Native{constructor(url,...args){super(String(url).includes('/world')?'ws://127.0.0.1:4195/world':url,...args);this.addEventListener('message',event=>{const d=JSON.parse(event.data);if(d.type==='state'){window.combatSnapshot=d.snapshot;(window.tacticsHistory??=[]).push(d.snapshot);}});}};` });
  await page.reload();
  await page.waitFor('document.body.dataset.entryRoute==="roster"');
  await page.evaluate(`(async () => {const {Scene,Vector3}=await import('three');window.tacticsVector=Vector3;Scene.prototype.onAfterRender=function(renderer,scene,camera){window.tacticsCamera=camera;};})()`);
  await page.click('#entry-enter-world');
  await page.waitFor('document.body.dataset.entryRoute==="world"&&document.body.dataset.rigState==="ready"&&document.body.dataset.creatureRigState==="ready"&&window.tacticsCamera');
  check(await page.evaluate('JSON.parse(document.getElementById("world-canvas").dataset.telegraphs).length===0'), 'Default battlefield has no persistent attack warnings');
  check(await page.evaluate('document.querySelectorAll(".enemy-nameplate .enemy-cast-bar:not([hidden])").length===0'), 'Planning does not duplicate intentions in floating cast bars');
  check(await page.evaluate('["strike","brace","bait"].every(action=>{const button=document.querySelector(`[data-action="${action}"]`);return button&&!button.disabled&&button.querySelector(".action-label");})'), 'Action bar exposes only Attack, Defend and Move');
  await page.press('Digit3');
  await page.waitFor('document.body.dataset.baitAiming==="true"');
  await page.press('Escape');
  check(await page.evaluate('document.body.dataset.baitAiming==="false"&&document.getElementById("pause-panel").hidden'), 'Escape cancels Bait without pausing');
  const initial = await page.evaluate<AdventureSnapshot>('window.combatSnapshot');
  const hound = initial.threats.find(enemy => enemy.id === 'patrol')!, bee = initial.threats.find(enemy => enemy.id === 'nest')!;
  const length = Math.hypot(bee.position.x - hound.position.x, bee.position.z - hound.position.z);
  const destination = { x: bee.position.x + (bee.position.x - hound.position.x) / length * 1.4, y: 0, z: bee.position.z + (bee.position.z - hound.position.z) / length * 1.4 };
  await page.press('Digit3'); await groundClick(destination);
  await page.waitFor('window.combatSnapshot.combat.queued.some(move=>move.action==="bait")');
  await page.click('.enemy-nameplate[data-enemy-id="patrol"] .nameplate-target');
  await page.press('Digit1');
  await page.waitFor('window.combatSnapshot.combat.queued.some(move=>move.action==="strike")');
  await page.click('.combat-plan-timing[data-timing="after"]');
  await page.press('Digit2');
  await page.click('.combat-plan-timing[data-timing="during"]');
  await page.waitFor('window.combatSnapshot.combat.queued.length===2&&window.combatSnapshot.combat.queued.some(move=>move.action==="brace"&&move.timing==="during")');
  await page.click('.combat-plan-enemy-move[data-threat-id="patrol"]');
  await page.waitFor('JSON.parse(document.getElementById("world-canvas").dataset.telegraphs).some(item=>item.enemy==="patrol")');
  await page.call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 20, y: 20, buttons: 0 });
  check(await page.evaluate('JSON.parse(document.getElementById("world-canvas").dataset.telegraphs).some(item=>item.enemy==="patrol")'), 'Clicked intention keeps its path after pointer leaves');
  await page.shot('roadside-plan');
  const planned = await page.evaluate<AdventureSnapshot>('window.combatSnapshot');
  await Bun.write(page.output + '/forecast.json', JSON.stringify(planned.combat.forecast, null, 2));
  check(planned.combat.forecast?.events.some(event => event.kind === 'collision'), 'Plan predicts an enemy collision');
  const health = planned.player.health;
  await page.press('KeyR');
  await page.waitFor('window.combatSnapshot.combat.phase==="active"');
  await page.waitFor('JSON.parse(document.getElementById("world-canvas").dataset.telegraphs).length===0');
  await page.waitFor('window.tacticsHistory.some(s=>s.combat.hazards.length>0)', 8000);
  await page.shot('spilled-swarm');
  await page.waitFor(`window.combatSnapshot.combat.cycle>${planned.combat.cycle}`, 8000);
  const final = await page.evaluate<AdventureSnapshot>('window.combatSnapshot');
  await Bun.write(page.output + '/result.json', JSON.stringify(final, null, 2));
  check(await page.evaluate('window.tacticsHistory.some(s=>s.log.some(event=>event.text.includes("collides")))'), 'Enemy collision resolves in the actual networked fight');
  check(await page.evaluate('window.tacticsHistory.some(s=>s.combat.effects.some(effect=>effect.kind==="ignition"))'), 'Watchman ignites the interrupted bee swarm');
  check(final.threats.find(enemy => enemy.id === 'patrol')!.health < initial.threats.find(enemy=>enemy.id==='patrol')!.health, 'Collision damages the hound');
  check(final.player.health >= health - 40, 'Planned Block keeps the chain reaction survivable');
  check(final.player.health === planned.combat.forecast!.outcomes.find(outcome => outcome.id === character.id)!.health, 'Predicted player health agrees with actual networked playback');
  check(page.errors.length === 0, 'No browser exceptions');
  await page.shot('roadside-result');
  console.log('PASS Bait ground click, existing bar migration, Escape cancel, intention preview pin/clear, R playback, collision, swarm interruption, Attack, ignition', page.output);
} catch (error) { await page.shot('failure'); throw error; }
finally { await page.close(); await service.close(); server.stop(true); }
