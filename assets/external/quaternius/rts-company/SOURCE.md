# Quaternius RTS company models

- Creator: Quaternius (`@Quaternius`)
- Pack/release: Ultimate Animated Character Pack, November 2019
- Official sources:
  - <https://quaternius.com/packs/ultimatedanimatedcharacter.html>
  - <https://drive.google.com/drive/folders/1sNi1AfenfPRrvRt5yfaj5QMMd6KKcUJ5>
- Retrieved: 2026-09-03
- License: [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/)
- Bundled notice: `LICENSE.txt`, preserved verbatim from the official pack

Greywrought uses five distinct, self-contained animated glTF characters from
the pack. The Golden Knight already retained by the rig/socket prototype is
reused in the release rather than duplicated in this directory.

| Greywrought class | Quaternius file | Google Drive file ID | SHA-256 |
| --- | --- | --- | --- |
| Warrior | `Knight_Golden_Female.gltf` | `1etB7GTumoPrUf-wjvnkmhkp-Zs4mDPqv` | `dc468d46e898aa02b1ca92f19adfb1b5497721d273efb6405aa80e7155f26cc8` |
| Artificer | `Worker_Female.gltf` | `1rnm-vJlpnt0QFKOzwbV1-wUQKaFxJ-1T` | `a1cb51a7bde7758884e8e83f7e8569cb6fede8f95bf4cfaf55102f468921c0d9` |
| Rogue | `Ninja_Female.gltf` | `1oDeEe-HcRDszaqYL193ef-PzWjuFafDj` | `4aca0a09782739f427092c270cdd114fe01af0e17b6f600157ac90ad9c8ec32e` |
| Priest | `Wizard.gltf` | `1kVJicV3OAdeL96Uif-3ud1bh8gsl7QGT` | `baa9cd2d9f1ab3452d6e47d6efc5d4c6c8381fe16a44fc710df46bf16bc7fce8` |
| Ranger | `Elf.gltf` | `1OBeMqrUwJ7X9gFjEVEWA_1g_i6dEL9hR` | `f1f480b79f274a20e414eaa0a2c76bd2aa40ac8e29f1178d6208af74cc69eb88` |

Each selected file embeds its geometry and textures and includes the same 17
native animation clips. Greywrought uses `Idle` and `Run` only as passive
presentation; Clause remains the sole authority for positions and movement.
The Artificer's engineer/alchemist equipment is renderer-owned silhouette
dressing around the unmodified Worker model.
