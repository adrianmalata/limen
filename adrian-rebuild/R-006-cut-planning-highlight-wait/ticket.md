<!-- PL: Ticket R-006 etapu 1 przebudowy: wycięcie prywatnego planowania (zostaje tylko tryb `committed`), poleceń
`highlight`, `ticket-author`, `wait`, `planning` i `ticket series` oraz flag `continue --review` i `group status
--json` (G1.12, T-18, T-37, A-079). Każda wycięta nazwa odmawia jednym wierszem z tabeli starych nazw, a
`.limen/planning-source` trafia do rejestru plików pozostałych. Stan: zamknięty (18.11; recenzja PASS w rundzie 1). -->

# R-006 Cut private planning, `highlight`, `ticket-author`, `wait`, `ticket series`, `continue --review` and `group status --json`

## Problem

Seven features that gate 2 and the taste rules cut are still in the code:
- private planning, a second place for planning files outside Git, chosen by `limen planning` and
  `.limen/planning-source`, with branches through spawn, continue, groups, publication, lanes and the communication
  hook (`src/project/planning.ts`, `src/commands/planning-source.ts`); it has no test;
- `limen highlight`, which marks Limen's text in Herdr with `◆` (`src/commands/highlight.ts`, helpers in
  `src/integrations/herdr.ts:16-52`, `:132-174`, and the `/limen highlight` Pi command in `hook/wake.ts:972-991`);
- `limen ticket-author` (`src/commands/ticket-author.ts`, `ticketAuthor` in `src/project/git.ts:326-362`);
- `limen wait`, which the coordinator is refused (`src/commands/wait.ts:14-18`) and which only the test harness calls
  (`test/plant.ts:149-156`, 27 call sites);
- `limen ticket series`, which shares F numbers between projects (`src/project/series.ts`, `src/commands/ticket.ts:110-127`);
- `limen continue --review`, which continues a session as a reviewer (`src/commands/continue.ts:198`);
- `limen group status --json` (`src/commands/group.ts:461-480`, `allReceipts` `:598-606`).

Relied on:
- G1.12 (gate 2): "Private planning | cut; only `committed` stays". Gate 2 §1: "Both projects run planning mode
  `committed`."
- G1 table (gate 2): "`limen highlight` | cut".
- T-18: "(2) `ticket-author` is cut (`docs/jobs.md:206`, meant for collaborators; Adrian works alone; `git log
  --diff-filter=A --follow` replaces it)"; "`ticket series` is cut: the projects do not share tickets (Adrian
  confirmed)"; "`wait` is `rejected` …: Adrian does not use it, the coordinator is refused it, … the coordinator gets a
  wake after every job (A-033)". Migration: "an old name exits with code 2 (T-02) and names the new one in `next`; a
  ticket in the last stage of the plan removes the table of old names" (R-085).
- T-37: "`group status --json` is cut (no consumer in the code, `src/commands/group.ts:483-497`)"; a general `--json`
  is rejected.
- A-079, Decision: "… `continue --review` is cut; a re-review is always a new review job with the prior-findings
  file." The rest of A-079 (the saved context message) is another ticket's.
- `plan.md` → `## Stages`, stage 1: "Cut commands and flags refuse with a pointer (…, `highlight`, `ticket-author`,
  `wait`, `ticket series`, `continue --review`, …)"; conventions: before R-013, a non-zero exit with the replacement in
  the message; "Tests removed together with a cut feature are named in the outcome".
- `plan.md` → `## Tickets`, notes, R-014: "it also cuts `group wait`", so `group wait` stays here.
- R-003 → `ticket.md` → `## Decisions` and R-005: the refusals live in `src/old-names.ts` (`OLD_NAMES` with
  `removedCommand`, `OLD_FLAGS` with `removedFlag` and `refuseRemovedFlags`), so R-085 removes one file.
- R-001: every cut ticket registers the project-level leftover paths of its feature in `LEFTOVERS`
  (`src/project/leftovers.ts`: relative, normalised, outside `.git/`, no overlap with another entry or a `TRACKED`
  path).
- D-025: a criterion checks only the ticket's scope, as an exit code; a scan over the tree is this ticket's own only
  when every match it finds at the parent is one the ticket removes (checked at `HEAD` = `57a61cf` for AC-2: 26 files,
  each named in `## Change`).
- D-029: a test that fails even once without a change of the code it runs is a finding.

## Change

Line numbers are at `57a61cf`. "Goes" means the code is deleted with every import, helper, constant, type, parameter
and comment that only the removed code used.

1. Delete with `git rm`: `src/commands/planning-source.ts`, `src/commands/highlight.ts`,
   `src/commands/ticket-author.ts`, `src/commands/wait.ts`.
2. Private planning; the committed path is what remains in every branch:
   - `src/project/planning.ts`: `PlanningSource`, `planningSource`, `recordedPlanningSource`, `parsePlanningSource`
     (`:5-23`), the `source` of `inheritedPlanning` (`:28`, `:39`), `privatePlanningFile` (`:42-59`),
     `privatePlanningTask`, `privatePlanningGuidance` and `inside` (`:69-92`) go; `inheritedPlanning`, `ticketPointers`
     and `readIfPresent` stay, in this file under its name.
   - `src/commands/spawn.ts`: `SpawnPlace.source` and `source` (`:117`, `:253-286`, `:398`) and the private task
     rewrite (`:277-280`) go; `assertTicketsAtBase` runs always (`:311-313`); raw `--task-file` bytes are kept on
     `loaded.raw` alone (`:372-375`).
   - `src/commands/continue.ts`: `source`, `recordedPlanningSource` and `continuationTask` (`:150`, `:193-194`, `:224`,
     `:373-390`, `:423`) go; the continuation's task is the instruction.
   - `src/commands/group.ts`: `GroupActivation.source`, `groupPlanningSource` (`:120`, `:141-145`, `:160-171`,
     `:303`, `:311`) go; `checkGroupPacket` (`:219-244`) requires each existing packet file to be committed at `HEAD`;
     the ticket path is `${run.feature}/ticket.md` (`:330`).
   - `src/job/group-packet.ts:63-76`, `src/job/group-cabinet.ts:9`, `:28` (an old `run.json` with `planningSource`
     still reads), `src/job/publication.ts:70`, `:102` (no `planning-source` file in a new job folder),
     `src/project/lanes.ts:97-115` (`isGitRepository(root)` alone), `hook/communication.ts` (`:161-163`, `:232-239`,
     `privatePlanning` `:267-272`).
3. `highlight`: `src/integrations/herdr.ts` loses `LIMEN_MARK`, `HIGHLIGHT_LEGEND`, `highlightFile`, `highlightOn`,
   `saveHighlight`, `limenText`, `limenStateLabel`, `unmarked` (`:16-52`), `followHighlight` and `jobTabs`
   (`:132-174`); their call sites use the plain text (`:129`, `:182`, `:332`). `hook/wake.ts` imports only
   `herdrBinary` from Herdr (`:14-22`), drops `registeredProjects` if only highlight used it (`:51`, `:987`), and uses
   the plain label and state text (`:177-196`, `:365`, `:405`, `:419`). `TAB_TAIL` (`:88-89`) keeps the optional `◆`,
   because a tab labelled before the cut may still be open; its comment says so. The `/limen` Pi command
   (`:972-991`) loses `highlight` from its description and completions; when its first word is a name
   `removedCommand` holds, it notifies that line and returns, so `/limen highlight on` never falls through to the mute
   toggle (`:997`).
4. `ticket-author`: `ticketAuthor` (`src/project/git.ts:326-362`) and the imports only it used go.
5. `wait`: `src/main.ts` drops the command. `test/plant.ts`: `waitJob` no longer runs `limen wait`; it waits for a
   terminal `state` in the job's folder, under `options.cwd` when given (`test/s1-spawn.test.ts:117`,
   `test/s9-housekeeping.test.ts:86`), without sleeping (`test/plant.ts:3`), and keeps its signature and synchronous
   call sites if it can (for example by a child `node` process that watches the file); if it must become async, every
   call site awaits it. Its comments (`:3`, `:149`, `:171`) name what it does now.
6. `ticket series`: `src/project/series.ts` keeps ticket numbering and archive rows: `withNextTicketCode` is the
   non-series path (`:53`), `takenElsewhere` reads archive rows only (`:62-83`), and `Series`, `SERIES_NAME`,
   `seriesRoot`, `plantSeries`, `setSeries`, `readMark`, `seriesNext`, `readSeries`, `writeAtomic` (`:22`, `:41-42`,
   `:135-183`, `:229-237`) go with their imports. `src/commands/ticket.ts` loses `ticketSeries`, its dispatch and help
   (`:17`, `:28-30`, `:98`, `:110-127`) and refuses `ticket series` (item 8). `src/commands/land.ts:316` and
   `src/main.ts:133`, `:136` drop the series text.
7. `continue --review` and `group status --json`:
   - `src/commands/continue.ts`: the `review` option and its uses (`:66`, `:112-116`, `:164`, `:174-175`, `:238`,
     `:453`, `:499-503`) go; the role is the parent's (`(await text(`${parentDir}/role`)) || "worker"`, `:198`);
     `review` stays in the parse table and is refused after parsing, as `tab` is (`:82-84`).
   - `src/commands/group.ts`: the `--json` branch and its argument check (`:461-480`) and `allReceipts` (`:598-606`)
     go; `group status` takes at most a group id; `--json` is refused before `:410` takes the first word as a group id
     and before `syncLifecycle` writes anything. The text form and `group wait` stay.
8. Refusals in `src/old-names.ts`:
   - `OLD_NAMES`: `planning` (feature "private planning"; instead "planning files are committed to Git"),
     `highlight` (feature "the Herdr highlight"; instead "Herdr shows Limen's tabs without a mark"), `ticket-author`
     (instead "git log --diff-filter=A --follow -- <ticket path>"), `wait` (instead "the coordinator gets a wake when
     a job ends"), `ticket series` (feature "ticket series"; instead "each project numbers its own tickets"), each
     with `ticket: "R-006"`. `src/commands/ticket.ts` refuses `ticket series` with `removedCommand("ticket series")`
     before its help.
   - `OLD_FLAGS`: `continue --review` (instead "a re-review is a new review job: limen spawn --review") and `group
     status --json` (instead "limen group status shows the run").
   - `LEFTOVERS` gets `.limen/planning-source` with the feature `private planning (R-006)`.
9. Help, docs and templates say nothing of the cut features and nothing the code does not do: `src/main.ts` (the
   commands, the union and the help lines of items 1–7), `README.md:58`, `docs/commands.md` (`:21`, `:105-120`,
   `:150`, `:174-185`, `:195-203`, `:226-234`), `docs/groups.md` (`:31`, `:77`, `:99`), `docs/herdr-status.md:92-141`,
   `docs/jobs.md` (`:33-37`, `:200-221`), `templates/agents.md` (`:140-147`, `:179`), `templates/worker.md:13`,
   `templates/coordinator.md:11`, with the first line of each changed `templates/.history/<name>` set to the new
   template's SHA-256 (`test/structure.test.ts:33-46`, written with Edit, D-016).
10. Tests:
    - Go with the cut: `test/s6-keeper.test.ts:63-79` (ticket-author) and the series half of `:81-102` (`:93-99`; the
      test keeps its archive-row assertion and is renamed); their now unused imports and header words.
    - Changed: `test/s8-groups.test.ts:158-165` reads the group's events from `.limen/groups/<group>/events/*.json`
      after the text `group status`, instead of `--json`; `test/plant.ts` (item 5) and its callers if it becomes async.
    - New tests, written first and failing at `HEAD`: in `test/cli/old-names.test.ts`, `limen planning private`,
      `limen highlight on`, `limen ticket-author <path>`, `limen wait <id>`, `limen ticket series a b`, `limen continue
      <id> --review x` and `limen group status --json` each exit non-zero with their line on stderr and leave `.limen/`
      unchanged, and `limen continue <id> --label --review x` still reads `--review` as the label; in
      `test/cli/status.test.ts`, a project with `.limen/planning-source` lists it under `Leftover files` with
      `(private planning (R-006))`; in `test/cli/old-names.test.ts`, a test that `/limen highlight on` in the wake hook
      notifies the refusal and leaves the mute state unchanged.

## Out of scope

- `limen group wait` (R-014); the command registry and its subcommand refusals (R-014); typed refusals with code 2
  and `next` (R-013).
- Seat-level files of the cut features (`$LIMEN_HOME/.limen/highlight`, `$LIMEN_HOME/.limen/series/<NAME>/`):
  `LEFTOVERS` holds project paths only, and nothing reads them after the cut; the outcome names them for Adrian.
- `docs/picture.md` (`:33`, `:49-55`) and `templates/picture/CONTRACT.md:55` (series and highlight text in the
  Picture docs): R-007 cuts the Picture viewer and its docs next, before any deployment; AC-2 excludes them.
- Renaming `src/project/planning.ts` or `src/project/series.ts` after the cut (T-18 cleanup, R-082 and R-083).
- The saved context message of A-079 for continuations.

## Acceptance

- AC-1: `git ls-files -- src/commands/planning-source.ts src/commands/highlight.ts src/commands/ticket-author.ts
  src/commands/wait.ts | grep -q .` → exit 1.
- AC-2: `git grep -q -i -E 'highlight|ticket-author|ticketAuthor|planning-source|planningSource|PlanningSource|privatePlanning|private planning|seriesRoot|setSeries|plantSeries|SERIES_NAME|readSeries|ticket series|allReceipts|limen wait\b|continue --review'
  -- src hook bin templates test docs README.md CONTRIBUTING.md SECURITY.md package.json ':!src/old-names.ts'
  ':!test/cli/old-names.test.ts' ':!src/project/leftovers.ts' ':!test/cli/status.test.ts' ':!test/cli/old-hosted.test.ts'
  ':!docs/picture.md' ':!templates/picture'` → exit 1. At `HEAD` every file it matches is one this ticket changes or
  deletes (D-025); `hook/wake.ts` finds the refusal through `removedCommand`, without the word.
- AC-3: `git grep -q -e '--json' -- src/commands/group.ts docs/groups.md` → exit 1, and `git grep -q -F '[--json]'
  -- src/main.ts docs/commands.md` → exit 1.
- AC-4: `node --test test/cli/old-names.test.ts` → exit 0.
- AC-5: `node --test test/cli/status.test.ts` → exit 0.
- AC-6: `node adrian-rebuild/tools/fails-before.mjs` → exit 0: the new and changed test files fail at `HEAD`; the
  outcome names each changed file that passes at `HEAD` alone and why.
- AC-7: `node adrian-rebuild/tools/gate.mjs` → exit 0 with `fail 0`; the outcome names every test removed with the cut
  and the count before and after.
- AC-8: `node adrian-rebuild/tools/check.mjs` → exit 0; `npx biome check --error-on-warnings adrian-rebuild` → exit 0.
- AC-9 (judgment): spawn, continue, group start and land behave as at `HEAD` for a project in committed mode (no
  `.limen/planning-source`, or one that says `committed`): every removed branch was taken only in private mode, for a
  highlight that is on, for a series, for `--review` or for `--json`.
- AC-10 (judgment): the help, docs and templates of item 9 say nothing of the cut features and nothing the code does
  not do.

## Migration

- CLI: the five commands and two flags refuse with their lines and write nothing (AC-4).
- On disk: `.limen/planning-source` becomes a leftover file (`limen status` lists it, `limen init --drop-leftovers`
  removes it; AC-5). Both projects are in committed mode (gate 2 §1), so no project changes mode. A job folder's
  `planning-source` file and a `run.json`'s `planningSource` key from before the cut are ignored.
- On the seat, outside the projects: `$LIMEN_HOME/.limen/highlight` and `$LIMEN_HOME/.limen/series/` may exist if
  either was ever used; Adrian may delete them (outcome).

## Risk

- A project in private mode would silently become committed: spawn and `group start` would refuse uncommitted tickets
  and packets, and land would commit planning folders. Gate 2 §1 rules it out on the seat.
- The `waitJob` rewrite touches every test that waits for a job; the gate runs all of them.
- A removed export that another module still needs breaks the build; the gate's `tsc --noEmit` catches it.

## Rollback

`git revert $(git log --format=%H --grep='^R-006:' adrian-rebuild --)`; the leftover file is not removed until
Adrian runs `limen init --drop-leftovers`.

## Decisions

- 2026-11-18 (main session): `limen planning` is cut whole: with one mode left it would only print a constant (G1.12).
- 2026-11-18 (main session): `ticket series` is refused inside `ticket.ts` through an `OLD_NAMES` entry; the registry
  of R-014 takes over subcommand refusals.
- 2026-11-18 (main session): `planning.ts` and `series.ts` keep their names and the code that remains; a rename waits
  for the cleanup tickets.
- 2026-11-18 (main session): the refusal wordings are the main session's, for Adrian at gate 5.1.
- 2026-11-18 (main session, review round 1, `review.md`): the implementer's deviations are accepted: `ticket.ts`
  refuses through `removedCommand` of `ticket` and its first word, and `group status` through `refuseRemovedWords`, because
  AC-2 and AC-3 ban the literal words outside `src/old-names.ts`; the four `feature` wordings "ticket authorship",
  "waiting on a job", "reviews in a continued session" and "the JSON group status" stand, for Adrian at gate 5.1.
