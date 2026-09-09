# Changelog

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

## 0.3.0 — 2026-09-08

- Pivoted the live game to ordinary TypeScript, Three.js, and Bun.
- Added a fast development server with automatic browser reload on source saves.
