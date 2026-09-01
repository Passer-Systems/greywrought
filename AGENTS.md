# Greywrought Clause application

`src/world/*.clause` is the sole authority for Greywrought world meaning.
Keep Beagle and Rust at passive host or exact Clause ABI boundaries; do not put
world rules, reconciliation policy, or gameplay dispatch in either host.

Generated CPP1, CWR1, Wasm, JavaScript, and native artifacts belong only in
ignored `build/`. Clause and Beagle are consumed through their immutable pins;
never import either live `main/` checkout.

The disconnect, bounded combat, and ongoing-effect journeys are complete. The
current delivery boundary is exactly one process-resident source compiler and
one already-open browser installing each fresh checked generation. A save to
`src/world/ember-reconnection.clause` must not rebuild Cargo or Beagle or restart
the server or page. Preserve the exact random input, the hidden CandidateDelta,
the separate Admission, stale-generation fencing, and source-owned world rules.
Do not broaden this tranche into a watcher framework, editor infrastructure,
general networking, deployment, distribution, or unrelated systems vocabulary.
