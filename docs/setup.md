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
- **Hook stub:** It creates the package-hook stub `.pi/extensions/limen.ts`. A Herdr coordinator needs that stub for communication, wake, and steering, so in an existing project, run `limen init` again before you start one.
- **Old hook copies:** It deletes old `limen-*.ts` hook copies, so that they cannot load next to the stub.
- **Leftover files:** `limen status` lists the files that cut features left in the project and the prompt copies that are still the same as the package. `limen init --drop-leftovers` deletes the files in that list. It keeps a prompt copy that differs from the package.

### The coordinator session

The agent you talk to is the coordinator. Give it the task in plain language. It manages Limen jobs and reports the results in that session.

**Roles**

- Ordinary `limen spawn` starts workers and reviewers. It does not start a coordinator.
- Team groups have separate lead and hook requirements. Follow the [group setup](groups.md#prepare-and-start) before you use `limen group start`.

**Herdr layout**

- Use a Herdr space with the name of the plant (`limen`, or `alice limen`). Do not use a space with the name `workers` only.
- The coordinator gives its own tab the name of one stable subject (`chat settings`). Limen adds ` · N running` to that name while its jobs run.
- Worker tabs get their names from spawn labels (see [Job IDs and labels](jobs.md#job-ids-and-labels)).
- The inherited shop manual (`templates/agents.md`) has the same layout rules. A project `AGENTS.md` replaces it.

### Project skills

Put project skills in `.agents/skills/<name>/SKILL.md`. Pi also finds skills in `.pi/skills/<name>/SKILL.md` and in older flat files, `.pi/skills/<name>.md`.

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

1. Run `limen workspace init` one time in the parent.
2. List the children in `spec/workspace.md`.
3. Tell the coordinator which repository the work is for.

The coordinator gives exactly one `--repo` to each job. Tickets stay in the parent. Branches, worktrees, diffs, and review stay in the selected child.

## Project files

The installed `limen` package supplies the default shop manual, role prompts, speech register, and hooks. `limen init` creates only the files that the project owns:

```text
.agents/limen/styleguide.md           project coding practice
spec/vision.md                        durable product intent
spec/build.md                         TRACK / NOW / NEXT / PROVEN; NOW and PROVEN generated from the lanes
spec/features/                        planned, active, done, and dropped work
.pi/extensions/limen.ts               Pi stub: load hooks from the package
.limen/jobs/<id>/                     runtime evidence
```

### Overlays

Optional overlays replace a package default, one file at a time:

- `AGENTS.md`
- `.agents/limen/worker.md`
- `.agents/limen/reviewer.md`
- `.agents/limen/communication.md`

| File | Name | What happens |
|---|---|---|
| Same bytes as the package | Old copy | The coordinator names it. |
| Different bytes | Overlay | You can keep it, drop it, or edit it. **Never overwrite an overlay.** |

### Hooks

The communication hook puts the capability frame, the shop manual, the speech register, the vision, and the styleguide in the system prompt for each model call. The capability frame (`templates/capability.md`) tells every role that engineering time is abundant and the owner's attention is scarce; it comes from the package even when a project replaces the register. The board digest comes last, so a change to NOW or NEXT does not break the cached prefix.

A short note on each turn recalls the capability frame in one sentence and names the audience and the reply rules. The wake cue is in that note, not in the system prompt. After a write or an edit, the tool result repeats the rule that applies.

Every job also keeps a task note, checked once before the finish, and a project can add `.agents/limen/reminders.md` for every job. The [task-note experiment](../README.md#task-note-experiment-started-2026-10-22) describes both.
