import { watch } from "node:fs";
import { stat } from "node:fs/promises";
import { resolve } from "node:path";
import { files } from "./public-files.js";
import { createWorldService, type WorldSocketData } from "../src/server/world-service.js";

const root = resolve(import.meta.dir, "..");
let publicFiles = new Map(files.map(([source, target]) => [target.slice("dist/".length), source]));
const manifestPath = resolve(root, "scripts/public-files.ts");
let manifestChangedAt = (await stat(manifestPath)).mtimeMs;
let assetRevision = 0;
let loadedAssetRevision = 0;
let manifestRefresh: Promise<void> | undefined;
async function refreshPublicFiles(): Promise<void> {
  const changedAt = (await stat(manifestPath)).mtimeMs;
  const refreshingAssets = assetRevision;
  if (changedAt === manifestChangedAt && refreshingAssets === loadedAssetRevision) return;
  manifestRefresh ??= (async () => {
    const updated: typeof import("./public-files.js") = await import(`./public-files.ts?revision=${changedAt}-${refreshingAssets}`);
    publicFiles = new Map(updated.files.map(([source, target]) => [target.slice("dist/".length), source]));
    manifestChangedAt = changedAt;
    loadedAssetRevision = refreshingAssets;
  })().finally(() => { manifestRefresh = undefined; });
  await manifestRefresh;
}
let revision = 1;
let builtRevision = 0;
let bundle: Blob | undefined;
let buildInFlight: Promise<void> | undefined;
const clients = new Set<ReadableStreamDefaultController<Uint8Array>>();
const encoder = new TextEncoder();
let reloadTimer: ReturnType<typeof setTimeout> | undefined;
function changed(): void {
  revision++;
  clearTimeout(reloadTimer);
  reloadTimer = setTimeout(() => {
    for (const client of clients) {
      try { client.enqueue(encoder.encode(`data: ${revision}\n\n`)); }
      catch { clients.delete(client); }
    }
  }, 70);
}
const watcher = watch(resolve(root, "src"), { recursive: true }, (_event, filename) => {
  if (filename && /\.(ts|css|html)$/.test(filename)) changed();
});
const manifestWatcher = watch(resolve(root, "scripts"), (_event, filename) => {
  if (filename === "public-files.ts") changed();
});
const assetWatcher = watch(resolve(root, "assets"), { recursive: true }, () => {
  assetRevision++;
  changed();
});

async function buildClient(): Promise<void> {
  while (builtRevision !== revision || !bundle) {
    if (buildInFlight) { await buildInFlight; continue; }
    const buildingRevision = revision;
    buildInFlight = (async () => {
      const result = await Bun.build({
        entrypoints: [resolve(root, "src/host/play.ts")], target: "browser",
        external: ["three", "three/addons/*"], sourcemap: "inline",
      });
      if (!result.success) throw new Error(result.logs.map(String).join("\n"));
      const output = result.outputs[0];
      if (!output) throw new Error("Client build produced no output");
      bundle = output;
      builtRevision = buildingRevision;
    })().finally(() => { buildInFlight = undefined; });
    await buildInFlight;
  }
}

const worldService = Bun.env.GREYWROUGHT_LOCAL_WORLD === "1"
  ? await createWorldService({savePath: resolve(root, Bun.env.GREYWROUGHT_WORLD_SAVE ?? "build/local-shared-world.json")})
  : undefined;
const serverOptions = {
  hostname: "127.0.0.1", port: Number(Bun.env.GREYWROUGHT_PORT ?? 4173),
  idleTimeout: 0,
  async fetch(request: Request, server: Bun.Server<WorldSocketData>): Promise<Response | undefined> {
    const pathname = new URL(request.url).pathname;
    if (pathname === "/world" || pathname === "/health") return worldService ? worldService.fetch(request, server) : new Response("Use the shared world", {status:404});
    if (pathname === "/__dev/events") {
      let client: ReadableStreamDefaultController<Uint8Array> | undefined;
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          client = controller;
          clients.add(controller);
          controller.enqueue(encoder.encode(": connected\n\n"));
        },
        cancel() { if (client) clients.delete(client); },
      });
      return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-store" } });
    }
    const relative = pathname === "/" ? "index.html" : pathname.slice(1);
    await refreshPublicFiles();
    const headers = { "Cache-Control": "no-store" };
    if (relative === "app/greywrought/play.js") {
      try {
        await buildClient();
        return new Response(bundle, { headers: { ...headers, "Content-Type": "text/javascript" } });
      } catch (error) {
        console.error(error);
        return new Response(String(error), { status: 500, headers });
      }
    }
    const source = publicFiles.get(relative);
    if (!source) return new Response("Not found", { status: 404 });
    const file = Bun.file(resolve(root, source));
    if (!await file.exists()) return new Response("Not found", { status: 404 });
    if (relative === "index.html") {
      const script = `<script>new EventSource('/__dev/events').onmessage=()=>location.reload()</script>`;
      const worldMeta = worldService ? "" : '<meta name="greywrought-world" content="wss://play.greywrought.com/world">';
      return new Response((await file.text()).replace("</head>", `${worldMeta}</head>`).replace("</body>", `${script}</body>`), { headers: { ...headers, "Content-Type": "text/html" } });
    }
    return new Response(file, { headers });
  },
};
const server = worldService
  ? Bun.serve({...serverOptions, websocket: worldService.websocket})
  : Bun.serve<WorldSocketData>({...serverOptions, async fetch(request, server) {
    return await serverOptions.fetch(request, server) ?? new Response("Not found", {status:404});
  }});
console.log(`Greywrought development: http://${server.hostname}:${server.port}/`);
async function stop() { watcher.close(); manifestWatcher.close(); assetWatcher.close(); clearTimeout(reloadTimer); await worldService?.close(); server.stop(true); }
process.on("SIGTERM", () => { void stop(); });
process.on("SIGINT", () => { void stop(); });
