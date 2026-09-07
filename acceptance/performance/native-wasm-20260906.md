# Matched native / Chrome Wasm simulation, 2026-09-06

Native reduces this workload's elapsed simulation cost, but both backends
remain orders of magnitude beyond a 16 ms tick. This experiment does not
support moving the renderer as a cure for the observed simulation latency.

## Conditions and result

Greywrought base: `a27abec0cc313bd57064e4ebef14c4f3c0336e41`.
Clause: `e8a385f7d699226320da9369cd2761603de53641`, native release Rust
1.96.1 using its declared Nix shell. Wasm SHA256:
`482a8ffb9ac257cd81203a2f636a294814108cb8fd6de4532ad7b54ee4f8b755`.
AMD Ryzen AI 9 HX 370; headless Chrome 152.0.0.0, V8 Wasm, 24 reported
hardware threads. Heavy capacity wrapper, sequential native then Chrome.
No graphics workload, physical inputs, or random draws. All three autonomous
ticks use 16 ms and the exact existing 100-actor source fixture. No discarded
warmup; the first and subsequent calls are retained separately. Module
instantiation was 29.3 ms, outside session opening below.

| Stage | Native ms | Chrome Wasm ms |
| --- | ---: | ---: |
| Source compilation/opening by resident source compiler | 930.318 | Same compiled artifact |
| Session open, exact serialized CWS1 | 72.942 | 147.4 |
| Initial accepted projection | 1.651 | 1.1 |
| Candidate 1 | 2049.778 | 2574.0 |
| Candidate 2 | 2123.175 | 2450.6 |
| Candidate 3 | 2043.089 | 2537.9 |
| Admission authorization 1 / 2 / 3 | 0.022 / 0.026 / 0.033 | 0.4 / 0.1 / 0.1 |
| Admission with projection 1 / 2 / 3 | 14.229 / 14.319 / 15.205 | 22.5 / 14.4 / 15.2 |
| Final accepted projection | 2.006 | 2.6 |
| Checked edit compilation | 5643.091 | Same compiled edit |
| Checked edit transfer | 2198.047 | 3106.0 |
| Edited accepted projection | 1.385 | 1.8 |
| Continuity serialization | 57.367 | 44.2 |

The three candidate/authorization/admission cycles total 6259.876 ms native
and 7615.2 ms Wasm: native was 17.8% shorter in this sample. They advance
48 ms of source time, about 0.00767 and 0.00630 source seconds per wall second
using only those operation costs. Compilation plus edit transfer totals
7841.138 ms native or 8749.091 ms Wasm, excluding visible presentation and
transport. Neither approaches the 250 ms checked-edit target.

The native harness uses `WasmPersistentSessionBoundaryV1` bulk calls, including
the same request copy, serialization and returned-byte copy as Chrome's bulk
exports. It does not use a higher-level native shortcut. Both sides exclude
hex conversion, file/HTTP transport and report decoding from individual call
timings. Admission includes its produced projection; the extra projection
rows measure the standalone accepted-projection query, not an additional
part of each game tick.

Every initial/open and pre-edit candidate, authorization, admission and
projection byte matches exactly. This includes all serialized runtime
identities, outcomes and projected fields, not only actor counts. The initial
request explicitly rematerializes the same recorded allocation epoch on both
sides. All 100 cooldowns change from 60 to 59.952000000000005; 98 positions
change. `company-92` and `company-93` stay at their initial positions in both
backends. Therefore the existing all-100-moving condition is **not met** in
this bounded initial window. This does not explain or repair that separate
movement behavior.

The supported edit changes `?cooldown - ?dt` to
`?cooldown - (?dt * 2.0)` through the compiler's scalar-effect catalog and CET1
witness. Both sides consume the identical new CWS1 and CET1 after the same
admitted frontier. Edited projection bytes and all 2,335,143 continuity bytes
match exactly; all 100 cooldown values survive transfer. The raw edited
Opened event differs: the public checked-edit boundary requires allocation
`New`, which calls `getrandom`, intentionally producing different new
runtime allocation/Run/Activation identifiers. No differing identities are
normalized away. Carried source referents and continuity are distinct from
these new runtime identifiers. No post-edit tick was measured.

Wasm linear memory grows from 45,285,376 bytes after open to 712,572,928
after candidate 1 and 1,371,471,872 after candidate 2, staying at that capacity
through candidate 3 and edit. This is linear-memory capacity, not live retained
data or browser RSS. Native RSS and whole-browser memory are unmeasured.
Three ticks cannot establish bounded sustained memory, latency distributions,
all three checked-edit cases, visible-edit latency, browser FPS, or universal
native/Wasm equivalence.

## Reproduction and retained evidence

Owned checkout:
`~/code/greywrought/worktrees/native-wasm-comparison-20260906`.
The harness is `greywrought:src/bin/runtime_comparison.rs` plus
`greywrought:acceptance/performance/native-wasm.ts`. Generated inputs and
outputs remain ignored under `greywrought:build/`.

Initialize the exact Clause submodule. Produce the fixture using
`greywrought:acceptance/browser/rts-100-active.ts --write-fixture` and run the
pin's `clause-workbench check-source` on
`greywrought:build/measurement/100-active-source.clause` (passed). Build the
native comparison with the exact vendor Nix shell and Cargo:

```sh
cd ~/code/greywrought/worktrees/native-wasm-comparison-20260906
/home/tom/.local/lib/firn/cli/current/bin/bun /home/tom/code/nixos-config/main/dotfiles/agents/skills/machine-capacity-distilled/scripts/machine-capacity.mjs run --class heavy --owner codex:/root/runtime_comparison --timeout-seconds 900 -- nix develop /home/tom/code/greywrought/worktrees/native-wasm-comparison-20260906/vendor/clause --command cargo build --release --bin runtime_comparison --locked --manifest-path /home/tom/code/greywrought/worktrees/native-wasm-comparison-20260906/Cargo.toml --target-dir /home/tom/code/greywrought/worktrees/native-wasm-comparison-20260906/build/comparison-target -j 2
```

Use the existing pinned Wasm build and staged passive adapter: copy
`greywrought:build/clause-wasm/clause_runtime.js` and
`greywrought:build/clause-wasm/clause_runtime_bg.wasm` to
`greywrought:build/comparison/wasm/`; copy the staged
`greywrought:build/host/clause-runtime/wasm-cartridge-port.js`,
`greywrought:build/host/clause-runtime/workbench.js`, and
`greywrought:build/host/clause-runtime/source-transfer-observation.js`
to `greywrought:build/comparison/adapter/`. This run copied these already-built
artifacts from the unchanged evidence checkout
`~/code/greywrought/worktrees/performance-100-actors-20260906`; the harness
verified the immutable Wasm hash above. No mutable Cargo target was shared.

Exact measured invocation (from the owned checkout; relative script argument
resolved to the absolute path shown here):

```sh
/home/tom/.local/lib/firn/cli/current/bin/bun /home/tom/code/nixos-config/main/dotfiles/agents/skills/machine-capacity-distilled/scripts/machine-capacity.mjs run --class heavy --owner codex:/root/runtime_comparison --timeout-seconds 360 -- /home/tom/.local/lib/firn/cli/current/bin/bun /home/tom/code/greywrought/worktrees/native-wasm-comparison-20260906/acceptance/performance/native-wasm.ts
```

Raw requests/native replies are in `greywrought:build/comparison/native.tsv`;
Chrome replies in `greywrought:build/comparison/browser.json`; stage hashes,
actor values/referents and verdicts in `greywrought:build/comparison/result.json`.
Source SHA256:
`66b5e11e264edf4011665b25e91a3ca01c8922a84806777c53cc0e70cfcdc9ac`.
Shared initial CWR1 SHA256:
`9059c97f332cfec65b1dbcbf922b8240e331d1eaccd1dccbdf1664fb2d397255`.
The CWR1 contains a recorded allocation and need not have the same hash in a
fresh run; within one comparison both sides use the exact same bytes.

The first driver exit was 1 because its activity verdict incorrectly demanded
every actor move as well as advance its cooldown. The report now separately
retains the 100-active pass and 98-moving result; the movement requirement
has not been weakened or claimed to pass. `--analyze-only` reprocessed retained
raw replies successfully without rerunning either timing workload. Native
release compilation and pinned source checking also passed.
