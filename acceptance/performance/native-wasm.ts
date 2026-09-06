import { mkdtemp } from "node:fs/promises";
import { tmpdir, cpus } from "node:os";
import { join } from "node:path";
import { CLAUSE_COMMIT, CLAUSE_WASM_SHA256 } from "../../scripts/clause-pin.js";

const root = "build/comparison";
const analyzeOnly = Bun.argv.includes("--analyze-only");
const sha = (value: string | Uint8Array) => new Bun.CryptoHasher("sha256").update(value).digest("hex");
const unhex = (value: string) => Uint8Array.fromHex(value);
function requireCondition(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
const wasm = new Uint8Array(await Bun.file(`${root}/wasm/clause_runtime_bg.wasm`).arrayBuffer());
requireCondition(sha(wasm) === CLAUSE_WASM_SHA256, "Wasm differs from the consumer's immutable pin");
let transcript: string;
if (analyzeOnly) {
  transcript = await Bun.file(`${root}/native.tsv`).text();
} else {
  const native = Bun.spawn(["build/comparison-target/release/runtime_comparison", "build/measurement/100-active-source.clause"], { stdout: "pipe", stderr: "pipe" });
  const [output, nativeErrors, nativeExit] = await Promise.all([
    new Response(native.stdout).text(), new Response(native.stderr).text(), native.exited,
  ]);
  transcript = output;
  await Bun.write(`${root}/native.tsv`, transcript);
  await Bun.write(`${root}/native.stderr`, nativeErrors);
  requireCondition(nativeExit === 0, `native comparison failed: ${nativeErrors}`);
}
const rows = transcript.trimEnd().split("\n").map(line => {
  const [kind, micros, slot, generation, sequence, request, witness, output] = line.split("\t");
  return { kind: kind!, nativeMillis: Number(micros) / 1000, slot: Number(slot), generation: Number(generation),
    sequence: sequence!, request: request!, witness: witness!, output: output! };
});

let complete!: (value: any) => void;
const completion = new Promise<any>(resolve => { complete = resolve; });
const page = `<!doctype html><title>Greywrought simulation comparison</title><script type="module">
import init, * as runtime from '/wasm/clause_runtime.js';
const fromHex = s => Uint8Array.from(s.match(/../g) ?? [], pair => parseInt(pair,16));
const toHex = bytes => Array.from(bytes, byte => byte.toString(16).padStart(2,'0')).join('');
try {
  const rows = await (await fetch('/requests')).json();
  const started = performance.now();
  const instance = await init();
  const moduleMillis = performance.now() - started;
  const results = [];
  for (const row of rows) {
    if (row.kind === 'source-compile' || row.kind === 'edit-compile') continue;
    const request = fromHex(row.request), witness = fromHex(row.witness);
    const start = performance.now();
    let output, status = 0;
    if (row.kind === 'open') {
      status = runtime.clause_session_v1_open_bulk(request);
      output = runtime.clause_session_v1_event_bulk();
    } else if (row.kind === 'checked-edit') {
      status = runtime.clause_session_v1_source_edit_bulk(row.slot,row.generation,BigInt(row.sequence),request,witness);
      output = runtime.clause_session_v1_event_bulk();
    } else if (row.kind.endsWith('projection') && row.kind !== 'admission-projection') {
      output = runtime.clause_session_v1_project_bulk(row.slot,row.generation);
    } else if (row.kind === 'continuity') {
      output = runtime.clause_session_v1_source_continuity_bulk(row.slot,row.generation);
    } else {
      status = runtime.clause_session_v1_command_bulk(request);
      output = runtime.clause_session_v1_event_bulk();
    }
    const millis = performance.now() - start;
    results.push({kind:row.kind,millis,status,output:toHex(output),wasmMemoryBytes:instance.memory.buffer.byteLength});
    if (status !== 0) throw new Error(row.kind+' status '+status);
  }
  await fetch('/result',{method:'POST',body:JSON.stringify({moduleMillis,results,userAgent:navigator.userAgent,hardwareConcurrency:navigator.hardwareConcurrency})});
} catch(error) { await fetch('/result',{method:'POST',body:JSON.stringify({error:String(error),stack:error.stack})}); }
</script>`;
const server = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(request) {
  const path = new URL(request.url).pathname;
  if (path === "/") return new Response(page, { headers: { "content-type": "text/html" } });
  if (path === "/requests") return Response.json(rows.map(({ output, nativeMillis, ...row }) => row));
  if (path === "/result" && request.method === "POST") { complete(await request.json()); return new Response("received"); }
  if (path === "/wasm/clause_runtime.js") return new Response(Bun.file(`${root}/wasm/clause_runtime.js`), { headers: { "content-type": "text/javascript" } });
  if (path === "/wasm/clause_runtime_bg.wasm") return new Response(Bun.file(`${root}/wasm/clause_runtime_bg.wasm`), { headers: { "content-type": "application/wasm" } });
  return new Response("missing", { status: 404 });
}});
const profile = await mkdtemp(join(tmpdir(), "greywrought-native-wasm-"));
const chrome = analyzeOnly ? null : Bun.spawn([Bun.env.CHROME_PATH ?? "google-chrome", "--headless=new", "--no-sandbox", "--disable-dev-shm-usage", `--user-data-dir=${profile}`, `http://127.0.0.1:${server.port}/`], { stdout: "ignore", stderr: "pipe" });
const chromeErrors = chrome ? new Response(chrome.stderr).text() : null;
let timeout: ReturnType<typeof setTimeout>;
try {
  const browser = analyzeOnly ? await Bun.file(`${root}/browser.json`).json() : await Promise.race([completion, new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error("Chrome comparison exceeded 180 seconds")), 180_000); })]);
  clearTimeout(timeout!);
  if (!analyzeOnly) await Bun.write(`${root}/browser.json`, JSON.stringify(browser));
  requireCondition(!browser.error, `browser comparison failed: ${browser.error}`);
  const comparisons = rows.filter(row => row.kind !== "source-compile" && row.kind !== "edit-compile").map((row, index) => {
    const actual = browser.results[index];
    requireCondition(actual.kind === row.kind, "browser operation sequence differs");
    return { kind: row.kind, nativeMillis: row.nativeMillis, chromeWasmMillis: actual.millis,
      exactBytesEqual: row.output === actual.output, nativeSha256: sha(unhex(row.output)), wasmSha256: sha(unhex(actual.output)),
      bytes: row.output.length / 2, wasmMemoryBytes: actual.wasmMemoryBytes };
  });
  const adapter = await import(`../../${root}/adapter/wasm-cartridge-port.js`);
  const decode = adapter["decode-projected-term-frame"];
  const projected = (kind: string, browserSide = false) => decode(Array.from(unhex(browserSide ? browser.results.find((row: any) => row.kind === kind).output : rows.find(row => row.kind === kind)!.output)));
  const before = projected("initial-projection"), after = projected("final-projection"), edited = projected("edited-projection");
  const actors = Object.entries(before).filter(([_, actor]: any) => actor && typeof actor === "object" && "selected" in actor && "unit-class" in actor).map(([id, actor]: any) => ({ id,
    before: actor["actor-position"], after: after[id]["actor-position"],
    cooldownBefore: actor["action-cooldown"], cooldownAfter: after[id]["action-cooldown"],
    editedCooldown: edited[id]["action-cooldown"],
    priorReferents: actor.$referents ?? actor.$referent,
    editedReferents: edited[id].$referents ?? edited[id].$referent,
  }));
  const active = actors.every(actor => actor.cooldownAfter < actor.cooldownBefore);
  const movingActors = actors.filter(actor => JSON.stringify(actor.before) !== JSON.stringify(actor.after)).length;
  const result = {
    schema: "greywrought-native-wasm-comparison-v1", recordedAt: new Date().toISOString(), clausePin: CLAUSE_COMMIT,
    wasmSha256: sha(wasm), sourceSha256: sha(unhex(rows[0]!.request)), cwr1Sha256: sha(unhex(rows[0]!.output)),
    conditions: { cpu: cpus()[0]?.model, userAgent: browser.userAgent, hardwareConcurrency: browser.hardwareConcurrency,
      engine: "Chrome headless V8 Wasm versus release native Rust; no rendering workload", ticks: 3, tickMillis: 16,
      inputs: "No physical inputs or random draws; identical autonomous movement/cooldown fixture", traceRetention: "CurrentAdmission",
      warmup: "No discarded warmup; first and subsequent calls retained separately", wasmInstantiationMillis: browser.moduleMillis,
      transport: "Request decoding and HTTP transfer excluded from per-call timings; ABI input copy and output copy included",
      edit: "?cooldown - ?dt -> ?cooldown - (?dt * 2.0)",
      identityBoundary: "Initial CWS1 rematerializes the exact CWR1 allocation. Checked edit requires New and mints separate runtime allocation identities; raw edit event equality is reported without masking."
    },
    compiler: rows.filter(row => row.kind === "source-compile" || row.kind === "edit-compile").map(row => ({kind: row.kind, millis: row.nativeMillis})),
    comparisons, actors, movingActors,
    verdict: { initialAndTickExactParity: comparisons.filter(row => !["checked-edit", "edited-projection", "continuity"].includes(row.kind)).every(row => row.exactBytesEqual),
      all100ActorsAdvance: actors.length === 100 && active,
      all100PositionsMove: actors.length === 100 && movingActors === 100,
      editedProjectionExactParity: comparisons.find(row => row.kind === "edited-projection")!.exactBytesEqual,
      continuityExactParity: comparisons.find(row => row.kind === "continuity")!.exactBytesEqual },
    limitations: ["Three ticks and one supported edit; no sustained-play, FPS, visible-edit or all-edit-cases claim", "Wasm linear memory is recorded; native RSS and whole-browser memory are not comparable or measured", "No post-edit simulation tick; edit transfer and carried projection are measured", "Fresh checked-edit allocation prevents exact raw event identity replay at this public boundary"],
  };
  await Bun.write(`${root}/result.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ compiler: result.compiler, comparisons, verdict: result.verdict }, null, 2));
  requireCondition(result.verdict.initialAndTickExactParity && result.verdict.all100ActorsAdvance && result.verdict.editedProjectionExactParity && result.verdict.continuityExactParity, "matched boundary failed; raw evidence retained");
} finally {
  clearTimeout(timeout!);
  if (chrome) {
    chrome.kill();
    await chrome.exited;
    await Bun.write(`${root}/chrome.stderr`, await chromeErrors!);
  }
  await server.stop(true);
}
