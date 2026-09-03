# Greywrought Clause

Greywrought is a Clause-authored Warcraft III-style tactical command game. Clause owns the world model, unit selection, orders, formation destinations, and movement; the TypeScript/Three.js shell only transports input and renders admitted projections.

The company contains exactly five controllable classes: Warrior, Artificer, Rogue, Priest, and Ranger. Click a unit or drag a selection rectangle to select units (F1 selects the company). Right-click the ground to issue a formation move. Selected units display green rings. The camera is independent of unit facing: pan with WASD/arrow keys and zoom with the wheel.

The selected-unit panel includes a WoW-style paper doll with head, shoulders, neck, cloak, chest, shirt, tabard, bracers, gloves, belt, legs, pants, shoes, two rings, two trinkets, weapon, offhand, and ranged/relic slots.

Movement is issued exclusively as RTS orders to the selected company.

## Development

Prerequisites are Git, Bun, Rust, a C toolchain, and Chrome. Initialize the pinned Clause submodule with `git submodule update --init --recursive`, install dependencies with `bun install --frozen-lockfile`, then run `bun run play` and open <http://127.0.0.1:4173/>.

The immutable Clause pin is recorded by the repository’s verification scripts. Generated Wasm and JavaScript artifacts belong under ignored `build/` and `dist/` directories.

Focused browser acceptance: `bun acceptance/browser/rts-journey.ts` proves the five-class roster, box selection, Clause-backed formation movement, and equipment panel.
