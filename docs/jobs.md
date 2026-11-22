# Jobs

[README](../README.md) · [Command reference](commands.md)

Use this guide to start, inspect, review, and recover coding jobs.

![A coordinator starts workers and reviewers in separate Git worktrees](https://raw.githubusercontent.com/overment/limen/main/docs/limen.gif)

## How work runs

1. Tell the coordinator the outcome that you want.
2. The coordinator writes or moves the ticket. When the work lands, `limen land` moves the ticket to `done/` and regenerates NOW and PROVEN on `spec/build.md`.
3. The coordinator commits the ticket, so that the worker can see it.
4. The coordinator starts a job.
5. Stay in that conversation. A wake comes when a job ends.

Speak only when something looks wrong, or when the coordinator asks you. The coordinator asks about product ambiguity, a real tradeoff, credentials, or a merge.

### Requests

A good request names the outcome and the first artifact. It does not describe the whole repository. The coordinator changes the request into a short spawn with a `Ticket:` pointer. It does not paste the ticket into the prompt.

### Wakes

The type of coordinator controls how the wake comes:

| Coordinator | How the wake comes |
|---|---|
| **Pi** | The coordinator subscribes its session at spawn. The wake hook then puts the completion into that session. |
| **Herdr, without a Pi session** | The job's record holds the coordinator pane in `origin.pane`. When the job ends, Limen runs `herdr agent prompt` on that pane. Then Limen waits until Herdr sees the pane at work. |
| **Group lead** | A team coordinator's finish reaches the lead as a group event through `hook/group-peer.ts`. When that hook is not live for the lead session, Limen prompts the lead pane through Herdr instead, with the group status and the reload hint. Workers inside a team never wake the lead. |

For a Herdr wake, `limen show <id>` shows the result as `herdr-wake`: `turn observed`, `delivered …, turn not seen` (Herdr sent the text; a busy pane may queue it), `may have reached …; not resent` (Herdr timed out after it may have sent the text), or `not sent …` (Herdr refused before it sent input). Limen sends the wake again only after `not sent`, and stops after two attempts; text that may have reached the pane is never sent twice. A wake up to 96 KiB goes as one `herdr agent prompt` argument, below Linux's 128 KiB limit for one argument. A longer wake goes whole as the same `agent.prompt` request on the Herdr socket that `herdr status --json` names. Herdr 0.9.5 reads at most 1 MiB in one request, and only while the request arrives within 5 seconds. No Herdr request can carry a longer wake, so it is `not sent …: prompt_too_large`; the job record keeps the whole final message.

`limen continue` from a shell with no wake route (no Pi session and no Herdr pane), for example a remote executor, keeps the parent's route: the parent's coordinator gets the continuation's wake.

Both routes carry the same completion facts: the task, branch and repository, stop reason, at most ten commits, the whole final message, and undelivered steers when present. The final message is never cut: the coordinator decides the next step from it. The group lead's result carries it whole too. A job with zero recorded tool calls and no commits says that it produced nothing. Missing evidence files remain absent from the wake; the route-specific next-step instruction may differ.

### Job states

| State | Meaning |
|---|---|
| `done` | The run ended cleanly. The selected engine exited 0, and the last stop reason was not `error` or `aborted`. |
| `failed` | The run had a provider error, and Limen records the reason. A limit also records `failed` (see [Limits](#limits)). A failed job keeps its transcript, and its worktree while that holds unlanded work (see [Finished jobs](#finished-jobs)). |

A `done` job whose final "Note check" leaves an item open is `done with open checks`. Limen keeps the `done` state and writes one line for each open item to `openChecks` in the job's record: an item marked not proven, changed, dropped or broken, a proven item with no proof that its command ran in the session and no such file, or a check that was sent and not answered. A command counts only when one recorded bash call ended with exit 0 and joined its simple commands with `&&` alone, and no pipe follows the command; any other call may have skipped it or hidden its failure, and the open line names the reason. The wake lists these lines and asks the coordinator to continue the job, start a review, or accept each item with a reason before it lands. `limen show` and `limen status` show the same state.

Failed rows use the record's `stopReason`, not a later tab-close log line. Rate-limit rows show the HTTP status and approximate retry minutes; `limen show <id>` retains the full provider reason. Records without a stop reason use the last `failed:` or `stopped:` log entry.

### The job record

Each job folder `.limen/jobs/<id>/` holds one `record.json` (schema version 1): the state and its transitions, the process that runs the job (pid, start time and boot id, each `null` when unknown), the start and finish times, the failure with its kind, the facts its spawn published (label, branch, worktree, base, role, origin, group, route and the like), the start queue's place, and the job's systemd user scope (`scope`: its unit and cgroup, and the memory peak, CPU time and OOM kills its end read there, each `null` when it could not; a record from before the scope has none). Only Limen writes it, under the job's lock, from the state it expects; nothing changes it after a terminal state, and the first finisher wins. `progress.json` beside it holds the wrapper's last activity, last tool and tool count. The content stays in plain files: `task.md`, `log`, `result`, the notes, `start-notice`, `session/`, and the receipt folders `notify/`, `steer/` and `recovery/`. Read a job through `limen show <id>`, and the counts over every job of the project through `limen stats`, never by hand; do not edit the record. `limen stats` reads every record and each job's transcripts from the job's own start, and counts them by route and role: the jobs, how many are `done` and `failed`, the run time from their transitions, and the tokens by class (input, cache write, cache read, output) of every transcript entry that carries a usage, compactions included. Then it counts the failed jobs by kind, and names what it did not read: the folders of `.limen/unmigrated/`, a folder with no record, a record or a transcript line that does not parse, and a run time the transitions do not give. A part the record does not hold shows as `unknown`.

**The job's scope.** Every job runs in its own systemd user scope, `limen-job-<id>.scope`. Its wrapper starts there, outside the cgroup of the coordinator's pane, so `--prepare`, the engine, its tools and whatever they start run inside it, a process detached with `setsid` or moved to another parent included, and a restart of Herdr does not end them. Every end of a job, `done`, `failed` or `stopped`, stops the whole scope: each process still in it gets SIGKILL. What the end starts itself, the group's next round and the closer of the job's Herdr tab, runs in a scope of its own, `limen-run-<token>.scope`. Just before its end, Limen reads the scope's peak memory, CPU time and OOM kills into the record, and `limen show <id>` prints them. A host without the account's systemd user instance runs no job: `limen init` refuses it, and a spawn whose scope does not start exits 4 with `SCOPE_FAILED` and ends its job `failed`.

A project whose job folders an older Limen wrote (one plain file per value, such as `state`) is migrated once: `limen migrate --dry-run` prints what would happen, then `limen migrate` does it, with no job running or starting. Until then every command that reads jobs exits 4 and names `limen migrate --dry-run`, and the coordinator's wake hook stays off and says why. Each folder with a known state becomes a record marked `migrated`, history that `status` and `show` read and that no wake or bell answers; the one-value files it moved, and the files of removed features, go; the content files stay. A folder without a known state moves unchanged to `.limen/unmigrated/<id>/`. The report lists every job, every folder moved with its reason, every file removed, every id of the older 4-hex format and every token two ids share. A token that one job shares only with folders of `.limen/unmigrated/` still names that job, and those folders have no reference until R-031; the jobs of every other shared token, and of an older id, are named by their full id. A second run has nothing to do. The rollback is the snapshot taken before the migration.

**Neither state is approval.** Neither state means that the ticket is finished or that the branch is safe to merge, because `done` only means that the run exited cleanly. The coordinator reads the record, the diff, and the checks. Then, under the review policy of the project, it merges, or resumes a repair, or asks you.

### Reviews

When a mistake would be expensive, the coordinator starts a new reviewer on the candidate. The reviewer gives a verdict. The reviewer does not change the branch.

## What the coordinator runs

These commands are the harness. The coordinator types them. This list helps you recognize a job ID, a wake, or a recovery step. It is not a daily script.

```bash
# Start a worker
limen spawn --engine <engine> --provider <provider> --model <model> --thinking <level> \
  --label "session handler · F001" \
  'Implement F001: sign-in survives a restart. Start with the failing session test. One commit. Ticket: spec/features/active/F001-auth/ticket.md'

# Ticket pointers accept whitespace after Ticket: and strip closing sentence punctuation.

# Inspect
limen status
limen status --all
limen show <id|token>
git diff HEAD...<branch>

# Review
limen spawn --engine <engine> --provider <provider> --model <model> --thinking <level> \
  --review --detached --branch limen/<job-id> --label "session handler review 1 · F001" \
  'Review the F001 candidate against spec/features/active/F001-auth/ticket.md. Name the commit reviewed.'

# Correct, stop, repair, or continue
limen steer <id> "stay on the session test; do not widen"
limen stop <id> "reason"
limen spawn --engine <engine> --provider <provider> --model <model> --thinking <level> \
  --branch limen/<job-id> --label "session handler repair 1 · F001" 'Focused resume instruction'
limen continue <id> 'Follow-up instruction'

# Follow and land
limen watch <id|token>
# When the work changed a ticket, fix its links on a keeper branch first, then land the keeper job
limen keeper spec/features/active/F001-auth/ticket.md --job <id> \
  --engine <engine> --provider <provider> --model <model> --thinking <level>
limen land <id>
```

### Job IDs and labels

- **Job ID:** The final line of `spawn` carries the durable job ID in `ids.job` ([the final line](commands.md#exit-codes-and-the-final-line)). Spawn prints its text when it ends, the ID after its start line; a spawn killed during setup prints no ID, and `limen status` lists the job its record names.
- **Labels:** A label names the change first and the feature number last. A repair label or a review label names its round.
- **Labels that name a lead:** Ordinary text such as `Fix the lead-in paragraph · F900` is allowed. Lead ownership comes from the coordinator pane, not the label; `--role coordinator` and `--role lead` remain refused.
- **Group labels:** Team jobs read `team-2 coordinator · F773`, so jobs on the same feature remain distinct.

### Steer, stop, and resume

Use these steps in this order:

1. **Steer.** A running job reads a steer between tool calls.
2. **Stop.** Stop a job only after it ignores a steer, or when it is clearly dead. Stop sends TERM to the job's process group, then KILL when it still runs after a grace, and then stops the job's scope, which ends every process the job left, a detached one included.
3. **Resume.** A resume uses the same branch and worktree, with the uncommitted files, so the coordinator reads that state first.

### Watch and land

- **Watch:** To take over a job that another coordinator started, watch that job by name. `watch --running` subscribes to every running job, but it is not a takeover.
- **Land:** `limen land` merges a `done` job onto the current branch. Read [Job states](#job-states) first.
- **Ticket check on land:** before it merges, `limen land` checks every ticket the branch adds, moves or changes, at the branch tip, against the plant map's place ids. An error refuses the land and prints the `limen keeper` command that fixes it. A warning prints and does not block. Without a map, land skips the place ids and says so. `limen ticket check <branch>` runs the same check before an ordinary `git merge`.

### Spec keeper

`limen keeper <ticket> (--job <id> [--job <id> …] | --group <id>) [--candidate <branch>]` starts a short detached job (default timeout 20 minutes) that fixes the spec links of finished work: ticket front matter, a planned or dropped board line, and map sources. `--group` adds every member job of that group. The coordinator starts it; no hook does.

- It refuses while a listed job is still running, so it never races a worker. In a group, only the lead starts it.
- It creates `limen/keeper-<fnnn>-<tip>` at the candidate tip: the single job's branch, or `--candidate` for several jobs on one integration branch. The keeper commits only there.
- When the job moved its ticket to another lane, the old path still works: the keeper follows the one folder at the tip with that number and prints `ticket moved: <old> -> <new>`.
- Its task is a packet: the ticket, board and map paths, the candidate, the changed tickets, the current land check, and per job the label, state, branch with base and tip, worktree, session transcript and task. Pi writes the transcript as `.limen/jobs/<id>/session/<time>_<uuid>.jsonl`; the packet names the newest one.
- The keeper edits only `spec/features/**`, `spec/build.md`, and map files that cite a changed ticket. Map edits apply in place and do not land.
- Land the keeper job: it carries the work and the fixes. If the keeper commits nothing, land the original job.

### Finished jobs

Finished jobs keep their records and files in `.limen/jobs/`. The next job removes the worktrees of finished jobs before its engine starts and logs one line per removal: path, job, reason. A resume with `--branch` keeps that worktree.

**Unlanded work stays.** A finished job holds unlanded work when its worktree is there and `git status` lists anything in it (changed, deleted and untracked files; not ignored ones), or when its own branch holds commits that HEAD of the project's checkout does not reach. A review job's branch is its candidate's, so only its worktree counts. The newest job that names a worktree holds it: a continued parent holds nothing, and a member of an open group holds nothing while the group is open. No prune removes a worktree that `git status` shows dirty, whatever job names it, nor the worktree of a job that holds unlanded work, nor a worktree whose HEAD, index or nested checkout records a nested repository at a commit that the project's object store lacks, which lives only in that nested `.git` (whether or not its job is resolved, however clean `git status` shows it), nor a worktree that still holds another registered worktree below it (prune decides the deepest first, so the one below is decided before); each such worktree prints one line, `kept <worktree> (job <id>): unlanded work`, or `kept <worktree> (job <id>): the nested repository <path> holds a commit that the project's repository lacks`, or `kept <worktree> (job <id>): it holds the registered worktree <path>` for one kept only for a registered worktree below it, and so do land and `prune --retire` for a worktree they keep. A path in such a line has its control characters escaped as JSON writes them, so a name a job chose stays on its line. The work is resolved when it lands, when `limen continue <id>` takes the worktree, or when `limen abandon <id>` saved it on `limen/abandon/<id>`. Until each job's work is resolved, a worker spawn in the project exits 1 with `UNLANDED_WORK`, names each such job with its changed files, its unlanded commits and both commands, and names `limen status` in `next`; `limen status` lists those jobs under `Unlanded work`, whatever their age. A worker spawn with `--branch` on the own branch of such a job, the repair spawn of a reviewed candidate, takes over that job's worktree and work, as a continuation does, so only the other jobs make it refuse, when it reuses that job's worktree or the job's worktree is gone; a job whose worktree is there without the branch checked out still makes it refuse. A reviewer, keeper or team coordinator spawn does not wait, since it works on a candidate. A worktree whose `git status` fails is never read as clean: spawn, `limen status`, `limen prune` and `limen abandon` exit 4 with `GIT_FAILED`, and the message names the worktree and its job before Git's own words.

| Command | Effect |
|---|---|
| `limen prune` | Removes the worktrees of finished jobs that hold no unlanded work, as the next job does, and prints the path, job and reason of each removal, then one `kept` line for each worktree it keeps. |
| `limen prune --retire` | Deletes finished, failed, or stopped job records whose branch is landed (ancestor or cherry-pick) or deleted, and the landed local `limen/*` branches of those records. It skips a job that holds unlanded work. |
| `limen prune --retire --dry-run` | Prints the IDs and removes nothing. |
| `limen abandon <id>` | Gives up on a finished job and keeps its work on the branch `limen/abandon/<id>`, then removes its worktree and closes its Herdr tab. |

Spawn and sweep never retire records. A branch stays while any job that names it is still running or starting, while a checkout other than a finished job's worktree holds it, or while the worktree that holds it is kept: dirty, holding another registered worktree below it, or holding a nested repository whose commit the project's repository lacks. Remote branches stay.

**Abandon a job.** `limen abandon <id>` takes a finished job: it refuses a job that has not finished (`JOB_NOT_FINISHED`, `next` `limen stop <id>`), a member of an open group (`JOB_IN_GROUP`), a job whose worktree a newer job holds (`JOB_CONTINUED`, `next` the abandon of that job), and a job with no unlanded work (`NO_UNLANDED_WORK`, `next` `limen prune`). It commits the worktree's whole state on top of the worktree's HEAD through a temporary index, so no hook of the project runs and the job's own branch stays where it was; the commit's message is `limen abandon <id>`, with the repository's configured identity. A job whose worktree is gone gets the branch at its own branch's tip. It then removes the worktree as prune does, only while the branch holds all of the worktree and prune itself could remove it. Otherwise the worktree stays, and abandon names it with the cause in a line `kept <worktree> (job <id>): <cause>`: it changed after the commit; a nested repository in it (a submodule, or a folder with its own `.git`) holds commits or changes the commit does not, since the commit records a nested repository only as its checked-out commit, and a nested commit that the project's object store lacks keeps the worktree, also when the worktree's HEAD records it, from abandon and from every prune and land after it (`the nested repository <path> holds a commit that the project's repository lacks`); it holds another registered worktree; Git locks it; or it is the primary checkout, lies outside the worktree root, or is no registered worktree. Ignored files go with the worktree, which is why abandon cannot be undone. Run again after a stop, it finishes the steps that are left; run again after all of them, it prints the branch and exits 0. Limen never deletes a `limen/abandon/<id>` branch.

### Continue a finished job

To keep the conversation of a finished job, run:

```bash
limen continue <job-id> "Follow-up instruction"
```

Limen copies the saved session into a new linked job. The new job takes the worktree and the work in it, so from then on the parent holds no unlanded work, and the new job keeps the worktree safe from prune. If the old checkout is gone, because it held no unlanded work and prune removed it, or `limen abandon` removed it, Limen restores it at the recorded path from the job's own local branch. A landed job has no local branch left, because `land` and `prune --retire` delete it; to continue one, first recreate the branch at its landed commit (`git branch <branch> <commit>`). If Limen cannot create the new job, the parent job and its saved session do not change.

**Only committed branch contents come back.** Prune never removes uncommitted files: their worktree stays until the job is continued or abandoned, and `limen abandon` keeps them on `limen/abandon/<id>`. Recovery is not possible without the branch or the transcript. Limen does not take over a branch that is checked out in a different place.

**Every job can call `finish`.** A continuation keeps its parent's transcript, so the worker may call `finish` again. The handoff becomes the job result, and the job ends `done` when the engine exits. A later reply does not replace that handoff.

### Start queue

Every plant on the seat shares one machine, so detached jobs wait in one queue for the whole seat, under `~/.limen/start-queue/` of the agents' account. The job's own wrapper waits after its handshake and before prune, `--prepare` and the engine. No daemon runs the queue.

- **Order.** Priority first (`--priority 1|2|3`, 1 the most urgent, 2 the default), then the time the job entered the queue.
- **Priority budget.** A [seat rule](commands.md#seat-wide-rules) with `--start-priority N` holds every detached job less urgent than N until the rule ends: `limen rule set claude-week --until <reset> --start-priority 1 "…"` starts only priority 1 jobs. A held job waits with its own reason, `held by rule <name> until <end> (start priority N)`, one per rule that holds it. Spawn prints it after `queued`, `limen show` shows it after the wait, and `limen seat queue` shows it under the job. A held job never reads the load and never blocks a more urgent job. The hold applies also when the gate is off. When the rule ends, at its end time or by `limen rule end`, the held jobs start in queue order as the gate allows, and each coordinator gets the start notice. Group launches are not held.
- **Budget reading.** Limen does not read the Claude budget; a person reads it and sets the rule. Today the reading comes from the Claude bridge, which receives Claude's rate-limit events: the Pi bridge warns at 80% without a number, and it does not write the reading to a file. Source: `evidence.md` in the F951 feature folder under `spec/features/`, section "The budget reading".
- **Gate.** Only the first job in the queue reads the load: CPU idle across all cores over about two seconds, and free memory: MemAvailable over MemTotal in `/proc/meminfo`. The job starts when CPU is at least 25% idle and memory at least 20% free. A value the machine cannot report does not hold a job back.
- **Settle.** After one start, the next start waits a settle interval of 60 seconds, so the new job's load shows in the next reading.
- **Values.** The seat's file `~/.limen/start-gate.json` of the agents' account changes them for the whole seat: `{ "cpuIdle": 25, "memoryFree": 20, "settle": "60s" }`, and the JSON string `"off"` turns the gate off. The file is the only source: `LIMEN_START_GATE` is no longer read, and `limen status` names it when its environment holds it. A waiting job reads the file again on each poll, so an edit reaches jobs already in the queue. The job log names each value that Limen ignores. `LIMEN_START_READING` names a file that holds the reading instead of the machine (`{ "cpuIdle": 10, "memoryFree": 80 }`); tests and manual checks use it.
- **What a coordinator sees.** A job that the gate admits at once and that has nobody ahead starts as before; its log says `start gate: open`. A job that must wait makes spawn print `queued`, shows the pulse `queued` in `limen status` and `limen show`, and logs `queued: …`. When it starts, its log says `start queue: started after …`, and its coordinator gets one start notice on the route its finish uses: the Pi wake hook for a subscribed session, or `herdr agent prompt` to the origin pane in the job's record. The notice says no action is needed. Its receipt is its own (`notify/delivered/_start.<session>`, `notify/herdr-start`) and never counts as the completion wake. The Pi "started" toast waits until the job leaves the queue. A start notice is news only while the job runs: when the job ends before the Pi hook delivers it, no late notice follows, and the session's completion wake carries the notice's line instead. The Herdr route starts its notice as the job leaves the queue, before prune, `--prepare` and the engine; the job does not wait for the pane's answer.
- **Stop and loss.** `limen stop` ends a queued job `stopped` with the stop reason. A queue entry whose wrapper is gone, or whose job ended, is removed and does not block the queue. A recycled pid can keep a lost entry until the reaper ends its job. A queued job whose folder is removed ends at its next poll: its wrapper leaves the queue and exits, no engine starts, and no terminal record is left, since the folder that would hold it is gone. A queued job whose record the queue cannot check (an error other than a missing file, such as no permission) ends its wait: its wrapper leaves the queue and exits 1, no engine starts, and the job's log holds the cause in a `start queue:` line, when the log can take it.
- **Limits.** The job timeout and a group deadline count from engine start; time in the queue never counts against them. Group launches start at once.

### Limits

| Limit | Job |
|---|---|
| Time | 90 minutes (change it with `--timeout 20m`) |
| Tool-start events | 900 (`toolCalls` in the plant limits file) |
| `--prepare` command | 5 minutes (`prepare` in the plant limits file) |
| Stalled tool | 3 minutes (`toolStall` in the plant limits file) |

A prepare command that runs out of time is stopped, and the job log records `prepare failed: timed out`. The job still starts.

**Stalled tools.** Every job keeps the three-minute CPU-idle tool containment rule; `toolStall` in the plant limits file changes that confirmation time.

**Plant limits.** A plant can set the prepare limit, the stalled-tool time and the tool-start cap in a tracked file, `.agents/limen/limits.json`. Cargo plants use it. Their builds wait for each other: a Mac-wide cargo wrapper that queues builds, or cargo's own lock on a build directory. A prepare command that builds Rust can need more than 5 minutes. A cargo command that waits on cargo's lock uses no CPU, so the stalled-tool rule can stop it. A cargo plant commits this file:

```json
{ "prepare": "20m", "toolStall": "15m" }
```

- `prepare` and `toolStall` use the `--timeout` form: `90s`, `20m`, `2h`.
- `toolCalls` is a positive integer: the job ends after that many tool starts.
- The file is the only source of these limits. `LIMEN_PREPARE_MS`, `LIMEN_TOOL_STALL_MS` and `LIMEN_MAX_TOOL_CALLS` are no longer read, and `limen status` names each one its environment holds.
- A plant with no file keeps 5 minutes, 3 minutes and 900 tool starts.
- Limen reads the file in the project root each time it uses a limit, so an edit applies to running jobs too.
- The job log names each entry that Limen ignores, such as an unknown key or a value without a unit.
- The file does not change the job time limit.

**Job notes.** A running job's wrapper sets the record's `advisory` when it cannot observe a tool for the stalled-tool rule, for example `tool stall observation uncertain: CPU or process identity unavailable`. A running row in `limen status` and `limen show` names that note `advisory`. A healthy running job shows no note. Each coordinator that follows the job gets one wake about the note. The note clears when the wrapper can observe the tool again or no tool runs.

### Seat notifications

`limen sweep` scans registered projects for terminal jobs that nobody heard and for the advisories of running jobs. A running job's notification title names its note, for example `limen: fix login · advisory`. Each event gets one seat notification, also across restarts and concurrent sweeps. Old timestamp receipts stay valid. When an advisory clears and a new one starts, the new one can send a notification again.

If a notification fails in an unclear way, the sweep logs an error and does not send that event again automatically. Seat notifications do not use up coordinator wakes.

## Recovery

The coordinator does this. You need it only if you look at a stuck tab yourself.

| Symptom | Safe next step |
|---|---|
| The job is quiet or repeats itself | Read `limen show <id>`, the log, and the worktree. Stop only on evidence. Then resume with a narrower task. |
| The worker has a real question | Read its durable note. Answer it. Resume the branch. |
| The wrapper is dead, but the state says `running` | Run `limen show <id>`: it ends a job whose recorded process is gone as `failed` and stops the job's scope, so none of its processes keeps running. Then resume. |
| A completion wake did not come | Run `limen show <id>` and read Git. The job's record stays the source of truth when a notification does not come. |

## How it works

You do not need these mechanics to run jobs. They explain the notes and records above.

- **Publication:** how spawn and continue create a job. Limen writes the complete starting record in a hidden directory, then publishes it with one rename. A publication failure removes the hidden record and leaves the parent record and saved session unchanged.
- **Seat receipt:** the job folder's `notify/seat`. The sweep writes it before it sends a notification, so one event rings once, also across restarts and concurrent sweeps.
