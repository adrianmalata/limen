<!-- PL: Ticket R-103 (A-021, T-04, T-18 (1), T-28 (3), T-38, D-094 (3), D-096 (2), (3)): `limen land` przechodzi przez
runner i zapisuje swoje kroki w rekordzie (`merged` to znacznik `landed` z nowym polem `land`, potem `closed` i
`cleaned`), a ponowne uruchomienie kontynuuje od pierwszego niezapisanego kroku i nigdy nie scala drugi raz; gałąź i
worktree znikają dopiero w `cleaned`, który zamyka też karty Herdr joba. `ticket done` kontynuuje swój krok znaczników,
`abandon` zamyka obie karty synchronicznie, `limen diff` i `limen open` stają się poleceniami zmiany, a `--help` polecenia
pokazuje jego rodzaj. Stan: napisany 24.11 przy `9601408` (po R-037) z D-096 (3), notatek w `## Tickets` i inwentarza
`evidence/inventories/R-103.md`; 18 pytań inwentarza rozstrzygniętych dokumentami w `## Decisions`. -->

# R-103 Land runs as recorded steps; its `cleaned` step closes the job's Herdr tabs

## Problem

Finding A-021 (high), its Decision quoted from `audit.md`: "Land is a sequence of steps recorded in the record
(`merged`, `closed`, `cleaned`); a repeated `limen land <id>` continues from the last completed step; each step is
idempotent; the branch is deleted only after a successful closing commit. The closing commit (ticket move, board,
`limen spec fix`, generated `outcome.md`) is built atomically (temporary git index, `main` updated only from the
expected value). Every error ends with exit ≠ 0, a message and the exact next command. The closing commit goes through
the project's pre-commit hooks." R-037 (done) built the atomic closing commit; this ticket is the rest.

At `9601408` (`evidence/inventories/R-103.md`, sections 1–2): `limen land` is not an operation of the runner
(`src/commands/land.ts:7-16`, on `OUTSIDE_RUNNER`, `test/structure.test.ts:186`) and records no step. It merges, writes
`landed` (`src/job/landing.ts:110-115`), deletes the branch and worktree (`:117-121`, with no check of the tip against
the target, `src/runtime/pruning.ts:133-137`), and only then closes the tickets (`:125`, `:149-177`). A close that fails
or is killed leaves the branch gone, and a rerun refuses "job <id> has no commits to land" (UNTYPED, `:325-328`); a kill
after R-037's branch move and before `git read-tree -m -u` leaves the checkout behind with nothing printed, and a rerun
refuses "staged changes" (`:320-324`); a failed release of the ticket-lanes lock after the commit is reported as
"nothing of their close was written" (`:195`) with `next` `limen ticket done <codes>`, which then refuses. Land has 11
untyped throws (`grep -c 'throw new Error('`). Land, `ticket done` and the job's end close no `herdr/diff/` tab;
abandon closes only `herdr/`, detached (`src/job/abandoning.ts:85`, `src/integrations/herdr.ts:39-58`). `limen diff` and
`limen open` are `read` entries that record a tab's place under the job folder (`herdr.ts:102-133`, `:389-397`).
`ticket done` writes its `landed` markers after its commit, outside its operation (`src/project/ticket-folders.ts:119-122`),
so a failed marker write leaves the jobs unmarked while a rerun refuses `NO_ACTIVE_TICKET`.

Plan decisions the change relies on (quoted):
- D-094 (3): "the new R-103 takes land as recorded steps (`merged`, `closed`, `cleaned`, a rerun that continues), the
  `cleaned` step's Herdr close, the `close` cut, `ticket done`'s markers as a step (the D-092 note) and step 3.9";
  D-096 (1) then moved the `close` cut to R-101.
- D-096 (2): "`limen diff` and `limen open` become `change` commands, since each opens a Herdr tab and records its place
  so that Limen can close it; T-04's list drops `diff` (`taste.md`, dated); R-103 changes their kind."
- D-096 (3), settled for R-103: "(a) the steps are in `record.json` (A-021, gate 2 S1+): `merged` is R-031's `landed`
  marker, written in the same write as a new optional field `land` (D-079) that then records `closed` (the closing
  commit, or `null` when nothing closed) and `cleaned`, each once under the job's lock through the marker writer; (b)
  the order is merged, closed, cleaned, and the branch and worktree go in `cleaned` (A-021); (c) land runs through the
  runner with typed refusals (D-070 (2)), the terminal question between `validated` and `apply`, apply under a land
  lock of the job; (d) a failed step keeps its class with `next` `limen land <id>`, which replaces R-037's `limen ticket
  done <codes>`; (e) a rerun continues from the first step not recorded, never merges again after `merged`, deletes the
  branch only while its tip is in the target's history (z. 29), and after all steps exits 0 with the steps' line, as
  abandon's marked line; (f) after a kill that followed R-037's branch move, the rerun finds `Close <codes>: landed by
  <id>` in the target's history, finishes the checkout and records `closed`; (g) an older record (`landed`, no `land`)
  is continued from Git, as abandon's steps are (R-030 Decision 6), with no migration script (R-031 Decision 1); (h)
  retire keeps a record whose `land` lacks `cleaned`; (i) `cleaned` closes the job's `herdr/` and `herdr/diff/` tabs,
  the coordinator's own skipped, synchronously with `closeJobTab`'s bound and one retry, the result in the output and
  the job's log; a tab that does not close is a line and the step is recorded (T-18 (1): the sweep closes leftovers;
  T-01); the same close in `ticket done` (the finished jobs of its tickets) and in `abandon` (after its marker, still
  found from Git); (j) a rerun of `ticket done` on a ticket its own closing commit closed continues the marker step and,
  with nothing left, exits 0 (T-02, the D-092 note), while a number with no ticket stays `NO_ACTIVE_TICKET`; (k) land's
  `irreversible` mark (D-075); (l) the watch tab's close at a job's end (`settleJobTab`, A-029) stays."
- D-070 (2): "a converted refusal carries its own code, so the `UNTYPED` ratchet of `test/structure.test.ts` falls";
  "argument errors of a converted command are usage, exit 2 (T-02); a state changed since `validate` ends with exit 3
  before the first write (T-38 (2))"; the shape check over change commands is a ratchet "that may only shrink".
- D-075: refusals are declared in the registry (`refuses`); "every declared code has a test named `CODE: …`"; "a
  refusal test of a `change` command compares the shared snapshot"; "the `irreversible` marks of `ticket done` and
  land's closing commit come with R-065 and R-037" (R-037 left land's mark to this ticket, its Decision 9).
- D-079: "a record keeps refusing a field it does not know, as `BAD_DATA`"; a deployment runs with no job running, so
  an additive field needs no version rise (`## Stages` → conventions).
- D-041 (6): "The kind is not shown by `limen <command> --help` until read commands write nothing (T-04, R-032)"; the
  `## Tickets` note for R-103: "Once read commands write nothing, `limen <command> --help` shows the kind of T-19".
- D-097 (4) (c): "R-103's `cleaned` step removes a landed job's worktree, so between daily runs only worktrees of jobs
  without unlanded work wait".
- R-037 `ticket.md` → Decisions 17–18: `CHECKOUT_BEHIND` (class `environment`, `next` `null`) names the commands that
  finish the checkout; "The rerun that continues after the move is R-103's recorded `closed` step".
- Notes in `## Tickets` for R-103: the two R-037 pointers in `test/cli/land.test.ts` "name no ticket beside older
  pointers of other tickets with the same names (T-30)"; R-037 review round 1, note 6 (the lock release after a close:
  "the recorded `closed` step reads the closing commit from Git, so a land that fails after its commit reports the
  commit and continues from it"); land's `irreversible` mark "with T-28 (3)'s test that a rerun of land continues and a
  test that nothing is lost"; `ticket done`'s markers "as a recorded step of the close … continued when the command runs
  again (T-38 (3))".
- Rules: T-38 (1)–(4) (validate then apply; a changed state exits 3 before the first write; several effects are steps in
  the record, continued on a rerun; refusal tests compare the snapshot), T-28 (1), (3), (5), T-02 (exit classes), T-01
  (no silent failure), T-04, T-18 (1), T-19 (2) (`limen <cmd> --help`: "usage from the schema, the kind, one example"),
  T-25 (one rule, one definition), T-29 (3), (6), T-30, T-37 (`next` is a Limen command or `null`), D-046 (1), z. 2,
  z. 14, z. 29.

## Change

Build on HEAD as it is when the work starts. R-101 (`ready`, before this ticket in the night's queue) changes
`closeJobTab` (`src/integrations/herdr.ts`) and retire's `markedAt` (`src/runtime/retiring.ts`); when R-101 is `done`,
this ticket uses R-101's closing function and adapts to its retire; when it is not, this ticket builds the closing
function as R-101's `ticket.md` → (d) describes it (synchronous, its bound and one retry, the label check, a returned
result), and R-101 adapts later.

(a) Record (`src/job/record.ts`). A new optional field `land`: `{ closed?: { sha: string | null; at: string };
cleaned?: { at: string } }`, in `JobRecord`, `RECORD_FIELDS`, the `Fields` omit list and the validator (an unknown key
inside `land` is `BAD_DATA`, as for the record). The marker writer writes it: `landed` together with `land: {}` in one
write (the `merged` step), then `closed`, then `cleaned`, each in its own write under the job's lock; a step written
again with the same value returns the record unchanged, `closed` with another `sha` is `MARKER_DIFFERS`, `cleaned`
before `closed` or `closed` before `landed` is refused as an internal error. A record with `landed` and no `land` (older)
takes `land` with its first recorded step. `docs/jobs.md` (the record's fields) follows.

(b) Land through the runner (`src/job/landing.ts`, `src/commands/land.ts`): `land` leaves `OUTSIDE_RUNNER`. `validate`
reads the record and its recorded steps and plans the steps not recorded. While `merged` is not recorded it holds
today's checks (group member, done job, branch and base, target, staged changes, commits to land, overlap, the gates,
`TICKETS_UNCOMMITTED` unless `--keep-open`); each of land's 11 `throw new Error(` becomes a typed error with its own code
(refusals and usage only in `validate`, T-38 (1)), declared in `refuses` with a `CODE:` test that compares the shared
snapshot. The terminal question (unless `--yes` or no terminal) comes between `validated` and `apply` and is asked only
when the plan merges. `apply` runs under the land lock, the lock module's lock of the file `<jobDir>/.land` (so
`<jobDir>/.land.lock`; the job's own `<jobDir>/.lock` stays the marker writer's), taken before every other lock land
takes; it reads the record again and ends `STATE_CHANGED` (exit 3) before its first write when the recorded steps
differ from validate's. Steps, in order (A-021):
1. `merged`: the merge, then `landed` and `land: {}` in one write.
2. `closed`: unless `--keep-open` or no active ticket, R-037's close (`closeOperation`); its closing commit is recorded,
   or `null` when nothing closed. Before running the close, the step looks in the target's history for the job's
   closing commit (subject `Close <codes>: landed by <id>`, through the rule the migration reads, `closingCommits` and
   `landedJobOf`, T-25); found, it records that commit, after finishing the checkout when the branch tip is that commit
   and the checkout is behind on its paths (`git read-tree -m -u <parent> <commit>`, as `followCommit`).
3. `cleaned`: the branch and worktree through `deleteLandedBranches`, keeping a branch that `unlandedBranches` (retire's
   rule, `src/project/git.ts:105`) names as holding commits outside the target; then the job's recorded tabs
   (`herdr/`, `herdr/diff/`) closed as in (d); then `cleaned` recorded. A kept branch or worktree and a tab that does
   not close are each one output line (today's `kept …` lines; the closer's result), and the step is recorded (T-01;
   the sweep's daily steps take what is left, R-101).
A failed step keeps its class and code, and its `next` is the land's own command line (`values.commandLine()`, as
`TICKETS_UNCOMMITTED` gives today), so it names `limen land <id>` with the flags typed. `CHECKOUT_BEHIND` in land gets
that `next` too, its message keeping the commands that finish the checkout (R-037 Decision 17); in `ticket done` it
keeps `next` `null`. A land that fails after the closing commit exists (the lock release of R-037's note 6, or any
later failure) says the commit is on the branch and that `limen land <id>` records it; no message of land says that
nothing of the close was written. After all steps are recorded, a rerun exits 0 with one line naming them, in the form
of abandon's `markedLine` (`src/job/abandoning.ts:312-318`): the merge commit, the closing commit or that nothing
closed, and `cleaned`. Registry: `land` gets `irreversible: true` (D-075), `IRREVERSIBLE` (`test/registry.test.ts`)
lists it with an `again` and a `kept` test title in `test/cli/land.test.ts`.

(c) Older records (D-096 (3) (g)): for a record with `landed` and no `land`, `merged` counts as recorded; `closed` is
the job's closing commit found in Git (step 2's rule), or `landed.sha` itself when its subject is a closing subject
(`ticket done` and the migration mark with the closing commit), otherwise the close runs for the job's active tickets;
`cleaned` runs as step 3. No migration script.

(d) Tab close in `cleaned`, `ticket done` and `abandon` (D-096 (3) (i), T-18 (1)): synchronous, through the one
closing function (R-101's, or built as its (d)), for both recorded places, the coordinator's own tab skipped (the label
check; from a Herdr pane also `HERDR_TAB_ID`). Each tab's result is an output line and a line in the job's log (the
closer's words: `herdr tab close <tab>: closed|closed on retry|already closed|failed after one retry`); Herdr not
available is one line `herdr skipped: herdr is not available` and the step counts as done; no recorded place is
nothing to close and no line. `ticket done` closes, after its marker step, the tabs of every finished job whose
features include a code it closed and are all closed (`closedJobFeatures`, the rule of R-101's sweep, T-25). `abandon`
replaces its detached `settleJobTab` call (`abandoning.ts:85`) with this close, on every run as today. `settleJobTab`
at a job's end stays (D-096 (3) (l)).

(e) `ticket done` (`src/project/ticket-folders.ts`, `src/job/landing.ts` `markTicketJobs`): its marker writes are a step
continued by a rerun. A rerun on a code whose ticket is in `done/` and was closed by `ticket done`'s own closing commit
(subject `Close <codes>: landed` or `landed <on>` naming the code, in the target's history; `CLOSE_SUBJECT`) takes that
commit's sha, marks the jobs `ticketDoneJobs` still finds, closes the tabs as in (d), and exits 0, with a line when
nothing was left; a code with no active ticket and no such commit stays `NO_ACTIVE_TICKET`.

(f) `limen diff` and `limen open` (`src/commands/diff.ts`, `src/commands/open.ts`, `src/integrations/herdr.ts`,
`src/integrations/hunk.ts`, `src/registry.ts`): kind `change`, through the runner (validate resolves the job and reads
what it needs; apply opens or focuses the tab and records its place); their untyped throws on these paths become typed
errors with codes declared in `refuses`. They leave `READS_NOT_RUN` and `READ_ARGUMENTS`; each gets a success test on
the Herdr fake (`test/s2-herdr.test.ts`'s) and leaves `WITHOUT_SUCCESS_TEST`, unless its success needs a program the
fakes lack, which the test list names with its reason. `limen diff` without Herdr still prints the diff and writes
nothing. `taste.md` T-04 is already dated for this (D-096 (2)).

(g) Help (`src/help.ts`): `limen <command> --help` prints one line `kind: read` or `kind: change` right after the
summary (before an `internal: run by …` line); every help golden follows (`test/help.test.ts`'s `LAND` among them), and
the generated sections of `docs/commands.md` where they hold it.

(h) Retire (`src/runtime/retiring.ts`): a record whose `land` lacks `cleaned` is not taken; a record with `landed` and no
`land` stays retirable as today (R-031's rule; only R-103's land writes `land`).

(i) Tests and pointers: `test/s5-land.test.ts` moves by git mv to `test/cli/land-refusals.test.ts` (T-29 (6)), its tests renamed
`CODE: …` after their new codes; `test/outcome.test.ts` takes another UNTYPED example in place of land's group-member
refusal; `UNTYPED_THROWS` (`test/structure.test.ts`) falls by the throws removed. Every `// Review round …` pointer in
`test/cli/land.test.ts` names its ticket (`// R-037, review round 1, F1: …`; the older ones of R-030 and R-031 too, by
`git blame`; T-30). New tests (each one mechanism, T-29 (3)): each step's rerun after a failure of the next one (a
hook, a held lock with a small `LIMEN_LOCK_WAIT_MS`); a kill after the branch move built by hand (`git update-ref`
with no read-tree); the lock release failure after the commit; a rerun after all steps (identical snapshot, the
steps' line); nothing lost (the merge, the tickets, the branch's commits); an older record of each kind (land's,
`ticket done`'s, the migration's); a kept branch; the tabs in `cleaned`, `ticket done` and `abandon` (both places, the
coordinator's skipped, a tab that does not close, Herdr absent); `ticket done`'s rerun after a failed marker write;
retire keeping a record without `cleaned`; `diff` and `open` as `change`; the help's kind line.

(j) Text: `docs/commands.md` (land's order, steps and rerun; abandon's tabs; the close's `next`; `ticket done`'s rerun),
`docs/jobs.md` (the `land` field; Land; abandon's tabs), `docs/herdr-status.md` (which commands close tabs),
`templates/agents.md` (land, `ticket done`, `limen open`, `limen diff` as the text at HEAD says them; a new first hash
in `templates/.history/agents.md`), and the code comments the inventory lists (section 8) where they become false.

## Out of scope

- `limen close`, `limen prune`, the daily sweep's leftover tabs and retire's 24 h rule (R-101, D-096 (1), D-097 (4)).
- `limen show` printing `land` or any marker (it prints none today); `limen stats` (R-098 reads `landed`, unchanged).
- `ticket done`'s `irreversible` mark (R-065), `ticket drop`, a generated `outcome.md`, `limen spec fix` (R-065,
  R-066); the exit 0 of "no active ticket" in land (R-037 Out of scope).
- The owner-file refusal in land's validate (R-054); further land conditions (R-071).
- `commit.gpgSign` for the closing commit (R-037 Open point 5, for Adrian at gate 5.3).

## Acceptance

- AC-1: `node --test test/cli/land.test.ts` → exit 0; `node --test test/cli/land-refusals.test.ts` → exit 0.
- AC-2: `node --test test/cli/ticket.test.ts` → exit 0; `node --test test/cli/abandon.test.ts` → exit 0.
- AC-3: `node --test test/job/record.test.ts` → exit 0; `node --test test/project/lanes.test.ts` → exit 0.
- AC-4: `node --test test/registry.test.ts` → exit 0; `node --test test/structure.test.ts` → exit 0.
- AC-5: `node --test test/help.test.ts` → exit 0; `node --test test/s2-herdr.test.ts` → exit 0.
- AC-6: `node --test test/cli/prune.test.ts` → exit 0; `node --test test/cli/migrate.test.ts` → exit 0.
- AC-7: `git grep -q 'throw new Error(' -- src/job/landing.ts` → exit 1.
- AC-8: `git grep -q 'nothing of their close was written' -- src/job/landing.ts` → exit 1.
- AC-9: `git grep -q '// Review round' -- test/cli/land.test.ts` → exit 1.
- AC-10: `node adrian-rebuild/tools/fails-before.mjs` → exit 0, its output in `outcome.md` → `## Fails before`.
- AC-11: `node adrian-rebuild/tools/gate.mjs` → exit 0.
- AC-12: `npx biome check --error-on-warnings .` → exit 0; `node adrian-rebuild/tools/check.mjs` → exit 0.
- AC-13 (judgment): land runs through the runner; its steps are recorded in the order merged, closed, cleaned, each once;
  a rerun continues from the first step not recorded and never merges after `merged`; the branch and worktree go only
  in `cleaned`, and a branch with commits outside the target stays; every failed step's `next` is the land's own
  command line; every refusal arises in `validate` and leaves the snapshot identical.
- AC-14 (judgment): `cleaned`, `ticket done` and `abandon` close both recorded tabs synchronously through one closing
  function, skip the coordinator's own tab, and name every tab that does not close; `diff` and `open` are `change`
  entries through the runner; `limen <command> --help` shows the kind; retire keeps a record whose `land` lacks
  `cleaned`.

## Migration

None by script (D-096 (3) (g), R-031 Decision 1): `land` is an additive optional field, so no version rise (D-079); a
record with `landed` and no `land` is continued from Git (Change (c)), tested on a fixture record of each older kind
(land's, `ticket done`'s, the migration's). No command is cut or renamed; `diff` and `open` keep their names and change
kind.

## Risk

1. A new record field meets an older reader only after a rollback; the deployment runs with no job running (D-079).
2. `cleaned` closes tabs synchronously: up to the closer's bound and one retry per tab, so a land with a hung Herdr
   takes that long before it exits; the step is still recorded.
3. A rerun after a kill finds the closing commit by its subject; a subject edited by hand is not found, and the close
   would run again and refuse `TICKETS_UNCOMMITTED` or close nothing (the tickets already in `done/`), not commit twice.
4. Seat step 3.9 checks the tab close in Herdr (T-28 (5)); here it runs only on the fake.

## Rollback

`git revert $(git log --format=%H --grep='^R-103:' adrian-rebuild)`. Records written with `land` are `BAD_DATA` for the
reverted code (D-079); the rollback runs with no job running, and such records are older jobs' only.

## Decisions

The main session's reading of the 18 questions of `evidence/inventories/R-103.md` → section 11, settled by the
documents (2026-11-24, `limen-rebuild-31`; none asked, the sources searched: `gate-2-decisions.md`, `taste.md` Part B,
`zasady-budowy-harnessu.md`, `plan.md` → `## Decisions`); the items marked (A) are named for Adrian's attention at gate
5.3 and stand as written:
1. The `land` field's shape and writes (question 1): Change (a); `closed` and `cleaned` hold only what a rerun needs
   (the commit and the time), and the outcomes go to the output and the log (D-096 (3) (i), YAGNI).
2. The land lock (question 2): `<jobDir>/.land.lock`, outermost of land's locks; it moves with a retire's rename, which
   takes no record whose `land` lacks `cleaned` (Change (h)). (A)
3. What validate holds (question 3): Change (b); the merge's checks hold only while `merged` is not recorded (they guard
   the merge, T-38 (1)); the close keeps its own validate under the ticket-lanes lock (R-037).
4. `next` (question 4): the land's own command line, the one rule of `TICKETS_UNCOMMITTED` (T-25); the flags of a rerun
   apply to the steps not yet recorded.
5. The branch's delete (question 5): retire's `unlandedBranches` (T-25; it reads ancestry and patch identity, so a
   branch whose commits are in the target by either stays deleted, and nothing Git does not hold elsewhere is lost,
   D-097 (4) (d)); the order branch and worktree, then tabs; a kept one is a line and the step is recorded (A).
6. After a kill past the branch move (question 6): Change (b) step 2; `CHECKOUT_BEHIND` in land gets `next` `limen land
   <id>`, since the rerun now continues (D-096 (3) (d)), while its message keeps the commands of R-037 Decision 17. (A)
7. The lock release after the commit (question 7): Change (b), the failure's class kept, `next` the rerun.
8. Older records (question 8): Change (c).
9. Retire (question 9): Change (h). (A)
10. The closing function (question 10): R-101's (d), one function for the sweep, land, `ticket done` and `abandon`
    (T-25); Herdr absent is one line, no place no line (T-01: absence is no failure).
11. `ticket done`'s tabs (question 11): the rule of `closedJobFeatures` (T-25), so a job with a feature still open keeps
    its tab.
12. `ticket done`'s rerun (question 12): Change (e); each job's `landed` is the step, no new state (z. 1, T-01).
13. Abandon (question 13): Change (d); abandon records nothing (R-030 Decision 6).
14. `diff` and `open` (question 14): through the runner, since `OUTSIDE_RUNNER` may only shrink (D-070 (2)); success
    tests on the Herdr fake (T-28 (1), (5)).
15. The help's kind (question 15): in scope (the `## Tickets` note); the line `kind: <kind>` after the summary, next to
    the line of the same sort, `internal: run by …`. (A: a new wording)
16. Land's untyped refusals (question 16): Change (b) and (i); the implementer names the codes, each an uppercase name
    of what is wrong as the existing ones (`TICKETS_UNCOMMITTED`), listed in `outcome.md` for gate 5.3. (A: new wordings)
17. `irreversible` (question 17): Change (b).
18. The steps' line (question 18): abandon's `markedLine` form; `limen show` unchanged (Out of scope). (A: a new wording)
19. Size L (the row said M; the inventory, section 11, and R-037's inventory, "M to L"); the plan row follows.
