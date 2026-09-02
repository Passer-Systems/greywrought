use std::error::Error;
use std::str;
use std::time::Instant;

use clause_package::{
    CausalRef, IssuedAdmissionAuthorizationOccurrenceId, Term, decode_canonical_term_bytes,
};
use clause_runtime::{
    ExecutableCandidateV1, ExecutableInputSourceV1, ExecutableKeyPhaseV1,
    PersistentProcessSessionV1, decode_wasm_process_request_v1, encode_wasm_process_request_v1,
    open_fresh_persistent_process_session_v1,
};
use clause_workbench::ResidentSourceWorkbenchV1;
use greywrought_clause::EMBODIED_SOURCE;

fn open_session_from_source(source: &[u8]) -> Result<PersistentProcessSessionV1, Box<dyn Error>> {
    let source = ResidentSourceWorkbenchV1::open(source)?;
    let mut request = decode_wasm_process_request_v1(&source.generation().cwr1)?;
    request.authority.budget_units = 1_000_000;
    Ok(open_fresh_persistent_process_session_v1(
        &encode_wasm_process_request_v1(&request)?,
    )?)
}

fn open_session() -> Result<PersistentProcessSessionV1, Box<dyn Error>> {
    open_session_from_source(EMBODIED_SOURCE)
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

fn key_down(session: &mut PersistentProcessSessionV1, code: &[u8]) -> Result<(), Box<dyn Error>> {
    key(session, code, ExecutableKeyPhaseV1::Down)
}

fn key_up(session: &mut PersistentProcessSessionV1, code: &[u8]) -> Result<(), Box<dyn Error>> {
    key(session, code, ExecutableKeyPhaseV1::Up)
}

fn scalar_input(
    session: &mut PersistentProcessSessionV1,
    channel: &[u8],
    value: f64,
) -> Result<(), Box<dyn Error>> {
    session.apply_physical_input(
        &ExecutableInputSourceV1::Scalar {
            channel: channel.to_vec(),
        },
        Some(value),
    )?;
    Ok(())
}

fn admitted_tick(
    session: &mut PersistentProcessSessionV1,
) -> Result<(ExecutableCandidateV1, Term), Box<dyn Error>> {
    let predecessor = session.world_base();
    let prior_admission = session.last_admitted().map(|revision| revision.id);
    session.apply_fixed_tick_and_emit_candidate(16)?;
    let candidate = session
        .candidate()?
        .ok_or("fixed tick did not retain a CandidateDelta")?
        .clone();
    assert_eq!(candidate.base, predecessor);
    assert_eq!(session.world_base(), predecessor);
    assert_eq!(
        session.last_admitted().map(|revision| revision.id),
        prior_admission,
        "Candidate production must not install a world successor",
    );
    let authorization = session.issue_candidate_admission_authorization()?;
    let (successor, projection) = session.admit_issued_candidate_with_projection(authorization)?;
    assert_eq!(successor.predecessor, candidate.base);
    assert_ne!(successor.id, candidate.base);
    let projection = projection
        .ok_or("Admission emitted no renderer projection")?
        .term;
    session.compact_to_admitted_frontier()?;
    Ok((candidate, projection))
}

fn admitted_opaque_input(
    session: &mut PersistentProcessSessionV1,
    occurrence: &[u8],
) -> Result<Term, Box<dyn Error>> {
    let predecessor = session.world_base();
    session.apply_opaque_input_and_emit_candidate(occurrence)?;
    let candidate = session
        .candidate()?
        .ok_or("opaque input did not retain a CandidateDelta")?
        .clone();
    assert_eq!(candidate.base, predecessor);
    assert_eq!(session.world_base(), predecessor);
    let authorization = session.issue_candidate_admission_authorization()?;
    let (successor, projection) = session.admit_issued_candidate_with_projection(authorization)?;
    assert_eq!(successor.predecessor, candidate.base);
    let projection = projection
        .ok_or("opaque-input Admission emitted no renderer projection")?
        .term;
    session.compact_to_admitted_frontier()?;
    Ok(projection)
}

#[test]
fn sustained_mixed_input_session_remains_live() -> Result<(), Box<dyn Error>> {
    let mut session = open_session()?;
    key_down(&mut session, b"KeyR")?;

    let directions: [&[u8]; 4] = [b"KeyW", b"KeyD", b"KeyS", b"KeyA"];
    let mut direction = 0;
    key_down(&mut session, directions[direction])?;
    let mut projection = admitted_tick(&mut session)?.1;

    for tick in 1..=1_000 {
        if tick % 55 == 0 {
            key_up(&mut session, directions[direction])?;
            direction = (direction + 1) % directions.len();
            key_down(&mut session, directions[direction])?;
        }
        if tick % 33 == 0 {
            key_down(&mut session, b"KeyJ")?;
        }
        if objective_phase(&projection) != 0.0 {
            key_down(&mut session, b"KeyR")?;
        }

        projection = match admitted_tick(&mut session) {
            Ok((_, projection)) => projection,
            Err(error) => panic!(
                "persistent mixed-input tick {tick} failed at player {:?}, enemy {:?}, pressure {}: {error:#}",
                vector(&projection, b"position"),
                enemy_vector(&projection, b"position"),
                String::from_utf8_lossy(enemy_symbol(&projection, b"pressure-state")),
            ),
        };
    }

    key_up(&mut session, directions[direction])?;
    let usage = session.carrier()?.resource_usage();
    assert!(
        usage.accepted_ingress_bytes < 72 * 1024 * 1024,
        "1,000 mixed-input ticks processed {} ingress bytes, exceeding the 72 MiB liveness budget",
        usage.accepted_ingress_bytes,
    );
    assert!(
        usage.resident_ingress_records < 4_096,
        "Admission compaction retained {} ingress records",
        usage.resident_ingress_records,
    );
    Ok(())
}

fn projected_field<'a>(term: &'a Term, expected: &[u8]) -> &'a Term {
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
    let payload = term
        .as_atom()
        .expect("projected number is an Atom")
        .canonical_payload();
    f64::from_bits(u64::from_le_bytes(
        payload.try_into().expect("projected F64 is exact"),
    ))
}

fn projected_bool(term: &Term) -> bool {
    match term
        .as_atom()
        .expect("projected Bool is an Atom")
        .canonical_payload()
    {
        [1] => true,
        [0] => false,
        _ => panic!("projected Bool is canonical"),
    }
}

fn player<'a>(projection: &'a Term) -> &'a Term {
    projected_field(projection, b"player-1")
}

fn enemy<'a>(projection: &'a Term) -> &'a Term {
    projected_field(projection, b"cinder-wraith")
}

fn wayfarer_bolt<'a>(projection: &'a Term) -> &'a Term {
    projected_field(projection, b"wayfarer-bolt")
}

fn objective<'a>(projection: &'a Term) -> &'a Term {
    projected_field(projection, b"game-objective")
}

fn arena<'a>(projection: &'a Term) -> &'a Term {
    projected_field(projection, b"jump-arena")
}

fn frontier<'a>(projection: &'a Term) -> &'a Term {
    projected_field(projection, b"ashen-verge")
}

fn number(projection: &Term, field: &[u8]) -> f64 {
    projected_number(projected_field(player(projection), field))
}

fn boolean(projection: &Term, field: &[u8]) -> bool {
    projected_bool(projected_field(player(projection), field))
}

fn vector(projection: &Term, field: &[u8]) -> [f64; 3] {
    let value = projected_field(player(projection), field);
    [b"x", b"y", b"z"].map(|component| projected_number(projected_field(value, component)))
}

fn enemy_vector(projection: &Term, field: &[u8]) -> [f64; 3] {
    let value = projected_field(enemy(projection), field);
    [b"x", b"y", b"z"].map(|component| projected_number(projected_field(value, component)))
}

fn enemy_symbol<'a>(projection: &'a Term, field: &[u8]) -> &'a [u8] {
    projected_field(enemy(projection), field)
        .as_atom()
        .expect("projected behavior is an Atom")
        .canonical_payload()
}

fn enemy_vitality(projection: &Term) -> f64 {
    let vitals = projected_field(enemy(projection), b"enemy-vitals");
    projected_number(projected_field(vitals, b"x"))
}

fn objective_phase(projection: &Term) -> f64 {
    let state = projected_field(objective(projection), b"objective-state");
    projected_number(projected_field(state, b"x"))
}

fn frontier_access(projection: &Term) -> &[u8] {
    projected_field(frontier(projection), b"frontier-access")
        .as_atom()
        .expect("projected frontier access is an Atom")
        .canonical_payload()
}

fn frontier_progress(projection: &Term) -> f64 {
    projected_number(projected_field(frontier(projection), b"foothold-progress"))
}

fn frontier_boundary_x(projection: &Term) -> f64 {
    projected_number(projected_field(frontier(projection), b"frontier-boundary-x"))
}

fn arena_max_x(projection: &Term) -> f64 {
    projected_number(projected_field(arena(projection), b"max-x"))
}

fn loot_symbol<'a>(projection: &'a Term, loot: &[u8], field: &[u8]) -> &'a [u8] {
    projected_field(projected_field(projection, loot), field)
        .as_atom()
        .expect("projected loot field is an Atom")
        .canonical_payload()
}

fn frontier_proof_source() -> Vec<u8> {
    let mut source = EMBODIED_SOURCE.to_vec();
    source.extend_from_slice(
        br#"

on prepare-frontier-player-proof ?player
  when
    ?player position Vec3 { x: ?player-x, y: ?player-y, z: ?player-z }
  withdraw
    ?player position Vec3 { x: ?player-x, y: ?player-y, z: ?player-z }
  include
    ?player position Vec3 { x: -2.0, y: ?player-y, z: -1.0 }

on prepare-frontier-cache-player-proof ?player
  when
    ?player position Vec3 { x: ?player-x, y: ?player-y, z: ?player-z }
  withdraw
    ?player position Vec3 { x: ?player-x, y: ?player-y, z: ?player-z }
  include
    ?player position Vec3 { x: 22.0, y: ?player-y, z: -2.0 }

on prepare-frontier-enemy-proof ?enemy
  when
    ?enemy enemy vitals Vec3 { x: ?vitality, y: ?maximum, z: ?alive-flag }
    ?enemy enemy combat status ?enemy-status
  withdraw
    ?enemy enemy vitals Vec3 { x: ?vitality, y: ?maximum, z: ?alive-flag }
    ?enemy enemy combat status ?enemy-status
  include
    ?enemy enemy vitals Vec3 { x: 0.0, y: ?maximum, z: ?alive-flag }
    ?enemy enemy combat status dead

on prepare-frontier-key-proof ?objective
  when
    ?objective objective state Vec3 { x: ?objective-state, y: ?branch, z: ?unused-state }
    ashen-key loot state ?loot-state
    ashen-key custody ?custodian
  withdraw
    ashen-key loot state ?loot-state
    ashen-key custody ?custodian
  include
    ashen-key loot state acquired
    ashen-key custody player-1
"#,
    );
    source
}

#[test]
fn persisted_foothold_is_revalidated_by_clause_law() -> Result<(), Box<dyn Error>> {
    let mut partial = open_session()?;
    scalar_input(&mut partial, b"PersistedFootholdProgress", 2.0)?;
    scalar_input(
        &mut partial,
        b"PersistedPermanentFootholdProgress",
        2.0,
    )?;
    let partial_projection = admitted_tick(&mut partial)?.1;
    assert_eq!(frontier_progress(&partial_projection), 2.0);
    assert_eq!(frontier_access(&partial_projection), b"sealed");

    let mut permanent = open_session()?;
    scalar_input(&mut permanent, b"PersistedFootholdProgress", 999.0)?;
    scalar_input(
        &mut permanent,
        b"PersistedPermanentFootholdProgress",
        999.0,
    )?;
    let permanent_projection = admitted_tick(&mut permanent)?.1;
    assert_eq!(frontier_progress(&permanent_projection), 3.0);
    assert_eq!(frontier_access(&permanent_projection), b"permanent-open");
    assert_eq!(arena_max_x(&permanent_projection), 2048.0);

    let mut rejected = open_session()?;
    scalar_input(&mut rejected, b"PersistedFootholdProgress", -5.0)?;
    scalar_input(
        &mut rejected,
        b"PersistedPermanentFootholdProgress",
        -5.0,
    )?;
    let rejected_projection = admitted_tick(&mut rejected)?.1;
    assert_eq!(frontier_progress(&rejected_projection), 0.0);
    assert_eq!(frontier_access(&rejected_projection), b"sealed");
    Ok(())
}

fn source_with_behavior(binding: &str) -> Vec<u8> {
    let source = str::from_utf8(EMBODIED_SOURCE).expect("embedded Clause source is UTF-8");
    let canonical = "cinder-wraith combat behavior relentless-charge";
    assert_eq!(source.matches(canonical).count(), 1);
    source.replacen(canonical, binding, 1).into_bytes()
}

fn patient_behavior_source() -> Vec<u8> {
    let source = str::from_utf8(EMBODIED_SOURCE).expect("embedded Clause source is UTF-8");
    let canonical_reconciliation = r#"on reconcile-relentless-combat-behavior ?enemy
  when
    ?enemy combat behavior ?prior-behavior
    ?prior-behavior = patient-charge
  withdraw
    ?enemy combat behavior ?prior-behavior
  include
    ?enemy combat behavior relentless-charge"#;
    let patient_reconciliation = r#"on reconcile-patient-combat-behavior ?enemy
  when
    ?enemy combat behavior ?prior-behavior
    ?prior-behavior = relentless-charge
  withdraw
    ?enemy combat behavior ?prior-behavior
  include
    ?enemy combat behavior patient-charge"#;
    assert_eq!(source.matches(canonical_reconciliation).count(), 1);
    source
        .replacen(canonical_reconciliation, patient_reconciliation, 1)
        .into_bytes()
}

fn source_with_booster_equipment(binding: &str) -> Vec<u8> {
    let source = str::from_utf8(EMBODIED_SOURCE).expect("embedded Clause source is UTF-8");
    let canonical = "player-1 equipped booster balanced-booster-rig";
    assert_eq!(source.matches(canonical).count(), 1);
    source.replacen(canonical, binding, 1).into_bytes()
}

fn burst_booster_source() -> Vec<u8> {
    source_with_booster_equipment("player-1 equipped booster burst-booster-rig")
}

fn admit_workbench(
    workbench: &mut ResidentSourceWorkbenchV1,
    occurrences: &[Vec<u8>],
) -> Result<Term, Box<dyn Error>> {
    let prior_projection = workbench.last_projection().cloned();
    workbench.run_occurrences_to_candidate(occurrences)?;
    assert_eq!(
        workbench.last_projection(),
        prior_projection.as_ref(),
        "Candidate state must not replace the last admitted projection"
    );
    let admitted = workbench.admit()?;
    Ok(decode_canonical_term_bytes(
        &admitted.projection.exact_term_bytes,
    )?)
}

fn admitted_workbench_tick(
    workbench: &mut ResidentSourceWorkbenchV1,
    prefix: Vec<Vec<u8>>,
) -> Result<Term, Box<dyn Error>> {
    let mut occurrences = prefix;
    occurrences.extend(workbench.fixed_tick_occurrences(0.016)?);
    admit_workbench(workbench, &occurrences)
}

#[test]
fn camera_relative_wasd_supports_diagonal_holds_and_sustain_direction_changes()
-> Result<(), Box<dyn Error>> {
    let mut session = open_session()?;
    key_down(&mut session, b"KeyW")?;
    key_down(&mut session, b"KeyA")?;
    let (_, intent_frame) = admitted_tick(&mut session)?;
    assert_eq!(
        vector(&intent_frame, b"horizontal-intent"),
        [-1.0, 0.0, -1.0]
    );
    let start = vector(&intent_frame, b"position");
    let (_, diagonal) = admitted_tick(&mut session)?;
    let diagonal_position = vector(&diagonal, b"position");
    assert!(diagonal_position[0] < start[0]);
    assert!(diagonal_position[2] < start[2]);

    key_down(&mut session, b"ShiftLeft")?;
    let (_, sustain_armed) = admitted_tick(&mut session)?;
    let armed_position = vector(&sustain_armed, b"position");
    assert_eq!(number(&sustain_armed, b"move-speed"), 7.0);
    assert!(number(&sustain_armed, b"booster-energy") < 100.0);
    let (_, sustained) = admitted_tick(&mut session)?;
    let sustained_position = vector(&sustained, b"position");
    assert!(
        (sustained_position[0] - armed_position[0]).abs() > (diagonal_position[0] - start[0]).abs(),
        "held horizontal sustain scales current WASD movement"
    );

    key_up(&mut session, b"KeyW")?;
    key_up(&mut session, b"KeyA")?;
    key_down(&mut session, b"KeyD")?;
    let (_, redirected_intent) = admitted_tick(&mut session)?;
    assert_eq!(
        vector(&redirected_intent, b"horizontal-intent"),
        [1.0, 0.0, 0.0]
    );
    let redirected_start = vector(&redirected_intent, b"position");
    let (_, redirected) = admitted_tick(&mut session)?;
    let redirected_position = vector(&redirected, b"position");
    assert!(redirected_position[0] > redirected_start[0]);
    assert!((redirected_position[2] - redirected_start[2]).abs() < 1.0e-9);
    Ok(())
}

#[test]
fn camera_relative_wasd_rotates_with_the_observed_camera_basis() -> Result<(), Box<dyn Error>> {
    let mut session = open_session()?;
    scalar_input(&mut session, b"CameraForwardX", 1.0)?;
    scalar_input(&mut session, b"CameraForwardZ", 0.0)?;
    key_down(&mut session, b"KeyW")?;

    let (_, intent_frame) = admitted_tick(&mut session)?;
    assert_eq!(
        vector(&intent_frame, b"horizontal-intent"),
        [1.0, 0.0, 0.0],
        "camera-right became Clause-authored forward after the observed quarter turn",
    );
    let start = vector(&intent_frame, b"position");
    let (_, moved) = admitted_tick(&mut session)?;
    let position = vector(&moved, b"position");
    assert!(position[0] > start[0]);
    assert!((position[2] - start[2]).abs() < 1.0e-9);
    Ok(())
}

fn observed_booster_signature(source: &[u8]) -> Result<[f64; 6], Box<dyn Error>> {
    let mut sustained = ResidentSourceWorkbenchV1::open(source)?;
    let hold_forward = sustained.handler_occurrence(b"hold-forward", &[])?;
    admit_workbench(&mut sustained, &[hold_forward])?;
    let enable_sustain = sustained.handler_occurrence(b"enable-horizontal-sustain", &[])?;
    admit_workbench(&mut sustained, &[enable_sustain])?;
    let sustained_frame = admitted_workbench_tick(&mut sustained, vec![])?;

    let mut horizontal = ResidentSourceWorkbenchV1::open(source)?;
    let hold_forward = horizontal.handler_occurrence(b"hold-forward", &[])?;
    let held = admitted_workbench_tick(&mut horizontal, vec![hold_forward])?;
    let horizontal_burst = horizontal.handler_occurrence(b"horizontal-burst", &[])?;
    let burst = admit_workbench(&mut horizontal, &[horizontal_burst])?;

    let mut vertical = ResidentSourceWorkbenchV1::open(source)?;
    let vertical_burst = vertical.handler_occurrence(b"vertical-burst", &[])?;
    let launched = admit_workbench(&mut vertical, &[vertical_burst])?;

    Ok([
        number(&sustained_frame, b"move-speed"),
        100.0 - number(&sustained_frame, b"booster-energy"),
        vector(&held, b"position")[2] - vector(&burst, b"position")[2],
        100.0 - number(&burst, b"booster-energy"),
        vector(&launched, b"velocity")[1],
        100.0 - number(&launched, b"booster-energy"),
    ])
}

fn assert_booster_signature(actual: [f64; 6], expected: [f64; 6]) {
    for (index, (actual, expected)) in actual.into_iter().zip(expected).enumerate() {
        assert!(
            (actual - expected).abs() < 1.0e-9,
            "booster signature field {index} was {actual}, expected {expected}",
        );
    }
}

#[test]
fn typed_equipped_booster_selects_sustained_and_burst_parameters() -> Result<(), Box<dyn Error>> {
    assert_booster_signature(
        observed_booster_signature(EMBODIED_SOURCE)?,
        [7.0, 0.5, 5.6, 20.0, 5.0, 25.0],
    );
    assert_booster_signature(
        observed_booster_signature(&burst_booster_source())?,
        [5.5, 0.8, 3.4, 30.0, 7.0, 35.0],
    );
    Ok(())
}

#[test]
fn horizontal_burst_is_immediate_directional_and_preserves_velocity() -> Result<(), Box<dyn Error>>
{
    let mut no_intent = ResidentSourceWorkbenchV1::open(EMBODIED_SOURCE)?;
    let burst = no_intent.handler_occurrence(b"horizontal-burst", &[])?;
    let unchanged = admit_workbench(&mut no_intent, &[burst])?;
    assert_eq!(vector(&unchanged, b"velocity"), [0.0, 0.0, 0.0]);
    assert_eq!(number(&unchanged, b"booster-energy"), 100.0);

    let mut workbench = ResidentSourceWorkbenchV1::open(EMBODIED_SOURCE)?;
    let jump = workbench.handler_occurrence(b"jump", &[])?;
    let jumped = admit_workbench(&mut workbench, &[jump])?;
    assert_eq!(vector(&jumped, b"velocity"), [0.0, 3.0, 0.0]);
    let hold_forward = workbench.handler_occurrence(b"hold-forward", &[])?;
    let intent = admitted_workbench_tick(&mut workbench, vec![hold_forward])?;
    assert_eq!(vector(&intent, b"horizontal-intent"), [0.0, 0.0, -1.0]);
    let velocity_before = vector(&intent, b"velocity");
    let position_before = vector(&intent, b"position");
    let burst = workbench.handler_occurrence(b"horizontal-burst", &[])?;
    let propelled = admit_workbench(&mut workbench, &[burst])?;
    let position = vector(&propelled, b"position");
    assert_eq!(vector(&propelled, b"velocity"), velocity_before);
    assert_eq!(position[0], position_before[0]);
    assert_eq!(position[1], position_before[1]);
    assert!((position[2] - (position_before[2] - 5.6)).abs() < 1.0e-9);
    assert_eq!(number(&propelled, b"booster-energy"), 80.0);
    Ok(())
}

#[test]
fn projectile_opening_converts_through_atomic_burst_into_committed_melee()
-> Result<(), Box<dyn Error>> {
    let mut session = open_session()?;

    key_down(&mut session, b"Tab")?;
    let (_, targeted) = admitted_tick(&mut session)?;
    assert!(boolean(&targeted, b"target-lock-active"));

    key_down(&mut session, b"Digit1")?;
    let (_, mut projection) = admitted_tick(&mut session)?;
    let mut saw_projectile = false;
    let mut saw_opening = false;
    for _ in 0..160 {
        saw_projectile |= projected_bool(projected_field(
            wayfarer_bolt(&projection),
            b"projectile-visible",
        ));
        if enemy_symbol(&projection, b"enemy-pressure-state") == b"projectile-opening" {
            saw_opening = true;
            break;
        }
        projection = admitted_tick(&mut session)?.1;
    }
    assert!(saw_projectile, "Digit1 launched no visible wayfarer projectile");
    assert!(saw_opening, "the projectile produced no admitted opening");

    let before_burst = vector(&projection, b"position");
    key_down(&mut session, b"KeyD")?;
    key_down(&mut session, b"KeyQ")?;
    let (_, burst) = admitted_tick(&mut session)?;
    let after_burst = vector(&burst, b"position");
    assert!(
        after_burst[0] - before_burst[0] > 5.0,
        "current D input did not atomically direct the Q burst"
    );
    assert_eq!(number(&burst, b"booster-energy"), 80.0);

    key_up(&mut session, b"KeyD")?;
    admitted_tick(&mut session)?;
    key_down(&mut session, b"KeyJ")?;
    let mut damaged = false;
    for _ in 0..24 {
        projection = admitted_tick(&mut session)?.1;
        if enemy_vitality(&projection) < 6.0 {
            damaged = true;
            break;
        }
    }
    assert!(damaged, "the committed sword action did not convert the opening");
    assert_eq!(enemy_vitality(&projection), 4.0);
    Ok(())
}

#[test]
fn jump_vertical_sustain_and_energy_recovery_are_orthogonal() -> Result<(), Box<dyn Error>> {
    let mut session = open_session()?;
    key_down(&mut session, b"Space")?;
    let (_, jumped) = admitted_tick(&mut session)?;
    assert!(!boolean(&jumped, b"grounded"));
    let jump_velocity = vector(&jumped, b"velocity")[1];
    key_down(&mut session, b"Space")?;
    let (_, repeated_jump) = admitted_tick(&mut session)?;
    assert!(
        vector(&repeated_jump, b"velocity")[1] < jump_velocity,
        "Space cannot restart jump speed while airborne"
    );

    let mut sustain = open_session()?;
    key_down(&mut sustain, b"KeyE")?;
    let (_, thrusting) = admitted_tick(&mut sustain)?;
    let thrust_velocity = vector(&thrusting, b"velocity");
    assert!(!boolean(&thrusting, b"grounded"));
    assert!(thrust_velocity[1] > 0.0);
    assert_eq!(thrust_velocity[0], 0.0);
    assert_eq!(thrust_velocity[2], 0.0);
    assert!(number(&thrusting, b"booster-energy") < 100.0);
    key_up(&mut sustain, b"KeyE")?;
    let (_, coasting) = admitted_tick(&mut sustain)?;
    assert!(vector(&coasting, b"velocity")[1] < thrust_velocity[1]);

    let mut burst = ResidentSourceWorkbenchV1::open(EMBODIED_SOURCE)?;
    let vertical_burst = burst.handler_occurrence(b"vertical-burst", &[])?;
    let first = admit_workbench(&mut burst, &[vertical_burst.clone()])?;
    let first_velocity = vector(&first, b"velocity");
    assert_eq!(first_velocity, [0.0, 5.0, 0.0]);
    assert_eq!(number(&first, b"booster-energy"), 75.0);
    let repeated = admit_workbench(&mut burst, &[vertical_burst.clone()])?;
    assert_eq!(vector(&repeated, b"velocity"), [0.0, 10.0, 0.0]);
    assert_eq!(number(&repeated, b"booster-energy"), 50.0);

    let mut recovering_session = open_session()?;
    let mut exhausted = None;
    for _ in 0..4 {
        key_down(&mut recovering_session, b"KeyF")?;
        exhausted = Some(admitted_tick(&mut recovering_session)?.1);
    }
    let exhausted = exhausted.ok_or("four vertical bursts produced no frame")?;
    assert_eq!(number(&exhausted, b"booster-energy"), 0.0);
    assert!(number(&exhausted, b"booster-regeneration-delay") > 0.0);
    let exhausted_velocity = vector(&exhausted, b"velocity");
    key_down(&mut recovering_session, b"KeyF")?;
    let (_, refused) = admitted_tick(&mut recovering_session)?;
    assert!(vector(&refused, b"velocity")[1] < exhausted_velocity[1]);
    assert_eq!(number(&refused, b"booster-energy"), 0.0);

    let mut recovered = refused;
    for _ in 0..40 {
        if number(&recovered, b"booster-energy") >= 25.0 {
            break;
        }
        recovered = admitted_tick(&mut recovering_session)?.1;
    }
    assert_eq!(number(&recovered, b"booster-energy"), 25.0);
    assert_eq!(number(&recovered, b"booster-regeneration-delay"), 0.0);
    let energy_before_second = number(&recovered, b"booster-energy");
    let velocity_before_second = vector(&recovered, b"velocity");
    key_down(&mut recovering_session, b"KeyF")?;
    let (_, second) = admitted_tick(&mut recovering_session)?;
    let second_velocity = vector(&second, b"velocity");
    assert_eq!(second_velocity[0], velocity_before_second[0]);
    assert_eq!(second_velocity[2], velocity_before_second[2]);
    assert!(second_velocity[1] > velocity_before_second[1]);
    assert!(number(&second, b"booster-energy") < energy_before_second);
    assert!(number(&second, b"booster-regeneration-delay") > 0.0);
    Ok(())
}

#[test]
fn sword_action_is_committed_until_the_animation_window_finishes() -> Result<(), Box<dyn Error>> {
    let mut session = open_session()?;

    key_down(&mut session, b"KeyJ")?;
    let (_, started) = admitted_tick(&mut session)?;
    assert_eq!(number(&started, b"sword-action-sequence"), 1.0);
    assert!(number(&started, b"sword-commitment-clock") > 0.0);

    // A second physical press during the committed Sword_Attack window must
    // be ignored by the Clause law rather than queueing another action.
    key_down(&mut session, b"KeyJ")?;
    let (_, blocked) = admitted_tick(&mut session)?;
    assert_eq!(number(&blocked, b"sword-action-sequence"), 1.0);

    let mut settled = blocked;
    for _ in 0..110 {
        if number(&settled, b"sword-commitment-clock") == 0.0 {
            break;
        }
        let (_, next) = admitted_tick(&mut session)?;
        settled = next;
    }
    assert_eq!(number(&settled, b"sword-commitment-clock"), 0.0);

    key_down(&mut session, b"KeyJ")?;
    let (_, restarted) = admitted_tick(&mut session)?;
    assert_eq!(number(&restarted, b"sword-action-sequence"), 2.0);
    Ok(())
}

#[test]
fn reset_restores_spawn_and_the_complete_propulsion_resource() -> Result<(), Box<dyn Error>> {
    let mut session = open_session()?;
    key_down(&mut session, b"KeyW")?;
    key_down(&mut session, b"ShiftRight")?;
    key_down(&mut session, b"KeyF")?;
    admitted_tick(&mut session)?;
    key_up(&mut session, b"KeyW")?;
    key_up(&mut session, b"ShiftRight")?;
    key_down(&mut session, b"KeyR")?;
    let mut restored = admitted_tick(&mut session)?.1;
    for _ in 0..2 {
        restored = admitted_tick(&mut session)?.1;
    }
    assert_eq!(vector(&restored, b"position"), [-2.0, 0.0, 0.5]);
    assert_eq!(vector(&restored, b"velocity"), [0.0, 0.0, 0.0]);
    assert_eq!(vector(&restored, b"horizontal-intent"), [0.0, 0.0, 0.0]);
    assert_eq!(vector(&restored, b"negative-control"), [0.0, 0.0, 0.0]);
    assert_eq!(vector(&restored, b"positive-control"), [0.0, 0.0, 0.0]);
    assert_eq!(number(&restored, b"move-speed"), 4.0);
    assert_eq!(number(&restored, b"booster-energy"), 100.0);
    assert_eq!(number(&restored, b"booster-regeneration-delay"), 0.0);
    assert!(boolean(&restored, b"grounded"));
    Ok(())
}

#[test]
fn reset_preserves_a_physically_held_movement_key() -> Result<(), Box<dyn Error>> {
    let mut session = open_session()?;
    key_down(&mut session, b"KeyA")?;
    admitted_tick(&mut session)?;
    key_down(&mut session, b"KeyR")?;

    let mut resumed = admitted_tick(&mut session)?.1;
    for _ in 0..8 {
        resumed = admitted_tick(&mut session)?.1;
    }

    assert_eq!(vector(&resumed, b"negative-control"), [1.0, 0.0, 0.0]);
    assert_eq!(vector(&resumed, b"horizontal-intent"), [-1.0, 0.0, 0.0]);
    assert!(
        vector(&resumed, b"position")[0] < -2.0,
        "a physically held A key stopped moving after reset",
    );
    assert!(vector(&resumed, b"velocity")[0] < 0.0);
    Ok(())
}

#[test]
fn open_field_movement_does_not_clamp_at_the_retired_arena_edge() -> Result<(), Box<dyn Error>> {
    let source = frontier_proof_source();
    let workbench = ResidentSourceWorkbenchV1::open(&source)?;
    let mut request = decode_wasm_process_request_v1(&workbench.generation().cwr1)?;
    request.authority.budget_units = 1_000_000;
    let mut session =
        open_fresh_persistent_process_session_v1(&encode_wasm_process_request_v1(&request)?)?;
    let disable_enemy = workbench.handler_occurrence(b"prepare-frontier-enemy-proof", &[])?;
    admitted_opaque_input(&mut session, &disable_enemy)?;
    key_down(&mut session, b"KeyW")?;

    let mut projection = admitted_tick(&mut session)?.1;
    for _ in 0..255 {
        projection = admitted_tick(&mut session)?.1;
    }

    assert!(
        vector(&projection, b"position")[2] < -10.0,
        "open-field movement stopped at the retired jump-arena boundary",
    );
    assert!(vector(&projection, b"velocity")[2] < 0.0);
    Ok(())
}

#[test]
fn repeated_resource_gated_expeditions_establish_a_durable_frontier() -> Result<(), Box<dyn Error>>
{
    let source = frontier_proof_source();
    let workbench = ResidentSourceWorkbenchV1::open(&source)?;
    let mut request = decode_wasm_process_request_v1(&workbench.generation().cwr1)?;
    request.authority.budget_units = 1_000_000;
    let mut session =
        open_fresh_persistent_process_session_v1(&encode_wasm_process_request_v1(&request)?)?;
    let mut latest = None;

    let disable_enemy = workbench.handler_occurrence(b"prepare-frontier-enemy-proof", &[])?;
    admitted_opaque_input(&mut session, &disable_enemy)?;
    key_down(&mut session, b"KeyD")?;
    let mut sealed = admitted_tick(&mut session)?.1;
    for _ in 0..320 {
        sealed = admitted_tick(&mut session)?.1;
    }
    key_up(&mut session, b"KeyD")?;
    assert_eq!(arena_max_x(&sealed), frontier_boundary_x(&sealed));
    assert!(
        vector(&sealed, b"position")[0] <= frontier_boundary_x(&sealed),
        "the sealed Clause frontier allowed the player into the Ashen Verge"
    );
    assert_eq!(
        loot_symbol(&sealed, b"cephorium-cache", b"custody"),
        b"ashen-verge",
        "the sealed frontier must retain Cephorium at its authored source",
    );

    for expedition in 1..=3 {
        let prepare = [
            workbench.handler_occurrence(b"prepare-frontier-player-proof", &[])?,
            workbench.handler_occurrence(b"prepare-frontier-enemy-proof", &[])?,
            workbench.handler_occurrence(b"prepare-frontier-key-proof", &[])?,
        ];
        for occurrence in &prepare {
            admitted_opaque_input(&mut session, occurrence)?;
        }
        let mut opened = None;
        let mut latest_projection = None;
        for _ in 0..16 {
            let projection = admitted_tick(&mut session)?.1;
            latest_projection = Some(projection.clone());
            if frontier_access(&projection) == b"temporary-open"
                && loot_symbol(&projection, b"cephorium-cache", b"loot-state") == b"available"
            {
                opened = Some(projection);
                break;
            }
        }
        let latest_projection = latest_projection.expect("frontier proof ran one tick");
        let opened = opened.ok_or_else(|| {
            format!(
                "the admitted key did not open the frontier and reveal Cephorium: access={}, key-state={}, key-custody={}, cache-state={}, cache-custody={}, cache-source={}, cache-claim={}",
                String::from_utf8_lossy(frontier_access(&latest_projection)),
                String::from_utf8_lossy(loot_symbol(&latest_projection, b"ashen-key", b"loot-state")),
                String::from_utf8_lossy(loot_symbol(&latest_projection, b"ashen-key", b"custody")),
                String::from_utf8_lossy(loot_symbol(&latest_projection, b"cephorium-cache", b"loot-state")),
                String::from_utf8_lossy(loot_symbol(&latest_projection, b"cephorium-cache", b"custody")),
                String::from_utf8_lossy(loot_symbol(&latest_projection, b"cephorium-cache", b"loot-source")),
                String::from_utf8_lossy(loot_symbol(&latest_projection, b"cephorium-cache", b"loot-claim-rule")),
            )
        })?;
        assert_eq!(objective_phase(&opened), 0.0);
        assert_eq!(frontier_progress(&opened), f64::from(expedition - 1));
        assert_eq!(arena_max_x(&opened), 2048.0);
        assert_eq!(
            loot_symbol(&opened, b"ashen-key", b"custody"),
            b"game-objective",
            "opening the breach must spend the carried key without granting progress",
        );

        if expedition == 1 {
            key_down(&mut session, b"KeyD")?;
            let mut crossed = opened.clone();
            for _ in 0..320 {
                crossed = admitted_tick(&mut session)?.1;
                if vector(&crossed, b"position")[0] > frontier_boundary_x(&crossed) + 0.5 {
                    break;
                }
            }
            key_up(&mut session, b"KeyD")?;
            assert!(
                vector(&crossed, b"position")[0] > frontier_boundary_x(&crossed),
                "temporary access did not make the Ashen Verge traversable"
            );
        }

        let move_to_cache =
            workbench.handler_occurrence(b"prepare-frontier-cache-player-proof", &[])?;
        admitted_opaque_input(&mut session, &move_to_cache)?;
        key_down(&mut session, b"LootItem")?;
        let mut acquired = None;
        for _ in 0..8 {
            let projection = admitted_tick(&mut session)?.1;
            if loot_symbol(&projection, b"cephorium-cache", b"loot-state") == b"acquired"
                && loot_symbol(&projection, b"cephorium-cache", b"custody") == b"player-1"
            {
                acquired = Some(projection);
                break;
            }
        }
        let acquired = acquired.ok_or("the in-range Cephorium cache was not acquired")?;
        assert_eq!(objective_phase(&acquired), 0.0);
        assert_eq!(frontier_progress(&acquired), f64::from(expedition - 1));

        let return_to_moonwell =
            workbench.handler_occurrence(b"prepare-frontier-player-proof", &[])?;
        admitted_opaque_input(&mut session, &return_to_moonwell)?;
        let mut completed = None;
        for _ in 0..16 {
            let projection = admitted_tick(&mut session)?.1;
            if objective_phase(&projection) == 1.0 {
                completed = Some(projection);
                break;
            }
        }
        let completed = completed.ok_or("carried Cephorium did not extract at the moonwell")?;
        assert_eq!(frontier_progress(&completed), f64::from(expedition));
        assert_eq!(
            frontier_access(&completed),
            if expedition < 3 {
                b"temporary-open"
            } else {
                b"permanent-open"
            },
            "only extracted Cephorium may advance typed frontier access",
        );

        let reset = workbench.handler_occurrence(b"reset-objective", &[])?;
        admitted_opaque_input(&mut session, &reset)?;
        let mut restored = None;
        for _ in 0..16 {
            let projection = admitted_tick(&mut session)?.1;
            if objective_phase(&projection) == 0.0 {
                restored = Some(projection);
                break;
            }
        }
        let mut restored = restored.ok_or("expedition reset did not restore the playable phase")?;
        for _ in 0..2 {
            restored = admitted_tick(&mut session)?.1;
        }
        assert_eq!(frontier_progress(&restored), f64::from(expedition));
        assert_eq!(
            arena_max_x(&restored),
            if expedition < 3 {
                frontier_boundary_x(&restored)
            } else {
                2048.0
            },
            "reset must restore the movement boundary only for temporary access"
        );
        assert_eq!(
            frontier_access(&restored),
            if expedition < 3 {
                b"sealed".as_slice()
            } else {
                b"permanent-open".as_slice()
            },
            "routine reset must reoccupy temporary access without erasing durable progress"
        );
        assert_eq!(
            loot_symbol(&restored, b"cephorium-cache", b"loot-state"),
            b"hidden",
            "reset must hide extracted Cephorium before the next expedition",
        );
        assert_eq!(
            loot_symbol(&restored, b"cephorium-cache", b"custody"),
            b"ashen-verge",
            "reset must restore extracted Cephorium to its authored source",
        );
        latest = Some(restored);
    }

    let secured = latest.expect("three expeditions produce one final admitted projection");
    assert_eq!(frontier_access(&secured), b"permanent-open");
    assert_eq!(frontier_progress(&secured), 3.0);
    Ok(())
}

#[test]
fn typed_combat_behavior_selection_swaps_rejects_and_remains_explainable()
-> Result<(), Box<dyn Error>> {
    let mut workbench = ResidentSourceWorkbenchV1::open(EMBODIED_SOURCE)?;
    let baseline_approach = workbench.handler_occurrence(b"advance-boar-approach", &[])?;
    let baseline = admit_workbench(&mut workbench, &[baseline_approach])?;
    assert_eq!(
        enemy_symbol(&baseline, b"combat-behavior"),
        b"relentless-charge"
    );
    let baseline_x = enemy_vector(&baseline, b"enemy-position")[0];
    let baseline_step = 12.0 - baseline_x;

    let patient_source = patient_behavior_source();
    let started = Instant::now();
    workbench.hot_reload(&patient_source)?;
    let reload_elapsed = started.elapsed();
    let reconcile = workbench.handler_occurrence(b"reconcile-patient-combat-behavior", &[])?;
    let patient_approach = workbench.handler_occurrence(b"advance-boar-approach", &[])?;
    let patient = admit_workbench(&mut workbench, &[reconcile, patient_approach])?;
    assert_eq!(
        enemy_symbol(&patient, b"combat-behavior"),
        b"patient-charge"
    );
    let patient_x = enemy_vector(&patient, b"enemy-position")[0];
    let patient_step = baseline_x - patient_x;
    assert!(
        patient_step < baseline_step,
        "patient behavior must approach more slowly than relentless behavior ({baseline_step} versus {patient_step})"
    );

    workbench.hot_reload(EMBODIED_SOURCE)?;
    let reconcile = workbench.handler_occurrence(b"reconcile-relentless-combat-behavior", &[])?;
    let relentless = admit_workbench(&mut workbench, &[reconcile])?;
    assert_eq!(
        enemy_symbol(&relentless, b"combat-behavior"),
        b"relentless-charge"
    );

    workbench.hot_reload(&patient_source)?;
    let reconcile = workbench.handler_occurrence(b"reconcile-patient-combat-behavior", &[])?;
    let patient_again = admit_workbench(&mut workbench, &[reconcile])?;
    assert_eq!(
        enemy_symbol(&patient_again, b"combat-behavior"),
        b"patient-charge"
    );

    let malformed_source = source_with_behavior("cinder-wraith combat behavior 3.0");
    assert!(
        ResidentSourceWorkbenchV1::open(&malformed_source).is_err(),
        "the typed behavior relation must reject a numeric binding before execution"
    );

    let source = ResidentSourceWorkbenchV1::open(&patient_source)?;
    let mut request = decode_wasm_process_request_v1(&source.generation().cwr1)?;
    request.authority.budget_units = 1_000_000;
    let mut session =
        open_fresh_persistent_process_session_v1(&encode_wasm_process_request_v1(&request)?)?;
    session.apply_fixed_tick_and_emit_candidate(16)?;
    let candidate = session
        .candidate()?
        .ok_or("behavior tick produced no CandidateDelta")?
        .clone();
    let candidate_causes = session
        .carrier()?
        .causal_predecessors(CausalRef::CandidateDelta(candidate.id))
        .ok_or("behavior CandidateDelta has no causal record")?;
    assert!(
        candidate_causes
            .iter()
            .any(|cause| matches!(cause, CausalRef::Step(_) | CausalRef::Observation(_))),
        "behavior CandidateDelta must retain its producing step or formation evidence"
    );

    let unauthorized = IssuedAdmissionAuthorizationOccurrenceId::from_bytes([0xa5; 32]);
    let records_before_rejection = session.carrier()?.accepted_ingress_record_count();
    let revisions_before_rejection = session.carrier()?.state_revision_count();
    let base_before_rejection = session.world_base();
    assert!(
        session
            .admit_issued_candidate_with_projection(unauthorized)
            .is_err(),
        "an unissued occurrence must not authorize the behavior CandidateDelta"
    );
    assert_eq!(
        session.carrier()?.accepted_ingress_record_count(),
        records_before_rejection,
        "rejected behavior Admission must not retain partial ingress"
    );
    assert_eq!(
        session.carrier()?.state_revision_count(),
        revisions_before_rejection,
        "rejected behavior Admission must not create a StateRevision"
    );
    assert_eq!(session.world_base(), base_before_rejection);
    assert_eq!(
        session
            .candidate()?
            .ok_or("rejected behavior Admission discarded its CandidateDelta")?
            .id,
        candidate.id,
        "rejected behavior Admission must leave the exact CandidateDelta pending"
    );

    let authorization = session.issue_candidate_admission_authorization()?;
    let (successor, projection) = session.admit_issued_candidate_with_projection(authorization)?;
    let decision = session
        .carrier()?
        .decision_by_occurrence(successor.admission)
        .ok_or("behavior Admission retained no decision")?;
    assert_eq!(decision.delta, candidate.id);
    let admission_causes = session
        .carrier()?
        .causal_predecessors(CausalRef::Admission(successor.admission))
        .ok_or("behavior Admission has no causal record")?;
    assert!(admission_causes.contains(&CausalRef::Judgment(decision.verdict)));
    let judgment_causes = session
        .carrier()?
        .causal_predecessors(CausalRef::Judgment(decision.verdict))
        .ok_or("behavior Judgment has no causal record")?;
    assert!(judgment_causes.contains(&CausalRef::CandidateDelta(candidate.id)));
    let admitted_projection = projection
        .ok_or("behavior Admission emitted no projection")?
        .term;
    assert_eq!(
        enemy_symbol(&admitted_projection, b"combat-behavior"),
        b"patient-charge"
    );
    eprintln!(
        "resident typed behavior edit: {:.3} ms",
        reload_elapsed.as_secs_f64() * 1_000.0
    );
    Ok(())
}
