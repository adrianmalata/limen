<!-- PL: Recenzja ticketu R-107 (kod wyjścia 4 z `is-active` systemd 259 czytany jak „nieaktywny”). Runda 1 (28.11,
noc): PASS, kryteria AC-1–AC-8 spełnione, bez znalezisk. Stan: recenzja zamknięta po jednej rundzie. -->

# R-107 review

## Round 1 (2026-11-28, night run)

- Before: the implementer's run → `review-guard.mjs compare --git` → "within its limits", exit 0. The main session's
  `gate.mjs --out node_modules/.rebuild-review/R-107.gate` → exit 0, 1553/1553 (348.7 s); AC-5's `fails-before.mjs`
  → exit 0 (`test/platform/linux.test.ts`, `test/job/finalize.test.ts`, `test/runtime/reap.test.ts`).
- Reply: `rebuild-reviewer` with the ticket, `node_modules/.rebuild-review/R-107.diff` and `taste.md`;
  `review-guard.mjs compare` → "unchanged", exit 0; `review-verdict.mjs` → "consistent", exit 0.
- Verdict: **PASS**. AC-1–AC-8 met; no findings. Taste questions: T-29, each new test fails for one reason (the
  `deactivating` row with exit 4 shows that the word decides); T-30, the comments say why and cite E-18.

No round of fixes; the review is closed.
