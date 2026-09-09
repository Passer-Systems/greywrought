# Greywrought

Greywrought is a native Rust/Bevy game. Leave Hearthstead for the forest, read
enemy intentions, gather frost cores, call the grove guardian and return alive.
Equipment and extracted resources carry lasting power; kills grant no XP.

## Play and develop

From your Greywrought checkout on Linux:

```sh
nix develop
bun run build:play
bun run play
```

The project-local Nix shell supplies the pinned Rust toolchain and native window
libraries. Its definition is `greywrought:flake.nix`, using
`greywrought:rust-toolchain.toml`. No submodule or package installation is needed.
Rebuild after changing Rust. Build output stays under `greywrought:build/`.

Start in Hearthstead and walk north through the gate. W/S walks forward/back,
A/D strafes, and Space jumps. Left-drag orbits the camera; right-drag steers;
holding both mouse buttons walks forward. The wheel zooms. Tab selects a threat,
1 strikes, and B braces. G gathers nearby cores. R offers six carried cores at
the deep grove. Return through the gate alive to secure cargo.

Approach Mara and press F to trade. H drinks a potion. O opens equipment;
change equipment in town. F5 saves, and normal close saves too. See
`greywrought:docs/native-desktop.md` for controls and save locations.

This is a local forest playtest. Buildings and trees are decorative; shared
hubs, networked companions and multiplayer remain unfinished.

## Source and checks

- `greywrought:src/game.rs`: typed gameplay state and commands.
- `greywrought:src/persistence.rs`: character saves.
- `greywrought:src/bin/desktop.rs`: Bevy window, input and fixed update.
- `greywrought:tests/forest_expedition.rs`: expedition journeys.
- `greywrought:tests/native_forest_view.rs`: movement and forest projection.
- `greywrought:acceptance/performance/README.md`: scaling measurement criteria.

Run `bun run test:forest` for the expedition checks or `bun run test:native`
for the native suite. The equivalent direct command is
`nix develop --command cargo test --locked` from the checkout.

Assets and attribution remain under `greywrought:assets/`. Private test saves
and measurement output belong under `greywrought:build/`.
