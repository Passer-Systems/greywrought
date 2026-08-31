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
bun run check:conquest
```

`bun run check:conquest` materializes the current Clause source to CWR1,
builds the passive Beagle projection, stages the exact pinned Clause Wasm
runtime, and executes the bounded branch journey. The Beagle build refuses to
run unless the installed compiler checkout's tracked source is byte-equal to
the recorded Beagle pin. No generated artifact is tracked.

Pinned inputs:

- Clause `fc3ee2794c7450b26c0cf7c18b8b7f0243be8224`
- Beagle `9a128f443e8a5562ecd115e6872dbecf51fd1eb0`
