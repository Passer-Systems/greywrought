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
                "warrior-2 actor position Vec3 { x: 4.0, y: 0.0, z: 1.0 }\n",
                "warrior-2 unit destination Vec3 { x: 4.0, y: 0.0, z: 1.0 }\n",
                "warrior-2 formation offset Vec3 { x: 3.0, y: 0.0, z: -1.0 }\n",
                "warrior-2 movement speed 5.0\n",
                "warrior-2 footprint radius 0.6\n",
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
                "warrior-2 attack readiness \"No battle in progress\"\n",
                "warrior-2 heal readiness \"No battle in progress\"\n",
                "warrior-2 ward readiness \"No battle in progress\"\n",
                "warrior-2 ignite readiness \"No battle in progress\"\n",
                "warrior-2 order report \"\"\n",
                "warrior-2 order name \"\"\n",
                "warrior-2 order number 0.0\n",
                "warrior-2 order accepted false\n",
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

fn travel_fixture(units: &[(&str, [f64; 2], [f64; 2])]) -> Vec<u8> {
    let mut source = std::str::from_utf8(EMBODIED_SOURCE).unwrap().to_owned();
    for (id, start, destination) in units {
        source = source.lines().map(|line| {
            if line.starts_with(&format!("{id} actor position ")) {
                format!("{id} actor position Vec3 {{ x: {:?}, y: 0.0, z: {:?} }}", start[0], start[1])
            } else if line.starts_with(&format!("{id} unit destination ")) {
                format!("{id} unit destination Vec3 {{ x: {:?}, y: 0.0, z: {:?} }}", destination[0], destination[1])
            } else if line.starts_with(&format!("{id} moving ")) {
                format!("{id} moving {}", start != destination)
            } else { line.to_owned() }
        }).collect::<Vec<_>>().join("\n");
        source.push('\n');
    }
    source.into_bytes()
}

#[test]
fn travel_avoids_stationary_units_head_on_crossings_and_the_stone() {
    for (name, units) in [
        ("stationary", vec![("warrior-1", [-4.0, -4.0], [2.0, -4.0]), ("artificer-1", [-1.0, -4.0], [-1.0, -4.0])]),
        ("head-on", vec![("warrior-1", [-4.0, -4.0], [2.0, -4.0]), ("artificer-1", [2.0, -4.0], [-4.0, -4.0])]),
        ("crossing", vec![("warrior-1", [-4.0, -4.0], [2.0, -4.0]), ("artificer-1", [-1.0, -7.0], [-1.0, -1.0])]),
        ("stone", vec![("warrior-1", [-9.0, 4.0], [-3.0, 4.0])]),
    ] {
        let mut s = session_for(&travel_fixture(&units));
        let mut previous = units.iter().map(|(_, start, _)| *start).collect::<Vec<_>>();
        let mut arrived = false;
        for tick in 0..200 {
            let frame = admit_tick(&mut s);
            let positions = units.iter().map(|(id, _, _)| {
                let p = unit_position(&frame, id.as_bytes());
                [p[0], p[2]]
            }).collect::<Vec<_>>();
            for (index, (id, _, _)) in units.iter().enumerate() {
                let p = positions[index];
                let speed = actor_number(&frame, id.as_bytes(), b"movement-speed");
                assert!((p[0] - previous[index][0]).hypot(p[1] - previous[index][1]) <= speed * 0.016 + 1e-10,
                    "{name} tick {tick} exceeded its travel allowance");
                assert!((p[0] + 6.0).hypot(p[1] - 4.0) >= 1.8 - 1e-10,
                    "{name} tick {tick} entered the stone: {positions:?}");
                for peer in (index + 1)..units.len() {
                    // Relative swept motion tests the space between admitted endpoints too.
                    let relative = [previous[index][0] - previous[peer][0], previous[index][1] - previous[peer][1]];
                    let delta = [p[0] - positions[peer][0] - relative[0], p[1] - positions[peer][1] - relative[1]];
                    let norm = delta[0] * delta[0] + delta[1] * delta[1];
                    let along = if norm == 0.0 { 0.0 } else { (-(relative[0] * delta[0] + relative[1] * delta[1]) / norm).clamp(0.0, 1.0) };
                    assert!((relative[0] + along * delta[0]).hypot(relative[1] + along * delta[1]) >= 1.2 - 1e-10,
                        "{name} tick {tick} overlapped footprints: {positions:?}");
                }
            }
            previous = positions;
            if units.iter().enumerate().all(|(index, (id, _, target))| previous[index] == *target
                && !projected_boolean(projected_field(projected_field(&frame, id.as_bytes()), b"moving"))) {
                arrived = true;
                break;
            }
        }
        assert!(arrived, "{name} did not arrive: {previous:?}");
    }
}

#[test]
fn movement_rejects_destinations_inside_stone_or_outside_battlefield() {
    let mut s = session();
    let initial = admit_tick(&mut s);
    key(&mut s, b"ClearSelection");
    pick(&mut s, &initial, b"warrior-1");
    for (x, z, report) in [(-6.0, 4.0, b"Path blocked".as_slice()), (41.0, 0.0, b"Beyond the battlefield")] {
        scalar(&mut s, b"PointerWorldX", x);
        scalar(&mut s, b"PointerWorldZ", z);
        key(&mut s, b"IssueMove");
        let frame = admit_tick(&mut s);
        assert_eq!(unit_position(&frame, b"warrior-1"), unit_position(&initial, b"warrior-1"));
        assert_eq!(projected_field(projected_field(&frame, b"warrior-1"), b"order-report").as_atom().unwrap().canonical_payload(), report);
        assert!(!projected_boolean(projected_field(projected_field(&frame, b"warrior-1"), b"order-accepted")));
    }
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
fn movement_has_constant_speed_and_straight_direction_then_exact_arrival() {
    for [dx, dz] in [[5.0, 0.0], [3.0, 4.0], [-3.0, -4.0]] {
        let mut s = session_for(&travel_fixture(&[("warrior-1", [-12.0, -12.0], [-12.0, -12.0])]));
        let initial = admit_tick(&mut s);
        let start = unit_position(&initial, b"warrior-1");
        let speed = actor_number(&initial, b"warrior-1", b"movement-speed");
        key(&mut s, b"ClearSelection");
        pick(&mut s, &initial, b"warrior-1");
        scalar(&mut s, b"PointerWorldX", start[0] + dx);
        scalar(&mut s, b"PointerWorldZ", start[2] + dz);
        key(&mut s, b"IssueMove");
        let ordered = admit_tick(&mut s);
        let first_step = unit_position(&ordered, b"warrior-1");
        assert!((first_step[0] - start[0] - dx * speed * 0.016 / 5.0).abs() < 1e-10);
        assert!((first_step[2] - start[2] - dz * speed * 0.016 / 5.0).abs() < 1e-10);
        let halfway = advance(&mut s, 24);
        let position = unit_position(&halfway, b"warrior-1");
        let distance = speed * 0.016 * 25.0;
        assert!(((position[0] - start[0]).hypot(position[2] - start[2]) - distance).abs() < 1e-10);
        assert!((position[0] - start[0] - dx * distance / 5.0).abs() < 1e-10);
        assert!((position[2] - start[2] - dz * distance / 5.0).abs() < 1e-10);
        let total_ticks = (5.0 / (speed * 0.016)).ceil() as usize;
        let before_arrival = advance(&mut s, total_ticks - 25 - 1);
        assert_ne!(unit_position(&before_arrival, b"warrior-1"), [start[0] + dx, 0.0, start[2] + dz]);
        let arrived = admit_tick(&mut s);
        assert_eq!(unit_position(&arrived, b"warrior-1"), [start[0] + dx, 0.0, start[2] + dz]);
        assert!(!projected_boolean(projected_field(projected_field(&arrived, b"warrior-1"), b"moving")));
    }
}

#[test]
fn stop_only_cancels_selected_living_units_and_new_orders_replace_old_routes() {
    let source = std::str::from_utf8(EMBODIED_SOURCE).unwrap()
        .replacen("ranger-1 alive true", "ranger-1 alive false", 1)
        .replacen("ranger-1 moving false", "ranger-1 moving true", 1)
        .replacen("ranger-1 unit destination Vec3 { x: 1.0, y: 0.0, z: 3.0 }",
            "ranger-1 unit destination Vec3 { x: 10.0, y: 0.0, z: 12.0 }", 1);
    let mut s = session_for(source.as_bytes());
    let initial = admit_tick(&mut s);
    scalar(&mut s, b"PointerWorldX", 30.0);
    scalar(&mut s, b"PointerWorldZ", 20.0);
    key(&mut s, b"IssueMove");
    let traveling = advance(&mut s, 5);
    let warrior_position = unit_position(&traveling, b"warrior-1");
    let artificer_position = unit_position(&traveling, b"artificer-1");
    assert_ne!(warrior_position, unit_position(&initial, b"warrior-1"));
    assert!(projected_boolean(projected_field(projected_field(&traveling, b"ranger-1"), b"moving")),
        "fallen-unit fixture must still have an unfinished order before Stop");

    key(&mut s, b"ClearSelection");
    pick(&mut s, &traveling, b"warrior-1");
    pick(&mut s, &traveling, b"ranger-1");
    key(&mut s, b"Stop");
    let stopped = advance(&mut s, 5);
    assert_eq!(unit_position(&stopped, b"warrior-1"), warrior_position);
    assert_ne!(unit_position(&stopped, b"artificer-1"), artificer_position);
    assert!(!projected_boolean(projected_field(projected_field(&stopped, b"warrior-1"), b"moving")));
    assert!(projected_boolean(projected_field(projected_field(&stopped, b"ranger-1"), b"moving")),
        "Stop must not change a fallen unit's orders");

    scalar(&mut s, b"PointerWorldX", 30.0);
    scalar(&mut s, b"PointerWorldZ", 20.0);
    key(&mut s, b"IssueMove");
    let resumed = advance(&mut s, 5);
    assert_ne!(unit_position(&resumed, b"warrior-1"), warrior_position);
    let replacement = [warrior_position[0] - 1.0, 0.0, warrior_position[2] + 2.0];
    scalar(&mut s, b"PointerWorldX", replacement[0]);
    scalar(&mut s, b"PointerWorldZ", replacement[2]);
    key(&mut s, b"IssueMove");
    let arrived = advance(&mut s, 100);
    assert_eq!(unit_position(&arrived, b"warrior-1"), replacement);
    assert_eq!(unit_position(&advance(&mut s, 25), b"warrior-1"), replacement,
        "neither Stop nor a replacement may leave an older route queued");
}

#[test]
fn partial_group_arrives_centered_on_click_without_overlapping() {
    let mut s = session();
    let initial = admit_tick(&mut s);
    key(&mut s, b"ClearSelection");
    pick(&mut s, &initial, b"warrior-1");
    pick(&mut s, &initial, b"priest-1");
    scalar(&mut s, b"PointerWorldX", 5.5);
    scalar(&mut s, b"PointerWorldZ", 2.0);
    key(&mut s, b"IssueMove");
    let arrived = advance(&mut s, 120);
    let warrior = unit_position(&arrived, b"warrior-1");
    let priest = unit_position(&arrived, b"priest-1");
    assert!((warrior[0] - 5.0).abs() < 0.01 && (warrior[2] - 1.0).abs() < 0.01);
    assert!((priest[0] - 6.0).abs() < 0.01 && (priest[2] - 3.0).abs() < 0.01);
    assert_eq!([(warrior[0] + priest[0]) / 2.0, (warrior[2] + priest[2]) / 2.0], [5.5, 2.0]);
    assert_eq!(unit_position(&arrived, b"artificer-1"), unit_position(&initial, b"artificer-1"));
}

#[test]
fn occupied_group_destinations_are_rejected_without_moving_unselected_units() {
    let mut s = session();
    let initial = admit_tick(&mut s);
    key(&mut s, b"ClearSelection");
    pick(&mut s, &initial, b"warrior-1");
    pick(&mut s, &initial, b"priest-1");
    scalar(&mut s, b"PointerWorldX", 0.5);
    scalar(&mut s, b"PointerWorldZ", 2.0);
    key(&mut s, b"IssueMove");
    let rejected = advance(&mut s, 3);
    for id in [b"warrior-1".as_slice(), b"priest-1"] {
        assert_eq!(unit_position(&rejected, id), unit_position(&initial, id));
        assert_eq!(actor_message(&rejected, id, b"order-report"), "Space occupied");
        assert!(!projected_boolean(projected_field(projected_field(&rejected, id), b"order-accepted")));
    }
    for id in [b"artificer-1".as_slice(), b"rogue-1", b"ranger-1"] {
        assert_eq!(unit_position(&rejected, id), unit_position(&initial, id));
    }
    key(&mut s, b"ClearSelection");
    pick(&mut s, &rejected, b"warrior-1");
    let other = unit_position(&rejected, b"artificer-1");
    scalar(&mut s, b"PointerWorldX", other[0] - 0.5);
    scalar(&mut s, b"PointerWorldZ", other[2]);
    key(&mut s, b"IssueMove");
    let near = admit_tick(&mut s);
    assert_eq!(actor_message(&near, b"warrior-1", b"order-report"), "Space occupied",
        "unit footprints must reject overlap, not only equal centers");
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
    assert_eq!(actor_message(&attacked, b"warrior-1", b"attack-readiness"), "Cooling down");
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
    assert_eq!(actor_message(&unchanged, b"warrior-1", b"attack-readiness"), "Out of range");
}

fn actor_message<'a>(frame: &'a clause_package::Term, actor: &[u8], relation: &[u8]) -> &'a str {
    std::str::from_utf8(projected_field(projected_field(frame, actor), relation)
        .as_atom().unwrap().canonical_payload()).unwrap()
}

#[test]
fn shared_readiness_reports_selection_ability_and_target_rejections() {
    let mut s = session();
    let first = admit_tick(&mut s);
    assert_eq!(actor_message(&first, b"warrior-1", b"attack-readiness"), "No battle in progress");
    key(&mut s, b"BeginEncounter");
    key(&mut s, b"ClearSelection");
    let empty = admit_tick(&mut s);
    assert_eq!(actor_message(&empty, b"warrior-1", b"attack-readiness"), "Not selected");
    pick(&mut s, &empty, b"warrior-1");
    target(&mut s, &empty, b"moonwell");
    let wrong = admit_tick(&mut s);
    assert_eq!(actor_message(&wrong, b"warrior-1", b"attack-readiness"), "Wrong target");
    assert_eq!(actor_message(&wrong, b"warrior-1", b"heal-readiness"), "Ability unavailable");
    assert_eq!(actor_message(&wrong, b"warrior-1", b"ward-readiness"), "Ability unavailable");
    assert_eq!(actor_message(&wrong, b"warrior-1", b"ignite-readiness"), "Ability unavailable");
    let health = actor_number(&wrong, b"moonwell", b"vitality");
    key(&mut s, b"Attack");
    let attacked = admit_tick(&mut s);
    assert_eq!(actor_message(&attacked, b"warrior-1", b"order-report"), "Wrong target");
    assert_eq!(actor_number(&attacked, b"warrior-1", b"order-number"), 1.0);
    key(&mut s, b"Heal");
    key(&mut s, b"Ward");
    let rejected = admit_tick(&mut s);
    assert!(actor_number(&rejected, b"moonwell", b"vitality") <= health);
    assert_eq!(actor_number(&rejected, b"warrior-1", b"action-cooldown"), 0.0);
    assert_eq!(actor_message(&rejected, b"warrior-1", b"order-report"), "Ability unavailable");
    assert_eq!(actor_number(&rejected, b"warrior-1", b"order-number"), 3.0);
    key(&mut s, b"ClearSelection");
    pick(&mut s, &rejected, b"priest-1");
    let priest = admit_tick(&mut s);
    assert_eq!(actor_message(&priest, b"priest-1", b"heal-readiness"), "Ready");
    assert_eq!(actor_message(&priest, b"priest-1", b"ward-readiness"), "Ready");
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
    pick(&mut s, &initial, b"warrior-1");
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
    assert_eq!(actor_message(&ignited, b"warrior-1", b"order-report"), "Ability unavailable");
    assert_eq!(actor_message(&ignited, b"artificer-1", b"order-report"), "Ready");
    assert_eq!(actor_message(&ignited, b"ranger-1", b"ignite-readiness"), "Cooling down");

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
