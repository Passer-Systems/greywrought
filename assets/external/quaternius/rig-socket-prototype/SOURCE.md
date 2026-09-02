# Quaternius rig/socket prototype assets

These files are deliberately small subsets of official Quaternius packs. Each
selected asset retains the exact bundled CC0 1.0 Universal notice from its
download source.

## Live Wayfarer character

- Pack: Ultimate Animated Character Pack
- Official pages:
  - <https://quaternius.com/packs/ultimatedanimatedcharacter.html>
  - <https://drive.google.com/drive/folders/1sNi1AfenfPRrvRt5yfaj5QMMd6KKcUJ5>
- Retrieved: 2026-09-02
- Google Drive file: `glTF/Knight_Golden_Female.gltf`
- Google Drive file ID: `1etB7GTumoPrUf-wjvnkmhkp-Zs4mDPqv`
- Selected scope: the self-contained Golden Knight Female glTF with its
  complete clothed mesh, 23-joint skeleton, embedded geometry, and 17 native
  animation clips
- Selected GLTF SHA-256:
  `dc468d46e898aa02b1ca92f19adfb1b5497721d273efb6405aa80e7155f26cc8`
- License: CC0 1.0 Universal; exact bundled notice is
  `wayfarer/LICENSE.txt` (SHA-256
  `83d8959f9fc56353ed571fbe2dc52e4bcd64508e2399501cd45ac2ce3df0bf8c`)

The live Wayfarer uses the asset's own `Idle`, `Run`, `Jump`, `SwordSlash`,
`RecieveHit`, and `Death` clips. No cross-skeleton retargeting is required.

## Base character

- Pack: Universal Base Characters, Standard (free)
- Retrieved: 2026-09-01
- Official pages:
  - <https://quaternius.com/packs/universalbasecharacters.html>
  - <https://quaternius.itch.io/universal-base-characters>
- Itch upload: `15861669`, published 2025-12-16
- Archive: `Universal Base Characters[Standard].zip`
- Archive SHA-256: `fdbf1804c90dfc1ea03e992bff7da2dfd1a79318e13270a660180f9308455f40`
- Selected scope: the Superhero Female glTF, its buffer and referenced
  textures, and the bundled license notice
- License: CC0 1.0 Universal; exact bundled notice is `base/LICENSE.txt`

The archive's glTF names `T_Eye_Normal_png.png`, while the archive contains
the referenced texture as `T_Eye_Normal.png`. This checkout changes only that
URI in the glTF. The original glTF SHA-256 is
`adedf28000a0716f689b009a70314506fc62f827498f77ba852acb5610f3f3f4`; the
corrected glTF SHA-256 is
`215f2af81ad91eecfcee807bad19b541704b800844d997286b78d5dbed7a3b5e`.
No mesh, rig, material, or texture bytes were otherwise changed.

## Animation library

- Pack: Universal Animation Library, Standard (free)
- Retrieved: 2026-09-01
- Official pages:
  - <https://quaternius.com/packs/universalanimationlibrary.html>
  - <https://quaternius.itch.io/universal-animation-library>
- Itch upload: `17958403`, published 2026-06-16
- Archive: `Universal Animation Library[Standard].zip`
- Archive SHA-256: `cc73fc4e495b82958207316596317a3f40b9fa38065bde1027937452da537724`
- Selected scope: `UAL1_Standard.glb`, the non-root-motion file, plus the
  bundled readme and license notice
- Selected GLB SHA-256:
  `69591853d817488edaa8fd9bf8fc1d821eaeaf789f8627b3cd23b41c4ed67997`
- License: CC0 1.0 Universal; exact bundled notice is
  `animations/LICENSE.txt`

The `_RM` root-motion variant is intentionally absent. Clause remains the
authority for displacement; these clips supply presentation poses only.
