<!-- PL: Recenzja sprawdzenia bramki według D-105 (1) przez rebuild-reviewer, w trzech rundach (26.11), każda PASS.
Runda 1: siedem uwag; cztery (podział dwóch testów, bufor listy, błąd startu gita, sufit katalogów w teście) poprawia
sesja główna, dwie znikają z commitem, jedną (wzorzec plików wymiany w dwóch miejscach) odrzuca z powodem. Runda 2:
poprawny komentarz o buforze, odrzucony kod wyjścia przy liście nieudanej po biegu; runda 3: tylko to streszczenie,
poprawione bez kolejnej rundy (D-053 (2)). Stan: zamknięte. -->

# Review: the gate fails on a new ignored file in the checkout (D-105 (1))

## Round 1 (2026-11-26, day session `limen-rebuild-35`)

- Inputs: `adrian-rebuild/evidence/gate-new-ignored/ticket.md`, the diff from `review-guard.mjs diff --out
  node_modules/.rebuild-review/D-105-1.diff`, `adrian-rebuild/taste.md`. The main session implemented the change.
- Main session before the review: `node --test adrian-rebuild/tools/test-gate.mjs` → 5/5 (with the test alone, before
  the change of `gate.mjs`: 2/5, tests 1, 4 and 5 failing); `node adrian-rebuild/tools/gate.mjs` → exit 0, 1237/1237
  tests in 410 s, no new ignored file; `npx biome check --error-on-warnings adrian-rebuild` and `node
  adrian-rebuild/tools/check.mjs` → exit 0.
- Guard: `review-guard.mjs compare node_modules/.rebuild-review/D-105-1.before` → `unchanged`, exit 0.
- Parser: `review-verdict.mjs node_modules/.rebuild-review/D-105-1.reply <ticket.md>` → `consistent`, exit 0.
- Verdict: PASS. AC-1–AC-4 met; seven notes, none blocking.

| # | Finding | Kind | Decision |
|---|---|---|---|
| 1 | Test 4 can fail for two reasons (the exit code's priority, the naming on a failing check), and test 2 bundles two exclusions (T-29 (3)) | note · observed | fixed: `ticket.md` → Decisions 1 |
| 2 | The listing has spawnSync's default 1 MiB buffer; at 186444 bytes today it would fail the gate with `ENOBUFS` once the vendored tree grows | note · observed | fixed: Decisions 2 |
| 3 | `ignoredFiles` reads `result.stderr` before `result.error`; a git that cannot start would throw a `TypeError` | note · guessed | fixed: Decisions 3 |
| 4 | `## Change` names `plan.md` → `## State`, which the diff does not change yet | note · observed | no change: it goes into the commit `Tools: …` with the code, as in `ddce57b` |
| 5 | No `outcome.md` yet; the only fails-before evidence is the main session's report | note · observed | no change: `outcome.md` goes into the commit, with the run on a copy of HEAD's `gate.mjs` under `## Proof` |
| 6 | The swap-file pattern stands in `.gitignore` (D-032) and in `gate.mjs`; a wider `.gitignore` pattern would make another editor file fail the gate (T-25 (1)) | note · guessed | rejected: the two patterns state two rules (what git ignores; what never fails the gate), and a change of D-032's pattern is a decision that names both; `outcome.md` → Open points 1 |
| 7 | Test 5 assumes no git repository above `tmpdir()` | note · guessed | fixed: Decisions 4 |

Taste questions answered by the reviewer: T-29 (tests 1 and 5 fail for one reason each; tests 2 and 4 for two, note
1), T-30 (the comments say why; D-105, D-032 and R-102 resolve), T-40 (no step waits for the owner).

## Round 2 (2026-11-26, day session `limen-rebuild-35`)

- Inputs: the same `ticket.md` (with round 1's Decisions 1–4), the diff `node_modules/.rebuild-review/D-105-1r2.diff`,
  `adrian-rebuild/taste.md`.
- Main session before the round: `node --test adrian-rebuild/tools/test-gate.mjs` → 7/7; the same file against a copy
  of HEAD's `gate.mjs`, `gate-env.mjs` and git shim in a scratch directory → 4/7 (tests 1, 5 and 7 fail; 2, 3, 4 and 6
  are guards of facts already true); `npx biome check --error-on-warnings adrian-rebuild` → exit 0.
- Guard: `review-guard.mjs compare node_modules/.rebuild-review/D-105-1r2.before` → `unchanged`, exit 0, after the
  reply and again after the resent reply.
- Parser: the first reply was rejected (`review-verdict.mjs` exit 1: a paragraph on the round-1 fixes stood under
  `## Findings` outside the finding form); the same reviewer, resumed with the parser's message and an unchanged tree,
  resent it with that paragraph in the AC-4 line, and `review-verdict.mjs node_modules/.rebuild-review/D-105-1r2b.reply
  <ticket.md>` → `consistent`, exit 0.
- Verdict: PASS. AC-1–AC-4 met; Decisions 1–4 checked as fixed; two notes, none blocking.

| # | Finding | Kind | Decision |
|---|---|---|---|
| 1 | The comment on `maxBuffer` states that the listing outgrows the 1 MiB default today; it is 186444 bytes (T-30) | note · proven | fixed: `ticket.md` → Decisions 5 |
| 2 | A listing that fails after the run throws before the exit code is set, so a failing check's own code (e.g. 3) becomes 1; no test covers the combination | note · observed | rejected: `## Change` sets exit 1 for a failed listing, the gate fails either way with git's message, and the check's own failure is already in the output above it; a second exit rule for a git failure after a failing check adds a branch for no reader; `outcome.md` → Open points 2 |

Taste questions answered by the reviewer: T-29 (each of the seven tests fails for one reason), T-30 (the comments say
why, except the `maxBuffer` comment, note 1), T-40 (no step waits for the owner).

## Round 3 (2026-11-26, day session `limen-rebuild-35`; the last round of fixes)

- Inputs: the same `ticket.md` (with Decision 5), the diff `node_modules/.rebuild-review/D-105-1r3.diff`,
  `adrian-rebuild/taste.md`.
- Main session before the round: `node --test adrian-rebuild/tools/test-gate.mjs` → 7/7; `npx biome check
  --error-on-warnings adrian-rebuild` → exit 0.
- Guard: `review-guard.mjs compare node_modules/.rebuild-review/D-105-1r3.before` → `unchanged`, exit 0.
- Parser: `review-verdict.mjs node_modules/.rebuild-review/D-105-1r3.reply <ticket.md>` → `consistent`, exit 0.
- Verdict: PASS. AC-1–AC-4 met; Decisions 1–5 checked as fixed; one note, not blocking.

| # | Finding | Kind | Decision |
|---|---|---|---|
| 1 | This file's PL summary described round 1 only ("Stan: runda 2 po poprawkach") | note · proven | fixed by the main session without a further round, since it touches only `review.md` (D-053 (2)) |

Taste questions answered by the reviewer: T-29 (each test fails for one reason; tests 1, 5 and 7 fail against HEAD's
`gate.mjs`), T-30 (every comment says why; "vendored engine sources" is `adrian-rebuild/input/vendor/`), T-40 (no
step waits for the owner).
