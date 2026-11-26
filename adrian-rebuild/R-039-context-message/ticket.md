<!-- PL: Ticket R-039 (A-086, A-037, A-079, A-051, T-36, E-13, E-16, D-114): rdzeń wiadomości kontekstowej Limena.
Jeden moduł składa ją dla roli z dzisiejszych części (rama, instrukcja albo preambuła roli, rejestr, wizja,
styleguide; bez skrótu tablicy), job dostaje ją jako `context.md` w folderze przy publikacji, kontynuacja przenosi
wiadomość rodzica, a hook wysyła ją jako wiadomość własną `limen-context` bez wyzwalania tury na starcie sesji i ponownie
po kompakcji; Limen przestaje dopisywać do system promptu Pi, a `context-size.mjs` mierzy wiadomość (M-01). Powiadomienie
o zmienionych plikach przy kontynuacji, powiadomienia w trakcie sesji i skrót tablicy idą do R-110. Stan: napisany 26.11
przy `445c254` z inwentarza `evidence/inventories/R-039.md`; sprawdzony przy `7265f02` i zrobiony w nocy 26/27.11, z poprawkami recenzji F1–F4 i G1–G3 w `## Decisions` 15–16. -->

# R-039 The Limen context message: one per session, frozen, saved, sent again after compaction

## Problem

A-086's Decision, quoted: "Under bridge 5.0.3 nothing Limen adds to Pi's system prompt reaches the model (§1).
Limen's standing instructions move to the **Limen context message**: at session start the hook sends one message (a Pi
custom message, A-034; the model sees it as `user`), marked as Limen's standing instructions, assembled from the package
and the published copy …, containing per role the capability frame (A-043), the role prompt or coordinator manual, the
registers for that role's audience (A-038), the enabled modules' text (A-040), vision and styleguide where the role gets
them, and the owner decisions in scope (A-034). It is frozen for the session (A-037), saved in the job directory
(A-079), and re-sent after every compaction (z. 4). Limen stops appending to Pi's system prompt."

A-037's Decision: "The Limen context message (A-086) is assembled once at `session_start` and never changes during the
session (coordinator and jobs). The board digest (NOW, NEXT) is not part of it". A-079's Decision: "The Limen context
message of a session … is saved in the job directory; `continue`, `resume --quota` and later group rounds reuse the
parent's saved message, with one appended notice for files changed since." A-051's Decision: "A golden test per role and
mode (detached, continuation): the exact Limen context message (A-086) and the first task message against a reference
file. A second test: with unchanged files the context message is byte-identical across two prompts, it is re-sent after
a compaction, and the board digest appears at the end of the context only after a change."

Plan decisions, quoted:
- D-114 (1): "the Limen context message is a Pi custom message with a `limen-*` type, never a user message; at session
  start it is sent with no trigger while the session is idle, so it is appended before the first prompt and starts no
  turn, and after a compaction it is sent again with no extra turn (E-13); this departs from A-034 revision 4's
  `followUp` with `triggerTurn: true` for the context message only, and the wakes keep A-034's options." (2): "R-039 is
  the core (one module, the frozen and saved message, its sending at session start and after a compaction, the
  goldens); a new ticket R-110 … takes the continuation's reuse of the parent's message with one notice of the files
  changed since (A-079), the in-session `changed <file>` notices (A-037), and the board digest at the end of the context
  only when it changed (A-037, A-051)." (3): "the message starts with a neutral fixed marker (a tag pair, as the cue's,
  with the role name); R-046 sets its words."
- D-005: "jobs run the bridge in isolated mode, so the A-042 fallback applies to them: the project's `AGENTS.md`, if it
  exists, goes into the Limen context message"; the note of `## Tickets`: "R-040 builds the rule from a launcher flag,
  and R-048 turns isolation on, so the file never arrives twice. Neither project has an `AGENTS.md` today".
- The note of `## Tickets`: "R-039: `context-size.mjs` learns to measure the context message in this ticket (M-01)."
- `## Terms` and conventions: "Role prompt text changes in the ticket whose mechanism it describes (A-085: one copy of
  each fact)"; "`Mig. yes`: an on-disk change … comes with a script and a test on a fixture".
- D-079: a record refuses an unknown field; deployment runs with no job, and `/reload` follows at once.
- D-105 (2): every new file a criterion names is named in `## Change`.

Rules: T-09 and T-10 (budgets: R-046 and R-086 set them; until then the 1,000-line bound with its notice stays), T-16
(the context message is a `limen-*` custom message; its timing by D-114 (1)), T-25 (1) (one module), T-29, T-30, T-32
(1) (new Pi API only through `src/runtime/pi-api.ts`, checked by the type contract), T-36 (Check: "a scan: hooks start no
process to detect tools while the context message is built; a golden test that the context message is identical with
and without `jg` on PATH"), T-38 (a refusal leaves no trace).

Engine facts (quoted from `plan.md` → `## Engine facts`):
- E-1: "**Pi's system prompt is not forwarded**, so Limen's role preamble (`--append-system-prompt` …) and the hook's
  system block … never reach the model on the `pi-claude` route. … Pi custom messages … all arrive as `user`".
- E-11: "`before_agent_start` runs once per run …; `sendMessage` custom messages reach the model as `user` (`display:
  false` hides them from the TUI only)".
- E-13: "The hook re-sends the context message on `session_compact`, but no single `sendMessage` option fits every
  trigger: the default (steer) lands in the next request except after a run, where it starts an extra turn; there
  `triggerTurn: false` is right (between `agent_end` and `agent_settled`, `willRetry` false)." The rule of
  `evidence/engine-sources/bridge-5.0.3.md` §9: "Use `triggerTurn: false` when `agent_end` has fired for the current run
  and `agent_settled` has not, unless `willRetry` is true. Otherwise use the default steer. A plain call during manual
  `/compact` appends the message at once."
- E-14: on reuse "consecutive user messages are joined in order with a blank line into one prompt"; "Until settled, the
  context message never starts with `/`."
- E-16: the custom message "is stored with role `custom`, so the session's `user` entries stay Adrian's own".

Pi 1.5.1 (vendor copy `adrian-rebuild/input/vendor/pi-coding-agent/package/dist/`, re-read by the inventory):
- `sendCustomMessage` idle with no trigger appends the message to the session at once and starts no run
  (`core/agent-session.js:1980-1984`); while a run is active, `triggerTurn: false` holds it to the turn's end, and the
  default steers it into the next request (`:1957-1979`).
- In print mode, which jobs run, `session_start` is awaited before `session.prompt(initialMessage)`
  (`modes/print-mode.js:110-112`, `core/agent-session.js:2776`), so a message appended at `session_start` comes before
  the task.
- `session_start` reasons `startup | reload | new | resume | fork` (`core/extensions/types.d.ts:595-601`); `startup`
  also when `--continue` loads a saved session (`core/agent-session.js:226`); `/reload` emits `reload`
  (`:3100-3133`). `session_compact`: `reason`, `willRetry` (`types.d.ts:633-641`). `agent_end` (`:768-771`).
- The context's `sessionManager` includes `buildContextEntries()`, "the active, compaction-aware entry list"
  (`core/session-manager.d.ts:178`, `:323`). The first successful compaction summarises a session-start message
  (`core/compaction/compaction.js:609-648`).

Facts at `445c254` (inventory sections 5–11; no code changed since its `c3bbc5c`):
1. A job's role text goes to `--append-system-prompt` (`src/runtime/engine.ts:103`), from the file `resolvePreamble`
   picks (`src/job/spawning.ts:110-125`), carried through `LIMEN_PREAMBLE` (`src/config.ts:39`;
   `src/job/spawning.ts:697`, `src/job/continuation.ts:608`) and read by the wrapper (`src/runtime/wrapper.ts:51`,
   `:73`). The communication hook rebuilds `guidancePrompt` before every run (`hook/communication.ts:72`, `:146-179`:
   frame, the manual for the coordinator, the register above `## Cue:`, vision for the coordinator, styleguide, and the
   board digest last) and returns it as `systemPrompt` (`:87-90`). The bridge drops both (E-1). Only the cue, a custom
   message of type `limen-project-context` (`:17`, `:79-83`), reaches the model.
2. Nothing is saved; at compaction the hook only clears its reminder memory (`hook/communication.ts:103-109`). A
   continuation copies the parent's transcript (`src/job/continuation.ts:545`, `:569`; `src/job/publication.ts:116-123`)
   and resolves the preamble again from current files (`src/job/continuation.ts:270`).
3. The adapter declares `sendMessage` only with `deliverAs: "followUp"` and `triggerTurn` (`src/runtime/pi-api.ts:154-157`),
   `PiStartResult.systemPrompt` (`:75`), and a `sessionManager` with only `getSessionId` (`:94`, `:304`); no `agent_end`.
4. `adrian-rebuild/tools/context-size.mjs HEAD` exits 1 on this laptop (`MISSING_TOOL`: no `pi` on `PATH` for its
   fixture's `limen init`, `adrian-rebuild/tools/role-context.mjs:25`, `:55`); its role list holds `scout` and `picture`,
   which have no template (`role-context.mjs:13`); its columns describe the system prompt.
5. Product text that the change makes false: `docs/setup.md:179` and `:181`, `CONTRIBUTING.md:29`,
   `templates/agents.md:45`, `templates/communication.md:3`; comments `hook/communication.ts:51-54`, `src/config.ts:39`,
   `src/runtime/engine.ts:22`, `test/s4-steering.test.ts:1-3`. `docs/jobs.md:53` (the job folder) and `:161`
   (continue) lack the saved message.

R-038 gives this ticket the fake's model view (`fake-view.jsonl` per model call, through `src/runtime/bridge-view.ts`),
Pi's `sendMessage` options, `session_start` reasons, the `compact` script word with `session_compact`'s payload, and
`agent_end` before `agent_settled` (R-038 `ticket.md` → `## Change` item 2).

## Change

1. `src/runtime/context-message.ts`, new: the one module that builds a role's Limen context message (T-25 (1)), from the
   package and the project's published files, starting no process and running no git (T-36). It opens with the neutral
   marker of D-114 (3), a tag pair as the cue's with the role name (for example `<limen-context role="worker">` …
   `</limen-context>`), and never starts with `/` (E-14). Its parts are today's, moved unchanged (inventory Q6 (a)):
   the capability frame, the coordinator's manual or the job role's preamble (`resolvePreamble`), the register text
   above the first `## Cue:`, vision for the coordinator, and the styleguide, each with today's `## <Label> (<path>)`
   heading and 1,000-line bound with its notice (T-10 until R-046); no board digest (A-037; R-110 adds it), no job id,
   absolute path, date or git output.
2. Jobs: spawn publishes the job's message as `context.md` in its folder with the job (`src/job/publication.ts`), so a
   refusal leaves none (T-38). A continuation (`limen continue`, `resume --quota`, group rounds) carries the parent's
   `context.md` byte for byte, beside the transcript it copies; for a parent folder that has none (published before this
   ticket) it builds one at its own publication. The wrapper refuses to start an engine for a job folder without
   `context.md`: the job fails with the kind `launch` and a line naming the file.
3. `--append-system-prompt` and `LIMEN_PREAMBLE` go (`src/runtime/engine.ts`, `src/config.ts`, `src/job/spawning.ts`,
   `src/job/continuation.ts`, `src/runtime/wrapper.ts`); the communication hook no longer returns `systemPrompt`, and
   `PiStartResult.systemPrompt` leaves the adapter.
4. `hook/communication.ts` delivers the message (D-114 (1)), as a custom message of type `limen-context` with `display:
   false`, never with `sendUserMessage`:
   - The session's frozen bytes are the message it holds: at every `session_start` the hook takes the content of the
     `limen-context` entry in `ctx.sessionManager.buildContextEntries()` when there is one, and otherwise builds the
     coordinator's message with item 1 or reads the job's `context.md`, and sends it with no options while idle, so it
     is appended before the first prompt and starts no turn. So a `/reload` (step 0.3) or a continuation whose copied
     transcript holds one sends none.
   - On `session_compact`, when the compaction-aware context no longer holds a `limen-context` entry, it sends the
     frozen bytes again: with `triggerTurn: false` between `agent_end` and `agent_settled` unless `willRetry`, otherwise
     with no options (E-13).
   - The cue stays as it is (R-041 changes it), still a `before_agent_start` message.
5. `src/runtime/pi-api.ts` declares, each with its guard (T-32 (1), (4)): `sendMessage`'s optional `triggerTurn` and
   `deliverAs` as Pi's (`types.d.ts:350-353`), `session_start`'s `reason`, `session_compact`'s `reason` and `willRetry`,
   `agent_end`, and `sessionManager.buildContextEntries()` with the fields of a custom message entry the hook reads;
   `test/runtime/pi-contract.test.ts` checks them against Pi 1.5.1's types. The fake engine's `sessionManager` gains
   `buildContextEntries()` over its Pi-shaped transcript (R-038), as Pi's.
6. Goldens (A-051, mode detached; the continuation mode is R-110's): committed reference files, one per role
   (owner-facing coordinator, worker, reviewer, judge, keeper, researcher, quality, group team) under
   `test/runtime/context-message/`, each the exact message for a fixed fixture project; every later ticket that changes a
   part's text updates its reference file.
7. Tests, each failing at HEAD (T-29):
   - `test/runtime/context-message.test.ts`, new: the golden per role; the marker first and no leading `/`; no digest,
     no absolute path, id or date; the same bytes with and without `jg` on `PATH` (T-36); no `child_process` import.
   - `test/hook/communication.test.ts`: one `limen-context` message at `session_start`, idle, no options and no run; no
     `systemPrompt` from any handler; none at a `reload` whose context holds one, its bytes kept; sent again after a
     `session_compact` that summarised it, with each option of item 4; none when the compacted context still holds one.
   - `test/fake-engine.test.ts`: the fake's `buildContextEntries()` returns the compaction-aware entries as Pi's (a
     custom message entry from before a `compact` is gone after it, one sent after it is there).
   - `test/cli/spawn.test.ts`: spawn publishes `context.md` equal to the golden of its role for the fixture; a refused
     spawn leaves none; in the fake's model view, the job's first call holds the context message whole and first, then
     the task (E-14); across two runs of one session it is the same bytes, present once; after `compact manual` the next
     call holds it again, once.
   - `test/cli/continue.test.ts`: the child's `context.md` is the parent's byte for byte and its session sends no
     second one; a parent folder without `context.md` (the migration fixture) gets one built at publication.
   - `test/runtime/wrapper.test.ts`: the engine's argv holds no `--append-system-prompt`; a job folder without
     `context.md` fails with the kind `launch`.
   - `test/s4-steering.test.ts`: rewritten where it asserts guidance in `fake-system.txt` (`:68-91`, `:113-122`): each
     guidance source once in the model's view, none in the system prompt the hooks return; `test/u5-engine-stream.test.ts`
     and `test/config.test.ts` follow the removed slot and variable.
   - `test/runtime/pi-api.test.ts` and `test/runtime/pi-contract.test.ts`: the new guards and types.
8. `adrian-rebuild/tools/context-size.mjs` and `adrian-rebuild/tools/role-context.mjs` (M-01): the fixture puts a stub
   `pi` on `PATH`, so a ref after R-020 runs on this laptop; the role list is the templates the ref holds; for a ref
   that has `src/runtime/context-message.ts` it measures each role's context message and cue (columns "Context
   message" and "Cue"), and for an older ref it keeps today's columns. `adrian-rebuild/tools/test-context-size.mjs`,
   new, proves both forms on fixtures (the working tree's code committed into a scratch repository, and an older ref).
9. Docs and text (T-30, A-085): `docs/setup.md:179` and `:181`, `docs/jobs.md:53` and `:161`, `CONTRIBUTING.md:29`,
   `templates/agents.md:45` and `templates/communication.md:3` say that the text rides the context message, once per
   session; the comments of fact 5 follow.

## Out of scope

- R-110 (D-114 (2)): the one notice of the files changed since the parent's message was built (A-079), the in-session
  `changed <file>` notices (A-037), the board digest at the end of the context only when it changed (A-037, A-051's
  second test), and the golden of the continuation mode. Until R-110 the board digest reaches no model, as today under
  the bridge.
- R-040: the three registers, package-only texts, the override and drift cuts, and the project's `AGENTS.md` by a
  launcher flag (D-005); R-044: module text; R-046: the marker's words, literal text, the glossary and the budget test;
  R-086: the budgets; R-041: the cue; R-042: the task note; R-043: reminders in the tool result; R-051: wakes as custom
  messages and the owner-message function; R-072: owner decisions in scope.
- A record field for the message: a job can write its own folder and its record alike (gate 2 G2, accepted risk), so a
  digest in the record adds no protection.
- What the bridge and Claude Code do with the first query (whole and first in the request, a ~57 KB message, a leading
  `/`): seat step 4.2 (item 12).

## Acceptance

- AC-1: `node --test test/runtime/context-message.test.ts` → exit 0.
- AC-2: `node --test test/hook/communication.test.ts` → exit 0.
- AC-3: `node --test test/fake-engine.test.ts` → exit 0.
- AC-4: `node --test test/cli/spawn.test.ts` → exit 0; `node --test test/cli/continue.test.ts` → exit 0.
- AC-5: `node --test test/runtime/wrapper.test.ts` → exit 0; `node --test test/s4-steering.test.ts` → exit 0; `node
  --test test/u5-engine-stream.test.ts` → exit 0; `node --test test/config.test.ts` → exit 0.
- AC-6: `node --test test/runtime/pi-api.test.ts` → exit 0; `node --test test/runtime/pi-contract.test.ts` → exit 0.
- AC-7: `node --test adrian-rebuild/tools/test-context-size.mjs` → exit 0.
- AC-8: `node adrian-rebuild/tools/context-size.mjs a0.3.0 --out node_modules/.rebuild-review/context-size-a0.3.0.md` →
  exit 0 (M-01's "before" of stage 4, without `pi` on `PATH`).
- AC-9: `git grep -q 'append-system-prompt' -- src/runtime/engine.ts` → exit 1; `git grep -q 'LIMEN_PREAMBLE' --
  src/config.ts src/job/spawning.ts src/job/continuation.ts src/runtime/wrapper.ts` → exit 1.
- AC-10: `git grep -q 'systemPrompt' -- hook/communication.ts` → exit 1.
- AC-11: `git grep -q 'limen-context"' -- hook/communication.ts` → exit 0; `git grep -q 'buildContextEntries' --
  src/runtime/pi-api.ts` → exit 0.
- AC-12: `node adrian-rebuild/tools/fails-before.mjs test/runtime/context-message.test.ts test/hook/communication.test.ts
  test/fake-engine.test.ts test/cli/spawn.test.ts test/cli/continue.test.ts test/runtime/wrapper.test.ts
  test/s4-steering.test.ts` → exit 0, its output in `outcome.md` → `## Fails before`.
- AC-13: `node adrian-rebuild/tools/gate.mjs` → exit 0.
- AC-14: `npx biome check --error-on-warnings .` → exit 0; `node adrian-rebuild/tools/check.mjs` → exit 0.
- AC-15 (judgment): no text Limen needs the model to read is appended to Pi's system prompt; the message is built in one
  module, frozen for the session (the bytes a session holds are the bytes it re-sends), sent once at session start with
  no turn and again only after a compaction removed it; the docs and templates of item 9 describe it.

## Migration

- Job folders published before this ticket have no `context.md`. A continuation of such a parent builds one at its
  publication (`test/cli/continue.test.ts`, on a fixture folder without one); a job of such a folder that the start
  queue still holds fails at launch with a line naming the missing file, which the deployment's rule of no running job
  (0.2) and the paused projects (D-113) make unlikely.
- `record.json`, `.limen/` layouts, CLI forms and the projects' hook stubs do not change: the logic stays in
  `hook/communication.ts`, which the stubs import.
- A coordinator session from before a0.4.0 holds no `limen-context` entry, so step 0.3's `/reload` sends one; later
  reloads send none.

## Risk

- The coordinator's message is large (≈57 KB estimated, inventory Unverified 1); whether the bridge and Claude Code
  take it whole and first is seat step 4.2.
- A job can change its own `context.md`, which a continuation carries (gate 2 G2, accepted risk); the running session
  re-sends the bytes it holds, not the file.
- Removing `--append-system-prompt` removes nothing the seat's model received (E-1); on a direct provider route, which
  the seat does not use, the role text now arrives as a user-role message.

## Rollback

`git revert $(git log --format=%H --grep='^R-039:' adrian-rebuild --)`. The `context.md` files of jobs published
meanwhile stay as plain files that the older code does not read; no reverse migration.

## Decisions

Settled by the documents when the ticket was written (2026-11-26, the main session's reading, not a night default; the
inventory's questions in `evidence/inventories/R-039.md` → section 14):
1. Delivery and its options (Q1): D-114 (1), with E-13's rule for the re-send.
2. One module, used by spawn's and continue's publication, by the coordinator's hook and by `context-size.mjs`; a job's
   hook only reads the saved file (Q2 (a)): T-25 (1), T-38.
3. A job's message is `context.md` in its folder, with no record field (Q3 (a) without the field): the field would add no
   protection, as Out of scope says.
4. The presence rule at `session_start` and `session_compact` through `buildContextEntries()` (Q4 (a), Q5 (a)), so
   step 0.3's `/reload` and a continuation get no second copy; the frozen bytes are the ones the session holds.
5. The line against R-110 (D-114 (2); R-110 stays `planned` until this line is set): R-039 carries the parent's
   `context.md` into a continuation, because a newly built message beside the copied transcript would give the child
   two context messages; R-110 adds the one notice of the files changed since, the in-session notices, the digest and
   the continuation golden. For Adrian at gate 5.4.
6. Today's parts move unchanged (Q6 (a)); the digest leaves the frozen part (A-037).
7. The marker: a tag pair with the role name (Q8 (a)): D-114 (3).
8. Committed reference files (Q9 (a)): A-051's "against a reference file".
9. No budget here (Q10): T-09, M-13, R-086, R-046.
10. The fake engine's facts are R-038's (Q11 (a)); this ticket adds only `buildContextEntries()` to the fake's
    `sessionManager`, the first API a hook reads of it.
11. `context-size.mjs` calls the module per role and keeps the old columns for older refs (Q12 (a)).
12. `display: false` (Q13 (a)), as the cue: the model gets it (E-11), and the owner's chat stays clear.
13. A job folder without `context.md` fails at launch with the kind `launch` (D-095) instead of starting an engine with
    no standing instructions: a silent start would be a false success.
14. Checked at `7265f02` (2026-11-26, night run 1, protocol step 2): since `445c254` only R-038's and R-111's files
    changed, none of the places of the facts above; AC-9 and AC-10 exit 0 at `HEAD` (expected 1 after the change), AC-11
    exits 1 (expected 0); every file the criteria name exists except `test/runtime/context-message.test.ts` and
    `adrian-rebuild/tools/test-context-size.mjs`, which `## Change` creates.
15. Review round 1 (2026-11-26, night; `review.md` → Round 1), the findings to fix, each without a change of behaviour:
    - F1: `test/hook/communication.test.ts`, the test "A-086: no handler of the hook returns a systemPrompt" checks only
      that no handler returns a `systemPrompt`; the exact set of handled events, if kept, is its own test (T-29 (3)).
    - F2: `test/cli/spawn.test.ts`, the A-086 test checks one mechanism: the context message whole and first in the
      model's view, then the task; the empty system prompt is a test of its own or left to the wrapper's argv test and
      the hook's test that already cover it (T-29 (3)).
    - F3: `test/cli/continue.test.ts`, the A-079 test is split in two: the child's `context.md` equal to the parent's
      byte for byte at publication, and the continued session sending no second context message (T-29 (3)).
    - F4: the header comment of `src/runtime/context-message.ts` is the local reason in one or two sentences and a
      pointer (A-086, D-114), not a copy of the decisions (T-30 (1)).
    Each split test fails at HEAD as its parent did (`fails-before.mjs` on the changed files).
16. Review round 2 (2026-11-26, night; `review.md` → Round 2), the findings to fix, the last round of fixes:
    - G1: `test/s4-steering.test.ts`, the coordinator test and the worker test each check one mechanism: the guidance
      in the model's view is one test, and the system prompt the hooks return holding none of it is another (T-29 (3)).
    - G2: the doc comment of `deliverContext` in `hook/communication.ts` is the local reason in one or two sentences
      and a pointer to E-13, not a copy of its rule (T-30 (1)).
    - G3: the `session_compact` handler of `hook/communication.ts` guards its payload before any early return, so a
      wrongly shaped payload is refused even before a `session_start` (T-32 (4)); a test in
      `test/hook/communication.test.ts` shows the refusal.
    The tests of G1 and G3 fail at HEAD (`fails-before.mjs` on the changed files).
