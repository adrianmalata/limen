<!-- PL: Recenzje ticketu R-092 (kształt validate/apply, T-38). Runda 1 (21.11, w dzień): FAIL z trzema znaleziskami
blokującymi (nietypowany błąd argumentu spawn, brak testu odmowy group start po zapisie z migawką, testy odmów bez
wspólnej migawki) i dziewięcioma uwagami; osiem uwag i pytanie T-29 idą do pierwszej rundy poprawek przez
wznowionego implementera, uwaga o blokadzie `land` jest odrzucona (to R-037). Runda 2: FAIL z jednym znaleziskiem
blokującym (nietypowane odmowy trasy wake'a i `.limen/picture`, odczyt trasy w `continue` po zapisie slotu) i pięcioma
uwagami; wszystkie idą do drugiej i ostatniej rundy poprawek. Runda 3: PASS z sześcioma uwagami; dwie poprawiła
sesja główna (docs/picture.md, outcome.md), jedna bez zmiany, cztery z kodem czekają na Q-26. Stan: zamknięta. -->

# R-092 review

## Round 1 (2026-11-21, by day)

- Before: `review-guard.mjs compare --git` after the implementer → "the implementer's run is within its limits",
  exit 0 (twice: after `DONE` and after the fix of the gate failure below); the main session's first `gate.mjs` →
  645/646, the new `BRANCH_LIVE_JOB` test of `test/cli/spawn.test.ts` failed with ENOENT in `test/snapshot.ts`
  (the snapshot read a temp file of a live wrapper's `progress.json`); the implementer, resumed with that output (step
  4), made the test's running job a written record owned by a sleeping process and the continue tests wait for their
  wrappers (`outcome.md` → deviation 10); then the main session's `gate.mjs` → 646/646, fail 0; `fails-before.mjs` →
  exit 0 (17 files), its first line recorded in `outcome.md` → `## Fails before` before the review.
- Reviewer: `rebuild-reviewer` with the ticket, `node_modules/.rebuild-review/R-092.diff` and `taste.md`;
  `review-guard.mjs compare` → "unchanged", exit 0; `review-verdict.mjs` → "consistent", exit 0.
- Verdict: **FAIL**. AC-1–AC-16 and AC-18 met; AC-17 not met (finding 1).

| # | Finding (short) | Decision |
|---|---|---|
| 1 | blocking · proven: spawn's `--branch` with an invalid name (`a..b`) ends `UNTYPED`, exit 1, through `requireGit`'s plain `Error` (`src/project/git.ts`); a `--task-file` that is a folder or unreadable ends `UNTYPED` (only ENOENT is typed) | fix: each typed with its own code and the class T-02 gives it (a malformed name is usage, exit 2), checked in `validate`, each with a test |
| 2 | blocking · proven: fact 3's group start refusal after a write (a refused team N, which wrote `run.json` and `activation-error.json` at HEAD) has no refusal test with the shared snapshot that fails at HEAD; `GROUP_NO_LEAD` refused before any write at HEAD too, `GROUP_PARTIAL_START` is a step failure | fix: such a test (a team whose spawn `validate` refuses, for example through a job folder that is not migrated), failing at HEAD |
| 3 | blocking · proven: refusal tests of converted commands still compare their own traces: `test/group-extensions.test.ts:156-176`, `test/cli/picture.test.ts:42` and `:52`, `test/s8-groups.test.ts:90`; others run beside live jobs (`test/s8-groups.test.ts:152`, `test/group-extensions.test.ts:132`, `:136`, `test/parser.test.ts:146`) | fix: all onto the shared snapshot; those beside live jobs first settle their jobs (`waitJob`) or use a written record no process owns (deviation 10's pattern); a test that cannot is named in `outcome.md` with the reason |
| 4 | note · proven: the type test catches only the six method names it lists; a write method of another name on `StateView` would compile | fix: a test that fixes the exact key set of `StateView` |
| 5 | note · observed: several refusal tests assert the code before the snapshot, so at HEAD they stop at the code and `fails-before` shows only the typing (`test/cli/stop.test.ts:72`, `test/cli/ticket.test.ts:110`, `test/cli/continue.test.ts:141`, `test/cli/github.test.ts:180`) | fix: code and snapshot in one assertion, as `test/cli/spawn.test.ts` does |
| 6 | note · observed: for `github review` and `github work`, `STATE_CHANGED` or `LOCK_TIMEOUT` from spawn's re-check comes after the gate's `mkdir`; `.limen/github/inflight/` stays, against T-38 (2) and the "writes nothing and exits 3" of `docs/commands.md`; `test/cli/github.test.ts:205-217` accepts the folder; the review fetch stores objects (no ref, no `FETCH_HEAD`) | fix: the state check ends the command before its first write (no folder left), the test compares the full snapshot, and the docs say what the fetch leaves (objects, no ref) |
| 7 | note · observed: after the first write, a failure of `claimAnswered`, of `rm(gate)` or of `deleteBranch` replaces the error that caused it (T-01), and `matchedGithubJob` can throw the refusal `GITHUB_CONFLICT` after writes (exit 1, against T-38 (1)) | fix: the first error stays the command's error and a cleanup failure is added to it, not swapped in; no refusal after the first write (the check moves into `validate`, or the failure takes the class T-02 gives it); a test for each |
| 8 | note · proven: an extension path read from `run.json` or the parent's record that no longer exists gives usage `BAD_EXTENSION`, exit 2, though the command line was valid; `ROLE_UNKNOWN` and `REMOVED` refuse such values with exit 1 | fix: a value from a record is refused with its own code; the usage error stays for the command line; `test/group-extensions.test.ts:195-196` asserts the status |
| 9 | note · observed: when a team's spawn fails after its `apply`, the team keeps a claimed member with a failed job; `group status` says to run the same `group start` again, but the rerun skips that team and clears `startFailure` | fix: the rerun continues that team (T-38 (3): a recorded step the rerun continues), so the status line tells the truth, with a rerun test |
| 10 | note · proven: new test comments carry the SHA `07ec41b` outside the `// regression: <sha>` form (T-30 (3)); the same at HEAD in `test/s1-spawn.test.ts:80` | fix: in every test file the diff touches, including `test/s1-spawn.test.ts:80` |
| 11 | note · observed: the shared snapshot does not see a new empty folder outside `.limen/` and `spec/`, which `readdirSync(p.root)` of the old picture test saw | fix: the snapshot also holds the project's folders outside `.git`, with a case in `test/snapshot.test.ts` |
| 12 | note · observed: only `ticket done` takes the ticket-lanes lock; `land`'s `closeTickets` runs plan and apply without it | reject: `land` is R-037's (out of scope), and `land` took no such lock at HEAD; a note for R-037 in `plan.md` → `## Tickets` |
| T-29 | taste question: two tests join two mechanisms: `test/cli/group.test.ts:221` (an old run read as before, and the new `Start:` line) and `:299` (the class of `GROUP_STOP_INCOMPLETE`, and the idempotent rerun) | fix: each split in two |

Fixes (for the resumed implementer, `ticket.md` → `## Decisions`; the first round of fixes): 1–11 and T-29.

## Round 2 (2026-11-21, by day)

- Before: the resumed implementer's first round of fixes → `review-guard.mjs compare --git` "within its limits",
  exit 0; the main session's `gate.mjs` → 663/663, fail 0; `fails-before.mjs` → exit 0 (the same 17 files), recorded
  in `outcome.md` before the review.
- Reviewer: a fresh `rebuild-reviewer` with the ticket, the new `node_modules/.rebuild-review/R-092.diff` and
  `taste.md`; `review-guard.mjs compare` → "unchanged", exit 0; `review-verdict.mjs` → "consistent", exit 0.
- Verdict: **FAIL**. AC-1–AC-16 and AC-18 met; AC-17 not met (finding 1). Round 1's findings 1–11 and its T-29
  splits are fixed.

| # | Finding (short) | Decision |
|---|---|---|
| 1 | blocking · proven: `currentNotificationSession` and `herdrWakePane` (`src/job/watching.ts:21`, `:35`) throw plain `Error`s, reached by spawn's and group start's `validate` (`UNTYPED`, exit 1); continue reads them only in its `apply`, after `claimMember` wrote a group worker's slot, so an unsafe `PI_SESSION_ID` or `HERDR_PANE_ID` ends `STEP_FAILED` with the slot used; picture build's `validate` reaches a plain `Error` when `.limen/picture` is a file (`src/picture/dataset.ts:12`) | fix: typed with their own codes and the class T-02 gives them; continue reads its wake route in `validate`; a test for each, with the shared snapshot |
| 2 | note · proven: a group id read from the parent's record that names no run gives usage `GROUP_NOT_FOUND` or `BAD_GROUP_ID` (exit 2) in continue's `validate` | fix: as round 1's finding 8, a value from a record is refused with its own code; the usage error stays for the command line |
| 3 | note · proven: git failures inside `validate` (`requireGit` through `listWorktrees`, `branchCommit`, `headCommit`) end `UNTYPED`, exit 1, where T-02 gives a git failure exit 4 | fix: `requireGit` throws a typed environment error (exit 4), with a test |
| 4 | note · proven: `STATE_CHANGED` of spawn, continue, stop and the GitHub jobs, and `JOB_PID_PENDING`, carry `next: null` though their messages say to run the command again (T-01) | fix: `next` is the same command with its concrete values (T-37), with a test |
| 5 | note · proven: `GROUP_EXTENSIONS` names two conditions of two classes (`src/job/continuation.ts:440`, `:447`) | fix: two codes, one per condition and class |
| 6 | note · observed: the `GROUP_PARTIAL_START` test (`test/cli/group.test.ts:298`) joins the recorded failed step with the rerun (T-29 (3)) | fix: split in two |

Fixes (for the resumed implementer, `ticket.md` → `## Decisions`; the second and last round of fixes): 1–6. A third
review that does not pass goes to Adrian (protocol step 6).

## Round 3 (2026-11-22, by day)

- Before: the resumed implementer's second round of fixes → `review-guard.mjs compare --git` "within its limits",
  exit 0; the main session's `gate.mjs` → 676/676, fail 0; `fails-before.mjs` → exit 0 (18 files, now with
  `test/project/git.test.ts`), recorded in `outcome.md` before the review.
- Reviewer: a fresh `rebuild-reviewer` with the ticket, the new `node_modules/.rebuild-review/R-092.diff` and
  `taste.md`; `review-guard.mjs compare` → "unchanged", exit 0. `review-verdict.mjs` rejected the first reply by its
  form (AC-15's line read "met (from records, …):", AC-17's evidence was a list of lines); the same reviewer, resumed
  with that output and no change of the tree, gave the same review in the form; `compare` → "unchanged", exit 0;
  `review-verdict.mjs` → "consistent", exit 0.
- Verdict: **PASS**. AC-1–AC-18 met.

| # | Finding (short) | Decision |
|---|---|---|
| 1 | note · observed: a crash (not a thrown failure) between the GitHub handoff gate and the job record leaves `.limen/github/inflight/<claim>` with no job, and a rerun refuses `GITHUB_HANDOFF_GATE`, so that case still needs manual recovery | Q-26: code after the two rounds of fixes |
| 2 | note · observed: `GROUP_STOP_INCOMPLETE` is `transient` (exit 3) also when its cause is permanent (a running member with no pid), so timers retry it forever | Q-26 |
| 3 | note · observed: `docs/picture.md:17` and `templates/picture/CONTRACT.md:91` do not say that a refused `--strict` build writes no file | `docs/picture.md` fixed by the main session (D-053 (2)); the template's line goes with Q-26 |
| 4 | note · observed: a base that moves between group start's `validate` and `run.json` gives `GROUP_PARTIAL_START` with a written run, not `STATE_CHANGED` with nothing written | no change: the team spawns after `run.json` are recorded steps a rerun continues (D-061, T-38 (3)), as the reviewer says |
| 5 | note · proven: `GIT_FAILED` moves git failures of commands outside the nine from exit 1 to 4, and land's merge conflict to `MERGE_FAILED`; `## Migration` names only the nine | fixed by the main session: `outcome.md` → deviation 23 |
| 6 | note · observed: `git()` of `test/snapshot.ts` returns "" on any git failure, so a snapshot where git cannot run would miss a new branch or worktree | Q-26 |
| T-29 | taste question: the `ticket done` success test checks three effects of one close | no change: one mechanism, the close, with its three effects |

Closed with no further round (D-053 (2)): the fixes of this round touch only `docs/` and `outcome.md`. Notes 1, 2, 6 and
the template line of note 3 change code, tests or a template after the two rounds of fixes, so Adrian decides (Q-26).
