# Native development loop

Run `bun run build:play` once, then `bun run play` from the chosen checkout.
The launcher runs the compiled Bevy window in the project's Linux development
environment. No server or watcher is needed. Host/compiler changes require a
new build; supported gameplay tuning happens inside the open world.

## Play, tune and inspect

1. Choose an encounter with 1/2/3, select the company with Tab and begin with
   Enter. Click/Shift-click selects exact units; right-click moves or targets.
   Space attacks, H heals, J wards, I ignites and X stops movement.
2. Press F6 for developer tuning. Page Up/Down selects a compiler-offered
   expression. Ctrl+A clears its text; Enter submits the checked change.
   Rejected edits preserve the running world. Arbitrary structural file reloads
   are not promised to preserve state.
3. Press F7 for developer inspection. 1 shows accepted state, 2 the last strike,
   3 a bounded prediction of whether the target could have survived, and 4 the
   last heal. Left/Right chooses an offered handler; Enter explains it.
   Up/Down/Page Up/Page Down scroll. F7 or Escape closes the panel.
4. Press F5 to save, or close normally, then reopen with the same save path.
   The saved exact source includes accepted tuning changes.

The developer inspection panel intentionally displays source and runtime
diagnostics. Recorded explanations are historical evidence. The finite
counterfactual query predicts without changing the accepted world. Requests
run on the world thread and stale source generations are rejected.

## Saves and execution

The default company save is `~/.local/share/greywrought/world.save`, respecting
`XDG_DATA_HOME`. Supply `bun run play --save /absolute/path/to/world.save` for a
separate company. The older `--workshop` mode uses its own save by default.
One file lock owns each save. Corruption or incompatible source reports an
error rather than silently replacing the saved world.

The Bevy event loop and Clause thread use a bounded command queue and latest
accepted projection. Slow simulation never enlarges or skips the 16 ms world
tick. Responsive camera motion alone does not establish simulation speed.
Assets retain their notices under `greywrought:assets/external/`.

## Observed boundary

The actual native window passed play, recorded strike explanation, bounded
prediction, checked edit, state inspection, save and reopen. That five-actor
observation recorded 140 ms for checking and 200 ms through scene submission.
Scene submission is not a measured GPU-present timestamp. The 100-actor and
three-visible-edit targets remain open.

The focused inspection test checks prediction nonmutation, explanation
premises/changed vitality, stale-generation rejection, actor identity and exact
source/projection after reopening. The new forest's five native scenarios are
a separate rules proof; its scene, controls and multiplayer disconnect behavior
remain unfinished.
