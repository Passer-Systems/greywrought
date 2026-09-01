const RESIDENT_SOURCE = "src/world/embodied-encounter.clause";

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
    cmd: ["build/cargo-target/debug/resident_generation", RESIDENT_SOURCE],
    stdin: "pipe",
    stdout: "pipe",
    stderr: "inherit",
  });
  const reader = child.stdout.getReader();
  const decoder = new TextDecoder();
  let buffered = "";
  let source: string | null = null;
  let latest: string | null = null;

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
    hot: boolean,
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
        hot,
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

  async function responseAfter(after: number): Promise<Response> {
    const file = Bun.file(RESIDENT_SOURCE);
    const nextSource = await file.text();
    const modified = file.lastModified;
    if (source === null) {
      latest = await readLine();
      source = nextSource;
      return generationResponse(latest, modified, false);
    }
    if (source === nextSource) {
      if (latest === null) {
        return new Response("resident generation protocol failed", { status: 500 });
      }
      const fields = latest.split("\t");
      const generation =
        fields.length === 4 && fields[1] !== undefined
          ? Number.parseInt(fields[1], 10)
          : -1;
      return after === generation
        ? new Response(null, { status: 204 })
        : generationResponse(latest, modified, false);
    }
    source = nextSource;
    child.stdin.write("reload\n");
    child.stdin.flush();
    latest = await readLine();
    return generationResponse(latest, modified, true);
  }

  return { child, responseAfter };
}

const files: Readonly<Record<string, string>> = {
  "/": "src/host/play.html",
  "/index.html": "src/host/play.html",
  "/rig": "src/host/rig_socket_lab.html",
  "/app/greywrought-clause/play.js": "build/host/play.js",
  "/app/greywrought-clause/cinderwake-presentation.js":
    "build/host/cinderwake-presentation.js",
  "/app/greywrought-clause/rig-socket-lab.js":
    "build/host/rig-socket-lab.js",
  "/app/rig-socket-lab-entry.js": "build/host/rig-socket-lab-entry.js",
  "/app/greywrought-clause/cinderwake.css": "src/host/cinderwake.css",
  "/app/rig-socket-lab.css": "src/host/rig_socket_lab.css",
  "/app/greywrought-clause/presentation.js": "build/host/presentation.js",
  "/app/jump-arena-shell/branch-wasm-port.js":
    "build/host/jump-arena-shell/branch-wasm-port.js",
  "/app/jump-arena-shell/wasm-cartridge-port.js":
    "build/host/jump-arena-shell/wasm-cartridge-port.js",
  "/app/jump-arena-shell/workbench.js":
    "build/host/jump-arena-shell/workbench.js",
  "/vendor/three.module.js": "node_modules/three/build/three.module.js",
  "/vendor/three.core.js": "node_modules/three/build/three.core.js",
  "/vendor/three-addons/loaders/GLTFLoader.js":
    "node_modules/three/examples/jsm/loaders/GLTFLoader.js",
  "/vendor/three-addons/utils/BufferGeometryUtils.js":
    "node_modules/three/examples/jsm/utils/BufferGeometryUtils.js",
  "/vendor/three-addons/utils/SkeletonUtils.js":
    "node_modules/three/examples/jsm/utils/SkeletonUtils.js",
  "/wasm/clause_runtime.js": "build/host/wasm/clause_runtime.js",
  "/wasm/clause_runtime_bg.wasm": "build/host/wasm/clause_runtime_bg.wasm",
  "/assets/conquest-v1.cwr1.hex": "build/conquest/conquest-v1.cwr1.hex",
  "/assets/ongoing-effect-v1.cwr1.hex":
    "build/ongoing-effect/ongoing-effect-v1.cwr1.hex",
  "/assets/quaternius/rig/base/Superhero_Female_FullBody.gltf":
    "assets/external/quaternius/rig-socket-prototype/base/Superhero_Female_FullBody.gltf",
  "/assets/quaternius/rig/base/Superhero_Female_FullBody.bin":
    "assets/external/quaternius/rig-socket-prototype/base/Superhero_Female_FullBody.bin",
  "/assets/quaternius/rig/base/T_Eye_Brown.png":
    "assets/external/quaternius/rig-socket-prototype/base/T_Eye_Brown.png",
  "/assets/quaternius/rig/base/T_Eye_Normal.png":
    "assets/external/quaternius/rig-socket-prototype/base/T_Eye_Normal.png",
  "/assets/quaternius/rig/base/T_Hair_2_BaseColor.png":
    "assets/external/quaternius/rig-socket-prototype/base/T_Hair_2_BaseColor.png",
  "/assets/quaternius/rig/base/T_Hair_2_Normal.png":
    "assets/external/quaternius/rig-socket-prototype/base/T_Hair_2_Normal.png",
  "/assets/quaternius/rig/base/T_Superhero_Female_Dark_BaseColor.png":
    "assets/external/quaternius/rig-socket-prototype/base/T_Superhero_Female_Dark_BaseColor.png",
  "/assets/quaternius/rig/base/T_Superhero_Female_Normal.png":
    "assets/external/quaternius/rig-socket-prototype/base/T_Superhero_Female_Normal.png",
  "/assets/quaternius/rig/base/T_Superhero_Female_Roughness.png":
    "assets/external/quaternius/rig-socket-prototype/base/T_Superhero_Female_Roughness.png",
  "/assets/quaternius/rig/animations/UAL1_Standard.glb":
    "assets/external/quaternius/rig-socket-prototype/animations/UAL1_Standard.glb",
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
