# Greywrought Clause

This repository owns the Greywrought application written in Clause. Clause
itself remains a language/runtime project; the older `greywrought` repository
is context only and is neither imported nor modified here.

The primary playable slice is **Cinderwake**, one embodied room whose movement,
combat, deterministic sample, vitality, death, loot custody, completion,
failure, and reset are owned by `src/world/embodied-encounter.clause`. Keyboard
input and fixed ticks first produce a hidden Candidate Delta; only the following
separate Admission installs the visible world revision. Strict TypeScript and
Three.js transport input and render admitted projections without deciding
gameplay.

The wayfarer begins safely beside the western moonwell. The cinder wraith
telegraphs and launches one projected bolt that travels across several
admitted Steps. One Clause-owned contact law spends the bolt when it reaches
the wayfarer: grounded contact applies `ember-mark`, whose timer delays bounded
damage, while airborne contact defeats the wraith without applying the mark.
The same actor-owned propulsion vocabulary supplies world-fixed
movement, horizontal and vertical sustain, orthogonal bursts, one cumulative
energy resource, an ignition threshold, and delayed regeneration. The
revealed key uses a Clause-owned 0.6-unit pickup radius before custody
transfers.

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
- `src/host/*.ts` owns only passive presentation and the exact Clause Wasm ABI.
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
bun run test:wasm-combat-depth
bun run check:conquest
bun run check:combat-depth
```

To run the playable browser shell:

```sh
bun run play
```

Then open <http://127.0.0.1:4173/>. The shell presents and invokes the exact
Clause/Wasm world, Candidate, Admission, explanation, and effect boundaries.
Click the arena, move with `W` forward, `S` backward, `A` left, and `D` right;
hold `Shift` for horizontal sustain, use `Q` for a horizontal burst, jump with
`Space`, swing the equipped sword with `J`, hold `E` for vertical sustain, use `F` for a vertical burst, and reset
with `R`. A fixed high-oblique camera follows
the admitted wayfarer position while keeping the encounter ahead in view. Read
the wraith telegraph, meet its bolt while airborne, walk over the glowing key, then
carry it west to the moonwell.

A measured Clause-only gravity edit reached its first separately admitted
browser frame in 323 ms with 60.5 ms of resident compilation; restoring the law
reached the admitted frame in 233 ms with 66.6 ms of compilation. Neither edit
rebuilt or restarted Rust, TypeScript, Wasm, the server, or the browser page.

`bun run check:conquest` materializes the current Clause source to CWR1,
strictly checks and builds the passive TypeScript host, stages the exact pinned
Clause adapters and Wasm runtime, and executes the bounded branch journey. No
generated artifact is tracked.

`bun run test:wasm-effect` writes exact Clause payload bytes to ignored
`build/ongoing-effect/wasm-receipt.bin`; this is the real foreign action, not a
manufactured success flag. `bun run check:conquest` then runs the separate
combat Candidate Delta and Admission journey.

`bun run check:combat-depth` runs the focused native source assertions,
materializes the embodied encounter, and exercises it through the real Clause
Wasm cartridge port. It proves safe idle flight, contact-only delayed damage,
world-fixed diagonal movement, sustained direction changes, orthogonal bursts,
grounded-only jump, energy ignition and regeneration, reset, pickup proximity,
and custody across separate Candidate and Admission operations.

Pinned inputs:

- Clause `f1f5a13fd5cd52bdf85c984a82a6953add33ef18` (includes strict generated
  TypeScript adapters for the workbench, cartridge port, and process branch,
  plus the source-owned world and deterministic physical-input lowering)
