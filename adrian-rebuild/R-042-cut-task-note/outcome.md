<!-- PL: Wynik R-042 (implementer i sesja główna, noc i dzień 26–27.11, przy `353c2bd`): mechanizm notatki zadania wycięty. Pierwsze
`finish` zapisuje wynik i kończy sesję, hooki nie dopisują nic do pierwszego promptu ani do steerów, `finalizeJob` nie
czyta już „Note check”, a każdy czytelnik pokazuje zadanie `done` jako zwykłe `done`; `openChecks` zostaje w rekordzie
wersji 1 jako historia, którą `limen show` wypisuje. Steer przy 80 % mówi każdej roli tylko to, co prawdziwe (D-121),
a `.agents/limen/reminders.md` jest pozostałością. Bramka 1365/1365, `check.mjs` i biome z kodem 0. Rundy poprawek:
komentarze dwóch narzędzi przebudowy nazywają `src/job/usage.ts` czytelnikiem formatu wpisu sesji, ale już nie
jedynym, bo plik sesji czyta też `src/picture/activity.ts` (F1, G1), a zadanie z timeoutem
w `test/s3-finish-wake.test.ts` jest recenzentem, więc wrapper, który pominie `record.role`, oblewa test (F2). -->

# R-042 outcome (draft)

## Done

1. Cut with `git rm`: `src/job/task-note.ts` and `test/u14-task-note.test.ts`. With them went the first-cue append and
   `recordNote` (`hook/communication.ts`, with the hook's `noteDir`/`noteSeen` state and its `jobFolder` helper), the
   steer appendix (`hook/steering.ts`: a steer is sent as its inbox text alone), the note carry of
   `src/job/continuation.ts` and the `carried` option of `NewJob` in `src/job/publication.ts` (its only use), and every
   read of `.agents/limen/reminders.md`.
2. `hook/finish.ts`: the first `finish` call writes `result` and shuts the session down; no check, no
   `agent_before_settle` handler, no `note check sent` line; the hook's parameter is `Pick<PiApi, "registerTool">`.
   `src/runtime/pi-api.ts` drops `agent_before_settle` from `PiEvents` and `PiApi`, `PiSettleEvent`, `PiSettleResult`,
   `PiMessageDraft`, `PiOutcome`, `PI_OUTCOMES`, the `passed` check and the guard `piSettleEvent`; `piEvent` takes any
   key of `PiEvents`. `test/runtime/pi-contract.test.ts` drops `CustomEntryDraft`, `CustomMessageEntryDraft`,
   `SessionBoundaryDraft`, `AgentBeforeSettleEvent` and the `on("agent_before_settle")` member.
3. `src/job/finalize.ts`: no parse of `result` and no `done:` exception; the transition no longer sets `openChecks`, so
   a new record keeps the `null` it is published with (`emptyRecord`). The field stays in version 1;
   `src/job/record.ts`'s comment says it is history. `src/job/migration.ts` is unchanged.
4. Readers: the wake (`src/job/wake-text.ts`: lead, paragraph, handoff and land sentences), the toast and Herdr
   notification (`hook/wake.ts`: one `DONE_WORDS`), `limen status` (`src/job/job.ts`'s `DONE WITH OPEN CHECKS` line,
   `src/project/summary.ts`'s "decide" grouping) and the manual treat such a job as a plain `done`. `limen show` keeps
   one plain `open-checks` block (compact) or line (terminal view) for a record that holds a value, with no header,
   glyph or reason (`src/job/listing.ts`, `src/job/view.ts`).
5. `src/job/session-commands.ts` trimmed in place to `simpleCommands` and its splitter (`pieces`, `separator`,
   `squash`, `HEREDOC`, `PREFIX`), head comment rewritten; `test/job/session-commands.test.ts` (new, 4 tests) keeps
   u14's splitter cases (`;`, `&&`, `|`, `if`, `!`, assignments and wrappers, quotes).
6. The 80 % steer (`src/runtime/wrapper.ts`): one table `DEADLINE_ASKS` from role to text and the exported
   `deadlineSteerText(role, minutes)`; the timer passes `record?.role`. Texts by D-121: reviewer and judge "write your
   verdict now."; researcher "give your report in your final message now."; worker, keeper, quality and `coordinator`
   (a group's team) "commit your work now."; each after "<N> min left before the timeout: ".
7. `src/project/leftovers.ts`: `.agents/limen/reminders.md`, feature "the task note (R-042)".
8. M-01 tools: `adrian-rebuild/tools/role-context.mjs` reads the note's events only when the measured ref has
   `src/job/task-note.ts`; `adrian-rebuild/tools/context-size.mjs` prints the note-start sentence and the per-event
   line only then; `adrian-rebuild/tools/test-context-size.mjs` gains a test for a ref without the module (the working
   tree) and asserts that `a0.3.0` keeps its per-event note line. Each `PL:` summary updated.
9. Text: `README.md` loses the "Task-note experiment" section whole; `docs/setup.md`'s note paragraph and
   `docs/jobs.md`'s open-check paragraph are replaced by what is true now (the first `finish` ends the job; every done
   job is a plain done; an older record's `openChecks` printed by `limen show`; `reminders.md` a leftover);
   `docs/jobs.md`'s content-file list names "an older job's `note.md` and `note.first.md`". The manual's sentence goes
   from `templates/manual.md:139` and from `test/runtime/context-message/owner-facing-coordinator.md:145`. The comments
   of inventory section 5 in the files this ticket touches follow (`hook/finish.ts`, `hook/wake.ts`,
   `src/job/finalize.ts`, `src/job/job.ts`, `src/job/record.ts`, `src/job/view.ts`, `src/job/wake-text.ts`,
   `src/job/listing.ts`, `src/job/publication.ts`, `src/project/summary.ts`, `src/job/session-commands.ts`,
   `src/job/usage.ts`).
10. Tests (item 10): `test/hook/finish.test.ts` (new, 3); `test/hook/communication.test.ts` (+2);
    `test/s4-steering.test.ts` (steers are `["one", "two"]`; the child's first prompt names no `note.md`; the carry
    assertion leaves); `test/cli/continue.test.ts` (+1, a parent folder with both note files); `test/job/finalize.test.ts`
    (+2); `test/runtime/wrapper.test.ts` (+1); `test/s3-finish-wake.test.ts` (one `finish`, no `note check sent`, a
    plain done wake, the timeout job's full 80 % text in the log, a reviewer's since round 1); `test/job/wake-text.test.ts`, `test/hook/wake.test.ts`,
    `test/cli/show.test.ts`, `test/cli/status.test.ts` (+1 each); `test/project/leftovers.test.ts` (+1);
    `test/runtime/pi-api.test.ts` (the two `piSettleEvent` tests and their `asHandedOver` helper go).

Tests removed with the cut feature (conventions): `test/u14-task-note.test.ts` whole ("a job's note shows once, keeps
its first version, logs changes, and is checked once before the finish"; "a job that ends without a note gets a check
that tells it to rebuild the note from its task"); in `test/runtime/pi-api.test.ts` "piSettleEvent returns an
agent_before_settle with Pi's own entries and refuses an unknown outcome" and "piSettleEvent refuses an
agent_before_settle whose entries are not a list".

## Review fixes

### Round 1 (F1–F2: `review.md` → Round 1, notes 1 and 2; `ticket.md` → `## Decisions` 9 and 10)

- F1: `adrian-rebuild/tools/fake-pi-rpc.mjs:63` reads "One session entry, in the shape that `src/job/usage.ts`,
  Limen's one reader of Pi's session files, reads."; the `PL:` summary of `adrian-rebuild/tools/same-task-session.mjs`
  names `src/job/usage.ts` as the format's only reader in Limen ("jedyny ich czytelnik w Limen"). Comments only: the
  module calls itself "The one reader of Pi's session files (T-25 (1))" (`src/job/usage.ts:1`), and
  `src/job/session-commands.ts` is now the splitter that `src/job/statistics.ts:30` imports. The `PL:` summary of
  `fake-pi-rpc.mjs` names no reader and stays true unchanged. No other file under `adrian-rebuild/tools/` changed.
- F2, the place: the existing timeout scenario of `test/s3-finish-wake.test.ts` ("stop, timeout and a stalled tool
  each end a job once and wake its session once; 80% of a timeout steers once"). Its timeout job is spawned with
  `--role reviewer`, and its one steer assertion expects `steered: 1 min left before the timeout: write your verdict
  now.` once, where it expected a worker's commit text, which is also the text of a record with no role. The scenario
  already waits for the 80 % steer of a 3 s timeout, so the role costs no new plant and no new real-time wait
  (T-31 (4)), and the test checks no new mechanism (T-29 (3)); a new test in `test/runtime/wrapper.test.ts` would
  need its own plant and one more real timeout. The worker's text stays covered as a unit there.
- F2, fails when the wrapper ignores the role: `src/runtime/wrapper.ts:350` temporarily
  `deadlineSteerText(undefined ?? null, minutes)`, then `node --test test/s3-finish-wake.test.ts` → exit 1, `ℹ tests
  9`, `ℹ pass 8`, `ℹ fail 1`: "stop, timeout and a stalled tool each end a job once …" at
  `test/s3-finish-wake.test.ts:153:9`, `AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  undefined !== 1` (no verdict steer in the log). The assertions before it passed (states `stopped`/`failed`/`failed`,
  kinds `timeout`/`stall`), so the reviewer's spawn ran and timed out. Line restored to `record?.role ?? null`
  (`grep -n "deadlineSteerText("` → `:64` and `:350`).
- Runs after the fixes, from the repository root, each alone: `node --test test/s3-finish-wake.test.ts` → exit 0,
  `ℹ tests 9`, `ℹ pass 9`, `ℹ fail 0`, 24.9 s (outside `gate.mjs`, as the main session asked; the gate's run is the
  main session's); `npx biome check --error-on-warnings test/s3-finish-wake.test.ts
  adrian-rebuild/tools/fake-pi-rpc.mjs adrian-rebuild/tools/same-task-session.mjs src/runtime/wrapper.ts` → exit 0,
  "Checked 4 files … No fixes applied"; `npx tsc --noEmit` → exit 0, no output; `node adrian-rebuild/tools/check.mjs`
  → exit 0, "PL summaries: 325 files … 0 errors"; `npx biome check --error-on-warnings adrian-rebuild` → exit 0,
  "Checked 36 files … No fixes applied". The test count is unchanged (1365):
  F2 changes an assertion, it adds no test.

### Round 2 (G1: `review.md` → Round 2, note 1; `ticket.md` → `## Decisions` 11)

- G1: `adrian-rebuild/tools/fake-pi-rpc.mjs:63` now reads "One session entry, in the shape that `src/job/usage.ts`
  reads.", and the `PL:` summary of `adrian-rebuild/tools/same-task-session.mjs` (lines 1–2) names `src/job/usage.ts`
  as the reader of the format without "jedyny ich czytelnik w Limen", since `src/picture/activity.ts:379-397` reads a
  job's newest session file too (T-30 (1)). Comments only, no test changed; `npx biome check --error-on-warnings
  adrian-rebuild` → exit 0, "Checked 36 files … No fixes applied"; `node adrian-rebuild/tools/check.mjs` → exit 0,
  "PL summaries: 325 files … 0 errors".

## Proof

The main session's runs (they count, protocol step 4), after the implementer's hand-back and `review-guard.mjs
compare --git` → exit 0 ("within its limits"):
- `node adrian-rebuild/tools/gate.mjs` → exit 0: `ℹ tests 1365`, `ℹ pass 1365`, `ℹ fail 0`, `ℹ cancelled 0`, `ℹ skipped
  0`, 302.9 s, no `gate:` line (AC-18).
- `node adrian-rebuild/tools/fails-before.mjs` on the seven files of AC-17 → exit 0, "fail at HEAD (exit 1)"; its tail
  shows `test/s4-steering.test.ts` failing at HEAD on the delivered steers (the note appendix against `['one', 'two']`)
  and on the child's first prompt.
- After fix round 1 (F1–F2; `compare --git` → exit 0): `node adrian-rebuild/tools/gate.mjs` → exit 0, `ℹ tests 1365`,
  `ℹ pass 1365`, `ℹ fail 0`, `ℹ cancelled 0`, `ℹ skipped 0`, 306.3 s, no `gate:` line; `node
  adrian-rebuild/tools/fails-before.mjs test/s3-finish-wake.test.ts` → exit 0, "fail at HEAD (exit 1)".
- After fix round 2 (G1, comments of two rebuild tools only; `compare --git` → exit 0): `node
  adrian-rebuild/tools/gate.mjs` → exit 1. The failing test is unknown: the Bash tool cut the output before it and the
  summary and kept no copy; the checkout holds no new ignored file, and `tsc` and Biome passed. Not run again (D-029);
  `.night/questions.md` → Q-91, and R-042 is `blocked` until Adrian's answer.
- By day, 2026-11-27, after Q-91 → D-130 and the `Tools:` commit of `gate.mjs --out`, the main session's one run on this
  tree: `node adrian-rebuild/tools/gate.mjs --out node_modules/.rebuild-review/R-042.gate` → exit 0, `ℹ tests 1365`,
  `ℹ pass 1365`, `ℹ fail 0`, 348.0 s, last line `gate: exit 0`. This run is R-042's gate (AC-18); the lost failure is
  an occurrence of A-091 (Open points 5).

The implementer's runs after its last code edit, from the repository root:
- `node adrian-rebuild/tools/gate.mjs` → `ℹ tests 1365`, `ℹ pass 1365`, `ℹ fail 0`, `ℹ cancelled 0`, `ℹ skipped 0`,
  `ℹ todo 0`, `ℹ duration_ms 304577.7`, biome "Checked 290 files … No fixes applied", no `gate:` line (output read
  through `grep`, so the exit code 0 is inferred from these lines; AC-18). Count: 1351 at R-040, minus 4 removed, plus
  18 new.
- `node adrian-rebuild/tools/check.mjs` → exit 0, "0 errors" (PL summaries: 323 files; 324 after this draft, again
  "0 errors").
- `npx biome check --error-on-warnings .` → exit 0, "Checked 290 files … No fixes applied"; `npx biome check
  --error-on-warnings adrian-rebuild` → exit 0, "Checked 36 files … No fixes applied" (AC-19).
- `npx tsc --noEmit` → exit 0, no output.
- `node --test test/hook/finish.test.ts test/hook/communication.test.ts test/job/session-commands.test.ts
  test/job/finalize.test.ts test/runtime/pi-api.test.ts test/runtime/pi-contract.test.ts test/project/leftovers.test.ts
  test/job/wake-text.test.ts` → exit 0, 109 of 109 (AC-1's and AC-5's unit files, AC-3's finalize, AC-7's wake-text,
  AC-8's leftovers).
- `node --test test/runtime/context-message.test.ts adrian-rebuild/tools/test-context-size.mjs` → exit 0, 25 of 25
  (AC-8; the `a0.3.0` test ran, not skipped).
- `node --test test/registry.test.ts test/structure.test.ts` → exit 0, 84 of 84.
- The plant files of AC-2–AC-7 (`test/s4-steering.test.ts`, `test/cli/continue.test.ts`, `test/runtime/wrapper.test.ts`,
  `test/s3-finish-wake.test.ts`, `test/job/statistics.test.ts`, `test/cli/stats.test.ts`, `test/hook/wake.test.ts`,
  `test/cli/show.test.ts`, `test/cli/status.test.ts`) passed inside the gate run above; not run alone outside the
  gate's environment (D-034: on this laptop a test run outside `gate.mjs` is not evidence of a failure).
- AC-9: `git ls-files -- src/job/task-note.ts test/u14-task-note.test.ts` prints nothing (`grep -q .` → exit 1).
- AC-10–AC-16: `git grep -n` with each pattern over each criterion's paths prints nothing, except AC-13's second,
  which prints `src/project/leftovers.ts:89` (expected). This shell shows no exit code 1, so each `-q` exit code is
  read from the `-n` run of the same pattern and paths. The remaining matches of the same patterns in `src` lie
  outside the criteria's paths: `openChecks` and "open checks" in `src/job/listing.ts`, `src/job/view.ts`,
  `src/job/record.ts` and `src/job/migration.ts` (the history the ticket keeps).
- No new ignored file in the checkout: `git ls-files --others --ignored --exclude-standard -- .limen` lists only
  R-039's `.limen/refusals/641201-56581511.json.641201.07e0eca95172d3f4.tmp`.

## Fails before

Written before any source change and run at `HEAD` through the tool (AC-17):

`node adrian-rebuild/tools/fails-before.mjs test/hook/finish.test.ts test/hook/communication.test.ts
test/s4-steering.test.ts test/cli/continue.test.ts test/job/finalize.test.ts test/runtime/wrapper.test.ts
test/s3-finish-wake.test.ts` → exit 0, "fail at HEAD (exit 1)"; its tail shows `test/s4-steering.test.ts`: the
delivered steers are `'one\n\n[limen] If this steer changes an end check … note.md. …'` and the same for `two` against
`['one', 'two']`, and the continue test's `true !== false` (the child's first prompt names `note.md`).

Each file alone, the same tool, each → exit 0, "fail at HEAD (exit 1)":
- `test/hook/finish.test.ts`: all three fail; `events: ['agent_before_settle']` against `[]`; the log holds
  `[limen 2026-11-27T00:34:01.612Z] note check sent\n` against `''`; the first call answers with the check and writes
  no `result`.
- `test/hook/communication.test.ts`: the first cue ends `… do not rerun a check just because this is a continued
  job.` (the note start) where the next prompt's ends `</limen-project-context>`; after the `note.md` write `[true,
  '[limen 2026-11-27T00:34:02.535Z] note changed\n']` against `[false, '']`.
- `test/job/finalize.test.ts`: 13 tests, 12 pass, 1 fails: `openChecks` is `['Tests: not proven. No run.', 'Build:
  dropped']` against `null`.
- `test/runtime/wrapper.test.ts`: the file fails to load: "SyntaxError: The requested module
  '../../src/runtime/wrapper.ts' does not provide an export named 'deadlineSteerText'" (HEAD has no table).
- `test/cli/continue.test.ts`: 18 tests, 17 pass, 1 fails: the child holds both note files, `[true, true]` against
  `[false, false]`.
- `test/s3-finish-wake.test.ts`: the first test fails before its `limen abandon` loop, so the later tests of the
  shared plant fail on `UNLANDED_WORK` (its tail shows those), as the file is built.

## Deviations from the ticket / night defaults (category A of D-054 (2), for Adrian to confirm)

1. The steer table is a `ReadonlyMap` `DEADLINE_ASKS` with the exported `deadlineSteerText(role, minutes)` beside it
   in `src/runtime/wrapper.ts` (a Map, so no role name meets an `Object.prototype` key). D-121's "group member" is the
   record role `coordinator` (a group's team; a group's workers are `worker`); a role outside the table, or a record
   without one, gets the commit text, the writing default of spawn's default role `worker`.
2. `test/runtime/wrapper.test.ts` checks the table as a unit (four roles, no "note", "unverified" or "checks"), since an
   engine run at 80 % of a timeout waits in real time (T-31 (4)); the wrapper's read of `record.role` is shown end to
   end by `test/s3-finish-wake.test.ts`, whose timeout job, a reviewer since round 1 (F2), logs `steered: 1 min left
   before the timeout: write your verdict now.` once. At `HEAD` the wrapper test fails on the missing export.
3. `finalizeJob` no longer sets `openChecks` at all, instead of setting `null`: every record is published with `null`
   (`emptyRecord`), and nothing else writes the field.
4. `limen show`'s `open-checks` block is limited to the detail (`detailed`), so the status rows of `limen status --all`,
   which use the same compact renderer, show none (item 4: status treats such a job as a plain done).
5. `NewJob.carried` is removed with the note carry, its only use (inventory Unverified 2: R-039 passes `context.md`
   through `context`, not `carried`).
6. The splitter's `pieces` returns the words alone: the separator it kept was read only by the proof (`chainWhy`).
7. `hook/wake.ts`'s `PLAIN_DONE` is `DONE_WORDS`, since no other done kind is left.
8. `docs/setup.md:169` and `docs/jobs.md:47` are replaced by one short paragraph each of what is true now, not only
   deleted, so the docs say so (AC-20); neither may say "task note" (AC-16). `docs/commands.md:190`'s leftover list
   ("among them …") is unchanged, since a mention of `reminders.md`'s feature there would name the task note.
9. The coordinator's reference file is updated by the same one-sentence edit as `templates/manual.md`, not by removing
   and regenerating it; `node --test test/runtime/context-message.test.ts` passes on it.
10. `test/s3-finish-wake.test.ts`'s done job calls `finish` once (`block\ncommit\nfinish <handoff>`), since the first
    call now ends the job; its handoff keeps a `## Note check` with a "not proven" line to show that it is plain text.

## Unmeasured

- M-01 (fixed context per role): the job's once-per-session note start (1588 B ≈397) and the per-event check (1618 B
  ≈405) and steer suffix (427 B ≈107) of `evidence/context-size-rebuild-base.md` leave every job; measured by the main
  session at the close of stage 4 (`context-size.mjs <ref>`); here only `test-context-size.mjs` shows that a tree
  without the module reports no note line.
- M-05 (same-task pass^k): jobs end without the self-check turn and get the per-role steer; seat step 4.8.
- M-11 (failure kinds per ticket): a job can no longer time out between a first and a second `finish`; 9.1.
- M-07 (tokens per landed ticket): the extra turn's tokens leave; 9.1.

## Open points

1. `adrian-rebuild/tools/fake-pi-rpc.mjs:63` and `adrian-rebuild/tools/same-task-session.mjs:2` (its PL summary)
   named `src/job/session-commands.ts` as a reader of transcripts, false now (inventory section 5); fixed in round 1
   (F1, `## Review fixes`) after Decision 9 named both files in `## Change`.
2. `docs/jobs.md:251` "Read its durable note." is left: it reads as the worker's question file (AU-112, T-05), not the
   task note (inventory Unverified 5).
3. `runInternalJob` (`src/runtime/wrapper.ts`) and `limenWake` (`hook/wake.ts`) keep their "split pending"
   suppressions (T-27 (1)); this ticket changes one call and one constant in each, and no scan enforces the removal
   before stage 6.
4. `test/plant.ts:95-96`'s `FINAL` still ends "Note check: not proven yet: none", plain text now (inventory Unverified 4;
   left so that the multibyte cut of `test/s3-finish-wake.test.ts` keeps its bytes).
5. An occurrence of A-091 (D-130): in the night of 2026-11-26/27 the main session's gate after fix round 2 (G1, two
   comments and `outcome.md`) exited 1 with its failing test unknown (the tool output was cut, no copy kept). By day,
   after `gate.mjs --out` (`evidence/gate-out/`), one run on the same tree: `node adrian-rebuild/tools/gate.mjs --out
   node_modules/.rebuild-review/R-042.gate` → exit 0, 1365/1365 (348.0 s); this run is R-042's gate.
