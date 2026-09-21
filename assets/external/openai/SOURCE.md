# Primus Grey

`PrimusGrey.glb` is the self-contained game model: 65 bones, 12 animation clips,
135,412 triangles, eight material batches, and no external textures or buffers.
It faces +Z with Y up and is approximately 2.42 metres tall in its bind pose.
Preserve the file's authored root scale when loading it.

Load with Three.js `GLTFLoader`, play clips through `AnimationMixer`, and use
`SkeletonUtils.clone` for independently animated instances. This asset is not
yet assigned to a character profile or included in the published game routes.

All visible geometry was created for Greywrought from the user-supplied Primus
Grey reference. The standing lower body interprets the cropped portrait.
Materials use portable metallic/roughness values and vertex color attributes.

The skeleton and animations come from Quaternius's Universal Animation Library
1, using the existing
[`UAL1_Standard.glb`](../quaternius/rig-socket-prototype/animations/UAL1_Standard.glb).
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
[license](../quaternius/rig-socket-prototype/animations/LICENSE.txt) and
[Quaternius](https://quaternius.com/) for attribution.
