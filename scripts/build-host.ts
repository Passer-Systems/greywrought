import { mkdir, rm } from "node:fs/promises";

await rm("build/host", { recursive: true, force: true });
await mkdir("build/host", { recursive: true });

const result = await Bun.build({
  entrypoints: ["src/host/play.ts"],
  outdir: "build/host",
  target: "browser",
  naming: "play.js",
  external: ["three", "three/addons/*"],
  sourcemap: "linked",
});
if (!result.success) {
  console.error(...result.logs);
  throw new Error("Greywrought browser build failed");
}
console.log("Built Three.js client: build/host/play.js");
