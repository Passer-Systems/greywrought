const productionUrl = Bun.env.GREYWROUGHT_GAME_URL ??
  "https://passer-systems.github.io/greywrought/";
const base = new URL(productionUrl);

function requireCondition(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function fetchRequired(path: string): Promise<Response> {
  const response = await fetch(new URL(path, base), { cache: "no-store" });
  requireCondition(response.ok, `${path} returned ${response.status}`);
  return response;
}

const html = await (await fetchRequired("./")).text();
requireCondition(html.includes("Greywrought Clause"), "production HTML identity is absent");
requireCondition(html.includes("site.webmanifest"), "production release metadata is absent");

const wasm = new Uint8Array(await (await fetchRequired("./wasm/clause_runtime_bg.wasm")).arrayBuffer());
requireCondition(
  wasm.length > 8 && wasm[0] === 0x00 && wasm[1] === 0x61 && wasm[2] === 0x73 && wasm[3] === 0x6d,
  "production Clause runtime is not Wasm",
);

const manifestValue: unknown = await (await fetchRequired("./release-manifest.json")).json();
requireCondition(typeof manifestValue === "object" && manifestValue !== null, "release manifest is invalid");
const manifest = manifestValue as Readonly<Record<string, unknown>>;
requireCondition(manifest.schemaVersion === 1, "release manifest schema changed");
requireCondition(typeof manifest.totalBytes === "number", "release manifest omitted total bytes");

const browser = Bun.spawn({
  cmd: ["bun", "acceptance/browser/playability.ts"],
  cwd: import.meta.dir + "/..",
  env: { ...Bun.env, GREYWROUGHT_GAME_URL: base.href },
  stdout: "inherit",
  stderr: "inherit",
});
const exitCode = await browser.exited;
requireCondition(exitCode === 0, `production browser smoke exited ${exitCode}`);
console.log(`Production smoke passed at ${base.href} (${manifest.totalBytes} release bytes).`);
