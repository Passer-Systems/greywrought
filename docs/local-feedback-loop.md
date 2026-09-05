# Local feedback-loop checkpoint

This checkpoint speeds up warm host validation and checked source transfer.
It does not close steady frame pacing or simulation-time versus wall-time work.

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
