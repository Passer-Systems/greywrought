import {
  "->ExactProcessRequest" as createExactProcessRequest,
  "create-wasm-cartridge-port" as createWasmCartridgePort,
  "cse1-projected-term-json-max-source-units" as projectedTermJsonLimit,
  "cse1-projected-term-max-properties" as projectedTermPropertyLimit,
  "decode-cwr1-hex" as decodeCwr1Hex,
} from "../../build/host/jump-arena-shell/wasm-cartridge-port.js";
import {
  "->FixedTick" as createFixedTick,
  "->WorkbenchPolicy" as createWorkbenchPolicy,
  "->WorkbenchSequenceLimits" as createWorkbenchSequenceLimits,
  "create-cartridge-workbench!" as createCartridgeWorkbench,
  "create-workbench-envelope" as createWorkbenchEnvelope,
  type CartridgeWorkbench,
  type LifecycleReceipt,
  type WorkbenchEnvelope,
} from "../../build/host/jump-arena-shell/workbench.js";
import {
  clause_session_v1_command_bulk as commandSession,
  clause_session_v1_event_bulk as readSessionEvent,
  clause_session_v1_open_bulk as openSession,
  clause_session_v1_reclaim_retired as reclaimRetiredSession,
  initSync,
} from "#clause-runtime-wasm";

interface GenerationPayload {
  readonly generation: number;
  readonly compilerMicros: number;
  readonly cwr1: string;
  readonly sourceModifiedMillis: number;
  readonly hot: boolean;
}

type ResidentInput =
  | Readonly<{
      kind: "keyboard";
      code: string;
      phase: "down" | "up";
      repeat: boolean;
    }>
  | Readonly<{
      kind: "scalar-input";
      channel: string;
      value: number;
    }>;

type ResidentCommand =
  | Readonly<{ kind: "install-generation"; payload: GenerationPayload }>
  | Readonly<{ kind: "input"; input: ResidentInput }>
  | Readonly<{ kind: "dispose" }>;

type ResidentEvent =
  | Readonly<{ kind: "projection-frame"; frame: readonly number[] }>
  | Readonly<{ kind: "receipt"; receipt: LifecycleReceipt }>
  | Readonly<{ kind: "failure"; message: string }>;

interface ResidentWorkerScope {
  postMessage(message: ResidentEvent): void;
  addEventListener(
    type: "message",
    listener: (event: MessageEvent<ResidentCommand>) => void,
  ): void;
}

const workerScope = self as unknown as ResidentWorkerScope;
const maximum = Number.MAX_SAFE_INTEGER;
const policy = createWorkbenchPolicy(
  8,
  8,
  32,
  projectedTermPropertyLimit,
  projectedTermJsonLimit,
  createWorkbenchSequenceLimits(maximum, maximum, maximum, maximum, maximum),
);
const modulePromise = fetch("/wasm/clause_runtime_bg.wasm")
  .then((response) => {
    if (!response.ok) {
      throw new Error(`failed to fetch Clause Wasm: ${response.status}`);
    }
    return response.arrayBuffer();
  })
  .then((bytes) => {
    initSync({ module: bytes });
    return Object.freeze({
      clause_session_v1_open_bulk: (request: readonly number[]) =>
        openSession(new Uint8Array(request)),
      clause_session_v1_command_bulk: (request: readonly number[]) =>
        commandSession(new Uint8Array(request)),
      clause_session_v1_event_bulk: readSessionEvent,
      clause_session_v1_reclaim_retired: reclaimRetiredSession,
    });
  });

let controller: CartridgeWorkbench | null = null;
let inputInFlight = false;
let disposed = false;
let commands = Promise.resolve();
const inputQueue: ResidentInput[] = [];

function envelope(input: ResidentInput): WorkbenchEnvelope {
  const observation =
    input.kind === "keyboard"
      ? { kind: input.kind, code: input.code, phase: input.phase, repeat: input.repeat }
      : { kind: input.kind, channel: input.channel, value: input.value };
  return createWorkbenchEnvelope(policy, JSON.stringify([JSON.stringify(observation)]));
}

function flushInput(): void {
  if (inputInFlight || controller === null) return;
  const input = inputQueue[0];
  if (input === undefined) return;
  if (controller.observeInput(envelope(input))) {
    inputQueue.shift();
    inputInFlight = true;
  }
}

function handleReceipt(receipt: LifecycleReceipt): void {
  if (receipt.event === "admission-accepted") {
    inputInFlight = false;
  }
  workerScope.postMessage({ kind: "receipt", receipt });
  flushInput();
}

function exactFrame(frame: WorkbenchEnvelope): readonly number[] {
  const values = "toJSON" in frame ? frame.toJSON() : frame;
  return Array.from(values, (byte, index) => {
    if (
      typeof byte !== "number" ||
      !Number.isSafeInteger(byte) ||
      byte < 0 ||
      byte > 255
    ) {
      throw new TypeError(`resident projection frame[${index}] must be a byte`);
    }
    return byte;
  });
}

async function installGeneration(payload: GenerationPayload): Promise<void> {
  if (disposed) return;
  const module = await modulePromise;
  const request = createExactProcessRequest(decodeCwr1Hex(payload.cwr1));
  if (controller === null) {
    const port = createWasmCartridgePort(module, policy);
    controller = createCartridgeWorkbench(
      port,
      createFixedTick(16),
      policy,
      (milliseconds, callback) => {
        const handle = setInterval(callback, milliseconds);
        return () => clearInterval(handle);
      },
      (frame) => {
        if (frame.length === 0) return;
        workerScope.postMessage({
          kind: "projection-frame",
          frame: exactFrame(frame),
        });
      },
      handleReceipt,
      request,
    );
    flushInput();
    return;
  }
  if (!controller.reloadPackage(request)) {
    throw new Error("resident generation reload was not accepted");
  }
}

function queueInput(input: ResidentInput): void {
  if (input.kind === "scalar-input") {
    const pending = inputQueue.findIndex(
      (entry) => entry.kind === "scalar-input" && entry.channel === input.channel,
    );
    if (pending >= 0) inputQueue.splice(pending, 1);
  }
  inputQueue.push(input);
  flushInput();
}

async function handleCommand(command: ResidentCommand): Promise<void> {
  if (command.kind === "install-generation") {
    await installGeneration(command.payload);
  } else if (command.kind === "input") {
    queueInput(command.input);
  } else {
    disposed = true;
    controller?.dispose();
    controller = null;
  }
}

workerScope.addEventListener("message", (event) => {
  commands = commands.then(() => handleCommand(event.data)).catch((cause: unknown) => {
    const message = cause instanceof Error ? cause.message : String(cause);
    workerScope.postMessage({ kind: "failure", message });
  });
});

export {};
