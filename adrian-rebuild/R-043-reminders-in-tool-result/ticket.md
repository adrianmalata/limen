<!-- PL: Ticket R-043 (A-041, H-12): przypomnienia „just in time” niosą sam tekst reguł w wyniku narzędzia, które je
wywołało, zamiast prosić model o kolejny odczyt pliku; raz na obszar, ponownie po kompakcji, z dzisiejszym limitem
1000 linii. Przypomnienie o wizji przychodzi przy tworzeniu albo edycji ticketu w `spec/features/planned/`, a nie po
`limen spawn` czy `git merge`; atrapa silnika dostaje słowa `edit` i `write`, żeby test widział tekst w wiadomości
`tool` widoku modelu. Stan: napisany 26.11 przy `aa721d7` z inwentarza `evidence/inventories/R-043.md`; zamknięty
27.11 (krok 2 w Decision 11, AC-9 zawężone do `CONTRIBUTING.md`; `BLOCKED` o `structuredContent` rozstrzygnięty przez
T-32 w Decision 12; poprawki rund 1–2 w Decisions 14 i 16; porażka testu wake po D-133 w Decision 15). -->

# R-043 Just-in-time reminders arrive in the triggering tool result

## Problem

A-041 (`audit.md:1067-1079`), evidence quoted: "`const ask = \`make your next tool call a read of ${shown} lines
${lineList(sections)}\`;` and `const again = "even if an earlier copy is in your context";` — for styleguide sections
(after any non-`.md` write), the register's Specs section (after a `spec/` edit) and the vision (after `limen spawn` or
`git merge`), all of which the same hook already puts in the system prompt". Its Decision, quoted (the same in
`input/gate-2-decisions.md:211`): "fix — The just-in-time reminder stays (same triggers, same instruction "check this
edit against these rules"), but the hook appends the section text (bounded) directly to the triggering tool result
instead of forcing another tool call; once per area, again after compaction. It covers rules that need judgment;
deterministic rules are enforced by the project gate as a `Check` (A-031 (6)). The vision reminder triggers on creating
or editing a ticket in `spec/features/planned/`, no longer on `limen spawn` or `git merge` (H-12)."

H-12 (`audit.md:1768`, decision `audit.md:258`): "The vision reminder at `limen spawn` arrives after the job already has
its task"; "**H-12 — fix:** amends A-041 (vision reminder at ticket editing, not after spawn)." Seat step 4.5
(`plan.md:2568`): "An edit of a ticket in `spec/features/planned/` brings the vision reminder inside that tool result
(R-043)."

Rules: T-10 (a bound where the artefact is made), T-25 (1) (one reader per guidance source), T-29 (1) and (6) ("Renaming
happens in the ticket that rewrites the module"), T-30, T-31 (1) (the fake shows what the model sees), T-32 (1) and (4).
Harness rules: z. 3 (variable parts at the end, never an edit of the prefix mid-session), z. 4 (rules again after
compaction), z. 11 (a tool response carries the next step). Gate 2 §5 #4 (`gate-2-decisions.md:278`): "just-in-time
reminders and short cues are deliberate | **agreement**".

Engine facts (quoted from `plan.md` → `## Engine facts`): E-1 (`plan.md:1590`): "Pi custom messages (the per-turn cue,
reminders) all arrive as `user`"; its consequence (`plan.md:1616-1617`): "only tool results have another role". E-5
(`plan.md:1594`): Pi's tools reach Claude as `mcp__custom-tools__<name>`.

Pi 1.5.1 (vendor copy, inventory section 2): a `tool_result` handler may return `{ content, structuredContent?, … }`;
"replacing `content` without returning `structuredContent` drops the structured content" (`pi-coding-agent:
dist/core/extensions/types.d.ts:1129-1140`); each handler's `content` replaces the current one in load order
(`dist/core/extensions/runner.js:918-924`), and the `toolResult` message is built from it (`pi-agent-core:
dist/agent-loop.js:607-676`). A blocked call skips `tool_result` (`agent-loop.js:392-398`). `bash` and `read` declare an
output schema, `edit` and `write` do not (`dist/core/tools/*.js`). Under the bridge the result goes back to Claude Code's
waiting tool call (`evidence/engine-sources/bridge-5.0.3.md:115-118`), and Claude's `file_path` is renamed to Pi's
`path` (`:135`).

Facts at `aa721d7` (inventory sections 1, 3, 4):
1. The reminder already rides the tool result (`hook/communication.ts:132`), but its text is a forced read: "make your
   next tool call a read of <file> lines <ranges> … even if an earlier copy is in your context" (`:528-545`).
2. Triggers (`:335-392`): `write`/`edit` under `spec/` gives `specs`; a non-`.md` path outside `spec/` gives `style`;
   `vision` fires on a Bash `limen spawn`, on `git merge` outside a job, and on `mkdir|cp|mv|touch|install` with
   `spec/features/planned/`, never on a `write` or `edit` of a planned ticket.
3. Memory: per process, read ranges and named sections, cleared at `session_start` and `session_compact` (`:103-109`);
   once per area by the key `${kind}:${section.start}:${section.title}` (`:436-453`); a read of a guidance file ends the
   ask (`:394-433`).
4. The touch line "Last turn started or merged work." (`:353-355`) exists only for the spawn and merge trigger.
5. Tests: `test/u13-guidance-reminder.test.ts` (one test, written against the forced-read sentence); no test of the
   vision reminder; the fake fires no `tool_result` (R-038 adds `tool_call` and `tool_result` around its Bash-only
   `tool` word, R-038 `ticket.md` → `## Change` 2).
6. Text that becomes false: `templates/communication.md:126` ("the hook asks the agent to read the `## Specs` section
   above by its line numbers"; A-038 moves this maintainer note, so it may be in `docs/` after R-040); the comments
   `hook/communication.ts:40`, `:44`, `:383`, `:394`, `:416-419`, `:435`. `docs/setup.md:181` and `CONTRIBUTING.md:29`
   are rewritten by R-039 first (its `## Change` 9).

## Change

1. `hook/communication.ts`, the reminder (in the `tool_result` handler, `:110-134` at `aa721d7`):
   - Text: one header line `[limen] <Vision|Specs|Styleguide> (<path> lines <ranges>): check this edit against <it|these
     rules>.`, then the text of the applying sections, appended to the last text part as today (`:581-590`); no request
     to read, no "even if an earlier copy". The text is bounded by today's 1,000 lines with its notice (`:19`,
     `:269-280`; T-10 until R-046 and R-086).
   - Source: each part is read through the same reader that `src/runtime/context-message.ts` (R-039) uses for that part,
     at the moment the tool result is built (T-25 (1)); a missing file gives no reminder.
   - Triggers: `specs` and `style` as today (fact 2); the Specs reminder goes only to the roles whose context message
     holds the specs register (R-040's audience rule, A-038; every role, as today, if R-040 is not done). `vision`
     fires on a `write` or `edit` of a path under `spec/features/planned/`, on a Bash command that creates there
     (today's `mkdir|cp|mv|touch|install` pattern) and on a Bash `limen ticket new` without `--lane active` (it writes
     `spec/features/planned/FNNN-…/ticket.md`, `src/project/ticket-folders.ts:42-80`), in the coordinator and in jobs;
     never on `limen spawn` or `git merge` (H-12).
   - Memory: once per area until `session_compact` (or a new `session_start`), then again; the read memory
     (`noteRead`, `readRanges`, `isRead`, `GUIDANCE.pattern`) goes, since it existed to end the forced read.
   - On a Bash result the handler returns the event's `structuredContent` with the new content, so the reminder drops
     nothing (`types.d.ts:1129-1133`); `src/runtime/pi-api.ts` declares `structuredContent` on `PiToolResultEvent` and
     `PiToolResultPatch` with its guard, and `test/runtime/pi-contract.test.ts` checks it against Pi 1.5.1's types.
   - An `isError` result gets nothing, as today.
2. The touch line's "Last turn started or merged work." form goes with its trigger; the "Last turn edited/wrote
   <paths>." form stays (R-041 sets the cue's words).
3. `test/fake-engine.mjs` (after R-038): new words `edit <path>` and `write <path>` that fire `tool_call` and
   `tool_result` with Pi's tool name and `{ path }`, and write the file, so the model view (`fake-view.jsonl`) shows the
   result the hooks return in the next call; existing words unchanged.
4. Tests, each failing at HEAD (T-29):
   - `test/hook/communication.test.ts`: an `edit` and a `write` of `spec/features/planned/F001-x/ticket.md` append the
     vision text with the header, in a coordinator and in a job; `limen ticket new` (planned) does too; `limen spawn` and
     `git merge` Bash results get no vision; once per area until `session_compact`, then again; the style reminder
     holds the applying sections' text (scoped headings as u13's fixture) and no read request; the specs reminder holds
     the `## Specs` section, only for a role that gets the specs register; an `isError` result gets nothing; the text
     is bounded with its notice; a Bash result keeps its `structuredContent`. The cases of
     `test/u13-guidance-reminder.test.ts` that still hold move here, and the file goes: `git rm` of
     `test/u13-guidance-reminder.test.ts` (T-29 (6)).
   - `test/cli/spawn.test.ts`: a worker job scripted `edit spec/features/planned/F001-x/ticket.md`; in its
     `fake-view.jsonl` the call after the edit holds a marker of the fixture's `spec/vision.md` inside a message of
     role `tool`, and in no `user` message (a job's context message holds no vision, R-039 `## Change` 1, so the marker
     can come only from the reminder).
   - `test/fake-engine.test.ts`: the `edit` and `write` words fire `tool_call` and `tool_result` with `{ path }`, and a
     returned content replaces the result in the next call's view.
   - `test/runtime/pi-api.test.ts`: the `tool_result` guard keeps `structuredContent` and refuses a non-object one.
5. Text (T-30, A-085): the sentence of fact 6 (in `templates/communication.md` or where R-040 moved it) says that the
   hook appends the section text to the tool result; the comments of fact 6 follow; `docs/setup.md` → Hooks and
   `CONTRIBUTING.md` (as R-039 leaves them) name the vision reminder at a planned ticket.

## Out of scope

- Which styleguide rules need judgment, and the deterministic ones as the project gate's `Check` (A-031 (6)).
- The cue's words and its touch line (R-041); module text (R-044); tools per role (R-045: a read-only role has no
  `edit` or `write`, so it gets no edit reminder); literal role text and budgets (R-046, R-086).
- R-110's in-session `changed <file>` notices: R-043 appends a file's current text; R-110 tells that a file changed since
  the frozen message.
- What the bridge and Claude Code make of a long tool result (a cap, `isError`, images): seat step 4.5.

## Acceptance

- AC-1: `node --test test/hook/communication.test.ts` → exit 0.
- AC-2: `node --test test/cli/spawn.test.ts` → exit 0.
- AC-3: `node --test test/fake-engine.test.ts` → exit 0.
- AC-4: `node --test test/runtime/pi-api.test.ts` → exit 0; `node --test test/runtime/pi-contract.test.ts` → exit 0.
- AC-5: `node adrian-rebuild/tools/fails-before.mjs test/hook/communication.test.ts test/cli/spawn.test.ts
  test/fake-engine.test.ts test/runtime/pi-api.test.ts` → exit 0, its output in `outcome.md` → `## Fails before`.
- AC-6: `git grep -q 'make your next tool call' -- hook/communication.ts` → exit 1.
- AC-7: `git grep -q 'even if an earlier copy is in your context' -- hook/communication.ts` → exit 1.
- AC-8: `git grep -q 'started or merged work' -- hook/communication.ts` → exit 1.
- AC-9: `git grep -q 'asks the agent to read' -- CONTRIBUTING.md` → exit 1 (pathspec confined by Decision 11).
- AC-10: `git ls-files -- test/u13-guidance-reminder.test.ts | grep -q .` → exit 1.
- AC-11: `node adrian-rebuild/tools/gate.mjs` → exit 0.
- AC-12: `npx biome check --error-on-warnings .` → exit 0; `node adrian-rebuild/tools/check.mjs` → exit 0.
- AC-13 (judgment): the vision reminder fires on creating or editing a ticket in `spec/features/planned/` and never on
  `limen spawn` or `git merge`; every reminder carries the bounded section text and asks for no read; once per area
  until a compaction; the text and comments of `## Change` 5 say what the code does.

## Migration

None: the memory is in-process; no `.limen/` file, project file, CLI form or hook list changes, and guidance files are
only read (inventory section 5).

## Risk

- A long styleguide section makes a tool result long (up to the 1,000-line bound); whether Claude Code caps an MCP tool
  result is seat step 4.5's to show.
- R-042 edits the same `tool_result` handler (its task-note recording); the implementer re-reads the hook at HEAD
  (D-025).

## Rollback

`git revert $(git log --format=%H --grep='^R-043:' adrian-rebuild --)`. Nothing on disk to undo.

## Decisions

Settled by the documents when the ticket was written (2026-11-26, the main session's reading, not a night default; the
inventory's questions in `evidence/inventories/R-043.md` → section 8):
1. What creates or edits a planned ticket (Q1 (b)): A-041 names creation, and `limen ticket new` is how a ticket is
   created; the spawn and merge triggers go (A-041, H-12).
2. The read memory goes (Q2 (a)): A-041's rule is "once per area, again after compaction".
3. The bound is today's 1,000 lines (Q3 (a)), as R-039 keeps it for the same texts until R-046 and R-086.
4. The text (Q4): A-041's "check this edit against these rules", after one header line naming the file and lines.
5. One reader per guidance source (Q5 (b)): T-25 (1), so R-040's registers and R-054's published copy change both.
6. Both sessions get the vision reminder (Q6), as A-041 names none; the Specs audience is R-040's (A-038).
7. The "started or merged work" touch line goes with its trigger (Q7).
8. The fake's `edit` and `write` words (Q8 (a)): T-31 (1) and step 4.5 need the model view.
9. u13's cases move into the hook's test file (Q9): T-29 (6).
10. `structuredContent` is passed through on a Bash result: Pi drops it otherwise (`types.d.ts:1129-1133`), and a hook
    that silently drops a tool's output is a defect, not a choice.
11. 2026-11-27 protocol step 2 at `356807f` (the main session, by day; D-025): the places of the facts after R-038,
    R-039, R-040, R-042 and R-111. The `tool_result` handler is at `hook/communication.ts:106-127` (R-042 removed the
    note's recording from it; `appendText` at `:549`); the forced-read text is `reminderText` (`:496-515`); the triggers
    are `guidanceAsks` (`:300-314`) and `isVisionCommand` (`:349-357`); the read memory is `noteRead` (`:360`),
    `readRanges` (`:385`), `isRead` (`:487`) and `GUIDANCE` (`:59`), cleared by the `forget` callback of R-039's
    `deliverContext` (`:102-105`, `:135`) at `session_start` and after a compaction; the touch line is `touchLine`
    (`:316-322`). The 1,000-line bound is `MAX_CONTEXT_LINES` of `src/runtime/context-message.ts`, whose readers
    (`markdownSection`, `trimmedLines`, `packageText`, `STYLE_FILE`, `VISION_FILE`, `SPECS_REGISTER`) are the ones
    `## Change` 1 means. Fact 6's sentence is now in `CONTRIBUTING.md` ("After a write or an edit under `spec/`, the
    hook asks the agent to read the `## Specs` section of `templates/registers/specs.md` by its line numbers", moved
    there by R-040), and the hook's header comment says the same at `:68-70`. The fake has no `edit` or `write` word
    yet. AC-9 (`-- templates docs`) already exited 1 at `HEAD`, so it is confined to `CONTRIBUTING.md`, which
    `## Change` 5 names: it exits 0 at `HEAD` and expects 1. AC-6–AC-8 exit 0 at `HEAD` and expect 1, and AC-10
    lists the file at `HEAD`; every match of AC-6–AC-9 is a line the ticket removes or rewrites.
12. 2026-11-27 the implementer's `BLOCKED` (the main session's reading, settled by T-32, not a question for Adrian):
    Pi 1.5.1's `read` tool gives a string as `structuredContent` (`dist/core/tools/read.js:26-29`, `:53-57`, `:294` of
    the vendor copy; `bash` gives an object), and Pi declares the field `JsonValue` (`dist/core/extensions/types.d.ts:1017`,
    `:1137`). `## Change` 4's "refuses a non-object one" would fail every text `read` in a job, against T-32 (the adapter
    follows Pi's real types; (4) refuses only an unexpected shape) and Decision 10. So the `tool_result` guard accepts any
    JSON value as `JsonValue` declares it (null, a boolean, a finite number, a string, an array of these, a plain object
    of these) and refuses anything else with `BAD_DATA` naming `structuredContent`; the adapter declares a
    `JsonValue`-equivalent type, as the contract needs. Change 4's `pi-api.test.ts` item reads: the guard keeps bash's
    object and read's string and refuses a value that is no JSON value.
13. 2026-11-27 the implementer's open points, accepted by the main session as readings of `## Change` 1 and 2:
    (a) `src/runtime/context-message.ts` exports the project-file read, the 1,000-line bound with its notice and the
    specs audience predicate, so the reminder reads through the same reader (T-25 (1)); the context message's bytes do
    not change; the file joins `## Change`. (b) `test/runtime/pi-contract.ts` checks that Pi's `ToolResultEventResult`
    has `structuredContent`, with a fixture test that names the missing field. (c) Once per area is once per section
    (today's key of fact 3): a reminder appends only the sections not yet appended in this context. (d) The specs
    header names the register as the context message does (`limen/templates/registers/specs.md`, T-18). (e) In a job,
    the specs gating takes the role from the same source the context message's audience uses (one rule, T-25 (1)).
    (f) Only a `write` or `edit` sets the touch line; a Bash vision trigger sets none (Change 2).

Review round 1 (2026-11-27, by day; `review.md` → Round 1): PASS with nine notes. To fix, by the resumed implementer,
then the gate and round 2:
14. F1: the test "a Bash result that brings the vision keeps its structuredContent" asserts the kept
    `structuredContent` alone, not the reminder's text (T-29 (3)).
    F2: the A-038 test is split: the Specs reminder holds the `## Specs` section; the Specs reminder reaches only a
    role whose context message holds the specs register.
    F3: a Bash command that runs `limen` is matched only by the `limen ticket new` rule, never by the creation pattern,
    so a `limen spawn` whose task text holds `touch` and a planned path brings no vision (AC-13); a test. A `git mv` out
    of `planned/` keeps today's pattern (`## Change` 1) and goes to `outcome.md` → Open points.
    F4: a test of the vision on a job's `write`.
    F5: `docs/setup.md` and `CONTRIBUTING.md` say each section comes once until a compaction or a new session start
    (such as `/reload`).
    F6: the comment lines over 120 columns (`test/runtime/pi-contract.ts`, `test/fake-engine.mjs`) are wrapped.
    F7: `test/hook/communication.test.ts` opens with one line on what it tests (T-29 (5)).
15. 2026-11-27 D-133 (Adrian: "rekomendacja"; Q-93, option 1, from the `BLOCKED` of the round-1 fix run): its gate
    exited 1, 1384 of 1385, on "a wake that enters no run is counted unconfirmed …" (`test/hook/wake.test.ts`,
    `ENOTEMPTY` on the `rmdir` of its temporary `home/.limen` in cleanup), a test that executes nothing this ticket
    changes. Measured as in D-063 (2), not rerun for a green result (the main session): 10 of 10 runs of the file alone
    on this tree passed (`node --test test/hook/wake.test.ts`, exit 0, 21/21, 12–13 s each), and 10 of 10 at `HEAD`
    passed (`fails-before.mjs test/hook/wake.test.ts`, exit 1 each, "pass at HEAD"), so the trees do not differ. The
    failure is A-092, fixed in R-112. The gate runs once more; a failure of it is again a D-029 finding.

Review round 2 (2026-11-27, by day; `review.md` → Round 2): PASS with three notes; the last round of fixes:
16. G1: `createsPlannedTicket` takes a command for a `limen` command only when `limen` (or a path ending in `/limen`)
    stands in command position: at the start, or after `;`, `&`, `|` or `(`; so `git -C <dir>/limen mv … planned/…`
    is a creation again; a test that fails before the fix. A compound command that also runs `limen` keeps F3's rule.
    G2: the test of the Specs reminder's text is named after A-041, not A-038.
    G3: `outcome.md` shows the last gate and `fails-before.mjs` runs (the main session, protocol step 7).
