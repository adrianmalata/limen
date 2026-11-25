<!-- PL: Recenzja ticketu R-102 (wycięcie reguł seata; odmowy hooka koordynatora w plikach `.limen/refusals/`), noc
24/25.11, przebieg 2. Runda 1: odpowiedź przyjęta przez `review-verdict.mjs` za pierwszym razem, FAIL na jednym
znalezisku blokującym (testy hooków zapisują pliki odmów do `.limen/refusals/` samego repo, poza folderem tymczasowym)
i czterech uwagach; poprawki F1–F5 w `ticket.md` → `## Decisions`. Runda 2: PASS z pięcioma uwagami; poprawki G1–G2
(ostatnia runda poprawek), jedna uwaga odrzucona, jedna do punktów otwartych, jedną tekstową poprawiła sesja główna.
Runda 3 (w dzień, po przerwaniu nocnej przez limit 5 h): PASS z dwiema uwagami, jedna do punktów otwartych, jedną
tekstową poprawiła sesja główna. Stan: zamknięte. -->

# R-102 review

## Round 1 (2026-11-25, the night of D-102, run 2)

- Before: the implementer's run → `review-guard.mjs compare --git` → "within its limits", exit 0; the main session's
  `gate.mjs` → exit 0, 1182 tests, 1182 pass, 0 fail (277.7 s); `fails-before.mjs` → exit 0 at `HEAD` `b489760` (15
  files in one run).
- Reply: `rebuild-reviewer` with the ticket, `node_modules/.rebuild-review/R-102.diff` and `taste.md`;
  `review-guard.mjs compare` → "unchanged", exit 0; `review-verdict.mjs` → "consistent", exit 0.
- Verdict: **FAIL**. AC-1–AC-9 met (run in the review), AC-10–AC-12 on the records, AC-13 judged met; one blocking
  finding, four notes.

| # | Finding (short) | Decision |
|---|---|---|
| 1 | blocking · proven: the test suite writes refusal files into the checkout's own `.limen/refusals/` on every run: `test/hook/wake.test.ts:35-43` (`LIMEN_JOB` "", args `["on"]`) and `test/hook/group-peer.test.ts:26-32` (a `tool_call` with no `toolName`) reach `keepRefusal`, which writes into `process.cwd()` (`src/runtime/pi-api.ts:467-470`), and the repository root is a project (`.agents/limen/styleguide.md`); at `HEAD` the write needed a registration folder of this pid | fix (F1); checked by the main session: `.limen/` at the repository root (ignored by `.gitignore:4`) was created at 07:05:26.928 and holds six files in pairs of 07:05, 07:14 (the implementer's gate runs) and 07:21 (the main session's gate run); `rm` is denied to the sessions, so Adrian removes that folder (`outcome.md` → Open points) |
| 2 | note · guessed: `removeDeadRefusals` calls `rm(path, { force: true })` without `recursive`, so a directory named `<dead pid>-<n>.json` fails the step on every minute's run, while `limen status` treats that directory as a `BAD_DATA` entry (`src/integrations/coordinator-refusals.ts:73-74`, `test/cli/status.test.ts:463`) | fix (F2): the step takes only regular files, as the readers agree |
| 3 | note · observed: a `.limen/refusals` that is itself a regular file or cannot be read makes `folderNames` rethrow, so the whole `limen status` fails instead of one `BAD_DATA` line (`src/integrations/coordinator-refusals.ts:131-137`); `HEAD` did the same for `.limen/coordinators` | fix (F3): the ticket's (d) asks that a bad entry is its own line and the rest prints; the folder is one more such entry, and a sweep step on it fails as a named step |
| 4 | note · observed · T-29 (3): the rewritten s3 test still checks the start notice, the timeout counted from the engine's start and a queued stop finalized once beside the gate's priority order (`test/s3-finish-wake.test.ts:234-286`), where `## Change` (f) says it "keeps only the gate's priority order" (Deviation 6) | fix (F4): one mechanism per test, as R-101's F2 did for its s9 test |
| 5 | note · observed: a header comment line of `src/runtime/sweeping.ts:10` runs to about 145 characters | fix (F5) |

Taste answers: T-14 yes (two paragraphs of `templates/agents.md` go, nothing added); T-18 no help line added, the four
`rule` lines leave the generated help; T-29: finding 4; T-30 yes; T-40 no new owner step; T-41 not applicable.

## Round 2 (2026-11-25, the night of D-102, run 2)

- Before: a fresh `rebuild-implementer` made F1–F5 (after a new `snapshot --git`, D-035) → `review-guard.mjs compare
  --git` → "within its limits", exit 0; the main session's `gate.mjs` → exit 0, 1188 tests, 1188 pass, 0 fail
  (431.9 s), with no new file in the checkout's `.limen/refusals/`; `fails-before.mjs` → exit 0 at `HEAD` `b489760` (19
  files in one run).
- Reply: a fresh `rebuild-reviewer` with the same three paths; `review-guard.mjs compare` → "unchanged", exit 0;
  `review-verdict.mjs` → "consistent", exit 0.
- Verdict: **PASS**. AC-1–AC-9 met (run in the review), AC-10–AC-12 on the records, AC-13 judged met; no blocking
  finding, five notes.

| # | Finding (short) | Decision |
|---|---|---|
| 1 | note · proven · T-30: a comment of `test/hook/wake.test.ts:56` still names the removed registration ("the hook neither registers the coordinator nor reads a job") | fix (G1): a test file, so a round (D-053 (2)), the ticket's second and last round of fixes |
| 2 | note · observed · T-29 (3): the s3 priority test also checks spawn's queued line ("3 ahead") and that a dead wrapper or a stopped job ahead blocks no start (`test/s3-finish-wake.test.ts:223`, `:230`, `:234`, `:241`) | rejected: both are the order the test names, who counts as ahead under a held gate and the position spawn reports for it; `HEAD`'s test held them, and F4 took out the three mechanisms outside the order |
| 3 | note · observed · T-29 (3): the first wake-hook test checks the guard's `BAD_DATA` refusal of the command's arguments and, by F1, the refusal's file in the temporary project, so it can fail for either (`test/hook/wake.test.ts:38-54`) | fix (G2): F1's assertion gets its own test |
| 4 | note · observed: the writer follows a link in place of `.limen/refusals` (`mkdir` recursive, then `atomicWrite` into the link's target), while both readers refuse that link as `BAD_DATA`, so such a refusal lands outside the project (`src/integrations/coordinator-refusals.ts:54-58`, `:155`); `HEAD`'s writer did the same for `.limen/coordinators` | not fixed here: `HEAD`'s behaviour, outside the ticket's (d), which lists the readers' rules; `outcome.md` → Open points 7 for gate 5.3 |
| 5 | note · observed: `## Fails before` describes the first line of the last 19-file run and does not quote it (`outcome.md:223-228`) | fixed as text by the main session: the line is quoted |

Taste answers of round 2: T-14, T-18, T-19 yes; T-29: findings 2 and 3; T-30: finding 1; T-40 no owner step waits
(Open point 5 holds up no ticket); T-41 not applicable.

## Round 3 (2026-11-25, by day, `limen-rebuild-31`)

- Before: the night's round 3 was cut by the 5-hour limit before its reply was saved, so it ran again (D-102 (4)):
  `review-guard.mjs compare --git node_modules/.rebuild-review/R-102.git <ticket.md>` → "within its limits", exit 0
  (G1–G2 by the night's fresh implementer count); the main session's `gate.mjs` → exit 0, 1189 tests, 1189 pass, 0
  fail (309.5 s), with no new file in the checkout's `.limen/refusals/`; `fails-before.mjs` → exit 0, the same 19 files.
- Reply: a fresh `rebuild-reviewer` with the three paths; `review-guard.mjs compare` → "unchanged", exit 0;
  `review-verdict.mjs` → "consistent", exit 0 (accepted at once).
- Verdict: **PASS**. AC-1–AC-9 and AC-12 met (run in the review), AC-10 and AC-11 on the records, AC-13 judged met; no
  blocking finding, two notes.

| # | Finding (short) | Decision |
|---|---|---|
| 1 | note · observed: outside the cut, a start-queue entry counts as live on its pid and its job folder's state alone, with nothing tying the folder to a registered project, so a process of the agents' account can hold other jobs' starts until their `failAfter`; already at `HEAD`, outside A-010's cut (`src/runtime/start-queue.ts:584`, `:621-631`, `:491`) | to `outcome.md` → Open points 9 (D-092: no ticket rewrites that part yet), for gate 5.3 |
| 2 | note · observed: two blank lines between the PL comment and the title of `ticket.md` (`:8-9`) | fixed as text by the main session |

Taste answers of round 3: T-14, T-18, T-19 yes; T-29 each changed mechanism's test fails for one reason; T-30 yes; T-40
no owner step waits; T-41 not applicable.
