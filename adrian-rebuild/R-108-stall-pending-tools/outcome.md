<!-- PL: Wynik R-108 (28.11 w nocy, przy `8a3141c`), szkic implementera: parser strumienia niesie `toolCallId` startu
i końca narzędzia jako `id`, moduł reguły zawieszenia trzyma zbiór oczekujących wywołań i buduje z niego klucz postępu
(dwie czyste funkcje), a wrapper czyta je zamiast jednej aktywności, więc koniec zapisu nie wyłącza reguły, gdy `sleep`
z tej samej wiadomości dalej trwa. Sztuczny silnik ma słowo `parallel`; trzy pliki testów padały przed zmianą. Runda
poprawek 1 (F1–F2): jedna funkcja `toolCallText` w `stream.ts` daje tekst wywołania narzędzia logowi i regule, a
nagłówek testów wrappera wrócił do tekstu z HEAD; bramka 1562/1562, `check.mjs` i Biome przechodzą. Stan: zamknięty,
recenzja PASS w rundach 1 i 2. -->

# R-108 outcome

## Done

1. `src/runtime/stream.ts` (Change 1):
   - `StreamEvent` (`:2-11`) gains an optional `id` on the `tool` variant (a start) and on the `activity` variant (an end,
     `wait`); a doc comment says when it is set and why (E-19, R-108).
   - `interpret` adds `...callId(event)` to a start (`:49`) and to an end (`:52`). Nothing else of the parser changed: a
     start still needs a non-empty `toolName`, every end is still `wait`, and the `think` events and assistant messages
     are as before.
   - `callId` (`:114-119`) gives `{ id }` when `toolCallId` is a non-empty string and `{}` otherwise. It is a function of
     its own because the two inline conditions raised `interpret` to Biome's cognitive complexity 27 (limit 25); with
     the function `interpret` stays as complex as at HEAD.
2. `src/runtime/stalled-tool.ts` (Change 2), beside `stallStep` (T-25 (1)):
   - `PendingCall` (`:40-44`): the call's `toolCallId` (null for a start with none), `count` (the job's tool count at its
     start) and its tool with the detail. `PendingProgress` (`:46-47`) is the `{ tool, key }` pair the wrapper's tick
     already used.
   - `pendingAfter(pending, event, count)` (`:49-71`): a start appends its call; an end with an id removes the call with
     that id; an end with no id and a `think` event empty the set; `assistant`, `log` and any other event leave it
     (Decisions 4, 5).
   - `pendingProgress(pending, tools, output)` (`:74-91`): undefined when no call is pending; else the last started
     call's tool (Decision 3) and the key `<tool count>:<pending ids in start order, comma-joined>:<output count>`, a
     call with no id under its `count` (Decision 2), so every start and every end changes the key.
   - The header comment, `StallWatch` and `stallStep`'s doc say "no tool made progress" and "the pending calls'
     progress key"; `stallStep` itself is unchanged (fact 4).
3. `src/runtime/wrapper.ts` (Change 3):
   - `Seen` (`:545-558`): `pending: readonly PendingCall[]` replaces `tool`, whose only reader was `pendingTool` (fact
     3). The last tool with its detail, which `Seen.tool` held, is now the `tool` of the last started pending call.
   - `recordEvents` (`:559-598`): for each event it takes the start's number from `nextCount()` (a start) or keeps
     `seen.toolCalls`, then sets `seen.pending = pendingAfter(…)` before the event's writes, so a tick between them reads
     the set this event leaves. The progress file's `activity`, `lastTool` and `toolCalls`, the log lines and the tool
     cap (`nextCount`) are unchanged.
   - `tickContext.pendingTool` (`:346`) is `pendingProgress(seen.pending, tools, seen.progress)`. The ternary on
     `seen.activity` is gone, so `runInternalJob` has one branch fewer; its two "split pending" suppressions stay for
     R-082 (fact 6). `TickContext.pendingTool` (`:623-627`) returns `PendingProgress`. The uncertainty note reads the
     same `pending` in `observe`, so it follows the set with no change there.
4. `test/fake-engine.mjs` (Change 4): the word `parallel` (`:781-786`) emits a `write` start (`toolCallId` `call-1`,
   `note.md`), a `bash` start `sleep 600` (`call-2`) and the write's end, then waits on a `sleep 600` child as `idle`
   does; one header line (`:12`). The other words, the tool calls of `runTools` included, still send no `toolCallId`,
   so they run the no-id path of Decision 4.
5. Tests (Change 5):
   - `test/runtime/wrapper.test.ts` (`:665-679`): "a job whose write ends while a bash tool of its message waits on an
     idle scope ends failed, kind stall, naming the bash tool" plays `parallel` with `toolStall` 1 s and `--timeout
     10s` and expects `failed` with `{ kind: "stall", detail: "stalled tool bash sleep 600: scope CPU idle and no tool
     progress for 1s", resetAt: null }`. The file's opening comment is as at HEAD (item 7, F2).
   - `test/runtime/stalled-tool.test.ts`: two event helpers and `progressAfter` (`:96-122`), and six new tests
     (`:124-169`): each start adds and each end removes, pending
     while one call is left; the stall names the last started pending call; a `think` event empties the set; a start
     with no id is pending under its tool count and an end with an id leaves it; an end with no id empties the set; the
     key at each start and end (`1:call-1:0`, `2:call-1,call-2:0`, `2:call-2:0`) and with output (`2:call-2:4`).
     `KEY` and the key of "a changed progress key restarts the window" take the new form (`1:call-1:0`, `1:call-1:1`);
     those tests are otherwise unchanged. The opening comment names the new functions.
   - `test/u5-engine-stream.test.ts` (`:55-84`): a start and an end with `toolCallId` `call-1` carry `id: "call-1"`; a
     numeric id, an empty id and no id give no `id`. The file keeps its name until R-083 (Decision 7); its opening
     comment names the case.
6. `docs/jobs.md:208` (Change 6): the tools of one message can run at once, so a tool can end while another still
   runs; the rule acts while any tool runs; progress is "no tool started or ended, no output"; `<tool>` is the last
   started of the tools that still run. The rest of the paragraph is unchanged.
7. Review round 1 fixes (`ticket.md` → Decision 9, `review.md` → Round 1):
   - F1: `toolCallText` (`src/runtime/stream.ts:107-113`), exported, gives a tool call's text: its name and its detail
     joined by a space, the name alone with no detail. `pendingAfter` takes a pending call's `tool`, which `seen.pending`
     keeps, from it (`src/runtime/stalled-tool.ts:62`), and `recordEvents` writes the tool's log line with it
     (`src/runtime/wrapper.ts:575`); neither keeps a copy of its own. The log line's text is as at HEAD. A unit test in
     `test/u5-engine-stream.test.ts` (`:86-90`) checks both forms; the file's opening comment does not change for it.
   - F2: the opening comment of `test/runtime/wrapper.test.ts` is its text at HEAD; the new test's name and the comment
     above it say what it checks.

## Proof

All from the repository root at `8a3141c`, with the change in the working tree.

| Command | Exit | Tests |
|---|---|---|
| `node --test test/runtime/wrapper.test.ts` (AC-1) | 0 | 35/35 (34 at HEAD, plus the new test), 53.5 s |
| `node --test test/runtime/stalled-tool.test.ts` (AC-2) | 0 | 16/16 (10 at HEAD, plus six) |
| `node --test test/u5-engine-stream.test.ts` (AC-3) | 0 | 4/4 (3 at HEAD, plus one) |
| `node --test test/s3-finish-wake.test.ts` (AC-4) | 0 | 9/9 |
| `git grep -q toolCallId -- src/runtime/stream.ts` (AC-5) | 0 | — (exit 1 at HEAD, Decision 8) |
| `git grep -q 'one message' -- docs/jobs.md` (AC-6) | 0 | — (exit 1 at HEAD, Decision 8) |
| `node adrian-rebuild/tools/fails-before.mjs` (AC-7) | 0 | the three changed test files fail at HEAD (below) |
| `node adrian-rebuild/tools/gate.mjs --out node_modules/.rebuild-review/R-108.gate` (AC-8) | 0 | 1561/1561, `fail 0`, `duration_ms 350025` |
| `npx biome check --error-on-warnings .` (AC-9) | 0 | 310 files |
| `node adrian-rebuild/tools/check.mjs` (AC-9) | 0 | "0 errors" |
| `npx biome check --error-on-warnings adrian-rebuild` | 0 | 36 files |
| `node --test test/structure.test.ts test/config.test.ts` (the tests that read `docs/`) | 0 | 89/89 |

The gate ran twice, each run passing: first with an earlier wording of the `docs/jobs.md` sentence ("Pi starts each
tool call of one model message before the first one ends"; 1561/1561, 349.0 s), then on the final tree (the row
above). The wording changed because a call that Pi refuses at preparation ends inside its start loop (inventory §1), so
"before the first one ends" claimed more than E-19 says. 1561 is R-107's 1553 plus the eight new tests. No test failed
in any run of this ticket, except the new and changed tests at HEAD.

Review round 1 fixes (item 7), from the repository root at `8a3141c` on the fixed tree:

| Command | Exit | Tests |
|---|---|---|
| `node --test test/u5-engine-stream.test.ts test/runtime/stalled-tool.test.ts` | 0 | 21/21 (5 and 16) |
| `npx biome check --error-on-warnings .` (AC-9) | 0 | 310 files |
| `node adrian-rebuild/tools/check.mjs` (AC-9) | 0 | "0 errors" |
| `node adrian-rebuild/tools/gate.mjs --out node_modules/.rebuild-review/R-108.gate` (AC-8) | 0 | 1562/1562, `fail 0`, `duration_ms 355084` |
| `npx biome check --error-on-warnings adrian-rebuild` | 0 | 36 files |

1562 is round 1's 1561 plus F1's unit test. The gate ran once; no test failed in it.

## Fails before

The main session's runs of protocol step 4 after its gates (1561/1561, 349.8 s; after review round 1's fixes,
1562/1562, 347.1 s): `node adrian-rebuild/tools/fails-before.mjs` → exit 0, "test/runtime/stalled-tool.test.ts,
test/runtime/wrapper.test.ts, test/u5-engine-stream.test.ts fail at HEAD (exit 1)" both times. On the final tree the
stream's and the policy's test files fail at `HEAD` on their imports (`toolCallText`, `pendingAfter`), and the wrapper
test on its mechanism (kind `timeout` where `stall` is due); the implementer's runs below show the id test failing on
the missing `id` before F1 added its import.

The tests were written first, with `src/` not yet changed, and each file ran alone in the working tree (`<repo>` is the
repository root):

`node --test test/runtime/stalled-tool.test.ts` → exit 1, the new functions do not exist:

```
file://<repo>/test/runtime/stalled-tool.test.ts:10
	pendingAfter,
	^^^^^^^^^^^^
SyntaxError: The requested module '../../src/runtime/stalled-tool.ts' does not provide an export named 'pendingAfter'
```

`node --test test/u5-engine-stream.test.ts` → exit 1, the start carries no id:

```
✖ a tool's start and end carry Pi's toolCallId as their id when it is a non-empty string, and no id otherwise (1.215292ms)
  AssertionError [ERR_ASSERTION]: {"type":"tool_execution_start","toolCallId":"call-1","toolName":"write","args":{"path":"note.md"}}
  + actual - expected

    [
      {
        detail: 'note.md',
  -     id: 'call-1',
        kind: 'tool',
        name: 'write'
      }
    ]
```

`node --test --test-name-pattern="a job whose write ends while a bash tool" test/runtime/wrapper.test.ts` → exit 1,
the job's 10 s time limit ended it, not the stall rule:

```
✖ a job whose write ends while a bash tool of its message waits on an idle scope ends failed, kind stall, naming the bash tool (11105.886515ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
  + actual - expected

    {
  +   detail: 'timeout after 10000ms',
  +   kind: 'timeout',
  -   detail: 'stalled tool bash sleep 600: scope CPU idle and no tool progress for 1s',
  -   kind: 'stall',
      resetAt: null
    }
```

AC-7 on the final tree, `node adrian-rebuild/tools/fails-before.mjs` (every new or changed file under `test/`, the fake
engine included) → exit 0. The tool prints the last 40 lines; the gate's private TMPDIR is shown as `<gate TMPDIR>`:

```
fails-before: test/runtime/stalled-tool.test.ts, test/runtime/wrapper.test.ts, test/u5-engine-stream.test.ts fail at HEAD (exit 1)
  …
      at TestContext.<anonymous> (file://<gate TMPDIR>/fails-before-Ysv6az/test/runtime/wrapper.test.ts:675:9)
  …
    actual: { kind: 'timeout', detail: 'timeout after 10000ms', resetAt: null },
    expected: { kind: 'stall', detail: 'stalled tool bash sleep 600: scope CPU idle and no tool progress for 1s', resetAt: null },
  …
test at test/u5-engine-stream.test.ts:57:1
✖ a tool's start and end carry Pi's toolCallId as their id when it is a non-empty string, and no id otherwise (1.228103ms)
  …
    actual: [ { kind: 'tool', name: 'write', detail: 'note.md' } ],
    expected: [ { kind: 'tool', name: 'write', detail: 'note.md', id: 'call-1' } ],
```

Since that tail does not show the policy test file, it also ran alone: `node adrian-rebuild/tools/fails-before.mjs
test/runtime/stalled-tool.test.ts` → exit 0, `fails-before: test/runtime/stalled-tool.test.ts fail at HEAD (exit 1)`,
with the same `SyntaxError` on `pendingAfter` as above. After these runs only comment lines of the test files changed.

Review round 1, F1: the unit test of `toolCallText` was written first, with `src/` not yet changed; `node --test
test/u5-engine-stream.test.ts` → exit 1, the function does not exist:

```
file://<repo>/test/u5-engine-stream.test.ts:9
import { createStreamParser, toolCallText } from "../src/runtime/stream.ts";
                             ^^^^^^^^^^^^
SyntaxError: The requested module '../src/runtime/stream.ts' does not provide an export named 'toolCallText'
```

## Deviations from the ticket

1. Change 1 says "when Pi sends it as a string". An empty string counts as no id here, as an empty `toolName` already
   counts as no tool (`src/runtime/stream.ts:46`): an empty id cannot tell two calls apart. Such a start is pending under its tool count and
   such an end ends every pending call (Decision 4). The parser test pins it.
2. Change 2 names "one [function that] gives the progress key". `pendingProgress` gives the key together with the tool
   the detail names, as `TickContext.pendingTool` already returned both, so the wrapper's tick needs no logic of its own
   (Change 3: "the new logic sits in the policy module").
3. `Seen.tool` is removed rather than kept beside the set: its only reader was `pendingTool` (fact 3), and the set's
   last started call holds the same text (Decision 3).

## Unmeasured

- `unmeasured`, with no M-NN in `plan.md` → `## Measurement` that covers it: on the seat, a job whose task puts a file
  write and `sleep 300` in one message is ended by the stall rule after 180 s with `stalled tool bash sleep 300` in its
  log. `## Deployment` 4.12 checks it. It depends on the seat's idle rate staying under 2 % of the window (Risk; the
  first trial measured under 2 %). The fake plays E-19's order; the real Pi stream was not run here.

## Open points

1. Out of scope, for gate 5.4 (the ticket's `## Out of scope`, inventory Q7): a tool's own output reaches the wrapper
   as `tool_execution_update` lines, which `stream.ts` drops, so it is not progress. A tool that prints slowly while
   the scope is idle can still stall. R-036 Decision 2 kept this.
2. Out of scope (inventory Q6): the progress file and its readers (`limen status`, the picture, the wake's pulse) still
   show `wait` from a tool's end while another tool of its message runs. The log keeps its one `wait` line.
3. An end whose id names no pending call changes neither the set nor the key, so it does not restart the window (for
   example the end of a call whose start had no id). Pi sends both with the same id (fact 1), so the seat does not
   reach this. A `think` event inside a batch would empty the set until the next start (fail open, bounded by the job's
   time limit). The inventory's Unverified 2 left compaction and auto-retry unchecked for such an event.
4. `runInternalJob` changed (one line, `pendingTool`) and keeps its two "split pending" suppressions for R-082, as
   R-028, R-035 and R-036 did (fact 6; Change 3), although T-27 (1) asks a ticket that changes such a function to
   remove them.
