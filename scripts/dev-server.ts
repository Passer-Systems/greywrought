import { join } from "node:path";
import { watch } from "node:fs";

const port = Number.parseInt(Bun.env.GREYWROUGHT_PORT ?? "4173", 10);
const root = join(import.meta.dir, "..");
const mime: Record<string, string> = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml", ".json": "application/json" };
let builtAt = 0;
let buildInFlight: Promise<void> | undefined;
const clients = new Set<ReadableStreamDefaultController<Uint8Array>>();
const encoder = new TextEncoder();
watch(join(root, "src/host"), { recursive: true }, (_event, filename) => {
  if (!filename) return;
  builtAt = 0;
  for (const client of clients) client.enqueue(encoder.encode("data: reload\n\n"));
});
async function ensureClientBuild(): Promise<void> {
  const source = Bun.file(join(root, "src/host/play.ts"));
  if ((await source.lastModified) <= builtAt) return;
  if (buildInFlight) return buildInFlight;
  buildInFlight = (async () => {
    const result = await Bun.build({ entrypoints: ["src/host/play.ts"], outdir: "build/host", target: "browser", naming: "play.js", external: ["three", "three/addons/*"] });
    if (!result.success) throw new Error(result.logs.map(String).join("\n"));
    builtAt = await source.lastModified;
  })().finally(() => { buildInFlight = undefined; });
  return buildInFlight;
}

const server = Bun.serve({
  hostname: "127.0.0.1",
  port,
  async fetch(request) {
    const url = new URL(request.url);
    const relative = url.pathname === "/" ? "src/host/play.html" : url.pathname.slice(1);
    if (url.pathname === "/__dev/events") {
      const stream = new ReadableStream<Uint8Array>({ start(controller) { clients.add(controller); }, cancel(controller) { clients.delete(controller); } });
      return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-store", "Connection": "keep-alive" } });
    }
    if (relative.includes("..")) return new Response("Not found", { status: 404 });
    if (relative === "app/greywrought/play.js") {
      try { await ensureClientBuild(); } catch (error) { return new Response(String(error), { status: 500 }); }
    }
    const path = relative === "app/greywrought/play.js"
      ? "build/host/play.js"
      : relative.startsWith("app/") ? `build/${relative}` : relative;
    const file = Bun.file(join(root, path));
    if (!(await file.exists())) return new Response("Not found", { status: 404 });
    const type = mime[path.slice(path.lastIndexOf("."))] ?? file.type;
    if (path === "src/host/play.html") {
      const html = await file.text();
      const live = `<script>new EventSource('/__dev/events').onmessage=()=>location.reload()<\/script>`;
      return new Response(html.replace("</body>", `${live}</body>`), { headers: { "Content-Type": type, "Cache-Control": "no-store" } });
    }
    return new Response(file, { headers: { "Content-Type": type, "Cache-Control": "no-store" } });
  },
});
console.log(`Greywrought development server at http://${server.hostname}:${server.port}/`);
