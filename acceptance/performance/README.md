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
