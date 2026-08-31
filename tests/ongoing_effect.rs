use std::fs;
use std::path::Path;

use clause_package::{CausalRef, OccurrenceProvenance};
use greywrought_clause::ongoing_effect::run_native_ongoing_effect_conquest_v1;

fn predecessors<'a>(
    chain: &'a [(CausalRef, Vec<CausalRef>)],
    occurrence: CausalRef,
) -> &'a [CausalRef] {
    chain
        .iter()
        .find_map(|(candidate, predecessors)| {
            (*candidate == occurrence).then_some(predecessors.as_slice())
        })
        .expect("the effect occurrence remains in the causal explanation")
}

#[test]
fn moonwell_process_remains_ongoing_while_effect_evidence_stays_non_authoritative() {
    let target = Path::new("build/ongoing-effect/native-test-receipt.bin");
    let story = run_native_ongoing_effect_conquest_v1(target)
        .expect("the source-owned moonwell process and real file effect run");

    assert_ne!(story.first_step.id, story.second_step.id);
    assert_eq!(story.suspension.activation, story.activation);
    assert_eq!(story.resumption.activation, story.activation);
    assert_eq!(story.suspension.continuation, story.resumption.continuation);
    assert_ne!(story.suspension.step, story.resumption.step);
    assert_eq!(story.intent.emitted_by.activation, story.activation);
    assert_eq!(story.authorization.intent, story.intent.id);
    assert_eq!(story.attempt.intent, story.intent.id);
    assert_eq!(story.attempt.authorization, story.authorization.id);
    assert_eq!(story.receipt.attempt, story.attempt.id);
    assert_eq!(story.judgment.intent, story.intent.id);
    assert_eq!(story.judgment.attempt, story.attempt.id);
    assert_eq!(story.judgment.receipt, Some(story.receipt.id));
    assert_eq!(story.judgment.observation, Some(story.observation.id));
    assert!(matches!(
        story.observation.provenance,
        OccurrenceProvenance::ReportedByEffectReceipt(id) if id == story.receipt.id
    ));

    assert!(
        predecessors(
            &story.causal_chain,
            CausalRef::EffectIntent(story.intent.id)
        )
        .contains(&CausalRef::Step(story.intent.emitted_by))
    );
    assert!(
        predecessors(
            &story.causal_chain,
            CausalRef::EffectAuthorization(story.authorization.id)
        )
        .contains(&CausalRef::EffectIntent(story.intent.id))
    );
    assert!(
        predecessors(
            &story.causal_chain,
            CausalRef::EffectAttempt(story.attempt.id)
        )
        .contains(&CausalRef::EffectAuthorization(story.authorization.id))
    );
    assert!(
        predecessors(
            &story.causal_chain,
            CausalRef::EffectReceipt(story.receipt.id)
        )
        .contains(&CausalRef::EffectAttempt(story.attempt.id))
    );
    assert!(
        predecessors(
            &story.causal_chain,
            CausalRef::Observation(story.observation.id)
        )
        .contains(&CausalRef::EffectReceipt(story.receipt.id))
    );
    assert!(
        predecessors(
            &story.causal_chain,
            CausalRef::EffectJudgment(story.judgment.id)
        )
        .contains(&CausalRef::Observation(story.observation.id))
    );

    assert_eq!(
        story.initial_state_revision_count,
        story.settled_state_revision_count
    );
    assert_eq!(
        story.initial_candidate_delta_count,
        story.settled_candidate_delta_count
    );
    assert_eq!(story.settled_candidate_delta_count, 0);
    assert!(!story.effect_created_admission);
    assert_eq!(
        fs::read(target).expect("the lane-local file effect is durable"),
        story.exact_host_bytes
    );
    assert_eq!(story.receipt.exact_bytes, story.exact_host_bytes);

    assert_ne!(story.admitted_predecessor, story.admitted_successor);
}
