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

Auto-attacks and special intentions must be attached to the enemy they describe.
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

Start with one complete encounter: the Ember head teaches independent beam
and fireball clocks, shielding, and growing volleys. The later Ash hound adds
movement through a five-second warned, dodgeable Lunging Maul. Establish a readable
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
them. Adjacent moves with a plus sign happen together. Auto-attacks have a
separate icon and clock beside that sequence. The stored opener is visible
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

## First encounter: Ember head

The first clearing holds an animated floating skull with 72 health. On
engagement in range it immediately raises Ember Ward (6 block for 5 seconds)
and fires Ember Beam (1 targeted damage). The stored opener and auto-attack
are visible before pulling. Beam repeats on its own 3-second clock.

The head follows three repeating pairs. Times are measured from each pair's
start; a new pair starts after the previous pair's final projectile or ward
finishes. Its first move happens at +5 seconds and the second at +5 through
+10 seconds. No input synchronization is needed.

| Pair | First move | Second move | Gap |
| --- | --- | --- | --- |
| 1 | Fireball at +5s | Ember Ward at +5s | Together |
| 2 | Kindle at +5s | Fireball at +10s | 5 seconds |
| 3 | Kindle at +5s | Fireball at +8s | 3 seconds |

Fireball timing advertises impact, with release 0.9 seconds earlier. Each
projectile deals 3 targeted damage and successive impacts are spaced 0.2 seconds
apart. Kindle adds one projectile to later volleys. The head's ward is down
during Kindle preparation: attack before the increase resolves. Defeating the
head or leaving its territory extinguishes remaining fireballs. In-flight
projectiles and enemy block survive reopening the encounter.

The queue shows current activity and two actual upcoming moves, previewing
across the fixed pair boundary when necessary to keep both future slots useful.
A pause is a visible time gap, not an unnamed ability. For example: pause 5s →
Fireball → pause 3s → Fireball. This example illustrates the display; the table
above defines the head's actual sequence. Auto-attacks remain independent and
can overlap a spell. Actual shields and roots appear beside the health bar.

## Player stamina and Blood Rage

The starting kit is available to existing characters; distinct class kits come
later. Active stamina is capped at 3 and recovers by 1 every 2 seconds. There
is no backup resource or per-ability cooldown in this prototype. Actions share
recovery time; movement remains available while recovering and reading menus.

| Key | Ability | Stamina | Effect | Action recovery |
| --- | --- | --- | --- | --- |
| 1 | Lunge | 1 | Move into reach; deal 9 melee damage | 1s |
| 2 | Disengage | 1 | Deal 6 melee damage, leap backward; root target until landing | 1s |
| 3 / E | Block | 2 | Absorb 10 damage over at most 2s | 1s |
| 4 | Blood Rage | 1 | Gain one stack, up to 3; combat only | 2s |

Each Rage stack adds 2 damage to Lunge and Disengage and drains 1 health every
5 seconds, bypassing Block. It can kill you. Outside combat lose one stack
every 2 seconds; re-engaging in time preserves momentum. The cap and health
cost bound farming on a weak enemy. Stamina and Rage, including their timers,
are saved. Older adventure saves initialize these resources without erasing
characters, health, loot or secured rewards.

Player frames show three stamina pips and the current Rage count, drain or
fade timer. The compact painted-icon hotbar has key labels and full hover
explanations. A separate bar shows successful action recovery; it never claims
an instant action is still casting or can be interrupted.

## Later encounter: Ash hound

The animated Ash hound patrols the deeper western forest. On engagement it
approaches through forward diagonal hops, choosing left or right at 45 degrees
independently with equal probability while facing the player. Nearby it circles
and commits Maul toward a fixed landing point. It recovers for 2 seconds after
landing; the next 5-second Maul preparation starts at that landing and includes
recovery. A lunge takes 0.65 seconds and deals 9 damage within 3 metres of its
committed landing. Disengage provides a deliberate escape and punishment loop.

Bite is independent: 4 targeted damage, ready every 4 seconds. The hound pursues
for real contact rather than dealing phantom ranged damage. Maul does not home.
Block can absorb either source; coincident attacks compete for the same pool.
The other forest creatures retain their distinct attacks and 3-second warnings.
Their single repeating special is shown truthfully; the head is the full paired
forecast encounter in this prototype.

## In-game lorebook

L toggles the lorebook. Every current monster has a page with its portrait,
disposition, health, engagement behavior, opener, auto-attack, all abilities,
move sequences and useful responses. These entries consume the same ability
and sequence definitions as combat. The head's order is fixed; the wolf's
left/right approach hops each have a 50% chance; ordinary repeated moves have
no random permutations. Explain actual randomness rather than inventing it.
Opening the book does not pause movement or combat. Escape and its flush
header close button both close it.

## Next playable test: an expedition that can defeat you

The first head is a teaching fight, not the final difficulty bar. The next
milestone is one legible failed expedition: a player can identify the decisions
that killed them and want to try those decisions differently. Keep attack on 1.

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


### Next balance question

The implemented head and Rage mechanics test whether damage overlap and enemy
power-ups make stamina spending interesting. Endless defense must eventually
lose to growing volleys; spending everything on offense should expose the
player to predictable damage. A passing rules test establishes those mechanics,
not the fairness or enjoyment of the final balance. The next playtest decides
whether the timings, health and pressure produce decisions Tom wants to repeat.
