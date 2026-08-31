# Greywrought Clause application

`src/world/*.clause` is the sole authority for Greywrought world meaning.
Keep Beagle and Rust at passive host or exact Clause ABI boundaries; do not put
world rules, reconciliation policy, or gameplay dispatch in either host.

Generated CPP1, CWR1, Wasm, JavaScript, and native artifacts belong only in
ignored `build/`. Clause and Beagle are consumed through their immutable pins;
never import either live `main/` checkout.

The disconnect boundary in `acceptance/disconnect/` is complete. The current
delivery boundary is one bounded combat journey: one player, one enemy, one
attack, explicit randomness, damage, death, and loot integrated through the
existing branch, Candidate Delta, Admission, and explanation path. Do not
broaden it into ongoing processes, external effects, networking, presentation,
deployment, distribution, or additional game-domain breadth.
