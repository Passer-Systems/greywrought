use std::error::Error;

use clause_package::Term;
use clause_runtime::{
    ExecutableCandidateV1, ExecutableInputSourceV1, ExecutableKeyPhaseV1,
    PersistentProcessSessionV1,
    decode_wasm_process_request_v1, encode_wasm_process_request_v1,
    open_fresh_persistent_process_session_v1,
};
use clause_workbench::ResidentSourceWorkbenchV1;
use greywrought_clause::EMBODIED_SOURCE;

fn main() -> Result<(), Box<dyn Error>> {
    let source = ResidentSourceWorkbenchV1::open(EMBODIED_SOURCE)?;
    let mut win = open_embodied_session(&source.generation().cwr1)?;
    key(&mut win, b"KeyD", ExecutableKeyPhaseV1::Down)?;
    let mut projection = None;
    for _ in 0..1 {
        projection = Some(admitted_tick(&mut win)?.1);
    }
    key(&mut win, b"KeyD", ExecutableKeyPhaseV1::Up)?;
    key(&mut win, b"Space", ExecutableKeyPhaseV1::Down)?;
    let (candidate, struck) = admitted_tick(&mut win)?;
    let enemy = projected_object_field(&struck, b"cinder-wraith");
    let enemy_vitals = projected_object_field(enemy, b"enemy-vitals");
    eprintln!(
        "strike-position={} enemy-vitality={}",
        player_x(&struck),
        projected_number(projected_object_field(enemy_vitals, b"x")),
    );
    key(&mut win, b"KeyA", ExecutableKeyPhaseV1::Down)?;
    for _ in 0..3 {
        projection = Some(admitted_tick(&mut win)?.1);
    }
    let won = projection
        .take()
        .ok_or("win journey emitted no projection")?;
    key(&mut win, b"KeyA", ExecutableKeyPhaseV1::Up)?;
    eprintln!(
        "win-position={} objective={}",
        player_x(&won),
        objective_state(&won),
    );

    let mut fail = open_embodied_session(&source.generation().cwr1)?;
    key(&mut fail, b"KeyD", ExecutableKeyPhaseV1::Down)?;
    for _ in 0..2 {
        projection = Some(admitted_tick(&mut fail)?.1);
    }
    let failed = projection.ok_or("fail journey emitted no projection")?;
    eprintln!(
        "fail-position={} vitality={} objective={}",
        player_x(&failed),
        player_vitality(&failed),
        objective_state(&failed),
    );
    key(&mut fail, b"KeyD", ExecutableKeyPhaseV1::Up)?;
    key(&mut fail, b"KeyR", ExecutableKeyPhaseV1::Down)?;
    let (_, reset_first) = admitted_tick(&mut fail)?;
    eprintln!("reset-first objective={}", objective_state(&reset_first));
    let (_, reset_second) = admitted_tick(&mut fail)?;
    eprintln!("reset-second objective={}", objective_state(&reset_second));
    let (_, reset) = admitted_tick(&mut fail)?;
    eprintln!(
        "reset-position={} vitality={} objective={}",
        player_x(&reset),
        player_vitality(&reset),
        objective_state(&reset),
    );
    println!(
        "candidate={:?} win={} fail={} reset={}",
        candidate.id,
        objective_state(&won),
        objective_state(&failed),
        objective_state(&reset),
    );
    Ok(())
}

fn open_embodied_session(exact_cwr1: &[u8]) -> Result<PersistentProcessSessionV1, Box<dyn Error>> {
    let mut request = decode_wasm_process_request_v1(exact_cwr1)?;
    request.authority.budget_units = 1_000_000;
    Ok(open_fresh_persistent_process_session_v1(
        &encode_wasm_process_request_v1(&request)?,
    )?)
}

fn key(
    session: &mut PersistentProcessSessionV1,
    code: &[u8],
    phase: ExecutableKeyPhaseV1,
) -> Result<(), Box<dyn Error>> {
    session.apply_physical_input(
        &ExecutableInputSourceV1::Keyboard {
            code: code.to_vec(),
            phase,
        },
        None,
    )?;
    Ok(())
}

fn admitted_tick(
    session: &mut PersistentProcessSessionV1,
) -> Result<(ExecutableCandidateV1, Term), Box<dyn Error>> {
    session.apply_fixed_tick_and_emit_candidate(16)?;
    let candidate = session
        .candidate()?
        .ok_or("fixed tick did not retain a CandidateDelta")?
        .clone();
    let authorization = session.issue_candidate_admission_authorization()?;
    let (_, projection) = session.admit_issued_candidate_with_projection(authorization)?;
    Ok((
        candidate,
        projection
            .ok_or("Admission emitted no renderer projection")?
            .term,
    ))
}

fn projected_object_field<'a>(term: &'a Term, expected: &[u8]) -> &'a Term {
    let mut current = term;
    loop {
        let [field, value, rest] = current
            .as_triple()
            .expect("projected object is an entry chain")
            .slots();
        let field = field.as_atom().expect("projected field is an Atom");
        if field.canonical_payload() == expected {
            return value;
        }
        current = rest;
    }
}

fn projected_number(term: &Term) -> f64 {
    let atom = term.as_atom().expect("projected number is an Atom");
    f64::from_bits(u64::from_le_bytes(
        atom.canonical_payload()
            .try_into()
            .expect("projected F64 is exact"),
    ))
}

fn player_x(projection: &Term) -> f64 {
    let player = projected_object_field(projection, b"player-1");
    let position = projected_object_field(player, b"position");
    projected_number(projected_object_field(position, b"x"))
}

fn player_vitality(projection: &Term) -> f64 {
    let player = projected_object_field(projection, b"player-1");
    let vitals = projected_object_field(player, b"player-vitals");
    projected_number(projected_object_field(vitals, b"x"))
}

fn objective_state(projection: &Term) -> String {
    let objective = projected_object_field(projection, b"game-objective");
    let state = projected_object_field(objective, b"objective-state");
    match projected_number(projected_object_field(state, b"x")) {
        value if value == 1.0 => "completed".into(),
        value if value == -1.0 => "failed".into(),
        _ => "playing".into(),
    }
}
