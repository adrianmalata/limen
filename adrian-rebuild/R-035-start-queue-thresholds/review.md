<!-- PL: Recenzje ticketu R-035 (progi kolejki startowej: diagnoza po 30 min, porażka po 2 h; dwa punkty D-090 w
alertach). Runda 1 (noc 22/23.11, przebieg 2 `night.mjs`): PASS z pięcioma uwagami. Do pierwszej rundy poprawek idą
F1–F4: nazwy jednostek w diagnozie cytowane jako dane, podział dwóch testów sprawdzających po kilka mechanizmów, test
diagnozy niezależny od formatu rankingu i dwa komentarze. Rachunek doręczenia advisory, który blokuje późniejsze
advisory zawieszenia, trafia do pytania Q-43. Runda 2 (przebieg 3, po poprawkach F1–F4): PASS z trzema uwagami
potwierdzającymi poprawki, bez zmian. Stan: recenzja zamknięta. -->

# R-035 review

## Round 1 (2026-11-23, night, run 2 of `night.mjs`)

- Before: the implementer's run → `review-guard.mjs compare --git` "within its limits", exit 0; the main session's
  `gate.mjs` → exit 0, 920 tests, 920 pass, 0 fail (tsc and Biome first, in `npm run check`); `fails-before.mjs` →
  exit 0 (nine files fail at `HEAD` `34a40d0`), recorded in `outcome.md` → `## Fails before` before the review.
- Reply: `rebuild-reviewer` with the ticket, `node_modules/.rebuild-review/R-035.diff` and `taste.md`;
  `review-guard.mjs compare` → "unchanged", exit 0; `review-verdict.mjs` → "consistent", exit 0.
- Verdict: **PASS**. AC-1–AC-9 met (AC-6–AC-8 on the records); five notes.

| # | Finding (short) | Decision |
|---|---|---|
| 1 | note · proven: once the diagnosis's advisory reaches a session, the receipt `_advisory.<session>` blocks every later advisory of the job, so a `tool stall observation uncertain` advisory after the start no longer reaches that coordinator; Decision 6 missed the receipt (`hook/wake.ts:552-555`, `src/runtime/wrapper.ts:286-291`) | no change in this ticket: the one receipt per job and session is deliberate (the stall's reasons alternate every few seconds, `src/runtime/wrapper.ts:282-283`), so a fix gives the advisory a source or changes the hook's receipt rule, outside `## Change`; R-036 rewrites the stall's measurement in this stage; Q-43 (`.night/questions.md`) and an open point for gate 5.3 |
| 2 | note · observed: unit names read from the user manager's cgroup tree go unquoted into the diagnosis, the advisory and the coordinator's wake sentence, and a job can name a unit (`systemd-run --user --unit=…`), so text a job chose sits inside Limen's own sentence, not marked as data (`src/platform/linux.ts:438`, `src/runtime/queue-diagnosis.ts:71`, `src/job/wake-text.ts:153`) | fix (F1): untrusted text in a prompt (z. 15, priority 1) |
| 3 | note · proven: T-29 (3): the alerts test checks the queue line, a wait with no diagnosis and the summary's count per kind; the `userUnits` test checks a process outside a user manager and a manager with no folder (`test/seat/alerts.test.ts:195`, `test/platform/linux.test.ts:161`) | fix (F2) |
| 4 | note · proven: the start-queue diagnosis test asserts the full ranking text, so a format change of `usageText` fails it too, which `test/runtime/queue-diagnosis.test.ts` covers (`test/runtime/start-queue.test.ts:124`) | fix (F3): one reason per test (T-29 (3)) |
| 5 | note · proven: the rewrapped header of `src/platform/linux.ts:5-7` leaves a broken short line, and the start-queue comment block the diff extends still cites a person's decisions 85 (a) and 99 and says "machine" and "plant" (T-21 (3), T-30 (4), T-18) (`src/runtime/start-queue.ts:39-43`) | fix (F4); the "plant" of `templates/agents.md:80` stays, since the role prompts' wording is stage 4's rewrite |

Taste answers: T-29 mostly yes, with findings 3 and 4; T-30 yes for the new comments, with finding 5; T-40 no step
waits for the owner; T-41 no command added; T-14 yes; T-18 yes, with finding 5.

Fixes (for a fresh implementer, `ticket.md` → `## Decisions`; the first round of fixes): F1–F4.

## Round 2 (2026-11-23, night, run 3 of `night.mjs`)

- Before: run 2 ended on the 5-hour limit while the first fix implementer ran; run 3's `compare --git` on its snapshot
  (`R-035-fix1.git`) → "within its limits", exit 0. After a new snapshot (`R-035-fix1b.git`, the main session had
  changed `plan.md`, D-035), a fresh implementer found F1–F4 complete in the tree and changed only `outcome.md`;
  `compare --git` → "within its limits", exit 0. The main session's `gate.mjs` → exit 0, 926 tests, 926 pass, 0 fail;
  `fails-before.mjs` → exit 0 (the same nine files fail at `HEAD` `34a40d0`), recorded in `outcome.md`.
- Reply: a fresh `rebuild-reviewer` with the ticket, `node_modules/.rebuild-review/R-035-r2.diff` and `taste.md`;
  `review-guard.mjs compare` → "unchanged", exit 0; `review-verdict.mjs` → "consistent", exit 0.
- Verdict: **PASS**. AC-1–AC-9 met (AC-6–AC-8 on the records); three notes.

| # | Finding (short) | Decision |
|---|---|---|
| 1 | note · observed: F1 is made (`src/runtime/queue-diagnosis.ts:38`, `:79`); its failure before the change is shown by reading round 1's code in the reviewed diff, not by a run, since at `HEAD` the test fails at the new module's import | no change: the module is new in this ticket and round 1's code was never committed, so no command on the list runs the new tests against it; the main session checked the unquoted form in `R-035.diff` (`outcome.md` → `## Round 1 fixes`), and the gap is written there |
| 2 | note · observed: F2 is made; the split-off test "has no diagnosis yet sends nothing" fails at `HEAD` only because `HEAD` refuses the unknown `queueWait` field | no change: as the reviewer says, a negative test of a new event has nothing else to fail on before the event exists |
| 3 | note · observed: F3 and F4 are made | no change |

Taste answers: T-29 yes; T-30 yes; T-40 no step waits for the owner; T-41 no command added; T-18 yes for the F4
block; T-14 yes.

No fixes; the review is closed.
