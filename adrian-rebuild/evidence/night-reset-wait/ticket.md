<!-- PL: Specyfikacja zmiany nocnego runnera według D-131, w kształcie ticket.md dla recenzji rebuild-reviewer; bez
numeru R-NNN, bo dotyczy narzędzi przebudowy, jak D-105 (1). Gdy przebieg `claude -p` kończy się limitem subskrypcji
(pole `api_error` wyniku stream-json, nie tekst), `night.mjs` czeka do `resetsAt` z minutą zapasu i nie liczy tego
przebiegu jako ponowienia; nigdy nie startuje o godzinie końca ani po niej. Stan: napisany 27.11 przez sesję główną
`limen-rebuild-42`; trzy rundy recenzji (PASS), poprawki F1–F5 i G1–G3; przebieg recenzji w review.md, wynik
w outcome.md. -->

# The night runner waits for the limit's reset instead of spending a retry (D-131)

## Problem

In the night of 2026-11-26/27 run 1 of `night.mjs` ended at 20:20:11 on the five-hour limit (reset 22:30). The runner
retried after 30 and 60 minutes; runs 2 (20:50:11) and 3 (21:50:14) each ended within 3 s on the same limit with no
tool call, so two of the three retries were spent before the reset, and only run 4 (23:50:16) worked
(`.night/launcher.log`, `.night/2026-11-26-run-{1,2,3}.log`). The night of 2026-11-20/21 lost run 2 the same way (it
ended at 02:36 on a limit that reset at 03:00).

The runs' stream-json shows the limit in fields (every limit-ended run in `.night/`, checked by the main session on
2026-11-27): the run's last line of `type` `result` has `api_error` `"usage_limit_reached"` and `terminal_reason`
`"api_error"`, and the top-level API error message right before it (`type` `assistant`, `parent_tool_use_id` `null`,
`is_api_error_message` `true`) has the same `api_error` and `api_error_params.rate_limit_info` with `resetsAt` (seconds
since the epoch) and `rateLimitType` (`five_hour` or `seven_day`). The `result` line itself has no
`api_error_params`; its `result` text ("You've hit your 5-hour limit · resets 10:30pm") is prose (z. 2).

Relied on (quoted):
- D-131: "when a run of `night.mjs` ends on a subscription limit, read from the run's stream-json result (`api_error:
  "usage_limit_reached"` with `api_error_params.rate_limit_info.resetsAt` and `rateLimitType`), never from its text
  (z. 2), the runner waits until `resetsAt` and does not count that run as a used retry; it still never starts a run at
  or after `--until`. Built by the main session with a test in `tools/test-night.mjs` and a `rebuild-reviewer` review,
  as D-026 was."
- D-019: the retries after 30, 60 and 120 minutes, at most 3 a night, never a run at or after the end; exit 3 for a
  night without a reason, exit 4 for a failure of the runner itself.
- z. 1 (a hard exit condition of every loop), z. 2 (the decision by a field, not by text).
- T-01: an expected absence (`ENOENT`) is an explicit condition, never a catch-all; T-27: data from outside is read
  through checks of its shape; T-29 (3): one test, one mechanism; T-30: a comment says why.

## Change

- `adrian-rebuild/tools/night.mjs`:
  - `usageLimit(text, ended)`: from a run's output and the time it ended, the limit that ended it, or `undefined`. A run ended on a limit
    when its last `result` line has `api_error` `"usage_limit_reached"`; the reset is the `rate_limit_info` of the last
    top-level line (`parent_tool_use_id` `null`) with that `api_error` before that `result`. The value is
    `{ type, resetsAt }`: `type` the `rateLimitType` when it is a plain word (`[a-z_]+`), "subscription" otherwise,
    since it goes into log lines; `resetsAt` a valid `Date` when `resetsAt` is a positive safe integer at most seven
    days (the longest window, G3) after `ended`, `undefined` otherwise. A line that is not a JSON object is skipped (stderr, the runner's lines).
  - After a run without a reason in `status.json`, the runner reads `usageLimit` over what that run appended to its log
    (from the offset taken before the run, as the count of D-026 does). When the run ended on a limit with a `resetsAt`
    after the run's end, the next run starts one minute after `resetsAt` (`RESET_MARGIN`: a laptop clock slightly ahead
    of the server's would otherwise start a run that meets the same limit and spends a retry), and the run is not
    counted as a retry; the log gets `night: run <n> ended on the <type> limit, which resets at <time>; the next run
    at <time>, not a retry (D-131)`. When that start would be at or after the end, the night ends with exit 3 and a
    line naming the reset. After the wait, an end that came during it still ends the night with exit 3 (as today).
  - A limit with no usable `resetsAt` (none, no valid date, or more than seven days after the run's end, G3), or with a
    `resetsAt` not after the run's end, is a counted retry as today, with a line stating which (F4: the line after it
    says whether a retry or the end follows). The run's output is read once, before the runner's notes append to the
    log, and serves both the count of D-026 and the limit; a read that fails is a line for each (its error code, as the
    count has it today) and a counted retry, never the end of the night (both are side channels, T-01).
  - The counted retries get their own counter, so `retry <k> of 3` and the 30/60/120-minute waits follow the counted
    retries only; a run's number still counts every run (the log names).
  - The Polish summary and the usage comment name D-131.
- `adrian-rebuild/tools/test-night.mjs`: the fake prints a step's `lines` (it already can); the limit lines carry the
  fields of `.night/2026-11-26-run-2.log` lines 4 and 5 (ids left out). Fourteen new tests, each one mechanism:
  1. a run that ends on a limit waits until one minute after `resetsAt`;
  2. such a run spends no retry: a limit run, three runs without a status and a `done` exit 0 with the waits 61, 30,
     60 and 120 minutes;
  3. a reset whose next run would start at `--until` ends the night with exit 3 and no further run;
  4. a wait for a reset that wakes up after `--until` starts no run;
  5. a limit whose `resetsAt` is not after the run's end is a counted retry, with a line;
  6. a limit with no reset time is a counted retry, with a line;
  7. the reset comes from the main session's limit message, not from a subagent's;
  8. a limit message followed by a `result` without `api_error` is no limit of the run;
  9. a limit in an earlier night's part of the same log is not this run's;
  10. a run whose output cannot be read is a counted retry, with a line;
  11. (F2) a reset time that makes no valid date is a limit with no reset time;
  12. (F3) a limit type that is not a plain word is logged as "subscription", so it forges no line;
  13. (F5) a second limit `result` without a limit message of its own has no reset time;
  14. (G3) a reset more than seven days after the run's end (a `resetsAt` in milliseconds) is no usable reset time.
- `adrian-rebuild/plan.md` → `## State`: the entry of this change.

## Out of scope

- The rebuild prompt's "najwyżej 3 razy na noc" (`input/prompt.md`, Adrian's): D-131 changes what counts as a retry.
- D-019's text in `## Decisions`: decisions are appended, never rewritten; D-131 stands after it.
- A limit inside a run that the session survives (a subagent's limit with the main session going on): only how the run
  ended counts.

## Acceptance

- AC-1: `node --test adrian-rebuild/tools/test-night.mjs` → exit 0.
- AC-2: the new tests 1–7 and 10–14 fail with the `night.mjs` of `HEAD`; tests 8 and 9 guard against a false limit and
  pass at `HEAD` by construction, so each fails under a mutation of the change instead (run by the main session on
  copies, recorded in `outcome.md`).
- AC-3: `npx biome check --error-on-warnings adrian-rebuild` → exit 0; `node adrian-rebuild/tools/check.mjs` → exit 0.
- AC-4 (judgment): no path waits without a bound (every wait ends before `--until` or ends the night); the end is
  still decided only by `status.json`; the limit is read from fields only; a run's text never decides.

## Migration

None: no file format changes; the logs gain lines.

## Risk

- A server that kept answering with a `resetsAt` a few seconds ahead would let the runs repeat until `--until` without
  spending retries; each wait still moves past a reset that was in the future at the run's end, and the night still
  ends at `--until`. Observed values are the windows' real ends (five-hour and weekly).
- Claude Code may change the stream-json fields; then `usageLimit` finds no limit, or no usable reset (a missing
  field, no valid date, a reset beyond the longest window such as one in milliseconds, G3), and the runner falls back
  to today's counted retries (no new failure).

## Rollback

`git revert` of this `Tools:` commit; nothing on disk changes.

## Decisions

1. 2026-11-27 D-131 (Adrian, 2026-11-27 about 00:25: "zapisz tę poprawkę na później, bo to dobry pomysł").
2. 2026-11-27 the main session's reading of D-131's "the run's stream-json result": the `result` line decides that the
   run ended on a limit (`api_error`), and `resetsAt` and `rateLimitType` come from the API error message right
   before it, since the `result` line has no `api_error_params` in any of the observed runs (`## Problem`).
3. 2026-11-27 the main session's reading of "waits until `resetsAt`": one minute after it (`RESET_MARGIN`), so a clock
   slightly ahead does not spend a retry; a reset not after the run's end is no wait, but today's counted retry, so
   every uncounted wait moves past a future reset and the loop keeps a hard bound (z. 1).
4. 2026-11-27 review round 1 (`review.md`), fixed by the main session:
   - F1: `## Change` says what the code does: `type` is "subscription" when `rateLimitType` is no plain word, and it
     quotes the wait line as written.
   - F2: a `resetsAt` that makes no valid date (a safe integer above 8.64e12) is the "no reset time" case; a test.
   - F3: `rateLimitType` goes into log lines the day session reads, so only a plain word (`[a-z_]+`) is taken; a test
     with a newline in it finds "subscription" and no forged line.
   - F4: the line on a limit that gives no wait states the fact without "a counted retry"; the next line says whether
     a retry or the end of the night follows.
   - F5: a test of a run whose second limit `result` has no limit message of its own: no reset time, a counted retry.
5. 2026-11-27 review round 2 (`review.md`), the last round of fixes, by the main session:
   - G1: `## Change` counts the 13 tests, and its F4 line is wrapped.
   - G2: the Polish summary of `tools/test-night.mjs` says what the D-131 tests check (a subagent's limit message does
     not set the run's reset; the plain-word type).
   - G3: a reset more than seven days after the run's end (the longest window, `seven_day`) is no usable reset time,
     so a `resetsAt` in milliseconds falls back to the counted retries instead of ending the night at once; a test.
     Seven days, not `HORIZON_HOURS`: a weekly limit's real reset lies days ahead and still ends the night at once,
     since no run before the end could work.
