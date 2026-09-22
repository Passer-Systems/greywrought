import { createSharedAdventure } from '../../src/game/adventure.js';
import { createWorldService, type WorldSocketData } from '../../src/server/world-service.js';
import { openBrowser, check } from './session.js';
import type { AdventureSnapshot } from '../../src/game/adventure-types.js';

Bun.env.GREYWROUGHT_GAME_URL = 'http://127.0.0.1:4173/';
Bun.env.GREYWROUGHT_DEBUG_PORT = '9423';
Bun.env.GREYWROUGHT_VULKAN = '1';
const character = { id: 'combat-loop-fixture', name: 'Combat Tester', archetype: 'mage' as const, createdAtMillis: Date.now() };
const token = 'combat-loop-fixture-token-0000000000000000';
const seed = createSharedAdventure(); seed.join(character.id, character.name, character.archetype);
const saved = JSON.parse(seed.save());
Object.assign(saved.characters[0].state, { phase: 'expedition', position: { x: -3, y: 0, z: 28 } });
saved.characters[0].state.combat.phase = 'preparation';
Object.assign(saved.clock, { phase: 'preparation', elapsedSeconds: 0, cycle: 1 });
for (const enemy of saved.world.threats) {
  if (['scout', 'nest', 'patrol'].includes(enemy.id)) {
    const offset = 1;
    const position = enemy.id === 'scout' ? { x: -1, y: 0, z: 30 } : enemy.id === 'nest' ? { x: 0, y: 0, z: 33 } : { x: -5, y: 0, z: 34 };
    Object.assign(enemy, { position, targetPosition: { ...position }, aggro: true, targetPlayerId: character.id, combatants: [character.id], phase: 'preparation', joinCycle: 1, windowCycle: 1, specialOffset: offset, castDuration: offset, remainingSeconds: offset });
    if (enemy.id === 'scout') Object.assign(enemy.head, { ability: 'fireball', opened: true, volley: 2, castVolley: 2 });
  }
  else if (enemy.active) Object.assign(enemy, { health: 0, phase: 'cleared', lootClaimed: true, respawnAt: Date.now() + 3_600_000 });
}
const savePath = process.cwd() + '/build/browser/combat-loop-' + process.pid + '.json';
await Bun.write(savePath, JSON.stringify({ version: 1, accounts: [{ character, tokenHash: new Bun.CryptoHasher('sha256').update(token).digest('hex') }], world: JSON.stringify(saved), chat: [], nextChatId: 1 }));
const service = await createWorldService({ savePath, allowedOrigins: ['http://127.0.0.1:4173'] });
const server = Bun.serve<WorldSocketData>({ hostname: '127.0.0.1', port: 4194, fetch: (request, host) => service.fetch(request, host), websocket: service.websocket });
const page = await openBrowser('combat-loop');
async function checkUnitFrames() {
  await page.waitFor(`(() => {
    const plan = document.getElementById('combat-plan').getBoundingClientRect();
    return ['#player-frame', '.unit-frame-target-group'].every(selector => {
      const frame = document.querySelector(selector), bounds = frame.getBoundingClientRect();
      return frame.checkVisibility() && bounds.width > 0 && bounds.height > 0 && bounds.left >= 0 && bounds.right <= innerWidth
        && bounds.top >= 0 && bounds.bottom <= innerHeight && bounds.bottom <= plan.top - 4;
    });
  })()`);
}
try {
  await page.call('Page.addScriptToEvaluateOnNewDocument', { source: `localStorage.setItem('greywrought/local-profile-v1',${JSON.stringify(JSON.stringify({ version: 1, displayName: 'Combat Test', characters: [character], selectedCharacterId: character.id, savedAtMillis: Date.now() }))});localStorage.setItem('greywrought/world-token',${JSON.stringify(token)});const Native=WebSocket;window.WebSocket=class extends Native{constructor(url,...args){super(String(url).includes('/world')?'ws://127.0.0.1:4194/world':url,...args);this.addEventListener('message',event=>{const d=window.decodeWorldMessage(event);if(d.type==='state')window.combatSnapshot=d.snapshot;});}};` });
  await page.reload();
  await page.waitFor('document.body.dataset.entryRoute==="roster"');
  await page.click('#entry-enter-world');
  await page.waitFor('document.body.dataset.entryRoute==="world"&&document.body.dataset.rigState==="ready"');
  await page.waitFor('document.body.dataset.creatureRigState==="ready"');
  await page.evaluate(`(async () => {
    const { Scene, SkinnedMesh } = await import('three');
    const drawn = new Set();
    window.enemyFrames = [];
    SkinnedMesh.prototype.onBeforeRender = function () {
      for (let root = this; root; root = root.parent) if (root.userData.threatId) drawn.add(root.userData.threatId);
    };
    Scene.prototype.onAfterRender = function () {
      this.traverse(root => {
        if (root.userData.threatId !== 'scout') return;
        let finite = true;
        root.traverse(object => { finite &&= object.matrixWorld.elements.every(Number.isFinite); });
        window.enemyFrames.push({ phase: window.combatSnapshot.combat.phase, finite, drawn: drawn.has('scout') });
      });
      drawn.clear();
    };
  })()`);
  await page.click('.enemy-nameplate[data-enemy-id="scout"] .nameplate-target');
  await page.waitFor('window.combatSnapshot.combat.phase==="preparation"');
  await page.waitFor('document.getElementById("combat-plan")&&!document.getElementById("combat-plan").hidden');
  check(await page.evaluate<number>('window.combatSnapshot.combat.remainingSeconds') <= 30.1, 'Planning window is capped at 30 seconds');
  check(await page.evaluate('document.querySelectorAll(".combat-plan-row").length===2'), 'Planner exposes one Movement and one Action');
  check(await page.evaluate('document.querySelectorAll(".combat-plan-enemy-move").length>=2'), 'Planner shows committed intentions from multiple enemies');
  check(await page.evaluate('window.combatSnapshot.threats.find(enemy=>enemy.id==="scout").windowAction!==null'), 'Watchman has one committed action');
  await checkUnitFrames();
  const planningBefore = await page.evaluate<AdventureSnapshot>('window.combatSnapshot');
  await page.key('KeyS', true); await Bun.sleep(1000); await page.key('KeyS', false);
  const planningAfter = await page.evaluate<AdventureSnapshot>('window.combatSnapshot');
  check(JSON.stringify(planningAfter.player.position) === JSON.stringify(planningBefore.player.position), 'Exploration movement stays locked during planning');
  check(planningAfter.combat.phase === 'preparation' && planningAfter.player.health === planningBefore.player.health, 'Pursuit does not attack during planning');
  for (const id of ['nest', 'patrol']) {
    const before = planningBefore.threats.find(enemy => enemy.id === id)!;
    const after = planningAfter.threats.find(enemy => enemy.id === id)!;
    check(JSON.stringify(after.position) === JSON.stringify(before.position), `${after.name} waits while planning`);
    check(JSON.stringify(after.windowAction) === JSON.stringify(before.windowAction) && after.actionSequence === before.actionSequence, `${after.name} keeps its committed action while planning`);
  }
  await page.click('.adventure-actions [data-action="strike"]');
  await page.waitFor('window.combatSnapshot.combat.queued.length===1');
  await page.call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 10, y: 10, buttons: 0 });
  await page.shot('combat-planning-multiple-enemies');
  check(await page.evaluate('window.enemyFrames.length>0&&window.enemyFrames.every(frame=>frame.finite&&frame.drawn)'), 'Beat 1 enemy keeps a finite pose and is drawn during planning');
  check(await page.evaluate('document.querySelector(".combat-plan-ready").textContent.includes("R")'), 'Ready button shows its R shortcut');
  await page.evaluate('document.getElementById("chat-log-input").focus()');
  await page.press('KeyR'); await Bun.sleep(200);
  check(await page.evaluate('window.combatSnapshot.combat.phase==="preparation"'), 'Typing R in chat does not start combat');
  await page.evaluate('document.getElementById("world-canvas").focus()');
  await page.press('KeyR');
  await page.waitFor('window.combatSnapshot.combat.phase==="active"');
  await checkUnitFrames();
  await page.shot('combat-active-unit-frames');
  const cycle = await page.evaluate<number>('window.combatSnapshot.combat.cycle');
  const before = await page.evaluate<AdventureSnapshot>('window.combatSnapshot');
  await page.key('KeyW', true); await Bun.sleep(500); await page.key('KeyW', false);
  const after = await page.evaluate<AdventureSnapshot>('window.combatSnapshot');
  check(after.player.position.x === before.player.position.x && after.player.position.z === before.player.position.z, 'Manual movement is locked while a sequence resolves');
  await page.click('.adventure-actions [data-action="strike"]');
  check(await page.evaluate<number>('window.combatSnapshot.combat.queued.length') === 1, 'New actions are ignored during execution');
  await page.waitFor(`window.combatSnapshot.combat.phase==="preparation"&&window.combatSnapshot.combat.cycle>${cycle}`, 10000);
  await checkUnitFrames();
  await page.call('Input.dispatchKeyEvent', { type: 'keyDown', code: 'KeyR', key: 'r', windowsVirtualKeyCode: 82, autoRepeat: true });
  await page.key('KeyR', false); await Bun.sleep(200);
  check(await page.evaluate('window.combatSnapshot.combat.phase==="preparation"'), 'Holding R does not ready the next planning cycle');
  await page.shot('combat-loop-ready-and-active');
  check(await page.evaluate('window.enemyFrames.some(frame=>frame.phase==="active")&&window.enemyFrames.every(frame=>frame.finite&&frame.drawn)'), 'Enemy remains drawn through execution and the next planning cycle');
  await page.evaluate(`(async()=>{const {Scene,Vector3}=await import('three');window.combatVector=Vector3;Scene.prototype.onAfterRender=function(renderer,scene,camera){window.combatCamera=camera;};})()`);
  for (let turn=0; turn<16 && await page.evaluate('window.combatSnapshot.player.inCombat'); turn++) {
    await page.click('#combat-plan-aim-move');
    await page.waitFor('JSON.parse(document.getElementById("world-canvas").dataset.moveTiles||"[]").length>0&&window.combatCamera');
    const point=await page.evaluate<{x:number;y:number}>(`(()=>{const tiles=JSON.parse(document.getElementById('world-canvas').dataset.moveTiles),p=tiles.sort((a,b)=>a.z-b.z||Math.abs(a.x)-Math.abs(b.x))[0],v=new window.combatVector(p.x,p.y,p.z).project(window.combatCamera),r=document.getElementById('world-canvas').getBoundingClientRect();return{x:r.left+(v.x+1)*r.width/2,y:r.top+(1-v.y)*r.height/2};})()`);
    await page.call('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',buttons:1,clickCount:1});
    await page.call('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',buttons:0,clickCount:1});
    await page.waitFor('window.combatSnapshot.combat.queued.some(action=>action.action==="bait")');
    await page.press('Digit2');
    const turnNumber=await page.evaluate<number>('window.combatSnapshot.combat.cycle');
    await page.press('KeyR');
    await page.waitFor(`!window.combatSnapshot.player.inCombat||window.combatSnapshot.combat.cycle>${turnNumber}`,10000);
  }
  check(await page.evaluate('!window.combatSnapshot.player.inCombat'), 'Planned retreat ends pursuit');
  await page.click('#bag-open'); await page.click('[data-bag-item="hearthstone"]'); await page.click('#bag-use-hearthstone');
  await page.waitFor('window.combatSnapshot.phase==="town"',8000);
  check(await page.evaluate('window.combatSnapshot.threats.every(enemy=>!enemy.aggro)'), 'Retreating to town ends pursuit');
  check(await page.evaluate('window.combatSnapshot.threats.filter(enemy=>enemy.health>0).every(enemy=>enemy.health===enemy.maximumHealth)'), 'Leashed enemies recover before returning home');
  check(page.errors.length === 0, 'No browser exceptions');
  console.log('PASS visible combat unit frames, R Ready with chat/repeat guards, pursuit, leashing, execution lock, repeat cycle, and enemy visibility', page.output);
} catch (error) { await page.shot('failure'); throw error; }
finally { await page.key('KeyW', false).catch(() => {}); await page.key('KeyS', false).catch(() => {}); await page.close(); await service.close(); server.stop(true); }
