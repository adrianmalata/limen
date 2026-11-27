<!-- PL: Ticket R-112 (A-092, D-133, D-136, E-22): testy hooka wake zatrzymują hook przed usunięciem folderu projektu,
a zatrzymanie hooka czeka na zapis rejestru projektów, który hook zaczyna przy starcie sesji. Reprodukcja poza repo
pokazała przyczynę `ENOTEMPTY`: zapis w `home/.limen` bez `await`, który przeżywa `session_shutdown`. Stan: napisany
27.11 przy `11860b9` z inwentarza tylko do odczytu i decyzji D-136; tryb `delegated`, implementuje
`rebuild-implementer`. -->

# R-112 The wake hook's tests stop the hook before they remove its folder

## Problem

A-092 (`audit.md`), Decision quoted: "fix — R-112 (D-133)." Its direction: "the wake tests stop the hook before they
remove its folder, with a reproduction that fails before the change (R-112, D-133)." Its note: "the cause is the
implementer's reading until R-112's reproduction shows it."

D-133 (`plan.md` → `## Decisions`), the part R-112 relies on: "The failure is finding A-092 (medium, `fix`): the test
registers the removal of its folder before the hook's shutdown, so the folder may go while the hook still writes in it
(the implementer's reading, to be shown by the fix's reproduction). A new ticket R-112, stage 4, size S, `delegated`,
`night`, after R-043: the wake tests stop the hook before they remove its folder, with a reproduction that fails before
the change."

D-135 (`plan.md` → `## Decisions`), the part R-112 relies on: "R-112's commit removes the exception from `## Agents`."

D-136 (`plan.md` → `## Decisions`, Adrian, 2026-11-27, "rekomendacja", Q-101 option (a)), quoted: "(1) R-112 changes
`hook/wake.ts` as well: the hook keeps the registrations it started, and its `session_shutdown` handler returns once
they have settled. Pi awaits each `session_shutdown` handler (E-22), so a stop on the seat (exit, `/reload`) waits for
that write: normally milliseconds, at most the lock's 60 s bound when another live process holds the registry's lock.
(2) The wake tests stop every hook they started, awaiting its shutdown, before they remove the project's folder; a new
test that fails before the change shows the registry written, with no lock left, after an awaited shutdown."

E-22 (`plan.md` → `## Engine facts`), quoted: "Yes, on every path that ends a session: `emitSessionShutdownEvent`
awaits `extensionRunner.emit(event)` …, and `emit` awaits each handler of each extension in turn, a throw going to the
extension error channel …; the process exit …, a session switch … and `/reload` … await it before the session is
disposed. So a handler that returns a promise holds the stop until the promise settles."

Rules: z. 17 (one run is an anecdote; a test that fails now and then is a finding, not a re-run), z. 31 (a gate that
detects regressions), z. 14 and z. 21 (a guarantee in code, not in prose), T-29 (a test checks one mechanism; its name
is a sentence about behaviour), T-30 (a comment says why, and every identifier in it resolves), T-32 (the Pi API through
the one adapter).

Facts at `11860b9`:
1. The hook's `session_start` handler starts the project's registration in the seat folder and does not await it:
   `void registerProject(root).catch(() => {});` (`hook/wake.ts:956`). `registerProject` (`src/project/seat.ts:34-37`)
   takes the registry's lock `<seat>/projects.lock` (`src/project/seat.ts:24`, `src/lock.ts:102`), then writes
   `<seat>/projects` through a temporary file and a rename (`src/project/seat.ts:30`, `src/atomic-write.ts:44-65`); the
   seat folder is `LIMEN_HOME`'s `.limen` in a test (`src/project/seat.ts:8-10`).
2. The hook's `session_shutdown` handler (`hook/wake.ts:1100-1121`) is synchronous and returns nothing: it returns at
   once when the hook is off (`if (!active && !sweepTimer)`, `:1103`), else closes the watcher, marks pending claims
   closed, `retire(false)` and `releaseHerdr()`. Nothing waits for the registration of fact 1. A session that starts
   again in the same hook (`newSession`, Pi's `/new`) starts one more registration.
3. `src/runtime/pi-api.ts:152` and `:164` declare the handler as `PiHandler` (`Result | Promise<Result>`), so a handler
   that returns a promise needs no change of the adapter (T-32); `recorded` passes a promise through
   (`src/runtime/pi-api.ts:484-498`).
4. `test/hook/wake.test.ts`: `hookProject` (`:125-133`) registers `t.after(() => rm(root, …))` (`:127`), then
   `withEnvironment` (`:129`) registers the restore of `LIMEN_HOME` and `HOME`; `startCoordinator` (`:147-188`) registers
   `t.after(() => shutdown({}, {}))` after them (`:167`); `Coordinator.shutdown` is typed `void` (`:143`) and returns
   `shutdown({}, {})` (`:187`). `node:test` runs a test's `after` hooks in the order they were registered (a two-hook
   script under Node 26.13.1 printed them first to last), so each test removes the folder first, then restores the
   environment, then stops the hook. 16 tests call `hookProject`; 17 calls of `startCoordinator`, one test starting two
   coordinators (`:234`, `:238`) and stopping the first by `first.shutdown();` without awaiting it (`:237`).
5. `projectsFile()` is read again after the lock is taken (`src/project/seat.ts:30`), so a registration that outlives a
   test's environment restore would resolve the registry under the restored `HOME`, outside the test's folder (read
   from the code, not observed: the developer's home folder holds no `.limen`).
6. The two gate failures were in this file, each `ENOTEMPTY: directory not empty, rmdir …/home/.limen` in cleanup: "a
   wake that enters no run is counted unconfirmed, with its reason in the job's log, once the session has been quiet
   for 30 s" (R-043's round-1 fix run) and "the toast of a done job whose older record holds open checks is the plain
   done toast" (R-041's first gate).
7. A reproduction outside the repository (the main session's scratch script, untracked), with the hook started as
   `startCoordinator` does in a folder as `hookProject` makes it: a removal of the folder (`rm`, `recursive`, `force`)
   right after `session_start` failed with `ENOTEMPTY` on `home/.limen` in 2 of 100 runs; right after `await
   shutdown()` the seat folder did not exist, and after 300 ms it held `projects`. So the hook's stop does not settle
   its registry write, and putting the stop before the removal alone would not end the race.

## Change

1. `hook/wake.ts`: the hook keeps every registration that its `session_start` handler starts, and its
   `session_shutdown` handler returns a promise that settles once every registration started so far has settled, also
   when the handler returns early because the hook is off (fact 2). The registration's failure stays swallowed as
   today (out of scope). Every other handler and every other effect of the shutdown is unchanged; the comment at the
   registration says why the shutdown waits (T-30).
2. `test/hook/wake.test.ts`:
   - The teardown of every test that calls `hookProject` stops every coordinator the test started, awaiting each
     shutdown, before it removes the project's folder; the environment restore comes after the removal, as today.
     `Coordinator.shutdown` returns the handler's promise, and the test at `:237` awaits it.
   - A new test, failing at `11860b9`: after `await coordinator.shutdown()` of a coordinator started in a project of
     `hookProject`, with no other wait, the seat folder `home/.limen` holds exactly `projects`, and the file lists the
     project's root once.
   - The file's opening comment follows (T-29 (5)).
3. By the main session in the commit (not the implementer): `plan.md` → `## Agents` → protocol step 4 loses D-135's
   exception (the sentence "Until R-112 (D-135): … follows D-029."), as D-135 requires; `audit.md` → A-092's `Note`
   names the cause shown here (D-136).

Files the criteria name that this ticket creates: none.

## Out of scope

- The swallowed error of the registration (`.catch(() => {})`): T-01's catch scan is R-082's.
- The registry's module (`src/project/seat.ts`), the lock and the atomic write.
- Other tests that start the wake hook in a child process (`test/s3-finish-wake.test.ts`, `test/fake-engine.test.ts`,
  `test/s9-housekeeping.test.ts`, `test/cli/old-hosted.test.ts`, `test/cli/old-names.test.ts`): no failure of theirs is
  recorded, and their engine process ends the hook through Pi's own shutdown path.
- A wait bound or time limit of its own for the shutdown: the lock's wait bound applies (D-136 (1)).

## Acceptance

- AC-1: `node --test test/hook/wake.test.ts` → exit 0.
- AC-2: `node adrian-rebuild/tools/fails-before.mjs test/hook/wake.test.ts` → exit 0, its output in `outcome.md` →
  `## Fails before`.
- AC-3: `node --test test/project/seat.test.ts` → exit 0.
- AC-4: `git grep -q 'void registerProject' -- hook/wake.ts` → exit 1.
- AC-5: `node adrian-rebuild/tools/gate.mjs --out node_modules/.rebuild-review/R-112.gate` → exit 0.
- AC-6: `npx biome check --error-on-warnings .` → exit 0; `npx tsc --noEmit` → exit 0.
- AC-7: `node adrian-rebuild/tools/check.mjs` → exit 0.
- AC-8 (judgment): in every test of `test/hook/wake.test.ts` that starts a coordinator, the project's folder is removed
  only after every coordinator the test started has stopped and its shutdown's promise has settled; no teardown waits
  on the registry's file names, retries a removal or sleeps.
- AC-9 (judgment): the shutdown's promise covers every registration the hook started, including one started by another
  `session_start` in the same hook and the case where the hook is off; every comment and test name the diff adds says
  why or what in words that resolve (T-29, T-30).

## Migration

None: no format on disk, command or hook name changes; the registry file and its lock are written as before.

## Risk

- On the seat a coordinator's stop (exit, `/reload`, a session switch) now waits for the registration it started; the
  write takes milliseconds, and the wait reaches the lock's 60 s bound only when another live process holds the
  registry's lock that long (D-136 (1)). Whether Pi waits at all rests on E-22 (code, not run); if it did not, the stop
  would behave as today.
- A-092's race may have more than one writer: a sweep in flight after the removal could write into the project's
  `.limen/jobs`. The stop before the removal covers that too (`retire` stops the timers, and a sweep after it ends at
  its generation check, `hook/wake.ts:855`); no such failure is recorded.
- The new test proves the mechanism deterministically; the race itself showed in 2 of 100 runs of the scratch script,
  so the gate cannot prove its absence by passing (z. 17). An occurrence after R-112 is a D-029 finding again.

## Rollback

`git revert $(git log --format=%H --grep='^R-112:' adrian-rebuild --)`; no reverse migration. D-135's exception comes
back with the revert of `plan.md`.

## Decisions

- 2026-11-27 D-136 (Adrian: "rekomendacja", Q-101 option (a)): the change covers `hook/wake.ts` as well as the test;
  quoted in `## Problem`.
- 2026-11-27, settled by the sources when the ticket was written (the main session's reading, not asked): the title
  stays (D-136 (3)); the mode stays `delegated` and the size S (one hook and its test file); no seat step and API `—`,
  because the tests do not rely on Pi and the seat behaviour falls back to today's if E-22 did not hold (Risk); the
  registration's swallowed error stays for R-082 (T-01).
