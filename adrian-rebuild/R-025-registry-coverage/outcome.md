<!-- PL: Wynik R-025 (noc 22.11), zamknięty po trzech rundach recenzji (FAIL, PASS, PASS): każdy wpis rejestru deklaruje
`refuses`, kody wspólne są raz w `SHARED_CODES` w src/operation.ts, a test/registry.test.ts skanuje kod przez drzewo
składni (test/coverage.ts), czytając nazwę z jej najbliższej deklaracji, jak zasięgi języka: każdy kod odmowy jest
zadeklarowany i ma test `CODE: …`, test `CODE: …` polecenia `change` lub kodu wspólnego bierze migawkę co najmniej dwa
razy, każde polecenie ma test sukcesu `limen <polecenie>: …`; braki są trzema zapadkami (70 kodów, 35 testów, 29
poleceń), a miejsce błędu o klasie, której skan nie odczyta, stoi na dokładnej liście miejsc z powodem. Test
parametryczny uruchamia każde polecenie `read` na projekcie z zakończonym jobem, wymaga nazwanego zakończenia i
porównuje migawkę z folderem seatu; `status` i `show` są `change` do R-032. -->

# R-025 outcome

## Done

(a) Declarations (D-075). `Entry` (`src/registry.ts`) has a required `refuses`: the codes of class `refused` and
`usage` that the command's own path throws. Every one of the 47 entries is filled. Codes that one domain function
throws for many commands are named groups with that function in their comment (`IN_PROJECT` for `limenRoot`,
`JOB_WORD` and `OWN_JOB` for `resolveJob`, `GROUP_RUN` for `readRun`, `RECORDED_GROUP` for `jobMembership`,
`SELECTED_GROUP`, `MEMBER_SLOT`, `EXTENSIONS`, `GITHUB_SEAT`, `GITHUB_CLAIM`, `MAP_FOLDER`), joined by
`refusals(...)`, which sorts and keeps each code once. The shared codes are `SHARED_CODES` in `src/operation.ts`;
no entry repeats one. A command that runs another command's operation declares only its own codes: `github work`
and `github review` (spawn's), `keeper` and `group start` (spawn's), `group advance` (continue's).

(b) Scans, in `test/registry.test.ts`, over the files git knows; the readers are in a new helper module
`test/coverage.ts` (as `test/imports.ts` is for the import scans), read through the TypeScript syntax tree:
1. `thrownCodes` reads each call of `refused`, `usageError` and `environmentError` and each `new LimenError({…})`.
   A code comes from a literal or both branches of a conditional. A name means its innermost declaration around it,
   as the language's scopes resolve it (a function's parameters, the statements of a block, a function body or the
   file, a loop's or a `catch`'s variable): a parameter of a named function gives the arguments of each call of that
   function in the file (`bad` in `src/runtime/worker-extensions.ts`); a `const` with a string literal gives that
   literal; a `const` destructured from a call of the file's own function gives the literals that property has in
   that function (`const { code, problem } = problemOf(…)` in `src/job/reference.ts`); any other binding (a `let`, an
   import, a `const` of another value, a parameter of an unnamed function, a destructured parameter, a name declared
   nowhere) gives none. A `new LimenError` whose class and code are those of one other failure (`class:
   failure.class, code: failure.code`, a rewrap) makes no new code; one whose class is any other expression that is
   no literal gives its codes as `unknownClass`, one per site, which the real scan compares, as `<file> <code>` with
   repeats kept (`sitesOf`), with the exact list of sites `UNKNOWN_CLASS` (today one: `src/job/group-control.ts`
   `GROUP_PARTIAL_START`, with its reason); the factories' own bodies are read at their calls. A refusal, a usage
   error or a failure of an unknown class whose code none of these finds is listed as unreadable, and the test fails
   on it, so no failure passes unread. `declarationProblems` then names an undeclared refusal code, an entry's code
   that is no refusal or usage code of the code, a shared code made nowhere, a shared code an entry repeats, and a
   code declared twice. The real scan finds 0 problems and 0 unreadable sites over more than 100 codes.
2. `codesWithoutTest`: every declared code (entries and shared) has a test whose name starts with `CODE: `. The
   codes without one are `WITHOUT_CODE_TEST`; its comment names R-082.
3. `codeTestsWithoutSnapshot`: every `CODE: …` test of a code a `change` entry declares, or of a shared code, which
   every command, a change command too, can end with, compares the snapshots before and after (T-38's Check): it
   takes `snapshot` of `test/snapshot.ts` at least twice as written, itself or through the functions of its file
   (`testCases` counts each call of `snapshot` and, at each call of a function of the file, that function's count,
   so a function that takes it twice counts twice; a named function inside the test counts at its calls only). The
   scan knows a test's command only by its code, so a unit test of such a code counts as well. The tests that take it
   fewer than twice are `WITHOUT_SNAPSHOT`, R-082.
4. `commandsWithoutSuccessTest`: every registry command has a test named `limen <command words>: …` (D-076). The
   commands without one are `WITHOUT_SUCCESS_TEST`; its comment names R-083 and says a read command's is its golden
   test of the whole output.
Each reader has fixture tests in the same file that fail when its rule is broken (a literal, both branches, a
constant, a caller's argument, a factory body, an unreadable refusal; a code of a class that is no literal, a rewrap
of one failure, a class and a code of two failures, a class from a call; one site list entry per site, a repeat in
one file kept; a parameter named like a constant of its file, in a named and in an unnamed function; a property
destructured from a call of the file's own function, with a literal of that property outside the function left out
and a destructuring from a call of a function the file does not define unreadable; two functions with a local
constant of one name each; a local constant of no literal in a file that gives a `code` property literals, a `let`
and an import, each unreadable; each kind of declaration problem; a test that compares the snapshots itself, through
two helpers, through a function that takes it twice, and one that takes it once, once through a function of its own
body, none, or calls a snapshot it does not import; a change command's code, a shared code and a read command's
code; a longer code, a code named later in a name, a longer command, a name without the colon).

(c) `T-04: every read command of the registry, run on a project with a finished job, leaves the project and the seat
unchanged`: one plant, one job (`commit`) that ended `done`, with its branch and its transcript (`session/*.jsonl`)
asserted; each `read` command of the registry runs with the arguments of `READ_ARGUMENTS` (diff the token, ticket
check the job's branch, github ensure the root) and must leave `snapshot(p.root, ["../.limen"])` identical, which
digests the seat's folder beside the plant's root (LIMEN_HOME) for every read, seat queue and the GitHub reads
included. Each read must also end as named: `READ_REFUSALS` names the two that refuse on the plant, each with its
code and why (`github doctor`, `UNTYPED`: the stub of `id` gives the poller no uid, a failed check of the seat on
every machine; `github ensure`, `UNTYPED`: the project is bound to no GitHub repository), and every other read must
exit 0 with code `null`, so any other end, a usage error or a crash included, fails the test. The plant's account
has stubs of `id` (in no group with sudo) and `sudo` (exit 1) on its PATH, as `test/cli/github.test.ts` gives them,
so `github ensure` passes its privilege check on an account that is not root (under uid 0 `assertUnprivileged`
refuses before it runs `id`, as `UNPRIVILEGED`'s comment says). `READS_NOT_RUN` names `open` (Herdr, which a plant
does not run) and `picture serve` (it serves until stopped), each with its reason, and the test fails when an
exception names no read command it runs or names as not run. Ends on the plant: diff, stats, ticket check, seat
queue, rule and github status exit 0; github doctor and github ensure exit 1 with `UNTYPED`; none writes.

(d) Kinds (D-045 (6)): `status` and `show` are `change`, each with a comment naming R-032; `rule` stays `read`
(D-075). A test, `D-045: status and show, which reap dead jobs, are change commands, and rule, which only lists, is a
read command`, holds the three; the comment above it names R-032, so the name holds one identifier (T-29 (2)).
`status` and `show` join `OUTSIDE_RUNNER`, T-38's ratchet in `test/structure.test.ts`, whose comment says they leave
it with R-032.

(e) `knownFilesBelow(repo, folders)` in `test/known-files.ts`. In `test/structure.test.ts` `filesBelow` and `sources`
are gone; `filesIn` and `knownSources` read through `knownFilesBelow` (D-010, the dynamic-import scan, T-02, T-26 (4),
`SWALLOWED`, `UNTYPED_THROWS`, and the scans that used `knownSources` already). The `readdirSync` of `src/commands`
and `src/` in `test/registry.test.ts` read through it too. New test: `the walks of the scans read no file git
ignores, such as an editor's swap file in a scanned folder`.

(f) `test/cli/github.test.ts` and `test/cli/continue.test.ts` open with one line each; the latter names its
transcript-mode test ("the transcript it copies with the same mode").

Renamed rather than listed: 17 tests that already prove a command's success now start with `limen <command>: `:
spawn (`test/s1-spawn.test.ts`), continue, init, migrate, status, ticket done, picture build, sweep, keeper, group
wait, group status, group start, github resolve, github work (`test/cli/`), land (`test/s5-land.test.ts`), watch
(`test/s3-finish-wake.test.ts`), ticket new (`test/outcome.test.ts`); group start and ticket new since review round
2. `IRREVERSIBLE` follows migrate's new title. No test was renamed to `CODE: …`: the six codes that tests assert
without that prefix (`TICKET_NOT_AT_BASE`, `SPAWN_LEAD_ROLE`, `BAD_EXTENSION` in spawn's refusal table,
`GROUP_LEAD_HOOK` in a group's whole run, `EXTENSION_GONE` in the group extensions test, `JOB_NOT_FINISHED` in a
parser `--help` test) are asserted inside tests of several mechanisms or of another one, so one code as the name
would misname them (T-29 (2), (3)); they stay listed for R-082 to split.

Review round 1 (`review.md` → Round 1, fixes 1–4; `ticket.md` → `## Decisions`), all in `test/coverage.ts` and
`test/registry.test.ts`:
1. Finding 1: scan (b)3 reads the shared codes beside the `change` entries' own (`codeTestsWithoutSnapshot(entries,
   shared, cases)`), so it now finds 27 more `CODE:` tests that compare no snapshot, the four of the finding among
   them (`BAD_ARGUMENT` of `continue`, of `group start` and of `spawn` in `test/outcome.test.ts`, and `UNTYPED` of
   `land`); they join `WITHOUT_SNAPSHOT`. Its fixture case names a shared code's test and leaves a read command's
   code alone; the list's comment and Deviation 3 say what the scan reads.
2. Finding 2: `thrownCodes` no longer skips a `new LimenError` whose class is no literal; only a rewrap of one
   failure makes no code, and every other such site gives its codes as `unknownClass`, which the real scan compares
   with `UNKNOWN_CLASS` (`GROUP_PARTIAL_START`, its class that of the team's failed start after `stepFailure`). The
   fixture case of `KEPT_CLASS` became its own test.
3. Finding 3: `codesOf` resolves a name to a parameter of a function around it before a constant of the file, with a
   fixture case of a parameter named like a constant.
4. Finding 4: the T-04 test names each read's end on the plant (`READ_REFUSALS`), as in (c) above.

Review round 2 (`review.md` → Round 2, fixes 1, 2, 3, A1, A2 and A3; `ticket.md` → `## Decisions`), in
`test/coverage.ts`, `test/registry.test.ts`, `test/outcome.test.ts` and `test/cli/group.test.ts`:
1. Fix 1: `ticket new returns the number of the ticket it wrote in ids.ticket` is `limen ticket new: returns the
   number of the ticket it wrote in ids.ticket`, and the first of the two run-again tests of `test/cli/group.test.ts`
   is `limen group start: run again on a run that has a team with no job, it starts that team and leaves the started
   one alone`, as `limen github work: run again …` is; `ticket new` and `group start` left `WITHOUT_SUCCESS_TEST`.
   Neither combines mechanisms (T-29 (3)): the first checks one success (the folder it wrote and the number in
   `ids.ticket`), the second one rerun of the start (the team with no job gets one, the started team keeps its own),
   so no test stays listed for that reason. Of the two run-again tests the first was taken, the plainer case; the
   second (a team's job that never ran gets a new one) keeps its name.
2. Fix 2: a name in a code position is read from its innermost declaration (`bindingOf`, `declaredIn`), as in (b)1
   above; the file-wide map of string constants (the last one won) and the fallback to every literal the file gives a
   property of the name's text are gone. Three fixture tests: two functions with a local constant `code` each read
   their own; a local `code` of no literal (in a file that gives a `code` property a literal), a `let` and an import
   are unreadable; a destructured `code` reads only the literals of `code` in the function it is taken from (a
   `{ code: … }` outside it is left out) and is unreadable from a call of a function the file does not define. The
   comment of `thrownCodes` says what it reads. The real scan still finds 0 problems and 0 unreadable sites.
3. Fix 3: a test compares the snapshots when it takes the snapshot at least twice (`Case.snapshots`, a count, in
   place of a yes or no). No test leaves the held set by this: no test of the suite takes the snapshot exactly once
   (a probe of the real cases in the T-38 test, removed after one run, printed every case with a count of 1, of which
   there were none, and every `CODE:` case with a count above 0: 41 tests, each with 2), so `WITHOUT_SNAPSHOT` keeps
   its 35 tests.
4. Fix A1: the D-045 test's name holds one identifier, as in (d) above.
5. Fix A2: `UNKNOWN_CLASS` lists sites, as in (b)1 above: one entry per site with its file, code and reason,
   compared both ways with the sites the scan finds, repeats kept, the line left out so that a line moving above a
   site does not change the list. A fixture test: two sites of one listed code in one file and one in another give
   three entries.
6. Fix A3: the comment of `UNPRIVILEGED` says the stubs hold for an account that is not root, as in (c) above.

## Ratchet lists (AC-8)

Each is an exact set, compared both ways with `assert.deepEqual` of the sorted list and the sorted finding.
- `WITHOUT_CODE_TEST`: 70 codes (of 102 codes the entries declare and 8 shared codes; 32 entry codes and all 8 shared
  codes have a `CODE:` test). Unchanged in rounds 1 and 2.
- `WITHOUT_SNAPSHOT`: 35 tests (8 before round 1, and 27 that its fix 1 finds; unchanged in round 2, whose fix 3
  holds no test that takes the snapshot once). The 8: 2 of `group wait`'s
  `GROUP_WAIT_MEMBERS_ONLY`, 6 of the resolver's codes. The 27, all of shared codes: `BAD_ARGUMENT` 7 (`continue`,
  `group start`, `limen <group>` alone, `spawn`, and 3 parser tests), `REMOVED` 10 (9 in `test/cli/old-names.test.ts`,
  1 parser test), `LOCK_TIMEOUT` 3 (`ticket new`, 2 lock tests), `STATE_CHANGED` 3, `REFUSED_AFTER_VALIDATE` 1 and
  `STEP_FAILED` 1 (runner tests), `UNKNOWN_COMMAND` 1, `UNTYPED` 1.
- `WITHOUT_SUCCESS_TEST`: 29 commands (18 of the 47 have one: stats, and the 17 renamed tests). 31 in round 1;
  `ticket new` and `group start` left it in round 2 (fix 1).
- `UNKNOWN_CLASS` (new in round 1, an exact list, not a ratchet): 1 site, `src/job/group-control.ts`
  `GROUP_PARTIAL_START`; a list of codes in round 1, a list of sites since round 2 (fix A2).
- `READ_REFUSALS` (new in round 1, exact): 2 reads, `github doctor` and `github ensure`; `READS_NOT_RUN`: 2.
- `OUTSIDE_RUNNER` (T-38, not this ticket's list): 18 → 20, with `status` and `show`.

## Entries with an empty `refuses` (AC-9)

- `init`, `workspace init`: their refusals are untyped `Error`s (UNTYPED, shared) until R-082; `init` reads the root
  only after `isGitRepository`, so `NOT_A_PROJECT` cannot arise.
- `seat queue`: it reads the seat's queue files and throws no typed refusal.
- `rule`, `rule set`, `rule end`, `rule timer`: untyped refusals only, until R-034 cuts them.

The other entries' codes were traced from each handler through the domain functions it calls (validate paths for
the runner's commands; a refusal inside an `apply` becomes `REFUSED_AFTER_VALIDATE`, a shared code). Notes the
comments in the registry carry: `steer`, `land` and `keeper` refuse a group member before they resolve a job, so
`GROUP_CONTEXT` and `JOB_OTHER_TEAM` do not reach them; `status`, `show` and `sweep` reap, and finalizing a dead job
reads its group (`RECORDED_GROUP`); `land`'s ticket close prints its failure and does not refuse;
`github doctor` reports a bad origin as a failed check; `github poll` ends with the worst project's class and code.

## Proof

After review round 2:
- `node --test test/registry.test.ts` → exit 0, 31 tests, 31 pass (28 after round 1, and the three new fixture tests
  of fixes 2 and A2; the test reader's fixture of fix 3 replaces the one before it).
- `node --test test/structure.test.ts test/cli/continue.test.ts test/outcome.test.ts test/cli/group.test.ts` → exit
  0, 117 tests, 117 pass (the first two not changed in the round; the last two hold the renamed tests of fix 1).
- `node adrian-rebuild/tools/gate.mjs` → exit 0: `tsc`, Biome on 251 files, then 710 tests, 710 pass, 0 fail (three
  more than after round 1). It ran three times after the last code change, each 710/710; the third without a pipe,
  for the exit code.
- `npx tsc --noEmit` → exit 0; `npx biome check --error-on-warnings test/coverage.ts test/registry.test.ts
  test/outcome.test.ts test/cli/group.test.ts` → exit 0 (4 files).
- `node adrian-rebuild/tools/check.mjs` → exit 0 ("0 errors"); `npx biome check --error-on-warnings adrian-rebuild`
  → exit 0.

Review round 2, the implementer's runs before each fix of a mechanism, in this order (each on the tree as round 1
left it with the fixes above it done and only this fix's test changed; at `HEAD` `test/registry.test.ts` fails to
load, as in run 1 under `## Fails before`, so `fails-before.mjs` cannot tell these apart):
- Fix 1: `ticket new` and `group start` taken off `WITHOUT_SUCCESS_TEST`, the tests not yet renamed; `node --test
  --test-name-pattern='^T-28: every registry command' test/registry.test.ts` → 1 test, 1 fail: the actual list holds
  `'group start'` and `'ticket new'`, the expected one does not.
- Fix A2: first a refactor with no change in behaviour (`sitesOf` returned each code once, as the test's own
  expression had), then the fixture test; `node --test --test-name-pattern='^the unknown-class list|^T-28 \(1\): every
  refusal' test/registry.test.ts` → 2 tests, 1 pass, 1 fail: the fixture's actual `[ 'LISTED' ]`, expected `[
  'src/a.ts LISTED', 'src/a.ts LISTED', 'src/b.ts LISTED' ]`.
- Fix 2: `node --test --test-name-pattern='^the code scan' test/registry.test.ts` → 6 tests, 3 pass, 3 fail, each on
  the reading the fix removes:
  - the destructuring test: actual `thrown` also `'src/b.ts:4 ELSEWHERE true'` and the line-5 site read as `FIRST`,
    `SECOND` and `ELSEWHERE`, `unreadable: []`; expected only `FIRST` and `SECOND` at line 4 and `unreadable: [
    'src/b.ts:5: refused(code, "a")' ]`;
  - the local constants test: actual `[ 'src/e.ts:1 SECOND_LOCAL', 'src/e.ts:2 SECOND_LOCAL' ]`, expected `[
    'src/e.ts:1 FIRST_LOCAL', 'src/e.ts:2 SECOND_LOCAL' ]`;
  - the unreadable-binding test (run once more alone after its fixture was split into two files): actual `thrown` of
    `src/f.ts:2` `A_PROPERTY` (the local of no literal read through a property elsewhere), `src/g.ts:2`
    `NOT_CONSTANT` (a `let` read as a constant) and `src/g.ts:4` `A_PROPERTY` (an import read through a property),
    `unreadable: []`; expected no code and the three sites unreadable.
- Fix 3: `node --test --test-name-pattern='^the test reader holds' test/registry.test.ts` → 1 test, 1 fail: actual
  `[ 'test/a.test.ts: C_CODE: ${kind} takes none', 'test/b.test.ts: D_CODE: calls a snapshot its file does not
  import' ]`; expected also `'test/a.test.ts: F_CODE: takes the snapshot once'` and `'test/a.test.ts: G_CODE: takes it
  once through a function of its own body'`.
- Fixes A1 and A3 change a test's name and a comment, no mechanism, so they have no failing run.
After each fix its runs passed; then the whole file passed, 31/31.

After review round 1:
- `node --test test/registry.test.ts` → exit 0, 28 tests, 28 pass (26 before the round, and the two new fixture
  tests of fixes 2 and 3).
- `node --test test/structure.test.ts` → exit 0, 42 tests, 42 pass (not changed in the round).
- `node --test test/cli/continue.test.ts` → exit 0, 12 tests, 12 pass (not changed in the round).
- `node adrian-rebuild/tools/gate.mjs` → exit 0: `tsc`, Biome on 251 files, then 707 tests, 707 pass, 0 fail (two more
  than before the round: the fixture tests of fixes 2 and 3). It ran three times after the last code change, with
  no failure in any: the first and third printed 707/707; the second's output was cut by a filter of mine before its
  summary.
- `npx tsc --noEmit` → exit 0; `npx biome check --error-on-warnings test/coverage.ts test/registry.test.ts` → exit 0.
- `node adrian-rebuild/tools/check.mjs` → exit 0 ("0 errors"); `npx biome check --error-on-warnings adrian-rebuild`
  → exit 0 (32 files).

Before review round 1:
- `node --test test/registry.test.ts` → exit 0, 26 tests, 26 pass.
- `node --test test/structure.test.ts` → exit 0, 42 tests, 42 pass.
- `node --test test/cli/continue.test.ts` → exit 0, 12 tests, 12 pass.
- `node --test test/snapshot.test.ts` → exit 0, 11 tests, 11 pass.
- `node --test test/cli/github.test.ts` → exit 1 outside the gate on this laptop, 17 tests, 9 pass, 8 fail: the eight
  `github poll` tests, each `unsafe owner or permissions on /tmp` (`GITHUB_CONFIG`, exit 4): the poller refuses a
  state folder in the shared `/tmp`, which only the gate's private `TMPDIR` (gate-env.mjs) avoids. Not a finding of
  D-029 (D-034: a run outside `gate.mjs` on this laptop is no evidence); in the gate every test of the file passes.
  This change touches only one test's name and the header there.
- `node adrian-rebuild/tools/gate.mjs` → exit 0: `tsc`, Biome on 251 files, then 705 tests, 705 pass, 0 fail
  (two runs, the second after the last change; R-024's gate had 690).
- `npx tsc --noEmit` → exit 0; `npx biome check --error-on-warnings` on every changed file → exit 0.
- `node adrian-rebuild/tools/check.mjs` → exit 0 ("0 errors").

## Fails before

AC-5, the main session: `node adrian-rebuild/tools/fails-before.mjs` (`HEAD` `24f37a6`) → exit 0, run three times:
after the first implementer's run (16 files), after the first round of fixes (the same 16 files, the same tail) and
after the second round of fixes, whose output is below (17 files: `test/outcome.test.ts` joined with its renamed
test). As printed (the first line, then the tail of the run at `HEAD`; stack frames and the `generatedMessage` and
`diff` lines left out):

```
fails-before: test/cli/continue.test.ts, test/cli/github.test.ts, test/cli/group.test.ts, test/cli/init.test.ts, test/cli/keeper.test.ts, test/cli/migrate.test.ts, test/cli/picture.test.ts, test/cli/status.test.ts, test/cli/sweep.test.ts, test/cli/ticket.test.ts, test/outcome.test.ts, test/registry.test.ts, test/s1-spawn.test.ts, test/s3-finish-wake.test.ts, test/s5-land.test.ts, test/snapshot.test.ts, test/structure.test.ts fail at HEAD (exit 1)
      'ticket new',
      'unwatch',
      'watch',
      'workspace init'
      at TestContext.<anonymous> (file:///tmp/fails-before-FyoS34/test/structure.test.ts:200:9)
    code: 'ERR_ASSERTION',
    actual: [
      'board',          'github connect',
      'github deliver', 'github disconnect',
      'github poll',    'github resolve',
      'group advance',  'group close',
      'group publish',  'group status',
      'init',           'land',
      'migrate',        'steer',
      'ticket new',     'unwatch',
      'watch',          'workspace init'
    ],
    expected: [
      'board',          'github connect',
      'github deliver', 'github disconnect',
      'github poll',    'github resolve',
      'group advance',  'group close',
      'group publish',  'group status',
      'init',           'land',
      'migrate',        'show',
      'status',         'steer',
      'ticket new',     'unwatch',
      'watch',          'workspace init'
    ],
    operator: 'deepStrictEqual',
```

The files run together at `HEAD`, so the run fails as a whole; the files whose only change is a renamed test or a
header pass there alone. The main session's gate after each run: `node adrian-rebuild/tools/gate.mjs` → exit 0,
fail 0, with 705 tests after the first implementer's run, 707 after the first round of fixes and 710 after the
second.

The implementer's runs:
1. `node --test test/registry.test.ts` with the new tests and the source at HEAD → exit 1, the file fails to load:
   `SyntaxError: The requested module '../src/operation.ts' does not provide an export named 'SHARED_CODES'`.
2. The same with only `SHARED_CODES` added (no `refuses`, `status` and `show` still `read`) → 26 tests, 22 pass,
   4 fail: `D-045: …` (`status: 'read'`, `show: 'read'` against `'change'`); `T-28 (1): every refusal and usage
   code …` (`TypeError: Cannot read properties of undefined (reading 'entries')`, no entry has `refuses`); `T-28:
   every registry command has a success test …` (46 commands, against an empty list); `T-04: …` (`show exited 2:
   limen show: missing <job>`, since `show` was a read without arguments).
3. `node --test --test-name-pattern='the walks of the scans' test/structure.test.ts` with the old `readdir` walk
   (given a repository) → exit 1: the walk listed `seat/.tool.ts.swp` and `src/.a.ts.swp` beside `seat/tool.ts` and
   `src/a.ts`. Since the walk lives in the test file, `fails-before.mjs` copies the new walk over HEAD and this test
   passes there; the failing walk is the old one above.
At HEAD `fails-before.mjs` fails `test/registry.test.ts` as in run 1 and the T-38 ratchet of
`test/structure.test.ts` (it lists `status` and `show`, which are `read` at HEAD).

Review round 1, the implementer's runs on the working tree as the first implementer's run left it (at HEAD
`test/registry.test.ts` fails to load as in run 1, so `fails-before.mjs` cannot tell these apart):
4. First a refactor with no change in behaviour: `codeTestsWithoutSnapshot` takes the entries and the shared codes
   and still reads only the `change` entries' codes. Then `node --test test/registry.test.ts` with the round's tests
   and the scan before its fixes → exit 1, 28 tests, 24 pass, 4 fail, each for its finding:
   - `the snapshot reader names each CODE test of a change command's own or a shared code that compares no
     snapshot, and no other` (fix 1): actual `['test/a.test.ts: B_CODE: refuses and compares nothing']`; expected
     also `"test/a.test.ts: S_CODE: a shared code's refusal compares nothing"`.
   - `the code scan names each code of a LimenError whose class is no literal, and only a rewrap of one failure makes
     none` (fix 2): actual `{ thrown: [], unknownClass: undefined, unreadable: [] }`; expected `unknownClass:
     ['src/d.ts:1 MADE_HERE', 'src/d.ts:4 PICKED']` and `unreadable` naming the site of line 3 (`class:
     failure.class, code: other.code`).
   - `the code scan reads a parameter named like a constant of its file from the function's callers, as the
     language's scopes do` (fix 3): actual `['src/c.ts:2 FILE_WIDE', 'src/c.ts:4 FILE_WIDE', 'src/c.ts:5
     FILE_WIDE']`, `unreadable: []`; expected `['src/c.ts:2 PASSED_IN', 'src/c.ts:4 FILE_WIDE']` and `unreadable:
     ['src/c.ts:5: refused(code, "c")']`.
   - `T-28 (1): every refusal and usage code of src/ and hook/ is declared …` (fix 2, the real scan): actual
     `unknownClass: []`; expected `unknownClass: [ 'GROUP_PARTIAL_START' ]`.
   After the fixes, the real T-38 scan failed as expected, naming the 27 tests that now join `WITHOUT_SNAPSHOT`.
5. Fix 4, a probe of two runs, each undone at once with the Edit tool (no probe line is left; the repository's
   allow-list has no command to copy the tree, and writes to the OS temporary directory were denied): the plant of
   `finishedProject` got a damaged `.limen/github/binding.json` (`{`), on which `readBinding` throws a `SyntaxError`,
   an `INTERNAL` crash (exit 5) that writes nothing.
   - With the new check, `node --test --test-name-pattern='^T-04' test/registry.test.ts` → exit 1, 1 test, 1 fail:
     `github status exited 5, not as a success: … {"class":"internal","code":"INTERNAL","next":null}` and `github
     doctor exited 5, not as UNTYPED: …` (my filter of the output cut it after those lines; `github ensure`, past
     its privilege check, reads the same file).
   - With the check before the round in its place (`run.status === 2`), the same command → exit 0, 1 test, 1 pass:
     the crashes passed, as finding 4 says.

## Deviations

1. `SHARED_CODES` holds D-075's five codes and three more: `UNKNOWN_COMMAND` (the dispatcher's, for a word that is no
   command, before any entry), `REMOVED` (an old command, flag, engine or role, `src/old-names.ts`) and `UNTYPED`
   (the plain `Error` of the author's refusals, until R-082). Scan 1 requires every refusal and usage code to be
   declared by an entry or by the shared list; these three come from the path every command line takes, as
   `BAD_ARGUMENT` does, and no entry's own path owns `UNKNOWN_COMMAND` or the `REMOVED` of a removed command.
   Review round 1, finding 5: a night default (category A (b), D-054 (2)), for Adrian to confirm in the morning.
2. `BRANCH_EXISTS` is declared by `github review`: spawn's operation throws it only for the review's pinned branch
   (`branchAt`), which only `github review` gives.
3. Corrected in review round 1 (finding 1). Scan 3 reads the codes the `change` entries declare and the shared codes,
   since every command, a change command too, can end with a shared one; before the round it left the shared codes
   out, on the wrong reason that their own tests prove them without a command, so the `CODE:` tests of change
   commands on a shared code that compare no snapshot were neither scanned nor listed. The scan knows a test's
   command only by its code, as for the entries' codes before (the resolver's tests of `test/job/reference.test.ts`),
   so unit tests of a shared code (the parser's, the lock's, the runner's) are on `WITHOUT_SNAPSHOT` too.
4. The read test compares the seat's folder for every read, not only for seat queue and the GitHub reads. Since
   review round 1 (finding 4) it fails any end of a read other than the one it names (exit 0, or the code of
   `READ_REFUSALS`), not only exit 2. For it `test/snapshot.ts`'s comment says `also` may name the seat's folder
   beside the root, and `test/snapshot.test.ts` has one more test that a file there changes the snapshot.
5. `status` and `show` are added to `OUTSIDE_RUNNER`: the kind change puts them under T-38's ratchet. Review round 1,
   finding 6: no change (D-045 (6.2), D-075; R-032 takes them off the list).
6. Review round 1, fix 4: the read test's plant has stubs of `id` and `sudo` on its PATH, the account in no group
   with sudo and with no sudo, as `coordinatorWithClaim` of `test/cli/github.test.ts` gives them. Without them
   `github ensure` ends by the machine's account: `GITHUB_PRIVILEGED` on this laptop's, `UNTYPED` on an account with
   no sudo, so no expected end could be named. A technical choice inside fix 4 (D-054 (2), category A (b)).
7. Review round 1, fix 3: a name that is a parameter of an unnamed function (an arrow passed to a call) hides a
   constant of its name too. Since review round 2 (fix 2) its code comes from nowhere else: it is unreadable, since
   the scan cannot find such a function's callers (in round 1 it fell back to the literals the file gives a property
   of its name). The real scan still finds 0 problems and 0 unreadable sites.
8. Review round 1: the T-38 scan's test is renamed to `T-38: every CODE test of a change command's own or a shared
   code compares the shared snapshot, except the listed ones, and no listed one does`, so its name says what it
   reads.
9. Review round 2, fix 2, technical choices inside the fix (D-054 (2), category A (b)): the name's innermost
   declaration is looked up in a function's parameters, the statements of a block, a function body, a `case` block
   and the file, and a `for` and a `catch` variable, so a `let`, an import, a function, a class or an enum of the name
   hides an outer constant as the language does; a destructured name with a default value (`{ code = "…" }`) or taken
   by `...` is unreadable; a property is read from the one function of the file with the callee's name, and is
   unreadable when the file has none or several. The fixture of unreadable bindings has, beside the ticket's case (a
   local of no literal in a file that gives `code` property literals), a `let` and an import, the two other bindings
   the round-1 scan read as a constant or through a property.
10. Review round 2, fix 3: a named function inside a test (`const take = () => snapshot(root)`) counts at its calls
   only, so its body does not count once more where it is written; a call inside a loop counts once and a recursive
   call adds none, since the count is of calls as written. A fixture case holds the first rule.
11. Review round 2, fix A2: a site of `UNKNOWN_CLASS` is its file and code without its line, so the list changes when a
   site is added or removed, not when a line above it moves.

## Unmeasured

None: the change is the registry and the tests; no metric of `plan.md` → `## Measurement` reads it.

## Open points

- AC-3 runs `node --test test/cli/github.test.ts` outside the gate, where the eight `github poll` tests fail on
  `/tmp` as above, at HEAD as well; the file passes inside `gate.mjs`.
- The success ratchet counts a test by its name only; whether a read command's test is its golden test of the whole
  output is the reviewer's question (D-076). None of the 17 renamed tests is of a read command.
- Three of the renamed tests combine mechanisms (T-29 (3)) and are R-083's to split: `limen github resolve: …`,
  `limen land: …` (review round 1) and `limen watch: …`, which also proves watch's refusal without a session and
  unwatch's success (review round 3, note 2; `test/s3-finish-wake.test.ts`).
- Two refusal proofs of `continue` that compare the snapshot (`test/cli/continue.test.ts`, code `REMOVED`) lack the
  `REMOVED:` prefix of T-29 (2); they are on no ratchet list, since `REMOVED` has `CODE:` tests elsewhere, so they are
  R-083's to rename (review round 3, note 3).
- Since review round 1, `WITHOUT_SNAPSHOT` holds unit tests that run no command on a project (the parser's, the
  lock's and the runner's in `test/parser.test.ts`, `test/lock.test.ts` and `test/operation.test.ts`, beside the
  resolver's before), because the scan knows a test's command only by its code. R-082, which brings the list to
  zero, has no project to snapshot in them: it can give them one, or prove each code by a command's refusal test that
  compares the snapshot and name the unit test without the code. Review round 2 left this open for gate 5.2 and
  R-082 (`review.md` → Round 2): whether scan (b)3 holds a test by the command it runs rather than by its code.
- The snapshot count of fix 3 is of calls as written (Deviation 10): a test that takes the snapshot twice and compares
  neither with the other, or calls a function that takes it twice in a branch never run, still counts as comparing.
  The scan does not read whether the two are compared with each other; the review of each refusal test does.
- `SHARED_CODES` with `UNKNOWN_COMMAND`, `REMOVED` and `UNTYPED` (Deviation 1) is a night default for Adrian to
  confirm in the morning (review round 1, finding 5).
