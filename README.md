# Greywrought

A browser action RPG built with **Three.js, ordinary TypeScript, and Bun**.

Play at **https://play.greywrought.com/**.

Create a character in Hearthstead, prepare at Mara’s apothecary, and explore
Frostwood. Gather frost cores, clear threats, and return alive to bank your haul.
Search defeated enemies for salvage, then return alive to exchange it for
supplies. Offer six carried cores in the deep grove to call a guardian whose
relic must be looted and brought home. Kills grant no experience points.

Combat follows five active seconds then five preparation seconds. You can plan
up to five moves; each enemy commits only one announced move per window.
Additional enemies join the next shared opening without resetting the clock.

The first enemy is an animated Ember head with 72 health. It opens with a
small targeted Beam, then uses Fireball, a two-second Ward, and Kindle in
successive windows. Kindle strengthens later volleys. Painted icons below the
nameplate show current activity and future windows, with explicit pauses.
Hover for details; press L for every monster's abilities and move patterns.

You have five stamina per active window, refilled at the start of preparation.
Queue moves before pulling and edit their timing in the five-column plan.
Spend stamina on attacks, a brief
10-point Block, or Blood Rage. Rage adds melee damage but drains health, caps
at three stacks and fades rapidly outside combat. Free Jab and Guard fill
a beat without spending stamina. Time Block around overlapping
impacts, power up during enemy wards, and attack before Kindle strengthens it.

Deeper in the forest, the Ash hound approaches with diagonal hops, circles,
then commits to a dodgeable Maul. It makes one attack per window. Hostile creatures are red; neutral creatures are yellow until
provoked. The map, road and landmarks keep the route home visible.
Characters and expeditions are saved in the browser; defeat is permanent.
Animated Quaternius creatures and village scenery bring the route to life.
Warrior, mage and ranger have distinct models and sword, staff and bow animations.
They currently share the prototype ability kit.
Music and sampled combat sounds begin after interaction; open the game menu to adjust
music and effects volume or mute them.
Rowan offers free healing at The Wayfarer’s Rest beside the town square.
Mara’s **Trade goods** window exchanges three supplies for a health potion,
or a potion for two supplies. Adjust the offer, then Accept; nothing changes
until you accept. Escape or Cancel returns to her shop.
Centered player, target and target-of-target frames track the fight; the Chat
and Combat Log tabs preserve recent dialogue, damage, mitigation and loot.

## Develop

Install Bun 1.3.13, then:

```sh
git clone https://github.com/Passer-Systems/greywrought.git
cd greywrought
bun install --frozen-lockfile
bun run dev
```

Open http://127.0.0.1:4173/. Edit TypeScript or styles and the development server
updates the browser. No separate language compiler or native toolchain is needed.

Gameplay lives in `greywrought:src/game/`. The existing Three.js presentation,
input, audio, and browser persistence live in `greywrought:src/host/`.
Assets and their attribution live in `greywrought:assets/`.

## Controls

W/S move forward and backward; A/D strafe. Space jumps. Hold both mouse buttons
to move forward, including while S is held. Drag either mouse button to turn
the view, and use the wheel to zoom.

Tab selects a target. Q queues Lunge, E Block, Z Disengage, X Blood Rage,
V a free Jab, and N a free Guard. Up to five moves fit the active window.
QE means Lunge at 0s, Block at 1s; QE3 places Block in slot 3, at 2s.
Numbers 1–5 place the selected pending move in slots 1–5 (0–4 seconds),
swapping with another pending move when possible. Click to select another move;
drag to move or swap it. Backspace removes. Executed moves stay locked. G gathers frost cores and R
calls the grove guardian. F talks to Mara or Rowan, or opens nearby corpse loot; click an
item to take it. You can also click a lootable body. H queues a potion during combat or drinks it immediately outside combat. Return through the
gate to secure carried rewards. Visit Rowan at the inn to recover health.
C opens the character paper doll with all 19 Classic equipment slots. Select
a slot to inspect it; gear changes are not yet implemented. B opens your backpack
to inspect carried items; click an item for its tooltip and potion action.
L opens the monster lorebook. The icon hotbar shows ability keys and hover
tooltips; the separate recovery bar shows your current commitment. Escape
closes a window or opens the game menu. Movement continues while windows are open.
To delete a character, return to the roster, select them, and choose **Delete
Character**. Confirming removes that character and their saved journey from
the current browser; your other characters remain.

## Versions and archives

`main` is the supported Greywrought game. Releases use `vMAJOR.MINOR.PATCH`
tags; deployed directories use `greywrought-VERSION-COMMIT`. The browser pivot
is version **0.3.0**. A deployment's `release.json` identifies its source version.

Previous experiments are preserved by Git tags:

| Tag | Preserved work |
| --- | --- |
| `archive/bevy-20260909` | Unshipped Bevy experiment after removing its rules engine |
| `archive/bevy-clause-20260909` | Previously published native experiment |
| `archive/threejs-clause-20260909` | Original browser action RPG before this migration |
| `archive/rts-20260909` | Previous DigitalOcean browser deployment |

These are historical checkpoints. New game development continues on `main`.
An archive can be inspected with `git show TAG` or a separate Git worktree.

## Check and build

```sh
bun run typecheck
bun run test
bun run build
```

The static build can be hosted without a game server. The public site is served
by Caddy on DigitalOcean. Source edits and local tests do not alter the public
deployment; a verified release is copied to a versioned directory before the
server's current-release pointer changes.
