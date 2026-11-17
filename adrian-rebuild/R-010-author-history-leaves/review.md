<!-- PL: Przebieg recenzji ticketu R-010 przez subagenta rebuild-reviewer według protokołu (strażnik review-guard.mjs
przed i po, parser review-verdict.mjs). Jedna runda: PASS, wszystkie kryteria spełnione, dwie uwagi bez znalezisk
blokujących; przy każdej uwadze decyzja sesji głównej z powodem. Stan: zamknięta, bez poprawek. -->

# Review: R-010 The author's working history leaves the tree; Limen's own test-line cap goes

## Round 1 (2026-11-17, night run)

- Inputs: `adrian-rebuild/R-010-author-history-leaves/ticket.md`, the diff from `review-guard.mjs diff --out
  node_modules/.rebuild-review/R-010.diff` (about 670,000 lines, almost all of them the 865 deletions of `spec/`; the
  reviewer read the deletions as `git diff --cached --name-status HEAD` and the rest as `git diff HEAD -- . ':!spec'`),
  `adrian-rebuild/taste.md`.
- Guard: `review-guard.mjs compare node_modules/.rebuild-review/R-010.before` → `unchanged`, exit 0.
- Parser: `review-verdict.mjs node_modules/.rebuild-review/R-010.reply <ticket.md>` → `consistent`, exit 0.
- Verdict: PASS. AC-1 to AC-7 met; no blocking finding.

| # | Finding | Kind | Decision |
|---|---|---|---|
| 1 | `docs/jobs.md:158` names an `evidence.md` of the author's F951 folder under `spec/features/` in plain text, without the `3b5edd7` pointer that `docs/finish-webhooks.md` got | note · proven | no change: plain text, not a link (AC-3 holds); the README `## History` pointer says where every file of the history is; R-081 rewrites the docs from the code |
| 2 | `testLineCap` is still exported from `src/commands/land.ts:166` with no importer outside `land.ts` | note · proven | no change: `land.ts` is out of scope; R-062 moves the projects' cap to `limits.json` |

Taste questions answered by the reviewer: T-11 (Limen's own cap and its test are gone; the projects' land cap is
untouched), T-39 (pointer in `README.md`, references resolve at `rebuild-base`, no comment names a path into the
removed `spec/`), T-29 (no test added; the remaining tests unchanged), T-30 (no comment added), T-40 (no owner step),
T-21 (the pointer names a role, not a person).
