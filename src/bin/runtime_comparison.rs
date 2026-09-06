//! Measurement-only replay of the public serialized session ABI.
use clause_runtime::*;
use clause_workbench::ResidentSourceWorkbenchV1;
use std::{
    error::Error,
    fs,
    io::{self, Write},
    time::Instant,
};

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn open_bytes(cwr1: &[u8], fresh: bool) -> Result<Vec<u8>, Box<dyn Error>> {
    let mut request = decode_wasm_process_request_v1(cwr1)?;
    request.authority.budget_units = 1_000_000;
    request.authority.occurrence_evidence_bytes =
        b"greywrought/embodied-encounter-v1;player=player-1;tick=fixed-16ms;random=f64:0.95"
            .to_vec();
    Ok(encode_wasm_session_open_v1(&WasmSessionOpenV1 {
        package_bytes: request.package_bytes,
        application: request.application,
        physical_plan_bytes: request.physical_plan_bytes,
        authority: request.authority,
        allocation: if fresh {
            WasmSessionAllocationV1::New
        } else {
            WasmSessionAllocationV1::Rematerialize(request.allocation)
        },
        limits: WasmSessionLimitsV1 {
            max_commands: 4096,
            command_bytes: WASM_SESSION_COMMAND_LIMIT_V1 as u32,
            event_bytes: WASM_SESSION_EVENT_LIMIT_V1 as u32,
            trace_retention: WasmSessionTraceRetentionV1::CurrentAdmission,
        },
    })?)
}

fn record(
    kind: &str,
    started: Instant,
    handle: WasmSessionHandleV1,
    sequence: u64,
    request: &[u8],
    witness: &[u8],
    result: &[u8],
) {
    let micros = started.elapsed().as_micros();
    println!(
        "{kind}\t{micros}\t{}\t{}\t{sequence}\t{}\t{}\t{}",
        handle.slot,
        handle.generation,
        hex(request),
        hex(witness),
        hex(result)
    );
    io::stdout().flush().expect("measurement output");
}

fn command(
    boundary: &mut WasmPersistentSessionBoundaryV1,
    event: &WasmSessionEventV1,
    kind: &str,
    operation: WasmSessionOperationV1,
) -> Result<WasmSessionEventV1, Box<dyn Error>> {
    let bytes = encode_wasm_session_command_v1(&WasmSessionCommandV1 {
        handle: event.handle,
        expected_sequence: event.accepted_sequence,
        operation,
    })?;
    let started = Instant::now();
    boundary.command_bulk(&bytes)?;
    let output = boundary.event().to_vec();
    record(
        kind,
        started,
        event.handle,
        event.accepted_sequence,
        &bytes,
        &[],
        &output,
    );
    Ok(decode_wasm_session_event_v1(&output)?)
}

fn projection(
    boundary: &WasmPersistentSessionBoundaryV1,
    event: &WasmSessionEventV1,
    kind: &str,
) -> Result<(), Box<dyn Error>> {
    let started = Instant::now();
    let output = boundary.current_accepted_projection_bytes(event.handle)?;
    record(
        kind,
        started,
        event.handle,
        event.accepted_sequence,
        &[],
        &[],
        &output,
    );
    Ok(())
}

fn main() -> Result<(), Box<dyn Error>> {
    let path = std::env::args_os()
        .nth(1)
        .ok_or("usage: runtime_comparison SOURCE.clause")?;
    let source = fs::read(path)?;
    let started = Instant::now();
    let mut workbench = ResidentSourceWorkbenchV1::open(&source)?;
    let dummy = WasmSessionHandleV1 {
        slot: 0,
        generation: 0,
    };
    record(
        "source-compile",
        started,
        dummy,
        0,
        &source,
        &[],
        &workbench.generation().cwr1,
    );
    let open = open_bytes(&workbench.generation().cwr1, false)?;
    let mut boundary = WasmPersistentSessionBoundaryV1::new();
    let started = Instant::now();
    boundary.open_bulk(&open)?;
    let result = boundary.event().to_vec();
    record("open", started, dummy, 0, &open, &[], &result);
    let mut event = decode_wasm_session_event_v1(&result)?;
    let (package, session) = match event.kind {
        WasmSessionEventKindV1::Opened {
            package, session, ..
        } => (package, session),
        _ => return Err("session did not open".into()),
    };
    projection(&boundary, &event, "initial-projection")?;
    // No physical/random input is supplied: this fixture's autonomous movement
    // and cooldown tick is the workload used by the 100-active acceptance.
    for revision in 1..=3 {
        event = command(
            &mut boundary,
            &event,
            "candidate",
            WasmSessionOperationV1::TickCandidate(WasmSessionTickV1 {
                configuration_revision: revision,
                fixed_tick_milliseconds: 16,
            }),
        )?;
        let (candidate, base) = match event.kind {
            WasmSessionEventKindV1::CandidateAccepted {
                candidate, base, ..
            } => (candidate, base),
            _ => return Err(format!("candidate failed: {:?}", event.kind).into()),
        };
        event = command(
            &mut boundary,
            &event,
            "issue-admission",
            WasmSessionOperationV1::IssueAdmission(WasmSessionAdmissionScopeV1 {
                package,
                session,
                base,
                candidate,
            }),
        )?;
        let authorization = match event.kind {
            WasmSessionEventKindV1::AdmissionAuthorizationIssued { occurrence, .. } => occurrence,
            _ => return Err("authorization not issued".into()),
        };
        event = command(
            &mut boundary,
            &event,
            "admission-projection",
            WasmSessionOperationV1::Admit(WasmSessionAdmissionV1 {
                package,
                session,
                base,
                candidate,
                authorization,
            }),
        )?;
        if !matches!(event.kind, WasmSessionEventKindV1::AdmissionAccepted { .. }) {
            return Err("admission failed".into());
        }
    }
    projection(&boundary, &event, "final-projection")?;
    let selected = workbench
        .scalar_effects()?
        .into_iter()
        .find(|effect| effect.expression == b"?cooldown - ?dt")
        .ok_or("cooldown edit absent")?;
    let started = Instant::now();
    workbench.edit_scalar_effect(
        workbench.generation().handle,
        &selected,
        b"?cooldown - (?dt * 2.0)",
    )?;
    record(
        "edit-compile",
        started,
        dummy,
        0,
        &[],
        &[],
        &workbench.generation().cwr1,
    );
    let open = open_bytes(&workbench.generation().cwr1, true)?;
    let witness = workbench.last_source_edit().ok_or("missing CET1")?;
    let started = Instant::now();
    boundary.source_edit_bulk(event.handle, event.accepted_sequence, &open, witness)?;
    let result = boundary.event().to_vec();
    record(
        "checked-edit",
        started,
        event.handle,
        event.accepted_sequence,
        &open,
        witness,
        &result,
    );
    event = decode_wasm_session_event_v1(&result)?;
    projection(&boundary, &event, "edited-projection")?;
    let started = Instant::now();
    let result = boundary.source_continuity_bytes(event.handle)?;
    record(
        "continuity",
        started,
        event.handle,
        event.accepted_sequence,
        &[],
        &[],
        &result,
    );
    Ok(())
}
