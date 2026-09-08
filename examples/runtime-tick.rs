//! Fixed-source interpreted tick timings and exact admitted projection evidence.
use clause_runtime::{
    WasmSessionTickV1, begin_executable_source_profile_v1, finish_executable_source_profile_v1,
};
use greywrought_clause::native::{self, NativeSession};
use serde_json::{Value, json};
use std::{fs, path::Path, time::Instant};
fn tick(session: &mut NativeSession, profile: bool) -> native::Result<Value> {
    if profile {
        assert!(begin_executable_source_profile_v1());
    }
    let start = Instant::now();
    session.tick()?;
    let whole_tick_ms = start.elapsed().as_secs_f64() * 1000.;
    let profile = profile.then(|| {
        serde_json::from_str::<Value>(&finish_executable_source_profile_v1().unwrap().to_json())
            .unwrap()
    });
    let start = Instant::now();
    drop(session.snapshot(0, String::new())?);
    Ok(
        json!({"whole_tick_ms":whole_tick_ms,"snapshot_ms":start.elapsed().as_secs_f64()*1000.,"profile":profile}),
    )
}
fn projection(session: &NativeSession, path: &Path) -> native::Result<()> {
    let world = session.workbench.project_current_world()?;
    let mut bytes = Vec::new();
    for (name, value) in native::fields(&world).filter(|(name, _)| !name.starts_with('$')) {
        bytes.extend_from_slice(&(name.len() as u64).to_le_bytes());
        bytes.extend_from_slice(name.as_bytes());
        let value = clause_package::canonical_term_bytes(value)?;
        bytes.extend_from_slice(&(value.len() as u64).to_le_bytes());
        bytes.extend_from_slice(&value);
    }
    fs::write(path, bytes)?;
    Ok(())
}
fn main() -> native::Result<()> {
    let args = std::env::args().skip(1).collect::<Vec<_>>();
    let source = fs::read(&args[0])?;
    let initial = Path::new(&args[1]);
    let out = Path::new(&args[2]);
    fs::create_dir_all(out)?;
    if !initial.exists() {
        NativeSession::open(&source)?.save(initial)?;
    }
    let mut session = NativeSession::load(initial, &source)?;
    let before = session.snapshot(0, String::new())?;
    assert_eq!(before.actors.len(), 104);
    assert_eq!(before.actors.iter().filter(|a| a.moving).count(), 100);
    let mut samples = Vec::new();
    for index in 0..68 {
        samples.push(tick(&mut session, index >= 65)?);
        projection(&session, &out.join(format!("tick-{index}.term")))?;
    }
    let after = session.snapshot(0, String::new())?;
    assert_eq!(
        before.actors.iter().map(|a| &a.id).collect::<Vec<_>>(),
        after.actors.iter().map(|a| &a.id).collect::<Vec<_>>()
    );
    assert_eq!(
        before
            .actors
            .iter()
            .zip(&after.actors)
            .filter(|(a, b)| a.position != b.position)
            .count(),
        100
    );
    let world = session.workbench.project_current_world()?;
    session.workbench.tick_to_candidate(WasmSessionTickV1 {
        configuration_revision: 69,
        fixed_tick_milliseconds: 16,
    })?;
    assert_eq!(world, session.workbench.project_current_world()?);
    drop(session.workbench.admit()?);
    projection(&session, &out.join("candidate-admitted.term"))?;
    let world = session.workbench.project_current_world()?;
    let overflow = session.workbench.fixed_tick_occurrences(f64::MAX)?;
    assert!(
        session
            .workbench
            .run_occurrences_to_candidate(&overflow)
            .unwrap_err()
            .to_string()
            .contains("NumericDomain")
    );
    assert_eq!(world, session.workbench.project_current_world()?);
    assert!(session.workbench.admit().is_err());
    assert_eq!(
        session.workbench.scalar_effects()?[59].expression,
        b"?cooldown - ?dt"
    );
    let old = session.workbench.generation().handle;
    let start = Instant::now();
    session.edit(old, 59, b"?cooldown - (?dt * 1.5)")?;
    let edit_ms = start.elapsed().as_secs_f64() * 1000.;
    assert!(session.workbench.rejects_stale_handle(old)?);
    assert!(!session.workbench.reclaim_retired());
    projection(&session, &out.join("edited.term"))?;
    let first_post_edit = tick(&mut session, args.get(3).is_some())?;
    projection(&session, &out.join("first-post-edit.term"))?;
    let mut edited_samples = Vec::new();
    for _ in 0..16 {
        edited_samples.push(tick(&mut session, false)?);
    }
    projection(&session, &out.join("final.term"))?;
    session.save(&out.join("final.save"))?;
    let reopened = NativeSession::load(&out.join("final.save"), &source)?;
    assert_eq!(
        session.workbench.project_current_world()?,
        reopened.workbench.project_current_world()?
    );
    assert_eq!(
        session.workbench.exact_source(),
        reopened.workbench.exact_source()
    );
    fs::write(
        out.join("result.json"),
        serde_json::to_vec_pretty(
            &json!({"samples":samples,"edit_ms":edit_ms,"first_post_edit":first_post_edit,"edited_samples":edited_samples,"stable_identities":104,"moving_actors":100,"hidden_candidate":true,"numeric_failure_atomic":true,"stale_rejected":true,"save_reopened":true}),
        )?,
    )?;
    println!("{}", out.display());
    Ok(())
}
