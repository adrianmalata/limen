<!-- PL: Ticket R-024 (H-01, H-20, §2, T-33, D-072, D-073): nowe polecenie odczytu `limen stats` dla jednego projektu.
Czyta rekordy jobów i ich transkrypty (nigdy prozy z `log` ani `result`) i pokazuje tabelę trasa × rola: liczbę jobów,
done, failed, czas pracy i tokeny w czterech klasach, potem awarie według rodzaju i to, czego nie przeczytało. Metryki
na wylądowany ticket i tury koordynatora przechodzą do R-098 po R-031. Stan: napisany 21.11 w dzień; gotowy (ready). -->

# R-024 `limen stats` over records and transcripts

## Problem

Adrian's decisions, quoted from `plan.md` → `## Decisions`:

- D-072 (Q-22, option 1): "R-024 reads the job records and the job transcripts: counts of jobs by role, state,
  failure kind and route; run time from the transitions; tokens by class (input, cache write, cache read, output)
  from every transcript entry that carries usage, compaction included (E-13). Per landed ticket (M-03, M-06, M-07) and
  coordinator turns (M-03, M-04) go to a new ticket after R-031 in stage 3 (R-098), because `landed` exists only from
  R-031 (D-057 (4): never from the git graph); `## Deployment` B.3 for those metrics follows a0.3.0; 2.3 stays with
  a0.2.0. Settled by the documents: `stats` counts one project (T-18 (3)), so 2.3 is two runs; it reads only records
  and transcripts, never the prose of `log` or `result` (T-37 (1), z. 2); fields the record does not hold yet come with
  the tickets that record them (queue R-026 and R-035, verdict R-064, owner touchpoints R-076); no time filter (B.3 runs
  on the snapshot copy, the window of 9.1 is stage 9's; YAGNI); the folders of `.limen/unmigrated/` get one line with
  their count, a null role its own row (z. 10)."
- D-073 (Q-23, variant b, its last line corrected at Adrian's word): the output is a table by route and role, then the
  failures by kind, then what was not read (the example's numbers are made up):

```
Jobs by route and role (98 records, 2026-10-02 to 2026-11-14)
  route                           role      jobs  done  failed  run time  input  cache write  cache read  output
  anthropic/claude-opus-5-5 high  worker      60    52       8  29 h 40    0.8M         6.1M        201M    1.4M
  anthropic/claude-opus-5-5 high  reviewer    38    34       4  11 h 32    0.4M         3.7M        109M    0.7M
Failed by kind: quota 8 · timeout 2 · stall 1 · exit 1
Not read: 3 folders in .limen/unmigrated/
```

The sources:
- H-01 (`audit.md`): the job data exist, but "nothing aggregates it". H-20: everything exists "except a structured
  review verdict".
- Gate 2 §2, Measurement (`plan.md`, the verbatim copy): "`limen stats` (S1+) over all records including the archive:
  verdict, judgments per ID, check results and times, rounds, failure kind, `doneBy`, number and origin of steers,
  route, queue time, and tokens by class (input, cache write, cache read, output) from the transcript, per job and per
  coordinator turn; grouped by route (A-030′)." R-024 builds the part the records and job transcripts hold today
  (D-072).
- T-33: "records with role scout are read as history (`limen stats`)"; its Check: "a test that `limen stats` reads
  historical scout records".
- T-04: a read command never writes and never waits, and does not import the transition functions. T-18 (3): `stats`
  is a "This project" read. T-26: a thin handler over a domain operation. T-27 (2): outside data only through the
  validators of `src/boundary.ts`. T-28 (2): a golden test of a read command's output. T-37: no `--json`; the text
  for people is one form.
- `## Deployment` 2.3: "`limen stats` over the migrated history of both projects matches the counts known from gate 2:
  142 jobs (84 worker, 58 reviewer; T-33) and 18 failed (12 limit, 3 timeout, 2 stall, 1 exit …)". R-097 makes the
  limit failures `quota`.

Facts at `6556e38` (the read-only inventory `adrian-rebuild/evidence/inventories/R-024.md`, taken at `972c782`; the
main session checked the ones it quotes again at `6556e38`):
1. No `stats` command or module exists. Registry entries (`src/registry.ts:72-83`) carry `object`, `kind`,
   `visibility`, `summary`, `ids`, `example`, `handler`; `docs/commands.md` holds generated help lines a test compares
   with the registry.
2. The record (`src/job/record.ts`): `role`, `route` (`engine`, `model`, `provider`, `thinking`, each nullable),
   `state`, `transitions` (`from`, `to`, `at`), `startedAt`, `finishedAt`, `failure` (`kind`, `detail`, `resetAt`),
   `migrated`. A migrated record's transitions come only from `started-at` and `finished-at` (D-057 (4)). Reads:
   `jobFolderNames`, `jobFolders` (refuses `NOT_MIGRATED`), `readRecord` (throws `BAD_DATA`).
3. Job transcripts: `<job>/session/*.jsonl` (`src/runtime/engine.ts`, `--session-dir`); a continuation copies its
   parent's transcript (`src/job/publication.ts`). `src/job/usage.ts` `readSessionUsage(jobDir, since)` sums
   `usage.{input,output,cacheRead,cacheWrite}` of assistant messages written at or after `since`, with a raw
   `JSON.parse` and casts (the ratchets of `test/structure.test.ts`); only `limen show` uses it. Pi 1.5.1 also writes
   `compaction` entries that carry usage (`session-manager.d.ts` in the vendor copy; E-13: a compaction is two extra
   requests with cache writes), which it skips.
4. `.limen/unmigrated/<id>/` holds the folders the migration could not read (`src/job/migration.ts`).
5. Test helpers: `test/plant.ts` (`plant`, `limen`, `writeRecord`, `editRecord`); a hand-written transcript in
   `test/s1-spawn.test.ts`; the reader of the final line `test/final-line.ts` (`outputText`).

## Change

(a) `limen stats`: a `read` command of the project (T-18 (3)) in the registry, with its help line, a thin handler over
one domain module (T-26, the implementer names it). It reads every record of `.limen/jobs/` through the record module,
writes nothing and waits for nothing (T-04), and ends with the final line `{"class":"ok","code":null,"next":null}`. On
a project that is not migrated it fails as every command that reads jobs does (`NOT_MIGRATED`).

(b) Tokens by class come from one transcript reader: `src/job/usage.ts` reads through the validators of
`src/boundary.ts` (T-27 (2)) instead of a raw `JSON.parse` and casts, and counts every entry that carries a Pi usage
(assistant messages and compactions, E-13), from the job's own start, so a continuation does not count its parent's
copied turns; `limen show` keeps using it. The ratchet baselines of `test/structure.test.ts` drop by the parses and
casts removed.

(c) The output is D-073's variant b:
- a heading `Jobs by route and role (<n> records, <first day> to <last day>)`, from the records' start times;
- one row per route and role, sorted by route, then role: the route as `<provider>/<model> <thinking>` (an unknown
  part named, never left blank), the role (a null role as its own row, z. 10), the number of jobs, how many are
  `done` and `failed`, the run time summed from each finished job's transitions, and the four token classes;
- `Failed by kind: <kind> <n> · …`, failed jobs with a null kind counted under their own name;
- `Not read: …`: the folders of `.limen/unmigrated/` and any record that does not parse, each with its count; the
  line is absent when nothing was skipped. The folders get no pointer, since a second `limen migrate` has nothing to
  do with them (D-073, `docs/jobs.md`); a record that does not parse is named with `limen status --all`, which shows
  it.
- the number formats (token units, the run time) by the variant; their exact form is the golden test's.
Historical scout records are rows like any other role (T-33).

(d) Tests, in the new `test/cli/stats.test.ts` and `test/job/usage.test.ts`: a golden test of the whole output over a plant with records of several routes and roles (a scout and a
null role among them), migrated and new records, failures of several kinds and a null kind, an unmigrated folder and a
record that does not parse; a transcript test of (b) with an assistant message, a compaction entry and a parent turn
copied before the job's start; `stats` on a project with no records; `stats` leaves the snapshot of
`test/snapshot.ts` (R-092) identical; the old-project refusal.

(e) `docs/commands.md` (the generated help line) and `docs/jobs.md` ("Read a job through …") name `limen stats`.

## Out of scope

- Per landed ticket, coordinator turns and the turn after a land (R-098, after R-031; D-072).
- Verdict, judgments, check results, rounds, `doneBy`, steers, queue time, owner touchpoints (the tickets that record
  them: R-026, R-035, R-064, R-076; D-072).
- The parameterised "a read does not write" test over every read command (R-025).
- A time window or several projects in one run (D-072).

## Acceptance

- AC-1: `node --test test/cli/stats.test.ts` → exit 0.
- AC-2: `node --test test/job/usage.test.ts` → exit 0.
- AC-3: `node --test test/structure.test.ts` → exit 0.
- AC-4: `node --test test/registry.test.ts` → exit 0.
- AC-5: `node adrian-rebuild/tools/fails-before.mjs` → exit 0, its output in `outcome.md` → `## Fails before`.
- AC-6: `node adrian-rebuild/tools/gate.mjs` → exit 0.
- AC-7: `npx biome check --error-on-warnings .` → exit 0; `node adrian-rebuild/tools/check.mjs` → exit 0.
- AC-8 (judgment): the output follows D-073's variant b, and every skipped folder or record is named (z. 10).

## Migration

None: a new read command; the record format does not change.

## Risk

- A transcript that does not parse must not end `stats`: the reader names the job and goes on (z. 10), with a test.

## Rollback

`git revert $(git log --format=%H --grep='^R-024:' adrian-rebuild --)`.

## Decisions

- 2026-11-21 D-072 and D-073 (Adrian): quoted in `## Problem`.
- 2026-11-22, the night session's reading of the plan (settled by the documents, not a night default): the success
  test of the new registry command is named `limen stats: …` (D-076, the scan R-025 adds), and its refusal test starts
  with the code, `NOT_MIGRATED: …` (T-29 (2)).
- 2026-11-22, review round 1 (`review.md` → Round 1), the first round of fixes, for a fresh implementer (D-026 (2)):
  (1) `modelLine` (`src/job/usage.ts`): while no assistant turn served a model (`served` empty, e.g. only compactions
  or `usage` entries counted since the start), `limen show` names the requested model as before ("requested <model>;
  no turn yet"), with a test that fails before. (2) `tokenText` (`src/job/statistics.ts`): the unit and the decimal
  follow the rounded value, so 9,950 prints `10k` and 99,500 prints `0.1M`, with a test of each boundary that fails
  before. (3) T-26 (5): the operation is tested directly in a new `test/job/statistics.test.ts` (T-29 (1)), which holds
  the boundaries of (2); night default (category A (b), D-054 (2)), for Adrian to confirm in the morning: the place of
  that test. (4) T-29 (3): usage test 1 is split into the compaction counted and the parent turn before the start not
  counted, usage test 2 into the cut line named and the bad usage class named (each with the other lines still
  counting); usage test 3 stays. (5) `docs/commands.md`: the `show` sentence says the totals are those of every entry
  of the job's own transcript that carries a usage, as `docs/jobs.md` says. Not fixed, with the reason in `review.md`:
  findings 2 and 5 (open points). `outcome.md` records the round under its sections.
- 2026-11-22, review round 2 (`review.md` → Round 2), the second and last round of fixes, for a fresh implementer:
  (1) T-25 (1) and (b): which transcript entries count is the reader's policy, so `readSessionUsage` takes the job's
  recorded start (`record.startedAt`, possibly null) and derives the bound itself; `src/job/statistics.ts` and
  `src/job/listing.ts` pass the field instead of computing `Date.parse(…) || 0`; a record with no start counts every
  entry, as today, with a test of it in `test/job/usage.test.ts`. (2) `docs/commands.md`: the `show` sentence says
  that `turns` counts the assistant messages and that the token totals are those of every entry of the job's own
  transcript that carries a usage, compactions included. `outcome.md` records the round under its sections.
