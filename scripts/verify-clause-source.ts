import { CLAUSE_COMMIT, CLAUSE_ROOT } from "./clause-pin.js";

const result = Bun.spawnSync({
  cmd: ["git", "-C", CLAUSE_ROOT, "rev-parse", "HEAD"],
  stdout: "pipe",
  stderr: "pipe",
});
if (result.exitCode !== 0) {
  const detail = new TextDecoder().decode(result.stderr).trim();
  throw new Error(detail || "cannot inspect the Clause submodule commit");
}

const actualCommit = new TextDecoder().decode(result.stdout).trim();
if (actualCommit !== CLAUSE_COMMIT) {
  throw new Error(
    `Clause submodule is ${actualCommit}; expected immutable pin ${CLAUSE_COMMIT}. ` +
      "Run: git submodule update --init --recursive",
  );
}

console.log(`Clause source pin verified: ${CLAUSE_COMMIT}`);
