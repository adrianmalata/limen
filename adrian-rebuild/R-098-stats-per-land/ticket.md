<!-- PL: Ticket R-098 (D-072, D-098; A-078, A-037, gate 2 §2): `limen stats` liczy lądowania (job ze znacznikiem
`landed` z łańcuchem `parent` i recenzentami jego gałęzi) i pokazuje na lądowanie średnie tokeny i medianę czasu
prowadzenia z podziałem, a z flagą `--sessions <dir>` także tokeny koordynatora, cache read na turę i na lądowanie oraz
cache write pierwszej tury po lądowaniu; to źródło M-03, M-04, M-06 i M-07 w krokach B.3, B.4 i 9.1. Stan: napisany
23.11 przy `f5d8b7b` z inwentarza `evidence/inventories/R-098.md`; odpowiedzi Adriana Q-54–Q-57 i rozstrzygnięcia
dokumentów w `## Decisions`; gotowy na noc. -->

# R-098 `limen stats` per landed ticket and per coordinator turn

## Problem

D-072 (Adrian, 2026-11-21): "Per landed ticket (M-03, M-06, M-07) and coordinator turns (M-03, M-04) go to a new
ticket R-098 after R-031 in stage 3, because `landed` exists only from R-031 (D-057 (4): never from the git graph)";
`stats` "reads only records and transcripts, never the prose of `log` or `result` (T-37 (1), z. 2)"; "no time filter";
"fields the record does not hold yet come with the tickets that record them (queue R-026 and R-035, verdict R-064, owner
touchpoints R-076)".

Gate 2 §2 (Measurement): "`limen stats` (S1+) … tokens by class (input, cache write, cache read, output) from the
transcript, per job and per coordinator turn"; "Named seat measurements: coordinator cache-read tokens per landed ticket
(A-078); cache-write tokens in the turn after a land (A-037)". `plan.md` → `## Measurement`: M-03 "Coordinator
cache-read tokens per landed ticket (A-078)", M-04 "Coordinator cache-write tokens in the turn after a land (A-037)",
M-06 "Lead time per ticket, split into queue, job runs, checks, review and waiting for the owner", M-07 "Tokens per
landed ticket by class (input, cache write, cache read, output)"; their source is `limen stats`, their "before" B.3.

Facts at `f5d8b7b` (`evidence/inventories/R-098.md`):
1. `limen stats` (`src/commands/stats.ts`, `src/job/statistics.ts`, registry `src/registry.ts:555-566`, `schema: []`)
   counts jobs by route and role over `.limen/jobs/` and the job archive; nothing groups by `landed`, by ticket or by
   time (`statistics.ts:61-92`).
2. The record has no ticket field; `Landed` is `{ sha, at }` (`src/job/record.ts:181-184`). `limen land` marks the job
   it merges with `at` = now (`src/job/landing.ts:97-100`); `limen ticket done` marks each finished job that owns landed
   work with `at` = the ticket's day at midnight (`:213`); the migration marks only from a `Close <codes>: landed by
   <id>` commit, with that commit's committer time (`src/job/migration.ts:211-251`).
3. Jobs of a landed ticket that carry no marker: reviewers, continued parents, failed rounds (`docs/jobs.md:150`). A
   reviewer's `branch` is its candidate's (`src/job/spawning.ts:759-760`); a continuation has `parent`.
4. No module of `src/` reads a coordinator's Pi session. The one transcript reader `src/job/usage.ts`
   (`readSessionUsage`, `:36-62`) reads `<jobDir>/session/*.jsonl` and returns sums only; `src/job/session-commands.ts`
   reads the bash tool calls of a job's transcript (`:108-116`). A coordinator's sessions are in Pi's sessions
   directory for the project's folder, outside `.limen/` (`evidence/inventories/R-024.md:45-46`).
5. On the bridge, one Pi assistant message's usage sums the API calls of one Pi turn (`evidence/engine-sources/
   bridge-5.0.3.md:78-85`); compaction entries carry a usage (`src/job/usage.ts:118-121`; E-13).

## Change

(a) The unit "land" (D-098 (1)): a job whose record has `landed`, with every job reached from it through `parent`
(continuations, failed rounds continued) and every job of role `reviewer` whose `branch` is the landed job's `branch`;
all from records of `.limen/jobs/` and the archive, never from Git. A job belongs to at most one land. A land that
closes several tickets is one unit.

(b) Per land, from records and the jobs' own transcripts (R-024's per-job reading):
- tokens by class: the sum over the land's jobs (M-07); the coordinator's tokens are not added (D-098 (5) (e));
- lead time (M-06): from the earliest `queueWait.since` or `startedAt` of the land's jobs to `landed.at`, split into
  queue (the sum of each job's `queueWait`, `leftAt` − `since`), job runs (the run times of the land's other jobs, as
  `runTime` counts them) and review (the reviewers' run times); checks and owner waits are not shown until R-064 and
  R-076 record them. A part the records cannot give (a migrated record has no `queueWait`) is not guessed (D-057 (4));
  a land by `limen ticket done`, whose `at` is a day, has no lead time.

(c) Coordinator sessions (D-098 (3)): a new flag `--sessions <dir>` of `limen stats` names the directory of the
project's coordinator sessions (Pi's sessions directory for the project's folder, or B.4's copy of it). `stats` reads
every `*.jsonl` file directly in it, through the one transcript reader (T-25 (1)): `src/job/usage.ts` gains a form that
returns each entry (time, kind, usage) of a session file, and the bash tool calls are read in the shape
`src/job/session-commands.ts` reads, with no third parser of Pi's entries; every line goes through the validators of
`src/boundary.ts` (T-27 (2)), and a line they reject is counted on `Not read` (z. 10). A turn is one assistant message,
the word `limen show` uses (`docs/commands.md:204`); a compaction entry adds its tokens and is no turn; every entry of
the file counts, those of abandoned branches of Pi's tree included (their tokens were spent). Without the flag, `stats`
reads no session and prints no coordinator line. A `--sessions` directory that does not exist refuses with a new code
`SESSIONS_NOT_FOUND`, of the class `JOB_NOT_FOUND` has, declared in the registry entry (D-075).

(d) From the coordinator sessions:
- the totals by class, the number of sessions and turns, and the time span from the first to the last entry counted;
- the cache read per turn (the total cache read ÷ turns);
- M-03 (D-098 (2)): the total cache read ÷ the lands whose `landed.at` lies within the sessions' time span;
- M-04: a land in a session is an assistant message's bash tool call that runs `limen land` or `limen ticket done`;
  the turn after it is the first assistant message after the next `user` or `custom_message` entry that follows the
  tool call (the next run; A-037: the prefix changes at `before_agent_start`, once per run); its cache write is that
  land's; reported as the median and the maximum over the lands found, with their count.

(e) The output (D-098 (4), variant A), after the jobs table and before `Failed by kind`, its numbers in R-024's units
(`tokenText`, `runTimeText`); "per land" is the total over the lands ÷ their count, the lead time parts are medians:
```
Lands (3, 2026-10-09 to 2026-11-04), per land: jobs 2.7 · input 0.2M · cache write 1.1M · cache read 34M · output 0.3M
Lead time per land (median): 2 h 40 · queue 0 h 05 · job runs 1 h 50 · review 0 h 45
Coordinator (2 sessions, 412 turns, 2026-10-02 to 2026-11-05): input 2.1M · cache write 18M · cache read 120M · output 0.4M
Coordinator cache read: 291k per turn · 40M per land · first turn after a land: cache write 210k median, 380k max (3 lands)
```
With no land, the first two lines are one line `Lands: none`. A lead time part no land has is `—`. With no land in the
sessions' span, `per land` is `—`; with no land found in the sessions, the M-04 part reads `first turn after a land:
none found`. The two coordinator lines appear only with `--sessions`. `Not read` also names, each with its count: the
lands with no lead time (`limen ticket done`), the lands of the records not found in the sessions (only with
`--sessions`), and the lines of the coordinator sessions that do not parse.

(f) Registry and help: the `stats` entry's summary names the lands and the coordinator's turns; its `schema` gains
`--sessions <dir>`; `refuses` gains `SESSIONS_NOT_FOUND`. Help and the generated sections of `docs/commands.md` follow
the registry.

(g) Tests, each failing before the change:
- `test/cli/stats.test.ts`: the golden test of (e) on a planted history with two lands (one with a continued parent and
  a reviewer, one by `ticket done`), a migrated land, a job of no land, and a coordinator sessions directory planted in
  the test's temporary folder (assistant messages, a compaction, a `limen land` tool call followed by a new run, a line
  that does not parse); the output without `--sessions`; `Lands: none`; `SESSIONS_NOT_FOUND` with exit code and final
  line; a land outside the sessions' span is not counted in `per land`.
- `test/job/usage.test.ts`: the per-entry form returns each entry's time, kind and usage; a rejected line is returned
  as unread.
- `test/job/statistics.test.ts`: the land grouping (a job in one land only; a reviewer of another branch outside it)
  and the lead time parts with a part missing.
- `test/registry.test.ts`: the T-04 read test also runs `stats --sessions <dir>` and leaves the project, the seat and
  the sessions directory unchanged (`READ_ARGUMENTS`).
- `test/help.test.ts`: the golden help lines of `stats`.

(h) Text that becomes false: `docs/jobs.md:53` (what `stats` counts), the comments `src/job/statistics.ts:1-8`,
`src/commands/stats.ts:5`, `src/job/usage.ts:1-7`, and the registry summary. `plan.md` → `## Deployment` B.3 and B.4
and the paragraph after the `## Measurement` table already name the command (the main session wrote them with this
ticket).

## Out of scope

- Checks and owner waits in the lead time (R-064, R-076), owner touchpoints per ticket (M-08, R-076), failure rounds
  per ticket (M-11, R-069).
- Telling a wake or a resume from an owner message in a coordinator session (M-08's, R-076; R-051 makes Limen's
  messages `custom_message` entries).
- Ticket codes in a record or a marker (D-098 (1) chose the land as the unit), and any time filter (D-072).
- Finding Pi's sessions directory by itself (D-098 (3)).

## Acceptance

- AC-1: `node --test test/cli/stats.test.ts` → exit 0.
- AC-2: `node --test test/job/usage.test.ts` → exit 0; `node --test test/job/statistics.test.ts` → exit 0.
- AC-3: `node --test test/registry.test.ts` → exit 0; `node --test test/help.test.ts` → exit 0.
- AC-4: `node --test test/structure.test.ts` → exit 0.
- AC-5: `node adrian-rebuild/tools/fails-before.mjs` → exit 0, its output in `outcome.md` → `## Fails before`.
- AC-6: `node adrian-rebuild/tools/gate.mjs` → exit 0.
- AC-7: `npx biome check --error-on-warnings .` → exit 0; `node adrian-rebuild/tools/check.mjs` → exit 0.
- AC-8 (judgment): `stats` reads only records and transcripts, never Git, `log` or `result`; a land's jobs come from
  `parent` and the reviewer's `branch`; no number it prints is guessed (a part it cannot know is `—` or named on `Not
  read`); without `--sessions` it reads no file outside the project.

## Migration

None: no on-disk format changes, and `stats` stays a `read` command; a call without the new flag prints the lines of
(e) about lands and nothing about the coordinator.

## Risk

- On the bridge a Pi turn may be several API requests, so the cache read per turn is at least B.1's "about 297k–313k
  cache-read tokens per coordinator request"; the comparison of M-03 before and after uses `stats` on both sides, so
  the unit is the same.
- A Pi session that Adrian ran by hand in the project's folder sits in the same directory and counts as the
  coordinator's.
- M-03 divides the sessions' cache read by the lands in their time span: a session copy that covers more or less than
  the records (B.3's records are from before a0.1.1, B.4's sessions from before a0.4.0) shifts the ratio, which the
  span and the count of lands on the line make visible.

## Rollback

`git revert $(git log --format=%H --grep='^R-098:' adrian-rebuild --)`. Nothing on disk to undo.

## Decisions

Adrian's answers (2026-11-23, "zgodnie z rekomendacjami", D-098), asked in the conversation with a push after the
sources were searched:
1. Q-54: the unit "landed ticket" is a land: a job with `landed`, its `parent` chain and the reviewers of its branch,
   from records; no ticket codes in the marker.
2. Q-55: M-03 is the coordinator sessions' total cache read ÷ the lands whose `landed.at` lies in the sessions' time
   span.
3. Q-56: the coordinator sessions are read only from `--sessions <dir>`; without it, no coordinator line; a directory
   that does not exist is a declared refusal.
4. Q-57: variant A of the output (the lines of (e)).

Settled by the documents when the ticket was written (the main session's reading, not a night default; the
inventory's questions in `evidence/inventories/R-098.md` → section 8):
5. (a) A turn is one assistant message (T-18; `docs/commands.md:204`); a compaction adds tokens and is no turn
   (D-072, E-13); every entry of a session file counts (questions 5 and 15). (b) No time filter (D-072; question 8).
   (c) M-04's land is the `limen land` or `limen ticket done` tool call in the session, and its turn the first of the
   next run, since A-037's mechanism acts once per run at `before_agent_start` (question 10). (d) M-06's lead time runs
   from the land's first queue entry or start to `landed.at`; checks and owner waits come with R-064 and R-076 (D-072);
   a part the records lack is `—`, never guessed (D-057 (4)); a `ticket done` land, whose `at` is a day, has no lead
   time and is named on `Not read` (z. 2; questions 4 and 11). (e) M-07's tokens are the land's jobs only; the
   coordinator's cost is M-03's, with no share attributed (question 12). (f) One transcript reader, through the
   validators (T-25 (1), T-27 (2); question 14).
6. A correction of the reading sent to Adrian with Q-54–Q-57 (item 2 of that message: "the files whose header `cwd` is
   the project's folder"): with the directory given by `--sessions` (Q-56), `stats` reads every session file in it and
   filters nothing by `cwd`, because B.3 runs on a copy of the project in another folder, where the recorded `cwd`
   names the seat's folder; Pi keeps one sessions directory per folder, and jobs write theirs under `.limen/`
   (`--session-dir`), so the directory holds the coordinator's sessions (the hand-run session is a Risk).
7. B.3 and B.4's text (question 17) is in `plan.md` → `## Deployment`: B.4 copies the directory beside the snapshot,
   and B.3 runs `limen stats --sessions <that copy>` inside the migrated copy, which is a Git checkout (`limenRoot`).
