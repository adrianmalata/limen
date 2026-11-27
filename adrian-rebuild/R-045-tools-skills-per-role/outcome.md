<!-- PL: Wynik R-045 (szkic implementera, 27.11, przy `ba8d82b`): tabela ról `src/runtime/roles.ts` daje każdej roli
narzędzia, skille i flagę tylko do odczytu, a wpis `COORDINATOR_SESSION` obok niej (D-123); silnik zadania dostaje
`--tools`, `--no-skills` i `--skill`. Nowy moduł `src/job/read-only.ts` zapisuje stan startowy roli tylko do odczytu (z
haszem treści każdej ścieżki) przed silnikiem, a `finalizeJob` zamienia jej `done` na `failed`, rodzaj
`read-only-violation`, gdy worktree albo własna gałąź się zmieniły lub nie da się tego dowieść; `limen stop` wypisuje
koniec z rekordu. Rundy poprawek 1 (F1–F5, decyzja 17) i 2 (G1–G3, decyzja 18) zrobione; bramka sesji głównej 1471/1471,
recenzja rundy 3 PASS; stan: zamknięty. -->

# R-045 outcome

## Done

1. `src/runtime/roles.ts` (Change 1): a type `SessionTools` (`tools`, `skills`, `readOnly`); every entry of `JOB_ROLES`
   (`:38`) spreads one of two lists: `READS` (`:29`, `read,bash,finish`, read-only) for `reviewer`, `judge` and
   `researcher`, `WRITES` (`:31`, `read,bash,edit,write,finish`) for `worker`, `quality`, `keeper`, `coordinator` and
   `group-member`; `skills` is empty everywhere. `COORDINATOR_SESSION` (`:54`) holds `read,bash,edit,write`, no skill,
   not read-only, and is no table key (D-123; nothing applies it). A lookup `jobRole(role)` (`:61`) serves the other
   modules; `requireRoleModule` uses it. The header comment names the new fields and the rule that the table is the
   one list of job roles. `resolvePreamble` (`src/job/spawning.ts:125`) now returns a template only for a table role;
   any other role first goes through `refuseRemovedRole` (unchanged), then refuses with `ROLE_UNKNOWN` and the message
   `<role> is no job role; a job runs as worker, reviewer, judge, researcher, quality, keeper, coordinator or
   group-member` (the old message named a template path, which is wrong for `manual` and `styleguide`, whose templates
   exist).
2. `src/runtime/engine.ts` (Change 2): `EngineArgv` gains `tools` and `skills`; `argvFor` throws `LimenError` class
   `internal`, code `NO_TOOLS` (`:98`) for an empty list (E-5), then adds `--tools <a,b,…>` and `--no-skills` (`:113`)
   and one `--skill <PACKAGE_ROOT/path>` per skill (`:115`). `src/runtime/wrapper.ts` passes the role's entry
   (`:255`): a new `launchable` (`:403`) returns the role's table entry, or the `launch` detail of the existing check
   (worktree, `context.md`), of a role outside the table (defensive, since `resolvePreamble` already refuses one), or
   of a start state git cannot take.
3. `src/job/read-only.ts`, new (Change 3): `startState(worktree, branch)` (`:70`) reads HEAD, the own branch's tip (null
   when the branch does not exist) and every `git status` entry (ignored files excluded, each untracked file on its
   own, through a new `statusEntries` in `src/project/git.ts:340`), each with a hash of its content (round 1, F3); it
   refuses a worktree without `.git` before any git call, so git never reads a repository above it.
   `difference(start, now)` (`:86`) gives null or one line joined by
   `; `: `HEAD moved <12 hex>..<12 hex>`, `branch <name> moved <12 hex>..<12 hex>` (`none` for a missing branch),
   `<n> paths changed: <up to 5 paths>` (`1 path changed` for one), names and paths through `shownField`.
   `recordStartState` (`:109`) writes `start-state.json` with `atomicWrite` for a read-only role unless the folder holds
   one; `readOnlyEffect` (`:131`) reads it through `parseJson` with its own validators and compares; `carriedStartState`
   (`:160`) gives a parent's bytes. The own branch is the record's, except a reviewer's (Decision 11).
4. Wrapper and continuation (Change 4): `launchable` takes the start state after setup and the worktree and
   `context.md` checks, before the engine; a git failure there ends the job `failed`, kind `launch`, detail `the start
   state of the worktree <path> could not be taken: <git's words>`, no engine. `src/job/continuation.ts` reads the
   parent's `start-state.json` in validate (`:327`) and passes it through the plan to `publishJob`, which writes it in
   the hidden folder with the other files (`src/job/publication.ts:120`), so it appears in the same rename as the
   record.
5. `src/job/finalize.ts` (Change 5): `finalizeJob` computes `readOnlyEffect` once the record is in a state it ends from
   (`:113`); `checkedEnd` (`:174`) turns a `done` end with a difference or an `unproven:` detail into `failed`, kind
   `read-only-violation`; a `failed` end keeps its kind and a `stopped` end its state, and both log `read-only:
   <difference>` before the terminal line (only the transition's winner writes it).
6. `test/fake-engine.mjs` (Change 6): `activeTools` (`:649`) follows Pi 1.5.1: none with `--no-tools`; the defaults plus
   every registered tool without `--tools`; with it only the listed names that are a built-in (`BUILT_IN`, `:642`) or a
   registered tool. The model view of R-038 takes that list unchanged. New script word **`untracked <path>`**: a bash
   tool call, then the file is written in the cwd (a write through bash, z. 14).
7. Texts (Change 7): `templates/researcher.md` (a clone or download into a folder that `mktemp -d` makes, never into the
   worktree) and its reference `test/runtime/context-message/researcher.md`; `docs/jobs.md` (the `done` row, the kind
   `read-only-violation` with its roles, what is compared, the details and `unproven:`, the two new `launch` causes, the
   `done:` stop, `start-state.json` in the job folder, the reviewer's tools under "Reviews"); `docs/setup.md` → "Project
   skills" (jobs load no skill; the hand-started coordinator still does); `docs/commands.md` → "Pi extensions" (an
   extension's tools reach a job only when its role's list names them, and none does).
8. Tests (Change 8), each listed in `## Fails before`: `test/runtime/roles.test.ts` (new, 4 tests),
   `test/runtime/engine.test.ts` (new, 3), `test/job/read-only.test.ts` (new, 7; 10 after round 1), and new tests in
   `test/fake-engine.test.ts` (1), `test/job/finalize.test.ts` (4), `test/runtime/wrapper.test.ts` (2),
   `test/cli/spawn.test.ts` (3), `test/cli/continue.test.ts` (1), `test/job/spawning.test.ts` (1 new, 1 changed: the
   existing `ROLE_UNKNOWN` test now expects the new message). `test/u5-engine-stream.test.ts` passes `tools` and
   `skills` to `argvFor`, its assertion unchanged (AC-2). The finalize tests write `start-state.json` as `docs/jobs.md`
   describes it instead of importing the new module, so at HEAD each new test fails on its own assertion and the 13
   older tests of the file still run and pass.

### Review round 1 fixes (Decision 17)

- F1 (blocking finding 1): `src/job/stopping.ts` prints the end the record holds once a stop's `finalizeJob` (or, for
  a queued job, its wrapper's) has ended the job, through a new `endLine` (`:138`, used at `:83`, `:127` and `:130`):
  `failed <id>: <kind>: <detail>` for a failed record, else `<state> <id>: <reason>`. A `done:` stop of a reviewer
  that committed now prints `failed <id>: read-only-violation: HEAD moved …`; a worker's still prints `done <id>: …`.
  The stop still exits 0 and still marks the calling session as told. `requestedTerminal` is no longer imported
  there. New test in `test/cli/stop.test.ts` (`:153`), deterministic through the end gate `LIMEN_END_GATE` (D-029):
  both wrappers wait after their engines' end, so the stop's own transition ends each job.
- F2 (note 2): `docs/setup.md` → "Project skills" and `docs/commands.md` → "Pi extensions" say that `--no-skills` still
  loads the skills a package given with `--extension` declares, and that the extensions Limen selects itself, its
  hooks and the bridge, declare none (the bridge 5.0.3's `package.json` `pi` manifest lists only `extensions`; the
  hooks are single files).
- F3 (note 4): each listed path of the start state carries `hash` (`ListedPath`, `src/job/read-only.ts:48`): a SHA-256
  of a file's bytes, `link:<sha256>` of a symlink's target, `directory`, `special`, or `missing` (`contentHash`,
  `:194`). A file is read in 64 KiB chunks through one descriptor opened `O_RDONLY | O_NOFOLLOW | O_NONBLOCK` and
  checked to be a regular file, so a pipe never blocks the end and a large file takes one chunk of memory. The status
  already listed every untracked file (`--untracked-files=all`). `statusChanges` compares the hash too, so a second
  write to a path that was dirty at the start is a difference. `docs/jobs.md` says so (the kind and `start-state.json`).
  New test: a tracked file `--prepare` left modified, written again, is `1 path changed: README.md`; left alone, none.
- F4 (note 5): `readOnlyEffect` (`:131`) wraps the comparison (`comparedState`, `:145`) so that any rejection becomes
  the effect `unproven: <words>`; `takenState` (`:177`) now turns any error while a state is taken into its words, git's
  or a listed path's, so a start state that cannot be read ends the job `launch` and an end state that cannot be read
  is `unproven`. `readOnlyEffect` takes `Pick<JobRecord, "role" | "worktree">`. New test, with no fake of git: a file
  of the worktree made unreadable (mode 000) after the start state gives `unproven: … EACCES …` and no rejection
  (skipped as root, as `test/cli/sweep.test.ts` does).
- F5 (note 6): the test of the cap and the escaping is two tests: "difference counts every changed path and names the
  first five" (six plain names) and "difference escapes a newline in a path it names" (`line\nbreak` is shown as
  `line\\nbreak`).

### Review round 2 fixes (Decision 18)

- G1 (note 1): every `unproven:` detail and every launch detail of the start state is escaped as `difference`'s paths
  are (`shownField`): `unprovenEffect` (`src/job/read-only.ts:190`) escapes the words after `unproven: ` on each of its
  three paths (an unreadable start state, a worktree or listed path that cannot be read at the end, any other error),
  and `recordStartState` escapes its launch detail (`:120`). A file name with a newline in an error's words no longer
  adds a line to the failure detail, the log or the `limen stop` line. New test (`test/job/read-only.test.ts:136`): a
  file `line\nbreak` made unreadable after the start state gives a one-line `unproven:` detail that holds
  `line\\nbreak` (skipped as root, as the F4 test).
- G2 (note 2, T-30): `docs/jobs.md` (the `launch` causes), the comment of `launchable` (`src/runtime/wrapper.ts`) and the
  comment of `recordStartState` say that a start state that cannot be taken, by git or by a read of a path its status
  lists, ends the job `launch`.
- G3 (note 3, T-25 (2)): `src/project/git.ts` parses `git status --porcelain -z` once, in `parsedStatus` (`:344`);
  `statusEntries` (`:340`) and `statusPaths` (`:464`, behind `dirtyPaths` and `worktreeChanges`) are built on it. The
  callers and their tests are unchanged.

## Proof

All from the repository root at `ba8d82b`, with the change in the working tree.

Each `node --test <file>` ran through the gate's environment (`gate-env.mjs`: private TMPDIR, the git shim where the
laptop's git lacks `worktree list -z`), since a test run outside it on this laptop is no evidence (D-034).

| Command | Exit | Tests |
|---|---|---|
| `node --test test/runtime/roles.test.ts` (AC-1) | 0 | 4/4 |
| `node --test test/runtime/engine.test.ts` (AC-2) | 0 | 3/3 |
| `node --test test/u5-engine-stream.test.ts` (AC-2) | 0 | 3/3 |
| `node --test test/fake-engine.test.ts` (AC-3) | 0 | 27/27 |
| `node --test test/job/read-only.test.ts` (AC-4) | 0 | 11/11 (round 1: 7 → 10, F3, F4, F5; round 2: 11, G1) |
| `node --test test/job/finalize.test.ts` (AC-4) | 0 | 17/17 |
| `node --test test/runtime/wrapper.test.ts` (AC-5) | 0 | 34/34 |
| `node --test test/job/spawning.test.ts` (AC-5) | 0 | 3/3 |
| `node --test test/cli/spawn.test.ts` (AC-6) | 0 | 34/34 |
| `node --test test/cli/continue.test.ts` (AC-6) | 0 | 21/21 |
| `node --test test/cli/stop.test.ts` (round 1, F1) | 0 | 8/8 |
| AC-7's `fails-before.mjs` command | 0 | the nine files fail at HEAD (`## Fails before`) |
| the same with `test/cli/stop.test.ts` (round 1) | 0 | the ten files fail at HEAD (`## Fails before`) |
| the same, after the round 2 fixes | 0 | the ten files fail at HEAD (`## Fails before`) |
| `git grep -q -e '--no-skills' -- src/runtime/engine.ts` (AC-8) | 0 | — |
| `git grep -q 'read-only-violation' -- docs/jobs.md` (AC-9) | 0 | — |
| `git grep -q 'mktemp -d' -- templates/researcher.md` (AC-10) | 0 | — |
| `git grep -q 'Put project skills in' -- docs/setup.md` (AC-11) | 1 | — |
| `node adrian-rebuild/tools/gate.mjs --out node_modules/.rebuild-review/R-045.gate` (AC-12), the main session's run before round 1 | 0 | 1466/1466, 339.7 s |
| the same, the implementer's run after the round 1 fixes | 0 | 1470/1470, 340.5 s |
| the same, the main session's run after the round 1 fixes | 0 | 1470/1470, 382.1 s |
| the same, the main session's run after the round 2 fixes | 0 | 1471/1471, 359.3 s |
| the same, the implementer's run after the round 2 fixes | 0 | 1471/1471, 366.6 s |
| `npx biome check --error-on-warnings .` (AC-13) | 0 | 299 files |
| `npx tsc --noEmit` | 0 | — |
| `node adrian-rebuild/tools/check.mjs` (AC-13) | 0 | "0 errors" |
| `npx biome check --error-on-warnings adrian-rebuild` | 0 | — |

Gate runs: the main session's runs after each hand-back of the implementer (protocol step 4) → exit 0, `ℹ tests 1466`,
`ℹ pass 1466`, `ℹ fail 0`, `duration_ms 339689`; after the round 1 fixes → exit 0, `ℹ tests 1470`, `ℹ pass 1470`,
`ℹ fail 0`, `duration_ms 382111`; with it, the round's `fails-before.mjs` run of AC-7's files and `test/cli/stop.test.ts`
→ exit 0. After the round 2 fixes → exit 0, `ℹ tests 1471`, `ℹ pass 1471`, `ℹ fail 0`, `duration_ms 359332`,
and the same `fails-before.mjs` run → exit 0. The implementer's runs, both with `--out node_modules/.rebuild-review/R-045.gate`:
1. exit 0: `ℹ tests 1466`, `ℹ pass 1466`, `ℹ fail 0`, `duration_ms 338440`. After it, only the helper `roleJob` of
   `test/job/finalize.test.ts` changed (it writes the start state itself instead of importing the module).
2. On the tree handed back for round 1: exit 0, `ℹ tests 1466`, `ℹ pass 1466`, `ℹ fail 0`, `duration_ms 341619`.
3. After the round 1 fixes (F1–F5, four tests more): exit 0, `ℹ tests 1470`, `ℹ pass 1470`, `ℹ fail 0`,
   `duration_ms 340511`.
4. After the round 2 fixes (G1–G3, one test more), on the final tree: exit 0, `ℹ tests 1471`, `ℹ pass 1471`,
   `ℹ fail 0`, `duration_ms 366552`.

No test failed in any gate run. One of the new tests failed once in a run of its own file while it was written: the
wrapper test spawned its worker beside a done candidate, which `UNLANDED_WORK` refuses; the test then took the
candidate itself as the worker job (a defect of the new test, not of code it runs).

AC-14 (judgment, for the reviewer): no role text recommends a tool its list lacks (the reviewer runs checks and the
researcher fetches with `bash`, the judge reads files); the researcher's clone and download now go to a `mktemp -d`
folder; the reviewer's lockfile install writes `node_modules`, which is no write where the project ignores it (Open
point 5).

## Fails before

The tests were written first and run at HEAD before any source change, file by file
(`node adrian-rebuild/tools/fails-before.mjs <file>`, exit 0 for each of the nine files): the two files that import a new
module or export fail to load (`roles.test.ts`: `does not provide an export named 'COORDINATOR_SESSION'`;
`read-only.test.ts`: `Cannot find module …/src/job/read-only.ts`), and in the other files only the new tests failed
(the finalize file then imported the new module too and failed to load; its helper changed later, below).

Per test, on the final test files laid over a copy of HEAD (`git archive HEAD`, the same method as `fails-before.mjs`,
which prints only its last 40 lines), each failing test and the counts:

- `test/runtime/engine.test.ts`, `test/job/finalize.test.ts`, `test/job/spawning.test.ts`, `test/fake-engine.test.ts`:
  `tests 50, pass 40, fail 10`; failing: the three engine tests (no `--tools` in the argv, no `--skill`, no throw for
  an empty list), the four new finalize tests (the reviewer's `done` stays `done`: `actual: [ 'done', undefined,
  undefined ]`; no `read-only:` line), both `ROLE_UNKNOWN` tests (`refusals: ['started', 'started']` for `manual`
  and `styleguide`; the old message for `tester`), the fake's tool selection (`listed` holds
  `mcp__custom-tools__nonesuch`).
- `test/runtime/wrapper.test.ts`, `test/cli/spawn.test.ts`, `test/cli/continue.test.ts`, `test/runtime/roles.test.ts`,
  `test/job/read-only.test.ts`: `tests 91, pass 83, fail 8`; failing: both wrapper tests (no `start-state.json`:
  `head: undefined`; the review with a broken `.git` ends `done`), the three spawn tests (the committing review and
  the review that leaves `notes.txt` end `done`; the reviewer's view lists `edit` and `write`), the continue test
  (the child ends `done`), and the two files that do not load.

The main session's AC-7 run on the final tree → exit 0, the same nine files failing at `HEAD` (its first run's output
was discarded by a redirection, so it ran once more with its output filtered; both exited 0). The implementer's AC-7
run on the final tree, `node adrian-rebuild/tools/fails-before.mjs test/runtime/roles.test.ts test/runtime/engine.test.ts
test/fake-engine.test.ts test/job/read-only.test.ts test/job/finalize.test.ts test/runtime/wrapper.test.ts
test/job/spawning.test.ts test/cli/spawn.test.ts test/cli/continue.test.ts` → exit 0 (the gate's private TMPDIR shown
as `<gate TMPDIR>`):

```
fails-before: test/runtime/roles.test.ts, test/runtime/engine.test.ts, test/fake-engine.test.ts, test/job/read-only.test.ts, test/job/finalize.test.ts, test/runtime/wrapper.test.ts, test/job/spawning.test.ts, test/cli/spawn.test.ts, test/cli/continue.test.ts fail at HEAD (exit 1)
  'test failed'

test at test/runtime/wrapper.test.ts:329:1
✖ a review job's wrapper writes start-state.json at its candidate's commit before its engine runs, and a worker job writes none (3217.932328ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
  + actual - expected
  
    {
  +   head: undefined,
  -   head: '58c8500da65e928e69860ab968d4fe12d22a4234',
      worker: false
    }
  
      at TestContext.<anonymous> (file://<gate TMPDIR>/fails-before-tE38xx/test/runtime/wrapper.test.ts:336:9)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:974:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: { head: undefined, worker: false },
    expected: { head: '58c8500da65e928e69860ab968d4fe12d22a4234', worker: false },
    operator: 'deepStrictEqual',
    diff: 'simple'
  }

test at test/runtime/wrapper.test.ts:344:1
✖ a review job whose start state git cannot take ends failed, kind launch, naming the worktree, and starts no engine (3180.782624ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  
  'done' !== 'failed'
  
      at TestContext.<anonymous> (file://<gate TMPDIR>/fails-before-tE38xx/test/runtime/wrapper.test.ts:350:9)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:974:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: 'done',
    expected: 'failed',
    operator: 'strictEqual',
    diff: 'simple'
  }
```

### Review round 1 fixes

The round's three new tests were written first and run against the round-1 code, through the gate's environment:
- `node --test test/job/read-only.test.ts` → exit 1, `tests 10, pass 8, fail 2`: F3's test gave `[null, null]` for
  `[null, '1 path changed: README.md']` (the second write unseen); F4's gave `{ kind: 'same', detail: '' }` for
  `{ kind: 'unproven', detail: true }` (no file was read, so nothing failed and nothing was proven). F5's two tests
  passed: they split a test that already passed, so they show no change of code (at HEAD the file does not load).
- `node --test --test-name-pattern "prints the failed end" test/cli/stop.test.ts` → exit 1, `tests 1, fail 1`: the
  review's stop printed `done <id>: done: accepted` for `failed <id>: read-only-violation: HEAD moved <tip>..<head>`,
  while its record held `read-only-violation` (the worker's line matched).

On a copy of HEAD with the final `test/cli/stop.test.ts` and `test/job/read-only.test.ts`: `tests 9, pass 7, fail 2`;
failing: the new stop test (the review's stop prints `done`) and `read-only.test.ts`, which does not load (no
`src/job/read-only.ts`); the seven older stop tests pass.

The round's run, `node adrian-rebuild/tools/fails-before.mjs test/runtime/roles.test.ts test/runtime/engine.test.ts
test/fake-engine.test.ts test/job/read-only.test.ts test/job/finalize.test.ts test/runtime/wrapper.test.ts
test/job/spawning.test.ts test/cli/spawn.test.ts test/cli/continue.test.ts test/cli/stop.test.ts` → exit 0:

```
fails-before: test/runtime/roles.test.ts, test/runtime/engine.test.ts, test/fake-engine.test.ts, test/job/read-only.test.ts, test/job/finalize.test.ts, test/runtime/wrapper.test.ts, test/job/spawning.test.ts, test/cli/spawn.test.ts, test/cli/continue.test.ts, test/cli/stop.test.ts fail at HEAD (exit 1)
  'test failed'

test at test/runtime/wrapper.test.ts:329:1
✖ a review job's wrapper writes start-state.json at its candidate's commit before its engine runs, and a worker job writes none (3193.746139ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
  + actual - expected
  
    {
  +   head: undefined,
  -   head: '0c003d37a5b2f268ab9779bba3f1f70c190e9644',
      worker: false
    }
  
      at TestContext.<anonymous> (file://<gate TMPDIR>/fails-before-9LDD6z/test/runtime/wrapper.test.ts:336:9)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:974:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: { head: undefined, worker: false },
    expected: { head: '0c003d37a5b2f268ab9779bba3f1f70c190e9644', worker: false },
    operator: 'deepStrictEqual',
    diff: 'simple'
  }

test at test/runtime/wrapper.test.ts:344:1
✖ a review job whose start state git cannot take ends failed, kind launch, naming the worktree, and starts no engine (3137.64229ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  
  'done' !== 'failed'
  
      at TestContext.<anonymous> (file://<gate TMPDIR>/fails-before-9LDD6z/test/runtime/wrapper.test.ts:350:9)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:974:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: 'done',
    expected: 'failed',
    operator: 'strictEqual',
    diff: 'simple'
  }
```

### Review round 2 fixes

G1's test was written first and run against the round-1 code, through the gate's environment:
`node --test --test-name-pattern "escapes a newline in the name" test/job/read-only.test.ts` → exit 1, `tests 1, fail
1`: `{ kind: 'unproven', lines: 2, escaped: false }` for `{ kind: 'unproven', lines: 1, escaped: true }` (the error's
words held the raw newline of the file's name). At HEAD the file does not load (no `src/job/read-only.ts`). G2 changes
text only, and G3 changes the parser without a change of behaviour, so neither has a test of its own; the callers' tests
(`UNLANDED_WORK` in `test/cli/spawn.test.ts`, the read-only tests) pass in the gate.

The round's run, `node adrian-rebuild/tools/fails-before.mjs test/runtime/roles.test.ts test/runtime/engine.test.ts
test/fake-engine.test.ts test/job/read-only.test.ts test/job/finalize.test.ts test/runtime/wrapper.test.ts
test/job/spawning.test.ts test/cli/spawn.test.ts test/cli/continue.test.ts test/cli/stop.test.ts` → exit 0:

```
fails-before: test/runtime/roles.test.ts, test/runtime/engine.test.ts, test/fake-engine.test.ts, test/job/read-only.test.ts, test/job/finalize.test.ts, test/runtime/wrapper.test.ts, test/job/spawning.test.ts, test/cli/spawn.test.ts, test/cli/continue.test.ts, test/cli/stop.test.ts fail at HEAD (exit 1)
  'test failed'

test at test/runtime/wrapper.test.ts:329:1
✖ a review job's wrapper writes start-state.json at its candidate's commit before its engine runs, and a worker job writes none (3284.559479ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
  + actual - expected
  
    {
  +   head: undefined,
  -   head: '30d9c92ed97ee0db00d3ad4bfca3811653a77333',
      worker: false
    }
  
      at TestContext.<anonymous> (file://<gate TMPDIR>/fails-before-Z8wYPZ/test/runtime/wrapper.test.ts:336:9)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:974:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: { head: undefined, worker: false },
    expected: { head: '30d9c92ed97ee0db00d3ad4bfca3811653a77333', worker: false },
    operator: 'deepStrictEqual',
    diff: 'simple'
  }

test at test/runtime/wrapper.test.ts:344:1
✖ a review job whose start state git cannot take ends failed, kind launch, naming the worktree, and starts no engine (3117.075027ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  
  'done' !== 'failed'
  
      at TestContext.<anonymous> (file://<gate TMPDIR>/fails-before-Z8wYPZ/test/runtime/wrapper.test.ts:350:9)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:974:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: 'done',
    expected: 'failed',
    operator: 'strictEqual',
    diff: 'simple'
  }
```

## Deviations from the ticket

1. The ticket's line format `<n> paths changed` reads `1 path changed: <path>` for a single path.
2. A role outside the role table also ends a running job `failed`, kind `launch`, in the wrapper (no fallback list,
   Decision 9); spawn and continue refuse such a role before, so only a job published before this change could meet
   it. No test runs that path.
3. The `ROLE_UNKNOWN` message changed (item 1), so R-040's existing test in `test/job/spawning.test.ts` changed with it.
4. `test/u5-engine-stream.test.ts` changed (two slot fields), though Change 8 does not list it: `argvFor` now requires
   the list. It passes at HEAD and after, so it is not in AC-7's list.
5. `src/project/git.ts` gained `statusEntries` (the module that runs git), and `src/job/publication.ts` gained the
   optional `startState` of a new job; Change 3 and 4 name neither file, but the start state needs the status codes,
   and the copy belongs in the publication's one rename.
6. Round 1, F1: the stop's line comes from the record also on a third path the decision does not name, a queued job
   whose own wrapper ended it while the stop waited (`src/job/stopping.ts:127`, which printed the record's state with
   the stop's reason before): the same `endLine`, so a queued read-only job's `done:` stop prints its `failed` end too.
   The line of a running job that its wrapper ended first stays `<id> is already <state>`.
7. Round 1, F3: the hash also covers a symlink (`link:` and a hash of its target), a folder (`directory`) and any other
   kind (`special`), which the decision does not name, so that no listed path blocks the read or has no value.
8. Round 1, F4: a start state that cannot be read for any reason, not only git's, now ends the job `launch` before its
   engine (`takenState` turns every error into its words), the start's side of the same fail-closed rule.
9. Round 2, G1: `shownField` escapes the whole words, so a `BAD_DATA` message of a damaged start state, which already
   shows its value escaped and quoted, gets its quotes escaped once more (`got \"{\"`). That costs only looks; the text
   stays on one line either way.
10. Round 2, G3: the one parser always takes the field after a rename or a copy as its source path, where `statusPaths`
    took it only when it was not empty, and `statusPaths` leaves out an empty source. Git always prints the source, so
    the paths are the same.

## Unmeasured

- `unmeasured`, M-02 (one raw request per role, seat step 4.8) and seat step 4.3: what a job's request carries under
  the bridge now (the tool definitions of `read`, `bash`, `finish` for a reviewer, no skills block), and whether the
  seat's Claude Code lists any tool it would load on demand. The fake shows the argv and Pi's selection only.
- `unmeasured`, M-01: the fixed context the dropped skills list saves per job (A-081 History: 37 KB for 60 skills on
  the author's account); M-01 measures the context message and the cue, not Pi's skills block.
- `unmeasured`, M-11 (failure kinds per ticket): how often `read-only-violation` occurs on the seat, and whether the
  projects' checks, run by a reviewer, leave files `.gitignore` does not cover (Risk; seat step 4.3 "the trial route's
  review ends `done`").

## Open points

1. Closed by round 1, F3: a path already dirty at the start that the job writes again is a difference (its content hash
   changed). What stays unseen: a write inside a listed folder (`directory`, such as a nested repository that status
   lists whole, which `--prepare` left) after the start.
2. Closed by round 1, F1: `limen stop <id> "done: …"` prints the end the record holds.
3. A `done:` stop of a read-only job before its wrapper took the start state (queued or still `starting`) ends `failed`,
   `read-only-violation`, `unproven: <job>/start-state.json is missing` (fail closed, Decision 12), though no engine ran.
4. `runInternalJob` keeps its two debt suppressions (`biome-ignore … split pending`); this ticket replaced two lines in
   it with the call of `launchable` and added two argv fields. T-27 (1) asks a ticket that changes such a function to
   remove them; R-111, R-044 and others left them for R-082.
5. The reviewer's "Install from the lockfile" (`templates/reviewer.md:11`) writes `node_modules`, which is no write only
   where the project ignores it (Risk; AC-14 judgment). R-046 sets the role texts' words.
6. The start state lives in the job folder, which the job's account can write until stage 6 (Out of scope, R-048).
7. Review round 1, note 3 (not fixed, Decision 17): a reviewer's continuation whose worktree a prune removed gets it
   back from the candidate branch (`restoreParentWorktree`, `src/job/continuation.ts`), so when the candidate moved in
   the meantime the continuation's end fails with `HEAD moved` though the job wrote nothing. It fails closed
   (Decision 12); the coordinator starts a fresh review instead.
8. Review round 2, note 4 (not fixed, Decision 18): a write that `git status` does not list passes as `same`: a file
   marked `git update-index --skip-worktree` or `--assume-unchanged` before the change, or files under a folder made
   unreadable. The check compares what the worktree's status lists (A-081), as it does not see a write outside the
   worktree (Open point 6, Out of scope).
9. Review round 3, note 2 (D-092; the rounds of fixes spent): `parsedStatus` (`src/project/git.ts:354`) reads a source
   path only for a rename or copy in the index column; a rename in the work-tree column (an intent-to-add file) would
   parse its source as an entry of its own. For the read-only check it fails closed (an odd path in the difference, or
   an `unproven` start state); `dirtyPaths` behaved the same before G3. Not reproduced.
