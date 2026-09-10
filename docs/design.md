# Greywrought: Nine-Bell Yard

Build a third-person expedition RPG that earns another expedition: prepare in
Nine-Bell Yard, read a dangerous forest, choose which problems are worth solving,
bring something valuable home, and use it to prepare for a harder journey.
The intended complete experience is roughly ten minutes; the first release
must first make its route and a short encounter understandable through play.

The current chapter is **The Last Shift**, set in permanently dark Nine-Bell Yard.
See `greywrought:docs/nine-bell-yard.md` for the playable story, three explicit
quests, equipment and skill rewards, Foreman Nine, and the torchlit setting.
That chapter supersedes the early generic forest milestone names below.

The active implementation is ordinary TypeScript, Three.js and Bun. The earlier
native prototypes are archived. Fast browser iteration supports the game work;
language experiments are outside this delivery.

## Product constraints

- Deliberate real-time movement and combat, with current and upcoming intentions.
- Hardcore character stakes; persistent supplies and relics come from extraction.
- No kill XP. Fighting buys safer travel, quiet, access, or removal of a hazard.
- A physically connected safe hub, dangerous forest, and recognizable way home.
- Rising forest alertness and a deliberate optional ritual reward.
- Recognizable animated enemies, restrained parchment UI, and a legible north-up map.
- One shared world with individual persistent character and quest progress.
  Authored NPC needs grant equipment and skills through explicit turn-ins.

## Town barter

Mara offers a working trade window beside her normal potion shop. The player
chooses supplies or health potions to offer and adjusts the quantity. The two
columns show exactly what each side gives: three supplies buy one potion;
one potion returns two supplies. A quote changes no inventory. Accept exchanges
both sides together after checking current inventory and proximity to Mara.
Cancel, Escape and the corner close button return to the shop. Walking remains
available; leaving talking range cancels the offer. Accepted exchanges use the
existing saved supplies and potion inventory.

## Character appearance

Warrior, mage and ranger use distinct authored Quaternius characters and native
sword, staff and bow animations. Their silhouettes and held weapons must remain
recognizable from the normal camera. The warrior lunges into melee; the wizard
fires a wand attack and the ranger shoots from range. The remaining prototype
abilities are shared. Basic attack icons use a sword, wand,
or bow to match the selected character.

## First milestone: a readable place and a readable encounter

The next usable delivery is the walk from Hearthstead to one forest encounter
and back. The player should immediately understand where to go, recognize an
enemy, read its planned action, choose a response, and see why that response
worked or failed. Map work and combat presentation form one milestone.

### Make the world and map legible

Give Hearthstead, its gate, the main road, the first clearing and the deeper
grove distinct silhouettes and landmarks. Use terrain shape, path materials,
lighting and restrained color to separate walkable routes from scenery.
Visible routes must agree with actual movement bounds. Keep the way back
recognizable from the forest.

Rebuild the minimap around navigation: a north-up terrain view, an unmistakable
player arrow showing facing, the road and gate, the selected destination and
relevant known points of interest. Use a small consistent icon vocabulary,
high contrast and useful zoom. Keep labels from overlapping, and distinguish
the safe hub, resource site, selected enemy and return route without relying
on color alone. Decorative parchment sits behind this information.

The world view and minimap should describe the same geography. Labels should
identify nearby useful things without covering the road or the action.
The first route should be understandable without reading a controls document
or consulting a list of coordinates.

Acceptance: from the normal play camera, the player can identify their facing,
find the gate, reach the first resource clearing and retrace the route home.
The map remains readable both in town and while an enemy is selected.

### Make Spire-style combat visible in a moving world

Keep third-person movement and deliberate real-time combat. The central skill
is reading a committed enemy intention and choosing how to spend position,
time, health and resources before it resolves.

Every active enemy needs a recognizable body and silhouette, a clear target
indicator, and animation for idle, movement when moving, preparation, action,
recovery, hit reaction and defeat as appropriate. Prefer suitable existing
Greywrought assets. Pick the first encounter around a coherent set of usable
animations; visual variety can grow after that encounter works.

Intentions must be attached to the enemy they describe.
Show a compact action icon and concise description, with damage, target or
area when that information is actually determined. Selection can reveal more
detail. Several enemies must remain distinguishable without stacking large
text panels over one another.

Use a consistent visual sequence: the enemy announces its intent, its body
prepares, the action visibly resolves, and recovery creates a readable opening. A strike should have a visible impact; bracing should have a visible
stance and result. Show health loss, mitigation and defeat at the moment the
accepted game state says they happen. Sound can reinforce these cues.

Animation timing and telegraphs must agree with the actual action window,
range, target and outcome. Expose the necessary authored information to the
presentation. Presentation must not invent attacks, damage, defensive windows,
interruptibility or enemy decisions. If an attack cannot be interrupted, its
cue must not imply otherwise.

Start with one complete encounter: the Ember head teaches shared combat timing,
shielding, and growing volleys. The later Ash hound adds
movement through a warned, dodgeable Lunging Maul. Establish a readable
offense-versus-defense decision here before building a two-enemy combination. Any added interrupt or movement mechanic needs its own
real rule and visible result.

Acceptance: in roughly thirty seconds of play, the player can tell what each
enemy is doing now, what comes next, which response is available, and why
health or danger changed. We should be able to demonstrate two different
choices producing the expected different outcomes. The combat log supports
that understanding; the creature animation and cues must carry it on screen.

## Second milestone: an expedition worth completing

Join the readable encounter to a complete loop: buy a potion, leave the hub,
choose how to approach the first obstacle, gather valuable cores, decide
whether to press deeper, and return to secure the reward. Include one optional
higher-risk objective using the existing ritual direction.

Fighting must buy something tangible: stop an alarm, open a useful route,
remove a harvesting hazard or create breathing room. Preserve no kill XP,
predictable material rewards, rising presence, deliberate combat and extraction
stakes. The player should understand what is carried at risk, what has been
secured, and what returning now gives up.

Make preparation, encounter outcome, extraction and permanent consequences
visible. Reopening should retain the journey.
The first playtest must demonstrate navigation, readable combat, a meaningful
risk decision and a useful return; the player wanting another run is the human
judgment that determines whether the loop works.

## Town and interface visual language

Use the supplied Classic WoW references for structure and information hierarchy:
compact dark panels, restrained metal edging, warm gold titles, square item
icons, legible stack counts, and red close buttons. Author Greywrought's own art.
All window headers share a layout: the title and close button occupy one grid
row, with the close button flush against the inside top-right frame edge.
An optional portrait overlaps the left corner without moving those alignment
lines. Content has its own padding beneath the header; don't position controls
relative to an independently inset title box.

Player and target frames flank a clear central viewing area around the character
and nearby enemies. Show the target's target beneath its frame when it is actually
attacking someone. One cast bar sits below each enemy nameplate and below the
selected target frame. It contains the committed spell's icon, name and remaining
seconds, filling left to right until the spell fires. No future move is previewed.
Each tooltip names the attack, damage, range, timing and positional response.
Offensive opportunities appear on the left only while actionable; actual
control effects and debuffs belong on the right. The current recovery opening
indicates that Strike is ready and the enemy is in range; it promises no bonus
damage. Disengage roots its struck enemy only until the player lands; display that actual effect and remaining time on the right.

The bottom-left Chat and Combat Log tabs show actual events. The log must retain
simultaneous outcomes and let the player read older entries without snapping
back to the newest line. Windows preserve movement, including already-held
WASD; Escape and the visible close button both work.

Hearthstead includes Mara's merchant window and Rowan's inn service. The inn
has a recognizable building, animated innkeeper and free healing. The merchant
shows actual stock, prices and available supplies. The backpack uses a compact
slot grid, with item details in a floating tooltip and a real potion action.
Corpse loot remains a small vertical list of available items.

### Captured references for later systems

These references guide later features; they do not imply the systems are
implemented in the current solo expedition.

- **Party loot roll:** a compact horizontal rare-drop prompt, separate from
  corpse loot. Item icon/name and quality color on the left, Need/Greed/Pass
  choices on the right, time remaining below, and full details on hover.
  Disenchant needs its own real eligibility rule before showing that option.
- **Loot-roll history:** expandable item rows showing participants, their
  choices and rolls, and the winner. Hover reuses the item tooltip. Developer
  IDs visible in an addon reference are not part of the player tooltip.
- **Trade:** mirrored participant offers with item slots and money, Trade and
  Cancel actions. Acceptance highlights that participant's side green; changing
  an offer clears acceptance. This requires actual party/player state.
- **Mail:** parchment inbox rows and letter view, attachment slots, clear red
  actions. The town prop is a wooden post with a sheltered letter box and
  hanging cloth. Delivery and attachments require real ownership rules.
- **Bank:** dense item grid, a separate bag row, readable stack counts and an
  expansion-purchase footer. The existing secured-supplies total is not a
  functioning item bank.

### UI rendering decision

Keep browser HTML/CSS above the Three.js world for this desktop HUD, using
shared window, slot and tooltip layouts. The current implementation is ordinary
TypeScript DOM components. A renderer replacement does not resolve the observed
inconsistent frame offsets. React DOM could be adopted for component authoring
without replacing Three.js; no development-speed comparison has established a
benefit that warrants a migration during this delivery.

Current upstream references checked in September 2026:

- [Drei Html](https://drei.docs.pmnd.rs/misc/html) projects browser HTML onto
  scene objects; DOM overlays remain supported in the Three.js ecosystem.
- [UIKit](https://github.com/pmndrs/uikit) renders UI within the 3D scene and
  supports vanilla Three.js as well as React Three Fiber. Its vanilla setup
  adds pointer-event integration, layout updates and rendering configuration.
  Reconsider for a spatial/XR interface or a measured DOM limitation.
- [React DOM incremental adoption](https://react.dev/learn/add-react-to-an-existing-project)
  permits introducing components in an existing page without a scene rewrite.
- [Floating UI](https://floating-ui.com/docs/getting-started) supplies anchored
  positioning and viewport collision handling for more involved tooltips and
  popovers. Add it when those interactions exceed the current simple tooltip.

## Continuous tab-target combat

Tab or left-click selects a creature. The basic attack on 1 toggles automatic
attacks every 1.5 seconds, with no stamina cost. Warrior uses a sword within 2m;
other classes use their ranged weapon within 10m. Autos never move the player.
Moving out of reach or behind cover prevents a hit, and returning to range cannot
release accumulated attacks. Death, leaving the expedition, losing the target
or disconnecting stops auto attack.

Abilities fire when pressed if their resource and recovery requirements are met.
Instant abilities and combat equipment changes use a 1.5-second shared recovery;
movement is independent. No player action slots, queued sequences, shared rounds,
planning lockout, or enemy deliberation delay remain.

Each enemy chooses from current health, resources and positions, then commits its
next spell and starts an independent cast of at least 3 seconds. The cast bar is
the warning: icon, spell name and remaining seconds. Fireball uses 3 seconds;
defense or power abilities can use 5. The cast stays committed while the player
moves or acts. At completion it resolves with its actual range/area rules, then
its recovery ends before another choice. Additional enemies bring their own cast
timers. Summoned Foreman Nine always provides the full visible opening warning.

## First encounter: Cinder Watchman

The animated floating skull has 96 health. It casts targeted fire, briefly shields
itself, and powers up to add fireballs. Its next choice depends on current health,
player range and defenses. Use Block for homing damage, attack during power-up,
and let a shield expire while healing or repositioning. Volleys grow over time,
so indefinite defense becomes costly. Damage shown on the committed cast stays
fixed until that cast resolves. No unseen extra auto-attack shares its cast.

The nameplate identifies the creature and health above one compact cast bar.
Shield and control effects keep their distinct indicators. Its target frame repeats
that same cast; ground warnings describe the same threatened area or target.
Future choices remain unknown until the creature actually commits to them.
Targeted spells have no floating BLOCK card above the player. Their cast bar
provides the warning; dodgeable ground areas retain their own markers.

Floating combat text shows resolved damage, healing, absorbed damage and misses.
Outgoing damage rises beside the struck creature in gold; incoming damage appears
beside the player in red, healing in green and absorption in blue. Numbers use
actual amounts after armor, block and health caps, then fade after 1.4 seconds.
Each player sees their own results; repeated updates and reconnects do not replay
old numbers. Text stays behind the HUD and never intercepts mouse input.

## Player stamina and class abilities

Enemies recover their full health and lose accumulated power when they break
contact. Returning enemies cannot be attacked until they reach home. Retreat
saves the character but forfeits damage dealt, preventing repeated ranged chip
attacks from defeating an enemy without committing to its encounter.

All five classes have their own attacks, defenses, retreat moves and powers.
Five stamina regenerates continuously at one point per 1.5 seconds. Basic attacks
are free and run on an independent 1.5-second timer. Abilities spend stamina when
they activate, sharing a 1.5-second recovery. Movement remains available while
recovering and reading menus.

| Key | Ability | Stamina | Effect |
| --- | --- | --- | --- |
| 1 | Class auto attack | 0 | Warrior strikes within 2m; others shoot from up to 10m. Repeats every 1.5s |
| 2 | Class defense | 2, or 3 for Artificer | Absorb 24 damage for 2s. Alchemist heals 6 and blocks 16; Artificer blocks 28 |
| = | Health potion | 1 in combat | Drink a carried potion for 30 health |

The starting loadout contains attack, defense and potion. Slots 3 and 4 show
locked icons until Rowan teaches retreat and power. Action-bar dragging changes
slot order and the corresponding keys. Potions are consumed only on activation.

| Class | Retreat (3) | Power (4) | Damage added per power stack |
| --- | --- | --- | --- |
| Warrior | Disengage | Blood Rage | 4 |
| Mage | Froststep | Overchannel | 4 |
| Ranger | Parting Shot | Keen Focus | 4 |
| Alchemist | Caustic Escape | Volatile Mixture | 3 |
| Artificer | Recoil Snare | Overclock | 5 |

Retreat attacks cost 1 stamina, damage and snare their target, then move the
player backward. Warrior needs melee reach; ranged classes use their ranged
reach. Each power costs 1 stamina and uses the shared 1.5-second recovery. Up to three
stacks strengthen attacks. Each stack drains 1 health every
5 seconds, bypassing Block, except Ranger Focus, which does not drain health.
The drain can kill you. Outside combat lose one stack
every 2 seconds; re-engaging in time preserves momentum. The cap and health
cost bound farming on a weak enemy. Stamina and Rage, including their timers,
are saved. Older adventure saves initialize these resources without erasing
characters, health, loot or secured rewards.

Player and enemy frames have matching dimensions and contain only portrait,
name and health. The player frame has no stamina, Rage or location/status
section. The compact painted-icon hotbar has key labels, recovery shading and
hover explanations. Active auto attack has a lit border. A separate player cast
bar appears for gathering or awakening the engine, never for an instant attack.

## Later encounter: Ash hound

The animated Ash hound patrols the deeper western forest, runs toward its target
on the ground, and circles nearby. Its visible Maul cast gives at least three
seconds to respond. It then commits to a fixed landing point and leaps there in
0.65 seconds, facing its travel direction with running animation frozen. The
2m impact area can be avoided by moving after commitment or absorbed with Block.
Two seconds of recovery give a clear opportunity to counterattack before its next
cast. Maul starts at 18 damage and grows by 2 per attack, capped at 36.
There are no approach hops. Disengage offers a deliberate escape.

## In-game lorebook

J toggles the lorebook. L opens the quest log. Every current monster has a page with its portrait,
disposition, health, engagement behavior, opener, all abilities,
move sequences and useful responses. These entries consume the same ability
and sequence definitions as combat. Enemies choose from current fight state,
then show only their committed cast. Explain actual choices and timings.
Opening the book does not pause movement or combat. Escape and its flush
header close button both close it.

## Next playable test: an expedition that can defeat you

The first head is a teaching fight, not the final difficulty bar. The next
milestone is one legible failed expedition: a player can identify the decisions
that killed them and want to try those decisions differently. Keep direct action-bar controls.

Health and limited potions remain expedition attrition. Active stamina governs
short combat choices; it is not a persistent expedition wound resource. Damage and potion use carry between
encounters. Returning to the inn ends an attempt and secures modest salvage,
but the main reward requires reaching the deeper grove. A reset must not let
players keep expedition progress while erasing its cost. This attempt boundary
and reset behavior are proposed work, not a claim about the current save rules.

The second clearing should pair two creatures with different, readable attacks.
One pursues into melee; the other forces a positional decision. Pulling both
saves time but risks overlapping intentions and spending the escape at the
wrong moment. Telegraph incoming reinforcements and escalating danger before
activating them. Difficulty should come from readable combinations and resource
costs, not hidden damage changes, surprise spawns or shorter warning windows.

Measure whether a player can retreat to safety for free indefinitely. If that
removes the decision, test an explicit expedition danger clock: recovery and
travel consume time, and the next danger level is announced before it arrives.
Health recovery speed, persistent wounds and reduced maximum health are possible
later experiments only if the first attrition test needs them. Choose the actual
clock and recovery values through the short playable route, not a larger economy.

Acceptance: demonstrate a safe single pull, a costly double pull, an early
extraction with salvage but no main reward, and a death whose log and visible
intentions explain the fatal sequence. The player should be able to name a
plausible better choice. Fairness and the desire to retry require Tom's playtest.

Nearby hostile allies assist each other through clear terrain. Neutral creatures
remain neutral until attacked. Reinforcements share the encounter clock and
announce their move before joining. Pulling one creature remains manageable;
two should threaten near death without deliberate defense, and three should
overwhelm a committed fight. These are balance targets, not automatic damage
multipliers or a rule that kills the player merely for engaging three enemies.
The combat plan explicitly warns when two or more enemies are engaged.


### Next balance question

The implemented head and Rage mechanics test whether damage overlap and enemy
power-ups make stamina spending interesting. Endless defense must eventually
lose to growing volleys; spending everything on offense should expose the
player to predictable damage. A passing rules test establishes those mechanics,
not the fairness or enjoyment of the final balance. The next playtest decides
whether the timings, health and pressure produce decisions Tom wants to repeat.

## Ground attack warnings

Every engaged enemy shows its announced attack independently of target selection.
Highlighted areas use a bright effect-colored boundary and matching painted icon:
green for swarm/thorns, blue for frost, amber for Maul. The area matches the actual
strike radius and follows the caster until the windup commits its ground.
A small painted icon and countdown sit at the far edge of the area. Detailed
damage, caster and timing information lives on the nameplate cast bar and
target frame; large warning cards do not cover the central fighting area.

Homing fireballs and beams mark the player in red; their ability details explain
that they track you and can be blocked;
they do not pretend to be dodgeable splash areas. Shield and power-up circles sit
under their caster; the cast bar identifies the buff. They have no
second ground-level text card overlapping the player frames. Existing damage attacks do not
acquire poison-over-time or freeze effects merely from their warning color.

Each enemy casts independently. Ordinary physical strikes retain a 0.35-second
windup and Maul its 0.65-second lunge. Warnings reflect committed cast timing and
landing areas, with no global pause between casts.

## Patrols and encounter pressure

Every creature has a short patrol, pausing 0.75 seconds between route legs. The
Briar bee wanders beside the permanent thicket; killing it never changes shrubs
or collision. Hostile allies assist within 9 metres through clear terrain,
within their own territory. Neutral bees only fight when attacked.

The bee, warder and hound have 72 health, the Watchman 96, and Foreman Nine 200.
The warder starts at 18 damage and the bee at 16. Each
resolved attack increases the next by 15% of base, capped at double, plus forest
attention. Maul starts at 18 and gains 2 per attack to 36. Choosing a cast commits
the displayed damage; impact never secretly changes it. Block absorbs 24
within two seconds for two stamina.

## Shared world and starting controls — 0.8.0

All players share one server-owned Nine-Bell Yard, including enemy health, movement,
intentions, combat clock, gathered resources and corpse claims. Character health,
movement, inventory and abilities remain individual. The first nearby player
to loot receives that corpse's reward. Returning to town never resets the shared
forest. Ordinary enemies and harvested resources respawn after two minutes.

The action bar has individual squares labelled 1–9, 0, -, =. Attack is 1, block
is 2, and health potion is =; the remaining slots are empty. Attack art is sword
for warrior, wand for mage, bow for ranger. Stamina costs are explained in hover tooltips; bottom-right numbers are consumable quantities. Enter opens
shared text chat. Chat typing never triggers movement or ability keys.

The public server stores character/world progress. Browser character access is
retained with an opaque browser token; old single-player saves are left intact.
No voice chat or party management is implemented. Server positions update at
20 Hz; scene positions interpolate each rendered frame. Rendering never resolves
combat outcomes.

Local development normally connects to the same public world so Tom and invited
players can meet regardless of which client build they open. For isolated tests,
launch the dev server with GREYWROUGHT_LOCAL_WORLD=1 and a separate
GREYWROUGHT_WORLD_SAVE path. Never test combat against the live shared save.

## Private encounters and pause — 0.12.0

Escape pauses by taking the character into a private copy of the zone. The same
thing happens on disconnect; a lost connection is detected within five seconds
of the last WebSocket pong. The browser answers pings automatically, without a
gameplay heartbeat timer or focus check. Existing combat, damage, warnings and
supplies are kept.
Other players remain in the shared world with its own enemies and clock. The
current build has no parties, so only the character and enemies enter the copy.

The private encounter stays frozen until Resume encounter is chosen, including
after reconnecting or restarting the server. Switching tabs or windows only
suspends local rendering and audio and releases held movement; combat continues
on the server. Loading without focus does not fork. Closing or leaving the page
requests pause. Returning focus does not resume an explicitly paused encounter.
It can be paused again at any time.

The copy grants no loot, resources, experience or quest progress. Carried
potions may be used and equipment changed while playing; health loss, death and
spent supplies persist. Death still ends the character's life. Finish the fight
or retreat, then choose Rejoin world to return near the original pause location.
Rejoining carries the character's current condition back without merging enemy
deaths or replenishing health. It does not silently resume the shared world.
