<!-- PL: Ticket R-042 (A-044, A-059, D-121): wycięcie mechanizmu notatki zadania. Znika instrukcja na starcie joba,
dopisek do każdego steera, tura sprawdzenia przed `finish` (pierwsze `finish` kończy job z jego wynikiem), śledzenie
`note.md`/`note.first.md`, stan „done with open checks” i przypomnienia projektu `.agents/limen/reminders.md`; pole
`openChecks` zostaje w rekordzie wersji 1 jako historia (nowe joby piszą `null`). Steer przy 80 % czasu mówi każdej
roli tylko to, co jest prawdą w tym commicie (D-121). Stan: napisany 26.11 przy `83405ae` z inwentarza
`evidence/inventories/R-042.md`; `ready` za R-039. -->

# R-042 The task-note mechanism is cut

## Problem

A-044 (`audit.md:1109-1121`), evidence quoted: "`[limen] Before other work, read ${join(jobDir, NOTE)}, or write it if
there is none.` (≈397 tokens once per session), then one more model turn at the end (`return { entries: [...],
continue: true };`) or a second `finish` call; … `README.md:109` 'How to measure, after about one week.' — no measuring
code in `src/`, `hook/` or `bin/`". Its Decision, quoted (the same in `input/gate-2-decisions.md:214`): "fix — The
task-note mechanism is cut: the start instruction (`noteStart`), the forced note-check turn at the end
(`hook/finish.ts`), `note.md`/`note.first.md` tracking, `open-checks`, the steer appendix (`noteSteer`) and project
reminders (`.agents/limen/reminders.md`). The job task contains the criteria from the record verbatim, with 'Limen will
run these and the reviewer will judge them'. An important easy-to-miss rule goes into the ticket as a `Judgment` or
`Check`. The 80 % steer text drops note references (A-059)."

A-059's Decision (`audit.md:1334`): "… The 80 % steer: worker 'commit your work now; Limen runs the checks', reviewer
'write the verdict and the judgments now'." R-036's ticket (`R-036-stall-over-job-scope/ticket.md:100-101`) gives "the
80 % steer per role" to R-042. D-121, quoted: "the 80 % steer says per role only what is true at its commit: reviewer
and judge "write your verdict now"; researcher "give your report in your final message now"; worker, keeper, quality and
group member "commit your work now"; each after "<N> min left before the timeout: ". R-063 adds A-059's "Limen runs the
checks" and "the judgments" once its checks run."

Plan decisions and conventions, quoted:
- Conventions (`plan.md:1681-1682`): "From R-021, `record.json` changes additively: a new field is optional for older
  records; only a breaking change raises the schema version, and then the migration upgrades every older version";
  "Tests removed together with a cut feature are named in the outcome"; "Role prompt text changes in the ticket whose
  mechanism it describes (A-085)".
- D-057 (3): "the content files (`task.md`, `log`, `result`, `note.md`, `note.first.md`, `start-notice`, `session/`) …
  stay". D-079: "a record keeps refusing a field it does not know, as `BAD_DATA` (T-27 (2))".
- Gate 2 §1 (`gate-2-decisions.md:49`): no `reminders.md` in either project.

Rules: T-07 (the task's criteria verbatim come with R-067), T-09, T-16 (evidence is not model prose), T-21 (3) (the
comment at `src/job/task-note.ts:10` names a person), T-25 (2), T-29 (1) and (6), T-30, T-32 (1) (the adapter declares
only the Pi API Limen uses). Harness rules: z. 29 (archive, never delete), z. 37 and z. 40 (measure by the difference).

Engine facts: E-11 (`plan.md:1600`): "`sendMessage` custom messages reach the model as `user`"; so all three injections
reach the model on the seat (inventory section 1: ≈397 tokens once, ≈107 per steer, ≈405 in the extra turn).

Facts at `aa721d7` (inventory sections 1–5; line numbers in files R-039 changes will move):
1. The module `src/job/task-note.ts` (241 lines): `noteStart` appended to a job's first cue (`hook/communication.ts:74-83`),
   `recordNote` at every job `tool_result` (`:115-117`), `noteSteer` appended to every steer (`hook/steering.ts:129`),
   `noteCheck` as the first `finish` call's answer, which writes no `result` (`hook/finish.ts:35-43`, `:61-64`), or as a
   `limen-note-check` custom message with `continue: true` in `agent_before_settle` (`:80-96`).
2. `finalizeJob` parses "Note check" from `result` and proves "proven" lines from the session's bash calls
   (`src/job/finalize.ts:116-140`, `src/job/session-commands.ts:5-147`), storing `openChecks` in `record.json`, a field
   every version-1 record requires (`src/job/record.ts:1423`).
3. Readers of `openChecks`: the wake (`src/job/wake-text.ts:75-101`), the Herdr toast (`hook/wake.ts:21`, `:83-93`,
   `:406`, `:532`), `limen show` (`src/job/view.ts:29-30`, `:79`, `:106-112`, `:145`; `src/job/listing.ts:176-179`,
   `:244`, `:276`, `:296`), `limen status` (`src/job/listing.ts:146`, `:157`; `src/job/job.ts:53-54`, `:214`), the
   summary's "decide" grouping (`src/project/summary.ts:61`, `:311`, `:361-362`, `:456-457`) and the manual
   (`templates/agents.md:139`). Land and `limen stats` do not read it; stats uses `simpleCommands`
   (`src/job/statistics.ts:30`).
4. A continuation copies `note.md` and `note.first.md` (`src/job/continuation.ts:548-554`, `src/job/publication.ts:80-81`).
5. The 80 % steer, one text for every role: "`${minutes} min left before the timeout: commit your work or write your
   verdict now; mark checks you did not run as unverified.`" (`src/runtime/wrapper.ts:331`); the wrapper has
   `record.role` (`:129`).
6. The adapter declares `agent_before_settle` and its types only for `hook/finish.ts` (`src/runtime/pi-api.ts:49-56`,
   `:66`, `:80-83`, `:146-152`, `:297`, `:354`, `:362-369`).
7. Text: `README.md:73-106` (the experiment section), `docs/setup.md:183`, `docs/jobs.md:47`, `templates/agents.md:139`,
   and the comments of inventory section 5; the M-01 tools read `src/job/task-note.ts` of the measured ref
   (`adrian-rebuild/tools/role-context.mjs:95`, `:124-130`; `context-size.mjs:144-164`).

## Change

1. Cut, each path removed with `git rm`: `src/job/task-note.ts`, `test/u14-task-note.test.ts` (both named in
   `outcome.md`). With them: the first-cue append and `recordNote` in `hook/communication.ts`, the steer appendix in
   `hook/steering.ts`, the note carry of `src/job/continuation.ts` and `src/job/publication.ts`, and the reading of
   `.agents/limen/reminders.md`.
2. `hook/finish.ts`: the first `finish` call writes `result` and shuts the session down; no note check, no
   `agent_before_settle` handler, no `note check sent` line. `src/runtime/pi-api.ts` drops `agent_before_settle`,
   `PiSettleEvent`, `PiSettleResult`, `PiMessageDraft` and their guards, and `test/runtime/pi-contract.test.ts` drops the
   matching fixture types (T-32 (1)).
3. `src/job/finalize.ts`: no parse of `result` and no `done:` exception for open checks; a new record's `openChecks` is
   `null`. The field stays in version 1 (conventions: additive change), an old record keeps its value as history, and
   `src/job/record.ts:219`'s comment says so. `src/job/migration.ts`'s mapping of the older `open-checks` file stays.
4. Readers (fact 3): the wake, the toast, `limen status`, the summary and the manual treat such a job as a plain `done`;
   `limen show` keeps one plain `open-checks` line for a record that holds a value (z. 29, T-16), with no "done with
   open checks" header, glyph or reason.
5. `src/job/session-commands.ts`: trimmed in place to the splitter that `limen stats` uses (`simpleCommands` and its
   helpers), its head comment rewritten; `test/job/session-commands.test.ts`, new, keeps the splitter's cases that
   leave with u14 (`;`, `&&`, `if`, `!`, `|`, quotes).
6. The 80 % steer (`src/runtime/wrapper.ts`), per role by D-121: "<N> min left before the timeout: " then reviewer and
   judge "write your verdict now."; researcher "give your report in your final message now."; worker, keeper, quality
   and group member "commit your work now."; one table from role to text in the wrapper, read from `record.role`.
7. Leftovers: `src/project/leftovers.ts` gets `.agents/limen/reminders.md` with the feature "the task note (R-042)", so
   `limen status` lists it and `limen init --drop-leftovers` removes it.
8. M-01 tools: `adrian-rebuild/tools/role-context.mjs` and `adrian-rebuild/tools/context-size.mjs` read the note's
   events only for a ref that has `src/job/task-note.ts`, so `rebuild-base` and `a0.3.0` still measure;
   `adrian-rebuild/tools/test-context-size.mjs` (R-039's) covers a ref without it.
9. Text (fact 7; A-085): `README.md` loses the experiment section; `docs/setup.md` and `docs/jobs.md` lose the note and
   the open-check paragraph; the manual's sentence (`templates/agents.md:139` at `aa721d7`, in the manual's file as R-040
   leaves it) goes, and the coordinator's reference file of R-039 under `test/runtime/context-message/` follows; the
   comments of inventory section 5 follow.
10. Tests, each failing at HEAD with R-039 done (T-29):
    - `test/hook/finish.test.ts`, new: the first `finish` writes `result` and ends the session with `done`; the hook
      registers no settle handler; `log` gets no check line.
    - `test/hook/communication.test.ts`: a job's first `before_agent_start` message is the cue alone; a `tool_result`
      after a `note.md` write leaves no `note.first.md` and no `note changed` line.
    - `test/s4-steering.test.ts`: each delivered steer is its inbox text alone; the child's first prompt names no note.
    - `test/cli/continue.test.ts`: a parent folder holding `note.md` and `note.first.md` gives a child with neither.
    - `test/job/finalize.test.ts`: a `done` whose `result` holds a `## Note check` with "not proven" lines records
      `openChecks` `null`; a version-1 record with a value still reads.
    - `test/runtime/wrapper.test.ts`: the 80 % steer of a reviewer, a judge, a researcher and a worker has D-121's text
      and names no note.
    - `test/s3-finish-wake.test.ts`: the done job's wake is a plain done.
    - `test/job/wake-text.test.ts`, `test/hook/wake.test.ts`, `test/cli/show.test.ts`, `test/cli/status.test.ts`: an old
      record with `openChecks` shows as done; `limen show` keeps its plain `open-checks` line.
    - `test/project/leftovers.test.ts`: `.agents/limen/reminders.md` is listed as a leftover of the task note.
    - `test/runtime/pi-api.test.ts`: the two `piSettleEvent` tests go.

Files the criteria name that this ticket or R-039 creates: `test/hook/finish.test.ts`,
`test/job/session-commands.test.ts`, `test/runtime/context-message.test.ts`, `adrian-rebuild/tools/test-context-size.mjs`.

## Out of scope

- The task with the record's criteria verbatim (A-044's second sentence, T-07): R-067. Limen-run `Check`s with their own
  timeout and the steer's "Limen runs the checks" (A-031 (3)): R-063. A-032's `--done`: R-071. Default timeouts per role:
  R-062. The steer's `limen-deadline` envelope: R-053. Between stage 4 and stage 6 a job ends with no self-check (the
  cost row `plan.md:1732` accepts it).
- Existing `note.md`, `note.first.md`, `log` lines and `result` files: they stay as content files (D-057 (3), z. 29).
- Removing `openChecks` from the schema (a version 2, a migration and a seat step) is not done: the conventions change
  the record additively, and the field costs nothing as history.

## Acceptance

- AC-1: `node --test test/hook/finish.test.ts` → exit 0; `node --test test/job/session-commands.test.ts` → exit 0.
- AC-2: `node --test test/hook/communication.test.ts` → exit 0; `node --test test/s4-steering.test.ts` → exit 0.
- AC-3: `node --test test/cli/continue.test.ts` → exit 0; `node --test test/job/finalize.test.ts` → exit 0.
- AC-4: `node --test test/runtime/wrapper.test.ts` → exit 0; `node --test test/s3-finish-wake.test.ts` → exit 0.
- AC-5: `node --test test/runtime/pi-api.test.ts` → exit 0; `node --test test/runtime/pi-contract.test.ts` → exit 0.
- AC-6: `node --test test/job/statistics.test.ts` → exit 0; `node --test test/cli/stats.test.ts` → exit 0.
- AC-7: `node --test test/job/wake-text.test.ts` → exit 0; `node --test test/hook/wake.test.ts` → exit 0; `node --test
  test/cli/show.test.ts` → exit 0; `node --test test/cli/status.test.ts` → exit 0.
- AC-8: `node --test test/project/leftovers.test.ts` → exit 0; `node --test test/runtime/context-message.test.ts` → exit
  0; `node --test adrian-rebuild/tools/test-context-size.mjs` → exit 0.
- AC-9: `git ls-files -- src/job/task-note.ts test/u14-task-note.test.ts | grep -q .` → exit 1.
- AC-10: `git grep -q 'task-note' -- src hook` → exit 1; `git grep -q 'note\.md' -- src hook` → exit 1; `git grep -q
  'note\.first' -- src hook` → exit 1.
- AC-11: `git grep -q 'note check' -- hook src/job/finalize.ts` → exit 1; `git grep -q 'limen-note-check' -- hook` →
  exit 1.
- AC-12: `git grep -q 'agent_before_settle' -- src hook` → exit 1; `git grep -q 'PiSettleEvent' -- src hook` → exit 1.
- AC-13: `git grep -q 'reminders\.md' -- src/job hook` → exit 1; `git grep -q 'reminders\.md' --
  src/project/leftovers.ts` → exit 0.
- AC-14: `git grep -q 'sessionRuns' -- src` → exit 1; `git grep -q 'mark checks you did not run' --
  src/runtime/wrapper.ts` → exit 1.
- AC-15: `git grep -q 'open checks' -- hook src/job/wake-text.ts templates` → exit 1; `git grep -q 'openChecks' -- hook
  src/job/wake-text.ts` → exit 1; `git grep -q 'DONE WITH OPEN CHECKS' -- src/job/job.ts` → exit 1.
- AC-16: `git grep -q 'Task-note' -- README.md` → exit 1; `git grep -q 'task note' -- README.md docs` → exit 1; `git
  grep -q 'Note check' -- docs/jobs.md` → exit 1.
- AC-17: `node adrian-rebuild/tools/fails-before.mjs test/hook/finish.test.ts test/hook/communication.test.ts
  test/s4-steering.test.ts test/cli/continue.test.ts test/job/finalize.test.ts test/runtime/wrapper.test.ts
  test/s3-finish-wake.test.ts` → exit 0, its output in `outcome.md` → `## Fails before`.
- AC-18: `node adrian-rebuild/tools/gate.mjs` → exit 0.
- AC-19: `npx biome check --error-on-warnings .` → exit 0; `node adrian-rebuild/tools/check.mjs` → exit 0.
- AC-20 (judgment): no Limen text asks a job to read, write or check a note; the first `finish` ends the job with its
  handoff; a done job is a plain done; existing note files and records stay readable; the 80 % steer says per role only
  what is true now; the docs and the manual say so.

## Migration

- `record.json` keeps version 1 and its `openChecks` field (item 3), so every record of `.limen/jobs/` and the archive
  still reads (`test/job/finalize.test.ts` on a version-1 record with a value); no script.
- Note files, `log` lines and `result` files stay as content files (D-057 (3)); a continuation of an old parent carries
  none (`test/cli/continue.test.ts` on a fixture folder with both files).
- `.agents/limen/reminders.md` becomes a leftover of R-001's mechanism (item 7; `test/project/leftovers.test.ts`); gate 2
  §1 finds none, so no seat step. The project stub loads the same hooks (`hook/finish.ts` stays).

## Risk

- A job loses its self-check before the finish until R-063 runs the checks; the reviewer still judges every criterion.
- A child of an old parent sees the old note ask once in its copied transcript (`src/job/publication.ts:116-123`);
  nothing acts on it.
- R-043 edits the same `tool_result` handler, and R-108 the wrapper around the steer; the implementer re-reads them at
  HEAD (D-025).

## Rollback

`git revert $(git log --format=%H --grep='^R-042:' adrian-rebuild --)`. Records written meanwhile hold `openChecks`
`null`, which the reverted code reads; no reverse migration.

## Decisions

Settled by the documents when the ticket was written (2026-11-26, the main session's reading, not a night default; the
inventory's questions in `evidence/inventories/R-042.md` → section 8):
1. `openChecks` stays in version 1, written `null` (Q1 (a)): the conventions change `record.json` additively, and with
   the same effect the solution with fewer moving parts wins (no migration, no seat step). Reported to Adrian on
   2026-11-26 with Q-80–Q-84, for gate 5.4.
2. The special readers go, `limen show` keeps a plain line for an old value (Q2 (a)): A-044 cuts `open-checks` as a
   state; z. 29 and T-16 keep the record's history visible.
3. The 80 % steer (Q3): D-121 (Adrian, 2026-11-26).
4. `src/job/session-commands.ts` trimmed in place (Q4 (a)), with its own test file for the splitter (T-29 (1)).
5. The settle declarations go (Q5 (a)): T-32 (1).
6. `.agents/limen/reminders.md` is a leftover (Q6 (a)): the registry's rule "Each cut ticket appends its own entries"
   (`src/project/leftovers.ts:16`).
7. The M-01 tools keep the note columns for older refs (Q7 (a)), as R-039 item 8 keeps old columns.
