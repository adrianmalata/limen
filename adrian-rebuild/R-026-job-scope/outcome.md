<!-- PL: Wynik R-026 (22.11, za dnia; trzy rundy recenzji PASS): każdy job startuje swój wrapper przez `systemd-run --user --scope` w
`limen-job-<id>.scope`; wrapper sprawdza swój cgroup i zapisuje `scope` w rekordzie przy przejściu do running, a
zwycięzca każdego przejścia do stanu końcowego czyta przed nim odczyty cgroupu (`memory.peak`, `cpu.stat`,
`memory.events`), a po krokach `afterEnd` i łasce grupy procesów zabija cały scope (`systemctl --user kill
--signal=SIGKILL`). Następna runda grupy i zamykacz karty Herdr startują we własnym `limen-run-<token>.scope`, a
finisher czeka, aż naprawdę w nim działają; `src/runtime/contain.ts` odchodzi; `limen init` odmawia bez sesji systemd
użytkownika, a spawn bez scope'u kończy się `SCOPE_FAILED`. Runda poprawek 1 (a)–(f): koniec scope'u w `finally`,
zapasowe KILL grupy przy nieudanym końcu scope'u w wyczerpaniu, wpis o nieudanym starcie następnej rundy grupy,
zakaz literału `systemctl` poza adapterem (wywołania doktora GitHuba przeniesione), scope, który nie powstał, jest
`gone` z `is-active`, i osobna nazwa `endJobScope`. Sprawdzone na atrapach w `test/plant.ts`; prawdziwy systemd
sprawdzają kroki 3.2, 3.7 i 3.8 (M-09 `unmeasured`). Stan: zrealizowane. -->

# R-026 outcome

## Done

(a) The scope, in the platform adapter (`src/platform/platform.ts`, `src/platform/linux.ts`), now the only code that
runs `systemd-run`, runs `systemctl --user` or reads `/sys/fs/cgroup`:
- `startInScope({ unit, command, args, env, cwd })`: `systemd-run --user --scope --quiet --collect --unit=<unit> --
  <command> <args>`, detached (the command keeps its pid and leads its own process group, since systemd-run runs it in
  place). It resolves only once the process no longer runs `systemd-run`, that is once the command runs in its new
  scope, or once it ended with exit code 0; it rejects when the start fails or `systemd-run` ends otherwise, and ends a
  start that passes 10 s. Its result is the pid and a promise of the process's end.
- `endScope(unit, cgroup)`: `gone` when the recorded cgroup folder no longer exists (an `ENOENT` of `statSync`, the
  explicit absence of T-01: the manager collected the scope), or when `systemctl --user is-active --quiet <unit>` exits
  3, as for a scope that ended or never started (round 1, (e): decided from facts, never from systemctl's words);
  otherwise `systemctl --user kill --signal=SIGKILL <unit>`; `failed` with the first stderr line, the start error or
  how it ended, for an `is-active` with any other exit or a kill that fails.
- `systemUnitProperty(unit, property)` and `systemUnitState(unit, "is-enabled" | "is-active")` (round 1, (d)): what the
  system manager prints of one of its units, the calls the GitHub doctor (`src/integrations/github-doctor.ts`) made
  itself before, with the same 3 s bound and the same rule (exit 0 → the trimmed output, else undefined).
- `probeUserScope()`: `systemd-run --user --scope --quiet true` → `started`, `missing` (`ENOENT`) or `failed`.
- `ownCgroup()`: the path of the `0::` line of `/proc/self/cgroup`, or the test knob `LIMEN_CGROUP` when set.
- `scopeReadings(cgroup)`: `memory.peak`, `usage_usec` of `cpu.stat` and `oom_kill` of `memory.events` of
  `/sys/fs/cgroup<cgroup>` (or of the test knob `LIMEN_CGROUP_ROOT`), each `null` for a missing file (`ENOENT`) or a
  text with no such number; any other read error rejects. The parsers `parseCgroup`, `parseCounter` and `parseKeyed`
  are exported for fixture tests.
- `src/runtime/launcher.ts` names the scopes: `jobScope(id)` = `limen-job-<id>.scope`; `startOutsideJob` starts a
  program in `limen-run-<8 hex>.scope`. `launchWrapper(id, environment)` starts every wrapper through `startInScope`
  in `jobScope(id)`; both callers, `src/job/spawning.ts` (spawn, keeper, group start, GitHub review and work go through
  it) and `src/job/continuation.ts` (continue and group rounds), pass the job's id. A job that a job spawns gets its
  own scope the same way, since its wrapper is launched by the same function.

(b) Every terminal transition ends the scope:
- `finalizeJob` (`src/job/finalize.ts`): after the transition and `afterEnd`, the winner awaits the new option
  `beforeScopeEnd` (nothing by default) and then ends the scope (`endJobScope`, named apart from the platform's
  `endScope` in round 1, (f)): its recorded unit, else `jobScope(id)` for a job that ended before it recorded one (its
  wrapper may already run there). The end of the scope is in a `finally` (round 1, (a)): it runs also when `afterEnd`
  or `beforeScopeEnd` rejects, and the rejection then goes on. A failure goes to the job's log (`scope <unit> was not
  ended: …`), as `afterEnd`'s failures do, and then to the new option `onScopeNotEnded` (round 1, (b)). A scope that
  ended or never started (a failed launch, `SCOPE_FAILED`, a stop before `systemd-run` ran) is `gone` and logs
  nothing (round 1, (e)). When the finisher is the wrapper, inside the scope, the end of the scope kills it, so this
  is its last act. Every finisher of fact 2 goes through it: the wrapper (all ten of its calls and
  `failInternalJob`), `limen stop` (both calls), the reaper, the spawner after a failed launch or handshake, and
  continue. The reserved group slot has no process and does not call it.
- Nothing a terminal transition starts dies with the scope: `startLimen` (the group's next round, a rule's timer) and
  the Herdr tab closer (`settleJobTab`, `src/integrations/herdr.ts`) start through `startOutsideJob` in a
  `limen-run-<token>.scope` of their own, and `afterEnd` awaits both starts (`startGroupAdvance` now returns a promise,
  awaited in `afterEnd` and in `limen group status`; `rule.ts` does not wait for it). Awaiting matters: until
  `systemd-run` has moved itself, it sits in the job's scope (see Deviations 2). A start that fails is no longer
  swallowed (round 1, (c)): `startLimen` rejects with what the system said, and each caller writes one line where its
  work is read: `afterEnd` in the log of the job whose end started the next round (`the group's next round could not
  start: …`), `limen group status` on its stderr, and `limen rule set` (and the check of due rules before a command)
  on its stderr (`rule <name>: its timer could not start: …`), since a rule serves no job.
- `src/runtime/contain.ts` is removed (`git rm`), with its `cleanup` entries. `waitForProcessGroup` moved to
  `src/runtime/reap.ts`, `JobProcess` to `src/runtime/stalled-tool.ts` (its last user). Stop keeps its group signals
  (TERM, then KILL after 5 s) and passes that grace as `beforeScopeEnd`, so the scope's SIGKILL meets only what the
  group's TERM left. Exhaustion (timeout, tool cap, stalled tool) keeps its TERM of the group and waits for the engine's
  exit, at most the same 5 s, before the end of the scope; when that end fails, it sends its group the KILL as the
  fallback (`onScopeNotEnded`; see Deviations 1).

(c) The record: an optional field `scope` (`src/job/record.ts`, type `Scope`), read as `migrated` is (a record without
it reads as before; a record with an unknown field still refuses, D-079): `{ unit, cgroup, memoryPeakBytes,
cpuMicroseconds, oomKills }`, the unit a systemd scope name, the cgroup an absolute path with no `..` part, the
readings `null` or integers ≥ 0. The wrapper (`src/runtime/wrapper.ts`) reads its own cgroup first; one that does not
end in `/limen-job-<id>.scope` fails the job (`not in its scope: the wrapper runs in cgroup …, not …`) before anything
runs; otherwise it sets `scope` with null readings in the transition to running. `finalizeJob` reads the readings of
that cgroup just before the terminal transition and writes them with it; a read that fails is a side failure
(`sideFailures`, channel `scope readings`) with null readings. `limen show <id>` prints, for a finished job with a
scope, `scope memory peak <n.n> MiB · CPU <n.n> s · OOM kills <n>`, `unknown` for a null reading (`src/job/listing.ts`
for the compact view, `src/job/view.ts` for the terminal view).

(d) The requirement: `REQUIREMENTS` (`src/platform/requirements.ts`) gains `systemd-run`, after `ps`: `limen init`
and `limen workspace init` exit 4 with `MISSING_TOOL` when `systemd-run` is not on PATH, and with `MISSING_FEATURE`
when `systemd-run --user --scope --quiet true` fails, naming what it said and lingering (`loginctl enable-linger
<account>`). A spawn or continue whose scope does not start fails with class `environment`, code `SCOPE_FAILED`
(exit 4), and its job ends `failed` (`failed to launch wrapper: the job's systemd user scope did not start: …`); no
engine runs. `waitForHandshake` now also ends at once (`WRAPPER_NOT_READY`, the existing code) when the wrapper's
process ends with the job still starting, instead of waiting out its 10 s.

(e) Scans and tests:
- The A-083 scan (`test/structure.test.ts`) also finds `systemd-run`, a `systemctl` literal (the program a call names)
  whatever stands on its line, a line with `systemctl` and `--user` (a command in a shell string), and
  `/sys/fs/cgroup` outside `src/platform/` (round 1, (d): before, only `systemctl` with `--user` on its line). The
  GitHub doctor's six `systemctl` calls moved onto the adapter's `systemUnitProperty` and `systemUnitState`; its fix
  text for root ("systemctl daemon-reload && …") is prose, which the scan skips. The fixture case has every form, the
  prose line and a system-level call that the scan now finds.
- The plant (`test/plant.ts`) writes the tests' `systemd-run` and `systemctl` into its `bin` and sets
  `LIMEN_CGROUP_ROOT` to its `cgroup` folder; `fakeSystemd(folder)` gives the same to the tests that run Limen in their
  own process (with `withEnvironment`), so that no test reaches the machine's systemd (`## Commands`, stage 3). Helpers:
  `SCOPE_READINGS`, `fakeCgroup`, `systemdCalls`, `scopeCalls`, `failingSystemdRun`, `pathWithFailingScope`,
  `pathWithFailingScopeEnd` (round 1), `pathWithUnscopedRun`; the fake engine's new word `deaf` ignores SIGTERM
  (round 1). `src/config.ts` registers the two test knobs `LIMEN_CGROUP_ROOT` and `LIMEN_CGROUP`
  (`test/config.test.ts`'s inventory names them).
- New tests (each fails at `HEAD`, `## Fails before`):
  - `test/runtime/launcher.test.ts`: "a spawned job's wrapper starts in its own systemd user scope
    limen-job-<id>.scope, which its record names" (the exact `systemd-run` words and the record's cgroup).
  - `test/s9-housekeeping.test.ts`: "a killed wrapper is reaped at once; the orphan of a job that ends, is stopped or is
    reaped is dead after its end; each wakes the coordinator once" (replaces "a killed wrapper is reaped at once and a
    stopped job leaves no escaped child; …": the `cleanup` branch of the orphan assertion is gone, and the killed job
    runs `orphan` too; its engine dies with its scope, so the test no longer releases it).
  - `test/job/finalize.test.ts`: "finalizeJob writes the memory peak, CPU time and OOM kills of the job's scope with its
    terminal state"; "finalizeJob writes null readings when the job's scope is already gone, and a record without a
    scope keeps none"; "finalizeJob ends the job's scope after its terminal state: every process left in the scope gets
    SIGKILL" (a detached process with the scope's marker gets SIGKILL, and the last `systemctl` call is its kill).
  - `test/job/record.test.ts`: "a record reads with its optional scope, and a record without one reads with none";
    "BAD_DATA: a scope with a reading below zero gives a typed error that names the field".
  - `test/platform/linux.test.ts`: the cgroup line of `/proc/<pid>/cgroup` (v2, hybrid, none); the three readings; their
    null forms.
  - `test/platform/requirements.test.ts`: "MISSING_FEATURE: the user-scope probe passes when a user scope starts, and
    refuses with an environment error that names lingering when it fails"; "MISSING_TOOL: the user-scope probe refuses
    with an environment error when systemd-run is not on PATH".
  - `test/cli/init.test.ts`: "MISSING_FEATURE: limen init refuses with exit code 4 and names lingering when no systemd
    user scope starts".
  - `test/cli/spawn.test.ts`: "SCOPE_FAILED: a spawn whose systemd user scope cannot start exits 4, and its job ends
    failed with no engine run".
  - `test/runtime/wrapper.test.ts`: "a wrapper that does not run in its job's systemd user scope ends the job failed and
    starts no engine".
  - `test/s8-groups.test.ts`: "a second group runs two routes through draft, critique and final, …" also asserts that
    every `group advance` of that group was started in a `limen-run-<token>.scope` (the group advance started by a
    member's end still runs: the rounds above it ran).
  - `test/s2-herdr.test.ts`: "a job's end closes its Herdr tab from a systemd user scope of its own".
  - `test/cli/show.test.ts` (new file): "the detail of a finished job shows the memory peak, CPU time and OOM kills of
    its scope, and unknown for unread ones".
  - `test/structure.test.ts`: the fixture case of the platform scan.
- New tests of review round 1 (each fails before its fix, `## Fails before` → Review round 1):
  - (a) `test/job/finalize.test.ts`: "finalizeJob ends the job's scope also when a step after the transition rejects,
    and the rejection goes on".
  - (b) `test/runtime/wrapper.test.ts`: "an exhausted job whose scope cannot be ended kills its process group after the
    grace, an engine that ignores TERM included" (`--timeout 1s`, the engine `deaf`, a `systemctl` that fails).
  - (c) `test/job/finalize.test.ts`: "finalizeJob of a team's coordinator writes a line in the job's log when the
    group's next round cannot start"; the cap of `.catch(() => {})` in `test/structure.test.ts` falls from 27 to 19,
    the count now.
  - (d) `test/structure.test.ts`: the fixture case of the platform scan, now with a `systemctl` call without `--user`
    that the scan finds, and the A-083 scan over the code, which found the GitHub doctor's six calls before they moved.
  - (e) `test/job/finalize.test.ts`: "finalizeJob of a job whose scope never started sends no kill and logs no failed
    end of its scope".
- Tests changed to run with the tests' systemd: `test/job/finalize.test.ts` (both earlier tests),
  `test/cli/stop.test.ts` (both in-process tests), `test/u9-process-identity.test.ts` (the reaper tests). The test
  "finalizeJob ends the job's scope after its terminal state: …" now waits for the process's end at most 5 s, and its
  last `systemctl` call is the kill (an `is-active` comes first since (e)).
- Test removed with the cut mechanism: `test/u9-process-identity.test.ts` → "a recycled pid with another birth is
  never signaled and is named for cleanup; the recorded birth is signaled" (it tested `containEscapedDescendants`).

(f) Text: `docs/jobs.md` (the record paragraph names `scope`; a new paragraph "The job's scope"; the stop step; the
recovery row of a dead wrapper), `docs/setup.md` (the requirement and the line of a spawn), `docs/commands.md`
(Detached), `docs/seat/README.md` (lingering at the box's step 6; the process identity section),
`docs/seat/agent-setup.md` (the user manager runs every job's scope; `herdr server stop` ends no job; a restart of the
user manager ends every job), `templates/agents.md:78` (with its history hash in `templates/.history/agents.md`).

## Proof

From the repository root, on the working tree after review round 1's fixes (`HEAD` `c231535`, index: only
`D src/runtime/contain.ts`):
- AC-8: `node adrian-rebuild/tools/gate.mjs` → exit 0; tests 752, pass 752, fail 0, cancelled 0, skipped 0 (150.3 s;
  4 tests more than the first implementation's 748/748, 146.1 s). A run before the last comment edit gave 752/752 too.
- AC-1: `node --test test/runtime/launcher.test.ts` → exit 0 (tests 4, pass 4).
- AC-2: `node --test test/s9-housekeeping.test.ts` → exit 0 (tests 3, pass 3).
- AC-3: `node --test test/cli/stop.test.ts` → exit 0 (tests 4, pass 4).
- AC-4: `node --test test/job/record.test.ts` → exit 0 (tests 18, pass 18).
- AC-5: `node --test test/platform/requirements.test.ts` → exit 0 (tests 5, pass 5); `node --test
  test/platform/linux.test.ts` → exit 0 (tests 12, pass 12).
- AC-6: `node --test test/structure.test.ts` → exit 0 (tests 42, pass 42).
- AC-7: `node adrian-rebuild/tools/fails-before.mjs` → exit 0, after round 1 as before (`## Fails before`).
- AC-9: `npx biome check --error-on-warnings .` → exit 0; `node adrian-rebuild/tools/check.mjs` → exit 0 ("0
  errors"); `npx biome check --error-on-warnings adrian-rebuild` → exit 0; `npx tsc --noEmit` → exit 0.
- Also: `node --test test/job/finalize.test.ts` → 8/8; `node --test test/runtime/wrapper.test.ts` → 3/3.
- Review round 2, (g): the comment above "finalizeJob ends the job's scope also when a step after the transition
  rejects, …" (`test/job/finalize.test.ts:144`) cites "A-029, R-026" instead of "A-029, Decision 2", its reason kept;
  then `node --test test/job/finalize.test.ts` → exit 0 (8/8), Biome (`.` and `adrian-rebuild`) and `check.mjs` → exit 0.
- The ratchets of `test/structure.test.ts`: `throw new Error(` in `src/` and `hook/` 106 → 104 (cap 106),
  `.catch(() => {})` 23 → 19 (the cap falls to 19, round 1, (c)), `catch {` 71 → 71 (cap 81).
- No test reaches the machine's systemd: in a development gate run of the first implementation, a temporary check in
  the three members of `src/platform/linux.ts` logged every call whose `systemd-run` or `systemctl` was not a test's
  own; it logged one, the `MISSING_TOOL` probe test, whose PATH holds no `systemd-run` at all. The check is gone from
  the tree. Round 1's new calls go through the same PATH: the plant's or `fakeSystemd`'s.
- AC-10 (judgment): every path that starts a wrapper goes through `launchWrapper` (`src/job/spawning.ts`,
  `src/job/continuation.ts`; the T-26 scan still finds no other start of the CLI); every finisher of fact 2 ends the
  scope through `finalizeJob` (`## Done` (b)), in a `finally` since round 1; the fakes and their seat steps are named
  below.

## Fails before

AC-7, the implementer's run on the working tree (2026-11-22), with every new and changed file under `test/`:

```
$ node adrian-rebuild/tools/fails-before.mjs
fails-before: test/cli/init.test.ts, test/cli/spawn.test.ts, test/cli/stop.test.ts, test/config.test.ts,
test/job/finalize.test.ts, test/job/record.test.ts, test/platform/linux.test.ts, test/platform/requirements.test.ts,
test/runtime/launcher.test.ts, test/runtime/wrapper.test.ts, test/s2-herdr.test.ts, test/s8-groups.test.ts,
test/s9-housekeeping.test.ts, test/structure.test.ts, test/u9-process-identity.test.ts, test/cli/show.test.ts fail at
HEAD (exit 1)
…
✖ a killed wrapper is reaped at once; the orphan of a job that ends, is stopped or is reaped is dead after its end; …
  AssertionError [ERR_ASSERTION]: every orphan is dead after its job's end
    actual: [ 4173583, 4174177 ],
    expected: [],
```
→ exit 0. At `HEAD` two of the three orphans survive; by `HEAD`'s code they are the reaped job's and the normally ended
job's, since `HEAD`'s stop still walks the escaped descendants (`contain.ts`) and kills the third. After review round
1 the same command → exit 0, with the same first line.

The tool prints the last 40 lines of one run, so each new test file ran alone too, with `test/plant.ts` copied over
`HEAD` (`node adrian-rebuild/tools/fails-before.mjs test/plant.ts <file>`; without the plant, a file fails on its
import of a new helper). Each → exit 0, with the reason of its new test:
- `test/runtime/launcher.test.ts`: `actual: [ [], undefined ]`: no `systemd-run` call and no `scope` in the record.
- `test/job/finalize.test.ts` and `test/cli/show.test.ts`: `BAD_DATA`, `scope: expected one of the fields version, …,
  versions or migrated` (a record with `scope` is refused at `HEAD`); show exits 4 for both jobs.
- `test/job/record.test.ts`: the same refusal; the `BAD_DATA` test names the field `scope`, not `scope.oomKills`.
- `test/platform/requirements.test.ts`: "the requirements declare systemd-run", `actual: undefined` (both tests).
- `test/cli/init.test.ts`: `actual: [ 0, null, false, true ]` (init passes and writes) for `[ 4, 'MISSING_FEATURE',
  true, false ]`.
- `test/cli/spawn.test.ts`: the SCOPE_FAILED test gets exit 0 (the spawn runs its job unscoped).
- `test/runtime/wrapper.test.ts`: `actual: 'done', expected: 'failed'` (the wrapper outside its scope ran the engine).
- `test/s2-herdr.test.ts`: the tab closes at `HEAD` too; the assertion that its closer started in a
  `limen-run-<token>.scope` is false.
- `test/s8-groups.test.ts`: the rounds run at `HEAD` too; the assertion that every `group advance` started in a
  `limen-run-<token>.scope` is false.
- `test/platform/linux.test.ts` (no plant): "does not provide an export named 'parseCgroup'".
- `test/config.test.ts`: the registry has no `LIMEN_CGROUP_ROOT` and `LIMEN_CGROUP`.
- `test/structure.test.ts` alone: `pass at HEAD, so they do not show the change` → exit 1. The scan lives in the test
  file and `HEAD`'s code holds none of the calls it newly bans, so its fixture case and its scan both pass there; the
  fixture case shows that the scan finds the three forms and skips the system manager's `systemctl` (Deviations 7).
- `test/cli/stop.test.ts` and `test/u9-process-identity.test.ts` only run with the tests' systemd now; they pass at
  `HEAD` alone, as tests of behaviour that stays must.

### Review round 1

Each new test ran on the working tree before its fix, with every other change in place (`fails-before.mjs` compares
with `HEAD`, where no record holds a scope, so it cannot single out one fix):
- (a), (c), (e): `node --test --test-timeout=60000 test/job/finalize.test.ts` before the fixes of `finalizeJob` → exit
  1, tests 8, pass 5, fail 3:
  ```
  ✖ finalizeJob ends the job's scope also when a step after the transition rejects, and the rejection goes on
    + 'still running'
    - 'SIGKILL'
  ✖ finalizeJob of a job whose scope never started sends no kill and logs no failed end of its scope
    + [ '--user kill --signal=SIGKILL limen-job-job.scope' ],
    + [ '[limen …] scope limen-job-job.scope was not ended: Failed to kill unit limen-job-job.scope: Unit
        limen-job-job.scope not loaded.' ]
  ✖ finalizeJob of a team's coordinator writes a line in the job's log when the group's next round cannot start
    AssertionError: The input did not match /\] the group's next round could not start: systemd-run did not run .+:
    it ended with exit code 1\n/. Input: '… done: pi exited 0\n… coordinator wake via Herdr: not sent; …\n… scope
    limen-job-2026-11-22-team-1a2b3c4d.scope was not ended: … not loaded.\n'
  ```
  An earlier run of the same file without the bound on the member's wait hung at the test of (a), since the member
  was never killed; the bound of 5 s makes it a failure.
- (b): `node --test --test-timeout=120000 --test-name-pattern="cannot be ended" test/runtime/wrapper.test.ts` with the
  fallback taken out of the wrapper → exit 1: `actual: [ false, true ], expected: [ true, true ]` (the log names the
  failed end; the group still runs 20 s later). With the fallback: pass, in 7.0 s.
- (d): `node --test test/structure.test.ts` with the new fixture and the scan as it was → exit 1, the fixture case
  fails (`- 'fixture.ts:12: "systemctl"'`); with the new scan and the GitHub doctor's calls not yet moved → exit 1, the
  A-083 test lists `src/integrations/github-doctor.ts:259`–`262`, `317` and `318`; after the move → 42/42.
- (c)'s cap: `grep -o ".catch(() => {})" -r src hook | wc -l` gives 20 before the fix and 19 after it; the new cap
  of 19 would fail at the count before (counted, not run).
- (f) is a rename, which no test can show.

## What the fakes emulate (AC-10)

The fakes are shell scripts the plant writes (`test/plant.ts`, `SYSTEMD_RUN` and `SYSTEMCTL`); each takes only the form
Limen runs and exits 1 with a message for any other.
- `systemd-run --user --scope [--quiet] [--collect] [--unit=<name>.scope] [--] <command>…`: logs its words, makes the
  scope's folder `<LIMEN_CGROUP_ROOT>/user.slice/user-<uid>.slice/user@<uid>.service/app.slice/<unit>` with fixed
  readings (`memory.peak` 52428800, `cpu.stat` `usage_usec 2500000`, `memory.events` `oom_kill 0`), exports
  `LIMEN_CGROUP=<that cgroup>` and `exec`s the command, so its pid is kept and its program changes, as a real scope's
  does. Membership is the inherited `LIMEN_CGROUP`, which `setsid` and a new parent keep and only another scope
  replaces. Seat check: step 3.2 (`systemd-run --user --scope true` exits 0; `systemd-cgls` shows the engine and its
  tools in the job's scope) and 3.8 (the readings).
- `systemctl --user is-active --quiet <name>.scope` and `systemctl --user kill --signal=SIGKILL <name>.scope`: a
  scope's processes are those whose environment holds its `LIMEN_CGROUP` and this plant's `LIMEN_CGROUP_ROOT` (round
  1: the second keeps a scope of one test from meeting a leftover process of another). `is-active` exits 0 while the
  scope has a process and 3 when it has none, as systemd does for a scope that ended or never started. `kill` sends
  SIGKILL to each and removes the scope's folder; with none, it prints "Failed to kill unit …: Unit … not loaded." and
  exits 1. Unlike systemd, a fake scope whose processes all ended by themselves keeps its folder until a `kill`, so
  the product meets `is-active` exit 3 where the seat meets the missing folder; both are `gone`. Seat check: step 3.2
  (during and after a trial job: `systemctl --user is-active limen-job-<id>.scope` exits 0, then 3) and 3.7 (jobs
  survive a Herdr restart).
- A failing `systemd-run` ("Failed to connect to bus: No medium found", exit 1), as on a host without the account's
  user instance; an unscoped one that runs the command outside any scope; a failing `systemctl` (the same text, exit
  1 for every call), as when the user manager cannot be reached. Seat check: steps 3.1 and 3.2.
- Not emulated: the user bus and lingering, the real cgroup moves, `memory.peak` going with the scope, the kernel's OOM
  killer, and scopes outside the plant.

## Deviations

1. Exhaustion no longer sends the group a KILL after its 5 s grace as its first means. The wrapper leads that group,
   so the KILL would end the wrapper before it ends the job's scope, and every process outside the group would outlive
   the job. Instead the wrapper waits for the engine's exit (and the last of its stream in the job's files), at most
   the same 5 s after its TERM, and then ends the scope, which SIGKILLs the engine too when it ignored the TERM. When
   that end fails (`systemctl --user` does not end the scope), the group's KILL is the fallback (round 1, (b);
   `onScopeNotEnded`): after the log line of the failed end, the wrapper sends its own group SIGKILL, so an engine
   that ignores TERM still ends and the wrapper's wait for it ends with it. Stop keeps its TERM and KILL, since
   `limen stop` runs outside the group. The Herdr wake of an exhaustion no longer has a shutdown deadline, since no
   KILL of the wrapper can cut it before its scope's end.
2. `startInScope` resolves only once the command runs in its new scope, and `afterEnd` awaits the start of the group
   advance and of the tab closer. The ticket's (b) asks for scopes of their own "or are awaited before the end"; both
   hold here. Without the wait the gate showed the race: the tab closer's `systemd-run`, still in the job's scope, was
   killed with it (the s2 test timed out in a gate run, though it passed alone).
3. `waitForHandshake` ends as soon as the wrapper's process ends with the job still starting (`WRAPPER_NOT_READY`, the
   existing code), instead of after its 10 s; `SCOPE_FAILED` comes from `launchWrapper`, which now knows whether the
   wrapper reached its scope.
4. `lastLimenDetail` (`src/job/spawning.ts`, the detail a spawn prints for a job that ended before it returned) takes
   the last terminal line (`done:`, `failed:`, `stopped:`) instead of the last Limen line, since the end of the scope
   (or the tab's closer) can log after it.
5. Text beyond the lines of (f), made false by the cut of `contain.ts`: `docs/remote.md:77` ("`limen stop` and detached
   process containment use it"), `CONTRIBUTING.md:21` (the list of `src/runtime/`), and the requirement in
   `docs/setup.md` → Requirements.
6. `limen show` prints the three readings in a human form (MiB and seconds with one decimal); the record keeps the
   exact bytes and microseconds.
7. Of (e)'s tests "each failing at HEAD", the scan's fixture case cannot fail there: the scan is defined in the test
   file, and `HEAD`'s code holds none of the calls it newly bans, so the new fixture case and the scan both pass at
   `HEAD` (`## Fails before`).
8. A `limen stop` that wins the terminal transition returns once the job's group is gone (its TERM, at most 5 s, then
   KILL and at most 1 s) and its scope ended, since it awaits that grace before the end of the scope; before, it
   returned after its transition and left the KILL to a task its process ran on.

## Unmeasured

- M-09 (`plan.md` → `## Measurement`): the peak CPU and memory per job scope come from the record fields of this
  ticket, which the fakes fill with fixed numbers; the seat's numbers come with step 3.8. `unmeasured`.
- The real systemd behaviour (the scope's cgroup, the kill of a detached process, survival of a Herdr restart, a
  host without lingering): steps 3.1, 3.2, 3.7 and 3.8. `unmeasured` (no M-NN of its own).

## Open points

- `SECURITY.md:9` still describes the escaped-descendant check and its cleanup note, which this ticket removes; the
  file is R-081's (`## Out of scope`).
- `limen show` and `limen status --all` still print a job folder's `cleanup` file (`src/job/listing.ts`), which
  nothing writes any more; folders written before R-026 may hold one (R-021 kept it as a content file).
- The T-26 launch scan looks at `node:child_process` calls only; a start of the CLI through `platform.startInScope`
  outside `src/runtime/launcher.ts` would pass it.
- R-050: `ownCgroup` honours the test knob `LIMEN_CGROUP`, which a job can set for its own children; the registered
  coordinator's check of "in no job's scope" should read `/proc/self/cgroup` itself or accept that as A-029's
  accepted risk.
- R-087 keeps `LIMEN_CGROUP` (the fake scope's marker) and the user-bus variables in the job's allow-list.
- The exact text of systemd-run's error on a spawn is not kept (its output is ignored, so the wrapper cannot inherit a
  pipe); `limen init`'s probe names it.
