# Greywrought Clause

Greywrought is a Clause-authored Warcraft III-style tactical command game. Clause owns the world model, unit selection, orders, formation destinations, movement, combat, effects, enemy actions, and encounter outcome; the TypeScript/Three.js shell only transports input and renders admitted projections.

The source-authored company contains exactly five controllable classes: Warrior, Artificer, Rogue, Priest, and Ranger. The roster is projected from Clause unit occurrences, and click/drag selection transports each occurrence's typed identity rather than dispatching by class or display name. Right-click the ground to issue a formation move. Selected units display green rings. The camera is independent of unit facing: pan with WASD/arrow keys and zoom with the wheel.

The selected-unit panel includes a WoW-style paper doll with head, shoulders, neck, cloak, chest, shirt, tabard, bracers, gloves, belt, legs, pants, shoes, two rings, two trinkets, weapon, offhand, and ranged/relic slots.

Movement is issued exclusively as RTS orders to the selected company. A single
selected living unit lands exactly on the right-click marker. Groups use
separated destinations centered on that marker, retaining their formation
spacing. This assigns destinations; obstacle avoidance is not yet implemented.
In the
Moonwell Vigil, choose any projected actor in the target deck and use Attack,
Ignite, Heal, or Ward. Attack acts through every eligible selected unit. Ignite
lets selected eligible company members create independent, source-timed burns
on the exact hostile target; their remaining lifetimes are projected in the
target deck. Mara the
Priest can restore and ward friendly targets; a ward halves direct cinder
damage and ongoing burn while its source-owned duration remains. Defeat both
cinders before their autonomous assault destroys the Moonwell.

## Development

Prerequisites are Git, Bun, Rust with the `wasm32-unknown-unknown` target, a C
toolchain, `wasm-bindgen-cli 0.2.108`, and Chrome. Initialize the pinned Clause
submodule with `git submodule update --init --recursive`, install dependencies
with `bun install --frozen-lockfile`, then run `bun run play` and open
<http://127.0.0.1:4173/>.

On this Linux development machine, `bun run play:local` starts the already-built
game and both interface watchers as user services, or reuses them if running.
It does not compile Rust or rebuild Wasm. `bun run play:local --restart` restarts
those services; refresh the browser afterward. The command recreates the
services after reboot. Run it from the desired checkout, or invoke
greywrought:scripts/play-local.ts by its full filesystem path with Bun.

Supported checked rule edits continue in the open game. Interface edits rebuild
automatically but need a browser refresh. Compiler changes require
`bun run build:play`, then `bun run play:local --restart` and a refresh.
Arbitrary structural rule edits do not guarantee state preservation.
For ordinary interface validation, `bun run typecheck:host` uses existing staged
compiler declarations; `bun run build:host` retains the full compiler staging
and pin/hash checks. Native and browser builds run independently in
`bun run build:play` with separate Cargo targets.

The immutable Clause pin and fresh compiled Wasm hash are recorded by the
repository's verification scripts. `bun run build:clause-runtime` compiles the
browser runtime from the pinned submodule instead of consuming its historical
prebuilt Wasm. Generated Wasm and JavaScript artifacts belong under ignored
`build/` and `dist/` directories.

Focused browser acceptance: `bun acceptance/browser/rts-journey.ts` proves the
five-class roster, exact occurrence and box selection, Clause-backed formation
movement, target/ward/heal/attack controls, autonomous pressure, and a visible
victory. `bun acceptance/browser/rts-idle-loss.ts` opens a fresh page and proves
idle play reaches defeat through actual Moonwell damage. The duplicate-source
writer creates an ignored six-unit fixture used by the main journey to retain
the same-class identity regression without a new host branch or roster row.
`bun acceptance/browser/rts-created-burn.ts` proves the visible Ignite control
creates two distinct equal-damage occurrences with unequal lifetimes, applies
their source-owned timed contributions and expires each exact occurrence.
