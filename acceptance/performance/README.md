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

## Sum-query reuse, 2026-09-06

The next candidate-only capture uses Greywrought base
`dde9baa994685c18330ca316a0d4843652c2584f` and exact Clause pin
`20fc2fd3080c1e413d23323e10b5f619f71721eb`. Clause reuses only successful,
structurally identical sum queries with equal evaluated inputs inside one
immutable expression evaluation; it replays the ordered reads and always
reevaluates inputs. Nothing survives a later state, expression evaluation, or
step. The focused 100-row native regression retained equal values and ordered
reads while reducing 672 actual queries to 84 (483.881 ms before; 94.692 ms after).
Different inputs, changed state, and type errors remained distinct; all three
existing source-profile tests passed.

The browser command was exactly `--profile --candidate-only`; no full journey
or checked-edit measurement was repeated. Current and preceding captures share
source SHA-256
`55ad8c51649933c8fbb2f3f6e133b5d470a021090bba4d44075826cf6128e949`,
CPP1 SHA-256 `d09c526be213796c8eaddb586700c4db4fac2e22b24e586fce8fd9f5ba52e21a`,
Chrome 152, AMD Radeon 890M hardware rendering, 1280×900, DPR 1, 16 ms fixed tick,
and the six-CPU/8 GiB scope. The driver still reports its historical source-base
commit `9236c1c`; the actual checkout base is the `dde9baa` commit above.

| Candidate observation | Preceding capture | Sum-query reuse |
| --- | ---: | ---: |
| Wall time | 1872.5 ms | 1638.2 ms |
| Prepared steps | 25 | 25 |
| Effect-value evaluation | 1420.1 ms | 1308.5 ms |
| Sum evaluations | 672 / 1410.1 ms | 672 / 1279.8 ms |
| Actual sum queries | 672 (uncached implementation) | 624 / 1217.2 ms |
| Derivation closures | 50 / 235.9 ms | 50 / 159.7 ms |

This capture eliminated 48 repeated queries (7.14%). Its wall sample is 12.51%
lower, but concurrent capacity leases were present (eight CPUs/9728 MiB already
leased at admission), so this is not an isolated causal timing comparison.
The remaining 624 queries account for 1217.2 ms, about 74.3% of candidate wall
time; per-expression reuse leaves that owning cost open. The combined real-time,
rendering, actor-progress, and checked-edit gates remain unproven here.

Raw current evidence is retained at
`~/code/greywrought/worktrees/sum-eval-20260906/build/measurement/100-active-profile.json`
and `~/code/greywrought/worktrees/sum-eval-20260906/build/measurement/sum-candidate-profile-run.log`.
The preceding capture is
`~/code/greywrought/worktrees/perf-reuse-integration-20260906/build/measurement/100-active-profile.json`.
The exact Wasm digest is
`c604df17c72b242911a3dfbb22095b7faa21affbb57eeb5be039769b809e3f32`.
The native checker, resident release, and Wasm release builds took 27.88 s,
93 s, and 65 s respectively with Rust 1.96.1 and wasm-bindgen 0.2.108.
The source check passed in 6989.0 ms; the complete candidate-only artifact took
17,702.6 ms. Host typechecking and exact pin/digest verification passed.

## Historical preparation-local query reuse, 2026-09-06

This evidence is retained from `c44663b5c537f59c6423a405491b7a40afcd5839`.
It measures the older source/compiler pairing, not the current native-desktop
line or its forward compiler pin. No benchmark of that newer line follows from
these timings.


Native grouping of the preceding exact 100-actor fixture found all 624 query
misses inside one preparation (entry 5, step 1, configuration ordinal 1), on
one immutable pre-state. There were 208 exact state/query/evaluated-input keys,
each executed three times; no key repeated across separate probes. This selects
reuse across that preparation's separately evaluated effects, without sharing
across probes or states.

Clause commit `c14ef0408ddf13385e322c4302f512ac7a79ce4d`, directly based on
consumer pin `20fc2fd3080c1e413d23323e10b5f619f71721eb`, supplies the existing
successful-query cache to the effect contexts of one preparation. Its post-effect
closure retains the original uncached context. Input evaluation, effect order,
ordered read replay, query-local visits/errors, and occurrence identity remain
unchanged. The focused native regression checks accepted and rejected searches,
exact read order, independent errors, and fresh cache scope for each preparation.
It passed; the exact native consumer retained 672 sums and 25 preparations while
executing only 208 queries. The consumer candidate took 3596.301 ms in the debug
native build; diagnostic grouping timings are not comparable with browser timing.

The single browser capture used `--profile --candidate-only`, Greywrought checkout
base `997b013d274e256a148fa2e838ec522daf1ea6fa`, and that exact Clause commit.
The fixture/source and CPP1 hashes, Chrome 152, Radeon 890M hardware rendering,
1280×900/DPR 1, 16 ms tick, and six-CPU/8 GiB limits match the preceding capture.
The driver still carries its historical `9236c1c` source-base label. The unchanged
source SHA-256 is
`55ad8c51649933c8fbb2f3f6e133b5d470a021090bba4d44075826cf6128e949`;
CPP1 SHA-256 is `d09c526be213796c8eaddb586700c4db4fac2e22b24e586fce8fd9f5ba52e21a`.

| Candidate observation | Expression-local reuse | Preparation-local reuse |
| --- | ---: | ---: |
| Wall time | 1638.2 ms | 1066.3 ms |
| Actual sum queries | 624 | 208 |
| Sum-query time | 1217.2 ms | 435.5 ms |
| Sum evaluations | 672 | 672 |
| Inclusive sum time | 1279.8 ms | 726.6 ms |
| Other sum evaluation time | 62.6 ms | 291.1 ms |
| Prepared steps | 25 | 25 |
| Effect-value evaluations | 900 | 900 |
| Occurrence identities | 600 | 600 |
| Derivation closures | 50 / 159.7 ms | 50 / 172.5 ms |

The repair eliminates 416 repeated query executions. This run had only two agent
leases at admission (two CPUs/1536 MiB already leased); the preceding capture had
concurrent heavy work. The lower wall sample therefore is not an isolated causal
speed ratio. The remaining 208 queries cost 435.5 ms; another 291.1 ms remains
inside sum evaluation outside query execution. The profile does not separate
lookup, input evaluation, or read replay within that overhead. Full real-time,
rendering, actor-progress and checked-edit gates were not rerun or established.

Raw evidence remains at
`~/code/clause/worktrees/sum-probe-reuse-20260906/target/sum-probe-evidence/`
(grouping patch/source, raw rows, grouped counts, focused and consumer native logs)
and
`~/code/greywrought/worktrees/sum-probe-reuse-20260906/build/measurement/100-active-profile.json`
with its corresponding `preparation-candidate-profile-run.log`.
Native focused/consumer rebuilds took 3.63 s and 4.41 s, with tests taking less
than 0.01 s and 10.33 s. Resident and Wasm release builds took 94 s and 65 s,
using Rust 1.96.1 and wasm-bindgen 0.2.108. The exact native checker was copied
from the rebuilt Clause lane. Source admission passed in 6967.5 ms; the complete
candidate-only artifact took 17,248.6 ms. Host typechecking and pin/digest checks
passed. Wasm SHA-256 is
`cf4f650aea4973878d1d101a5bef40009fd7446e72fb1a5e25d10cf759286236`.


## Forward integration into the native-desktop line

The current source line based on `8e7300fd4f1b8010e9949819fc265ecf17eb3a5b`
consumes forward Clause commit `6d2bec247448c17bf65670bc098a0888f8c53b55`,
not the older compatible backport measured above. Native desktop and resident
builds, all five currently consumed source checks, the focused single-unit
movement test, host typechecking, and exact Wasm pin/digest verification passed.
The native host, migrated source and dependency lock remain unchanged.
The current Wasm digest is
`29fdc4b6235c45567d49054e94695ae1e1deb4e036e728b6b6c2937c6c8f89bc`.
Details and build timings are in `greywrought:docs/native-desktop.md`.
No browser profiling, full 100-actor journey, or checked edits were repeated;
the historical timings above do not establish current-line performance.

## General-handler compiler adoption, 2026-09-06

The unchanged current company source, from Greywrought parent
`46e70b79cfaa704d098333706e323b42987a8704`, now consumes published Clause
`a489dfe0de882317e14dfa03c22273fe118826f7`. This removes the specialized
jump/tick carrier, groups the declared tick event through the general handler
path, and preserves the independent typed-input repair. No actor count,
world rule, timestep, assertion, or acceptance threshold changed.
The exact published compiler's tracked Wasm was reused, SHA-256
`1d014482c399f987019a3403952209d3297edac6c492580d0c7405b93095fc1a`.
The native checker rebuilt in 26.64s and resident release in 97s. Host adapters,
bundles, typechecking, and exact source-pin/Wasm-digest checks passed. The only
lockfile change adds the compiler substrate's declared package dependency;
no dependency version changed.

### Current candidate-only capture

The candidate capture took 16,438.8ms end to end, including source admission
in 6,974.8ms. One candidate took **842.3ms**. Its profile reports one
preparation, 686 sum evaluations, 210 actual sum queries (428.0ms), and 303.5ms
inside sum evaluation outside query execution. Two derivation closures took
7.5ms. Sum evaluation remains the measured dominant boundary; this is not
real-time acceptance or an attribution of its remaining internal cost.

Both new captures use Chrome152, Radeon890M/ANGLE hardware rendering,
1280x900/DPR1, 16ms source ticks and 1,000ms warmup. Their exclusive capacity
scope actually supplied **18 CPUs / 16GiB memory-high**, unlike the older
6CPU/8GiB captures. Their source SHA-256 is
`6e5754201bfdc63a0d71a80333967de18f8f9fb18aa927824992662e3f784ad2`;
CPP1 SHA-256 is
`1ce073011c93b67e45c5cc25e82b979ce486a871de0c181be7152a43e532273b`.
The source and compiler have advanced since historical timings, so no matched
causal percentage follows. The driver's historical `baseCommit` labels remain
unchanged; the actual consumer parent is stated above.

### One full hardware journey

The full journey reached its verdict in **62,700.3ms**. All four combined
performance gates still fail: 100 actors were projected and all 100 cooldowns
advanced, but 98 positions moved; rendering was **10.224 FPS**, frame-interval
p95 **150ms**, and median source-seconds/wall-second **0.0188753**. Three
candidate durations had median 785.9ms; admission median was 88.1ms.

| Checked edit | Visible latency | Native compiler | Wasm transfer | Carried identities |
| --- | ---: | ---: | ---: | ---: |
| Double cooldown advance | 14,478.5ms | 5,550.1ms | 5,989.5ms | 100/100 |
| Restore cooldown advance | 13,742.5ms | 5,292.7ms | 5,553.0ms | 100/100 |
| Double cooldown advance again | 13,117.7ms | 5,339.0ms | 5,589.1ms | 100/100 |

All three edits completed with identity continuity, but none meets 250ms.
The 100-moving-actor, ≥59FPS/p95≤20ms, real-time ±5%, and edit-latency gates
remain unchanged and unmet. No second full journey was run.

Raw profiles, full results, failure snapshot and command logs remain under
`~/code/greywrought/worktrees/preparation-reuse-grey-integration-20260906/build/measurement/`:
`greywrought:build/measurement/100-active-profile.json`,
`greywrought:build/measurement/100-active.json`,
`greywrought:build/measurement/carrier-candidate-profile.log`, and
`greywrought:build/measurement/carrier-full-journey.log`.
These ignored artifacts are retained locally, not published by this summary.
The harness-owned temporary browser/server exited. Live services, installed
native artifacts, saved worlds, dirty main and separate creature-game lanes
were untouched.

The same company candidate also passed native desktop compilation (130s) and
its existing native journey: five actors, selection, attack 100→9, checked
scalar edit 1681ms, stale-handle rejection, identical admitted projection on
scratch-save reopen, and continued input/tick (2397ms total; 2.59s build).
This did not open or modify an installed save and does not assess the separately
published creature experience. Its newer native integration retains its owner's
compiler pin; the benchmark candidate remains in the named owned lane rather
than silently repinning that independently integrated game.

## Current-main recovery integration, 2026-09-07

Greywrought parent `683b34a8647cd1eaca7e9d0d7ae14feb040e74f9` now consumes
Clause `4fb4648a14311dec25b247912b2ccad961825c1b`, including the preserved grouped
scalar/vector initial-state fixes and sum-cache comparison order on current main.
Fresh Wasm SHA-256 is
`6404a3428714e871ac7715d6c6b1ce511fb5739249d1d48986970c615f6c5800`.
Native law-edit byte consumers use the current projection export method.
The embodied source check, source/Wasm pin checks, adapter, host typecheck and
bundles, resident release build, and existing native law-edit behavior test pass.

One unchanged full hardware journey reached its verdict in 63,117ms. All four
combined performance gates remain unmet: 100 cooldowns advanced, 98 positions
moved, rendering measured 9.31 FPS with 150ms frame-interval p95, and median
source-seconds/wall-second was 0.04965. The stationary actors were company-92
and company-93. Candidate median was 221.7ms (nine samples); Admission median
was 74.3ms (eight samples).

| Checked edit | Visible latency | Native compiler | Wasm transfer | Carried identities |
| --- | ---: | ---: | ---: | ---: |
| Double cooldown advance | 14,180.7ms | 6,262.8ms | 6,190.5ms | 100/100 |
| Restore cooldown advance | 13,779.4ms | 6,155.2ms | 5,794.2ms | 100/100 |
| Double cooldown advance again | 14,005.0ms | 6,282.1ms | 5,942.9ms | 100/100 |

One existing profile journey then passed its capture and continuity checks.
Its candidate took 258.4ms: 686 sum evaluations consumed 230.0ms, including
210 actual sum queries consuming 221.5ms. The 8.5ms outside query execution
selects actual sum-query execution as the next runtime optimization seam.
The profiled edit took 14,533.8ms; its Wasm witness check took 3,359.1ms,
including old/new elaboration at 993.2/953.4ms and offered-edit checking at
679.6ms. Native compilation separately took 6,309.4ms. These observations do
not identify the internal cause of those remaining costs.

Both captures used Chrome152, Radeon890M/ANGLE hardware, 1280x900/DPR1, the
unchanged 16ms tick and 1,000ms warmup, and six-CPU/8GiB capacity scopes.
The admission reports recorded seven peer agent CPUs and zero CPU pressure;
the runs were not globally isolated. Source SHA-256 was
`4d3a8bb190c897b35b9e7e0a9b548b926892c52da381c848f442c5954471da70`;
full-run source admission passed in 7,216ms. The source and compiler differ
from historical runs, so these are current observations, not matched causal
percentages. The driver's historical base labels remain unchanged; the actual
consumer parent is recorded above.

Raw full/profile results and the full-run failure snapshot are retained under
`~/code/greywrought/worktrees/recovery-integration-20260907/build/measurement/`.
The full command exited 1 at its unchanged performance assertion; the profile
command exited 0. Both harness-owned browser/server runs settled.

### Shared aggregate join prefixes

Clause `756895f60879e8e06cfe59b6a7cc4adb2cb2c040` reuses the leading
argument-independent relation joins across sum queries in one immutable
pre-state. Ordered bindings, reads, rejection counts, and logical visit counts
are retained. Nine focused relational tests pass, including changing-input,
floating-point sum-order, trace-mode, empty-prefix and rejection-limit cases.
Only the runtime matcher changed; the world source and compiler lowering did not.

Greywrought parent `a79b12a12382587137aba39eec34be59ae475bb2` consumes this pin
with freshly built Wasm SHA-256
`196eac9b97c9bae5bab17896112f71362ec481d5417fa5959019540f5e984baf`.
The native checker and resident executable were rebuilt from the same pin,
and the pin/hash checks passed before staging the browser artifact.

One changed-artifact hardware candidate profile passed in 16,006ms, including
7,164ms source admission. Candidate time was 127.9ms; 700 sum evaluations took
103.2ms, including 212 actual queries taking 96.4ms. The retained preceding
profile recorded 258.4ms per candidate and 221.5ms in 210 actual queries.
Both use the same source hash, hardware, viewport, 16ms tick, warmup and
six-CPU/8GiB scope recorded above. Faster warmup reaches a different simulation
tick (700 versus 686 sum evaluations), so these are observed improvements,
not an exact matched-state causal percentage. Remaining query execution is
still the dominant candidate phase.

The new command used `--profile --candidate-only` and exited 0. It does not
reassess rendering, all-actor movement, real-time progress or checked-edit
latency; the preceding failed combined verdict remains the latest evidence
for those gates. Before/after profiles are retained in the same lane's
`greywrought:build/measurement/100-active-profile-before-prefix.json` and
`greywrought:build/measurement/100-active-profile.json`. The browser/server
commands settled and ports 4196/9262 were clear afterward.
