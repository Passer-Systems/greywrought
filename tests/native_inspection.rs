use greywrought_clause::{
    EMBODIED_SOURCE,
    native::{self, NativeSession},
};

#[test]
fn native_inspection_predicts_without_mutation_and_fences_edits() -> native::Result<()> {
    let mut session = NativeSession::open(EMBODIED_SOURCE)?;
    let generation = session.workbench.generation().handle;
    let initial_ids = session
        .snapshot(0, String::new())?
        .actors
        .into_iter()
        .map(|a| a.id)
        .collect::<Vec<_>>();
    for (source, value) in [native::key("SelectAll"), native::key("BeginEncounter")] {
        session.input(generation, source, value)?;
    }
    session.tick()?;
    let (source, value) = native::key("Attack");
    session.input(generation, source, value)?;
    session.tick()?;
    let projection = session.workbench.project_current_world()?;
    let snapshot = session.snapshot(0, String::new())?;
    let target = snapshot.selected_target.ok_or("no selected target")?;
    let handlers = session.inspection_handlers()?;
    let attack = handlers
        .iter()
        .find(|h| h.label.starts_with("on party-attack"))
        .ok_or("no Attack handler")?;
    let state = session.inspect_state(generation)?;
    assert!(state.lines.iter().any(|line| line.contains("vitality")));
    let explanation = session.inspect_handler(generation, attack.identity)?;
    assert!(
        explanation
            .lines
            .iter()
            .any(|line| line.contains("vitality") && line.contains("->")),
        "{:?}",
        explanation
    );
    assert!(
        explanation
            .lines
            .iter()
            .any(|line| line.contains("Premise"))
    );
    let answer = session.inspect_survival(generation, target)?;
    assert!(
        answer
            .lines
            .iter()
            .any(|line| line.contains("Found a minimum-cost answer")),
        "{:?}",
        answer
    );
    assert_eq!(session.workbench.project_current_world()?, projection);
    let effects = session.workbench.scalar_effects()?;
    let index = effects
        .iter()
        .position(|e| e.handler == attack.identity)
        .ok_or("no attack edit")?;
    session.edit(generation, index, b"1")?;
    assert!(session.inspect_state(generation).is_err());
    assert!(
        session
            .inspect_handler(generation, attack.identity)
            .is_err()
    );
    assert_eq!(
        session
            .snapshot(0, String::new())?
            .actors
            .into_iter()
            .map(|a| a.id)
            .collect::<Vec<_>>(),
        initial_ids
    );
    let save = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join(format!("build/inspection/test-{}.save", std::process::id()));
    session.save(&save)?;
    let reopened = NativeSession::load(&save, EMBODIED_SOURCE)?;
    assert_eq!(
        reopened.workbench.exact_source(),
        session.workbench.exact_source()
    );
    assert_eq!(
        reopened.workbench.project_current_world()?,
        session.workbench.project_current_world()?
    );
    assert!(
        reopened
            .inspect_state(reopened.workbench.generation().handle)?
            .lines
            .iter()
            .any(|l| l.contains("vitality"))
    );
    println!(
        "inspection: state/explanation/bounded prediction; unchanged accepted world; edit fenced; identities and exact save/reopen retained"
    );
    Ok(())
}
