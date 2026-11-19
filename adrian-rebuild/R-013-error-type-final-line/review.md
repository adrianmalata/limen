<!-- PL: Recenzja ticketu R-013 przez rebuild-reviewer. Runda 1 (19.11, nocny przebieg): pierwsza odpowiedź odrzucona
przez review-verdict.mjs (format AC-9), druga: PASS, kryteria AC-1–AC-9 spełnione, dziewięć uwag bez znalezisk
blokujących. Razem z uwagami odrzuconej odpowiedzi sesja główna kieruje dziesięć drobnych poprawek do świeżego
implementera (m.in. złota linia spawn porównywana dosłownie, prawdziwe zdania w podręczniku i dokumentacji, 403 z
limitem jako klasa 3, starsze formaty identyfikatorów zadań) i odrzuca pięć z powodem. Runda 2: PASS z dwiema
uwagami (jedna przyjęta, jedna odrzucona z powodem i zapisana dla R-082). Stan: zamknięty. -->

# Review: R-013 One error type, exit codes as failure classes, a final JSON line

## Round 1 (2026-11-19, night run)

- Inputs: `adrian-rebuild/R-013-error-type-final-line/ticket.md`, the diff from `review-guard.mjs diff --out
  node_modules/.rebuild-review/R-013.diff`, `adrian-rebuild/taste.md`.
- Main session before the review: `review-guard.mjs compare --git node_modules/.rebuild-review/R-013.git <ticket.md>`
  → "within its limits", exit 0; `node adrian-rebuild/tools/gate.mjs` → exit 0, 191/191; `fails-before.mjs` → exit 0.
- First reply: `review-verdict.mjs` → exit 1 ("criterion line 9 is not …"; AC-9 spread over a list, so AC-9 counted as
  missing); the reply was rejected and a fresh reviewer ran again, told to give one line per criterion. Guard after
  each: `unchanged`, exit 0. The first reply's findings are kept below as information (marked "reply 1").
- Accepted reply: `review-verdict.mjs node_modules/.rebuild-review/R-013.reply <ticket.md>` → `consistent`, exit 0.
- Verdict: PASS. AC-1 to AC-9 met; nine notes, none blocking.

| # | Finding | Kind | Decision |
|---|---|---|---|
| 1 | The spawn golden test re-serialises `readOutcome`'s object, so it cannot see the key order the outcome says it checks | note · proven | fix: the test compares the raw last stdout line with the golden string |
| 2 | `test/cli/github.test.ts` (GITHUB_NETWORK) passes only under the gate's private `TMPDIR` | note · proven | rejected: the gate is the test environment (D-001); `test/s10-doorbell.test.ts` has the same dependency on the poller's private-path check |
| 3 | Most files fail at `HEAD` on the missing `src/outcome.ts`, not on their mechanism | note · proven | rejected: `fails-before.mjs` works per file; the reviewer read that each test would also fail on its mechanism at `HEAD` |
| 4 | `docs/commands.md:30` says programs read only the final line, but the poller matches `limen github deliver`'s stderr text (`src/integrations/github-poller.ts:606-611`) | note · proven | fix: the sentence says what is true; converting that caller needs typed deliver failures, which R-014 (T-26) brings with the registry |
| 5 | `templates/agents.md:166` (spawn's last line is the id) and `docs/groups.md:69` (a "normal" timeout, a process watchdog) contradict the code | note · proven | fix: both say what the code does; the template's history gets its new first line |
| 6 | A member's GROUP_WAIT_TIMEOUT `next` is `limen group status` without an id, not the ticket's `<group>` | note · proven | accepted (a member runs it without an id); the outcome lists it as a deviation |
| 7 | HTTP 403 is GITHUB_CONFIG, but GitHub answers an exceeded rate limit with 403, which T-02 puts in class 3 | note · observed | fix (T-02): a 403 that is a rate limit (`x-ratelimit-remaining: 0` or a `retry-after` header) is GITHUB_NETWORK; other 403 stay GITHUB_CONFIG |
| 8 | After the cap fires, a truly stalled operation keeps the process alive past the final line | note · guessed | rejected: D-028 forbids `process.exit` from a timer, and R-014 cuts `group wait` |
| 9 | Two scan test names carry a second identifier (`R-013`) after `T-01` (T-29 (2)) | note · proven | fix: the names keep one identifier |
| r1-a | `github review`/`work` may return an existing job's id in an older format, which the `ids.job` pattern rejects, so a good handoff would exit 5 (reply 1) | note · guessed | fix: the pattern accepts every form `makeJobId` has written, each with a test |
| r1-b | `src/commands/group.ts:401` relies on `||` binding tighter than `?:` (reply 1) | note · observed | fix: parentheses |
| r1-c | The comment at `test/structure.test.ts:95` claims one writer and one reader; the scan checks writers only (reply 1) | note · observed | fix (T-30): the comment claims what the scan checks |
| r1-d | A missing projects file in `github poll` exits 1 `UNTYPED`, a missing state directory 4 `GITHUB_CONFIG` (reply 1) | note · observed | fix: a missing or unreadable projects file is GITHUB_CONFIG too |
| r1-e | Removed names still exit 1 `UNTYPED`; the stage convention wants 2 and the new form in `next` after R-013 (reply 1) | note · observed | rejected for this ticket: `## Out of scope` keeps them; R-014 (T-18, the registry) types the refusals (`plan.md` → `## State`) |

Taste questions (T-29, T-30): answered; T-29 points to findings 2 and 9 and to two tests with a second reason (the
spawn golden test also waits for `done`; BAD_FLAG also checks that no job folder appears, a trace check of T-38),
which stay; T-30 points to finding r1-c and to two "what" docblocks (`spawnJob`, `continueJob`), acceptable as
contract docs, and the history sentence at `src/old-names.ts:146-147`, which the fix round turns into a reason.

## Round 2 (2026-11-19, night run)

- Inputs: the same three paths; the new diff after the fix round of a fresh `rebuild-implementer` (items 1–10 of
  `ticket.md` → `## Decisions`, review round 1); a fresh reviewer, told to give one line per criterion.
- Main session before the review: `review-guard.mjs compare --git` (a new snapshot before the fix round) → "within its
  limits", exit 0; `node adrian-rebuild/tools/gate.mjs` → exit 0, 198/198; `fails-before.mjs` → exit 0.
- Guard: `review-guard.mjs compare node_modules/.rebuild-review/R-013.before` → `unchanged`, exit 0.
- Parser: `review-verdict.mjs node_modules/.rebuild-review/R-013.reply <ticket.md>` → `consistent`, exit 0.
- Verdict: PASS. AC-1 to AC-9 met; two notes, not blocking.

| # | Finding | Kind | Decision |
|---|---|---|---|
| 1 | Fix 7 uses a named condition instead of parentheses (`src/commands/group.ts:401-402`), with the same result | note · observed | accepted: Biome's formatter removes the parentheses, and a suppression would go against T-27; the outcome records it (deviation 13) |
| 2 | An App key file that passes the checks but holds no usable PEM fails in `createSign(…).sign` with no typed mapping, so likely exit 1 or 5, not 4 (`src/integrations/github-poller.ts:191-194`) | note · guessed | rejected for this ticket: not run; no consumer reads the class of `github poll` yet (its unit treats any non-zero exit as a failure), and the untyped failures go to zero with R-082; `plan.md` → `## State` records it |

Taste questions (T-29, T-30): answered; each round-2 test checks one mechanism, the round-1 second reasons stay as
decided; the new comments give reasons and their identifiers resolve.
