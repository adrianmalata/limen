# Setup

[README](../README.md) · [Command reference](commands.md)

Install Limen, define the project, and ask an agent to do the work.

## Requirements

- **Operating system:** Linux. Limen supports no other operating system.
- **Tools:** Node.js 24 or later; Git with `git worktree list --porcelain -z` (Git 2.36 or later); `tar`; `ps`.
- **systemd:** a running systemd user instance for the account, so that `systemd-run --user --scope true` exits 0: every job runs in its own user scope. On a server, root keeps the instance running with lingering (`loginctl enable-linger <account>`).
- **Engine:** Pi 1.5.1 (`pi`) on `PATH`, with the bridge `@vanillagreen/pi-claude-bridge` 5.0.3 for Claude models.
- **Herdr:** 0.9.3, needed only when you run Limen inside a Herdr pane.
- **Check:** `limen init` and `limen workspace init` check these tools first. When one is missing, Git lacks the feature, or no user scope starts, the command exits with code 4 and names it. Limen records the versions on each job, but it does not yet refuse another version of Pi or the bridge.

## Install

### 1. Install Limen

You do this part, one time:

```bash
git clone https://github.com/overment/limen.git
cd limen
npm install
npm link
```

For the coordinator pane in Herdr, install the Pi integration:

```bash
herdr integration install pi
```

`npm link` puts that clone on `PATH`. The binary reads `hook/` and `templates/` from the directory next to it. Projects do not copy those files, so when you update the clone, every project on that computer gets the update. After `git pull` on the clone, `/reload` the coordinator.

### 2. Start each project

Open a terminal in the project's Git repository. Before you start a worker, the repository must have at least one commit.

```bash
cd /path/to/your-project
limen init
```

Before you assign work, define these two files:

- `spec/vision.md`: what the product should do, for whom, and within what scope.
- `.agents/limen/styleguide.md`: how to write and organize the code.

Start Pi in that directory with `pi`, or open an agent tab in Herdr with the project as its working directory. Describe the task to the agent in plain language, for example:

> Add a settings page. Follow the project vision and coding styleguide.

You can also ask the agent to help define the vision and styleguide before it changes code. Set the worker and reviewer model choices with the agent in `spec/build.md` (see [Models](#models)).

### What `limen init` does

- **Project files:** It creates the files that the project owns: the vision, the board, the feature lanes, and the styleguide (see [Project files](#project-files)). It does not overwrite existing project files.
- **Hook stub:** It creates the package-hook stub `.pi/extensions/limen.ts`. A Herdr coordinator needs that stub for communication and wake, and for the group hook when the group module is on (see [Modules](#modules)), so in an existing project, run `limen init` again before you start one. Steering no longer loads in a coordinator: it acts only in a job.
- **Old hook copies:** It deletes old `limen-*.ts` hook copies, so that they cannot load next to the stub.
- **Leftover files:** `limen status` lists the files that cut features left in the project, among them the project's own copies of the speech register and the role prompts, which nothing reads, and an `AGENTS.md` that is still the same as the package's coordinator manual. `limen init --drop-leftovers` deletes the files in that list. It keeps a changed `AGENTS.md`, which is the project's own context.

### Modules

Six optional modules are off by default: `github` (answers `@limen` mentions on GitHub pull requests), `group` (several agents on one ticket), `picture` (the architecture map check and the job activity feed), `workspace` (a folder outside Git with several Git repositories), `research` (researcher and judge jobs) and `quality` (the quality pass). The owner switches a module on in the project's `.agents/limen/limits.json`, with one boolean per module in the field `modules`:

```json
{ "modules": { "group": true } }
```

A module that is off adds no text to the context messages and loads no hook. Its commands, and a spawn or continuation of its roles (`researcher` and `judge` for research, `quality` for the quality pass, a group's team for groups), refuse with `MODULE_OFF`, which names this file and field. So do a spawn with `--repo` in a workspace, and a continuation or a keeper of a job in a workspace repository, while `workspace` is off, and `limen keeper --group` while `group` is off; each refuses before it writes anything. The seat's `github poll` does not refuse: it skips a project whose `github` switch is off and names it, while every other `limen github` command refuses. A name that is no module, or a value that is not `true` or `false`, is ignored, and the module stays off. A limits file that is there but cannot be read, such as a folder at its path or a file the account may not read, is no missing file: a command ends with `LIMITS_UNREADABLE` (exit 4) naming the file, a running job ends failed, kind `internal`, and `github poll` names that project as failed. `limen --help` marks each module `[on]` or `[off]` for the project at the working directory, and `limen migrate --dry-run` lists the modules a project uses.

When a switch takes effect:

- A command reads the file at each use, so it follows a switch at once.
- The specs reminder after an edit under `spec/` reads the switches at each tool result, so it follows a switch at once too.
- The set of hooks follows it at the coordinator's next `/reload` or new session.
- The context message is fixed for a session, so its module text changes only in a new session.

Switch `group` off only while no group run is open: the commands of an open run refuse once the module is off, and its members keep their hooks.

### The coordinator session

The agent you talk to is the coordinator. Give it the task in plain language. It manages Limen jobs and reports the results in that session.

**Roles**

- Ordinary `limen spawn` starts workers and reviewers. It does not start a coordinator.
- Team groups have separate lead and hook requirements. Follow the [group setup](groups.md#prepare-and-start) before you use `limen group start`.

**Herdr layout**

- Use a Herdr space with the name of the plant (`limen`, or `alice limen`). Do not use a space with the name `workers` only.
- The coordinator gives its own tab the name of one stable subject (`chat settings`). Limen adds ` · N running` to that name while its jobs run.
- Worker tabs get their names from spawn labels (see [Job IDs and labels](jobs.md#job-ids-and-labels)).
- The coordinator manual (`templates/manual.md`) has the same layout rules. It always comes from the package: a project `AGENTS.md` is project context beside it, never in its place.

### Project skills

Jobs load no skill a project adds: each job's engine runs with `--no-skills`, and a role loads only the skills its entry in the role table (`src/runtime/roles.ts`) names, which no role does now. Pi's `--no-skills` still loads the skills that a package given with `--extension` declares; the extensions Limen selects itself, its hooks and the bridge, declare none, so only a package you select with `--extension` can bring a skill into a job (see Pi extensions in [Start and continue jobs](commands.md#start-and-continue-jobs)). The coordinator session, which you start by hand, still loads what Pi finds for it, such as `.agents/skills/<name>/SKILL.md`, `.pi/skills/<name>/SKILL.md` and older flat files, `.pi/skills/<name>.md`, in a project Pi trusts.

## Models

Use this reference when you need to set model choices or run commands yourself.

Project choices are in `spec/build.md`. The board records the engine, provider, model, and reasoning level for each role, and who reviews. The coordinator reads those choices and passes them to the CLI as command flags. The CLI selects settings from flags and package defaults; an environment variable selects none of them, except `LIMEN_WORKER_MODEL` for a continuation (below). A newer explicit instruction from the owner has priority over the board. Replace the placeholders in the commands with the project choices.

### Package fallbacks

The coordinator must pass the board choices explicitly. Package fallbacks apply when command flags do not select a setting.

**Engine.** Every job runs Pi, the `pi` binary on the seat. `limen spawn` requires `--engine pi`, with `--provider`, `--model` and `--thinking`, and refuses a spawn without one of them, or with another engine, before a job exists. Old job records without an engine stay on Pi. A continuation keeps its parent's engine, and refuses a parent recorded with a removed engine.

**Model.** `limen spawn` requires `--model` and has no fallback. Only `limen continue` without `--model` falls back, until routes come from an owner file: first to `LIMEN_WORKER_MODEL`, then to the built-in `openai-codex/gpt-6-astra:high`.

**The `pi-claude` bridge.** A `pi-claude` model runs on the Claude Code bridge, which Limen names with `--extension`, because jobs otherwise start with `--no-extensions`. Pi loads the `pi-claude-bridge` package that `pi install` put under `~/.pi/agent/npm/node_modules` (scoped or not), and takes `--provider pi-claude --model claude-opus-5-5` or `--model pi-claude/claude-opus-5-5` as given. `spawn`, `continue` and `group start` refuse a missing bridge before any job exists. Spawn and continue run no `pi auth check`; `LIMEN_PREFLIGHT` is no longer read.

**Auth.** Pi keeps its auth store in `~/.pi`; authenticate Pi before the first job. Limen does not change Pi's settings or credentials.

### Personal model routes and Pi extensions

An owner can describe an approved model route in their active personal coordinator instructions or a session handoff: the request name, exact engine/provider/model/thinking choices, and trusted local extension paths. Keep personal paths outside shared project Git. Limen does not parse aliases, scan installed packages, or choose a route from installation alone; the one package it looks up is the `pi-claude` bridge above, by its fixed name. Resolve conflicts with project policy before launching; do not silently substitute an engine, provider or model.

For a Pi worker, pass each selected path explicitly:

```text
limen spawn --engine pi --provider <provider> --model <model> --thinking <level> \
  --extension /path/to/trusted-entry.ts --label "what this changes" "instruction"
```

`--extension` accepts local files and package directories. Limen does not install or import them; Pi loads them. A directory can expose several extensions and other package resources, so prefer the exact entry file when that is the intended selection. Ambient extensions stay disabled. See [command details](commands.md#start-and-continue-jobs) for path rules and continuation replacement.

Extensions run with the worker process's permissions and can read files, credentials and session data. Path validation does not prove API compatibility, provider availability, instruction forwarding or successful inference. Keep installation, native model-catalog registration and a successful worker check as separate claims. Limen runs no `pi auth check` before a job (`LIMEN_PREFLIGHT` is no longer read), so an extension-only provider is first checked by the job itself. For native Pi groups, the owner selects common or team-only extensions at `group start`; members inherit the fixed team lists. See [group selection](groups.md#prepare-and-start). Ordinary selections do not automatically propagate to GitHub launches or native subagents.

### Start a coordinator in a Herdr pane

To start a coordinator in an existing Herdr pane, use a shell prompt with the project as the working directory:

```bash
herdr agent start limen-peer --kind <engine> --pane <pane-id> -- \
  --provider <provider> --model <model> --thinking <level>
```

Herdr sends on the arguments after `--`, but Herdr does not select the model for Limen. Do not depend on old Pi project settings or a global default model.

### Start a worker

For an ordinary worker:

```bash
limen spawn --engine <engine> \
  --provider <provider> --model <model> --thinking <level> \
  --label "what this changes · FNNN" 'Implement FNNN: <outcome>. Ticket: spec/features/active/FNNN-slug/ticket.md'
```

This job is detached, also in Herdr: a log-tail tab, a 90-minute timeout (change it with `--timeout`), a tool-call cap, and its own systemd user scope, whose every process ends with the job. To correct a running job, use `limen steer`; to give a finished one more work, use `limen continue`. `--provider`, `--model`, and `--thinking` go to the selected engine as separate flag and value pairs. `limen continue` accepts the same flags.

## Adjacent-repository workspaces

A parent directory that is not a Git repository can hold several independent Git repositories as children.

1. Switch the workspace module on in the parent: write `.agents/limen/limits.json` there with `{ "modules": { "workspace": true } }` ([Modules](#modules)). Until then `limen workspace init` refuses with `MODULE_OFF`.
2. Run `limen workspace init` one time in the parent.
3. List the children in `spec/workspace.md`.
4. Tell the coordinator which repository the work is for.

The coordinator gives exactly one `--repo` to each job. Tickets stay in the parent. Branches, worktrees, diffs, and review stay in the selected child.

## Project files

The installed `limen` package supplies the coordinator manual, the role prompts, the speech registers, and the hooks; no project file replaces them. `limen init` creates only the files that the project owns:

```text
.agents/limen/styleguide.md           project coding practice
spec/vision.md                        durable product intent
spec/build.md                         TRACK / NOW / NEXT / PROVEN; NOW and PROVEN generated from the lanes
spec/features/                        planned, active, done, and dropped work
.pi/extensions/limen.ts               Pi stub: load hooks from the package
.limen/jobs/<id>/                     runtime evidence
```

### Hooks

Limen's standing text reaches the model in one context message per session, a hidden Pi custom message of type `limen-context`, because the Claude bridge does not forward Pi's system prompt. Every Limen text in it comes from the package. The speech register has three parts, one per audience: the agent register (`templates/registers/agent.md`) for every role, the specs register (`templates/registers/specs.md`) for the roles that write tickets, and the owner register (`templates/registers/owner.md`) for the coordinator, the one role that talks to the owner. For the coordinator the message holds the capability frame, the coordinator manual, the agent, specs and owner registers, the vision, and the styleguide; for a job, the capability frame, the role's prompt, the agent register (the keeper's also the specs register), a line that points at `spec/vision.md` when the project has one, and the styleguide. A job whose Claude bridge runs isolated, and so forwards no `AGENTS.md`, gets the project's `AGENTS.md` as the last part of its message; no job runs the bridge isolated yet. A package text that is missing is a broken install: the job's spawn or the coordinator's session start fails. The capability frame (`templates/capability.md`) tells every role that engineering time is abundant and the owner's attention is scarce. The communication hook sends the message once, when the session starts, before its first prompt and with no turn of its own, and again only after a compaction has summarised it away; a session that already holds one, after `/reload` or in a continued job, gets no second copy. The message does not change during the session, so its cached prefix stays: a change of the vision or the styleguide reaches the next session. A job's message is built when the job is published and saved as `context.md` in the job's folder. The board digest is not in it.

A short note on each turn, a hidden Pi custom message of type `limen-turn-cue`, repeats no register section: its audience line names the audience and carries the language of the reply that the registers' rule names (for the coordinator the language of the owner's last message, for a job plain technical English), then come the lines that apply (that the last turn failed and why, a job's ticket, the file the last turn edited or wrote, and in the coordinator a board over 120 lines), and last the one sentence of the capability file's own `## Cue` section, apart from its `## Frame`, which the context message holds. A wake gets the same note as a message from the owner. A tool result carries the text of the guidance that applies to what the call wrote, with one line that names the file and its lines: after an edit of code, the styleguide sections for that file; after an edit under `spec/`, the `## Specs` section of the specs register, for the roles whose message holds it; and when a ticket in `spec/features/planned/` is created or edited, by a write, an edit, `limen ticket new` or a shell command, the vision, in the coordinator and in jobs. `limen spawn` and `git merge` bring no vision. Each section comes once until a compaction or a new session start, such as `/reload`, cut at 1000 lines with a notice.

A job's first `finish` call ends it: its handoff becomes the job's result, and the session exits. A job's first prompt gets the same turn note as every other prompt, and a steer reaches the model as it was sent. Nothing reads a project's `.agents/limen/reminders.md`; `limen status` lists it as a leftover file.
