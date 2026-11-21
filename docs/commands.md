# Command reference

[README](../README.md) · [Setup](setup.md) · [Jobs](jobs.md)

The coordinator runs job commands. The operator runs setup commands. Run `limen --help` for the installed command list. Run `limen <command> --help`, for example `limen land --help`, for one command's usage line, its flags and an example, and `limen <group> --help`, for example `limen picture --help`, for the lines of a group.

Where the reference shows `<id|token>`, a command takes the job's full ID or its token, the 8 hexadecimal characters that end the ID. Any other form, such as a label, a label prefix or a shorter suffix, exits 2 (`JOB_NOT_EXACT`) with the jobs it may mean in the message; a token that several IDs share exits 2 (`JOB_TOKEN_SHARED`), and so does an ID or token that names no job (`JOB_NOT_FOUND`). A job whose ID ends in 4 hexadecimal characters, as before 2026-08-14, or whose token another ID shares, takes only its full ID. When a reference is refused, `next` is the same command with the token of the one job the reference may mean (its full ID when the job takes only that), or `limen status --all` when it may mean several jobs or none.

## Exit codes and the final line

Every command ends with one line of JSON, its final line, after the text for people. After a success the line ends stdout; after a failure it ends stderr, after the message. A command prints all of its text when it ends, its diagnostics on stderr and the rest on stdout, the text it gave before a failure too; only `limen picture serve`, which serves until it is stopped, prints while it runs. In a terminal, `limen land`'s confirm question carries its notes, the uncommitted-files note, the ticket check's warn lines and the test-line cap line, written before the answer. The commands that later tickets move or cut (`prune`, `sweep`, `rule` and its subcommands, `close`, `keeper`, `group wait`) still print as they go until those tickets move them. The exit code is the class:

| Exit code | `class` | Meaning |
|---|---|---|
| 0 | `ok` | success, also "nothing to do"; `group wait` at its time limit, with the same call in `next` |
| 1 | `refused` | a condition that Limen checks is not met; a removed engine or role that a job record names (`REMOVED`) |
| 2 | `usage` | an unknown command (`UNKNOWN_COMMAND`); words that the shared parser refuses (`BAD_ARGUMENT`): an unknown flag, a flag without its value or given twice, a missing required flag, a missing or an extra argument; a removed command, flag, engine or role on the command line (`REMOVED`) |
| 3 | `transient` | safe to retry: `github poll` after a failed request, HTTP 429, a 5xx, or a 403 that is a rate limit (`x-ratelimit-remaining: 0` or a `retry-after` header), with `limen github poll` in `next` and, when GitHub gives one, the time of a retry on the project's line (from `retry-after`, else from `x-ratelimit-reset` when no request remains); a lock still held after its 60-second wait (`LOCK_TIMEOUT`), whose message names the lock file and its owner |
| 4 | `environment` | `github poll` with a missing or invalid setting, projects file or credential, HTTP 401 or any other 403; a Node.js older than 24; a lock that something outside Limen removed or replaced while a command held it (`LOCK_LOST`) |
| 5 | `internal` | an unexpected exception, whose stack comes before the final line; a command that returns an `ids` key its registry entry does not declare (`UNDECLARED_IDS`) |

A failure that has no class of its own, a missing tool such as git among them, exits 1 with the code `UNTYPED`.

The line has the fields `class`, `code` and `next` in this order, then `ids` when the command names what it created:

- `code` is `null` on success. On a failure it is an upper-case identifier, such as `UNKNOWN_COMMAND`, `BAD_ARGUMENT`, `REMOVED` or `TICKET_CHECK_FAILED`; a refusal that has no identifier of its own has `UNTYPED`, and an unexpected exception has `INTERNAL`.
- `next` is a Limen command with concrete values, such as the branch or the group ID, or `null` when no command follows; it is never prose or a placeholder, and what to do in words is on the text line before the final line. After `BAD_ARGUMENT` it is `limen <command> --help`, and the message has two lines: what is wrong, then the command's usage line. After `TICKET_CHECK_FAILED` and `PICTURE_INVALID` it is the same check again (`limen ticket check <branch>`, `limen picture build --strict` with the `--dir` given), after the line that says to fix what is listed above. After `REMOVED` it is the command that replaced the removed name when that is a fixed command or one built from the words given: `limen picture build` for `picture tick`, `limen status` for `picture watch`, `limen seat queue` for `queue`, `limen group status` with the group ID given for `group status --json`, and `limen show <job>` or `limen status --all` for `jobs`; every other removed name has `null`, and its line says what to do instead. `UNTYPED`, `INTERNAL` and a success with no next step have `null`.
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
  limen board [--write]
      the board with NOW and PROVEN; --write rewrites them in spec/build.md
  limen prune [--retire] [--dry-run]
      remove finished worktrees; --retire deletes records of landed jobs
  limen migrate [--dry-run]
      move job records an older Limen wrote into record.json; --dry-run writes nothing

Tickets: files under spec/features/
  limen ticket new "what becomes true" [--lane planned|active] [--touches <ids>]
                                             write a ticket with the next free number
  limen ticket check [<branch>]
      the ticket check land runs, for the tickets a branch changes
  limen ticket done <FNNN> … [--on <date>]   close a ticket that landed without limen land
  limen close <FNNN>                         close the ticket's Herdr tabs
  limen keeper <ticket> --engine <engine> --provider <provider> --model <model> --thinking <level> …
      a short job fixes the ticket, board and map links after the work

Seat: all projects on this machine
  limen seat queue                           the start queue and its CPU and memory reading
  limen sweep [--install] [--uninstall]
      reap dead jobs in every project and notify about jobs nobody heard of
  limen rule                                 the seat-wide rules that hold now
  limen rule set <name> --until <time> [--start-priority 1|2|3] "text"
                                             a rule for every coordinator on this machine
  limen rule end <name> ["reason"]           end a rule now

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

Each line names who runs the command: the GitHub poller, a rule's timer, team members and team jobs, and the coordinator, which runs `github review`, `work` and `resolve` when a GitHub claim's prompt names them. `limen --help` does not list them, and `limen <command> --help` shows each. Generated from the command registry, like the list above.

<!-- registry:internal:begin -->
```text
limen rule timer <folder> <version>
      end one version of a rule once, at its end time
      run by the detached timer that rule set starts, or a later command when that timer died
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

**Detached.** Every job runs detached, under a wrapper with the limits of [Limits](jobs.md#limits); inside Herdr it also gets a tab that follows its log. `--detached` is accepted and changes nothing.

**Start queue.** A detached job waits in the seat's start queue until the machine has room for it; see [Start queue](jobs.md#start-queue). Spawn and continue then print `queued <label>: <reading>, N ahead` before the ID. `--priority` sets the queue order: 1 is the most urgent, 2 is the default, and `continue` keeps the parent's priority unless it gets its own flag. The job's record holds it in `priority`. Spawn when the work is ready; Limen starts the job and tells its coordinator.

Spawn requires `--engine`, `--provider`, `--model` and `--thinking`: without one of them it exits 2 and names every missing flag, before a job exists. `continue` takes them as options and keeps the parent's engine.

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

`status --all` reports every record, also those older than 7 days, and under the summary prints `Jobs (N):` with one row for each job of the project, running jobs first, then the newest. The row is the compact format that tools read.

When the project has leftover files, a section `Leftover files (N); check them, then run limen init --drop-leftovers:` comes before the `Older:` line, or before `Coordinator tabs:` with `--all`, with one line `<path> (<feature>)` for each file. It lists each path that a cut feature left in the project (a file, a directory or a symlink), and each copy of a package prompt (`AGENTS.md`, `.agents/limen/worker.md`, `.agents/limen/reviewer.md`, `.agents/limen/communication.md`) that is byte-identical to the package's template, as `identical copy of the package's templates/<name>`. When the project has no leftover files, the section is not shown. The list only reads files; it removes nothing.

After the leftover files, `limen status` names the `LIMEN_*` variables of its own environment that Limen does not read: a section `Environment settings Limen no longer reads (N); remove them:` with one line `<name>: <what replaces it>` for each, such as `LIMEN_PREPARE: the spawn flag --prepare`, and for a name Limen never had `nothing (not a Limen name)`. A section `Environment variables read until a ticket replaces them (N):` lists each setting still read from the environment with `until <ticket>`: `LIMEN_WORKER_MODEL` (R-062), `LIMEN_COORDINATOR` (R-050), the six `LIMEN_GITHUB_*` names of the GitHub poller (R-059) and `LIMEN_PACKAGE` (R-049). The names Limen sets between its own processes and the knobs of the tests are not listed. A section with no name is not shown.

In a terminal, `show` shows the job for people. Through a pipe, it prints the compact format that tools read. The terminal alone selects the view; `LIMEN_VIEW` is no longer read. `NO_COLOR` removes the color. An ID or token that names no job exits 2 with the code `JOB_NOT_FOUND` and `limen status --all` in `next`. The old `jobs` command was split into `limen status --all` and `limen show <job>`: `jobs <id>` exits 2 and names `limen show <id>`, and every other form of it names `limen status --all`.

`limen show <id>` also shows `model`, the provider and model that the session's turns ran, and `tokens`, the turns and the input, output, cache-read and cache-write totals of that job's own turns. When a turn ran a model other than the one spawn recorded in the job's route, the line shows both: `served … · requested …`. This informs; it does not block.

A job in the start queue lists as running with the pulse `queued`, then its wait and the reason: the CPU and memory reading against the gate, or each rule that holds its priority with the rule's end, and the number of jobs ahead. `limen seat queue` prints the gate, the current reading, and every waiting job of the seat in start order, each held job with the rules that hold it. It samples the load for about two seconds. The old top-level `queue` command was renamed: it exits 2 and names `limen seat queue`.

A job is starting while `limen spawn` still sets it up: the worktree and the launch. Its record has the state `starting` and the spawn's pid from the first moment. `show` and `status` list it as running with the pulse `starting`. A starting job whose spawn process is gone is `ORPHAN`. Spawn prints its text when it ends: the job ID after its start line, and its final line carries it in `ids.job` ([Exit codes and the final line](#exit-codes-and-the-final-line)); a spawn stopped before its end prints no ID, and `limen status` lists the job its record names. The job's wrapper then prunes finished worktrees and runs `--prepare` before the engine starts; the job log records each result and its time. A prepare command has 5 minutes; a plant can change that (see [Limits](jobs.md#limits)). A setup failure after the record exists marks the job `failed`.

### Control running jobs

Correct or stop a running job, or subscribe to it.

```text
limen steer <id|token> | --running "correction"
limen stop <id|token> [reason]
limen watch <id|token> | --running
limen unwatch <id|token> | --all
```

### Land and clean up

Merge a job and close its ticket, close the Herdr tabs of a feature, and remove finished worktrees or records.

```text
limen land <id|token> [--onto BRANCH] [--yes] [--keep-open]
limen close <FNNN>
limen prune [--retire [--dry-run]]
```

`land` merges into the checkout of the plant even when another session has uncommitted files there. It leaves those files as they are. It refuses when a file the merge would change has uncommitted edits, or when the index holds staged changes. A merge that fails beside uncommitted files is aborted, so the checkout returns to its earlier state.

`land` asks for a confirm only when stdin is a terminal; `--yes` skips it there too. After the merge, `land` deletes the job's local `limen/*` branch and the finished worktree that holds it. It keeps the branch while another job on that branch, such as a continuation, is still running, and prints why.

`prune` prints one line for each worktree, leftover directory, or record that never started that it removes: `pruned <path> (job <id>): <reason>`, with `job none` when no record names the path. The prune that a new job runs writes the same lines to its own log and to the log of the job whose worktree went.

Prune and `land` never remove the worktree or record of a job that is starting, running, or in an open group, nor a worktree made inside such a job's worktree. A running job keeps its worktree even when its process looks gone; `limen sweep` finalizes it first. Prune lists what it may remove, then reads the job records under the lock that publishing a job record also takes, so a job started during a prune keeps its worktree. It moves each removal out of reach in one rename and deletes it after the lock. A Git-locked worktree stays.

After the merge, `land` also closes the active tickets the job works on: the tickets its label, ID or `Ticket:` pointers name, or, when they name none, the feature that starts its commit subjects (`F946: …`). Each folder moves to `spec/features/done/YYYY-MM/` with a `landed` date, NOW and PROVEN in `spec/build.md` are regenerated, and both go in one commit, `Close FNNN: landed by <id>`. `--keep-open` keeps the tickets active while more slices remain. When the board or a ticket folder has uncommitted edits, the tickets stay active and `land` says so.

### Tickets and the board

Close a ticket whose work landed another way, and show the board.

```text
limen ticket done FNNN [FNNN ...] [--on YYYY-MM-DD]
limen board [--write]
```

NOW and PROVEN in `spec/build.md` are generated from the feature lanes: NOW lists `active/`, PROVEN the last ten landed tickets and one count line per month folder. An archived done ticket counts in PROVEN by its close month, and a month line names `spec/features/archive.tsv` when the register holds some of that month's tickets. TRACK, NEXT, PARKED and DROPPED stay as the coordinator wrote them. `limen board` prints the board with each active ticket's running job, or its last job when none runs: failed, done but not landed, or landed. It lists running jobs that name no active ticket below NOW. `--write` rewrites NOW and PROVEN in the file.

**Ticket numbers.** `limen ticket new` takes one more than the highest F number in use. A number is in use when one of these names it: a ticket folder in any lane (`spec/features/<lane>/` or `spec/features/<lane>/<month>/`, `cancelled/` included), a row of `spec/features/archive.tsv`, a local `limen/*` branch, or a job label.

**Archive register.** A plant that moves closed tickets out of `spec/features/` records them in its tracked `spec/features/archive.tsv`. The first line names the tab-separated columns: `path`, `number`, `title`, `close_month`, `archive_date`, `last_commit`, `manifest_digest`; without that line, Limen reads the columns in this order. Limen reads `path`, `number`, `title` and `close_month`. `number` is `FNNN` or `NNN`. A row whose `path` ends in an `FNNN-slug` folder archives that ticket. A row with another path, such as a high-water row (`high-water`, then the highest number issued), only keeps its number in use. Every row's `number` stays in use for `ticket new`. `limen land` and `limen ticket check` refuse a new ticket whose number an archived ticket holds. `limen close` treats an archived ticket as closed.

### Seat-wide rules

Give every coordinator on the seat one rule until a time, change it, end it, or list the rules that hold.

```text
limen rule
limen rule set NAME --until 90m|12h|3d|"YYYY-MM-DD HH:MM"|ISO [--start-priority 1|2|3] "text"
limen rule end NAME [reason]
```

A rule is one record per name in the seat folder (`~/.limen/rules/NAME/` of the agents' account): the text, the end time, who set it, the start priority, and one receipt per pinged tab. `--until` takes a duration, a local date and time, or an ISO time with a zone. Setting a name that holds is a change. A set, a change and an end each send one `herdr agent prompt` to every live coordinator tab: a registration under `<project>/.limen/coordinators/` in a project of the seat registry, with a live process and no shutdown mark, the newest one on each pane. The pane that ran the command is one of them. A text that may have reached a pane is never sent again. A detached timer ends the rule once at its end time and pings every live tab with what the rule held. When that timer died, the next `limen` command run where Herdr is reachable starts a new one. A rule that holds is shown in each coordinator's turn context and at the top of `limen board`; it never enters `spec/build.md`. While a rule with `--start-priority N` holds, the start queue starts only detached jobs at priority N or more urgent; see [Priority budget](jobs.md#start-queue).

### Map check and job activity

Check the architecture map with its tickets and board, or serve this project's job activity at `/activity.json` and `/events` ([Picture](picture.md)).

```text
limen picture build [--dir D] [--json F] [--strict]
limen picture serve [--port N]
```

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

Run the seat sweep (see [Seat notifications](jobs.md#seat-notifications)), or install or remove it. Each pass also removes the registration under `.limen/coordinators/` of a coordinator whose process died, so that folder does not grow.

```text
limen sweep [--install|--uninstall]
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
