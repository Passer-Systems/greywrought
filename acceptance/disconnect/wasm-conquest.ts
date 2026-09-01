import {
  "adjudicate-branch-reconnect!" as adjudicateBranchReconnect,
  "admit-authoritative-occurrences!" as admitAuthoritativeOccurrences,
  "dispose-process-branch!" as disposeProcessBranch,
  "explain-process-branch!" as explainProcessBranch,
  "open-process-branch!" as openProcessBranch,
  "propose-branch-reconnect!" as proposeBranchReconnect,
  type ProcessCommandEvidenceV1,
} from "../../build/host/jump-arena-shell/branch-wasm-port.js";
import {
  "->ExactProcessRequest" as createExactProcessRequest,
  "decode-cwr1-hex" as decodeCwr1Hex,
  "decode-projected-term-frame" as decodeProjectedTermFrame,
  "process-request-occurrences!" as processRequestOccurrences,
  type ProjectedObject,
  type ProjectedValue,
} from "../../build/host/jump-arena-shell/wasm-cartridge-port.js";
import {
  clause_branch_v1_command as branchCommand,
  clause_branch_v1_event_byte as branchEventByte,
  clause_branch_v1_event_len as branchEventLength,
  clause_branch_v1_io_reset as resetBranchIo,
  clause_branch_v1_open as openBranch,
  clause_branch_v1_request_push as pushBranchRequest,
  initSync,
} from "#clause-runtime-wasm";
import {
  createBranchExplanationView,
  renderBranchExplanation,
} from "../../src/host/presentation.js";
import { identityString } from "../../src/host/foreign.js";

function requireCondition(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function requireValue<T>(value: T | undefined, context: string): T {
  if (value === undefined) throw new Error(`${context} is absent`);
  return value;
}

function isProjectedArray(
  value: ProjectedValue,
): value is readonly ProjectedValue[] {
  return Array.isArray(value);
}

function requireProjectedObject(
  value: ProjectedValue,
  context: string,
): ProjectedObject {
  if (typeof value !== "object" || value === null || isProjectedArray(value)) {
    throw new Error(`${context} is not a projected object`);
  }
  return value;
}

function projectedField(
  value: ProjectedValue,
  field: string,
  context: string,
): ProjectedValue {
  const result = requireProjectedObject(value, context)[field];
  if (result === undefined) throw new Error(`${context}.${field} is absent`);
  return result;
}

function initializeBranchModule(bytes: ArrayBuffer): object {
  initSync({ module: bytes });
  return Object.freeze({
    clause_branch_v1_io_reset: resetBranchIo,
    clause_branch_v1_request_push: pushBranchRequest,
    clause_branch_v1_open: openBranch,
    clause_branch_v1_command: branchCommand,
    clause_branch_v1_event_len: branchEventLength,
    clause_branch_v1_event_byte: branchEventByte,
  });
}

function evidenceAt(
  evidence: readonly ProcessCommandEvidenceV1[],
  index: number,
  context: string,
): ProcessCommandEvidenceV1 {
  return requireValue(evidence[index], context);
}

async function main(): Promise<void> {
  const [wasmBytes, source] = await Promise.all([
    Bun.file("./build/host/wasm/clause_runtime_bg.wasm").arrayBuffer(),
    Bun.file("./build/conquest/conquest-v1.cwr1.hex").text(),
  ]);
  const module = initializeBranchModule(wasmBytes);
  const request = createExactProcessRequest(decodeCwr1Hex(source));
  const occurrences = processRequestOccurrences(request);
  const worldShift = requireValue(occurrences[0], "world-shift occurrence");
  const combat = occurrences.slice(1);
  const processBranch = openProcessBranch(
    module,
    request,
    41,
    worldShift,
    8,
  );
  const { opened } = processBranch;
  const { pins } = opened;
  const parent = pins.parentState;
  const branchRun = opened.ancestry.run;
  const authoritative = admitAuthoritativeOccurrences(module, processBranch, [
    worldShift,
  ]);
  const r1 = authoritative.successor;
  const proposal = proposeBranchReconnect(module, processBranch, combat);
  const { evidence } = proposal;
  const admitted = adjudicateBranchReconnect(
    module,
    processBranch,
    proposal,
    r1,
    combat,
  );
  const { explanation } = admitted;
  const queried = explainProcessBranch(module, processBranch).explanation;
  const randomEvidence = evidenceAt(
    evidence.commandEvidence,
    1,
    "random command evidence",
  );
  const firstEvidence = evidenceAt(
    evidence.commandEvidence,
    0,
    "attack command evidence",
  );
  const explainedRandom = evidenceAt(
    explanation.branchCommandEvidence,
    1,
    "explained random command",
  );
  const authoritativeRandom = evidenceAt(
    explanation.authoritativeCommandEvidence,
    1,
    "authoritative random command",
  );
  const randomOccurrence = requireValue(combat[1], "random occurrence");
  requireCondition(
    admitted.projection !== null,
    "Wasm exposed no admitted world projection",
  );
  const admittedFrame = decodeProjectedTermFrame(admitted.projection.termBytes);
  const strike = projectedField(admittedFrame, "ember-strike", "admitted frame");
  const randomSource = projectedField(
    admittedFrame,
    "combat-random",
    "admitted frame",
  );
  const randomSample = projectedField(
    randomSource,
    "random-sample",
    "combat-random",
  );
  const enemy = projectedField(admittedFrame, "cinder-wraith", "admitted frame");
  const loot = projectedField(admittedFrame, "ashen-key", "admitted frame");
  const rendered = renderBranchExplanation(
    createBranchExplanationView(
      identityString(parent),
      identityString(pins.programRevision),
      identityString(pins.rootPolicy),
      identityString(opened.ancestry.activation),
      identityString(evidence.candidate),
      "admitted",
      identityString(admitted.successor),
    ),
  );

  requireCondition(pins.disconnectTick === 41, "Wasm branch lost its disconnect tick");
  requireCondition(
    identityString(authoritative.predecessor) === identityString(parent),
    "authoritative advance did not start at R0",
  );
  requireCondition(
    identityString(r1) !== identityString(parent),
    "authoritative Admission did not establish R1",
  );
  requireCondition(
    identityString(authoritative.run) !== identityString(branchRun),
    "serialized host order manufactured one shared Run",
  );
  requireCondition(
    identityString(authoritative.activation) !==
      identityString(evidence.ancestry.activation),
    "branch attack and authoritative replay shared one Activation",
  );
  requireCondition(
    identityString(evidence.pins.parentState) === identityString(parent),
    "reconnect evidence lost its exact parent",
  );
  requireCondition(
    identityString(evidence.ancestry.run) === identityString(branchRun),
    "reconnect evidence lost branch ancestry",
  );
  requireCondition(
    evidence.commandEvidence.length >= 5,
    "branch proposal retained no complete combat command family",
  );
  requireCondition(
    identityString(firstEvidence.step) !== identityString(randomEvidence.step),
    "attack and random input collapsed into one Step",
  );
  requireCondition(
    identityString(randomEvidence.occurrence) === identityString(randomOccurrence),
    "random command evidence lost its exact entered occurrence",
  );
  requireCondition(
    identityString(randomEvidence) === identityString(explainedRandom),
    "explanation lost the branch random Observation and Step",
  );
  requireCondition(
    identityString(authoritativeRandom.occurrence) ===
      identityString(randomEvidence.occurrence),
    "authoritative replay changed the selected random occurrence",
  );
  requireCondition(
    identityString(authoritativeRandom.observation) !==
      identityString(randomEvidence.observation),
    "branch and authoritative replay shared one Observation identity",
  );
  requireCondition(
    identityString(admitted.predecessor) === identityString(r1),
    "reconnect Admission did not replay against R1",
  );
  requireCondition(
    identityString(admitted.successor) !== identityString(r1),
    "Admission did not establish the successor",
  );
  requireCondition(
    identityString(admitted.branchCandidate) === identityString(evidence.candidate),
    "Admission lost the retained branch CandidateDelta",
  );
  requireCondition(
    identityString(queried) === identityString(explanation),
    "retained causal explanation changed when queried",
  );
  requireCondition(explanation.causalRecords.length > 0, "causal explanation is empty");
  requireCondition(
    projectedField(strike, "attack-state", "ember-strike") === "resolved",
    "Wasm projection did not resolve the Clause-owned attack",
  );
  requireCondition(
    projectedField(randomSample, "x", "random-sample") === 0.95,
    "Wasm projection lost the explicit random selection",
  );
  requireCondition(
    projectedField(enemy, "vitality", "cinder-wraith") === 0,
    "Wasm projection did not retain Clause-owned damage",
  );
  requireCondition(
    projectedField(enemy, "combat-status", "cinder-wraith") === "dead",
    "Wasm projection did not retain Clause-owned death",
  );
  requireCondition(
    projectedField(loot, "custody", "ashen-key") === "ashen-wayfarer",
    "Wasm projection did not retain Clause-owned loot custody",
  );
  requireCondition(rendered.length > 0, "passive TypeScript presentation rendered nothing");
  requireCondition(
    disposeProcessBranch(module, processBranch),
    "Wasm branch did not dispose",
  );
  console.log(rendered);
}

await main();
