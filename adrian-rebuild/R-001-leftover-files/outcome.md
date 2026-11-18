<!-- PL: Wynik ticketu R-001: nowy moduł src/project/leftovers.ts z pustym rejestrem LEFTOVERS oraz funkcjami
listLeftovers i dropLeftovers; `limen status` pokazuje sekcję „Leftover files”, a `limen init --drop-leftovers`
drukuje linię `dropped` zaraz po każdym usunięciu albo `no leftover files`. TRACKED zostaje jedyną listą szablonów
w inherit.ts (D-025), a test rejestru odrzuca wpisy nakładające się na siebie lub na ścieżki TRACKED. Dowody: bramka
sesji głównej 96/96 z kodem 0, fails-before z kodem 0, check.mjs i Biome z kodem 0, recenzja PASS w trzech rundach.
Stan: zamknięty commitem R-001; jeden przebieg bramki padł na testach spoza R-001 (zapis w plan.md → ## State). -->

# Outcome: R-001 Leftover files of cut features are listed and can be dropped

## Done

- Item 1, `src/project/leftovers.ts` (new). It is the only owner of leftover files.
  - `Leftover` is `{ path, feature }`. `LEFTOVERS` is the registry, a `readonly Leftover[]`. It is empty, and its
    comment tells each cut ticket to append its own entries. The comment also gives the overlap rule and its two harms
    (review round 2). First, an entry that holds a tracked path would silently delete a changed template copy, which
    the drop must keep. Second, an overlap lists one file twice, and the drop fails on its second removal.
  - `listLeftovers(root, registry = LEFTOVERS)` returns the registry entries whose path exists under `root`. It checks
    each path with `lstatSync(path, { throwIfNoEntry: false })`, so a file, a directory and a symlink (also a dangling
    one) count. A missing path is the one expected absence (T-01), and any other error propagates. It then adds every
    `TRACKED` project copy that is a regular file and has the same bytes as its packaged template (`Buffer.equals`),
    with the feature `identical copy of the package's <source>`. The result is sorted by path in code-unit order. The
    function only calls `lstat` and reads files. It reads no Git history and writes nothing (AC-8).
  - `dropLeftovers(root, registry = LEFTOVERS, dropped?)` calls `listLeftovers`, then removes each entry with
    `rmSync(path, { recursive: true })`. That removes a directory with its content, and a symlink without its target.
    After each removal it calls `dropped(entry)`, then goes to the next entry. It returns the removed entries.
  - `src/project/inherit.ts`: `TRACKED` is exported and has a one-line comment. It is still the only list of tracked
    templates, and `leftovers.ts` imports it (T-25, D-025).
- Item 2, `src/commands/status.ts`: a new function `leftoverLines(root)` lists the leftovers under the root that status
  reports on its first line. It adds `Leftover files (N); check them, then run limen init --drop-leftovers:` and one
  `  <path> (<feature>)` line per entry. The section goes after `Unconfirmed jobs` and before `Older:`. With `--all`,
  which has no `Older:` line, it goes before `Coordinator tabs:`. With no leftover, the function returns no lines.
  `confirmDeadJobs` is unchanged (R-032).
- Item 3, `src/commands/init.ts`: `removeHookCopies` and its `removed <path>` lines stay. The loop over
  `listDrift(...).filter(leftover)` is replaced by `dropLeftovers(root, LEFTOVERS, print)`. `print` writes
  `dropped <path> (<feature>)` right after each removal, so when a later removal fails, every entry already removed has
  its line (review round 1, fix 1). When nothing was removed, the command prints `no leftover files`. The unused `rm`
  import is removed. The drift lines of a plain `limen init` are unchanged (R-040).
- Item 4, tests (14 new tests in 3 new files) and `package.json`:
  - `test/project/leftovers.test.ts` (10 tests, temporary directories, fixture registries):
    - Present file, directory and dangling-symlink entries are listed, and a missing one is not. The fixture registry
      is in path order, so this test does not depend on the sort (fix 3).
    - An identical `AGENTS.md` is listed, and a changed `.agents/limen/worker.md` is not.
    - Registry entries and template copies are sorted together by path.
    - `dropLeftovers` removes a directory with nested content, and removes a symlink but keeps its target.
    - `dropLeftovers` reports each removal before the next one (fix 1). The fixture is `cut` and `cut/inner.json`, so
      the second removal fails with ENOENT. The test checks that the first entry was already reported.
    - A second call removes nothing.
    - Every `LEFTOVERS` entry passes the path rule and has a non-empty feature.
    - No `LEFTOVERS` entry overlaps another entry or a `TRACKED` path (fix 2). Overlap means it equals one, lies under
      one, or holds one. The comment on the rule names both harms in that order: first the silent deletion of a
      changed copy that item 3 keeps, then the double listing and the failing second removal (review round 2, note 3).
    - The path rule rejects `""`, `.`, an absolute path, `..`, `../outside`, `a/../b`, `./a`, `a//b`, `a/b/`, `.git`
      and `.git/config`. It accepts `.gitignore` and `.github/…`.
    - The overlap rule flags `cut` twice, `cut` with `cut/inner.json` in both orders, `AGENTS.md`, `AGENTS.md/inner`,
      `.agents` and `.agents/limen`. It accepts `cut` with `cut-other`, `AGENTS.md.old` and `.agents/limen/cut.json`
      (fix 2).
  - `test/cli/status.test.ts` (2 tests, plants): with `AGENTS.md` identical to `templates/agents.md`, the output holds
    the header, then `  AGENTS.md (identical copy of the package's templates/agents.md)`, then `Older: …`; with no
    leftover, no line starts with `Leftover files`.
  - `test/cli/init.test.ts` (2 tests, plants): `limen init --drop-leftovers` removes an identical `AGENTS.md`, keeps a
    changed `.agents/limen/worker.md`, and prints exactly
    `dropped AGENTS.md (identical copy of the package's templates/agents.md)`; a second run prints exactly
    `no leftover files` and exits 0.
  - `package.json`: the `test` and `check` scripts run `'test/**/*.test.ts'` (a quoted Node glob) instead of
    `test/*.test.ts`. The gate count, 82 + 14 = 96, shows that every file of `test/*.test.ts` still runs.
- Item 5, docs:
  - `docs/commands.md`, `status`: what the `Leftover files` section lists; where it is (before `Older:`, or before
    `Coordinator tabs:` with `--all`, fix 4); that it is not shown when there is nothing to list; that it removes
    nothing.
  - `docs/commands.md`, `init --drop-leftovers`: the `removed` lines; what it removes; that a `dropped` line follows
    each removal; the `no leftover files` line and the second run; that a changed prompt copy stays.
  - `docs/setup.md`: the "Leftover prompts" line is now "Leftover files". It says that `status` lists the files and
    the drop deletes them (AC-9).

## Proof

Run from the repository root on the laptop (git 2.34.1, so the gate uses its `worktree list -z` shim), after the
fixes of review round 1.

| Criterion | Command | Exit | Result |
|---|---|---|---|
| AC-1 | `node --test test/project/leftovers.test.ts` | 0 | tests 10, pass 10, fail 0 |
| AC-2 | `node --test test/cli/status.test.ts` | 0 | tests 2, pass 2, fail 0 |
| AC-3 | `node --test test/cli/init.test.ts` | 0 | tests 2, pass 2, fail 0 |
| AC-4 | `node adrian-rebuild/tools/fails-before.mjs` | 0 | before round 1: `fails-before: test/cli/init.test.ts, test/cli/status.test.ts, test/project/leftovers.test.ts fail at HEAD (exit 1)` |
| AC-5 | `node adrian-rebuild/tools/gate.mjs` | 0 | tests 96, pass 96, fail 0 (82 before + 14 new) |
| AC-6 | `git grep -q '"templates/agents.md"' -- src/project/leftovers.ts src/commands/status.ts src/commands/init.ts` | 1 | no match; the same command with `--untracked` also exits 1, because `leftovers.ts` is not tracked until the commit |
| AC-7 | `node adrian-rebuild/tools/check.mjs` | 0 | `… 0 errors` |
| AC-7 | `npx biome check --error-on-warnings adrian-rebuild` | 0 | `No fixes applied.` |

The gate ran five times on this change:
1. Exit 1: Biome reported the formatting of `test/project/leftovers.test.ts` (an import line wider than 120
   columns). I ran `npx biome format --write` on the changed files.
2. Exit 0, 93/93.
3. After two small edits (`lstat` with `throwIfNoEntry: false` instead of a `catch`, and two comments): exit 1,
   92/93. The failed test was `seat registrations survive a dead-owner registry lock under contention`
   (`test/s9-housekeeping.test.ts:135`): the registry held 39 of the 41 expected projects. See open point 1.
4. Same tree as run 3: exit 0, 93/93.
5. After the fixes of review round 1: exit 0, 96/96.

Fix 1 is the only change to code in round 1. Its test is the `dropLeftovers reports each removal …` test above, and
it failed before the fix: `actual: []`, `expected: [ { path: 'cut', feature: 'an outer cut' } ]`. Fixes 2 and 3
change only tests, and fix 4 changes only the docs.

The main session's own runs after round 1 (they count, protocol step 4): `node adrian-rebuild/tools/gate.mjs` →
exit 1 once, tests 96, pass 93: `limen highlight marks what Limen writes into Herdr …` (timed out at 180 s) and
`hosted Pi stop records stopped once …` in `test/s2-hosted.test.ts`, and the lock-contention test of
`test/s9-housekeeping.test.ts:135`. None of them runs code R-001 changes; the run started while the implementer's
process had not yet ended (its completion came during the run), and both gates use the same cache directory, so a
concurrent run is the likely cause (guessed). The next run on the same tree, with nothing else running → exit 0,
tests 96, pass 96, fail 0 (89.9 s).

Review round 2 changed only two comments (`src/project/leftovers.ts`, `test/project/leftovers.test.ts`), so I did
not run the full gate again; the main session runs it. After the change:
`npx biome check --error-on-warnings src/project/leftovers.ts test/project/leftovers.test.ts` → exit 0;
`node --test test/project/leftovers.test.ts` → exit 0, tests 10, pass 10, fail 0;
`node adrian-rebuild/tools/check.mjs` → exit 0, 0 errors.

## Fails before

`node adrian-rebuild/tools/fails-before.mjs`, run by the main session after round 1 → exit 0:

```
fails-before: test/cli/init.test.ts, test/cli/status.test.ts, test/project/leftovers.test.ts fail at HEAD (exit 1)
```

At HEAD `src/project/leftovers.ts` does not exist (all 10 tests of `test/project/leftovers.test.ts` fail on
`ERR_MODULE_NOT_FOUND`); `limen status` prints no `Leftover files` section; `limen init --drop-leftovers` prints
`dropped AGENTS.md` and `no leftover copies`. The negative control (no section without a leftover) passes at HEAD by
design.

## Judgment criteria

AC-8 (judgment): the section in `limen status` comes from `listLeftovers`, which only calls `lstatSync` and
`readFileSync`. It does not wait, and it does not start a process or read Git history (compare `listDrift`, which
runs `git log` and `git show`). AC-9 (judgment): the docs of item 5 give the exact header, the line format, the two
places of the section, the drop lines and when they are printed, and what the drop removes and keeps. These are the
strings the code prints and the tests check.

## Deviations from the ticket

None in scope. These are choices the ticket does not settle:
- A template copy counts only if it is a regular file (`lstat` → `isFile()`). A symlink or a directory at
  `AGENTS.md` or `.agents/limen/*.md` is not "a copy", so it is not listed and not dropped. The comparison is by bytes
  (`Buffer.equals`), not by decoded text as in `listDrift`.
- A packaged template that is missing when the project has the copy is a broken install: `readFileSync` throws and
  the command fails (T-01; review round 1 kept this).
- Absence is only ENOENT (`throwIfNoEntry: false`). Any other `lstat` error, for example ENOTDIR when a parent of a
  registry path is a file, propagates. The same holds for the `TRACKED` paths, so `limen status` fails loudly in a
  project whose `.agents` or `.agents/limen` is a regular file (review round 3); `limen init` always makes
  `.agents/limen/` a directory, and T-01 wants the failure loud.
- `dropLeftovers` has a third, optional parameter `dropped`, called after each removal (fix 1). The test for fix 1 is
  a unit test of `dropLeftovers`, not a CLI test. The CLI drops only `TRACKED` copies, and those paths never overlap,
  so making their second removal fail would need a permission trick. That trick does not work under root, and no
  test in the suite uses one. `init` passes only the print function, and the CLI tests check the printed line.
- Tests that the ticket does not list, each for one mechanism (T-29 (3)): the sort across both sources; the report
  order of fix 1; the path rule and the overlap rule, each on bad examples, because `LEFTOVERS` is empty and the
  registry tests check no entry until a cut ticket adds one. The path rule now also rejects a trailing slash, so the
  overlap rule can compare paths by prefix.
- `docs/setup.md`: the label "Leftover prompts" is now "Leftover files", the name that status prints.

## Measurement

No metric in `plan.md` → `## Measurement` names R-001, so nothing is marked `unmeasured`. The effect on the seat (the
list in each project, then the drop) is `## Deployment` step 1.1. It runs on the seat, after the snapshot of 0.1.

## Open points

1. `test/s9-housekeeping.test.ts:135` (48 processes race for the seat registry lock) failed in one of four gate runs
   after the source change, and passed in the next run on the same tree. R-001 changes no code that the test runs
   (`workspace init` and `registerProject` are unchanged). But the new CLI tests add four plants to the parallel run
   (`--test-concurrency=4`). The main session records it in `plan.md` → `## State` with the commit (review
   round 2, note 2).
2. The drift advisory still says "`limen init --drop-leftovers` deletes only byte-identical leftovers"
   (`src/project/inherit.ts:98`, in the per-turn cue through `hook/communication.ts:246`). Once a cut ticket registers
   paths, this sentence is incomplete. R-040 cuts it (out of scope here).
