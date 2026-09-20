# 3D asset inventory

New Greywrought derivatives are documented in [greywrought-relics/README.md](greywrought-relics/README.md): **Hollow Saint**, **Relic Warden**, **Hearth Keeper**, and **Greyrot Penitent**. Each has a full animated GLB and a smaller playable export; the original pack inventoried below is preserved.

Inventoried on 2026-09-19 from `Animated Mech Pack - March 2021-20260920T060824Z-1-001.zip`.
The original ZIP is retained locally; the repository includes its extracted source files rather than a duplicate archive. Its 63 files were extracted into `Animated Mech Pack - March 2021/` (146,588,127 bytes; approximately 139.8 MiB).

## Pack and license

- **Animated Mech Pack — March 2021**, by **Quaternius**.
- Four distinct low-poly mech characters: **George, Leela, Mike, Stan**.
- Two presentations of each character: **Textured** and **Flat Colors**.
- Bundled license: **CC0 1.0 Universal / Public Domain Dedication**. See [License.txt](<Animated Mech Pack - March 2021/License.txt>); attribution and original files are preserved.
- Visual references: [Preview.jpg](<Animated Mech Pack - March 2021/Preview.jpg>) and [ColorsPreview.gif](<Animated Mech Pack - March 2021/ColorsPreview.gif>).

## Models

Every character is supplied in both presentations, each with Blender (`.blend`), FBX (`.fbx`), glTF (`.gltf`), and OBJ (`.obj` plus `.mtl`) files. These are alternate exports of four characters, not 32 distinct characters.

The following measurements come from the supplied glTF files. Triangle counts sum all mesh primitives; joints count the skin's joint entries.

| Character | Textured triangles | Flat-color triangles | Rig joints | Animation clips per version |
| --- | ---: | ---: | ---: | ---: |
| George | 7,864 | 8,818 | 47 | 20 |
| Leela | 2,368 | 2,400 | 17 | 18 |
| Mike | 6,062 | 6,230 | 43 | 18 |
| Stan | 6,110 | 5,972 | 43 | 18 |

All eight glTF files use glTF 2.0 and contain one mesh and one skin each. Textured files have one material; flat-color files have six. Their buffers and images have no external URI dependencies.

Model paths follow these patterns (replace `NAME` with a character name):

- `Animated Mech Pack - March 2021/Textured/glTF/NAME.gltf`
- `Animated Mech Pack - March 2021/Flat Colors/glTF/NAME.gltf`
- Other formats occupy the corresponding `Blends/`, `FBX/`, and `OBJ/` folders.

## Animations

Both presentations have the same clip names for each character. All four characters include these 16 clips, preserving the source spelling:

`Dance`, `Death`, `Hello`, `HitRecieve_1`, `HitRecieve_2`, `Idle`, `Jump`, `Kick`, `No`, `Pickup`, `Punch`, `Run`, `Shoot`, `SwordSlash`, `Walk`, `Yes`.

Additional clips:

- **George:** `Run_Holding`, `Walk_Holding`, `Run_Tall`, `Walk_Tall`.
- **Leela:** `Run_Tall`, `Walk_Tall`.
- **Mike and Stan:** `Run_Holding`, `Walk_Holding`.

Rig and clip counts were inspected in glTF; FBX and Blender animation contents were not separately inspected. OBJ exports are static geometry.

## Textures

There are **20 PNG images**, all **2048 × 2048**:

- Four base textures in `Textured/Textures/`: `George_Texture.png`, `Leela_Texture.png`, `Mike_Texture.png`, `Stan_Texture.png`.
- Sixteen alternate textures in `Textured/Textures/Color Variations/`: four per character, named `NAME_1_Texture.png` through `NAME_4_Texture.png`.

This provides five supplied texture choices per character including the base texture. No separately named normal, roughness, or metallic map files are included.

## File totals

| File type | Count |
| --- | ---: |
| Blender source (`.blend`) | 8 |
| FBX (`.fbx`) | 8 |
| glTF (`.gltf`) | 8 |
| OBJ geometry (`.obj`) | 8 |
| OBJ materials (`.mtl`) | 8 |
| PNG textures | 20 |
| JPG preview | 1 |
| GIF color preview | 1 |
| License text | 1 |
| **Total extracted files** | **63** |

## Integration status

The original extracted pack remains intact. Four derived relic blockouts in [`greywrought-relics`](greywrought-relics/README.md) supply the current replacement encounters; the crab is retained.

The subsequent single-character surface rebuild is in [`relic-warden-study`](relic-warden-study/README.md). It includes an editable Blender file, a detailed GLB with all 18 Mike clips, a reduced export with five encounter clips, and a separate inspection viewer. This study has not been promoted into the live encounter asset mapping.
