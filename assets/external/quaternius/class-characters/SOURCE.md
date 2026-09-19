# Quaternius RPG Characters

Source: Quaternius, **RPG Characters - Nov 2020** (Warrior, Wizard, Ranger).

Original download: `/home/tom/code/game-assets/quaternius/All in One - Quaternius[Patreon].zip`

Archive members: `Characters and Animals/RPG Characters - Nov 2020/glTF/Warrior.gltf`,
`Characters and Animals/RPG Characters - Nov 2020/glTF/Wizard.gltf`, and
`Characters and Animals/RPG Characters - Nov 2020/glTF/Ranger.gltf`.

The included `LICENSE.txt` is the pack's CC0 license. Greywrought uses each
model's authored geometry, skin, materials, and native clips. The three original
RPG models retain Idle, Run, Roll, RecieveHit, Death and their class attack clip.
The two Ultimate Animated Character models retain Idle, Run, Roll, RecieveHit,
Death, Shoot_OneHanded and SwordSlash; unused animation records were removed
without changing the referenced geometry or binary buffers.

Alchemist.gltf is `Characters and Animals/Ultimate Animated Character Pack - Nov 2019/glTF/Doctor_Male_Old.gltf`.
Artificer.gltf is `Characters and Animals/Ultimate Animated Character Pack - Nov 2019/glTF/Worker_Male.gltf`.

The archive root CC0 license is preserved as
`greywrought:assets/external/quaternius/class-characters/ultimate-character-license.txt`.
The matching Alchemist and Artificer portraits under
`greywrought:assets/ui/characters/` are renders of these models and materials.

The sitting animation uses `SitDown` from the same archive's
`Characters and Animals/Ultimate Animated Character Pack - Nov 2019/glTF/Knight_Golden_Female.gltf`,
already preserved at `greywrought:assets/external/quaternius/rig-socket-prototype/wayfarer/Knight_Golden_Female.gltf`.
`greywrought:assets/external/quaternius/class-characters/Social.glb` keeps that
model's rig, geometry, `SitDown` and `Victory` (renamed `Cheer`) clips, with unused
buffer data removed. It also contains `Dance_Loop` from the archive member
`Animation/Universal Animation Library 1[Standard]/Unreal-Godot/UAL1_Standard.glb`,
retargeted to this rig and renamed `Dance`. The animation library is CC0 under
the archive's license. `Wave` and `Train` are original Greywrought skeletal
gestures authored on the character's idle pose. No Blizzard art or audio is used.
`greywrought:scripts/prepare-emotes.mjs` prepares this compact animation donor.
Three.js retargets its clips to each class's skeleton and proportions.
