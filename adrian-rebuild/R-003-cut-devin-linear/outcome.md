<!-- PL: Wynik ticketu R-003 (szkic implementera): wycięty silnik Devin (src/runtime/devin.ts, `--engine devin`, jego
gałęzie w spawn, wrapperze, stop, continue i group) oraz lustro Lineara (`limen linear`, templates/linear.md, akapit
w templates/agents.md, wpis w .gitignore i dokumentacja). Tabela starych nazw dostała `linear` i nową listę
OLD_ENGINES z `devin`, a rejestr pozostałości trzy ścieżki Lineara. Plik podaje dowody (bramka 95/95, wcześniej 92/92),
testy padające przed zmianą, usunięte testy, odstępstwa i punkty otwarte. Stan: zamknięty; recenzja PASS w rundach
1 i 2, dwie poprawki rundy 1 (komentarz otwierający testu, commity w ## Done) naniesione, bramka po nich 95/95. -->

# Outcome: R-003 Cut Devin and the Linear mirror

## Done

- Deleted with `git rm` (item 1): `src/runtime/devin.ts`, `test/s11-devin.test.ts`, `src/commands/linear.ts`,
  `templates/linear.md`.
- `src/runtime/engine.ts` (item 2): the `devin` profile and its comment, `"devin"` in `EngineId` and `LIMEN_DEVIN` in
  `binaryEnv` are gone. `engineProfile` and `resolveSpawnEngine` accept `pi` and `omp`; for any other value they throw
  `removedEngine`'s line when the table holds the value, else their own error (`unknown engine <id>`, and `--engine
  must be pi or omp`). So `--engine devin`, `LIMEN_ENGINE=devin`, `continue --engine devin`, a `--team devin:…` route
  and a job record with `engine` = `devin` all get `engine devin was removed with Devin cloud jobs (R-003); use
  --engine pi`.
- `src/commands/spawn.ts`: the `preflightDevin` import and call, and the Devin branches of the default model and of
  `preflightEngine`, are gone. Every spawn now takes `--model` or `defaultModel` and runs `preflightEngine`, in the
  same order as a Pi or OMP spawn at `HEAD`. `SpawnLaunch.model` stays `string | undefined`: `dce9449` added it in
  that form, and it is an ancestor of `a016428`, the commit that brought Devin into `spawn.ts`, so it is not a type
  only the removed code used.
- `src/runtime/wrapper.ts`: the `runDevinJob` import and branch are gone; the start-queue condition is `!membership`,
  and its comment says only why a group member starts at once. `stop` (the `AbortController`) and `timeoutMs` stay:
  the start queue and the engine run still use them.
- `src/commands/stop.ts`: the escape search is skipped only for a queued wrapper; the comment says so.
- `src/commands/continue.ts`: the Devin refusal is gone. `readParentJob` reads the recorded engine through
  `engineProfile` where the refusal was, before the transcript check (see Deviations 1); its doc gives the new order.
- `src/commands/group.ts`: the Devin refusal in `teamRouteFlag` is gone.
- `src/main.ts` (items 2 and 3): the `linearCommand` import, the `linear` entry, the `"linear"` member of the command
  union, and the help lines of `spawn --engine devin` and `linear` are gone. `limen linear …` now reaches the table of
  old names as an unknown name.
- `src/old-names.ts` (item 5): `OLD_NAMES` holds the `linear` entry; the new `OLD_ENGINES` (type `OldName`) holds
  the `devin` entry; `removedEngine(name)` returns `engine <name> was removed with <feature> (<ticket>); <instead>` or
  `undefined`. The header comment and `removedCommand`'s doc say the table holds removed commands and removed engine
  values.
- `src/project/leftovers.ts` (item 6): `spec/linear.md`, `spec/linear.md.off` and `.agents/limen/linear.md`, each with
  the feature `the Linear mirror (R-003)`, and a comment on what the three are.
- `templates/agents.md`: the Linear paragraph (`:57`) is gone, and the start-queue sentence (`:88`) names only hosted
  jobs and group launches. `templates/.history/agents.md` has the new hash as its first line (`59a16104…`,
  2026-11-18), written with Edit (D-016).
- `.gitignore`: the comment and the `spec/linear.md*` line are gone. The repository has no `spec/`, so nothing
  becomes untracked.
- Docs (item 4): `README.md` (the Devin requirement, the "Devin jobs run no Limen hooks" sentence, the Linear guide
  row), `docs/commands.md` (the `spawn --engine devin` usage line, the "Devin cloud jobs" paragraph with its link,
  the `### Linear` section), `docs/jobs.md:157` and `:164` (hosted jobs and group launches only), `docs/setup.md`
  (`--engine pi|omp` and its one-sentence description, the Devin model sentence, the `### Devin cloud jobs` section;
  the two links to it were in the changed engine paragraph and in `docs/commands.md`).
- `test/s1-spawn.test.ts`: the four Devin refusal cases are gone; the `--engine claude` case still finds `--engine`
  in the generic error.
- Tests (item 7), written first:
  - `test/cli/old-names.test.ts`: a project with a `spec/linear.md` runs `limen linear status` and `limen linear off`
    (at `HEAD`, `off` renames that file, so the `spec/` snapshot has something to catch); `spawn --engine devin work`
    and `spawn work` with `LIMEN_ENGINE=devin`, with a `.limen/` snapshot; and the `OLD_ENGINES` table test, which
    checks that every entry has a feature, a ticket and a pointer and that `engineProfile` throws exactly that entry's
    `removedEngine` line.
  - `test/cli/continue.test.ts`: a finished job whose `engine` file holds `devin` and whose `session/` folder is empty,
    as a Devin job left it (Deviations 2): `limen continue` exits non-zero with the line on stderr, and
    `.limen/jobs/` still holds only the parent. The file's opening line now names both tests.
  - `test/cli/status.test.ts`: a project with `spec/linear.md` lists it under `Leftover files` as
    `  spec/linear.md (the Linear mirror (R-003))`.

## Proof

Main session's run after the implementer's completion notification (protocol step 4): `node
adrian-rebuild/tools/gate.mjs` → exit 0; tests 95, pass 95, fail 0, cancelled 0, skipped 0 (66.2 s).
`review-guard.mjs compare --git` → exit 0 ("within its limits"). A first implementer run was killed after about two
minutes when WSL shut down at 16:22:59 (most likely WSL's idle shutdown of a distro without a terminal);
`compare --git` against the same snapshot exited 0 before the second run started, so it left nothing. After the two
fixes of review round 1: `compare --git` → within its limits; `gate.mjs` → exit 0, tests 95, pass 95, fail 0
(67.5 s).

Implementer's runs, from the repository root:

- `node adrian-rebuild/tools/gate.mjs` → exit 0; tests 95, pass 95, fail 0, cancelled 0, skipped 0 (65.5 s). Before
  the change, on the same tree without the edits (HEAD plus the main session's `plan.md` edit): exit 0; tests 92,
  pass 92, fail 0 (71.4 s).
- `npx tsc --noEmit` → exit 0. `npx biome check --error-on-warnings .` → exit 0 (164 files).
- `node adrian-rebuild/tools/check.mjs` → exit 0, 0 errors.
- `npx biome check --error-on-warnings adrian-rebuild` → exit 0 (28 files).
- AC-1: `git ls-files -- src/runtime/devin.ts test/s11-devin.test.ts src/commands/linear.ts templates/linear.md |
  grep -q .` → exit 1.
- AC-2: the ticket's `git grep -q -i -E 'devin|linear' -- src hook bin templates test docs README.md CONTRIBUTING.md
  package.json .gitignore ':!…'` with its five exclusions → exit 1.
- AC-3: `test/cli/old-names.test.ts` → 5 of 5 pass. AC-4: `test/project/leftovers.test.ts` → 10 of 10 pass. Both in
  the gate run, and in one gate-environment run of `test/cli/old-names.test.ts`, `test/cli/continue.test.ts`,
  `test/cli/status.test.ts`, `test/project/leftovers.test.ts`, `test/s1-spawn.test.ts` and `test/structure.test.ts`
  → exit 0, 26 of 26 pass.
- AC-5: `node adrian-rebuild/tools/fails-before.mjs` → exit 0: "test/cli/continue.test.ts, test/cli/old-names.test.ts,
  test/cli/status.test.ts, test/s1-spawn.test.ts fail at HEAD (exit 1)". `test/s1-spawn.test.ts` alone passes at
  `HEAD` (`fails-before.mjs test/plant.ts test/s1-spawn.test.ts` → exit 1, "pass at HEAD"): its change only removes
  the four Devin cases (Open points 3).
- By hand, in an empty temporary directory outside any project: `limen --help` has no line that matches
  `devin|linear` (0 matches); `limen linear on --team T --project P` prints the removal line, exits 1 and writes
  nothing; `limen nosuch` still prints `unknown command "nosuch"` (exit 1); `limen spawn --engine claude work` prints
  `--engine must be pi or omp`; `limen group start F001 --team devin:x/y:high` prints the engine removal line (exit 1).

Single test files run in the gate's environment (private `TMPDIR`, git shim), because the laptop's git 2.34 lacks
`git worktree list -z`.

## Fails before

Main session's run after `DONE` (protocol step 4), `node adrian-rebuild/tools/fails-before.mjs` → exit 0:

```
fails-before: test/cli/continue.test.ts, test/cli/old-names.test.ts, test/cli/status.test.ts, test/s1-spawn.test.ts fail at HEAD (exit 1)
✖ spawn with --engine devin or with LIMEN_ENGINE=devin refuses …
    actual: 'no Devin API key: set DEVIN_API_KEY, or sign in with `devin auth login`\n',
    expected: 'engine devin was removed with Devin cloud jobs (R-003); use --engine pi\n',
✖ every old engine has a feature, a ticket and a pointer, and engineProfile refuses each with its line
  TypeError [Error]: OLD_ENGINES is not iterable
✖ limen status lists a spec/linear.md left by the cut Linear mirror as a leftover file
  AssertionError [ERR_ASSERTION]: … (no `Leftover files` section in the status output)
```

(Shortened: stack frames, the plant's temporary path and the full status output are left out.)

Implementer's runs, `node adrian-rebuild/tools/fails-before.mjs test/plant.ts <file>`, one file at a time, before the
change:

- `test/cli/old-names.test.ts` → exit 0 (fails at HEAD). The webhook test and the old-names table test pass; the new
  three fail:
  ```
  ✖ limen linear status and limen linear off refuse with one removal line and leave .limen/ and spec/ unchanged
    AssertionError [ERR_ASSERTION]: linear status
      actual: 0, expected: 0, operator: 'notStrictEqual'
  ✖ spawn with --engine devin or with LIMEN_ENGINE=devin refuses with one removal line and makes no job
    AssertionError [ERR_ASSERTION]: spawn --engine devin work
    + 'no Devin API key: set DEVIN_API_KEY, or sign in with `devin auth login`\n'
    - 'engine devin was removed with Devin cloud jobs (R-003); use --engine pi\n'
  ✖ every old engine has a feature, a ticket and a pointer, and engineProfile refuses each with its line
    TypeError [Error]: OLD_ENGINES is not iterable
  ```
- `test/cli/continue.test.ts` → exit 0. The subdirectory test passes; the new one fails on the old refusal:
  ```
  + 'limen continue cannot resume a devin job; spawn a new --engine devin job with --branch limen/<id> instead\n'
  - 'engine devin was removed with Devin cloud jobs (R-003); use --engine pi\n'
  ```
- `test/cli/status.test.ts` → exit 0. The new test fails: `limen status` at HEAD prints no `Leftover files` section
  for `spec/linear.md` (`assert.ok(lines.includes(HEADER))` on the full status output); the three old tests pass.

## Tests removed with the cut

Before 92 tests, after 95: 2 removed, 5 added.

Removed (`test/s11-devin.test.ts`, deleted by item 1):
1. "a devin job pushes its branch, follows its session and fast-forwards the worktree to the session's commit".
2. "a rewritten branch or a sleeping session fails the job; stop and timeout end the session; no file holds the key".

Changed, not removed: "each spawn refusal exits 1, names its cause and leaves no job, worktree or branch"
(`test/s1-spawn.test.ts`) loses its four Devin cases (`--tab`, `--thinking`, `--provider windows`, the missing API
key); its other eight cases stay.

Added: three tests in `test/cli/old-names.test.ts` (the `linear` refusal, the `devin` spawn refusal, the
`OLD_ENGINES` table), one in `test/cli/continue.test.ts`, one in `test/cli/status.test.ts`.

## Deviations from the ticket

1. `src/commands/continue.ts`: besides deleting the refusal, `readParentJob` reads the recorded engine through
   `engineProfile` at the refusal's place, before the transcript check
   (`const parentEngine = engineProfile((await text(`${parentDir}/engine`)) || "pi").id;`). The ticket relies on
   `engineProfile` at `continue.ts:211`, which runs after `readParentJob`. A Devin job wrote no session transcript
   (the wrapper never ran `argvFor`, and publication makes only an empty `session/` folder), so with `:211` alone a
   real Devin record would refuse with `parent record <id> has no session transcript to continue`, and item 5 ("refuses
   with that line before it writes anything") and the Migration ("acting on it as a job refuses with the line of item
   5") would not hold for it. `:211` stays unchanged; for a `pi` or `omp` record the order of the other checks is the
   same as at `HEAD`.
2. The continue test empties the parent's `session/` folder as well as rewriting its `engine` file, so the fixture is
   a record as a Devin job left it and the test fails without Deviations 1. With only the `engine` file rewritten, the
   test passes with or without it.
3. The `OLD_ENGINES` table test checks that `engineProfile` throws exactly the entry's `removedEngine` line, which is
   stronger than "accepts none of their names": an engine that R-004 adds to the table but still accepts, or that
   gives another error, fails it.

## Measurement

- unmeasured: the listing and drop of the three Linear paths in the two projects (`plan.md` → `## Deployment` 1.1).
  The status test and AC-4 show them on a project fixture. No M-NN covers it.
- unmeasured: a Devin job that runs during deployment keeps its old wrapper until it ends; nothing on the seat runs
  Devin (G1.6). No M-NN covers it.
- unmeasured, M-01: the coordinator manual shrinks by the Linear paragraph and the Devin clause:
  `templates/agents.md` 46,362 → 45,992 bytes. M-01 is measured by the main session when it closes the stage.
- M-10 (gate run time): 65.5 s in this run; recorded at the close of the stage.

## Open points

1. For Adrian, outside the projects (named in the removed `docs/setup.md` section at `HEAD`; Limen reads none of
   them now): the Devin CLI login under `~/.local/share/devin/` (`credentials.toml`), and the environment variables
   `DEVIN_API_KEY`, `DEVIN_ORG_ID`, `DEVIN_API_URL`, `LIMEN_DEVIN` and `LIMEN_DEVIN_ACU_LIMIT`, wherever the seat sets
   them. A Devin job also pushed its job branch to `origin` and left it there; G1.6 says the seat never ran Devin, so
   none is expected.
2. The job files a Devin job wrote (`devin-session`, `devin-url`) stay part of its record (out of scope, R-021).
   `limen status` and `limen jobs` do not read the `engine` file through `engineProfile`, so such a record stays
   readable; acting on it as a job (`continue`) refuses with the line of item 5.
3. AC-5's command exits 0, but `test/s1-spawn.test.ts` alone passes at `HEAD`: its change only removes the four
   Devin cases of the cut feature, so it shows no new mechanism.
4. T-27: `runInternalJob` (`src/runtime/wrapper.ts:61-62`) keeps its two "split pending" suppressions; this ticket
   removes lines from it and splits nothing, as in R-002's Open points 6 (the plan leaves the ratchet to R-082 and
   R-083).
5. The refusal wording of both new lines is the main session's, for Adrian to confirm at gate 5.1 (`ticket.md` →
   `## Decisions`).
