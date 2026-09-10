import { copyFile, mkdir, rm } from "node:fs/promises";
import { dirname } from "node:path";
import { files } from "./public-files.js";
import pkg from "../package.json";

await rm("dist", { recursive: true, force: true });
for (const [source, target] of files) {
  await mkdir(dirname(target), { recursive: true });
  if (source.endsWith(".gltf")) await Bun.write(target, JSON.stringify(JSON.parse(await Bun.file(source).text())));
  else await copyFile(source, target);
}
await Bun.write("dist/.nojekyll", "");
const git = Bun.spawnSync(["git", "rev-parse", "--short", "HEAD"]);
if (git.exitCode !== 0) throw new Error("Cannot identify release source");
const release = { name: pkg.name, version: pkg.version, variant: "threejs", commit: git.stdout.toString().trim() };
let index = await Bun.file("dist/index.html").text();
for (const path of ["app/greywrought/play.js", "app/greywrought/cinderwake.css", "app/greywrought/equipment-panel.css", "app/greywrought/quest-log.css"]) {
  const digest = new Bun.CryptoHasher("sha256").update(await Bun.file(`dist/${path}`).arrayBuffer()).digest("hex").slice(0, 12);
  index = index.replaceAll(`./${path}`, `./${path}?v=${digest}`);
}
await Bun.write("dist/index.html", index);
await Bun.write("dist/release.json", JSON.stringify(release, null, 2) + "\n");
console.log(`Built Greywrought ${release.version} (${release.commit}) in dist/`);
