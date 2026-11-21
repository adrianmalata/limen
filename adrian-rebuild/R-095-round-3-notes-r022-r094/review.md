<!-- PL: Recenzje ticketu R-095 (poprawki uwag z rund 3 R-022, R-094 i R-089). Runda 1 (21.11, w dzień): PASS
z czterema uwagami; dwie idą do pierwszej rundy poprawek przez wznowionego implementera (błąd zapisu logu
w `leaveQueue` nie może zastąpić błędu `QUEUE_RECORD_UNREADABLE`; docs/jobs.md o tokenie wspólnym z
.limen/unmigrated/), uwaga o dowodzie mutacji testów (c) jest odrzucona z powodem, a dwa wyjścia poza `## Change` są
przyjęte. Runda 2: PASS z trzema uwagami, wszystkie w drugiej i ostatniej rundzie poprawek (komentarz
`waitForStart`, strzeżony `rm` wpisu kolejki, docs/jobs.md o punkcie (d)). Runda 3: PASS z trzema uwagami; zdanie
docs/jobs.md poprawiła sesja główna, dwie uwagi o pliku testu czekają na pytanie Q-17. Stan: zamknięta. -->

# R-095 review

## Round 1 (2026-11-21, by day)

- Before: `review-guard.mjs compare --git` after the implementer → "the implementer's run is within its limits",
  exit 0; the main session's `gate.mjs` → 596/596, fail 0; `fails-before.mjs` → exit 0 (five files), recorded in
  `outcome.md` → `## Fails before` before the review.
- Reviewer: `rebuild-reviewer` with the ticket, `node_modules/.rebuild-review/R-095.diff` and `taste.md`;
  `review-guard.mjs compare` → "unchanged", exit 0; `review-verdict.mjs` → "consistent", exit 0.
- Verdict: **PASS**. AC-1–AC-11 met.

| # | Finding (short) | Decision |
|---|---|---|
| 1 | note · proven: in `leaveQueue` (`src/runtime/start-queue.ts`) the log append runs in the wait's `finally` with no guard, so when it fails (a job folder without search permission) its raw error replaces `QUEUE_RECORD_UNREADABLE` and the class and code are lost; `releaseAfterFailure` (`src/lock.ts`) keeps the operation's error | fix (T-01): a failed append in that cleanup does not replace the error it follows |
| 2 | note · proven: `docs/jobs.md` still says the report names every token two ids share as taking the full id, while the new line says that a token one job shares with `.limen/unmigrated/` names the job | fix: the docs follow the report (T-19); the line is the one this ticket adds |
| 3 | note · observed: the two (c) tests pass at HEAD by design, and the proof that each fails without its check is the implementer's mutation runs, which the repository cannot rerun; the reviewer's reading of the code agrees with them | rejected: the checks exist at HEAD, so no test of them can fail there; `fails-before.mjs` copies HEAD and cannot mutate it, the mutation runs are recorded in `outcome.md`, and the reviewer confirmed each from the code |
| 4 | note · observed: two additions beyond the wording of `## Change`: the dry run counts the folders it would move as unmigrated, with a second fixture test, and the plant test asserts after `cleanup` that no signal was `denied` | accepted: the first keeps the dry run's lines equal to the run's once the folders are split (item (a)), the second keeps a refused signal from being silent (T-01); both are in `outcome.md` |

Fixes (for the resumed implementer, `ticket.md` → `## Decisions`; the first round of fixes): 1 and 2. Finding 1
changes code and a test, so it gets a round (D-053 (2)).

## Round 2 (2026-11-21, by day)

- Before: the resumed implementer's first round of fixes → `review-guard.mjs compare --git` "within its limits",
  exit 0; the main session's `gate.mjs` → 597/597, fail 0; `fails-before.mjs` → exit 0 (the same five files),
  recorded in `outcome.md` before the review.
- Reviewer: a fresh `rebuild-reviewer` with the ticket, the new `node_modules/.rebuild-review/R-095.diff` and
  `taste.md`; `review-guard.mjs compare` → "unchanged", exit 0; `review-verdict.mjs` → "consistent", exit 0.
- Verdict: **PASS**. AC-1–AC-11 met.

| # | Finding (short) | Decision |
|---|---|---|
| 1 | note · proven: the doc comment of `waitForStart` (`src/runtime/start-queue.ts`) says the job's log keeps the cause of a failed record check, which after Fix 1 is not so when the log cannot take the line (T-30) | fix |
| 2 | note · observed: the `rm` of the queue entry in the `finally` of `waitForStart` has no guard, so an error other than `ENOENT` (for example `EACCES` on the queue's `entries/`) would replace `QUEUE_RECORD_UNREADABLE`; the `rm` was there at HEAD | fix (T-01): the same rule as Fix 1 in the same `finally`, so it belongs to item (d) rather than to a new ticket |
| 3 | note · observed: `docs/jobs.md` → Start queue → "Stop and loss" does not say that a record the queue cannot check ends the job as an environment failure with its cause in the log (item (d)) | fix: the docs follow the behaviour (T-19) |

Fixes (for the resumed implementer, `ticket.md` → `## Decisions`; the second and last round of fixes): 1–3. Findings
1 and 2 change code, so a third review round follows (D-053 (2)).

## Round 3 (2026-11-21, by day)

- Before: the resumed implementer's second round of fixes → `review-guard.mjs compare --git` "within its limits",
  exit 0; the main session's `gate.mjs` → 598/598, fail 0; `fails-before.mjs` → exit 0 (the same five files),
  recorded in `outcome.md` before the review.
- Reviewer: a fresh `rebuild-reviewer` with the ticket, the new `node_modules/.rebuild-review/R-095.diff` and
  `taste.md`; `review-guard.mjs compare` → "unchanged", exit 0; `review-verdict.mjs` → "consistent", exit 0.
- Verdict: **PASS**. AC-1–AC-11 met.

| # | Finding (short) | Decision |
|---|---|---|
| 1 | note · proven: `docs/jobs.md` (Fix R2-3) says the job "ends as an environment failure, `QUEUE_RECORD_UNREADABLE`", while no reader sees the class or the code: the log line holds the message, the wrapper finalizes with the message and exits 1, and `failureFrom` gives the detail the kind `null` | fixed by the main session (D-053 (2)): the sentence says what a reader sees; the gap is `outcome.md` → Open points 4, for R-082 |
| 2 | note · proven: `waitFailure` (`test/runtime/start-queue.test.ts`) maps a wait that resolves to `undefined`, so a wait that ends `"gone"` instead of rejecting fails with "the wait ended with undefined", which does not say how it ended (diagnosis only) | not fixed here: the two rounds of fixes are used; a question to Adrian (Q-17), with 3 |
| 3 | note · proven: T-29 (5), the opening line of `test/runtime/start-queue.test.ts` names the gate file and the gone record, not the third mechanism it now tests, a record check that fails | not fixed here: Q-17, with 2 |

The review is closed: round 3 is PASS, its finding on the docs is fixed, and the two on a test file wait for Adrian's
answer to Q-17; no ticket is blocked.
