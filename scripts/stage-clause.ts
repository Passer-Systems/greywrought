import { copyFile, mkdir } from "node:fs/promises";
import { basename, dirname } from "node:path";

const adapterRoot = "build/clause-adapter";
const wasmRoot = "build/clause-wasm";

const copies: readonly (readonly [string, string])[] = [
  ...["workbench", "wasm-cartridge-port", "branch-wasm-port"].flatMap(
    (name) => [
      [`${adapterRoot}/${name}.js`, `build/host/jump-arena-shell/${name}.js`] as const,
      [`${adapterRoot}/${name}.d.ts`, `build/host/jump-arena-shell/${name}.d.ts`] as const,
    ],
  ),
  ...[
    "clause_runtime.js",
    "clause_runtime.d.ts",
    "clause_runtime_bg.wasm",
    "clause_runtime_bg.wasm.d.ts",
  ].map(
    (name) => [`${wasmRoot}/${name}`, `build/host/wasm/${name}`] as const,
  ),
];

for (const [source, target] of copies) {
  await mkdir(dirname(target), { recursive: true });
  await copyFile(source, target);
  if (!(await Bun.file(target).exists())) {
    throw new Error(`failed to stage ${basename(source)}`);
  }
}

console.log(`Staged ${copies.length} exact Clause artifacts.`);
