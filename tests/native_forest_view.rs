#[path = "common/forest.rs"]
mod movement;
use greywrought::game::{Command, Game};

fn press(game: &mut Game, command: Command) {
    game.command(command).unwrap();
    game.tick().unwrap();
}

#[test]
fn forest_snapshot_carries_stable_targets_and_readable_locations() {
    let mut game = Game::new();
    let forest = game.snapshot().forest;
    assert_eq!(forest.threats.len(), 5);
    assert_eq!(forest.places.len(), 5);
    assert_eq!(forest.position, [0.0, -8.0]);
    assert_eq!(forest.equipment.phase, "Workshop");
    assert_eq!(forest.location_name(), "Hearthstead");
    assert!(
        forest
            .places
            .iter()
            .all(|(_, name, _)| !name.chars().any(char::is_control))
    );
    let scout = forest.threats.iter().find(|t| t.id == "scout").unwrap();
    press(&mut game, Command::TargetThreat(scout.target.clone()));
    movement::walk(&mut game, [0.0, 5.0]).unwrap();
    movement::walk(&mut game, [-2.0, 9.0]).unwrap();
    let view = game.snapshot().forest;
    assert_eq!(view.equipment.phase, "Expedition");
    assert_eq!(view.location_name(), "Frostwood");
    assert!(
        view.threats
            .iter()
            .find(|t| t.id == "scout")
            .unwrap()
            .selected
    );
    assert!(
        view.threats
            .iter()
            .filter(|t| t.active)
            .all(|t| !t.current_intent.is_empty() && !t.upcoming_intent.is_empty())
    );
    press(&mut game, Command::Strike);
    assert_eq!(
        game.threats
            .iter()
            .find(|t| t.id == "scout")
            .unwrap()
            .health,
        9.0
    );
}

#[test]
fn jump_and_apothecary_keep_their_state_through_save() {
    let mut game = Game::new();
    press(&mut game, Command::Jump);
    game.tick().unwrap();
    let rise = game.snapshot().forest;
    assert!(rise.elevation > 0.0 && rise.vertical_speed > 0.0);
    press(&mut game, Command::Jump);
    assert!(game.vertical_speed < rise.vertical_speed);
    let path = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(format!(
        "build/player-shop/airborne-{}.json",
        std::process::id()
    ));
    greywrought::persistence::save(&game, &path).unwrap();
    let mut game = greywrought::persistence::load(&path).unwrap();
    let mut peak = 0.0_f64;
    for _ in 0..60 {
        game.tick().unwrap();
        peak = peak.max(game.elevation);
    }
    assert!((1.0..1.2).contains(&peak));
    assert_eq!((game.elevation, game.vertical_speed), (0.0, 0.0));
    press(&mut game, Command::Interact);
    assert!(!game.shop_open);
    movement::walk(&mut game, [2.0, -8.0]).unwrap();
    press(&mut game, Command::Interact);
    assert!(game.shop_open);
    press(&mut game, Command::BuyPotion);
    assert_eq!((game.stock, game.potions), (12.0, 1.0));
    press(&mut game, Command::DrinkPotion);
    assert_eq!(
        (game.snapshot().forest.vitality, game.potions),
        (100.0, 1.0)
    );
    assert!(game.shop_status.contains("already full"));
    movement::walk(&mut game, [0.0, -8.0]).unwrap();
    press(&mut game, Command::BuyPotion);
    assert_eq!((game.stock, game.potions), (12.0, 1.0));
    assert!(game.shop_status.contains("too far"));
    movement::walk(&mut game, [2.0, -8.0]).unwrap();
    for _ in 0..5 {
        press(&mut game, Command::BuyPotion);
    }
    assert_eq!((game.stock, game.potions), (0.0, 5.0));
    assert!(game.shop_status.contains("Not enough"));
    press(&mut game, Command::CloseShop);
    movement::walk(&mut game, [0.0, 5.0]).unwrap();
    movement::walk(&mut game, [-2.0, 12.0]).unwrap();
    press(&mut game, Command::Gather);
    assert_eq!(game.snapshot().forest.vitality, 92.0);
    movement::walk(&mut game, [0.0, 5.0]).unwrap();
    movement::walk(&mut game, [0.0, -8.0]).unwrap();
    press(&mut game, Command::DrinkPotion);
    assert_eq!(
        (game.snapshot().forest.vitality, game.potions),
        (100.0, 4.0)
    );
    greywrought::persistence::save(&game, &path).unwrap();
    let reopened = greywrought::persistence::load(&path).unwrap();
    assert_eq!(game, reopened);
    std::fs::remove_file(path).unwrap();
}

#[test]
fn equipment_slots_power_connections_and_body_condition_control_actual_capacity() {
    let mut game = Game::new();
    press(&mut game, Command::PickComponent("helmet".into()));
    press(&mut game, Command::FitComponent("legs".into()));
    assert_eq!(
        game.fit_report,
        "That equipment does not fit this body part."
    );
    assert!(
        game.components
            .iter()
            .find(|c| c.id == "helmet")
            .unwrap()
            .attached_to
            .is_none()
    );
    press(&mut game, Command::FitComponent("head".into()));
    assert_eq!(game.capacity_readings.mass, 27.0);
    let mut spare = game
        .components
        .iter()
        .find(|c| c.id == "helmet")
        .unwrap()
        .clone();
    spare.id = "spare-helmet".into();
    spare.attached_to = None;
    game.components.push(spare);
    press(&mut game, Command::PickComponent("spare-helmet".into()));
    press(&mut game, Command::FitComponent("head".into()));
    assert_eq!(
        game.fit_report,
        "That body part has no free attachment slot."
    );
    assert!(
        game.components
            .iter()
            .find(|c| c.id == "spare-helmet")
            .unwrap()
            .attached_to
            .is_none()
    );
    press(&mut game, Command::PickComponent("drive".into()));
    press(&mut game, Command::DisconnectComponent);
    let view = game.snapshot().forest.equipment;
    for id in ["drive", "lance"] {
        assert!(!view.components.iter().find(|c| c.id == id).unwrap().powered);
    }
    press(&mut game, Command::PickComponent("lance".into()));
    press(&mut game, Command::FitComponent("left-arm".into()));
    assert_eq!(game.capacity_readings.weapon, 0.0);
    press(&mut game, Command::WireComponent("ember-core".into()));
    assert_eq!(game.capacity_readings.weapon, 9.0);
    press(&mut game, Command::PickComponent("auxiliary-core".into()));
    press(&mut game, Command::FitComponent("back".into()));
    assert_eq!(game.capacity_readings.power, 16.0);
    game.body_parts
        .iter_mut()
        .find(|p| p.id == "left-arm")
        .unwrap()
        .health = 50.0;
    game.tick().unwrap();
    assert_eq!(game.capacity_readings.weapon, 4.5);
    assert!(
        (game.snapshot().forest.equipment.creature_condition - 100.0 * 550.0 / 600.0).abs() < 1e-10
    );
    press(&mut game, Command::Rest);
    assert_eq!(game.capacity_readings.weapon, 9.0);
    movement::walk(&mut game, [0.0, 5.0]).unwrap();
    let before = game.components.clone();
    press(&mut game, Command::UnequipComponent);
    press(&mut game, Command::DisconnectComponent);
    press(&mut game, Command::FitComponent("back".into()));
    assert_eq!(game.components, before);
    assert_eq!(game.fit_report, "Return before changing equipment.");
}

#[test]
fn repair_spends_only_needed_supplies_and_power_cycles_require_a_live_source() {
    let mut game = Game::new();
    game.components
        .iter_mut()
        .find(|c| c.id == "lance")
        .unwrap()
        .health = 0.0;
    press(&mut game, Command::RepairComponent);
    assert_eq!(
        game.components
            .iter()
            .find(|c| c.id == "lance")
            .unwrap()
            .health,
        45.0
    );
    assert_eq!(game.stock, 3.75);
    assert_eq!(game.capacity_readings.weapon, 9.0);
    press(&mut game, Command::RepairComponent);
    assert_eq!(game.stock, 3.75);
    press(&mut game, Command::WireComponent("drive".into()));
    press(&mut game, Command::PickComponent("drive".into()));
    press(&mut game, Command::WireComponent("lance".into()));
    assert_eq!(
        (game.capacity_readings.weapon, game.capacity_readings.drive),
        (0.0, 0.0)
    );
    let origin = game.position;
    game.command(Command::Move { x: 0.0, z: 1.0 }).unwrap();
    game.tick().unwrap();
    assert!(
        game.position[1] > origin[1],
        "a living wayfarer walks without powered equipment"
    );
}
