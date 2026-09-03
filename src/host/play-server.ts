const RESIDENT_SOURCE =
  Bun.env.GREYWROUGHT_RESIDENT_SOURCE ?? "src/world/embodied-encounter.clause";

interface GenerationPayload {
  readonly generation: number;
  readonly compilerMicros: number;
  readonly cwr1: string;
  readonly sourceModifiedMillis: number;
  readonly hot: boolean;
}

function configuredPort(): number {
  const source = Bun.env.GREYWROUGHT_PORT;
  return source === undefined ? 4173 : Number.parseInt(source, 10);
}

function spawnResidentGeneration() {
  const child = Bun.spawn({
    cmd: ["build/cargo-target/release/resident_generation", RESIDENT_SOURCE],
    stdin: "pipe",
    stdout: "pipe",
    stderr: "inherit",
  });
  const reader = child.stdout.getReader();
  const decoder = new TextDecoder();
  let buffered = "";
  let source: string | null = null;
  let latest: string | null = null;
  let active: Readonly<{ line: string; modified: number }> | null = null;

  async function readLine(): Promise<string> {
    for (;;) {
      const newline = buffered.indexOf("\n");
      if (newline >= 0) {
        const line = buffered.slice(0, newline);
        buffered = buffered.slice(newline + 1);
        return line;
      }
      const chunk = await reader.read();
      if (chunk.done) throw new Error("resident generation process ended");
      buffered += decoder.decode(chunk.value, { stream: true });
    }
  }

  function generationResponse(
    line: string,
    modified: number,
    after: number,
  ): Response {
    const fields = line.split("\t");
    const kind = fields[0];
    if (kind === "generation") {
      const generation = fields[1];
      const compilerMicros = fields[2];
      const cwr1 = fields[3];
      if (
        generation === undefined ||
        compilerMicros === undefined ||
        cwr1 === undefined
      ) {
        return new Response("resident generation protocol failed", { status: 500 });
      }
      const payload: GenerationPayload = {
        generation: Number.parseInt(generation, 10),
        compilerMicros: Number.parseInt(compilerMicros, 10),
        cwr1,
        sourceModifiedMillis: modified,
        hot: after >= 0,
      };
      return Response.json(payload);
    }
    if (kind === "error") {
      return Response.json(
        { errorHex: fields[1] ?? "", sourceModifiedMillis: modified },
        { status: 422 },
      );
    }
    return new Response("resident generation protocol failed", { status: 500 });
  }

  function generationNumber(line: string): number | null {
    const fields = line.split("\t");
    if (fields[0] !== "generation" || fields.length !== 4) return null;
    const generation = Number.parseInt(fields[1] ?? "", 10);
    return Number.isSafeInteger(generation) ? generation : null;
  }

  function retainResult(line: string, modified: number): void {
    latest = line;
    if (generationNumber(line) !== null) active = { line, modified };
  }

  function currentResponse(after: number, modified: number): Response {
    if (latest === null) {
      return new Response("resident generation protocol failed", { status: 500 });
    }
    const generation = generationNumber(latest);
    if (generation !== null) {
      return after === generation
        ? new Response(null, { status: 204 })
        : generationResponse(latest, modified, after);
    }
    if (active === null) return generationResponse(latest, modified, after);
    const activeGeneration = generationNumber(active.line);
    if (after === activeGeneration) {
      return new Response(null, {
        status: 204,
        headers: { "X-Greywrought-Source-State": "rejected" },
      });
    }
    return generationResponse(active.line, active.modified, after);
  }

  async function responseAfter(after: number): Promise<Response> {
    const file = Bun.file(RESIDENT_SOURCE);
    const nextSource = await file.text();
    const modified = file.lastModified;
    if (source === null) {
      retainResult(await readLine(), modified);
      source = nextSource;
      return currentResponse(after, modified);
    }
    if (source === nextSource) {
      return currentResponse(after, modified);
    }
    source = nextSource;
    child.stdin.write("reload\n");
    child.stdin.flush();
    retainResult(await readLine(), modified);
    return currentResponse(after, modified);
  }

  return { child, responseAfter };
}

const files: Readonly<Record<string, string>> = {
  "/": "src/host/play.html",
  "/index.html": "src/host/play.html",
  "/app/greywrought-clause/play.js": "build/host/play.js",
  "/app/greywrought-clause/resident-worker.js": "build/host/resident-worker.js",
  "/app/greywrought-clause/public-url.js": "build/host/public-url.js",
  "/app/jump-arena-shell/wasm-cartridge-port.js":
    "build/host/jump-arena-shell/wasm-cartridge-port.js",
  "/app/jump-arena-shell/workbench.js":
    "build/host/jump-arena-shell/workbench.js",
  "/vendor/three.module.js": "node_modules/three/build/three.module.js",
  "/vendor/three.core.js": "node_modules/three/build/three.core.js",
  "/wasm/clause_runtime.js": "build/host/wasm/clause_runtime.js",
  "/wasm/clause_runtime_bg.wasm": "build/host/wasm/clause_runtime_bg.wasm",
  "/assets/embodied-encounter-v1.cwr1.hex":
    "build/embodied/embodied-encounter-v1.cwr1.hex",
};

const resident = spawnResidentGeneration();
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: configuredPort(),
  async fetch(request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/resident-generation") {
      const source = url.searchParams.get("after");
      const after = source === null ? -1 : Number.parseInt(source, 10);
      return resident.responseAfter(after);
    }
    const path = files[url.pathname];
    return path === undefined
      ? new Response("Not found", { status: 404 })
      : new Response(Bun.file(path));
  },
});

console.log(`Greywrought Clause is playable at ${server.url}`);

export {};
