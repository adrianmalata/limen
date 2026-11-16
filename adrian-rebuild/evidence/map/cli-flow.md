<!-- PL: Mapa powierzchni CLI Limena: wszystkie komendy i podkomendy, stan na dysku (.limen/, spec/, LIMEN_HOME, worktree, gałęzie, katalogi tymczasowe), przepływ ticketu od `limen spawn` do `limen land` z rozróżnieniem, co rozstrzyga kod, a co model (prompt/szablon), rozmiary modułów oraz uwagi do audytu. Plik powstał jako opisowa inwentaryzacja (mapa, nie audyt) na potrzeby przebudowy w gałęzi adrian-rebuild; każde twierdzenie ma odwołanie plik:linia. Stan: kompletny dla zakresu src/commands, src/job, src/project, bin/limen, src/main.ts i docs; src/runtime oraz hook/ przejrzane tylko w zakresie potrzebnym do śledzenia przepływu. -->

# CLI surface, on-disk state and ticket flow

Scope: `bin/limen`, `src/main.ts`, `src/commands/*`, `src/job/*`, `src/project/*`, `docs/{commands,jobs,setup}.md`, `README.md`; `src/runtime/*` and `hook/*` only where the flow passes through them. Paths are repo-relative. "Model" = the step happens only because a prompt/template/doc tells an agent to do it.

Entry: `bin/limen:4` refuses Node < 24; `bin/limen:21-22` imports `src/main.ts` (TS via type stripping). `main.ts:164-171` re-enters as the detached wrapper (`LIMEN_INTERNAL_RUN=1` → `runInternalJob`) or hosted supervisor (`LIMEN_INTERNAL_HOSTED=1` → `runHostedSupervisor`). Before every command except `webhook deliver`: `resendNearbyPings` (`main.ts:186-188`) and `endDueRules` (`main.ts:190-194`). Dispatch table `main.ts:34-64`; help text `main.ts:98-161`.

## 1. Commands

| Command | Purpose | Implementation | Main side effects |
|---|---|---|---|
| `init` | Create project-owned files and hook stubs | `commands/init.ts:10` | Copies templates with `COPYFILE_EXCL` (never overwrites) `init.ts:69-89`; deletes old hook copies `inherit.ts:35-46`; `mkdir .limen/jobs`; registers project in `~/.limen/projects` `init.ts:94`; appends `/.limen/` to `.gitignore` `init.ts:104-119`; refuses legacy `.control` paths `init.ts:39-50` |
| `init --drop-leftovers` | Delete byte-identical prompt copies | `init.ts:15-31` | `rm` of leftover overlays (`listDrift`, `inherit.ts:64-87`) |
| `workspace init` | Same for a non-Git parent | `init.ts:59-67` | As init, plus `spec/workspace.md`, no `.gitignore` |
| `planning [committed\|private]` | Show/set planning source | `planning-source.ts:7` | `atomicWrite .limen/planning-source` `:20`; refuses inside a job `:15` |
| `spawn` | Start a worker/reviewer/role job | `spawn.ts:94` → `spawnJob:164` | Job record publish, `git worktree add`, Herdr tab, detached wrapper or hosted supervisor (see §3) |
| `continue` | Resume a finished job's engine session | `continue.ts:62` → `continueJob:192` | New job record with copied session + note, worktree restore from branch, wrapper/supervisor (§3 step C) |
| `diff` | Show a job's diff | `diff.ts:8` | Prints `git diff base...branch` or opens `hunk` (Herdr tab or inline) `diff.ts:26-53` |
| `steer <id>\|--running` | Queue a correction | `steer.ts:10` | Writes `steer/inbox/NNNN` (`steer-inbox.ts:10`); requires `steer/ready` `steer.ts:46` |
| `stop <id> [reason]` | Stop a job | `stop.ts:14` | Log line; detached: SIGTERM→SIGKILL process group `stop.ts:45-58`, `finalizeJob` `:70`; hosted: `stop-requested` + Herdr stop `stop.ts:75-96` |
| `wait <id>` | Block until terminal | `wait.ts:6` | Read-only; fs.watch + 1 s poll `wait.ts:29-65`; refuses under `LIMEN_COORDINATOR=1` `:14-18` |
| `land <id>` | Merge done job, close ticket | `land.ts:26` | `git merge --no-edit`, branch+worktree delete, ticket move + board + commit (§3 step L) |
| `board [--write]` | Board with job lines | `board-view.ts:26` | `--write`: rewrites NOW/PROVEN in `spec/build.md` `lanes.ts:83-95` |
| `keeper <ticket>` | Spec-link fix job | `keeper.ts:46` | `git branch limen/keeper-<fnnn>-<tip7>` `:102`; temp packet; nested `spawnCommand --role keeper --detached` `:109-116` |
| `jobs [...]` | List/detail job records | `jobs.ts:29` | Not read-only: `confirmDeadJobs` may finalize dead jobs `jobs.ts:36`, `reap.ts:147` |
| `status [--all]` | Plant inbox | `status.ts:68` | Same reaper `status.ts:72`; `herdr agent list`/`tab list` `:340,409` |
| `prune` | Remove finished worktrees | `prune.ts:20-40` | Renames worktrees to `.pruned-<uuid>`, `git worktree prune`, deletes; removes stateless records `prune.ts:246-275` |
| `prune --retire [--dry-run]` | Delete records of landed branches | `prune.ts:54` | `git branch -D`, `rm -r .limen/jobs/<id>` `prune.ts:107-111` |
| `queue` | Seat start queue report | `queue.ts:4` | Samples load ~2 s (`commands.md:69`) |
| `rule` / `rule set` / `rule end` / `rule timer` | Seat-wide rules | `rule.ts:41`, `setRule:78`, `endCommand:116`, `ruleTimer:128` | `~/.limen/rules/<name>/rule.json` (atomic) ; detached `limen rule timer` child `rule.ts:151-159`; `herdr agent prompt` to every live coordinator pane `:166-186` |
| `watch` / `unwatch` | (Un)subscribe this coordinator | `watch.ts:10-39` | `notify/subscribers/<session>` (wx) or rewrite `origin-pane` `watch.ts:72-91` |
| `open <id>` | Focus job in Herdr | `open.ts:6` | Herdr tab/pane ops (`openJobPlace`) |
| `close <FNNN>` | Close feature's Herdr tabs | `close.ts:4` | Herdr tab close (`closeFeatureTabs`) |
| `ticket-author <path>` | Creation-commit author | `ticket-author.ts:4` | Read-only `git log --follow --diff-filter=AC` `git.ts:346-357` |
| `ticket new "…"` | Allocate F-number, write ticket | `ticket.ts:31-108` | `spec/features/<lane>/FNNN-slug/ticket.md` (wx) under series lock `series.ts:50-60`; no commit |
| `ticket check [BRANCH]` | Land ticket gate on demand | `ticket.ts:154` | Temp dir `limen-land-*` (`land.ts:228`); exit 1 on error |
| `ticket done FNNN… [--on]` | Close without land | `ticket.ts:130` | `closeTickets` → move to `done/YYYY-MM/`, board, commit `lanes.ts:102-141` |
| `ticket series [NAME PLANT…]` | Shared F-number series | `ticket.ts:111` | `~/.limen/series/<name>/plants` (atomic) `series.ts:149-168` |
| `sweep` | Seat sweep | `sweep.ts:26-70` | Prunes seat project list; reaper; coordinator exit sweep; webhook resend; `notify/seat/<event>` + OS notification |
| `sweep --install/--uninstall` | Scheduler | `seat.ts:40-56` | Writes/removes `~/Library/LaunchAgents/limen-sweep.plist` (macOS only) |
| `highlight [on\|off]` | Herdr ◆ marker | `highlight.ts:5` | `~/.limen/highlight` (`herdr.ts:21`); renames open tabs |
| `webhook test` / `webhook deliver <dir>` | Finish webhook | `webhook.ts:8` | Sends test ping; `rm .limen/webhook-rejected` `:29`; `deliver` = internal queue sender |
| `linear [on\|off\|status]` | Linear mirror toggle | `linear.ts:7` | Rename `spec/linear.md` ↔ `.off`; write fresh config (wx) `linear.ts:20-33` |
| `github connect\|disconnect\|status` | Bind origin to coordinator | `github.ts:107-116`, `connectDoorbell:306` | `.limen/github/binding.json` 0660, `chown/chmod` to `limen-github` group `github.ts:324-337` |
| `github doctor` / `ensure` / `poll` | Seat diagnostics / poller | `github.ts:83-93`, `github-doctor.ts:132` | `poll` runs `pollGithub` (integrations) |
| `github deliver\|review\|work\|resolve` | Doorbell claim handoff | `github.ts:94-101`, `startGithubJob:380` | `git fetch` + `git branch` at PR head `:449-463`; `.limen/github/inflight/<claim>` mkdir gate `:433-446`; `spawnCommand --tab [--review]` `:404-424` |
| `picture build\|serve\|tick\|watch` | Architecture map | `picture.ts:30` | build: `map.html` (tmp+rename, `picture-build.ts:59`); serve: HTTP 127.0.0.1:4747; tick: nested `limen spawn --role picture` `picture-tick.ts:122-133`; watch: writes `.git/hooks/reference-transaction` `picture-watch.ts:75-77` |
| `group start\|status\|publish\|wait\|stop\|close` (+internal `advance`) | Multi-team groups | `group.ts:397-459`, `startGroup:139`, `advanceGroup` `group-rounds.ts:58` | `.limen/groups/<id>/run.json` etc.; spawns team coordinators via `spawnCommand` `group.ts:350-366`; rounds via `continueCommand` `group-rounds.ts:156` |

Flag parsing: shared `parseFlags` (`flags.ts:23-54`) wrapping `node:util.parseArgs` with per-command messages; only `--x` words are flags (`flags.ts:20-21`).

## 2. On-disk state

### 2a. Job record `<root>/.limen/jobs/<id>/` (directory of plain files; `record.ts:12-13`)

ID: `YYYY-MM-DD-<slug≤32>-<8 hex>` (`job.ts:127-137`). Publication: all starting files written into `<root>/.limen/.publishing-<id>/` with `flag:"wx", flush:true`, then one `rename` to the final path under `worktreeLock` (`publication.ts:96-189`). Lock = `groupLock(<root>/.limen/prune)` → mkdir lock `.limen/prune/.lock` with `owner` pid file, wait mode has no deadline (`publication.ts:13-15`, `group-cabinet.ts:110-170`).

| File | Format | Writer (file:line) | Reader(s) | Atomic? |
|---|---|---|---|---|
| `started-at`, `task.md`, `label`, `branch`, `worktree`, `base`, `role`, `engine`, `planning-source`, `tool-calls`, `last-tool`, `activity`, `log`, `starting`, `priority`, `model`, `repo` | text, one value + `\n` (`task.md` Markdown / raw bytes) | `publishJob` `publication.ts:103-126` | `jobs.ts:332`, `land.ts:86-93`, `continue.ts:333-359`, `prune.ts:224-227`, `keeper.ts:197` | Inside hidden dir + rename |
| `extensions.json` | JSON array | `publication.ts:112` | `readWorkerExtensions` (`wrapper.ts:184`) | same |
| `hosted`, `agent-name` | text note / name | `publication.ts:127-130` | `stop.ts:27-28`, `reap.ts:23,119` | same |
| `origin-session`, `notify/subscribers/<session>` | text / ISO time | `publication.ts:131-134`; later `watch.ts:88-90` (wx) | Pi wake hook, `watch.ts:54-62` | same / wx |
| `origin-tab`, `origin-pane` | text | `publication.ts:135-140`; `watch.ts:76` (atomicWrite), `rm` `:79` | Herdr wake, `watch.ts:61` | same / tmp+rename |
| `group`, `team`, `deadline`, `parent`, `spawned-by`, `spawner`, `continue`, `candidate`, `finish-webhook-author` | text | `publication.ts:141-167` | `lookup.ts:24`, `jobs.ts:332`, `group-cabinet.ts:342` | same |
| `finish-webhook-env` | env text, mode 0600 | `publication.ts:173-179` | `finish-webhook.ts`, `continue.ts:439` | same |
| `session/<time>_<uuid>.jsonl` | JSONL transcript | Engine via `--session-dir` (`engine.ts:238`); continue copies parent's newest (`publication.ts:180-183`, `continue.ts:355-361`) | `continue.ts:355`, `keeper.ts:201`, `usage.ts:20`, `session-commands.ts:109` | copyFile into hidden dir |
| `note.md`, `note.first.md` | Markdown (agent-written) | Agent (prompt `task-note.ts:38`); `note.first.md` by `recordNote` `task-note.ts:113-115`; carried on continue `continue.ts:442-447` | `task-note.ts:71-72`, `noteCheckOpen:125` | plain `writeFileSync` |
| `notify/ready` | `1` | `publication.ts:184`; `watch.ts:90`; `wake-delivery.ts:279` | `wake-delivery.ts:274` | wx |
| `state` | `running\|done\|failed\|stopped` | `spawn.ts:445`, `continue.ts:281`, `wrapper.ts:258`, `finalizeJob` `record.ts:58`; group `stopReservedSlot` `group.ts:558` (plain writeFile) | nearly every command (`reap.ts:10`, `wait.ts:67`, `land.ts:87`, `prune.ts:255`) | `atomicWrite` = tmp `<path>.<pid>.<hex>.tmp` + fsync + rename (`record.ts:14-27`); group path is not |
| `pid`, `born` | int / start time | `writeHandshake` `record.ts:116-128` | `reap.ts:13,41`, `steer.ts:42`, `stop.ts:32` | atomic; deleted in `finalizeJob` `record.ts:71-72` |
| `group-owner.json` | JSON `{pid,born}` | `record.ts:127` (`saveJson`: uuid tmp + rename `group-cabinet.ts:101-105`) | group code | atomic |
| `versions` | text lines `engine x`, `herdr x`, `hunk x` | `spawn.ts:442-444`, `continue.ts:278-280` | `jobs.ts:366` | wx |
| `queued` | JSON `{since,detail,ahead}` | `start-queue.ts:174,220`; rm `:231`, `record.ts:60` | `jobs.ts`, `stop.ts:37` | atomic |
| `start-notice` | text | `start-queue.ts:296-299` | `wrapper.ts:110`, `wake-text.ts:124` | atomic |
| `stop-requested` | reason text | `stop.ts:39,76` (plain), supervisor `supervisor.ts:201` (atomic) | `wrapper.ts:105,116`, supervisor | mixed |
| `stop-reason` | engine stop reason | `wrapper.ts:368` | `jobs.ts:332`, `group-rounds.ts:146` | atomic |
| `result` | final message / handoff | `hook/finish.ts:72` (plain), `wrapper.ts:380` (atomic, only if empty), `devin.ts:103`, `supervisor.ts:568` | `jobs.ts:366`, wake text, `group-rounds.ts:133` | mixed |
| `session-ended` | ISO time | `hook/finish.ts:74` | `supervisor.ts:165` | plain |
| `advisory` | text | `wrapper.ts:271` | `jobs.ts:361` | atomic |
| `open-checks` | lines | `finalizeJob` `record.ts:47-50` from `noteCheckOpen` | `jobs.ts:364`, `wake-text.ts:67` | atomic |
| `finished-at` | ISO | `record.ts:51` | `jobs.ts:182` | atomic |
| `commits`, `tip` | `git log --oneline base..branch` / sha | `recordCommits` `record.ts:95-109` | `jobs.ts:363`, wake text | atomic |
| `log` | `[limen ISO] msg` lines + engine stderr | `appendLimenLog` `record.ts:28-30`; `wrapper.ts:245`; `task-note.ts:116`; `pruneForJob` `prune.ts:123-133` | `jobs.ts:621`, `spawn.ts:843-847` | appendFile |
| `steer/inbox/NNNN`, `steer/claims`, `steer/delivered`, `steer/ready` | text | `enqueueSteer` `steer-inbox.ts:4-19` (wx, seq ≤ 9999); also wrapper timeout steer `wrapper.ts:355-356`; `steer/ready` by `hook/steering.ts:83` | steering hook; `record.ts:53` counts undelivered | wx |
| `notify/claims/*`, `notify/delivered/*`, `notify/herdr-prompt`, `notify/seat/<event>` | dirs/receipts | `wake-delivery.ts:55-121`; `stop.ts:100`; `coordinator-wake.ts:37`; `sweep.ts:113-129` | wake hook, `jobs.ts:371`, sweep | mkdir/wx claims |
| `herdr/agent` | Herdr agent id | `supervisor.ts:247` (atomic), `:345` (plain) | `stop.ts:27`, `reap.ts:22` | mixed |
| `ownership-uncertainty`, `cleanup`, `devin-session`, `devin-url` | text/JSON | runtime (not mapped here); rm `record.ts:59` | `jobs.ts:360,369` | — |

### 2b. Project-level (`<root>/.limen/`, `spec/`, `.agents/`, Git)

| Path | Format | Writer | Reader | Atomic / lock |
|---|---|---|---|---|
| `.limen/planning-source` | `committed\|private` | `planning-source.ts:20` | `planning.ts:9-11` | atomicWrite |
| `.limen/prune/.lock/owner` | pid | `groupLock` `group-cabinet.ts:115-168` | same | mkdir lock; stale owner reclaimed after 5 s if pid dead `:131-153` |
| `.limen/groups/<id>/{run.json, launch/.lock, events/*.json, receipts/<r>/*.json, rounds/<n>-<name>/<team>.md, result.md, result-delivery, stop-report.json, activation-error.json}` | JSON / Markdown | `saveJson` (`group.ts:290,526,541`; `group-events.ts:89`); `writeFile` (`group-rounds.ts:136,169,204,250,264`) | group code, `git.ts:34` | JSON via tmp+rename; Markdown plain |
| `.limen/picture/` (dataset, `map.html`, `job`, `tick.lock`) | Markdown dataset / HTML / text | agent (picture role); `picture-build.ts:59`; `picture-tick.ts:139` (atomic); `tick.lock` via `link()` `picture-tick.ts:143-167` | `land.ts:283-306`, `ticket.ts:62-76`, `keeper.ts:84` | lock by hard link |
| `.limen/picture-watch.log` | append log | hook script `picture-watch.ts:116-119` | human | — |
| `.limen/last-sweep` | ISO + session | `hook/wake.ts:777` | `sweep.ts:52` (mtime) | plain |
| `.limen/finish-webhook.env`, `.limen/outbox/`, `.limen/webhook-rejected` | env / queue / text | operator; webhook queue; `webhook.ts:29` (rm) | `finish-webhook.ts:36`, `webhook-queue.ts:83` | — |
| `.limen/coordinators/<session>`, `.limen/coordinator-events/<session>/` | registrations / events | wake hook (`coordinator-signal.ts:89-180`) | `rule.ts:188-198`, `status.ts`, sweep | — |
| `.limen/github/{binding.json, claims/<id>.json, inflight/<id>/, poll.lock}` | JSON / dir gate | `github.ts:324-337,433-446`; poller | poller, `github.ts:291-302` | mkdir gate |
| `spec/features/<lane>/[YYYY-MM/]FNNN-slug/ticket.md` | Markdown + YAML-ish front matter (`opened`, `touches`, `landed`…) | `ticket new` `ticket.ts:99-106` (wx); `closeTickets` rename + `withLanded` `lanes.ts:127-134,161-168`; agents (model) | `readTickets` (picture), `land.ts:309-315`, `series.ts:119-133` | ticket new: series lock; move: plain rename + writeFile |
| `spec/build.md` | Markdown board; NOW/PROVEN generated | `writeBoard` `lanes.ts:83-95` (plain writeFile); coordinator (TRACK/NEXT…) | `board-view.ts:31`, communication hook | not atomic |
| `spec/features/archive.tsv` | TSV (header optional) | operator/agent | `archiveRows` `series.ts:86-116` | — |
| `spec/vision.md` (`test/` cap line) | Markdown | operator | `land.ts:165-169,177` (read at `HEAD`) | — |
| `spec/linear.md[.off]`, `spec/workspace.md`, `spec/quality/YYYY-MM.md` | Markdown | `linear.ts`; `init.ts:73`; quality agent (`templates/quality.md:10`) | agents | — |
| `.agents/limen/{styleguide,worker,reviewer,communication,<role>}.md`, `AGENTS.md` | Markdown overlays | operator/init | `resolvePreamble` `spawn.ts:75-85`, `inherit.ts:48-62` | — |
| `.agents/limen/limits.json` | JSON `{prepare,toolStall}` | operator | `limits.ts:13-51` (each use) | — |
| `.agents/limen/reminders.md` | Markdown | operator | `task-note.ts:14,236` | — |
| `.pi/extensions/limen.ts`, `.omp/extensions/limen.ts` | TS stub | `init.ts:79-80` | engines | COPYFILE_EXCL |
| `.gitignore` (`/.limen/`) | text | `init.ts:104-119` (append) | git | — |
| `.git/hooks/reference-transaction` | sh script with JSON marker line | `picture-watch.ts:75-77` (atomicWrite + chmod 755) | git | atomic |

### 2c. Seat (`$LIMEN_HOME/.limen/`, default `~/.limen/`; `seat.ts:7-9`)

| Path | Format | Writer | Reader | Atomic / lock |
|---|---|---|---|---|
| `projects` | one root per line | `updateRegisteredProjects` `seat.ts:16-35` | `sweep.ts:36`, `rule.ts:190`, `highlight.ts:22` | tmp+rename under `withSeatLock(projects)` |
| `series/<name>/{plants, mark, mark.lock/}` | lines / `FNNN` | `series.ts:55-57,166` | `series.ts:136-206`, `land.ts:325` | `writeAtomic` tmp+rename; `withSeatLock` = sync mkdir lock, 10 s timeout, busy-wait `Atomics.wait` `seat.ts:58-97` |
| `rules/<name>/{rule.json, ended.<version>, pings/<version>.<kind>/<pane>}` | JSON / text receipts | `writeRule` `seat-rules.ts:36-46`; `claimRuleEnd` `:51-63`; `rule.ts:172-180` | `openRules` `seat-rules.ts:66-77`; start queue | tmp+rename; wx claims |
| `start-queue/{entries/<id>.json, reading, last-start, .lock/}` | JSON / ISO | `start-queue.ts:238,256,282` | `start-queue.ts:242-310`, `queue.ts` | atomicWrite; `groupLock(queueDir)` `:272` |
| `start-gate.json` | JSON `{cpuIdle,memoryFree,settle}` | operator | `start-queue.ts:35-47` | — |
| `highlight` | flag | `herdr.ts:21-34` | Herdr integration | — |
| `~/Library/LaunchAgents/limen-sweep.plist` | plist | `seat.ts:40-51` | launchd | plain |

### 2d. Worktrees, branches, temp dirs

| Item | Pattern | Created by | Removed by |
|---|---|---|---|
| Worktree root | `<dirname(repo)>/.<basename(repo)>-limen-worktrees/` | `spawn.ts:324-326` | — |
| Job worktree | `<worktree root>/<id>` (`git worktree add -b <branch> <path> HEAD` / `add <path> <branch>` / `add --detach`) | `executeWorktree` `spawn.ts:624-636`, `git.ts:207-215`; restore in `continue.ts:473-490` | `prune.ts:282-308` (rename to `.pruned-<uuid>`, `git worktree prune`, `rm -r`); `deleteLandedBranch` `prune.ts:189-218` |
| Job branch | `limen/<id>` default (`spawn.ts:323`); `--branch B` reuses existing worktree (`spawn.ts:622`) | `git worktree add -b` | `land` → `git branch -D` (`prune.ts:213`, `git.ts:220-222`); `prune --retire` |
| Keeper branch | `limen/keeper-<fnnn>-<tip7>` | `keeper.ts:76,102` (`git branch`) | land of keeper job; `keeper.ts:118` on spawn failure |
| GitHub branch | `githubBranch(claim)` at PR head | `github.ts:462` | — |
| Temp dirs | `$TMPDIR/limen-land-*` (`land.ts:228`), `$TMPDIR/limen-keeper-*` (`keeper.ts:103`) | `mkdtemp` | `finally rm` (`land.ts:257`, `keeper.ts:121`) |

## 3. Ticket flow: `spawn` → `land`

Who decides: **Code** = a function enforces/does it. **Model** = a prompt/doc tells an agent; no code forces it.

| # | Step | Who decides | Artifacts |
|---|---|---|---|
| 0 | Write ticket: `limen ticket new` or by hand; choose lane | **Model**: `agents.md:152` ("Choose or create the next numbered ticket under `planned/`"), `jobs.md:12`. Number allocation is **code**: `withNextTicketCode` `series.ts:50-60`, `highestTaken` `:186-206` | `spec/features/<lane>/FNNN-slug/ticket.md` (`ticket.ts:100-104`) |
| 1 | Move ticket `planned/`→`active/` | **Model** only: `agents.md:152` ("move its whole folder to `active/` when work begins"); no code moves planned→active (only `--lane active` at creation `ticket.ts:43-46`) | folder rename by agent |
| 2 | Commit the ticket before spawn | **Model**: `agents.md:153` ("In committed mode, commit the feature folder before spawn"), `jobs.md:13`. **Code** check: `assertTicketsAtBase` refuses a `Ticket: spec/...` pointer missing at the base commit `spawn.ts:340-341,365-371` (committed mode only) | coordinator commit |
| 3 | `limen spawn …` with `Ticket:` pointer and `--label "… · FNNN"` | **Model** chooses flags/engine/model from board (`agents.md:94,153`). **Code** validates: `parseSpawnArgs` `spawn.ts:664-724`, `checkLaunchAuthority` `:207-245` (refuses `--role coordinator/lead` `:637-641`), `chooseHostedLaunch` `:247-260`, `preflightEngine` `:181-183`, `resolveSpawnPlace` `:279-299`, private-planning rewrite `planning.ts:70-77` | — |
| 3a | Plan worktree + base | **Code** `planWorktree` `spawn.ts:591-623` (new / reuse / add-branch / detach for review; refuses branch in primary worktree `:614-618` or with a live job `:619-621`); `baseCommit` `:339` | — |
| 3b | Publish job record, print ID | **Code** `publishSpawnedJob` `spawn.ts:413-439` → `publishJob` `publication.ts:96`; `console.log(id)` `spawn.ts:351` | `.limen/jobs/<id>/*` (§2a) |
| 3c | Create worktree | **Code** `executeWorktree` `spawn.ts:353,624-636` | worktree + `limen/<id>` branch |
| 3d | Mark running, launch | **Code** `launchSpawnedJob` `spawn.ts:441-454`: `versions` (wx), `state=running`; detached: `openWatchTab` `:478`, `launchWrapper` env `:479-504` (`wrapper.ts:45-61` spawns `node bin/limen` detached), `waitForHandshake` `:849-864` (10 s, kills + `failed` on timeout); hosted: `openHostedTab` + `launchHostedSupervisor` `:525-590`. Any error → `finalizeJob(failed)` `:360-363` | `versions`, `state`, Herdr tab, wrapper process |
| 4 | Wrapper: start queue, handshake, setup | **Code** `runInternalJob` `wrapper.ts:64`: group deadline check `:72-78`; `enterStartQueue` `:97` (not for group/devin); `writeHandshake` `:101-103`; `waitForStart` `:104-109`; start notice `:110-113`; `setUpJob` (prune finished worktrees, then `--prepare`) `job-setup.ts:22-41`; worktree check `wrapper.ts:121-125` | `pid`, `born`, `queued`, `start-notice`, prune lines in `log` |
| 5 | Engine run | **Code** builds argv `engine.ts:227-275` (`--no-extensions --session-dir <job>/session --append-system-prompt <preamble>`, `--auto-approve` when `toolYolo` `:235-237`), hooks `finish.ts`, `steering.ts`, `communication.ts` (+`group-peer.ts`) `wrapper.ts:179-185`; spawns engine in worktree `:235-239`; records tool events `:395-413`; tool cap/stall/timeout → `failed` `:146-171`; timeout steer `:355-356` | `session/*.jsonl`, `tool-calls`, `last-tool`, `activity`, `log` |
| 5a | Worker reads ticket, writes note, edits, commits | **Model**: `worker.md:22` (read ticket first), `:31` (commit first coherent piece), `:21` (never edit board/ticket status); note prompt injected by code `task-note.ts:35-52` | commits on `limen/<id>`; `note.md` |
| 5b | Note check before finish | **Code** sends `noteCheck` once (`task-note.ts:70-105`; `README.md:97`); **Model** answers "Note check" | `result` |
| 5c | `finish` tool / final message | **Model** (`worker.md:10`, `:40`); hook writes `result` + `session-ended` `hook/finish.ts:72-74` | `result` |
| 6 | (optional) `limen steer` | **Model** (`agents.md:106,221`); **code** delivers via inbox `steer.ts:36-50`, `steer-inbox.ts:4-19` | `steer/inbox/NNNN` |
| 7 | (optional) `limen stop` | **Model** (`agents.md:221`, "Stop only on evidence"); **code** `stop.ts:14-73`; `done: …` reason → `done` `record.ts:34-35` | `stop-requested`, terminal `state` |
| 8 | Finalize | **Code** `wrapper.ts:367-386` → `finalizeJob` `record.ts:36-94`: `commits`/`tip`, `open-checks`, `finished-at`, log line, `state`, rm `pid/born/queued`, group sync, Herdr wake `promptCoordinator` + finish webhook queue, settle tab | `commits`, `tip`, `open-checks`, `finished-at`, `state`, `notify/herdr-prompt` |
| 9 | Wake reaches coordinator | **Code** routes (Pi subscriber hook / Herdr `origin-pane`; `jobs.md:25-37`); **text** from `completionWake` `wake-text.ts:54-113` tells next step ("land it, or name the check…" `:82`; keeper hint `:127-134`) | wake prompt in coordinator session |
| 10 | (scripts) `limen wait` | **Code** `wait.ts:6-26`; refused for coordinator while running `:14-18` | stdout ending (`wake-text.ts:20`) |
| 11 | Inspect: `limen jobs <id>`, `limen diff`, `git diff` | **Model** (`agents.md:154,156`; `jobs.md:50`: "Neither state is approval") | — |
| 12 | Decide review | **Model** only: `agents.md:156` (skip vs. spawn reviewer by blast radius); `build.md` review policy `agents.md:63`. No code gate | — |
| 12a | Review job: `spawn --review --branch <b>` | **Code** detached worktree at branch `spawn.ts:601-608`, role `reviewer` `:316`, `candidate` sha + task suffix `:346,405-406`, `--base/--head` pin `:317-338`; **Model** verdict `PASS/FAIL <sha>` (`reviewer.md:20`) | review job record + detached worktree; `candidate` |
| 12b | File verdict `review-N.md` | **Model** only: `agents.md:157` ("filing is coordinator work… commit `review-N.md` on the candidate branch") | `spec/features/active/FNNN-*/review-N.md` |
| 12c | Repair: `spawn --branch <b>` or `continue <id>` | **Model** (`agents.md:157,222`; one repair + one re-review cap is prompt-only `:157`). **Code** for continue: `continue.ts:192-269` (parent must be terminal `:333-336`, engine must match `:360-365`, copies newest session `:355-361`, carries `note.md` `:442-447`, keeps parent priority `:245`, restores worktree from branch `:473-490`, `--continue <task>` argv `wrapper.ts:189-191`, no prune/prepare `job-setup.ts:18-19`) | new job record on same branch/worktree |
| 13 | (when tickets changed) `limen keeper` | **Model** decides (`agents.md:162`; wake hint `wake-text.ts:133`); **code** forces it indirectly: land refuses failing ticket check and prints keeper command `land.ts:150-151,252-254`. Keeper code: `keeper.ts:46-123` (refuses live jobs `:168-169`, branch at candidate tip `:74-78,102`, packet `:86-100`, nested spawn `--role keeper`, default `--timeout 20m` `:36,109-116`) | `limen/keeper-<fnnn>-<tip7>`; keeper job; `spec keeper: FNNN links` commit (`keeper.md:20`); map edits outside Git |
| 14 | `limen land <id>` | **Model** decides when (`agents.md:111,156-158`); **code** gates: refuses group members `land.ts:27-29`; `state==="done"` + branch + base `:94-99`; target = current branch `:103-113`; staged changes / overlapping dirty files / zero commits `:118-146`; strict ticket check + duplicate F-number `:214-259,317-342`; `test/` line cap from `HEAD:spec/vision.md` `:173-206`; TTY confirm `:38-40` | — |
| 14a | Merge | **Code** `mergeBranch` = `git merge --no-edit <branch>` `git.ts:255-258`; on failure with dirty files: `git merge --abort` `land.ts:47-51` | merge commit (or FF) on current branch |
| 14b | Delete branch + worktree | **Code** `deleteLandedBranches` under worktree lock `prune.ts:168-218` (keeps branch if a live job uses it `:195-196`) | branch deleted; worktree → `.pruned-*` → deleted |
| 14c | Close ticket (unless `--keep-open`) | **Code** `jobFeatures` (label/ID/`Ticket:` pointers, else commit-subject prefix) `job.ts:204-209`; `closeTickets` `lanes.ts:102-141`: refuses dirty board/ticket folder `:117-125`, renames to `done/YYYY-MM/`, sets `landed:` `:127-134`, `writeBoard` `:135`, commit `Close FNNN: landed by <id>` via `git add -A -- paths; git commit -- paths` `:139-140`, `git.ts:303-307`. Errors only printed `land.ts:76-78` | ticket in `done/YYYY-MM/`; regenerated NOW/PROVEN; close commit |
| 15 | After land | **Model**: add `outcome.md`, `limen close FNNN`, delete outside paths (`agents.md:158`); `prune --retire` manual (`jobs.md:133`); quality pass after ten landings (`agents.md:100`, `quality.md:10-13`; no code reference to `quality`) | `outcome.md`, `spec/quality/YYYY-MM.md` |
| G | Group variant | **Model** starts (`agents.md:26`); **code** `startGroup` `group.ts:139-164` spawns team coordinators `:350-366`, rounds via `continueCommand(…, round)` `group-rounds.ts:149-175`, lead-only stop/close `group.ts:449-458`; members cannot land/keeper/steer (`land.ts:27`, `keeper.ts:47`, `steer.ts:11`) | `.limen/groups/<id>/…` |

## 4. Module sizes (`wc -l`)

| File | Lines | File | Lines | File | Lines |
|---|---|---|---|---|---|
| bin/limen | 22 | src/main.ts | 220 | commands/spawn.ts | 864 |
| commands/jobs.ts | 641 | commands/group.ts | 628 | commands/continue.ts | 580 |
| commands/github.ts | 484 | commands/github-doctor.ts | 419 | commands/status.ts | 419 |
| commands/land.ts | 394 | commands/prune.ts | 393 | commands/group-rounds.ts | 265 |
| commands/rule.ts | 234 | commands/keeper.ts | 222 | commands/ticket.ts | 182 |
| commands/board-view.ts | 162 | commands/picture.ts | 135 | commands/sweep.ts | 131 |
| commands/init.ts | 126 | commands/stop.ts | 108 | commands/watch.ts | 104 |
| commands/flags.ts | 87 | commands/steer.ts | 84 | commands/linear.ts | 83 |
| commands/diff.ts | 81 | commands/wait.ts | 74 | commands/webhook.ts | 30 |
| commands/highlight.ts | 27 | commands/planning-source.ts | 23 | commands/open.ts | 22 |
| commands/ticket-author.ts | 18 | commands/close.ts | 10 | commands/queue.ts | 9 |
| job/group-cabinet.ts | 406 | job/wake-delivery.ts | 340 | job/group-events.ts | 338 |
| job/view.ts | 313 | job/job.ts | 274 | job/task-note.ts | 240 |
| job/session-commands.ts | 211 | job/publication.ts | 190 | job/wake-text.ts | 185 |
| job/record.ts | 129 | job/usage.ts | 104 | job/group-packet.ts | 84 |
| job/lookup.ts | 36 | job/steer-inbox.ts | 33 | project/git.ts | 398 |
| project/series.ts | 237 | project/picture-tick.ts | 216 | project/inherit.ts | 199 |
| project/lanes.ts | 181 | project/seat.ts | 157 | project/picture-watch.ts | 135 |
| project/planning.ts | 103 | project/seat-rules.ts | 95 | project/limits.ts | 51 |
| runtime/supervisor.ts* | 584 | runtime/start-queue.ts* | 442 | runtime/wrapper.ts* | 438 |
| runtime/engine.ts* | 328 | runtime/reap.ts* | 167 | runtime/job-setup.ts* | 71 |
| docs/commands.md | 249 | docs/jobs.md | 245 | docs/setup.md | 225 |
| README.md | 133 | | | | |

Totals (`wc -l … | tail -1`): `src/commands` 7 039; `src/job` 2 883; `src/project` 1 772. `*` = skimmed only.

## 5. Observations for the audit

1. **Finalize race between `stop` and the wrapper.** `finalizeJob` checks terminal state then writes without a lock (`record.ts:42`: `if (isTerminal(await textFile(\`${jobDir}/state\`))) {`); `stop` waits 25 ms before finalizing itself (`stop.ts:59`: "Give a signaled wrapper one brief turn to publish its own terminal state before overwriting it.").
2. **Doc vs. code on failed worktrees.** `jobs.md:44`: "A failed job keeps its worktree and transcript." but prune keeps only non-terminal jobs (`prune.ts:153`: `return !isTerminal(state) || retainedGroupJob(jobDir);`) and every new spawn prunes (`job-setup.ts:29`); uncommitted files are lost (`jobs.md:148`).
3. **Post-merge ticket close is not transactional.** Folders are renamed before the commit (`lanes.ts:130`: `await rename(join(root, from), join(root, to));`, commit at `:140`); any error is printed, not raised (`land.ts:77`: "land: tickets stay active: …").
4. **Land has no review or open-check gate.** Only `state` is checked (`land.ts:94`: `if (state !== "done") {`); "done with open checks" and the review decision are prompt-level (`wake-text.ts:86`, `agents.md:156`).
5. **Read commands mutate state and can sleep 10 s.** `limen jobs`/`status` call the reaper (`jobs.ts:36`: `await confirmDeadJobs(jobsRoot);`) which finalizes jobs (`reap.ts:147`) after `reapConfirmMs()` default 10 000 ms (`reap.ts:165`).
6. **Every command runs side channels first.** `main.ts:187`: `await resendNearbyPings(cwd).catch(() => {});` and `main.ts:191`: `endDueRules(args);` which may spawn detached `rule timer` processes (`rule.ts:73`).
7. **Seat sweep scheduler is macOS-only.** `seat.ts:41`: `join(home(), "Library", "LaunchAgents", "limen-sweep.plist")`; no systemd/cron path in `src/` (only `github-doctor.ts:34` names a systemd unit); the target here is a Linux VPS.
8. **Hard-coded owner name in product code.** `land.ts:204`: "or ask Adam to raise the cap."; `lanes.ts:21`: "needs Adam since"; `task-note.ts:8`: "Adam approved the wording below as written (F950)."
9. **Two lock implementations; the publish/prune lock never times out.** `group-cabinet.ts:117`: `const deadline = mode === "wait" ? Infinity : …` (used by `worktreeLock` `publication.ts:14`); separate sync busy-wait lock `seat.ts:78`: `Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);`.
10. **`land --onto` only asserts, never switches.** `land.ts:106-107`: `if (target !== current) { throw new Error(\`land merges onto the current branch (${current}); checkout ${target} first\`);` and land operates on whatever checkout `cwd` resolves to (`land.ts:33-34`).
