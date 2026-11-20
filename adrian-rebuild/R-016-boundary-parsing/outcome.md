<!-- PL: Wynik ticketu R-016 (20.11; szkic implementera): nowy moduł granicy `src/boundary.ts` parsuje JSON z zewnątrz
ręcznie pisanymi walidatorami (string, wzorzec, liczba z granicami, literały, pole opcjonalne, obiekt ze znanymi
polami, alternatywa, czas trwania) i daje wartość z typem albo błąd `BAD_DATA` z plikiem, polem i oczekiwaniem.
Czytniki `limits.json`, `start-gate.json` i linii końcowej przechodzą przez niego z dawnymi politykami; skany
w `test/structure.test.ts` trzymają `JSON.parse` poza modułem (38), rzutowania (75 i 7 w `test/`) i zakaz
`as unknown as`. Po recenzji 1 poprawki 1–6: cała linia końcowa w komunikacie, pole ucieczkowane, unikalne nazwy
funkcji, jeden identyfikator w nazwie testu, pełny skan importów, brak pustego segmentu pola. Po recenzji 2 poprawki
1–2: każdy znak sterujący oraz U+2028 i U+2029 ucieczkowane w polu i wartości, opcja `uncut` zamiast drugiego
znaczenia `whole`. Bramka: 310 testów, 0 porażek. Stan: szkic do recenzji 3. -->

# Outcome: R-016 One boundary parsing module with validators; the cast ratchet

## Review round 2 fixes

`ticket.md` → `## Decisions`, the entry of review round 2, items 1 and 2. Each test was written first and run before
its fix, in the working tree (`node --test test/boundary.test.ts`: exit 1; tests 24, pass 21, fail 3); after the
fixes `node --test test/boundary.test.ts test/outcome.test.ts test/project/limits.test.ts
test/runtime/start-queue.test.ts test/structure.test.ts` exits 0 with tests 85, pass 85. The test builds the
characters with `String.fromCodePoint`, and checks the message by code points, so neither source file holds one raw.

1. Finding 1, every control character, U+2028 and U+2029 are escaped. `JSON.stringify` escapes only the C0 controls,
   so `escaped(text)` writes each character of `RAW = /[\p{Cc}\p{Zl}\p{Zp}]/gu` (every `\p{Cc}`: C0, DEL and the C1
   controls; `\p{Zl}` is U+2028 and `\p{Zp}` U+2029) as a lower-case `\uXXXX`; `shownValue` and `shownField` apply it
   to the value's JSON and to the field. The comments of `RAW`, `escaped`, `shownValue` and `shownField` say what is
   escaped. New test: "DEL, the C1 controls, U+2028 and U+2029 are escaped in the field and the value of a message"
   (U+007F, U+0085, U+009B, U+2028, U+2029 in a key and in its value; the message equals `fixture.json:
   k\u007f\u0085\u009b\u2028\u2029: expected one of the fields k, got "v\u007f\u0085\u009b\u2028\u2029"` with each
   escape as six characters, and no code point of the message is a control, U+2028 or U+2029). Before the fix:
   `actual: 'fixture.json: k\x7F\x85\x9B` followed by the raw U+2028 and U+2029, in the field and in the value.
2. Finding 2, `whole` has one meaning in `src/boundary.ts`, the whole value a validator reads: the option that shows a
   value uncut is `{ uncut: true }` (`Shown.uncut`; `src/outcome.ts` passes it in `readOutcome` and `finalLine`), and
   `numberIn`'s local is `numeric`. New tests: "checkValue with uncut shows a long value in full" (before the fix the
   option was unknown and the value was cut: `actual: 'fixture.json: expected a number, got "xxx…` with 39 `x`) and
   "the word whole in src/boundary.ts names only the whole value" (each line with "whole" holds it only in "the whole
   value"; before the fix it listed lines 61, 63, 65, 66 and 68, the option, and 184-185, the local).

## Review round 1 fixes

`ticket.md` → `## Decisions`, the entry of review round 1, items 1–6. Each test was written first and run before its
fix, in the working tree (`node --test test/boundary.test.ts test/outcome.test.ts test/project/limits.test.ts
test/runtime/start-queue.test.ts test/structure.test.ts`: exit 1; tests 82, pass 66, fail 16); after the fixes the
same command exits 0 with tests 82, pass 82.

1. Finding 2, a final line that is not JSON is shown whole. `parseJson` and `checkValue` take `{ whole: true }`
   (`{ uncut: true }` since review round 2, fix 2), which shows the refused value whole; without it, the values of data files are still cut after 40 characters. `readOutcome`
   and `finalLine` pass it, since the final line is one line a command wrote. New test in `test/outcome.test.ts`:
   "readOutcome shows a final line that is not JSON whole in its message" (an 81-character line). Before the fix:
   `actual: 'the final line on stdout: : expected JSON, got "{\"class\":\"ok\",\"code\":0,\"next\":\…'`; at `HEAD`:
   `actual: 'no final line on stdout: its last line is not JSON: {"class":"ok",…}'` (the whole line, unescaped).
2. Finding 3, the field of a `BAD_DATA` message is escaped like the value: `shownField` writes the path as JSON
   escapes a string, without the quotes, so `toolCalls` stays `toolCalls` and a key with a newline reaches the message
   as `time\nout`. The error's `field` keeps the path as it is. New test in `test/boundary.test.ts`: "a field that
   holds a newline is escaped in the message as the value is, so a log line stays one line". Before the fix: `actual:
   [ 'time\nout', 'fixture.json: time\nout: expected one of the fields timeout, got "2h"' ]` (a raw newline).
3. Finding 5, new names: `outcomeOf` → `finalLineOf` (`src/outcome.ts`; `seat/deploy.ts` declares `outcomeOf`),
   `printable` → `shownValue` (`seat/deploy.ts` declares `printable`), `number` → `numberIn` (`src/project/lanes.ts`
   declares `number`), with their call sites in `src/project/limits.ts`, `src/runtime/start-queue.ts` and the tests.
   New test in `test/structure.test.ts`: "T-25: the functions of src/boundary.ts and src/outcome.ts have names no other
   file of src/, hook/, bin/ or seat/ declares" (every function declaration, at any depth, by the TypeScript AST).
   Before the fix: `actual: [ 'seat/deploy.ts: printable', 'seat/deploy.ts: outcomeOf', 'src/project/lanes.ts:
   number' ]`.
4. Finding 6, the test name "T-27: a text that is not JSON gives BAD_DATA with the file, …" is now "T-27: a text that
   is not JSON gives the typed error with the file, an empty field and the expectation JSON". New test in
   `test/boundary.test.ts`: "each test name of this file holds at most one identifier" (a rule or decision ID, or an
   error code with an underscore, such as `BAD_DATA`). Before the fix: `actual: [ 'T-27: a text that is not JSON
   gives BAD_DATA with the file, an empty field and the expectation JSON' ]`.
5. Finding 7, the import test: `runtimeImports(text)` in `test/boundary.test.ts` now walks the TypeScript AST and
   lists each `import` and `export … from` that is not type-only and each `import(…)` (a non-literal path is listed
   as its call text, so it fails the test). New test: "the import scan finds a side-effect import, an export from a
   module and a dynamic import, and skips type-only imports". Before the fix (the regex helper): `actual: [
   'node:fs', './types.ts' ], expected: [ 'node:fs', './side.ts', './re.ts', './all.ts', './lazy.ts' ]`.
6. Open point 1, no empty segment: `badData` writes `<file>: expected <expected>, got <value>` when the field is the
   whole value. The expected messages of 11 tests changed with it (6 in `test/boundary.test.ts`, 3 in
   `test/outcome.test.ts`, 1 each in the limits and start-queue tests); before the fix each failed on the empty
   segment, e.g. `actual: 'fixture.json: : expected a string, got 3'`, `actual: 'the final line on stdout: : expected
   JSON, got "started demo"'`, `actual: [ '.agents/limen/limits.json: : expected an object, got ["prepare","20m"]' ]`.

## Done

- Change 1, new `src/boundary.ts` (imports `parseDuration` from `src/job/job.ts` and `LimenError` from
  `src/outcome.ts`, nothing else):
  - `Validator<T> = (value, field) => T`: a validator reads `value` found at `field` (a path such as `toolCalls` or
    `ids.job`, empty for the whole value) and throws an internal `Mismatch` for a value of another shape. Only
    `checkValue` and `parseJson` run validators for a caller, and they turn the mismatch into the typed error, so no
    caller gets a `Mismatch`.
  - Validators, each used by a converted reader: `string` and `matching(pattern, expected)` (the final line's `next`,
    `code` and `ids` formats), `numberIn({ integer?, min?, max? })` (`toolCalls`: "an integer of at least 1";
    `cpuIdle`, `memoryFree`: "a number from 0 to 100"), `oneOf(literals)` (the final line's class and the `0` of
    `ok`, the gate's `"off"`), `optional` (the line's `ids`), `object(known?)` (an object as its fields by name; with
    `known`, a field outside it is refused at its path), `either(first, second)` (the gate's `"off"` or an object;
    a mismatch inside a field goes on as it is, otherwise the expectation names both), `duration` (a JSON string in
    the form of `parseDuration`). `at(field, key)` joins a path.
  - `parseJson(file, text, validator, { uncut? }): T | BadData`, the one function that parses a JSON text from a
    named source; `checkValue(file, value, validator, { field?, uncut? })` for a value already parsed (`finalLine`
    checks its own outcome with it); `eachField(file, fields, readers)`, the shared policy of `limits.json` and
    `start-gate.json`: each field is optional and read on its own, each valid one is kept, and each invalid or unknown
    one gives its typed error.
  - `BadData`: a `LimenError` of class `environment`, code `BAD_DATA`, `next` "" (R-089 makes it `null`), with
    `file`, `field` and `expected`. The message is `<file>: <field>: expected <expected>, got <value>`, and `<file>:
    expected <expected>, got <value>` when the field is the whole value (fix 6). The field is escaped as JSON escapes
    a string, without the quotes (fix 2); the value is its JSON, cut after 40 characters with "…" unless `uncut` (fix
    1), or `nothing` for a missing field; in both, every control character, U+2028 and U+2029 that JSON leaves raw is
    a `\uXXXX` escape (review round 2, fix 1). A text that is not JSON has the field empty, the expectation `JSON` and the
    `SyntaxError` as its cause.
  - `src/outcome.ts` imports this module and this module imports `LimenError` from it. Each of the two uses the other's
    exports only inside functions, never while it loads, and a comment in each says so; loading each of
    `src/boundary.ts`, `src/outcome.ts`, `src/project/limits.ts`, `src/runtime/start-queue.ts` and `src/main.ts`
    first in a fresh process and then calling `finalLine` works (a one-off `node --input-type=module -e` per module).
- Change 2, the three readers:
  - `plantLimits` (`src/project/limits.ts`): `parseJson(PLANT_LIMITS, text, object())`, then `eachField` with
    `{ prepare: duration, toolStall: duration, toolCalls: numberIn({ integer: true, min: 1 }) }`. A file that is not a
    JSON object is ignored as a whole and named (`.agents/limen/limits.json: expected an object, got […]`); an
    invalid entry (`… toolCalls: expected an integer of at least 1, got 0`) or an unknown one (`… timeout: expected
    one of the fields prepare, toolStall or toolCalls, got "2h"`) is ignored on its own. `ignored` now holds the
    typed errors (deviation 1). The job log line is `limits: ignored <message>; <message>` (`src/runtime/job-setup.ts`).
  - `startGate` (`src/runtime/start-queue.ts`): `parseJson(GATE_FILE, source, either(oneOf(["off"]), object()))`;
    `"off"` turns the gate off; an object goes through `eachField` with `{ cpuIdle, memoryFree: numberIn({ min: 0,
    max: 100 }), settle: duration }` over the defaults; a file of another shape keeps the default gate and is named
    (`start-gate.json: expected "off" or an object, got "on"`). The job log and `limen seat queue` print `start gate:
    ignored <message>; …`; the closing hint "use cpuIdle and memoryFree from 0 to 100, and settle such as 60s" goes,
    since each message carries its expectation. `settleMs` went with its `catch`.
  - `readOutcome` (`src/outcome.ts`): `parseJson(\`the final line on ${stream}\`, line, finalLineOf, { uncut: true
    })`; a refusal is thrown as `broken(message, cause)`, so class `internal` and code `INTERNAL` stay and the message
    names the stream: `the final line on stdout: next: expected a string, got null`, and a line that is not JSON whole:
    `the final line on stdout: expected JSON, got "…"` (fix 1). `finalLineOf` and `idsOf` hold today's schema of
    `checkedOutcome`: known keys `class`, `code`, `next`, `ids`; `code` `0` for `ok`, otherwise an upper-case
    identifier; `next` a string; `ids` optional, keys `job`, `ticket`, `question`, each in its format, in the order of
    the line. `checkedOutcome`, `checkedCode` and `checkedIds` went. "no final line on <stream>: it is empty" and the
    exit-code mismatch message stay as they were.
  - AC-3's `git grep` finds no line in `src/project/limits.ts` or `src/outcome.ts`.
- Change 3, scans in `test/structure.test.ts`, each over `knownSources(folders)`, the files `knownFiles`
  (`test/known-files.ts`) lists below the folders:
  - "T-27: JSON.parse appears in src/, hook/, bin/ and seat/ outside src/boundary.ts at most its baseline count":
    `JSON_PARSE = 41 - 3`, with the comment that names the 41 sites at R-015's commit and the three readers R-016
    moved. Now 38.
  - The cast count: `castsIn(path, text)` parses with `ts.createSourceFile` (the `typescript` dev dependency) and
    takes each `AsExpression` whose type is not `const` (`ts.isConstTypeReference`) and each
    `TypeAssertionExpression`; `as unknown as` is an `as` whose operand, inside any parentheses, is an `as unknown`.
    `CAST_EXCEPTIONS` is an empty constant whose entries would name the file, the cast's text and the reason.
    `CASTS = { runtime: 75, test: 7 }`, with the comment "75 - 0 … and 7 - 0 … (R-016 moved no reader that held a
    cast)": the three readers held no cast, and the diff adds none. Two tests ("T-27: the casts in src/, hook/, bin/
    and seat/ …", "T-27: the casts in test/ …") check the counts outside the exception list, and "T-27: no file in
    src/, hook/, bin/, seat/ or test/ casts a value as unknown as another type" checks the ban, which the exception
    list does not cover. The scan reads `.ts` files; `bin/` holds none (`bin/limen` is JavaScript).
  - "the cast scan finds as T, an angle-bracket assertion and as unknown as, and skips as const, import aliases and
    the word as in text": a fixture source with `import { … as read }`, a comment and a string holding "as",
    `["a"] as const`, `JSON.parse(said) as number`, `<string>JSON.parse(said)` and `said as unknown as number[]`, and
    `export { read as reader, … }`; the scan gives exactly the four casts of lines 5–7, the outer one of line 7 marked
    `as unknown as`.
- Change 4, tests: new `test/boundary.test.ts` (21 tests: each validator, `eachField`, `parseJson` on a valid text,
  "T-27: a text that is not JSON gives the typed error …", the message form, the escaped field, "T-27: a damaged
  limits.json gives a typed error with the file, the field and the expectation", "T-27: a damaged start-gate.json
  gives …", a test that `src/boundary.ts` imports only `node:` modules, `src/outcome.ts` and `src/job/job.ts`, the
  fixture test of its import scan, and the test of the file's test names). Changed with the message form:
  `test/project/limits.test.ts` (the `toolCalls` test, and a new test for a file that is not an object),
  `test/runtime/start-queue.test.ts` (the object test, and a new test for a file of another shape),
  `test/outcome.test.ts` (the regexes of "a missing final line", "a line that is not JSON" and "a line that is not
  an object" now match the new message from its start, and the new whole-line test), `test/s3-finish-wake.test.ts`
  (deviation 5). `test/structure.test.ts` also holds the T-25 name scan of fix 3.
- Change 5: `docs/jobs.md` quotes no ignored-entry message (`:161` and `:190` say only that the job log names each
  ignored value), so it does not change.

## Proof

From the repository root, Node 26.13.1, git 2.34.1 (the gate prints its shim line):

- `node adrian-rebuild/tools/gate.mjs` (AC-5), run 1: exit 1; "Checked 174 files … No fixes applied."; tests 302,
  pass 301, fail 1: `test/s3-finish-wake.test.ts`, "stop, timeout and a stalled tool each end a job once and wake its
  session once; 80% of a timeout steers once", whose regex quoted the old job-log wording `timeout is not a limit`
  (the log held `limits: ignored .agents/limen/limits.json: timeout: expected one of the fields prepare, toolStall or
  toolCalls, got "2h"`). My change sets that wording, so the test changes with it (deviation 5); it is not a failure
  of code the change does not touch.
- `node adrian-rebuild/tools/gate.mjs`, run 2, after that test's regex: exit 0; "Checked 174 files in 311ms. No fixes
  applied."; tests 302, pass 302, fail 0, cancelled 0, skipped 0 (83.0 s).
- `node adrian-rebuild/tools/gate.mjs`, run 3, after the review round 1 fixes: exit 0; "Checked 174 files in 300ms.
  No fixes applied."; tests 307, pass 307, fail 0, cancelled 0, skipped 0 (78.9 s).
- `node adrian-rebuild/tools/gate.mjs`, run 4, after the review round 2 fixes: exit 0; "Checked 174 files in 287ms.
  No fixes applied."; tests 310, pass 310, fail 0, cancelled 0, skipped 0 (76.9 s). R-015's last gate had 277; this
  ticket adds 33 (24 in `test/boundary.test.ts`, 6 in `test/structure.test.ts`, 1 in `test/outcome.test.ts`, 1 each
  in the limits and start-queue tests).
- AC-1: `node --test test/boundary.test.ts`: exit 0; tests 24, pass 24, fail 0.
- AC-2: `node --test test/structure.test.ts`: exit 0; tests 16, pass 16, fail 0.
- AC-3: `git grep --untracked -n 'JSON\.parse' -- src/project/limits.ts src/outcome.ts`: exit 1, no output.
- AC-4: the main session's `fails-before.mjs` run heads `## Fails before`; my own runs at `HEAD` follow it.
- AC-6: `npx tsc --noEmit`: exit 0, no output; `npx biome check --error-on-warnings .`: exit 0, "Checked 174 files …
  No fixes applied." (after the fixes).
- AC-7: `node adrian-rebuild/tools/check.mjs`, after this file was updated for the fixes: exit 0, "… PL summaries:
  128 files; ticket folders: 19; changes: 18 entries; 0 errors".
- `npx biome check --error-on-warnings adrian-rebuild`, after the fixes: exit 0, "Checked 30 files … No fixes
  applied."
- Counts at the working tree: `JSON.parse` outside `src/boundary.ts` 38 (`git grep --untracked -o 'JSON\.parse' --
  src hook bin seat`, without `src/boundary.ts`); casts 75 in `src/`, `hook/`, `bin/`, `seat/` and 7 in `test/`, none
  `as unknown as` (the scan's own count, and a one-off AST script in the OS temporary folder that gave 75 and 7 at
  `HEAD` too); `catch {` in `src/` and `hook/` 77, at `HEAD` 80 (`SWALLOWED` allows 81): four went with the two hand
  checks, one came in `duration`.

## Fails before

The main session's run (2026-11-20, after the implementer's first run, before review round 1):
`node adrian-rebuild/tools/fails-before.mjs` → exit 0, "fails-before: test/outcome.test.ts, test/project/limits.test.ts,
test/runtime/start-queue.test.ts, test/s3-finish-wake.test.ts, test/structure.test.ts, test/boundary.test.ts fail at
HEAD (exit 1)". Again after the round-1 fixes, before review round 2: exit 0, the same line; the main session's gate
`node adrian-rebuild/tools/gate.mjs` → exit 0, 307/307. Again after the round-2 fixes, before review round 3: exit 0, the
same line; the gate → exit 0, 310/310.

The implementer's runs, test by test. Each run on the code of `HEAD` (`0c22548`): the new and changed test files only, from the working tree. The first
runs were made in the working tree before I created `src/boundary.ts` or changed any file of `src/`; the last two
with a one-off script in the OS temporary folder that does what `fails-before.mjs` does (`HEAD` from `git archive`
in a temporary repository, the test files laid over it, `node_modules` linked, the gate's environment from
`adrian-rebuild/tools/gate-env.mjs`) and prints every pass and fail line.

- `node --test test/boundary.test.ts`, before the change: exit 1; tests 1, fail 1; `Error [ERR_MODULE_NOT_FOUND]:
  Cannot find module '…/src/boundary.ts' imported from …/test/boundary.test.ts`. The module is new, so all 18 tests
  fail at `HEAD` for that reason; each of them calls the module or the typed errors of the readers, so none would
  pass at `HEAD` without it.
- `node --test test/structure.test.ts`, before the change: exit 1; tests 15, pass 14, fail 1; "T-27: JSON.parse
  appears in src/, hook/, bin/ and seat/ outside src/boundary.ts at most its baseline count" fails with
  `AssertionError: 41 sites of JSON.parse outside src/boundary.ts, at most 38`.
- `node --test test/project/limits.test.ts test/runtime/start-queue.test.ts`, before the change: exit 1; tests 10,
  pass 6, fail 4: "a toolCalls that is not a positive integer is ignored with its reason, and an unknown key names
  toolCalls" (`actual: { limits: {}, ignored: [ undefined, undefined ] }`: `HEAD` gives strings in the old wording,
  not typed errors), "a limits file that is not a JSON object is ignored as a whole and named" (`ignored: [ undefined
  ]`), "a seat with no start-gate.json gets the default gate, and a gate file object reads as it did" (`ignored: [
  undefined, undefined ]`, the second being the old hint line), 'a start-gate.json that is neither "off" nor an
  object keeps the default gate and names the file' (`ignored: [ undefined ]`).
- `node --test --test-name-pattern='not JSON|not an object' test/outcome.test.ts`, before the change: exit 1; tests
  2, fail 2: `actual: 'no final line on stdout: its last line is not JSON: {"class":"ok",'` against `/^the final line
  on stdout: : expected JSON, got /`, and `actual: 'the final line on stdout is not an object'` against `/^the final
  line on stdout: : expected an object, got \[0\]$/` (the first draft's regexes, with the empty field segment that fix
  6 removed; the current ones fail at `HEAD` on the same messages).
- The one-off script on `test/boundary.test.ts test/outcome.test.ts test/project/limits.test.ts
  test/runtime/start-queue.test.ts test/structure.test.ts` at `HEAD`: exit 1; tests 60, pass 51, fail 9: the file
  `test/boundary.test.ts` (does not load), the three `readOutcome` tests ("a missing final line": `actual: 'no final
  line on stdout: its last line is not JSON: started demo'`, "a line that is not JSON", "a line that is not an
  object"), the four limits and start-gate tests above, and the `JSON.parse` scan.
- The one-off script with `--test-name-pattern='stop, timeout and a stalled tool'` on `test/s3-finish-wake.test.ts`
  at `HEAD`: exit 1; tests 1, fail 1; the log holds `limits: ignored in .agents/limen/limits.json: timeout is not a
  limit; use prepare, toolStall or toolCalls`, which the new regex does not match.
- The three tests of the review round 2 fixes, before each fix, in the working tree: see `## Review round 2 fixes`
  (exit 1; tests 24, pass 21, fail 3). At `HEAD` they fail with the rest of `test/boundary.test.ts`, which does not
  load there; each calls `src/boundary.ts` or reads it, so none would pass at `HEAD` without it.
- The tests of the review round 1 fixes, before each fix, in the working tree: see `## Review round 1 fixes` (exit 1;
  tests 82, pass 66, fail 16, each failing for its fix's reason).
- The same one-off script with `--test-name-pattern='whole in its message|T-25'` on `test/outcome.test.ts
  test/structure.test.ts` at `HEAD`: exit 1; tests 2, fail 2. "readOutcome shows a final line that is not JSON whole in
  its message": `actual: 'no final line on stdout: its last line is not JSON: {"class":"ok","code":0,"next":"End your
  turn; Limen wakes you when the job ends."'` (the old wording). "T-25: the functions of src/boundary.ts and
  src/outcome.ts have names …": `AssertionError: 9 function names in the two modules`, its guard against an empty
  scan, because `src/boundary.ts` does not exist at `HEAD`; `HEAD`'s `src/outcome.ts` shares no name with another
  file, so the collision itself shows only in the working-tree run before fix 3 (`seat/deploy.ts: printable`,
  `seat/deploy.ts: outcomeOf`, `src/project/lanes.ts: number`).

### New tests that pass at `HEAD`

Four are in `test/structure.test.ts`; they guard a property `HEAD` already has, so no code change of this ticket can
make them fail first:

- "the cast scan finds as T, an angle-bracket assertion and as unknown as, and skips as const, import aliases and the
  word as in text": it checks the test's own scan on a fixture text and runs no code of `src/`.
- "T-27: the casts in src/, hook/, bin/ and seat/ other than as const stay at most their baseline count": the baseline
  is the count at `HEAD` (75) less the casts this ticket removes, and it removes none, so `HEAD` is at the baseline.
- "T-27: the casts in test/ other than as const stay at most their own baseline count": likewise, 7 at `HEAD`.
- "T-27: no file in src/, hook/, bin/, seat/ or test/ casts a value as unknown as another type": `HEAD` has none; the
  test keeps it so.

Two of `test/boundary.test.ts` check only the test's own helpers and would pass at `HEAD` but for the file's import of
`src/boundary.ts`, which makes the whole file fail there: "the import scan finds a side-effect import, …" (it failed
in the working tree before fix 5, with the regex helper) and "each test name of this file holds at most one
identifier" (it failed before fix 4).

The other tests of the changed files are their earlier tests, unchanged, and pass at `HEAD`.

## Deviations from the ticket

1. `plantLimits` and `startGate` return `ignored` as the typed errors (`readonly BadData[]`), not their messages, so
   that the tests of Change 4 can check the file, the field and the expectation of a damaged file. Their three callers
   print `message`. The job log line of `src/runtime/job-setup.ts` was `limits: ignored in <file>: …`; each message
   now starts with the file, so the line is `limits: ignored <messages>`, and `PLANT_LIMITS` left that file's import.
2. No validator for booleans or arrays: no converted reader uses one, and Change 1 says no validator is written that
   no reader uses; its list of shapes names them. Two validators the list does not name are written because a reader
   uses them: `matching` (a string with a pattern: the final line's `code` and `ids`) and `either` (a union: the gate's
   `"off"` or an object).
3. `duration` takes only a JSON string. At `HEAD` both readers ran `parseDuration(String(value))`, so a value such as
   `["20m"]` was read as 20 minutes; it is now ignored and named. The documented forms (`docs/jobs.md:161`, `:182`, `:185`)
   are strings, and the valid-input tests keep passing (the ticket's risk).
4. Fix 1 shows the final line whole in more than the case it names: `{ uncut: true }` applies to every message of
   `readOutcome` and `finalLine`, so a field value of the line (a long `next`) is shown whole too, as at `0c22548`,
   where those messages printed the value's JSON uncut. The 40-character cut stays for `limits.json` and
   `start-gate.json`. The first draft's deviation 4 (the empty field segment) went with fix 6.
5. `test/s3-finish-wake.test.ts`, which the ticket does not name, changes one regex: it quoted the job log's old
   ignored-entry wording (Change 4: a test whose expected message changes form changes with it).
6. One test beyond Change 4: `src/boundary.ts` imports only `node:` modules, `src/outcome.ts` and `src/job/job.ts`
   (AC-8's first part, made checkable); after fix 5 it reads every runtime import form.
7. The fourth parameter of `checkValue` is an options object, `{ field?, uncut? }`, instead of the first draft's
   `field`, so that fix 1's `uncut` and the field of `eachField` share one parameter.

## Measurement

None of M-01–M-13 measures this ticket, and nothing of it is `unmeasured`: the change is in-process parsing and two
scans, all checked by the tests above. On the seat only the wording of the ignored-entry lines in the job log and in
`limen seat queue` changes (`## Migration`).

## Open points

1. Closed by fix 6: a message whose field is empty reads `<file>: expected <expected>, got <value>`.
2. `SWALLOWED` in `test/structure.test.ts` still allows 81 `catch {`; the count is now 77. Lowering it is not part of
   Change 3 (R-082 brings it to zero).
3. The `JSON.parse` scan counts the text, as the ticket's `git grep` does, so a comment that names it counts too; no
   such comment exists in the scanned folders outside `src/boundary.ts`.
4. `src/boundary.ts` holds three `catch` blocks: `attempt` (it rethrows anything but a `Mismatch`), `parseJson`
   (the `SyntaxError` becomes the cause of `BAD_DATA`) and `duration` (`parseDuration` throws a plain `Error`). The
   `catch` scan of T-01 (R-082) will need the boundary module beside `src/side.ts` and the transition function.
5. The T-25 scan of fix 3 reads function declarations only. `at` of `src/boundary.ts` is also the name of two local
   arrow functions in `src/picture/picture-model.ts` (`:466`, `:845`); finding 5 did not name it, so it stays.
6. The test-name check of fix 4 covers `test/boundary.test.ts` only, and it takes an error code to be an upper-case
   word with an underscore, so a code without one (`INTERNAL`, `UNTYPED`) is not counted. The scan of T-29 over every
   test file is not this ticket's.
