<!-- PL: Wynik R-087 (noc 24/25.11, przy `b21bd45`; zamknięty po trzech rundach recenzji, poprawki F1–F4 i G1–G2):
środowisko joba buduje się z allow-listy `JOB_PASSES` w `src/config.ts`, nigdy z kopii środowiska spawnera; Limen
ustawia `DISABLE_UPDATES=1`, pusty `credential.helper` przez `GIT_CONFIG_COUNT`, `GIT_TERMINAL_PROMPT=0`, pusty
`GIT_ASKPASS` (F2) i `GH_CONFIG_DIR` w folderze joba, który ukrywa pliki konfiguracji gh, ale nie login w keyringu
(F3); `LIMEN_COORDINATOR` i sześć nazw pollera nie wchodzą do joba. Pokrętła testowe są czytane tylko w trybie testowym
(`LIMEN_TEST_MODE=1`), a fixture grup drukuje ten znacznik obok `LIMEN_HOME` dla prowadzącego (F1); `--prepare` dostaje
środowisko silnika, co sprawdza test spawnu przez wrapper (G1), a log joba nazywa odrzucone nazwy. Bramka 1124/1124,
check.mjs 0 błędów, Biome czysty; punkty otwarte 4, 5 i 7 (keyring gh, domyślna decyzja nocy, `~/.netrc`) na bramkę 5.3. -->

# R-087 outcome

## Done

(a) The allow-list. `src/config.ts` holds it beside the registry (T-25): `JOB_PASSES`, the names a job takes from its
spawner unchanged, each with `reaches` (`job` or `wrapper`), an optional `only: "test"` and one line on what it carries:
`HOME`, `PATH`, `USER`, `LOGNAME`, `LANG`, `LC_*`, `TZ`, `TMPDIR`, `XDG_RUNTIME_DIR`, `DBUS_SESSION_BUS_ADDRESS`
(`job`); `HERDR_*` (`wrapper`); `NODE_OPTIONS`, `NODE_NO_WARNINGS`, `GIT_CONFIG_GLOBAL`, `GIT_CONFIG_NOSYSTEM` (`job`,
test mode only). `JOB_SETS` holds what Limen sets in every job, each with its value and why: `DISABLE_UPDATES=1`,
`GIT_CONFIG_COUNT=1`, `GIT_CONFIG_KEY_0=credential.helper`, `GIT_CONFIG_VALUE_0=` (empty), `GIT_TERMINAL_PROMPT=0`,
`GIT_ASKPASS=` (empty; review round 1, F2: git asks an askpass program before it reads `GIT_TERMINAL_PROMPT`, and a
set `GIT_ASKPASS`, even an empty one, is the only one it reads, so a `core.askPass` of any configuration file and
`SSH_ASKPASS` never run), `GH_CONFIG_DIR=<job folder>/gh-config` (never created; its `carries` line says that it hides
gh's configuration files, so gh finds no login in them, and that gh would still find a login it keeps in a system
keyring through the user bus, F3). Every `exception` entry of the registry declares `crosses`:
`true` for `LIMEN_PACKAGE` and `LIMEN_WORKER_MODEL`, `false` for `LIMEN_COORDINATOR` and the six `LIMEN_GITHUB_*`.
`wrapperEnvironment(values, spawner = process.env)` now builds a new object from the list alone: the spawner's names the
list passes (the test-only ones and every `test`-kind name only when the spawner's own `LIMEN_TEST_MODE` is `1`), the
crossing exceptions, then `JOB_SETS`, then the checked transport values; it returns `{ environment, dropped }`, where
`dropped` is every name of the spawner that the new environment does not hold, sorted, names only. `values` is
`WrapperValues`, which requires `LIMEN_JOB_DIR` by type, so `GH_CONFIG_DIR` and the log always have the job folder; the
two callers (`src/job/spawning.ts`, `src/job/continuation.ts`) take the type. `engineEnvironment` is the wrapper's
environment without the wrapper's transport names and the names the list gives the wrapper alone (every `HERDR_*`); the
five `PI_*` names of `WRAPPER_PI` left it, since the list never passes them. `groupAdvanceEnvironment` and the tab closer
are unchanged.

(b) Test mode. `LIMEN_TEST_MODE` is a registered name of kind `test`. `testKnob` checks the name's kind first (a wrong
kind still throws) and returns `undefined` unless `LIMEN_TEST_MODE` is `1` in the process's own environment, so all 15
knobs, `LIMEN_CGROUP`, `LIMEN_CGROUP_ROOT`, `LIMEN_END_GATE`, `LIMEN_HOME`, `LIMEN_STALL_TICK_MS` and
`LIMEN_LINGER_DIR` among them, are read only in test mode. `setTestKnob` sets the knob and `LIMEN_TEST_MODE=1` for its
process, so `bin/limen-group-fixture.mjs`'s own `limen init` keeps its registration in the fixture. The draft said the
fixture needed no change; that was wrong (review round 1, F1): the fixture also prints the shell exports of the
interactive lead, and their `LIMEN_HOME` alone, without the marker, would let the lead's `limen` and wake hook use the
account's own seat folder. The exports now hold `export LIMEN_TEST_MODE=1` before `export LIMEN_HOME=…`, and the comment
above `setTestKnob` says why. The tests turn it on through their helpers: the plant's
environment (`test/plant.ts`), `withEnvironment` (`test/environment.ts`, which sets the marker unless the values give it)
and `fakeSystemd` (its values now hold `LIMEN_TEST_MODE: "1"`); the gate's environment does not set it. Three tests that
set a knob by hand set the marker beside it: `test/project/seat.test.ts` (its 41 child processes read `LIMEN_HOME`),
`test/hook/communication.test.ts` (`LIMEN_HOME`) and `test/registry.test.ts` (`LIMEN_HERDR`, now through
`withEnvironment`). `adrian-rebuild/tools/role-context.mjs` sets `LIMEN_TEST_MODE=1` beside `LIMEN_HOME` and
`LIMEN_HERDR` in both places, and its Polish summary says so. `limen status` is unchanged: `ignoredSettings` lists no
`test`-kind name, the marker included (`docs/commands.md:202` stays true; the `ignoredSettings` test now holds the
marker).

(c) `setUpJob(jobDir, worktree, environment)` runs `--prepare` with `environment`; the wrapper builds the engine's
environment once, before the setup, and passes the same object to the setup and to the engine's spawn
(`src/runtime/wrapper.ts`).

(d) `launchWrapper` (`src/runtime/launcher.ts`) builds the environment and, when `dropped` is not empty, appends
`environment: dropped <n> names of the spawner: <names>` (names sorted, joined by `, `) to the job's log through
`appendLimenLog` before `systemd-run` starts. A failed append ends the spawn as the launch failure it is (the callers'
existing catch around `launchWrapper` finalizes the job `failed`, kind `launch`), not silently.

(e) Tests, each failing before the change (`## Fails before`):
- `test/config.test.ts`: the inventory holds `LIMEN_TEST_MODE`; the exceptions test checks `crosses`; new: testKnob
  outside test mode (modes `""`, `0`, `true`, `1`), setTestKnob turns test mode on, and five builder tests over a
  planted spawner (`SPAWNER`: the list's names, a dummy token, `SSH_AUTH_SOCK`, its own `GIT_CONFIG_*`,
  `PI_SESSION_ID`, `LIMEN_COORDINATOR`, `LIMEN_GITHUB_KEY_FILE`, `LIMEN_PACKAGE`, `LIMEN_WORKER_MODEL`, the knob
  `LIMEN_END_GATE`, the tests' names, a transport and a removed name): the exact wrapper environment and `dropped` out of
  and in test mode, the engine's exact names in and out of test mode, the nested spawn (the list applied to an engine's
  environment keeps the account, the user bus and the crossing exceptions and drops the parent's `LIMEN_JOB`), and an
  empty spawner (Limen's values only, nothing dropped). The deny-list tests are rewritten: `wrapperEnvironment drops …`
  goes, the engine test now checks the Herdr and wrapper transport names only. The removed-name test keeps the test
  mode it found, since `withEnvironment` now turns it on.
- `test/fake-engine.mjs` records every name of its environment, never a value, and has a new script word `credential`
  (runs `git credential fill` for `https://github.com` in its worktree and writes status, signal, stdout and stderr to
  `fake-credential.json`); `test/fake-engine.test.ts` checks the recording.
- `test/s1-spawn.test.ts`: a spawn with `DEMO_API_TOKEN` and `LIMEN_COORDINATOR` starts an engine whose names are exactly
  the plant's (all on the list in test mode), Limen's seven and the engine's three transport names, plus `PWD`, which the
  tests' `systemd-run` (a `/bin/sh` script) exports; its log holds exactly `environment: dropped 2 names of the spawner:
  DEMO_API_TOKEN, LIMEN_COORDINATOR`. A repository whose own `.git/config` names a URL-scoped helper for
  `https://github.com` gives the engine's `git credential fill` no password: it exits non-zero with `terminal prompts
  disabled`. New in round 1 (F2): a repository whose own `.git/config` names a `core.askPass` program, a script in the
  plant's folder that marks its run in a file and prints a dummy password, gives the engine's `git credential fill` no
  password, and the program never runs (no mark). The config builder tests' `limenSets` holds `GIT_ASKPASS: ""`. New in
  round 2 (G1): a spawn whose spawner holds `HERDR_ENV` and `HERDR_PANE_ID` and whose `--prepare` command, a Node
  one-liner, records its environment's names (never a value) in the plant's folder: the record holds no `HERDR_*` name
  and no transport name the registry gives the wrapper alone (`reader: "wrapper"`, taken from `ENVIRONMENT`), and holds
  the engine's `LIMEN_JOB`. It goes through the plant's real wrapper, so it fails when the wrapper hands `--prepare`
  anything but the engine's environment.
- `test/bin/limen-group-fixture.test.ts` (new in round 1, F1; named after its subject, T-29 (1)): the fixture runs in a
  folder of the OS temporary folder, with the tests' systemd (`fakeSystemd`) and the fake engine as `pi` first on its
  `PATH`, so its `limen init` passes the requirements and reaches no systemd of the machine; its printed `export` lines
  hold `LIMEN_TEST_MODE=1` whenever they hold a name of kind `test`.
- `test/runtime/job-setup.test.ts` (new): the prepare command gets no `HERDR_*` and no wrapper transport name, and gets
  the engine's `LIMEN_JOB`, `LIMEN_JOB_ID` and `LIMEN_CONTEXT_ROOT`.
- `test/platform/linux.test.ts`: outside test mode `ownCgroup` is `/proc/self/cgroup`'s and `cpuTime` reads below
  `/sys/fs/cgroup`, not the knobs' folder.
- `test/runtime/wrapper.test.ts`: `endGate` (now exported) writes no wait line outside test mode and writes it in test
  mode, with the gate file already there so nothing waits.

(f) Text: `SECURITY.md:5` (the allow-listed environment, git and gh without a credential helper or login, the account's
credential files still readable by a job's process); `docs/seat/agent-setup.md`, a new line after "Why HTTPS" (the
account's gh login and git helper serve the coordinator, such as the fetch of `limen github review`; a job does not see
them; the files stay readable); `docs/jobs.md`, a new section `### A job's environment` (the list, Limen's names, what
Limen sets, the dropped-names line, `--prepare`, test mode, the boundary), and the Start queue sentence on
`LIMEN_START_READING` now says "in test mode only"; the comments of `src/config.ts` (header, `testKnob`,
`setTestKnob`, `wrapperEnvironment`, `engineEnvironment`), `src/runtime/launcher.ts` (`launchWrapper`),
`src/runtime/wrapper.ts` (`endGate`), `src/runtime/job-setup.ts` (`setUpJob`) and `src/platform/linux.ts`
(`cgroupFolder`, `ownCgroup`).

Review round 1 (`review.md`, `ticket.md` → `## Decisions`, F1–F4):
- F1: `bin/limen-group-fixture.mjs` prints `export LIMEN_TEST_MODE=1` before `export LIMEN_HOME=…` in the lead's
  exports, and its comment above `setTestKnob` names the lead too; (b) above is corrected. Test:
  `test/bin/limen-group-fixture.test.ts`.
- F2 (a night default, for Adrian to confirm): `JOB_SETS` holds `GIT_ASKPASS=` (empty), with a comment on git's order
  (`GIT_ASKPASS`, else `core.askPass`, else `SSH_ASKPASS`, then `GIT_TERMINAL_PROMPT`); `docs/jobs.md`'s "Set by Limen"
  item names it. Test: the `core.askPass` test of `test/s1-spawn.test.ts`.
- F3 (text): `GH_CONFIG_DIR`'s `carries` line and `docs/jobs.md`'s "Set by Limen" item say that the folder hides gh's
  configuration files, so gh finds no login in them, that gh would still find a login it keeps in a system keyring
  through the user bus, and (the docs, after review round 2's note 2) that `gh auth status` outside a job names where
  the token is stored and `gh api user --silent` failing in a job is the check that no login reaches it; the section's boundary
  item now says that the environment "hides gh's configuration files" instead of "gives … gh no credential".
- F4 (text): the comments at `test/fake-engine.mjs:19`, `test/plant.ts:2` and `test/plant.ts:443` are rewrapped to 120
  columns and the broken sentence at `:443` is whole again. The same measurement (`grep -n -E '^.{121,}$'` over the
  ticket's added comment lines) found five more of this ticket's comment lines over 120 characters, rewrapped with the
  same words: `src/config.ts:414`, `test/config.test.ts:334`, `test/s1-spawn.test.ts:152`,
  `test/runtime/wrapper.test.ts:375` and `test/runtime/job-setup.test.ts:13`. Lines over 120 that the ticket did not
  add, and test names and string literals (the Biome configuration keeps long literals wide), are unchanged.

Review round 2 (`review.md`, `ticket.md` → `## Decisions`, G1 and G2):
- G1 (finding 3): the `--prepare` test of `test/s1-spawn.test.ts` above, through a plant spawn and its wrapper (the
  test of `test/runtime/job-setup.test.ts` calls `setUpJob` itself, so it could not see what the wrapper passes). It
  lives in `test/s1-spawn.test.ts` (T-29 (1), the implementer's choice): the file of this ticket's other plant-level
  tests of a job's environment, and one that runs at `HEAD`, where `test/runtime/wrapper.test.ts` fails at load (its
  import of `endGate`, Deviation 4), so `fails-before.mjs` shows this test's own failure there. The file's first
  comment now says that the `--prepare` command gets the engine's environment too. The test passes with the tree's
  code, so the code needed no fix.
- G2 (the taste answer on T-18): the comments at `test/plant.ts:2` and `:511` write "allow-list" and "allow-listed",
  as `src/` and the docs do.

## Proof

All from the repository root, after the round 1 fixes (F1–F4), each acceptance command on its own; every count is the
runner's `tests` and `pass` line with `fail 0`. After round 2's fixes (G1, G2) the counts are the same except AC-2's
`test/s1-spawn.test.ts`, which gained the G1 test; round 2 changed no other test file but `test/plant.ts`, two comment
words:
- AC-1: `node --test test/config.test.ts` → exit 0, 17 tests, 17 pass.
- AC-2: `node --test test/s1-spawn.test.ts` → exit 0, 9 tests, 9 pass (round 2; 8 of 8 in round 1); `node --test
  test/cli/continue.test.ts` → exit 0, 14 tests, 14 pass.
- AC-3: `node --test test/runtime/job-setup.test.ts` → exit 0, 1 test, 1 pass; `node --test
  test/runtime/launcher.test.ts` → exit 0, 4 tests, 4 pass.
- AC-4: `node --test test/platform/linux.test.ts` → exit 0, 27 tests, 27 pass; `node --test
  test/runtime/wrapper.test.ts` → exit 0, 26 tests, 26 pass.
- AC-5: `node --test test/fake-engine.test.ts` → exit 0, 2 tests, 2 pass; `node --test test/structure.test.ts` → exit
  0, 50 tests, 50 pass.
- F1's test: `node --test test/bin/limen-group-fixture.test.ts` → exit 0, 1 test, 1 pass.
- `npx tsc --noEmit` → exit 0 (round 2).
- `npx biome check --error-on-warnings .` → exit 0, "Checked 282 files in 502ms. No fixes applied." (AC-8, round 1);
  in round 2 the same check ran inside each gate run below, "Checked 282 files in 556ms. No fixes applied.", and
  `npx biome check --error-on-warnings test/s1-spawn.test.ts test/plant.ts` → exit 0, "Checked 2 files".
- `node adrian-rebuild/tools/gate.mjs` (round 2) → tests 1124, pass 1124, fail 0, cancelled 0, twice: 268.5 s (piped
  into `tail`, so the tool showed `tail`'s exit code), then 271.7 s with no pipe → exit 0 (AC-7). One test more than
  the 1123 of the round 1 fixes (the G1 test), 15 more than at `HEAD`. Round 1's fixes: exit 0, 1123 of 1123 (267.7 s).
- `node adrian-rebuild/tools/check.mjs` → exit 0, "0 errors" (AC-8), run after this file.
- `npx biome check --error-on-warnings adrian-rebuild` → exit 0.
- Round 1, on the way: a joint run of four files failed once, 72 of 73, on the A-083 scan of `test/structure.test.ts`,
  which bans the words `systemd-run` and `systemctl --user` outside `src/platform/`; a `carries` line of
  `src/config.ts` named them and was reworded. A joint run failed once, 46 of 47, on the removed-name test of
  `test/config.test.ts`, which then kept the test mode it found. Both were my own code, fixed, not runs again of an
  unchanged test. Round 1's gate: exit 0, 1121 tests, 1121 pass (263.9 s).

## Fails before

My runs of the new and changed tests against the unchanged `src/` (the test files already written, `src/` at `HEAD`):
- `node --test test/config.test.ts` → tests 17, pass 7, fail 10: the inventory (no `LIMEN_TEST_MODE`), the exceptions
  (no `crosses`), testKnob outside test mode (actual `[15, 15, 15, 15]`, expected `[0, 0, 0, 15]`), setTestKnob's test
  mode (actual `['/before', '/fixture', '0']`), `ignoredSettings` (the marker listed as an unknown name), and the five
  builder tests (the builder returned a copy of the test process's own environment with the passed values on top, no
  `environment` and no `dropped`).
- `node --test test/runtime/job-setup.test.ts` → fail: the prepare command got `HERDR_PANE_ID`, `HERDR_ENV`,
  `LIMEN_JOB_DIR`, `LIMEN_WORKTREE`, `LIMEN_LABEL`, `LIMEN_INTERNAL_RUN`, `LIMEN_SETUP_KEEP`, `LIMEN_SETUP_PREPARE`, and
  no `LIMEN_JOB`.
- `node --test test/platform/linux.test.ts` → tests 27, 1 fail: `ownCgroup()` gave the knob's cgroup instead of
  `/proc/self/cgroup`'s, and `cpuTime` read the knob folder's `usage_usec 7` instead of a missing `/sys/fs/cgroup/…`.
- `node --test test/s1-spawn.test.ts` → tests 7, pass 5, fail 2: the engine's names held `DEMO_API_TOKEN` and
  `LIMEN_COORDINATOR` and none of Limen's six, and the log had no dropped line; `git credential fill` exited 0 with a
  `password=` line.
- `node --test test/runtime/wrapper.test.ts` → the file fails at load: `endGate` was not exported. With the change in
  place I also made `testKnob` ignore test mode for one run (then restored it): the end-gate test fails with the wait
  line in the log outside test mode, so it checks the mechanism, not only the export.
- `test/fake-engine.test.ts`: its subject is `test/fake-engine.mjs`, a file under `test/`, so with the new fake engine in
  place it passes before `src/` changes. With the HEAD line of the recording put back for one run (then restored):
  fail, actual `[['LIMEN_JOB'], false]`, expected `[['DEMO_API_TOKEN', 'LIMEN_JOB', 'PATH'], false]`. For the same
  reason `fails-before.mjs`, which lays every changed file of `test/` over `HEAD`, sees this file pass there; the run as
  a whole still fails at `HEAD`.
- The test files changed only to turn test mode on (`test/registry.test.ts`, `test/hook/communication.test.ts`,
  `test/project/seat.test.ts`) and the helpers (`test/plant.ts`, `test/environment.ts`) pass at `HEAD` too; they check
  no new mechanism.

Review round 1 fixes, my runs with each new test written and the code it checks not yet changed (paths shortened to
`<checkout>` and `<tmp>`):
- F1: `node --test test/bin/limen-group-fixture.test.ts` → exit 1, tests 1, pass 0, fail 1: `AssertionError
  [ERR_ASSERTION]: LIMEN_HOME without LIMEN_TEST_MODE=1 in:` and the fixture's output, whose lead exports were `export
  LIMEN_COORDINATOR=1`, `export LIMEN_PACKAGE="<checkout>"`, `export PATH="<checkout>/bin":$PATH` and `export
  LIMEN_HOME="<tmp>/repository"`. At `HEAD` the fixture prints the same, so the file fails there too
  (`fails-before.mjs` lays only `test/` over `HEAD`). The first version of the test, run once before this one, gave
  the fixture the test process's `PATH` alone and failed in the fixture's own requirements check: `systemd-run --user
  --scope --quiet true failed: Failed to connect to bus: $DBUS_SESSION_BUS_ADDRESS and $XDG_RUNTIME_DIR not defined`.
  That run reached the machine's `systemd-run`, which refused at once with no user bus, so no unit started; the test
  then put the tests' systemd (`fakeSystemd`) and the fake engine as `pi` first, as `test/platform/requirements.test.ts`
  does.
- F2: `node --test test/s1-spawn.test.ts` → exit 1, tests 8, pass 6, fail 2: the `core.askPass` test, `actual: [ true,
  true ]` (a `password=` line, and the program ran) against `expected: [ false, false ]`; and the list test, whose
  expected names hold `GIT_ASKPASS` and the engine's do not. `node --test test/config.test.ts` → exit 1, tests 17, pass
  12, fail 5: the five builder tests, each with `GIT_ASKPASS: ''` missing from the built environment.
- F3 and F4 change text only; no test.

Review round 2 fixes, my run with the G1 test written: the round 1 code was already in the tree, so for one run I put
back the regression finding 3 names, the wrapper handing `--prepare` its own environment as at `HEAD`
(`setUpJob(jobDir, worktree, process.env)` in `src/runtime/wrapper.ts`), then restored the line (`git diff` of the file
is round 1's again):
- G1: `node --test test/s1-spawn.test.ts` → tests 9, pass 8, fail 1 (piped into `tail`, so the tool showed `tail`'s
  exit code; the runner exits 1 on a failed test), the G1 test: `AssertionError [ERR_ASSERTION]` with `actual: [ [
  'LIMEN_PROVIDER', 'HERDR_PANE_ID', 'LIMEN_PREAMBLE', 'LIMEN_LABEL', 'LIMEN_WORKTREE', 'LIMEN_SETUP_KEEP',
  'LIMEN_SETUP_PREPARE', 'LIMEN_INTERNAL_RUN', 'HERDR_ENV', 'LIMEN_MODEL', 'LIMEN_THINKING', 'LIMEN_TASK_FILE',
  'LIMEN_JOB_DIR' ], false ]` against `expected: [ [], true ]`: the spawner's two Herdr names and eleven transport names
  only the wrapper reads, and no `LIMEN_JOB`. With the line restored: tests 9, pass 9. At `HEAD` the prepare command
  gets the wrapper's environment the same way (its `runPrepare` spawns with no `env`), so the test fails there for the
  same cause; the main session's `fails-before.mjs` shows it.
- G2 changes two comment words; no test.

AC-6, the main session's run at `HEAD` `b21bd45` in round 1: `node adrian-rebuild/tools/fails-before.mjs` → exit 0, first line:
`fails-before: test/config.test.ts, test/fake-engine.test.ts, test/hook/communication.test.ts,
test/platform/linux.test.ts, test/project/seat.test.ts, test/registry.test.ts, test/runtime/wrapper.test.ts,
test/s1-spawn.test.ts, test/runtime/job-setup.test.ts fail at HEAD (exit 1)`; among its output, the s1 spawn's names
at `HEAD` against the expected list with the log line `environment: dropped 2 names of the spawner: DEMO_API_TOKEN,
LIMEN_COORDINATOR`, and `git credential fill`'s `[ true, null, true, false ]` (exit 0 with a password) against
`[ false, null, false, true ]`. The main session's gate on the same tree: `node adrian-rebuild/tools/gate.mjs` → exit
0, tests 1121, pass 1121, fail 0 (265.6 s).

AC-6 after round 1's fixes, the main session's run at `HEAD` `b21bd45`: `node adrian-rebuild/tools/fails-before.mjs`
→ exit 0, first line: `fails-before: test/config.test.ts, test/fake-engine.test.ts, test/hook/communication.test.ts,
test/platform/linux.test.ts, test/project/seat.test.ts, test/registry.test.ts, test/runtime/wrapper.test.ts,
test/s1-spawn.test.ts, test/bin/limen-group-fixture.test.ts, test/runtime/job-setup.test.ts fail at HEAD (exit 1)`;
among its output, the `core.askPass` test's `[ true, true ]` (a password, and the program ran) against `[ false, false
]`. The main session's gate on the same tree (with its text edit of Open point 6): `node adrian-rebuild/tools/gate.mjs`
→ exit 0, tests 1123, pass 1123, fail 0 (265.3 s) (AC-7).

AC-6 and AC-7 after round 2's fixes (G1, G2), the main session's runs: `node adrian-rebuild/tools/fails-before.mjs` →
exit 0 at `HEAD` `b21bd45`, the same ten files failing at `HEAD` (exit 1), `test/s1-spawn.test.ts` among them (the
tail of its output shows the two git tests; at `HEAD` `runPrepare` spawns with no `env`, so the prepare command gets
the wrapper's `HERDR_*` names, as the implementer's run with that line put back showed); `node
adrian-rebuild/tools/gate.mjs` → exit 0, tests 1124, pass 1124, fail 0 (270.2 s).

## Deviations

1. The dropped line says `1 name` when one name is dropped; the ticket's form `dropped <n> names` holds for every other
   count.
2. `setUpJob` gets the engine's environment from the wrapper as a parameter instead of building it, so one object
   serves the setup and the engine; its test in `test/runtime/job-setup.test.ts` passes the engine's environment built
   over a wrapper-like environment, and the wrapper's side of the hand-over, that it passes the engine's environment
   and not its own, has its test through a plant spawn in `test/s1-spawn.test.ts` (review round 2, G1).
3. The tests of the list are named `A-004: …` (the finding's ID, T-29 (2)), since `T1:` would read as a refusal code
   to `test/coverage.ts`'s `codeOf`.
4. `endGate` is exported from `src/runtime/wrapper.ts` for its in-process test; a plant job outside test mode cannot
   run, since its scope check and seat folder need the knobs.
5. `docs/jobs.md`'s Start queue sentence on `LIMEN_START_READING` changed too: it would otherwise say that manual checks
   use the knob with no word on test mode.
6. Three test files beyond the helpers set the marker themselves (`## Done` (b)); without it `test/project/seat.test.ts`
   would register 41 projects in the real seat folder of the account that runs the tests.

## Unmeasured

M-10 (the gate's run time at the close of stage 3; this ticket adds 15 tests, three of them plant spawns; the main
session's gate went from 1109 tests at R-037 to 1124). What only the seat shows is `unmeasured` here; no other metric
of `plan.md` → `## Measurement` (M-01–M-13) covers it, and its check is `## Deployment` 3.10: a trial job's `env` against the list, `git credential fill` against the account's real
`gh` helper, `gh api user --silent` failing (and `gh auth status` outside the job naming where the token is stored),
`systemctl --user is-system-running` inside a job, the end wake through the
wrapper's `HERDR_*` names, and the dropped-names line with the seat's real names (Claude Code's and Pi's names, a
project's toolchain names).

## Open points

1. `runInternalJob` keeps its two `biome-ignore` lines ("split pending"); this ticket moved one line inside it (the
   engine's environment before the setup) and did not split it (T-27 (1), the stage 6 condition).
2. `PWD` reaches a test job's engine from the tests' `systemd-run` shell script; the real `systemd-run --scope` adds no
   name, so 3.10's `env` will not show it.
3. In-process tests that call `withEnvironment` twice in one test may leave `LIMEN_TEST_MODE=1` for the later tests of
   the same file when Node runs `after` hooks in their order of registration, as it does for any name set twice; a
   later test that needs test mode off sets `LIMEN_TEST_MODE` itself, as the new tests do.
4. For gate 5.3 (F3): `GH_CONFIG_DIR` hides only gh's configuration files. Whether the seat's gh keeps its login in a
   file there or in a system keyring, which a job reaches through the user bus that must pass (R-026), is a seat fact:
   with a keyring login, gh in a job would still find it. Step 3.10 shows which: `gh auth status` outside the job names
   where the token is stored, and `gh api user --silent` must fail in the trial job (review round 2, note 2: a job's
   `gh auth status` lists no host once `hosts.yml` is hidden, even with a keyring login).
5. F2 (`GIT_ASKPASS=`, empty) is a night default (D-054 (2) (b)), for Adrian to confirm in the morning.
6. Text outside the places F2 and F3 name still says the stricter form: `SECURITY.md:5` ("git and gh in a job have no
   credential helper and no login") and `docs/seat/agent-setup.md:137` ("A job does not see them", gh "a configuration
   folder that does not exist"; it names the empty `credential.helper` and `GIT_TERMINAL_PROMPT=0`, not `GIT_ASKPASS`).
   I left them as they are; whether they take the keyring caveat and the askpass name is the main session's call.
   The main session's answer (text only, before review round 2): both now say it. `SECURITY.md:5`: git in a job has no
   credential helper and never asks, and gh finds no login in its configuration files, a keyring login still found;
   `docs/seat/agent-setup.md:137` names the empty `GIT_ASKPASS` and the keyring caveat, with `gh auth status` on the
   account and `gh api user --silent` in a job as the checks (review round 2, note 2).
7. For gate 5.3 (review round 3, note 1, guessed): git's HTTP transport reads `~/.netrc` through libcurl with no
   helper and no prompt, and `HOME` passes, so a netrc entry for github.com would give git in a job a credential. No
   environment name turns that off without moving `HOME`, which Pi, the bridge and Claude Code need (E-4); the main
   session's text fix: `docs/jobs.md`'s boundary item names the file and says the agents' account holds none, and
   step 3.10 checks that the account has no `~/.netrc`. The account's credential files as a whole are G2's
   accepted risk until stage 5 (`## Out of scope`).
