<!-- PL: Ticket R-020: adapter platformy jako interfejs z jedną implementacją, Linux (src/platform/): tożsamość procesu,
grupy procesów i sygnały, odczyt pamięci i obciążenia; przenosi tam odczyty /proc i wywołania ps rozsiane po
src/runtime i src/job, usuwa pozostałość macOS w ścieżkach gita. Deklaruje wymagania systemowe (Node, git z funkcją
`worktree list --porcelain -z`, tar, ps, Pi, most, Herdr), które `limen init` sprawdza i odmawia kodem 4 z nazwą
brakującego narzędzia. Test plant bierze gita uruchamiającego (D-060). Stan: zamknięty (done) w dzień 20.11. -->

# R-020 A Linux platform adapter and declared system requirements

## Problem

A-083, Decision: "fix — A platform adapter as an interface (process identity, containment, scheduler install, memory
reading, notifications) with one implementation, Linux. macOS branches (`proc-pidinfo.rb`, `memory_pressure`,
`osascript`, LaunchAgent) and `darwin` in `package.json` are cut. Future macOS support = a new implementation of the
interface with its own tests." R-008 cut the macOS branches; the LaunchAgent installer goes with R-032 (D-023).

T-12 (2): "System requirements (Node ≥ 24, git ≥ 2.36, tar, ps and any others found) are declared in the platform
adapter (A-083), checked at `limen init` and at coordinator start (a refusal with exit code 4 that names the missing
tool), and installed in pinned versions by the seat script (S)." T-12 → Check: "a test that `init` refuses when a tool
is missing or too old." T-32 (3): "The system requirements (T-12) declare the supported versions of Pi and the bridge;
the root-owned coordinator start script and spawn refuse any other version with exit code 4" (the refusal is R-049's).
`plan.md` → `## System requirements` lists what R-020 declares; the `## Tickets` note on R-020: "git is declared by the
feature Limen needs (`git worktree list --porcelain -z`), not by a version number, so the gate's shim (D-001) satisfies
it on the laptop's git 2.34."

Facts at HEAD (a read-only inventory of 2026-11-20 over `src/`, `hook/`, `bin/`, `seat/`):
- No code checks `process.platform`. The operating-system reads are scattered: `/proc/<pid>/stat` in `processInfo`
  (`src/runtime/contain.ts:181-210`), `ps -Ao pid=,pgid=,ppid=,stat=` in `processTable` (`:211-223`), `ps -Ao
  pid=,ppid=,time=,stat=` in `src/runtime/stalled-tool.ts:29-55`, `ps -o comm= -p <ppid>` in
  `src/job/publication.ts:49-56`, `/proc/meminfo` and `os.cpus()` in `src/runtime/start-queue.ts:90-120`; the liveness
  and process-group signals of `src/runtime/contain.ts:21-44`, with a copy of the liveness check in
  `src/project/seat.ts:116-124`.
- Containment is POSIX process groups (`detached` spawns, signals to `-pid`); no systemd scope exists yet (R-026).
  Scheduler install: only the LaunchAgent leftover (`src/project/seat.ts:41-57`, R-032). Notifications: all through
  Herdr (`src/integrations/herdr.ts:95-106`), an integration and no operating-system service.
- `src/project/git.ts:352` falls back to `/opt/homebrew/bin/git`, a macOS leftover.
- The only requirement check is Node in `bin/limen:3-9` (exit 4, `NODE_VERSION`). A missing git throws a plain
  `Error("git is not on PATH")` (`src/project/git.ts:345-361`), which exits 1; `pi` on `PATH` is checked by
  `preflightEngine` (`src/runtime/engine.ts:73-83`, plain `Error`, exit 1). `limen init` (`src/commands/init.ts:13-93`)
  checks no tool. Nothing checks `tar` (used by `land`, `src/commands/land.ts:321`) or `ps`.
- No command or script of this repository starts a coordinator; the start script is R-050 (`src/config.ts:181`).

## Change

1. `src/platform/platform.ts` (new): the interface `Platform` with the operating-system primitives Limen uses today:
   process identity (a process's state, parent, group and start ticks; the process table), liveness and signals of a
   process and a process group, and the memory and CPU readings of the start gate; `platform`, the one implementation
   in use. No member without a Linux implementation: the scheduler install arrives with R-032, and notifications stay
   Herdr's.
2. `src/platform/linux.ts` (new): the Linux implementation, holding the code moved from `contain.ts`, `stalled-tool.ts`,
   `publication.ts`, `start-queue.ts` and `seat.ts:116-124`; the policies built on it (the escaped-descendant walk,
   birth checks, the stall rule, the start gate's thresholds) stay where they are and call `platform`.
3. Declared requirements in the adapter, each with its probe: Node ≥ 24 (the same number as `bin/limen`, which keeps
   its early check; a test asserts that both agree); git with the feature `git worktree list --porcelain -z`; `tar`;
   `ps`; `pi` on `PATH` with the declared version 1.5.1 and the bridge 5.0.3 as data (enforced by R-049); Herdr 0.9.3
   as data, its presence checked only inside a Herdr pane (`HERDR_ENV`), where Limen uses it. A function runs the
   probes and throws a `LimenError` of class `environment` (exit 4) that names the missing tool or the failed feature.
4. `limen init` and `limen workspace init` run that check first. The central `git()` of `src/project/git.ts` throws
   the same typed error when git cannot start, and its `/opt/homebrew/bin/git` fallback is cut.
5. A scan in `test/structure.test.ts`: `/proc/` paths, a spawn of `ps` and `os.cpus` appear in `src/` and `hook/` only
   under `src/platform/`.
6. Tests (T-29): `test/platform/linux.test.ts` (new; the parsers on fixture text: a `stat` line whose command holds
   spaces and parentheses, `ps` output, `meminfo`), and in `test/cli/init.test.ts` one test per refusal (a `PATH`
   without `tar`; a git without `-z`; no `pi`) and one that all present tools pass.

## Out of scope

- Refusing another version of Pi, the bridge or Claude Code (R-049); the systemd scope (R-026) and the scheduler
  install (R-032); the seat script that installs the tools (S, stage 5).
- `seat/` (Linux-only seat tooling) and `bin/limen`'s own Node check.

## Acceptance

- AC-1: `node --test test/platform/linux.test.ts` → exit 0.
- AC-2: `node --test test/cli/init.test.ts` → exit 0.
- AC-3: `node --test test/structure.test.ts` → exit 0.
- AC-4: `git grep -n -E '/proc/|"ps"|/opt/homebrew|os\.cpus|cpus\(\)|meminfo' -- src hook ':!src/platform'` → exit 1
  (at HEAD it finds nine lines in `publication.ts`, `git.ts`, `contain.ts`, `stalled-tool.ts` and `start-queue.ts`).
- AC-5: `node adrian-rebuild/tools/fails-before.mjs` → exit 0; `outcome.md` → `## Fails before` holds its output and
  names each new test that passes at `HEAD` and why.
- AC-6: `node adrian-rebuild/tools/gate.mjs` → exit 0 with `fail 0`.
- AC-7: `npx tsc --noEmit` → exit 0; `npx biome check --error-on-warnings .` → exit 0.
- AC-8: `node adrian-rebuild/tools/check.mjs` → exit 0.
- AC-9 (judgment): the interface holds only operating-system primitives, no policy; Linux is its one implementation;
  every declared tool has a probe whose failure names it, with exit code 4.

## Migration

none: no on-disk format, command or file name changes; `limen init` refuses only where a required tool is missing.

## Risk

- `limen init` on a machine whose git lacks `-z` now refuses (the laptop's git 2.34 outside the gate's shim); the
  target is the seat, whose git has it (the gate's runs keep the shim, D-001).
- A probe that starts a program costs `init` a few tens of milliseconds.

## Rollback

`git revert $(git log --format=%H --grep='^R-020:' adrian-rebuild)`.

## Decisions

- 2026-11-20 (main session): the interface has no members for the scheduler install and notifications until a
  ticket implements them (R-032; Herdr is an integration), so it carries no unimplemented methods; the check at
  coordinator start belongs to R-050's start script, since no start path exists before it, and calls the same
  function (`plan.md` → `## Tickets` → notes, R-050, written by the main session); Herdr's presence is checked only
  inside a Herdr pane, where Limen uses it.
- 2026-11-20 D-060 (Adrian, "A", with the session doing it): the laptop's git is now 2.56.1 from Linuxbrew, the first
  `git` on PATH, while `/usr/bin/git` stays 2.34.1. A test plant's PATH is fixed (`<bin>:<the node's folder>:/usr/bin:
  /bin:/usr/sbin:/sbin`, `test/plant.ts`), so outside the gate every plant still meets 2.34.1 and `limen init`
  refuses with `MISSING_FEATURE` (`node --test test/cli/init.test.ts` → 8 of 8 fail), and in the gate the shim no
  longer appears, because `gate-env.mjs` probes the PATH's git, which has `-z`. Addition to `## Change` (Change 7, by
  the main session as a technical default, D-060 (1)): `test/plant.ts` links the runner's `git` (the first `git` on
  the test process's PATH) into a plant-private folder placed right after the node's folder, unless that git already
  sits in the node's folder (the gate's shim, which then comes first, so the shim never meets a link to itself); every
  other tool keeps the fixed PATH. A test shows that a plant runs the runner's git: with a PATH whose first `git` is a
  fixture script, the plant's `git --version` prints the fixture's line. AC-2 then holds as written outside the gate.
- 2026-11-20 (main session, review round 1, `review.md`): findings to fix:
  - (1) The git probe runs `git --git-dir=<bare repository> worktree list --porcelain -z`, not `-C`, so
    `safe.bareRepository=explicit` cannot refuse it; a test with that setting in the probe's environment.
  - (2) A test of the `ps` probe's refusal (`MISSING_TOOL` naming `ps`).
  - (3) `NODE_VERSION`: one message and one `next` in `bin/limen` and `nodeFailure` (the declared number from one
    place, which the agreement test already compares).
  - (5) `docs/setup.md` lists the declared requirements: Node ≥ 24, git with `git worktree list --porcelain -z`
    (2.36 or newer), `tar`, `ps`, Pi 1.5.1 with the bridge 5.0.3, Herdr 0.9.3, and says that `limen init` refuses
    with exit code 4 when one is missing.
  - (7) The central `git()` maps to `MISSING_TOOL` only the errors of starting git (`ENOENT`, `EACCES`); any other
    spawn error goes up as before; a test of a non-start error.
  - (8) T-29 (3): split the `ps` parser test so each test fails for one reason (columns; CPU-time forms; the
    scanner row; header and empty lines).
  Rejected with reasons in `review.md`: (4) and (6).
