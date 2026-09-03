use clause_runtime::{
    decode_wasm_process_request_v1, encode_wasm_process_request_v1,
    open_fresh_persistent_process_session_v1, ExecutableInputSourceV1, PersistentProcessSessionV1,
};
use clause_workbench::ResidentSourceWorkbenchV1;
use greywrought_clause::EMBODIED_SOURCE;

#[test]
fn rts_world_compiles_with_five_classes() {
    let source = std::str::from_utf8(EMBODIED_SOURCE).expect("Clause source is UTF-8");
    ResidentSourceWorkbenchV1::open(EMBODIED_SOURCE).expect("RTS Clause world must compile");

    for class in ["Warrior", "Artificer", "Rogue", "Priest", "Ranger"] {
        assert_eq!(
            source.matches(&format!("class name \"{class}\"")).count(),
            1
        );
    }
    assert_eq!(source.matches(" shape: Unit\n").count(), 5);
}

fn session() -> PersistentProcessSessionV1 {
    let generation = ResidentSourceWorkbenchV1::open(EMBODIED_SOURCE)
        .unwrap()
        .generation()
        .cwr1
        .clone();
    let mut request = decode_wasm_process_request_v1(&generation).unwrap();
    request.authority.budget_units = 1_000_000;
    open_fresh_persistent_process_session_v1(&encode_wasm_process_request_v1(&request).unwrap())
        .unwrap()
}

fn key(session: &mut PersistentProcessSessionV1, code: &[u8]) {
    session
        .apply_physical_input(
            &ExecutableInputSourceV1::Keyboard {
                code: code.to_vec(),
                phase: clause_runtime::ExecutableKeyPhaseV1::Down,
            },
            None,
        )
        .unwrap();
}

fn scalar(session: &mut PersistentProcessSessionV1, channel: &[u8], value: f64) {
    session
        .apply_physical_input(
            &ExecutableInputSourceV1::Scalar {
                channel: channel.to_vec(),
            },
            Some(value),
        )
        .unwrap();
}

fn admit_tick(session: &mut PersistentProcessSessionV1) -> clause_package::Term {
    session.apply_fixed_tick_and_emit_candidate(16).unwrap();
    let auth = session.issue_candidate_admission_authorization().unwrap();
    let (_, projection) = session
        .admit_issued_candidate_with_projection(auth)
        .unwrap();
    let term = projection.unwrap().term;
    session.compact_to_admitted_frontier().unwrap();
    term
}

fn projected_field<'a>(
    term: &'a clause_package::Term,
    expected: &[u8],
) -> &'a clause_package::Term {
    let mut current = term;
    loop {
        let [field, value, rest] = current.as_triple().unwrap().slots();
        if field.as_atom().unwrap().canonical_payload() == expected {
            return value;
        }
        current = rest;
    }
}

fn projected_number(term: &clause_package::Term) -> f64 {
    f64::from_bits(u64::from_le_bytes(
        term.as_atom()
            .unwrap()
            .canonical_payload()
            .try_into()
            .unwrap(),
    ))
}

fn unit_position(projection: &clause_package::Term, id: &[u8]) -> [f64; 3] {
    let unit = projected_field(projection, id);
    let pos = projected_field(unit, b"unit-position");
    [b"x", b"y", b"z"].map(|axis| projected_number(projected_field(pos, axis)))
}

#[test]
fn five_unit_selection_formation_order_and_tick_progress() {
    let mut s = session();
    key(&mut s, b"ClearSelection");
    key(&mut s, b"SelectAll");
    scalar(&mut s, b"PointerWorldX", 10.0);
    scalar(&mut s, b"PointerWorldZ", 12.0);
    key(&mut s, b"IssueMove");
    let before = admit_tick(&mut s);
    let after = admit_tick(&mut s);
    for id in [
        b"warrior-1".as_slice(),
        b"artificer-1",
        b"rogue-1",
        b"priest-1",
        b"ranger-1",
    ] {
        assert_ne!(
            unit_position(&before, id),
            unit_position(&after, id),
            "unit should advance"
        );
    }
}
