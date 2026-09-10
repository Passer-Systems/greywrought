import { resolve, sep } from "node:path";
import { createWorldService, type WorldSocketData } from "../src/server/world-service.js";

const root = resolve(import.meta.dir, Bun.env.GREYWROUGHT_PREVIEW_DIR ?? "../dist");
if (!await Bun.file(resolve(root, "index.html")).exists()) {
  console.error(`Greywrought cannot start: ${resolve(root, "index.html")} is missing. Run bun run build in the Greywrought checkout first, then retry.`);
  process.exit(1);
}
const worldService = Bun.env.GREYWROUGHT_LOCAL_WORLD === "1"
  ? await createWorldService({savePath: resolve(import.meta.dir, "..", Bun.env.GREYWROUGHT_WORLD_SAVE ?? "build/demo-shared-world.json")})
  : undefined;
const serverOptions = {
  hostname: "127.0.0.1", port: Number(Bun.env.GREYWROUGHT_PORT ?? 4180),
  idleTimeout: 0,
  async fetch(request: Request, server: Bun.Server<WorldSocketData>): Promise<Response | undefined> {
    const url = new URL(request.url);
    if (url.pathname === "/world" || url.pathname === "/health") return worldService ? worldService.fetch(request, server) : new Response("Use the shared world", {status:404});
    const relative = decodeURIComponent(url.pathname).replace(/^\/greywrought(?=\/|$)/, "");
    const path = resolve(root, `.${relative.endsWith("/") ? relative + "index.html" : relative}`);
    if (!path.startsWith(root + sep)) return new Response("Not found", { status: 404 });
    const file = Bun.file(path);
    if (!await file.exists()) return new Response("Not found", { status: 404 });
    if (path === resolve(root, "index.html")) {
      const world = worldService ? "" : '<meta name="greywrought-world" content="wss://play.greywrought.com/world">';
      return new Response((await file.text()).replace("</head>", world + "</head>"), {
        headers: { "Cache-Control": "no-store", "Content-Type": "text/html" },
      });
    }
    return new Response(file, { headers: { "Cache-Control": "no-store" } });
  },
};
const server = worldService
  ? Bun.serve({...serverOptions, websocket: worldService.websocket})
  : Bun.serve<WorldSocketData>({...serverOptions, async fetch(request, server) {
    return await serverOptions.fetch(request, server) ?? new Response("Not found", {status:404});
  }});
console.log(`Greywrought ${worldService ? "offline demo" : "preview"}: http://${server.hostname}:${server.port}/`);
let stopping = false;
async function stop(): Promise<void> {
  if (stopping) return;
  stopping = true;
  try { await worldService?.close(); server.stop(true); }
  catch { console.error("Greywrought could not finish saving."); server.stop(true); process.exitCode = 1; }
}
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
