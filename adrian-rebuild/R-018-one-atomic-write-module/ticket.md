<!-- PL: Ticket R-018: jeden moduł zapisu atomowego (src/atomic-write.ts: plik tymczasowy, fsync pliku, rename, fsync
katalogu; także tworzenie „tylko gdy nie istnieje” i atomowa zmiana nazwy). Zastępuje osiem dzisiejszych kopii tej
polityki i około 60 bezpośrednich zapisów do spec/, plików jobów i innego stanu Limena; skan w npm run check
zabrania prymitywów zapisu poza modułem, z jawną listą wyjątków (zamki do R-019, LaunchAgent do R-032).
Stan: gotowy do nocy (ready). -->

# R-018 One atomic-write module

## Problem

A-022 (medium), Decision: "fix — Every write in `spec/` and in job files goes through `atomicWrite` (temporary file,
`fsync`, `rename`, `fsync` of the parent directory). A test scans `src/` and `hook/` and fails on a direct `writeFile`
to those paths outside the helper."

T-25 (1): "Code with a guarantee or a policy (atomic write with `fsync`, lock, …) has exactly one module from its first
use, named after its responsibility; its primitive is banned outside it by a scan in `npm run check` (the pattern of
A-022)." T-25 → Check: "writes and `rename` on `spec/` and job paths only in the atomic-write module (A-022)".

Facts at HEAD (a read-only inventory of 2026-11-20 over `src/`, `hook/`, `bin/`, `seat/`):
- Eight writers copy the temp-and-rename policy, and they differ: `atomicWrite` (`src/job/record.ts:13-26`, `wx`,
  `handle.sync()`, temp removed only when the write or sync fails), `saveJson` (`src/job/group-cabinet.ts:98-102`,
  `flush: true`, no cleanup), `writeAtomic` (`src/picture/picture-build.ts:35-45`, no `fsync`), inline in
  `src/project/seat.ts:26-33`, `src/project/seat-rules.ts:36-46` and three in `src/integrations/github-poller.ts`
  (`:199-204`, `:206-211` with `flush`, the cursors at `:671-673` and `:742-744`). None `fsync`s the parent
  directory; only three `fsync` the file.
- About 60 direct writes have no helper. In `spec/`: `src/project/lanes.ts:92` (`spec/build.md`, truncate and
  write, the scenario of A-022), `:131` (a done ticket's `ticket.md`), `:129` (folder move), `src/commands/ticket.ts:80`,
  `src/commands/init.ts:76` (`copyFile` of the templates). In job folders, among others: `src/commands/group.ts:534-537`
  (`state` written in place), `hook/finish.ts:68` (`result`, which `src/runtime/wrapper.ts:349` writes atomically),
  `src/commands/stop.ts:34`, `src/integrations/herdr.ts:396`, `src/job/task-note.ts:114`, the claim files of
  `src/job/wake-delivery.ts` and `hook/steering.ts`, the staging folder of `src/job/publication.ts:149-156` and
  `src/runtime/recovery.ts:12-19`. Other Limen state: the seat registry, rules, GitHub state, groups, coordinator
  registration, `hook/wake.ts:714`, `hook/group-peer.ts:82`.
- Two readers depend on `atomicWrite`'s temp name: `finalizeJob` (`src/job/record.ts:72-77`, regex
  `/\.(\d+)\.[0-9a-f]+\.tmp$/`, which misses `saveJson`'s UUID temps) and `progressFilename` (`hook/wake.ts:1017-1022`).
- Existing scans to copy: `test/config.test.ts:30-69` (T-03; regexes over the files git knows, `<file>:<line>` in the
  failure, with a fixture self-test at `:71-96`) and `test/structure.test.ts` (ratchets and AST scans).

## Change

1. `src/atomic-write.ts` (new), the only module that writes or renames a file, with async and sync forms where callers
   need them:
   - `atomicWrite(path, data, { mode?, exclusive? })`: a temp file beside the target, named so that one pattern of the
     module covers every temp (`<target>.<pid>.<hex>.tmp`, `<hex>` random, so two writes in one millisecond do not
     collide), opened `wx` with `mode`; write, `fsync`, close; `rename` onto the target (or, with `exclusive`, `link`
     onto it, which fails with `EEXIST` like `wx` does, then remove the temp); `fsync` of the parent directory. On any
     failure the temp is removed and the error is rethrown with its code; the target is untouched.
   - `atomicRename(from, to)`: `rename`, then `fsync` of each parent directory (the claim and publication folders,
     the done-ticket move, the worktree move of `prune`).
   - The temp-name pattern and a function that gives the writer's pid of a temp name, which `finalizeJob` and
     `progressFilename` use instead of their own regexes.
2. Every write and rename in `src/`, `hook/` and `seat/` goes through the module: the eight writers above become calls
   of it (`saveJson` writes through `atomicWrite`; `writeAtomic` of Picture is removed); every overwrite and every `wx`
   create of a `spec/` file, a job file and other Limen state (classes a, b and d of the inventory) calls
   `atomicWrite`, the `wx` ones with `exclusive`; `copyFile` of `init` reads the template and writes it with
   `exclusive`, the transcript copy of `publication.ts` reads and writes it. Appends (`appendFile`, job logs and the
   attempt counter of `wake-delivery.ts:191`) stay appends.
3. A scan in `test/structure.test.ts`: outside `src/atomic-write.ts`, no file of `src/`, `hook/` or `seat/` imports or
   calls `writeFile`, `writeFileSync`, `rename`, `renameSync`, `copyFile`, `copyFileSync`, `link`, `linkSync` or opens a
   file for writing, except the entries of one exception list in the test, each naming its path, the primitives it
   keeps and the ticket that removes it: the lock primitives (`src/job/group-cabinet.ts`, `src/project/seat.ts`,
   `src/integrations/github-poller.ts:695`) until R-019, and the LaunchAgent installer (`src/project/seat.ts:41-57`)
   until R-032. The failure names `<file>:<line>` and the primitive; a fixture self-test shows that it finds a
   violation (the pattern of `test/config.test.ts`).
4. `test/atomic-write.test.ts` (new, T-29): one test per mechanism of the module.

## Out of scope

- Locks and their files (R-019), `record.json` (R-021), the LaunchAgent installer (R-032).
- Appends to logs, `mkdir`, `rm`, `chmod`, `chown`.
- `bin/` (its only write is the test fixture `bin/limen-group-fixture.mjs`) and `test/`.

## Acceptance

- AC-1: `node --test test/atomic-write.test.ts` → exit 0.
- AC-2: `node --test test/structure.test.ts` → exit 0.
- AC-3: `git grep -n -E 'writeAtomic|\.tmp-|randomUUID\(\)\}\.tmp' -- src/picture/picture-build.ts
  src/job/group-cabinet.ts` → exit 1 (Picture's copy is gone, and `saveJson` names no temp of its own; at HEAD the
  command finds four lines).
- AC-4: `node adrian-rebuild/tools/fails-before.mjs` → exit 0; `outcome.md` → `## Fails before` holds its output and
  names each new test that passes at `HEAD` and why.
- AC-5: `node adrian-rebuild/tools/gate.mjs` → exit 0 with `fail 0`.
- AC-6: `npx tsc --noEmit` → exit 0; `npx biome check --error-on-warnings .` → exit 0.
- AC-7: `node adrian-rebuild/tools/check.mjs` → exit 0.
- AC-8 (judgment): every write of the module `fsync`s the file and its parent directory before it returns; a failed
  write leaves no temp file and the target as it was; an `exclusive` write onto an existing file fails with `EEXIST`
  and changes nothing.

## Migration

none: the files, their contents and their names stay; leftover temps of the old names still match the module's
pattern, so `finalizeJob` still sweeps them.

## Risk

- `fsync` of the file and of the directory on every write slows spawn and the gate (the publication of a job writes
  about 15 files); M-10 at the close of stage 2 shows it.
- A hook's sync write blocks Pi's event loop for the length of two `fsync`s; the hooks write small files.
- `link` needs a filesystem with hard links (the seat's and the laptop's do).

## Rollback

`git revert $(git log --format=%H --grep='^R-018:' adrian-rebuild)`; no data migrates.

## Decisions

- 2026-11-20 (main session): the scan covers every write and rename of Limen's own code, not only those whose path the
  code builds under `spec/` or a job folder, because a scan cannot tell paths apart and T-25 (1) bans the primitive
  outside its module; the module sits at `src/atomic-write.ts`, beside `src/boundary.ts` and `src/config.ts`; size L
  (was M: about 60 call sites).
