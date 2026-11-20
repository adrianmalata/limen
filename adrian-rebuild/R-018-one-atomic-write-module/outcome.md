<!-- PL: Wynik ticketu R-018 (20.11; szkic implementera): nowy moduł `src/atomic-write.ts` jest jedynym miejscem zapisu
i zmiany nazwy pliku: plik tymczasowy obok celu (`<cel>.<pid>.<hex>.tmp`), fsync pliku, rename albo (z `exclusive`)
link i usunięcie pliku tymczasowego, fsync katalogu; do tego `atomicRename`, formy synchroniczne, wzorzec nazw
tymczasowych i pid ich autora. Osiem kopii tej polityki i około 60 bezpośrednich zapisów w `src/` i `hook/` idzie
przez moduł; pięć czytników katalogów, do których moduł teraz pisze, pomija jego pliki tymczasowe. Skan w
`test/structure.test.ts` zabrania prymitywów zapisu poza modułem, z listą wyjątków (zamki do R-019, LaunchAgent do
R-032). Po recenzji 1 poprawki 1–6: odpowiedź GitHub bez `exclusive`, prawa kopiowanego transkryptu, prawdziwy
komentarz wzorca, mocniejsze testy EACCES, testy dwóch filtrów i formy synchronicznej. Bramka: 340 testów, 0 porażek.
Recenzja 2: PASS; trzy uwagi do komentarzy i nagłówków testów przechodzą do R-021 i R-025. Stan: zamknięty. -->

# Outcome: R-018 One atomic-write module

## Review round 1 fixes

`ticket.md` → `## Decisions`, the entry of review round 1, items 1–6 (`review.md` → Round 1, findings 1 and 3–7;
finding 2 rejected). The tests were written before the fixes and run in the working tree; after the fixes the gate
passes with 340 tests (333 + 7 new).

1. Finding 1: `github resolve` writes `outcomes/<id>.json` with a plain `atomicWrite` (temp and `rename`, one name at
   every moment) and `mode: 0o660`; the `mkdir` of the claim's `inflight/<id>` gate before it is the exclusion, and a
   comment at the write says why it is not `exclusive` (`src/commands/github.ts:185-196`, the write at `:192`). New test in
   `test/cli/github.test.ts`: "github resolve records the no-job answer under one name, and a second resolve of the
   claim refuses at its gate" (the file has `nlink` 1; the second resolve exits non-zero naming `inflight/104`; the
   file keeps the first answer). It passes before the fix and at `HEAD`: the second name of a link lives only between
   two system calls inside one `atomicWrite`, so no command can observe it once the call has returned (below, "New
   tests that pass at `HEAD`"). No other caller of `exclusive` writes a file that `readJobFile` reads: its readers are
   the outcome file and, in job folders, `result`, `log`, `task.md`, `candidate`, `base`, `branch`, `state` and `role`
   (`src/integrations/github-poller.ts:296`, `:376-377`, `src/integrations/github-review.ts:134`); of these, only the
   publication writes with `exclusive` (`task.md`, `candidate`, `base`, `branch`, `role`), in its hidden
   `.publishing-<id>` folder, which becomes the job folder by one rename after every link's temp is unlinked; a crash
   before that rename leaves no job folder.
2. Finding 3: the transcript copy of publication keeps the source's permission bits: `stat` of the source, its
   `mode & 0o777` passed as `mode` (`src/job/publication.ts:154-159`). New test in `test/cli/continue.test.ts`: "limen
   continue copies the parent's session transcript with the transcript's permission bits" (a parent transcript set to
   0o600, the continuation's copy 0o600). Before the fix, in the working tree: `node --test
   --test-name-pattern="permission bits" test/cli/continue.test.ts` → exit 1, `actual: 420, expected: 384` (0o644
   against 0o600). It passes at `HEAD`, where `copyFile` kept the mode.
3. Finding 4: the comment of `TEMPORARY_NAME` (`src/atomic-write.ts:18-23`) says which temps the pattern covers (the
   module's and those of the old `atomicWrite`, time in hex, and of the seat registry and seat rules writers, time in
   decimal) and that the old temps of `saveJson`, Picture and the GitHub poller do not match and are not swept; the
   comment of `temporaryWriter` says it is `undefined` when the pattern does not match.
4. Finding 5: the two EACCES tests of the write ("atomicWrite syncs the target's folder after the rename …" and its
   sync form) also assert that the target holds the new content and is the folder's only entry, so they fail if the
   folder is opened to sync before the rename. They change no behaviour, so they pass in the working tree; at `HEAD`
   the module does not exist.
5. Finding 6: a test each for the two filters that had none. "limen sweep rings for a finished job whose delivered
   folder holds only the temp of a delivery write" (new `test/cli/sweep.test.ts`; the seat event marker
   `_terminal.done.<since>` is written) and "finalizeJob counts each steer left in the inbox in its log line, but not the
   temp of a steer write" (new `test/job/record.test.ts`). Both filters were in place from round 1, so the tests pass in
   the working tree; at `HEAD` (`node adrian-rebuild/tools/fails-before.mjs test/cli/sweep.test.ts
   test/job/record.test.ts` → exit 0): the sweep writes no marker, `actual: [], expected: [ '_terminal.done.<since>' ]`;
   the log line reads `stopped: stopped by request; 2 steer(s) never delivered`. `## Deviations` → 1 now names the
   test of each of the five filters.
6. Finding 7: three tests of the sync form: "atomicWriteSync gives a new target the mode it is asked for", "an
   exclusive atomicWriteSync creates a missing target with its whole content" and "atomicRenameSync syncs the source's
   folder as well as the target's, so a source folder it cannot open fails with EACCES". They change no behaviour; at
   `HEAD` the module does not exist.

## Done

1. `src/atomic-write.ts` (new), the only module that writes or renames a file:
   - `atomicWrite(path, data, { mode?, exclusive? })` and `atomicWriteSync`: a temp beside the target from
     `temporaryPath` (`<target>.<pid>.<16 hex>.tmp`, the hex from `randomBytes(8)`), opened `wx` with `mode` (0o666
     before the umask by default, as `writeFile`); write, fsync, close; `rename` onto the target, or with `exclusive`
     `link` onto it (EEXIST like `wx`) and `unlink` of the temp; then fsync of the parent folder. A failure before the
     rename or link removes the temp (only a temp this call created) and rethrows the error unchanged, so its code
     stays; the target is untouched. The rename or link is the commit point: a failure after it (the temp's unlink
     after a link, or the folder's fsync) is still rethrown, with the target already in place; the module comment says
     so. `data` is a string or bytes, so `init` and the transcript copy write a file's bytes.
   - `atomicRename(from, to)` and `atomicRenameSync`: `rename`, then fsync of the folder of `to` and, when it differs,
     of `from`.
   - `TEMPORARY_NAME` (`/\.(\d+)\.[0-9a-f]+\.tmp$/`, the pattern of the old `atomicWrite`) and `temporaryWriter(name)`,
     the writer's pid of a temp name or `undefined`. `finalizeJob` sweeps the temps of dead writers with
     `temporaryWriter`; `progressFilename` strips a temp suffix with `TEMPORARY_NAME` before it matches `activity` or
     `last-tool`.
2. Every write and rename of `src/`, `hook/` and `seat/` goes through the module (`seat/` holds no write):
   - The eight copies: `atomicWrite` leaves `src/job/record.ts` (its seven importers import the module);
     `saveJson` (`src/job/group-cabinet.ts`) is one `atomicWrite` call; Picture's `writeAtomic` is gone and
     `buildPicture` keeps its `mkdir` and calls `atomicWrite`; the seat registry (`updateRegisteredProjects`) and
     `writeRule` call `atomicWriteSync`; the poller's `mirror`, `persist` and both cursor writes call `atomicWrite`
     with their modes.
   - Overwrites: `spec/build.md` and the done ticket's `ticket.md` (`src/project/lanes.ts`), a group slot's four files
     (`src/commands/group.ts`), `result` of the finish hook, `stop-requested`, the Herdr place files, `note.first.md`,
     round results, `result.md` and the result receipt of groups, the keeper's packet, the coordinator registration
     files, the lead registration (`hook/group-peer.ts`), `last-sweep` and a pending claim's `live` (`hook/wake.ts`),
     the wake claim files (`owner`, `accepted`, `live`), the steer claim files (`owner`, `text`, `accepted`), the
     recovery claim's entry, the GitHub binding, `.gitignore` when `init` creates it, and the GitHub no-job outcome
     (round 1, fix 1: its `wx` create became a plain write behind the claim's gate).
   - `wx` creates, now with `exclusive`: `versions` (spawn, continue), the ticket file of `ticket new`, the steer inbox
     entry, `steer/ready`, the publication's job files and `notify/ready`, the wake markers (`claimMarker`,
     `notify/ready`, subscribers, `unsuccessful`, `blocked`), the seat event marker of `sweep`, the rule's `ended.*`,
     the rule ping receipt, the coordinator wake receipt and its delivered slot, `watch`'s subscriber and ready marker,
     and the poller's authoritative claim.
   - Copies: `init` reads each template and writes it with `exclusive`; `publication.ts` reads the transcript and
     writes it with `exclusive` and the transcript's permission bits.
   - Renames through `atomicRename`/`atomicRenameSync`: the wake and steer claim folders onto `delivered`, the
     publication folder onto the job folder, the done-ticket folder move, the worktree move of `prune`, and the
     recovery claim folder.
   - Appends stay appends (`appendFile`, `appendFileSync`: job logs, the attempt counter of `recordUnconfirmed`).
3. The scan in `test/structure.test.ts` (TypeScript AST over the files git knows below `src/`, `hook/` and `seat/`,
   skipping `src/atomic-write.ts`): an import from `fs` or `fs/promises` of `writeFile`, `writeFileSync`, `rename`,
   `renameSync`, `copyFile`, `copyFileSync`, `link`, `linkSync` or `createWriteStream` (aliases by their own name); a
   call of one of them, as `name(…)` or `object.name(…)`; and a call of `open`/`openSync` whose flags write (a string
   with `w`, `a` or `+`, an `O_WRONLY`/`O_RDWR`/`O_CREAT`/`O_APPEND`/`O_TRUNC` constant, a name read through its `const`
   in the file, or a name it cannot read). A failure lists `<file>:<line>: <primitive>` (`import <primitive>` for an
   import). `WRITE_EXCEPTIONS` names, per entry, the path, the named function, the primitives it keeps (once per kept
   call), the ticket that removes them and what they are: `groupLock` (`writeFile` ×2, `rename`), the poller's `project`
   (`writeFile`, the poll lock), `withSeatLock`, `releaseSeatLock` and `removeAbandonedLock` of `src/project/seat.ts`
   until R-019, and `installSeatSweep` (the LaunchAgent installer) until R-032. Tests: the scan over the repository;
   a fixture self-test; and a test that every listed primitive still has its call, so the ticket that removes a lock
   must remove its entry.
4. `test/atomic-write.test.ts` (new, T-29): 20 tests, one per mechanism: replacement, mode, exclusive create,
   exclusive onto an existing file, cleanup after a failed write, the folder sync after the rename, temp names that do
   not collide in one millisecond, `temporaryPath`, `temporaryWriter`; for `atomicWriteSync` the same six mechanisms
   of a write; `atomicRename` (a move, a refused move, the sync of both folders) and `atomicRenameSync` (a move, the
   sync of both folders).

## Proof

All from the repository root, on the working tree of this ticket after the round 1 fixes.

| Command | Exit | Result |
|---|---|---|
| `node --test test/atomic-write.test.ts` (AC-1) | 0 | tests 20, pass 20, fail 0, skipped 0 |
| `node --test test/structure.test.ts` (AC-2) | 0 | tests 19, pass 19, fail 0 |
| `git grep -n -E 'writeAtomic\|\.tmp-\|randomUUID\(\)\}\.tmp' -- src/picture/picture-build.ts src/job/group-cabinet.ts` (AC-3) | 1 | no line |
| `node adrian-rebuild/tools/fails-before.mjs` (AC-4) | 0 | the nine new or changed test files fail at `HEAD` together (below) |
| `node adrian-rebuild/tools/gate.mjs` (AC-5) | 0 | tests 340, pass 340, fail 0, cancelled 0, skipped 0; duration_ms 82624.8 |
| `npx tsc --noEmit` (AC-6) | 0 | |
| `npx biome check --error-on-warnings .` (AC-6) | 0 | Checked 183 files, no errors |
| `node adrian-rebuild/tools/check.mjs` (AC-7) | 0 | 0 errors |
| `node --test` of `test/job/wake-delivery.test.ts`, `test/job/group-cabinet.test.ts`, `test/job/wake-text.test.ts`, `test/job/record.test.ts`, `test/cli/sweep.test.ts` | 0 each | tests 1, pass 1 each |
| `node --test --test-name-pattern="permission bits" test/cli/continue.test.ts`; `node --test --test-name-pattern="github resolve" test/cli/github.test.ts` | 0 each | tests 1, pass 1 each |

Before round 1 (the implementer's first run): the gate exited 0 with tests 333, pass 333, fail 0, duration_ms
82908.7 (and 88723.9 on the run before the comment fix of deviation 5).

The main session's own runs after the implementer's completion notification (2026-11-20, these count, step 4):
`node adrian-rebuild/tools/review-guard.mjs compare --git node_modules/.rebuild-review/R-018.git <ticket.md>` → exit 0
("the implementer's run is within its limits"); `node adrian-rebuild/tools/gate.mjs` → exit 0, tests 333, pass 333,
fail 0, duration_ms 82400.7; `node adrian-rebuild/tools/fails-before.mjs` → exit 0, the same five test files fail at
`HEAD`. After review round 1's fixes: `compare --git` (a new snapshot, D-035) → exit 0; `node
adrian-rebuild/tools/gate.mjs` → exit 0, tests 340, pass 340, fail 0, duration_ms 84802.0; `node
adrian-rebuild/tools/fails-before.mjs` → exit 0, "test/cli/continue.test.ts, test/cli/github.test.ts,
test/structure.test.ts, test/atomic-write.test.ts, test/cli/sweep.test.ts, test/job/group-cabinet.test.ts,
test/job/record.test.ts, test/job/wake-delivery.test.ts, test/job/wake-text.test.ts fail at HEAD (exit 1)".

The gate's 340 tests are the 310 of R-016's gate plus 30 new ones: 20 in `test/atomic-write.test.ts`, 3 in
`test/structure.test.ts`, 4 in `test/job/`, 1 in `test/cli/sweep.test.ts`, and 1 each in `test/cli/continue.test.ts`
and `test/cli/github.test.ts`.

AC-8 (judgment), in the code: every write of the module calls `handle.sync()` or `fsyncSync` on the temp before the
rename or link, and `syncFolder`/`syncFolderSync` on the parent folder before it returns; the folder sync is shown by
the four EACCES tests (a folder with mode 0o300 can take the temp and the rename but cannot be opened to sync; the two
write tests also assert that the target holds the new content, so the sync comes after the rename), the file's fsync
is not observable from a test. A failed write leaves no temp and the target as it was: the EISDIR tests (async and
sync). An `exclusive` write onto an existing file fails with EEXIST and changes nothing: content, inode and folder
listing compared in both forms.

## Fails before

The first tests were written first and run before any change of `src/` or `hook/`:

- `node --test test/atomic-write.test.ts`: exit 1; tests 1, fail 1: `code: 'ERR_MODULE_NOT_FOUND', url:
  'file:///…/src/atomic-write.ts'`.
- `node --test --test-name-pattern="write" test/structure.test.ts`: exit 1; tests 3, pass 2, fail 1. The failing
  test, "T-25: outside src/atomic-write.ts no file of src/, hook/ or seat/ imports or calls a write primitive …",
  listed 116 sites, from `hook/finish.ts:1: import writeFileSync` and `hook/finish.ts:68: writeFileSync` to
  `src/runtime/recovery.ts:19: rename`, among them `src/integrations/github-poller.ts:743: writeFile` (the cursor
  write inside `project`, which the poll lock's entry does not keep) and `src/job/record.ts:15: open` (the old
  `atomicWrite`'s `wx` open).
- `node --test test/job/wake-delivery.test.ts`: exit 1; `actual: [ '_advisory.1', 'session-a.4242.9f3c.tmp' ]`,
  `expected: [ '_advisory.1' ]`.
- `node --test test/job/group-cabinet.test.ts`: exit 1; `actual: 'lead-a.4242.9f3c.tmp'`, `expected: undefined`.
- `node --test test/job/wake-text.test.ts`: exit 1; `actual: '2 steer(s) never delivered'`, `expected: '1 steer(s)
  never delivered'`.
- The round 1 tests: see `## Review round 1 fixes` (fix 2 before its fix in the working tree; fix 5 at `HEAD`).

`node adrian-rebuild/tools/fails-before.mjs`, exit 0, after the round 1 fixes:

```
gate: git version 2.34.1 lacks 'worktree list -z'; the shim in …/node_modules/.rebuild-gate emulates it
fails-before: test/cli/continue.test.ts, test/cli/github.test.ts, test/structure.test.ts, test/atomic-write.test.ts, test/cli/sweep.test.ts, test/job/group-cabinet.test.ts, test/job/record.test.ts, test/job/wake-delivery.test.ts, test/job/wake-text.test.ts fail at HEAD (exit 1)
      'src/commands/init.ts:2: import copyFile',                        'src/commands/init.ts:2: import writeFile',
      …
```

Each file alone at `HEAD`, by `node adrian-rebuild/tools/fails-before.mjs <file>`: `test/cli/sweep.test.ts` and
`test/job/record.test.ts` fail (exit 0, fix 5 above); `test/cli/continue.test.ts` passes ("pass at HEAD, so they do not
show the change", exit 1; its new test is listed below); `test/cli/github.test.ts` fails, but only in its five `github
poll` tests, for the reason in `## Open points` → 3, which is not this ticket's change.

### New tests that pass at `HEAD`

- "the write scan finds named, aliased, namespace and method writes and opens for writing, and skips the module, a
  kept call, reads, text, an ignored file and other folders": it runs the scan, which the test file itself defines, on
  a fixture repository, and reads no file of `src/`; it is the scan's self-test (the pattern of `test/config.test.ts`).
- "T-25: every primitive of the write exception list keeps a call in its file and function": the lock and installer
  calls it lists stay in this ticket, so they exist at `HEAD` too (at `HEAD` the poller's `project` has two `writeFile`
  calls, at least the one listed). It fails once a later ticket removes a listed call without its entry.
- "limen continue copies the parent's session transcript with the transcript's permission bits" (round 1, fix 2): at
  `HEAD` `copyFile` kept the mode; the test fails on the first round's code (`actual: 420, expected: 384`), which
  dropped it.
- "github resolve records the no-job answer under one name, and a second resolve of the claim refuses at its gate"
  (round 1, fix 1): at `HEAD` the answer was a `wx` write with one name, and on the first round's code the second name
  existed only between the `link` and the `unlink` inside one call, so neither state is observable once the command
  returns. The test pins the gate and the single name after the call; the fix itself (a `rename`, never a `link`) is
  in the code at `src/commands/github.ts:190-196`.

## Deviations from the ticket

1. Readers of folders the module now writes into skip its temps. A temp sits beside its target until the rename or
   link, and stays after a crash; at `HEAD` these readers would take it for an entry. Each filters with
   `TEMPORARY_NAME`, and each has a test:
   - `deliveredSlots` (`src/job/wake-delivery.ts`): a temp of `notify/delivered/<session>` counts as a delivered
     completion, so its wake is skipped; `test/job/wake-delivery.test.ts`.
   - the delivered listing of `seatEvent` (`src/commands/sweep.ts:77`): the same temp stops the seat event;
     `test/cli/sweep.test.ts` (round 1).
   - `leadSession` (`src/job/group-cabinet.ts`): a temp of `.limen/group-leads/<session>` passes `SESSION_ID` and is
     returned as the lead session; `test/job/group-cabinet.test.ts`.
   - `jobEnding` (`src/job/wake-text.ts`): a temp in the steer inbox counts as an undelivered steer in the wake;
     `test/job/wake-text.test.ts`.
   - `finalizeJob`'s log line (`src/job/record.ts:39`): the same count in the job log; `test/job/record.test.ts`
     (round 1).

   The `## Change` names only the two readers of the temp name (`finalizeJob`, `progressFilename`); the readers that
   list a folder were not in the inventory. Folders listed by a filter that already excludes the temps (the steer
   inbox's digits, the group events' `.json`, the start queue's `.json`, the poller's claims) are unchanged.
2. An exception entry names the function as well as the path, and lists a primitive once per kept call. At path level,
   the entry for the poll lock would also have kept the cursor write in the same file, and at function level the
   cursor write inside `project` (`:743`); the count keeps exactly the lock. A staleness test checks every listed call.
3. `createWriteStream` counts as an open for writing in the scan (no use in the code).
4. `temporaryPath` is exported, so that the naming test reads a real temp name.
5. `test/structure.test.ts:86-87`: the comment's pointers move to `src/job/record.ts:53` (shifted by this ticket) and
   `src/job/group-cabinet.ts:306-307` (the `spawn` of `startGroupAdvance`, already stale at `HEAD`).
6. Round 1, fix 1: the GitHub no-job outcome, a `wx` create at `HEAD`, is a plain `atomicWrite`, against `## Change`
   item 2 ("the `wx` ones with `exclusive`"); `ticket.md` → `## Decisions`, review round 1, item 1.

## Measurement

- `unmeasured` M-10: two fsyncs per write slow spawn and the gate (Risk); this ticket's gate runs took 88.7 s, 82.9 s
  and, after round 1, 82.6 s; R-016's last gate took 76.9 s and the baseline is 79–88 s (`evidence/baseline.md`). A
  few runs on the laptop are no measurement (z. 17); M-10 at the close of stage 2.

## Open points

1. Round 1, fix 1 closed the first draft's open point on `readJobFile` (`src/integrations/github-review.ts:42-60`,
   which reads only a file with one name): the outcome file is written by `rename`, and no other `exclusive` write
   reaches a file that `readJobFile` reads (`## Review round 1 fixes` → 1).
2. Temps with the old names of other copies do not match `TEMPORARY_NAME`: `saveJson`'s `<path>.<uuid>.tmp`,
   Picture's `<file>.tmp-<pid>-<uuid>` and the poller's `<target>.<pid>.tmp`. No code swept them before (in a job folder
   only `group-owner.json` came from `saveJson`), so none is swept now; the old `atomicWrite`'s, the seat's and the
   rules' names match, as the ticket's Migration says and the comment of `TEMPORARY_NAME` now states.
3. `fails-before.mjs` puts its copy of `HEAD` under the OS temporary folder of the calling process (`/tmp`, mode
   1777), not under the gate's private `TMPDIR`. There the poller refuses its own module path
   (`privatePath(modulePath, …)`, `src/integrations/github-poller.ts:781`), so the five `github poll` tests of
   `test/cli/github.test.ts` fail at `HEAD` with `unsafe owner or permissions on /tmp` whenever that file is among the
   changed tests. They pass in the gate, at `HEAD` and here; the failure comes from where the tool runs, every time,
   so it is no flaky test (D-029), and I did not run it again. It makes `test/cli/github.test.ts` "fail at `HEAD`" for a
   reason other than this ticket's test, which passes there (above). A fix would be in `adrian-rebuild/tools/`, outside
   this ticket.
4. Four tests skip when run as root (the EACCES tests: root opens every folder); the gate runs as the user.
