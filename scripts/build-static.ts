import { copyFile, mkdir, rm } from "node:fs/promises";
import { dirname } from "node:path";

const iconFiles = await Array.fromAsync(
  new Bun.Glob("**/*.png").scan({ cwd: "assets/ui/icons", onlyFiles: true }),
);
const cursorFiles = await Array.fromAsync(
  new Bun.Glob("*.png").scan({ cwd: "assets/ui/cursors", onlyFiles: true }),
);
const entryAssetFiles = await Array.fromAsync(
  new Bun.Glob("{brand,characters}/**/*.webp").scan({ cwd: "assets/ui", onlyFiles: true }),
);

const files: readonly (readonly [string, string])[] = [
  ["src/host/play.html", "dist/index.html"],
  ["src/host/favicon.svg", "dist/favicon.svg"],
  ["src/host/site.webmanifest", "dist/site.webmanifest"],
  ["src/host/cinderwake.css", "dist/app/greywrought/cinderwake.css"],
  ["build/host/play.js", "dist/app/greywrought/play.js"],
  ["node_modules/three/build/three.module.js", "dist/vendor/three.module.js"],
  ["node_modules/three/build/three.core.js", "dist/vendor/three.core.js"],
  ["node_modules/three/examples/jsm/loaders/GLTFLoader.js", "dist/vendor/three-addons/loaders/GLTFLoader.js"],
  ["node_modules/three/examples/jsm/utils/BufferGeometryUtils.js", "dist/vendor/three-addons/utils/BufferGeometryUtils.js"],
  ["node_modules/three/examples/jsm/utils/SkeletonUtils.js", "dist/vendor/three-addons/utils/SkeletonUtils.js"],
  ["assets/external/opengameart/teh-bucket-boar/boar.glb", "dist/assets/opengameart/teh-bucket-boar/boar.glb"],
  ["assets/external/quaternius/rig-socket-prototype/wayfarer/Knight_Golden_Female.gltf", "dist/assets/quaternius/rig/wayfarer/Knight_Golden_Female.gltf"],
  ["assets/external/opengameart/teh-bucket-boar/SOURCE.md", "dist/licenses/boar-SOURCE.md"],
  ["assets/external/quaternius/rig-socket-prototype/SOURCE.md", "dist/licenses/wayfarer-SOURCE.md"],
  ["assets/ui/icons/SOURCE.md", "dist/assets/ui/icons/SOURCE.md"],
  ["assets/ui/icons/manifest.json", "dist/assets/ui/icons/manifest.json"],
  ["assets/ui/cursors/SOURCE.md", "dist/assets/ui/cursors/SOURCE.md"],
  ["assets/ui/entry-SOURCE.md", "dist/assets/ui/entry-SOURCE.md"],
  ...iconFiles.map((name): readonly [string, string] => [
    `assets/ui/icons/${name}`,
    `dist/assets/ui/icons/${name}`,
  ]),
  ...cursorFiles.map((name): readonly [string, string] => [
    `assets/ui/cursors/${name}`,
    `dist/assets/ui/cursors/${name}`,
  ]),
  ...entryAssetFiles.map((name): readonly [string, string] => [
    `assets/ui/${name}`,
    `dist/assets/ui/${name}`,
  ]),
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
const commit = Bun.spawnSync({ cmd: ["git", "rev-parse", "--short", "HEAD"], stdout: "pipe" });
const commitId = new TextDecoder().decode(commit.stdout).trim();
await Bun.write("dist/release.json", JSON.stringify({ name: "greywrought", version: "0.3.0", variant: "threejs", commit: commitId }, null, 2) + "\n");

console.log(`Static release contains ${files.length + 2} allowlisted files.`);
