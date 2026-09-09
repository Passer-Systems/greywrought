# Native development

From your Greywrought checkout, run `nix develop`, `bun run build:play`, then
`bun run play`. The launcher runs the compiled game with its native libraries.
Rebuild after gameplay or presentation changes.

## Forest expedition

Start in Hearthstead and walk north through the gate. Returning alive secures
carried cores and relics.

- W/S walks forward/back; A/D strafes; Space jumps.
- Left-drag orbits the camera. Right-drag steers the character. Holding both
  mouse buttons walks forward. The wheel zooms.
- Approach Mara beside the road and press F to trade. A potion costs three
  secured supplies and restores up to 30 health. H drinks one; at full health,
  you keep it. Escape closes the shop.
- G gathers nearby frost cores. Read current and upcoming intentions before
  engaging a threat. Tab selects a threat, 1 strikes within reach, and B braces.
- R offers six carried cores at the deep grove to call the guardian. Its relic
  needs a living return. O opens equipment; change equipment in town.
- Return through the gate to bank cargo. F5 saves; closing normally also saves.
  Death loses carried rewards and damages equipment.

Buildings and trees are decorative. Map, gate and thicket bounds constrain
movement. Shared hubs, companions and multiplayer remain unfinished.

## Saves

The game uses `~/.local/share/greywrought/spatial-rust.json`, respecting
`XDG_DATA_HOME`. From the checkout, use
`bun run play --save /absolute/path/to/private-character.json` for a separate
character. A missing save starts a new character; a malformed save reports an
error rather than silently replacing progress.

Earlier `~/.local/share/greywrought/spatial.save` characters stay intact for the
previous installed release. Conversion is a separate, one-time operation using
that release; the new game reads its own JSON save format. Keep private
conversion output under `greywrought:build/` until its play/save/reopen journey
has passed. Only the operator's selected replacement becomes the normal save.

## Execution and checks

Rust owns movement, range, equipment, enemy intentions and expedition outcomes.
Bevy handles physical input, camera and presentation. Simulation advances in
fixed 16 ms steps; rendering does not decide damage or skip gameplay ticks.

Run `bun run test:forest` for focused journeys and `bun run test:native` for the
native suite. Scaling criteria remain at
`greywrought:acceptance/performance/README.md`; a responsive small scene does
not prove the 100-actor target. Assets retain their notices under
`greywrought:assets/external/`.
