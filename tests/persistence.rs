use greywrought::{game::Game, persistence};
use std::{
    fs,
    path::PathBuf,
    sync::atomic::{AtomicU64, Ordering},
};

static NEXT: AtomicU64 = AtomicU64::new(0);

struct SaveDirectory(PathBuf);
impl SaveDirectory {
    fn new() -> Self {
        let path = std::env::temp_dir().join(format!(
            "greywrought-save-test-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir(&path).unwrap();
        Self(path)
    }
    fn save(&self) -> PathBuf {
        self.0.join(persistence::SAVE_FILE_NAME)
    }
}
impl Drop for SaveDirectory {
    fn drop(&mut self) {
        for entry in fs::read_dir(&self.0).unwrap() {
            let path = entry.unwrap().path();
            if path.is_file() {
                fs::remove_file(path).unwrap();
            }
        }
        fs::remove_dir(&self.0).unwrap();
    }
}

#[test]
fn missing_save_starts_fresh_without_writing() {
    let dir = SaveDirectory::new();
    assert_eq!(persistence::load(&dir.save()).unwrap(), Game::new());
    assert!(!dir.save().exists());
}

#[test]
fn complete_journey_roundtrips_and_replaces_the_previous_save() {
    let dir = SaveDirectory::new();
    let mut game = Game::new();
    persistence::save(&game, &dir.save()).unwrap();
    game.ticks = 781;
    game.position = [0.8085993227608717, 39.60110577952644];
    game.presence = 15.662399999999764;
    game.phase = "Expedition".into();
    game.stock = 21.0;
    game.cargo = 7.0;
    game.potions = 3.0;
    game.carried_relics = 1.0;
    game.banked_relics = 2.0;
    game.action_cooldown = 0.8160000000000001;
    game.body_parts[0].health = 43.25;
    game.components[0].health = 31.75;
    game.components[0].linked = false;
    game.components[0].attached_to = None;
    game.threats[0].intent_stage = 1;
    game.threats[0].intent_remaining = 0.3920000000000001;
    game.threats[0].health = 9.0;
    game.tuning.move_speed = 7.125;
    persistence::save(&game, &dir.save()).unwrap();
    assert_eq!(persistence::load(&dir.save()).unwrap(), game);
    assert_eq!(fs::read_dir(&dir.0).unwrap().count(), 1);
}

#[test]
fn corrupt_and_incompatible_saves_fail_without_replacement() {
    let dir = SaveDirectory::new();
    for bytes in [b"{not a save".to_vec(), b"{}".to_vec()] {
        fs::write(dir.save(), &bytes).unwrap();
        assert!(persistence::load(&dir.save()).is_err());
        assert_eq!(fs::read(dir.save()).unwrap(), bytes);
    }
    persistence::save(&Game::new(), &dir.save()).unwrap();
    let mut saved: serde_json::Value =
        serde_json::from_slice(&fs::read(dir.save()).unwrap()).unwrap();
    saved["version"] = 999.into();
    let bytes = serde_json::to_vec(&saved).unwrap();
    fs::write(dir.save(), &bytes).unwrap();
    assert!(
        persistence::load(&dir.save())
            .unwrap_err()
            .to_string()
            .contains("different game version")
    );
    assert_eq!(fs::read(dir.save()).unwrap(), bytes);
}

#[test]
fn unrepresentable_state_cannot_replace_a_good_save() {
    let dir = SaveDirectory::new();
    let mut game = Game::new();
    persistence::save(&game, &dir.save()).unwrap();
    let original = fs::read(dir.save()).unwrap();
    game.position[0] = f64::NAN;
    assert!(persistence::save(&game, &dir.save()).is_err());
    assert_eq!(fs::read(dir.save()).unwrap(), original);
    assert_eq!(fs::read_dir(&dir.0).unwrap().count(), 1);
}

#[test]
fn new_journey_archives_the_ended_character_and_preserves_legacy_save() {
    let dir = SaveDirectory::new();
    let legacy_path = dir.0.join("spatial.save");
    fs::write(&legacy_path, b"untouched legacy character").unwrap();
    let mut ended = Game::new();
    ended.phase = "Lost".into();
    ended.body_parts[0].health = 0.0;
    ended.position = [0.8085993227608717, 39.60110577952644];
    persistence::save(&ended, &dir.save()).unwrap();
    let (fresh, archive) = persistence::start_new_journey(&ended, &dir.save()).unwrap();
    assert_eq!(fresh, Game::new());
    assert_eq!(persistence::load(&dir.save()).unwrap(), fresh);
    assert_eq!(persistence::load(&archive).unwrap(), ended);
    assert_eq!(
        fs::read(legacy_path).unwrap(),
        b"untouched legacy character"
    );
    assert!(persistence::start_new_journey(&fresh, &dir.save()).is_err());
    assert_eq!(persistence::load(&dir.save()).unwrap(), fresh);
}

#[test]
fn structurally_readable_but_broken_journeys_are_rejected_before_use() {
    let dir = SaveDirectory::new();
    let game = Game::new();
    persistence::save(&game, &dir.save()).unwrap();
    let original = fs::read(dir.save()).unwrap();
    let mut broken = game.clone();
    broken.body_parts.retain(|part| part.id != "torso");
    assert!(persistence::save(&broken, &dir.save()).is_err());
    assert_eq!(fs::read(dir.save()).unwrap(), original);
    fs::write(
        &dir.save(),
        serde_json::to_vec(&serde_json::json!({"version":1,"game":broken})).unwrap(),
    )
    .unwrap();
    assert!(persistence::load(&dir.save()).is_err());
    let mut broken = game;
    broken.components[0].upstream = "missing-equipment".into();
    fs::write(
        &dir.save(),
        serde_json::to_vec(&serde_json::json!({"version":1,"game":broken})).unwrap(),
    )
    .unwrap();
    assert!(persistence::load(&dir.save()).is_err());
}
