<!-- PL: Ticket R-008 etapu 1 przebudowy: wycięcie gałęzi macOS, które na Linuksie są martwym kodem (pomocnik Ruby
proc_pidinfo, memory_pressure, powiadomienie osascript, opóźnione ponowne sprawdzenie startu procesu, darwin
w package.json i w CI) oraz ich opisów w dokumentacji (decyzja A-083). Instalator LaunchAgent zostaje dla R-032,
bo jego wycięcie zmienia CLI. Stan: zamknięty w nocy 17.11 (recenzja PASS, review.md, outcome.md). -->

# R-008 Cut the macOS branches

## Problem

Limen runs only on the Linux seat, but its code keeps macOS branches that never run there:
`src/runtime/contain.ts:216-224` reads process identity through a Ruby helper (`src/runtime/proc-pidinfo.rb`),
`src/runtime/start-queue.ts:120-131` reads free memory through `/usr/bin/memory_pressure`,
`src/integrations/herdr.ts:570-589` falls back to an `osascript` notification, `src/runtime/reap.ts:47-49` delays a
birth recheck for the Ruby helper, `package.json:33` declares `darwin`, and `.github/workflows/check.yml:13` runs CI on
`macos-latest`. The docs promise macOS support (`README.md:22`, `docs/setup.md:9`).

Relied on:
- A-083, Decision: "fix — A platform adapter as an interface (process identity, containment, scheduler install,
  memory reading, notifications) with one implementation, Linux. macOS branches (`proc-pidinfo.rb`,
  `memory_pressure`, `osascript`, LaunchAgent) and `darwin` in `package.json` are cut. Future macOS support = a new
  implementation of the interface with its own tests." The adapter itself is R-020 (stage 2, sources A-083, T-12);
  R-008 is the cut.
- `plan.md` → `## Tickets`, R-008: `Mig.` is `—`; `## Stages` → "What changes in daily work", stage 1, lists the cut
  commands that refuse, and `sweep` is not among them. Cutting the LaunchAgent installer would change the CLI
  (`limen sweep --install` and `--uninstall`, `src/commands/sweep.ts:27-32`, `src/project/seat.ts:40-56`); R-032 replaces
  that installer with `limen seat sweep --install` on a systemd timer (`## Deployment` 3.1, Mig. `yes`). So R-008
  leaves the installer to R-032 (the main session's reading of the plan; recorded in `## Decisions`).
- Stage-1 conventions: a cut that changes no behaviour on Linux needs no new test; "tests removed together with a cut
  feature are named in the outcome"; the gate condition is "no new failure".
- `test/structure.test.ts:48-57` caps `test/` at 3,500 lines and `test/` has 3,499 (R-010 removes the cap): this
  ticket adds no test lines.

## Change

1. `src/runtime/contain.ts`: `processInfo` reads `/proc/<pid>/stat` unconditionally; the non-Linux branch, the
   `PIDINFO_HELPER` constant and whatever becomes unused with them (for example `isProcessInfo`, `runBounded` if no
   other caller remains) go. Delete `src/runtime/proc-pidinfo.rb` with `git rm`.
2. `src/runtime/start-queue.ts`: `memoryFree` reads `/proc/meminfo` only; the `memory_pressure` branch and its comment
   go (and `execFile` if it becomes unused).
3. `src/integrations/herdr.ts`: `showSeatNotification` returns the result of the Herdr notification; the `osascript`
   fallback goes, and its comment says only what remains.
4. `src/runtime/reap.ts`: `BIRTH_RECHECK_MS` and the recheck it guards go if the constant is 0 on Linux (it is:
   `process.platform === "linux" ? 0 : 30_000`), with the macOS comment above it; behaviour on Linux unchanged.
5. `package.json`: `os` lists only `linux`. `.github/workflows/check.yml`: the matrix runs only `ubuntu-latest`.
6. Docs that describe the cut branches, so that they describe Linux only: `README.md:22`, `docs/setup.md:9`,
   `CONTRIBUTING.md:11`, `SECURITY.md:9`, `docs/jobs.md:159`, `docs/remote.md:77`, `docs/seat/README.md:78`.

## Out of scope

- The LaunchAgent installer (`limen sweep --install`, `--uninstall`, `installSeatSweep`, `uninstallSeatSweep`): R-032.
- The platform adapter interface and the declared system requirements: R-020.
- Devin's `--provider macos|linux` (`src/runtime/devin.ts`, `src/main.ts:118`, docs): R-003 cuts Devin.
- The hosted-binding platform check (`src/runtime/hosted-binding.ts:26`, `docs/jobs.md:194`): R-005 cuts hosted jobs.
- `bin/tony-finish-ping.sh` and `docs/finish-webhooks.md`: R-002 cuts them.
- Comments in `test/` and `src/project/git.ts:332` that mention macOS as one example of a symlinked temp path: the
  code they explain stays; R-084 handles comments.
- `docs/vps.md` (the seat's own setup notes) and `docs/reviews/`.

## Acceptance

- AC-1: `git grep -n -i -E 'darwin|osascript|memory_pressure|pidinfo|/usr/bin/ruby' -- src hook bin package.json .github`
  → no output (exit 1).
- AC-2: `git grep -n 'process.platform' -- src hook bin` → only lines of `src/runtime/hosted-binding.ts`.
- AC-3: `git ls-files src/runtime/proc-pidinfo.rb` → no output.
- AC-4: `node adrian-rebuild/tools/gate.mjs` → exit 0 with `fail 0`; no test file is removed and no test is added.
- AC-5: `node adrian-rebuild/tools/check.mjs` → exit 0; `npx biome check --error-on-warnings adrian-rebuild` → exit 0.
- AC-6 (judgment): on Linux every changed function behaves as before (the same reads, the same results, the same
  timing), and nothing that the Linux path still uses is removed.
- AC-7 (judgment): the docs of item 6 no longer promise or describe macOS, and say nothing the code does not do.

## Migration

none: no on-disk format, file name, command or flag changes.

## Risk

- Removing a helper that the Linux path still uses would break process identity or the start queue; the gate's
  spawn, stop, reap and queue scenarios (`test/s1-spawn.test.ts`, `test/s2-hosted.test.ts`,
  `test/s3-finish-wake.test.ts`, `test/s9-housekeeping.test.ts`, `test/u9-process-identity.test.ts`) cover them.
- A checkout started on macOS now fails on `/proc` reads instead of using the helper; Limen is declared Linux-only
  (`package.json` `os`), and R-020 adds the explicit refusal with the requirement.

## Rollback

`git revert $(git log --format=%H --grep='^R-008:' adrian-rebuild --)`; no reverse migration.

## Decisions

- 2026-11-17 (main session, night run): the LaunchAgent installer stays for R-032, which replaces it with the systemd
  installer of `limen seat sweep --install`; reason: R-008 has `Mig. —` and the stage-1 list of refusing commands has
  no `sweep`, while cutting the installer here would need a refusal and its test (a CLI change) that the 3,500-line
  cap of `test/` does not allow before R-010. To confirm or change by Adrian in the morning (it is listed in `## State`).
