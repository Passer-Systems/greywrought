# Changelog

## 0.5.0 — 2026-09-09

- Queue moves on a shared five-second active window with five seconds to prepare. Additional enemies inherit the fight’s clock; each announces only one move per active window.
- Edit the larger five-beat plan with delayed hotkeys, live retiming, drag-and-drop swaps, and keyboard placement.
- Budget five stamina per window; free Jab and Guard fill beats manually. Queue healing potions during combat.
- Preserve pending plans and combat timing in saved journeys.
- Trade supplies and health potions with Mara through adjustable offers and explicit acceptance; inventory persists between visits.
- Give warrior, mage and ranger distinct Quaternius models with authored weapons and class-specific attack animations.
- Delete individual characters and their saved journeys from the roster, with a named confirmation.
- Anchor enemy nameplates to their creatures without jumping around other HUD panels.

## 0.3.0 — 2026-09-09

- Made ordinary TypeScript, Three.js, and Bun the supported game, with source-save browser reload and named archives of the previous experiments.
- Built the Hearthstead–Frostwood expedition: potions, gathering, deliberate combat, a guardian ritual, extraction, and saved characters.
- Added authored Quaternius creatures, animation, village scenery, and forest landmarks.
- Attached health bars and readable intention queues to enemies; hostile mobs are red and neutral mobs yellow until provoked.
- Added territorial pursuit for close-range enemies while keeping committed attack warnings fixed and avoidable.
- Added a recorded soundtrack, sampled effects, and separate persisted volume controls.
- Restored the character paper doll with all 19 Classic equipment slots and a C shortcut.
- Restored corpse-loot windows and glints, manual salvage and relic collection, saved unclaimed loot, and extraction of carried salvage.
- Added a Classic-style backpack on B with carried stacks and potion use; brace remains on E.
- Kept WASD movement active while character, backpack, loot, shop, and game menus are open.

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
