<!-- PL: Wynik zmiany nocnego runnera według D-131, zrobionej przez sesję główną `limen-rebuild-42` 27.11: przebieg
zakończony limitem subskrypcji (pola `api_error` i `resetsAt` w stream-json) czeka do minuty po resecie i nie zużywa
ponowienia; reset na godzinie końca kończy noc kodem 3, a brak użytecznego resetu daje zwykłe ponowienie. Nowe testy
padały przed zmianą (12 z 14, dwa pozostałe przez mutacje), a dziesięć mutacji wywraca po swoim teście. Stan:
zamknięty po trzech rundach recenzji (PASS w każdej); nie zmierzony na prawdziwej nocy. -->

# Outcome: the night runner waits for the limit's reset (D-131)

## Done

1. `adrian-rebuild/tools/night.mjs`:
   - `readRun` reads what a run appended to its log once, before the runner's notes; the count of D-026 and the limit
     both use it, and a failed read is a line for each (the error code).
   - `usageLimit(text, ended)`: the run ended on a limit when its last `result` line has `api_error`
     `"usage_limit_reached"`; `type` and `resetsAt` come from the main session's API error message before it (a plain
     word, else "subscription"; a valid date at most seven days after the run's end, else no reset).
   - `nextRun`: a reset after the run's end gives the next run one minute after it (`RESET_MARGIN`), not counted; every
     other case is the counted retry of D-019 (30, 60, 120 minutes, now by their own counter). A start at or after
     `--until` ends the night with exit 3 and a line naming the reset; the check after the wait stays.
   - Log lines: `night: run <n> ended on the <type> limit, which resets at <time>; the next run at <time>, not a retry
     (D-131)`, and for a limit with no wait the fact alone (no usable reset time, a passed reset, no limit read).
2. `adrian-rebuild/tools/test-night.mjs`: 14 tests of D-131 (the ticket's `## Change` 1–14), the limit lines with the
   fields of `.night/2026-11-26-run-2.log` lines 4 and 5.
3. `adrian-rebuild/evidence/night-reset-wait/`: `ticket.md` (Decisions 2–5: the main session's readings of D-131 and
   the fixes F1–F5, G1–G3), `review.md` (three rounds), this file.

## Proof

| Command | Exit | Result |
|---|---|---|
| `node --test adrian-rebuild/tools/test-night.mjs` (AC-1) | 0 | 43/43 |
| `npx biome check --error-on-warnings adrian-rebuild` (AC-3) | 0 | 36 files |
| `node adrian-rebuild/tools/check.mjs` (AC-3) | 0 | "0 errors" |

## Fails before (AC-2)

- `HEAD`'s `night.mjs` with the new test file and `tool-calls.mjs`, on a copy in the session's scratchpad: `node --test`
  → exit 1, 43 tests, 31 pass, 12 fail, exactly the new tests 1–7 and 10–14. Tests 8 (a `result` without `api_error`)
  and 9 (a limit in an earlier night's part of the log) pass at `HEAD` by construction.
- Ten mutations of the changed `night.mjs`, each on its own copy; each fails its test:

| Mutation | Fails |
|---|---|
| a limit message alone counts, the `result` ignored | 8, 13 |
| the run's output read from byte 0 | 9 (and the D-026 offset test) |
| a subagent's limit message taken | 7 |
| no margin after the reset | 1–4, 7 |
| a limit wait counted as a retry | 1, 2, 12 |
| a reset equal to the run's end waits | 5 |
| no date check at all | 11, 14 |
| no seven-day bound | 14 |
| any string as the type | 12 |
| the limit message not reset at each `result` | 13 |

- The three reviewers each ran `HEAD`'s runner in memory and found the same failures (8, 11, 12 as the tests grew).

## Deviations

- `## Change` grew in the review: F2, F3 and G3 bound `resetsAt` and `rateLimitType` (an invalid date, a non-word type,
  a reset beyond seven days), and F4 changed the lines on a limit with no wait to state only the fact.
- The `plan.md` → `## State` entry goes into the same `Tools:` commit (review round 1, note 1).

## Unmeasured

- That a real night's limit-ended run is followed by the next run one minute after its reset: the first night that
  meets a limit shows it in `.night/launcher.log` ("not a retry (D-131)"). `usageLimit` over the existing logs gives the
  right resets (five_hour 22:30 for 2026-11-26 runs 1–3, 03:00 for 2026-11-20 runs 1–2, seven_day for 2026-11-20 run 3),
  as the reviewers checked.

## Open points

1. Review round 2's T-29 remark: the one-minute margin is part of the expected waits of tests 1–4 and 7, so removing it
   fails five tests; accepted, since the margin is part of the visible wait.
