# OpenAI actor sources

## Rattagane

`Rattagane.glb` is the final, self-contained game model committed with these
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

## Relic Warden

`RelicWarden.glb` is the self-contained OpenAI-authored game model for
Greywrought's Relic Warden: fitted metal shells, a recessed power aperture,
articulated hands, a relic sword and shield, and split linen. All visible
geometry was newly authored as individually specified control surfaces,
resolved with Blender subdivision and solidify. Materials use vertex colors.

The runtime model contains 55,432 triangles, 43 bones and the `Idle`, `Run`,
`SwordSlash`, `HitRecieve_1` and `Death` clips. Loop Idle and Run; play the
others once. The published model route is
`assets/openai/actors/RelicWarden.glb`.

The skeleton and animation tracks derive from **Mike** in Quaternius's
**Animated Mech Pack — March 2021**, released under CC0 1.0 Universal.
No donor surface geometry is used.

Original source attribution:

> LowPoly Models by @Quaternius
> Consider supporting me on Patreon, even $1 helps me a lot!
> https://www.patreon.com/quaternius
>
> License: CC0 1.0 Universal (CC0 1.0)
> Public Domain Dedication
> https://creativecommons.org/publicdomain/zero/1.0/

Only the runtime GLB and these source notes are retained in Git. Local Blender
sources, measurements and inspection outputs belong under ignored
`build/warden/`. The optional authoring tools are
`bun scripts/art/open-warden.ts` and
`WARDEN_RIG_SOURCE=/path/to/Mike.gltf bun scripts/art/author-warden.ts`.
The original rig pack is an external authoring input; playing and building the
game require neither it nor Blender. Validate with `bun run test:art`.

## Primus Grey

`PrimusGrey.glb` is the self-contained game model: 65 bones, 12 animation clips,
135,412 triangles, eight material batches, and no external textures or buffers.
It faces +Z with Y up and is approximately 2.42 metres tall in its bind pose.
Preserve the file's authored root scale when loading it.

Load with Three.js `GLTFLoader`, play clips through `AnimationMixer`, and use
`SkeletonUtils.clone` for independently animated instances. The shared actor
catalog publishes it at `assets/openai/actors/PrimusGrey.glb` and includes it in
`bun run test:art`. It is not yet assigned to a character profile or encounter.

All visible geometry was created for Greywrought from the user-supplied Primus
Grey reference. The standing lower body interprets the cropped portrait.
Materials use portable metallic/roughness values and vertex color attributes.

The skeleton and animations come from Quaternius's Universal Animation Library
1, using the existing
[`UAL1_Standard.glb`](../../quaternius/rig-socket-prototype/animations/UAL1_Standard.glb).
No donor character geometry is included. Runtime animation keyframes and timing
are retained unchanged; clips are renamed as follows:

| Model clip | Quaternius source clip |
| --- | --- |
| Idle | Idle_Loop |
| Walk | Walk_Formal_Loop |
| Run | Jog_Fwd_Loop |
| Cast | Spell_Simple_Shoot |
| Channel | Spell_Simple_Idle_Loop |
| Interact | Interact |
| Talk | Idle_Talking_Loop |
| Hit | Hit_Chest |
| Death | Death01 |
| Jump_Start | Jump_Start |
| Jump_Loop | Jump_Loop |
| Jump_Land | Jump_Land |

Quaternius distributes the rig and animations under
[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). See the preserved
[license](../../quaternius/rig-socket-prototype/animations/LICENSE.txt) and
[Quaternius](https://quaternius.com/) for attribution.
