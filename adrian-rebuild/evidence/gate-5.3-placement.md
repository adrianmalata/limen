<!-- PL: Szkic rozmieszczenia otwartych punktów etapu 3 przebudowy Limena na bramkę 5.3, przygotowany przy `HEAD`
`9bdf42e` z `evidence/gate-5.3-inventory.md` (sekcje 2 i 3) i cytowanych `outcome.md`. Każdy punkt (a) i każda
otwarta pozycja sekcji 2 dostaje jedno miejsce: notatkę planowanego ticketu etapów 4–9, nowy ticket naprawczy, brak
zmiany z powodem z własnego tekstu albo pytanie do Adriana. Plik jest podstawą Q-53, tak jak propozycja Q-29 na bramce
5.2 (reguła D-092). Stan: szkic dla sesji głównej i Adriana, który niczego nie rozstrzyga; nowe kody i sformułowania
oraz trzy domyślne decyzje nocy zostają przy Q-51 i Q-52. -->

# Gate 5.3 placement (stage 3's open points)

Draft at `HEAD` `9bdf42e`, for Q-53. Input: `evidence/gate-5.3-inventory.md` → section 3 (the 61 points marked (a))
and section 2 (items for gate 5.3 or marked (A), with `## State`'s gate lists), checked against each cited `outcome.md`
and `ticket.md`. Rule: D-092 (a note that needs code goes to the ticket that rewrites that part, else to the gate).
Model: `plan.md` → `## State` → "Proposal of Q-29". "OP n" is `outcome.md` → `## Open points` item n. The new IDs
R-104 and R-105 are the next free ones; the main session checks every line before Q-53 is asked.

For the gate as a whole (not placed here):
- Night defaults (inventory section 1): the three of the night of D-102, R-087 F2 (= R-087 OP 5), R-098 F5 (= R-098
  OP 1) and R-101 Decision 7 (= R-101 OP 2): Q-51.
- New codes and wordings (inventory section 5): 41 entries, among them R-034 Decision 3 and its words for a `null`
  reset, R-037 Deviation 1, R-102 Decisions 1 and 3 (= R-102 OP 1), R-103 `## New codes and wordings` and the wording
  parts of its Decisions 15, 16, 18, 21 and 25: Q-52.

## Notes for planned tickets

| Source | Point | Destination | Reason |
|---|---|---|---|
| R-032 OP 5 | `limen seat sweep --install` inside a job's scope is not refused | note R-060 | R-060: "agents create no timers" (T-42); an install from a job writes Limen's timer into the agents' home, which the run already refuses as `SWEEP_IN_JOB` |
| R-032 OP 6 | `--uninstall` reads `is-active` as undefined both for `inactive` and a failed probe, so a timer file removed by hand stops every rerun (`src/platform/systemd-units.ts:197-200`) | note R-060 | the installer of Limen's own timer, which R-060 must tell from the foreign timers it reports |
| R-033 OP 5; R-032 `ticket.md` → Out of scope | `limen init` rewrites the registry with `atomicWrite`, which drops the alerts' ACL until root installs again | note R-062 | R-062 rewrites `limen init` ("`limen init` asks for them"); the text's fix: "a registry writer that keeps the file's ACL" |
| R-033 OP 6 | after the units step succeeds and the next tag fails, the checkout goes back but the new units stay loaded (`seat/deploy.ts`) | note R-059 | R-059 rewrites the seat's units and tools ("every unit calls `node /opt/limen/seat/<tool>.ts`"), so it changes what deploy's units step installs |
| R-034 OP 4 | a parent with a `null` model resumes on `defaultModel()` | note R-062 | R-062's routes cover `continue`, "which takes the parent's recorded route unless its flags name another" (its note, A-030); the resume calls `continue`'s function (D-097 (5) (d)) |
| R-034 OP 5 and `ticket.md` → Decision 2 | the sweep unit's `PATH` is the installing process's own, as long as it is | note R-049 | R-049 declares where Pi, the bridge and Claude Code live and runs only root-owned code; R-087 Decision 2: "a declared `PATH` is R-049's (T-12)" |
| R-034 OP 7 | an owed completion wake released after the resume names a resume time already past (`src/job/wake-text.ts`) | note R-051 | R-051 builds the wake's header from records, so it can name the resume that ran (the newest record on the worktree) |
| R-035 OP 4 | `seat queue` shows no thresholds; `show` shows no `queueWait` | note R-073 | R-073 gives `limen status` and the footer one renderer over records, the queue included (T-15 (5)) |
| R-035 OP 2 ((b), no note yet) | units outside the user manager (a coordinator's `session-N.scope` from SSH) are not ranked | note R-050 | its own text: "until R-050 gives it a unit"; R-050's notes do not say it |
| R-098 OP 6 | two private `coordinatorLines` (`src/job/statistics.ts`, `src/project/summary.ts`); T-25's name scan covers two files only | note R-076 | R-076 adds lines to `limen stats` in `src/job/statistics.ts`; the text: "A rename" |
| R-101 OP 5 | the `seat sweep` help summary is the implementer's wording and omits the daily close of leftover tabs | note R-085 | R-085 writes the final help (Q-52: "the final help and texts are R-085's and R-065's") |
| R-102 OP 7 | the refusal writer follows a link in place of `.limen/refusals`, while both readers refuse it | note R-050 | R-050 builds the registered coordinator (D-097 (6) (b)), whose hooks write that file; option (a), recommended: the writer refuses it, "the readers' rule, one place for the check" |
| R-103 OP 6 | a rerun on a record whose `merged.sha` Git no longer holds ends exit 4 each time | note R-054 | named for Adrian, but its fix needs no choice: "a merged commit Git does not hold counts as no closing commit, in the same next ticket"; R-054 is the next ticket that changes land (owner files, A-011; it depends on R-103) |
| R-103 OP 4, 5 ((b), no note yet) | `closeStep`'s comment says "the migration's rule"; G1's filter runs once per earlier land | note R-054 | "the next ticket that touches `src/job/landing.ts` (R-054 or R-071)"; R-054 comes first |

## New fix tickets

- R-104 (proposed): "The sweep's daily prune archives every unregistered folder and waits on no job's lock". Stage 4
  (as R-100 joined stage 3 at gate 5.2), S, delegated, night, depends on none (R-101 is `done`); sources T-25, z. 29,
  D-097 (4) (d). Module `src/runtime/pruning.ts`. Items: R-101 OP 6 by its option (a); R-101 OP 4, with a test that
  plants the empty folder (guessed, so the test shows it first); R-101 OP 3 by Adrian's answer (question 3 below); R-102
  OP 9 if Adrian picks (a) (question 4), which adds `src/runtime/start-queue.ts` and makes it M.
- R-105 (proposed): "The T-04 and T-26 scans follow what their rules name". Stage 4, M, delegated, night, depends on
  none; sources T-04, T-26. Module `test/structure.test.ts`, with `ownerState` moved out of `src/runtime/reap.ts` and
  `queuedText` out of `src/runtime/start-queue.ts` into modules with no transition; the command files that hold read and
  change commands (`src/commands/ticket.ts`, `github.ts`, `picture.ts`) stay as a ratchet naming their end tickets
  (R-065, R-057 or R-058, R-080), the plan's ratchet convention.

| Source | Point | Destination | Reason |
|---|---|---|---|
| R-101 OP 6 | the daily prune's moves (`moveUnstarted`, `movePublications`) wait 60 s for a folder's lock under the jobs lock | R-104 | option (a), recommended: one attempt, "one rule for every move under the jobs lock", as retire (F5); no planned ticket rewrites the prune after R-101 |
| R-101 OP 4 | a lock taken after a retire can leave an empty `.limen/jobs/<id>/`, and the daily prune then fails until the month changes | R-104 | same module (the move to `archive/<month>/<id>`) |
| R-032 OP 1 = `ticket.md` → Decision 16 | the read commands' transitive imports reach state-transition functions (`listing.ts` → `reap.ts`, `start-queue.ts`; mixed command files) | R-105 | T-04's Check: "read commands do not import the state-transition functions"; the scan reads direct imports only |
| R-026 OP 3 | the T-26 launch scan sees `node:child_process` only, so a start through `platform.startInScope` outside `launcher.ts` passes | R-105 | the same file of scans; no planned ticket names them |

## No change

The section 2 choices in this table are what Q-52 option 1 keeps.

| Source | Point | Destination | Reason |
|---|---|---|---|
| R-027 OP 4 | `is-active` exit 3 reads a `deactivating` scope as gone | no change | closed by R-032: `scopeState` ends only `inactive` or `failed` (its `outcome.md` (b)) |
| R-027 OP 6 | a reaper inside the reaped job's own scope TERMs itself | no change | closed by R-032: `status`, `show` and the tick no longer reap; the sweep refuses a run in a job's scope (`SWEEP_IN_JOB`) |
| R-028 OP 1 | a stop of a `starting` job and a reserved slot write `stopped` with no `stopRequested` | no change | D-093 confirmed AC-9's reading "within (a)'s scope" |
| R-028 OP 2, 15 | the exhaustion's TERM drops its result; the TERM's flag is taken at `close` | no change | closed by R-029 (f): it "logs its result after the call", and "the TERM's flag is taken at the engine's `exit`" |
| R-028 OP 4 | a TERM during the setup's prune step reaches no `--prepare` | no change | the setup prune is gone (R-101, D-097 (4) (c)): "A setup prunes nothing" (`src/runtime/job-setup.ts`) |
| R-028 OP 6, 14 | a leaked `LIMEN_END_GATE` holds every end without bound | no change | closed by R-087 (b): the test knobs, `LIMEN_END_GATE` among them, "are read only in test mode" |
| R-031 OP 1 | `removeUnstartedRecords` still deletes | no change | D-093 confirmed the reading; R-101 moves such folders into the archive (D-097 (4) (d)) |
| R-031 OP 2 | `ticket done` writes markers after its commit; a rerun refuses `NO_ACTIVE_TICKET` | no change | closed by R-103: the marker step continues when `ticket done` runs again |
| R-031 OP 3, 7 | retire without the job's own lock; the poller's lockless reads around a retire | no change | closed by R-101: retire moves through `moveLockedFolder` under the job's lock; the poller finds the job again, in the archive too |
| R-031 OP 8 | `abandonedOf` names two functions | no change | closed by R-101 Decision 4 (`abandonedMarker`, `abandonEvidence`) |
| R-035 OP 1 and `ticket.md` round 1 note 1 | one advisory per job and session hides a later stall advisory | no change | closed by R-036 (D-092, Q-43): receipts per source |
| R-026 OP 2 | `show` and `status --all` print a job folder's `cleanup` file, which nothing writes | no change | "folders written before R-026 may hold one (R-021 kept it as a content file)" |
| R-027 OP 7 | the reaper signals the unit the record names, in a file the job's account can write | no change | "`HEAD`'s finisher already sent SIGKILL to that unit, so the exposure is not new"; the sweep runs on the agents' account (R-032 Decision 1), which runs every job |
| R-027 OP 8 | `scope <unit> ended after TERM; SIGTERM failed: <detail>` | no change | "the failure itself is named (F1)"; Adrian can still name the wording under Q-52 |
| R-028 OP 9 | were the engine's exit 143 handled before the wrapper's handler, the end would be kind `exit` | no change | "Pi disposes its runtime before it exits, … so it was not seen"; step 3.8 runs a real stop and TERM |
| R-033 OP 3 | the real-path check and `setfacl` are two steps | no change | "root runs the install by hand, rarely" |
| R-033 OP 4 | a seat umask of 027 or 077 hides records from the alerts | no change | "the run would name each record it cannot read" (T-01 holds) |
| R-034 OP 6 | a manual `continue` of a resumed job counts its limit end from 1 again | no change | "the ticket's '1 for a job without one'" (D-097 (5) (g)) |
| R-036 OP 3 | a pending tool with no child process can now stall | no change | "the ticket accepts it (Risk 2, A-059's Decision)"; step 3.8's trial records show it |
| R-037 OP 2 | a `commit-msg` hook that empties the message gives an empty-message commit | no change | "no hook of the seat's projects is known to do that"; the hook listing of OP 3 tells |
| R-037 OP 3 and `ticket.md` → Decision 1 | whether the projects' hooks read staged files from the working tree is unknown | no change (a seat read) | "a deployment step that lists `core.hooksPath` and `.git/hooks` of both projects would tell": the main session's text in `## Deployment`, before step 3.0 (D-092) |
| R-037 OP 5; R-103 `ticket.md` → Out of scope | `git commit-tree` ignores `commit.gpgSign` | no change (a seat read) | "No project is known to sign"; the same step reads `git config --get commit.gpgSign` in both projects; a project that signs brings the point back to Adrian |
| R-037 OP 6 | `HOOK_REJECTED` carries up to 20 lines of a hook's output | no change | the text's own "no change": "an observation for the gate 5.3 summary" |
| R-087 OP 4 | `GH_CONFIG_DIR` hides only gh's files; a keyring login would still be found | no change | "Step 3.10 shows which" (`gh api user --silent` must fail in the trial job) |
| R-087 OP 7 | `~/.netrc` would give git a credential through libcurl | no change | "G2's accepted risk until stage 5"; the text is fixed and step 3.10 checks the account holds none |
| R-098 OP 2 | a0.2.0 records without `queueWait` read as queue 0 | no change | "no land of a0.2.0 exists" (the projects stand from a0.1.1 until a0.3.0, D-012) |
| R-098 OP 3 | M-04 counts a refused `limen land` as a land | no change | "as the ticket defines a land in a session by its call" (D-098 (5) (c)) |
| R-098 OP 4 | a land through another wrapper (`npx limen land`) is not found | no change | "the seat's coordinator calls `limen`" |
| R-098 OP 5 | M-04's "turn after a land" can belong to the land's own run | no change | "B.3 and 9.1 count the same way, and the median over the lands keeps one such turn from setting the number" |
| R-102 OP 2 | a BAD_DATA line shows quotes as `\"` | no change | option (a), recommended: "one escape for every text from outside" (T-25) |
| R-102 OP 3 | a refusal's temp file left by a death mid-write stays in `.limen/refusals/` | no change | "Not reproduced; the window is one `atomicWrite`"; `limen status` skips it |
| R-102 OP 8 | a test's assertion message still says "registered" | no change | option (a), recommended: "a test message, true as it stands" |
| R-102 OP 5 | six test refusals in the checkout's ignored `.limen/refusals/` | no change (Adrian's hand) | "Adrian removes `.limen/` at the repository root by hand" (`rm` is denied to the sessions) |
| State (section 2, not tagged) | R-029's leaked test folders in the gate's cache (`r029-head-*`, about 640 `limen-live-*`/`limen-tree-*`, 84 MB) | no change (Adrian's hand) | "`rm` is denied to sessions"; the gate summary's "For Adrian's hand" names only R-102 OP 5 |
| R-028 `ticket.md` → Decisions | R-027's sentence that stop and the exhaustion "keep their group signals until R-028" | no change | "it stands as written: stop TERMs the wrapper's group, … and the winner of the transition ends the scope (R-026)" |
| R-032 Decisions 4, 6, 8, 15 | `TimeoutStartSec=300`; `Sweep not working`; the dead job's line without "since"; `systemd-units.ts` | no change | "a run it kills is attempted again a minute later"; "as it names the alerts (T-01)"; "states no time it cannot know"; the unique-basename rule |
| R-032 Decision 17's knob | `LIMEN_LINGER_DIR` | no change | closed by R-087 (b): read only in test mode |
| R-034 Decision 5 | `owedWake` on the job whose wake is owed | no change | "the hook looks up a job's wake by its job, and a coordinator session has no record" |
| R-037 Decisions 2, 8 | three hooks, `post-commit` not run; `HOOK_REJECTED` is `environment` | no change | "`post-commit` cannot stop a commit … (YAGNI)"; "it comes after validate (T-38 (1)), and the project's hook is outside Limen" |
| R-037 Decision 9 | land's `irreversible` mark goes to R-103 | no change | closed by R-103: "`land` is `irreversible`" |
| R-087 Decisions 1, 2, 4, 10 | `HERDR_*` kept; the fixed list; `LIMEN_TEST_MODE`; dropped names as a log line | no change | "a seat fact (step 3.10)"; "the fewest a job needs (KISS)"; "the one switch that needs no other ticket"; "not a refusal … and not silence (T-01)" |
| R-101 Decisions 2, 4 | the coordinator's tab skipped by the label check; the two new names | no change | "a reused tab id carries another label"; "each saying what it reads" |
| R-102 Decision 2 | `.limen/refusals/<pid>-<born>.json` | no change | "because the registration goes (D-097 (6) (b))"; it "closes the gap of a session that never registered" |
| R-103 Decisions 2, 5, 6, 9, 23 (A) | `.land.lock`; the branch's delete; `CHECKOUT_BEHIND`'s `next`; retire keeps a `land` without `cleaned`; the bound and the mark | no change | the ticket: "the items marked (A) … stand as written" |
| (A) outside `## Decisions` | R-034 D-097 (5) (b) twice, (d), (f), (i), (k); R-101 D-097 (4) (c), (d), (g); R-102 D-097 (6) (c) | no change | D-097: "the items marked (A) … stand as recommended" |

## Adrian

| Source | Point | Destination | Reason |
|---|---|---|---|
| R-029 OP 4 | "refusal" names a command's exit-1 refusal and a guard's BAD_DATA of a Pi value | Adrian (question 1) | "another name for it is a naming decision"; T-18 (one word per thing) stands against T-32 (4) and D-055's wording |
| R-032 OP 4 = `ticket.md` → Decision 9 | `limen status`'s bounded probes grew by two 3 s probes; may a read take a bounded reading? | Adrian (question 2) | Decision 9: "whether a read may take a bounded reading is Adrian's at gate 5.3" |
| R-101 OP 3 | an unregistered worktree-root folder that holds a `.git` is still deleted | Adrian (question 3) | (a) and (b) amend D-097 (4) (d), which confines the move to a folder with no `.git` |
| R-102 OP 9 | a start-queue entry is live on its pid and job folder alone | Adrian (question 4) | "options for Adrian": a fix or an accepted risk |
| R-102 OP 6; State: R-103 Decision 24's recommendation | a gate check for new ignored files; `check.mjs` checks that every named test file exists | Adrian (Q-54, already asked) | two `Tools:` commits, outside Limen's tickets |

## Counts

| Destination | Section 3 (a) points (61) | Other section 2 items |
|---|---|---|
| note R-NNN | 12, for 10 tickets (R-049, R-050, R-051, R-054, R-059, R-060, R-062, R-073, R-076, R-085) | 4, to the same tickets: R-034 Decision 2, R-035 OP 2, R-103 OP 4 and 5 (R-032's ACL item is R-033 OP 5) |
| new fix ticket | 4, in 2 tickets (R-104: 2, R-105: 2); 2 more by questions 3 and 4 | R-032 Decision 16 (= R-032 OP 1) |
| no change | 36: 14 closed by a later stage-3 ticket or decision, 22 by their own reason | 35 (10 of them the (A) items D-097 settles; R-029's leaked folders among them) |
| Adrian | 5: 4 questions below, 1 already Q-54 | R-032 Decision 9 (= R-032 OP 4); R-103 Decision 24's recommendation (Q-54) |
| for the gate as a whole | 4: 3 night defaults (Q-51), R-102 OP 1 (Q-52) | the 41 codes and wordings of section 5 (Q-52) |

## Questions for Adrian

1. R-029 OP 4: does "refusal" keep naming both a command's exit-1 refusal and a guard's BAD_DATA of a Pi value?
   Options: (a) keep it (the guard's wording is T-32 (4)'s, D-055's and R-017's `refuse`); (b) another name, Adrian's
   word, for the guard's record field `refusal`, `.limen/refusals/`, `recordRefusal` and `writeCoordinatorRefusal`,
   as a note for R-085 (stage 9, names) with a record migration (D-079). Recommendation: none in the text; R-029's
   review rejected the rename "for R-029" only.
2. R-032 OP 4 (= `ticket.md` → Decision 9): may a read command take a bounded reading of an outside system
   (`limen status`'s Herdr and systemd probes of 2–5 s, now with two 3 s user-unit probes; `seat queue`'s 2-second
   sample)? Options (the inventory's question 9): (a) yes, each bound named in T-04 by a dated line, and the read
   test keeps its exceptions; (b) no, the sweep records what the probes read and the read commands show that record
   (a fix ticket). Recommendation: none in the text; T-04's Why names reads that "reap jobs and can wait 10 s", its
   Check "returns without waiting".
3. R-101 OP 3: a folder in the worktree root that Git does not register but that holds a `.git` (one whose `.git` Git
   cannot read, or a clean clone with commits only there) is deleted as before. Options: (a) every unregistered folder
   moves to `.limen/archive/unregistered/`, `.git` or not; (b) only one whose `.git` Git cannot read moves; (c) as now.
   Recommendation (a): "nothing Git does not hold elsewhere is deleted, z. 29, at the cost of archive space". (a) and
   (b) amend D-097 (4) (d) and go into R-104.
4. R-102 OP 9: a start-queue entry counts as live on its pid and job folder alone, so a process of the agents' account
   can hold other jobs' starts until their `failAfter` (`src/runtime/start-queue.ts:584`, `:621-631`). Options: (a) a
   fix that checks an entry's job folder against the project's jobs; (b) an accepted risk, "since the agents' account
   already runs every job". Recommendation (a): "the queue's own rule, z. 14". (a) goes into R-104, which becomes M.

R-102 OP 6 and R-103 Decision 24's recommendation are Q-54 already and are not asked again.
