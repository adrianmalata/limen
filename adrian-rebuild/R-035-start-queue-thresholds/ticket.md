<!-- PL: Ticket R-035 (A-036, D-090): kolejka startowa dostaje dwa progi z pliku bramki: po 30 min diagnoza (odczyt
bramki i trzy największe jednostki systemd wg pamięci i CPU) trafia do rekordu i jako wake do koordynatora, a alerty
wysyłają jedną linię `<projekt> queue <id joba>`; po 2 h job kończy się `failed` rodzaju `queue`. Rekord dostaje
opcjonalne, trwałe pole `queueWait`. Dwa punkty D-090 w `seat/alerts.ts`: projekt czytany po raz pierwszy oznacza swoje
dotychczasowe zdarzenia jako zgłoszone bez wysyłki, a nieczytelny projekt liczy się raz. Stan: napisany 22.11 przy
`9a370ae` z inwentarza `evidence/inventories/R-035.md`; w nocy 22/23.11 wdrożony: runda 1 recenzji (PASS) dała
poprawki F1–F4 w `## Decisions`, jedna uwaga trafiła do pytania Q-43, runda 2 (PASS) zamknęła recenzję. Stan: done. -->

# R-035 Start-queue thresholds: a diagnosis at 30 min, a failure at 2 h

## Problem

Finding A-036 (medium), its Decision, quoted from `audit.md`: "Two thresholds for the start queue (seat gate file):
after 30 min a wake to the coordinator and one notification to me with a diagnosis (gate reading and the three largest
CPU and memory consumers by systemd scope: job, project coordinator, unattributed); the job keeps waiting. After 2 h
`failed`, kind `queue`, then A-001."

A-066's Decision, quoted: the alerts send "only fixed fields: project, event kind, job id. It sends **only failures and
escalations** (`failed:<kind>`, `escalation`, `no-coordinator`, `queue`, `unattributed-engine`), no plain `done`, no
labels, no job text; details come from `limen status` over SSH." D-084: one line, no title, at most 100 characters,
`<project> failed:<kind> <job id>`. A-054's Decision: "installing the bell marks existing terminal jobs as already
reported".

D-090 (Q-41 option 1), quoted from the R-035 note in `## Tickets`: "two items in `seat/alerts.ts`: a project the alerts
first read after their first run, and an install run again after `limen init`, mark that project's existing failures
as reported without sending them (A-054); the summary of a run that reads no project counts an unreadable project once,
however many registries list it. Each with a test that fails before it." D-072: the queue's record fields "come with
the tickets that record them (queue R-026 and R-035, …)". T-31 (3), (4): fake scenarios per failure kind, no real
waiting. T-28 (5): systemd behaviour gets a step in `## Deployment`.

Facts at `9a370ae` (the read-only inventory `adrian-rebuild/evidence/inventories/R-035.md`; the main session checked
the ones it quotes):
1. The start queue (`src/runtime/start-queue.ts`, 542 lines) is one queue and one gate for the seat, with no daemon.
   The wrapper enters it (`enterStartQueue`, `:161-168`; `src/runtime/wrapper.ts:81`) and polls in `pollQueue`
   (`:206-250`) every 5 s; a queued job is `running` with `queued: {since, detail, ahead}` (`src/job/record.ts:89`),
   whose `since` is set at the entry, and `finalizeJob` and `leaveQueue` set `queued: null`, so no record keeps the
   wait once the job leaves the queue.
2. Only a stop or a record check ends the wait (`:213`); there is no time limit, threshold or escalation, and the
   job's timeout counts from the engine's start (`wrapper.ts:122`).
3. The gate file `<seat>/start-gate.json` (`startGate`, `:70-89`) is `"off"` or an object with `cpuIdle`, `memoryFree`
   and `settle`, read by `duration` (`src/boundary.ts:333`), again on each poll; defaults `DEFAULT_GATE` (`:47`).
4. The diagnosis's parts: the gate reading (`readLoad`, `:97-120`; `queueReport`, `:517-542`); the platform reads one
   scope's peak memory, CPU time and OOM kills (`scopeReadings`, `src/platform/linux.ts:362-372`), but no member lists
   the scopes of the user manager or reads their current memory. The coordinator has no unit of its own until R-050.
5. `FAILURE_KINDS` holds `queue` (`src/job/record.ts:75`); no pattern of `FAILURE_PATTERNS` (`:608-615`) gives it.
   The record's `advisory {text, at}` (`:91`) is the coordinator's wake for a running job, delivered once per job per
   session by the wake hook (`hook/wake.ts:670-683`).
6. `seat/alerts.ts` sends only the `failed` event (`EVENTS`, `:79-84`), keyed `<root>/<id>/<kind>`; its first run saves
   every key and sends none (`:173-175`), later runs send each new key (`:177-187`); it keeps no list of the projects it
   has read, so a project added later sends its old failures. An unreadable project is counted, with one problem line,
   once per registry line that lists it (`:324-326`), with no `seen` check.
7. Tests: `test/runtime/start-queue.test.ts` (11 tests; a test can plant an earlier `queued.since`, `:61`) and
   `test/seat/alerts.test.ts` (37 tests; its fixture lists both projects from the start). No test covers a long wait, a
   `queue` kind, a `queue` alert, a project read after the first run, or two registries listing one unreadable root.

## Change

(a) The gate file gains `diagnoseAfter` (default 30 min) and `failAfter` (default 2 h), read by `duration` as `settle`
is; a `failAfter` not above `diagnoseAfter` refuses the file as its other bad values do.

(b) The wait counts from `queued.since`. In `pollQueue`, the first time a job's wait passes `diagnoseAfter`, the
wrapper builds the diagnosis, writes it into the record's new optional field `queueWait`, and sets the record's
`advisory` with it, so the wake hook delivers it to the coordinator; the job keeps waiting. When the wait passes
`failAfter`, the wrapper leaves the queue and ends the job `failed` with the detail `queued for <duration> without a
start: <the last reading>`, kind `queue` through a new `FAILURE_PATTERNS` entry; the job is then a finished job like
any other (A-001).

(c) `queueWait` (D-079, optional, additive): `{since, diagnosedAt, diagnosis, leftAt}`, written for every job that
waited, kept after the job leaves the queue (`leftAt` set when it starts, is stopped or fails), so the alerts and later
readers see the wait after `queued` is cleared.

(d) The diagnosis: the gate reading, then the three largest units by current memory and the three largest by CPU over
the gate's sample window, among the cgroups of the agents' user manager, each named by its unit and its class: `job
<id>` for `limen-job-<id>.scope`, `unattributed` for any other unit (the project coordinator's class comes with its
unit, R-050). A platform member reads them (`memory.current`, `cpu.stat`), under `LIMEN_CGROUP_ROOT` in tests.

(e) Alerts: a new event `queue`, read from `queueWait.diagnosedAt`, line `<project> queue <job id>` (A-066's event,
D-084's form), key `<root>/<id>/queue`; a 2 h failure is `failed:queue` through the `failed` event. The run's summary
counts each event kind, and the unit's Description (`seat/units.ts:49`, its golden test) names both.

(f) D-090 (1): the state folder keeps the sorted list of projects the alerts have read (`projects`, mode 0600, beside
`reported`); a project not in it gets its present events saved as reported without sending, then joins it. The first
run is that rule for every project; a `reported` file with no list (R-033's state) counts every project of that run as
read. A re-run of the install after `limen init` needs nothing more, since the next run reads the new project first.

(g) D-090 (2): an unreadable project root counts once in the summary of a run that reads no project, with one problem
line, however many registries list it.

(h) Tests, each failing before the change: a queued job whose `since` is planted past `diagnoseAfter` gets `queueWait`
with its diagnosis and one `advisory`, and keeps waiting; one past `failAfter` ends `failed`, kind `queue`, and its
`queueWait.leftAt` is set; the gate file's two fields and the refusal; the platform member on a fake cgroup tree; the
alerts' `queue` event sent once; D-090 (1) for a project added to a registry after the first run and for a reported
file with no list; D-090 (2) with two registries listing one unreadable root.

(i) Text that becomes false: `docs/jobs.md:165-177` (the gate's values, the limits), `templates/agents.md:80` (with the
new hash in `templates/.history/agents.md`), `docs/seat/README.md:27`, `:29`, `:37`, `:39`,
`docs/seat/agent-setup.md:153`, `:174`, `:179-181`, `docs/remote.md:58`, `:81`, `src/project/summary.ts:190`, the
header comment of `seat/alerts.ts:2-5` and the summary lines of `:166` and `:175`.

## Out of scope

- Waits held by a seat rule: they count like any wait, and R-034 cuts seat rules (`limen rule`, start priority, A-010)
  in this stage, before `a0.3.0`.
- The coordinator's class in the diagnosis (R-050); processes of other accounts.
- Showing the wait in `limen stats` (the M-06 split; the record field is its source).
- Who may write the gate file (the trust boundary of stage 5).

## Acceptance

- AC-1: `node --test test/runtime/start-queue.test.ts` → exit 0.
- AC-2: `node --test test/seat/alerts.test.ts` → exit 0; `node --test test/seat/units.test.ts` → exit 0.
- AC-3: `node --test test/platform/linux.test.ts` → exit 0; `node --test test/boundary.test.ts` → exit 0.
- AC-4: `node --test test/job/record.test.ts` → exit 0; `node --test test/s3-finish-wake.test.ts` → exit 0.
- AC-5: `node --test test/structure.test.ts` → exit 0.
- AC-6: `node adrian-rebuild/tools/fails-before.mjs` → exit 0, its output in `outcome.md` → `## Fails before`.
- AC-7: `node adrian-rebuild/tools/gate.mjs` → exit 0.
- AC-8: `npx biome check --error-on-warnings .` → exit 0; `node adrian-rebuild/tools/check.mjs` → exit 0.
- AC-9 (judgment): no wait goes past `failAfter` without a terminal state; the diagnosis reaches the record and the
  coordinator, and the phone gets only the fixed line; a project read for the first time sends nothing old.

## Migration

None. `queueWait` is optional, the gate file's new fields have defaults, and the alerts' new list is made by their next
run (f).

## Risk

- A seat whose load keeps a job queued for 2 h now fails that job instead of starting it late; the owner hears of it
  twice (the `queue` line at 30 min, `failed:queue` at 2 h).
- The diagnosis reads the cgroups of the agents' user manager every time it is built, once per job.

## Rollback

`git revert $(git log --format=%H --grep='^R-035:' adrian-rebuild --)`.

## Decisions

Settled by the documents when the ticket was written (2026-11-22, the main session's reading, not a night default):
1. The diagnosis goes to the record and to the coordinator's wake; the phone gets only `<project> queue <job id>`:
   A-066 allows only fixed fields and sends details through `limen status`, and D-084 holds a line to 100 characters,
   which A-036's "notification with a diagnosis" then means.
2. The thresholds live in the gate file, as A-036 says ("seat gate file"), beside `settle` and read the same way.
3. The wrapper's poll acts, since it is the one process alive during the wait and already writes the record; the
   sweep (R-032) is not needed for it.
4. The clock is `queued.since`; tests plant an earlier `since` (the pattern of `test/runtime/start-queue.test.ts:61`),
   so no test waits (T-31 (4)).
5. One durable field, `queueWait`, rather than a sub-field of `queued`, which is cleared at the start and read by the
   wake hook as "has started"; the alerts read the event from it a minute later (D-072).
6. `advisory` is the coordinator's existing wake for a running job, so the 30-minute wake adds no route; a queued job
   has no engine, so it does not meet the stall's use of the field.
7. Before R-050 every unit that is not a job's scope is `unattributed`, which is A-036's third class.
8. D-090 (1) is one rule, a project read for the first time, which also covers the first run and the install's re-run;
   R-033's state with no list cannot exist on the seat (the alerts are installed at 3.3, after `a0.3.0`), so its rule
   is the simplest one that sends nothing twice.
9. T-28 (5): seat step 3.8 names the trial (a gate file that holds a trial job with short thresholds).

- 2026-11-23, night, before the implementation (the main session; what R-027 `ddea3ef`, R-028 `fe092f9` and R-031
  `34a40d0` changed since the facts above were read at `9a370ae`; not a decision): of the files this ticket names,
  `src/job/record.ts` (R-031's optional `landed` and `abandoned` fields, the additive pattern `queueWait` follows;
  R-028's pattern `killed by SIG…` → `signal`; `FAILURE_KINDS` now at `:55`, `queued` and `advisory` at `:139` and
  `:145`, `FAILURE_PATTERNS` at `:693`), `src/runtime/wrapper.ts` (R-028: a TERM while queued ends the job through
  `endBeforeEngine(" while queued")`, `failed: killed by SIGTERM while queued`, kind `signal`, unless the record holds a
  stop request; `enterStartQueue` now at `:123`; the time limit still counts from the engine's start, `:357`),
  `src/platform/linux.ts` and `src/platform/platform.ts` (R-027's `scopeState` and `signalScope`; `scopeReadings` now
  at `linux.ts:385`, `LIMEN_CGROUP_ROOT` read at `:300`), `src/project/summary.ts` (R-031's abandon branches),
  `hook/wake.ts` (the advisory's delivery now at `:544-552`), `docs/jobs.md`, `docs/remote.md`, `docs/seat/README.md`
  and `templates/agents.md` changed, so the facts' line numbers in them moved; `src/runtime/start-queue.ts`,
  `src/boundary.ts`, `seat/alerts.ts`, `seat/units.ts` and their tests did not change. No fact this ticket relies on
  changed; the 2 h failure of (b) is a second end of a queued job beside R-028's TERM, with its own detail and kind.
- 2026-11-23, night, review round 1 (`review.md` → Round 1, PASS with five notes), findings to fix (the first round of
  fixes, by a fresh implementer; each mechanism change with a test that fails before it):
  - F1 (note 2): every unit name the diagnosis takes from the user manager's cgroup tree is written as data, quoted
    with `JSON.stringify` as the wake writes a label, in the diagnosis, and so in `queueWait`, the advisory and the
    wake (z. 15); a test with a unit whose name holds characters systemd allows that a sentence would absorb.
  - F2 (note 3): the alerts test of `test/seat/alerts.test.ts:195` and the `userUnits` test of
    `test/platform/linux.test.ts:161` are split, one mechanism per test (T-29 (3)).
  - F3 (note 4): the start-queue diagnosis test (`test/runtime/start-queue.test.ts:124`) checks that the diagnosis
    reaches `queueWait` and the advisory, not the ranking's format, which `test/runtime/queue-diagnosis.test.ts` checks.
  - F4 (note 5): the header of `src/platform/linux.ts` is rewrapped whole; the start-queue comment block at
    `src/runtime/start-queue.ts:39-43` drops the person's decision numbers and says "seat" and "project" (T-21 (3),
    T-30 (4), T-18), giving the reason and its source.
  - Note 1 (the advisory's receipt) is not fixed here: Q-43 in `.night/questions.md`, an open point for gate 5.3.
