#[path = "common/forest.rs"]
mod movement;
use greywrought_clause::native::{self, NativeSession};
const SOURCE: &[u8] = include_bytes!("../src/world/forest-expedition.clause");

#[test]
fn forest_snapshot_carries_exact_inputs_and_inspection_without_workshop_autopilot()
-> native::Result<()> {
    let mut session = NativeSession::open(SOURCE)?;
    let initial = session.snapshot(0, String::new())?;
    assert!(initial.workshop.is_none());
    let forest = initial.forest.ok_or("missing forest")?;
    assert_eq!(forest.threats.len(), 5);
    assert_eq!(forest.position, [0., -8.]);
    assert_eq!(forest.places.len(), 4);
    assert!(
        forest
            .places
            .iter()
            .all(|(_, name, _)| !name.chars().any(char::is_control))
    );
    assert_eq!(forest.equipment.phase, "Workshop");
    assert_eq!(forest.location_name(), "Hearthstead");
    let scout = forest
        .threats
        .iter()
        .find(|t| t.id == "scout")
        .ok_or("no scout")?;
    for (source, value) in [native::reference("TargetThreat", scout.target.clone())] {
        session.input(initial.generation, source, value)?;
    }
    session.tick()?;
    movement::walk(&mut session, [0., 5.])?;
    movement::walk(&mut session, [-2., 9.])?;
    let current = session
        .snapshot(0, String::new())?
        .forest
        .ok_or("lost forest")?;
    assert_eq!(current.equipment.phase, "Expedition");
    assert_eq!(current.location_name(), "Frostwood");
    assert!(
        current
            .threats
            .iter()
            .find(|t| t.id == "scout")
            .unwrap()
            .selected
    );
    assert!(
        current
            .threats
            .iter()
            .filter(|t| t.active)
            .all(|t| !t.current_intent.is_empty() && !t.upcoming_intent.is_empty())
    );
    let (source, value) = native::key("StrikeThreat");
    session.input(initial.generation, source, value)?;
    session.tick()?;
    let report = session.inspect_action(initial.generation, b"strike-threat")?;
    assert!(
        report
            .lines
            .iter()
            .any(|line| line.contains("enemy-health") && line.contains("->"))
    );
    assert!(
        session
            .inspect_state(initial.generation)?
            .lines
            .iter()
            .any(|line| line.contains("presence"))
    );
    let effects = session.workbench.scalar_effects()?;
    let index = effects
        .iter()
        .position(|effect| {
            let handler = &session.workbench.exact_source()
                [effect.handler_origin.start as usize..effect.handler_origin.end as usize];
            handler.starts_with(b"on gather-resource") && effect.expression == b"3.0"
        })
        .ok_or("no gathering yield expression")?;
    println!("forest gathering edit catalog index: {index}");
    println!(
        "forest threat order: {:?}",
        current.threats.iter().map(|t| &t.id).collect::<Vec<_>>()
    );
    session.edit(initial.generation, index, b"4.0")?;
    assert!(session.inspect_state(initial.generation).is_err());
    let path = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join(format!("build/forest/focused-{}.save", std::process::id()));
    session.save(&path)?;
    let restored = NativeSession::load(&path, SOURCE)?;
    assert_eq!(
        restored.workbench.exact_source(),
        session.workbench.exact_source()
    );
    assert_eq!(
        restored.workbench.project_current_world()?,
        session.workbench.project_current_world()?
    );
    Ok(())
}
