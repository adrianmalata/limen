<!-- PL: Ticket R-029 (A-016 (1), E-9, T-31 (3), T-32 (4), D-055 (2)): każdy detektor sam ustala rodzaj porażki
joba zamiast wzorców na tekście; dziewięć zakończeń bez rodzaju dostaje rodzaj (Q-48); dla `quota` zapisuje się godzina
resetu ze zdarzenia `kendex:rate-limit` albo z `errorMessage`; odmowa strażnika zdarzeń Pi w jobie kończy go
`engine-error`, a w sesji koordynatora daje ostrzeżenie w `limen status`; dwa punkty po R-028 (wynik TERM wyczerpania,
flaga TERM przy `exit`). Stan: napisany 23.11 przy `6d17130` z inwentarza `evidence/inventories/R-029.md`; pytania
rozstrzygnięte dokumentami w `## Decisions`, poza Q-48, które czeka na Adriana; jeszcze nie `ready`. -->

# R-029 One recorded failure cause per job

## Problem

Finding A-016 (high), Decision (1), quoted from `audit.md`: "Limen records one structured failure cause, whoever
detected it: kind (`quota`, `timeout`, `tool-cap`, `stall`, `reaped`, `engine-error`, `exit`, `signal`, `oom`, `queue`,
`read-only-violation`, `quota-exhausted`), detail, and for `quota` the reset time. The reset time is read only from the
provider's error field in the engine result, never from model text." E-9 (`plan.md` → `## Engine facts`): a usage limit
ends the Pi turn with `stopReason: "error"` and the CLI text in `errorMessage` (provider text, not model text); a
structured reset time (`resetAtMs`, `rateLimitType`) appears only on Pi's event bus as `kendex:rate-limit`; its
consequence: "the reset time is taken from `kendex:rate-limit` when present, otherwise from `errorMessage`". T-32 (4)
and D-055 (2): a guard's refusal of a Pi event is, "in a job, `failed` with kind `engine-error`; in the coordinator's
session, a warning in `limen status`; never a silent skip", and both are R-029's. T-31 (3): a fake scenario for every
failure kind of A-016. The D-092 note in `## Tickets` (R-028's review): the exhaustion's TERM drops its result, and the
TERM's flag is taken at the engine's `close`.

Facts at `6d17130` (the read-only inventory `adrian-rebuild/evidence/inventories/R-029.md`; the main session checked the
ones it quotes):
1. The kind is decided after the fact: `failureFrom(detail)` (`src/job/record.ts:728-731`) matches eight
   `FAILURE_PATTERNS` (`:732-744`) and an `error`/`aborted` rule (`failureKind`, `:753-765`: `quota` on the limit text
   or `isRateLimit`, else `engine-error`), in `finalizeJob` through `recordedFailure` (`src/job/finalize.ts:139-149`),
   which then turns `signal` or `reaped` into `oom` from the scope's readings.
2. `resetAt` is written only as `null` (`record.ts:730`); nothing in the tree reads `kendex:rate-limit`, `resetAtMs` or
   `rateLimitType` (grep → 0), and the Pi adapter declares no event bus (`src/runtime/pi-api.ts:120-143`). The seat's
   limit text is `You've hit your session limit · resets <hour> (UTC)` (gate 2 §1, Q1: 12 of 18 failed jobs).
3. Nine finisher sites write a detail no pattern knows, so their kind is `null` (an alert `failed:unknown`):
   `src/runtime/wrapper.ts:48` (group deadline or stop before launch), `:56-60` (the wrapper outside its scope),
   `:164-167` (missing worktree), `:406-407` (the engine's spawn error), `:419-425` (`failInternalJob`, any error the
   wrapper throws), `src/job/spawning.ts:497` (spawn or group launch failed), `:722` and `src/job/continuation.ts:579`
   (failed to launch the wrapper), `spawning.ts:1005` (the wrapper did not become ready).
4. A guard's `BAD_DATA` in a job (`refuse`, `pi-api.ts:282-291`; the guards at `:319-356`): from an event handler Pi
   writes `Extension error (<path>): <error>` to stderr and goes on, so the job can still end `done`; from `tool_call`
   Pi rethrows into an error tool result, and from a tool's `execute` into an error tool result (both seen only by the
   model). In the coordinator's session Pi shows the error in the chat and nothing durable is written; `limen status`
   has no such warning (`src/project/summary.ts:117-135`).
5. `exhaust` (`wrapper.ts:179-199`) logs `<reason>; sending TERM` with `.catch(() => {})` (`:186`) before its call and
   drops the call's `SignalResult` (`:188-189`); the TERM handler's `signalLine` (`:459-468`) already logs a result. The
   outcome reads `termed` in the child's `close` handler (`:276`); the wrapper has no `exit` listener.
6. The fake engine (`test/fake-engine.mjs`) has no word for a limit's text, a rate-limit event or a malformed event;
   its `fire` has no try/catch, so a hook's throw ends it with exit 1 where Pi goes on. No test asserts kind `stall`,
   `exit` or `timeout` (grep of `"stall"`, `kind: "exit"` → 0).

## Change

(a) Each detector passes its failure (kind and detail) to `finalizeJob`, whose `failed` branch takes a failure rather
than a detail: timeout, tool cap, stall, exit, signal and queue in the wrapper, reaped in the reaper, and `quota` or
`engine-error` from the engine's failed stop reason (the rule of `failureKind`, moved to that one detector, with
`isRateLimit`). `recordedFailure`'s `oom` rule applies to a passed `signal` or `reaped`, as today. `failureFrom` and
`FAILURE_PATTERNS` stay only for the migration (D-057 (4)), so no new end reaches them.

(b) The nine sites of fact 3 (Q-48): `launch` for every end where the engine did not start (the wrapper outside its
scope, the missing worktree, the engine's spawn error, a failed spawn or group launch, the two failed wrapper launches,
the handshake); `internal` for an error the wrapper throws (`failInternalJob`); the group deadline before launch is
`timeout`. Both kinds join `FAILURE_KINDS`, the order of `limen stats` and the alerts' line.

(c) The reset time of a `quota` failure: `resetAtMs` of a `kendex:rate-limit` event the job's engine received,
else the `errorMessage` text: `resets <hour> (<zone>)` is the first such hour after the error's time, `resets <month>
<day>, <hour> (<zone>)` that time; a text with no zone, or no match, keeps `resetAt` `null` (A-016 (4)). The event: a
job hook subscribes through a new `events` member of the Pi adapter (T-32 (1), with the contract test), writes the
event's type and reset time into the record (an optional field, D-079), and logs one line `rate-limit event: <type>,
resets <ISO time>`, which seat step 3.4 reads.

(d) A guard's refusal in a job (T-32 (4)): the adapter records it in the job's record before it throws (an optional
field with the event, the field and the time; the first refusal kept), so the event handlers, `tool_call` and a tool's
`execute` are one path. At the job's end a recorded refusal makes the end `failed`, kind `engine-error`, detail `a
Limen hook refused Pi event <name>: <field> …`, where the end would otherwise be `done`, `exit` or an engine
`engine-error`; a limit, a signal, a queue end or `quota` keeps its own kind (A-019: the first cause; R-034 resumes
`quota` jobs).

(e) A guard's refusal in the coordinator's session: the hook writes it into the session's folder
`.limen/coordinators/<session>/` (the newest refusal), and `limen status` shows one warning line with the session, the
time and the detail while that file is there; `limen status` writes nothing (T-04).

(f) The D-092 note: the exhaustion's TERM logs its result in `signalLine`'s form after the call, with no
`.catch(() => {})` (the `SWALLOWED` ratchet's baseline goes down by one); the TERM's flag is taken at the engine's
`exit` event, while the end still waits for `close` for the stream's tail.

(g) The fake engine: a word for an assistant error with an `errorMessage` (a synthetic copy of Q1's format), a word that
emits `kendex:rate-limit` on its `events`, a word that sends a malformed event to the hooks; its `fire` reports a hook's
throw on stderr as Pi does and goes on.

(h) Tests, each failing before the change: one per kind with a detector (T-31 (3): `quota` with its reset time,
`timeout`, `tool-cap`, `stall`, `exit`, `signal`, `oom`, `reaped`, `queue`, `engine-error`, `launch`, `internal`), each
asserting the record's kind; the reset time from the event, from an hour without a date, from a date with a zone, and
`null` for a text with no zone; a guard's refusal in a job ends `engine-error`, and a refusal before a timeout keeps
`timeout`; the coordinator's warning in `limen status` and its read leaving `.limen/` unchanged; the exhaustion's TERM
result line; a TERM after the engine's `exit` does not make the end a signal.

(i) `limen show` prints a failed job's kind and, for `quota`, its reset time. Text that becomes false:
`docs/jobs.md:44`, `:49`, `:53`; the comments `src/job/record.ts:74-75`, `:728`, `:745-751` and
`src/job/finalize.ts:139-144`. Seat step 3.4 in `## Deployment` already reads the log line (the main session wrote it
with this ticket).

## Out of scope

- The resume of `quota` jobs, owed wakes, `quota-exhausted` and the cut of `docs/seat/quota-resume.ts` (R-034); the
  hourly usage reading for a `null` reset time (R-059); `read-only-violation` (R-045).
- The stall over the job's scope (R-036), which keeps the stall's detail prefix.
- The engine's stdout through `src/boundary.ts` (`src/runtime/stream.ts`, R-017's Out of scope).
- The T-31 (4) scan for real waiting in `test/`.

## Acceptance

- AC-1: `node --test test/job/record.test.ts` → exit 0; `node --test test/job/finalize.test.ts` → exit 0.
- AC-2: `node --test test/runtime/wrapper.test.ts` → exit 0; `node --test test/s3-finish-wake.test.ts` → exit 0.
- AC-3: `node --test test/runtime/pi-api.test.ts` → exit 0; `node --test test/runtime/pi-contract.test.ts` → exit 0.
- AC-4: `node --test test/cli/status.test.ts` → exit 0; `node --test test/cli/show.test.ts` → exit 0.
- AC-5: `node --test test/cli/stats.test.ts` → exit 0; `node --test test/seat/alerts.test.ts` → exit 0.
- AC-6: `node --test test/structure.test.ts` → exit 0.
- AC-7: `node adrian-rebuild/tools/fails-before.mjs` → exit 0, its output in `outcome.md` → `## Fails before`.
- AC-8: `node adrian-rebuild/tools/gate.mjs` → exit 0.
- AC-9: `npx biome check --error-on-warnings .` → exit 0; `node adrian-rebuild/tools/check.mjs` → exit 0.
- AC-10 (judgment): every `failed` record written by new code has a kind set by the code that detected the failure,
  never read back from its detail; the reset time comes only from the event or the provider's `errorMessage`; a
  guard's refusal is never silent, in a job or in the coordinator's session.

## Migration

None. The new record fields are optional (D-079's additive pattern); the two new kinds are values a record of older
code never holds; records written before keep their pattern kinds, and the migration still fills kinds by the
patterns (D-057 (4)).

## Risk

- A job whose hook met a malformed Pi event now ends `failed` where it ended `done`; its work stays on its branch
  (A-001), and the coordinator sees `engine-error` with the event's name.
- If the CLI sends no `rate_limit_event` for the 5-hour and weekly limits (E-9, a seat check), the reset time comes
  from the text, and the weekly text with no zone gives `null`, which R-059's usage reading covers.

## Rollback

`git revert $(git log --format=%H --grep='^R-029:' adrian-rebuild --)`. After a revert, a record with a new field or
kind is `BAD_DATA` (D-079), as R-035's `queueWait` is; the rollback of a format change is the snapshot of
`## Deployment` 0.1.

## Decisions

Settled by the documents when the ticket was written (2026-11-23, the main session's reading, not a night default; the
inventory's questions in `evidence/inventories/R-029.md` → section 10):
1. The kind is an argument of each detector (question 1): A-016 (1) "whoever detected it", R-028's Decision 8 and the
   D-092 note say so; the patterns stay for the migration only (D-057 (4)).
2. Q-48 (question 2; asked 2026-11-23, waiting for Adrian): the main session's recommendation is in (b). A-016's list
   names no kind for an end where the engine did not run or Limen itself failed; adding one changes a gate-2 decision.
3. The group deadline before launch stays `timeout` (question 3): it is a deadline, and the detail names the group.
4. The reset time's source (question 4): E-9's consequence in `## Engine facts` settles it, and A-016's "the provider's
   error field in the engine result" is `errorMessage` (E-9: "provider text, not model text"); the comment at
   `record.ts:749-750` and R-097's review meant the detail as finalize reads it, and both give way. A reset hour with
   no date is the next such hour after the error, the 5-hour window's only reading; a text with no zone is not read
   (z. 10: no guessed zone), and `null` goes to R-059's usage reading (A-016 (4)).
5. Seat step 3.4's "whether a `rate_limit_event` arrived" (question 5) is a log line, with the reset time in the record
   (KISS); no field records an absence.
6. `stream_idle` stays `engine-error` (question 6): it is no subscription limit, and the bridge frames it as a
   retryable overload; `rateLimitType` is recorded only from the event.
7. A guard's refusal in a job (questions 7, 8) is recorded where every guard throws, in the adapter, so the three paths
   of fact 4 are one; it decides the kind at the job's end, not at once, since no signal path is needed and A-019 keeps
   the first cause; a written record field rather than the engine's stderr text (z. 2).
8. The coordinator's warning (question 9) lives in the session's folder, which the wake hook already keeps
   (`src/integrations/coordinator-registration.ts:14-18`), so `limen status` only reads it (T-04); it goes with the
   session's folder.
9. The D-092 note's two items (question 10) as (f); the `SWALLOWED` ratchet only goes down.
10. The fake engine's words (question 11) are the implementer's names (D-054 (2) (b)); no clock seam (question 12):
    T-31 (3)'s "artificial clock" is met by test knobs and planted times, as the tests already do, and the T-31 (4)
    scan is not this ticket's.
11. `read-only-violation` and `quota-exhausted` (question 13) get their tests with their detectors (R-045, R-034).
12. Readers (question 14): `limen show` shows the kind and the reset time; the wake's summary from record fields is
    R-034's (A-016 (3)).
13. Seat (question 15): step 3.4 (bridge) only; a guard's refusal cannot be provoked on the seat, so its proof is the
    fake engine's test (T-28 (5)), and step 2.2's "no extension error" check stays.
14. The boundary with R-034 (question 16): R-029 records `quota` with `resetAt` or `null`, and everything that acts on
    it is R-034's.
