<!-- PL: Recenzja ticketu R-044 (przełączniki modułów w `limits.json`, domyślnie wyłączone; hooki według roli
i modułu). Runda 1 (27.11, w dzień): FAIL przy wszystkich kryteriach spełnionych, z jednym znaleziskiem blokującym
(komentarz pollera i `outcome.md` opisują porażkę, której kod nie daje, bo nieczytelny plik czyta się jak brak pliku)
i sześcioma uwagami; pięć idzie do rundy poprawek F1–F5 (`ticket.md` → `## Decisions` 19), dwie bez zmiany z powodem.
Runda 2: PASS z ośmioma uwagami, siedem w ostatniej rundzie poprawek G1–G7 (decyzja 20), jedna do punktów otwartych
(R-050). Runda 3: PASS z sześcioma uwagami: trzy poprawione przez sesję główną w dokumentacji, `outcome.md` i kroku
4.9 planu (D-053 (2)), trzy wymagające kodu do punktów otwartych `outcome.md` (D-092). Stan: recenzja zamknięta. -->

# R-044 review

## Round 1 (2026-11-27, by day, `limen-rebuild-43`)

- Before: the implementer's run (after `BLOCKED` → Decisions 17 and 18) → `review-guard.mjs compare --git` → "within
  its limits", exit 0; the main session's `gate.mjs --out node_modules/.rebuild-review/R-044.gate` → exit 0, 1417
  tests, 1417 pass (374.9 s); `fails-before.mjs` on the 15 files of AC-8 → exit 0.
- Reply: `rebuild-reviewer` with the ticket, `node_modules/.rebuild-review/R-044.diff` and `taste.md`;
  `review-guard.mjs compare` → "unchanged", exit 0; `review-verdict.mjs` → "consistent", exit 0.
- Verdict: **FAIL**. AC-1–AC-16 met; one blocking finding, six notes.

| # | Finding (short) | Decision |
|---|---|---|
| 1 | blocking · proven: the poller's comment and `outcome.md` say an unreadable switch fails the project, but `plantLimits` reads through `readOptional`, whose bare `catch` makes any read error "every module off", so the poller reports the project as switched off | fix (F1): by T-01 ("an expected absence (`ENOENT`) is an explicit condition, never a catch-all"), the file read treats only `ENOENT` and `ENOTDIR` as no file; any other error propagates as a typed error that names the file, so the poller names that project as failed; the comment and `outcome.md` follow |
| 2 | note · observed: with `picture` on, the reminder after an edit under `spec/` lost the front-matter rule, which moved to `templates/modules/picture/specs.md` | fix (F2): the specs reminder appends each enabled module's specs file after the `## Specs` section, as the context message does (`## Change` 6), so R-043's reminder stays whole |
| 3 | note · observed: the coordinator's context message reads the switches at the session's cwd, its hooks at the Git top level of `process.cwd()` | fix (F3, with 5): one function gives the hooks and the coordinator's context message the same root (`LIMEN_CONTEXT_ROOT`, else the session's cwd), with no git call |
| 4 | note · observed: `docs/remote.md:133` and `:141` run `limen github connect` with no switch step | fix (F4): both procedures name the switch first (T-30) |
| 5 | note · guessed: the coordinator's steering and group-peer factories now run `git rev-parse`, whose unexpected error stops the stub; steering never needs a switch in a coordinator | fix (F3): no git call in the factories; steering's set excludes it in a coordinator without reading a switch |
| 6 | note · observed: `groupPeer` and `runInternalJob` keep their "split pending" suppressions (T-27 (1)) | no change: the ratchet is R-082's, as in earlier tickets (`plan.md` → `## Stages`, conventions); `outcome.md` → Open point 1 |
| 7 | note · observed: with `workspace` or `group` off, `limen spawn --repo` in a workspace and `limen keeper --group` still run | fix (F5): AC-16 says a module that is off gives "no command or job" (G1.10), so both refuse `MODULE_OFF` in their validate step, before any write |

## Round 2 (2026-11-27, by day, `limen-rebuild-43`)

- Before: F1–F5 by the resumed implementer; `compare --git` → "within its limits", exit 0; the main session's gate →
  exit 0, 1425/1425 (343.6 s); `fails-before.mjs` on AC-8's 15 files with `test/hook/steering.test.ts` and
  `test/hook/communication.test.ts` → exit 0.
- Reply: `review-guard.mjs compare` → "unchanged"; `review-verdict.mjs` → "consistent". Verdict **PASS**; AC-1–AC-16
  met; eight notes. The fixes below are the last round of fixes (protocol step 6).

| # | Finding (short) | Decision |
|---|---|---|
| 1 | note · observed: a continuation of a workspace job runs with `workspace` off; `limen keeper` for a workspace job refuses only after it made its branch | fix (G1): AC-16 and T-38 |
| 2 | note · observed: `LIMITS_UNREADABLE` in the wrapper's tool cap and stall rule is logged as "log write failed" and drops the rest of the event batch | fix (G2): F1 made this path; no event may be lost and the error must show (T-01) |
| 3 | note · observed: commands read the switches at the Git top, hooks at the session's cwd, so a coordinator started in a subfolder differs | no change: a coordinator starts in its project root (`docs/setup.md`), the vision and styleguide already use the cwd (before R-044), and R-050's start script fixes the coordinator's root; `outcome.md` → Open points, naming R-050 |
| 4 | note · observed: the specs reminder follows a switch at once, but `docs/setup.md:77` says hooks follow it at `/reload` | fix (G3): the doc names the reminder's behaviour (T-30) |
| 5 | note · observed: no doc names F5's refusals or `LIMITS_UNREADABLE`; three docs say every `limen github` command refuses, though `github poll` skips; the seat setup script's last line has no switch step | fix (G4): T-30 |
| 6 | note · observed: the migration's module report skips a damaged archived record silently | fix (G5): T-01 |
| 7 | note · guessed: `limen-github` has only traverse ACLs, so a restrictive umask makes its read of `limits.json` fail every pass with exit 4 | fix (G6): `docs/remote.md` step 4 grants the read; `plan.md` → `## Deployment` 4.9 checks it (the main session) |
| 8 | note · observed: `templates/registers/specs.md:19` and `templates/manual.md:119` keep module words | fix (G7): `## Change` 6's rule moves the module clause to its module file |

## Round 3 (2026-11-27, by day, `limen-rebuild-43`)

- Before: G1–G7 by the resumed implementer; `compare --git` → "within its limits", exit 0; the main session's gate →
  exit 0, 1429/1429 (347.6 s); `fails-before.mjs` on AC-8's 15 files with `test/hook/steering.test.ts` and
  `test/hook/communication.test.ts` → exit 0.
- Reply: `review-guard.mjs compare` → "unchanged"; `review-verdict.mjs` → "consistent". Verdict **PASS**; AC-1–AC-16
  met; six notes. The rounds of fixes are spent: the notes on docs, `outcome.md` and the plan are fixed by the main
  session (D-053 (2)), the notes that need code go to `outcome.md` → Open points (D-092).

| # | Finding (short) | Decision |
|---|---|---|
| 1 | note · observed: with `picture` off the keeper's packet and help still say "ticket, board and map links" | no change (code): `outcome.md` → Open point 8; R-066 cuts the keeper |
| 2 | note · observed: `docs/seat/github-setup.sh` grants `limen-github` no traverse on `.agents/` and no read on `limits.json` | no change (code): `outcome.md` → Open point 9; seat step 4.9 checks the read |
| 3 | note · observed: `## Deployment` 4.9 lacks G6's check | fixed by the main session: step 4.9 checks that `limen-github` reads each `github` project's `limits.json` |
| 4 | note · observed: the exit-code table's row 4 does not name `LIMITS_UNREADABLE` | fixed by the main session: `docs/commands.md` row 4 names it |
| 5 | note · observed: `docs/jobs.md:57` and `outcome.md` Done 8 do not name G5's damaged-record lines | fixed by the main session: both name them |
| 6 | note · guessed: a read error other than `BAD_DATA` in the archive ends `limen migrate` after its writes without its report | no change (code): `outcome.md` → Open point 10; the dry run of 0.4 meets it first |
