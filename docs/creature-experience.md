# Wayfarer outfitting and expedition

Open rofi's application launcher, search **Greywrought**, and press Enter.
The objective is to outfit the Wayfarer, defeat the ashfield sentinel, collect
salvage, and return home. The Wayfarer handles travel, firing, cooling and
salvage automatically; you choose equipment, orders, and when to retreat.

The scene starts unobscured. Open **Outfit** with O, select equipment on the
left, choose a body part marked `[fits]`, and equip it. Connecting its power is
a separate action. The panel explains each item, compatible body parts, power,
and condition; scroll for the remaining equipment and orders. Esc closes it.
Choose protective or aggressive orders, then **Deploy** (Enter). Backspace
requests an early return and keeps that retreat order until the next deployment.
**How to play** (?) explains the objective, controls, readings, and consequences.

Gold weapon flashes and beams show firing, hit sparks show damage, and blue
vapor shows cooling. The labelled sentinel's health shows combat progress.
The Wayfarer cools below the selected heat limit before resuming fire.

Returning retains injuries and equipment wear. Repair spends supplies on the
selected equipment; Rest heals the Wayfarer without restoring worn gear. F5
saves, and normal close saves too. F6 opens developer tuning; Page Up/Down selects
an offered expression, Ctrl+A replaces it, and Enter applies it without deploying.
The installed launcher starts this mode with the separate save
`~/.local/share/greywrought/creature.save` (or its `XDG_DATA_HOME` equivalent).
Separate company/workshop saves are not overwritten. Saved worlds
retain their exact source, including accepted tuning.

## First-session repair, 2026-09-06

The current compiler pin is `6bcd33125af1aa846994cd9b34b5434f484893b8`;
the generated Wasm SHA-256 is
`1898859753d8a53940dafd3abc93134f55606a0333563a1c6c1bb441119d26ca`.
The final native build passed in 15.66 seconds and Wasm build in 23.57 seconds.
The existing pin/hash check passed. The focused presentation tests passed,
including restoration of Deploy and Return captions after phase changes.

Rofi launched the staged native launcher into an isolated X11 session. The
compact HUD and Outfit panel were inspected at 1440x900 and 720x900. A trip
defeated the sentinel and returned 12 salvage and 27 supplies, with body
condition at 81%. Repair restored the selected weapon from 2/45 to 45/45,
spent 11 supplies, and left injuries unchanged. Rest restored body condition.

The next trip fitted the helmet to the head, raising equipment load from
24 to 27. Captured combat showed gold damage sparks, blue cooling vapor,
falling sentinel health, and stable firing/cooling intervals. Other gear was
still worn: when the braces lost power, the Wayfarer retreated on foot without
reapproaching. At home, helmet repair restored 56/65 to 65/65 for two supplies;
Rest then healed the body. F5 saved, normal window close completed another
save, and a second rofi launch displayed the same helmet attachment and
condition, 14 supplies, 100% body condition, heat 16 and reserve 68.

These are native interaction observations using llvmpipe, not hardware FPS
evidence. One earlier isolated test process was externally terminated before
completion; it was not counted as a pass. The completed run used an attached
terminal and a window manager for the normal-close check.

The original installed save also passed the final native checked-source update
probe: exact expected source, explicit replacement of four offered source
items, preserved progress, exact source/projection/continuity on reopening,
and a subsequent tick. The upstream check additionally compared retained
supplies, injuries, equipment damage, and attachment identity against the
actual old checkpoint. Reopening validates its recorded execution layout;
the explicit source update selects the new layout without resetting the world.

## Earlier creature-slice observations

That earlier candidate pinned Clause `bfecc7e9416bd413069b4b4e57bbfd0391374b62`; its exact
Wasm SHA-256 is `c8761f74bec66a0c03579e4ebbac54aa73299e9d9a924a2e11658d1712fd32f2`.
The native executable built in 46.22 seconds. Its presentation repair rebuilt
in 16.79 seconds. Both focused native projection tests passed after integration.

An actual native window accepted helmet selection, head selection and fitting;
equipment mass changed from 24 to 27 and the helmet attached to the head.
Deploy hid the outfit panels and the animated character moved into the ashfield.
The complete expedition returned with 12 salvage, 27 supplies, approximately
84% body condition, and a worn helmet at 57/65. Repair restored that helmet to
65/65 and reduced supplies to approximately 25, leaving injuries intact.
After saving and closing, a new native process displayed those same consequences.
Exact source, projection and explicit edit-continuity comparisons also passed
through the existing native saved-world probe.

Three live changes of the salvage rate, 3 to 6 to 3 to 6, were accepted in one
running world. Generations advanced 1 to 4 without restarting the window or
deploying from the editor's Enter key. The final edited expression survived
reopening. The focused rule test separately proves that accumulated cargo stays
and the next 16 ms increment changes from 0.048 to 0.096.

| Edit | Checked operation | Accepted projection submitted to scene |
| --- | ---: | ---: |
| 3 to 6 | 1058 ms | 1370 ms |
| 6 to 3 | 974 ms | 1165 ms |
| 3 to 6 | 686 ms | 888 ms |

These are developer timestamps, not GPU-present measurements. Interactive
validation used an isolated 1440x900 X11 window with llvmpipe software rendering,
because synthetic mouse input did not reliably reach the inactive desktop
session. The Radeon 890M separately rendered the character and equipment in
the real desktop window, including the narrow tiled layout. That inactive
window was heavily frame-throttled; neither run establishes hardware FPS.
The software journey recorded 2176 frame intervals over 299.758 seconds,
p95 199.925 ms, and 116.544 simulated seconds. It is not a performance pass.

The three focused anatomy/expedition tests passed in 102.36 seconds after a
35.31-second build. They retain invalid-fit and occupied-slot refusal,
local protection, walking and leg injury without equipment, distinct rest and
repair, severed/rerouted power, exact save/reopen, and the consequential edit.
Their controlled preparations produced:

| Preparation | Ticks to return | Maximum heat | Returned supplies |
| --- | ---: | ---: | ---: |
| Protective orders | 2315 | 35.20 | at least 27 |
| Same build, aggressive orders | 1909 | 80.22 | at least 27 |
| Aggressive, auxiliary power fitted | 1640 | 61.71 | 27 |
| Same build, cooling disconnected | 4224 | 86.16 | 15 |

## Clause contribution and remaining cost

World meaning is in one 805-line Clause source: eight laws, sixteen handler
clauses and ten input bindings. Anatomy added 265 lines and removed 22 relative
to the preceding machine source. An ordinary salvage-rate change touches one
offered expression; no host gameplay calculation or save schema changes.
Fitting, power closure, capacities, autonomous decisions, consequences and the
report all consume those same authored rules.

This is a demonstrated consistency and supported-edit benefit, not a measured
authoring-speed advantage. Authoring still repeats role declarations, facts,
premises and explicit replacements. The host repeats projection field names
and presentation asset/bone mappings: 481 lines in the native adapter and 809
in the workshop presenter. Those counts include transport and visuals, not a
second simulation. Tests repeat expected values and exact edit selectors.
No comparable hands-on authoring-time ledger was collected; build/test timers
must not be presented as developer effort.

Delivery exposed genuine compiler gaps in Boolean/inequality derivation,
aggregate strata and atomic multi-clause typed inputs. They were repaired
upstream, with retained counterexamples, before this consumer resumed. Two
native adapter/visibility errors also required repair. The saved-world probe
incorrectly assumed an edit transition existed in every save; its explicit
absence is now handled without suppressing errors or weakening comparisons.

The existing conventional comparison in `greywrought:docs/m5-comparison.md`
shows exact parity for one party attack, not this complete loop or equal service
cost. It cannot establish an engine-speed or authoring-effort advantage here.
No conventional second game was added merely to manufacture that claim.

The original 100-moving-actor, at least 59 FPS, p95 at most 20 ms, real-time
within 5%, and three edits within 250 ms requirements remain unmet; see
`greywrought:acceptance/performance/README.md`. This smaller character scene
does not replace them. Graphics and encounter feedback remain an early slice,
not a finished Steam game or a demonstrated moat. The next justified language
investment is the already-measured evaluator/edit critical path, followed by
the unchanged 100-actor gate on a meaningfully changed candidate.
