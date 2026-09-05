import {
  "->ExactProcessRequest" as createExactProcessRequest,
  "create-wasm-cartridge-port" as createWasmCartridgePort,
  "cse1-projected-term-json-max-source-units" as projectedTermJsonLimit,
  "cse1-projected-term-max-properties" as projectedTermPropertyLimit,
  "decode-cwr1-hex" as decodeCwr1Hex,
  "decode-projected-term-frame" as decodeProjectedTermFrame,
  editSourceSession,
  explainSession,
  explanationRelationRows,
  checkedProjectedReferent,
  finiteScalarInterventionQuery,
  interveneSession,
  projectedRelationRowValue,
  sourceContinuity,
  type ExplainedRelationRow,
  type FiniteScalarChange,
  type ProjectedValue,
} from "../../build/host/jump-arena-shell/wasm-cartridge-port.js";
import {
  "->FixedTick" as createFixedTick,
  "->CartridgePort" as createCartridgePort,
  "->WorkbenchPolicy" as createWorkbenchPolicy,
  "->WorkbenchSequenceLimits" as createWorkbenchSequenceLimits,
  "create-cartridge-workbench!" as createCartridgeWorkbench,
  "create-workbench-envelope" as createWorkbenchEnvelope,
  "workbench-byte-envelope-source" as workbenchByteEnvelopeSource,
  type CartridgeWorkbench,
  type LifecycleReceipt,
  type WorkbenchEnvelope,
} from "../../build/host/jump-arena-shell/workbench.js";
import * as clauseRuntime from "#clause-runtime-wasm";

interface GenerationPayload {
  readonly generation: number;
  readonly compilerMicros: number;
  readonly cwr1: string;
  readonly sourceModifiedMillis: number;
  readonly hot: boolean;
  readonly cet1: string | null;
  readonly scalarEffects: readonly ScalarEffectPayload[];
  readonly entries: Readonly<{ attack: number; heal: number }>;
}

interface ScalarEffectPayload {
  readonly index: number;
  readonly handler: number;
  readonly effect: number;
  readonly start: number;
  readonly end: number;
  readonly artifact: string;
  readonly expression: string;
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
  | Readonly<{ kind: "install-edit"; payload: GenerationPayload }>
  | Readonly<{
      kind: "fence-edit";
      capturedExternalGeneration: number;
      capturedWorkbenchGeneration: number;
    }>
  | Readonly<{
      kind: "release-edit";
      capturedExternalGeneration: number;
      capturedWorkbenchGeneration: number;
    }>
  | Readonly<{ kind: "input"; input: ResidentInput }>
  | Readonly<{
      kind: "diagnose";
      capturedExternalGeneration: number;
      capturedWorkbenchGeneration: number;
      entry: "attack" | "heal";
      interventionTarget?: unknown;
    }>
  | Readonly<{ kind: "dispose" }>;

type ResidentEvent =
  | Readonly<{
      kind: "edit-fenced";
      generation: number;
      workbenchGeneration: number;
    }>
  | Readonly<{
      kind: "projection";
      generation: number;
      workbenchGeneration: number;
      projection: ProjectedValue;
      frameUnits: number;
      workerSentEpochMillis?: number;
    }>
  | Readonly<{
      kind: "live-edit";
      generation: number;
      workbenchGeneration: number;
      elapsedMillis: number;
      compilerMillis: number;
      continuity: ProjectedValue;
    }>
  | Readonly<{
      kind: "diagnostic";
      generation: number;
      workbenchGeneration: number;
      entry: "attack" | "heal";
      explanation: ProjectedValue;
      explanationRows: readonly ExplainedRelationRow[];
      intervention: ProjectedValue | null;
      boundedIntervention: ProjectedValue | null;
      interventionChoiceCount: number;
      interventionTargetValue: ProjectedValue | null;
    }>
  | Readonly<{
      kind: "receipt";
      generation: number;
      receipt: LifecycleReceipt;
      workerSentEpochMillis?: number;
    }>
  | Readonly<{
      kind: "measurement-input";
      input: ResidentInput;
      configurationRevision: number;
      receiptSequence: number;
      activeGeneration: number;
      workerSentEpochMillis: number;
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
const measurementEnabled = new URL(self.location.href).searchParams.get("measure") === "1";
const workerEpochMillis = (): number => performance.timeOrigin + performance.now();
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
    clauseRuntime.initSync({ module: bytes });
    return clauseRuntime;
  });

let controller: CartridgeWorkbench | null = null;
let activeExternalGeneration = -1;
let activeWorkbenchGeneration = -1;
let pendingExternalGeneration: number | null = null;
let liveSession: unknown = null;
let pendingEdit: GenerationPayload | null = null;
let pendingEditStarted = 0;
let currentEntries: Readonly<{ attack: number; heal: number }> | null = null;
let sourceEditFence = false;
let observingInput: ResidentInput | null = null;
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
  "BeginEncounter",
  "Attack",
  "Ignite",
  "Heal",
  "Ward",
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
      let observed = false;
      observingInput = input;
      try {
        observed = controller.observeInput(captured);
      } finally {
        observingInput = null;
      }
      if (!observed) {
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
  if (measurementEnabled && receipt.event === "configuration-observed" && observingInput !== null) {
    workerScope.postMessage({
      kind: "measurement-input",
      input: observingInput,
      configurationRevision: receipt.configurationRevision,
      receiptSequence: receipt.sequence,
      activeGeneration: receipt.activeGeneration,
      workerSentEpochMillis: workerEpochMillis(),
    });
  }
  if (receipt.event === "session-started" && pendingExternalGeneration !== null) {
    activeExternalGeneration = pendingExternalGeneration;
    activeWorkbenchGeneration = receipt.activeGeneration;
    pendingExternalGeneration = null;
    if (pendingEdit !== null && liveSession !== null) {
      const payload = pendingEdit;
      pendingEdit = null;
      workerScope.postMessage({
        kind: "live-edit",
        generation: activeExternalGeneration,
        workbenchGeneration: activeWorkbenchGeneration,
        elapsedMillis: performance.now() - pendingEditStarted,
        compilerMillis: payload.compilerMicros / 1_000,
        continuity: sourceContinuity(clauseRuntime, liveSession),
      });
      currentEntries = payload.entries;
      sourceEditFence = false;
    }
  }
  const externalGeneration =
    receipt.event === "package-rejected" || receipt.event === "session-failed"
      ? (pendingExternalGeneration ?? activeExternalGeneration)
      : activeExternalGeneration;
  workerScope.postMessage({
    kind: "receipt",
    generation: externalGeneration,
    receipt,
    ...(measurementEnabled ? { workerSentEpochMillis: workerEpochMillis() } : {}),
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
    const basePort = createWasmCartridgePort(module, policy);
      const port = createCartridgePort(
      basePort.acceptPackage,
      (acceptedPackage, generation, complete) => {
        if (pendingEdit !== null) {
          const edit = pendingEdit;
          if (liveSession === null || edit.cet1 === null) {
            throw new Error("live source edit omitted captured session or CET1");
          }
          const result = editSourceSession(
            module,
            liveSession,
            generation,
            createExactProcessRequest(decodeCwr1Hex(edit.cwr1)),
            decodeCwr1Hex(edit.cet1),
            policy,
          );
          if (result._tag === "SessionStarted") liveSession = result.session;
          return complete(result);
        }
        return basePort.startSession(acceptedPackage, generation, (result) => {
          if (result._tag === "SessionStarted") liveSession = result.session;
          return complete(result);
        });
      },
      basePort.runCandidate,
      basePort.requestAdmission,
      basePort.disposeSession,
    );
    controller = createCartridgeWorkbench(
      port,
      createFixedTick(16),
      policy,
      (milliseconds, callback) => {
        const handle = setInterval(() => {
          if (!sourceEditFence) callback();
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
            ...(measurementEnabled ? { workerSentEpochMillis: workerEpochMillis() } : {}),
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
    currentEntries = payload.entries;
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

async function installEdit(payload: GenerationPayload): Promise<void> {
  if (
    controller === null || liveSession === null || payload.cet1 === null ||
    !sourceEditFence ||
    payload.generation <= activeExternalGeneration ||
    controller.snapshot().pendingObservations !== 0 || inputQueue.length !== 0
  ) {
    throw new Error("live source edit is stale or the runtime boundary is not settled");
  }
  pendingEdit = payload;
  pendingEditStarted = performance.now();
  try {
    await installGeneration(payload);
  } catch (cause) {
    pendingEdit = null;
    throw cause;
  }
}

function fenceEdit(
  command: Extract<ResidentCommand, { kind: "fence-edit" }>,
): void {
  if (
    sourceEditFence || controller === null || liveSession === null ||
    command.capturedExternalGeneration !== activeExternalGeneration ||
    command.capturedWorkbenchGeneration !== activeWorkbenchGeneration ||
    controller.snapshot().pendingObservations !== 0 || inputQueue.length !== 0 || flushingInput
  ) throw new Error("live source edit boundary is not settled");
  sourceEditFence = true;
  workerScope.postMessage({
    kind: "edit-fenced",
    generation: activeExternalGeneration,
    workbenchGeneration: activeWorkbenchGeneration,
  });
}

function releaseEdit(
  command: Extract<ResidentCommand, { kind: "release-edit" }>,
): void {
  if (
    !sourceEditFence || pendingEdit !== null ||
    command.capturedExternalGeneration !== activeExternalGeneration ||
    command.capturedWorkbenchGeneration !== activeWorkbenchGeneration
  ) throw new Error("live source edit release is stale");
  sourceEditFence = false;
}

function object(value: unknown, context: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${context} is not an object`);
  }
  return value as Record<string, unknown>;
}

function diagnose(command: Extract<ResidentCommand, { kind: "diagnose" }>): void {
  if (
    liveSession === null || currentEntries === null ||
    command.capturedExternalGeneration !== activeExternalGeneration ||
    command.capturedWorkbenchGeneration !== activeWorkbenchGeneration
  ) {
    throw new Error("diagnostic request is stale");
  }
  const entry = currentEntries[command.entry];
  const explanation = explainSession(clauseRuntime, liveSession, entry);
  const explanationRows = explanationRelationRows(explanation);
  let intervention: ProjectedValue | null = null;
  let boundedIntervention: ProjectedValue | null = null;
  let interventionChoiceCount = 0;
  let interventionTargetValue: ProjectedValue | null = null;
  if (command.interventionTarget !== undefined) {
    const detail = object(explanation, "explanation");
    const allowed: FiniteScalarChange[] = [];
    let vitality = -1;
    const target = checkedProjectedReferent(command.interventionTarget);
    for (const row of explanationRows) {
      if (row.source.relation === "selected" && row.before === true) allowed.push({ slot: row.slot, subject: row.subject, value: false });
      if (row.source.relation === "vitality") vitality = row.slot;
    }
    if (allowed.length === 0 || vitality < 0 || typeof detail.step !== "string") {
      throw new Error("recorded attack lacks bounded intervention coordinates");
    }
    interventionChoiceCount = allowed.length;
    intervention = interveneSession(
      clauseRuntime,
      liveSession,
      finiteScalarInterventionQuery(detail.step, allowed, 32, { slot: vitality, subject: target, greaterThan: 0 }),
    );
    boundedIntervention = interveneSession(
      clauseRuntime,
      liveSession,
      finiteScalarInterventionQuery(detail.step, allowed, 1, { slot: vitality, subject: target, greaterThan: 0 }),
    );
    const answer = object(intervention, "intervention answer");
    if (answer.predicted !== undefined) {
      const pages = object(answer.predicted, "intervention prediction");
      const page = object(pages[String(Math.floor(vitality / 64))], "prediction page");
      interventionTargetValue = projectedRelationRowValue(page[String(vitality % 64)] as ProjectedValue, target) ?? null;
    }
  }
  workerScope.postMessage({
    kind: "diagnostic",
    generation: activeExternalGeneration,
    workbenchGeneration: activeWorkbenchGeneration,
    entry: command.entry,
    explanation,
    explanationRows,
    intervention,
    boundedIntervention,
    interventionChoiceCount,
    interventionTargetValue,
  });
}

function queueInput(input: ResidentInput): void {
  receivedInputCount += 1;
  if (sourceEditFence) return;
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
  if (
    input.kind === "referent-input" &&
    input.channel !== "Pick" &&
    input.channel !== "Target"
  ) return;
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
  } else if (command.kind === "install-edit") {
    await installEdit(command.payload);
  } else if (command.kind === "fence-edit") {
    fenceEdit(command);
  } else if (command.kind === "release-edit") {
    releaseEdit(command);
  } else if (command.kind === "input") {
    queueInput(command.input);
  } else if (command.kind === "diagnose") {
    diagnose(command);
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
