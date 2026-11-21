<!-- PL: Wynik R-089 (szkic implementera, 21.11): w linii końcowej `code` jest null przy sukcesie, a `next` jest
poleceniem Limena z konkretnymi wartościami albo null; walidator i konstruktor LimenError odrzucają "", 0 i prozę.
Zdanie po `spawn`, `continue`, `keeper` i `github review|work` jest linią tekstu przed linią końcową, `group wait`
po limicie kończy się kodem 0 z tym samym wywołaniem w `next`, a tabela starych nazw ma `next` tylko tam, gdzie
następca jest stałym poleceniem. Czytnik linii końcowej w testach (test/final-line.ts) przepuszcza każdy `next`
przez reguły `main`; poprawki rundy 1 dodały skan importów, notatkę hooka bez „run null” i test limitu 20 s
w `group wait`. Poprawka rundy 2 (świeży implementer, 21.11): skan importów czyta importy przez drzewo składni
TypeScriptu (wspólny moduł test/imports.ts, którego używa też `runtimeImports`) i rozwiązuje ścieżkę względem
pliku, więc komentarz, nazwa w cudzysłowie, segment `./`, zapytanie i `new URL` go nie omijają; bramka 572/572
(także w przebiegu sesji głównej). Recenzja runda 3: PASS; dwie uwagi o rozwiązywaniu ścieżek w skanie (`//`
i `file:` bez `//`) czekają na pytanie Q-14. Stan: zamknięty. -->

# R-089 outcome

## Done

1. The final line's types (Change 1), `src/outcome.ts`.
   - `Outcome` is a union: class `ok` with `code: null`, or a failure class with an upper-case `code`; `next` is
     `string | null` in both. `Success` is `{ next: string | null; ids?; text? }`; `text` is one line for people that
     `main` prints just before the final line (used by Change 4 and Change 5).
   - `LimenError` takes `next: string | null` explicitly. The old rule "a refusal or usage error needs a next unless
     `UNTYPED`" is gone (D-045 (2): a refusal with no successor has null); instead the constructor throws a
     `TypeError` for a `next` that is neither null nor matches `NEXT = /^limen \S/`.
   - `finalLineOf` requires `code` null for `ok` (`oneOf([null])`; `oneOf` in `src/boundary.ts` now admits `null`
     among its literals) and an identifier otherwise, and `next` present and `null` or matching `NEXT`, so `""`, `0`
     and prose are refused. The order of the checks stays class, code, next, ids (helper `lineTail`).
   - `JOB_STARTED` keeps its wording; its comment now says it is a text line and that success's `next` is null.
   - The help line keeps its key list (`FINAL_LINE_KEYS` unchanged), which the type still matches.
2. Every `next: ""` is `null`, `code: 0` is `null` (Change 2): `src/main.ts` (a handler's `undefined`, the help
   paths, `UNDECLARED_IDS`; `Handler`'s comment in `src/registry.ts`), `UNTYPED` and `INTERNAL` in `src/outcome.ts`,
   `BAD_DATA` in `src/boundary.ts`, `ticket new` (`src/commands/ticket.ts`), `github deliver` (a handler's
   `undefined`), `migrate` without changes (`src/commands/migrate.ts`, a ternary AC-4 does not match), and, by the
   2026-11-21 decision, `LOCK_TIMEOUT` and `LOCK_LOST` (`src/lock.ts`, messages unchanged), `MISSING_TOOL`,
   `NODE_VERSION` and `MISSING_FEATURE` (`src/platform/requirements.ts`), and the literal line of `bin/limen`. The
   poll summary copies the worst project's `code` and `next` as before; their types now admit null.
3. Commands with concrete values (Change 3).
   - `TICKET_CHECK_FAILED`: `next` is `limen ticket check <branch>`; the message keeps its line and gets a second
     one, `fix the tickets listed above`.
   - `PICTURE_INVALID`: `next` is `limen picture build --strict` with the `--dir` given, built from the parsed values
     (`values.commandLine(["dir", "strict"])`); the message gets the second line `fix the errors listed above`.
   - `GROUP_WAIT_MEMBERS_ONLY`: `next` is `limen group status`, plus the group id when one was given.
   - `GITHUB_NETWORK`: `next` is `limen github poll`. A request GitHub answered (429, a 5xx, a 403 rate limit) adds
     `; retry after <ISO time>` to its message, which the poll prints on the project's line on stderr, when GitHub
     names a time, in GitHub's own order: `retry-after` (seconds or an HTTP date), else `x-ratelimit-reset` when
     `x-ratelimit-remaining` is `0` (`retryTime`, `retryLater` in `src/integrations/github-poller.ts`). A rejected
     fetch has no headers, so no time. `GITHUB_CONFIG` keeps `limen github doctor`.
   - `NODE_VERSION` in `bin/limen`: `"next":null`; its sentence was already on stderr.
   - `src/parser.ts`: one builder of command lines, `limenCommand(name, { flags, positionals })`, which quotes each
     word as a shell reads it back and puts a positional that starts with `--` after a lone `--`;
     `Parsed.commandWith` now uses it, and `Parsed.commandLine(kept?)` builds the call back from the parsed values
     (all parts, or only those named).
4. The sentence of a started job (Change 4): `startSpawn`, `startContinue` and `github review|work` return
   `{ next: null, ids: { job }, text: JOB_STARTED }`, so `spawn`, `continue`, `keeper` (which returns
   `startSpawn`'s result) and `github review|work` print the sentence as the last text line, and a group's
   in-process launch, which ignores the result, prints nothing.
5. `group wait` past its limit (Change 5): `waitGroup` returns `{ limitPassed: <sentence> }` at `--timeout`, and
   `waitCapped(boundMs, operation)` (its `next` parameter is gone) resolves with the same shape at the cap and aborts
   the operation's signal. `groupWaitCommand` returns `{ next: values.commandLine(), text: <sentence> }`: exit 0,
   class `ok`, `code` null, `next` the call as it was made with the raw `--timeout`, and the text line is the
   existing sentence ("group wait timed out; re-enter bounded wait …" or "… after the 20-second CLI cap; …").
   `GROUP_WAIT_TIMEOUT`, `waitTimeout` and `statusNext` are removed.
6. `src/old-names.ts` (Change 6): `OldName.next` is required, `string | null | NextOf`. `picture tick` →
   `limen picture build`, `picture watch` → `limen status`, `queue` → `limen seat queue`, `group status --json` →
   `limen group status` with the group id when given (a `NextOf` over the other words of the call, which
   `readFlag` now passes to `removedFlagRefusal`), `jobs` keeps its computed `next` (same behaviour, `of` now takes
   the parsed values), every other name, flag, engine value and role has `null`; each `instead` sentence stays in
   its line. `oldNext(old, words)` gives the `next` of an entry and is used by every refusal of the table.
7. The parser check of D-046 (3) (Change 7).
   - `src/main.ts`: `commandOf(args, registry)` is the dispatch `main` follows before anything runs (the general
     help, a removed name, a group word with or without `--help`, an entry's `--help`, the shared parser), split out
     of `runCommand` with no change of behaviour, so the tests use `main`'s own rules.
   - `test/final-line.ts`, the tests' reader: `readOutcome` and `outputText` read the line through
     `src/outcome.ts`, then `checkNext` splits a non-null `next` into words as a POSIX shell does (bare words,
     single-quoted parts, a backslash; any other special character such as `<`, `;` or an unclosed quote fails),
     requires `limen` first and runs the rest through `commandOf`; a usage error fails the test.
   - Every test file that read a final line now imports the reader (`test/plant.ts`'s `startedJob` too, so every
     test that starts a job checks its `next`); `test/outcome.test.ts` keeps `src/outcome.ts`'s functions for its
     unit tests of them and reads its CLI runs through the reader. `UNDECLARED_IDS` in `test/registry.test.ts` is
     read through the reader too, instead of `JSON.parse`.
   - `test/final-line.test.ts`: the reader passes null and each form `main` runs, fails prose, a placeholder, an
     unknown command, a bare group word, a removed name, a parser error and an unclosed quote, and a scan finds no
     test file but the reader and `test/outcome.test.ts` with an import that reaches `readOutcome` or `outputText`
     in `src/outcome.ts` (every import form since the round-1 Fix 3, below).
   - `test/cli/old-names.test.ts`: a table test of D-046 (1) pins the `next` of every entry (with no words and with
     `a1b2c3d4`), and a table test runs every one of them through `checkNext`.
8. Docs (Change 8): `docs/commands.md` (the exit-code table: `group wait` at its limit is class `ok`, the poll's
   `next` and retry time; `code`, `next` and the spawn example), `docs/groups.md` (`GROUP_WAIT_MEMBERS_ONLY`'s
   `next`, the wait's limit), `docs/seat/agent-setup.md` (the doctor's final line).

### Round 1 fixes (`review.md` → Round 1; `ticket.md` → `## Decisions`)

Made by a fresh implementer: Fixes 3, 7 and 8, nothing else of the review.

- Fix 3 (finding 3), `test/final-line.test.ts`. The scan now refuses every import form that reaches the readers
  of `src/outcome.ts`, as the main session decided on this implementer's `BLOCKED` (option (a)):
  - a named import or re-export (`export { … } from`) whose names include `readOutcome` or `outputText`, under any
    alias, a `type` prefix included and over several lines;
  - every `import * as` (also `import type * as`), every `export * from` (also `export * as`), every `import()`
    of a literal path in any quote, and a side-effect import.

  A named import of other names (`LimenError`, `EXIT_CODES`, `FINAL_LINE_KEYS`, `finalLine`) passes. The path is
  any quoted literal that ends in `src/outcome.ts`. `readerImports(source)` returns each refused import's text, and
  the scan of the tree names the file and that text. The test has one fixture case per refused form (eight) and a
  passing named import of `LimenError`. The fixtures build their path at run time, so the scan does not read this
  file's own fixtures as imports. Round 2 replaced the regexes and this join with the AST scan (below).
- Fix 7 (finding 7), `hook/wake.ts`. The `NOT_MIGRATED` note is built by the new exported `notMigratedNotice(error)`.
  It names `next` only when `next` is not null: with `limen migrate --dry-run` the note reads as before ("run limen
  migrate --dry-run, then limen migrate, then reload …"); with null it reads "run limen migrate, then reload …",
  never "run null". There is a new test in `test/hook/wake.test.ts` with a null `next`. The session-start test of
  the note with its real `next` is unchanged and passes.
- Fix 8 (finding 8, the cap part), `src/commands/group.ts` and `test/cli/group.test.ts`. `groupWaitCommand` takes
  the CLI cap as an optional third parameter, `capMs`, which defaults to `WAIT_CAP_MS` (20 s). The registry still
  calls it with two arguments, so the command's behaviour is unchanged. The new test runs `main` in-process (the
  precedent is the `UNDECLARED_IDS` test of `test/registry.test.ts`). It uses a copy of the registry whose
  `group wait` handler passes a 50 ms cap, and the environment of a team member (`withEnvironment`, with
  `LIMEN_HERDR` `0` so that no rule timer starts). It calls `limen group wait --timeout 10s`, so the cap ends the
  wait before the `--timeout` does, and reads the captured output through the tests' reader. The result: exit 0,
  the text line "group wait timed out after the 0.05-second CLI cap; inspect any uncertain delivery receipt before
  retrying", and `{"class":"ok","code":null,"next":"limen group wait --timeout 10s"}`. It takes about 0.4 s and
  needs no 20 s wait.

### Round 2 fix (`review.md` → Round 2; `ticket.md` → `## Decisions`)

Made by a fresh implementer: Fix R2-1 (finding 1), nothing else of the review.

- `test/imports.ts` (new): the one reader of a code file's imports for the tests' import scans, through the TypeScript
  syntax tree. `importsOf(path, text)` gives, in order, every `import` declaration, every `export … from` and every
  `import(…)` call. Each one has its form (`named`, `namespace`, `star`, `side-effect` or `call`), the names a named
  import or re-export takes before any `as` (a string name included; a default import is `default`), whether it is
  type-only, its code, and its module path. The path is the literal for a string or a template with no
  substitution, and for an `import()` of `new URL(<literal>, import.meta.url)` or of `new URL(<literal>)` with no
  base, also through `.href`. It is undefined when the code computes the path as it runs.
- `test/boundary.test.ts`: `runtimeImports` is now a filter over `importsOf` (not type-only; the literal path, or
  the code when the path is computed). It has no syntax walk of its own, and its fixture test and its scan of
  `src/boundary.ts` are unchanged.
- `test/final-line.test.ts`: `readerImports(text, file)` reads the imports through `importsOf`. It resolves each
  literal path against the file as Node does (`fileOf`): `.` and `..` segments applied, query and fragment dropped,
  a bare name or another scheme such as `node:` naming no file of the repository. It keeps those that name
  `src/outcome.ts` and are of a form the decision refuses: a named import or re-export that takes `readOutcome` or
  `outputText`, and every namespace import or re-export, star re-export, `import()` and side-effect import. Comments,
  line breaks and string names cannot hide an import from it. The regexes `OUTCOME_PATH`, `NAMED`, `WHOLE` and
  `importedName` are gone. The tree scan passes each file's own path, so that a path from a nested folder, such as
  `../../src/outcome.ts`, resolves from that folder.
- Its test adds one fixture case for each form of finding 1: a comment inside the braces, a comment after `import`,
  a string-named import, a `./` segment in the path, a query in the path, and an `import()` of
  `new URL("../src/outcome.ts", import.meta.url).href`. That makes 14 refused cases and the passing `LimenError`
  import. The fixtures resolve from `test/fixture.test.ts`, a path that does not exist, as if they were a test file
  in `test/`. They write the path literally: the AST does not read a string as an import, so the run-time join of
  round 1 is gone.

Tests changed to the new values: `test/outcome.test.ts`, `test/help.test.ts`, `test/registry.test.ts`,
`test/parser.test.ts` (and three tests of `commandLine` and `limenCommand`), `test/s1-spawn.test.ts` (the golden
final line with the sentence before it), `test/s3-finish-wake.test.ts` (the queued spawn's text now ends with the
sentence), `test/s10-doorbell.test.ts` (`github work`'s last text line), `test/cli/continue.test.ts`,
`test/cli/github.test.ts`, `test/cli/group.test.ts`, `test/cli/init.test.ts`, `test/cli/migrate.test.ts`,
`test/cli/old-names.test.ts`, `test/cli/picture.test.ts`, `test/cli/ticket.test.ts`; import only:
`test/cli/land.test.ts`, `test/cli/status.test.ts`, `test/cli/stop.test.ts`, `test/cli/workspace.test.ts`,
`test/s2-herdr.test.ts`, `test/s6-keeper.test.ts`, `test/plant.ts`.

## Proof

The main session's own gate run on the final tree (2026-11-21, about 14:03, after `review-guard.mjs compare --git`
exit 0), the run that counts for AC-7: `node adrian-rebuild/tools/gate.mjs` → `tests 572`, `pass 572`, `fail 0`,
`cancelled 0`. Its earlier runs: 555/555 before round 1 and 566/566 after it.

All from the repository root, at the tree after the round-2 fix (the round-2 implementer's run).

- `node adrian-rebuild/tools/gate.mjs` → exit 0; `tests 572`, `pass 572`, `fail 0`, `cancelled 0` (AC-7). That is
  the 566 after round 1, plus the 6 new fixture cases in `test/final-line.test.ts` (Fix R2-1). It is the round's only
  gate run, and it passed the first time. Before it the round-1 gate gave 566/566: the 555 before round 1, plus 9 in
  `test/final-line.test.ts` (Fix 3), 1 in `test/hook/wake.test.ts` (Fix 7) and 1 in `test/cli/group.test.ts` (Fix 8).
- `node --test test/outcome.test.ts` → exit 0, `tests 45`, `pass 45` (AC-1).
- `node --test test/cli/old-names.test.ts` → exit 0, `tests 34`, `pass 34` (AC-2).
- `node --test test/cli/group.test.ts` → exit 0, `tests 6`, `pass 6` (AC-3).
- `node --test test/final-line.test.ts` → exit 0, `tests 33`, `pass 33`.
- `node --test test/boundary.test.ts` → exit 0, `tests 33`, `pass 33` (the same count as before the fix).
- `node --test test/hook/wake.test.ts` → exit 0, `tests 7`, `pass 7`.
- `git grep -n -E 'next: ""|"next":""|code: 0\b|"code":0' -- src hook bin docs` → exit 1, no line (AC-4).
- `git grep -n -E 'GROUP_WAIT_TIMEOUT|\?\? "<group id>"|listed above, then' -- src docs` → exit 1, no line (AC-5).
- `npx tsc --noEmit` → exit 0; `npx biome check --error-on-warnings .` → exit 0 (AC-8).
- `node adrian-rebuild/tools/check.mjs` → exit 0, `0 errors` (AC-9).
- `npx biome check --error-on-warnings adrian-rebuild` → exit 0.

The first implementer's first gate run of this change (before the last two test updates) exited 1 with `tests 555`, `pass 551`, `fail 3`,
`cancelled 1`; each failure read a value this change replaces, so none is a D-029 finding:

- `limen init passes its requirements check when every declared tool is on PATH` and `limen init passes its git
  probe when the environment sets safe.bareRepository to explicit` (`test/cli/init.test.ts`) expected
  `[0, 0, true]`, the old `code` 0 in a positional array that my grep for `code: 0` had not found; now
  `[0, null, true]`.
- `a held gate queues jobs by priority …` (`test/s3-finish-wake.test.ts:226`) matched spawn's text with
  `/… 3 ahead\n\S+\n$/`, and the text now ends with `End your turn; Limen wakes you when the job ends.`; the regex
  now ends with that line. It stopped at that assertion with its queued jobs still blocked, so the next test of the
  same file and plant, `an idle owner hears a job whose session is gone through one fallback wake once its grace
  passes`, queued behind them and timed out at 180 s (`cancelled 1`). Both pass in the second run; after it no
  process of a plant from my runs was left.

## Fails before

`node adrian-rebuild/tools/fails-before.mjs` (the round-2 implementer's run, after the gate of 572/572; `HEAD`
`4339985`) → exit 0 (AC-6):

```
fails-before: test/boundary.test.ts, test/cli/continue.test.ts, test/cli/github.test.ts, test/cli/group.test.ts, test/cli/init.test.ts, test/cli/land.test.ts, test/cli/migrate.test.ts, test/cli/old-names.test.ts, test/cli/picture.test.ts, test/cli/status.test.ts, test/cli/stop.test.ts, test/cli/ticket.test.ts, test/cli/workspace.test.ts, test/help.test.ts, test/hook/wake.test.ts, test/outcome.test.ts, test/parser.test.ts, test/registry.test.ts, test/s1-spawn.test.ts, test/s10-doorbell.test.ts, test/s2-herdr.test.ts, test/s3-finish-wake.test.ts, test/s6-keeper.test.ts, test/final-line.test.ts fail at HEAD (exit 1)
…
test at test/s6-keeper.test.ts:1:1
✖ test/s6-keeper.test.ts (368.080733ms)
  'test failed'
```

The tool runs every listed file in one run and names them all when that run fails. Every file but one fails
there as a whole in under a second. `test/final-line.ts` imports `commandOf`, which `HEAD`'s `src/main.ts` does not
export (`git show HEAD:src/main.ts | grep -c commandOf` → `0`). Every file listed except `test/hook/wake.test.ts` and
`test/boundary.test.ts` imports the reader, directly or through `test/plant.ts`. `test/hook/wake.test.ts`, which
joined the list in round 1, imports `notMigratedNotice`, which `HEAD`'s `hook/wake.ts` does not export
(`git show HEAD:hook/wake.ts | grep -c notMigratedNotice` → `0`). So this output does not show each test's own
reason. The first implementer's check below does, and so do the mutations of rounds 1 and 2 after it.

`test/boundary.test.ts`, which joined the list in round 2, passes at `HEAD`:
`node adrian-rebuild/tools/fails-before.mjs test/boundary.test.ts test/imports.ts` → exit 1 ("pass at HEAD"),
`tests 33`, `pass 33`, `fail 0`. That is expected. Its change only moves `runtimeImports` onto the shared reader
`test/imports.ts`, with the same assertions. The reader's new behaviour is tested by the fixture cases of
`test/final-line.test.ts` (below).

The first implementer's own check before the change of mechanism: with only the `src/main.ts` split of `commandOf` in place (no change of
behaviour) and the new tests and the reader laid in, `node --test test/final-line.test.ts test/outcome.test.ts
test/cli/group.test.ts test/cli/old-names.test.ts test/cli/ticket.test.ts test/cli/picture.test.ts` → exit 1,
`tests 108`, `pass 50`, `fail 58`. The failures are the expected ones, for example:

```
✖ a member's group wait past its --timeout exits 0, says so and names the same wait in its one final line
  AssertionError [ERR_ASSERTION]: group wait timed out; re-enter bounded wait while your collaboration or children remain live
  {"class":"transient","code":"GROUP_WAIT_TIMEOUT","next":"limen group status"}
  3 !== 0
✖ GROUP_WAIT_MEMBERS_ONLY: a group wait outside a team that gives no group id names group status without one
  AssertionError [ERR_ASSERTION]: "limen group status <group id>": a shell reads "<" as a special character
✖ TICKET_CHECK_FAILED: ticket check of a failing ticket says on stderr to fix the tickets listed above
  AssertionError [ERR_ASSERTION]: "fix the tickets listed above, then run limen ticket check bad" is not a Limen command
✖ PICTURE_INVALID: picture build --strict --dir names the same folder in next
  AssertionError [ERR_ASSERTION]: "fix the errors listed above, then run limen picture build --strict" is not a Limen command
✖ REMOVED: every removed engine value of spawn --engine exits 2 and names what replaced it
  AssertionError [ERR_ASSERTION]: "use --engine pi" is not a Limen command
✖ REMOVED: group status with a group id and the removed --json names group status with that id
  AssertionError [ERR_ASSERTION]: "limen group status shows the run" is not a command that main runs: limen group status: unexpected argument "the"
✖ spawn --label --tab reads --tab as the label and starts the job
  AssertionError [ERR_ASSERTION]: "End your turn; Limen wakes you when the job ends.": a shell reads ";" as a special character
✖ limen --help ends its stdout with the success line and exits 0
  AssertionError [ERR_ASSERTION]: "" is not a Limen command
✖ finalLine writes class, code and next in that order and leaves ids out when none are given
  Error [LimenError]: the final line: code: expected 0, got null
✖ LimenError takes a null next for a refusal, a usage error and an internal error
  TypeError [Error]: Cannot read properties of null (reading 'trim')
✖ D-046 (1): a removed name has a next only when its successor is a fixed command or one built from its words
  TypeError [Error]: oldNext is not a function
✖ the wait cap ends a stalled operation after its bound with the sentence that the limit passed and aborts its signal
  TypeError [Error]: operation is not a function
```

New or changed tests that pass before the change, and why:

- `test/final-line.test.ts`, the 18 of the first implementer: they test the tests' reader, which is test code. The
  import scan passes because the same change moves every import to the reader. The 9 scan cases of round 1 and the
  6 of round 2 are test code too. 7 of round 1's fail under the round-0 scan, and all 6 of round 2's fail under the
  round-1 scan (below).
- `test/boundary.test.ts`, all 33 tests (round 2): only `runtimeImports` moved onto the shared reader, with the same
  assertions (above).
- `LimenError refuses a code that is not an upper-case identifier`: the first half of a test that was split; its
  assertion is unchanged.
- `LimenError refuses the next "" …` and `… " " …`: `HEAD` already refused a blank `next` on a refusal; the tests
  keep that refusal under the stricter rule (the two other cases of that loop, prose and `limen`, fail before).
- `readOutcome refuses code null with a failure class`, `… a word for the code of a success`, `… an unknown
  class`, `… a code that is not an identifier`, `… an unknown key`, and `readOutcome shows a final line that is not
  JSON whole in its message`: only their fixtures changed (`next` null, a command instead of prose); each fails on a
  field checked before `next`, as before.
- `GROUP_WAIT_MEMBERS_ONLY: the lead's group wait exits 1 …` and the other tests of these files that pass before:
  unchanged assertions; only their import moved to the reader, and their `next` was already a command.

### Round 1 fixes: each test fails when its mechanism is broken

At `HEAD` each of the three files fails at load (above), so a mutation shows each test's own reason. Each mutation
was undone, and the gate of 566/566 ran on the tree without it.

Fix 3. Mutation: `readerImports` replaced by the round-0 scan, the regex
`/import\s*\{[^}]*\b(?:readOutcome|outputText)\b[^}]*\}\s*from\s*"[./]*\/src\/outcome\.ts"/`.
`node --test --test-name-pattern='scan of test files' test/final-line.test.ts` → `tests 9`, `pass 2`, `fail 7`:

```
✔ D-046 (3): the scan of test files passes a named import of LimenError from src/outcome.ts
✔ D-046 (3): the scan of test files refuses a named import of readOutcome, which reaches the readers of src/outcome.ts
✖ D-046 (3): the scan of test files refuses a named import of outputText under an alias, over several lines, which reaches the readers of src/outcome.ts
✖ D-046 (3): the scan of test files refuses a named re-export of readOutcome, which reaches the readers of src/outcome.ts
✖ D-046 (3): the scan of test files refuses a namespace import of the types, which reaches the readers of src/outcome.ts
✖ D-046 (3): the scan of test files refuses a namespace import, which reaches the readers of src/outcome.ts
✖ D-046 (3): the scan of test files refuses a side-effect import, which reaches the readers of src/outcome.ts
✖ D-046 (3): the scan of test files refuses a star re-export, which reaches the readers of src/outcome.ts
✖ D-046 (3): the scan of test files refuses an import() of a literal path, which reaches the readers of src/outcome.ts
  AssertionError [ERR_ASSERTION]: import * as outcome from "../src/outcome.ts";
  0 !== 1
```

Two of these cases pass under the old scan, by design. The plain named import of `readOutcome` is the one form the
old scan already caught; it is kept as the baseline of the table. The passing `LimenError` import shows the scan
refuses no other name. The aliased multi-line case fails under the old scan only because it uses single quotes.

A second mutation drops `final-line.ts` from the scan's allowed files. The scan over the real tree then fails and
names the real import: `'final-line.ts: import { type Outcome, type Output, readOutcome as outcomeOf, outputText as
textOf } from "../src/outcome.ts"'`. So the tree scan reads the files it walks, not only the fixtures.

Fix 7. Mutation: `notMigratedNotice` with `const first = \`${error.next}, then \`;`, the template of round 0.
`node --test --test-name-pattern='NOT_MIGRATED' test/hook/wake.test.ts` → `fail 1`:

```
✖ NOT_MIGRATED: the hook's note with a null next asks to run only limen migrate, never null
  + 'limen: wakes are off in this project: older records; run null, then limen migrate, then reload this coordinator session (/reload): the hook checks only at session start'
  - 'limen: wakes are off in this project: older records; run limen migrate, then reload this coordinator session (/reload): the hook checks only at session start'
```

Fix 8. Two mutations of the mapping in `groupWaitCommand`, each run with
`node --test --test-name-pattern='past the CLI cap' test/cli/group.test.ts` → `fail 1`. In (1), the limit throws as
at `HEAD` (`LimenError` transient `GROUP_WAIT_TIMEOUT`, `next` `limen group status`). In (2), the `next` is
`limen group wait` with none of the call's words:

```
(1) AssertionError [ERR_ASSERTION]: group wait timed out after the 0.05-second CLI cap; inspect any uncertain delivery receipt before retrying
    {"class":"transient","code":"GROUP_WAIT_TIMEOUT","next":"limen group status"}
    3 !== 0
(2) +     next: 'limen group wait'
    -     next: 'limen group wait --timeout 10s'
```

### Round 2 fix: each new case fails under the round-1 scan and passes under the AST scan

At `HEAD`, `test/final-line.test.ts` fails at load (above), so the round-1 regex scan is the "before". Each run
below is `node --test --test-name-pattern='scan of test files' test/final-line.test.ts`.

Test first: the six cases were added to the round-1 file while its regex scan was still in place → exit 1,
`tests 15`, `pass 9`, `fail 6`, each failing with `0 !== 1`. Then, on the finished file, a mutation that restores
the round-1 `readerImports` word for word (`OUTCOME_PATH`, `NAMED`, `WHOLE`, `importedName`, ignoring the `file`
argument) gives the same result. The mutation was undone (`cmp` against a copy of the finished file → no
difference):

```
✔ D-046 (3): the scan of test files refuses a named import of readOutcome, which reaches the readers of src/outcome.ts
✔ D-046 (3): the scan of test files refuses a named import of outputText under an alias, over several lines, which reaches the readers of src/outcome.ts
✔ D-046 (3): the scan of test files refuses a named re-export of readOutcome, which reaches the readers of src/outcome.ts
✔ D-046 (3): the scan of test files refuses a namespace import, which reaches the readers of src/outcome.ts
✔ D-046 (3): the scan of test files refuses a namespace import of the types, which reaches the readers of src/outcome.ts
✔ D-046 (3): the scan of test files refuses a star re-export, which reaches the readers of src/outcome.ts
✔ D-046 (3): the scan of test files refuses an import() of a literal path, which reaches the readers of src/outcome.ts
✔ D-046 (3): the scan of test files refuses a side-effect import, which reaches the readers of src/outcome.ts
✖ D-046 (3): the scan of test files refuses a named import with a comment inside its braces, which reaches the readers of src/outcome.ts
✖ D-046 (3): the scan of test files refuses a namespace import with a comment after import, which reaches the readers of src/outcome.ts
✖ D-046 (3): the scan of test files refuses a named import of readOutcome by its string name, which reaches the readers of src/outcome.ts
✖ D-046 (3): the scan of test files refuses a named import whose path has a ./ segment, which reaches the readers of src/outcome.ts
✖ D-046 (3): the scan of test files refuses a named import whose path has a query, which reaches the readers of src/outcome.ts
✖ D-046 (3): the scan of test files refuses an import() of a URL of a literal path against import.meta.url, which reaches the readers of src/outcome.ts
✔ D-046 (3): the scan of test files passes a named import of LimenError from src/outcome.ts
ℹ tests 15
ℹ pass 9
ℹ fail 6
  AssertionError [ERR_ASSERTION]: import { /* } */ readOutcome } from "../src/outcome.ts";
  0 !== 1
  AssertionError [ERR_ASSERTION]: import /* x */ * as outcome from "../src/outcome.ts";
  0 !== 1
  AssertionError [ERR_ASSERTION]: import { "readOutcome" as read } from "../src/outcome.ts";
  0 !== 1
  AssertionError [ERR_ASSERTION]: import { readOutcome } from "../src/./outcome.ts";
  0 !== 1
  AssertionError [ERR_ASSERTION]: import { readOutcome } from "../src/outcome.ts?x";
  0 !== 1
  AssertionError [ERR_ASSERTION]: const outcome = await import(new URL("../src/outcome.ts", import.meta.url).href);
  0 !== 1
```

Under the AST scan the same run → exit 0, `tests 15`, `pass 15`, `fail 0`: the 14 refused cases and the passing
`LimenError` import.

Two mutations of the tree scan show that it reads the real files and resolves paths from nested folders. Each was
undone (`cmp` → no difference).

- With `final-line.ts` dropped from `OWN_READERS`, the tree scan fails and names the real import:
  `'final-line.ts: import { type Outcome, type Output, readOutcome as outcomeOf, outputText as textOf } from
  "../src/outcome.ts";'`.
- With `LimenError` added to `READERS`, it fails and names exactly the 10 test files that import `LimenError`
  outside `test/outcome.test.ts`, among them `hook/group-peer.test.ts`, `job/record.test.ts` and
  `platform/requirements.test.ts` with `../../src/outcome.ts`. These are the same files as
  `git grep -l -E 'LimenError.*from "(\.\./)+src/outcome\.ts"' -- test` without `test/outcome.test.ts`.

## Deviations from the ticket

- `TICKET_CHECK_FAILED`'s `next` names the branch the check ran on: the one given, or, when none was given, the
  current branch, as `HEAD` did. Change 3 says "the branch given"; when none is given that would be
  `limen ticket check` alone. I kept the resolved branch, which is a concrete value (D-045 (5.1)) and checks the same
  branch from any folder.
- "The prose on stderr in its present wording" (Change 3), read together with AC-5: the prose part of the old `next`
  ("fix the tickets listed above", "fix the errors listed above") is a line of its own after the refusal's unchanged
  line; the words ", then run …" became the `next` itself.
- Change 4's text line needed a way to print it only for the command the caller ran: `Success.text`, which `main`
  prints before the final line. Printing in `startSpawn` would also print it for a group's in-process launches.
- Two helpers beyond the named sites: `commandOf` in `src/main.ts` (Change 7 asks for `--help` and bare group words
  "as `main` treats them", so the reader uses `main`'s own rules instead of a copy), and `limenCommand` with
  `Parsed.commandLine` in `src/parser.ts` (the concrete values of Changes 3, 5 and 6 are built and quoted in one
  place, the same way `commandWith` already did).
- `GITHUB_NETWORK`'s retry time: "the reset time on stderr when GitHub sends `x-ratelimit-reset` or `retry-after`".
  `x-ratelimit-reset` is used only when `x-ratelimit-remaining` is `0`, since GitHub sends it on most answers, also
  on a 5xx that is not a limit; `retry-after` wins when both are present. This is GitHub's documented order.
  Review round 1 accepted this and the `TICKET_CHECK_FAILED` deviation above (`ticket.md` → `## Decisions`).
- Round 1, Fix 3: the scan follows the main session's reading of Fix 3, recorded in `ticket.md` → `## Decisions` on
  this implementer's `BLOCKED`. It refuses only the import forms that reach `readOutcome` and `outputText`. A named
  import of other names stays allowed, since 11 test files import `LimenError`, `EXIT_CODES`, `FINAL_LINE_KEYS` or
  `finalLine` and none of those reads a final line.
- Round 1, Fix 8: to run the test without the 20 s wait, `groupWaitCommand` got an optional third parameter,
  `capMs` (default `WAIT_CAP_MS`). Fix 8 names only the parameter of `waitCapped`, but the mapping under test lies
  between the two, so the bound had to reach it from the command.
- Round 2, Fix R2-1: "one helper for both, in the module that owns it". No module owned the reading of imports:
  `runtimeImports` was local to `test/boundary.test.ts`, and another file cannot import a test file without running
  its tests. So the helper is a new module named after its concept, `test/imports.ts` (T-25 (2), (3)), and both
  scans use it.
- Round 2, Fix R2-1: `runtimeImports` now gives the literal path for two forms whose code it gave before, a template
  with no substitution and an `import()` of `new URL(<literal>, import.meta.url)`, because they come from the shared
  reader. `src/boundary.ts`, the only file it scans, has neither, and its fixture test is unchanged.

## Measurement

- `unmeasured` M-05: whether the coordinator still ends its turn after a spawn now that "End your turn; Limen wakes
  you when the job ends." is a text line before the final line, not its `next` (model behaviour on the seat; T-34's
  counts of `sleep` calls and repeated `status` reads).
- `unmeasured`, no metric in `## Measurement`: whether a team member re-enters `group wait` on exit 0 with the same
  call in `next` as it did on exit 3 (groups are a module, off by default; no M-NN covers them).

## Open points

- `jobs <ref>` still writes the ref unquoted into `limen show <ref>` (its computed `next` is R-023's, D-045 (2));
  the table test checks it with the token `a1b2c3d4`.
- The first implementer's point on "run null" in `hook/wake.ts` is closed by Fix 7 of round 1.
- The scan's limit (Fix 3, kept by Fix R2-1): an `import()` whose path is computed, such as
  `import(join(SRC, "outcome.ts"))`, is beyond any static scan, since its path exists only when the code runs. The
  scan reads literal paths and resolves them against the file. Today `test/` holds two computed `import()` calls,
  and neither names `src/outcome.ts`: `test/registry.test.ts` loads the files of `src/commands/`, and
  `test/fake-engine.mjs` loads the extension it is given. Two forms count as computed for the same reason: a
  `new URL(<literal>, <base>)` whose base is not `import.meta.url`, and a concatenation of literals.
- Not an import form of the decision, so not read by the scan: a `require()` through `createRequire`, which Node 24
  can use to load an ES module such as `src/outcome.ts`. No file of `test/` uses `createRequire`
  (`git grep -n createRequire -- test` → exit 1).
- A fake `pi` coordinator session from an older gate run (`limen-plant-SAR0bR`, about 5 h 45 min old, started before
  the first implementer's runs) was still running on the laptop at that time; it was left alone.
