<!-- PL: Wynik ticketu R-007 (szkic implementera): wycięta przeglądarka Picture (viewer, strona `/`, `map.html`), zadania
mapy (`picture tick`, `picture watch`) i rola `picture`; `picture build` tylko sprawdza mapę (model w `--json`), a
`picture serve` podaje `/activity.json` i `/events` z zadań głównego checkoutu. Stare formy odmawiają wierszem
z `src/old-names.ts`, pliki po wyciętych funkcjach (także oznaczony hook) są w rejestrze plików pozostałych, a `waitJob`
czeka też na zniknięcie `pid`, ale nie `born` (A-088 po korekcie D-034). Plik podaje dowody (bramka 127/127), testy
padające przed zmianą, odstępstwa oraz korektę: awaria testu keepera była skutkiem braku shimu gita poza bramką, nie
wyścigu. Stan: zamknięty (19.11; recenzja PASS w rundzie 1). -->

# Outcome: R-007 Cut the Picture viewer and the map jobs

## Done

- Item 1: `git rm -r -q picture src/picture/html.ts src/project/picture-tick.ts src/project/picture-watch.ts
  templates/picture.md templates/.history/picture.md` (the seven viewer files and five more); `package.json` lost
  `"picture"` from `files`.
- Item 2, `picture build`:
  - `src/picture/picture-build.ts`: `pictureHtml` is gone with the `fileURLToPath` and `html.ts` imports;
    `buildPicture(dir, json, root)` reads the model with `readPicture(dir, root)`, writes it with the local atomic
    write only when `json` is given, and returns it. `readPicture` and `writeAtomic` are unchanged.
  - `src/commands/picture.ts` (rewritten): the build prints each diagnostic on stderr as before, then
    `picture: <n> places, <m> edges`, plus `; wrote <json>` only with `--json`; `--strict` sets exit code 1 on an error
    diagnostic, as before. `--out` stays in the build table; `refuseRemovedFlags("picture build", …)` refuses it right
    after parsing, before the map is looked up. No `headCommit` for the build.
  - `mapFolder` throws `<dir> has no plant file (nodes/*.md with "kind: plant") and no map at <dir>/.limen/picture`.
- Item 3, `picture serve`:
  - `src/picture/picture-serve.ts`: `ServeOptions` is `{ jobsRoot, port }`; the build before listening and the `/`
    route are gone, so only `GET /activity.json` and `GET /events` answer and every other path answers 404. `respond`
    lost its `options` parameter (only `/` used it) and stays `async`, so a throw still reaches the 500 handler. The
    Host check, the reader, the snapshot, the ping and `close` are unchanged; the doc comment says what it serves.
  - `src/commands/picture.ts`: serve takes `[--port N]`; `--dir` stays in the serve table and is refused right after
    parsing. `primaryJobs(cwd)` is `join(dirname(gitCommonDir(repoRoot(cwd))), ".limen", "jobs")`: `repoRoot` gives its
    own error outside a repository. Start line: `picture: serving http://127.0.0.1:<port>/activity.json and /events;
    Ctrl-C stops`.
- Item 4: `MODEL_FLAGS`, `ROUTE`, the `tick`/`on`/`off`/`status` tables, both branches and their imports are gone.
  `pictureCommand` first looks up `removedCommand(`picture ${mode ?? ""}`)` and throws it, so `picture tick …` and
  `picture watch …` with any words refuse before parsing and before the usage. `HELP` holds the two lines of the
  ticket. Its `biome-ignore` ("split pending") went: the function is under the complexity limit now (T-27).
- Item 5: `src/old-names.ts` has `OLD_ROLES` and `removedRole(name)`; the header comment and the docstring of the
  tables name the role table. `resolvePreamble` (`src/commands/spawn.ts`, now with a doc comment) throws
  `removedRole(role)` before its own error when neither file exists. Spawn calls it before `makeJobId` and the job
  folder, continue before `claimMember` and `publishContinuation`; the CLI tests below show that both write nothing.
- Item 6: `OLD_NAMES` `picture tick` and `picture watch`, `OLD_FLAGS` `picture build --out` and `picture serve --dir`,
  `OLD_ROLES` `picture`, each with `ticket: "R-007"` and the ticket's wording.
- Item 7, `src/project/leftovers.ts`: `Leftover.marker?`. `present(root, entry)`:
  - an entry without a marker is found as before (`lstat`);
  - an entry with a marker is found only as a regular file that holds the marker, after a check that each folder on
    its path is a directory (`statSync` with `throwIfNoEntry: false`, from the root down), so a `.git` file in a job
    worktree means "no entry", not `ENOTDIR`.
  - The type doc and the registry comment say so. There are five new entries with the ticket's features; the hook
    entry has the marker `# limen picture watch `. In `test/project/leftovers.test.ts`, `insideProject(path, marker?)`
    accepts `.git/hooks/<name>` only with a marker.
- Item 8:
  - `src/main.ts`: two help lines with comments.
  - `src/runtime/wrapper.ts:31`: "Coordinators and `limen picture serve` read the job folder".
  - Templates:
    - `templates/worker.md:16` and `templates/coordinator.md:14`: no `--out`.
    - `templates/keeper.md:15-16`: no `map.html` sentence, the strict check without `--out`.
    - `templates/agents.md:152`: the dataset, `limen picture build --strict` as its check, `limen picture serve` for
      job activity.
    - `templates/.history/{agents,worker,coordinator}.md`: a new first line, dated 2026-11-18, written with Edit:
      `6b1dd559…`, `80bda596…`, `7d80c4a7…`. `templates/keeper.md` has no history file.
  - `templates/picture/CONTRACT.md`:
    - `:3`: the contract is between whoever writes the dataset and `limen picture build`.
    - `:5`: the dataset only.
    - The `map.html`, `job` and `tick.lock` rows are gone. The README row now names "the writer of the dataset", and
      the `map.json` row names `--json`.
    - `:31`: sources are cited for build's `source.missing` check, not for the tick.
    - `revision` is the commit the dataset describes, written last.
    - "names places" replaces "lights places"; there is no series clause; a duplicate is "left out of the model".
    - `## limen picture build` says it reads and checks, writes no HTML, writes nothing without `--json`, and what
      `--json` writes.
    - The tick, watch and picture job sections are gone.
  - `docs/picture.md`: rewritten into three sections:
    - "The dataset";
    - "Check the map and the tickets": build, the ticket scaffold and its front matter, the worktree check without
      `--out`, and `--dir`;
    - "Job activity": the two endpoints, 404 and 403, and what a job in the snapshot says, from
      `src/picture/activity.ts`.
  - Other docs:
    - `docs/commands.md`: "Map check and job activity" with the two lines; the watch section is gone.
    - `README.md`: the `## Picture` section is gone; the row stays.
    - `docs/seat/README.md`: the Picture section is gone.
    - `docs/setup.md:117`: no "picture jobs".
- Item 9: the tests below (`## Fails before`, `## Tests removed with the cut`).
- Item 10, A-088 (as corrected by D-034): `test/plant.ts`.
  - The `WAITER` child returns only when `state` is terminal and `pid` is gone. It does not look at `born`. A state
    that is neither running nor terminal still fails it.
  - `waitJob` stays synchronous and is bounded by `spawnSync`'s `timeout: WAIT_MS` (120 s, below the suite's 180 s
    test timeout). It throws `waiting for job <id> failed within 120000 ms: …` when the bound cuts it.
  - Both comments say what it waits for. The `WAITER` comment also says why it ignores `born`: `recordBorn` reads the
    state and then writes `born`, so a job that ends in between keeps that file for good.
  - `settled` in `test/cli/old-names.test.ts` stays as it is.
  - New `test/plant.test.ts` (see `## A-088`).
- Item 11, `biome.jsonc`: the viewer sentence at `:30-31` and the `picture/viewer/*.js` override (`:84-93`, with its
  comment) are gone; `skipIifes` and the other rules stay. See Deviations 5 for `:38-39`.

## Proof

Main session's runs after the implementer's completion notification (protocol step 4):
- `node adrian-rebuild/tools/gate.mjs` → exit 0; tests 127, pass 127, fail 0, cancelled 0, skipped 0 (58.6 s).
- `node adrian-rebuild/tools/fails-before.mjs` → exit 0: the set `test/cli/old-names.test.ts`,
  `test/cli/status.test.ts`, `test/project/leftovers.test.ts`, `test/s6-keeper.test.ts`, `test/picture/serve.test.ts`
  and `test/plant.test.ts` fails at HEAD (one exit code for the set); `node adrian-rebuild/tools/fails-before.mjs
  test/plant.test.ts` → exit 0 (the `waitJob` test fails at HEAD alone: `✖ A-088: waitJob returns only after the
  job's state is terminal and its pid is gone, whatever born holds`).
- Review: `rebuild-reviewer`, round 1 → PASS, nine notes (`review.md`).
- `node adrian-rebuild/tools/review-guard.mjs compare --git node_modules/.rebuild-review/R-007.git <ticket.md>` →
  exit 1 ("void"), naming only the reserved paths `adrian-rebuild/plan.md`, `adrian-rebuild/audit.md` and this
  ticket's `ticket.md`. The main session changed all three while the implementer stood at `BLOCKED` (A-088, D-034,
  `## State`, `## Change` item 10, `## Decisions`), after the snapshot; HEAD, the refs, the index, git's config and
  hooks were unchanged, and `git diff` of the two tracked files holds only the main session's entries. Adrian
  accepted the run (D-035), which adds a new snapshot after such edits to protocol step 3.

Implementer's runs, from the repository root:

- `node adrian-rebuild/tools/gate.mjs` before the change (HEAD `a5767dd`): exit 0; tests 108, pass 108, fail 0,
  cancelled 0, skipped 0 (58.2 s).
- After the change, with the first version of item 10 (`pid` and `born`): exit 0; tests 127, pass 127, fail 0,
  cancelled 0, skipped 0 (58.9 s).
- After the corrected item 10 (`pid` alone), one run: exit 0; tests 127, pass 127, fail 0, cancelled 0, skipped 0
  (59.7 s). Both runs print "gate: git version 2.34.1 lacks 'worktree list -z'; the shim in
  …/node_modules/.rebuild-gate emulates it".
- `npx tsc --noEmit`: exit 0. `npx biome check --error-on-warnings .`: exit 0 (148 files).
- `node adrian-rebuild/tools/check.mjs`: exit 0, 0 errors. `npx biome check --error-on-warnings adrian-rebuild`:
  exit 0. Both were run again after this file was written; the numbers are in the reply.
- AC-1: `git ls-files -- picture src/picture/html.ts src/project/picture-tick.ts src/project/picture-watch.ts
  templates/picture.md templates/.history/picture.md | grep -q .` exits 1; `grep -q '"picture"' package.json` exits 1.
- AC-2: the ticket's `git grep -q -i -E '…'` with its five exclusions exits 1 (working tree, deletions staged). The
  same pattern with `grep -n -i -E` over the two untracked new files `test/picture/serve.test.ts` and
  `test/plant.test.ts` exits 1.
- AC-3: `git grep -q -e 'picture build.*--out' -e 'picture serve \[--dir' -- templates docs README.md src/main.ts`
  exits 1.
- AC-4: `node --test test/picture/serve.test.ts` exits 0, 5 of 5.
- AC-5: `node --test --test-timeout=180000 test/cli/old-names.test.ts` exits 0, 20 of 20.
- AC-6: `node --test --test-timeout=180000 test/cli/status.test.ts` exits 0, 9 of 9;
  `node --test test/project/leftovers.test.ts` exits 0, 14 of 14.
- AC-7: `test/s6-keeper.test.ts` passed inside the gate run above, 5 of 5. Run directly on this laptop it exits 1
  (Open points 2).
- `node --test test/plant.test.ts` exits 0, 1 of 1.
- Not covered by a test: I checked the outputs below by hand on a plant, from a scratch script outside the repository.
  - `picture build --json <file>` exits 0 with `picture: 1 places, 0 edges; wrote <file>`. The file has schema
    `architecture-map-model/3`, and `.limen/picture/` still holds only `nodes`.
  - `picture --help` prints the two help lines.
  - `picture build --out a --out b` and `picture serve --dir` (no value) print the removal line.
  - `picture serve --port 0` prints `picture: serving http://127.0.0.1:<port>/activity.json and /events; Ctrl-C stops`.
- AC-8: `node adrian-rebuild/tools/fails-before.mjs` runs every new and changed test file in one `node --test` over
  HEAD's source and reports one exit code for all of them (`adrian-rebuild/tools/fails-before.mjs:73-87`), so its
  exit 0 shows that the set fails at HEAD, not that each file does. The per-file failures rest on the implementer's
  per-file runs below and on `node adrian-rebuild/tools/fails-before.mjs test/plant.test.ts`, which runs only the
  `waitJob` test over HEAD and fails (the main session's run, `## Proof`). The implementer's first reading, that the
  path-less run lets `test/plant.test.ts` pass, is not what the main session's run printed; neither run can tell.

## Fails before

Each new or changed test file was run on the unchanged source (`HEAD` with the new test files) before any source edit,
directly with `node --test` and without the gate's environment. The output is shortened: no stack frames, temporary
paths shortened.

- `node --test test/picture/serve.test.ts`: exit 1, 5 of 5 fail, each with
  `TypeError [Error]: options.tip is not a function`. HEAD's `servePicture` builds the page before it listens.
- `node --test --test-timeout=180000 test/cli/old-names.test.ts`: exit 1, 5 of 20 fail:
  ```
  ✖ limen picture tick and limen picture watch refuse with one removal line, whatever words follow, and leave .limen/ and .git/hooks/ unchanged
    actual: [ [ 'picture tick', false, '' ], [ 'picture watch', false, '' ], [ 'picture watch', false, '' ], [ 'picture watch', false, '' ] ]
  ✖ picture build --out and picture serve --dir refuse with one removal line before anything is read or written
    actual: [ [ 'picture build --out', false, '' ], [ 'picture serve --dir', true, '…/repo/x has no plant file (nodes/*.md with "kind: plant") and no map yet in …/repo/x/.limen/picture. The first map comes from a picture job: limen spawn --role picture --tab … (docs/picture.md).\n' ] ]
  ✖ resolvePreamble throws the removal line of the role picture in a project without .agents/limen/picture.md
    AssertionError [ERR_ASSERTION]: Missing expected exception.
  ✖ spawn --role picture refuses with the removal line and leaves no job, worktree or branch
    actual: [ false, '' ]
  ✖ continue refuses a job of the role picture once the project's own role file is gone, and leaves .limen/ unchanged
    actual: [ false, '' ]
  ```
- `node --test --test-timeout=180000 test/cli/status.test.ts`: exit 1, 1 of 9 fails: "limen status lists the files
  the cut Picture viewer, map jobs and map watch left, the marked watch hook included". The output has no "Leftover
  files (5)" header.
- `node --test test/project/leftovers.test.ts`: exit 1, 3 of 14 fail:
  ```
  ✖ dropLeftovers removes a hook that holds the entry's marker and keeps one that does not
    actual: [ [ [Object] ], [ [Object] ] ]   expected: [ [ [Object] ], [] ]
  ✖ listLeftovers finds a marked entry only as a regular file, never as a directory or a symlink
    actual: [ [ [Object] ], [ [Object] ] ]   expected: [ [], [] ]
  ✖ listLeftovers finds no marked entry under a .git file, as in a job worktree
    Error: ENOTDIR: not a directory, lstat '…/limen-leftovers-r5gu0M/.git/hooks/cut-hook'
  ```
- `node --test --test-timeout=180000 test/s6-keeper.test.ts`: exit 1. The two rewritten tests fail as expected:
  ```
  ✖ picture build --strict --dir takes a plant root from any folder, prints the place count and writes nothing in the map folder
    '0 picture: 1 places, 0 edges; wrote …/repo/.limen/picture/map.html\n'   expected: /^0 picture: [1-9]\d* places, \d+ edges\n$/
  ✖ picture build stops on a folder with no map with an error that names both paths and nothing else
    + '…/bin has no plant file (nodes/*.md with "kind: plant") and no map yet in …/bin/.limen/picture. The first map comes from a picture job: limen spawn --role picture --tab … (docs/picture.md).\n'
    - '…/bin has no plant file (nodes/*.md with "kind: plant") and no map at …/bin/.limen/picture\n'
  ```
  The keeper test failed in the same run (`## A-088`).
- `test/plant.test.ts`, the corrected version of item 10. It was written before `waitJob` changed and run against
  `HEAD`'s helper: a scratch copy in the OS temporary directory holds `git show HEAD:test/plant.ts`, with only its
  `../src/job/job.ts` import made absolute, beside a copy of the new test. `node --test <scratch>/plant.test.ts`
  exited 1, 1 of 1 failing, in both runs:
  ```
  ✖ A-088: waitJob returns only after the job's state is terminal and its pid is gone, whatever born holds
    actual: [ 'done', true, true ]   expected: [ 'done', false, true ]
  ```
  The first version of the test (`pid` and `born` both removed) failed at `HEAD` the same way, with
  `actual: [ 'done', true, true ]` against `expected: [ 'done', false, false ]`.

Tests that pass at `HEAD` by design, inside files that fail there:
- "resolvePreamble returns the project's own .agents/limen/picture.md, so a project keeps a role of that name": a
  guard, since a project file already won at `HEAD`.
- "limen status does not list a reference-transaction hook without the map watch's marker": `HEAD` lists no hook at
  all. It fails only if the marker check is lost.
- The two path-rule tests and "every LEFTOVERS entry …" in `test/project/leftovers.test.ts`: the rule lives in the
  test file, and `HEAD`'s registry holds no `.git` path.

Changed files that pass at `HEAD` alone: `test/plant.ts`, which is not a test file. Its callers pass at `HEAD` with
either `waitJob`, because the fixed one only waits longer. Its own test is `test/plant.test.ts`.

## A-088: the observation and a correction

- **The observation.** The run of `test/s6-keeper.test.ts` above, on unchanged source, also failed "keeper refuses a
  running job, then starts on a new branch at the candidate tip" (HEAD `:40`, the assertion at `:55`):
  ```
  ✖ keeper refuses a running job, then starts on a new branch at the candidate tip (498.21445ms)
    + [ '', '' ]   - [ 'limen/keeper-f001-8f6839d', '8f6839d4bbe689ad606f8c4a7313bf83ca4898fe' ]
  ```
  The same test had passed in the gate run minutes earlier. I reported it as `BLOCKED`, with the guess that
  `waitJob` returns before the wrapper removes `pid` and `born`, so `ownerAlive` (`src/commands/keeper.ts:168`)
  refuses. Adrian chose option c (D-034), and item 10 was first that fix, waiting for both files.
- **The correction (proven).** With that first fix in place, one more direct run (`node --test
  --test-timeout=180000 test/s6-keeper.test.ts`) failed the keeper test again in the same way. A diagnostic script in
  the OS scratch directory, outside the repository, ran the same scenario and printed the keeper's output. After
  `waitJob`, `pid` and `born` were both gone, and the second `limen keeper` exited 1 with:
  ```
  ticket moved: spec/features/planned/F001-demo/ticket.md -> spec/features/active/F001-demo/ticket.md
  error: unknown switch `z'
  usage: git worktree add [<options>] <path> [<commit-ish>]
  ```
  The laptop's git is 2.34.1. `src/project/git.ts:174`, unchanged since `HEAD`, runs `git worktree list --porcelain
  -z`, and only the gate environment (`adrian-rebuild/tools/gate-env.mjs`, D-001) adds the shim for it. So a direct
  `node --test test/s6-keeper.test.ts` on this laptop fails that test every time, at `HEAD` too (2 of 2 runs and the
  diagnostic). The gate passes it. The failure was a run outside the documented test environment, not an
  intermittent race. The main session confirmed this.
- **What stays true, and the corrected fix.** A-088 stays as a low finding read from the code (D-034, corrected):
  `finalizeJob` writes `state` (`src/job/record.ts:57`) before it removes `pid` (`:69`), and the keeper refuses while
  `ownerAlive` holds. No run observed that window. Item 10 now waits for a terminal `state` and for `pid` alone.
  `born` is no condition, because `recordBorn` (`src/job/record.ts:111-120`) reads `state` and then writes `born`, so
  a job that ends in between keeps a `born` file that nothing removes. Waiting for it would have turned that case
  into a 120-second failure of `waitJob`.
- **The test of the helper.** In `test/plant.test.ts`, a job folder has a terminal `state` plus `pid` and `born`. A
  second node process plays the wrapper's tail: after `WRAPPER_TAIL_MS` (1,000 ms) it removes `pid` and leaves
  `born`. `waitJob` must return `done` with `pid` gone and `born` still there, so a leftover `born` does not hold
  the wait. At `HEAD` the helper returns at the state, within about 100 ms of node's start-up, so the test fails
  every time unless node needs more than the 1,000 ms margin to start.

## Tests removed with the cut

There were 108 tests before and 127 after: 1 removed, 20 added. No test covered the viewer, `html.ts`, the tick or
the watch, so none of them went with those files.

Removed:
1. "picture build --dir takes a plant root from any folder and stops on a folder with no map"
   (`test/s6-keeper.test.ts:33-38`). It is replaced by the two tests below, one per mechanism; the old test asserted
   the first-map hint of the cut tick.

Changed, not removed:
- `test/project/leftovers.test.ts`:
  - "every LEFTOVERS entry has a normalised relative path inside the project, outside .git/ but for a marked hook,
    and a feature" checks the path with its marker and rejects an empty marker.
  - "the registry path rule rejects …" also rejects `.git/hooks/reference-transaction` without a marker.
  - `insideProject` takes the marker.
- `test/cli/old-names.test.ts`: the header line names roles.
- `test/plant.ts`: `waitJob` (item 10).

Added:
- `test/picture/serve.test.ts`:
  - "GET / answers 404: the server serves no page";
  - "GET /activity.json answers 200 with the job of the jobs root although no map exists";
  - "GET /events answers an event stream whose first event is activity with the job";
  - "a request with another Host answers 403";
  - "close() ends an open event stream and stops listening".
  - Every request is bounded by `AbortSignal.timeout(5_000)` and has no agent.
- `test/plant.test.ts`: "A-088: waitJob returns only after the job's state is terminal and its pid is gone, whatever
  born holds".
- `test/cli/old-names.test.ts`:
  - "limen picture tick and limen picture watch refuse with one removal line, whatever words follow, and leave
    .limen/ and .git/hooks/ unchanged";
  - "picture build --out and picture serve --dir refuse with one removal line before anything is read or written";
  - "resolvePreamble throws the removal line of the role picture in a project without .agents/limen/picture.md";
  - "resolvePreamble returns the project's own .agents/limen/picture.md, so a project keeps a role of that name";
  - "spawn --role picture refuses with the removal line and leaves no job, worktree or branch";
  - "continue refuses a job of the role picture once the project's own role file is gone, and leaves .limen/
    unchanged".
- `test/cli/status.test.ts`:
  - "limen status lists the files the cut Picture viewer, map jobs and map watch left, the marked watch hook
    included";
  - "limen status does not list a reference-transaction hook without the map watch's marker".
- `test/project/leftovers.test.ts`:
  - "dropLeftovers removes a hook that holds the entry's marker and keeps one that does not";
  - "listLeftovers finds a marked entry only as a regular file, never as a directory or a symlink";
  - "listLeftovers finds no marked entry under a .git file, as in a job worktree";
  - "the registry path rule accepts a path under .git/ only as .git/hooks/<name> on an entry with a marker".
- `test/s6-keeper.test.ts`:
  - "picture build --strict --dir takes a plant root from any folder, prints the place count and writes nothing in
    the map folder";
  - "picture build stops on a folder with no map with an error that names both paths and nothing else".

## Deviations from the ticket

1. Accepted in `## Decisions`:
   - the CLI tests for `spawn --role picture` and for `continue`;
   - the regular-file rule and the folder check for marked entries;
   - the s6 test asserts an unchanged map-folder listing and the exact error text, because AC-2 forbids `map.html`
     and `picture job` in that file.
2. Item 10 says the wait "stays bounded". `HEAD`'s `spawnSync` had no timeout of its own, so `waitJob` now has an
   explicit bound (`WAIT_MS`, 120 s) and a clear error when it is cut.
3. A removed flag that lacks a value or repeats (`--out a --out b`, `--dir` alone) also gives its removal line: the
   command's parse messages look up `removedFlag` first. Before this, those forms read "invalid picture option".
4. `src/picture/picture-serve.ts` names the activity path in a constant `ACTIVITY` beside `EVENTS`.
5. `biome.jsonc:38-39` also lost "the viewer JavaScript" ("these two cover the bin scripts"), beyond the two places
   item 11 names, because the files it named are gone.
6. `docs/picture.md` dropped the paragraph on removing a request "after Adam answers … the pin then leaves the page",
   which describes the page. The `needs-adam` and `wrong` pairs stay described in the front matter paragraph.
7. In the contract, the README row ("the writer of the dataset", instead of "the worker") and the `map.json` row
   (names `--json`) changed, beyond the lines item 8 lists, because both named the cut role or tool.
8. The complexity `biome-ignore` on `pictureCommand` ("split pending") went, because the function is under the limit
   now (T-27).

Deviations 2–8 are accepted for review (`ticket.md` → `## Decisions`, D-034 corrected).

## Measurement

- `unmeasured`, M-01: the role texts shrink, and `templates/picture.md` (3,233 bytes) is gone.
  - `templates/agents.md`: 42,392 → 41,403 bytes;
  - `templates/worker.md`: 6,347 → 6,325;
  - `templates/coordinator.md`: 1,963 → 1,941;
  - `templates/keeper.md`: 3,676 → 3,604.

  At stage 1 these texts do not reach the model under the bridge (E-1), so M-01 is measured from stage 4.
- M-10 (gate run time): 59.7 s in the last run above (58.2 s before); recorded at the close of the stage.
- No seat step: the ticket's API column is `—`. Deployment step 1.1, where the owner reads the leftover list before
  `--drop-leftovers`, now also lists a marked watch hook.

## Open points

1. A-088 is settled (D-034, corrected): the main session confirmed the environmental cause, the finding stays low
   from the code, and item 10 waits for `pid` alone.
2. AC-7 counts inside `gate.mjs` only (`ticket.md` → `## Decisions`, D-001). A direct `node --test
   test/s6-keeper.test.ts` exits 1 on this laptop (git 2.34.1), at `HEAD` too, because only the gate supplies
   `worktree list -z`. Every s6 result in this outcome after the correction comes from the gate.
3. `settled` in `test/cli/old-names.test.ts` still waits for `pid` and `born`. Item 10 keeps it as it is, so its two
   callers keep the `born` exposure that `waitJob` no longer has: a leftover `born` holds them until the test
   timeout. This is `guessed` from the code; no run has seen it.
4. Out of scope and left as they are (data model and its readers): comments in `src/picture/activity.ts` still say
   "the page" ("The page's view of one job", "A finished job stays on the page"), `src/picture/picture-model.ts:150`
   says "and the offline viewer", and `src/job/publication.ts:133` says "The picture nests …". These are for R-080,
   which serves only record data.
5. `docs/seat/README.md` no longer says that a seat still running the retired `limen-picture.timer` should disable it.
   If the seat may still have that timer, a deployment step could check it with `systemctl list-timers`.
6. The refusal wordings are for Adrian at gate 5.1 (`ticket.md` → `## Decisions`).
