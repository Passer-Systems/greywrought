# Relic characters: surface and construction revision

## Status

Tom rejected the first four relic models as visually simplistic and contrived. They are functional animated blockouts, not finished character art. Their successful loading, combat integration and tests establish technical compatibility only; those checks do not establish artistic quality.

Keep the accepted encounter mapping: Hearth Keeper replaces the bee, Greyrot Penitent replaces the wolf, Relic Warden replaces the mushroom, and Hollow Saint replaces the bat. Keep the crab. Preserve save IDs, behavior and the original Quaternius assets.

## What failed

The first authoring script assembles stock boxes, cylinders, toruses, extruded profiles and salvaged limbs. Combining their buffers for export does not create coherent surface topology or resolve their intersections. The character forms still reveal the construction primitives.

The thematic objects are too literal: a miniature chapel, a roof, a halo, ribs and candles substitute for character design. Limbs and bodies do not consistently share proportions, armor construction or believable connections. Uniform bevels and procedural vertex-color variation do not represent forging, wear, cloth tension or layered corrosion. Small decorative parts were added before the large forms were resolved.

## Required visual result

A medieval civilization inhabits the remains of a world where AI supplanted the Renaissance. Worship, maintenance and misunderstanding have shaped these dilapidated machines over generations. They should read as complete inhabitants of that world, with weight, purpose and a history of repair.

Complexity means deliberately shaped surfaces and relationships between forms. Higher polygon counts, extra bevels, more components, random dents or noise do not meet this requirement on their own. A robot may have separate plates; those plates must have intentional overlaps, joints, thicknesses and attachment points. Do not indiscriminately fuse moving components into a single solid.

## Rebuild method

1. Resolve one character first, using the Relic Warden as the quality proof. Establish front, side and back proportions and a coherent three-quarter view before expanding the other three.
2. Model the large forms as custom surfaces: a breastplate that wraps the rib volume, a back shell that meets it, a neck opening that receives the head, shoulders that cover the arm pivots, and greaves shaped around the leg mechanism. Avoid recognizable stock solids as final visible forms.
3. Model connections deliberately. Use sockets, hinges, nested collars, straps or welded repairs where those constructions make sense. Eliminate accidental intersections, floating ornaments and unexplained gaps.
4. Shape secondary surfaces around their material: dished forged plate with changing curvature and thickness; folded rims; compressed leather; layered fabric with folds originating at supports; chipped ceramic with an exposed substrate. Use controlled asymmetry tied to a repair or injury.
5. Add wear after the forms work: polished contact edges, soot around vents, corrosion in recesses, deformation near impacts, and patches that bridge an actual break. Establish UVs and authored material maps where vertex colors cannot carry those distinctions.
6. Retain the useful Quaternius rig and animation metadata where practical, then fit the new surfaces and weights to it. Rig compatibility must not dictate awkward body proportions. Check shoulders, knees, cloth clearance and equipment throughout locomotion, attacks and defeat.
7. Review the actual mesh under neutral lighting, in a plain material, from multiple angles and in motion. Only after that should materials and game lighting be used to judge the final character.

For the Warden, the central image is an ancient protector maintained like a medieval suit of armor. Its religious significance should be visible in its construction and wear: a deliberately framed core, generations of repair, worn devotional marks and restricted access to its power. A collection of separately recognizable religious props is insufficient.

## Acceptance

- The silhouette, posture and major volumes read as one intentional character at the normal game camera distance.
- In a plain clay material, the torso, head and limbs still have considered shapes and credible connections.
- Front, side and back views have equivalent design attention.
- Surface detail follows material, manufacture and use; it is not uniformly distributed decoration.
- Mechanically separate parts articulate without exposing unresolved joins or intersecting shells.
- Neutral-light closeups show actual mesh quality. Concept illustrations or flattering presentation alone do not establish completion.
- Visual review precedes replacing all four blockouts. Test results and file-size compliance remain necessary technical checks, separate from the art judgment.

## Tooling assessment

Blender 4.3.2 is now installed. Its normal interface encountered the virtual GPU's eight-SSBO limit. The interface was verified with `LIBGL_ALWAYS_SOFTWARE=1 GALLIUM_DRIVER=llvmpipe`; Cycles CPU background rendering was also verified. Denoising must remain disabled with this build because OpenImageDenoise is unavailable.

The single-character rebuild is in [`3d/relic-warden-study`](../3d/relic-warden-study/README.md), with editable Blender control surfaces, an animated detailed GLB, a reduced export, and actual clay renders under `build/warden-study`. The original Mike hierarchy and clips are retained. All visible surfaces are new. The study's interactive viewer exposes plain materials and equipment-free views alongside the previous blockout.

The character is procedurally authored from individually specified surface cages, not manually sculpted. The newer construction addresses torso wrapping, armor sections, internal joints, articulated fingers, cloth weighting and fitted repairs. Its existence and technical checks do not substitute for Tom's artistic judgment. Do not repeat this design across the other three characters without reviewing the result.

The Blender workflow now provides editable topology, CPU renders and motion inspection. Those capabilities support construction, material and deformation review; the presence of a new tool is not by itself evidence that the artistic gap has been closed. Keep the game's TypeScript/Three.js/Bun runtime unchanged.
