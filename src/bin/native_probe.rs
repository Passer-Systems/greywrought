//! A real native selection, encounter, checked scalar edit, save/reopen journey.
use greywrought_clause::{
    EMBODIED_SOURCE,
    native::{self, NativeSession, field, number_field},
};
use std::{fs, path::PathBuf, time::Instant};

fn main() -> native::Result<()> {
    match std::env::args().nth(1).as_deref() {
        Some("--source-items") => return source_items(),
        Some("--replace-source-items") => return replace_source_items(),
        _ => {}
    }
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
        let continuity = restored
            .workbench
            .last_source_edit()
            .map(|_| restored.workbench.source_continuity())
            .transpose()?;
        let copy = proof.join(format!("restored-{}.save", std::process::id()));
        restored.save(&copy)?;
        drop(restored);
        restored = NativeSession::load(&copy, EMBODIED_SOURCE)?;
        assert_eq!(restored.workbench.project_current_world()?, projection);
        assert_eq!(restored.workbench.exact_source(), source);
        assert_eq!(
            restored
                .workbench
                .last_source_edit()
                .map(|_| restored.workbench.source_continuity())
                .transpose()?,
            continuity
        );
        if let Some(replacement) = std::env::args().nth(2) {
            let effects = restored.workbench.scalar_effects()?;
            if replacement == "--catalog" {
                for (index, effect) in effects.iter().enumerate() {
                    let handler = &source
                        [effect.handler_origin.start as usize..effect.handler_origin.end as usize];
                    println!(
                        "{index}: {} => {}",
                        String::from_utf8_lossy(handler)
                            .lines()
                            .next()
                            .unwrap_or_default(),
                        String::from_utf8_lossy(&effect.expression)
                    );
                }
                return Ok(());
            }
            let index = std::env::args()
                .nth(3)
                .ok_or("saved-world edit requires an offered catalog index")?
                .parse()?;
            println!("saved-world edit: catalog {index}; replacement {replacement:?}");
            restored.edit(
                restored.workbench.generation().handle,
                index,
                replacement.as_bytes(),
            )?;
        }
        let (input, value) = native::key("SelectAll");
        restored.input(restored.workbench.generation().handle, input, value)?;
        restored.tick()?;
        restored.save(&copy)?;
        println!(
            "prior saved world reopened; exact admitted projection, source and continuity retained; continued input and tick; save {}",
            copy.display()
        );
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

fn source_items() -> native::Result<()> {
    let path = std::env::args_os()
        .nth(2)
        .ok_or("--source-items needs a source path")?;
    let source = fs::read(path)?;
    let session = NativeSession::open(&source)?;
    for (index, item) in session.workbench.source_items()?.iter().enumerate() {
        println!(
            "{index}: {:?} [{}..{}] {}",
            item.production,
            item.origin.start,
            item.origin.end,
            String::from_utf8_lossy(&item.source)
                .lines()
                .next()
                .unwrap_or_default()
        );
    }
    Ok(())
}

fn replace_source_items() -> native::Result<()> {
    let mut args = std::env::args_os().skip(2);
    let save = PathBuf::from(args.next().ok_or("missing input save path")?);
    let expected = fs::read(args.next().ok_or("missing expected source path")?)?;
    let next = fs::read(args.next().ok_or("missing replacement source path")?)?;
    let output = PathBuf::from(args.next().ok_or("missing output save path")?);
    if !save.is_file() || output.exists() {
        return Err("input save must exist and output path must be unused".into());
    }
    let mut session = NativeSession::load(&save, &expected)?;
    if session.workbench.exact_source() != expected {
        return Err(
            "saved source differs from the explicit update precondition; save untouched".into(),
        );
    }
    let replacements = NativeSession::open(&next)?.workbench.source_items()?;
    let offered = session.workbench.source_items()?;
    let mut operations = Vec::new();
    for pair in args {
        let pair = pair.to_str().ok_or("source item pair must be UTF-8")?;
        let (old, new) = pair
            .split_once(':')
            .ok_or("source item pair must be OLD:NEW")?;
        let old: usize = old.parse()?;
        let new: usize = new.parse()?;
        operations.push(clause_package::CanonicalSourceItemReplacementV1 {
            selected: offered.get(old).ok_or("unknown old source item")?.clone(),
            replacement: replacements
                .get(new)
                .ok_or("unknown new source item")?
                .source
                .clone(),
        });
    }
    if operations.is_empty() {
        return Err("select at least one offered source item explicitly".into());
    }
    session.replace_source_items(session.workbench.generation().handle, &operations)?;
    if session.workbench.exact_source() != next {
        return Err(
            "checked operations do not produce the requested source; no save written".into(),
        );
    }
    let projection = session.workbench.project_current_world()?;
    let continuity = session.workbench.source_continuity()?;
    session.save(&output)?;
    let mut reopened = NativeSession::load(&output, &next)?;
    if reopened.workbench.exact_source() != next
        || reopened.workbench.project_current_world()? != projection
        || reopened.workbench.source_continuity()? != continuity
    {
        return Err(
            "updated save failed exact reopen verification; original save untouched".into(),
        );
    }
    reopened.tick()?;
    println!(
        "Checked source-item update preserved the world; exact source, admitted projection and continuity survived reopen; next tick accepted. Original save untouched. Output: {}",
        output.display()
    );
    Ok(())
}
