import { copyFile, mkdir } from "node:fs/promises";
import { basename, dirname } from "node:path";

import { CLAUSE_ROOT } from "./clause-pin.js";

const adapterRoot =
  `${CLAUSE_ROOT}browser/jump-arena-shell/generated/jump-arena-shell`;
const wasmRoot = `${CLAUSE_ROOT}browser/jump-arena-shell/generated/wasm`;

const copies: readonly (readonly [string, string])[] = [
  ...[
    "workbench.js",
    "workbench.d.ts",
    "wasm-cartridge-port.js",
    "wasm-cartridge-port.d.ts",
    "branch-wasm-port.js",
    "branch-wasm-port.d.ts",
  ].map(
    (name) =>
      [`${adapterRoot}/${name}`, `build/host/jump-arena-shell/${name}`] as const,
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
