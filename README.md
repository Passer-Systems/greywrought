# Greywrought Clause

This repository owns the Greywrought application written in Clause. Clause
itself remains a language/runtime project; the older `greywrought` repository
is context only and is neither imported nor modified here.

The primary playable slice is **Cinderwake**, one embodied room whose movement,
combat, deterministic sample, vitality, death, loot custody, completion,
failure, and reset are owned by `src/world/embodied-encounter.clause`. Keyboard
input and fixed ticks first produce a hidden Candidate Delta; only the following
separate Admission installs the visible world revision. Beagle and Three.js
transport input and render admitted projections without deciding gameplay.

The earlier disconnect proof remains available as a secondary journey: an
ashen wayfarer forks from an exact authoritative revision while disconnected,
attacks one cinder wraith under an explicit retained random Observation, and
returns non-authoritative damage, death, and loot consequences. The same
Clause-owned occurrences replay against the independently advanced
authoritative world, and only a separate Admission establishes the successor.

A separate moonwell process now remains live across multiple Steps,
suspension, and linear resumption. Its Clause-owned effect intent crosses one
generic file boundary under exact one-shot authorization and returns distinct
attempt, receipt, Observation, and Judgment evidence. That lifecycle creates
no Candidate Delta or StateRevision; the combat journey's later Admission is
still the only authoritative successor operation.

Authority is divided as follows:

- `src/world/*.clause` owns world laws and domain transition meaning.
- `src/host/*.bjs` owns only passive presentation and the exact Clause Wasm ABI.
- `acceptance/disconnect/` owns the bounded executable combat journey and its
  source-only critical-threshold edit.
- ignored `build/` owns every CPP1, CWR1, Wasm, JavaScript, and native
  materialization.

Current focused loops:

```sh
nix shell nixpkgs#gcc -c bash -lc 'export PATH=/home/tom/.rustup/toolchains/1.96.1-x86_64-unknown-linux-gnu/bin:$PATH; cargo test --test law_edit --locked -- --nocapture'
nix shell nixpkgs#gcc -c bash -lc 'export PATH=/home/tom/.rustup/toolchains/1.96.1-x86_64-unknown-linux-gnu/bin:$PATH; cargo test --test disconnect --locked'
nix shell nixpkgs#gcc -c bash -lc 'export PATH=/home/tom/.rustup/toolchains/1.96.1-x86_64-unknown-linux-gnu/bin:$PATH; cargo run --bin conquest --locked'
bun run build:host
bun run test:host
bun run test:wasm-conquest
bun run test:wasm-effect
bun run check:conquest
```

To run the playable browser shell:

```sh
bun run play
```

Then open <http://127.0.0.1:4173/>. The shell presents and invokes the exact
Clause/Wasm world, Candidate, Admission, explanation, and effect boundaries.
Click the arena, move with `WASD`, strike with `Space`, and reset with `R`.
Strike the cinder wraith from `x=1`, avoid contact at `x=2`, then carry the
ashen key left to the moonwell at `x=-2`.

A measured Clause-only gravity edit reached its first separately admitted
browser frame in 323 ms with 60.5 ms of resident compilation; restoring the law
reached the admitted frame in 233 ms with 66.6 ms of compilation. Neither edit
rebuilt or restarted Rust, Beagle, Wasm, the server, or the browser page.

`bun run check:conquest` materializes the current Clause source to CWR1,
builds the passive Beagle projection, stages the exact pinned Clause Wasm
runtime, and executes the bounded branch journey. The Beagle build refuses to
run unless the installed compiler checkout's relevant source is byte-equal to
the recorded Beagle pin. No generated artifact is tracked.

`bun run test:wasm-effect` writes exact Clause payload bytes to ignored
`build/ongoing-effect/wasm-receipt.bin`; this is the real foreign action, not a
manufactured success flag. `bun run check:conquest` then runs the separate
combat Candidate Delta and Admission journey.

Pinned inputs:

- Clause `baf7f77ef48fc607b39c3dd3e5f5f9e2418162be` (includes resident-session
  command budget `0dd73896f0d119342cb5d6f51211e15be6db0953`)
- Beagle `6c1e80d2833d711a2bd16d7ea9b1ca090cc870a7`
