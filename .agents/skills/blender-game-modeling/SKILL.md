---
name: blender-game-modeling
description: "Create or rebuild cohesive 3D characters, creatures, props, vehicles, environments, and structures in Blender from a visual or written brief. Use for actual mesh authoring, replacing primitive-looking models, adapting suitable rigs and animations, and producing editable sources and visually inspected game exports."
---

# Blender Game Modeling

Build editable models whose surfaces, connections, materials, and motion hold together under inspection. Adapt the method to the subject, intended use, and target renderer.

## Establish the asset contract

Read the current project instructions, visual brief, asset conventions, and existing examples. Determine the subject's function, silhouette, dimensions, viewing distance, materials, required motion, export format, and performance budget. Infer routine choices; ask only about missing information that materially affects the result.

Inspect available source assets before borrowing geometry or choosing a rig. Preserve originals and attribution. A request for new visible geometry permits appropriate skeleton and animation reuse, but does not justify keeping unwanted source surfaces.

Use the project’s existing asset directories and naming conventions. Do not introduce a new top-level asset folder. Preserve manually edited source files before rerunning generators. Follow the project's tooling and dependency constraints; do not assume a particular engine or authoring language.

## Resolve form and construction

Start with primary volumes and silhouette. Use custom control surfaces, sculpting, retopology, subdivision, booleans, or explicit edge loops as appropriate. A collection of tapered cylinders is not a resolved model. Higher polygon counts, bevels, noise, or merged buffers do not establish cohesion.

Choose structure according to the subject:

- Organic forms need continuous anatomy, plausible transitions, and deformation loops.
- Manufactured objects need fitted seams, supported overlaps, sockets, hinges, or other credible connections. Moving parts may remain separate meshes.
- Fabric needs support points, tension, sag, folds, thickness, and clearance.
- Buildings and environments need consistent scale, structural support, readable access, and intentional modular seams.

Inspect front, side, back, and three-quarter views in plain clay, plus closeups of important joins. Hide entire assemblies, including their fasteners, to inspect obscured surfaces. Resolve floating parts, accidental intersections, empty joints, and unfinished backs before adding detail.

## Materials and surface history

Model secondary detail when it affects form: folded rims, compressed leather, chipped edges, or weathered timber. Place wear and asymmetry where manufacture, contact, exposure, damage, or repair explains them.

Use editable color attributes or UV textures according to the required detail and target budget. Bake procedural effects when the consumer cannot reproduce them. Verify color-space and normal conventions; disclose any source-only shading that does not export.

## Rigging and motion when applicable

Game characters are rigged and animated deliverables unless the user explicitly requests a static model. Static props and environments need no dummy rig. Choose anatomy and articulation appropriate to the subject; a humanoid skeleton is not a universal template.

Derive character animations from suitable known examples in the local Quaternius source files. Inspect their rigs and clips before choosing a skeleton; reuse or retarget authored motion, preserving source timing and attribution. Author new motion only for required actions without a suitable source example, and identify those gaps explicitly.

Keep rigid parts attached to the correct joints and skin flexible surfaces deliberately. Verify full bind transforms and known poses before expanding the animation library. Use explicit weight and attachment data instead of inferring behavior from component names.

Check locomotion, interactions, equipment contact, clearance, reactions, and other required motions. Distinguish retained original animation tracks from sampled editable actions. Derive the runtime clip set from the actual consumer.

Read [Blender and export mechanics](references/blender-pipeline.md) for graphics fallbacks, coordinate conversion, bone transforms, and portable export pitfalls. These techniques are conditional on the pipeline being used.

## Export, inspect, and integrate

Use the editable source for inspection and derive the required game export from deliberately chosen topology. Do not create a second detailed export merely for review. For thin layered surfaces, reducing subdivision and small bevels on authored cages may preserve shape better than automatic collapse. For dense organic or solid forms, retopology or validated decimation may be appropriate.

Inspect the actual reduced export at close range and normal viewing distance. Verify geometry, normals, scale, orientation, grounding, materials, and applicable skin/animation data in the target renderer. Numerical checks cannot detect every damaged silhouette, intersection, or awkward deformation.

A character is complete only when the editable source and final export include the rig and required clips, every required motion has been visually checked in the target renderer, and forms, joins, cloth, and material detail meet the brief and established project examples. Successful export, polygon counts, and automated checks do not establish that visual standard; unresolved gaps mean the delivery is incomplete.

If integration is requested, complete asset routing, consumer configuration, and a real use-case journey. Preserve unrelated behavior and persistent identities. Check final package and runtime budgets; file size alone is not a performance test.

## Deliver only what is needed

Keep the requested final model, its essential editable source, required runtime dependencies such as textures, and attribution. Add concise usage or rebuild notes to existing documentation when useful. Do not create separate manifests, inventories, galleries, comparison viewers, reports, or authoring scripts unless the task actually requires them.

Do not add original downloaded packs, unused source models, alternate formats, rejected designs, duplicate full/reduced exports, automatic backups, screenshots, render collections, logs, or temporary adapters to the deliverable or commit. Preserve user-owned originals locally; do not copy them into the repository for convenience. If regeneration needs an external input, document it as an optional local prerequisite without making ordinary project builds depend on it.

Prefer in-memory or interactive inspection. When a tool requires temporary files, create only the files needed in a uniquely owned temporary directory. Delete that directory after inspection or processing, including on failure, after reporting useful diagnostics. Respect project scratch-directory requirements, but an ignored build directory is not an archive: do not leave generated clutter there. Clean only files created by the current task; never blanket-delete existing user files or work.

Before delivery, inspect the actual changed-file list. Remove incidental outputs and unused assets, update references, and verify that normal builds use only the committed final assets. Retain extra evidence or intermediate files only when the user explicitly requests them.

Make the selected final asset unambiguous. Describe procedural authoring honestly; do not call it manual sculpting. Separate technical validation from visual judgment without inventing an approval gate.
