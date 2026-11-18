<!-- PL: Wynik ticketu R-009 (szkic implementera): wycięta rola scout (szablon, kształt i tabela w podręczniku
koordynatora, osobna pobudka po zakończeniu zadania scouta) oraz sonda `jg --help` z sekcją `Cue: Search`, więc hook
komunikacji nie uruchamia żadnego procesu przy budowie kontekstu. `limen spawn --role scout` i `limen continue` zadania
scouta odmawiają wierszem z `OLD_ROLES`, chyba że projekt ma własny `.agents/limen/scout.md`. Plik podaje dowody
(bramka 133/133), testy padające przed zmianą, odstępstwa i pomiary. Stan: zamknięty (19.11, nocny przebieg;
recenzja PASS w rundach 1 i 2). -->

# Outcome: R-009 Cut the scout role and the `jg` cue

## Done

- Item 1: `git rm -q templates/scout.md` (1,940 bytes; it had no `templates/.history/` file).
- Item 2, the scout role:
  - `src/job/wake-text.ts`: the `scout` constant and its three uses are gone. A done job gets the ordinary done
    handoff ("Job done. Next step: land it, …") and the ordinary done instruction, whatever its `role` file says. A
    done job with open checks always gets the open-checks handoff (`if (open.length)`). No other wake text changed.
    `text` and `join` stay, because other code in the file uses them.
  - `templates/agents.md`: the `scout` shape, the paragraph and table on when to use a scout, and the escalation line
    are gone. The five other shapes and the handoff paragraph are unchanged; the list is followed by one blank line and
    the handoff paragraph, as the other paragraphs are. No sentence about subagents or a replacement was added.
  - `src/old-names.ts`: `OLD_ROLES` has the `scout` entry with the ticket's wording. `resolvePreamble` did not change.
- Item 3, the `jg` cue:
  - `hook/communication.ts`: `hasJevgrep`, its cache `jevgrepSeen`, the Search cue in `guidancePrompt` and the
    `node:child_process` import are gone. The hook starts no process to detect a tool while it builds the context
    message (its drift check can still start `git`, Open points 3).
  - `templates/communication.md`: the sentence "Search enters the system prompt only when `jg` identifies itself as
    Jevgrep." and the `## Cue: Search` section with its body are gone. The file now ends after the `## Cue: Failure`
    body.
  - `CONTRIBUTING.md:29`: the list of stable guidance reads "(capability frame, shop manual, speech register, vision,
    styleguide, board digest)".
- Item 4: new first lines, dated 2026-11-19 and written with Edit:
  - `templates/.history/agents.md`: `e1e412cdcfdf9bbfcbd9345ade4ece32edceae247ffd395bdd9f40e9543b6359`;
  - `templates/.history/communication.md`: `aa35e2aad5ca8e29b8250ec5d47283de08b8cd9d33d54acc4640dbb2fa92a655`.
- Item 5, the tests: see `## Fails before` and `## Tests removed with the cut`.
  - New `test/hook/communication.test.ts` (written as `test/hook/context-tools.test.ts`; the main session renamed it
    after review round 1 with `git add` and `git mv`, T-29 (1), content unchanged). A temporary project has one job folder. A temporary home has no seat rules,
    and `LIMEN_HOME` points at it, so the laptop's own rules do not enter the coordinator's cue. A folder holds an
    executable `jg`, a `/bin/sh` script that writes a marker file with a shell redirection, prints
    `Jevgrep: search source by question` and exits 0. For each session kind, the test calls `before_agent_start` on a
    fresh copy of the hook twice: first with `PATH` unchanged, then with that folder first on `PATH`. It asserts
    `[second result, marker exists]` deep-equals `[first result, false]`. The variables the hook reads (`LIMEN_JOB`,
    `LIMEN_JOB_ID`, `LIMEN_CONTEXT_ROOT`, `LIMEN_HOME`, `PATH`) are set or cleared for the session kind and restored
    after the test.
  - The ticket's condition on other handlers does not apply. The hook builds its per-turn cue (`turnCue`) only in the
    `before_agent_start` handler (`hook/communication.ts:73`, `:81`). The other handlers (`message_end`,
    `session_start`, `session_compact`, `tool_result`) build no cue, so nothing else is compared.
  - `test/cli/old-names.test.ts`: `SCOUT_REFUSAL` holds the line written out. Four tests for `scout` mirror R-007's
    four `picture` tests: `resolvePreamble` without and with the project's own `.agents/limen/scout.md`, `limen spawn
    --role scout work`, and `limen continue` of a job started under a project's own `.agents/limen/scout.md` after
    that file is gone.
  - `test/u3-turn-signal.test.ts`: only the scout parts are gone. See `## Deviations from the ticket` 1 for the
    wording.

## Proof

Implementer's runs, from the repository root:

- `node adrian-rebuild/tools/gate.mjs` before any change (HEAD `57c870a`, only `plan.md` and this ticket's folder
  differing): tests 127, pass 127, fail 0, cancelled 0, skipped 0 (58.7 s). The output was piped through `tail`, so
  the shell showed the pipe's status.
- `node adrian-rebuild/tools/gate.mjs` after the change: tests 133, pass 133, fail 0, cancelled 0, skipped 0 (59.5 s),
  also piped through `tail`. The final unpiped run is in `## Final runs`.
- `npx tsc --noEmit`: exit 0. `npx biome check --error-on-warnings .`: exit 0 ("Checked 149 files … No fixes
  applied.").
- AC-1: `git ls-files -- templates/scout.md` prints nothing, so `… | grep -q .` exits 1. In this harness a `grep` exit
  1 shows the same as a silent exit 0, so I ran every grep criterion without `-q` as well: no output means no match,
  which means exit 1. As a positive control, `git grep -n -I -i scout -- src/old-names.ts` prints the two lines of the
  new entry.
- AC-2: the ticket's `git grep` without `-q` prints nothing. The command runs on the working tree with the deletion
  staged. `grep -n -i scout test/hook/communication.test.ts` (the new file was untracked then, so `git grep` did not
  read it) prints nothing.
- AC-3: the ticket's `git grep` without `-q` prints nothing.
- AC-4: `git grep -n -e child_process -e '"Search"' -- hook/communication.ts` prints nothing.
- AC-5: `node --test test/hook/communication.test.ts` (then `context-tools.test.ts`): 2 tests, pass 2, fail 0.
- AC-6: `node --test test/cli/old-names.test.ts`: 24 tests, pass 24, fail 0 (13.4 s). The output was piped through
  `tail`. `node --test --test-timeout=180000 --test-reporter=dot test/cli/old-names.test.ts` without a pipe: exit 0,
  24 dots.
- AC-7: `node --test test/u3-turn-signal.test.ts`: 1 test, pass 1. `node --test test/structure.test.ts`: 2 tests,
  pass 2.
- AC-8 is the main session's run of `fails-before.mjs`; see `## Fails before` for my per-file runs.

## Final runs

Run after the first draft of this file was written, without a pipe:

- `node adrian-rebuild/tools/check.mjs`: exit 0, "0 errors" (99 PL summaries, 13 ticket folders, 11 `changes.md`
  entries).
- `npx biome check --error-on-warnings adrian-rebuild`: exit 0 ("Checked 28 files … No fixes applied.").
- `node adrian-rebuild/tools/gate.mjs`: exit 0; tests 133, pass 133, fail 0, cancelled 0, skipped 0 (59.6 s). It
  printed "gate: git version 2.34.1 lacks 'worktree list -z'; the shim in …/node_modules/.rebuild-gate emulates it".

Both checks of the rebuild folder were run again after this section was filled in; the reply gives their result.

Main session's runs (they count, `## Agents` step 4), after the rename of item 5's test file:
- `node adrian-rebuild/tools/review-guard.mjs compare --git node_modules/.rebuild-review/R-009.git
  adrian-rebuild/R-009-cut-scout-jg-cue/ticket.md` (after the implementer): "the implementer's run is within its
  limits", exit 0.
- `node adrian-rebuild/tools/gate.mjs`: exit 0; tests 133, pass 133, fail 0, cancelled 0, skipped 0 (58.6 s); also
  133/133 before the rename (60.7 s).

## Fails before

Main session's run of `node adrian-rebuild/tools/fails-before.mjs` after the rename: exit 0, with the line
"fails-before: test/cli/old-names.test.ts, test/hook/communication.test.ts, test/u3-turn-signal.test.ts fail at HEAD
(exit 1)". The tool runs the three files in one `node --test` at `HEAD`; `test/u3-turn-signal.test.ts` passes there
alone (below).

I wrote each new or changed test before any source edit. I ran it directly with `node --test` on the unchanged
source, outside the gate's environment. None of these tests runs `git worktree list -z` (D-034). The output is
shortened: no stack frames.

- `node --test --test-reporter=dot test/hook/context-tools.test.ts` (renamed later): exit 1, 2 of 2 fail. Both fail at the one
  `deepEqual`. The system prompt with `jg` on `PATH` is 223 characters longer, which is the Search cue with its
  separator. The marker exists:
  ```
  ✖ T-36: a coordinator session starts with the same context with and without a jg on PATH, and the hook never runs it
    + … 46144 more characters
    - … 45921 more characters
      },
    +   true
    -   false
  ✖ T-36: a job session starts with the same context with and without a jg on PATH, and the hook never runs it
    + … 4848 more characters
    - … 4625 more characters
      },
    +   true
    -   false
  ```
- `node --test --test-timeout=180000 --test-reporter=dot test/cli/old-names.test.ts`: 3 of 24 fail. The output was
  piped through `grep`, `cut` and `head`, so the shell showed the pipe's status; `node --test` exits 1 when a test
  fails.
  ```
  ✖ resolvePreamble throws the removal line of the role scout in a project without .agents/limen/scout.md
    AssertionError [ERR_ASSERTION]: Missing expected exception.
  ✖ spawn --role scout refuses with the removal line and leaves no job, worktree or branch
    actual: [ false, '' ]
    expected: [ true, 'role scout was removed with the scout role (R-009); the coordinator answers a short question itself; a long one is a survey job, whose deliverable is a notes file\n' ]
  ✖ continue refuses a job of the role scout once the project's own role file is gone, and leaves .limen/ unchanged
    actual: [ false, '' ]
    expected: [ true, 'role scout was removed with the scout role (R-009); … a notes file\n' ]
  ```
  At `HEAD`, `templates/scout.md` exists, so `resolvePreamble` returns it, and spawn and continue start a job.
- A test that passes at `HEAD` by design, inside a file that fails there: "resolvePreamble returns the project's own
  .agents/limen/scout.md, so a project keeps a role of that name". It is a guard: a project file already won at
  `HEAD`, and it fails only if the refusal is ever checked before the project's own file.
- A changed file that passes at `HEAD` alone: `test/u3-turn-signal.test.ts`. `node --test --test-reporter=dot
  test/u3-turn-signal.test.ts` on the unchanged source exits 0, 1 of 1 passing. The change only removes the scout
  assertions and words (ticket item 5). Without a `role` file, the remaining assertions see the ordinary done wake at
  `HEAD` too.

## Tests removed with the cut

There were 127 tests before and 133 after: none removed, 6 added, 1 changed.

Removed: no test. The scout assertions (the `role` file `scout`, `/Nothing to land/`, and no `before landing` or
`land it`) were three lines inside the one u3 test, which stays.

Changed:
- `test/u3-turn-signal.test.ts`:
  - The name is now "only a done job is sent to landing; a done and a fallback wake have the whole message, a Herdr
    wake past one request is not sent".
  - The header line is "U3: what a completion wake tells a coordinator. It sends only a done job to landing."
  - The task text is `Implement F001.`.
  - The three scout assertions are gone. The size assertion of `promptPane` now repeats the ordinary done wake and
    still sees a 7-digit `prompt_too_large`.

Added:
- `test/hook/communication.test.ts`:
  - "T-36: a coordinator session starts with the same context with and without a jg on PATH, and the hook never runs
    it";
  - "T-36: a job session starts with the same context with and without a jg on PATH, and the hook never runs it".
- `test/cli/old-names.test.ts`:
  - "resolvePreamble throws the removal line of the role scout in a project without .agents/limen/scout.md";
  - "resolvePreamble returns the project's own .agents/limen/scout.md, so a project keeps a role of that name";
  - "spawn --role scout refuses with the removal line and leaves no job, worktree or branch";
  - "continue refuses a job of the role scout once the project's own role file is gone, and leaves .limen/
    unchanged".

## Deviations from the ticket

1. Item 5 says the scout words of the u3 header, name and task text go and that the change only removes. Two words
   were replaced rather than only removed, so that the remaining text stays true:
   - The name says "a done and a fallback wake have the whole message" where it said "a fallback or scout wake". The
     assertion behind it checks `wake("done")` and `wake("stopped", true)`, and `wake("done")` is now an ordinary
     done wake.
   - The task text is `Implement F001.` instead of `Scout F001.`, so the lead still carries a task sentence.
   - The header comment also lost "(F936)". That reference cited the source of the scout clause that went with it.
   No assertion was added, and the file passes at `HEAD`.
2. The new test sets `LIMEN_HOME` to an empty temporary home. The ticket does not name it. Without it, the
   coordinator's cue would read the seat rules under the laptop's home, and the test would depend on that home.

## Measurement

- `unmeasured`, M-01: the role texts shrink, and `templates/scout.md` (1,940 bytes) is gone.
  - `templates/agents.md`: 41,403 → 40,651 bytes;
  - `templates/communication.md`: 15,485 → 15,169 bytes. The Search cue (223 characters with its separator) left
    the system prompt only on a host where `jg` named itself Jevgrep, which the seat is not (T-36).

  At stage 1 these texts do not reach the model under the bridge (E-1), so M-01 is measured from stage 4.
- M-10 (gate run time): 59.6 s in the last run after the change (58.7 s before); recorded at the close of the
  stage.
- No seat step: the ticket's API column is `—`. Deployment step 1.1 is unchanged, because R-009 leaves no files on
  disk (`ticket.md` → `## Migration`).

## Open points

1. The refusal wording of the role `scout` is for Adrian at gate 5.1 (`ticket.md` → `## Decisions`).
2. Out of scope and left as they are: `adrian-rebuild/tools/role-context.mjs:11` (`JOB_ROLES` with `scout`; a missing
   template reads as `undefined` there, as for `picture`), `:148` and `adrian-rebuild/tools/context-size.mjs:151` (the
   `jg` probe). They keep measuring old refs.
3. `observed` (read in the code, no run): the coordinator's cue can still start `git`, through `listDrift` →
   `templateRevisions` → `gitRevisions` (`src/project/inherit.ts:65-88`, `:128-169`), when the project holds a copy
   of a tracked template that differs from the package's. That is drift detection, not tool detection, so T-36 does
   not cover it, and this ticket leaves it. The new test's project holds no such copy. A later scan for "no process
   while the context message is built" (T-36, Check) would meet this call.
