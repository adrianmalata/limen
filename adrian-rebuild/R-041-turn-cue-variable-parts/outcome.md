<!-- PL: Wynik R-041 (27.11, przy `a079bb5`, zamknięty): wskazówka tury to teraz wiadomość `limen-turn-cue`
z linią odbiorcy (koordynator: odpowiedź w języku ostatniej wiadomości właściciela; job: prosty techniczny angielski),
liniami zmiennymi (porażka poprzedniej tury, ticket joba, ostatnia edycja, za długa tablica) i kotwicą ramy, jedna
linia każda. `templates/communication.md` usunięty; reguła języka otwiera rejestr właściciela, akapit ASD-STE100
trafił pod `## Agent` rejestru agenta, a linia wizji joba do jego wiadomości kontekstowej. Testy padały przed zmianą;
bramka implementera 1439/1439, `check.mjs` i Biome zielone. Runda 1 recenzji: PASS z czterema uwagami; poprawki
F1–F2 to tylko tekst (komentarz haka, `CONTRIBUTING.md:29`, `docs/setup.md:187`), bramka po nich 1439/1439; po
BLOCKED o odwołanie w `plan.md` F1 objęło też „since the last turn” w trzech miejscach, `check.mjs` i Biome zielone.
Runda 2: FAIL na zdaniu „nie powtarza niczego z wiadomości kontekstowej”; ostatnia runda poprawek G1–G3 (tekst).
Runda 3: PASS. Bramki sesji głównej: 1438/1439 (wystąpienie A-092, D-135), potem 1439/1439 trzykrotnie. -->

# R-041 outcome

## Done

1. The turn cue (Change 1), `hook/communication.ts`:
   - `CUE_TYPE` is `"limen-turn-cue"`, and the same constant names the tag pair, so the type and the tags cannot
     drift apart (D-134 (1)).
   - `turnCue(root, job, lastTouch, failed)` joins with one newline, inside `<limen-turn-cue>` and
     `</limen-turn-cue>`, the lines that apply, in this order: the audience line (`OWNER_AUDIENCE` in the coordinator,
     `AGENT_AUDIENCE` in a job, T-13); `Last turn failed (<reason>).`, the reason as `assistantStopReason` gives it
     (D-134 (2)); a job's `Ticket: <path>` (`ticketLine`, over the existing `jobTicket`); the touch line; the
     coordinator's board advisory; the capability frame's `## Cue` section (A-043). An empty line is dropped, as HEAD
     dropped an empty anchor.
   - `registerCue`, `isWakePrompt`, the `wake` parameter, the job's vision and board lines, and the imports of
     `CUE_FILE`, `MAX_CONTEXT_LINES` and `markdownSection` are gone. The `before_agent_start` handler still runs the
     event's guard (T-32 (4)) but no longer reads the prompt. No other handler changed.
   - The hook's header comment says what the cue holds.
2. `templates/communication.md` is deleted with `git rm` (staged), and `CUE_FILE` is gone from
   `src/runtime/context-message.ts` (Change 2).
3. The job's vision line (Change 3), `src/runtime/context-message.ts`: `VISION_LINE` is today's cue line, unchanged.
   `visionLine(root)` gives it while the project at `root` holds `spec/vision.md` (the file exists, as the cue checked
   at HEAD), else `""`, which adds no part. It takes the coordinator's vision part's place, so it comes after the
   registers and before the styleguide, and the vision file's module parts would follow it (no module has one). The
   comments of `VISION_FILE` and `contextMessage` follow.
4. `templates/registers/owner.md` line 1 is the two sentences of D-134 (4), verbatim (Change 4).
5. `templates/registers/agent.md`: the ASD-STE100 paragraph, unchanged, is the first paragraph under `## Agent`
   (Change 5).
6. `templates/keeper.md`: the sentence about the per-turn project cue is gone (Change 6).
7. Text (Change 7, T-30):
   - `CONTRIBUTING.md:29`: the stable guidance lists "the vision or, for a job, a line that points at it", and "a short
     per-turn cue holds only the audience line with the reply's language, the lines that apply, and the capability
     frame's one-sentence anchor".
   - `CONTRIBUTING.md` → `## Registers and cues`: the cue file's paragraph became one sentence on what the cue holds
     (its type, its lines in order, where they are written); the reminder sentences after it stay. The owner
     register's description names the reply's language (see Deviations 4).
   - `docs/setup.md` → `### Hooks`: a job's message lists the line that points at `spec/vision.md`; the note on each
     turn names its type, the audience and language, the variable lines and the anchor, and says a wake gets the same
     note. The wake cue sentence is gone.
8. Tests (Change 8, T-29):
   - `test/hook/communication.test.ts`: new goldens of the coordinator's cue with no variable line and of a job's cue
     with a ticket line (the anchor read from `templates/capability.md` → `## Cue`); the failure line after a
     `message_end` with `stopReason` `"error"`, and none in the cue after; a wake prompt gets the owner prompt's cue;
     T-13 (no "English" in the owner cue, "Plain technical English." in the agent cue); the `customType`
     `limen-turn-cue` with `display: false`; a job's cue names neither `spec/vision.md` nor `spec/build.md`. The four
     tag checks name `<limen-turn-cue>`. The A-039 test now compares the cue with and without a project register and
     reads no package file.
   - `test/runtime/context-message.test.ts`: T-13's golden (the owner register part opens with the language rule); the
     worker's vision line, once, right between the agent register's text and the styleguide part, and none once
     `spec/vision.md` is removed; the ASD-STE100 paragraph first under `## Agent` in every role's message. The nine
     reference messages under `test/runtime/context-message/` follow: the ASD-STE100 paragraph in all nine, the new
     first line of the owner register in the coordinator's, the vision line in the eight job messages, and the
     keeper's cut sentence in `keeper.md`. They were changed by exact text replacement, so their diff holds only these
     lines (36 insertions, 2 deletions), and the A-051 tests show they equal the module's output.
   - `test/seat/bridge-contract.test.ts`: the synthetic cue and its custom type use `limen-turn-cue`.
9. Review round 1 fixes (`ticket.md` → `## Decisions`, last entry; text only, so no new test):
   - F1: the header comment of `hook/communication.ts` (`:74-75`) and `CONTRIBUTING.md:29` say the cue holds "the
     lines that apply", no longer "what changed since the last turn": the ticket line repeats on every turn and the
     board advisory is a standing state.
   - F2: `docs/setup.md:187` says the note ends with the one sentence of the capability file's own `## Cue` section,
     apart from its `## Frame`, which the context message holds, so "repeats nothing the context message holds" and the
     anchor no longer read as a contradiction.
   - F1's reason, widened with the round's `BLOCKED` (`ticket.md` → `## Decisions`, last entry): "since the last turn"
     is gone from the `turnCue` doc comment (`hook/communication.ts:239`), `CONTRIBUTING.md:39` and
     `docs/setup.md:187`. Each list now names "the last turn" where its item needs it (its failure, the file it
     touched), and no longer claims the ticket line or the board advisory changed since then.

The cue's size, measured from the package texts (bytes / 4): the coordinator with no variable line 268 bytes ≈ 67
tokens, a job with a ticket line 290 bytes ≈ 73 tokens, the anchor alone 164 bytes ≈ 41 tokens (HEAD: 882 ≈ 221, on a
wake 1046 ≈ 262, a job with a ticket line 949 ≈ 237). This is the Risk's estimate.

## Proof

- `node adrian-rebuild/tools/gate.mjs --out <scratchpad>/gate.txt` → exit 0, 1439/1439, 0 fail, 0 cancelled, 0
  skipped (350.6 s), the implementer's one run on the final tree (AC-9).
- The main session's gate (`node adrian-rebuild/tools/gate.mjs --out node_modules/.rebuild-review/R-041.gate`) on the
  same tree → exit 1, "ℹ tests 1439 … ℹ pass 1438 … ℹ fail 1" (365.1 s): "✖ the toast of a done job whose older record
  holds open checks is the plain done toast" (`test/hook/wake.test.ts:318`), "ENOTEMPTY: directory not empty, rmdir
  '…/limen-wake-open-checks-…/home/.limen'". An occurrence of A-092 (D-135 (1)): the test executes nothing this ticket
  changes, and the gate runs once more.
- The main session's gate once more, same command and tree → exit 0, 1439/1439 (352.3 s).
- After review round 1's fixes F1 and F2: `node adrian-rebuild/tools/gate.mjs --out <scratchpad>/gate-round1.txt` →
  exit 0, 1439/1439, 0 fail, 0 cancelled, 0 skipped (342.6 s), the implementer's one run; `npx tsc --noEmit` → exit
  0; `npx biome check --error-on-warnings .` → exit 0, 295 files; `npx biome check --error-on-warnings adrian-rebuild`
  → exit 0, 36 files; `node adrian-rebuild/tools/check.mjs` → exit 1, "1 errors": `adrian-rebuild/plan.md:
  \`test/hook/wake.test.ts:318\`: test/hook/wake.test.ts does not exist at rebuild-base`, in the main session's D-135
  entry, not in this ticket's files. The implementer replied `BLOCKED`, and the main session dropped `:318` (option
  (a)).
- After the widened F1 (three text places, of which one code comment): `git grep -n 'since the last turn' -- hook src
  CONTRIBUTING.md docs` → exit 1, no match; `npx tsc --noEmit` → exit 0; `npx biome check --error-on-warnings .` →
  exit 0, 295 files; `npx biome check --error-on-warnings adrian-rebuild` → exit 0, 36 files;
  `node adrian-rebuild/tools/check.mjs` → exit 0, "0 errors". The gate was not run again: no code changed beyond the
  `turnCue` comment, so the 1439/1439 run above covers the code.
- After review round 2's fixes G1–G3 (text only: `docs/setup.md:187` and the header comment of `hook/communication.ts`
  say the cue repeats no register section and that its audience line carries the language the registers' rule names;
  the `VISION_LINE` comment says the line rides the frozen message because it does not change within a session,
  D-134 (3), z. 3; Done 7 quotes `CONTRIBUTING.md:29` as it reads now): `git grep -n 'repeats nothing\|repeats
  none\|only when its work needs' -- hook src docs CONTRIBUTING.md` → exit 1, no match; `npx tsc --noEmit` → exit 0;
  `npx biome check --error-on-warnings .` → exit 0, 295 files; `npx biome check --error-on-warnings adrian-rebuild` →
  exit 0, 36 files; `node adrian-rebuild/tools/check.mjs` → exit 0, "0 errors". The gate is the main session's run.

- `node --test test/hook/communication.test.ts` → exit 0, 42/42 (AC-1).
- `node --test test/runtime/context-message.test.ts` → exit 0, 27/27; `node --test test/seat/bridge-contract.test.ts`
  → exit 0, 5/5 (AC-2).
- `node --test test/cli/spawn.test.ts` → exit 0, 31/31; `node --test test/s4-steering.test.ts` → exit 0, 6/6 (AC-3;
  s4 after Deviations 1).
- AC-4: the main session's `fails-before.mjs` run (`## Commands` lists it for the main session only); the
  implementer's own runs before the change are in `## Fails before`.
- `git grep -q 'limen-project-context' -- hook src test` → exit 1 (AC-5).
- `git grep -q 'CUE_FILE\|templates/communication\.md' -- hook src test CONTRIBUTING.md docs` → exit 1 (AC-6).
- `git grep -q 'audience cue' -- templates` → exit 1 (AC-7).
- `git grep -q 'per-turn project cue' -- templates/keeper.md` → exit 1 (AC-8).
- `npx tsc --noEmit` → exit 0.
- `npx biome check --error-on-warnings .` → exit 0, 295 files (AC-10).
- `npx biome check --error-on-warnings adrian-rebuild` → exit 0, 36 files.
- `node adrian-rebuild/tools/check.mjs` → exit 0, "0 errors", with this `outcome.md` present (AC-10).
- `git diff --cached --name-status` → `D templates/communication.md` only; HEAD unchanged at `a079bb5`.

## Fails before

The main session (AC-4): `node adrian-rebuild/tools/fails-before.mjs test/hook/communication.test.ts
test/runtime/context-message.test.ts` → exit 0, "fails-before: test/hook/communication.test.ts,
test/runtime/context-message.test.ts fail at HEAD (exit 1)".

Tests first, with the source unchanged (the working tree's new tests over HEAD's `hook/`, `src/` and `templates/`):

- `node --test test/hook/communication.test.ts` → exit 1, 42 tests, 31 pass, 11 fail: the seven new tests and the four
  tag checks. The A-039 test passed, since it checks a property HEAD already has (Deviations 5). For example:
  - the coordinator's golden: `actual: "<limen-project-context>\n\nEngineering time is abundant … \n\nFirst line is
    the answer. …\n\nWrite in plain technical English (about 80% of ASD-STE100). …\n\nAudience for this reply: human.
    …\n\nWhen this reply hands control back with work in flight, end with a short overview: …\n\n
    </limen-project-context>"`, `expected: "<limen-turn-cue>\nAudience: owner. Answer in the language of the owner's
    last message.\nEngineering time is abundant … \n</limen-turn-cue>"`;
  - the failure test: HEAD's first cue ends with `The previous turn failed with error: provider overloaded and nothing
    reached the human.` inside the old tags;
  - the four tag checks: `actual: [ false, … ]`, `expected: [ true, … ]` (no `<limen-turn-cue>`).
- `node --test test/runtime/context-message.test.ts` → exit 1, 27 tests, 24 pass, 3 fail:
  - T-13's golden: `actual: false`, `expected: true`;
  - the vision line: `actual: [ 0, false, false ]`, `expected: [ 1, true, false ]`;
  - the ASD-STE100 paragraph: missing in all eight roles' messages (`actual: [ 'owner-facing coordinator', 'worker',
    'reviewer', 'judge', 'keeper', 'researcher', 'quality', 'group team' ]`, `expected: []`).

## Deviations from the ticket

1. `test/s4-steering.test.ts`, a file outside Change 8's list: its worker test asserted a board pointer
   (`` `spec/build.md` ``) in the worker's first model call, which only the cue's board line gave. D-134 (3) cuts that
   line, and AC-3 requires the file green, so the assertion went and the test's name says "a vision pointer" instead
   of "vision and board pointers", with a comment citing D-134 (3). The vision pointer assertion stays; it is now met
   by the context message. Before this edit the file failed on exactly that assertion (`board pointer`, `actual:
   false`).
2. `test/cli/spawn.test.ts:433`: its comment said a job's cue holds a vision pointer; it now says the context message
   holds one line that points at the vision (T-30, AC-11). No test changed.
3. `test/runtime/context-message.test.ts`: the test "A-038: no message holds a maintainer note of the package's
   register or cue file" is renamed "… of the package's speech texts", since the cue file is cut; its body is
   unchanged.
4. `CONTRIBUTING.md` → `## Registers and cues`, first paragraph: the owner register is described as "the reply's
   language and the audience switch" instead of "the audience switch", since its first line now carries the language
   rule (Change 4). Change 7 names this section for the cue file's paragraph only.
5. Change 8 says each test fails at `511fafd`. Two do not, by their nature: the A-039 test checks that a project
   register leaves the cue unchanged, which HEAD already guarantees, and `test/seat/bridge-contract.test.ts` runs a
   synthetic fixture whose cue text the contract does not interpret. Both files are outside or beside AC-4's list;
   the two files of AC-4 fail at HEAD as a whole.

## Unmeasured

- Whether the real model answers in the owner's language and writes tickets in English: seat step 4.4 (`plan.md` →
  `## Deployment` item 12; T-13's seat check), and the language share of M-05.
- Whether the outcome-first opening and the closing overview hold with the owner register alone, once per session,
  instead of the cue on every turn (Risk): M-05 at 4.8, against the baseline caveat of `## Measurement`.
- The cue's share of fixed context per turn: M-01 at the close of stage 4 (the sizes above are from the package texts,
  not from a session).

## Open points

1. The cue is ≈67 tokens in the coordinator and ≈73 in a job with a ticket line, above A-077's ≈40–60; the anchor
   (≈41 tokens) is R-046's (Risk).
2. A job published before the deployment and resumed after it keeps its saved `context.md` without the vision line,
   while its cue no longer carries one (Risk; no migration by the ticket).
3. `docs/setup.md` still says the capability frame tells every role that engineering time is abundant; the frame's
   words are R-046's (out of scope).
4. A job's vision line is decided when the job is published and frozen in its `context.md` (D-134 (3), z. 3), while
   the old cue checked `spec/vision.md` on every turn; a vision file created after a job is published is not pointed at
   during that job (review round 1, note 4). Its reminder still comes with an edit of a planned ticket (R-043).
