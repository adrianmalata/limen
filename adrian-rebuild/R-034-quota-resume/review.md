<!-- PL: Recenzja ticketu R-034 (wznowienie joba po limicie subskrypcji jako krok `limen seat sweep`). Runda 1 (24.11,
w dzień): pierwsza odpowiedź odrzucona przez `review-verdict.mjs` za formę, druga FAIL tylko na AC-9 (brak wyniku
`fails-before.mjs` w `outcome.md`), z siedmioma uwagami; sesja główna łączy je z sześcioma uwagami odrzuconej odpowiedzi
i kieruje do poprawki F1–F12 (`ticket.md` → `## Decisions`), w tym alert z D-100 i pełne D-097 (5) (h). Runda 2:
PASS (po jednej odpowiedzi odrzuconej za formę), trzy uwagi i cztery z odrzuconej odpowiedzi; G1–G3 idą do ostatniej
rundy poprawek. Runda 3: PASS z dwiema uwagami; jedna trafia do otwartych punktów `outcome.md` (D-092), druga nie
wymaga działania. Stan: recenzja zamknięta. -->

# R-034 review

## Round 1 (2026-11-24, by day, `limen-rebuild-29`)

- Before: the implementer's run → `review-guard.mjs compare --git` exit 1 (the deletion written in one span with
  spaces, D-099 (1)), then, after (h) was corrected and a new `snapshot --git`, "within its limits", exit 0; the main
  session's `gate.mjs` → exit 0, 1055 tests, 1055 pass, 0 fail (259.7 s); `fails-before.mjs` → exit 0 (at `HEAD`
  `09ca25e`; its first line was not recorded, hence the blocking finding).
- First reply: `rebuild-reviewer` with the ticket, `node_modules/.rebuild-review/R-034.diff` and `taste.md`;
  `review-guard.mjs compare` → "unchanged", exit 0; `review-verdict.mjs` → exit 1 (AC-12 over five bullet lines, one
  finding without its evidence field), so the reply was rejected and a fresh reviewer replied with the tree unchanged.
  Its notes are kept below as A–F.
- Second reply: the same three paths; `compare` → "unchanged", exit 0; `review-verdict.mjs` → "consistent", exit 0.
- Verdict: **FAIL**. AC-1–AC-8 and AC-10–AC-12 met (AC-10 and AC-11 on the records, AC-12 judged); AC-9 not met; one
  blocking finding and seven notes.

| # | Finding (short) | Decision |
|---|---|---|
| 1 | blocking · proven · AC-9: `outcome.md` → `## Fails before` lacks the output of `fails-before.mjs` (`outcome.md:127`, `:134-164`) | fix (F1): the main session records its run's first line after the fixes |
| 2 | note · observed: the sweep's newest-record check runs before validate and outside the lock; validate's held read never requires the newest record to be the parent, so a continuation published and ended in between lets a second resume start (`src/runtime/resuming.ts:71-76`, `src/job/continuation.ts:473`) | fix (F2): the parent is the expected newest record under the jobs lock (D-097 (5) (d)) |
| 3 | note · observed: no test drives two continuations through the window between validate and apply (`STATE_CHANGED`) | fix (F3) |
| 4 | note · proven · T-29: the `quotaAttempt` cap test passes at `HEAD` but for its load error (`test/job/record.test.ts:418`) | fix (F4) |
| 5 | note · observed · T-29: `test/hook/wake.test.ts` fails at `HEAD` only at load, so the owed-wake test never fails on its mechanism | fix (F5), with note A |
| 6 | note · observed · T-29 (2), (3): seven exclusions of three mechanisms in one test (`test/runtime/resuming.test.ts:84`); two identifiers in one name (`:188`) | fix (F6) |
| 7 | note · observed: a `quota` job with a known reset whose resume fails at every run is neither resumed nor alerted; one damaged record refuses every `limen continue` of its project | the alert: fix (F8, D-100, Adrian); the `continue` refusal: rejected, an unreadable record may be a live job on the worktree (z. 14), as spawn |
| 8 | note · observed: until R-059 a `null` reset's wake says Limen resumes the job, while nothing does (`src/job/wake-text.ts:113-116`) | for gate 5.3: D-097 (5) (b), (i) settled the mechanism; the words are Decision 3's |
| A | (first reply) note · observed · T-29 (3): one hook test covers four mechanisms (`test/hook/wake.test.ts:299`) | fix (F5) |
| B | (first reply) note · observed: only completion wakes are owed, while D-097 (5) (h) says a limit turn spends neither attempt (`hook/wake.ts:726`) | fix (F7): every wake family, since each claim lies in its job's folder |
| C | (first reply) note · observed: (k)'s "each failing before" does not hold for the hook test that a coordinator's own limit turn wakes nothing (`test/hook/wake.test.ts:346`) | rejected: it asserts an absence `HEAD` has and guards the new code against a false owed wake; `outcome.md` says so |
| D | (first reply) note · observed · T-18: the run's lines say "quota limit", the task and wake "subscription limit" (`src/runtime/resuming.ts:97`) | fix (F9); the help's "quota jobs" names the kind and stays |
| E | (first reply) note · observed · T-10: `templates/agents.md:68` copies `AFTER_RESET_MS` and `QUOTA_RESUMES` by hand | fix (F10): the template states no number |
| F | (first reply) note · proven: the exit-code table names `NO_LINGER` but not `NO_PATH` (`docs/commands.md:19`) | fix (F11) |
| T-30 | (second reply) the headers of `src/runtime/resuming.ts:1-9` and `src/job/quota.ts:1-5` say what, restating D-097 (5) | fix (F12) |
| — | (first reply) process note: test output in the session's scratchpad, outside the tree | no action: `compare` unchanged |

Taste answers (second reply): T-14 yes; T-18 yes ("quota jobs" names the kind); T-29 yes but for notes 4–6; T-30 mostly
yes (the two headers); T-40 no new owner touchpoint; T-41 no command added.

Fixes F2–F12 go to the resumed implementer (`ticket.md` → `## Decisions`, round 1); F1 is the main session's; review
round 2 checks them.

## Round 2 (2026-11-24, by day, `limen-rebuild-29`)

- Before: the implementer's fixes → `review-guard.mjs compare --git` "within its limits", exit 0; the main session's
  `gate.mjs` → exit 0, 1067 tests, 1067 pass, 0 fail (249.6 s); `fails-before.mjs` → exit 0, fourteen files, its first
  line in `outcome.md` → `## Fails before` (F1).
- First reply: `review-guard.mjs compare` → "unchanged", exit 0; `review-verdict.mjs` → exit 1 (AC-10 "met on the
  record" with no colon after `met`, AC-12 over bullet lines, one finding without its evidence field), so the reply was
  rejected and a fresh reviewer replied with the tree unchanged. Its notes are kept below as A–D.
- Second reply: `compare` → "unchanged", exit 0; `review-verdict.mjs` → "consistent", exit 0.
- Verdict: **PASS**. AC-1–AC-12 met (AC-10 and AC-11 on the records, AC-12 judged); three notes; no blocking finding.

| # | Finding (short) | Decision |
|---|---|---|
| 1 | note · proven · T-30 (2): four new comments cite a bare "Decision 4", which resolves to nothing once R-034 is closed (`src/runtime/resuming.ts:108`, `test/runtime/resuming.test.ts:203`, `:218`, `:259`) | fix (G1): "R-034 Decision 4" |
| 2 | note · observed: Decision 5 and `## Change` (e) still say "the finished job", while F7 owes the wakes of a running job too (`ticket.md:128`, `:238`) | fix, by the main session in `ticket.md` (F7's reading) |
| 3 | note · observed: an owed completion wake released after the resume ran names a resume time already past (`src/job/wake-text.ts:113`, `:127-135`) | for gate 5.3, with Decision 3's words: `outcome.md` → `## Open points`; the guidance ("do not continue it") holds |
| A | (first reply) note · observed · T-29: the hook's held and delivered tests fail at `HEAD` on the damage note, not on the hold; the first test's name claims two things (`test/hook/wake.test.ts:348`, `:358`) | the failure at `HEAD`: rejected, a record with a new field reads as damaged at `HEAD`, which no test can avoid (the second reply's T-29 answer); the name: fix (G2) |
| B | (first reply) note · observed: `test/job/continuation.test.ts` fails at `HEAD` at load and drives the two halves, not `startContinue` | rejected: the split is the only outside hold of the window between validate and apply, named in `outcome.md` → Deviations 6 |
| C | (first reply) note · observed · T-27 (1): `observe` and `limenWake` change and keep their "split pending" suppressions (`hook/wake.ts:92`, `:649`) | to R-082's ratchet, as R-002 and R-100: `outcome.md` → `## Open points`, by the main session |
| D | (first reply) note · guessed: `limitEnd` is cleared only at `agent_settled`, not at `session_start` or `session_shutdown`, so a session that ends between a limit `message_end` and `agent_settled` would owe the next run's wakes on a stale reset (`hook/wake.ts:1020`, `:918-919`) | fix (G3): cleared with the delivery maps, with a test |

Taste answers (second reply): T-14 yes; T-18 yes; T-19 yes; T-29 yes (a new field fails at `HEAD` on its reading);
T-30 mostly yes (note 1); T-40 no new owner touchpoint; T-41 no command added.

G1–G3 change code and tests, so they get the last round of fixes (D-053 (2)) and review round 3.

## Round 3 (2026-11-24, by day, `limen-rebuild-29`)

- Before: the implementer's fixes → `review-guard.mjs compare --git` "within its limits", exit 0; the main session's
  `gate.mjs` → exit 0, 1068 tests, 1068 pass, 0 fail (243.9 s); `fails-before.mjs` → exit 0, the same fourteen files.
- Reply: `review-guard.mjs compare` → "unchanged", exit 0; `review-verdict.mjs` → "consistent", exit 0.
- Verdict: **PASS**. AC-1–AC-12 met (AC-10 and AC-11 on the records, AC-12 judged); two notes; no blocking finding.

| # | Finding (short) | Decision |
|---|---|---|
| 1 | note · observed: two new test comments cite "review round 1, F7" and "review round 2, G3" without "R-034" (`test/hook/wake.test.ts:334`, `:375`); the repository's precedents do the same (`test/seat/alerts.test.ts:379`, `:436`) | the rounds of fixes are spent and the note needs a test edit: `outcome.md` → `## Open points` (D-092) |
| 2 | note · observed · T-29 (3): the G3 test's name makes two claims, while it fails for one reason in each before-state (`test/hook/wake.test.ts:377-400`) | no action: the reviewer's own T-29 answer is yes, since each before-state fails on one claim |

Taste answers: T-14 yes; T-18 yes; T-29 yes; T-30 yes but for note 1; T-40 no new owner touchpoint; T-41 no command
added. The review is closed.
