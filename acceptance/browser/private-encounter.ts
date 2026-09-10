import { createSharedAdventure } from '../../src/game/adventure.js';
import { earnedChapter } from '../../src/game/yard-test-fixtures.js';
import { createWorldService, type WorldSocketData } from '../../src/server/world-service.js';
import type { ServerWorldMessage, WorldCommand } from '../../src/game/multiplayer-types.js';
import { openBrowser, check } from './session.js';

Bun.env.GREYWROUGHT_GAME_URL = 'http://127.0.0.1:4290/';
Bun.env.GREYWROUGHT_DEBUG_PORT = '9425';
Bun.env.GREYWROUGHT_VULKAN = '1';
const character = { id: 'private-fixture', name: 'Pause Tester', archetype: 'mage' as const, createdAtMillis: 1 };
const observer = { id: 'shared-observer', name: 'Bram', archetype: 'warrior' as const, createdAtMillis: 2 };
const token = 'private-fixture-token-00000000000000000';
const observerToken = 'shared-observer-token-00000000000000000';
const seed = createSharedAdventure();
seed.join(character.id, character.name, character.archetype);
seed.join(observer.id, observer.name, observer.archetype);
const saved = JSON.parse(seed.save());
const chapter = earnedChapter(2); chapter.equipment.chest = 'insulated-coat';
Object.assign(saved.characters[0].state, { phase: 'expedition', position: { x: -3, y: 0, z: 8 }, chapter, health: 60, potions: 1 });
Object.assign(saved.characters[1].state, { position: { x: 0, y: 0, z: -8 } });
for (const enemy of saved.world.threats) {
  if (enemy.id === 'scout') { enemy.health = 35; enemy.position = { x: -3, y: 0, z: 13 }; }
  else if (enemy.active) Object.assign(enemy, { health: 0, phase: 'cleared', lootClaimed: true, respawnAt: Date.now() + 3_600_000 });
}
const path = process.cwd() + '/build/browser/private-' + process.pid + '.json';
await Bun.write(path, JSON.stringify({ version: 1, accounts: [
  { character, tokenHash: new Bun.CryptoHasher('sha256').update(token).digest('hex') },
  { character: observer, tokenHash: new Bun.CryptoHasher('sha256').update(observerToken).digest('hex') },
], world: JSON.stringify(saved), chat: [], nextChatId: 1 }));
let service = await createWorldService({ savePath: path, allowedOrigins: ['http://127.0.0.1:4290'] });
const listen = () => Bun.serve<WorldSocketData>({ hostname: '127.0.0.1', port: 4196, fetch: (request, host) => service.fetch(request, host), websocket: service.websocket });
let server = listen();
const frontend = Bun.spawn(['bun', 'scripts/dev-server.ts'], {
  env: { ...Bun.env, GREYWROUGHT_PORT: '4290', GREYWROUGHT_LOCAL_WORLD: '0' },
  stdout: Bun.file('build/browser/private-frontend.log'), stderr: Bun.file('build/browser/private-frontend-errors.log'),
});
for (let attempt = 0; attempt < 100; attempt++) {
  try { if ((await fetch(Bun.env.GREYWROUGHT_GAME_URL)).ok) break; } catch {}
  await Bun.sleep(100);
}
type State = Extract<ServerWorldMessage, { type: 'state' }>;
let observed: State | undefined, sequence = 0;
let socket: WebSocket;
async function connectObserver(): Promise<void> {
  sequence = 0;
  socket = new WebSocket('ws://127.0.0.1:4196/world');
  socket.onmessage = event => { const state = JSON.parse(String(event.data)) as ServerWorldMessage; if (state.type === 'state') observed = state; };
  await new Promise<void>(resolve => { socket.onopen = () => { socket.send(JSON.stringify({ type: 'join', token: observerToken, character: observer })); resolve(); }; });
}
const command = (command: WorldCommand) => socket.send(JSON.stringify({ type: 'command', sequence: ++sequence, command }));
await connectObserver();
const page = await openBrowser('private-encounter');
try {
  await page.call('Page.addScriptToEvaluateOnNewDocument', { source: `window.EventSource=class{};
    localStorage.setItem('greywrought/local-profile-v1',${JSON.stringify(JSON.stringify({ version: 1, displayName: 'Pause Test', characters: [character], selectedCharacterId: character.id, savedAtMillis: Date.now() }))});
    localStorage.setItem('greywrought/world-token',${JSON.stringify(token)});
    const Native=WebSocket;
    window.WebSocket=class extends Native{
      constructor(url,...args){super(String(url).includes('/world')?'ws://127.0.0.1:4196/world':url,...args);window.encounterSocket=this;this.addEventListener('message',event=>{const d=JSON.parse(event.data);if(d.type==='state')window.encounterState=d;});}
      set onmessage(handler){super.onmessage=event=>{if(!this.dropIncoming)handler.call(this,event);};}
    };` });
  await page.reload();
  await page.waitFor('document.body.dataset.entryRoute==="roster"');
  await page.click('#entry-enter-world');
  await page.waitFor('document.body.dataset.entryRoute==="world"&&document.body.dataset.rigState==="ready"');
  await page.waitFor('window.encounterState.snapshot.threats.find(t=>t.id==="scout").cast!==null');
  await page.evaluate('window.encounterSocket.close()');
  await page.waitFor('document.body.dataset.gamePersistence==="disconnected"');
  await page.waitFor('document.body.dataset.encounterMode==="paused"&&!document.getElementById("pause-panel").hidden');
  const frozen = await page.evaluate<State>('window.encounterState');
  const privateId = frozen.session.id;
  const frozenEnemy = frozen.snapshot.threats.find(t => t.id === 'scout')!;
  check(frozenEnemy.aggro && frozenEnemy.cast !== null, 'Private copy must preserve the engaged enemy and cast');
  check(frozen.snapshot.player.inCombat, 'Paused encounter must retain combat membership');
  check(await page.evaluate<boolean>('document.getElementById("player-combat-status").textContent==="In combat"'), 'Player frame must show the active combat state');
  check(frozen.players.length === 0, 'Private encounter must exclude other players');
  check(await page.evaluate<boolean>('document.getElementById("encounter-rejoin").disabled'), 'Cannot rejoin while combat remains');
  const observerX = observed!.snapshot.player.position.x;
  command({type:'camera',x:1,z:0}); command({type:'action',action:'forward',pressed:true});
  await page.key('KeyW', true);
  await Bun.sleep(650);
  await page.key('KeyW', false);
  command({type:'action',action:'forward',pressed:false});
  check(observed!.snapshot.player.position.x > observerX + 1, 'Main player must keep moving while private encounter is paused');
  check(!observed!.players.some(p=>p.id===character.id), 'Paused player must leave the shared world');
  const still = await page.evaluate<State>('window.encounterState');
  check(JSON.stringify(still.snapshot) === JSON.stringify(frozen.snapshot), 'Paused HP, warning, resources and movement must remain frozen');
  const homeDeadline = performance.now() + 5000;
  while (performance.now() < homeDeadline && observed!.snapshot.threats.find(t => t.id === 'scout')!.phase === 'returning') await Bun.sleep(50);
  const mainEnemy = observed!.snapshot.threats.find(t => t.id === 'scout')!;
  check(!mainEnemy.aggro && mainEnemy.health === mainEnemy.maximumHealth && mainEnemy.phase === 'patrol', 'The unopposed main-world enemy must finish returning home');
  await page.shot('paused-live-cast');
  await page.evaluate('window.encounterSocket.close()');
  await page.waitFor('document.body.dataset.gamePersistence==="disconnected"');
  await page.waitFor('document.body.dataset.gamePersistence==="server"&&document.body.dataset.encounterMode==="paused"');
  check((await page.evaluate<State>('window.encounterState')).snapshot.player.health === frozen.snapshot.player.health, 'Reconnect cannot resume or damage the paused character');
  check((await page.evaluate<State>('window.encounterState')).session.id === privateId, 'Repeated disconnect must retain the same private zone');
  await page.shot('reconnected-still-paused');
  await service.close();
  server.stop(true);
  await page.waitFor('document.body.dataset.gamePersistence==="disconnected"');
  service = await createWorldService({ savePath: path, allowedOrigins: ['http://127.0.0.1:4290'] });
  server = listen();
  await connectObserver();
  await page.waitFor('document.body.dataset.gamePersistence==="server"&&document.body.dataset.encounterMode==="paused"');
  const restarted = await page.evaluate<State>('window.encounterState');
  check(restarted.session.id === privateId, 'Server restart must preserve private zone identity');
  check(restarted.snapshot.player.health === frozen.snapshot.player.health && restarted.snapshot.potions === frozen.snapshot.potions, 'Server restart must preserve health and supplies');
  check(restarted.snapshot.threats.find(t => t.id === 'scout')!.cast!.remainingSeconds === frozenEnemy.cast!.remainingSeconds, 'Server restart must preserve the frozen attack');
  await page.evaluate('window.encounterSocket.dropIncoming = true');
  await page.waitFor('document.body.dataset.gamePersistence==="disconnected"', 5000);
  await page.waitFor('document.body.dataset.gamePersistence==="server"&&document.body.dataset.encounterMode==="paused"');
  check((await page.evaluate<State>('window.encounterState')).session.id === privateId, 'A silent connection must recover into the same paused zone');
  // The observer also returns paused after a restart and explicitly rejoins.
  command({ type: 'rejoin' });
  await page.click('#pause-resume');
  await page.waitFor('document.body.dataset.encounterMode==="private"&&document.body.dataset.gamePaused==="false"');
  await page.click('#encounter-pause');
  await page.waitFor('document.body.dataset.encounterMode==="paused"');
  const repeated = await page.evaluate<State>('window.encounterState');
  await Bun.sleep(250);
  check((await page.evaluate<State>('window.encounterState')).snapshot.threats.find(t=>t.id==='scout')!.cast!.remainingSeconds === repeated.snapshot.threats.find(t=>t.id==='scout')!.cast!.remainingSeconds, 'A resumed encounter must pause again without advancing its cast');
  await page.click('#pause-resume');
  await page.waitFor('document.body.dataset.encounterMode==="private"&&document.body.dataset.gamePaused==="false"');
  await page.click('.adventure-actions [data-action="drinkPotion"]');
  await page.waitFor('window.encounterState.snapshot.potions===0');
  await page.press('Digit1');
  await page.waitFor('window.encounterState.snapshot.threats.find(t=>t.id==="scout").health===0', 15000);
  const finished = await page.evaluate<State>('window.encounterState');
  check(finished.session.canRejoin, 'Ending combat must allow rejoin');
  check(!finished.snapshot.player.inCombat, 'Final enemy death must end combat');
  check(await page.evaluate<boolean>('document.getElementById("player-combat-status").textContent==="Out of combat"'), 'Player frame must show when combat ends');
  check(finished.snapshot.carriedSalvage === frozen.snapshot.carriedSalvage && finished.snapshot.cargo === frozen.snapshot.cargo, 'Private kill must grant no resource rewards');
  check(JSON.stringify(finished.snapshot.progression) === JSON.stringify(frozen.snapshot.progression), 'Private combat cannot award progression');
  check(!finished.snapshot.loot.some(loot => loot.available), 'Private corpses cannot be looted');
  check(finished.snapshot.threats.find(t=>t.id==='nest')!.health===0, 'Forking cannot resurrect unrelated enemies');
  await page.shot('private-combat-finished');
  await page.click('#encounter-rejoin');
  await page.waitFor('document.body.dataset.encounterMode==="shared"');
  const rejoined = await page.evaluate<State>('window.encounterState');
  check(rejoined.snapshot.potions === 0 && rejoined.snapshot.player.health === finished.snapshot.player.health, 'Rejoin must retain potion use and remaining health');
  check(Math.hypot(rejoined.snapshot.player.position.x-frozen.snapshot.player.position.x,rejoined.snapshot.player.position.z-frozen.snapshot.player.position.z)<3, 'Rejoin must return near original position');
  check(rejoined.snapshot.threats.find(t=>t.id==='scout')!.health > 0, 'Private kill cannot kill the main-world enemy');
  check(rejoined.players.some(p=>p.id===observer.id), 'Rejoin restores main-world visibility');
  const oldPosition = rejoined.snapshot.player.position;
  await page.key('KeyS',true); await Bun.sleep(500); await page.key('KeyS',false);
  await page.waitFor(`Math.hypot(window.encounterState.snapshot.player.position.x-(${oldPosition.x}),window.encounterState.snapshot.player.position.z-(${oldPosition.z}))>.5`);
  await page.shot('rejoined-and-moving');
  check(page.errors.length===0,'No browser exceptions');
  console.log('PASS active disconnect, frozen private zone, main enemy return, repeated reconnect, server restart, silent connection recovery, explicit resume, no rewards, potion/HP retained, rejoin movement',page.output);
} catch(error) { await page.shot('failure'); throw error; }
finally { await page.close(); socket!.close(); await service.close(); server.stop(true); frontend.kill(); await frontend.exited; }
