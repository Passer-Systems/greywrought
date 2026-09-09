import { resolve } from 'node:path';
import { createWorldService } from '../src/server/world-service.js';

const service = await createWorldService({
  savePath: resolve(Bun.env.GREYWROUGHT_WORLD_SAVE ?? `${import.meta.dir}/../build/shared-world.json`),
  allowedOrigins: (Bun.env.GREYWROUGHT_WORLD_ORIGINS ?? 'https://play.greywrought.com').split(',').filter(Boolean),
});
const server = Bun.serve({
  hostname: '127.0.0.1', port: Number(Bun.env.GREYWROUGHT_WORLD_PORT ?? 4181),
  websocket: service.websocket,
  fetch(request, server) {
    if (new URL(request.url).pathname === '/world') return service.fetch(request, server);
    return service.fetch(request, server) ?? new Response('Not found', { status: 404 });
  },
});
console.log(`Shared world listening on ${server.url}`);
let stopping = false;
async function stop(): Promise<void> {
  if (stopping) return;
  stopping = true;
  try { await service.close(); server.stop(true); }
  catch { console.error('Shared world could not finish saving.'); server.stop(true); process.exitCode = 1; }
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
