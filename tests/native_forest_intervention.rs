use greywrought_clause::native::{self, NativeSession};
const SOURCE: &[u8] = include_bytes!("../src/world/forest-expedition.clause");

#[test]
fn recorded_gathering_counterfactual_is_bounded_read_only_and_generation_fenced()
-> native::Result<()> {
    let mut session = NativeSession::open(SOURCE)?;
    let captured = session.workbench.generation().handle;
    assert!(session.inspect_forest_gathering(captured, 2).is_err());
    for binding in [
        "LaunchExpedition",
        "AdvanceForest",
        "AdvanceForest",
        "AdvanceForest",
        "AdvanceForest",
        "GatherResource",
    ] {
        for _ in 0..140 {
            session.tick()?;
        }
        let (source, value) = native::key(binding);
        session.input(captured, source, value)?;
        session.tick()?;
    }
    let before = session.workbench.project_current_world()?;
    let source = session.workbench.exact_source().to_vec();
    let checkpoint = session.workbench.checkpoint_admitted()?;
    let short = session.inspect_forest_gathering(captured, 1)?;
    assert!(
        short.lines.iter().any(|l| l.contains("unresolved")),
        "{short:?}"
    );
    let answer = session.inspect_forest_gathering(captured, 2)?;
    assert!(
        answer.lines.iter().any(|l| l.starts_with("Yes,")),
        "{answer:?}"
    );
    assert!(
        answer
            .lines
            .iter()
            .any(|l| l.contains("Predicted torso vitality:"))
    );
    assert_eq!(session.workbench.project_current_world()?, before);
    assert_eq!(session.workbench.exact_source(), source);
    assert_eq!(session.workbench.checkpoint_admitted()?, checkpoint);
    println!("{}", answer.lines.join("\n"));
    let index = session
        .workbench
        .scalar_effects()?
        .iter()
        .position(|e| e.expression == b"3.0")
        .ok_or("no numeric edit")?;
    session.edit(captured, index, b"4.0")?;
    assert!(session.inspect_forest_gathering(captured, 2).is_err());
    Ok(())
}
