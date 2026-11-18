<!-- PL: Wynik ticketu R-004 (szkic implementera): wycięty silnik OMP (`--engine omp`), czyli jego profil, konfiguracja
skilli przez `omp config get`, trwała powłoka w liczniku komend, wieloplikowa edycja i selektor odczytu w hookach,
zdarzenie `session_stop`, kopia stuba w `.omp/extensions/limen.ts` oraz OMP w dokumentacji i runbooku seata (wariant a).
Tabela starych nazw dostała `omp`, a rejestr pozostałości plik `.omp/extensions/limen.ts`. Plik podaje dowody (bramka
96/96, wcześniej 95/95), testy padające przed zmianą, usunięte testy, odstępstwa i punkty otwarte. Stan: zamknięty;
recenzja rundy 1 FAIL, pięć poprawek (a)–(e) naniesionych, bramka po nich 96/96, recenzja rundy 2 PASS. -->

# Outcome: R-004 Cut the OMP engine

## Done

- Deleted with `git rm` (item 1): `.omp/extensions/limen.ts`. The empty `.omp/` folder of the repository went with it.
- `src/runtime/engine.ts` (item 2): `EngineId` is `"pi"`, `binaryEnv` is `"LIMEN_PI"`, and the `omp` profile is gone.
  `engineProfile` accepts `pi` and otherwise throws `removedEngine`'s line or its own `unknown engine <id>`;
  `resolveSpawnEngine` accepts `pi` and otherwise throws `removedEngine`'s line or `--engine must be pi`. The OMP
  `pi-claude` provider refusal is gone, the missing-bridge error is Pi's text (the same bytes a Pi spawn got at `HEAD`),
  and the missing-binary error reads `pi is not on PATH; install it`. `LegacySkill`, `legacySkill`,
  `prepareSkillConfig`, the `skillConfig` slot and its `--config` argument are gone, with the imports only they used
  (`mkdir`, `readdir`, `rm`, `stat`, `symlink`, `writeFile`, `basename`). The realpath dedupe of `--extension` paths
  is unconditional. `engineRoute` and `bridgePath` lost the OMP rewrite and the `~/.omp/local/…` candidate, and with
  them their `profile` parameter (Deviations 4).
- Launch paths (item 3): `src/runtime/wrapper.ts` and `src/runtime/supervisor.ts` lost the `prepareSkillConfig` import
  and the `skillConfig` lines. `src/runtime/worker-extensions.ts` lost the "supported only for Pi workers" refusal and
  the `engine` parameter of `normalizeWorkerExtensions` and `readWorkerExtensions`; every caller dropped the argument
  (`spawn.ts` through `launchExtensions`, `continue.ts` through `continuationExtensions`, `group.ts:313`,
  `worker-extensions.ts:43`, `supervisor.ts`, `wrapper.ts`). `group.ts:313` called `resolveSpawnEngine` only to pass
  that argument; every team has a route whose engine `teamRouteFlag` already resolved (`group.ts:108`, `:229`).
- `src/job/session-commands.ts` (item 4): `KEPT`, the `omp` flag, `held` and `keptWord` are gone; `firstWord` stays for
  `chainWhy`; the doc of `sessionRuns` names Pi's transcripts only. For a Pi record `kept` was always empty at `HEAD`,
  so the reason of every command is the same.
- Hooks (item 5): `hook/communication.ts` reads one `path` for a write or an edit; the read regex lost its `:selector`
  capture (`/^.*\.md$/i`), and the OMP selector parse and `lineRange` are gone; Pi's `offset`/`limit`, the `[Showing
  lines` form and the `file_path` shape stay. `hook/finish.ts` lost the `session_stop` overload, its handler,
  `StopEvent` and the `assistantStopReason` import (still used by `hook/communication.ts`, `stream.ts` and
  `supervisor.ts`); its comment names `agent_before_settle` only and drops `xd://finish`.
- Other code (item 6): `src/picture/activity.ts` reads Pi's `provider`/`modelId` only; `src/project/picture-watch.ts`
  `KEEP` dropped `OMP|`; `src/commands/init.ts` copies only the `.pi` stub and no longer refuses the two
  `.omp/extensions/control-*.ts` files (the `.control`, `.agents/control` and `.pi` ones stay); `src/main.ts` names
  `--engine pi` and dropped the two "Pi only" qualifiers. The comments at `spawn.ts:804`,
  `watch.ts:7`, `group-cabinet.ts:206`, `wake-text.ts:51` and `:95`, `github-review.ts:79` and `hosted-binding.ts:35`
  give the remaining reason (a coordinator or lead without `PI_SESSION_ID`; Herdr can omit `interactive_ready`; other
  platforms); no code there changed.
- Item 7: `OLD_ENGINES` holds `{ name: "omp", feature: "the OMP engine", ticket: "R-004", instead: "use --engine pi" }`;
  `LEFTOVERS` holds `.omp/extensions/limen.ts` with the feature `the OMP engine (R-004)` and a comment on why only the
  file is listed.
- Docs and templates (item 8): `README.md`, `CONTRIBUTING.md`, `SECURITY.md`, `docs/commands.md`, `docs/groups.md`,
  `docs/herdr-status.md`, `docs/jobs.md`, `docs/picture.md`, `docs/remote.md`, `docs/setup.md` (the integration list,
  the stub, the skills table and the OMP skill view, the engine order, the bridge and auth paragraphs, the project
  files list), `docs/seat/README.md`, `templates/agents.md:95`, `:105`, `:188` and `templates/worker.md:9`.
  `templates/.history/agents.md` and `templates/.history/worker.md` got the new hashes as first lines (`3dc0a23f…`,
  `58a78e8e…`, 2026-11-18), written with Edit (D-016). `docs/jobs.md:194` became "Platform limit" with "another
  platform" for the case the code still has (`hostedBindingSupported` needs a boot id); it no longer names macOS, which
  is not an engine but was in the same sentence.
- Seat runbook `docs/seat/agent-setup.md`, variant (a): the worker-owned OMP install with its checksums, the
  `.local/bin` PATH line and the `LIMEN_ENGINE=omp` line became one bullet, `**Check:** worker$ \`pi --version\` prints
  \`1.5.1\`. **STOP** if not.`; "Do not install omp as root" and the three OMP items of the phase 4 Check are gone;
  `MODEL_FLAGS` says the flags go to both `pi` and `limen spawn`; the login step starts `pi`; `limen init`'s list
  dropped `.omp/extensions/limen.ts`; `moshi-hook install`; `herdr integration install pi`; both coordinator starts are
  `pi $MODEL_FLAGS`; the live-coordinator rule says Herdr can leave out `interactive_ready`; the smoke spawn has no
  `--engine`. No install procedure was added.
- Tests (item 9): see `## Tests removed with the cut` and `## Fails before`.
- Review round 1 (`ticket.md` → `## Decisions`, items (a)–(e)):
  - (a) `templates/agents.md:188`: the sentence "On a job that already ended, `watch` says no wake will follow" is
    gone. It held only on a Herdr pane route (`src/commands/watch.ts:33-41`), and a Pi session route is still woken
    for an ended job it subscribes to. The first line of `templates/.history/agents.md` holds the new hash
    (`3dc0a23f…`), changed with Edit.
  - (b) `docs/jobs.md:122`: "Pi writes the transcript as …" instead of "Both engines write the transcript as …".
  - (c) `docs/setup.md:92`: `limen spawn` takes `--engine pi` or `LIMEN_ENGINE=pi` and refuses any other value of
    either before a job exists; a continuation keeps its parent's engine and refuses a parent recorded with a removed
    engine. `LIMEN_ENGINE` is read only through `resolveSpawnEngine` with no flag (`src/runtime/engine.ts:52`), and
    `limen continue` resolves only an explicit `--engine` (`src/commands/continue.ts:356-361`).
  - (d) `src/runtime/supervisor.ts:99`: the comment reads "A platform that never binds has no ownership to lose; …";
    it no longer names a second engine.
  - (e) `docs/seat/agent-setup.md:202`: the reference for `--no-extensions` is `src/runtime/engine.ts`, with no line
    number.

## Proof

Main session's runs after the implementer's completion notification (protocol steps 3 and 4):
`review-guard.mjs compare --git node_modules/.rebuild-review/R-004.git <ticket.md>` → exit 0 ("within its limits");
`node adrian-rebuild/tools/gate.mjs` → exit 0; tests 96, pass 96, fail 0, cancelled 0, skipped 0 (68.0 s). The main
session accepts Deviations 1: the detached row of the same test already reads Pi's `provider`/`modelId` form, and the
hosted row still shows that a hosted folder is read through `tool-detail`. After the fixes (a)–(e) of review round
1: `compare --git node_modules/.rebuild-review/R-004-fix1.git <ticket.md>` → within its limits; `gate.mjs` → exit 0,
tests 96, pass 96, fail 0 (66.5 s).

Implementer's runs, from the repository root:

- `node adrian-rebuild/tools/gate.mjs` before the change, on HEAD plus the main session's `plan.md` edit → exit 0;
  tests 95, pass 95, fail 0, cancelled 0, skipped 0 (66.8 s).
- After the change, first run → exit 1; tests 96, pass 95, fail 1: "hosted Pi stop records stopped once and closes
  the job's tab" (`test/s2-hosted.test.ts`), `actual: [ 2, 1 ], expected: [ 3, 1 ]`. Cause and fix: Deviations 2.
- After that fix → exit 0; tests 96, pass 96, fail 0, cancelled 0, skipped 0 (66.5 s).
- `npx tsc --noEmit` → exit 0. `npx biome check --error-on-warnings .` → exit 0 (163 files).
- `node adrian-rebuild/tools/check.mjs` → exit 0, 0 errors. `npx biome check --error-on-warnings adrian-rebuild` →
  exit 0.
- AC-1: `git ls-files -- .omp/extensions/limen.ts | grep -q .` → exit 1.
- AC-2: the ticket's `git grep -q -i -E '\bomp\b|oh-my-pi|LIMEN_OMP|\.omp/' -- src hook bin templates test docs
  README.md CONTRIBUTING.md SECURITY.md package.json .gitignore ':!…'` with its seven exclusions → exit 1. At `HEAD` it
  matched 42 files, each changed here.
- AC-3: `git grep -q -E 'prepareSkillConfig|legacySkill|skillConfig|keptWord|lineRange|session_stop' -- src hook test
  bin` → exit 1.
- AC-4: `node --test test/cli/old-names.test.ts` → exit 0, 5 of 5 pass. AC-5: `node --test
  test/project/leftovers.test.ts` → exit 0, 10 of 10 pass. Both also pass in the gate run.
- AC-6: `node adrian-rebuild/tools/fails-before.mjs` → exit 0: "test/cli/continue.test.ts, test/cli/init.test.ts,
  test/cli/old-names.test.ts, test/cli/status.test.ts, test/group-extensions.test.ts, test/s1-spawn.test.ts,
  test/s10-doorbell.test.ts, test/s2-hosted.test.ts, test/s4-steering.test.ts, test/s6-keeper.test.ts,
  test/s8-groups.test.ts, test/structure.test.ts, test/u11-live-activity.test.ts, test/u13-guidance-reminder.test.ts,
  test/u14-task-note.test.ts, test/u5-engine-stream.test.ts fail at HEAD (exit 1)". Per file: `## Fails before`.
- By hand, in an empty scratch directory with a private `LIMEN_HOME` and `HOME`: `limen --help` has no line that
  matches `\bomp\b|Pi only` (0 matches); `limen spawn --engine claude work` prints `--engine must be pi` (exit 1);
  `limen spawn --engine omp work` and `limen group start F001 --team omp:x/y:high` print `engine omp was removed with
  the OMP engine (R-004); use --engine pi` (exit 1); both directories stayed empty.
- After the round-1 fixes (no full gate; the main session runs it): `npx biome check --error-on-warnings
  src/runtime/supervisor.ts` → exit 0; `node --test test/structure.test.ts` in the gate's environment (its private
  `TMPDIR` and the git shim of `gate-env.mjs`) → exit 0, 2 of 2 pass; `node adrian-rebuild/tools/check.mjs` → exit 0;
  `npx biome check --error-on-warnings adrian-rebuild` → exit 0.

## Fails before

Main session's run (protocol step 4), `node adrian-rebuild/tools/fails-before.mjs` → exit 0:

```
fails-before: test/cli/continue.test.ts, test/cli/init.test.ts, test/cli/old-names.test.ts, test/cli/status.test.ts,
test/group-extensions.test.ts, test/s1-spawn.test.ts, test/s10-doorbell.test.ts, test/s2-hosted.test.ts,
test/s4-steering.test.ts, test/s6-keeper.test.ts, test/s8-groups.test.ts, test/structure.test.ts,
test/u11-live-activity.test.ts, test/u13-guidance-reminder.test.ts, test/u14-task-note.test.ts,
test/u5-engine-stream.test.ts fail at HEAD (exit 1)
✖ limen status lists a .omp/extensions/limen.ts left by the cut OMP engine as a leftover file
    actual: false, expected: true
✖ S10: only an authorized request rings the doorbell, the App replies once each way and never approves
    actual: 1, expected: 0
```

(Shortened and wrapped: stack frames and the plant's temporary path are left out. The run counts all changed files
together; which of them fail at `HEAD` alone, and why S10's failure there says nothing of this change, is below and
in Open points 3.)

The new tests were written before any source change and run with `node adrian-rebuild/tools/fails-before.mjs
test/plant.ts test/cli/<file>`, one file at a time (`test/plant.ts` still at `HEAD` then); each → exit 0:

```
✖ spawn with a removed engine in --engine or in LIMEN_ENGINE refuses with one removal line and makes no job
  AssertionError [ERR_ASSERTION]: spawn --engine omp work   (actual: 0, expected: 0, operator: 'notStrictEqual')
✖ limen continue of a finished job recorded with the removed engine omp refuses with its line and starts no job
  AssertionError [ERR_ASSERTION]: continued commit · continue in 2026-11-18-commit-a83e834e's session
  (actual: 0, expected: 0, operator: 'notStrictEqual': at HEAD the continuation starts)
✖ limen status lists a .omp/extensions/limen.ts left by the cut OMP engine as a leftover file
  AssertionError [ERR_ASSERTION]: … (no `Leftover files` section in the status output; actual: false, expected: true)
✖ limen init in a new repository writes the Pi extension stub and no .omp/ folder
  actual: [ true, true ], expected: [ true, false ]
```

(Shortened: stack frames and the plant's paths are left out. The old tests in the same four files passed.)

After the change, each changed test file was run alone the same way, with `test/plant.ts` and `test/fake-engine.mjs`
of the working tree (`fails-before.mjs test/plant.ts test/fake-engine.mjs <file>`):

- Fail at `HEAD` (exit 0): the four files above, each on its new test only. `old-names` and `continue` now fail with
  `'omp is not on PATH; install it, or pass --engine pi\n'` instead of the removal line, because the new plant has no
  `omp`.
- `test/s10-doorbell.test.ts` also fails at `HEAD`, but not because of this change: the first `limen github poll`
  (`:138`) exits 1 before the `--engine` line is reached. `fails-before.mjs` unpacks `HEAD` below the system temp
  directory, and the poller refuses its own code below a group- or world-writable directory (`privatePath`,
  `src/integrations/github-poller.ts:125-135`, called at `:754`). Open points 3.
- Pass at `HEAD` alone (exit 1), each because its change only removes OMP cases or moves a test from `--engine omp` to
  Pi, which `HEAD` also runs: `test/group-extensions.test.ts` (one OMP case gone, test renamed),
  `test/s1-spawn.test.ts` (two OMP cases gone), `test/s2-hosted.test.ts` (two hosted OMP tests gone, the tab count
  follows), `test/s4-steering.test.ts` (the old `.omp` hook copy and its assertion gone), `test/s6-keeper.test.ts`
  and `test/s8-groups.test.ts` (`--engine pi`, `pi:` teams), `test/structure.test.ts` (the `.omp` exclusion gone; at
  `HEAD` only one `limen.ts` is scanned), `test/u11-live-activity.test.ts` (Pi default, OMP model case gone),
  `test/u13-guidance-reminder.test.ts` (Pi's one `path` and `offset`/`limit`, which `HEAD` reads the same way),
  `test/u14-task-note.test.ts` (the `session_stop` half gone), `test/u5-engine-stream.test.ts` (three OMP assertions
  gone, test renamed).

## Tests removed with the cut

Before 95 tests, after 96: 2 removed, 3 added.

Removed (`test/s2-hosted.test.ts`, item 9; both hosted, which R-005 cuts next):
1. "a live OMP job stays running while Herdr reports done, then after Herdr loses its agent row (88fd5ac)".
2. "two competing sweeps start exactly one replacement for a killed hosted supervisor (5754dad)".

With them went `let second`, the helpers `starts` and `alive`, and the `existsSync` import, which only they used.

Added: one test each in `test/cli/continue.test.ts`, `test/cli/status.test.ts` and `test/cli/init.test.ts`.

Changed, not removed:
- `test/cli/old-names.test.ts`: the Devin spawn test runs over a written-out table of both removed engines (`devin`,
  `omp`) and is renamed "spawn with a removed engine in --engine or in LIMEN_ENGINE refuses with one removal line and
  makes no job".
- "each spawn refusal exits 1, names its cause and leaves no job, worktree or branch" (`test/s1-spawn.test.ts`) loses
  its two OMP cases (`--engine omp --extension`, `LIMEN_ENGINE=omp` with a `pi-claude` provider); six stay.
- "invalid group selections never activate or consume jobs, including later teams" (renamed from "…, including later
  teams and OMP"; `test/group-extensions.test.ts`) loses its OMP start.
- "a pi-claude route loads Pi's installed bridge package" (renamed from "…; OMP gets it as one pi-claude/<model> id";
  `test/u5-engine-stream.test.ts`) loses its three OMP assertions; its file's opening line names Pi's bridge.
- "the reader reads detached and hosted job folders the same way" (`test/u11-live-activity.test.ts`): Deviations 1.
- "a second init removes old hook copies, …" (`test/s4-steering.test.ts`) loses the `.omp` copy and the `.omp`
  assertion; the `.pi` ones stay.
- `test/u14-task-note.test.ts` checks only `agent_before_settle` on the hosted job; `test/u13-guidance-reminder.test.ts`
  uses Pi's forms; `test/s6-keeper.test.ts`, `test/s8-groups.test.ts` and `test/s10-doorbell.test.ts` run Pi.
- "hosted Pi stop records stopped once and closes the job's tab" (`test/s2-hosted.test.ts`): Deviations 2.
- Fixtures: `test/plant.ts` links only `pi`; `test/fake-engine.mjs` lost the `config` subcommand;
  `test/structure.test.ts` lost the `.omp` exclusion.

## Deviations from the ticket

1. `test/u11-live-activity.test.ts:97-99`: the ticket says the three lines go. Line 98 (`"tool-detail": "git log\n"`)
   stays: `hook/hosted.ts:164` writes that file for every hosted job, so it is what makes the folder a hosted one, not
   OMP. Lines 97 (`engine: "omp\n"`) and 99 (the session file with OMP's `model` form) go, and the expected row of the
   hosted folder changes its model from `pi-claude/claude-opus-5-5` to `""`, because the folder now has no session
   file. This is the folder as the test first had it (`d3e8321`); `aced13e` added the OMP model case. Deleting all
   three lines leaves a folder with no hosted file under a test named "detached and hosted job folders read the same
   way", and the row would need a change the ticket does not name either. The file's opening line says "detached and
   hosted job folders" instead of "job folders of both engines".
2. `test/s2-hosted.test.ts`, "hosted Pi stop records stopped once and closes the job's tab": `[3, 1]` became `[2, 1]`.
   The count of `tab create` calls runs over the whole file, and the removed OMP job made one of the three tabs. The
   first gate run after the change failed only on this assertion; the change removed the job behind the third tab, so
   it was a consequence of the change, not a test that failed without a change of the code it runs (D-029). The
   second run passed 96 of 96.
3. `test/group-extensions.test.ts:158-161`: line 158 is the closing brace of the loop above; lines 159-161 (the OMP
   start and its assertion) went.
4. `src/runtime/engine.ts`: `engineRoute` and `bridgePath` lost their `profile` parameter, whose only use was the OMP
   branch (`noUnusedParameters`); both are called only in `engine.ts`. `src/runtime/supervisor.ts`: the local
   `worktree` (`requiredEnvironment("LIMEN_WORKTREE")`) went with the `skillConfig` line, its only reader;
   `hostedEngineLaunch` runs only after `hostedTarget` has required the same variable (`:137`), so no condition
   changed.
5. `test/cli/old-names.test.ts`: the refusal lines are written out in the test (`ENGINE_REFUSALS`) rather than read
   from `OLD_ENGINES`, so a change of wording fails the test; the table test below it already covers every
   `OLD_ENGINES` entry through `engineProfile`.

## Measurement

- unmeasured, M-01: the coordinator manual and the worker prompt shrink: `templates/agents.md` 45,992 → 45,384 bytes,
  `templates/worker.md` 7,093 → 7,075 bytes. M-01 is measured by the main session when it closes the stage.
- M-10 (gate run time): 66.5 s in this run (66.8 s before the change); recorded at the close of the stage.
- unmeasured: the listing and drop of `.omp/extensions/limen.ts` in the two projects (`plan.md` → `## Deployment`
  1.1). The status test and AC-5 show it on a project fixture. No M-NN covers it.
- unmeasured: the seat's `LIMEN_ENGINE` and Moshi target (Open points 1). No M-NN covers them.

## Open points

1. For Adrian, on the seat, before a0.1.0 is deployed (ticket `## Migration` and `## Decisions`): on the worker
   account run `grep -n LIMEN_ENGINE ~/.bashrc`; remove a line `export LIMEN_ENGINE=omp` (the runbook at `HEAD` wrote
   it, `docs/seat/agent-setup.md:146`), or every spawn without `--engine` refuses with `engine omp was removed with the
   OMP engine (R-004); use --engine pi`. Check which Moshi target the seat's hook uses (the runbook at `HEAD` installed
   `--target omp`). A picture-watch hook installed with `--engine omp` in its flags refuses at each tick. Limen no
   longer reads, outside the projects: the worker-owned `~/.local/bin/omp` and its PATH line in `~/.bashrc`, `~/.omp`
   (OMP's auth store and its local bridge at `~/.omp/local/pi-claude-bridge`), the Herdr OMP integration, and
   `LIMEN_OMP` wherever the seat sets it.
2. `EngineProfile` keeps `toolYolo` (`--auto-approve`) and `noTitle` (`--no-title`), both false in the only profile, so
   their branches in `argvFor` (`src/runtime/engine.ts:105-107`, `:112-114`) never run; `projectTrust`, `sessionName`
   and `authCheck` are always true. The ticket does not name them, so they stay; R-048 rewrites the job argv.
3. `adrian-rebuild/tools/fails-before.mjs` cannot show S10 passing at `HEAD`: it unpacks `HEAD` below the system temp
   directory, and the poller refuses code below a group- or world-writable directory. Any ticket that changes
   `test/s10-doorbell.test.ts` gets "fails at HEAD" from it whatever the change.
4. T-27: `runInternalJob` (`src/runtime/wrapper.ts:61-62`) and the S10 test (`test/s10-doorbell.test.ts:98`) keep their
   "split pending" suppressions; this ticket removes lines from the first and changes one line in the second, and
   splits nothing, as in R-003's Open points 4 (the plan leaves the ratchet to R-082 and R-083).
5. `HOOK_COPIES` (`src/project/inherit.ts:27-29`, out of scope) still lists the three old `.omp/extensions/limen-*.ts`
   copies, so `limen init` keeps removing them; `docs/setup.md` says it deletes old `limen-*.ts` hook copies without
   naming the folders.
6. Wording left as it is because it holds for one engine and lies outside the lines the ticket names: "selected
   engine" in `docs/jobs.md:43`, `docs/setup.md:140`, `src/main.ts:109`, `templates/agents.md:82-83`, `:114` and
   `templates/worker.md:10`; "ordinary Pi list" in `src/main.ts:114`.
7. The refusal wording is the main session's, for Adrian to confirm at gate 5.1 (`ticket.md` → `## Decisions`).
8. `docs/setup.md:92` says `limen spawn` refuses any other value of `--engine` or `LIMEN_ENGINE`; the flag wins, so
   `LIMEN_ENGINE` is read and refused only for a spawn without `--engine` (review round 2, rejected note: R-014 sets
   with Adrian whether both stay, R-081 regenerates the docs).
