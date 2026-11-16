<!-- PL: Audyt Limena przy tagu rebuild-base: mapa systemu (etap 1), znaleziska A-NNN z dowodami i werdyktami
względem rubryki (etap 2) oraz decyzje Adriana o każdym znalezisku (bramka 2). Twierdzenia bez dowodu trafiają
do sekcji To verify, nie do znalezisk. Stan: mapa systemu z etapu 1 gotowa; znaleziska (etap 2) jeszcze nie zaczęte. -->

# Audit of Limen at `rebuild-base`

Every `file:line` reference points at the tag `rebuild-base` (`3b5edd7`).

## Map

Descriptive, no verdicts. Detail with evidence lives in `evidence/map/`: `cli-flow.md` (commands, on-disk state,
ticket flow), `runtime-integrations.md` (processes, lifecycle, integrations, trust boundaries), `agent-context.md`
(what enters each role's context), `tests-docs.md` (tests, docs, picture, tooling). Sizes come from
`tools/context-size.mjs` (`evidence/context-size-rebuild-base.md`); the author's spec index from `tools/spec-index.mjs`
(`evidence/spec-index.md`).

### Components and boundaries

| Component | Code (lines) | Responsibility | Boundary |
|---|---|---|---|
| CLI entry | `bin/limen`, `src/main.ts` (242) | One dispatch table of 30 commands (`src/main.ts:34`); re-enters itself as the detached wrapper or the hosted supervisor (`src/main.ts:164`) | Before almost every command it resends queued webhook pings and ends due seat rules (`src/main.ts:187`, `src/main.ts:191`) |
| Commands | `src/commands` (7039) | spawn, continue, land, steer, stop, wait, jobs, status, prune, keeper, ticket, board, rule, group, github, picture, sweep… | Calls job, project, runtime, integrations; `spawn.ts` (864) and `jobs.ts` (641) are the largest |
| Job record | `src/job` (2883) | A job is a directory of plain files `.limen/jobs/<id>/`, published by one rename (`src/job/publication.ts:96`); `state` is the commit point; only `finalizeJob` writes a terminal state (`src/job/record.ts:36`); wake text, task note, groups | Read by nearly every command; written by spawn, wrapper, supervisor, hooks |
| Project and seat state | `src/project` (1772) | git wrapper, ticket lanes and board, F-number series, seat registry, seat rules, limits, planning source, picture tick/watch | Seat state lives in `~/.limen/` (projects, series, rules, start queue) |
| Runtime | `src/runtime` (3523) | Detached wrapper (own process group, engine child, 90 min timeout, 900 tool calls, stall check); hosted supervisor (1 Hz watch of a Herdr pane); engine argv; start queue; containment; reaper; recovery; Devin runner | Engines are `pi`/`omp` binaries started with Limen's hooks and a preamble (`src/runtime/engine.ts:227`) |
| Integrations | `src/integrations` (3473) | Herdr adapter (every Herdr CLI call), GitHub App poller and doorbell, coordinator registration and wake, finish webhooks with a disk queue | GitHub poller runs as a separate Unix user and reaches the worker account only through `sudo` for two commands |
| Pi hooks | `hook` (2741) | Extensions loaded into every engine session: `communication`, `wake` (1336 lines), `steering`, `finish`, `hosted`, `group-peer` | Inject text into sessions and write job files (`result`, `session-ended`, `steer/ready`) |
| Role prompts | `templates` (1123, 36 files) | Coordinator (`agents.md`), worker, reviewer, judge, keeper, scout, researcher, group member, quality, picture, communication register, styleguide; `templates/.history/` keeps wording history | Copied or resolved into projects by `limen init` and `resolvePreamble` |
| Picture | `src/picture` (2830), `picture/viewer` (5150) | Offline architecture map (`map.html`) and a live board on 127.0.0.1:4747 | No role depends on the viewer, but `picture build --strict` is a ticket check that loads it |
| Seat extensions and services | `docs/seat` (1185) | Pi extensions `quota-resume.ts`, `coordinator-handoff.ts`, `statusline.ts` (kept byte for byte, outside biome and tsc); systemd units `limen-prune`, `limen-github`, `limen-bell`; setup scripts | Installed on the seat by hand; the repo holds copies |
| Tests | `test` (3499, 25 test files, 83 tests) | `s*` scenarios drive the real `bin/limen` on a throwaway "plant" repo; `u*` unit tests call `src/` and `hook/` | Fakes: engine (`test/fake-engine.mjs`), Herdr scripts, GitHub/Devin/webhooks through a fetch sink |
| Author's spec | `spec/` (865 files, 38 MB) | 199 feature folders (active 14, planned 11, done 172, dropped 2), 18 research files, `vision.md`, `build.md` | `spec/vision.md` holds the `test/` line cap that `land` and a test enforce |

### Processes and channels

- One Unix account (the worker) runs the coordinator, every job and the timers; only the GitHub poller runs as its own
  user (`evidence/map/runtime-integrations.md` §2.1).
- Per detached job: `limen spawn` → wrapper (own process group, `src/runtime/wrapper.ts:45`) → engine child in the
  worktree → tool processes. Per hosted job: supervisor polling a Herdr pane once a second.
- Channels: job-directory files (`state` is the commit point), process-group signals, the Herdr CLI and socket, HTTPS
  (GitHub, Devin, webhook targets, ntfy), `sudo` for the poller. No FIFOs.
- Seat timers: `limen-prune` (daily), `limen-github` (poller), `limen-bell` (15 s). `limen sweep` is scheduled only by a
  macOS LaunchAgent (`src/project/seat.ts:41`).

### Ticket flow from `limen spawn` to `limen land`

**Code** = a function does or enforces the step. **Model** = only a prompt or doc makes it happen.

| # | Step | Decided by | Artifacts |
|---|---|---|---|
| 0 | Write the ticket | Model chooses (`templates/agents.md:152`); code allocates the F-number (`limen ticket new`) | `spec/features/<lane>/FNNN-slug/ticket.md` |
| 1 | Move `planned/` → `active/` | Model only (`templates/agents.md:152`) | folder rename |
| 2 | Commit the ticket | Model (`templates/agents.md:153`); code refuses a `Ticket:` pointer missing at the base in committed mode | commit |
| 3 | `limen spawn` | Model picks flags, engine and model; code validates, plans the worktree, publishes the record, launches (`src/commands/spawn.ts:164`) | `.limen/jobs/<id>/`, worktree, branch `limen/<id>`, Herdr tab, wrapper |
| 4 | Queue, handshake, prune, `--prepare` | Code (wrapper, start queue, job setup) | `pid`, `born`, `queued`, `start-notice` |
| 5 | Engine run | Code builds argv and enforces timeout, tool cap and stall; model reads the ticket, edits, commits, writes `note.md`, answers the note check, calls `finish` | commits, `note.md`, `session/*.jsonl`, `result` |
| 6 | Terminal state | Code (`src/job/record.ts:36`); `done` vs `failed` on exit 0 follows the model's `stopReason` (`src/runtime/wrapper.ts:377`) | `state`, `commits`, `tip`, `open-checks` |
| 7 | Wake the coordinator | Code routes; the wake text suggests the next step (`src/job/wake-text.ts:82`) | prompt in the coordinator session |
| 8 | Review | Model decides whether, files `review-N.md`, caps repairs at one plus one re-review (`templates/agents.md:156`, `templates/agents.md:157`); code runs the review job | review job, `review-N.md` |
| 9 | Keeper | Model starts it; code forces it indirectly: `land` refuses a failing ticket check | keeper branch and job |
| 10 | `limen land` | Model decides when (`templates/agents.md:158`); code gates on `state === "done"` (`src/commands/land.ts:94`), dirty overlap, ticket check, `test/` cap; then merges, deletes branch and worktree, closes the ticket, commits (`src/project/lanes.ts:102`) | merge, ticket in `done/YYYY-MM/`, board, close commit |
| 11 | After land | Model: `outcome.md`, close tabs, quality pass after ten landings (`templates/agents.md:100`; no code reads it) | `outcome.md`, `spec/quality/` |

Land checks neither a review verdict nor open note checks; both are prompt-level.

### Sizes

Lines per module at `rebuild-base` (`evidence/context-size-rebuild-base.md`): 186 files, 35 826 lines across `src`,
`hook`, `bin`, `templates`, `test`, `picture`, `docs/seat`, `.pi`, `.omp`, `.agents`.

Context per role at `rebuild-base`, measured by `node adrian-rebuild/tools/context-size.mjs rebuild-base` on a fresh
`limen init` fixture by calling the ref's own hooks with a stub engine API. Only text Limen adds is counted; the engine's
base prompt, built-in tools, skills and `AGENTS.md` loading are outside the repo and not measured. ≈tokens = bytes / 4.

| Role | Fixed per request (preamble + Limen block + `finish` tool) | Per prompt (hidden cue) | Once per session |
|---|---|---|---|
| coordinator (owner-facing) | 63 570 B ≈15 893 (no preamble; shop manual `templates/agents.md` ≈11 845, communication register ≈3 554, capability, vision, styleguide, board digest) | 882 B ≈221; a wake prompt 1 046 B ≈262 | — |
| worker | 23 415 B ≈5 854 (preamble 7 908 B) | 947 B ≈237 | note start 1 588 B ≈397 |
| reviewer, keeper, picture | 18 740–19 183 B ≈4 685–4 796 | 947 B ≈237 | 1 588 B ≈397 |
| judge, scout, researcher, quality, group team | 16 678–17 497 B ≈4 170–4 374 | 947 B ≈237 | 1 588 B ≈397 |

- Every job role carries the same Limen block of 15 248 B ≈3 812: capability frame, the whole communication register
  (its `Human` section alone is ≈1 739) and the styleguide (`evidence/context-size-rebuild-base.md`, "Limen block by
  part").
- The Limen block is rebuilt before every prompt from live project files (`hook/communication.ts:104`); jobs read them
  from the main checkout, not the worktree (`evidence/map/agent-context.md` §3).
- Per event: note check 1 618 B ≈405, steer suffix 427 B ≈107. Wakes, tool-result reminders and group deliveries vary
  with runtime state.
- An ordinary ticket uses 1 to 5 engine sessions (worker, review, repair, re-review, keeper); a group uses teams ×
  rounds (`evidence/map/agent-context.md` §5).
- Production differs from the fixture: projects override `.agents/limen/communication.md`, and their `spec/vision.md`
  and `spec/build.md` are larger. The same script measures a real project with `--project <path>` (read-only copies of
  its guidance files) — a step for the seat, listed for stage 4 `## Measurement`.

## Findings

Pending (stage 2).

## To verify

Pending (stage 2).
