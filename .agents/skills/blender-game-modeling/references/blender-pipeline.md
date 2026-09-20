# Blender, rigs, and portable export

Read this when setting up the authoring environment or moving geometry and animation between Blender and a game engine. The concrete bridge below was verified with Blender 4.3.2, Bun, and Three.js in Greywrought. Recheck version-sensitive APIs in a different environment; the formulas assume the stated coordinate and ordinary transform-inheritance conventions.

## Graphics fallback and process behavior

The Greywrought environment exposed a virtual GPU. Blender's normal interface quit with `Unsupported platform as it supports max 8 SSBO binding locations`. That did not establish that the host's physical GPU was unsupported.

On that Linux/Mesa installation the working per-process interface command was:

```sh
LIBGL_ALWAYS_SOFTWARE=1 GALLIUM_DRIVER=llvmpipe blender path/to/model.blend
```

Background authoring and Cycles CPU rendering also worked. The installed build lacked OpenImageDenoise, so render setup required:

```python
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.use_denoising = False
```

These are environment-specific fallbacks. They do not require changing global graphics settings or installing drivers. Prefer the working hardware renderer when available. The bundled `scripts/check-blender.ts` runs a small CPU test and records the detected version and output.

The installed Blender glTF add-on also failed to import because its Python environment lacked NumPy. The working alternative was to load glTF in Three.js, serialize mesh and rig data, use Blender's native mesh API, and export GLBs in Three.js. If the installed glTF add-on works, use it when appropriate; reproducing that dependency failure is not part of the workflow.

Use argument arrays for subprocesses. For background native scripts, `--python-exit-code 1` makes authoring errors observable. Drain stdout/stderr and preserve useful logs. Truncate a reused log before starting a new job so old trailing output cannot be mistaken for current progress.

For browser verification, let the test own its local preview server, wait for an HTTP response, and close the server and browser in cleanup. A missing server is not evidence of a broken model. Verify a process is still running before claiming a viewer or Blender window is currently open.

## Authoring bridge

For a project that keeps gameplay and tooling in TypeScript/Bun, a useful arrangement is:

1. TypeScript owns the asset configuration and individual surface cages.
2. JSON carries vertices, faces, materials, optional attachments/weights, and optional rig/pose data.
3. Bun writes a temporary Blender-native adapter under ignored `build/` and invokes the installed Blender. This does not add a language runtime to the game.
4. Blender constructs editable cages, materials, modifiers, and optional armature/actions. It saves the source file and produces evaluated **bind-space** geometry and inspection renders.
5. The game-side exporter attaches or skins the resulting geometry, retains original animation tracks where appropriate, and writes the portable files.

A static asset omits the skeleton and animation steps entirely. Generalize the data contract rather than inventing dummy bones for props. For animated models, use explicit attachment and weight data instead of relying on names such as `Skirt / left` to encode behavior.

Keep the native source's editable modifiers. Capture evaluated meshes without baking an animated pose into vertices that will be animated again. When extracting from an existing `.blend`, use the armature's rest position or another verified undeformed state.

## Coordinate and bind-pose invariants

The Warden bridge used Three.js world coordinates with Y up and the character facing +Z. Blender's corresponding coordinates were:

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

After leaving Edit Mode, compare each actual `bone.matrix_local` against its expected converted bind matrix. The Warden bridge used a maximum matrix-element difference of `1e-4`. Choose tolerances appropriate to scale; also inspect a known pose in both renderers. Nonuniform scale, reflection, shear, or nonstandard inheritance need explicit handling rather than silently normalizing the source.

For ordinary inherited rigid transforms, with native rest matrices `R`, desired pose matrices `P`, and parent matrices carrying subscript `p`, the local pose basis is:

```text
root:   R^-1 @ P
child:  R^-1 @ R_p @ P_p^-1 @ P
```

This avoids forcing a dependency-graph update after each bone in every sampled frame. Verify the resulting world pose, not only the assigned channel values. A GPU-independent math check is useful but still needs a visual pose comparison.

For a rigid game attachment authored in world bind space, convert geometry to the chosen bone's local bind space with `B^-1` before parenting it to that bone. For skinned geometry, keep vertices, inverse bind matrices, weights, and the mesh bind transform in one consistent space. Test cloning if the consumer uses cloned skeletons.

Preserve the full source animation library in the detailed portable asset when required. Sampling editable Blender actions at a chosen frame rate is a separate deliverable and should be labeled as sampled. Derive runtime clip names from actual consumer configuration, not from the Warden example.

## Surface and material export

Useful editable construction includes custom quad cages, subdivision for the intended curvature, solidify for plate/fabric thickness, selective edge treatment, and editable cutters for actual apertures. The modifier order matters. A hole should expose a modeled recess/interior rather than a bright decal standing above an uncut surface.

Material color attributes must survive modifier evaluation and export. The Warden used a named `Patina` attribute for region-based color variation; the GLBs stored those colors as normalized vertex attributes. Its Blender-only microscopic bump was explicitly documented as absent from the portable file.

Use UV maps and baked PBR textures when vertex density cannot carry the required detail. Verify color-space and normal conventions in the consumer. High-frequency procedural noise is not a substitute for meaningful wear placement.

## Lower-density topology

The Warden's automatic collapse reductions damaged thin armor, including when reduction was moved ahead of wall thickness. Numeric loading checks still passed. The successful lower-density variant instead used the authored control cages with subdivision and micro-bevels reduced, while retaining wall thickness and the deliberate edge flow.

Use that approach for comparable thin layered construction. For dense organic sculpts or suitable solid props, retopology or carefully validated decimation may be appropriate. Evaluate the actual simplified mesh before accepting a triangle or byte count.

Compare source and reduced variants under the same camera, material, pose, and scale. Inspect silhouettes, holes, seams, normals, weights, and attachment. Record the final counts after correction; intermediate smaller-but-damaged exports are not useful deliverables.

## Save and review

Organize named components and equipment assemblies so hiding an assembly hides its fasteners too. Save the source with a readable view centered on the asset; prevent rig overlays and studio gizmos from obscuring the opening view. Avoid scattering automatic backup artifacts among source assets; preserve existing user versions deliberately.

Inspect the render images themselves. Keep neutral clay front/side/back/three-quarter views and relevant closeups, then examine materials and motion. Technical evidence and aesthetic judgment are distinct. A new Blender file does not automatically satisfy a request for a polished model.
