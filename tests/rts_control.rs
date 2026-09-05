use clause_runtime::{
    decode_wasm_process_request_v1, encode_wasm_process_request_v1,
    open_fresh_persistent_process_session_v1, projected_referent_value_v1,
    ExecutableInputSourceV1, ExecutableValueV1, PersistentProcessSessionV1,
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
    session_for(EMBODIED_SOURCE)
}

fn session_for(source: &[u8]) -> PersistentProcessSessionV1 {
    let generation = ResidentSourceWorkbenchV1::open(source)
        .unwrap()
        .generation()
        .cwr1
        .clone();
    let mut request = decode_wasm_process_request_v1(&generation).unwrap();
    request.authority.budget_units = 1_000_000;
    open_fresh_persistent_process_session_v1(&encode_wasm_process_request_v1(&request).unwrap())
        .unwrap()
}

fn source_with_second_warrior() -> Vec<u8> {
    let source = std::str::from_utf8(EMBODIED_SOURCE).unwrap();
    source
        .replacen(
            "warrior-class\n  shape: UnitClass",
            "warrior-2\n  shape: Unit\nwarrior-class\n  shape: UnitClass",
            1,
        )
        .replacen(
            "artificer-1 unit name",
            concat!(
                "warrior-2 unit name \"Bran\"\n",
                "warrior-2 unit class warrior-class\n",
                "warrior-2 unit position Vec3 { x: 3.0, y: 0.0, z: 1.0 }\n",
                "warrior-2 unit destination Vec3 { x: 3.0, y: 0.0, z: 1.0 }\n",
                "warrior-2 formation offset Vec3 { x: 3.0, y: 0.0, z: -1.0 }\n",
                "warrior-2 movement speed 5.0\n",
                "warrior-2 selected true\n",
                "warrior-2 moving false\n",
                "warrior-2 vitality Vec3 { x: 155.0, y: 155.0, z: 0.0 }\n\n",
                "artificer-1 unit name",
            ),
            1,
        )
        .into_bytes()
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

fn pick(
    session: &mut PersistentProcessSessionV1,
    projection: &clause_package::Term,
    id: &[u8],
) {
    let reference = projected_referent_value_v1(projected_field(
        projected_field(projection, id),
        b"$referent",
    ))
    .unwrap()
    .expect("projected Unit must carry its exact referent");
    let captured_session = session.runtime_session();
    session
        .apply_typed_physical_input(
            captured_session,
            &ExecutableInputSourceV1::Referent {
                channel: b"Pick".to_vec(),
            },
            Some(ExecutableValueV1::Referent(reference)),
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

fn projected_boolean(term: &clause_package::Term) -> bool {
    match term.as_atom().unwrap().canonical_payload() {
        [0] => false,
        [1] => true,
        value => panic!("projected Boolean has unexpected bytes: {value:?}"),
    }
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

#[test]
fn selecting_one_of_two_same_class_units_preserves_occurrence_identity() {
    let source = source_with_second_warrior();
    let mut s = session_for(&source);
    let initial = admit_tick(&mut s);
    key(&mut s, b"ClearSelection");
    pick(&mut s, &initial, b"warrior-1");
    scalar(&mut s, b"PointerWorldX", 10.0);
    scalar(&mut s, b"PointerWorldZ", 12.0);
    key(&mut s, b"IssueMove");
    let ordered = admit_tick(&mut s);
    let advanced = admit_tick(&mut s);

    assert!(projected_boolean(projected_field(
        projected_field(&ordered, b"warrior-1"),
        b"selected",
    )));
    assert!(
        !projected_boolean(projected_field(
            projected_field(&ordered, b"warrior-2"),
            b"selected",
        )),
        "exact Warrior selection must not select a second occurrence of the same class"
    );
    assert_ne!(
        unit_position(&ordered, b"warrior-1"),
        unit_position(&advanced, b"warrior-1"),
        "the exact selected Warrior should advance through the generic movement rule",
    );
    assert_eq!(
        unit_position(&ordered, b"warrior-2"),
        unit_position(&advanced, b"warrior-2"),
        "the same-class unselected Warrior must not receive the order",
    );

    key(&mut s, b"ClearSelection");
    pick(&mut s, &advanced, b"warrior-2");
    scalar(&mut s, b"PointerWorldX", -10.0);
    scalar(&mut s, b"PointerWorldZ", -8.0);
    key(&mut s, b"IssueMove");
    let duplicate_ordered = admit_tick(&mut s);
    let duplicate_advanced = admit_tick(&mut s);
    assert!(!projected_boolean(projected_field(
        projected_field(&duplicate_ordered, b"warrior-1"),
        b"selected",
    )));
    assert!(projected_boolean(projected_field(
        projected_field(&duplicate_ordered, b"warrior-2"),
        b"selected",
    )));
    assert_ne!(
        unit_position(&duplicate_ordered, b"warrior-2"),
        unit_position(&duplicate_advanced, b"warrior-2"),
        "the source-added occurrence should move through the same generic rule",
    );
}
