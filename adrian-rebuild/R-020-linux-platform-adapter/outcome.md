<!-- PL: Wynik ticketu R-020 (20.11; szkic implementera): nowy adapter platformy `src/platform/` to interfejs
`Platform` (tożsamość procesu, tablica procesów, nazwa programu, żywotność i sygnały procesu i grupy, odczyty CPU
i pamięci) z jedną implementacją, Linux, do której przeszły odczyty /proc, wywołania ps, os.cpus i process.kill
z src/runtime, src/job i src/project; polityki zostały u wywołujących. `src/platform/requirements.ts` deklaruje
Node 24, gita z `worktree list --porcelain -z`, tar, ps, pi (Pi 1.5.1 i most 5.0.3 jako dane) i Herdra (0.9.3, tylko
w panelu Herdra); `limen init` i `limen workspace init` sprawdzają je najpierw i odmawiają kodem 4, a centralny `git()`
rzuca ten sam błąd; fallback /opt/homebrew/bin/git wycięty. Zmiana 7 (D-060): `test/plant.ts` wstawia do PATH
środowiska testowego link do pierwszego gita z PATH procesu testów (na laptopie git 2.56.1 z Linuxbrew), więc AC-2
przechodzi bez shima. Recenzja 1: PASS z ośmioma uwagami; poprawki 1, 2, 3, 5, 7 i 8 (sonda gita przez --git-dir,
test sondy ps, jeden komunikat NODE_VERSION w bin/limen i adapterze, docs/setup.md, MISSING_TOOL tylko przy starcie
gita, podział testu parsera ps). Bramka 401/401. Stan: zamknięty (done) 20.11 po trzech rundach recenzji (runda 3: PASS bez uwag). -->

# Outcome: R-020 A Linux platform adapter and declared system requirements

## Review round 1 fixes

`ticket.md` → `## Decisions`, the entry of review round 1 (`review.md` → Round 1): fixes 1, 2, 3, 5, 7 and 8; nothing
changed for 4 and 6 (rejected there). Each test was written first and run in the working tree before its fix.

1. Fix 1: the git probe names its bare repository with `--git-dir=<repository>` instead of `-C <repository>`
   (`src/platform/requirements.ts`, `gitFailure`), so `safe.bareRepository=explicit` cannot refuse it. Test in
   `test/cli/init.test.ts`: "limen init passes its git probe when the environment sets safe.bareRepository to
   explicit" (`GIT_CONFIG_COUNT=1`, `GIT_CONFIG_KEY_0=safe.bareRepository`, `GIT_CONFIG_VALUE_0=explicit` in the
   command's environment). Before the fix: `node --test --test-name-pattern="names ps|safe.bareRepository"
   test/cli/init.test.ts` → exit 1; this test failed with ``git does not run "git worktree list --porcelain -z", which
   Limen reads worktrees with: fatal: cannot use bare repository '/tmp/limen-git-probe-C9Aiio' (safe.bareRepository is
   'explicit'). Install git 2.36 or newer.``
2. Fix 2: a test of the `ps` probe, "MISSING_TOOL: limen init refuses with exit code 4 and names ps when ps is not
   on PATH" (`test/cli/init.test.ts`, a PATH from `pathWithout(p, "ps")`). The probe was already in place, so the
   test passed in the same run before any fix; at `HEAD` there is no probe.
3. Fix 3: one Node failure. `nodeFailure` (`src/platform/requirements.ts`) and `bin/limen` both print "limen requires
   Node.js 24 or newer (this is <version>)" and `{"class":"environment","code":"NODE_VERSION","next":""}`; the
   adapter's message lost its "Install Node.js 24." and `bin/limen` its prose `next` ("install Node.js 24 or
   newer"), which is no Limen command. `bin/limen` cannot load `src/`, so it keeps literal copies; its comment says so.
   Test in `test/platform/requirements.test.ts`: "NODE_VERSION: bin/limen prints the message and the final line of the
   adapter's Node failure" (the message of `nodeFailure` with `${process.versions.node}` for the version, as a
   template literal, and `finalLine` of its class, code and `next`, in single quotes, must both appear in
   `bin/limen`). Before the fix: `node --test test/platform/requirements.test.ts` → exit 1; tests 3, pass 2, fail 1;
   `actual [false, false]` against `expected [true, true]`. The number itself was already compared by the agreement
   test.
4. Fix 5 (docs only): `docs/setup.md` → Requirements lists Node.js 24 or later, Git with `git worktree list
   --porcelain -z` (2.36 or later), `tar`, `ps`, Pi 1.5.1 with the bridge `@vanillagreen/pi-claude-bridge` 5.0.3, and
   Herdr 0.9.3 inside a Herdr pane, and says that `limen init` and `limen workspace init` check them first and exit with
   code 4 naming what is missing. The old "last known-good versions" line (pi 1.2.0, Herdr 0.9.1) is gone; the
   sentence that Limen does not refuse another version stays, for Pi and the bridge, until R-049.
5. Fix 7: the central `git()` (`src/project/git.ts`) throws `gitStartFailure` only for `ENOENT` and `EACCES`, the
   errors of starting git; any other spawn error goes up unchanged, as before R-020. Test in
   `test/project/git.test.ts`: "a spawn error of the central git runner other than ENOENT or EACCES goes up as it is,
   not as a missing tool" (`commitHasFile` with a 200,000-character path, one argument over the kernel's 128 KiB, so
   the spawn fails with `E2BIG`). Before the fix: `node --test test/project/git.test.ts` → exit 1; tests 2, pass 1,
   fail 1; `actual: LimenError: git cannot start: spawnSync git E2BIG. Install git 2.36 or newer.`
6. Fix 8 (T-29 (3)): the `ps` parser test is four tests in `test/platform/linux.test.ts`, each failing for one reason:
   "a ps row gives the process's pid, parent, group, CPU seconds and state, in that order of columns", "ps's CPU time
   reads in its MM:SS, HH:MM:SS and DD-HH:MM:SS forms, and as NaN in any other form", "the process table leaves out
   the row of the ps that printed it" and "the process table skips a header line and empty lines". The parser did not
   change, so they pass in the working tree; at `HEAD` the module does not exist.

After the fixes: `node adrian-rebuild/tools/gate.mjs` → exit 0, tests 401, pass 401, fail 0; `node --test` of
`test/platform/linux.test.ts` (8/8), `test/platform/requirements.test.ts` (3/3), `test/project/git.test.ts` (2/2),
`test/cli/init.test.ts` (10/10), `test/cli/workspace.test.ts` (1/1), `test/plant.test.ts` (2/2) and
`test/structure.test.ts` (23/23) → exit 0 each.

## Change 7 (D-060)

`ticket.md` → `## Decisions`, the entry D-060: the laptop's first `git` on PATH is now 2.56.1 from Linuxbrew, while
`/usr/bin/git` stays 2.34.1, and a plant's PATH was fixed (`<bin>:<the node's folder>:/usr/bin:/bin:/usr/sbin:/sbin`),
so every plant met 2.34.1 and its `limen init` refused with `MISSING_FEATURE`.

- `test/plant.ts`: `runnerGit(parent, nodeFolder)` finds the first folder of the test process's PATH that holds `git`
  and links that `git` (by its absolute path) into the plant-private folder `<parent>/runner-git`, which the plant's
  PATH puts right after the node's folder. When that git sits in the node's folder (the gate's shim, which then comes
  first, so the shim never meets a link to itself) or the PATH holds no git, the PATH is as before. Every other tool
  keeps the fixed PATH. The comment of `pathWithout` names the runner's git among what stays found.
- `pathWithout` and `pathWithOldGit` still do what their tests need: a tar-less PATH keeps `runner-git` (it holds
  only `git`) and mirrors `/usr/bin` and `/bin` without tar, so the git probe meets the runner's git before the
  mirror's 2.34.1 (the tar tests of `init` and `workspace init` pass only that way); the old-git script runs every call
  but `-z` under the plant's PATH, so it reaches the runner's git; a pi-less PATH mirrors only `<bin>`.
- The test, in `test/plant.test.ts` (the helpers' own test file): "D-060: a plant runs the git that comes first on the
  runner's PATH". A fixture `git` first on the test process's PATH answers `--version` with `git version
  0.0.0-fixture` and runs every other call with the git of the runner's own PATH; the plant's `git --version` (with
  the plant's env) must print the fixture's line.
- Its run before the fix, in the working tree (`node --test test/plant.test.ts`): exit 1; tests 2, pass 1, fail 1.
  The new test failed inside `plant()`, before its assertion: ``Error: limen init failed: git does not run "git
  worktree list --porcelain -z", which Limen reads worktrees with: error: unknown switch `z'. Install git 2.36 or
  newer.`` The plant ran `/usr/bin/git` 2.34.1 instead of the fixture, which would have passed the probe through to
  2.56.1. At `HEAD` `init` has no check, so there the plant is made and the assertion compares the fixture's line with
  the plant's git; the main session's `fails-before.mjs` run shows that failure.
- AC-2 before the fix, plainly: `node --test test/cli/init.test.ts` → exit 1, tests 8, pass 0, fail 8. After it:
  exit 0, tests 8, pass 8, fail 0.

## Done

1. `src/platform/platform.ts` (new): the interface `Platform` with nine members, each a primitive of the operating
   system: `processInfo(pid)` (state, parent, group, start ticks and command, as `present`, `absent` or
   `unavailable`), `processTable(deadline)` (every process with pid, parent, group, CPU seconds and state),
   `commandName(pid)`, `signalProcess` and `signalProcessGroup` (`sent`, `missing`, `denied`), `processAlive` and
   `processGroupAlive`, `coreTimes()` (idle and total time of each core) and `memory()` (MemAvailable and MemTotal in
   KiB). The types `ProcessInfo`, `ProcessQueryOutcome`, `ProcessRow`, `SignalResult`, `CoreTimes` and `MemoryReading`
   live here. `platform` is the implementation in use, `linux`. No member for the scheduler install or notifications
   (`ticket.md` → `## Decisions`); the module comment says where they are.
2. `src/platform/linux.ts` (new), holding the moved code:
   - from `src/runtime/contain.ts`: `processInfo` (its `/proc/<pid>/stat` parse is the exported `parseStat`), the
     process table and its bounded query `runBounded` (a detached `ps` killed with its group at the deadline or past
     1 MiB), and `signalTarget` with the liveness and group signals;
   - from `src/runtime/stalled-tool.ts`: ps's CPU-time parser (`cpuSeconds`). Its `ps -Ao pid=,ppid=,time=,stat=` and
     contain's `ps -Ao pid=,pgid=,ppid=,stat=` are now one table, `ps -Ao pid=,ppid=,pgid=,time=,stat=`, parsed by
     the exported `parseProcessTable` (`## Deviations` → 1);
   - from `src/job/publication.ts`: `ps -o comm= -p <pid>` as `commandName`;
   - from `src/runtime/start-queue.ts`: `os.cpus()` as `coreTimes` and the `/proc/meminfo` read as `memory`, parsed by
     the exported `parseMeminfo`;
   - from `src/project/seat.ts`: its copy of the liveness check is gone; `removeAbandonedLock` calls
     `platform.processAlive`.
3. The policies stayed where they were and call `platform`: the escaped-descendant walk and the birth checks of
   containment (`src/runtime/contain.ts`, which keeps `JobProcess`, `waitForProcessGroup`, discovery, containment and
   the cleanup note), the stall rule (`src/runtime/stalled-tool.ts`: the tree walk and the rule that one unreadable CPU
   time leaves the sample unread), the start gate (`src/runtime/start-queue.ts`: the two-second sample, the share of
   idle time and of free memory, the thresholds). Every other caller of the moved functions imports `platform` instead
   of `src/runtime/contain.ts`: `src/commands/group-rounds.ts`, `spawn.ts`, `steer.ts`, `stop.ts`,
   `src/integrations/coordinator-registration.ts`, `src/job/group-cabinet.ts`, `group-events.ts`, `record.ts`,
   `src/picture/activity.ts`, `src/runtime/reap.ts`, `recovery.ts`, `wrapper.ts`, and `test/u9-process-identity.test.ts`.
4. `src/platform/requirements.ts` (new, `## Deviations` → 2): the declared requirements, each with its probe, in the
   order the check runs them: Node (`NODE_MAJOR` = 24, `nodeFailure`, code `NODE_VERSION`); git by the feature
   `git worktree list --porcelain -z`, probed in a new empty bare repository of the temporary folder (`git init -q
   --bare --template=`, then the call with `--git-dir=<repository>`, review round 1 fix 1; code `MISSING_FEATURE` with git's first stderr line); `tar`, `ps` and `pi` on
   PATH (code `MISSING_TOOL`); Herdr only when `HERDR_ENV=1`, through `herdrBinary()` of
   `src/integrations/herdr.ts` (code `MISSING_TOOL`). `PI` (`@earendil-works/pi-coding-agent` 1.5.1), `BRIDGE`
   (`@vanillagreen/pi-claude-bridge` 5.0.3) and `HERDR` (0.9.3) are exported data, for R-049. `checkRequirements()`
   runs the probes and throws the first failure, a `LimenError` of class `environment` (exit code 4) whose message
   names the tool or the feature and what to install; `next` is "", as for `BAD_DATA`. `gitStartFailure(error)` is the
   error of a git that cannot start: "git is not on PATH; …" for `ENOENT`, "git cannot start: <reason>. …" otherwise.
5. `limen init` (every form, `--drop-leftovers` included) and `limen workspace init` call `checkRequirements()` first,
   so a refusal writes nothing. The central `git()` of `src/project/git.ts` throws `gitStartFailure` when git cannot
   start (exit code 4 instead of the untyped exit code 1), and `/opt/homebrew/bin/git` left its fallback list.
6. The scan in `test/structure.test.ts`: "A-083: outside src/platform/ no file of src/ or hook/ reads /proc/, names ps,
   calls cpus or signals with process.kill" over the files git knows, with its fixture self-test "the platform scan
   finds a /proc/ path, a ps literal, a cpus call and process.kill, and skips other text" (`## Deviations` → 3).
7. Tests (T-29), counts after review round 1: `test/platform/linux.test.ts` (new, 8: a stat line whose command holds
   spaces and parentheses, a zombie, a stat line without its closing parenthesis, the ps columns, the CPU-time forms
   `MM:SS` and `DD-HH:MM:SS` and an unreadable time, the scanner's own row, header and empty lines, and meminfo with
   and without MemAvailable); `test/platform/requirements.test.ts` (new, 3: bin/limen's `major < 24` and
   `engines.node` of package.json equal `NODE_MAJOR`; the Node probe refuses 23.9.0 and passes 24.0.0; bin/limen
   prints the adapter's Node message and final line); `test/cli/init.test.ts` (7 new: all tools present pass; a PATH
   without tar; a git that refuses `-z`; a PATH without pi; a PATH without ps; a Herdr pane without herdr; the git
   probe under `safe.bareRepository=explicit`); `test/cli/workspace.test.ts` (new, 1: a PATH without tar);
   `test/project/git.test.ts` (new, 2: a git without the execute bit gives `MISSING_TOOL` "git cannot start"; an
   `E2BIG` spawn error goes up as it is). Two helpers in
   `test/plant.ts`: `pathWithout(plant, tool)` (each PATH folder that holds the tool gives way to a folder of links to
   its other entries, so the runner's git and the gate's git shim stay found) and `pathWithOldGit(plant)` (a `git`
   that exits 129 on `-z`, as git before 2.36, and runs every other call under the plant's own PATH, so a shim never
   finds it again).
8. Change 7 (D-060, `## Change 7 (D-060)` above): a plant's PATH holds a link to the runner's git right after the
   node's folder; test in `test/plant.test.ts`.

## Proof

From the repository root, on this ticket's working tree after Change 7. The laptop's first `git` on PATH is 2.56.1
(Linuxbrew, D-060); `/usr/bin/git` is 2.34.1, which lacks `-z`; the gate sets no shim any more.

| Command | Exit | Result |
|---|---|---|
| `node --test test/platform/linux.test.ts` (AC-1) | 0 | tests 8, pass 8, fail 0 |
| `node --test test/cli/init.test.ts` (AC-2) | 0 | tests 10, pass 10, fail 0 (before Change 7: exit 1, fail 8 of 8) |
| `node --test test/cli/workspace.test.ts` | 0 | tests 1, pass 1, fail 0 |
| `node --test test/plant.test.ts` | 0 | tests 2, pass 2, fail 0 |
| `node --test test/structure.test.ts` (AC-3) | 0 | tests 23, pass 23, fail 0 |
| `git grep -n -E '/proc/\|"ps"\|/opt/homebrew\|os\.cpus\|cpus\(\)\|meminfo' -- src hook ':!src/platform'` (AC-4) | 1 | no line |
| `node adrian-rebuild/tools/gate.mjs` (AC-6) | 0 | after review round 1: tests 401, pass 401, fail 0, cancelled 0, skipped 0; duration_ms 89042.7; after Change 7: tests 394, pass 394, duration_ms 89803.3 (no shim line); before Change 7, with the shim of git 2.34: tests 393, pass 393, duration_ms 91283.5 |
| `npx tsc --noEmit` (AC-7) | 0 | |
| `npx biome check --error-on-warnings .` (AC-7) | 0 | Checked 196 files, no errors |
| `node adrian-rebuild/tools/check.mjs` (AC-8) | 0 | the main session's run on the tree after review round 2's fixes: 0 errors (PL summaries: 143 files; ticket folders: 23; 3 tickets ready); before it, the implementer's: 0 errors (142 files) |
| `npx biome check --error-on-warnings adrian-rebuild` | 0 | Checked 32 files, no errors |
| `node --test` of `test/platform/requirements.test.ts`, `test/project/git.test.ts`, `test/u9-process-identity.test.ts`, `test/runtime/start-queue.test.ts` | 0 each | tests 3, 2, 2 and 4; fail 0 each |

The gate's 401 tests are R-017's 377 plus 24 new ones: 8 in `test/platform/linux.test.ts`, 3 in
`test/platform/requirements.test.ts`, 7 in `test/cli/init.test.ts`, 1 in `test/cli/workspace.test.ts`, 2 in
`test/project/git.test.ts`, 2 in `test/structure.test.ts` and 1 in `test/plant.test.ts` (394 after Change 7; review
round 1 added 7: the ps parser test became 4, and 1 each for fixes 1, 2, 3 and 7).

The refusal texts, from a scratch repository outside the tree with the gate's node (before D-060): "pi is not on
PATH; every job runs on Pi 1.5.1 (@earendil-works/pi-coding-agent). Install it." and "herdr is not on PATH, and this
is a Herdr pane (HERDR_ENV=1); Limen opens job tabs with Herdr 0.9.3. Install it, or run limen outside the pane."
(both `{"class":"environment","code":"MISSING_TOOL","next":""}`), and ``git does not run "git worktree list
--porcelain -z", which Limen reads worktrees with: error: unknown switch `z'. Install git 2.36 or newer.``
(`{"class":"environment","code":"MISSING_FEATURE","next":""}`).

AC-9 (judgment), in the code: the nine members of `Platform` read or signal the operating system and decide nothing:
the deadline, the 1 MiB bound and the scanner's own row are how the table is read, while the walk, the birth checks,
the stall rule and the gate's thresholds call them from their modules. `linux` is the only object of type `Platform`.
Every declared tool has a probe whose failure names it with exit code 4: node (`NODE_VERSION`, unit test), git
(`MISSING_FEATURE`, and `MISSING_TOOL` through `gitStartFailure`), tar, ps, pi and herdr (`MISSING_TOOL`, CLI tests;
ps's since review round 1, fix 2).

## Fails before

The tests were written first and run before any change of `src/` (the commands and output of that run):

- `node --test test/platform/linux.test.ts test/platform/requirements.test.ts test/project/git.test.ts`: exit 1;
  `Error [ERR_MODULE_NOT_FOUND]: Cannot find module '…/src/platform/linux.ts'`, the same for
  `src/platform/requirements.ts`; the git test: `AssertionError [ERR_ASSERTION]: The validation function is expected
  to return "true". Received false`, `actual: Error: spawnSync git EACCES` (the raw spawn error, not a `LimenError`).
- `node --test --test-name-pattern="platform scan|A-083" test/structure.test.ts`: exit 1; tests 2, pass 1, fail 1.
  The A-083 scan listed 13 sites: `src/job/publication.ts:49` (twice, the `` `ps` `` of a comment) and `:52`
  (`"ps"`), `src/project/seat.ts:112` (`process.kill`), `src/runtime/contain.ts:34` (`process.kill`), `:187`
  (`/proc/`), `:214` (`"ps"`), `src/runtime/stalled-tool.ts:32` (`"ps"`), `:185` (`process.kill`),
  `src/runtime/start-queue.ts:100` and `:102` (`cpus(`), `:116` and `:118` (`/proc/`).
- `node --test test/cli/init.test.ts test/cli/workspace.test.ts` (before the change, so no plant's `init` refused):
  exit 1; tests 9, pass 4, fail 5. The five new refusal tests failed, e.g. the tar test: `actual [0, 0, false, true]`,
  `expected [4, 'MISSING_TOOL', true, false]` (init exited 0 and wrote `.limen/`); the passing four were the three old
  tests and "limen init passes its requirements check when every declared tool is on PATH".

The main session's runs of `node adrian-rebuild/tools/fails-before.mjs` (2026-11-20):

- Before D-060 (git 2.34.1 first on PATH, the gate's shim in place), exit 0:

  ```
  fails-before: test/cli/init.test.ts, test/structure.test.ts, test/u9-process-identity.test.ts, test/cli/workspace.test.ts, test/platform/linux.test.ts, test/platform/requirements.test.ts, test/project/git.test.ts fail at HEAD (exit 1)
  ✖ A-083: outside src/platform/ no file of src/ or hook/ reads /proc/, names ps, calls cpus or signals with process.kill (25.83714ms)
  ```

  followed by the scan's thirteen sites, the same list as above.
- After D-060 and Change 7 (git 2.56.1 first on PATH, no shim), exit 0:

  ```
  fails-before: test/cli/init.test.ts, test/plant.test.ts, test/structure.test.ts, test/u9-process-identity.test.ts, test/cli/workspace.test.ts, test/platform/linux.test.ts, test/platform/requirements.test.ts, test/project/git.test.ts fail at HEAD (exit 1)
  ✖ A-083: outside src/platform/ no file of src/ or hook/ reads /proc/, names ps, calls cpus or signals with process.kill (21.030791ms)
  ✖ test/u9-process-identity.test.ts (146.078845ms)
  ```

  Single files at `HEAD`, by `node adrian-rebuild/tools/fails-before.mjs <file>`, exit 0 each:
  - `test/plant.test.ts`: tests 2, pass 1, fail 1, "✖ D-060: a plant runs the git that comes first on the runner's
    PATH", `actual: 'git version 2.34.1\n'`, `expected: 'git version 0.0.0-fixture\n'`: the reason of Change 7.
  - `test/cli/init.test.ts` and `test/cli/workspace.test.ts`: the whole file fails on its import, `SyntaxError: The
    requested module '../plant.ts' does not provide an export named 'pathWithOldGit'`, since `HEAD`'s plant has no
    such helper. So `fails-before.mjs` does not show the refusal tests failing on their own; that proof is the run on
    the working tree before the change of `src/` above (five refusal tests fail, `init` exits 0 and writes `.limen/`).
  - D-060 (3) applies to these runs: `HEAD`'s plant meets `/usr/bin`'s git 2.34.1 without the shim; no failure above
    names `unknown switch` or a worktree, so none is that environmental one.
- After the review round 1 fixes, exit 0, the same eight files ("fail at HEAD (exit 1)"), no line naming `unknown
  switch`. Single files at `HEAD`, exit 0 each: `test/platform/linux.test.ts` (tests 1, fail 1: its import of
  `src/platform/linux.ts`), `test/project/git.test.ts` (tests 2, pass 1, fail 1: the typed start error; the new
  `E2BIG` test passes at `HEAD`, where any spawn error goes up raw, which is the behaviour fix (7) restores),
  `test/platform/requirements.test.ts` (tests 1, fail 1: its import).

### New tests that pass at `HEAD`

- "limen init passes its requirements check when every declared tool is on PATH": it shows that the check refuses
  nothing on a complete PATH; at `HEAD` there is no check, so nothing refuses either.
- "the platform scan finds a /proc/ path, a ps literal, a cpus call and process.kill, and skips other text": the
  scan's self-test on fixture text, which reads no file of `src/` (the pattern of the write scan's self-test).
- `test/u9-process-identity.test.ts` changed only its import (`platform.processInfo`); at `HEAD` it fails because
  `src/platform/platform.ts` does not exist, not because of a behaviour.
- "limen init passes its git probe when the environment sets safe.bareRepository to explicit" (review round 1, fix
  1): at `HEAD` `limen init` runs no probe, so it passes there, like the all-present test. It shows its mechanism
  against the `-C` probe in the working tree before fix 1, where it failed (`## Review round 1 fixes`, fix 1).
- "a spawn error of the central git runner other than ENOENT or EACCES goes up as it is, not as a missing tool"
  (review round 1, fix 7): at `HEAD` every spawn error goes up raw, so it passes there; it failed in the working tree
  before fix 7, where the error became `MISSING_TOOL` (`## Review round 1 fixes`, fix 7).
- "MISSING_TOOL: limen init refuses with exit code 4 and names ps when ps is not on PATH" (review round 1, fix 2)
  fails at `HEAD`, where init exits 0, as the other refusal tests do; it was written after the probe, so no run
  before its mechanism exists in the working tree.

## Deviations from the ticket

1. One process table instead of two `ps` reads. `## Change` 1 names "the process table" as one primitive, so
   containment's and the stall rule's reads became one: `ps -Ao pid=,ppid=,pgid=,time=,stat=`, bounded as
   containment's was (a detached process killed with its group at the deadline or past 1 MiB). The stall sample keeps
   its 2-second deadline and its rule that an unreadable CPU time leaves the sample unread; it is now a `throw new
   Error(` instead of a `reject(new Error(`, so that ratchet's count rose from 227 to 228 (its limit is 261).
2. The declared requirements are a third file of the adapter, `src/platform/requirements.ts`, beside the two that
   `## Change` names: they are not members of `Platform` (AC-9: only primitives there), and one module per
   responsibility (T-25).
3. The scan also bans `process.kill` outside `src/platform/`, since the signals moved into the adapter too
   (`## Change` 2: "liveness and signals"); `src/runtime/stalled-tool.ts`'s `signalOwnedProcess` therefore calls
   `platform.signalProcess` (it has no caller; `## Open points` → 4).
4. Tests beyond `## Change` 6, each for a part of `## Change`: the Herdr refusal (Change 3), `test/cli/workspace.test.ts`
   (Change 4, `workspace init`), `test/project/git.test.ts` (Change 4, the central `git()`), and the Node probe's
   unit test (Change 3).
5. A seat lock whose owner file holds a pid that `process.kill` rejects as an argument (a fraction, or above
   2^31 - 1) now ends `withSeatLock` with that `TypeError` at once; before, the lock was never reclaimed and the caller
   timed out after 10 s. Limen writes the file as `${process.pid}`, so only a damaged file gets there; R-019 rewrites
   this lock (D-056).
6. `limen init --drop-leftovers` runs the check too: `## Change` 4 says `limen init` runs it first, and that flag is a
   form of the command.
7. Change 7 is an addition to `## Change` by D-060 (`ticket.md` → `## Decisions`, the main session's technical
   default, D-060 (1)), not in the ticket as first written: `test/plant.ts` links the runner's git into each plant's
   PATH, and `test/plant.test.ts` holds its test (`## Change 7 (D-060)` above).
8. `bin/limen` changed, though `## Out of scope` names its Node check: review round 1's decision (3) makes its message
   and final line the adapter's (one copy, compared by a test); the check itself (`major < 24`, exit 4) is unchanged.

## Measurement

- M-10 (gate run time): 89.8 s in this ticket's last gate (no shim, the runner's git 2.56.1), 91.3 s in its first
  (through the shim of git 2.34), against 84.8–89.8 s in R-017's runs; every plant's `limen init` now starts `git
  init` and `git worktree list`. The stage close measures it.
- `unmeasured` (no M-NN): the probes against the seat's own tools (its git, Pi on the agents' PATH, Herdr inside the
  coordinator's pane); a `limen init` on the seat shows them.

## Open points

1. Resolved by D-060 and Change 7: AC-2 as written failed on this laptop, because every plant's `limen init` met
   `/usr/bin/git` 2.34.1 (`node --test test/cli/init.test.ts` → exit 1, fail 8). With the laptop's git 2.56.1 first on
   PATH and the plant's link to it, the plain run exits 0 (8 of 8), and single runs of plant-based test files need no
   shim. A runner whose first git lacks `-z` (and is not the gate's shim beside the node) still makes every plant's
   `init` refuse.
2. Three copies of "a folder of PATH holds the program": `onPath` here, `preflightEngine` (`src/runtime/engine.ts`) and
   `herdrBinary` (`src/integrations/herdr.ts`). `## Change` names neither of the other two; R-049 changes
   `preflightEngine` and could take `onPath`. `pi`'s presence is still also checked by `preflightEngine` at spawn
   (plain `Error`, exit code 1).
3. `git()` keeps its fallback to `/usr/bin/git` and `/usr/local/bin/git` when `git` is not on PATH, which the
   requirements check does not follow (it looks at PATH only). `## Change` 4 cuts only `/opt/homebrew/bin/git`. So a
   git missing from PATH and present only in `/usr/bin` passes `git()` but refuses `limen init`, and the `ENOENT` path
   of `gitStartFailure` in `git()` is reachable only on a machine with no git in either folder, which is why
   `test/project/git.test.ts` uses EACCES.
4. `signalOwnedProcess` (`src/runtime/stalled-tool.ts`) has no caller at `HEAD` or here.
5. Tools in use that the ticket does not declare: `sudo`, `id` and `getent` (the GitHub module, off by default),
   `hunk` (optional, `limen diff` falls back to `git diff`), `/bin/sh` for `--prepare`, `tail` inside a Herdr pane.
6. `README.md:22` and `docs/setup.md:10` still name only Node.js 24 and Git as requirements, and `docs/jobs.md:159`
   still says "MemAvailable over MemTotal in `/proc/meminfo`" (still true). `## Change` names no doc.
7. The changed functions keep their "split pending" suppressions: `runInternalJob` (`src/runtime/wrapper.ts:61-62`),
   `groupLock` (`src/job/group-cabinet.ts:105`) and `claimRecovery` (`src/runtime/recovery.ts:9`); the ratchet is
   R-082's, as in R-002–R-004.
8. R-019 (D-056) adds the boot id to the adapter; R-050's start script calls `checkRequirements()`.
