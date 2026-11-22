<!-- PL: Recenzje R-033 przez rebuild-reviewer. Runda 1: PASS z ośmioma uwagami bez blokujących; sześć idzie do
poprawy jako F1–F6 w `ticket.md` → `## Decisions` (m.in. cichy brak projektów kończy przebieg błędem, instalacja
odmawia konta roota i konta agentów), dwie poprawiła sesja główna w tekście (Rollback, wymagania systemowe). Runda
2: PASS; F1–F6 potwierdzone, jedna uwaga do kodu (fałszywa przyczyna w linii podsumowania F1) idzie do drugiej i
ostatniej rundy poprawek jako G1. Runda 3: PASS; uwaga tekstowa poprawiona przez sesję główną, dwie uwagi do kodu
(stare awarie nowego projektu, podwójne liczenie) przeszły decyzją Adriana do R-035 (Q-41, D-090). Stan: zamknięta. -->

# R-033 review

## Round 1 (2026-11-22, day session)

- Inputs: `adrian-rebuild/R-033-alerts/ticket.md`, `node_modules/.rebuild-review/R-033.diff` (2998 lines),
  `adrian-rebuild/taste.md`; the draft `outcome.md`.
- Main session before the review: `compare --git` after the implementer → exit 1 on the form of (f), accepted by
  Adrian (D-089), then exit 0 after (f) named each path; `node adrian-rebuild/tools/gate.mjs` → exit 0, 821/821
  (182.5 s); `node adrian-rebuild/tools/fails-before.mjs` → exit 0 (six files); `npx biome check --error-on-warnings
  .` → exit 0; `node adrian-rebuild/tools/check.mjs` → exit 0.
- Guard: `review-guard.mjs compare node_modules/.rebuild-review/R-033.before` → `unchanged`, exit 0.
- Parser: `review-verdict.mjs node_modules/.rebuild-review/R-033.reply <ticket.md>` → `consistent`, exit 0.
- Verdict: PASS. AC-1–AC-9 met. Taste questions: T-29 yes, with two exceptions (the migration fixture passes without
  the migrated skip, note 3; the healthy-status test is a negative control); T-30 yes; T-40 no owner step; T-41 no
  `limen` command added; T-18 "bell" is gone.

| # | Finding | Kind | Decision |
|---|---|---|---|
| 1 | A registry the run cannot reach is skipped silently, and an install that finds no registry still enables the timer: every run exits 0 with "read 0 projects" and no failure reaches the phone (T-01) | note · proven | fix F1: no project read → exit 4 naming the cause; `install` refuses with no registered project |
| 2 | The ticket's Rollback does not let the revert deploy: `seat/deploy.ts` runs the new checkout's units step while the service file exists | note · proven | fixed by the main session: the Rollback removes both unit files and reloads before the revert's deployment |
| 3 | No test fails without the skip of migrated records, of older folders, or the split between a closed and an unreadable registry | note · proven | fix F2 |
| 4 | A failed `daemon-reload` leaves the written units unloaded, and a retry finds them unchanged and does not reload | note · observed | fix F3: reload every time |
| 5 | `install` accepts `root` or the agents' account as `--account` (G2: an account of its own) | note · proven | fix F4: refuse uid 0 and an account whose home holds a registry |
| 6 | A second `requiredText` and a second `counted` (T-25) | note · proven | fix F5 |
| 7 | `## System requirements` has no row for `setfacl`, `systemd-analyze`, `systemctl` | note · proven | fixed by the main session: the row |
| 8 | The units' header comment is 103 characters (T-10) | note · proven | fix F6 |

## Round 2 (2026-11-22, day session; after the first round of fixes, F1–F6)

- Inputs: `ticket.md` (F1–F6), `node_modules/.rebuild-review/R-033-2.diff` (3449 lines), `taste.md`; a fresh reviewer
  (T-06).
- Main session before the review: `compare --git` after the implementer's fixes → exit 0; `gate.mjs` → exit 0, 832/832
  (186.4 s); `fails-before.mjs` → exit 0 (the same six files); Biome `.` → exit 0; `check.mjs` → exit 0.
- Guard: `compare node_modules/.rebuild-review/R-033-2.before` → `unchanged`, exit 0. Parser: `review-verdict.mjs
  node_modules/.rebuild-review/R-033-2.reply <ticket.md>` → `consistent`, exit 0.
- Verdict: PASS. AC-1–AC-9 met. Taste questions: T-29, T-30 yes; T-40 no owner step; T-41 no `limen` command; T-18 no
  "bell" left.

| # | Finding | Kind | Decision |
|---|---|---|---|
| 1–6 | F1–F6 met, each with its tests (F2 read from the tests; the reviewer runs no mutants) | note · proven | no change |
| 7 | F1's summary line names a false cause in two mixed cases: an unreadable registry beside a closed one (on the seat `/root/.limen/projects` is always closed, so it says "every registry is in a home this account cannot enter"), and a read registry whose every project line is unreadable; the problem lines above name the real cause and the run exits 4 | note · proven | fix G1 in the second and last round of fixes |

## Round 3 (2026-11-22, day session; after the second and last round of fixes, G1)

- Inputs: `ticket.md` (F1–F6, G1), `node_modules/.rebuild-review/R-033-3.diff` (3557 lines), `taste.md`; a fresh
  reviewer (T-06).
- Main session before the review: `compare --git` after the implementer's fix → exit 0; `gate.mjs` → exit 0, 834/834
  (181.9 s); `fails-before.mjs` → exit 0 (the same six files); Biome `.` → exit 0; `check.mjs` → exit 0.
- Guard: `compare node_modules/.rebuild-review/R-033-3.before` → `unchanged`, exit 0. Parser: `review-verdict.mjs
  node_modules/.rebuild-review/R-033-3.reply <ticket.md>` → `consistent`, exit 0.
- Verdict: PASS. AC-1–AC-9 met (the reviewer ran the seat tests as a non-root user, so the `chmod` tests ran). Taste
  questions: T-29, T-30 yes; T-40 no owner step; T-41 no `limen` command; T-18 no "bell" left.

| # | Finding | Kind | Decision |
|---|---|---|---|
| 1 | G1 and F1–F6 hold at this tip | note · proven | no change |
| 2 | A project the alerts first read after their first run sends a line for every failure it already holds; running the install again after `limen init` marks none of them reported (A-054 asks that an install send nothing old) | note · proven | Adrian (Q-41 option 1, D-090): an item of R-035, before `a0.3.0` |
| 3 | The G1 summary counts an unreadable project once per registry that lists it | note · proven | Adrian (D-090): an item of R-035 |
| 4 | `docs/seat/README.md:29` names only two of the causes of a run that reads no project | note · proven | fixed by the main session (text only, D-053 (2)) |
