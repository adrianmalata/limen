<!-- PL: Wynik ticketu R-015 (20.11; szkic implementera): nowy moduł `src/config.ts` jest jedynym miejscem w `src/`,
`hook/`, `bin/` i `seat/`, które czyta zmienne LIMEN_* ze środowiska; rejestr `ENVIRONMENT` daje każdej z 48 nazw
inwentarza rodzaj (transport, test, wyjątek, usunięta) i budowniczowie środowiska wrappera, silnika i `group advance`
zamykają wycieki `LIMEN_TIMEOUT_MS` i `LIMEN_CONTINUE`. Limity przychodzą tylko z `limits.json` (z nowym `toolCalls`),
bramka startu tylko z `start-gate.json` seata (także `"off"`), a `limen status` wypisuje ignorowane zmienne ustawień i
wyjątki. Po recenzji 1 (PASS z ośmioma uwagami) poprawki 1–6: test s3 sprawdza tylko limit narzędzi, test spawn
pokazuje sam wyciek, jeden wspólny pomocnik środowiska w testach, ścieżka `~/.limen` w dokumentacji i lista testów
przechodzących na HEAD. Po recenzji 2 (PASS z czterema uwagami) poprawki 1–4: `~/.limen` w każdym zdaniu `docs/`,
test `setTestKnob`, bieżące testy na początku `## Fails before` i odchylenia ponumerowane po kolei. Recenzja 3: PASS; sesja
główna poprawiła trzy uwagi tekstowe w tym pliku i w review.md. Stan: zamknięty, w commicie R-015. -->

# Outcome: R-015 One configuration reader; settings come only from owner files

## Main session's checks

- `node adrian-rebuild/tools/review-guard.mjs compare --git node_modules/.rebuild-review/R-015.git <ticket.md>` after
  each of the implementer's three runs → "within its limits", exit 0.
- `node adrian-rebuild/tools/gate.mjs` after the last run → exit 0, tests 277, pass 277, fail 0 (276/276 after the first
  run and after the round-1 fixes).
- `node adrian-rebuild/tools/fails-before.mjs` → exit 0, "fails-before: test/cli/continue.test.ts,
  test/cli/status.test.ts, test/s3-finish-wake.test.ts, test/structure.test.ts, test/cli/spawn.test.ts,
  test/config.test.ts, test/project/limits.test.ts, test/runtime/start-queue.test.ts fail at HEAD (exit 1)".
- Reviews (`review.md`): rounds 1–3 PASS; two rounds of fixes; round 3's three notes were text of this file and of
  `review.md`, fixed by the main session.

## Review round 2 fixes

`ticket.md` → `## Decisions`, the entry of review round 2, items 1–4:

1. Finding 1: every sentence of `docs/` that named the seat folder as `$LIMEN_HOME/.limen/…` names it as `~/.limen/…`
   of the agents' account: `docs/jobs.md:154` (the start queue) and `docs/commands.md:253` (the rule records);
   `git grep -n LIMEN_HOME -- docs` finds nothing now.
2. Finding 2: `test/config.test.ts` → "setTestKnob sets a test knob that testKnob reads, and refuses a name of any
   other kind with the environment unchanged": `setTestKnob("LIMEN_HOME", "/fixture")` makes `testKnob("LIMEN_HOME")`
   return `/fixture`; every transport, exception and removed name and an unregistered one throw "`<name>` is not a
   test knob" (the `@ts-expect-error` there shows only that a plain `string` does not compile, not the narrower type; review round 3, finding 1), and the environment equals its copy taken before them. At
   `HEAD` the file fails to load (`src/config.ts` is new), which the main session accepts as its failing run.
3. Finding 3: `## Fails before` shows the current tests first; the first draft's runs are under "Superseded by
   review round 1: the first draft's runs", with the names of the tests they belonged to.
4. Finding 4: the deviations are numbered 1–7 in order (7 had stood before 6).

## Review round 1 fixes

`ticket.md` → `## Decisions`, the entry of review round 1, items 1–6:

1. Finding 1: the new s3 test checks only the tool cap of `limits.json`. It is now "the tool cap of the project's
   limits file ends a job once and wakes its session once": the file is `{"toolCalls":1}`, the one job runs `tool ls`
   then `say capped`, and the test asserts `["failed", "tool-call cap reached after 1 calls"]`, one terminal line and
   one wake. The kept-prepare job and its `prepare` went. After the test the limits file gets back its earlier text,
   so the later tests of the file do not run under a cap of one tool start (the first draft left that cap in place).
   At `HEAD` it fails with `actual: [ 'done', undefined ]`.
2. Finding 2: `test/cli/spawn.test.ts` shows the leak itself. "a spawn without --timeout from an environment that holds
   LIMEN_TIMEOUT_MS=1000 starts a job that outlives 1 s" spawns a `block` job with `{ LIMEN_TIMEOUT_MS: "1000" }` and
   no `--timeout`, waits until 2.5 s have passed since the log's `worker started` line or the job is terminal (the
   `until` re-check, as the s3 queue test waits on `started-at`), asserts `[state, the "timeout after …ms" text, the
   start line's limit]` equals `["running", undefined, "1h30m"]`, then stops the job and waits for `stopped`. At `HEAD`
   it fails with `actual: [ 'failed', 'timeout after 1000ms', undefined ]`. The start line's limit (deviation 3) stays,
   checked only beside the state.
3. Finding 3: `## Fails before` → "New tests that pass at `HEAD`" names each one and why.
4. Finding 4: one helper, `withEnvironment(t, values)` in the new `test/environment.ts`; `test/config.test.ts`,
   `test/project/limits.test.ts` and `test/runtime/start-queue.test.ts` import it. After the test it gives each name
   back the value it held before, or deletes it when it held none. `start-queue.test.ts` no longer deletes
   `LIMEN_HOME` and `LIMEN_START_GATE` by hand.
5. Finding 5: `docs/jobs.md:161` names the seat's file `~/.limen/start-gate.json` of the agents' account, as the
   registry's replacement text does; open point 3 of the first draft went.
6. Finding 7 (rejected): no code change; open point 1 cites `src/commands/rule.ts:136`.

## Done

- Change 1, new `src/config.ts`:
  - `ENVIRONMENT`: the 48 names of the inventory in `## Decisions`, each with `kind` and `carries` (one line); a
    `transport` entry has `reader` (`wrapper` or `engine`), an `exception` entry `until` (R-062, R-050, R-059 for the
    six `LIMEN_GITHUB_*` names, R-049), a `removed` entry `replacement` (for example `prepare in
    .agents/limen/limits.json`, `the spawn flag --prepare`, `pi on PATH`, `a constant (spawn waits 10 s for the
    wrapper's handshake)`, `nothing (Limen never read it)`). The object is `as const satisfies Readonly<Record<string,
    Entry>>`, so `Name<K>`, `TransportName`, `EngineName` (the `engine` transport names), `TestKnob` and
    `ExceptionName` are unions derived from it.
  - Readers `transport(name)`, `testKnob(name)`, `exception(name)`: each takes only its union; at run time a name of
    another kind or an unregistered name throws a plain `Error` "`<name>` is not a transport name of src/config.ts"
    (test knob, exception). No reader accepts a `removed` name.
  - `wrapperEnvironment(values)`: `process.env` without every `transport` and `removed` name, plus `values`; each key of
    `values` is checked to be a transport name.
  - `engineEnvironment(base, values)`: `base` without every `wrapper` transport name, the five `PI_*` names and every
    `HERDR_*` name that `src/runtime/wrapper.ts:179` and `:184-188` removed, plus `values` (typed as `engine` names).
  - `groupAdvanceEnvironment()`: `process.env` without every `transport` name and `PI_SESSION_ID`, `HERDR_PANE_ID`,
    `HERDR_TAB_ID`; it replaces `JOB_ENVIRONMENT` of `src/job/group-cabinet.ts`, so `LIMEN_ROLE` is gone from it.
  - `ignoredSettings(env = process.env)`: `{ ignored, exceptions }`, sorted by name: every `LIMEN_*` name of `env` of
    kind `removed` with its replacement, or not registered with `nothing (not a Limen name)`; every `exception` name
    with its `until`. Transport names and test knobs are not listed.
  - `setTestKnob(name, value)`: see deviation 1.
- Change 2, every read goes through `src/config.ts`: 27 files of `src/` and `hook/` call the readers (transport in the
  hooks, `main.ts`, the group, lookup, ticket, planning and setup code; test knobs in `seat.ts`, `herdr.ts`, `diff.ts`,
  `github-doctor.ts`, `reap.ts`, `wake-delivery.ts`, `start-queue.ts`; exceptions in `engine.ts`, `inherit.ts`,
  `github.ts`, `github-poller.ts`, `coordinator-registration.ts`, `publication.ts`). `bin/limen-group-fixture.mjs` sets
  `LIMEN_HOME` with `setTestKnob`. The places that write a child's environment use the builders:
  `launchWrapper` (spawn and continue; its parameter is typed `Partial<Record<TransportName, string>>`, and so are the
  `environment` objects of `src/commands/spawn.ts` and `src/commands/continue.ts`), the wrapper's engine
  (`engineEnvironment(process.env, { LIMEN_JOB: "1", LIMEN_JOB_ID })`, so `LIMEN_JOB_LABEL` is no longer exported), and
  `startGroupAdvance`. AC-3's `git grep` lists only `src/config.ts`.
- Change 3, settings by D-052:
  - `src/project/limits.ts`: `limitMs` reads only the file and its fallback; new `limitCount("toolCalls", fallback,
    root)`; `plantLimits` accepts `toolCalls` as a positive integer (a JSON number), reports another value as
    "`toolCalls <value>` is not a positive integer" and an unknown key as "`<key>` is not a limit; use prepare,
    toolStall or toolCalls". The wrapper's cap is `limitCount("toolCalls", 900)`, read at each tool start as before.
  - `src/runtime/start-queue.ts`: `startGate` reads only `<seat>/start-gate.json` and the defaults; the JSON string
    `"off"` turns the gate off; a value that is neither is reported as `the gate is neither "off" nor a JSON object`;
    `limen seat queue` says `start gate off (start-gate.json is "off")` in place of `LIMEN_START_GATE=off`.
  - Not read any more: `LIMEN_PREPARE` (`spawn` passes `options.prepare ?? ""`), `LIMEN_PREFLIGHT` (`preflightEngine`
    keeps the bridge and PATH checks and runs no `pi auth check`; the profile's `authCheck` went), `LIMEN_VIEW`
    (`limen show` is human exactly when stdout is a terminal; `resolveView` of `src/job/view.ts` went), `LIMEN_WAKE`
    (the wake hook's `session_start` returns only for a job), `LIMEN_PI` (`binaryEnv` left the engine profile,
    `binaryDefault` is now `binary`, and `engineBinary` went: the wrapper and `capturedVersions` run `profile.binary`).
  - Constants: `HANDSHAKE_MS = 10_000` (`src/commands/spawn.ts`), `SEAT_RING_MS = 5 * 60_000`
    (`src/commands/sweep.ts`, whose `positive` helper went), `NOTIFY_TIMEOUT_MS = 2_000`
    (`src/integrations/herdr.ts`). No test needed a shorter handshake, so no test knob was added.
- Change 4, `limen status`: after the leftover lines and before `Older:` (or `Coordinator tabs:` with `--all`), the
  lines `Environment settings Limen no longer reads (<n>); remove them:` with `  <name>: <replacement>` each, and
  `Environment variables read until a ticket replaces them (<n>):` with `  <name>: until <ticket>` each; a header with
  no name is not printed.
- Change 5, tests (the runs before the change are in `## Fails before`):
  - new `test/config.test.ts` (11 tests): the scan over `src/`, `hook/`, `bin/`, `seat/` (only the files git knows that
    exist; `knownFiles` moved from `test/structure.test.ts` to the new `test/known-files.ts`, deviation 2), and the
    fixture scan that finds `process.env.LIMEN_`, `process.env[`, a destructuring (over three lines) and an
    unregistered name, and nothing in `src/config.ts`, an ignored file or `docs/`; the registry against the inventory
    table (kinds, `until`, and each replacement); every removed name set in the environment leaves every reader's
    result unchanged and is refused by all three readers (also at compile time, `@ts-expect-error`); a reader refuses a
    name of another kind and an unknown name; `setTestKnob` sets a knob that `testKnob` reads and refuses every
    other name with the environment unchanged (review round 2, fix 2); `ignoredSettings`; `wrapperEnvironment`;
    `engineEnvironment`; `groupAdvanceEnvironment`.
  - new `test/project/limits.test.ts` (5 tests): `LIMEN_PREPARE_MS` and `LIMEN_TOOL_STALL_MS` do not override
    `prepare` and `toolStall`; `LIMEN_MAX_TOOL_CALLS` does not override `toolCalls`; a file of the `rebuild-base` form
    reads as before; no file or no `toolCalls` keeps the caller's cap; bad `toolCalls` values and an unknown key.
  - new `test/runtime/start-queue.test.ts` (3 tests): `LIMEN_START_GATE` (`off` and an object) does not override
    `start-gate.json`; the file `"off"`; no file gives the defaults and an object file reads as before.
  - new `test/cli/spawn.test.ts` (1 test): a job spawned without `--timeout` from an environment with
    `LIMEN_TIMEOUT_MS=1000` still runs 2.5 s after its engine started, with the default limit on its start line
    (deviation 3), and is then stopped (review fix 2).
  - new `test/environment.ts`: the one `withEnvironment` helper of the in-process tests (review fix 4).
  - `test/cli/continue.test.ts` (+1): the engine of a continued job has no `LIMEN_CONTINUE` (and has `LIMEN_JOB_ID`)
    in `fake-env.json`.
  - `test/cli/status.test.ts` (+2): both sections with `LIMEN_PREPARE` and `LIMEN_WORKER_MODEL`, and neither without.
  - `test/plant.ts` writes `{"settle":"1ms"}` to `<LIMEN_HOME>/.limen/start-gate.json` in place of `LIMEN_START_GATE`.
  - `test/s3-finish-wake.test.ts`: the test of stop, timeout, tool cap and stall is split in two, because a
    `toolCalls` of 1 in the one project file would end the stall job at its first tool: the first keeps stop, timeout
    and stall with the file of today; the second writes `{"toolCalls":1}` in place of `LIMEN_MAX_TOOL_CALLS` and checks
    only the cap (review fix 1). The `LIMEN_PREPARE_MS` of the old kept job is gone with that job: the file's `prepare`
    is shown by the first test's stall job (`timed out after 1 s`) and by `test/project/limits.test.ts`. The cap job
    runs `tool ls` then `say capped` (it ends by itself without the cap, so the test does not hang at `HEAD`).
- Change 6, docs and role text: `docs/jobs.md` (the limits table names `toolCalls`, `prepare` and `toolStall` of the
  plant limits file; "Stalled tools"; "Plant limits" names the tool-start cap, the `toolCalls` rule, that the file is
  the only source and that `limen status` names the three old variables, and the 900 default; the priority-budget
  sentence and "Values" of the start gate: the file `~/.limen/start-gate.json` of the agents' account, its `"off"`,
  `LIMEN_START_GATE` no longer read);
  `docs/commands.md` (the `show` view comes from the terminal, `LIMEN_VIEW` no longer read; a paragraph on the new
  `limen status` sections, deviation 4); `docs/setup.md` (`:86` and the package fallbacks sentence at `:90` no longer
  name environment variables as a source, except `LIMEN_WORKER_MODEL` for a continuation; `:96` and `:113`: no `pi auth
  check` runs, `LIMEN_PREFLIGHT` no longer read); `templates/agents.md:105` names only `--prepare CMD`, and
  `templates/.history/agents.md` gets the new first line `e49b1198…c32d8 2026-11-20` (the date assumes the commit
  today). The comments of `limitMs`, `limitCount`, `startGate`, `toolCallCap`, `launchWrapper`, `preflightEngine`,
  `showCommand`, `startGroupAdvance` and the three constants say what reads the setting now. After review rounds 1
  and 2, every sentence of `docs/` names the seat folder `~/.limen` of the agents' account (`docs/jobs.md:154`,
  `:161`, `docs/commands.md:253`), not `$LIMEN_HOME/.limen`.

## Inventory check

Every `engine` name of the table is read by a hook or by a command a job runs, and no `wrapper` name is: `LIMEN_JOB`
(the five hooks; `group start`'s refusal, `rule`, `planning.ts`, `coordinator-registration.ts`), `LIMEN_JOB_ID` (the
communication, finish and steering hooks; `groupIdentity`, the `spawned-by` file of `publication.ts`, `limenRoot`,
`planning.ts`), `LIMEN_CONTEXT_ROOT` (the hooks, `ticket.ts`, `planning.ts`, `limenRoot`, `limitMs`, and the
`$LIMEN_CONTEXT_ROOT` of `templates/worker.md:15-16` and `templates/coordinator.md:13-14`, which an agent types in its
shell), `LIMEN_GROUP_ID` (the group-peer hook; `group`, `keeper`, `land`, `steer`, `lookup.ts`, `limenRoot`),
`LIMEN_TEAM_ID` (`groupIdentity`, `lookup.ts`, `limenRoot`). The `wrapper` names are read only in `src/main.ts`,
`src/runtime/wrapper.ts` and `src/runtime/job-setup.ts`, which run in the wrapper. So no name of the table is in the
wrong row, and AC-8's first part holds; no transport name gained a use, and the exceptions keep theirs.

## Proof

From the repository root, Node 26.13.1, git 2.34.1 (the gate's shim line appears in each gate run):

- `node adrian-rebuild/tools/gate.mjs` (AC-5), run 1: exit 0; "Checked 171 files in 377ms. No fixes applied."; tests
  276, pass 276, fail 0, cancelled 0, skipped 0 (101.5 s). This ticket adds 23 tests (10 + 5 + 3 + 1 + 1 + 2, and one
  from the split of the s3 test). After run 1 I changed only the order of four lines in the new s3 test (deviation 5)
  and this file; run 2 is below.
- `node adrian-rebuild/tools/gate.mjs`, run 2, after deviation 5: exit 0; "Checked 171 files in 365ms. No fixes
  applied."; tests 276, pass 276, fail 0, cancelled 0, skipped 0 (100.6 s).
- `node adrian-rebuild/tools/gate.mjs`, run 3, after review fixes 1–5: exit 0; "Checked 172 files in 293ms. No
  fixes applied."; tests 276, pass 276, fail 0, cancelled 0, skipped 0 (80.3 s). After it I added only the restore of
  the limits file to the s3 cap test (review fix 1); run 4 is below.
- `node adrian-rebuild/tools/gate.mjs`, run 4, after review round 1: exit 0; "Checked 172 files in 302ms. No fixes
  applied."; tests 276, pass 276, fail 0, cancelled 0, skipped 0 (83.8 s).
- `node adrian-rebuild/tools/gate.mjs`, run 5, after review round 2, the last: exit 0; "Checked 172 files in 313ms. No
  fixes applied."; tests 277, pass 277, fail 0, cancelled 0, skipped 0 (81.4 s); the one more test is the
  `setTestKnob` test, so this ticket adds 24.
- AC-1: `node --test test/config.test.ts`: exit 0; tests 11, pass 11, fail 0 (after review round 2).
- AC-2: `node --test test/cli/status.test.ts`: exit 0; tests 12, pass 12, fail 0.
- AC-3: `git grep --untracked -l -E 'process\.env(\.LIMEN_|\[)' -- src hook bin seat`: exit 0, one line,
  `src/config.ts`.
- AC-4: `node adrian-rebuild/tools/fails-before.mjs`: exit 0; see `## Fails before`.
- AC-6: `npx tsc --noEmit`: exit 0, no output; `npx biome check --error-on-warnings .`: exit 0, "Checked 172 files …
  No fixes applied."
- AC-7: `node adrian-rebuild/tools/check.mjs`: exit 0, "… PL summaries: 125 files; ticket folders: 18; changes: 17
  entries; 0 errors" (125 with this file and `review.md`).
- `npx biome check --error-on-warnings adrian-rebuild`: exit 0, "Checked 30 files … No fixes applied."

## Fails before

The current tests, each run on the code of `HEAD` (`9f247a5`). `fails-before.mjs` prints only its last 40 lines, so
the runs of single files use a one-off script in the OS temporary folder that does what it does (`HEAD` from `git
archive` in a temporary repository, the given working-tree files copied over it, the gate's environment) and prints
every pass and fail line. The runs marked "before the code change" were made from the working tree before I changed
`src/`, `hook/` or `bin/`; their tests have not changed since, except that they now take `withEnvironment` from
`test/environment.ts` (review round 1, fix 4).

- `test/config.test.ts` (11 tests, with the `setTestKnob` test of review round 2, fix 2), at `HEAD`: exit 1, `Error
  [ERR_MODULE_NOT_FOUND]: Cannot find module '…/src/config.ts' imported from …/test/config.test.ts`. The module is new,
  so every test of the file fails at `HEAD` for that reason, the `setTestKnob` test included; the main session's
  message of round 2 accepts that as its failing run.
- `test/cli/spawn.test.ts`, "a spawn without --timeout from an environment that holds LIMEN_TIMEOUT_MS=1000 starts a
  job that outlives 1 s" (with `test/plant.ts`), at `HEAD`: exit 1; tests 1, fail 1; `actual: [ 'failed', 'timeout
  after 1000ms', undefined ], expected: [ 'running', undefined, '1h30m' ]`: the job ended on the spawner's variable.
- `test/s3-finish-wake.test.ts`, "the tool cap of the project's limits file ends a job once and wakes its session
  once", the file alone at `HEAD`: exit 1; tests 7, pass 6, fail 1; `actual: [ 'done', undefined ], expected: [
  'failed', 'tool-call cap reached after 1 calls' ]` (the file's `toolCalls` of 1 is not read at `HEAD`); F042 and the
  file's other tests pass. The same after the restore of the limits file.
- `test/cli/continue.test.ts`, "a job continued with limen continue starts an engine whose environment holds no
  LIMEN_CONTINUE", before the code change: `actual: [ 'done', true, true ], expected: [ 'done', true, false ]`: the
  leak of `LIMEN_CONTINUE` into the engine, which the ticket found by reading, is reproduced.
- `test/cli/status.test.ts`, "limen status names a setting of its environment that it no longer reads and a variable
  it reads until a ticket", before the code change: `actual: []` against the five expected lines.
- `test/project/limits.test.ts`, before the code change, when the file held only the tests that use `limitMs` and
  `plantLimits` of `HEAD`: "T-03: LIMEN_PREPARE_MS and LIMEN_TOOL_STALL_MS set in the environment do not override
  prepare and toolStall" fails with `actual: [ 1000, 1000 ], expected: [ 1200000, 900000 ]` (the variables won over
  the file's 20m and 15m). With `limitCount` imported, the whole file fails to load at `HEAD`, so "T-03:
  LIMEN_MAX_TOOL_CALLS set in the environment does not override toolCalls" and "a toolCalls that is not a positive
  integer is ignored …" fail there for that reason; the s3 cap test above shows that `HEAD` reads no `toolCalls`.
- `test/runtime/start-queue.test.ts`, before the code change: "T-03: LIMEN_START_GATE set in the environment does not
  override start-gate.json" fails with `actual: { gate: undefined, ignored: [] }, expected: { gate: { cpuIdle: 50,
  memoryFree: 30, settleMs: 5000 }, ignored: [] }` (`off` won); 'a start-gate.json that holds the JSON string "off"
  turns the gate off' fails with `actual: { gate: { cpuIdle: 25, memoryFree: 20, settleMs: 60000 }, ignored: [ 'the
  gate is not a JSON object' ] }, expected: { gate: undefined, ignored: [] }`.
- Every new and changed test file together at `HEAD` (`test/cli/continue.test.ts`, `test/cli/status.test.ts`,
  `test/s3-finish-wake.test.ts`, `test/structure.test.ts`, `test/cli/spawn.test.ts`, `test/config.test.ts`,
  `test/project/limits.test.ts`, `test/runtime/start-queue.test.ts`, with `test/known-files.ts`, `test/environment.ts`
  and `test/plant.ts`), after review round 1: exit 1; tests 40, pass 32, fail 8. The eight failures: the continue,
  spawn, status (both sections) and s3 cap tests, the two files `test/config.test.ts` and `test/project/limits.test.ts`
  (each fails to load), and the two `start-gate.json` tests. Round 2 adds a test only to `test/config.test.ts`, which
  counts there as one failing file.
- Last, after review round 2, `node adrian-rebuild/tools/fails-before.mjs` (AC-4): exit 0, "fails-before:
  test/cli/continue.test.ts, test/cli/status.test.ts, test/s3-finish-wake.test.ts, test/structure.test.ts,
  test/cli/spawn.test.ts, test/config.test.ts, test/project/limits.test.ts, test/runtime/start-queue.test.ts fail at
  HEAD (exit 1)"; its list of failures ends with the s3 cap test's `actual: [ 'done', undefined ]`.

### New tests that pass at `HEAD`

Each is a guard of the migration or of a case `HEAD` already got right:

- `test/runtime/start-queue.test.ts`, "a seat with no start-gate.json gets the default gate, and a gate file object
  reads as it did": the defaults and the object form of `start-gate.json`, which `HEAD` already read; it guards the
  migration's "existing files read the same".
- `test/cli/status.test.ts`, "limen status prints neither environment section when its environment holds no such
  variable": `HEAD` prints no such section at all; it guards "nothing is printed when neither is present".
- `test/s3-finish-wake.test.ts`, "stop, timeout and a stalled tool each end a job once and wake its session once; 80%
  of a timeout steers once": the half of the old test that this ticket keeps, with the limits file of today; `HEAD`
  passed it as the old test.
- `test/project/limits.test.ts`, "a limits file of the rebuild-base form, with prepare and toolStall, reads as it
  did": it passed at `HEAD` in the run before the code change, before `limitCount` was imported; with the import the
  file does not load at `HEAD`. It guards the migration's "an existing file with prepare and toolStall reads the same".
- `test/project/limits.test.ts`, "a project with no limits file, or a file without toolCalls, keeps the cap its caller
  gives": a guard of the 900 that `HEAD` had too; it needs the new `limitCount`, so at `HEAD` it fails only because
  the file does not load.
- In `test/config.test.ts`, which does not load at `HEAD`, "the configuration scan finds each read form and an
  unregistered name, …" checks the test's own scan on a fixture; it would hold at `HEAD` but for the import of the
  registry.

The other tests of the changed files are the files' earlier tests (four in `test/cli/continue.test.ts`, ten in
`test/cli/status.test.ts`, five in `test/s3-finish-wake.test.ts`, all ten of `test/structure.test.ts`, whose only change
is the move of `knownFiles`), and they pass at `HEAD`.

### Superseded by review round 1: the first draft's runs

These runs belong to two tests of the first draft that review round 1 replaced (fixes 1 and 2), and to the probe that
stood in for the first one:

- The first draft's `test/cli/spawn.test.ts`, "a spawn without --timeout from an environment that holds
  LIMEN_TIMEOUT_MS=1000 starts a job with the default limit" (it ran `say ok` and checked only the start line), before
  the code change: it failed because the log's start line was `[limen …] worker started`, with no limit.
- A one-off probe in the OS temporary folder (outside the repository, not part of the change), which showed the leak
  that test did not: a `block` job spawned with `{ LIMEN_TIMEOUT_MS: "1000" }` and no `--timeout`, on `test/plant.ts`
  of `HEAD`, ended `failed`, its log `worker started`, `timeout after 1000ms; sending TERM`, `failed: timeout after
  1000ms`. The current spawn test shows the same.
- The first draft's s3 test, "the tool cap and the prepare limit of the project's limits file end a job once and wake
  its session once" (a cap job and a kept-prepare job, `{"prepare":"1m","toolCalls":1}`), with
  `--test-name-pattern='tool cap and the prepare limit'` before the code change: `actual: { cap: 'done', kept: 'done' },
  expected: { cap: 'failed', kept: 'done' }`.
- The first draft's first `fails-before.mjs` run: exit 0, the eight files above failing at `HEAD`; in it the s3 file's
  "wakes of jobs that end while muted arrive after /limen on … (F042)" also failed (`actual: 'followUp,followUp'`,
  `expected: 'user,followUp'`), because that s3 test asserted before it waited for its wakes, so at `HEAD`, where it
  fails, the shared coordinator session still had wakes to take when F042 began (observed: with the wait moved before
  the assertions, deviation 5, F042 passes at `HEAD`). `fails-before.mjs test/s3-finish-wake.test.ts` then: exit 0,
  tests 7, pass 6, fail 1, only that test. The draft's last `fails-before.mjs`: exit 0, the same eight files, its list
  of failures ending with that test's `actual: { cap: 'done', kept: 'done' }`.

## Deviations from the ticket

1. `src/config.ts` also exports `setTestKnob(name, value)`. `bin/limen-group-fixture.mjs` set `process.env.LIMEN_HOME`
   before it calls `initCommand` in-process, and AC-3 allows no `process.env.LIMEN_` outside `src/config.ts`; the
   setter checks that the name is a test knob, and a test in `test/config.test.ts` shows it (review round 2, fix 2).
2. `knownFiles` (and `SKIPPED`) moved from `test/structure.test.ts` to the new helper `test/known-files.ts`, which both
   scans import, instead of a second copy of the function in `test/config.test.ts` (T-25: a policy has one module).
3. The wrapper's start line is now `worker started, time limit <duration>` (`1h30m` for the default): Change 5 asks
   that "the record or the log shows" the limit, and neither did at `HEAD`. No record field changes. After review fix
   2 no test depends on the line alone: the spawn test checks it beside the job's state.
4. `docs/commands.md` gets one paragraph on the two new `limen status` sections, after the leftover paragraph; Change
   6 does not list it, but it documents Change 4. `docs/setup.md:86` changes with `:90`, since it also named
   environment variables as a source of settings.
5. `test/s3-finish-wake.test.ts`: the test is split in two (see `## Done`), the cap job's script is `tool ls` then `say
   capped` instead of `tool ls` then `block`, and the new test waits for its wakes before its assertions. After review
   fix 1 the new test checks only the cap.
6. Removed with the names they served, as dead code: `engineBinary` and the profile's `authCheck` (and its `pi auth
   check` call) in `src/runtime/engine.ts`, `binaryDefault` renamed `binary`; `resolveView` in `src/job/view.ts`;
   `positive` in `src/commands/sweep.ts`. Two texts of the start gate changed: the gate-off line of `limen seat queue`
   named `LIMEN_START_GATE=off` and now names the file, and the message for a gate file of another shape names `"off"`.
7. `test/known-files.ts` and `test/environment.ts` are test helpers, not test files, as `test/plant.ts` is.

## Measurement

None of M-01–M-13 measures this ticket. `unmeasured`: whether an environment on the seat still sets a removed name
(the Herdr pane's environment, D-052 (2)); that is `plan.md` → `## Deployment` step 2.4, where `limen status` lists it.

## Open points

1. `src/commands/rule.ts:136` starts the rule timer with `{ ...process.env, LIMEN_INTERNAL_RUN: undefined }`. It is not
   one of the four places of Change 2 and passes the scan (it writes a name, it reads none), so it stays; `rule` moves
   with R-034 (review finding 7, rejected).
2. `LIMEN_COORDINATOR`, an exception, still reaches every job's engine, as at `9f247a5`; A-061 leaves it to the job
   allow-list (R-087).
3. The comments of `src/runtime/start-queue.ts:16-17` still cite another person's decisions (T-21 (3)); not this
   ticket's scope: R-084 (comments resolve and name no person) rewrites them.
