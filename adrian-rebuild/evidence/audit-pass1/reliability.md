<!-- PL: Plik zawiera kandydackie ustalenia audytu niezawodności Limena (przebieg 1, bez historii) dla tagu rebuild-base: integralność stanu na dysku, współbieżność i blokady, awarie w trakcie zadania, worktree i gałęzie, sprzątanie i timery. Powstał na potrzeby przebudowy w gałęzi adrian-rebuild; każde ustalenie ma lokalizację plik:linia sprawdzoną na tagu, a najważniejsze potwierdzono eksperymentami na repozytoriach jednorazowych w scratchpadzie (skrypty exp1–exp6). Stan: kompletny dla obszaru niezawodności; pytania bez dowodu są w sekcji „To verify”. -->

# Reliability audit, pass 1 (rebuild-base)

Scope: job record and seat state, locks, crash and restart, worktrees and branches, prune/retire, seat units. Experiments ran against throwaway repos under the session scratchpad, `audit-reliability/` (scripts `exp1-prune-dirty.sh`, `exp2-race.sh`, `exp3-stale-lock.sh`, `exp4-land-close.sh`, `exp5-wrapper-term.sh`, `exp6-reaper-orphan.sh`). They used Node 26 and the git shim from `node_modules/.rebuild-gate`, with HOME and LIMEN_HOME pointing at throwaway directories and `LIMEN_HERDR=0`.

### R-01 Prune deletes the uncommitted work of every finished job, automatically
- Area: reliability
- Severity: critical
- Location: `src/commands/prune.ts:153`, `src/commands/prune.ts:295`, `src/commands/prune.ts:358`, `src/runtime/job-setup.ts:29`, `docs/seat/limen-prune.timer:5`, `docs/jobs.md:44`, `docs/jobs.md:107`
- Evidence: `jobKeeps` keeps only `return !isTerminal(state) || retainedGroupJob(jobDir);`. No `worktreeState`/`dirtyPaths` check runs before `detach` renames the worktree to `.pruned-<uuid>` and `emptyTrash` runs `rm -r`. Every spawn runs this in `setUpJob` (`await pruneForJob(jobDir, root, [worktree, keep])`), and the seat timer runs it daily. Experiment `exp1-prune-dirty.sh`: a `failed` job (`stop-reason` "timeout after 5400000ms") whose worktree shows `?? feature.ts`, then `limen prune`: `pruned …/2026-11-16-timeout-job-deadbeef (job …): job failed` / `pruned 1 finished worktree` / `exit=0`. Afterwards `ls` of the worktree says `No such file or directory`. The docs contradict each other: `jobs.md:44` says "A failed job keeps its worktree and transcript", `jobs.md:107` says "A resume uses the same branch and worktree, with the uncommitted files", and `jobs.md:148` says "Uncommitted files that prune removed are lost". The repo's own review proposed the missing guard: `docs/reviews/omp-3day-review-2026-10-18.html:130` "3 live jobs lost their worktree mid-run … skip dirty or young worktrees".
- Rule: z. 29, z. 14
- Verdict: non-compliant
- Direction: Never delete a worktree whose `git status --porcelain` is non-empty or whose state is not terminal-and-acknowledged. Archive the dirty tree first (e.g. a `limen/rescue/<id>` commit or a tarball in the job record) and log the archive path, as z. 29 requires.
- Scenario: A detached job hits the 90 min timeout, a Claude Max quota error (`failed`), or a seat reboot (reaper → `failed`) with edits not yet committed. The coordinator follows the one-job-per-project rule and spawns the next job, or the daily `limen-prune.timer` fires. `setUpJob` prunes the failed job's worktree. `limen continue <id>` then prints "restored … only committed branch contents were recovered", and the uncommitted work is gone for good.

### R-02 `prune --retire` treats a zero-commit branch as landed and deletes the job's record, transcript, branch and worktree
- Area: reliability
- Severity: critical
- Location: `src/project/git.ts:100-101`, `src/commands/prune.ts:99-100`, `src/commands/prune.ts:108-110`, `src/commands/prune.ts:204-213`, `templates/agents.md:114`
- Evidence: `unlandedBranches` returns an empty set when `git log <tip> ^HEAD` lists nothing (`if (!graph.size) { return new Set(); }`), so a branch still at its base counts as landed. `retireFinishedJobs` then runs `deleteLandedBranches` (which also detaches the worktree that holds the branch) and `rm(`${jobsRoot}/${id}`, { recursive: true, force: true })`. Experiment `exp1-prune-dirty.sh`, same failed job, never merged: `limen prune --retire --dry-run` → `would retire 2026-11-16-timeout-job-deadbeef`; `limen prune --retire` → `retired 1 job` / `deleted 1 landed branch`. After that, `.limen/jobs` is empty and `git branch --list 'limen/*'` is empty, so `session/*.jsonl`, `log`, `result` and `stop-reason` are gone. The coordinator prompt lists the command as routine housekeeping (`agents.md:114`).
- Rule: z. 29
- Verdict: non-compliant
- Direction: Retire only jobs that `limen land` (or `ticket done`) marked as landed in the record. Never retire a job whose branch has zero commits. Archive rather than delete the record (or at least its `session/`).
- Scenario: A failed job times out after 85 min of research with no commit. Its transcript is the only result and the input `limen continue` needs. The coordinator runs `limen prune --retire` as cleanup. The record and transcript are deleted and the output reports a "landed branch" that never landed, so nobody notices.

### R-03 Reaper marks a job "process group gone" while its engine group still runs, then prune removes the live engine's worktree
- Area: reliability
- Severity: high
- Location: `src/runtime/reap.ts:42`, `src/runtime/reap.ts:147`, `src/job/record.ts:71-72`, `src/runtime/reap.ts:17`, `test/s9-housekeeping.test.ts:103-107`
- Evidence: `ownerAlive` checks only the wrapper pid (`if (!Number.isSafeInteger(pid) || pid <= 0 || !processAlive(pid)) {`), while `liveJob` checks `processGroupAlive(recorded)`. The reaper sends no signal, and `finalizeJob` deletes `pid`/`born`, so no later check can find the group. Experiment `exp6-reaper-orphan.sh` (fake engine that stays silent for 40 s, wrapper killed alone): `after limen jobs: state=failed engine_alive=yes pid_file=removed`, log `failed: process group gone`. Then `limen prune` → `pruned …/2026-11-16-probe-b9473974 (job …): job failed` and `after prune: worktree=gone engine_alive=yes`. The s9 test kills the wrapper, asserts `failed` and then `release`s the still-blocked engine, so the test bakes this behaviour in.
- Rule: z. 1
- Verdict: non-compliant
- Direction: Before it finalizes, the reaper should check the recorded process group (`processGroupAlive`) and terminate it (TERM, then KILL, with the birth check `contain.ts` already has). The log line should state what was checked. Keep `pid` until the group is confirmed gone.
- Scenario: The OOM killer, a crash or an operator `kill -9` ends only the node wrapper. The coordinator's wake hook reaper writes `failed: process group gone`. The engine keeps running with no timeout or tool cap and keeps editing the worktree. The coordinator then spawns a repair or any other job, the automatic prune moves the worktree out from under the live engine, and the engine's later edits and commits fail or are lost.

### R-04 The worktree lock and the seat start-queue lock wait forever when the owner pid is reused; no message, no timeout
- Area: reliability
- Severity: medium
- Location: `src/job/group-cabinet.ts:117`, `src/job/group-cabinet.ts:132`, `src/job/publication.ts:14`, `src/runtime/start-queue.ts:272-286`, `docs/seat/limen-prune.service:6`
- Evidence: `const deadline = mode === "wait" ? Infinity : …`. A stale lock is reclaimed only if `age > 5_000 && (!pid || !processAlive(pid))`. The owner file stores a bare pid with no birth time or boot id, unlike the reaper and `claimRecovery`. `worktreeLock` (publish, prune, land) and the start-queue decision both use `"wait"`. Experiment `exp3-stale-lock.sh`: `.limen/prune/.lock/owner` holds the pid of an unrelated live `sleep` and the lock is 1 h old. `timeout 30 limen prune` → `limen prune exit=124 after 30s (124 = killed by timeout)`, with no output. The prune unit is `Type=oneshot` with no `TimeoutStartSec`, so a hung run also blocks every later timer activation.
- Rule: z. 12
- Verdict: non-compliant
- Direction: Record `{pid, born, boot_id}` in the owner file and reclaim on any mismatch. Give `"wait"` a bounded deadline that ends in an actionable error naming the lock path and owner. Add `TimeoutStartSec=` to the oneshot units.
- Scenario: The seat reboots while `limen spawn` is inside `publishJob`'s rename, or a human presses Ctrl-Z on `limen prune`. After the reboot an unrelated process gets the recorded pid. Every `limen spawn`, `land` and `prune` for that project hangs silently. With the seat queue lock, every detached start on the seat stays `queued`.

### R-05 A stale GitHub `poll.lock` disables the doorbell for that project permanently
- Area: reliability
- Severity: medium
- Location: `src/integrations/github-poller.ts:668`, `src/integrations/github-poller.ts:725`, `src/integrations/github-poller.ts:764`, `docs/remote.md:142`
- Evidence: `await writeFile(lock, `${process.pid}\n`, { flag: "wx", mode: 0o660 });` has no stale check. Removal is in `finally` only, which SIGKILL, a reboot or `systemctl stop` (Node's default SIGTERM exit) skip. Every later poll fails with EEXIST, caught as `console.error(`${root}: …`)`. The docs only say "If `.limen/github/poll.lock` persists after a crash, inspect the old poller before clearing it", and `github doctor` has no check for it (`git grep poll.lock` hits only `github.ts:294-297`, `github-poller.ts:667` and `remote.md:142`).
- Rule: z. 12
- Verdict: non-compliant
- Direction: Use the pid+birth lock pattern (or `flock`) with dead-owner reclaim, and have `github doctor` report a stale lock.
- Scenario: The seat reboots during a one-minute poll. From then on, `@limen` mentions in that repository are never claimed. The only trace is a failed oneshot unit in the journal.

### R-06 `finalizeJob` is check-then-write with no lock; concurrent finalizers both commit and the final state is a coin toss
- Area: reliability
- Severity: medium
- Location: `src/job/record.ts:42`, `src/job/record.ts:58`, `src/commands/stop.ts:59-70`, `src/runtime/wrapper.ts:374`
- Evidence: `if (isTerminal(await textFile(`${jobDir}/state`))) { return; }`, then `atomicWrite(`${jobDir}/state`, …)` after several awaits. `limen stop` gives the wrapper only `25` ms before finalizing itself. Experiment `exp2-race.sh` ran two processes calling `finalizeJob` on one running job (`done "done: accepted by coordinator"` vs `stopped "process group interrupted"`), 20 runs: `runs=20 two_terminal_log_lines=13 final_done=8 final_stopped=12`. Sample log: `stopped: process group interrupted` then `done: done: accepted by coordinator`, `state=done`. The Herdr wake is claimed once (`coordinator-wake.ts:54`), so its text can name the losing state.
- Rule: none
- Verdict: n/a
- Direction: Make the terminal transition an exclusive claim, e.g. `writeFile(`${jobDir}/terminal`, …, {flag:"wx"})` or a link() claim taken before any side effect. The loser should return without writing.
- Scenario: The coordinator runs `limen stop <id> "done: accepted"` on a job whose engine exits quickly on TERM. The wrapper's `stopped` can win, so `limen land` refuses ("land requires a done job"), and the wake already said `done`, or the other way round.

### R-07 SIGTERM to the wrapper alone disarms the timeout, tool cap and stall watch without stopping the engine
- Area: reliability
- Severity: medium
- Location: `src/runtime/wrapper.ts:88-94`, `src/runtime/wrapper.ts:148`, `src/runtime/wrapper.ts:332`, `src/runtime/wrapper.ts:351`
- Evidence: The handler only sets flags (`stopRequested = true; stop.abort();`) and signals nothing. `exhaust` then returns early (`if (exhausted || stopRequested) { return; }`), as do the stall check and the deadline steer. Experiment `exp5-wrapper-term.sh` used `--timeout 8s` and a fake engine that is silent for 40 s. Control run: `t=16s state=failed engine_alive=no`, `failed: timeout after 8000ms`. With `kill -TERM <wrapper pid>` at 2 s: `t=16s state=running engine_alive=yes`, with no further limen log line.
- Rule: z. 1
- Verdict: non-compliant
- Direction: On SIGTERM, forward TERM to the engine group and keep the timeout armed (or arm a short KILL grace), so a stop request can never lengthen a job.
- Scenario: Following the Recovery table ("Check the recorded PID", `jobs.md:234`), an operator or a script runs `kill <pid>` from `limen jobs`. The engine runs without any bound until it exits by itself, burning the Max window, and the job stays `running`.

### R-08 Land's ticket close is not transactional; a failed commit leaves staged moves, prints a false "tickets stay active" and exits 0
- Area: reliability
- Severity: medium
- Location: `src/project/lanes.ts:130`, `src/project/lanes.ts:132`, `src/project/lanes.ts:139-140`, `src/commands/land.ts:58`, `src/commands/land.ts:64`, `src/commands/land.ts:77`, `src/commands/land.ts:129-131`
- Evidence: Folders are renamed and rewritten before `commitPaths` (`git add -A` then `git commit`). Any error is only printed. Experiment `exp4-land-close.sh` with a failing pre-commit hook: `landed … onto main` / `deleted branch limen/…` / `land: tickets stay active: pre-commit: lint failed` / `exit=0`. `git status` afterwards: `M  spec/build.md`, `R  spec/features/active/F001-auth/ticket.md -> spec/features/done/2026-11/F001-auth/ticket.md`. A second `limen land` of the same job fails with `target main has staged changes …`. A crash between merge and close cannot be resumed either: the branch is already deleted, so a re-run fails at `if (!commits)` ("has no commits to land"), and the job record has no "landed" marker.
- Rule: z. 12
- Verdict: non-compliant
- Direction: Do the close as one recorded step: write a `landing` marker in the job record, commit the ticket move in a temporary index or worktree, roll back the renames on failure, and exit non-zero with the exact recovery command (`limen ticket done FNNN`).
- Scenario: The human says "land". The project's pre-commit hook (lint, format) rejects the close commit. The coordinator reads exit 0. The ticket is half-moved and staged in the main checkout. The human's next commit on `main` sweeps it in, or the next land is refused.

### R-09 The board, tickets and some job files are rewritten in place (truncate, then write)
- Area: reliability
- Severity: medium
- Location: `src/project/lanes.ts:93`, `src/project/lanes.ts:132`, `src/commands/group.ts:558`, `hook/finish.ts:72`
- Evidence: `await writeFile(path, next);` for `spec/build.md`, `await writeFile(file, withLanded(…))` for `ticket.md`, `await writeFile(`${dir}/state`, "stopped\n");` for a group slot, and `writeFileSync(join(jobDir, "result"), …)` for the finish handoff. The same codebase uses `atomicWrite` (`record.ts:14-27`) for every other `state` write.
- Rule: none
- Verdict: n/a
- Direction: Route every spec/ and job-record write through `atomicWrite` (tmp + fsync + rename) and fsync the parent directory after rename.
- Scenario: The disk fills (Maven `target/` across worktrees) during `limen land`. `spec/build.md` is left truncated. In private planning mode (`planning.ts:5`) spec/ has no Git copy, so the board's coordinator-written TRACK/NEXT prose is lost.

### R-10 Hosted jobs have no wall-clock or tool-call bound
- Area: reliability
- Severity: medium
- Location: `src/runtime/supervisor.ts:128`, `src/job/publication.ts:60`, `docs/jobs.md:170-171`
- Evidence: `"hosted supervisor started (no outer timeout or tool-call cap; quiet-tool observation never signals processes)"`. Limits table: Time `None`, Tool-start events `None` for hosted jobs. Hosted stalls only produce advisories (`supervisor.ts:465-468`).
- Rule: z. 1
- Verdict: non-compliant
- Direction: Give hosted jobs the same time and tool-start bound as detached jobs. On expiry, stop the agent through Herdr and finalize `failed` with escalation to the coordinator.
- Scenario: A hosted job (the GitHub doorbell's `github work` uses `--tab`, `github.ts:404-424`) loops on a failing build overnight. Nothing ends it, and the Max weekly limit is spent before the human wakes.

### R-11 No seat-level reaper on Linux: a dead job stays `running` unless a coordinator session or a human runs a command
- Area: reliability
- Severity: medium
- Location: `src/project/seat.ts:41`, `docs/seat/README.md:7`, `docs/seat/bell.sh:19-21`
- Evidence: `limen sweep --install` writes only `join(home(), "Library", "LaunchAgents", "limen-sweep.plist")`. `docs/seat/` ships prune, bell and github units but no sweep unit. The reaper runs only from `jobs`, `status`, `sweep` and the Pi wake hook (`hook/wake.ts:814`). The bell reacts only to `done | failed | stopped`.
- Rule: z. 1
- Verdict: partial
- Direction: Ship a systemd sweep timer (per project, or seat-wide over `~/.limen/projects`) so dead owners are reaped and rung within minutes whether or not a coordinator session is alive.
- Scenario: The coordinator's Pi session has stopped on quota, and the wrapper dies (OOM). The job stays `running` with a dead pid for as long as the session is down. The bell never rings, and the human assumes work is progressing.

### R-12 "One job at a time per project" exists only as an operator rule; spawn starts another
- Area: reliability
- Severity: medium
- Location: `src/commands/spawn.ts:385-386`
- Evidence: `if (running > 0) { console.log(`note: ${running} job${…} already running; starting another`); }`. There is no refusal, and no per-project concurrency setting.
- Rule: z. 14
- Verdict: non-compliant
- Direction: Add a per-project `maxRunning` (plant limits file) that spawn and continue enforce under the worktree lock, with an explicit override flag.
- Scenario: After a wake, the coordinator (model) spawns a repair while the reviewer still runs, or spawns twice after a lost wake. Two engines share the Max window and the plant, and the second spawn's automatic prune runs while the first job's state changes (R-01).

### R-13 An engine killed by a signal is recorded as a requested stop
- Area: reliability
- Severity: low
- Location: `src/runtime/wrapper.ts:373-374`
- Evidence: `} else if (stopRequested || result.signal === "SIGTERM" || result.signal === "SIGKILL") { await finalizeJob(jobDir, "stopped", "process group interrupted", …)`.
- Rule: none
- Verdict: n/a
- Direction: Use `stopped` only when `stopRequested` (or `stop-requested`) is set. An unrequested signal should be `failed: engine killed by <signal>`.
- Scenario: The OOM killer SIGKILLs the engine. The coordinator sees `stopped` (as if someone asked) rather than a failure to investigate.

### R-14 The wrapper writes `state=running` unconditionally after starting the engine
- Area: reliability
- Severity: low
- Location: `src/runtime/wrapper.ts:116`, `src/runtime/wrapper.ts:258`
- Evidence: After the stop check at `:116` the wrapper spawns the engine and runs `await atomicWrite(`${jobDir}/state`, "running\n");` with no re-check. A `limen stop` that finalizes in that window has its terminal state overwritten, while `pid`/`born` stay deleted.
- Rule: none
- Verdict: n/a
- Direction: Write `running` with a compare step (refuse if terminal), or drop the second write, since spawn already wrote it (`spawn.ts:445`).
- Scenario: A stop lands just after setup. The record says `running` with no pid, and the reaper ends it 10 min later as `failed: process group gone`.

### R-15 Seat units cover one project each; the bell floods on first run
- Area: reliability
- Severity: low
- Location: `docs/seat/limen-prune.service:8`, `docs/seat/agent-setup.md:185`, `docs/seat/agent-setup.md:200`, `docs/seat/bell.sh:16-29`
- Evidence: A single `WorkingDirectory=$PROJECT_DIR` / `LIMEN_ROOT=$PROJECT_DIR` drop-in, with no template unit (`limen-prune@.service`). The bell pings every terminal job that has no `notify/bell`, including all past ones.
- Rule: none
- Verdict: n/a
- Direction: Provide templated units per project (or iterate `~/.limen/projects`) and mark existing terminal jobs when the bell is first installed.
- Scenario: The second production project (Java/Maven) never gets bell notifications unless the operator copies the units by hand.

### R-16 Ticket numbers outside a series are allocated without a lock
- Area: reliability
- Severity: low
- Location: `src/project/series.ts:53`, `src/commands/ticket.ts:104`
- Evidence: `return create(ticketCode(highestTaken([root, plant]) + 1));`. The `wx` write is per folder (`FNNN-slug`), so two slugs can take the same number. The duplicate is caught only at land (`land.ts:317-342`).
- Rule: none
- Verdict: n/a
- Direction: Take the seat lock (or a project lock) around allocation in the no-series path as well.
- Scenario: Two `limen ticket new` runs at once produce two F042 tickets. The second land is refused and needs a keeper.

### R-17 A missing `born` file counts as "same process" in the reaper
- Area: reliability
- Severity: low
- Location: `src/runtime/reap.ts:60-62`, `src/job/record.ts:118`
- Evidence: `if (!born) { return true; }`. `born` is written fire-and-forget (`void recordBorn(jobDir);`).
- Rule: none
- Verdict: n/a
- Direction: Treat an absent `born` as unknown and fall back to a boot-id or start-time comparison against `started-at`.
- Scenario: The wrapper dies before `born` lands. After a reboot its pid belongs to another process, and the job stays `running` indefinitely.

### R-18 Job publication is atomic and prune-safe
- Area: reliability
- Severity: low
- Location: `src/job/publication.ts:96-189`
- Evidence: All starting files are written `flag: "wx", flush: true` into `.publishing-<id>`, then `await worktreeLock(jobsRoot, () => rename(publishing, jobDir));`. Failure removes the hidden directory.
- Rule: none
- Verdict: compliant
- Direction: Keep it, and use the same pattern for the multi-file close in R-08.
- Scenario: n/a

### R-19 Recovery claims and wake receipts resist pid reuse and double delivery
- Area: reliability
- Severity: low
- Location: `src/runtime/recovery.ts:41-46`, `src/integrations/coordinator-wake.ts:54`, `src/runtime/hosted-binding.ts:88-94`
- Evidence: Claims compare pid and birth (`info.process.born === born`). The wake is claimed with `writeFile(receipt, …, { flag: "wx", flush: true })` (`return; // Another finalizer already owns this wake.`). The hosted binding compares `boot_id`.
- Rule: none
- Verdict: compliant
- Direction: Reuse this identity model for `groupLock`, `withSeatLock` and `poll.lock` (R-04, R-05).
- Scenario: n/a

### R-20 Detached jobs have hard limits that end in a recorded failure and a wake
- Area: reliability
- Severity: low
- Location: `src/runtime/wrapper.ts:36-38`, `src/runtime/wrapper.ts:225-227`, `src/runtime/wrapper.ts:347`, `src/runtime/wrapper.ts:350-357`
- Evidence: There is a 90 min timeout, a 900 tool-start cap and a stall rule, each followed by `finalizeJob(jobDir, "failed", reason, …)`, plus one steer at 80 % ("commit your work or write your verdict now"). The control run in `exp5` showed `failed: timeout after 8000ms`.
- Rule: z. 1
- Verdict: partial
- Direction: The bounds are right, but their effect depends on R-01 (the failed job's tree is pruned) and R-07 (one SIGTERM disarms them).
- Scenario: n/a

### R-21 Webhook queue: lease takeover and idempotency key
- Area: reliability
- Severity: low
- Location: `src/integrations/webhook-queue.ts:117-134`, `src/integrations/webhook-queue.ts:59-61`
- Evidence: The queue and outbox are written with `atomicWrite`. The lease is `wx` with dead-pid takeover (`if (await leaseHeld(lease)) { return false; } await rm(lease, …)`), and the comment says "The receiver can drop a repeat by its key". Two takers can both remove a dead lease and both send, which only the receiver's `Idempotency-Key` absorbs.
- Rule: none
- Verdict: compliant
- Direction: Keep it. If exactly-once matters, replace the rm-then-retake with a rename-based claim.
- Scenario: n/a

## To verify

- Does Pi 1.2.0 with the Claude bridge exit promptly on SIGTERM? If it takes longer than 25 ms, `limen stop` usually wins R-06. If it ignores TERM and the `limen stop` process is cancelled within 5 s (e.g. the coordinator's tool call is aborted), no KILL is ever sent (`stop.ts:52-58` runs in a `void` task of the CLI process). Settle by stopping a real job on the seat and timing the engine's exit.
- What does the Claude bridge emit when the 5 h or weekly limit hits mid-job: an assistant message with `stopReason` `error` (→ `failed`), or plain text with exit 0 (→ `done`, `wrapper.ts:377-383`)? The second would be a false success. Settle with the bridge source or a captured session JSONL from a quota hit (`quota-resume.ts` matches "hit your … limit" on assistant errors only for coordinators).
- On the seat, are detached wrappers in the Herdr server's cgroup, so that a Herdr or user-service restart kills all jobs at once (turning R-01 into a fleet-wide loss)? Settle with `systemd-cgls` while a job runs.
- Are the production projects in `committed` or `private` planning mode? This sets the impact of R-09. Settle with `cat <project>/.limen/planning-source`.
- Is the GitHub App poller enabled on the seat? This sets the impact of R-05 and R-10. Settle with `systemctl is-enabled limen-github.timer`.
- When root moves `/opt/limen` to a new tag while jobs run, do running wrappers or hooks load modules lazily from the new tree (mixed versions mid-job)? Settle by grepping `src/` and `hook/` for dynamic `import(` on the finalize path.
