<!-- PL: Wynik ticketu R-091: pi-rpc.mjs oznacza w tabeli MARKS każdy z 26 typów, które Pi 1.5.1
wypisuje w trybie RPC, według źródeł pakietu; prośba rozszerzenia, na którą Pi czeka, typ, metoda albo odpowiedź bez
oznaczenia i nieznana dyspozycja kończą próbę kodem 4 i plikiem protocol-error.json z surową linią. Przebieg kończy
`agent_settled`, prompt obsłużony przez rozszerzenie nie czeka na przebieg, a result.json podaje błędy rozszerzeń,
definicję touchpoints i ścieżkę transkryptu. Dowody: 15 nowych testów pada na kodzie z HEAD, po zmianie 57/57,
bramka 253/253 w przebiegu sesji głównej, check.mjs i Biome z kodem 0; recenzja PASS w rundzie 1. Stan:
zamknięty. -->

# Outcome: R-091 The same-task runner refuses an unmarked Pi event and states its touchpoint definition

## Done

- `adrian-rebuild/tools/pi-rpc.mjs`:
  - The header cites the Pi 1.5.1 sources for every type Pi writes to stdout in RPC mode (grouped by source, each
    with its file and lines), says that step B.2 still checks the real Pi, and quotes why a run ends at
    `agent_settled`.
  - `MARKS` holds exactly the 26 types of `## Problem`'s list: `handled` for `response`, `extension_ui_request`,
    `extension_error`, `agent_start`, `agent_settled` and `message_end`; `skipped` for the other 20, `agent_end`
    included. It is exported and frozen; a lookup takes only own string keys, so `constructor` or `__proto__` is no mark.
  - `UI_METHODS` marks `select`, `confirm`, `input` and `editor` as `waits` and the five fire-and-forget methods as
    `skipped`; `RESPONSES` marks `prompt` as `handled` and `abort` as `skipped`.
  - `#take` reads each stdout line: a `handled` object is queued with its line, a `skipped` one is passed over, and
    any other line fails the session with a `PiError` that carries the line in full: a waiting method, a type, method or
    command with no mark (`parse` included), and a line that is not JSON. `#answered` also fails a prompt response that
    is accepted without the disposition `started`, `queued` or `handled`. After a failure nothing more is passed on, as
    before.
  - `PiError` has a `line` field; `next()` returns `{ object, line }`; `runEnded` is `agent_settled`; `promptAnswer`
    returns the disposition; `isExtensionError` is new.
- `adrian-rebuild/tools/same-task.mjs`:
  - `observe` takes `{ object, line }`; the run ends at `agent_settled`; an accepted prompt with disposition `handled`
    stops the wait for `agent_start` and marks the turn quiet; `started` and `queued` keep the previous path.
  - The two `PiError`s raised here for a response (a refused owner message; a refused reply with no run started) carry
    the response's line.
  - `extension_error` objects go to `result.json` → `extensionErrors`, and the attempt goes on.
  - On a `PiError` with a line, `keepProtocolError` writes `<out>/protocol-error.json` (`{ "reason", "line" }`, with
    `writeAtomic`) and names the file on stderr; then Pi and the jobs stop as before, and the exit code is 4.
  - `result.json` gets `touchpointsDefinition` (`TOUCHPOINTS_DEFINITION`, exactly the text of D-045 (3.4)) and
    `transcript` (`<out>/session`, absolute); `report` prints the definition as its first line.
- `adrian-rebuild/tools/fake-pi-rpc.mjs`: a run ends with `agent_end` (`willRetry: false`) and `agent_settled`; a
  prompt response has `data.disposition` (`started` by default, `handled` starts no run, any other value from the
  scenario); new steps `write` (an `object` as JSON, or a `line` as given), `extensionError` (the shape of
  `rpc-mode.js#L267`) and `retry` (`agent_end` with `willRetry: true`, a delay, then a new `agent_start`); a prompt
  that arrives while a run is active is refused with Pi's own text (`agent-session.js#L1751`) and takes no run of the
  scenario.
- `adrian-rebuild/tools/test-same-task.mjs`: 18 new tests (below); the PL summary is updated.

## Proof

| Criterion | Command | Exit | Result |
|---|---|---|---|
| AC-1 | `node --test adrian-rebuild/tools/test-same-task.mjs` | 0 | tests 57, pass 57, fail 0 (17.8 s) |
| AC-2 | the main session's before-run (`ticket.md` → `## Decisions`): `git archive HEAD` unpacked, the new test file and fake copied in, `node --test adrian-rebuild/tools/test-same-task.mjs` | 1 | tests 57, pass 42, fail 15 (the 15 of Fails before) |
| AC-3 | `node adrian-rebuild/tools/gate.mjs` (the main session's run, which counts) | 0 | tests 253, pass 253, fail 0 (90.8 s) |
| AC-3 | `node adrian-rebuild/tools/gate.mjs` | 0 | tests 253, pass 253, fail 0; Biome `Checked 163 files … No fixes applied.` |
| AC-4 | `node adrian-rebuild/tools/check.mjs` | 0 | `… PL summaries: 114 files; ticket folders: 17; changes: 16 entries; 0 errors` (with this file) |
| AC-4 | `npx biome check --error-on-warnings adrian-rebuild` | 0 | `Checked 28 files … No fixes applied.` |
| AC-5 | a one-off `node --input-type=module` comparison of `Object.keys(MARKS)` with the 26 types of `## Problem` | 0 | `list 26 marks 26 missing [] extra []`; handled: the six of `## Change` |

## Fails before

The new tests and the new fake in place, `pi-rpc.mjs` and `same-task.mjs` at `HEAD` (the working tree was `HEAD` plus
the two test files) → `node --test adrian-rebuild/tools/test-same-task.mjs` → exit 1, tests 57, pass 42, fail 15
(22.9 s). The 39 tests from before pass with the new fake. Each failure is for the expected reason:

```
✖ result.json states the touchpoint definition and names the coordinator's session folder as the transcript
    actual: [ undefined, undefined ]
✖ an object of a type with no mark ends the attempt with exit 4 and protocol-error.json holds its raw line
    same-task: finished, 1 touchpoints; wrote …/result.json   0 !== 4
✖ a stdout line that is not JSON ends the attempt with exit 4 and protocol-error.json holds it in full
    actual: undefined   (exit 4 at HEAD too, but no protocol-error.json)
✖ a refused owner message ends the attempt with exit 4 and protocol-error.json holds Pi's response
    actual: null        (exit 4 at HEAD too, but no protocol-error.json)
✖ an extension's select request, on which Pi waits for an answer, ends the attempt with exit 4      0 !== 4
✖ an extension's confirm request, on which Pi waits for an answer, ends the attempt with exit 4     0 !== 4
✖ an extension's input request, on which Pi waits for an answer, ends the attempt with exit 4       0 !== 4
✖ an extension's editor request, on which Pi waits for an answer, ends the attempt with exit 4      0 !== 4
✖ an extension request of a method with no mark ends the attempt with exit 4                       0 !== 4
✖ a response to a command the runner did not send, such as parse, ends the attempt with exit 4     0 !== 4
✖ a prompt response whose disposition is not started, queued or handled ends the attempt with exit 4   0 !== 4
✖ an agent_end that will retry is not an owner turn
    same-task: failed: Pi refused a prompt although no run started: Agent is already processing. …   4 !== 0
✖ a prompt the coordinator's extension handled does not wait for a run
    actual: 'timeout'   expected: 'finished'
✖ an extension error is kept in result.json and the attempt goes on
    actual: undefined
✖ the report prints the touchpoint definition once, above its counts
    actual: [ '…/r-definition: finished; pass: no', 0 ]
```

At `HEAD` the retry case ends in exit 4: the runner takes `agent_end` for the run's end, sends the fixed reply during
the retry's delay, Pi refuses it as it refuses any prompt during an active run, and the runner fails on the refusal.

New tests that pass at `HEAD`, and why: "every skipped type passes without changing the attempt", "every extension
request that Pi does not wait on passes without changing the attempt" and "a response to abort passes without changing
the attempt". At `HEAD` every object is passed on and not read, so a skipped object also leaves the attempt unchanged.
These three tests check that the new marks do not refuse what Pi 1.5.1 writes in a normal run.

AC-2's command, `node adrian-rebuild/tools/fails-before.mjs`, cannot pass for this ticket: it takes only changed paths
under `test/` (`fails-before.mjs:37`) and only names matching `\.test\.(ts|mts|mjs|js)$` (`:14`), so for
`adrian-rebuild/tools/test-same-task.mjs` it stops with "no new or changed test file under test/" (`:68`), with or
without paths. AC-2 is judged by the same method by hand, as R-088's outcome did (`ticket.md` → `## Decisions`): the
main session's own run, from `git archive HEAD` with the new test file and fake copied in, gave exit 1, tests 57,
pass 42, fail 15, the same 15 failures as the implementer's run above.

## Judgment criteria

AC-5 (judgment):
- `MARKS` holds exactly the 26 types (see Proof). Each type is named in the header with its source file and lines:
  `response`, `extension_ui_request` and `extension_error` one by one, the agent events and the session events as two
  groups with one source each.
- No type or method on which Pi waits is `skipped`. The four `waits` methods end the attempt, and no type of `MARKS`
  waits for an answer: in `rpc-mode.js` only `createDialogPromise` (`#L51-L83`) and `editor` (`#L178-L195`) put an
  entry in `pendingExtensionRequests`.
- No object reaches `observe` without a mark. `#take` queues only `handled` objects, and only `next()` hands them on.
- The runner never reads reply text to decide. It decides from `type`, `method`, `command`, `success` and
  `data.disposition`, and the reply text goes only into `lastReply`, as before.

## Deviations from the ticket

- The ticket's last test is split into two tests (T-29 (3)): "result.json states the touchpoint definition and names
  the coordinator's session folder as the transcript" (in the `describe` of the full attempt, so no extra attempt) and
  "the report prints the touchpoint definition once, above its counts". `summarize` writes the first and `reportOnce`
  prints the second.
- The confirm/notify test is split by mechanism: one test per waiting method (select, confirm, input, editor), which
  fail; and one test for the five fire-and-forget methods (notify included), which pass.
- Five tests beyond the ticket's list, one for each mechanism that `## Change` names: a method with no mark; a response
  to a command the runner did not send (`parse`); an unknown disposition; a response to abort (skipped); a refused
  owner message, whose `PiError` is raised in `same-task.mjs` and carries Pi's line.
- A line that is not JSON is no object, but its `PiError` also carries the line, so it writes `protocol-error.json`
  too (D-045 (3.2): "records the raw message"). One test covers it. Its stderr message still shows the first 200
  characters, and the file holds the whole line.
- `protocol-error.json` has the fields `reason` and `line`. When the file cannot be written, stderr names that failure
  next to the protocol error, and Pi and the jobs are still stopped. The exit code stays 4, with the original reason.
- The fake refuses a prompt during an active run, as Pi does. The retry test needs this: without it, the fake would
  start a second scenario run inside the first.

## Measurement

`unmeasured` (M-05, B.2): whether the seat's Pi 1.5.1, under the bridge and with Limen's hooks at `rebuild-base`,
writes only marked objects, and whether its runs end at `agent_settled` as the fake plays them. Read from the code,
the hooks at `rebuild-base` call only `ui.notify` and `ui.setStatus` (`hook/wake.ts:280`, `hook/group-peer.ts:153`
and others), and both are skipped. No hook calls a method that waits.

## Open points

- AC-2 as written cannot exit 0 for a ticket whose test file is in `adrian-rebuild/tools/` (see Fails before); the
  ticket's `## Decisions` replaces it with the main session's before-run. `tools/fails-before.mjs` still takes only
  `test/`, so a later ticket of the runner names the same method.
- For B.2 (review note 3, guessed): if Pi answers a prompt `started` and then settles without an `agent_start` (the
  sources allow it when `agent.prompt` throws before its first event), the runner keeps waiting for `agent_start`
  until the attempt's time limit, as at HEAD. An attempt that reaches its time limit with no `agent_start` after its
  last prompt shows it; what the runner does then is decided with that evidence.
- Review note 4: on exit 4 the runner writes no `result.json`, as before for every failure, so the extension errors
  and turns gathered before a protocol error are not kept; `protocol-error.json` and `<out>/session` are.
