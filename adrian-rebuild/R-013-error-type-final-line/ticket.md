<!-- PL: Ticket R-013 etapu 1 przebudowy: jeden typ błędu Limena (klasa, kod, komunikat, następne polecenie), kody
wyjścia 0–5 jako klasy porażek (T-02) i końcowa linia JSON każdego polecenia z opcjonalnym polem ids (D-022), czytana
tylko przez jedną funkcję klienta; do tego zapadki liczby catch i gołych throw new Error. Sesja główna przyjęła
odczytanie pola code: identyfikator porażki (np. LAND_NOT_DONE), a przy sukcesie 0, do potwierdzenia na bramce 5.1.
Stan: zablokowany w nocy 18.11 przed zmianą (pytanie Q-7: cztery komendy kończą się przez process.exitCode);
nic nie zaimplementowano. -->

# R-013 One error type, exit codes as failure classes, a final JSON line

## Problem

Every failure of a Limen command exits 1 and prints one message (`src/main.ts:196-202`), so a caller cannot tell a
refusal from a bad flag or a crash without parsing prose (AU-209), and callers take a job id from the last stdout line
(AU-210, AU-217): `src/project/picture-tick.ts:134` and, in the tests, `test/plant.ts:143`,
`test/group-extensions.test.ts:88`, `test/s10-doorbell.test.ts:153`, `test/s2-hosted.test.ts:162`,
`test/s3-finish-wake.test.ts:186`, `test/s4-steering.test.ts:135`, `test/s6-keeper.test.ts:30` and `:53`,
`test/s7-webhooks.test.ts:23`, `test/s8-groups.test.ts:73`.

Relied on (quoted):
- T-01, Rule (excerpt): "An error on the main path always propagates and ends the command with a non-zero exit code
  (T-02), a message and the next command. (…) Limen has one error type: class, code, message, next command." Check
  (excerpt): "a script in `npm run check` allows `catch` only in `src/side.ts` and in the transition function".
- T-02, Rule: "0 success, also "nothing to do"; 1 refusal: a code-checked condition is not met, with the reason and the
  next command; 2 usage error: flags, arguments, unknown command; 3 transient failure: a lock after its wait limit, the
  network, a rate limit; safe to retry; 4 environment failure: git, the file system, permissions, a missing tool;
  5 internal error: an unexpected exception, with the stack in the log. The exit code is the class; the detail is the
  last stderr line, a JSON object with `class`, `code` and `next`, which timers and tests read; on success the same
  line, with `next`, ends stdout." Check (excerpt): "a test for every refusal and failure path asserts the exit code
  and the `code` field; a script forbids exit codes 126–255".
- D-022 (Adrian, 2026-11-18) and T-37: "the final JSON line gets an optional field `ids` with the identifiers of what
  the command created or changed, and no data (…). `spawn` ends with `{"class":"ok","code":0,"next":"End your turn;
  Limen wakes you when the job ends.","ids":{"job":"<full id>"}}`; the token of AU-211 is the last 8 characters of the
  id, with no field of its own. Every command declares its `ids` keys in the registry (T-19): `job`, `ticket` (FNNN),
  `question` (Q-NNN). The poller and the other processes that call the CLI read `ids` only through the client function
  (AU-217); an id is not part of `next` or of a text line as a contract (z. 2). The text for people gives the label and
  the token. (…) R-013 builds the field with the final line; the declaration of the keys is part of the registry
  (R-014, T-19)."
- T-26 (4): "At a process boundary (…) only the final JSON line is read, through one client function, never the text
  meant for a person." Check (excerpt): "hooks call the CLI only through the client function that reads the final JSON
  line (a test with output that has text before the JSON line)".
- T-28 (1) and T-29 (2): refusals are "typed errors with an ID (T-01, T-03), declared in the registry entry"; a test
  that proves a refusal "starts with its identifier, e.g. "LAND_NOT_DONE: land refuses a job that is not done"".
- The class names are those of the help draft of rebuild stage 3, `evidence/taste/help-registry.mjs:103`: "Exit codes:
  0 ok · 1 refused · 2 usage · 3 transient · 4 environment · 5 internal."
- `plan.md` → `## Tickets`, notes, R-013: "until R-082, the `catch` scan of T-01 is a ratchet over the author's 148
  sites (40 `.catch(() => {})`, 108 `catch {`, T-01 → Why)". `## Stages` → conventions: "A scan that cannot hold at
  once over the author's code (…) starts as a ratchet: a baseline count in the repo that may only fall; R-082 and R-083
  bring the counts to zero (T-27)."

The main session's reading of `code` (night run, 2026-11-18; for Adrian to confirm at gate 5.1): on a failure, `code`
is the failure's identifier, an upper-case word such as `LAND_NOT_DONE` (T-02 asserts "the exit code and the `code`
field" as two things, and T-28/T-29 give refusals an ID); on success it is the number `0`, as D-022 writes it (night
question Q-3 asked whether a success's `code` is a word or `OK`, and the answer was `0`). Under this reading every
quoted text holds as written.

## Change

1. New module `src/outcome.ts`, the only module that writes or parses the final line (T-25, T-26 (4)):
   - The classes and their exit codes: `ok` 0, `refused` 1, `usage` 2, `transient` 3, `environment` 4, `internal` 5.
   - `LimenError` (extends `Error`): `class` (a failure class, not `ok`), `code` (matches `^[A-Z][A-Z0-9_]*$`),
     `message`, `next` (a string; the next command, for `refused` and `usage` not empty).
   - The success type `{ next: string; ids?: { job?: string; ticket?: string; question?: string } }`.
   - `finalLine(…)`: the JSON object in this key order: `class`, `code`, `next`, then `ids` only when given.
   - `failureOf(error)`: a `LimenError` stays as it is; an `Error` whose constructor is `Error` itself (the author's
     untyped refusals) becomes `refused` with code `UNTYPED` and `next` `""`, which keeps today's exit code 1; any other
     value (a `TypeError`, a `SyntaxError`, a thrown string) becomes `internal` with code `INTERNAL`.
   - The client function `readOutcome({ status, stdout, stderr })`: it takes the last non-empty line of stdout when
     `status` is 0 and of stderr otherwise, and returns the parsed line after these checks, each a thrown error that
     names what is wrong: valid JSON; `class` is one of the six; `code` is `0` exactly when `class` is `ok`, otherwise
     an identifier; `next` is a string; `ids` has only the keys `job`, `ticket` and `question`, with values in the
     format of a job id (`src/job/job.ts:136`: `YYYY-MM-DD-<slug>-<8 hex>`), `F` and three or more digits, and `Q-` and
     three digits; and the class's exit code equals `status`.
2. `src/main.ts`: a command returns `Promise<Success | undefined>` (undefined means `{ next: "" }`), and `main` ends
   every command process with exactly one final line: on success on stdout, after the command's own lines; on a failure
   on stderr, after the message (as today) and, for `internal`, after the stack. `process.exitCode` is the class's exit
   code. The help (`limen`, `--help`, `-h`, `help`, and `<command> --help`) ends with the success line. An unknown
   command is `usage`, code `UNKNOWN_COMMAND`, `next` `limen --help`, with today's message. The internal runs
   (`LIMEN_INTERNAL_RUN`, `LIMEN_INTERNAL_HOSTED`) print no final line and keep their exit behaviour; they are not
   commands. A command called in-process by another command (`keeper` calls `spawnCommand`) prints no line of its own;
   only `main` prints it.
3. `src/commands/flags.ts`: the errors of `parseFlags` (an unknown flag, a missing value, a repeated flag) become
   `LimenError` of class `usage`, code `BAD_FLAG`, with the command's own message and `next` `limen --help`.
4. `ids` and `next` on success: every command whose success creates exactly one job returns `ids: { job: <full id> }`
   and `next` `End your turn; Limen wakes you when the job ends.` (D-022's text for `spawn`; the implementer lists the
   commands it finds, at least `spawn`, `continue` and `keeper`). `ticket new` returns `ids: { ticket: <FNNN> }`. Every
   other command returns nothing, so its line has `next` `""`. The text lines a command prints for people stay as they
   are (out of scope).
5. Callers of the CLI read the final line only through `readOutcome`: `src/project/picture-tick.ts:134` and every test
   named in `## Problem`. A test that needs an id no `ids` key carries (for example a group's id) reads it from the
   records under `.limen/`, not from a text line. Tests that assert exit code 1 for a flag error or an unknown command
   assert 2 now; tests of refusals keep 1.
6. `bin/limen`: the Node version check exits 4 (environment) and prints, as the last stderr line,
   `{"class":"environment","code":"NODE_VERSION","next":"install Node.js 24 or newer"}`; it cannot import
   `src/outcome.ts` on an old Node, so the line is literal there.
7. Scans in `test/structure.test.ts`, each its own test named after its rule:
   - "T-02: …": no `process.exit(…)` or `process.exitCode = …` in `src/`, `hook/` or `bin/` with a literal outside
     0–5;
   - "T-01: …": the counts of `catch {` and of `.catch(() => {})` in `src/` and `hook/` are at most their counts at
     this ticket's parent commit (constants in the test, whose comment names R-082 as the ticket that brings them to
     zero); `src/outcome.ts` adds none;
   - the count of `throw new Error(` in `src/` and `hook/` is at most its count at this ticket's parent commit, minus
     the sites this ticket converts (the ratchet of the untyped refusals, R-082).
8. Tests, written first and failing at HEAD:
   - `test/outcome.test.ts` (the subject is `src/outcome.ts`): `finalLine` gives the key order and leaves out absent
     `ids`; `failureOf` maps a `LimenError`, a plain `Error` (`refused`, `UNTYPED`, 1) and a `TypeError` (`internal`,
     `INTERNAL`, 5); `readOutcome` returns the line from output with text before it, and refuses a missing line, bad
     JSON, an unknown class, `code` `0` with a failure class, an unknown `ids` key, a malformed id, and a class whose
     exit code differs from `status`; and through `bin/limen` on a plant (`test/plant.ts`): `limen --help` ends with
     `{"class":"ok","code":0,"next":""}` and exits 0; an unknown command exits 2 with code `UNKNOWN_COMMAND` as the last
     stderr line; a bad flag of `spawn` exits 2 with `BAD_FLAG`; an untyped refusal exits 1 with `UNTYPED`; `limen
     status` ends with the success line; `ticket new` returns `ids.ticket`.
   - `test/s1-spawn.test.ts`: the golden final line of a detached `spawn`, `{"class":"ok","code":0,"next":"End your
     turn; Limen wakes you when the job ends.","ids":{"job":"<id>"}}` with the id of the job directory that spawn
     created, read with `readOutcome`.
9. Docs: `docs/commands.md` gets a short section on exit codes and the final line (the six classes with their codes,
   the fields, `ids`, which stream carries the line), and its sentences that say a failure exits 1 or that spawn's last
   line is the id say what the code does now.

## Out of scope

- The command registry, the declaration of `ids` keys and refusal IDs per command, and the test that a command returns
  only its declared keys (R-014, D-022, T-19).
- The text lines for people, among them the bare job id that `spawn` and `continue` print (D-022: "the label and the
  token"), and the `next` texts of commands other than those of item 4: R-014 (`pair`, with Adrian).
- Typing the author's refusals with their own IDs (the `UNTYPED` ratchet goes to zero with R-082), and the sites of
  `transient` and `environment` beyond item 6: a lock after its wait (R-019), a missing tool (R-020), the transition
  write (R-021).
- `bestEffort` and `src/side.ts` (T-01; the record's `sideFailures` come with R-021, the conversion of swallowed errors
  with R-082).
- The cut commands (R-002–R-007, R-009); they get the final line through `main` like every other command.
- `package.json`'s test glob (R-001) and renaming test files (R-083).

## Acceptance

- AC-1: `node --test test/outcome.test.ts` → exit 0.
- AC-2: `node adrian-rebuild/tools/gate.mjs` → exit 0 with `fail 0`, and at least 82 tests plus the new ones.
- AC-3: `node adrian-rebuild/tools/fails-before.mjs` → exit 0: the new and changed test files fail at HEAD.
- AC-4: `git grep -n -E 'stdout\.trim\(\)\.split\(' -- src test` → no output: no caller takes a line of a command's
  stdout as its result.
- AC-5: `git grep -n -E 'JSON\.stringify\(\{ ?class' -- src hook bin` → only `src/outcome.ts`, and `git grep -n
  'readOutcome' -- src hook` → only `src/outcome.ts` and the callers of item 5.
- AC-6: `node adrian-rebuild/tools/check.mjs` → exit 0; `npx biome check --error-on-warnings adrian-rebuild` → exit 0.
- AC-7 (judgment): `main` prints exactly one final line per command process; an in-process call (`keeper` →
  `spawnCommand`) prints none; the internal runs print none.
- AC-8 (judgment): the docs of item 9 say what the code does: the classes, the fields, `ids` and the stream.

## Migration

No on-disk format changes and no command is removed. The CLI change is the final line and exit code 2 for flag errors
and an unknown command (was 1). Every caller in the repository moves to `readOutcome` in this ticket (item 5). The
seat's callers read only zero and non-zero, which the classes keep: the poller's `limen github ensure`
(`src/integrations/github-poller.ts:567-570`, `ensure.status !== 0`) and the systemd units (`docs/seat/*.service`); no
seat script parses Limen's output (`docs/seat/bell.sh` reads `.limen/jobs/*/state`). The coordinator model reads the
text lines, which stay, plus one JSON line at the end of each tool result.

## Risk

- Every command's output in a coordinator's tool result grows by one line of about 60–150 bytes. The text lines stay,
  so the model's reading of today's output is unchanged.
- A plain `Error` that is really an environment failure (git missing) still exits 1 (`UNTYPED`); it did so before. The
  ratchet keeps the number from growing.
- `failureOf` classes a `TypeError` raised by the author's code on bad input as `internal` (5) where it exited 1; the
  stack then shows on stderr. That is T-02's class for an unexpected exception.
- Wrong `ids` would mislead a caller; `readOutcome` validates the format, and the golden test of `spawn` checks the id
  against the job directory.

## Rollback

`git revert $(git log --format=%H --grep='^R-013:' adrian-rebuild --)`; no migration to reverse.

## Decisions

- 2026-11-18 (night run, main session): the reading of `code` in `## Problem` (an identifier on failure, `0` on
  success); the module name `src/outcome.ts`; the codes `UNKNOWN_COMMAND`, `BAD_FLAG`, `UNTYPED`, `INTERNAL` and
  `NODE_VERSION`; `next` `""` where no command text is given yet. Adrian may change any of them at gate 5.1; R-014
  declares the codes per command in the registry.
- 2026-11-18 (night run, `rebuild-implementer`): `BLOCKED` before any change: four commands fail by setting
  `process.exitCode = 1` and returning (`src/commands/ticket.ts:176`, `src/commands/picture.ts:91`,
  `src/commands/webhook.ts:25`, `src/integrations/github-poller.ts:765`; confirmed by the main session with `git grep`),
  which item 2 would turn into a false success; making them throw a plain `Error` breaks item 7's ratchet arithmetic,
  and new codes are out of scope. The ticket did not list these sites. `review-guard.mjs compare --git` → "within its
  limits". The question is Q-7 of the night's `adrian-rebuild/.night/questions.md` (recommended: plain `Error` at the
  four sites, the ratchet "at most the parent's count"), with the implementer's further points (`group wait`'s
  `process.exit(0)`, `ids.job` for `github review` and `github work`, `docs/jobs.md:96`,
  `docs/seat/agent-setup.md:254`); the answer goes here.
