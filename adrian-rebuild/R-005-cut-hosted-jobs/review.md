<!-- PL: Recenzje ticketu R-005 przez rebuild-reviewer. Runda 1 (18.11): FAIL, jedno ustalenie blokujące (zdanie
„No detached fallback” w docs/remote.md ma sens tylko obok zadań hosted) i cztery uwagi; implementer poprawia
blokujące i trzy uwagi (zdanie o „spawn mode” w templates/agents.md, pokrycie tekstu odtworzenia notatki dla zadania
detached, SHA w komentarzu u10), jedna uwaga odrzucona z powodem. Runda 2: PASS, jedna uwaga
(nieaktualne liczby testów w outcome.md) poprawiona przez sesję główną. Stan: zamknięty. -->

# Review: R-005 Cut hosted `--tab` jobs; the GitHub module and groups run detached

## Round 1 (2026-11-18, day session)

- Inputs: `adrian-rebuild/R-005-cut-hosted-jobs/ticket.md`, the diff from `review-guard.mjs diff --out
  node_modules/.rebuild-review/R-005.diff` (6,019 lines), `adrian-rebuild/taste.md`.
- Main session before the review: `review-guard.mjs compare --git node_modules/.rebuild-review/R-005.git <ticket.md>`
  → within its limits; `node adrian-rebuild/tools/gate.mjs` → exit 0, 101/101; `fails-before.mjs` → exit 0 (all 11
  new and changed test files fail at `HEAD`).
- Guard: `review-guard.mjs compare node_modules/.rebuild-review/R-005.before` → `unchanged`, exit 0.
- Parser: `review-verdict.mjs node_modules/.rebuild-review/R-005.reply <ticket.md>` → `consistent`, exit 0.
- Verdict: FAIL. AC-1 to AC-10 met, AC-11 not met; one blocking finding, four notes.

| # | Finding | Kind | Decision |
|---|---|---|---|
| 1 | `docs/remote.md:167` keeps "No detached fallback, automatic approval, or merge.", a contrast that exists only next to hosted jobs; the poller's notice and `templates/agents.md:40` already dropped it | blocking · proven | fix (implementer): a sentence without the mode, e.g. "No automatic job, approval, or merge." |
| 2 | `templates/agents.md:84` keeps "The name does not pick the spawn mode."; there is no mode left to pick | note · proven | fix (implementer): drop the sentence; the first line of `templates/.history/agents.md` follows |
| 3 | The removed `LIMEN_HOSTED=1` half of `test/u14-task-note.test.ts` was the only assertion of the "No note exists … reconstruct" text (`src/job/task-note.ts:78`), which a detached job without `note.md` still gets | note · proven | fix (implementer): a detached case with no `note.md` asserts that text |
| 4 | AC-6 passes only with the gate's private TMPDIR; under `/tmp` the poller refuses its state directory below a world-writable folder | note · observed | rejected: the poller's check predates this ticket and holds at every commit (R-004 → outcome, Open point 3); the gate, which counts, runs S10 in its own TMPDIR |
| 5 | T-30 (3): the rewritten header comment of `test/u10-git-status.test.ts:1-2` keeps the commit SHA `43c01cf` outside a regression line | note · proven | fix (implementer): the SHA moves to a `// regression: 43c01cf` line, or goes |

Taste questions (T-14, T-18, T-29, T-30, T-40, T-41): answered without a further finding; T-30's answer is finding 5.

## Round 2 (2026-11-18, day session)

- Inputs: the same three paths; the diff from `review-guard.mjs diff --out node_modules/.rebuild-review/R-005.diff`
  after the round-1 fixes.
- Main session before the review: `review-guard.mjs compare --git node_modules/.rebuild-review/R-005.git <ticket.md>`
  → within its limits; `node adrian-rebuild/tools/gate.mjs` → exit 0, 102/102; `fails-before.mjs` → exit 0.
- Guard: `review-guard.mjs compare node_modules/.rebuild-review/R-005.before` → `unchanged`, exit 0.
- Parser: `review-verdict.mjs node_modules/.rebuild-review/R-005.reply <ticket.md>` → `consistent`, exit 0.
- Verdict: PASS. AC-1 to AC-11 met; one note.

| # | Finding | Kind | Decision |
|---|---|---|---|
| 1 | `outcome.md` keeps three counts from before the round-1 fixes: u14 "1 of 1" (now 2), "15 of 15" for the six files that pass at `HEAD` (now 16), and "the six old tests" of old-names (5 at `HEAD`) | note · proven | fixed by the main session in `outcome.md`; the 16 of 16 from its own run of `fails-before.mjs` on the six files (exit 1, "pass at HEAD", as expected for them); the reviewed code is unchanged, so no further round |

Taste questions (T-14, T-18, T-29, T-30, T-40, T-41): answered without a finding.
