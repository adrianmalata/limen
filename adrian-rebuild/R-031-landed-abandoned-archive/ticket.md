<!-- PL: Ticket R-031 (A-002, §6): rekord dostaje znaczniki `landed` (land i `ticket done`) i `abandoned` (abandon,
tylko gdy zapis trzyma cały worktree), pisane raz przez jeden moduł także po stanie końcowym. `prune --retire` bierze
wyłącznie joby ze znacznikiem i bez niewylądowanej pracy, nigdy z grafu gita, i przenosi folder jednym `rename` do
`.limen/archive/<RRRR-MM>/<id>/`; archiwum czytają losowanie tokenu, `limen stats` i wyszukiwanie joba roszczenia
GitHuba, a `limen status` wymienia gałęzie `limen/abandon/<id>`. Migracja oznacza stare wylądowane joby z commitów
zamknięcia land i raportuje resztę. Stan: napisany 22.11 przy `9a370ae` z inwentarza
`evidence/inventories/R-031.md`, gotowy na noc. -->

# R-031 `landed` and `abandoned` markers; retire moves records to the archive

## Problem

Finding A-002 (critical), its Decision, quoted from `audit.md`: "Markers `landed` (written by `land` and `ticket done`:
sha, date) and `abandoned` (written by `limen abandon`) in the record. `--retire` takes only jobs with a marker, never
from the git graph, and moves the record to `.limen/archive/YYYY-MM/<id>/` with one `rename`; only an explicit human
command deletes the archive. `limen/abandon/<id>` branches live until a human deletes them; `limen status` lists
them. The daily sweep runs `--retire` (§6)." Gate 2 §6 (T24): "the daily `limen-sweep` run includes `prune --retire`
(only records with `landed`/`abandoned`, moved to the archive)". A-001's Decision: prune never touches a finished
job's worktree with unlanded work until it is resolved.

D-057 (4), quoted: "`landed` and the archiving of old records are R-031's, in its own migration (A-002: never from
the git graph)". D-079: a record refuses a field it does not know; `record.json` changes additively, a new field is
optional for older records (`## Stages` → conventions). Gate 2 §2 (Measurement), quoted: "`limen stats` (S1+) over all
records including the archive". T-20 (1), quoted: "at job creation it is checked against the project's records and
archive under the shared lock (A-018) and drawn again on a collision". T-28 (3): retire, `abandon`, migrations and
`ticket done` also get a test of running them again and a test that nothing is lost. `## Deployment` 3.6: "the
marker migration of R-031 reports which landed jobs it marked and which it left without a marker".

The two notes of `## Tickets` for this ticket, quoted: (D-080; R-099 Open point 2) "a job whose record leaves
`.limen/jobs/` before the poller saw it past `starting` leaves a GitHub handoff gate that no rule tells from a crash's,
so a rerun of the claim's command would start a new job; the archive is where a gate can find the claim's job after a
retire"; (D-088; R-030 review round 4, note 2) "R-030's test of a nested repository reads only the gitlink's commit
and the nested repository's status, never its other branches, stash or reflog, so commits there go with the worktree
after abandon; the `abandoned` marker that replaces the branch test should be set only when the save holds the whole
worktree".

Facts at `9a370ae` (the read-only inventory `adrian-rebuild/evidence/inventories/R-031.md`; the main session checked
the ones it quotes):
1. Nothing records that a job landed or was abandoned: `RECORD_FIELDS` (`src/job/record.ts:180-216`) has no such field,
   and `transition` writes nothing once a record is terminal (`:467`; `test/job/record.test.ts:97`; `docs/jobs.md:52`).
2. `prune --retire` (`src/commands/prune.ts:80-125`) decides from the git graph (`unlandedBranches`,
   `src/project/git.ts:89-150`, where a branch still at its base or gone counts as landed), keeps a job with unlanded
   work (R-030), and for the rest `rm`s the whole job folder with `recursive` and `force` (`prune.ts:121`), record,
   `log`, `result` and `session/` included, holding no lock for the reads or the `rm`. A finished job whose branch is
   at its base, gone or empty, with a clean or gone worktree, is still deleted: A-002's loss.
3. Land (`src/job/landing.ts:43-101`) merges, prints `landed <id> onto <target>`, deletes the branch and its
   finished worktree unless kept, and closes the job's tickets (`jobFeatures`, `:100`) with the commit `Close <codes>:
   landed by <id>` (`src/project/lanes.ts:166`, codes joined by `, `); it writes nothing in `.limen/jobs/<id>/`.
   `ticket done` (`src/project/ticket-folders.ts:100-143`) closes tickets by code under `.limen/ticket-lanes` and
   touches no job record.
4. Abandon (`src/job/abandoning.ts:69-94`) commits the state to `limen/abandon/<id>` and removes the worktree unless a
   cause keeps it (`:188-202`); its nested-repository check (`nestedWork`, `:211-222`) reads the gitlink's commit and
   the nested status only. A job is resolved when `limen/abandon/<id>` exists (`src/job/unlanded.ts:230-236`).
5. No job archive exists; "archive" names only `spec/features/archive.tsv` and archived tickets. The token draw reads
   `.limen/jobs/` and `.limen/unmigrated/` (`src/job/reference.ts:94-95`), `limen stats` reads `.limen/jobs/`
   (`src/job/statistics.ts:52-80`), and the GitHub claim's job is found only in `.limen/jobs/` (`markedJob`,
   `src/integrations/github-review.ts:99-107`; `claimHasJob`, `src/integrations/github-claims.ts:503-505`).
   `limen status` does not list `limen/abandon/<id>` branches.
6. `limen migrate [--dry-run]` (`src/registry.ts:590-602`, `irreversible`) runs steps with a report, refuses while jobs
   run, and has tests for nothing lost, a dry run and a second run (`test/cli/migrate.test.ts:104`, `:425`, `:441`,
   `:456`).
7. `test/s9-housekeeping.test.ts:54` asserts that `--retire` deletes the record and branch of a job landed by a hand
   `git merge` (the git-graph rule), and retires a failed job with no commit and a done job with none, unasserted.

## Change

(a) Record (D-079, additive like `scope`): two optional fields, `landed: {sha, at}` and `abandoned: {branch, commit,
at}`, validated in `src/job/record.ts`; older records read as before.

(b) One marker writer in `src/job/record.ts`, the only write after a terminal state: under the job's lock it refuses a
record that is not terminal, writes a marker once, does nothing when the same value is there, and refuses a different
one with a typed error.

(c) `limen land` writes `landed` with the commit its merge leaves on the target and the time, right after the merge
and before it deletes the branch. `ticket done` writes `landed` with its closing commit and its date (`--on`, or the
day) on every finished job whose features (`jobFeatures`, as land reads them) name a ticket it closed and that holds no
unlanded work (R-030's `unlandedWork`); a job with unlanded work stays unmarked.

(d) `limen abandon` writes `abandoned` (the branch, its commit, the time) only when it removed the worktree, so the
branch holds the whole state. Its check of a nested repository also reads that repository's branches, tags, stash and
reflog: one that names a commit the project's object store lacks keeps the worktree, as one more `kept` cause, and no
marker is written. `src/job/unlanded.ts` takes a job as resolved by its `abandoned` marker instead of the existence of
`limen/abandon/<id>` (R-030, Decision 2).

(e) `prune --retire` takes only jobs with a marker and no unlanded work, never the git graph: under the jobs lock
(`.limen/jobs.lock`) it reads each candidate's record again and moves its folder with one `rename` to
`.limen/archive/<YYYY-MM>/<id>/`, the UTC month of the marker's `at`, creating the month's folder; a landed job's
`limen/<id>` branch goes before the move as today (`deleteLandedBranches`), and `limen/abandon/<id>` branches stay. Its
lines and help say "retire" for the step and "the job archive" for the place (`src/registry.ts:578`, `:580-581`, the
golden help test).

(f) The archive's readers, each through a listing of the record module (the scan `JOB_FOLDER_READERS`): the token draw
(T-20 (1)), `limen stats` (gate 2 §2), and the GitHub claim's job lookup (`markedJob` and `claimHasJob`, the R-099
note). Every other reader keeps reading `.limen/jobs/` only; `outcome.md` names them.

(g) `limen status` lists each `limen/abandon/<id>` branch of the project with its commit (A-002).

(h) Migration: a new step of `limen migrate` writes `landed` on a finished record with no marker when the project's
history holds a commit whose subject is `Close <codes>: landed by <id>` for that job (its sha and committer date: land's
own record, not the graph), and `abandoned` when `limen/abandon/<id>` exists and the job's worktree is gone. The report
names the jobs it marked and the finished jobs it left with no marker (3.6). It refuses while jobs run, has a dry run,
and changes nothing when run again.

(i) Tests, each failing before the change (T-28 (3)): retire keeps a failed job with no commit and a job whose branch
a human deleted (A-002), retires a marked job with record, `log`, `result` and `session/` byte for byte in the archive
(nothing lost), and does nothing when run again; `s9:54`'s hand-merged job stays, since it has no marker; land and
`ticket done` write `landed`; abandon writes `abandoned` only when the worktree went, and keeps a worktree whose nested
repository has another branch, a stash or a reflog entry the project lacks; the marker writer refuses a running record
and a second, different marker; the token draw refuses an archived token; `limen stats` counts an archived job; a
GitHub claim finds its archived job; `limen status` lists an abandon branch; the migration's step on a fixture
(marked, unmarked, dry run, run again, nothing lost).

(j) Text that becomes false: `docs/jobs.md:52`, `:56`, `:136`, `:143`, `:144`, `:147`, `:159`;
`docs/herdr-status.md:15-17`, `:70`; `docs/commands.md:227`, `:236`, `:238` and the generated `:64-65`;
`docs/remote.md:163`; `templates/agents.md:105` (with the new hash in `templates/.history/agents.md`); the comments of
`src/job/unlanded.ts:8`, `src/job/reference.ts:8`, `src/job/abandoning.ts:5-6`, `src/job/migration.ts:501`, `:553`,
`src/integrations/github-claims.ts:346` and `hook/wake.ts:1214`.

## Out of scope

- The sweep that runs retire daily (R-032); land as recorded steps and the `cleaned` step's tab close (R-037); a
  review's `filed` field before retire (A-035).
- A Limen command that deletes the archive: none; a human deletes a month's folder by hand (A-002: "only an explicit
  human command"), and `docs/jobs.md` says so.
- `show`, `continue`, `land` and `abandon` of an archived job (they refuse `JOB_NOT_FOUND` as for a retired one today);
  the alerts, the board, the activity line, `limen close` and the ticket numbers over the archive; `.limen/unmigrated/`.
- Finished jobs that get no marker (reviews, continued parents, group members, jobs with no commit): they stay in
  `.limen/jobs/`, unretired, until a later ticket resolves them.

## Acceptance

- AC-1: `node --test test/s9-housekeeping.test.ts` → exit 0.
- AC-2: `node --test test/cli/land.test.ts` → exit 0; `node --test test/cli/ticket.test.ts` → exit 0.
- AC-3: `node --test test/cli/abandon.test.ts` → exit 0.
- AC-4: `node --test test/cli/migrate.test.ts` → exit 0.
- AC-5: `node --test test/job/record.test.ts` → exit 0; `node --test test/job/reference.test.ts` → exit 0.
- AC-6: `node --test test/cli/stats.test.ts` → exit 0; `node --test test/cli/github.test.ts` → exit 0.
- AC-7: `node --test test/cli/status.test.ts` → exit 0; `node --test test/help.test.ts` → exit 0.
- AC-8: `node --test test/structure.test.ts` → exit 0; `node --test test/registry.test.ts` → exit 0.
- AC-9: `node adrian-rebuild/tools/fails-before.mjs` → exit 0, its output in `outcome.md` → `## Fails before`.
- AC-10: `node adrian-rebuild/tools/gate.mjs` → exit 0.
- AC-11: `npx biome check --error-on-warnings .` → exit 0; `node adrian-rebuild/tools/check.mjs` → exit 0.
- AC-12 (judgment): no path deletes a job record; retire moves only marked jobs with no unlanded work; a marker is
  written once and only where its evidence holds.

## Migration

`limen migrate` gains the marker step of (h), tested on a fixture; the seat runs it in step 3.6. The rollback of the
format change is the snapshot of `## Deployment` 0.1.

## Risk

- Finished jobs without a marker now stay in `.limen/jobs/` for good, so `limen status` → `Older` grows until later
  tickets resolve them; nothing is lost.
- A job landed with no ticket before this ticket has no closing commit, so the migration leaves it unmarked; it is
  named in the report.

## Rollback

`git revert $(git log --format=%H --grep='^R-031:' adrian-rebuild --)`, then restore `.limen/` from the snapshot of
`## Deployment` 0.1 if the migration ran.

## Decisions

Settled by the documents when the ticket was written (2026-11-22, the main session's reading, not a night default):
1. The markers are optional record fields, as `scope` was for R-026 (D-079, the additive convention); no version rise.
2. A marker is the one write after a terminal state, in the record module (T-25), write-once and under the job's lock
   (T-38 (2)); `transition` keeps its rule.
3. `landed.sha` is the commit that holds the job's work on the target: the merge for land, the closing commit for
   `ticket done`. `ticket done` names tickets, so it reaches jobs through the features land itself reads, and only jobs
   with no unlanded work, so that a marker never hides work (A-001).
4. Land writes the marker as soon as the merge holds, before anything it could fail to do after; the steps of A-021
   are R-037's.
5. `abandoned` follows D-088's note: only when the save holds the whole worktree, which now includes a nested
   repository's other branches, tags, stash and reflog.
6. Retire's set is A-002's and A-001's together: a marker and no unlanded work. The archive month is the marker's, so a
   rerun after a crash puts a job in the same place; the jobs lock is the lock of the token draw and the resolver
   (A-018), which a move from `.limen/jobs/` must exclude.
7. The archive's readers are the three that the documents name (T-20 (1), gate 2 §2, the R-099 note), plus the scan
   (T-25); the rest is YAGNI until a ticket needs it.
8. `limen status` lists the abandon branches here, since A-002's Decision says so and this is A-002's ticket.
9. The place is A-002's `.limen/archive/`; the docs call it "the job archive", apart from the tickets' `archive.tsv`
   (T-18). The command stays `prune --retire` until R-032 makes it a step of the seat's sweep.
10. The migration's evidence is the subject of land's own closing commit (D-057 (4): never the graph); a job it cannot
    establish gets no marker (z. 10) and is named in the report (3.6).
