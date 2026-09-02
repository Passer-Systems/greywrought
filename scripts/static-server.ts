import { join } from "node:path";

const port = Number.parseInt(Bun.env.GREYWROUGHT_STATIC_PORT ?? "4180", 10);
const prefix = "/greywrought/";
const root = join(import.meta.dir, "..", "dist");

const server = Bun.serve({
  hostname: "127.0.0.1",
  port,
  async fetch(request) {
    const pathname = new URL(request.url).pathname;
    if (!pathname.startsWith(prefix)) return new Response("Not found", { status: 404 });
    const relative = pathname.slice(prefix.length) || "index.html";
    if (relative.includes("..")) return new Response("Not found", { status: 404 });
    const file = Bun.file(join(root, relative));
    if (!(await file.exists())) return new Response("Not found", { status: 404 });
    return new Response(file);
  },
});

console.log(`Greywrought static release at http://${server.hostname}:${server.port}${prefix}`);
