<!-- PL: Ticket R-007 etapu 1 przebudowy: wycięcie przeglądarki Picture (viewer, strona `/`, `map.html`) oraz zadań
mapy (`picture tick`, `picture watch` i rola `picture`), zgodnie z G1.4, §6 bramki 2 i częścią decyzji A-048. Zostają
model danych, `picture build` jako sprawdzenie bez strony HTML i `picture serve` z `/activity.json` i `/events`. Stare
formy odmawiają wierszem z tabeli starych nazw, a pliki po wyciętych funkcjach, także hook `reference-transaction`
z oznaczeniem Limena, trafiają do rejestru plików pozostałych. Decyzją Adriana (D-034) ticket naprawia też helper
testów `waitJob` (A-088). Stan: zamknięty (19.11; recenzja PASS w rundzie 1). -->

# R-007 Cut the Picture viewer and the map jobs

## Problem

The Picture UI and the model jobs that maintain the map are still in the code, and the viewer sits on the ticket-check
path:
- `limen picture build` loads the viewer (`picture/viewer/*`, 5,150 lines) through `pictureHtml` before any diagnostic
  (`src/picture/picture-build.ts:29-38`, `src/picture/html.ts:22-34`) and writes `map.html`; the role prompts run it
  as the ticket check with `--out /tmp/check.html` (`templates/worker.md:16`, `templates/coordinator.md:14`,
  `templates/keeper.md:16`);
- `limen picture serve` builds and serves the same page on `/` (`src/picture/picture-serve.ts:24-25`, `:104-108`)
  and needs a map even to serve job activity;
- `limen picture tick` spawns a detached `picture` job when the code moved since the map's `revision`
  (`src/project/picture-tick.ts:22-185`); `limen picture watch on` installs a `reference-transaction` Git hook in the
  project that runs a tick on every move of the top branch (`src/project/picture-watch.ts:17-122`);
- the `picture` role (`templates/picture.md`) exists only to write the map; the coordinator manual tells the
  coordinator to start the first map by hand (`templates/agents.md:152`).

Relied on:
- G1.4 (gate 2): "Picture | cut the UI (viewer, `/`, `map.html`); keep `/activity.json`, `/events` and the data model
  for a future UI of mine; module (G1.10)".
- Gate 2 §6: "**Picture:** `picture tick` and `picture watch` (model jobs that maintain the map) are cut; the module
  serves only data from records."
- A-048, Decision: "fix — Tickets and board become their own core: `tickets.ts`, `frontmatter.ts`, `board.ts` move
  from `src/picture/` to a spec module (e.g. `src/spec/`) with no import from Picture; `limen ticket check` is the only
  ticket check on the land path. Picture is an optional module: model, activity, `serve` with `/activity.json` and
  `/events`; `picture build` validates the map and generates no HTML. `touches:` is optional; validated and maintained
  only with Picture on; ignored otherwise. A test asserts that with Picture off no core file imports from
  `src/picture/`. `picture tick` and `picture watch` are cut (§6)." This ticket does the cut: no HTML, no viewer, no
  tick, no watch. The move of the ticket modules, the module switch and optional `touches:` are R-044 and R-080.
- D-028: "`ticket check` and `picture build --strict` with problems found are a refusal (1)" (R-013), so `picture
  build --strict` stays as a check, and R-013 reworks its exit code after this ticket.
- `plan.md` → `## Stages`, conventions: a CLI change makes the old form exit non-zero with the replacement in the
  message before R-013; an on-disk change comes with a script and a test on a fixture; "Tests removed together with a
  cut feature are named in the outcome".
- R-003 and R-005 (`src/old-names.ts`): removed commands in `OLD_NAMES` (`removedCommand`, a subcommand named with
  its command, as `ticket series`), removed engine values in `OLD_ENGINES` (`removedEngine`), removed flags in
  `OLD_FLAGS` (`removedFlag`, `refuseRemovedFlags`; a command keeps a removed flag in its parse table and refuses it
  after parsing). R-085 removes the file at the end.
- R-001: every cut ticket registers the project-level leftover paths of its feature in `LEFTOVERS`
  (`src/project/leftovers.ts`); `limen status` lists them and `limen init --drop-leftovers` removes them. The registry
  test rejects a path under `.git/` today (`test/project/leftovers.test.ts:145-165`).
- R-006 → `## Out of scope`: "`docs/picture.md` (`:33`, `:49-55`) and `templates/picture/CONTRACT.md:55` (series and
  highlight text in the Picture docs): R-007 cuts the Picture viewer and its docs next".
- `plan.md` → `## Stages`, stage 1: role text edits of stages 1–3 sit in Pi's system prompt, which the bridge drops
  (E-1), so the template edits below change no model behaviour on the seat.
- D-025: a criterion checks only the ticket's scope, as an exit code; a scan is this ticket's own only when every file
  it matches at the parent is one this ticket changes or deletes (checked at `HEAD` = `a5767dd` for AC-2 and AC-3).
- D-029: a test that fails even once without a change of the code it runs is a finding; D-031: until R-019, a gate
  that fails only on `test/s9-housekeeping.test.ts:135` is recorded as an occurrence of A-087 and run once more.
- A-088, Decision (D-034, added during this ticket and corrected the same day): "fix — Low: a window in the code that
  no run has hit; … The fix goes into R-007 as an explicit addition to its scope: `waitJob` (`test/plant.ts`) waits,
  with a bound, for a terminal `state` and for `pid` to be gone, and a test of the helper fails before the fix every
  time." The window: `finalizeJob` writes `state` (`src/job/record.ts:57`) before it removes `pid` (`:69`), and the
  keeper refuses a job while `ownerAlive` holds (`src/commands/keeper.ts:168`). Not `born`: `recordBorn`
  (`src/job/record.ts:111-120`) reads `state` and then writes `born`, so a job that ends in between keeps a `born`
  file. The keeper test failure first cited was environmental: run outside `gate.mjs`, the laptop's git 2.34.1 lacks
  `git worktree list --porcelain -z`, which only the gate's shim supplies (D-001).

## Change

Line numbers are at `a5767dd`. "Goes" means the code is deleted with every import, helper, constant, type, parameter
and comment that only the removed code used.

1. Delete with `git rm`: `picture/viewer/template.html`, `picture/viewer/viewer.css`, `picture/viewer/viewer.js`,
   `picture/viewer/layers.css`, `picture/viewer/layers.js`, `picture/viewer/live.css`, `picture/viewer/live.js`
   (`git rm -r picture`), `src/picture/html.ts`, `src/project/picture-tick.ts`, `src/project/picture-watch.ts`,
   `templates/picture.md`, `templates/.history/picture.md`. `package.json:13` drops `"picture"` from `files`.
2. `picture build` checks the map and writes no page:
   - `src/picture/picture-build.ts`: `pictureHtml` (`:28-38`) goes; `buildPicture` takes the map folder, an optional
     JSON path and the root (no `out`, no `tip`), reads the model with `readPicture`, writes the model JSON atomically
     only when a JSON path is given, and returns the model. `readPicture` and the local atomic write stay.
   - `src/commands/picture.ts`: the build prints its diagnostics as today and then `picture: <n> places, <m> edges`,
     followed by `; wrote <json>` only with `--json`; `--strict` behaves as today. `--out` stays in the build table and
     is refused right after parsing with `refuseRemovedFlags("picture build", …)`, before anything is read or written.
     The tip (`headCommit(root)`, `:83`) is no longer read for the build.
   - `mapFolder` (`:110-121`): a folder with no plant file and no `.limen/picture` below it throws `<dir> has no plant
     file (nodes/*.md with "kind: plant") and no map at <dir>/.limen/picture`, without `firstPictureHint`.
3. `picture serve` serves job activity only:
   - `src/picture/picture-serve.ts`: `ServeOptions` (`:10-16`) holds only `jobsRoot` and `port`; the build before
     listening (`:24-25`) and the `/` route (`:104-108`) go, so every path but `/activity.json` and `/events` answers
     404 and the server never reads the map; the Host check (`:94-98`), the activity reader, the snapshot, the ping and
     `close` stay as they are. The comment (`:18-22`) says what it serves now.
   - `src/commands/picture.ts`: serve takes `[--port N]`; `--dir` stays in the serve table and is refused right after
     parsing with `refuseRemovedFlags("picture serve", …)`. The jobs root is the `.limen/jobs` of the primary checkout
     of the repository at the working directory (`dirname(gitCommonDir(cwd))` after `repoRoot(cwd)` has given its
     error outside a repository), so it serves the same jobs from a job worktree as from the primary checkout; it
     needs no map. The start line names both endpoints: `picture: serving http://127.0.0.1:<port>/activity.json and
     /events; Ctrl-C stops`.
4. `picture tick` and `picture watch` go: `src/commands/picture.ts` loses `MODEL_FLAGS`, `ROUTE`, the `tick`, `on`,
   `off` and `status` tables, the watch and tick branches and their imports (`:9-10`, `:16-27`, `:35-40`, `:56-75`);
   `limen picture tick …` and `limen picture watch …` (any words after them) are refused with
   `removedCommand(\`picture ${mode}\`)` before parsing, before the help is thrown for an unknown mode. `HELP` (`:13-14`)
   lists `limen picture build [--dir D] [--json F] [--strict]` and `limen picture serve [--port N]`.
5. The `picture` role goes: `src/old-names.ts` gets a table `OLD_ROLES` (`OldName` entries, "every cut ticket that
   removes a role adds its entry here"; R-009 adds `scout`) and `removedRole(name)`, which returns `role <name> was
   removed with <feature> (<ticket>); <instead>` or `undefined`. `resolvePreamble` (`src/commands/spawn.ts:65-75`)
   throws that line instead of its own error when neither the project's `.agents/limen/<role>.md` nor the package's
   template exists, so a project that writes its own `.agents/limen/picture.md` keeps the role, and a spawn or a
   continuation of a removed role writes nothing (it runs before the job id and the job folder, `:276-279`). The
   docstring of the tables (`src/old-names.ts:100-105`) names the fourth table.
6. Refusals, each with `ticket: "R-007"`; the wordings are the main session's, for Adrian at gate 5.1:
   - `OLD_NAMES`: `picture tick` (feature "the map jobs"; instead "no job refreshes the map; limen picture build
     checks it"), `picture watch` (feature "the map watch"; instead "limen status lists a leftover watch hook and limen
     init --drop-leftovers removes it").
   - `OLD_FLAGS`: `picture build --out` (feature "the Picture viewer"; instead "picture build writes no page; --json F
     writes the model"), `picture serve --dir` (feature "the Picture viewer"; instead "picture serve serves the jobs of
     the project it runs in, at /activity.json and /events").
   - `OLD_ROLES`: `picture` (feature "the map jobs"; instead "no role maintains the map").
7. Leftovers, `src/project/leftovers.ts`:
   - `Leftover` gets an optional `marker`: an entry with a marker is found only when its path is a regular file whose
     text contains the marker, so a file Limen did not write is never listed or dropped. The registry comment says so.
   - Entries: `.limen/picture/map.html` (feature "the Picture viewer (R-007)"), `.limen/picture/job`,
     `.limen/picture/tick.lock` and `.limen/picture-watch.log` (feature "the map jobs (R-007)"), and
     `.git/hooks/reference-transaction` with the marker `# limen picture watch ` (feature "the map watch (R-007)";
     `picture watch on` wrote the hook only into the primary checkout's own `.git/hooks`, `picture-watch.ts:24-55`, and
     wrote that line into it, `:102`).
   - `test/project/leftovers.test.ts`: the path rule accepts a path under `.git/` only as `.git/hooks/<name>` and only
     on an entry with a marker; every other `.git` path stays rejected.
8. Comments, help, docs and templates say nothing of the cut parts and nothing the code does not do:
   - `src/main.ts:130-133` (two help lines: build without `--out`, serve with `[--port N]`, each with a comment of
     what it does now); `src/runtime/wrapper.ts:31` (`limen picture serve` reads the job folder, without "picture
     watch").
   - `templates/worker.md:16`, `templates/coordinator.md:14`: the check is `limen picture build --dir
     "$LIMEN_CONTEXT_ROOT/.limen/picture" --strict`; `templates/keeper.md:15-16`: no `map.html`, the strict check
     without `--out`; `templates/agents.md:152`: what remains true (the gitignored dataset, `limen picture build
     --strict` as the check, `picture serve` for job activity), without the first map, the tick, the watch, the role
     or `map.html`. The first line of each changed `templates/.history/<name>` is set to the new template's SHA-256
     (`test/structure.test.ts:33-46`, written with Edit, D-016).
   - `templates/picture/CONTRACT.md`: no rendered map (`:3`, `:5`), no `map.html`, `job` or `tick.lock` row (`:20-23`),
     `revision` is the commit the dataset describes, not a watcher's cursor (`:41`), no series clause (`:55`),
     `## limen picture build` (`:92-96`) says it reads and checks the dataset, tickets and board, writes no HTML and
     writes the model only with `--json`; the tick, watch and picture job sections (`:98-131`) go.
   - `docs/picture.md` is rewritten to what the code does after the cut: the dataset and its contract, `picture build`
     as a check that writes no page (with `--json`), the ticket check in a job worktree without `--out`, and `picture
     serve` with its two endpoints; the viewer sections, the Limen marks (`◆`) and their Herdr link, the shared series,
     the first map, the refresh and the watch go.
   - `docs/commands.md:130-138` (build and serve only, the heading and its line say so) and `:202-207` (the watch
     section goes); `README.md:73-79` (the `## Picture` section goes; the row at `:123` stays); `docs/seat/README.md:53-55`
     (the section goes); `docs/setup.md:117` (no "picture jobs").
9. Tests (new and changed tests are written first and fail at `HEAD`):
   - New `test/picture/serve.test.ts`: `servePicture` on port 0 with a jobs root that holds one job folder and no map
     anywhere: `GET /` → 404, `GET /activity.json` → 200 JSON with that job, `GET /events` → 200
     `text/event-stream` whose first event is `activity`, a wrong `Host` → 403; `close()` ends it. Every wait is
     bounded.
   - `test/cli/old-names.test.ts`: `limen picture tick --engine pi --provider p --model m --thinking t`, `limen picture
     watch`, `limen picture watch on --engine pi --provider p --model m --thinking t`, `limen picture watch off`,
     `limen picture build --out x.html` and `limen picture serve --dir x` each exit non-zero with their line on stderr
     and leave `.limen/` and `.git/hooks/` unchanged; `resolvePreamble(root, "picture")` throws the role line in a
     project without `.agents/limen/picture.md` and returns that file's path in a project with it.
   - `test/cli/status.test.ts`: a project with the four `.limen` paths of item 7 and a `.git/hooks/reference-transaction`
     that carries the marker lists all five under `Leftover files` with their features; a `reference-transaction` hook
     without the marker is not listed.
   - `test/project/leftovers.test.ts`: `dropLeftovers` removes a marked hook and keeps an unmarked one; the path rule
     of item 7.
   - `test/s6-keeper.test.ts:33-37`: `picture build --strict --dir <root>` exits 0, prints the place count and leaves
     no `map.html` in the map folder; the no-map error names both paths and no picture job.
10. A-088 (D-034, corrected): `waitJob` (`test/plant.ts:182-201`) returns only when the job's `state` is terminal and
    its `pid` is gone, not waiting for `born` (see `## Problem`); its wait stays bounded and synchronous, and its
    comment says what it waits for and why not `born`. A new test of the helper, written first, fails at `HEAD` every
    time: a job folder whose `state` is terminal while `pid` is still there, which another process removes after a
    short delay; `waitJob` must return only after the removal, and a leftover `born` does not hold it. `settled` in
    `test/cli/old-names.test.ts` stays as it is; no other test changes for A-088.
11. `biome.jsonc`: the override for `picture/viewer/*.js` (`:84-93`, with its comment) and the comment sentence on
    the viewer scripts (`:30-31`) go with the deleted files; the rules they sit beside stay.

## Out of scope

- The data model and its readers (`src/picture/picture-model.ts`, `dataset.ts`, `frontmatter.ts`, `markdown.ts`
  with `bodyHtml`, `tickets.ts`, `board.ts`, `activity.ts`), the land check of map sources
  (`src/commands/land.ts:273-300`), `ticket new --touches` (`src/commands/ticket.ts:63-70`) and the keeper's map path
  (`src/commands/keeper.ts:84`): they read the dataset, which G1.4 keeps. Moving the ticket modules out of
  `src/picture/`, the Picture module switch and optional `touches:` are R-044 and R-080; serving only record data is
  R-080.
- The exit code of `picture build --strict` and the typed refusals (code 2, `next`): R-013. The command registry: R-014.
- `adrian-rebuild/tools/context-size.mjs:20-21` and `adrian-rebuild/tools/role-context.mjs:11` keep `picture`, for
  measuring old refs (as R-004 kept `.omp`); a missing area or role template is already skipped there.
- A dataset written outside the default `.limen/picture/` with `--dir`, and a `map.html` written elsewhere with
  `--out`: the registry holds default paths only.

## Acceptance

- AC-1: `git ls-files -- picture src/picture/html.ts src/project/picture-tick.ts src/project/picture-watch.ts
  templates/picture.md templates/.history/picture.md | grep -q .` → exit 1; `grep -q '"picture"' package.json` → exit 1.
- AC-2: `git grep -q -i -E 'pictureTick|pictureWatch|firstPictureHint|readViewer|assembleHtml|pictureHtml|map\.html|picture/viewer|reference-transaction|--role picture|picture job|picture pass|archmap|picture tick|picture watch|plant of its series|shared series|Limen marks|tick\.lock'
  -- src hook bin templates test docs README.md CONTRIBUTING.md SECURITY.md package.json ':!src/old-names.ts'
  ':!src/project/leftovers.ts' ':!test/cli/old-names.test.ts' ':!test/cli/status.test.ts'
  ':!test/project/leftovers.test.ts'` → exit 1. At `HEAD` every file it matches is one this ticket changes or deletes
  (D-025).
- AC-3: `git grep -q -e 'picture build.*--out' -e 'picture serve \[--dir' -- templates docs README.md src/main.ts`
  → exit 1.
- AC-4: `node --test test/picture/serve.test.ts` → exit 0.
- AC-5: `node --test test/cli/old-names.test.ts` → exit 0.
- AC-6: `node --test test/cli/status.test.ts` → exit 0; `node --test test/project/leftovers.test.ts` → exit 0.
- AC-7: `node --test test/s6-keeper.test.ts` → exit 0.
- AC-8: `node adrian-rebuild/tools/fails-before.mjs` → exit 0: the new and changed test files fail at `HEAD`; the
  outcome names each changed file that passes at `HEAD` alone and why. The test of `waitJob` (item 10) is among them.
- AC-9: `node adrian-rebuild/tools/gate.mjs` → exit 0 with `fail 0`; the outcome names every test removed with the cut
  and the count before and after.
- AC-10: `node adrian-rebuild/tools/check.mjs` → exit 0; `npx biome check --error-on-warnings adrian-rebuild` → exit 0.
- AC-11 (judgment): `picture build` without `--out` reports the same diagnostics and exit status as at `HEAD` for the
  same dataset, tickets and board; land, `ticket new --touches` and the keeper read the map as at `HEAD`.
- AC-12 (judgment): the help, docs, templates and comments of item 8 say nothing of the cut parts and nothing the code
  does not do.

## Migration

- CLI: `picture tick`, `picture watch`, `picture build --out`, `picture serve --dir` and a spawn or continuation of
  the role `picture` refuse with their lines and write nothing (AC-5).
- On disk: `.limen/picture/map.html`, `.limen/picture/job`, `.limen/picture/tick.lock`, `.limen/picture-watch.log`
  and a `.git/hooks/reference-transaction` that carries `# limen picture watch ` become leftover files: `limen status`
  lists them and `limen init --drop-leftovers` removes them (AC-6). The dataset (`.limen/picture/nodes/` and the rest)
  stays. Until the hook is dropped, each move of the top branch runs `limen picture tick` in the background, which
  refuses and appends its line to `.limen/picture-watch.log`; it never delays or rejects the ref update
  (`picture-watch.ts:103-120`).
- A picture job started before the deployment still runs and lands as any job; continuing it refuses (no role).

## Risk

- A project whose own `reference-transaction` hook happens to contain the marker line would lose it on
  `--drop-leftovers`; `limen status` lists it first, and the owner checks the list before dropping (deployment step
  1.1).
- `buildPicture` and `servePicture` lose parameters; a caller the cut misses breaks the build, which the gate's
  `tsc --noEmit` catches.
- The serve's jobs root changes from the map's repository to the primary checkout at the working directory; for the
  default map (`<root>/.limen/picture`) both are the same folder.

## Rollback

`git revert $(git log --format=%H --grep='^R-007:' adrian-rebuild --)`; leftover files are not removed until Adrian
runs `limen init --drop-leftovers`, and the watch hook keeps working again after a revert.

## Decisions

- 2026-11-18 (main session): "the map jobs" include the `picture` role, whose only purpose is a model job that writes
  the map (§6: "model jobs that maintain the map are cut"); a project's own `.agents/limen/picture.md` still defines a
  role of that name.
- 2026-11-18 (main session): `picture build --json` stays: it writes the data model G1.4 keeps.
- 2026-11-18 (main session): the watch hook is a leftover with a marker rather than a separate migration script, so
  the one owner of leftovers (R-001) lists and drops it; the `.git/hooks/` exception is limited to marked entries.
- 2026-11-18 (main session): the refusal wordings are the main session's, for Adrian at gate 5.1.
- 2026-11-18 (Adrian, D-034, the implementer's `BLOCKED` on the keeper test): option c, the main session's
  recommendation: the fix of `waitJob` (A-088) goes into this ticket as `## Change` item 10, not into a ticket of its
  own first and not under the D-031 allowance.
- 2026-11-18 (main session, the same `BLOCKED`): the entries of `biome.jsonc` that name only deleted files go with
  them (item 11). The implementer's deviations so far are accepted: CLI tests that `spawn --role picture` and a
  `continue` of a picture-role job write nothing; a marked entry counts only as a regular file, and the folders on its
  path are checked to be directories first, because `.git` is a file in a job worktree and `limen status` must not
  throw `ENOTDIR` there; `test/s6-keeper.test.ts` checks that the map folder's listing is unchanged and the exact error
  text, instead of naming `map.html`, which AC-2 forbids in tests.
- 2026-11-18 (Adrian, D-034 corrected, option 1 of the main session's second question): the implementer proved the
  keeper failure environmental; A-088 stays, low, from the code; `waitJob` waits for `pid` alone (item 10 changed).
  The implementer's deviations 2–8 of its first `DONE` (the 120-second bound, the refusal of a removed flag with a
  missing or repeated value, the `ACTIVITY` constant, the other `biome.jsonc` and `CONTRACT.md` lines, the dropped
  paragraph of `docs/picture.md`, the removed `biome-ignore`) are accepted for review. AC-7 counts inside `gate.mjs`
  only (D-001).
