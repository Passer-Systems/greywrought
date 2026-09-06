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

At Greywrought `5bdc0e83458a52764285a40a005f35b595ec3d8e` and Clause
`0cc2d1a4a3f51e99298ebb5be846b3c96fc5f0b6`, the freshly built pinned source checker
rejects the 100-unit source in 5,457 ms:

```text
selected package has 385 projection Roles for 435 source state cells
```

The unmodified final encounter source passes that same checker in 1.573 seconds.
The owning failure is Clause's template projection-role allocation, checked in
`clause:crates/clause-workbench/src/source_session.rs`. Its general-purpose repair
and a new consumer pin are required before this harness can reach the browser.
No 100-actor simulation, rendering, or checked-edit latency verdict was observed;
the downstream harness remains unexercised. Do not raise a magic role count,
weaken the check, reduce the roster, or use another runtime to bypass this result.
