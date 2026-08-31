# Greywrought Clause application

`src/world/*.clause` is the sole authority for Greywrought world meaning.
Keep Beagle and Rust at passive host or exact Clause ABI boundaries; do not put
world rules, reconciliation policy, or gameplay dispatch in either host.

Generated CPP1, CWR1, Wasm, JavaScript, and native artifacts belong only in
ignored `build/`. Clause and Beagle are consumed through their immutable pins;
never import either live `main/` checkout.

The first delivery boundary is the bounded disconnect journey in
`acceptance/disconnect/`. Do not broaden it into combat, networking,
presentation, deployment, or distribution work.

