<!-- PL: Ticket R-009 etapu 1 przebudowy: wycięcie roli scout (szablon, wiersze podręcznika koordynatora, osobna
pobudka po zakończeniu zadania scouta) oraz podpowiedzi wyszukiwania `jg` (sonda `jg --help` w hooku komunikacji
i sekcja `Cue: Search`), zgodnie z T-33, T-36 i A-081. Uruchomienie lub kontynuacja zadania z rolą scout odmawia
wierszem z tabeli `OLD_ROLES`, chyba że projekt ma własny `.agents/limen/scout.md`. Stan: zamknięty (19.11, nocny
przebieg; recenzja PASS w rundach 1 i 2). -->

# R-009 Cut the scout role and the `jg` cue

## Problem

Two author features that the seat never used still sit in the code and in the coordinator's context:
- The scout role: `templates/scout.md` is the role's preamble; the coordinator manual lists the scout as a job shape
  and recommends it with a table (`templates/agents.md:161`, `:163-171`); the completion wake treats a done job whose
  `role` file says `scout` apart: "Scout done. Nothing to land" and its own instruction (`src/job/wake-text.ts:77`,
  `:80-89`, `:102-105`); `test/u3-turn-signal.test.ts:1-2`, `:12`, `:15`, `:22-24` test that branch.
- The `jg` cue: on every session start the communication hook runs `jg --help` and, when its output names Jevgrep,
  adds the register's `## Cue: Search` section to the system prompt (`hook/communication.ts:1`, `:29`, `:166-168`,
  `:188-199`; `templates/communication.md:126`, `:152-155`; `CONTRIBUTING.md:29`), so what the prompt recommends
  depends on the host.

Relied on:
- T-33 (Rule): "The scout role is `rejected`. On the seat there were 0 scout jobs among 142 (84 worker, 58
  reviewer; …). The seam is the starting point in the ticket's Scope and the checked `--seam` (T-07), and the depth of
  investigation belongs to the worker (`templates/agents.md:183`); with `maxJobs` 1 a scout would serialise every
  ticket (a second queue, a start and window use); … The scout table (`templates/agents.md:173-183`) leaves the manual.
  A-081's list of read-only roles drops the scout. Migration: records with role scout are read as history (`limen
  stats`); a new spawn with role scout exits with code 2 and a `next`." (The line numbers are at `rebuild-base`; the
  same text is at `templates/agents.md:161-171` now.)
- T-36 (Rule): "A tool that a prompt recommends comes only from a declaration (a switch in `limits.json` or the system
  requirements of T-12), never from detection on the host; … `jg` is not on the seat (`command -v jg` exits
  non-zero), so the \"Cue: Search\" and its detection (the `jg --help` probe in `hook/communication.ts:196-207`) are
  cut, and searching uses the engine's tools (under the bridge, Pi's tools, E-5). `jg` is `rejected`." T-36 (Check):
  "a scan: hooks start no process to detect tools while the context message is built; a golden test that the context
  message is identical with and without `jg` on PATH; a test that a declared but missing tool gives exit code 4 at
  start."
- A-081, Decision: "fix — Per-role tool and skill lists in the role definition: read-only roles (scout, judge,
  researcher, reviewer) get no write or edit tools; … The tool list is a mistake and noise guard (Bash can still
  write); the effect check is the guarantee." The per-role lists and the effect check are R-045; this ticket's part is
  that the scout is no longer a role, so R-045's read-only roles are the judge, the researcher and the reviewer.
- `plan.md` → `## Tickets`, notes: "R-009, R-046: under the bridge Claude Code's subagent tool is always denied (E-5),
  so the condition of T-33 for a subagent in the coordinator's session does not hold; the manual recommends no
  subagent. A short question is the coordinator's own, a long one is a survey ticket (T-34)."
- E-5: "`Agent`, `Task`, `Skill`, `AskUserQuestion` and other Claude Code tools are always denied" under the bridge.
- `plan.md` → `## Stages`: "Stages 1–3 change no standing instruction that reaches the model on the seat: the `jg` cue
  that R-009 cuts never fired there (no `jg` on the seat, T-36), and their edits of role texts sit in Pi's system
  prompt, which the bridge drops (E-1)." Conventions: before R-013 a CLI change makes the old form exit non-zero with
  the replacement in the message; "Tests removed together with a cut feature are named in the outcome".
- R-007 (`src/old-names.ts`): removed roles are in `OLD_ROLES`, refused through `removedRole` by `resolvePreamble`
  (`src/commands/spawn.ts:65-79`) when neither the project's `.agents/limen/<role>.md` nor the package's template
  exists; the comment of `OLD_ROLES` says every cut ticket that removes a role adds its entry there. R-013 gives the
  refusal exit code 2 and `instead` in `next` (D-028).
- D-025: a criterion checks only the ticket's scope, as an exit code; a scan is this ticket's own only when every file
  it matches at the parent is one this ticket changes or deletes (checked at `HEAD` = `57c870a` for AC-2 and AC-3).
- D-029: a test that fails even once without a change of the code it runs is a finding; D-031: until R-019, a gate
  that fails only on `test/s9-housekeeping.test.ts:135` is recorded as an occurrence of A-087 and run once more.

## Change

Line numbers are at `57c870a`. "Goes" means the code is deleted with every import, helper, constant, type, parameter
and comment that only the removed code used.

1. Delete with `git rm`: `templates/scout.md` (it has no `templates/.history/` file).
2. The scout role goes from the code and the manual:
   - `src/job/wake-text.ts`: the `scout` constant (`:77`) and its three uses go; a done job gets the ordinary done
     handoff and instruction whatever its `role` file says, and a done job with open checks always gets the
     open-checks handoff (`:85`). No other wake text changes.
   - `templates/agents.md`: the scout shape (`:161`), the paragraph and table on when to use a scout (`:163-169`) and
     the escalation line (`:171`) go; the other shapes and the handoff paragraph (`:173`) stay. No sentence about
     subagents or a replacement for the scout is added (the survey sentence of T-34 is R-047's).
   - `src/old-names.ts`: `OLD_ROLES` gets `{ name: "scout", feature: "the scout role", ticket: "R-009", instead: "the
     coordinator answers a short question itself; a long one is a survey job, whose deliverable is a notes file" }`.
     The wording is the main session's, for Adrian at gate 5.1. `resolvePreamble` needs no change: a project with its
     own `.agents/limen/scout.md` keeps a role of that name.
3. The `jg` cue goes:
   - `hook/communication.ts`: `hasJevgrep` (`:188-199`), its cache `jevgrepSeen` (`:29`), the Search cue in
     `guidancePrompt` (`:166-168`) and the `node:child_process` import (`:1`) go, so building the context message
     starts no process.
   - `templates/communication.md`: the sentence "Search enters the system prompt only when `jg` identifies itself as
     Jevgrep." (`:126`) and the `## Cue: Search` section with its body (`:152-155`) go.
   - `CONTRIBUTING.md:29`: the list of stable guidance loses "the `jg` search rule when Jevgrep is installed".
4. `templates/.history/agents.md` and `templates/.history/communication.md` each get a new first line with the
   SHA-256 of the changed template and the date, above the existing lines (`test/structure.test.ts:33-46`; written
   with Edit, as R-007 did).
5. Tests (new and changed tests are written first and fail at `HEAD`, except where noted):
   - New `test/hook/communication.test.ts` (first written as `test/hook/context-tools.test.ts`, renamed with `git mv`
     after review round 1, see `## Decisions`): in a temporary project, the communication hook's `before_agent_start`
     result, for a coordinator session and for a job session, is identical with `PATH` unchanged and with a directory
     prepended to `PATH` that holds an executable `jg` whose `--help` prints `Jevgrep` and exits 0, and which writes a
     marker file whenever it runs; the marker file never exists. If the hook builds a per-turn cue from a handler
     other than `before_agent_start`, that output is compared the same way.
   - `test/cli/old-names.test.ts`: for the role `scout`, the four cases R-007 has for `picture`: `resolvePreamble`
     throws the scout line in a project without `.agents/limen/scout.md` and returns that file's path in a project
     with it; `limen spawn --role scout work` exits non-zero with the line on stderr and leaves `.limen/`, the
     worktrees and the branches unchanged; `limen continue` of a job started under a project's own
     `.agents/limen/scout.md` refuses with the line once that file is gone and leaves `.limen/` unchanged.
   - `test/u3-turn-signal.test.ts`: the scout assertions (`:22-24`), the scout words of the header comment (`:1-2`),
     the test name (`:12`) and the task text (`:15`) go; the other assertions stay. This change only removes, so the
     file passes at `HEAD`; the outcome says so.

## Out of scope

- Per-role tool and skill lists and the read-only effect check (A-081): R-045.
- The manual's sentence that a question the coordinator cannot answer from a few files is a survey ticket, and
  `ticket new --survey` (T-34): R-047 and R-065.
- The start check that a declared tool is present, with exit code 4 (T-36, third check; T-12): R-020 and R-049.
- Reading old records with role `scout` as history in `limen stats` (T-33): R-024. No code reads a record's role as
  `scout` after this ticket.
- `adrian-rebuild/tools/role-context.mjs:11` and `:148` and `adrian-rebuild/tools/context-size.mjs:151` keep `scout`
  and the `jg` probe, for measuring old refs (as R-007 kept `picture`).
- A board line in a project's `spec/build.md` that names a scout model: project data; no code reads it.
- The exit code 2 and `next` of the refusal: R-013. The command registry: R-014.

## Acceptance

- AC-1: `git ls-files -- templates/scout.md | grep -q .` → exit 1.
- AC-2: `git grep -q -I -i scout -- src hook bin templates test docs README.md CONTRIBUTING.md SECURITY.md
  package.json ':!src/old-names.ts' ':!test/cli/old-names.test.ts'` → exit 1. At `HEAD` every file it matches
  (`src/job/wake-text.ts`, `templates/agents.md`, `templates/scout.md`, `test/u3-turn-signal.test.ts`) is one this
  ticket changes or deletes (D-025).
- AC-3: `git grep -q -I -i -E '\bjg\b|jevgrep|Cue: Search' -- src hook bin templates docs README.md CONTRIBUTING.md`
  → exit 1. At `HEAD` every file it matches (`hook/communication.ts`, `templates/communication.md`, `CONTRIBUTING.md`)
  is one this ticket changes (D-025).
- AC-4: `git grep -q -e child_process -e '"Search"' -- hook/communication.ts` → exit 1.
- AC-5: `node --test test/hook/communication.test.ts` → exit 0.
- AC-6: `node --test test/cli/old-names.test.ts` → exit 0.
- AC-7: `node --test test/u3-turn-signal.test.ts` → exit 0; `node --test test/structure.test.ts` → exit 0.
- AC-8: `node adrian-rebuild/tools/fails-before.mjs` → exit 0: the new and changed test files fail at `HEAD`; the
  outcome names each changed file that passes at `HEAD` alone and why (`test/u3-turn-signal.test.ts`, item 5).
- AC-9: `node adrian-rebuild/tools/gate.mjs` → exit 0 with `fail 0`; the outcome names every test removed with the cut
  and the count before and after.
- AC-10: `node adrian-rebuild/tools/check.mjs` → exit 0; `npx biome check --error-on-warnings adrian-rebuild` → exit 0.
- AC-11 (judgment): the manual, the register, the wake and the comments say nothing of a scout, a packet from a
  helper or `jg`, and recommend no subagent; the job shapes and the handoff paragraph read as before.

## Migration

- CLI: `limen spawn --role scout …` and `limen continue` of a scout job refuse with the line of `OLD_ROLES` and write
  nothing, unless the project defines its own `.agents/limen/scout.md` (AC-6).
- On disk: none. The scout wrote only its job folder, and the `jg` probe wrote nothing, so no leftover entry is
  needed; job records with role `scout` stay as they are.

## Risk

- A scout job still running at the deployment ends with the ordinary done wake ("land it"), which has nothing to land.
  Deployment step 1.0 shows no running job first; the seat had 0 scout jobs (T-33).
- A coordinator on a host with Jevgrep loses the search hint; on the seat `jg` is absent, so nothing changes there
  (T-36).

## Rollback

`git revert $(git log --format=%H --grep='^R-009:' adrian-rebuild --)`; nothing on disk to restore.

## Decisions

- 2026-11-19 (main session): the refusal wording of the role `scout` is the main session's, for Adrian at gate 5.1.
- 2026-11-19 (main session): a done job whose `role` file says `scout` (an old record) gets the ordinary done wake;
  no code keeps the scout's own wake for old records, because the seat had no scout job (T-33).
- 2026-11-19 (main session, review round 1, PASS with five notes; `review.md`):
  - Note 5 is fixed: the new test file mirrors the module it tests (T-29 (1)), so `test/hook/context-tools.test.ts`
    becomes `test/hook/communication.test.ts`. The main session renames it with `git add` and `git mv`, because the
    implementer may not stage an addition and `git mv` refuses an untracked file; the content does not change.
  - Note 1 is fixed: the main session's own runs of `gate.mjs` and `fails-before.mjs` go into `outcome.md`.
  - Note 2: item 3's "starts no process" means no process that detects a tool (T-36). The communication hook can
    still start `git` through `listDrift` (drift detection of project copies of templates, `src/project/inherit.ts`);
    that call is outside this ticket, and R-039 (T-36 among its sources) meets it in its context-message scan.
  - Note 3 is rejected: "survey job" names what exists today, the job shape `survey` of the manual; survey tickets
    come with R-065 (T-34), which can change the line and the test together. The wording stays for Adrian at gate 5.1.
  - Note 4 is accepted: the reworded u3 test name and task text keep the remaining text true (outcome, deviation 1).
