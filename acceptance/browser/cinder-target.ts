import { createAdventure } from '../../src/game/adventure.js';
import { files } from '../../scripts/public-files.js';
import { check, openBrowser } from './session.js';

// Exercise the real renderer with a frozen shared-world view: the fighter and
// observer occupy different positions while the same server projectile advances.
const base = createAdventure().snapshot;
const scout = base.threats.find(threat => threat.id === 'scout')!;
const snapshot = {
  ...base, phase: 'expedition', player: { ...base.player, position: { x: 4, y: 0, z: 24 }, inCombat: false },
  threats: [{ ...scout, position: { x: -3, y: 0, z: 30 }, targetPosition: { x: -3, y: 0, z: 24 },
    targetPlayerId: 'fighter', aggro: true, fireballs: [{ id: 1, origin: { x: -3, y: 0, z: 30 },
      position: { x: -3, y: 0, z: 28 }, duration: .9, remainingSeconds: .6, damage: 18 }] }],
};
const entry = `${process.cwd()}/build/browser/cinder-target-client.ts`;
await Bun.write(entry, `
import { Object3D } from 'three';
import { createAdventureWorld } from '${process.cwd()}/src/host/adventure-world.ts';
const snapshot = ${JSON.stringify(snapshot)};
const host = document.getElementById('world');
const balls = [];
const add = Object3D.prototype.add;
Object3D.prototype.add = function(...objects) {
  for (const object of objects) {
    if (object.geometry?.type === 'SphereGeometry' && object.geometry.parameters.radius === .23 && object.material?.color?.getHex() === 0xff7c2a)
      balls.push(object);
  }
  return add.apply(this, objects);
};
const world = createAdventureWorld(host, snapshot, undefined, undefined, { selfId: 'observer', selfName: 'Observer', onSelect() {} });
host.append(world.canvas);
world.updatePlayers([{ id: 'fighter', name: 'Fighter', player: { ...snapshot.player, position: { x: -3, y: 0, z: 24 }, inCombat: true } }]);
await world.ready;
window.step = (viewerX, projectileZ, remaining) => {
  snapshot.player.position.x = viewerX;
  snapshot.threats[0].fireballs[0].position.z = projectileZ;
  snapshot.threats[0].fireballs[0].remainingSeconds = remaining;
  // Let the normal follow camera settle before observing the scene.
  for (let frame = 0; frame < 60; frame++) world.render(snapshot, 1 / 60);
  window.renderedBalls = balls.map(ball => ({ x: ball.position.x, y: ball.position.y, z: ball.position.z, visible: ball.visible }));
};
window.step(4, 28, .6);
window.fixtureReady = true;
`);
const bundle = await Bun.build({ entrypoints: [entry], target: 'browser', external: ['three', 'three/addons/*'] });
check(bundle.success, bundle.logs.map(String).join('\n'));
const assets = new Map(files.map(([source, target]) => [`/${target.slice('dist/'.length)}`, source]));
const server = Bun.serve({ hostname: '127.0.0.1', port: 4298, fetch(request) {
  const path = new URL(request.url).pathname;
  if (path === '/') return new Response(`<!doctype html><html><head><style>html,body,#world{margin:0;width:100%;height:100%;overflow:hidden}canvas{display:block}</style><script type="importmap">{"imports":{"three":"/vendor/three.module.js","three/addons/":"/vendor/three-addons/"}}</script></head><body><div id="world"></div><script type="module" src="/fixture.js"></script></body></html>`, { headers: { 'content-type': 'text/html' } });
  if (path === '/fixture.js') return new Response(bundle.outputs[0], { headers: { 'content-type': 'text/javascript' } });
  const source = assets.get(path);
  return source ? new Response(Bun.file(source)) : new Response('Missing', { status: 404 });
} });
Bun.env.GREYWROUGHT_GAME_URL = 'http://127.0.0.1:4298/';
Bun.env.GREYWROUGHT_DEBUG_PORT = '9438';
Bun.env.GREYWROUGHT_VULKAN = '1';
let page: Awaited<ReturnType<typeof openBrowser>> | undefined;
try {
  page = await openBrowser('cinder-target', { localOnly: true });
  await page.waitFor('window.fixtureReady === true', 60000);
  type Ball = { x: number; y: number; z: number; visible: boolean };
  const first = await page.evaluate<Ball>('window.renderedBalls[0]');
  check(first.visible && first.x === -3 && first.z === 28, 'Fireball must occupy the server position while another player fights');
  await page.shot('observer-beside-fighter');
  await page.evaluate('window.step(-10, 28, .6)');
  const moved = await page.evaluate<Ball>('window.renderedBalls[0]');
  check(moved.x === first.x && moved.y === first.y && moved.z === first.z, 'Moving the observer must not redirect the fireball');
  await page.evaluate('window.step(4, 25, .15)');
  const nearing = await page.evaluate<Ball>('window.renderedBalls[0]');
  check(nearing.x === -3 && nearing.z === 25, 'Advancing the server projectile must approach the fighter');
  await page.shot('fireball-near-fighter');
  check(page.errors.length === 0, 'Browser must remain free of errors');
  console.log(`PASS observer movement does not attract the fighter’s fireball; server path renders correctly; ${page.output}`);
} finally {
  await page?.close();
  server.stop(true);
}
