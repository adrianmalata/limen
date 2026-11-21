<!-- PL: Ticket R-021: jeden plik `record.json` na job (wersja schematu 1) zamiast około 45 plików jednowartościowych,
pisany wyłącznie przez funkcję przejścia pod blokadą joba z R-019, z porównaniem stanu (compare-and-swap) i bez zapisu
po stanie końcowym (A-019, A-053, A-056, S1+, D-057). Każdy czytelnik, także hook koordynatora, dzwonek, poller GitHuba
i skrypt wdrożenia, czyta rekord przez jeden moduł; nowe polecenie `limen migrate [--dry-run]` przenosi istniejące
projekty, a niezmigrowany projekt jest odmawiany kodem 4. Stan: napisany nocą 20/21.11 z inwentarza
`evidence/inventories/R-021.md`; zamknięty tej nocy (delegated, recenzja PASS w rundzie 3, bramka 484/484), z
decyzjami rund recenzji w `## Decisions`. -->

# R-021 One `record.json` per job, written only by the transition function

## Problem

S1+ (`plan.md` → `## Decisions`, gate 2 §2, word for word `audit.md:217-223`): "`record.json` with a schema version:
state, transitions, verdict, judgments, check results, rounds, markers `landed`/`abandoned`, failure kind and detail,
quota reset time, owed wakes, `doneBy`, route, process identity, land steps, `filed`. Writes only through the transition
function (A-019): temporary file + `rename`, a `wx` claim at the terminal transition. Content (result, transcripts,
logs) stays in separate files. Migration of existing records by a script with a fixture test. Earlier wording such as
"the `verdict` file" means a field of `record.json`. Not SQLite: …"

A-019, Decision: "fix — Every job state change goes through one function; a transition happens only from the expected
state (compare-and-swap); the first finisher wins, the loser returns without writing; nothing writes a state after a
terminal one. Store: S1+. Closes A-053." A-053, Decision: "fix (via A-019) — closed by A-019." A-056, Decision: "fix —
Process identity `{pid, start time, boot_id}` is a record field, written synchronously in the transition to `running`
(A-019); a missing identity means "unknown", never "alive"; the reaper (A-005) compares `boot_id` and start time, and a
mismatch means dead."

T-20 (6): "The S1+ migration checks the uniqueness of tokens in existing records; jobs with a collision or an older id
format accept only the full id." T-25 (1): "Code with a guarantee or a policy (atomic write with `fsync`, lock, error
handling, configuration, argument parsing, reference resolution, record reading) has exactly one module from its first
use, named after its responsibility; its primitive is banned outside it by a scan in `npm run check` (the pattern of
A-022). … After S1+, a typed read of `record.json` replaces the reads of job files." T-28 (3): "Operations that cannot
be undone or that move data (… migrations, …): also a test of running them again and a test that nothing is lost (z.
29, A-002)"; its Check: "operations marked irreversible in the registry have tests for running again and for losing
nothing". T-19: an entry holds "the name (T-18), the kind `read` or `change` (T-04), the visibility `public` or
`internal`, a one-line summary …, the schema of arguments and flags, and the handler".

`plan.md` → D-057 (2026-11-20, Adrian, R-021's seven questions, answered "all as recommended, and consent to 7"; refines
S1+ and T-20 (6) for R-021), in full:
"(1) The migration is a registry command, `limen migrate [--dry-run]` (T-19), of kind `change` and marked irreversible
(T-28 (3)), run from the project's root on the agents' account (never from `seat/deploy.ts`, which runs as root, D-008);
a second run has nothing to do and exits 0 (T-02). (2) A folder with no valid `state` (ORPHAN, or a value `parseJob` does
not know) is moved unchanged to `.limen/unmigrated/<id>/` and listed in the report with its reason (z. 29); a folder with
a state but no `task.md` or `log` migrates, and the report notes the missing content; old `engine` values stay as they
are. (3) The migration removes the one-value files it moved into `record.json` and the files of removed features that
nothing reads, listing them in the report; the content files (`task.md`, `log`, `result`, `note.md`, `note.first.md`,
`start-notice`, `session/`) and the directories `notify/`, `steer/` and `recovery/` stay; the rollback is the snapshot of
`## Deployment` 0.1; `docs/jobs.md` names `limen show` instead of a hand edit. (4) The migration fills in only the failure
kind, in A-016's vocabulary, from today's patterns (`stop-reason`, the last `failed:` log line), with the original text as
the detail and the reset time `null`; everything else it cannot establish is `null`, never guessed (z. 10); transitions
come only from `started-at` and `finished-at`. A migrated record carries a `migrated` marker with its date and is history
only: `status`, `show` and `stats` read it, and resume (R-034), owed wakes and the bell skip it. `landed` and the
archiving of old records are R-031's, in its own migration (A-002: never from the git graph). (5) No mirror `state` file:
R-021 moves every reader to `record.json` through the record module (T-25): `docs/seat/bell.sh`, the GitHub poller,
`seat/deploy.ts`, the group mirrors, `templates/agents.md:205` (to `limen show <id>`) and `docs/jobs.md`; a scan finds no
read of `state` or another old job file. (6) On a project that is not migrated, every command that reads jobs refuses
with exit code 4 and `next` `limen migrate --dry-run`; the hooks do nothing there and report the reason once. (7)
Technical defaults: (7.1) `activity`, `last-tool` and `tool-calls` go into a separate `progress.json`, outside the
transition function, which the coordinator's watcher ignores; (7.2) the delivery receipts of `notify/`, `steer/` and
`recovery/` stay directories with their `wx` protocols (A-058), and the owed-wake list of S1+ and A-016 (2) is a field
R-034 adds; (7.3) one writer: the per-job lock of R-019 (D-056), compare-and-swap (A-019), `wx` at the terminal
transition (S1+), and side failures in `sideFailures` written with the terminal state (T-01); `stop`, `watch`, the
group's reserved slot, the finish hook and the reaper move onto it; (7.4) the facts written once at publication
(`label`, `branch`, `worktree`, `base`, `role`, `repo`, the origin fields, `group`, `team`, `parent`, `spawner`,
`candidate`, `priority`) and a new job's route (the four flags of D-043) are record fields; the unread `deadline` and
`tip` go; (7.5) a missing process identity means "unknown", never "alive" (A-056), with the boot id from the platform
adapter (D-056); (7.6) the migration refuses while any job runs or is starting, like the gate of `seat/deploy.ts`; (7.7)
the finish time is a field (`finished-at`, else the modification time of `state`), which the sweep's event key and the
fallbacks read, so the migration does not ring the bell again; (7.8) schema version 1; a field unknown at write time is
`null`, a missing field means "added after this record's version" (`## Stages` conventions); writes through R-018's
`atomicWrite`; file modes as today; (7.9) the migration checks the uniqueness of the tokens (T-20 (6)) and lists
collisions in its report (`## Deployment` 2.1); the resolver that relies on it is R-022. Check: R-021's criteria;
`## Deployment` 2.1 and 2.3."

`plan.md` → `## Stages` conventions: "From R-021, `record.json` changes additively: a new field is optional for older
records; only a breaking change raises the schema version, and then the migration upgrades every older version (one
fixture per version)." "`Mig. yes`: an on-disk change … comes with a script and a test on a fixture …; the rollback of a
format change is the snapshot of `## Deployment` 0.1, not a reverse script." `## Deployment` 2.1: "`limen migrate
--dry-run`, then `limen migrate` (D-057 (1)), with no job running or starting; the report lists every job, every id
collision (item 10), every folder moved to `.limen/unmigrated/` and every file removed."

`plan.md` → `## Tickets` → notes for R-021:
- "(R-016 review round 3, notes 1-3; R-021 moves the records onto `src/boundary.ts`): the comment above `RAW` in
  `src/boundary.ts` says what `JSON.stringify` escapes (C0 included; DEL, C1, U+2028 and U+2029 are left to `escaped`);
  the 40-character cut of a shown value never splits an escape or a surrogate pair; format characters (category Cf, such
  as U+202E) are escaped too, so a record value cannot change how a terminal shows a log line."
- "(R-018 review round 2, notes 1 and 3; R-021 rewrites both places): the comment at `src/job/record.ts:12` says every
  file of the job record is written by `atomicWrite`, while `log` is appended to (T-30); the comment at
  `src/job/publication.ts:154` says the transcript copy keeps the source's mode "as `copyFile` did", which holds only when
  the umask does not narrow it (the copy is never wider)." (The second comment is at `src/job/publication.ts:144` now.)

R-019 (`done`): `src/lock.ts` is the one lock module, async only: `withLock({ folder } | { file }, operation, options)`,
`mode: "wait"` (at most 60 s, then `LOCK_TIMEOUT`, class `transient`) or `"skip"`; "a sync form of the module, which R-021
adds if a hook needs one" (R-019 → `## Out of scope`). A `.lock` string outside `src/lock.ts` fails
`test/structure.test.ts` (T-25 scan).

Facts at HEAD (the full table with every writer and reader is `adrian-rebuild/evidence/inventories/R-021.md`, read at
`cc9bd16` plus R-019's change, which is that commit's tree):
- A job folder `.limen/jobs/<id>/` holds about 45 names. `state` is written in five places with no compare-and-swap:
  `src/commands/spawn.ts:448` and `src/commands/continue.ts:251` ("running"), `src/runtime/wrapper.ts:222` (the second
  "running", A-053), `src/job/record.ts:44` (terminal, in `finalizeJob`, checked at `:28` with awaits in between and no
  lock) and `src/commands/group.ts:537` (the reserved slot's "stopped"). The reaper (`src/runtime/reap.ts:67-117`) runs
  from `limen status` (`status.ts:78`), `limen show` (`show.ts:17`), `limen sweep` (`sweep.ts:47`) and the coordinator's
  hook (`hook/wake.ts:724`, async), and finalizes through `finalizeJob`. A missing `born` counts as alive
  (`reap.ts:50-52`); no record holds a boot id.
- Readers: more than 40 modules read job files, 19 of them through local copies of `text(path)` (inventory §4). Beyond
  D-057 (5)'s list: `hook/wake.ts` (about 15 job files, synchronously, `:1205-1213` and others), `src/picture/activity.ts`,
  `src/integrations/herdr.ts`, `src/integrations/coordinator-wake.ts`, `src/commands/board-view.ts`,
  `src/project/planning.ts`, `src/job/wake-text.ts`, `src/job/wake-delivery.ts`, `src/job/task-note.ts`. Job hooks write
  only content and receipts synchronously; no hook writes a one-value file (inventory §3).
- Files D-057 does not name (inventory §2): `starting`, `queued` (JSON, rewritten while a job waits), `stop-requested`,
  `advisory` (the sweep's event key is its mtime and birthtime, `sweep.ts:84-88`), `open-checks`, `commits`, `versions`,
  `cleanup`, `extensions.json`, `spawned-by`, `group-owner.json`, `pid`, `born`, `stop-reason`, `engine`, `model`, the
  folder `herdr/`; and R-005's hosted leftovers (`hosted`, `agent-name`, `herdr/agent`, `engine-binding`,
  `ownership-uncertainty`), which nothing reads.
- `docs/seat/bell.sh` is POSIX sh (no JSON parser), started by the drop-in `ExecStart=/opt/limen/docs/seat/bell.sh`
  (`docs/seat/agent-setup.md:170`); it reads `state` and `label` and writes `notify/bell`.
- The GitHub poller reads job files from its own account through `readJobFile` (`src/integrations/github-review.ts:42-60`:
  `O_NOFOLLOW`, a regular file with `nlink` 1, at most `limit` bytes; tested by `test/s10-doorbell.test.ts:166-173`).
- `seat/deploy.ts` (root) reads `label`, `liveJob` and `startingJob` (`:285-295`).
- Ids: `makeJobId` (`src/job/job.ts:127-137`) ends in 8 hex; older ids end in 4 hex (`src/outcome.ts:35-40`).
- `src/boundary.ts` has no array, null or boolean validator.
- Test helpers read `state` and `pid` directly (`test/plant.ts:23-47`, `:233-258`; 13 and 14 test files use them);
  about 20 test files make job folders by hand (inventory §8).
- Ratchets: `JSON_PARSE` 38 and runtime `CASTS` 75 (`test/structure.test.ts:180`, `:259`) count job-file sites.

## Change

1. **The record module** (T-25 (1)): one module of `src/job/` (the implementer names it; `src/job/record.ts` may become
   it) owns `record.json` and is the only code that names it or any old job file, apart from the migration (item 5).
   - The schema, version 1: `version`, `id`, `state` (`running`, `done`, `failed`, `stopped`, and the states the code
     has today), `transitions` (`{ from, to, at }`), the process identity `{ pid, born, bootId }` (each `null` when
     unknown), `startedAt`, `finishedAt`, `failure` (`{ kind, detail, resetAt }` in A-016's vocabulary, or `null`),
     `sideFailures`, the facts of publication of D-057 (7.4) (with `origin` holding tab, pane and session, and
     `spawnedBy`), the route (`engine`, `model`, `provider`, `thinking`; D-043's four flags), and the one-value files of
     the fact list above as fields (night default 1), and `migrated` (`{ at }` or absent). A field unknown at write time
     is `null`; a missing field means "added after this record's version" (D-057 (7.8)). `deadline` and `tip` go.
   - Read: one async and one sync form (the sync one for the hooks, whose readers are synchronous). Every read opens
     `record.json` with `O_NOFOLLOW`, requires a regular file with `nlink` 1 and a size cap, and turns the text into a
     typed record through `src/boundary.ts` (T-27 (2)), or a typed `BAD_DATA` error naming the file and the field. The
     GitHub poller's `readJobFile` policy is this read, so `test/s10-doorbell.test.ts:166-173` still holds.
   - Write: only the transition function. It takes the per-job lock of R-019 (`withLock({ folder: <job folder> })`),
     reads the record, applies a transition only from the expected state (compare-and-swap; the loser returns without
     writing, A-019), never writes after a terminal state, writes through `atomicWrite` (temp, `fsync`, `rename`; file
     mode as today), and at the terminal transition first takes a `wx` claim, so exactly one finisher wins (S1+).
     Side failures of the terminal transition (a failed commit count, a failed group sync) are written with it in
     `sideFailures` (T-01). Non-state fields that change during a run (`origin.pane` by `watch`, `queued`,
     `stopRequested`, `advisory`) are changed through the same function under the same lock, as updates that leave
     `state` alone.
   - The process identity is written in the transition to `running` (A-056), with the boot id from
     `platform.bootId()` (D-056). A missing identity means "unknown", never "alive" (D-057 (7.5)): nothing keeps a job
     running on it, and `limen status` shows it as unknown. The reaper compares the boot id and the start time, and a
     mismatch means dead (A-056).
   - `progress.json` (D-057 (7.1)) holds `activity`, `lastTool`, `toolCalls`; the wrapper writes it per stream event
     through `atomicWrite`, outside the transition function, and the coordinator's watcher ignores it.
2. **Writers.** Publication (`src/job/publication.ts`) writes the first record; `spawn`, `continue`, the wrapper,
   `finalizeJob`, `stop`, `watch`, the group's reserved slot (`src/commands/group.ts:528-539`), the start queue, the
   reaper and every other writer of a one-value file go through the transition function. The wrapper no longer writes
   a second `running` (A-053).
3. **Readers** (D-057 (5)): every reader of a job file in `src/`, `hook/`, `seat/` and `docs/seat/` reads the record
   (or `progress.json`) through the module; the 19 local `text(path)` copies that read job files go. Content files and
   the directories of D-057 (3) and (7.2) stay files, read as today.
   - `docs/seat/bell.sh` keeps its path (the drop-in starts it) and becomes `exec node <its folder>/bell.ts`; the new
     `docs/seat/bell.ts` reads records through the module, rings once per terminal record without `notify/bell` and
     skips migrated records (D-057 (4); night default 2).
   - `seat/deploy.ts` reads the running and starting jobs through the module.
   - The group mirrors (`src/job/group-events.ts:106-125`) compare the member's record fields.
   - The sweep's event key and the other mtime fallbacks read `finishedAt` (D-057 (7.7)); a migrated record gives the
     same key it gave before, so the migration rings nothing. The advisory key reads the record's advisory field and its
     time.
4. **Refusal on an old project** (D-057 (6)): a project is not migrated when a folder of `.limen/jobs/` holds a `state`
   file and no `record.json`. Every command that reads jobs then fails with a `LimenError` of class `environment` (exit
   4), a code the implementer names, and `next` `limen migrate --dry-run`; the hooks do nothing there and report the
   reason once per session.
5. **`limen migrate [--dry-run]`** (D-057 (1)–(4), (7.6), (7.9)): a registry entry of `object: "project"`, kind
   `change`, visibility `public`, with a new optional `Entry` field that marks it irreversible (T-28's Check).
   - It refuses with exit 4 while any job runs or is starting (the old forms: `pid` with `born`, `starting`).
   - Per folder: a valid old `state` → `record.json` with the fields of the old files, the transitions from
     `started-at` and `finished-at` only, `finishedAt` from `finished-at` else the mtime of `state`, the failure kind
     from `stop-reason` or the last `failed:` log line with the original text as the detail and `resetAt` `null`, `born`
     only when it is the clock-tick form (else `null`), `migrated: { at }`; then it removes the one-value files it moved
     and the files of removed features, keeping the content files and the directories of D-057 (3). No valid `state` →
     the folder moves unchanged to `.limen/unmigrated/<id>/` (`atomicRename`). A missing `task.md` or `log` is noted.
   - The report lists every job and what happened to it, every folder moved with its reason, every file removed, every
     older id format (4 hex: full id only, T-20 (6)) and every token collision. `--dry-run` prints the same report and
     writes nothing. A second run has nothing to do and exits 0.
   - The migration module is the one other place that names old job files; the scan of item 7 lists it.
6. **`src/boundary.ts`**: the validators the schema needs (null, boolean, array; names are the implementer's), and the
   R-016 notes: the comment above `RAW` says what `JSON.stringify` escapes; the 40-character cut never splits an escape or
   a surrogate pair; category Cf is escaped too. Each with a test in `test/boundary.test.ts`.
7. **Scans** (`test/structure.test.ts`): outside the record module and the migration, no file of `src/`, `hook/`,
   `seat/` or `docs/seat/` names an old one-value job file or `record.json` (a string literal that is one of the old
   names in a job-folder path; the implementer defines the match and gives it a fixture self-test). The `JSON_PARSE` and
   `CASTS` ratchets may only fall.
8. **Docs and prompts**: `templates/agents.md:201`, `:205`, `:207` (and `:104`, `:142-144` where they name job files)
   name `limen show <id>` instead of `state` files or a hand edit; `docs/jobs.md` (`:30`, `:46`, `:48`, `:122`, `:128`,
   `:162`, `:193`, `:209`, `:210`, `:217`) describes `record.json`, `progress.json` and `limen migrate`, and names `limen
   show` instead of a hand edit (D-057 (3)); `docs/commands.md` gets `limen migrate` in its registry section;
   `docs/seat/README.md`, `docs/herdr-status.md` and `README.md:106` where they name job files. The R-018 comments:
   `src/job/record.ts:12` (or its successor) and `src/job/publication.ts:144` (the copy is never wider than the source).
9. **Tests** (T-29: one mechanism per test; test files mirror their modules):
   - The record module: a transition only from the expected state; two finishers at once → one wins and the loser
     writes nothing; nothing is written after a terminal state; the `wx` claim; `sideFailures` with the terminal
     state; a damaged record is `BAD_DATA`; the safe read refuses a symlink and a second hard link; the sync read.
   - The reaper and identity (`test/u9-process-identity.test.ts`): a missing identity is unknown, never alive; a boot
     id or start time that differs is dead.
   - The migration, on a fixture of old folders: a valid job (every old value lands in a field, the content stays:
     nothing lost, T-28 (3)); ORPHAN and an unknown state → `.limen/unmigrated/`; a job without `task.md`; a 4-hex id; a
     token collision; R-005's hosted leftovers removed; the failure kind from `stop-reason` and from a `failed:` log line;
     `--dry-run` writes nothing; a second run exits 0 with nothing to do (T-28 (3)); the refusal while a job runs.
   - The refusal of an unmigrated project by a command that reads jobs (exit 4, `next`), and a hook that does nothing
     there.
   - The bell: a terminal record rings once, a migrated one never.
   - The help and registry tests gain `limen migrate`.
   - `test/plant.ts` and every test that makes or reads job files by hand use the record; tests keep their names and
     mechanisms.

No path is deleted or moved, and no file of `adrian-rebuild/tools/` changes.

## Out of scope

- The job reference resolver and its exit code for an id that names no job (R-022, D-061 (1)); the use of the token
  uniqueness R-021 reports.
- `landed`, `abandoned` and the archive of old records (R-031, its own migration); owed wakes (R-034); verdicts,
  judgments, rounds, `doneBy`, land steps and `filed` (their tickets add the fields additively).
- `limen stats` (R-024); the `validate`/`apply` shape of commands (R-092); thin command adapters (R-023).
- The failure cause recorded at run time beyond today's patterns (R-029); alerts from their own account (R-033).
- The usage lock of the status line and the systemd units (R-032, R-059).
- `docs/seat/agent-setup.md`'s installation steps of the bell (its path stays).

## Acceptance

- AC-1: `node --test test/job/record.test.ts` → exit 0.
- AC-2: `node --test test/u9-process-identity.test.ts` → exit 0.
- AC-3: `node --test test/cli/migrate.test.ts` → exit 0.
- AC-4: `node --test test/boundary.test.ts` → exit 0.
- AC-5: `node --test test/structure.test.ts` → exit 0.
- AC-6: `node --test test/help.test.ts` → exit 0; `node --test test/registry.test.ts` → exit 0.
- AC-7: `node --test test/seat/deploy.test.ts` → exit 0; `node --test test/s9-housekeeping.test.ts` → exit 0;
  `node --test test/cli/sweep.test.ts` → exit 0.
- AC-8: `git grep -n -E 'jobs/<id>/state|plain .state. file|edit it' -- templates/agents.md docs/jobs.md` → exit 1 (at
  HEAD it finds lines in both files).
- AC-9: `node adrian-rebuild/tools/fails-before.mjs` → exit 0; `outcome.md` → `## Fails before` holds its output and
  names each new or changed test that passes at `HEAD` and why.
- AC-10: `node adrian-rebuild/tools/gate.mjs` → exit 0 with `fail 0`.
- AC-11: `npx tsc --noEmit` → exit 0; `npx biome check --error-on-warnings .` → exit 0.
- AC-12: `node adrian-rebuild/tools/check.mjs` → exit 0.
- AC-13 (judgment): every write of `record.json` goes through the transition function under the per-job lock, with
  compare-and-swap; nothing writes after a terminal state; the terminal transition has exactly one winner; a missing
  identity is never "alive"; no reader outside the record module and the migration reads an old job file or
  `record.json` by its name; the migration loses no value of a migrated folder and moves every other folder unchanged.

## Migration

`limen migrate [--dry-run]` (Change 5), with its fixture tests (Change 9). It runs on the seat as `## Deployment` 2.1
says, from each project's root on the agents' account, with no job running or starting. The rollback of the format is
the snapshot of `## Deployment` 0.1 (D-057 (3)); there is no reverse script. Until a project is migrated, every command
that reads jobs refuses with exit 4 and `next` `limen migrate --dry-run` (D-057 (6)).

## Risk

- The ticket touches almost every command and the coordinator's hook; a reader left on an old file shows a job as
  missing. The scan of Change 7 and AC-9 find the names; the gate's end-to-end tests run the real flow.
- A migration bug loses history on the seat; the snapshot of `## Deployment` 0.1 is the rollback, and `--dry-run`
  comes first.
- The safe read (`nlink` 1) refuses a record during an exclusive link-based write; the transition function writes the
  record by `rename`, and the `wx` claim is a separate file.
- `progress.json` per stream event costs an `fsync` per event, as the three files do today.
- The bell's `node` must be on the service's `PATH` (the poller's unit uses `/usr/bin/node`); the bell is unmeasured
  until it runs on the seat.
- The gate grows (M-10).

## Rollback

`git revert $(git log --format=%H --grep='^R-021:' adrian-rebuild)`, then the snapshot of `## Deployment` 0.1 for every
migrated project (an old Limen reads no `record.json`).

## Decisions

- 2026-11-20 D-057 (Adrian): quoted in full in `## Problem`; it binds every item of `## Change`.
- 2026-11-20 D-056 (Adrian): the per-job lock is R-019's module; the boot id comes from `src/platform/`.
- 2026-11-21 (night run, main session; night defaults, for Adrian to confirm in the morning, D-054 (2) category A):
  (1) the one-value and JSON files D-057 does not name (`starting`, `queued`, `stop-requested`, `advisory`,
  `open-checks`, `commits`, `versions`, `cleanup`, `extensions.json`, `spawned-by`, `group-owner.json`, `pid`, `born`,
  `stop-reason`, `engine`, `model`) become record fields by S1+'s rule (state and facts in the record, content in
  files), and the folder `herdr/` stays the Herdr integration's directory, like `notify/`; R-005's hosted leftovers are
  files of removed features that nothing reads, which the migration removes. (2) The bell: `docs/seat/bell.sh` keeps its
  path, so the seat's drop-in needs no change, and runs `docs/seat/bell.ts`, which reads records through the module
  (a shell script cannot use the module; D-010 puts seat tools in TypeScript). (3) A project is "not migrated" when a
  job folder holds `state` and no `record.json`, which needs no marker file. (4) The migration test lives in
  `test/cli/migrate.test.ts`, beside the other command tests (T-29).
- 2026-11-21 (night run 3, main session): the first implementer was cut off at 02:06 by the 5-hour usage limit (an
  API error, not a failure of its step); `compare --git` exited 0 on its tree, and a fresh `rebuild-implementer`
  continued from it (`## Agents`: a night run never resumes a subagent). The implementers' own night defaults and two
  deviations are in `outcome.md`, for Adrian to confirm in the morning: `cleanup` stays a content file (night default
  (1) above listed it as a field), and the reaper may end a migrated record that still says `running`.
- 2026-11-21 (main session, review round 1, `review.md`): fix findings 1–7, 9–13 and the T-29 answer.
  (1) The migration's report lists each folder once: the token and older-id reports count the ids after the moves
  without counting a moved folder twice; a test checks the report of a real run that moves a folder.
  (2) and (7) The migration keeps every value of `activity`, `last-tool` and `tool-calls`: a missing or unreadable
  `tool-calls` does not drop the other two (`progress.json` holds what exists, the rest `null`, or the files whose
  value no field can hold are kept and reported, like any value its field cannot hold); `finishFolder` (an interrupted
  migration) writes a missing `progress.json` the same way; tests for a folder with `activity` and no `tool-calls`,
  and for an interrupted migration with progress files.
  (3) HEAD's test "finalizeJob counts each steer left in the inbox in its log line, but not the temp of a steer write"
  comes back with its name and mechanism, on the record (in the test file of `src/job/finalize.ts` by T-29, or where
  it was).
  (4) A `running` record whose identity is unknown is never live: `liveJob` drops the startup grace for `running`
  records (the identity is written in the same transition as `running`); the grace stays for `starting` records;
  `test/u9-process-identity.test.ts` asserts the reaper ends such a record (after its confirmation) and not that it
  stays `running`.
  (5) `limen stop` on a starting job finalizes only from `starting`; when the wrapper won the race to `running`, the
  stop goes on as the stop of a running job (signal and all); a test for that order.
  (6) `transition`'s comment says what the code does, and in the dead-claim case the loser writes nothing (its
  `prepare`, the terminal log line, runs only after it holds the claim), with a test.
  (9) `docs/seat/bell.ts` compares the real paths of `process.argv[1]` and its own file, as `seat/deploy.ts` does.
  (10) The migration's `readFile(log).catch(() => "")` and `stat(…).catch(() => undefined)` catch only an absent file
  (`ENOENT`) and rethrow any other error (T-01).
  (11) The refusal tests in `test/cli/migrate.test.ts` start with their refusal ID (`MIGRATE_JOBS_RUNNING: …`,
  `NOT_MIGRATED: …`, T-29 (2)).
  (12) `templates/agents.md`'s pulse list names `unknown`, with what it means, in the manual's tone (and the history
  line of `templates/.history/agents.md` follows).
  (13) The 40-character cut in `src/boundary.ts` keeps the two escapes of one character beyond U+FFFF together, with a
  test (U+E0001 at the cut).
  (T-29) The three tests that check two mechanisms are split, one mechanism each: the exclusive claim and the dead-claim
  recovery; `ownerState` for a missing identity and the reaper's handling of it; `ownerState` for another boot id and
  the reaper's.
  Rejected: finding 8 (`nlink` 0 accepted), a night default in `outcome.md` for Adrian to confirm.
- 2026-11-21 (main session, review round 2, `review.md`; the second and last round of fixes): fix findings 1, 2, 5, 6,
  7 and the T-29 answer.
  (1) In the coordinator hook a record that reads as `BAD_DATA` never stops the sweep: `deliveryLeft`,
  `refreshSettled` and `fallbackDueAt`'s default (and any other unguarded record read on the hook's tick) treat it as
  a damaged record, the sweep goes on to the other jobs, and `damagedRecords` reports it once per session; a test with
  one damaged record before a finished job, whose wake still comes.
  (2) The migration treats a `born` that is not in clock ticks like any value its field cannot hold: `born` is `null`
  in the record, its file stays, and the report says `kept born: <why>`; a test.
  (5) The hook's warning in an unmigrated project names what to do in full: run `limen migrate --dry-run`, then
  `limen migrate`, then reload the coordinator session (`/reload`), since the hook checks only at session start; its
  test follows the text.
  (6) `limen spawn` refuses `NOT_MIGRATED` before its first write (no worktree root, no group member slot); a test that
  an unmigrated project's spawn leaves no trace.
  (7) The two comments say the code's rule: the record read takes a regular file with at most one name (0 when it was
  renamed over after it was opened), and `readJobFile`'s comment says how its rule differs (exactly one name, an open
  failure read as empty).
  (T-29) "publishRecord writes a starting record once, …" and "the read refuses a record that is a symlink or has a
  second name" are split, one mechanism each.
  Rejected: findings 3 (to R-022's resolver), 4 (an open point for Adrian) and 8 (the place of seat-tool tests).
