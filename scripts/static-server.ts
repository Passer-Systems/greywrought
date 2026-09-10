import { resolve, sep } from "node:path";
const root = resolve(import.meta.dir, Bun.env.GREYWROUGHT_PREVIEW_DIR ?? "../dist");
const server = Bun.serve({
  hostname: "127.0.0.1", port: Number(Bun.env.GREYWROUGHT_PORT ?? 4180),
  async fetch(request) {
    const url = new URL(request.url);
    const relative = decodeURIComponent(url.pathname).replace(/^\/greywrought(?=\/|$)/, "");
    const path = resolve(root, `.${relative.endsWith("/") ? relative + "index.html" : relative}`);
    if (!path.startsWith(root + sep)) return new Response("Not found", { status: 404 });
    const file = Bun.file(path);
    if (!await file.exists()) return new Response("Not found", { status: 404 });
    if (path === resolve(root, "index.html")) {
      const world = '<meta name="greywrought-world" content="wss://play.greywrought.com/world">';
      return new Response((await file.text()).replace("</head>", world + "</head>"), {
        headers: { "Cache-Control": "no-store", "Content-Type": "text/html" },
      });
    }
    return new Response(file, { headers: { "Cache-Control": "no-store" } });
  },
});
console.log(`Greywrought preview: http://${server.hostname}:${server.port}/`);
