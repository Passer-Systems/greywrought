use clause_runtime::{
    decode_wasm_process_request_v1, encode_wasm_process_request_v1,
    open_fresh_persistent_process_session_v1, projected_referent_value_v1,
    projected_relation_table_v1, ExecutableInputSourceV1, ExecutableReferentV1,
    ExecutableRelationTableV1, ExecutableValueV1, PersistentProcessSessionV1,
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
            "cinder-1\n  shape: Enemy",
            "warrior-2\n  shape: Unit\n  shape: Actor\ncinder-1\n  shape: Enemy",
            1,
        )
        .replacen(
            "cinder-1 actor name",
            concat!(
                "warrior-2 actor name \"Bran\"\n",
                "warrior-2 presentation kind \"Warrior\"\n",
                "warrior-2 unit class warrior-class\n",
                "warrior-2 actor position Vec3 { x: 3.0, y: 0.0, z: 1.0 }\n",
                "warrior-2 unit destination Vec3 { x: 3.0, y: 0.0, z: 1.0 }\n",
                "warrior-2 formation offset Vec3 { x: 3.0, y: 0.0, z: -1.0 }\n",
                "warrior-2 movement speed 5.0\n",
                "warrior-2 selected true\n",
                "warrior-2 moving false\n",
                "warrior-2 hostile false\n",
                "warrior-2 vitality 155.0\n",
                "warrior-2 maximum vitality 155.0\n",
                "warrior-2 alive true\n",
                "warrior-2 ward remaining 0.0\n",
                "warrior-2 burn remaining 0.0\n",
                "warrior-2 attack damage 22.0\n",
                "warrior-2 attack range 18.0\n",
                "warrior-2 healing power 0.0\n",
                "warrior-2 ward duration 0.0\n",
                "warrior-2 action cooldown 0.0\n",
                "warrior-2 action period 0.8\n\n",
                "cinder-1 actor name",
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
    let reference = projected_referent_value_v1(projected_referent_for_channel(
        projection, id, b"Pick",
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

fn target(session: &mut PersistentProcessSessionV1, projection: &clause_package::Term, id: &[u8]) {
    let reference = projected_referent_value_v1(projected_referent_for_channel(
        projection, id, b"Target",
    ))
    .unwrap()
    .expect("projected Actor must carry its exact Target-channel referent");
    let captured_session = session.runtime_session();
    session
        .apply_typed_physical_input(
            captured_session,
            &ExecutableInputSourceV1::Referent {
                channel: b"Target".to_vec(),
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

fn advance(session: &mut PersistentProcessSessionV1, ticks: usize) -> clause_package::Term {
    let mut projection = admit_tick(session);
    for _ in 1..ticks {
        projection = admit_tick(session);
    }
    projection
}

fn projected_field<'a>(
    term: &'a clause_package::Term,
    expected: &[u8],
) -> &'a clause_package::Term {
    let mut current = term;
    loop {
        let [field, value, rest] = current
            .as_triple()
            .unwrap_or_else(|| panic!("projected object lacks field {:?}", String::from_utf8_lossy(expected)))
            .slots();
        if field.as_atom().unwrap().canonical_payload() == expected {
            return value;
        }
        current = rest;
    }
}

fn projected_referent_for_channel<'a>(
    projection: &'a clause_package::Term,
    id: &[u8],
    channel: &[u8],
) -> &'a clause_package::Term {
    let domain = projected_number(projected_field(
        projected_field(projection, b"$referent-inputs"),
        channel,
    )) as u32;
    let subject = projected_field(projection, id);
    if projected_has_field(subject, b"$referents") {
        let facets = projected_field(subject, b"$referents");
        projected_field(facets, domain.to_string().as_bytes())
    } else {
        projected_field(subject, b"$referent")
    }
}

fn projected_has_field(term: &clause_package::Term, expected: &[u8]) -> bool {
    let mut current = term;
    while let Some(triple) = current.as_triple() {
        let [field, _, rest] = triple.slots();
        if field
            .as_atom()
            .is_some_and(|field| field.canonical_payload() == expected)
        {
            return true;
        }
        current = rest;
    }
    false
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

fn actor_number(projection: &clause_package::Term, id: &[u8], name: &[u8]) -> f64 {
    projected_number(projected_field(projected_field(projection, id), name))
}

fn relation_table(projection: &clause_package::Term, name: &[u8]) -> ExecutableRelationTableV1 {
    projected_relation_table_v1(projected_field(
        projected_field(projection, b"relations"),
        name,
    ))
    .unwrap()
    .unwrap_or_else(|| panic!("{name:?} did not project as a relation table"))
}

fn cancel_burn(session: &mut PersistentProcessSessionV1, effect: ExecutableReferentV1) {
    let captured_session = session.runtime_session();
    session
        .apply_typed_physical_input(
            captured_session,
            &ExecutableInputSourceV1::Referent {
                channel: b"CancelBurn".to_vec(),
            },
            Some(ExecutableValueV1::Referent(effect)),
        )
        .unwrap();
}

fn encounter_is(projection: &clause_package::Term, expected: &[u8]) -> bool {
    projected_referent_value_v1(projected_field(
        projected_field(projection, b"encounter"),
        b"encounter-state",
    ))
    .unwrap()
        == projected_referent_value_v1(projected_field(
            projected_field(projection, expected),
            b"$referent",
        ))
        .unwrap()
}

fn unit_position(projection: &clause_package::Term, id: &[u8]) -> [f64; 3] {
    let unit = projected_field(projection, id);
    let pos = projected_field(unit, b"actor-position");
    [b"x", b"y", b"z"].map(|axis| projected_number(projected_field(pos, axis)))
}

#[test]
fn single_unit_move_arrives_at_the_clicked_point() {
    let mut s = session();
    let initial = admit_tick(&mut s);
    key(&mut s, b"ClearSelection");
    pick(&mut s, &initial, b"warrior-1");
    scalar(&mut s, b"PointerWorldX", -1.5);
    scalar(&mut s, b"PointerWorldZ", 1.25);
    key(&mut s, b"IssueMove");
    let arrived = advance(&mut s, 60);
    let position = unit_position(&arrived, b"warrior-1");
    assert_eq!(
        position, [-1.5, 0.0, 1.25],
        "one selected unit must arrive at the click, not its full-company formation offset: {position:?}",
    );
    for id in [b"artificer-1".as_slice(), b"rogue-1", b"priest-1", b"ranger-1"] {
        assert_eq!(
            unit_position(&arrived, id),
            unit_position(&initial, id),
            "unselected units must stay in place",
        );
    }
    scalar(&mut s, b"PointerWorldX", -1.496);
    scalar(&mut s, b"PointerWorldZ", 1.251);
    key(&mut s, b"IssueMove");
    let nearby = advance(&mut s, 3);
    assert_eq!(unit_position(&nearby, b"warrior-1"), [-1.496, 0.0, 1.251],
        "even a click inside the arrival threshold must land exactly on the marker");
}

#[test]
fn partial_group_arrives_centered_on_click_without_overlapping() {
    let mut s = session();
    let initial = admit_tick(&mut s);
    key(&mut s, b"ClearSelection");
    pick(&mut s, &initial, b"warrior-1");
    pick(&mut s, &initial, b"priest-1");
    scalar(&mut s, b"PointerWorldX", 0.5);
    scalar(&mut s, b"PointerWorldZ", 2.0);
    key(&mut s, b"IssueMove");
    let arrived = advance(&mut s, 80);
    let warrior = unit_position(&arrived, b"warrior-1");
    let priest = unit_position(&arrived, b"priest-1");
    assert!((warrior[0] - 0.0).abs() < 0.01 && (warrior[2] - 1.0).abs() < 0.01);
    assert!((priest[0] - 1.0).abs() < 0.01 && (priest[2] - 3.0).abs() < 0.01);
    assert_eq!([(warrior[0] + priest[0]) / 2.0, (warrior[2] + priest[2]) / 2.0], [0.5, 2.0]);
    assert_eq!(unit_position(&arrived, b"artificer-1"), unit_position(&initial, b"artificer-1"));
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
    let arrived = advance(&mut s, 220);
    let positions = [b"warrior-1".as_slice(), b"artificer-1", b"rogue-1", b"priest-1", b"ranger-1"]
        .map(|id| unit_position(&arrived, id));
    assert!((positions.iter().map(|p| p[0]).sum::<f64>() / 5.0 - 10.0).abs() < 0.01);
    assert!((positions.iter().map(|p| p[2]).sum::<f64>() / 5.0 - 12.0).abs() < 0.01);
    for (index, a) in positions.iter().enumerate() {
        for b in &positions[index + 1..] {
            assert!((a[0] - b[0]).hypot(a[2] - b[2]) >= 1.9, "formation slots must remain separated");
        }
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

#[test]
fn connected_target_attack_respects_range_cooldown_and_party_contributions() {
    let mut s = session();
    let initial = admit_tick(&mut s);
    key(&mut s, b"BeginEncounter");
    target(&mut s, &initial, b"cinder-1");
    key(&mut s, b"Attack");
    let attacked = admit_tick(&mut s);
    assert_eq!(actor_number(&attacked, b"cinder-1", b"vitality"), 9.0);
    assert!(actor_number(&attacked, b"warrior-1", b"action-cooldown") > 0.0);

    key(&mut s, b"Attack");
    let cooling_down = admit_tick(&mut s);
    assert_eq!(
        actor_number(&cooling_down, b"cinder-1", b"vitality"),
        9.0,
        "a second physical action inside the source cooldown must be a no-op",
    );

    let ranged_out = std::str::from_utf8(EMBODIED_SOURCE)
        .unwrap()
        .replace(
            "cinder-1 actor position Vec3 { x: 0.0, y: 0.0, z: 6.0 }",
            "cinder-1 actor position Vec3 { x: 0.0, y: 0.0, z: 30.0 }",
        );
    let mut distant = session_for(ranged_out.as_bytes());
    let frame = admit_tick(&mut distant);
    key(&mut distant, b"BeginEncounter");
    target(&mut distant, &frame, b"cinder-1");
    key(&mut distant, b"Attack");
    let unchanged = admit_tick(&mut distant);
    assert_eq!(actor_number(&unchanged, b"cinder-1", b"vitality"), 100.0);
}

#[test]
fn ordinary_ignite_creates_distinct_burns_with_exact_expiry_and_cancellation() {
    let mut s = session();
    let initial = admit_tick(&mut s);
    key(&mut s, b"BeginEncounter");
    target(&mut s, &initial, b"cinder-1");
    key(&mut s, b"ClearSelection");
    pick(&mut s, &initial, b"artificer-1");
    pick(&mut s, &initial, b"ranger-1");
    key(&mut s, b"Ignite");
    let ignited = admit_tick(&mut s);

    let remaining = relation_table(&ignited, b"effect-remaining");
    assert_eq!(remaining.rows().len(), 2);
    let mut effects = remaining
        .rows()
        .iter()
        .map(|(effect, values)| {
            (
                effect.clone(),
                values.first().unwrap().as_number().unwrap(),
            )
        })
        .collect::<Vec<_>>();
    effects.sort_by(|left, right| left.1.total_cmp(&right.1));
    assert_eq!(
        effects.iter().map(|effect| effect.1).collect::<Vec<_>>(),
        vec![1.484, 2.984],
        "the input Step creates both effects before the candidate's first 16 ms tick",
    );
    assert_eq!(relation_table(&ignited, b"burn-target").rows().len(), 2);
    assert!(actor_number(&ignited, b"artificer-1", b"action-cooldown") > 0.0);
    assert!(actor_number(&ignited, b"ranger-1", b"action-cooldown") > 0.0);

    assert!(
        (actor_number(&ignited, b"cinder-1", b"vitality") - 99.776).abs() < 0.000_001,
        "both created occurrences must contribute during the candidate's first tick",
    );
    let burned = admit_tick(&mut s);
    assert!(
        (actor_number(&burned, b"cinder-1", b"vitality") - 99.552).abs() < 0.000_001,
        "two equal seven-per-second occurrences must each contribute on the next tick",
    );

    cancel_burn(&mut s, effects[0].0.clone());
    let cancelled = admit_tick(&mut s);
    let surviving = relation_table(&cancelled, b"effect-remaining");
    assert_eq!(surviving.rows().len(), 1);
    assert!(surviving.rows().contains_key(&effects[1].0));
    assert!(!surviving.rows().contains_key(&effects[0].0));

    let expired = advance(&mut s, 190);
    assert!(relation_table(&expired, b"effect-remaining").rows().is_empty());
    assert!(relation_table(&expired, b"burn-target").rows().is_empty());
}

#[test]
fn ward_healing_enemy_policy_and_actual_outcomes_are_source_owned() {
    let mut defended = session();
    admit_tick(&mut defended);
    key(&mut defended, b"BeginEncounter");
    let joined = admit_tick(&mut defended);
    assert!(
        (actor_number(&joined, b"moonwell", b"vitality") - 91.936).abs() < 0.000_001,
        "the autonomous first strike and its first burn pulse must both be source-owned",
    );

    key(&mut defended, b"ClearSelection");
    pick(&mut defended, &joined, b"priest-1");
    target(&mut defended, &joined, b"moonwell");
    key(&mut defended, b"Ward");
    let warded = admit_tick(&mut defended);
    assert!(actor_number(&warded, b"moonwell", b"ward-remaining") > 3.9);
    let warded_start_health = actor_number(&warded, b"moonwell", b"vitality");
    let mut before_heal = warded;
    for _ in 0..52 {
        before_heal = admit_tick(&mut defended);
    }
    key(&mut defended, b"Heal");
    let healed = admit_tick(&mut defended);
    assert!(
        actor_number(&healed, b"moonwell", b"vitality")
            > actor_number(&before_heal, b"moonwell", b"vitality") + 27.0,
        "the selected Priest must restore the exact friendly target",
    );
    assert!(
        warded_start_health - actor_number(&before_heal, b"moonwell", b"vitality") < 3.0,
        "the active ward must mitigate the ongoing source-owned burn",
    );
    let mut expired = healed;
    for _ in 0..260 {
        expired = admit_tick(&mut defended);
    }
    assert_eq!(actor_number(&expired, b"moonwell", b"ward-remaining"), 0.0);

    let mut won = session();
    let first = admit_tick(&mut won);
    key(&mut won, b"BeginEncounter");
    target(&mut won, &first, b"cinder-1");
    key(&mut won, b"Attack");
    admit_tick(&mut won);
    advance(&mut won, 52);
    key(&mut won, b"Attack");
    let frame = admit_tick(&mut won);
    target(&mut won, &frame, b"cinder-2");
    advance(&mut won, 52);
    key(&mut won, b"Attack");
    admit_tick(&mut won);
    advance(&mut won, 52);
    key(&mut won, b"Attack");
    let frame = admit_tick(&mut won);
    assert!(encounter_is(&frame, b"victory"));

    let mut lost = session();
    admit_tick(&mut lost);
    key(&mut lost, b"BeginEncounter");
    let mut idle = admit_tick(&mut lost);
    for _ in 0..500 {
        if encounter_is(&idle, b"defeat") {
            break;
        }
        idle = admit_tick(&mut lost);
    }
    assert!(encounter_is(&idle, b"defeat"));
    assert!(!projected_boolean(projected_field(
        projected_field(&idle, b"moonwell"),
        b"alive",
    )));
}
