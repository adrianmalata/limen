<!-- PL: Ticket R-089: w linii końcowej `code` i `next` są wartością albo null; `next` jest zawsze poleceniem Limena
z konkretnymi wartościami albo null, a proza zostaje na stderr (D-045 (2), (5), D-046 (1)–(3), (5)). Zmienia typ
i walidator w src/outcome.ts, wszystkie miejsca z pustym `next`, prozą albo symbolem zastępczym, odmowy usuniętych
nazw, `group wait` po limicie (wyjście 0) i zdanie po `spawn`; każdy `next` z testów przechodzi przez wspólny parser.
Stan: gotowy do nocy (ready). -->

# R-089 The final line's `code` and `next` are a value or `null`; `next` is always a command

## Problem

D-045 (2026-11-19, Adrian, gate 5.1): "(2) Every stderr line of a refusal stays as it is. A refusal with no successor
has `"next": null` in its final line, and its sentence stays on stderr; the type of R-013 admits `null`, and the help
line that shows the final line's shape follows the type. […] every non-empty `next` of a refusal passes the shared
parser and is not itself a usage error. […] (5.1) `next` is the command alone with concrete values (the branch, the
group id), never a placeholder, and the prose ("fix the … listed above") goes to the stderr line; every non-empty
`next` passes the parser. (5.2) `GITHUB_NETWORK`: `next` is the same command, because `limen github doctor` checks
only local settings, which are fine on a 429 or a 5xx; the limit's reset time, when GitHub gives one, goes to stderr.
(5.3) `group wait`'s time limit stays exit 0, an explicit `--timeout` included, and `next` is `limen group wait` in the
form it was called […]. (5.4) `UNTYPED` is class `refused`, exit 1, as today; `code` on success is `null` instead of
`0` (amends D-022), so that the field has one type."

D-046 (2026-11-19, Adrian): "(1) […] a refusal's `next` is a Limen command only when its successor is a fixed command
or is built from identifiers of the call (a job, a branch, a group id); otherwise it is `null`, and the sentence stays
on stderr. So `picture tick` names `limen picture build`, `picture watch` names `limen status`, `group status --json`
names `limen group status` (with the group id when one was given), `queue` names `limen seat queue`, `jobs` follows
D-045 (2) in R-023, and every other refusal of `src/old-names.ts` has `null`. (2) Every `next: ""` becomes `null`: a
success with no next step, `UNTYPED`, `INTERNAL`. (3) The sentence of a successful `spawn` (D-022: "End your turn;
Limen wakes you when the job ends.") moves to the text line before the final line, with `next: null`; its wording
stays. So `next` is always a Limen command or `null`, and the parser test covers every `next`, not only those of
failures. […] (5) Confirmed for R-089: `group wait` past its limit, an explicit `--timeout` included, exits 0 with class
`ok`, `code` `null` and `next` the `limen group wait` call as it was made, so the code `GROUP_WAIT_TIMEOUT` leaves the
final line and the text line says that the limit passed". T-37 has the dated addition "`code` and `next`" (D-045,
D-046).

Facts at HEAD (a read-only inventory of 2026-11-20):
- Types: `Success.next: string` (`src/outcome.ts:16`), `Outcome.code: 0 | string`, `next: string` (`:18-23`); a refused
  or usage `LimenError` with a blank `next` throws unless the code is `UNTYPED` (`:79-82`); the validator `finalLineOf`
  (`:160-168`) requires `code` `0` on `ok` and a string `next`, so it refuses `null`. `Handler` returns `Success |
  undefined`, `undefined` meaning `next ""` (`src/registry.ts:60-61`). The help line (`src/help.ts:59-64`) shows the key
  names only.
- `next: ""`: `src/main.ts:27` (a handler's `undefined`, and the help paths), `src/main.ts:95-100` (`UNDECLARED_IDS`),
  `src/outcome.ts:99` (`UNTYPED`), `:102` and `:152` (`INTERNAL`), `src/boundary.ts:103` (`BAD_DATA`),
  `src/commands/ticket.ts:84` (`ticket new`), `src/commands/github.ts:236` (`github deliver`); `src/main.ts:28` sets
  `code: 0`. The poll summary copies the worst project's `code` and `next` (`src/integrations/github-poller.ts:808-814`).
- Prose or a placeholder in `next`: `TICKET_CHECK_FAILED` (`src/commands/ticket.ts:132-137`), `PICTURE_INVALID`
  (`src/commands/picture.ts:39-44`, which also drops a given `--dir`), `GROUP_WAIT_MEMBERS_ONLY` without a group
  (`src/commands/group.ts:434-440`, `<group id>`), `JOB_STARTED` (`src/outcome.ts:29-30`, returned by
  `src/commands/spawn.ts:152`, `src/commands/continue.ts:93`, `src/commands/github.ts:244`), `NODE_VERSION`
  (`bin/limen:7`, a literal line written before `src/outcome.ts` can load), and every entry of `src/old-names.ts` except
  `jobs` and `queue` (its `instead` texts; the flag refusal is raised inside `readFlag`, `src/parser.ts:191-197`, before
  positionals such as a group id are read).
- `GROUP_WAIT_TIMEOUT` (`src/commands/group.ts:307-309`, class `transient`) is thrown past `--timeout` in `waitGroup`
  (`:334-338`) and at the 20 s cap in `waitCapped` (`:354-360`); the raw `--timeout` exists only in `groupWaitCommand`
  (`:447`). `GITHUB_NETWORK` (`src/integrations/github-poller.ts:90-92`, thrown at `:123`, `:128`, `:131`): no code
  reads `x-ratelimit-reset` or `retry-after`.
- Docs with the old values: `docs/commands.md:24-25`, `:30`, `docs/groups.md:71`, `docs/seat/agent-setup.md:239`.
- No test runs every `next` through the parser; the closest is `test/registry.test.ts:106`. `main` handles `--help`
  (`src/parser.ts:276`, `src/main.ts:81`) and bare group words (`src/main.ts:68`, `:109-130`) before `parse`.

## Change

1. `src/outcome.ts`: `code` is a string or `null` (`null` exactly when `class` is `ok`), `next` a Limen command or
   `null`, never `""` or `0`; `LimenError` takes `next` explicitly, `null` allowed; `finalLineOf` accepts `null` and
   refuses `""`, `0` and a `next` that does not start with `limen `; a handler's `undefined` is `next: null`. The help
   line keeps its key list, which the type still matches.
2. Every `next: ""` above becomes `null`; `code: 0` becomes `null`.
3. Commands with concrete values, the prose on stderr in its present wording: `TICKET_CHECK_FAILED` → `limen ticket
   check <the branch given>`; `PICTURE_INVALID` → `limen picture build --strict` with the `--dir` given;
   `GROUP_WAIT_MEMBERS_ONLY` → `limen group status`, plus the group id when one was given; `GITHUB_NETWORK` → `limen
   github poll` (the same command), and the reset time on stderr when GitHub sends `x-ratelimit-reset` or
   `retry-after`; `NODE_VERSION` in `bin/limen` → `null`, its sentence on stderr.
4. `spawn`, `continue`, `keeper` and `github review|work`: the sentence `JOB_STARTED` is a text line before the final
   line, wording unchanged; `next: null`.
5. `group wait` past its limit (`--timeout` or the 20 s cap): exit 0, class `ok`, `code` `null`, `next` the `limen
   group wait` call as it was made (from the raw arguments); a text line says that the limit passed; the code
   `GROUP_WAIT_TIMEOUT` is removed.
6. `src/old-names.ts`: an entry's `next` is `limen picture build` (`picture tick`), `limen status` (`picture watch`),
   `limen group status` with the group id when given (`group status --json`), `limen seat queue` (`queue`); `jobs`
   keeps its computed `next` (R-023 changes it); every other entry has `null`, and its `instead` sentence stays on
   stderr.
7. The parser check of D-046 (3): every final line a test reads through the tests' reader has its non-null `next`
   parsed by the shared parser (`--help` and bare group words as `main` treats them), and a parse error fails the test;
   a table test runs every `next` of `src/old-names.ts` the same way.
8. Docs: `docs/commands.md`, `docs/groups.md` and `docs/seat/agent-setup.md` show the new values.

## Out of scope

- The `jobs` defect and its criteria (R-023, D-045 (2)); `kind` (R-025, R-032).
- Making plain `Error`s typed (R-082); the stderr wording of any refusal.

## Acceptance

- AC-1: `node --test test/outcome.test.ts` → exit 0.
- AC-2: `node --test test/cli/old-names.test.ts` → exit 0.
- AC-3: `node --test test/cli/group.test.ts` → exit 0.
- AC-4: `git grep -n -E 'next: ""|"next":""|code: 0\b|"code":0' -- src hook bin docs` → exit 1 (at HEAD it finds
  eleven lines).
- AC-5: `git grep -n -E 'GROUP_WAIT_TIMEOUT|\?\? "<group id>"|listed above, then' -- src docs` → exit 1 (at HEAD it
  finds seven lines; a usage placeholder such as `docs/groups.md:67` is not matched).
- AC-6: `node adrian-rebuild/tools/fails-before.mjs` → exit 0; `outcome.md` → `## Fails before` holds its output and
  names each new test that passes at `HEAD` and why.
- AC-7: `node adrian-rebuild/tools/gate.mjs` → exit 0 with `fail 0`.
- AC-8: `npx tsc --noEmit` → exit 0; `npx biome check --error-on-warnings .` → exit 0.
- AC-9: `node adrian-rebuild/tools/check.mjs` → exit 0.
- AC-10 (judgment): every `next` the code can produce is a Limen command with concrete values or `null`; no stderr
  sentence changed its wording; the reader check covers every test that reads a final line.

## Migration

none on disk; the final line is read by the coordinator and the tests, which this ticket updates. A client that reads
`next` as a string sees `null` where it saw `""`.

## Risk

- A test that read `next: ""` or `code: 0` as a literal fails until it is updated; the gate shows each.
- `group wait` past its limit no longer exits 3: a caller that looped on exit 3 now loops on the `next` it is given.

## Rollback

`git revert $(git log --format=%H --grep='^R-089:' adrian-rebuild)`.

## Decisions

- 2026-11-19 D-045 (2), (5) and D-046 (1)–(3), (5) (Adrian): quoted in `## Problem`.
- 2026-11-20 (main session): the parser check sits in the tests' reader of the final line, so every test that reads
  one covers its `next` without a list; the help line stays as it is, since it names the keys and no value shapes;
  `finalLineOf` refuses a `next` that does not start with `limen `, so prose cannot return.
