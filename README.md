# Greywrought Clause

This repository owns the Greywrought application written in Clause. Clause
itself remains a language/runtime project; the older `greywrought` repository
is context only and is neither imported nor modified here.

The first executable story is deliberately narrow: an ashen wayfarer forks
from an exact authoritative revision while disconnected, advances without
authority, returns a candidate reconnection consequence, and receives a
separate domain-governed Admission. The retained branch and admitted successor
must remain causally explainable without deriving order from log position.

Authority is divided as follows:

- `src/world/*.clause` owns world laws and domain transition meaning.
- `src/host/*.bjs` owns only passive presentation and the exact Clause Wasm ABI.
- `acceptance/disconnect/` owns the bounded executable journey and law-edit
  input.
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

- Clause `d55562875f8ad76d2489ba2ba637719c1c1a5763`
- Beagle `9a128f443e8a5562ecd115e6872dbecf51fd1eb0`
