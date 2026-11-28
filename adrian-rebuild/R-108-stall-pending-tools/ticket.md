<!-- PL: Ticket R-108 (E-19, A-059, D-112 (2)): Pi 1.5.1 uruchamia narzędzia jednej wiadomości równolegle, a wrapper
trzyma jedną aktywność, więc koniec jednego narzędzia ustawia `wait`, choć drugie (np. `sleep`) dalej trwa, i reguła
zawieszenia go nie widzi. Oczekujące narzędzia są trzymane po `toolCallId` w czystej funkcji modułu reguły, klucz
postępu obejmuje ten zbiór, a test odtwarza zapis i `sleep` w jednej wiadomości. Stan: napisany 26.11 przy `cbe6f1a`
z inwentarza `evidence/inventories/R-108.md`; `active` od 28.11 w nocy przy `ab68dbd`, z miejscami faktów w decyzji 8. -->

# R-108 The stall rule follows every pending tool of a message

## Problem

E-19 (`plan.md` → `## Engine facts`), quoted: "In parallel by default (`toolExecution ?? "parallel"`,
`pi-agent-core@1.5.1/dist/agent.js#L147`): `executeToolCallsParallel` (`dist/agent-loop.js`) emits every
`tool_execution_start` first, then each `tool_execution_end` as its tool finishes, so a tool can end while another of
its message still runs." D-112 (2): "the stall rule beside a message's parallel tool calls (E-19) → R-108 […] a job's
time limit bounds (2)". The note in `## Tickets`: "the wrapper keeps one activity (`recordEvents`,
`src/runtime/wrapper.ts` line 501 at `a0.3.0`), so a tool's `tool_execution_end` sets `wait` while another tool of its
message still runs, and `pendingTool` (line 314) is undefined for the rest of that tool. Pending tools are kept by
`toolCallId` (each start adds, each end removes), a tool is pending while one is left, and the progress key covers that
set; the test plays a write and a `sleep` started in one message, the write ending first." A-059's Decision, the part
R-036 took: "no CPU in the whole job and no tool progress for 180 s; a background build does not trigger it, a lone
`sleep` does." T-25 (1): one module per policy; T-31 (3): fake scenarios with no real waiting; T-29: test places.

Facts at `c3bbc5c` (the read-only inventory `evidence/inventories/R-108.md`; no code of these files changed since
`a0.3.0`):
1. E-19 holds in the vendor copy of Pi 1.5.1: sequential runs only when a tool declares `executionMode: "sequential"`
   (`agent-loop.js:372-379`), which no built-in tool, no Limen tool and no setting of the coding agent does
   (`sdk.js:252-288`); start, update and end all carry `toolCallId`, and Pi keeps its own pending calls as a set keyed by
   it (`agent.js:411-422`).
2. The wrapper reads Pi's `--mode json` stdout through `src/runtime/stream.ts` (116 lines), not R-017's `pi-api.ts`
   (which declares hook events only): a start needs a non-empty `toolName` (`:41-42`) and carries no id (`:5`); every
   `tool_execution_end` becomes `{ kind: "activity", name: "wait" }` with no field read (`:46-48`).
3. `recordEvents` (`src/runtime/wrapper.ts:501-538`): a start sets `activity = "tool"` and `tool` (the last tool with
   its detail, `:494-495`); an `activity` event sets `think` or `wait` (`:518-525`). `pendingTool`
   (`:311-318`) is `seen.activity === "tool" ? { tool, key: \`${tools}:${seen.tool}:${seen.progress}\` } : undefined`.
   Its only readers are the stall rule (`scopeSamples`'s `observe`, `:605-627`) and the uncertainty note, set and
   cleared by the same `pending` (`:615-619`); the tool cap, `exhaust`, the 80 % steer, the timeout and the queue
   diagnosis do not read the activity.
4. The policy is `src/runtime/stalled-tool.ts` (92 lines): `stallStep(watch, key, sample, windowMs)` (`:54-70`)
   compares keys only (`:63`), so a key built from a set needs no change there.
5. The fake engine (`test/fake-engine.mjs`, 300 lines) plays tool events with no `toolCallId` (`tool`, `idle`,
   `tools-on-term`, header `:3-15`); `idle` emits a `bash` start `sleep 600` with no end and waits on a real `sleep`
   child that uses no CPU, over the plant's still `cpu.stat`. The stall tests: `test/runtime/wrapper.test.ts:513-561`
   (`toolStall` 1 s), `test/s3-finish-wake.test.ts:132-158`, `test/runtime/stalled-tool.test.ts` (key `KEY = "1:bash
   sleep 300:0"`, `:13-14`), the parser's `test/u5-engine-stream.test.ts:23-52` (`deepEqual` of a start at `:28-30`).
6. `runInternalJob` (`src/runtime/wrapper.ts:47-374`) carries two "split pending" suppressions (`:45-46`); R-028, R-035
   and R-036 left them to R-082 (`R-036-stall-over-job-scope/outcome.md` → Open point 1).
7. `docs/jobs.md:208` ("Stalled tools") says the rule acts "while a tool runs" with the detail `stalled tool <tool>: …`
   and names no parallel calls.

## Change

1. `src/runtime/stream.ts`: a start and an end carry the call's `toolCallId` when Pi sends it as a string (`id`, optional
   in the event type); nothing else of the parser changes.
2. `src/runtime/stalled-tool.ts`: one pure function gives the pending set after one stream event, and one gives the
   progress key, beside `stallStep` (T-25 (1)): a start adds its call (by `toolCallId`; a start with no id is pending
   under a key of its own, its tool count), an end removes its call (an end with no id ends every pending call, as
   today), and a `think` event empties the set; the key is `<tool count>:<pending ids in start order>:<output count>`,
   so every start and every end restarts the window; the pending tool the detail names is the last started of the set.
3. `src/runtime/wrapper.ts`: `recordEvents` keeps the set through those functions, `pendingTool` reads it (pending while
   one call is left), and the uncertainty note follows the same `pending`. The progress file's `activity`, the tool cap,
   the timeout and the 80 % steer do not change. The set lives in `Seen`, and the new logic sits in the policy module,
   so `runInternalJob` grows by no branch; its two suppressions stay for R-082, as in R-028, R-035 and R-036 (fact 6).
4. `test/fake-engine.mjs`: a word (`parallel`) that emits a `write` start (`toolCallId` `call-1`), a `bash` start
   `sleep 600` (`call-2`), the write's end, and then waits as `idle` does; one header line.
5. Tests: `test/runtime/wrapper.test.ts` plays `parallel` with `toolStall` 1 s and `--timeout 10s`: the job ends
   `failed`, kind `stall`, detail `stalled tool bash sleep 600: scope CPU idle and no tool progress for 1s` (at HEAD it
   ends kind `timeout`, bounded by 10 s); `test/runtime/stalled-tool.test.ts` tests the set and the key (each start adds,
   each end removes, pending while one is left, a `think` empties it, an event with no id, the key changing at each
   start and end); `test/u5-engine-stream.test.ts` tests the id on a start and an end and its absence.
6. `docs/jobs.md:208`: the tools of one message can run at once; the rule acts while any is pending, a tool's start or
   end is progress, and `<tool>` is the last started of the pending tools.

## Out of scope

- The progress file and its readers (`limen status`, the picture, the wake's pulse) still show `wait` while a tool of
  the message runs (inventory Q6): D-112 (2) places the stall rule, and no reader of the progress file ends a job.
- A tool's own output (`tool_execution_update`, dropped by `stream.ts`) as progress (inventory Q7, section 9): R-036
  Decision 2 kept the key; a tool that prints slowly with an idle scope can still stall. An open point of `outcome.md`
  for gate 5.4.
- The scan for real waiting in tests: R-083 (D-115 (3)).

## Acceptance

- AC-1: `node --test test/runtime/wrapper.test.ts` → exit 0.
- AC-2: `node --test test/runtime/stalled-tool.test.ts` → exit 0.
- AC-3: `node --test test/u5-engine-stream.test.ts` → exit 0.
- AC-4: `node --test test/s3-finish-wake.test.ts` → exit 0.
- AC-5: `git grep -q toolCallId -- src/runtime/stream.ts` → exit 0.
- AC-6: `git grep -q 'one message' -- docs/jobs.md` → exit 0.
- AC-7: `node adrian-rebuild/tools/fails-before.mjs` → exit 0, its output in `outcome.md` → `## Fails before`.
- AC-8: `node adrian-rebuild/tools/gate.mjs --out node_modules/.rebuild-review/R-108.gate` → exit 0.
- AC-9: `npx biome check --error-on-warnings .` → exit 0; `node adrian-rebuild/tools/check.mjs` → exit 0.
- AC-10 (judgment): the stall rule applies while any tool of the job is pending and to no job while none is; a tool's
  start or end restarts the window; the tool cap, the timeout, the 80 % steer and the progress file behave as at HEAD.

## Migration

None: no record or file format changes.

## Risk

- Seat step 4.12 depends on the seat's idle rate staying under 2 % of the window, as for R-036 (step 3.8).
- A lost end of a call keeps it pending until a `think` event or another end with no id; the job's time limit bounds
  that (D-112).

## Rollback

`git revert $(git log --format=%H --grep='^R-108:' adrian-rebuild --)`; no migration to reverse.

## Decisions

Settled by the documents when the ticket was written (2026-11-26, the main session's reading, not a night default; the
inventory's questions in `evidence/inventories/R-108.md` → section 8):
1. The set and the key live as pure functions in `src/runtime/stalled-tool.ts` (Q1 (b)): T-25 (1) and R-036's "the rule
   is a pure function […] in `src/runtime/stalled-tool.ts`".
2. The key holds the pending ids (Q2 (a)): the note's "the progress key covers that set"; ids are unique per call
   (fact 1).
3. The detail names the last started pending tool (Q3 (a)), keeping `Seen.tool`'s meaning and R-036 Decision 5's
   prefix `stalled tool `.
4. A start with no id is pending under its own key, an end with no id ends every pending call (Q4 (a)): fail open,
   bounded by the time limit (D-112); a failed job for an event Pi always sends whole would be a new failure path.
5. A `think` event empties the set (Q5 (a)), so a lost end never lets the rule act while the engine waits on the model
   (`docs/jobs.md:208`).
6. Q6 and Q7 stay out of scope (`## Out of scope`): D-112 (2) and R-036 Decision 2 settle them.
7. The places of the tests (Q8) and the fake word `parallel` (Q9) follow T-29 (1); the stream's test file keeps its
   name until R-083 (T-29 (6)).
8. 2026-11-28, at activation (`ab68dbd`; the night's main session, protocol step 2, D-025): the facts' places after
   R-038–R-045, R-112, R-047 and R-104–R-107. `src/runtime/stream.ts`, `src/runtime/stalled-tool.ts` and
   `test/runtime/stalled-tool.test.ts` are unchanged since `c3bbc5c` (facts 2 and 4 stand). Fact 3: R-039–R-045 grew
   `src/runtime/wrapper.ts`: `pendingTool` is at `:334-336` (inside `tickContext`), `Seen` at `:535`, `recordEvents` at
   `:549-590` (a start sets `activity = "tool"` at `:557`), `scopeSamples` at `:630` with `observe` at `:672` and its
   `stallStep` call at `:679`; `runInternalJob` starts at `:73`, its "split pending" suppressions just above (fact 6).
   Fact 5: R-038's fake engine (`test/fake-engine.mjs`) emits each tool call of a model call in pi-agent-core's order
   at `:572-590` (start, result, end; still with no `toolCallId`), `idle` at `:778` and `tools-on-term` at `:132-133`,
   its words in the header at `:3-24`; the stall tests are `test/runtime/wrapper.test.ts:650-770` (the `idle` stall at
   `:652`) and `test/s3-finish-wake.test.ts:135-145`. Fact 7: `docs/jobs.md:208` stands. The grep criteria at `HEAD`:
   AC-5 and AC-6 exit 1. AC-8 names the gate's `--out` form (D-130).
