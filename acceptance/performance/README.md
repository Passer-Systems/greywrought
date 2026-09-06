# 100 active company members

Greywrought's unchanged encounter rules run against 100 complete company members.
The Clause fixture replaces the five original units' initial facts and adds 95
units; it does not replace any handler, movement speed, collision rule, timestep,
or source-clock rule. Every member starts moving with a positive action cooldown.
The harness requires all 100 admitted positions and cooldowns to advance, hardware
rendering at least 59 FPS with a frame-interval p95 at most 20 ms, source time
within 5% of wall time, and all three identity-preserving checked edits within
250 ms. These are combined requirements, not interchangeable scores.

From the owned Greywrought checkout, after staging its exact pinned artifacts:

```sh
nix shell --offline nixpkgs#bun --command bun \
  ~/.agents/skills/machine-capacity-distilled/scripts/machine-capacity.mjs \
  run --class heavy --owner codex:/root/grey_perf --timeout-seconds 300 -- \
  bun "$PWD/acceptance/browser/rts-100-active.ts"
```

The source-check executable must be built from the consumer's current immutable
Clause pin at `greywrought:build/clause-authoring-target/debug/clause-workbench`.
The harness uses isolated ports 4196/9262 and never starts the local play service.
Use `--write-fixture` to assemble the exact source counterexample without launching
the source checker or browser. Individual evidence is retained under
`greywrought:build/measurement/100-active.json` and the corresponding source-check
and failure artifacts. The browser's measurement-only projections retain typed
unit references for checking each actor's continuing occurrence across edits.

## Observed boundary, 2026-09-06

The combined hardware run reached its final verdict at Greywrought base
`5bdc0e83458a52764285a40a005f35b595ec3d8e` with Clause pin
`e8a385f7d699226320da9369cd2761603de53641`. Chrome 152 rendered through the AMD
Radeon 890M at 1280×900 inside the declared six-CPU, 8 GiB measurement scope.
The freshly built pinned source checker admitted the exact 100-unit fixture in
7,115 ms; its CPP1 was 3,801,115 bytes and its CWR1 was 3,902,561 bytes.

The 2.5-second combined window projected and advanced all 100 cooldowns, while
98 positions moved. It recorded 11.00 FPS, a 283.3 ms p95 frame interval, a
0.00628 median source-seconds-per-wall-second ratio, and one 2,474.3 ms candidate.
Admission took 73.0 ms. These miss the active/moving, rendering, and real-time
requirements rather than demonstrating a 100-actor target.

All three checked edits completed and preserved all 100 actor occurrences after
flattening the continuity map's declared 64-entry pages. Their visible latencies
were 15,819.9, 16,206.3, and 16,348.2 ms. Native compilation alone took
5,259.2–5,278.3 ms and Wasm transfer took 5,305.0–5,675.7 ms, so the 250 ms edit
requirement also fails independently of the corrected continuity proof.

The exact raw artifact remains at `greywrought:build/measurement/100-active.json`;
the source-check and last failure snapshot remain beside it. Build output is
ignored, so this summary is the tracked evidence. The run required generic Clause
repairs for projection capacity, session envelopes, CET1 transport, and the
complete 2,335,143-byte continuity map; none of the acceptance thresholds or the
100-member fixture was weakened.

## Performance-reuse integration, 2026-09-06

The integration consumes immutable Clause commit
`370734d16827eea26544a2616d9275d977a07670` and Wasm SHA-256
`d40349190b1f59308e6ea3e859142e3624ea24bb96ea40b95ad3f098af112154`,
on Greywrought parent `08579816fdede04541915609a4e59915a4c11f72`.
The profile records reusable-definitions base
`9236c1c797820c46ebab2e60cb96a4255fab73c5`.

### Candidate-only evidence is not the combined gate

The retained historical matched pair measured **2,521.4 → 1,325.5 ms** per
candidate: 1,195.9 ms (47.43%) less elapsed time. The previously reported
2,567.0 ms before value is an unretained console observation, not the baseline
used for this calculation. The raw pair is retained at
`~/code/greywrought/worktrees/perf-attribution-sol-20260906/build/measurement/100-active-profile-first-pass.json`
and
`~/code/greywrought/worktrees/perf-attribution-sol-20260906/build/measurement/100-active-profile.json`.
Both record Chrome 152, AMD Radeon 890M/ANGLE, 1280×900 DPR 1, hardware rendering,
six CPUs and an 8 GiB memory-high scope, a 16 ms tick, 1,000 ms warmup, and fixture
SHA-256 `66b5e11e264edf4011665b25e91a3ca01c8922a84806777c53cc0e70cfcdc9ac`.
Both retained files label Clause pin `e8a385f7d699226320da9369cd2761603de53641`
and Greywrought base `a27abec0cc313bd57064e4ebef14c4f3c0336e41`; those labels
do not independently identify the historical treatment build. This is a
single-sample comparison, not a statistical or end-to-end acceptance result.

The newly integrated `--profile --candidate-only` run passed its profile-capture
check and recorded **1,872.5 ms** candidate wall time, with 22,350.6 ms from
driver start to artifact and 8,047.5 ms for source admission. Its hardware,
viewport, tick, warmup, and capacity limits match the above, but its source
SHA-256 is `55ad8c51649933c8fbb2f3f6e133b5d470a021090bba4d44075826cf6128e949`
and its pin is the new immutable commit. It is therefore not a matched causal
comparison with the earlier fixture. No checked edits run in candidate-only mode.
The raw profile is retained at
`~/code/greywrought/worktrees/perf-reuse-integration-20260906/build/measurement/100-active-profile.json`.

The initial candidate attempt stopped before the browser journey because the
lane lacked its native resident executable. Building that prerequisite with
Rust 1.96.1 took 1m 33s; unchanged Wasm and host build gates were not rerun.
The prerequisite failure and command logs remain in the lane's ignored
`greywrought:build/measurement/` output. No performance threshold was changed.

### One new full hardware journey

The full run completed in **76,137.4 ms** to its artifact and failed all four
combined gates. Source admission passed in 8,713.7 ms. The actual observation
window lasted 2,533 ms, with 100 projected actors and 100 advancing cooldowns,
but only 98 moving positions. Rendering measured **4.737 FPS** with a **916.7 ms**
frame-interval p95. Median source-seconds per wall-second was **0.0063166**.
One admission took 101.8 ms; no complete candidate request/production pair fell
inside this window, so it supplies no candidate-runtime duration sample.

| Checked edit | Visible latency | Native compiler | Wasm transfer | Carried identities |
| --- | ---: | ---: | ---: | ---: |
| Double cooldown advance | 18,784.9 ms | 7,816.8 ms | 6,915.0 ms | 100/100 |
| Restore cooldown advance | 16,478.3 ms | 6,351.3 ms | 6,105.6 ms | 100/100 |
| Double cooldown advance again | 14,383.6 ms | 5,249.9 ms | 5,530.5 ms | 100/100 |

Continuity passed independently on all three edits; their latency did not meet
250 ms. The 100-moving-actor, 60-FPS aspiration (existing ≥59 FPS/p95 ≤20 ms
gate), real-time ±5%, and edit-latency requirements remain unchanged and unmet.
This is evidence of a remaining performance boundary, not completed 100-actor
acceptance or a workaround for it.

This run used the same integrated fixture, hardware, and six-CPU/8 GiB scope
as the candidate run. Admission also recorded another heavy lease; resource
contention was not isolated or diagnosed. The full driver's historical
`baseCommit` label remains `5bdc0e83458a52764285a40a005f35b595ec3d8e`; the actual
integration parent and pin are recorded above. No second full journey was run.
Raw evidence and its failure snapshot remain at
`~/code/greywrought/worktrees/perf-reuse-integration-20260906/build/measurement/100-active.json`
and
`~/code/greywrought/worktrees/perf-reuse-integration-20260906/build/measurement/100-active-failure.json`.
These ignored artifacts and the candidate/full command logs are retained; this
tracked summary is not a claim that raw measurements are published with Git.
The driver's transient browser/server exited, its capacity leases were released,
and ports 4196/9262 were free afterward. No live play service was changed.
