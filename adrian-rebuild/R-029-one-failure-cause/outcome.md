<!-- PL: Wynik R-029 (24.11, przy `3a9e48c`; recenzja zamknięta po trzech rundach PASS): każdy detektor sam podaje rodzaj porażki joba do
`finalizeJob`, a wzorce na tekście zostają tylko dla migracji; dziewięć zakończeń bez rodzaju dostaje `launch`,
`internal` albo `timeout` (D-095). Dla `quota` godzina resetu pochodzi ze zdarzenia `kendex:rate-limit` (nowy hook
`hook/rate-limit.ts`, pole `rateLimit`, linia w logu), a bez niego z tekstu `errorMessage` ze strefą; odmowa strażnika
Pi jest zapisywana przez `recorded` adaptera, zanim błąd dojdzie do Pi: w jobie w polu `refusal` (koniec `engine-error`),
w sesji koordynatora w jej folderze (linia w `limen status`). TERM wyczerpania loguje swój wynik, a flaga TERM jest brana
przy `exit` silnika. Poprawki rundy 1 recenzji (F1–F5): ucieczka tekstu odmowy w `limen status`, deterministyczny test
odmowy przed timeoutem, podział dwóch testów, lista hooków z katalogu `hook/` w teście T-32 i komentarz; rundy 2
(G1–G2): odmowa trafia tylko do folderu sesji o zgodnym pid i czasie startu, a test `limen show` pada przed zmianą
tylko na brakującej linii. Bramka po poprawkach: 971/971. -->

# R-029 outcome

## Done

(a) One failure cause, set by its detector (A-016 (1)):
- `finalizeJob(jobDir, end, options)` (`src/job/finalize.ts`) takes a `JobEnd`: `done` or `stopped` with a detail, or
  `failed` with the `DetectedFailure` (kind, detail, and for `quota` the reset time) its detector passes. The kind is
  never read back from the detail; `recordedFailure` turns a passed `signal` or `reaped` into `oom` from the scope's
  readings, as before. `requestedEnd(reason)` is the end a stop request asks for (`limen stop`, the wrapper).
- The detectors: the wrapper's limits (`timeout`, `tool-cap`, `stall`, through `exhaust`), a nonzero exit (`exit`), a
  signal with no stop request (`signal`), the start queue (`queue`), the reaper (`reaped`, `src/runtime/reap.ts`), and
  the engine's failed stop reason (`quota` or `engine-error`, `stopFailure` in `src/runtime/wrapper.ts`).
- The rule of the stop reason is one function, `engineStopKind` (`src/job/record.ts`, beside `isRateLimit`): the
  detector calls it, and so does the migration's `failureKind`, so the migration still fills `quota` from the old texts
  (D-057 (4), D-071). `failureFrom` and `FAILURE_PATTERNS` are reached only by the migration (`src/job/migration.ts`).

(b) The nine ends of fact 3 (D-095): `launch` for the wrapper outside its scope, the missing worktree, the engine's
spawn error, a failed spawn or group launch (`src/job/spawning.ts`), the two failed wrapper launches
(`src/job/spawning.ts`, `src/job/continuation.ts`) and the handshake; `internal` for `failInternalJob`; `timeout` for the
group deadline before launch. `launch` and `internal` follow `quota-exhausted` in `FAILURE_KINDS`, which orders `limen
stats` and which the validator and the alerts' `failed:<kind>` take.

(c) The reset time of `quota`:
- The Pi adapter declares Pi's event bus (`events`, `PiEventBus`), the bridge's channel `RATE_LIMIT_EVENT` and the
  guard `piRateLimit` (`rateLimitType`, `resetAtMs` as a time in epoch milliseconds, each optional); the contract
  fixture of `test/runtime/pi-contract.test.ts` has `EventBus`, and the contract passes on the vendor copy of Pi 1.5.1.
- A new job hook, `hook/rate-limit.ts`, loaded for every job (`src/runtime/wrapper.ts`), writes each event through
  `recordRateLimit` into the record's optional field `rateLimit` (`type`, `resetAt`, `at`; D-079) and the log line
  `rate-limit event: <type>, resets <ISO time>` (seat step 3.4).
- At the job's end the reset time is the event's, else `limitReset(stopReason, the time the stop reason came)`:
  `resets 3pm (UTC)` is the first such hour after the error, `resets Nov 26, 5pm (Europe/Warsaw)` that time (the year
  nearest the error), and a text with no zone, a zone the clock does not know, or no reset gives `null`.

(d) A guard's refusal in a job (T-32 (4)): every hook registers each handler, tool, command and bus listener through
the adapter's `recorded`. A guard's BAD_DATA now carries its place; `recorded` writes it, then gives Pi the error as a
rejection, so the event handlers, `tool_call` and a tool's `execute` are one path. In a job it goes through
`recordRefusal` into the optional field `refusal` (`event`, `field`, `message`, `at`; the first one kept) and a log line.
At the job's end (`engineEnding`) a refusal makes `done`, `exit` and an `engine-error` stop reason `failed`, kind
`engine-error`, detail `a Limen hook refused Pi event <name>: <field>: expected …, got …`; a limit, a signal, a queue
end and `quota` keep their kinds.

(e) A guard's refusal in a coordinator's session: `recorded` writes the newest refusal into `refusal.json` of the
session's folder `.limen/coordinators/<session>/` (`writeCoordinatorRefusal`); `limen status` reads every such file
(`coordinatorRefusals`) and shows one line per session, `Coordinator session <session>, <time>: a Limen hook refused
…`, and writes nothing. The wake hook's `projectRoot` moved to `coordinatorProject` in
`src/integrations/coordinator-registration.ts`, since the writer needs it too (T-25 (2)).

(f) The D-092 note: the exhaustion's TERM logs its result after the call in `signalLine`'s form (`timeout after 1000ms;
TERM sent to process group <pid>`), its write failure through `failLog`, with no `.catch(() => {})` (the `SWALLOWED`
baseline is 18); the TERM's flag is taken at the engine's `exit`, and the outcome still resolves at `close`.

(g) The fake engine (`test/fake-engine.mjs`): `error <text>` (an assistant error with that `errorMessage`),
`rate-limit <type> <resetAtMs>` (the bridge's event on `pi.events`), `malformed <event>` (the event with an empty
payload), `linger` (a child that holds the engine's pipes after it exits); `fire` reports a handler's throw on stderr
as `Extension error (<path>): <message>` and goes on, as Pi does.

(i) `limen show` prints `failure <kind>` and, for `quota`, `· resets <time>` or `· resets unknown` (compact and terminal
views, detail only). `docs/jobs.md` (the `failed` row, the failed rows, the record), `docs/commands.md` (the status
line, the show line) and the comments of `src/job/record.ts` and `src/job/finalize.ts` say so.

## Fixes of review round 1

From `ticket.md` → `## Decisions`, "Review round 1" (`review.md` → Round 1, PASS with notes):
- F1 (note 6): `limen status` prints a coordinator session's folder name and its refusal's detail through
  `shownField` (`src/boundary.ts`), as R-030's prune lines do, so a planted `refusal.json` or folder name with a newline
  adds no line to what the coordinator reads (`src/project/summary.ts`, `refusalLines`); `docs/commands.md` says so.
  New test: "limen status escapes a newline in a coordinator session's name and in its refusal's message, so the
  refusal stays one line".
- F2 (note 5): "a hook's refusal recorded before the job's timeout …" no longer races the engine's start against the
  1 s timeout: the record's one writer (`transition`) writes the refusal while the job's `--prepare` waits on a FIFO,
  before the engine and its time limit start, and the test then opens the FIFO; the order is the test's.
- F3 (note 4, T-29 (3)): the status test is now "limen status shows a hook's refusal in a coordinator's session on one
  line, …" and "T-04: limen status reads a coordinator session's refusal and writes nothing: …"; the record test is now
  "a record reads with the failure kinds launch and internal" and "a record reads with its optional rateLimit and
  refusal, and a record without them reads with neither".
- F4 (note 10): the T-32 test takes its hooks from the TypeScript files git knows in `hook/` (`knownFilesBelow`), keyed
  by file, so a new hook file is checked for `recorded`.
- F5 (T-30): the comment of the exhaustion's log line says what `failLog` does: it writes a `log write failed` line and
  gives up when that write fails too.

Proof of the fixes, on the working tree (`HEAD` `3a9e48c`, index empty), with `TMPDIR` the gate's private folder:
- The new F1 test before the fix (its `src/project/summary.ts` change not yet made): `node --test
  --test-name-pattern='coordinator session' test/cli/status.test.ts` → 1 pass, 1 fail: "limen status escapes a newline
  …", actual `'Coordinator session coord'` against the one escaped line, and `run.stdout.includes("\nInjected")` true;
  after the fix it passes.
- `node --test --test-timeout=180000 test/job/record.test.ts test/runtime/pi-api.test.ts test/cli/status.test.ts
  test/runtime/wrapper.test.ts` → exit 0, tests 104, pass 104, fail 0.
- `node adrian-rebuild/tools/gate.mjs` → exit 0: tests 970, pass 970, fail 0, cancelled 0, skipped 0, todo 0 (263.6 s;
  no `✖` and no `npm error` line; its Biome step "Checked 269 files … No fixes applied."). Three tests more than
  before: the status test became three, the record test two.
- `npx biome check --error-on-warnings src hook test docs` → exit 0; `npx tsc --noEmit` → exit 0; `node
  adrian-rebuild/tools/check.mjs` → exit 0; `npx biome check --error-on-warnings adrian-rebuild` → exit 0.
- `node adrian-rebuild/tools/fails-before.mjs` (every new or changed test file) → exit 0, the same first line as in
  `## Fails before`. For the files the fixes changed, `node adrian-rebuild/tools/fails-before.mjs <file>` → exit 0 each:
  - `test/cli/status.test.ts`: on a whole copy of `HEAD` (`node --test --test-timeout=180000 test/cli/status.test.ts`
    → tests 22, pass 20, fail 2), "limen status shows a hook's refusal in a coordinator's session on one line, …" and
    "limen status escapes a newline …" fail; "T-04: limen status reads a coordinator session's refusal and writes
    nothing: …" passes at HEAD, which writes nothing there either (behaviour that stays);
  - `test/job/record.test.ts`: `SyntaxError: … does not provide an export named 'limitReset'`, as before;
  - `test/runtime/pi-api.test.ts`: `SyntaxError: … does not provide an export named 'isRecorded'`, as before;
  - `test/runtime/wrapper.test.ts`: "a hook's refusal recorded before the job's timeout …" fails at HEAD, whose record
    refuses the field: `refusal: expected one of the fields version, id, state, …, landed or abandoned, got
    {"event":"message_end","field":"message"…`; "a timeout's TERM to the job's process group …" fails as before.

## Fixes of review round 2

From `ticket.md` → `## Decisions`, "Review round 2" (`review.md` → Round 2, PASS with notes; the second and last round
of fixes):
- G1 (note 3): `writeCoordinatorRefusal` (`src/integrations/coordinator-registration.ts`) writes only into the
  registration folder whose `pid` is this process's and whose `born`, once recorded, is this process's start time, as
  the sweep's liveness check (`registeredProcess`) reads the two; a dead session's folder whose pid this process
  reused takes nothing (A-058). New test in `test/integrations/coordinator-registration.test.ts`: "a hook's refusal
  goes only into the folder whose pid and start time are this process's, never a stale one of the same pid" (the
  stale folder is alone at the first write, so the order of the folder listing cannot hide the defect).
- G2 (note 1): the show test's third record has the kind `timeout`, which `HEAD` knows, so at `HEAD` the test fails
  only on the missing `failure` line; the new kinds stay proven by the record and alerts tests.

Proof of the fixes, on the working tree (`HEAD` `3a9e48c`, index empty), with `TMPDIR` the gate's private folder:
- G1's test before the fix (the new `writeCoordinatorRefusal` matched by pid alone): `node --test
  test/integrations/coordinator-registration.test.ts` → 1 pass, 1 fail, actual `[ true, true, true ]` against
  `[ false, false, true ]`: the stale folder took the refusal. After the fix the file passes; `node --test
  test/integrations/coordinator-registration.test.ts test/cli/show.test.ts test/runtime/pi-api.test.ts
  test/cli/status.test.ts` → tests 55, pass 55, fail 0.
- `node adrian-rebuild/tools/gate.mjs` → exit 0: tests 971, pass 971, fail 0, cancelled 0, skipped 0, todo 0 (253.0 s;
  no `✖` and no `npm error` line; its Biome step "Checked 269 files … No fixes applied."); one test more than round 1.
- `npx tsc --noEmit` → exit 0; `npx biome check --error-on-warnings src hook test docs` → exit 0; `node
  adrian-rebuild/tools/check.mjs` → exit 0; `npx biome check --error-on-warnings adrian-rebuild` → exit 0.
- `node adrian-rebuild/tools/fails-before.mjs` (every new or changed test file) → exit 0; its first line now also names
  `test/integrations/coordinator-registration.test.ts`:

  ```
  fails-before: test/cli/show.test.ts, test/cli/status.test.ts, test/hook/group-peer.test.ts, test/integrations/coordinator-registration.test.ts, test/job/finalize.test.ts, test/job/record.test.ts, test/runtime/pi-api.test.ts, test/runtime/pi-contract.test.ts, test/runtime/wrapper.test.ts, test/s3-finish-wake.test.ts, test/seat/alerts.test.ts, test/structure.test.ts fail at HEAD (exit 1)
  ```

- File by file, `node adrian-rebuild/tools/fails-before.mjs <file>` → exit 0 each:
  - `test/integrations/coordinator-registration.test.ts`: `SyntaxError: The requested module
    '../../src/integrations/coordinator-registration.ts' does not provide an export named 'writeCoordinatorRefusal'`
    (the writer is R-029's; its defect is shown by the run before the fix above);
  - `test/cli/show.test.ts`: the new test fails on the missing line alone, actual `[ [ 0, undefined ], [ 0, undefined ],
    [ 0, undefined ] ]` against `failure quota · resets 2026-11-24T15:00:00.000Z`, `failure quota · resets unknown` and
    `failure timeout`: each `show` exits 0 at `HEAD` now.

## Proof

From the repository root, on the working tree (`HEAD` `3a9e48c`, index empty), 2026-11-24:
Each test run with `TMPDIR` the gate's private folder, as `gate.mjs` sets it:
- AC-1, AC-3: `node --test --test-timeout=180000 test/job/record.test.ts test/job/finalize.test.ts
  test/runtime/pi-api.test.ts test/runtime/pi-contract.test.ts` → exit 0, tests 80, pass 80, fail 0 (the real vendor
  contract included).
- AC-2: `node --test --test-timeout=180000 test/runtime/wrapper.test.ts` → exit 0, tests 19, pass 19, fail 0.
- AC-2, AC-4, AC-5, AC-6: `node --test --test-timeout=180000 test/cli/status.test.ts test/cli/show.test.ts
  test/cli/stats.test.ts test/seat/alerts.test.ts test/structure.test.ts test/s3-finish-wake.test.ts` → exit 0, tests
  128, pass 128, fail 0. An earlier run of these files with `test/hook/group-peer.test.ts` and
  `test/fake-engine.test.ts` had one failure, the new show test, whose fixture lacked a branch (the detail read
  `INVALID … job id, label, and branch must not be empty`); the fixture got one.
- AC-8: `node adrian-rebuild/tools/gate.mjs` → exit 0: tests 967, pass 967, fail 0, cancelled 0, skipped 0, todo 0
  (229.2 s; no `✖` and no `npm error` line; its Biome step "Checked 269 files … No fixes applied.").
- AC-9: `npx biome check --error-on-warnings .` → exit 0 (in the gate's `npm run check`); `node
  adrian-rebuild/tools/check.mjs` → exit 0; `npx biome check --error-on-warnings adrian-rebuild` → exit 0; `npx tsc
  --noEmit` → exit 0.
- The ratchets of `test/structure.test.ts` hold: no `catch {` added, one `.catch(() => {})` removed, no cast added (the
  rate-limit guard returns its value through an assertion function), no write primitive outside
  `src/atomic-write.ts`, the 429 rule only in `src/job/record.ts`, no ISO-time pattern added.
- AC-10 (judgment): every `failed` end written by the changed code passes a `DetectedFailure` whose kind is a literal
  of its detector (`launch`, `internal`, `timeout`, `tool-cap`, `stall`, `exit`, `signal`, `queue`, `reaped`) or
  `engineStopKind` of the stop reason; the type makes the kind non-null. The reset time is read only from the record's
  `rateLimit` (the bus event) or from the stop reason, which is the provider's `errorMessage` (E-9). A refusal is
  written by `recorded` before Pi sees the error, and the T-32 test checks that every handler of every hook goes
  through it, in a job and in a coordinator.

The main session's own runs (`## Agents`, step 4; these count), each after `review-guard.mjs compare --git` → exit 0:
- before review round 1: `node adrian-rebuild/tools/gate.mjs` → exit 0, tests 967, pass 967, fail 0 (263.6 s);
  `node adrian-rebuild/tools/fails-before.mjs` → exit 0, eleven files;
- after F1–F5: `gate.mjs` → exit 0, tests 970, pass 970, fail 0 (245.6 s); `fails-before.mjs` → exit 0, eleven files;
- after G1–G2: `gate.mjs` → exit 0, tests 971, pass 971, fail 0 (247.7 s); `fails-before.mjs` → exit 0, twelve files
  (`test/integrations/coordinator-registration.test.ts` added);
- after the last edits: `node adrian-rebuild/tools/check.mjs` → exit 0; `npx biome check --error-on-warnings
  adrian-rebuild` → exit 0.

## Fails before

AC-7, `node adrian-rebuild/tools/fails-before.mjs` (every new or changed file under `test/`, the fake engine included,
over a copy of `HEAD`) → exit 0, first line:

```
fails-before: test/cli/show.test.ts, test/cli/status.test.ts, test/hook/group-peer.test.ts, test/job/finalize.test.ts, test/job/record.test.ts, test/runtime/pi-api.test.ts, test/runtime/pi-contract.test.ts, test/runtime/wrapper.test.ts, test/s3-finish-wake.test.ts, test/seat/alerts.test.ts, test/structure.test.ts fail at HEAD (exit 1)
```

The line names the files of one run that exits 1, not each file failing. File by file (`node
adrian-rebuild/tools/fails-before.mjs <file>`, whose tail holds 40 lines), and for the wrapper and finalize files the
same tests run whole on a copy of `HEAD` from `git archive` with the new tests and fake engine over it (`node --test
--test-timeout=180000 test/runtime/wrapper.test.ts test/job/finalize.test.ts` → exit 1, tests 29, pass 11, fail 18):
- `test/job/record.test.ts` → exit 0 (fails at HEAD): `SyntaxError: The requested module '../../src/job/record.ts'
  does not provide an export named 'limitReset'` (the reset time, the two kinds and the optional fields, and
  `recordRefusal` are new).
- `test/job/finalize.test.ts` → exit 0: all ten tests fail at HEAD on BAD_DATA, `state: expected one of "starting", …,
  got {"state":"stopped","detail":"stopped by …` (the call shape `finalizeJob(jobDir, end)`); the mechanism test
  "finalizeJob records the kind, the detail and the reset time its detector passes, whatever a pattern reads in the
  detail" fails so too.
- `test/runtime/wrapper.test.ts` → exit 0; at HEAD (actual values):
  - "a wrapper that does not run in its job's systemd user scope …": `[ null, true, '' ]` (no kind, `launch` expected);
  - "an error the job's wrapper throws …": `{ kind: null, detail: 'internal job wrapper is missing LIMEN_PREAMBLE', … }`;
  - "an engine that stops on the provider's limit text …": `[ 'quota', "error: You've hit your session limit · resets 3pm
    (UTC)", undefined, false ]` (no reset time);
  - "a kendex:rate-limit event before the limit's text …": `[ 'quota', null, undefined, undefined, false ]`;
  - "a hook's refusal of a malformed Pi event in a job …": the state `'done'`;
  - "a hook's refusal recorded before the job's timeout …", in its form before review round 1's F2: `[ 'timeout',
    undefined ]` (the kind stays at HEAD too; the test fails there on the refusal its record does not hold);
  - "a timeout's TERM to the job's process group leaves its result in the log …": `false` (HEAD logs `timeout after
    1000ms; sending TERM`);
  - "a TERM to the job's wrapper after its engine exited, while a child still holds the engine's pipes …": `[ 'failed',
    { kind: 'signal', detail: 'killed by SIGTERM', resetAt: null }, '' ]`;
  - the eleven unchanged tests pass at HEAD.
- `test/runtime/pi-api.test.ts` → exit 0: `SyntaxError: … does not provide an export named 'isRecorded'` (the
  rate-limit guard, `recorded`, the T-32 test and the coordinator's refusal file are new).
- `test/runtime/pi-contract.test.ts` → exit 0: "the contract fails Pi types that lack the event bus the adapter
  declares, and names it" fails at HEAD, whose adapter declares no `events`; the fixture's new `EventBus` keeps the other
  fixture tests passing there (the vendor test is skipped in the copy, which has no `input/`).
- `test/cli/status.test.ts` → exit 0: the new refusal test fails at HEAD, which prints no `Coordinator session` line
  (`[]`); the other 19 pass.
- `test/cli/show.test.ts` → exit 0: in its form before review round 2's G2, the new test failed at HEAD with exit 4 for
  each `show`, since a record holding the kind `launch` is BAD_DATA there (now it fails on the line alone).
- `test/seat/alerts.test.ts` → exit 0: "a failed job whose record names the kind launch sends the kind launch" fails at
  HEAD with exit 4: `failure.kind: expected null or one of "quota", … or "quota-exhausted", got "launch"`.
- `test/structure.test.ts` → exit 0: "T-01: the catch-all sites …" fails at HEAD: `19 sites of .catch(() => {}), at most
  18`.
- `test/s3-finish-wake.test.ts` → exit 1, "pass at HEAD, so they do not show the change", 7/7: its new assertions name
  the kinds `exit`, `engine-error`, `timeout`, `stall` and `tool-cap` of ends whose details HEAD's patterns already
  name so. They are T-31 (3)'s scenarios per kind, behaviour that stays; what changes for them is who sets the kind, and
  the finalize test above shows that the kind passed wins over the detail.
- `test/hook/group-peer.test.ts` → exit 1, "pass at HEAD": its refusal test now awaits the handler's rejection
  (`assert.rejects` of an async call), which holds for HEAD's throw and for `recorded`'s rejection; the refusal itself is
  unchanged.
- The kinds `signal`, `oom`, `queue` and `reaped` keep their existing kind assertions (`test/runtime/wrapper.test.ts`,
  `test/s9-housekeeping.test.ts`), unchanged, so they pass at HEAD as before.

## Deviations

1. The refusal field holds four parts, not three: the event, the field, the time, and the guard's whole message, since
   the detail `a Limen hook refused Pi event <name>: <field> …` needs the expectation and the value the record holds
   only there.
2. "The adapter records it before it throws": a guard throws at once, and the record's one writer is asynchronous (the
   job's lock, A-019), so the write happens in `recorded`, around every handler a hook registers, before the error
   reaches Pi; a handler that returns at once still returns at once, and only a refusal becomes a rejection.
   `test/hook/group-peer.test.ts` therefore awaits the refusal of the `tool_call` handler instead of catching a throw.
3. The coordinator's refusal goes into the registration folder whose `pid` and `born` are the hook's process (G1),
   under the project of the process's working folder, so a refused context still finds it; a session with no
   registration (neither
   `LIMEN_COORDINATOR` nor a Herdr pane), or a refusal before the wake hook registered the session (its own
   `session_start` guard), gets no file, and Pi's message in the chat is the trace.
4. A refusal that cannot be written goes on to Pi as a BAD_DATA whose message holds the refusal and the write's
   failure (T-01).
5. The status line and the show line are the implementer's words (no golden text in the ticket): `Coordinator session
   <session>, <time>: <detail>` and `failure <kind>[ · resets <time>|unknown]`.
6. The fake engine waits for each bus listener it calls, where the bridge emits without waiting, so a listener's record
   write is there before the next word; real Pi exits only after the pending write (its print mode returns, and the
   process ends when the loop is empty).
7. (h) asks each test to fail before the change. The scenario tests of the kinds that HEAD's patterns already name
   (`exit`, `engine-error`, `timeout`, `stall`, `tool-cap` in `test/s3-finish-wake.test.ts`) pass at HEAD, since the
   details are the same; `## Fails before` names them with that reason. The kinds no pattern names (`launch`,
   `internal`, a refusal's `engine-error`, the reset time of `quota`) and finalize's taking of the passed kind fail at
   HEAD.
8. The new hook `hook/rate-limit.ts` is the job hook of (c), a file of its own beside `finish.ts`, since it serves the
   rate-limit event and not the `finish` tool.
9. `engineStopKind` is shared by the detector and the migration's `failureKind` rather than moved out of it, since the
   migration still fills `quota` and `engine-error` from old stop reasons (D-057 (4), D-071).

## Unmeasured

- M-11 (failure kinds per ticket in `limen stats`): the kinds of the seat's next failures; B.3 and 9.1.
- Seat step 3.4: whether the CLI sends a `rate_limit_event` for the 5-hour and the weekly limit (the log line), and the
  real limit text's zone; the fake engine's tests cover the mechanism.

## Open points

1. D-097 (6) (b) has R-102 remove the coordinator registration (`.limen/coordinators/`); R-029's refusal file lives in
   that folder. `plan.md` → `## Tickets` carries this as R-102's note (R-029 review round 1, note 2): R-102 keeps a
   per-session place for the file or moves it, with `limen status`'s warning and its test, and closes the gap of a
   session that never registered. Review round 3's two notes went to the same note, the rounds of fixes being spent
   (D-092): a folder with no recorded `born` still matches on the pid alone, and `coordinatorRefusals` reads
   `refusal.json` with a plain `readFile` (a symlink is followed, and a directory or an unreadable file makes the whole
   `limen status` fail instead of showing its BAD_DATA).
2. `read-only-violation` (R-045) and `quota-exhausted` (R-034) still have no detector and no test.
3. A status line can pass 100 characters (T-10) with a long session id or message; R-073 carries T-10 for `limen
   status`.
4. For Adrian at gate 5.3 (review round 1, note 9, T-18): "refusal" now names two things, a command's exit-1 refusal
   (T-02, T-38) and a guard's BAD_DATA of a Pi value, which R-029 records (`refusal` in the record, `refusal.json` in a
   coordinator session's folder, `recordRefusal`, `writeCoordinatorRefusal`). The guard's wording is that of T-32 (4),
   D-055 and R-017's `refuse`; another name for it is a naming decision.
