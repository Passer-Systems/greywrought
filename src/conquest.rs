use std::error::Error;

use clause_package::StateRevisionId;
use clause_runtime::{
    CheckedReconnectAdmissionPlanV1, ExecutableProjectedObservationV1, ExecutableValueV1,
    ForkedProcessBranchV1, ProcessReconnectAdmissionV1, ProcessReconnectEvidenceV1,
    decode_wasm_process_request_v1, encode_wasm_process_request_v1,
    open_fresh_persistent_process_session_v1,
};
use clause_workbench::ResidentSourceWorkbenchV1;

use crate::WORLD_SOURCE;

pub const DISCONNECT_TICK: u64 = 41;
pub const BRANCH_BUDGET_UNITS: u64 = 64;
pub const EXACT_BRANCH_CONTEXT: &[u8] =
    b"greywrought/conquest-v2;player=ashen-wayfarer;simulation=fixed-v1;random=f64:0.95";
pub const SELECTED_RANDOM_ROLL: f64 = 0.95;
pub const ATTACK_SIGNAL: f64 = 1.0;

pub struct NativeConquestV1 {
    pub exact_cwr1: Vec<u8>,
    pub parent: StateRevisionId,
    pub authoritative_intermediate: StateRevisionId,
    pub authoritative_projection: Option<ExecutableProjectedObservationV1>,
    pub reconnect: ProcessReconnectEvidenceV1,
    pub admitted: ProcessReconnectAdmissionV1,
    pub retained_branch: ForkedProcessBranchV1,
}

pub struct ConquestProgramV1 {
    pub exact_cwr1: Vec<u8>,
    pub world_shift: Vec<u8>,
    pub combat: Vec<Vec<u8>>,
}

pub fn selected_combat_occurrences_v1(
    source: &ResidentSourceWorkbenchV1,
) -> Result<Vec<Vec<u8>>, Box<dyn Error>> {
    let attack = source.handler_occurrence(b"begin-attack", &[])?;
    let random = source.handler_occurrence(
        b"input",
        &[
            ExecutableValueV1::number(SELECTED_RANDOM_ROLL)?,
            ExecutableValueV1::number(ATTACK_SIGNAL)?,
        ],
    )?;
    let mut combat = vec![attack, random];
    combat.extend(source.fixed_tick_occurrences(1.0)?);
    Ok(combat)
}

pub fn materialize_conquest_program_v1() -> Result<ConquestProgramV1, Box<dyn Error>> {
    let source = ResidentSourceWorkbenchV1::open(WORLD_SOURCE)?;
    let world_shift = source.handler_occurrence(b"world-shift", &[])?;
    let combat = selected_combat_occurrences_v1(&source)?;

    let mut request = decode_wasm_process_request_v1(&source.generation().cwr1)?;
    request.authority.occurrence_evidence_bytes = EXACT_BRANCH_CONTEXT.to_vec();
    request.authority.budget_units = BRANCH_BUDGET_UNITS;
    request.occurrences = std::iter::once(world_shift.clone())
        .chain(combat.iter().cloned())
        .collect();
    let exact_cwr1 = encode_wasm_process_request_v1(&request)?;
    Ok(ConquestProgramV1 {
        exact_cwr1,
        world_shift,
        combat,
    })
}

pub fn run_native_conquest_v1() -> Result<NativeConquestV1, Box<dyn Error>> {
    let program = materialize_conquest_program_v1()?;
    let exact_cwr1 = program.exact_cwr1;
    let world_shift = program.world_shift;
    let combat = program.combat;
    let mut authoritative = open_fresh_persistent_process_session_v1(&exact_cwr1)?;
    let branch_session = open_fresh_persistent_process_session_v1(&exact_cwr1)?;
    let parent = authoritative.world_base();
    let mut branch = ForkedProcessBranchV1::fork(
        &authoritative,
        branch_session,
        DISCONNECT_TICK,
        &world_shift,
    )?;

    authoritative.apply_opaque_input_and_emit_candidate(&world_shift)?;
    let authorization = authoritative.issue_candidate_admission_authorization()?;
    let (authoritative_state, authoritative_projection) =
        authoritative.admit_issued_candidate_with_projection(authorization)?;

    let reconnect = branch.resume_and_propose(&combat)?;
    let plan = CheckedReconnectAdmissionPlanV1 {
        branch_candidate: reconnect.candidate,
        authoritative_base: authoritative_state.id,
        occurrences: combat,
    };
    let admitted = branch.adjudicate(&mut authoritative, &reconnect, &plan)?;

    Ok(NativeConquestV1 {
        exact_cwr1,
        parent,
        authoritative_intermediate: authoritative_state.id,
        authoritative_projection,
        reconnect,
        admitted,
        retained_branch: branch,
    })
}
