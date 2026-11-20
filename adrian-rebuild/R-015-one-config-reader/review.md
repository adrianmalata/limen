<!-- PL: Recenzje ticketu R-015 (jeden moduł konfiguracji, ustawienia tylko z plików właściciela). Runda 1: PASS
z ośmioma uwagami bez blokujących; pierwsza odpowiedź odrzucona przez review-verdict.mjs za format jednej linii
i wysłana ponownie; pięć uwag poprawił implementer, jedną sesja główna w plan.md, dwie odrzucone z powodem.
Runda 2: PASS z czterema uwagami, poprawionymi w drugiej (ostatniej) rundzie poprawek. Runda 3: PASS z trzema uwagami
do tekstu outcome.md i review.md, które poprawiła sesja główna. Stan: zamknięta, ticket w commicie R-015. -->

# R-015 review

## Round 1 (2026-11-20, day session `limen-rebuild-9`)

- Before: `review-guard.mjs compare --git` after the implementer → "within its limits", exit 0; the main session's
  `node adrian-rebuild/tools/gate.mjs` → exit 0, 276/276; `node adrian-rebuild/tools/fails-before.mjs` → exit 0
  ("test/cli/continue.test.ts, test/cli/status.test.ts, test/s3-finish-wake.test.ts, test/structure.test.ts,
  test/cli/spawn.test.ts, test/config.test.ts, test/project/limits.test.ts, test/runtime/start-queue.test.ts fail at
  HEAD (exit 1)").
- Reviewer: `rebuild-reviewer` with the ticket, `node_modules/.rebuild-review/R-015.diff` (3,176 lines) and
  `taste.md`. Its first reply was rejected by `review-verdict.mjs` (exit 1: "criterion line 8 is not `<AC-N>: met |
  not met | unknown: <evidence>`", the line read "AC-8: met (judgment). …"); the same reviewer sent it again with
  that line corrected and nothing else changed, and `review-verdict.mjs` → "consistent", exit 0.
  `review-guard.mjs compare` → "unchanged", exit 0, after each reply.
- Verdict: **PASS**. AC-1–AC-8 met. Eight findings, all notes.

| # | Finding (short) | Decision |
|---|---|---|
| 1 | The new s3 test's prepare half checks nothing; the test checks two mechanisms (`test/s3-finish-wake.test.ts:138-150`) | fix |
| 2 | `test/cli/spawn.test.ts` fails at HEAD only on the new log text, not on the leak (`test/cli/spawn.test.ts:9-12`) | fix |
| 3 | `## Fails before` does not name the tests that pass at HEAD or say why (`outcome.md:140`, `:150`) | fix |
| 4 | Two `withEnvironment` test helpers with different restore rules (`test/config.test.ts:217-229`, `test/project/limits.test.ts:21-28`) | fix |
| 5 | `docs/jobs.md:161` still points the owner at `$LIMEN_HOME/.limen/start-gate.json` | fix |
| 6 | `plan.md` still keeps "the two route variables"; `LIMEN_REVIEWER_MODEL` would be listed as not a Limen name (`plan.md:835`, `:1270`) | fixed by the main session |
| 7 | The rule timer starts from `{ ...process.env, … }` and inherits a job's transport names (`src/commands/rule.ts:136`) | rejected |
| 8 | The tool cap is read from `limits.json` at each tool start, a file the agents' account can write (`src/runtime/wrapper.ts:42`, `:194`) | rejected |

Fixes (for the resumed implementer, `ticket.md` → `## Decisions`): 1–5. Finding 6: the main session rewrote the row
of stage 2 in `### Cost and effect per stage` and step 2.4 of `## Deployment` from D-052 (one route variable,
`LIMEN_WORKER_MODEL`, plus the other exceptions `limen status` names with their tickets); `LIMEN_REVIEWER_MODEL`, which
no code ever read, is rightly listed as a name Limen does not read.

Rejected, with reasons:
- 7: the behaviour is that of `9f247a5` (the timer's environment is not one of the four places of Change 2), the scan
  passes, and R-034 removes `limen rule` with its timer (its `movedBy` entry). The outcome's open point 1 cites the
  line as `:135`; the implementer corrects it to `:136`.
- 8: a job that edits the project root's `limits.json` is the tampering of Limen's own files on the agents' account
  that gate 2 §2 G2 accepts as a risk ("Accepted-risk (same account): deliberate tampering by a job with Limen's own
  files …"); the stall time has been read the same way since `rebuild-base`, and one rule for every field of the file
  ("an edit applies to running jobs too", `docs/jobs.md`) is simpler than a cap read once. R-054 (the published copy
  and the owner files) moves the reading to the published copy, which closes it. The cap bounds a runaway job; it is
  not a security boundary.

## Round 2 (2026-11-20, day session `limen-rebuild-9`)

- Before: `review-guard.mjs compare --git` after the implementer's fix round → "within its limits", exit 0; the main
  session's `node adrian-rebuild/tools/gate.mjs` → exit 0, 276/276; `node adrian-rebuild/tools/fails-before.mjs` → exit
  0 (the same eight files "fail at HEAD (exit 1)").
- Reviewer: a fresh `rebuild-reviewer` with the ticket, the new diff and `taste.md`; `review-verdict.mjs` →
  "consistent", exit 0; `review-guard.mjs compare` → "unchanged", exit 0.
- Verdict: **PASS**. AC-1–AC-8 met; the five fixes of round 1 hold. Four findings, all notes.

| # | Finding (short) | Decision |
|---|---|---|
| 1 | `docs/jobs.md:154` and `docs/commands.md:253` still send the reader to the seat folder through `$LIMEN_HOME/.limen/…` | fix |
| 2 | `setTestKnob` (deviation 1) has no test; its only caller, the group fixture script, is run by no test (`src/config.ts:187`) | fix |
| 3 | `## Fails before` opens with the first draft's runs under that draft's test names, not marked as superseded (`outcome.md:171-233`) | fix |
| 4 | `## Deviations from the ticket` is numbered 1–5, 7, 6 (`outcome.md:281-282`) | fix |

Fixes (the second and last round of fixes, `## Agents` step 6): 1–4, for the resumed implementer (`ticket.md` →
`## Decisions`). Review round 3 checks only these fixes and the absence of regressions.

## Round 3 (2026-11-20, day session `limen-rebuild-9`)

- Before: `review-guard.mjs compare --git` after the implementer's second fix round → "within its limits", exit 0; the
  main session's `node adrian-rebuild/tools/gate.mjs` → exit 0, 277/277; `node adrian-rebuild/tools/fails-before.mjs`
  → exit 0 (the same eight files).
- Reviewer: a fresh `rebuild-reviewer`, asked to check round 2's fixes and the absence of regressions;
  `review-verdict.mjs` → "consistent", exit 0; `review-guard.mjs compare` → "unchanged", exit 0.
- Verdict: **PASS**. AC-1–AC-8 met; the four fixes of round 2 hold. Three findings, all notes, all on the text of the
  main session's files:

| # | Finding (short) | Decision |
|---|---|---|
| 1 | `outcome.md` says the other kinds' names "do not compile" in the `setTestKnob` test; the `@ts-expect-error` on a `string[]` shows only that a plain `string` does not | fixed by the main session in `outcome.md`; the run-time refusal that the decision asks for is shown |
| 2 | The PL summary of `review.md` describes round 1 only | fixed by the main session |
| 3 | Open point 3 of `outcome.md` does not name the ticket for the person-naming comments of `src/runtime/start-queue.ts:16-17` | fixed by the main session: R-084 |

No code or test changed after round 3, so no fourth review ran: `outcome.md` and `review.md` are written by the main
session (`## Agents`, steps 6 and 7).
