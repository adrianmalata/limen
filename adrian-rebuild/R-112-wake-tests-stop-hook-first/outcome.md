<!-- PL: Wynik R-112 (27.11, przy `216a1c2`): hook wake trzyma obietnicę wszystkich rejestracji projektu, które zaczął
przy starcie sesji, a jego `session_shutdown` zwraca ją także wtedy, gdy hook jest wyłączony, więc Pi (E-22) czeka
na zapis rejestru. Testy wake zatrzymują każdy uruchomiony hook, czekając na jego zatrzymanie, zanim usuną folder
projektu; nowy test A-092 padał przed zmianą. Bramka sesji głównej 1440/1440, `fails-before.mjs` exit 0, recenzja
PASS w pierwszej rundzie; stan: zamknięty. -->

# R-112 outcome

## Done

1. `hook/wake.ts` (Change 1):
   - A new state `registrations` (`:139`), a promise that settles once every registration of the project in the seat
     folder that a session start began has settled.
   - `session_start` (`:958-962`): `void registerProject(root).catch(() => {})` became
     `const registration = registerProject(root).catch(() => {})`, and `registrations` is chained onto it
     (`registrations = registrations.then(() => registration)`). A second `session_start` in the same hook adds its
     registration to the same chain. The swallowed failure stays as it was (Out of scope, R-082). The comment above
     it says why the shutdown waits: the start does not wait for the registry's lock, the shutdown returns once the
     write has settled, and Pi awaits that handler (E-22), so no write in the seat folder outlives the hook (A-092,
     D-136).
   - `session_shutdown` (`:1106-1128`): the handler is typed `(): Promise<void>` and returns `registrations` on both
     paths, the early return when the hook is off (`!active && !sweepTimer`) and the end of the full stop. Its other
     steps (watcher, claims marked closed, `retire(false)`, `releaseHerdr()`) are unchanged and still run before it
     returns. `recorded` passes the promise through, and the adapter's `PiHandler` already allows it (fact 3, T-32), so
     `src/runtime/pi-api.ts` is unchanged. No other handler changed.
2. `test/hook/wake.test.ts` (Change 2):
   - `hookProject` (`:151`) now returns a `HookProject` (`:139`): `root`, `jobs`, and `startCoordinator(session)`,
     which starts a coordinator's hook in the project and adds it to the project's list. Its one `t.after` awaits the
     shutdown of every coordinator in that list, in the order they started, and only then removes the folder;
     `withEnvironment`'s restore is registered after it, so the environment comes back last, as before.
   - The module-level helper that makes the hook is `newCoordinator(root, session)` (`:172`), the former
     `startCoordinator` without its own `t.after`. `Coordinator.shutdown` is typed `Promise<void>` (`:135`) and
     returns what the handler returns.
   - All 16 tests that called `hookProject` use the project's `startCoordinator(session)` (17 calls); the test that
     starts two coordinators awaits the first one's stop (`await first.shutdown();`, `:273`). The dead-wrapper test
     still takes `root` for `fakeSystemd(root)`; the others no longer destructure it.
   - New test (`:227`), "A-092: once the hook's shutdown has settled, the seat folder holds only the registry, which
     lists the project once": one coordinator in a `hookProject` project, `await coordinator.shutdown()`, then, read at
     once with synchronous calls (no event-loop turn that would let a write still in flight end first), the seat folder
     `home/.limen` holds exactly `["projects"]` and the file is `<root>\n`. Exactly `projects` also means no
     `projects.lock` and no temporary file are left (D-136 (2)).
   - The file's opening comment names the new mechanism, "a stop that ends once the hook's registration of its project
     is written (A-092)" (T-29 (5)), appended to its list as R-111 did.

## Proof

All from the repository root at `216a1c2`, with the change in the working tree.

| Command | Exit | Tests |
|---|---|---|
| `node --test test/hook/wake.test.ts` (AC-1) | 0 | 22/22 (21 before the change, plus the new test) |
| `node adrian-rebuild/tools/fails-before.mjs test/hook/wake.test.ts` (AC-2) | 0 | at HEAD 21/22 pass, the new test fails (below) |
| `node --test test/project/seat.test.ts` (AC-3) | 0 | 1/1 |
| `git grep -q 'void registerProject' -- hook/wake.ts` (AC-4) | 1 | — |
| `node adrian-rebuild/tools/gate.mjs --out node_modules/.rebuild-review/R-112.gate` (AC-5), the main session's run | 0 | 1440/1440, 325.5 s |
| `npx biome check --error-on-warnings .` (AC-6) | 0 | 295 files |
| `npx tsc --noEmit` (AC-6) | 0 | — |
| `node adrian-rebuild/tools/check.mjs` (AC-7) | 0 | "0 errors" |
| `npx biome check --error-on-warnings adrian-rebuild` | 0 | 36 files |

Gate runs: the main session's run after the implementer's hand-back (protocol step 4) → exit 0, `ℹ tests 1440`, `ℹ pass
1440`, `ℹ fail 0`, `duration_ms 325450`, no `ENOTEMPTY` in its output; an earlier run of the main session was stopped
before its end when Adrian paused the work, with no result. The implementer's runs:
1. `gate.mjs --out node_modules/.rebuild-review/R-112.gate` → exit 0: `ℹ tests 1440`, `ℹ pass 1440`, `ℹ fail 0`,
   `duration_ms 352052`. While it ran, two comment lines of `test/hook/wake.test.ts` changed (the opening comment and
   the doc comment of `Coordinator.shutdown`), so its tree was not the final one.
2. On the final tree, the same command → exit 0: `ℹ tests 1440`, `ℹ pass 1440`, `ℹ fail 0`, `duration_ms 355335`; the
   new test passed in 140 ms. No test failed in any run of this ticket apart from the new test before the hook
   changed.

After all runs the developer's home folder holds no `.limen` (fact 5).

## Fails before

The test was written first and run against the unchanged hook:
`node --test --test-name-pattern "A-092" test/hook/wake.test.ts` → exit 1, `tests 1, pass 0, fail 1`: `names: []`,
`projects: ''` against `names: ['projects']`, `projects: '<root>\n'`. Right after the stop the seat folder did not
exist yet: the registration was still running, as fact 7 saw.

AC-2, the main session's run on the final tree, `node adrian-rebuild/tools/fails-before.mjs test/hook/wake.test.ts`
→ exit 0 (the gate's private TMPDIR is shown as `<gate TMPDIR>`; the implementer's run gave the same result):

```
fails-before: test/hook/wake.test.ts fail at HEAD (exit 1)
ℹ tests 22
ℹ pass 21
ℹ fail 1
test at test/hook/wake.test.ts:227:1
✖ A-092: once the hook's shutdown has settled, the seat folder holds only the registry, which lists the project once (81.353961ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
  + actual - expected

    {
  +   names: [],
  +   projects: ''
  -   names: [
  -     'projects'
  -   ],
  -   projects: '<gate TMPDIR>/limen-wake-registered-qKnUyJ\n'
    }
```

## Deviations from the ticket

None in substance. The shape of the teardown is the implementer's choice, as the ticket does not prescribe one: the
project of `hookProject` starts the coordinators and stops them in its own `t.after` before the removal, so a test cannot
start a coordinator that the teardown does not stop. Because of that, the call sites changed from
`startCoordinator(t, root, session)` to `startCoordinator(session)`.

## Unmeasured

- `unmeasured`, with no M-NN in `plan.md` → `## Measurement` that covers it: on the seat, a coordinator's stop (exit,
  `/reload`, a session switch) now waits for the registration it started. This rests on E-22 (code, not run). The
  ticket's Decisions have no seat step and API `—`; if Pi did not wait, the stop would behave as it does today (Risk).
- The race itself: the new test proves the mechanism deterministically, but a passing gate cannot prove that the race
  is gone (z. 17). An `ENOTEMPTY` in this file after R-112 is a D-029 finding again.

## Open points

1. AC-9's two cases have no test of their own, because a test could not tell them apart from the one written. (a) A
   second `session_start` in the same hook: both registrations take the same registry lock, so by the time the later
   one settles, the earlier one has written and released the lock. A hook that kept only its latest registration would
   leave the same files, and the case is shown by the code (`registrations` is a chain). (b) The hook off: the early
   return gives the same `registrations`.
2. The hook factory `limenWake` keeps its debt suppression
   (`biome-ignore lint/complexity/noExcessiveLinesPerFunction: split pending`). T-27 (1) asks a ticket that changes such
   a function to remove it. R-043, R-111 and R-044 also changed this function and left it, for the ratchet of R-082.
   Splitting the factory is far beyond this ticket's size S.
3. The D-057 (6) test (`limen-wake-old-`) starts the hook without `startCoordinator` and never stops it. There, the
   hook's session start stops at the migration check before it registers or starts a timer, and the test asserts that
   no seat registry was made, so it has nothing to wait for. It does not call `hookProject` and so is outside Change 2.
4. A synchronous throw inside the full stop (before `return registrations`) would end the handler without the wait,
   as it ended it before. The throw goes to Pi's extension error channel through `recorded`. Nothing in the stop throws
   today on a known path.
5. Change 3 (`plan.md` → `## Agents` step 4 loses D-135's exception; `audit.md` → A-092's `Note` names the cause) was
   the main session's, made in the ticket's commit.
6. Review round 1, note 2 (D-092): the teardown of `hookProject` (`test/hook/wake.test.ts:154-159`) has no
   `try`/`finally`, so a `shutdown()` that rejects skips the later shutdowns and the removal and leaves the test's
   temporary folder. The registrations' chain does not reject (each registration's error is caught), and a throw in
   the stop goes through `recorded` and fails the test visibly; no later ticket rewrites this teardown.
