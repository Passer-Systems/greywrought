use std::time::Instant;

use clause_package::{Term, decode_canonical_term_bytes};
use clause_workbench::ResidentSourceWorkbenchV1;
use greywrought_clause::conquest::selected_combat_occurrences_v1;
use greywrought_clause::{RESISTED_STRIKE_SOURCE, WORLD_SOURCE};

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
    let atom = term.as_atom().expect("projected number is an Atom");
    f64::from_bits(u64::from_le_bytes(
        atom.canonical_payload()
            .try_into()
            .expect("projected F64 is exact"),
    ))
}

fn projected_symbol(term: &Term) -> &[u8] {
    term.as_atom()
        .expect("projected symbol is an Atom")
        .canonical_payload()
}

fn combat_outcome(exact_term_bytes: &[u8]) -> (f64, Vec<u8>, Vec<u8>) {
    let term = decode_canonical_term_bytes(exact_term_bytes).expect("projection term decodes");
    let enemy = projected_field(&term, b"cinder-wraith");
    let loot = projected_field(&term, b"ashen-key");
    (
        projected_number(projected_field(enemy, b"vitality")),
        projected_symbol(projected_field(enemy, b"combat-status")).to_vec(),
        projected_symbol(projected_field(loot, b"custody")).to_vec(),
    )
}

#[test]
fn source_only_combat_law_edit_changes_the_admitted_outcome() {
    let mut workbench = ResidentSourceWorkbenchV1::open(WORLD_SOURCE)
        .expect("Greywrought combat source opens through the resident Clause boundary");
    let base_occurrences = selected_combat_occurrences_v1(&workbench)
        .expect("source owns the selected attack and random-input occurrence chain");
    workbench
        .run_occurrences_to_candidate(&base_occurrences)
        .expect("combat produces one hidden candidate");
    assert!(workbench.last_projection().is_none());
    let base = workbench
        .admit()
        .expect("separate Admission exposes the combat consequence");

    let started = Instant::now();
    workbench
        .hot_reload(RESISTED_STRIKE_SOURCE)
        .expect("source-only critical-threshold edit opens a fresh generation");
    let elapsed = started.elapsed();
    let edited_occurrences = selected_combat_occurrences_v1(&workbench)
        .expect("edited source owns a fresh exact occurrence chain");
    workbench
        .run_occurrences_to_candidate(&edited_occurrences)
        .expect("edited combat produces one hidden candidate");
    assert!(workbench.last_projection().is_none());
    let edited = workbench
        .admit()
        .expect("separate Admission exposes the edited consequence");

    assert_eq!(
        combat_outcome(&base.projection.exact_term_bytes),
        (0.0, b"dead".to_vec(), b"ashen-wayfarer".to_vec())
    );
    assert_eq!(
        combat_outcome(&edited.projection.exact_term_bytes),
        (4.0, b"alive".to_vec(), b"cinder-wraith".to_vec())
    );
    eprintln!(
        "resident Greywrought combat-law edit: {:.3} ms",
        elapsed.as_secs_f64() * 1_000.0
    );
}
