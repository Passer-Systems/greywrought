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
  "workbench-byte-envelope-source" as workbenchByteEnvelopeSource,
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
  | Readonly<{ kind: "projection-frame"; frame: string | readonly number[] }>
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
let inFlightEdgeCode: string | null = null;
let simulationStarted = false;
let disposed = false;
let commands = Promise.resolve();
const inputQueue: ResidentInput[] = [];

// These bindings represent one discrete action per physical press. Keeping
// duplicate edges out of the transport queue prevents browser key-repeat (or
// a click storm) from becoming a delayed chain of attacks after the semantic
// sword commitment has elapsed.
const edgeTriggeredKeyboardCodes = new Set([
  "KeyJ",
  "KeyQ",
  "KeyF",
  "Space",
  "Tab",
  "ShiftTab",
  "KeyR",
]);

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
    inFlightEdgeCode =
      input.kind === "keyboard" &&
      input.phase === "down" &&
      edgeTriggeredKeyboardCodes.has(input.code)
        ? input.code
        : null;
  }
}

function handleReceipt(receipt: LifecycleReceipt): void {
  if (receipt.event === "admission-accepted") {
    inputInFlight = false;
    inFlightEdgeCode = null;
  }
  workerScope.postMessage({ kind: "receipt", receipt });
  flushInput();
}

function exactFrame(frame: WorkbenchEnvelope): string | readonly number[] {
  if ("toJSON" in frame) {
    const source = workbenchByteEnvelopeSource(frame);
    if (source === null) throw new Error("resident byte envelope lost custody");
    return source;
  }
  const values = frame;
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
        // Hold the fixed-tick clock at the authored spawn until the player
        // supplies the first gameplay key. This prevents slow WebGL/asset
        // startup from consuming the encounter before input can arrive.
        const handle = setInterval(() => {
          if (simulationStarted) callback();
        }, milliseconds);
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
  if (input.kind === "keyboard") simulationStarted = true;
  if (
    input.kind === "keyboard" &&
    input.phase === "down" &&
    edgeTriggeredKeyboardCodes.has(input.code)
  ) {
    // Browser key-repeat is not a second physical action. Also collapse an
    // edge that is already in flight or waiting behind it.
    if (input.repeat || inFlightEdgeCode === input.code) return;
    if (
      inputQueue.some(
        (entry) =>
          entry.kind === "keyboard" &&
          entry.phase === "down" &&
          entry.code === input.code,
      )
    ) {
      return;
    }
  }
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
