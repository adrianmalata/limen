<!-- PL: Recenzja ticketu R-106 (obserwator `main` poza kontem agentów). Runda 1 (28.11, noc): FAIL na jednym
znalezisku blokującym: klucz zapisu `forced` i `deleted` to tylko trzymany tip, więc powtórzony tip nie dzwoni, wbrew
D-117 (4); poprawka F1 w decyzji 9 klucza po zdarzeniu, a F2–F4 to dokumentacja, rozdzielone testy i komentarze.
Wiersz `ssh` dopisała główna sesja. Runda 2: PASS, uwagę o README poprawiła główna sesja, luka ponownego wysłania
`deleted` czeka na bramkę 5.4. Stan: recenzja zamknięta po dwóch rundach. -->

# R-106 review

## Round 1 (2026-11-28, night run)

- Before: the first implementer run ended with `BLOCKED` before any change (systemd's flat credential names);
  Decision 8 (night default) answered it, a new `snapshot --git` followed the edit of `ticket.md` (D-035), and a fresh
  implementer implemented the ticket (D-026); `review-guard.mjs compare --git` → "within its limits", exit 0. The main
  session's `gate.mjs --out node_modules/.rebuild-review/R-106.gate` → exit 0, 1544/1544 (353.4 s);
  `fails-before.mjs` → exit 0 (`test/seat/alerts.test.ts`, `test/seat/units.test.ts`, `test/seat/main-watch.test.ts`).
- Reply: `rebuild-reviewer` with the ticket, `node_modules/.rebuild-review/R-106.diff` and `taste.md`;
  `review-guard.mjs compare` → "unchanged", exit 0; `review-verdict.mjs` → "consistent", exit 0.
- Verdict: **FAIL**. AC-1–AC-9 met; one blocking finding, three notes. Taste questions: T-29, two alerts tests check
  several things; T-30, two flags have their reason only in `outcome.md`; T-40 and T-41, no concern.

| # | Finding (short) | Decision |
|---|---|---|
| 1 | blocking · proven: the record key of `forced` and `deleted` is the held tip only, so a forced update or deletion at a tip already reported sends nothing (D-117 (4), D-110 (1)) | fix: F1 (`ticket.md` → Decision 9), a key per occurrence: the kept ref's time for `forced`, the deletion's start for `deleted` |
| 2 | note · proven: `docs/seat/README.md:48` says the other entries are still watched with no `known_hosts`, `git` or `ssh`; none is | fix: F2, with the resend sentence |
| 3 | note · observed: Decision 6's `ssh` row is not in the diff | fixed by the main session in `plan.md` → `## System requirements` |
| 4 | note · observed: at `HEAD` two test files fail on loading, not on their mechanism | no change: `outcome.md` → `## Fails before` records the runs with `seat/program.ts` present, 13 of 14 main-watch tests failing on the mechanism and the 14th strengthened until it failed |
| T-29 | two alerts tests check several things | fix: F3, split |
| T-30 | `--no-auto-gc` and `--template=` have no reason in the code | fix: F4 |

A round of fixes follows (code, tests and docs, D-053 (2)): a fresh `rebuild-implementer` (D-026) with `ticket.md` and
this file.

## Round 2 (2026-11-28, night run)

- Before: a fresh `rebuild-implementer` made F1–F4 (`DONE`; the four F1 tests failed 0/4 before the fix);
  `review-guard.mjs compare --git` → "within its limits", exit 0. The main session's `gate.mjs --out
  node_modules/.rebuild-review/R-106.gate` → exit 0, 1551/1551 (347.0 s); `fails-before.mjs` → exit 0 (the same three
  files).
- Reply: `rebuild-reviewer` with the ticket, the new `node_modules/.rebuild-review/R-106.diff` and `taste.md`;
  `review-guard.mjs compare` → "unchanged", exit 0; `review-verdict.mjs` → "consistent", exit 0.
- Verdict: **PASS**. AC-1–AC-9 met; one note, no blocking finding. Taste questions: T-29, T-30 yes; T-40, T-41 no
  concern.

| # | Finding (short) | Decision |
|---|---|---|
| 1 | note · proven: `docs/seat/README.md:48` promises every refused send again, but a refused `deleted` is lost once `main` is seen again and a refused `unwatched` once the remote is reached | fixed by the main session (D-053 (2), docs only): the README says which refused sends come again; the code gap is `outcome.md` → Open points 8, for Adrian at gate 5.4 |

The review is closed after two rounds.
