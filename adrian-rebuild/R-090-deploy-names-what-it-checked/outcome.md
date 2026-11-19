<!-- PL: Wynik ticketu R-090: `seat/deploy.ts` wypisuje na stdout, przed każdą inną linią,
listę sprawdzonych rejestrów i ich linii (projekt z liczbą działających zadań, „not a project”, „skipped”), także przy
odmowie i każdym późniejszym błędzie, a rejestry bez żadnego projektu odmawiają z kodem 4 przed fetchem. Pięć nowych
testów w `test/seat/deploy.test.ts`; cztery padały przed zmianą, test nieczytelnego rejestru przechodził (strażnik
D-045 (4)). Z decyzji Adriana test unikalności nazw w `test/structure.test.ts` liczy tylko pliki znane gitowi, więc
ignorowane `adrian-rebuild/input/vendor/` go nie psuje; nowy test na fixturze padał przed zmianą. Runda poprawek po
recenzji (PASS z uwagami): test pętli dowiązań ELOOP, rozdzielony test odmowy i listy, lista gita bez plików usuniętych
z drzewa. Bramka 253/253. Stan: zamknięty commitem R-090 (19.11), recenzja PASS w rundach 1 i 2. -->

# Outcome: R-090 The deployment script names what it checked; a registry without a project refuses

Draft by the implementer. The first run ended `BLOCKED` on the basename test of `test/structure.test.ts`, and Adrian's
decision of 2026-11-19 (`ticket.md` → `## Decisions`) added item 4 below. Review round 1 passed with four notes; the
three fixes are in the next section. The gate passes.

## Review round 1 fixes

The three fixes of `ticket.md` → `## Decisions` ("review round 1"). Finding 2 is rejected there, so deviation 3 stands.
The test numbers in `## Done` are those of the first run. In the file, the split-off test follows test 16, and the
ELOOP test is the last.

1. Finding 1 (T-02), test only. The failure path of `rootKind` came in with the first run: a `stat` of
   `<root>/.limen` that fails with anything but `ENOENT` or `ENOTDIR` exits 4 and names `<root>/.limen`. No code
   changed in this round. New test "a registered root whose .limen cannot be read refuses the deployment with exit 4
   before the fetch, naming it":
   - The fixture's registry lists the project and `<tmp>/loop`, where `loop/.limen` is a symlink to `.limen`, which
     fails every `stat` with `ELOOP`, for root too.
   - Result: exit 4; HEAD `older`, no tag and `origin/adrian-rebuild` `older`; stderr contains `cannot read
     <tmp>/loop/.limen: ELOOP`.
2. Finding 3 (T-29 (3)), a split. "a registry that holds no project refuses the deployment with exit 4 before the
   fetch, naming the registry" keeps only the refusal's assertions: exit 4, HEAD, the tags, the fetch, and the registry
   on stderr. The new test "a refusal for no project also prints the list" runs the same three registries
   (`NO_PROJECT`) and asserts exit 4 and the exact list on stdout. A split cannot fail before the fix: both tests
   assert what the first run's single test asserted, and the code did not change. The decision says no fail-before is
   needed.
3. Finding 4, `test/structure.test.ts`. `knownFiles` now drops a listed path that does not exist in the working tree
   (`existsSync`). So an index entry whose file is gone, as a plain `mv` leaves one, no longer counts.
   - New test, written first: "a tracked TypeScript file deleted from the working tree and an untracked one of the same
     basename count once". In the fixture repository, `old/name.ts` is added to the index and then renamed to
     `new/name.ts` with `rename`, as `mv` does. Result: `typeScriptNames` gives exactly one `name.ts`.
   - A helper `fixtureRepo(t, files)` makes the temporary git repository for both fixture tests of the file. It
     replaces the inline setup of the earlier fixture test, which keeps its files and assertion.

### Fails before (round 1)

- Fix 3: `node --test test/structure.test.ts` with the new test and the unchanged `knownFiles` gave exit 1; tests
  10, pass 9, fail 1:
  ```
  ✖ a tracked TypeScript file deleted from the working tree and an untracked one of the same basename count once
    + actual - expected
      [
        'name.ts',
    +   'name.ts'
      ]
  ```
  After the fix: exit 0, tests 10, pass 10. As in the first run, `fails-before.mjs` cannot show this file failing,
  because it copies the changed test file, with its listing, over `HEAD`.
- Fix 1: on the first run's code the test passes, because the code path already exists. At `HEAD` it fails. In
  `node adrian-rebuild/tools/fails-before.mjs` (exit 0, "test/seat/deploy.test.ts, test/structure.test.ts fail at HEAD
  (exit 1)"), its tail shows the test as the file's last failure. At `HEAD` the deployment also exits 4 before the
  fetch, but it names the jobs folder that `jobFolders` could not read, not `.limen`:
  ```
  ✖ a registered root whose .limen cannot be read refuses the deployment with exit 4 before the fetch, naming it
    AssertionError [ERR_ASSERTION]: cannot read <tmp>/loop/.limen/jobs: ELOOP: too many symbolic links encountered,
    scandir '<tmp>/loop/.limen/jobs'
    next: make <tmp>/loop/.limen/jobs readable for root, then run node <tmp>/repo/seat/deploy.ts b525576…
  ```
- Fix 2: no fail-before, because it is a split (above). Both tests fail at `HEAD`, where an empty registry deploys.

### Proof (round 1)

From the repository root, Node 26.13.1, git 2.34.1:
- `node --test test/seat/deploy.test.ts`: exit 0; tests 21, pass 21, fail 0.
- `node --test test/structure.test.ts`: exit 0; tests 10, pass 10, fail 0.
- `npx tsc --noEmit`: exit 0. `npx biome check --error-on-warnings` on both test files, after `biome format --write`:
  exit 0, "No fixes applied."
- `node adrian-rebuild/tools/fails-before.mjs`: exit 0 (above).
- `node adrian-rebuild/tools/gate.mjs`: exit 0. `biome check --error-on-warnings .`: "Checked 163 files … No fixes
  applied." Tests 253, pass 253, fail 0, cancelled 0, skipped 0 (87.2 s).
- `node adrian-rebuild/tools/check.mjs`, after this section was written: exit 0, "0 errors" (112 PL summaries, 16 ticket
  folders, 15 `changes.md` entries). `npx biome check --error-on-warnings adrian-rebuild`: exit 0, "Checked 28 files …
  No fixes applied."

## Done

Item 1, `seat/deploy.ts`:
- The registry discovery `registries(passwd, retry)` (it was `registeredRoots`) returns one `Registry` per registry it
  read: `{ path, lines }`, where each line is `{ root, kind }` and `kind` is `project`, `not a project` or `skipped`.
  - `registryLines` takes the distinct non-empty lines of the registry (split on `\r?\n`, as before). A line that is
    not an absolute path is `skipped`.
  - `rootKind` gives an absolute line its kind: `project` when `stat(<root>/.limen)` is a folder, `not a project` when
    it is not a folder or when `stat` fails with `ENOENT` or `ENOTDIR` (the root or `.limen` does not exist). Any other
    error exits 4 through `unreadable`, naming `<root>/.limen`.
  - Zero registries, and a registry that cannot be read, exit 4 as before (`requiredText`, `optionalText`).
- `runningByProject` runs the unchanged running-job test (`runningJobs`: `liveJob`, `startingJob`) once for each
  distinct project root, in the order of the registries. Roots that are not projects are no longer read.
- `checkedList` builds the list: per registry, `checked registry <path>: <n> projects`, then per line, indented by two
  spaces, `<root>: <n> running jobs`, `<root>: not a project (no .limen/)` or `<root>: skipped (not an absolute
  path)`. Every path and every root passes through `printable(…, "escape")`, as the parts of a running-job line do.
- `deploy(input, checked)` reads the registries, counts the running jobs, puts the list into `checked`, and then runs
  `refuseNoProject` and `refuseRunningJobs`, both before the fetch.
- `refuseNoProject` (new): when no registry line is a `project`, exit 4. The message is `no registered project: no
  root in <path>[, <path>…] holds .limen/, so the running jobs cannot be checked`. The `next` is `check that the
  agents' account's ~/.limen/projects lists its project roots and that each holds .limen/, then run node
  <repo>/seat/deploy.ts <sha>`.
- `refuseRunningJobs` now takes the running jobs and is synchronous. Its text is unchanged.
- `outcomeOf` puts the list at the start of stdout on success (`<list>`, `deployed …`, `next: /reload …`) and on every
  failure after the check: exit 1, 3, 4 and the internal error 5. On a failure the refusal stays on stderr. A failure
  before the list exists (usage, the password file, the registries, a project's folders) prints nothing on stdout.
- The file's header comment names the list (D-045, D-046). The comment in `jobFolders` now says why a project can lack
  `.limen/jobs/`.

A successful run in the fixture prints:
```
checked registry <tmp>/agents/.limen/projects: 1 project
  <tmp>/project: 0 running jobs
  <tmp>/tools: not a project (no .limen/)
deployed <newer> in <tmp>/repo (previous <older>), tag deployed-2026-11-19-063000
next: /reload every coordinator session (adrian-rebuild/plan.md, ## Deployment, step 0.3)
```

Item 2, `test/seat/deploy.test.ts`. The tests were written first, and tests 1–14 are unchanged. The fixture now creates
the `tools` folder, so its second registry line is "a folder with no `.limen/`", as the ticket's first test says;
before, the folder did not exist. Both cases are `not a project`. `Fixture` gains `registry` and `tools`. New tests
15–19:
15. "a deployment prints each registry and each project it checked before the deployed line": exit 0. The first three
    stdout lines are the list (the project with 0 running jobs, `tools` as not a project), and the fourth starts with
    `deployed <newer> `.
16. "a registry that holds no project refuses the deployment with exit 4 before the fetch, naming the registry": one
    fixture for each of three registries: an empty registry, `relative/project\n`, and `<tools>\n`. Each one gives exit
    4 with HEAD `older`, no tag and `origin/adrian-rebuild` still `older`. stderr contains the registry path. In the
    first run the test also asserted that stdout is exactly `checked registry <path>: 0 projects` plus the line's entry
    (none for the empty registry). Review round 1 moved that assertion to its own test.
17. "a registry that cannot be read refuses the deployment with exit 4 before the fetch, naming its path": the
    registry is replaced by a folder, so the read fails with `EISDIR` for every user, root included. Result: exit 4,
    HEAD, the tags and `origin/adrian-rebuild` unchanged, and stderr contains `cannot read <registry>`.
18. "a refusal for a running job also prints the list of what was checked": a starting job. Result: exit 1, and stdout
    is exactly the list with `<project>: 1 running job`.
19. "a registry line with a control character is printed escaped in the list": a line `<tmp>/odd ESC]0;owned BEL CR
    dir`. Result: exit 0. stdout without its newlines holds no `\p{Cc}`, and it holds the line `  <tmp>/odd
    \x1b]0;owned\x07\x0ddir: not a project (no .limen/)`.

Item 3: `plan.md` is not changed.

Item 4, `test/structure.test.ts`, by Adrian's decision (a deviation from `## Change`, deviation 6):
- `knownFiles(repo)` lists the files git knows, tracked and untracked but not ignored. It runs `git ls-files --cached
  --others --exclude-standard -z` in `repo`.
- The folders that `filesBelow` skipped (`node_modules`, `.git`, `.pi`) are now one set, `SKIPPED`, which both
  listings use. So `knownFiles` drops a path that has one of them as a part, and the old whole-tree listing loses only
  the ignored files. Without that, the tracked `.pi/extensions/limen.ts` would be counted from now on.
- `typeScriptNames(repo)` gives the basenames of the `.ts` files of `knownFiles(repo)`. The test "runtime remains
  dependency-free and TypeScript basenames stay unambiguous" uses it with the repository root and asserts as before.
- The module sets `GIT_CONFIG_GLOBAL=/dev/null` and `GIT_CONFIG_NOSYSTEM=1` for its own process, as
  `test/seat/deploy.test.ts` does, so the laptop's git configuration (a global excludes file, for example) does not
  change the listing.
- New test, written first: "an ignored TypeScript file whose basename repeats a tracked one is not counted by the
  basename check". The fixture is a new git repository in the OS temporary folder (removed in `t.after`) with
  `.gitignore` = `vendor/`, a tracked `tracked/name.ts`, an untracked `untracked/other.ts` and an ignored
  `vendor/name.ts`. Result: `typeScriptNames` gives exactly `name.ts` and `other.ts`.
- The Pi sources stay in `adrian-rebuild/input/vendor/`, which I did not touch.
- The other users of `filesBelow` (`filesIn`, and through it `sources`) are unchanged. See `## Open points` 1.

## Proof

From the repository root, Node 26.13.1, git 2.34.1, after the resumed run:
- `node --test test/seat/deploy.test.ts` (AC-1): exit 0; tests 19, pass 19, fail 0.
- `node --test test/structure.test.ts`: exit 0; tests 9, pass 9, fail 0.
- `npx tsc --noEmit`: exit 0, no output.
- `npx biome format --write` and then `npx biome check --error-on-warnings` on the three changed files: exit 0, "No
  fixes applied."
- `node adrian-rebuild/tools/fails-before.mjs` (AC-2): exit 0, "fails-before: test/seat/deploy.test.ts,
  test/structure.test.ts fail at HEAD (exit 1)" (`## Fails before`).
- `node adrian-rebuild/tools/gate.mjs` (AC-3): exit 0. It printed the shim line for git 2.34.1. `biome check
  --error-on-warnings .`: "Checked 163 files … No fixes applied." Tests 250, pass 250, fail 0, cancelled 0, skipped 0
  (86.9 s).
- `node adrian-rebuild/tools/check.mjs` (AC-4), after this file was written: exit 0, "0 errors" (111 PL summaries, 16
  ticket folders, 15 `changes.md` entries). `npx biome check --error-on-warnings adrian-rebuild`: exit 0, "Checked 28
  files … No fixes applied."

The first run's gate, before item 4: exit 1; tests 249, pass 248, fail 1 (86.5 s). All 19 deploy tests passed in it.
The one failure:
```
test at test/structure.test.ts:24:1
✖ runtime remains dependency-free and TypeScript basenames stay unambiguous (76.545751ms)
  AssertionError [ERR_ASSERTION]: TypeScript basenames must be unique

  650 !== 709
```
I did not run the gate or that test again before the decision (D-029). Cause, found with `find` and `ls`:
- `filesBelow(root)` walks the working tree and skips only `node_modules`, `.git` and `.pi`.
- The ignored `adrian-rebuild/input/vendor/` (`.gitignore:9`) holds the Pi 1.5.1 packages, with 579 `.d.ts` files.
- Without `adrian-rebuild/input/`, the tree has 130 `.ts` files and no repeated basename.

## Fails before

**`test/seat/deploy.test.ts`.** My run of the new tests on the unchanged `seat/deploy.ts`: `node --test
test/seat/deploy.test.ts` → exit 1; tests 19, pass 15, fail 4. Output shortened (no stack frames; `<tmp>` is the
fixture's temporary folder):
```
✖ a deployment prints each registry and each project it checked before the deployed line
  + actual - expected
  +   'deployed 85b45a8… in <tmp>/repo (previous ee18944…), tag deployed-2026-11-19-063000',
  +   'next: /reload every coordinator session (adrian-rebuild/plan.md, ## Deployment, step 0.3)',
  +   ''
  -   'checked registry <tmp>/agents/.limen/projects: 1 project',
  -   '  <tmp>/project: 0 running jobs',
  -   '  <tmp>/tools: not a project (no .limen/)'
✖ a registry that holds no project refuses the deployment with exit 4 before the fetch, naming the registry
  AssertionError [ERR_ASSERTION]: an empty registry:
  +   0, '85b45a8…' (HEAD newer), 'deployed-2026-11-19-063000', '85b45a8…' (fetched)
  -   4, 'ee18944…' (HEAD older), '', 'ee18944…'
✖ a refusal for a running job also prints the list of what was checked
  +   actual: [ '' ]
  -   expected: [ 'checked registry <tmp>/agents/.limen/projects: 1 project', '  <tmp>/project: 1 running job',
                  '  <tmp>/tools: not a project (no .limen/)', '' ]
✖ a registry line with a control character is printed escaped in the list
  AssertionError [ERR_ASSERTION]: deployed abb8562… in <tmp>/repo (previous 8569ea5…), tag deployed-2026-11-19-063000
  next: /reload every coordinator session (adrian-rebuild/plan.md, ## Deployment, step 0.3)
    actual: false, expected: true
```
Each test fails for its reason: there is no list, and an empty registry deploys. Test 16 stops at its first fixture.
The other two fixtures also pass as "nothing runs" at `HEAD`: in `seat/deploy.ts:189` a non-absolute line is
filtered out, and in `:207-212` a root without `.limen/jobs/` has no jobs.

The new test that passes at `HEAD` (AC-2) is test 17, "a registry that cannot be read refuses the deployment with
exit 4 before the fetch, naming its path". At `HEAD`, `optionalText` already turns the `EISDIR` into `unreadable`, exit
4, `cannot read <path>: EISDIR: …` (`seat/deploy.ts:226-245`). The test guards that refusal, which D-045 (4) asks for.

**`test/structure.test.ts`.** I wrote the fixture test first, together with plumbing only: `typeScriptNames(repo)` over
the unchanged `filesBelow`, used by the basename test, with no change in behaviour. Then I ran `node --test
test/structure.test.ts`: exit 1; tests 9, pass 7, fail 2. Output shortened:
```
✖ runtime remains dependency-free and TypeScript basenames stay unambiguous
  AssertionError [ERR_ASSERTION]: TypeScript basenames must be unique
  650 !== 709
✖ an ignored TypeScript file whose basename repeats a tracked one is not counted by the basename check
  + actual - expected
    [
      'name.ts',
  +   'name.ts',
      'other.ts'
    ]
```
The fixture test fails for its reason: the ignored `vendor/name.ts` is counted. The basename test fails on this tree
for the same reason. After the change: exit 0, tests 9, pass 9.

**`node adrian-rebuild/tools/fails-before.mjs`**: exit 0, "fails-before: test/seat/deploy.test.ts,
test/structure.test.ts fail at HEAD (exit 1)". Its 40-line tail shows deploy tests 18 and 19 with the assertions
above. The tool cannot show the structure test failing at `HEAD`, for two reasons:
- The changed listing lives in the test file itself, and the tool copies the changed test file over `HEAD`, so `HEAD`
  gets the new listing too.
- Its copy of `HEAD` comes from `git archive` and has no `adrian-rebuild/input/`.

So the plumbing-first run above is the evidence for that file.

## Deviations from the ticket

1. The counts are singular for 1: `1 project` and `1 running job`. Every other count is plural, as in the ticket's
   `<n> projects` and `<n> running jobs`. The refusal for running jobs already does this ("1 job runs").
2. An empty registry line holds no root, so it is not listed, as Limen's own reader `registeredProjects` does
   (`src/project/seat.ts:11-15`). A repeated line in one registry is listed once. A root in two registries is listed
   under each, but its jobs are read once and appear once in the refusal, as before.
3. "Every later failure prints the list" is read as every failure after the running-job check: the fetch, the
   branch, the clean checkout, the checkout and its return, the tag, and exit 5. A failure inside the check does not
   finish the check, so its counts do not exist, and stdout stays empty. Such failures are a `.limen` that `stat`
   cannot read for a reason other than `ENOENT`/`ENOTDIR`, and a `.limen/jobs/` that cannot be read. They exit 4 and
   name the path on stderr. The new `stat` failure path has its test since review round 1 (the ELOOP test, fix 1);
   the existing `jobFolders` path still has none.
4. A `.limen` that is a file, not a folder, is `not a project`.
5. The ticket names five tests; there are seven. Review round 1 split test 16 into the refusal and its list, and
   added the ELOOP test (`## Review round 1 fixes`).
6. `test/structure.test.ts` is outside `## Change`. Adrian's decision of 2026-11-19 adds it (item 4): the basename
   test counts only the files git knows, so the ignored `adrian-rebuild/input/vendor/` cannot fail the gate. Two parts
   go beyond the decision's words, each to keep the old behaviour except for ignored files:
   - The `.pi` skip stays on top of git's list.
   - The module fixes its process's git configuration to none.

## Measurement

- `measured`: every change is checked by the fixture tests above. The real run as root on the seat is `## Deployment`
  step 1.0 ("whose output names every registry and project it checked (R-090)"), not a metric of `## Measurement`.
- M-10 (gate run time): 87.2 s after review round 1 (253 tests). Before that, 86.9 s (250 tests), and 86.5 s in the
  first run (249 tests, 1 failure). The main session records it at the close of the stage.

## Open points

1. `observed`, from a run of `git ls-files --others --ignored --exclude-standard --directory`: the other users of
   `filesBelow` walk ignored files in the same way. They are `filesIn(["seat", "bin"])` (D-010), `filesIn(["src",
   "hook"])` (the dynamic-import scan) and, through `filesIn`, `sources(["src", "hook", "bin"])` (the T-02, T-26 (4) and
   T-01 scans). Today no ignored file lies under `src/`, `hook/`, `bin/` or `seat/`, so none of them is affected. But an
   ignored file there, such as an editor swap file `.*.swp`, would be read by `sources`. As the instruction asked, I
   left them unchanged. Moving them to `knownFiles` is a separate choice.
