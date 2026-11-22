<!-- PL: Wynik R-024 (noc 21/22.11, zamknięty po trzech rundach recenzji, PASS w każdej): nowe polecenie odczytu `limen stats`
(src/commands/stats.ts nad modułem src/job/statistics.ts) czyta rekordy jobów i ich transkrypty i drukuje wariant b
z D-073: tabelę trasa × rola, `Failed by kind` i `Not read`. Czytnik transkryptów src/job/usage.ts przechodzi przez
walidatory src/boundary.ts, liczy każdy wpis z usage Pi (także kompakcje) od startu joba i zwraca linie, których nie
przeczytał. Runda 1: linia modelu w `limen show` bez tury asystenta, jednostki tokenów według zaokrąglonej wartości
z bezpośrednim testem operacji, testy czytnika po jednym mechanizmie, zdanie o `show`. Runda 2: czytnik sam wylicza
granicę „od startu joba” z `startedAt` rekordu (rekord bez startu liczy każdy wpis), a zdanie o `show` oddziela tury
(wiadomości asystenta) od sum tokenów; bramka 690/690. -->

# R-024 outcome

## Done

(a) `limen stats`, a `read` command of the project (`object: "project"`, T-18 (3)), in the registry after `status`,
with no flags and the example `limen stats`. Its handler (`src/commands/stats.ts`) calls one domain operation,
`projectStatistics(cwd)` in the new `src/job/statistics.ts`, and returns its text with `next: null`, so the command
ends with `{"class":"ok","code":null,"next":null}`. The module reads the folders through `jobFolders` (a project that
is not migrated refuses with `NOT_MIGRATED`, exit 4, as every command that reads jobs), each record through
`readRecord`, the folders of `.limen/unmigrated/` through `jobFolderNames`, and each job's transcripts through
`src/job/usage.ts`. It imports no transition function, calls no reaper (`confirmDeadJobs`), writes nothing and waits
for nothing (T-04); it never reads `log` or `result` (T-37 (1)).

(b) `src/job/usage.ts` is the one transcript reader. `readSessionUsage(jobDir, startedAt)` now returns
`{ usage, unread }`: `usage` as before (`served`, `turns`, the four classes; undefined until an entry carries a usage),
and `unread`, one `BAD_DATA` error per transcript line that does not parse, whose `file` is `<path>:<line>` and whose
`field` and `expected` say what was wrong. Each non-blank line goes through `parseJson` of `src/boundary.ts` with
validators after Pi 1.5.1's `SessionEntry` and `Usage`: a `message` entry counts when its role is `assistant` (with
its `provider`, `model`, `usage` and the entry's `timestamp`); any other entry counts when it carries `usage` at the
top, which is a compaction (E-13), a branch summary or a `usage` entry; the four classes must be integers of at least
0. Entries written before the job's start are not counted, so a continuation does not count the parent turns it copied;
the reader takes the start as the record holds it (`record.startedAt`, possibly null) and derives the bound itself
(round 2, T-25 (1)), and a record with no start counts every entry. A missing `session/` is an explicit `ENOENT` (no
transcript); any other read failure goes on (T-01).
`turns` still counts assistant messages only. `limen show` keeps using it (`src/job/listing.ts` takes `.usage`); its
token line now holds every entry with a usage, compactions included, and `docs/commands.md` says so. Its model line
(`modelLine`) names the requested model, "requested <model>; no turn yet", while no assistant turn served one, also
when compactions or other entries with a usage counted tokens (round 1). The raw `JSON.parse`, the four casts and the
two `catch {` of the old reader are gone; `test/structure.test.ts` lowers `JSON_PARSE` by 1 and `CASTS.runtime` by 4,
with the reason in each comment.

(c) The output, D-073's variant b, as the golden test fixes it:
- `Jobs by route and role (<n> records, <first day> to <last day>)`: `n` counts the records read; the days are the
  UTC dates of the earliest and latest `startedAt`; with no start time the span is left out, `(0 records)` included.
- A header line and one row per route and role, sorted by route, then role, by code units: the route as
  `<provider>/<model> <thinking>`, each part the record does not hold (null or blank) named `unknown`; the role, a
  null role named `unknown` in a row of its own (z. 10); `jobs`, `done`, `failed`; `run time`, the sum over the row's
  finished jobs (`done`, `failed`, `stopped`) of the time from the first transition to the transition into the
  record's state, as `<h> h <mm>`; the four token classes. Route and role are aligned left, numbers right; columns are
  two spaces apart and as wide as their widest cell. No table when there is no record.
- Token units: the number as it is below 1,000; thousands while it rounds to fewer than 100 of them; millions above;
  one decimal while the rounded number of the unit is below 10 (`950`, `7.0k`, `44k`, `0.4M`, `100M`). The unit and
  the decimal follow the rounded value, rounded half up in tenths of the unit (round 1): 9,949 is `9.9k`, 9,950 to
  10,000 are `10k`, 99,499 is `99k`, 99,500 to 100,000 are `0.1M`.
- `Failed by kind: <kind> <n> · …`, most frequent first, an equal count in the order of `FAILURE_KINDS` (A-016), a null
  kind as `unknown` after the known kinds; `Failed by kind: none` when no job failed.
- `Not read: …`, the items joined by ` · `, each with its count, absent when nothing was left out: `N folders in
  .limen/unmigrated/` (no pointer, D-073); `N folders with no record (limen status --all)`; `N records that do not parse
  (limen status --all)`; `N transcript lines of <job id>`, one item per job; `the run time of N finished jobs` whose
  transitions give none (a migrated record without a start time, or an end before the start).
Historical scout records are rows like any other role (T-33).

(d) Tests. `test/job/usage.test.ts` (new), one mechanism per test (round 1, T-29 (3)): an assistant message with a
compaction that carries a usage and one that does not; a parent turn copied before the start, beside the job's own
turn; a line cut in the middle, named by file and line while the other lines count; a usage with a wrong class, named
by file, line, field and expectation while the other lines count; no `session/` folder; the model line while no
assistant turn served a model; a record with no start, whose transcript counts every entry (round 2). `test/job/statistics.test.ts` (new, round 1, T-26 (5)): `projectStatistics` called
directly on a plant with one job, one test per boundary of the token units (9,949 to 10,000 tokens; 99,499 to
100,000). `test/cli/stats.test.ts` (new): the golden test of the whole output (`limen stats: …`, D-076) over four
records of this Limen on two routes (worker done,
worker failed on `quota`, worker failed with a null kind, a reviewer whose transcript has a cut line and a
compaction), four migrated records on the older route (worker failed on `timeout`, a scout, a null role, a worker
with no start time), a record that does not parse, a folder with no record and a folder in `.limen/unmigrated/`, and
the raw final line; `T-33: …` with one migrated scout record; a project with no records; `T-04: …`, the snapshot of
`test/snapshot.ts` identical before and after; `NOT_MIGRATED: …` (T-29 (2)). `test/help.test.ts`: the golden general
help gains the two `stats` lines.

(e) `docs/commands.md`: the generated help lines and the `show` token sentence, which says that the number of turns
counts the assistant messages of the job's own transcript (round 2) and, as `docs/jobs.md` does, that the totals are
those of every entry of that transcript that carries a usage, compactions included (round 1); `docs/jobs.md`: "Read a job through `limen show <id>`, and the counts over every job of the project through
`limen stats` …", with what `stats` counts and names.

Review round 1 (`review.md` → Round 1; `ticket.md` → `## Decisions`, "review round 1"), the fixes of findings 1, 3, 4,
6 and 7:
1. `modelLine` (`src/job/usage.ts`) takes the branch "requested <model>; no turn yet" when the usage is undefined or
   its `served` list is empty, so `limen show` of a job whose only counted entries are compactions names the
   requested model again; its token line shows what was counted (`0 turns` and the compactions' tokens). Test: the
   last test of `test/job/usage.test.ts`.
2. `tokenText` (`src/job/statistics.ts`) chooses `k` while the tokens round to fewer than 100 thousand, else `M`, and
   a new `unitText` rounds half up to tenths of the unit by `Math.round(tokens / (unit / 10))`, which keeps a half
   exact; one decimal while those tenths are below 100, whole units above. Before, the failing run of `## Fails
   before` printed 9,950 as `9.9k` (`toFixed(1)` of 9.95, which has no exact binary form), 9,999 as `10.0k`, and
   99,500 and 99,999 as `100k`. The golden test's cells are unchanged.
3. `test/job/statistics.test.ts` tests the operation directly and holds the two boundaries of 2 (its place is the
   night default of the ticket's decision (3)). Each test reads the four token cells of the report's one row, split
   at the two or more spaces between columns, so that it fails only on the units; the whole output stays the golden
   test's (T-28 (2)).
4. Usage tests 1 and 2 are split into the four tests of (d); test 3 stays. The blank line in the middle of test 2's
   transcript is left out of both new tests, since every transcript of the file ends with a newline, so each test
   still reads a blank last line, which the reader skips; the user message stays in the test of the parent turn,
   where it opens the job's own turn.
5. The `show` sentence of `docs/commands.md`, as (e) says.

Review round 2 (`review.md` → Round 2; `ticket.md` → `## Decisions`, "review round 2"), the fixes of findings 2 and 1:
1. Finding 2 (T-25 (1), (b)): `readSessionUsage(jobDir, startedAt: string | null)` takes the job's start as its
   record holds it, in place of a bound in milliseconds, and a new `ownFrom` in `src/job/usage.ts` derives the bound:
   the parsed start, or `Number.NEGATIVE_INFINITY` when the record holds no start or one that `Date.parse` cannot read
   (the record's validator checks only the ISO pattern), so that every entry counts, as the callers'
   `Date.parse(record.startedAt ?? "") || 0` did. `readJob` (`src/job/statistics.ts`) and `readJobEvidence`
   (`src/job/listing.ts`) pass `record.startedAt`. Tests: the five tests of `test/job/usage.test.ts` that pass a start
   now pass the record's ISO string (`START`), and a new test reads a transcript with a turn written before any start
   and the job's own turn with `null`, and counts both.
2. Finding 1: the `show` sentence of `docs/commands.md`, as (e) says: `tokens` gives the number of turns, which
   counts the assistant messages of the job's own transcript, apart from the token totals of every entry of that
   transcript that carries a usage, compactions included.

Files: `src/commands/stats.ts` (new), `src/job/statistics.ts` (new), `src/job/usage.ts`, `src/job/listing.ts`,
`src/registry.ts`, `test/cli/stats.test.ts` (new), `test/job/usage.test.ts` (new), `test/job/statistics.test.ts` (new,
round 1), `test/structure.test.ts`, `test/help.test.ts`, `docs/commands.md`, `docs/jobs.md`. Round 2 changed
`src/job/usage.ts`, `src/job/statistics.ts`, `src/job/listing.ts`, `test/job/usage.test.ts` and `docs/commands.md`. No
`git rm` or `git mv`.

## Proof

From the repository root, after round 2's fixes:
- `node --test test/cli/stats.test.ts` → exit 0, tests 5, pass 5, fail 0 (AC-1).
- `node --test test/job/usage.test.ts` → exit 0, tests 7, pass 7, fail 0 (AC-2).
- `node --test test/structure.test.ts` → exit 0, tests 41, pass 41, fail 0 (AC-3).
- `node --test test/registry.test.ts` → exit 0, tests 13, pass 13, fail 0 (AC-4).
- `node --test test/cli/stats.test.ts test/job/statistics.test.ts test/structure.test.ts test/registry.test.ts
  test/help.test.ts test/s1-spawn.test.ts` (with the direct test of the operation, the golden help and the `show`
  token line) → exit 0, tests 76, pass 76, fail 0 (5 + 2 + 41 + 13 + 10 + 5).
- `npx tsc --noEmit` → exit 0.
- `node adrian-rebuild/tools/gate.mjs` → exit 0: `tsc`, `biome check` (250 files) and tests 690, pass 690, fail 0,
  cancelled 0, skipped 0, duration 134 s (AC-6; R-092 left 676, this ticket adds 14: 8 before round 1, round 1 adds 3
  in `test/job/usage.test.ts` and 2 in `test/job/statistics.test.ts`, and round 2 adds 1 in `test/job/usage.test.ts`).
- `npx biome check --error-on-warnings .` → exit 0, 250 files (AC-7).
- `npx biome check --error-on-warnings adrian-rebuild` → exit 0, 32 files (run after this file was written).
- `node adrian-rebuild/tools/check.mjs` → exit 0, "0 errors" (AC-7; run after this file was written).
- AC-5 (`fails-before.mjs`) is the main session's.

Before round 1 (the first implementer's run): AC-2 was tests 3, pass 3; the gate was tests 684, pass 684, fail 0,
duration 134 s, with `biome check` over 249 files. After round 1 (the second implementer's run): AC-2 was tests 6, pass
6; `node --test test/job/statistics.test.ts` tests 2, pass 2; the gate tests 689, pass 689, fail 0, duration 135 s;
`npx biome check --error-on-warnings adrian-rebuild` exit 0 over 32 files; `check.mjs` exit 0, "0 errors".

## Fails before

AC-5, the main session, after the second round of fixes: `node adrian-rebuild/tools/fails-before.mjs` (`HEAD`
`f541f37`) → exit 0. Its output, as printed (the first line, then the tail of the run at `HEAD`; the run after the
first round of fixes printed the same lines but the durations):

```
fails-before: test/help.test.ts, test/structure.test.ts, test/cli/stats.test.ts, test/job/statistics.test.ts, test/job/usage.test.ts fail at HEAD (exit 1)
    code: 'ERR_ASSERTION',
    actual: '',
    expected: 'requested claude-opus-5-5; no turn yet',
    operator: 'strictEqual',
test at test/structure.test.ts:219:1
✖ T-27: JSON.parse appears in src/, hook/, bin/ and seat/ outside src/boundary.ts at most its baseline count (17.38261ms)
  AssertionError [ERR_ASSERTION]: 34 sites of JSON.parse outside src/boundary.ts, at most 33
test at test/structure.test.ts:300:1
✖ T-27: the casts in src/, hook/, bin/ and seat/ other than as const stay at most their baseline count (3388.904877ms)
  AssertionError [ERR_ASSERTION]: 59 casts, at most 56
```

(Stack frames and the `generatedMessage` and `diff` lines of each error are left out here.) The main session's
gates: after the implementer's run `node adrian-rebuild/tools/gate.mjs` → exit 0, tests 684, pass 684, fail 0;
after the first round of fixes → exit 0, tests 689, pass 689, fail 0; after the second → exit 0, tests 690, pass
690, fail 0. Its run before the first round of fixes named the same files
but `test/job/statistics.test.ts` and printed the tail of `test/job/usage.test.ts`'s old shape failure.

The implementer's run on the working tree with the new test files and no other change (HEAD's code), before the change:

`node --test test/job/usage.test.ts` → exit 1, tests 3, pass 0, fail 3. The first test shows the defect: HEAD's
reader returns the old shape with the totals of the assistant message alone, without the compaction.

```
✖ a job's tokens are those of its assistant messages and compactions from its start, not of a parent turn copied before it
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
  + actual - expected
    {
  +   cacheRead: 100,
  +   cacheWrite: 1000,
  +   input: 1,
  +   output: 10,
  +   served: [
  +     'p/m'
  +   ],
  +   turns: 1
  -   unread: [],
  -   usage: {
  -     cacheRead: 300,
  -     cacheWrite: 3000,
  -     input: 3,
  -     output: 30,
  ...
✖ a transcript line that does not parse is named by its file and line, and the job's other lines still count
  TypeError [Error]: Cannot read properties of undefined (reading 'map')
✖ a job with no session folder has no usage and no line it could not read
  + undefined
  - {
  -   unread: [],
  -   usage: undefined
  - }
```

`node --test test/cli/stats.test.ts` → exit 1, tests 5, pass 0, fail 5; each run of `limen stats` exits 2:

```
✖ limen stats: the jobs by route and role, the failures by kind and what was not read, over a project's history
  AssertionError [ERR_ASSERTION]: unknown command "stats"
  {"class":"usage","code":"UNKNOWN_COMMAND","next":"limen --help"}
✖ T-33: limen stats reads a historical scout record as a row of its role
  AssertionError [ERR_ASSERTION]: unknown command "stats"
✖ limen stats on a project with no records prints a heading of 0 records, no rows and no failure
  AssertionError [ERR_ASSERTION]: unknown command "stats"
✖ T-04: limen stats writes nothing: the project's state snapshot stays identical
  AssertionError [ERR_ASSERTION]: unknown command "stats"
✖ NOT_MIGRATED: limen stats refuses a project not yet migrated with exit 4 and names limen migrate --dry-run
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  2 !== 4
```

The changed `test/help.test.ts` (the two `stats` lines of the golden help) and `test/structure.test.ts` (`JSON_PARSE`
33, `CASTS.runtime` 56) were not run at HEAD here; at HEAD the help has no `stats` line, and the per-line count of
`JSON.parse` outside `src/boundary.ts` was 34, the old baseline. `fails-before.mjs` runs all four files at HEAD.

Round 1, the second implementer's run, on the working tree of the first run with the new tests and none of round 1's
fixes yet. At `HEAD` itself `test/job/statistics.test.ts` fails only on its import, since `src/job/statistics.ts` is
new, so this run shows the defects of findings 1 and 3.

`node --test test/job/usage.test.ts` → exit 1, tests 6, pass 5, fail 1; the model line of finding 1 is empty:

```
✖ while no assistant turn served a model, the model line names the requested one with no turn yet (0.829843ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  + actual - expected

  + ''
  - 'requested claude-opus-5-5; no turn yet'
```

`node --test test/job/statistics.test.ts` → exit 1, tests 2, pass 0, fail 2; the units of finding 3:

```
✖ the decimal of a token count follows its rounded value: 9,949 tokens are 9.9k, and 9,950 to 10,000 are 10k (369.46455ms)
    actual: [ '9.9k', '9.9k', '10.0k', '10k' ],
    expected: [ '9.9k', '10k', '10k', '10k' ],
✖ the unit of a token count follows its rounded value: 99,499 tokens are 99k, and 99,500 to 100,000 are 0.1M (306.141746ms)
    actual: [ '99k', '100k', '100k', '0.1M' ],
    expected: [ '99k', '0.1M', '0.1M', '0.1M' ],
```

The four tests split from usage tests 1 and 2 (finding 6) change no mechanism, so they passed on that tree. At `HEAD`
each fails on the return shape `{ usage, unread }`, as test 3 does, and the compaction test also on the compaction,
which `HEAD`'s reader does not count.

Round 2, the third implementer's run, on the working tree of round 1 with the changed `test/job/usage.test.ts` and
none of round 2's code yet.

`node --test test/job/usage.test.ts` → exit 1, tests 7, pass 3, fail 4. The four tests that pass the job's start as
its record holds it, and read an entry, fail for one reason: round 1's reader takes a bound in milliseconds, so it
compares each entry's time with the ISO string, which is `NaN` as a number, and counts nothing:

```
✖ a job's tokens include those of each compaction that carries a usage, beside its assistant messages (8.950395ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
  + actual - expected

    {
      unread: [],
  +   usage: undefined
  -   usage: {
  -     cacheRead: 300,
  ...
✖ a job's tokens leave out a parent turn that its transcript copied from before the job's start (5.350208ms)
    actual: { usage: undefined, unread: [] },
    expected: { usage: { served: [Array], turns: 1, input: 1, output: 10, cacheRead: 100, cacheWrite: 1000 }, unread: [] },
✖ a transcript line cut in the middle is named by its file and line, and the job's other lines still count (3.783955ms)
    actual: [ undefined, [ [Object] ] ],
    expected: [ { served: [Array], turns: 2, input: 3, output: 30, cacheRead: 300, cacheWrite: 3000 }, [ [Object] ] ],
✖ a usage whose class is no count of tokens is named by its file, line and field, and the other lines still count (2.257903ms)
    actual: [ undefined, [ [Object] ] ],
    expected: [ { served: [Array], turns: 2, input: 3, output: 30, cacheRead: 300, cacheWrite: 3000 }, [ [Object] ] ],
```

The new test of a record with no start passed on that tree: `null` becomes 0 in round 1's comparison
`entry.at >= since`, so every entry counted there too, which is the behaviour the decision keeps ("as today"). The
test of a job with no `session/` folder reads no entry and passes on both trees. The changed contract shows in the type
check: `npx tsc --noEmit` → exit 2, six errors `TS2345` in `test/job/usage.test.ts`, five "Argument of type 'string'
is not assignable to parameter of type 'number'" and, at line 109 (the new test), "Argument of type 'null' is not
assignable to parameter of type 'number'". At `HEAD` the whole file fails on the return shape `{ usage, unread }`, as
in round 1.

## Deviations from the ticket

1. `Not read` names three more things than (c) lists, each by z. 10 and AC-8 ("every skipped folder or record is
   named"): a folder of `.limen/jobs/` with no record (pointer `limen status --all`, which lists it as `ORPHAN`), the
   transcript lines that do not parse, by job (the ticket's Risk: "the reader names the job and goes on"), and the
   finished jobs whose run time the transitions do not give (a migrated record without `started-at` has one
   transition; a zero would be a filler for an unknown).
2. `run time` is aligned right like the other numbers; D-073's example has its values under the header's first
   letter. (c) leaves the exact form of the numbers to the golden test.
3. Besides assistant messages and compactions, the reader counts the other entries that carry a Pi usage at the top
   (`branch_summary`, `usage`), as D-072 says: "every transcript entry that carries usage". The tests cover the
   assistant message and the compaction.
4. Beyond (e): the `show` sentence of `docs/commands.md` says that the token totals are those of every entry of the
   job's own transcript that carries a usage, compactions included (round 1, fix 5), because (b) changes what `show`
   prints; and `test/help.test.ts`'s golden help gains the `stats` lines, which the registry entry requires.

Round 1 adds no deviation: its five fixes are those of `ticket.md` → `## Decisions`, "review round 1". Round 2 adds
none either: its two fixes are those of "review round 2", and the reader counts what the callers counted before, a
start that `Date.parse` cannot read included.

## Unmeasured

- `## Deployment` 2.3 and B.3 on the seat: `limen stats` over the migrated history of both projects against the gate-2
  counts (142 jobs, 84 worker, 58 reviewer; 18 failed, 12 `quota` after R-097, 3 timeout, 2 stall, 1 exit), the jobs
  by route and role, the tokens per job and the failure kinds: `unmeasured` M-07 (tokens by class; per landed ticket
  is R-098's), M-11 (failure kinds), M-06 (the run-time part; its split is R-026, R-035, R-064 and R-076's).
- Whether Pi 1.5.1 under the bridge writes the usage of a compaction's model calls into the compaction entry (E-13's
  two extra requests): the tests use Pi's declared shapes (`session-manager.d.ts`, `pi-ai` `Usage`), not a seat
  transcript; B.3 shows it (M-07).

## Open points

1. `limen show` does not name the transcript lines it could not read; its output is unchanged apart from the
   entries with a usage it now counts ((b) says only that `show` keeps using the reader).
2. The ISO-time pattern of `src/job/usage.ts` is a fourth copy of the one in `src/job/record.ts`, `src/lock.ts` and
   `src/job/migration.ts`; T-25 (2) would move it to one module, which this ticket's scope does not cover. Review round 1
   left it so (finding 5, `review.md`): an open point for gate 5.2. The pattern checks the form, not the ranges, so a
   `startedAt` such as month 13 passes the record's validator, and `Date.parse` gives `NaN` for it (guessed from the
   ECMAScript date format; the one-off `node -e` that would show it is not on the allow-list): round 2's `ownFrom` then
   counts every entry, as for no start, and an entry whose `timestamp` names no real time is never counted, since
   `NaN >= since` is false. No test of this ticket holds such a time; one definition of the pattern is the place to
   check the ranges.
3. The fake engine writes `{"task": …}` into `session/fake.jsonl`, which is no Pi entry, so `limen stats` over a job of
   the fake engine names that line under `Not read`. No test of this ticket runs `stats` over a fake job. Review round 1
   left it so (finding 2, `review.md`): an open point for gate 5.2.
4. The run time of a record of this Limen starts at publication, so it includes the start queue's wait; the split of
   M-06 comes with the tickets that record the queue (R-026, R-035).
5. The `catch {` ratchet (`SWALLOWED`) keeps its baseline, though the old reader's two catch-alls are gone; the ticket
   lowers only the parse and cast baselines.
6. Night default of round 1 (`ticket.md` → `## Decisions`, review round 1 (3); category A (b), D-054 (2)), for Adrian
   to confirm in the morning: the direct test of `projectStatistics` lives in `test/job/statistics.test.ts`, the file
   that mirrors `src/job/statistics.ts` (T-29 (1)).
7. Review round 3, note 1 (guessed; `review.md` → Round 3): the reader requires what Pi 1.5.1 declares
   (`message.provider` and the four usage classes as integers), where `HEAD`'s reader put `""` and 0 in their place, so
   an assistant line of an older Pi that lacks one of them is a `Not read` transcript line and its tokens are not in
   the totals. It is named (z. 10), not counted with made-up zeros; no transcript of an older Pi is in the
   repository. B.3 on the seat shows whether the migrated history holds such lines (M-07): an open point for gate 5.2.
