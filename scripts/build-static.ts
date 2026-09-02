import { copyFile, cp, mkdir, rm } from "node:fs/promises";
import { dirname } from "node:path";

const files: readonly (readonly [string, string])[] = [
  ["src/host/play.html", "dist/index.html"],
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
];

const directories: readonly (readonly [string, string])[] = [
  ["assets/external/opengameart/teh-bucket-boar", "dist/assets/opengameart/teh-bucket-boar"],
  ["assets/external/quaternius/rig-socket-prototype", "dist/assets/quaternius/rig"],
  ["assets/external/quaternius/stylized-nature-field/glTF", "dist/assets/quaternius/nature"],
];

await rm("dist", { recursive: true, force: true });
for (const [source, target] of files) {
  await mkdir(dirname(target), { recursive: true });
  await copyFile(source, target);
}
for (const [source, target] of directories) {
  await cp(source, target, { recursive: true });
}
await Bun.write("dist/.nojekyll", "");

console.log(`Static release contains ${files.length} files and ${directories.length} asset trees.`);
