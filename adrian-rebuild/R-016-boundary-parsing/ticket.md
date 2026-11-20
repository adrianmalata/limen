<!-- PL: Ticket R-016 etapu 2 przebudowy (delegated, T-27 (2)): jeden moduł granicy src/boundary.ts parsuje dane
z zewnątrz ręcznie pisanymi walidatorami bez zależności i zwraca wartość z typem albo błąd z typem, który nazywa plik,
pole i oczekiwanie. Przepina na niego czytniki limits.json, start-gate.json seata i linii końcowej klienta, a dla
pozostałych wywołań JSON.parse i rzutowań `as` wprowadza zapadki (liczba może tylko spadać) oraz zakaz `as unknown as`.
Stan: zamknięty po trzech recenzjach (FAIL, PASS, PASS) i dwóch rundach poprawek, w commicie R-016. -->

# R-016 One boundary parsing module with validators; the cast ratchet

## Problem

At `0c22548` data from outside reaches typed code through 41 `JSON.parse` calls in 21 files of `src/` and `hook/`,
26 of them as `JSON.parse(…) as T` with no check (`git grep -nE 'JSON\.parse\([^;]*\) as ' -- src hook bin seat`). The
three readers that do check write their own checks, each with its own message form and error shape:
- `plantLimits` (`src/project/limits.ts:29-63`): "the file is not JSON", "… is not a duration such as 90s, 20m or 2h",
  returned as `ignored` strings;
- `startGate` (`src/runtime/start-queue.ts:53-…`): the same pattern for the seat's `start-gate.json`;
- `readOutcome` (`src/outcome.ts:111-…`, with `checkedOutcome`): the client's reading of a command's final line (T-26
  (4)), which throws `broken(…)` (`src/outcome.ts:144`, class `internal`, code `INTERNAL`).
No scan stops a new unchecked `JSON.parse` or a new cast; about 77 casts other than `as const` remain (a rough `git
grep` count; the exact count is the AST count of Change 3).

Relied on:
- T-27 (2) (`taste.md`): "Casts: data from outside (`record.json` of S1+, `limits.json`, `routes.json`, the inbox
  envelopes of A-028, the client's JSON line of T-26) goes only through one boundary parsing module with hand-written
  validators per schema (zero dependencies, T-12); the result is a typed value or a typed error with the file, the
  field and the expectation (T-01, z. 12). Pi API events go through one adapter with type guards. Only `as const` is
  free; any other `as` only from a list of exceptions with a reason, under the same ratchet; `as unknown as` never;
  test fixtures use `satisfies`." Check: "a cast scan (beyond `as const` only from the exception list, count ≤
  baseline, `as unknown as` banned); a scan: `JSON.parse` only in the boundary parsing module; validator tests: a
  damaged record and a damaged configuration give a typed error with the file and the field."
- `## Stages` → conventions: "A scan that cannot hold at once over the author's code (`catch`, casts, `biome-ignore`,
  test file names) starts as a ratchet: a baseline count in the repo that may only fall; R-082 and R-083 bring the
  counts to zero (T-27)." The existing ratchets are constants in `test/structure.test.ts:144-163` (`SWALLOWED`,
  `UNTYPED_THROWS`), checked with "at most".
- T-01: a typed error (`LimenError`, `src/outcome.ts:62`) with a class and a code; T-02: only `main` sets the exit code.
- T-12: zero dependencies at run time (`typescript` is a dev dependency, `package.json`, and may serve a test).
- The other sites move with the tickets that rewrite their code, so this ticket does not convert them: Pi events
  (`src/runtime/stream.ts:18`, `src/job/session-commands.ts:98`, `src/job/usage.ts:80`, `src/picture/activity.ts:418`)
  → R-017; job and group records (`src/job/group-*.ts`, `src/project/git.ts:35`, `src/picture/activity.ts:297`, the
  start-queue entries `src/runtime/start-queue.ts:337`, `:378`) → R-021; the GitHub claims and state
  (`src/commands/github.ts`, `src/integrations/github-*.ts`) → R-057; the seat rules (`src/project/seat-rules.ts:28`)
  leave with `rule` (R-034); the rest (Herdr's JSON output and the remaining files) → R-082, which brings the counts to
  zero.

## Change

1. New `src/boundary.ts`, the boundary parsing module, which imports only `node:` modules, `src/outcome.ts` and, for
   the duration form, `parseDuration` (`src/job/job.ts`):
   - hand-written validators for the shapes the converted readers need (strings, numbers with their bounds, booleans,
     literals, optional fields, arrays, objects with known fields, and the duration form of `parseDuration`); no
     validator is written that no reader uses;
   - one function that parses a JSON text from a named source with a validator and returns the typed value, or
     fails with a typed error;
   - the typed error: a `LimenError` (class `environment`, code `BAD_DATA`) that carries `file` (the source's path or
     name), `field` (the path inside the value, such as `toolCalls` or `entries[2].pid`; empty for the whole text) and
     `expected` (what the validator wanted), and whose message is `<file>: <field>: expected <expected>, got <a short
     printable form of the value>`; a text that is not JSON has the field empty and the expectation "JSON", and a message
     whose field is empty reads `<file>: expected <expected>, got <value>` (review round 1).
2. The three readers use it, keeping their behaviour on valid input and their policies on invalid input:
   - `plantLimits` still ignores each invalid or unknown entry and names it, now in the typed error's message form;
     a file that is not a JSON object is still ignored as a whole and named;
   - `startGate` likewise for `start-gate.json` (its object form and the JSON string `"off"` of R-015);
   - `readOutcome` reads the final line through the module; its failures keep their class and code (`internal`,
     `INTERNAL`) and their message names the stream, as today.
3. Scans in `test/structure.test.ts`, beside the ratchets of T-01 and in their form:
   - `JSON.parse` in `src/`, `hook/`, `bin/` and `seat/` outside `src/boundary.ts`: at most its baseline, the count
     at `0c22548` less the sites this ticket removes;
   - casts: every `as` expression of the TypeScript AST (the `typescript` dev dependency) in `src/`, `hook/`, `bin/` and
     `seat/` whose type is not `const`, plus every angle-bracket type assertion, outside an exception list: at most its
     baseline, the count at `0c22548` less the casts this ticket removes; the exception list is a constant beside the
     test, empty now, each future entry with the file, the cast's text and the reason; a separate count for `test/`
     with its own baseline (test fixtures use `satisfies`);
   - `as unknown as` (an `as` whose operand is an `as … unknown`): none, in `src/`, `hook/`, `bin/`, `seat/` and
     `test/`;
   - each scan reads only the files git knows that exist in the working tree (`test/known-files.ts`), and a fixture
     shows that the cast count finds an `as T`, an angle-bracket assertion and an `as unknown as`, and skips `as const`,
     an `import { a as b }` and the word "as" in a comment or a string.
4. Tests, written first: new `test/boundary.test.ts` (each validator the readers use; a damaged `limits.json` and a
   damaged `start-gate.json` give the typed error with the file, the field and the expectation; a text that is not
   JSON; a valid file gives the typed value); the existing tests of the three readers keep passing, and those whose
   expected message changes form change with it.
5. `docs/jobs.md` changes only where it quotes an ignored-entry message whose wording changes.

No file is deleted or moved; no file of `adrian-rebuild/tools/` changes.

## Out of scope

- The other 38 `JSON.parse` sites and their casts (see `## Problem`: R-017, R-021, R-057, R-034, R-082).
- `routes.json` (R-062) and the inbox envelopes (R-053), which do not exist yet; `record.json` (R-021) and the "damaged
  record" test of T-27, which comes with it.
- The `biome-ignore` scan of T-27 (1) and the stage-6 condition on debt suppressions (R-082).
- The shape of the final line itself (`code` and `next` as a value or `null`, R-089): this ticket keeps today's
  schema of `checkedOutcome`.

## Acceptance

- AC-1: `node --test test/boundary.test.ts` → exit 0.
- AC-2: `node --test test/structure.test.ts` → exit 0.
- AC-3: `git grep --untracked -n 'JSON\.parse' -- src/project/limits.ts src/outcome.ts` → exit 1 (no line: both
  readers parse through `src/boundary.ts`).
- AC-4: `node adrian-rebuild/tools/fails-before.mjs` → exit 0; `outcome.md` → `## Fails before` holds its output and
  names each new test that passes at `HEAD` and why.
- AC-5: `node adrian-rebuild/tools/gate.mjs` → exit 0 with `fail 0`.
- AC-6: `npx tsc --noEmit` → exit 0; `npx biome check --error-on-warnings .` → exit 0.
- AC-7: `node adrian-rebuild/tools/check.mjs` → exit 0.
- AC-8 (judgment): `src/boundary.ts` imports nothing at run time beyond `node:` modules, `src/outcome.ts` and
  `parseDuration`; every
  typed error of the converted readers names the file, the field and the expectation; the three readers behave as at
  `0c22548` on valid input; the baselines are the counts at `0c22548` less the sites the diff removes, stated with
  that arithmetic in a comment.

## Migration

none: no on-disk format, CLI form or hook changes; only the wording of the ignored-entry messages in the job log and
of `limen seat queue` may change form.

## Risk

- A validator stricter than today's hand check could ignore a value that was used before: the tests of the three
  readers on valid input guard it, and `limits.json` and `start-gate.json` keep their documented forms.
- The AST cast count depends on the `typescript` dev dependency's parser; it runs only in the tests, never at run time.

## Rollback

`git revert $(git log --format=%H --grep='^R-016:' adrian-rebuild --)`; no migration.

## Decisions
- 2026-11-20 (main session, review round 1, FAIL on one blocking finding that was the main session's own omission,
  fixed by it in `outcome.md`; `review.md` → Round 1). Fixes for the resumed implementer, each with a test that fails
  before it:
  1. Finding 2: a final line that is not JSON is shown whole in the `INTERNAL` message of `readOutcome`, as at
     `0c22548`; the 40-character cut stays for the values of data files.
  2. Finding 3: the field of a `BAD_DATA` message is escaped like the value (no control character reaches a log line
     raw); a test with a key that holds a newline.
  3. Finding 5: the three new functions `outcomeOf`, `printable` and `number` get names that no other file of `src/`,
     `hook/`, `bin/` or `seat/` uses.
  4. Finding 6: the test name at `test/boundary.test.ts:166` holds at most one identifier (T-29 (2)).
  5. Finding 7: the import test of `src/boundary.ts` also catches a side-effect `import "…"`, an `export … from "…"`
     and a dynamic `import(`.
  6. The implementer's open point 1: a message whose field is empty reads `<file>: expected <expected>, got <value>`,
     with no empty segment; the Change 1 sentence that gave the literal form is amended so.
  Findings 1, 4 and 8 are rejected (`review.md`).
- 2026-11-20 (main session, review round 2, PASS with four notes; `review.md` → Round 2). The second and last round of
  fixes, for the resumed implementer, each with a test that fails before it:
  1. Finding 1: every control character (`\p{Cc}`, DEL and the C1 controls included) and U+2028 and U+2029 are escaped
     in the field and in the value of a `BAD_DATA` message, so no line terminator or control reaches a log line raw;
     the test covers U+007F, U+0085, U+009B and U+2028; the comment at `src/boundary.ts:65` says what is escaped.
  2. Finding 2: `whole` keeps one meaning in `src/boundary.ts`; the option that shows a value uncut and numberIn's
     local get their own words.
  Findings 3 and 4 are rejected (`review.md`).
