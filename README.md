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

Combat is continuous and tab-targeted. Your basic attack repeats every 1.5 seconds;
other abilities act when pressed, subject to stamina and a shared recovery.
Each enemy independently commits to a spell with at least three seconds of warning.
A cast bar below its nameplate shows the spell icon, name and time until it fires;
the selected enemy also has a cast bar beneath its target frame. Hover for damage,
range and how to respond. Faded attack art means out of range now.
Floating numbers show damage dealt in gold, damage taken in red, healing in green,
and absorbed damage in blue. Targeted spells use the enemy cast bar for warning.

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
To develop against a local shared world, use `GREYWROUGHT_LOCAL_WORLD=1 bun run dev`.

Gameplay lives in `greywrought:src/game/`. The existing Three.js presentation,
input, audio, and browser persistence live in `greywrought:src/host/`.
Assets and their attribution live in `greywrought:assets/`.

## Offline demo with multiple clients

Prepare the checkout with Bun 1.3.13 while internet access is available:

```sh
bun install --frozen-lockfile
bun run build
```

Then, including with Wi-Fi off, start the local game from that checkout:

```sh
bun run demo
```

Open **http://127.0.0.1:4180/** in two separate browser profiles, or one normal
window and one private window. Create a character in each. Both players share
the same local world, including movement, enemies and chat. Ordinary tabs share
a character roster; the same character cannot play in two clients at once.
Keep the terminal running while playing. The game files, music, models and world
server are all local; no public server or internet access is needed after setup.

Escape opens the Encounter tab and pauses your private copy while the other
player continues. A lost client connection also leaves that character paused;
reconnecting never resumes automatically. Choose **Resume encounter**, finish
combat or retreat, then use **Rejoin main world** in the top bar. Turning off
Wi-Fi does not interrupt localhost connections; it demonstrates internet
independence, not a dropped connection to this local server.

Ctrl-C saves the local world to `greywrought:build/demo-shared-world.json`.
Restarting `bun run demo` restores it, with returning players paused until they
resume. `GREYWROUGHT_WORLD_SAVE` selects a different save; relative save paths
are resolved from the checkout root. `GREYWROUGHT_PORT` changes the port.
Use the same browser profile and URL to retain character access. Private-window
access is temporary and disappears when all private windows close.

This launcher binds to this computer only. Multiple clients on this computer
work offline; another computer's `localhost` refers to that other computer.
For machines using Nix instead of an installed Bun, prepare Bun in a Nix shell
before going offline; the cached runtime can then be started with
`nix shell --offline nixpkgs#bun -c bun run demo`.

After building, `bun run test:offline-demo` exercises two independent Chrome
profiles with external traffic blocked: shared movement/chat, disconnect and
private-zone isolation, explicit resume/rejoin, movement afterward, and saved
recovery after restarting the server. It also checks that neither client
requests external game resources. Chrome must be installed before running it.

## Controls

W/S move forward and backward; A/D strafe. Backpedaling is slower. Space jumps.
Left-drag or right-drag turns the camera and your character. Hold Alt while
left-dragging to look around without changing your character's facing. Both mouse
buttons move forward, including while S is held. The wheel zooms.

Tab selects a target. **1** starts or stops your class's auto attack, **2** uses
Block, and **=** drinks a health potion. Completing Rowan's quests unlocks **3**
a class retreat attack and **4** a class power. Drag action-bar spells to rearrange
them; hotkeys follow their slots. Abilities use real-time recovery; movement stays
available throughout combat.

**H** toggles enemy awareness ranges; the visible Aggro ranges button also works.
Solid red rings show direct aggro and dashed amber rings show call-for-help range.
Nearby hostile creatures can answer a fighting creature's call, across a clear
path and within their pursuit limits. Neutral creatures only fight back when
attacked. Private encounters cannot draw new creatures into the fight.

Hover crystals for the quest tooltip; left-click or press G nearby to gather.
R offers six carried crystals at the engine. F speaks with NPCs or opens nearby
corpse loot; click an item to take it. The quest tracker gives the destination.

C opens Character with the Classic equipment slots. Earned coat and class weapon
can be equipped or removed there. B opens your backpack; L opens the quest log; J opens the monster
lorebook. Escape closes a window or opens Encounter. Opening the game menu pauses
your private encounter. Unit frames can be unlocked, moved and mirrored in the
separate Settings tab.

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

The static client connects to the shared game server. The public site is served
by Caddy on DigitalOcean. Source edits and local tests do not alter the public
deployment; a verified release is copied to a versioned directory before the
server's current-release pointer changes.
