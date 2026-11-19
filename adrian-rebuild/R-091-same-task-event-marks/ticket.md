<!-- PL: Ticket R-091 etapu 1 przebudowy (poprawka po bramce 5.1, delegated, D-045 (3), D-046): runner same-task
oznacza każdy typ obiektu, który Pi 1.5.1 wypisuje w trybie RPC, jako obsługiwany albo pomijany, według źródeł
pakietu; typ bez oznaczenia i prośba rozszerzenia, na którą Pi czeka, kończą próbę błędem z zapisanym surowym
obiektem. Koniec przebiegu to `agent_settled`, a raport podaje definicję touchpoints i ścieżkę transkryptu. Stan:
zamknięty (Adrian przyjął przebieg implementera mimo unieważnienia przez jego własną zmianę ustawień; AC-2 ocenia
przebieg „przed zmianą” sesji głównej); B.2 na seacie może ruszyć z tym runnerem. -->

# R-091 The same-task runner refuses an unmarked Pi event and states its touchpoint definition

## Problem

The same-task runner (R-011, R-088) talks to Pi through one module, `adrian-rebuild/tools/pi-rpc.mjs`, which declares
a subset of Pi's RPC mode from memory of Pi's documentation, because the sources were not fetched then
(`pi-rpc.mjs:7-19`). At `2be4b80`:
- Every object outside that subset is passed on and not interpreted (`pi-rpc.mjs:19`: "Every other object (the rest
  of JSON mode's events, a response to abort) is passed on and not interpreted"). An extension's request on which Pi
  waits for an answer would hold the coordinator until the attempt's time limit, at least three hours (R-011 →
  `outcome.md` → Open points: "a waiting UI request would hold the coordinator until the time limit").
- The run's end is `agent_end` (`pi-rpc.mjs:36`, used by `observe`, `same-task.mjs:214-217`). The sources of Pi 1.5.1
  now in `adrian-rebuild/input/vendor/` (fetched by Adrian on 2026-11-19 by `## Commands`, stage-2 row) say otherwise:
  "`agent_end` marks the end of one low-level agent run, but retries, overflow recovery, compaction, steering, or
  follow-up work can still follow. Wait for `agent_settled` when the client needs to know Pi will not continue
  automatically" (`pi-coding-agent@1.5.1/docs/rpc.md#L69`; also `docs/json.md#L48`). An `agent_end` with `willRetry:
  true` therefore makes the runner see an idle coordinator, send the fixed reply and count an owner turn while Pi is
  still working.
- A prompt's response carries `data.disposition`: "`handled` if an extension command or input handler consumed the
  prompt, `queued` if Pi queued it during a run, or `started` if Pi accepted it to start a run"
  (`docs/rpc-commands.md#L40`); after `handled`, "no run started for this prompt, so don't wait for `agent_settled`"
  (`docs/rpc.md#L67`). The runner reads no disposition, so after `handled` it waits for an `agent_start` that never
  comes (`same-task.mjs:209-213`, `:256`), until the time limit.
- The report states no definition of `touchpoints`, and it does not name where the coordinator's transcript is,
  although Pi's session file stays in `<out>/session/` (`same-task.mjs:508-513`).

What Pi 1.5.1 writes to stdout in RPC mode (the sources, read as data):
- `response`: `{id?, type: "response", command, success: true, data?}` or `success: false` with `error`
  (`dist/modes/rpc/rpc-mode.js#L30-38`); for `prompt`, sent once after the prompt's preflight, with
  `data.disposition` (`#L314-338`); a command Pi cannot parse gets `command: "parse"` (`#L628`).
- `extension_ui_request` with `id` and `method` (`dist/modes/rpc/rpc-types.d.ts#L405-464`): `select`, `confirm` and
  `input` wait for an `extension_ui_response` until their optional `timeout` (`rpc-mode.js#L60-90`); `editor` waits
  with no timeout (`#L178-195`); `notify`, `setStatus`, `setWidget`, `setTitle` and `set_editor_text` are "Fire and
  forget - no response needed" (`#L92-170`).
- `extension_error` with `extensionPath`, `event` and `error` (`rpc-mode.js#L267`).
- Every session event, through `toJsonEvent` (`rpc-mode.js#L273`, `dist/modes/json-event.js`): the agent events
  `agent_start`, `agent_end` (with `willRetry`), `turn_start`, `turn_end`, `message_start`, `message_update`,
  `message_end`, `tool_execution_start`, `tool_execution_update`, `tool_execution_end`
  (`pi-agent-core@1.5.1/dist/types.d.ts#L461-501`), and the session events `agent_settled` (with `aborted`),
  `queue_update`, `compaction_start`, `compaction_end`, `entry_appended`, `session_info_changed`,
  `thinking_level_changed`, `auto_retry_start`, `auto_retry_end`, `summarization_retry_scheduled`,
  `summarization_retry_attempt_start`, `summarization_retry_finished`, `bash_execution_update`
  (`pi-coding-agent@1.5.1/dist/core/agent-session.d.ts#L49-111`).

Relied on:
- D-045 (3) (Adrian, gate 5.1): "(3.2) an RPC message outside the declared subset ends the attempt with an error and
  records the raw message instead of passing it on; (3.4) the attempt's report states the definition ("touchpoints =
  answered owner turns; questions asked while a job runs are not counted") and keeps the coordinator session's
  transcript".
- D-046 (4): "each event type of Pi 1.5.1's list (from the package sources of `## Commands`, stage 2 row) is marked in
  the code as handled or skipped; a type on which Pi waits for an answer (such as an extension's request for one) is
  never skipped; a type with no mark ends the attempt with an error that records the raw event. B.2 runs with R-091's
  runner".
- D-021: one attempt is a whole coordinator session through Pi's RPC mode; the fixed reply answers every owner turn;
  `touchpoints` counts the fixed replies.
- z. 2: a decision comes from a field, not from text; T-29: one test, one mechanism; T-30: a comment states a true
  reason.

## Change

1. `adrian-rebuild/tools/pi-rpc.mjs`:
   - One table, `MARKS`, holds every `type` of the list in `## Problem`, each marked `handled` or `skipped`; the header
     cites the sources instead of "declared from the documentation", and says that B.2 still checks the real Pi.
     `handled`: `response`, `agent_start`, `agent_settled`, `message_end`, `extension_ui_request`,
     `extension_error`; `skipped`: every other type of the list, `agent_end` included (the run's end is
     `agent_settled`).
   - `extension_ui_request` is marked by `method` too: `select`, `confirm`, `input` and `editor` (Pi waits on them)
     end the attempt with a `PiError`; the runner sends no answer, since an answer would be a decision the measurement
     must not take. `notify`, `setStatus`, `setWidget`, `setTitle` and `set_editor_text` are skipped. A method in
     neither list ends the attempt like an unmarked type.
   - A `response` is handled only for a command the runner sent: `prompt` (as today, one per prompt, now also with its
     `data.disposition` passed on) and `abort` (skipped). Any other `command`, `parse` included, ends the attempt with
     a `PiError`.
   - An object whose `type` has no mark, or a prompt response whose `disposition` is not `started`, `queued` or
     `handled`, ends the attempt with a `PiError`.
   - Every `PiError` raised for an object carries the raw line as Pi wrote it, in full.
   - `runEnded` becomes `agent_settled`; `promptAnswer` also returns the disposition.
2. `adrian-rebuild/tools/same-task.mjs`:
   - `observe`: the run ends at `agent_settled`; a prompt answered with disposition `handled` started no run, so the
     runner stops waiting for `agent_start` and the turn is quiet from then on; `started` and `queued` keep today's
     path.
   - `extension_error` objects are kept in `result.json` → `extensionErrors` (each raw object), and the attempt goes
     on: Pi continues after it, and the reader judges the attempt with the list in hand.
   - When the attempt ends on a `PiError` that carries a raw line, the runner writes `<out>/protocol-error.json`
     (atomically, `atomic-write.mjs`) with the reason and the raw line, then stops Pi and the jobs as today and exits 4;
     its stderr names the file.
   - `result.json` gets `touchpointsDefinition` with exactly the text "touchpoints = answered owner turns; questions
     asked while a job runs are not counted" and `transcript` with the path of the coordinator's session folder
     (`<out>/session`); `report` prints the definition once, above its counts.
3. `adrian-rebuild/tools/fake-pi-rpc.mjs` plays the real vocabulary: `agent_settled` after a run, `agent_end` with
   `willRetry`, a prompt response with `data.disposition`, a script step that writes any given object (for the
   skipped, waiting and unmarked cases), and `extension_error`.
4. `adrian-rebuild/tools/test-same-task.mjs`, written first; each test fails before the change:
   - "an object of a type with no mark ends the attempt with exit 4 and protocol-error.json holds its raw line";
   - "an extension's confirm request ends the attempt with exit 4, and a notify request does not" (two tests if the
     two mechanisms differ in code);
   - "every skipped type passes without changing the attempt" (one fake run that writes one object of each skipped
     type between `agent_start` and `agent_settled`; the attempt ends as without them);
   - "an agent_end that will retry is not an owner turn": `agent_end` with `willRetry: true`, a second run, then
     `agent_settled` give one owner turn, not two;
   - "a prompt the coordinator's extension handled does not wait for a run";
   - "an extension error is kept in result.json and the attempt goes on";
   - "result.json and the report state the touchpoint definition, and result.json names the transcript".

## Out of scope

- The fixed reply, the end rule of item 3.5, the M-05 counts and the evaluation (`evaluate`, `report`'s pass^k).
- Answering an extension's request; B.2 shows whether any comes, and a decision follows then.
- Pi's commands other than `prompt` and `abort`, and the bridge (`@vanillagreen/pi-claude-bridge`), whose sources are
  not fetched; under the bridge Pi's stdout vocabulary is still Pi's own.

## Acceptance

- AC-1: `node --test adrian-rebuild/tools/test-same-task.mjs` → exit 0.
- AC-2: `node adrian-rebuild/tools/fails-before.mjs` → exit 0: the changed test file fails at `HEAD`; the outcome names
  each new test that passes at `HEAD` and why.
- AC-3: `node adrian-rebuild/tools/gate.mjs` → exit 0 with `fail 0`.
- AC-4: `node adrian-rebuild/tools/check.mjs` → exit 0; `npx biome check --error-on-warnings adrian-rebuild` → exit 0.
- AC-5 (judgment): `MARKS` holds exactly the types of `## Problem`'s list, each with a source line in the header; no
  type or method on which Pi waits is `skipped`; no object reaches `observe` without a mark; the runner never reads
  reply text to decide.

## Migration

none: a rebuild tool; no on-disk format of Limen changes. `result.json` gains three fields.

## Risk

- Limen's hooks or the bridge may send a waiting request or an unmarked type in every attempt; then every B.2
  attempt ends within seconds with `protocol-error.json`, which costs little, and Adrian decides how the runner treats
  it (a new mark or an answer).
- The list comes from the npm sources of Pi 1.5.1; if the seat's Pi differs, B.2's first attempt shows it the same way.

## Rollback

`git revert $(git log --format=%H --grep='^R-091:' adrian-rebuild --)`; no migration.

## Decisions

- 2026-11-19 (Adrian, in the day session): the two items the sources added beyond D-045 (3) stay in this ticket: the
  run's end is `agent_settled`, and a prompt answered with disposition `handled` does not wait for a run.
- 2026-11-19 (main session, the ticket's error): AC-2's command cannot exit 0 for a test under
  `adrian-rebuild/tools/`, because `fails-before.mjs` runs only `*.test.*` files (`fails-before.mjs:14`, `:66-69`).
  AC-2 is judged by the main session's own before-run with the same method, as R-088's was: `git archive HEAD`
  unpacked, the new `test-same-task.mjs` and `fake-pi-rpc.mjs` copied in, `node --test
  adrian-rebuild/tools/test-same-task.mjs` → exit 1, tests 57, pass 42, fail 15; the three new tests that pass at
  HEAD (HEAD passes every object on unread) are named in `outcome.md`.
- 2026-11-19 (Adrian, in the day session): the implementer's run stands although `review-guard.mjs compare --git`
  voided it: the only change it named was `.claude/settings.local.json` (modified at 17:48:10), where Adrian himself
  added the one line `"Bash(node adrian-rebuild/tools/handover.mjs *)"` while the run was going, and nothing else.
