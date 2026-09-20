import { mkdir } from "node:fs/promises";
await mkdir('build/warden-viewer',{recursive:true});
const built=await Bun.build({entrypoints:['scripts/art/warden-viewer.ts'],outdir:'build/warden-viewer',target:'browser',external:['three','three/addons/*']});
if(!built.success)throw new Error(built.logs.map(String).join('\n'));
const html=`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Relic Warden · Surface study</title>
<style>*{box-sizing:border-box}body{margin:0;background:#252a2d;color:#e5e0d4;font:13px/1.5 system-ui}header{position:absolute;left:30px;top:20px;pointer-events:none}h1{font:26px Georgia,serif;margin:0}header p{color:#b9b8ac;font-size:11px;letter-spacing:2px;text-transform:uppercase}main{height:calc(100vh - 115px)}canvas{display:block}footer{height:115px;padding:14px 30px;border-top:1px solid #535755;background:#202628}nav{display:flex;gap:8px;flex-wrap:wrap}button,select{font:12px system-ui;color:inherit;background:#30393b;border:1px solid #69716e;border-radius:3px;padding:7px 12px;cursor:pointer}button[aria-pressed=true]{background:#71644a}footer p{margin:10px 0 0;color:#b9b8ac}button:focus-visible,select:focus-visible{outline:2px solid #e3bd7b}</style>
<script type="importmap">{"imports":{"three":"/vendor/three.module.js","three/addons/":"/vendor/addons/"}}</script>
<header><h1>Relic Warden</h1><p>Surface study · Greywrought</p></header><main></main><footer><nav>
<button data-view="three-quarter">Three-quarter</button><button data-view="front">Front</button><button data-view="side">Side</button><button data-view="back">Back</button>
<button id="clay" aria-pressed="false">Plain clay</button><button id="equipment" aria-pressed="true">Equipment</button><button id="wire" aria-pressed="false">Topology</button><button id="old" aria-pressed="false">Earlier blockout</button>
<select aria-label="Animation"></select><button id="pause">Pause</button></nav><p id="status">Loading…</p></footer><script type="module" src="/viewer.js"></script></html>`;
const server=Bun.serve({hostname:'127.0.0.1',port:Number(Bun.env.GREYWROUGHT_ART_PORT??4190),fetch(request){
  const path=new URL(request.url).pathname;
  if(path==='/')return new Response(html,{headers:{'Content-Type':'text/html'}});
  const fixed:Record<string,string>={'/viewer.js':'build/warden-viewer/warden-viewer.js','/warden.glb':'3d/relic-warden-study/relic-warden.glb','/warden-runtime.glb':'3d/relic-warden-study/relic-warden-runtime.glb','/earlier.glb':'3d/greywrought-relics/relic-warden.glb','/vendor/three.module.js':'node_modules/three/build/three.module.js','/vendor/three.core.js':'node_modules/three/build/three.core.js'};
  const file=fixed[path]??(path.startsWith('/vendor/addons/')&&!path.includes('..')?'node_modules/three/examples/jsm/'+path.slice(15):undefined);
  return file?new Response(Bun.file(file)):new Response('Not found',{status:404});
}});
console.log(`Warden inspection: ${server.url}`);
