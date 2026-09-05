import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url)).replace(/\/$/, "");
const restart = Bun.argv.slice(2).includes("--restart");
if (Bun.argv.slice(2).some(argument => argument !== "--restart")) {
  throw new Error("Usage: bun run play:local [--restart]");
}

const services = [
  { unit: "greywrought-local.service", args: ["build/host/play-server.js"] },
  { unit: "greywrought-local-ui.service", args: ["build", "--watch", "--no-clear-screen", "src/host/play.ts", "--outfile=build/host/play.js", "--external=three", "--external=#clause-runtime-wasm"] },
  { unit: "greywrought-local-worker.service", args: ["build", "--watch", "--no-clear-screen", "src/host/resident-worker.ts", "--outfile=build/host/resident-worker.js"] },
] as const;

function command(args: readonly string[]): string {
  const result = Bun.spawnSync([...args], { cwd: root, stdout: "pipe", stderr: "pipe" });
  if (result.exitCode !== 0) throw new Error(result.stderr.toString().trim() || `${args[0]} failed`);
  return result.stdout.toString().trim();
}

for (const artifact of [
  "build/cargo-target/release/resident_generation", "build/host/play-server.js",
  "build/host/play.js", "build/host/resident-worker.js", "build/host/wasm/clause_runtime_bg.wasm",
]) {
  if (!(await Bun.file(`${root}/${artifact}`).exists())) {
    throw new Error(`Missing ${root}/${artifact}. Run bun run build:play in the development shell first.`);
  }
}

// Inspect every named unit before changing any: a different checkout keeps ownership.
const existing = services.map(service => {
  const properties = command(["systemctl", "--user", "show", service.unit, "--property=LoadState", "--property=WorkingDirectory"]);
  const present = !properties.split("\n").includes("LoadState=not-found");
  if (present && !properties.split("\n").includes(`WorkingDirectory=${root}`)) {
    throw new Error(`${service.unit} belongs to a different checkout; it was left untouched.`);
  }
  return present;
});

for (const [index, service] of services.entries()) {
  if (existing[index]) {
    command(["systemctl", "--user", restart ? "restart" : "start", service.unit]);
  } else {
    command([
      "systemd-run", "--user", `--unit=${service.unit}`, "--collect",
      `--property=WorkingDirectory=${root}`, "--property=Restart=on-failure",
      process.execPath, ...service.args,
    ]);
  }
}

const url = "http://127.0.0.1:4173/";
let ready = false;
for (let attempt = 0; attempt < 60; attempt += 1) {
  try {
    const response = await fetch(`${url}runtime-identity`, { signal: AbortSignal.timeout(1_000) });
    const identity: unknown = await response.json();
    const pid = Number(command(["systemctl", "--user", "show", "greywrought-local.service", "--property=MainPID", "--value"]));
    if (pid > 0 && typeof identity === "object" && identity !== null && "serverPid" in identity && identity.serverPid === pid) {
      const generation = await fetch(`${url}resident-generation?after=-1`, { signal: AbortSignal.timeout(5_000) });
      if (generation.ok) { ready = true; break; }
    }
  } catch { /* Startup can precede the server accepting requests. */ }
  await Bun.sleep(100);
}
if (!ready) throw new Error("Local game did not become ready. Inspect journalctl --user -u greywrought-local.service.");
console.log(`Play at ${url}\n${restart ? "Server restarted; refresh your browser." : "Existing artifacts reused; server and both bundle watchers are running."}\nChecked rule edits can continue in the open game. Refresh after interface edits.\nAfter compiler updates, run bun run build:play, then bun run play:local --restart and refresh.`);
