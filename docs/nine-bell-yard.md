# Nine-Bell Yard: The Last Shift

Greywrought begins in a place the sun never reaches. The inhabited yard is marked
by warm torchlight; cold reflected light leaves the road and hostile silhouettes
readable beyond it. Darkness establishes the place without hiding combat.

## What happened here

The settlement survives beside abandoned works. Their machines still enforce a
shift that ended years ago. Eight bells counted the work; the ninth counted the
workers home. Foreman Nine cannot close a roll whose names do not answer.

Mara is caring for people made sick by the old works venting through the well.
Rowan, now the innkeeper at The Missing Bell, once kept the crew's roll. He
signed everyone accounted for to open the gate while people remained inside.
The quest is to help the living and bring those missing names home.

This is new playable Greywrought material, grounded in Tom's note
`~/Documents/my-obsidian-vault.bak/code/greywrought/what do robots represent.md`:
robots preserve dependable structure from the loop, but that structure can
become a cage. These local names and events are newly authored, not recovered
canon. The permanent darkness is an explicit direction from Tom.

## First playable story

| Quest | What the player does | What changes |
| --- | --- | --- |
| Cold Hands, Warm Bodies | Accept Mara's **!**, gather three coolant crystals, bring them back and explicitly turn them in | Her cooling jars work again; receive the Line Inspector's Coat, two potions and level 2 |
| A Name on the Roll | Accept Rowan's **!**, participate in defeating the Cinder Watchman, return to report its collar number | Rowan admits what he did; receive a class weapon, three supplies and learn Disengage |
| Clock Out | Accept Rowan's final request, offer six carried crystals at the engine, defeat Foreman Nine, loot the Last Shift Roll and return it | Rowan reads the missing names aloud; receive supplies, potions, level 3 and Blood Rage |

Offers, work in progress and ready turn-ins use **!**, grey **?** and gold **?**
above the relevant NPC. Dialogue explains the objective and rewards before
acceptance. Killing an enemy or reaching town does not silently complete a
quest. The requested goods must be handed over; rewards are granted once per
character. The quest tracker points to the next useful place or person.

The coat and weapon are owned equipment, with equip/unequip in Character. The
class weapon is a blade, wand or bow. Rewards must change play, not only labels.
Town services, walking with menus open, three queued turns and shared-world
play remain part of the same journey.

## Resistance with three distinct answers

- **Equipment:** the coat reduces incoming damage and the working weapon adds
  damage. Taking the same hits without them is materially worse.
- **Character progression:** the opening quests grant levels and Disengage.
  Repeat farming does not substitute for completing the story. Blood Rage is
  earned at the chapter's end and retains its health-drain trade-off.
- **Execution:** the Foreman announces a targeted pulse, a dodgeable ground press
  and a shielded interval. Block the pulse, leave the press, attack while it is
  exposed and recover while its shield holds. Its growing damage prevents
  indefinitely waiting for a risk-free win.

The required tuning comparison is simple attack spam versus a prepared player
using the announced responses. The second should win with a meaningful cost;
the first should die. Numbers live in `greywrought:src/game/adventure.ts`.
This comparison does not prove that difficulty feels fair to a new player.

## Physical place and assets

The safe yard, broken coolant line and Ninth Bell Engine form one walkable
route. Salvaged pipes and visible machinery give the forest a history; authored
torches mark shelter and the gate. The dangerous works keep clear ground for
attack areas. NPC dialogue and restored lights show the personal consequence
of helping; the shared world remains available to other characters.

Use `~/code/game-assets/quaternius/All in One - Quaternius[Patreon].zip`.
The Foreman uses the Animated Mech Pack's Leela model with native movement,
attack, hit and death clips. Industrial props and village torches come from
the same existing library. Source members and licenses are recorded in
`greywrought:assets/external/quaternius/`. Do not replace actors with primitives.

The runtime quest content is `greywrought:src/game/yard-content.ts`; it supplies
NPC dialogue, objectives, rewards and item facts to the game and interface.

## Reading quests and preparing gear

Left-click Mara or Rowan nearby to open their greeting, then choose a quest or
service. The quest page shows the brief and rewards before acceptance; returning
opens an explicit completion action. F remains the nearby interaction shortcut.
The quest log opens from its bottom-right icon or J, with quests on the left and
story, objectives, progress and rewards on parchment on the right. L remains
the monster lorebook. The tracker covers world names and enemy nameplates.

Right-click earned gear to equip it. Outside combat this is immediate, in town
or in the field. During combat, a gear change occupies one queued turn without
spending stamina; its stats change when the turn resolves. It can be moved or
cancelled like other planned moves. Locked hotbar abilities retain their icon and frame, dimmed with a lock
marker; their tooltip names the quest that unlocks them.

The neutral Briar bee becomes a fast pursuer when attacked: 4.8 metres per second
within 18 metres of its home, versus its peaceful 1.1-metre-per-second patrol.
Its first Enraged Swarm follows a full preparation window. It must retain an
attacker firing within wand/bow range, approach, and land its announced attack
unless the player moves or blocks. Subsequent attack turns remain varied.
