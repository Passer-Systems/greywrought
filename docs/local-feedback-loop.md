# Local feedback-loop checkpoint

This checkpoint speeds up warm host validation and checked source transfer.
It does not close steady frame pacing or simulation-time versus wall-time work.

## Hardware browser timing

### Travel avoidance and combat readouts

The same source, 1280×900/DPR1 hardware renderer and six-CPU scope exposed a
new movement cost after adding swept-footprint avoidance. Display stayed near
59.5 FPS, but Clause 29604b8 advanced only .322 source seconds per wall second
while moving. The four-case native travel fixture passed in 8.11s under sampling;
allocation/free operations dominated the 1642 samples. Native call stacks were
not usable, so the profile establishes allocation cost, not exact caller shares.

Clause 6dad877 removes intermediate query expression copies. Clause d6d2511
also keeps retained explanation expressions as exact coordinates in the shared,
immutable checked program. Recorded values, reads, expression rendering and
evaluation order are preserved; no source rule, timestep or exhaustion limit
changed. Focused query/collection/intervention checks and the retained-expression
sharing/lifetime check passed.
The rebuilt native/Wasm consumer and checked host staging passed. Its full
hardware browser journey passed selection, occupied/blocked orders, avoidance,
Stop/replacement/arrival, command feedback, combat, victory, retry and defeat.

| Clause pin | Candidate median: ready / moving / active (ms) | Source/wall: ready / moving / active |
| --- | --- | --- |
| 29604b8 | 4.6 / 36.4 / 8.3 | .987 / .322 / .564 |
| 6dad877 | 3.3 / 32.3 / 6.4 | 1.005 / .369 / .684 |
| d6d2511 | 3.4 / 10.3 / 5.9 | 1.001 / .815 / .991 |

Movement's candidate median falls 71.7% across the two changes, but its clock
still lags about 18.5%. Admission medians remain about 6.1–6.4ms and movement
candidate p95 is 15.1ms. Ready and active clocks are nearly real-time at this
bounded load. These are matched short windows, not arbitrary-map scaling
evidence. Checked edits remain 3324.4/3001.1/3043.9ms on d6d2511, including
1598.0–1662.5ms native compilation and 1224.1–1468.8ms transfer; edit latency
has not materially improved.

The active window follows a fixed 2.5-second movement window. Faster runs reach
their destinations sooner, so active samples contain different amounts of
remaining travel; they compare the same input recipe, not identical per-tick
positions or an isolated combat algorithm.

Raw observations: greywrought:build/measurement/travel-combat-readouts.json,
greywrought:build/measurement/travel-borrowed-expressions.json,
greywrought:build/measurement/travel-shared-program.json and
greywrought:build/measurement/movement-native.perf. Use the existing hardware
measurement command below with a fresh output filename. Browser-worker profiling
did not establish a usable attached session; no worker profile or caller-level
claim is supplied by that failed diagnostic attempt.

### Shared-readiness scheduling comparison

Adding source-owned Attack/Heal/Ward readiness exposed broad joins being run
before keyed matches and cheap guards. With the same feedback source, hardware
renderer, viewport and six-CPU scope, Clause 4634bec produced candidate medians
of 64.0/67.2/63.0ms in ready/moving/active windows, advancing only
0.216/0.205/0.221 source seconds per wall second. Clause 29803f2 schedules keyed
matches and available total guards first; the matched medians became
3.8/5.3/7.0ms and clock ratios 0.999/1.001/1.001. Rendering stayed near 59 FPS.
No timestep, exhaustion bound or readiness rule changed for this comparison.

Raw observations: greywrought:build/measurement/readiness-before-specialization.json
and greywrought:build/measurement/readiness-after-scheduling.json. Checked-edit
samples were 1346.4/1199.2/1155.4ms before and 1281.8/1104.2/1062.7ms after;
these remain small sequential samples, not a scaling or universal speed claim.
The matched browser journey then passed targeting, movement, readiness,
cooldowns and combat through victory. Later Ignite and processed-order feedback
add a different workload and are not part of this paired result.

With complete Ignite readiness and processed-order reports on Clause 4ddbf0e,
the same hardware driver measured 59.5/59.2/59.3 FPS, candidate medians of
4.6/5.6/8.4ms, and clock ratios 0.981/1.001/0.906. The active window retains
about 9% clock lag; the functional cooldown/combat journey passed, but larger
load is not established. Checked edits took 1762.2/1610.5/1565.0ms. This larger
source's compile/transfer cost remains open optimization work. Raw:
greywrought:build/measurement/complete-command-feedback.json.

The later hardware-GPU run establishes a materially different baseline from
forced software rendering. On the same six-CPU scope and compiler pin, Chrome
used the AMD Radeon 890M through ANGLE/radeonsi. The ready/movement/active windows
rendered 59.01/59.24/59.08 FPS. Contiguous admitted fixed ticks advanced
1.0012/0.9895/0.9944 source seconds per worker wall second. This calculation
uses the worker's timestamps, not the number of delayed messages received
during a main-thread observation window.

Three checked edits took 730.30/608.80/527.10ms. These are a different renderer
condition, not an additional measured product optimization. Raw observations:
greywrought:build/measurement/m5-hardware-before.json.

The real Ignite journey also passed on that hardware renderer: nominal
1.5/3s effects expired after 1547/3050ms wall time, with distinct occurrences,
independent expiry and the same 100→68.5 target-health result. No simulation
timestep or rule was changed. The severe earlier slowdown is reproduced under
the forced software-rendering test conditions, not established on this hardware
path. Performance under heavier effects or prolonged load remains unmeasured.

From the game checkout in the existing Bun environment, inside an admitted
browser capacity scope:

```sh
GREYWROUGHT_MEASUREMENT_RENDERER=hardware GREYWROUGHT_MEASUREMENT_OUTPUT=build/measurement/m5-hardware-before.json bun run measure:rts
GREYWROUGHT_BROWSER_RENDERER=hardware bun run test:rts-created-burn
```

Both reject software fallback in hardware mode. The burn journey additionally
checks wall-clock expiry bounds; its default software mode retains the original
correctness checks without claiming a hardware timing budget. Preserve distinct
output filenames when taking another measurement.

## Development commands

`bun run typecheck:host` checks against existing staged declarations without
rebuilding/staging Wasm. `bun run build:host` retains the complete staging,
source-pin and Wasm-hash checks. `bun run build:play` runs native and browser
builds concurrently with separate Cargo targets. The full parallel build passed.

Three warm host-check samples in the same pinned development environment and
six-CPU scope: 2775.84/2763.30/2757.90ms before, then
2061.01/2054.50/2052.43ms after. Median reduction is 25.65%. An intermediate
two-CPU sample is not comparable and is excluded. This is warm validation, not
a cold compiler build or a UI hot-reload measurement.

`bun run play:local` reuses built artifacts and starts/reuses the local server
and both watchers. Repeated start preserves the server; `--restart` replaces it
and requires a browser refresh. Start, reuse, restart and the owned-generation
endpoint were checked. The launcher recreates services after reboot.

## Checked browser edits

Before pin: `a619c44c2a601648530b83e6cd2b8d5a5bf0be7d`.
After pin: `313e27e151997f6d8d39b37331450d2185d95054`.
Chrome 152, 1280×900/DPR1, forced SwiftShader, six-CPU/8GiB scope, same encounter
and the same three attack edits. This is not normal hardware-GPU FPS evidence.

| Observation | Before samples (ms) | After samples (ms) |
| --- | --- | --- |
| Click to visible checked edit | 2299.30, 2012.90, 1807.40 | 1999.00, 1594.80, 1503.40 |
| Worker-reported transfer | 1309.00, 1084.80, 908.70 | 997.70, 691.50, 611.10 |

Visible-edit median decreased 20.77%, from 2012.90 to 1594.80ms. Transfer median
decreased 36.25%, from 1084.80 to 691.50ms. Native compilation still took about
689ms median afterward, so it and the browser's transfer are now comparable
remaining costs. These small sequential samples are not CPU-isolated estimates.

Clause's matched no-renderer Bun transfer fixtures show larger reductions,
90.77%/86.81%, from removing expensive frozen numeric-array custody and unused
blob copies. Do not present those as browser-visible reductions. Exact wire
bytes, immutable custody and runtime checking are preserved.

The real M4 journey passed on the new pin: same-page edit, preserved world,
numeric 9→-173 explanation, minimum-five intervention and bounded exhaustion.
Ignite also passed independent created identities, damage and expiry. Its
latest wall-clock expiry sample was 3797/7523ms for nominal 1.5/3s effects;
simulation speed is still unresolved. Software-rendered windows remained about
2–3fps, with large scheduling tails and an initial queued-message burst.
Received receipt counts must not be mistaken for an exact simulation clock.

Raw browser observations are in greywrought:build/measurement/m5-baseline.json
and greywrought:build/measurement/m5-immutable-bytes.json. Set
`GREYWROUGHT_MEASUREMENT_OUTPUT` when running `bun run measure:rts` to preserve
an earlier result. The driver imports the authoritative pin; the first report's
old hardcoded label was corrected from the independently verified build without
changing its measurements. Next: attribute remaining costs in the actual
browser and address simulation scheduling/frame work, without skipping checks.
