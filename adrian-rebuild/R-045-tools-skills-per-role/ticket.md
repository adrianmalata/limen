<!-- PL: Ticket R-045 (A-081, E-5, E-6, D-123): narzędzia i skille według roli z tabeli ról `src/runtime/roles.ts`
(R-044); role tylko do odczytu (recenzent, sędzia, badacz) dostają `read,bash,finish`, piszące `read,bash,edit,write,finish`,
każdy job `--no-skills`. Gwarancją jest sprawdzenie efektu w `finalizeJob`: rola tylko do odczytu, której worktree albo
gałąź różni się od stanu startowego, kończy się `failed`, rodzaj `read-only-violation`. Wpis koordynatora jest tylko
zadeklarowany (D-123), stosuje go R-050. Stan: napisany 26.11 przy `8b3cc59` z inwentarza `evidence/inventories/R-045.md`;
`ready` za R-042 i R-044 (D-125: zależność od R-042, bo oba zmieniają ścieżkę `done` w `finalizeJob`); `active` przy
`e645561`, z miejscami faktów po R-038–R-044, R-041 i R-112 w decyzji 16. -->

# R-045 Tools and skills per role; a read-only role that writes fails

## Problem

A-081 (`audit.md:1631-1643`), Evidence: "jobs get `--no-extensions` and the `finish` tool (≈65 tokens), but no flag
limits the engine's built-in tools or skills index … A read-only scout or judge sees the same write/edit/bash tools and
skills as a worker." History: "The author measured the skills list: 37 KB for 60 skills, in every session."
**Decision** (quoted): "fix — Per-role tool and skill lists in the role definition: read-only roles (scout, judge,
researcher, reviewer) get no write or edit tools; skills are off by default and enabled per role. Effect check in code:
when a read-only role ends, Limen compares the worktree and branch with their state at start (git status, no new
commits); a difference = `failed`, kind `read-only-violation`. The tool list is a mistake and noise guard (Bash can
still write); the effect check is the guarantee." T-33 drops the scout from that list ("A-081's list of read-only roles
drops the scout"; `taste.md` → gate-2 changes: "A-081: the scout leaves the list of read-only roles (T-33)"), and R-009
cut the role.

A-016 (1) (gate 2 §3) lists the kind `read-only-violation`; D-095 adds `launch` ("an end where the job's engine did not
start") and `internal` ("an error the wrapper itself throws"). R-029's `ticket.md` left this kind to R-045.

D-123 (quoted): "R-045 declares the coordinator's entry in the role table (its four tools, no skills), and R-050's
coordinator start script applies it in stage 5; until then the coordinator, started by hand, keeps Pi's defaults."

Engine facts (quoted from `plan.md` → `## Engine facts`):
- E-5: "Claude Code's built-in tools are disabled; Pi's tools are served to it as `mcp__custom-tools__<name>` under
  `bypassPermissions`, so Pi's `--tools` allowlist (e.g. `read,grep,find,ls`) reaches Claude exactly. `Agent`, `Task`,
  `Skill`, `AskUserQuestion` and other Claude Code tools are always denied; Pi's `tool_call` event sees only Pi tool
  names. Exception: a session with zero Pi tools gets Claude Code's own Bash/Read/Write back, so no role may run with an
  empty tool list."
- E-6: "Pi lists every loaded skill (name, description, path) when `read` or `bash` is active;
  `disable-model-invocation: true` hides one; `--no-skills` plus `--skill <path>` restricts a session. The bridge
  forwards that block into Claude's append."
- E-3, E-4: `--approve` makes Pi read `<cwd>/.pi/settings.json`, `.pi/skills` and `.agents/skills`; `--no-extensions`
  keeps the project stub out of jobs.
- Consequences (`plan.md` → `## Engine facts`): "read-only roles get a non-empty Pi `--tools` allowlist (A-081, E-5)".

Pi 1.5.1 (inventory section 2, from the tarball): `--tools` is an allowlist of tool names that replaces the defaults
`read`, `bash`, `edit`, `write` (`dist/core/settings-manager.js:35`, `dist/core/sdk.js:148-157`); it also filters the
tools extensions register (`dist/core/agent-session.js:1197-1203`), so a list must name `finish`; `--no-skills` loads
only `--skill` paths (`dist/core/resource-loader.js:439-441`). The bridge (`evidence/engine-sources/bridge-5.0.3.md` §3,
§4) gives Claude only Pi's current tools and passes no skills option.

Rules: T-25 (1) (one module per policy), T-36 (a tool a prompt recommends comes only from a declaration), T-31 (3)
(a fake scenario for every failure kind of A-016), T-28 (5) (a fake test and a `## Deployment` step for behaviour that
depends on Pi or the bridge), T-03 (settings only from owner files), T-29, T-30 (docs and comments follow the code),
A-085 (one copy of each fact), z. 14 ("Hook widzi wywołanie, nie semantykę — zapis pośredni (np. przez Bash) może go
obejść"), z. 8 and z. 13 (tools declared up front; descriptions are selection criteria). Seat step 4.3.

Facts at `8b3cc59` (the product code is `aa721d7`'s, the inventory's; R-038–R-044 move the line numbers):
1. `argvFor` (`src/runtime/engine.ts:88-131`) passes `--mode json`, `--approve`, `--no-extensions`, `--session-dir`,
   the preamble, one `--extension` per hook and the bridge, the route and the task; no `--tools` and no skill flag
   (`git grep -q -e '--no-skills' -- src/runtime/engine.ts` exits 1). The role does not reach it
   (`src/runtime/wrapper.ts:224-245`). So every role runs `read`, `bash`, `edit`, `write` and `finish`
   (`hook/finish.ts:44`, the one tool a Limen hook registers) and every skill Pi finds.
2. The role: `reviewer` for `--review`, else the group's, else `--role`, else `worker` (`src/job/spawning.ts:312`); a
   continuation takes its parent's (`src/job/continuation.ts:269`). After R-040 a role is a package template or refuses
   with `ROLE_UNKNOWN` (R-040 `ticket.md` → Change 5). R-044 creates `src/runtime/roles.ts`, the table of the job
   roles `worker`, `reviewer`, `judge`, `researcher`, `quality`, `keeper`, `coordinator` (the group team) and
   `group-member` with each one's module (R-044 `ticket.md` → Change 3: "R-045 adds each role's tools, skills and
   read-only flag to the same entries").
3. A reviewer's worktree is detached at the candidate (`src/job/spawning.ts:785-790`); every other role gets a new
   worktree on its branch `limen/<id>`. Setup runs `--prepare` in the worktree after the transition to `running` and
   before the engine (`src/runtime/wrapper.ts:139-178`).
4. Every `done` passes `finalizeJob` (`src/job/finalize.ts:103-151`): the wrapper's engine end and a stop whose reason
   starts with `done:` (`src/job/stopping.ts:82`, `:125`). The kind `read-only-violation` is in `FAILURE_KINDS`
   (`src/job/record.ts:72`) and nothing sets it: a reviewer, judge or researcher that commits ends `done`.
5. A continuation copies `note.md` and `note.first.md` from its parent (`src/job/continuation.ts:548-554`); a quota
   resume is a continuation (`src/runtime/resuming.ts`, `START`).
6. Texts: `templates/researcher.md:7` "Fetch it via bash (`curl`, `git clone`)" (into the worktree);
   `docs/jobs.md:44` lists the kinds without `read-only-violation`; `docs/setup.md:80-82` tells projects to add skills
   that no job would load; `docs/commands.md:152-158` (Pi extensions) does not say that a role's list filters an
   extension's tools.

## Change

1. `src/runtime/roles.ts` (R-044's table, T-25 (1)): each job role's entry gains `tools`, `skills` and `readOnly`:
   - read-only (`reviewer`, `judge`, `researcher`): `tools` `read`, `bash`, `finish`;
   - every other job role: `read`, `bash`, `edit`, `write`, `finish`;
   - `skills`: package-relative paths of `SKILL.md` files, empty for every role now;
   - beside the table, one exported `COORDINATOR_SESSION` entry (D-123): tools `read`, `bash`, `edit`, `write`, no
     skills, not read-only. It is not a table key, because the job role `coordinator` is the group team (R-044
     Decision 9). Nothing in this ticket applies it; R-050's start script does.
   The table is the one list of job roles: `resolvePreamble` (`src/job/spawning.ts`, R-040) refuses a role outside it
   with R-040's `ROLE_UNKNOWN`, so no job runs without an entry.
2. `src/runtime/engine.ts`: `argvFor` takes the role's tools and skills from its caller and adds `--tools <a,b,…>`,
   `--no-skills` and one `--skill <absolute path>` per skill, resolved against the package root (root-owned on the
   seat, A-025). It throws when the tool list is empty (E-5). `src/runtime/wrapper.ts` passes the entry of the job's
   role.
3. `src/job/read-only.ts`, new (T-25 (1)), the one effect check:
   - `startState(worktree)`: the worktree's `HEAD` commit, the tip of the job's own branch when it has one (not a
     reviewer, whose `branch` names the candidate), and `git status --porcelain` with ignored files excluded;
   - `difference(start, now)`: null, or one line that names what changed: `HEAD moved <12 hex>..<12 hex>`, `branch
     <name> moved <12 hex>..<12 hex>`, `<n> paths changed: <up to 5 paths>` (escaped as the log escapes text);
   - the file `start-state.json` in the job folder, written with `atomicWrite` and read through `src/boundary.ts`.
4. `src/runtime/wrapper.ts`: for a read-only role, after setup and the worktree check and before the engine, it writes
   `start-state.json` unless the job already holds one; a git failure there ends the job `failed`, kind `launch`, and
   no engine starts. `src/job/continuation.ts`: a continuation copies its parent's `start-state.json` (since R-042 the
   only file it copies from its parent; Decision 16), so a write in an earlier run, a quota resume's included, is still a difference at the last run's end.
5. `src/job/finalize.ts`: for a read-only role, a `done` end (both paths of fact 4) becomes `failed`, kind
   `read-only-violation`, detail the difference, when `difference` is not null; a start state it cannot read, or a git
   failure at the end, is `failed`, `read-only-violation`, detail `unproven: <what could not be read>`, never `done`.
   A `failed` end keeps its own kind (one cause per job, A-016 (1)) and a `stopped` end keeps its state; both add a log
   line `read-only: <difference>` when there is one.
6. `test/fake-engine.mjs`: its active tools follow Pi 1.5.1 (the defaults plus every tool a hook registers without
   `--tools`, only the named built-in and registered tools with it), and R-038's model view lists exactly them as
   `mcp__custom-tools__<name>`. A script word that leaves an untracked file is added if none exists (named in
   `outcome.md`).
7. Texts (T-30, T-36, A-085):
   - `templates/researcher.md`: a clone or a download goes into a folder made by `mktemp -d`, never into the worktree
     (R-046 sets the final words);
   - `docs/jobs.md`: the kinds name `read-only-violation` (which roles are read-only, what is compared, the
     `unproven:` detail) and the job folder's `start-state.json`;
   - `docs/setup.md` → "Project skills": jobs load no skill (`--no-skills`); the coordinator session, started by hand,
     still loads what Pi finds;
   - `docs/commands.md` → "Pi extensions": an extension's tools reach a job only when its role's list names them, and
     no list does now.
8. Tests, each failing at HEAD with R-042 and R-044 done (T-29):
   - `test/runtime/roles.test.ts`, new: every table role has a `templates/<role>.md`; no list is empty; every list holds
     `finish`; no read-only role holds `edit` or `write`; exactly `reviewer`, `judge` and `researcher` are read-only;
     `COORDINATOR_SESSION` holds the four default tools and no skill.
   - `test/runtime/engine.test.ts`, new: the argv of each role holds its `--tools` list and `--no-skills`; a skill entry
     (a fixture passed as a parameter) gives `--skill <absolute path>`; an empty list throws.
   - `test/fake-engine.test.ts`: the fake's tools are the defaults and `finish` without `--tools`, the list with it, and
     a registered tool the list does not name is absent from the model view.
   - `test/job/read-only.test.ts`, new: `difference` on a commit, a moved branch, an untracked file, a changed tracked
     file and an ignored file (null); a file `--prepare` left before the start state is no difference.
   - `test/job/finalize.test.ts`: a read-only `done` with a difference, or with no readable start state, ends `failed`,
     `read-only-violation`; a `done:` stop of a reviewer that committed does too; a `failed` end keeps its kind and logs
     the difference; a worker's `done` with commits stays `done`.
   - `test/runtime/wrapper.test.ts`: a read-only job writes `start-state.json` before the engine starts, a writer does
     not; a git failure there ends the job `launch` with no engine started.
   - `test/cli/spawn.test.ts` (T-31 (3)'s fake scenario): a `--review` job whose script commits, and one that leaves an
     untracked file, end `failed`, `read-only-violation`; a reviewer's model view lists only `read`, `bash` and
     `finish`; a worker that commits ends `done`.
   - `test/cli/continue.test.ts`: a reviewer's continuation keeps the reviewer's list and its parent's start state, so
     a parent's untracked file fails the child's `done`.
   - `test/job/spawning.test.ts` (R-040's): `--role manual` and `--role styleguide` refuse with `ROLE_UNKNOWN`
     (Decision 16).

Files the criteria name that this ticket, R-040 or R-044 creates: `src/runtime/roles.ts`, `src/job/read-only.ts`,
`test/runtime/roles.test.ts`, `test/runtime/engine.test.ts`, `test/job/read-only.test.ts`, `test/job/spawning.test.ts`.

## Out of scope

- Applying the coordinator's entry: R-050's start script (D-123); until then the coordinator keeps Pi's defaults.
- A `tool_call` guard that parses `bash`: A-081 names the tool list a noise guard and the effect check the guarantee
  (z. 14).
- Writes outside the worktree and the job's branch (another ref, another checkout, a file elsewhere): A-081's check
  compares the worktree and the branch only (Risk); the job's own account and paths are stage 6's (R-048, T1).
- A reviewer moving its candidate branch: the worktree is detached, so a commit moves only `HEAD`, which the check
  compares (Decision 11).
- The role texts' wording and budgets (R-046); the tool list in the context message (R-039 carries none); research on
  its own account (R-078); Limen filing review and research reports (R-070).

## Acceptance

- AC-1: `node --test test/runtime/roles.test.ts` → exit 0.
- AC-2: `node --test test/runtime/engine.test.ts` → exit 0; `node --test test/u5-engine-stream.test.ts` → exit 0.
- AC-3: `node --test test/fake-engine.test.ts` → exit 0.
- AC-4: `node --test test/job/read-only.test.ts` → exit 0; `node --test test/job/finalize.test.ts` → exit 0.
- AC-5: `node --test test/runtime/wrapper.test.ts` → exit 0; `node --test test/job/spawning.test.ts` → exit 0.
- AC-6: `node --test test/cli/spawn.test.ts` → exit 0; `node --test test/cli/continue.test.ts` → exit 0.
- AC-7: `node adrian-rebuild/tools/fails-before.mjs test/runtime/roles.test.ts test/runtime/engine.test.ts
  test/fake-engine.test.ts test/job/read-only.test.ts test/job/finalize.test.ts test/runtime/wrapper.test.ts
  test/job/spawning.test.ts test/cli/spawn.test.ts test/cli/continue.test.ts` → exit 0, its output in `outcome.md` →
  `## Fails before`.
- AC-8: `git grep -q -e '--no-skills' -- src/runtime/engine.ts` → exit 0.
- AC-9: `git grep -q 'read-only-violation' -- docs/jobs.md` → exit 0.
- AC-10: `git grep -q 'mktemp -d' -- templates/researcher.md` → exit 0.
- AC-11: `git grep -q 'Put project skills in' -- docs/setup.md` → exit 1.
- AC-12: `node adrian-rebuild/tools/gate.mjs --out node_modules/.rebuild-review/R-045.gate` → exit 0.
- AC-13: `npx biome check --error-on-warnings .` → exit 0; `node adrian-rebuild/tools/check.mjs` → exit 0.
- AC-14 (judgment): no role text recommends a tool its list lacks, and none sends a write into a read-only role's
  worktree (T-36); every doc sentence describes behaviour present in the commit (T-30).

## Migration

None. The job folder gains an optional file (`start-state.json`) for new read-only jobs; an older job's folder has
none, and its continuation takes its own start state. No `spec/` or `.limen/` format, file name, CLI form or hook a
project loads changes; `--role` already refuses an unknown role after R-040.

## Risk

- A project whose checks, run by a reviewer, leave a file that `.gitignore` does not cover fails every review with
  `read-only-violation`. The detail names the paths; step 4.3's trial review shows it on the seat.
- A write outside the worktree and the branch is not detected (Out of scope); the tool list still keeps `edit` and
  `write` away from read-only roles.
- A continuation of a violating reviewer fails again at its end, since the difference stays; the coordinator starts a
  fresh review instead.
- A `done:` stop compares while the engine may still run; a write after the comparison and before the scope ends is
  not seen.
- Tools of a selected `--extension` package no longer reach a job; today's extensions are model routes, which register
  none.

## Rollback

`git revert $(git log --format=%H --grep='^R-045:' adrian-rebuild --)`. The older code ignores `start-state.json`, so no
reverse migration.

## Decisions

Settled by the documents when the ticket was written (2026-11-26, the main session's reading, not a night default; the
inventory's questions in `evidence/inventories/R-045.md` → section 8):
1. The read-only roles: `reviewer`, `judge`, `researcher` (A-081's Decision without the scout, T-33); `quality` writes
   its findings file (`templates/quality.md:3`), so it is a writer.
2. Where the lists live (Q1 (a)): R-044's role table, "the role definition" A-081 names (T-25 (1); R-044 Decision 13);
   a project file cannot widen a role (T-03).
3. The lists (Q2 (a)): A-081 removes only `write` and `edit`; `bash` stays for the reviewer's checks, the researcher's
   fetches and the judge's cited sources; no new tool adds fixed context (M-01); no list is empty (E-5).
4. Writers get an explicit list too (Q3 (a)): one rule, and a project's `defaultTools` under `--approve` (until R-048)
   cannot change a role (T-03, E-3).
5. Skills (Q4 (a)): `--no-skills` for every job, and a `skills` field per role mapped to `--skill`, empty now ("enabled
   per role", A-081); a path is the package's, so root-owned on the seat (A-025).
6. The check runs in `finalizeJob` (Q5 (a)), which both `done` paths pass (fact 4).
7. The start state (Q6 (a)): taken after setup and before the engine, so a file `--prepare` leaves is no write; ignored
   files are excluded, so `node_modules` is no write.
8. The researcher's clone (Q7 (a)): outside the worktree through `mktemp -d`; making it a writer contradicts A-081.
9. A role without an entry (Q8): settled by R-040 (package roles only, `ROLE_UNKNOWN`) and T-25 (1): the table is the
   one list of job roles, so `resolvePreamble` refuses a name outside it; no fallback list. This departs from the
   inventory's (a) (the writer list), which R-040 made moot.
10. The end's wake and alert (Q9): `failed:<kind>` alerts exist (A-066), so nothing new.
11. What is compared: the worktree's `HEAD`, the job's own branch and the status (A-081: "the worktree and branch …
    (git status, no new commits)"); a reviewer's `branch` names the candidate, not its own, so its `HEAD` stands for it.
12. Fail closed: a start state or an end state that cannot be read is `read-only-violation` with `unproven:`, never
    `done` (a silent false success is critical by the audit's scale); a start state that cannot be taken ends the job
    before its engine, kind `launch` (D-095).
13. The coordinator (inventory question A): D-123; the entry is `COORDINATOR_SESSION` beside the table, since the
    table's `coordinator` is the group team (R-044 Decision 9).
14. A continuation carries its parent's start state (the inventory's Unverified point on resumes): otherwise a quota
    resume after a write would start from the dirty state and end `done`.
15. 2026-11-26 D-125 (Adrian: "zgodnie z rekomendacjami"; Q-86, option 1): R-045 depends on R-042 as well as R-044:
    both change the `done` path of `finalizeJob` (`src/job/finalize.ts`), with `test/job/finalize.test.ts`,
    `src/runtime/wrapper.ts` and `test/cli/continue.test.ts`. The night re-reads R-042's changes there (D-025).
16. 2026-11-27, at activation (`e645561`; the main session, protocol step 2, D-025): the facts' places after R-038–R-044,
    R-041 and R-112. Fact 1: `argvFor` at `src/runtime/engine.ts:87`, still with no `--tools` and no skill flag (AC-8's
    grep exits 1); the wrapper's call at `src/runtime/wrapper.ts:250-263`; `finish` registered at `hook/finish.ts:21-22`.
    Fact 2: the role at `src/job/spawning.ts:318`, a continuation's at `src/job/continuation.ts:274`; R-044's table is
    `JOB_ROLES` (`src/runtime/roles.ts:15-24`), entries `{ name, module? }`. Fact 3: the transition to `running` and the
    setup at `src/runtime/wrapper.ts:155-195`. Fact 4: `finalizeJob` at `src/job/finalize.ts:102`, the stop paths at
    `src/job/stopping.ts:82` and `:125` (through `requestedEnd`), `read-only-violation` at `src/job/record.ts:72`, set by
    nothing. Fact 5 no longer holds: R-042 cut the task note, and a continuation copies no file of its parent
    (`docs/jobs.md:53`: "an older job's `note.md` and `note.first.md`, which nothing reads or copies any more"), so
    Change 4's copy of `start-state.json` is its only copy. Fact 6: `templates/researcher.md:7`, `docs/jobs.md:44` (the
    kinds, now with `launch` and `internal`), `docs/setup.md:99-101` ("Project skills"), `docs/commands.md:153` ("Pi
    extensions"). `resolvePreamble` (`src/job/spawning.ts:123-131`) accepts any `templates/<role>.md`, so `--role
    manual` and `--role styleguide` still start a job, while `--role communication` refuses since R-041 cut its file
    (D-134 (6)); Change 8's spawning test names `manual` and `styleguide`. The grep criteria at `HEAD`: AC-8, AC-9 and
    AC-10 exit 1, AC-11 exits 0, each confined to a path of `## Change`. AC-12 names the gate's `--out` form (D-130).
