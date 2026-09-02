import { CLAUSE_COMMIT, CLAUSE_ROOT } from "./clause-pin.js";

const forbidden = [/\/home\/[^/]+\//, /\/nix\/store\//, /\bnix shell\b/];
const paths = [
  "Cargo.toml",
  "package.json",
  "README.md",
  "acceptance/resident-source-recovery.ts",
  "acceptance/browser/playability.ts",
  "acceptance/browser/encounter-journey.ts",
  "acceptance/browser/camera-relative-movement.ts",
  "acceptance/browser/sustained-liveness.ts",
  "acceptance/browser/behavior-hot-edit.ts",
] as const;

for (const path of paths) {
  const source = await Bun.file(path).text();
  for (const pattern of forbidden) {
    if (pattern.test(source)) throw new Error(`${path} contains ${pattern}`);
  }
}

const actualCommit = Bun.spawnSync({
  cmd: ["git", "-C", CLAUSE_ROOT, "rev-parse", "HEAD"],
  stdout: "pipe",
});
if (actualCommit.exitCode !== 0) {
  throw new Error("cannot inspect the Clause submodule commit");
}
const actualCommitText = new TextDecoder().decode(actualCommit.stdout).trim();
if (actualCommitText !== CLAUSE_COMMIT) {
  throw new Error(`Clause submodule ${actualCommitText} is not ${CLAUSE_COMMIT}`);
}

console.log("Portable-path audit passed.");
