<!-- PL: Inwentarz do bramki 5.3 (zamknięcie etapu 3 przebudowy Limena), zebrany tylko do odczytu z plików
`ticket.md`, `review.md` i `outcome.md` osiemnastu ticketów etapu 3 oraz z `plan.md` przy `HEAD` `9bdf42e`. Zbiera
domyślne decyzje nocne, pozycje nazwane dla bramki 5.3 lub oznaczone (A), otwarte punkty z oznaczeniem (a)/(b)/(c),
zmiany `unmeasured`, nowe kody i sformułowania, znaleziska A-NNN, kroki wdrożenia 3.x i pytania nocne. Służy Adrianowi
i sesji głównej jako lista do przejścia na bramce i niczego nie rozstrzyga. Stan: kompletny dla tych źródeł; trzy
domyślne decyzje nocy 24/25.11 czekają na potwierdzenie, a otwartych pytań nocnych nie ma. -->

# Gate 5.3 inventory (stage 3)

Read at `HEAD` `9bdf42e` (branch `adrian-rebuild`, 2026-11-25), read-only. Sources: `adrian-rebuild/R-NNN-<slug>/`
(`ticket.md`, `outcome.md`) of R-026–R-037, R-087, R-098, R-100–R-103; `plan.md` → `## Decisions` (last entry D-102),
`## Tickets`, `## Deployment`, `## State`; `adrian-rebuild/.night/questions.md`. "OP n" is `outcome.md` →
`## Open points` item n (bullet lists are numbered here in their order).

## 1. Night defaults (D-054 (2), category A)

| Night | Ticket | Night defaults (file → section) | Confirmed by |
|---|---|---|---|
| D-091, 2026-11-22/23 | R-027 | `outcome.md` → `## Night defaults` 1–7; `ticket.md` → `## Decisions` (round 1): "The wording in F1 is the implementer's, a night default" | D-093 (1–7 by number; F1's wording by its "every night default of the night of D-091") |
| D-091 | R-028 | `outcome.md` → `## Night defaults` 1–19; `ticket.md` → `## Decisions`: AC-9 "read within (a)'s scope" (category A (a)) | D-093 ("R-028's 1–19 and its reading of AC-9") |
| D-091 | R-031 | `outcome.md` → `## Night defaults` 1–26; `ticket.md` → `## Decisions` (review round 1): AC-12's first clause within the ticket's scope; the workspace's abandon branches from every immediate child repository | D-093 ("R-031's 1–26 and its two review-round defaults") |
| D-091 | R-035 | `outcome.md` → `## Night defaults` 1–13 | D-093 |
| D-091 | R-100 | `outcome.md` → `## Night defaults` 1–6 | D-093 |
| D-102, 2026-11-24/25 | R-087 | `ticket.md` → `## Decisions` F2; `outcome.md` → `## Done` F2 and OP 5: `JOB_SETS` holds `GIT_ASKPASS=` (empty) | none |
| D-102 | R-098 | `ticket.md` → `## Decisions` F5; `outcome.md` → OP 1: run parts less each job's queue wait (option (b)); option (a) described | none |
| D-102 | R-101 | `ticket.md` → `## Decisions` 7; `outcome.md` → OP 2: the transport name `LIMEN_SETUP` | none |

- D-093 (2026-11-23, Q-44): "every night default of the night of D-091 stands as recorded", listing R-027 1–7, R-028
  1–19 and AC-9, R-031 1–26 and two review-round defaults, R-035 1–13, R-100 1–6. It covers only that night. No
  decision after D-093 (D-094–D-102) confirms a night default; the three of the night of D-102 are open.
- R-102 (made in the night of D-102) records no night default. R-026, R-029, R-030, R-032, R-033, R-034, R-036, R-037
  and R-103 ran by day; their `## Decisions` say "not a night default".
- `plan.md` → `## State` calls R-028's "the implementer's fifteen"; its `outcome.md` numbers 19.
- D-092 also has a night list "each note's destination among its night defaults"; the night of D-102 sent R-098 round 3
  note 2 and R-101 round 3 note 1 to R-103's notes, but no text there calls them night defaults.

## 2. Items named for gate 5.3 or marked (A)

| Ticket | Source | Items |
|---|---|---|
| R-027 | `outcome.md` → `## Open points` | OP 4 (finding 4), 6 (finding A), 7 (finding C), 8 (round 2 wording), each "for gate 5.3" |
| R-028 | `ticket.md` → `## Decisions` (before the implementation) | R-027's sentence that stop and the exhaustion "keep their group signals until R-028": "an open point for gate 5.3" |
| R-028 | `outcome.md` → `## Open points` | OP 1 (round 1 finding 5), 4 (round 2 finding 3), 14 and 15 (round 3, "for gate 5.3") |
| R-029 | `outcome.md` → OP 4 (= `ticket.md` → `## Decisions`, round 1 note 9) | "refusal" names two things |
| R-031 | `outcome.md` → `## Open points` | OP 1–3 ("For gate 5.3, as review round 1 assigned them"); OP 1 = `ticket.md` → `## Decisions` (round 1): `removeUnstartedRecords` "is an open point for gate 5.3" |
| R-032 | `ticket.md` → `## Decisions` ("named for Adrian's attention at gate 5.3") | 4 `TimeoutStartSec=300`; 6 the `Sweep not working` section; 8 the dead job's line without "since"; 9 whether a read may take a bounded reading (= OP 4, and `## Out of scope`); 15 module names `systemd-units.ts`; 16 the T-04 import scan of direct imports (= OP 1) |
| R-032 | `plan.md` → `## State`; `ticket.md` → `## Out of scope` | Decision 17's new test knob `LIMEN_LINGER_DIR` (State); the registry rewrite that drops the alerts' ACL, "R-033's open point 5, for gate 5.3" |
| R-034 | `ticket.md` → `## Decisions` | 2 the unit's `PATH` is the installer's; 3 the task and wake words (= `outcome.md` → `## Words for gate 5.3`); 5 `owedWake` on the job whose wake is owed; round 1: "For gate 5.3, unchanged: the words for a `null` reset until R-059 …, and `outcome.md`'s open points 4–6" |
| R-034 | `outcome.md` → `## Open points` | OP 7 (a past resume time in a late owed wake) |
| R-035 | `ticket.md` → `## Decisions` (round 1) | note 1, the advisory's receipt: "Q-43 …, an open point for gate 5.3"; resolved: D-092 → R-036's note |
| R-036 | `outcome.md` → OP 3 (= `ticket.md` F3) | a pending tool with no child process can now stall |
| R-037 | `ticket.md` → `## Decisions` ("Items 1, 2, 8 and 9 are named") | 1 the commit built in a temporary index, hooks see the working tree before the close; 2 three hooks, `post-commit` not run; 8 `HOOK_REJECTED`, `environment`; 9 land's `irreversible` mark goes to R-103 |
| R-037 | `outcome.md` → `## Deviations from the ticket` 1 (= `ticket.md` Decision 17's `CHECKOUT_BEHIND`) | "The new texts for gate 5.3" (section 5) |
| R-037 | `outcome.md` → `## Open points` | OP 5 (`commit.gpgSign`), 6 (`HOOK_REJECTED` output) |
| R-087 | `ticket.md` → `## Decisions` ("Items 1, 2, 4 and 10") | 1 the wrapper keeps `HERDR_*`; 2 the fixed list of names; 4 test mode as the marker `LIMEN_TEST_MODE`; 10 dropped names as a log line |
| R-087 | `outcome.md` → `## Open points` | OP 4 (gh keyring, = `ticket.md` F3), 7 (`~/.netrc`) |
| R-098 | `outcome.md` → `## Open points` | OP 2 (a0.2.0 records without `queueWait`), 6 (a rename) |
| R-101 | `ticket.md` → `## Decisions` ("items 2 and 4") | 2 the coordinator's tab skipped by the label check; 4 `abandonedMarker` and `abandonEvidence` |
| R-101 | `outcome.md` → `## Open points` | OP 3, 4, 5, 6 |
| R-102 | `ticket.md` → `## Decisions` ("items 1–3") | 1 the refusal's sentence; 2 the refusal file `.limen/refusals/<pid>-<born>.json`; 3 the status line names the process (1 and 3 = OP 1 = `## Words for gate 5.3`) |
| R-102 | `outcome.md` → `## Open points` | OP 2, 7, 9 |
| R-103 | `ticket.md` → `## Decisions`, marked (A) | 2 the land lock `.land.lock`; 5 the branch's delete by `unlandedBranches`, a kept one a line; 6 `CHECKOUT_BEHIND`'s `next` `limen land <id>`; 9 retire keeps a `land` without `cleaned`; 15 the help's `kind:` line; 16 land's refusal codes; 18 the steps' line; 21 the shared tab close and its wordings; 23 the 60 s bound and the mark's form; 25 `MERGE_FAILED` exit 4 (= `outcome.md` Deviation 1, "named here for gate 5.3") |
| R-103 | `outcome.md` | `## New codes and wordings` (Decisions 15, 16, 18, 21, 23; section 5); OP 6 ("for Adrian at gate 5.3"); `ticket.md` → `## Out of scope` repeats R-037 OP 5 (`commit.gpgSign`) |

(A) outside `## Decisions` (each `ticket.md`'s quote of D-097, "items marked (A) were named for Adrian's attention and
stand", so settled by D-097): R-034 D-097 (5) (b) twice, (d), (f), (i), (k); R-101 D-097 (4) (c), (d), (g); R-102
D-097 (6) (c).

`plan.md` → `## State` lists for gate 5.3: R-027 OP 4–8; R-028 OP 1, 2, 4, 6, 14, 15 and R-027's sentence; R-029 OP 4;
R-031 OP 1–8; R-032 OP 1–6 and Decisions 15, 16, 17's knob; R-034 nothing; R-035 OP 1–7; R-036 OP 1–4; R-037 OP 1–6
and its new wordings; R-087 OP 4, 7 and Decisions 1, 2, 4, 10; R-098 OP 2–7; R-101 OP 3–6 and Decisions 2, 4; R-102
OP 7, 9 and `## Words for gate 5.3` (OP 5, 6 "for Adrian"); R-103 `## New codes and wordings`, Deviation 1, OP 3–6
and the (A) items. Other items for Adrian in State, not tagged gate 5.3: R-029's leaked test folders in the gate's
cache (`r029-head-*`, about 640 `limen-live-*`/`limen-tree-*`, 84 MB; `rm` is denied to sessions); R-103's
recommendation that `check.mjs` checks every test file a `ready` or `active` criterion names exists (a `Tools:`
commit).

## 3. Open points

Mark (from the point's own text): (a) needs Adrian's decision (named for him or gate 5.3, an option or
recommendation still to choose, or a gap that names no ticket and no acceptance; D-092 sends such notes to the
stage's gate); (b) names a later ticket or stage that takes it; (c) closed, accepted, kept by a decision or Risk, or
no change. "Later" names a note in `plan.md` → `## Tickets` or a later decision that took the point.

R-026 (6 bullets)

| # | M | Point | Recommendation / later |
|---|---|---|---|
| 1 | b | `SECURITY.md:9` still describes the escaped-descendant check; "the file is R-081's" | later: R-081 note |
| 2 | a | `limen show` and `status --all` still print a job folder's `cleanup` file, "which nothing writes any more" | — |
| 3 | a | the T-26 launch scan sees `node:child_process` only; a start via `platform.startInScope` outside `launcher.ts` "would pass it" | — |
| 4 | b | R-050: `ownCgroup` honours `LIMEN_CGROUP` | read `/proc/self/cgroup` "or accept that as A-029's accepted risk"; later: R-050/R-087 note (knobs in test mode only) |
| 5 | b | "R-087 keeps `LIMEN_CGROUP` … and the user-bus variables in the job's allow-list" | — |
| 6 | c | systemd-run's error text is not kept; "`limen init`'s probe names it" | — |

R-027 (8 bullets)

| # | M | Point | Recommendation / later |
|---|---|---|---|
| 1 | b | until R-032, a reap inside `status`, `show` or the tick waits up to the grace and 1 s per live scope | — |
| 2 | b | R-028 sets A-020's 10 s and gives stop and the exhaustion the scope's TERM | — |
| 3 | c | `ownerCheck` caches a dead identity's reason; "the group path never trusts that cache" | — |
| 4 | a | finding 4, "for gate 5.3": `is-active` exit 3 also reads a `deactivating` scope as gone | later: R-032 note; step 3.1 reads `deactivating` as not ended |
| 5 | b | finding 5, "for R-028's implementer": the stop's Herdr deadline lies in the past at a knob of 500 ms or less | — |
| 6 | a | finding A, "for gate 5.3": a reaper inside the reaped job's own scope TERMs itself; "R-032 moves reaping into the seat's sweep" | later: R-032 note |
| 7 | a | finding C, "for gate 5.3": the reaper signals the unit the record names; "the exposure is not new" | — |
| 8 | a | round 2, "for gate 5.3 (wording)": `scope <unit> ended after TERM; SIGTERM failed: <detail>` | — |

R-028 (15 bullets; 14–15 "From `review.md` → Round 3 …, for gate 5.3")

| # | M | Point | Recommendation / later |
|---|---|---|---|
| 1 | a | round 1 finding 5, "for gate 5.3": a stop of a `starting` job and a group's reserved slot write `stopped` with no `stopRequested` | — |
| 2 | a | the exhaustion's TERM still writes `<reason>; sending TERM` before its call and drops its result | later: R-029 note |
| 3 | c | the `was gone` and `not permitted` lines have no test; a plant cannot produce them | — |
| 4 | a | round 2 finding 3, "for gate 5.3": a TERM during the setup's prune step reaches no `--prepare` | — |
| 5 | c | G1: a stop whose write lands after the wrapper's read ends as the exit decides: "the engine finished first (A-019)" | — |
| 6 | a | G1: the end gate's wait has no bound; a leaked knob holds every end until `limen stop` | later: R-087 note |
| 7 | c | G2: the `engine error:` form has no test; "cannot be ordered by events in a plant" | — |
| 8 | c | R-027's finding 5: the Herdr deadline stays; "the 10 s grace gives 9.5 s" | — |
| 9 | a | a scope-wide TERM: an exit 143 handled before the wrapper's handler would end kind `exit`; "no test shows the order" | — |
| 10 | b | the new stop test could be `stop`'s success test and leave the D-076 list (R-083) | — |
| 11 | b | `docs/jobs.md`'s "Neither state is approval" names two states under a table of three (R-081) | — |
| 12 | b | `runInternalJob` keeps two "split pending" suppressions (R-082, R-083) | — |
| 13 | c | a second `limen stop` replaces the first one's `stopRequested`; the winner ends with the reason the record holds | — |
| 14 | a | round 3 note 1: `LIMEN_END_GATE`, if leaked, holds every end without bound; `limen status` names no test knob | "A bound on the gate's wait, or a `limen status` warning for a set test knob"; later: R-087 note |
| 15 | a | round 3 note 2: G1 takes the TERM's flag on `close`, so a TERM between `exit` and `close` still counts | "taking it on `exit` would close that window"; later: R-029 note |

R-029 (1–4)

| # | M | Point | Recommendation / later |
|---|---|---|---|
| 1 | b | the refusal file lives in `.limen/coordinators/`, which R-102 removes; R-102's note keeps a place (with round 3's two notes) | later: R-102 Decision 2 |
| 2 | b | `read-only-violation` (R-045) and `quota-exhausted` (R-034) "still have no detector and no test" | — |
| 3 | b | a status line can pass 100 characters; "R-073 carries T-10" | — |
| 4 | a | "For Adrian at gate 5.3": "refusal" names a command's exit-1 refusal and a guard's BAD_DATA | "another name for it is a naming decision" |

R-030 (5 bullets)

| # | M | Point | Recommendation / later |
|---|---|---|---|
| 1 | c | T-28 (5): the main session added the real tab-close check to step 3.6 | — |
| 2 | c | `templates/.history/agents.md` dates the new hash 2026-11-22 | — |
| 3 | b | `prune.ts`'s `--dry-run` usage refusal is an untyped `Error` ("R-032's command") | later: R-101 cut `limen prune` |
| 4 | b | "To R-031's notes" (D-088): the nested-repository test reads only the gitlink's commit and status | — |
| 5 | b | "To R-032's notes" (D-088): gitlink with no nested `.git`, a candidate with no commit, a gitlink path with a tab | — |

R-031 (1–8)

| # | M | Point | Recommendation / later |
|---|---|---|---|
| 1 | a | finding 3: `removeUnstartedRecords` still deletes; "Adrian confirms that reading or gives the path a ticket" | later: D-093 confirmed the reading; R-032 note |
| 2 | a | finding 5: `ticket done` writes markers after its commit; a failed marker write leaves jobs unmarked, a rerun refuses `NO_ACTIVE_TICKET` | later: R-103 note |
| 3 | a | finding 8: retire renames without the job's own lock; "R-032 makes retire a timer step" | later: R-032 note |
| 4 | b | a job retired before its owed wake or alert loses them; "R-032 … may order it after the owed wakes" | — |
| 5 | b | the poller's `reconcile` keeps two "split pending" suppressions (R-082, R-083) | — |
| 6 | b | a failed sync in retire exits 1 `UNTYPED` "until R-032 and R-082" | — |
| 7 | a | round 3 note 1 (Q-42): the poller reads record, then `result` and `log` without a lock | later: Q-42 → D-092 → R-032 note |
| 8 | a | round 3 note 3 (Q-42): `abandonedOf` names two functions | later: R-032 note; R-101 Decision 4 renames them |

R-032 (1–6)

| # | M | Point | Recommendation / later |
|---|---|---|---|
| 1 | a | Decision 16, "for gate 5.3": the read commands' transitive imports still reach state-transition functions (paths listed) | "The read test is the behavioural guarantee meanwhile" |
| 2 | b | `endDueRules` still runs before every command; "it goes with the seat rules (… R-102)" | — |
| 3 | b | `diff` and `open` still record their tab's place (R-103), so `--help` shows no kind | — |
| 4 | a | `limen status`'s bounded probes grew by two 3 s probes, "the waits that `## Decisions` 9 leaves to gate 5.3" | — |
| 5 | a | `--install` inside a job's scope is not refused | — |
| 6 | a | round 3 note 6 ("no planned ticket rewrites the installer"): `--uninstall`'s tolerance of a failed disable | — |

R-033 (1–7)

| # | M | Point | Recommendation / later |
|---|---|---|---|
| 1 | c | "Closed": `setfacl`, `systemd-analyze`, `systemctl` rows in `## System requirements` | — |
| 2 | c | "Closed by F4": the install refuses uid 0 and an account whose home holds a Limen registry | — |
| 3 | a | the real-path check and `setfacl` are two steps, so a link swap between them could move a right; "root runs the install by hand, rarely" | — |
| 4 | a | a seat umask of 027 or 077 would hide job folders and records from the alerts | — |
| 5 | a | `limen init`'s `atomicWrite` drops the registry's ACL until root runs the install again | "A registry writer that keeps the file's ACL would remove that step"; R-032 `ticket.md` names it for gate 5.3 |
| 6 | a | "Still open": when the units step succeeds and the next tag fails, the new units stay loaded | — |
| 7 | b | "To R-035" (D-090): first read after the first run, a rerun after `limen init`, an unreadable project counted once | — |

R-034 (1–9)

| # | M | Point | Recommendation / later |
|---|---|---|---|
| 1 | c | "Closed by F8 (D-100)": a group member's overdue `quota` failure rings | — |
| 2 | c | a resume refused for a lasting reason fails every run (`Sweep not working`) until a person resolves it; "F8 now rings `failed:quota`" | — |
| 3 | c | a damaged record fails each resume of its project; "round 1 kept it, rejected note (b)" | — |
| 4 | a | a parent with a `null` model resumes on `defaultModel()` (`ticket.md`: "For gate 5.3, unchanged … open points 4–6") | — |
| 5 | a | the service's `PATH` line is as long as the installing `PATH` (same) | — |
| 6 | a | a manual `limen continue` of a resumed job has no `quotaAttempt`, so its count starts from 1 (same) | — |
| 7 | a | "For gate 5.3": an owed wake released after the resume names a resume time already past | — |
| 8 | b | "For R-082's ratchet": `observe` and `limenWake` keep "split pending" | — |
| 9 | b | "For the next ticket that edits these tests": two comments cite rounds without "R-034" (no ticket number) | — |

R-035 (1–7)

| # | M | Point | Recommendation / later |
|---|---|---|---|
| 1 | a | one advisory per job and session, so a later stall advisory is lost; "`hook/wake.ts` is outside this ticket" (Q-43) | later: Q-43 → D-092 → R-036 note; R-036 made receipts per source |
| 2 | b | units outside the user manager are not ranked, "until R-050 gives it a unit" | — |
| 3 | b | `runInternalJob`'s "split pending" stays; "R-082's ratchet" | — |
| 4 | a | `seat queue` does not show the thresholds, `show` does not show `queueWait`; `stats` "is out of scope (M-06)" | — |
| 5 | c | four comment lines wider than 120 columns; "this round leaves them" | — |
| 6 | b | the gate file is writable by the agents' account ("out of scope: stage 5") | — |
| 7 | c | after a revert, a record with `queueWait` is `BAD_DATA`; the rollback "is the snapshot of `## Deployment` 0.1" | — |

R-036 (1–4)

| # | M | Point | Recommendation / later |
|---|---|---|---|
| 1 | c | `runInternalJob` keeps its two "split pending" suppressions; "the function got shorter" | — |
| 2 | c | old note texts stay in two tests as planted text; "no code writes them any more" | — |
| 3 | a | "For gate 5.3": with `hadChild` gone, a pending tool with no child process can now stall; "the ticket accepts it (Risk 2, A-059's Decision)" | step 3.8's trial records show it |
| 4 | b | round 3: the end's sample awaits its log line with no catch; "It went to R-082's notes" | — |

R-037 (1–6)

| # | M | Point | Recommendation / later |
|---|---|---|---|
| 1 | c | Decision 19's check: "no reader reads an old folder … or fails on it" | — |
| 2 | a | a `commit-msg` hook that empties the message gives an empty-message commit; "no hook of the seat's projects is known to do that" | — |
| 3 | a | whether the seat's projects have hooks that read staged files from the working tree is unknown | "a deployment step that lists `core.hooksPath` and `.git/hooks` of both projects would tell" |
| 4 | c | `TicketClose.committed` equals `head !== null`; "it stays" | — |
| 5 | a | "For gate 5.3": `git commit-tree` ignores `commit.gpgSign`, so signing projects get unsigned closing commits | read `git config --get commit.gpgSign` in both projects before `a0.3.0` (not in `## Deployment` at HEAD) |
| 6 | a | "no change": `HOOK_REJECTED` carries up to 20 lines of a hook's output; "an observation for the gate 5.3 summary" | — |

R-087 (1–7)

| # | M | Point | Recommendation / later |
|---|---|---|---|
| 1 | b | `runInternalJob` keeps two `biome-ignore` lines ("T-27 (1), the stage 6 condition") | — |
| 2 | c | `PWD` reaches a test job from the tests' script; the real `systemd-run --scope` adds none | — |
| 3 | c | in-process tests may leave `LIMEN_TEST_MODE=1`; a later test "sets `LIMEN_TEST_MODE` itself" | — |
| 4 | a | "For gate 5.3 (F3)": `GH_CONFIG_DIR` hides only gh's files; a keyring login would still be found | "Step 3.10 shows which" |
| 5 | a | F2 (`GIT_ASKPASS=`) "is a night default …, for Adrian to confirm" | — |
| 6 | c | stricter text in `SECURITY.md:5` and `agent-setup.md:137`: "both now say it" (the main session's text) | — |
| 7 | a | "For gate 5.3": `~/.netrc` would give git a credential through libcurl | text fixed; step 3.10 checks; "G2's accepted risk until stage 5" |

R-098 (1–7)

| # | M | Point | Recommendation / later |
|---|---|---|---|
| 1 | a | night default F5: run parts less the queue wait (b), so every B.3 land prints the parts as `—` | "The main session kept (b) …, and Adrian chooses"; option (a) described |
| 2 | a | "For gate 5.3": records of a0.2.0 written before `queueWait` read as queue 0, if a project ran jobs under a0.2.0 | — |
| 3 | a | M-04 counts a refused `limen land` as a land | "the bash result's `isError` would tell it apart" |
| 4 | a | a land through another wrapper (`npx limen land`) is not found; "the seat's coordinator calls `limen`" | — |
| 5 | a | M-04's "turn after a land" can belong to the land's own run, so its cache write can read low | — |
| 6 | a | two private `coordinatorLines` (T-25), unseen by the gate | "A rename, for gate 5.3" |
| 7 | b | the `Coordinator (…)` span prints UTC days, compared with local days; the marker's second form "goes to R-103's notes" | later: R-103 Decision 22 |

R-100 (1–5)

| # | M | Point | Recommendation / later |
|---|---|---|---|
| 1 | b | `claimRecovery` keeps "split pending"; "R-082's ratchet" | — |
| 2 | b | the ratchet `ERRNO_TYPED` (17 lines) "is R-082's to bring to zero" | — |
| 3 | c | another spelling of the same rule passes the text scans; "The judgment stays with the reviewer." | — |
| 4 | b | `JOB_FOLDER_READERS` checks only named readers; the wake's listings "are R-051's (D-080)" | — |
| 5 | c | the gate's exit code was read through `tail`; "the main session's own run counts" | — |

R-101 (1–7)

| # | M | Point | Recommendation / later |
|---|---|---|---|
| 1 | c | `github poll` tests fail outside the gate's `TMPDIR`; "Not caused by this change." | — |
| 2 | a | "Decision 7 (`LIMEN_SETUP`) is a night default for Adrian to confirm." | — |
| 3 | a | "For Adrian at gate 5.3": an unregistered worktree-root folder that holds a `.git` is still deleted | options (a)–(c); recommended (a): every such folder moves to `.limen/archive/unregistered/` |
| 4 | a | "For gate 5.3 (… guessed)": a lock after a retire can leave an empty `.limen/jobs/<id>/`, failing the daily prune until the month changes; "Not reproduced" | — |
| 5 | a | "For Adrian at gate 5.3": the `seat sweep` help summary is the implementer's wording and omits the daily tab close | — |
| 6 | a | "For gate 5.3": the daily prune's moves still wait 60 s for a job's lock | options; recommended (a): one attempt, as retire |
| 7 | b | "For R-103": the leftover-tab close asks Herdr about every recorded tab each day, no total bound | later: R-103 Decision 23 (mark, 60 s) |

R-102 (1–9)

| # | M | Point | Recommendation / later |
|---|---|---|---|
| 1 | a | "For gate 5.3: the words of `## Words for gate 5.3` (Decisions 1 and 3)" | — |
| 2 | a | "For gate 5.3": a BAD_DATA line shows quotes as `\"` (`shownField`) | options; recommended (a): keep it |
| 3 | a | a temp file left by a refusal write that died mid-write stays in `.limen/refusals/`; "Not reproduced" | — |
| 4 | c | after deployment `.limen/coordinators` is a `Leftover files` entry; old files "are not moved (`## Migration`)" | — |
| 5 | a | "For Adrian, on the laptop": six test refusals in the checkout's ignored `.limen/refusals/` | "Adrian removes `.limen/` at the repository root by hand" |
| 6 | a | "For the main session": no check finds a test that writes into the checkout | options; recommended (b): `gate.mjs` compares ignored files (a `Tools:` commit); State: for Adrian |
| 7 | a | "For gate 5.3": the refusal writer follows a link in place of `.limen/refusals` | options; recommended (a): the writer refuses it |
| 8 | a | "For the main session": a test's assertion message still says "registered" | options; recommended (a): leave it |
| 9 | a | "For gate 5.3": a start-queue entry is live on its pid and job folder alone (already at HEAD) | options; recommended (a): a ticket that checks the folder against the project's jobs |

R-103 (1–6)

| # | M | Point | Recommendation / later |
|---|---|---|---|
| 1 | c | "Risk 3 holds": a closing subject edited by hand is not found, and the close runs again | — |
| 2 | c | a tab a person renamed is neither closed nor marked; "Decision 23 (a) marks only a closed or unlisted tab" | — |
| 3 | c | G1: a marked record whose `landed.sha` carries a closing subject is recorded `closed` by it; "The case stays as `ticket.md` → G1 decides" | — |
| 4 | b | `closeStep`'s comment still says "the migration's rule" | fixed "by the next ticket that touches `src/job/landing.ts` (R-054 or R-071)" |
| 5 | b | G1's filter runs once per earlier land | "test the job's id first, in the same next ticket" |
| 6 | a | a rerun on a record whose `merged.sha` Git no longer holds ends exit 4 each time; "for Adrian at gate 5.3" | "a merged commit Git does not hold counts as no closing commit", in the same next ticket |

## 4. Unmeasured (`outcome.md` → `## Unmeasured`, every item)

| Ticket | Item | Points at |
|---|---|---|
| R-026 | peak CPU and memory per job scope | M-09; step 3.8 |
| R-026 | real systemd behaviour (cgroup, kill of a detached process, Herdr restart, no lingering) | steps 3.1, 3.2, 3.7, 3.8; no M-NN |
| R-027 | real `is-active` and `kill --signal=SIGTERM`, the reap of a wrapper killed alone | step 3.2; no M-NN (State says "M-11, M-10 (step 3.2)") |
| R-028 | Pi's exit 143, a real `stop`, a TERM to the wrapper alone, a real OOM kill | step 3.8 |
| R-028 | kinds `signal` and `oom` in `limen stats` | M-11 (State adds M-10) |
| R-029 | failure kinds of the seat's next failures | M-11; B.3, 9.1 |
| R-029 | a `rate_limit_event` for the 5-hour and weekly limit; the real text's zone | step 3.4 |
| R-030 | gate run time (35 tests) and the Git reads per spawn and prune | M-10; stage close |
| R-030 | lead time incl. resolving unlanded jobs | M-06; 9.1 |
| R-030 | how many old jobs block spawns ("not a metric") | step 3.6 |
| R-031 | `limen stats` over the archive | M-03, M-06, M-07, M-11; B.3, 9.1 |
| R-031 | the marker step of `limen migrate` on the seat | step 3.6 |
| R-031 | G5: synced archive names across a real crash | no metric |
| R-031 | G1: the poller's GitHub replies for a retired job | no M-NN |
| R-032 | `is-active` prints `deactivating` (exit 3) | step 3.1 |
| R-032 | `cgroup.events` `populated` read by root under the user manager | step 3.1 |
| R-032 | `systemd-analyze verify` of real units, install with lingering, first journal run, `herdr is not available` | step 3.1 |
| R-032 | `userUnits` from the timer's service and a real SSH or Herdr shell | step 3.1 |
| R-033 | real systemd side, ACLs, first real run, the phone | step 3.3; no metric |
| R-034 | share of `quota` and `quota-exhausted` ends after a0.3.0 | M-11; B.3, 9.1 |
| R-034 | resumed job from the sweep's service and PATH, a real limit turn's `errorMessage`, the owed wake, the link's removal | step 3.4; no M-NN |
| R-035 | start-queue waits (`queueWait`) | M-09 |
| R-035 | real cgroup layout, the wake with the diagnosis, the queue alert, `failed:queue` | step 3.8 |
| R-036 | peak CPU share of real job scopes (`cpuPeakPercent`) | M-09 |
| R-036 | a real `sleep 300` ends `stall`; idle CPU below 2 %; the detached busy loop | step 3.8 |
| R-037 | none ("None of M-01–M-13 measures the closing commit"; the projects' hooks stay "an open point for the deployment") | — |
| R-087 | gate run time (15 tests more) | M-10 |
| R-087 | `env`, `git credential fill`, `gh`, the user bus, the end wake, the dropped-names line on the seat | step 3.10 |
| R-098 | M-03, M-04, M-06, M-07 | B.3 with B.4 (before), 9.1 (after) |
| R-100 | none ("every change is checked by a test here") | — |
| R-101 | the sweep's unit reaches Herdr; real `tab get` label | step 3.9; no M-NN |
| R-101 | first daily run with many leftovers inside `TimeoutStartSec=300` | seat; no M-NN |
| R-101 | the coordinator's manual (size; whether it still names `prune` or `close`) | M-01, M-05 |
| R-102 | `limen rule` refuses, no `limen rule timer`, `~/.limen/rules/` | step 3.5; no M-NN |
| R-102 | a guard refusal under real Pi reaching `.limen/refusals/` and `limen status` | seat; no M-NN |
| R-102 | the coordinator's manual | M-01, M-05 |
| R-103 | the tab close on the real Herdr (land, `ticket done`, `abandon`, the sweep's mark and bound) | step 3.9; no M-NN |
| R-103 | the coordinator's manual; whether it reruns a land from its `next` | M-01, M-05 |

## 5. New codes and wordings listed for the gate

| Ticket | Section | Count |
|---|---|---|
| R-034 | `outcome.md` → `## Words for gate 5.3` (Decision 3) | 12 texts: the resume's task 1, the wake's stop section 4, the wake's handoff and instruction 1, `templates/agents.md` `:68` and `:62` 2, the sweep's lines 4 |
| R-037 | `outcome.md` → `## Deviations from the ticket` 1 ("The new texts for gate 5.3") | 4: `CHECKOUT_BEHIND` and its message, the `HOOK_REJECTED` message, `kept <folder>: …`, land's failure prefix |
| R-102 | `outcome.md` → `## Words for gate 5.3` (Decisions 1, 3) | 2 bullets: the `limen rule` refusal (`REMOVED`); the status line (two forms, `<pid>` `unknown`) |
| R-103 | `outcome.md` → `## New codes and wordings` (Decisions 15, 16, 18, 21, 23) | 23 entries: 12 land refusal codes (table), 5 other codes (`HERDR_UNAVAILABLE`, `HERDR_FAILED`, `HUNK_FAILED`, `MARKER_OUT_OF_ORDER`, `MERGE_FAILED`'s class), 6 wording bullets (15 texts) |

## 6. Findings closed (`plan.md` → `## Tickets` → Sources)

| Ticket | A-NNN | Other sources |
|---|---|---|
| R-026 | A-029, A-052 | T-43 |
| R-027 | A-005, A-056 | — |
| R-028 | A-020, A-052 | — |
| R-029 | A-016 | E-9, T-31, T-32, D-055, D-095 |
| R-030 | A-001 | — |
| R-031 | A-002 | §6 |
| R-032 | A-024, A-017 | T-04, T-18, §6, D-045 |
| R-033 | A-066, A-054 | T-18, D-084, D-085 |
| R-034 | A-016, A-068 | §6, D-094, D-097, D-100 |
| R-035 | A-036 | — |
| R-036 | A-059 | — |
| R-037 | A-021, A-057 | T-38, D-094 |
| R-087 | A-004, A-061 | E-4, D-017 |
| R-098 | A-078, A-037 | §2, D-072, D-098 |
| R-100 | — | T-25, D-080 |
| R-101 | A-024, A-002 | T-18, T-28, D-092, D-094, D-096, D-097 |
| R-102 | A-010 | T-42, D-094, D-097 |
| R-103 | A-021 | T-04, T-18, T-28, T-38, D-092, D-094, D-096 |

Distinct: A-001, A-002, A-004, A-005, A-010, A-016, A-017, A-020, A-021, A-024, A-029, A-036, A-037, A-052, A-054,
A-056, A-057, A-059, A-061, A-066, A-068, A-078. Shared by two tickets: A-002 (R-031, R-101), A-016 (R-029, R-034),
A-021 (R-037, R-103), A-024 (R-032, R-101), A-052 (R-026, R-028).

## 7. Deployment steps of stage 3 (`plan.md` → `## Deployment` → After stage 3 (a0.3.0))

| Step | Title (one line) | Tickets named |
|---|---|---|
| 3.0 | Deploy a0.3.0 by 0.1–0.3 with the full SHA from gate 5.3 | — |
| 3.1 | `limen seat sweep --install` with lingering; timer active, journal `ok`, no `limen-prune` timer; R-032's engine facts | R-032 |
| 3.2 | `systemd-run --user --scope true` from Herdr; a trial job in its scope; a wrapper killed alone is reaped once its scope is gone | R-026, R-027 |
| 3.3 | Alerts: account names, the alerts account, the ntfy topic, `seat/alerts.ts install`, the phone | R-033 |
| 3.4 | At the next real 5-hour limit: `quota` with a reset, one resume, the rate-limit line, the owed wake; remove the `quota-resume.ts` link before a0.3.0 | R-029, R-034 |
| 3.5 | `limen rule` refuses; no `limen rule timer` runs; `~/.limen/rules` may be deleted by hand | R-102 |
| 3.6 | `limen status` lists finished jobs with unlanded work; `continue` or `abandon`; abandon closes the tab; the marker migration's report | R-030, R-031 |
| 3.7 | Reboot test: jobs survive a Herdr restart | R-026 |
| 3.8 | Scope readings and `cpuPeakPercent`; `sleep 300` ends `stall`; stop and TERM ends; queue diagnosis and `failed:queue` | R-026, R-036, R-028, R-035 |
| 3.9 | Land's `cleaned` closes the job's Herdr tabs; the sweep's daily step closes a leftover tab from its unit | R-103, R-101 |
| 3.10 | A trial job per project with the allow-listed environment; credential checks; the dropped-names line | R-087 |
| 3.11 | A GitHub ruleset on `main` forbidding force pushes and deletion, before the projects resume | — (§7 D1, D-012) |

Not in a 3.x step: R-037 and R-100 (Seat column `—`), R-098 (Seat column B.3, B.4: B.3's a0.3.0 part follows the tag
and B.4's copy). Steps 0.1–0.7 apply to every tag.

## 8. Night questions (`adrian-rebuild/.night/questions.md`)

15 questions (Q-1–Q-13, Q-42, Q-43); none open. Q-11, Q-12 and Q-13 keep `Status: open` in their first line, but each
ends with `Resolved: plan.md → D-065`; Q-42 and Q-43 (stage 3) are resolved by D-092. The night of D-102 wrote no
question.

## Counts

| Category | Total |
|---|---|
| 1. Night defaults | 78 (night of D-091: 75, all confirmed by D-093; night of D-102: 3, unconfirmed: R-087 F2, R-098 F5, R-101 Decision 7) |
| 2. Items for gate 5.3 or (A) in `## Decisions` | 69 distinct in 14 tickets (1 resolved: R-035 note 1); plus 10 (A) outside `## Decisions`, settled by D-097; State's gate lists name 63 open points of 13 tickets |
| 3. Open points | 126 in 18 `outcome.md`: (a) 61, (b) 35, (c) 30; 12 of the (a) later went to a stage-3 ticket's note |
| 4. Unmeasured | 38 rows: 36 items in 16 tickets, R-037 and R-100 none |
| 5. New codes and wordings | 4 sections, 41 entries (R-034 12, R-037 4, R-102 2, R-103 23) |
| 6. Findings (A-NNN) | 27 references, 22 distinct; R-100 none |
| 7. Deployment steps | 12 (3.0–3.11), 10 naming tickets; 15 tickets named |
| 8. Open night questions | 0 of 15 |
