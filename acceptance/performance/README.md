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

Retaining checked source declarations and unchanged metadata terms reduced
three matched native edits, including complete synchronous reclamation, from
279.5 / 222.9 / 220.2 ms to 251.4 / 192.7 / 189.0 ms. The first edit still
exceeds the target before presentation. This compiler change is pinned by the
game; it does not establish the visible-edit target.

The resulting desktop, launched normally with a private 100-actor fixture on
Radeon 890M/Vulkan, recorded 949 frame intervals in 15.854 seconds and an
18.019 ms p95 interval. The world advanced 503 fixed ticks, or 8.048 simulated
seconds: 0.508 of wall speed. Actors can reach their destinations during this
interval, and the camera does not frame all 100 throughout. This is evidence
of insufficient simulation throughput, not a completed sustained-motion gate.

The next optimization must address measured native simulation work while
preserving every fixed tick and accepted world change. Final edit measurement
must include input queueing, checking, reclamation and presentation. Do not
change the timestep, delay reclamation or weaken checks for speed.

Keep the authored 100-actor extension at
`greywrought:acceptance/performance/company-100.clause` and native serialized
boundary probe at `greywrought:src/bin/runtime_comparison.rs` available to that
work. Reassemble the extension with the exact current encounter source before
measurement; it is not a standalone world.
