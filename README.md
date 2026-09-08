# Greywrought

Greywrought is a native Bevy game with Clause-authored gameplay. Its direction
is a dangerous forest expedition: enter with a plan, read enemy intentions,
choose what is worth fighting, gather something valuable and get home alive.
Equipment and extracted resources carry lasting power; kills grant no XP.

Clause owns world rules and checked gameplay changes. Bevy handles presentation,
assets, input and UI. The native window keeps its world while supported checked
edits are applied. Web delivery is a later Bevy export.

## Play and develop

On this Linux machine, initialize the immutable compiler and build once:

```sh
git submodule update --init --recursive
nix develop '.?submodules=1'
bun install --frozen-lockfile
bun run build:play
bun run play
```

The project development shell supplies Rust and native window libraries.
Its source is `greywrought:flake.clause`; the pinned Clause compiler generates
`greywrought:flake.nix`. Run the build again after changing Rust or the compiler
pin. Gameplay tuning inside the open window does not rebuild or restart it.
The Git flake includes the pinned submodule and excludes ignored build output.
Regenerate an environment change with the pinned workbench's `project-nix`
command, keeping compiler builds in `greywrought:build/authoring-target/` and
game builds in `greywrought:build/desktop-target/`.

The current interactive window opens the company encounter prototype. Select
with click/Shift-click or Tab; right-click moves or selects a target. Enter
begins an encounter; Space attacks, H heals, J wards and I ignites. WASD/arrows
pan; the wheel zooms. F5 saves. F6 opens checked tuning; F7 opens inspection.
See `greywrought:docs/native-desktop.md` for the edit/inspection loop.

The new forest's rules execute through native tests, including useful
enemy-clearing benefits, predictable resources, deliberate ritual rewards,
extraction and permanent loss. Its native scene and input integration are the
next delivery. The older outfitting prototype is available with
`bun run play --workshop`; it is not the completed forest game.

## Source and checks

- `greywrought:src/world/forest-expedition.clause`: new expedition rules.
- `greywrought:src/bin/desktop.rs`: passive Bevy window and input transport.
- `greywrought:src/native.rs`: resident Clause session, projection and saves.
- `greywrought:tests/forest_expedition.rs`: native expedition journeys.
- `greywrought:tests/native_inspection.rs`: explanations, prediction and continuity.
- `greywrought:acceptance/performance/README.md`: measured limits and targets.

Run `bun run test:forest`, `bun run test:inspection`, or the full
`bun run test:native`. Keep the full native gate intact; focused passing tests
do not imply the older formation tests or performance targets pass.

The former browser implementation is preserved at Git tag
`browser-snapshot-20260908`. Assets and attribution remain under
`greywrought:assets/`. Generated artifacts and private test saves belong under
`greywrought:build/`.
