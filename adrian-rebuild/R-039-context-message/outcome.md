<!-- PL: Wynik R-039 (noc 26/27.11, przy `7265f02`): jeden moduł `src/runtime/context-message.ts` składa wiadomość
kontekstową roli z dzisiejszych części, spawn publikuje ją jako `context.md`, kontynuacja niesie plik rodzica bajt w
bajt, wrapper nie startuje silnika bez niego, a hook wysyła ją jako `limen-context` bez tury na starcie sesji i
ponownie po kompakcji, która ją usunęła. `--append-system-prompt`, `LIMEN_PREAMBLE` i `systemPrompt` hooka znikają,
adapter Pi deklaruje nowe pola ze strażnikami, a `context-size.mjs` mierzy wiadomość (M-01). Dwie rundy poprawek bez
zmiany zachowania (F1–F4, G1–G3: podział testów, komentarze, strażnik `session_compact` przed wczesnym powrotem);
recenzje 1–3 PASS, bramka sesji głównej 1333/1333. Wybory nocne są niżej dla Adriana, a uwagi rundy 3 w punktach
otwartych 7–8; plik tymczasowy w `.limen/` checkoutu usuwa Adrian. -->

# R-039 outcome

## Done

1. `src/runtime/context-message.ts`, new: the one module that builds a role's Limen context message.
   `contextMessage(root, audience)` takes the project's root and `{ session: "coordinator" }` or
   `{ session: "job", role, preamble }` (the preamble path that spawn's `resolvePreamble` chose) and returns
   `<limen-context role="…">`, then each part apart by a blank line, then `</limen-context>`. The parts are today's,
   moved unchanged from `hook/communication.ts`: `## Capability (limen/templates/capability.md)` (the frame), then
   `## Shop manual (limen/templates/agents.md)` for the coordinator (none when the project has an `AGENTS.md`, as
   before) or `## Role (<path>)` for a job, then `## Communication (<path>)` (the register above its first `## Cue:`),
   `## Vision (spec/vision.md)` for the coordinator, `## Styleguide (.agents/limen/styleguide.md)`; each part bound to
   1,000 lines with today's notice. No board digest. The role's label is its path in the project, or
   `limen/templates/<role>.md` for the package's template, so no absolute path enters. It reads files only (no process,
   no git). It also exports `CONTEXT_FILE` (`context.md`), the file constants and the pure helpers the hook's cue still
   uses (`capabilitySection`, `markdownSection`, `trimmedLines`, `MAX_CONTEXT_LINES`), so each has one definition.
2. Jobs. `src/job/spawning.ts`: validate builds the message after `resolvePreamble` and holds it in the plan; apply
   publishes it. `src/job/publication.ts`: `NewJob.context` is written as `context.md` in the hidden folder with the
   record, so one rename publishes both and a refused spawn leaves none. `src/job/continuation.ts`: validate still
   resolves the role's preamble (a removed role still refuses), then carries the parent's `context.md` as bytes, or
   builds one when the parent folder has none (`carriedContext`). `src/runtime/wrapper.ts`: a job folder without
   `context.md` ends `failed`, kind `launch`, detail `<jobDir>/context.md is missing, so the engine did not start without
   its context message`, before the engine starts (beside the missing-worktree check).
3. `--append-system-prompt` and the `preamble` slot leave `src/runtime/engine.ts`; `LIMEN_PREAMBLE` leaves
   `src/config.ts`, spawn, continue and the wrapper. The hook returns no `systemPrompt`; `PiStartResult` is
   `{ message }`.
4. `hook/communication.ts`: `deliverContext` registers the delivery. At `session_start` the hook guards the payload
   and the context, reads `ctx.sessionManager.buildContextEntries()` through the adapter: a `limen-context` custom
   message entry there gives the frozen bytes and nothing is sent; otherwise the coordinator's message is built (item
   1) or the job's `context.md` is read, and sent with `pi.sendMessage({ customType: "limen-context", content,
   display: false })`, no options. At `session_compact`, when the compaction-aware entries hold no such entry, the
   frozen bytes are sent again: `{ triggerTurn: false }` between `agent_end` and `agent_settled` unless `willRetry`,
   otherwise no options; `agent_start` closes that window (Pi continues a run with queued messages in a new agent
   loop). Before any `session_start` a compaction sends nothing, after its payload guard (fix round 2, G3). The cue is unchanged (type `limen-project-context`,
   from `before_agent_start`).
5. `src/runtime/pi-api.ts`: `PiSendOptions` (`triggerTurn?`, `deliverAs?` with Pi's three values) for `sendMessage`;
   `session_start` (`reason`, Pi's five) and `session_compact` (`reason`, `willRetry`) in `PiEvents` with guards;
   `agent_start` and `agent_end` handled; `PiSessionManager` with `buildContextEntries()` (the context guard checks
   both methods); `PiContextEntry` and `piContextEntries(place, context)`, the guard of the returned list (a
   `custom_message` entry needs `customType` and `content`, any other entry a `type`). `test/runtime/pi-contract.ts`
   checks the custom message entry's fields against Pi's (`entryFields`). The fake's `sessionManager.buildContextEntries()`
   (`test/fake-engine.mjs`) is `FakeSession.buildContextEntries()` (`test/fake-session.mjs`), as Pi's: the latest
   compaction, its kept entries, then every entry after it; `messages()` now maps that one list.
6. References: `test/runtime/context-message/owner-facing-coordinator.md` (57,339 B), `worker.md` (21,563 B),
   `reviewer.md` (18,486 B), `judge.md` (16,483 B), `keeper.md` (18,842 B), `researcher.md` (16,500 B), `quality.md`
   (16,411 B), `group-team.md` (17,189 B): each the exact message for a project as `limen init` leaves it. The golden
   test writes a missing reference from the module and fails naming it; the references were written so on the first
   run, read (`judge.md` whole, the others' heads), and the test then passed.
7. Tests (item 7 of `## Change`): `test/runtime/context-message.test.ts` new (14: a golden per role, the marker, no
   digest, no absolute path, date or job id, the 1,000-line bound, the same bytes with and without `jg`, no
   `child_process` import); `test/hook/communication.test.ts` (10 new beside its 3, after fix round 2's G3);
   `test/fake-engine.test.ts` (1 new); `test/cli/spawn.test.ts` (5 new; R-038's A-086 test rewritten for the context
   message); `test/cli/continue.test.ts` (3 new, after the fix round's split); `test/runtime/wrapper.test.ts` (2 new);
   `test/s4-steering.test.ts` (its two guidance tests rewritten on the model's view, each with its own system-prompt
   test after fix round 2's G1); `test/u5-engine-stream.test.ts` and `test/config.test.ts` follow the removed slot and
   name; `test/runtime/pi-api.test.ts` (7 new); `test/runtime/pi-contract.test.ts` (fixture with the
   new members, 3 new).
8. `adrian-rebuild/tools/role-context.mjs` and `context-size.mjs` (M-01): the fixture puts a stub `pi` on `PATH`; the
   roles are the ref's `templates/*.md` but the manual, frame, register, styleguide, member packet and Linear mirror;
   a ref with `src/runtime/context-message.ts` gets the columns "Context message" and "Cue" (the message from the ref's
   module with the preamble its `resolvePreamble` chooses), the `finish` tool and the note start as lines, and a
   by-part table of the coordinator's and the first job role's message; an older ref keeps today's columns.
   `adrian-rebuild/tools/test-context-size.mjs`, new (3 tests): the working tree's code committed into a scratch
   repository (each role's message the size of its reference; one row per role template) and `a0.3.0` (today's
   columns, no `scout` or `picture` row), both with no `pi` on `PATH`.
9. Text: `docs/setup.md` (Hooks), `docs/jobs.md` (the job folder's `context.md`, the `launch` kind, continue carrying
   the parent's file), `CONTRIBUTING.md:29`, `templates/agents.md:45`, `templates/communication.md:3`; the comments of
   fact 5 (`hook/communication.ts`'s factory, the removed `LIMEN_PREAMBLE` entry and `preamble` slot,
   `test/s4-steering.test.ts:1-4`). `templates/.history/agents.md` and `communication.md` gain the new head hash
   (`test/structure.test.ts`, "shipped template history").

## Fix round 1 (F1–F4, `ticket.md` → `## Decisions` 15)

Tests and one comment only; no product code changed its behaviour.
- F1, `test/hook/communication.test.ts`: "A-086: no handler of the hook returns a systemPrompt" now fires each handler
  the hook registers, with its payload from `PAYLOADS` (a missing payload fails with "a payload of <name>"), and asserts
  only that no result holds a `systemPrompt`. The exact set of handled events is not kept as a test of its own: the
  sweep covers every registered handler without it, and the E-13 tests already fire `agent_start`, `agent_end` and
  `agent_settled`, failing when the hook lacks one.
- F2, `test/cli/spawn.test.ts`: "A-086: a spawned worker's first model call holds its context message whole and first,
  then its task and the cue, as one prompt" checks only the first call (its one `user` record and the `fresh` path). The
  empty system prompt is dropped there: the wrapper's "A-086: a job's engine starts with no --append-system-prompt in
  its argv", the hook's A-086 test above and `test/s4-steering.test.ts`'s worker test ("… and the system prompt none of
  them", since fix round 2 its own test, "A-086: the system prompt a worker's hooks return holds none of its guidance
  sources") cover it.
- F3, `test/cli/continue.test.ts`: the A-079 test is two. "A-079: a continuation publishes its parent's context.md byte
  for byte, also after the project's register changed" reads the child's `context.md` as `continue` returns, so the
  bytes are the publication's. "a continued job's session holds the one context message its parent's transcript
  brings, and sends no second one" counts the `limen-context` entries of the child's transcript (1).
- F4, `src/runtime/context-message.ts`: the ten-line header is three lines: the local reason (Pi's system prompt never
  reaches the model under the bridge, so Limen's standing text rides this message) with the pointer (A-086, D-114),
  and why it reads files only (T-36).

## Fix round 2 (G1–G3, `ticket.md` → `## Decisions` 16)

Two tests split, one comment cut, one line moved with its test; no other behaviour changed.
- G1, `test/s4-steering.test.ts`: the coordinator test and the worker test are two each.
  - "a second init removes old hook copies, so a coordinator's model gets each guidance source once": the model's view
    (`[1, 1, 1, 0, 1]` for styleguide, register, vision, board, frame) and the old hook copies gone, as before.
  - "A-086: the system prompt a coordinator's hooks return holds none of the guidance sources": the same five markers
    count 0 in the `fake-system.txt` of the coordinator run that the test above made (its folder is kept in the file's
    `coord`, as the worker's id is in `parent`).
  - "a worker's first model call carries register, styleguide, frame and cue once, vision and board pointers, and no
    board body": the model's view only.
  - "A-086: the system prompt a worker's hooks return holds none of its guidance sources": styleguide, register and
    frame count 0 in the worker's `fake-system.txt`.
- G2, `hook/communication.ts`: the doc comment of `deliverContext` is two sentences: the model keeps Limen's standing
  text only while the session's context holds the message, so the hook sends the held bytes at the start and after a
  compaction removed them, with no turn of its own, the options following D-114 (1) and E-13; each handler calls
  `forget` first. E-13's rule is no longer copied.
- G3, `hook/communication.ts`: in the `session_compact` handler, `piEvent("session_compact", raw)` now comes before
  `if (frozen === undefined) return;` (after `forget()`, as in the `session_start` handler). New test in
  `test/hook/communication.test.ts`: "BAD_DATA: a session_compact without willRetry before any session_start is
  refused, naming the field". It fires the handler of a fresh hook with a payload that lacks `willRetry` and expects a
  rejection with a `LimenError` of code `BAD_DATA` whose message names `willRetry`. It runs in a project of its own
  (`inTemporaryProject`), because a coordinator's refusal is kept in the working directory's project.
- Consequence of G3, `test/u13-guidance-reminder.test.ts`: its `call("session_compact")` gave no payload, before any
  `session_start`. Before G3 the handler returned before its guard; now the guard refuses that call. The first gate run
  of this round exited 1. The refusal also left a file in the checkout,
  `.limen/refusals/641201-56581511.json.641201.07e0eca95172d3f4.tmp`, holding `{"event":"session_compact","field":"",
  "message":"Pi event session_compact: expected an object, got nothing",…}`: the test does not await the handler, so
  the forced exit cut the write. The test now gives `{ type: "session_compact", reason: "manual", willRetry: false }`
  (`## Deviations` 12, `## Open points` 6).

## Proof

The main session's runs (protocol steps 4 and 5; they count):
- After the first run: `review-guard.mjs compare --git` → exit 0; `node adrian-rebuild/tools/gate.mjs` → exit 0, 1329
  tests, 1329 pass (306.7 s); `fails-before.mjs` on the seven files of AC-12 → exit 0; `node --test
  adrian-rebuild/tools/test-context-size.mjs` → exit 0, 3/3 (AC-7); AC-8 → exit 0; AC-9–AC-11 as expected; `npx biome
  check --error-on-warnings .` and `check.mjs` → exit 0.
- After fix round 1: `compare --git` → exit 0; `gate.mjs` → exit 0, 1330/1330 (307.0 s); `fails-before.mjs
  test/hook/communication.test.ts test/cli/spawn.test.ts test/cli/continue.test.ts` → exit 0.
- After fix round 2: `compare --git` → exit 0; `gate.mjs` → exit 0, 1333/1333 (309.0 s), no new file in the
  checkout's `.limen/`; `fails-before.mjs test/s4-steering.test.ts test/hook/communication.test.ts
  test/u13-guidance-reminder.test.ts` → exit 0.
- Reviews: rounds 1–3 PASS (`review.md`), each with `review-guard.mjs compare` → "unchanged" and `review-verdict.mjs`
  → "consistent".

The implementer's runs, in fix round 2, after its last edit:
- `node --test test/hook/communication.test.ts` → exit 0, 13/13 (AC-2).
- `node --test test/s4-steering.test.ts` → exit 0, 6/6; `node --test test/u13-guidance-reminder.test.ts` → exit 0, 1/1
  (AC-5's steering file).
- `node adrian-rebuild/tools/fails-before.mjs test/s4-steering.test.ts` → exit 0; `… test/hook/communication.test.ts` →
  exit 0 (`## Fails before`).
- `node adrian-rebuild/tools/gate.mjs` → exit 0: 1333 tests, 1333 pass, 0 fail, 0 cancelled, 0 skipped, 307.8 s, no
  `gate:` line (AC-13; three tests more than round 1's 1330: two from G1's split, one from G3). The round's first gate
  run, before the u13 change, exited 1. Its captured output was cut in the middle and showed no summary, so I could not
  see which tests failed. The one cause found is u13's payload (above), proven by the content of the file it left. That
  run left the file, and D-105's check counts a new ignored file as a failure.
- `node adrian-rebuild/tools/check.mjs` → exit 0, 0 errors; `npx biome check --error-on-warnings .` → exit 0 (289
  files); `npx biome check --error-on-warnings adrian-rebuild` → exit 0 (36 files) (AC-14), after that gate run.
- `git grep -c -e 'systemPrompt' -e 'limen-context"' -- hook/communication.ts` → `hook/communication.ts:1` (the
  constant): AC-10 still exits 1 and AC-11 0 after G2's comment.

Fix round 1, after its last edit:
- `node --test test/hook/communication.test.ts` → exit 0, 12/12 (AC-2).
- `node --test test/cli/spawn.test.ts` → exit 0, 27/27; `node --test test/cli/continue.test.ts` → exit 0, 17/17 (AC-4).
- `node adrian-rebuild/tools/fails-before.mjs test/cli/continue.test.ts` → exit 0; `… test/cli/spawn.test.ts` → exit 0;
  `… test/hook/communication.test.ts` → exit 0 (`## Fails before`).
- `node --test adrian-rebuild/tools/test-context-size.mjs` → exit 0, 3/3 (AC-7; the module's comment changed).
- `npx biome check --error-on-warnings .` → exit 0 (289 files); `node adrian-rebuild/tools/check.mjs` → exit 0,
  0 errors (AC-14).
- `node adrian-rebuild/tools/gate.mjs` → exit 0: 1330 tests, 1330 pass, 0 fail, 0 cancelled, 0 skipped, 305.8 s
  (AC-13; one test more than the first run's 1329, from F3's split).

From the first run, before the fix rounds (which changed none of the files these run but the module's comment, the
hook's and the steering file, and whose gate runs above cover every file under `test/`):
- `node --test test/runtime/context-message.test.ts` → exit 0, 14/14 (AC-1).
- `node --test test/fake-engine.test.ts` → exit 0, 24/24 (AC-3).
- `node --test test/runtime/wrapper.test.ts` → exit 0, 29/29; `test/s4-steering.test.ts` → 4/4;
  `test/u5-engine-stream.test.ts` → 3/3; `test/config.test.ts` → 17/17, each exit 0 (AC-5).
- `node --test test/runtime/pi-api.test.ts` → exit 0, 36/36; `node --test test/runtime/pi-contract.test.ts` → exit 0,
  11/11, the real Pi 1.5.1 types of the vendor copy included (AC-6).
- `node adrian-rebuild/tools/context-size.mjs a0.3.0 --out node_modules/.rebuild-review/context-size-a0.3.0.md` →
  exit 0, "wrote …: 275 files" (AC-8).
- `git grep -c -e 'append-system-prompt' -e 'LIMEN_PREAMBLE' -e 'systemPrompt' -e 'limen-context"' -e
  'buildContextEntries' -- src/runtime/engine.ts src/config.ts src/job/spawning.ts src/job/continuation.ts
  src/runtime/wrapper.ts hook/communication.ts src/runtime/pi-api.ts` → `hook/communication.ts:1`
  (`const CONTEXT_TYPE = "limen-context";`) and `src/runtime/pi-api.ts:7`: so AC-9 and AC-10 exit 1 and AC-11 exits 0.
  (The tool shows no exit code for a `git grep` that finds nothing, hence the count.)
- `node adrian-rebuild/tools/fails-before.mjs test/runtime/context-message.test.ts test/hook/communication.test.ts
  test/fake-engine.test.ts test/cli/spawn.test.ts test/cli/continue.test.ts test/runtime/wrapper.test.ts
  test/s4-steering.test.ts` → exit 0 (AC-12; `## Fails before`).
- `node adrian-rebuild/tools/gate.mjs` → exit 0: 1329 tests, 1329 pass, 0 fail, 0 cancelled, 0 skipped, 307.9 s
  (AC-13; the last run, after the last edit; the run before it, same tree but comment wrapping, 1329/1329, 302.4 s).
- `npx biome check --error-on-warnings .` → exit 0 (289 files); `node adrian-rebuild/tools/check.mjs` → exit 0,
  0 errors (AC-14), both after that gate run.

## Fails before

`node adrian-rebuild/tools/fails-before.mjs <the seven files of AC-12>` → exit 0, "fail at HEAD (exit 1)". What the
copy of HEAD showed, and the runs made before each change:
- `test/hook/communication.test.ts`, run on HEAD's hook before the hook changed: 8 of the 9 new tests failed (no
  `limen-context` send: `actual: []`; no `agent_start` handler: "the hook handles agent_start"); the ninth, "a
  session_compact whose compacted context still holds the context message sends none", passed vacuously, so it now
  also asserts that the start sent the message, and fails at HEAD. Its three earlier tests (T-36 ×2, the seat rules)
  pass at HEAD, as before.
- `test/fake-engine.test.ts`, the new test on HEAD's fake: fails (`seen.jsonl` empty: `buildContextEntries` is not a
  function in HEAD's context). Its other tests pass at HEAD.
- `test/s4-steering.test.ts`: both rewritten tests fail at HEAD on their assertions, e.g. `actual: { viewed: [0, 0, 0,
  0, 0], system: [1, 1, 1, 1, 1] }` against `{ viewed: [1, 1, 1, 0, 1], system: [0, 0, 0, 0, 0] }`, and `[0, 0, 0, 1]`
  against `[1, 1, 1, 1]` for the worker: at HEAD the guidance is in the system prompt and none in the model's view.
- `test/runtime/context-message.test.ts`: the module does not exist at HEAD, so the file fails to load.
- `test/cli/spawn.test.ts`, `test/cli/continue.test.ts`: HEAD publishes no `context.md`, so each new test that reads it
  fails; R-038's A-086 test, rewritten, fails at HEAD on its `system: ""`. The new T-38 test (a refused spawn leaves no
  `context.md`) passes at HEAD by construction, since HEAD writes none (`## Deviations` 8).
- `test/runtime/wrapper.test.ts`: the argv test fails at HEAD (`--append-system-prompt` is in it); the missing-file
  test fails at HEAD on the `rmSync` of a `context.md` that HEAD never writes.

Fix round, each changed file alone, after its last edit:
- `node adrian-rebuild/tools/fails-before.mjs test/cli/continue.test.ts` → exit 0, "fail at HEAD (exit 1)". F3's two
  tests both fail there: "A-079: a continuation publishes its parent's context.md byte for byte, …" on `ENOENT` of the
  child's `context.md` (`continue.test.ts:101`, the read as `continue` returns); "a continued job's session holds the
  one context message …" on `0 !== 1` (`actual: 0, expected: 1`: HEAD's hook sends none, so the copied transcript holds
  none). The migration test fails on the `rmSync` of the parent's `context.md`, as before.
- `node adrian-rebuild/tools/fails-before.mjs test/cli/spawn.test.ts` → exit 0, "fail at HEAD (exit 1)". F2's A-086
  test fails on `ENOENT` of the job's `context.md` (`spawn.test.ts:402`); the two-runs and `compact manual` tests too.
- `node adrian-rebuild/tools/fails-before.mjs test/hook/communication.test.ts` → exit 0, "fail at HEAD (exit 1)": the
  file fails to load there (`ERR_MODULE_NOT_FOUND`, `src/runtime/context-message.ts`). F1's test alone could not be run
  on HEAD's hook in this round (no scratch file outside the repository was allowed); by HEAD's source
  (`git show HEAD:hook/communication.ts`) its `before_agent_start` returns `systemPrompt` whenever the frame text is
  non-empty, which the package's `templates/capability.md` makes so, and F1's test fires that handler, so it fails
  there on `systemPrompt` rather than, as before, on the missing `agent_start` handler. Observed from the source, not
  run.

Fix round 2, each changed file alone, after its last edit:
- `node adrian-rebuild/tools/fails-before.mjs test/s4-steering.test.ts` → exit 0, "fail at HEAD (exit 1)". Its 40-line
  tail shows both worker tests failing there, each on its own assertion: "a worker's first model call carries register,
  styleguide, frame and cue once, …" on `actual: [ 0, 0, 0, 1 ], expected: [ 1, 1, 1, 1 ]` (`s4-steering.test.ts:136`),
  and "A-086: the system prompt a worker's hooks return holds none of its guidance sources" on `actual: [ 1, 1, 1 ],
  expected: [ 0, 0, 0 ]` (`:145`). The coordinator pair failed above that tail. Each of them compares one half of the
  joined assertion that failed at HEAD in the first run with `viewed: [0, 0, 0, 0, 0], system: [1, 1, 1, 1, 1]`, on the
  same fixture and markers. So the view test fails there against `[1, 1, 1, 0, 1]` and the system-prompt test against
  `[0, 0, 0, 0, 0]`. This is observed from that output, not shown in this tail.
- `node adrian-rebuild/tools/fails-before.mjs test/hook/communication.test.ts` → exit 0, "fail at HEAD (exit 1)": the
  file fails to load there (`ERR_MODULE_NOT_FOUND`, `src/runtime/context-message.ts`). G3's test, written first and run
  against the working tree's hook before the guard moved: `node --test --test-name-pattern="BAD_DATA"
  test/hook/communication.test.ts` → exit 1, 0/1, "AssertionError [ERR_ASSERTION]: Missing expected rejection."
  (`actual: undefined`, `communication.test.ts:284`): the handler returned before its guard. At HEAD the handler is
  `recorded(forget)` and checks no payload at all (`git show HEAD:hook/communication.ts`), so the test fails there for
  the same reason. Observed from the source.

## Deviations from the ticket / night defaults (category A of D-054 (2), for Adrian to confirm)

1. The marker's role name of the owner-facing coordinator is `owner-facing coordinator`
   (`<limen-context role="owner-facing coordinator">`); a job's marker names its record's role, so a group team's is
   `role="coordinator"`. The two would otherwise read the same. R-046 sets the marker's words.
2. A job's preamble part is headed `## Role (<path>)`, the path `.agents/limen/<role>.md` for a project's own file or
   `limen/templates/<role>.md` for the package's; before, the preamble had no heading, since it was Pi's appended text.
3. The references are `test/runtime/context-message/<name>.md` named `owner-facing-coordinator.md`, the job roles, and
   `group-team.md`; the fixture is a project as `limen init` leaves it (its styleguide, vision and board copies), the
   same as the plant's, so `spawn.test.ts` and `continue.test.ts` compare `context.md` with `worker.md`. A missing
   reference is written by its test, which then fails naming it: no command with a variable before it is allowed here,
   so a `LIMEN_WRITE_*` knob could not be run; a later ticket regenerates a reference by deleting it and running the
   test.
4. `agent_start` is declared in the adapter and handled by the hook, beyond item 5's list: the window "between
   `agent_end` and `agent_settled`" must close when Pi continues the run in a new agent loop, whose compaction before a
   turn needs the default steer (test "E-13: … in a later agent loop …").
5. `resolvePreamble` stays in `src/job/spawning.ts`, and the module takes the resolved path (`ContextAudience`): the
   module importing spawning would make a cycle (spawning imports the module) and load spawning's dependencies into
   the coordinator's hook, and `test/cli/old-names.test.ts` imports it from there.
6. `PiStartEvent.systemPrompt` and its guard stay: the hook no longer reads it, but without one required common field
   TypeScript's weak-type check rejects Pi's `BeforeAgentStartCustomEvent` (the contract failed so); the ticket names
   only `PiStartResult.systemPrompt`.
7. Files the ticket does not name, changed as consequences: `test/hook/wake.test.ts` (two context fixtures gain
   `buildContextEntries`, since the session-manager guard now checks it), `test/u13-guidance-reminder.test.ts` (its
   stub `pi` gains `sendMessage`, now in the hook's parameter type), `test/runtime/pi-contract.ts` (the
   `entryFields` check), `templates/.history/agents.md` and `communication.md` (head hash), and `docs/jobs.md`'s
   failure-kind row (`launch` names a job folder without `context.md`).
8. "a refused spawn leaves none" is its own test ("T-38: a spawn refused after its context message was built leaves
   no context.md", a `BRANCH_MISSING` review, which validate refuses after it built the message); it passes at HEAD by
   construction, and the other new tests of the file fail there. T-29 (3) keeps it apart.
9. The wrapper checks `context.md` beside the worktree check, after setup, so a `--prepare` runs before such a job
   fails; the check names the file in the job's terminal log line.
10. The continuation carries the parent's file as bytes (`readFileSync` with no encoding) and builds one only when the
    file does not exist; an unreadable file is an error, not a rebuild.
11. The two-runs and `compact manual` tests in `spawn.test.ts` make the second run with `limen steer` while the job's
    task waits at `block`: the steer's run is the first call, the task's the second.
12. Fix round 2 also changed `test/u13-guidance-reminder.test.ts`, which `## Decisions` 16 does not name. Its
    compaction now gives a payload with Pi's `type`, `reason` and `willRetry` instead of none. G3's guard refuses an
    empty payload, so the old call failed the gate and wrote a refusal into the checkout. No product behaviour changes;
    the test still checks that a compaction makes the reminders start over.

## Unmeasured

- M-02 (one raw request per role, `CLAUDE_BRIDGE_DEBUG=1`, seat 4.8) and seat step 4.2 (the message whole and first in
  the request, for the coordinator's ~57 KB too, no leading `/`, sent again after a manual `/compact`): unmeasured.
- M-04 (coordinator cache write in the turn after a land, 9.1, with R-110): unmeasured.
- M-05 (same-task pass^k, 4.8): unmeasured.
- M-01: "before" at `a0.3.0` is `node_modules/.rebuild-review/context-size-a0.3.0.md` (coordinator system block
  57,539 B ≈14,385; a job's block 15,152 B plus its preamble, worker 6,325 B). "After", on the working tree: the
  coordinator's message 57,339 B ≈14,335, the worker's 21,563 B ≈5,391 (the references' sizes above); the main session
  records M-01 at the close of stage 4.

## Open points

1. In a coordinator session the stub loads `wake` before `communication`, and the wake hook's `session_start` sweeps
   at once. Pi starts a run from `sendUserMessage` only after it awaits `_preparePrompt`, so the communication hook's
   send, one handler later, should still find the session idle and append the message first; no test runs a
   coordinator start with an owed wake on Pi itself. Seat step 4.2 could include one; if the wake comes first, the
   message lands as a steer in the wake's request.
2. `limen stats` takes every `custom_message` entry as a run's start (`src/job/usage.ts`, `startsRun`), the context
   message and its re-sends included; M-04's "turn after a land" can move by one when a compaction re-sent the message
   between. Not changed here.
3. The module imports `src/project/inherit.ts` (`inheritFile`, `readOptional`, `packageRoot`), which imports
   `child_process` for `listDrift`'s git; the module starts no process, and its test checks its own imports. R-040 cuts
   the drift.
4. The literal `"templates/agents.md"` moved from `hook/communication.ts` into `src/runtime/context-message.ts`
   (`MANUAL_FILE`), so R-040's D-025 criterion `git grep -q '"templates/agents.md"' -- src hook` now meets the module.
5. The Gate 2 G2 risk stays as the ticket says: a job can rewrite its own `context.md`, which a continuation carries;
   the running session re-sends the bytes it holds.
6. Fix round 2's first gate run left `.limen/refusals/641201-56581511.json.641201.07e0eca95172d3f4.tmp` in the
   checkout, in a `.limen/` folder that did not exist before (u13's refused compaction, `## Fix round 2`). Git ignores
   it and no test reads the checkout's `.limen/`. Later gate runs list it as there before the run, so it fails none of
   them: the second run passed. `rm` is denied to every session, so Adrian deletes the checkout's `.limen/` folder.
   Some test still runs the hook with the checkout as its working directory (u13 does). When such a test makes a
   handler refuse without awaiting it, the refusal is written into the checkout. The gate's D-105 check caught it here.
   That run's output was cut before its summary, so a second failing test in it cannot be ruled out; the main session's
   three later gate runs passed in full.
7. Review round 3, note 1 (proven): the doc comment of `deliverContext` ends "Each handler calls `forget` first", but
   only its `session_start` and `session_compact` handlers do (`hook/communication.ts:144` against `:154`, `:169`,
   `:186-203`). The rounds of fixes are spent, so it goes to R-110, which adds the next handlers to this file (D-092;
   `plan.md` → `## Tickets`, the note on R-110).
8. Review round 3, note 2: in `test/s4-steering.test.ts` the coordinator's system-prompt test reads the folder of the
   run the view test before it makes (the file-level `coord`, as the worker pair shares `parent`), so run alone or after
   that test fails early it fails on a missing file instead of on its assertion. For R-083, which renames and rewrites
   the `s<N>-` test files (T-29 (6)).
