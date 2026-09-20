# Greywrought project reference

Use this reference only when working on Greywrought or adapting its existing Warden authoring tools. Paths below are relative to the Greywrought repository root, last used at `/home/bctom/repos/greywrought`. Locate the actual checkout rather than assuming that absolute location still applies.

## Local constraints and art direction

Read the current `AGENTS.md`, `docs/design.md`, `docs/relic-art-direction.md`, and relevant sections of `docs/legacy-lore.json`. The supported game uses Three.js, ordinary TypeScript, and Bun. Keep temporary output under ignored `build/`, retain original assets and attribution, and preserve existing controls, profiles, save IDs, and unrelated behavior.

The current art brief is medieval life after AI supplanted the Renaissance: old technology maintained, misunderstood, repaired, worshipped, and locally controlled. Thatched homes can have electricity. Express those relationships in the asset's function, construction and repair history. Do not automatically attach a miniature roof, chapel, halo, or glowing object to every creature.

The four original relic blockouts were rejected for looking like unrelated primitive shapes assembled nearby. The Warden surface study addressed that feedback, but the user has not thereby approved every stylistic choice or all four characters. A future model should have its own coherent design.

The separate `game-design-prototyping-distilled` skill was unavailable during this work; the user explicitly authorized proceeding without it in that session. Do not bundle a fictional copy or claim it was applied. Follow the current session's instructions and available project requirements.

## Source library and working example

| Path | Purpose |
| --- | --- |
| `3d/INVENTORY.md` | Source pack inventory and derivative asset status |
| `3d/Animated Mech Pack - March 2021/` | Original Quaternius pack; preserve its files and CC0 attribution |
| `3d/greywrought-relics/` | Earlier blockouts, full clips, and encounter exports |
| `3d/relic-warden-study/` | New editable source, detailed/reduced GLBs, manifest and provenance |
| `scripts/art/warden-surfaces.ts` | Individually designed quad control cages, profiles and joins |
| `scripts/art/warden-blender.ts` | Native Blender mesh/rig bridge, materials, CPU studio and exports |
| `scripts/art/warden-study.ts` | Bun orchestration, source rig/clip handling, Three.js GLB export |
| `scripts/art/warden-viewer.ts` | Actual exported mesh, clay/equipment/topology controls, poses and comparison |
| `scripts/art/preview-warden.ts` | Local inspection server |
| `scripts/art/open-warden.ts` | Verified software OpenGL launch helper |
| `acceptance/browser/warden-study.ts` | Owned preview-server lifecycle and browser inspection journey |

Treat these as working reference implementations. The Warden uses Mike; George, Leela and Stan provide other rigs. Inspect their actual proportions, joint names and clips before choosing one. Do not assume every model needs a mech rig.

## Adapting the implementation

Create a new asset identifier and output directory before authoring another model. Extract shared mechanics if helpful; do not regenerate the Warden just to obtain a new subject. Audit model-specific assumptions before reusing its scripts:

- Asset slug, source path, source character, title, lore/provenance, output paths and build paths.
- Silhouette, units, target dimensions, support points, topology, materials, component collections and camera framing.
- Bone-name lookups, rigid attachments, cloth weighting rules and coordinate/bind transforms.
- Warden-specific boolean cutter, torso lookup, equipment name prefixes, and the selected opening object/view.
- Detailed and runtime clip sets, browser assertions, model routes, HTML copy, command names and ports.

In particular, the existing exporter encodes skirt weights through Warden-specific names and coordinates. Generalize that into explicit weight data for another character. Omit it entirely for a static prop. The native adapter assumes a rig and particular torso/core geometry; it is not a generic arbitrary-model generator without adaptation.

The intended data flow is:

```text
new model's design + chosen source rig/metadata
  -> TypeScript control surfaces and explicit attachment/weight data
  -> build/<asset>/ JSON and temporary Blender-native adapter
  -> editable 3d/<asset>/<asset>.blend + evaluated bind meshes + renders
  -> detailed GLB + game GLB + manifest + attribution
  -> real Three.js inspection, motion review, and applicable game checks
```

Full Warden motion retained the source GLB tracks. Its editable Blender actions were sampled at 24 fps. Its source and reduced geometry were checked separately. These are implementation choices to reassess for each asset, not requirements for exactly 18 clips or two skinned cloth panels.

## Existing commands and evidence

For inspecting the Warden example:

```sh
bun run art:warden:open
bun run art:warden:preview
```

The viewer uses port 4190 and accepts `?runtime` for the reduced mesh. `bun run art:warden` regenerates the Warden assets, so only use it when rebuilding that specific asset is intended. The generator supports `WARDEN_VIEWS` to select render names during iteration; final evidence should cover the relevant views.

The existing browser test starts its own preview server on port 4191. Use an installed Chrome executable. This environment had one under `/home/bctom/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome`; discover the current executable rather than installing Playwright solely for this workflow. `GREYWROUGHT_VULKAN=1` worked for the inspection journeys here. These flags are environment choices, not requirements for every browser.

```sh
bun run typecheck
CHROME_PATH=/actual/chrome GREYWROUGHT_VULKAN=1 bun acceptance/browser/warden-study.ts
CHROME_PATH=/actual/chrome GREYWROUGHT_VULKAN=1 bun acceptance/browser/warden-study.ts --runtime
```

Adapt the test for the new model and its actual clip/skin expectations. The Warden test's finite transforms and vertex checks do not prove absence of interpenetration or acceptable cloth motion; visual inspection remains necessary.

## Integration when it is part of the request

The Warden study itself was delivered separately from the current encounter asset mapping. Do not claim an export is in the game because it loads in the inspection viewer.

If installing a new creature is authorized by the request or continuing session, inspect `src/host/creature-appearances.ts`, `scripts/public-files.ts`, the asset loader and portraits. Preserve logical creature/save IDs and unrelated behavior. The existing accepted mapping uses the new relic concepts for the bee, wolf, mushroom and bat; the user explicitly kept the crab. Do not change that choice while implementing an unrelated model.

Run relevant asset/animation checks and a real encounter journey such as the applicable case in `acceptance/browser/relic-mobs.ts`, followed by the project's current packaging/budget checks. A trimmed animation library or small-looking file is not proof of compliance with the release budget.
