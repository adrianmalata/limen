<!-- PL: Recenzje ticketu R-027 (żniwiarz kończy scope joba przed zapisem `failed`). Runda 1 (noc 22/23.11): pierwsza
odpowiedź odrzucona przez `review-verdict.mjs` za formę (punkty pod AC-9), druga (świeży recenzent) PASS z pięcioma
uwagami. Do pierwszej rundy poprawek idą: błąd nieudanego TERM widoczny w linii żniwiarza (T-01), podział testu
głuchego silnika na dwa mechanizmy (T-29) i jedna definicja 1 s czekania po KILL (T-25); domyślna decyzja nocna 2
(rekord bez scope i bez czasu startu) czeka na potwierdzenie Adriana, a reguła `deactivating`, TERM do własnego scope
i nazwa jednostki z rekordu idą do otwartych punktów bramki. Runda 2: PASS z jedną uwagą o brzmieniu („ended after
TERM” przy nieudanym wywołaniu TERM), bez zmiany kodu. Stan: recenzja zamknięta. -->

# R-027 review

## Round 1 (2026-11-22, night, run 1 of `night.mjs`, started 21:10)

- Before: the implementer's run → `review-guard.mjs compare --git` "within its limits", exit 0; the main session's
  `gate.mjs` → exit 0, 844 tests, 844 pass, 0 fail (tsc and Biome first, in `npm run check`); `fails-before.mjs` →
  exit 0 (six files fail at `HEAD` `cda9da5`), recorded in `outcome.md` → `## Fails before` before the review.
- First reply: `rebuild-reviewer` with the ticket, `node_modules/.rebuild-review/R-027.diff` and `taste.md`;
  `review-guard.mjs compare` → "unchanged", exit 0; `review-verdict.mjs` → exit 1, rejected for its form: four bullet
  lines below AC-9.
- Second reply: a fresh `rebuild-reviewer` with the same three paths, told the form; `review-guard.mjs compare` →
  "unchanged", exit 0; `review-verdict.mjs` → "consistent", exit 0.
- Verdict: **PASS**. AC-1–AC-9 met (AC-7 and AC-8 on the main session's and the implementer's records, since the
  reviewer runs neither the gate nor `check.mjs`); five notes.

| # | Finding (short) | Decision |
|---|---|---|
| 1 | note · observed: for a record without `scope` whose pid has no start time and is held by a live process, the job stays `running` instead of being reaped as `HEAD` did, which narrows `## Decisions` 4; the moved `pid-only` record got a scope (`src/runtime/reap.ts:245-249`; `outcome.md` → Night default 2) | no code change: it is (b) 4's "its state cannot be read" (no group the reaper cannot attribute is signalled, z. 14, and no `failed` is written while a process that may be the wrapper lives, A-005); a night default for Adrian to confirm (`ticket.md` → `## Decisions`) |
| 2 | note · proven: when the scope's TERM call fails, its error is dropped once the next state read or the KILL decides the ending; the line then says `ended after KILL` with no trace of the TERM's failure (T-01) (`src/runtime/reap.ts:198-212`) | fix (F1) |
| 3 | note · observed: the deaf-engine test checks two mechanisms, the KILL after the grace and the readings taken before the TERM kept in the record; only the first fails at `HEAD` (T-29 (3)) | fix (F2): split into one test per mechanism |
| 4 | note · guessed: `is-active` exit 3, kept from R-026, also covers a `deactivating` scope, which may still hold processes; the ticket's (a) prescribes today's rule (`src/platform/linux.ts:314`) | no change in this ticket ((a): "by the rules `endScope` uses today"); an open point for gate 5.3 (`outcome.md` → Open points), next to R-032's note on the paths that trust a scope's end |
| 5 | note · observed: `stopGraceMs() - 500` puts a stop's Herdr deadline in the past when the knob is 500 ms or less; only the exhaustion test sets the knob (200), and that path skips the line (`src/runtime/wrapper.ts:73-74`) | no change: the knob is of kind `test`, no stop test sets it, and R-028 changes the stop's path and the grace (10 s); an open point for R-028's implementer (`outcome.md` → Open points) |

The first, rejected reply had four findings the second does not repeat; the main session read each in the code and
adds them (`src/runtime/reap.ts:16-18`, `:169-181`, `src/job/stopping.ts:104-107`, `src/job/record.ts:220`):

| # | Finding (short) | Decision |
|---|---|---|
| A | note · guessed: a reaper that runs inside the reaped job's own scope (an engine whose wrapper was killed alone runs `limen show`) gets its own TERM before any write, so the job stays `running` until another reaper runs; `HEAD` wrote `failed` first | no change: no terminal state is written while the scope lives (AC-9), the wake hook's tick or the next command reaps it, and R-032 moves reaping into the seat's sweep, outside every job scope (T-04); an open point for gate 5.3 |
| B | note · proven: the 1 s wait after a KILL has two definitions, `KILL_WAIT_MS` in `src/runtime/reap.ts` and the literal `1_000` in `src/job/stopping.ts:107` (T-25 (1)) | fix (F3) |
| C | note · observed: the reaper signals the unit that `record.json` names, which the job's own account can write, and the validator accepts any `.scope` name; `HEAD`'s finisher already sent SIGKILL to that unit, so the exposure is not new | no change in this ticket: the field and its validator are R-026's, and the exposure is `HEAD`'s; an open point for gate 5.3 (by its mechanism and place only) |
| D | note · observed: the s9 test's new engine-dead assertion passes at `HEAD`, since R-026's finisher ends the scope before `limen show` returns; s9 fails before only on the detail, and the order A-005 asks for is shown by `test/runtime/reap.test.ts` | no change: `outcome.md` → `## Fails before` says so; the s9 assertion is the regression guard A-005's Decision names ("Test `s9` asserts the engine is dead") |

The first reply also noted that the killed-alone test checks the order and the detail's words together (T-29 (3)):
no change, since `## Change` (e) asks for that test in that form ("then ends `failed` with the checks in its log line").

Taste answers (second reply): T-29 partly (finding 3); T-30 yes; T-40 no step waits for the owner. The first reply's
T-14: the changed line of `templates/agents.md:202` is literal.

Fixes (for a fresh implementer, `ticket.md` → `## Decisions`; the first round of fixes): F1–F3.

## Round 2 (2026-11-22, night, run 1 of `night.mjs`)

- The first round of fixes: a fresh implementer (`DONE`; F1–F3, F3 also in `src/job/spawning.ts`'s failed handshake,
  the other literal wait after a KILL in `src/`); `compare --git` → "within its limits", exit 0.
- Before: the main session's `gate.mjs` → exit 0, 846 tests, 846 pass, 0 fail; `fails-before.mjs` → exit 0 (the same
  six files), recorded in `outcome.md` → `## Fails before`.
- Reply: a fresh `rebuild-reviewer` with the three paths; `review-guard.mjs compare` → "unchanged", exit 0;
  `review-verdict.mjs` → "consistent", exit 0.
- Verdict: **PASS**. AC-1–AC-9 met (AC-7 and AC-8 on the records); one note.

| # | Finding (short) | Decision |
|---|---|---|
| 1 | note · proven: when the scope's SIGTERM call fails and the state read after it finds the scope gone, the detail reads `scope <unit> ended after TERM; SIGTERM failed: …`, an ending "after TERM" for a TERM the call reports as not sent; the failure is named as F1 requires, only the words could mislead (`src/runtime/reap.ts:198-210`) | no change: the line names the failed call beside the ending, which is what T-01 asks; a change of the words is code and would need a third round for a rare case (a `systemctl kill` that fails while the scope ends anyway); an open point for gate 5.3 (`outcome.md` → Open points) |

Taste answers: T-29 yes for F1's and F2's tests (the killed-alone test's form kept, as in round 1); T-30 yes; T-40 no
step waits for the owner; T-14 the line of `templates/agents.md:202` is literal.

The review is closed: PASS in rounds 1 and 2, one round of fixes.
