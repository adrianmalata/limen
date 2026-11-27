<!-- PL: Wynik R-040 (noc 26/27.11, przy `c3290a0`, zamknięty w przebiegu 4): każdy tekst Limena w wiadomości kontekstowej, w cue
i w przypomnieniu o specyfikacjach pochodzi tylko z pakietu, a brak pliku pakietu rzuca błąd. Rejestr dzieli się na
`templates/registers/owner.md`, `agent.md` i `specs.md` według odbiorcy, `templates/agents.md` zmienia nazwę na
`templates/manual.md`, dryf i `templates/.history/` znikają, a kopie projektu stają się pozostałościami R-001.
`AGENTS.md` projektu trafia do wiadomości joba tylko przy stałej izolacji mostu, wyłączonej do R-048. Bramka 1351/1351;
wybory nocne i pliki spoza listy ticketu są niżej dla Adriana. Runda poprawek 1 (F1–F3) poprawia dwa komentarze
i jedno zdanie `docs/commands.md`, a runda 2 (G1) dwa komentarze i nazwę testu w `leftovers`, bez zmiany kodu. -->

# R-040 outcome

## Done

1. Registers (item 1). `templates/registers/owner.md` holds HEAD's `templates/communication.md` lines 5 and 7 and
   `## Human` with its `###` sections, `templates/registers/agent.md` holds `## Shared`, `## Agent` and `## Before you
   send`, `templates/registers/specs.md` holds `## Specs`, each moved unchanged (every non-empty line of the three
   files is a line of HEAD's worker reference, and the reference diffs show only moves and part headings).
   `templates/communication.md` keeps only the five `## Cue:` sections; its notes (`:3`, `## Turn cue convention`
   `:124-126`) are rewritten for the new layout as `CONTRIBUTING.md` → `## Registers and cues`.
2. Builder (item 2). `src/runtime/context-message.ts` reads every Limen text through `packageText(path)` (exported),
   a `readFileSync` under `packageRoot()`, so a missing file throws `ENOENT`; the capability frame reads through it
   too. Parts in order: `## Capability (limen/templates/capability.md)`, then `## Coordinator manual
   (limen/templates/manual.md)` or `## Role (limen/templates/<role>.md)`, `## Agent register (…/agent.md)`, `## Specs
   register (…/specs.md)` for the coordinator and the keeper (`SPECS_ROLES`), `## Owner register (…/owner.md)` for
   the coordinator, `## Vision (spec/vision.md)` for the coordinator, `## Styleguide (.agents/limen/styleguide.md)`,
   and `## Project context (AGENTS.md)` last for a job whose `bridgeIsolated` is true. `REGISTER_FILE`,
   `PACKAGED_REGISTER`, `shopManual`, `registerText` and the `inheritFile` import are gone.
3. Manual (item 3). `git mv templates/agents.md templates/manual.md`; lines 3, 47 and 80 say the manual, the roles
   and the registers come from the package. A project `AGENTS.md` no longer empties the coordinator's manual.
   `adrian-rebuild/tools/role-context.mjs`: `manual` joins `NOT_ROLES` (comment and `PL:` summary updated); the
   register files lie in `templates/registers/`, which `rolesOf` never lists.
4. Isolation (item 4). `src/runtime/engine.ts`: `export const BRIDGE_ISOLATED = false` and
   `runsBridgeIsolated(route)` (`route.bridged && BRIDGE_ISOLATED`) beside `engineRoute`. `ContextAudience`'s job
   variant gains `bridgeIsolated: boolean`; spawn's validate passes `runsBridgeIsolated(engineRoute(options.provider,
   options.model))`. The coordinator's audience has no such field, so its message never holds `AGENTS.md`.
5. Roles (item 5). `resolvePreamble` returns `templates/<role>.md` of the package or, after the removed-role check,
   refuses `ROLE_UNKNOWN` with `no preamble for role <role> in <package path>`. `src/registry.ts` (`--role`: "use
   templates/<role>.md of the package") and the comment of `OLD_ROLES` in `src/old-names.ts` follow.
6. Drift cut (item 6). `src/project/inherit.ts` keeps `packageRoot`, `removeHookCopies` and `readOptional`; `TRACKED`,
   `inheritFile`, `listDrift`, `formatDrift`, `templateHistoryText`, the revision readers, `digest`, `git`, the
   `Drift` type and the `child_process` and `crypto` imports are gone. The cue's drift block
   (`hook/communication.ts`) and `limen init`'s drift lines (`src/project/setup.ts`) are gone. `git rm -r
   templates/.history` (9 files), and `test/structure.test.ts` loses "shipped template history starts at the current
   template" with its `templateHistoryText`, `createHash` and `readdir` imports. The cue reads
   `templates/communication.md` and the specs reminder `templates/registers/specs.md`, both by `packageText`.
7. Leftovers (item 7). `src/project/leftovers.ts`: entries with the feature `role texts from the package (R-040)` for
   `.agents/limen/communication.md` and `.agents/limen/<role>.md` of `coordinator`, `group-member`, `judge`, `keeper`,
   `quality`, `researcher`, `reviewer`, `worker`, `picture` and `scout` (no marker, so any form); the identical-copy
   rule keeps one pair, `AGENTS.md` ↔ `templates/manual.md`; the overlap guard holds against the exported
   `PROJECT_FILES` (`AGENTS.md`, `CLAUDE.md`, `spec/vision.md`, `.agents/limen/styleguide.md`,
   `.agents/limen/limits.json`).
8. Text (item 8). `docs/setup.md` (`:62`, `:78`, `:152`, `### Overlays` removed, `### Hooks` names the three
   registers by role, the isolated-bridge `AGENTS.md` part and a missing package text), `docs/commands.md` (`:190`,
   `:301`), `CONTRIBUTING.md` (`:22`, `:29`, the history sentence and "unless they overlay" removed, the new
   `## Registers and cues`), `templates/manual.md` (`:3`, `:47`, `:80`); comments of `src/job/spawning.ts`,
   `src/old-names.ts`, `src/project/leftovers.ts` and `hook/communication.ts`.
9. Tests (item 9): `test/runtime/context-message.test.ts` (7 new: registers by role; a project register, a project
   `worker.md`, a project `AGENTS.md` change no message; with the value on a job's message ends with `AGENTS.md`; no
   maintainer note; a missing package text throws, for each of the five texts) and its 8 references regenerated;
   `test/hook/communication.test.ts` (3 new); `test/project/leftovers.test.ts` (4 new, the overlap tests on
   `PROJECT_FILES`); `test/cli/status.test.ts` (1 new, 1 changed); `test/cli/init.test.ts` (the drop test split into
   three, 1 new for `limen init`'s drift line); `test/cli/old-names.test.ts` (2 rewritten, 2 continuation tests plant
   their record); `test/job/spawning.test.ts` (new, 2); `test/s4-steering.test.ts` (project marker 0, package marker 1).

## Review fixes

Round 1 (`ticket.md` → `## Decisions` 13, by a fresh implementer; comments and documentation only, so no new test and
no `fails-before.mjs` run):
- F1: the comment on `PROJECT_FILES` (`src/project/leftovers.ts`) says what the list is, the project's own context and
  owner files that no entry may equal, hold or lie under, without "The project files Limen still reads".
- F2: `docs/commands.md` (`:190`) names the role copies the list holds as item 7 does: `.agents/limen/<role>.md` of the
  package's roles, written out (`coordinator`, `group-member`, `judge`, `keeper`, `quality`, `researcher`, `reviewer`,
  `worker`, as `ROLE_COPIES` writes them out, Deviations 6), and of the cut roles `picture` and `scout`.
- F3: the doc comment on `guidance()` (`hook/communication.ts`) says the specs register is read from the package only
  (A-038) and that for a project file the worktree's copy wins over the root's, without the circular clause.

Runs after the edits, from the repository root, each exit 0: `npx biome check --error-on-warnings
src/project/leftovers.ts hook/communication.ts` → "Checked 2 files … No fixes applied"; `npx tsc --noEmit` → no
output; `node --test test/project/leftovers.test.ts` → 18 tests, 18 pass; `node --test test/hook/communication.test.ts`
→ 16 tests, 16 pass. The gate is the main session's run.

Round 2 (`ticket.md` → `## Decisions` 14, by a fresh implementer; a comment and a test name, so no new test and no
`fails-before.mjs` run):
- G1: the registry comment in `src/project/leftovers.ts` and the `overlaps()` comment and the overlap test's name in
  `test/project/leftovers.test.ts` say a project context or owner file instead of a file "Limen still reads"; the test
  is now "LEFTOVERS entries overlap neither each other nor a project context or owner file", and no other tracked file
  names the old one (`git grep -n "overlap neither each other"` → only `test/project/leftovers.test.ts:233`).

Runs after the edits, from the repository root, each exit 0: `npx biome check --error-on-warnings
src/project/leftovers.ts test/project/leftovers.test.ts` → "Checked 2 files … No fixes applied"; `npx tsc --noEmit` →
no output; `node --test test/project/leftovers.test.ts` → 18 tests, 18 pass. The gate is the main session's run.

## Proof

The main session's runs (they count, protocol step 4), after the implementer's hand-back and `review-guard.mjs
compare --git` → exit 0 ("within its limits"):
- `node adrian-rebuild/tools/gate.mjs` → exit 0: `ℹ tests 1351`, `ℹ pass 1351`, `ℹ fail 0`, `ℹ cancelled 0`, `ℹ skipped
  0`, 307.7 s, no `gate:` line (AC-16).
- `node adrian-rebuild/tools/fails-before.mjs` on the eight files of AC-15 → exit 0, "fail at HEAD (exit 1)".
- After fix round 1 (F1–F3; `compare --git` → exit 0): `node adrian-rebuild/tools/gate.mjs` → exit 0, `ℹ tests 1351`,
  `ℹ pass 1351`, `ℹ fail 0`, `ℹ cancelled 0`, `ℹ skipped 0`, 305.0 s, no `gate:` line.
- After fix round 2 (G1; `compare --git` → exit 0): `node adrian-rebuild/tools/gate.mjs` → exit 0, `ℹ tests 1351`,
  `ℹ pass 1351`, `ℹ fail 0`, `ℹ cancelled 0`, `ℹ skipped 0`, 306.9 s, no `gate:` line.
- At the commit (review round 3 note 3): `node adrian-rebuild/tools/check.mjs` → exit 0, "0 errors" (ticket folders:
  70; changes: 58 entries); `npx biome check --error-on-warnings adrian-rebuild` → exit 0 (AC-17).

The implementer's runs after its last edit, from the repository root:
- `node adrian-rebuild/tools/gate.mjs` → `ℹ tests 1351`, `ℹ pass 1351`, `ℹ fail 0`, `ℹ cancelled 0`, `ℹ skipped 0`,
  313.4 s, no `gate:` line, biome "Checked 290 files … No fixes applied" (output read through `grep`, so the exit code
  is inferred from these lines; AC-16). Earlier gate runs are listed under Deviations 11.
- `node --test test/job/spawning.test.ts test/registry.test.ts` → 35/35 (after the registry fix).
- Before the gate, each file alone or in small groups, all exit 0: `test/job/spawning.test.ts`,
  `test/project/leftovers.test.ts`, `test/runtime/context-message.test.ts`, `test/hook/communication.test.ts`,
  `test/u13-guidance-reminder.test.ts` → 58/58 (AC-1, AC-2, part of AC-3 and AC-4); `test/cli/old-names.test.ts`,
  `test/cli/status.test.ts`, `test/cli/init.test.ts` → 81/81 (AC-3, AC-4); `test/s4-steering.test.ts`,
  `test/cli/continue.test.ts`, `test/cli/spawn.test.ts`, `test/structure.test.ts` → 101/101 (AC-5).
- `node --test adrian-rebuild/tools/test-context-size.mjs` → 3/3 (the row test fails without `manual` in `NOT_ROLES`).
- `npx tsc --noEmit` → no output; `npx biome check --error-on-warnings .` → "Checked 290 files … No fixes applied".
- AC-6 to AC-12: each `git grep` prints nothing; AC-10, AC-13 and AC-14 were also run with `--untracked`, since the
  register files are not yet tracked: no match in their paths.
- After this draft: `node adrian-rebuild/tools/check.mjs` → exit 0, "0 errors" (PL summaries: 322 files); `npx biome
  check --error-on-warnings adrian-rebuild` → exit 0, "Checked 36 files … No fixes applied" (AC-17).

## Fails before

`node adrian-rebuild/tools/fails-before.mjs test/runtime/context-message.test.ts test/hook/communication.test.ts
test/project/leftovers.test.ts test/cli/status.test.ts test/cli/init.test.ts test/cli/old-names.test.ts
test/job/spawning.test.ts test/s4-steering.test.ts` → exit 0 in the main session's run: "fail at HEAD (exit 1)"
(AC-15); its tail shows both tests of `test/s4-steering.test.ts` failing there, the worker's first model call with
`actual: [ 1, 1, 0, 1, 1 ]` against `expected: [ 1, 0, 1, 1, 1 ]` (styleguide, project register, package register,
capability frame, cue).

The unit files written first, run on the working tree before any source change (`node --test --test-reporter=tap
test/job/spawning.test.ts test/project/leftovers.test.ts test/runtime/context-message.test.ts
test/hook/communication.test.ts`) → 40 tests, 27 pass, 13 fail, each on its own assertion except the leftovers file:
- the three hook tests: the cue holds `Guidance drift` (`[true, true]` against `[true, false]`), the cue holds the
  project's `project-cue-marker` and not the package's shared cue, the reminder names the project's register;
- both `resolvePreamble` tests (the project file is returned; the message still says "write .agents/limen/…");
- `test/project/leftovers.test.ts` fails to load (`PROJECT_FILES` is no export of HEAD's module);
- the seven new context-message tests (no register headings, a project register, `worker.md` and `AGENTS.md` change
  the messages, no `AGENTS.md` part, the maintainer notes are present, HEAD's frame is silent without its file).
The CLI tests' new cases fail at HEAD by construction: HEAD lists no changed `.agents/limen/communication.md`
(status), keeps a changed `worker.md` and prints `## Guidance drift` (init), returns the project's picture or scout
file (old-names), and puts the project register's marker in the model's view (s4-steering).

## Deviations from the ticket / night defaults (category A of D-054 (2), for Adrian to confirm)

1. Part headings: `Coordinator manual` (T-18, the ticket's term; was `Shop manual`), `Agent register`, `Specs
   register`, `Owner register` (T-21's term), and `Project context (AGENTS.md)` for the isolated job's part. The
   manual's own title line `# Agent shop manual` stays (R-046's wording).
2. A missing package text throws Node's `ENOENT` with the full path (spawn ends as an internal error, exit 5, before
   publication; the hook's handler fails through `recorded`); no new typed code, so docs/commands.md's code table is
   unchanged.
3. `resolvePreamble` keeps its first parameter, now `_root` and unread, so every caller keeps its form, among them
   `role-context.mjs`, which calls the module of older refs too. The refusal's words: `no preamble for role <role> in
   <path of templates/<role>.md>` (the old line without the project path and "write … to add the role").
4. The continuation's fallback build (a parent folder without `context.md`, R-039's migration) passes
   `runsBridgeIsolated(engineRoute(provider, chosenModel))` of the continuation's own route; `carriedContext` takes
   the audience whole.
5. Names: `BRIDGE_ISOLATED`, `runsBridgeIsolated`, the audience field `bridgeIsolated`, `packageText`, `CUE_FILE`,
   `SPECS_REGISTER`, `AGENTS_FILE`, `PROJECT_FILES`; the register files carry no `#` title and the cue file no title.
6. The ticket's leftovers list is written out (`ROLE_COPIES`), not derived from `templates/` or `OLD_ROLES`, so a new
   template does not silently make a project file a leftover.
7. Files the ticket does not name, changed as consequences: `test/registry.test.ts` (`ROLE_UNKNOWN` leaves
   `WITHOUT_CODE_TEST`, which may only shrink, because the new `ROLE_UNKNOWN:` test proves the code and compares the
   shared snapshot, as T-38's scan requires); `test/cli/continue.test.ts` (the A-079 test plants a changed styleguide
   instead of a register, which no longer changes any message, so the test still tells carrying from rebuilding);
   `test/cli/old-names.test.ts`'s scout continuation test (as the picture one: no spawn can start a scout job now);
   `test/job/wake-text.test.ts` (a comment's path); `CONTRIBUTING.md:22` ("template inheritance").
8. `test/cli/init.test.ts`: the old drop test checked two mechanisms (an identical `AGENTS.md` dropped, a changed
   `worker.md` kept), so it is split (T-29 (3)) into "drops an identical AGENTS.md", "drops a changed worker.md" and
   "keeps a changed AGENTS.md".
9. The removed structure test: "shipped template history starts at the current template".
10. The references were regenerated without deleting them (`rm` is denied here): the golden test's write branch was
    made unconditional for one run (`--test-name-pattern="A-051"`, 8 written and failing), then restored; the
    references were then read as diffs (`git diff` of `judge.md` and `owner-facing-coordinator.md` whole, the stats of
    the others) and the test passed.
11. Gate runs: the first was cut by my own `| head -40` (the pipe closed, no summary, no process left, no new ignored
    file); the second ran in full and exited 1 with its output cut before the summary. A run of the seven test files
    that read the changed modules and docs found the failure: `test/registry.test.ts` "T-28 (1): every declared code
    has a test named CODE: …" and "T-38: every CODE test … compares the shared snapshot", both on the new
    `ROLE_UNKNOWN:` test (their input is the test names my change adds, so not a D-029 finding). After the fix (item 7
    above and the snapshot in the test) the third gate run passed (Proof). Whether the second run held another failure
    cannot be ruled out; the third ran every file.
12. The main session's reading of review round 1 note 1: the two "a changed `AGENTS.md` is kept" tests
    (`test/project/leftovers.test.ts`, `test/cli/init.test.ts`) pass at HEAD, which lists only byte-identical copies.
    `## Change` item 9 asks for "a changed `AGENTS.md` kept", and no test of a property HEAD already holds can fail
    there; they guard item 7's boundary ("a changed one never") from now on, as R-039's round 1 note 4 did.

## Unmeasured

- M-01: the laptop sizes of the references after this change (the main session records M-01 at the close of stage
  4): owner-facing coordinator 56,432 B (R-039: 57,339), worker 9,916 B (21,563), reviewer 6,839 B, judge 4,836 B,
  keeper 10,670 B, researcher 4,853 B, quality 4,764 B, group team 5,542 B.
- M-05 (same-task pass^k, seat 4.8): unmeasured; the owner register leaving the jobs changes prompt-driven behaviour.
- M-02 (one raw request per role, seat 4.8): unmeasured.

## Open points

1. `templates/manual.md:58` still says "the speech register's Specs section"; it stays true of the specs register,
   and the wording is R-046's.
2. The keeper is the only job role with the specs register; R-066 cuts the keeper, which leaves `SPECS_ROLES` empty.
3. `role-context.mjs`'s `preamble()` still prefers a project `.agents/limen/<role>.md` for the older refs' "Preamble"
   column; the message form measures through the ref's own `resolvePreamble`, so refs from R-040 on read the package.
4. Review round 3 note 1: the comment at `test/hook/communication.test.ts:364` calls the specs register "the text
   every role's message holds", though only the coordinator and the keeper get it (T-30 (1)); the reason F3 removed
   from the hook.
5. Review round 3 note 5: `src/project/inherit.ts` keeps its name, though it now holds only `packageRoot`,
   `removeHookCopies` and `readOptional` and inherits nothing (T-25 (1)); a rename is a later ticket's.
6. Review round 3 note 2 (present at `rebuild-base`): `--role` accepts any `templates/<name>.md`, the manual and the
   cue file included; it goes to the note of R-044 and R-045 in `plan.md` → `## Tickets`.
7. For Adrian at gate 5.4: Deviations 1–12, above all 2 (a missing package text ends a spawn with exit 5, kept against
   review round 1 note 5) and 3 (the `ROLE_UNKNOWN` refusal's words).
