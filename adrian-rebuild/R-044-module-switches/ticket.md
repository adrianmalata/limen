<!-- PL: Ticket R-044 (G1.10, A-082, A-040, D-040, D-122): przełączniki sześciu modułów w `limits.json`, domyślnie
wyłączone. Wyłączony moduł nie daje tekstu do wiadomości kontekstowej ani hooka, a jego polecenia i role odmawiają
kodem `MODULE_OFF`; hooki sesji wybiera jeden moduł `src/runtime/hook-set.ts`, a tekst modułów przenosi się do
`templates/modules/<moduł>/<plik części>`. `limen migrate` raportuje moduły w użyciu na krok 4.9. Stan: napisany 26.11
przy `6e5f5ca` z inwentarza `evidence/inventories/R-044.md`; `ready` za R-039 i R-040 (D-124: zależność od R-040). -->

# R-044 Module switches; hooks load by role and module

## Problem

G1.10, quoted (`plan.md` → Gate 2 §2): "optional modules (Picture, doorbell, groups, non-Git workspace, research,
quality pass) have switches in a project file (e.g. `.agents/limen/limits.json`), **off by default**; a disabled module
contributes no prompt text and no hook, and its commands refuse with a message". G1.1, G1.2 and G1.9 keep the doorbell,
groups and the workspace "as a module (G1.10)"; G1.4 Picture is a "module (G1.10)"; G1.11 research and G1.13 the quality
pass are modules, off by default.

Findings, each Decision quoted:
- A-082 (`audit.md:1657`): "fix — Hooks load by role and module: `group-peer` only with groups on and only in a session
  that leads a group; `steering` only in jobs." D-122 (2) leaves "only in a session that leads a group", with the
  1-second timer's end, to R-077.
- A-040 (`audit.md:1065`): "fix — … An enabled module's text stays in the always-on manual (no load-on-demand
  mechanism)."
- A-038's last sentence (`audit.md:1037`): "A disabled module contributes no sections." (R-040 left it here: R-040
  `ticket.md` → Out of scope.)

Plan decisions: D-040 (the modules header and its `[on]`/`[off]` markers are R-044's criterion), amended by D-122 (1):
"at R-044's commit the modules header of `limen --help` reads "Modules: off by default; the owner switches them on in
limits.json", which is true then; R-055 adds the owner channel and R-062 adds `limen init`". T-19 (5): "every module
line shows its state from the project's `limits.json`, `[on]` or `[off]` (G1.10)", checked by "a golden test of the
full `limen --help` on a fixture with one module on and the rest off". Gate 2 §6: "the module switch replaces the prose
"never start research unprompted"". Seat steps 4.7 ("With every module off, the coordinator session loads no group
hook") and 4.9 (Adrian switches on the modules the migration report lists as in use).

Engine facts (quoted from `plan.md` → `## Engine facts`): E-4: "`--no-extensions` keeps the project stub
`.pi/extensions/limen.ts` out of jobs"; E-11: "`/new` and `ctx.newSession()` give a new session ID, re-run extension
factories and keep the CLI options" (a `/reload` re-runs them too, inventory section 2).

Rules: T-03 (settings only from owner files; no environment variable), T-02 and T-38 (a refusal is exit 1 with its
reason, arises in `validate` and leaves the snapshot identical), T-18 (one word per thing, identifiers included), T-25
(1) (one module per policy), T-26 (thin commands), T-27 (2) (one validator per field), T-28 (1) (every refusal code
has a test), T-29, T-30 (docs and comments follow the code), A-085 (one copy of each fact), z. 3 (the prefix does not
change during a session), z. 14 (guarantees in code).

Facts at `6e5f5ca` (inventory sections 1–5; line numbers move with R-038–R-040):
1. `limits.json` holds `prepare`, `toolStall` and `toolCalls` only (`src/project/limits.ts:12`); `eachField` ignores an
   invalid or unknown entry on its own with a typed `BadData` (`src/boundary.ts:190-210`).
2. Every coordinator session loads `wake`, `communication`, `steering` and `group-peer` from the project stub
   (`templates/limen-extension.ts:8`, byte-identical to `.pi/extensions/limen.ts`); `group-peer` registers the session
   as a group lead and starts a 1-second timer (`hook/group-peer.ts:49-51`, `:92`); `steering` returns at
   `session_start` outside a job but registers its handlers (`hook/steering.ts:62-66`). Jobs get `finish`, `steering`,
   `communication`, `rate-limit`, and `group-peer` for a group member (`src/runtime/wrapper.ts:232-239`).
3. Module commands run in every project: `GROUPS` declares `github`, `group`, `picture`, `workspace` as modules
   (`src/registry.ts:92-108`); dispatch has no shared step before `entry.handler` (`src/main.ts:117`). `github poll`
   acts on every registered project (`src/registry.ts:796-807`).
4. Every job starts through `src/job/spawning.ts` (`startSpawn`, `checkedSpawn`) or `src/job/continuation.ts`
   (`startContinue`): their callers are `src/commands/spawn.ts`, `src/commands/keeper.ts`, `src/commands/continue.ts`,
   `src/job/group-rounds.ts`, `src/job/group-control.ts`, `src/integrations/github-claims.ts` and
   `src/runtime/resuming.ts`.
5. Module text sits in the always-on texts: the manual (`templates/agents.md:9`, `:19`, `:21-32`, `:38-40`, `:66-68`,
   `:74`, `:88`, `:142`, `:146`, `:148`, `:172-187`), `templates/worker.md:15-16` and `templates/coordinator.md:13-14`
   (Picture place ids and `limen picture build --strict`), the `## Specs` register's front-matter line
   (`templates/communication.md:31`), `templates/keeper.md:13-16` (the place ids and the map steps) and `templates/reviewer.md:5` (the
   doorbell). The keeper's packet names the map whenever `.limen/picture` exists (`src/commands/keeper.ts:82-89`).
6. The help's modules header is the bare "Modules" of D-040 (`src/registry.ts:109-110`); `generalHelp` takes no
   project (`src/help.ts:66-68`), and `docs/commands.md`'s generated section reuses its lines (`src/help.ts:156-158`).

## Change

1. `src/project/limits.ts`: a `modules` field, an object whose keys are module names and values booleans, validated in
   the boundary form of the other fields (T-27 (2)): an unknown name or a value that is not a boolean is ignored on its
   own with a typed `BadData` that names the file and the key, as today's entries; no field means every module off.
2. `src/project/modules.ts`, new (T-25 (1)): the one module policy. The six modules by their command word (T-18):
   `github`, `group`, `picture`, `workspace`, `research`, `quality` (the last two have no command yet: R-078, R-079);
   `moduleOn(root, name)` from item 1; and `requireModule(root, name)`, which throws `MODULE_OFF` (class refused, exit 1,
   `next: null`) with the line `the <name> module is off in this project; the owner switches it on in
   .agents/limen/limits.json ("modules": {"<name>": true})`. It starts no process and writes nothing.
3. `src/runtime/roles.ts`, new: the table of the package's job roles (`worker`, `reviewer`, `judge`, `researcher`,
   `quality`, `keeper`, `coordinator` (the group team), `group-member`), each with its module or none: `researcher` and
   `judge` → `research`, `quality` → `quality`, `coordinator` and `group-member` → `group`. R-045 adds each role's tools,
   skills and read-only flag to the same entries (A-081: "the role definition").
4. Refusals, each before any write (T-38):
   - `src/main.ts`: one shared step before `entry.handler` calls `requireModule` for an entry whose `object` is a module,
     with the root of the project at the cwd; `--help` of a module command still prints. Each module entry of
     `src/registry.ts` declares `MODULE_OFF` in its `refuses`. `github poll` is exempt through a field of its registry
     entry (not a name test in `main.ts`): it skips each registered project whose `github` switch is off and names it in
     its report.
   - `src/job/spawning.ts` and `src/job/continuation.ts`, in their validate step: a role whose module (item 3) is off
     refuses with `MODULE_OFF`, so every caller of fact 4 refuses the same way.
5. `src/runtime/hook-set.ts`, new: the one function that names a session's hooks. The coordinator session: `wake` and
   `communication`, plus `group-peer` with `group` on. A job: `finish`, `steering`, `communication` and `rate-limit`,
   plus `group-peer` for a group member (today's `jobMembership`). `src/runtime/wrapper.ts` takes a job's list from it
   and holds no hook name. `hook/steering.ts` and `hook/group-peer.ts`: their factories return before they register a
   handler, write a file or start a timer when the set of their session excludes them (the precedent:
   `hook/finish.ts:28-30`); a coordinator reads the switches of the project at its cwd. The stub
   (`templates/limen-extension.ts`, `.pi/extensions/limen.ts`) stays byte-identical, so no project file changes.
6. Module text (A-040, A-038, A-085): a module's text for a package part lives in
   `templates/modules/<module>/<the part's file name>`, for example `templates/modules/group/manual.md` (the coordinator
   manual, `templates/manual.md` after R-040), `templates/modules/picture/worker.md`,
   `templates/modules/picture/coordinator.md` (the group team's `templates/coordinator.md`),
   `templates/modules/picture/specs.md` (R-040's `templates/registers/specs.md`) and
   `templates/modules/github/reviewer.md`. `src/runtime/context-message.ts` (R-039, R-040) appends, right after each
   part and for each module that is on in item 2's order, that file when it exists, as its own part with the `##
   <Label> (<path>)` heading (label `<Name> module`); a module that is off contributes nothing. The texts of fact 5
   move there by one rule: a sentence whose subject is a module's command, data, role or behaviour moves to that
   module's file, and the sentence it leaves reads whole without it; "Never start research unprompted." goes (gate 2
   §6). `src/commands/keeper.ts`: the packet's `Map:` reads `none` with `picture` off.
7. Help (D-040, D-122 (1), T-19 (5)): `MODULES_HEADER` reads "Modules: off by default; the owner switches them on in
   limits.json"; each module line's summary opens with `[on]` or `[off]` from the switch of the project at the cwd
   (outside a project every module is `[off]`), as the T-19 draft (`adrian-rebuild/evidence/taste/help-registry.mjs`);
   `docs/commands.md`'s generated section is rendered with every module off, so it stays project-independent (A-084).
   The D-040 comment at `src/registry.ts:109` goes.
8. Migration report (Mig. yes): `limen migrate` and `limen migrate --dry-run` add one line per module of item 2,
   `module <name>: in use (<evidence>)` or `module <name>: not in use`, and one line naming the file and field to switch
   them on in. Evidence: `github` a `.limen/github/binding.json`; `group` a `.limen/groups/<id>/run.json`; `picture` a
   `.limen/picture/` folder; `workspace` a `spec/workspace.md` in a root that is no Git repository; `research` a job
   record of role `researcher` or `judge`, and `quality` one of role `quality`, the job archive included (the reader
   of `limen stats`). It writes no `limits.json` (an owner file), and the lines change no `next`.
9. Text (T-30, A-085): `docs/setup.md` says the modules are off by default, names the field, and says when a switch
   takes effect (a command at once; a hook at `/reload` or a new session; the context message only in a new session,
   z. 3) and that `steering` no longer loads in the coordinator (`:60`); `docs/jobs.md` (`:31`, the limits file
   `:210-214`), `docs/groups.md:29`, `docs/remote.md:14` and `:176`, `docs/seat/agent-setup.md:211` and
   `docs/seat/README.md:96` follow; the refusals that name the lead hook (`src/job/group-control.ts:165`, `:269`,
   `:275`, `src/job/spawning.ts:825`) also name the `group` switch.
10. Tests, each failing at HEAD with R-039 and R-040 done (T-29):
    - `test/project/limits.test.ts`: the field read; no field → every module off; a non-boolean value and an unknown
      name ignored and named; no environment variable changes a switch.
    - `test/project/modules.test.ts`, new: every registry group marked `module` is in item 2's list; every module role
      of item 3 has a `templates/<role>.md`; `requireModule` throws `MODULE_OFF` with the file and field.
    - `test/registry.test.ts`: `MODULE_OFF` declared by every module entry and tested as `MODULE_OFF: …`; the read
      command test on a read-only `.limen/` runs with the modules on.
    - `test/cli/group.test.ts`: `limen group start` with `group` off exits 1 with `MODULE_OFF` and leaves the snapshot
      unchanged; `limen group --help` exits 0. `test/cli/github.test.ts`: `limen github status` with `github` off
      refuses; `github poll` skips a project with `github` off and names it, and serves one with it on.
    - `test/cli/spawn.test.ts`: `limen spawn --role researcher` with `research` off exits 1 with `MODULE_OFF` and leaves
      no job folder; with it on the job starts. `test/cli/continue.test.ts`: a continuation of a `researcher` job with
      `research` off refuses. `test/cli/keeper.test.ts`: the packet's `Map:` is `none` with `picture` off and a map
      present.
    - `test/runtime/hook-set.test.ts`, new: the four sets of item 5. `test/runtime/wrapper.test.ts`: a job's engine
      argv lists its set. `test/hook/group-peer.test.ts`: in a coordinator session with `group` off the factory
      registers no handler, writes no `.limen/group-leads/` file and starts no timer; with it on, as today.
      `test/runtime/pi-api.test.ts`: in a coordinator session `steering` registers no handler.
    - `test/help.test.ts`: the golden of `limen --help` in a fixture project with `group` on and the rest off; outside
      a project every module `[off]`; the docs section with every module off.
    - `test/runtime/context-message.test.ts` (R-039's) and its reference files under `test/runtime/context-message/`:
      with every module off no message holds a module file's text; with `picture` on the worker's, the keeper's, the
      group team's and the coordinator's messages hold their picture file right after its part; a golden with
      `picture` on.
    - `test/cli/migrate.test.ts`: the module lines on a fixture with a binding and a run record (`github` and `group`
      in use) and on one with neither; no `limits.json` written.
    - Every test that runs a module command or a module role: its plant's `limits.json` switches on the modules it
      uses, through the plant helper `test/plant.ts`; no assertion is weakened.

Files the criteria name that this ticket, R-039 or R-040 creates: `test/project/modules.test.ts`,
`test/runtime/hook-set.test.ts`, `test/runtime/context-message.test.ts`, `templates/manual.md`.

## Out of scope

- "Only in a session that leads a group" and the lead's 1-second timer (A-082's second clause): R-077 (D-122 (2)).
- `limen init` asking the switches (R-062) and the owner channel (R-055): the header names neither until then (D-122 (1)).
- The land check's Picture read (`src/project/ticket-check.ts`) and `touches:`: R-080 and R-061 (A-048).
- Research on its own account and its commands (R-078); the quality trigger by code and its N (R-079).
- Tools and skills per role (R-045); the role texts' wording and budgets (R-046, R-086); the generated docs section of
  the switches (R-081, A-084).
- A group already running when `group` goes off: its members keep their hooks, and its commands refuse (Risk).

## Acceptance

- AC-1: `node --test test/project/limits.test.ts` → exit 0; `node --test test/project/modules.test.ts` → exit 0.
- AC-2: `node --test test/runtime/hook-set.test.ts` → exit 0; `node --test test/runtime/wrapper.test.ts` → exit 0.
- AC-3: `node --test test/hook/group-peer.test.ts` → exit 0; `node --test test/runtime/pi-api.test.ts` → exit 0.
- AC-4: `node --test test/help.test.ts` → exit 0; `node --test test/registry.test.ts` → exit 0.
- AC-5: `node --test test/cli/group.test.ts` → exit 0; `node --test test/cli/github.test.ts` → exit 0.
- AC-6: `node --test test/cli/spawn.test.ts` → exit 0; `node --test test/cli/continue.test.ts` → exit 0;
  `node --test test/cli/keeper.test.ts` → exit 0.
- AC-7: `node --test test/runtime/context-message.test.ts` → exit 0; `node --test test/cli/migrate.test.ts` → exit 0.
- AC-8: `node adrian-rebuild/tools/fails-before.mjs test/project/limits.test.ts test/project/modules.test.ts
  test/runtime/hook-set.test.ts test/runtime/wrapper.test.ts test/hook/group-peer.test.ts test/runtime/pi-api.test.ts
  test/help.test.ts test/registry.test.ts test/cli/group.test.ts test/cli/github.test.ts test/cli/spawn.test.ts
  test/cli/continue.test.ts test/cli/keeper.test.ts test/runtime/context-message.test.ts test/cli/migrate.test.ts` →
  exit 0, its output in `outcome.md` → `## Fails before`.
- AC-9: `git grep -q 'MODULES_HEADER = "Modules"' -- src/registry.ts` → exit 1.
- AC-10: `git grep -q 'limen group\|limen workspace\|--role researcher\|--role judge\|--role quality\|\.limen/picture\|picture build\|doorbell' -- templates/manual.md` → exit 1.
- AC-11: `git grep -q 'Never start research unprompted' -- templates` → exit 1.
- AC-12: `git grep -q 'group-peer' -- src/runtime/wrapper.ts` → exit 1.
- AC-13: `git grep -q 'picture build' -- templates/worker.md templates/coordinator.md templates/keeper.md` → exit 1;
  `git grep -q 'doorbell' -- templates/reviewer.md` → exit 1.
- AC-14: `node adrian-rebuild/tools/gate.mjs` → exit 0.
- AC-15: `npx biome check --error-on-warnings .` → exit 0; `node adrian-rebuild/tools/check.mjs` → exit 0.
- AC-16 (judgment): a module that is off contributes no prompt text, no hook handler, file or timer, and no command or
  job; every text that stays reads whole without the module's sentences; every help line and doc sentence describes
  behaviour present in the commit (T-19's addition, D-122 (1)).

## Migration

`limits.json` gains one optional field and no file is rewritten; a project without it runs with every module off
(G1.10). The report of item 8 lists, per project, the modules in use, from `## Deployment` 0.4's dry run, and Adrian
switches those on at 4.9; its fixture test is `test/cli/migrate.test.ts`. The project stub stays byte-identical (item 5),
so no hook a project loads changes. No CLI form changes.

## Risk

- From the deployment of a0.4.0 until step 4.9, a module in use is off: the doorbell stops, group commands refuse,
  workers get no Picture text. The dry run of 0.4 names them, and 4.9 is in the same deployment.
- `limen github connect` and `limen workspace init` refuse until the owner writes the switch (R-062 makes `limen init`
  ask); the refusal names the file and the field.
- Switching `group` off while a run is open strands its internal commands; `docs/setup.md` says to switch it off only
  with no open run (R-077 rewrites groups).
- Many test plants change; the reviewer checks that each only switches modules on and weakens no assertion.
- A coordinator session open before 4.9 keeps its hooks until `/reload` and its context message until a new session.

## Rollback

`git revert $(git log --format=%H --grep='^R-044:' adrian-rebuild --)`. The older code ignores the `modules` field as an
unknown entry (fact 1), so a switched-on `limits.json` needs no reverse migration.

## Decisions

Settled by the documents when the ticket was written (2026-11-26, the main session's reading, not a night default; the
inventory's questions in `evidence/inventories/R-044.md` → section 8):
1. The shape (Q1 (a)): one boolean per module under `modules`; absent means off (G1.10).
2. The names (Q2): the command word (T-18), so `group`, not the T-19 draft's `groups`; `research` and `quality` are
   declared now, since their roles and texts exist (G1.10 names six).
3. An invalid value (Q3 (a)): ignored with its typed reason, so the module stays off (today's policy for the file).
4. The refusal (Q4 (a)): one shared step before the handler (T-25 (1), T-38), one code `MODULE_OFF`, `next: null`,
   since no command switches a module on before a0.5.0 (T-03: the message names the file and the field).
5. `github poll` (Q5 (a)): it skips a project whose switch is off, so one project's switch does not stop the others.
6. Module roles (Q6 (a)): a job of a module's role refuses when the module is off, in the two functions every job
   start passes (fact 4); group members exist only through `group start`, which refuses first.
7. The hook set (Q7 (a)): one function for jobs and the coordinator session; a factory that is not in the set
   registers nothing, so the stub stays byte-identical and R-050's start script later passes the same set with `-e`
   (A-025). 4.7's "loads no group hook" is met by a hook that registers no handler, no file and no timer.
8. A-082's lead clause (Q8): R-077's, by D-122 (2).
9. Module text (Q9): one file per module and package part, `templates/modules/<module>/<part file name>`, appended
   right after its part. This departs from the inventory's one file per module with role headings: the file's
   existence is the declaration, so no heading parser, and the part's file name avoids the naming trap of the job role
   `coordinator` (the group team).
10. Help outside a project and the docs section (Q10 (a)): every module `[off]`, true by G1.10; the header text by
    D-122 (1).
11. The migration report (Q11 (b)): all six modules, each "in use" or "not in use" with its evidence, so 4.9 misses no
    Picture data; `limen migrate` hosts it, since `## Deployment` 0.4 runs its dry run first.
12. When a switch takes effect (Q12): commands read the file at each use, hooks and the context message are fixed per
    session (z. 3); `## Deployment` 4.9 says to open a new coordinator session.
13. The role table (R-045's inventory Q1 (a)): created here with each role's module, so R-045 extends one table.
14. The keeper's packet: its `Map:` line is prompt text, so it follows the `picture` switch (G1.10).
15. 2026-11-26 D-124 (Adrian: "1"; Q-85, option 1): R-044 depends on R-040 as well as R-015 and R-039: both change
    `src/runtime/context-message.ts`, the manual and the `## Specs` register, and item 6 extends R-040's part files
    (`templates/manual.md`, `templates/registers/specs.md`).
