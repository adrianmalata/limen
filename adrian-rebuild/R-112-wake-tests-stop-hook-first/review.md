<!-- PL: Recenzja ticketu R-112 (zatrzymanie hooka wake czeka na zapis rejestru projektów, a testy zatrzymują hook
przed usunięciem folderu). Runda 1 (27.11, w dzień): PASS, wszystkie kryteria AC-1–AC-9 spełnione, cztery uwagi bez
znaleziska blokującego; żadna nie wymaga poprawki w tym tickecie: jedna idzie do punktów otwartych `outcome.md`
(D-092), trzy zostają bez zmiany z podanym powodem. Stan: recenzja zamknięta po jednej rundzie. -->

# R-112 review

## Round 1 (2026-11-27, by day, `limen-rebuild-44`)

- Before: the implementer's run → `review-guard.mjs compare --git` → "within its limits", exit 0. A second `compare
  --git` at the resume after Adrian's pause → exit 1, naming only `HEAD` and the two refs of `adrian-rebuild`: the main
  session's own State commit `b810179` (parent `216a1c2`, only `adrian-rebuild/plan.md`), made after the first
  compare; no config, hook, `info/`, `.claude/settings.local.json`, `input/`, reserved path or index change, so the
  first compare stands. The main session's `gate.mjs --out node_modules/.rebuild-review/R-112.gate` → exit 0,
  1440/1440 (325.5 s), no `ENOTEMPTY`; `fails-before.mjs test/hook/wake.test.ts` → exit 0 (the new test fails at
  `HEAD`, 21/22).
- Reply: `rebuild-reviewer` with the ticket, `node_modules/.rebuild-review/R-112.diff` and `taste.md`;
  `review-guard.mjs compare` → "unchanged", exit 0; `review-verdict.mjs` → "consistent", exit 0.
- Verdict: **PASS**. AC-1–AC-9 met; four notes, no blocking finding. Taste questions: T-29, the new test fails for
  one reason; T-30, the comments say why, except the one of note 3.

| # | Finding (short) | Decision |
|---|---|---|
| 1 | note · observed: the diff changes `limenWake`, whose `biome-ignore … split pending` stays (T-27 (1)) | no change: R-082's ratchet takes it, as for R-043, R-111 and R-044; `outcome.md` → Open points 2 |
| 2 | note · observed: the new teardown (`test/hook/wake.test.ts:154-159`) has no `try`/`finally`, so a rejected `shutdown()` skips the other shutdowns and the removal and leaves the temporary folder | no change in this ticket (D-092: a note that needs test code, which no later ticket rewrites, goes to the outcome's open points): the registrations' chain never rejects (each registration's error is caught), and a throw in the stop fails the test visibly; `outcome.md` → Open points 6 |
| 3 | note · observed: the comment on `registrations` (`hook/wake.ts:138`) says what the promise holds, not why | no change: the why stands in the comment at the registration that feeds it (`hook/wake.ts:958-960`), and AC-9 accepts "why or what" |
| 4 | note · observed: the D-057 (6) test starts a hook outside `hookProject` and never stops it | no change: its session start returns at the migration check before any registration or timer; `outcome.md` → Open points 3 |

No round of fixes; the review is closed.
