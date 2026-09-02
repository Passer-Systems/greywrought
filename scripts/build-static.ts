import { copyFile, mkdir, rm } from "node:fs/promises";
import { dirname } from "node:path";

const files: readonly (readonly [string, string])[] = [
  ["src/host/play.html", "dist/index.html"],
  ["src/host/favicon.svg", "dist/favicon.svg"],
  ["src/host/site.webmanifest", "dist/site.webmanifest"],
  ["src/host/cinderwake.css", "dist/app/greywrought-clause/cinderwake.css"],
  ["build/host/play.js", "dist/app/greywrought-clause/play.js"],
  ["build/host/resident-worker.js", "dist/app/greywrought-clause/resident-worker.js"],
  ["build/host/jump-arena-shell/branch-wasm-port.js", "dist/app/jump-arena-shell/branch-wasm-port.js"],
  ["build/host/jump-arena-shell/wasm-cartridge-port.js", "dist/app/jump-arena-shell/wasm-cartridge-port.js"],
  ["build/host/jump-arena-shell/workbench.js", "dist/app/jump-arena-shell/workbench.js"],
  ["build/host/wasm/clause_runtime.js", "dist/wasm/clause_runtime.js"],
  ["build/host/wasm/clause_runtime_bg.wasm", "dist/wasm/clause_runtime_bg.wasm"],
  ["build/conquest/conquest-v1.cwr1.hex", "dist/assets/conquest-v1.cwr1.hex"],
  ["build/ongoing-effect/ongoing-effect-v1.cwr1.hex", "dist/assets/ongoing-effect-v1.cwr1.hex"],
  ["build/embodied/embodied-encounter-v1.cwr1.hex", "dist/assets/embodied-encounter-v1.cwr1.hex"],
  ["node_modules/three/build/three.module.js", "dist/vendor/three.module.js"],
  ["node_modules/three/build/three.core.js", "dist/vendor/three.core.js"],
  ["node_modules/three/examples/jsm/loaders/GLTFLoader.js", "dist/vendor/three-addons/loaders/GLTFLoader.js"],
  ["node_modules/three/examples/jsm/utils/BufferGeometryUtils.js", "dist/vendor/three-addons/utils/BufferGeometryUtils.js"],
  ["node_modules/three/examples/jsm/utils/SkeletonUtils.js", "dist/vendor/three-addons/utils/SkeletonUtils.js"],
  ["assets/external/opengameart/teh-bucket-boar/boar.glb", "dist/assets/opengameart/teh-bucket-boar/boar.glb"],
  ["assets/external/quaternius/rig-socket-prototype/wayfarer/Knight_Golden_Female.gltf", "dist/assets/quaternius/rig/wayfarer/Knight_Golden_Female.gltf"],
  ["assets/external/opengameart/teh-bucket-boar/SOURCE.md", "dist/licenses/boar-SOURCE.md"],
  ["assets/external/quaternius/rig-socket-prototype/SOURCE.md", "dist/licenses/wayfarer-SOURCE.md"],
  ...[
    "CommonTree_2.gltf",
    "CommonTree_2.bin",
    "CommonTree_5.gltf",
    "CommonTree_5.bin",
    "Pine_5.gltf",
    "Pine_5.bin",
    "Bush_Common.gltf",
    "Bush_Common.bin",
    "Grass_Common_Short.gltf",
    "Grass_Common_Short.bin",
    "Rock_Medium_3.gltf",
    "Rock_Medium_3.bin",
    "Bark_NormalTree.png",
    "Bark_NormalTree_Normal.png",
    "Leaves_NormalTree_C.png",
    "Leaf_Pine_C.png",
    "Leaves_TwistedTree_C.png",
    "Grass.png",
    "Rocks_Diffuse.png",
  ].map((name): readonly [string, string] => [
    `assets/external/quaternius/stylized-nature-field/glTF/${name}`,
    `dist/assets/quaternius/nature/${name}`,
  ]),
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
