# Greywrought Clause

Greywrought Clause is a playable Clause/Wasm action-RPG slice. The world law in
`src/world/embodied-encounter.clause` owns movement, combat, vitality, death,
loot custody, extraction, progression, failure, and reset. Strict TypeScript
and Three.js transport physical input and render admitted projections without
deciding gameplay.

Play the published build at <https://passer-systems.github.io/greywrought/>.

Every input and fixed tick first produces a hidden Candidate Delta. Only the
following separate Admission installs the visible world revision. The sidebar
keeps that custody order observable while the encounter runs.

## The three-expedition campaign

The wayfarer fights a corrupted magitek boar, loots its Ashen Breach Key,
spends the key at the moonwell, crosses the temporary breach, recovers a
Cephorium cache, and carries it back to extract. The first two extractions
advance a durable foothold; the third establishes permanent Ashen Verge
access.

The browser stores only the last admitted progress projection. Version-two
storage migrates the original v1 shape, clears malformed records, preserves
unknown future versions, and returns only finite observations. Clause law still
validates their meaning, rejects invalid values, clamps completed progress to
the authored requirement, and decides whether access is sealed or permanent.

Combat includes a readable charge telegraph and corridor, perpendicular dodge
and jump responses, recovery punish windows, sword commitment, ranged action,
booster energy, status effects, health feedback, corpse and cache loot windows,
and terminal success/failure feedback.

## Authority boundaries

- `src/world/*.clause` is the sole authority for gameplay meaning.
- `src/host/*.ts` is the passive browser presentation and exact Clause Wasm ABI.
- `acceptance/` contains native, Wasm, browser, liveness, hot-edit, and custody
  proofs.
- ignored `build/` and `dist/` contain all generated artifacts.
- `vendor/clause` is an immutable Git submodule, not a live local checkout.

The earlier exact disconnect/reconnect proof and the independently authorized
moonwell effect lifecycle remain available in the sidebar and acceptance suite.

## Clean setup

Prerequisites are Git, Bun 1.3.13, Rust 1.96.1, a C toolchain, and Chrome for
browser acceptance.

```sh
git clone --recurse-submodules https://github.com/Passer-Systems/greywrought.git
cd greywrought
bun install --frozen-lockfile
bun run check:portable
```

If the repository was cloned without submodules:

```sh
git submodule update --init --recursive
```

## Build and verify

```sh
cargo test --locked
bun run check:release
bun run test:host
bun run test:wasm-conquest
bun run test:wasm-effect
bun run test:wasm-combat-depth
```

`check:release` verifies the immutable Clause commit and Wasm digest, rejects
machine-specific paths, runs the focused native and Wasm depth checks, and
produces the complete static release in `dist/`.

## Play locally

```sh
bun run play
```

Open <http://127.0.0.1:4173/>. Click the arena, then use WASD to move, left-drag
to orbit, the wheel to zoom, Tab to target, `1` for a ranged action, `J` for the
sword, `L` or right-click to loot, Space to jump, Shift/Q for horizontal
propulsion, E/F for vertical propulsion, and `R` to reset the expedition.

The in-game Controls & Accessibility panel remaps every keyboard action and
persists collision-safe bindings. It also provides reduced-motion,
high-contrast, larger-text, and synthesized-effects-volume controls. Standard
gamepads support left-stick or D-pad movement, face-button
jump/loot/sword/target actions, propulsion controls,
the lock-on bolt, and reset. These are physical-input transport choices only;
they map to existing Clause observations and do not decide gameplay.

The development server keeps one resident source session and can admit hot
Clause edits without rebuilding or reloading the browser. Acceptance performs
four alternating, typed combat-law edits and requires each to reach an admitted
browser frame in under 2.5 seconds, including compilation and headless rendering.

To inspect the exact static publication under a Pages-style subpath:

```sh
bun run build:static
bun run serve:static
```

Open <http://127.0.0.1:4180/greywrought/>. Static hosting uses the
materialized embodied cartridge while preserving the same runtime, Candidate,
Admission, and projection boundaries.

Static publication copies an explicit runtime asset closure rather than entire
source packs. `dist/release-manifest.json` records every shipped file, and the
release fails above 32 MiB total or 12 MiB for one file. The current artifact is
about 19.3 MiB, down from the earlier roughly 51 MiB bundle.

## Continuous delivery

`.github/workflows/release.yml` checks out the Clause submodule, pins Bun and
Rust, runs every native, host, Wasm, dynamic-browser, three-expedition,
persistence, liveness, hot-edit, recovery, and static-subpath gate, then
publishes `dist/` to GitHub Pages from `main`.

`.github/workflows/production-smoke.yml` also checks the deployed HTML, release
manifest, Wasm identity, admitted frames, movement, remapped input, accessibility
preferences, combat commitment, and corrupt-save recovery every day. Its log is
retained as a workflow artifact whether the check passes or fails.

Pinned Clause input: `f0ca1bb912829572ced3feebd17a99cf749eb494`.
