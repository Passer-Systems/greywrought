import { CLAUSE_COMMIT, CLAUSE_ROOT, CLAUSE_WASM_SHA256 } from "./clause-pin.js";

function commandOutput(command: readonly string[]): string {
  const result = Bun.spawnSync({
    cmd: [...command],
    stdout: "pipe",
    stderr: "pipe",
  });
  if (result.exitCode !== 0) {
    const detail = new TextDecoder().decode(result.stderr).trim();
    throw new Error(
      detail || `command failed (${result.exitCode}): ${command.join(" ")}`,
    );
  }
  return new TextDecoder().decode(result.stdout).trim();
}

const actualCommit = commandOutput(["git", "-C", CLAUSE_ROOT, "rev-parse", "HEAD"]);
if (actualCommit !== CLAUSE_COMMIT) {
  throw new Error(
    `Clause submodule is ${actualCommit}; expected immutable pin ${CLAUSE_COMMIT}. ` +
      "Run: git submodule update --init --recursive",
  );
}

const wasmPath = "build/clause-wasm/clause_runtime_bg.wasm";
if (!(await Bun.file(wasmPath).exists())) {
  throw new Error(
    `fresh Clause Wasm is absent at ${wasmPath}; run: bun run build:clause-runtime`,
  );
}
const hasher = new Bun.CryptoHasher("sha256");
hasher.update(await Bun.file(wasmPath).arrayBuffer());
const actualWasmHash = hasher.digest("hex");
if (actualWasmHash !== CLAUSE_WASM_SHA256) {
  throw new Error(
    `Clause Wasm hash ${actualWasmHash} does not match ${CLAUSE_WASM_SHA256}`,
  );
}

console.log(`Clause pin verified: ${CLAUSE_COMMIT}`);
console.log(`Clause Wasm verified: ${CLAUSE_WASM_SHA256}`);
