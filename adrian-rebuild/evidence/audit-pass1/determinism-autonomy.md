<!-- PL: Plik zawiera audyt Limena (przebieg 1, bez historii) przy tagu rebuild-base w obszarze determinizmu (priorytet 2) i autonomii (priorytet 3): tabelę przejść workflow z podziałem kod/model, tabelę gwarancji zapisanych w prozie wraz z ich egzekucją w kodzie, tabelę punktów kontaktu z człowiekiem oraz tabelę warunków wyjścia pętli, a potem 25 ustaleń z dowodami plik:linia. Powstał, żeby wskazać, które przejścia i gwarancje rozstrzyga kod, a które tylko prompt, gdzie pętle nie mają twardego limitu z eskalacją do człowieka i co ginie przy wznowieniu po limicie kwoty, kompakcji, rozłączeniu lub restarcie. Trzy eksperymenty na fałszywym silniku w katalogu tymczasowym potwierdziły kluczowe ustalenia: kolejny spawn kasuje niezacommitowaną pracę nieudanego joba, land po FAIL scala nieprzejrzany tip bez potwierdzenia, a limit jednego joba na projekt nie istnieje. Stan: kompletny dla zakresu zlecenia; twierdzenia niemożliwe do udowodnienia w repo są w sekcji „To verify”. -->

# Determinism and autonomy audit — pass 1 (`rebuild-base`)

Scope: `src/`, `hook/`, `templates/*.md`, `docs/` (incl. `docs/seat/quota-resume.ts`, `docs/seat/coordinator-handoff.ts`), tests as evidence of intended behaviour. Every `file:line` was checked with `git show rebuild-base:<path> | sed -n 'Np'`. Rubric: `adrian-rebuild/input/zasady-budowy-harnessu.md` ("z. N").

Experiments ran on a throwaway plant built by `<session scratchpad>/audit-determinism-autonomy/env.sh` (real `bin/limen`, `test/fake-engine.mjs` as `pi`, `LIMEN_START_GATE=off`, throwaway `HOME`/`LIMEN_HOME`, gate `node` first on `PATH`):

- **exp1** — a failed job's uncommitted file is deleted by the next spawn (D-01).
- **exp2** — after a `FAIL` review, a continuation commit is added and `limen land` (stdin not a TTY) lands the unreviewed tip and closes the ticket (D-02, D-03); `prune --retire --dry-run` would delete the unfiled review record (D-16).
- **exp3** — a second job in the same project starts while one runs (D-05).

## Tables

### 1. Workflow transitions: who decides, what enforces it

"Code" = a function decides or refuses. "Model" = only a prompt line makes it happen.

| # | Transition | Decided by | Enforcement / evidence |
|---|---|---|---|
| T1 | idea → `planned/` ticket | Model chooses; code allocates the number and writes with `wx` | `templates/agents.md:152`; `src/commands/ticket.ts:99-106` |
| T2 | `planned/` → `active/` | **Model only** (folder rename) | `templates/agents.md:152`; code only takes `--lane` at creation, `src/commands/ticket.ts:43-46` |
| T3 | ticket committed before spawn | Model commits; code refuses a `Ticket: spec/…` pointer missing at the base | `templates/agents.md:153`; `src/commands/spawn.ts:340-341`, `:365-371` |
| T4 | → spawned (record published) | Model decides when/what; code validates, publishes the record, prints the id | `src/commands/spawn.ts:313-364` (id `:351`, launch error → failed `:360-363`) |
| T5 | spawned → queued → running | Code (seat start gate, seat rules) | `src/runtime/wrapper.ts:97-109`; `src/runtime/start-queue.ts:185-233`; `state=running` `src/commands/spawn.ts:445` |
| T6 | running → failed (timeout, tool cap, stall, exit≠0, error/aborted stop) | Code | `src/runtime/wrapper.ts:347`, `:225-226`, `:326-329`, `:375-376`, `:382-385`; single writer `src/job/record.ts:36-58` |
| T7 | running → done (detached) | Code, on engine exit 0 **and** the model's last `stopReason` | `src/runtime/wrapper.ts:377-383` |
| T8 | running → done (hosted) | `finish` tool / session end, or an idle heuristic | `hook/finish.ts:72-74`; `src/runtime/supervisor.ts:300-309`, `:450-451` |
| T9 | running → stopped, or → done via `stop "done: …"` | Model (coordinator) runs `limen stop`; prefix decides the state | `src/commands/stop.ts:25`; `src/job/record.ts:34-35`, `:47` |
| T10 | done → "done with open checks" | Code parses the model's "Note check" text | `src/job/record.ts:47-50`; `src/job/task-note.ts:125-146` |
| T11 | dead owner → failed | Code reaper, only when something calls it | `src/runtime/reap.ts:132-147`, `:154-162` |
| T12 | done → review spawned | **Model only** decides whether | `templates/agents.md:156`; spawn records the candidate `src/commands/spawn.ts:346`, `:405-406` |
| T13 | review verdict PASS/FAIL | **Model text; no code reads it** | `templates/reviewer.md:20` ("the harness does not gate it"); `git grep -n 'PASS \|FAIL ' rebuild-base -- src hook` has no verdict parser |
| T14 | verdict filed as `review-N.md` | **Model only** | `templates/agents.md:157` |
| T15 | → repaired (`spawn --branch` / `continue`) | Model; code requires a terminal parent for continue | `templates/agents.md:157`; `src/commands/continue.ts:333-336` |
| T16 | repair-round count and loop exit | **Model only** | `templates/agents.md:157` |
| T17 | → keeper | Model (wake hint); code refuses live jobs and an existing keeper branch | `templates/agents.md:162`; `src/job/wake-text.ts:127-134`; `src/commands/keeper.ts:77-79`, `:168-169` |
| T18 | → landed | Model decides; code gates state, commits, dirty files, tickets, test cap; confirm only on a TTY | `src/commands/land.ts:38`, `:94-99`, `:118-146`, `:148-163` |
| T19 | landed → closed (`done/YYYY-MM/`) | Code, best effort (errors printed) | `src/commands/land.ts:61-79`; `src/project/lanes.ts:102-141` |
| T20 | → `dropped/` | **Model only** | `templates/agents.md:158` |
| T21 | → `outcome.md` | **Model only** | `templates/agents.md:158` |
| T22 | → quality pass | **Model only** (no `quality` in `src/`, `hook/`) | `templates/agents.md:100` |
| T23 | finished worktree → pruned | Code, on every new spawn and every `limen prune` (seat timer: daily) | `src/runtime/job-setup.ts:28-32`; `src/commands/prune.ts:151-153`; `docs/seat/limen-prune.timer:5` |
| T24 | finished record → retired | Model/human runs `prune --retire` | `src/commands/prune.ts:54-113` |
| T25 | group round N → N+1 | Code (all teams terminal, deadline not reached) | `src/commands/group-rounds.ts:91-124` |
| T26 | group → finished, result to lead | Code (last round, or deadline − 60 s reserve) | `src/commands/group-rounds.ts:107-112`, `:197-211`; `src/commands/group.ts:34`, `:340` |
| T27 | group result → landed | Model (lead) | `src/commands/group-rounds.ts:241` |

### 2. Guarantees in prose vs code (critical path)

| Prose rule | Where written | Code enforcement | Verdict |
|---|---|---|---|
| Land only after the human says "land" | operator decision; repo text only for the setup agent `docs/seat/agent-setup.md:70` | **none**. Confirm only on a TTY `src/commands/land.ts:38`; code-written wake says land `src/job/wake-text.ts:82`, `:94` | none (D-02) |
| Only the human pushes `main` | `docs/seat/agent-setup.md:70`; group members `templates/group-member.md:5`; doorbell `templates/agents.md:40` | **none**. No coordinator/worker prose; tools auto-approved `src/runtime/engine.ts:232-237` | none (D-06) |
| One job at a time per project | operator decision; manual says the opposite `templates/agents.md:67`, `:152` | **none**. `src/commands/spawn.ts:385-386` prints a note and starts another | none (D-05) |
| Commit the ticket before spawn *(trigger)* | `templates/agents.md:153` | `src/commands/spawn.ts:340-341`, `:365-371`, only for `Ticket: spec/` pointers | partial (D-25) |
| Review when the blast radius is high | `templates/agents.md:156` | none | none |
| Reviewer's first line is `PASS/FAIL <sha>` | `templates/reviewer.md:20` | none; a FAIL review ends `done` (exp2) | none (D-03) |
| "Land the work at the verified commit" | `src/job/wake-text.ts:94` (text written by code) | none; land merges the branch tip `src/commands/land.ts:45` | none (D-03) |
| File `review-N.md` before a repair *(trigger)* | `templates/agents.md:157` | none | none (D-16) |
| One repair and one re-review; stop after a second FAIL *(trigger)* | `templates/agents.md:157` | none | none (D-04) |
| Decide each open check before landing | `src/job/wake-text.ts:86-87`; `templates/agents.md:155` | recorded `src/job/record.ts:47-50`; land reads only `state` `src/commands/land.ts:94` | partial |
| Keeper before landing changed tickets *(trigger)* | `templates/agents.md:162` | land refuses failing changed tickets `src/commands/land.ts:148-151` | partial (gate is code) |
| Worker never edits the board or ticket status | `templates/worker.md:21` | NOW/PROVEN regenerated `src/project/lanes.ts:70-80`; ticket gate `src/commands/land.ts:148-151` | partial |
| A hosted job ends only through `finish` | `templates/worker.md:10` | contradicted: idle close `src/runtime/supervisor.ts:450-451` | contradicted (D-12) |
| Worktree survives a dead wrapper; commit checkpoints | `templates/agents.md:224`; `docs/jobs.md:44`; `templates/worker.md:31` | contradicted: prune drops every terminal job's worktree `src/commands/prune.ts:153` | contradicted (D-01) |
| Pass route flags; never silently substitute a model | `templates/agents.md:69`, `:94` | contradicted: fallback `src/runtime/engine.ts:88-90`; `src/commands/continue.ts:195` | contradicted (D-08) |
| Quality pass after ten landings *(trigger)* | `templates/agents.md:100` | none | none (D-19) |
| Research only when the human authorizes it | `templates/agents.md:201` | none | none |
| `test/` cap raised only by the owner | `templates/agents.md:197` | cap read from `HEAD:spec/vision.md` `src/commands/land.ts:171-205`; nothing stops the coordinator committing `vision.md` | partial |
| `spec/vision.md` is human-owned | `templates/agents.md:45` | none | none |
| Resume each quota-failed job with its full route *(trigger)* | `docs/seat/quota-resume.ts:161-166` | none | none (D-07) |
| Write a handoff note past 30 % context *(trigger)* | `docs/seat/coordinator-handoff.ts:36-47` | reminder once `:71`, `:90-96`; switch on a request file `:83-86` | partial (D-11) |
| Commit before the timeout | steer at 80 % `src/runtime/wrapper.ts:349-357` | hard timeout `src/runtime/wrapper.ts:347` | code limit |
| Note check before finish | `src/job/task-note.ts:70-105` | sent once `hook/finish.ts:46-54`; parsed `src/job/task-note.ts:125-146` | code, weak proof (D-13) |
| Coordinator never blocks on `wait` | `templates/agents.md:154` | `src/commands/wait.ts:14-18` | code |
| Group members cannot land or start a keeper | `templates/group-member.md:5` | `src/commands/land.ts:27-29`; `src/commands/keeper.ts:47-51` | code |
| Never spawn a coordinator role | `templates/agents.md:9` | `src/commands/spawn.ts:207-213` | code |

**Triggers that exist only in prose (point 3).** No code counts or schedules these:
- the quality pass after ten landings (`templates/agents.md:100`);
- the repair/re-review cap (`:157`);
- filing `review-N.md` (`:157`);
- the `planned→active` move (`:152`);
- drop, `outcome.md` and `limen close FNNN` after a lane move (`:158`);
- keeper before landing (`:162`; land forces it only on a failing check);
- researcher → judge (`:201-211`);
- a manual picture refresh after a merge (`:164`);
- the `claude-week` priority rule, which a person reads and sets (`:67`; `docs/jobs.md:158`);
- `prune --retire` (`docs/jobs.md:133`);
- quota resumption (`docs/seat/quota-resume.ts:161-166`);
- the coordinator handoff note (`docs/seat/coordinator-handoff.ts:36-47`).

### 3. Points of contact with the human (point 4)

| Contact | Class | Evidence |
|---|---|---|
| Owner states the outcome to the coordinator | reserved by human | `templates/agents.md:13`; `docs/jobs.md:11` |
| "land" before `limen land` | reserved by human (operator decision), **not encoded**: code needs none off a TTY, prose says land autonomously | `src/commands/land.ts:38`; `test/s5-land.test.ts:126`; `templates/agents.md:193` |
| Pushing `main` | reserved by human, **not encoded** | `docs/seat/agent-setup.md:70`; no guard in `src/`/`hook/` |
| TTY confirm in `limen land` | required by code, only when stdin is a TTY | `src/commands/land.ts:38` |
| Product ambiguity, scope/risk tradeoff, credentials, irreversible action | required by prose | `templates/agents.md:59`, `:193` |
| Worker's genuine question (question file, then coordinator asks) | required by prose | `templates/worker.md:28`; `templates/agents.md:223` |
| Accept an open check "and tell the user why" | required by prose (code-written wake) | `src/job/wake-text.ts:86-87` |
| Change `spec/vision.md` / raise the `test/` cap | required by prose; land enforces the cap that `HEAD` holds | `templates/agents.md:45`, `:197`; `src/commands/land.ts:204` |
| Claude week budget: a person reads it and sets `limen rule set claude-week` | required by prose; code applies the rule | `templates/agents.md:67`; `docs/jobs.md:158`; `src/runtime/start-queue.ts:244-247` |
| Research fan-out authorization | required by prose | `templates/agents.md:201` |
| Group start on request | required by prose | `templates/agents.md:23` |
| Model unavailable / no recorded quota policy: "preserve the work and ask" | required by prose | `templates/agents.md:69` |
| Keeper finds a taken F number: coordinator picks a new one | required by prose | `templates/keeper.md:12` |
| `needs-adam` ticket front matter shown in NOW | configurable (data); code renders it | `src/project/lanes.ts:21` |
| Wake unconfirmed twice: toast, delivery stops | required by code (UI notify) | `hook/wake.ts:503-509`; `src/job/wake-delivery.ts:178-200` |
| Hosted stall ring | required by code (hosted only) | `src/runtime/supervisor.ts:465-468` |
| Phone bell on terminal state | configurable (operator unit) | `docs/seat/bell.sh:16-29`; `docs/seat/limen-bell.timer:5-6` |
| `coordinator.exited` / idle / blocked pings | configurable (webhook; sweep install is macOS-only) | `src/integrations/coordinator-signal.ts:23-29`; `src/project/seat.ts:41` |
| Handoff: "Tell the owner in one line" | required by prose (seat extension) | `docs/seat/coordinator-handoff.ts:44` |
| Quota resume: "then report to the owner" | required by prose (seat extension) | `docs/seat/quota-resume.ts:165` |
| Hosted job: a human types into the worker | configurable (`--tab`) | `templates/agents.md:84` |
| GitHub doorbell (`@limen` comment) wakes the coordinator | configurable (opt-in) | `templates/agents.md:40` |
| Fallback wake: "do not … land … unless the human asks" | required by code-written prose | `src/job/wake-text.ts:108-111` |

### 4. Loop exit conditions (point 5)

| Loop | Success decided deterministically? | Hard limit | Escalation instead of fake success? | Evidence |
|---|---|---|---|---|
| Detached job run | Partly: exit 0 + last `stopReason` not error = `done`; that is a clean exit, not a met criterion | 90 min timeout, 900 tool calls, 3 min tool stall | Yes: `failed` with a reason, completion wake | `src/runtime/wrapper.ts:36-38`, `:347`, `:377-385`; `src/job/wake-text.ts:78` |
| Hosted job run | No: `finish`, session end, or 60 s idle with a clean tree | **none** (no timeout, no tool cap) | Stall ring every 15 min | `src/runtime/supervisor.ts:128`, `:450-451`, `:465-468`, `:50-51` |
| Note check | Partly: parsed; proof can be any existing file | once per hook instance | open items in the wake | `hook/finish.ts:46-54`; `src/job/task-note.ts:208-231` |
| Review / repair loop | **No**: verdict not parsed | **none in code**; prose cap | prose only | `templates/agents.md:157`; `templates/reviewer.md:20` |
| Keeper | Yes, at land: strict ticket check | 20 min default timeout | land refuses and prints the keeper command | `src/commands/keeper.ts:36`; `src/commands/land.ts:148-151`, `:252-254` |
| Group rounds | Yes: rounds advance when all teams are terminal | group deadline (default 90 min) − 60 s reserve | Result lists each team's state and reason | `src/commands/group-rounds.ts:91-124`, `:229-238`; `src/commands/group.ts:34`, `:340` |
| Group result to lead pane | Herdr turn observed | 2 attempts | receipt file | `src/commands/group-rounds.ts:246-264` |
| Coordinator waiting on jobs | Event-driven (wake); `wait` refused | none on the wait itself | 2 unconfirmed wakes → delivery stops, toast | `src/commands/wait.ts:14-18`; `src/job/wake-delivery.ts:18`, `:42-47`; `hook/wake.ts:503-509` |
| Herdr-typed wake (OMP) | Herdr turn observed | 2 attempts × 15 s | `herdr-wake` status in the record | `src/integrations/coordinator-wake.ts:9-10` |
| Start queue | Yes: gate/rule/order | **none** (unbounded wait) | none; queue time does not count against the timeout | `src/runtime/start-queue.ts:198-227`; `templates/agents.md:88` |
| Finish webhook retries | Yes: per-target receipts | backoff ≤ 10 min, give up after 24 h | final `failed:` line in `finish-webhook` | `src/integrations/webhook-queue.ts:24-25`, `:158-159`, `:205-208` |
| Quota-resume chain (seat extension) | Yes: error regex + reset time | none on the number of re-arms; a wake > 12 h stale is dropped | wake text tells the coordinator to report | `docs/seat/quota-resume.ts:103`, `:182-195`, `:213-219` |
| Coordinator context handoff | Model writes the note and request file | reminder once per session | none after the single reminder | `docs/seat/coordinator-handoff.ts:71`, `:83-96` |
| Reaper | Yes: owner dead on two passes ≥ 10 s apart | n/a | `failed: process group gone` | `src/runtime/reap.ts:132-147`, `:154-166` |

## Findings

### D-01 The next spawn, or the daily prune timer, deletes a failed job's uncommitted work
- Area: autonomy
- Severity: critical
- Location: `src/commands/prune.ts:151-153`, `src/runtime/job-setup.ts:28-32`, `src/commands/prune.ts:356-370`, `docs/seat/limen-prune.timer:5`, `docs/seat/agent-setup.md:194`, `templates/agents.md:224`, `docs/jobs.md:44`
- Evidence: exp1. `limen spawn $'commit\nerror\nsay partial'` → `FAILED`; `echo "half-done edit" > $WT/wip.txt` (`git status`: `?? wip.txt`); `limen spawn 'say hi'` → job A's log shows `pruned …/2026-11-16-f001-work-a-37c02ed6 (job …): job failed`, and `ls $WT/wip.txt` prints `No such file or directory`. Code: `return !isTerminal(state) || retainedGroupJob(jobDir);`. The manual says the opposite: `Dead wrapper: … The branch and worktree survive.`
- Rule: z. 19, z. 29, z. 14
- Verdict: non-compliant
- Direction: Keep a terminal job's worktree when `git status --porcelain` is non-empty or its tip is unlanded. When something must be removed, stash or commit the uncommitted files to an archive ref (`refs/limen/salvage/<id>`) instead of `rm -rf`, and make the manual match the code.
- Scenario: Each of these leaves a job `failed`/`stopped` with edits in its worktree:
  - a worker hits the 5 h Claude window (stop reason `error`, `src/runtime/wrapper.ts:382-383`);
  - a worker is killed by the 90 min timeout mid-edit;
  - a worker writes its "genuine question" file without committing it (`templates/worker.md:28`).

  The coordinator, as `templates/agents.md:224` tells it, believes the worktree survives. Then it spawns anything in the project, such as a reviewer on the branch or the next ticket, or the seat's daily `limen-prune.timer` fires. The worktree is renamed to `.pruned-*` and deleted. `limen continue` later restores only committed contents (`docs/jobs.md:148`). The work is lost silently: the deletion is logged only in job logs.

### D-02 `limen land` has no human gate, and the code-written wake tells the coordinator to land
- Area: determinism
- Severity: high
- Location: `src/commands/land.ts:38`, `src/job/wake-text.ts:82`, `src/job/wake-text.ts:94-98`, `templates/agents.md:156`, `templates/agents.md:193`, `test/s5-land.test.ts:126`
- Evidence: `if (!parsed.yes && process.stdin.isTTY === true && !(await confirm(…)))`. The test is named `a done job fast-forwards without --yes off a TTY`. The wake text written by code says `Job done. Next step: land it` and `After it lands, continue with the next item on the board`. The manual says `Default to making reversible engineering decisions and advancing accepted work without asking for confirmation.` In exp2, `limen land <id> < /dev/null` printed `landed … onto main` with no prompt.
- Rule: z. 14, z. 21
- Verdict: non-compliant
- Direction: Make "land" a code gate. One option: `limen land` refuses unless a human-issued token exists, written by a command the coordinator role cannot run. The token could be `.limen/land-approved/<id>`, written by the owner's `limen approve <id>` from a TTY, or required whenever `LIMEN_COORDINATOR=1`. Also change the wake text so that it stops instructing a land.
- Scenario: Adrian asks for F042. The worker ends `done`. The wake, generated by `completionWake`, says "land it … continue with the next item on the board". The coordinator runs `limen land` through its Bash tool (stdin not a TTY), the merge lands on local `main`, the ticket closes, and the next spawn starts. Adrian never said "land". The operator decision exists only in Adrian's head and in the seat-setup agent's rules (`docs/seat/agent-setup.md:70`).

### D-03 Review verdict is never read, and land merges the branch tip instead of the reviewed candidate
- Area: determinism
- Severity: high
- Location: `src/commands/land.ts:42-45`, `src/commands/land.ts:94-99`, `src/commands/spawn.ts:346`, `templates/reviewer.md:20`, `src/job/wake-text.ts:82`, `src/job/wake-text.ts:94`
- Evidence: exp2:
  - the reviewer's `result` began `FAIL a4abf89… blocking: broken acceptance`, and its state was `DONE`;
  - its completion wake said `Job done. Next step: land it, or name the check that still blocks landing`;
  - `limen continue <worker> 'commit'` then moved the branch to `dbfc76f`;
  - `limen land <worker>` fast-forwarded `main` to `dbfc76f` (a commit no reviewer saw) and closed F001.

  `reviewer.md:20`: `the harness does not gate it`. `candidate` is written at spawn but read only by display code (`src/job/view.ts:143`, `src/integrations/herdr.ts:735`).
- Rule: z. 14, z. 34, z. 1
- Verdict: non-compliant
- Direction: Parse the reviewer's first line into a `verdict` file (`PASS|FAIL <sha>`, or `none` when absent). When review is required, `limen land` should take the sha to land and refuse unless the last verdict for that branch is `PASS` at exactly the tip being merged.
- Scenario: Above: a FAIL review followed by a continuation lands unreviewed code onto `main`. The coordinator can also land a branch straight after a FAIL, because nothing in code distinguishes PASS from FAIL. The "verified commit" in the wake text has no counterpart in `land`.

### D-04 The review/repair loop has no exit condition in code
- Area: autonomy
- Severity: high
- Location: `templates/agents.md:157`, `templates/agents.md:193`, `src/commands/continue.ts:333-336`
- Evidence: `Each round is a fresh spend, not momentum: one repair and one re-review settle an ordinary ticket. A second FAIL on the same slice ends the loop … Do not buy a third round.` The same line also says `A rejection is iteration input, not a reason to stop or ask permission`. There is no round counter, verdict file or limit anywhere in `src/` or `hook/` (see T13 and T16).
- Rule: z. 1, z. 34
- Verdict: non-compliant
- Direction: Record review rounds per feature, using the verdicts from D-03. Make `spawn --review` / repair spawns refuse past N rounds, unless an owner override exists, and emit an escalation to the human instead.
- Scenario: Each round is a fresh xhigh reviewer plus a high worker on the Claude Max budget:
  1. FAIL;
  2. repair;
  3. FAIL;
  4. after compaction or a coordinator handoff, the new session sees "a rejection is iteration input" and spawns repair 2;
  5. FAIL again.

  The weekly limit is burnt with no escalation. Alternatively, after a second FAIL the coordinator labels the remaining findings "non-blocking" and lands (`agents.md:157` allows it), which is self-evaluation without a fixed acceptance criterion (z. 34).

### D-05 "One job at a time per project" is absent from code, and the manual mandates the opposite
- Area: determinism
- Severity: high
- Location: `src/commands/spawn.ts:373-394`, `templates/agents.md:67`, `templates/agents.md:152`, `src/runtime/start-queue.ts:241-288`
- Evidence: exp3. The second `limen spawn` printed `note: 1 job already running; starting another`, and `limen jobs` listed two `RUNNING` jobs. Manual: `Never limit the machine to one job, and never stop all coordinators.` and `propose running them in parallel unprompted, one worker per ticket`. The start queue gates on CPU and memory only.
- Rule: z. 14, z. 21
- Verdict: non-compliant
- Direction: Add a per-plant concurrency limit, for example `.agents/limen/limits.json` `maxJobs: 1`, enforced in `recordSpawnedJob`/`enterStartQueue`. Hosted jobs, reviews and keepers count toward it. Remove the contrary manual lines.
- Scenario: The coordinator follows `agents.md:152` and starts two workers on "disjoint" tickets, plus a keeper. All three share the 5 h window and hit the limit together, so three jobs fail at once. Their uncommitted work is then exposed to D-01, and the coordinator receives three wakes while itself at quota (D-07).

### D-06 "Only the human pushes `main`" has no enforcement and no coordinator or worker rule
- Area: determinism
- Severity: high
- Location: `src/runtime/engine.ts:232-237`, `docs/seat/README.md:20`, `docs/seat/agent-setup.md:70`, `templates/group-member.md:5`, `templates/worker.md:19-36`
- Evidence: `git grep -n -i 'push' rebuild-base -- templates/agents.md templates/worker.md templates/reviewer.md templates/keeper.md` finds only the doorbell sentence (`agents.md:40`). The seat keeps `gh auth login` in the coordinator/worker account (`Model provider, gh auth login, and deploy tokens stay on the seat.`). Engines start with tool approval bypassed (`args.push("--auto-approve")`). No hook blocks a `git push` bash call (only `hook/group-peer.ts:161-170` blocks anything).
- Rule: z. 14
- Verdict: non-compliant
- Direction: Enforce it with absence of access: no push credentials for the worker account (push-only key held by the human), or a server-side protected `main`. Additionally use a pre-push hook in the plant's Git config that refuses `main`. Put the rule in `worker.md` and `agents.md` as a statement of what the code enforces.
- Scenario: After a land (D-02), the coordinator, following generic coding-agent habits or a ticket that says "ship it", runs `git push origin main` with the seat's `gh` credential. A worker can do the same from its worktree, which shares the repository's remotes. The operator decision is broken with no trace in Limen's records.

### D-07 Quota resumption depends on an uninstalled seat extension and on prose, and wakes during the limit are dropped
- Area: autonomy
- Severity: high
- Location: `docs/seat/quota-resume.ts:159-168`, `docs/seat/README.md:39`, `src/job/wake-delivery.ts:18`, `src/job/wake-delivery.ts:178-200`, `hook/wake.ts:982-999`, `hook/wake.ts:753-765`, `src/commands/continue.ts:195`
- Evidence:
  - The resumption itself is prose: `resume each job that failed on the limit with limen continue <id> and its full original route (… without them limen starts a seat default model); act on every wake that failed or got no answer during the limit`.
  - Limen ships but does not install it: `Limen does not install them` (README).
  - A coordinator turn that errors marks the wake `errored` (`hook/wake.ts:988-995`). `recordUnconfirmed` blocks after `WAKE_ATTEMPTS = 2`: `automatic retries stopped after ${WAKE_ATTEMPTS} unsuccessful attempts`.
- Rule: z. 1, z. 19, z. 21
- Verdict: non-compliant
- Direction: Move the resumption into code:
  - write a `quota-failed` marker when a job's stop reason matches the limit error;
  - keep blocked wakes as a durable "owed" list per plant;
  - have `limen status` (or a `limen resume --quota` command) re-launch each marked job with its recorded route (`engine`/`model` files plus recorded provider and thinking);
  - ship the extension through `limen init` or a checked install step.
- Scenario: A worker hits the 5 h window and ends `failed` (correctly, not faked). Its completion wake triggers a coordinator turn, which also fails on quota. A second attempt fails the same way, and completion delivery is now blocked in every session. If `quota-resume.ts` is not linked, nothing happens after the reset: the coordinator sits idle until Adrian notices. If it is linked, the model must run `limen status`, identify the quota failures and type four route flags correctly. A missed flag starts the package default model (D-08). Meanwhile, D-01 can delete the failed job's uncommitted edits.

### D-08 A spawn or continue without route flags silently substitutes a model
- Area: determinism
- Severity: medium
- Location: `src/runtime/engine.ts:88-90`, `src/commands/continue.ts:195`, `templates/agents.md:69`, `templates/agents.md:94`
- Evidence: `return process.env[review ? "LIMEN_REVIEWER_MODEL" : "LIMEN_WORKER_MODEL"]?.trim() || "openai-codex/gpt-6-astra:high";` versus `never silently substitute a model`. Role effort (coordinator high, worker high, reviewer xhigh) exists only as `<board reasoning>` placeholders; `--thinking` is optional.
- Rule: z. 14, z. 21
- Verdict: non-compliant
- Direction: Read the role → engine/provider/model/thinking route from one machine-readable plant file, and refuse a spawn or continue whose route is incomplete rather than falling back. `continue` should reuse the parent's recorded route by default.
- Scenario: n/a (medium).

### D-09 A new coordinator session loses wakes for jobs that ended while it was down
- Area: autonomy
- Severity: medium
- Location: `hook/wake.ts:931-947`, `src/job/wake-delivery.ts:20-40`, `hook/wake.ts:493-497`, `src/job/wake-text.ts:108-111`, `docs/seat/coordinator-handoff.ts:49-65`
- Evidence: On `session_start`, only jobs with `state === "running"` and a matching `origin-tab` are subscribed (`if (stateOf(jobs, jobId) !== "running") { continue; }`). A finished job owned by the old session is "fallback" for the new one. Fallback fires only if the session owns some job (`!sessionOwns(jobs)` → no send). Its text is `Do not spawn, stop, steer, or land on behalf of another coordinator unless the human asks.`
- Rule: z. 19
- Verdict: partial
- Direction: On session start, adopt finished, undelivered jobs whose `origin-tab` matches (or that the plant's registered coordinator owned), and deliver them as own wakes. Record the plant's coordinator identity in a file rather than per session ID.
- Scenario: n/a (medium). A crash, `/new` or reboot of the coordinator gives a new session ID. A job that finished in the gap produces no wake, or a "do not act" wake. Adrian must tell the coordinator to look. The handoff kickoff covers this only for the planned handoff path, and only as prose.

### D-10 After a seat reboot, dead jobs stay "running" and the bell stays silent until something reaps them
- Area: autonomy
- Severity: medium
- Location: `src/project/seat.ts:41`, `src/runtime/reap.ts:154-162`, `docs/seat/bell.sh:18-22`, `docs/seat/README.md:7`
- Evidence: The sweep installer writes only `join(home(), "Library", "LaunchAgents", "limen-sweep.plist")`. The reaper runs from `limen jobs/status/sweep` or a live coordinator's wake hook. `bell.sh` pings only on `done | failed | stopped`. The seat units listed are bell and prune only.
- Rule: z. 1, z. 19
- Verdict: partial
- Direction: Ship a systemd sweep unit (or have `limen-bell` call `limen sweep`) so that a reboot turns dead jobs into `failed` and rings the human without a coordinator.
- Scenario: n/a (medium).

### D-11 Owner decisions given in conversation live only in the thread; the handoff reminder fires once
- Area: autonomy
- Severity: medium
- Location: `templates/agents.md:156`, `templates/agents.md:63`, `docs/seat/coordinator-handoff.ts:40-42`, `docs/seat/coordinator-handoff.ts:71`, `docs/seat/coordinator-handoff.ts:90-96`, `hook/communication.ts:80-106`
- Evidence: `An appetite the owner states holds for the conversation.` The handoff asks the model to write `every decision the owner gave in conversation that no file holds yet`, but `reminded = true` stops further reminders. Stable rules are re-injected from files every turn (`systemPrompt: … ${extra}`), so the gap is owner decisions, not rules.
- Rule: z. 4, z. 19
- Verdict: partial
- Direction: Give owner decisions a file (for example `.limen/owner-decisions.md`, appended by a `limen decide "…"` command and injected like the board digest). Re-remind at each further threshold rather than once.
- Scenario: n/a (medium).

### D-12 A hosted job is recorded `done` by idleness, contrary to its role prompt, and has no hard limit
- Area: determinism
- Severity: medium
- Location: `src/runtime/supervisor.ts:450-451`, `src/runtime/supervisor.ts:454-455`, `src/runtime/supervisor.ts:128`, `src/commands/spawn.ts:253-254`, `templates/worker.md:10`
- Evidence: `if (!errored && status !== "blocked" && text && tree && worktreeState(tree) === "clean") { return "closed a clean idle session"; }` versus `Leaving the TUI open idle never finishes the job — only finish does.` The supervisor logs `no outer timeout or tool-call cap`.
- Rule: z. 1, z. 2
- Verdict: non-compliant
- Direction: Record an idle hosted session as a distinct non-success state (for example `idle`, landable only after an explicit `finish` or a human decision). Give hosted jobs a wall-clock budget that escalates rather than finishes.
- Scenario: n/a (medium). Hosted is used for doorbell reviews, the first picture map and default group teams.

### D-13 A note-check line marked "proven" is closed by naming any existing file
- Area: determinism
- Severity: medium
- Location: `src/job/task-note.ts:208-219`, `src/job/task-note.ts:228-231`, `src/job/task-note.ts:125-130`
- Evidence: `const gap = fileExists(name, seen.roots) ? undefined : seen.unproven(name);` with roots = worktree, job dir and plant root. ``- tests pass: proven. `package.json` `` produces no open item. A run where the note check was never sent and the final message has no section yields `[]`.
- Rule: z. 1, z. 10, z. 39
- Verdict: partial
- Direction: Accept a file as proof only when it was written in this session, inside the job dir or worktree, after the check started. Treat a missing note-check section as an open item even when no check was sent.
- Scenario: n/a (medium).

### D-14 `limen stop <id> "done: …"` lets the model create a landable `done` that skips open checks
- Area: determinism
- Severity: medium
- Location: `src/job/record.ts:34-35`, `src/job/record.ts:46-47`, `src/commands/stop.ts:25`, `src/commands/land.ts:94`
- Evidence: `reason.startsWith("done:") ? "done" : "stopped"` and `// A done the coordinator asked for (done: <reason>) already accepts what is open.`
- Rule: z. 1, z. 14
- Verdict: partial
- Direction: Record a coordinator-declared done as its own state (for example `accepted`), still run the note-check parse, and have `land` show or require the acceptance reason.
- Scenario: n/a (medium).

### D-15 Post-merge ticket close is not atomic, and its failure leaves `land` exiting 0
- Area: determinism
- Severity: medium
- Location: `src/commands/land.ts:66-79`, `src/project/lanes.ts:127-140`
- Evidence: Folders are renamed and rewritten before `commitPaths` (`await rename(join(root, from), join(root, to));` … `commitPaths(…)`). Any error is only printed: `land: tickets stay active: …`.
- Rule: z. 14
- Verdict: partial
- Direction: Close tickets in the same commit as the merge (or roll back the renames on error), and give `land` a non-zero exit when the merge succeeded but the close did not.
- Scenario: n/a (medium).

### D-16 Review filing is prose-only, and `prune --retire` deletes the unfiled verdict
- Area: autonomy
- Severity: medium
- Location: `templates/agents.md:157`, `src/commands/prune.ts:97-111`, `src/commands/spawn.ts:323`
- Evidence: exp2. The review job records the worker's branch (`limen/2026-11-16-f001-work-eece1f1a`). After land, `limen prune --retire --dry-run` printed `would retire 2026-11-16-f001-review-1-aed26976`, whose `result` was the only copy of the FAIL verdict.
- Rule: z. 19, z. 21, z. 29
- Verdict: non-compliant
- Direction: Have Limen file the verdict itself at the review job's finalize (write `review-N.md` into the feature folder or a `.limen/reviews/` archive). Make retire keep review records until filed.
- Scenario: n/a (medium).

### D-17 Start-queue waits have no limit and no escalation
- Area: autonomy
- Severity: medium
- Location: `src/runtime/start-queue.ts:198-227`, `templates/agents.md:88`, `src/runtime/wrapper.ts:126`
- Evidence: `while (!stop.aborted) { … await delay(pollMs(), …) }`. The manual says `Never check or poll the load before a spawn`, and code says `time in the start queue never counts against them`.
- Rule: z. 1
- Verdict: partial
- Direction: Add a maximum queue wait (gate-held, not rule-held) after which the job ends `failed: queue timeout` or posts an advisory wake to the coordinator and the human.
- Scenario: n/a (medium).

### D-18 `planned→active`, drop and outcome are model-only, and land silently closes nothing for a ticket left in `planned/`
- Area: determinism
- Severity: low
- Location: `templates/agents.md:152`, `templates/agents.md:158`, `src/project/lanes.ts:109-114`, `src/commands/land.ts:73-75`
- Evidence: `(ticket) => ticket.lane === "active" && …` → `land: no active ticket for …; nothing closed` with exit 0.
- Rule: z. 21
- Verdict: partial
- Direction: Add `limen ticket start|drop FNNN` commands (move plus board line plus commit), and have spawn move a `planned/` ticket named by `Ticket:` to `active/`.
- Scenario: n/a (low).

### D-19 The quality-pass trigger (ten landings) is prose-only although it is countable
- Area: determinism
- Severity: low
- Location: `templates/agents.md:100`, `templates/quality.md:10-15`
- Evidence: `After ten proven landings since the last findings file under spec/quality/ … start one unprompted`. `git grep -n -i quality rebuild-base -- src hook` returns nothing.
- Rule: z. 21
- Verdict: non-compliant
- Direction: Have `land` count landings since the newest `spec/quality/*.md` and print or wake "quality pass due" (or queue it) deterministically.
- Scenario: n/a (low).

### D-20 The keeper's stop criterion is partly prose
- Area: determinism
- Severity: low
- Location: `templates/keeper.md:18`, `src/commands/land.ts:148-151`
- Evidence: `The strict check does not report a missing board line, and a missing map source is only a warning. So a clean strict check does not mean you are done.`
- Rule: z. 1, z. 21
- Verdict: partial
- Direction: Add the board-line and map-source checks to `landTicketCheck`, so the keeper's "done" equals the land gate.
- Scenario: n/a (low).

### D-21 Detached jobs have hard limits and record failures honestly
- Area: autonomy
- Severity: low
- Location: `src/runtime/wrapper.ts:36-38`, `src/runtime/wrapper.ts:347-357`, `src/runtime/wrapper.ts:371-386`, `src/runtime/reap.ts:147`
- Evidence: `const DEFAULT_TIMEOUT_MS = 90 * 60_000;`, `const MAX_TOOL_CALLS = 900;`, `isFailedStopReason(seen.stop) ? … "failed"`. The 80 % steer asks for a commit.
- Rule: z. 1, z. 2
- Verdict: compliant
- Direction: Keep this. The gap is that `done` means a clean exit, not a met criterion (D-03, D-13).
- Scenario: n/a (low).

### D-22 Rules are re-injected from files every turn, and the job's note is a file
- Area: autonomy
- Severity: low
- Location: `hook/communication.ts:80-106`, `hook/communication.ts:122-123`, `src/job/task-note.ts:35-52`, `src/commands/continue.ts:441-447`
- Evidence: `systemPrompt: event.systemPrompt ? \`${event.systemPrompt}\n\n${extra}\` : extra` rebuilt on every `before_agent_start`. `pi.on("session_compact", forget);`.
- Rule: z. 4, z. 19
- Verdict: compliant
- Direction: Keep this. Extend it to owner decisions (D-11).
- Scenario: n/a (low).

### D-23 Group rounds advance in code under a deadline
- Area: autonomy
- Severity: low
- Location: `src/commands/group-rounds.ts:91-124`, `src/commands/group-rounds.ts:229-238`, `src/commands/group.ts:34`, `src/commands/group.ts:340`
- Evidence: `next < run.rounds.length && Date.now() < run.deadline - run.reserveMs ? await roundTeams(run, next) : []`. The result names each team's state and reason.
- Rule: z. 1
- Verdict: compliant
- Direction: Keep this. Landing the group result inherits D-02 and D-03.
- Scenario: n/a (low).

### D-24 Webhook retries are bounded and end in a visible final failure
- Area: autonomy
- Severity: low
- Location: `src/integrations/webhook-queue.ts:24-25`, `src/integrations/webhook-queue.ts:158-159`, `src/integrations/webhook-queue.ts:205-208`
- Evidence: `failed: gave up after ${tries} tries in 24 h; last: ${sent.result}`.
- Rule: z. 1
- Verdict: compliant
- Direction: None needed. The final failure reaches only a file; a human ping is optional.
- Scenario: n/a (low).

### D-25 The ticket-at-base check covers only `Ticket: spec/…` pointers
- Area: determinism
- Severity: low
- Location: `src/commands/spawn.ts:340-341`, `src/commands/spawn.ts:365-371`, `templates/agents.md:153`
- Evidence: `if (path.startsWith("spec/") && !commitHasFile(repository, baseCommit, path))`. A task with no `Ticket:` line, or with a findings file (`review-1.md`) path, is not checked.
- Rule: z. 14
- Verdict: partial
- Direction: Require one `Ticket:` pointer for worker and repair spawns, and check every `spec/` path named in the task at the base.
- Scenario: n/a (low).

## To verify

- Does Pi 1.2.0 with the Claude bridge end a detached job on the 5 h or weekly limit with `stopReason: "error"`, so the wrapper records `failed` rather than `done`? Settle by running a bridged job against an exhausted window and reading `stop-reason` and `state`.
- Is `limen-prune.timer` enabled on the production seat (`systemctl is-active limen-prune.timer`), and are `LIMEN_WORKER_MODEL` / `LIMEN_REVIEWER_MODEL` set in the coordinator's environment? Settle on the seat.
- Does the coordinator's Bash tool give child processes a non-TTY stdin (so `limen land` never prompts)? Settle with `node -e 'console.log(process.stdin.isTTY)'` run through the coordinator's tool.
- Does the project's own `spec/build.md` or `AGENTS.md` record "land only after the human says land" and "one job at a time"? This would make it prose, not nothing; code enforcement is still none. Settle by reading the project's board, which is outside this repo.
- Does GitHub branch protection on the project block pushes to `main` by the seat's `gh` identity? Settle in the repository settings.
- Are `quota-resume.ts` and `coordinator-handoff.ts` actually linked into `~/.pi/agent/extensions/` on the seat, byte-identical to `docs/seat/`? Settle with the `diff` loop in `docs/seat/README.md:47`.
- Does Herdr 0.9.3 restore the coordinator pane and its Pi session after a machine reboot, and with the same session ID (which matters for D-09)? Settle with a reboot test.
- Does Pi auto-compaction run before the 30 % handoff reminder can act, and what does it keep of owner decisions? Settle from a compacted session JSONL.
- Does a Pi `ctx.newSession` handoff give a new session ID, so that jobs finished during the switch fall into D-09? Settle by comparing `notify/subscribers/` before and after a handoff.
