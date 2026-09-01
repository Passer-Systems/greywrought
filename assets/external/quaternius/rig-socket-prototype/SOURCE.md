# Quaternius rig/socket prototype assets

These files are a deliberately small subset of two official Quaternius packs,
downloaded on 2026-09-01. Both downloaded archives contain the retained CC0
1.0 Universal notices beside the selected assets. Notice text is unchanged;
line endings and trailing whitespace are normalized for this repository.

## Base character

- Pack: Universal Base Characters, Standard (free)
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
