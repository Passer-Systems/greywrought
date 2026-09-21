import { createWorldService, type WorldSocketData } from '../../src/server/world-service.js';

const service = await createWorldService({ savePath: Bun.argv[2]! });
const server = Bun.serve<WorldSocketData>({
  hostname: '127.0.0.1', port: 4302, websocket: service.websocket,
  fetch(request, host) {
    if (new URL(request.url).pathname === '/metrics') return Response.json({ cpu: process.cpuUsage(), memory: process.memoryUsage(), uptime: process.uptime() });
    return service.fetch(request, host);
  },
});
process.on('SIGTERM', async () => { await service.close(); server.stop(true); process.exit(0); });
console.log('READY');
