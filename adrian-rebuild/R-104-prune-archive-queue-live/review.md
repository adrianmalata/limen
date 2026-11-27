<!-- PL: Recenzja ticketu R-104 (dzienny prune archiwizuje każdy niezarejestrowany folder i nie czeka na lock joba;
wpis kolejki startowej żyje tylko dla joba zarejestrowanego projektu). Runda 1 (27.11, noc): PASS, kryteria AC-1–AC-12
spełnione, sześć uwag bez znaleziska blokującego; cztery (komentarz, nazwa „held”, opis reguły kolejki, nagłówki
testów) idą do poprawki jako F1–F4 w decyzji 10, dwie zostają bez zmiany z powodem. Runda 2 (28.11, noc): PASS,
dwie uwagi o `docs/` poprawione przez główną sesję. Stan: recenzja zamknięta po dwóch rundach. -->

# R-104 review

## Round 1 (2026-11-27, night run)

- Before: the first implementer run ended with `BLOCKED` (the test of a clone whose `.git` names a gone gitdir:
  Git 2.56.1's wording fails the held checks with `GIT_FAILED`), `review-guard.mjs compare --git` → "within its
  limits", exit 0; Decision 9 (night default) answered it, a new `snapshot --git` followed the edit of `ticket.md`
  (D-035), and a fresh implementer finished from the working tree (D-026); `compare --git` → "within its limits",
  exit 0. The main session's `gate.mjs --out node_modules/.rebuild-review/R-104.gate` → exit 0, 1498/1498 (347.6 s);
  `fails-before.mjs` → exit 0 (`test/cli/sweep.test.ts`, `test/runtime/pruning.test.ts`,
  `test/runtime/start-queue.test.ts`).
- Reply: `rebuild-reviewer` with the ticket, `node_modules/.rebuild-review/R-104.diff` and `taste.md`;
  `review-guard.mjs compare` → "unchanged", exit 0; `review-verdict.mjs` → "consistent", exit 0.
- Verdict: **PASS**. AC-1–AC-12 met; six notes, no blocking finding. Taste questions: T-29, each test fails for one
  reason and the two guards assert one rule each; T-30, mostly why, the weak spot is note 4; T-18, note 3.

| # | Finding (short) | Decision |
|---|---|---|
| 1 | note · observed: a doc comment line of `src/runtime/sweeping.ts:274` is 158 columns wide | fix: F1 (`ticket.md` → Decision 10) |
| 2 | note · observed: the docs say every unregistered folder moves into the archive, but a `.git` naming a gone gitdir fails the step on Git 2.56.1 | no change: what the docs say depends on Q-104's answer (Decision 9); `outcome.md` → Open point 2 |
| 3 | note · observed: "held" names two things in `src/runtime/pruning.ts` (`heldCandidates` and `PruneResult.held`), against T-18 | fix: F2, `heldCandidates` becomes `keptCandidates`; `held` keeps Change 2's meaning |
| 4 | note · observed: the `QueueReader` doc's "by today's rule alone" no longer says which rule | fix: F3 |
| 5 | note · observed: an entry with a live pid whose `jobDir` makes `realpath` fail with other than `ENOENT` makes `readEntries` throw and ends a waiting wrapper's wait | no change: the same at `HEAD` through `readRecord`, a defined failure and not a swallowed one (T-01); the queue's swallowed reads are R-082's note |
| 6 | note · observed: the diff lengthens the multi-line opening comments of three test files, against T-29 (5) | fix: F4, the headers go back to their text at `HEAD` |

A round of fixes follows (code and tests, D-053 (2)): a fresh `rebuild-implementer` (D-026) with `ticket.md` and this
file.

## Round 2 (2026-11-28, night run)

- Before: a fresh `rebuild-implementer` made F1–F4 (`DONE`); `review-guard.mjs compare --git` → "within its limits",
  exit 0. The main session's `gate.mjs --out node_modules/.rebuild-review/R-104.gate` → exit 0, 1498/1498 (346.9 s);
  `fails-before.mjs` → exit 0 (the same three files).
- Reply: `rebuild-reviewer` with the ticket, the new `node_modules/.rebuild-review/R-104.diff` and `taste.md`;
  `review-guard.mjs compare` → "unchanged", exit 0; `review-verdict.mjs` → "consistent", exit 0.
- Verdict: **PASS**. AC-1–AC-12 met; two notes, no blocking finding. Taste questions: T-18, "held" names one thing in
  `src/runtime/pruning.ts`; T-29, each changed test fails for one reason and the headers are as at `HEAD`; T-30, the
  new comments say why.

| # | Finding (short) | Decision |
|---|---|---|
| 1 | note · observed: `docs/commands.md:313` gives every unregistered folder the reason `the directory is not a registered Git worktree`, but a folder a job's record names carries that job's reason (`src/runtime/pruning.ts:535`) | fixed by the main session (D-053 (2), docs only): the bullet names both |
| 2 | note · observed: another waiting wrapper or the sweep removes the entry of a job of a project the seat does not register, so `docs/jobs.md:191`'s "still starts in its turn" holds only while no other reader removes it; within the ticket's Risk | fixed by the main session (D-053 (2), docs only): the sentence says the entry is removed and written again at the job's next poll, so such a job may wait past its turn |

The review is closed after two rounds.
