<!-- PL: Recenzja ticketu R-101 (prune, retire i pozostawione karty Herdr jako dzienne kroki `limen seat sweep`), noc
24/25.11, przebieg 2 (po przerwanym przebiegu 1). Runda 1: odpowiedź przyjęta przez `review-verdict.mjs` za pierwszym
razem, FAIL na jednym znalezisku blokującym (rekord, który nie wystartował, i `.publishing-<id>` przeniesione do
archiwum blokują ponowne `github work`/`review` po awarii przekazania) i osiem uwag; poprawki F1–F6 w `ticket.md` →
`## Decisions`, trzy uwagi odrzucone z powodem (dwie idą do punktów otwartych na bramkę 5.3). Runda 2: PASS z trzema
uwagami, poprawki G1–G3 (ostatnia runda poprawek). Runda 3: PASS z trzema uwagami; kodowa idzie do notatek R-103 i
punktu otwartego 7, dwie tekstowe poprawiła sesja główna. Stan: zamknięta. -->

# R-101 review

## Round 1 (2026-11-25, the night of D-102, run 2)

- Before: run 1's implementer was cut at the five-hour limit; `review-guard.mjs compare --git` → "within its limits",
  exit 0; a fresh `rebuild-implementer` finished from the working tree (D-102 (4)) → `compare --git` → "within its
  limits", exit 0; the main session's `gate.mjs` → exit 0, 1170 tests, 1170 pass, 0 fail (279.2 s); `fails-before.mjs`
  → exit 0 at `HEAD` `45605c1` (18 files in one run).
- Reply: `rebuild-reviewer` with the ticket, `node_modules/.rebuild-review/R-101.diff` and `taste.md`;
  `review-guard.mjs compare` → "unchanged", exit 0; `review-verdict.mjs` → "consistent", exit 0.
- Verdict: **FAIL**. AC-1–AC-6 met (run in the review), AC-7–AC-9 on the records, AC-10 judged met with finding 2
  named; one blocking finding, eight notes.

| # | Finding (short) | Decision |
|---|---|---|
| 1 | blocking · proven: the daily prune moves a record that never started and a left `.limen/.publishing-<id>` (both holding `task.md` with the claim's marker) into `.limen/archive/<YYYY-MM>/<id>/`; `markedJob` scans the archive in any state (`src/integrations/github-review.ts:104-113`), so `claimHasJob` refuses the rerun of a crashed handoff with `GITHUB_HANDOFF_GATE` for ever, where at `HEAD` prune deleted the record and the rerun recovered (`test/cli/github.test.ts:465-489`, `docs/remote.md:163`) | fix (F1); checked by the main session: the comment of `markedJob` reads the archive for a job retire moved, and retire moves only marked (terminal) jobs, so an archived folder with no record or a `starting` record can only be one of this change's moves |
| 2 | note · proven: a folder in the worktree root that Git does not register but that holds a `.git` is still detached to `.pruned-*` and deleted by `emptyTrash` (an unreadable `.git`, for which `worktreeChanges` returns nothing too; a clean independent clone with commits only there) (`src/project/git.ts:326-327`, `src/runtime/pruning.ts:458`, `:464`, `:636-641`) | rejected for this ticket: D-097 (4) (d), marked (A) for Adrian, enumerates the moves and confines the worktree-root move to a folder "that has no `.git`"; the deletion of the other folders is `HEAD`'s, not this change's, and extending the move departs from the decision's list, so it is Adrian's (`outcome.md` → Open points 3, with the recommendation to move every unregistered folder, `.git` or not) |
| 3 | note · observed: three tests pass at `HEAD` ("the daily steps do not run while the project's stamp is less than 24 hours old", "a second run within 24 hours does no daily step", the ported "A-002: the daily retire keeps the record…"), so (h)'s "each failing before the change" holds per file, not per test | rejected: each is the negative half of a test that fails at `HEAD` (the daily steps run when the stamp is absent or old; the daily retire moves a 25 h old marker): a test that nothing happens cannot fail on code where nothing happens, and it is not run alone as the proof of the mechanism; `fails-before.mjs` checks the set (AC-7) |
| 4 | note · observed · T-29 (3): the first test of `test/s9-housekeeping.test.ts` now asserts the reap and the daily retire beside the prune it names, the mixed kind R-032's note 7 removed from `test/cli/sweep.test.ts` | fix (F2) |
| 5 | note · observed: `pruneLine` prints paths unescaped, and the new `archived <path> to <folder>` line repeats a folder name a job can create in the worktree root; `NO_UNLANDED_WORK` now sends the coordinator to `limen seat sweep`, whose output reaches its model, while `keptLine` escapes with `shownField` (`src/runtime/pruning.ts:61-63` against `:70`) | fix (F3): untrusted text reaching a model (z. 15) on a line this change adds; the older `pruned` line goes with it, one function |
| 6 | note · guessed: taking a job's lock makes the job's folder when it is missing, so a writer that checks the folder, then locks right after a retire, leaves an empty `.limen/jobs/<id>/`; the next prune moves it to `archive/<month of now>/<id>`, where the retired job already is in the same month, and the rename fails every minute until the month changes (`src/lock.ts:197`, `src/job/record.ts:722-725`, `src/runtime/pruning.ts:315`) | rejected for this round: guessed, and its effect is a named daily-prune failure retried every minute (T-02), with retire and the tab close still running; `outcome.md` → Open points 4 records it for gate 5.3 |
| 7 | note · observed: `leftPublications` stats each `.publishing-*` folder with no ENOENT case, so a spawn that renames its folder between the listing and the stat fails that daily prune (`src/runtime/pruning.ts:377`) | fix (F4): a folder gone since the listing is skipped, as the worktree-root move already does |
| 8 | note · observed: retire waits up to 60 s for a job's own lock while it holds the jobs lock, so a spawn in that window can end in `LOCK_TIMEOUT`, and one job lock held elsewhere fails the whole retire step (`src/runtime/retiring.ts:49`, `:124`, `src/lock.ts:136`, `:209`) | fix (F5) |
| 9 | note · guessed · T-01: `runFailure` dedupes by message and code alone, so two projects that fail with the same message keep only the first project's line (`src/runtime/sweeping.ts:203-212`) | fix (F6): this change's own Deviation 2; the key gains the project |

Taste answers of round 1: T-14, T-19, T-40 and T-41 yes or not touched; T-18: the new `seat sweep` summary (Deviation 7) leaves
out the daily close of leftover tabs, which `docs/commands.md` names — a wording of the golden help, so it stays as the
implementer wrote it and is named for Adrian at gate 5.3 (`outcome.md` → Open points 5); T-29: findings 3 and 4; T-30:
"mostly yes" (the header comment of `src/runtime/pruning.ts` restates much of D-097 (4) (d)), no finding.

## Round 2 (2026-11-25, the night of D-102, run 2)

- Before: a fresh `rebuild-implementer` made F1–F6 → `review-guard.mjs compare --git` (after a new `snapshot --git`,
  since the main session had written the reserved `ticket.md`, `review.md` and `plan.md`, D-035) → "within its
  limits", exit 0; the main session's `gate.mjs` → exit 0, 1176 tests, 1176 pass, 0 fail (275.7 s);
  `fails-before.mjs` → exit 0 at `HEAD` `45605c1` (18 files in one run).
- Reply: a fresh `rebuild-reviewer` with the same three paths; `review-guard.mjs compare` → "unchanged", exit 0;
  `review-verdict.mjs` → "consistent", exit 0.
- Verdict: **PASS**. AC-1–AC-6 met (run in the review), AC-7–AC-9 on the records (the reviewer's Biome run was refused
  by the permissions), AC-10 judged met with round 1's finding 2 left to Adrian; no blocking finding, three notes.

| # | Finding (short) | Decision |
|---|---|---|
| 1 | note · observed · z. 15: `closeLeftoverTabs` prints the recorded tab id (read from `.limen/jobs/<id>/herdr/tab`, which the job's account can write) and Herdr's error text without escaping, while F3 sent every prune and retire line through `shownField` (`src/integrations/herdr.ts:221`, `:226-227`) | fix (G1): code, so a round (D-053 (2)); the last round of fixes this ticket has |
| 2 | note · proven: `CONTRIBUTING.md:19` still lists `prune` and `close` among the commands whose registry entry names a later ticket in `movedBy`; both entries and handlers are gone | fix (G3): text; made in the same round as G1 and G2 |
| 3 | note · observed: `limen stats` reads the archive, so every never-started record the daily prune moves there counts as a job of its route and role for good, and every archived folder with no record adds to the `Not read` count, where at `HEAD` prune deleted both (`src/job/statistics.ts:184-185`, `:436`) | fix (G2): F1's rule for the same readers: an archived folder that never ran (`everRan`) is no job, so `stats` skips it as the claim lookup does, and a count after a daily prune equals `HEAD`'s |

Taste answers of round 2: T-14, T-19 yes; T-18: the `seat sweep` summary is already `outcome.md` → Open points 5;
T-29: yes for the tests of F1, F3–F6, and the s9 test now checks the prune alone; T-30: mostly yes, no finding.

## Round 3 (2026-11-25, the night of D-102, run 2)

- Before: a fresh `rebuild-implementer` made G1–G3 (after a new `snapshot --git`, D-035) → `review-guard.mjs compare
  --git` → "within its limits", exit 0; the main session's `gate.mjs` → exit 0, 1178 tests, 1178 pass, 0 fail
  (277.0 s); `fails-before.mjs` → exit 0 at `HEAD` `45605c1` (19 files in one run).
- Reply: a fresh `rebuild-reviewer` with the same three paths; `review-guard.mjs compare` → "unchanged", exit 0;
  `review-verdict.mjs` → "consistent", exit 0.
- Verdict: **PASS**. AC-1–AC-6 met (run in the review), AC-7–AC-9 on the records, AC-10 judged met within D-097 (4)
  (d)'s list (`outcome.md` → Open points 3 stays for Adrian); no blocking finding, three notes. The two rounds of fixes
  are spent, so a note that needs code goes to the ticket that rewrites that part, and text is fixed by the main
  session (D-092, D-053 (2)).

| # | Finding (short) | Decision |
|---|---|---|
| 1 | note · guessed: the close of leftover tabs asks Herdr on every daily run about each recorded tab of every finished job of closed features still in `.limen/jobs/`, through a blocking `spawnSync` with the 10 s bound, so a hanging Herdr costs 10 s per tab and about 30 tabs pass the unit's 300 s; the Risk names only an unreachable Herdr (`src/integrations/herdr.ts:207-229`, `:263`, `:410-411`; `src/platform/systemd-units.ts:42`) | code, rounds spent: R-103's notes in `plan.md` → `## Tickets` (its `cleaned` step rewrites the tab close) and `outcome.md` → Open points 7 |
| 2 | note · observed: `ticket.md` → Rollback says archived folders "are read as before", but after a revert `HEAD`'s `markedJob` takes an archived folder that never ran as the claim's job again (F1's refusal returns) and `HEAD`'s `stats` counts it (G2) | fixed as text by the main session: Rollback names the exception and the owner's manual removal of that claim's archived folder |
| 3 | note · observed: `docs/commands.md:328` says a tab that does not close "prints a line, its log says why", while a failed `tab get` writes nothing to the job's log and its line carries Herdr's error text (`src/integrations/herdr.ts:224-225` against `:228`) | fixed as text by the main session: the sentence names both lines |

Taste answers of round 3: T-14, T-19, T-29, T-40, T-41 yes; T-18: the `seat sweep` summary, already `outcome.md` →
Open points 5; T-30: mostly yes (the long header comments restate parts of D-097 (4)), no finding.
