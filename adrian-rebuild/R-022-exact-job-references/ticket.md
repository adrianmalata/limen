<!-- PL: Ticket R-022: każde odwołanie do joba jest dokładne (T-20): polecenia przyjmują tylko pełne id albo jego
końcowy token 8 znaków hex, przez jeden resolver dla każdego argumentu typu job w rejestrze; etykieta, prefiks etykiety
i krótki sufiks dają tylko podpowiedź w błędzie z kodem 2 i gotowym `next` (D-061). Token jest unikalny od powstania:
spawn i continue losują go ponownie przy kolizji z rekordami i `.limen/unmigrated/` pod blokadą z R-019. Stan:
napisany nocą 21.11 przy drzewie po R-021, z inwentarza `evidence/inventories/R-022-R-023.md`; zamknięty 21.11 rano
(delegated, recenzja PASS w rundzie 3, bramka 504/504); decyzje rund i D-063 w `## Decisions`; dwie uwagi rundy 3
poszły do R-095 (D-065), który poprawił też `## Migration` o tokenie wspólnym z `.limen/unmigrated/`. -->

# R-022 Exact job references through one resolver

## Problem

T-20 (`taste.md`), in full: "A reference to a job is always exact; an approximate match appears only as a hint in an
error, never in an execution. Today an exact label also depends on time (a second review round has the same label),
and a 3-character suffix matches every id that ends with it (`src/job/job.ts:110-116`). (1) Every command takes only
the full id or its final token of 8 hex characters (`src/job/job.ts:136`); the token is unique by construction: at job
creation it is checked against the project's records and archive under the shared lock (A-018) and drawn again on a
collision. (2) A label is never a reference; label prefixes, short suffixes and exact labels are cut as references. The
list filter is `status --ticket FNNN`, by the record's ticket field, not by label text (T-24). (3) Any other form exits
with code 2 (T-02); the message lists the matching jobs (token, label, state) and the ready command in `next` (z. 11,
z. 12). (4) One resolver handles every argument of type job in the registry of T-19. (5) References in files (records,
the handoff note, `decide` entries) use the full id. (6) The S1+ migration checks the uniqueness of tokens in existing
records; jobs with a collision or an older id format accept only the full id." Its Check: "a resolver test (the full
id and the token pass; a shorter suffix, a label and a label prefix exit with code 2 with the candidate list and
`next`); a test that `land` and `stop` with a label exit with code 2 and change no state; a test that the token is
drawn again on a collision with a record and with the archive; a scan that every argument of type job goes through the
one resolver."

`plan.md` → D-061 (2026-11-20, Adrian, "Pytania zgodnie z twoimi rekomendacjami"), the parts for R-022: "(1) R-022: a
well-formed id or token that names no job exits with code 2, class `usage`, code `JOB_NOT_FOUND`, so one resolver gives
one class to every reference that does not name exactly one job." "Settled by the documents, not asked (the session's
reading, recorded here): in R-022 a hint's `next` is the command with the one candidate's token, or `limen status
--all` for several or none (T-20 (3), D-046 (1), D-045 (2)); `status --ticket` belongs to the ticket that first records
the job's ticket (T-20 (2), T-24); the token is checked against the records and `.limen/unmigrated/` until R-031 adds
the archive." "… a converted refusal carries its own code (T-01, T-28 (1))."

A-055, Decision (the shared lock module of A-018): "fix — Ticket number allocation (also outside a series) runs under
the shared lock module (A-018) …"; R-019 (`done`) made that module `src/lock.ts` (`withLock({ folder } | { file },
operation, options)`), and a `.lock` name outside it fails `test/structure.test.ts`.

`plan.md` → `## Tickets` → notes for R-022 (R-021 review round 2, note 3): "after R-021 one record that reads as
`BAD_DATA` makes `resolveJob` (which reads every folder's record for its label) and plain `limen status` fail with exit
4; only `status --all` shows such a record as INVALID. The one resolver decides how a record it cannot read takes part
in a reference (for example: an exact id still resolves, a label match skips it and names it), with a test."

R-021 (`done`): a job's facts are in `record.json`, read only through `src/job/record.ts` (`readRecord`,
`jobFolders`, `unmigratedFolder`); its migration reports older 4-hex ids and token collisions in existing records
(T-20 (6)); `.limen/unmigrated/<id>/` holds folders it could not migrate.

Facts at HEAD (R-021's tree; `evidence/inventories/R-022-R-023.md`, read before R-021, with lines checked again):
- One matcher, `resolveJobId` (`src/job/job.ts:101-128`): the exact id, then the exact label, then for 3 or more
  characters an id suffix, a `-suffix` or a case-insensitive label prefix; no match, several matches and empty input
  throw plain errors, which `failureOf` turns into `refused`/`UNTYPED`, exit 1 (`src/outcome.ts`).
- Its one caller is `resolveJob` (`src/job/lookup.ts:6-25`): it lists `.limen/jobs`, reads every record for its label,
  and with `"control"` access compares `group`/`team` with `LIMEN_GROUP_ID`/`LIMEN_TEAM_ID`, throwing a plain error
  (`:21`). Callers: `continue.ts:182`, `keeper.ts:158`, `land.ts:93`, `steer.ts:22`, `stop.ts:19`, `watch.ts:32`
  (`control`); `diff.ts:12`, `open.ts:9`, `show.ts:18` (`read`). Hooks and the wrapper take the full id from
  `LIMEN_JOB_ID`.
- The registry's `JOB` positional is `{ positional: "job", type: "job", about: "the job's id, its suffix or its label" }`
  (`src/registry.ts:105`); keeper's `--job` flag has the value `job`; the parser does not check type `job`.
- `makeJobId` (`src/job/job.ts:129-138`) ends an id in 4 random bytes in hex; it is called by `spawn.ts:331` and
  `continue.ts:195`; nothing checks a collision of the token.
- Tests of today's forms: `test/u7-job-ids.test.ts:5-27` (`resolveJobId`); `test/outcome.test.ts:225` (`show` of an
  unknown id → exit 1, `no job matches …`); `test/help.test.ts` (the `JOB` about text).
- Docs and the manual with today's forms: `docs/commands.md:7`, `:144`, `:171-173`, `:204-207`, `:215`;
  `docs/jobs.md:77`; `templates/agents.md:166` ("a unique suffix such as `7a2f`, or a unique label", and `limen watch
  <id|label>` twice).

## Change

1. **The resolver** (T-20 (4), T-25 (1)): one module, `src/job/reference.ts` (the name may differ, by T-25), is the only
   code that turns a job argument into a job. It accepts exactly the full id of a folder in `.limen/jobs/` or the final
   8-hex token that exactly one such id ends with as `-<token>`. It needs only the folder names for that, so a record
   that reads as `BAD_DATA` never stops the resolution of another job (the R-022 note). Every other input exits with
   code 2, class `usage` (D-061 (1)): a well-formed id or token that names no job → `JOB_NOT_FOUND`; a label, a label
   prefix, a shorter suffix, a token shared by several ids or an empty argument → a code the implementer names. The
   message lists the candidates an approximate match would have found (token, or the full id when the job has no unique
   token, then label and state; newest first, at most 10; a record that cannot be read is listed as damaged), and
   `next` is the command with the one candidate's token, or `limen status --all` for several or none (D-061).
   - An older id ending in 4 hex and an id whose token another id shares accept only the full id (T-20 (6)).
   - The control check of a group member (today `src/job/lookup.ts:21`) becomes a `LimenError` with its own code and a
     `next` (T-01, D-061), in the same module.
   - `resolveJobId` (`src/job/job.ts`) and `src/job/lookup.ts` go; `src/job/lookup.ts` is deleted with `git rm`.
2. **Every argument of type job** goes through the resolver: the positional `job` of `continue`, `diff`, `land`,
   `open`, `show`, `steer`, `stop`, `watch` and `unwatch`, and keeper's `--job`, whether the wrapper resolves them before
   the handler or each handler calls the resolver (the implementer's choice); a scan in `test/structure.test.ts` finds
   no other matcher of job references (for example no `endsWith` on job ids and no label comparison used as a
   reference outside the resolver), with a fixture self-test. The `JOB` about text becomes "the job's full id or its
   8-character token".
3. **A unique token at creation** (T-20 (1)): `spawn` and `continue` get their new id from one function of the resolver
   module, which draws the 8-hex token, checks it against the ids in `.limen/jobs/` and `.limen/unmigrated/` under one
   lock of `src/lock.ts`, and draws again on a collision; the lock is held until the job's folder exists, so two spawns
   cannot take the same token.
4. **Docs and the manual**: `docs/commands.md` (the forms `<id|suffix|label>` become `<id|token>`, and `:7`),
   `docs/jobs.md:77`, `templates/agents.md:166` (the full id or its 8-character token; `limen watch <id|token>`), with
   the line of `templates/.history/agents.md` the history test asks for.
5. **Tests** (T-29): the resolver test in `test/job/reference.test.ts` (the full id and the token pass; a shorter
   suffix, a label and a label prefix exit 2 with the candidate list and `next`; `JOB_NOT_FOUND`; an older 4-hex id
   only by its full id; a shared token only by full ids; a damaged record does not stop another job's resolution and is
   listed as damaged; the token drawn again on a collision with a record and with `.limen/unmigrated/`); `land` and
   `stop` with a label exit 2 and leave the record byte-identical (`test/s5-land.test.ts`, `test/s3-finish-wake.test.ts`,
   or `test/cli/land.test.ts` and `test/cli/stop.test.ts` by T-29); `test/u7-job-ids.test.ts` keeps `makeJobId` and
   `parseDuration` (or follows the id function into the resolver's test); `test/outcome.test.ts:225` expects
   `JOB_NOT_FOUND` and exit 2; `test/help.test.ts` the new about text; every test that names a job by label or a short
   suffix uses its id or token, with its name and mechanism kept.

## Out of scope

- `status --ticket` and the record's ticket field (the ticket that first records a job's ticket, T-24).
- `spawn`'s early id line and the wrapper printing a command's text at its end (R-023, D-061 (3)).
- The archive of old records (R-031); the resolver checks `.limen/unmigrated/` until then.
- `validate`/`apply` (R-092); thin command adapters (R-023).
- How plain `limen status` shows a damaged record (the note's second half; `status --all` already shows it as INVALID).
- `LIMEN_JOB_ID` in hooks and the wrapper (a full id already).

## Acceptance

- AC-1: `node --test test/job/reference.test.ts` → exit 0.
- AC-2: `node --test test/u7-job-ids.test.ts` → exit 0.
- AC-3: `node --test test/s5-land.test.ts` → exit 0; `node --test test/s3-finish-wake.test.ts` → exit 0.
- AC-4: `node --test test/registry.test.ts` → exit 0; `node --test test/help.test.ts` → exit 0; `node --test
  test/outcome.test.ts` → exit 0.
- AC-5: `node --test test/structure.test.ts` → exit 0.
- AC-6: `git grep -n -E 'resolveJobId|job/lookup\.ts' -- src hook bin seat test` → exit 1 (at HEAD it finds 15 lines
  in 12 files).
- AC-7: `git grep -n -E '<id[|]suffix[|]label>|<id[|]label>|unique suffix|unique label|unique suffixes|its suffix or its label' -- docs/commands.md docs/jobs.md templates/agents.md src/registry.ts`
  → exit 1 (at HEAD it finds 19 lines in the four files).
- AC-8: `node adrian-rebuild/tools/fails-before.mjs` → exit 0; `outcome.md` → `## Fails before` holds its output and
  names each new or changed test that passes at `HEAD` and why.
- AC-9: `node adrian-rebuild/tools/gate.mjs` → exit 0 with `fail 0`.
- AC-10: `npx tsc --noEmit` → exit 0; `npx biome check --error-on-warnings .` → exit 0.
- AC-11: `node adrian-rebuild/tools/check.mjs` → exit 0.
- AC-12 (judgment): no command executes on an approximate match; every argument of type job goes through the one
  resolver; the token is unique at creation under the lock; every refusal has class `usage` and exit 2 (the group
  member's control refusal excepted, which keeps its own class), a code and a `next` that can be run as it stands.

## Migration

No on-disk format changes: the resolver reads the folder names and records R-021 wrote. The old CLI forms (a label,
a label prefix, a short suffix) are refused with exit 2, the candidate list and the ready command in `next`, which is
the migration of a coordinator's habit; the coordinator manual (`templates/agents.md`) says the new forms. The tokens of
existing jobs that R-021's migration reported as shared, and older 4-hex ids, take only the full id (T-20 (6)).
Corrected on 2026-11-21 by R-095 (D-065 (1) (a); `review.md` → Round 3, finding 3): a token shared by one job of
`.limen/jobs/` and folders of `.limen/unmigrated/` names that job, since the resolver counts a token's owners among
`.limen/jobs/` only; the unmigrated folders have no reference until R-031.

## Risk

- A coordinator or a script that names jobs by label stops working; the refusal's `next` gives the exact command, so a
  retry costs one call. The seat's coordinators read the new manual after the deployment's `/reload`.
- Tests that spawn jobs and name them by label must change; a missed one fails in the gate.
- The token lock serialises job creation in one project; it is held only from the draw to the folder's creation.

## Rollback

`git revert $(git log --format=%H --grep='^R-022:' adrian-rebuild)`; no data to restore.

## Decisions

- 2026-11-20 D-061 (Adrian): quoted in `## Problem`; it binds the class, the code `JOB_NOT_FOUND` and the `next` of
  every refusal.
- 2026-11-21 (night run, main session; night defaults, for Adrian to confirm in the morning, D-054 (2) category A):
  (1) the resolver reads only folder names to resolve, so the R-022 note's damaged record cannot stop another job's
  resolution; candidates read records only for their hint lines. (2) The group member's control refusal keeps the class
  `refused` with its own code, since it refuses a well-formed exact reference for a reason other than its form.
  (3) The resolver test lives in `test/job/reference.test.ts`, beside its module (T-29).
- 2026-11-21 (main session, review round 1, `review.md`): fix findings 1–4.
  (1) A damaged record is a candidate only when the reference matches its id (its folder name), the one fact the
  resolver has for it; it never counts toward "several" for a reference it does not match, so a reference that
  matches exactly one readable job gets the command with that job's token in `next`; a test with one damaged record
  and a label that matches one job.
  (2) `docs/commands.md:7` says what `next` holds: the command with the one candidate's token, or `limen status --all`
  for several or none.
  (3) One owner of the id and token formats and of the folder listing (T-25 (1), (2)): `src/job/reference.ts`,
  `src/outcome.ts` and `src/job/migration.ts` use one definition of the job id, the 8-hex token and the older 4-hex
  form, and one listing of a jobs folder with its `ENOENT` rule (in the module that owns it; the implementer picks it).
  (4) The `UNTYPED_THROWS` ratchet in `test/structure.test.ts` falls to the count measured after the change.
- 2026-11-21 (main session, review round 2, `review.md`; the second and last round of fixes): fix findings 2 and 3.
  (2) The id's form and what makes ids of it are tied by a check, not by a comment alone: a test asserts that an id
  made by `makeJobId` matches `JOB_ID` and that `jobToken` gives a `TOKEN` (or the two take their form from
  `src/job/id.ts`; the implementer picks), and the comment at `src/job/id.ts:3` says only what is then true (T-25 (1),
  T-30).
  (3) The comment of `jobFolderNames` (`src/job/record.ts:11-12`) says what is true: which readers use it, with no
  claim that it is the only listing (T-30). Moving the other listings is out of scope (`outcome.md` → Open points).
  Not fixed here: finding 1 (the flaky race test of `test/cli/stop.test.ts`), since none of its lines is in this
  change; a question to Adrian (D-029).
- 2026-11-21 D-063 (Adrian, on the round-2 implementer's `BLOCKED` under D-029, the queue test of
  `test/s3-finish-wake.test.ts` that failed once in its gate): (1) round 2's finding 1 goes to R-093 as its item (8);
  (2) the test is measured, not rerun for a green result (10 of 10 alone on this tree and at `HEAD`), the five
  orphaned wrappers of the night's gate runs are stopped, and the main session's gate runs once more; (3) the wrapper
  that never ends when its job folder is gone, and the test's load-dependent 2 s budget, go to the new R-094.
- 2026-11-21 (main session, review round 3 PASS, `review.md`): the two rounds of fixes are used; notes 1 and 2
  (`outcome.md`) were fixed by the main session (D-053 (2)); notes 3 (the migration's report of a token shared with
  `.limen/unmigrated/` against `resolveJob`'s owners) and 4 (the keeper comment's "read once") are not fixed here and
  wait for Adrian's answer to `.night/questions.md` → Q-11, with no ticket blocked.
