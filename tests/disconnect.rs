use clause_package::CausalRef;
use greywrought_clause::conquest::{
    run_native_conquest_v1, BRANCH_BUDGET_UNITS, DISCONNECT_TICK, EXACT_BRANCH_CONTEXT,
};

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
    assert_ne!(
        story.reconnect.ancestry.run, explanation.authoritative_run,
        "serialization must not manufacture cross-Run order"
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
        b"greywrought/conquest-v1;player=ashen-wayfarer;simulation=fixed-v1;random=empty-v1"
    );
    assert!(
        story.authoritative_projection.is_some() && story.admitted.projection.is_some(),
        "only admitted consequences expose world projections"
    );
}
