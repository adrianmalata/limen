<!-- PL: Wynik R-044 (implementer, 27.11, przy `0787824`, szkic): sześć modułów (github, group, picture, workspace,
research, quality) ma przełączniki w polu `modules` pliku `.agents/limen/limits.json`, domyślnie wyłączone. Wyłączony
moduł nie daje tekstu do wiadomości kontekstowej (tekst modułów przeniesiony do `templates/modules/<moduł>/<plik
części>`), nie rejestruje haka (`src/runtime/hook-set.ts`), a jego polecenia i role odmawiają kodem `MODULE_OFF`;
`github poll` pomija projekt z wyłączonym modułem. Pomoc pokazuje `[on]`/`[off]`, a `limen migrate` raportuje moduły w
użyciu. Runda poprawek 1 (decyzja 19, F1–F5): nieczytelny plik przełączników jest błędem `LIMITS_UNREADABLE`, a nie
wyłączeniem; przypomnienie Specs dokleja plik specs włączonego modułu; hooki i wiadomość koordynatora czytają
przełączniki z jednego korzenia bez gita; `spawn --repo` i `keeper --group` odmawiają przy wyłączonym module. Runda
poprawek 2 (decyzja 20, G1–G7): kontynuacja i keeper zadania z repozytorium workspace odmawiają przed pierwszym zapisem;
nieczytelny plik w trakcie zadania kończy je jako `internal` bez utraty zdarzeń; raport migracji nazywa uszkodzone
rekordy archiwum; dokumentacja i ostatnie zdania modułów poprawione. Runda 3 recenzji: PASS; sesja główna poprawiła
dokumentację (kod wyjścia `LIMITS_UNREADABLE`, linie uszkodzonych rekordów) i krok 4.9 planu, a trzy uwagi wymagające
kodu są w punktach otwartych 8–10. Stan: zamknięty, bramka sesji głównej 1429/1429. -->

# R-044 outcome

## Done

1. Switches (Change 1): `src/project/limits.ts` reads an optional `modules` object of one boolean per module.
   `plantLimits` returns `{ limits, modules, ignored }`, where `modules` is the set switched on. It is empty with no
   file, no field, or a field that is not an object. A switch is read on its own, as each limit is: an unknown name or a
   value that is not a boolean is ignored, with a typed `BadData` naming `modules.<key>`. To do this, `eachField`
   (`src/boundary.ts`) now takes readers of different types and the path of the object it reads (`field`). No
   environment variable is read. Round 1, F1: the file is read by `limitsText`, where only `ENOENT` and `ENOTDIR` mean
   no file (T-01). Any other read error, such as `EISDIR` or `EACCES`, throws `LIMITS_UNREADABLE` (class environment,
   exit 4), with the file and the reason. Before, `readOptional`'s bare `catch` read it as "every module off" and as no
   limits.
2. The module policy (Change 2): `src/project/modules.ts`, new. It holds `MODULES` in the help's order, `isModule`,
   `moduleTitle` ("GitHub module", …), `modulesOn`, `moduleOn` and `requireModule`. `requireModule` throws
   `MODULE_OFF` (class refused, `next: null`) with the text `the <name> module is off in this project; the owner
   switches it on in .agents/limen/limits.json ("modules": {"<name>": true})`. It reads that one file and starts no
   process. It imports `limits.ts`, which takes `MODULES` back only inside a function, as `boundary.ts`/`outcome.ts`
   already do.
3. The role table (Change 3): `src/runtime/roles.ts`, new. `JOB_ROLES` lists worker, reviewer, judge (research),
   researcher (research), quality (quality), keeper, coordinator (group) and group-member (group).
   `requireRoleModule(root, role)` refuses a module's role while its module is off.
4. Refusals (Change 4):
   - `src/main.ts`: one shared step, `requireEntryModule`, runs after the help and before `entry.handler`. For an entry
     whose `object` is a module, it calls `requireModule` with the project the command acts on: the `root` positional
     when the schema declares one and it is given (Decision 17), else `projectRootAt(cwd)`. The new registry field
     `eachProject` exempts `github poll`.
   - `src/registry.ts`: every module entry declares `MODULE_OFF`, through `MODULE_SWITCH`, except `github poll`. `spawn`
     and `continue` declare it too.
   - `src/integrations/github-poller.ts`: the pass skips a registered project whose `github` switch is off and prints
     `<root>: skipped: the github module is off in this project`. A limits file it cannot read throws
     `LIMITS_UNREADABLE` inside the project's `try`, so the pass names that project as failed, with its reason, and goes
     on (F1). The comment says so.
   - Round 1, F5: `spawn --repo` refuses `MODULE_OFF` while `workspace` is off (`checkSpawnModules` in spawn's validate,
     beside the role check), and `keeper --group` refuses it while `group` is off, before the keeper reads the group or
     makes its branch. The keeper's entry declares `MODULE_OFF`.
   - `src/job/spawning.ts` and `src/job/continuation.ts` call `requireRoleModule` in their validate, right after the
     role is known.
   - `src/project/git.ts`: `projectRootAt(cwd)` returns a group member's root (`limenRoot`), else a job's
     `LIMEN_CONTEXT_ROOT`, else the workspace, else the Git toplevel, else the cwd itself. It never throws
     `NOT_A_PROJECT`, so a folder outside every project reads no switch file (Decision 18 (1)). `repoRoot` now uses
     the shared `gitToplevel`.
5. Hooks (Change 5): `src/runtime/hook-set.ts`, new.
   - `hookSet` names the coordinator set (`wake`, `communication`, plus `group-peer` with group on) and the job set
     (`finish`, `steering`, `communication`, `rate-limit`, plus `group-peer` for a member).
   - `ownHooks(cwd)` serves a hook factory, which gets no context: it uses `LIMEN_JOB` and `LIMEN_GROUP_ID`, or the
     group switch of the coordinator's `sessionRoot(cwd)` (Decision 18 (3)).
   - Round 1, F3: `sessionRoot(cwd)` is `LIMEN_CONTEXT_ROOT`, else the session's cwd, with no git call. The hooks'
     switches and the coordinator's context message (`hook/communication.ts`, all three places that took
     `LIMEN_CONTEXT_ROOT ?? context.cwd`) read the same root. `hook/steering.ts` returns when `LIMEN_JOB` is not 1,
     before it reads any switch.
   - `src/runtime/wrapper.ts` maps a job's set to `hook/<name>.ts` and no longer names any hook.
   - `hook/steering.ts` and `hook/group-peer.ts` return at the top of their factory when their set excludes them.
     Steering's own `LIMEN_JOB` check inside `session_start` went, since it can no longer fail.
   - The stub is byte-identical (`cmp templates/limen-extension.ts .pi/extensions/limen.ts` → exit 0).
   - Round 1, F2: after an edit under `spec/`, the specs reminder appends each enabled module's specs file
     (`templates/modules/<module>/specs.md`) after the `## Specs` section. Each file gets a header line
     `[limen] <Title> module (limen/templates/modules/<module>/specs.md lines 1-N): check this edit against these rules.`
     and comes once per context, as a section does (A-041). `src/runtime/context-message.ts` exports `enabledModules`
     and `moduleFiles`, so the reminder and the message find the same files.
6. Module text (Change 6):
   - `src/runtime/context-message.ts` appends, right after each part, the package file
     `templates/modules/<module>/<basename of the part's file>` for each module that is on, in `MODULES` order. Each one
     is its own part headed `## <Title> module (limen/templates/modules/…)`.
   - The files: `group/manual.md`, `group/keeper.md`, `github/manual.md`, `github/reviewer.md`, `workspace/manual.md`,
     `quality/manual.md`, `research/manual.md`, `picture/manual.md`, `picture/worker.md`, `picture/coordinator.md`,
     `picture/keeper.md` and `picture/specs.md`.
   - Moved, sentence by sentence:
     - from `templates/manual.md`: lines 9, 19, 21-32, 38-40, 66-68, 88 and 148; the group and GitHub clauses of line
       74; "Group launches start at once." (76); the group sentence of 86, after which the rest of 86 is rewritten so
       that it reads whole; the map sentence of 142; three sentences of 146; and the Research section.
     - from `templates/worker.md:14-16` and `templates/coordinator.md:12-14`: front matter, place ids and
       `picture build`. The core keeps "Check: `limen ticket check` … (source: `limen ticket check`)".
     - from `templates/keeper.md`: the map files, front matter, place ids, map, strict check and stop and end clauses
       go to picture; the group ticket sentence of line 9 goes to group.
     - `templates/reviewer.md:5`: the GitHub clause.
     - `templates/registers/specs.md:13`: the front-matter bullet. Line 20 now reads "only the front matter changes".
   - "Never start research unprompted." went (gate 2 §6).
   - `src/commands/keeper.ts`: the `Map:` line names the map only when it exists and `picture` is on.
7. Help (Change 7): `MODULES_HEADER` reads "Modules: off by default; the owner switches them on in limits.json" (D-122
   (1)). Each module line opens with `[on]` or `[off]`. `commandOf` takes the cwd, and the general help and the
   unknown-command help read the switches of `projectRootAt(cwd)`. Without a cwd, as in the tests' `next` reader, every
   module is `[off]`. `docsSections` renders every module off. The workspace summary is now "a folder outside Git with
   several Git repositories; each job works in one (--repo)" (Decision 18 (2)). The D-040 comment went. The generated
   section of `docs/commands.md` was regenerated.
8. Migration report (Change 8): `limen migrate` and `--dry-run` print the six module lines and the switch line right
   after the first line (Decision 18 (4)). The evidence is:
   - `github`: `.limen/github/binding.json`;
   - `group`: the first `.limen/groups/<id>/run.json`, with the folder listed through `jobFolderNames` (the T-25 listing
     scan);
   - `picture`: `.limen/picture/`;
   - `workspace`: `spec/workspace.md` in a root that is no Git repository;
   - `research` and `quality`: a record of their role from `JOB_ROLES`, among the records the folder steps leave and
     the archive's records; a damaged archived record (`BAD_DATA`) is counted and named by G5 (item 11).

   It writes no `limits.json`, and `next` does not change.
9. Text (Change 9):
   - `docs/setup.md`: a new `### Modules` section with the field, the names, what "off" means, when a switch takes
     effect (a command at once, a hook at `/reload` or a new session, the context message only in a new session),
     `github poll`'s skip, and switching `group` off only with no open run. Line 60 now says steering no longer loads in
     a coordinator. The workspace steps now switch the module on first.
   - `docs/jobs.md`: line 31 (the group lead row), the limits file, and the migration report.
   - `docs/groups.md:29`, `docs/remote.md:14`, `:16` and `:176`, `docs/seat/agent-setup.md:211`,
     `docs/seat/README.md:96` and `docs/picture.md` (a new paragraph).
   - The `refused` row of the exit-code table of `docs/commands.md`, and `CONTRIBUTING.md` (where module text lives).
   - The refusals `GROUP_LEAD_ONLY`, `GROUP_NO_LEAD` and `GROUP_LEAD_HOOK` (`src/job/group-control.ts`) and
     `SPAWN_LEAD_ROLE` (`src/job/spawning.ts`) also name the group switch.
   - Round 1, F4: `docs/remote.md`'s setup block (before its first `limen github doctor`) and its steps at `:133` and
     `:141` switch the `github` module on before `limen github connect`. F4 is text, so it has no test.
10. Tests (Change 10):
    - `test/plant.ts`: `plant({ modules })` commits the switches in the plant's first commit, and `switchModules(root,
      modules)` writes them in any folder.
    - New: `test/project/modules.test.ts` and `test/runtime/hook-set.test.ts`.
    - Changed: `test/project/limits.test.ts`, `test/registry.test.ts`, `test/help.test.ts`, `test/cli/group.test.ts`,
      `test/cli/github.test.ts`, `test/cli/spawn.test.ts`, `test/cli/continue.test.ts`, `test/cli/keeper.test.ts`,
      `test/runtime/wrapper.test.ts`, `test/hook/group-peer.test.ts`, `test/runtime/pi-api.test.ts`,
      `test/runtime/context-message.test.ts` (with the new reference `worker-picture.md`; five references regenerated
      for the moved text) and `test/cli/migrate.test.ts`.
    - Plants that only switch modules on: `test/cli/picture.test.ts`, `test/cli/old-hosted.test.ts:157`,
      `test/cli/status.test.ts`, `test/cli/workspace.test.ts`, `test/group-extensions.test.ts`,
      `test/job/group-control.test.ts`, `test/s1-spawn.test.ts`, `test/s6-keeper.test.ts`, `test/s8-groups.test.ts`,
      `test/s9-housekeeping.test.ts` and `test/s10-doorbell.test.ts`.
    - `test/s3-finish-wake.test.ts` and `test/project/limits.test.ts` expect the unknown-field message to name
      `modules` too.
    - Round 1:
      - F1: `LIMITS_UNREADABLE: a limits file that is a folder fails the read …` (`test/project/limits.test.ts`);
        `github poll names a registered project whose limits file cannot be read as failed …`
        (`test/cli/github.test.ts`); `LIMITS_UNREADABLE: group start in a project whose limits file is a folder …`
        (`test/cli/group.test.ts`).
      - F2: `A-041: with the picture module on the specs reminder appends its specs file …`
        (`test/hook/communication.test.ts`).
      - F3: `a coordinator whose working directory holds the group module on loads group-peer and gets the Group module
        text, both from that folder` (`test/runtime/hook-set.test.ts`, a folder below the top of a Git repository);
        `in a coordinator's session the steering factory registers no handler and starts no process` (new
        `test/hook/steering.test.ts`, which counts `spawnSync`, `execFileSync` and `spawn` through
        `syncBuiltinESMExports`).
      - F5: `MODULE_OFF: a workspace spawn with --repo and the workspace module off …` (`test/cli/spawn.test.ts`, with
        the snapshot of the child repository plus the workspace's `.limen/` and `spec/`); `MODULE_OFF: keeper --group
        with the group module off …` (`test/cli/keeper.test.ts`, whose group test now switches `group` on).
    - Round 2:
      - G1: `MODULE_OFF: a continuation of a workspace job after the workspace module went off …`
        (`test/cli/continue.test.ts`); `MODULE_OFF: keeper of a workspace job with the workspace module off exits 1,
        never makes its branch …` (`test/cli/keeper.test.ts`). The child repository's `reference-transaction` hook
        logs every ref change, so a branch made and then deleted by the cleanup shows too.
      - G2: `a limits file that becomes unreadable while the job runs ends it failed, kind internal, naming the file,
        and loses no event` (`test/runtime/wrapper.test.ts`). The folder replaces the file while the fake engine waits
        at `block`, before its first tool.
      - G5: `the report names a damaged archived record it could not read and calls the modules a job role shows
        unknown` (`test/cli/migrate.test.ts`).
      - G7: the reference messages of the owner-facing coordinator and the keeper were regenerated, and the F2 test
        counts the lines of the picture specs file, now two.
11. Round 2 (Decision 20), the last round of fixes:
    - G1: `requireJobModules(root, { role, repo })` (`src/runtime/roles.ts`) refuses a module's role, and a job in a
      workspace repository while `workspace` is off. Spawn calls it in its validate step (it replaces round 1's
      `checkSpawnModules`), and so does `limen continue`, with the parent record's `repo`. `limen keeper` calls it
      for its first job right after it reads the jobs, before its branch (its `--group` check already came first).
      The `refuses` of `continue` and `keeper` already declare `MODULE_OFF`.
    - G2: the wrapper reads the tool cap and the stall window through `runningLimit` (`src/runtime/wrapper.ts`).
      On `LIMITS_UNREADABLE` it ends the job through `exhaust`, failed, kind `internal`, with the message that names
      the file, and returns no limit. So the tool start being recorded keeps its count, progress and log line, the
      rest of its batch is recorded, and no "log write failed" line is written for it. The stall tick takes its window
      from `TickContext.windowMs`. Any other error goes on.
    - G3: `docs/setup.md` → "When a switch takes effect" adds that the specs reminder reads the switches at each tool
      result, while the set of hooks follows at `/reload` or a new session.
    - G4:
      - `docs/setup.md`'s module paragraph names F5's and G1's refusals, `github poll`'s skip against the other
        `limen github` commands, and `LIMITS_UNREADABLE` (a command, a job, the poll's project).
      - `docs/jobs.md`'s limits file names `LIMITS_UNREADABLE`.
      - `docs/remote.md:122` and `:143` and `docs/seat/agent-setup.md:211` say the poll skips while the other
        commands refuse.
      - The closing line of `docs/seat/github-setup.sh` names the switch before `limen github doctor`
        (`bash -n` → exit 0).
    - G5: the migration's module report counts the archived records it cannot read (`BAD_DATA`). With any, it prints
      `job archive: <n> damaged record(s) not read` after the module lines, and a module whose evidence is a job role
      (research, quality) without evidence reads `unknown (<n> damaged record(s))`, not "not in use". The report's
      field is `damagedRecords`.
    - G6: `docs/remote.md` step 4 grants `limen-github` traverse on each project's `.agents/` and `.agents/limen/`,
      and read on its `limits.json`. It also says that a file it cannot read makes every pass name that project as
      failed. The `plan.md` check is the main session's.
    - G7: "only the front matter changes when …" left `templates/registers/specs.md`, and
      `templates/modules/picture/specs.md` gained a **Progress** bullet. "or the group brief" left
      `templates/manual.md:119`, and `templates/modules/group/manual.md` gained the sentence on a group's outside
      paths.

## Proof

Each test file ran with `node --test <file>` in the gate's environment, with the private `TMPDIR` of
`adrian-rebuild/tools/gate-env.mjs`, on the final tree. `test/cli/github.test.ts`'s poll tests need that `TMPDIR`: under
`/tmp` the poller refuses its own path ("unsafe owner or permissions on /tmp"), at `HEAD` too.

Counts after round 2's fixes. A file that rounds 1 and 2 did not change has its count from before them, and one that
only round 1 changed has its count from after round 1.

- AC-1: `test/project/limits.test.ts` → exit 0, 11/11; `test/project/modules.test.ts` → exit 0, 4/4.
- AC-2: `test/runtime/hook-set.test.ts` → exit 0, 3/3; `test/runtime/wrapper.test.ts` → exit 0, 32/32.
- AC-3: `test/hook/group-peer.test.ts` → exit 0, 4/4; `test/runtime/pi-api.test.ts` → exit 0, 36/36.
- AC-4: `test/help.test.ts` → exit 0, 13/13; `test/registry.test.ts` → exit 0, 34/34.
- AC-5: `test/cli/group.test.ts` → exit 0, 22/22; `test/cli/github.test.ts` → exit 0, 30/30.
- AC-6: `test/cli/spawn.test.ts` → exit 0, 31/31; `test/cli/continue.test.ts` → exit 0, 20/20;
  `test/cli/keeper.test.ts` → exit 0, 5/5.
- Round 1's other test files: `test/hook/steering.test.ts` → exit 0, 1/1; `test/hook/communication.test.ts` → exit 0,
  35/35.
- AC-7: `test/runtime/context-message.test.ts` → exit 0, 24/24; `test/cli/migrate.test.ts` → exit 0, 31/31.
- AC-8: `node adrian-rebuild/tools/fails-before.mjs <the 15 files>` → exit 0 (`## Fails before`).
- AC-9: `git grep -q 'MODULES_HEADER = "Modules"' -- src/registry.ts` → exit 1.
- AC-10: `git grep -q 'limen group\|limen workspace\|--role researcher\|--role judge\|--role quality\|\.limen/picture\|picture build\|doorbell' -- templates/manual.md` → exit 1.
- AC-11: `git grep -q 'Never start research unprompted' -- templates` → exit 1.
- AC-12: `git grep -q 'group-peer' -- src/runtime/wrapper.ts` → exit 1.
- AC-13: `git grep -q 'picture build' -- templates/worker.md templates/coordinator.md templates/keeper.md` → exit 1;
  `git grep -q 'doorbell' -- templates/reviewer.md` → exit 1.
- AC-14: `node adrian-rebuild/tools/gate.mjs --out <scratch file>` → exit 0, 1429/1429 tests, 355.3 s, on the tree
  after round 2's fixes. After round 1's fixes: exit 0, 1425/1425, 330.3 s. Before round 1: exit 0, 1417/1417, 372.2 s, and the run before that, during which only a
  test's name changed, also exit 0, 1417/1417, 359.6 s. The suite had 1,386 tests at R-043's gate.
  The main session's gates, which count (protocol step 4; `node adrian-rebuild/tools/gate.mjs --out
  node_modules/.rebuild-review/R-044.gate`): before round 1 → exit 0, 1417/1417 (374.9 s); after F1–F5 → exit 0,
  1425/1425 (343.6 s); after G1–G7 → exit 0, 1429/1429 (347.6 s). `fails-before.mjs` after each → exit 0. After round 3
  the main session changed only `docs/commands.md`, `docs/jobs.md`, this file, `review.md` and `plan.md` (D-053 (2));
  `node --test test/help.test.ts`, which reads `docs/commands.md`, → exit 0, 13/13.
- AC-15: `npx biome check --error-on-warnings .` → exit 0 (294 files); `npx biome check --error-on-warnings
  adrian-rebuild` → exit 0; `node adrian-rebuild/tools/check.mjs` → exit 0, "0 errors".
- `npx tsc --noEmit` → exit 0. `cmp templates/limen-extension.ts .pi/extensions/limen.ts` → exit 0.
- The first full run after the change, before the plants switched modules on, failed 27 tests in 13 files:
  `test/cli/picture.test.ts`, `old-hosted`, `status`, `workspace`, `test/group-extensions.test.ts`,
  `test/job/group-control.test.ts`, `s1`, `s3`, `s6`, `s8`, `s9`, `s10` and `test/structure.test.ts`, the listing scan
  of `readdir` in the migration. Each had a cause in this change: a module command or role with its module off, the
  unknown-field message, the scan. Each was fixed by switching the module on in its plant, by the message, or by
  listing groups through `jobFolderNames`. None was run again to get it green: they ran again only after their fix.

## Fails before

- `node adrian-rebuild/tools/fails-before.mjs test/project/limits.test.ts test/project/modules.test.ts
  test/runtime/hook-set.test.ts test/runtime/wrapper.test.ts test/hook/group-peer.test.ts test/runtime/pi-api.test.ts
  test/help.test.ts test/registry.test.ts test/cli/group.test.ts test/cli/github.test.ts test/cli/spawn.test.ts
  test/cli/continue.test.ts test/cli/keeper.test.ts test/runtime/context-message.test.ts test/cli/migrate.test.ts` →
  exit 0 ("… fail at HEAD (exit 1)"), run twice: after the tests were written, before any change but the `eachField`
  signature, and on the final tests (AC-8).
- The tool prints only the tail of the run. So the same 15 files, with the whole working-tree `test/` (the plant
  helper and the reference files included), also ran over a `git archive HEAD` copy in the gate's environment (private
  `TMPDIR`). Result: exit 1, 223 tests, 190 pass, 33 fail. By file:
  - `test/project/limits.test.ts`: the 5 new tests, and the unknown-key test, whose message now also names `modules`;
  - `test/project/modules.test.ts`, `test/runtime/hook-set.test.ts`, `test/runtime/wrapper.test.ts` and
    `test/registry.test.ts`: the whole file, since `src/project/modules.ts`, `src/runtime/roles.ts` or
    `src/runtime/hook-set.ts` does not exist;
  - `test/hook/group-peer.test.ts`, the off test: `handlers: ['session_start', 'tool_call', 'tool_result', …]`;
  - `test/runtime/pi-api.test.ts`, the steering test: `['hook/steering.ts on session_start 0', 'hook/steering.ts on
    session_shutdown 1']` instead of `[]`;
  - `test/help.test.ts`: both goldens and the docs section (no `[off]`, the header "Modules");
  - `test/cli/group.test.ts`: `MODULE_OFF: group start …`, `actual: 0 … class: 'ok'` (the group started);
  - `test/cli/github.test.ts`: `MODULE_OFF: github status …` (exit 0) and the poll skip (the off project was polled and
    failed on its own: "github connect requires an origin remote");
  - `test/cli/spawn.test.ts`: `MODULE_OFF: a researcher spawn …` (exit 0, class ok), and the reference `context.md`
    test, whose worker reference lost the picture lines;
  - `test/cli/continue.test.ts`: `MODULE_OFF: a continuation …`, and the reference test of a parent without
    `context.md`;
  - `test/cli/keeper.test.ts`: `'Map: …/repo/.limen/picture'` instead of `'Map: none'`;
  - `test/cli/migrate.test.ts`: both module-line tests (`'nothing to do: …'` where `'module github: not in use'` was
    expected);
  - `test/runtime/context-message.test.ts`: the five references that lost module text (owner-facing coordinator,
    worker, reviewer, keeper, group team) and the three module tests.

Round 1 (Decision 19), each test written before its fix:

- On the round-1 tree, before F1–F5 (the 8 files that hold them, in the gate's environment): exit 1, 137 tests, 129
  pass, 8 fail, each for its finding:
  - F1, `test/project/limits.test.ts`: "Missing expected exception" (the folder read as no file).
  - F1, `test/cli/github.test.ts`: `actual: 3, 'GITHUB_NETWORK', false` (the broken project was skipped as switched
    off, so the worst failure was the other project's 503).
  - F1, `test/cli/group.test.ts`: `actual: 1 … 'MODULE_OFF'` instead of exit 4, `LIMITS_UNREADABLE`.
  - F2, `test/hook/communication.test.ts`: the reminder ended after the `## Specs` section, with no picture specs
    file.
  - F3, `test/runtime/hook-set.test.ts`: `actual: false` for group-peer's `session_start` (the factory read the
    switch at the Git top, where none is on, while the message read the cwd).
  - F3, `test/hook/steering.test.ts`: call counts `[1, 0, 0]` instead of `[0, 0, 0]` (one `spawnSync` of
    `git rev-parse`).
  - F5, `test/cli/spawn.test.ts` and `test/cli/keeper.test.ts`: `actual: 0 … class: 'ok'`, the job or the keeper
    started.
- `node adrian-rebuild/tools/fails-before.mjs test/project/limits.test.ts test/cli/github.test.ts
  test/cli/group.test.ts test/hook/communication.test.ts test/runtime/hook-set.test.ts test/hook/steering.test.ts
  test/cli/spawn.test.ts test/cli/keeper.test.ts` → exit 0 ("… fail at HEAD (exit 1)").
- After F1–F5, the same 8 files with `test/hook/group-peer.test.ts`, `test/runtime/pi-api.test.ts`,
  `test/runtime/context-message.test.ts` and `test/registry.test.ts` → exit 0, 235/235.

Round 2 (Decision 20), each code fix's test written before its fix:

- On the round-1 tree, before G1, G2 and G5 (`continue`, `keeper`, `wrapper` and `migrate` test files, gate
  environment): exit 1, 88 tests, 84 pass, 4 fail, each for its finding:
  - G1, continue: `actual: 0, class: 'ok', ids: { job: '…-commit-continue-…' }`; the continuation started.
  - G1, keeper: exit 1 with `MODULE_OFF` from the spawn, but the hook's log holds
    `refs/heads/limen/keeper-f001-…` made and deleted.
  - G2, wrapper: `'done' !== 'failed'`; the cap's error dropped the tool event as "log write failed", and the job
    ran on.
  - G5, migrate: `'module research: not in use'` where `'unknown (1 damaged record)'` and the archive line were
    expected.
- `node adrian-rebuild/tools/fails-before.mjs test/cli/continue.test.ts test/cli/keeper.test.ts
  test/runtime/wrapper.test.ts test/cli/migrate.test.ts` → exit 0 ("… fail at HEAD (exit 1)").
- G3, G4 and G6 are text, and G7 is template text that the regenerated references and the existing context-message
  tests hold. None of them has a test of its own.

## Deviations from the ticket

1. Decision 17: the shared step reads the switch of the project in the `root` positional when it is given.
2. A job's root is its `LIMEN_CONTEXT_ROOT`, not its worktree's checkout. `projectRootAt` prefers `LIMEN_CONTEXT_ROOT`
   when it is set, so a worker or keeper running `limen picture build` in its worktree reads the project's live file.
   The limits come from that file too (`limitMs`, `limitCount`), and so do `ticket-check.ts`'s plant root and, since
   round 1's F3, every hook's `sessionRoot`. Read literally, "the project at the cwd" would read the worktree's committed copy, which
   lacks a switch the owner wrote in the coordinator's checkout and did not commit (seat step 4.9 edits the file
   directly).
3. `test/s6-keeper.test.ts`, "picture build --strict --dir takes a plant root from any folder …": the command runs
   from `p.parent`, outside every project. That folder now switches `picture` on (`switchModules(p.parent,
   ["picture"])`), because by Decision 17 a `--dir` flag does not name the project whose switch is read. The
   assertions are unchanged.
4. Tests that pass at `HEAD` by their nature. They guard the order or the on side, and the ticket names them:
   - `limen group --help` and `limen group start --help` with group off;
   - a researcher spawn with research on;
   - the keeper's `Map:` with picture on;
   - group-peer with group on;
   - the wrapper's argv (the job set equals the old list).

   Each file still fails before as a whole (`## Fails before`).
5. Text outside the places Decision 16 lists, moved by the same rule: the keeper's group sentence (line 9) to
   `group/keeper.md`; the keeper's stop and end clauses to `picture/keeper.md`; manual line 76's "Group launches start
   at once." and line 86's group sentence to `group/manual.md`; the specs register's line 20 ("picture front matter" →
   "front matter"). `templates/manual.md:119` ("the ticket or the group brief") and `:7` ("never … a group lead")
   stay: their subject is no module's.
6. `CONTRIBUTING.md` and `docs/picture.md` are not in Change 9's list. They say where module text lives and what the
   picture switch does (T-30).
7. Round 1, F3 (Decision 19), against Decision 18 (3) as first written: a coordinator's hooks read the switches at
   `sessionRoot(process.cwd())`, which is `LIMEN_CONTEXT_ROOT` or the cwd, not at the Git top of the cwd. So a
   coordinator started in a subfolder of its repository reads that subfolder's limits file, as its context message
   always did.
8. Round 1, F1: a limits file that cannot be read now fails every reader of the file, not only the module switches.
   The limits readers (`limitMs`, `limitCount`, the job setup's log of ignored entries, the tool cap at each tool
   start) end with `LIMITS_UNREADABLE` where they used to fall back to the defaults. Decision 19 puts the change in
   `plantLimits`, which serves both. Since round 2's G2, a running job that reads a limit then ends failed, kind
   `internal`, through the wrapper's `exhaust`, with the event being recorded kept whole.
9. Round 2, G1: the keeper checks the switches its own job needs from its first job's `repo`, the repository its job
   runs in (`repo: first.repo` of its spawn), right after it reads the jobs. A group of jobs in several workspace
   repositories is no case the keeper serves: it works in one repository.
10. Round 2, G5: the counts read "1 damaged record" and "2 damaged records", by number, where Decision 20 writes
    "<n> damaged records".

## Unmeasured

- Seat step 4.7 (`plan.md` → `## Deployment`): whether Pi on the seat, which loads the project stub through project
  trust, gets no `group-peer` handler, lead file or timer with every module off. The fake's in-process test shows the
  factory; Pi's own loading is a seat fact. The ticket's API is `pi`, and step 4.7 is its deployment step (T-28 (5)).
- Seat step 4.9: which modules synchronizer and ledger use. `limen migrate --dry-run` lists them; the owner switches
  them on.
- Whether the GitHub App user that runs `github poll` can read each project's `.agents/limen/limits.json`. If it
  cannot (`EACCES`), the pass names that project as failed with `LIMITS_UNREADABLE` and its reason, not as skipped,
  and the poll ends with exit 4 (F1; its test shows `EISDIR` on a fixture): the seat check is in `plan.md` →
  `## Deployment` 4.9 since round 3.
- The size of the context message per role (M-01): the reference messages, every module off, shrink from 56,198 to
  48,924 bytes for the owner-facing coordinator, 10,670 → 8,893 for the keeper, 9,916 → 9,378 for the worker, 5,542 →
  5,004 for the group team and 6,839 → 6,715 for the reviewer. M-01's own measurement is the main session's at the
  close of stage 4. The model's behaviour with the shorter manual: M-05.

## Open points

1. T-27 (1): `groupPeer` (`hook/group-peer.ts`) and `runInternalJob` (`src/runtime/wrapper.ts`) keep their "split
   pending" suppressions. This ticket adds an early return to the first and changes one list in the second, and splits
   neither (the ratchet is R-082's, as in R-002, R-003, R-005 and R-034).
2. Front matter: Decision 16 counts `templates/worker.md:14`, `templates/keeper.md:11` and the specs register's
   front-matter line as picture text, so they moved. The land check still reads front matter with picture off, through
   `src/picture/tickets.ts`, until R-080 or R-061 (Out of scope). So with picture off, a worker or keeper learns a bad
   front matter only from the land check's lines, and the manual's "It fixes the ticket front matter there." stays.
3. A `limen picture build --dir <project>` run from a folder outside every project refuses `MODULE_OFF` unless that
   folder switches picture on (deviation 3). If `--dir` should name the project as `root` does, that is a change of
   Decision 17.
4. The help's group title (`limen group --help` → "group: several agents on one ticket") shows no `[on]`/`[off]`. Only
   the general help's module lines do, as Change 7 says.
5. Round 1 finding 6 is not fixed by Decision 19: Open point 1 stands.
6. Round 1's open point on a continuation of a workspace job is closed by G1.
7. Round 2, note 3 (not fixed by Decision 20): `limen` commands read a coordinator's switches at its project root
   (`projectRootAt`, the Git top or the workspace), while its hooks and its context message read them at the session's
   cwd (`sessionRoot`). The two differ only for a coordinator started below its repository's top. A coordinator starts
   in its project root (`docs/setup.md`), and R-050's coordinator start script fixes the coordinator's root.
8. Round 3, note 1 (code; D-092): with `picture` off, the keeper's packet still opens "Fix the ticket, board and map
   links for this work" next to `Map: none` (`src/commands/keeper.ts:96`), and so does the keeper's help summary
   (`src/registry.ts:684`). The keeper is cut by R-066 (`limen spec fix` replaces it), which removes both.
9. Round 3, note 2 (code; D-092): `docs/seat/github-setup.sh:92-99` grants `limen-github` traverse only on each project
   root and its parents, not on `.agents/` and `.agents/limen/`, and no read on `limits.json`; `docs/remote.md` step 4
   names the grant, and `plan.md` → `## Deployment` 4.9 checks the read on the seat, so a restrictive umask shows at
   that step instead of as `LIMITS_UNREADABLE` in every poll. The script's own grant is for the ticket that next
   changes the GitHub module's seat setup.
10. Round 3, note 6 (code, guessed; D-092): `limen migrate` reads the archived records for the module report after its
    folder steps and marker writes, so a read error other than `BAD_DATA` (an `EACCES`) would end the run after those
    writes without the report of what it moved. `## Deployment` 0.4's dry run meets the same error first, before any
    write.
