//! Opt-in native window observations; never changes world scheduling or admission.
use super::*;
use bevy::render::view::screenshot::{Screenshot, save_to_disk};

#[derive(Resource)]
pub(super) struct Smoke {
    seconds: Option<u64>,
    opened: Option<Instant>,
    observation: Option<(Instant, u64)>,
    previous_frame: Option<Instant>,
    finished: Option<Instant>,
    intervals: Vec<f64>,
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
        }
    }
}

pub(super) fn smoke(
    mut commands: Commands,
    mut smoke: ResMut<Smoke>,
    mut exit: MessageWriter<AppExit>,
    mut display: ResMut<Displayed>,
    journey: Res<Journey>,
    timings: Res<WorldTimings>,
) {
    let Some(seconds) = smoke.seconds else {
        return;
    };
    if let Some(finished) = smoke.finished {
        if finished.elapsed() >= Duration::from_secs(1) {
            if save_journey(&journey, &mut display) {
                timings.report();
                exit.write(AppExit::Success);
            } else {
                smoke.seconds = None;
            }
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
        "native window measurement: frame_intervals={frames}; actual_seconds={elapsed:.6}; mean_fps={:.3}; p95_frame_ms={p95:.3}; max_frame_ms={max:.3}; observed_game_ticks={}; simulated_seconds={:.6}",
        frames as f64 / elapsed,
        snapshot.ticks - first_tick,
        (snapshot.ticks - first_tick) as f64 * 0.016,
    );
    commands
        .spawn(Screenshot::primary_window())
        .observe(save_to_disk("build/native-window.png"));
    smoke.finished = Some(now);
}

#[derive(Resource)]
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
                "native tick phases: tick={tick}; game_step_ms={runtime:.6}; snapshot_ms={publish:.6}"
            );
        }
    }
}
