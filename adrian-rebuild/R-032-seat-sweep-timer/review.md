<!-- PL: Recenzja ticketu R-032 (`limen seat sweep` na timerze użytkownika; polecenia odczytu niczego nie zapisują).
Runda 1 (24.11, w dzień): PASS bez znalezisk blokujących, dziesięć uwag i jedna uwaga do słownictwa pomocy (T-18).
Sesja główna kieruje do poprawki dziewięć rzeczy (F1–F9 w `ticket.md` → `## Decisions`): jeden instalator plików
unitów, testy brakujących ścieżek, menedżer użytkownika z własnego uid, odczyt cgroupu w bramce wdrożenia, przebieg,
którego nie zatrzymuje jeden uszkodzony rekord, deklarację `systemd-analyze` oraz tekst; uwagę o szerokości linii
`limen status` odrzuca, bo niesie ją R-073. Runda 2: PASS, F1–F9 zrobione; cztery nowe uwagi idą do ostatniej
rundy poprawek (G1–G4: tekst `CONTRIBUTING.md`, dokończenie `--uninstall`, dwa testy T-29, cichy odczyt kolejki na
ścieżce sweepu). Runda 3: PASS, G1–G4 zrobione; trzy uwagi idą do notatek R-082 i R-101 oraz do otwartych punktów
`outcome.md` (D-092). Stan: recenzja zamknięta. -->

# R-032 review

## Round 1 (2026-11-24, by day, `limen-rebuild-28`)

- Before: the implementer's run → `review-guard.mjs compare --git` "within its limits", exit 0; the main session's
  `gate.mjs` → exit 0, 1015 tests, 1015 pass, 0 fail (295.3 s); `fails-before.mjs` → exit 0 (the main session's run at
  `HEAD` `8b1ec4c`; the implementer's first line is in `outcome.md` → `## Fails before`).
- Reply: `rebuild-reviewer` with the ticket, `node_modules/.rebuild-review/R-032.diff` and `taste.md`;
  `review-guard.mjs compare` → "unchanged", exit 0; `review-verdict.mjs` → "consistent", exit 0.
- Verdict: **PASS**. AC-1–AC-13 met (AC-11 and AC-12 on the records, AC-13 judged); ten notes and one T-18 remark; no
  blocking finding.

| # | Finding (short) | Decision |
|---|---|---|
| 1 | note · proven · T-25 (1): the unit-file install policy (read, write what differs, verify, put back) is in two modules under the same names (`src/platform/systemd-units.ts:180,192,203`, `seat/alerts.ts:731,743,761`) | fix (F1): one policy, one module (T-25 (1)); the alerts import it |
| 2 | note · proven · T-10: the `Jobs the sweep cannot end` line exceeds 100 characters for a real job (`src/project/summary.ts:247`) | rejected for R-032: `limen status` lines already exceed 100, and R-073 carries T-10 for `limen status` (as R-029 round 1, note 1) |
| 3 | note · proven: `docs/commands.md:24` names nine commands of `operationHandler`, without `abandon` (already at `HEAD`) and `seat sweep` | fix (F2): the line names every command through the runner |
| 4 | note · proven: `outcome.md` → `## Fails before` misstates why the T-04 read test and the import scan fail at `HEAD` | fix (F3): `outcome.md` states each reason as the reviewer found it |
| 5 | note · observed: no test tells the start queue's removal once per run from once per project; none asserts `stuck` for a failed step-2 attempt or for a record with no scope whose pid has no start time | fix (F4): (a) 4 and (b) name these mechanisms, so each gets a test that fails without it (T-29) |
| 6 | note · guessed: `userManagerOf` takes the session slice's uid, not the process's own; a missing manager folder lists `[]`, so `NO_USER_MANAGER` is not named and `stuck` of finished jobs is cleared from an empty listing (`src/platform/linux.ts:458-459`, `:479-482`) | fix (F5): a wrong or missing manager must not pass as "no leftover scope" (a silent false success, T-01, z. 14) |
| 7 | note · guessed: the deployment gate runs as root, and `holdsProcesses` asks root's user manager, which reads an agents' scope as `inactive`, so the gate misses a live engine (`src/runtime/reap.ts:117-125`) | fix (F6): (c) is for that gate; the answer must not depend on the caller's user manager |
| 8 | note · observed: one damaged or unmigrated record ends its project's run every minute (`src/runtime/reap.ts:133-135`); a failed coordinator removal skips the ring | fix (F7): one record or step that fails is named and does not stop the others (z. 10, the ticket's own rule for projects) |
| 9 | note · proven · T-27: a doc comment of 204 characters (`seat/deploy.ts:282`) | fix (F8): rewrapped within 120 |
| 10 | note · observed · T-12: `systemd-analyze`, which `--install` runs, is not a declared system requirement (`src/platform/requirements.ts:127-133`) | fix (F9): declared and checked as T-12 (2) says |
| T-18 | the summary's "unheard ends" is a coined phrase (`src/registry.ts:740`; not at `HEAD`) | fix (F9, text): plain words |

Taste answers: T-14 yes; T-18 yes but for the phrase above; T-19 yes; T-29 mostly yes (the two exceptions are notes 4
and 5); T-30 yes; T-40 no new owner touchpoint (lingering is a seat step); T-41 yes.

Fixes F1–F9 go to the resumed implementer (`ticket.md` → `## Decisions`, round 1); review round 2 checks them.

## Round 2 (2026-11-24, by day, `limen-rebuild-28`)

- Before: the implementer's run → `review-guard.mjs compare --git` "within its limits", exit 0; the main session's
  `gate.mjs` → exit 0, 1027 tests, 1027 pass, 0 fail (270.7 s); `fails-before.mjs` → exit 0, first line: twenty files
  "fail at HEAD (exit 1)", the same set as `outcome.md` → `## Fails before`.
- Reply: a fresh `rebuild-reviewer` with the same three paths; `review-guard.mjs compare` → "unchanged", exit 0. The
  first reply was rejected by `review-verdict.mjs` on form (exit 1: the lines of AC-10–AC-13 read "met on the record:"
  and "met (judgment):"); the same reviewer sent it again in the fixed form, unchanged in substance, and the tree was
  still unchanged (`compare` exit 0); `review-verdict.mjs` → "consistent", exit 0.
- Verdict: **PASS**. AC-1–AC-13 met (AC-10–AC-12 on the records, AC-13 judged); F1–F9 done (nine notes that confirm
  them) and four new notes; no blocking finding.

| # | Finding (short) | Decision |
|---|---|---|
| F1–F9 | note · proven: each fix of round 1 done, with its evidence | confirmed |
| 10 | note · proven: `CONTRIBUTING.md:19` still lists `sweep` among the commands whose entry has `movedBy` | fix (G1): text that became false (j) |
| 11 | note · proven · T-38 (3): a second `--uninstall` after a failed reload finds no file and returns without the reload (`src/platform/systemd-units.ts:193-196`) | fix (G2): a rerun finishes the step left undone |
| 12 | note · observed · T-29: `test/cli/sweep.test.ts:216` is named "once per run" but cannot tell it from once per project; `:444` tests the first install and the idempotent second one together | fix (G3): each test checks one mechanism under a name that says it |
| 13 | note · observed · T-01: `removeDeadEntries` keeps the catch-all `readdir(folder).catch(() => [])`, so the sweep reads an unreadable start-queue folder as empty and says nothing (`src/runtime/start-queue.ts:595`; at `HEAD` in `liveEntries`) | fix (G4) on the sweep's path, which this ticket made: only a missing folder is an empty queue; the read paths' catch-all stays for R-082 (swallowed errors reach zero) |

Taste answers: T-14, T-18, T-19 yes; T-29 mostly yes (note 12); T-30 mostly yes; T-40 no; T-41 yes.

Fixes G1–G4 are the second and last round of fixes (`ticket.md` → `## Decisions`, round 2); review round 3 checks
them, and a note of round 3 that needs code goes to the notes of the ticket that rewrites that part (D-092).

## Round 3 (2026-11-24, by day, `limen-rebuild-28`)

- Before: the implementer's run → `review-guard.mjs compare --git` "within its limits", exit 0; the main session's
  `gate.mjs` → exit 0, 1030 tests, 1030 pass, 0 fail, 0 skipped (264.4 s); `fails-before.mjs` → exit 0, first line:
  the same twenty files "fail at HEAD (exit 1)".
- Reply: a fresh `rebuild-reviewer` with the same three paths; `review-guard.mjs compare` → "unchanged", exit 0;
  `review-verdict.mjs` → "consistent", exit 0.
- Verdict: **PASS**. AC-1–AC-13 met (AC-10–AC-12 on the records, AC-13 judged); G1–G4 done (four notes that confirm
  them) and three new notes; no blocking finding. The rounds of fixes are spent, so the notes that need code go to
  the tickets that rewrite those parts, or to `outcome.md` → `## Open points` where none does (D-092).

| # | Finding (short) | Decision |
|---|---|---|
| G1–G4 | note · proven: each fix of round 2 done, with its evidence | confirmed |
| 5 | note · observed · T-01: on the sweep's path each start-queue entry file is still read with `readFile(...).catch(() => undefined)`, so an entry the sweep cannot read is neither removed nor named (`src/runtime/start-queue.ts:607`) | to R-082's notes (swallowed errors reach zero), as the reviewer proposes |
| 6 | note · guessed: `--uninstall`'s tolerance of a failed disable reads `userUnitState(timer, "is-active")`, undefined both for `inactive` and for a failed probe; a timer whose file was removed by hand while it runs stops every rerun at the disable (`src/platform/systemd-units.ts:197-200`) | to `outcome.md` → `## Open points`: no planned ticket rewrites the installer |
| 7 | note · observed · T-29: the G4 test also asserts that the dead job is reaped, which G4's step cannot make fail; the renamed queue test registers a second project that no assertion reads (`test/cli/sweep.test.ts:374`, `:219`) | to R-101's notes: R-101 adds its daily steps to the sweep and rewrites these tests |

Taste answers: T-14, T-18, T-19 yes; T-29 mostly yes (note 7); T-30 yes; T-40 no; T-41 yes.

The review is closed: three rounds, two rounds of fixes, PASS in each.
