# Command reference

[README](../README.md) · [Setup](setup.md) · [Jobs](jobs.md)

The coordinator runs job commands. The operator runs setup commands. Run `limen --help` for the installed command list. Run `limen <command> --help`, for example `limen land --help`, for one command's usage line, its flags and an example, and `limen <group> --help`, for example `limen picture --help`, for the lines of a group.

Where the reference shows `<id|token>`, a command takes the job's full ID or its token, the 8 hexadecimal characters that end the ID. Any other form, such as a label, a label prefix or a shorter suffix, exits 2 (`JOB_NOT_EXACT`) with the jobs it may mean in the message; a token that several IDs share exits 2 (`JOB_TOKEN_SHARED`), and so does an ID or token that names no job (`JOB_NOT_FOUND`). A job whose ID ends in 4 hexadecimal characters, as before 2026-08-14, or whose token another ID shares, takes only its full ID. When a reference is refused, `next` is the same command with the token of the one job the reference may mean (its full ID when the job takes only that), or `limen status --all` when it may mean several jobs or none.

## Exit codes and the final line

Every command ends with one line of JSON, its final line, after the text for people. After a success the line ends stdout; after a failure it ends stderr, after the message. A command prints all of its text when it ends, its diagnostics on stderr and the rest on stdout, the text it gave before a failure too; only `limen picture serve`, which serves until it is stopped, prints while it runs. In a terminal, `limen land`'s confirm question carries its notes, the uncommitted-files note, the ticket check's warn lines and the test-line cap line, written before the answer. The commands that later tickets move or cut (`keeper`, `group wait`) still print as they go until those tickets move them. The exit code is the class:

| Exit code | `class` | Meaning |
|---|---|---|
| 0 | `ok` | success, also "nothing to do"; `group wait` at its time limit, with the same call in `next` |
| 1 | `refused` | a condition that Limen checks is not met, each with its own code, such as `TICKET_NOT_AT_BASE`, `BRANCH_LIVE_JOB` or `NO_ACTIVE_TICKET`; a removed engine or role that a job record names (`REMOVED`) |
| 2 | `usage` | an unknown command (`UNKNOWN_COMMAND`); words that the shared parser refuses (`BAD_ARGUMENT`): an unknown flag, a flag without its value or given twice, a missing required flag, a missing or an extra argument; a removed command, flag, engine or role on the command line (`REMOVED`); a value a command cannot take, each with its own code, such as `BAD_ENGINE`, `BAD_DURATION` or `REVIEW_NEEDS_BRANCH` |
| 3 | `transient` | safe to retry: `github poll` after a failed request, HTTP 429, a 5xx, or a 403 that is a rate limit (`x-ratelimit-remaining: 0` or a `retry-after` header), with `limen github poll` in `next` and, when GitHub gives one, the time of a retry on the project's line (from `retry-after`, else from `x-ratelimit-reset` when no request remains); a lock still held after its 60-second wait (`LOCK_TIMEOUT`), whose message names the lock file and its owner; a fact a command checked that another process changed before the command's first write (`STATE_CHANGED`); a group start that started only part of its roster (`GROUP_PARTIAL_START`) and a group stop that could not confirm every member stopped while running it again can still stop each one (`GROUP_STOP_INCOMPLETE`), each with the same command in `next` |
| 4 | `environment` | `github poll` with a missing or invalid setting, projects file or credential, HTTP 401 or any other 403; a Node.js older than 24; an engine or its bridge package that spawn does not find (`ENGINE_MISSING`, `BRIDGE_MISSING`); a git call that fails (`GIT_FAILED`); a `PI_SESSION_ID` or `HERDR_PANE_ID` that is not safe to route a wake by (`UNSAFE_PI_SESSION_ID`, `UNSAFE_HERDR_PANE_ID`); a lock that something outside Limen removed or replaced while a command held it (`LOCK_LOST`); `limen seat sweep --install` on an account that does not linger (`NO_LINGER`) or from a process with no PATH (`NO_PATH`); a group stop with a member whose record runs with no recorded pid, which no rerun can stop (`GROUP_STOP_INCOMPLETE`, with `limen seat sweep` in `next`), or whose stop of a member failed in the environment (`GROUP_STOP_INCOMPLETE`, with the same stop in `next`) |
| 5 | `internal` | an unexpected exception, whose stack comes before the final line; a command that returns an `ids` key its registry entry does not declare (`UNDECLARED_IDS`); a group stop whose stop of a member was refused after the stop's own checks (`GROUP_STOP_INCOMPLETE`, with the same stop in `next`) |

A failure that has no class of its own exits 1 with the code `UNTYPED`.

Eleven change commands share one shape (`src/operation.ts`): `spawn`, `continue`, `stop`, `abandon`, `ticket done`, `seat sweep`, `picture build`, `group start`, `group stop`, `github review` and `github work`. Each makes all its checks before it writes anything, so a refusal (1) or a usage error (2) leaves the project as it was. A read of its checks that the file system fails is the environment's failure (`CHECK_FAILED`, exit 4), never `UNTYPED`. Before its first write it reads again, under a lock, the facts its checks relied on; when another process changed one in between, it writes nothing and exits 3 with `STATE_CHANGED`, with the same command in `next`, and running it again checks anew. A failure after its first write is never a refusal: it exits 3, 4 (git or the file system failed, `STEP_FAILED`) or 5 (`REFUSED_AFTER_VALIDATE`, a check that belongs before the first write). The other change commands move to this shape in later tickets.

The line has the fields `class`, `code` and `next` in this order, then `ids` when the command names what it created:

- `code` is `null` on success. On a failure it is an upper-case identifier, such as `UNKNOWN_COMMAND`, `BAD_ARGUMENT`, `REMOVED` or `TICKET_CHECK_FAILED`; a refusal that has no identifier of its own has `UNTYPED`, and an unexpected exception has `INTERNAL`.
- `next` is a Limen command with concrete values, such as the branch or the group ID, or `null` when no command follows; it is never prose or a placeholder, and what to do in words is on the text line before the final line. After `BAD_ARGUMENT` it is `limen <command> --help`, and the message has two lines: what is wrong, then the command's usage line. After `TICKET_CHECK_FAILED` and `PICTURE_INVALID` it is the same check again (`limen ticket check <branch>`, `limen picture build --strict` with the `--dir` given), after the line that says to fix what is listed above. After `REMOVED` it is the command that replaced the removed name when that is a fixed command or one built from the words given: `limen picture build` for `picture tick`, `limen status` for `picture watch`, `limen seat queue` for `queue`, `limen seat sweep` for `sweep`, `prune` and `close`, `limen group status` with the group ID given for `group status --json`, and `limen show <job>` or `limen status --all` for `jobs`; every other removed name has `null`, and its line says what to do instead, as `rule` and its old subcommands say that Limen itself resumes a job the subscription limit stopped. `UNTYPED`, `INTERNAL` and a success with no next step have `null`.
- `ids` holds identifiers, never data: `job`, the full job ID, after `spawn`, `continue`, `keeper`, `github review` and `github work`; `ticket`, the `FNNN` of the new ticket, after `ticket new`. Each command's registry entry (`src/registry.ts`) declares its keys. The key `question` (`Q-NNN`) is part of the format; no command returns it today.

For example, `limen land a1b2c3d4 --ontoo main` prints `limen land: unknown flag --ontoo` and `usage: limen land <job> [--onto <branch>] [--yes] [--keep-open]` on stderr and exits 2. A spawn ends with the text line `End your turn; Limen wakes you when the job ends.` and the final line `{"class":"ok","code":null,"next":null,"ids":{"job":"<full id>"}}`; `continue`, `keeper`, `github review` and `github work` end with the same two lines. A program that runs Limen reads the final line through one client function, `readOutcome` (`src/outcome.ts`), never the text before it, with one exception: when `limen github deliver` fails, the GitHub poller tells an unavailable coordinator from an unconfirmed delivery by the text on its stderr. Limen starts its own CLI from one module, `src/runtime/launcher.ts`, which reads the final line through that function. The internal job run that a job's wrapper starts prints no final line.

## Command list

The lines of `limen --help`, generated from the command registry (`src/registry.ts`); a test fails when they differ from it.

<!-- registry:public:begin -->
```text
Jobs: spawn starts a job; the others act on one job, or on several with --running or --all
  limen spawn "task" --engine <engine> --provider <provider> --model <model> --thinking <level> …
      start a job in its own worktree; the task points to its ticket
  limen continue <job> "instruction" …       resume a finished job in its worktree
  limen steer <job>|--running "text"         send a correction to a running job
  limen stop <job> ["reason"]                stop a running job
  limen abandon <job>                        give up on a job and keep its work on a branch
  limen land <job> [--onto <branch>] [--yes] [--keep-open]
                                             merge a done job onto this branch and close its ticket
  limen diff <job>                           the change a job made against its base
  limen show <job>                           one job's record
  limen open <job>                           open the job's log tab in Herdr
  limen watch <job>|--running                wake this coordinator when the job ends
  limen unwatch <job>|--all                  stop waking this coordinator for the job

This project
  limen init [--drop-leftovers]
      set up Limen here; --drop-leftovers deletes files Limen no longer reads
  limen status [--all]
      what runs, what landed, what waits for the owner; --all lists every job
  limen stats [--sessions <dir>]
      jobs by route and role, tokens and lead time per land; --sessions adds coordinator turns
  limen board [--write]
      the board with NOW and PROVEN; --write rewrites them in spec/build.md
  limen migrate [--dry-run]
      move job records an older Limen wrote into record.json; --dry-run writes nothing

Tickets: files under spec/features/
  limen ticket new "what becomes true" [--lane planned|active] [--touches <ids>]
                                             write a ticket with the next free number
  limen ticket check [<branch>]
      the ticket check land runs, for the tickets a branch changes
  limen ticket done <FNNN> … [--on <date>]   close a ticket that landed without limen land
  limen keeper <ticket> --engine <engine> --provider <provider> --model <model> --thinking <level> …
      a short job fixes the ticket, board and map links after the work

Seat: all projects on this machine
  limen seat queue                           the start queue and its CPU and memory reading
  limen seat sweep [--install] [--uninstall] [--status]
      end dead jobs, resume quota jobs, prune and retire daily; --install runs it every minute

Modules
  limen github connect|disconnect|status|doctor
                                             answer @limen mentions on GitHub pull requests
  limen group start|status|publish|stop|close …
                                             several agents on one ticket
  limen picture build|serve …                the architecture map check and the job activity feed
  limen workspace init
      a folder outside Git that holds several Git repositories; each job works in one (--repo)
```
<!-- registry:public:end -->

## Internal commands

Each line names who runs the command: the GitHub poller, team members and team jobs, and the coordinator, which runs `github review`, `work` and `resolve` when a GitHub claim's prompt names them. `limen --help` does not list them, and `limen <command> --help` shows each. Generated from the command registry, like the list above.

<!-- registry:internal:begin -->
```text
limen github ensure [<root>]
      check that the registered Herdr coordinator is live and interactive
      run by the GitHub poller
limen github poll
      run one polling pass over the registered projects
      run by the GitHub poller's timer, as the isolated App user
limen github deliver <root> <claim-id> <handoff-nonce>
      hand one claim to the live coordinator of its project
      run by the GitHub poller
limen github review <root> <claim-id> --engine <engine> --provider <provider> --model <model>
      --thinking <level>
      start a review job for one pull request claim
      run by the coordinator, as the prompt of a GitHub claim says
limen github work <root> <claim-id> --engine <engine> --provider <provider> --model <model>
      --thinking <level> --task <instruction>
      start a task job for one claim
      run by the coordinator, as the prompt of a GitHub claim says
limen github resolve <root> <claim-id> <handoff-nonce> "answer"
      answer one claim without a job; the poller posts the answer
      run by the coordinator, as the prompt of a GitHub claim says
limen group wait [<group>] [--timeout <duration>]
      keep a member's turn open: wait at most 20 s for the group's next events
      run by team members with a worker allowance
limen group advance <group>
      start the group's next round once every team of this one has ended
      run by each team job that ends, and limen group status
```
<!-- registry:internal:end -->

## Coordinator actions

The coordinator runs these from its Herdr pane during ordinary work.

### Start and continue jobs

Start a worker, a reviewer, or a job in one child repository, or continue a finished job.

```text
limen spawn --engine <engine> --provider <provider> --model <model> --thinking <level> "instruction" [--label L] [--branch B] [--role NAME] [--timeout 20m] [--task-file F|-] [--prepare CMD] [--priority 1|2|3] [--detached] [--extension PATH ...]
limen spawn --engine <engine> --provider <provider> --model <model> --thinking <level> --repo R "instruction" [--label L]
limen spawn --engine <engine> --provider <provider> --model <model> --thinking <level> --review --detached --branch B --label L [--base REF] [--head REF] "instruction"
limen continue <id|token> "follow-up instruction" [--label L] [--engine pi] [--provider P] [--model M] [--thinking T] [--detached] [--timeout D] [--priority 1|2|3] [--extension PATH ...]
```

**Detached.** Every job runs detached, under a wrapper with the limits of [Limits](jobs.md#limits), in its own systemd user scope, whose every process ends with the job ([The job's scope](jobs.md#the-job-record)); inside Herdr it also gets a tab that follows its log. `--detached` is accepted and changes nothing.

**Start queue.** A detached job waits in the seat's start queue until the machine has room for it, and ends `failed`, kind `queue`, when it waits longer than the seat's `failAfter`; see [Start queue](jobs.md#start-queue). Spawn and continue then print `queued <label>: <reading>, N ahead` before the ID. `--priority` sets the queue order: 1 is the most urgent, 2 is the default, and `continue` keeps the parent's priority unless it gets its own flag. The job's record holds it in `priority`. Spawn when the work is ready; Limen starts the job and tells its coordinator.

Spawn requires `--engine`, `--provider`, `--model` and `--thinking`: without one of them it exits 2 and names every missing flag, before a job exists. `continue` takes them as options and keeps the parent's engine.

**Unlanded work first.** A worker spawn, with `--branch` too, and a GitHub or group worker's, exits 1 with `UNLANDED_WORK` while a finished job of the project holds unlanded work that nothing resolved ([Finished jobs](jobs.md#finished-jobs)): it names each such job with its changed files and unlanded commits, and `limen continue <id>` and `limen abandon <id>`, and `next` is `limen status`. A worker spawn with `--branch` on the own branch of such a job, as a repair of a reviewed candidate, takes over that job's work and waits only for the others, when it reuses that job's worktree or the job's worktree is gone; a job whose worktree is there without the branch checked out still makes it refuse. A review spawn, a keeper and a group's team coordinators work on a candidate and start anyway.

`--base` and `--head` pin the range that a review reads. They take a full SHA, a short SHA, or a ref such as a branch or tag; Limen resolves it with `git rev-parse` and records the full SHA. They require `--review`.

**Pi extensions.** Repeat `--extension PATH` to select existing local extension files or package directories. Relative paths use the caller's directory, not the worker worktree; quoted `~/` paths expand from the caller's home. Quote paths with spaces. Limen resolves symlinks and removes duplicate paths in first-seen order. Empty values, remote sources (`npm:`, `git:`, URLs), built-in selectors and globs are rejected before preflight or job/worktree creation.

Every Pi job keeps `--no-extensions` and all required Limen hooks. The selected list is published with the job in its record's `extensions`; startup checks that its targets still exist. A missing legacy record means no extras. A malformed record or unavailable target is an error.

For ordinary jobs, `continue` inherits the parent's list when no `--extension` is given. Supplied flags replace the whole list, even if an old path is unavailable; the parent record stays unchanged. Repeat the chosen `--provider`, `--model` and `--thinking` flags: continuation does not inherit those choices. An ordinary fresh `spawn`, including `spawn --branch`, has no user extras unless selected. Group members instead inherit the fixed recorded team list; they cannot replace it. There is no clear-list flag.

Only paths are retained, not extension source or dependency versions. Later edits or upgrades at those paths affect later launches. See [extension trust and model routes](setup.md#personal-model-routes-and-pi-extensions) before selecting third-party code.

### Inspect jobs

Run job commands from the project repository or Limen workspace. Outside either location, Limen names the current directory and tells you where to run. A new repository needs its first commit before `spawn`.

Read the plant inbox, the job records, and the diff of a job, or open a job in Herdr.

```text
limen status [--all]
limen show <id|token>
limen diff <id|token>
limen open <id|token>
```

`status` is the plant inbox. It has four parts:

- `Running`
- `Candidates to inspect` (finished jobs with commits that are not landed)
- `Needs a decision` (failed or stopped jobs with commits that are not landed)
- coordinator tabs

Open groups replace individual member candidates with one line: `group <feature>: N member branches; the lead decides (limen group status <id>)`. Closed groups leave the inbox. Work outside groups keeps its ordinary candidate or decision row.

After `Needs a decision`, a section `Unlanded work (spawn refuses until each is continued or abandoned):` lists every finished job that holds unlanded work no landing, continuation or abandon resolved, whatever its age, migrated records included ([Finished jobs](jobs.md#finished-jobs)): a line `<id> · <state> · <n> changed files, <m> unlanded commits`, with ` · repo <repo>` after it for a job in a workspace repository, then `limen continue <id> "instruction"` and `limen abandon <id>` on a line each. It reads each worktree with `git --no-optional-locks status`, which refreshes no index. When no job holds unlanded work, the section is not shown.

After it, a section `Abandoned work (Limen keeps each branch until a person deletes it):` lists each `limen/abandon/<id>` branch of the project, `<branch> · <short commit>`, with ` · repo <repo>` for a branch of a workspace's child repository; it reads Git alone, so the branch stays listed after the daily retire of `limen seat sweep` moved the job's record. When there is no such branch, the section is not shown.

When a Limen hook in a coordinator's session refused a Pi event of the wrong shape, the process that refused writes the refusal into `.limen/refusals/<pid>-<start time>.json` of the project, the newest one of that process, and `limen status` shows one line `Coordinator process <pid>, <time>: a Limen hook refused Pi event <name>: <field> …` for each such file, with the message escaped as in a JSON string, so a newline shows as `\n` and no line is added. A file there that does not read, such as a directory, a link, an unreadable or damaged file or one with another name, is its own line `Coordinator process <pid>, time unknown: <the BAD_DATA message>` (`unknown` for a name that names no process), and the rest of the status prints; a `.limen/refusals` that is no folder, a link included, or that cannot be read is one such line, with `unknown` as its process. Pi showed the refusal only in that session's chat; the line goes when the seat sweep removes the file of a process that is gone, which it does for a regular file only, so a directory or a link there stays until it is removed by hand. A process whose start time cannot be read writes no file. `limen status` only reads the files. The older folder `.limen/coordinators/` of the cut seat rules is a leftover file.

`status --all` reports every record, also those older than 7 days, and under the summary prints `Jobs (N):` with one row for each job of the project, running jobs first, then the newest. The row is the compact format that tools read.

When the project has leftover files, a section `Leftover files (N); check them, then run limen init --drop-leftovers:` comes before the `Older:` line, or before `Coordinator tabs:` with `--all`, with one line `<path> (<feature>)` for each file. It lists each path that a cut feature left in the project (a file, a directory or a symlink), and each copy of a package prompt (`AGENTS.md`, `.agents/limen/worker.md`, `.agents/limen/reviewer.md`, `.agents/limen/communication.md`) that is byte-identical to the package's template, as `identical copy of the package's templates/<name>`. When the project has no leftover files, the section is not shown. The list only reads files; it removes nothing.

After the leftover files, `limen status` names the `LIMEN_*` variables of its own environment that Limen does not read: a section `Environment settings Limen no longer reads (N); remove them:` with one line `<name>: <what replaces it>` for each, such as `LIMEN_PREPARE: the spawn flag --prepare`, and for a name Limen never had `nothing (not a Limen name)`. A section `Environment variables read until a ticket replaces them (N):` lists each setting still read from the environment with `until <ticket>`: `LIMEN_WORKER_MODEL` (R-062), `LIMEN_COORDINATOR` (R-050), the six `LIMEN_GITHUB_*` names of the GitHub poller (R-059) and `LIMEN_PACKAGE` (R-049). The names Limen sets between its own processes and the knobs of the tests are not listed. A section with no name is not shown.

In a terminal, `show` shows the job for people. Through a pipe, it prints the compact format that tools read. The terminal alone selects the view; `LIMEN_VIEW` is no longer read. `NO_COLOR` removes the color. An ID or token that names no job exits 2 with the code `JOB_NOT_FOUND` and `limen status --all` in `next`. The old `jobs` command was split into `limen status --all` and `limen show <job>`: `jobs <id>` exits 2 and names `limen show <id>`, and every other form of it names `limen status --all`.

`limen show <id>` also shows `model`, the provider and model that the session's turns ran, and `tokens`: the number of turns, which counts the assistant messages of the job's own transcript, and the input, output, cache-read and cache-write totals of every entry of that transcript that carries a usage, compactions included, as `limen stats` counts them. When a turn ran a model other than the one spawn recorded in the job's route, the line shows both: `served … · requested …`. This informs; it does not block.

For a failed job, `limen show <id>` shows `failure <kind>`, the kind the code that detected the failure set ([Job states](jobs.md#job-states)), and for `quota` its reset time after it, `· resets <time>`, or `· resets unknown` when none was read.

A job in the start queue lists as running with the pulse `queued`, then its wait and the reason: the CPU and memory reading against the gate, and the number of jobs ahead. `limen seat queue` prints the gate, the current reading, and every waiting job of the seat in start order. It samples the load for about two seconds. The old top-level `queue` command was renamed: it exits 2 and names `limen seat queue`.

A job is starting while `limen spawn` still sets it up: the worktree and the launch. Its record has the state `starting` and the spawn's pid from the first moment. `show` and `status` list it as running with the pulse `starting`. A starting job whose spawn process is gone is `ORPHAN`. Spawn prints its text when it ends: the job ID after its start line, and its final line carries it in `ids.job` ([Exit codes and the final line](#exit-codes-and-the-final-line)); a spawn stopped before its end prints no ID, and `limen status` lists the job its record names. The job's wrapper then runs `--prepare` before the engine starts, and the job log records its result and its time; a job's start prunes nothing, since the daily prune of `limen seat sweep` removes the worktrees of finished jobs ([Land and clean up](#land-and-clean-up)). A prepare command has 5 minutes; a plant can change that (see [Limits](jobs.md#limits)). A setup failure after the record exists marks the job `failed`.

### Control running jobs

Correct or stop a running job, or subscribe to it.

```text
limen steer <id|token> | --running "correction"
limen stop <id|token> [reason]
limen watch <id|token> | --running
limen unwatch <id|token> | --all
```

### Land and clean up

Merge a job and close its ticket, or give up on a job and keep its work on a branch. Removing finished worktrees, retiring landed and abandoned jobs to the job archive and closing the leftover Herdr tabs of closed features are daily steps of `limen seat sweep` ([Seat sweep](#seat-sweep)), with no command of their own.

```text
limen land <id|token> [--onto BRANCH] [--yes] [--keep-open]
limen abandon <id|token>
```

`land` merges into the checkout of the plant even when another session has uncommitted files there. It leaves those files as they are. It refuses when a file the merge would change has uncommitted edits, or when the index holds staged changes. A merge that fails beside uncommitted files is aborted, so the checkout returns to its earlier state.

`land` asks for a confirm only when stdin is a terminal; `--yes` skips it there too. Right after the merge, `land` marks the job's record `landed` with the commit the merge left on the target and the time; a land run again, as for a worktree it kept, keeps that first marker. Then `land` deletes the job's local `limen/*` branch and the finished worktree that holds it. It keeps the branch while another job on that branch, such as a continuation, is still running, and prints why. It keeps the branch and the worktree while `git status` shows the worktree dirty, and prints `kept <worktree> (job <id>): unlanded work`, while a nested repository in it holds a commit that the project's object store lacks, and prints `kept <worktree> (job <id>): the nested repository <path> holds a commit that the project's repository lacks`, or while a registered worktree lies below it, and prints `kept <worktree> (job <id>): it holds the registered worktree <path>`.

`abandon` gives up on a finished job and keeps its work on the branch `limen/abandon/<id>`: a commit of the worktree's whole state, changed, deleted and untracked files, on top of the worktree's HEAD, or the tip of the job's own branch when its worktree is gone. It prints the branch and the commit, removes the worktree as prune does, only while the commit holds all of it and prune itself could remove it, and closes the job's Herdr tab. A worktree it keeps prints `kept <worktree> (job <id>): <cause>`: it changed after the commit, a nested repository holds commits or changes the commit does not, or a commit the project's object store lacks (which keeps the worktree from every later prune and land too), or names one in a branch, a tag, a stash or its reflog, it holds another registered worktree, Git locks it, or it is no worktree prune would remove. Once no worktree is left, it marks the job's record `abandoned`, which resolves the job's unlanded work; a kept worktree leaves the record unmarked. Ignored files go with the worktree, so it cannot be undone; run again, it finishes the steps that are left, and on a job its record marks `abandoned` it changes nothing and prints the marker's branch and commit. [Finished jobs](jobs.md#finished-jobs) lists its refusals.

The daily prune and `land` never remove the worktree or record of a job that is starting, running, or in an open group, nor a worktree made inside such a job's worktree, nor the worktree of a finished job whose scope still holds processes. Neither removes a worktree that `git status` shows dirty, whatever job names it, nor the worktree of a finished job that holds unlanded work, and the daily retire keeps such a job's record in `.limen/jobs/`, as it keeps every finished job without a marker. A running job keeps its worktree even when its process looks gone; the sweep's reap finalizes it first. `limen prune` and `limen close` exit 2 and name `limen seat sweep`, whose daily steps took their place ([Seat sweep](#seat-sweep)).

After the merge, `land` also closes the active tickets the job works on: the tickets its label, ID or `Ticket:` pointers name, or, when they name none, the feature that starts its commit subjects (`F946: …`). It is the close `ticket done` makes, under the same lock: each folder moves to `spec/features/done/YYYY-MM/` with a `landed` date, NOW and PROVEN in `spec/build.md` are regenerated, and both go in one commit, `Close FNNN: landed by <id>`. `--keep-open` keeps the tickets active while more slices remain. Before its merge, `land` refuses with `TICKETS_UNCOMMITTED` when the board or a ticket folder has uncommitted edits, or a file is in a folder a ticket moves to; its `next` is the same `land`, to run once the paths are committed or moved, since nothing has merged. A close that fails after the merge ends the land with the close's exit code and `next` `limen ticket done FNNN`: the lines of the merge, the marker and the branch stay, and the tickets stay active with nothing of their close written; a close that the checks before the merge passed but that refuses after it exits 3 with `STATE_CHANGED`. Only a close whose commit is on the branch while the checkout could not follow (`CHECKOUT_BEHIND`) has `next` null, since its tickets are closed.

### Tickets and the board

Close a ticket whose work landed another way, and show the board.

```text
limen ticket done FNNN [FNNN ...] [--on YYYY-MM-DD]
limen board [--write]
```

`ticket done` refuses before any folder moves: a number with no active ticket (`NO_ACTIVE_TICKET`), or a ticket folder or the board with uncommitted changes, or a file in a folder a ticket moves to (`TICKETS_UNCOMMITTED`). In a Git repository the close is one commit, built in a temporary index from the HEAD its checks read, so nothing in the checkout changes before the commit exists and the branch has moved to it. The project's `pre-commit`, `prepare-commit-msg` and `commit-msg` hooks run on that index as `git commit -m` runs them, `core.hooksPath` included; they see the working tree as it was before the close. A hook that rejects the commit exits 4 with `HOOK_REJECTED`, the end of its output (20 lines) and nothing written, and `next` is the same `ticket done`. The branch then moves from that HEAD alone, so a commit made on it meanwhile exits 3 with `STATE_CHANGED`, and that commit stays the tip. Only then does the checkout follow, as `git merge --ff-only` would: every other uncommitted or staged file stays, and a file of the close that changed after the checks is not overwritten; then the close exits 4 with `CHECKOUT_BEHIND`, `next` null, and a message that names the closing commit on the branch, the paths the checkout still holds from before it, and the files there that changed since the checks: move those aside, out of the checkout or to another name, and make no commit first, since a commit then would revert the close; then `git update-index -q --refresh` and `git read-tree -m -u <head> <commit>` finish it. Files git does not track in a ticket folder, ignored ones or one a hook made, stay in its old folder, and the close prints `kept <folder>: it holds files git does not track, which stay there`. In a Git repository it reads the jobs it will mark before its commit too, so a project with a job folder of an older Limen exits 4 with `NOT_MIGRATED`, and a finished job's worktree whose `git status` fails exits 4 with `GIT_FAILED`, each with nothing moved. After its commit it marks the record of each finished job whose label, ID, `Ticket:` pointers or commit subjects name a ticket it closed `landed`, with the closing commit and its date (`--on`, or the day), and prints `marked job <id> landed in <commit>`; a job of such a ticket that holds unlanded work stays unmarked, with the line `job <id> stays without a landed marker: it holds unlanded work (limen status)`. A review, a group member, a continued parent and a job with no commit get no marker. NOW and PROVEN in `spec/build.md` are generated from the feature lanes: NOW lists `active/`, PROVEN the last ten landed tickets and one count line per month folder. An archived done ticket counts in PROVEN by its close month, and a month line names `spec/features/archive.tsv` when the register holds some of that month's tickets. TRACK, NEXT, PARKED and DROPPED stay as the coordinator wrote them. `limen board` prints the board with each active ticket's running job, or its last job when none runs: failed, done but not landed, or landed. It lists running jobs that name no active ticket below NOW. `--write` rewrites NOW and PROVEN in the file.

**Ticket numbers.** `limen ticket new` takes one more than the highest F number in use. A number is in use when one of these names it: a ticket folder in any lane (`spec/features/<lane>/` or `spec/features/<lane>/<month>/`, `cancelled/` included), a row of `spec/features/archive.tsv`, a local `limen/*` branch, or a job label.

**Archive register.** A plant that moves closed tickets out of `spec/features/` records them in its tracked `spec/features/archive.tsv`. The first line names the tab-separated columns: `path`, `number`, `title`, `close_month`, `archive_date`, `last_commit`, `manifest_digest`; without that line, Limen reads the columns in this order. Limen reads `path`, `number`, `title` and `close_month`. `number` is `FNNN` or `NNN`. A row whose `path` ends in an `FNNN-slug` folder archives that ticket. A row with another path, such as a high-water row (`high-water`, then the highest number issued), only keeps its number in use. Every row's `number` stays in use for `ticket new`. `limen land` and `limen ticket check` refuse a new ticket whose number an archived ticket holds. The sweep's daily close of leftover Herdr tabs treats an archived ticket as closed.

### Map check and job activity

Check the architecture map with its tickets and board, or serve this project's job activity at `/activity.json` and `/events` ([Picture](picture.md)).

```text
limen picture build [--dir D] [--json F] [--strict]
limen picture serve [--port N]
```

A build that `--strict` refuses writes no `--json` file.

### Team groups

Start a group, and show the status of, publish, stop, or close it.

```text
limen group start FEATURE --team ENGINE:PROVIDER/MODEL:THINKING [--team …] [--rounds draft,critique,revise,final] [--workers N] [--timeout D] [--extension PATH ...] [--team-extension team-N=PATH ...] [--detached]
limen group status [GROUP-ID]
limen group publish [GROUP-ID] [--team team-N] "finding"
limen group stop|close [GROUP-ID]
```

`limen group wait` is for team members only ([Groups](groups.md)); the lead gets the group's result once and is refused it.

Each `--team` is one agent on its own route, for example `--team pi:pi-claude/claude-opus-5-5:high`; the teams are `team-1`, `team-2`, and so on, in flag order. `--rounds` defaults to `draft`, `--workers` to 0 and `--timeout` to 90m. Members get their group from their recorded membership. The group lead gives the group ID. For Pi, repeat `--extension PATH` for common extensions and `--team-extension team-N=PATH` for team-only additions. Common paths precede team paths; the recorded effective lists are inherited by members, reviews and worker continuations. See [Groups](groups.md).

### GitHub comments

Start a review or task job for one GitHub request, or give an answer without a job. The claim ID is the triggering comment ID, or `issue-<number>` when an issue body carries the request.

```text
limen github review <root> <claim-id> --engine E --provider P --model M --thinking T
limen github work <root> <claim-id> --engine E --provider P --model M --thinking T --task "instruction"
limen github resolve <root> <claim-id> <handoff-nonce> "no-job answer"
```

## Operator actions

You run these one time for each project or seat, or a scheduler runs them.

### Project setup

Create the project files, or set up a parent workspace for child repositories. The text of `limen init` ends with a `next:` line that names the next step, and says so when the repository has no commit yet; the final line follows it.

```text
limen init
limen init --drop-leftovers
limen workspace init
```

`limen init --drop-leftovers` removes the old `limen-*.ts` hook copies, with one `removed <path>` line each. Then it removes the files that `limen status` lists under `Leftover files`: a directory with its content, and a symlink without its target. It gives one `dropped <path> (<feature>)` line for each removal, and a failure prints the lines before it, so when a removal fails, every file already removed has its line. When there is nothing to remove, it prints `no leftover files`, so a second run prints `no leftover files` and exits 0. A prompt copy that differs from the package stays.

### Seat sweep

Run the seat sweep once, or install, remove or check the user timer that runs it every minute on the agents' account. A run goes over every registered project at once: it ends each running job whose wrapper is dead (its scope first, then the job as `failed`, kind `reaped`), ends the scope a finished job left with processes in it, resumes each job the subscription limit stopped, 5 minutes after the reset, on its recorded route, at most 3 times, and releases the wakes the limit kept from a coordinator's turn once they are due (see [Subscription limit](jobs.md#subscription-limit)), removes the refusal file under `.limen/refusals/` of a coordinator process that is gone, a regular file only (see [Inspect jobs](#inspect-jobs)), rings Herdr once for an end no coordinator heard of (see [Seat notifications](jobs.md#seat-notifications)), and, once a day per project, runs its daily steps (below); then it removes the start queue's dead or malformed entries, which `limen seat queue` only skips. It is the one reaper: `limen status`, `limen show` and the coordinator's hook show a dead job and never end it. A job record that does not read (`BAD_DATA`, or a folder an older Limen wrote, `NOT_MIGRATED`) and a step that fails are named with their reasons once every other job, step and project is done, one failure once per project, and the run exits with the worst class among them, with `limen seat sweep` in `next`; a run whose account's user manager has no cgroup folder names that (`NO_USER_MANAGER`) and does every other step. A run inside a job's scope refuses with `SWEEP_IN_JOB` before it writes anything, since it would signal the scope it runs in.

**Daily steps.** After a project's other steps, a run does its daily steps when the project's stamp `.limen/daily-sweep`, the time of its last daily steps that all succeeded, is absent or at least 24 hours old: the prune, the retire and the close of leftover Herdr tabs, in that order. Each step runs whether or not one before it failed; only when all three succeed does the run write the stamp and print `ran the daily steps of <root>`. A step that fails is named `<root> (daily <step>)` with its reason and writes no stamp, so the next minute's run does the daily steps again. A manual run does what the timer does. Every path and job name in the lines of the prune and the retire, and every tab id, job name and Herdr error text in the lines of the close of leftover tabs, has its control characters escaped as JSON writes them, so a name a job chose stays on its line. Nothing that Git does not hold elsewhere is deleted:

- The prune removes what Git holds elsewhere: the clean worktree of a finished job, whose tracked files are on its branch, and prints `pruned <path> (job <id>): <reason>`, with `job none` when no record names the path. It moves what Git does not hold into the archive instead, with one rename each, and prints `archived <path> to <folder> (job <id>): <reason>`: a record that never started whose spawner is gone, a folder of `.limen/jobs/` with no record, and a folder `.limen/.publishing-<id>` that a spawn's publication left, past its 10-minute grace with its spawner gone, each to `.limen/archive/<YYYY-MM>/<id>/` (the month of its start, else of the move), under the lock that every new job id takes and the job's own lock; and a folder of the worktree root that Git does not register and that holds no `.git`, to `.limen/archive/unregistered/<name>-<time>/`, whose name is no month, so no reader takes it for a job. It prints one line for each worktree it keeps because it holds unlanded work, `kept <worktree> (job <id>): unlanded work`, because a nested repository in it holds a commit that the project's object store lacks, `kept <worktree> (job <id>): the nested repository <path> holds a commit that the project's repository lacks` (whether or not its job is resolved), or because a registered worktree still lies below it, `kept <worktree> (job <id>): it holds the registered worktree <path>`. A gitlink counts only where a nested `.git` is there, and a candidate whose `HEAD` has no commit fails the step with `GIT_FAILED`, naming the worktree. It decides the deepest worktrees first, lists what it may remove, then reads the job records under the lock that publishing a job record also takes, so a job started during a prune keeps its worktree. It moves each removal out of reach in one rename and deletes it after the lock. A Git-locked worktree stays.
- The retire takes only a finished job whose record holds the `landed` or `abandoned` marker, at least 24 hours old, so the wakes and alerts of the job's end go out first, and that holds no unlanded work, never one the git graph alone calls landed: it deletes a landed job's `limen/*` branch when that holds no commit outside HEAD, moves the job's whole folder in one rename, under the job's own lock, to the job archive, `.limen/archive/<YYYY-MM>/<id>/`, and prints `retired <id> to .limen/archive/<YYYY-MM>/<id>`; it keeps every `limen/abandon/<id>` branch. It does not wait for a job's own lock: a job whose lock another process holds stays in `.limen/jobs/` for the next daily run, with the line `kept job <id> for the next daily retire: another process holds its lock`, and the step still succeeds. It prints the `kept` line for the worktree of each finished job that holds unlanded work, whose record it keeps; a `kept` line that the prune printed is not printed again. No Limen command deletes the archive.
- The close of leftover Herdr tabs takes every finished job whose features are all closed (`done/`, `dropped/` or `spec/features/archive.tsv`) and closes each tab it recorded (its log tab and its diff tab) that Herdr still lists with the job's label, within 10 seconds and with one retry, and prints `closed the leftover Herdr tab <tab> of job <id>`. A tab with another label stays, the coordinator's among them, and so does the tab of the pane a manual run comes from. A tab that does not close prints a line and the step is done: a close that fails says the job's log tells why, and a `tab get` that fails carries Herdr's error text, since nothing reached the log; with no Herdr, one line counts the tabs that stay open.

A job whose processes a run cannot end stays as it is, with a `reap: … not ended: …` line in its log, and its record counts the failed attempts in a row in `stuck` (`since`, `attempts`, `detail`); a run that ends them removes it. From the third attempt in a row the alerts send `stuck` and `limen status` lists the job under `Jobs the sweep cannot end`.

`--install` needs lingering: without the account's file in `/var/lib/systemd/linger/` it exits 4 with `NO_LINGER` and names `loginctl enable-linger <account>` for root. Otherwise it writes `limen-sweep.service` (a oneshot run of this package's `bin/limen seat sweep` under `/usr/bin/node`, with the PATH of the process that runs the install, where a resumed job finds `pi`, `node` and `herdr`, stopped after 300 s) and `limen-sweep.timer` (every minute) into `$XDG_CONFIG_HOME/systemd/user`, else `~/.config/systemd/user`, only when their text differs, verifies them with `systemd-analyze --user verify` (a failure puts the old files back and exits 4), reloads the user manager and enables the timer at once; a second install from the same PATH writes nothing, and one from another PATH rewrites the service. A process with no PATH exits 4 with `NO_PATH` before it writes. `--uninstall` disables the timer, removes both units and reloads; run again after a failed step, it disables and reloads again, so it finishes what the earlier run left. `--status` prints the lines `limen status` prints of the sweep, or `limen-sweep.timer is active`. The three flags exclude each other (`SWEEP_FLAGS`). `limen sweep` exits 2 and names `limen seat sweep`.

```text
limen seat sweep [--install|--uninstall|--status]
```

### GitHub

Connect projects to GitHub, diagnose the seat, and run one polling pass. The poller runs `deliver` to hand one claim to the live coordinator.

```text
limen github connect|disconnect|status|doctor
limen github ensure [registered-root]
limen github poll
limen github deliver <root> <claim-id> <handoff-nonce>
```

`github poll` runs as the isolated App user. It never runs as the worker account.
