<!-- PL: Ticket R-036 (A-059, notatka D-092 z Q-43, notatka R-026 o M-09): zawieszenie narzędzia mierzone na całym
scope'ie joba (`cpu.stat`) zamiast na drzewie procesów silnika z `ps`, więc build w tle nie kończy joba, a samotny
`sleep` tak; wrapper zapisuje szczytowe zużycie CPU scope'u; advisory dostaje źródło (`queue` albo `stall`), a hook
liczy potwierdzenia osobno dla źródła i sesji. Stan: napisany 23.11 przy `6d17130` z inwentarza
`evidence/inventories/R-036.md`; pytania inwentarza rozstrzygnięte dokumentami w `## Decisions`; fakty sprawdzone
ponownie 24.11 przy `903a8c9` (Decisions 15–23); w realizacji (`active`). -->

# R-036 Stall is measured over the whole job scope

## Problem

Finding A-059 (medium), the part of its Decision this ticket takes, quoted from `audit.md`: "Stall is measured over the
whole systemd scope of the job (`cpu.stat`): no CPU in the whole job and no tool progress for 180 s; a background build
does not trigger it, a lone `sleep` does." The R-026 note in `## Tickets`: "R-036 reads the scope's `cpu.stat` for the
stall and records the peak CPU rate from its samples (M-09)". The D-092 note (Q-43): "Each advisory names its source
(queue or stall), the receipt is per source and session, and a test shows a stall advisory after a queue diagnosis
delivered." T-31 (3), (4): fake scenarios per failure kind, no real waiting. T-28 (5): systemd behaviour gets a step in
`## Deployment` (3.8).

Facts at `6d17130` (the read-only inventory `adrian-rebuild/evidence/inventories/R-036.md`; the main session checked the
ones it quotes):
1. The stall runs only in the wrapper: `setInterval(checkStall, 3_000)` (`src/runtime/wrapper.ts:365`), from the
   engine's spawn to its end, and acts only while a tool is pending (`:354-357`). The policy is
   `src/runtime/stalled-tool.ts` (153 lines), which has no unit test.
2. It samples `ps` over the engine's process tree (`sampleTree`, `stalled-tool.ts:23-62`, through
   `platform.processTable`, `src/platform/linux.ts:154-160`), whole seconds of CPU, and needs a child seen during the
   tool (`hadChild`). A process outside that tree (a build detached with `setsid`, one left by an earlier tool) does not
   count, so a tool that waits on a background build ends the job `stall` while the build uses CPU in the same scope.
   Before the end it checks the identities of the group and its descendants again (`wrapper.ts:322-344`,
   `ownedToolDescendants`); `signalOwnedProcess` (`stalled-tool.ts:147-153`) has no caller.
3. "Tool progress" is the key `${tools}:${seen.tool}:${seen.progress}` (`wrapper.ts:313`): the tool count, the last tool
   with its detail, and a counter raised by each stderr chunk and each non-JSON stdout line. The window is `toolStall`
   of the project's `limits.json`, else 3 min (`stalled-tool.ts:7-11`).
4. The end: `exhaust("stalled tool <tool>: CPU-idle child|child exited for <n>s")` (`wrapper.ts:346-348`), kind `stall`
   by the pattern `[/^stalled tool /, "stall"]` (`src/job/record.ts:735`). A failed or unreadable sample sets the
   record's `advisory` to `tool stall observation uncertain: <detail>` (`wrapper.ts:286-297`), cleared when the tool is
   observed again or no tool runs.
5. Since R-026 every job runs in `limen-job-<id>.scope`; the record's `scope` (five strict keys, `scopeOf`,
   `record.ts:887-897`) gets `cpuMicroseconds` once, at the end (`readScope`, `src/job/finalize.ts:67-76`); no code
   reads a scope's files while the job runs, and no CPU rate is recorded anywhere. A rate over a window already exists
   in the queue diagnosis (`src/runtime/queue-diagnosis.ts:19-29`, `:50-68`: a share of the whole machine).
6. `advisory` is `{ text, at }`, strict (`record.ts:91-92`). The wake hook's slot is `_advisory.<session>` or
   `_advisory._fallback` (`hook/wake.ts:552`), and a delivered own slot sends nothing more (`:553-555`): one receipt per
   job and session, whatever the text, so a job whose queue diagnosis (R-035) was delivered gets no stall note after it
   in that session. The attempt counter's family is `_advisory` per job (`src/job/wake-delivery.ts:162-164`,
   `:323-332`).
7. Tests: one stall scenario, `test/s3-finish-wake.test.ts:143`, which waits two real 3 s ticks and asserts no kind; no
   test asserts kind `stall` (`grep -rn '"stall"' test` → 0), and no test delivers an advisory through the hook.

## Change

(a) The stall rule reads the job's scope. While a tool is pending, the job is stalled when, for the whole window, the
scope's CPU time (`usage_usec` of its `cpu.stat`) grew by less than 2 % of the window's wall time and the tool-progress
key of fact 3 did not change. A new platform member reads `usage_usec` of one cgroup alone; the wrapper knows its own
cgroup (`wrapper.ts:53-62`). The rule is a pure function over samples `(time, usage)` and the key, with the clock and
the window as parameters, in `src/runtime/stalled-tool.ts`.

(b) The `ps` sample goes: `sampleTree`, `hadChild`, the identity checks before the end (`wrapper.ts:306-338`),
`ownedToolDescendants`, the unused `signalOwnedProcess` and `ToolStallWatch.lastSampleAt`, and `platform.processTable`
with its parser and tests when no caller is left. The end still goes through `exhaust`, which ends the job's scope
(R-026, R-027).

(c) The end's detail is `stalled tool <tool>: scope CPU idle and no tool progress for <n>s`, kind `stall`, through the
mechanism `HEAD` has when this ticket runs (the detail pattern, or R-029's kind set where the detector runs).

(d) A read of the scope's CPU that fails sets the advisory `tool stall observation uncertain: scope CPU unavailable:
<reason>` (T-01), once per distinct text, as today; a missing `cpu.stat` is that note too. The note clears as today.

(e) The peak CPU rate (M-09): the wrapper samples `usage_usec` at every tick from the engine's start to its end, also
while no tool runs, and keeps the largest rate between two samples, as an integer percentage of the whole machine
(the queue diagnosis's unit, `queue-diagnosis.ts:50-68`). It is written at the wrapper's finalize as a new optional key
`cpuPeakPercent` of the record's `scope`; a job that another process ends (stop, the reaper, the spawner) keeps it
`null`. `limen show` prints it beside the CPU time.

(f) The advisory names its source: `advisory` gets a key `source`, `queue` or `stall` (the start queue's diagnosis and
the wrapper's note), optional when read, so a record without it reads as `stall`. The wake hook's slot is
`_advisory.<source>.<session>` and `_advisory.<source>._fallback`; the receipt, the fallback's check, the attempt
counter's family and the seat notification (`src/commands/sweep.ts:72-77`) are per source. One wake per source and
session stays, as today per job and session.

(g) A test knob for the stall's tick (`src/config.ts`, kind `test`; 3 s otherwise), so no stall test waits real seconds
beyond the plant's short values (T-31 (4); the start queue's `LIMEN_START_POLL_MS` is the pattern).

(h) Tests, each failing before the change: the rule over planted samples (an idle scope with a pending tool stalls; a
busy scope does not; a changed key restarts the window; no pending tool never stalls) in
`test/runtime/stalled-tool.test.ts`; a job whose fake scope's `cpu.stat` stands still while a tool sleeps ends `failed`
with kind `stall` and the new detail; a job whose test raises its fake scope's `usage_usec` during the same tool (the
background build) is not ended by the rule; the peak in the record and in `limen show`; a failed CPU read gives the
note; a stall advisory delivered after a delivered queue diagnosis in the same session (the D-092 note); the advisory's
`source` read and written, and a record without it.

(i) Text that becomes false: `docs/jobs.md:53`, `:55`, `:180`, `:190`, `:196`, `:198`, `:212`, `:216`,
`docs/remote.md:77`, `docs/groups.md:69` (and the filter it rests on, `src/job/group-events.ts:116`, which keeps the
note's words), the comments `src/job/record.ts:91`, `src/runtime/wrapper.ts:282-283`, the headers of
`src/platform/platform.ts:1-11` and `src/platform/linux.ts:1-7`. Seat step 3.8 in `plan.md` → `## Deployment`
already names the new checks (the main session wrote it with this ticket).

## Out of scope

- The failure kinds set where their detectors run (R-029); A-059's other parts: default timeouts per role and the 80 %
  steer per role (R-042), owner settings in `limits.json` (R-062).
- Who may write the project's `limits.json`, whose `toolStall` a job can raise (G2 accepted risk until R-054).
- The peak in `limen stats` (the M-06 split; the record field is its source).
- CPU of other scopes: a tool that waits on another job waits on that job's scope (each `limen group wait` call is
  bounded at 20 s, `src/commands/group-wait.ts:11`, so its tool count moves).

## Acceptance

- AC-1: `node --test test/runtime/stalled-tool.test.ts` → exit 0.
- AC-2: `node --test test/runtime/wrapper.test.ts` → exit 0; `node --test test/s3-finish-wake.test.ts` → exit 0.
- AC-3: `node --test test/hook/wake.test.ts` → exit 0; `node --test test/job/wake-delivery.test.ts` → exit 0.
- AC-4: `node --test test/platform/linux.test.ts` → exit 0; `node --test test/job/record.test.ts` → exit 0.
- AC-5: `node --test test/cli/show.test.ts` → exit 0; `node --test test/structure.test.ts` → exit 0.
- AC-6: `node adrian-rebuild/tools/fails-before.mjs` → exit 0, its output in `outcome.md` → `## Fails before`.
- AC-7: `node adrian-rebuild/tools/gate.mjs` → exit 0.
- AC-8: `npx biome check --error-on-warnings .` → exit 0; `node adrian-rebuild/tools/check.mjs` → exit 0.
- AC-9 (judgment): a job is ended by the stall rule only when its whole scope is idle and its pending tool makes no
  progress for the window; no process outside the job's scope is read or signalled; a queue diagnosis delivered to a
  session does not hold back a later stall note of the same job.

## Migration

None. `advisory.source` and `scope.cpuPeakPercent` are optional when read (D-079's additive pattern), and a deployment
runs with no job running (`## Deployment` 0.2), so no live record meets the old receipt names; older receipt files stay
where they are and count for no source.

## Risk

- On the seat the idle CPU of Pi and the bridge's `claude` stays in the scope's count; if it is above 2 % of the
  window, the rule never ends a job and the job's timeout does (fail open, nothing lost). Seat step 3.8 measures it.
- A tool that waits with no CPU and no output on something outside the job (a network call) for the window ends the
  job, as a lone `sleep` does (A-059).

## Rollback

`git revert $(git log --format=%H --grep='^R-036:' adrian-rebuild --)`. After a revert, a record with
`advisory.source` or `scope.cpuPeakPercent` is `BAD_DATA` (D-079), as R-035's `queueWait` is; the rollback of a format
change is the snapshot of `## Deployment` 0.1.

## Decisions

Settled by the documents when the ticket was written (2026-11-23, the main session's reading, not a night default; the
inventory's questions in `evidence/inventories/R-036.md` → section 8):
1. "No CPU in the whole job" (question 1) cannot mean "no change of `usage_usec`": the wrapper, Pi and the bridge's
   `claude` run in the scope (R-026 Decision 1), and A-059 wants a lone `sleep` to stall. So it is a threshold, 2 % of
   the window's wall time, a constant of the policy module (T-03: a mechanic the owner does not configure; T-25), far
   below a build and above an idle Node process; seat step 3.8 records the measured idle rate.
2. "No tool progress" (question 2) keeps today's key, and the rule still acts only while a tool is pending: the name is
   "stalled tool", and an engine waiting on the model is no tool. `hadChild` goes, since the scope, not the tree, is the
   measure (KISS).
3. The `ps` sample and its identity checks go (question 3): `exhaust` ends the job's scope, which holds only the job's
   processes (R-026), so no check of another process's identity is needed before the end. `ps` stays a declared
   requirement, since `src/platform/linux.ts:218` uses it.
4. The uncertainty note keeps its family words, `tool stall observation uncertain:`, so the group mirror's filter and
   its doc stay true (question 4); T-01: a read failure is never silent.
5. The detail keeps the prefix `stalled tool ` (question 5), so the kind is `stall` before and after R-029, which may
   run before or after this ticket.
6. The peak (question 6): machine share, the unit the queue diagnosis and the start gate use (T-18: one word per thing),
   sampled at every tick of the engine's run, written once by the wrapper at its finalize (one more write per sample
   would be a write every 3 s); `null` when another process ends the job, as `scope` readings are `null` when unread.
7. A member that reads `cpu.stat` alone (question 7), since the tick reads it every 3 s and the other two files are not
   needed; it lives in the platform adapter (the A-083 scan). Rates use `performance.now()`, as the queue diagnosis.
8. Tests (question 8): the pure rule with planted samples, and scenarios that write the fake scope's `cpu.stat`, as
   `test/runtime/wrapper.test.ts:287-288` writes `memory.events`; the tick's test knob replaces the real wait. The T-31
   (4) scan is not this ticket's.
9. The source is a key of `advisory` (question 9), not parsed from the text (z. 2); two values, as the D-092 note names.
10. The receipt (questions 10, 12): `_advisory.<source>.<session>`; the slot is never parsed, only looked up by name,
    so a session id with dots is no ambiguity; the family of attempts is per source, so the queue's failed attempts do
    not spend the stall's; one wake per source and session, as today's one per job and session.
11. The wake's text does not name the source beyond the note's own words (question 11, YAGNI): the queue's and the
    stall's notes already differ in their first words.
12. Seat step 3.8 (question 13) checks the `sleep 300` stall, the scope's idle rate during it, `cpuPeakPercent` in the
    record, and a background build (a busy loop detached by one tool while the next tool sleeps) that the rule does not
    end.
13. A tool that waits on another job (question 14) is out of scope: each `limen group wait` call is bounded, so the
    tool count moves.
14. Docs (question 15) as (i); `docs/jobs.md:216` is false today and is corrected here. `toolStall` from the project's
    `limits.json` (question 16) is unchanged (G2 accepted risk until R-054).

2026-11-24, the facts at `HEAD` (`903a8c9`; protocol step 2, D-025). R-029, R-032, R-033 and R-034 ran after the ticket
was written at `6d17130`; the main session checked every place the ticket names. What moved (the change is the same):
15. `src/runtime/wrapper.ts`: the uncertainty note `:312-330` (`warnUncertain`, `clearUncertain`), the observation and
    its identity checks `:331-374` (`observeStall`), the end `:373`, `checkStall` `:375-389` (it acts only while
    `seen.activity` is `tool`, `:379-382`), the tick `setInterval(checkStall, 3_000)` `:390`; the wrapper's own cgroup is
    `platform.ownCgroup()` at `:65`, checked against the job's unit at `:66-70`.
16. (c): R-029 is done, so the kind is set where the detector runs: `exhaust({ kind: "stall", detail })`
    (`wrapper.ts:373`). The pattern `[/^stalled tool /, "stall"]` (`src/job/record.ts:879`) stays for the migration of
    older records, and Decision 5's prefix still keeps the two in step.
17. `src/runtime/stalled-tool.ts` (153 lines): `sampleTree` `:24`, `hadChild` and `lastSampleAt` `:68-69`,
    `ownedToolDescendants` `:130`, `signalOwnedProcess` `:147-153` (still no caller); `platform.processTable` is
    `src/platform/platform.ts:115` and `src/platform/linux.ts:172-178`, with `parseProcessTable` tested in
    `test/platform/linux.test.ts:17-67`, and its only caller is `stalled-tool.ts:16`. Decision 3's other use of `ps` is
    `src/platform/linux.ts:236` (`ps -o comm=`).
18. `src/job/record.ts`: `Advisory` `:118`, its reader `advisoryOf` `:1134-1137`; `Scope` `:142` (`cpuMicroseconds`),
    its reader `scopeOf` `:1190-1200`. `src/job/finalize.ts`: `readScope` `:83-91` through `platform.scopeReadings`
    (`src/platform/linux.ts:459`), `UNREAD` `:36`.
19. The advisory's writers: the wrapper (fact 15) and the start queue, which writes the diagnosis
    (`src/runtime/start-queue.ts:435`) and clears it when the job leaves the queue (`:398`); both get their `source`.
20. The wake hook (fact 6): the slot `_advisory.${fallback ? "_fallback" : sessionId}` is `hook/wake.ts:561`, the own
    slot's receipt check `:562`, the fallback's checks `:564-566`, `:594-595` and `:600-601`; the attempt family is
    `attemptsPath` → `receiptFamily` (`src/job/wake-delivery.ts:163-165`, `:335-345`), and `isAdvisorySlot` (`:333`)
    also counts the old `_uncertainty.` slots of R-005 as advisory receipts, which stays.
21. The seat notification moved with R-032: `seatEvent` in `src/runtime/sweeping.ts:273-290` (no seat notification
    while the family `_advisory` has a delivered receipt; the event key `_advisory.<at>`); `src/commands/sweep.ts` is now
    the 18-line command of `limen seat sweep`. (f)'s "the seat notification (`src/commands/sweep.ts:72-77`)" means
    `seatEvent`: per source both in the family it checks and in the event key.
22. Fact 7: `test/s3-finish-wake.test.ts:148-162` now asserts kind `stall` for a `--prepare "sleep 30"` job (R-029), so
    "no test asserts kind `stall`" is no longer true; that test keeps passing with the new rule (a lone `sleep`
    stalls) and keeps its two real ticks unless the tick's knob of (g) shortens them. The `memory.events` pattern of
    Decision 8 is `test/runtime/wrapper.test.ts:427-435`; the knob pattern `LIMEN_START_POLL_MS` is `src/config.ts:75`;
    the 20 s cap of `limen group wait` is `src/commands/group-wait.ts:11`.
23. (i), the lines at `HEAD`: `docs/jobs.md:53`, `:55`, `:193`, `:203`, `:209`, `:211`, `:225`, `:229` (were `:53`,
    `:55`, `:180`, `:190`, `:196`, `:198`, `:212`, `:216`; Decision 14's false line is `:229`, which names
    `limen seat sweep` now), `docs/remote.md:77`, `docs/groups.md:69` with `src/job/group-events.ts:116`, the comments
    `src/job/record.ts:118` and `src/runtime/wrapper.ts:308-309`, the headers `src/platform/platform.ts:1-11` and
    `src/platform/linux.ts:1-7`.

2026-11-24, review round 1 (`review.md` → Round 1; PASS with four notes; the main session's reading, from T-01, the
ticket's Risk and D-092), the findings to fix:
- F1 (note 1, T-01): the sample at the engine's end (`last()`, `src/runtime/wrapper.ts:629-631`) discards a failed
  read. It logs the read's text once, as a tick does for a read with no pending tool (`logOnce`, the same words
  `tool stall observation uncertain: scope CPU unavailable: <reason>`), and sets no note, since the job is ending. Test:
  a job whose fake scope's `cpu.stat` is gone when its engine ends has that line in its log; it fails at `HEAD`.
- F2 (note 2): `docs/jobs.md:209` names 2 % as the rule's design threshold instead of stating that the idle CPU of
  the wrapper, Pi and the bridge's `claude` stays below it, and says what happens above it: the rule never ends the
  job, and its timeout does (the ticket's Risk 1), until seat step 3.8 records the value.
- F3 (note 4): `outcome.md` → `## Open points` names, for gate 5.3, that a pending tool with no child process (an
  in-process tool that waits with no output) can now stall, which `HEAD` never ended (accepted in the ticket's Risk 2),
  and that step 3.8's trial records show any `stall` end of a tool other than `bash`.
- Note 3 is rejected (`review.md` → Round 1).

2026-11-24, review round 2 (`review.md` → Round 2; PASS with three notes; the main session's reading), the findings to
fix, the last round (`## Agents`, step 6):
- G1 (note 1, M-09): the rate between two samples counts toward the peak only when they lie at least half a tick apart
  (half of `stallTickMs()`); a closer pair gives no rate and leaves the peak as it was. So the end's sample counts only
  when it lies that far after the last tick, and an engine run shorter than half a tick keeps `cpuPeakPercent` `null`.
  The minimum is a parameter of the pure `peakAfter`, as the window is of `stallStep`. Test: a pair closer than the
  minimum gives no rate, and one at the minimum does.
- G2 (note 3, T-29 (3)): `test/runtime/stalled-tool.test.ts:103-109` becomes two tests: one sample gives no peak; a
  rate above the whole machine counts as 100.
- Note 2 is left to R-082's ratchet (`review.md` → Round 2).
