import { join } from "node:path";

const port = Number.parseInt(Bun.env.GREYWROUGHT_PORT ?? "4173", 10);
const root = join(import.meta.dir, "..");
const mime: Record<string, string> = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml", ".json": "application/json" };

const server = Bun.serve({
  hostname: "127.0.0.1",
  port,
  async fetch(request) {
    const url = new URL(request.url);
    const relative = url.pathname === "/" ? "src/host/play.html" : url.pathname.slice(1);
    if (relative.includes("..")) return new Response("Not found", { status: 404 });
    const path = relative.startsWith("app/") ? `build/${relative}` : relative;
    const file = Bun.file(join(root, path));
    if (!(await file.exists())) return new Response("Not found", { status: 404 });
    const type = mime[path.slice(path.lastIndexOf("."))] ?? file.type;
    return new Response(file, { headers: { "Content-Type": type, "Cache-Control": "no-store" } });
  },
});
console.log(`Greywrought development server at http://${server.hostname}:${server.port}/`);
