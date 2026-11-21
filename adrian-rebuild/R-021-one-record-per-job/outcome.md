<!-- PL: Wynik R-021 (noc 20/21.11, zamknięty: recenzja PASS w rundzie 3; cztery uwagi rundy 3 czekają na Adriana w
pytaniu Q-10): każdy job ma jeden `record.json` (wersja 1) i `progress.json`,
pisane tylko przez `transition` pod blokadą joba, z porównaniem stanu i jednym zwycięzcą stanu końcowego; wszyscy
czytelnicy, hook, dzwonek (`bell.sh` → `bell.ts`) i `seat/deploy.ts` czytają przez moduł rekordu. Doszło polecenie
`limen migrate [--dry-run]` z testami na fiksturach, odmowa niezmigrowanego projektu kodem 4, skan starych nazw plików
w `test/structure.test.ts`, dokumentacja i prompty. Poprawki rund 1 i 2 recenzji są zrobione (runda 2: uszkodzony
rekord nie zatrzymuje przeglądu hooka, `born` spoza tyknięć zegara zostaje w pliku, pełne ostrzeżenie o migracji,
spawn odmawia przed pierwszym zapisem, komentarze reguły odczytu, podział dwóch testów), każda zmiana mechanizmu z
testem, który przed nią padał; bramka po rundzie 2: 484 testy, 0 porażek. -->

# R-021 outcome

## Done

Two implementer runs: the first (01:21–02:06, cut off by the usage limit) wrote most of Changes 1–6 and part of 9; this
run finished the readers, the tests, the docs and three fixes it found (below).

1. **Record module** `src/job/record.ts`: schema version 1 (`RECORD_FIELDS`, validators through `src/boundary.ts`), async
   and sync reads (`readRecord`, `readRecordSync`, `readProgress[Sync]`) with `O_NOFOLLOW`, a regular file, at most one
   name, a size cap; `BAD_DATA` names the file and the field. The one writer `transition(jobDir, change)`: `withLock({
   folder })`, compare-and-swap on `from`, no change after a terminal state, the `wx` claim `terminal` before a terminal
   write, `atomicWrite` (rename). `publishRecord` writes the first record (`starting`) in publication's hidden folder.
   `progress.json` (`writeProgress`) outside the transition function; the hook's watcher ignores it (`isProgressName`).
   `finalizeJob` moved to `src/job/finalize.ts` (commit count and open checks before the transition, side failures in
   `sideFailures`, the group, wake and tab after it, for the winner only). The poller's `readJobFile` lives here.
2. **Writers**: publication, spawn (`versions`), the wrapper (one transition `starting` → `running` with the identity
   `{pid, born, bootId}` and the queue place; no second `running`, A-053), `finalizeJob`, `stop`, `watch`
   (`origin.pane`), the group's reserved slot, the start queue (`queued`), the wrapper's advisory and stop reason, the
   reaper (through `finalizeJob`).
3. **Readers**: every module of `src/`, `hook/wake.ts`, `seat/deploy.ts` and `docs/seat/` reads the record or progress
   through the module; the local `text(path)` copies that read one-value files are gone (the six left read content
   files and receipts only). `docs/seat/bell.sh` keeps its path and runs `docs/seat/bell.ts`. `seat/deploy.ts` reads
   records, and a folder without a record by the older rule (`oldJobLive` in `src/job/migration.ts`), since the
   deployment runs before the migration. The sweep keys on `finishedAt` and the advisory's `at` and skips migrated
   records.
4. **Refusal**: `jobFolders`/`readRecord` throw `NOT_MIGRATED` (class `environment`, exit 4, `next` `limen migrate
   --dry-run`) for a folder with `state` and no `record.json`. The coordinator hook does nothing at session start in
   such a project (no coordinator registration, no project registration) and notifies the reason once.
5. **`limen migrate [--dry-run]`** (`src/commands/migrate.ts`, `src/job/migration.ts`, registry entry `object:
   "project"`, `kind: "change"`, `public`, new `Entry` field `irreversible: true`): refuses with `MIGRATE_JOBS_RUNNING`
   (exit 4) while a job runs or starts; migrates every value, removes moved and removed-feature files, moves folders
   without a known state to `.limen/unmigrated/<id>/`, reports older ids and token collisions; a dry run writes nothing,
   a second run has nothing to do.
6. **`src/boundary.ts`**: `nullOr`, `boolean`, `arrayOf`; the comment above `RAW`; the cut never splits an escape or a
   surrogate pair; `\p{Cf}` escaped.
7. **Scan** in `test/structure.test.ts`: no file of `src/`, `hook/`, `seat/`, `docs/seat/` outside the record module and
   the migration names an old job file or `record.json`/`progress.json` (string, template, `join`/`resolve` last
   argument; shell scripts by text), with exceptions listed by file, name and reason, and a fixture self-test. Ratchets
   lowered to the new counts: `JSON_PARSE` 38 → 34, runtime `CASTS` 75 → 60.
8. **Docs and prompts**: `templates/agents.md` (lines 76, 104, 142–144, 166, 195, 201, 205, 207: `limen show <id>`, no
   hand edit), `templates/.history/agents.md` (new hash line), `docs/jobs.md` (new section "The job record" with
   `record.json`, `progress.json`, `limen migrate`; the troubleshooting rows name `limen show`), `docs/commands.md`
   (registry section and job-file mentions), `docs/seat/README.md`, `docs/herdr-status.md`, `README.md:106`. The R-018
   comments: `src/job/record.ts` header (log is appended to) and `src/job/publication.ts:104` (never wider).
9. **Tests**: see `## Proof`; `test/plant.ts` gains `jobRecord`, `jobState`, `writeRecord`, `editRecord`; `waitJob`
   waits for a terminal record and the exit of the process it names.

Fixes this run found and made (each with its test first where it is a mechanism):
- A read that opened `record.json` just before a rewrite renamed a new one over it saw `nlink` 0 and threw `BAD_DATA`
  (seen in the gate as `spawn failed (4) … BAD_DATA` and a missed wake under load). `refuseFile` now refuses only more
  than one name.
- A migrated `running` record whose process is gone is ended by the reaper; its end prompted the coordinator's Herdr
  pane. `wakeMessage` (`src/integrations/coordinator-wake.ts`) gives none for a migrated record (D-057 (4)).
- `seat/deploy.ts` missed an older folder whose spawner was still setting it up (no `state` yet).

Review round 1 fixes (`ticket.md` → `## Decisions`, `review.md` → `## Round 1`), a third implementer run:
- (1) `migrateProject` builds the token and older-id reports from the folders after the moves (`.limen/jobs/` and
  `.limen/unmigrated/`), so a folder the run moved counts once.
- (2), (7) `progress.json` holds each progress value that exists and `null` for the rest (`Progress`'s three parts are
  nullable; the wrapper still writes all three); `finishFolder` writes a missing `progress.json` before it removes
  the progress files. The readers treat a `null` part as one never recorded (`src/job/listing.ts`,
  `src/job/wake-text.ts`).
- (3) HEAD's test "finalizeJob counts each steer left in the inbox in its log line, but not the temp of a steer
  write" is back, name and mechanism unchanged, on a running record, in `test/job/finalize.test.ts` (T-29).
- (4) `liveJob` gives a `running` record no startup grace: an unknown identity is not live, and the reaper ends the
  job after its confirmation; the grace stays for `starting` records.
- (5) `finalizeJob` takes `{ shutdownDeadline, from }`; `limen stop` on a starting job finalizes only from
  `starting`, and when the wrapper won the race to `running`, it re-reads the record and stops it as a running job.
- (6) `transition` checks for a dead claim before `prepare`, so a late finisher writes the claimed record and no log
  line; the comment says that only a terminal transition reads the claim.
- (9) `docs/seat/bell.ts` runs when the real path of `process.argv[1]` is its own, as `seat/deploy.ts` does.
- (10) The migration's catches use one helper, `whenAbsent`, that takes only `ENOENT` and rethrows the rest (T-01).
- (11) The two refusal tests of `test/cli/migrate.test.ts` start with `MIGRATE_JOBS_RUNNING:` and `NOT_MIGRATED:`.
- (12) `templates/agents.md`'s pulse list names `unknown` with what it means; the 2026-11-21 line of
  `templates/.history/agents.md` holds the new hash (the line of the unshipped draft replaced).
- (13) The cut's `PIECE` takes a high and a low surrogate escape as one piece.
- (T-29) Split into one mechanism each: the exclusive claim / the dead-claim recovery (`test/job/record.test.ts`);
  `ownerState` for a missing identity / the reaper's handling of it, `ownerState` for another boot id / the reaper's
  (`test/u9-process-identity.test.ts`).

Review round 2 fixes (`ticket.md` → `## Decisions`, `review.md` → `## Round 2`), a fourth implementer run:
- (1) `hook/wake.ts`: `undamaged(job, read, instead)` turns a `BAD_DATA` of one job into `instead` and notes the job
  for `damagedRecords`; `recordOf`, `leftFor` (`deliveryLeft` for the sweep and `refreshSettled`, a damaged record
  owes nothing) and the wake text use it; `settle` passes `fallbackDueAt` the finish time from `recordOf`, `observe`
  passes `oldEnoughForFallback` the record it read; a `BAD_DATA` out of `reapDeadJobs` ends that tick's reap, not the
  sweep. Test: `test/hook/wake.test.ts`, a damaged record before a finished job.
- (2) `src/job/migration.ts`: `born` is read through `OldValues.field`, so a `born` not in clock ticks is `null`, its
  file stays and the report says `kept born: not in clock ticks`. Test: `test/cli/migrate.test.ts`.
- (5) The hook's warning in an unmigrated project ends `run limen migrate --dry-run, then limen migrate, then reload
  this coordinator session (/reload): the hook checks only at session start`; its test matches the whole tail.
- (6) `recordSpawnedJob` lists the job folders (`jobFolders`, which refuses `NOT_MIGRATED`) before its first write,
  the `mkdir` of `.limen/jobs`, so the worktree root and a group's member slot come after it. Test:
  `test/cli/migrate.test.ts`, a refused spawn leaves `.limen/` and the repository's parent as they were.
- (7) `src/job/record.ts`: the header says the read takes a regular file with at most one name (none when renamed
  over after it was opened); `readJobFile`'s comment says it takes exactly one name and reads any open failure as
  empty, and how the record's read differs; `readRecord`'s comment says "at most one name" too.
- (T-29) `test/job/record.test.ts`: "publishRecord writes a starting record …" / "publishRecord writes once: … EEXIST";
  "the read refuses a record that is a symlink …" / "… that has a second name".

## Proof

Review round 2 fixes, run from the repository root at the end of that run:
- `node adrian-rebuild/tools/gate.mjs` → exit 0; tests 484, pass 484, fail 0, cancelled 0, skipped 0, duration
  121.2 s (one run). The main session's own run, which counts: exit 0, tests 484, pass 484, fail 0, cancelled 0,
  duration 112.3 s; then `fails-before.mjs` → exit 0 with the same 32 files as below.
- `npx tsc --noEmit` → exit 0; `npx biome check --error-on-warnings .` → exit 0 ("Checked 208 files … No fixes
  applied."); `node adrian-rebuild/tools/check.mjs` → exit 0 (run after this file was written).
- Single files after their fixes: `test/hook/wake.test.ts` 3 pass; `test/cli/migrate.test.ts` 18 pass;
  `test/job/record.test.ts` 14 pass; 0 fail each.

Review round 1 fixes, run from the repository root at the end of that run:
- `node adrian-rebuild/tools/gate.mjs` → exit 0; tests 479, pass 479, fail 0, cancelled 0, skipped 0, duration
  112.3 s (one run). The main session's own run, which counts: exit 0, tests 479, pass 479, fail 0, cancelled 0,
  duration 111.4 s.
- `npx tsc --noEmit` → exit 0; `npx biome check --error-on-warnings .` → exit 0 ("Checked 208 files … No fixes
  applied."); `node adrian-rebuild/tools/check.mjs` → exit 0, "0 errors" (run again after this file was written).
- Single files after their fixes: `test/cli/migrate.test.ts` 16 pass; `test/job/record.test.ts` 12 pass;
  `test/u9-process-identity.test.ts` 6 pass; `test/boundary.test.ts` 33 pass; `test/seat/bell.test.ts` 3 pass;
  `test/cli/stop.test.ts` 1 pass; `test/job/finalize.test.ts` 1 pass; `test/structure.test.ts` 27 pass; 0 fail each.

Before the review, run from the repository root at the end of the second run:
- `npx tsc --noEmit` → exit 0.
- `npx biome check --error-on-warnings .` → exit 0 ("Checked 206 files … No fixes applied.").
- `node adrian-rebuild/tools/gate.mjs` → tests 468, pass 468, fail 0, cancelled 0, duration 108.8 s. (The run was piped
  through `grep` for the summary lines, so its own exit status was not captured.) The main session's own run, which
  counts: exit 0, tests 468, pass 468, fail 0, cancelled 0, duration 107.7 s.
- `node adrian-rebuild/tools/check.mjs` → exit 0, "0 errors" (run again after this file was written).
- Single files during the run: `node --test test/job/record.test.ts` → 11 pass, 0 fail (AC-1);
  `test/u9-process-identity.test.ts` with record, boundary and bell tests → 48 pass, 0 fail (AC-2, AC-4);
  `node --test test/cli/migrate.test.ts` → 12 pass, 0 fail (AC-3); `node --test test/structure.test.ts` → 27 pass, 0 fail
  (AC-5); `node --test test/seat/deploy.test.ts` → 22 pass, 0 fail (AC-7); `test/help.test.ts` and
  `test/registry.test.ts`, `test/s9-housekeeping.test.ts`, `test/cli/sweep.test.ts` pass inside the gate (AC-6, AC-7).
- AC-8: `git grep -n -E 'jobs/<id>/state|plain .state. file|edit it' -- templates/agents.md docs/jobs.md` → no output.

Tests added (one mechanism each):
- `test/job/record.test.ts`: transition only from the expected state; two finishers, one winner, the loser writes
  neither record nor log line; nothing after a terminal state; the `wx` claim and a claim whose record was never
  written; `sideFailures` with the terminal state; `BAD_DATA` naming file and field; symlink and second name refused;
  the sync read; `NOT_MIGRATED`; a read during rewrites never `BAD_DATA` (this run).
- `test/u9-process-identity.test.ts`: a missing identity is unknown, never alive; another boot id is dead; another start
  time at the pid is dead.
- `test/cli/migrate.test.ts` (this run, 12 tests): every value of a valid folder in a field and content byte for byte;
  ORPHAN and an unknown state moved unchanged; a job without `task.md`/`log`; `finishedAt` from the mtime of `state`;
  a 4-hex id; a token collision; R-005's hosted leftovers, `deadline` and `tip` removed; the failure kind from a
  `failed:` log line and from `stop-reason`; `--dry-run` writes nothing; a second run exits 0 with nothing to do; the
  refusal while a job runs; `limen status` refuses an unmigrated project with exit 4 and `next`.
- `test/hook/wake.test.ts` (this run): the hook does nothing in an unmigrated project and notifies once.
- `test/seat/bell.test.ts`: a terminal record rings once; a migrated one never.
- `test/integrations/coordinator-wake.test.ts` (this run): a migrated record's end prompts no Herdr pane.
- `test/seat/deploy.test.ts` (this run): an older folder whose spawner still sets it up refuses the deployment.
- `test/help.test.ts`, `test/registry.test.ts` (this run): `limen migrate` in the general help and `docs/commands.md`;
  the irreversible entries are changes with tests of running again and losing nothing (T-28's Check).
- `test/boundary.test.ts`: `nullOr`, `boolean`, `arrayOf`, the cut and `\p{Cf}`.
- `test/structure.test.ts`: the job-file scan and its self-test.

## Fails before

The first implementer's own failing runs are lost with it (cut off by the usage limit). This run's own failing runs
before a change:
- `node --test --test-name-pattern="a read during rewrites" test/job/record.test.ts` → fail 1: `actual: [ 'running',
  '…/record.json: expected a regular file with one name, got "0 names"' ]`; after the fix in `refuseFile`, pass.
- `node --test test/integrations/coordinator-wake.test.ts` → fail 1: `AssertionError: a Herdr wake was claimed for a
  migrated record`; after the change in `wakeMessage`, pass.
- `node --test test/structure.test.ts` → fail 2 on the previous run's code (the names `failureOf` declared outside
  `src/outcome.ts`; `open` in `readJobFile` before its flags constant), then pass after renaming and moving them.
- First gate of this run → fail 6 (continue, status `--all`, old-hosted, three group-extension tests: the `nlink` 0
  race and unconverted reads of `extensions.json`); second gate → fail 1, cancelled 1 (`s1-spawn` read the old `repo`
  file; `s2-herdr`'s queued test waited in `waitJob` while its own process served the Herdr socket); third gate → fail 0.

Review round 1: each test written or changed first and run on the tree before its fix (the second run's tree):
- (1), (2), (7), (10) `node --test test/cli/migrate.test.ts` → fail 4: the report of a run that moves folders listed
  `older id 2026-11-12-orphan-1a2b` twice and `token 5e6f7a8b is shared by 2026-11-12-odd-5e6f7a8b,
  2026-11-12-odd-5e6f7a8b` (and the same for `1a2b`); `readProgressSync` gave `undefined` for a folder with
  `activity` and `last-tool` and no `tool-calls`, and `undefined` after finishing an interrupted migration; a log that
  is a folder (EISDIR) gave `[0, 0, true]` against `[1, "UNTYPED", false]` (exit 0 and a record written).
- (4) `node --test test/u9-process-identity.test.ts` → fail 1: "the reaper ends a running job whose identity is
  unknown once confirmed, also one that started just now": `actual: ['running', 'running']`, `expected: ['failed',
  'failed']`.
- (5) `node --test test/cli/stop.test.ts` → fail 1: `actual: ['still running', 'stopped']`, `expected: ['SIGTERM',
  'stopped']` (the stop ended the record without a signal; the wrapper's stand-in kept running).
- (6) `node --test --test-name-pattern="claim" test/job/record.test.ts` → fail 1: "a claim whose record was never
  written still wins …": `actual: [undefined, 'failed', true]`, `expected: [undefined, 'failed', false]` (the loser's
  `prepare` wrote its log line).
- (9) `node --test test/seat/bell.test.ts` → fail 1: "the bell started through a symlinked path rings …": `actual: []`
  against one POST `/topic limen: the work is done (done-job)`.
- (13) `node --test --test-name-pattern="40-character cut" test/boundary.test.ts` → fail 1: `actual: '… got
  "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx\\udb40…'`, `expected: '… got "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx…'`.
- (3) `node --test test/job/finalize.test.ts` → pass 1 on the tree before the fixes: the mechanism was kept in
  `src/job/finalize.ts` and only its test was deleted, so the restored test fails only at `HEAD`, where
  `src/job/finalize.ts` does not exist (import).
- (T-29) the split tests of the exclusive claim, of `ownerState` for a missing identity and of another boot id passed
  at once: the split only separates mechanisms.

Review round 2: each test written or changed first and run on the tree of the round 1 fixes, before its fix:
- (1) `node --test --test-name-pattern="a damaged record before a finished job" test/hook/wake.test.ts` → fail 1 after
  10.1 s: `AssertionError: the condition did not hold in time` (no wake of the finished job came; `deliveryLeft` threw
  `BAD_DATA` on the damaged record before it on every tick). After the fix, the first run failed 1 on the test's own
  pattern (it expected the field `state`; the record's first refused field is `id`: `…/record.json: id: expected a
  job ID, got nothing`), with the wake delivered and the damage named once; the pattern now matches the file name,
  and the test passes.
- (2) `node --test --test-name-pattern="a born that is not in clock ticks" test/cli/migrate.test.ts` → fail 1: `ENOENT:
  no such file or directory, open '…/2026-11-03-born-1a2b3c4d/born'` (the migration removed the file).
- (5) `node --test --test-name-pattern="older state file" test/hook/wake.test.ts` → fail 1: the input `'limen: wakes are
  off in this project: … see what limen migrate would do, then run it; run limen migrate --dry-run'` did not match the
  pattern of the full steps.
- (6) `node --test --test-name-pattern="a spawn in a project not yet migrated" test/cli/migrate.test.ts` → fail 1: "no
  worktree root beside the repository": the parent listed `.repo-limen-worktrees`.
- (7) and (T-29): comments and split tests, no failing run.

`node adrian-rebuild/tools/fails-before.mjs` (main session, after the gate of 479/479 of the review round 1 fixes) →
exit 0:

```
fails-before: test/boundary.test.ts, test/cli/continue.test.ts, test/cli/old-hosted.test.ts, test/cli/old-names.test.ts, test/cli/spawn.test.ts, test/cli/status.test.ts, test/cli/sweep.test.ts, test/group-extensions.test.ts, test/help.test.ts, test/hook/wake.test.ts, test/job/record.test.ts, test/picture/serve.test.ts, test/plant.test.ts, test/registry.test.ts, test/s1-spawn.test.ts, test/s10-doorbell.test.ts, test/s2-herdr.test.ts, test/s3-finish-wake.test.ts, test/s4-steering.test.ts, test/s5-land.test.ts, test/s6-keeper.test.ts, test/s8-groups.test.ts, test/s9-housekeeping.test.ts, test/seat/deploy.test.ts, test/structure.test.ts, test/u11-live-activity.test.ts, test/u9-process-identity.test.ts, test/cli/migrate.test.ts, test/cli/stop.test.ts, test/integrations/coordinator-wake.test.ts, test/job/finalize.test.ts, test/seat/bell.test.ts fail at HEAD (exit 1)
```

(Before the review, after the gate of 468/468, the same run listed the same files without `test/cli/stop.test.ts` and
`test/job/finalize.test.ts`, exit 0.)

The tail it printed holds the job-file scan of `test/structure.test.ts` at `HEAD`'s copy: its `actual` lists the old
job-file names `HEAD` reads outside a record module (`src/commands/continue.ts:314: repo`, `src/commands/diff.ts:14:
base`, `src/commands/group.ts:537: state`, `src/commands/spawn.ts:448: state`, `src/commands/spawn.ts:712: pid` and
97 more) against `expected: []`, and `test/u11-live-activity.test.ts` and `test/u9-process-identity.test.ts` failed.

Every new or changed test file fails at `HEAD`, most of them at import, since `test/plant.ts` and the tests import
exports of `src/job/record.ts` that `HEAD` lacks. Tests whose mechanism `HEAD` already has and that would pass there if
their imports resolved: the deploy test of an older folder (HEAD read that folder the same way), the bell's "rings once"
(the shell bell did that), and the converted tests of `test/plant.ts`'s users, which keep their names and mechanisms.

## Night defaults

Category A (D-054 (2)); each: the choice, the alternative, the reason.
- The record module is `src/job/record.ts`, `finalizeJob` in `src/job/finalize.ts`; alternative one file; finalize
  imports the group, wake and Herdr modules, which import the record module.
- Field names in camelCase as the TypeScript type (`stopRequested`, `openChecks`, `spawnerPid`, `stopReason`, `origin`,
  `route`, `identity`); alternative the old file names; one name per field in code and file.
- State `starting` in the record (published, wrapper not run yet) replaces "no state file"; ORPHAN is a starting record
  whose spawner is gone past the startup grace; alternative `state: null`; a typed state the reaper and prune compare.
- `starting` → `spawnerPid`; `group-owner.json` → the identity when no `pid` exists; `extensions.json` → `extensions`;
  `commits` and `open-checks` → arrays of lines; `queued` → `{since, detail, ahead}`; `advisory` → `{text, at}`;
  alternative one string per file; the readers need the parts.
- `cleanup` stays a content file (see `## Deviations`).
- The terminal claim is the file `terminal` holding the claimed record; a claim whose record was never written still
  wins and is written by the next change; alternative an empty claim; the winner's record survives its death.
- A read accepts `nlink` 0 (a record renamed over after it was opened); alternative a second read; the text read is a
  whole earlier record and no attacker can produce 0 names for another file.
- Codes `NOT_MIGRATED` and `MIGRATE_JOBS_RUNNING`, both `next` `limen migrate --dry-run`; `limen migrate`'s `next` is
  `limen migrate` after a dry run with changes, else empty.
- Migrated transitions: `{from: null, to: "starting", at: started-at}` and `{from: null, to: <state>, at: finishedAt}`
  (`started-at` was written at publication; the state before is unknown); alternative `from` guessed; z. 10.
- A value its field cannot hold keeps its file and the report says `kept <name>: <why>`; an interrupted migration
  (record present, old files left) is finished by the next run; alternative refuse the folder; nothing lost, T-02.
- Report lines: `job <id>: migrate (<state>); <notes>`, `  remove <files>`, `job <id>: move to .limen/unmigrated/<id>:
  <reason>`, `older id <id>: only its full id names it`, `token <t> is shared by <ids>: only their full ids name them`,
  and the summary line.
- `Entry.irreversible?: true`; alternative a list in the registry test; the registry is the one source (T-19).
- The hook treats a damaged record as none and notifies it once per session; alternative stop all wakes; one bad record
  must not silence the others (T-01).
- The bell's message `limen: <label> is <state> (<id>)`, `notify/bell` holds the state, as the shell bell wrote.
- Sweep keys: `_terminal.<state>.<finishedAt ms>` and `_advisory.<at ms>`; a marker of the same terminal state in the
  older key counts as claimed, so the change of key rings nothing again.
- `limen prune`'s line for a never-started record: "record never started and its spawner is gone"; the s9 regex follows.
- Test places: the CLI refusal in `test/cli/migrate.test.ts`, the hook's in `test/hook/wake.test.ts`, the migrated wake
  in `test/integrations/coordinator-wake.test.ts`, the bell in `test/seat/bell.test.ts` (T-29: beside their modules).
- `waitJob` waits for the exit of the recorded process; `test/s8-groups.test.ts` drops its wait for the removed `pid`
  file and `test/s2-herdr.test.ts`'s queued test waits with `until`, because its Herdr socket answers from the test
  process, which a synchronous wait would block until the wrapper's 15-second socket timeout.
- `templates/.history/agents.md` gains the hash of the changed template with today's date (the history test).
- The two ratchets set to the counts measured now (34 and 60), so they keep falling.

Review round 1 (third run):
- Fix (2): of the decision's two ways, `progress.json` with nullable parts, written when at least one value exists;
  alternative keep `activity` and `last-tool` as files with a `kept` note; a kept file is one nothing reads, and
  every job that never called a tool would get a note.
- Fix (5): `finalizeJob`'s fourth parameter is an options object `{ shutdownDeadline, from }`; alternative a fifth
  positional parameter or a second function; the wrapper's six calls pass `{ shutdownDeadline }`.
- Fix (6): the dead claim is read before `prepare` (`writeDeadClaim`) and the claim is then written exclusively
  without an `EEXIST` branch, since every claim is taken under the job's lock; alternative claim with a preliminary
  record before `prepare`, which would leave out a side failure of the log line.
- Fix (1): the folders are listed again after the moves; alternative a set of the ids before and below
  `.limen/unmigrated/`; the listing counts what is on disk after the run.
- Fix (10): a read error other than `ENOENT` ends the migration as the untyped refusal of the system error (exit 1),
  the folders before it stay migrated, and the next run goes on with the rest; alternative a typed `environment` error,
  which the decision does not ask for.
- Test places: the restored test in a new `test/job/finalize.test.ts`, the stop race in a new
  `test/cli/stop.test.ts` (in process: the test holds the job's lock until it has moved the record to `running`).
- `templates/.history/agents.md`: the 2026-11-21 line of the unshipped draft replaced by the new hash, not a second
  line for the same day.
- Round 2 fix (1): a damaged record owes nothing (`leftFor` gives `"nothing"`), so it settles until a watch event on
  its folder or the rolling refresh reads it again; alternative `"open"`, which reads it on every tick; the hook can
  deliver nothing from a record it cannot read.
- Round 2 fix (1): the guard lives in the hook; `src/job/wake-delivery.ts`, `src/job/wake-text.ts` and
  `src/runtime/reap.ts` stay loud for every other caller (finding 3's loud `BAD_DATA`). A `BAD_DATA` out of
  `reapDeadJobs`, which reads only the records the same tick read as running, ends that tick's reap and is named on
  the next tick, when the sweep reads the record as damaged; alternative a per-job guard inside the shared reaper.
- Round 2 fix (6): the refusal test is a plain spawn; a group's member slot is claimed later in the same function,
  after the same check; alternative a group fixture, much heavier for the same line.

## Deviations from the ticket

- `cleanup` stays a content file, not a record field (ticket `## Decisions` night default (1) lists it). Containment
  writes it after the terminal state (`limen stop`'s "after stop" and the wrapper's "after exhaustion" run in the
  background, `src/commands/stop.ts:45`, `src/runtime/wrapper.ts:149`), as a multi-line note for the owner; a record field could not be written then without breaking "nothing written after a terminal state". The scan's
  name list leaves it out; the migration keeps it.
- The reaper may end a migrated record that says `running` (its process is gone): `limen status`/`show` then write its
  terminal state into the migrated record, which keeps `migrated`. No wake, bell or seat event follows (all skip
  migrated records). The alternative, a migrated `running` record shown as running forever, hides a dead job.

## Measurement

- `unmeasured` M-10: the gate grew (108.8 s in the last run against the 79–88 s baseline); measured at the stage close.
- `unmeasured` M-01: `templates/agents.md` changed, so the coordinator's fixed context changed by a few words; measured
  at the stage close.
- `unmeasured` M-11: the failure kinds the migration fills from today's patterns; read by `limen stats` (R-024).
- The bell (`bell.sh` → `bell.ts`) is unmeasured until it runs on the seat; no M-NN covers it (seat step of
  `## Deployment`).

## Open points

- `limen keeper` refuses a terminal job while its wrapper still runs its after-end steps (group, Herdr wake, tab), up
  to the Herdr timeout; HEAD removed `pid` before the Herdr wake. The A-088 rule holds; the window is longer.
- The migration writes records with `exclusive` (a link): a reader in that instant sees two names and `BAD_DATA`. The
  migration refuses while jobs run, so only a concurrent `limen status` could see it.
- `docs/seat/agent-setup.md`'s bell steps are out of scope; the bell now needs `node` on the service's `PATH`.
- Review round 2, finding 4 (rejected): records refuse an unknown field, so a reader older than a record (a hook loaded
  before an upgrade, until `/reload`) reports it as damaged; whether records accept unknown fields is a format question
  for Adrian.
- Review round 2, finding 3 (rejected, to R-022): one record that reads as `BAD_DATA` makes `resolveJob` and plain
  `limen status` fail with exit 4; `plan.md` → `## Tickets` notes it for R-022's resolver.
- Review round 3 (main session): two docs lines that still named old job files are fixed (`docs/jobs.md:168`,
  `README.md:87`); four notes on code and the manual (`born` dropped without a `pid`, the hook's damaged map that only
  grows, unguarded `progress.json` reads on the hook's tick, "or no pid yet" under `starting`) wait for Adrian:
  `.night/questions.md` → Q-10.
- Adrian to confirm in the morning: the night defaults above and the two deviations (`cleanup` a content file; the
  reaper may end a migrated `running` record).
