# Performance examination — 20 September 2026

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
