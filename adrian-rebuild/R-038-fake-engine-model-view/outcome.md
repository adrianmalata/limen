<!-- PL: Szkic wyniku R-038 (implementer, 26.11, przy `8de6fd7`): deklaracja mapowania mostu 5.0.3 w
`src/runtime/bridge-view.ts`, atrapa silnika zapisująca widok modelu (`fake-view.jsonl`) przy każdym wywołaniu modelu
według faktów Pi 1.5.1 (biegi, kolejki, `nextTurn`, `triggerTurn`, narzędzia, `agent_end`, kompakcja, przyczyny
`session_start`), transkrypt w kształcie Pi (`test/fake-session.mjs`), czytnik pierwszego wywołania w `src/job/usage.ts`
i skrypt seata `seat/bridge-contract.ts`. Pierwsza bramka padła na `test/s1-spawn.test.ts:62`, który liczył na to, że
transkrypt atrapy nie ma tur Pi; po `BLOCKED` Adrian wybrał D-127 (zmiana tylko przygotowania testu: usunięcie
`session/fake.jsonl` przed podłożeniem tur), więc asercje zostały. Runda 1 recenzji: PASS z dziewięcioma uwagami;
poprawki F1–F7 (`ticket.md` → `## Decisions` 11) zrobione, każda zmiana zachowania z testem, który pada przed nią;
uwaga 3 (typy `PiCallMessage`/`PiCallPart` obok typów adaptera) czeka w otwartych punktach na bramkę 5.4. Runda 2:
PASS z trzema uwagami; poprawki G1–G3 (`## Decisions` 12): słowo `compact` w punktach Pi (ręczna przerywa bieg,
progowa w przygotowaniu następnego wywołania albo między `agent_end` a `agent_settled`), testy atrapy z własnym
katalogiem agenta i domem. Jedno zawieszenie `test/s3-finish-wake.test.ts` w osobnym przebiegu jest w otwartych
punktach: D-128 potwierdziło, że to błąd hooka budzenia (A-089, R-111). Runda 3: PASS z pięcioma uwagami; cztery
w otwartych punktach 5–8, licznik testów poprawiony. Stan: bramka sesji głównej zielona (1282/1282), ticket zamknięty. -->

# R-038 outcome

## Done

1. `src/runtime/bridge-view.ts`, new: the one declaration of bridge 5.0.3's mapping. `bridgeView(call, cursor)` is a pure
   function from Pi's side of one model call (`PiCall`: Pi's system prompt, the call's messages in Pi's form, the
   `AGENTS*` text, `isolated`, Pi's tool names) and the bridge's cursor after the previous call to the call's
   `BridgeView` (`system` with the preset `claude_code` and its `append` parts, `path`, `messages`, `tools`) and the next
   cursor. `answered(cursor, answer)` records whether the call's answer leaves the query waiting on tool results,
   `historyReplaced(cursor)` marks a compaction (a restart while the query waits, else a rebuild), and
   `agentsPath(cwd, agentDir, exists)` is the bridge's lookup of the `AGENTS*` file (F2, F6 below). Every rule names its E-n
   and its `bridge@5.0.3/…#L…` lines from `evidence/engine-sources/bridge-5.0.3.md`, Pi-side rules their Pi 1.5.1 lines:
   the append (the `AGENTS*` text under `# CLAUDE.md` with `\bpi\b` as `environment`, none when isolated, then Pi's
   skills block with its read tool renamed; never Pi's own prompt); `fresh` for a first call without history, `rebuild`
   for a first call with history, after a compaction, or for a tail after the cursor that is not all user (a Pi
   `system` entry included), `reuse` otherwise, with the trailing user run as one prompt (`\n\n` between messages, `\n`
   between one message's text blocks, `[continue]` for a run with no text); one record per message on a rebuild with
   each tool result right after its tool use; Pi's summary as one user record with Pi's prefix; a mid-run restart as a
   rebuild with the killed query's request and the bridge's notice as a record marked `history replaced` with no text;
   custom messages as `user`, with a string content as Pi's one text block, `system` entries dropped, `tool` the one
   other role; tools as `mcp__custom-tools__<name>`, or Claude Code's own when Pi declares none (F5 below).
   A call that brings tool results continues the running query (E-5) and keeps that query's path. A message of an
   unknown role or a prompt run with an image ends with class `environment`, code `BRIDGE_UNMAPPED`.
2. `test/fake-engine.mjs`: one mode, the bridge. For every model call it builds Pi's context and appends that call's view
   from `src/runtime/bridge-view.ts` to `fake-view.jsonl` in the record dir. Its run model follows Pi 1.5.1
   (`agent-session.js`, `pi-agent-core/agent-loop.js`, `agent.js`): a run is reserved synchronously, so the session is
   busy from the send on; `before_agent_start` once per run, each handler seeing the prompt the one before it
   returned, the run's messages being its trigger, the pending `nextTurn` messages, then the handlers' messages; steers
   and follow-ups in queues that hand out one message at a time (Pi's default); `triggerTurn: false` held to the turn's
   end while busy and appended with no run while idle; a send while `agent_settled` is emitted deferred and run inside
   that settle; `agent_start`, `turn_start`, message events, `context` with every message of the call but `system`
   ones, `turn_end`, `agent_end`, then one `agent_settled`; each `tool` word one call that ends in a bash tool call,
   then `tool_execution_start`, `tool_call` (a returned block, or a thrown error, stops the call and is its result),
   `tool_result` (a returned content replaces the result's), `tool_execution_end` and the result message in the next
   call. The task's run is prepared at the start, as before, and makes its first call at the first `tool` word or after
   the last word; the words before it run while the session is idle, as before. Each call of a run takes its answer
   first, so the task's run waits for the script's next `tool` word or its end before the call's preparation. New
   words: `compact <manual|threshold|overflow> [retry]` (the compaction entry, the context rebuilt, `session_compact`
   with Pi's payload awaited before the next call, at Pi's point for its reason, G1 below), `reload` and `new` (`session_shutdown` with its reason, the extensions
   loaded again, `session_start` with `reason` `reload`, or `new` with `previousSessionFile`, a new session file and id).
   `session_start` carries `reason: "startup"`; `session_shutdown` at the end `reason: "quit"`. The fake awaits every run
   chained before `session_shutdown`. The existing words keep their stdout lines and order (the assistant reply's line
   is printed as before; a tool call's assistant message goes to the hooks and the transcript only); `fake-task.txt`,
   `fake-system.txt`, `fake-context.txt` and `fake-events.jsonl` stay. `getSessionFile()` names the real transcript.
3. `test/fake-session.mjs`, new (the helper the ticket allows): the fake's Pi session. A new file gets a `session`
   header; then `message` entries (the user prompt, the assistant reply or tool call with the argv's route and a zero
   usage, tool results), `custom_message` and `compaction` entries, each with an 8-hex id, `parentId` and an ISO
   `timestamp`; the conversation is compaction-aware as Pi's `buildContextEntries`. A compaction keeps the entries from
   the last assistant message on, a cut Pi makes inside a turn (`compaction.js:318-334`), or none without one (G2 below). `--continue` opens the copied file
   and reads it back, so a continuation's first call holds the parent's conversation (path `rebuild`).
4. `src/job/usage.ts`: `firstCallOf(file, text)` gives the messages of a session's first model call (the entries before
   its first assistant message: `system` and `user` messages, a custom message as `user` with a string content as one
   text block) and every unread line of the
   file; `readSessionFile` and it share one line loop (`sessionLines`), so there is no second parser.
5. `seat/bridge-contract.ts`, new: `node seat/bridge-contract.ts <pi session file> <claude code session file>`. Both
   files are read through `seat/tool-outcome.ts`'s `requiredText` (exit 4 when unreadable); the Pi file through
   `firstCallOf`, whose unread line ends it with BAD_DATA (exit 4); the Claude Code file line by line through
   `src/boundary.ts` (a line that is no JSON object with a string `type`, or a `user` or `assistant` record whose
   `message.content` is neither a string nor an array of blocks, is BAD_DATA, exit 4, naming the file and the line;
   other types are skipped and counted). It compares the text of the first `user` record with the view's first user
   record (for a new session's first call, its prompt) byte for byte: equal → exit 0 and one line naming the bytes and
   the skipped types; different → exit 1 naming the first differing byte with a 60-byte excerpt of each side.
6. Tests: `test/runtime/bridge-view.test.ts` (new, 18 tests, one per rule, the negative test of T-31 (1) first, four of
   them from F2, F5 and F6); `test/fake-engine.test.ts` (20 new tests, one per mechanism, on test extensions, beside its
   two; three of them from F3 and F4, four from G1–G3); `test/cli/spawn.test.ts`
   (one new test: A-086 shown, the worker's first call is its task, then the cue, as one prompt, and none of the
   system prompt that `fake-system.txt` holds); `test/seat/bridge-contract.test.ts` (new, 5 tests on synthetic files);
   `test/job/usage.test.ts` (one test of `firstCallOf`); `test/plant.ts`: `engineViews(dir)` beside `engineEvents`, both
   through one reader of the fake's JSON lines.
7. Comments: the fake's header and its comments on delivery, `test/fake-engine.test.ts:1-2`, the openings of
   `test/cli/spawn.test.ts` and `test/job/usage.test.ts`, the header of `src/job/usage.ts`; `test/plant.ts`'s
   `engineEvents` comment still holds.
8. `test/s1-spawn.test.ts` (D-127, `ticket.md` → `## Decisions` 10): the setup of the test at `:62` removes the fake's
   own `session/fake.jsonl` before it plants `session/turns.jsonl`, with a comment that the fake's zero-token turn on
   the requested route would join the count; its assertions at `:112-113` are unchanged (AC-12).

## Fixes of review round 1

Review round 1 (`review.md`) was PASS with nine notes; F1–F7 (`ticket.md` → `## Decisions` 11):
- F1 (finding 2): every rule of `src/runtime/bridge-view.ts` names its E-n and its `bridge@5.0.3/<file>#L…` line: the
  E-13 rebuild in `serve` (`src/index.ts#L645-L661`, `src/session-persistence.ts#L670`), `fresh` (`src/index.ts#L1123-L1125`,
  `src/session-persistence.ts#L646-L653`), `toolRecord` (`src/index.ts#L800-L808`, `#L316-L343`, `src/convert.ts#L176-L191`),
  the summary record (`src/convert.ts#L143-L148` with Pi's `messages.js#L103-L110`), `PRESET`
  (`src/query-options.ts#L167-L170`), `HISTORY_REPLACED` (`src/index.ts#L590`), and the helpers `toolResultsOf`,
  `isUserTurn`, `history`, `toolCalls`, `sameMessage`, `summaryText` and the summary text's constants.
- F2 (finding 4): the bridge's "query running" state lives in the declaration. `answered(cursor, answer)` sets the
  cursor's `waits` when the answer holds tool calls (E-5, `src/index.ts#L442-L452`; a text answer ends the query,
  `#L1612-L1613`), and `historyReplaced(cursor)` takes a restart or a rebuild from it (E-13). The fake gives each answer to
  `answered`, and its `queryWaits` is gone; what the fake still decides is Pi's own: a compaction between turns of the
  task's run runs in place, any other waits until no run is active. Test: `test/runtime/bridge-view.test.ts` "E-13: a
  compaction restarts the query only when the call's answer left it waiting on tool results".
- F3 (finding 5): on `--continue` the fake opens the file Pi 1.5.1 continues, the most recently changed `*.jsonl` of the
  session folder whose header names the cwd (`core/session-manager.js:446-466`, `:1366-1373`), so after `new` the newer
  session. Test: `test/fake-engine.test.ts` "--continue opens the session file Pi continues: …".
- F4 (finding 6): `reload` while a run is active is refused with Pi's message, as Pi refuses `/reload` while it streams
  (`core/agent-session.js:3095-3097`); `new` while a run is active aborts it first, as Pi's `teardownCurrent` does
  (`core/agent-session-runtime.js:102-113`, `abort` `core/agent-session.js:2073-2084`): the call that waits for its
  answer ends with `stopReason` `aborted` and `errorMessage` "Operation aborted", the run's loops end
  (`core/agent-session.js:1514`), and `agent_settled` carries `aborted: true`, all in the session it ends. Tests: "a
  reload while a run is active is refused, …" and "new while a run is active aborts that run first, …".
- F5 (finding 7): a custom message's string content enters the view as Pi's one text block (`messages.js:89-96`,
  `handedContent`), so an empty one follows the array rule (`[image]`); `src/job/usage.ts`'s `firstCallOf` gives a
  custom message's content in the same form, so the contract feeds the view as Pi feeds the bridge. With no Pi tool the
  view's `tools` is `CLAUDE_CODE_TOOLS`, the substituted built-ins the bridge stops denying (E-5,
  `src/connectors.ts#L18-L46`, `#L675-L677`, `src/query-options.ts#L93-L98`). Tests: "an empty custom message reaches a
  rewritten session as Pi's empty text block, …" and "E-5: with no Pi tool the model gets Claude Code's own tools back";
  the `firstCallOf` test of `test/job/usage.test.ts` now expects the text block.
- F6 (finding 8): `agentsPath(cwd, agentDir, exists)` cites the walk it follows: from the cwd up to the filesystem root,
  where the bridge's walk stops (`src/agents-md.ts#L74-L92`), then the fallback the bridge applies by default to Pi's
  agent directory (`#L74-L80`, `src/connectors.ts#L86-L95`); the fake passes Pi's agent directory (`PI_CODING_AGENT_DIR`,
  else `~/.pi/agent`, `config.js:510-516`). Test: "with no AGENTS* file from the cwd up to the root the bridge takes the
  one in Pi's agent directory".
- F7 (finding 9): `test/cli/spawn.test.ts` opens with one line.
- Findings 1 and 3: no change (`## Fails before`; `## Open points` 3).

After the first gate run (exit 1, `## Gate runs`) and before the second, two edits besides item 8:
- `test/fake-engine.mjs`, `execute`: a run whose preparation throws leaves the session idle, settles nothing and says
  so on stderr, as Pi's `_startRun` leaves the session idle when a run cannot start; before, the rejection would have
  broken the chain of runs and kept the session busy.
- `test/fake-engine.test.ts`, the test extension's `note`: it writes `null` for an undefined value, so that at HEAD the
  first new test fails on its assertion (`[null]` for the run kinds) instead of on the parse of an `undefined` line.

## Fixes of review round 2

Review round 2 (`review.md` → Round 2) was PASS with three notes; G1–G3 (`ticket.md` → `## Decisions` 12):
- G1 (finding 1): the `compact` word compacts where Pi 1.5.1 does for its reason. `manual` is Pi's `compact`: it
  aborts an active run first, whose waiting call ends `aborted`, writes no view and does not go on, then compacts
  (`core/agent-session.js:2321-2327`, `:2073-2084`). `threshold` during the task's run compacts before its next
  assistant response, in that call's preparation (`:477-486`, `:594-595`, pi-agent-core's `agent-loop.js:97-118`).
  Otherwise `threshold` and `overflow` compact when the next run ends, between its `agent_end` and `agent_settled`
  (`:1623`), after which the run goes on with a queued message (`:2706-2710`); `retry` gives an `overflow` Pi's
  `willRetry: true`. The fake's comment cites these lines; the wrong "waits for idle" is gone. Tests: "compact manual
  aborts an active run first, …" and "compact threshold outside the task's run compacts when the next run ends, …"; the
  earlier compact test now runs its second call from a wake at the first settle, so its order no longer depends on a
  run started at `session_start`.
- G2 (finding 2): each call of a run takes its answer first (`agentLoop`), so the task's run waits for the script
  before the next call's preparation: the compaction (`compactBeforeTurn`), the steering queued meanwhile, `turn_start`,
  then the call's `context` event and view. No view pairs the messages from before a compaction with a `restart`
  cursor. The fake's compaction keeps the entries from the last assistant message on (`test/fake-session.mjs`), so the
  task's message is in the summary and the restart re-sends it once. Test: "compact threshold during the task's run
  compacts in its next call's preparation, before that call's view" (`tool ls`, `compact threshold`, `tool pwd`, `say
  done`; the second view: the summary, the tool use and its result, the task once, the notice).
- G3 (finding 3): `test/fake-engine.test.ts` runs the fake with `HOME` its own folder and `PI_CODING_AGENT_DIR` its
  `agent` folder. Test: "the AGENTS* file of Pi's agent directory that the test sets enters the view, and none of the
  account's".

## Proof

- `node --test test/runtime/bridge-view.test.ts` → exit 0, 18/18 (AC-1).
- `node --test test/fake-engine.test.ts` → exit 0, 22/22 (AC-2), after G1–G3.
- `node --test test/seat/bridge-contract.test.ts` → exit 0, 5/5 (AC-3).
- `node --test test/cli/spawn.test.ts` → 23/23; `test/cli/continue.test.ts` → 14/14; `test/s4-steering.test.ts` → 4/4;
  `test/job/usage.test.ts` → 11/11, `test/s1-spawn.test.ts` → 9/9, each with the gate's TMPDIR (AC-4), after F1–F7.
- `node adrian-rebuild/tools/fails-before.mjs test/fake-engine.test.ts test/runtime/bridge-view.test.ts
  test/seat/bridge-contract.test.ts test/cli/spawn.test.ts` → exit 0 (AC-5; `## Fails before`).
- `git grep -q 'JSON.stringify({ task })' -- test/fake-engine.mjs` → exit 1 (AC-6).
- AC-7 and AC-8's second half name files that are new and untracked until the main session's commit, and `git grep`
  reads tracked files only: `git grep -q --untracked 'bridge@5.0.3' -- src/runtime/bridge-view.ts` → exit 0,
  `git grep -q --untracked 'runtime/bridge-view.ts' -- seat/bridge-contract.ts` → exit 0;
  `git grep -q 'runtime/bridge-view.ts' -- test/fake-engine.mjs` → exit 0.
- `git grep -q 'agent_end' -- test/fake-engine.mjs` → exit 0; `git grep -q 'session_compact' -- test/fake-engine.mjs`
  → exit 0 (AC-9).
- `node adrian-rebuild/tools/gate.mjs` → exit 0: 1282 tests, 1282 pass, 0 fail, 0 cancelled, 0 skipped, test run
  311.0 s (AC-10; the run after G1–G3, `## Gate runs` 6).
- `npx biome check --error-on-warnings .` → exit 0 (286 files); `node adrian-rebuild/tools/check.mjs` → exit 0, 0 errors
  (AC-11), each after that gate run.

## Gate runs

1. Before D-127: exit 1, 1271 tests, 1264 pass, 7 fail, all in `test/s1-spawn.test.ts`, one cause. The test at `:62`
   planted `session/turns.jsonl` beside the fake's transcript and asserted `model served p/other · requested m` and
   `tokens 2 turns · …` (`:112-113`); the fake's Pi-shaped transcript added its own turn (route `p/m`, zero usage), so
   `limen show` printed `served p/m + p/other` and `3 turns`. The other six failed because that test's `abandon` never
   ran, so each later spawn of the plant refused `UNLANDED_WORK`. The ticket's Risk asked for `BLOCKED`; Adrian chose
   option 1 (D-127).
2. After item 8 and the two edits above: exit 0, 1271/1271.
3. The main session's own run (protocol step 4, after `compare --git` exit 0): `node adrian-rebuild/tools/gate.mjs` →
   exit 0, 1271/1271, 326.1 s; `node adrian-rebuild/tools/fails-before.mjs test/fake-engine.test.ts
   test/runtime/bridge-view.test.ts test/seat/bridge-contract.test.ts test/cli/spawn.test.ts` → exit 0.
4. After F1–F7: exit 0, 1278 tests, 1278 pass, 313.0 s (seven tests more: four in `test/runtime/bridge-view.test.ts`,
   three in `test/fake-engine.test.ts`).
5. The main session's own run after F1–F7 (after `compare --git` exit 0): `node adrian-rebuild/tools/gate.mjs` → exit
   0, 1278/1278, 312.2 s; `node adrian-rebuild/tools/fails-before.mjs test/fake-engine.test.ts
   test/runtime/bridge-view.test.ts test/seat/bridge-contract.test.ts test/cli/spawn.test.ts` → exit 0.

6. After G1–G3: exit 0, 1282 tests, 1282 pass, 311.0 s (four tests more, in `test/fake-engine.test.ts`). Before it, a
   run of `test/s3-finish-wake.test.ts` alone (`node --test`, the gate's TMPDIR) hung in "a held gate starts its queued
   jobs …" until its 500 s bound: `## Open points` 4.
7. The main session's own run after G1–G3 (after `compare --git` exit 0): `node adrian-rebuild/tools/gate.mjs` → exit
   0, 1282/1282, 328.8 s; `node adrian-rebuild/tools/fails-before.mjs test/fake-engine.test.ts
   test/runtime/bridge-view.test.ts test/seat/bridge-contract.test.ts test/cli/spawn.test.ts` → exit 0.

## Fails before

`node adrian-rebuild/tools/fails-before.mjs test/fake-engine.test.ts test/runtime/bridge-view.test.ts
test/seat/bridge-contract.test.ts test/cli/spawn.test.ts` → exit 0, "fail at HEAD (exit 1)". The same four files on a
copy of HEAD, test by test (18 tests, 2 pass, 16 fail):
- `test/fake-engine.test.ts`: its two earlier tests pass; each of the 13 new ones fails on its own assertion against
  HEAD's fake (no `fake-view.jsonl`, no `agent_end`, no `session_compact`, `session_start` without `reason`, the
  `context` event with the turn's messages only, the run started during `agent_settled` not awaited, the `{"task": …}`
  line unread: `fake.jsonl:1: type: expected a string, got nothing`). The per-test run was made before the `note` edit
  above; then the first new test failed on the parse of an `undefined` line, after it on its assertion.
- `test/s1-spawn.test.ts` is not among the new tests: item 8 changes only its setup, and at HEAD the test passes as
  before.
- `test/runtime/bridge-view.test.ts` and `test/seat/bridge-contract.test.ts` fail at load: their modules are new.
- `test/cli/spawn.test.ts` fails at load: HEAD's `test/plant.ts` has no `engineViews`, which item 6 adds and AC-5 does
  not copy, so its new test does not reach HEAD's fake.

The tests of F2–F6 against the round-1 tree (HEAD with the reviewed `node_modules/.rebuild-review/R-038.diff` applied,
the three test files of the working tree laid over it): 30 tests, 25 pass, 5 fail.
- `test/fake-engine.test.ts`: the three new tests fail on their assertions (F3: the continuation opened `fake.jsonl`,
  the older session, so its first call had no history; F4: the reload ran while busy, giving
  `[startup, shutdown reload, start reload, shutdown quit]`; `new` started its session before the run settled, not
  aborted).
- `test/job/usage.test.ts`: the `firstCallOf` test fails on its assertion (the custom message's content a string).
- `test/runtime/bridge-view.test.ts` fails at load: `does not provide an export named 'CLAUDE_CODE_TOOLS'`; F2 and F6
  change the API (`answered`, `historyReplaced(cursor)`, `agentsPath(cwd, agentDir, exists)`). Run on the round-1
  module, the rules give: an empty custom message rebuilt as `{"role":"user","text":["[empty]"]}` (F5 wants
  `[image]`), zero Pi tools as `[]` (F5 wants `CLAUDE_CODE_TOOLS`), and `agentsPath` of two parameters, with no
  agent directory (F6).
- F1 and F7 change comments only; no test.

The tests of G1–G3 against the round-2 tree (HEAD with the reviewed `node_modules/.rebuild-review/R-038.diff` of round 2
applied, `test/fake-engine.test.ts` of the working tree over it): 22 tests, 18 pass, 4 fail, each on its assertion:
"compact manual aborts …" (the compaction ran in place and the run went on), "compact threshold during the task's run
…" (the second view was built before the compaction: the continued call without the summary), "compact threshold
outside the task's run …" (the compaction came before `agent_end`), and the rewritten compact test (the compaction ran
before the first call). The G3 test passes there, as F6's fake already reads `PI_CODING_AGENT_DIR`; with the helper's
environment of round 2 (`PATH` alone) laid back over the working tree it fails on its assertion (no `AGENTS*` text in
the append).

## Deviations from the ticket

- Item 1, `path`: a call that brings tool results is no query start (E-5); it keeps the path of the query it
  continues. A user message Pi puts after those results follows them in the view; the bridge holds such a message until
  the Claude Code turn ends (`src/index.ts#L874-L879`), which the declaration states and does not model.
- Item 1, the append: `bridge-5.0.3.md` §10 also names a `.pi` → `.claude` rewrite of the `AGENTS*` text, without its
  order against `\bpi\b`; the declaration holds the ticket's rule only. The skills hint's rewrite is declared as the
  read tool's name in the hint sentence, as the evidence names no exact text.
- Item 4: the function gives the first model call (the messages before the first assistant message), which is what
  the contract compares, and takes the file's text, so that the contract reads the file through `requiredText`.
- Item 5: the contract compares with the view's first user record, which for a new session's first call (the scope of
  D-119) is the prompt; for a first call with history it is the rebuilt session's first record.
- Item 1, tools: with no Pi tool the view lists the ten substituted built-ins the evidence names
  (`CLAUDE_CODE_TOOLS`); Claude Code may hold other tools of its own that the evidence does not list (F5).
- Item 1, `agentsPath`: it also takes Pi's agent directory, where the bridge looks after the walk (F6); the ticket's
  item 1 named only the cwd's file.
- Item 4: a custom message's string content comes as one text block, as Pi hands it to the bridge (F5).
- Item 2: an abort is modelled for `new` during an active run (F4): `stopReason` `aborted`, `agent_settled` with
  `aborted: true`.
- Item 2: Pi's queues hand out one message at a time (`settings-defaults.js:6-7`), where the old fake took every
  queued message into one turn; no existing test depends on it. Not modelled: `agent_before_settle`, a `context`
  handler's returned messages, Pi's tool-loadout `system` entries, images, the compaction's own summary request; the
  fake's compaction keeps the entries from the last assistant message on and writes its own summary text (G2).
- Item 2, `compact` (G1): the fake's answers never fail, so the turn Pi retries after an overflow error
  (`core/agent-session.js:2558-2568`) is not modelled; `retry` sets `willRetry: true` only. A call that an abort ends
  before its request writes no view, since no model answers it.

## Unmeasured

- Whether the declaration's user part matches bridge 5.0.3 on the seat: `## Deployment` 4.1 (the contract, D-119); its
  system part: 4.2 and M-02 (the per-query CLI log). No M-NN measures the contract itself.

## Open points

1. A fake job's transcript now carries Pi turns with a zero usage on the argv's route, so `limen show` and
   `limen stats` over a fake job count them; a test that plants its own turns beside a fake job's transcript removes
   the fake's first, as item 8 does (D-127).
2. R-039 adds `buildContextEntries()` to the fake's `sessionManager` (its item 5); `test/fake-session.mjs` holds the
   entries it needs.
3. For gate 5.4 (review round 1, finding 3): `PiCallMessage` and `PiCallPart` (`src/runtime/bridge-view.ts`) declare Pi's
   message shape beside the adapter's `PiMessage` and `PiMessagePart` (`src/runtime/pi-api.ts:25-32`). Whether the bridge
   view's input is the adapter's type or Pi's transcript form is not settled by the ticket; T-32's scan passes, since
   neither is a type named `PiApi` or one with an `on(event` member.
4. Observed once (z. 17): `test/s3-finish-wake.test.ts` run alone (before the gate run 6, which passed it) hung in
   "a held gate starts its queued jobs by priority, …" at `await delivered([urgent, early, later])`: the coordinator
   noted "q urgent wake was unconfirmed twice; automatic delivery stopped". Its records (observed): the follow-up wake
   "q early … started" was sent, then sent again as `user`; in the transcript the resend entered first and the first
   send last, after five later wakes; "q urgent … done" likewise. A cause that fits this order (guessed, not proven):
   both first sends were made while `agent_settled` was emitted, so Pi defers them and runs each, in order, as its own
   run inside that settle (`core/agent-session.js:738-760`, `:1695-1698`); the first deferred run's own `agent_settled`
   makes `hook/wake.ts` (`:1023-1034`) mark every pending wake settled, the one still waiting in the deferred list
   included, so `confirmDeliveries` (`:730-744`) counts it unconfirmed and resends it. The fake defers as Pi does since
   round 1; the same file run alone on the round-2 tree passed once, and so did a run of six of its tests on this tree
   with temporary logging in the fake (removed since). No file of this round changes `hook/wake.ts`, and the test is
   unchanged since HEAD. Settled by D-128: a read-only diagnosis of Pi 1.5.1 confirmed that Pi defers as the fake does,
   so the defect is the wake hook's, present at `rebuild-base` (`evidence/wake-settle-deferral.md`); it is finding A-089
   (high, fix) with the new stage-4 ticket R-111 and seat step 4.14. Until R-111 the gate's test can hang again; it is
   not run again to get a green gate (D-029).
5. Review round 3, note 1 (the rounds of fixes are spent, D-092): a Pi first call whose user message holds an image
   block makes `bridgeView` throw `BRIDGE_UNMAPPED` (class environment), so `seat/bridge-contract.ts` exits 5, not 4;
   no pass, but the wrong class (`src/runtime/bridge-view.ts:386`, `seat/bridge-contract.ts:38`, `:82`).
6. Review round 3, note 2: the contract's exit-4 lines carry the boundary's message but not the code name `BAD_DATA`
   that item 5 and D-119 use, and its Pi-file exit 4 and a record whose content is neither a string nor an array have
   no test (`seat/bridge-contract.ts:73-80`, `:93-99`; `test/seat/bridge-contract.test.ts:69-72`). Step 4.1 runs the
   contract first on the seat; a mismatch there is a finding (D-119).
7. Review round 3, note 3: `agentsPath` walks from a test's folder up to `/` before Pi's agent directory, so an
   `AGENTS*` file in `~/.cache` or `~` would enter every view of `test/fake-engine.test.ts` (none exists on this laptop
   today); `HOME` and `PI_CODING_AGENT_DIR` do not stop the walk (`src/runtime/bridge-view.ts:173-180`).
8. Review round 3, note 4: `test/fake-engine.test.ts`'s `lines` and `views` repeat `test/plant.ts`'s `engineLines` and
   `engineViews` (T-25 (2); `test/fake-engine.test.ts:54-59`, `test/plant.ts:698-713`).
