<!-- PL: Recenzja ticketu R-045 (narzędzia i skille według roli; rola tylko do odczytu, która coś zapisze, kończy się
`failed`, rodzaj `read-only-violation`). Runda 1 (27.11, w dzień): FAIL przy wszystkich kryteriach spełnionych, z jednym
znaleziskiem blokującym (`limen stop … "done: …"` wypisywał `done`, choć rekord kończył się `failed`, i tłumił
budzenie) i sześcioma uwagami; runda poprawek F1–F5 w `ticket.md` → decyzja 17, jedna uwaga do punktów otwartych
`outcome.md`, jedna bez zmiany. Runda 2: PASS z czterema uwagami; ostatnia runda poprawek G1–G3 (ucieczka znaków
w szczególe `unproven:`, teksty węższe niż kod, jedno parsowanie statusu), jedna uwaga do punktów otwartych. Runda 3:
PASS z dwiema uwagami: sformułowanie w `docs/commands.md` poprawione przez sesję główną, uwaga o parserze statusu
do punktów otwartych `outcome.md`. Stan: recenzja zamknięta. -->

# R-045 review

## Round 1 (2026-11-27, by day, `limen-rebuild-44`)

- Before: the implementer's run → `review-guard.mjs compare --git` → "within its limits", exit 0; the main session's
  `gate.mjs --out node_modules/.rebuild-review/R-045.gate` → exit 0, 1466/1466 (339.7 s); AC-7's `fails-before.mjs`
  → exit 0 (run twice: the first run's output went to a redirection the rules of `## Commands` forbid, so it ran once
  more with its output filtered through `grep`; both exited 0).
- Reply: `rebuild-reviewer` with the ticket, `node_modules/.rebuild-review/R-045.diff` and `taste.md`;
  `review-guard.mjs compare` → "unchanged", exit 0; `review-verdict.mjs` → "consistent", exit 0.
- Verdict: **FAIL**. AC-1–AC-14 met; one blocking finding, six notes.

| # | Finding (short) | Decision |
|---|---|---|
| 1 | blocking · proven: `limen stop <id> "done: …"` of a read-only job that changed its worktree prints `done <id>: …` (`src/job/stopping.ts:83`, `:131`) while the record ends `failed`, `read-only-violation`, and it marks the calling session as told, so no wake shows the real end | fix (F1) |
| 2 | note · proven: Pi 1.5.1's `--no-skills` still loads the skills an `--extension` package declares, so the new sentences of `docs/setup.md` and `docs/commands.md` hold only while no selected package declares any | fix (F2), text |
| 3 | note · observed: a reviewer continuation whose worktree a prune removed is rebuilt at the candidate's current tip, so a moved candidate fails it with `HEAD moved` though nothing was written | no change: it fails closed (Decision 12); the main session adds it to `outcome.md` → Open points |
| 4 | note · proven: a path already in the start state's status that the job writes again keeps its status entry, so that write is not seen (`outcome.md` → Open point 1) | fix (F3): a silent false success, which Decision 12 rules out |
| 5 | note · guessed: `readOnlyEffect` runs unguarded in `finalizeJob`, and an error that is not an environment error would reject every finalize of the job | fix (F4): the check fails closed instead (Decision 12) |
| 6 | note · proven: one read-only test joins the cap of five paths and the escaping, and its newline path, the sixth, is never shown (T-29 (3)) | fix (F5) |
| 7 | note · proven: `runInternalJob` changed and keeps its two debt suppressions (T-27 (1)) | no change: R-082's ratchet, as for R-043, R-111 and R-044 |

## Round 2 (2026-11-27, by day, `limen-rebuild-44`)

- Before: F1–F5 by the resumed implementer; `compare --git` → "within its limits", exit 0; the main session's gate →
  exit 0, 1470/1470 (382.1 s); `fails-before.mjs` with AC-7's files and `test/cli/stop.test.ts` → exit 0.
- Reply: `review-guard.mjs compare` → "unchanged"; `review-verdict.mjs` → "consistent". Verdict **PASS**: AC-1–AC-14
  met; four notes. Two touch code, so the fixes below are a round of their own, the last (D-053 (2)).

| # | Finding (short) | Decision |
|---|---|---|
| 1 | note · proven: an `unproven:` detail holds a Node error message unescaped, which since F3 and F4 can hold a path the job chose, so a newline in a file name reaches the failure detail, the log line and the `limen stop` line | fix (G1): untrusted text reaches what the coordinator reads |
| 2 | note · proven: `docs/jobs.md`'s launch causes and the comments at `src/runtime/wrapper.ts:399` and `src/job/read-only.ts:106` name only git, while any unreadable listed path now ends the job `launch` (T-30) | fix (G2), text and comments |
| 3 | note · observed: `statusEntries` copies the `-z` porcelain parsing of `statusPaths` in `src/project/git.ts` (T-25 (2)) | fix (G3): one parser |
| 4 | note · guessed: a write that `git status` does not list (`git update-index --skip-worktree` or `--assume-unchanged` before the change, or files under a folder made unreadable) passes as `same` | no change in code: the main session adds it to `outcome.md` → Open points beside the writes outside the worktree (A-081: the check compares the worktree's status) |

## Round 3 (2026-11-27, by day, `limen-rebuild-44`)

- Before: G1–G3 by the resumed implementer; `compare --git` → "within its limits", exit 0; the main session's gate →
  exit 0, 1471/1471 (359.3 s); `fails-before.mjs` with AC-7's files and `test/cli/stop.test.ts` → exit 0.
- Reply: `review-guard.mjs compare` → "unchanged"; `review-verdict.mjs` → "consistent". Verdict **PASS**: AC-1–AC-14
  met; two notes. The rounds of fixes are spent (protocol step 6).

| # | Finding (short) | Decision |
|---|---|---|
| 1 | note · proven: `docs/commands.md:157` says no role's list names an extension's tool, while every list names `finish`, which a Limen hook registers (T-30) | fixed by the main session (D-053 (2)): "no list names a tool of a selected extension now" |
| 2 | note · guessed: `parsedStatus` reads a source path only for an index-column rename or copy, so a work-tree-column rename would parse its source as an entry; fails closed, as `dirtyPaths` did before G3 | no change (D-092): `outcome.md` → Open points 9 |

