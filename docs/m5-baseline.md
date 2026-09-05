# Milestone 5 baseline

This tracked note records the reproducible baseline measurement on the exact
Milestone 4 encounter. It is not a completed comparison or a claim that Clause
is faster, cheaper, or universally preferable.

Run after `bun run build:play`:

```sh
CHROME_PATH=/path/to/chromium bun run measure:rts
```

The driver launches one development server and one blank Chromium tab, then
navigates once to the game at 1280×900/DPR 1 with SwiftShader. Timing is enabled
only by `?measure=1`; browser retention is capped at 4096 events. After a 2 s
warm-up it captures fixed 2.5 s ready, normal-input movement, and active-encounter
windows. Raw lifecycle, rAF, projection/HUD and transport observations plus
summaries are written to ignored `build/measurement/m5-baseline.json`.

The same live page then applies three compiler-selected scalar expression edits
through the ordinary Battle workshop, alternating one-times and two-times party
damage. The artifact separates native-reported compilation, Wasm continuity
transfer, and click-to-first-admitted-visible time. No renderer, DPR, world rule,
or 16 ms simulated tick is changed for measurement.

## Observed baseline

The accepted run used Headless Chromium 152, ANGLE Vulkan SwiftShader, the
unchanged scene, 1280×900/DPR 1, and cgroup
`/user.slice/user-30033.slice/session-816.scope`: CPU quota 200000/100000 (two
CPUs), memory high/max 3/4 GiB, and 256 tasks. The browser reported four host
logical CPUs; the cgroup quota, not that report, was the execution limit.

| 2.5 s target window | Actual ms | rAF intervals ms median/p95/max (n) | Projection→HUD ms median/p95/max (n) | Candidate ms median/p95/max (n) | Admission ms median/p95/max (n) | Steps/s |
| --- | ---: | --- | --- | --- | --- | ---: |
| Ready | 2604 | 2149.9/2149.9/2149.9 (1) | 0.4/1.1/34.1 (143) | 1.2/2.8/44.1 (144) | 7.5/54.2/68.4 (143) | 55.30 |
| Moving | 2562 | 1516.6/1583.3/1583.3 (3) | 0.7/1.6/44.3 (78) | 2.4/48.9/56.3 (79) | 10.1/64.7/69.0 (78) | 30.84 |
| Active encounter | 2580 | 1783.3/1783.3/1783.3 (1) | 0.6/0.8/1.3 (78) | 1.7/11.5/53.1 (78) | 11.4/62.6/72.9 (78) | 30.23 |

Observed rAF callback rates were 0.38, 1.17, and 0.39 per wall second. The tiny
sample counts are themselves the result: software rendering of this unchanged
scene missed the labeled 16.67 ms aspiration by roughly two orders of magnitude.
This host therefore does not establish hardware-GPU frame behavior. The fixed
tick is 16 ms (62.5 intended simulated steps per second), but only 30.23–55.30
candidate requests per wall second completed. Main-thread projection/HUD work
was 0.8–1.6 ms at p95; Ready/Moving had 34.1/44.3 ms maxima. Worker to main
transport was 0.6 ms at median in Moving/Active, but Ready backlog median/p95/max
reached 564.8/1730.2/1835.4 ms. Candidate evaluation and especially Admission tails—not the
ordinary HUD projection—are the measured semantic steady-state cost to inspect.

Three changed source operations ran in one open battle, alternating
`0.0 - ?damage` and `0.0 - (?damage * 2.0)`:

| Generation | Click→first visible ms | Native compile ms | Wasm transfer ms |
| --- | ---: | ---: | ---: |
| 1→2 | 6186.0 | 1629.437 | 4011.5 |
| 2→3 | 5082.4 | 1604.547 | 3002.5 |
| 3→4 | 4836.2 | 1422.882 | 3009.1 |
| median (n=3) | 5082.4 | 1604.547 | 3009.1 |

For live editing, Wasm continuity transfer is the dominant measured component,
larger than native compilation in all three observations. Small `n=3`, warm
cache/order effects, diagnostic tracing, headless scheduling, and SwiftShader
are material limitations. The raw 675627-byte JSON retains every sampled event,
actual window duration, edit direction/generation, exact conditions, cgroup
limits, and the normal-input replay slice under
`build/measurement/m5-baseline.json`.

The M4 rule-change effort demonstrated here remains narrow: one exact effect
chosen from the compiler catalog, one expression changed, and native/runtime
witnesses checked. It required no gameplay fact or handler change in TypeScript.
That is a parameter edit, not evidence for the effort to add a new mechanic.

The next owning performance work is (1) profile/reduce Wasm live-source transfer
and Admission tail cost in Clause without weakening continuity or diagnostics,
and (2) evaluate the same renderer scene on representative hardware before
attributing the severe SwiftShader rAF result to product rendering. A fair
conventional comparison must use the retained input/state/output slice in an
isolated artifact, never a second Greywrought engine. That comparison, actual
new-mechanic authoring effort, collections, recursive relations, reusable
definitions, specialization, and a non-game consumer remain open. No language
superiority or fairness result is claimed.
