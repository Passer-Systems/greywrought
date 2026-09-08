# Explain a blocked damage action

The developer command in `greywrought:src/bin/explain_action.rs` runs the actual
`apply-damage` handler from `greywrought:src/world/ember-reconnection.clause`.
It first supplies the successful random roll with no attack signal. Damage
does not happen. The command prints the evaluated conditions, their observed
facts, the checked source artifact, and the exact authored handler span.

From an owned checkout, replacing `YOUR-LANE` with its name:

```sh
nix develop ~/code/greywrought/worktrees/YOUR-LANE/vendor/clause --command \
  cargo run --manifest-path ~/code/greywrought/worktrees/YOUR-LANE/Cargo.toml \
  --locked --bin explain_action -j 2 \
  --target-dir ~/code/greywrought/worktrees/YOUR-LANE/build/explanations
```

Initialize that checkout's pinned `vendor/clause` submodule first if needed.
No browser or running game server is required.

The finite intervention query asks whether changing the attack signal can make
the recorded action reduce vitality. A one-evaluation budget exhausts before
finding the repair. Two evaluations find it. The query itself changes neither
the admitted world nor the retained attempt. The command then changes the
signal through the game's `input` handler, repeats `apply-damage`, admits the
result, and checks that the entire resulting configuration matches the query's
prediction. Cinder-wraith's vitality goes from 4 to 0.

The final `PASS` means that this journey's failed action, source evidence,
finite prediction, and admitted success agreed. An assertion or API error
exits unsuccessfully. The deliberately invalid desired comparison is caught
and reported as evaluator failure, separately from a false game condition.

This is a bounded developer journey, not a general planner. It reports the
actual evaluated prefix; skipped conditions are not evidence. No recorded
attempt means absent evidence. A complete search without a solution excludes
only its explicit finite alternatives; exhaustion proves no impossibility.
Source origins identify the handler as a whole, not individual premise spans.
The artifact is the exact compiled source used to open this isolated session;
the command does not inspect a running browser's world.
The pinned workbench reports query evaluator errors as `ProcessRejected`, so
this command preserves that error without claiming a more specific diagnosis.
