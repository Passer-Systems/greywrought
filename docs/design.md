# Greywrought: Frostwood expedition

Build a third-person expedition RPG that earns another expedition: prepare in
Hearthstead, read a dangerous forest, choose which problems are worth solving,
bring something valuable home, and use it to prepare for a harder journey.
The intended complete experience is roughly ten minutes; the first release
must first make its route and a short encounter understandable through play.

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
- One local expedition first; shared hubs, companions and online disconnect
  protection belong to later multiplayer work.

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
abilities are shared. Basic attack icons and queued moves use a sword, wand,
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
prepares, the action visibly resolves, and recovery creates a readable next
beat. A strike should have a visible impact; bracing should have a visible
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

Player and target frames sit near the lower center with room between them for
the character. Show the target's target beneath its frame when it is actually
attacking someone. Painted ability icons sit below enemy health and name. Read the current action
or pause, then the next two special moves, with explicit pause durations between
them. Each enemy commits only one ability per active window; following icons
preview following windows. The stored opener is visible
before engagement. Each ability has its own hover tooltip.
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

## Shared combat beat

Target a creature and queue your response before entering its engagement range.
Combat begins with three active seconds, followed by five preparation seconds.
Both sides use the same clock. The player may use up to three moves, but each
enemy commits only one announced ability per window. There are no separate
enemy auto-attacks. Additional enemies approach and show their plan
immediately, then join the next active opening without resetting that clock.
Disengaging buys space; it is not necessary to repair separate enemy timers.

Summoning the frost guardian gives at least five seconds to read its opening
and queue a response. Summoning while already fighting must preserve the
existing encounter's clock and give the guardian its own safe joining window.

Q queues Lunge for warriors, Arcane Bolt for mages, or Aimed Shot for rangers; E queues Block, Z Disengage, and X Blood Rage. The first move defaults
to the opening beat. Further moves default to the earliest legal time, with
at least one second between actions. Blood Rage commits two seconds.
Activation and effect duration are separate: Block raises a two-second shield
on its chosen beat and permits attacking on the next beat without dropping it. At most
three moves fit in an active window; stamina and longer commitments constrain
that further. The active window is three seconds, with player beats at
0s, 1s, and 2s, followed by one second of choosing and five seconds of preparation. Queued stamina
is reserved, then spent when a move executes.

Press 1–3 to place the selected pending move in slots 1–3 (0–2 seconds),
swapping with another pending move there when their recovery times allow it.
QE means Lunge at 0s and Block at 1s; QE3 means Block in slot 3, at 2s.
The last queued move stays selected indefinitely,
so numbers also allow last-second adjustments during the active window until
it fires. Clicking another pending icon selects it. Drag to an empty beat to
move it, or onto a pending move to swap them; Shift+1–3 does the same by
column. Pointer buttons use the same slot numbers 1–3. Backspace removes
the selected pending move. Already-used moves cannot be moved or swapped.
Past times, recovery conflicts, and moves outside the window are rejected
without changing the existing plan. Movement and jump remain immediate.

A compact three-column timeline aligns your plan with the selected enemy's
announced moves. It shows the shared phase, remaining time, selected move,
and reserved stamina. Target changes cancel stale moves. Defeat, return to
town, and losing the encounter clear the plan. Saved journeys retain the clock
and pending plan. Older five-slot journeys keep character and world progress;
unused slots four and five are removed, and an ongoing encounter resumes with
a fresh five-second preparation period. Same-beat player defense resolves before enemy damage.
Attack range and paths are checked when the move actually fires.

## First encounter: Ember head

The first clearing holds an animated floating skull with 96 health. Its sole
opening move is Ember Beam (8 targeted damage). Queue Block before pulling to
absorb it. After all three active beats resolve, enemies choose from the resulting
health, positions and resources. A fixed one-second Choosing phase reserves time
for this decision; finishing early does not shorten it. No next move is shown
during Choosing. Five full seconds of preparation then reveal one committed move
on one of three equally likely beats. The move stays fixed despite subsequent
movement or resource changes. The rhythm is always 3 active → 1 choosing → 5
preparation; the announced move lands 5, 6 or 7 seconds after preparation starts
(plus the creature's visible attack animation where applicable).

The Ember head normally chooses Fireball. At half health, or against Blood Rage,
it may choose Ember Ward (6 block for 2 seconds) when the player is within strike
range and has stamina left. It favours Fireball if a volley can finish the player,
and never wards twice consecutively. After every third action, or when the player
is out of reach or has enough block to absorb its volley, it chooses Kindle.
Kindle always leads to Fireball, so staying out of reach cannot produce endless
power-ups without an attack window. Each choice uses the state at the end of
the active sequence, before stamina replenishes. Existing committed saved moves
resume unchanged; subsequent choices use these rules.

During Ward, power up or heal, then attack after the shield expires. During
Kindle, choose whether to exploit the opening or defend against another
creature. Each extra enemy adds one announced move to read, not five.

Fireball timing advertises impact, with release 0.9 seconds earlier. Each
projectile deals 18 targeted damage. Successive impacts are spaced up to 0.2s
apart, tightened for larger volleys to finish inside the active window.
Kindle adds a projectile to later volleys. Defeating the head or leaving its
territory extinguishes remaining fireballs. Projectiles and enemy block survive
reopening the encounter.

The whole nameplate stays above the creature: level, name and disposition above
health, then a compact sequence containing only a pause and the one committed
move. During the move, show its active icon; once it finishes, show only the
remaining pause until the next decision. Never preview later windows. The fixed
Choosing phase shows a pause and explains "Choosing next move" on hover.
Pause durations remain visible; ability names, damage, beat and engagement conditions
are explained on hover or focus. Avoid redundant labels and unexplained numbers
on the icons. Level marks encounter progression (head 1, bee/hound 2, warder 3,
guardian 4); it does not multiply damage. Actual shields and roots appear beside
the plate. The lorebook describes the same moves.

## Player stamina and Blood Rage

The class basic attacks differ; the remaining starting kit is shared. Each active window has five stamina, replenished after the active sequence resolves
and when combat ends. There is no midwindow stamina regeneration. There
is no backup resource or per-ability cooldown in this prototype. Actions share
recovery time; movement remains available while recovering and reading menus.

| Key | Ability | Stamina | Effect | Action recovery |
| --- | --- | --- | --- | --- |
| Q | Lunge / Arcane Bolt / Aimed Shot | 1 | Warrior closes into melee for 9 damage; mage/ranger hit from up to 10m without moving | 1s |
| Z | Disengage | 1 | Deal 6 melee damage, leap backward; root target until landing | 1s |
| E | Block | 2 | Absorb 24 damage over at most 2s | 1s |
| X | Blood Rage | 1 | Gain one stack, up to 3; combat only | 2s |
| V | Jab | 0 | Stationary strike for 3 melee damage within 2m | 1s |
| N | Guard | 0 | Absorb 2 damage over at most 1s | 1s |
| H | Health potion | 1 | Drink a carried potion for 30 health during combat | 1s |

Free fillers are manual and still occupy one beat. There is no automatic
filling. Potions remain immediate outside combat; a queued potion is only
consumed when it fires.

Each Rage stack adds 2 damage to melee attacks and drains 1 health every
5 seconds, bypassing Block. It can kill you. Outside combat lose one stack
every 2 seconds; re-engaging in time preserves momentum. The cap and health
cost bound farming on a weak enemy. Stamina and Rage, including their timers,
are saved. Older adventure saves initialize these resources without erasing
characters, health, loot or secured rewards.

Player frames show five stamina pips and the current Rage count, drain or
fade timer. The compact painted-icon hotbar has key labels and full hover
explanations. A separate bar shows successful action recovery; it never claims
an instant action is still casting or can be interrupted.

## Later encounter: Ash hound

The animated Ash hound patrols the deeper western forest. On engagement it
approaches through forward diagonal hops, choosing left or right at 45 degrees
independently with equal probability while facing the player. Nearby it circles
and commits Maul toward a fixed landing point. It recovers for 2 seconds after
landing. After the first encounter, Maul starts on a randomly chosen beat
after the visible preparation.
The first encounter warns for 4 seconds before launching. A lunge takes 0.65 seconds and starts at 18 damage within 3 metres of its
committed landing. Disengage provides a deliberate escape and punishment loop.

Maul is the hound’s sole combat action in each window. It does not home.
Block can absorb it; movement can avoid its committed landing.
The other forest creatures retain their distinct attacks, previewed during
shared preparation before a short windup on their announced random beat.
Their single repeating special is shown truthfully; future icons preview their next windows.

## In-game lorebook

L toggles the lorebook. Every current monster has a page with its portrait,
disposition, health, engagement behavior, opener, all abilities,
move sequences and useful responses. These entries consume the same ability
and sequence definitions as combat. The head's ability order is fixed, but each enemy independently chooses
its next beat with a one-third chance for each of the three player slots. Choices are preserved
when reopening a journey. The wolf's left/right approach hops each have a 50% chance. Explain actual randomness rather than inventing it.
Opening the book does not pause movement or combat. Escape and its flush
header close button both close it.

## Next playable test: an expedition that can defeat you

The first head is a teaching fight, not the final difficulty bar. The next
milestone is one legible failed expedition: a player can identify the decisions
that killed them and want to try those decisions differently. Keep the Q/E/Z/X queue controls.

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
A countdown and beat number sit at the far edge of the area.

Homing fireballs and beams mark the player in red and say Tracks you / Block;
they do not pretend to be dodgeable splash areas. Shield and power-up cues sit
under their caster and identify an enemy buff. Existing damage attacks do not
acquire poison-over-time or freeze effects merely from their warning color.

Each subsequent enemy window independently selects one of three player beats.
Head attacks resolve on that beat; physical attacks retain their windup, landing
0.35 seconds later (ordinary enemies) or 0.65 seconds later (Maul).
All three player slots remain valid, all impacts finish before preparation, and
previews reflect the exact saved choice rather than rerolling during a countdown.

## Patrols and encounter pressure

Every creature has a short patrol, pausing 0.75 seconds between route legs. The
Briar bee wanders beside the permanent thicket; killing it never changes shrubs
or collision. Hostile allies assist within 9 metres through clear terrain,
within their own territory. Neutral bees only fight when attacked.

The bee, warder and hound have 72 health; the head and guardian have 96.
The warder starts at 18 damage, the bee at 16 and the guardian at 20. Each
resolved attack increases the next by 15% of base, capped at double, plus forest
attention. Maul starts at 18 and gains 2 per attack to 36. Preparation commits
the displayed damage; impact never secretly changes it. Block absorbs 24
within two seconds for two stamina.

The seeded committed-melee comparison begins at 100 health without potions:
solo warder 82 health attacking / 98 with timed Block; warder plus hound 22 / 42;
adding the guardian kills both strategies. The controller pursues its target,
uses five attacks or one timed Block plus three attacks and Jab, and retargets
on defeat. This bounds the tested claim: movement, potions, different random
beats and player choices can change the result; it is not a guaranteed death
rule or a substitute for playtesting.
