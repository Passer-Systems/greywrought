//! Opt-in native window observations; never changes world scheduling or admission.
use super::*;
use bevy::render::view::screenshot::{Screenshot, ScreenshotCaptured, save_to_disk};

#[derive(Resource)]
pub(super) struct Smoke {
    seconds: Option<u64>,
    opened: Option<Instant>,
    observation: Option<(Instant, u64)>,
    previous_frame: Option<Instant>,
    finished: Option<Instant>,
    intervals: Vec<f64>,
    previous_actors: BTreeMap<String, [f32; 3]>,
    previous_tick: Option<u64>,
    min_actors: usize,
    min_moving: usize,
    min_displaced: usize,
    identities_stable: bool,
}

impl Smoke {
    pub(super) fn new(seconds: Option<u64>) -> Self {
        Self {
            seconds,
            opened: None,
            observation: None,
            previous_frame: None,
            finished: None,
            intervals: Vec::new(),
            previous_actors: BTreeMap::new(),
            previous_tick: None,
            min_actors: usize::MAX,
            min_moving: usize::MAX,
            min_displaced: usize::MAX,
            identities_stable: true,
        }
    }
}

pub(super) fn edited_frame(
    commands: &mut Commands,
    smoke: &Smoke,
    generation: WasmSessionHandleV1,
    started: Instant,
) {
    if smoke.seconds.is_none() {
        return;
    }
    commands
        .spawn(Screenshot::primary_window())
        .observe(move |captured: On<ScreenshotCaptured>| {
            eprintln!(
                "native edited frame captured: {:.3} ms; generation {:?}; size {}x{}",
                started.elapsed().as_secs_f64() * 1000.,
                generation,
                captured.image.width(),
                captured.image.height()
            );
        });
}

pub(super) fn smoke(
    mut commands: Commands,
    mut smoke: ResMut<Smoke>,
    mut exit: MessageWriter<AppExit>,
    display: Res<Displayed>,
) {
    let Some(seconds) = smoke.seconds else {
        return;
    };
    if let Some(finished) = smoke.finished {
        if finished.elapsed() >= Duration::from_secs(1) {
            exit.write(AppExit::Success);
        }
        return;
    }
    let Some(snapshot) = &display.snapshot else {
        return;
    };
    let now = Instant::now();
    let opened = *smoke.opened.get_or_insert(now);
    // Let initial assets settle before the warm interval. Startup is not timed as warm play.
    if now.duration_since(opened) < Duration::from_secs(1) {
        return;
    }
    let (started, first_tick) = *smoke.observation.get_or_insert((now, snapshot.ticks));
    if let Some(previous) = smoke.previous_frame.replace(now) {
        smoke
            .intervals
            .push(now.duration_since(previous).as_secs_f64() * 1000.);
    }
    if smoke.previous_tick != Some(snapshot.ticks) {
        smoke.min_actors = smoke.min_actors.min(snapshot.actors.len());
        smoke.min_moving = smoke
            .min_moving
            .min(snapshot.actors.iter().filter(|a| a.moving).count());
        if smoke.previous_tick.is_some() {
            let stable = snapshot.actors.len() == smoke.previous_actors.len()
                && snapshot
                    .actors
                    .iter()
                    .all(|a| smoke.previous_actors.contains_key(&a.id));
            smoke.identities_stable &= stable;
            let displaced = snapshot
                .actors
                .iter()
                .filter(|a| {
                    smoke
                        .previous_actors
                        .get(&a.id)
                        .is_some_and(|p| *p != a.position)
                })
                .count();
            smoke.min_displaced = smoke.min_displaced.min(displaced);
        }
        smoke.previous_actors = snapshot
            .actors
            .iter()
            .map(|a| (a.id.clone(), a.position))
            .collect();
        smoke.previous_tick = Some(snapshot.ticks);
    }
    let elapsed = now.duration_since(started).as_secs_f64();
    if elapsed < seconds as f64 {
        return;
    }
    smoke.intervals.sort_by(f64::total_cmp);
    let frames = smoke.intervals.len();
    let p95 = smoke
        .intervals
        .get((frames * 95).div_ceil(100).saturating_sub(1))
        .copied()
        .unwrap_or(0.);
    let max = smoke.intervals.last().copied().unwrap_or(0.);
    eprintln!(
        "native window measurement: frame_intervals={frames}; actual_seconds={elapsed:.6}; mean_fps={:.3}; p95_frame_ms={p95:.3}; max_frame_ms={max:.3}; observed_clause_ticks={}; simulated_seconds={:.6}; min_actors={}; min_moving={}; min_displaced={}; identities_stable={}",
        frames as f64 / elapsed,
        snapshot.ticks - first_tick,
        (snapshot.ticks - first_tick) as f64 * 0.016,
        smoke.min_actors,
        smoke.min_moving,
        smoke.min_displaced,
        smoke.identities_stable
    );
    commands
        .spawn(Screenshot::primary_window())
        .observe(save_to_disk("build/native-window.png"));
    smoke.finished = Some(now);
}

pub(super) struct WorldTimings {
    enabled: bool,
    samples: Vec<(u64, f64, f64)>,
}
impl WorldTimings {
    pub(super) fn new(enabled: bool) -> Self {
        Self {
            enabled,
            samples: Vec::new(),
        }
    }
    pub(super) fn tick(&mut self, tick: u64, runtime: Duration, publish: Duration) {
        if self.enabled {
            self.samples.push((
                tick,
                runtime.as_secs_f64() * 1000.,
                publish.as_secs_f64() * 1000.,
            ));
        }
    }
    pub(super) fn report(&self) {
        for (tick, runtime, publish) in &self.samples {
            eprintln!(
                "native tick phases: tick={tick}; candidate_admission_drop_ms={runtime:.6}; snapshot_mailbox_drop_ms={publish:.6}"
            );
        }
    }
}
