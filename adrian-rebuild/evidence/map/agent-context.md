<!-- PL: Plik mapuje, co trafia do kontekstu każdej roli agenta Limena (koordynator, worker, reviewer, judge, keeper, scout, researcher, quality, picture, zespoły i workerzy grupy, lider grupy, kontynuacje) i w którym momencie: prompt systemowy, ukryta wiadomość na każdy prompt, zdarzenia (wake, steer, finish, kompakcja) oraz dopiski do wyników narzędzi. Powstał jako opisowa inwentaryzacja (nie audyt) przy tagu rebuild-base (3b5edd7), żeby zasilić skrypt mierzący kontekst — każda pozycja ma źródło file:line, warunek i przepis na odtworzenie dokładnego tekstu. Stan: kompletny dla zakresu zlecenia (hook/, templates/, .pi/.omp/.agents, docs/seat, kod spawn/continue/engine); zachowanie samego silnika Pi/OMP (prompt bazowy, skille, ładowanie AGENTS.md, semantyka zdarzeń) oznaczono jako „outside repo”. -->

# Agent context map at `rebuild-base`

Descriptive inventory of what enters each Limen agent's model context and when. All paths are repo-relative; `file:line` refers to `rebuild-base` (identical to HEAD outside `adrian-rebuild/`).

**Conventions used below**

- **pkg** = `packageRoot()` = `$LIMEN_PACKAGE` or the repo root (`src/project/inherit.ts:11-13`). **root** = `$LIMEN_CONTEXT_ROOT` (jobs) or the session cwd (coordinator) (`hook/communication.ts:81`).
- **BAS** = the engine's `before_agent_start` event, which the communication hook handles (`hook/communication.ts:80-106`). The repo assumes that it fires once per prompt submitted to the engine (human message, wake, first task, continuation) and that `event.systemPrompt` is the un-augmented base each time. The exact semantics are **outside repo** (Pi/OMP extension API). The code's own statement is `hook/communication.ts:70-72`: "Stable guidance rides the system prompt once per call. The per-turn note is a short cue."
- **boundText(text, path, label)** = `## <label> (<path>)\n` + the first 1000 lines after trimming blank edge lines, plus `[<path> truncated to 1000 of N lines; …]` when longer (`hook/communication.ts:316-327, 663-672`).
- **inheritFile(root, P, T)** = `<root>/P` if it exists (shown path `P`), else `pkg/T` (shown path `limen/T`) (`src/project/inherit.ts:48-62`).
- **Recipe R1 (exact Limen block, offline):** import `hook/communication.ts` default export, call it with a stub `{ on(event, handler) }`, then call the captured `before_agent_start` handler with `({ prompt, systemPrompt: <preamble or ""> }, { cwd })`. Set env `LIMEN_PACKAGE`, and for jobs also `LIMEN_JOB=1`, `LIMEN_JOB_ID`, `LIMEN_CONTEXT_ROOT`. Result `.systemPrompt` = base + `\n\n` + Limen system block. Result `.message.content` = hidden cue (+ noteStart on the first call per hook instance). `test/fake-engine.mjs:119-122` does exactly this and writes `fake-system.txt` / `fake-context.txt`. Side effects: it runs `jg --help` once per PATH (`hook/communication.ts:197-207`), it may run `git log/show` in pkg for drift (`src/project/inherit.ts:127-168`), and it reads the seat rules dir (`src/project/seat-rules.ts:66-77`).
- **R2 (tool-result reminders):** call the captured `tool_result` handler with a synthetic `{ toolName, input, content, isError:false }`. It returns `{ content }` with the reminder appended (`hook/communication.ts:124-143`).

## 0. Session assembly (shared mechanics)

| Step | Detail | Source |
|---|---|---|
| Role preamble file | `<root>/.agents/limen/<role>.md`, else `pkg/templates/<role>.md`, else error | `src/commands/spawn.ts:75-85` |
| Role choice | `--review` → `reviewer`; else group role (`coordinator` for a team job, `worker` for a team's worker); else `--role`; else `worker` | `src/commands/spawn.ts:98-104, 316` |
| `--role coordinator`/`lead` outside a group | refused | `src/commands/spawn.ts:637-641` |
| Engine argv | `--mode json` (detached only), `--approve` (Pi) / `--auto-approve` (OMP), `--no-extensions`, `--session-dir <jobDir>/session`, `--name "limen: <label>"` (Pi), `--no-title` (OMP), `--config <skills-config.yml>` (OMP), `--append-system-prompt <preamble>`, `--extension …`, `--provider/--model/--thinking` (when set), then `--continue <v>` or `@<taskFile>` | `src/runtime/engine.ts:227-280` |
| Detached extension list | `hook/finish.ts`, `hook/steering.ts`, `hook/communication.ts`, `hook/group-peer.ts` (group member only), `extensions.json` entries, pi-claude-bridge (bridged route) | `src/runtime/wrapper.ts:173-192`; `src/runtime/engine.ts:249-264, 306-315` |
| Hosted extension list | `hook/hosted.ts`, `finish`, `steering`, `communication`, `group-peer` (member only), `extensions.json`, bridge, plus Herdr state extension(s) from `~/.<engine>/agent/extensions/*.ts` that carry `// HERDR_INTEGRATION_ID=<engine>` | `src/runtime/supervisor.ts:366-386`; `src/runtime/engine.ts:254, 317-328` |
| Preamble value | detached: file **text** (`readFile`) | `src/runtime/wrapper.ts:68, 79, 178` |
| | hosted: the **path** string from `LIMEN_PREAMBLE` | `src/runtime/supervisor.ts:371`; `src/commands/spawn.ts:319, 568` |
| Coordinator extensions | project stub `.pi/extensions/limen.ts` or `.omp/extensions/limen.ts` (byte-identical to `templates/limen-extension.ts`, copied by `limen init`) loads `wake`, `communication`, `steering`, `group-peer` from `$LIMEN_PACKAGE` or the `limen` on PATH | `templates/limen-extension.ts:6-26`; `src/commands/init.ts:79-80` |
| Devin engine (other) | one cloud prompt: `preamble.trim() + "\n\n" + task.trim() + "\n\n" + contract(branch)`; no hooks | `src/runtime/devin.ts:118`; `src/runtime/wrapper.ts:131-144` |

## 1. Context components per role

### 1.1 Coordinator (owner-facing; interactive Pi or OMP in Herdr; `LIMEN_COORDINATOR=1`; not a job)

The hooks do not test `LIMEN_COORDINATOR`: every session with `LIMEN_JOB≠1` gets this treatment (`hook/communication.ts:82`, `hook/wake.ts:887`).

| # | Component | Source | When it enters | Condition | How to get the exact text |
|---|---|---|---|---|---|
| C1 | Engine base prompt, tool schemas, engine-loaded context files (project `AGENTS.md`), skills index | engine | session start | always | outside repo; not reproducible offline (claim: `docs/diagrams/context-injection.html:119`) |
| C2 | `## Capability (limen/templates/capability.md)` + body of `## Frame` | `capabilitySection("Frame")` `hook/communication.ts:157-160, 298-301`; `templates/capability.md:1-3` | system prompt, rebuilt every BAS (`:87, :104`) | pkg file exists; no project override (`:297`) | R1, or `## Capability (limen/templates/capability.md)\n` + `templates/capability.md` line 3 |
| C3 | Private-planning lines (3 lines + blank) | `privatePlanningGuidance(root)` `src/project/planning.ts:80-87`; `hook/communication.ts:161-163` | system prompt, every BAS | `<root>/.limen/planning-source` = `private` (`src/project/planning.ts:9-11`) | call exported `privatePlanningGuidance(root)` |
| C4 | `## Shop manual (limen/templates/agents.md)` | `readInheritedAgents` `hook/communication.ts:303-309` | system prompt, every BAS | non-job, and `<root>/AGENTS.md` absent (then the engine loads the project file instead; outside repo) | boundText(`pkg/templates/agents.md`, `limen/templates/agents.md`, `Shop manual`); 231 lines |
| C5 | `## Communication (<path>)` = register text above the first `## Cue: ` | `readRegister` `hook/communication.ts:274-282` | system prompt, every BAS | always; project `.agents/limen/communication.md` replaces `templates/communication.md` | inheritFile(root, `.agents/limen/communication.md`, `templates/communication.md`), slice at `/^## Cue: /m`, boundText; package default = `templates/communication.md:1-127` |
| C6 | Search cue body (no heading) | `registerCue(root,"Search")` `hook/communication.ts:174-176, 285-295`; `templates/communication.md:152-155` | system prompt, every BAS | `jg --help` exits 0 and prints `Jevgrep` (cached per PATH per process, `:196-207`); the register has `## Cue: Search` (no fallback, `:284`) | body of `## Cue: Search` of the chosen register |
| C7 | `## Vision (spec/vision.md)` | `boundFile` `hook/communication.ts:177-182, 311-314` | system prompt, every BAS | non-job; `<root>/spec/vision.md` exists | boundText(read `<root>/spec/vision.md`) |
| C8 | `## Styleguide (.agents/limen/styleguide.md)` | `hook/communication.ts:183-186` | system prompt, every BAS | file exists (here 40 lines) | boundText(read `<root>/.agents/limen/styleguide.md`) |
| C9 | `## Board digest (spec/build.md)` = `## NOW` + `## NEXT` sections | `boardDigest` `hook/communication.ts:341-351, 353-367` | system prompt, every BAS, **last** | non-job; build.md exists; ≥1 of those headings | `markdownSection(board,"NOW")` + `\n\n` + `markdownSection(board,"NEXT")`, boundText |
| — | joiners | parts `.join("\n\n")` (`:193`); `${event.systemPrompt}\n\n${extra}` (`:104`) | | | |
| C10 | Hidden cue wrapper `<limen-project-context>` … `</limen-project-context>`; customType `limen-project-context`, `display:false` | `turnCue` `hook/communication.ts:209-265, 94-98` | one new hidden message per BAS, after history | always | R1 `.message.content` |
| C10a | Capability cue (body of `## Cue`) | `templates/capability.md:5-7`; `:217` | in C10 | always | |
| C10b | `Cue: Shared` body | `templates/communication.md:128-132`; `:218` | in C10 | the register has it | |
| C10c | `Cue: Human` body | `templates/communication.md:134-138`; `:219` | in C10 | non-job | |
| C10d | `Cue: Failure` with `{{failure}}` = last stop reason | `templates/communication.md:148-150`; `:107-116, 221-223` | in C10, next BAS only | previous assistant message had an error/aborted stop reason (`assistantStopReason`) | |
| C10e | `Cue: Wake` body | `templates/communication.md:144-146`; `:224-226` | in C10 | prompt starts `Limen job ` (`:146-148`) | |
| C10f | `Last turn edited/wrote <paths>.` or `Last turn started or merged work.` | `touchLine` `:401-407`, set at `:136` | in C10, next BAS only | a reminder-eligible tool call ran (C11) | |
| C10g | `## Guidance drift` block | `formatDrift(listDrift(root))` `src/project/inherit.ts:64-112`; `:246-249` | in C10 | non-job; any of `AGENTS.md`, `.agents/limen/{worker,reviewer,communication}.md` exists (`inherit.ts:15-20`) | call exported `formatDrift(listDrift(root))` |
| C10h | Board-size advisory | `boardAdvisory` `:329-339` | in C10 | build.md > 120 trimmed lines | literal at `:338` |
| C10i | Seat rules (header line + `- <name> until <time>[, start priority N]: <text≤400>`) | `:254-262`; `src/project/seat-rules.ts:77-84` | in C10 | any rule under `<seat>/rules/` not ended and not due | call `activeRules().map(r => ruleLine(r, 400))` |
| C11 | Tool-result reminders `[limen] Specs:` / `[limen] Styleguide:` / `[limen] Vision:` (line ranges to read) | `guidanceAsks` `:382-399`, `recallReminder` `:507-524`, `reminderText` `:599-616` | appended to that tool result's text; stays in history | Specs: write/edit under `spec/`. Styleguide: write/edit of a non-`.md` file inside the project. Vision: bash with `limen spawn`, `git merge` (non-job), or mkdir/cp/mv/touch/install into `spec/features/planned/` (`:434-442`). Once per section until read or compaction (`:117-123, 445-464`) | R2 |
| C12 | Completion wake (user message, starts `Limen job "<label>"…`) | `completionWake` `src/job/wake-text.ts:54-113` (+ `jobEnding` `:20-48`, `keeperHint` `:127-134`); sent `hook/wake.ts:480-560` (`:533`) | job terminal; real turn if idle, else `followUp` (`hook/wake.ts:440-447`) | subscribed Pi session (`src/job/wake-delivery.ts`); `/limen off` mutes | call exported `completionWake(jobDir,label,state,id,branch,repo,{fallback,session})` on a real job dir |
| C13 | Advisory / hosted-uncertainty wake | `advisoryWake` `src/job/wake-text.ts:135-153`; `hook/wake.ts:561-676` (inline text `:646`) | while a job runs and writes `advisory`, or hosted uncertainty | subscribed or fallback | call `advisoryWake(...)`; uncertainty string at `hook/wake.ts:646` |
| C14 | Start notice | written `src/runtime/start-queue.ts:289-301`; sent `hook/wake.ts:678-699` | when a queued detached job starts | the job waited in the queue | read `<jobDir>/start-notice` |
| C15 | Herdr-typed wake (OMP coordinator / no Pi session) | `promptCoordinator` `src/integrations/coordinator-wake.ts:29-31, 120-130` (completionWake with `instruction` override `:128`) | job end; typed into `origin-pane` | job recorded `origin-pane`; not a group member | completionWake with the instruction string from `:128` |
| C16 | Group lead deliveries | `hook/group-peer.ts:120-143` (customType `limen-group-progress`, `display:true`, `followUp`, `triggerTurn`); `:171-184` (appended to any tool result) | 1 s sweep; any tool result | the session is lead of an open group run | runtime state (`acceptBatch` text `src/job/group-events.ts:280-290`) |
| C17 | Final group result | `groupResult` `src/commands/group-rounds.ts:212+` via `publishResult` (`src/job/group-events.ts:77`) or `promptLeadPane` (`src/commands/group-rounds.ts:246`) | after the last round | lead hook live → group event; else Herdr prompt | read `<group>/result.md` |
| C18 | GitHub doorbell prompt | `doorbellPrompt` `src/commands/github.ts:252-…`; `promptCoordinator` `:223` | seat poller | registered Herdr coordinator pane | runtime (poller claim) |
| C19 | Seat ext: handoff reminder (customType `coordinator-handoff`, `nextTurn`) | `docs/seat/coordinator-handoff.ts:36-47, 89-96` | once per session, after a settled turn at ≥30 % context | `LIMEN_COORDINATOR=1`, file installed in `~/.pi/agent/extensions/` (`docs/seat/README.md:39`) | `reminder(percent, root)` (not exported; copy `:36-47`) |
| C20 | Seat ext: handoff kickoff (first message of a new session) | `docs/seat/coordinator-handoff.ts:49-65, 116-121` | after `.limen/coordinator-handoff.request` | same | `kickoff(note, oldSession, archived)` + `.limen/coordinator-handoff.md` |
| C21 | Seat ext: quota resume (user message) | `docs/seat/quota-resume.ts:159-168, 182-195` | some minutes after a quota reset | `LIMEN_COORDINATOR=1`; last assistant message = quota error | `wakeText(error)` (not exported) |
| C22 | Human messages | Herdr pane | any time | — | — |

### 1.2 Job base (every job role: worker, reviewer, judge, keeper, scout, researcher, quality, picture, group team, group worker)

| # | Component | Source | When it enters | Condition | How to get the exact text |
|---|---|---|---|---|---|
| J1 | Engine base prompt, built-in tools, engine-loaded `AGENTS.md`/context files, skills | engine | session start | always | outside repo |
| J2 | Role preamble | §0 resolution; `--append-system-prompt` `src/runtime/engine.ts:248` | system prompt, session start (argv) | always | read the resolved file. Position relative to the engine base is outside repo. Hosted passes a path (§0). |
| J3 | `finish` tool schema: description `End this job. Pass the handoff text; the job is recorded done and the session exits.`, param `handoff` ("Handoff for the coordinator") | `hook/finish.ts:55-63` | tool list, every call | `LIMEN_JOB=1`, root and id set, jobDir exists (`:36-45`) | read `hook/finish.ts:56-62` |
| J4 | Capability frame | = C2 | system prompt, every BAS | always | R1 (`LIMEN_JOB=1`) |
| J5 | Private-planning lines | = C3; source = `<jobDir>/planning-source` recorded at spawn | system prompt, every BAS | recorded `private` (`hook/communication.ts:268-272`; `src/project/planning.ts:14-16`) | `privatePlanningGuidance(root)` |
| J6 | Register | = C5, root = `$LIMEN_CONTEXT_ROOT` | system prompt, every BAS | always | R1 |
| J7 | Search cue | = C6 | system prompt, every BAS | Jevgrep present | R1 |
| J8 | Styleguide | = C8, read from `$LIMEN_CONTEXT_ROOT` (canonical checkout), not the worktree | system prompt, every BAS | file exists | R1 |
| — | not for jobs | shop manual, vision, board digest (`hook/communication.ts:164, 177, 187`) | | | |
| J9 | Task (first user message) | `@<jobDir>/task.md` (`src/runtime/engine.ts:277`); body composed in `jobTaskBody` `src/commands/spawn.ts:395-411` | first prompt | non-continuation | read `<root>/.limen/jobs/<id>/task.md`. How the engine wraps `@file` is outside repo. |
| J9a | Task prefix `Repository: <repo>. Work only in this repository.` (+ `spec/` Ticket pointers made absolute) | `workspaceTask` `src/commands/spawn.ts:792-800`, called `:300-305` | in J9 | non-Git workspace coordinator and the task is not a raw file | already in task.md |
| J9b | Private-planning ticket rewrite to absolute paths | `privatePlanningTask` `src/project/planning.ts:70-77`; `spawn.ts:307-309` | in J9 | private source | already in task.md |
| J10 | Hidden cue (C10 wrapper) with capability cue, `Cue: Shared`, `Cue: Agent` (`templates/communication.md:140-142`) | `hook/communication.ts:216-220` | every BAS | always | R1 |
| J10a | `Cue: Failure` / `Cue: Wake` / last-touch line | as C10d–f | every BAS | as C10 | R1 |
| J10b | `Ticket: <path>` | `jobTicket` `hook/communication.ts:227-231, 369-379` | every BAS | the first `Ticket:` pointer in `<root>/.limen/jobs/<id>/task.md` | `ticketPointers(task)[0].path` (`src/project/planning.ts:62-67`) |
| J10c | `` Vision (read-only): `[<root>/]spec/vision.md` — durable intent. Load it before choosing or starting work. `` | `hook/communication.ts:232-237` | every BAS | `<root>/spec/vision.md` exists; `<root>/` prefix only when private | literal |
| J10d | `` Board (read-only): `[<root>/]spec/build.md` — consult before reporting work; do not edit. `` | `hook/communication.ts:238-240` | every BAS | `<root>/spec/build.md` exists | literal |
| J11 | noteStart: `[limen] Before other work, read <jobDir>/note.md, or write it if there is none.` + FORMAT + reuse rule | `noteStart` `src/job/task-note.ts:35-52`, `FORMAT` `:18-32`; appended to the cue `hook/communication.ts:89-96` | first BAS of each hook instance (each job, each continuation, each reload) | `LIMEN_JOB_ID` set and `<root>/.limen/jobs/<id>` exists (`:150-153`) | call exported `noteStart(jobDir)` |
| J11a | Project reminders inside noteStart | `<root>/.agents/limen/reminders.md` (`src/job/task-note.ts:14, 236-240`) | in J11 | file non-empty | read the file |
| J12 | Tool-result reminders | = C11, except `git merge` does not trigger Vision for jobs (`hook/communication.ts:438-440`). Guidance file: worktree copy first, then root, then pkg register (`:532-548`) | appended to tool results | as C11 | R2 |
| J13 | Steer: `<text>\n\n<noteSteer(jobDir)>` | `hook/steering.ts:107-140` (`:130`); `noteSteer` `src/job/task-note.ts:55-67` | user message with `deliverAs: "steer"`, between tool calls | `LIMEN_JOB=1`; `<jobDir>/steer/ready` claimed (`hook/steering.ts:66-89`); text in `<jobDir>/steer/inbox/<n>` | inbox text + `noteSteer(jobDir)` |
| J14 | Note check (detached Pi): customType `limen-note-check`, `display:false` | `hook/finish.ts:85-92`; `noteCheck(jobDir,false)` `src/job/task-note.ts:70-105` | once, when the run settles with outcome `completed`; the run continues | not hosted | call exported `noteCheck(jobDir, false)` |
| J15 | Note check (detached OMP): `additionalContext` | `hook/finish.ts:93-96` | once, at `session_stop` without an error stop | not hosted | `noteCheck(jobDir, false)` |
| J16 | Note check as the tool result of the first `finish` call | `hook/finish.ts:64-68` | first `finish` call (any job) | not checked yet in this instance | `noteCheck(jobDir, true)` |
| J17 | Group peer batch (`[limen-group-delivery:<uuid>]` …) | `hook/group-peer.ts:171-184`; text `src/job/group-events.ts:280-290` | appended to any tool result | job is a group member (`group-peer` loaded only then) | runtime state |

### 1.3 Role deltas (each role = §1.2 job base + this row)

| Role | Preamble (lines) | Task source (J9 content) | Default mode | Role-specific text elsewhere |
|---|---|---|---|---|
| worker | `templates/worker.md` (40) | coordinator's free text, a short instruction + `Ticket:` pointer (`templates/agents.md:153`) | detached; `--tab` hosted (`src/commands/spawn.ts:247-262`) | wake `Job done. Next step: land it…` + keeperHint (`src/job/wake-text.ts:82, 98, 127-134`) |
| reviewer | `templates/reviewer.md` (20) | `spawn --review --branch`; task + `\n\nCandidate commit: <sha>.` **unless** the task is a raw file/stdin in committed mode (`src/commands/spawn.ts:403-406`) | detached (worktree = detached checkout, `spawn.ts:600-608, 624-627`); hosted for GitHub doorbell (`src/commands/github.ts:403-421`) | re-review names `review-<n>.md` (`templates/reviewer.md:18`) |
| judge | `templates/judge.md` (12) | `--role judge`: "Read the reports at <path>…" (`templates/agents.md:211`) | detached | — |
| keeper | `templates/keeper.md` (22) | `limen keeper` packet file (`src/commands/keeper.ts:86-100` + `jobBlock` per job), `--task-file` (raw bytes) | detached, own branch (`keeper.ts:109-114`) | keeper wake variant (`src/job/wake-text.ts:129-131`). Template counters the J10d cue: "this line is your exception" (`templates/keeper.md:14`) |
| scout | `templates/scout.md` (33) | `--role scout --detached` question (`templates/agents.md:173`) | detached | scout handoff/instruction in wake (`src/job/wake-text.ts:76-82, 100-103`) |
| researcher | `templates/researcher.md` (13) | `--role researcher` ×2 with named sources (`templates/agents.md:201-208`) | detached | — |
| quality | `templates/quality.md` (17) | `--role quality --detached`, names the stretch (`templates/agents.md:100`) | detached | — |
| picture | `templates/picture.md` (19) | first map: coordinator's hosted `--tab` task (`templates/agents.md:164`); refresh: `limen picture tick` task literal (`src/project/picture-tick.ts:121-133`, includes the CONTRACT path `:15`) | first map hosted; refresh detached | — |
| group team ("coordinator") | `templates/coordinator.md` (14, titled `# Group team`) | `Work the ticket as <team> of the group. Ticket: <path>` (`src/commands/group.ts:350-366`) prefixed by `memberPacket` (§1.4) | hosted in Herdr unless `--detached` (`spawn.ts:247-250`) | no completion wake; the group tells the lead (`src/integrations/coordinator-wake.ts:22-25, 125-135`) |
| group worker | `templates/worker.md` | the team coordinator's `limen spawn` text, prefixed by `memberPacket` without a round (`spawn.ts:100-104, 408-409`) | as spawned | `task` tool and subagents blocked (`hook/group-peer.ts:161-170`) |
| GitHub doorbell job | reviewer or worker | `githubJobInstruction` (`src/commands/github.ts:465-485`): marker, task or pinned review, untrusted GitHub text | hosted `--tab` | — |
| Devin job (any role) | preamble text | one prompt (`src/runtime/devin.ts:118`) | cloud | no hooks; nothing from §1.2 except J2/J9 |

### 1.4 Group-specific components

| Component | Source | When | Condition | How to get the exact text |
|---|---|---|---|---|
| Member packet (prefix of task.md): `group-member.md` contract (text before the first `## Round:`), `Canonical root:`, `Group: <id> · <team> · feature <f>`, `Limen command …: <pkg>/bin/limen`, worker allowance (team only), `Ticket:`/`Brief:` paths, **approach note content inlined** (committed mode), round instruction (team only) | `memberPacket` `src/job/group-packet.ts:37-62`; `packetFiles` `:64-84`; `memberTemplate` `:11-21` | in J9, first round / worker spawn | group launch (`src/commands/spawn.ts:408-409`) | call exported `memberPacket(run, team, member)` with a run record |
| Round prompt (continuation user message): `Round N of M: <name>. <round body>` + team result paths/branches/worktrees + closing line | `roundPrompt` `src/commands/group-rounds.ts:176-194`; `roundInstruction` `src/job/group-packet.ts:26-30`; round bodies `templates/group-member.md:7-21` | each later round, as a `limen continue` of the team's previous job (`group-rounds.ts:150-167`) | round > 0 | `roundPrompt` (not exported); `roundInstruction` is exported |
| Peer batches | §1.2 J17 | tool results | member | runtime |
| `limen group publish 'Finding: …'` events from peers | `templates/group-member.md:5` → events → J17 | tool results of other members | — | runtime |
| Lead deliveries / final result | C16, C17 | — | lead = owner-facing coordinator pane with `group-peer` live (`hook/group-peer.ts:103-160`) | runtime |

### 1.5 Continuation (`limen continue`, any role; also every group round > 0)

| Component | Source | Note |
|---|---|---|
| Parent transcript (all earlier messages, hidden cues, tool-result reminders) | newest `<parent>/session/*.jsonl` copied into the new job (`src/commands/continue.ts:355-366, 461`; `src/job/publication.ts:180-182`) | resumed by the engine with `--continue` (`src/runtime/engine.ts:274-275`) |
| System prompt | rebuilt: preamble re-resolved now (`continue.ts:219-220`); `--review` switches to `reviewer.md` | §3 P2/P3 |
| Follow-up text (new user message) | detached: task.md text passed as the `--continue` value (`src/runtime/wrapper.ts:189-191`); hosted: `--continue @<jobDir>/continue` (`src/runtime/supervisor.ts:385`; `src/job/publication.ts:159-160`) | private mode appends the parent's `Ticket:` (`continue.ts:407-423`) |
| noteStart again; `note.md` and `note.first.md` carried from the parent | `src/job/task-note.ts:34`; `continue.ts:441-447` | J11 |

## 2. Project files pulled into context

| File | Role(s) | Pulled by | How | Source |
|---|---|---|---|---|
| `spec/vision.md` | coordinator | Limen code | full text in system prompt (C7) | `hook/communication.ts:177-182` |
| | jobs | Limen code | pointer line only (J10c) | `hook/communication.ts:233-237` |
| | quality, picture, worker (test cap) | instruction | told to read | `templates/quality.md:3,7`; `templates/picture.md:13`; `templates/worker.md:26` |
| | coordinator/jobs | Limen code | `[limen] Vision:` reminder on spawn/merge/planned ticket | `hook/communication.ts:395-397, 434-442` |
| `spec/build.md` | coordinator | Limen code | NOW+NEXT in system prompt (C9); size advisory (C10h) | `hook/communication.ts:329-351` |
| | jobs | Limen code | pointer line (J10d) | `hook/communication.ts:238-240` |
| | keeper, picture | instruction | edit / read | `templates/keeper.md:14`; `templates/picture.md:13` |
| `.agents/limen/styleguide.md` | all sessions | Limen code | full text in system prompt (C8/J8); `[limen] Styleguide:` reminders by section | `hook/communication.ts:183-186, 568-588` |
| | quality, coordinator | instruction | read | `templates/quality.md:7`; `templates/agents.md:46` |
| `.agents/limen/communication.md` (else `templates/communication.md`) | all | Limen code | register in system prompt, cues in hidden message, `## Specs` reminder after spec edits | `hook/communication.ts:274-295, 559-564` |
| `AGENTS.md` (project) | all | **engine** (outside repo) | engine context file. If absent, Limen injects `templates/agents.md` for the coordinator only. | `hook/communication.ts:303-309` |
| `templates/capability.md` | all | Limen code (pkg only) | Frame in system prompt, Cue in hidden message | `hook/communication.ts:157-160, 217, 298-301` |
| `.agents/limen/<role>.md` | the job of that role | Limen code | replaces `templates/<role>.md` as preamble | `src/commands/spawn.ts:75-85` |
| `.agents/limen/reminders.md` | jobs | Limen code | inlined in noteStart and noteCheck | `src/job/task-note.ts:14, 44-50, 82, 236-240` |
| `.limen/jobs/<id>/task.md` | jobs | engine `@file` | first user message | `src/runtime/engine.ts:277` |
| | coordinator | Limen code | first sentence in the wake | `src/job/wake-text.ts:65, 165-173` |
| `.limen/jobs/<id>/{result,commits,stop-reason,open-checks,start-notice,steer/inbox}` | coordinator | Limen code | wake body (final message whole) | `src/job/wake-text.ts:20-48, 66-74` |
| `.limen/jobs/<id>/note.md`, `note.first.md` | jobs | instruction + Limen code | read/write by noteStart; inlined by noteCheck | `src/job/task-note.ts:38, 70-81` |
| `spec/features/**/ticket.md` | jobs | instruction | `Ticket:` pointer in task and cue | `hook/communication.ts:227-231`; `templates/worker.md:22` |
| `spec/features/**/review-<n>.md` | reviewer/repair | instruction | named in the task | `templates/reviewer.md:18`; `templates/agents.md:157` |
| `report-N.md` | judge | instruction | named in the task | `templates/judge.md:7` |
| `<feature>/group/brief.md`, `group/teams/<team>.md`, round result files | group members | Limen code | Brief path; approach note **inlined**; round paths | `src/job/group-packet.ts:64-84`; `src/commands/group-rounds.ts:176-194` |
| `templates/picture/CONTRACT.md` | picture; worker/coordinator by reference | instruction; tick task names its path | read | `templates/picture.md:3`; `src/project/picture-tick.ts:15, 121` |
| `spec/linear.md`, `templates/linear.md` | coordinator | instruction | read when mirroring is on | `templates/agents.md:57` |
| `spec/workspace.md` | coordinator (workspace) | instruction | read | `templates/agents.md:73` |
| `spec/quality/*.md` | quality | instruction | read/write | `templates/quality.md:10, 15` |
| `.limen/coordinator-handoff.md` | new coordinator session | seat extension | inlined in kickoff | `docs/seat/coordinator-handoff.ts:110-120` |
| `docs/groups.md`, `docs/remote.md`, `docs/picture.md` | coordinator | instruction (referenced) | read on demand | `templates/agents.md:32, 36`; `src/project/picture-tick.ts:19` |

## 3. What changes the prompt prefix mid-session

| # | Change | Mechanism | Source |
|---|---|---|---|
| P1 | The system prompt is rebuilt from disk on **every** BAS: capability, planning source, AGENTS.md presence, register, jg presence, vision, styleguide, board NOW/NEXT. Any change between prompts changes text that precedes the whole history. `limen land` / `ticket done` / `board --write` regenerate NOW (`templates/agents.md:48`). | ``systemPrompt: event.systemPrompt ? `${event.systemPrompt}\n\n${extra}` : extra`` | `hook/communication.ts:87, 99-105, 155-194` |
| P1a | For jobs the same inputs are read from `$LIMEN_CONTEXT_ROOT`, so coordinator edits in the main checkout reach a hosted job's next owner message, and every continuation | `const root = process.env.LIMEN_CONTEXT_ROOT ?? context.cwd` | `hook/communication.ts:81` |
| P1b | Planning source flip (`limen planning private/committed`) adds or removes C3 for the coordinator. A job keeps the source recorded at spawn. | `planningSource` vs `recordedPlanningSource` | `hook/communication.ts:268-272` |
| P1c | `AGENTS.md` appears or disappears → the shop manual (≈231 lines) is removed or added | `readInheritedAgents` | `hook/communication.ts:303-309` |
| P2 | A continuation re-resolves the preamble, so an overlay or a package change between parent and child changes the system prompt in front of the copied transcript | `const preamble = resolvePreamble(root, role)` | `src/commands/continue.ts:220` |
| P3 | `continue --review` swaps `worker.md` → `reviewer.md` in front of the worker's transcript | `const role = review ? "reviewer" : …` | `src/commands/continue.ts:219`; printed warning `:569` |
| P4 | Package update + `/reload` reloads the hooks; capability and register text come from the new pkg | instruction | `templates/agents.md:229` |
| P5 | Compaction (engine) rewrites history; the hook then forgets what was read and named, so reminders repeat | `pi.on("session_compact", forget)` | `hook/communication.ts:117-123` |
| P6 | Coordinator handoff opens a **new** session (fresh prefix) | `ctx.newSession(…)` | `docs/seat/coordinator-handoff.ts:117-122` |
| P7 | Group rounds: each round > 0 is a continuation (P2 applies) | `continueCommand([...])` | `src/commands/group-rounds.ts:156-167` |
| — | Not prefix changes, but persisted in history: hidden cue per BAS (C10/J10), tool-result reminders (C11/J12), peer batches appended to tool results (J17), wakes, steers, note checks | — | `hook/communication.ts:94-98, 142`; `hook/group-peer.ts:171-184` |
| — | Read-only observer, no mutation: `group-peer` `context` handler only scans messages for tokens | — | `hook/group-peer.ts:185-207` |

## 4. Skills and tools

| Session | Extensions (repo-determined) | Tools/commands added or blocked | Skills | Outside repo |
|---|---|---|---|---|
| Coordinator, Pi | project stub → `wake`, `communication`, `steering` (no-op: `hook/steering.ts:67`), `group-peer` (`templates/limen-extension.ts:8`); seat: `coordinator-handoff`, `quota-resume`, `statusline` in `~/.pi/agent/extensions/` (`docs/seat/README.md:39`) | commands `/limen` (`hook/wake.ts:1044-1081`), `/coordinator-handoff` (`docs/seat/coordinator-handoff.ts:99`); statusline is footer UI only (`docs/seat/statusline.ts:182-187`); no model tools added | Pi discovery: `.agents/skills`, `.pi/skills` (`docs/setup.md:81-92`). None exist in this repo. `herdr --skill` is mentioned, not loaded (`templates/agents.md:134`) | built-in tools, base prompt, global skills, other `~/.pi` extensions, `.pi/settings.json` defaults (provider `openai-codex`, model `gpt-6-astra`, thinking `xhigh`: `.pi/settings.json:2-6`) |
| Coordinator, OMP (the seat runs OMP: `docs/seat/agent-setup.md:145-146, 190`) | `.omp/extensions/limen.ts` (identical stub) | same `/limen` | `.agents/skills`, `.omp/skills` | OMP built-ins |
| Detached job (Pi/OMP) | `--no-extensions` (`src/runtime/engine.ts:238`) + `finish`, `steering`, `communication`, [`group-peer`], [`extensions.json`, Pi only: `src/runtime/worker-extensions.ts:12-14`], [pi-claude-bridge] | `finish` tool (`hook/finish.ts:55-81`; OMP mounts it as `xd://finish`, `:29`); members: `task` tool and subagent spawn blocked (`hook/group-peer.ts:161-170`) | Pi: native (outside repo; `docs/setup.md:92`). OMP: job-local view of `.pi/skills` via `--config <jobDir>/skills-config.yml` (`src/runtime/engine.ts:159-225, 245-247`) | `--approve`/`--auto-approve` (`engine.ts:232-237`); bridge behaviour |
| Hosted job | as detached + `hosted` + Herdr state extension(s) | same | same | Herdr extension content |
| Devin job | none | n/a | n/a | Devin API |

## 5. Sessions per ticket (engine processes/sessions)

| Step | Sessions | Source |
|---|---|---|
| Worker spawn | 1 (one engine process per job, no restart in the wrapper) | `src/runtime/wrapper.ts:235` |
| Note check | +1 continuation **turn** in the same session (detached), or a tool result (finish) | `hook/finish.ts:64-68, 85-96` |
| Review | 1 fresh session per `spawn --review` | `templates/agents.md:156` |
| Repair | 1 (`spawn --branch`: fresh session, same worktree) | `templates/agents.md:157` |
| Re-review | 1 | `templates/agents.md:157` |
| Ceiling, ordinary ticket | "one repair and one re-review settle an ordinary ticket"; "Do not buy a third round" → max worker + review + repair + re-review | `templates/agents.md:157` |
| Keeper | +1 when a job added/moved/changed a ticket (wake suggests it) | `templates/agents.md:162`; `src/job/wake-text.ts:127-134` |
| Continue | +1 per `limen continue` (new process, copied transcript) | `src/commands/continue.ts:192-260` |
| Scout (optional, before a spawn) | +1 | `templates/agents.md:173` |
| Research | 2 researchers + 1 judge per authorized question | `templates/agents.md:201-212` |
| Quality | 1 per ten proven landings | `templates/agents.md:100` |
| Picture refresh | 0–1 per top-branch move when watch is on | `templates/agents.md:164` |
| Group | teams × rounds (each later round = continue) + workers per allowance + team reviews | `src/commands/group.ts:350-366`; `src/commands/group-rounds.ts:150-167`; `src/job/group-packet.ts:47-52` |
| Coordinator | 1 long session; a new one at ≥30 % context (seat) | `docs/seat/coordinator-handoff.ts:24, 117` |

A typical ordinary ticket: 1 worker (+ keeper if it changed spec) when the coordinator skips review (`templates/agents.md:156`), up to 4–5 sessions with review, repair, re-review and keeper. Each finish also adds one coordinator turn (wake).

## 6. Template history (`templates/.history/`)

- One file per template name (agents, communication, coordinator, group-member, judge, picture, quality, researcher, reviewer, worker). Each line is `<sha256 of a past template text> <YYYY-MM-DD>`, newest first. keeper, scout, capability, linear and styleguide have none.
- `listDrift` uses it to classify a project copy as `stale` (it matches a past package text) versus `overlay`, and uses git history instead when the package is a clone with a longer log (`src/project/inherit.ts:64-87, 122-139`). Only `AGENTS.md`, `worker`, `reviewer` and `communication` are drift-tracked (`:15-20`).
- It is regenerated by `LIMEN_WRITE_HISTORY=1 node --test test/structure.test.ts`, which writes `templateHistoryText` (git log/show of the package). The test fails when the first hash ≠ the current template (`test/structure.test.ts:33-45`). All 10 heads match at `rebuild-base` (checked with sha256).

## 7. Observations for the audit

1. **The `coordinator` role file is not the coordinator's prompt.** `templates/coordinator.md:1` "`# Group team`". The owner-facing coordinator gets `templates/agents.md` via the communication hook, and only when the project has no `AGENTS.md` (`hook/communication.ts:164-169`).
2. **Hosted and detached pass different values in the same flag.** `src/runtime/supervisor.ts:371` "`preamble: requiredEnvironment("LIMEN_PREAMBLE"),`" (a path, `src/commands/spawn.ts:319`) vs `src/runtime/wrapper.ts:79` "`const preamble = await readFile(preambleFile, "utf8");`". Both feed `--append-system-prompt` (`src/runtime/engine.ts:248`).
3. **The system prompt is rebuilt each prompt and ends with the board digest.** `hook/communication.ts:104` "``systemPrompt: event.systemPrompt ? `${event.systemPrompt}\n\n${extra}` : extra,``". The diagram says `docs/diagrams/context-injection.html:213` "Last, so a board change breaks only the end of the cache." In the request, the system prompt precedes the whole history.
4. **Two sources for the same guidance in one job.** `hook/communication.ts:81` "`const root = process.env.LIMEN_CONTEXT_ROOT ?? context.cwd;`" (system prompt from the canonical checkout) vs `:532` "The copy in the agent's worktree wins, shown by its short path" (reminders).
5. **Any non-job session is treated as the coordinator.** `hook/communication.ts:82` "`const job = process.env.LIMEN_JOB === "1";`". No `LIMEN_COORDINATOR` check here or in `hook/wake.ts:887`. A research or tool session in the plant gets the shop manual, vision, board and wakes.
6. **The diagram says steers are unwrapped.** `docs/diagrams/context-injection.html:346` "No wrapper, no cue." vs `hook/steering.ts:130` "``pi.sendUserMessage(`${text}\n\n${noteSteer(job)}`, { deliverAs: "steer" });``". The board advisory wording also differs: diagram `:316` vs `hook/communication.ts:338`.
7. **Read-only roles still get the note-writing instruction.** `templates/scout.md:6` "Do not edit, create, or delete files." vs `src/job/task-note.ts:38` "Before other work, read ${join(jobDir, NOTE)}, or write it if there is none." This goes to every job, including scout, reviewer and judge.
8. **Hosted jobs always get the agent audience cue.** `hook/communication.ts:219` "`registerCue(cwd, job ? "Agent" : "Human"),`". This holds on each owner-typed message, while `templates/worker.md:10` says "The human may type into this session directly."
9. **A continued review is not a fresh review.** `src/commands/continue.ts:219` "``const role = review ? "reviewer" : (await text(`${parentDir}/role`)) || "worker";``". The reviewer preamble is placed in front of the worker's copied transcript, and `:569` prints "this review is not independent".
10. **The candidate line can be missing from a review task.** `src/commands/spawn.ts:403-406` "`if (loaded.raw && place.source === "committed") { taskBody = loaded.bytes; } else if (candidate) {`". A `--task-file`/stdin review gets no `Candidate commit:` line, while `templates/agents.md:156` says "the reviewer's task ends with `Candidate commit: <sha>.`"
