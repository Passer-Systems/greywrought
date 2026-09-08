# Greywrought Clause application

`greywrought:src/world/*.clause` is the sole authority for Greywrought world meaning.
Native Bevy is the primary development and shipping path. Rust is admitted for
passive Bevy presentation, input, assets, audio, UI, exact Clause ABI and OS
boundaries. Do not put world rules, reconciliation policy, gameplay dispatch,
AI decisions, authority rules, or CandidateDelta merging in either host.

Beagle is forbidden from Greywrought build, test, play, hot-edit, and runtime
paths. Greywrought must not contain `.bjs` source, invoke a Beagle compiler, or
load Beagle runtime modules or generated Beagle dependencies.

Generated CPP1, CWR1, Wasm, JavaScript, and native artifacts belong only in
ignored `build/`. Clause is consumed through an immutable pin; never import its
live `main/` checkout.

`greywrought:flake.clause` owns the local Nix development shell. Regenerate
`greywrought:flake.nix` with the pinned workbench's `project-nix` command; do
not edit generated Nix. Keep compiler CLI and game Cargo targets separate at
`greywrought:build/authoring-target/` and `greywrought:build/desktop-target/`.
Use the Git flake with `submodules=1`, excluding ignored build output.

The current delivery is a native launch, play, checked edit, inspect, save and
reopen loop, alongside the expedition game specified in
`~/greywrought-design.md`. Gameplay edits must preserve the resident world
without rebuilding Bevy or restarting the window. Preserve exact random input,
the hidden CandidateDelta, separate Admission and stale-generation fencing.

State inspection, recorded explanations and bounded intervention use the native
world thread. The working browser source is preserved at Git tag
`browser-snapshot-20260908`; maintain one Bevy frontend. Existing Bun tooling is
admitted at foreign-system boundaries. Later web delivery uses Bevy export and
must not delay native prototyping.

Measure the actual native loop: 100 moving actors at >=59 FPS, p95 frame time
<=20 ms, simulation within 5% of real time, and three consecutive visible edits
<=250 ms including checking and reclamation. A small smoke test or source-only
timing does not establish these targets.
