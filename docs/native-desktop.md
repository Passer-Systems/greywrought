# Native development loop

Run `bun run build:play` once, then `bun run play` from the chosen checkout.
The launcher runs the compiled Bevy window in the project's Linux development
environment. No server or watcher is needed. Host/compiler changes require a
new build; supported gameplay tuning happens inside the open world.

## Walk from Hearthstead into the forest

Start in town and walk north through its gate. The forest begins as you cross
its boundary; returning through the gate secures carried cores and relics.

- W/S walks forward/back. A/D turns; Q/E strafes.
- Left-drag orbits the camera. Right-drag steers the character and makes A/D
  strafe. The wheel zooms, from a close view to a wider view of the road.
- Walk toward the blue frost cores near the lookout. G gathers when close.
  Read the selected threat's current and upcoming intentions before engaging.
- Click a threat card or press 1–5 to target it. Space strikes within reach;
  B braces. Clearing the lookout stops its repeated alarms.
- R offers six carried cores at the deep grove to call the guardian. Its relic
  still needs a living return. O opens equipment; return to town to change it.
- Walk back through the gate to bank your cargo. F5 saves; closing normally
  also saves. Permanent loss stays saved.

The first route has been exercised in a private native window: walking,
orbit/zoom/steering, gathering, fighting, inspecting, live tuning, returning
and reopening. This is a local playtest. Buildings and trees are decorative;
map, gate and thicket bounds constrain movement. The camera pulls in before
visible scenery and restores the selected zoom when clear. Shared hubs,
companions and multiplayer disconnect protection remain unfinished.

## Tune and inspect

Press F6 for developer tuning. Page Up/Down selects a compiler-offered
expression. Ctrl+A clears its text; Enter submits the checked change.
Rejected edits preserve the running world. Arbitrary structural file reloads
are not promised to preserve state.

Press F7 for developer inspection. 1 shows accepted state, 2 the last forest
strike and 4 the last gathering action. 3 asks whether clearing the warder
would have prevented the recorded gathering injury. Left/Right chooses
an offered handler; Enter explains it. Up/Down/Page Up/Page Down scroll.
F7 or Escape closes the panel.

The developer panel intentionally displays source and runtime diagnostics.
Recorded explanations describe historical actions. The finite counterfactual
predicts without changing the accepted world and states its limits. Requests
run on the world thread and stale source generations are rejected. Saved exact
source includes accepted tuning changes.

## Saves and execution

The spatial forest defaults to `~/.local/share/greywrought/spatial.save`,
respecting `XDG_DATA_HOME`. Use
`bun run play --save /absolute/path/to/spatial-character.save` for a separate
character. The earlier `~/.local/share/greywrought/forest.save` retains its
clearing-based map and belongs with the earlier installed release. This
playtest does not convert or overwrite it. The `--company` and `--workshop`
modes retain their separate default saves.

One file lock owns each save. Corruption or incompatible source reports an
error rather than silently replacing the saved world. Installing the spatial
release preserves an already running earlier game and selects the new game for
subsequent launches.

Clause owns movement, locations, interaction range, zone transitions and
expedition outcomes. Bevy handles physical input, camera and presentation.
The event loop and Clause thread use a bounded queue and latest accepted
projection. Slow simulation never enlarges or skips the 16 ms world tick.
Responsive camera motion alone does not establish simulation speed.
Assets retain their notices under `greywrought:assets/external/`.

## Observed boundary

The spatial native journey gathered three cores, cleared the lookout, applied
a checked gathering edit, inspected the recorded injury, walked home and
reopened with vitality 92 and supplies increased from 15 to 18. The recorded
counterfactual remained explicitly historical and did not change the world.

Focused source journeys cover physical extraction, 30 seconds of readable
intentions, ritual rewards, death consequences and disconnect preservation.
The native view and inspection checks cover exact input referents, checked
editing, stale-generation rejection and save continuity. Movement is bounded,
diagonal speed is normalized, and stale movement input expires. The separate
100-actor and three-visible-edit targets remain open; scene submission is not
a GPU-present timestamp. A small native playtest does not prove those targets.
