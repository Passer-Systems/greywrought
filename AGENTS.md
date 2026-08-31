# Greywrought Clause application

`src/world/*.clause` is the sole authority for Greywrought world meaning.
Keep Beagle and Rust at passive host or exact Clause ABI boundaries; do not put
world rules, reconciliation policy, or gameplay dispatch in either host.

Generated CPP1, CWR1, Wasm, JavaScript, and native artifacts belong only in
ignored `build/`. Clause and Beagle are consumed through their immutable pins;
never import either live `main/` checkout.

The disconnect and bounded combat journeys are complete. The current delivery
boundary is exactly one Clause-owned ongoing world process and one explicit
external-effect lifecycle integrated beside the existing Candidate Delta and
Admission path. Preserve distinct intent, authorization, attempt, receipt,
Observation, Judgment, and Admission occurrences; the effect lifecycle must not
create authoritative world state. Do not broaden this tranche into interactive
presentation, general networking, deployment, distribution, or unrelated
systems vocabulary.
