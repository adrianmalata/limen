<!-- PL: Ticket R-040 (A-038, A-039, A-042, D-005, D-025): każdy tekst Limena przychodzi tylko z pakietu. Rejestr dzieli
się na trzy pliki według odbiorcy (właściciel tylko dla koordynatora, agent dla każdej roli, specyfikacje dla
koordynatora i keepera), plik projektu nie zastępuje już rejestru, instrukcji koordynatora ani preambuły roli, porada o
dryfie i `templates/.history/` znikają, a `templates/agents.md` zmienia nazwę na `templates/manual.md`. Plik `AGENTS.md`
projektu trafia do wiadomości kontekstowej joba tylko przy jednej fladze izolacji mostu, wyłączonej do R-048; stare
kopie w projektach stają się pozostałościami R-001. Stan: napisany 26.11 przy `e26fac2` z inwentarza
`evidence/inventories/R-040.md`; sprawdzony w nocy 26/27.11 przy `c3290a0` (AC-10, AC-13 i AC-14 dopasowane do zakresu,
domyślna nocna decyzja 12); poprawki recenzji F1–F3 i G1 w decyzjach 13 i 14; `done`. -->

# R-040 Role texts come from the package, in three registers

## Problem

A-038's Decision, quoted (`audit.md:1037`): "One communication style for all of Limen (package only, same for every
project), delivered in the Limen context message (A-086) and split by audience into three registers: **owner** (Human,
reporting work; coordinator only), **agent** (Shared, Agent, Before you send; every role), **specs** (coordinator and
keeper only). Maintainer notes (`templates/communication.md:3`, `:124-126`) move out of the injected text into
documentation. A disabled module contributes no sections."

A-039's Decision (`audit.md:1051`): "fix (removal) — Project override of the register is cut (unused on the seat); the
project `styleguide.md` stays." D-004: "the register override is cut (A-039). The coordinator keeps answering in
Adrian's language through normal conversation."

A-042's Decision (`audit.md:1093`): "The coordinator manual and role prompts always come from the package (delivered in
the Limen context message, A-086); overrides by `AGENTS.md`, `.agents/limen/worker.md`, `.agents/limen/reviewer.md`
are cut. Limen guarantees that the project's `CLAUDE.md` and `AGENTS.md` (if present) reach every role as project
context, next to Limen's instructions, never instead of them: under the bridge, Claude Code loads `CLAUDE.md` and the
bridge forwards the nearest `AGENTS.md`, so Limen does not duplicate them and a seat check proves it (§9); with an
engine that loads neither, Limen includes them in the context message. Drift tracking and its prompt advisory are cut;
`limen status` lists leftover template copies once; `limen init --drop-leftovers` removes them."

D-005: "jobs run the bridge in isolated mode, so the A-042 fallback applies to them: the project's `AGENTS.md`, if it
exists, goes into the Limen context message". The note of `## Tickets` (`plan.md:2029-2031`): "R-040 builds the rule
from a launcher flag, and R-048 turns isolation on, so the file never arrives twice. Neither project has an `AGENTS.md`
today (gate 2 §1)." E-15: "In isolated mode the bridge forwards no `AGENTS*` file at all". D-025: "the full check `git
grep -q '"templates/agents.md"' -- src hook` → exit 1 joins R-040's criteria, because R-040 removes
`hook/communication.ts:307`." Gate 2 §1 (`audit.md:134-136`): "No `.agents/limen/communication.md`, `worker.md`,
`reviewer.md`, `reminders.md` or `AGENTS.md` in either project … The drift advisory never fires on the seat."

Rules: T-01 (errors never vanish), T-13 (the owner register's language rule is R-041's), T-18 (one word per thing: the
"coordinator manual"), T-21 (the term `owner`), T-25 (1), T-29, T-30, T-36 (the hook starts no process while the
message is built), T-38. Conventions: "`Mig. yes`: an on-disk change … comes with a script and a test on a fixture";
"Role prompt text changes in the ticket whose mechanism it describes (A-085)".

Facts at `aa721d7` (inventory sections 1–4; line numbers in files R-039 changes will move):
1. Every Limen text has a project override: the register through `inheritFile(cwd, ".agents/limen/communication.md",
   "templates/communication.md")` for the system block and every cue line (`hook/communication.ts:227-248`); a job's
   preamble `.agents/limen/<role>.md` before `templates/<role>.md`, and a project file also adds a role
   (`src/job/spawning.ts:115-125`, refusal `:123`); a project `AGENTS.md` makes the manual empty
   (`hook/communication.ts:256-262`; D-025's grep matches `:260` and `src/project/inherit.ts:18`).
2. Every role gets the whole register above `## Cue:` (`readRegister`, `:227-235`): `## Shared` `:9`, `## Specs` `:19`,
   `## Human` `:44` (with `### Reporting work`), `## Agent` `:99`, `## Before you send` `:109`, `## Turn cue convention`
   `:124`, then the cue sections `:128-150`; two unheaded lines `:5` and `:7`; maintainer notes `:3` and `:124-126`.
   Sizes: owner 6,940 B, agent 2,433 B, specs 3,420 B.
3. Drift: `TRACKED`, `listDrift`, `formatDrift` and the revision readers in `src/project/inherit.ts:16-22`, `:66-201`
   (`git log`/`git show` through `spawnSync`, else `templates/.history/`, 9 files kept by `test/structure.test.ts:1680-1693`);
   read by every coordinator cue (`hook/communication.ts:214-218`) and by a plain `limen init`
   (`src/project/setup.ts:96-99`).
4. A missing package text is silent: `inheritFile` returns `undefined` and the part is dropped
   (`src/project/inherit.ts:59-62`, `hook/communication.ts:159`, `:229-231`, `:261`).
5. `limen init` copies only `styleguide.md` (`src/project/setup.ts:67-78`); R-001's `LEFTOVERS`
   (`src/project/leftovers.ts:23-51`) forbids an entry that holds a `TRACKED` path (`:14-22`) and lists byte-identical
   `TRACKED` copies (`:58-67`).
6. Nothing isolates the bridge yet: `engineRoute` (`src/runtime/engine.ts:136-141`) decides `bridged`; the argv still
   passes `--approve` (`:90-92`); `JOB_SETS` holds no `CLAUDE_BRIDGE_*` name (`src/config.ts:355-381`).
7. Text made false: `templates/agents.md:3`, `:47`, `:80`; `docs/setup.md:62`, `:78`, `:152`, `:163-175` (`###
   Overlays`), `:179`; `docs/commands.md:301`; `CONTRIBUTING.md:35`; `src/registry.ts:227` (`--role` help);
   `src/old-names.ts:259-261`; comments `src/job/spawning.ts:110-114`, `src/project/leftovers.ts:14-22`, `:53-57`,
   `:108-111`, `hook/communication.ts:44`, `:237`, `:250`, `:461`.

R-039 gives this ticket `src/runtime/context-message.ts` (today's parts moved unchanged), the job's `context.md` built
at spawn's publication, and the reference files under `test/runtime/context-message/` ("every later ticket that changes
a part's text updates its reference file", R-039 `## Change` 6).

## Change

1. Registers (A-038): three package files, `templates/registers/owner.md` (`## Human` with `### Reporting work`, and the
   unheaded lines `:5` and `:7`, moved unchanged), `templates/registers/agent.md` (`## Shared`, `## Agent`, `## Before you
   send`) and `templates/registers/specs.md` (`## Specs`), each a part with its own `## <Label> (<path>)` heading.
   `templates/communication.md` keeps only the `## Cue:` sections (R-041 rewrites them); its maintainer notes (`:3`,
   `:124-126`) move to `CONTRIBUTING.md`.
2. `src/runtime/context-message.ts` (R-039): every part is read from the package, never from a project copy; a missing
   package text throws (a broken install: spawn fails before publication, the coordinator's session start fails
   loudly, T-01). The registers by role: coordinator owner, agent and specs; keeper agent and specs; every other role
   (worker, reviewer, judge, researcher, quality, the group roles) agent only. Order: frame, the manual or the role
   text, agent, specs, owner, vision, styleguide, and the project's `AGENTS.md` last (z. 3).
3. The manual: `git mv` of `templates/agents.md` to `templates/manual.md` (T-18: the "coordinator manual"; a package file
   named `agents.md` is why a project `AGENTS.md` became its override); a project `AGENTS.md` no longer empties it.
   `adrian-rebuild/tools/role-context.mjs` (R-039's role list) keeps roles only, not `templates/manual.md` or the
   register files.
4. `AGENTS.md` (D-005, E-15): one exported constant beside `engineRoute` in `src/runtime/engine.ts`, `false` until R-048
   turns isolation on, and one function "this route runs the bridge isolated" (`bridged` and the constant); spawn's
   publication passes its result to the builder, which then adds the project's `AGENTS.md` from the project root,
   bounded and headed like vision. The builder takes the value as a parameter, so a test drives both. The coordinator's
   message never holds it. R-048 builds `CLAUDE_BRIDGE_ISOLATED=1` from the same function.
5. Roles: `resolvePreamble` (`src/job/spawning.ts`) reads only `templates/<role>.md`; a role with no package template
   refuses with `ROLE_UNKNOWN`, without "write .agents/limen/<role>.md to add the role"; `src/registry.ts:227` (`--role`
   help) and `src/old-names.ts:259-261` follow.
6. Drift is cut (A-042): `TRACKED`, `listDrift`, `formatDrift`, `templateHistoryText`, `templateRevisions`,
   `gitRevisions`, `parseRevisions`, `serializeRevisions`, `digest`, `git` and the `Drift` type leave
   `src/project/inherit.ts`, so nothing there starts a process; the cue's drift block (`hook/communication.ts:214-218`)
   and `limen init`'s drift lines (`src/project/setup.ts:96-99`) go; `templates/.history` goes (`git rm -r`), with the
   history test of `test/structure.test.ts` (named in `outcome.md`). The cue and the specs reminder read the package's
   files (`templates/communication.md`, `templates/registers/specs.md`).
7. Leftovers (Mig. yes, R-001's mechanism): `src/project/leftovers.ts` gets entries with the feature "role texts from the
   package (R-040)" for `.agents/limen/communication.md` and `.agents/limen/<role>.md` of every package role
   (`coordinator`, `group-member`, `judge`, `keeper`, `quality`, `researcher`, `reviewer`, `worker`) and of the removed
   roles `picture` and `scout`, in any form; a byte-identical `AGENTS.md` (the pair `AGENTS.md` ↔ `templates/manual.md`)
   is still listed, a changed one never (project context, an owner file). The overlap guard holds against a short
   exported list of the project files Limen still reads (`AGENTS.md`, `CLAUDE.md`, `spec/vision.md`,
   `.agents/limen/styleguide.md`, `.agents/limen/limits.json`) instead of `TRACKED`.
8. Text (fact 7; A-085): the sentences say that every Limen text comes from the package; `docs/setup.md` → `###
   Overlays` goes; `CONTRIBUTING.md` loses the history line and gains the maintainer notes of item 1.
9. Tests, each failing at HEAD with R-039 done (T-29):
   - `test/runtime/context-message.test.ts` (R-039's) and its reference files: the coordinator's message holds the
     owner, agent and specs registers, a job's only the agent register, the keeper's agent and specs; a project
     `.agents/limen/communication.md`, `.agents/limen/worker.md` or `AGENTS.md` changes no coordinator message and no
     job message with the value off; with the value on a job's message ends with the project's `AGENTS.md`; no message
     holds a maintainer note; a missing package text throws.
   - `test/hook/communication.test.ts`: no `Guidance drift` block with a changed project register present; the cue and
     the specs reminder use the package's files.
   - `test/project/leftovers.test.ts`, `test/cli/status.test.ts`, `test/cli/init.test.ts`: each path of item 7 listed in
     any form and dropped by `--drop-leftovers`; a changed `AGENTS.md` kept; a plain `limen init` prints no drift line.
   - `test/cli/old-names.test.ts`: the two "a project keeps a role of that name" tests become "refuses although the
     project holds `.agents/limen/<role>.md`"; the picture continuation case plants its record instead of spawning
     from a project role file.
   - `test/job/spawning.test.ts`, new: `resolvePreamble` returns the package template with a project
     `.agents/limen/worker.md` present, and an unknown role refuses with the new line.
   - `test/s4-steering.test.ts`: the project register's marker appears 0 times in the model's view, the package's once.

Files the criteria name that this ticket or R-039 creates: `src/runtime/context-message.ts`,
`test/runtime/context-message.test.ts`, `test/job/spawning.test.ts`.

## Out of scope

- The cue, its audience line and the owner register's language rule (R-041, T-13); the task note and
  `.agents/limen/reminders.md` (R-042); the reminder's delivery (R-043); module text in the registers (R-044, A-038's
  last sentence); literal wording, the glossary and budgets (R-046, R-086); whether workers keep the ticket contract
  (R-046, A-085).
- Turning isolation on, `--approve`, the Claude Code path (R-048); reading `AGENTS.md` and vision from the published
  copy (R-054); the keeper's cut (R-066).
- `CLAUDE.md` in the context message: under the bridge Claude Code loads it (A-042, E-7); R-048's seat steps 5.8 and 5.9
  prove `CLAUDE.md` and `AGENTS.md` arrive.

## Acceptance

- AC-1: `node --test test/runtime/context-message.test.ts` → exit 0.
- AC-2: `node --test test/hook/communication.test.ts` → exit 0.
- AC-3: `node --test test/project/leftovers.test.ts` → exit 0; `node --test test/cli/status.test.ts` → exit 0;
  `node --test test/cli/init.test.ts` → exit 0.
- AC-4: `node --test test/cli/old-names.test.ts` → exit 0; `node --test test/job/spawning.test.ts` → exit 0.
- AC-5: `node --test test/s4-steering.test.ts` → exit 0; `node --test test/structure.test.ts` → exit 0.
- AC-6: `git grep -q '"templates/agents.md"' -- src hook` → exit 1 (D-025).
- AC-7: `git grep -q 'listDrift\|formatDrift\|TRACKED' -- src/project/inherit.ts src/project/leftovers.ts
  src/project/setup.ts hook/communication.ts` → exit 1.
- AC-8: `git grep -q 'inheritFile' -- src/project/inherit.ts hook/communication.ts src/runtime/context-message.ts` →
  exit 1.
- AC-9: `git grep -q 'spawnSync' -- src/project/inherit.ts` → exit 1.
- AC-10: `git grep -q 'agents/limen/communication' -- hook templates src/runtime/context-message.ts` → exit 1.
- AC-11: `git grep -q 'agents/limen/' -- src/job/spawning.ts src/registry.ts src/old-names.ts` → exit 1.
- AC-12: `git grep -q 'templates/\.history' -- src test` → exit 1; `git grep -q 'LIMEN_WRITE_HISTORY' --
  test/structure.test.ts CONTRIBUTING.md` → exit 1.
- AC-13: `git grep -q 'Keep this file at or below\|The hook selects' -- templates/communication.md
  templates/registers/owner.md templates/registers/agent.md templates/registers/specs.md` → exit 1.
- AC-14: `git grep -q 'replaces that default\|at the same path replaces\|unless they overlay\|Overlays\|differs from the
  package' -- templates/manual.md templates/communication.md docs/setup.md docs/commands.md CONTRIBUTING.md` → exit 1.
- AC-15: `node adrian-rebuild/tools/fails-before.mjs test/runtime/context-message.test.ts test/hook/communication.test.ts
  test/project/leftovers.test.ts test/cli/status.test.ts test/cli/init.test.ts test/cli/old-names.test.ts
  test/job/spawning.test.ts test/s4-steering.test.ts` → exit 0, its output in `outcome.md` → `## Fails before`.
- AC-16: `node adrian-rebuild/tools/gate.mjs` → exit 0.
- AC-17: `npx biome check --error-on-warnings .` → exit 0; `node adrian-rebuild/tools/check.mjs` → exit 0.
- AC-18 (judgment): each role's message holds the registers A-038 gives it, from the package only; no project file
  replaces a Limen text; the project's `AGENTS.md` enters a job's message only through the one isolation value, off in
  this commit; the text of item 8 describes the code.

## Migration

- The project files nothing reads after this ticket (item 7) become leftovers of R-001's mechanism: `limen status`
  lists them once and `limen init --drop-leftovers` removes them, tested on fixtures by `test/project/leftovers.test.ts`,
  `test/cli/status.test.ts` and `test/cli/init.test.ts`, as R-003 and R-102 did; no separate script. Gate 2 §1 finds
  none of them in either project, so no seat step.
- No record, `.limen/` layout or CLI form changes; `--role` keeps its form. A job's `context.md` published before this
  ticket keeps the old register text, and a continuation carries it byte for byte (R-039).

## Risk

- The renamed manual: a reference this ticket misses fails loudly, because a missing package text throws (item 2).
- A changed `.agents/limen/<role>.md` on the seat would be listed and, on `--drop-leftovers`, removed; it is an owner
  file, so its deletion is the owner's commit (R-001's Risk), and gate 2 §1 finds none.

## Rollback

`git revert $(git log --format=%H --grep='^R-040:' adrian-rebuild --)`. A leftover dropped meanwhile stays dropped; the
reverted code reads the package again, as it did for projects without such a copy.

## Decisions

Settled by the documents when the ticket was written (2026-11-26, the main session's reading, not a night default; the
inventory's questions in `evidence/inventories/R-040.md` → section 7):
1. Three package files for the registers, the cue sections left in `templates/communication.md` for R-041 (Q1 (a)):
   A-038 says "split", and each register is one unit for R-046's budget per role.
2. Lines `:5` and `:7` go to the owner register, moved unchanged (Q2 (a)): both speak of switching audience and of the
   owner reading cold, and only the coordinator has two audiences; R-046 sets the words.
3. The order of parts (Q3): stable parts only, the project's `AGENTS.md` last (z. 3; A-042 "next to Limen's
   instructions, never instead of them").
4. Specs for the coordinator and the keeper only (Q4): A-038.
5. One constant and one function beside `engineRoute` for isolation (Q5 (a)): one source for the rule and R-048's
   environment, so the file never arrives twice by construction; not a setting (T-03).
6. A missing package text throws (Q6 (a)): T-01, and R-039 Decision 13 for the same reason.
7. Project-only roles go (Q7): AU-136 and A-042 ("role prompts always come from the package"); the refusal's new words
   are the main session's, for Adrian at gate 5.4.
8. The overlap guard holds against the files Limen still reads (Q8 (a)); R-054 later replaces that list with the owner
   files.
9. `templates/agents.md` becomes `templates/manual.md` (Q9 (a)): T-18 ("the coordinator manual"), and D-025's criterion
   is then met by the code, not by building the path from parts; reported to Adrian on 2026-11-26 with Q-80–Q-84, for
   gate 5.4.
10. One ticket (Q10): the three parts change the same builder and the same reference files.

Checked at `c3290a0` (2026-11-26, night run 1, protocol step 2, after R-039):
11. The places of the facts after R-039: the manual's override by a project `AGENTS.md` is
    `src/runtime/context-message.ts:96` (`MANUAL_FILE` `:21`), the register's `inheritFile` is
    `src/runtime/context-message.ts:113` (`REGISTER_FILE` `:17`) and `hook/communication.ts:292` (the cue), the cue's
    drift block `hook/communication.ts:278`; R-039 heads a job's role text `## Role (<path>)`, the path a project's
    `.agents/limen/<role>.md` or `limen/templates/<role>.md` (R-039 `outcome.md` → Deviations 2), which item 5 leaves to
    the package's path only. AC-6 matches `src/project/inherit.ts:18` (`TRACKED`, item 6) and
    `src/runtime/context-message.ts:21` (`MANUAL_FILE`, item 3's rename), both removed by this ticket (D-025).
12. Night default, for Adrian to confirm in the morning (D-054 (2) (a)): at `HEAD` AC-13's pathspec `templates` also
    matched `templates/spec/vision.md:3` and `templates/styleguide.md:3` ("Keep this file at or below", the project
    templates' own notes, which A-038 does not name), and AC-14's `templates` matched `templates/picture/CONTRACT.md:44`
    ("Overlays never become blocks or edges", the Picture contract), none of which `## Change` touches; both criteria are
    narrowed to the files this ticket changes or creates (`templates/communication.md`, the three register files,
    `templates/manual.md`). AC-10 gains `src/runtime/context-message.ts`, where R-039 moved the register's path
    (`REGISTER_FILE`), so the criterion still covers item 2.

Review round 1 (2026-11-27, night run 4; `review.md` → Round 1): PASS with six notes. To fix, by a fresh implementer
(D-026), then the gate and round 2:
13. F1: the comment on `PROJECT_FILES` (`src/project/leftovers.ts:14-16`) says what the list is, item 7's project
    context and owner files that no entry may equal, hold or lie under, and no longer claims they are every project
    file Limen still reads (it also reads `.agents/limen/reminders.md` and `spec/build.md`; T-30 (1)).
    F2: `docs/commands.md:190` names the role copies the list holds as item 7 does, `.agents/limen/<role>.md` of each
    package role and of the cut roles `picture` and `scout`, instead of every `.agents/limen/<role>.md`.
    F3: the doc comment on `guidance()` (`hook/communication.ts:444-447`) gives the local reason with a pointer (the
    specs register is read from the package only, A-038; for a project file the worktree's copy wins over the root's)
    without the circular clause "which every message that holds it holds too" (T-30 (1)).
    Without change, with the reasons in `review.md`: notes 1 (a guard of item 7's boundary that HEAD already keeps), 5
    (exit 5 for a missing package text, a night default for Adrian) and 6 (the manual's title line, R-046's wording).

Review round 2 (2026-11-27, night run 4; `review.md` → Round 2): PASS with two notes. The last round of fixes, by a
fresh implementer (D-026), then the gate and round 3, whose notes go to the open points (D-092):
14. G1: the claim that `PROJECT_FILES` are files "Limen still reads", which F1 removed from its comment, leaves the
    rest of `src/project/leftovers.ts` (`:51`) and `test/project/leftovers.test.ts` (the test name at `:233` and the
    words at `:58-59`): each says a project context or owner file instead (no Limen code reads `CLAUDE.md`; T-30 (1)),
    and `outcome.md` → Open points 4 goes. Note 2 (no gate record after F1–F3) is closed by the main session in
    `outcome.md` → `## Proof` (D-053 (2)).
