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
  ["node_modules/three/examples/jsm/loaders/GLTFLoader.js", "dist/vendor/addons/loaders/GLTFLoader.js"],
  ["node_modules/three/examples/jsm/utils/BufferGeometryUtils.js", "dist/vendor/addons/utils/BufferGeometryUtils.js"],
  ["node_modules/three/examples/jsm/utils/SkeletonUtils.js", "dist/vendor/addons/utils/SkeletonUtils.js"],
  ["assets/external/quaternius/rig-socket-prototype/wayfarer/Knight_Golden_Female.gltf", "dist/assets/quaternius/company/Knight_Golden_Female.gltf"],
  ["assets/external/quaternius/rts-company/Worker_Female.gltf", "dist/assets/quaternius/company/Worker_Female.gltf"],
  ["assets/external/quaternius/rts-company/Ninja_Female.gltf", "dist/assets/quaternius/company/Ninja_Female.gltf"],
  ["assets/external/quaternius/rts-company/Wizard.gltf", "dist/assets/quaternius/company/Wizard.gltf"],
  ["assets/external/quaternius/rts-company/Elf.gltf", "dist/assets/quaternius/company/Elf.gltf"],
  ["assets/external/quaternius/rts-company/LICENSE.txt", "dist/assets/quaternius/company/LICENSE.txt"],
  ["assets/external/quaternius/rts-company/SOURCE.md", "dist/assets/quaternius/company/SOURCE.md"],
  ["assets/external/quaternius/stylized-nature-field/glTF/CommonTree_2.gltf", "dist/assets/quaternius/nature/CommonTree_2.gltf"],
  ["assets/external/quaternius/stylized-nature-field/glTF/CommonTree_2.bin", "dist/assets/quaternius/nature/CommonTree_2.bin"],
  ["assets/external/quaternius/stylized-nature-field/glTF/CommonTree_5.gltf", "dist/assets/quaternius/nature/CommonTree_5.gltf"],
  ["assets/external/quaternius/stylized-nature-field/glTF/CommonTree_5.bin", "dist/assets/quaternius/nature/CommonTree_5.bin"],
  ["assets/external/quaternius/stylized-nature-field/glTF/Pine_2.gltf", "dist/assets/quaternius/nature/Pine_2.gltf"],
  ["assets/external/quaternius/stylized-nature-field/glTF/Pine_2.bin", "dist/assets/quaternius/nature/Pine_2.bin"],
  ["assets/external/quaternius/stylized-nature-field/glTF/Pine_5.gltf", "dist/assets/quaternius/nature/Pine_5.gltf"],
  ["assets/external/quaternius/stylized-nature-field/glTF/Pine_5.bin", "dist/assets/quaternius/nature/Pine_5.bin"],
  ["assets/external/quaternius/stylized-nature-field/glTF/Bush_Common.gltf", "dist/assets/quaternius/nature/Bush_Common.gltf"],
  ["assets/external/quaternius/stylized-nature-field/glTF/Bush_Common.bin", "dist/assets/quaternius/nature/Bush_Common.bin"],
  ["assets/external/quaternius/stylized-nature-field/glTF/Grass_Common_Short.gltf", "dist/assets/quaternius/nature/Grass_Common_Short.gltf"],
  ["assets/external/quaternius/stylized-nature-field/glTF/Grass_Common_Short.bin", "dist/assets/quaternius/nature/Grass_Common_Short.bin"],
  ["assets/external/quaternius/stylized-nature-field/glTF/Rock_Medium_1.gltf", "dist/assets/quaternius/nature/Rock_Medium_1.gltf"],
  ["assets/external/quaternius/stylized-nature-field/glTF/Rock_Medium_1.bin", "dist/assets/quaternius/nature/Rock_Medium_1.bin"],
  ["assets/external/quaternius/stylized-nature-field/glTF/Rock_Medium_3.gltf", "dist/assets/quaternius/nature/Rock_Medium_3.gltf"],
  ["assets/external/quaternius/stylized-nature-field/glTF/Rock_Medium_3.bin", "dist/assets/quaternius/nature/Rock_Medium_3.bin"],
  ["assets/external/quaternius/stylized-nature-field/glTF/Bark_NormalTree.png", "dist/assets/quaternius/nature/Bark_NormalTree.png"],
  ["assets/external/quaternius/stylized-nature-field/glTF/Bark_NormalTree_Normal.png", "dist/assets/quaternius/nature/Bark_NormalTree_Normal.png"],
  ["assets/external/quaternius/stylized-nature-field/glTF/Leaves_NormalTree_C.png", "dist/assets/quaternius/nature/Leaves_NormalTree_C.png"],
  ["assets/external/quaternius/stylized-nature-field/glTF/Leaves_TwistedTree_C.png", "dist/assets/quaternius/nature/Leaves_TwistedTree_C.png"],
  ["assets/external/quaternius/stylized-nature-field/glTF/Leaf_Pine_C.png", "dist/assets/quaternius/nature/Leaf_Pine_C.png"],
  ["assets/external/quaternius/stylized-nature-field/glTF/Grass.png", "dist/assets/quaternius/nature/Grass.png"],
  ["assets/external/quaternius/stylized-nature-field/glTF/Rocks_Diffuse.png", "dist/assets/quaternius/nature/Rocks_Diffuse.png"],
  ["assets/external/quaternius/stylized-nature-field/License_Standard.txt", "dist/assets/quaternius/nature/LICENSE.txt"],
  ["assets/external/quaternius/stylized-nature-field/SOURCE.md", "dist/assets/quaternius/nature/SOURCE.md"],
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
