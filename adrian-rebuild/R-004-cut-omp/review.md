<!-- PL: Recenzje ticketu R-004 przez rebuild-reviewer. Runda 1 (18.11): FAIL, dwa ustalenia blokujące (zdanie
o `watch` w templates/agents.md prawdziwe tylko dla trasy przez panel Herdra; „Both engines” w docs/jobs.md) i sześć
uwag; implementer poprawia oba blokujące i trzy uwagi (docs/setup.md o LIMEN_ENGINE, komentarz w supervisor.ts,
numer wiersza w runbooku), trzy uwagi odrzucone z powodem. Runda 2 (nowy recenzent, bo odpowiedź pierwszego nie
dotarła): PASS, jedna uwaga odrzucona z powodem. Stan: zamknięty. -->

# Review: R-004 Cut the OMP engine

## Round 1 (2026-11-18, day session)

- Inputs: `adrian-rebuild/R-004-cut-omp/ticket.md`, the diff from `review-guard.mjs diff --out
  node_modules/.rebuild-review/R-004.diff`, `adrian-rebuild/taste.md`.
- Main session before the review: `review-guard.mjs compare --git node_modules/.rebuild-review/R-004.git <ticket.md>`
  → within its limits; `node adrian-rebuild/tools/gate.mjs` → exit 0, 96/96; `fails-before.mjs` → exit 0;
  `check.mjs` and Biome on `adrian-rebuild` → exit 0.
- Guard: `review-guard.mjs compare node_modules/.rebuild-review/R-004.before` → `unchanged`, exit 0.
- Parser: `review-verdict.mjs node_modules/.rebuild-review/R-004.reply <ticket.md>` → `consistent`, exit 0.
- Verdict: FAIL. AC-1 to AC-9 met, AC-10 not met; two blocking findings, six notes.

| # | Finding | Kind | Decision |
|---|---|---|---|
| 1 | `templates/agents.md:188` tells every coordinator "On a job that already ended, `watch` says no wake will follow"; the code prints it only on a Herdr pane route (`src/commands/watch.ts:33-41`), and a Pi session route is still woken for an ended job it subscribes to (`hook/wake.ts:503-520`) | blocking · proven | fix (implementer): drop the sentence or scope it to a coordinator without a Pi session |
| 2 | `docs/jobs.md:122` still says "Both engines write the transcript" | blocking · proven | fix (implementer): name Pi only |
| 3 | `docs/setup.md:92` says Limen refuses any other `LIMEN_ENGINE` before a job exists; `limen continue` does not read it | note · proven | fix (implementer): `spawn` refuses other values; a continuation keeps its parent's engine and refuses a removed one |
| 4 | `src/runtime/supervisor.ts:99` "An engine or platform that never binds" still gives a second engine as a reason (T-30) | note · proven | fix (implementer): the comment names the platform only |
| 5 | `docs/seat/agent-setup.md:202` cites `src/runtime/engine.ts:136` for `--no-extensions`; stale at `HEAD` and still wrong | note · proven | fix (implementer): name the file without a line number |
| 6 | `docs/setup.md:12` "Last known-good versions: pi 1.2.0" beside the runbook's check for 1.5.1 | note · observed | rejected: the line predates this ticket and records versions the code was last checked with, not the seat's; the seat's versions are `plan.md` → `## System requirements` and D-004, and R-081 regenerates the docs from the code |
| 7 | The tab count of "hosted Pi stop records stopped once and closes the job's tab" spans the whole file (T-29 (3)) | note · observed | rejected: the coupling predates this ticket, and R-005 cuts hosted jobs with this test file's hosted tests next |
| 8 | T-27: `runInternalJob` keeps its two "split pending" suppressions | note · proven | rejected: the ticket's Change does not split it, and the plan leaves the ratchet to R-082 and R-083, as in R-002 and R-003 |

Taste questions answered by the reviewer: T-14 (the rewritten template sentences are literal; the one at `:188` is
false for Pi, finding 1), T-18 (`[--engine pi]` names the only value; the "Pi only" qualifiers go), T-29 (each new test
fails at `HEAD` for one reason; the tab count, finding 7), T-30 (the reworded comments give a reason;
`supervisor.ts:99`, finding 4), T-40 (no owner step beyond the seat check of `## Migration`), T-41 (no command added).

## Round 2 (2026-11-18, day session)

- Inputs: the same `ticket.md` (with the round-1 decisions), the diff from `review-guard.mjs diff --out
  node_modules/.rebuild-review/R-004.diff2`, `taste.md`.
- Main session before the review: `review-guard.mjs compare --git node_modules/.rebuild-review/R-004-fix1.git
  <ticket.md>` → within its limits; `gate.mjs` → exit 0, 96/96; `check.mjs` and Biome on `adrian-rebuild` → exit 0.
- The round-1 reviewer, resumed with the new diff, did not deliver its reply: the harness held it back while that
  agent counted as having background work of its own, though no process of it ran. `compare` against
  `R-004.before2` → `unchanged`, and a fresh `rebuild-reviewer` reviewed the same diff.
- Guard: `review-guard.mjs compare node_modules/.rebuild-review/R-004.before2` → `unchanged`, exit 0.
- Parser: `review-verdict.mjs node_modules/.rebuild-review/R-004.reply2 <ticket.md>` → `consistent`, exit 0.
- Verdict: PASS. AC-1 to AC-10 met; one note. Both blocking findings of round 1 are fixed, and so are notes 3–5.

| # | Finding | Kind | Decision |
|---|---|---|---|
| 1 | `docs/setup.md:92` says `limen spawn` refuses any other value of `--engine` or `LIMEN_ENGINE`, but the flag wins: `--engine pi` with `LIMEN_ENGINE=omp` starts a Pi job | note · proven | rejected: the sentence follows decision (c) and the order HEAD's docs stated; with one engine left, R-014 sets with Adrian whether `--engine` and `LIMEN_ENGINE` stay, and R-081 regenerates the docs from the code; the outcome names it (Open points 8) |

Taste questions answered by the reviewer: T-14, T-18, T-29, T-30 (the comment at `supervisor.ts:99-100` names the
platform only), T-40, T-41: no finding.
