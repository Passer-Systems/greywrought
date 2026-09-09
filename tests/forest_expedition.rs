#[path = "common/forest.rs"]
mod movement;
use greywrought::game::{Command, Game, ThreatPhase};

fn ticks(game: &mut Game, count: usize) {
    for _ in 0..count {
        game.tick().unwrap();
    }
}
fn press(game: &mut Game, command: Command) {
    game.command(command).unwrap();
    game.tick().unwrap();
}
fn ready(game: &mut Game) {
    for _ in 0..200 {
        if game.action_cooldown <= 0.0 {
            return;
        }
        game.tick().unwrap();
    }
    panic!("the action did not become ready");
}
fn act(game: &mut Game, command: Command) {
    ready(game);
    press(game, command);
}
fn health(game: &Game, id: &str) -> f64 {
    game.threats.iter().find(|t| t.id == id).unwrap().health
}
fn clear(game: &mut Game, id: &str) {
    let p = game.threats.iter().find(|t| t.id == id).unwrap().position;
    movement::walk(game, [0.0, p[1]]).unwrap();
    movement::walk(game, if id == "nest" { [2.0, p[1]] } else { p }).unwrap();
    press(game, Command::TargetThreat(id.into()));
    for _ in 0..8 {
        if health(game, id) <= 0.0 {
            return;
        }
        act(game, Command::Strike);
    }
    panic!("the planned attacks did not clear {id}");
}

#[test]
fn forest_resource_is_permanent_only_after_extraction() {
    let mut game = Game::new();
    movement::walk(&mut game, [0.0, 5.0]).unwrap();
    movement::walk(&mut game, [-2.0, 12.0]).unwrap();
    act(&mut game, Command::Gather);
    assert_eq!(
        (game.cargo, game.stock, game.resource_remaining),
        (3.0, 15.0, 9.0)
    );
    game.tick().unwrap();
    assert_eq!(game.phase, "Expedition");
    movement::walk(&mut game, [0.0, 5.0]).unwrap();
    movement::walk(&mut game, [0.0, -1.0]).unwrap();
    game.tick().unwrap();
    assert_eq!(game.phase, "Returned");
    assert_eq!((game.stock, game.cargo), (18.0, 0.0));
    game.tick().unwrap();
    assert_eq!(game.stock, 18.0);
}

#[test]
fn forest_intents_remain_readable_for_thirty_seconds_and_clearing_scout_stops_alarms() {
    let mut game = Game::new();
    movement::walk(&mut game, [0.0, 5.0]).unwrap();
    movement::walk(&mut game, [-3.0, 10.0]).unwrap();
    let initial = game.snapshot().forest;
    let scout = initial.threats.iter().find(|t| t.id == "scout").unwrap();
    assert!(
        ["Listening for footsteps", "Sounding the alarm"].contains(&scout.current_intent.as_str())
    );
    assert_ne!(scout.current_intent, scout.upcoming_intent);
    let mut observed = std::collections::BTreeSet::new();
    for _ in 0..30 {
        ticks(&mut game, 63);
        let view = game.snapshot().forest;
        observed.insert(
            view.threats
                .iter()
                .find(|t| t.id == "scout")
                .unwrap()
                .current_intent
                .clone(),
        );
        for threat in game.threats.iter().filter(|t| t.id != "ritual-guardian") {
            let projected = view.threats.iter().find(|t| t.id == threat.id).unwrap();
            assert!(!projected.current_intent.is_empty() && !projected.upcoming_intent.is_empty());
            assert!(threat.intent_remaining > 0.0);
        }
    }
    assert_eq!(observed.len(), 2);
    let added = game.presence - initial.presence;
    assert!((added - 18.024).abs() < 0.000_001, "{added}");
    clear(&mut game, "scout");
    let scout = game
        .snapshot()
        .forest
        .threats
        .into_iter()
        .find(|t| t.id == "scout")
        .unwrap();
    assert_eq!(scout.current_intent, "Cleared");
    assert_eq!(scout.phase, ThreatPhase::Cleared);
    assert_eq!((game.stock, game.cargo), (15.0, 0.0));
    let before = game.presence;
    ticks(&mut game, 375);
    assert!((game.presence - before - 0.6).abs() < 0.000_001);
}

#[test]
fn forest_ritual_is_deliberate_and_its_known_reward_requires_a_living_return() {
    let mut game = Game::new();
    press(&mut game, Command::PartySize(4));
    movement::walk(&mut game, [0.0, 5.0]).unwrap();
    act(&mut game, Command::Ritual);
    assert!(
        !game
            .threats
            .iter()
            .find(|t| t.id == "ritual-guardian")
            .unwrap()
            .active
    );
    for id in ["scout", "nest", "warder", "patrol"] {
        clear(&mut game, id);
    }
    movement::walk(&mut game, [0.0, 12.0]).unwrap();
    movement::walk(&mut game, [-2.0, 12.0]).unwrap();
    let safe_health = game.snapshot().forest.vitality;
    for _ in 0..5 {
        act(&mut game, Command::Gather);
    }
    assert_eq!(game.snapshot().forest.vitality, safe_health);
    assert_eq!((game.cargo, game.resource_remaining), (12.0, 0.0));
    movement::walk(&mut game, [2.0, 40.0]).unwrap();
    act(&mut game, Command::Ritual);
    assert_eq!(game.cargo, 6.0);
    clear(&mut game, "ritual-guardian");
    game.tick().unwrap();
    assert_eq!(
        (game.carried_relics, game.banked_relics, game.stock),
        (1.0, 0.0, 15.0)
    );
    act(&mut game, Command::Ritual);
    assert_eq!(game.cargo, 6.0);
    ready(&mut game);
    let retreat_health = game.snapshot().forest.vitality;
    movement::walk(&mut game, [0.0, 5.0]).unwrap();
    movement::walk(&mut game, [0.0, -1.0]).unwrap();
    assert_eq!(game.snapshot().forest.vitality, retreat_health);
    game.tick().unwrap();
    assert_eq!(game.phase, "Returned");
    assert_eq!(
        (game.stock, game.banked_relics, game.carried_relics),
        (21.0, 1.0, 0.0)
    );
    movement::walk(&mut game, [0.0, 5.0]).unwrap();
    movement::walk(&mut game, [-3.0, 10.0]).unwrap();
    press(&mut game, Command::TargetThreat("scout".into()));
    act(&mut game, Command::Strike);
    assert!((health(&game, "scout") + 7.0).abs() < 0.000_001);
}

#[test]
fn forest_party_presence_is_modest_and_disconnected_checkpoint_preserves_the_instance() {
    let mut solo = Game::new();
    let mut group = Game::new();
    press(&mut group, Command::PartySize(4));
    movement::walk(&mut solo, [0.0, 3.0]).unwrap();
    movement::walk(&mut group, [0.0, 3.0]).unwrap();
    assert!(group.presence > solo.presence && group.presence < solo.presence * 1.3);
    press(&mut group, Command::PartySize(1));
    assert_eq!(group.party_size, 4);
    press(&mut group, Command::ConnectionLost);
    let paused = group.clone();
    let path = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join(format!("build/forest/pause-{}.json", std::process::id()));
    greywrought::persistence::save(&group, &path).unwrap();
    let mut reopened = greywrought::persistence::load(&path).unwrap();
    ticks(&mut reopened, 100);
    reopened.command(Command::Move { x: 0.0, z: 1.0 }).unwrap();
    ticks(&mut reopened, 20);
    assert_eq!(
        (
            paused.presence,
            paused.cargo,
            paused.stock,
            paused.action_cooldown,
            paused.position
        ),
        (
            reopened.presence,
            reopened.cargo,
            reopened.stock,
            reopened.action_cooldown,
            reopened.position
        )
    );
    assert_eq!(paused.threats, reopened.threats);
    assert_eq!(paused.body_parts, reopened.body_parts);
    press(&mut reopened, Command::ConnectionRestored);
    movement::walk(&mut reopened, [0.0, 6.0]).unwrap();
    assert!((reopened.position[1] - 6.0).abs() < 0.1);
    std::fs::remove_file(path).unwrap();
}

#[test]
fn forest_death_loses_carried_and_personal_power_and_cannot_be_restored_at_the_hub() {
    let mut game = Game::new();
    game.phase = "Expedition".into();
    game.position = [0.0, 35.0];
    game.cargo = 3.0;
    game.banked_relics = 2.0;
    for part in &mut game.body_parts {
        part.health = 1.0;
    }
    for threat in &mut game.threats {
        threat.intent_remaining = 0.016;
    }
    ticks(&mut game, 2);
    assert_eq!(game.phase, "Lost");
    assert_eq!(
        (
            game.cargo,
            game.stock,
            game.carried_relics,
            game.banked_relics
        ),
        (0.0, 0.0, 0.0, 0.0)
    );
    assert!(game.body_parts.iter().all(|p| p.health == 0.0));
    assert!(game.components.iter().all(|c| c.health == 0.0));
    press(&mut game, Command::Rest);
    press(&mut game, Command::RepairComponent);
    game.command(Command::Move { x: 0.0, z: -1.0 }).unwrap();
    ticks(&mut game, 30);
    assert_eq!(game.phase, "Lost");
    assert_eq!(game.snapshot().forest.vitality, 0.0);
    assert_eq!(game.position, [0.0, 35.0]);
}

#[test]
fn forest_walk_is_bounded_and_stops_when_input_expires() {
    let mut game = Game::new();
    game.command(Command::Move { x: 1.0, z: 1.0 }).unwrap();
    ticks(&mut game, 10);
    let distance = game.position[0].hypot(game.position[1] + 8.0);
    assert!((distance - 0.72).abs() < 0.000_001);
    ticks(&mut game, 20);
    let stopped = game.position;
    ticks(&mut game, 20);
    assert_eq!(game.position, stopped);
    movement::walk(&mut game, [8.0, -1.0]).unwrap();
    for _ in 0..10 {
        game.command(Command::Move { x: 0.0, z: 1.0 }).unwrap();
        ticks(&mut game, 10);
    }
    assert!(game.position[1] < -0.5);
    assert_eq!(game.phase, "Workshop");
    press(&mut game, Command::Gather);
    assert_eq!(game.cargo, 0.0);
}

#[test]
fn attacks_resolve_at_the_visible_phase_boundary_using_start_of_tick_range_and_guard() {
    let mut game = Game::new();
    game.phase = "Expedition".into();
    game.position = [-3.0, 30.0];
    for threat in &mut game.threats {
        threat.active = threat.id == "warder";
        threat.intent_remaining = 0.032;
    }
    game.presence = 20.0;
    game.command(Command::Brace).unwrap();
    game.tick().unwrap();
    assert_eq!(game.snapshot().forest.vitality, 100.0);
    let before = game
        .snapshot()
        .forest
        .threats
        .into_iter()
        .find(|t| t.id == "warder")
        .unwrap();
    assert_eq!(
        (before.phase, before.action_sequence),
        (ThreatPhase::Preparation, 0)
    );
    let presence = game.presence;
    game.tick().unwrap();
    let attack = game
        .snapshot()
        .forest
        .threats
        .into_iter()
        .find(|t| t.id == "warder")
        .unwrap();
    assert_eq!(
        (attack.phase, attack.action_sequence, attack.last_action_hit),
        (ThreatPhase::Action, 1, true)
    );
    assert_eq!(attack.phase_progress, 0.0);
    assert!(
        (game.snapshot().forest.vitality - (100.0 - 8.0 * (1.0 + presence / 100.0) * 0.5)).abs()
            < 1e-10
    );
    ticks(&mut game, 22);
    assert_eq!(
        game.snapshot()
            .forest
            .threats
            .into_iter()
            .find(|t| t.id == "warder")
            .unwrap()
            .phase,
        ThreatPhase::Recovery
    );

    let mut away = Game::new();
    away.phase = "Expedition".into();
    away.position = [-12.0, 30.0];
    for threat in &mut away.threats {
        threat.active = threat.id == "warder";
        threat.intent_remaining = 0.016;
    }
    away.tick().unwrap();
    let missed = away
        .snapshot()
        .forest
        .threats
        .into_iter()
        .find(|t| t.id == "warder")
        .unwrap();
    assert_eq!(missed.action_sequence, 1);
    assert!(!missed.last_action_hit);
    assert_eq!(away.snapshot().forest.vitality, 100.0);
}
