import { resolve, sep } from "node:path";
const root = resolve(import.meta.dir, "../dist");
const server = Bun.serve({
  hostname: "127.0.0.1", port: Number(Bun.env.GREYWROUGHT_PORT ?? 4180),
  async fetch(request) {
    const url = new URL(request.url);
    const relative = decodeURIComponent(url.pathname).replace(/^\/greywrought(?=\/|$)/, "");
    const path = resolve(root, `.${relative.endsWith("/") ? relative + "index.html" : relative}`);
    if (!path.startsWith(root + sep)) return new Response("Not found", { status: 404 });
    const file = Bun.file(path);
    if (!await file.exists()) return new Response("Not found", { status: 404 });
    return new Response(file, { headers: { "Cache-Control": "no-store" } });
  },
});
console.log(`Greywrought preview: http://${server.hostname}:${server.port}/`);
