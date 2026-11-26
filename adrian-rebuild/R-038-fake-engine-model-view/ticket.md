<!-- PL: Ticket R-038 (T-31 (1) i (2), A-051, A-086, D-115, D-119): atrapa silnika `test/fake-engine.mjs` zapisuje
widok modelu pod mostem 5.0.3 (`fake-view.jsonl`, jedna linia na wywołanie modelu) według jednej deklaracji
mapowania mostu w `src/runtime/bridge-view.ts`, odtwarza fakty silnika E-1–E-14 (biegi, kompakcja, `agent_end`,
`triggerTurn` i `nextTurn`, wyniki narzędzi, przyczyny `session_start`), pisze transkrypt w kształcie Pi zamiast linii
`{"task": …}` i ma test wiadomości wysłanej w trakcie `agent_settled`; skrypt seata `seat/bridge-contract.ts`
porównuje pierwszy prompt z pliku sesji Claude Code z widokiem z tej samej deklaracji. Stan: napisany 26.11 przy
`3c2ac1d` z inwentarza `evidence/inventories/R-038.md`; `ready` na noc. -->

# R-038 The fake engine shows the model's view under the bridge

## Problem

A-086's Decision, quoted: "Under bridge 5.0.3 nothing Limen adds to Pi's system prompt reaches the model (§1)." Its
evidence: "The fake engine records the system prompt the hook returns (`test/fake-engine.mjs:120-121`), so every test
sees text that the bridge drops" (`test/fake-engine.mjs:217-218` at HEAD). A-051's Decision, quoted: "A golden test per
role and mode (detached, continuation): the exact Limen context message (A-086) and the first task message against a
reference file. A second test: with unchanged files the context message is byte-identical across two prompts, it is
re-sent after a compaction, and the board digest appears at the end of the context only after a change. A third check,
on the seat: the bridge's per-query CLI log (`CLAUDE_BRIDGE_DEBUG=1`) shows the role text in the request". The golden
tests of the context message are R-039's; this ticket gives them the view they read and the seat contract.

T-31, quoted: "(1) The fake engine's bridge mode reproduces the engine facts (E-1–E-14, with references to the source
lines of bridge 5.0.3): it ignores appends to Pi's system prompt, turns custom messages into the `user` role, and gives
another role only to tool results; it records the model's view, and golden tests check that view (the context message
whole and first, a wake as a header, a short turn cue); a negative test: text that Limen needs and puts only in the
system prompt fails the test. (2) A contract on the seat: a script compares the bridge log (`CLAUDE_BRIDGE_DEBUG=1`) of
one coordinator turn and one job turn with the fake's model view for the same scenario; a step in `plan.md` →
`## Deployment` at every tag and after a change of the Pi or bridge version". Its Check: "golden tests of the model view
in bridge mode; the negative test for text only in the system prompt; … the contract script with a test on a recorded
bridge log (a synthetic fixture)." The context message, the wake header and the cue that those goldens name come with
R-039, R-051 and R-041; here the view, the negative test and the view of today's job start.

Plan decisions, quoted:
- D-115 (1): "R-038's fake reproduces in its bridge mode the engine facts E-1–E-14 that T-31 (1) names, among them the
  compaction, `agent_end`, `triggerTurn` and `nextTurn`, tool results, `before_agent_start` per run and the reasons of
  `session_start`, with one declaration of the bridge mapping (T-25); its size is L (was M)." (2): "until it is
  extracted R-038 relies on `evidence/engine-sources/bridge-5.0.3.md`, and seat step 4.1 shows the bridge log's
  format." (3): "T-31 (4), the scan for real waiting in tests, is R-083's".
- D-119 (2026-11-26): the seat contract of T-31 (2) reads the `user` records of the Claude Code session file (JSONL)
  that the bridge writes and resumes, in the shape the bridge's `cc-session-io` writes and the Agent SDK sends
  (`type: "user"`, `message.content` a string or text blocks), for the first query of one coordinator turn and one job
  turn, against the fake's model view; a line it cannot read ends it with `BAD_DATA` (exit 4), never a pass. Step 4.1
  first shows that file's format; a mismatch is a finding to fix before a0.4.0's further steps. The system part is
  checked in the repository by the bridge view and its negative test, and on the seat by 4.1 and 4.2.
- D-069: "The fake engine emits one `agent_settled` per run, as Pi does".
- D-055: the Pi type contract runs only in the repository, on the vendor copy of the Pi packages.
- D-036: a script that runs only on the seat is checked through its tests.
- The note of `## Tickets` (D-080; R-024 Open point 3, R-096 Open point 1): "the fake engine writes `{"task": …}` into
  its transcript, which is no Pi entry, so `limen stats` over a fake job names it under `Not read`; and a message a hook
  sends while `agent_settled` is emitted, which starts a new run as Pi's `prompt` defers it, has no test of its own."

Rules: T-25 (1) (one module per policy from its first use), T-28 (5) (Pi and bridge behaviour: a fake-engine test and a
seat step, here 4.1), T-29 (1), (3), (5) (test files named after their subject, one mechanism per test, an opening
line), T-30 (comments follow the code), T-32 (1) (the Pi API Limen uses is declared only in `src/runtime/pi-api.ts`).

Engine facts the change relies on (`plan.md` → `## Engine facts`, with the bridge lines of
`evidence/engine-sources/bridge-5.0.3.md`; the bridge sources are not in `adrian-rebuild/input/vendor/`, D-115 (2)):
- E-1: "The system prompt is Claude Code's `claude_code` preset plus an append of exactly three parts: the nearest
  `AGENTS.override.md`/`AGENTS.md`/`AGENTS.MD` walking up from the cwd, Pi's skills block, and four opt-in blocks that
  are off by default. **Pi's system prompt is not forwarded** … Pi user messages … and Pi custom messages … all arrive
  as `user`; Pi's `role: "system"` patch entries are dropped." Bridge: `src/query-options.ts#L109-L113`, `#L167-L170`;
  the AGENTS file `src/agents-md.ts#L41`, `#L74-L101` (re-headed `# CLAUDE.md`), `#L110-L117` (`\bpi\b` →
  `environment`); the skills block `src/skills.ts#L8-L24` (between "The following skills provide specialized
  instructions…" and `</available_skills>`, its read hint rewritten to `mcp__custom-tools__read`).
- E-5: Pi's tools reach Claude as `mcp__custom-tools__<name>` (`src/index.ts#L316-L343`); within one Pi prompt a tool
  result resolves the blocked MCP handler, so the same Claude Code turn goes on (`src/index.ts#L800-L808`).
- E-11: "`before_agent_start` runs once per run (each prompt sent while idle), not per LLM turn; a returned
  `systemPrompt` applies to that run only. `sendMessage` custom messages reach the model as `user` … `appendEntry`
  stays out of the context."
- E-13: "With no bridge query running (before a prompt, after a run, overflow, manual `/compact`), the next query
  rewrites the Claude Code session in place; between turns of a run, the bridge kills the query and restarts it under
  a new session id, re-sending the pending request and a "history replaced" notice. The rewritten session holds Pi's
  summary as one user record plus the kept entries; system entries are dropped." Bridge: `src/index.ts#L612-L625`,
  `#L645-L661`; the notice `HISTORY_REPLACED_PROMPT` (`src/index.ts#L590`), whose text the repository does not hold.
- E-14: "When the session is reused, consecutive user messages are joined in order with a blank line into one prompt
  (text blocks of one message joined with a newline); on a rewrite each message is its own record, stored unchanged."
  Bridge: the prompt is the trailing user run (`src/index.ts#L1123-L1125`), joined with `"\n\n"` (`#L202-L207`), an
  empty one becomes `"[continue]"` (`#L1138-L1156`); flattening `src/convert.ts#L47-L59`; one record per message on a
  rewrite `#L143-L148`; tool results right after their `tool_use` `#L176-L191`. REUSE needs the tail after the cursor
  to be all `user` (`src/session-persistence.ts#L447-L457`); a first turn with history, a compaction, an abort or any
  non-user entry after the cursor, a Pi `system` entry included, takes REBUILD (`#L519-L552`, `#L646-L653`).
- E-15: with `CLAUDE_BRIDGE_ISOLATED=1` "the bridge forwards no `AGENTS*` file at all (`bridge@5.0.3/src/agents-md.ts#L75`)".
- E-16: `sendMessage` with `deliverAs: "followUp", triggerTurn: true` starts a run when idle, "held until
  `agent_settled` has been emitted when it arrives during that event"; when a run is active it enters "after the
  current turn's tool calls and steers".
- The Claude Code session records (D-119): `cc-session-io` writes only `type: "user"` and `type: "assistant"` records
  (`bundle/index.js#L39727-L39763`), a string content as it is and `tool_result` blocks in their own record
  (`#L39811-L39838`), one `JSON.stringify` per line (`#L39489-L39491`); the SDK writes a string prompt as
  `{ type: "user", … message: { role: "user", content: [{ type: "text", text }] } }` (`#L73344`).

Pi 1.5.1, in the vendor copy `adrian-rebuild/input/vendor/pi-coding-agent/package/dist/core/` (re-read by the main
session at `3c2ac1d`):
- A run's messages, in order: the trigger (the user prompt, or the custom message that started the run), the pending
  `nextTurn` messages, then each `before_agent_start` handler's message as role `custom`; a system patch first when the
  prompt sections changed (`agent-session.js:1560-1594`).
- `sendCustomMessage` (`agent-session.js:1946-1984`): `nextTurn` → the next run's pending list; a run active and
  `triggerTurn !== false` → `followUp` or steer; idle with `triggerTurn` → a new run, deferred while `agent_settled`
  is emitted; a run active and `triggerTurn: false` → held to the turn's end; idle and no trigger → appended at once,
  no run. `prompt` defers itself while `agent_settled` is emitted (`:1695-1698`); `_emitAgentSettled` runs every
  deferred action before it returns (`:738-760`), and `_startRun` awaits it in its `finally` (`:1528-1535`).
- Custom → `{ role: "user", content }` (`messages.js:89-96`); a compaction summary → a user message with the prefix "The
  conversation history before this point was compacted into the following summary:\n\n<summary>\n"
  (`messages.js:7-12`, `:103-110`).
- `session_start`: `{ reason: "startup" | "reload" | "new" | "resume" | "fork", previousSessionFile? }`
  (`extensions/types.d.ts:595-601`); `startup` at a process start (`agent-session.js:226`), `reload` after `/reload`
  (`:3130`), `new` with `previousSessionFile` after `/new` (`agent-session-runtime.js:150-166`).
- `session_compact`: `{ compactionEntry, fromExtension, reason: "manual" | "threshold" | "overflow", willRetry }`
  (`extensions/types.d.ts:633-641`); `agent_end`: `{ messages }`, emitted at the loop's end before the post-run
  compaction check (`extensions/types.d.ts:768-771`); `agent_settled`: `{ aborted }` (`:820-825`).
- The `context` event holds every message of the next call except `system` ones (`extensions/runner.js:1014-1022`).

Facts at `3c2ac1d` (the read-only inventory `evidence/inventories/R-038.md`, sections 5–9; no code of `src/`, `hook/`,
`seat/` or `test/` changed since its `c3bbc5c`):
1. `test/fake-engine.mjs` (300 lines) records Pi's side in four files: `fake-task.txt` (`:41`), `fake-system.txt`, each
   `before_agent_start` result's `systemPrompt` (`:218`), `fake-context.txt`, each result's message (`:219`), and
   `fake-events.jsonl` (`:46`, `:129`); none holds the text the model receives in order, and none applies the bridge's
   mapping. Its transcript is one `{"task": …}` line per process (`:44`).
2. `before_agent_start` fires once per process (`:217`); its message never enters a turn. A steer is recorded and
   dropped (`:130-132`); `sendMessage` passes only `deliverAs` (`:143`), so every message starts or joins a run. The
   `tool` word fires only `tool_execution_start` and `tool_execution_end` (`:240-243`), no `tool_call` or
   `tool_result`, so the hooks' handlers of those (`hook/communication.ts:110-134`, `hook/group-peer.ts:99-120`) never
   run on the fake. The `context` event holds only the turn's messages (`:177`). No `session_compact`, no `agent_end`;
   `session_start` has no `reason` (`:216`).
3. In `run` (`:156-169`) `idle` is true before `agent_settled` fires; a hook that sends then chains a new run on `turns`
   (`:134-135`); the script awaits the `turns` value it read (`:294-297`), so, read from the code and not run, a run
   chained during the task run's last `agent_settled` is not awaited before `session_shutdown` (`:298-300`).
4. `src/job/usage.ts` is "The one reader of Pi's session files" (`:1`); `entryOf` needs a string `type` (`:202-203`),
   so `{"task": …}` is unread (`:112-123`). Its `SessionEntry` (`:40-46`) keeps no message content.
5. Tests that read the records: `fake-system.txt` and `fake-context.txt` in `test/s4-steering.test.ts:87`, `:115`,
   `:116`, `:139`; `session/fake.jsonl` in `test/s4-steering.test.ts:127`, `:140` (the child's transcript starts with
   the parent's and is longer) and `test/cli/continue.test.ts:66-80` (the parent holds one transcript);
   `fake-events.jsonl` through `engineEvents` (`test/plant.ts:690-699`) in 8 test files.
6. Seat scripts end through `seat/tool-outcome.ts` (`SeatFailure` with its exit class, `SeatOutcome`); seat code
   imports `src/` (`seat/sweep-units.ts:17-18`).

## Change

1. `src/runtime/bridge-view.ts`, new: the one declaration of bridge 5.0.3's mapping (T-25 (1), D-115 (1)), a pure
   function from Pi's side of one model call (Pi's system prompt, the call's messages in Pi's form, the cwd's `AGENTS*`
   text or none, whether `CLAUDE_BRIDGE_ISOLATED=1`, the previous call's cursor) to the model's view of that call:
   `system` (the preset `claude_code` and the append parts: the `AGENTS*` text re-headed `# CLAUDE.md` with `\bpi\b`
   as `environment`, absent when isolated, and Pi's skills block cut out of Pi's prompt; never Pi's prompt itself),
   `path` (`fresh`, `reuse` or `rebuild`, by the triggers of E-14), `messages` (the whole conversation the model sees in
   that call, each with `role` `user`, `assistant` or `tool`, the last ones the call's prompt: on `reuse` the trailing
   user run joined as E-14 says, on `rebuild` one record per message with tool results right after their tool use, a
   compaction summary as one user record with Pi's prefix, a mid-run restart's notice as a marked record without text)
   and `tools` (`mcp__custom-tools__<name>`). Each rule carries its E-n and its `bridge@5.0.3/…#L…` reference from the
   evidence file. Custom messages are `user`; Pi `system` entries are dropped; only a tool result has another role.
2. `test/fake-engine.mjs`: its one mode is the bridge (the seat's only route): for every model call it builds Pi's
   context as Pi 1.5.1 does and appends that call's view, from `src/runtime/bridge-view.ts`, as one line of
   `fake-view.jsonl` in the record dir. It reproduces, each as the Pi lines above say: `before_agent_start` once per
   run with that run's message in the run after the trigger; a steer in the next call of the active run; `nextTurn`;
   `triggerTurn: false` (held to the turn's end when busy, appended with no run when idle); `tool_call` (a returned
   block stops the call) and `tool_result` (a returned content replaces the result's) around each `tool` word, the
   result in the next call; `agent_end` before `agent_settled`; a new script word `compact <manual|threshold|overflow>
   [retry]` that writes the compaction entry, rebuilds the context and awaits `session_compact` with Pi's payload
   before the next call; `session_start` with `reason: "startup"` at start, and new words `reload` and `new` with the
   reasons `reload` and `new` (with `previousSessionFile`); the `context` event with every message of the call except
   `system` ones. The fake awaits every run chained before `session_shutdown`, a run started during `agent_settled`
   included (inventory Q6 (b)). Its existing words keep their stdout lines and their order of events; `fake-task.txt`,
   `fake-system.txt` (Pi's side), `fake-context.txt` and `fake-events.jsonl` stay. A helper module beside it under
   `test/` is allowed, named in `outcome.md`.
3. `test/fake-engine.mjs`, transcript: instead of the `{"task": …}` line, Pi-shaped entries appended to
   `<--session-dir>/fake.jsonl`: one `session` header when the file is new, then `message` entries (the user prompt,
   the assistant reply with the route of its argv and a zero usage, tool results), `custom_message` entries and
   `compaction` entries, each with an ISO `timestamp`, in the shapes of Pi's `session-manager.d.ts`; a continuation
   appends to the copied file.
4. `src/job/usage.ts`: the one reader of Pi's session files gives what the contract needs of a session's first run
   (each message's role and content, a custom message's as `user`), with no second parser of Pi's files (T-25 (1)).
5. `seat/bridge-contract.ts`, new (D-119): `node seat/bridge-contract.ts <pi session file> <claude code session file>`.
   It reads the Pi session through `src/job/usage.ts`, computes the view of its first call with
   `src/runtime/bridge-view.ts`, reads the Claude Code session file (records of `type` `user` and `assistant`, a
   `message.content` that is a string or an array of blocks; every other `type` skipped and named by count; a line
   that is not a JSON object with a string `type`, or a user or assistant record whose content is neither, ends it
   with `BAD_DATA`, exit 4, naming the file and the line) and compares the text of its first user record with the
   view's prompt byte for byte: equal → exit 0 with one line naming the bytes compared and the skipped types; different
   → exit 1 naming the first differing offset with a short excerpt of each side. It ends through `seat/tool-outcome.ts`.
   No seat path is in the repository; both files are arguments.
6. Tests, each failing at HEAD (T-29):
   - `test/runtime/bridge-view.test.ts`, new: one test per rule of item 1: a marker only in Pi's system prompt is in no
     part of the view (the negative test of T-31 (1)); the `AGENTS*` text re-headed and rewritten, and absent when
     isolated (E-15); custom → `user`; a `system` entry dropped and the next call `rebuild`; the `reuse` join (`\n\n`
     between messages, `\n` between one message's text blocks, `[continue]` for an empty run); one record per message
     on `rebuild`, tool results right after their tool use; the summary record with Pi's prefix; tool names.
   - `test/fake-engine.test.ts`: the view of each fact of item 2 (one test per mechanism, on test extensions as its
     two tests do today); a hook that sends one message during `agent_settled` gets that message's run after the first
     settle and before `session_shutdown`, settled once more (R-096 Open point 1); the fake's transcript read by
     `readSessionFile` (`src/job/usage.ts:112`) has no unread line (R-024 Open point 3).
   - `test/cli/spawn.test.ts`: the first call of a spawned worker job, in its `fake-view.jsonl`, holds the task, then
     the cue, as one prompt (E-14), and none of the text the hooks returned as a system prompt, which `fake-system.txt`
     still holds: A-086 shown in a test until R-039 moves that text.
   - `test/seat/bridge-contract.test.ts`, new: on synthetic files that the test writes (no recorded session, T-31
     Why): a matching pair → exit 0; a Claude Code first record with text the view lacks, or lacking text the view
     holds → exit 1 naming the offset; a line that is not JSON → exit 4 naming the line; an unknown record type
     skipped and named.
   - `test/plant.ts`: a reader of a job's `fake-view.jsonl` beside `engineEvents` (`:690-699`).
7. Comments that the change makes false follow it (T-30): `test/fake-engine.mjs:2-22` and `:124-127`,
   `test/fake-engine.test.ts:1-2`, `test/plant.ts:690-693`.

## Out of scope

- Moving Limen's standing text out of Pi's system prompt, the context message and its goldens (A-051's first two
  tests): R-039 and R-110. `test/s4-steering.test.ts:68-91` and `:114-123` keep asserting markers in
  `fake-system.txt`, Pi's side, until R-039 rewrites them (T-29 (6)).
- The wake header and the short cue named by T-31 (1)'s goldens: R-051 and R-041.
- The text of the bridge's "history replaced" notice (`src/index.ts#L590`, not in the repository): the view marks the
  record without text.
- A direct, non-bridge mode of the fake: the seat has one route.
- The Pi API adapter: `src/runtime/pi-api.ts` declares a new event only when a hook of the change reads it (T-32 (1));
  R-039 declares `agent_end` with the hook that reads it.
- T-31 (3) is R-029's (done); T-31 (4), the scan for real waiting in tests, is R-083's (D-115 (3)); T-31 (5) is the
  seat's runs.
- What Claude Code itself adds around user text and whether it loads `CLAUDE.md` (E-7, E-14: engine-side); the
  contract shows the first, and 4.2 and item 12 look at the rest.
- The product text that is false under the bridge (`docs/setup.md:179`, `CONTRIBUTING.md:29`,
  `templates/communication.md:3`, `templates/agents.md:45`, `hook/communication.ts:51-54`): R-039.

## Acceptance

- AC-1: `node --test test/runtime/bridge-view.test.ts` → exit 0.
- AC-2: `node --test test/fake-engine.test.ts` → exit 0.
- AC-3: `node --test test/seat/bridge-contract.test.ts` → exit 0.
- AC-4: `node --test test/cli/spawn.test.ts` → exit 0; `node --test test/cli/continue.test.ts` → exit 0; `node --test
  test/s4-steering.test.ts` → exit 0; `node --test test/job/usage.test.ts` → exit 0.
- AC-5: `node adrian-rebuild/tools/fails-before.mjs test/fake-engine.test.ts test/runtime/bridge-view.test.ts
  test/seat/bridge-contract.test.ts test/cli/spawn.test.ts` → exit 0, its output in `outcome.md` → `## Fails before`
  (explicit paths, so HEAD's fake runs the new tests, as D-069 set for R-096).
- AC-6: `git grep -q 'JSON.stringify({ task })' -- test/fake-engine.mjs` → exit 1.
- AC-7: `git grep -q 'bridge@5.0.3' -- src/runtime/bridge-view.ts` → exit 0.
- AC-8: `git grep -q 'runtime/bridge-view.ts' -- test/fake-engine.mjs` → exit 0; `git grep -q
  'runtime/bridge-view.ts' -- seat/bridge-contract.ts` → exit 0 (one declaration, two users).
- AC-9: `git grep -q 'agent_end' -- test/fake-engine.mjs` → exit 0; `git grep -q 'session_compact' --
  test/fake-engine.mjs` → exit 0.
- AC-10: `node adrian-rebuild/tools/gate.mjs` → exit 0.
- AC-11: `npx biome check --error-on-warnings .` → exit 0; `node adrian-rebuild/tools/check.mjs` → exit 0.
- AC-12 (judgment): every rule of `src/runtime/bridge-view.ts` names its E-n and bridge line, and the fake applies no
  mapping of its own; each Pi behaviour of item 2 follows the Pi 1.5.1 line it cites; the contract never exits 0 on a
  file it could not read whole; no existing test changed its assertion, except where this ticket names the change.

## Migration

None: the change is test code, a declaration module, one reader function and a seat script; no `.limen/` format, CLI
form or hook that a project loads changes. `session/fake.jsonl` exists only in test plants.

## Risk

- An existing test may rely on a fake behaviour Pi does not have (a steer dropped, a message that starts a run with
  `triggerTurn` unset, `before_agent_start` once per process). The implementer then stops with `BLOCKED` naming the
  test and the behaviour, rather than keeping the behaviour or changing the test's assertion.
- The declaration comes from the evidence file, not re-read bridge sources (D-115 (2)); the contract checks its user
  part on the seat at 4.1, and its system part rests on the evidence until the sources are extracted.
- The contract compares the first call of a session only; Pi's assembly of later runs is the fake's reading of Pi
  1.5.1's source, the same version as the seat's (D-017).
- The Claude Code session file's format is declared from the evidence; 4.1 shows it first (D-119), and a mismatch
  fails the contract instead of passing it.

## Rollback

`git revert $(git log --format=%H --grep='^R-038:' adrian-rebuild --)`. Nothing on disk changes, so no reverse
migration.

## Decisions

Settled by the documents when the ticket was written (2026-11-26, the main session's reading, not a night default; the
inventory's questions in `evidence/inventories/R-038.md` → section 12):
1. The view is `fake-view.jsonl`, one line per model call (Q1 (a)): A-051's "byte-identical across two prompts" and
   "re-sent after a compaction" need one view per call; a transcript field would repeat R-024 Open point 3.
2. One declaration in `src/runtime/bridge-view.ts`, imported by the fake and the seat script (Q2 (a)): D-115 (1), T-25
   (1); seat code already imports `src/`, and nothing outside `test/` imports `test/`.
3. The contract reads the Claude Code session file (D-119), and "the fake's model view for the same scenario" is the
   declaration applied to the Pi session of the same run, read through `src/job/usage.ts`: both sides come from one
   run, so the comparison needs no rule for ids, times or paths, and the fake cannot drift from what is compared. It
   covers the first call of a new job and of a new coordinator session, the only deterministic call (Q9 (a)). For
   Adrian at gate 5.4.
4. The fake has one mode, the bridge (Q4, departing from the inventory's (b)): the seat's only route is the bridge
   (gate 2: one provider, Max through the bridge), so no stub bridge package in the plant and no second mapping.
5. Pi-shaped transcript entries replace `{"task": …}`, checked by the production reader (Q5 (a)).
6. The fake awaits a run chained during `agent_settled` (Q6 (b)), as Pi's `_startRun` awaits the deferred run.
7. E-1–E-14 in full, without the notice's text (Q7 (a)): D-115 (1).
8. The negative test and the view of today's job start (Q8 (a) and (b)); they pass at the gate and show A-086.
9. T-31 (4) is R-083's (Q10): D-115 (3).
