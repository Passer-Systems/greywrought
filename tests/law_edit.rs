use std::time::Instant;

use clause_workbench::ResidentSourceWorkbenchV1;
use greywrought_clause::{REDUCED_GRANT_SOURCE, WORLD_SOURCE};

#[test]
fn source_only_reconnect_law_edit_changes_admitted_world() {
    let mut workbench = ResidentSourceWorkbenchV1::open(WORLD_SOURCE)
        .expect("Greywrought world source opens through the resident Clause boundary");
    workbench
        .run_to_candidate()
        .expect("base law emits one hidden reconnect candidate");
    let base = workbench
        .admit()
        .expect("separate Admission exposes the base reconnect consequence");

    let started = Instant::now();
    workbench
        .hot_reload(REDUCED_GRANT_SOURCE)
        .expect("source-only reconnect law edit opens a fresh generation");
    let elapsed = started.elapsed();
    workbench
        .run_to_candidate()
        .expect("edited law emits one hidden reconnect candidate");
    let edited = workbench
        .admit()
        .expect("separate Admission exposes the edited reconnect consequence");

    assert_ne!(
        base.projection.exact_term_bytes, edited.projection.exact_term_bytes,
        "the Clause law edit, not host semantics, must change the admitted world"
    );
    eprintln!(
        "resident Greywrought law edit: {:.3} ms",
        elapsed.as_secs_f64() * 1_000.0
    );
}
