<!-- PL: Przebieg recenzji ticketu R-008 przez subagenta rebuild-reviewer według protokołu (strażnik review-guard.mjs
przed i po, parser review-verdict.mjs). Jedna runda: PASS, wszystkie kryteria spełnione, pięć uwag bez znalezisk
blokujących; przy każdej uwadze decyzja sesji głównej z powodem. Stan: zamknięta, bez poprawek. -->

# Review: R-008 Cut the macOS branches

## Round 1 (2026-11-17, night run)

- Inputs: `adrian-rebuild/R-008-cut-macos-branches/ticket.md`, the diff from `review-guard.mjs diff --out
  node_modules/.rebuild-review/R-008.diff`, `adrian-rebuild/taste.md`.
- Guard: `review-guard.mjs compare node_modules/.rebuild-review/R-008.before` → `unchanged`, exit 0.
- Parser: `review-verdict.mjs node_modules/.rebuild-review/R-008.reply <ticket.md>` → `consistent`, exit 0.
- Verdict: PASS. AC-1 to AC-7 met; no blocking finding.

| # | Finding | Kind | Decision |
|---|---|---|---|
| 1 | `SECURITY.md:9` says `limen stop` sends TERM to the job's process group; a hosted (`--tab`) job is stopped through Herdr instead (`src/commands/stop.ts:28-30`, `:75-79`) | note · proven | no change: R-005, in this stage, cuts hosted jobs, and the sentence is exact from then on |
| 2 | No caller passes the `dependencies` of `containEscapedDescendants` or the `query` of `ownerAlive` any more | note · proven | no change: test seams outside the cut; the ticket that rewrites containment and the reaper (R-026, R-027) decides them |
| 3 | The edge `now - matched < 0` of the removed recheck no longer skips the `/proc` read | note · proven | no change: item 4 requires the removal, the new answer is the true state, and `outcome.md` → Deviations 3 records it |
| 4 | `src/job/group-cabinet.ts` and `test/u9-process-identity.test.ts` are outside `## Change` | note · proven | no change: `noUnusedParameters` (`tsconfig.json:12`) forces both edits once `deadline` goes, which item 1's "whatever becomes unused with them" covers |
| 5 | `docs/remote.md:77` drops "Darwin attribution" while the hosted-binding platform check stays for R-005 | note · observed | no change: the line is in item 6; the doc is silent, not wrong, and R-005 removes the check |

Taste questions answered by the reviewer: T-29 (no test added; the changed u9 assertion fails for one reason), T-30
(the remaining comments state contracts and hold no unresolved identifier), T-40 (no new owner step).
