# Performance examination — 21 September 2026

## Snapshot transport and scenery submission (0.21.55)

Measured the current client across town, woods, lake, cave, hills, rain, movement,
camera rotation, combat planning/execution and seven entry/teardown cycles.
Server measurements used one and five actual WebSocket clients. Browser and
server samples ran separately on the same machine with bounded workloads.

The changes preserve scenery density, authored geometry, shadows, simulation
timing and combat forecasts:

- Immutable Hollowdeep rock surfaces are merged into 16-metre spatial cells.
  Baking their exact transforms also preserves the normals of stretched/sheared
  models; ordinary instancing would not. Camera collision keeps the same surfaces.
- Whole foliage cells outside the render camera's frustum are rejected before
  checking individual plants. Main and reflected views still select their own
  visible instances.
- Public enemy snapshots now explicitly select their declared fields, rather
  than copying private simulation state. Subsequent messages send only changed
  enemy fields. Each connection starts with a full snapshot; reconnects, encounter
  changes, changed enemy lists and dropped sends renew that baseline. Reconstruction
  preserves previous snapshots and replaces arrays exactly, including empty arrays.
- The server compares immutable public views using Bun's native equality helper
  instead of allocating a serialized string for every field. Combat forecasts
  serialize and clone their shared world once, retaining all state in the cache key.

The new client requests compact updates when joining. Already-open 0.21.54 tabs
continue receiving full states until refreshed. Authentication, command validation,
rate limits, backpressure controls and save format are unchanged. Browser observers
decode messages independently while forwarding raw updates to the production client,
so the browser journey exercises the real client decoder.

### Browser results

1440 × 900, DPR 1, AMD Radeon 890M, Chromium ANGLE/Vulkan. Times below are game-frame
CPU callbacks, not presented frame times. Lake/wide-view rows compare frames that
actually rendered a reflection, avoiding a misleading gain from differing reflection
schedules. The fixed wide-view phase is new; it holds the final orbit angle to make
the before/after comparison reproducible.

| Scenario | CPU median before → after | CPU p95 before → after |
|---|---:|---:|
| Town | 19.7 → 18.4 ms | 23.0 → 22.0 ms |
| Running in town | 20.4 → 17.3 ms | 23.6 → 20.1 ms |
| Woods | 15.1 → 12.4 ms | 17.9 → 15.7 ms |
| Cave | 19.1 → 16.5 ms | 21.1 → 17.8 ms |
| Hills | 13.2 → 11.4 ms | 16.3 → 14.1 ms |
| Combat execution | 21.1 → 19.3 ms | 27.2 → 22.8 ms |
| Rain | 20.6 → 19.9 ms | 26.4 → 23.2 ms |
| Lake, with reflection | 27.8 → 26.0 ms | 30.8 → 29.0 ms |
| Fixed wide woods, with reflection | 29.1 → 27.5 ms | 31.3 → 30.5 ms |

Woods draw calls fell from 259 to 146; cave calls from 309 to 186. Fixed wide
reflection frames fell from 993 to 795 calls with nearly identical submitted
geometry (2.653M → 2.649M triangles). Matched cave/woods screenshots retain the
scenery, lighting and minimap. Rendered running speed remained 5.2 m/s.

GPU improvement is not universal: fixed wide-view median/p95 improved from
13.65/15.57 to 11.86/14.35 ms, while the full-run lake median/p95 changed from
16.25/19.05 to 17.94/19.39 ms. Rotation still reaches roughly 60 ms CPU p95; these
changes do not solve every wide-view hitch or establish desktop 60 FPS. The
headless presentation limitation below still applies.

The isolated first-entry woods fixture has less visible undergrowth than the
same location after a preceding world entry, both before and after this patch.
Comparisons therefore match entry order. That existing entry-order variation
needs a separate investigation; no cause is asserted here. Long-duration memory
retention also remains unverified.

### Server results

| Five-client phase | CPU, % of one core before → after | Total wire KiB/s before → after |
|---|---:|---:|
| Running | 31.1 → 28.2 | 957 → 348 |
| Planning | 90.2 → 83.2 | 962 → 352 |
| Execution | 35.2 → 30.8 | 1,014 → 397 |

Both server runs used the same two-CPU/2-GiB resource limits. Earlier after-runs
used different limits and are excluded from CPU claims. Compressed traffic fell
61–64%; per-client JSON payload volume fell approximately 73–80%. Server tick p95
remained 51–53 ms on its 50 ms schedule. Local command p95 reached 39 ms in the
final run; no latency improvement is claimed. Single-client CPU increased from
15.4/56.2/14.8% to 16.4/65.4/15.9% for running/planning/execution. CPU results are
therefore mixed, despite lower five-client samples. Short real-time scenarios
include changing enemy positions and do not establish a general CPU guarantee.
Planning remains the largest server cost, principally forecast simulation.

Validation: all 336 game tests, character persistence/preferences, focused
transport/client/server checks, rendering/camera checks, typecheck and client/server
builds passed. The complete browser journey passed, followed by a final fixed-view
and three-round combat journey after the forecast-copy change. Client download
size is 45.77 MiB within the existing 46 MiB gate.

Evidence:

- `greywrought:build/browser/perf055-browser-before-1459502/`
- `greywrought:build/browser/perf055-browser-after-1478929/`
- `greywrought:build/browser/perf055-wide-before-1465701/`
- `greywrought:build/browser/perf055-wide-after-1493938/`
- `greywrought:build/server-performance/perf055-server-before-1454574/`
- `greywrought:build/server-performance/perf055-server-native-1508308/`

## Lake foliage submission (0.21.51)

Draw attribution identified dense fern/grass instances as the largest lake
geometry cost. Previously a 36-metre batch submitted every plant when any part
of its bounds entered the camera view. Each render now selects individual
intersecting plants before uploading instance transforms, using the main or
reflection camera's actual clip planes. Plant density and geometry are unchanged;
trees and other shadow casters are excluded. Original bounds remain intact for
camera collision and picking. The existing minimap capture precedes installation.

In the focused 1440 × 900 AMD 890M/Vulkan comparison, stationary lake frames
that include a reflection showed the following change:

| Measurement | Before | After |
|---|---:|---:|
| CPU median | 36.8 ms | 27.4 ms |
| CPU p95 | 42.7 ms | 30.9 ms |
| Submitted triangles | 5,625,799 | 3,906,192 |
| Draw calls | 808 | 785 |

That is approximately 26% less CPU time and 31% fewer submitted triangles for
equivalent reflection work. Overall lake GPU median/p95 changed from
21.97/24.56 ms to 17.78/19.43 ms. Overall CPU median changed from 36.6 to 23.0 ms,
but the faster frame cadence also reduced the fraction containing a scheduled
15 Hz reflection, so the conditioned CPU comparison above is the useful claim.

The browser comparison, focused clip-bound/camera-turn restoration and
shadow-caster checks, typecheck, and build passed. Attribution runs separately
from timing to avoid inflating measurements. Wide orbit tails remain above the
60 Hz budget; differing camera/sample distributions prevent claiming every
orientation improved. The running phases had different actual movement and
are excluded from the comparison. These headless measurements establish the
local rendering improvement, not a desktop frame-rate guarantee.

Evidence: `greywrought:build/browser/lake-cost-before-794528/` and
`greywrought:build/browser/lake-cost-after-809120/`.

## Terrain, foliage, camera and timed-combat update (0.21.50)

The assembled world was measured at 1440 × 900, DPR 1, on an AMD Radeon
890M through Chromium ANGLE/Vulkan. The browser journey covered town, woods,
the lake, cave, hills, rain, combat planning/execution, movement, and seven
world-entry/teardown cycles. The separate server journey used one and five
real WebSocket clients. These are short local measurements, not a 60 FPS or
long-session guarantee.

Regional vegetation increased from 12,449 to 35,296 plants, including low
clearing cover and 900 shoreline plants. Grouping compatible instances reduced
regional batches from 1,620 to 699. The assembled scene fell from approximately
6,134 nodes / 3,595 meshes to 4,930 nodes / 2,558 meshes. Six ground textures
add 781,224 bytes; the complete client remains within its 46 MiB download gate.

The camera-orbit CPU profile exposed deferred shader link diagnostics and
uniform discovery on first use: 338 samples in `getProgramInfoLog`, despite
an unchanged shader-program count. Completing that work in yielding slices
during loading removed those samples in the focused repeat. Orbit CPU
median/p95 improved from 27.3/63.4 ms to 25.1/53.5 ms. Shader error checking
remains enabled. This removes one measured hitch source; wide views still
have substantial scene submission and geometry costs.

| Scenario | CPU median / p95 | GPU median / p95 |
|---|---:|---:|
| Town | 19.1 / 22.5 ms | 10.19 / 11.02 ms |
| Running in town | 18.2 / 23.6 ms | 11.32 / 12.09 ms |
| Woods (after shader warmup) | 12.8 / 15.7 ms | 7.13 / 7.61 ms |
| Camera orbit (after shader warmup) | 25.1 / 53.5 ms | 13.26 / 25.10 ms |
| Lake (after shader warmup) | 20.8 / 26.0 ms | 17.58 / 19.61 ms |
| Running beside lake (after shader warmup) | 22.3 / 27.6 ms | 16.08 / 20.44 ms |
| Cave | 17.4 / 19.6 ms | 7.32 / 7.60 ms |
| Hills | 10.8 / 13.8 ms | 9.85 / 10.71 ms |
| Running on hills | 11.9 / 15.3 ms | 9.94 / 10.46 ms |
| Combat planning | 19.1 / 21.5 ms | 14.08 / 14.49 ms |
| Combat execution | 19.1 / 23.5 ms | 14.11 / 14.57 ms |
| Rain | 18.4 / 21.5 ms | 10.35 / 11.07 ms |

Rendered land movement remained 5.2 m/s in town and hills. The focused final
repeat loaded its first world in 6.36 seconds and the next in 4.23 seconds.
All seven entries and teardowns passed in the complete journey. Whole-frame
measurements include reflections and postprocessing. The browser harness now
captures Three.js shader console failures, and the visual comparison checks
program link status; an earlier broken-ground sample was excluded. Lake and
woods fixtures were moved to match the expanded world, and rain was added.

Five-player server tick p95 stayed approximately 51–52 ms on the 50 ms
schedule; command p95 reached 37.7 ms. Planning used 87% of one CPU core,
execution approximately 32%. Total compressed traffic was 951–1,010 KiB/s;
decoded snapshots were approximately 1.4–1.5 MB/s per player, with 84–85% of
threat fields repeated. Snapshot size remains an identified optimization
opportunity; no network format change is included in this update.

Remaining costs: orbit/lake views submit around five to six million triangles
across the complete frame, and rendering/material setup dominates the remaining
orbit profile. Distant detail/reflection geometry and repeated snapshots are
the next measured targets. Nearby scenery is not hidden as a performance
shortcut. Headless presentation and long-duration memory limits described below
still apply; reported callback and GPU times do not establish interactive FPS.

Raw evidence:

- `greywrought:build/browser/richness-profile-683531/`
- `greywrought:build/browser/richness-warmed-695732/`
- `greywrought:build/browser/bloom-before-649863/`
- `greywrought:build/browser/bloom-after-667513/`
- `greywrought:build/server-performance/richness-server-689805/`

## Earlier examination — 20 September 2026

The assembled 0.21.15 world was profiled in town, woods, the lake, the cave,
on hills, during camera orbit, and in combat planning and execution. Measurements
include actual rendered frames, CPU profiles, GPU timers, loading, six returns
to the character roster, movement speed, and a separate server process with
one and five real WebSocket clients.

## Rendering

Hardware: AMD Radeon 890M, ANGLE/Vulkan with RADV, 1440 × 900, device pixel ratio 1.
These are game-frame callback costs, not complete presented-frame times.

| Scenario | Median CPU before → after | CPU p95 before → after |
|---|---:|---:|
| Town | 14.3 → 12.8 ms | 17.2 → 15.3 ms |
| Running in town | 15.6 → 12.1 ms | 21.9 → 17.5 ms |
| Woods | 12.9 → 12.7 ms | 16.0 → 16.2 ms |
| Camera orbit | 15.1 → 13.0 ms | 18.2 → 15.6 ms |
| Lake | 16.5 → 12.3 ms | 19.2 → 14.8 ms |
| Running beside the lake | 14.9 → 12.0 ms | 21.0 → 19.7 ms |
| Cave | 11.9 → 8.6 ms | 15.2 → 11.2 ms |
| Hills | 9.9 → 7.5 ms | 12.2 → 10.2 ms |
| Combat planning | 12.4 → 11.8 ms | 15.5 → 14.0 ms |

The final execution sample covered three combat rounds: median 11.6 ms, p95
14.8 ms. Its baseline sample was too short for a meaningful comparison.
GPU medians ranged from 3 to 10.3 ms; the largest GPU p95 was 13.35 ms during orbit.

Scenery batching left empty source hierarchies in the scene. Removing them
reduced scene nodes from 3,699 to 2,186. Water reflections now reuse the world
transforms calculated by the enclosing render. Materials, geometry, shadows,
and reflection quality were preserved. A separate reflection feedback error
was fixed by excluding water that samples the active reflection texture from
that texture's render pass.

Startup shader preparation now uses asynchronous compilation. Before that fix,
a measured 3.7-second blocking task caused a connection heartbeat expiry. The
completed browser journey passed afterward. First entry measured 3.83 seconds;
subsequent entries measured 1.43–1.98 seconds. Warrior movement measured 5.2 m/s
on flat ground, hills, and the lake approach.

## Server and traffic

The 0.21.17 river/shore correction adds finer terrain and water geometry. A
focused repeat at the lake measured callback median/p95 of 11.1/15.4 ms while
standing and 15.3/23.2 ms while moving (previous moving sample: 12.0/19.7 ms).
GPU median/p95 was 4.81/5.05 ms and 5.17/5.79 ms respectively. The finer geometry
therefore carries a measurable moving-frame cost; no callback exceeded 28 ms in
this short sample. Movement remained 5.2 m/s. The same headless frame-presentation
limitation below applies. Evidence: `greywrought:build/browser/visual02117-lake-2130359/`.

Reflection shader variants now compile asynchronously for their render target
before the first playable frame, in addition to the screen variants. The final
visual journey had no heartbeat-expiry disconnect and confirmed the new music
plays. Evidence: `greywrought:build/browser/water-shore-2128401/`.

An early bounds rejection removes unnecessary obstacle clipping during combat
forecasts. In the initial five-player planning comparison, CPU use fell from
57.5% to 49.9% of one core. Later compression measurements used a separate baseline.

| Five-player scenario | Uncompressed traffic | Compressed traffic |
|---|---:|---:|
| Exploration | 2,738 KiB/s | 465 KiB/s |
| Planning | 2,862 KiB/s | 482 KiB/s |
| Execution | 2,922 KiB/s | 492 KiB/s |

Native WebSocket compression reduces transferred bytes by about 82–83%.
It costs CPU: planning increased from 46.5% to 53.7% of one core in this comparison.
Tick p95 stayed around 51–53 ms; worst measured local command p95 was 6.13 ms.
The service suite passed all 13 tests.

## Limits and retained evidence

The headless Vulkan compositor spends most frame time copying GPU output back
to the CPU. A three-second browser trace recorded 2.30 seconds in ReadPixels.
Consequently its observed 11–15 FPS does not establish normal interactive
performance, and these results do not prove 60 FPS. A hardware-compositing
launcher trial did not resolve that measurement limitation.

Six world teardown cycles removed the canvas and cleared probe references.
Renderer counters still showed two geometries, 2–18 textures, and 7–9 programs
after disposal; this is not proof of a leak or proof of leak absence. Long-duration
GPU retention and normal interactive frame pacing remain unverified. Decoded
snapshot traffic remains approximately 520–600 KB/s per player; compression
does not remove JSON decoding work.

Reproduce with Bun using `greywrought:acceptance/browser/performance.ts` and
`greywrought:acceptance/server/performance.ts`. Local raw evidence is retained in:

- `greywrought:build/browser/assembled-before-2022932/`
- `greywrought:build/browser/assembled-after-2030001/`
- `greywrought:build/browser/assembled-native-trace.json`
- `greywrought:build/server-performance/wire-before-2009395/`
- `greywrought:build/server-performance/wire-after-2011929/`
- `greywrought:build/server-performance/before-1966018/`
- `greywrought:build/server-performance/after-1973641/`
