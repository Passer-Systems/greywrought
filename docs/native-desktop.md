# Native desktop host

Build from the immutable Clause submodule:

```sh
cd ~/code/greywrought/worktrees/native-desktop-20260906
nix develop ~/code/greywrought/worktrees/native-desktop-20260906/vendor/clause --command cargo build --features desktop --bin greywrought-desktop --target-dir /home/tom/code/greywrought/worktrees/native-desktop-20260906/build/native-target
~/code/greywrought/worktrees/native-desktop-20260906/build/native-target/debug/greywrought-desktop --root /home/tom/code/greywrought/worktrees/native-desktop-20260906
```

The native window renders the accepted Clause company/world, with the existing
Quaternius CC0 models and their Idle/Run clips. WASD/arrows pan the camera; the
wheel zooms. Click selects, Shift-click toggles, Tab selects the company,
right-click orders movement or chooses a target. Enter begins the selected
encounter. Space attacks; H heals, J wards, I ignites, and X stops movement.
The numbered scenario choices use their exact projected source references.

F5 saves. Closing waits for the current admitted tick and saves before the
session thread exits. The default save is
`~/.local/share/greywrought/world.save`, respecting `XDG_DATA_HOME`; `--save`
selects another absolute path. One file lock owns each saved company. The host
envelope frames exact source bytes, two transport cursors, and Clause's opaque
checkpoint. It contains no game-state representation. Reopen uses the saved
exact source and checkpoint; corruption or incompatible source never silently
starts a replacement company.

F6 opens the developer tuning editor. Page Up/Down selects a compiler-offered
scalar expression. Edit its text and press Enter to apply the compiler's
checked operation inside the same resident world. Arbitrary file reloads with
world preservation are not supported by the pinned compiler's `hot_reload`,
which imports a fresh world; the host never invokes it. Saved games retain the
exact accepted edited source. This path never rebuilds Cargo or restarts the
window. Developer logs separately report completion of the checked edit and
submission of its next accepted projection to the scene; neither measurement
claims a GPU-present timestamp.

The graphics event loop and world thread communicate through a bounded
32-command queue and one latest accepted projection. Slow evaluation never
skips or enlarges a 16ms world tick. Camera and presentation animations remain
responsive, but world positions only change on Admission. There is no host
AI, damage model, eligibility rule, or interpolated authoritative position.

`greywrought:native_probe` exercises real native selection, an encounter
attack, checked scalar editing, stale-generation rejection, exact
checkpoint/reopen, and input after reopening. Invoke it with Cargo's
`--bin native_probe` using the same pinned development environment.

For an automated real-window screenshot, add `--smoke-seconds 20`; the host
captures `greywrought:build/native-window.png`, reports whether an accepted
projection was present, and then closes normally. This is a first native slice, not a complete Steam game
or full replacement of every browser presentation feature.

Dependency provenance: Bevy top-level crate 0.19.0, transitive 0.19.1 packages
locked by `greywrought:Cargo.lock`; MIT OR Apache-2.0. API usage follows the
matching upstream examples at
<https://github.com/bevyengine/bevy/tree/v0.19.0/examples>. These are dependency
API references; no upstream asset or source file is vendored. Existing asset
licenses/notices remain at
`greywrought:assets/external/quaternius/rts-company/SOURCE.md` and
`greywrought:assets/external/quaternius/stylized-nature-field/SOURCE.md`.

## Observed validation and remaining limits

The native journey passed selection, a movement order, encounter damage
(100 to 9), checked scalar editing, stale-handle rejection, carried damage and
source continuity, exact admitted projection after reopening, and continued
input/ticking. The observed edit API time was 1972ms; the complete probe took
2915ms. This is one observation, not a visible-edit latency or speedup claim.
The 250ms / 100-actor performance objective remains open.

A subsequent real-window edit exposed a host keyboard batching defect: a
completed Ctrl+A chord was interpreted using the final modifier state of its
frame, submitting `falseatrue` instead of `true`. The editor now processes
modifier transitions, text and commands in event order. Repeating F6,
Ctrl+A, typing `true`, and Enter edited the first offered expression
(`clear-selection`, source line 1316) successfully in the same open session,
generation 1 to 2. The observed checked API time was 1942ms and submission of
the accepted edited projection to the scene was 3003ms. Those are separate
developer timestamps, not a GPU-present measurement. No compiler or game-rule
change was needed.

The real X11 window rendered the five Quaternius characters, their animations,
the accepted world, selection/target rings, health bars and terrain on Radeon
890M / Vulkan. It saved on normal close and reopened that same save for the
corrected HUD screenshot at `greywrought:build/native-window.png`.

All three game sources and the two actually included source fixtures pass the
exact pinned source checker. Disconnect, law-edit and ongoing-effect tests
pass. RTS tests pass 14/16; the full suite is not green. These unchanged arrival
assertions retain their counterexamples:

- `partial_group_arrives_centered_on_click_without_overlapping`: after 120
  ticks, the warrior is approximately `[0.0579, 0, 2.2167]` despite the correct
  destination `[5, 0, 1]`; the priest is `[5.5903, 0, 3.1042]`. Prior behavior
  has not been established for this failure.
- `five_unit_selection_formation_order_and_tick_progress`: after 222 ticks,
  some actors have not reached their correctly centered destinations. A prior
  parent-owned comparison records matching old/new outputs for this failure.

The parent retains reconciliation of source-owned travel behavior. No movement
rule, test bound, or assertion was weakened. These failures block a full native
migration/gameplay completion claim, while the first native host remains usable.
Enemy and Moonwell figures are basic presentation shapes in this slice; browser
feature parity, arbitrary file-save continuity, and Steam distribution are not
claimed. Unconsumed historical language counterexamples are not migrated by
this change; the 100-actor file is a source fragment assembled by its existing
browser test and has no declaration spelling to migrate.

## Integrated evaluator pin, September 6

The native lane integrates published Greywrought `dde9baa` and the historical
native/Wasm comparison from `c24254f`. The latter's report retains its original
pin and measurements; it is not evidence for the new native artifact.
Clause is pinned to `0d6f35c2f00817484bf5ab0d6e3e588dfe35b3e7`, including
prepared-step reuse, exact-sum caching, and checked structured-field editing.
The exact native desktop and Wasm were rebuilt; the Wasm SHA-256 is
`05bf42481f8e707524c20552feca8fd159c6ffdb105a02d5a65f9073e8e7a7c3`.

The native probe can accept an existing absolute save path. It loads that save,
checks exact admitted projection, source and continuity through a new checkpoint,
then continues input in a separate output save. An optional `--catalog` after
the save path prints the current offered edit labels and expressions. To probe
an edit, supply its replacement followed by the current offered index instead.
Catalog positions can change with compiler capabilities; choose the expression
by its displayed handler and value.

A protected copy of the old `6f548474` scratch save passed reopening and
continued input. The original save and its protected copy retained SHA-256
`06bf59a31182fce85dcb35c678e087f61e37e295be1480a1da6763e99372d995`.
The native journey passed with attack damage 100 to 9, checked edit 1984ms,
stale-handle rejection, exact admitted projection after reopening, and continued
input. Total time, including the old-save check, was 3709ms.

In the real window, the copied old save's `clear-selection` expression was
changed from `true` to `false` using F6, Page Down to the offered entry,
Ctrl+A, text input and Enter. Generation 2 advanced to 3; the checked edit took
2005ms and its accepted projection was submitted to the scene at 2997ms.
These timings do not measure GPU presentation. An earlier probe submitted a
Boolean to the newly offered numeric `observe-order-x` field at index zero;
the compiler correctly rejected it. `clear-selection` is now index six for
this source. No compiler workaround or gameplay change was made.

All three game sources and both included fixtures pass this pin's source
checker. The integrated tests remain 17/19: the same two formation assertions
above fail with unchanged coordinates. The historical comparison binary also
compiles against the new pin, but its benchmark was not rerun. The 250ms target
and full gameplay completion remain open. Installation is a separate action;
these checks do not replace the installed runtime or touch its saved world.
