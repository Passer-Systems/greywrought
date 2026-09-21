import { check, openBrowser } from './session.js';
import { EXPANDED_WORLD_BOUNDS } from '../../src/game/world-regions.js';

const port = 4478;
Object.assign(Bun.env, { GREYWROUGHT_GAME_URL: `http://127.0.0.1:${port}/`, GREYWROUGHT_DEBUG_PORT: '9678', GREYWROUGHT_VULKAN: '1' });
const frontend = Bun.spawn([process.execPath, Bun.env.GREYWROUGHT_TEST_BUILT === '1' ? 'scripts/static-server.ts' : 'scripts/dev-server.ts'], {
  env: { ...Bun.env, GREYWROUGHT_PORT: String(port), GREYWROUGHT_LOCAL_WORLD: '1', GREYWROUGHT_WORLD_SAVE: `build/browser/map-movement-world-${process.pid}.json` },
  stdout: Bun.file('build/browser/map-movement-frontend.log'), stderr: Bun.file('build/browser/map-movement-frontend-errors.log'),
});
let page: Awaited<ReturnType<typeof openBrowser>> | undefined;
const companions: WebSocket[] = [];
async function companion(id: string) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/world`); companions.push(socket);
  await new Promise<void>((resolve, reject) => {
    socket.onopen = () => socket.send(JSON.stringify({ type: 'join', token: crypto.randomUUID(), character: { id, name: id === 'map-friend' ? 'Map Friend' : 'Stranger', archetype: 'warrior', createdAtMillis: 1 } }));
    socket.onmessage = event => { if (JSON.parse(String(event.data)).type === 'state') resolve(); };
    socket.onerror = () => reject(new Error('Companion could not join'));
  });
  let sequence = 0;
  return { socket, command(command: import('../../src/game/multiplayer-types.js').WorldCommand) { socket.send(JSON.stringify({ type: 'command', sequence: ++sequence, command })); } };
}
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(Bun.env.GREYWROUGHT_GAME_URL!)).ok) break; } catch {} await Bun.sleep(100); }
  page = await openBrowser('map-movement', { localOnly: true, beforeNavigate: async call => {
    await call('Page.addScriptToEvaluateOnNewDocument', { source: `window.EventSource=class{};const Native=WebSocket;window.WebSocket=class extends Native{constructor(...args){super(...args);this.addEventListener('message',event=>{const message=JSON.parse(event.data);if(message.type==='state')window.mapState=message;});}};` });
  } });
  await page.enter();
  await page.key('KeyA', true);
  await page.waitFor('window.mapState.snapshot.player.position.x>0.4');
  await page.press('KeyM');
  await page.waitFor('document.getElementById("world-map-panel").open');
  const openedX = await page.evaluate<number>('window.mapState.snapshot.player.position.x');
  const openedLeft = await page.evaluate<number>('parseFloat(document.getElementById("world-map-player").style.left)');
  await page.waitFor(`window.mapState.snapshot.player.position.x>${openedX}+1`);
  check(await page.evaluate(`parseFloat(document.getElementById("world-map-player").style.left)<${openedLeft}`), 'Strafing left while facing north moves left on the atlas');
  await page.key('KeyA', false);
  await page.waitFor('!window.mapState.snapshot.player.moving');
  const releasedX = await page.evaluate<number>('window.mapState.snapshot.player.position.x');
  await page.key('KeyD', true);
  await page.waitFor(`window.mapState.snapshot.player.position.x<${releasedX}-1`);
  await page.key('KeyD', false);
  await page.waitFor('!window.mapState.snapshot.player.moving');
  const clicked = await page.evaluate<{x: number; y: number}>('(()=>{const s=document.getElementById("world-map-sheet"),r=s.getBoundingClientRect(),e=new MouseEvent("click",{bubbles:true,clientX:r.left+r.width/4,clientY:r.top+r.height/4});s.dispatchEvent(e);return {x:(e.clientX-r.left)/r.width,y:(e.clientY-r.top)/r.height};})()');
  const expectedX = EXPANDED_WORLD_BOUNDS.maxX - (EXPANDED_WORLD_BOUNDS.maxX - EXPANDED_WORLD_BOUNDS.minX) * clicked.x;
  const expectedZ = EXPANDED_WORLD_BOUNDS.maxZ - (EXPANDED_WORLD_BOUNDS.maxZ - EXPANDED_WORLD_BOUNDS.minZ) * clicked.y;
  check(await page.evaluate(`(()=>{const p=document.getElementById("world-map-panel");return Math.abs(Number(p.dataset.waypointX)-${expectedX})<0.01&&Math.abs(Number(p.dataset.waypointZ)-${expectedZ})<0.01;})()`), 'Atlas clicks invert the north-up map coordinates');
  await page.click('.atlas-point[data-place="yard"]');
  check(await page.evaluate<boolean>('document.getElementById("world-map-panel").dataset.waypointX==="0"'), 'Map clicks still mark destinations');
  check(await page.evaluate<boolean>('Number(getComputedStyle(document.getElementById("world-map-panel")).opacity)===0.92'), 'Map defaults to subtle translucency');
  check(await page.evaluate<boolean>('window.mapState.session.mode==="shared"&&document.getElementById("pause-panel").hidden'), 'Moving with the map does not pause the encounter');
  await page.shot('moving-map');
  await page.press('Escape');
  check(await page.evaluate<boolean>('!document.getElementById("world-map-panel").open&&document.getElementById("pause-panel").hidden'), 'Escape closes only the map');
  await page.press('KeyM'); await page.press('KeyM');
  check(await page.evaluate<boolean>('!document.getElementById("world-map-panel").open'), 'M toggles the map closed');
  await page.press('Escape');
  await page.waitFor('!document.getElementById("pause-panel").hidden');
  await page.key('KeyA', true); await Bun.sleep(250); await page.key('KeyA', false);
  check(await page.evaluate<boolean>('!window.mapState.snapshot.player.moving'), 'Escape menu continues to block movement');
  await page.press('Escape');
  const friend = await companion('map-friend'); await companion('map-stranger');
  const selfId = await page.evaluate<string>('JSON.parse(localStorage.getItem("greywrought/local-profile-v1")).selectedCharacterId');
  friend.command({ type: 'partyInvite', playerId: selfId });
  await page.waitFor('!document.getElementById("party-invite").hidden');
  await page.click('#party-invite [data-party-command="accept"]');
  await page.waitFor('document.querySelector(".map-party[data-player-id=map-friend]")!==null');
  check(await page.evaluate<boolean>('document.querySelectorAll(".map-party").length===1&&!document.querySelector(".map-party[data-player-id=map-stranger]")'), 'Only party members have minimap arrows');
  const beforeLeft = await page.evaluate<number>('parseFloat(document.querySelector(".map-party").style.left)');
  friend.command({ type: 'camera', x: 1, z: 0 });
  friend.command({ type: 'action', action: 'forward', pressed: true });
  await page.waitFor(`parseFloat(document.querySelector('.map-party').style.left)<${beforeLeft}-3`);
  friend.command({ type: 'action', action: 'forward', pressed: false });
  check(await page.evaluate<boolean>('(()=>{const m=new DOMMatrix(getComputedStyle(document.querySelector(".map-party")).transform);return Math.abs(Math.atan2(m.b,m.a)+Math.PI/2)<0.00001;})()'), 'Party heading points left when moving toward world +X');
  await page.press('Enter');
  await page.call('Input.insertText', { text: '/p Follow me to the gate.' });
  await page.press('Enter');
  await page.waitFor('document.querySelector(".log-party")?.textContent.includes("[Party]")');
  check(await page.evaluate('getComputedStyle(document.querySelector(".log-party")).color==="rgb(112, 183, 255)"'), 'Party messages appear in blue');
  const beforeTop = await page.evaluate<number>('parseFloat(document.querySelector(".map-party").style.top)');
  friend.command({ type: 'camera', x: 0, z: -1 });
  friend.command({ type: 'action', action: 'forward', pressed: true });
  await page.waitFor(`parseFloat(document.querySelector('.map-party').style.top)>${beforeTop}+3`);
  check(await page.evaluate<boolean>('Math.abs(Math.atan2(new DOMMatrix(getComputedStyle(document.querySelector(".map-party")).transform).b,new DOMMatrix(getComputedStyle(document.querySelector(".map-party")).transform).a)-Math.PI)<0.00001'), 'Nearby party arrows show heading');
  await page.waitFor('document.querySelector(".map-party").dataset.edge==="true"', 12000);
  friend.command({ type: 'action', action: 'forward', pressed: false });
  check(await page.evaluate<boolean>('(()=>{const m=document.querySelector(".map-party"),r=document.getElementById("map-field").getBoundingClientRect();return parseFloat(m.style.top)===94&&Math.abs(r.width-r.height)<1;})()'), 'Distant member stays at the square map edge');
  await page.shot('party-minimap');
  await page.click('[data-party-member="map-friend"]');
  await page.press('Enter');
  await page.call('Input.insertText', { text: '/follow' });
  await page.press('Enter');
  const followZ = await page.evaluate<number>('window.mapState.snapshot.player.position.z');
  await page.waitFor(`window.mapState.snapshot.player.position.z<${followZ}-1`);
  await page.key('KeyA', true); await page.key('KeyA', false);
  await page.waitFor('!window.mapState.snapshot.player.moving');
  const stoppedZ = await page.evaluate<number>('window.mapState.snapshot.player.position.z');
  await Bun.sleep(250);
  check(await page.evaluate(`Math.abs(window.mapState.snapshot.player.position.z-(${stoppedZ}))<0.1`), 'Manual movement cancels follow');
  await page.evaluate('document.querySelector("[data-party-member=map-friend]").dispatchEvent(new MouseEvent("contextmenu",{bubbles:true,clientX:120,clientY:180}))');
  await page.click('[data-party-command="follow"]');
  await page.waitFor(`window.mapState.snapshot.player.position.z<${stoppedZ}-1`);
  await page.key('KeyA', true); await page.key('KeyA', false);
  friend.socket.close();
  await page.waitFor('document.querySelectorAll(".map-party").length===0');
  check(page.errors.length === 0, 'Map journey has no browser exceptions');
  console.log('PASS map movement and translucency; blue party chat; slash and menu follow; moving party arrows and edge indicators; square minimap', page.output);
} catch (error) { await page?.shot('failure'); throw error; }
finally { for (const socket of companions) socket.close(); await page?.key('KeyA', false).catch(() => {}); await page?.key('KeyD', false).catch(() => {}); await page?.close(); frontend.kill(); await frontend.exited; }
