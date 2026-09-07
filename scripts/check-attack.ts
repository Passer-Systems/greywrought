import "./verify-clause-source.js";
import { CLAUSE_ROOT } from "./clause-pin.js";
import { resolve } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const source = resolve(Bun.env.WOUNDED_ATTACK_SOURCE ?? `${root}src/world/embodied-encounter.clause`);
const oracle = resolve(Bun.env.WOUNDED_ATTACK_CASES ?? `${root}acceptance/comparison/wounded-attack-cases.json`);
const started = performance.now();

function run(label: string, cmd: string[]) {
  const start = performance.now();
  const result = Bun.spawnSync({
    cmd,
    cwd: root,
    env: { ...Bun.env, WOUNDED_ATTACK_SOURCE: source, WOUNDED_ATTACK_CASES: oracle },
    stdout: "inherit",
    stderr: "inherit",
  });
  console.log(`${label}: ${((performance.now() - start) / 1000).toFixed(3)}s`);
  if (result.exitCode !== 0) process.exit(result.exitCode || 1);
}

run("source check", [
  "cargo", "run", "--manifest-path", `${CLAUSE_ROOT}Cargo.toml`,
  "--package", "clause-workbench", "--bin", "clause-workbench",
  "--locked", "--target-dir", `${root}build/native-authoring-target`, "-j", "2",
  "--", "check-source", source,
]);
run("attack oracle", [
  "cargo", "test", "--manifest-path", `${root}Cargo.toml`,
  "--locked", "--target-dir", `${root}build/native-target`, "-j", "2",
  "--test", "rts_control", "wounded_attack_fixed_oracle",
  "--", "--exact", "--nocapture",
]);
console.log(`check:attack: ${((performance.now() - started) / 1000).toFixed(3)}s`);
