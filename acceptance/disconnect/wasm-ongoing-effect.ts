import {
  "->ExactProcessRequest" as createExactProcessRequest,
  "advance-session-occurrence!" as advanceSessionOccurrence,
  "begin-effect-attempt!" as beginEffectAttempt,
  "create-wasm-cartridge-port" as createWasmCartridgePort,
  "decode-cwr1-hex" as decodeCwr1Hex,
  "emit-effect-intent!" as emitEffectIntent,
  "issue-effect-authorization!" as issueEffectAuthorization,
  "resume-session!" as resumeSession,
  "settle-effect-attempt!" as settleEffectAttempt,
  "suspend-session!" as suspendSession,
} from "../../build/host/jump-arena-shell/wasm-cartridge-port.js";
import {
  "->WorkbenchPolicy" as createWorkbenchPolicy,
  "->WorkbenchSequenceLimits" as createWorkbenchSequenceLimits,
  type CartridgePort,
  type PackageCheck,
  type SessionCompletion,
} from "../../build/host/jump-arena-shell/workbench.js";
import {
  clause_session_v1_command_bulk as commandSession,
  clause_session_v1_event_bulk as readSessionEvent,
  clause_session_v1_open_bulk as openSession,
  clause_session_v1_reclaim_retired as reclaimRetiredSession,
  initSync,
} from "#clause-runtime-wasm";
import { identityString } from "../../src/host/foreign.js";

function requireCondition(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function policy() {
  const maximum = Number.MAX_SAFE_INTEGER;
  return createWorkbenchPolicy(
    8,
    8,
    32,
    128,
    512,
    createWorkbenchSequenceLimits(
      maximum,
      maximum,
      maximum,
      maximum,
      maximum,
    ),
  );
}

function initializeSessionModule(bytes: ArrayBuffer): object {
  initSync({ module: bytes });
  return Object.freeze({
    clause_session_v1_open_bulk: (request: readonly number[]) =>
      openSession(new Uint8Array(request)),
    clause_session_v1_command_bulk: (request: readonly number[]) =>
      commandSession(new Uint8Array(request)),
    clause_session_v1_event_bulk: readSessionEvent,
    clause_session_v1_reclaim_retired: reclaimRetiredSession,
  });
}

function requireAcceptedPackage(result: PackageCheck | null): unknown {
  if (result === null) throw new Error("real Wasm returned no package result");
  if (result._tag === "PackageRejected") {
    throw new Error(`real Wasm rejected the ongoing-effect cartridge: ${result.reason}`);
  }
  return result.acceptedPackage;
}

function requireStartedSession(result: SessionCompletion | null): unknown {
  if (result === null) throw new Error("real Wasm returned no session result");
  if (result._tag === "SessionFailed") {
    throw new Error(`real Wasm did not open the ongoing-effect session: ${result.reason}`);
  }
  return result.session;
}

function openEffectSession(module: object, request: unknown): {
  readonly port: CartridgePort;
  readonly session: unknown;
} {
  const port = createWasmCartridgePort(module, policy());
  let packageResult: PackageCheck | null = null;
  port.acceptPackage(request, (result) => {
    packageResult = result;
  });
  let sessionResult: SessionCompletion | null = null;
  port.startSession(requireAcceptedPackage(packageResult), 1, (result) => {
    sessionResult = result;
  });
  return { port, session: requireStartedSession(sessionResult) };
}

async function main(): Promise<void> {
  const [wasmBytes, source] = await Promise.all([
    Bun.file("./build/host/wasm/clause_runtime_bg.wasm").arrayBuffer(),
    Bun.file("./build/ongoing-effect/ongoing-effect-v1.cwr1.hex").text(),
  ]);
  const module = initializeSessionModule(wasmBytes);
  const request = createExactProcessRequest(decodeCwr1Hex(source));
  const { port, session } = openEffectSession(module, request);
  const first = advanceSessionOccurrence(module, session, 0);
  const suspension = suspendSession(module, session);
  const resumption = resumeSession(module, session);
  const second = advanceSessionOccurrence(module, session, 1);
  const intent = emitEffectIntent(module, session);
  const issued = issueEffectAuthorization(module, session, intent.intentId);
  const attempt = beginEffectAttempt(module, session, issued.authorizationId);
  const target = "./build/ongoing-effect/wasm-receipt.bin";
  const payload = new Uint8Array(attempt.payloadBytes);
  const stateCount = String(intent.stateRevisionCount);

  requireCondition(first.kind === "input", "first moonwell advance did not reach Wasm");
  requireCondition(second.kind === "input", "second moonwell advance did not reach Wasm");
  requireCondition(
    identityString(suspension.activation) === identityString(resumption.activation),
    "suspension and resumption changed Activation",
  );
  requireCondition(
    identityString(intent.activation) === identityString(suspension.activation),
    "effect intent escaped its ongoing Activation",
  );
  requireCondition(
    identityString(suspension.continuation) ===
      identityString(resumption.continuation),
    "resumption took up a different Continuation",
  );
  requireCondition(
    identityString(suspension.step) !== identityString(resumption.step),
    "physical polling collapsed semantic Steps",
  );
  requireCondition(
    identityString(attempt.intentId) === identityString(intent.intentId),
    "attempt changed the exact effect intent",
  );
  requireCondition(
    identityString(attempt.authorizationId) === identityString(issued.authorizationId),
    "attempt lost its scoped authorization",
  );
  requireCondition(
    identityString(attempt.actionBytes) === identityString(intent.actionBytes),
    "attempt changed the Clause-owned action",
  );
  requireCondition(
    identityString(attempt.resourceBytes) === identityString(intent.resourceBytes),
    "attempt changed the Clause-owned resource",
  );
  requireCondition(
    identityString(attempt.payloadBytes) === identityString(intent.payloadBytes),
    "attempt changed the Clause-owned payload",
  );

  const written = await Bun.write(target, payload);
  requireCondition(written === payload.length, "Bun did not materialize every exact payload byte");
  const receiptBuffer = await Bun.file(target).arrayBuffer();
  const receipt = Array.from(new Uint8Array(receiptBuffer));
  const settled = settleEffectAttempt(
    module,
    session,
    attempt.attemptId,
    0,
    receipt,
  );
  requireCondition(
    identityString(receipt) === identityString(attempt.payloadBytes),
    "durable host receipt changed the exact payload",
  );
  requireCondition(
    settled.disposition === "receipt-observed",
    "effect receipt was not judged as observed",
  );
  requireCondition(settled.receiptId !== null, "effect settlement retained no receipt");
  requireCondition(
    settled.observationId !== null,
    "effect settlement retained no Observation",
  );
  requireCondition(
    settled.judgmentId.length > 0,
    "effect settlement retained no Judgment",
  );
  requireCondition(
    String(settled.stateRevisionCount) === stateCount,
    "effect evidence created an authoritative StateRevision",
  );
  port.disposeSession(session);
  console.log(
    `wasm moonwell effect intent=${identityString(intent.intentId)} receipt=${identityString(settled.receiptId)} state-revisions=${stateCount}`,
  );
}

await main();
