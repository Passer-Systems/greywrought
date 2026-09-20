# Greywrought relic machines

**Art status: first-pass blockouts, rejected for final visual quality.** These models are integrated and technically tested, but Tom's requested cohesive, handcrafted appearance has not been achieved. See [the surface and construction revision](../../docs/relic-art-direction.md) for the required rebuild.

Four new designs based on Tom's medieval robot-worship direction and `docs/legacy-lore.json`: rusted machines maintained with timber, devotional objects and salvaged electricity. These are newly authored characters, not names recovered from the legacy lore. The visual direction uses the requested dark age where AI supplanted the Renaissance. Greyrot remains fragmented obsolete intelligence, rather than a species or a single evil computer.

| Model | In-game replacement | Distinctive construction |
| --- | --- | --- |
| Hollow Saint | Hollowwing bat (`cave-bat`) | Open chapel torso, ceramic face, broken solar halo, candles, bell-staff and torn vestments |
| Hearth Keeper | Briar bee (`nest`) | Walking half-timbered furnace, layered thatch, ceramic insulators, copper leads and manual power switch |
| Greyrot Penitent | Ash hound (`patrol`) | Open unequal ribs, three conflicting cores, broken cowl, stolen shrine plates and pilgrim tags |
| Relic Warden | Mushroom Cablekeeper (`warder`) | Great helm, lamellar harness, circuit-bearing kite shield, relic sword and keeper's disconnect key |

**The Ironback cave crab stays unchanged.** Encounter IDs, stats, patrols, rewards and save schemas are preserved. The keeper's former swarm is now described as combustible furnace dust, with the same collision/ignition rules. The warden's gathering hazard is live cabling. The penitent uses its native `Jump` for the existing committed leap, and the saint walks on the cave floor.

## Assets and provenance

Each `.glb` is a self-contained glTF 2.0 asset with a complete rig, all 18–20 original animation clips, baked vertex-color wear and physically based materials. Y is up, forward is +Z, and dimensions are in metres. All details are geometry; no external texture files or runtime dependencies are required. `manifest.json` records dimensions, triangle counts, clip durations, source files and lore references.

The `runtime/` exports contain the same geometry, materials and rig, but only the clips used by each encounter. Shared mesh vertices and normalized byte colors keep the four runtime files to about 3.9 MiB combined. The full exports above retain the complete animation library. Redundant identical animation keys are removed without changing motion.

The original Quaternius Animated Mech Pack is preserved under `3d/Animated Mech Pack - March 2021/`. These models retain selected, reprofiled limb triangles and the source rigs/animation metadata. Original torso and head triangles are removed and replaced with newly authored geometry. They are derivative kitbashes with new silhouettes, not renamed copies or merely recolored exports. Original animation authorship remains Quaternius; `QUATERNIUS-LICENSE.txt` preserves the supplied CC0 dedication.

Rebuild all four from the unchanged pack:

```sh
bun scripts/art/lore-models.ts
```

The authoring source contains named parts and attachment bones. The resulting GLBs also retain part names, provenance and design metadata in glTF extras. Source limb skin weights are retained; new rigid parts are attached to the appropriate rig bones. Cloth and thatch are rigid authored attachments, not simulated cloth or hair.

World actors and portraits share `src/host/creature-appearances.ts`. Exported heights are normalized further by that configuration for the playable encounters. Runtime assets are served through `scripts/public-files.ts`; retired creature files remain in the original asset library.

Inspect and animate the full models in a local browser:

```sh
bun scripts/art/preview-lore-models.ts
# Open http://127.0.0.1:4185/
```

The gallery supports orbit, zoom, individual model selection, every clip, and pause/resume. Its browser bundle is written under ignored `build/relic-gallery/`.

Checks:

```sh
bun test ./src/host/creature-appearances.test.ts ./src/host/threat-animation.test.ts
bun acceptance/browser/relic-mobs.ts
```

The browser check uses isolated test saves under `build/browser/` and walks into, fights, defeats and loots each replacement plus the unchanged crab. Set `CHROME_PATH` if Chrome is not on PATH; use `GREYWROUGHT_VULKAN=1` when required by the local graphics environment.
