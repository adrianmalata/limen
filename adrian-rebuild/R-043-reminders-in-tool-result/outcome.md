<!-- PL: Wynik R-043 (implementer, 27.11, przy `356807f`): przypomnienie w wyniku narzędzia niesie teraz tekst sekcji
wytycznych, które dotyczą zapisu, z jedną linią nagłówka i limitem 1000 linii z notą, zamiast prosić o kolejny odczyt.
Każda sekcja przychodzi raz do kompakcji albo nowego startu sesji; wizja przychodzi przy utworzeniu albo edycji ticketu w
`spec/features/planned/` (`write`, `edit`, `limen ticket new`, polecenie powłoki), a nie po `limen spawn` czy `git merge`.
Strażnik `tool_result` przepuszcza `structuredContent` jako dowolną wartość JSON (Decyzja 12), a atrapa silnika ma słowa
`edit` i `write`. Runda poprawek 1 (Decyzja 14, F1–F7): polecenie `limen` łapie tylko reguła `limen ticket new`, dwa
testy rozdzielone, test zapisu w jobie, dokumentacja o starcie sesji, szerokość komentarzy, jedna linia nagłówka testów.
Bramka po rundzie 1 padła raz na teście haka wake (A-092, D-133). Runda 2 (Decyzja 16): `limen` liczy się tylko
w pozycji polecenia, a test tekstu Specs nosi nazwę A-041. Bramki sesji głównej: 1382/1382, po D-133 1385/1385,
po rundzie 2 1386/1386; `fails-before.mjs` exit 0 po każdej rundzie. Runda 3 PASS, jej dwie uwagi w punktach
otwartych 6 i 7. Stan: zamknięty. -->

# R-043 outcome

## Done

1. `hook/communication.ts`, the `tool_result` handler:
   - Text: one header line `[limen] <Vision|Specs|Styleguide> (<path> lines <ranges>): check this edit against <it|these
     rules>.`, then the text of the applying sections' lines, cut by `boundLines` at 1,000 lines with the context
     message's notice; appended to the last text part as before (`appendText`). No read request, no "even if an earlier
     copy" (AC-6, AC-7).
   - Source (T-25 (1), Decision 13 (a), (d)): `guidance` reads through the context message's readers at the moment the
     result is built: `packageText(SPECS_REGISTER)` named `packageName(SPECS_REGISTER)` (`limen/templates/registers/specs.md`),
     and `projectText(root, STYLE_FILE | VISION_FILE)` of the context root (`LIMEN_CONTEXT_ROOT`, else the cwd), the
     root the spawn builds a job's message from, no longer the worktree's copy first. A missing or empty file gives no
     reminder.
   - Triggers: `specs` and `style` as before. `vision` on a `write` or `edit` of a path under `spec/features/planned/`,
     on a Bash or PowerShell `mkdir|cp|mv|touch|install` naming that folder (today's pattern), and on `limen ticket new`
     without `--lane active` / `--lane=active` (`createsPlannedTicket`), in coordinators and jobs alike. `limen spawn`
     and `git merge` trigger nothing (H-12). A command that runs `limen` is matched only by the `limen ticket new`
     rule, never by the creation pattern, so a spawn whose note names `touch` and a planned path brings no vision
     (round 1, F3; AC-13). `limen` runs only in command position: at the start or after `;`, `&`, `|` or `(`, by its
     name or a path ending in `/limen`, then a subcommand; so `git -C /home/u/limen mv … spec/features/planned/…`
     is a creation (round 2, G1).
   - Specs audience (Decision 13 (e)): `sessionHoldsSpecs` asks `holdsSpecs` (the predicate `contextMessage` now uses)
     with `{ session: "coordinator" }`, or in a job with the role of the job's record, `record?.role || "worker"`: the
     record's `role` is the `plan.role` the spawn built the job's message for (`src/job/spawning.ts`, `publishSpawnedJob`)
     and the role a continuation builds its audience from (`src/job/continuation.ts`: `parent.record.role || "worker"`).
   - Memory (Decision 13 (c)): one `shown` set of section keys (`kind:start:title`), cleared by R-039's `forget` at
     `session_start` and after a compaction; a reminder appends only sections not yet shown. `Recall`, `noteRead`,
     `readRanges`, `isRead`, `REMINDER_KINDS`, `GUIDANCE` and the `packageRoot` import went.
   - `structuredContent`: the handler returns the event's `structuredContent` with the new content when the event has
     one (Decision 10).
   - An `isError` result gets nothing and marks nothing shown.
2. Touch line (Change 2, Decision 13 (f)): `touchLine` returns `Last turn edited|wrote <path>.` for a `write` or `edit`
   under `spec/` or of code, and nothing otherwise; a call without one leaves the previous touch line. "Last turn
   started or merged work." went (AC-8).
3. `src/runtime/context-message.ts` (Decision 13 (a)): exports `holdsSpecs` (with its `SpecsAudience` type),
   `packageName`, `projectText` and `boundLines`. `contextMessage`, `packagePart`, `rolePreamble`, `boundFile` and
   `boundText` use them. The message's bytes do not change: the reference messages in `test/runtime/context-message/`
   and their tests pass unchanged.
4. `src/runtime/pi-api.ts` (Decision 12): `PiJson`, Pi's `JsonValue` in the adapter; `structuredContent?: PiJson` on
   `PiToolResultEvent` and `PiToolResultPatch`; the guard's `json` check accepts null, a boolean, a finite number, a
   string, or a list or a plain object of these (each item checked), and refuses anything else with `BAD_DATA` naming
   the field (e.g. `structuredContent.output`).
5. `test/runtime/pi-contract.ts` (Decision 13 (b)): the contract also checks that every field of `PiToolResultPatch`
   exists in Pi's `ToolResultEventResult` (`patchFields`), and assigns the patch to Pi's type (`patchFits`).
   `test/runtime/pi-contract.test.ts`: the fixture gains `JsonValue`, `structuredContent` on `ToolResultEvent` and an
   exported `ToolResultEventResult`; two tests name a missing `structuredContent` on the event and on the result. The
   vendor test passes against the real Pi 1.5.1 types.
6. `test/fake-engine.mjs`: words `edit <path>` and `write <path>`. Each makes the model's next call a tool call of Pi's
   `edit` or `write` with `{ path }`, fires `tool_call` and `tool_result`, runs the tool (edit appends `fake edit`,
   write writes `fake write`, its folders made) and gives Pi's success text (`edit.js:133`, `write.js:50`) as the
   result. A decision's `tool` now holds `{ name, input }`; `tool <command>` keeps its bash call and output.
7. Tests:
   - `test/hook/communication.test.ts` (+16, 1 changed; 34 tests; its opening comment is one line, F7): the vision
     after an edit and a write of a planned ticket in a coordinator; after a job's edit, from the root, not the
     worktree; after a job's write (F4); after `limen ticket new`, none with `--lane active`; none after `limen spawn`
     or `git merge`; none after a `limen spawn` whose note names `touch` and a planned path (F3); after a `git -C` move
     into a planned ticket whose path ends in a folder named limen (G1); once per context until a compaction; the style
     sections' text, scoped by path and language, with no read request (u13's fixture); only not-yet-shown sections;
     the Specs section after its header line (named after A-041, G2), and apart from it (F2, A-038) the Specs reminder
     only in a coordinator and a keeper, none for a worker; an `isError` result gets nothing and leaves the vision to
     come; the 1,000-line bound with its notice; a Bash result keeps its `structuredContent`, asserted alone (F1); no touch line
     after a Bash creation of a planned ticket. The A-039 test now checks that the reminder holds the package's Specs
     section and not the project register's marker.
   - `test/cli/spawn.test.ts` (+1): a worker scripted `edit spec/features/planned/F001-x/ticket.md`; in the call after
     the edit, the committed vision's marker is in one record of role `tool` and in no `user` record.
   - `test/fake-engine.test.ts` (+2): the words' `tool_call` and `tool_result` with Pi's tool name and `{ path }` and the
     written file; a returned content replaces the edit's result in the next call's view, after Pi's write result.
   - `test/runtime/pi-api.test.ts` (+1): the guard keeps bash's object and read's string and refuses a value that is no
     JSON value.
   - `git rm test/u13-guidance-reminder.test.ts` (AC-10). Its cases that still hold moved: the style ranges and scoped
     headings, "same area, already asked", compaction resets, a failed edit asks nothing, a write under spec/ gives the
     Specs reminder. Its read cases went with the read memory.
8. Text (Change 5, T-30): `CONTRIBUTING.md` (the project-context bullet and the sentence of fact 6, AC-9) and
   `docs/setup.md` → Hooks say that the hook appends the section text to the tool result, and name the vision at a
   planned ticket and that `limen spawn` and `git merge` bring none; both say that each section comes once until a
   compaction or a new session start, such as `/reload` (F5). The hook's header comment and the comments of fact 6
   follow (`Ask`, `Guide`, `guidanceAsks`, `createsPlannedTicket`, `reminder`, `guidance`, `reminderText`); the
   `SPECS_REGISTER` comment says that a reminder appends its section. The rewritten comment lines over 120 columns are
   wrapped (F6: `test/runtime/pi-contract.ts`, `test/fake-engine.mjs`, and the others of this diff).

## Proof

- `node --test test/hook/communication.test.ts` → exit 0, 30/30 (AC-1); after round 1's fixes 33/33, after round 2's
  34/34.
- `node --test test/cli/spawn.test.ts` → exit 0, 28/28 (AC-2).
- `node --test test/fake-engine.test.ts` → exit 0, 26/26 (AC-3).
- `node --test test/runtime/pi-api.test.ts` → exit 0, 35/35; `node --test test/runtime/pi-contract.test.ts` → exit 0,
  13/13, the vendor-copy test included (AC-4).
- `node adrian-rebuild/tools/fails-before.mjs test/hook/communication.test.ts test/cli/spawn.test.ts
  test/fake-engine.test.ts test/runtime/pi-api.test.ts` → exit 0 (AC-5; `## Fails before`).
- `git grep -q 'make your next tool call' -- hook/communication.ts` → exit 1 (AC-6).
- `git grep -q 'even if an earlier copy is in your context' -- hook/communication.ts` → exit 1 (AC-7).
- `git grep -q 'started or merged work' -- hook/communication.ts` → exit 1 (AC-8).
- `git grep -q 'asks the agent to read' -- CONTRIBUTING.md` → exit 1 (AC-9).
- `git ls-files -- test/u13-guidance-reminder.test.ts | grep -q .` → exit 1 (AC-10).
- AC-11, the main session's gates (`node adrian-rebuild/tools/gate.mjs --out node_modules/.rebuild-review/R-043.gate`):
  before the review → exit 0, 1382/1382 (336.3 s); after round 1's fixes and D-133 → exit 0, 1385/1385 (350.2 s);
  after round 2's fixes → exit 0, 1386/1386 (334.7 s). The implementer's gates: 1382/1382 (367.4 s) before the review,
  1386/1386 (332.2 s) after round 2's fixes.
- The implementer's gate after round 1's fixes → exit 1, 1384 of 1385 (319.4 s): `test/hook/wake.test.ts`, "a wake that
  enters no run is counted unconfirmed, with its reason in the job's log, once the session has been quiet for 30 s",
  failed in its teardown, not on an assertion (`ENOTEMPTY: directory not empty, rmdir
  '…/limen-rebuild-gate/limen-wake-lost-…/home/.limen'`); round 1 changed nothing that test runs. Not run again
  (D-029); Q-93 → D-133: measured 10/10 on this tree and 10/10 at `HEAD` (`ticket.md` → Decision 15), finding A-092,
  fixed in R-112; then the main session's gate above passed.
- `node adrian-rebuild/tools/fails-before.mjs` on AC-5's four files → exit 0 after each round (the main session's runs).
- `npx biome check --error-on-warnings .` → exit 0 (289 files); `npx biome check --error-on-warnings adrian-rebuild` → exit
  0; `node adrian-rebuild/tools/check.mjs` → exit 0, "0 errors" (AC-12).
- `npx tsc --noEmit -p .` → exit 0.

## Fails before

Test first, with the source unchanged (the working tree's tests and fake over HEAD's `hook/`, `src/`):

- `node --test test/hook/communication.test.ts` → 30 tests, 17 pass, 13 fail: the changed A-039 test and the 12 new
  ones. For example, the structuredContent test failed with `actual: [ undefined, false ]` (no structured content, no
  vision), the bound test with `actual: [ false, false, false ]`, and the touch-line test with `actual: [ true, true ]`
  (HEAD's cue said "Last turn started or merged work.").
- `node --test test/runtime/pi-api.test.ts test/runtime/pi-contract.test.ts` → 48 tests, 3 fail: the guard test ("the
  guard accepted the value") and the two contract tests (no diagnostic names `structuredContent`).
- `node --test --test-name-pattern="planned ticket" test/cli/spawn.test.ts` → 1 fail, `actual: { tool: 0, user: 0 }`,
  `expected: { tool: 1, user: 0 }`.

`node adrian-rebuild/tools/fails-before.mjs test/hook/communication.test.ts test/cli/spawn.test.ts
test/fake-engine.test.ts test/runtime/pi-api.test.ts` → exit 0 (the main session's run after round 2's fixes):

```
fails-before: test/hook/communication.test.ts, test/cli/spawn.test.ts, test/fake-engine.test.ts, test/runtime/pi-api.test.ts fail at HEAD (exit 1)
test at test/hook/communication.test.ts:591:1
✖ a Bash command that creates a planned ticket leaves no touch line in the next turn cue (13.920471ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
  …
    actual: [ true, true ],
    expected: [ true, false ],
test at test/runtime/pi-api.test.ts:169:1
✖ piEvent returns a tool_result with bash's structured object or read's structured string, and refuses structuredContent that is no JSON value (1.024293ms)
  AssertionError [ERR_ASSERTION]: the guard accepted the value
```

(The tool prints the last 40 lines only, so it shows the last two failures.)

The two new tests of `test/fake-engine.test.ts` check the fake itself, and `fails-before.mjs` lays the changed fake
over HEAD too, so there they pass. Against HEAD's fake (`git archive HEAD` extracted to the scratchpad, only the new
`test/fake-engine.test.ts` over it), `node --test --test-name-pattern="edit and write call|replaces an edit"
test/fake-engine.test.ts` → 2 tests, 0 pass, 2 fail: `ENOENT … notes/a.md` (HEAD's fake ignores the words) and
`actual: []` for the views' tool records.

### Round 1 fixes (Decision 14)

F3 before its fix, on the working tree with round 1's first change (the hook's creation pattern still applied to a
`limen` command): `node --test --test-name-pattern="whose note names touch" test/hook/communication.test.ts` → 1 test,
1 fail:

```
✖ H-12: a Bash limen spawn whose note names touch and a planned path gets no vision (12.730916ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
    actual: { content: [ [Object] ] },
    expected: undefined,
```

F1–F4 against HEAD's hook (the scratchpad copy of `git archive HEAD`, the changed `test/hook/communication.test.ts`
over it): `node --test --test-name-pattern="keeps its structuredContent|A-038|whose note names touch|job's write of a
planned" test/hook/communication.test.ts` → 5 tests, 0 pass, 5 fail, each for its own reason:

```
✖ H-12: a job's write of a planned ticket appends the vision's text after its header
    actual: false,          (HEAD gives a job's write of a planned ticket no vision)
    expected: true,
✖ H-12: a Bash limen spawn whose note names touch and a planned path gets no vision
    actual: { content: [ [Object] ] },
    expected: undefined,
✖ A-038: the specs reminder holds the package's Specs section after its header line
    actual: [ false, false ],
    expected: [ true, true ],
✖ A-038: the specs reminder reaches a coordinator and a keeper, whose context message holds the register, and no worker
    actual: [ true, true, 'Done.\n\n[limen] Specs: make your next tool call a read of …/templates/registers/specs.md lines 1-24. …' ],
    expected: [ true, true, '' ],
✖ a Bash result that brings the vision keeps its structuredContent
    actual: undefined,
    expected: { output: '', truncated: false, exit_code: 0, wall_time_seconds: 0 },
```

F5–F7 change text and comments only.

### Round 2 fixes (Decision 16)

G1 before its fix, on the working tree (the `limen` rule still matched `limen` after a `/` anywhere in the command):
`node --test --test-name-pattern="path ending in limen" test/hook/communication.test.ts` → 1 test, 1 fail:

```
✖ H-12: a Bash git mv into a planned ticket with a -C path ending in limen appends the vision (10.300022ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  + actual - expected
  + ''
  - 'Done.\n' +
  -   '\n' +
  -   '[limen] Vision (spec/vision.md lines 1-3): check this edit against it.\n' +
```

After the fix, `node --test test/hook/communication.test.ts` → exit 0, 34/34. G2 renames a test; it changes no
mechanism.

## Deviations from the ticket

1. Change 4's `pi-api.test.ts` item: the guard refuses a value that is no JSON value, not "a non-object one"
   (Decision 12: Pi 1.5.1's `read` gives a string).
2. Files outside `## Change` as first written: `src/runtime/context-message.ts` (Decision 13 (a) adds it) and
   `test/runtime/pi-contract.ts`, the contract that `pi-contract.test.ts` runs (Decision 13 (b)).
3. "Once per area" is once per section (Decision 13 (c)), so u13's case "web/x.ts → lines 1-2, 7-10" is now "7-10":
   the top section's text is in the context already.
4. The specs header names `limen/templates/registers/specs.md`, as the context message does (Decision 13 (d)), not
   the package's absolute path.
5. `createsPlannedTicket` keeps today's Bash pattern on the raw command, so a PowerShell command with backslashes in
   the path is not seen, as before.

## Unmeasured

- That the real bridge and Claude Code put the appended text into the MCP tool result the model reads, and whether
  Claude Code caps a long one: seat step 4.5 (`plan.md` → `## Deployment`); out of scope by the ticket.
- Whether the model checks an edit against the appended rules or vision: model behaviour, unmeasured, M-05.
- The tokens the appended text adds per edit (up to the 1,000-line bound per section), against the read round-trip it
  replaces: unmeasured here, M-07 (tokens per landed ticket by class). The context message's size (M-01) does not
  change.

## Open points

1. In a job the specs gating reads `record.json` through `readRecordSync`; a damaged record makes the handler throw,
   which Pi reports as an extension error, and the tool result stays as it was (T-01: the error is not swallowed).
2. `hook/group-peer.ts`'s own `tool_result` handler replaces the content without returning `structuredContent`, so it
   still drops a bash or read result's structured content in a group member when it appends a delivery (review round
   1, note 6). That is outside this ticket's `## Change`. It goes to the ticket that rewrites the group hook (R-077 by
   D-122 (2)), or to the stage gate.
3. `docs/setup.md` still says that a change of the vision or the styleguide reaches the next session. That stays true
   of the frozen context message, but a reminder now appends the file as it is when the tool result is built. R-110's
   change notices (D-114 (2)) are the place to restate it.
4. A `git mv` (or `mv`) out of `spec/features/planned/` still brings the vision: the kept creation pattern sees `mv`
   and the planned path, whichever way the file moves (review round 1, note 3; Decision 14 F3, which keeps today's
   pattern by `## Change` 1).
5. The gate after round 1's fixes failed once on `test/hook/wake.test.ts:691` with `ENOTEMPTY` in the test's cleanup of
   its temporary home's `.limen` (see `## Proof`). The test's `hookProject` registers `rm(root)` with `t.after` before
   `startCoordinator` registers the hook's `shutdown`, so the folder may be removed while the hook still writes below
   `home/.limen`: a guess (`guessed`) from the order of the two `t.after` calls (`test/hook/wake.test.ts:127`, `:167`),
   not run again (D-029). Of the files that test loads, this ticket changes `src/runtime/pi-api.ts` (the `tool_result`
   guard, which the wake hook does not call) and `src/runtime/context-message.ts` (loaded through `src/job/spawning.ts`
   and three other modules; round 1 changed two of its comment lines).
   Closed by D-133: measured 10/10 on this tree and 10/10 at `HEAD`, finding A-092, fixed in R-112; the main session's
   gates after it passed (`## Proof`).
6. Review round 3, note 1: the command-position class of G1 (`[;&|(]`) leaves out a newline, so in a multi-line Bash
   call `cd /repo` + newline + `limen spawn … --note "touch spec/features/planned/…"` brings the vision (against
   AC-13's "never on `limen spawn`"), and `cd /repo` + newline + `limen ticket new "x"` brings none. Adding `\n` to the
   class fixes both; the rounds were spent, so it waits here (D-092), for Adrian at gate 5.4.
7. Review round 3, note 2: the `limen ticket new` and `--lane active` tests read the whole command, not the `limen` call
   they belong to (`limen spawn … --note "then run limen ticket new Y"` brings the vision; `limen ticket new "a" && limen
   ticket new "b" --lane active` brings none). For gate 5.4 with point 6.
