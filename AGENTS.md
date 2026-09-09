# Greywrought

The supported game is the Three.js Frostwood expedition, with ordinary TypeScript
owning gameplay and Bun owning package management, development, builds, and tests.
This language and engine choice is explicitly authorized by Tom.

Use the expedition design in `greywrought:docs/design.md`. Preserve the original
art, animations, controls, and character profiles while developing the readable
forest adventure with direct typed game logic. Existing native and older browser
saves stay untouched; the adventure has per-character browser saves.
Do not introduce another language, compiler, interpreter, or runtime dependency.

Keep product interface copy in player language. Keep build output under ignored
`build/`. Preserve assets and their attribution. Use the nearest relevant Bun
checks and a real browser journey for changes affecting play.

Apply `game-design-prototyping-distilled` for world, character, and encounter
presentation. It records the shared local Quaternius library and the requirement
to use suitable authored models and animations instead of placeholder actors.
