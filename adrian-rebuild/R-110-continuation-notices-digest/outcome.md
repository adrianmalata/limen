<!-- PL: Wynik R-110 (28.11 w nocy, przy `f759e81`; recenzja PASS w rundach 1–3, z dwiema rundami poprawek): moduł wiadomości kontekstowej buduje części
roli jeszcze raz i nazywa ścieżki, których część zmieniła się od zamrożonej wiadomości (`changedSince`); hook zwraca
z biegiem, po cue, jedno powiadomienie `limen-notice` (koordynator i joby, raz na kontekst) i w koordynatorze skrót
tablicy `limen-board` na końcu, tylko gdy kontekst go nie ma. Kontynuacja dostaje powiadomienie z pierwszym biegiem;
golden trybu kontynuacji dla siedmiu ról. Runda poprawek 1 (decyzja 21, F1–F5): odbiorcę wiadomości joba buduje jedna
funkcja `jobAudience` w `src/runtime/roles.ts` (tam też `resolvePreamble`), dwa zdania `docs/setup.md`, trzy testy
hooka sprawdzają pierwszy bieg, dwa komentarze testu. Runda poprawek 2 (decyzja 22, G1–G2): testy `resolvePreamble`
przeniesione do `test/runtime/roles.test.ts`, `test/job/spawning.test.ts` usunięty `git rm`, komentarze otwierające
dwóch plików testów jak w HEAD. Bramka po rundzie 2: 1588/1588, `check.mjs` i Biome przechodzą; pomiar M-04 i krok 4.2
zostają na seacie. -->

# R-110 outcome

## Done

1. `src/runtime/context-message.ts` (Change 1):
   - `changedSince(frozen, root, audience)` (`:91`) names, in the message's order, the path of each part whose text
     now differs from the text `frozen` holds under the part's heading, of each part with text now whose heading
     `frozen` lacks (a new file, a module switched on), and of each part `frozen` holds that has no text now (a removed
     file, a module switched off). It reads files only.
   - The parts come from one function, `messageParts` (`:105`), which `contextMessage` (`:77`) now also uses, so the
     message and the comparison build the same parts (T-25). Each `Part` (`:71`) has its heading, the path the heading
     names, and its text now ("" for none). The candidates are the parts the audience can have: the frame, the manual
     or the role's preamble, the agent register, the specs register (coordinator, keeper), the owner register
     (coordinator), the vision (the coordinator's `## Vision (spec/vision.md)` part, or a job's vision line, which is
     its own heading), the styleguide, and `AGENTS.md` only for a job whose bridge runs isolated. After each part come
     the parts of every module that has a file for it (`moduleParts`, `:126`), with text only while the module is on
     and the part before it has text, which is the rule `contextMessage` had.
   - `heldTexts` (`:140`) finds the parts of `frozen` by the headings the module writes (`\n\n<heading>\n`), each
     looked for after the one before it, and takes each part up to the next part found or to the closing tag. It parses
     no other text. So an edit of `templates/capability.md` below its `## Cue` names nothing, and an edit in its
     `## Frame` names `limen/templates/capability.md`.
   - `boundText` (`:245`) is exported, for the digest's heading and line bound. The reference messages of R-039 are
     unchanged (AC-1, the A-051 tests pass on the old reference files).
2. `hook/communication.ts` (Change 2):
   - Two `before_agent_start` handlers registered right after the cue's (`:117-134`), so a run's prompt ends with the
     cue, then the notice, then the digest (D-120). Each reads the context through `piContext(…, ["cwd",
     "sessionManager"])` and `piContextEntries`, returns a hidden custom message (`withRun`, `:274`), and keeps no
     state in the hook.
   - Notice (`changeNotice`, `:285`), in the coordinator and in jobs: the frozen bytes are the content of the
     `limen-context` entry of `buildContextEntries()`; the paths of `changedSince`, less every path a `limen-notice`
     entry in that context names (`noticedPaths`, `:302`); one message, one line per path,
     `changed <path>, new text from the next session`, in the tag pair `<limen-notice>` (`tagPair`, `:269`, which the
     cue now uses too). None when the context holds no context message or no path is left.
   - The job's audience (`sessionAudience`, `:316`): built from the job's record (`sessionRecord`, `:326`) by
     `jobAudience` (`src/runtime/roles.ts:97`, Done 9), the function spawn and continue publish the message with: the
     record's role, a worker's when it names none, its preamble, and the bridge isolation of the record's route.
     `sessionHoldsSpecs` reads the record through the same `sessionRecord`.
   - Digest (`boardDigest`, `:337`), in the coordinator only: `## Board digest (spec/build.md)` with the `## NOW` and
     `## NEXT` sections of `spec/build.md`, within the module's line bound (`digestText`, `:351`, `aa721d7`'s text by
     Decision 20), in the tag pair `<limen-board>`; returned when the context holds no `limen-board` entry or the last
     one has another content. None in a job, and none when the board holds neither section.
   - Neither handler sends or changes the `limen-context` entry or `context.md`.
3. Continuation (Change 3): no code of its own. The copied transcript holds the parent's `limen-context` entry, so the
   child's first run compares the parent's bytes with the files now and gets one notice; the parent's notices are in
   the copied context and are not repeated.
4. `src/runtime/pi-api.ts` and `test/runtime/pi-contract.test.ts` (Change 4): unchanged. `PiContextEntry` already
   declares `type`, `customType` and `content`, the fields the handlers read.
5. `test/fake-engine.mjs` (Change 5): the fake's record `fake-context.txt` (`:701-705`) held one entry per
   `before_agent_start` handler, "" for a handler that returned no message, so with three handlers a job's record ended
   in two empty lines and `test/cli/spawn.test.ts`'s A-086 test (which reads the cue from it) failed. The record now
   holds only the messages the handlers returned. The fake already collected several handler messages per run, in
   order, and the tests need no second prompt in one session, so nothing else changed.
6. Continuation goldens (Change 6): `test/runtime/context-message/<role>-continuation.md` for worker, reviewer, judge,
   keeper, researcher, quality and group team (`group-team-continuation.md`). Each is the child's first model call in
   `fake-view.jsonl` after a parent job and one change of the styleguide: the context message record (equal to the
   role's detached reference, held once in the whole call), a blank line, then the prompt with the cue left out (the
   task `say next`, a blank line, the notice). Each golden is its reference file plus 110 bytes. The plant switches on
   each module role's module: research for judge and researcher, quality for quality, group for the group team.
7. Docs (Change 7): `docs/setup.md` (Hooks): the context-message paragraph says the session gets a notice that names a
   changed file, and a new paragraph after the turn-cue paragraph describes the notice (coordinator and jobs, one line
   per path, once per context, again after a compaction) and the coordinator's digest (last, its sections, its line
   bound, first run, after a change, none when unchanged, again after a compaction). `docs/jobs.md` (continue): the
   child's first run gets one notice of the files changed since; the parent's notices do not come again; a quota resume
   and a group round continue the same way. `CONTRIBUTING.md` names no digest (Decision 20), so it is unchanged. The
   hook's comments describe the two handlers.
8. Tests (Change 8):
   - `test/runtime/context-message.test.ts` (`:365-451`): no change names nothing (every role); a changed styleguide
     names `.agents/limen/styleguide.md` alone (every role); an edit below the capability file's `## Cue` names nothing
     and one in its `## Frame` names the file; a removed vision names `spec/vision.md` (coordinator's part, worker's
     line); the picture module switched on names each part it adds, and switched off each part it held.
   - `test/hook/communication.test.ts`: the handlers are kept as a list per event (`loadHook`), `fire` calls an
     event's one handler and asserts there is one, `start` runs every `before_agent_start` handler in order. New tests
     (`:827-1002`): the coordinator's first run returns `limen-board` last, after the cue; a second run with the same
     board returns none; after a change of NOW the next run returns the new digest; after a compaction it returns
     again; a job gets none; a changed styleguide gives one `limen-notice` with the path in the coordinator and in a
     job; once per context, also after a second change of the file; again after a compaction removed it; runs with
     notices and digests send no context message and leave the `limen-context` entry's bytes; no `child_process`
     function is called during a coordinator's and a job's run (T-36, the mocking pattern of
     `test/hook/steering.test.ts`). The cue tests now run every handler with a session context.
   - `test/cli/continue.test.ts` (`:148-271`): the seven goldens, and one continuation with no change and no notice.
   - `test/s4-steering.test.ts`: the coordinator's first call holds the board body once (was 0), and a new test: the
     call ends with the digest right after the turn cue.
9. Review round 1 fixes (`ticket.md` → Decision 21, `review.md` → Round 1):
   - F1: `jobAudience(root, { role, provider, model }, source)` (`src/runtime/roles.ts:97`) builds a job's message
     audience: the role, a worker's when the job names none; the role's preamble from `resolvePreamble`, whose refusal
     `source` words; and `runsBridgeIsolated(engineRoute(provider, model))`. Spawn (`src/job/spawning.ts`, its
     validate), the continuation (`src/job/continuation.ts`, its validate) and the hook (`sessionAudience`) call it, so
     the hook compares the parts publication built. Its module is `src/runtime/roles.ts`, the module that owns the role
     table: `resolvePreamble` (`:80`) moved there from `src/job/spawning.ts` unchanged, with its package root, so the
     refusals keep their codes (`ROLE_UNKNOWN` a usage error from `--role`, a refusal from a record) and their words, and
     spawn and continue keep their order of checks (`requireJobModules` first). The hook imports `src/runtime/roles.ts`
     and no longer `src/job/spawning.ts` or `src/runtime/engine.ts`. The comments that named `resolvePreamble` in
     `src/job/spawning.ts` (`src/runtime/roles.ts`, `src/runtime/context-message.ts`, the head of
     `src/job/spawning.ts`) name its new place. The tests that import `resolvePreamble`
     (`test/hook/communication.test.ts`, `test/runtime/context-message.test.ts`, `test/job/spawning.test.ts`,
     `test/cli/old-names.test.ts`) import it from `src/runtime/roles.ts`; `test/job/spawning.test.ts`'s opening line
     names it there.
   - F2: `docs/setup.md` → Hooks: a job's message holds only the line that points at the vision, so a job's notice
     names `spec/vision.md` only when the file appears or goes; the digest comes again only after the text of the
     `## NOW` or `## NEXT` section changed, or after a compaction.
   - F3: the three hook tests that check a later run (`:843`, `:932`, `:953`) also assert the first run's message: the
     digest's content, the notice message, and the types `limen-turn-cue`, `limen-notice`, `limen-board`. Each fails
     with no notice or digest (`## Fails before`).
   - F4: the opening comment of `test/hook/communication.test.ts` is HEAD's one line again.
   - F5: the comment `// A-037 "(coordinator and jobs)": …` stands above the coordinator's notice test (`:919`), the
     first of the two that show the notice in the coordinator and in a job, below `NOTICE_MESSAGE`.
10. Review round 2 fixes (`ticket.md` → Decision 22 and `## Change` item 9, `review.md` → Round 2):
    - G1: the three tests of `resolvePreamble` moved from `test/job/spawning.test.ts` to the end of
      `test/runtime/roles.test.ts`, the test file of its module. Their names, assertions and comments did not change,
      and neither did the helpers `project` and `notJobRole`. The only change is the temporary folder's prefix,
      `limen-roles-`, which now names the file. The file's opening comment, still two lines, adds a role's preamble
      from the package alone (A-042). `test/job/spawning.test.ts` was removed with `git rm -f` (Deviations 7). The
      index holds only that deletion. The gate's count stayed at 1588.
    - G2: the opening comments of `test/cli/continue.test.ts` and `test/s4-steering.test.ts` are their text at HEAD
      again. `git diff HEAD` shows no change in either file's first lines.

## Proof

All commands ran from the repository root at `f759e81`, with the change in the working tree.

| Command | Exit | Tests |
|---|---|---|
| `node --test test/runtime/context-message.test.ts` (AC-1) | 0 | 33/33 |
| `node --test test/hook/communication.test.ts` (AC-2) | 0 | 53/53 |
| `node --test test/cli/continue.test.ts` (AC-3) | 0 | 29/29 |
| `node --test test/s4-steering.test.ts` (AC-3) | 0 | 7/7 |
| `node --test test/fake-engine.test.ts` (AC-4) | 0 | 27/27 |
| `node --test test/runtime/pi-api.test.ts` (AC-4) | 0 | 38/38 |
| `node --test test/runtime/pi-contract.test.ts` (AC-4) | 0 | 14/14 |
| `node adrian-rebuild/tools/fails-before.mjs test/runtime/context-message.test.ts test/hook/communication.test.ts test/cli/continue.test.ts test/s4-steering.test.ts` (AC-5) | 0 | all four fail at HEAD (below) |
| `git grep -q 'limen-board' -- hook/communication.ts` (AC-6) | 0 | — (exit 1 at HEAD, Decision 20) |
| `git grep -q 'limen-notice' -- hook/communication.ts` (AC-7) | 0 | — (exit 1 at HEAD, Decision 20) |
| `git grep -q 'new text from the next session' -- hook/communication.ts src/runtime/context-message.ts` (AC-8) | 0 | — (exit 1 at HEAD, Decision 20) |
| `node adrian-rebuild/tools/gate.mjs --out node_modules/.rebuild-review/R-110.gate` (AC-9) | 0 | 1588/1588, `fail 0`, `duration_ms 366583` |
| `npx biome check --error-on-warnings .` (AC-10) | 0 | 310 files |
| `node adrian-rebuild/tools/check.mjs` (AC-10) | 0 | "0 errors" |
| `npm run typecheck` | 0 | — |
| `npx biome check --error-on-warnings adrian-rebuild` | 0 | — |

The gate ran once, on the final code and tests: `ℹ tests 1588`, `ℹ pass 1588`, `ℹ fail 0`, `ℹ cancelled 0`,
`ℹ skipped 0`. Before it, the files that observe a run's hook messages or a model view ran alone: `test/cli/spawn.test.ts`
failed once on its A-086 test, which reads the cue from the fake's `fake-context.txt` (Done 5); after the fake's fix it
passed with `test/fake-engine.test.ts` and `test/s4-steering.test.ts` (69/69). `test/hook/wake.test.ts`,
`test/cli/init.test.ts`, `test/seat/bridge-contract.test.ts` and `test/s3-finish-wake.test.ts` passed in that run. No
other test failed in any run of this ticket.

Review round 1 fixes (Done 9), from the repository root at `f759e81` with the change in the working tree:

| Command | Exit | Tests |
|---|---|---|
| `npx tsc --noEmit` | 0 | — |
| `node --test test/hook/communication.test.ts` (AC-2) | 0 | 53/53 |
| `node --test test/hook/communication.test.ts test/runtime/context-message.test.ts test/job/spawning.test.ts test/runtime/roles.test.ts test/cli/old-names.test.ts` | 0 | 130/130 |
| `node adrian-rebuild/tools/gate.mjs --out node_modules/.rebuild-review/R-110.gate` (AC-9) | 0 | 1588/1588, `fail 0`, `duration_ms 384111` |
| `npx biome check --error-on-warnings .` (AC-10) | 0 | 310 files |
| `node adrian-rebuild/tools/check.mjs` (AC-10) | 0 | "0 errors" |
| `npx biome check --error-on-warnings adrian-rebuild` | 0 | — |

The round's gate ran once, on the final code and tests: `ℹ tests 1588`, `ℹ pass 1588`, `ℹ fail 0`, `ℹ cancelled 0`,
`ℹ skipped 0`, `ℹ todo 0`. No test failed in any run of the round, apart from the F3 run of `## Fails before`, made
on purpose with the two handlers off.

Review round 2 fixes (Done 10), from the repository root at `f759e81` with the change in the working tree:

| Command | Exit | Tests |
|---|---|---|
| `node --test test/runtime/roles.test.ts` | 0 | 7/7 (4 before the move, plus the 3 moved tests) |
| `node adrian-rebuild/tools/gate.mjs --out node_modules/.rebuild-review/R-110.gate` (AC-9) | 0 | 1588/1588, `fail 0`, `duration_ms 364591` |
| `node adrian-rebuild/tools/check.mjs` (AC-10) | 0 | "0 errors" |
| `npx biome check --error-on-warnings .` (AC-10) | 0 | 309 files (310 before; one test file removed) |
| `npx biome check --error-on-warnings adrian-rebuild` | 0 | 36 files |
| `npm run typecheck` | 0 | — |

The round's gate ran once, on the final tests: `ℹ tests 1588`, `ℹ pass 1588`, `ℹ fail 0`, `ℹ cancelled 0`,
`ℹ skipped 0`, `ℹ todo 0`. The count is the same as round 1's, because three tests moved between files. No test failed
in any run of the round. The round changes no mechanism, so it has no test that fails before it.

## Fails before

The main session's runs of protocol step 4 after its gates (1588/1588, 365.5 s; after review round 1's fixes,
1588/1588, 357.0 s; after review round 2's fixes, 1588/1588, 361.8 s): AC-5's `node
adrian-rebuild/tools/fails-before.mjs test/runtime/context-message.test.ts test/hook/communication.test.ts
test/cli/continue.test.ts test/s4-steering.test.ts` → exit 0, "… fail at HEAD (exit 1)" for all four files, all three
times. At `HEAD` two of the files fail as a whole on an import (`changedSince`; `resolvePreamble` from
`src/runtime/roles.ts`), so their tests' failure on the mechanism itself is shown by the runs below: before the code
was written, and F3's run with the two handlers silenced (review round 3, note 2).

The tests were written first and run before the code changed:
- `node --test test/runtime/context-message.test.ts` → exit 1: `SyntaxError: The requested module
  '../../src/runtime/context-message.ts' does not provide an export named 'changedSince'`.
- `node --test test/hook/communication.test.ts` → exit 1, 46 of 53 passing. The 7 failures were the tests that expect a
  digest or a notice; each diff showed the cue alone where `limen-board` or `limen-notice` was expected.
- `node --test test/s4-steering.test.ts` → exit 1, 5 of 7: the board body count was 0 where 1 is expected, and the
  coordinator's first call did not end with the digest.
- `node --test --test-name-pattern="A-051|A-079: a worker's continuation" test/cli/continue.test.ts` → exit 1, 1 of 8:
  each golden test failed on `prompt: 'say next'` where `say next` and the notice were expected (its path `rebuild`, the
  first record equal to the role's reference and its count of 1 already held).

AC-5 on the final tree → exit 0. The tool prints the last 40 lines of the run; the gate's private temporary folder is
shown as `<gate TMPDIR>`:

```
fails-before: test/runtime/context-message.test.ts, test/hook/communication.test.ts, test/cli/continue.test.ts, test/s4-steering.test.ts fail at HEAD (exit 1)
      at TestContext.<anonymous> (file://<gate TMPDIR>/fails-before-m0yQYa/test/s4-steering.test.ts:99:9)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: [ 1, 0, 1, 1, 0, 1 ],
    expected: [ 1, 0, 1, 1, 1, 1 ],
    operator: 'deepStrictEqual',
    diff: 'simple'
  }

test at test/s4-steering.test.ts:111:1
✖ A-037: a coordinator's first model call ends with the board digest, right after the turn cue (0.88398ms)
  AssertionError [ERR_ASSERTION]: -s4

  </limen-context>

  say hi


  <limen-turn-cue>
  Audience: owner. Answer in the language of the owner's last message.
  Engineering time is abundant and the owner's attention is scarce: decide yourself, choose the proper design over the patch, prove it, and keep to the asked outcome.
  </limen-turn-cue>

  false !== true

      at TestContext.<anonymous> (file://<gate TMPDIR>/fails-before-m0yQYa/test/s4-steering.test.ts:113:9)
      at Test.runInAsyncScope (node:async_hooks:226:14)
      at Test.run (node:internal/test_runner/test:1402:25)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async Test.processPendingSubtests (node:internal/test_runner/test:974:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: false,
    expected: true,
    operator: 'strictEqual',
    diff: 'simple'
  }
```

The tool copies only the four named files into its copy of HEAD, so there the continuation goldens are missing: each
golden test fails first on the missing notice in the prompt (its structural assertion comes before the golden is read).

Review round 1 (Done 9). Since F1, `test/hook/communication.test.ts` imports `resolvePreamble` from
`src/runtime/roles.ts`, which HEAD's module does not export, so at HEAD the whole file fails on that import, as
`test/runtime/context-message.test.ts` does on `changedSince`; AC-5's run is the main session's. To show that each test
of F3 fails with no notice or digest, the two new handlers of `hook/communication.ts` returned nothing for one run (an
edit undone right after it), which is HEAD's behaviour, where the cue's handler is the only one:

`node --test --test-name-pattern="second run with the same board|a path comes in one notice per context|runs that
return notices and digests send no context message" test/hook/communication.test.ts` → exit 1, `ℹ tests 3`,
`ℹ pass 0`, `ℹ fail 3` (stack lines and the context message's text cut):

```
test at test/hook/communication.test.ts:843:1
✖ A-037: a coordinator's second run with the same board returns no digest (12.839842ms)
    [
  +   '<limen-turn-cue>\n' +
  +     "Audience: owner. Answer in the language of the owner's last message.\n" +
  …
  -   '<limen-board>\n' +
  -     '## Board digest (spec/build.md)\n' +
  …
test at test/hook/communication.test.ts:932:1
✖ A-037: a path comes in one notice per context: the next run, and one after a second change of the file, return none (7.072057ms)
    [
      {
  +     content: '<limen-turn-cue>\n' +
  …
  +     customType: 'limen-turn-cue',
  -     content: '<limen-notice>\n' +
  -       'changed .agents/limen/styleguide.md, new text from the next session\n' +
  -       '</limen-notice>',
  -     customType: 'limen-notice',
        display: false
      },
test at test/hook/communication.test.ts:953:1
✖ D-114 (1): runs that return notices and digests send no context message and leave the limen-context entry's bytes (23.606645ms)
    [
      [
        'limen-turn-cue',
  -     'limen-notice',
  -     'limen-board'
      ],
```

With the handlers back, the same three pass (53/53 in the file).

## Deviations from the ticket

1. Change 8 says each test fails at HEAD. Each of the four files fails at HEAD (AC-5), but some new tests pass with
   HEAD's code, because at HEAD no handler returns anything that they forbid: in `test/hook/communication.test.ts`
   "a job's run … returns no board digest"; in `test/cli/continue.test.ts` the continuation with no change and no
   notice. They guard the "only on a change" half of each rule. Review round 1
   (F3) made three more of them, "a second run with the same board returns no digest", "a path comes in one notice per
   context" and "runs that return notices and digests send no context message …", assert the first run's message, so
   they fail with no notice or digest (`## Fails before`).
2. Change 8's case "an edit below the register's first `## Cue:`" uses the capability file's `## Cue` section: the
   register's `## Cue:` sections went with `templates/communication.md` (D-134 (6)). The capability file's `## Cue` is
   the turn cue's anchor and lies outside every part, as those sections did. The test also shows that an edit in its
   `## Frame` is named.
3. Change 6's group team: only `limen group start` spawns a team's job, and its rounds need a registered lead, so the
   group team's parent is a worker's finished job made a team's in the test (`teamParent`): its record's role
   `coordinator`, its `context.md` and the `limen-context` entry of its transcript set to the group team's reference
   message. The other six parents are real spawns (`--review --branch` for the reviewer, `--role` for the others).
4. Change 6 does not name the goldens' file names; they are `<role reference>-continuation.md` beside R-039's.
5. Change 5: the fake's change is to its record `fake-context.txt` (Done 5), the one place where it assumed one
   handler message per run; its run already held several.
6. Until review round 1, `hook/communication.ts` imported `resolvePreamble` from `src/job/spawning.ts`. Since F1
   (Done 9) it builds a job's audience with `jobAudience` of `src/runtime/roles.ts`, the function publication uses, and
   imports no spawn module; the T-36 test still counts every `child_process` start function during a coordinator's and
   a job's run.
7. Review round 2 (G1): the main session named `git rm test/job/spawning.test.ts`. That command exited 1 ("the
   following file has local modifications"), because the file held round 1's uncommitted edits: its import from
   `src/runtime/roles.ts` and its opening line. The file was removed with `git rm -f test/job/spawning.test.ts`, which
   left the same index change, the path's deletion. The edits it dropped are redundant, since the three tests are in
   `test/runtime/roles.test.ts` with that import.

## Unmeasured

- `unmeasured` (M-04, `plan.md` → `## Measurement`): the coordinator's cache-write tokens in the turn after a land,
  before and after. Measured at 9.1.
- `unmeasured`, with no M-NN: seat step 4.2 (`plan.md` → `## Deployment`): the per-query CLI log of a `limen continue`
  with one notice of the files changed since, the digest at the end of the coordinator's request after a `limen land`
  and none in the next one, and one `changed spec/vision.md` notice after a hand edit and none after it. The fake shows
  the bridge's view as R-038 declares it; the child's first query takes the bridge's rebuild path, which the fake's view
  shows (`path: "rebuild"`) but no real bridge ran here (Risk).

## Open points

1. A package text changed by a deployment is named by its path in the package (`limen/templates/manual.md`), the name
   its heading gives it, as Risk expects; the notice's words are R-046's.
2. When the board holds neither `## NOW` nor `## NEXT`, or there is no `spec/build.md`, no digest is sent, as at
   `aa721d7`; a digest of an earlier board then stays in the context until a compaction. Every Limen project has the
   file (`limen init` writes it), so this needs a hand edit; R-073 replaces the digest's text.
3. A heading the comparison does not expect for the audience (for example `## Project context (AGENTS.md)` in a frozen
   message whose job's route no longer runs the bridge isolated) is taken into the part before it, which is then
   named. The route of a job does not change after its publication, so this does not happen today.
4. Each run rebuilds the role's parts from files to compare them, the coordinator's manual included (about 49 KB of
   reads per run, no process). The cue's run read the board already; nothing measured a cost.

Review round 1 (`ticket.md` → Decision 21, its "no change" items; `review.md` → Round 1, rows 6–9):

5. A `</limen-board>` line in `spec/build.md` would close the digest's tag early (guessed). No change: a board reaches
   `main` only through land, and the same text went unwrapped into the system prompt at `aa721d7`.
6. A project file whose body holds a later part's heading after a blank line splits the held part, so a notice names a
   file that did not change (observed). No change: only a path reaches the model, so the cost is one notice of noise.
7. A continuation reads the bridge isolation from the child's route (`jobAudience` with continue's provider and
   model), while the frozen message it carries is the parent's (observed). No change: no effect while
   `BRIDGE_ISOLATED` is off; a note for R-048 in `plan.md` → `## Tickets`.
8. The guard tests of Deviations 1 pass at HEAD by design: each guards the "only on a change" half of a rule, and its
   positive counterpart fails at HEAD; F3 turned three of them into tests that fail there. Decision 21 names the T-36
   test with them; the hook's T-36 test (`test/hook/communication.test.ts:982`) also asserts that the coordinator's run
   returns the notice and the digest and the job's the notice (`:997-998`), so it fails with HEAD's code as well.
9. Settled at review round 2 (G1, `## Change` item 9): the three tests of `resolvePreamble` are in
   `test/runtime/roles.test.ts`, and `test/job/spawning.test.ts` is removed (Done 10). `test/cli/old-names.test.ts`
   keeps its four tests of the removal lines of the roles `picture` and `scout`. They call `resolvePreamble` from
   `src/runtime/roles.ts` but test the old names' table, and G1 names only the tests of `test/job/spawning.test.ts`.
