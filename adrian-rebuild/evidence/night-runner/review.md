<!-- PL: Przebieg recenzji narzędzia tools/night.mjs przez subagenta rebuild-reviewer według protokołu ticketu
(strażnik review-guard.mjs przed i po, parser review-verdict.mjs). Dla każdej rundy: werdykt, wynik strażnika
i parsera oraz decyzja sesji głównej przy każdym znalezisku (poprawka albo odrzucenie z powodem).
Stan: zamknięta; runda 1 FAIL (poprawiona), runda 2 PASS bez znalezisk blokujących. -->

# Review: `tools/night.mjs`

## Round 1 (2026-11-17)

- Inputs: `evidence/night-runner/ticket.md`, the diff from `review-guard.mjs diff --out
  node_modules/.rebuild-review/night.diff` (891 lines), `taste.md`.
- Guard: `review-guard.mjs compare node_modules/.rebuild-review/night.before` → `unchanged`, exit 0.
- Parser: `review-verdict.mjs node_modules/.rebuild-review/night.reply <ticket.md>` → `consistent`, exit 0.
- Verdict: FAIL. AC-1 to AC-6 met; one blocking finding.

| # | Finding | Kind | Decision |
|---|---|---|---|
| 1 | Test 1 checked the end on `done`, the `claude` invocation, the run log and the lock release; the exit-3 test also checked the lock, and the horizon test the HH:MM format (T-29 (3)) | blocking · proven | fixed: one mechanism per test; 22 tests |
| 2 | "no retry at or after `--until`" covered only "after"; the check of the end after a wait was never reached (`>=` → `>` and deleting the check both passed) | note · proven | fixed: tests "no retry starts at `--until`" and "a wait that wakes up after `--until` starts no run" (a clock that oversleeps) |
| 3 | A boot-id mismatch was not tested (A-017: any mismatch) | note · proven | fixed: the A-017 test has a lock with another boot id |
| 4 | A race in the takeover of an abandoned lock | note · observed | rejected: two starts at the same moment by one person by hand; a rename before the check only moves the window (ticket.md → `## Risk`) |
| 5 | Exit 1 also covered internal errors after the start | note · observed | fixed: a failure of the runner exits 4 with its stack; a usage error stays 1, as Adrian asked |
| 6 | A run's duration has no limit | note · guessed | rejected: the runner never kills a session that may be finishing its ticket; a hang shows in the run log (ticket.md → `## Risk`) |
| 7 | D-011 names `adrian-rebuild/questions.md`, D-019 and the prompt `.night/questions.md` | note · proven | fixed: D-019 says both name `adrian-rebuild/.night/questions.md` |
| 8 | `## State` names `review.md` before it existed | note · proven | no change: the commit contains `review.md` |

Mutations after the fixes (a copy of the tool outside the repository, the same test file): 16 mutations, each fails
the test of its mechanism; `outcome.md` → `## Fails before`.

## Round 2 (2026-11-17)

- Inputs: the same ticket and `taste.md`, the new diff `node_modules/.rebuild-review/night-2.diff`.
- Guard: `review-guard.mjs compare node_modules/.rebuild-review/night-2.before` → `unchanged`, exit 0.
- Parser: `review-verdict.mjs node_modules/.rebuild-review/night-2.reply <ticket.md>` → `consistent`, exit 0.
- Verdict: PASS. AC-1 to AC-6 met; round 1's blocking finding fixed; no blocking finding. The code stays as reviewed;
  the notes change no code.

| # | Finding | Kind | Decision |
|---|---|---|---|
| 1 | The run-log test also asserts the runner's start line, a second code path that four other tests cover | note · proven | no change: one subject (what the run log holds); a failure still names its mechanism |
| 2 | No test asserts that the temporary `.lock-<uuid>.tmp` is removed | note · proven | checked by hand: after a night and after a held-lock refusal `.night/` holds no `.tmp` file (`outcome.md` → `## Proof`) |
| 3 | The default `claude` on PATH, which the first night uses, runs in no test | note · proven | checked by hand: a fake `claude` first on PATH, no `--claude` → called, exit 0 (`outcome.md` → `## Proof`) |
| 4 | `outcome.md` gave an imprecise reason why `fails-before.mjs` was not used | note · proven | fixed: it keeps only `*.test.*` files, and `test-night.mjs` is not one |
| 5 | The reviewer wrote two scratch files outside the repository | note · proven | no change: outside the repository; the guard shows the tree unchanged |
