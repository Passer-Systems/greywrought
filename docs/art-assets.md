# Actor assets

All file-backed actors are registered in `src/art/actor-catalog.ts`, including
Quaternius creatures, player classes, NPCs and OpenAI models. Every entry has
one relative path shared by the repository and public URL. The same loader, packager and art tests
consume every entry; provenance does not define an actor type.

OpenAI runtime routes are `assets/openai/actors/<ModelName>.glb`.
Quaternius Frostwood routes are
`assets/quaternius/frostwood/actors/<ModelName>.glb`; other packs keep their
existing paths. Keep OpenAI GLBs under `assets/external/openai/actors/` with their combined
`SOURCE.md` in that directory. Packaging includes registered models and
nearby source notes/licenses, never local Blender sources or experiments.

Encounter appearance settings live in `src/host/threat-appearances.ts`: model,
height, animation choices, tint and optional material fill. A model can serve
multiple encounters. The world and portraits share these settings. Encounter
IDs are persistence keys, independent of model names: `cave-crab` remains the
saved encounter for Rattagane and `warder` for the Relic Warden.

Run `bun run test:art` for all catalog models. The unit suite checks packaging
and required encounter animation names. The isolated browser viewer loads each
model through the game actor loader, samples every native animation clip,
checks finite geometry and changing skeletal poses, and renders a labeled
contact sheet. Set `CHROME_PATH` if Chrome is not on PATH, and
`GREYWROUGHT_TEST_BUILT=1` after building to check packaged files. Output stays
under ignored `build/`. Combat and persistence tests remain in the game suite;
art validation is not tied to specific encounters.

Adding a model requires its catalog entry, asset files and source notes. Using
it for an encounter requires an appearance entry. Neither requires a package
command, a loader branch or a dedicated browser script.

Optional authoring tools run directly from `scripts/art/`. For the Warden,
use `bun scripts/art/open-warden.ts` or
`WARDEN_RIG_SOURCE=/path/to/Mike.gltf bun scripts/art/author-warden.ts`.
Local Blender files and measurements stay under ignored `build/warden/`.
