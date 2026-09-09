# Changelog

## 0.3.0 — 2026-09-09

- Made ordinary TypeScript, Three.js, and Bun the supported game, with source-save browser reload and named archives of the previous experiments.
- Built the Hearthstead–Frostwood expedition: potions, gathering, deliberate combat, a guardian ritual, extraction, and saved characters.
- Added authored Quaternius creatures, animation, village scenery, and forest landmarks.
- Attached health bars and readable intention queues to enemies; hostile mobs are red and neutral mobs yellow until provoked.
- Added territorial pursuit for close-range enemies while keeping committed attack warnings fixed and avoidable.
- Added a recorded soundtrack, sampled effects, and separate persisted volume controls.

## 0.2.0 — 2026-09-02

- Reduced the static release from roughly 51 MiB to 19.3 MiB by publishing only
  the runtime asset closure and minifying glTF JSON.
- Added an enforced release-size manifest and CI budgets.
- Added daily production verification with retained failure evidence.
- Added versioned campaign-save migration, corrupt-save recovery, and safe
  handling for unknown future saves.
- Added remappable keyboard controls, standard gamepad support, reduced-motion,
  high-contrast, and larger-text preferences.
- Added favicon, install manifest, description, theme, and social metadata.

## 0.1.0 — 2026-09-02

- Published the first Greywrought browser expedition with persistence and
  GitHub Pages delivery.
