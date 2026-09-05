# Milestone 5 bounded comparison

This artifact compares one exact, real Greywrought party Attack with an isolated
conventional TypeScript reference. The reference is acceptance-only code and is
never imported by Greywrought's game, build, play, or runtime path.

After the declared build, run:

```sh
CHROME_PATH=/path/to/chromium bun run compare:rts-attack
```

The driver opens the published encounter at 1280×900/DPR 1 with SwiftShader,
enters battle through normal controls, selects the five-unit company, targets
`cinder-1`, waits for settled cooldowns, and sends the ordinary `Attack` input.
The input is paired with its `configuration-observed` receipt by exact receipt
sequence and revision, then with the next candidate and its complete
candidate/Admission lifecycle by generation, revision, and operation ID.

The fixture and Clause output do not come from projections sampled on either
side of the asynchronous click. They come from the compiler-owned explanation
of that exact recorded Attack Step. Its state table contains every slot read or
written by the recorded rules with same-Step `before` and `after` values. The
artifact retains that table, the Step and physical-plan identities, evaluated
effects, source origins, and the exact observed physical input. The normalized
reference fixture covers encounter and target guards; target identity,
position, vitality and hostility; and every contributing unit's occurrence
identity, selection, position, vitality/alive, damage, range, cooldown, and
action period. Referent equality remains compiler-owned: the conventional
fixture receives the checked relational guards only after the recorded trace
selected those five `party-attack` occurrences, while their exact referent
values remain in the retained state table.

The conventional reference consumes that normalized same-Step pre-state. It
independently checks the ordinary scalar/Boolean party-attack guards, replaces
contributor cooldowns with their recorded periods, and uses the runtime's
declared finite binary64 accumulation order: numeric contribution deltas are
sorted ascending before being folded into prior vitality. Occurrence IDs are
sorted only for canonical output presentation; they never control arithmetic
order. The bounded gate requires exact target-vitality, cooldown, contributor,
and accumulated-damage parity. It also rejects any same-Step state change not
accounted for by the recorded target contribution or contributor cooldown
effects. The machine-readable fixture, complete explanation, outputs,
lifecycle receipts, source hash and service accounting are written to ignored
`build/comparison/party-attack.json`.

The Clause side includes checked source/package handling, typed input custody,
relational specialization, a hidden candidate, atomic numeric accumulation and
conflict checks, separate Admission, authority budgeting, projection, and the
same-Step execution trace used for capture. The reference begins with trusted,
normalized JSON and performs only synchronous predicates, accumulation, and
object construction. Raw wall times are therefore retained only with their
different service boundaries; they are not a fair performance comparison and
support no language-superiority claim.

This bounded artifact is one positive five-contributor case. Its referent guard
truth and contributor domain are conditioned on the selected Clause trace; it
is not an independent implementation of all Attack semantics. Blocked and
mixed-eligibility equal-boundary cases remain required before drawing a broader
comparison.

Observed on this host with Chromium 152/SwiftShader: recorded Step
`35af431e…d35b2b8` and physical plan `9aa2fc63…c26ae9` paired one ordinary
Attack with operation 282. The same-Step target changed `100 → 9`; five
contributors supplied deltas `-22, -18, -24, -7, -20`, and each cooldown
changed `0 → 0.8`. The isolated reference produced the exact same output.
Ignored raw artifact SHA-256 was
`4ce1fb4a9f91b7679a520029dc2c8a9daf281805ad82a56770e0b4c237e962f0`.
The driver-observed journey through explanation capture took 789.77 ms and the
reference call was observed at 48.26 ms under the shared SwiftShader run; their
unequal services make those values non-comparative. Exact commands were the
declared `bun run build:play` followed by `CHROME_PATH=<Chromium 152> bun run
compare:rts-attack`.

The broader conventional comparison, blocked/mixed eligibility, new-mechanic
effort, generalization, and non-game proof remain open.
