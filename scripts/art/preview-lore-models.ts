import { files } from "../public-files.js";
import { mkdir } from "node:fs/promises";

await mkdir("build/relic-gallery", { recursive: true });
const build = await Bun.build({ entrypoints: ["scripts/art/relic-gallery.ts"], outdir: "build/relic-gallery", target: "browser", external: ["three", "three/addons/*"] });
if (!build.success) throw new Error(build.logs.map(String).join("\n"));
const page = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Greywrought · Relic machines</title>
<style>*{box-sizing:border-box}body{margin:0;background:#171f23;color:#e2d5b8;font:14px Georgia,serif}header{padding:22px 32px 0;position:absolute;z-index:2;pointer-events:none}h1{font-size:27px;letter-spacing:6px;margin:0 0 8px}header p{color:#a7aca5;font:11px system-ui;letter-spacing:3px;text-transform:uppercase}main{height:calc(100vh - 150px);min-height:340px}canvas{display:block}footer{padding:16px 32px;border-top:1px solid #4c514a;background:#1c2427;min-height:150px}h2{margin:0 0 7px;font-size:21px;font-weight:400}#description{font:12px/1.6 system-ui;color:#aeb6b1;max-width:1050px;margin:0 0 14px}nav{display:flex;gap:8px;flex-wrap:wrap}button,select{border:1px solid #62675b;background:#293335;color:#e6d7b3;padding:8px 12px;cursor:pointer;font:12px system-ui}button:hover{background:#404a45}select{margin-left:auto}button:focus-visible,select:focus-visible{outline:2px solid #dbb66c}@media(max-width:700px){main{height:65vh}footer{padding:15px}header{padding:15px}h1{font-size:20px}}</style>
<script type="importmap">{"imports":{"three":"/vendor/three.module.js","three/addons/":"/vendor/three-addons/"}}</script>
<header><h1>GREYWROUGHT</h1><p>Relic machines · The old world still serves</p></header><main></main><footer><h2>Loading relic machines…</h2><p id="description"></p><nav><button id="all">All four</button><select aria-label="Animation"></select><button id="pause">Pause</button></nav></footer><script type="module" src="/gallery.js"></script></html>`;
const routes = new Map(files.map(([source, target]) => ["/" + target.slice(5), source]));
routes.set("/vendor/three-addons/controls/OrbitControls.js", "node_modules/three/examples/jsm/controls/OrbitControls.js");
const server = Bun.serve({ hostname: "127.0.0.1", port: Number(Bun.env.GREYWROUGHT_ART_PORT ?? 4185), fetch(request) {
  const path = new URL(request.url).pathname;
  if (path === "/") return new Response(page, { headers: { "Content-Type": "text/html" } });
  if (path === "/gallery.js") return new Response(Bun.file("build/relic-gallery/relic-gallery.js"));
  const model = path.slice(8);
  const source = path.startsWith("/models/") && /^(hollow-saint|relic-warden|hearth-keeper|greyrot-penitent)\.glb$/.test(model)
    ? `3d/greywrought-relics/${model}`
    : path.startsWith("/models/") ? routes.get("/assets/greywrought/relics/" + model) : routes.get(path);
  return source ? new Response(Bun.file(source)) : new Response("Not found", { status: 404 });
} });
console.log(`Relic gallery: ${server.url}`);
