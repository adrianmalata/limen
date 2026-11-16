<!-- PL: Plik zawiera opisową mapę środowiska uruchomieniowego zadań Limen (wrapper, supervisor, silnik, kolejka startowa, odzyskiwanie, reaper, sweep, prune) oraz integracji (Herdr, GitHub App/poller/doorbell, webhooki zakończenia, Devin) i usług stanowiska (timery systemd, rozszerzenia Pi), z odwołaniami file:line. Powstał jako materiał wejściowy do audytu przebudowy na gałęzi adrian-rebuild i opisuje kod z tagu rebuild-base (poza adrian-rebuild/ identyczny z HEAD). To inwentarz, nie audyt: brak ocen i priorytetów; sekcja 6 zawiera tylko wskazówki dla audytorów. -->

# Runtime, integrations and seat services — map

Scope: `src/runtime/*`, `src/integrations/*`, `src/commands/{sweep,prune,github,github-doctor,webhook}.ts`, `bin/tony-finish-ping.sh`, `docs/seat/*`, `docs/{remote,vps,finish-webhooks,herdr-status}.md`.
Adjacent files cited only to anchor callers: `src/main.ts`, `src/job/record.ts`, `src/commands/{spawn,stop,continue}.ts`, `src/project/{seat,limits}.ts`, `hook/{wake,hosted,finish}.ts`.
Notation: `f.ts:N` = line N. "worker" = the single Unix account that runs coordinator and jobs (`docs/seat/agent-setup.md:30`).

## 1. Components

| Component | Files | Responsibility | Boundary (calls → / ← called by) | Lines |
|---|---|---|---|---|
| Detached launcher + wrapper | `src/runtime/wrapper.ts` | `launchDetached` re-execs `bin/limen` detached (`:45-61`); `runInternalJob` runs one detached job: queue gate, setup, engine child, stream→files, timeout / tool cap / stall, finalize (`:64-387`) | → engine, start-queue, job-setup, contain, stalled-tool, stream, devin, coordinator-wake. ← `main.ts:164-166` (`LIMEN_INTERNAL_RUN=1`); launched by `spawn.ts:504`, `continue.ts:548` | 438 |
| Hosted supervisor | `src/runtime/supervisor.ts` | Owns a Herdr-pane job: claim, start agent, 1 Hz watch, idle/stall advisory, finalize (`:74-310`) | → herdr, hosted-binding, hosted-uncertainty, recovery, stalled-tool, finish-webhook. ← `main.ts:168-170` (`LIMEN_INTERNAL_HOSTED=1`); launched by `spawn.ts:564`, `recovery.ts:91` | 584 |
| Engine profiles / argv | `src/runtime/engine.ts` | `pi`/`omp`/`devin` profiles (`:32-67`), binary via `LIMEN_PI/OMP/DEVIN` (`:81-83`), auth preflight (`:91-128`), OMP skill view (`:161-225`), argv (`:227-280`), bridge + Herdr state ext. discovery (`:306-328`) | ← wrapper, supervisor, devin, spawn | 328 |
| Start queue | `src/runtime/start-queue.ts` | Seat-wide gate (CPU idle / free mem / settle), priority 1-3, seat-rule holds; entries in `<seat>/start-queue/` (`:41-44`, `:167-233`) | → seat-rules, group-cabinet `groupLock`. ← `wrapper.ts:97,104`; `limen queue` (`:417`); spawn/continue `queuedLine` (`:399`) | 442 |
| Process containment | `src/runtime/contain.ts`, `proc-pidinfo.rb` | Process identity (Linux `/proc/<pid>/stat` `:190-216`; macOS Ruby `proc_pidinfo` `:217-234`), group signals (`:23-46`), escaped-descendant capture/TERM/KILL (`:54-174`), `cleanup` note (`:175-182`) | ← wrapper, reap, recovery, stop.ts, coordinator-signal, webhook-queue | 326 + 40 |
| Stalled-tool detector | `src/runtime/stalled-tool.ts` | `ps` CPU sampling of engine subtree; "stalled" when children and CPU unchanged for window (`:108-159`) | ← wrapper (acts), supervisor (observes only) | 190 |
| Recovery | `src/runtime/recovery.ts` | Recovery claim dir (`:16-57`), re-locate hosted agent (`:60-85`), relaunch supervisor `LIMEN_HOSTED_RECOVER=1` (`:87-112`) | → herdr, hosted-binding, wrapper. ← reap, `supervisor.ts:115` | 129 |
| Reaper | `src/runtime/reap.ts` | Liveness by pid+birth (`:9-78`), two-pass confirm then finalize `failed` (`:80-162`) | ← `sweep.ts:44`, `status.ts:72`, `jobs.ts:36`, `hook/wake.ts:814` | 167 |
| Hosted binding | `src/runtime/hosted-binding.ts` | Linux+Pi only ownership proof: `engine-launch` / `engine-binding` / `engine-session`, `boot_id`, pane foreground pid (`:24-271`) | ← supervisor, recovery, `hook/hosted.ts:128` | 271 |
| Hosted uncertainty | `src/runtime/hosted-uncertainty.ts` | `ownership-uncertainty` JSON when ownership unobservable (`:21-54`) | ← supervisor; `sweep.ts:82` | 54 |
| Job setup | `src/runtime/job-setup.ts` | After handshake: `pruneForJob`, then `--prepare` shell command (`:22-70`) | → prune.ts. ← `wrapper.ts:115`, `supervisor.ts:140` | 71 |
| Worker extensions | `src/runtime/worker-extensions.ts` | Validates `extensions.json` (absolute local paths, Pi only) (`:7-64`) | ← `wrapper.ts:184`, `supervisor.ts:380` | 64 |
| Stream parser | `src/runtime/stream.ts` | Engine JSON lines → `tool` / `activity` / `assistant` / `log` events (`:7-66`) | ← wrapper; supervisor uses `assistantText` | 116 |
| Devin runner | `src/runtime/devin.ts` | Job as Devin cloud session over REST; git push/fetch/ff-merge (`:84-112`) | ← `wrapper.ts:131-145` | 303 |
| Herdr adapter | `src/integrations/herdr.ts` | Every Herdr CLI call: workspaces, tabs, hosted agent start/status/stop, metadata, notifications, tab close (`:56-931`) | ← supervisor, recovery, reap, spawn, stop, github, sweep, coordinator-wake | 931 |
| GitHub poller | `src/integrations/github-poller.ts` | App JWT, installation token, comment + issue polling, claims, sudo handoff, receipt comments (`:115-768`) | ← `github.ts:76-81` (`limen github poll`) under `limen-github.service` | 768 |
| GitHub shared | `src/integrations/github-review.ts` | Binding/claim types, `readJobFile` (O_NOFOLLOW, nlink 1), `matchedGithubJob` (`:12-159`) | ← poller, github.ts, doctor | 159 |
| GitHub CLI | `src/commands/github.ts` | `connect/disconnect/status/ensure/deliver/review/work/resolve/poll/doctor` (`:74-117`) | → spawn, herdr, poller. ← coordinator; poller via sudo | 484 |
| GitHub doctor | `src/commands/github-doctor.ts` | Read-only seat checks: ownership, units, sudoers, PEM, ACLs, live coordinator (`:132-419`) | ← `limen github doctor` | 419 |
| Coordinator signals | `src/integrations/coordinator-signal.ts` | Coordinator registration under `.limen/coordinators/` (`:168-207`), turn→plant event (`:49-86`), dead-coordinator sweep (`:346-383`) | → finish-webhook. ← wake hook; `sweep.ts:46` | 501 |
| Coordinator wake | `src/integrations/coordinator-wake.ts` | Prompts job `origin-pane` via Herdr argv or socket (`:29-118`, `:145-226`) | ← `record.ts:84` (finalize), `wrapper.ts:112` | 253 |
| Finish webhook | `src/integrations/finish-webhook.ts` | Builds `PlantEvent`, one-shot claims, queues (`:65-249`) | → webhook-queue. ← `record.ts:89`, `supervisor.ts:488`, coordinator-signal | 249 |
| Webhook queue | `src/integrations/webhook-queue.ts` | Disk queue, `.limen/outbox`, lease, detached deliverer, sender with fd 3 (`:46-331`) | → `bin/tony-finish-ping.sh`. ← finish-webhook, `main.ts:187`, `sweep.ts:49`, `hook/wake.ts:782`, `webhook.ts:10-12` | 331 |
| Receipts | `finish-receipt.ts`, `finish-turn.ts` | Parse/validate fd-3 lines; inspection incl. operator export dir (`finish-turn.ts:43-105`) | ← webhook-queue, job view | 175 + 106 |
| Sender | `bin/tony-finish-ping.sh` | Node heredoc: dotenv, target validation, HTTPS POST fan-out, fd-3 receipts (`:3-192`) | ← `webhook-queue.ts:272`, `finish-webhook.ts:193` | 192 |
| Sweep | `src/commands/sweep.ts` | Per project: reap, coordinator exits, resend pings, seat notifications (`:41-70`) | ← `limen sweep` (macOS LaunchAgent, `src/project/seat.ts:40-51`) | 131 |
| Prune | `src/commands/prune.ts` | Remove unstarted records, unkept worktrees; `--retire` landed records/branches (`:20-393`) | ← `limen prune` (timer), `job-setup.ts:29` | 393 |
| Webhook cmd | `src/commands/webhook.ts` | `webhook test` / internal `webhook deliver <dir>` (`:8-30`) | → finish-webhook, webhook-queue | 30 |
| Seat units | `docs/seat/limen-{prune,github,bell}.{service,timer}`, `bell.sh`, `github-setup.sh` | Operator-installed timers, ntfy bell, root GitHub installer | systemd | 9+10, 11+11, 15+11, 30, 120 |
| Seat Pi extensions | `docs/seat/{quota-resume,coordinator-handoff,statusline}.ts` | Coordinator auto-resume, context handoff, status footer (`README.md:39-47`) | loaded by Pi from `~/.pi/agent/extensions/` | 224, 130, 254 |

## 2. Process model

### 2.1 Processes during a job

| Process | Started by | Stopped by | Unix user | Talks via |
|---|---|---|---|---|
| Spawner (`limen spawn`/`continue`) | coordinator or human shell | exits after handshake (`spawn.ts:584` `waitForHandshake`) | worker | writes job dir, `state=running` (`spawn.ts:445`) |
| Detached wrapper (`node bin/limen`, `LIMEN_INTERNAL_RUN=1`) | `launchDetached` `spawn(..., {detached:true, stdio:"ignore"})` (`wrapper.ts:45-51`) → own process-group leader | SIGTERM to group by `limen stop` (`stop.ts:45`) then SIGKILL after 5 s (`stop.ts:53-55`); self-TERM on exhaustion (`wrapper.ts:161-166`) | worker (inherits) | job files; `pid` = pgid (`record.ts:116-119`) |
| Engine child (`pi`/`omp`) | wrapper `spawn(engineBinary, args, {cwd: worktree, stdio: pipe})` (`wrapper.ts:235-239`) | group signals; exits normally | worker | stdout JSON → wrapper parser (`:241-242`); stderr → `log` (`:243-246`) |
| Tool descendants | engine | group signals; escaped ones (pgid ≠ wrapper) by `containEscapedDescendants` (`contain.ts:113-174`) | worker | — |
| Hosted supervisor (`LIMEN_INTERNAL_HOSTED=1`) | `launchHostedSupervisor` (`wrapper.ts:42-44`) from `spawn.ts:564` or `recovery.ts:91` | SIGTERM sets `interrupted` (`supervisor.ts:77-79`); returns when `state` ≠ running (`:161`) | worker | job files, Herdr CLI |
| Hosted engine in Herdr pane | `herdr agent start <name> --kind --pane --timeout -- argv` (`herdr.ts:130-146`) after focusing tab (`:120`) | `herdr agent send-keys <t> ctrl+c` ×2 (`herdr.ts:405-417`); tab close on finalize (`:476-524`) | worker (Herdr server's user) | hooks write `session-ended` (`hook/finish.ts:74`), `engine-session`/binding (`hook/hosted.ts:128-132`), `activity` etc. |
| Herdr server | operator (persistent session; `docs/seat/README.md:22`; linger `agent-setup.md:101`) | operator (`agent-setup.md:245`) | worker | CLI JSON over spawnSync (`herdr.ts:851-872`); unix socket (`coordinator-wake.ts:177-226`) |
| Process-query helpers | `ps -Ao …` (`contain.ts:238`, `stalled-tool.ts:31-34`); `/usr/bin/ruby proc-pidinfo.rb` on macOS (`contain.ts:223`) | 1 s deadline, group SIGKILL (`contain.ts:279-287`) / `timeout: 2000` | worker | stdout |
| Prepare command | `spawn(command, {shell:true, timeout})` (`job-setup.ts:46`) | `timeout` = limit `prepare` (`:39`) | worker | output → `log` (`:66`) |
| Tab closer | detached `node --eval closeJobTab(...)` (`herdr.ts:485-492`) | exits | worker | job `log` |
| Webhook deliverer | detached `bin/limen webhook deliver <dir>` (`webhook-queue.ts:222-237`), env strips `LIMEN_INTERNAL_*` | exits on settle or backoff > 2 min (`:98-106`) | worker | lease file, queue JSON |
| Finish sender | deliverer `spawn(SENDER, …, stdio[3]="pipe", detached)` (`webhook-queue.ts:272-280`) | group SIGKILL at 30 s (`:316-327`) | worker | fd 3 JSON receipts (`tony-finish-ping.sh:79,92`) |
| Coordinator (Pi/OMP in pane, `LIMEN_COORDINATOR=1`) | human (`agent-setup.md:190`) | human; quota/handoff extensions | worker | wake hook files `.limen/coordinators/<session>/` (`coordinator-signal.ts:180-206`) |
| GitHub poller | `limen-github.timer` → oneshot service (`limen-github.service:7-11`) | oneshot exit | `limen-github` (`:8`) | GitHub HTTPS; `sudo -n -u <worker> limen github ensure|deliver` (`github-poller.ts:567-593`) |
| Sweep | `limen sweep` (LaunchAgent `StartInterval 60`, `seat.ts:45`); Linux unit: not found | exits | invoking user | job files, Herdr notification |
| Bell / prune | `limen-bell.timer` 15 s, `limen-prune.timer` daily | oneshot | drop-in `User` (worker per `agent-setup.md:185,200`) | job files, ntfy HTTPS |
| Devin job | no local engine; wrapper polls Devin API (`devin.ts:152-191`) | AbortSignal (TERM/timeout) → `DELETE /sessions/<id>` (`:237-243`) | worker | HTTPS, git |

### 2.2 Channels

| Channel | Where |
|---|---|
| Job-dir files (commit point `state`) | `record.ts:12-13,58`; files: `pid`, `born`, `starting`, `started-at`, `queued`, `start-notice`, `stop-requested`, `stop-reason`, `result`, `log`, `activity`, `last-tool`, `tool-calls`, `advisory`, `cleanup`, `ownership-uncertainty`, `session-ended`, `herdr/*`, `engine-*`, `notify/*`, `steer/inbox`, `finish-webhook*`, `events/` |
| Seat files | `<seat>/start-queue/{entries,reading,last-start}`, `start-gate.json` (`start-queue.ts:35,41-42`); `<seat>/highlight` (`herdr.ts:21`); `~/.limen/projects` registry |
| Steering | `enqueueSteer` (deadline steer `wrapper.ts:350-357`) |
| Signals | group TERM/KILL (`contain.ts:27-29`; `stop.ts:45,55`; `wrapper.ts:161,165`); per-pid TERM/KILL with birth check (`contain.ts:132-169`) |
| Herdr CLI | `spawnSync(herdr, args, {timeout})` default 180 s (`herdr.ts:851`), advisory 2 s (`:846-849`) |
| Herdr socket | JSON line `agent.prompt` when prompt > 96 KiB (`coordinator-wake.ts:14-15,151-173`) |
| HTTP | GitHub API (`github-poller.ts:21,85-101`), Devin API (`devin.ts:254`), webhook targets (`tony-finish-ping.sh:171`), ntfy (`bell.sh:27`), Anthropic usage (`statusline.ts:18`) |
| Pipes | engine stdout/stderr → wrapper; sender fd 3 → deliverer (`webhook-queue.ts:278-311`) |
| sudo | poller → worker CLI, two commands (`github-setup.sh:111`) |
| FIFOs | not found (no `mkfifo` in `src`, `hook`, `bin`, `docs/seat`) |

## 3. Job lifecycle in the runtime

### 3.1 States

| State | Representation | Writer |
|---|---|---|
| starting | no `state`; `starting` = spawner pid | publication (`reap.ts:32-39`, `publication.ts:118`) |
| running | `state=running` | `spawn.ts:445`; wrapper again `wrapper.ts:258` |
| running + queued | `queued` JSON present | `start-queue.ts:173-175,219-220`; removed `:229-232`, `record.ts:60` |
| running + advisory | `advisory`, `ownership-uncertainty`, `cleanup` | `supervisor.ts:484`, `wrapper.ts:268-272`, `hosted-uncertainty.ts:36`, `contain.ts:177` |
| done / failed / stopped | `state` terminal (`job.ts:24`) | only `finalizeJob` (`record.ts:36-94`); no-op if already terminal (`:42-44`) |

`requestedTerminal(reason)` = `done` if reason starts `done:` else `stopped` (`record.ts:34-35`). `isFailedStopReason`: `error`/`aborted` prefixes (`record.ts:31-33`), taken from the model message `stopReason` (`stream.ts:88-101`).

### 3.2 Transitions — detached wrapper (`runInternalJob`)

| Transition | Decider | Signal |
|---|---|---|
| → failed "group deadline or stop before engine launch" | `wrapper.ts:72-78` | group run file |
| queued → stopped/done "stopped while queued" | `wrapper.ts:104-108`; `waitForStart` returns false on abort (`start-queue.ts:198-228`) | SIGTERM / `stop-requested` |
| → stopped "stopped during setup" | `wrapper.ts:116-118` | `stop-requested` |
| → failed worktree missing | `wrapper.ts:121-125`; `job-setup.ts:10-14` | no `.git` |
| → failed `timeout after Nms` | `wrapper.ts:347` → `exhaust` (`:147-171`) | timer |
| → failed `tool-call cap reached` | `wrapper.ts:225-227` | count of `tool_execution_start` (`stream.ts:42-45`) |
| → failed `stalled tool …` | `observeStall` (`wrapper.ts:285-330`) | CPU/children unchanged ≥ window |
| → stopped "process group interrupted" | `wrapper.ts:373-374` | SIGTERM/SIGKILL |
| → failed spawn error / non-zero exit | `wrapper.ts:375-376,384-385` | engine exit |
| exit 0 → done, or failed if last `stopReason` error/aborted | `wrapper.ts:377-383` | **model output** (`message_end.stopReason`) |
| any throw → failed | `failInternalJob` (`wrapper.ts:388-394`; `main.ts:197-199`) | exception |

`result`: a `finish` handoff already in `result` wins over last assistant text (`wrapper.ts:378-381`).

### 3.3 Transitions — hosted supervisor

| Transition | Decider | Signal |
|---|---|---|
| → failed "hosted start failed: …" | `supervisor.ts:146-149,397-400`; `spawn.ts:585-588` | Herdr/setup error |
| → stopped/done before start | `supervisor.ts:313-316,410` | `stop-requested` |
| → failed "group deadline or stop" | `stopForGroup` (`supervisor.ts:194-205`) | group file / clock |
| → done/failed/stopped "hosted session ended" | `sessionEndReason` (`:263-275`) + `finishHostedJob` (`:300-310`) | `session-ended` file (written by `hook/finish.ts:74`); `stop-reason` from session JSONL (model) |
| → … "hosted agent ended" | `:269-274`, `herdr.ts:224-234` | Herdr `missing` ≥ 3 samples and bound pid not alive |
| → done "closed a clean idle session" | `noteHostedIdle` (`:450-452`) | Herdr idle/done + `activity=wait` ≥ idle ms + last assistant text + clean worktree |
| → done/failed group member idle | `:454-456` | same, group member |
| stall advisory (non-terminal) | `:465-468`, `publishHostedStall` (`:479-490`) | idle/blocked/errored |
| SIGTERM → requested or stopped "hosted supervisor interrupted" | `:190-191` | signal |

Herdr `idle`/`done` alone is never completion (`supervisor.ts:212`; `docs/remote.md:84`).

### 3.4 Transitions — Devin and external

| Transition | Decider |
|---|---|
| Devin done: status `running` + detail `finished`/`waiting_for_user` | `devin.ts:194-197`, then ff-merge (`:105-111`) |
| Devin failed: `suspended`/`error`/`exit`, non-retryable HTTP, ff failure | `devin.ts:178-180,198-203,106-110` |
| Devin stopped / timeout | `devin.ts:95-100` |
| `limen stop` detached → stopped (or done with `done:`) | `stop.ts:14-73` (TERM group `:45`, finalize `:70`) |
| `limen stop` hosted: file + ctrl+c, wait ≤ 15 s | `stop.ts:75-95` |
| Reaper → failed "process group gone" / "hosted supervisor lost" | `reap.ts:132-151` |

### 3.5 Timeouts and limits

| Name | Default | Override | Where |
|---|---|---|---|
| Detached timeout | 90 min | `LIMEN_TIMEOUT_MS` (`--timeout`, group deadline) | `wrapper.ts:36,127-130`; `spawn.ts:492,500` |
| Deadline steer | 80 % of timeout | — | `wrapper.ts:349-357` |
| Tool-call cap | 900 | `LIMEN_MAX_TOOL_CALLS` | `wrapper.ts:37-38` |
| Stop grace TERM→KILL | 5 s | — | `wrapper.ts:31`; `stop.ts:53` |
| Tool stall window | 3 min | `LIMEN_TOOL_STALL_MS`, `.agents/limen/limits.json` `toolStall` | `stalled-tool.ts:5-9`; `limits.ts:7-8` |
| Stall sample period | 3 s | — | `wrapper.ts:346`; `supervisor.ts:178` |
| Prepare | 5 min | `LIMEN_PREPARE_MS`, limits `prepare` | `job-setup.ts:7,39` |
| Hosted timeout / tool cap | none | spawn refuses `--timeout` | `supervisor.ts:128`; `spawn.ts:253-254` |
| Hosted idle → stall | 60 s | `LIMEN_HOSTED_IDLE_MS` | `supervisor.ts:50,53-56` |
| Stall re-ring | 15 min | `LIMEN_STALL_RERING_MS` | `supervisor.ts:51,57-60` |
| Hosted agent start ready | 5 s (+2 attempts; shell wait 60 s/15 s) | `LIMEN_HOSTED_START_MS` | `supervisor.ts:49,61-64`; `herdr.ts:117,123,126` |
| Unknown-status samples | 5 | — | `supervisor.ts:48` |
| Hosted stop wait | 15 s | `LIMEN_HOSTED_STOP_WAIT_MS` | `stop.ts:81` |
| Start gate | CPU idle 25 %, mem free 20 %, settle 60 s | `LIMEN_START_GATE` (`off`/JSON), `<seat>/start-gate.json` | `start-queue.ts:38,47-84` |
| Queue poll | 5 s | `LIMEN_START_POLL_MS` | `start-queue.ts:43-44` |
| Startup grace | 10 min | — | `reap.ts:8` |
| Reap confirm | 10 s (two passes) | `LIMEN_REAP_CONFIRM_MS` | `reap.ts:154-166` |
| Process query | 1 s, 1 MiB | — | `contain.ts:8-9` |
| Escaped TERM/KILL grace | 2 s / 1 s | — | `contain.ts:6-7` |
| Herdr CLI call | 180 s (advisory 2 s) | — | `herdr.ts:846-851` |
| Wake prompt | 15 s × 2 attempts | — | `coordinator-wake.ts:9-10` |
| Devin poll / request / terminate | 30 s / 20 s / 4 s | `LIMEN_DEVIN_POLL_MS`, `LIMEN_DEVIN_ACU_LIMIT` | `devin.ts:11-14,53-56,116,159` |
| Webhook try / sleep / backoff / give-up | 30 s / 2 min / 5 s×3ⁿ ≤ 10 min / 24 h | `LIMEN_WEBHOOK_RETRY_MS` | `webhook-queue.ts:21-25,205-208` |
| Sender request | 10 s per target | — | `tony-finish-ping.sh:170` |
| Seat notification threshold | 5 min | `LIMEN_SEAT_RING_MS` | `sweep.ts:43` |
| Hosted uncertainty | 60 s | — | `hosted-uncertainty.ts:7` |
| Coordinator `ask` blocked | 60 s | — | `coordinator-signal.ts:95,227` |

### 3.6 Crash / restart behaviour

| Failure | What happens | Where |
|---|---|---|
| Wrapper dies | Reapers see owner (pid+born) dead on two passes ≥ 10 s apart → `failed` "process group gone" | `reap.ts:80-153`; run by `jobs`, `status`, `sweep`, wake hook (`hook/wake.ts:814`) |
| Supervisor dies | Reaper: Herdr fresh status; agent present → relaunch supervisor with `LIMEN_HOSTED_RECOVER=1`, claim via `recovery` dir rename; `unknown` → wait; `missing` → `writeHostedResult` + `failed` "hosted supervisor lost" | `reap.ts:119-147`; `recovery.ts:16-57,87-129`; `supervisor.ts:114-131` |
| Hosted engine dies | `missing` ≥ 3 samples and binding identity mismatch → finalize | `supervisor.ts:263-275`; `hosted-binding.ts:82-100` |
| Pane moved | locate by name/pane; adopt new pane only if binding proves ownership | `supervisor.ts:226-261`; `herdr.ts:238-295` |
| Herdr unavailable | cached last status + one log line per fault code; `fresh` reads → `unknown` | `herdr.ts:332-377` |
| Reboot | `boot_id` change → binding `mismatch` | `hosted-binding.ts:88-94` |
| Engine escaped children | captured pre-TERM, signalled by birth identity, else `cleanup` note | `contain.ts:99-182` |
| Start-queue entry orphaned | removed when pid dead or state ≠ running | `start-queue.ts:318-337` |
| Deliverer killed | lease pid dead → next deliverer takes over; resend by next `limen` command, sweep, wake hook | `webhook-queue.ts:66-79,113-134`; `main.ts:186-188`; `sweep.ts:49`; `hook/wake.ts:782` |
| Coordinator dies | sweep reads registration + OMP `session_exit`; non-normal → `coordinator.exited` ping | `coordinator-signal.ts:346-383` |
| Poller dies mid-poll | `poll.lock` (`wx`) stays; disconnect waits 60 s then errors | `github-poller.ts:667-668,724-726`; `github.ts:291-303` |
| Ambiguous doorbell handoff | never re-prompted; after 90 s → pending notice | `github-poller.ts:583-585,303-317` |
| Unstarted record, spawner gone | prune removes record + worktree | `prune.ts:151-160,246-275` |

## 4. Integrations

### 4.1 GitHub App, poller, doorbell, reviews

| Aspect | Detail |
|---|---|
| Trigger | `@limen` / `/limen` outside code, quotes, HTML comments (`github-poller.ts:54-75`) in an issue/PR conversation comment, or an open issue body; created after `connectedAt`; author role admin/write/maintain (`:371-377`); thread open, same repo (`:379-438,441-475`) |
| Schedule | `limen-github.timer` OnBootSec 1 min, OnUnitInactiveSec 1 min, `Persistent=true` (`limen-github.timer:5-7`); oneshot (`limen-github.service:7`) |
| Credentials | App PEM at `LIMEN_GITHUB_KEY_FILE` (mode/owner/parent checks `github-poller.ts:138-148`); JWT RS256 iss `LIMEN_GITHUB_APP_ID`, exp +540 s (`:149-156`); installation token scoped to one repo (`:115-124`); env from `EnvironmentFile=/etc/limen-github/poller.env` (`limen-github.service:10`; written by `github-setup.sh:101-109`) |
| Poller preconditions | non-root, absolute registry/state, state 0700 poller-owned, worker uid ≠ poller uid, own module not worker-writable (`github-poller.ts:729-755`); binding user uid = `LIMEN_GITHUB_WORKER_UID` and not in sudo/wheel/admin (`:673-682`) |
| Private writes | `/var/lib/limen-github/state/<sha256(root)>/claims/<id>.json` 0600 (`:546,166-170`), `cursor.json`, `issue-cursor.json` (`:694-722,618-652`) |
| Checkout writes | mirror claim (no nonce) `.limen/github/claims/<id>.json` 0660 (`:159-164`); `.limen/github/poll.lock` (`:667-668`) |
| Handoff | `sudo -n -u <binding.user> /opt/limen/bin/limen github ensure <root>` then `deliver <root> <id> <nonce>` (`:556-614`); worker side `herdr agent prompt <coordinator> <text>` (`github.ts:223-250`) |
| Coordinator actions | `github review|work` → `spawnCommand(["--tab", …])` hosted job (`github.ts:380-430`), inflight gate dir (`:433-446`); `github resolve` writes `.limen/github/outcomes/<id>.json` (`:143-184`) |
| Review pinning | fetch `refs/heads/<base>` and `refs/pull/N/head`, compare SHAs, branch `limen/github-{pr|issue}-N-<id>` (`github.ts:449-463`; `github-review.ts:116-117`) |
| Job match | task.md starts with `GitHub doorbell: <repo>#<id>` (`github-review.ts:114,134`) |
| GitHub writes | issue comments with marker `<!-- limen-github … -->`, dedup by App id (`github-poller.ts:174-216`): start (`:339-346`), terminal with ≤ 1600 chars of `result` or last 10 log lines (`:350-366`), notices, resolved answer (`:241-251`) |
| Connect | must run in Herdr coordinator pane; group `limen-github`; `.limen` 2750, `.limen/github` + `claims` 2770, `binding.json` 0660 (`github.ts:306-339`) |
| Doctor | metadata-only checks of release, Node, Herdr, unit, sudoers, PEM, state, timer, ACLs, live coordinator (`github-doctor.ts:132-419`) |
| Installer | root-only; refuses worker with sudo; installs Node/Herdr/release, user `limen-github`, PEM 0600, ACLs, `poller.env` 0600, sudoers 0440, units; leaves timer disabled (`github-setup.sh:7-120`) |

### 4.2 Finish webhooks and plant events

| Aspect | Detail |
|---|---|
| Config selection | `LIMEN_FINISH_WEBHOOK_ENV` or primary checkout `.limen/finish-webhook.env` (`finish-webhook.ts:31-38`); path snapshot in job `finish-webhook-env` (`publication.ts:174`) |
| Credentials | dotenv keys `LIMEN_FINISH_WEBHOOK_{URL,AUTH,TARGETS,AUTHOR_TARGETS}` read by sender via `parseEnv` (`tony-finish-ping.sh:42-57,97`); Bearer format + HTTPS-only checks (`:60-72`); never in argv (`:2`) |
| Triggers | `finalizeJob` (`record.ts:89`); hosted stall (`supervisor.ts:487-489`); coordinator idle/blocked/goal-done (`coordinator-signal.ts:141-166,306-332`); coordinator exit (`:346-383`); lead step (`finish-webhook.ts:209-249`); `limen webhook test` (`:181-199`) |
| Claims (once) | `finish-webhook-attempt` `wx` (`finish-webhook.ts:74-85`); event dir `mkdir` (`:162-170`) |
| Queue writes | `finish-webhook-queue`, `.limen/outbox/<id>` (`webhook-queue.ts:59-61`), `finish-webhook-lease` (`:117-134`), `finish-webhook-targets` 0600 (`:309`), `finish-webhook-route` (`:298`), `finish-webhook` (`:216-221`), `.limen/webhook-rejected` on 401/403 (`:181-195`) |
| Payload | label, status (`done`→`waiting`), branch, `finishEvent`, handoff + whole final message, event/plant/title/jobId/reason (`tony-finish-ping.sh:148-180`); `Idempotency-Key` header (`:173`) |
| Retry | 408/429/5xx/no answer retried; other 4xx/3xx final (`webhook-queue.ts:196-203`) |
| Inspection export | `LIMEN_FINISH_EVIDENCE_DIR` absolute dir, `receivers.json` ≤ 16 KiB (`finish-turn.ts:43-48`) |

### 4.3 Herdr

| Aspect | Detail |
|---|---|
| Binary / gate | `LIMEN_HERDR` (`0` disables) else `herdr` on PATH (`herdr.ts:775-789`); `HERDR_ENV=1` required for tabs (`:56-58,67,81`) |
| Calls | `workspace list/create`, `tab create/focus/get/close/rename/list`, `pane run/process-info/report-metadata`, `agent start/get/list/send-keys/prompt`, `notification show`, `status --json` (`herdr.ts:120-848`; `coordinator-wake.ts:148,179`) |
| Hosted tab env | `--env K=V` on `tab create` argv (`herdr.ts:737`); values from `spawn.ts:551-562` |
| Writes | job `herdr/{workspace,tab,pane,mode}` (`herdr.ts:901-909`), `herdr/agent` (`supervisor.ts:345`), log lines (`herdr.ts:373,500-503,929-931`), seat `highlight` (`:21-39`) |
| macOS fallback | `osascript` notification (`herdr.ts:579-589`) |

### 4.4 Devin

| Aspect | Detail |
|---|---|
| Trigger | `--engine devin`, detached, not grouped (`devin.ts:37-58`) |
| Credentials | `DEVIN_API_KEY` or `~/.local/share/devin/credentials.toml` key; `DEVIN_ORG_ID` or `devin cloud drs whoami`; `DEVIN_API_URL` (`devin.ts:61-81`); Bearer header only (`:256`) |
| Remote | `POST /v3/organizations/<org>/sessions` with preamble + task + contract (`:114-135`), poll status + messages (`:152-235`), `DELETE` on stop/timeout (`:237-243`) |
| Writes | `devin-session`, `devin-url` (`:131-132`), log (`:167`), `result` (`:103`); `git push origin <branch>` (`:91`), `fetch` + `merge --ff-only` (`:105-110`) |

### 4.5 Systemd / seat timers

| Unit | Schedule | User | ExecStart | Credentials | Writes |
|---|---|---|---|---|---|
| `limen-prune` | `OnCalendar=daily`, Persistent (`limen-prune.timer:5-6`) | drop-in (`limen-prune.service:7`) | `/usr/local/bin/limen prune` in `WorkingDirectory` (`:8-9`) | none | removes worktrees / unstarted records (`prune.ts:134-145`) |
| `limen-github` | 1 min after inactive (`limen-github.timer:5-6`) | `limen-github` | `/usr/bin/node /opt/limen/bin/limen github poll` (`limen-github.service:11`) | App PEM via `poller.env` | §4.1 |
| `limen-bell` | OnBootSec 30 s, every 15 s (`limen-bell.timer:5-6`) | drop-in | `bell.sh` (`limen-bell.service:8-15`) | `NTFY_TOPIC` env in drop-in (`agent-setup.md:185`) | POST `limen: <label> is <state>` to `NTFY_URL` (default: the public ntfy service) and `notify/bell` (`bell.sh:12,25-29`) |
| `limen sweep` | LaunchAgent 60 s (`src/project/seat.ts:40-51`) | invoking | `node bin/limen sweep` | none | seat notifications, `notify/seat/*` (`sweep.ts:113-129`) |

### 4.6 Seat Pi extensions (runtime only)

| Extension | Runtime behaviour |
|---|---|
| `quota-resume.ts` | Only `LIMEN_COORDINATOR=1` (`:171`). On assistant error matching `hit your … limit` schedules `sendUserMessage` at reset + 5 min, else 15 min (`:20-30,182-195`); re-arms from branch on `session_start` (`:197-211`); log `~/.local/state/quota-resume.log` (`:31-40`) |
| `coordinator-handoff.ts` | Coordinator and not job (`:68`). Hidden next-turn reminder once context ≥ `COORDINATOR_HANDOFF_LIMIT_PCT` (default 30) (`:24,88-96`); when `.limen/coordinator-handoff.request` mtime ≥ session start, deletes it and runs `/coordinator-handoff` (`:82-87`); command archives `.limen/coordinator-handoff.md` to `.limen/handoffs/<ts>.md` and opens a new session with it as first message (`:99-129`) |
| `statusline.ts` | Footer; reads OAuth token from `~/.claude/.credentials.json` (`:19,154-163`); GET usage endpoint ≤ once/60 s across sessions via `~/.pi/agent/statusline-limits.json` + `.lock` (`:18-30,135-152`) |

## 5. Security-relevant boundaries (descriptive)

### 5.1 Users

| User | Runs | Evidence |
|---|---|---|
| worker | coordinator, spawner, wrapper, engine, supervisor, hosted engine, Herdr server, deliverer, sender, Devin wrapper, bell, prune | `agent-setup.md:30,185,200`; no uid switching in runtime (only `sudo` uses: `github.ts:40`, `github-doctor.ts:164`, `github-poller.ts:568,587`) |
| `limen-github` | poller; may `sudo -u <worker>` only `limen github ensure *` / `deliver *` | `limen-github.service:8`; `github-setup.sh:111` |
| root | installer, release owner (`/opt/limen`, Node, Herdr) | `github-setup.sh:7,50-79` |
| worker guard | refuses root or sudo/wheel/admin or `sudo -n -l` success | `github.ts:32-44` |

### 5.2 Credentials and env read

| Credential / env | Read at |
|---|---|
| GitHub App PEM, `LIMEN_GITHUB_*` | `github-poller.ts:138-156,730-745`; `poller.env` (`github-setup.sh:101-109`) |
| Installation token (memory only) | `github-poller.ts:683` |
| Finish webhook URL/AUTH/TARGETS | sender only (`tony-finish-ping.sh:42-57`); job stores only the path (`finish-webhook.ts:66`) |
| `DEVIN_API_KEY`, credentials.toml, `DEVIN_ORG_ID` | `devin.ts:61-81` |
| Claude OAuth token | `statusline.ts:154-163` |
| Engine auth | engine's own store; `pi auth check` when `LIMEN_PREFLIGHT=auth` (`engine.ts:112-127`) |
| `NTFY_TOPIC` | `bell.sh:10` (drop-in env) |
| Engine child env | full `process.env` minus listed `LIMEN_*`/`PI_*` and all `HERDR_*` (`wrapper.ts:193-210`) |
| Sender env | full `process.env` + event fields (`webhook-queue.ts:238-253`) |

### 5.3 Untrusted inputs → files / prompts

| Input | Path | Where |
|---|---|---|
| GitHub title/body/discussion/comment | bounded (500/6000/12000/4000 chars) into claim → private state + 0660 checkout mirror | `github-poller.ts:497-547,159-164` |
| same | coordinator prompt as `herdr agent prompt` argv, labelled "untrusted" | `github.ts:235-243,253-268` |
| same | job task text ("Untrusted …") via spawn | `github.ts:402-424,466-484` |
| Coordinator answer (worker identity) | `outcomes/<id>.json` → posted as App comment, nonce-checked | `github.ts:174-182`; `github-poller.ts:258-291`; limit stated `remote.md:166` |
| Job `result` / `log` (model output, worker-owned) | read by poller (O_NOFOLLOW, nlink 1, ≤ 64 KiB) → GitHub comment | `github-review.ts:42-60`; `github-poller.ts:350-366` |
| Engine stdout JSON | `log`, `last-tool`, `activity`, `tool-calls`, `result`, `stop-reason` | `wrapper.ts:395-431,367-381` |
| Engine stderr | appended raw to `log` | `wrapper.ts:243-246` |
| Hosted session JSONL | `result`, `stop-reason` | `supervisor.ts:530-576` |
| Devin messages | `log`, `result`; branch content ff-merged | `devin.ts:166-169,103-110` |
| Job `result` | whole text in webhook `handoff` to external targets | `finish-webhook.ts:87-104`; `tony-finish-ping.sh:153-155` |
| Webhook response body | ≤ 160 printable chars, token/URL redacted → receipts | `tony-finish-ping.sh:85-88,184`; `finish-receipt.ts:83-88` |
| Worktree `.pi/skills` | symlinks in job `skills/`, OMP config YAML | `engine.ts:161-225` |
| `extensions.json` | `--extension` args (Pi) | `worker-extensions.ts:43-64` |
| `--prepare` / `LIMEN_PREPARE` | shell command in worktree | `spawn.ts:356`; `job-setup.ts:37-46` |
| `~/.{pi,omp}/agent/extensions/*.ts` with Herdr marker | loaded into hosted engines | `engine.ts:319-328` |
| `.limen/coordinator-handoff.md` | first message of new coordinator session | `coordinator-handoff.ts:110-120` |
| Herdr JSON | parsed; error codes drive status | `herdr.ts:851-872,332-356` |

Engine approval flags: Pi `--approve`, OMP `--auto-approve`, always `--no-extensions` (`engine.ts:232-238`); preamble via `--append-system-prompt` (`:248`).

## 6. Observations for the audit

1. Hosted jobs run without wall-clock or tool-call bounds. `supervisor.ts:128` — `"hosted supervisor started (no outer timeout or tool-call cap; quiet-tool observation never signals processes)"`.
2. Engines start with tool approval bypassed. `engine.ts:232-237` — `if (profile.projectTrust) { args.push("--approve"); } if (profile.toolYolo) { args.push("--auto-approve"); }`.
3. Engine child inherits the spawner's environment except an explicit deny-list. `wrapper.ts:193-195` — `const childEnvironment: NodeJS.ProcessEnv = { ...process.env,`.
4. Untrusted GitHub text reaches the coordinator as a Herdr prompt argument. `github.ts:240` — `spawnSync(herdr, ["agent", "prompt", binding.coordinator, text]`.
5. The App posts worker-written job output to GitHub. `github-poller.ts:355-356` — `(result ?? "").trim().slice(0, 1600) \|\| (log ?? "").trim().split("\n").slice(-10)…`.
6. The sudo target user comes from the group-writable `binding.json` (bounded by sudoers and a uid check at `:673-681`). `github-poller.ts:568` — `spawnSync("sudo", ["-n", "-u", binding.user, "--", command, "github", "ensure", root]`.
7. The poller's runtime code-integrity check covers its own module file only; imported modules are checked by doctor (`github-doctor.ts:73-96`), not per poll. `github-poller.ts:750` — `const modulePath = await realpath(fileURLToPath(import.meta.url));`.
8. `limen sweep --install` writes only a macOS LaunchAgent; no Linux sweep unit in `docs/seat`, so `coordinator.exited` detection (`sweep.ts:46`) needs a manual sweep on a Linux seat. `src/project/seat.ts:41` — `join(home(), "Library", "LaunchAgents", "limen-sweep.plist")`.
9. The reaper judges the wrapper pid, not the process group, and sends no signal; a surviving engine group is not terminated when the job is marked failed. `reap.ts:42` — `if (!Number.isSafeInteger(pid) \|\| pid <= 0 \|\| !processAlive(pid)) {` (contrast `liveJob` `:17` `processGroupAlive(recorded)`).
10. `finalizeJob` is check-then-write without a lock; wrapper, supervisor, `limen stop` and reapers all call it (side effects are de-duplicated by `wx` claims). `record.ts:42` — ``if (isTerminal(await textFile(`${jobDir}/state`))) {``.
11. Herdr status calls are synchronous `spawnSync` with a 180 s default inside the 1 Hz supervisor loop. `herdr.ts:851` — `function call(herdr: string, args: readonly string[], timeout = 180_000): unknown {`.
12. The webhook handoff carries the job's whole final message to every external target. `tony-finish-ping.sh:155` — `` const handoff = message ? `${next}\n\nFinal message:\n${message}` : next; ``.
