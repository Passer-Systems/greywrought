# Blender, rigs, and portable export

Read this when setting up the authoring environment or moving geometry and animation between Blender and a game engine. The optional bridge below uses Blender, Bun, and Three.js. Recheck version-sensitive APIs in a different environment; the formulas assume the stated coordinate and ordinary transform-inheritance conventions.

## Graphics fallback and process behavior

A virtual GPU can cause Blender to quit with `Unsupported platform as it supports max 8 SSBO binding locations`. This does not establish that the host's physical GPU is unsupported.

On Linux/Mesa, a possible per-process software fallback is:

```sh
LIBGL_ALWAYS_SOFTWARE=1 GALLIUM_DRIVER=llvmpipe blender path/to/model.blend
```

Background authoring and Cycles CPU rendering can also work. If the installed build lacks OpenImageDenoise, disable denoising:

```python
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.use_denoising = False
```

These are environment-specific fallbacks. They do not require changing global graphics settings or installing drivers. Prefer the working hardware renderer when available. If troubleshooting requires a CPU test, run a small temporary render, report the result, and remove its scratch files. Do not add a probe script or diagnostic artifacts to the project.

If Blender's glTF add-on cannot import because its Python environment lacks a dependency, one alternative is to load glTF in the existing engine tooling, serialize mesh and rig data, use Blender's native mesh API, and export through the engine tooling. If the installed glTF add-on works, use it when appropriate; reproducing that dependency failure is not part of the workflow.

Use argument arrays for subprocesses. For background native scripts, `--python-exit-code 1` makes authoring errors observable. Capture stdout/stderr in memory and report useful diagnostics. If file-based logs are necessary, keep them in the task-owned temporary directory and delete them during cleanup.

For browser verification, let the test own its local preview server, wait for an HTTP response, and close the server and browser in cleanup. A missing server is not evidence of a broken model. Verify a process is still running before claiming a viewer or Blender window is currently open.

## Authoring bridge

For a project that keeps gameplay and tooling in TypeScript/Bun, a useful arrangement is:

1. TypeScript owns the asset configuration and individual surface cages.
2. JSON carries vertices, faces, materials, optional attachments/weights, and optional rig/pose data.
3. Bun writes a temporary Blender-native adapter in a uniquely owned scratch directory and invokes the installed Blender. This does not add a language runtime to the game.
4. Blender constructs editable cages, materials, modifiers, and optional armature/actions. It saves the final source file and passes evaluated **bind-space** geometry to the exporter. Inspect interactively where possible; create temporary renders only when necessary.
5. The game-side exporter attaches or skins the resulting geometry, retains the required animation tracks, and writes only the requested final export. Clean up scratch geometry, adapters, and renders in a finally block, including on failure.

A static asset omits the skeleton and animation steps entirely. Generalize the data contract rather than inventing dummy bones for props. For animated models, use explicit attachment and weight data instead of relying on names such as `Skirt / left` to encode behavior.

Keep the native source's editable modifiers. Capture evaluated meshes without baking an animated pose into vertices that will be animated again. When extracting from an existing `.blend`, use the armature's rest position or another verified undeformed state.

## Coordinate and bind-pose invariants

For source world coordinates with Y up and the subject facing +Z, one Blender coordinate mapping is:

```text
(x, y, z) -> (x, -z, y)

C = [ 1  0  0  0 ]
    [ 0  0 -1  0 ]
    [ 0  1  0  0 ]
    [ 0  0  0  1 ]
```

Three.js matrix arrays are column-major. Reconstruct a Blender matrix from a serialized array using rows `values[i::4]` for `i = 0..3`.

For this bridge, a source joint's world bind matrix `B` becomes `C @ B` in the Blender armature's identity object space. Preserve the source joint basis consistently; do not mix this convention with a different local-basis conversion halfway through the pipeline.

**Set a Blender edit bone's nonzero length before assigning its matrix.** The reversed order produced wrong rest orientations even though joint locations looked correct:

```python
b = armature.edit_bones.new(name)
b.length = suitable_display_length
b.matrix = converted_bind_matrix
```

After leaving Edit Mode, compare each actual `bone.matrix_local` against its expected converted bind matrix. A maximum matrix-element difference of `1e-4` can be a useful starting tolerance. Choose tolerances appropriate to scale; also inspect a known pose in both renderers. Nonuniform scale, reflection, shear, or nonstandard inheritance need explicit handling rather than silently normalizing the source.

For ordinary inherited rigid transforms, with native rest matrices `R`, desired pose matrices `P`, and parent matrices carrying subscript `p`, the local pose basis is:

```text
root:   R^-1 @ P
child:  R^-1 @ R_p @ P_p^-1 @ P
```

This avoids forcing a dependency-graph update after each bone in every sampled frame. Verify the resulting world pose, not only the assigned channel values. A GPU-independent math check is useful but still needs a visual pose comparison.

For a rigid game attachment authored in world bind space, convert geometry to the chosen bone's local bind space with `B^-1` before parenting it to that bone. For skinned geometry, keep vertices, inverse bind matrices, weights, and the mesh bind transform in one consistent space. Test cloning if the consumer uses cloned skeletons.

Keep only the animation library required by the asset’s intended use. Do not generate a separate full-library export by default. If editable Blender actions are sampled, describe them as sampled in the existing asset notes. Derive runtime clip names from actual consumer configuration.

## Surface and material export

Useful editable construction includes custom quad cages, subdivision for the intended curvature, solidify for plate/fabric thickness, selective edge treatment, and editable cutters for actual apertures. The modifier order matters. A hole should expose a modeled recess/interior rather than a bright decal standing above an uncut surface.

Material color attributes must survive modifier evaluation and export. Named color attributes can carry regional variation as normalized vertex colors in glTF. Bake source-only procedural bump when needed, or document its absence from the portable file.

Use UV maps and baked PBR textures when vertex density cannot carry the required detail. Verify color-space and normal conventions in the consumer. High-frequency procedural noise is not a substitute for meaningful wear placement.

## Lower-density topology

Automatic collapse can damage thin layered surfaces even when applied ahead of wall thickness, while numerical loading checks still pass. An alternative is to use authored control cages with subdivision and small bevels reduced, retaining wall thickness and deliberate edge flow.

Use that approach for comparable thin layered construction. For dense organic sculpts or suitable solid props, retopology or carefully validated decimation may be appropriate. Evaluate the actual simplified mesh before accepting a triangle or byte count.

Compare source and reduced variants under the same camera, material, pose, and scale. Inspect silhouettes, holes, seams, normals, weights, and attachment. Record the final counts after correction; intermediate smaller-but-damaged exports are not useful deliverables.

## Save and review

Organize named components and equipment assemblies so hiding an assembly hides its fasteners too. Save the source with a readable view centered on the asset; prevent rig overlays and studio gizmos from obscuring the opening view. Avoid scattering automatic backup artifacts among source assets; preserve existing user versions deliberately.

Inspect neutral clay front/side/back/three-quarter views and relevant closeups, then examine materials and motion. Prefer interactive views; if image files are needed for inspection, delete the task-created images after reviewing them. Do not retain a render collection unless requested. Technical evidence and aesthetic judgment are distinct. A new Blender file does not automatically satisfy a request for a polished model.
