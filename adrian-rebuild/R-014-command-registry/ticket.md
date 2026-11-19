<!-- PL: Ticket R-014 etapu 1 przebudowy: jeden rejestr poleceń Limena (nazwa, obiekt, rodzaj, widoczność, opis,
schemat argumentów i flag, klucze ids, handler), jeden parser ze schematu, generowane `limen --help`, `limen <cmd>
--help` i sekcje `docs/commands.md`, nowe nazwy `status --all`, `show <job>` i `seat queue` z odmową starych form kodem
2. Teksty helpu ustalił Adrian w trybie pair (D-037–D-041), a implementację robi `rebuild-implementer`; `group wait`
zostaje jako polecenie wewnętrzne dla członków teamu (D-042), a `spawn` wymaga czterech flag trasy (D-043). Stan:
aktywny (19.11), implementer wznowiony po BLOCKED. -->

# R-014 One command registry, a shared parser and generated help

## Problem

Line numbers are at `20e694c`.

- The help is one hand-written string (`src/main.ts:83-134`); `limen <cmd> --help` cuts lines out of it
  (`src/main.ts:211`), and the command table is a separate literal (`src/main.ts:29-81`). The help lists internal
  commands (`rule timer`, `github deliver`, …) and ends with advice to the coordinator (`src/main.ts:134`).
- Only 8 command files use the shared flag parser (`git grep -l parseFlags -- src`: `continue`, `group`, `keeper`,
  `land`, `picture`, `rule`, `spawn`, `ticket`), each with its own wording of flag errors (`src/commands/flags.ts:9-22`);
  the rest read `args` by hand, e.g. `src/commands/status.ts:139-145`, `src/commands/jobs.ts:182-208`,
  `src/commands/prune.ts:20-28`, `src/commands/sweep.ts:24-34`, `src/commands/github.ts:77-112`,
  `src/commands/group.ts:395-466`, `src/commands/watch.ts:16-23`.
- A removed name refuses with a plain `Error`, so it exits 1 with code `UNTYPED` (`src/old-names.ts:150-201`; R-013's
  outcome: "removed names still exit 1 `UNTYPED` (the stage convention wants 2 and the new form in `next` after R-013;
  T-18)").
- `limen jobs` and `limen status` overlap (AU-206), and `limen status --all` today means "the summary without the 7-day
  window" (`src/commands/status.ts:120`, `:139-145`).
- No command declares its `ids` keys (`src/outcome.ts:9`: "R-014 declares each command's keys").

Relied on (quoted):
- T-19, Rule (excerpt): "One registry of commands is the only source (z. 22, A-084). An entry holds the name (T-18),
  the kind `read` or `change` (T-04), the visibility `public` or `internal`, a one-line summary written as a usage
  criterion (z. 13), the schema of arguments and flags, and the handler. Generated from it: (1) `limen --help`: the
  list in the groups of T-18, one line per command, a width limit (e.g. 100 characters), and at the end the exit-code
  table of T-02, generated from its constant; (2) `limen <cmd> --help`: usage from the schema, the kind, one example;
  (3) parsing: every command goes through one schema-driven parser, a bad flag exits with code 2 and a `next` (T-02),
  and one handler wrapper prints the final JSON line; (4) a marked section of `docs/commands.md` with a staleness test
  (A-084); (5) the command list in the coordinator manual, if it stays, also from the registry (A-085). Internal
  commands stay out of `limen --help`, in their own section of the docs. The advice to the coordinator at the end of
  the help goes: code enforces it (T-07)." Help variant (excerpt): "groups with summaries, with `limen` at the start of
  every line; no read/change column (…) Each group aligns its own summary column, capped at 35 characters of usage; a
  longer usage puts its summary on the next line at the same column, and a summary that does not fit there goes to
  the next line indented by 6." The renderer is `adrian-rebuild/evidence/taste/help-registry.mjs:115-138`.
- T-19, Check (excerpt): "a test that every group has a header naming its object from the registry (…); a test that
  every command file is in the registry and has a flag schema; a scan finds no hand-made argument parsing
  (`process.argv`, own loops over `args`) outside the shared parser; a test of the help line width; golden tests of
  `limen --help` and of one `limen <cmd> --help`; the staleness test of `docs/commands.md`; a test that an internal
  command does not appear in `limen --help`."
- T-19, added 2026-11-19 (D-039–D-041): "a command a subsequent ticket moves keeps today's name in the group of what it
  acts on now, and its entry carries `movedBy`, which the help does not show; until module switches exist (R-044) the
  modules header is "Modules", with no marker; the line about the final JSON line is built from the key list the
  wrapper uses; a parser error carries the command's usage line; `--help` works for internal commands; `limen <cmd>
  --help` shows the kind only once read commands write nothing (T-04, R-032); every example in the registry goes
  through the real parser in a test; every help line describes behaviour present in its commit (a judgment)."
- T-18, Structure (excerpt): "a top-level command acts on one of three objects. (1) One job: `spawn` creates it;
  `continue`, `steer`, `stop`, `abandon`, `land`, `diff`, `show` and `open` take its id. (2) The conversation with the
  owner (…) (3) This project: `init` and the reads `status`, `stats`, `board`. Everything about another or a wider
  object is a group: `ticket`, `spec`, `group`, `github`, `handoff`, and a new group `seat` (`seat queue`, `seat
  sweep`)". Conflict (3): "`jobs` is cut: `status` is the project summary (…); `status --all` lists the jobs; `show
  <id>` shows one job". Migration: "an old name exits with code 2 (T-02) and names the new one in `next`". Check
  (excerpt): "in the registry of T-19 every top-level command declares its object `job`, `owner` or `project`; a test
  that object `job` means a required argument of type job (…), except the one entry that creates the job (`spawn`); a
  golden test of `limen --help` in variant B".
- T-26 (1): "A registry command (T-19): parse with the shared parser, call a domain operation, pass the result to the
  shared wrapper, which turns a typed result or error (T-01, T-03) into the exit code, the text and the final JSON line
  (T-02); `next` is a field of the domain error."
- T-37 / D-022 (excerpt): "Every command declares its `ids` keys in the registry (T-19): `job`, `ticket` (FNNN),
  `question` (Q-NNN). (…) Check: (…) a test that every command returns only the `ids` keys its registry entry
  declares, with values in the format of a job id, FNNN or Q-NNN".
- D-028 (excerpt): "`group wait`: in R-013 its time limit rejects the operation with a typed error through the
  wrapper (…); the command itself is cut by the registry ticket (R-014; T-19 names `group start`, `status`, `stop` and
  `land`, and `wait` is rejected)." D-042 amends it (below).
- D-042 (excerpt): "`group wait` stays, as an internal command for team members with a worker allowance, because a
  member is itself a job, whose job ends with its turn, so it keeps its turn open with `group wait` while its workers
  run (`templates/group-member.md:5`, `docs/groups.md:69`) (…). Its entry carries `movedBy: "R-077"`. It refuses a
  caller outside a team (the lead, with the group id) with a typed refusal and a message; this is a guard against
  mistakes, keyed on the job's environment, not a security boundary, and the code and `docs/groups.md` say so (A-029).
  (…) R-014's test fails once no entry has `movedBy` any more, with the message to remove the field and the exception".
  Today a member is known by `LIMEN_JOB_ID` and `LIMEN_TEAM_ID` and the lead by the group id and its session
  (`src/job/group-cabinet.ts:177-197`).
- D-043 (excerpt): "(1) `spawn` requires `--engine`, `--provider`, `--model` and `--thinking`; a spawn without one of
  them exits 2, and the refusal names every missing flag. The basis is A-030 (a missing field refuses, and the fallback
  model is cut) and the author's intent #2 of gate 2 §5 ("never swap a model") (…) `continue` keeps `model ??
  defaultModel` until R-062. (2) The line of `ticket done` shows its flag: `limen ticket done <FNNN> … [--on
  <date>]`."
- `plan.md` → `## Tickets` → notes, R-014: "it registers the commands that remain after the cuts (…) and it gives them
  the names of T-18 where no other ticket's mechanism is needed: `limen jobs` becomes `limen status --all` and `limen
  show <id>`, and `limen queue` becomes `limen seat queue`."
- D-037: the texts are settled in `pair` and written here; `rebuild-implementer` implements them.
- D-038: "`limen status --all` prints today's summary without the 7-day window and, under it, one row per job (the
  rows of today's `limen jobs`). Old forms exit with code 2: `limen jobs <ref>` names `limen show <ref>` in `next`,
  every other form of `limen jobs` names `limen status --all`."
- D-039: "`close` R-037, `keeper` R-066, `sweep` and `prune` R-032, `rule` R-034 (…) stays under today's name in the
  help group of what it acts on now, with a line that can be copied and run. Its registry entry carries `movedBy:
  "R-0NN"`, which the help does not show. R-014's tests: a top-level command acts on `job`, `owner` or `project` unless
  its entry has `movedBy`, and the entries with `movedBy` are exactly those of this list".
- D-040: "the help's modules header says only what is true now: "Modules", with no state marker."
- D-041 (excerpt): "(1) The help line about the final JSON line is built from the key list of `src/outcome.ts` that
  the wrapper uses, so it names `ids`. (2) The example of `limen land --help` is `limen land a1b2c3d4` (…); every
  example in the registry goes through the real parser in a test. (3) (…) the judgment "every help line describes
  behaviour present in this commit". (4) A parser error carries the command's usage line from the registry in its
  message, and `next` stays `limen <command> --help`. (5) `--help` works for internal commands too; the internal
  section of `docs/commands.md` is generated from the registry, with the staleness test of A-084. (6) The kind is not
  shown by `limen <command> --help` until read commands write nothing (T-04, R-032) (…) (7) The Jobs header does not
  say every command takes an id (`--running`, `--all`); the general line and `limen <command> --help` come from the
  same schema, so they show the same flags; `--drop-leftovers` is described by its files."
- Facts behind the texts (checked at `20e694c`): `limen land` refuses on the job's state, a missing base or branch, the
  target branch, staged changes, no commits, the strict ticket check and the `test/` line cap
  (`src/commands/land.ts:95-161`), with no review condition (`git grep -n -i 'review\|verdict' -- src/commands/land.ts
  src/picture src/project` finds none), hence the tagline; `--onto` refuses unless it names the checked-out branch
  (`src/commands/land.ts:103-108`); `sweep` reaps dead jobs, removes dead coordinator registrations and sends seat
  notifications (`src/commands/sweep.ts:40-66`), and `--install` writes a macOS LaunchAgent that runs it every 60 s
  (`src/project/seat.ts:40-51`; D-023 leaves it to R-032); `prune` acts on this project (`src/commands/prune.ts:29`);
  the leftover list holds template copies, state files and a git hook (`src/project/leftovers.ts:25-45`); a job id is
  `YYYY-MM-DD-<slug>-<hex>` (`src/outcome.ts:36`).

## Change

1. **The registry**, new module `src/registry.ts`: one entry per command and subcommand, holding
   - `name` (`"land"`, `"ticket new"`, `"seat queue"`), `object` (`job`, `owner`, `project`, or the group it belongs
     to: `ticket`, `seat`, `github`, `group`, `picture`, `workspace`), `kind` (`read` | `change`), `visibility`
     (`public` | `internal`, an internal one with its caller, e.g. "the GitHub poller"), `summary` (the texts below),
     `schema` (positionals and flags, see 2), `ids` (the keys it may return: `job` for `spawn`, `continue`, `keeper`,
     `github review`, `github work`; `ticket` for `ticket new`; none elsewhere), `example` (one command line),
     `movedBy` (D-039, D-042: only `close` R-037, `keeper` R-066, `sweep` R-032, `prune` R-032, every `rule` entry
     R-034 and `group wait` R-077), and `handler`.
   - The group table: each group's header (texts below) and whether it is a module (`github`, `group`, `picture`,
     `workspace`).
   - `src/main.ts` dispatches through it: the longest registered name that the first words match; `limen`, `limen
     --help`, `-h` and `help` print the general help; `limen <name> --help` (before `--`) prints that entry's help,
     internal entries included; `limen <group>` alone exits 2 with the group's lines in the message and `limen <group>
     --help` in `next`, and `limen <group> --help` prints the group's lines. `COMMAND_NAMES` comes from the registry.
   - The wrapper (`src/main.ts`, `main`) refuses a success whose `ids` holds a key the entry does not declare: an
     internal error (exit 5), so the declaration is a guarantee in code.
2. **The parser**, new module `src/parser.ts`, replaces `src/commands/flags.ts` (`git rm`): the schema declares
   positionals (name, type `job` | `ticket` | `text` | `path` | `branch` | `word`, optional, repeated, or replaceable by
   a flag, as in `steer <job>|--running "text"`) and flags (name, value name or choices, repeatable, required). It keeps
   today's rules of `parseFlags`: only a word that starts with `--` is a flag, `-x` and `-` are positionals, `--` ends
   the flags, a flag's separate value may not start with `--` unless the schema allows it (a label). Every error is a
   `LimenError` of class `usage`, code `BAD_ARGUMENT`, with `next` `limen <name> --help` and a message of two lines:
   `limen <name>: <what is wrong>` and `usage: limen <usage line>`. Handlers receive the parsed values, never `args`.
   A removed flag of `OLD_FLAGS` stays in the schema as a hidden flag that refuses (so `--label --tab` still reads as a
   value).
3. **The help**, new module `src/help.ts`, the renderer of `evidence/taste/help-registry.mjs` moved into Limen:
   - The usage line of an entry is built from its schema, the same string in the general help, in `limen <name>
     --help` and in a parser error: positionals as `<job>`, `<FNNN>`, `<branch>`, `<name>`, a text as `"label"`, an
     optional part in `[…]`, a repeated one followed by ` …`, a replaceable positional as `<job>|--running`, a flag
     value as `<branch>` or its choices `planned|active`. An entry with many optional flags (`spawn`, `continue`,
     `keeper`, `group start`, `github review`, `github work`) shows its positionals and required flags and ends with
     ` …`; every other line shows every flag.
   - A module line lists the group's public subcommands joined by `|`, followed by ` …` when any of them takes an
     argument or a flag.
   - The last two lines: the exit-code line from `EXIT_CODES` and "The last output line is JSON {…}." from the key list
     of `src/outcome.ts` (today `KEYS`, `src/outcome.ts:40`), with `?` after an optional key (`ids`).
   - `limen <name> --help`: the usage line, the summary, one line per positional and flag with its description, and
     `Example: <example>`; no kind (D-041 (6)).
   - `docs/commands.md` gets two marked sections, `<!-- registry:public:begin -->` … `end` (the general help's
     command lines, without the exit-code lines) and `<!-- registry:internal:begin -->` … `end` (each internal entry's
     usage line, summary and caller); a test regenerates both and fails when the file differs. The prose outside the
     markers is corrected where it names a renamed or cut form.
4. **The texts.** The general help is exactly this (golden; widest line 100):

   ```
   limen: coding jobs, each in its own git worktree

   Jobs: spawn starts a job; the others act on one job, or on several with --running or --all
     limen spawn "task" --engine <engine> --provider <provider> --model <model> --thinking <level> …
         start a job in its own worktree; the task points to its ticket
     limen continue <job> "instruction" …       resume a finished job in its worktree
     limen steer <job>|--running "text"         send a correction to a running job
     limen stop <job> ["reason"]                stop a running job
     limen land <job> [--onto <branch>] [--yes] [--keep-open]
                                                merge a done job onto this branch and close its ticket
     limen diff <job>                           the change a job made against its base
     limen show <job>                           one job's record
     limen open <job>                           open the job's log tab in Herdr
     limen watch <job>|--running                wake this coordinator when the job ends
     limen unwatch <job>|--all                  stop waking this coordinator for the job

   This project
     limen init [--drop-leftovers]
         set up Limen here; --drop-leftovers deletes files Limen no longer reads
     limen status [--all]
         what runs, what landed, what waits for the owner; --all lists every job
     limen board [--write]
         the board with NOW and PROVEN; --write rewrites them in spec/build.md
     limen prune [--retire] [--dry-run]
         remove finished worktrees; --retire deletes records of landed jobs

   Tickets: files under spec/features/
     limen ticket new "what becomes true" [--lane planned|active] [--touches <ids>]
                                                write a ticket with the next free number
     limen ticket check [<branch>]
         the ticket check land runs, for the tickets a branch changes
     limen ticket done <FNNN> … [--on <date>]   close a ticket that landed without limen land
     limen close <FNNN>                         close the ticket's Herdr tabs
     limen keeper <ticket> --engine <engine> --provider <provider> --model <model> --thinking <level> …
         a short job fixes the ticket, board and map links after the work

   Seat: all projects on this machine
     limen seat queue                           the start queue and its CPU and memory reading
     limen sweep [--install] [--uninstall]
         reap dead jobs in every project and notify about jobs nobody heard of
     limen rule                                 the seat-wide rules that hold now
     limen rule set <name> --until <time> [--start-priority 1|2|3] "text"
                                                a rule for every coordinator on this machine
     limen rule end <name> ["reason"]           end a rule now

   Modules
     limen github connect|disconnect|status|doctor
                                                answer @limen mentions on GitHub pull requests
     limen group start|status|publish|stop|close …
                                                several agents on one ticket
     limen picture build|serve …                the architecture map check and the job activity feed
     limen workspace init
         a folder outside Git that holds several Git repositories; each job works in one (--repo)

   Exit codes: 0 ok · 1 refused · 2 usage · 3 transient · 4 environment · 5 internal.
   The last output line is JSON {class, code, next, ids?}.
   ```

   In `spawn`'s schema `--engine`, `--provider`, `--model` and `--thinking` are required flags (D-043); a missing one
   is a parser error whose first line names every missing flag, e.g. `limen spawn: missing --model, --thinking`.
   `continue` keeps its optional route flags and `model ?? defaultModel` until R-062.

   `limen land --help` is exactly this (golden):

   ```
   limen land <job> [--onto <branch>] [--yes] [--keep-open]
   merge a done job onto this branch and close its ticket

     <job>              the job's id, its suffix or its label
     --onto <branch>    refuse unless <branch> is the checked-out branch
     --yes              do not ask for confirmation in a terminal
     --keep-open        keep the ticket active, because more slices remain

   Example: limen land a1b2c3d4
   ```

   A parser error, for `limen land a1b2c3d4 --ontoo main`, is exactly this on stderr, exit 2 (golden):

   ```
   limen land: unknown flag --ontoo
   usage: limen land <job> [--onto <branch>] [--yes] [--keep-open]
   {"class":"usage","code":"BAD_ARGUMENT","next":"limen land --help"}
   ```

   The descriptions of the other entries, of every positional and flag, and of the internal entries (`rule timer`,
   `group advance`, `github ensure`, `github poll`, `github deliver`, `github review`, `github work`, `github resolve`)
   and `group wait` (caller: team members with a worker allowance) are written by the implementer under AC-9 and
   AC-10. Where the rules of item 3 give a line other than the golden
   text, the implementer stops with `BLOCKED`.
5. **New names and the old forms** (D-038, T-18):
   - `limen show <job>` prints what `limen jobs <ref>` prints today.
   - `limen status --all` prints today's `status --all` and under it one row per job of the project, as today's `limen
     jobs` rows (`src/commands/jobs.ts:68`).
   - `limen seat queue` prints what `limen queue` prints today.
   - `src/commands/jobs.ts` and `src/commands/queue.ts` lose their commands; the renderers they hold move to the
     modules that `status`, `show` and `seat queue` use (the implementer picks the module names by T-29 (1); any
     `git mv` and `git rm` is listed in `outcome.md`).
   - Every refusal of `src/old-names.ts` for a name given on the command line (a command, a subcommand, a flag, an
     engine or role value) is a `LimenError` of class `usage`, code `REMOVED`, with the replacement in `next`; a removed
     engine or role read from a job record is class `refused`, code `REMOVED`. New entries: `jobs` (`next`: `limen show
     <ref>` for `jobs <ref>`, `limen status --all` for every other form) and `queue` (`limen seat queue`).
   - `group wait` (D-042): internal, `movedBy: "R-077"`, behaviour for members unchanged. A caller that is not a team
     member (the lead's path of `groupIdentity`) gets a `LimenError` of class `refused`, code `GROUP_WAIT_MEMBERS_ONLY`,
     a message that says the command is for team members and that the lead gets the group's result once, and `next`
     `limen group status <group id>`. The comment at the check and `docs/groups.md` call it a guard against mistakes,
     keyed on the job's environment, not a security boundary (A-029); `docs/groups.md` lists `group wait` as a
     member-only command.
   - Every mention of `limen jobs` and `limen queue` in `src/`, `hook/`, `templates/` and `docs/` names the new form
     (45 lines at `20e694c`: `git grep -n -E 'limen (jobs|queue)\b' -- src hook templates docs`); the hint texts in
     `src/job/view.ts`, `src/job/publication.ts`, `src/integrations/coordinator-wake.ts`, `src/job/group-cabinet.ts`,
     `src/integrations/github-poller.ts`, `src/runtime/start-queue.ts` and `src/commands/watch.ts` included.
6. **Tests** (names after their subject, T-29 (1)): `test/registry.test.ts`, `test/parser.test.ts`, `test/help.test.ts`;
   `test/cli/old-names.test.ts` and `test/cli/status.test.ts` extended; every test that runs a renamed or cut form
   moves to the new form.

## Out of scope

- `show --result` (A-008, R-051); exact job references and one resolver (T-20, R-022): `<job>` keeps today's matching.
- The GitHub poller reads `limen github deliver`'s stderr text (`src/integrations/github-poller.ts:619-623`) and
  commands start Limen's own CLI (`src/commands/rule.ts:27`, `src/job/group-cabinet.ts:325`): T-26 (2)–(5), R-023.
- The command list in the coordinator manual (A-085, R-046); the T-14 scan of plant, pulse, keeper and the other words
  (`keeper` is a command until R-066).
- New commands of T-18 (`abandon`, `ask`, `answer`, `decide`, `escalate`, `stats`, `spec fix`, `seat sweep`, `handoff
  show`, …): their tickets add their entries. Module switches and `[on]`/`[off]` (R-044).

## Acceptance

- AC-1: `node adrian-rebuild/tools/gate.mjs` → exit 0.
- AC-2: `node --test test/registry.test.ts` → exit 0; it proves: every exported command handler under `src/commands/`
  is a registry entry's handler; every entry has every field of Change 1 with an allowed value; a top-level entry acts
  on `job`, `owner` or `project` unless it has `movedBy`; the entries with `movedBy` are exactly those of Change 1
  (D-039, D-042), and the test fails with "no entry is moved any more: remove the field movedBy and this exception"
  when none is left; an entry of object `job` other than `spawn` has a required positional of type `job`; every `example` parses with the real
  parser; every group of the help has a header; a handler that returns an undeclared `ids` key ends with exit 5.
- AC-3: `node --test test/help.test.ts` → exit 0; it proves: the general help equals the golden text of Change 4;
  `limen land --help` equals its golden text; no line is wider than 100 characters; no internal entry appears in `limen
  --help`, and `limen <name> --help` exits 0 for every entry, internal ones included; the last two lines come from
  `EXIT_CODES` and the key list of `src/outcome.ts`; both marked sections of `docs/commands.md` equal their regenerated
  text.
- AC-4: `node --test test/parser.test.ts` → exit 0; it proves: an unknown flag, a missing value, a missing positional
  and an extra positional each exit 2 with code `BAD_ARGUMENT`, `next` `limen <name> --help` and the usage line in the
  message; the parser error of Change 4 equals its golden text; `--`, `-x` and a dash value behave as Change 2 says;
  `limen spawn "task" --engine pi --provider anthropic` exits 2 with a message that names `--model` and `--thinking`.
- AC-5: `node --test test/cli/old-names.test.ts` → exit 0; it proves: every name of `src/old-names.ts` given on the
  command line exits 2 with code `REMOVED` and its `next`; `limen jobs a1b2c3d4` names `limen show a1b2c3d4`; `limen
  jobs`, `limen jobs --all`, `limen jobs --running` and `limen jobs --label x` name `limen status --all`; `limen queue`
  names `limen seat queue`.
- AC-6: `node --test test/cli/status.test.ts` → exit 0; it proves: `limen status --all` on a fixture with a job older
  than 7 days prints the summary and one row for each job.
- AC-7: `git grep -n -E 'limen (jobs|queue)\b' -- src hook templates docs` → exit 1.
- AC-11: `node --test test/cli/group.test.ts` → exit 0; it proves: the lead's `limen group wait <group id>` exits 1
  with code `GROUP_WAIT_MEMBERS_ONLY`, its message and `next` `limen group status <group id>`; a member's wait still
  ends at its time limit as before.
- AC-8: `git grep -n -E 'parseFlags|commands/flags' -- src hook` → exit 1.
- AC-9 (judgment): every help line, general and per entry, public and internal, and every line of the two generated
  sections of `docs/commands.md`, describes behaviour present in this commit (D-041 (3)).
- AC-10 (judgment): every summary and description is a usage criterion: it says when to use the command or flag, in
  T-18's plain words (z. 13).

## Migration

CLI only, no on-disk format changes: each old form exits 2 with the new form in `next`, tested on fixtures (AC-5).
A `spawn` without one of the four route flags exits 2 and names the missing ones (D-043, AC-4); `LIMEN_ENGINE` no
longer chooses the engine of a spawn. The
seat calls none of the renamed forms (`git grep -n -E "'(jobs|queue)'" -- docs/seat` at `20e694c`: none); `sweep` keeps
its name, because the seat's timer calls it until R-032.

## Risk

- The parser is shared by every command: a wrong rule breaks many commands at once. The gate's CLI tests cover every
  command that has one; AC-4 covers the rules.
- A test or a role text that still names `limen jobs` fails or misleads; AC-7 covers `src`, `hook`, `templates` and
  `docs`.
- The coordinator on the seat may spawn without a route flag, since its manual does not reach the model under the
  bridge (A-086); it then gets exit 2 with the missing flags named, instead of a silently chosen model (D-043).

## Rollback

`git revert` of the commit; no on-disk state changes.

## Decisions

- 2026-11-19 (Adrian, D-037–D-041): the mode, `status --all`, the commands a subsequent ticket moves, the modules header and
  the texts, as quoted in `## Problem`; the tagline "limen: coding jobs, each in its own git worktree" ("isolated" reads
  as a security boundary, while a worktree separates only files, A-029, G2) and the `workspace init` summary (a folder
  outside Git that holds several repositories; a job works in one of them, `--repo`), both in Change 4.
- 2026-11-19 (Adrian, D-042): `group wait` stays internal for team members, refuses a caller outside a team as a
  guard against mistakes (A-029), and R-077's criteria check the replacement, not only the removal. Adrian confirmed
  the resolution of D-042's conflict with D-039 (the test that fails once no `movedBy` entry is left) and accepted the
  golden texts of Change 4.
- 2026-11-19 (Adrian, D-043; the implementer's `BLOCKED` on the `spawn` and `ticket done` lines): `spawn` requires
  its four route flags and the refusal names the missing ones; `continue` keeps `model ?? defaultModel` until R-062;
  the `ticket done` line shows `[--on <date>]`. Adrian accepts the implementer's technical choices: (1) a final
  positional of type `text` takes the remaining words, joined by a space, and spawn's `"task"` can be replaced by the
  optional `--task-file`; (2) `--` ends the flags of every command, and empty words are dropped everywhere; (3) `group
  status`, `publish`, `stop`, `close` and `wait` declare an optional `[<group>]` first, and for a member
  (`LIMEN_GROUP_ID` set) the handler joins a given group word back into the finding or refuses it, as today; (4) `group
  wait` refuses every caller without `LIMEN_GROUP_ID`, with or without a group id, and its `next` is `limen group
  status <id>`, with the literal `<group id>` when no id was given; (5) `next` of an old name is its `instead`, except
  `jobs` (`limen show <ref>` or `limen status --all`) and `queue` (`limen seat queue`); (6) `limen <group>` and `limen
  <group> --help` list the public entries whose name starts with the group word; (7) `git mv src/commands/queue.ts
  src/commands/seat.ts`, `git mv` of `src/commands/jobs.ts` to a job-view module under `src/job/` for the renderers, a
  new `src/commands/show.ts`, `git rm src/commands/flags.ts`, and keeper, group start and the GitHub jobs call spawn's
  handler with parsed values instead of argv.
