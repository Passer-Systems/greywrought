# Relic Warden — resolved surface study

One character rebuilt in response to the rejected four-character blockout. This is a separate art-review asset; the current encounter mapping and crab are preserved.

The Warden is an ancient protector repaired as a medieval harness. A fitted ceramic power window and a captive rear disconnect express the village's custody of the machine. A replacement shoulder, fitted breastplate repair, worn shield and heavy split linen show maintenance by different generations.

## Files and inspection

- `relic-warden.blend`: editable quad control cages, named components, subdivision and wall-thickness modifiers, editable `Patina` color attributes, armature, 18 Blender actions, CPU studio and camera.
- `relic-warden.glb`: detailed inspection model with the original 18 Mike animation clips.
- `relic-warden-runtime.glb`: reduced geometry with the five clips used by the Warden encounter. A candidate for later integration, not a declaration that the release budget or gameplay acceptance has passed.
- `manifest.json`: geometry counts, file sizes, clip durations and provenance.
- `QUATERNIUS-LICENSE.txt`: original pack attribution and CC0 license.

Run from the repository root:

```sh
bun run art:warden:open
bun run art:warden:preview
```

The first command opens Blender using the tested software OpenGL path. The second serves the interactive inspection page at `http://127.0.0.1:4190/`. Add `?runtime` to inspect the reduced export. The page provides clay, equipment, topology, front/side/back views, the earlier blockout, and animation selection.

CPU render evidence is in `build/warden-study/`: `clay-three-quarter.png`, `clay-front.png`, `clay-side.png`, `clay-back.png`, `material-three-quarter.png`, and `head-and-harness.png`. These are renders of the actual mesh.

## Construction

All visible surfaces are newly authored. The torso is a continuous shaped shell with integrated flutes, a depressed repair area and a through-cut power aperture. The helmet has a swept crown, separate drawn visor and a recessed sight opening. Dished shoulder shells and sliding lames cover internal pivots. Limbs have asymmetric sections, recessed flutes, protective joint housings, and returned edges. The hands articulate on the original individual finger bones. The skirt has folds drawn from its waist attachments and weights that allow its lower panels to follow the legs.

The source is **procedurally authored from individually specified control surfaces**. It is not a claim of manual sculpting. Mesh construction is recorded in `scripts/art/warden-surfaces.ts`; Blender resolves those cages into surfaces. The result can be edited directly in Blender without rerunning the authoring script.

Material color variation follows panel boundaries and repairs. Blender retains fine procedural surface relief; the portable GLBs retain the geometry and painted vertex colors. The GLB does not reproduce Blender-only microscopic bump shaders. This study has no UV texture atlas.

The reduced export uses the authored quad control meshes with their wall thickness retained. It contains 55,432 triangles and is 1.57 MiB; the detailed inspection export contains 295,450 triangles and is 7.01 MiB. These are art-review exports, with no claim that the current game release budget has been checked against them.

The detailed GLB passed the browser inspection across 18 clips and 72 sampled poses, including both weighted skirt panels. The reduced GLB passed five clips and 20 sampled poses, with its idle, run, strike, hit and death views inspected separately. TypeScript checking passed. The browser inspection also exposes equipment-free clay views and the previous blockout for direct comparison. Technical checks establish loading and articulation, not artistic acceptance.

## Rig and provenance

The Quaternius **Animated Mech Pack — March 2021**, **Mike**, supplies the original joint hierarchy and motion metadata under CC0. No source pack files are modified. The full GLB retains the original animation tracks and timing; the editable Blender actions are sampled at 24 fps. Cloth weights and all visible geometry are new.

Lore direction comes from `docs/legacy-lore.json`, particularly bounded embodied agents, independent custodians and the authority to disconnect. “Relic Warden” is a new visual design, not a claim that this named character already exists in the imported canon.

## Rebuilding and graphics

```sh
bun run art:warden
```

Bun and TypeScript own the authoring workflow. The command writes temporary Blender-native instructions under ignored `build/` and invokes the installed Blender. It adds no game runtime dependency. Rebuilding replaces this study's generated assets; it does not modify the original pack or the live relic assets.

This environment exposes a virtual GPU with too few SSBO binding locations for Blender's normal graphics path. The tested interface workaround is:

```sh
LIBGL_ALWAYS_SOFTWARE=1 GALLIUM_DRIVER=llvmpipe blender 3d/relic-warden-study/relic-warden.blend
```

The saved file uses Cycles on the CPU. Denoising is disabled because the installed Blender build lacks OpenImageDenoise support. CPU rendering does not require the failing graphics path. See the [Blender command-line documentation](https://docs.blender.org/manual/en/4.0/advanced/command_line/arguments.html).
