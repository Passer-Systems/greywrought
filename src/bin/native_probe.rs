//! A real native selection, encounter, checked scalar edit, save/reopen journey.
use greywrought_clause::{
    EMBODIED_SOURCE,
    native::{self, NativeSession, field, number_field},
};
use std::{fs, path::PathBuf, time::Instant};

fn main() -> native::Result<()> {
    let started = Instant::now();
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let proof = root.join("build/native-proof");
    fs::create_dir_all(&proof)?;
    if let Some(saved_path) = std::env::args_os().nth(1) {
        let saved_path = PathBuf::from(saved_path);
        if !fs::metadata(&saved_path)?.is_file() {
            return Err("saved-world probe requires an existing file".into());
        }
        let mut restored = NativeSession::load(&saved_path, EMBODIED_SOURCE)?;
        let projection = restored.workbench.project_current_world()?;
        let source = restored.workbench.exact_source().to_vec();
        let continuity = restored.workbench.source_continuity()?;
        let copy = proof.join(format!("restored-{}.save", std::process::id()));
        restored.save(&copy)?;
        drop(restored);
        restored = NativeSession::load(&copy, EMBODIED_SOURCE)?;
        assert_eq!(restored.workbench.project_current_world()?, projection);
        assert_eq!(restored.workbench.exact_source(), source);
        assert_eq!(restored.workbench.source_continuity()?, continuity);
        if let Some(replacement) = std::env::args().nth(2) {
            let effects = restored.workbench.scalar_effects()?;
            println!("saved-world edit: catalog 0; prior {:?}; replacement {replacement:?}", effects.first());
            restored.edit(restored.workbench.generation().handle, 0, replacement.as_bytes())?;
        }
        let (input, value) = native::key("SelectAll");
        restored.input(restored.workbench.generation().handle, input, value)?;
        restored.tick()?;
        restored.save(&copy)?;
        println!("prior saved world reopened; exact admitted projection, source and continuity retained; continued input and tick; save {}", copy.display());
    }
    let mut session = NativeSession::open(EMBODIED_SOURCE)?;
    let initial = session.snapshot(0, String::new())?;
    assert_eq!(
        initial
            .actors
            .iter()
            .filter(|a| a.references.contains_key("Pick"))
            .count(),
        5
    );
    let warrior = initial
        .actors
        .iter()
        .find(|a| a.id == "warrior-1")
        .ok_or("no warrior")?;
    let handle = initial.generation;
    for (input, value) in [
        native::key("ClearSelection"),
        native::reference("Pick", warrior.references["Pick"].clone()),
    ] {
        session.input(handle, input, value)?;
    }
    session.tick()?;
    assert_eq!(
        session
            .snapshot(0, String::new())?
            .actors
            .iter()
            .filter(|a| a.selected)
            .count(),
        1
    );
    for (input, value) in [
        native::scalar("PointerWorldX", -3.0),
        native::scalar("PointerWorldZ", 1.0),
        native::key("IssueMove"),
    ] {
        session.input(handle, input, value)?;
    }
    session.tick()?;
    let moved = session.snapshot(0, String::new())?;
    assert!(
        moved
            .actors
            .iter()
            .find(|a| a.id == "warrior-1")
            .ok_or("no moved warrior")?
            .position[0]
            < warrior.position[0]
    );
    for (input, value) in [native::key("SelectAll"), native::key("BeginEncounter")] {
        session.input(handle, input, value)?;
    }
    session.tick()?;
    let before_attack = session.workbench.project_current_world()?;
    let health_before = number_field(
        field(&before_attack, "cinder-1").ok_or("no cinder")?,
        "vitality",
    );
    let (input, value) = native::key("Attack");
    session.input(handle, input, value)?;
    session.tick()?;
    let attacked = session.workbench.project_current_world()?;
    let health_after = number_field(field(&attacked, "cinder-1").ok_or("no cinder")?, "vitality");
    assert!(
        health_after < health_before,
        "native attack must reduce admitted enemy health"
    );
    let effects = session.workbench.scalar_effects()?;
    let (index, _) = effects
        .iter()
        .enumerate()
        .find(|(_, effect)| effect.expression == b"?cooldown - ?dt")
        .ok_or("no cooldown effect")?;
    let edit_started = Instant::now();
    session.edit(handle, index, b"?cooldown - (?dt * 2.0)")?;
    let edit_millis = edit_started.elapsed().as_millis();
    assert_ne!(session.workbench.generation().handle, handle);
    assert!(session.workbench.rejects_stale_handle(handle)?);
    let carried = session.workbench.project_current_world()?;
    assert_eq!(
        number_field(
            field(&carried, "cinder-1").ok_or("no carried cinder")?,
            "vitality"
        ),
        health_after
    );
    let continuity = session.workbench.source_continuity()?;
    session.tick()?;
    let saved_projection = session.workbench.project_current_world()?;
    let save = proof.join(format!("journey-{}.save", std::process::id()));
    session.save(&save)?;
    let exact_source = session.workbench.exact_source().to_vec();
    drop(session);
    let mut reopened = NativeSession::load(&save, EMBODIED_SOURCE)?;
    assert_eq!(reopened.workbench.exact_source(), exact_source);
    assert_eq!(reopened.workbench.source_continuity()?, continuity);
    assert_eq!(
        reopened.workbench.project_current_world()?,
        saved_projection
    );
    let (input, value) = native::key("SelectAll");
    reopened.input(reopened.workbench.generation().handle, input, value)?;
    reopened.tick()?;
    reopened.save(&save)?;
    println!(
        "native journey passed: five company actors; exact selection; encounter attack {health_before}->{health_after}; checked scalar edit {edit_millis}ms; stale handle rejected; identical admitted projection on reopen; continued input and tick; total {}ms; save {}",
        started.elapsed().as_millis(),
        save.display()
    );
    Ok(())
}
