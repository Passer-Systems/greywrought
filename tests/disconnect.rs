use clause_package::{CausalRef, Term};
use clause_runtime::decode_executable_occurrence_v1;
use greywrought_clause::conquest::{
    ATTACK_SIGNAL, BRANCH_BUDGET_UNITS, DISCONNECT_TICK, EXACT_BRANCH_CONTEXT,
    SELECTED_RANDOM_ROLL, run_native_conquest_v1,
};

fn projected_field<'a>(term: &'a Term, expected: &[u8]) -> &'a Term {
    let mut current = term;
    loop {
        let [field, value, rest] = current
            .as_triple()
            .expect("projected object is an entry chain")
            .slots();
        if field
            .as_atom()
            .is_some_and(|field| field.canonical_payload() == expected)
        {
            return value;
        }
        current = rest;
    }
}

fn projected_number(term: &Term) -> f64 {
    f64::from_bits(u64::from_le_bytes(
        term.as_atom()
            .expect("projected number is an Atom")
            .canonical_payload()
            .try_into()
            .expect("projected F64 is exact"),
    ))
}

fn projected_symbol(term: &Term) -> &[u8] {
    term.as_atom()
        .expect("projected symbol is an Atom")
        .canonical_payload()
}

fn assert_combat_projection(
    term: &Term,
    attack: &[u8],
    random_roll: f64,
    vitality: f64,
    status: &[u8],
    custody: &[u8],
) {
    let strike = projected_field(term, b"ember-strike");
    let random = projected_field(term, b"combat-random");
    let sample = projected_field(random, b"random-sample");
    let enemy = projected_field(term, b"cinder-wraith");
    let loot = projected_field(term, b"ashen-key");
    assert_eq!(
        projected_symbol(projected_field(strike, b"attack-state")),
        attack
    );
    assert_eq!(projected_number(projected_field(sample, b"x")), random_roll);
    assert_eq!(
        projected_number(projected_field(enemy, b"vitality")),
        vitality
    );
    assert_eq!(
        projected_symbol(projected_field(enemy, b"combat-status")),
        status
    );
    assert_eq!(projected_symbol(projected_field(loot, b"custody")), custody);
}

#[test]
fn disconnected_branch_reconnects_only_through_source_owned_admission_consequence() {
    let story = run_native_conquest_v1().expect("bounded Greywrought conquest story runs");
    let explanation = &story.admitted.explanation;

    assert_eq!(explanation.pins.parent_state, story.parent);
    assert_eq!(explanation.pins.disconnect_tick, DISCONNECT_TICK);
    assert_eq!(explanation.pins.budget_units, BRANCH_BUDGET_UNITS);
    assert_ne!(story.authoritative_intermediate, story.parent);
    assert_eq!(story.reconnect.candidate, explanation.branch_candidate);
    assert_eq!(story.reconnect.pins.parent_state, story.parent);
    assert!(story.reconnect.command_evidence.len() >= 5);
    assert!(
        story
            .reconnect
            .command_evidence
            .windows(2)
            .all(|pair| pair[0].step != pair[1].step),
        "each entered combat command must retain its own Step"
    );
    let random_evidence = &story.reconnect.command_evidence[1];
    let random_occurrence = decode_executable_occurrence_v1(&random_evidence.occurrence)
        .expect("the retained random-input occurrence decodes");
    assert_eq!(
        random_occurrence.arguments[0].as_number(),
        Some(SELECTED_RANDOM_ROLL)
    );
    assert_eq!(
        random_occurrence.arguments[1].as_number(),
        Some(ATTACK_SIGNAL)
    );
    assert_eq!(
        &explanation.branch_command_evidence[1], random_evidence,
        "the causal account must retain exact random bytes with their Observation and Step"
    );
    assert_eq!(
        explanation.branch_command_evidence.len(),
        explanation.authoritative_command_evidence.len()
    );
    assert!(
        explanation
            .branch_command_evidence
            .iter()
            .zip(&explanation.authoritative_command_evidence)
            .all(|(branch, authoritative)| {
                branch.occurrence == authoritative.occurrence
                    && branch.step != authoritative.step
                    && branch.observation != authoritative.observation
            }),
        "authoritative replay must retain the same commands under distinct Run-local evidence"
    );
    assert_ne!(
        story.reconnect.ancestry.run, explanation.authoritative_run,
        "serialization must not manufacture cross-Run order"
    );
    assert_ne!(
        story.reconnect.ancestry.activation, explanation.authoritative_activation,
        "branch attack and authoritative replay must retain distinct Activations"
    );
    assert_eq!(
        story.admitted.state.predecessor,
        story.authoritative_intermediate
    );
    assert_eq!(story.admitted.state.id, explanation.successor);
    assert_eq!(
        story.retained_branch.explanation(),
        Some(explanation),
        "the non-authoritative branch remains retained after adjudication"
    );
    assert!(
        explanation
            .causal_records
            .iter()
            .any(|record| record.occurrence
                == CausalRef::CandidateDelta(explanation.branch_candidate))
    );
    assert!(
        explanation.causal_records.iter().all(|record| {
            record.occurrence != CausalRef::Admission(explanation.admission)
                || !record
                    .predecessors
                    .contains(&CausalRef::CandidateDelta(explanation.branch_candidate))
        }),
        "domain replay may cite branch evidence without asserting the branch CandidateDelta"
    );
    assert_eq!(
        EXACT_BRANCH_CONTEXT,
        b"greywrought/conquest-v2;player=ashen-wayfarer;simulation=fixed-v1;random=f64:0.95"
    );
    assert!(
        story.authoritative_projection.is_some() && story.admitted.projection.is_some(),
        "only admitted consequences expose world projections"
    );
    assert_combat_projection(
        &story
            .authoritative_projection
            .as_ref()
            .expect("R1 has an admitted projection")
            .term,
        b"eligible",
        0.0,
        4.0,
        b"alive",
        b"cinder-wraith",
    );
    assert_combat_projection(
        &story
            .admitted
            .projection
            .as_ref()
            .expect("R2 has an admitted projection")
            .term,
        b"resolved",
        SELECTED_RANDOM_ROLL,
        0.0,
        b"dead",
        b"ashen-wayfarer",
    );
}
