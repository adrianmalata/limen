<!-- PL: Recenzje R-026 przez rebuild-reviewer. Runda 1: PASS z dziesięcioma uwagami bez blokujących; sześć do
poprawy (koniec scope także po błędzie afterEnd, zapasowe KILL grupy przy nieudanym końcu scope, ślad po nieudanym
starcie w scope, pełniejszy skan systemctl, brak fałszywego wpisu dla scope, który nie powstał, osobna nazwa
endScope), cztery przekazane albo odrzucone z powodem. Runda 2: PASS; poprawki rundy 1 potwierdzone, jedna poprawka komentarza
testu (odwołanie do złej decyzji), reszta przyjęta albo przekazana dalej. Runda 3: PASS; (g) potwierdzona, dwie uwagi do notatki planu dla R-050 i R-087
poprawione przez sesję główną bez kolejnej rundy (tekst planu). Stan: zamknięta. -->

# R-026 review

## Round 1 (2026-11-22, day session)

- Inputs: `adrian-rebuild/R-026-job-scope/ticket.md`, `node_modules/.rebuild-review/R-026.diff` (2898 lines),
  `adrian-rebuild/taste.md`; the draft `outcome.md`.
- Main session before the review: `node adrian-rebuild/tools/gate.mjs` → exit 0, 748/748 (147.5 s);
  `node adrian-rebuild/tools/fails-before.mjs` → exit 0; `npx biome check --error-on-warnings .` → exit 0;
  `node adrian-rebuild/tools/check.mjs` → exit 0. `compare --git` after the implementer → exit 0.
- Guard: `review-guard.mjs compare node_modules/.rebuild-review/R-026.before` → `unchanged`, exit 0.
- Parser: `review-verdict.mjs node_modules/.rebuild-review/R-026.reply <ticket.md>` → `consistent`, exit 0.
- Verdict: PASS. AC-1–AC-10 met. Taste questions: T-29 each new mechanism test fails at HEAD for one reason, the
  structure fixture case passes at HEAD (Deviation 7), the s9 test combines mechanisms; T-30 yes; T-40 no owner
  permission; T-41 no command; T-14 literal; T-18 the duplicated `endScope`.

| # | Finding | Kind | Decision |
|---|---|---|---|
| 1 | If `afterEnd` rejects, the scope end is skipped and processes outside the group outlive the terminal job | note · proven | fix (a): `try`/`finally` |
| 2 | Deviation 1 removes exhaustion's group KILL; a failed `systemctl --user kill` leaves a TERM-ignoring engine alive and the wrapper's wait unbounded | note · proven | fix (b): the group KILL as the fallback when the scope end fails |
| 3 | `startLimen` swallows a failed scope start with `.catch(() => {})` (T-01) | note · proven | fix (c): one line in the served job's log |
| 4 | The A-083 scan finds `systemctl` only with `--user` on the same line | note · proven | fix (d): ban `systemctl` outside `src/platform/` |
| 5 | The scan bans the literal `systemd-run` in `hook/`; the T-42 guard will need an exemption | note · observed | to R-060 as a note in `## Tickets` |
| 6 | The test knobs `LIMEN_CGROUP_ROOT` and `LIMEN_CGROUP` are read in production paths | note · proven | stays with R-050 and R-087 (`outcome.md` → Open points), noted in `## Tickets` |
| 7 | The finalize test fails at HEAD on the record schema, not on the missing kill | note · observed | rejected: the s9 orphan test proves the mechanism at HEAD; the record field cannot exist there |
| 8 | The extended s9 test checks several finishers in one test (T-29 (3)) | note · observed | rejected: the combination predates R-026, which extends it as `## Change` (e) asks; splitting it is R-083's (T-29) |
| 9 | A job that ends before its scope exists logs "was not ended: … not loaded" | note · observed | fix (e): a scope that does not exist is `gone`, decided from a fact, not from output text |
| 10 | Two functions are named `endScope` (T-18, T-25) | note · observed | fix (f): the private one in `finalize.ts` is renamed |

## Round 2 (2026-11-22, day session; the second and last round of fixes)

- Inputs: `ticket.md` (item 6 (a)–(f)), `node_modules/.rebuild-review/R-026-2.diff` (3326 lines), `taste.md`,
  round 1 above; a re-review (T-06).
- Main session before the review: `compare --git` after the implementer's fixes → exit 0; `gate.mjs` → exit 0,
  752/752 (148.7 s); `fails-before.mjs` → exit 0; Biome and `check.mjs` → exit 0.
- Guard: `review-guard.mjs compare node_modules/.rebuild-review/R-026-2.before` → `unchanged`, exit 0.
- Parser: `review-verdict.mjs node_modules/.rebuild-review/R-026-2.reply <ticket.md>` → `consistent`, exit 0.
- Verdict: PASS. AC-1–AC-10 met; round 1's fixes (a)–(f) confirmed (notes 1–5 of this round). Taste questions: T-29
  yes, each round-1 test fails for one reason before its fix; T-30 one unresolved pointer (note 10); T-40, T-41,
  T-18, T-14 nothing new.

| # | Finding | Kind | Decision |
|---|---|---|---|
| 1–5 | Round 1's (a), (b), (c), (e) and (f) are fixed as item 6 says | note · proven | confirmed |
| 6 | (d) is fixed more narrowly than item 6 words it: the literal `"systemctl"` and a `--user` line; a shell string or an absolute path pass | note · proven | accepted: the model of the existing `ps` ban, which item 6 (d) meant; no such call exists (item 7) |
| 7 | The GitHub doctor's move keeps its behaviour; `systemUnitProperty` and `systemUnitState` have no test of their own, as the doctor's calls had none | note · proven | accepted: behaviour unchanged |
| 8 | `outcome.md` cites step 3.2 for the `is-active` exit 3, which step 3.2 does not hold | note · proven | fix by the main session: `## Deployment` 3.2 gains the check |
| 9 | A rule's timer that cannot start writes a stderr line that can follow a failed command's final line (T-02) | note · observed | accepted risk until R-034 cuts `limen rule`; noted for R-034 |
| 10 | The new test's comment cites "A-029, Decision 2", and Decision 2 is the unit's name (T-30) | note · observed | fix (g): the comment cites A-029 and R-026; item 6 (a)'s wrong pointer is corrected |
| 11 | The notes for R-060, R-050 and R-087 are not in `## Tickets` | note · proven | fix by the main session: in `## Tickets`, with R-034's and R-081's |

## Round 3 (2026-11-22, day session)

- Inputs: `ticket.md` (item 7), `node_modules/.rebuild-review/R-026-3.diff`, `taste.md`, rounds 1 and 2 above; a
  re-review (T-06).
- Main session before the review: `compare --git` after fix (g) → exit 0; `gate.mjs` → exit 0, 752/752.
- Guard: `review-guard.mjs compare node_modules/.rebuild-review/R-026-3.before` → `unchanged`, exit 0.
- Parser: `review-verdict.mjs node_modules/.rebuild-review/R-026-3.reply <ticket.md>` → `consistent`, exit 0.
- Verdict: PASS. AC-1–AC-10 met. Taste questions: T-30 yes, the fixed comment's identifiers resolve; T-29 the delta
  changes only a comment; T-40, T-41 nothing new.

| # | Finding | Kind | Decision |
|---|---|---|---|
| 1 | (g) is fixed as item 7 says | note · proven | confirmed |
| 2 | Round 2 note 8 is fixed: step 3.2 holds the `is-active` check | note · proven | confirmed |
| 3 | The new R-060, R-034 and R-081 notes match the tree | note · proven | confirmed |
| 4 | The new R-050/R-087 note says a job's environment must not carry the knobs, against the ticket, `outcome.md` and the note above it; the fakes need both knobs in the engine's environment | note · proven | fixed by the main session (plan text, no round): the guarantee is that the knobs are read only in test mode (T-03), which R-087 makes true; R-087 keeps them for tests |
| 5 | The same note leaves out the finisher's readings, which also read `LIMEN_CGROUP_ROOT` | note · proven | fixed by the main session: the note names `cgroupFolder` |

