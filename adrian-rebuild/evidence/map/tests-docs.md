<!-- PL: Mapa opisowa testów, dokumentacji, przeglądarki Picture i narzędzi repo Limen w stanie rebuild-base (3b5edd7). Powstała jako materiał wejściowy do audytu: wylicza pliki, scenariusze, atrapy (silnik, Herdr, GitHub/Devin przez fetch sink, sudo), luki pokrycia znalezione grepem, twierdzenia dokumentacji z odnośnikami do kodu oraz konfigurację CI, Biome i TypeScript. To inwentarz, nie ocena; każde twierdzenie ma file:line, a brak dowodu oznaczono "not found". -->

# Map: tests, docs, Picture viewer, tooling

Scope: `test/*`, `docs/*.md`, `docs/reviews/*.md`, `README.md`, `CONTRIBUTING.md`, `SECURITY.md`, `package.json`,
`tsconfig.json`, `biome.jsonc`, `.github/workflows/check.yml`, `src/picture/*`, `src/commands/{picture,board-view}.ts`,
`picture/viewer/*` (viewer.js by `wc -l`/`grep "function "` only). Not read: `spec/`, `docs/seat/`, `adrian-rebuild/input/`.

## 1. Test inventory

25 test files, 82 `test(` call sites (group-extensions loops 2 of them over hosted/detached), plus `plant.ts` and `fake-engine.mjs`; `test/` totals **3,499 lines** (`cat test/* | wc -l`).
`s*` = end-to-end scenarios through real `bin/limen`; `u*` = unit tests importing `src/`/`hook/` directly.

| File | Lines | Scenarios (shortened) | Mechanisms covered | Faked |
|---|---|---|---|---|
| s1-spawn | 130 | spawn refusals leave no job/worktree/branch (12 cases: draft ticket, `--role coordinator`, bad engine, missing PATH, bad `--extension`, pi-claude model, devin `--tab`/`--thinking`/`--provider`/no key); detached job: own worktree from base, exact task bytes, clean env, `jobs` read leaves index untouched, served-vs-requested model + token totals; workspace `--repo` job | spawn, worktree/branch, task-file publication, env scrubbing, `jobs`/`status` read-only, usage, workspace init, spawned-by | engine (fake pi/omp); Herdr off (`LIMEN_HERDR=0`); session `turns.jsonl` hand-written |
| s2-hosted | 251 | live OMP stays running while Herdr says done / loses agent row (88fd5ac); two sweeps start one replacement supervisor (5754dad); flagless spawn in Herdr runs detached, queued start notice once, long prompt via socket; rule set/change/end pings each live coordinator once (F951), dead timer rule still ends; `limen highlight` on/off follows panes/tabs; hosted Pi stop closes tab | hosted supervisor, recovery, start queue gate, Herdr wake (`agent prompt` + socket), seat rules, highlight, `/limen highlight`, stop, tab close | Herdr CLI (node script with `state.json`, `calls.jsonl`, real child engines) + Herdr unix-socket API (`net.createServer`); `start-reading.json`; fabricated `.limen/coordinators/*` |
| s3-finish-wake | 227 | done/failed/provider-error each wake session once with 2 listeners; stop/timeout/tool-cap/stalled tool end once, 80%-timeout steer once, limits file vs env; muted wakes arrive after `/limen on` in one turn (F042); `watch`/`unwatch` move a wake; held gate queues by priority + rule start-priority, start notice once; fallback wake to idle owner | finish, wake hook + claims, note check, open-checks, limits.json, tool cap, stalled-tool, timeout steer, `/limen off/on`, watch/unwatch, start queue, `queue`, rules, fallback wake | engine; coordinator = fake engine + real `hook/wake.ts`; FIFO as load reading (`LIMEN_START_READING`); SIGSTOP/SIGCONT of listener |
| s4-steering | 153 | second `init` removes old hook copies; coordinator gets each guidance source once; steers delivered once in order, late steer refused; worker prompt carries register/styleguide/frame/cue, no board body; `continue` resumes session with parent or replacement extensions, task note copied | init stubs, communication hook injection, seat rule in context, steer inbox, continue, extensions.json, priority inheritance | engine; fake coordinator loading real `.pi/extensions` stubs; rule.json hand-written |
| s5-land | 155 | running/empty/failed refused; `--onto`, group member, staged file, dirty merge file refused; strict ticket check refusal prints keeper cmd; test-line cap refusal names numbers; ff land off TTY, branch deleted, merge beside uncommitted file closes ticket (board PROVEN); conflict aborts cleanly | land gates, test cap at land, ticket strict check, board regen, branch deletion | engine; `spec/vision.md` cap line appended; group `run.json` hand-written; branches amended in temp worktrees |
| s6-keeper | 102 | `ticket new` refuses unknown place, numbers past folders/branches/labels; `picture build --dir/--strict`; keeper refuses running job, starts at candidate tip; `ticket-author` aliased paths; cancelled/archived numbers taken, series never repeats, `ticket check` | ticket new/check/series, archive.tsv, picture build, keeper, ticket-author, `close` (herdr-absent error only), board | engine; second repo for series; symlink alias |
| s7-webhooks | 196 | done job pings only author's target, whole final message; continuation keeps config/route; failed ping retried per target (slow/503/401), never twice; killed deliverer resumed by next command; no secret/URL leaks; coordinator turn-end ping once | finish webhook queue, author routing, retry/backoff, lease recovery, receipts, `webhook deliver`, `status` rejects line, coordinator signals (in-process) | fetch sink (`respond` rows with delay/status/upTo); real `bin/tony-finish-ping.sh`; `process.env` replaced in-process (s7:175) |
| s8-groups | 237 | stale lead starts nothing; 2 concurrent `group start` → 1 roster; launch queued >10 s (b62b837), one slot → one member, worker cannot launch; finish completes while cabinet locked; publish/wait read once, lead gets followUp, synthesis ping; rounds draft/critique/final; close refuses dirty member | group start/advance/rounds, cabinet + launch locks, publish/wait/status/stop/close, group-peer hook, lead-step webhook | engine; lead = fake engine + real `hook/group-peer.ts`; Git `post-checkout` hook + FIFO to hold checkout; fetch sink; **real 12 s sleep** (s8:130) |
| s9-housekeeping | 189 | spawn returns before `--prepare`; prune keeps live/nested/starting, explains removals; `prune --retire`; killed wrapper reaped, stopped job leaves no escaped child, each wakes once; seat registry survives dead-owner lock with 48 racing processes | prune, retire, reap, stop containment, wake, seat registry lock, `workspace init`, `sweep` | engine (`orphan` verb); FIFOs; fabricated job records; ESM `--import` barrier patching `fs` |
| s10-doorbell | 218 | one test: only authorized commenter rings; App replies once each way, never approves; forged claim ignored; restart posts nothing twice; user-posted receipt not trusted | `github poll`, `github work`, permission check, claims, App token exchange, receipts | fetch sink as GitHub API; fake `sudo`, `id`, `herdr` on PATH; generated RSA key; symlink/hardlink of key into job files |
| s11-devin | 98 | devin job pushes branch, follows session, fast-forwards; rewritten branch or suspended session fails; stop/timeout DELETE session; key only in header | devin engine runtime | fetch sink as Devin API; bare git `origin`; clones simulate cloud pushes |
| group-extensions | 187 | detached and hosted Pi teams keep common/private extension selections through workers, reviews, continuation; invalid selections never activate; repeated start keeps originals | `--extension`/`--team-extension`, worker-extensions, hook set per job (`finish`,`steering`,`communication`,`group-peer`,`hosted`) | engine; Herdr CLI script running fake pi synchronously |
| structure | 57 | runtime deps empty + unique `.ts` basenames; template history hash; test line cap | repo invariants | none |
| u1-ticket-diagnostics | 86 | each ticket fault at file:line with fix | `checkTickets`/`readTickets` | tmp ticket tree |
| u2-webhook-trust | 124 | sender sends nothing on bad credential/destination/targets/author map, prints no secret; receipt channel drops malformed lines | sender trust boundary, `parseFinishReceipt` | plant + fetch sink |
| u3-turn-signal | 55 | turn → idle/blocked/goal-done; scout not sent to landing; oversized Herdr prompt not sent | `turnSignal`, `completionWake`, `promptPane` | `/usr/bin/true` as herdr |
| u4-wake-claims | 90 | live claim never taken; dead owner recovered; two failures block | wake-delivery claims | mtimes via `utimes` |
| u5-engine-stream | 55 | pi-claude bridge argv; split-chunk JSON lines; error/aborted stop reason | `argvFor`, stream parser | fake bridge dir under tmp HOME |
| u6-frontmatter | 35 | malformed lines; prototype keys; no raw HTML/JS links | frontmatter parser, Markdown renderer | none |
| u7-job-ids | 54 | id/suffix/label resolution; id shape; duration parsing | `resolveJobId`, `makeJobId`, `parseDuration` | none |
| u9-process-identity | 62 | recycled pid not signaled, recorded birth signaled; reaper keeps live owner | `containEscapedDescendants`, `processInfo`, `reapDeadJobs` | real child processes |
| u10-git-status | 43 | stale-stat `worktreeState` leaves index; idle group member closes (F1083) | `worktreeState`, `noteHostedIdle` | real git repo |
| u11-live-activity | 156 | stale owner/event never "working"; quiet 5/15 min; finished shown 1 h; both engines read alike; group tree | `jobActivity`, `activityReader` | tmp job folders; dead pid |
| u13-guidance-reminder | 34 | edit asks once per area until read/compaction | `hook/communication.ts` tool_result | fake `api.on` |
| u14-task-note | 97 | note shown once, first version kept, changes logged, checked once | `hook/finish.ts`, `task-note.ts` | fake hook API |

**Plant (`test/plant.ts`).** `plant()` makes a realpath'd temp dir, a repo with one commit, runs real `limen init`, writes
ticket F001 and two map nodes, commits (plant.ts:53-101). Env is an allowlist (plant.ts:60-76): own `PATH` with `bin/`
first, `HOME`, `LIMEN_HOME=parent` (isolates seat state per plant), `LIMEN_HERDR=0`, `LIMEN_HUNK=0`,
`GIT_CONFIG_GLOBAL=/dev/null`, `LIMEN_WEBHOOK_RETRY_MS=100`, `LIMEN_START_GATE={"settle":"1ms"}`, `LIMEN_START_POLL_MS=50`,
and `NODE_OPTIONS=--import=sink.mjs`. The sink replaces `globalThis.fetch` in every Limen process, appends each request
to `fetch.jsonl`, and answers from `fetch-responses.json` rows (match/status/body/delayMs/upTo) (plant.ts:230-243).
`fake-engine.mjs` is symlinked as both `pi` and `omp` (plant.ts:58); it loads the real `--extension` hooks
(fake-engine.mjs:116-118), runs the task as a script (`commit`, `fail`, `error`, `say`, `tool`, `block`, `idle`,
`orphan`, `finish`, `/cmd`; :3-5), records argv/env names/task/system/context/events (:26-33), blocks on a FIFO
`fake-gate` (:105-114), and splits stdout inside multi-byte letters (:91-98). Waiting is by `limen wait`, fs watch +1 s
re-check (`until`, plant.ts:174-188) and FIFOs (`release`, :191-194). Cleanup `pkill -f <parent>` then `rm` (:84-85).

**Test line cap.** `structure.test.ts:48-56` sums newline counts under `test/` and compares with
`testLineCap(spec/vision.md)` (regex `` `test/` holds at most N lines``, land.ts:166-169). Land enforces the same cap from
`HEAD:spec/vision.md` on branches that add test lines (land.ts:171-198). Cap value: not read (`spec/` out of scope).

**Timeouts / concurrency.** `node --test --test-concurrency=4 --test-timeout=180000 --test-force-exit test/*.test.ts`
(package.json:24, :27). Per-test 180 s; 4 files in parallel. CI job timeout 20 min (check.yml:15).

## 2. Coverage gaps (descriptive)

Grep base: `grep -nE '\["<verb>"|"<verb>",' test/*.ts` per verb in `src/main.ts:34-65`, then subcommand/flag greps.
"0 hits" = no test file contains the pattern; indirect coverage is possible where noted.

| Mechanism | Code | Grep run | Result |
|---|---|---|---|
| `limen diff` | src/commands/diff.ts:8 | `\["diff"` | 0 hits (only `git diff` in s5) |
| `limen open` | src/commands/open.ts:6 | `"open"` | 0 (only GitHub `state: "open"`) |
| `limen planning` / private planning | src/commands/planning-source.ts:7; src/project/planning.ts:9-80 | `planning` | 0 |
| `limen linear` | src/commands/linear.ts:7 | `linear` | 0 |
| `picture serve` (HTTP+SSE) | src/commands/picture.ts:77; src/picture/picture-serve.ts:23 | `"serve"`, `picture-serve` | 0 |
| `picture tick` | src/commands/picture.ts:71; src/project/picture-tick.ts:22 | `"tick"`, `picture-tick` | 0 |
| `picture watch` (Git reference-transaction hook) | src/commands/picture.ts:36; src/project/picture-watch.ts:17,29 | `"watch", "(on\|off)"`, `picture-watch` | 0 |
| `github connect/disconnect/status/doctor/ensure/resolve/deliver/review` | src/commands/github.ts:83,90,94,98,102-112; github-doctor.ts:132 | `\["github", "` | only `poll`, `work` (s10) |
| `webhook test` | src/commands/webhook.ts:13 | `webhook.*test` | 0 (only `deliver`) |
| `ticket done` | src/commands/ticket.ts:25 | `ticket", "done` | 0 |
| `sweep --install/--uninstall` (LaunchAgent plist) | src/commands/sweep.ts:27-31; src/project/seat.ts:40-56 | `--install`, `launchctl` | 0 |
| seat notifications (`notify/seat`) | src/commands/sweep.ts:114 | `notify/seat` | 0 |
| `coordinator.exited` ping | src/integrations/coordinator-signal.ts:343-360 | `coordinator.exited` | 0 (s7 covers normal-exit removal only) |
| `job.stalled` webhook event | src/integrations/finish-webhook.ts:113,141 | `job.stalled` | 0 |
| `init --drop-leftovers` | src/commands/init.ts:11 | `drop-leftovers` | 0 |
| `board --write` | src/commands/board-view.ts:37 | `"--write"` | 0 (land regenerates board, s5) |
| `land --keep-open` | src/commands/land.ts:61,360 | `"--keep-open"` | 0 |
| `prune --retire --dry-run` | src/commands/prune.ts:22 | `"--dry-run"` | 0 |
| `spawn --review --base/--head` | src/commands/spawn.ts:317-318 | `"--base"`, `"--head"` | 0 (`--review` only in group-extensions) |
| `steer --running`, `watch --running`, `unwatch --all`, `jobs --running/--active/--all`, `status --all` | steer.ts:14; watch.ts:17; jobs.ts:201-204; status.ts:132 | `"--running"`, `"--all"`, `"--active"` | 0 |
| `wait` refusal under `LIMEN_COORDINATOR=1` | src/commands/wait.ts:14 | `LIMEN_COORDINATOR` + `"wait"` | 0 (var set only in s7/s8/s10 for other paths) |
| `keeper --group/--candidate` | src/commands/keeper.ts:34-35 | `"--group"`, `"--candidate"` | 0 |
| hosted ownership binding (Linux, Pi) | src/runtime/hosted-binding.ts:24-102 | `ownership`, `boot` | 0 (hosted Pi runs in s2 without assertions on binding) |
| hosted uncertainty note | src/runtime/hosted-uncertainty.ts:9-21 | `uncertain` | 0 |
| human `jobs` table (`LIMEN_VIEW`, `NO_COLOR`) | src/commands/jobs.ts:32 | `LIMEN_VIEW`, `NO_COLOR` | 0 |
| seat `start-gate.json` file | src/runtime/start-queue.ts:35,47 | `start-gate.json` | 0 (env `LIMEN_START_GATE` only, plant.ts:71) |
| Viewer JS/CSS behaviour | picture/viewer/*.js | `viewer`, `layers`, `live.js` | 0 (s6 builds HTML; no DOM test) |
| group proof fixture | bin/limen-group-fixture.mjs | `limen-group-fixture` | 0 (documented in docs/groups.md:108) |

## 3. Docs inventory

| Doc | Lines | Topic |
|---|---|---|
| README.md | 133 | intro, install, task-note experiment (F950), doc index |
| CONTRIBUTING.md | 35 | `npm run check`, source layout, lint rules |
| SECURITY.md | 13 | trust model, platform limits, reporting |
| docs/commands.md | 249 | CLI reference by role (coordinator/operator) |
| docs/jobs.md | 245 | job lifecycle, wakes, states, keeper, prune, start queue, limits, ownership, recovery |
| docs/setup.md | 225 | install, init, engines/models, Devin, workspaces, overlays, hooks |
| docs/groups.md | 136 | team groups: rounds, publish, receipts, locks |
| docs/herdr-status.md | 208 | reading Herdr vs job state, highlight, webhook receipts |
| docs/picture.md | 100 | architecture map build/serve/tick/watch |
| docs/remote.md | 183 | remote seat model, GitHub doorbell provisioning |
| docs/vps.md | 176 | old record of one VPS setup pass (states it is not the checklist, vps.md:3) |
| docs/finish-webhooks.md | 752 | webhook config, queue, plant events, receipts, retry, file exchange |
| docs/reviews/omp-3day-review-2026-10-18.md | 56 | research review of 3 days of OMP sessions (HTML companion 252 lines, not read) |

Claims (doc:line → code:line):

| Doc claim | Doc | Code |
|---|---|---|
| Workers approve tools automatically | README.md:73 | src/runtime/engine.ts:233,236 (`--approve` / `--auto-approve`) |
| Task note `note.md`, first version `note.first.md` | README.md:88,95 | src/job/task-note.ts:11,107 |
| Log records `note check sent` | README.md:97 | hook/finish.ts:52; src/job/task-note.ts:128 |
| Project reminders file `.agents/limen/reminders.md` | README.md:100-107 | src/job/task-note.ts:14 |
| `limen planning private` setting | README.md:59 | src/project/planning.ts:8-10 (`.limen/planning-source`) |
| "Each test has a 30s timeout" | CONTRIBUTING.md:11 | package.json:24 says `--test-timeout=180000` |
| Runtime deps empty, unique TS basenames | CONTRIBUTING.md:15 | test/structure.test.ts:24-30 |
| `hook/` holds `wake, communication, steering, hosted` | CONTRIBUTING.md:24 | hook/ also has `finish.ts`, `group-peer.ts` (both loaded per group-extensions.test.ts asserts) |
| Complexity ≤25, ≤70 lines per function | CONTRIBUTING.md:35 | biome.jsonc:30,36 |
| Spawn launches `pi --approve` / `omp --auto-approve` | SECURITY.md:5 | src/runtime/engine.ts:233,236 |
| Windows unsupported | SECURITY.md:7 | package.json:32-35 (`os: darwin, linux`) |
| "On Linux, escaped-descendant containment does not signal at all" | SECURITY.md:9 | src/runtime/contain.ts:190-210 reads `/proc/<pid>/stat` birth; :134-136 signals on match, no platform gate |
| Land merges beside uncommitted files; refuses staged changes | commands.md:94 | src/commands/land.ts:115-126 |
| Confirm only on TTY; deletes landed `limen/*` branch | commands.md:96 | land.ts:38, 58-59 |
| Compact `jobs` hides empty jobs older than 7 days | commands.md:65 | src/commands/jobs.ts:23,178 |
| Ticket numbers past lanes/archive/branches/labels | commands.md:117 | src/project/series.ts:50,63 |
| `wait` refuses running job under `LIMEN_COORDINATOR=1` | commands.md:249 | src/commands/wait.ts:14-16 |
| Gate CPU ≥25% idle, memory ≥20% free; settle 60 s | jobs.md:159-160 | src/runtime/start-queue.ts:38 |
| Limits 90 min / 900 tools / prepare 5 min / stall 3 min | jobs.md:170-173 | wrapper.ts:36-38; job-setup.ts:7; stalled-tool.ts:5; limits.ts:13-19 (env > file > default) |
| Stop sends TERM then stronger signal | jobs.md:106 | src/commands/stop.ts:45,55 |
| Publication: hidden dir, one rename | jobs.md:244 | src/job/publication.ts:185 |
| Seat receipt `notify/seat` | jobs.md:245 | src/commands/sweep.ts:114 |
| Records engine versions, refuses none | setup.md:12 | src/commands/spawn.ts:771 (`--version` probe) |
| `init` removes old `limen-*.ts` hook copies | setup.md:60 | src/project/inherit.ts:23-24 (list); init.ts:79-80 (stubs) |
| Engine priority `--engine` > `LIMEN_ENGINE` > pi | setup.md:104-108 | src/runtime/engine.ts:75 |
| Default model `openai-codex/gpt-6-astra:high` | setup.md:119 | src/runtime/engine.ts:89 |
| Devin polls about every 30 s | setup.md:176 | src/runtime/devin.ts:11,159 |
| `--timeout` default 90m, 60 s wrap-up reserve | groups.md:22 | src/commands/group.ts:34 |
| `group wait` call ≤20 s | groups.md:71 | src/commands/group.ts:33 |
| ≤8 events and 8,000 chars per message | groups.md:81 | src/job/group-events.ts:261 |
| Cabinet lock waits up to 10 s | groups.md:121 | src/job/group-cabinet.ts:117 |
| Delivery lease 30 s | groups.md:126 | src/job/group-events.ts:9 |
| status lists cover last 7 days | herdr-status.md:17 | src/commands/status.ts:203; jobs.ts:23 |
| Lands/closes rechecked every 30 s | herdr-status.md:74 | hook/wake.ts:95 (`CACHE_REFRESH_MS = 30_000`, use not traced) |
| Refused tab close retried once | herdr-status.md:96-98 | src/integrations/herdr.ts:520 |
| Highlight stored in seat folder `highlight` | herdr-status.md:106 | src/integrations/herdr.ts:21 |
| Wake delivery confirmed only after answered turn | herdr-status.md:186 | src/job/wake-delivery.ts:55,215 |
| Build never calls a model | picture.md:7 | src/picture/picture-build.ts:40-53 (no engine import) |
| Serve on 127.0.0.1:4747, read 1/s, SSE | picture.md:59 | src/commands/picture.ts:15; src/picture/picture-serve.ts:5-8,64-72 |
| Quiet after 5 min; not responding when owner gone | picture.md:65 | src/picture/activity.ts:77,122 |
| Finished jobs shown 1 h | picture.md:66 | src/picture/activity.ts:81 |
| `watch on` installs `reference-transaction` hook | picture.md:96 | src/project/picture-watch.ts:29 |
| Doorbell never installs key in a checkout | remote.md:16 | src/integrations/github-poller.ts:129,146 (owner/mode checks) |
| Linux identity from `/proc/<pid>/stat`; same code for stop and containment | remote.md:77 | src/runtime/contain.ts:190-210 |
| Duplicate wake possible after >30 s suspend mid-claim | remote.md:87 | src/job/wake-delivery.ts:17,140 |
| Doorbell needs Herdr (no detached fallback) | remote.md:82 | src/commands/github.ts:51-52,236-240 |
| Poller state under `/var/lib/limen-github/state/<sha256(root)>` | remote.md:168 | src/integrations/github-poller.ts:659 |
| Worker must have no noninteractive sudo | vps.md:62-63 | src/commands/github-doctor.ts:164 (`sudo -n -l`) |
| Limen primes Herdr tab focus for `--tab` | vps.md:172 | src/integrations/herdr.ts:120 |
| SSH/Tailscale/Moshi steps | vps.md:15-147 | no code found (operator steps) |
| Sender uses Node HTTP, not curl | finish-webhooks.md:18 | bin/tony-finish-ping.sh:3 |
| `done` → `status: "waiting"` | finish-webhooks.md:22 | bin/tony-finish-ping.sh:175 |
| Try ≤30 s; backoff 5 s ×3 to 10 min; 24 h give-up; 408/429/5xx retried | finish-webhooks.md:302-311 | src/integrations/webhook-queue.ts:21-25,196-207 |
| `Idempotency-Key` header = finishEvent | finish-webhooks.md:320 | bin/tony-finish-ping.sh:173 |
| Exit detection needs `limen sweep --install`; check `launchctl` | finish-webhooks.md:415-416 | src/project/seat.ts:40-48 (writes `~/Library/LaunchAgents` plist only) |
| `ExperimentalWarning` papercut on every call | reviews md:15 | bin/limen:10-18 now filters it |
| Stop hand-keeping NOW/PROVEN (approved) | reviews md:37 | src/project/lanes.ts:70,83; board-view.ts:41 |

## 4. Picture (architecture map + live board)

What: an offline single-file HTML atlas of a project built from a git-ignored Markdown dataset (`.limen/picture/`
`nodes|edges|features|journeys/*.md`, dataset.ts:5) joined with tickets (`spec/features/**`) and the board
(`spec/build.md`, board.ts:10-41); `picture serve` adds a live job strip over SSE.

| Component | Lines | Role |
|---|---|---|
| src/commands/picture.ts | 135 | `build/serve/tick/watch` dispatch; map folder resolution (:100-121); port 4747 (:15) |
| src/commands/board-view.ts | 162 | `limen board [--write]` text board (not the HTML viewer); rules header, jobs under NOW (:26-55) |
| src/picture/picture-build.ts | 65 | `readPicture` (model only), `pictureHtml` (model + viewer), atomic write (:13-65) |
| src/picture/picture-model.ts | 948 | schema `architecture-map/1` → model `architecture-map-model/3` (:162-163); kinds/relations (:164-166); `buildModel` (:195) |
| src/picture/html.ts | 73 | reads 7 viewer files (:22-34); marker check (:36-48); `<`-escaped JSON embed (:51-53); inlines CSS/JS (:56-72) |
| src/picture/picture-serve.ts | 134 | `127.0.0.1` only, Host check (:94-98), routes `/`, `/activity.json`, `/events` (:100); 1 s read, 15 s ping (:7-8) |
| src/picture/activity.ts | 479 | live job states from job folders; quiet/finished windows (:77-81); group trees (:259) |
| src/picture/tickets.ts | 327 | ticket front matter read + `checkTickets` (:35,81) |
| src/picture/frontmatter.ts | 399 | hand-written YAML subset parser (:37) |
| src/picture/markdown.ts | 316 | safe Markdown renderer, `isSafeHref`, `escapeHtml` (:22,295,309) |
| src/picture/board.ts / dataset.ts | 42 / 47 | board sections; dataset reader capped at 10,000 files (dataset.ts:6) |
| picture/viewer/template.html | 50 | shell with `ARCHMAP:CSS/DATA/JS` markers (:7,47,48) |
| picture/viewer/viewer.js | 1555 | IIFE; 58 functions (`adapt`, `arrange`, `lighting`, `wireRoute`, `drawWires`, `sections`, `renderRead`, `init` at :1474); calls `PictureLayers.init` (:1552) |
| picture/viewer/layers.js | 681 | stacked layers, URL hash stack, Esc/Back (:1-6); exports `window.PictureLayers` (:680) |
| picture/viewer/live.js | 728 | live strip; active only when `data-live` set and http(s) (:4-8); `EventSource` (:676) |
| picture/viewer/viewer.css / layers.css / live.css | 1267 / 307 / 562 | tokens + layout; layer stack; live state colours |

Build/serve: `limen picture build` → `buildPicture` → `assembleHtml` writes `<dir>/map.html` (picture.ts:81-89);
`limen picture serve` rebuilds the page per request and pushes `event: activity` on change (picture-serve.ts:33-53,104-107).
Packaged via `files: ["picture", ...]` (package.json:13). No bundler; JS is inlined as classic `<script>` (biome.jsonc:86-95).

Role dependence: no agent role needs the HTML viewer. Role `picture` (spawn.ts:76 → templates/picture.md) writes the
dataset. `land` (land.ts:283-292) and `ticket new --touches` (ticket.ts:61-70) read the **model** via `readPicture` (no
viewer). Worker/coordinator/keeper templates use `limen picture build --strict` as a ticket check
(templates/worker.md:17, coordinator.md:14, keeper.md:16), which goes through `pictureHtml` and therefore reads the viewer
files (picture-build.ts:36). UI strings hard-code the owner name "Needs Adam" (viewer.js:8, layers.js:20; model field
`needsAdam`, picture-model.ts:109).

## 5. Tooling

| Item | Value |
|---|---|
| Scripts | `test` (package.json:24), `typecheck` = `tsc --noEmit` (:25), `format` = `biome format --write .` (:26), `check` = typecheck + `biome check --error-on-warnings .` + test (:27) |
| Runtime deps | `{}` (package.json:51), enforced by structure.test.ts:28 |
| Dev deps | `@biomejs/biome ^2.5.8`, `@types/node ^24`, `typescript ^5.9` (package.json:52-56) |
| Engines/OS | `node >=24`, `darwin`, `linux` (package.json:29-35); `bin/limen` exits on Node <24 (bin/limen:3-7) and runs TS by type stripping (:9-21) |
| CI | `.github/workflows/check.yml`: on push to `main` and any PR (:3-6); matrix `ubuntu-latest`, `macos-latest`, fail-fast off (:10-13); Node 24 + npm cache (:21-24); `fetch-depth: 0` for template history (:17-20); `npm ci` then `npm run check` with `TMPDIR=${{ runner.temp }}` (:25-29) |
| Biome | recommended preset (biome.jsonc:23); errors: `useOptionalChain`, cognitive complexity 25, ≤70 lines/function skipping blanks and IIFEs (:27-37); `noUnusedVariables/Imports` (:42-43); `useBlockStatements`, `noUselessElse`, `useCollapsedIf/ElseIf` (:47-53); nursery `noFloatingPromises`, `noMisusedPromises`, `useAwaitThenable`, `useExhaustiveSwitchCases` (:57-64); `keeper.ts` override: `noNestedTernary`, complexity 20 (:70-83); lint skips `spec/**` (:19); 3 `docs/seat/*.ts` excluded (:108-115); line width 120, tabs (:10-12) |
| Suppressions | 41 `biome-ignore` in src/hook/bin/test/picture: 27 cognitive complexity, 13 function length, 1 control chars (`grep -rn biome-ignore`) |
| TypeScript | `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noUnusedLocals/Parameters`, `noFallthroughCasesInSwitch`, `noImplicitOverride`, `verbatimModuleSyntax`, `erasableSyntaxOnly`, `allowImportingTsExtensions`, `noEmit`; target es2023, lib es2024, nodenext (tsconfig.json:2-19); includes `src`, `hook`, `test` only (:21) — `bin/*.mjs`, `fake-engine.mjs`, `picture/viewer/*.js` are not type-checked |

## 6. Observations for the audit

1. Timeout doc vs config — CONTRIBUTING.md:11 "Each test has a 30s timeout so a leaked watcher fails instead of hanging."
   vs package.json:24 `--test-timeout=180000`.
2. Linux containment doc conflict — SECURITY.md:9 "On Linux, escaped-descendant containment does not signal at all";
   remote.md:77 "`limen stop` and detached process containment use the same code on both"; contain.ts:190 `if (process.platform === "linux") {` returns birth identity and :134-135 signals on a match; u9 asserts "the recorded birth is signaled" and CI runs it on ubuntu.
3. Hook list drift — CONTRIBUTING.md:24 "`hook/` — only the extensions Pi and OMP load by path (`wake`, `communication`, `steering`, `hosted`)"; hook/ also holds `finish.ts` and `group-peer.ts`, which group-extensions.test.ts asserts are loaded once per job.
4. Sweep installer is macOS-only — seat.ts:41 `join(home(), "Library", "LaunchAgents", "limen-sweep.plist")` with no platform branch; finish-webhooks.md:415-416 "Exit detection needs `limen sweep --install` … Check with `launchctl list`"; no test (§2).
5. Repo-wide basename scan — structure.test.ts:15 skips only `["node_modules", ".git", ".omp", ".pi"]`, so `.ts` files under `spec/` and `adrian-rebuild/` count toward the uniqueness assertion (adrian-rebuild currently holds only `.mjs`).
6. One real sleep in the suite — s8-groups.test.ts:130 `await delay(12_000);` while plant.ts:3 says "nothing here sleeps".
7. Known double terminal log — s3-finish-wake.test.ts:131 "a stop logs two until F928 lands (stop.ts's 25 ms grace races the finalize)".
8. CI trigger — check.yml:4-5 `push: branches: [main]`; pushes to other branches run CI only through a pull request.
9. Ticket check depends on viewer assets — templates/worker.md:17 uses `limen picture build … --strict`; picture-build.ts:36 `readViewer(...)` and html.ts:40-41 throw "viewer/template.html must contain the … marker exactly once" before diagnostics print.
10. Test numbering gaps — files run u1–u7, u9–u11, u13–u14 (no u8, u12); u3-turn-signal.test.ts:40 still uses `mkdtemp(join(tmpdir(), "u12-"))`.
