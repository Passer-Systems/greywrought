# Greywrought Clause

This repository owns the Greywrought application written in Clause. Clause
itself remains a language/runtime project; the older `greywrought` repository
is context only and is neither imported nor modified here.

The executable story is deliberately narrow: an ashen wayfarer forks from an
exact authoritative revision while disconnected, attacks one cinder wraith
under an explicit retained random Observation, and returns non-authoritative
damage, death, and loot consequences. The same Clause-owned occurrences replay
against the independently advanced authoritative world, and only a separate
Admission establishes the successor. The retained branch and admitted result
remain causally explainable without deriving order from log position.

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

`bun run check:conquest` materializes the current Clause source to CWR1,
builds the passive Beagle projection, stages the exact pinned Clause Wasm
runtime, and executes the bounded branch journey. The Beagle build refuses to
run unless the installed compiler checkout's tracked source is byte-equal to
the recorded Beagle pin. No generated artifact is tracked.

`bun run test:wasm-effect` writes exact Clause payload bytes to ignored
`build/ongoing-effect/wasm-receipt.bin`; this is the real foreign action, not a
manufactured success flag. `bun run check:conquest` then runs the separate
combat Candidate Delta and Admission journey.

Pinned inputs:

- Clause `419140bd932bdd8461deb51c9f6c42a4bb5683b1`
- Beagle `974221bc0c8982878d1278d3c61a2fb15ff1b0dc`
