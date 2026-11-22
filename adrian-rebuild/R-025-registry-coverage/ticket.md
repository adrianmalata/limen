<!-- PL: Ticket R-025 (T-28, T-29, D-045 (6), D-075, D-076): pokrycie testami wynika z rejestru poleceń. Każdy wpis
deklaruje swoje kody odmów (`refuses`), a skany w `npm run check` sprawdzają, że każdy kod odmowy w kodzie jest
zadeklarowany, ma test `CODE: …` porównujący migawkę, każde polecenie ma test sukcesu `limen <polecenie>: …`, a
każde polecenie `read` niczego nie zapisuje; braki zaczynają jako zapadki do zera w R-082 i R-083. Stan: napisany
21.11 przy commicie R-092; w nocy 22.11 wdrożony, po dwóch rundach recenzji (FAIL, PASS z uwagami) i z decyzjami obu
rund poprawek w `## Decisions`. -->

# R-025 Test coverage derived from the command registry

## Problem

The rule, quoted from `taste.md` → T-28: "No coverage percentage (z. 37); coverage follows from the registry (T-19),
not from incidents. (1) A `change` command: a test of its effect on success and a test of every refusal it declares;
refusals are typed errors with an ID (T-01, T-03), declared in the registry entry. (2) A `read` command: a golden test
of its output, and one parameterised test over every read command of the registry that it changes neither the tree nor
the records (T-04). (3) Operations that cannot be undone or that move data […]: also a test of running them again and
a test that nothing is lost (z. 29, A-002). (4) A bug fix comes with a test that fails before it (stage 5). (5)
Behaviour that depends on Pi, the bridge, Herdr or systemd: a test on the fake engine and a verification step in
`plan.md` → `## Deployment`." Its Check: "a script in `npm run check`: every registry command has a success test;
every refusal ID in the registry appears in a test; the parameterised \"a read does not write\" test covers every read
command; operations marked irreversible in the registry have tests for running again and for losing nothing;
`check.mjs`: every ticket that touches the API of Pi, the bridge, Herdr or systemd has a verification step in
`## Deployment`."

T-29 (2), quoted: "a test that is a rule's `Check` or the proof of a refusal starts with its identifier […]; at most
one identifier per test, because the scans of T-28 read it." T-29 (5): "A file opens with one line on what it tests".
T-38's Check: "every refusal test of T-28 (1) compares the snapshots before and after".

Adrian's decisions, quoted from `plan.md` → `## Decisions`:
- D-045 (6): "(6.1) `rule` is `change`, since its entry covers `set` and `end`, which write; (6.2) `status` and `show`
  are `change` while they reap dead jobs, and R-032 makes them `read`; (6.3) a test: every `read` command run on a test
  project leaves the project's files and `.limen/` unchanged, and after R-032 it passes for `status` and `show`."
- D-075 (Q-24, option 1) and D-076 (Q-25, option 1), with the points settled by the documents: quoted in
  `## Decisions` below.

Notes in `plan.md` → `## Tickets` for R-025: the scans of `test/structure.test.ts` (`filesIn` for `seat/`, `bin/`,
`src/`, `hook/`, and `sources`) "read only the files git knows, through R-090's `knownFiles`, so an ignored file (an
editor's swap file) cannot change a scan"; "`test/cli/github.test.ts` opens with two header lines, and the header of
`test/cli/continue.test.ts` does not name its transcript-mode test".

Facts at `6556e38` (the read-only inventory `adrian-rebuild/evidence/inventories/R-025.md`, taken on R-092's finished
tree; the main session checked the ones it quotes at `6556e38`):
1. `src/registry.ts`: the entry type has no refusal field; 46 entries, 11 `read` (diff, show, open, status, ticket
   check, seat queue, rule, github status, github doctor, github ensure, picture serve) and 35 `change`; `movedBy` on
   9; `irreversible` only on `migrate`. `rule` only lists (`rule set` and `rule end` are their own `change` entries);
   `status` and `show` are `read` and still reap (`confirmDeadJobs`).
2. Codes are string literals passed to `refused`, `usageError` and `environmentError` (`src/outcome.ts`) across the
   domain modules; the runner's codes live in `src/operation.ts`. 105 tests are named `CODE: …` (55 codes); of the
   codes R-092 lists, 74 have no `CODE:` test.
3. `test/registry.test.ts` checks the entries' fields, `MOVED` and `IRREVERSIBLE`; its `readdirSync` of
   `src/commands` and `src/` and the walks `filesBelow`, `filesIn` and `sources` of `test/structure.test.ts` read
   ignored files; `knownFiles` (`test/known-files.ts`) lists only the files git knows.
4. `test/snapshot.ts` (R-092): `snapshot(root, also)`, taken only while no process writes in the plant.
5. No test runs `diff`, `open`, `rule timer`, `github connect`, `github status`, `github doctor`, `github deliver`,
   `github ensure` or `group advance` through the CLI.
6. `test/cli/github.test.ts` opens with three header lines; `test/cli/continue.test.ts`'s header does not name its
   transcript-mode test.

## Change

(a) Declarations (D-075): the registry entry gets `refuses`, the codes of class `refused` and `usage` its own path
throws; the runner's shared codes are declared once in `src/operation.ts`; a command that runs another command's
operation (`github work` through spawn's) declares only its own. Every entry is filled.

(b) Scans, in `test/registry.test.ts` (T-29 (1): the tests of `src/registry.ts`), which `npm run check` runs:
1. every `refused` and `usage` code that `src/` and `hook/` throw is declared by an entry or by the shared list, and
   every declared code is thrown somewhere (no stale declaration);
2. every declared code has a test whose name starts with `CODE:`; the codes without one are a ratchet list that may
   only shrink (a test fails when an unlisted code has none and when a listed code has one); its comment names R-082;
3. every `CODE:` test of a `change` command compares the shared snapshot (`test/snapshot.ts`); the tests that do not
   yet are a ratchet list in the same form, R-082 too;
4. every registry command has a success test whose name starts with `limen <command words>:` (D-076); for a `read`
   command it is its golden test of the whole output (a reviewer question); the commands without one are a ratchet
   list in the same form, whose comment names R-083.
An existing test that already proves a refusal or a success but lacks the prefix is renamed rather than listed.

(c) The parameterised read test (D-045 (6.3), T-04), in `test/registry.test.ts` too: every `read` command of the registry runs on a plant with a
finished job and its transcript, and leaves the shared snapshot identical; `seat queue` and the `github` reads compare
the plant's seat state as well; `picture serve` (it serves until stopped) and `open` (it needs Herdr) are named
exceptions with their reason in the test.

(d) Kinds (D-045 (6)): `status` and `show` become `change`, with a comment naming R-032; `rule` stays `read`, since
`rule set` and `rule end` are their own entries (the reason of D-045 (6.1) no longer holds; D-075).

(e) `knownFiles`: the walks of `test/structure.test.ts` (`filesBelow`, `filesIn`, `sources`) and the `readdirSync` of
`test/registry.test.ts` read only the files git knows, with a test that an ignored file in a scanned folder is not read.

(f) Headers (T-29 (5)): `test/cli/github.test.ts` and `test/cli/continue.test.ts` open with one line each, the latter
naming its transcript-mode test.

## Out of scope

- Typing the untyped throws and writing the missing refusal tests (R-082); the missing success tests and the file names
  (R-083); the shape ratchet of T-38 (R-082).
- `irreversible` marks for `ticket done` and land's closing commit (R-065, R-037); `status` and `show` back to `read`
  (R-032).

## Acceptance

- AC-1: `node --test test/registry.test.ts` → exit 0.
- AC-2: `node --test test/structure.test.ts` → exit 0.
- AC-3: `node --test test/cli/github.test.ts` → exit 0.
- AC-4: `node --test test/cli/continue.test.ts` → exit 0.
- AC-5: `node adrian-rebuild/tools/fails-before.mjs` → exit 0, its output in `outcome.md` → `## Fails before`.
- AC-6: `node adrian-rebuild/tools/gate.mjs` → exit 0.
- AC-7: `npx biome check --error-on-warnings .` → exit 0; `node adrian-rebuild/tools/check.mjs` → exit 0.
- AC-8 (judgment): each ratchet list is an exact set compared both ways, and `outcome.md` gives its size.
- AC-9 (judgment): every entry's `refuses` names the codes of its own path, checked against the domain modules it
  calls; `outcome.md` lists the entries with an empty `refuses` and why.

## Migration

None: the registry and the tests only.

## Risk

- A scan that matches codes by a loose pattern passes while a code goes undeclared; each scan gets a fixture case
  that fails when its rule is broken.

## Rollback

`git revert $(git log --format=%H --grep='^R-025:' adrian-rebuild --)`.

## Decisions

- 2026-11-21 D-075 (Adrian: "Zgodnie z rekomendacjami"; Q-24), quoted from `plan.md` → `## Decisions`: "refusals
  are declared in the registry (T-28 (1)). Each entry gets `refuses`, the codes of class `refused` and `usage` its own
  path throws; the runner's shared codes (`STATE_CHANGED`, `LOCK_TIMEOUT`, `STEP_FAILED`, `REFUSED_AFTER_VALIDATE`,
  `BAD_ARGUMENT`) are declared once in `src/operation.ts`; a command that runs another's operation (`github work`
  through spawn's) declares only its own. Two scans: every `refused` and `usage` code in `src/` is declared, and every
  declared code has a test named `CODE: …`; the codes without such a test start as a ratchet list that may only
  shrink, which R-082 brings to zero. Settled by the documents, not asked (the session's reading): a refusal test is
  recognised by its `CODE:` prefix (T-29 (2)); a refusal test of a `change` command compares the shared snapshot,
  which a scan checks (T-38's Check); the scans are a test file `npm run check` runs; `status` and `show` are `change`
  until R-032 (D-045 (6.2)); `rule` stays `read`, since `rule set` and `rule end` are their own `change` entries and
  the reason of D-045 (6.1) no longer holds; the `irreversible` marks of `ticket done` and land's closing commit come
  with R-065 and R-037; the read test runs every `read` command on a plant with a finished job, `picture serve` and
  `open` named exceptions with their reason; the scans of both test files go through `knownFiles`; the two headers
  have one line each."
- 2026-11-21 D-076 (Adrian, the same message; Q-25): "a success test of a registry command is recognised by its name,
  which starts with the command: `limen <command words>: …`; a scan requires one for every registry command, and for
  a `read` command it is its golden test of the whole output; the commands without one start as a ratchet list that
  may only shrink, which R-083 brings to zero."
- 2026-11-22, the night session (a fact, not a decision): R-024 (`24f37a6`), done after this ticket was written, added
  the `read` command `stats` (`src/registry.ts`, `src/commands/stats.ts`, `src/job/statistics.ts`), so the registry
  has 47 entries and 12 `read` commands; its tests are `limen stats: …` (the golden test), `NOT_MIGRATED: …` and
  `T-04: …` (the shared snapshot) in `test/cli/stats.test.ts`. Fact 1's counts are those of `6556e38`; (a)–(c) cover
  `stats` as every other entry.
- 2026-11-22, the night session's reading (settled by the documents, not a night default): AC-3 is judged by the
  gate's run of `test/cli/github.test.ts`. Outside `gate.mjs` its `github poll` tests refuse the shared `/tmp`
  ("unsafe owner or permissions on /tmp"), at `HEAD` too: the platform exception P2 of `evidence/baseline.md`,
  accepted at gate 0, and D-034's lesson that a run outside `gate.mjs` on this laptop is no evidence of a failure
  (R-005, R-019 and R-092 recorded the same).
- 2026-11-22, review round 1 (`review.md` → Round 1), the first round of fixes, for a fresh implementer (D-026 (2)):
  (1) Scan (b)3 covers every `CODE:` test of a `change` command, whichever list declares its code (an entry's
  `refuses` or `SHARED_CODES`): it compares the shared snapshot or is on `WITHOUT_SNAPSHOT`; the four tests of the
  finding are among those it finds; a fixture case fails when such a test compares no snapshot and is not listed; the
  scan's comment and `outcome.md` → Deviation 3 say what it does. (2) `thrownCodes` skips no `new LimenError`: a site
  whose class is not a literal has its code on an exact list with the reason (today `GROUP_PARTIAL_START`), so a new
  such site fails the scan, with a fixture case; its comment says what the scan reads. (3) `codesOf` resolves a name
  to the function's parameter before a file-wide constant, as the language's scopes do, with a fixture case. (4) The
  T-04 read test names each read's expected end on the plant (exit 0, or the expected code of a read that refuses
  there, with the reason), so any other end, a crash included, fails it. Night default (category A (b), D-054 (2)), for
  Adrian to confirm in the morning: `SHARED_CODES` holds D-075's five codes and the three every command line can hit
  (`UNKNOWN_COMMAND`, `REMOVED`, `UNTYPED`). Not fixed, with the reason in `review.md`: finding 6. `outcome.md`
  records the round under its sections, with the new sizes of the ratchet lists (AC-8).
- 2026-11-22, review round 2 (`review.md` → Round 2, verdict PASS with notes), the second and last round of fixes,
  for a fresh implementer (D-026 (2)): (1) The tests that already prove a success are renamed rather than listed
  (Change (b)): `ticket new returns the number of the ticket it wrote in ids.ticket` (`test/outcome.test.ts`) as
  `limen ticket new: …`, and one of the two `group start run again …` tests (`test/cli/group.test.ts`) as `limen group
  start: …`, as `limen github work: run again …` was; `ticket new` and `group start` leave `WITHOUT_SUCCESS_TEST`. A
  test that combines mechanisms (T-29 (3)) is not renamed, and `outcome.md` says why it stays listed. (2) Names resolve
  as the language's scopes do: a name in a code position means its innermost declaration around it, a parameter of a
  function or a `const` of a block, function or file; a string constant gives its literal; a name bound by
  destructuring a property of a call of the file's own function (`const { code } = problemOf(…)` in
  `src/job/reference.ts`) gives the literals that property has in that function; any other binding is unreadable, so
  the test fails on it. Fixture cases: two functions with a local constant of one name each, each throw reading its
  own; a local variable with a non-literal value in a file that gives a `code` property literals is unreadable. The
  comment of `thrownCodes` says what it reads. (3) Scan (b)3 holds a test to T-38's Check "compares the snapshots
  before and after": a test compares when it takes the snapshot at least twice, itself or through the file's
  functions (a function that takes it twice counts twice); a fixture case where a test takes it once fails; a test
  that leaves the held set by this joins `WITHOUT_SNAPSHOT`, and `outcome.md` names it. (4) The D-045 test's name
  holds one identifier (T-29 (2)): R-032 leaves the name for a comment above the test. (5) `UNKNOWN_CLASS` lists
  sites, not codes: one entry per site, as its file and code, repeats kept, compared both ways, so a new site fails the
  scan even with a listed code; a fixture case. (6) The `UNPRIVILEGED` comment says the stubs hold for an account that
  is not root (under uid 0 `assertUnprivileged` refuses before it runs `id`). The main session's after the round
  (`outcome.md` only, D-053 (2)): `## Fails before` records its run of `fails-before.mjs` after this round. `outcome.md`
  records the round under its sections, with the new sizes of the ratchet lists (AC-8). Not fixed, an open point for
  gate 5.2 and R-082 (`review.md` → Round 2): whether scan (b)3 holds a test by the command it runs rather than by its
  code.
