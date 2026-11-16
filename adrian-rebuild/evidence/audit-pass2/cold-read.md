<!-- PL: Zimny odczyt audytu Limena (`adrian-rebuild/audit.md`), zrobiony wyłącznie na podstawie samego dokumentu, bez otwierania kodu, plików dowodowych ani gita. Zawiera 41 uwag (twierdzenia bez dowodu, niejasności, niespójności, braki): najpierw dla znalezisk krytycznych i wysokich, potem dla mapy i tabeli hipotez, na końcu dla średnich i niskich, tabel i sekcji To verify. Celem jest sprawdzenie przed bramką 2, czy audyt sam uzasadnia i wyjaśnia to, co twierdzi; uwagi nie oceniają prawdziwości znalezisk ani trafności kierunków. Stan: wszystkie uwagi obsłużone przez sesję główną; tabela dyspozycji na końcu pliku. -->

# Cold read of `audit.md`

Scope: the document only. No code, evidence file or repository history was opened, so every remark is about what the
text itself supports, explains or contradicts.

## Critical and high findings

1. Where: `A-003 Severity`, `A-003 Scenario`, `A-007 Severity`
   - Kind: inconsistent
   - Remark: Both ratings (critical, high) assume the GitHub doorbell runs on the seat. Table A marks the doorbell "unknown usage … cut unless used", and reliability To verify bullet 5 asks whether the poller is enabled at all, tying the answer only to R-05/R-10. Neither finding says its severity depends on the doorbell being in use.

2. Where: `A-003 Scenario`, `A-004 Scenario`
   - Kind: inconsistent
   - Remark: Both scenarios state as fact that a job can read "the gh credential" or "the GitHub token" and that the engine loads the fork's `AGENTS.md`/skills from its cwd. Security To verify #4 still asks whether the gh credential is a plain file, and #1 and cost #7 ask what Pi loads from a PR-head worktree. That breaks the PL header's own rule that unproven claims go to To verify, not into findings.

3. Where: `A-003 Evidence`
   - Kind: unclear
   - Remark: The evidence shows the fork head being fetched (`github.ts:458`) and the reviewer prompt telling the reviewer to install and run suites. It does not show what starts a reviewer job at that head, and the scenario says "the coordinator starts a hosted reviewer". A reader cannot tell whether fork code runs on a fixed code path or only after a model decision, which matters for a critical rating.

4. Where: Findings intro (method paragraph) vs `A-003`, `A-007`, `A-008`, `A-011`, `A-015`, `A-016 Evidence`
   - Kind: inconsistent
   - Remark: The intro says critical and high candidates were backed with experiments on throwaway repos, but A-003 (critical) and A-007, A-008, A-015 and A-016 (high) cite no experiment or demo. A-011 leans on the "S-06 demo", which shows a shared hooks path and `git-common-dir`, not a job writing the canonical checkout or committing to its `HEAD`.

5. Where: `A-004 Evidence`, `A-006 Evidence` ("Also (D-06)")
   - Kind: claim without evidence
   - Remark: The quoted code adds `--approve`/`--auto-approve` only `if (profile.projectTrust)` / `if (profile.toolYolo)`, and the document never shows which job profiles set those fields. Even so, the A-004 title says "approvals bypassed" and A-006 says "Engines start with tool approval bypassed".

6. Where: `A-004` (no `History` field)
   - Kind: missing
   - Remark: The Fields paragraph says pass 2 adds `Status` and `History`, but critical A-004 has no History, and neither do 28 medium and low findings (e.g. A-017–A-022, A-036, A-062–A-067). Elsewhere the document writes "No source discusses …", so a missing field leaves the reader unsure whether the sources were searched at all.

7. Where: `A-001 Evidence` ("Also (D-01)"), `A-001 Scenario`, `A-001 Location`
   - Kind: claim without evidence
   - Remark: Two quotes have no source. The message that `limen continue` is said to print ("restored … only committed branch contents were recovered") has no file:line and no experiment output. The manual quote "Dead wrapper: … The branch and worktree survive." has no location in the finding; only Table 2 ties it to `templates/agents.md:224`. Location also lists `docs/seat/agent-setup.md:194`, and no sentence explains it.

8. Where: `A-001`, `A-002`, `A-012`, `A-013`, `A-014`, `A-017`, `A-019`, `A-035 Evidence` (experiment labels)
   - Kind: unclear
   - Remark: Experiment labels collide across passes:
     - `exp1-prune-dirty.sh` vs D-01's different "exp1";
     - `exp2-race.sh` (A-019) vs the land/review "exp2" (A-012, A-013, A-035);
     - `exp3-stale-lock.sh` (A-017) vs "exp3" (A-014).

     The scripts stay in a session scratchpad, and the document never says whether a run used the fake engine or a real one. Examples are the scripted `limen spawn $'commit\nerror\nsay partial'` and the reviewer's `FAIL a4abf89…` in A-013.

9. Where: `A-006 Title`, `A-006 Evidence`, `A-006 Severity` vs Table 2 row "Only the human pushes `main`" and security To verify #2, #8
   - Kind: inconsistent
   - Remark: The title says the rule "rests on a client-side hook", but no evidence shows that such a hook exists. Table 2 gives code enforcement as "none", and To verify #8 asks whether the hook is installed at all. To verify #2 also says "S-06 drops to medium" if `main` is protected server-side, yet A-006 states high with no condition.

10. Where: `A-007 Evidence`
    - Kind: unclear
    - Remark: "Only the trigger author passes the role check (`:401`)" uses a bare line number while the evidence alternates between `github-poller.ts` and `github.ts`, and line 401 falls in neither Location range. A reader cannot tell which file is meant, so the one fact that limits who can trigger cannot be checked.

11. Where: `A-008 Title`, `A-008 Scenario`
    - Kind: unclear
    - Remark: The title says "unframed" and the scenario says "uncut and unlabelled", but the evidence shows the result pushed under a `Final message:` header. The finding does not say which framing is missing: the message role, delimiters, a length bound or a trust label.

12. Where: `A-012 Evidence`, `A-012 Scenario` vs `A-013 Evidence` (also `Map / Ticket flow row 7`)
    - Kind: inconsistent
    - Remark: The same code-written wake is quoted four ways:
      - `Job done. Next step: land it` (A-012);
      - `Job done. Next step: land it, or name the check that still blocks landing` (A-013, exp2);
      - "land it … continue with the next item on the board" (A-012 Scenario);
      - Map row 7 says it only "suggests the next step".

      A-012's shortened quote drops the "or name the check" alternative, which bears directly on its claim that the wake "tells the coordinator to land".

13. Where: `A-016 Title` vs `A-047 Title`, Table A row "Seat Pi extensions", determinism To verify bullet 6; `A-009 Severity`
    - Kind: inconsistent
    - Remark: The document gives three answers to whether the seat extensions are installed:
      - "uninstalled" (A-016 title);
      - "run in every coordinator" (A-047 title, Table A);
      - an open question (To verify).

      A-016's own evidence shows only that "Limen does not install them", and A-009's high rating silently assumes `coordinator-handoff.ts` is installed.

14. Where: `A-016 Scenario` (also `A-014 Scenario`, `A-001 Scenario`) vs reliability To verify bullet 2 and determinism To verify bullet 1
    - Kind: inconsistent
    - Remark: A-016 starts from a worker at the quota limit that "ends `failed` (correctly, not faked)", and A-014 from "three jobs fail at once". Whether a quota hit ends `failed` (`stopReason` error) or `done` (exit 0) is exactly what both To verify items leave open, and the findings do not mention that.

15. Where: `A-011 Scenario`, `A-011 Direction`
    - Kind: claim without evidence
    - Remark: The scenario says lands and reviews never see the change under "the 'docs only by the human' rule", and the Direction refuses lands that touch `docs/`. No finding, table or Table 2 row says where such a rule is written.

16. Where: `A-012 Scenario` vs security To verify #5 and determinism To verify bullet 4
    - Kind: inconsistent
    - Remark: The scenario says the land rule "exists only in Adrian's head and in the seat-setup agent's rules". Both To verify items leave open whether the production `AGENTS.md` or `spec/build.md` records "land only after the human says land".

17. Where: `A-015 Evidence`
    - Kind: claim without evidence
    - Remark: "There is no round counter, verdict file or limit anywhere in `src/` or `hook/`" comes with no search command or output. The cited T13 grep covers only a verdict parser, and T16 cites only the prose line `templates/agents.md:157`.

18. Where: Findings / Fields paragraph and Counts line
    - Kind: missing
    - Remark: The document never defines critical, high, medium and low, or how severity follows from Rule, Verdict and Scenario. As a result, findings with `Rule: none` / `n/a` still rate medium (A-019, A-022, A-039, A-043). A-011 (a job writes what later coordinator prompts load) is high, while A-025 (a job's write "becomes persistent code in every later coordinator … across projects") is medium, with no reason given for the difference.

19. Where: Findings / Fields paragraph (`Rule`, `Verdict`)
    - Kind: missing
    - Remark: The rubric behind "z. N" is neither included nor given a path, and the verdict values (non-compliant, partial, compliant, n/a) are not defined. The text still leans on rule wording the reader cannot see: "as z. 29 requires" in A-001, "z. 21 three levels" in A-040, "self-evaluation … (z. 34)" in A-015. H-21 adds a third notation, "rule 40".

20. Where: finding bodies, Tables 1–4, To verify (cross-references)
    - Kind: unclear
    - Remark: Cross-references use pass-1 candidate IDs: "(S-01, S-03)" in A-004, "see S-05" in A-008, "exposed to D-01" in A-014, "R-01 … R-07" in A-059. A reader can resolve them only by searching the Candidates column backwards. In To verify ("S-06 drops to medium", "impact of R-05 and R-10"), this hides which A-finding a check would change.

21. Where: Status and History fields (`A-002`, `A-003`, `A-012`, `A-013`, `A-015`, `A-071`); Pass 2 hypotheses intro
    - Kind: unclear
    - Remark: "The author", "Adam", "the owner", "Adrian", "the operator" and "the human" are never defined. "Owner's analysis l. N" is tied to `input/petla-uczenia-2026-11-15.md` only in the Pass 2 section. Since `DELIBERATE:` means "the author chose this", the reader has to guess whether Adam is the author and Adrian the owner before A-012 or A-014 make sense.

22. Where: Fields (`Status`), index column "Pass 2", `A-014 Status`, `A-028 Status`, `A-035 Status`
    - Kind: unclear
    - Remark: No criterion separates "known" from "new". A-028 is "known" although its History says the source saw "an attribution gap, not a write-access hole", and A-014 is "known" because of a retro line about useful parallel work. Meanwhile A-001, A-002 and A-005, whose History also reads "Related only", are "new".

## Map

23. Where: `Map / Components and boundaries`, Job record row (and Table 1 T6 "single writer") vs `A-022 Evidence`
    - Kind: inconsistent
    - Remark: The Map says "only `finalizeJob` writes a terminal state", but A-022 quotes `` await writeFile(`${dir}/state`, "stopped\n"); `` for a group slot (`src/commands/group.ts:558`). The document never says whether a group slot's `state` is a job record, so the reader cannot reconcile the two.

24. Where: `Map / Ticket flow rows 5 and 6`
    - Kind: inconsistent
    - Remark: Row 5 says code enforces timeout, tool cap and stall, and row 6 says `done`/`failed` follows `stopReason`. Neither notes that this holds only for detached jobs, while A-023, T8 and Table 4 say hosted jobs have no timeout or tool cap and end through `finish`, session end or an idle heuristic.

25. Where: `Map / Ticket flow rows 2, 4 and 9`
    - Kind: claim without evidence
    - Remark: Unlike the other rows, the code halves of these rows carry no file:line: "code refuses a `Ticket:` pointer missing at the base in committed mode", "Code (wrapper, start queue, job setup)", "land refuses a failing ticket check". Row 2's "in committed mode" qualifier appears nowhere else; T3 and A-073 omit it.

26. Where: `Map / Processes and channels` ("Seat timers"), Components row "Seat extensions and services" vs `A-024 Evidence`, Table C row "Seat units listed", Table A GitHub doorbell row
    - Kind: inconsistent
    - Remark: The Map lists `limen-github` among the seat timers, but other places disagree:
      - A-024 alone gives three versions: "docs/seat/ ships prune, bell and github units" (R-11), "the seat units listed are bell and prune only" (D-10) and "bell, prune and GitHub only" (K-19);
      - Table C has the README listing "bell, prune, Pi extensions";
      - Table A says the doorbell has "no unit in `docs/seat/README.md:7`".

27. Where: `Map / Sizes` last bullet; Findings / Fields paragraph; heading "Pass 2: the author's intents (material for stage 3)"
    - Kind: missing
    - Remark: The document refers to "stage 4 `## Measurement`", "stage 3", "stage 6 adds `Final`" and "gate 2 adds `Decision`" but never defines the stages or gates. This file has no `## Measurement` section.

## Pass 2 hypotheses

28. Where: Pass 2 hypotheses intro vs `H-11`, `H-22` and `## To verify`
    - Kind: missing
    - Remark: The intro promises that items "not settled here" are listed in `## To verify`, but none of H-22's facts appear there: the quality-pass trace, no `reminders.md`, the "planted bug passes the gate" class, and upstream `main` equal to the pin. H-11's `disable-model-invocation: true` behaviour is missing too, although H-11 says "To verify on the seat".

29. Where: `H-05 Mark`
    - Kind: inconsistent
    - Remark: "The quality pass runs after ten landings and only proposes" is marked "confirmed (prose only)". Yet the evidence shows nothing in code triggers it, and A-071's History says the owner found no `spec/quality/` after 21 and 11 landings. "Only proposes" has no evidence, and the mark falls outside the scale used elsewhere (confirmed / partial / not settled here), which is itself undefined.

30. Where: `H-06 Evidence` vs Table C task-note row and Table A task-note row
    - Kind: inconsistent
    - Remark: H-06 is marked "partial" because "the rest of `spec/` was not searched", while Table C states "the repo holds no measurement or decision" and Table A says "no measurement in the repo".

31. Where: `H-01`, `H-14`, `H-08 Evidence`
    - Kind: claim without evidence
    - Remark: The absence claims ("no cross-job reader exists in `src/` or `hook/`", "No fetch from `overment/limen`") give no search command or output, unlike T13, A-071 and Table B. H-08 is marked "confirmed" from `docs/commands.md:129`, a doc line, although the section says hypotheses about code are marked against `rebuild-base`.

## Medium and low findings, tables, To verify

32. Where: `A-026` and `A-066` (`Rule`/`Verdict`); `A-057`, `A-058`, `A-060`
    - Kind: inconsistent
    - Remark: A verdict is defined against a rubric rule, and elsewhere `Rule: none` goes with `Verdict: n/a`. Yet A-026 and A-066 are `partial`, and A-057, A-058 and A-060 are `compliant`, all with `Rule: none`.

33. Where: `Scenario` field across medium and low findings (`A-017`–`A-029`, `A-033`, `A-037`, `A-039`, `A-041`, `A-042`, `A-052`–`A-056`, `A-069`)
    - Kind: inconsistent
    - Remark: The Fields paragraph limits `Scenario` to critical and high, but the medium and low findings use it inconsistently:
      - mediums A-017–A-029 have full scenarios;
      - later mediums write "n/a (medium)", and some (A-033, A-037, A-039, A-041, A-042) follow it with a scenario anyway;
      - lows A-052–A-056 have scenarios;
      - low A-069 says "n/a for high."

34. Where: Findings index row `A-031` vs `A-031 History`
    - Kind: inconsistent
    - Remark: The index Pass 2 column says "known · deliberate", but the History carries both `DELIBERATE:` and `CONFLICT:` ("only a bash call with exit 0 counts"). A-025, by contrast, gets "· conflict" in the index for the same kind of entry.

35. Where: `A-037 Title`, `A-037 Evidence`; Table C row "Board digest 'Last…'"; Table A row `docs/diagrams/context-injection.html`
    - Kind: inconsistent
    - Remark: These places state as fact that any system-prompt change invalidates the coordinator's cached history ("Its cache claims are false"). Cost To verify #2 says K-02 "assumes the standard order (tools → system → messages)" and asks where the bridge puts its cache breakpoints.

36. Where: `A-040 Title`, `A-049 Title` vs their History/Direction and the Table A "Seat use" column
    - Kind: inconsistent
    - Remark: Both titles say the seat does not use these features, but four other places disagree:
      - Table A marks most of them "unknown usage";
      - A-049's Direction says "Mark each as unknown usage, confirm with the operator";
      - A-040's History says "Which features are unused depends on the seat";
      - A-049's History says the author runs four-model groups.

37. Where: Table A intro ("Seat = what the repo shows…"), Table A Devin row; `A-039 Scenario`, `A-042 Scenario`
    - Kind: claim without evidence
    - Remark: The seat profile behind every "Seat use" cell (Ubuntu, Pi 1.2.0 via the Claude bridge, one Claude Max subscription, one job at a time) has no file:line. Table 2 even calls the one-job rule an operator decision outside the repo, and "every project has the Polish overlay" (A-042) is just as unsourced. Security To verify #9 still asks whether any production route uses Devin, which Table A marks "none".

38. Where: `A-023 Title` vs `A-023 Evidence` ("Also (D-12)")
    - Kind: inconsistent
    - Remark: The title is about a missing time and tool-call bound, but the merged D-12 evidence shows a hosted job closed as done by an idle heuristic, against `templates/worker.md:10`. That is a premature-end defect: neither the title nor the Direction covers it, and Table 2 lists it separately as "contradicted (D-12)".

39. Where: `A-051 Title` vs `A-051 Evidence` and `History`
    - Kind: inconsistent
    - Remark: The title says "No test guards what the model actually receives", yet the evidence says tests count markers in `fake-system.txt`. The History also says it "was not checked" whether F950's 72 exact-wording checks cover the assembled prompt.

40. Where: `A-053 Scenario` vs Tables / 4. Loop exit conditions, row "Reaper"
    - Kind: inconsistent
    - Remark: The scenario says the reaper ends the job "10 min later", while Table 4 gives the reaper rule as "owner dead on two passes ≥ 10 s apart". The document does not say where 10 minutes comes from.

41. Where: To verify (reliability bullet 2 / determinism bullet 1; security #2 / determinism bullet 5; determinism bullet 2 / cost #6; security #5 / determinism bullet 4)
    - Kind: inconsistent
    - Remark: Four questions appear twice, with different consequences attached. Security #2 says a "yes" lowers S-06 to medium while determinism bullet 5 says nothing, and only the reliability copy of the quota question calls the `done` outcome "a false success". The duplicate merge that the intro describes for findings was not applied here.

## Disposition

Handled by the main session on 2026-11-16 in `adrian-rebuild/audit.md`. "Fixed" names where; "moved" names the merged
question in `## To verify`.

| # | Disposition |
|---|---|
| 1 | fixed: `Note` on A-003, A-007, A-018, A-026, A-062, A-063; moved: Q2 |
| 2 | fixed: `Note` on A-003, A-004; moved: Q4, Q5 |
| 3 | fixed: A-003 `Note` (the coordinator runs `limen github review` as the code-written doorbell prompt says) |
| 4 | fixed: Findings intro ("most critical and high … the others rest on code quotes") |
| 5 | fixed: A-004 `Note` (`--approve` for Pi, `--auto-approve` for OMP); moved: Q6 |
| 6 | fixed: every finding has `History` |
| 7 | fixed: A-001 `Note` (sources of both quotes, role of `agent-setup.md:194`) |
| 8 | fixed: Definitions → Experiments |
| 9 | fixed: A-006 `Note`; moved: Q3 |
| 10 | fixed: A-007 `Note` (`src/integrations/github-poller.ts:401`) |
| 11 | fixed: A-008 `Note` (which framing is missing) |
| 12 | fixed: A-012 `Note` (full wake text) |
| 13 | fixed: titles of A-016, A-047; A-009 `Note`; moved: Q7 |
| 14 | fixed: `Note` on A-014, A-016; moved: Q1 |
| 15 | fixed: A-011 `Note`; Definitions → Seat facts |
| 16 | fixed: A-012 `Note`; moved: Q8 |
| 17 | fixed: A-015 `Note` (search command and result) |
| 18 | fixed: Definitions → Severity; A-011 `Note` (A-011 vs A-025) |
| 19 | fixed: Definitions → Rule, Verdict |
| 20 | fixed: candidate IDs replaced by A-IDs outside `Candidates` and `Also (X-NN):` |
| 21 | fixed: Definitions → People |
| 22 | fixed: Definitions → Status; A-028 changed to `new` |
| 23 | fixed: Map, Job record row (group reserved slot exception) |
| 24 | fixed: Map, ticket flow rows 5 and 6 (detached only; hosted ends) |
| 25 | fixed: Map, ticket flow rows 2, 4, 9 (`file:line` added) |
| 26 | fixed: Map, seat units sentence |
| 27 | fixed: Definitions → Stages and gates |
| 28 | moved: Q10, Q11 |
| 29 | fixed: H-05 marked `partial` with evidence for both halves |
| 30 | fixed: H-06 evidence aligned with the tables |
| 31 | fixed: H-01, H-14 search commands; H-08 code reference |
| 32 | fixed: Definitions → Rule (`none`) and Verdict |
| 33 | fixed: Definitions → Scenario |
| 34 | fixed: A-031 index tag adds "conflict" |
| 35 | fixed: A-037 `Note`; moved: Q9 |
| 36 | fixed: titles of A-040, A-049 |
| 37 | fixed: Definitions → Seat facts |
| 38 | fixed: A-023 title |
| 39 | fixed: A-051 title |
| 40 | fixed: A-053 `Note` (`STARTUP_GRACE_MS`) |
| 41 | fixed: merged questions Q1–Q11 at the top of `## To verify` |
