import { copyFile, mkdir, rm } from "node:fs/promises";
import { dirname } from "node:path";

const files: readonly (readonly [string, string])[] = [
  ["src/host/play.html", "dist/index.html"],
  ["src/host/favicon.svg", "dist/favicon.svg"],
  ["src/host/site.webmanifest", "dist/site.webmanifest"],
  ["src/host/rts.css", "dist/app/greywrought-clause/rts.css"],
  ["build/host/play.js", "dist/app/greywrought-clause/play.js"],
  ["build/host/resident-worker.js", "dist/app/greywrought-clause/resident-worker.js"],
  ["build/host/jump-arena-shell/wasm-cartridge-port.js", "dist/app/jump-arena-shell/wasm-cartridge-port.js"],
  ["build/host/jump-arena-shell/workbench.js", "dist/app/jump-arena-shell/workbench.js"],
  ["build/host/wasm/clause_runtime.js", "dist/wasm/clause_runtime.js"],
  ["build/host/wasm/clause_runtime_bg.wasm", "dist/wasm/clause_runtime_bg.wasm"],
  ["build/embodied/embodied-encounter-v1.cwr1.hex", "dist/assets/embodied-encounter-v1.cwr1.hex"],
  ["node_modules/three/build/three.module.js", "dist/vendor/three.module.js"],
  ["node_modules/three/build/three.core.js", "dist/vendor/three.core.js"],
];

await rm("dist", { recursive: true, force: true });
for (const [source, target] of files) {
  await mkdir(dirname(target), { recursive: true });
  if (source.endsWith(".gltf")) {
    const gltf: unknown = JSON.parse(await Bun.file(source).text());
    await Bun.write(target, JSON.stringify(gltf));
  } else {
    await copyFile(source, target);
  }
}
await Bun.write("dist/.nojekyll", "");

console.log(`Static release contains ${files.length + 1} allowlisted files.`);
