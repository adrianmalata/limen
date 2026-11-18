<!-- PL: Wynik ticketu R-006: wycięte prywatne planowanie (zostaje tylko tryb `committed`), polecenia
`planning`, `highlight`, `ticket-author`, `wait` i `ticket series` oraz flagi `continue --review` i `group status
--json`; każda wycięta nazwa odmawia jednym wierszem z `src/old-names.ts`, a `.limen/planning-source` jest plikiem
pozostałym. `waitJob` w testach nie woła już `limen wait`, tylko proces potomny node obserwuje plik `state`. Plik podaje
dowody (bramka 108/108, testy padające przed zmianą, usunięte testy), odstępstwa i punkty otwarte. Recenzja: PASS
w rundzie 1 (odpowiedź wysłana drugi raz z powodu formatu). Stan: zamknięty (18.11). -->

# Outcome: R-006 Cut private planning, `highlight`, `ticket-author`, `wait`, `ticket series`, `continue --review` and `group status --json`

## Done

- Item 1: `git rm` of `src/commands/planning-source.ts`, `src/commands/highlight.ts`,
  `src/commands/ticket-author.ts` and `src/commands/wait.ts`.
- Item 2, private planning; the committed path is what remains:
  - `src/project/planning.ts` keeps `inheritedPlanning` (it returns `{ root, repo? }`), `ticketPointers` and
    `readIfPresent`; `PlanningSource`, `planningSource`, `recordedPlanningSource`, `parsePlanningSource`,
    `privatePlanningFile`, `privatePlanningTask`, `privatePlanningGuidance` and `inside` are gone with their imports.
  - `src/commands/spawn.ts`: `SpawnPlace.source` is gone; `spawnTaskText` is synchronous and only does the workspace
    rewrite; `assertTicketsAtBase` runs always; `--task-file` bytes are kept whenever `loaded.raw`; no
    `planningSource` in the published record.
  - `src/commands/continue.ts`: `source`, `recordedPlanningSource` and `continuationTask` are gone; the continuation's
    task is `options.instruction`, which is what `continuationTask` returned in committed mode.
  - `src/commands/group.ts`: `GroupActivation.source` and `groupPlanningSource` are gone; `checkGroupPacket` is
    synchronous and requires each existing packet file to be committed at `HEAD`; the team ticket is
    `${run.feature}/ticket.md`.
  - `src/job/group-packet.ts` (the approach note inline, the ticket and brief as relative paths),
    `src/job/group-cabinet.ts` (no `planningSource` in `GroupRun`; `readRun` still parses an old `run.json` that has
    the key, because it never checked it), `src/job/publication.ts` (no `planning-source` file in a new job folder),
    `src/project/lanes.ts` (`isGitRepository(root)` alone; its doc says "In a Git repository"),
    `hook/communication.ts` (no private guidance block; the Vision and Board cue lines are the committed text;
    `privatePlanning` is gone).
- Item 3, `highlight`: `src/integrations/herdr.ts` lost `LIMEN_MARK`, `HIGHLIGHT_LEGEND`, `highlightFile`,
  `highlightOn`, `saveHighlight`, `limenText`, `limenStateLabel`, `unmarked`, `followHighlight` and `jobTabs`, with the
  imports only they used (`mkdirSync`, `readFileSync`, `rmSync`, `writeFileSync`, `join`, `seatDir`); the tab rename,
  the seat notification title and the tab label pass the plain text. `hook/wake.ts` imports only `herdrBinary` from
  Herdr and no longer imports `registeredProjects`; the display agent, title, `limen` token, the two state labels
  (`idle=<label>`, `done=<label>`, the off values of `limenStateLabel`), the tab tail, the footer line and the
  notification title are plain text. `TAB_TAIL` keeps the optional `◆`; its comment says a tab labelled before R-006
  may still be open. The `/limen` Pi command lost `highlight` from its description and completions; when its first word
  is a name `removedCommand` holds, it notifies that line and returns, so `/limen highlight on` no longer reaches the
  mute toggle.
- Item 4: `ticketAuthor` is gone from `src/project/git.ts` with `realpathSync`, `dirname` and `relative`.
- Item 5, `wait`: `src/main.ts` drops the command. `test/plant.ts`: `waitJob` keeps its signature and stays
  synchronous: it runs a child `node --input-type=module --eval` (the `WAITER` script, empty environment) that watches
  `<options.cwd ?? plant.root>/.limen/jobs/<id>` and prints the state once it is one of `TERMINAL_STATES` (imported
  from `src/job/job.ts`); a missing state, or one that is neither `running` nor terminal, fails it, as `limen wait`
  failed. It re-checks once a second, as `until` does, and never sleeps. No call site changed. The comments at `:3`,
  the new `waitJob` doc and the `until` doc name what it does now.
- Item 6, `ticket series`: `src/project/series.ts` keeps numbering and archive rows: `withNextTicketCode` is the
  former non-series path, `takenElsewhere` reads archive rows only, and `Series`, `SERIES_NAME`, `seriesRoot`,
  `plantSeries`, `setSeries`, `readMark`, `seriesNext`, `readSeries` and `writeAtomic` are gone with their imports
  (`mkdirSync`, `renameSync`, `rmSync`, `statSync`, `writeFileSync`, `seatDir`, `withSeatLock`). `ticketCode` and
  `ticketFolders` are no longer exported (only this module uses them now). The module description moved from the
  `Series` doc to a header comment. `src/commands/ticket.ts` lost `ticketSeries`, its dispatch, its help line, the
  series-lock comment and the `resolve` import; `src/commands/land.ts:316` and the `ticket new` help line no longer
  name a series.
- Item 7: `src/commands/continue.ts` lost the `review` option and its uses: the model default is
  `defaultModel(false)`, the role is the parent's (`(await text(`${parentDir}/role`)) || "worker"`), and the last
  line before the id is `continued <label> in <parent>'s session`; `review` stays in the parse table under the
  "Removed: refused after parsing" comment and `refuseRemovedFlags` refuses it. `src/commands/group.ts` lost the
  `--json` branch, its argument check and `allReceipts` (with `readdir` and `groupEvents` from its imports);
  `group status` takes at most the group id ("invalid group status arguments; run limen group status <id>" for the
  lead, without the id for a member); the removed flag is refused in `runGroupCommand` before `rest.shift()` reads the
  first word and before `syncLifecycle`. The text form and `group wait` are unchanged.
- Item 8, `src/old-names.ts`: `OLD_NAMES` has `planning`, `highlight`, `ticket-author`, `wait` and `ticket series`;
  `OLD_FLAGS` has `continue --review` and `group status --json`; a new `refuseRemovedWords(command, words)` refuses a
  removed flag among a hand-parsed command's words (Deviations 2). `src/commands/ticket.ts` refuses with
  `removedCommand(`ticket ${args[0] ?? ""}`)` before anything else (Deviations 1). `LEFTOVERS` has
  `.limen/planning-source` with the feature `private planning (R-006)`.
- Item 9, help, docs and templates: `src/main.ts` (imports, `COMMANDS`, the union, the `planning`, `wait`,
  `ticket-author`, `ticket series` and `highlight` lines gone, `[--review]` and `[--json]` gone, the `ticket new` and
  `group status` comments), `README.md:58` (paragraph gone), `docs/commands.md` (`[--review]`; the Tickets intro and
  block; the "Shared series" paragraph; the archive-register tail; `[--json]`; the Project setup intro, the
  `planning` line and its paragraph; the "Herdr highlight" and "Scripts" sections), `docs/groups.md` (the private
  planning paragraph; "Members omit `GROUP-ID`. The full run, its events and their receipts are JSON files in
  `.limen/groups/GROUP-ID/`." replaces the `--json` sentence; the filing sentence without the two modes),
  `docs/herdr-status.md` (the whole "See what Limen added" section), `docs/jobs.md` (`:37`; the "Ticket authorship"
  section), `templates/agents.md` (the planning paragraph; "Commit the feature folder before spawn …"; the `limen wait`
  sentences; "commit `review-N.md` on the candidate branch before any repair spawn"; `wait` out of the id list),
  `templates/worker.md:13` and `templates/coordinator.md:11` (no series). `templates/.history/{agents,worker,
  coordinator}.md` each got the new SHA-256 as a new first line dated 2026-11-18, written with Edit (D-016):
  `51ce9e41…`, `617c5cfe…`, `762c67b2…`.
- Item 10, tests: `## Tests removed with the cut` and `## Fails before`.

## Proof

Implementer's runs, from the repository root:

- `node adrian-rebuild/tools/gate.mjs` before the change (HEAD `57a61cf` plus the main session's `plan.md` edit) →
  exit 0; tests 102, pass 102, fail 0, cancelled 0, skipped 0 (62.0 s).
- After the change, one run → exit 0; tests 108, pass 108, fail 0, cancelled 0, skipped 0 (58.4 s).
- `npx tsc --noEmit` → exit 0. `npx biome check --error-on-warnings .` → exit 0 (156 files).
- `node adrian-rebuild/tools/check.mjs` → exit 0, 0 errors (93 PL summaries, 11 ticket folders).
  `npx biome check --error-on-warnings adrian-rebuild` → exit 0 (28 files).
- AC-1: `git ls-files -- src/commands/planning-source.ts src/commands/highlight.ts src/commands/ticket-author.ts
  src/commands/wait.ts | grep -q .` → exit 1.
- AC-2: the ticket's `git grep -q -i -E 'highlight|ticket-author|…|continue --review' -- src hook bin templates test
  docs README.md CONTRIBUTING.md SECURITY.md package.json` with its seven exclusions → exit 1 (working tree, deletions
  staged).
- AC-3: `git grep -q -e '--json' -- src/commands/group.ts docs/groups.md` → exit 1; `git grep -q -F '[--json]' --
  src/main.ts docs/commands.md` → exit 1.
- AC-4, AC-5: `node --test test/cli/old-names.test.ts test/cli/status.test.ts` → exit 0, 21 of 21 (14 and 7).
- AC-6: the main session's run: `node adrian-rebuild/tools/fails-before.mjs` → exit 0, "fails-before:
  test/cli/old-names.test.ts, test/cli/status.test.ts, test/s6-keeper.test.ts, test/s8-groups.test.ts fail at HEAD
  (exit 1)". The per-file results below are the implementer's own runs of the new tests against the unchanged source.
- The main session's gate: `node adrian-rebuild/tools/gate.mjs` → exit 0, tests 108, pass 108, fail 0 (59.4 s).

## Fails before

The new tests were written before any source change and run against the unchanged source (the tree was `HEAD` plus
the new test files): `node --test --test-timeout=180000 test/cli/old-names.test.ts` → exit 1, 5 of 14 fail;
`node --test --test-timeout=180000 test/cli/status.test.ts` → exit 1, 1 of 7 fails. Shortened: stack frames and the
plant's temporary paths are left out.

```
✖ limen planning, highlight, ticket-author and wait refuse with one removal line each and leave .limen/ unchanged
    [ 'planning',
  +     false, ''
  -     true, 'limen planning was removed with private planning (R-006); planning files are committed to Git\n' ],
    [ 'highlight',
  +     false, ''
  -     true, "limen highlight was removed with the Herdr highlight (R-006); Herdr shows Limen's tabs without a mark\n" ],
    [ 'ticket-author',
  +     false, ''
  -     true, 'limen ticket-author was removed with ticket authorship (R-006); git log --diff-filter=A --follow -- <ticket path>\n' ],
    [ 'wait', true,
  +     'no job matches "2026-11-18-none-1a2b3c4d"\n'
  -     'limen wait was removed with waiting on a job (R-006); the coordinator gets a wake when a job ends\n' ]
✖ limen ticket series refuses with one removal line, with or without names, and leaves .limen/ unchanged
  AssertionError [ERR_ASSERTION]: ticket series   (status 0: `ticket series` printed the series)
✖ limen continue --review refuses a finished job with one removal line and leaves .limen/ unchanged
  + [ false, '' ]
  - [ true, 'limen continue --review was removed with reviews in a continued session (R-006); a re-review is a new review job: limen spawn --review\n' ]
✖ limen group status --json refuses with one removal line before a group id is read and leaves .limen/ unchanged
  + 'no group record for --json; run limen group start FEATURE with the group settings\n'
  - 'limen group status --json was removed with the JSON group status (R-006); limen group status shows the run\n'
✖ /limen highlight on in a coordinator session notifies the removal line and leaves the wake mute state unchanged
  + 'limen highlight on\n' + '◆ Limen: text Limen wrote into Herdr. No mark: native Herdr or Pi.'
  - "limen highlight was removed with the Herdr highlight (R-006); Herdr shows Limen's tabs without a mark"
✖ limen status lists a .limen/planning-source left by the cut private planning as a leftover file
  AssertionError [ERR_ASSERTION]: Plant …/repo … (no "Leftover files (1)" header)
```

Passes at `HEAD` by design:
- "continue --label --review reads --review as the label and continues the job in its own role"
  (`test/cli/old-names.test.ts`): a guard, as "spawn --label --tab …" is for R-005. At `HEAD` `--label` already took
  the next word as its value; the test fails only if the refusal of `--review` ever reads a label value as the flag.

Changed test files that pass at `HEAD` alone (the main session ran the two of them without the new files:
`node adrian-rebuild/tools/fails-before.mjs test/s6-keeper.test.ts test/s8-groups.test.ts` → exit 1, "pass at HEAD,
so they do not show the change", 10 of 10):
- `test/s6-keeper.test.ts`: it only loses a removed test and the series half of another; what stays asserted held at
  `HEAD`.
- `test/s8-groups.test.ts`: the text `group status` and the event files in `.limen/groups/<group>/events/` both exist
  at `HEAD`; only `--json` is gone.
- `test/plant.ts` (no test file): its callers pass at `HEAD` with either `waitJob`, because a job folder's `state` is
  what `limen wait` read.

## Tests removed with the cut

Before 102 tests, after 108: 1 removed, 7 added.

Removed:
1. "ticket-author resolves aliased paths and invents no author for others" (`test/s6-keeper.test.ts:63-79`), with
   the `symlink` import.

Changed, not removed:
- `test/s6-keeper.test.ts`: "cancelled and archived numbers stay taken, a series never gives a number twice, and
  readers follow" is "cancelled and archived numbers stay taken, and readers follow"; it lost the series half
  (`:93-99`: the `api` project, `ticket series pair`, the four parallel `ticket new`, the `ticket series` output) and
  the `F010-x` / `F010-q` clash, which only the series made; it keeps `F012-c … archive.tsv:2`. The imports `start`,
  `repository` and `symlink` went; the header comment names what the file tests now.
- `test/s8-groups.test.ts`: `doneEvents` runs the text `limen group status <group>` (it still publishes lifecycle),
  then reads the event files in `.limen/groups/<group>/events/*.json` (the `.tmp` files of an atomic write excluded).
- `test/plant.ts`: `waitJob` (item 5).

Added:
- `test/cli/old-names.test.ts`: "limen planning, highlight, ticket-author and wait refuse with one removal line each
  and leave .limen/ unchanged"; "limen ticket series refuses with one removal line, with or without names, and leaves
  .limen/ unchanged"; "limen continue --review refuses a finished job with one removal line and leaves .limen/
  unchanged"; "continue --label --review reads --review as the label and continues the job in its own role"; "limen
  group status --json refuses with one removal line before a group id is read and leaves .limen/ unchanged"; "/limen
  highlight on in a coordinator session notifies the removal line and leaves the wake mute state unchanged".
- `test/cli/status.test.ts`: "limen status lists a .limen/planning-source left by the cut private planning as a
  leftover file".

Notes on the new tests: `wait` and `group status` use an id that names nothing, because the refusal reads no record;
the `continue --review` test snapshots `.limen/` only after the parent's wrapper removed `pid` and `born` (the
`settled` helper), the last writes `finalizeJob` makes to the job folder, so the snapshot cannot race the parent's
finish; the hook test runs the fake engine with the real `hook/wake.ts` and sends a bare `/limen` after
`/limen highlight on`, whose notice (`limen wake off…`) shows that the mute state was still unmuted.

## Deviations from the ticket

1. Item 8 says `src/commands/ticket.ts` refuses with `removedCommand("ticket series")`. AC-2 forbids the words
   "ticket series" in `src/` outside `src/old-names.ts`, so `ticket.ts` looks up `removedCommand(`ticket ${args[0] ??
   ""}`)` as its first step; the `OLD_NAMES` entry `ticket series` (with a comment that `ticket` refuses it itself)
   gives the line. The `removedCommand` doc says a subcommand is named with its command.
2. Item 7 says `--json` is refused before `:410`. AC-3 forbids `--json` in `src/commands/group.ts`, so the refusal
   cannot name the flag there. `src/old-names.ts` has `refuseRemovedWords(command, words)` beside
   `refuseRemovedFlags`: it refuses the first `OLD_FLAGS` entry of the command found among the unparsed words. `group
   status` calls it before the group id is read; R-085 still removes one file.
3. The ticket gives the `instead` of four entries but not their feature. Chosen from the sources, for the main
   session to confirm or change (the refusal wordings are the main session's, `## Decisions`): `ticket-author` →
   "ticket authorship" (`docs/jobs.md`'s section title), `wait` → "waiting on a job", `continue --review` → "reviews
   in a continued session" (A-079: "continues a session as a reviewer"), `group status --json` → "the JSON group
   status".
4. `group status` with an extra word: at `HEAD` the message named `limen group status <id> --json`, which a member
   cannot run (members omit the id). It now names `limen group status <id>` for the lead and `limen group status` for
   a member.
5. `docs/groups.md:77`: instead of only dropping the `--json` sentence, one sentence says where the run, its events
   and their receipts are (`.limen/groups/GROUP-ID/`, `groupPath` in `src/job/group-cabinet.ts:48`), which the
   "Delivery evidence" section needs once `--json` is gone.
6. `docs/herdr-status.md`: the whole section `:92-141` went, including the Herdr colour config example, which only
   coloured the mark.
7. `src/project/series.ts`: `ticketCode` and `ticketFolders` are no longer exported; only the removed series code used
   them outside the module.

## Measurement

- unmeasured, M-01: the role texts shrink: `templates/agents.md` 43,268 → 42,392 bytes, `templates/worker.md` 6,374
  → 6,347, `templates/coordinator.md` 1,990 → 1,963. Under the bridge these texts do not reach the model at stage 1
  (E-1); M-01 is measured from stage 4.
- M-10 (gate run time): 58.4 s in the run above (62.0 s before the change); recorded at the close of the stage.
- No seat step: the ticket's API column is `—`. What Herdr shows changes only for a seat where the highlight was on.

## Open points

1. For Adrian (seat, outside the projects): `$LIMEN_HOME/.limen/highlight` (`~/.limen/highlight` by default) and
   `$LIMEN_HOME/.limen/series/<NAME>/` (`plants`, `mark`, `mark.lock/`) may exist if either feature was used. Nothing
   reads them after the cut; he may delete them. `LEFTOVERS` holds project paths only.
2. Before deployment (gate 2 §1 says both projects are committed): `cat <project>/.limen/planning-source` in both
   projects should print nothing or `committed`. A project in private mode would silently become committed (the risk
   in `ticket.md`). After deployment `limen status` lists the file under `Leftover files`.
3. Job folders from before the cut keep their `planning-source` file, and a group `run.json` its `planningSource`
   key; nothing reads either, and both go with their records.
4. R-007 (out of scope here): `docs/picture.md:55` links to `herdr-status.md#see-what-limen-added`, which no longer
   exists, and names `limen highlight`; `docs/picture.md:33` and `templates/picture/CONTRACT.md:55` name the series;
   the comment at `picture/viewer/viewer.css:596` says Herdr's `◆` text takes the same accent (`docs/herdr-status.md`).
5. `templates/agents.md` lost "`limen wait` refuses a running job … Scripts may use it." and adds nothing in its
   place; the T-34 sentence ("Limen wakes you when a job ends; end your turn instead of waiting") comes with R-047.
6. R-013: the bare catches of `highlightOn` (`src/integrations/herdr.ts:26`), `src/commands/wait.ts:62` and the
   `followHighlight` call in `hook/wake.ts:987` are gone with the cut, so R-013 has three fewer to rework; the
   coordinator refusal of `wait` disappears instead of becoming typed.
7. The refusal wording, including Deviations 3, is for Adrian to confirm at gate 5.1 (`ticket.md` → `## Decisions`).
