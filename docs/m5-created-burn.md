# M5 created-burn consumer checkpoint

This is a consumer checkpoint for Clause `a619c44c2a601648530b83e6cd2b8d5a5bf0be7d`,
not completion of Milestone 5 or of the Greywrought–Clause program.

## Usable behavior observed

The visible **Ignite** order uses the ordinary keyboard-input path. Eligible
selected Artificer and Ranger occurrences each create a distinct `BurnEffect`
for the exact selected hostile target. The effects carry source-declared 3.0
and 1.5 second lifetimes and equal 7/s damage. Their contributions apply
independently, one occurrence can be cancelled by its exact referent without
removing the other, and the lifetimes expire independently. The host transports
the input and passively displays the compiler-projected relation rows; it does
not allocate identities, tick timers, join targets, calculate damage, or remove
effects.

The native eight-test RTS gate passed at the movement checkpoint. At the first admitted tick after Ignite,
the created lifetimes are 2.984 and 1.484 seconds and target vitality is
99.776; the following tick reaches 99.552, demonstrating two equal finite-F64
contributions. Exact cancellation leaves only the longer occurrence, and 190
further admitted 16 ms ticks remove it.

The real Chromium 152 SwiftShader journey at 1280×900/DPR1 uses ordinary
Attack and Ignite controls. It removes the Moonwell's attacker before observing
the full timed lifecycle, then creates both effects on the remaining Cinder.
The short and long effects expired after 2372 and 6345 ms wall time in the local
run; target vitality changed from 100 to 68.50000000000149. These wall times
include the browser, Wasm candidate/Admission path and local host, and
are not isolated evaluator timings.

## Authoring effort and retained seam

The mechanic adds one new shape, five relations, four per-unit parameter facts,
two physical bindings and five occurrence-general handlers (creation,
cancellation, contribution, expiry and dead-target cleanup). The one Ignite
handler applies to every eligible occurrence; it is not a handler per actor or
class. Adding the mechanic required no TypeScript gameplay fact.

Ignite nevertheless repeats Attack's active/selected/alive/range/cooldown and
exact-target eligibility premises. Clause does not yet provide the required
reusable source definition/strategy abstraction for sharing those premises.
The repetition is retained and counted here rather than hidden behind host
dispatch or described as reuse.

## Exact checks and current compiler boundary

- Exact pinned source and fresh Wasm hash verification passed.
- The native movement/combat checkpoint passed 8/8 plus the final tiny-distance
  arrival regression; Clause's row-intervention checks passed 3/3 and existing
  native live-semantics checks passed 4/4.
- The declared fresh build passed with Rust 1.96.1, wasm32 and wasm-bindgen
  0.2.108. It verified Wasm SHA-256
  `65e924006826fdf1c70012fdc33fa72cac9e5f73756ad51fb3c3046c3decfe2d`,
  generated the pinned TS7 JavaScript and declarations, staged ten exact
  artifacts, typechecked the host and built its bundles.
- `bun run test:rts-created-burn` passed at 1280×900/DPR1 with the observations
  above.

The existing M4 browser journey passes on this same pin and source: a checked
same-open-page edit preserves the world, the doubled attack renders 9 → -173,
and the finite hypothetical query finds five independent deselections with
predicted target vitality 9. One-evaluation exhaustion remains distinct from
full enumeration, and the query does not change the live world. The server and
resident process stayed unchanged during the edit. Visible edit latency was
2308.80ms, including 1401.60ms runtime transfer, in this one local run.

The compiler owns exact relation-slot plus typed-subject coordinates, including
created occurrences. The host passively decodes recorded row values and sends
those coordinates through the compiler's serializer; it neither invents row
slots nor replays combat. The minimal consumer remains
greywrought:acceptance/language/created-relation-live-intervention.clause.
