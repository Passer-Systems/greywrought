# Authored actors

Register game-ready actors in `src/art/actor-catalog.ts`. Each entry supplies the
model name, source-relative path, animation names, display height and persistent
encounter ID. World appearances, portraits, loading, release packaging and art
checks consume that catalog.

Keep OpenAI models under `assets/external/openai/<asset>/` and place their source
notes and licenses beside the runtime GLB. Registered models publish at
`assets/openai/actors/<ModelName>.glb`, including `Rattagane.glb` and
`RelicWarden.glb`. Quaternius's default actor route is
`assets/quaternius/frostwood/actors/<ModelName>.glb`. Attribution retains its
source directory structure under `assets/`. Only registered models and adjacent Markdown/text
attribution are packaged; Blender sources and unregistered experiments remain
outside the release. Quaternius actors retain their existing default directory,
with explicit mappings for alternative packs and player classes.

Run `bun run test:art` to validate every registered actor's rig, animation clips,
geometry and packaging, then exercise each associated encounter in an isolated
browser world. Set `CHROME_PATH` if Chrome is not on PATH. Set
`GREYWROUGHT_TEST_BUILT=1` after building to test the packaged client. Browser
fixtures and screenshots are written under ignored `build/`.

Adding a model requires a catalog entry, its asset files and attribution. It does
not require changes to package commands, the actor loader, the packaging script,
or a new browser acceptance script. Gameplay behavior and save compatibility
belong in the game tests, rather than the art checks.

Authoring tools can be run directly from `scripts/art/`; see each asset's source
notes for its workflow. For the Relic Warden, use
`bun scripts/art/open-warden.ts` or
`WARDEN_RIG_SOURCE=/path/to/Mike.gltf bun scripts/art/author-warden.ts`.

Encounter IDs are persistence keys, separate from model names: Rattagane uses
`cave-crab` and the Relic Warden uses `warder` to preserve existing shared, solo
and private saves. Renaming those keys requires a save migration.
