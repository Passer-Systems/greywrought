# Performance examination — 21 September 2026

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
