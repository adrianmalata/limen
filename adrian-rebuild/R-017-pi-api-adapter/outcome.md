<!-- PL: Wynik ticketu R-017 (20.11; szkic implementera): nowy adapter `src/runtime/pi-api.ts` jest jedyną deklaracją API
Pi, którego używa pięć hooków (`PiApi`, ładunki zdarzeń, kontekst), a jego strażnicy zwracają samą wartość albo rzucają
BAD_DATA przez `src/boundary.ts` (nowy eksport `refusedValue`), nazywając zdarzenie i pole. Hooki nie deklarują już
własnych typów Pi i czytają ładunki oraz kontekst tylko przez strażników; martwy kod, którego Pi 1.5.1 nie ma
(`before_subagent_spawn`, `context.agent`), odszedł (D-058). Kontrakt typów (`test/runtime/pi-contract.ts`) kompiluje
przypisania typów Pi do adaptera z asercjami „nie any”; przechodzi na prawdziwych typach Pi 1.5.1 z kopii w
`input/vendor/` i pada na fiksturach z błędnym członem albo bez pakietu. Po recenzji 1 poprawki 1, 2, 4 i 5: strażnik
`tool_call` w `group-peer` działa tylko w grupie (Pi 1.5.1 rzuca dalej błąd handlera `tool_call` i blokuje narzędzie),
testy strażników padają każdy z jednego powodu, część typu `text` wymaga `text`, argumenty polecenia `limen` idą
przez strażnika `piCommandArgs`. Po recenzji 2 komentarz nad handlerem `tool_call` podaje dokładny koszt strażnika.
Bramka sesji głównej: 377 testów, 0 porażek. Stan: zamknięty po trzech rundach recenzji (PASS, runda 3 bez uwag);
`## Fails before` z przebiegami `fails-before.mjs` sesji głównej. -->

# Outcome: R-017 One Pi API adapter with type guards, checked against Pi's real types

## Review round 2 fixes

- Fix (2) of round 2 (`ticket.md` → `## Decisions`, the round 2 entry): the comment above the `tool_call` handler of
  `hook/group-peer.ts` now states the cost exactly (T-30): outside a group the handler reads nothing, so it can block
  nothing; inside a group a payload of the wrong shape makes the guard throw, which Pi rethrows, and so blocks every
  tool call of the member, not only `task`. Only the comment changed; `npx biome check --error-on-warnings
  hook/group-peer.ts` → exit 0, `npx tsc --noEmit` → exit 0.

## Review round 1 fixes

`ticket.md` → `## Decisions`, the entry "2026-11-20 (main session, review round 1, `review.md`)", fixes (1), (2), (4)
and (5); findings (3) and (6) are rejected, and nothing changed for them. The entry corrects an engine fact this file
repeated: Pi 1.5.1 reports a handler's error as an extension error for every event except `tool_call`, where
`emitToolCall` (`dist/core/extensions/runner.js:965-980`) has no `catch` and `_beforeToolCall`
(`dist/core/agent-session.js:386-400`) rethrows the error, which blocks the tool call. Each test was run before its fix
on the working tree; after the fixes the gate passes with 377 tests (366 + 11 new).

1. Fix (1): the `tool_call` handler of `hook/group-peer.ts` returns before its guard when `LIMEN_GROUP_ID` is not set
   (`hook/group-peer.ts:94`), so the guard runs only inside a group, where the handler blocks a call anyway, as the
   read of `toolName` did at `HEAD`; a comment at the handler says why. New `test/hook/group-peer.test.ts`:
   - "the tool_call handler reads no payload outside a group, so a payload of the wrong shape blocks no call". Before
     the fix: `node --test test/hook/group-peer.test.ts` → exit 1; tests 2, pass 1, fail 1; `Error [LimenError]: Pi
     event tool_call: toolName: expected a string, got nothing`.
   - "the tool_call handler inside a group refuses a payload of the wrong shape with BAD_DATA", the counterpart. It
     passed before the fix too, since the guard is unchanged inside a group.
2. Fix (2): T-29 (3). In `test/runtime/pi-api.test.ts` each test asserts only the refusal its name states. The four
   tests with extra refusals are split:
   - `tool_result`: isError, a part of another type, input;
   - `message_end`: content neither a string nor a list;
   - `context`: a message without a role;
   - `agent_before_settle`: entries not a list.

   That is six new tests and no change of behaviour, so none fails before this fix: they passed on the working tree
   before it, and at `HEAD` the module they import does not exist.
3. Fix (4): a message part whose `type` is `"text"` must carry `text: string`, as Pi's `TextContent`
   (`pi-ai/package/dist/types.d.ts:259-262`). `messagePart` (`src/runtime/pi-api.ts:252`) checks such a part with the
   text-part check that tool results use; another part may still have no `text`. New test "piEvent refuses a message
   part of type text that carries no text". Before the fix: `node --test test/runtime/pi-api.test.ts` → exit 1; tests
   23, pass 22, fail 1; `AssertionError [ERR_ASSERTION]: the guard accepted the value`.
4. Fix (5): the `args` of the `limen` command pass through the new guard `piCommandArgs(command, value)`
   (`src/runtime/pi-api.ts:356`, `hook/wake.ts:949`), which throws BAD_DATA (`Pi command limen: args: expected a
   string, got …`) when they are not a string. `PiCommand`'s handler gets `args: unknown`, so the compiler refuses a read
   without the guard; the contract on the vendor copy still passes. New `test/hook/wake.test.ts`: "the limen command
   refuses arguments that are not a string with BAD_DATA naming them". Before the fix: `node --test
   test/hook/wake.test.ts` → exit 1; tests 1, fail 1; `TypeError: args.trim is not a function`. New guard test in
   `test/runtime/pi-api.test.ts`: "piCommandArgs returns a command's arguments and refuses arguments that are not a
   string", written with the fix, since before it the export it imports did not exist and the whole file would fail on
   the import.

## Done

1. `src/runtime/pi-api.ts` (new, beside `src/runtime/engine.ts`) is the one declaration of the Pi API that the hooks
   use (Change 1):
   - `PiApi` (`:120`), an interface with one `on` overload per event the hooks handle (`session_start`,
     `session_shutdown`, `session_compact`, `before_agent_start`, `message_start`, `message_end`, `context`,
     `tool_call`, `tool_result`, `agent_before_settle`, `agent_settled`), and `sendMessage`, `sendUserMessage`,
     `registerTool`, `registerCommand`. Every handler gets `(event: unknown, context: unknown)` (`PiHandler`), so the
     compiler refuses a read of a field before a guard. The one exception is `agent_before_settle`: its handler is
     generic in Pi's own entry type and gets the payload typed, so that it can pass Pi's entries back and cannot make
     one up (Deviation 4).
   - `PiEvents` (`:51`), the payload of each event whose fields a hook reads, by the event's name; `PiContext`, the
     context fields a hook reads (`cwd`, `isIdle`, `sessionManager.getSessionId`, `ui.notify`, `ui.setStatus`,
     `shutdown`); the results the handlers return, the tool and the command.
   - Guards: `piEvent(name, value)` (`:319`), `piSettleEvent(event)` (`:331`), `piContext(place, value, fields)`
     (`:340`, only the fields the hook asks for), `piToolInput(tool, value)` (`:350`) and `piCommandArgs(command,
     value)` (`:356`, review round 1, fix 5). Each returns the value
     itself, so getters and methods keep their owner, or throws BAD_DATA (class `environment`) through
     `refusedValue` of `src/boundary.ts`, with the file `Pi event <name>`, `Pi command <name>` or `Pi tool <name>`
     and the field's path, e.g. `Pi event message_end: message.content.1.text: expected a string, got 7`. A guard
     never skips. The checks of each event and of the context are typed by the declaration
     (`shape<T>` at `:204` needs a check for every field of `T`), so a field added to a type without a check does not
     compile.
2. The five hooks import their types from the adapter, declare none, and pass every event and context field they read
   through a guard first (Change 2): `hook/communication.ts:57-58`, `:86`, `:100-101`; `hook/finish.ts:48-49`, `:63`;
   `hook/group-peer.ts:37`, `:97` (inside a group only, review round 1, fix 1), `:102-103`, `:118-119`,
   `:143-144`; `hook/wake.ts:800`, `:876`, `:894`, `:949-950`.
   `hook/steering.ts` reads no field of an event or of the context. Each hook takes `Pick<PiApi, …>` of the members it
   calls. The hand-written shape checks of `communication`'s `message_end` handler and of `wake`'s `eventMessage`,
   which skipped a payload of the wrong shape, go; the guard refuses it instead.
3. The contract (Change 3): `test/runtime/pi-contract.ts`, `piContract(types)`. `types` is the folder that holds
   `pi-coding-agent/package`, `pi-ai/package` and `pi-agent-core/package`. The function writes `contract.mts` and a
   `tsconfig.json` (the repository's, extended, with `paths` for the three packages, `skipLibCheck`, and Node's types)
   into a temporary folder, compiles them with the repository's `typescript` and returns the diagnostics. The contract
   assigns `ExtensionAPI` to `PiApi`, `ExtensionContext` to `PiContext`, and each payload of `ExtensionEvent` to
   `PiEvents`. It asserts at compile time that `ExtensionAPI`, `ExtensionContext`, each event the adapter reads, each
   field the adapter declares in them, and each field of a message checks something: none is `any` (also a type
   whose package did not resolve), `never`, or missing in Pi. The obvious test for `any` (`0 extends 1 & T`) does not
   work for a type from an unresolved import: it accepted both `true` and `false` in a probe. The contract uses
   `[T] extends [typeof unique symbol]`, which flags `any`, an unresolved type and `never`.
4. Tests (Change 4): `test/runtime/pi-api.test.ts`, 24 tests (16 before review round 1), one per guard, per context
   field and per refusal: the right shape passes and is returned as it is, a wrong shape throws BAD_DATA naming the
   place and the field.
   `test/runtime/pi-contract.test.ts`, 7 tests:
   - a fixture of matching types passes;
   - a fixture whose `tool_call` has `toolName: number` fails, naming `tool_call` and `toolName`;
   - a fixture without the `session_compact` event fails, naming `"session_compact"`;
   - a fixture without `shutdown` in the context fails, naming `ExtensionContext.shutdown`;
   - fixtures without `pi-ai` or without `pi-agent-core` fail on the not-any assertion, naming `message_end.message`
     and `context.messages`;
   - the real Pi 1.5.1 types in `adrian-rebuild/input/vendor/` pass, and the test is skipped with its reason when that
     folder does not exist.

   The fixture packages are written into a temporary folder from text in the test file. Committed `.d.ts` files would
   repeat basenames, which the unique-basename test of `test/structure.test.ts` refuses, and `tsconfig.json` and Biome
   would include them.
5. The scan (Change 5), in `test/structure.test.ts`:
   - "T-32: no file of src/ or hook/ outside src/runtime/pi-api.ts declares a type named PiApi or with an on(event
     member" (`:652`): an AST scan of every type alias and interface, with an `on` method or function-typed property
     at any depth whose first parameter is `event`. It also asserts that the adapter declares `PiApi`.
   - Its self-test on a fixture (`:634`).
6. D-058 (Change 6): the `before_subagent_spawn` handler of `hook/group-peer.ts` and the three
   `context.agent?.kind === "sub"` checks (`hook/group-peer.ts`, two; `src/integrations/coordinator-registration.ts`,
   one) are gone. `CoordinatorSession` is `Pick<PiContext, "sessionManager">`
   (`src/integrations/coordinator-registration.ts:12`) and declares no field.
7. The three alignments with Pi's types (D-058, no decision needed):
   - `hook/group-peer.ts` sends no `attribution` field;
   - it no longer awaits `sendMessage`, which returns `void`;
   - the `limen` command handler of `hook/wake.ts` is `async`, since Pi's type is `Promise<void>`.

## Proof

All from the repository root, on the working tree of this ticket.

| Command | Exit | Result |
|---|---|---|
| `node --test test/runtime/pi-api.test.ts` (AC-1) | 0 | tests 24, pass 24, fail 0, skipped 0 |
| `node --test test/runtime/pi-contract.test.ts` (AC-2) | 0 | tests 7, pass 7, fail 0, skipped 0 (the vendor test ran) |
| `node --test test/structure.test.ts` (AC-3) | 0 | tests 21, pass 21, fail 0 |
| `git grep -n -E '^type (PiApi\|Context\|StartEvent\|ToolEvent\|SettleEvent\|Message) ' -- hook` (AC-4) | 1 | no line |
| `node adrian-rebuild/tools/fails-before.mjs` (AC-5) | — | the main session's run; see `## Fails before` |
| `node adrian-rebuild/tools/gate.mjs` (AC-6) | 0 | the main session's runs: after review round 2's fix, tests 377, pass 377, fail 0, cancelled 0, skipped 0, duration_ms 84801.3; after review round 1, 377/377, 89823.7; before the review, 366/366, 84354.0 (the implementer's own runs: 377/377 in 84397.4; 366/366 in 86608.6 and 84979.8) |
| `npx tsc --noEmit` (AC-7) | 0 | |
| `npx biome check --error-on-warnings .` (AC-7) | 0 | Checked 189 files, no errors |
| `node adrian-rebuild/tools/check.mjs` (AC-8) | 0 | 0 errors |
| `npx biome check --error-on-warnings adrian-rebuild` | 0 | |
| `node --test test/boundary.test.ts`; `test/u14-task-note.test.ts`; `test/integrations/coordinator-registration.test.ts` | 0 each | tests 25, 2 and 1; all pass |
| `node --test test/hook/group-peer.test.ts`; `test/hook/wake.test.ts` (review round 1) | 0 each | tests 2 and 1; all pass |

The gate's 377 tests are the 340 of R-018's gate plus 37 new ones: 24 in `test/runtime/pi-api.test.ts`, 7 in
`test/runtime/pi-contract.test.ts`, 2 in `test/structure.test.ts`, 2 in `test/hook/group-peer.test.ts` and 1 each in
`test/boundary.test.ts` and `test/hook/wake.test.ts`. In the gate's log after review round 1, `✔ the contract passes
the real types of Pi 1.5.1 in the vendor copy (861.019796ms)`: it ran, not skipped.

AC-9 (judgment):
- **The test against the real types ran and passed on the laptop** (above). It does not pass vacuously. A probe added
  three drifts to the adapter: a `before_subagent_spawn` overload, an `agent` field in the context and an `agent`
  field in `tool_call`. The contract on the vendor copy reported each of them:
  - `contract.mts:33: … "ExtensionContext.agent checks nothing: it is any, never or not in Pi"`;
  - `contract.mts:35: … "tool_call.agent checks nothing: it is any, never or not in Pi"`;
  - `contract.mts:39: Type 'ExtensionAPI' is not assignable to type 'PiApi'. Types of property 'on' are incompatible …`.

  The adapter itself also failed to compile, because its check tables lacked the new fields. The adapter was then
  restored byte for byte (`cmp`).
- **No handler reads an event or context field without a guard.** The compiler enforces it: every handler of
  `PiApi.on` gets `unknown`, the `agent_before_settle` handler passes its payload through `piSettleEvent` first, and
  a command or a tool gets its arguments, context and parameters as `unknown` (the command's arguments since review
  round 1, fix 5). The stored contexts, `session` in `hook/wake.ts` and the session start's context in
  `hook/group-peer.ts`, are guarded values. The `tool_call` handler of `hook/group-peer.ts` reads its payload only
  inside a group, and guards it there (review round 1, fix 1).
- **No guard skips silently:** each throws BAD_DATA. Pi reports a handler's error as an extension error
  (`runner.js`, `emitError`), except at `tool_call`, where it rethrows the error and blocks the tool call
  (`runner.js:965-980`, `agent-session.js:386-400`); so the one `tool_call` guard runs only where its handler may
  block a call.

## Fails before

My runs before any change of `src/` or `hook/` (the tests written first):

- `node --test test/runtime/pi-api.test.ts`: exit 1; tests 1, fail 1:
  `Error [ERR_MODULE_NOT_FOUND]: Cannot find module '…/src/runtime/pi-api.ts' imported from …/test/runtime/pi-api.test.ts`.
- `node --test test/runtime/pi-contract.test.ts`: exit 1; tests 7, pass 0, fail 7. Each fails on
  `contract.mts:2: TS2307: Cannot find module '…/src/runtime/pi-api.ts' or its corresponding type declarations.`,
  followed by the not-any assertions (`contract.mts:32: TS2322: Type '"none"' is not assignable to type
  '`ExtensionAPI.${string} checks nothing: it is any, never or not in Pi`'`, and the same for lines 33, 35 and 36).
  The first run of the helper also failed to resolve `@earendil-works/pi-coding-agent`: in ES-module resolution a
  `paths` entry that names a folder does not resolve. The helper now maps each package to the `types` file of its
  manifest (Deviation 8). That was a bug of the test helper, fixed before any change of `src/` or `hook/`.
- `node --test --test-name-pattern="T-32" test/structure.test.ts`: exit 1; the scan lists `hook/communication.ts:42:
  PiApi`, `hook/finish.ts:9: PiApi`, `hook/group-peer.ts:18: PiApi`, `hook/steering.ts:17: PiApi` and
  `hook/wake.ts:49: PiApi`.
- `node --test test/boundary.test.ts`: exit 1, `SyntaxError: The requested module '../src/boundary.ts' does not
  provide an export named 'refusedValue'`.

`node adrian-rebuild/tools/fails-before.mjs` (the main session's run, 2026-11-20), exit 0; an excerpt of the tool's
last lines, with the stack lines left out and the scan's list joined:

```
gate: git version 2.34.1 lacks 'worktree list -z'; the shim in …/node_modules/.rebuild-gate emulates it
fails-before: test/boundary.test.ts, test/integrations/coordinator-registration.test.ts, test/structure.test.ts, test/u14-task-note.test.ts, test/runtime/pi-api.test.ts, test/runtime/pi-contract.test.ts fail at HEAD (exit 1)
  contract.mts:33: TS2322: Type '"none"' is not assignable to type '`ExtensionContext.${string} checks nothing: it is any, never or not in Pi`'.
  contract.mts:35: TS2322: Type '"none"' is not assignable to type '`${string}.${string} checks nothing: it is any, never or not in Pi`'.
  contract.mts:36: TS2322: Type '"none"' is not assignable to type '`message.${string} checks nothing: it is any, never or not in Pi`'.
✖ T-32: no file of src/ or hook/ outside src/runtime/pi-api.ts declares a type named PiApi or with an on(event member
  + [ 'hook/communication.ts:42: PiApi', 'hook/finish.ts:9: PiApi', 'hook/group-peer.ts:18: PiApi',
  +   'hook/steering.ts:17: PiApi', 'hook/wake.ts:49: PiApi' ]
  - []
```

The run takes the changed test files together. Each changed fixture file alone at `HEAD`, by `node
adrian-rebuild/tools/fails-before.mjs <file>`: `test/u14-task-note.test.ts` and
`test/integrations/coordinator-registration.test.ts` pass ("pass at HEAD", exit 1), as the list below explains.

After the review round 1 fixes, the main session's run, exit 0; its first 30 lines without the lines that start
with `at` (the filter of that run), the home path shortened to `…`:

```
gate: git version 2.34.1 lacks 'worktree list -z'; the shim in …/node_modules/.rebuild-gate emulates it
fails-before: test/boundary.test.ts, test/integrations/coordinator-registration.test.ts, test/structure.test.ts, test/u14-task-note.test.ts, test/hook/group-peer.test.ts, test/hook/wake.test.ts, test/runtime/pi-api.test.ts, test/runtime/pi-contract.test.ts fail at HEAD (exit 1)
  contract.mts:33: TS2322: Type '"none"' is not assignable to type '`ExtensionContext.${string} checks nothing: it is any, never or not in Pi`'.
  
  contract.mts:35: TS2322: Type '"none"' is not assignable to type '`${string}.${string} checks nothing: it is any, never or not in Pi`'.
  
  contract.mts:36: TS2322: Type '"none"' is not assignable to type '`message.${string} checks nothing: it is any, never or not in Pi`'.
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: false,
    expected: true,
    operator: '==',
    diff: 'simple'
  }

test at test/structure.test.ts:652:1
✖ T-32: no file of src/ or hook/ outside src/runtime/pi-api.ts declares a type named PiApi or with an on(event member (134.738077ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
  + actual - expected
  
  + [
  +   'hook/communication.ts:42: PiApi',
  +   'hook/finish.ts:9: PiApi',
  +   'hook/group-peer.ts:18: PiApi',
  +   'hook/steering.ts:17: PiApi',
  +   'hook/wake.ts:49: PiApi'
  + ]
  - []
  
    generatedMessage: true,
```

The two new hook test files alone at `HEAD`, exit 0 each: `test/hook/group-peer.test.ts` → tests 2, pass 1, fail 1
("✖ the tool_call handler inside a group refuses a payload of the wrong shape with BAD_DATA"; the test outside a group
passes at `HEAD`, where the handler read `toolName` only inside a group, which is the reach fix (1) restores);
`test/hook/wake.test.ts` → tests 1, fail 1 ("✖ the limen command refuses arguments that are not a string with
BAD_DATA naming them").

### New and changed tests that pass at `HEAD`, and why

- "the Pi API scan finds a type named PiApi and a type or interface with an on(event member at any depth, and skips
  other on members" (`test/structure.test.ts`): it runs the scan, which the test file defines, on a fixture text and
  reads no file of `src/` or `hook/`; it is the scan's self-test.
- "the contract passes the real types of Pi 1.5.1 in the vendor copy" (`test/runtime/pi-contract.test.ts`):
  `fails-before.mjs` builds `HEAD` from `git archive`, which holds no `adrian-rebuild/input/` (untracked), so the test
  is skipped there with its reason. In the working tree before the change it failed with the other six.
- `test/boundary.test.ts`: at `HEAD` the whole file fails on its import of `refusedValue`; only the new test
  "refusedValue gives the typed error of a check outside the module, with its file, field and expectation" depends on
  the change, and the other 24 tests are unchanged.
- `test/u14-task-note.test.ts` (changed): its fixture events now have the fields Pi always sends (`systemPrompt` in
  `before_agent_start`, `input` and `isError` in `tool_result`, and a tool context with `shutdown`), which the guards
  require. It passes at `HEAD`, where the hooks ignore those fields; no assertion changed.
- `test/integrations/coordinator-registration.test.ts` (changed): the session it passes to `start` lost `cwd`, which
  `CoordinatorSession` no longer has; it passes at `HEAD`, where type stripping does not check the type.
- `test/fake-engine.mjs` (changed, not a test file): its context has `shutdown`, as Pi's has, because the `finish`
  tool's guard requires it. The fake's other events already had Pi's shape: it fires no `tool_call`, `tool_result` or
  `agent_before_settle`, and its `session_start` and `agent_settled` payloads are read by no hook.

## Deviations from the ticket

1. `src/boundary.ts` gains one export, `refusedValue(file, { field, expected, got })` (`:112`), with a test in
   `test/boundary.test.ts`. The guards return the value itself: Pi's context has getters and class methods, such as
   `sessionManager.getSessionId` on a `SessionManager`, which a validator of `src/boundary.ts` would copy into a map.
   So the guards check with their own predicates and get their BAD_DATA error through this export. That is "through
   `src/boundary.ts`" in Change 1, with one more export than the module had.
2. `piToolInput` guards the parameters of the `finish` tool, which are neither an event nor a context field, but
   are Pi data that the hook reads. A non-object throws BAD_DATA; a missing or non-string `handoff` is treated as
   before (no result is written).
3. `piContext` takes the fields the hook reads, so that a guard is no stricter than the hook needs (Risk) and the test
   contexts `{ cwd }` of `test/u13-guidance-reminder.test.ts` and `test/hook/communication.test.ts` stay valid. Its
   place names a command or a tool as well as an event (`PiPlace`).
4. `agent_before_settle` is the one handler whose payload is typed in `PiApi` (generic in Pi's entry type, see
   Done 1). A payload typed `unknown` would make the returned entries `unknown[]`, which Pi's result type refuses. Its
   guard `piSettleEvent` checks the payload as it arrives.
5. The contract checks more than the two assignments and the not-any assertions of Change 3. It also checks the
   payloads of `ExtensionEvent` against `PiEvents`, and that each member and field the adapter declares exists in Pi,
   because a plain assignment does not flag an optional field Pi lacks (`context.agent`, D-058). The contract test
   has seven cases where Change 4 names four: a missing event, a missing context field, and a fixture for each of the
   two optional packages.
6. Two hooks drop the `?.` of `pi.registerTool?.` and `pi.registerCommand?.`: Pi 1.5.1 always has both, and the
   adapter declares them as Pi does. The `finish` tool calls `context.shutdown()` after its guard instead of
   `ctx.shutdown?.()`.
7. Behaviour on payloads of the wrong shape changes, as the ticket intends. The `message_end` handler of
   `hook/communication.ts` and the `message_start` and `message_end` handlers of `hook/wake.ts` skipped such a payload
   silently; they now throw BAD_DATA. On well-formed payloads nothing changes, except that group delivery no longer
   awaits `sendMessage` (D-058), which runs `acceptTransport` one microtask earlier. Pi's `sendMessage` returns
   `void` and reports its own failures through `emitError`, so the `catch` around it saw only synchronous throws
   before and still does. The `tool_call` handler of `hook/group-peer.ts` reads and guards its payload only inside a
   group, as it read `toolName` at `HEAD` (review round 1, fix 1; the first draft guarded every call, which Pi would
   have turned into a blocked tool call).
8. The contract maps each package to the declaration file named by the `types` field of its manifest (or
   `index.d.ts`), not to the package folder. A missing package maps to a file that does not exist, so its types become
   `any`, which the assertions catch.

## Measurement

- `unmeasured` M-10: the contract compiles Pi's types in the gate (Risk). The seven contract tests take about 3 s
  together, the vendor test 0.7 s. This ticket's gate runs took 85.0 s, 86.6 s and, after review round 1, 84.4 s (the implementer's), and 84.4 s, 89.8 s
  and 84.8 s (the main session's); R-018's last gate took 82.6 s, and the baseline is
  79–88 s (`evidence/baseline.md`). One run is no measurement (z. 17); M-10 is measured at the close of stage 2.
- Not measurable here: that the coordinator's session shows no extension error from the hooks after `/reload` on the
  seat (`plan.md` → `## Deployment` 2.2, the ticket's Risk). It has no M-NN.

## Open points

1. Two parts of Pi's API are `any` in its own declarations because their packages are not vendored, so the contract
   cannot compare them:
   - the tool's `parameters` and `params` (`typebox`'s `TSchema` and `Static`);
   - the command's completion item (`pi-tui`'s `AutocompleteItem`).

   The not-any assertions cover `ExtensionAPI` and its members as wholes, the context fields and every event field
   the adapter declares, not each parameter of each method.
2. An extra field in an argument Limen passes to Pi is not caught by an assignment. The `attribution` field of
   `sendMessage` was one such field, and it is removed. The contract's field check covers only the payloads and the
   context, the values Pi gives Limen.
3. The fixture types in `test/runtime/pi-contract.test.ts` are a reduced copy of Pi's API. A ticket that changes the
   adapter changes them too, or the matching-fixture test fails.
4. A guard's BAD_DATA is an extension error in Pi, except in a `tool_call` handler, where Pi rethrows it and blocks
   the tool call; the one `tool_call` guard runs only inside a group (review round 1, fix 1). The job's
   `engine-error` and the warning in `limen status` are R-029's (D-055 (2)).
5. `assistantStopReason` (`src/runtime/stream.ts`) still takes `unknown`, because `stream.ts` (JSON mode) is out of
   scope. The communication hook passes it the guarded message.
6. The debt suppressions of the `wake` and `group-peer` factories and of `group-peer`'s `message_end` handler stay
   (R-082). Biome reports none of them as unused.
7. The `prefix` that Pi passes to the `limen` command's `getArgumentCompletions` is read without a guard
   (`hook/wake.ts`, `value.startsWith(prefix)`). Pi's interactive mode calls it from `pi-tui`'s autocomplete, which
   is not vendored, so whether a thrown error there is reported or ends the TUI is unknown; review round 1, fix 5
   names only `args`. Pi's type is `string`, and the contract checks the method against it.
