# Native scaling check

Measure 100 visibly moving actors at >=59 FPS, p95 frame interval <=20 ms,
and fixed-step simulation within 5% of wall time. Keep the workload moving for
the measurement interval and record actor count, duration, frame samples,
simulated ticks, renderer and device. A responsive camera or scene-submission
timestamp alone does not prove displayed frame performance.

The previous expression-edit workload ended with removal of its editor. It
is not a passing measurement of this game, and must not be renamed as a Rust
performance result. The current scaling claim is rendering plus real-time
fixed-step gameplay. Do not enlarge or omit simulation ticks to meet it.

Keep private measurements under `greywrought:build/`. The assembled native
window owns the measurement; library tests alone cannot establish frame rate.
