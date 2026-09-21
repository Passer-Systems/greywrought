# Relic Warden

The Relic Warden replaces the mushroom Cablekeeper (`warder`) in the expedition and its portrait. Other creatures are unchanged. Encounter identity, combat rules, rewards, and existing saves are preserved.

An ancient protector maintained as medieval armor: fitted metal shells, a recessed power aperture, articulated hands, a relic sword and shield, and weighted split linen. All visible geometry is new. Quaternius Mike provides the skeleton and animations under CC0; see `QUATERNIUS-LICENSE.txt`.

- `relic-warden.blend`: editable control surfaces, modifiers, materials, rig, and 18 sampled Blender actions.
- `relic-warden-runtime.glb`: the game asset, with Idle, Run, SwordSlash, HitRecieve_1, and Death; 55,432 triangles and approximately 1.57 MiB.
- `manifest.json`: provenance and export measurements.

Open with `bun scripts/art/open-warden.ts`. For regeneration, use installed Blender and your local copy of the original rig: `WARDEN_RIG_SOURCE=/path/to/Mike.gltf bun scripts/art/author-warden.ts`. The original pack is an optional authoring input kept outside version control; running the game does not require it. Rebuilding replaces the generated source and game export; preserve any manual Blender edits first. Detailed inspection exports, renders, and temporary Blender instructions go under ignored `build/warden/`.

The authoring process uses individually specified control surfaces, not manual sculpting. GLB materials use vertex colors; Blender-only microscopic bump does not export. The source uses Cycles CPU with denoising disabled. The open command uses software OpenGL for machines with unsupported graphics drivers.

Validate with `bun run typecheck` and `bun run test:art`. Set `CHROME_PATH` for the browser executable when needed. Browser fixtures and screenshots stay under `build/`.
