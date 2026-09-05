import {
  "->ExactProcessRequest" as createExactProcessRequest,
  "create-wasm-cartridge-port" as createWasmCartridgePort,
  "cse1-projected-term-json-max-source-units" as projectedTermJsonLimit,
  "cse1-projected-term-max-properties" as projectedTermPropertyLimit,
  "decode-cwr1-hex" as decodeCwr1Hex,
  "decode-projected-term-frame" as decodeProjectedTermFrame,
  type ProjectedValue,
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
      capturedExternalGeneration: number;
      capturedWorkbenchGeneration: number;
    }>
  | Readonly<{
      kind: "scalar-input";
      channel: string;
      value: number;
      capturedExternalGeneration: number;
      capturedWorkbenchGeneration: number;
    }>
  | Readonly<{
      kind: "referent-input";
      channel: string;
      capturedExternalGeneration: number;
      capturedWorkbenchGeneration: number;
      value: ProjectedValue;
    }>;

type ResidentCommand =
  | Readonly<{ kind: "install-generation"; payload: GenerationPayload }>
  | Readonly<{ kind: "input"; input: ResidentInput }>
  | Readonly<{ kind: "dispose" }>;

type ResidentEvent =
  | Readonly<{
      kind: "projection";
      generation: number;
      workbenchGeneration: number;
      projection: ProjectedValue;
      frameUnits: number;
    }>
  | Readonly<{
      kind: "receipt";
      generation: number;
      receipt: LifecycleReceipt;
    }>
  | Readonly<{
      kind: "heartbeat";
      workerTimeMillis: number;
      pendingInputCount: number;
      pendingObservationCount: number;
      workbenchPhase: string;
      receivedInputCount: number;
      acceptedInputCount: number;
      maximumInputQueueDepth: number;
      inputBackpressureCount: number;
    }>
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
const modulePromise = fetch(
  new URL("../../wasm/clause_runtime_bg.wasm", self.location.href),
)
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
let activeExternalGeneration = -1;
let activeWorkbenchGeneration = -1;
let pendingExternalGeneration: number | null = null;
let flushingInput = false;
let simulationStarted = false;
let disposed = false;
let commands = Promise.resolve();
const inputQueue: ResidentInput[] = [];
let heartbeatHandle: ReturnType<typeof setInterval> | null = null;
let receivedInputCount = 0;
let acceptedInputCount = 0;
let maximumInputQueueDepth = 0;
let inputBackpressureCount = 0;

// These bindings represent one discrete action per physical press. Keeping
// browser key-repeat out of the transport queue prevents a held action key
// from becoming a delayed chain of attacks after the semantic commitment has
// elapsed.
const edgeTriggeredKeyboardCodes = new Set([
  "ClearSelection",
  "IssueMove",
]);
const rtsKeyboardCodes = new Set(edgeTriggeredKeyboardCodes);

function envelope(input: ResidentInput): WorkbenchEnvelope | null {
  if (
    (input.capturedExternalGeneration !== activeExternalGeneration ||
      input.capturedWorkbenchGeneration !== activeWorkbenchGeneration)
  ) {
    return null;
  }
  const observation = input.kind === "keyboard"
    ? { kind: input.kind, code: input.code, phase: input.phase, repeat: input.repeat }
    : input.kind === "scalar-input"
      ? { kind: input.kind, channel: input.channel, value: input.value }
      : {
          kind: input.kind,
          channel: input.channel,
          generation: input.capturedWorkbenchGeneration,
          value: input.value,
        };
  return createWorkbenchEnvelope(policy, JSON.stringify([JSON.stringify(observation)]));
}

function flushInput(): void {
  if (flushingInput || controller === null) return;
  flushingInput = true;
  try {
    while (inputQueue.length > 0) {
      const input = inputQueue.shift()!;
      // observeInput emits configuration receipts synchronously. Remove the
      // item before crossing that boundary so a receipt cannot recursively
      // submit the same physical input and then shift unrelated inputs while
      // the stack unwinds.
      const captured = envelope(input);
      if (captured === null) continue;
      if (!controller.observeInput(captured)) {
        inputBackpressureCount += 1;
        inputQueue.unshift(input);
        return;
      }
      acceptedInputCount += 1;
    }
  } finally {
    flushingInput = false;
  }
}

function handleReceipt(receipt: LifecycleReceipt): void {
  if (receipt.event === "session-started" && pendingExternalGeneration !== null) {
    activeExternalGeneration = pendingExternalGeneration;
    activeWorkbenchGeneration = receipt.activeGeneration;
    pendingExternalGeneration = null;
  }
  const externalGeneration =
    receipt.event === "package-rejected" || receipt.event === "session-failed"
      ? (pendingExternalGeneration ?? activeExternalGeneration)
      : activeExternalGeneration;
  workerScope.postMessage({
    kind: "receipt",
    generation: externalGeneration,
    receipt,
  });
  if (
    receipt.event === "candidate-failed" ||
    receipt.event === "admission-rejected" ||
    receipt.event === "session-failed" ||
    receipt.event === "package-rejected"
  ) {
    if (
      receipt.event === "session-failed" ||
      receipt.event === "package-rejected"
    ) {
      pendingExternalGeneration = null;
    }
    simulationStarted = false;
    inputQueue.length = 0;
    return;
  }
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
  pendingExternalGeneration = payload.generation;
  if (controller === null) {
    const port = createWasmCartridgePort(module, policy);
    controller = createCartridgeWorkbench(
      port,
      createFixedTick(16),
      policy,
      (milliseconds, callback) => {
        const handle = setInterval(() => {
          callback();
        }, milliseconds);
        return () => clearInterval(handle);
      },
      (frame) => {
        if (frame.length === 0) return;
        try {
          const exact = exactFrame(frame);
          // The first admitted frame may publish synchronously while the
          // workbench constructor is still returning. Its session-started
          // receipt carries the same active generation; later frames read the
          // canonical snapshot directly.
          const workbenchGeneration = controller?.snapshot().generation ?? activeWorkbenchGeneration;
          if (workbenchGeneration < 0) {
            throw new Error("resident projection omitted its workbench generation");
          }
          activeWorkbenchGeneration = workbenchGeneration;
          workerScope.postMessage({
            kind: "projection",
            generation: activeExternalGeneration,
            workbenchGeneration,
            projection: decodeProjectedTermFrame(exact),
            frameUnits: exact.length,
          });
        } catch (cause: unknown) {
          workerScope.postMessage({
            kind: "failure",
            message: cause instanceof Error ? cause.message : String(cause),
          });
          throw cause;
        }
      },
      handleReceipt,
      request,
    );
    simulationStarted = true;
    heartbeatHandle = setInterval(() => {
      if (!disposed) {
        const snapshot = controller?.snapshot();
        workerScope.postMessage({
          kind: "heartbeat",
          workerTimeMillis: performance.now(),
          pendingInputCount: inputQueue.length,
          pendingObservationCount: snapshot?.pendingObservations ?? 0,
          workbenchPhase: snapshot?.phase ?? "opening",
          receivedInputCount,
          acceptedInputCount,
          maximumInputQueueDepth,
          inputBackpressureCount,
        });
      }
    }, 500);
    flushInput();
    return;
  }
  if (!controller.reloadPackage(request)) {
    pendingExternalGeneration = null;
    throw new Error("resident generation reload was not accepted");
  }
}

function queueInput(input: ResidentInput): void {
  receivedInputCount += 1;
  if (input.kind === "keyboard" && !rtsKeyboardCodes.has(input.code)) return;
  if (
    input.kind === "scalar-input" &&
    input.channel !== "PointerWorldX" &&
    input.channel !== "PointerWorldZ"
  ) return;
  if (
    input.capturedExternalGeneration !== activeExternalGeneration ||
    input.capturedWorkbenchGeneration !== activeWorkbenchGeneration
  ) return;
  if (input.kind === "referent-input" && input.channel !== "Pick") return;
  if (input.kind === "keyboard") simulationStarted = true;
  if (
    input.kind === "keyboard" &&
    input.phase === "down" &&
    edgeTriggeredKeyboardCodes.has(input.code)
  ) {
    // Browser key-repeat is not a second physical action. Collapse a duplicate
    // edge still waiting for the workbench's bounded observation capacity.
    if (input.repeat) return;
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
  maximumInputQueueDepth = Math.max(maximumInputQueueDepth, inputQueue.length);
  flushInput();
}

async function handleCommand(command: ResidentCommand): Promise<void> {
  if (command.kind === "install-generation") {
    await installGeneration(command.payload);
  } else if (command.kind === "input") {
    queueInput(command.input);
  } else {
    disposed = true;
    if (heartbeatHandle !== null) clearInterval(heartbeatHandle);
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
