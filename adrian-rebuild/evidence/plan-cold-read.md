<!-- PL: Wyniki dwóch cold readów planu z etapu 4 przebudowy. Pierwszy: świeży subagent dostał plan.md i dwie definicje
subagentów i zgłosił 35 uwag (brak podstawy, niejasność, sprzeczność, kolejność, brak następnego kroku, spójność
definicji); drugi objął uzupełnienia z bramki 4 (D-011: koszt etapów, wznowienie projektów, praca nocna, polecenia)
i zgłosił 22 uwagi. Plik zapisuje każdą uwagę w skrócie i jej rozstrzygnięcie; numery ticketów pierwszego są z commitu
cdf3e78. Stan: wszystkie uwagi rozstrzygnięte, dwie przeszły jako pytania Q4 i Q5 do Adriana. -->

# Cold read of the plan (rebuild stage 4)

2026-11-17. A fresh general-purpose subagent read only `adrian-rebuild/plan.md`,
`.claude/agents/rebuild-implementer.md` and `.claude/agents/rebuild-reviewer.md` (z. 39) and listed what a reader
cannot understand or verify from them. Categories: 1 no stated basis, 2 unclear or undefined, 3 contradiction, 4 order,
5 next step unclear, 6 inconsistent subagent definitions. "Fixed" means the plan or a definition now says it; "other"
means the remark was settled another way, with the reason.

Ticket numbers below are those of the plan at commit `cdf3e78`. At gate 4 (D-008) a new R-012 was inserted and the old
R-060 merged into it, so R-012–R-059 of this file are R-013–R-060 of the current plan.

| # | Cat. | Remark (short) | Resolution |
|---|---|---|---|
| 1 | 1 | R-001 cites A-042 with no visible link to leftover files | fixed: note R-001 quotes A-042's decision (leftover listing, `init --drop-leftovers`) |
| 2 | 1 | "+ 10 %", "5 minutes after the reset", "one request per 2 minutes" have no source | fixed: T-09 (M-13), A-010 and A-016 (3.4), A-047 (5.18) |
| 3 | 1 | "41 of 49 commits" and "142 jobs" without a source; history scope unclear | fixed: 2.3 names T-33 and gate 2 §1 Q1, and the history of both projects (also note R-023); other: "41 of 49" stays, because it sits in the verbatim copy of §2 (D-003), and `audit.md` gate 2 §1 holds the count |
| 4 | 1 | Gate 1 is never explained | fixed: `## Terms` and `## State` say rebuild stage 1 has no gate |
| 5 | 2 | Two stage numberings | fixed: `## Terms` defines rebuild stage N and plan stage N, 5.N, and which sections use which; the new text writes "rebuild stage N" |
| 6 | 2 | Many terms undefined (seat, Herdr, `rebuild-base`, z. N, T1, coverage rule, published copy, survey ticket, keeper, `jg` cue, registers, audience line, fixed judgment, `needs-adam`, Max window, "rejected / fix", §7 D1, A-030′, Q9) | fixed: `## Terms` |
| 7 | 2 | "Bell", "alerts account", "doorbell"; "replay" used twice | fixed: `## Terms` maps bell → alerts and doorbell → GitHub module; the measurement tool is now the "same-task runner" |
| 8 | 2 | "measured there" reads as the laptop | fixed: Measurement intro says who measures what, where |
| 9 | 2 | The stage exit names laptop checks; who tags is unclear | fixed: Stages intro separates the session's close (its own tag) from Adrian's deployment (root tags in `/opt/limen`) |
| 10 | 2 | R-010's test-line cap vs 6.1's cap | fixed: note R-010 (Limen's own `test/` cap vs the projects' optional `testLineCap`) |
| 11 | 3 | "stages 1–3 leave the cue and the prompts as they are" vs R-009 and the conventions | fixed: reworded; the `jg` cue never fired on the seat and system-prompt text does not reach the model (E-1) |
| 12 | 3 | B.3 "after a0.2.0" under "Before the first deployment" | fixed: section renamed "Measurements before", with the timing of B.3 |
| 13 | 3 | M-01 and M-10 have no step or owner; 9.1 lists M-12 | fixed: "Closing a stage" records M-01 and M-10; Measurement names the main session; M-12 left out of 9.2 |
| 14 | 3 | Unsettled engine points without a seat step (E-14, E-2, E-4, E-5) | fixed: 4.2 (E-14), B.1 (E-2 rewrite), 5.10 (E-4 compile cache), 4.3 (E-5 tools on demand) |
| 15 | 3 | 1.1 omits R-009 | fixed |
| 16 | 4 | R-086 needs a measurement that only runs after stage 9; 9.1 before 9.2 | fixed: M-13 is a laptop measurement at the close of stage 4 and in R-086; 9.1 deploys, 9.2 measures |
| 17 | 4 | R-043 switches modules off before `limen init` asks for them | fixed: the switches go into the existing `limits.json` (`src/project/limits.ts:7`); the migration lists modules in use; step 4.9 switches them on |
| 18 | 4 | Where settings live from a0.2.0 to a0.5.0 | fixed: note R-014 (the existing `.agents/limen/limits.json`; route variables until R-062) |
| 19 | 4 | Alerts account created before the account names are chosen | fixed: 3.3 chooses the names, 5.1 uses them |
| 20 | 4 | R-054 publishes `main` before land depends on conditions | fixed: Stage 5 states the land rule until R-071 and why publication is no weaker than today |
| 21 | 4 | R-047 relies on the `AGENTS.md` fallback without a dependency; double delivery | fixed: R-047 depends on R-039; note R-039, R-047 ties the fallback to isolated mode |
| 22 | 5 | No stage-close procedure; "gate summary" undefined | fixed: `### Closing a stage` |
| 23 | 5 | No rule for the next ticket; `active` never set; State not updated | fixed: protocol steps 1, 2 and 7 |
| 24 | 5 | No `ticket.md` template or criterion IDs | fixed: template in `## Agents`; `check.mjs` checks its title and sections |
| 25 | 5 | A failing gate after `DONE`; who fixes review findings; re-review; where Adrian's decision goes | fixed: protocol steps 4 and 6 |
| 26 | 5 | Where answers to Q1–Q3 go | fixed: State names D-008–D-010 and the sections each answer settles |
| 27 | 5 | The same-task ticket is only a candidate | fixed: note R-011 (the runner takes it as arguments; Adrian picks it before B.2, because the rebuild session has no access to the projects) |
| 28 | 5 | 3.4 waits for a real limit | fixed: 3.4 says nothing waits for it |
| 29 | 6 | The reviewer cannot check decisions it is not given | other: the rebuild prompt limits the reviewer to three paths, so `ticket.md` quotes every decision and engine fact the change relies on (template, both definitions) |
| 30 | 6 | Verdict undefined for a blocking non-proven finding or a not-met criterion | fixed: a blocking finding is always proven; PASS = all criteria met and no blocking finding |
| 31 | 6 | The implementer's git and edit bans have gaps (`add`, `restore`, `clean`; the checks that judge it) | fixed |
| 32 | 6 | The T-40 question names `limen ask` before it exists | fixed: from R-068 on; before it, any new wait for the owner is a finding |
| 33 | 6 | Running the gate might void a review | fixed: the reviewer definition says where the gate writes (ignored paths) |
| 34 | 6 | The implementer does not get `input/prompt.md`; what in `input/` is tracked | other: `prompt.md` is the main session's instruction file; the implementer gets its binding constraints as its rules, and the definition says `input/` is untracked |
| 35 | 6 | Only the reviewer declares `disallowedTools: Agent` | fixed |

# Second cold read: the gate-4 additions (D-011)

2026-11-17. A fresh general-purpose subagent read only `adrian-rebuild/plan.md` and checked the additions of D-011
(the cost and effect per stage, the resumption of the projects, the `Run` column, `## Commands`) against the rest of
the plan. It recounted the tickets, sizes, pair tickets, `Run` values and seat steps: all matched. Ticket numbers are
those of the current plan.

| # | Remark (short) | Resolution |
|---|---|---|
| 1 | The seat-step count includes N.0 without saying so; B.1–B.3 are in no row | fixed: intro says N.0 is counted; B.1, B.2 in stage 1, B.3 in stage 2 |
| 2 | The `day-after` legend leaves indirect dependencies open | fixed: "directly or through other tickets" |
| 3 | Row 3 claims escalations before `limen escalate` exists (R-069, stage 7) | fixed: job failures and long queue waits; escalations from stage 7 |
| 4 | Row 4 "answers in the owner's language" is no change (D-004) | fixed: the cue stops demanding English; the audience line names the language (T-13) |
| 5 | Row 6 says the round limit applies before bounded rounds exist | fixed: stored in stage 6, used from stage 7 |
| 6 | Terms in the rows without support ("8-hex token", "every minute", "30 s", `show --result`, `<FNNN>`, glossary) | fixed: each row cites its rule and ticket |
| 7 | Steps 3.1–3.3 "before the first spawn" vs the trial jobs of 0.6 and 3.2 | fixed: "before normal work resumes"; the trial jobs are the only earlier spawns |
| 8 | The rollback of 0.7 would erase the records of jobs run since the snapshot | fixed: 0.7 first copies `.limen/` aside to be kept, and restores the snapshot only for a format change |
| 9 | "One per project at most" has no source; quota-waiting jobs unclear | fixed: `maxJobs` 1 (A-014); a quota-waiting job is `failed` and resumes on the new version |
| 10 | The Max window term omits the laptop | fixed in `## Terms` |
| 11 | The split ignores pair tickets by day and the weekly limit; "the night run's log" undefined | fixed: pair tickets named; the weekly limit is open question Q5; the night mode's record named |
| 12 | "Also now" (prune timer off) is an action missing from State | fixed: State lists it |
| 13 | Resuming at a0.3.0 runs jobs with today's credentials and network until a0.5.0, unstated | fixed: stated in the section; the acceptance is open question Q4 |
| 14 | B.3 "deployed" vs "tagged"; how B.2 runs before any deployment | fixed: one wording; B.2 runs from a separate checkout of R-011's commit |
| 15 | `context-size.mjs` listed only for stage 4 | fixed: main-session row, from stage 4 at every close |
| 16 | `rm`/`mv` allowed only in stages 1 and 9, but other stages delete or move files | fixed: per-path entries in the every-stage row |
| 17 | Path entries "before the night run" vs tickets written one by one; who writes the settings | fixed: Adrian writes `.claude/settings.json`; the night's deleting tickets are written by day first |
| 18 | Relative paths vs a scratch directory outside the repo | fixed: `node_modules/.rebuild-review/` (ignored) |
| 19 | The allow-list cannot stop an implementer's commit or push | fixed: `review-guard.mjs snapshot --git` / `compare --git` around the implementer (tested) |
| 20 | No way to undo a void review; `tar -xzf` vs the "-f" ban; missing command strings; `install-hooks.sh`; network via push | fixed: `git restore --source=HEAD` + `git apply --include` procedure; the ban names `git push`; strings from the outcomes; `install-hooks.sh` listed; push named |
| 21 | No night variant of the protocol's "Adrian decides" | fixed: the night mode of the rebuild prompt governs; a stopped ticket and its dependents wait for the day |
| 22 | D-011 omits the two new dependencies; R-071's Seat is "—" though 7.5 names it | fixed |
