<!-- PL: Wynik R-047 (27.11, noc, przy `9667fe4`; recenzja PASS w rundzie 1, decyzja 11 to domyślna nocna do
potwierdzenia przez Adriana): nowy moduł `src/runtime/mistake-guard.ts` odmawia w
Bash koordynatora `sleep` 30 s lub dłuższego (także czasu, którego nie umie odczytać), a powód kończy się zdaniem T-34;
hook `hook/wake.ts` rejestruje swój handler `tool_call` tylko w sesji koordynatora. Adapter Pi deklaruje `input`
zdarzenia `tool_call` ze strażnikiem, a kontrakt typów liczy pole unii jako sprawdzane, gdy choć jeden jej członek ma
typ, który coś sprawdza (decyzja 11). Instrukcja koordynatora, jej plik referencyjny i `docs/setup.md` mają zdanie
T-34; bramka 1487/1487, a `fails-before.mjs` pokazuje porażkę trzech plików przy HEAD. -->

# R-047 outcome

## Done

The work of two implementer runs: the first stopped with `BLOCKED` on the Pi type contract (answered by Decision 11);
the second finished from its working tree. Line numbers are those of the working tree at `9667fe4`.

1. `src/runtime/mistake-guard.ts`, new (Change 1, T-25 (1)). It imports no module. `WAKE_SENTENCE` is "Limen wakes you
   when a job ends; end your turn instead of waiting." `sleepRefusal(command)` finds each `sleep` at a command's start by
   its own copy of M-05's definition (`COMMAND_START`, the same pattern as `LEAD` in
   `adrian-rebuild/tools/same-task.mjs:51-55`: after a separator, then the reserved words that open a body, assignments
   and the wrappers `nohup`, `time`, `command`, `env` and `timeout <arg>`). It reads the arguments up to the separator
   that ends that command. The length is GNU sleep's sum of its arguments, each a number with an optional `s`, `m`, `h`
   or `d`, or `infinity`. A word it cannot read is `NaN`, which never passes the `< 30` check, so the guard fails closed
   (Decision 4). For the first call of 30 s or more it returns
   "Refused \`<call>\`: the coordinator's session runs no sleep of 30 s or more, or of a length Limen cannot read."
   followed by `WAKE_SENTENCE`. Otherwise it returns `undefined`. The lead's words are those that Decision 11 accepted.
2. `hook/wake.ts` (Change 2): after the job return (`:1131-1133`), a `recorded` `tool_call` handler (`:1134-1147`). It
   reads the payload through `piEvent`. For a tool other than `bash` it returns `undefined`. For `bash` it reads the
   command through `piBashCommand` and returns `{ block: true, reason }` when `sleepRefusal` gives a reason, otherwise
   `undefined`. There is no `terminate`. The comment says why: Pi gives the reason to the model as the call's error
   result in the same run (z. 12), and a job's sleep is a stall the wrapper watches. In a job the function returns
   before the handler, and since R-044 a job's hook set holds no `wake` at all.
3. `src/runtime/pi-api.ts` (Change 3, T-32 (1), (4)): `PiToolCallEvent` gains
   `input: Readonly<Record<string, unknown>>` (`:50`), and its guard checks `input` as an object (`:357`). A new type
   `PiBashInput` (`:52`), a check `BASH_INPUT` (`:377`) and a guard `piBashCommand(event)` (`:468`) give a bash call's
   `command` as a string, or BAD_DATA naming `input.command`, so the hook reads the field only through the adapter
   (Decision 11 accepted this guard).
4. The Pi type contract (Decision 11): `test/runtime/pi-contract.ts` gets a new type `Checks<T, F>` (`:37`). Its
   `Unchecked` (`:47`) names a field only when no member of Pi's type declares it with a type that checks something
   (neither `any` nor `never`, itself or as its element type). A non-union type is one member, so it is checked as
   before. A missing package still makes the compared type `any`, and its fields are named (the two existing
   missing-package tests pass unchanged). `eventsFit` is unchanged, and the file's opening comment says what the rule
   is and why. `test/runtime/pi-contract.test.ts` gets the fixture test (`:265`), with the helper `toolCallUnion`
   (`:252`). The helper makes the fixture's `tool_call` payload a union of a bash member whose `input` is `any` and a
   custom member. The test checks two things: with the custom member's `input` a `Record<string, unknown>`, the
   contract has no diagnostics; with it `any` as well, the contract names `tool_call.input checks nothing`. The test
   "the contract passes the real types of Pi 1.5.1 in the vendor copy" passes again.
5. Text (Change 4): `templates/manual.md:113` ends with `WAKE_SENTENCE` in place of "Never poll with `sleep`.". The
   reference file `test/runtime/context-message/owner-facing-coordinator.md:119` follows it. `docs/setup.md` → Hooks
   gets one paragraph of one sentence (`:189`): in the coordinator's session the wake hook refuses a Bash `sleep` of
   30 s or more, or of a length it cannot read. The model gets the call's error result, which ends with the sentence.
   A job's `sleep` is not refused.
6. Tests (Change 5):
   - `test/runtime/mistake-guard.test.ts`, new, 8 tests, 7 named "T-34: …". `sleep 240` is refused with the full
     reason, ending with `WAKE_SENTENCE`. `sleep 5` and `sleep 29` pass. `sleep 30`, `1m`, `0.5m`, `10 25`, `1h` and
     `infinity` are refused, and `29.9`, `0.4m`, `10 19` and `29s` pass. A sleep after `;`, `&&`, `|`, `$(`, `do`,
     `nohup` and `timeout 5` is refused. `sleep "$T"` and `sleep $((N*60))` are refused. A `sleep` inside another
     command's quoted argument passes. The coordinator's context message, built by `contextMessage`, holds
     `WAKE_SENTENCE` once. The eighth test checks that the module imports nothing (T-38, AC-11). No test sleeps.
   - `test/hook/wake.test.ts`, 4 new tests (`:154`, `:158`, `:165`, `:858`). In a coordinator's session the handler
     blocks bash `sleep 240` with the guard's reason. It returns nothing for `sleep 5` and for a `read` call. It is
     registered in a coordinator's session and not with `LIMEN_JOB=1`. On the fake engine, a coordinator's session
     scripted `tool sleep 240` then `say done` has a `tool` message holding `WAKE_SENTENCE` in its next model call, and
     the transcript's `toolResult` has `isError: true`. With `tool sleep 5` neither happens. The opening comment names
     the new mechanism (T-29 (5)).
   - `test/runtime/pi-api.test.ts`, 2 new tests (`:141`, `:147`). The `tool_call` guard returns an event with its
     `input` and refuses one whose `input` is not an object. `piBashCommand` returns the command and refuses a command
     that is not a string, naming `input.command`.
   - `test/cli/spawn.test.ts`, 1 new test (`:480`): a spawned job scripted `tool sleep 240` gets the tool's own
     result, `(no output)`, and ends `done`.

## Proof

All from the repository root at `9667fe4`, with the change in the working tree.

| Command | Exit | Tests |
|---|---|---|
| `node --test test/runtime/mistake-guard.test.ts` (AC-1) | 0 | 8/8 |
| `node --test test/hook/wake.test.ts` (AC-2) | 0 | 26/26 |
| `node --test test/runtime/pi-api.test.ts` (AC-3) | 0 | 38/38 |
| `node --test test/runtime/pi-contract.test.ts` (AC-3) | 0 | 14/14, the vendor copy's test included (not skipped) |
| `node --test test/cli/spawn.test.ts` (AC-4) | 0 | 35/35 |
| `node --test test/runtime/context-message.test.ts` (AC-4) | 0 | 27/27 |
| `node adrian-rebuild/tools/fails-before.mjs test/runtime/mistake-guard.test.ts test/hook/wake.test.ts test/runtime/pi-api.test.ts` (AC-5) | 0 | all three files fail at HEAD (below) |
| `git grep -q 'Limen wakes you when a job ends; end your turn instead of waiting.' -- templates` (AC-6) | 0 | `templates/manual.md:113` |
| `git grep -q 'Never poll with' -- templates` (AC-7) | 1 | — |
| `git grep -q 'tool_call' -- hook/wake.ts` (AC-8) | 0 | — |
| `node adrian-rebuild/tools/gate.mjs --out node_modules/.rebuild-review/R-047.gate` (AC-9) | 0 | 1487/1487, 349.3 s |
| `npx biome check --error-on-warnings .` (AC-10) | 0 | 301 files |
| `npx tsc --noEmit` | 0 | — |
| `node adrian-rebuild/tools/check.mjs` (AC-10) | 0 | "0 errors" |
| `npx biome check --error-on-warnings adrian-rebuild` | 0 | 36 files |

The criteria with `-q` print nothing. Each match was shown by the same pattern with `-n` or `-c`. AC-6 matches
`templates/manual.md`, `docs/setup.md` and the reference file. AC-7 matches nothing in `templates`, `src`, `hook`, `test`
or `docs`. `git grep` reads tracked files only, so it does not see the new `src/runtime/mistake-guard.ts` until the
commit.

Gate runs, both by this implementer:
1. `gate.mjs --out node_modules/.rebuild-review/R-047.gate` → exit 0: `ℹ tests 1487`, `ℹ pass 1487`, `ℹ fail 0`,
   `duration_ms 345227`. After it, only one comment of `test/runtime/pi-contract.ts` changed (its opening lines, made
   precise).
2. On the final tree, the same command → exit 0: `ℹ tests 1487`, `ℹ pass 1487`, `ℹ fail 0`, `duration_ms 349305`; 12
   T-34 tests passed in it.

1487 is R-045's 1471 plus the 16 new tests (8 + 4 + 2 + 1 + 1). No test failed in any run of this ticket, apart from
the new tests before their change.

## Fails before

AC-5, `node adrian-rebuild/tools/fails-before.mjs test/runtime/mistake-guard.test.ts test/hook/wake.test.ts
test/runtime/pi-api.test.ts` → exit 0, the main session's run of protocol step 4 after its gate (1487/1487, 348.7 s).
The gate's private TMPDIR is shown as `<gate TMPDIR>`; the output is shortened to its lines that say why each file
fails:

```
fails-before: test/runtime/mistake-guard.test.ts, test/hook/wake.test.ts, test/runtime/pi-api.test.ts fail at HEAD (exit 1)
  code: 'ERR_MODULE_NOT_FOUND',
  url: 'file://<gate TMPDIR>/fails-before-jFPoO6/src/runtime/mistake-guard.ts'
✖ test/runtime/mistake-guard.test.ts
SyntaxError: The requested module '../../src/runtime/pi-api.ts' does not provide an export named 'piBashCommand'
✖ test/runtime/pi-api.test.ts
ℹ tests 3
ℹ pass 0
ℹ fail 3
✖ failing tests:
test at test/hook/wake.test.ts:1:1
test at test/runtime/mistake-guard.test.ts:1:1
test at test/runtime/pi-api.test.ts:1:1
```

At HEAD, `test/runtime/mistake-guard.test.ts` and `test/hook/wake.test.ts` cannot load `src/runtime/mistake-guard.ts`,
and `test/runtime/pi-api.test.ts` cannot import `piBashCommand`. A failure at the import does not show that the tests
check their mechanism. So these two runs on the working tree, each before its change, show it:

1. The hook's tests, with the module and the adapter's guard in the tree and no handler yet in `hook/wake.ts`:
   `node --test --test-name-pattern 'T-34' test/hook/wake.test.ts` → `tests 4`, `pass 0`, `fail 4`:
   ```
   ✖ T-34: in a coordinator's session the hook's tool_call handler blocks a bash sleep 240 with the guard's reason
     AssertionError [ERR_ASSERTION]: the hook handles tool_call in a coordinator's session
   ✖ T-34: in a coordinator's session the hook's tool_call handler returns nothing for a bash sleep 5 and for a read
     AssertionError [ERR_ASSERTION]: the hook handles tool_call in a coordinator's session
   ✖ T-34: the hook registers its tool_call handler in a coordinator's session and none in a job's
     AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
   ✖ T-34: on the fake engine a coordinator's bash sleep 240 comes back as an error result that holds the wake sentence, and a sleep 5 as the tool's own result
     AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
   ```
2. The contract's fixture test, with `input` on `PiToolCallEvent` and `Unchecked` as at HEAD:
   `node --test --test-name-pattern 'union payload|real types' test/runtime/pi-contract.test.ts` → `tests 2`,
   `pass 0`, `fail 2`. The new test fails on its union with one typed member, the vendor copy on Pi's union:
   ```
   ✖ the contract passes a union payload whose field one member types, and fails one whose every member's field is any, naming it
     AssertionError [ERR_ASSERTION]: contract.mts:42: TS2322: Type '"none"' is not assignable to type '"tool_call.input checks nothing: it is any, never or not in Pi"'.
     + actual - expected
       [
     +   [
     +     `contract.mts:42: TS2322: Type '"none"' is not assignable to type '"tool_call.input checks nothing: it is any, never or not in Pi"'.`
     +   ],
     -   [],
         true
       ]
   ✖ the contract passes the real types of Pi 1.5.1 in the vendor copy
   ```

The test of `test/cli/spawn.test.ts` passes at HEAD, as it must: nothing refuses a job's sleep at HEAD either, and the
test guards that the handler stays the coordinator's. That is why AC-5 does not name the file.

## Deviations from the ticket

1. Change 5 says the tests each fail at HEAD (T-29). `test/cli/spawn.test.ts`'s new test cannot fail at HEAD, because
   at HEAD nothing refuses a sleep anywhere. It is a guard against a later change that would register the handler in
   jobs. AC-5 leaves the file out for the same reason.
2. Change 3 names only `input` on `PiToolCallEvent` and its guard. The adapter also gains `PiBashInput` and
   `piBashCommand`, so that the hook reads `command` only through the adapter (T-32 (1)). Decision 11 accepted it.
3. Decision 11's contract change touches `test/runtime/pi-contract.ts` and `test/runtime/pi-contract.test.ts`, which
   `## Change` 3 did not name as edited ("stays green").

## Night defaults

For Adrian to confirm in the morning (D-054 (2) (b)): `ticket.md` → Decision 11, the Pi type contract counts a field
of a union payload as checked when one member of Pi's union types it (`test/runtime/pi-contract.ts`), so that
`tool_call.input`, whose built-in members are `typebox` types that do not resolve in the vendor copy, is checked
through Pi's `CustomToolCallEvent`; with it the adapter's guard `piBashCommand` and the refusal's lead.

## Unmeasured

- `unmeasured` (M-05, `plan.md` → `## Measurement`): the number of `sleep` calls and repeated `status` reads in
  coordinator turns before and after (T-34's metric). It is measured with a0.4.0 at seat step 4.8.
- `unmeasured`, with no M-NN: what the bridge makes of the error tool result in Claude Code, and whether the model then
  ends its turn. That is seat step 4.6 (`plan.md` → `## Deployment`, "`sleep 240` is refused with the wake
  sentence") and Out of scope here. The fake engine shows the result only up to Pi's `toolResult` and the model view
  that R-038 declares.

## Open points

1. The hook factory `limenWake` keeps its debt suppression
   (`biome-ignore lint/complexity/noExcessiveLinesPerFunction: split pending`). T-27 (1) asks a ticket that changes such
   a function to remove it. R-111, R-112 and R-044 changed this function too and left it, for the ratchet of R-082
   (`plan.md` → `## Stages`, conventions). Splitting the factory is far beyond this ticket's size S.
2. The guard reads a short sleep followed by a redirection or a comment as a length it cannot read (review round 1,
   note 1, proven): `sleep 5 >/dev/null` gives the argument word `>/dev/null`, `sleep 5 2>&1` gives `2>` (`&` ends the
   call), and `sleep 5 # wait` gives `#`. All are refused, because the guard fails closed (Decision 4, Risk). The
   coordinator has no such waits to run (inventory Q4). Ending the argument words at `<`, `>` and a `#` that starts a
   word: `rejected` (T-17). Revisit when: the coordinator's transcripts show such a refusal of a short `sleep` at
   least twice (source: M-05's count at seat step 4.8, or the refused calls' error tool results in the transcripts).
3. Not run: Decision 11 says a change of the custom member's `input` still fails the contract through `eventsFit`.
   This follows from the assignment of every member of Pi's union to `PiToolCallEvent`. A throwaway check on a changed
   copy of the vendor types needed a write outside the repository, which this run's permissions refused, and the
   ticket's fixture test does not cover the case.
4. The handler runs whether or not the owner muted wakes with `/limen off`. A mute holds wakes until the owner turns
   them on again; it does not drop them (`hook/wake.ts`, `muted`), so the sentence stays true. The ticket ties the
   guard to the coordinator's session only.
