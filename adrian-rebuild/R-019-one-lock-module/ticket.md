<!-- PL: Ticket R-019: jeden moduł blokad (src/lock.ts) dla każdej blokady Limena: worktree, kolejka startów, grupa
(kabina i start), poll.lock GitHuba, rejestr projektów seata i numery ticketów. Plik blokady od chwili powstania
zawiera tożsamość właściciela (pid, czas startu procesu, boot id z adaptera platformy), a każda niezgodność oznacza
porzuconą blokadę, którą przejmuje dokładnie jeden proces: pod roszczeniem na rekord martwego właściciela zmienia jej
nazwę na unikalną, potem tworzy nową z `wx` (A-087, D-029). Czekanie trwa najwyżej 60 s i kończy się typowanym błędem
z kodem 3, który nazywa plik blokady, właściciela i wskazówkę, a stary plik właściciela z samym pid jest porzucony
tylko, gdy tego pid już nie ma (D-056); commit usuwa wyjątki blokad ze skanu zapisu R-018 i wyjątek D-031 z
`## Agents`. Stan: zamknięty nocą 20/21.11 (done); domyślne decyzje nocy i poprawki z recenzji są w `## Decisions`,
a trzy uwagi rundy 3 idą do ticketu poprawek R-093 (D-062, odpowiedź na pytanie nocne Q-9). -->

# R-019 One lock module with process identity and a bounded wait

## Problem

A-017 (medium), Decision: "fix — The lock owner file holds `{pid, start time, boot_id}`; any mismatch = takeover of an
abandoned lock; waiting is bounded to 60 s, then an error naming the lock file, the owner and a hint; oneshot units get
`TimeoutStartSec`."

A-018 (medium), Decision: "fix — One shared lock module (A-017) for every lock in Limen (worktree, start queue, group,
`poll.lock`, ticket numbers, the rest); `limen github doctor` reports an abandoned lock."

A-055 (low), Decision: "fix — Ticket number allocation (also outside a series) runs under the shared lock module
(A-018); the collision check at land and `limen ticket renumber` stay as a safety net."

A-058 (low), Decision: "rejected (compliant) — Recovery claims and wake receipts resist PID reuse; the identity model
carries over to every lock (A-017, A-018)."

A-087 (high), Decision: "fix — High: a silent loss of a seat registry entry (the project drops out of `seat sweep` and
the alerts), z. 1, z. 14, related to A-017 and A-018. The takeover of a dead lock renames it to a unique name (exactly
one process wins), then the new lock is created with `wx`; the registry is written as read, change and write under the
lock through `atomicWrite` (A-022). The fix belongs to the ticket of the shared lock module (A-018), R-019. A
deterministic test: an injection point in the lock module between "found dead" and "taken over"; the test forces the
interleaving of two processes and fails before the fix every time; the current test stays. Check: the interleaving test
(fails before, passes after); a registry test with 41 concurrent registrations and a dead lock owner → 41 entries;
`check.mjs`: A-087 has every field and a ticket (Adrian, 2026-11-18)."

`plan.md` → D-029 (2026-11-18, Adrian, after R-001's gate runs; adds A-087 and changes `## Agents`):
- "A-087 (`audit.md`): seat registrations vanish when processes take over an abandoned registry lock together; high,
  decision fix. The fix belongs to the ticket of the shared lock module (A-018), R-019, which is still open: the
  takeover renames the dead lock to a unique name (exactly one process wins), then creates the new lock with `wx`; the
  registry is a read, change and write under the lock through `atomicWrite` (A-022). A deterministic test uses an
  injection point in the lock module between "found dead" and "taken over", forces the interleaving of two processes
  and fails before the fix every time; `test/s9-housekeeping.test.ts:135` stays."
- "A test that failed even once without a change of the code it runs is a finding; nobody runs it again to get a green
  gate (z. 17). By day the main session asks Adrian; at night it writes a question in `.night/questions.md` and the
  ticket waits (`## Agents`, protocol step 4)."
- "Check: the interleaving test (fails before, passes after); a registry test with 41 concurrent registrations and a
  dead lock owner → 41 entries; `check.mjs`: A-087 has every field and a ticket."

`plan.md` → D-031 (2026-11-18, Adrian; an exception to D-029 until R-019): "when the gate fails only on the
lock-contention test of A-087 (`test/s9-housekeeping.test.ts:135`), the main session records the failure in the
ticket's `outcome.md` as an occurrence of A-087 (the gate's output line and the count it reports) and runs the gate once
more; any other failure, or a second failure of that test in the same ticket, follows D-029. The failure already has a
finding, a decision and a ticket, so the run hides nothing, and the records give R-019 the rate. R-019's commit removes
the exception from `## Agents`. Check: none (the outcome records each occurrence)."

`plan.md` → D-056 (2026-11-20, Adrian, R-019's question 3, answered "as recommended" with consent to the technical
defaults): "(1) R-019 depends on R-020 as well as R-018: the lock's owner identity (pid, process start time, boot id)
comes from the platform adapter `src/platform/`, because R-020's AC-4 bans `/proc/` paths outside it; R-019 adds the
boot-id reading to the adapter. (2) A lock is waited for at most 60 s; then a typed error names the lock file, its
owner and a hint. (3) An old owner file that holds only a pid is abandoned only when that pid is gone. (4) The
`TimeoutStartSec` of the systemd units goes to R-032. Check: R-019's criteria; R-020's AC-4 at R-019's HEAD."

`plan.md` → `## Tickets` → notes: "R-019: it also fixes A-087 (D-029): the takeover of a dead lock renames it to a
unique name, then creates the new lock with `wx`, and the seat registry is written under the lock through
`atomicWrite`; an injection point between "found dead" and "taken over" lets a test force the interleaving of two
processes, which fails before the fix every time; `test/s9-housekeeping.test.ts:135` stays, and a registry test asserts
41 entries after 41 concurrent registrations with a dead lock owner." And: "R-032 (D-056 (4)): the systemd units it
writes set `TimeoutStartSec`, so that a unit that waits on a lock (R-019's 60 s bound) is not stopped first."

T-25 (1): "Code with a guarantee or a policy (atomic write with `fsync`, lock, error handling, …) has exactly one module
from its first use, named after its responsibility; its primitive is banned outside it by a scan in `npm run check`
(the pattern of A-022)." T-25 → Check: "the lock-file primitive only in the lock module (A-018)". T-02: "3 transient
failure: a lock after its wait limit, the network, a rate limit; safe to retry". T-01: "Limen has one error type:
class, code, message, next command." T-27 (2): data from outside becomes a typed value only in `src/boundary.ts`.

Facts at HEAD (the tree after R-020's commit, read on 2026-11-20 over `src/`, `hook/`, `seat/`):
- The group lock `groupLock` (`src/job/group-cabinet.ts:102-166`) is a folder `<folder>/.lock` (`:112`) made by
  `mkdir` (`:116`); its `owner` file, a bare pid, is written after the loop, so the lock exists for a moment without an
  owner (`:161`). It is taken over only when the folder is more than 5 s old and the pid is not alive (`:127-128`), so a
  reused pid holds it for ever ("a live owner (including PID reuse) is never evicted", `:102`). The takeover is a claim
  file keyed by the folder's device and inode (`:129-132`), a second check (`:136`) and a rename to
  `.abandoned.<uuid>` (`:137-139`). There are three waits: `skip` (none), the default (10 s, then a plain
  `Error("group lock busy or uncertain …")`, `:155`) and `wait` (no limit, `:113`).
- Users of `groupLock`:
  - With `wait` (no limit): the launch lock (`src/commands/spawn.ts:152`, `src/commands/continue.ts:183`,
    `src/commands/group.ts:507`, `:563`, `src/commands/group-rounds.ts:61`, `src/job/group-cabinet.ts:262`); the
    worktree lock `worktreeLock` (`src/job/publication.ts:15-17`, `.limen/prune/.lock`, taken by publish at `:152` and by
    prune at `src/commands/prune.ts:174`, `:290`); the seat start-queue lock (`src/runtime/start-queue.ts:259-275`,
    `<seat>/.limen/start-queue/.lock`); and `src/job/group-events.ts:102`, `:296`.
  - With the 10 s default: `src/commands/group.ts:206`, `:502`, `src/commands/group-rounds.ts:119`, `:197`,
    `src/job/group-events.ts:42`, `:78`, `:309`, `:329`.
  - With `skip`: `src/job/group-events.ts:100`, `:295`.
  - The hooks reach the cabinet through `src/job/group-events.ts` (`hook/group-peer.ts:6`).
- The seat registry lock `withSeatLock` (`src/project/seat.ts:53-147`) is a folder `<file>.lock` whose `owner`, a bare
  pid, is written after the `mkdirSync` (`:61-62`). It waits 10 s with `Atomics.wait` (`:57`, `:74`), then throws a plain
  `Error("timed out locking …")` (`:72`). The takeover (`removeAbandonedLock`, `:105-147`) reads `stat` and the owner
  (`:108-110`). An owner without a pid counts as abandoned once the folder's `mtime` (from that first `stat`) is 5 s old
  (`:115`). The claim is keyed by device and inode (`:118-120`) and removed in `finally` (`:143-145`). The re-check
  compares device, inode and owner text (`:128-132`), then the lock is renamed and removed (`:133-135`). The release
  renames (`:94-104`).
- The registry update (`updateRegisteredProjects`, `src/project/seat.ts:19-31`) already reads, changes and writes
  `.limen/projects` under that lock through `atomicWriteSync`. Its callers are `registerProject` (`:32-35`, async in
  name, sync in body) from `src/commands/init.ts:90` and from `hook/wake.ts:817` (`void registerProject(root).catch(() =>
  {})`, so it blocks Pi's event loop for up to 10 s), and `src/commands/sweep.ts:40`.
- The likely interleaving of A-087 (guessed; the failure was seen once, the interleaving never). The winner of a
  takeover removes the dead folder (`:135`) and its claim. Its next `mkdirSync` can get the same inode number back, and
  for a moment that new lock has no `owner` file. A process that read the dead lock's `stat` before the takeover, and
  its owner text after the winner's `mkdirSync`, sees an empty owner with an old `mtime`. It gets the claim (its name is
  free again), sees the same device, inode and empty owner, and renames the live lock away. Two processes then hold the
  lock, and one registration is lost. `groupLock` has the same window (`:116`, `:129-136`, `:161`).
- The poll lock (`src/integrations/github-poller.ts:689-690`) is `writeFile(…, { flag: "wx", mode: 0o660 })` with the
  bare pid, no stale check, and removal only in `finally` (`:745`). `github disconnect` (`src/commands/github.ts:318-330`)
  polls `existsSync` of `poll.lock` for up to 60 s and then throws a plain `Error`, even when the lock's owner is long
  dead.
- Ticket numbers (`withNextTicketCode`, `src/project/series.ts:28-31`) are allocated with no lock; its one caller is
  `limen ticket new` (`src/commands/ticket.ts:76-83`). `git grep -n renumber -- src` finds nothing:
  `limen ticket renumber` has no code at HEAD.
- Process identity in the adapter: `ProcessInfo.born` is the start time in clock ticks since boot
  (`src/platform/platform.ts:9-16`), `processInfo` is async (`:39`) and `processAlive` checks with signal 0 (`:49`,
  `src/platform/linux.ts:194`). There is no boot id.
- The write scan of R-018 keeps five entries "until R-019" (`test/structure.test.ts:352-386`: `groupLock`, the poller's
  `project`, `withSeatLock`, `releaseSeatLock`, `removeAbandonedLock`) and one until R-032 (`:387-393`). A staleness
  test (`:576`) fails when a listed call disappears without its entry.
- A-087's test (`test/s9-housekeeping.test.ts:135-189`) runs 40 `workspace init` and 8 `sweep` processes against a
  registry lock folder whose `owner` is `999999999` with an `mtime` of 0 (`:146-149`). A barrier patches `existsSync`
  and `mkdirSync` at each process's first touch of the registry path (`:151-170`). The test expects no failure (`:187`)
  and 41 entries (`:188`).
- `test/s8-groups.test.ts:149-161` holds a cabinet lock in the old form: a folder with the test's own live pid.
- The old lock forms appear in the docs at `docs/groups.md:97`, `:121-123` and `docs/remote.md:141`.

## Change

1. `src/lock.ts` (new) is the one lock module (T-25 (1)). It is async; the names of its API are the implementer's.
   - A lock is one file whose content is its owner's record: the pid, the start time (`ProcessInfo.born`), the boot id,
     a random token and the time the lock was taken. It is created with `wx` semantics through
     `atomicWrite(…, { exclusive: true })` (R-018: a full temp linked onto the path, `EEXIST` when one exists), so no
     process ever sees a lock without its owner. The record is read through `src/boundary.ts` (T-27 (2)).
   - Only the module names a lock file. The paths stay those of HEAD: `<folder>/.lock` for the cabinet, launch, prune
     and start-queue locks, and `<file>.lock` for the seat registry and `poll.lock`. The new ticket-number lock is
     `<plant>/.limen/ticket-number.lock`. Callers name what they guard.
   - The owner is gone when its boot id differs from the current one, when a process with its pid runs with another
     start time, or when no process has its pid (`platform.processAlive` is false). An owner the system cannot describe
     is not gone: `processInfo` says `unavailable`, or it says `absent` while the pid still answers signal 0 (another
     user's process under `hidepid`). When the current boot id cannot be read, the pid and start time decide.
   - Takeover (A-087, D-029). After the module has found the lock dead (the injection point, an option of the module
     that only tests pass; no environment variable, T-03), it takes a claim on the record it found dead:
     `<lock>.takeover.<token>`, itself a lock of this module, so a claim whose taker died is taken over the same way.
     It reads the lock again, and only when the lock still holds that record does it rename the lock to a unique name
     (exactly one process wins, through `atomicRename`) and remove it. Then it creates the new lock with `wx`, like any
     process that asks for the lock.
   - Waiting has two modes. `wait` is bounded at 60 s (D-056 (2)) and checks every 25 ms. `skip` makes one attempt,
     which still takes over an abandoned lock. At the bound the module throws a `LimenError` of class `transient` (exit
     3, T-02) with the code `LOCK_TIMEOUT`. Its message names the lock file and its owner (pid, start time, boot id,
     since when); its `next` is a hint: run the command again once that process has ended, and see the process with
     `ps -p <pid> -o pid,lstart,args`.
   - Release removes the lock only while it still holds this holder's token. An error of the operation passes through
     unchanged. A failed release fails the call (as `src/project/seat.ts:90` does today).
   - The old owner files are read as `## Migration` says.
2. `src/platform/platform.ts` and `src/platform/linux.ts` get a `bootId()` member that reads
   `/proc/sys/kernel/random/boot_id` and returns `undefined` when the system does not give it, with an exported parser
   for fixtures (D-056 (1)).
3. Every lock goes through the module:
   - `groupLock` (`src/job/group-cabinet.ts:102-166`) becomes a call of the module. Its modes are `skip` and `wait`;
     the 10-second default and the unbounded `wait` both become the bounded wait. Its callers keep their calls, and
     `worktreeLock` (`src/job/publication.ts:15-17`) and the start-queue lock (`src/runtime/start-queue.ts:259`) follow.
   - The seat registry: `withSeatLock`, `releaseSeatLock` and `removeAbandonedLock` (`src/project/seat.ts:53-147`) go.
     `updateRegisteredProjects` reads, changes and writes `.limen/projects` under the module's lock through the
     atomic-write module (A-022, D-029), and it and `registerProject` become async. `src/commands/sweep.ts:40` awaits it.
   - The poll lock: `project` (`src/integrations/github-poller.ts:676-746`) takes `poll.lock` through the module (mode
     0o660) and waits like any caller. `github disconnect` (`src/commands/github.ts:318-330`) takes and releases
     `poll.lock` through the module instead of polling for the file, so an abandoned lock no longer fails it and a live
     one ends in `LOCK_TIMEOUT`.
   - Ticket numbers: `withNextTicketCode` (`src/project/series.ts:28-31`) allocates under the ticket-number lock (A-055),
     and becomes async. `src/commands/ticket.ts:76-83` awaits it.
4. `src/config.ts` gets a test knob `LIMEN_LOCK_WAIT_MS` ("the lock's wait bound, in place of 60 s", D-052's kind
   `test`), which only `src/lock.ts` reads.
5. `test/structure.test.ts`:
   - The five R-019 entries of `WRITE_EXCEPTIONS` (`:352-386`) go; R-032's entry stays, and the comment at `:350` names
     only that entry.
   - A new T-25 scan: outside `src/lock.ts`, no file of `src/`, `hook/` or `seat/` names a lock file (a string or
     template literal ending in `.lock`), except the leftover entry at `src/project/leftovers.ts:41`. A failure names
     `<file>:<line>`, and a fixture self-test shows that the scan finds a violation (the pattern of
     `test/config.test.ts`).
6. Tests (T-29: one mechanism per test):
   - `test/lock.test.ts` (new), one test for each of these mechanisms:
     - a held lock keeps a second process out until its release;
     - the lock file holds the full record from the moment it exists;
     - a lock is taken over when its pid is gone, when the pid runs with another start time (A-017), and when the boot
       id differs;
     - an owner the system cannot describe is kept;
     - the bounded wait ends in `LOCK_TIMEOUT` with its class, the lock file and the owner;
     - `skip` returns without running the operation while a live owner holds the lock;
     - release removes only the holder's own lock;
     - a dead taker's claim does not block a takeover for ever;
     - the old forms of `## Migration`;
     - the interleaving test of D-029: process A pauses at the injection point after it found the lock dead, process
       B takes the lock over and holds it, then A goes on. The test asserts that the two operations never overlap and
       that both run once.
   - `test/project/seat.test.ts` (new): 41 processes call `registerProject` at once against a registry lock whose owner
     is dead. The registry then holds all 41 entries (D-029's check).
   - `test/platform/linux.test.ts`: the boot-id parser on fixture text.
   - `test/cli/ticket.test.ts`: while the test process holds the ticket-number lock, `limen ticket new` with
     `LIMEN_LOCK_WAIT_MS` exits 3 with `LOCK_TIMEOUT` naming the lock and creates no ticket; once the lock is released it
     takes the next number.
   - `test/cli/github.test.ts`: a `poll.lock` whose owner is gone does not stop `github poll` (A-018), and
     `github disconnect` exits 0 past such a lock.
   - `test/config.test.ts`: the knob list gains `LIMEN_LOCK_WAIT_MS`.
   - `test/s9-housekeeping.test.ts:135` stays (D-029): its name, its 48 processes, its dead owner and both assertions.
     Its barrier may move to the new code's first touch of the registry or its lock, so that every process still meets
     the dead lock together.
7. Docs:
   - `docs/groups.md:97` and `:121-123`: the lock's record, the takeover, the 60-second wait and `LOCK_TIMEOUT`. "Ten
     seconds", the inode-specific claim, "no timeout" and `.lock/owner` go.
   - `docs/remote.md:141`: the next poll takes over a `poll.lock` whose poller died.
   - `docs/commands.md:18` (exit code 3): a lock still held after its 60-second wait (`LOCK_TIMEOUT`).
8. `adrian-rebuild/plan.md` → `## Agents` → protocol step 4: the sentence of D-031 ("Until R-019, a gate that fails only
   on A-087's test … (D-031).") goes in R-019's commit. The main session removes it, not the implementer: `plan.md` is a
   reserved path (D-015).

No path is deleted or moved, and no file of `adrian-rebuild/tools/` changes.

## Out of scope

- `TimeoutStartSec` of the systemd units (R-032, D-056 (4)).
- The per-job lock of the record's transition function (R-021, D-057 (7.3)); a sync form of the module, which R-021
  adds if a hook needs one; the process identity of jobs (`born`, `group-owner.json`, the reaper; A-056, R-021).
- `limen github doctor` reporting an abandoned `poll.lock`, and the poller's private state (R-057, `## Deployment`
  5.17).
- The delivery claims and receipts of `notify/`, `steer/` and `recovery/` and the wake receipts (A-058 compliant,
  D-057 (7.2)); the start queue's entries.
- The usage lock of the status line (`docs/seat/statusline.ts:28-150`, R-059); the LaunchAgent exception (R-032);
  `.night/lock` of `adrian-rebuild/tools/night.mjs`; git's own locks.
- The `.catch(() => {})` around the hook's registration (`hook/wake.ts:817`; T-01's ratchet, R-082); the collision
  check at land, which stays (A-055).

## Acceptance

- AC-1: `node --test test/lock.test.ts` → exit 0.
- AC-2: `node --test test/project/seat.test.ts` → exit 0; `node --test test/s9-housekeeping.test.ts` → exit 0.
- AC-3: `node --test test/platform/linux.test.ts` → exit 0.
- AC-4: `node --test test/cli/ticket.test.ts` → exit 0; `node --test test/cli/github.test.ts` → exit 0;
  `node --test test/config.test.ts` → exit 0.
- AC-5: `node --test test/structure.test.ts` → exit 0.
- AC-6: `git grep -n -E 'reclaimer|\.abandoned\.|\.released\.|Atomics\.wait|flag: "wx"' -- src hook seat ':!src/lock.ts'`
  → exit 1 (at HEAD it finds 16 lines in `src/job/group-cabinet.ts`, `src/project/seat.ts` and
  `src/integrations/github-poller.ts`).
- AC-7: `git grep -n -E '\.lock\b' -- src hook seat ':!src/lock.ts' ':!src/project/leftovers.ts'` → exit 1 (at HEAD it
  finds 6 lines: `src/commands/github.ts:322`, `:325`, `src/integrations/github-poller.ts:689`,
  `src/job/group-cabinet.ts:112`, `src/project/seat.ts:53`, `:55`).
- AC-8: `git grep -n 'ticket: "R-019"' -- test/structure.test.ts` → exit 1 (at HEAD it finds 5 lines).
- AC-9: `git grep -n -E '/proc/|"ps"|/opt/homebrew|os\.cpus|cpus\(\)|meminfo' -- src hook ':!src/platform'` → exit 1
  (R-020's AC-4 at R-019's HEAD, D-056; at HEAD it finds no line).
- AC-10: `git grep -n -E 'ten seconds|Inode-specific|with no timeout|inspect the old poller before clearing it|\.lock/owner' -- docs/groups.md docs/remote.md`
  → exit 1 (at HEAD it finds 5 lines: `docs/groups.md:97`, `:121`, `:122`, `:123`, `docs/remote.md:141`);
  `git grep -n 'LOCK_TIMEOUT' -- docs/commands.md` → exit 0 (at HEAD it finds no line).
- AC-11: `node adrian-rebuild/tools/fails-before.mjs` → exit 0; `outcome.md` → `## Fails before` holds its output and
  names each new or changed test that passes at `HEAD` and why.
- AC-12: `node adrian-rebuild/tools/gate.mjs` → exit 0 with `fail 0`.
- AC-13: `npx tsc --noEmit` → exit 0; `npx biome check --error-on-warnings .` → exit 0.
- AC-14: `node adrian-rebuild/tools/check.mjs` → exit 0.
- AC-15 (judgment): no lock exists without its owner record. A process renames a lock only while it holds the claim on
  the record it found dead and has read that record again under the claim, so a lock created after "found dead" is
  never moved. An owner the system cannot describe is never taken over. The interleaving test pauses one process at the
  injection point, lets the other take over and hold the lock, and would fail if both held it at once.

## Migration

No script. The module reads the owner files HEAD writes, at the same paths (D-056 (3)):
- A folder with an `owner` file holding a pid (the cabinet, launch, prune, start-queue and seat locks), and a file
  holding a pid (`poll.lock`), are abandoned only when that pid is gone (`platform.processAlive` is false). A reused pid
  keeps such a lock until the bounded wait ends in `LOCK_TIMEOUT`, whose hint names the file to remove by hand.
- A folder with no `owner` file (a crash between HEAD's `mkdir` and its owner write) is abandoned once its `mtime` is
  more than 5 s old, as at HEAD.
- The takeover of an old lock renames it like a new one and removes it recursively. The next holder writes the new
  form.
- The leftovers of HEAD's takeovers after a crash (`*.reclaimer.*` files, `*.abandoned.*` and `*.released.*` folders)
  are not read and stay.

Tests on fixtures in `test/lock.test.ts`: each old form with the test's own live pid is kept; with a gone pid it is taken
over; a folder without an owner is kept when fresh and taken over when older than 5 s.
`test/s9-housekeeping.test.ts:135` (a dead pid-only owner) and `test/s8-groups.test.ts:149-161` (a live pid-only owner)
also cover the read path.

## Risk

- The 60 s bound turns a long hold into exit 3 where HEAD waited for ever. Examples: a launch queued behind a slow
  sibling's checkout (`test/s8-groups.test.ts:110` holds 12 s), a spawn behind a long prune, a group round. Timers retry
  exit 3 (T-02). A hook that waits on the cabinet now waits up to 60 s instead of 10 s.
- A pid-only lock taken before the deploy whose pid is now reused still blocks until the bound (D-056 (3)).
- During a deploy, HEAD's code reads a new lock file as a folder without an owner and takes it over after 5 s. The
  deploy runs with no job running (`seat/deploy.ts`), and old CLI processes end within seconds.
- The barrier of A-087's test depends on which functions the code calls first; it has to follow the new first touch.
- `fails-before.mjs` copies HEAD under `/tmp`, where the `github poll` tests of `test/cli/github.test.ts` fail at `HEAD`
  for an unrelated reason (R-018 → `outcome.md` → Open points 3). `## Fails before` names it.
- The 41-process test and the lock tests lengthen the gate (M-10 at the close of stage 2). `link` needs hard links
  (R-018's Risk).

## Rollback

`git revert $(git log --format=%H --grep='^R-019:' adrian-rebuild)`. HEAD's folder locks take over a new-form lock file
left behind after 5 s. A leftover `poll.lock` makes every poll fail with `EEXIST`, as before (A-018), until it is
removed by hand once its poller is gone.

## Decisions

- 2026-11-18 D-029 (Adrian): binds the takeover (rename to a unique name, exactly one winner, then `wx`), the registry's
  read, change and write under the lock through `atomicWrite`, the injection-point test, the 41-registration test and
  `test/s9-housekeeping.test.ts:135` staying. A test that failed once is a finding and is not run again.
- 2026-11-18 D-031 (Adrian): R-019's commit removes the exception from `## Agents` (Change 8, the main session). A
  failure of A-087's test in R-019's own gate runs tests this ticket's fix, so the main session handles it under D-029
  (a finding, no second run).
- 2026-11-20 D-056 (Adrian): the owner identity, including the new boot id, comes from `src/platform/`; the wait is at
  most 60 s, then a typed error naming the lock file, its owner and a hint; a pid-only owner is abandoned only when the
  pid is gone; `TimeoutStartSec` goes to R-032.
- 2026-11-20 (main session, technical default): the lock is a file holding its owner's record (pid, `born`, boot id,
  token, time), created through `atomicWrite` with `exclusive`, so no lock exists without its owner. The takeover runs
  under a claim on the dead record's token, the claim is itself a lock, and the lock is re-read under the claim. The
  paths stay those of HEAD; the ticket-number lock is `<plant>/.limen/ticket-number.lock`.
- 2026-11-20 (main session, technical default): "gone" means another boot id, another start time, or no process
  answering signal 0. `unavailable`, and `absent` while signal 0 still answers, mean unknown, never gone. Without a
  readable boot id, the pid and start time decide.
- 2026-11-20 (main session, technical default): one bound, 60 s, for every waiting caller; `skip` stays, the 10-second
  default goes, and the wait checks every 25 ms. The error is class `transient`, code `LOCK_TIMEOUT`. The test knob
  `LIMEN_LOCK_WAIT_MS` shortens the bound in tests, and the injection point is an option of the module, not a setting.
- 2026-11-20 (main session, technical default): the module is async only. The seat registry, `registerProject` and
  the ticket allocation become async, so the wake hook no longer blocks Pi's event loop.
- 2026-11-20 (main session, technical default): the poll waits like any caller, and `github disconnect` takes and
  releases `poll.lock`. The doctor's report of an abandoned lock is R-057's (`## Deployment` 5.17).
- 2026-11-20 (main session, technical default): D-029's registry test is the new `test/project/seat.test.ts` (41
  `registerProject` processes), next to the unchanged A-087 test.
- 2026-11-20 (main session, technical default): the interleaving test fails at `HEAD` because `src/lock.ts` does not
  exist there, which `fails-before.mjs` shows. That it checks the mechanism is AC-15's judgment.
- 2026-11-20 (main session, technical default): the T-25 scan bans a `.lock` file name outside `src/lock.ts`, because
  `exclusive` writes are also used for receipts and cannot be told apart from locks by the primitive.
- 2026-11-21 (night run, the implementer's choices inside `## Change`; night defaults, for Adrian to confirm in the
  morning, D-054 (2)): the thirteen choices of `outcome.md` → `## Night defaults`, among them: (1) the API
  `withLock({ folder } | { file }, operation, options)`, `lockPath` and a pure `ownerGone`; (2) the injection point is
  the test-only option `pause(step, lock)` at `found-dead` and also at `busy`, before each wait on a live owner, so the
  multi-process tests wait on no timer; (3) `LOCK_TIMEOUT`'s `next` is empty and the hint ends the message, because
  T-37 (D-045, D-046) makes `next` a command or nothing, never prose, and the module does not know the command to
  repeat (this replaces Change 1's "its `next` is a hint"); (4) a release that finds its lock gone or replaced fails the
  call with the new code `LOCK_LOST`, class `environment` (Change 1's "a failed release fails the call"); (7) a lock
  file that is neither a record nor a pid is `BAD_DATA`; (8) a pid that answers no signal 0 is gone even when
  `processInfo` says `unavailable`. `docs/groups.md:83` ("no timeout") changed with Change 7.
- 2026-11-21 (main session, review round 1, `review.md`): fix findings 1 and 6. (1) The lock record's `bootId` is
  read with the same UUID shape `parseBootId` accepts (a record with another `bootId` is `BAD_DATA`), so a lock file
  cannot put text of any length into the `LOCK_TIMEOUT` and `LOCK_LOST` messages; a test in `test/lock.test.ts` shows
  the refusal. (6) `test/cli/ticket.test.ts` opens with one header comment line (T-29 (5)).
- 2026-11-21 (main session, review round 2, `review.md`): fix findings 1–4. (1) The record's `born` is read as at
  most 20 digits (a longer one is `BAD_DATA`), so with `bootId` no field of a lock file puts text of any length into
  the `LOCK_TIMEOUT` and `LOCK_LOST` messages; a test shows the refusal. (2) The comments at `test/cli/github.test.ts:49`
  and `test/lock.test.ts:343` say "an older Limen" instead of "HEAD" (T-30). (3) `test/platform/linux.test.ts` opens
  with one header comment line (T-29 (5)). (4) The poll lock has one definition, a function of the GitHub poller module
  that `github disconnect` calls (T-25).
- 2026-11-21 (main session, review round 3 PASS, `review.md`): the two rounds of fixes are used; notes 1–3 (`hasCode`
  copies the adapter's `isCode`, the `LOCK_LOST` test does not assert the class, a comment names "the ticket's
  Migration" without R-019) are not fixed here and wait for Adrian's answer to `.night/questions.md` → Q-9, with no
  ticket blocked; note 4 (Change 8's sentence) was fixed by the main session.
- 2026-11-21 D-062 (Adrian, Q-9, "Zgoda na rekomendację"): notes 1–3 of round 3 go to the fix ticket R-093 (stage 2,
  S, `delegated`, `night`, before the tag `a0.2.0`), together with the four round-3 notes of R-021 (Q-10).
