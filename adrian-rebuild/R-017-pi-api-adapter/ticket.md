<!-- PL: Ticket R-017: jeden adapter API Pi (src/runtime/pi-api.ts) zamiast lokalnych typów w pięciu hookach, ze
strażnikami typów, które przy zdarzeniu o złym kształcie rzucają typowany BAD_DATA (oznaczenie joba i ostrzeżenie
w limen status to R-029, D-055 (2)). Kontrakt typów porównuje adapter z prawdziwymi typami Pi 1.5.1 z kopii
w adrian-rebuild/input/vendor/, jako test w node --test, a nie w skrypcie wdrożenia (D-055 (1)). Martwy kod, którego
Pi 1.5.1 nie ma (zdarzenie before_subagent_spawn i context.agent), ticket usuwa (D-058). Stan: zamknięty (done)
w dzień 20.11, po trzech rundach recenzji. -->

# R-017 One Pi API adapter with type guards, checked against Pi's real types

## Problem

T-32: "(1) The Pi API that Limen uses is declared only in the adapter of T-27; hooks import it from there, with no
local declarations. (2) A type contract: a script compiles a file that assigns Pi's real types to the adapter's
interface and fails on a mismatch; the path to the types is an argument (no seat paths in the repo) […] (4) The
adapter's type guards reject an event of unexpected shape with a typed error […] never a silent skip." T-32 → Check:
"a scan: Pi API type declarations only in the adapter; a test of the contract script on fixtures of matching and
mismatching types; […] a type-guard test on an event of the wrong shape." (3), the version refusal, is R-049's.

D-055 (2026-11-20, Adrian, "1c 2a"): "(1) The Pi type contract of R-017 runs only in the repository, as a test inside
`node --test` on the copy of the Pi packages in `adrian-rebuild/input/vendor/` […]; `seat/deploy.ts` does not run it
[…]. (2) A Pi event of the wrong shape: R-017's type guards throw a typed `BAD_DATA` error (`src/boundary.ts`) that
names the event and the field, which Pi reports as an extension error; the job's failure with kind `engine-error` and
the warning in the coordinator's `limen status` (T-32 (4)) are R-029's".

Facts at HEAD:
- Each hook declares the part of the Pi API it uses as local types: `hook/steering.ts:18-21`,
  `hook/communication.ts:30-48`, `hook/finish.ts:6-20`, `hook/group-peer.ts:9-30`, `hook/wake.ts:48-84` (`on` overloads
  for `session_start`, `session_shutdown`, `session_compact`, `before_agent_start`, `message_start`, `message_end`,
  `tool_call`, `tool_result`, `agent_settled`, `before_subagent_spawn`; `sendUserMessage`, `registerTool`,
  `registerCommand`; the context's `cwd`, `isIdle`, `agent`, `sessionManager.getSessionId`, `ui.notify`,
  `ui.setStatus`). `templates/limen-extension.ts:6` passes `pi: unknown` to them.
- Pi's real types (`@earendil-works/pi-coding-agent` 1.5.1, `dist/core/extensions/types.d.ts`): `ExtensionContext`
  (line 233), `ExtensionAPI` (line 1228), `ExtensionFactory` (line 1563). They import `@earendil-works/pi-ai`,
  `@earendil-works/pi-agent-core`, `@earendil-works/pi-tui`, `typebox` and, through them, SDKs of other providers;
  `adrian-rebuild/input/vendor/` holds the first three Pi packages only (`pi-coding-agent`, `pi-ai`,
  `pi-agent-core`, each under `<name>/package/`). So the contract compiles with `skipLibCheck`, under which a type from
  an unresolved package becomes `any`; the contract itself must prove that the types it compares are not `any`.
- Pi catches an error a handler throws and emits it as an extension error (`dist/core/extensions/runner.js`, the
  `emitError` calls), so a thrown guard error is reported, not swallowed.
- The repository's `typescript` (a dev dependency) is the compiler the contract uses; `test/structure.test.ts` already
  uses its API for AST scans.

## Change

1. `src/runtime/pi-api.ts` (new), beside the engine profile: the interface `PiApi` with exactly the members the five
   hooks use, the event payloads and the context, as one declaration; type guards for every event and context field
   a hook reads, which return the typed value or throw `BAD_DATA` through `src/boundary.ts`, naming the event and the
   field (D-055 (2)).
2. The five hooks import their types from the adapter and declare none; every handler that reads a field of an event
   or of the context passes it through a guard first.
3. The contract: `test/runtime/pi-contract.ts` (new), a function that takes the root of the Pi type packages as an
   argument (a folder holding `pi-coding-agent/package`, `pi-ai/package`, `pi-agent-core/package`), writes a contract
   file and a `tsconfig` into a temporary folder, with `paths` for the three packages and `skipLibCheck`, compiles it
   with the repository's `typescript` and returns the diagnostics. The contract file assigns `ExtensionAPI` to
   `PiApi` and `ExtensionContext` to the adapter's context, and asserts at compile time that `ExtensionAPI`,
   `ExtensionContext` and each event payload type it reads are not `any`.
4. Tests (T-29): `test/runtime/pi-api.test.ts` (new; one per guard: the right shape passes, a wrong shape throws
   `BAD_DATA` naming the field) and `test/runtime/pi-contract.test.ts` (new): a fixture of matching types passes; a
   fixture with a mismatching member fails and names it; a fixture missing one of the three packages fails on the
   `any` assertion; the real Pi 1.5.1 types in `adrian-rebuild/input/vendor/` pass when that folder exists, and the test
   is skipped with its reason when it does not (a fresh clone has no `input/`).
5. A scan in `test/structure.test.ts`: no file of `hook/` or `src/` outside `src/runtime/pi-api.ts` declares a type or
   interface with an `on(event` member or named `PiApi`.
6. (D-058) The dead code that Pi 1.5.1 lacks goes: the `before_subagent_spawn` handler of `hook/group-peer.ts` and the
   three `context.agent?.kind === "sub"` checks (`hook/group-peer.ts:54`, `hook/group-peer.ts:69`,
   `src/integrations/coordinator-registration.ts:48`); `CoordinatorSession` in
   `src/integrations/coordinator-registration.ts` takes its fields from the adapter's context type and declares none.

## Out of scope

- The version refusal (T-32 (3), R-049); the job's `engine-error` and the `limen status` warning (R-029, D-055 (2)).
- The JSON-mode events that `src/runtime/stream.ts` parses (data at the boundary, read through R-016's module) and the
  project template `templates/limen-extension.ts`, which stays `pi: unknown` (a change there would reach every project).
- The bridge contract of T-31 (R-038); `seat/deploy.ts`.

## Acceptance

- AC-1: `node --test test/runtime/pi-api.test.ts` → exit 0.
- AC-2: `node --test test/runtime/pi-contract.test.ts` → exit 0.
- AC-3: `node --test test/structure.test.ts` → exit 0.
- AC-4: `git grep -n -E '^type (PiApi|Context|StartEvent|ToolEvent|SettleEvent|Message) ' -- hook` → exit 1 (at HEAD it
  finds thirteen lines in the five hooks).
- AC-5: `node adrian-rebuild/tools/fails-before.mjs` → exit 0; `outcome.md` → `## Fails before` holds its output and
  names each new test that passes at `HEAD` and why.
- AC-6: `node adrian-rebuild/tools/gate.mjs` → exit 0 with `fail 0`.
- AC-7: `npx tsc --noEmit` → exit 0; `npx biome check --error-on-warnings .` → exit 0.
- AC-8: `node adrian-rebuild/tools/check.mjs` → exit 0.
- AC-9 (judgment): the test against the real Pi 1.5.1 types ran and passed on the laptop (not skipped), shown in
  `outcome.md`; no handler reads an event or context field without a guard, and no guard skips silently.

## Migration

none: the hooks keep their behaviour on well-formed events; no file, command or project template changes.

## Risk

- A guard stricter than Pi's real events turns a working hook into an extension error on the seat; step 2.2 checks
  the coordinator's session for extension errors after `/reload`, and the contract compares the guards' types with
  Pi's.
- The contract compiles in a few seconds, which lengthens the gate.

## Rollback

`git revert $(git log --format=%H --grep='^R-017:' adrian-rebuild)`.

## Decisions

- 2026-11-20 D-055 (Adrian): the contract runs as a test on the vendor copy, not on the seat; the guards throw
  `BAD_DATA`, and R-029 records the job's `engine-error` and the warning.
- 2026-11-20 (main session): the adapter lives at `src/runtime/pi-api.ts`, beside `src/runtime/engine.ts`; the contract
  helper and its fixtures live under `test/runtime/`, since D-055 makes it a test, not a seat tool; `skipLibCheck` with
  compile-time "not `any`" assertions, since the full type closure of Pi (provider SDKs) is not vendored.
- 2026-11-20 D-058 (Adrian, answer "a" to the implementer's `BLOCKED`): Pi 1.5.1 has no `before_subagent_spawn` event
  (none of the three vendored packages holds the string; `ExtensionAPI.on`, `types.d.ts:1229-1270`, has no overload
  for it) and no `agent` member of `ExtensionContext` (`types.d.ts:233-275`); under the bridge Claude Code's subagent
  tools are always denied (E-5: "`Agent`, `Task`, `Skill`, `AskUserQuestion` and other Claude Code tools are always
  denied"). So R-017 removes that dead code rather than declaring it (Change 6), and the adapter declares only what Pi
  1.5.1 has. Behaviour on Pi 1.5.1 is unchanged. The implementer's other three alignments with Pi's types stand
  without a decision: no `attribution` field in `sendMessage` (Pi copies only `customType`, `content`, `display`,
  `details`), no `await` of `sendMessage` (it returns `void`), and an `async` `registerCommand` handler in
  `hook/wake.ts` (Pi's type is `Promise<void>`).
- 2026-11-20 (main session, review round 1, `review.md`): a correction of the engine fact above. Pi 1.5.1 catches a
  handler's error and emits it as an extension error for every event except `tool_call`: `emitToolCall`
  (`dist/core/extensions/runner.js:965-980`) has no try/catch, and `_beforeToolCall`
  (`dist/core/agent-session.js:386-400`) rethrows the error, which blocks the tool call. Findings to fix:
  - (1) `hook/group-peer.ts` `tool_call`: return before the guard when `LIMEN_GROUP_ID` is not set, so the guard runs
    only inside a group, as the read of `toolName` did at HEAD; a test shows that a malformed `tool_call` outside a
    group throws nothing and that inside a group it throws `BAD_DATA`.
  - (2) T-29 (3): each guard test in `test/runtime/pi-api.test.ts` fails for one reason; split the `tool_result`,
    `message_end`, context and settle tests so that each asserts the refusal its name states.
  - (4) The message-part guard requires `text: string` on a part whose `type` is `"text"` (Pi's `TextContent`,
    `pi-ai/package/dist/types.d.ts:259-262`), with a test.
  - (5) `hook/wake.ts`: the `limen` command's `args` pass through a guard that throws `BAD_DATA` when it is not a
    string, with a test; AC-9 covers every Pi value a handler reads.
  Rejected with reasons in `review.md`: (3) and (6).
- 2026-11-20 (main session, review round 2, `review.md`): fix (2) of round 2: the comment above the `tool_call`
  handler of `hook/group-peer.ts` states the cost exactly: inside a group a payload of the wrong shape blocks every
  tool call of the member (Pi rethrows), not only `task`; outside a group the handler reads nothing. Finding (1) is
  rejected, (3) and (4) are the main session's (`## Fails before`; D-059 committed on its own as `911f8ae`).
