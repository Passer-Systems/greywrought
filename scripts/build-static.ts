import { copyFile, mkdir, rm } from "node:fs/promises";
import { dirname } from "node:path";
import { createHash } from "node:crypto";

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
const assetRoot = "dist/app/greywrought-clause";
async function digest(path: string): Promise<string> {
  return createHash("sha256").update(new Uint8Array(await Bun.file(path).arrayBuffer())).digest("hex").slice(0, 16);
}
const workerHash = await digest(`${assetRoot}/resident-worker.js`);
const workerName = `resident-worker.${workerHash}.js`;
await Bun.write(`${assetRoot}/${workerName}`, await Bun.file(`${assetRoot}/resident-worker.js`).arrayBuffer());
await Bun.write(`${assetRoot}/play.js`, (await Bun.file(`${assetRoot}/play.js`).text()).replaceAll("resident-worker.js", workerName));
const playHash = await digest(`${assetRoot}/play.js`);
const playName = `play.${playHash}.js`;
await Bun.write(`${assetRoot}/${playName}`, await Bun.file(`${assetRoot}/play.js`).arrayBuffer());
const cssHash = await digest(`${assetRoot}/rts.css`);
const cssName = `rts.${cssHash}.css`;
await Bun.write(`${assetRoot}/${cssName}`, await Bun.file(`${assetRoot}/rts.css`).arrayBuffer());
const html = (await Bun.file("dist/index.html").text())
  .replace("app/greywrought-clause/play.js", `app/greywrought-clause/${playName}`)
  .replace("app/greywrought-clause/rts.css", `app/greywrought-clause/${cssName}`);
await Bun.write("dist/index.html", html);
for (const stable of ["play.js", "resident-worker.js", "rts.css"]) await rm(`${assetRoot}/${stable}`);
await Bun.write("dist/.nojekyll", "");

console.log(`Static release contains ${files.length + 1} allowlisted files.`);
