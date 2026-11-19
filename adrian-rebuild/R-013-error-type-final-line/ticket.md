<!-- PL: Ticket R-013 etapu 1 przebudowy: jeden typ błędu Limena (klasa, kod, komunikat, następne polecenie), kody
wyjścia 0–5 jako klasy porażek (T-02) i końcowa linia JSON każdego polecenia z opcjonalnym polem ids (D-022), czytana
tylko przez jedną funkcję klienta; kod wyjścia ustawia wyłącznie wspólne opakowanie, a polecenia zwracają wynik albo
rzucają błąd z klasą (D-028). Do tego skan process.exit oraz zapadki liczby catch i gołych throw new Error. Stan:
zamknięty (19.11, nocny przebieg; numery linii odświeżone do `b8babe2`; recenzja PASS w rundach 1 i 2, jedna runda
poprawek). -->

# R-013 One error type, exit codes as failure classes, a final JSON line

## Problem

Line numbers are at `b8babe2` (after every cut of stage 1). Every failure of a Limen command exits 1 and prints one
message (`src/main.ts:159-165`), so a caller cannot tell a refusal from a bad flag or a crash without parsing prose
(AU-209), and callers take a job id from the last stdout line (AU-210, AU-217), all of them in the tests:
`test/plant.ts:181`, `test/cli/continue.test.ts:21`, `test/cli/old-names.test.ts:232`,
`test/group-extensions.test.ts:72`, `test/s10-doorbell.test.ts:148`, `test/s2-herdr.test.ts:89`,
`test/s3-finish-wake.test.ts:186`, `test/s4-steering.test.ts:133`, `test/s6-keeper.test.ts:62`,
`test/s8-groups.test.ts:67` (`git grep -n -E 'stdout\.trim\(\)\.split\(' -- src test hook bin`; `src/` has none since
R-007 cut `picture tick`).

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
- D-028 (Adrian, 2026-11-18, night question Q-7): "only the shared wrapper sets the exit code and prints the final
  line; a command returns its result or throws an error with its type and class (T-01, T-03, AU-209).
  `process.exitCode` and `process.exit` appear only in the wrapper and in the entry point `bin/limen` (a scan)."
  Classes: "`ticket check` and `picture build --strict` with problems found are a refusal (1) with the list in the
  text and the fix in `next`; `github poll` by its cause (the network 3; a missing configuration or credential 4)";
  `webhook test` is cut by R-002 first. "`group wait`: in R-013 its time limit rejects the operation with a typed
  error through the wrapper, with no `process.exit` from a timer; the command itself is cut by the registry ticket
  (R-014)." "`ids.job` also for `github review` and `github work`." The two doc lines change "when they describe the
  output contract" R-013 changes. Order: "R-013 depends on every cut of stage 1 (R-002–R-007, R-009), so it reworks
  no code that a cut removes". Check: "the scan for `process.exitCode` and `process.exit` outside the wrapper and
  `bin/limen`; a refusal test for each reworked command (the code, the class and `next` in the final line); a test
  that `group wait`'s time limit gives exactly one final line with its code."
- D-025 (Adrian, 2026-11-18, night question Q-4): "a criterion checks only the ticket's scope; a global property is
  closed by the ticket that makes it true. (…) The expected result is an exit code, with no `!` before the command."
- Today three commands fail by setting `process.exitCode = 1` and returning normally (`src/commands/ticket.ts:158`,
  `src/commands/picture.ts:70`, `src/integrations/github-poller.ts:752`; the fourth, `webhook test`, went with R-002),
  and the safety cap of `group wait` ends the process with `process.exit(0)` from a timer
  (`src/commands/group.ts:358-363`). Under item 2 a command that only returns would print the `ok` line and exit 0: a
  false success. `bin/limen:6` exits 1 on an old Node, and `src/main.ts:164` is the wrapper's own `process.exitCode`.
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
   code, and `main` is the only place in `src/` and `hook/` that sets it (D-028): no command sets `process.exitCode` or
   calls `process.exit`; a command that fails throws (items 3, 10 and 11). The help (`limen`, `--help`, `-h`, `help`, and `<command> --help`) ends with the success line. An unknown
   command is `usage`, code `UNKNOWN_COMMAND`, `next` `limen --help`, with today's message. The internal runs
   (`LIMEN_INTERNAL_RUN`, `LIMEN_INTERNAL_HOSTED`) print no final line and keep their exit behaviour; they are not
   commands. A command called in-process by another command (`keeper` calls `spawnCommand`) prints no line of its own;
   only `main` prints it.
3. `src/commands/flags.ts`: the errors of `parseFlags` (an unknown flag, a missing value, a repeated flag) become
   `LimenError` of class `usage`, code `BAD_FLAG`, with the command's own message and `next` `limen --help`.
4. `ids` and `next` on success: every command whose success creates exactly one job returns `ids: { job: <full id> }`
   and `next` `End your turn; Limen wakes you when the job ends.` (D-022's text for `spawn`; the implementer lists the
   commands it finds, at least `spawn`, `continue`, `keeper`, `github review` and `github work`, D-028). `ticket new`
   returns `ids: { ticket: <FNNN> }`. Every
   other command returns nothing, so its line has `next` `""`. The text lines a command prints for people stay as they
   are (out of scope).
5. Callers of the CLI read the final line only through `readOutcome`: every caller `## Problem` lists (AC-4's command
   finds them). A test that needs an id no `ids` key carries (for example a group's id, `test/s8-groups.test.ts:67`)
   reads it from the records under `.limen/`, not from a text line. Tests that assert exit code 1 for a flag error or an unknown command
   assert 2 now; tests of refusals keep 1.
6. `bin/limen`: the Node version check exits 4 (environment) and prints, as the last stderr line,
   `{"class":"environment","code":"NODE_VERSION","next":"install Node.js 24 or newer"}`; it cannot import
   `src/outcome.ts` on an old Node, so the line is literal there.
7. Scans in `test/structure.test.ts`, each its own test named after its rule:
   - "T-02: …" (D-028): `process.exitCode` and `process.exit` occur in `src/`, `hook/` and `bin/` only in `src/main.ts`
     (the wrapper) and `bin/limen` (the entry point), and every literal exit code there is within 0–5;
   - "T-26 (4): …": only `src/outcome.ts` builds the final line (no `JSON.stringify({ class` or
     `JSON.stringify({class` elsewhere in `src/`, `hook/` or `bin/`);
   - "T-01: …": the counts of `catch {` and of `.catch(() => {})` in `src/` and `hook/` are at most their counts at
     this ticket's parent commit (constants in the test, whose comment names R-082 as the ticket that brings them to
     zero); `src/outcome.ts` adds none;
   - the count of `throw new Error(` in `src/` and `hook/` is at most its count at this ticket's parent commit, minus
     the sites this ticket converts, which the test's comment names (the ratchet of the untyped refusals, R-082); the
     failures of items 10 and 11 are `LimenError`, so they add none.
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
   - A refusal test for each command of item 10 (D-028): on a plant, the command with problems found exits with its
     class's code, its last stderr line read with `readOutcome` has the class, the code and the `next` of item 10, and
     the list of problems is in the text before it; `github poll` once with a network failure (3) and once with a
     missing configuration or credential (4), with GitHub replaced by a local fake or a fetch stub (no network).
   - `group wait` (item 11): through `bin/limen` with a short `--timeout`, the process ends with exactly one final
     line, `class` `transient`, code `GROUP_WAIT_TIMEOUT`, exit 3; the cap helper rejects a stalled operation after a
     short bound passed in-process (no 20-second wait in the test).
9. Docs: `docs/commands.md` gets a short section on exit codes and the final line (the six classes with their codes,
   the fields, `ids`, which stream carries the line), and its sentences that say a failure exits 1 or that spawn's last
   line is the id (`docs/commands.md:70`: "and again on its last line") say what the code does now. `docs/jobs.md:96`
   ("The last line of `spawn` output is the durable job ID") and `docs/seat/agent-setup.md:239` (`github doctor`'s
   stderr "ends with" a text line) describe the output contract this ticket changes, so they change with it (D-028).
10. The commands that fail by setting the exit code today throw a `LimenError` instead (D-028); the text lines they
    print for people stay, and the error's message is one summary line:
    - `ticket check` with failing tickets (`src/commands/ticket.ts:158`): `refused`, code `TICKET_CHECK_FAILED`, the
      failing lines on stderr as today, `next` `fix the tickets listed above, then run limen ticket check <branch>`.
    - `picture build --strict` with an error diagnostic (`src/commands/picture.ts:70`, in the form R-007 left it):
      `refused`, code `PICTURE_INVALID`, the diagnostics on stderr as today, `next` `fix the errors listed above, then
      run limen picture build --strict`.
    - `github poll` (`src/integrations/github-poller.ts:752`): the poll goes on with the other projects as today and
      then throws the most severe failure among the projects (the highest exit code), each project's failure still
      printed on its own stderr line. The causes: a rejected `fetch` and HTTP 429 or 5xx from the one request function
      (`src/integrations/github-poller.ts:86-98`) are `transient`, code `GITHUB_NETWORK`; a missing or invalid
      setting or credential (the checks before the loop at `:716-741`, the App key and id of `appJwt`, an installation
      token GitHub does not issue, HTTP 401 or 403) is `environment`, code `GITHUB_CONFIG`; both with `next` `limen
      github doctor`. Any other failure keeps the mapping of `failureOf`.
11. `group wait` (`src/commands/group.ts:332-370`): its safety cap no longer calls `process.exit(0)` from a timer. The
    operation races a cap promise (a small exported helper that takes the bound, so a test can pass a short one),
    which rejects with a `LimenError` `transient`, code `GROUP_WAIT_TIMEOUT`, `next` `limen group status <group>`; the
    requested `--timeout` that ends the wait before the group finishes gives the same error, so both limits fail one
    way, and `main` prints the one final line. R-014 cuts the command (D-028).

## Out of scope

- The command registry, the declaration of `ids` keys and refusal IDs per command, and the test that a command returns
  only its declared keys (R-014, D-022, T-19).
- The text lines for people, among them the bare job id that `spawn` and `continue` print (D-022: "the label and the
  token"), and the `next` texts of commands other than those of items 4, 10 and 11: R-014 (`pair`, with Adrian).
- Typing the author's other refusals with their own IDs (the `UNTYPED` ratchet goes to zero with R-082), and the sites
  of `transient` and `environment` beyond items 6, 10 and 11: a lock after its wait (R-019), a missing tool (R-020),
  the transition write (R-021).
- Cutting `group wait` (R-014, D-028).
- `bestEffort` and `src/side.ts` (T-01; the record's `sideFailures` come with R-021, the conversion of swallowed errors
  with R-082).
- The cut commands (R-002–R-007, R-009): they are gone before this ticket (D-028), and their refusal with a pointer
  gets the final line through `main` like every other failure.
- `package.json`'s test glob (R-001) and renaming test files (R-083).
- `seat/deploy.ts` (R-012): a root tool with its own entry point and exit classes, outside `src`, `hook` and `bin`;
  seat code takes the shared error type with R-059. `adrian-rebuild/tools/`: the rebuild's own tools.

## Acceptance

- AC-1: `node --test test/outcome.test.ts` → exit 0.
- AC-2: `node adrian-rebuild/tools/gate.mjs` → exit 0 with `fail 0`; the outcome gives the count before and after.
- AC-3: `node adrian-rebuild/tools/fails-before.mjs` → exit 0: the new and changed test files fail at HEAD.
- AC-4: `git grep -q -E 'stdout\.trim\(\)\.split\(' -- src test` → exit 1 (no match): no caller takes a line of a
  command's stdout as its result. Every match at the parent is a caller this ticket converts (item 5), so the scan is
  this ticket's own (D-025).
- AC-5: `node --test test/structure.test.ts` → exit 0: the scans of item 7 (the `process.exit` scan of D-028, the
  final line built only in `src/outcome.ts`, the ratchets).
- AC-6: `node adrian-rebuild/tools/check.mjs` → exit 0; `npx biome check --error-on-warnings adrian-rebuild` → exit 0.
- AC-7 (judgment): `main` prints exactly one final line per command process; an in-process call (`keeper` →
  `spawnCommand`) prints none; the internal runs print none.
- AC-8 (judgment): the docs of item 9 say what the code does: the classes, the fields, `ids` and the stream.
- AC-9 (judgment): each command of items 10 and 11 fails only by throwing, with the class, code and `next` given
  there, and still prints its list of problems for people.

## Migration

No on-disk format changes and no command is removed. The CLI change is the final line and exit code 2 for flag errors
and an unknown command (was 1); `github poll` exits 3 or 4 by cause (was 1), and `group wait` at its limit exits 3
(was 0). The seat's `github poll` unit treats any non-zero exit as a failure, as before. Every caller in the repository moves to `readOutcome` in this ticket (item 5). The
seat's callers read only zero and non-zero, which the classes keep: the poller's `limen github ensure`
(`src/integrations/github-poller.ts:559`, `ensure.status !== 0`) and the systemd units (`docs/seat/*.service`); no
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
- 2026-11-18 (Adrian, Q-7 → `plan.md` D-028, quoted in `## Problem`): only the wrapper sets the exit code; the four
  sites throw typed errors with the classes of D-028; `webhook test` goes with R-002; `group wait`'s limit rejects with
  a typed error and R-014 cuts the command; `ids.job` for `github review` and `github work`; the two doc lines change.
  A follow-up of the same day: R-013 depends on R-002–R-007 and R-009. Applied in items 2, 4, 5, 7–11, AC-4, AC-5 and
  AC-9; the plain-`Error` option and the ratchet "at most the parent's count" of the night question are not taken.
- 2026-11-18 (main session, for Adrian to confirm at gate 5.1): the codes `TICKET_CHECK_FAILED`, `PICTURE_INVALID`,
  `GITHUB_NETWORK`, `GITHUB_CONFIG` and `GROUP_WAIT_TIMEOUT` and their `next` texts in items 10 and 11; HTTP 429 and
  5xx count as the network, 401 and 403 as a credential; `github poll` throws its most severe project failure;
  `group wait`'s requested `--timeout` fails like its cap (exit 3, was 0), so that both limits fail one way.
- 2026-11-18 (main session, D-025): AC-4 states its result as an exit code; AC-5 becomes the scan test of item 7, so no
  criterion expects a given list of files.
- 2026-11-19 (night run, main session): with the cuts done, the line numbers are refreshed to `b8babe2`, and the sites
  the cuts removed leave the ticket (`src/commands/webhook.ts` with R-002, `src/project/picture-tick.ts` with R-007,
  `test/s2-hosted.test.ts` with R-005, `test/s7-webhooks.test.ts` with R-002); the callers of `## Problem` are those
  AC-4's command finds at `b8babe2`, all in `test/`. AC-2 no longer names a test count (the stage conventions: "no new
  failure", not a fixed count). AC-4 was run at `b8babe2`: every match is a caller item 5 converts (D-025).
- 2026-11-19 (main session, review round 1, PASS; `review.md` → Round 1). Fixes for a fresh implementer, each with a
  test written first where a test can show it:
  1. Finding 1: the golden test of `spawn` (`test/s1-spawn.test.ts`) compares the raw last stdout line with the golden
     string, so the key order is checked; the outcome's sentence about it says what the test checks.
  2. Finding 5: `templates/agents.md:166` says what `spawn` prints now (the id as soon as the job exists, and `ids.job`
     in the final line), and `templates/.history/agents.md` gets the new template's SHA-256 as its first line;
     `docs/groups.md:69` describes `group wait`'s limit as it is now (exit 3, `GROUP_WAIT_TIMEOUT`, no process
     watchdog).
  3. Finding 4: `docs/commands.md:30` says what is true: programs read the final line through one client function,
     except that the GitHub poller still tells an unavailable coordinator from an unconfirmed delivery by the text of
     `limen github deliver`. No code change; R-014 converts that caller (T-26 (4)).
  4. Finding 7 (T-02): an HTTP 403 that is a rate limit (`x-ratelimit-remaining: 0` or a `retry-after` header) is
     `transient`, `GITHUB_NETWORK`; any other 403 stays `GITHUB_CONFIG`. Test with the fetch stub.
  5. Finding 9 (T-29 (2)): the two T-01 scan test names carry one identifier (no `R-013`).
  6. Finding r1-a: the job-id pattern of `ids.job` (written by `finalLine`, read by `readOutcome`, one shared pattern)
     accepts every form `makeJobId` has produced (`git log -p -- src/job/job.ts`, and the job module's earlier homes
     if it moved), each with a test.
  7. Finding r1-b: parentheses make the `||`/`?:` order explicit at `src/commands/group.ts:401`.
  8. Finding r1-c (T-30): the comment at `test/structure.test.ts:95` claims only what the scan checks; the sentence at
     `src/old-names.ts:146-147` gives a reason instead of history.
  9. Finding r1-d: a missing or unreadable projects file in `github poll` is `environment`, `GITHUB_CONFIG`, like the
     state directory. Test.
  10. Finding 6: `outcome.md` lists the member's `next` (`limen group status` without an id) among the deviations.
  Findings 2, 3, 8 and r1-e are rejected (`review.md`). `outcome.md` records the fixes and their tests.
- 2026-11-19 (main session, review round 2, PASS with two notes): the named condition in place of fix 7's parentheses
  is accepted (Biome's formatter removes them; deviation 13). The note that an App key that holds no usable PEM is not
  typed `GITHUB_CONFIG` is rejected for this ticket (guessed, not run; no consumer reads the poll's class yet; R-082
  types the remaining untyped failures), and `plan.md` → `## State` records it. The fix round's deviations 12–14 of
  `outcome.md` are accepted.
