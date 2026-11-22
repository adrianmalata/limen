<!-- PL: Recenzje ticketu R-025 (pokrycie testami z rejestru poleceń: deklaracje odmów, skany i zapadki). Runda 1
(noc 21/22.11): FAIL z jednym znaleziskiem blokującym i pięcioma uwagami, poprawione w pierwszej rundzie poprawek
poza domyślną decyzją nocy (wspólne kody) i wzrostem OUTSIDE_RUNNER. Runda 2: PASS (pierwsza odpowiedź odrzucona za
formę, druga od świeżego recenzenta) z siedmioma uwagami z obu odpowiedzi; sześć idzie do drugiej, ostatniej rundy
poprawek, zapis `## Fails before` poprawia sesja główna. Runda 3: PASS z trzema uwagami, zamknięta poprawkami sesji
głównej w `outcome.md` bez kolejnej rundy. Stan: zamknięta. -->

# R-025 review

## Round 1 (2026-11-22, night)

- Before: the implementer's run → `review-guard.mjs compare --git` "within its limits", exit 0; the main session's
  `gate.mjs` → 705/705, fail 0; `fails-before.mjs` → exit 0, recorded in `outcome.md` → `## Fails before` before the
  review.
- Reviewer: `rebuild-reviewer` with the ticket, `node_modules/.rebuild-review/R-025.diff` and `taste.md`;
  `review-guard.mjs compare` → "unchanged", exit 0; `review-verdict.mjs` → "consistent", exit 0.
- Verdict: **FAIL**. AC-1–AC-9 met; one blocking finding.

| # | Finding (short) | Decision |
|---|---|---|
| 1 | blocking · proven: scan (b)3 reads only the codes of the entries' `refuses`, not `SHARED_CODES`, so `CODE:` refusal tests of `change` commands on a shared code that compare no snapshot are neither scanned nor listed (`test/cli/continue.test.ts:127-134`, `test/cli/group.test.ts:126-136`, `test/outcome.test.ts:236-243` and `:255-261`); the comment and Deviation 3 give a wrong reason | fix: (b)3 covers every `CODE:` test of a `change` command, whichever list declares its code; the tests that compare no snapshot join `WITHOUT_SNAPSHOT` or compare it; a fixture case fails when such a test is unlisted; the comment and Deviation 3 corrected |
| 2 | note · observed: `thrownCodes` skips a `new LimenError` whose class is not a literal, even with a literal code (fixture `KEPT_CLASS`), so "none passes unread" overstates the scan; today only `GROUP_PARTIAL_START` (never a refusal) | fix (the ticket's Risk): such a site is not skipped; its code is on an exact list with its reason, so a new site fails the scan; the comment says what the scan does |
| 3 | note · observed: `codesOf` looks a name up in the file-wide string constants before the function's parameters, so a constant named like a code parameter would hide its callers' codes; no such file today | fix (the ticket's Risk): parameters before file-wide constants, as the language's scopes resolve them, with a fixture case |
| 4 | note · observed: the T-04 read test fails a run only on exit 2, so a read that crashes (exit 5) passes, and `github doctor` and `github ensure` exit 1 before they read anything | fix: each read's expected end on the plant is named (exit 0, or its expected code for the reads that refuse there, with the reason), so any other end fails the test |
| 5 | note · observed: `SHARED_CODES` adds `UNKNOWN_COMMAND`, `REMOVED` and `UNTYPED` to D-075's five (Deviation 1), which scan 1 needs | no change; night default (category A (b), D-054 (2)), for Adrian to confirm in the morning: the codes every command line can hit, the dispatcher's and the wrapper's beside the runner's, are one list in `src/operation.ts` |
| 6 | note · observed: `OUTSIDE_RUNNER`, which "may only shrink", grows by `show` and `status` (Deviation 5) | no change: D-045 (6.2) and D-075 make them `change` until R-032, which makes them `read` again and so takes them off the list |

Taste answers: T-28 yes (`stats` is the one read command with a success test, its golden test of the whole output).
T-29: the two renamed tests that already combined mechanisms (`limen github resolve: …`, `limen land: …`) are R-083's
to split. T-30 yes.

Fixes (for a fresh implementer, `ticket.md` → `## Decisions`; the first round of fixes): 1, 2, 3 and 4. They change
tests, so they get a round (D-053 (2)).

## Round 2 (2026-11-22, night, run 2 of `night.mjs`)

- The first round of fixes: run 1's fresh implementer stopped at the subscription's 5-hour limit (the run's result
  `usage_limit_reached`, 02:09) after only reading files; `compare --git` → "within its limits" at the start of run 2.
  A second fresh implementer made the fixes (`DONE`); `compare --git` → "within its limits", exit 0.
- Before: the main session's `gate.mjs` → 707 tests, 707 pass, 0 fail (tsc and Biome first, in `npm run check`);
  `fails-before.mjs` → exit 0 (the same 16 files fail at `HEAD` `24f37a6`).
- Reviewer: `rebuild-reviewer` with the ticket, `node_modules/.rebuild-review/R-025.diff` and `taste.md`. The first
  reply (PASS, three notes) was rejected by `review-verdict.mjs` for its form, exit 1: AC-9's evidence ran over nine
  bullet lines under `## Criteria`. A fresh reviewer, told only that each criterion is one line, replied again with
  the tree unchanged: `review-guard.mjs compare` → "unchanged" after each reply; `review-verdict.mjs` → "consistent",
  exit 0.
- Verdict: **PASS**. AC-1–AC-9 met; no blocking finding. The rejected reply's three notes are proven observations of
  the same tree, so they are weighed with the accepted reply's four (A1–A3 below).

| # | Finding (short) | Decision |
|---|---|---|
| 1 | note · observed: `ticket new` and `group start` stay on `WITHOUT_SUCCESS_TEST`, though tests already prove each one's success without the prefix (`test/outcome.test.ts:269-277`; `test/cli/group.test.ts:227-244`), while `github work`'s run-again test was renamed; Change (b) says such a test is renamed rather than listed | fix: both renamed `limen ticket new: …` and `limen group start: …` (one of the two run-again tests), unless one combines mechanisms (T-29 (3)), which `outcome.md` then names; both leave the list |
| 2 | note · observed: the code reader is looser than the language's scopes: a string constant is one value per name for the whole file (the last one), and a local variable gets every literal the file gives a property of its name, so a code from another file can hide behind it; neither case is in `src/` today, and no fixture case covers them (the ticket's Risk) | fix: a name means its innermost declaration around it; a destructured property of a call of the file's own function gives that property's literals in that function; any other binding is unreadable; fixture cases for both |
| 3 | note · observed: scan (b)3 counts a test as comparing the snapshot when it calls `snapshot` at all, while T-38's Check reads "compares the snapshots before and after" | fix: a test compares when it takes the snapshot at least twice, itself or through the file's functions; a fixture case with one snapshot fails |
| 4 | note · observed: `## Fails before` dates from before round 1 and does not say it ran again | fix by the main session after this round's fixes (`outcome.md` only): it runs `fails-before.mjs` again and records that run |
| A1 | note · proven (rejected reply): the test name `D-045: status and show are change commands until R-032, …` holds two identifiers, against T-29 (2); an older test at `test/registry.test.ts:101` has the same shape | fix: R-032 leaves the name for a comment above the test; the older test is outside this ticket's change, for R-083 (test names) |
| A2 | note · proven (rejected reply): `UNKNOWN_CLASS` is compared by code, not by site, so a new site with a code already listed passes, while round 1's decision (2) says a new such site fails the scan | fix: the list holds sites (file and code, one entry per site, repeats kept), so a new site fails it; a fixture case |
| A3 | note · proven (rejected reply): the `UNPRIVILEGED` comment says `github ensure` passes its privilege check "on every machine", but under uid 0 `assertUnprivileged` refuses before it runs `id` | fix: the comment says the stubs hold for an account that is not root |

Taste answers (accepted reply): T-28 yes (`stats`'s success test compares every line and the final line). T-29 yes
for the round-1 tests; the two older renamed tests that combine mechanisms stay R-083's. T-30 yes.

Fixes (for a fresh implementer, `ticket.md` → `## Decisions`; the second and last round of fixes, `## Agents` step
6): 1, 2, 3, A1, A2 and A3. They change tests, so they get a round (D-053 (2)); 4 is the main session's.

Not fixed, an open point for gate 5.2 and R-082 (the implementer's, `outcome.md` → Open points): scan (b)3 knows a
test's command only by its code, so `WITHOUT_SNAPSHOT` holds `CODE:` tests that run no command on a project (unit
tests of `test/lock.test.ts`, `test/operation.test.ts` and some of `test/parser.test.ts`), which no snapshot can
make pass; R-082, which brings the list to zero, decides whether the scan holds a test by the command it runs.

## Round 3 (2026-11-22, night, run 2 of `night.mjs`)

- The second and last round of fixes: a fresh implementer (`DONE`); `compare --git` → "within its limits", exit 0.
- Before: the main session's `gate.mjs` → exit 0, 710 tests, 710 pass, 0 fail; `fails-before.mjs` → exit 0 (17 files
  fail at `HEAD` `24f37a6`; `test/outcome.test.ts` joined with its renamed test), recorded in `outcome.md` →
  `## Fails before` (round 2's finding 4).
- Reviewer: `rebuild-reviewer` with the ticket, `node_modules/.rebuild-review/R-025.diff` and `taste.md`;
  `review-guard.mjs compare` → "unchanged", exit 0; `review-verdict.mjs` → "consistent", exit 0.
- Verdict: **PASS**. AC-1–AC-9 met; no blocking finding.

| # | Finding (short) | Decision |
|---|---|---|
| 1 | note · proven: `outcome.md` → Open points says 15 renamed tests, `## Done` 17 since round 2 | fixed by the main session (`outcome.md` only, D-053 (2)) |
| 2 | note · observed: the renamed `limen watch: …` test also proves watch's refusal without a session and unwatch's success, so it combines mechanisms (T-29 (3)), as `limen github resolve: …` and `limen land: …` do | no change of the test: R-083 splits the tests that combine mechanisms, as round 1 recorded for the other two; `outcome.md` → Open points names all three |
| 3 | note · observed: two refusal proofs of `continue` with code `REMOVED` (`test/cli/continue.test.ts:93`, `:113`) lack the `REMOVED:` prefix; on no ratchet list, since `REMOVED` has `CODE:` tests elsewhere | no change: renaming tests outside the lists is R-083's (test names); `outcome.md` → Open points names them |

Taste answers: T-28 yes. T-29 yes for the added tests; the three renamed tests that combine mechanisms are R-083's.
T-30 yes.

The round is `PASS` and its fixes touch only `outcome.md`, so the main session closes it with no further round
(D-053 (2)).
