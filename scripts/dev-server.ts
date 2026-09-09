import { watch } from "node:fs";
import { resolve } from "node:path";
import { files } from "./public-files.js";

const root = resolve(import.meta.dir, "..");
const publicFiles = new Map(files.map(([source, target]) => [target.slice("dist/".length), source]));
let revision = 1;
let builtRevision = 0;
let bundle: Blob | undefined;
let buildInFlight: Promise<void> | undefined;
const clients = new Set<ReadableStreamDefaultController<Uint8Array>>();
const encoder = new TextEncoder();
let reloadTimer: ReturnType<typeof setTimeout> | undefined;
const watcher = watch(resolve(root, "src"), { recursive: true }, (_event, filename) => {
  if (!filename || !/\.(ts|css|html)$/.test(filename)) return;
  revision++;
  clearTimeout(reloadTimer);
  reloadTimer = setTimeout(() => {
    for (const client of clients) {
      try { client.enqueue(encoder.encode(`data: ${revision}\n\n`)); }
      catch { clients.delete(client); }
    }
  }, 70);
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

const server = Bun.serve({
  hostname: "127.0.0.1", port: Number(Bun.env.GREYWROUGHT_PORT ?? 4173),
  async fetch(request) {
    const pathname = new URL(request.url).pathname;
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
      return new Response((await file.text()).replace("</body>", `${script}</body>`), { headers: { ...headers, "Content-Type": "text/html" } });
    }
    return new Response(file, { headers });
  },
});
console.log(`Greywrought development: http://${server.hostname}:${server.port}/`);
function stop() { watcher.close(); clearTimeout(reloadTimer); server.stop(true); }
process.on("SIGTERM", () => { stop(); process.exit(0); });
process.on("SIGINT", () => { stop(); process.exit(0); });
