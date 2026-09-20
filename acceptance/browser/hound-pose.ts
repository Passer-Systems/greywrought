import { createSharedAdventure } from '../../src/game/adventure.js';
import { createWorldService, type WorldSocketData } from '../../src/server/world-service.js';
import { check, openBrowser } from './session.js';

const url = 'http://127.0.0.1:4323/';
Bun.env.GREYWROUGHT_GAME_URL = url;
Bun.env.GREYWROUGHT_DEBUG_PORT = '9523';
Bun.env.GREYWROUGHT_VULKAN = '1';
const character = { id: 'hound-fixture', name: 'Hound Explorer', archetype: 'hunter' as const, createdAtMillis: Date.now() };
const token = 'hound-fixture-token-000000000000000000';
const seed = createSharedAdventure(); seed.join(character.id, character.name, character.archetype);
const saved = JSON.parse(seed.save());
Object.assign(saved.characters[0].state, { phase: 'expedition', position: { x: -7, y: 0, z: 32 } });
for (const threat of saved.world.threats) {
  if (threat.active && threat.id !== 'patrol') Object.assign(threat, { health: 0, phase: 'cleared', lootClaimed: true, respawnAt: Date.now() + 3_600_000 });
}
const savePath = `${process.cwd()}/build/browser/hound-${process.pid}.json`;
await Bun.write(savePath, JSON.stringify({ version: 1, accounts: [{ character, tokenHash: new Bun.CryptoHasher('sha256').update(token).digest('hex') }], world: JSON.stringify(saved), chat: [], nextChatId: 1 }));
const service = await createWorldService({ savePath, allowedOrigins: [url.slice(0, -1)] });
const server = Bun.serve<WorldSocketData>({ hostname: '127.0.0.1', port: 4324, fetch: (request, host) => service.fetch(request, host), websocket: service.websocket });
const frontend = Bun.spawn(['bun', 'scripts/dev-server.ts'], { env: { ...Bun.env, GREYWROUGHT_PORT: '4323' }, stdout: Bun.file('build/browser/hound-frontend.log'), stderr: Bun.file('build/browser/hound-frontend-errors.log') });
let page: Awaited<ReturnType<typeof openBrowser>> | undefined;
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(url)).ok) break; } catch {} await Bun.sleep(100); }
  page = await openBrowser('hound-pose', { beforeNavigate: async call => {
    await call('Network.enable');
    await call('Network.setBlockedURLs', { urls: [url + '__dev/events'] });
    await call('Page.addScriptToEvaluateOnNewDocument', { source: `localStorage.setItem('greywrought/local-profile-v1',${JSON.stringify(JSON.stringify({ version: 1, displayName: 'Hound Test', characters: [character], selectedCharacterId: character.id, savedAtMillis: Date.now() }))});localStorage.setItem('greywrought/world-token',${JSON.stringify(token)});const Native=WebSocket;window.WebSocket=class extends Native{constructor(url,...args){super(String(url).includes('/world')?'ws://127.0.0.1:4324/world':url,...args);this.addEventListener('message',event=>{const d=JSON.parse(event.data);if(d.type==='state'){window.houndState=d.snapshot;window.houndSession=d.session;}});}};` });
  } });
  const browser = page;
  async function enter() {
    await browser.waitFor('document.body.dataset.entryRoute==="roster"');
    await browser.click('#entry-enter-world');
    await browser.waitFor('document.body.dataset.rigState==="ready"&&document.body.dataset.creatureRigState==="ready"&&document.body.dataset.environmentState==="ready"');
    await browser.evaluate(`(async()=>{const {AnimationMixer}=await import('three');window.houndFrames=[];window.houndTransitions={};const update=AnimationMixer.prototype.update;AnimationMixer.prototype.update=function(delta){const result=update.call(this,delta);for(let root=this.getRoot();root;root=root.parent){if(root.userData.threatId==='patrol'){const action=this._actions.filter(a=>a.enabled&&a.getEffectiveWeight()>.01).sort((a,b)=>b.getEffectiveWeight()-a.getEffectiveWeight())[0];const threat=window.houndState?.threats.find(t=>t.id==='patrol');if(action&&threat){window.houndTransitions[threat.movementMode+':'+action.getClip().name]=this._actions.map(a=>({clip:a.getClip().name,time:a.time,weight:a.getEffectiveWeight(),paused:a.paused,enabled:a.enabled}));window.houndFrames.push({clip:action.getClip().name,time:action.time,paused:action.paused,y:root.position.y,mode:threat.movementMode,phase:window.houndState.combat.phase});if(window.houndFrames.length>1000)window.houndFrames.shift();}break;}}return result;};})()`);
  }
  async function idle(label: string) {
    await browser.waitFor('window.houndState.combat.phase==="preparation"');
    await Bun.sleep(350);
    await browser.evaluate('window.houndFrames=[]');
    await Bun.sleep(550);
    const frames = await browser.evaluate<{clip:string;time:number;paused:boolean;y:number}[]>('window.houndFrames');
    check(frames.length > 2, `${label}: observed hound rendering`);
    check(frames.every(f => f.clip === 'Idle' && !f.paused && Math.abs(f.y) < .05), `${label}: hound waits grounded in a running idle clip; observed ${JSON.stringify(frames.at(-1))}`);
    check(new Set(frames.map(f => f.time.toFixed(3))).size > 2, `${label}: idle animation progresses`);
  }
  async function xpLayout(label: string) {
    const bounds = await browser.evaluate<{xp:DOMRect;actions:DOMRect;hud:DOMRect;width:number;height:number}>(`(()=>{const rect=id=>document.getElementById(id).getBoundingClientRect().toJSON();return {xp:rect('experience-bar'),actions:rect('adventure-actions'),hud:rect('experience-hud'),width:innerWidth,height:innerHeight};})()`);
    check(bounds.xp.top >= bounds.actions.bottom && bounds.xp.top - bounds.actions.bottom <= 8, `${label}: XP immediately below actions`);
    check(Math.abs(bounds.xp.left - bounds.actions.left) < 1 && Math.abs(bounds.xp.width - bounds.actions.width) < 1, `${label}: XP matches action-bar width`);
    check(bounds.hud.bottom <= bounds.height && bounds.hud.left >= 0 && bounds.hud.right <= bounds.width, `${label}: XP and labels fit viewport`);
  }
  await enter();
  check(await page.evaluate('document.querySelector(\'[data-entry-archetype="hunter"] strong\').textContent === "Ranger"'), 'Character creation names the class Ranger');
  await page.click('#equipment-open');
  await page.waitFor('document.getElementById("equipment-panel").open');
  check(await page.evaluate('document.getElementById("equipment-panel").textContent.includes("Ranger")'), 'Existing character shows Ranger in equipment');
  await page.click('#equipment-close');
  await idle('Initial planning');
  await xpLayout('Desktop');
  await page.shot('grounded-planning-xp');
  for (let round = 0; round < 2; round++) {
    const cycle = await page.evaluate<number>('window.houndState.combat.cycle');
    await page.evaluate('window.houndFrames=[]');
    await page.press('KeyR');
    await page.waitFor("window.houndFrames.some(f=>f.clip==='Gallop_Jump')");
    await page.waitFor(`window.houndState.combat.cycle>${cycle}&&window.houndState.combat.phase==='preparation'`);
    check(await page.evaluate("new Set(window.houndFrames.filter(f=>f.clip==='Gallop_Jump').map(f=>f.time.toFixed(3))).size>2"), 'Actual lunge plays through the authored jump');
    await idle(`Planning after lunge ${round + 1}`);
  }
  check(await page.evaluate('window.houndState.player.health<100&&window.houndState.player.health>0'), 'Hound attacks still resolve damage');
  await page.click('#pause-toggle');
  await page.waitFor('window.houndSession.mode==="paused"');
  await page.reload(); await enter();
  await page.waitFor('window.houndSession.mode==="paused"');
  await page.click('#pause-resume');
  await page.waitFor('window.houndSession.mode==="private"');
  await idle('Resumed encounter');
  await page.call('Emulation.setDeviceMetricsOverride', { width: 800, height: 750, deviceScaleFactor: 1, mobile: false });
  await xpLayout('Narrow viewport');
  await page.shot('narrow-xp');
  check(page.errors.length === 0, 'No browser exceptions');
  console.log('PASS grounded animated planning, two authored lunges and recoveries, damage, pause/reload, XP below actions at desktop and narrow sizes', page.output);
} catch (error) {
  console.error('Hound journey state', JSON.stringify(await page?.evaluate('({state:window.houndState,frames:window.houndFrames?.slice(-3),transitions:window.houndTransitions})'),null,2));
  await page?.shot('failure'); throw error;
} finally { await page?.close(); await service.close(); server.stop(true); frontend.kill(); await frontend.exited; }
