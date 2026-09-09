import { join } from "node:path";

const port = Number.parseInt(Bun.env.GREYWROUGHT_PORT ?? "4173", 10);
const root = join(import.meta.dir, "..");
const mime: Record<string, string> = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml", ".json": "application/json" };
let builtAt = 0;
let buildInFlight: Promise<void> | undefined;
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
    return new Response(file, { headers: { "Content-Type": type, "Cache-Control": "no-store" } });
  },
});
console.log(`Greywrought development server at http://${server.hostname}:${server.port}/`);
