# Native performance

The required workload is 100 moving actors at >=59 FPS, p95 frame time <=20 ms,
simulation within 5% of real time, and three consecutive visible gameplay edits
within 250 ms. Include checking, projection installation and synchronous
reclamation; preserve the running world and actor identities. A responsive
camera, five-actor smoke, API timer or scene-submission timestamp cannot prove
that workload.

The matched native/browser comparison favored native for gameplay iteration:
about 60 versus 38 FPS and 532 versus 968 ms visible edit latency. Both
100-actor simulations ran near 0.4 of wall speed, so retiring the frontend does
not repair the shared simulation cost. Browser presentation bundling was faster.
Historical raw comparisons are preserved in Git history.

The native inspection window later observed a five-actor checked edit at 140 ms
and scene submission at 200 ms. This did not measure GPU presentation or the
100-actor workload. The full targets remain unmet.

The scalar-edit representation worker owns the next upstream optimization.
Inline triples saved only 0.4–7 ms across matched full-cost samples and were
not landed. Avoid rebuilding unchanged graphs and measure the complete edit;
do not change the timestep, delay reclamation or weaken checks for speed.

Keep the authored 100-actor extension at
`greywrought:acceptance/performance/company-100.clause` and native serialized
boundary probe at `greywrought:src/bin/runtime_comparison.rs` available to that
work. Reassemble the extension with the exact current encounter source before
measurement; it is not a standalone world.
