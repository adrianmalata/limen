<!-- PL: Wynik R-098 (noc 24/25.11, zamknięty po trzech rundach recenzji): `limen stats` liczy lądowania (job ze
znacznikiem `landed`, jego łańcuch `parent` i recenzenci jego gałęzi, tylko z rekordów) i drukuje dwie linie wariantu A
ze średnimi tokenami na lądowanie i medianą czasu prowadzenia z rozłącznymi częściami, a z flagą `--sessions <dir>`
także dwie linie koordynatora (tokeny, tury, cache read na turę i na lądowanie, cache write pierwszej tury po
lądowaniu). Poprawki F1–F7: lądowanie o północy UTC nie ma czasu prowadzenia także w rekordzie zmigrowanym, transkrypt
joba zachowuje regułę z HEAD (tylko ENOENT to brak), `Not read` liczy lądowania bez danej części czasu prowadzenia, a
czas joba w częściach nie zawiera jego czekania w kolejce (F5, domyślna decyzja nocy do potwierdzenia przez Adriana).
Poprawki G1–G3: lądowanie przez `ticket done` leży w okresie sesji koordynatora według swojego dnia (lokalnego, jak
bierze go `ticket done`), wywołanie z `-h` nie jest lądowaniem dla M-04, a komentarz `startsRun` i nagłówek
`statistics.ts` mówią to, co sprawdza kod. Bramka: 1144/1144. Punkty otwarte 1 (F5) i 6–7 na rano i bramkę 5.3. -->

# R-098 outcome

## Done

- **(a) The land.** `landsOf` in `src/job/statistics.ts` groups the records of `.limen/jobs/` and the job archive into
  lands, in the order of `landed.at`: each job with a `landed` marker, then every job its `parent` chain reaches, then
  every job of role `reviewer` whose `branch` (and `repo`) is the landed job's. A job belongs to at most one land: the
  landed jobs are taken first, a chain stops at a job another land holds or that landed itself, so a parent two lands
  reach belongs to the one that landed first. Nothing is read from Git.
- **(b) Per land.** The tokens by class are the sum of the land's jobs' own transcripts (R-024's `readSessionUsage`),
  the coordinator's not added. `leadTimeOf` gives the total from the earliest `startedAt` or `queueWait.since` of the
  land's jobs to `landed.at`, and the parts queue (each job's `leftAt` − `since`), job runs (the run parts of the
  land's jobs but the reviewers) and review (the reviewers' run parts). A job's run part (`runPart`) is its run time,
  as `runTime` counts it, less its own queue wait, so the parts do not overlap (F5, a night default; Open point 1). A
  part a record cannot give is `undefined`, never guessed: a migrated record's queue wait and with it its run part, a
  wait with no `leftAt`, a job with no run time or no start. A land whose `landed.at` ends in `T00:00:00.000Z`, the day
  `limen ticket done` writes, has no lead time at all, its record migrated or not (F1; Deviation 3).
- **(c) Coordinator sessions.** New flag `--sessions <dir>`; the command resolves it from the caller's folder.
  `src/job/usage.ts` is still the one reader of Pi's session files: `readSessionFile` returns each entry a count
  reads, in the file's order (`at`, `kind`, `usage`, `served`, and the commands of an assistant message's bash tool
  calls, in the shape `src/job/session-commands.ts` reads them), with each rejected line as its `BadData`;
  `usageOf` sums entries; `isTurn` and `startsRun` keep Pi's entry kinds in the reader. `readSessionUsage` now runs on
  the same per-entry form. Both listings of `*.jsonl` files go through one private `jsonlFiles`: a job's
  `transcriptFiles` keeps `HEAD`'s rule, where only a missing `session` folder (`ENOENT`) means no transcript and any
  other failure goes on (F2, T-01); `sessionFiles`, for `--sessions`, returns undefined for `ENOENT` and `ENOTDIR`, and
  the command refuses both with `SESSIONS_NOT_FOUND`, class `usage`, exit 2, `next` `limen stats --help`
  (Deviation 6). No third parser of Pi's entries: the shell commands of a bash call are split by `simpleCommands`, an
  export of the splitter `src/job/session-commands.ts` already had (and `unproven` uses it now).
- **(d) From the sessions.** Totals by class, sessions (files), turns (assistant messages), the days of the span from
  the first to the last entry that carries a usage; cache read per turn; M-03 = the sessions' cache read ÷ the lands
  whose `landed.at` lies within that span (a `ticket done` land by its day, G1); M-04 = for each bash call that runs
  `limen land` or `limen ticket done` (by name or a path ending in `/limen`, not with `--help` or `-h`), the cache write
  of the first assistant message after the next `user` or `custom_message` entry, reported as median, maximum and
  count. Every entry of a file counts, those of abandoned branches of Pi's tree included.
- **(e) Output.** After the jobs table and before `Failed by kind`: `Lands (…), per land: …` and `Lead time per land
  (median): …`, or `Lands: none`; with `--sessions`, `Coordinator (…): …` and `Coordinator cache read: …`, with `—` for a
  number the records cannot give and `none found` with no land call in the sessions. `Not read` adds, each with its
  count: `the lead time of N lands by limen ticket done`; then, for the other lands, one item per part of the lead time
  whose median leaves lands out, named as the lead time line names the part, `the lead time of N lands`, `the queue of
  N lands`, `the job runs of N lands` and `the review of N lands` (F3; `LEAD_PARTS`, `unknownPartsOf`); with
  `--sessions`, `N lands outside the coordinator sessions' span` and `N lines of the coordinator sessions`.
- **(f) Registry and help.** The `stats` entry's summary is "jobs by route and role, tokens and lead time per land;
  --sessions adds coordinator turns", its schema has `--sessions <dir>`, `refuses` has `SESSIONS_NOT_FOUND`, its example
  is `limen stats --sessions ../coordinator-sessions`. The public section of `docs/commands.md` follows.
- **(g) Tests.** `test/cli/stats.test.ts`: the four existing golden outputs gain `Lands: none`; new: the golden test with
  three lands (a continued parent with a queue wait and a reviewer of its branch, a `ticket done` land, a migrated land
  with a reviewer), two jobs of no land (one a reviewer of another branch) and two coordinator session files (assistant
  messages, a compaction, a `limen land` call, the rest of its run and a wake, a `limen ticket done` call and the owner's
  next message, a line cut in the middle); the same history without `--sessions`; a land outside the sessions' span left
  out of `per land`; `limen land --help` is no land; sessions with no land (`Lands: none`, `— per land`, `none found`);
  `SESSIONS_NOT_FOUND` with exit 2 and its final line. Round 1: the two goldens of the three lands now read `job runs
  1 h 20 · review 0 h 45` (F5) and name the migrated land's three unknown parts on `Not read` (F3); new: a migrated
  record that `ticket done` marked has no lead time and is named on `Not read` (F1); a land whose every part is unknown
  prints `—` for each, with the four items of F3 (F4); a `--sessions` path that names a file refuses
  `SESSIONS_NOT_FOUND` (F2, Deviation 6); the file's header line names the lands and the coordinator sessions (F7).
  `test/job/usage.test.ts`: the per-entry form (time, kind, usage, bash commands; tool results and a model change are no
  entries), a rejected line returned as unread, and (F2) a job whose `session` is a file throws `ENOTDIR` instead of
  reading as 0 tokens. `test/job/statistics.test.ts`: a land's jobs (its chain and the reviewer of its branch, not a
  reviewer of another branch), a parent two lands reach in the first only, the lead time with the migrated job's queue
  and run part unknown (F5 changed its numbers), (F5) a land with queued jobs whose queue, job runs and review add up to
  its jobs' run times, a `ticket done` land with no lead time. `test/registry.test.ts`: the T-04 read test runs `stats
  --sessions <dir>` on a session folder beside the project, made read-only and digested by the snapshot.
  `test/help.test.ts`: the general help lines of `stats` and a golden test of `limen stats --help`.
- **(h) Text.** `docs/jobs.md:53` describes the lands, the lead time, `--sessions` and the new `Not read` items; round
  1 corrects its sentences on the run parts (F5), on the `ticket done` land (F1) and on `Not read` (F3). The comments
  of `src/job/statistics.ts:1-12`, `src/commands/stats.ts` and `src/job/usage.ts:1-9` say what they now do; round 1
  corrects the comments beside `DAY_ONLY`, `LeadTime` and `leadTimeOf` (F1, F5).
- **Review round 1, the rest.** F6: the private reader of `src/job/statistics.ts` is `readProjectJobs`, a name no
  other module's function has (it was `readJobs`, as in `src/project/board-jobs.ts`). Finding 5 is not fixed
  (`review.md` → Round 1; Open point 2).
- **Review round 2 (G1–G3).** G1: `landsWithin` (`src/job/statistics.ts`) compares a land by `limen ticket done`
  (`DAY_ONLY`) by its day: it lies within the sessions' span when its day lies from the day of the span's first entry
  to the day of its last, each taken by `localDay` (`src/project/lanes.ts`), the local day `ticket done` takes for the
  ticket; every other land is compared by its time, as before. M-03's divisor and the `Not read` item of the lands
  outside the span both read it. G2: `HELP` matches `-h` as well as `--help`, each as a word of its own, the two words
  the parser takes as help (`asksHelp`, `src/parser.ts`), so a bash call `limen land <id> -h` is no land for M-04
  (Deviation 5). G3: the comment of `startsRun` (`src/job/usage.ts`) says what it checks, an entry of role `user` or a
  `custom_message`, and that a Limen message that joins an active run as a follow-up is taken as a start too (E-16;
  Open point 5); the header comment of `src/job/statistics.ts` is wrapped at 120 columns. Tests, in
  `test/cli/stats.test.ts`: a `ticket done` land on the first day of the sessions counts in the cache read per land
  (G1); a call of `limen land 2b3c4d5e -h` is no land (G2), with the `--help` test through one helper
  (`afterCallLines`). Finding 6 is not fixed (`review.md` → Round 2).

## Proof

All from the repository root, at `02492cb` with this change in the working tree, after the fixes of rounds 1 and 2.

- AC-1: `node --test test/cli/stats.test.ts` → exit 0, tests 17, pass 17, fail 0.
- AC-2: `node --test test/job/usage.test.ts test/job/statistics.test.ts` → exit 0, tests 17, pass 17, fail 0 (10 in
  `usage.test.ts` and 7 in `statistics.test.ts`, which round 2 does not change).
- AC-3: `node --test test/registry.test.ts` → exit 0, tests 32, pass 32; `node --test test/help.test.ts` → exit 0,
  tests 11, pass 11.
- AC-4: `node --test test/structure.test.ts` → exit 0, tests 50, pass 50.
- AC-5: `node adrian-rebuild/tools/fails-before.mjs` → the main session's run (below); the changed test files are the
  same five as in round 0, and each fails at `HEAD`; round 2 changes only `test/cli/stats.test.ts` among them.
- AC-6: `node adrian-rebuild/tools/gate.mjs` → exit 0: tests 1144, pass 1144, fail 0, cancelled 0, skipped 0
  (duration 278.8 s; `tsc --noEmit` and `biome check --error-on-warnings .`, "Checked 282 files … No fixes applied",
  ran before it in `npm run check`), one run, unpiped.
- AC-7: `biome check --error-on-warnings .` inside the gate (above); `npx biome check --error-on-warnings
  adrian-rebuild` → exit 0; `node adrian-rebuild/tools/check.mjs` → exit 0.

## Fails before

Round 0, written before the change, run on the unchanged code:

- `node --test test/job/usage.test.ts test/job/statistics.test.ts` → both files fail to load: `SyntaxError: The
  requested module '../../src/job/statistics.ts' does not provide an export named 'landsOf'` and `… '../../src/job/
  usage.ts' does not provide an export named 'readSessionFile'` (tests 2, fail 2).
- `node --test test/cli/stats.test.ts` (then 11 tests) → 9 fail, 2 pass (the T-04 snapshot and `NOT_MIGRATED`, which
  this change keeps): the four existing goldens miss `'Lands: none'`; the run without `--sessions` printed the jobs
  table exactly as the new golden expects but no `Lands` and `Lead time` lines and no `Not read` line; every run with
  `--sessions` exited 2 (`actual: 2, expected: 0`), and `SESSIONS_NOT_FOUND` got `BAD_ARGUMENT`. The `--help` test,
  written after, also gets exit 2 at `HEAD`.

Round 1, the tests of F1–F5 written first and run on the working tree of round 0, before the fixes:
`node --test --test-reporter=tap test/job/statistics.test.ts test/job/usage.test.ts test/cli/stats.test.ts` (piped
into `grep`, so its own exit code was not shown) → tests 32, pass 25, fail 7, each for the reason its fix names:

```
not ok 6 - limen stats: the lands of the records and the coordinator's sessions, with their tokens, lead time, turns and turns after a land
  +   'Lead time per land (median): 3 h 00 · queue 0 h 10 · job runs 1 h 25 · review 0 h 35',
  -   'Lead time per land (median): 3 h 00 · queue 0 h 10 · job runs 1 h 20 · review 0 h 45',
  +   "Not read: the lead time of 1 land by limen ticket done · 1 land outside the coordinator sessions' span · 1 line of the coordinator sessions",
  -   "Not read: the lead time of 1 land by limen ticket done · the queue of 1 land · the job runs of 1 land · the review of 1 land · 1 land outside the coordinator sessions' span · 1 line of the coordinator sessions",
not ok 7 - limen stats without --sessions prints the lands of the records and no coordinator line
  (the same two lines, without the --sessions items)
not ok 8 - limen stats gives no lead time to a migrated record that limen ticket done marked, and names it on Not read
    actual: [ 'Lead time per land (median): 16 h 00 · queue — · job runs 1 h 20 · review 0 h 00' ],
    expected: [ 'Lead time per land (median): — · queue — · job runs — · review —', 'Not read: the lead time of 1 land by limen ticket done' ],
not ok 9 - limen stats prints — for each lead time part no land has, and names on Not read the lands whose part is unknown
    actual: [ 'Lead time per land (median): — · queue — · job runs — · review 0 h 25', 'Not read: the run time of 1 finished job' ],
    expected: [ 'Lead time per land (median): — · queue — · job runs — · review —', 'Not read: the run time of 1 finished job · the lead time of 1 land · the queue of 1 land · the job runs of 1 land · the review of 1 land' ],
not ok 20 - a land's lead time runs from its first start to its land, split into queue, job runs and review, a migrated job's queue and run part unknown
    actual: { total: 7200000, queue: undefined, runs: 4800000, review: 1500000 },
    expected: { total: 7200000, queue: undefined, runs: undefined, review: 1200000 },
not ok 21 - a land's queue, job runs and review add up to its jobs' run times: a job's run part leaves out its own queue wait
    actual: { total: 10800000, queue: 1500000, runs: 3600000, review: 2400000 },
    expected: { total: 10800000, queue: 1500000, runs: 2700000, review: 1800000 },
not ok 29 - a job whose session is a file is not read as 0 tokens: the failure to list its transcripts goes on
  AssertionError [ERR_ASSERTION]: Missing expected exception.
    actual: undefined,
    expected: { code: 'ENOTDIR' },
```

Test 8 is F1's (a lead time to midnight, nothing on `Not read`), 9 is F4's with F3's line, 6, 7 and 20 changed with F3
and F5, 21 is F5's and 29 is F2's. The new test that a `--sessions` file refuses passed before the fixes, as it should:
it guards Deviation 6 through the change of F2. After the fixes: the same command → tests 32, pass 32, fail 0.

AC-5 and AC-6 of round 0, the main session's runs at `HEAD` `02492cb`: `node adrian-rebuild/tools/fails-before.mjs` →
exit 0, first line `fails-before: test/cli/stats.test.ts, test/help.test.ts, test/job/statistics.test.ts,
test/job/usage.test.ts, test/registry.test.ts fail at HEAD (exit 1)`; `node adrian-rebuild/tools/gate.mjs` → exit 0,
tests 1137, pass 1137, fail 0 (267.8 s). Round 1 changes no other test file, so the main session's `fails-before.mjs`
at `HEAD` covers the same five files.

AC-5 and AC-6 after round 1's fixes (F1–F7), the main session's runs: `node adrian-rebuild/tools/fails-before.mjs` →
exit 0 at `HEAD` `02492cb`, the same five files failing at `HEAD` (exit 1); `node adrian-rebuild/tools/gate.mjs` → exit
0, tests 1142, pass 1142, fail 0 (272.1 s).

AC-5 and AC-6 after round 2's fixes (G1–G3) and the main session's text fix of `docs/jobs.md:53` (the implementer's
round-2 open point 1: a `ticket done` land is compared with the span by its local day): `node
adrian-rebuild/tools/fails-before.mjs` → exit 0 at `HEAD` `02492cb`, the same five files failing at `HEAD` (exit 1);
`node adrian-rebuild/tools/gate.mjs` → exit 0, tests 1144, pass 1144, fail 0 (273.9 s).

Round 2, the tests of G1 and G2 written first and run on the working tree of round 1, before the fixes:
`node --test test/cli/stats.test.ts` → exit 1, tests 17, pass 15, fail 2, each for the reason its fix names (the
`--help` test, which now goes through the helper it shares with G2's test, passed):

```
test at test/cli/stats.test.ts:548:1
✖ limen stats counts a land by limen ticket done on the first day of the coordinator sessions in the cache read per land
  +   'Coordinator cache read: 30k per turn · — per land · first turn after a land: none found'
  -   'Coordinator cache read: 30k per turn · 60k per land · first turn after a land: none found'

test at test/cli/stats.test.ts:603:1
✖ limen stats finds no land in a coordinator's call of limen land <id> -h, which the parser takes as help
  +   'Coordinator cache read: 1.0k per turn · — per land · first turn after a land: cache write 50k median, 50k max (1 land)'
  -   'Coordinator cache read: 1.0k per turn · — per land · first turn after a land: none found'
```

The first is G1's (the `ticket done` land at `2026-11-02T00:00:00.000Z` came before the sessions' first entry at 09:00
UTC, so M-03 had no land to divide by), the second G2's (`-h` was taken as a land, its next run's cache write counted).
After the fixes: the same command → exit 0, tests 17, pass 17, fail 0. G3 changes comments only.

## Deviations from the ticket

None from `## Change` in substance; these are readings where the ticket's words leave a case open, each recorded in a
comment beside its code:

1. A reviewer's branch matches the landed job's when the name and the `repo` are equal: a nested repository's branch of
   the same name is another branch.
2. When several lands share a branch (a continuation that landed after its parent landed, or a `--branch` worker), a
   reviewer of that branch goes to the first of them that landed at or after its start, else to the last; with one land
   per branch, the usual case, every reviewer of the branch is in it, as the ticket says.
3. A land by `limen ticket done` is told from its marker alone: a `landed.at` that ends in `T00:00:00.000Z`, the
   ticket's day at midnight UTC (`src/job/landing.ts:283`), whether its record is migrated or not, because `ticket
   done` also marks a migrated record that owns landed work (`ownsLandedWork`, `src/job/landing.ts:288-291`, has no
   `migrated` exclusion) (F1). A land by `limen land`, or a migrated marker from a closing commit, made at exactly
   midnight UTC is then also named on `Not read` and its lead time left out: a number is missing, none is guessed.
4. A record without `migrated` and without `queueWait` never queued (its documented meaning, `src/job/record.ts`), so
   its queue part is 0; a migrated record's is unknown.
5. A bash call of `limen land` or `limen ticket done` with `--help` or `-h` as a word of its own, the two words the
   parser takes as help (`asksHelp`, `src/parser.ts`), is no land for M-04: it prints help and lands nothing (`-h`
   since review round 2, G2).
6. `SESSIONS_NOT_FOUND` names `limen stats --help` in `next`, which explains the flag; the ticket names no `next`. A
   `--sessions` path that names a file, not a folder (`ENOTDIR`), refuses the same way, with its own test. The rule is
   the flag's only: a job's `session` that is a file is no expected absence and its failure goes on, as at `HEAD` (F2,
   T-01).
7. `src/job/session-commands.ts` gains the export `simpleCommands` (its existing splitter), which `## Change` does not
   name as a file to change; it keeps one module for splitting a shell call (T-25 (1), (2)) where a regex of its own
   would have been a second.
8. The reader now validates, in a job transcript too, the timestamp of the owner's messages and of Limen's custom
   messages and the `content` of an assistant message when present (an array of objects), since a count reads them
   now; such a line that R-024 skipped unread now counts on `Not read`. No test or fixture of the suite holds one.
9. (e)'s `Not read` item "the lands of the records not found in the sessions" is the lands whose `landed.at` lies
   outside the sessions' time span (review round 2, note 5): the same lands that (d)'s M-03 leaves out of its divisor,
   so the item says what the per-land figure did not count; a land inside the span whose call is not in the sessions
   is not looked for.

## Unmeasured

- M-03 (coordinator cache read per landed ticket), M-04 (cache write of the turn after a land), M-06 (lead time per
  ticket) and M-07 (tokens per landed ticket): `unmeasured` here. `limen stats` is their source; their "before" is
  `plan.md` → `## Deployment` B.3 with B.4's copy of the coordinator sessions, their "after" 9.1, both on the seat.

## Open points

1. **Run parts without the queue wait: a night default, for Adrian to confirm in the morning (F5, D-054 (2) (b)).** A
   job waits in the start queue in the state `running` (`src/runtime/wrapper.ts`: the handshake to `running` comes
   before `waitForStart`), so its run time, as the jobs table counts it, holds its queue wait. Review round 1 (finding
   6) chose option (b) of round 0's open point, since (b)'s "split" and M-06 ask for parts that do not overlap:
   `job runs` and `review` are each job's run time less its own queue wait (`runPart`), and a job whose queue wait is
   unknown (a migrated record) gives an unknown run part, which `Not read` names (F3). The jobs table's `run time`
   column is unchanged and still holds the wait. Option (a), the run time as the jobs table counts it, which counts
   every queued minute twice, would be `finishedRun` in place of `runPart` in `leadTimeOf`, with the goldens and
   `docs/jobs.md:53`. The cost of (b) for the comparison (review round 2, note 2): every record of B.3 is migrated, so
   with (b) every B.3 land prints `queue`, `job runs` and `review` as `—`, and M-06's "before" is the total lead time
   alone; with (a) B.3's `job runs` and `review` would be known, holding any queue wait, and comparable with 9.1's
   counted the same way, while `queue` overlaps them. The main session kept (b) as the ticket's "split" reads, and
   Adrian chooses.
2. Records an a0.2.0 Limen wrote before R-035's `queueWait` (a0.3.0) are not migrated, so a queued one of them reads
   as queue 0 (review finding 5, not fixed): a record joins a land only as a landed job, its `parent` chain or a
   reviewer of its branch, and the projects stand from a0.1.1 until a0.3.0 (D-012), so no land of a0.2.0 exists and no
   later land reaches back to one of its jobs. For gate 5.3: should a project have run jobs under a0.2.0 after all,
   the queue part of their lands would read low, and their run parts high, by those waits. B.3 reads migrated records
   only (queue `—`), and 9.1's records come after a1.0.0, which writes `queueWait`.
3. M-04 counts a `limen land` call that land refused (exit 1) as a land, as the ticket defines a land in a session by
   its call; the bash result's `isError` would tell it apart (`src/job/session-commands.ts` reads it), at the cost of
   reading tool results in the reader. Two land calls in one run share the turn after them, and both count.
4. A land call through another wrapper than `limen` or a path ending in `/limen` (such as `npx limen land`) is not
   found; the seat's coordinator calls `limen`.
5. M-04's "turn after a land" can belong to the land's own run (review round 2, note 1): the ticket's (d) takes the
   first assistant message after the next `user` or `custom_message` entry, but a Limen message that arrives while a
   run is active joins that run as a follow-up (E-16), and `before_agent_start`, where A-037's prefix changes, runs
   once per run (E-11). A session file does not tell the two apart (both follow an assistant message with no tool
   call), so such a turn's cache write can read low; B.3 and 9.1 count the same way, and the median over the lands
   keeps one such turn from setting the number.
6. T-25 (review round 3, note 1, D-092; the rounds of fixes spent, no ticket rewrites the module): the private
   `coordinatorLines` of `src/job/statistics.ts` has the name of the private `coordinatorLines` of
   `src/project/summary.ts`, as `readJobs` had before F6; T-25's name scan covers only `src/boundary.ts` and
   `src/outcome.ts` (`test/structure.test.ts`), so the gate does not see it. A rename, for gate 5.3.
7. The `Coordinator (…)` line prints its span as UTC days (`dayOf`), while G1 compares a `ticket done` land with the
   span's local days (`localDay`), so on a seat outside UTC the printed span can differ from the compared days by one
   at either end (the implementer's round-2 open point 2, review round 3's first reply); only the printed dates differ.
   The second form of the `ticket done` marker's day (`landing.ts` writes it, `DAY_ONLY` matches it) goes to R-103's
   notes (review round 3, note 2).
