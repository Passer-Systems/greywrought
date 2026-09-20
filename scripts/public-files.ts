const frostwoodFiles = await Array.fromAsync(new Bun.Glob("**/*").scan({cwd:"assets/external/quaternius/frostwood",onlyFiles:true}));
// Original actors remain in the source library; replaced actors need no release download.
const retiredActors = new Set(["actors/Armabee.glb", "actors/Wolf.glb", "actors/Bat.glb", "actors/MushroomKing.glb"]);
const pirateFiles = await Array.fromAsync(new Bun.Glob("**/*").scan({cwd:"assets/external/quaternius/pirate",onlyFiles:true}));
const iconFiles = await Array.fromAsync(
  new Bun.Glob("**/*.{png,svg}").scan({ cwd: "assets/ui/icons", onlyFiles: true }),
);
const cursorFiles = await Array.fromAsync(
  new Bun.Glob("*.png").scan({ cwd: "assets/ui/cursors", onlyFiles: true }),
);
const entryAssetFiles = await Array.fromAsync(
  new Bun.Glob("{brand,characters}/**/*.webp").scan({ cwd: "assets/ui", onlyFiles: true }),
);

export const files: readonly (readonly [string, string])[] = [
  ...["frost-waltz.mp3", "strike.ogg", "hit.ogg", "brace.ogg", "potion.ogg", "gather.ogg", "purchase.ogg", "windup.ogg", "alarm.ogg", "defeat.ogg", "extraction.ogg", "SOURCE.md", "Kenney-RPG-LICENSE.txt", "Kenney-Interface-LICENSE.txt"].map((name): readonly [string, string] => [
    `assets/audio/${name}`, `dist/assets/audio/${name}`,
  ]),
  ["src/host/play.html", "dist/index.html"],
  ["src/host/favicon.svg", "dist/favicon.svg"],
  ["src/host/site.webmanifest", "dist/site.webmanifest"],
  ["src/host/cinderwake.css", "dist/app/greywrought/cinderwake.css"],
  ["src/host/quest-log.css", "dist/app/greywrought/quest-log.css"],
  ["src/host/equipment-panel.css", "dist/app/greywrought/equipment-panel.css"],
  ["build/host/play.js", "dist/app/greywrought/play.js"],
  ["node_modules/three/build/three.module.js", "dist/vendor/three.module.js"],
  ["node_modules/three/build/three.core.js", "dist/vendor/three.core.js"],
  ["node_modules/three/examples/jsm/loaders/OBJLoader.js", "dist/vendor/three-addons/loaders/OBJLoader.js"],
  ["node_modules/three/examples/jsm/loaders/MTLLoader.js", "dist/vendor/three-addons/loaders/MTLLoader.js"],
  ["node_modules/three/examples/jsm/loaders/GLTFLoader.js", "dist/vendor/three-addons/loaders/GLTFLoader.js"],
  ["node_modules/three/examples/jsm/utils/BufferGeometryUtils.js", "dist/vendor/three-addons/utils/BufferGeometryUtils.js"],
  ["node_modules/three/examples/jsm/utils/SkeletonUtils.js", "dist/vendor/three-addons/utils/SkeletonUtils.js"],
  ...["Warrior.glb", "Wizard.glb", "Ranger.glb", "Alchemist.gltf", "Artificer.gltf", "ultimate-character-license.txt", "LICENSE.txt", "SOURCE.md"].map((name): readonly [string, string] => [`assets/external/quaternius/class-characters/${name}`, `dist/assets/quaternius/class-characters/${name}`]),
  ["assets/external/quaternius/class-characters/Social.glb", "dist/assets/quaternius/class-characters/Social.glb"],
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
  ...["hollow-saint.glb", "relic-warden.glb", "hearth-keeper.glb", "greyrot-penitent.glb", "QUATERNIUS-LICENSE.txt", "manifest.json", "README.md"].map((name): readonly [string, string] => [
    `3d/greywrought-relics/${name.endsWith(".glb") ? "runtime/" : ""}${name}`, `dist/assets/greywrought/relics/${name}`,
  ]),
  ...frostwoodFiles.filter(name => !retiredActors.has(name)).map((name): readonly [string, string] => [
    `assets/external/quaternius/frostwood/${name}`, `dist/assets/quaternius/frostwood/${name}`,
  ]),
  ...pirateFiles.map((name): readonly [string, string] => [
    `assets/external/quaternius/pirate/${name}`, `dist/assets/quaternius/pirate/${name}`,
  ]),
];
