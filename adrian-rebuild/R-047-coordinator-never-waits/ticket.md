<!-- PL: Ticket R-047 (T-34): koordynator nigdy nie czeka. Hook `hook/wake.ts`, ładowany tylko w sesji koordynatora,
odmawia w Bash `sleep` 30 s lub dłuższego (także czasu, którego nie umie odczytać), a powód odmowy kończy się zdaniem
T-34 o budzeniu; polityka siedzi w jednym nowym module `src/runtime/mistake-guard.ts`, który R-060 rozszerzy o timery.
Instrukcja koordynatora zastępuje „Never poll with `sleep`.” tym samym zdaniem. Stan: napisany 26.11 przy `aa721d7` z
inwentarza `evidence/inventories/R-047.md`; `active` od 27.11 przy `0db0f37`, z miejscami faktów po R-038–R-045 i R-112
w decyzji 10; decyzja 11 (domyślna nocna) rozstrzyga `BLOCKED` o kontrakcie typów Pi dla unii `tool_call`. -->

# R-047 The coordinator never waits

## Problem

T-34 (1), quoted (`taste.md:1397-1416`): "Code keeps the conversation free: a wake after every job (A-033) with a header
(A-008), and `wait` is cut (T-18). The coordinator manual keeps one sentence: "Limen wakes you when a job ends; end your
turn instead of waiting." (missing context the model cannot infer; T-09). A mistake guard: a hook in the coordinator's
session refuses a Bash `sleep` of 30 s or more, with that sentence in the message (z. 12, z. 14)." Its Check: "a hook
test: `sleep 240` in the coordinator's Bash is refused with the message, `sleep 5` passes; … a metric …: the number of
`sleep` calls and repeated `status` reads in coordinator turns, before and after (H-21)."

Evidence: the a0.1.1 trial on the seat (`plan.md:3368-3372`): "seven wakes reached the coordinator on their own, and it
still slept six times and read `status` thirteen times (T-34, R-047)". R-006's outcome
(`adrian-rebuild/R-006-cut-planning-highlight-wait/outcome.md:240-241`): "the T-34 sentence ("Limen wakes you when a job
ends; end your turn instead of waiting") comes with R-047." Stage 4 on the seat (`plan.md:1732`): "a `sleep` of 30 s or
more is refused in the coordinator (T-34, R-047)"; seat step 4.6 (`plan.md:2569`): "In the coordinator's Bash, `sleep
240` is refused with the wake sentence (R-047)."

Rules: T-02 (a refusal carries the reason and the next step), T-09, T-25 (1) (one module for the policy), T-29, T-30,
T-32 (1) and (4) (new Pi API only through `src/runtime/pi-api.ts`, with its guard and the type contract), T-38 (a refusal
leaves no trace). Harness rules: z. 12 (tool errors return to the model as actionable messages), z. 14 ("Hook widzi
wywołanie, nie semantykę — zapis pośredni (np. przez Bash) może go obejść": a mistake guard, not a boundary). D-116 (1):
R-105's scan covers Limen's own code reachable from a read command; this ticket guards the model's Bash and adds no
wait primitive to Limen's code.

Engine facts (quoted from `plan.md` → `## Engine facts`):
- E-1's consequence (`plan.md:1616-1617`): custom messages arrive as `user`; "only tool results have another role".
- E-5 (`plan.md:1594`): "Pi's `tool_call` event sees only Pi tool names"; the coordinator has 4 Pi tools, so Claude
  Code's Bash call is Pi's `bash` tool and its `tool_call` fires.
- R-029's note (`plan.md:1981-1984`): "on Pi 1.5.1 an error a hook's handler throws becomes an extension error for every
  event except `tool_call`, whose handler error Pi rethrows, and that blocks the tool call".

Pi 1.5.1 (vendor copy, inventory section 3): a `tool_call` handler may return `{ block: true, reason }`; Pi then runs no
tool and no `tool_result` handler and writes a `toolResult` whose content is `[{ type: "text", text: reason }]` with
`isError: true` (`pi-agent-core: dist/agent-loop.js:513-523`, `:392-398`, `:646-676`). `BashToolCallEvent` is `{
toolName: "bash"; input: { command; timeout? } }` (`pi-coding-agent: dist/core/extensions/types.d.ts:962-965`,
`dist/core/tools/bash.d.ts:7-8`). `terminate: true` would end the run before the model reads the reason (`agent-loop.js:172`).
Under the bridge the result returns to Claude Code's waiting tool call (`evidence/engine-sources/bridge-5.0.3.md`,
`:115-118`).

Facts at `aa721d7` (inventory sections 1, 2, 5, 6):
1. No hook refuses a Bash command: the one `tool_call` handler is `hook/group-peer.ts:99-109` (the `task` tool inside a
   group). The adapter declares `PiToolCallEvent = { readonly toolName: string }` (`src/runtime/pi-api.ts:40-41`, guard
   `:295`); the contract fixture already declares `input` (`test/runtime/pi-contract.test.ts:48`).
2. `hook/wake.ts` is the coordinator's hook: in a job it returns before registering more (`hook/wake.ts:1058-1060`); every
   project's stub loads it (`templates/limen-extension.ts:8`, kept by `limen init`, `src/project/setup.ts:77-83`).
3. The manual says "Never poll with `sleep`." (`templates/agents.md:138`); T-34's sentence is in no product file
   (`git grep -q 'end your turn instead of waiting' -- src hook templates` → exit 1).
4. M-05 counts a `sleep` at the start of a shell command (after a separator, reserved words that open a body, assignments
   and the wrappers `nohup`, `time`, `command`, `env`, `timeout <arg>`; `adrian-rebuild/tools/same-task.mjs:51-57`).

## Change

1. `src/runtime/mistake-guard.ts`, new (T-25 (1); R-060 extends it with T-42's timers): a pure function of a Bash
   command's text that returns the refusal reason or nothing, plus the constant `WAKE_SENTENCE` = "Limen wakes you when a
   job ends; end your turn instead of waiting." It finds a `sleep` at a command start by M-05's definition (fact 4, its
   own copy: the product does not import `adrian-rebuild/tools/`), so a quoted word such as `git commit -m "fix sleep
   60"` is no call. GNU `sleep`'s duration is the sum of its arguments, each a number with an optional `s`, `m`, `h` or
   `d`, or `infinity`; a duration it cannot read (`sleep "$T"`, `sleep $((N*60))`) counts as 30 s or more (fail closed,
   z. 14). It refuses a total of 30 s or more. The reason is one short lead naming the refused command's `sleep` and the
   30 s rule, then `WAKE_SENTENCE` verbatim. It starts no process, reads no file and writes nothing (T-38).
2. `hook/wake.ts`: after its job return (`:1058-1060`), a `recorded` `tool_call` handler that, for `toolName === "bash"`,
   returns `{ block: true, reason }` when item 1 refuses the command and `undefined` otherwise; no `terminate`. In a job
   no such handler is registered.
3. `src/runtime/pi-api.ts`: `PiToolCallEvent` gains `input` (an object; the handler reads `command` as a string only
   when the tool is `bash`), with its guard (T-32 (1), (4)); `test/runtime/pi-contract.test.ts` stays green against Pi
   1.5.1's types.
4. The coordinator manual's "Never poll with `sleep`." (`templates/agents.md:138` at `aa721d7`, in the manual's file as
   R-040 leaves it) becomes `WAKE_SENTENCE`, and the coordinator's reference file of R-039 under
   `test/runtime/context-message/` follows (R-039 → `## Change` 6). `docs/setup.md` → Hooks (`:176-185`) gets one sentence:
   the coordinator's hook refuses a Bash `sleep` of 30 s or more.
5. Tests, each failing at HEAD (T-29):
   - `test/runtime/mistake-guard.test.ts`, new, cases named "T-34: …": `sleep 240` refused with `WAKE_SENTENCE`; `sleep
     5` and `sleep 29` pass; `sleep 30`, `sleep 1m`, `sleep 0.5m`, `sleep 10 25` and `sleep infinity` refused; a `sleep`
     after `;`, `&&`, `|`, `$(`, `do`, `nohup` and `timeout 5` refused; `sleep "$T"` refused; a `sleep` inside another
     command's quoted argument passes; the coordinator's context message built by R-039's module holds `WAKE_SENTENCE`
     once. No test sleeps (T-31 (4)).
   - `test/hook/wake.test.ts`: in a coordinator the handler blocks `bash` `sleep 240` with the reason, returns nothing for
     `sleep 5` and for another tool; in a job (`LIMEN_JOB=1`) no `tool_call` handler is registered; on the fake engine
     (R-038's model view), a coordinator session scripted `tool sleep 240` then `say done` has, in its next model call, a
     `tool` message whose text holds `WAKE_SENTENCE`, and its transcript's `toolResult` has `isError: true`; with `tool
     sleep 5` no such text.
   - `test/runtime/pi-api.test.ts`: the `tool_call` guard returns an event with `input` and refuses one whose `input` is
     not an object.
   - `test/cli/spawn.test.ts`: a spawned job scripted `tool sleep 240` gets no refusal.

Files the criteria name that this ticket or R-039 creates: `test/runtime/mistake-guard.test.ts`,
`test/runtime/context-message.test.ts`.

## Out of scope

- Other forms of waiting (`while …; do sleep 10; done` below 30 s, `watch`, `tail -f`, repeated `limen status`): T-34 (1)
  names only a `sleep` of 30 s or more; M-05 counts the rest (`plan.md:2697`).
- T-34 (2)–(4): the "about five minutes" threshold, the parallel-workers and do-not-implement prose (R-046, R-065).
- Jobs: no guard there (seat 3.8 and 4.12 run `sleep 300` in trial jobs; a lone `sleep` in a job is a stall,
  `docs/jobs.md:208`); R-060 registers the extended guard in jobs for T-42's timers.
- `bash -c "sleep 60"` and other indirect forms pass (z. 14: a mistake guard sees the call, not its meaning).
- A record or log of a refusal: the error tool result in the session is the trace M-05 counts (T-38).
- What the bridge makes of `isError` in Claude Code's tool result, and whether the model then ends its turn: seat step
  4.6 and M-05 at 4.8.

## Acceptance

- AC-1: `node --test test/runtime/mistake-guard.test.ts` → exit 0.
- AC-2: `node --test test/hook/wake.test.ts` → exit 0.
- AC-3: `node --test test/runtime/pi-api.test.ts` → exit 0; `node --test test/runtime/pi-contract.test.ts` → exit 0.
- AC-4: `node --test test/cli/spawn.test.ts` → exit 0; `node --test test/runtime/context-message.test.ts` → exit 0.
- AC-5: `node adrian-rebuild/tools/fails-before.mjs test/runtime/mistake-guard.test.ts test/hook/wake.test.ts
  test/runtime/pi-api.test.ts` → exit 0, its output in `outcome.md` → `## Fails before`.
- AC-6: `git grep -q 'Limen wakes you when a job ends; end your turn instead of waiting.' -- templates` → exit 0.
- AC-7: `git grep -q 'Never poll with' -- templates` → exit 1.
- AC-8: `git grep -q 'tool_call' -- hook/wake.ts` → exit 0.
- AC-9: `node adrian-rebuild/tools/gate.mjs --out node_modules/.rebuild-review/R-047.gate` → exit 0.
- AC-10: `npx biome check --error-on-warnings .` → exit 0; `node adrian-rebuild/tools/check.mjs` → exit 0.
- AC-11 (judgment): the guard acts only in the coordinator's session, refuses only a `sleep` of 30 s or more (or one it
  cannot read), starts no process and writes nothing, and its reason ends with T-34's sentence verbatim, the same constant
  the manual's line comes from.

## Migration

None: the handler joins `hook/wake.ts`, which every project's stub already loads (fact 2); no `.limen/` file, record
field or CLI form changes, and a refusal writes nothing.

## Risk

- A coordinator script that legitimately waits 30 s or more is refused; the reason names the way out (end the turn).
- Fail closed on an unreadable duration also refuses a short computed `sleep`; a coordinator has no computed waits to
  run (inventory Q4).
- R-105 edits `hook/wake.ts` too (its `ticket.md`); the implementer re-reads the file at HEAD (D-025).

## Rollback

`git revert $(git log --format=%H --grep='^R-047:' adrian-rebuild --)`. Nothing on disk to undo.

## Decisions

Settled by the documents when the ticket was written (2026-11-26, the main session's reading, not a night default; the
inventory's questions in `evidence/inventories/R-047.md` → section 8):
1. Placement (Q1 (a)): the policy in one new module (T-25 (1)), registered in `hook/wake.ts`, which only the coordinator
   runs and every project already loads, so no migration; a new hook file would need one.
2. Threshold and session (Q2, Q9): T-34 (1), a `sleep` of 30 s or more in the coordinator's session only.
3. What a `sleep` is (Q3 (a)): M-05's definition, so the guard and the metric count the same calls; indirect forms
   pass (z. 14).
4. Unreadable durations count as 30 s or more (Q4 (a)): a mistake guard fails closed (z. 14).
5. The reason (Q5 (b)): a short lead and T-34's sentence verbatim (z. 12, T-02); the lead's words are the main session's,
   the row being `delegated`.
6. One source of the sentence (Q6 (a)): a constant in the module, and a test that the coordinator's context message
   holds it, so the test does not depend on the manual's file name (R-040 may rename it).
7. No `terminate` (Q7 (a)): the model must read the reason in the same run.
8. No record of the refusal (Q8 (a)): T-38; the session's error tool result is the trace.
9. The module's name: "mistake guard" is T-34's and T-42's term (T-18: one word per thing); "guard" alone already names
   the adapter's shape checks.
10. 2026-11-27, at activation (`0db0f37`; the night's main session, protocol step 2, D-025): the facts' places after
    R-038–R-045 and R-112. Fact 1: the one `tool_call` handler is `hook/group-peer.ts:105-116`; `PiToolCallEvent = {
    readonly toolName: string }` at `src/runtime/pi-api.ts:50`, its guard at `:355`, the handler's return type `PiBlock`
    at `:102` and `on("tool_call", …)` at `:170`; the contract fixture declares `input` at
    `test/runtime/pi-contract.test.ts:52` and the block return at `:106`. Fact 2: the job return is at
    `hook/wake.ts:1129-1131`, before `registerCommand`; since R-044 a job's hook set holds no `wake` at all
    (`src/runtime/hook-set.ts:20-25`), and the project stub still loads it in the coordinator
    (`templates/limen-extension.ts:8`), so Change 2's handler goes after `:1129-1131` and the `LIMEN_JOB=1` test stays
    the job's case. Fact 3: R-040 moved the manual to `templates/manual.md`, whose line 113 ends with "Never poll with
    `sleep`."; the coordinator's reference file of R-039 is `test/runtime/context-message/owner-facing-coordinator.md`
    (line 119 holds the same sentence); T-34's sentence is still in no file of `src`, `hook` or `templates`. Fact 4:
    unchanged (`adrian-rebuild/tools/same-task.mjs:51-56`). `docs/setup.md` → Hooks is at `:183-189`. The grep criteria
    at `HEAD`: AC-6 and AC-8 exit 1, AC-7 exits 0 on the one line the ticket replaces (`templates/manual.md:113`). AC-9
    names the gate's `--out` form (D-130).
11. 2026-11-27, the implementer's `BLOCKED` in protocol step 3 (night default, for Adrian to confirm in the morning; D-054
    (2) (b): a technical choice inside Change 3, whose purpose T-32 (2) settles, a contract that fails on a mismatch).
    The question: with `input` on `PiToolCallEvent`, the contract test "the contract passes the real types of Pi 1.5.1
    in the vendor copy" fails (`contract.mts:42: … "tool_call.input checks nothing: it is any, never or not in Pi"`),
    because Pi 1.5.1's `ToolCallEvent` is a union (`pi-coding-agent: dist/core/extensions/types.d.ts:962-1004`) whose
    built-in members' `input` types come from `typebox`, which is not vendored, so under `skipLibCheck` they are `any`
    and the union's `input` collapses to `any`; only `CustomToolCallEvent.input` is a real type (`Record<string,
    unknown>`). The answer (the implementer's option 1): `test/runtime/pi-contract.ts` counts a field of a union
    payload as checked when at least one member of Pi's union declares it with a type that checks something (neither
    `any` nor `never`, itself or as its element type), and still names the field when every member's type is vacuous;
    a non-union payload is checked as before, and a missing package still fails. `test/runtime/pi-contract.test.ts`
    gets a fixture test: a union whose every member's field is `any` fails and names the field, and a union with one
    member of a real type passes. `eventsFit` keeps assigning Pi's payloads to the adapter's events, so a change of the
    custom member's `input` still fails the contract. Rejected: a named exception for `tool_call.input` (option 2: it
    would stop checking silently if Pi made the custom member's `input` a typebox type too), and no `input` in the
    adapter's type (option 3: the handler would read a field the adapter does not declare, against T-32 (1)). The
    implementer's other choices so far are accepted: the adapter's guard `piBashCommand` (the handler reads `command`
    only through the adapter, T-32 (1)), and the reason's lead, for `sleep 240`: "Refused `sleep 240`: the
    coordinator's session runs no sleep of 30 s or more, or of a length Limen cannot read." before `WAKE_SENTENCE`
    (Decision 5).
