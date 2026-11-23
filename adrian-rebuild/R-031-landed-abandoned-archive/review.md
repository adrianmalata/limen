<!-- PL: Recenzje ticketu R-031 (znaczniki `landed` i `abandoned`, retire do archiwum jobów). Runda 1 (noc 22/23.11,
przebieg 2 `night.mjs`): FAIL z trzema znaleziskami blokującymi i jedenastoma uwagami. Do pierwszej rundy poprawek
idą F1–F11, m.in. ponowny land przy istniejącym znaczniku, gałęzie abandon repozytoriów workspace'u w `limen status`
i zapis znacznika abandon tylko przy gałęzi trzymającej pracę joba; AC-12 zawężone do zakresu ticketu (D-025) jako
domyślna decyzja nocna. Runda 2: PASS z sześcioma uwagami (pierwsza odpowiedź odrzucona za formę); do drugiej i
ostatniej rundy poprawek idą G1–G6, m.in. odpowiedź GitHuba dla zarchiwizowanego joba, sprawdzenie gałęzi abandon w
migracji, odmowa `ticket done` przed commitem i trwałość folderu miesiąca. Runda 3: PASS z czterema uwagami (pierwsza
odpowiedź odrzucona za formę); dwie uwagi o dokumentacji poprawiła sesja główna, a dwie wymagające kodu (wyścig
pollera z retire, podwójna nazwa `abandonedOf`) trafiły do pytania Q-42. Stan: recenzja zamknięta. -->

# R-031 review

## Round 1 (2026-11-23, night, run 2 of `night.mjs`, started 01:22)

- Before: the cut implementer's partial tree (run 1, cut by the 5-hour limit at 00:52) → `review-guard.mjs compare
  --git` on the snapshot of 00:36 "within its limits", exit 0; a fresh implementer finished it (`DONE`) →
  `compare --git` "within its limits", exit 0; the main session's `gate.mjs` → exit 0, 884 tests, 884 pass, 0 fail
  (tsc and Biome first, in `npm run check`); `fails-before.mjs` → exit 0 (14 files fail at `HEAD` `fe092f9`), recorded
  in `outcome.md` → `## Fails before` before the review.
- Reply: `rebuild-reviewer` with the ticket, `node_modules/.rebuild-review/R-031.diff` and `taste.md`;
  `review-guard.mjs compare` → "unchanged", exit 0; `review-verdict.mjs` → "consistent", exit 0.
- Verdict: **FAIL**. AC-1–AC-11 met (on the records: the reviewer's Bash calls were denied in its session, so it ran
  no command); AC-12 not met on its first clause; three blocking findings, eleven notes.

| # | Finding (short) | Decision |
|---|---|---|
| 1 | blocking · proven: `limen land` run again on a job whose record holds `landed` writes the target's new `HEAD` and exits 5 `MARKER_DIFFERS` once the target moved, on every later run, so a land that kept a dirty worktree or stopped after the marker can never finish; land never reads `record.landed` (`src/job/landing.ts:96-98`, `src/job/record.ts:566-573`) | fix (F1) |
| 2 | blocking · proven: in a workspace, `limen status` lists a workspace repository's `limen/abandon/<id>` branches only while a record in `.limen/jobs/` names that repository, so retire of the last such record hides them, against A-002 and (g) (`src/project/summary.ts:167-178`) | fix (F2) |
| 3 | blocking · proven: AC-12's "no path deletes a job record" does not hold: `removeUnstartedRecords` deletes a record that never started whose spawner is gone, and a folder without a record (`src/runtime/pruning.ts:239-254`) | no change: AC-12's first clause is read within the ticket's scope, the paths of `## Change` (retire, land, `ticket done`, abandon, the migration), none of which deletes a record (D-025; category A (a) of D-054 (2), a night default for Adrian to confirm); that path is outside this ticket's change and outside A-002 (finished jobs' records); an open point for gate 5.3 (`outcome.md` → Open point 1) |
| 4 | note · observed: with the worktree gone, abandon takes any existing `limen/abandon/<id>` as its save and marks the job with its commit, without checking that it holds the job's work, so a branch of that name made by hand elsewhere hides the job's unlanded commits (`src/job/abandoning.ts:147-148`, `:173-178`) | fix (F3): a marker must never hide work (Decision 3, A-001) |
| 5 | note · observed: `ticket done` writes its markers after its commit, outside its operation; a failure there leaves the jobs unmarked, a rerun refuses `NO_ACTIVE_TICKET`, and the migration reads only land's subjects (`src/project/ticket-folders.ts:109-116`) | no change: the failure exits with its error (not silent), and an unmarked job stays in `.limen/jobs/`, unretired, with nothing lost (the ticket's Risk); an open point for gate 5.3 |
| 6 | note · proven: a migration that wrote markers but changed no folder ends with "nothing to do: every job folder holds a record" (`src/job/migration.ts:649-656`) | fix (F4): the 3.6 report must not say two opposite things |
| 7 | note · proven: `prune --retire --dry-run` names jobs the real run leaves in place (a landed branch kept with a kept worktree) (`src/runtime/retiring.ts:42-48`) | fix (F5) |
| 8 | note · guessed: retire renames a folder without the job's lock, so a concurrent `writeMarker` can race the move (`src/runtime/retiring.ts:106-121`, `src/lock.ts:101-103`) | no change: unproven; a marker write that loses the race fails loud, since the lock's `mkdir` (`src/lock.ts:167`) makes a folder with no record and `writeMarker` refuses it, while the archived record keeps its marker; R-032 makes retire a timer step, where the race is routine, so an open point for gate 5.3 and R-032 |
| 9 | note · proven: for an archived job, `GITHUB_CONFLICT` puts `limen show <id>` in `next`, which refuses `JOB_NOT_FOUND` (`src/integrations/github-review.ts:138-142`) | fix (F6): `next` never names a command that refuses (T-37) |
| 10 | note · observed: abandon run again on a job with its `abandoned` marker, after a person deleted `limen/abandon/<id>`, makes the branch again at the job's tip and then exits 5 `MARKER_DIFFERS` (`src/job/abandoning.ts:153-154`, `:177`) | fix (F7): T-28 (3), a rerun changes nothing |
| 11 | note · proven: "the GitHub doorbell" in the new docs text, which T-18 replaces with "the GitHub module" (`docs/jobs.md:150`) | fix (F8) |
| 12 | note · proven: three comments cite a ticket decision without the ticket's ID (T-30 (2)) (`src/job/landing.ts:96`, `:151`, `src/runtime/retiring.ts:8`) | fix (F9) |
| 13 | note · observed: `namesUnsavedCommit` starts one `git cat-file -e` per commit the nested repository's branches, tags and reflog list (`src/project/git.ts:428-431`) | fix (F10) |
| 14 | note · observed: the review ran no command, because its Bash calls were denied | no change: AC-1–AC-11 rest on the main session's runs recorded in `outcome.md`, which count (`## Agents`, step 4) |

Taste answers: T-14 yes; T-18 yes, with finding 11; T-19 mostly: the `--retire` flag line leaves out that a marked job
with unlanded work stays (`src/registry.ts:580`) → fix (F11); T-29 mostly, three tests fail at `HEAD` for another
reason: (i) the new `test/job/record.test.ts` tests fail because the file does not load → no change: a test of a new
export can fail at `HEAD` only by its absence, and once loaded each checks one mechanism; (ii) "abandon writes no
abandoned marker when it keeps the worktree" fails only on the listing → no change: its two assertions are one
mechanism (a kept worktree leaves the job unresolved), and the listing is the part `HEAD` gets wrong; (iii)
`test/s9-housekeeping.test.ts:232` fails only through the shared plant after `:54` fails → no change: the old `s9-`
file's shared plant, which R-083 splits (T-29 (6)); this ticket changed `:54` and `:115` only. T-30 partly: finding
12, and comments that restate the code step by step (`src/job/abandoning.ts:1-19`, the header of
`src/job/record.ts`) → fix (F9). T-40 no step waits for the owner.

Fixes (for a fresh implementer, `ticket.md` → `## Decisions`; the first round of fixes): F1–F11.

## Round 2 (2026-11-23, night, run 2 of `night.mjs`)

- The first round of fixes: a fresh implementer (`DONE`; F1–F11, with the new refusal `ABANDON_BRANCH_LACKS_WORK`
  and night defaults 13–20 in `outcome.md`); `compare --git` → "within its limits", exit 0.
- Before: the main session's `gate.mjs` → exit 0, 891 tests, 891 pass, 0 fail; `fails-before.mjs` → exit 0 (the same
  14 files), recorded in `outcome.md` → `## Fails before`.
- Reply: `rebuild-reviewer` with the three paths (`node_modules/.rebuild-review/R-031-2.diff`); `review-guard.mjs
  compare` → "unchanged", exit 0; `review-verdict.mjs` → rejected for its form (bullet lines below AC-12), so a fresh
  reviewer replied again with the tree unchanged (as for R-025 and R-027); `compare` → "unchanged", exit 0;
  `review-verdict.mjs` → "consistent", exit 0. The first reply's three notes are among the second's six.
- Verdict: **PASS**. AC-1–AC-12 met (AC-6's eight `github poll` tests fail outside the gate's private `TMPDIR`,
  green in the gate; AC-10 and AC-11 on the records); six notes.

| # | Finding (short) | Decision |
|---|---|---|
| 1 | note · proven: retire can archive a GitHub job before the poller posts its terminal reply; the poller finds it in the archive but reads `result` and `log` from `.limen/jobs/<id>/`, so it posts "No result or check evidence recorded." and names `limen show <id>`, which refuses an archived job; at `HEAD` the same race posted no terminal reply (`src/integrations/github-poller.ts:404-419`, `src/integrations/github-review.ts:104-110`) | fix (G1): a false public reply is new with this ticket's archive lookup |
| 2 | note · observed: the migration's `abandoned` step takes any `limen/abandon/<id>` with the worktree gone, without F3's check, so a hand-made branch resolves the job and lets retire move it while its own branch holds unlanded commits (`src/job/migration.ts:248-259`) | fix (G2): Decision 3 and 10, a marker only where its evidence holds |
| 3 | note · observed: the F1 test passes when the first land writes no marker (`test/cli/land.test.ts:73-76`) | fix (G3) |
| 4 | note · observed: in a project with an unmigrated job folder, `ticket done` commits its close and then exits 4 `NOT_MIGRATED` while listing the jobs to mark, so they stay unmarked and a rerun refuses `NO_ACTIVE_TICKET` (`src/project/ticket-folders.ts:113-116`, `src/job/landing.ts:176`) | fix (G4): the refusal must come before the commit changes anything |
| 5 | note · guessed: retire's new month folder is made with `mkdir`, and its entry in `.limen/archive/` is never synced, so a crash could lose a moved folder (`src/runtime/retiring.ts:125-126`, `src/atomic-write.ts:91-97`) | fix (G5): the move is the one place a record leaves `.limen/jobs/` (priority 1) |
| 6 | note · observed: the headers of `src/runtime/retiring.ts:1-8` and `src/job/migration.ts:6-11` restate steps and A-002 (T-30 (1)) | fix (G6) |

Taste answers: T-14, T-18, T-19 yes; T-29 yes, with finding 3; T-30 mostly, finding 6; T-40 no step waits for the
owner.

Fixes (for a fresh implementer, `ticket.md` → `## Decisions`; the second and last round of fixes): G1–G6.

## Round 3 (2026-11-23, night, run 2 of `night.mjs`)

- The second round of fixes: a fresh implementer (`DONE`; G1–G6, night defaults 21–26 in `outcome.md`, G1 also for
  the start reply); `compare --git` → "within its limits", exit 0.
- Before: the main session's `gate.mjs` → exit 0, 900 tests, 900 pass, 0 fail; `fails-before.mjs` → exit 0 (16
  files), recorded in `outcome.md` → `## Fails before`.
- Reply: `rebuild-reviewer` with the three paths (`node_modules/.rebuild-review/R-031-3.diff`); `review-guard.mjs
  compare` → "unchanged", exit 0; `review-verdict.mjs` → rejected for its form (AC-10 and AC-11 as "met on the
  records:"), so a fresh reviewer replied again with the tree unchanged; `compare` → "unchanged", exit 0;
  `review-verdict.mjs` → "consistent", exit 0. The first reply's three notes are among the second's four (its G1
  test note is answered under T-29 there: two effects of one cause).
- Verdict: **PASS**. AC-1–AC-12 met (AC-6's `github poll` tests as in round 2; AC-9–AC-11 on the records); four notes.

| # | Finding (short) | Decision |
|---|---|---|
| 1 | note · guessed: G1 narrows the race but does not close it: the poller reads the record, then `result` and `log` without a lock, and a retire between the two reads sends the read to `.limen/jobs/<id>/` after the move, so the one terminal reply says "No result or check evidence recorded." with `limen show <id>` (`src/integrations/github-poller.ts:307`, `:393-405`) | no change in this ticket: both rounds of fixes are spent and the fix is code; Q-42 (`.night/questions.md`), with round 1's finding 8 and open point 4, since R-032 makes retire a timer step where the race is routine |
| 2 | note · observed: since G4, a finished worktree that Git cannot read makes `ticket done` exit 4 `GIT_FAILED` before its commit, which `docs/jobs.md:139` and the `ticket done` paragraph of `docs/commands.md` do not say (`src/job/landing.ts:189`, `src/project/ticket-folders.ts:152`) | fixed by the main session in both docs (D-053 (2)); the refusal before the commit is the safe side, as G4 asked |
| 3 | note · proven: `abandonedOf` is two functions with two meanings, the record field's validator and the migration's evidence (T-25, T-18) (`src/job/record.ts:829`, `src/job/migration.ts:258`) | no change in this ticket: a rename in code after the last round of fixes; Q-42 |
| 4 | note · observed: `outcome.md` still says the main session runs `fails-before.mjs` on the round-3 tree, below that run's record | fixed by the main session (D-053 (2)) |

Taste answers: T-14, T-18, T-19 yes; T-29 yes (the G1 terminal-reply test checks two effects of one cause, and both
failed before); T-30 mostly (the migration header's "never from the git graph" means that the graph alone never
chooses a marker, while G2's evidence reads ancestry through `holdsTip`); T-40 no step waits for the owner; T-41 the
diff adds no command.

The review is closed: PASS in rounds 2 and 3, with two rounds of fixes; notes 1 and 3 wait for Adrian's answer to
Q-42, which blocks no ticket.
