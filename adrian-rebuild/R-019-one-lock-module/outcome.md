<!-- PL: Wynik ticketu R-019 (szkic implementera, noc 20/21.11, z poprawkami rund 1 i 2 recenzji): nowy moduł
`src/lock.ts` to jedyny moduł blokad Limena. Blokada to jeden plik z pełnym rekordem właściciela (pid, czas startu do
20 cyfr, boot id w kształcie UUID, losowy token, od kiedy), tworzony przez `atomicWrite` z `exclusive`; właściciel
znika przy innym boot id, innym czasie startu albo braku procesu, a przejęcie martwej blokady idzie pod roszczeniem na
znaleziony rekord, z ponownym odczytem przed przeniesieniem (A-087). Grupa (kabina, start, prune, kolejka startów),
rejestr projektów seata, `poll.lock` GitHuba (jedna funkcja `withPollLock` dla pollera i `github disconnect`) i numery
ticketów idą przez moduł; czekanie trwa najwyżej 60 s i kończy się `LOCK_TIMEOUT` (kod 3). Rundy 1 i 2 dodały odmowę
`BAD_DATA` dla rekordu z boot id innym niż UUID i z czasem startu dłuższym niż 20 cyfr, poprawiły komentarze i
nagłówki testów; bramka 429/429, a odstępstwa i domyślne decyzje nocy są niżej. -->

# Outcome: R-019 One lock module with process identity and a bounded wait

## Done

1. `src/lock.ts` (new), the one lock module (T-25 (1)). Its API: `withLock(guarded, operation, options)`, where
   `guarded` is `{ folder }` (lock `<folder>/.lock`) or `{ file }` (lock `<file>.lock`), so a caller names what it
   guards and only the module names a lock file; `lockPath(guarded)`; the pure decision `ownerGone(owner, observed)`.
   - A lock is one file holding its owner's record as JSON: `pid`, `born` (`ProcessInfo.born`), `bootId`, a random
     32-hex `token` and `since` (ISO time). It is created by `atomicWrite(…, { exclusive: true })`, a full temp linked
     onto the path, so it appears whole or not at all. It is read through `parseJson` of `src/boundary.ts` with the
     module's own validator (`recordOf`, `ownerOf`), through one file handle, so the file's status and its text belong
     to the same file. A damaged lock is a typed `BAD_DATA` error naming the file and the field. A record's `bootId`
     must have the shape of the platform's boot id (`BOOT_ID`, the UUID that `parseBootId` accepts; review round 1,
     finding 1), and its `born` at most 20 digits (`BORN`, the width of the largest 64-bit count; review round 2,
     finding 1), so no field of a lock file puts text of any length into the `LOCK_TIMEOUT` and `LOCK_LOST` messages.
     The module writes only an id that `platform.bootId()` gave, which `parseBootId` checked with the same constant,
     and a `born` from the kernel's 64-bit start time, so its own records always pass.
   - Gone: the pid answers no signal 0, or the record's boot id differs from the current one, or the process under the
     pid has another start time. Kept: `processInfo` says `unavailable`, or `absent` while the pid still answers;
     without a boot id on either side, the pid and the start time decide.
   - Takeover (A-087, D-029): after "found dead" (the injection point), the call takes the claim
     `<lock>.takeover.<token>`, itself a lock of the module taken with `skip`, so a claim whose taker died is taken over
     the same way. Under the claim it reads the lock again and moves it (`atomicRename` to `<lock>.abandoned.<uuid>`,
     then a recursive remove) only while it holds exactly what was found dead (form, device, inode, modification time
     and text, the text holding the token). Then it creates the lock with `wx` semantics, like any caller.
   - Waiting: `wait` (the default) reads the lock every 25 ms for at most 60 s (`LIMEN_LOCK_WAIT_MS` in tests), then
     throws a `LimenError` of class `transient`, code `LOCK_TIMEOUT`. Its message names the lock file, the owner (pid,
     start time, boot id, since when) and the hint: "run the command again once that process has ended; see it with
     `ps -p <pid> -o pid,lstart,args`" (`## Deviations` → 1). `skip` makes one attempt, which still takes over an
     abandoned lock, and returns `undefined` while a live owner holds it.
   - Release removes the lock only while it still holds the holder's token; otherwise it leaves the file and fails the
     call with `LOCK_LOST` (class `environment`, `## Deviations` → 3). An error of the operation passes through
     unchanged; a release that fails after it is not thrown over it (the lock holds this process's record, so the next
     caller takes it over once the process has ended), as `withSeatLock` did at `HEAD`.
   - The forms of `HEAD` (`## Migration`): a folder whose `owner` file holds a pid, and a file holding a pid (JSON reads
     it as a number), are abandoned only when that pid answers no signal; a folder with no owner file (and an empty
     file) once its modification time is more than 5 s old. Their takeover renames and removes them like a new lock;
     the leftovers of `HEAD`'s takeovers are not read.
2. `src/platform/platform.ts` and `src/platform/linux.ts`: `bootId()` reads `/proc/sys/kernel/random/boot_id`
   through the exported parser `parseBootId` (one UUID line; `undefined` for an empty or other text, or when the file
   cannot be read). The UUID's shape is the exported constant `BOOT_ID` of `src/platform/linux.ts`, which
   `src/platform/platform.ts` re-exports for the lock's record (round 1, night default 14).
3. Every lock goes through the module:
   - `groupLock` (`src/job/group-cabinet.ts`) is one call of `withLock({ folder })`; its overloads stay, its modes are
     `skip` and `wait`, and the 10-second default and the unbounded `wait` are both the bounded wait. Its callers, the
     launch lock, `worktreeLock` and the start-queue lock keep their calls. Its "split pending" suppression went with the
     old body.
   - The seat registry: `withSeatLock`, `releaseSeatLock` and `removeAbandonedLock` are gone.
     `updateRegisteredProjects` reads, changes and writes `.limen/projects` under `withLock({ file: projectsFile() })`
     through `atomicWrite`; it and `registerProject` are async, and `src/commands/sweep.ts` awaits it.
   - The poll lock has one definition (T-25, review round 2, finding 4): `withPollLock(root, operation)` of
     `src/integrations/github-poller.ts`, which takes `withLock({ file: <githubDir>/poll }, operation, { fileMode:
     0o660 })` and waits like any caller. The poller's `project` runs the poll under it; the poll itself is the new
     function `pollProject`, the old body unchanged but one indentation level out. `github disconnect`
     (`src/commands/github.ts`) takes and releases the same lock through `withPollLock` instead of polling for the
     file.
   - Ticket numbers: `withNextTicketCode` (`src/project/series.ts`) is async and allocates under
     `withLock({ file: <plant>/.limen/ticket-number })`; `src/commands/ticket.ts` awaits it.
4. `src/config.ts`: the test knob `LIMEN_LOCK_WAIT_MS` ("the lock's wait bound, in place of 60 s"), read only by
   `src/lock.ts`.
5. `test/structure.test.ts`: the five R-019 entries of `WRITE_EXCEPTIONS` are gone, the comment names only R-032's
   installer, and the write-scan test's name says "except the listed installer site". The new T-25 scan
   (`lockNameScan`, with `lockNames` on the TypeScript syntax tree) finds every string and template literal ending in
   `.lock` in the files git knows below `src/`, `hook/` and `seat/`, outside `src/lock.ts`, except the leftover entry
   `.limen/picture/tick.lock` of `src/project/leftovers.ts`; a finding is `<file>:<line>: <literal>`. Its fixture
   self-test follows the pattern of `test/config.test.ts`.
6. Tests (T-29), 28 new:
   - `test/lock.test.ts` (new, 21): a held lock keeps a second process out until its release; the lock file appears
     only by a link of a file that already holds the whole record; takeover when the pid is gone, when the pid runs with
     another start time (A-017), and when the boot id differs; an owner reported `unavailable` is kept; an owner
     `absent` but answering signal 0 is kept; `LOCK_TIMEOUT` with its class, the lock file and the owner; `skip` with a
     live owner; `LOCK_LOST`: release leaves another holder's lock; two `BAD_DATA` tests, through one helper
     (`refusesDamagedRecord`): a record whose `bootId` is a UUID followed by 900 more characters (round 1), and one
     whose `born` has 21 digits (round 2), each ends the call with an error that names the lock file and the field, the
     operation does not run and the lock stays; a dead taker's claim is taken over; six old forms
     (a folder with a live and with a gone pid, a file with a live and with a gone pid, a folder without an owner kept
     fresh and taken over past 5 s); `LOCK_TIMEOUT` on an old form names the file to remove by hand; the interleaving
     test of D-029, whose comment says "an older Limen" instead of "HEAD" (T-30, round 2, finding 2). The holders of
     the multi-process tests are child processes that take the lock through the module.
   - `test/project/seat.test.ts` (new, 1): 41 child processes, held at a FIFO until all are ready, call
     `registerProject` at once against a registry lock whose record names a gone pid; the registry holds all 41.
   - `test/platform/linux.test.ts` (1): the boot-id parser on fixture text. The file opens with one header line
     (T-29 (5), round 2, finding 3).
   - `test/cli/ticket.test.ts` (1): while the test process holds the ticket-number lock, `limen ticket new` with
     `LIMEN_LOCK_WAIT_MS=100` exits 3 with `LOCK_TIMEOUT` naming the lock and writes no ticket; after the release it
     takes F002. The file opens with one header line on what it tests, `check` and `new` (T-29 (5), review round 1,
     finding 6).
   - `test/cli/github.test.ts` (2): a `poll.lock` holding a gone pid (the file a killed poll of `HEAD` leaves) does not
     stop `github poll`, which reaches GitHub and exits 3 on its 503; `github disconnect` exits 0 past such a lock.
     The comment above them says "in an older Limen" instead of "at HEAD" (T-30, round 2, finding 2).
   - `test/config.test.ts`: the knob list gains `LIMEN_LOCK_WAIT_MS` (and its comment says so).
   - `test/structure.test.ts` (2): the scan and its self-test above.
   - `test/s9-housekeeping.test.ts:135` keeps its name, its 48 processes, its dead owner (the old folder form) and both
     assertions; only its barrier moved (`## Deviations` → 5).
7. Docs: `docs/groups.md:97` and `:121-123` (the record, the takeover under a claim, the 60-second wait, `LOCK_TIMEOUT`;
   "ten seconds", the inode-specific claim, "no timeout" and `.lock/owner` are gone), `docs/remote.md:141` (the next
   poll and `disconnect` take over a `poll.lock` whose poller died; a live poll ends `disconnect` in `LOCK_TIMEOUT`
   after 60 s), `docs/commands.md:18` (exit code 3: a lock still held after its 60-second wait, `LOCK_TIMEOUT`).
8. Change 8 (`plan.md` → `## Agents`, the D-031 sentence) is the main session's; `plan.md` is untouched here.

## Proof

From the repository root, on this ticket's working tree. The laptop's first `git` on PATH is 2.56.1 (D-060). Round 1
(the fixes of review round 1) ran every row again except `test/cli/github.test.ts` and `test/s8-groups.test.ts`, whose
rows are from the first run; in round 1 both ran only inside the gate, where every test passed. Round 2 (the fixes of
review round 2) ran again the rows marked "round 2": the lock, Linux adapter and structure files alone, AC-6, AC-7,
the gate, `tsc`, both Biome rows and `check.mjs`; the other rows ran in round 2 only inside the gate, where every test
passed.

| Command | Exit | Result |
|---|---|---|
| `node --test test/lock.test.ts` (AC-1) | 0 | round 2: tests 21, pass 21, fail 0 |
| `node --test test/project/seat.test.ts` (AC-2) | 0 | tests 1, pass 1 (round 1, in one run with the s9, linux, config and structure files: tests 49, pass 49, fail 0) |
| `node --test test/s9-housekeeping.test.ts` (AC-2) | 0 | tests 3, pass 3 (in the run of 49 above) |
| `node --test test/platform/linux.test.ts` (AC-3) | 0 | round 2: tests 9, pass 9, fail 0 |
| `node --test test/cli/ticket.test.ts` (AC-4) | 0 | tests 2, pass 2, fail 0 (round 1, alone) |
| `node --test test/config.test.ts` (AC-4) | 0 | tests 11, pass 11 (in the run of 49 above) |
| `node --test test/cli/github.test.ts` (AC-4) | 1 | first run: tests 9, pass 3, fail 6: every `github poll` test, the five old ones and the new one, fails with "unsafe owner or permissions on /tmp" outside the gate's private `TMPDIR` (R-018 → `outcome.md` → Open points 3; `## Open points` → 1); in the gate all 9 pass |
| `node --test test/s8-groups.test.ts` | 0 | first run: tests 6, pass 6 (the live old-form cabinet lock at `:149-161`, the 12-second launch hold at `:110`) |
| `node --test test/structure.test.ts` (AC-5) | 0 | round 2: tests 25, pass 25, fail 0 |
| `git grep -n -E 'reclaimer\|\.abandoned\.\|\.released\.\|Atomics\.wait\|flag: "wx"' -- src hook seat ':!src/lock.ts'` (AC-6) | 1 | round 2: no line |
| `git grep -n -E '\.lock\b' -- src hook seat ':!src/lock.ts' ':!src/project/leftovers.ts'` (AC-7) | 1 | round 2: no line |
| `git grep -n 'ticket: "R-019"' -- test/structure.test.ts` (AC-8) | 1 | no line |
| `git grep -n -E '/proc/\|"ps"\|/opt/homebrew\|os\.cpus\|cpus\(\)\|meminfo' -- src hook ':!src/platform'` (AC-9) | 1 | no line |
| `git grep -n -E 'ten seconds\|Inode-specific\|with no timeout\|inspect the old poller before clearing it\|\.lock/owner' -- docs/groups.md docs/remote.md` (AC-10) | 1 | no line |
| `git grep -n 'LOCK_TIMEOUT' -- docs/commands.md` (AC-10) | 0 | `docs/commands.md:18` |
| `node adrian-rebuild/tools/gate.mjs` (AC-12) | 0 | round 2: tests 429, pass 429, fail 0, cancelled 0, skipped 0, todo 0; duration_ms 88254.6 |
| `npx tsc --noEmit` (AC-13) | 0 | round 2: no output |
| `npx biome check --error-on-warnings .` (AC-13) | 0 | round 2: Checked 199 files, no fixes (its first round-2 run exited 1 on the format of the new `born` line in `src/lock.ts`, too long for one line; the shorter expectation text fixed it) |
| `node adrian-rebuild/tools/check.mjs` (AC-14) | 0 | round 2: 0 errors (PL summaries: 147 files, with this outcome and `review.md`; ticket folders: 24) |
| `npx biome check --error-on-warnings adrian-rebuild` | 0 | round 2: Checked 32 files, no fixes |

The tool shows no exit code for a command that prints nothing; a `git grep` with no line exits 1.

The gate's 429 tests are R-020's 401 plus the 28 new ones of `## Done` → 6. The `git grep` rows (AC-6 to AC-10) ran
again in round 1 with the same results, and AC-6 and AC-7 in round 2, after the change of the two poll-lock files.

The main session's own runs (`## Agents`, step 4), each after `review-guard.mjs compare --git` exit 0: `node
adrian-rebuild/tools/gate.mjs` → exit 0 with 427/427 (the first implementer), 428/428 (after fix round 1) and
429/429, duration_ms 90691.2 (after fix round 2); `node adrian-rebuild/tools/fails-before.mjs` → exit 0 after each,
with the same eight files. No test failed in any of them, so A-087's test needed no second run.

The temporary checks of the mechanisms (each change undone at once, `git diff` holds none of them):

- AC-15, the interleaving test against a takeover without the re-read under the claim (`if ((await readLock(path))
  !== undefined)` in place of the identity comparison in `takeOver`): `node --test --test-name-pattern="D-029"
  test/lock.test.ts` → exit 1 in 3 of 3 runs, "AssertionError [ERR_ASSERTION]: the other process released its own
  lock", `actual: 1, expected: 0`: the paused call moved the lock the other process held, whose release then found a
  foreign token (`LOCK_LOST`, exit 1). With the re-read: pass.
- The full-record test against a lock created empty and then filled (`atomicWrite(path, "", { exclusive: true })`,
  then `atomicWrite(path, record)`): exit 1, `actual: { created: [ '', 'onto an existing file' ], wrote: [] }` against
  the one record.
- `test/s9-housekeeping.test.ts:135` with a temporary assertion that every child reached the barrier before the gate
  opened (`readdirSync(ready).length === children.length`): pass, so all 48 processes met the dead lock together
  through the new first touch (`fs.promises.open` of the lock); the assertion was removed again.

AC-15 (judgment), in the code: a lock exists only as the link of a complete temp (`createLock`); `takeOver` renames a
lock only inside `lockedAt` of the claim keyed by the dead record, after `readLock` returned that record's identity
again; `ownerGone` never returns true while the pid answers and the system cannot describe the process; the interleaving
test pauses the first call at `found-dead`, lets a child process take the dead lock over and hold it, resumes the first
call, waits for its `busy` step, and fails if its operation ran while the child held the lock or if the child's release
found another lock.

## Fails before

The tests were written first and run before any change of `src/` (the working tree, the plain `node --test`):

- `node --test test/lock.test.ts test/project/seat.test.ts test/platform/linux.test.ts test/config.test.ts`: exit 1;
  tests 14, pass 10, fail 4. `Error [ERR_MODULE_NOT_FOUND]: Cannot find module '…/src/lock.ts'` for the lock and seat
  files; `SyntaxError: The requested module '../../src/platform/linux.ts' does not provide an export named
  'parseBootId'`; the inventory test of `test/config.test.ts` missed `LIMEN_LOCK_WAIT_MS: 'test'`.
- `node --test --test-name-pattern="lock|write" test/structure.test.ts`: exit 1; tests 5, pass 3, fail 2. The write
  scan listed the eleven lock writes of `HEAD` (`src/integrations/github-poller.ts:3`, `:690`;
  `src/job/group-cabinet.ts:4` twice, `:132`, `:138`, `:161`; `src/project/seat.ts:62`, `:97`, `:120`, `:134`); the
  lock-name scan listed `src/commands/github.ts:322: "poll.lock"`, `src/integrations/github-poller.ts:689:
  "poll.lock"`, ``src/job/group-cabinet.ts:112: `${directory}/.lock` `` and ``src/project/seat.ts:55: `${path}.lock` ``.
- `node --test test/cli/ticket.test.ts`: exit 1; the file failed on its import of `src/lock.ts`.
- `node --test --test-name-pattern="A-018" test/cli/github.test.ts`: exit 1; tests 2, fail 2. The disconnect test
  failed for its own reason after 60.5 s: "GitHub binding removed, but a poll is still active or its lock is stale;
  inspect .limen/github/poll.lock before connecting another seat", `actual: 1, expected: 0`. The poll test failed
  before it reached the lock, on "unsafe owner or permissions on /tmp" (`actual: 4`): outside the gate the poller
  refuses its `/tmp` parents (`## Open points` → 1).
- Round 1 (review finding 1), with the new test in `test/lock.test.ts` and before the change of `src/lock.ts`:
  `node --test --test-name-pattern="BAD_DATA" test/lock.test.ts`: exit 1; tests 1, pass 0, fail 1. "AssertionError
  [ERR_ASSERTION]: the operation ran under a lock that took over the damaged record", `actual: [ 'ran' ]`, `expected:
  []`: the record's `bootId` was read as any string, so the lock of the dead owner was taken over and the operation
  ran.
- Round 2 (review finding 1), with the new test in `test/lock.test.ts` and before the change of `src/lock.ts`:
  `node --test --test-name-pattern="BAD_DATA" test/lock.test.ts`: exit 1; tests 2, pass 1, fail 1. "✖ BAD_DATA: a
  lock record whose born has more than 20 digits ends the call with an error that names the lock file and the field",
  "AssertionError [ERR_ASSERTION]: the operation ran under a lock that took over the damaged record", `actual: [ 'ran'
  ]`, `expected: []`: the record's `born` was read as any number of digits, so the lock of the dead owner was taken
  over and the operation ran. The test that passed in that run is round 1's `bootId` test, now on the same helper.

The main session's `node adrian-rebuild/tools/fails-before.mjs` on the ticket's tree → exit 0. Its first line:

```
fails-before: test/cli/github.test.ts, test/cli/ticket.test.ts, test/config.test.ts, test/platform/linux.test.ts, test/s9-housekeeping.test.ts, test/structure.test.ts, test/lock.test.ts, test/project/seat.test.ts fail at HEAD (exit 1)
```

The tail it printed holds the two structure scans at `HEAD`'s copy: the write scan's `actual` (the eleven lock writes
listed above, `src/integrations/github-poller.ts:3` to `src/project/seat.ts:134`) against `expected: []`, and "✖ T-25:
outside src/lock.ts no file of src/, hook/ or seat/ names a lock file, except the leftover of the map jobs" with
`'src/commands/github.ts:322: "poll.lock"'`, `'src/integrations/github-poller.ts:689: "poll.lock"'`,
``'src/job/group-cabinet.ts:112: `${directory}/.lock`'`` and ``'src/project/seat.ts:55: `${path}.lock`'`` against
`expected: []`.

### New and changed tests that pass at `HEAD`, and why

- "the lock-name scan finds a string and template literals ending in .lock, …": the scan's self-test on a fixture
  repository, which reads no file of `src/`.
- "T-25: every primitive of the write exception list keeps a call in its file and function": unchanged; its list lost
  the R-019 entries, and R-032's entry still has its call.
- `test/s9-housekeeping.test.ts` (whole file): the barrier also keeps `HEAD`'s first touches (`existsSync`,
  `mkdirSync`), and A-087's failure was seen once in four gate runs, so at `HEAD` the file passes unless the race hits.
- "an owner whose process the system reports as unavailable is kept" and "… absent … but which still answers signal 0
  is kept" are pure tests of `ownerGone`; at `HEAD` their file fails on its import of `src/lock.ts`.
- The two `github poll` and `github disconnect` tests at `HEAD` under `/tmp`: the poll test fails there on `/tmp`'s
  permissions, not on the lock (`## Open points` → 1); the disconnect test fails on the lock, after 60 s.

## Night defaults

For `ticket.md` → `## Decisions`, each to confirm in the morning (D-054 (2), category A):

1. The API: `withLock(guarded, operation, options)` with `guarded` `{ folder }` or `{ file }`, `lockPath`, and the
   exported pure `ownerGone`. Alternative: one function per lock kind (`folderLock`, `fileLock`). Reason: one call,
   in which the caller names what it guards, and the module alone turns it into a file name.
2. The injection point is the option `pause(step, lock)`, called at `found-dead` (the point of D-029) and also at
   `busy`, before each wait on a live owner. Alternative: only `found-dead`, with tests that release the holder after a
   timer. Reason: a test knows that the paused call has re-read the lock and is waiting, so the interleaving test and
   the "second process stays out" test are deterministic and wait for no time (z. 17, T-31 (4)).
3. `LOCK_TIMEOUT`'s `next` is `""`, and the hint is part of the message, which ends on stderr before the final line.
   Alternative: the hint as `next`, as Change 1 says. Reason: T-37 (D-045, D-046) makes `next` a Limen command with
   concrete values or nothing, never prose; the module does not know the command to repeat (`## Deviations` → 1).
4. A release that finds the lock gone or replaced fails the call with the new code `LOCK_LOST`, class `environment`.
   Alternative: leave the file and succeed. Reason: "a failed release fails the call", and the holder's exclusion was
   broken, which T-01 does not let pass silently.
5. A release that fails after the operation failed is not thrown; the operation's error goes up, as at `HEAD`. One
   `catch {` moved from `src/project/seat.ts` to `src/lock.ts`, so the T-01 ratchet's count is unchanged.
   Alternative: an `AggregateError`. Reason: "an error of the operation passes through unchanged".
6. A start time or a boot id the system does not give is left out of the record, not written as `null`. Alternative:
   `null`. Reason: `src/boundary.ts` has `optional` and no validator for `null`; adding one changes a file outside
   `## Change`.
7. A lock file that is neither a record nor a pid ends the call with `BAD_DATA` (exit 4) naming the file and the field;
   an empty file counts as an owner folder without its owner file (the 5-second rule). Alternative: wait until
   `LOCK_TIMEOUT`. Reason: data from outside becomes a typed value or a typed error (T-27 (2)); an empty file can be
   `HEAD`'s `poll.lock` between its open and its write.
8. "No process answers signal 0" is gone even when `processInfo` says `unavailable`: ESRCH is final, and the ticket's
   "when no process has its pid" holds. Alternative: `unavailable` always kept. Reason: an owner kept for no process
   would block until the bound.
9. The claim of an old form is keyed by the first 32 hex digits of the SHA-256 of what was found (form, device, inode,
   modification time, text); a record's claim by its token. Alternative: a fixed key per path. Reason: a fixed key
   would let a stale claimant wait on a takeover that was already done.
10. The module creates the lock's folder (`mkdir` with `recursive`), as `groupLock` and `withSeatLock` did; so
    `github disconnect` in a project without `.limen/github/` creates it (`limen github connect` sets its modes).
11. The moved lock is named `<lock>.abandoned.<uuid>` and removed at once, the leftover shape of `HEAD`.
12. The body of the poll moved into `pollProject`, so that `project` takes the lock in one call.
13. The test names say "an older Limen" instead of "before R-019", so that each name holds at most one identifier
    (T-29 (2)).
14. Round 1: the UUID shape of a boot id is one constant, `BOOT_ID`, exported by `src/platform/linux.ts`, whose
    `parseBootId` uses it, and re-exported by `src/platform/platform.ts`, from which `src/lock.ts` imports it with
    `platform`; the record's expectation reads "a lower-case UUID". Alternatives: a copy of the pattern in
    `src/lock.ts`; an import of `src/platform/linux.ts` in `src/lock.ts`; a new member of `Platform`. Reason: one
    definition keeps the two readers the same (T-25 (2)), and the lock module still depends only on the adapter's
    interface module. `platform.ts` cannot define the constant itself: `linux.ts` would then import a value from
    `platform.ts`, and a test that loads `linux.ts` first (`test/platform/linux.test.ts`) would run
    `platform = linux` before `linux` exists.
15. Round 2: the bound of `born` is 20 digits, as the constant `BORN` of `src/lock.ts` (`/^\d{1,20}$/`), with the
    expectation "a start time of at most 20 digits". Alternatives: a numeric bound (`born` as a number below 2^64);
    a shared constant with `parseStat` of `src/platform/linux.ts`. Reason: the kernel's start time is a 64-bit count,
    whose largest value has 20 digits, so a record the module wrote always passes; `born` stays a string, as
    `ProcessInfo.born` is, and `parseStat` (`/^\d+$/`) is outside the round's fix: it reads the kernel's own field,
    which cannot be longer.
16. Round 2: the test of the `born` bound uses 21 digits, the first length past the bound, and shares one helper,
    `refusesDamagedRecord(t, field, value)`, with round 1's `bootId` test, whose assertions did not change.
    Alternative: a second copy of the body. Reason: the two tests check one mechanism each on the same assertions, so
    one helper keeps them the same.
17. Round 2: the poll lock's one definition is `withPollLock(root, operation)`, exported by
    `src/integrations/github-poller.ts` and called by its `project` and by `disconnectDoorbell` of
    `src/commands/github.ts`, which no longer imports `src/lock.ts`. Its comment carries the reasons that stood above
    the call in `project` (one poll at a time, disconnect waits, takeover, the 60 s bound, mode 0o660). Alternative: a
    `pollLock(root)` that returns the `Guarded` and the options for each caller to pass to `withLock`. Reason: one call
    fixes the file and the mode together, so neither caller can pass another mode.

## Deviations from the ticket

1. `next` of `LOCK_TIMEOUT` (Change 1): `""`, with the hint in the message (night default 3).
2. The injection point has a second step, `busy` (night default 2).
3. A new code, `LOCK_LOST` (night default 4); `docs/commands.md:20` (exit code 4) names it.
4. `docs/groups.md:83` changed too: it said group spawn and continue "have no timeout"; now they wait up to 60 s.
   Change 7 names `:97` and `:121-123` only.
5. The barrier of `test/s9-housekeeping.test.ts:135` pauses at the first touch of the registry or its lock through
   `existsSync` and `mkdirSync` of `node:fs` (`HEAD`'s first touches) and `open`, `mkdir`, `readFile`, `stat` and
   `link` of `node:fs/promises` (the module's first touch is `open` of the lock), with one shared flag.
6. `test/config.test.ts`: the comment above the inventory names the knob added since R-015.

## Measurement

- M-10 (gate run time): 92.2 s in this ticket's first gate, 88.8 s in round 1's and 88.3 s in round 2's, against
  89.8 s in R-020's last; every lock now costs two `fsync` calls (the temp and the folder) where `HEAD` made a folder,
  and the gate has 28 more tests, among them one of 41 processes (2.8 s alone). The stage close measures it.
- `unmeasured` (no M-NN): the 60-second bound against the real holds on the seat (a launch behind a slow checkout, a
  long prune, a group round), the boot id on the seat, and the poll lock between the poller's account and the agents'
  account (mode 0o660 on the lock and its claim, liveness across users through signal 0's EPERM).

## Open points

1. AC-4's `node --test test/cli/github.test.ts` exits 1 on this laptop outside the gate: every `github poll` test
   (the five old ones too) fails with "unsafe owner or permissions on /tmp", because the poller refuses a state folder
   or module under `/tmp`, which is world-writable; the gate's private `TMPDIR` passes it, and there all 9 pass. So no
   run here shows the new poll test failing at `HEAD` for its own reason: in the code, `HEAD`'s `project` writes
   `poll.lock` with the flag `wx`, so the test's gone-pid file makes it fail with `EEXIST` (exit 1, `UNTYPED`); the
   disconnect test, which meets the same file without the `/tmp` check, failed at `HEAD` for the lock.
2. A zombie owner (exited, not yet reaped by its parent) is `absent` and still answers signal 0, so it keeps its lock
   until `LOCK_TIMEOUT`, as the rule for an owner the system cannot describe says.
3. During a deploy, `HEAD`'s folder locks read a new lock file as a folder without an owner and take it over after
   5 s (`## Risk`).
4. A chain of dead claims grows the claim's name by 42 characters per level; past about five levels it would pass the
   file-name limit (`ENAMETOOLONG`). It needs a taker that dies inside a takeover, again and again.
5. Release reads the token and then removes the file; a lock replaced between the two by something outside the
   module would be removed. Nothing inside the module replaces a live holder's lock.
6. `limen github doctor` does not report an abandoned `poll.lock` (R-057, `## Out of scope`).
