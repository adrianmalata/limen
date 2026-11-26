<!-- PL: Ticket R-111 (A-089, A-090, D-128, D-129): budzenie koordynatora jest rozliczane tylko przez `agent_settled`
biegu, do którego weszło, a nie przez settle cudzego biegu. Przy bezczynnej sesji jeden sweep wysyła najwyżej jedno
budzenie, a pozostałe idą jako follow-upy z `before_agent_start` tego biegu. Budzenie, które nie weszło do żadnego
biegu, liczy się jako niepotwierdzone po 30 s ciszy. Atrapa R-038 odtwarza lukę `prompt` z Pi (E-21), a testy na niej
padają przed zmianą. Stan: napisany 26.11 przy `aae86b7` z inwentarza `evidence/inventories/R-111.md`, gotowy (`ready`). -->

# R-111 A wake is settled only by the run it entered; an idle sweep starts one run

## Problem

A-089's Decision, quoted: "fix — High: the wake is the coordinator's only news of a finished job on the critical path,
and a blocked claim waits for a person (A-033). The fix is a new ticket R-111 in stage 4 after R-038, with the
deterministic test above; the gate's test stays (D-029)." Its Direction: "a delivery is settled only by the settle of
the run it entered, never by another run's settle, so a deferred wake is neither counted unconfirmed nor sent twice; a
deterministic test on the fake forces two or more wakes sent inside one settle and fails before the fix every time."

A-090's Decision, quoted: "fix — High, as A-089: the wake is the coordinator's only news of a finished job, and a
blocked claim waits for a person. Fixed in R-111 with A-089 (size L), since both rules change the same settle handler
and sweep." Its Direction: "the hook makes at most one send per sweep while the session is idle, and the other due
wakes go as follow-ups once that run has begun (a sweep from `before_agent_start`); a wake that never enters a run is
counted unconfirmed after a bound instead of waiting silently (T-01); the fake engine reproduces Pi's gap between a
send and the run's start and the failed second start with its own settle (T-28 (5)), and a test on it fails before the
fix every time."

Plan decisions, quoted:
- D-128: "`test/s3-finish-wake.test.ts` hung once on its own with R-038's fake (a wake re-sent as unconfirmed, then
  delivery stopped) … the wake hook's defect becomes a finding (A-089) with a new stage-4 ticket (R-111, delegated,
  night, after R-038) and a deterministic test of the interleaving".
- D-129: "two wakes sent in one sweep while the coordinator is idle race in Pi 1.5.1 (E-21): the second is dropped and
  its settle lands inside the first run. This is a new finding, A-090 (high, `fix`), fixed in R-111 together with
  A-089, so R-111's size is L (was M). The hook makes at most one send per idle sweep, and the other due wakes go as
  follow-ups from the run's `before_agent_start`. R-038's fake reproduces E-21 (T-28 (5)), and a test on it fails
  before the fix."
- D-029: a test that failed once without a change of the code it runs is a finding, and nobody runs it again to get a
  green gate.
- D-069: "The fake engine emits one `agent_settled` per run, as Pi does"; `fails-before.mjs` with explicit paths runs
  the new tests on HEAD's tree with the listed files copied over it.

Engine facts (`plan.md` → `## Engine facts`; Pi 1.5.1 in `adrian-rebuild/input/vendor/pi-coding-agent/package/dist/`):
- E-20: "Run after the event: `prompt` and an idle `sendCustomMessage` with `triggerTurn` push themselves onto
  `_deferredSettledActions` while `_isEmittingAgentSettled` is set (`agent-session.js#L1696-L1699`, `#L1967-L1971`);
  `_emitAgentSettled` marks the session idle, awaits every handler, then runs the held actions one by one, each as
  a run of its own that ends with its own `agent_settled` (`#L738-L760`, `#L1528-L1536`), depth first, with no
  `catch`, so a throwing action drops the rest. No event carries a run or message id; `agent_settled` carries only
  `aborted`; `pi.sendUserMessage` returns nothing (`extensions/loader.js#L315-L318`)."
- E-21: "Both start runs: `prompt` awaits `_preparePrompt` before it reads `isStreaming` (`agent-session.js#L1720`,
  `#L1749`), and only `_startRun` marks the session busy (`#L1488`), so neither send sees the other and `deliverAs` is
  not read. The second run's `agent.prompt` throws "Agent is already processing a prompt"
  (`pi-agent-core@1.5.1/dist/agent.js#L246-L248`) before any `message_start`; its `finally` emits `agent_settled`
  inside the first run and marks the session idle (`agent-session.js#L740`); the message is dropped and the error goes
  only to the extension error channel. Deterministic when no extension has an `input` handler and the auth check is
  synchronous."
- From the inventory (section 1): the events of one run, in order, are `before_agent_start` (after
  `_isAgentRunActive = true`, `agent-session.js:1488`, `:1552`; for a hook's send `prompt` equals the sent text),
  `agent_start`, `turn_start`, `message_start`/`message_end` of the user message (the message object only, no id),
  the assistant's messages and tools, `agent_end`, `agent_settled`. A follow-up enters later in the same run with its
  own `message_start` and gets no `before_agent_start` (E-11). `sendCustomMessage` calls `_startRun` synchronously
  when idle (`agent-session.js:1972`), so E-21 does not hold for custom messages; E-20 does.

Rules: T-01 ("Errors never vanish"), T-28 (4) ("A bug fix comes with a test that fails before it") and (5) ("Behaviour
that depends on Pi, the bridge, Herdr or systemd: a test on the fake engine and a verification step in `plan.md` →
`## Deployment`"), T-29 (1)–(3), (5) (a test file named after its subject, a name that is a sentence and starts with
its one identifier, one mechanism per test, an opening line per file), T-30 (comments say why; identifiers resolve),
T-31 (4) (no real waiting in tests), T-32 (1) (the Pi API is declared only in `src/runtime/pi-api.ts`).

Facts at `aae86b7` (`evidence/inventories/R-111.md`, sections 3–5; the wake files are unchanged since `8de6fd7`):
1. `hook/wake.ts` keeps, per hook instance and in memory only, `pendingDeliveries` (`:149`) of `PendingDelivery`
   (`:138-148`: `claim`, `delivered`, `message`, `blocked`, and the flags `accepted`, `entered`, `answered`, `errored`,
   `settled`) and `activeDeliveries`, the deliveries that entered since the last settle (`:150`).
2. `entered` is set by the `message_start` handler for a `user` message whose text equals a pending delivery's message
   (`:975-995`); `answered`/`errored` by the assistant's `message_end` on every active delivery (`:996-1022`).
3. The `agent_settled` handler (`:1023-1035`) sets `settled` on every pending delivery (`:1026-1028`), then runs
   `confirmDeliveries()`, clears `activeDeliveries` and sweeps. `confirmDeliveries` (`:730-744`) confirms a delivery
   that is accepted, settled, entered, answered and not errored, owes the wake on a limit, and otherwise calls
   `recordUnconfirmed` (`src/job/wake-delivery.ts:174-210`; two attempts block the claim with the toast "… wake was
   unconfirmed twice; automatic delivery stopped", `hook/wake.ts:483-489`).
4. The send (`hook/wake.ts:419-426`): "First idle inject in a sweep is a real turn; later injects, and any inject while
   busy, are followUp." (`:420`). `observeEach` (`:777-791`) sends every due wake of a sweep in one synchronous stretch.
   A sweep requested while one is in flight is dropped (`:761-767`). A pending delivery's claim is never re-sent while
   it exists in a live session (`:429-432`, `:491`; `src/job/wake-delivery.ts:74-76`, `:131-147`).
5. `test/fake-engine.mjs` defers a send during `agent_settled` as Pi does (`:220-224`, `:242-246`, `:355-366`) and
   awaits each handler in turn (`:148-159`), but its `startRun` reserves the session at the send (`:257-258`), so two
   idle sends in one stretch never race on the fake; `test/s3-finish-wake.test.ts:199-200` ("both enter one turn",
   `"user,followUp"`) passes on the fake and would not hold in Pi.
6. Nothing outside the hook reads the in-memory flags; on disk the claim folders, `notify/delivered/`,
   `notify/unconfirmed/<family>` and the job's `log` lines are written only through `src/job/wake-delivery.ts`.

## Change

1. `hook/wake.ts`, settle by entry (A-089): the `agent_settled` handler sets `settled` only on the deliveries in
   `activeDeliveries`, that is, the ones whose `message_start` came since the previous settle; a pending delivery that
   has not entered stays pending with its claim, so no other run's settle counts it and no sweep sends it again.
   `confirmDeliveries` keeps its rules. The `settled` field gets a comment saying which settle sets it (T-30).
2. `hook/wake.ts`, the backstop (T-01): at a sweep, when the session reads idle and no run has started
   (`before_agent_start`) or settled for at least `CLAIM_STALE_MS`, every pending delivery that is accepted, has not
   entered and was sent at least `CLAIM_STALE_MS` ago is counted through `recordUnconfirmed` with its own reason (a
   wake that entered no run), and blocked on the second count as today. `CLAIM_STALE_MS` is the existing constant of
   `src/job/wake-delivery.ts:10`; `src/job/wake-delivery.ts` does not change.
3. `hook/wake.ts`, one starter per idle sweep (A-090): once a sweep has sent a wake while the session reads idle, it
   sends no other wake (the remaining `send()`s return `false`, which releases their claims with no attempt,
   `src/job/wake-delivery.ts:106-111`; a completion or advisory toast is shown only for a wake that is sent). A
   `before_agent_start` handler, registered through `recorded` from `src/runtime/pi-api.ts`, requests a sweep, and a
   sweep requested while one is in flight runs once more after it, so the other due wakes go as follow-ups into the
   started run. Sends while the session is busy stay as they are (`deliverAs: "followUp"`). The comment at `:420`
   follows the new rule.
4. `test/fake-engine.mjs` reproduces E-21 (T-28 (5)): a user-message send while the session is idle reserves the
   session only after Pi's awaits before `_startRun`, so two sends in one synchronous stretch both start runs; the
   second run emits `before_agent_start`, fails before any `message_start` with Pi's text "Agent is already processing
   a prompt. Use steer() or followUp() to queue messages, or wait for completion.", and emits `agent_settled` with
   `aborted: false` while the first run goes on, which marks the session idle for the rest of that run (Pi's
   `agent-session.js:740`). Custom messages keep starting their run synchronously (`agent-session.js:1972`). Each rule
   cites its Pi line; the file's opening comment follows (T-30).
5. Tests, each failing at HEAD (T-28 (4)):
   - `test/fake-engine.test.ts`: "E-21: two sends made in one stretch while the session is idle start two runs; the
     second fails with Pi's text and settles inside the first", on a test extension, as the file's tests do.
   - `test/hook/wake.test.ts`, on the fake (`p.bin/pi` with `--extension hook/wake.ts` and a test extension, as
     `test/fake-engine.test.ts:349-358` runs it): "A-089: …" — a test extension holds the first `agent_settled` open
     (a FIFO, the pattern of `test/fake-engine.test.ts:315-332`) while the hook's sweeps send the wakes of three
     planted done jobs, then releases it; each job wakes the session exactly once and none has `notify/unconfirmed`.
   - `test/hook/wake.test.ts`, on the fake: "A-090: …" — two done jobs due in one sweep while the coordinator is idle;
     both wakes enter one run, each once, the second as a follow-up, and neither job has `notify/unconfirmed`.
   - `test/hook/wake.test.ts`, in process (the file's `startCoordinator`): the backstop — a wake sent and never entered
     is counted unconfirmed, with its reason in the job's `log`, once the session has been quiet for `CLAIM_STALE_MS`,
     on `node:test`'s mocked timers (no real waiting, T-31 (4); no new test knob).
   - The file's opening line names the new mechanisms (T-29 (5)).
6. `docs/herdr-status.md:132-136`: delivery is recorded once the injected message has entered a turn, has an assistant
   answer without error or abort, and the run it entered has settled.

## Out of scope

- Moving the wakes to Pi custom messages (`pi.sendMessage(…, { deliverAs: "followUp", triggerTurn: true })`, gate 2
  A-034 revision 4): R-051. R-111 keeps the starter's call form `pi.sendUserMessage(message)`.
- Session-start delivery of undelivered wakes and the end of the fallback wake (gate 2 A-033): R-050.
- The fake's deferred loop going on after a throwing action, where Pi drops the rest (E-20's last clause): an open
  point in `outcome.md`.
- A race between the hook's one starter and an owner's prompt made in the same microtask gap: rare and outside the
  hook's sends; named in `outcome.md` → `## Open points` when the change leaves it.
- The rename of `test/s3-finish-wake.test.ts` (T-29 (1)): R-083.

## Acceptance

- AC-1: `node --test test/hook/wake.test.ts` → exit 0.
- AC-2: `node --test test/fake-engine.test.ts` → exit 0.
- AC-3: `node --test test/s3-finish-wake.test.ts` → exit 0.
- AC-4: `node --test test/u4-wake-claims.test.ts` → exit 0; `node --test test/job/wake-delivery.test.ts` → exit 0;
  `node --test test/runtime/pi-api.test.ts` → exit 0.
- AC-5: `node adrian-rebuild/tools/fails-before.mjs test/fake-engine.test.ts` → exit 0, its output in `outcome.md` →
  `## Fails before` (HEAD's fake runs the new E-21 test).
- AC-6: `node adrian-rebuild/tools/fails-before.mjs test/hook/wake.test.ts test/fake-engine.mjs` → exit 0, its output
  in `outcome.md` → `## Fails before` (HEAD's hook with the new fake runs the new wake tests).
- AC-7: `git grep -q 'A-089: ' -- test/hook/wake.test.ts` → exit 0; `git grep -q 'A-090: ' -- test/hook/wake.test.ts`
  → exit 0; `git grep -q 'E-21' -- test/fake-engine.mjs` → exit 0 (each exits 1 at `aae86b7`).
- AC-8: `git grep -q 'later injects, and any inject while busy, are followUp' -- hook/wake.ts` → exit 1 (exit 0 at
  `aae86b7`, `hook/wake.ts:420`).
- AC-9: `git grep -q 'before_agent_start' -- hook/wake.ts` → exit 0 (exit 1 at `aae86b7`).
- AC-10: `git grep -q 'and Pi settles' -- docs/herdr-status.md` → exit 1 (exit 0 at `aae86b7`, `docs/herdr-status.md:134`).
- AC-11: `npx tsc --noEmit` → exit 0.
- AC-12: `npx biome check --error-on-warnings .` → exit 0; `node adrian-rebuild/tools/check.mjs` → exit 0.
- AC-13: `node adrian-rebuild/tools/gate.mjs` → exit 0.
- AC-14 (judgment): a delivery's `settled` is set only by the `agent_settled` after its own `message_start`; a
  delivery that never enters is counted only by the backstop; a sweep makes at most one send while the session reads
  idle; each rule of the fake's E-21 follows the Pi 1.5.1 line it cites; the output of AC-5 and AC-6 names each new
  test as failing at HEAD; no existing test changed its assertion.

## Migration

None: every flag that changes lives in the hook's memory; the backstop writes through the existing `recordUnconfirmed`,
so `notify/claims/`, `notify/delivered/`, `notify/unconfirmed/<family>` and the job's `log` keep their names and
formats (the new reason is free text in a log line). No `.limen/` file, record field, CLI form or project stub changes.

## Risk

- An existing test may rely on the fake reserving the session at the send (two idle sends in one stretch joining one
  run). The implementer then stops with `BLOCKED` naming the test, rather than changing its assertion or keeping the
  old fake behaviour.
- The tick order of E-21 is traced from Pi's sources and not run (`evidence/inventories/R-111.md` → section 12); the
  fake follows that trace, and seat step 4.14 checks the outcome on real Pi.
- A held settle window longer than `CLAIM_STALE_MS` (another extension's awaiting handler) could let the backstop count
  a deferred wake that would still enter; the threshold makes it a rare, visible attempt (T-01), not a silent loss.
- `test/s3-finish-wake.test.ts` hung once before this ticket (D-128); by D-029 a hang in a gate run is a question for
  Adrian by day and a `.night/questions.md` entry by night, never a re-run.

## Rollback

`git revert $(git log --format=%H --grep='^R-111:' adrian-rebuild --)`. Nothing on disk changes, so no reverse
migration.

## Decisions

1. 2026-11-26 D-129 (Adrian: "rekomendacja"; Q-90, option 1): A-090 is a new finding fixed here with A-089; size L.

Settled by the documents when the ticket was written (2026-11-26, the main session's reading, not a night default;
the inventory's questions in `evidence/inventories/R-111.md` → section 11), for Adrian at gate 5.4:
2. Design: option 3 of the inventory (settle by entry, one starter per idle sweep, a backstop). Option 2 (sends kept
   out of the settle window) rests on timing, and a window that another extension holds open still catches the timer
   sweeps (z. 14: guarantees in code).
3. The backstop exists (inventory question 2 (a)): T-01 does not allow a lost wake to wait silently until the session
   ends. Its bound is the existing `CLAIM_STALE_MS` (30 s), a code constant for a mechanic Adrian does not configure
   (T-03: "Code constants serve only mechanics that Adrian does not configure"). Its test uses `node:test`'s
   mocked timers and no new test knob (fewer moving parts).
4. The other wakes follow the starter through a sweep from `before_agent_start` (question 3 (a)), so wakes that are due
   together still enter one coordinator turn, as `test/s3-finish-wake.test.ts:200` asserts today. Leaving them to the
   next timer sweep would make that test depend on timing and would cost a coordinator turn per extra wake (A-078
   measures coordinator cache-read tokens per landed ticket).
5. The starter keeps `pi.sendUserMessage(message)` with no option (question 4): the call form changes in R-051 (gate 2
   A-034 revision 4).
6. The tests live in `test/hook/wake.test.ts` and `test/fake-engine.test.ts` (questions 5 and 6): T-29 (1)–(3) and
   T-28 (5).
7. The fake reproduces E-21 (question 7 (b)): T-28 (5) asks for a test on the fake engine for behaviour that depends on
   Pi, and the starter rule depends on E-21 (D-129).
8. Step 4.14 is reworded and E-20 and E-21 are recorded in `## Engine facts` (questions 8 and 9), in the commit that
   makes this ticket `ready`.
