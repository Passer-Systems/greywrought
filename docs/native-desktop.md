# Native development loop

Run `bun run build:play` once, then `bun run play` from the chosen checkout.
The launcher runs the compiled Bevy window in the project's Linux development
environment. No server or watcher is needed. Host/compiler changes require a
new build; supported gameplay tuning happens inside the open world.

## Next native playtest

The target is a third-person MMORPG with WASD character movement and a
World of Warcraft-style orbit camera, mouse steering and zoom. Start inside
a walkable Hearthstead, leave through its gate, and follow the road across
the forest boundary. An instance can load at that physical crossing. Return
along the route to the hub with extracted rewards.

Prove camera and movement feel, the hub-to-forest crossing, approaching one
threat/resource, and the return journey before expanding the map. Clause owns
movement rules, location, zone transitions and interaction eligibility; Bevy
handles physical input, camera control and presentation. Keep checked edits,
inspection and save/reopen usable throughout. Shared hubs, companions and
multiplayer disconnect protection remain required beyond the local slice.

The clearing-step controls below describe the currently playable prototype.
They are not the target movement system. Tested native milestones should be
promoted through the existing launcher with a short what-changed/what-to-try
note, preserving an existing playtest and its saves.

## Play, tune and inspect

1. Enter departs Hearthstead. D advances along the trail and A retreats.
   Click a threat card or press 1–5 to select it; Space strikes and B braces.
   G gathers at the grove, R offers six cores to call the guardian, and X
   extracts when back at Hearthstead. O opens equipment. Read current and
   upcoming intentions before deciding whether to engage or move on.
2. Press F6 for developer tuning. Page Up/Down selects a compiler-offered
   expression. Ctrl+A clears its text; Enter submits the checked change.
   Rejected edits preserve the running world. Arbitrary structural file reloads
   are not promised to preserve state.
3. Press F7 for developer inspection. 1 shows accepted state, 2 the last forest
   strike and 4 the last gathering action. 3 asks whether clearing the warder
   would have prevented the recorded gathering injury. Left/Right chooses
   an offered handler; Enter explains it.
   Up/Down/Page Up/Page Down scroll. F7 or Escape closes the panel.
4. Press F5 to save, or close normally, then reopen with the same save path.
   The saved exact source includes accepted tuning changes.

The developer inspection panel intentionally displays source and runtime
diagnostics. Recorded explanations are historical evidence. The finite
counterfactual query predicts without changing the accepted world. Requests
run on the world thread and stale source generations are rejected.

## Saves and execution

The default forest save is `~/.local/share/greywrought/forest.save`, respecting
`XDG_DATA_HOME`. Supply `bun run play --save /absolute/path/to/forest.save` for a
separate character. Permanent death remains saved; another character needs a
different save path. The older `--company` and `--workshop` modes use their own
saves by default; existing saves are preserved.
One file lock owns each save. Corruption or incompatible source reports an
error rather than silently replacing the saved world.

The Bevy event loop and Clause thread use a bounded command queue and latest
accepted projection. Slow simulation never enlarges or skips the 16 ms world
tick. Responsive camera motion alone does not establish simulation speed.
Assets retain their notices under `greywrought:assets/external/`.

## Observed boundary

The actual forest window displayed changing intentions, combat, gathering and
a living extraction. A checked gathering-yield edit survived play, state
inspection, saving and reopening: the observed character returned with vitality
61 and banked supplies increasing from 15 to 19. A separate prolonged expedition
ended in permanent loss and retained that loss when reopened.

The forest projection test checks exact input referents, explanation evidence,
checked editing, stale-generation rejection and source/state save continuity.
Five source-rule journeys and the existing company inspection test cover their
respective boundaries. The 100-actor and three-visible-edit targets remain open;
scene submission is not a GPU-present timestamp. The forest is a five-clearing
trail, with free exploration, networked companions and multiplayer disconnect
integration still unfinished.
