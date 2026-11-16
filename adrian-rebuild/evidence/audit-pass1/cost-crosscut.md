<!-- PL: Audyt (przebieg 1, bez historii) obszarów KOSZT i PRZEKROJOWE Limena przy tagu rebuild-base (3b5edd7): stały kontekst ról, zmiany prefiksu psujące cache (z. 3), widoczne narzędzia i skille, mnożniki sesji, a także tabela keep/cut/shrink modułów, luki testów na ścieżce krytycznej i sprzeczności dokumentacji z kodem. Każde ustalenie ma file:line sprawdzone przez `git show rebuild-base:<plik>`; liczby tokenów pochodzą z evidence/context-size-rebuild-base.md (bajty/4). Stan: kompletny dla zakresu zlecenia; 27 ustaleń (1 high, 17 medium, 9 low), pytania otwarte w sekcji "To verify". -->

# Audit pass 1: cost and cross-cutting (`rebuild-base`, `3b5edd7`)

Scope: COST areas 1–4 and CROSS-CUTTING areas 5–7 of the brief. Every `file:line` is at `rebuild-base` (HEAD differs only
under `adrian-rebuild/` and `.gitignore`). Token figures: `adrian-rebuild/evidence/context-size-rebuild-base.md`
(bytes / 4, package defaults on a fresh `limen init`). Production differs in one known way: each project overrides
`.agents/limen/communication.md` (Polish), so the register numbers below are the package default, not the seat's.

## Tables

### Table A — modules and features: keep / cut / shrink (area 5)

Lines from the measurement file. "Seat" = what the repo shows about the production seat (Ubuntu, Pi 1.2.0 via the
Claude bridge, Herdr, one Claude Max subscription, one job at a time per project).

| Module / feature | Lines | Wired in at (evidence) | Seat use | Verdict | Reason |
|---|---|---|---|---|---|
| Job core: `spawn.ts`, `wrapper.ts`, `record.ts`, `job.ts`, `land.ts`, `stop.ts`, `prune.ts`, `reap.ts` | ≈2,900 | `src/main.ts:40-51` | critical path | keep | The product. |
| `continue.ts` | 580 | `src/main.ts:41`; `src/commands/continue.ts:355-366` copies the parent transcript | used (quota recovery: `docs/seat/quota-resume.ts:163`) | keep, shrink | Needed for resume; `--review` variant is a non-independent review (`continue.ts:569`). |
| `hook/communication.ts` | 672 | `templates/limen-extension.ts:8`; `src/runtime/supervisor.ts:377` | every session | shrink | ≈270 lines (`:382-650`) re-ask for guidance that is already in the system prompt (K-07). |
| `hook/wake.ts` + `wake-delivery.ts` + `wake-text.ts` | 1,861 | `templates/limen-extension.ts:8` | coordinator | keep, shrink | Core wake; fallback/advisory/uncertainty variants (`hook/wake.ts:561-676`) multiply paths. |
| Start queue CPU/memory gate | 442 | `src/runtime/wrapper.ts:97` | every detached job | shrink | Gates on CPU and memory (`start-queue.ts:38`), not on the operator's one-job-per-project rule (K-01). |
| Seat rules + start priority (`rule.ts`, `seat-rules.ts`) | 329 | `hook/communication.ts:254-262` | unknown usage | shrink | Manual quota lever (`templates/agents.md:67`); a project slot would replace most of it. |
| Hosted mode (`supervisor.ts`, `hosted-binding.ts`, `hosted-uncertainty.ts`, `hook/hosted.ts`, `recovery.ts`) | 1,230 | `src/runtime/supervisor.ts:366-386` | first picture map, doorbell, group default (`templates/agents.md:86,164`) | shrink; unknown usage | Jobs should be machine-like; hosted is only for "a person will type into the worker" (`templates/agents.md:84`). |
| Groups (`group.ts`, `group-rounds.ts`, `group-cabinet.ts`, `group-events.ts`, `group-packet.ts`, `hook/group-peer.ts`, `bin/limen-group-fixture.mjs`) | 2,054 (+ tests 424, docs 136) | `src/main.ts:39`; loaded in every coordinator by `templates/limen-extension.ts:8` | unknown usage | cut | N teams in parallel contradicts one job at a time; costs a 1 s timer in every coordinator (K-17). |
| GitHub doorbell (`github.ts`, `github-doctor.ts`, `github-poller.ts`, `github-review.ts`, `docs/seat/github-setup.sh`) | 1,950 (+ s10 218) | `src/main.ts:38`; `templates/agents.md:38-40` | unknown usage (no unit in `docs/seat/README.md:7`) | cut unless used | ≈394 tokens of shop manual per coordinator request for an opt-in feature. |
| Finish webhooks + coordinator signals (`finish-webhook.ts`, `webhook-queue.ts`, `finish-receipt.ts`, `finish-turn.ts`, `coordinator-signal.ts`, `webhook.ts`, `bin/tony-finish-ping.sh`) | 1,584 (+ docs 752, tests 320) | `hook/wake.ts:23,162,782` | unknown usage | cut or shrink | Seat bell is `docs/seat/bell.sh` (ntfy), a separate 30-line path; finish-ping prose is in every worker prompt (`templates/worker.md:38`). |
| Devin engine (`devin.ts`) | 303 (+ s11 98) | `src/runtime/wrapper.ts:23`; `src/runtime/engine.ts:55-66` | none (only provider is Claude Max) | cut | Dead on the seat. |
| OMP paths (`.omp/extensions/limen.ts`, `prepareSkillConfig`, `coordinator-wake.ts`, `finish.ts` `session_stop`) | ≈470 | `src/runtime/wrapper.ts:172`; `src/runtime/engine.ts:161-225`; `src/integrations/coordinator-wake.ts:22-31`; `hook/finish.ts:93-96` | none (seat runs Pi) | cut | Second engine doubles argv, skills and wake routes; OMP text also in the shop manual (`templates/agents.md:96,106,189`). |
| Picture viewer (`picture/viewer/*`) | 5,150 | `src/picture/picture-build.ts:36` | no agent role needs it | cut from ticket check; cut | The ticket check `limen picture build --strict` (`templates/worker.md:17`) loads the viewer to check front matter (K-21). |
| Picture model, tick, watch, serve (`src/picture/*`, `picture-tick.ts`, `picture-watch.ts`, `commands/picture.ts`) | 3,316 | `src/commands/land.ts:288` (`readPicture`); `src/project/picture-tick.ts:22` | ticket front matter on the critical path; map unknown usage | shrink | Keep `tickets.ts`/`frontmatter.ts` as the ticket checker; tick/watch/serve have no test (Table B). |
| Linear mirror (`linear.ts`, `templates/linear.md`) | 145 | `src/main.ts:61`; `templates/agents.md:57` | unknown usage | cut | Mirroring is agent work (`src/commands/linear.ts:6`): a model-driven bridge, not a generated view (z. 22). |
| macOS-only branches | ≈90 | `src/runtime/contain.ts:223` (Ruby `proc_pidinfo`); `src/runtime/start-queue.ts:128` (`memory_pressure`); `src/integrations/herdr.ts:579` (`osascript`); `src/project/seat.ts:41,53` (LaunchAgent) | dead on a Linux seat | cut | Linux branch exists (`contain.ts:190`); the LaunchAgent is a silent no-op on Linux (K-19). |
| Non-Git workspace (`workspace init`, `--repo`) | ≈150 | `src/commands/init.ts:59-67`; `templates/agents.md:71-73` | unknown usage | shrink | ≈155 tokens of shop manual every request. |
| Private planning (`planning.ts`, `planning-source.ts`) | 126 | `src/main.ts:37`; `hook/communication.ts:161-163` | unknown usage | cut or test | Zero tests (Table B); branches in spawn, continue, hooks and groups. |
| Template drift tracking (`inherit.ts:64-199`, `templates/.history/*`) | ≈150 + 10 files | `hook/communication.ts:245-249` | fires on every coordinator prompt on the seat | shrink | Flags the operator's deliberate communication overlay on every prompt (K-08). |
| Jevgrep search cue | ≈20 | `hook/communication.ts:174-176,196-207` | unknown (no `jg` here) | keep | Cheap; system prompt only when present. |
| Highlight (`highlight.ts` + Herdr/wake parts) | ≈60 | `src/main.ts:60` | unknown usage | keep or cut | Human-display nicety; low cost. |
| Task-note experiment (`task-note.ts`, `session-commands.ts`) | 451 | `hook/communication.ts:89-96`; `hook/finish.ts:64-68,85-96` | every job | decide: keep or cut | Experiment with a one-week measurement window that has passed with no measurement in the repo (K-11). |
| Keeper (`keeper.ts`, `templates/keeper.md`) | 244 | `src/job/wake-text.ts:133`; `src/commands/keeper.ts:109-116` | suggested in every done wake | shrink | Model session for link fixes that are mostly deterministic (K-12). |
| `docs/vps.md`, `docs/reviews/*` | 176 + 308 | not referenced from code or templates | none | cut | `docs/vps.md:3` calls itself an old record. |
| `docs/diagrams/context-injection.html` | 395 | none | none | fix or cut | Its cache claims are false (K-02, Table C). |
| Seat Pi extensions (`docs/seat/{coordinator-handoff,quota-resume,statusline}.ts`) | 608 | `docs/seat/README.md:39` | every coordinator | keep, bring under checks | Production code with no typecheck, lint or test (K-20). |
| `.pi/settings.json` | 8 | repo-local Pi defaults | seat irrelevant | cut | `openai-codex/gpt-6-astra` xhigh (`.pi/settings.json:2-4`); the seat has only Claude. |

### Table B — critical-path mechanisms without a test (area 6)

Grep base: `git grep -n -E '<pattern>' rebuild-base -- test`. "0" = no test file matches.

| Mechanism | Code | Grep | Result | Why it matters |
|---|---|---|---|---|
| System-prompt prefix stability across prompts (same files → same text; board change effect) | `hook/communication.ts:87,99-105,187-192` | `boardDigest\|Board digest` | 0; `test/s4-steering.test.ts:90-92` only counts markers once | The cache-relevant property (z. 3) is unguarded. |
| Hosted job role preamble reaches the model | `src/runtime/supervisor.ts:371` (a path), `src/commands/spawn.ts:75-85` | `LIMEN_PREAMBLE` | 0; `test/fake-engine.mjs:24` takes the flag value as literal text | A path-vs-text mismatch would not fail any test (see To verify). |
| Seat extensions: handoff at 30 %, quota resume, statusline | `docs/seat/coordinator-handoff.ts:89-96`; `docs/seat/quota-resume.ts:20-22,182-195` | `coordinator-handoff\|quota-resume\|statusline` | 0; not type-checked (`tsconfig.json:21`), not linted (`biome.jsonc:112-114`) | The only automatic recovery after a quota stop. |
| Job ending on a Claude quota error, then `continue` | `docs/seat/quota-resume.ts:159-168`; `src/commands/continue.ts:195` | `hit your\|quota` | 0 (s3 covers a generic provider error) | The shared-quota failure mode of the seat. |
| Continuation model when no `--model` is given | `src/commands/continue.ts:195`; `src/runtime/engine.ts:89` | `gpt-6-astra\|defaultModel` | 0 | Falls back to an OpenAI route the seat cannot serve (K-06). |
| `continue --review` | `src/commands/continue.ts:219,569` | `"continue".*"--review"` | 0 (only `spawn --review` in `test/group-extensions.test.ts:134`) | Swaps the preamble in front of a worker transcript. |
| Private planning | `src/project/planning.ts`; `hook/communication.ts:161-163,232` | `planning` | 0 | Branches through spawn, continue, hooks, groups. |
| `picture tick` / `picture watch` (spawns model jobs) | `src/project/picture-tick.ts:22-60`; `src/project/picture-watch.ts` | `picture-tick\|"tick"`, `picture-watch` | 0 | "Spends nothing" claim (`templates/agents.md:164`) is a cost guarantee without a test. |
| `limen sweep --install` | `src/commands/sweep.ts:27-32`; `src/project/seat.ts:40-56` | `"--install"` | 0 | Writes a macOS plist on Linux (K-19). |
| Guidance drift advisory | `src/project/inherit.ts:64-112`; `hook/communication.ts:245-249` | `listDrift\|Guidance drift\|leftover` | 0 | Text that enters every coordinator prompt on the seat. |
| `limen ticket done` | `src/commands/ticket.ts:25` | `ticket", "done` | 0 | Board regeneration path besides `land`. |
| OMP job skill view | `src/runtime/engine.ts:161-225` | `prepareSkillConfig\|skills-config` | 0 | Dead on the seat; untested elsewhere. |
| Herdr state extension pick-up for hosted panes | `src/runtime/engine.ts:319-328` | `HERDR_INTEGRATION_ID` | 0 | Hosted pane status depends on it. |

### Table C — declarations vs code (area 7)

| Statement | Doc location | Code location | Contradiction |
|---|---|---|---|
| "Each test has a 30s timeout" | `CONTRIBUTING.md:11` | `package.json:24` | `--test-timeout=180000` (180 s). |
| "`hook/` — only the extensions Pi and OMP load by path (`wake`, `communication`, `steering`, `hosted`)" | `CONTRIBUTING.md:24` | `src/runtime/supervisor.ts:374-379`; `templates/limen-extension.ts:8` | `finish` and `group-peer` are also loaded by path. |
| "stable guidance (… board digest) rides the system prompt" | `CONTRIBUTING.md:29` | `hook/communication.ts:187-192`; `templates/agents.md:48` | The board digest is regenerated by `land`/`ticket done`/`board --write`; it is not stable. |
| "On Linux, escaped-descendant containment does not signal at all: identity verification is macOS-only" | `SECURITY.md:9` | `src/runtime/contain.ts:190-210,132-136` | Linux reads `/proc/<pid>/stat` birth ticks and signals on a match. `docs/remote.md:77` and `docs/seat/README.md:78` agree with the code, not with `SECURITY.md`. |
| Seat Pi extensions are loaded "for every session" | `docs/seat/README.md:39` | `src/runtime/engine.ts:238`; `docs/seat/coordinator-handoff.ts:68` | Jobs start with `--no-extensions`; the extensions also self-disable without `LIMEN_COORDINATOR=1`. |
| Seat units listed: bell, prune, Pi extensions | `docs/seat/README.md:7` | `src/commands/sweep.ts:41-51`; `docs/jobs.md:200` | No unit runs `limen sweep` on the Linux seat, yet seat notifications and exit detection need it. |
| "Exit detection needs `limen sweep --install` … Check with `launchctl list`"; "the installed LaunchAgent runs it every 60 seconds" | `docs/finish-webhooks.md:415-416,746-747` | `src/project/seat.ts:40-51` | macOS LaunchAgent only; on Linux the file is written into `~/Library/LaunchAgents` and nothing runs it. |
| `limen sweep [--install\|--uninstall]` as a seat command | `docs/commands.md:188-191` | `src/project/seat.ts:41,53` | No platform branch; no Linux scheduler. |
| The group "tells the lead the result once, after the last round" | `docs/groups.md:3` (also `templates/agents.md:23`) | `hook/group-peer.ts:120-143`; `src/job/group-events.ts:173-179` | Every published finding is queued for the lead and delivered with `triggerTurn: true`, one coordinator turn per batch; `docs/groups.md:69` itself says the lead receives findings. |
| Task-note experiment: "How to measure, after about one week" (start 2026-10-22) | `README.md:84,109-117` | no measuring code: `git grep -n 'note.first' rebuild-base -- src hook bin` hits only the writer and the copier (`src/job/task-note.ts:11,107`, `src/commands/continue.ts:442`) | The window passed; the repo holds no measurement or decision. |
| Board digest "Last, so a board change breaks only the end of the cache" | `docs/diagrams/context-injection.html:213` | `hook/communication.ts:104` | The system prompt precedes the whole history in a request; any change in it invalidates the cached history too. |
| Steer: "No wrapper, no cue" | `docs/diagrams/context-injection.html:346` | `hook/steering.ts:130` | The steer carries `noteSteer(job)` text. |

## Findings

### K-01 One job per project is not enforced; prompts push parallel spend
- Area: cost
- Severity: high
- Location: `src/runtime/start-queue.ts:15-18`, `src/runtime/start-queue.ts:38`, `templates/agents.md:67`, `templates/agents.md:152`, `templates/agents.md:88`
- Evidence: `const DEFAULT_GATE: StartGate = { cpuIdle: 25, memoryFree: 20, settleMs: 60_000 };` (the only start gate); `templates/agents.md:67` "Never limit the machine to one job, and never stop all coordinators."; `templates/agents.md:152` "propose running them in parallel unprompted, one worker per ticket"; `templates/agents.md:88` "Hosted (`--tab`) jobs, group launches and Devin jobs start at once."
- Rule: z. 14
- Verdict: non-compliant
- Direction: Enforce the operator's limit in code (one running job per project, checked in the start queue for every mode, hosted and group included) and delete the parallelism advice and the "never limit" sentence from the shop manual.
- Scenario: The coordinator follows step 1, starts three Opus workers on disjoint tickets, then reviews for each. All share one Max subscription; the 5 h window or the weekly limit runs out mid-run, every job and the coordinator stop on a quota error, and nothing runs until the reset. The only lever is a manual `limen rule set claude-week …` that the same manual frames as an exception.

### K-02 The system prompt is rebuilt every prompt; every land invalidates the coordinator's cached history
- Area: cost
- Severity: medium
- Location: `hook/communication.ts:87`, `hook/communication.ts:99-105`, `hook/communication.ts:187-192`, `templates/agents.md:48`, `docs/diagrams/context-injection.html:213`
- Evidence: `systemPrompt: event.systemPrompt ? \`${event.systemPrompt}\n\n${extra}\` : extra,` with `extra` re-read from disk at each `before_agent_start`; the last part is NOW + NEXT of `spec/build.md`, which "`limen land`, `limen ticket done` and `limen board --write`" regenerate.
- Rule: z. 3
- Verdict: non-compliant
- Direction: Freeze the system prompt at session start and deliver board, vision and styleguide changes as an appended message after the history (or as a pointer the agent reads), so the prefix never changes mid-session.
- Scenario: n/a (medium). Effect: the coordinator's normal loop (land, then next ticket) rewrites the cache for the 15.9k-token block plus the whole history after each land; vision, styleguide, `AGENTS.md` or planning-mode edits do the same.

### K-03 Job roles carry the human register, the ticket rules and maintainer notes
- Area: cost
- Severity: medium
- Location: `hook/communication.ts:170-173`, `hook/communication.ts:274-282`, `templates/communication.md:3`, `templates/communication.md:19-42`, `templates/communication.md:44-97`, `templates/communication.md:109-126`
- Evidence: the whole text above the first `## Cue:` goes to every role. Measured per request: Human 6957 B ≈1739 tokens, Specs 3418 B ≈855, Before you send 761 B ≈190, Turn cue convention 684 B ≈171. For a judge, reviewer, scout or researcher these ≈2,955 tokens are ≈83 % of the register and ≈71 % of the judge's 16,754 B fixed block. `templates/communication.md:126` ("Keep the stable register above the first `## Cue: ...` section. The hook selects …") and `:3` are notes for template maintainers, sent to the model.
- Rule: z. 8, z. 21
- Verdict: non-compliant
- Direction: Split the register by audience: jobs get Shared + Agent only; Specs goes to the roles that write tickets (coordinator, keeper); maintainer notes move out of the injected text.
- Scenario: n/a (medium).

### K-04 One register file serves the coordinator and every job; the Polish override reaches all jobs
- Area: cost
- Severity: medium
- Location: `hook/communication.ts:81`, `hook/communication.ts:274-275`, `hook/communication.ts:284-295`, `templates/communication.md:3`
- Evidence: jobs read `inheritFile(cwd, REGISTER_FILE, PACKAGED_REGISTER)` with `cwd = process.env.LIMEN_CONTEXT_ROOT` (the project root), so `.agents/limen/communication.md` replaces the register for all roles; `registerCue` comment: "absent sections have no package fallback."
- Rule: none
- Verdict: n/a
- Direction: Separate "how the coordinator speaks to the owner" (project-overridable, coordinator only) from "how agents write handoffs" (package, jobs); a language override then touches only the coordinator.
- Scenario: n/a (medium). Effect on the seat: every job carries the project's Polish human-register file in its fixed context, and a project file that omits `## Cue: Agent` leaves jobs with no audience cue.

### K-05 The shop manual ships ≈2.5k tokens per request for features the seat does not use
- Area: cost
- Severity: medium
- Location: `hook/communication.ts:164-169`, `templates/agents.md:21-32`, `templates/agents.md:38-40`, `templates/agents.md:57`, `templates/agents.md:71-73`, `templates/agents.md:96`, `templates/agents.md:98`, `templates/agents.md:150`, `templates/agents.md:164`, `templates/agents.md:199-214`, `templates/agents.md:228`
- Evidence: byte sizes at `rebuild-base` (`awk` over the file): groups 1253, GitHub doorbell 1576, Linear 358, workspace 619, personal model routes 910, private planning 443, picture 1601, research 1614, finish-ping fallback 997, OMP 533 = 9,904 B ≈2,476 tokens of the 47,379 B (≈11.8k) manual, sent on every coordinator request.
- Rule: z. 8, z. 21
- Verdict: non-compliant
- Direction: Keep the always-on manual to the default loop; move optional features to notes the coordinator opens on demand (z. 21 three levels), and cut the features cut in Table A.
- Scenario: n/a (medium).

### K-06 Model routing lives in prose; the code silently falls back to an OpenAI route
- Area: cross-cutting
- Severity: medium
- Location: `src/runtime/engine.ts:89`, `src/commands/continue.ts:195`, `src/commands/spawn.ts:179`, `templates/agents.md:69`, `templates/agents.md:94`, `docs/seat/quota-resume.ts:163-164`
- Evidence: `|| "openai-codex/gpt-6-astra:high"`; `const chosenModel = model ?? defaultModel(review);` (a continuation does not inherit the parent's model); the shop manual holds 51 `<board engine|provider|model|reasoning|timeout>` placeholders and says "never silently substitute a model" (`templates/agents.md:69`).
- Rule: z. 14, z. 21
- Verdict: non-compliant
- Direction: Record the route once (project or seat config read by `spawn`/`continue`, defaulting a continuation to its parent's route) and drop the per-command route prose; with one provider and one model the four flags carry no decision.
- Scenario: n/a (medium). Effect: a spawn or continue that misses a flag starts on a route the seat cannot serve and fails after setup; the prose that guards it costs tokens on every coordinator request.

### K-07 Guidance already in the system prompt is re-requested as forced reads
- Area: cost
- Severity: medium
- Location: `hook/communication.ts:124-143`, `hook/communication.ts:183-186`, `hook/communication.ts:434-442`, `hook/communication.ts:599-616`
- Evidence: `const ask = \`make your next tool call a read of ${shown} lines ${lineList(sections)}\`;` and `const again = "even if an earlier copy is in your context";` — for styleguide sections (after any non-`.md` write), the register's Specs section (after a `spec/` edit) and the vision (after `limen spawn` or `git merge`), all of which the same hook already puts in the system prompt (`:170-186`; vision for the coordinator `:177-182`).
- Rule: z. 3, z. 8
- Verdict: non-compliant
- Direction: Choose one channel per guidance file: either the system prompt, or a pointer plus a read on demand; not both.
- Scenario: n/a (medium). Effect: an extra model round-trip and a second copy of the section in history per area, again after every compaction (`:117-123`).

### K-08 The drift advisory repeats in every coordinator prompt for the operator's deliberate overlay
- Area: cost
- Severity: medium
- Location: `hook/communication.ts:245-249`, `src/project/inherit.ts:15-20`, `src/project/inherit.ts:95-109`
- Evidence: `communication.md` is drift-tracked (`[".agents/limen/communication.md", "templates/communication.md"]`); any project file that differs yields `overlay (differs; keep, drop, or edit)` plus "Ask whether to delete leftovers and stale copies … or keep overlays", added to the hidden cue of every non-job prompt (≈330 B ≈83 tokens).
- Rule: z. 3
- Verdict: non-compliant
- Direction: Report drift once (at `limen init` or in `limen status`), not per prompt, and let a project mark an overlay as intended.
- Scenario: n/a (medium). Effect on the seat: every project has the Polish overlay, so every coordinator prompt carries this block into history and invites a question to the owner.

### K-09 The per-prompt hidden cue restates the system prompt and accumulates in history
- Area: cost
- Severity: low
- Location: `hook/communication.ts:94-98`, `hook/communication.ts:216-220`, `templates/capability.md:5-7`, `templates/communication.md:128-142`
- Evidence: capability `## Cue` repeats `## Frame` (`templates/capability.md:3` vs `:7`); each prompt adds ≈221 tokens (coordinator; ≈262 on a wake) or ≈237 (jobs) that stay in history.
- Rule: z. 3, z. 4
- Verdict: partial
- Direction: Keep only the variable parts in the cue (audience switch, failure, last touch, ticket); the fixed text is already in the frozen prefix.
- Scenario: n/a (low).

### K-10 The capability frame tells every agent that time is abundant, on a shared quota
- Area: cost
- Severity: medium
- Location: `templates/capability.md:3`, `templates/capability.md:7`, `hook/communication.ts:157-160`, `hook/communication.ts:217`
- Evidence: `templates/capability.md:3` "In Limen, many strong agents work in parallel, so engineering time is abundant: writing, testing, reviewing, and redoing a change take minutes." — in the system prompt and again in every hidden cue; a project register cannot replace it (`hook/communication.ts:297`).
- Rule: none
- Verdict: n/a
- Direction: Replace the frame with the real constraint (one shared subscription, one job at a time; spend tokens where they buy evidence) and keep it project-overridable.
- Scenario: n/a (medium).

### K-11 The task-note mechanism adds work to every job, read-only roles included, and its experiment was never closed
- Area: cost
- Severity: medium
- Location: `src/job/task-note.ts:35-52`, `src/job/task-note.ts:70-105`, `hook/finish.ts:64-68`, `hook/finish.ts:85-96`, `templates/scout.md:6`, `README.md:109-117`
- Evidence: `[limen] Before other work, read ${join(jobDir, NOTE)}, or write it if there is none.` (≈397 tokens once per session), then one more model turn at the end (`return { entries: [...], continue: true };`) or a second `finish` call; scout says "Do not edit, create, or delete files." `README.md:109` "How to measure, after about one week." — no measuring code in `src/`, `hook/` or `bin/` (Table C, task-note row).
- Rule: z. 37, z. 40
- Verdict: non-compliant
- Direction: Run the README's measurement now and keep the note only if it moves the reviewer FAIL rate; at minimum skip it for read-only roles (scout, reviewer, judge, researcher).
- Scenario: n/a (medium).

### K-12 The keeper spends a model session on mostly deterministic link fixes, even when the check is clean
- Area: cost
- Severity: medium
- Location: `src/commands/keeper.ts:81-100`, `src/commands/keeper.ts:109-116`, `src/job/wake-text.ts:127-134`, `templates/keeper.md:11-18`
- Evidence: `...(gate.ok && gate.lines.length === 0 ? ["no error"] : gateLines),` then `spawnCommand([... "--role", "keeper", "--detached", ...])` unconditionally; the done wake asks for a keeper whenever a job "added, moved or changed a ticket" (`wake-text.ts:133`). The keeper's checklist is front matter fields, number collisions, place ids, one board line, map paths — mostly checkable by `limen ticket check` / `picture build --strict`.
- Rule: z. 21
- Verdict: non-compliant
- Direction: Make the fixes a script (renumber report, path rewrite, board-line check) and spawn a model only for the residue the script cannot fix; never spawn on a clean check.
- Scenario: n/a (medium).

### K-13 Session and turn multipliers per ticket
- Area: cost
- Severity: medium
- Location: `templates/agents.md:156-157`, `templates/agents.md:162`, `templates/agents.md:100`, `templates/agents.md:201-214`, `src/job/wake-text.ts:35-37`
- Evidence: an ordinary ticket may run worker → review → repair → re-review → keeper (5 job sessions; "one repair and one re-review settle an ordinary ticket", `:157`), each with a coordinator wake turn on the 15.9k-token prefix plus history; quality starts "unprompted" after ten landings (`:100`); research is 2 researchers + 1 judge (`:201-211`); review, reports and judgment are filed "verbatim" by the coordinator (`:157,208,214`), i.e. re-emitted as output tokens.
- Rule: z. 7, z. 21
- Verdict: partial
- Direction: Make review opt-in per ticket class in code (not prose), file job messages by `cp` of `.limen/jobs/<id>/result` (a `limen file` verb), and drop unprompted quality passes on a shared quota.
- Scenario: n/a (medium).

### K-14 The completion wake injects the whole final message into the coordinator
- Area: cost
- Severity: low
- Location: `src/job/wake-text.ts:15-19`, `src/job/wake-text.ts:35-37`
- Evidence: "the final message is never cut" — `sections.push(\`Final message:\n${result}\`);`, while the same text sits in `<jobDir>/result`.
- Rule: z. 6, z. 7
- Verdict: partial
- Direction: Put the first lines (verdict, open checks) and the file path in the wake; the coordinator reads the rest only when it acts on it.
- Scenario: n/a (low).

### K-15 Continuations re-cache the whole transcript behind a changed prefix
- Area: cost
- Severity: low
- Location: `src/commands/continue.ts:219-220`, `src/commands/continue.ts:355-366`, `src/commands/continue.ts:569`, `src/commands/group-rounds.ts:156-167`
- Evidence: `const role = review ? "reviewer" : …` then `const preamble = resolvePreamble(root, role);` in front of the copied `session/*.jsonl`; the Limen block is rebuilt from current files (K-02); each group round > 0 is a continuation.
- Rule: z. 3
- Verdict: partial
- Direction: Reuse the parent's recorded system prompt for a continuation; remove `continue --review` (the code itself prints "this review is not independent").
- Scenario: n/a (low).

### K-16 A group lead gets a model turn per peer batch
- Area: cost
- Severity: low
- Location: `hook/group-peer.ts:120-143`, `src/job/group-events.ts:173-179`, `docs/groups.md:3`
- Evidence: `{ deliverAs: "followUp", triggerTurn: true }` for each accepted batch; the lead is a recipient of every non-lifecycle event (`(lead && event.kind === "lifecycle")` is the only skip).
- Rule: z. 7
- Verdict: non-compliant
- Direction: Deliver peer findings to the lead only with the final result (as the docs say), or cut groups (Table A).
- Scenario: n/a (low).

### K-17 Every coordinator session runs the group hook with a 1-second timer
- Area: cross-cutting
- Severity: low
- Location: `templates/limen-extension.ts:8`, `hook/group-peer.ts:103-118`, `hook/group-peer.ts:158`, `hook/group-peer.ts:185-207`
- Evidence: `for (const name of ["wake", "communication", "steering", "group-peer"] as const)`; on `session_start` the hook writes `.limen/group-leads/<session>` and starts `setInterval(sweep, 1_000)`; its `context` handler scans every message on each model call.
- Rule: none
- Verdict: n/a
- Direction: Load `group-peer` only for a session that starts a group (or cut groups); `steering` is also a no-op for the coordinator (`hook/steering.ts:67`).
- Scenario: n/a (low).

### K-18 Tools and skills are not scoped per role
- Area: cost
- Severity: low
- Location: `src/runtime/engine.ts:238`, `src/runtime/engine.ts:248-264`, `hook/finish.ts:55-63`
- Evidence: jobs get `--no-extensions` and the `finish` tool (≈65 tokens), but no flag limits the engine's built-in tools or skills index; the only skill handling is the OMP job view (`engine.ts:161-225`). A read-only scout or judge sees the same write/edit/bash tools and skills as a worker.
- Rule: z. 8, z. 13, z. 14
- Verdict: partial
- Direction: Pass a per-role tool and skill allowlist on argv (read-only roles without write/edit), which also turns `templates/scout.md:6` from prose into a guarantee.
- Scenario: n/a (low).

### K-19 `limen sweep --install` is macOS-only; the Linux seat has no sweep schedule
- Area: cross-cutting
- Severity: medium
- Location: `src/project/seat.ts:40-56`, `src/commands/sweep.ts:27-32`, `src/commands/sweep.ts:41-51`, `docs/seat/README.md:7`, `docs/finish-webhooks.md:415-416`
- Evidence: `const path = join(home(), "Library", "LaunchAgents", "limen-sweep.plist");` with no platform branch; it prints `wrote <path>` on Linux. The seat units are bell, prune and GitHub only.
- Rule: z. 14
- Verdict: non-compliant
- Direction: Ship a systemd timer for `limen sweep` in `docs/seat/` and make `--install` refuse on Linux, or cut the sweep and the features that need it.
- Scenario: n/a (medium). Effect: on the seat, dead-coordinator detection, unheard terminal jobs and webhook resends run only while some coordinator's wake hook is alive (`hook/wake.ts:782`).

### K-20 The seat's Pi extensions run in every coordinator with no typecheck, lint or test
- Area: cross-cutting
- Severity: medium
- Location: `tsconfig.json:21`, `biome.jsonc:112-114`, `docs/seat/quota-resume.ts:20-22`, `docs/seat/coordinator-handoff.ts:89-96`
- Evidence: `"include": ["src/**/*.ts", "hook/**/*.ts", "test/**/*.ts"]`; biome excludes the three files; `git grep -E 'coordinator-handoff|quota-resume|statusline' rebuild-base -- test` → 0. Quota resume parses the bridge's error text with `/hit your (?:[\w-]+ )?limit/i`.
- Rule: z. 31
- Verdict: non-compliant
- Direction: Move the two behavioural extensions into `hook/` (or a typed seat folder) under the same checks, with a test that feeds a recorded quota error and asserts one wake after the reset.
- Scenario: n/a (medium).

### K-21 The picture subsystem is ≈28 % of shipped code and sits on the ticket-check path
- Area: cross-cutting
- Severity: medium
- Location: `src/picture/picture-build.ts:29-38`, `templates/worker.md:17`, `templates/keeper.md:16`, `templates/agents.md:162`
- Evidence: `pictureHtml` reads the viewer (`readViewer(…"../../picture/viewer/"…)`) before any diagnostic; `limen picture build … --strict` is the documented ticket check. Lines: viewer 5,150 + `src/picture` 2,830 + tick/watch/command 486 = 8,466 of ≈29,900 code lines (src, hook, bin, viewer).
- Rule: none
- Verdict: n/a
- Direction: Give tickets their own checker (`limen ticket check` over `tickets.ts`/`frontmatter.ts`) and cut the viewer and live map unless the owner uses them.
- Scenario: n/a (medium).

### K-22 Engines and integrations the seat does not use make up ≈6k lines
- Area: cross-cutting
- Severity: medium
- Location: `src/runtime/devin.ts:1`, `src/runtime/engine.ts:44-66`, `src/integrations/coordinator-wake.ts:22-31`, `src/main.ts:38-39`, `src/main.ts:61`, `hook/wake.ts:23`
- Evidence: Devin 303, OMP paths ≈470, GitHub doorbell ≈1,950, finish webhooks ≈1,584, groups 2,054, Linear 145 lines (Table A); the seat runs Pi on one Claude subscription; none of the doorbell, webhook or group units appear in `docs/seat/README.md:7`.
- Rule: z. 38
- Verdict: non-compliant
- Direction: Mark each as unknown usage, confirm with the operator, then cut; at equal effect fewer moving parts win.
- Scenario: n/a (medium).

### K-23 macOS-only branches on a Linux-only seat
- Area: cross-cutting
- Severity: low
- Location: `src/runtime/contain.ts:216-224`, `src/runtime/proc-pidinfo.rb:5`, `src/runtime/start-queue.ts:120-128`, `src/integrations/herdr.ts:570-579`
- Evidence: `runBounded("/usr/bin/ruby", [PIDINFO_HELPER, String(pid)], …)`; `execFile("/usr/bin/memory_pressure", …)`; `notify("/usr/bin/osascript", …)`.
- Rule: none
- Verdict: n/a
- Direction: Drop darwin support (`package.json:33`) and these branches, or move them behind one platform adapter.
- Scenario: n/a (low).

### K-24 `SECURITY.md` misstates Linux process containment
- Area: cross-cutting
- Severity: medium
- Location: `SECURITY.md:9`, `src/runtime/contain.ts:190-210`, `src/runtime/contain.ts:132-136`, `docs/remote.md:77`
- Evidence: `SECURITY.md:9` "On Linux, escaped-descendant containment does not signal at all: identity verification is macOS-only"; `contain.ts:190` `if (process.platform === "linux") {` reads `/proc/<pid>/stat` and `signalIfPresent` signals on a match.
- Rule: none
- Verdict: n/a
- Direction: Rewrite `SECURITY.md:9` from the code (Linux signals verified escaped descendants) so the security note matches the seat.
- Scenario: n/a (medium).

### K-25 Developer docs drift from the code
- Area: cross-cutting
- Severity: low
- Location: `CONTRIBUTING.md:11`, `CONTRIBUTING.md:24`, `CONTRIBUTING.md:29`, `docs/seat/README.md:39`, `docs/diagrams/context-injection.html:346`
- Evidence: see Table C rows 1–3, 5 and 12.
- Rule: z. 36
- Verdict: non-compliant
- Direction: Fix each line, and check doc facts that are code constants (timeouts, hook list) with a test.
- Scenario: n/a (low).

### K-26 No test guards what the model actually receives
- Area: cross-cutting
- Severity: medium
- Location: `test/s4-steering.test.ts:90-92`, `test/fake-engine.mjs:24`, `src/runtime/supervisor.ts:371`, `src/runtime/wrapper.ts:79`
- Evidence: tests count markers once in `fake-system.txt`; the fake engine takes `--append-system-prompt` as literal text, while hosted jobs pass the preamble path (`preamble: requiredEnvironment("LIMEN_PREAMBLE")`) and detached jobs pass the file text (`await readFile(preambleFile, "utf8")`).
- Rule: z. 31, z. 41
- Verdict: non-compliant
- Direction: Add a golden test per role and mode (detached, hosted, continuation) of the exact system prompt and first message, and assert it is byte-identical across two prompts when no file changed.
- Scenario: n/a (medium).

### K-27 Duplicated text across templates
- Area: cost
- Severity: low
- Location: `templates/worker.md:12-17`, `templates/coordinator.md:9-14`, `templates/worker.md:38`, `templates/agents.md:228`, `templates/worker.md:25-26`, `templates/agents.md:195-197`
- Evidence: `worker.md:14-17` and `coordinator.md:11-14` are identical lines (found with a sentence-dedup script over `templates/*.md`); the finish-ping fallback paragraph appears in both the worker preamble and the shop manual; "Independent checks that do not share a compile target, GUI, or proof lane may run in the same turn." appears in both `worker.md:25` and `agents.md:195`.
- Rule: none
- Verdict: n/a
- Direction: Keep one copy per fact, in the role that acts on it; the finish-ping paragraph belongs to neither job nor coordinator prompt if webhooks are cut.
- Scenario: n/a (low).

## To verify

1. Does Pi 1.2.0 treat `--append-system-prompt <value>` as a file path when the value names a file? Hosted jobs pass a path (`src/runtime/supervisor.ts:371`), detached jobs pass text (`src/runtime/wrapper.ts:79`). Settled by the Pi CLI source for that flag, or by a hosted job's recorded session showing the role text.
2. How does the Claude bridge (`pi-claude-bridge`) map Pi's system prompt and messages onto Claude requests, and where are cache breakpoints? K-02 assumes the standard order (tools → system → messages). Settled by the bridge source or by cache-read/cache-write counts in a job's `turns.jsonl` before and after a `limen land`.
3. What does the engine add outside the repo per request (Pi base prompt, built-in tool schemas, skills index, project `AGENTS.md`, and any Claude Code system prompt under the bridge)? Settled by logging one raw request on the seat.
4. Does `agent_before_settle` with `continue: true` (`hook/finish.ts:91`) start a new `before_agent_start`, i.e. a second system-prompt rebuild and cue? Settled by the Pi extension API docs or a fake-engine trace with real Pi.
5. Which optional features run on the seat: GitHub doorbell, finish webhooks, groups, picture watch, Linear, highlight, workspace, private planning? Settled by the seat's `systemctl list-timers`, `spec/linear.md`, `.limen/groups/`, `.git/hooks/reference-transaction`, `.limen/planning-source`, and the webhook env files.
6. Does the seat set `LIMEN_WORKER_MODEL`/`LIMEN_REVIEWER_MODEL`? If yes, K-06's fallback is masked; if no, any flagless spawn or continue fails. Settled by the coordinator pane's environment.
7. How large is the project `AGENTS.md` on the seat, and do jobs load it through the engine? If a project copied the shop manual into `AGENTS.md`, every job carries ≈11.8k extra tokens. Settled by `wc -c AGENTS.md` per project and one job's raw request.
8. What context window does the bridge report for Opus 5.5? The 30 % handoff (`docs/seat/coordinator-handoff.ts:24`) sets how much history each land re-caches (K-02). Settled by `ctx.getContextUsage()` on the seat.
