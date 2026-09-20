---
name: blender-game-modeling
description: "Create or rebuild cohesive 3D game characters, creatures, props, and structures in Blender from a visual or lore brief. Use for actual mesh authoring, replacing primitive-looking models, retaining suitable rigs and animations, and producing editable Blender sources and visually inspected game exports."
---

# Blender Game Modeling

Build an actual editable model whose surfaces, connections, materials, and motion hold together under inspection. The workflow comes from Greywrought's Relic Warden rebuild; its particular armor, proportions, palette, and rig are examples, not a template for every subject.

## Establish the asset's purpose

Read the current project's instructions, art direction, relevant lore, existing asset conventions, and the user's latest corrections. Establish the subject's role, silhouette, scale, viewing distance, materials, motion needs, and intended deliverables. Infer routine choices from context and continue authorized work; ask only about missing information that materially changes the design.

For Greywrought, read [the project reference](references/greywrought.md). For another project, use that project's engine, tools, paths, and style. A static prop needs no character rig; a quadruped needs appropriate anatomy and motion rather than a stretched humanoid skeleton.

Inspect usable source assets before choosing a rig or borrowing geometry. Preserve originals, attribution, clip names/timing, and provenance. When the user requests wholly new visible geometry, reusing a skeleton and motion does not justify retaining the old visible limbs.

Give each new asset its own output directory and model-specific design data. Treat an artist-edited `.blend` as source work: avoid overwriting it with an older generator. Reproduce the process, not the previous character.

## Establish a working Blender path

Read [Blender and export mechanics](references/blender-pipeline.md) when setting up Blender, transferring rigs, or adapting the export bridge. It records the CPU fallback and the coordinate/bind-pose invariants that failed during the Warden work.

If Blender's GPU interface fails, check background CPU rendering before treating modeling as blocked. An optional probe is bundled:

```sh
bun /path/to/blender-game-modeling/scripts/check-blender.ts
```

Run it from the project root; it writes evidence under `build/blender-preflight/`. A successful probe verifies background CPU rendering, not the GPU or interactive interface. Use the actual installed capabilities; do not install a new game runtime or change system drivers merely to follow this workflow.

## Resolve the surfaces before decorating them

For a batch without an established quality example, resolve one representative model first. Once the direction is supported by visual evidence and session context, continue the authorized batch without introducing a new mandatory approval step.

Start with primary volumes and a readable silhouette. Draw control meshes around the subject's anatomy or construction, with changing section, curvature, sweep, and thickness where appropriate. Use subdivision, sculpting, retopology, booleans, and explicit edge loops as the shape requires. Mathematical lofts are useful tools, but a sequence of tapered cylinders is not a finished surface design.

Resolve how the parts meet:

- Organic forms need continuous anatomy, transitions, and deformation loops.
- Manufactured forms need fitted seams, supported overlaps, sockets, hinges, or other credible connections. Separate moving plates need not be fused into one solid.
- Fabric needs support points, tension, sag, folds, and clearance. Flexible panels may require blended weights rather than rigid attachment to one bone.
- Props and structures need credible thickness, joins, access points, and a stable base appropriate to their function.

Inspect front, side, back, and three-quarter views in neutral clay, including closeups of joins. For characters, inspect the body with equipment hidden; hide the entire equipment assembly, including straps and fasteners. For other assets, expose normally obscured structural joins when useful. Fix floating repairs, empty joint cavities, accidental intersections, and incomplete rear surfaces before adding decorative detail.

Higher polygon counts, extra bevels, merged buffers, and surface noise do not establish cohesion. Nor does lore justify attaching recognizable thematic objects wherever a design feels empty. Material and construction should explain the shapes.

## Add material-specific history

Shape secondary detail in the geometry where it affects form: drawn plate, folded rims, compressed leather, supported cloth folds, chipped substrates, or weathered timber. Place asymmetry where manufacture, damage, or repair explains it. Do not give unrelated models the same fluting or damage pattern.

Place wear at contact edges, seams, fasteners, exposure, vents, and repairs. Use editable color attributes or UV textures according to the detail needed. Fine detail must survive the target renderer through appropriate textures, geometry, or vertex attributes. Blender-only procedural bump is not automatically present in a GLB; disclose or bake that difference.

## Preserve and inspect articulation when needed

Choose a rig that fits the new subject and adapt geometry/weights deliberately. Keep rigid shells attached to the correct joints; skin flexible areas. Check grasping, equipment attachment, cloth clearance, and hidden joint coverage throughout the required actions.

Verify bind transforms numerically and visually before authoring a full clip library. Check orientation and scale as well as joint positions. Use the coordinate and bone-construction details in [the pipeline reference](references/blender-pipeline.md) when using the Three.js/Blender bridge.

Retain source motion metadata where useful. Distinguish exact original GLB tracks from sampled editable Blender actions. Do not force every asset to have the Warden's bone names, 18 clips, two cloth panels, or particular attack.

## Export and validate the actual result

Keep the editable source and the detailed inspection mesh. Derive a game export from a deliberate lower-density topology. The Warden's authored quad cages, with thickness retained and subdivision/micro-bevels reduced, preserved its narrow plate overlaps better than generic collapse reduction. This is a useful starting point, not a prohibition on decimation for suitable solid geometry.

Inspect the reduced file independently at close range and normal game distance. Lower file size and finite coordinates cannot detect folded plates or ruined silhouettes. If reduction damages the model, revise the topology or export settings instead of declaring success from loading tests.

Verify the applicable invariants:

- Geometry, normals, indices, materials, scale, orientation, pivot, and grounding survive export. Ground against actual support points, not a convenient weapon tip.
- Retained clips and their durations match the intended source; the game subset is derived from the consumer's actual needs.
- For animated assets, sample multiple times per required clip and visually review locomotion, attacks/interactions, reactions, and defeat where applicable. Check changing poses, finite deformed bounds, attachment, and deformation—not just that clip names exist.
- Load the real exported file in the target renderer. Exercise inspection controls and relevant animations in a real browser for a Three.js asset.
- Run relevant code checks when authoring/viewer code changes. If the request includes game integration, complete the asset mapping, actual gameplay journey, and release-budget checks while preserving unrelated behavior and saves.

Keep iterative renders, logs, temporary native adapters, and browser fixtures under the project's ignored build directory. Use small renders to find shape problems, then produce legible final evidence. Inspect the images you cite; concept art is not proof of mesh quality.

## Deliver a reproducible result

Supply the editable `.blend`, the requested portable/game exports, relevant attribution, and concise provenance/build instructions. Record source references, rig/clip choices, coordinate conventions, geometry counts, file sizes, material portability limits, and validation evidence in a manifest or the project's equivalent.

Make it easy to reopen the source and inspect the exported model. Clearly state whether the result is an art-review asset or is integrated into the game. Continue already-authorized integration rather than imposing an approval gate through this skill.

Describe the process honestly: procedurally authored control surfaces are not manual sculpting. Report what was modeled and inspected, and distinguish technical validation from the user's artistic judgment. A tool change or passing tests alone does not prove the model meets the visual brief.
