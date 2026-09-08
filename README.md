# Greywrought

Greywrought is a native Bevy game with Clause-authored gameplay. Its direction
is a third-person MMORPG with WASD movement, an orbit camera, walkable hubs
and physical routes into dangerous territories. The first expedition is a
forest: enter with a plan, read enemy intentions, choose what is worth fighting,
gather something valuable and get home alive.
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

The window opens at Hearthstead beside a five-clearing forest trail. Enter
departs, D advances and A retreats. Click a threat card or press 1–5 to target;
Space strikes and B braces. G gathers at the grove; R offers six cores to call
the guardian. Return to Hearthstead and press X to secure carried rewards.
O opens equipment. F5 saves, F6 opens checked tuning and F7 opens inspection.
See `greywrought:docs/native-desktop.md` for saves and the edit/inspection loop.

Current and upcoming enemy intentions, rising presence, useful clearing
benefits, predictable resources, ritual rewards and permanent loss all come
from the running Clause world. Living extraction and checked-edit save/reopen
have been exercised in the native window. This remains a small trail prototype
with placeholder enemies; free exploration and networked companions are
unfinished. The next native milestone replaces the clearing-step controls with
direct character movement from Hearthstead through its gate into the forest;
see `greywrought:docs/native-desktop.md`. Older prototypes remain available with
`--company` and `--workshop`.

## Source and checks

- `greywrought:src/world/forest-expedition.clause`: new expedition rules.
- `greywrought:src/bin/desktop.rs`: passive Bevy window and input transport.
- `greywrought:src/native.rs`: resident Clause session, projection and saves.
- `greywrought:tests/forest_expedition.rs`: native expedition journeys.
- `greywrought:tests/native_inspection.rs`: explanations, prediction and continuity.
- `greywrought:tests/native_forest_view.rs`: forest input, inspection and edit/save continuity.
- `greywrought:acceptance/performance/README.md`: measured limits and targets.

Run `bun run test:forest`, `bun run test:inspection`, or the full
`bun run test:native`. Keep the full native gate intact; focused passing tests
do not imply the older formation tests or performance targets pass.

The former browser implementation is preserved at Git tag
`browser-snapshot-20260908`. Assets and attribution remain under
`greywrought:assets/`. Generated artifacts and private test saves belong under
`greywrought:build/`.
