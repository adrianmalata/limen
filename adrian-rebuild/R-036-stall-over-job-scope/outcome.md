<!-- PL: Wynik R-036 (implementer, 24.11, przy `903a8c9`; poprawki rund 1 i 2 przy `7332de2`): reguła zawieszenia czyta
czas CPU całego scope'u joba (`usage_usec` z `cpu.stat`, nowy członek platformy `cpuTime`) zamiast drzewa procesów
z `ps`, który odchodzi z `processTable` i kontrolami tożsamości; zawieszenie to mniej niż 2 % czasu okna i brak postępu
narzędzia przez całe okno. Wrapper próbkuje scope przy każdym tyknięciu (pokrętło testowe `LIMEN_STALL_TICK_MS`)
i zapisuje szczyt `scope.cpuPeakPercent`, który `limen show` drukuje obok czasu CPU; advisory ma źródło `queue` albo
`stall`, a hook i seat sweep liczą potwierdzenia osobno dla źródła i sesji. Runda 1: nieudany odczyt przy końcu
silnika trafia do logu (F1), próg 2 % w `docs/jobs.md` jako założenie projektowe (F2), punkt otwarty o narzędziu bez
procesu potomnego (F3). Runda 2: para próbek bliższa niż pół tyknięcia nie daje tempa do szczytu (G1), a test szczytu
z jednej próbki i z limitu maszyny to dwa testy (G2). Runda 3: PASS z jedną uwagą, przekazaną do notatek R-082.
Stan: zamknięty (`done`). -->

# R-036 outcome

## Done

(a) The stall rule reads the job's scope. `src/runtime/stalled-tool.ts` is now the pure rule and the peak:
`stallStep(watch, key, sample, windowMs)` keeps, for the pending tool's progress key, the samples `(at, usage)` since
that key holds and stalls once a sample under the same key lies a whole window back and the scope's CPU time grew since
then by less than `IDLE_PERCENT` (2) % of the wall time between them; no pending tool (`key` undefined) and a failed
read (`sample` undefined) keep no watch, so the window starts again, as a changed key starts it. The clock (`at`) and
the window are the caller's. The comparison is in whole microseconds on both sides (`100 * grown < 2 * ms * 1000`), so
exactly 2 % does not stall. The new platform member `cpuTime(cgroup)` (`src/platform/platform.ts`, `linux.ts`) reads
`usage_usec` of the cgroup's own `cpu.stat` alone and returns `{ kind: "read", microseconds }` or `{ kind: "unreadable",
detail }` (a missing file: `<folder>/cpu.stat is missing`; no such line: `… holds no usage_usec line`; any other read
error: its message). The wrapper reads its own cgroup, the one `platform.ownCgroup()` gives and the scope check proves.

(b) The `ps` sample goes: `sampleTree`, `processRows`, `hadChild`, `ToolStallWatch` with `lastSampleAt`,
`observeToolStall`, `ownedToolDescendants`, the uncalled `signalOwnedProcess`, `JobProcess`, the wrapper's identity
checks before the end (`observeStall`), and, with no caller left, `platform.processTable`, `ProcessRow`,
`parseProcessTable`, `cpuSeconds`, `runBounded`, `TABLE_MAX_BYTES` and the four parser tests of
`test/platform/linux.test.ts`. `ps` stays a declared requirement for `commandName` (Decision 3); its message in
`src/platform/requirements.ts` now says that Limen reads the name of a process's program with it. The end still goes
through `exhaust`, which ends the job's scope.

(c) The end: `exhaust({ kind: "stall", detail: "stalled tool <tool>: scope CPU idle and no tool progress for <n>s" })`,
`<n>` the window in seconds; the detail keeps the prefix `stalled tool `, so the migration's pattern
(`src/job/record.ts`) still names older records `stall` (Decision 16).

(d) A read that fails while a tool is pending sets the advisory `tool stall observation uncertain: scope CPU
unavailable: <reason>`, source `stall`, once per distinct text, and logs each distinct text once per run; the note
clears when a tick reads the scope with a tool pending, or no tool is pending, as before. A read that fails while no
tool is pending, or in the sample at the engine's end (review round 1, F1), sets no note but logs its text once (T-01:
the peak loses that sample, and the failure is not silent).

(e) The peak: `scopeSamples` in `src/runtime/wrapper.ts` (moved out of `runInternalJob`) reads the scope at the engine's
start, at every tick and once more at the engine's end (after the tests' end gate), also while no tool runs, and keeps
`peakAfter(peak, previous, sample, cores, minimumMs)`: the largest rate between two consecutive samples at least half a
tick apart (review round 2, G1), as an integer percentage of the whole machine, at most 100 (a rate above it can only
come from the times of the reads). The unit is the queue diagnosis's: the formula moved
into one exported function, `machineShare` in `src/runtime/queue-diagnosis.ts`, which `usageText` and the peak share
(T-25 (2), T-18). Times are `performance.now()` (Decision 7). The wrapper's transition to running writes
`scope.cpuPeakPercent: null`; its finalizations after the engine's start (the exhaustion's and the two after the
engine's end) pass `cpuPeakPercent` through a new `FinalizeOptions` field of `src/job/finalize.ts`, which writes it into
`scope` with the readings; a job another process ends keeps `null`. `limen show` prints `CPU 2.5 s, peak 37%` (`peak
unknown` for null or absent) in the scope line (`src/job/listing.ts`).

(f) `Advisory` gets an optional `source`, `queue` or `stall` (`ADVISORY_SOURCES`, `AdvisorySource` in
`src/job/record.ts`); `advisorySource(advisory)` reads a record without one as `stall`, so a record written before this
ticket reads as before (D-079). The start queue writes `source: "queue"`, the wrapper `source: "stall"`. The wake hook's
slot is `advisorySlot(source, session)` = `_advisory.<source>.<session>` and `_advisory.<source>._fallback`; its own
receipt, the fallback's checks and the claim's eligibility (which now also needs the record's advisory to have the same
source) are per source. `receiptFamily` (`src/job/wake-delivery.ts`) gives `_advisory.queue` and `_advisory.stall` their
own families, so the attempt counter (`notify/unconfirmed/<family>`) and `claimDelivery`'s same-family claims are per
source; an older `_advisory.<session>` and `_uncertainty.…` slot stays an advisory receipt of no source, never a
completion's. The seat notification (`seatEvent`, `src/runtime/sweeping.ts`) waits only while the note's own source has
a delivered receipt, and its event key is `_advisory.<source>.<at>`.

(g) The test knob `LIMEN_STALL_TICK_MS` (`src/config.ts`, kind `test`; 3 s otherwise), read by `stallTickMs()` in the
policy module; the plant sets it to 50 ms beside `LIMEN_START_POLL_MS`, so the s3 stall and the new scenarios wait only
their short windows.

(h) Tests, each failing before the change (`## Fails before`):
- `test/runtime/stalled-tool.test.ts` (new): an idle scope with a pending tool stalls at the window and not before; a
  busy scope never does; exactly 2 % does not stall, just below does; a changed key restarts the window; no pending tool
  never stalls; a failed read restarts the window; the peak between consecutive samples on 4 cores; no peak from one
  sample; a rate above the machine counts as 100 (two tests since review round 2, G2); a pair closer than the minimum
  interval gives no rate and leaves the peak, and a pair at it does (G1).
- `test/runtime/wrapper.test.ts`: an `idle` job whose fake `cpu.stat` stands still ends `failed`, kind `stall`, with
  the new detail; a job whose test raises its fake scope's `usage_usec` every 50 ms while its tool waits is still
  `running` when an idle job, whose tool started after it, has stalled (the order of events is the clock); the record's
  `cpuPeakPercent` is `null` while the job runs and 100 at its end after a raise no machine can reach (since G1 the
  raise follows a tick's logged failed read, so the first read of it lies a tick after the read before); an engine run
  shorter than half a tick keeps the peak `null` (G1); a removed
  `cpu.stat` gives the note with source `stall`, which clears once the file is back; a `cpu.stat` removed while the
  wrapper waits at the end gate is logged once and sets no note (review round 1, F1).
- `test/platform/linux.test.ts`: `cpuTime` reads `usage_usec`, and names a missing file and a file with no such line.
- `test/job/record.test.ts`: the scope's peak read (37, null, absent) and above 100 refused; the advisory's source read
  (`queue`), a record without it read as `stall`, and a source outside the two refused.
- `test/cli/show.test.ts`: the scope line with `peak 37%` and `peak unknown`.
- `test/hook/wake.test.ts`: a stall note reaches a session after the same job's queue diagnosis was delivered to it
  (the D-092 note); the owed-advisory test's slot is now `_advisory.stall.<session>`.
- `test/job/wake-delivery.test.ts`: the families per source and of the older slots; two unconfirmed attempts of the
  queue's note do not stop the stall's delivery.
- `test/cli/sweep.test.ts`: the sweep rings for a running job's stall note when a coordinator heard only its queue
  diagnosis, with the marker `_advisory.stall.<at>`.
- `test/runtime/start-queue.test.ts`: the diagnosis's advisory has `source: "queue"`.
- `test/config.test.ts`: `LIMEN_STALL_TICK_MS` is a test knob.
- `test/s3-finish-wake.test.ts`: the stall's log line has the new detail.

(i) Text: `docs/jobs.md` (the record's `scope` with `cpuPeakPercent`; the scope's paragraph with the samples and the
peak; the queue's advisory, source `queue`; the limits table; "Stalled tools" rewritten for the scope rule; the cargo
sentence, true only for a lock held outside the job's scope; "Job notes" with the sources and the new note; the seat
notification's last sentence, false before, now per source), `docs/remote.md:77`, the comments `src/job/record.ts`
(`Advisory`, `Scope`), the wrapper's (the block they described is gone), the headers of `src/platform/platform.ts` and
`src/platform/linux.ts`, and `src/job/view.ts`, `src/job/finalize.ts`. `docs/groups.md:69` and the filter
`src/job/group-events.ts:116` stay as they are: the note keeps the words `tool stall observation uncertain`, so both
stay true (Decision 4).

## Fixes of review round 1

`review.md` → Round 1 (PASS, four notes) and `ticket.md` → `## Decisions` → review round 1, at `HEAD` `7332de2`:

- F1 (note 1, T-01): `last()`, the sample at the engine's end in `scopeSamples` (`src/runtime/wrapper.ts`), dropped a
  failed read. It now logs the read's text once, with a tick's words (`tool stall observation uncertain: scope CPU
  unavailable: <reason>`, built by one function, `unreadLine`, for the tick and the end), and sets no note, since the
  job is ending; a text a tick already logged in the run is not logged again. The sample moved after `endGate`, the tests'
  hold of the wrapper once its engine ended (D-029), so a test can change the scope while the ticks have stopped; the
  gate's comment names it. Test: `test/runtime/wrapper.test.ts`, "a read of the scope's CPU time that fails at the
  engine's end is logged once with the stall's words, and sets no note": a `say all done` job held at the gate loses its
  `cpu.stat` there, ends `done`, its log holds that line once and its record no advisory.
- F2 (note 2): `docs/jobs.md:209` names 2 % as the rule's design threshold, above an idle Node process and far below a
  build, not a measured value, and says that while the idle CPU of the wrapper, Pi and the bridge's `claude` is above
  it the stall rule never ends a job and the job's time limit does (the ticket's Risk 1).
- F3 (note 4): `## Open points` 3.
- Note 3 is rejected (`review.md` → Round 1); nothing changed for it.

## Fixes of review round 2

`review.md` → Round 2 (PASS, three notes) and `ticket.md` → `## Decisions` → review round 2, at `HEAD` `7332de2`, the
last round of fixes:

- G1 (note 1, M-09): `peakAfter` (`src/runtime/stalled-tool.ts`) takes a fifth parameter, `minimumMs`, as `stallStep`
  takes the window: a pair of samples closer than it gives no rate and leaves the peak as it was. `scopeSamples`
  (`src/runtime/wrapper.ts`) passes half of `stallTickMs()`, so the end's sample counts only when it lies half a tick
  or more after the last tick, and an engine run shorter than half a tick keeps `cpuPeakPercent` `null`; the comment of
  the end's sample says so. `docs/jobs.md:55` names the 1.5 s and the `null` of a shorter run. Tests:
  `test/runtime/stalled-tool.test.ts`, "a pair of samples closer than the minimum interval gives no rate and leaves the
  peak, and a pair at it does"; `test/runtime/wrapper.test.ts`, "a job whose engine runs for less than half a tick
  keeps a null peak CPU share" (a tick of ten minutes, so the run is shorter). The wrapper's peak test, which a
  timing of reads could now leave without a rate, takes `cpu.stat` away until a tick logs its failed read, then raises
  it: its first read lies at least a tick after the read before it, by the order of events.
- G2 (note 3, T-29 (3)): `test/runtime/stalled-tool.test.ts`'s "one sample gives no peak, and a rate above the whole
  machine counts as all of it" is two tests, "one sample gives no peak" and "a rate above the whole machine counts as
  all of it".
- Note 2 (`runInternalJob`'s suppressions) is left to R-082's ratchet (`review.md` → Round 2); nothing changed for it.

## Proof

- The main session's runs (protocol step 4, after `compare --git` and D-101): `node adrian-rebuild/tools/gate.mjs` →
  tests 1086, pass 1086, fail 0, cancelled 0 (253.6 s; its exit code hidden by a pipe), and again → exit 0, the same
  counts (259.6 s); `node adrian-rebuild/tools/fails-before.mjs` → exit 0 (`## Fails before`). After the fixes of
  review round 1 (`compare --git` → "within its limits", exit 0): `node adrian-rebuild/tools/gate.mjs` → exit 0, tests
  1087, pass 1087, fail 0, cancelled 0 (249.9 s); `node adrian-rebuild/tools/fails-before.mjs` → exit 0, the same
  eleven files failing at `HEAD` `7332de2`. After the fixes of review round 2 (`compare --git` → "within its limits",
  exit 0): `node adrian-rebuild/tools/gate.mjs` → exit 0, tests 1090, pass 1090, fail 0, cancelled 0 (249.0 s);
  `node adrian-rebuild/tools/fails-before.mjs` → exit 0, the same eleven files.
- The implementer's runs: `node adrian-rebuild/tools/gate.mjs` → exit 0: tests 1086, pass 1086, fail 0 (1068 at HEAD: + 8 in the new
  `test/runtime/stalled-tool.test.ts`, + 4 in `test/runtime/wrapper.test.ts`, + 4 in `test/job/record.test.ts`, + 2 in
  `test/job/wake-delivery.test.ts`, + 1 in `test/hook/wake.test.ts`, + 1 in `test/cli/sweep.test.ts`, and in
  `test/platform/linux.test.ts` + 2 and − 4 parser tests); `tsc --noEmit` and `biome check --error-on-warnings .`
  inside it clean (247.8 s). It ran twice; the second run, on the final tree after comment rewraps only, the same.
- `node --test test/runtime/stalled-tool.test.ts` → exit 0, 8/8 (AC-1).
- `node --test test/runtime/wrapper.test.ts` → exit 0, 23/23; `node --test test/s3-finish-wake.test.ts` → exit 0, 7/7
  (AC-2).
- `node --test test/hook/wake.test.ts` → exit 0, 15/15; `node --test test/job/wake-delivery.test.ts` → exit 0, 3/3
  (AC-3).
- `node --test test/platform/linux.test.ts` → exit 0, 26/26; `node --test test/job/record.test.ts` → exit 0, 42/42
  (AC-4).
- `node --test test/cli/show.test.ts` → exit 0, 3/3; `node --test test/structure.test.ts` → exit 0, 50/50 (AC-5).
- Also: `test/cli/sweep.test.ts` 27/27, `test/runtime/start-queue.test.ts` 18/18, `test/config.test.ts` 11/11,
  `test/runtime/queue-diagnosis.test.ts` 7/7, `test/job/finalize.test.ts` 11/11, each exit 0.
- `npx tsc --noEmit` → exit 0; `npx biome check --error-on-warnings .` → exit 0 (279 files) (AC-8).
- `node adrian-rebuild/tools/check.mjs` → exit 0 (`0 errors`, 253 PL summaries); `npx biome check --error-on-warnings
  adrian-rebuild` → exit 0 (34 files).
- AC-6: the main session's `fails-before.mjs` → exit 0; it and the implementer's runs before the change are in
  `## Fails before`.
- Review round 1, the implementer's runs after F1–F3: `node adrian-rebuild/tools/gate.mjs` → exit 0: tests 1087, pass
  1087, fail 0 (+ 1, F1's test; 257.7 s); `npx tsc --noEmit` → exit 0; `node --test --test-name-pattern="fails at the
  engine's end|TERM to the job's wrapper after its engine exited 0" test/runtime/wrapper.test.ts` → exit 0, 2/2 (F1's
  test and the other user of the end gate); `npx biome check --error-on-warnings .` → exit 0 (279 files);
  `node adrian-rebuild/tools/check.mjs` → exit 0 (`0 errors`, 254 PL summaries); `npx biome check --error-on-warnings
  adrian-rebuild` → exit 0 (34 files).
- Review round 2, the implementer's runs after G1–G2: `node adrian-rebuild/tools/gate.mjs` → exit 0: tests 1090, pass
  1090, fail 0 (+ 3: G1's two tests and G2's split; 244.6 s); `npx tsc --noEmit` → exit 0; `node --test
  test/runtime/stalled-tool.test.ts` → exit 0, 10/10; `node --test test/runtime/wrapper.test.ts` → exit 0, 25/25;
  `npx biome check --error-on-warnings .` → exit 0 (279 files); `node adrian-rebuild/tools/check.mjs` → exit 0
  (`0 errors`); `npx biome check --error-on-warnings adrian-rebuild` → exit 0.

## Fails before

AC-6, the main session's run at HEAD `7332de2` (the commit `D-101:` on `903a8c9`, which changes no source or test):
`node adrian-rebuild/tools/fails-before.mjs` → exit 0, first line: `fails-before: test/cli/show.test.ts,
test/cli/sweep.test.ts, test/config.test.ts, test/hook/wake.test.ts, test/job/record.test.ts,
test/job/wake-delivery.test.ts, test/platform/linux.test.ts, test/runtime/start-queue.test.ts,
test/runtime/wrapper.test.ts, test/s3-finish-wake.test.ts, test/runtime/stalled-tool.test.ts fail at HEAD (exit 1)`;
among its output, the s3 stall's log at HEAD ends `stalled tool bash sleep 600: CPU-idle child for 2s; TERM sent to
process group …` against the new detail, and a wrapper scenario's `[ false, undefined, true, 'running' ]` against
`[ true, 'stall', true, 'running' ]`.

The implementer's runs at the working tree with the tests written and no source change (HEAD `903a8c9`):

- Review round 2, G1, at the tree under review with the new tests and no fix: `node --test
  test/runtime/stalled-tool.test.ts` → 1 of 10 fails: the minimum test, `actual: [ 100, 100, 25 ]` against
  `[ null, 10, 25 ]` (the pair 1 ms closer than the minimum gave a rate); `node --test --test-name-pattern="peak CPU
  share" test/runtime/wrapper.test.ts` → 1 of 2 fails: the run shorter than half a tick, `0 !== null` (the samples at
  its start and end gave a rate of 0); the reworked peak test passed. G2's two tests are a split of one that passed.
- Review round 1, F1, at the tree under review with the new test and no fix:
  `node --test --test-name-pattern="fails at the engine's end" test/runtime/wrapper.test.ts` → 1 of 1 fails: the count
  of the line in the log `0` against `1` (the end's sample read the file before the gate and dropped nothing; after the
  gate no read logged). At `HEAD` `7332de2` no code writes that line.
- `node --test test/runtime/stalled-tool.test.ts` → the file fails: `SyntaxError: The requested module
  '../../src/runtime/stalled-tool.ts' does not provide an export named 'peakAfter'`.
- `node --test test/platform/linux.test.ts` → 2 fail: `TypeError [Error]: linux.cpuTime is not a function`.
- `node --test test/job/record.test.ts` → the file fails: `SyntaxError: The requested module '../../src/job/record.ts'
  does not provide an export named 'advisorySource'`.
- `node --test test/job/wake-delivery.test.ts` → 2 of 3 fail: the families `actual: [ '_advisory', '_advisory',
  '_advisory', '_advisory', '_start', '_completion' ]`; the stall's delivery `[ true, false, [] ]` against
  `[ true, true, [ 'stall' ] ]`.
- `node --test test/config.test.ts` → 1 of 11 fails: the registry test (`LIMEN_STALL_TICK_MS` unregistered).
- `node --test test/cli/show.test.ts` → 1 of 3 fails: `undefined` (the record with `cpuPeakPercent` is refused) and
  `'  scope memory peak unknown · CPU unknown · OOM kills unknown'` against the lines with `peak`.
- `node --test test/hook/wake.test.ts` → 2 of 15 fail, both `the condition did not hold in time`: the owed-advisory
  test (no claim `_advisory.stall.<session>`) and the D-092 test (the record with `source` is refused).
- `node --test test/runtime/start-queue.test.ts` → 1 of 18 fails: the diagnosis's advisory has no `source`.
- `node --test --test-name-pattern="stall advisory when a coordinator" test/cli/sweep.test.ts` → 1 of 1 fails:
  `actual: []` against `[ '_advisory.stall.1795541195628' ]`.
- `node --test --test-name-pattern="stall|peak CPU share|cpu.stat is gone" test/runtime/wrapper.test.ts` → 4 of 4 fail:
  the stall's detail `'stalled tool bash sleep 600: CPU-idle child for 1s'`; the busy job `'failed'`, `stalled tool` in
  its log, and its scope folder gone (`ENOENT … cpu.stat.next`), since the `ps` rule ended it; the peak `[ undefined,
  undefined ]` against `[ null, 100 ]`; the note `[ false, undefined, … ]` against `[ true, 'stall', … ]`. (In the first
  run the busy test's writer threw once the busy scope was gone and kept the file's process alive; the writer now stops
  at its first failed write, and its rerun above failed in 7.8 s.)
- `node --test --test-name-pattern="a stalled tool each end a job once" test/s3-finish-wake.test.ts` → 1 of 1 fails:
  the log does not match `stalled tool bash sleep 600: scope CPU idle and no tool progress for 2s`.

## Deviations from the ticket

- Files the ticket's `## Change` does not name: `src/runtime/queue-diagnosis.ts` (`machineShare`, the one formula of the
  machine share, T-25 (2)), `src/job/finalize.ts` (the `cpuPeakPercent` option), `src/job/listing.ts` and
  `src/job/view.ts` (the show line), `src/runtime/start-queue.ts` (the queue's source), `src/platform/requirements.ts`
  (the `ps` message, false once the process table goes), `test/plant.ts` (the knob), `test/cli/sweep.test.ts`,
  `test/runtime/start-queue.test.ts`, `test/config.test.ts`.
- (d): a failed read while no tool is pending is logged once (no note), which the ticket does not say; T-01.
- (e): the wrapper also samples once at the engine's end, whose rate counts when it lies half a tick or more after the
  last tick (review round 2, G1); a rate above the whole machine is capped at 100, and the record's validator allows
  0–100.
- `cpuPeakPercent` and `source` stay absent, not `null` or `stall`, in a record written before this ticket; the read
  default of the source is the one function `advisorySource`, which the hook and the sweep use.

## Unmeasured

- `unmeasured` M-09: the peak CPU share of real job scopes on the seat; `cpuPeakPercent` is the record field M-09 reads.
- `unmeasured` (seat step 3.8, T-28 (5)): a real `sleep 300` job ends `stall` with `scope CPU idle` in its log; whether
  the scope's idle CPU (wrapper, Pi, the bridge's `claude`) stays below 2 % of the wall time; a busy loop detached by
  one tool keeps a job whose next tool sleeps past the window; `cpuPeakPercent` in a trial record. Tested here on the fake
  `cpu.stat` only.

## Open points

1. `runInternalJob` keeps its two "split pending" suppressions (T-27 (1)), as R-028 and R-035 did; this ticket moved
   the stall code out of it into `scopeSamples`, so the function got shorter.
2. The old note texts (`CPU or process identity unavailable`) stay in `test/cli/status.test.ts` and
   `test/hook/wake.test.ts` as planted text of an older record; no code writes them any more.
3. For gate 5.3 (review round 1, note 4, F3): `hadChild` is gone (Decision 2), so a pending tool with no child process,
   an in-process tool that waits with no output while the whole scope is idle, can now stall after the window, which
   `HEAD` never ended; the ticket accepts it (Risk 2, A-059's Decision). Seat step 3.8 checks only `sleep 300` and a
   detached busy loop; its trial records, `failure.kind` `stall` with the tool in `failure.detail`, show any `stall` end
   of a tool other than `bash`.
4. Review round 3's note (`review.md` → Round 3; D-092): the end's sample awaits its log line with no catch
   (`src/runtime/wrapper.ts:640-645`), so a failed `cpu.stat` read and a failed log append at once end a job whose
   engine exited 0 `failed`, kind `internal` (`src/main.ts:72-79`), while a tick sends the same failure to `failLog`.
   It went to R-082's notes in `plan.md` → `## Tickets` (swallowed and side-channel errors, T-01).
