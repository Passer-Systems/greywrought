import { createAdventure, createSharedAdventure } from '../../src/game/adventure.js';
import { terrainHeight } from '../../src/game/cave-layout.js';
import { earnedChapter, finishCycle, finishGathering, tap } from '../../src/game/yard-test-fixtures.js';
import type { AdventureSnapshot, Position } from '../../src/game/adventure-types.js';
import { createWorldService, type WorldSocketData } from '../../src/server/world-service.js';
import { check, openBrowser } from './session.js';

const cinder = process.argv.includes('--cinder'), enemyId = cinder ? 'scout' : 'patrol';
const url = 'http://127.0.0.1:4361/';
Bun.env.GREYWROUGHT_GAME_URL = url;
Bun.env.GREYWROUGHT_DEBUG_PORT = '9561';
Bun.env.GREYWROUGHT_VULKAN = '1';
const character = { id: 'timed-combat-fixture', name: 'Timing Explorer', archetype: 'warrior' as const, createdAtMillis: Date.now() };
const token = 'timed-combat-fixture-token-0000000000000000';
const point = (x: number, z: number): Position => ({ x, y: terrainHeight(x, z), z });
const solo = JSON.parse(createAdventure().save());
Object.assign(solo.state, { phase: 'expedition', position: cinder ? point(5, 30) : point(-17.5, 40), chapter: earnedChapter(2), selectedThreat: enemyId });
for (const threat of solo.state.threats) {
  if (threat.active && threat.id !== enemyId) Object.assign(threat, { health: 0, phase: 'cleared', lootClaimed: true, respawnAt: Date.now() + 3_600_000 });
  if (cinder && threat.id === enemyId) {
    Object.assign(threat, { position: point(-5, 30), targetPosition: point(5, 30), turnTarget: point(5, 30), aggro: true, combatants: ['solo'], phase: 'preparation', joinCycle: 1, windowCycle: 1, specialOffset: 1, castDuration: 1, remainingSeconds: 1 });
    Object.assign(threat.head, { opened: false, ability: 'ember-beam' });
  }
}
if (cinder) Object.assign(solo.state.combat, { phase: 'preparation', cycle: 1 });
const prepared = createAdventure({ save: JSON.stringify(solo) });
if (cinder) { tap(prepared, 'brace'); prepared.readyCombat(); finishCycle(prepared); }
else { prepared.selectTarget('patrol'); tap(prepared, 'strike'); prepared.advance(.01); finishGathering(prepared); prepared.clearQueuedActions(); }
const source = JSON.parse(prepared.save());
const seed = createSharedAdventure(); seed.join(character.id, character.name, character.archetype);
const saved = JSON.parse(seed.save());
Object.assign(saved.characters[0].state, { phase: 'expedition', position: source.state.position, chapter: source.state.chapter, selectedThreat: enemyId, combat: source.state.combat });
saved.world.threats = source.state.threats;
Object.assign(saved.clock, source.state.combat);
for (const threat of saved.world.threats) if (threat.aggro) { threat.targetPlayerId = character.id; threat.combatants = [character.id]; }
let savedWorld = JSON.stringify(saved);
if (cinder) {
  // The distant opponent cannot re-aggro after an unoccupied server tick.
  // A real paused encounter preserves the committed rush during asset loading.
  const fixture = createSharedAdventure({ save: savedWorld });
  fixture.join(character.id, character.name, character.archetype);
  check(fixture.pause(character.id), 'Cinder fixture preserves its prepared encounter');
  savedWorld = fixture.save();
}
const savePath = `${process.cwd()}/build/browser/timed-combat-${process.pid}.json`;
await Bun.write(savePath, JSON.stringify({ version: 1, accounts: [{ character, tokenHash: new Bun.CryptoHasher('sha256').update(token).digest('hex') }], world: savedWorld, chat: [], nextChatId: 1 }));
const service = await createWorldService({ savePath, allowedOrigins: [url.slice(0, -1)] });
const server = Bun.serve<WorldSocketData>({ hostname: '127.0.0.1', port: 4362, fetch: (request, host) => service.fetch(request, host), websocket: service.websocket });
const frontend = Bun.spawn([process.execPath, 'scripts/dev-server.ts'], { env: { ...Bun.env, GREYWROUGHT_PORT: '4361', GREYWROUGHT_LOCAL_WORLD: '0' }, stdout: Bun.file(`build/browser/timed-combat-${process.pid}-frontend.log`), stderr: Bun.file(`build/browser/timed-combat-${process.pid}-frontend-errors.log`) });
let page: Awaited<ReturnType<typeof openBrowser>> | undefined;
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(url)).ok) break; } catch {} await Bun.sleep(100); }
  page = await openBrowser(cinder ? 'timed-cinder' : 'timed-dodge', { beforeNavigate: async call => {
    await call('Network.enable'); await call('Network.setBlockedURLs', { urls: [url + '__dev/events'] });
    await call('Page.addScriptToEvaluateOnNewDocument', { source: `
      localStorage.setItem('greywrought/local-profile-v1',${JSON.stringify(JSON.stringify({ version: 1, displayName: 'Timing Explorer', characters: [character], selectedCharacterId: character.id, savedAtMillis: Date.now() }))});
      localStorage.setItem('greywrought/world-token',${JSON.stringify(token)});
      localStorage.setItem('greywrought/combat-auto-ready-v1','true');
      const Native=WebSocket;window.WebSocket=class extends Native{constructor(url,...args){super(String(url).includes('/world')?'ws://127.0.0.1:4362/world':url,...args);this.addEventListener('message',event=>{const d=JSON.parse(event.data);if(d.type==='state'){window.timedSnapshot=d.snapshot;window.timedSession=d.session;(window.timedHistory??=[]).push(d.snapshot);}});}};
    ` });
  } });
  await page.waitFor('document.body.dataset.entryRoute==="roster"');
  await page.click('#entry-enter-world');
  await page.waitFor('document.body.dataset.entryRoute==="world"&&document.body.dataset.rigState==="ready"&&document.body.dataset.creatureRigState==="ready"&&document.body.dataset.environmentState==="ready"');
  if (cinder) {
    await page.waitFor('window.timedSession.mode==="paused"');
    await page.click('#pause-resume');
    await page.waitFor('window.timedSession.mode==="private"');
  }
  await page.evaluate(`(async()=>{const {Scene,Vector3}=await import('three');Scene.prototype.onAfterRender=function(renderer,scene,camera){if(camera.isPerspectiveCamera&&scene.children.some(child=>child.userData.localPlayer))window.timedCamera=camera;};window.timedProject=p=>{const v=new Vector3(p.x,p.y,p.z).project(window.timedCamera),r=document.getElementById('world-canvas').getBoundingClientRect();return {x:r.left+(v.x+1)*r.width/2,y:r.top+(1-v.y)*r.height/2};};})()`);
  await page.waitFor('window.timedCamera&&window.timedSnapshot.combat.phase==="preparation"');
  const initial = await page.evaluate<AdventureSnapshot>('window.timedSnapshot');
  const destination = { ...initial.player.position, z: initial.player.position.z + (cinder ? 2.5 : -2.5) };
  if (!cinder) {
    // Face the backward dodge tile so it is above the character and planner.
    await page.call('Input.dispatchMouseEvent', { type: 'mousePressed', x: 200, y: 180, button: 'right', buttons: 2, clickCount: 1 });
    await page.call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 828, y: 180, button: 'right', buttons: 2 });
    await page.call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 828, y: 180, button: 'right', buttons: 0, clickCount: 1 });
    await Bun.sleep(500);
  }
  check(await page.evaluate(`document.querySelector('.combat-plan-enemy-move[data-threat-id="${enemyId}"] .combat-plan-enemy-behavior').textContent.includes(${JSON.stringify(cinder ? 'locked · rush 1.10s' : 'lock 0.85s · hit 1.50s')})`), 'Enemy intention shows its commitment and strike timing');
  if (cinder) {
    const rush = initial.threats.find(t => t.id === 'scout')!;
    check(rush.currentAbility.id === 'fire-rush' && rush.targetPosition.x > initial.player.position.x && rush.targetPosition.z === initial.player.position.z, 'Fire Rush aims through the actual player to the far side');
    const path = initial.combat.forecast!.paths.find(p => p.action === 'fire-rush')!;
    check(path.points.at(-1)!.x === rush.targetPosition.x, 'Fire Rush forecast uses its committed endpoint');
  }
  await page.click('#combat-plan-aim-move');
  await page.click('#combat-plan-wait-move'); await page.click('#combat-plan-wait-move');
  check(await page.evaluate('document.getElementById("combat-plan-wait-move").dataset.waitTicks==="2"'), 'Two Wait presses select half a second');
  const click = await page.evaluate<{ x: number; y: number }>(`window.timedProject(${JSON.stringify(destination)})`);
  check(await page.evaluate(`document.elementFromPoint(${click.x},${click.y})?.id==='world-canvas'`), 'Dodge destination receives ground input');
  await page.call('Input.dispatchMouseEvent', { type: 'mouseMoved', ...click, buttons: 0 });
  await page.call('Input.dispatchMouseEvent', { type: 'mousePressed', ...click, button: 'left', buttons: 1, clickCount: 1 });
  await page.call('Input.dispatchMouseEvent', { type: 'mouseReleased', ...click, button: 'left', buttons: 0, clickCount: 1 });
  await page.call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 20, y: 20, buttons: 0 });
  await page.waitFor('JSON.parse(document.getElementById("world-canvas").dataset.moveRoute).length===1');
  await page.waitFor('(()=>{const p=JSON.parse(document.getElementById("world-canvas").dataset.movePreview||"null");return p&&!p.pending&&p.forecast;})()');
  const hovered = await page.evaluate<{ forecast: AdventureSnapshot['combat']['forecast'] }>('JSON.parse(document.getElementById("world-canvas").dataset.movePreview)');
  check(Math.abs(hovered.forecast!.paths.find(p => p.action === 'bait')!.beat - .85) < .00001, 'Hover forecast includes the half-second wait');
  await page.click('#combat-plan-finish-move');
  await page.waitFor('window.timedSnapshot.combat.queued.some(e=>e.action==="bait"&&e.waitTicks===2)&&document.body.dataset.baitAiming==="false"');
  await page.click('.adventure-actions [data-action="strike"]');
  await page.waitFor('window.timedSnapshot.combat.queued.some(e=>e.action==="strike")');
  check(await page.evaluate('window.timedSnapshot.combat.phase==="preparation"&&!window.timedSnapshot.combat.ready'), 'Auto-ready waits for explicit action timing');
  const planned = await page.evaluate<AdventureSnapshot>('window.timedSnapshot');
  check(planned.combat.queued.find(e => e.action === 'bait')!.offsetSeconds === .85, 'Authoritative queued movement keeps the wait');
  await page.shot('wait-then-dodge-plan');
  await page.click('.combat-plan-timing[data-timing="after"]');
  await page.waitFor(`window.timedHistory.some(s=>s.combat.cycle===${planned.combat.cycle}&&s.combat.phase==='active')`);
  await page.waitFor(`window.timedSnapshot.combat.cycle>${planned.combat.cycle}&&window.timedSnapshot.combat.phase==='preparation'`);
  const finished = await page.evaluate<AdventureSnapshot>('window.timedSnapshot');
  check(finished.player.health === planned.combat.forecast!.outcomes.find(o => o.id === character.id)!.health, 'Execution health matches the displayed plan');
  check(finished.player.health === 100, 'Waiting for the committed attack then dodging avoids damage');
  check(Math.abs(finished.player.position.z - destination.z) < .001, 'Dodge ends at the planned tile');
  check(await page.evaluate(`window.timedHistory.some(s=>s.combat.cycle===${planned.combat.cycle}&&s.combat.phase==='active'&&s.combat.elapsedSeconds>.4&&s.combat.elapsedSeconds<.8&&Math.abs(s.player.position.z-${initial.player.position.z})<.001)`), 'Player holds position during the queued wait');
  check(await page.evaluate(`window.timedHistory.some(s=>s.combat.cycle===${planned.combat.cycle}&&s.combat.queued.some(e=>e.action==='strike'&&e.status==='executed'))`), 'Action after the delayed movement executes');
  await page.shot('dodged-attack');
  check(page.errors.length === 0, 'No browser errors');
  console.log('PASS timed wait, hover forecast, route submission, action timing, auto-ready and dodge execution', page.output);
} catch (error) { await page?.shot('failure'); throw error; }
finally { await page?.close(); await service.close(); server.stop(true); frontend.kill(); await frontend.exited; }
