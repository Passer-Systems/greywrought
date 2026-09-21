import { mkdir } from 'node:fs/promises';
import { files } from '../../scripts/public-files.js';
import { actorAssets } from '../../src/art/actor-catalog.js';
import { openBrowser, check } from './session.js';

const url = 'http://127.0.0.1:4295/';
Bun.env.GREYWROUGHT_GAME_URL = url;
Bun.env.GREYWROUGHT_DEBUG_PORT = '9457';
await mkdir('build/browser', { recursive: true });
const bundle = await Bun.build({ entrypoints: ['acceptance/browser/art-viewer.ts'], target: 'browser', external: ['three', 'three/addons/*'] });
check(bundle.success && bundle.outputs[0], 'Art viewer builds');
await Bun.write('build/browser/art-viewer.js', bundle.outputs[0]);
const routes = new Map(files.map(([source, target]) => ['/' + target.slice(5), Bun.env.GREYWROUGHT_TEST_BUILT === '1' ? target : source]));
const server = Bun.serve({ hostname: '127.0.0.1', port: 4295, async fetch(request) {
  const path = new URL(request.url).pathname;
  if (path === '/') return new Response(`<!doctype html><html><head><style>body{background:#18292b;color:#f6ead2;display:flex;flex-wrap:wrap;font:14px system-ui}figure{margin:8px}figcaption{text-align:center}</style><script type="importmap">{"imports":{"three":"/vendor/three.module.js","three/addons/":"/vendor/three-addons/"}}</script></head><body><script type="module" src="/art-viewer.js"></script></body></html>`, { headers: { 'content-type': 'text/html' } });
  if (path === '/art-viewer.js') return new Response(Bun.file('build/browser/art-viewer.js'), { headers: { 'content-type': 'text/javascript' } });
  const source = routes.get(path);
  return source ? new Response(Bun.file(source)) : new Response('Not found', { status: 404 });
} });
let page: Awaited<ReturnType<typeof openBrowser>> | undefined;
try {
  page = await openBrowser('art');
  await page.waitFor('document.body.dataset.artState==="passed"', 90000);
  const results = await page.evaluate<{ name: string; clips: number }[]>('JSON.parse(document.body.dataset.results)');
  check(results.length === Object.keys(actorAssets).length, 'Every registered actor was rendered and animated');
  check(page.errors.length === 0, 'No browser exceptions');
  await page.call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1200, deviceScaleFactor: 1, mobile: false });
  await page.shot('actors');
  await Bun.write(`${page.output}/results.json`, JSON.stringify(results, null, 2));
  console.log(`PASS ${results.length} actor models: loaded, rendered, and all native animation clips sampled — ${page.output}`);
} finally { await page?.close(); server.stop(true); }
