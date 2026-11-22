<!-- PL: Recenzje R-030 przez rebuild-reviewer. Runda 1: FAIL z jednym blokującym znaleziskiem (abandon usuwa worktree
z zagnieżdżonym repozytorium git, którego treści gałąź nie zawiera) i siedmioma uwagami; wszystkie poza jedną idą do
poprawy jako F1–F8 w `ticket.md` → `## Decisions`, a krok weryfikacji Herdr dopisała sesja główna w `plan.md`. Runda
2: PASS z dziesięcioma uwagami; dziewięć idzie do drugiej i ostatniej rundy poprawek jako G1–G9, jedna (Deviation 10)
przyjęta z powodem. Runda 3: FAIL z jednym blokującym (abandon gubi commity osadzonego repozytorium zapisanego jako
gitlink w niewylądowanym HEAD joba); obie rundy poprawek zużyte, Adrian dał trzecią rundę H1–H3 (Q-38, D-087).
Runda 4: FAIL z nowym blokującym (worktree zatrzymany przez H1 ginie przy następnym prune, bo gałąź abandon
rozwiązuje joba); Adrian dał czwartą rundę z jedną poprawką I1 (Q-39, D-088). Runda 5: PASS; jedna uwaga tekstowa
poprawiona przez sesję główną, trzy uwagi do kodu przekazane do notatek R-032. Stan: zamknięta. -->

# R-030 review

## Round 1 (2026-11-22, day session)

- Inputs: `adrian-rebuild/R-030-unlanded-work-survives/ticket.md`, `node_modules/.rebuild-review/R-030.diff` (2281
  lines), `adrian-rebuild/taste.md`; the draft `outcome.md`.
- Main session before the review: `compare --git` after the implementer → exit 0; `node adrian-rebuild/tools/gate.mjs`
  → exit 0, 771/771 (171.5 s); `node adrian-rebuild/tools/fails-before.mjs` → exit 0; `npx biome check
  --error-on-warnings .` → exit 0; `node adrian-rebuild/tools/check.mjs` → exit 0.
- Guard: `review-guard.mjs compare node_modules/.rebuild-review/R-030.before` → `unchanged`, exit 0.
- Parser: `review-verdict.mjs node_modules/.rebuild-review/R-030.reply <ticket.md>` → `consistent`, exit 0.
- Verdict: FAIL. AC-1–AC-8 met; AC-9 not met (the blocking finding). Taste questions: T-14 yes; T-18 yes; T-19 yes;
  T-29 each mechanism test fails before for one reason, the first s9 test still checks several prune rules (as before),
  the reviewer-spawn test is a guard that passes at HEAD; T-30 mostly, `test/s5-land.test.ts:41` now false; T-40 no
  step waits for the owner.

| # | Finding | Kind | Decision |
|---|---|---|---|
| 1 | `limen abandon` saves a nested Git repository only as a gitlink, then removes the worktree with the nested repository's commits and untracked files, and exits 0 | blocking · proven | fix F1: keep and name the worktree when a nested repository's state is not in the commit |
| 2 | Prune visits parents first, so a clean parent's removal takes a dirty registered worktree in its ignored folder | note · proven | fix F2: deepest first, keep a worktree that still holds another registered one |
| 3 | The manual's repair spawn on a done candidate's own branch (`templates/agents.md:146`, `:200`, `docs/jobs.md:91`, `:115`) now refuses with `UNLANDED_WORK` | note · proven | fix F3: a worker spawn on an unresolved job's own branch takes over that job's work, so that job does not make it refuse (A-015, A-035, A-073 name repair spawns); the manual stays |
| 4 | Abandon removes whatever worktree the record names, without prune's guards (locked, primary, outside the root) | note · observed | fix F4: abandon removes only what prune could remove; otherwise kept and named |
| 5 | Deviation 3: land's kept line has another form, and `prune --retire` prints none | note · observed | fix F5: one `kept <worktree> (job <id>): <reason>` line everywhere |
| 6 | Deviation 8: an unreadable worktree fails status, spawn and prune with git's stderr only, which may not name it | note · observed | fix F6: fail closed as now, the message names the worktree and the job |
| 7 | `test/s5-land.test.ts:41`'s comment is false since the first test spawns all six jobs | note · observed | fix F7 |
| 8 | T-28 (5): abandon's tab close has a fake-Herdr test but no `## Deployment` step | note · observed | fixed by the main session: `## Deployment` 3.6 checks the tab, the row has API `herdr` and Seat 3.6 |

Also to fix (`outcome.md` → Open points): F8, `docs/herdr-status.md:15` names `--retire`'s skip. Deviations 1, 2, 4, 5,
6, 7 and 9 are accepted as written.

## Round 2 (2026-11-22, day session; after the first round of fixes, F1–F8)

- Inputs: `ticket.md` (F1–F8), `node_modules/.rebuild-review/R-030-2.diff` (2932 lines), `taste.md`; a fresh reviewer
  (T-06).
- Main session before the review: `compare --git` after the implementer's fixes → exit 0; `gate.mjs` → exit 0, 778/778
  (176.4 s); `fails-before.mjs` → exit 0 (the same twelve files); Biome `.` → exit 0; `check.mjs` → exit 0.
- Guard: `compare node_modules/.rebuild-review/R-030-2.before` → `unchanged`, exit 0. Parser: `review-verdict.mjs
  node_modules/.rebuild-review/R-030-2.reply <ticket.md>` → `consistent`, exit 0.
- Verdict: PASS. AC-1–AC-9 met. Taste questions: T-14, T-18, T-19 yes; T-29 yes for each round-1 test; T-30 mostly
  (note 8); T-40 no owner step; T-41 the coordinator runs `limen abandon`.

| # | Finding | Kind | Decision |
|---|---|---|---|
| 1 | `deleteLandedBranch` (land, `--retire`) removes a clean worktree that holds a dirty registered worktree in its ignored folder | note · proven | fix G1: the same registered-below test as prune and abandon |
| 2 | A held worktree inside another held one prints no `kept` line | note · proven | fix G2 |
| 3 | A worktree kept only for a registered worktree below it prints the reason `unlanded work` | note · proven | fix G3: the line names that cause |
| 4 | Deviation 10: a nested repository in an ignored folder goes with the worktree | note · observed | accepted: A-001's Decision saves "not ignored ones"; Decision 4 |
| 5 | F1's second cause (a nested repository with changes at HEAD's commit) has no test | note · observed | fix G4 |
| 6 | F3 matches on the branch alone; a job whose worktree is there without that branch stays with the job | note · observed | fix G5: take over only on reuse or a gone worktree |
| 7 | Nested and inner worktree paths, which a job can name, reach the coordinator's output unescaped (z. 15) | note · observed | fix G6: one escaping of control characters |
| 8 | The comment at `src/job/unlanded.ts:199` and `outcome.md` miscount the Git processes | note · proven | fix G7 |
| 9 | `docs/commands.md:192` omits the repo suffix of a workspace repository | note · proven | fix G8 |
| 10 | `outcome.md` → Deviations out of order | note · observed | fix G9 |

G1–G3, G5 and G6 change code and G4 adds a test, so a third review follows the second and last round of fixes (D-053
(2)).

## Round 3 (2026-11-22, day session; after the second and last round of fixes, G1–G9)

- Inputs: `ticket.md` (F1–F8, G1–G9), `node_modules/.rebuild-review/R-030-3.diff` (3216 lines), `taste.md`; a fresh
  reviewer (T-06).
- Main session before the review: `compare --git` after the implementer's fixes → exit 0; `gate.mjs` → exit 0, 784/784
  (179.0 s); `fails-before.mjs` → exit 0 (the same twelve files); Biome `.` → exit 0; `check.mjs` → exit 0.
- Guard: `compare node_modules/.rebuild-review/R-030-3.before` → `unchanged`, exit 0. Parser: `review-verdict.mjs
  node_modules/.rebuild-review/R-030-3.reply <ticket.md>` → `consistent`, exit 0.
- Verdict: FAIL. AC-1–AC-8 met; AC-9 not met (the blocking finding). G1–G9 hold, each with its test or text (note 3).
  Taste questions: T-14, T-18 yes; T-29 yes for each round-2 test; T-30 mostly (the abandon header and `nestedWork`'s
  comment are false in the blocking case); T-40 no owner step; T-41 the coordinator runs `limen abandon`.

| # | Finding | Kind | Decision |
|---|---|---|---|
| 1 | `limen abandon` exits 0 and removes a worktree holding a clean embedded repository that the job committed as a gitlink in its own unlanded `HEAD`: the nested commit exists only in the embedded `.git`, and `limen/abandon/<id>` points to an object found nowhere else (`src/job/abandoning.ts:205-213`; `docs/jobs.md:149` false here) | blocking · proven | Adrian (Q-38 option 1, D-087): fix H1 in a third round of fixes |
| 2 | `docs/commands.md:158` leaves out G5's condition (reuse of the job's worktree, or the worktree gone) | note · observed | fix H2 |
| 3 | `outcome.md` → Done (f) says 14 tests, then 16; the file has 16 | note · proven | fix H3 |
| 4 | G1–G9 hold in the tree, each with its test or text | note · proven | no change |

## Round 4 (2026-11-22, day session; after the third round of fixes, H1–H3, D-087)

- Inputs: `ticket.md` (F1–F8, G1–G9, H1–H3), `node_modules/.rebuild-review/R-030-4.diff` (3385 lines), `taste.md`; a
  fresh reviewer, told that this round checks only H1–H3 and regressions (D-087).
- Main session before the review: `compare --git` after the implementer's fixes → exit 0; `gate.mjs` → exit 0, 785/785
  (180.4 s); `fails-before.mjs` → exit 0 (the same twelve files); Biome `.` → exit 0; `check.mjs` → exit 0.
- Guard: `compare node_modules/.rebuild-review/R-030-4.before` → `unchanged`, exit 0. Parser: `review-verdict.mjs
  node_modules/.rebuild-review/R-030-4.reply <ticket.md>` → `consistent`, exit 0.
- Verdict: FAIL. AC-1–AC-8 met; AC-9 not met (the blocking finding). H1–H3 hold, with no regression of F1–F8 or G1–G9
  (note 4). Taste questions: T-14, T-18, T-29, T-30 yes; T-40 no owner step; T-41 the coordinator runs `limen abandon`.

| # | Finding | Kind | Decision |
|---|---|---|---|
| 1 | H1's kept worktree is lost at the next prune: the written `limen/abandon/<id>` resolves the job (Decision 2), the worktree looks clean to `git status`, so `limen prune` or the setup prune of the next worker spawn removes it with the nested commit and exits 0 (a probe: abandon, then `limen prune` → `pruned 1 finished worktree`) | blocking · proven | Adrian (Q-39 option 1, D-088): fix I1 in a fourth round of fixes |
| 2 | `nestedWork` reads only the gitlink's commit and the nested repository's status, never its other branches, stash or reflog | note · observed | to R-031's notes in `## Tickets` (D-088) |
| 3 | `docs/jobs.md:138` lacks G5's condition | note · observed | fixed by the main session (D-087: text only) |
| 4 | Apart from finding 1, H1–H3 hold, with no regression | note · proven | no change |
| 5 | The reviewer left split-diff files and a probe folder in the session scratchpad, outside the repository; a removal was denied | note · observed | no change: outside the tree, which the guard found unchanged |

## Round 5 (2026-11-22, day session; after the fourth round of fixes, I1, D-088)

- Inputs: `ticket.md` (F1–F8, G1–G9, H1–H3, I1), `node_modules/.rebuild-review/R-030-5.diff` (3643 lines), `taste.md`;
  a fresh reviewer, told that this round checks only I1 and regressions (D-088).
- Main session before the review: `compare --git` after the implementer's fix → exit 0; `gate.mjs` → exit 0, 787/787
  (184.7 s); `fails-before.mjs` → exit 0 (the same twelve files); Biome `.` → exit 0; `check.mjs` → exit 0.
- Guard: `compare node_modules/.rebuild-review/R-030-5.before` → `unchanged`, exit 0. Parser: `review-verdict.mjs
  node_modules/.rebuild-review/R-030-5.reply <ticket.md>` → `consistent`, exit 0.
- Verdict: PASS. AC-1–AC-9 met: the three removal paths of `src/` each run the shared checks first. Taste questions:
  T-14, T-18, T-29, T-30 yes; T-40 no owner step; T-41 the coordinator runs `limen abandon`.

| # | Finding | Kind | Decision |
|---|---|---|---|
| 1 | I1 holds with no regression of F1–F8, G1–G9 or H1–H3; one function decides, every removal path calls it | note · proven | no change |
| 2 | I1 also keeps a worktree whose gitlink folder holds no nested `.git`, so a project with a registered submodule, or whose `main` records such a gitlink, removes no worktree and no landed branch; nothing is lost | note · proven | to R-032's notes in `## Tickets` (D-087's rule for a note that touches code, applied to D-088's round): the sweep's prune checks a gitlink only where a nested `.git` is there |
| 3 | A clean candidate whose `HEAD` has no commit makes the whole prune fail with `GIT_FAILED`, in Git's words only (read from the code) | note · observed | to R-032's notes: fails closed, nothing lost |
| 4 | A gitlink path that holds a tab is cut at it in the `kept` line; the worktree is still kept | note · observed | to R-032's notes |
| 5 | `docs/jobs.md:147` names only a dirty worktree as the reason a branch stays | note · proven | fixed by the main session (text only): the three causes of a kept worktree |
| 6 | The reviewer wrote six test logs to the session scratchpad; the tree's status hash was unchanged | note · observed | no change |

The ticket closes on this round: its verdict is PASS, and the one note it fixes touches only `docs/` (D-053 (2)).
