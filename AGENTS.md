# Greywrought Clause application

`src/world/*.clause` is the sole authority for Greywrought world meaning.
TypeScript is explicitly admitted only for the passive Three.js, DOM, Bun, and
foreign-system shell. Rust remains limited to exact Clause ABI and native host
boundaries. Do not put world rules, reconciliation policy, gameplay dispatch,
AI decisions, authority rules, or CandidateDelta merging in either host.

Beagle is forbidden from Greywrought build, test, play, hot-edit, and runtime
paths. Greywrought must not contain `.bjs` source, invoke a Beagle compiler, or
load Beagle runtime modules or generated Beagle dependencies.

Generated CPP1, CWR1, Wasm, JavaScript, and native artifacts belong only in
ignored `build/`. Clause is consumed through an immutable pin; never import its
live `main/` checkout.

The disconnect, bounded combat, and ongoing-effect journeys are complete. The
current delivery boundary is exactly one process-resident source compiler and
one already-open browser installing each fresh checked generation. A save to
`src/world/ember-reconnection.clause` must not rebuild Cargo or restart
the server or page. Preserve the exact random input, the hidden CandidateDelta,
the separate Admission, stale-generation fencing, and source-owned world rules.
Do not broaden this tranche into a watcher framework, editor infrastructure,
general networking, deployment, distribution, or unrelated systems vocabulary.
