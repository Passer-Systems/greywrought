# Frostwood ground surfaces

Source: Poly Haven, downloaded 2026-09-21. All three assets are released under
[CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/), as stated
by [Poly Haven's asset license](https://polyhaven.com/license). No attribution
is required; artist and source credits are retained here.

| Greywrought files | Original asset and artist | Source files revision (`files_hash` from asset API) |
| --- | --- | --- |
| `greywrought:assets/external/polyhaven/ground/forest-floor-{color,normal}.webp` | [Forest Floor](https://polyhaven.com/a/forest_floor), eye-candy.xyz | `7723fe51fafe4f43d1242eff1dd06f34560ec921` |
| `greywrought:assets/external/polyhaven/ground/moss-{color,normal}.webp` | [Rocky Terrain 02](https://polyhaven.com/a/rocky_terrain_02), Amal Kumar | `a4c0d422c59c4234227eb04c1fa9d28694c60fbe` |
| `greywrought:assets/external/polyhaven/ground/stone-{color,normal}.webp` | [Forest Ground 04](https://polyhaven.com/a/forest_ground_04), Rob Tuytel (photography/processing), Rico Cilliers (minor adjustment) | `60e454ab149c058f8514ae29d4ce8b16f6f3bce5` |

Reused scope: each asset's 1K JPEG diffuse and OpenGL normal maps, from
`https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/{asset}/{asset}_{diff,nor_gl}_1k.jpg`.
Diffuse maps are converted to WebP: forest floor at 1024px/quality 64, moss at
1024px/quality 72, stone at 768px/quality 66. Normal maps are resized to 512px
and converted at quality 80. Metadata is stripped. Runtime treats diffuse as
sRGB and normals as numeric data; color grading is in the ground material.
No mesh displacement or terrain-height data is derived from these assets.

The local Quaternius all-in-one archive was inspected first. Its Nature kits
provide the game's authored vegetation and rock meshes, but do not provide
continuous detailed forest-floor layers suitable for this ground surface.
