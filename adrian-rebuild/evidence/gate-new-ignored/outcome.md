<!-- PL: Wynik sprawdzenia bramki według D-105 (1): `gate.mjs` spisuje ignorowane pliki checkoutu poza `node_modules/`
i bez plików wymiany edytora przed `npm run check` i po nim, a każdy nowy plik nazywa i kończy bramkę porażką; kod
nieudanego `check` wygrywa. Dowód: test bramki 7/7 (na kopii HEAD 4/7), pełna bramka z kodem 0 bez nowego pliku,
Biome i check.mjs z kodem 0; recenzja PASS w trzech rundach. Stan: zamknięte commitem `Tools: …` 26.11. -->

# Outcome: the gate fails on a new ignored file in the checkout (D-105 (1))

## Done

- `adrian-rebuild/tools/gate.mjs`: `IGNORED`, one `git ls-files -z --others --ignored --exclude-standard` listing
  without `**/node_modules/**` and `**/.*.swp`, read by `ignoredFiles` before and after `npm run check`; each path that
  is new after the run prints `gate: the run left a new ignored file in the checkout: <path> (D-105)`. The exit code is
  the check's when it is not 0, otherwise 1 when a new file is left, otherwise 0. A listing that fails (git cannot
  start or exits non-zero) throws `gate: git ls-files failed: <message>`, exit 1. The listing's buffer is 1 GiB, as in
  `fails-before.mjs`.
- `adrian-rebuild/tools/test-gate.mjs` (new, seven tests on fixture repositories under a private `GIT_CEILING_DIRECTORIES`):
  a new ignored file fails the gate and each is named; `node_modules/` at any depth and a swap file do not fail it; a
  changed ignored file that existed before is not new; a new file is named when the check fails; the check's exit code
  wins; a listing that fails after the run fails the gate.
- `adrian-rebuild/plan.md` → `## Commands`: the new test file among the main session's and the implementer's checks
  (the allow rule `node --test *` already passes it); `## State`.

## Proof

- Test first, `gate.mjs` unchanged: the first five tests → 2/5 (tests 1, 4 and 5 failing). After round 1's split, the
  seven tests run against a copy of HEAD's `gate.mjs`, `gate-env.mjs` and git shim in a scratch directory → 4/7: `not ok
  1 - D-105: a new ignored file fails the gate, and each new file is named`, `not ok 5 - A new ignored file is named even
  when the check fails`, `not ok 7 - A listing that fails after the run fails the gate, so a lost listing is no pass`;
  tests 2, 3, 4 and 6 pass there, guards of facts HEAD already had (it watched nothing and kept the check's code).
  `fails-before.mjs` reads only `test/`, so this copy stands in for it.
- After the change: `node --test adrian-rebuild/tools/test-gate.mjs` → exit 0, 7/7; `node adrian-rebuild/tools/gate.mjs`
  → exit 0 before round 1 (1237/1237, 410 s) and on the final tree (1237/1237, no `gate:` line); `npx biome check
  --error-on-warnings adrian-rebuild` → exit 0; `node adrian-rebuild/tools/check.mjs` → exit 0.
- Review: `review.md` → Rounds 1–3, each PASS.

## Deviations

- None from `ticket.md`'s Change. Two readings no source settled, stated in `## Problem`: `node_modules/` is excluded
  at any depth, and editor swap files are excluded so that D-032 holds for the gate.

## Open points

1. Round 1, note 6 (rejected): the swap-file pattern stands in `.gitignore` (D-032) and in `gate.mjs`; a decision that
   widens D-032's pattern names both.
2. Round 2, note 2 (rejected): a listing that fails after a failing check ends the gate with 1, not the check's code;
   the gate fails either way and the check's output stands above git's message.
3. An empty ignored directory a run leaves is not seen (`ticket.md` → Out of scope); R-102's case left files.

## Measurement

Unmeasured here: the check meets its first real case only when a ticket's test writes into the checkout.
