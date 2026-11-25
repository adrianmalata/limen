<!-- PL: Recenzja ticketu R-103 (land jako zapisane kroki `merged`, `closed`, `cleaned`; wspólne zamykanie kart Herdr
w `cleaned`, `ticket done`, `abandon` i w dziennym sweepie; `diff` i `open` jako polecenia zmiany; rodzaj w `--help`),
w dzień 25.11, `limen-rebuild-32`. Runda 1: odpowiedź przyjęta przez `review-verdict.mjs` za pierwszym razem, PASS z
dziewięcioma uwagami; poprawki F1–F6 w `ticket.md` → `## Decisions` (kod i testy, więc runda 2), dwie uwagi
odrzucone z powodem, jedną tekstową poprawiła sesja główna. Runda 2: PASS z dwiema uwagami; poprawka G1 (ostatnia runda
poprawek: commit zamykający musi być potomkiem commita scalenia), druga uwaga rozstrzygnięta. Runda 3: PASS z czterema uwagami; dwie tekstowe poprawiła sesja główna,
trzy części w kodzie trafiły do punktów otwartych `outcome.md` (rundy poprawek wyczerpane). Stan: zamknięte. -->

# R-103 review

## Round 1 (2026-11-25, by day, `limen-rebuild-32`)

- Before: the implementer's run → `review-guard.mjs compare --git` → "within its limits", exit 0; the main session's
  `gate.mjs` → exit 0, 1233 tests, 1233 pass, 0 fail (310.1 s); `fails-before.mjs` → exit 0 at `HEAD` `4f8dea1` (16
  files in one run). AC-6 was corrected before the review (`ticket.md` → Decision 24).
- Reply: `rebuild-reviewer` with the ticket, `node_modules/.rebuild-review/R-103.diff` and `taste.md`;
  `review-guard.mjs compare` → "unchanged", exit 0; `review-verdict.mjs` → "consistent", exit 0.
- Verdict: **PASS**. AC-1–AC-9, AC-12 and AC-15 met (run in the review), AC-10 and AC-11 on the records, AC-13 and
  AC-14 judged met; no blocking finding, nine notes.

| # | Finding (short) | Decision |
|---|---|---|
| 1 | note · proven: a land run again after `merged` whose close refuses `TICKETS_UNCOMMITTED` ends `STATE_CHANGED` with `next` `limen land <id>`, but its message says "commit them, then run limen ticket done F001"; followed, that closes the ticket with `Close F001: landed` and the next land records `closed` with no closing commit (`src/job/landing.ts:285` passes `again` only to the request; `src/project/lanes.ts:336` calls `planTicketClose` with no `retry`) | fix (F1) |
| 2 | note · proven: a hook's rejection of land's closing commit carries the close's words "so nothing of the close was written" into land's message (`src/project/lanes.ts:478`, `src/job/landing.ts:371`), while Change (b) says no message of land says it | rejected: the words are true there (the hook rejected the commit, so none exists, T-01); Change (b)'s sentence comes from R-037's round-1 note 6, the false claim of land after its commit exists, which AC-8 scans for where it lived, and which is gone |
| 3 | note · proven: a recorded tab that Herdr no longer lists gets the mark only, with no line in the job's log, while Change (d) names `already closed` among the closer's words (`src/integrations/herdr.ts:210-211`) | fix (F2) |
| 4 | note · observed: `finishCheckout`'s comment says the read-tree runs when "the index still holds its paths as its parent had them", while the code runs it when any path of the close is staged otherwise than the closing commit (`src/job/landing.ts:337-338` against `:348`) | fix (F3) |
| 5 | note · proven: no test checks that land's `CHECKOUT_BEHIND` has `next` the land's own command line (Change (b)) | fix (F4) |
| 6 | note · guessed: the bound test of `test/integrations/herdr.test.ts` expects `calls().length` 1 under a 300 ms bound, while the fake writes its call line only once Node has started, so a slow host can count 0 | fix (F5) |
| 7 | note · observed: for `test/integrations/herdr.test.ts` and `test/cli/ticket.test.ts`, fails-before shows a load failure at `HEAD` (the new exports), not each new test failing for its own reason | rejected: the protocol's proof is `fails-before.mjs` over the set of new and changed test files (D-015, protocol step 4), which exits 0; a file that imports a new export fails to load at `HEAD` by nature, and `outcome.md` → `## Fails before` names it so |
| 8 | note · proven: `## Out of scope`'s first line still leaves the daily sweep's leftover tabs to R-101, while Decision 23 brought the mark and the bound into this ticket | the main session's text fix: the line now excepts Decision 23 |
| 9 | note · observed · T-30: the comment on the day-only marker time is a loose `//` block between `NONE` and `LAND_COMMAND`, away from `leadTimeOf` and `landsWithin`, which it explains (`src/job/statistics.ts:46-49`) | fix (F6) |

Taste answers: T-14 yes (two literal bullets of `templates/agents.md`); T-18 the new help line is T-19 (2)'s kind,
its wording Decision 15 (A); T-29 mostly yes, findings 6 and 7; T-30 mostly yes, findings 4 and 9; T-40 no new owner
step.

## Round 2 (2026-11-25, by day, `limen-rebuild-32`)

- Before: the resumed implementer made F1–F6 (after a new `snapshot --git`, D-035) → `review-guard.mjs compare --git`
  → "within its limits", exit 0; the main session's `gate.mjs` → exit 0, 1236 tests, 1236 pass, 0 fail (319.7 s);
  `fails-before.mjs` → exit 0 at `HEAD` `4f8dea1` (the same 16 files in one run).
- Reply: a fresh `rebuild-reviewer` with the same three paths; `review-guard.mjs compare` → "unchanged", exit 0;
  `review-verdict.mjs` → "consistent", exit 0.
- Verdict: **PASS**. AC-1–AC-9 and AC-15 met (run in the review), AC-10–AC-12 on the records, AC-13 and AC-14 judged
  met; no blocking finding, two notes.

| # | Finding (short) | Decision |
|---|---|---|
| 1 | note · observed: the closing-commit rule takes any commit of HEAD's history with the subject `Close <codes>: landed by <id>`, and after `merged` that history holds the job's own commits, so a worker's commit with that subject is recorded as `closed`, the tickets stay active, and land prints that it recorded the closing commit; likewise an older record whose `landed.sha` is a fast-forwarded job commit with a closing subject (`src/project/lanes.ts:177-182`, `src/job/landing.ts:334`, `:340`) | fix (G1): a silent false success from content a job writes (z. 15, T-01), closed by a rule in code; the older fast-forward case stays an open point |
| 2 | note · observed: the implementer's record of `check.mjs` is 5 s older than the last write of `outcome.md` | settled: the main session runs `check.mjs` itself before the commit (protocol step 7) |

Taste answers: T-14 yes; T-18 the kind line is T-19 (2)'s, its wording Decision 15 (A); T-29 yes for the round-2
tests; T-30 yes (F3, F6); T-40 no new owner step; T-41 no command added.

## Round 3 (2026-11-25, by day, `limen-rebuild-32`)

- Before: the resumed implementer made G1 (after a new `snapshot --git`, D-035) → `review-guard.mjs compare --git` →
  "within its limits", exit 0; the main session's `gate.mjs` → exit 0, 1237 tests, 1237 pass, 0 fail (313.3 s);
  `fails-before.mjs` → exit 0 at `HEAD` `4f8dea1` (the same 16 files in one run).
- Reply: a fresh `rebuild-reviewer` with the same three paths; `review-guard.mjs compare` → "unchanged", exit 0;
  `review-verdict.mjs` → "consistent", exit 0.
- Verdict: **PASS**. AC-1–AC-9 and AC-15 met (run in the review), AC-10–AC-12 on the records, AC-13 and AC-14 judged
  met; no blocking finding, four notes. The rounds of fixes are spent, so a note that needs code goes to `outcome.md`
  → Open points (D-092), and the text of `docs/` and `outcome.md` is the main session's (D-053 (2)).

| # | Finding (short) | Decision |
|---|---|---|
| 1 | note · observed · T-30: after G1, `docs/commands.md:234` ("the commit the migration reads too") and `closeStep`'s comment (`src/job/landing.ts:265-266`, "the migration's rule") do not name the after-the-merge condition | the main session's text fix of `docs/commands.md` (a commit made after the job's merge; the job's own does not count); the comment → `outcome.md` → Open point 4 |
| 2 | note · observed: G1's filter runs for every land's closing commit in HEAD's history, not only this job's (`src/project/lanes.ts:186-187`), one `git merge-base --is-ancestor` each, repeated by `closeFailure` (50 calls: 0.073 s) | `outcome.md` → Open point 5 |
| 3 | note · observed: `isAncestor` fails `GIT_FAILED` when Git no longer holds `merged.sha`, so a rerun on such a record ends exit 4 each time once HEAD's history holds a land closing commit (`src/project/git.ts:485-490`, `src/job/landing.ts:336`) | `outcome.md` → Open point 6, for Adrian at gate 5.3 |
| 4 | note · observed: `outcome.md` → `## Fails before` recorded runs only up to the round-1 fixes | the main session's text fix: its own run after G1 (exit 0, the same 16 files) and its gate (1237/1237) |

Taste answers: T-14 yes; T-18 the kind line is T-19 (2)'s, its wording Decision 15 (A); T-29 yes for G1's test; T-30
mostly yes, finding 1; T-40 no new owner step; T-41 no command added.
