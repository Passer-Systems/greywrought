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
    assert_eq!(forest.places.len(), 5);
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

#[test]
fn jump_and_apothecary_keep_their_authored_state_through_save() -> native::Result<()> {
    fn press(session: &mut NativeSession, key: &str) -> native::Result<()> {
        let (input, value) = native::key(key);
        session.input(session.workbench.generation().handle, input, value)?;
        session.tick()
    }
    fn view(session: &NativeSession) -> native::forest::ForestView {
        session.snapshot(0, String::new()).unwrap().forest.unwrap()
    }
    let mut session = NativeSession::open(SOURCE)?;
    press(&mut session, "Jump")?;
    session.tick()?;
    let rise = view(&session);
    assert!(rise.elevation > 0. && rise.vertical_speed > 0.);
    press(&mut session, "Jump")?;
    assert!(view(&session).vertical_speed < rise.vertical_speed);
    let path = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("build/player-shop/airborne.save");
    session.save(&path)?;
    let mut session = NativeSession::load(&path, SOURCE)?;
    let mut peak = 0.0_f64;
    for _ in 0..60 {
        session.tick()?;
        peak = peak.max(view(&session).elevation);
    }
    assert!((1.0..1.2).contains(&peak));
    assert_eq!(view(&session).elevation, 0.);
    assert_eq!(view(&session).vertical_speed, 0.);
    press(&mut session, "Interact")?;
    assert!(!view(&session).shop_open);
    movement::walk(&mut session, [2., -8.])?;
    press(&mut session, "Interact")?;
    assert!(view(&session).shop_open);
    press(&mut session, "BuyPotion")?;
    assert_eq!((view(&session).stock, view(&session).potions), (12., 1.));
    press(&mut session, "DrinkPotion")?;
    assert_eq!(
        (view(&session).vitality, view(&session).potions),
        (100., 1.)
    );
    assert!(view(&session).shop_status.contains("already full"));
    movement::walk(&mut session, [0., -8.])?;
    press(&mut session, "BuyPotion")?;
    assert_eq!((view(&session).stock, view(&session).potions), (12., 1.));
    assert!(view(&session).shop_status.contains("too far"));
    movement::walk(&mut session, [2., -8.])?;
    for _ in 0..5 {
        press(&mut session, "BuyPotion")?;
    }
    assert_eq!((view(&session).stock, view(&session).potions), (0., 5.));
    assert!(view(&session).shop_status.contains("Not enough"));
    press(&mut session, "CloseShop")?;
    movement::walk(&mut session, [0., 5.])?;
    movement::walk(&mut session, [-2., 12.])?;
    press(&mut session, "GatherResource")?;
    assert_eq!(view(&session).vitality, 92.);
    movement::walk(&mut session, [0., 5.])?;
    movement::walk(&mut session, [0., -8.])?;
    let fixture = path.with_file_name("injured.save");
    session.save(&fixture)?;
    press(&mut session, "DrinkPotion")?;
    assert_eq!(
        (view(&session).vitality, view(&session).potions),
        (100., 4.)
    );
    let path = path.with_file_name("reopen.save");
    session.save(&path)?;
    let reopened = NativeSession::load(&path, SOURCE)?;
    assert_eq!(
        reopened.workbench.project_current_world()?,
        session.workbench.project_current_world()?
    );
    println!(
        "jump peak {peak}; landed at zero; buy 15→12 supplies, 0→1 potions; full health kept potion; distance and insufficient funds refused; gathered injury 100→92; drink 92→100, 5→4 potions; exact save/reopen retained"
    );
    Ok(())
}
