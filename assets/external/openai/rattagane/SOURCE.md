# Rattagane

`rattagane.glb` is the final, self-contained game model committed with these
notes. Its editable Blender 4.3 source, `rattagane.blend`, and the supplied
reference, `rattagane.png`, are retained locally and are not included in this
repository contribution. The local Blender source is saved in the idle pose.

New geometry was procedurally authored in Blender for Greywrought: continuous
remeshed anatomy, rooted mesh fur, cupped ears, ridged horns, violet incisors,
whiskers, a segmented tail, cheek medallions, a leather harness, linked chains,
pierced tally plates, locks, a hollow bell and a gripped iron hook. This is a
stylized adaptation of the reference, not a photogrammetric reconstruction.
The local Blender source retains editable geometry, surface modifiers, named
equipment collections and the `Patina` color attribute. All exported shading uses vertex
colors and standard metallic/roughness materials; no external textures or
source-only procedural shaders are required.

The model faces +Z in glTF (-Y in Blender), uses metres, and is approximately
2.87 m tall including the horns in its initial idle pose. The final mesh has
91,662 triangles, 53 bones and 11 material batches before shadow passes.

The GLB and local Blender source contain `Idle`, `Walk`, `Run`, `Weapon`,
`HitReact` and `Death`.
Loop the first three; play the others once. `Weapon` includes the hook's
wind-up, swing and recovery. The Blender actions and GLB tracks are sampled
adaptations with the original clip durations. Foot contact, knee articulation
and back clearance were adapted to Rattagane's proportions. Tail sway and its
settling fall are newly authored secondary motion; the donor has no rat tail.

Skeleton and primary motion derive from Quaternius's **Ultimate Monsters**,
`Big/glTF/MushroomKing.gltf`, already retained in this repository as
[`MushroomKing.glb`](../../quaternius/frostwood/actors/MushroomKing.glb).
No donor surface geometry is used. Quaternius: <https://quaternius.com>;
CC0 1.0 Universal, with the retained [license](../../quaternius/frostwood/LICENSE.txt)
and [source notes](../../quaternius/frostwood/SOURCE.md).

Edit the locally retained Blender source directly. Ordinary game builds do not
require Blender, the local Quaternius archive, or an authoring script. Gameplay
placement and asset routing are separate from this model delivery.
