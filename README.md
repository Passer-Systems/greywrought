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
bun run build:host
bun run test:host
```

The complete conquest command will be added when the reusable Clause
resident-session branch boundary lands. No generated artifact is tracked.

Pinned inputs:

- Clause `c287c289cab9d75ddaceea2bc01b2af545b58a06`
- Beagle `9a128f443e8a5562ecd115e6872dbecf51fd1eb0`
