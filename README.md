# Greywrought

A browser action RPG built with **Three.js, ordinary TypeScript, and Bun**.

Play at **https://play.greywrought.com/**.

Begin in **Nine-Bell Yard**, a settlement the sun never reaches, beside works
whose machines still enforce a shift that ended years ago. Torchlight marks
shelter and the way home. Mara needs coolant for her patients; Rowan knows why
the ninth bell has begun ringing again.

Look for **!** above an NPC, left-click or speak with F and accept a quest. Bring the requested
goods or news back to its giver and complete the quest at the gold **?**. Mara
rewards a protective coat; Rowan grants a class weapon and a retreat attack. Their
story leads to Foreman Nine and the missing names on the Last Shift Roll.
Equipment, levels and the timing of your responses all affect survival. Quest
turn-ins show your rewards with an Equip button for new gear. Coolant crystals
have a recognizable cyan crystal model and a hover tooltip with quest progress.

Combat has three one-second turns, one second to choose the enemy's next move,
and five seconds to prepare. Queue up to three moves using five stamina. Each
enemy announces one move in the coming window. Additional enemies join the
shared rhythm. Hover an intention for its damage, range and response; press J
for the lorebook. Faded attack art and a distance marker mean out of range now.

Foreman Nine has a targeted pulse, a dodgeable press and a shielded interval.
Its damage grows while you fight: prepare your gear, block the pulse, leave the
press and use the shielded interval to recover. Ordinary enemies respawn after
two minutes. Defeat permanently retires a character to the RIP roster.

Warrior, mage, ranger, alchemist and artificer have distinct Quaternius models
and native animations. The warrior closes for melee; the other classes attack
from range. The Alchemist throws reagents and combines healing with a smaller
shield. The Artificer fires rivets and spends more stamina on heavier plating.
Players share one server, with persistent individual characters and quest
progress. Enter opens chat; messages appear in a short speech bubble too.
Rowan offers healing at The Missing Bell; Mara sells potions and trades goods.
Music and sampled sounds begin after interaction; Settings controls their volume.

The chapter's design is recorded in [greywrought:docs/nine-bell-yard.md](docs/nine-bell-yard.md).

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
The local client connects to the public shared world. Changes to shared game
data must be tested against an isolated local world and deployed together with
the server before exposing the new client. `bun run preview` serves a built
client on port 4180 against the same public world; `GREYWROUGHT_PREVIEW_DIR`
can select a completed build while development continues separately.

Gameplay lives in `greywrought:src/game/`. The existing Three.js presentation,
input, audio, and browser persistence live in `greywrought:src/host/`.
Assets and their attribution live in `greywrought:assets/`.

## Controls

W/S move forward and backward; A/D strafe. Backpedaling is slower. Space jumps.
Left-drag orbits the camera; right-drag also turns your character. Both mouse
buttons move forward, including while S is held. The wheel zooms.

Tab selects a target. **1** queues your class attack, **2** Block, **=** drinks
or queues a health potion. Completing Rowan's quests unlocks **3** a class
retreat attack and **4** a class power. Click a queued move then an ability to replace it; right-click
to remove it; drag onto another turn to move or swap. Executed moves stay locked.

Hover crystals for the quest tooltip; left-click or press G nearby to gather.
R offers six carried crystals at the engine. F speaks with NPCs or opens nearby
corpse loot; click an item to take it. The quest tracker gives the destination.

C opens Character with the Classic equipment slots. Earned coat and class weapon
can be equipped or removed there. B opens your backpack; L opens the quest log; J opens the monster
lorebook. Escape closes a window or opens Settings. Movement continues with
windows open. Unit frames can be unlocked, moved and mirrored in Settings.

Return to the roster to create or delete a selected character. Defeated
characters remain in the RIP tab. Access is retained in the browser profile;
character and world progress are saved by the shared server.

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
