<!-- PL: Specyfikacja zmiany check.mjs według D-054 (1) i (3), w kształcie ticket.md, dla recenzji rebuild-reviewer
(narzędzie przebudowy bez numeru R-NNN, jak handover.mjs w D-047). check.mjs przyjmuje status `ready` i wymaga dla
niego ticket.md albo wpisu decyzji, pozwala ticketowi pair na `Run` = `night` dopiero z zapisanymi wyborami i dopasowuje
każde polecenie kryterium ticketu `ready` albo `active` do allow-listy z `.claude/settings.local.json`. Reguły leżą
w nowym module tools/ticket-rules.mjs z testem. Stan: zrealizowane; trzy rundy recenzji w review.md. -->

# Night-ready checks: `ready`, night pair tickets and the allow-list in `check.mjs`

## Problem

D-054 (2026-11-20, Adrian) adds the status `ready` against night blocks and lets a pair ticket run at night once its
choices are recorded:
- D-054 (1): "`ready`: a status of `## Tickets` that the day session sets once a ticket can run at night without
  Adrian: a ticket whose dependencies are `done` has its full `ticket.md`, its criteria run at HEAD (D-025) and naming
  only commands of the allow-list (D-036); a ticket whose dependencies are not yet `done` has every decision it needs
  recorded (in `plan.md` → `## Decisions` or its `ticket.md` → `## Decisions`), and the night writes its `ticket.md` at
  the HEAD it starts from. A night run takes only `ready` tickets. […] `check.mjs` accepts `ready`, requires for it a
  `ticket.md` or a recorded decision entry, and checks that every criterion command matches the allow-list of
  `.claude/settings.local.json` when that file exists (a change of `adrian-rebuild/tools/`, with its test and a review
  by `rebuild-reviewer`, outside the ticket list, as D-047 was)."
- D-054 (3): "his answers […] go to `ticket.md` → `## Decisions`; the ticket keeps the mode `pair` and its `Run` becomes
  `night`, and `rebuild-implementer` implements it".
- D-036: "a criterion names only commands on the list of `## Commands`"; D-025: a criterion states "its expected
  result as an exit code and no `!` before the command".

Today `check.mjs` rejects both: `STATUS` has no `ready` (`adrian-rebuild/tools/check.mjs` line 45) and `checkRuns`
derives `Run` from the mode alone, so a pair ticket is `day` or `day-after` (line 391). Nothing checks a criterion's
command against the permissions, so a night run meets the refusal only when it runs the command: the night logs of
2026-11-17 to 2026-11-19 (`adrian-rebuild/.night/*-run-1.log`, untracked) hold 53 refused Bash calls among 756 in
`dontAsk` mode (the refusal text occurs 159 times in the stream), among them criterion runs such as `git ls-files -- templates/scout.md | grep -q .; echo "AC-1 exit $?"` and
`node seat/deploy.ts` (R-012's AC-6, which became Q-8).

How Claude Code matched the allow-list in those logs (the facts the matcher follows): a bare
`node adrian-rebuild/tools/fails-before.mjs` ran under the rule `Bash(node adrian-rebuild/tools/fails-before.mjs *)`
(12 calls), so a trailing ` *` also matches the bare command; every part of a compound command was checked
(`sed -n … ; echo ----; cat …` ran, `…; echo "exit $?"` was refused); a `|` inside single quotes did not split
(`git grep -n -I -i -E '\bjg\b|jevgrep|Cue: Search' -- …` ran); `TMPDIR=… node --test …` and `git -C <repo> status`
were refused, since no rule starts with them. Claude Code also lets some read-only commands through that no rule
lists (`echo ----`, `od -c`); the check does not model that, so it can only be stricter than Claude Code.

## Change

1. `adrian-rebuild/tools/ticket-rules.mjs` (new), Node without dependencies, pure functions over text:
   - `section(text, name)`: moved from `check.mjs` unchanged (a `## ` line inside a fence is no heading), which now
     imports it.
   - `STATUS`: `planned`, `ready`, `ready (D-NNN[, D-NNN…])`, `active`, `blocked`, `done`, `dropped (<reason>)`.
   - `checkRuns(tickets, files)`: moved from `check.mjs` with `dependencyClosure`; a pair ticket may also have `Run`
     `night` when its `ticket.md` → `## Decisions` holds a dated entry (`- YYYY-MM-DD …`); without one it is an error
     naming D-054 (3). `files` maps a ticket ID to `{ path, text }` of its `ticket.md`.
   - `criteria(ticketText)`: the criteria of `## Acceptance`, one per `- AC-N` line, with or without the template's
     colon (review round 2), its indented continuation lines joined; a criterion is a judgment when `(judgment)` follows its ID; its commands are the backticked spans
     followed by `→ exit` (D-025), so a span such as `outcome.md` → `## Fails before` is no command.
   - `loadPermissions(json)`: the `Bash(…)` rules of `permissions.allow`, `permissions.deny` and `permissions.ask` (an
     `ask` rule refuses in `dontAsk` mode, as a deny rule does; a bare `Bash` means `Bash(*)`); invalid JSON throws.
   - `refusal(command, permissions)`: `undefined` when Claude Code's allow-list lets the command through, else the
     reason. The command splits on `&&`, `||`, `;`, `|`, `&` and newlines outside quotes; a part is refused when it
     holds `$` or a backtick outside single quotes, a `>` or `<` outside quotes (D-016: no redirection), an unbalanced
     quote, matches a deny rule, or matches no allow rule. A rule's `*` matches any text, and a trailing ` *` also
     matches nothing (the bare command).
   - `checkReady(tickets, { files, decisions, permissions })`: for `ready`, a ticket whose dependencies are all `done`
     needs its `ticket.md`; one whose dependencies are not all `done` needs its `ticket.md` or the status
     `ready (D-NNN, …)` naming entries of `plan.md` → `## Decisions` that each name the ticket's ID. For `ready` and
     `active` tickets with a `ticket.md`: a criterion that is not a judgment names at least one command with its exit
     code, and with `permissions` every such command passes `refusal`. Other statuses are not checked, so a `blocked`
     ticket keeps the criterion that blocked it.
2. `adrian-rebuild/tools/check.mjs`: imports the module; reads the ticket folders before the plan; runs `checkRuns`
   with the files and `checkReady` with `.claude/settings.local.json` when it exists (an unreadable file is an error);
   its summary line counts the `ready` tickets and says whether the allow-list was read.
3. `adrian-rebuild/tools/test-ticket-rules.mjs` (new), written first: one test per mechanism (T-29), on strings, with
   no repository.
4. `adrian-rebuild/plan.md`: `## Tickets` → the `Run` and `Status` columns; `## Commands` → the new test in the checks
   row; `## State`.
5. `adrian-rebuild/tools/review-verdict.mjs` (review round 1, note 8): `acceptanceIds` returns the IDs of `criteria()`.

## Out of scope

- The read-only commands Claude Code allows without a rule, paths outside the repository (refused by Claude Code even
  under a matching rule, e.g. `ls -ld <home>/.cache`), and `Edit`, `Write` or `Agent` rules.
- That the decisions recorded for a ticket are all it needs, and that a ready ticket's criteria pass at HEAD: the day
  session's judgment (D-054 (1), D-025).
- That tickets of two independent branches are `ready` (D-054 (1)): the day session's duty, not a property of the plan.
- The night's choice among `ready` tickets: `## Agents` step 1, prose.

## Acceptance

- AC-1: `node --test adrian-rebuild/tools/test-ticket-rules.mjs` → exit 0.
- AC-2: the same test file before `ticket-rules.mjs` exists → exit 1 (the main session's run, in `outcome.md`).
- AC-3: `node adrian-rebuild/tools/check.mjs` → exit 0; `npx biome check --error-on-warnings adrian-rebuild` → exit 0.
- AC-4: `node --test adrian-rebuild/tools/test-changes-entries.mjs` → exit 0 (the moved `section` does not change the
  other checks); `node --test adrian-rebuild/tools/test-review-verdict.mjs` → exit 0.
- AC-5 (judgment): `refusal` never lets through a command that the rules of `.claude/settings.local.json` and the
  night logs' facts in `## Problem` would refuse, and the moved code of `check.mjs` keeps its behaviour.

## Migration

none: a rebuild tool; the plan's existing statuses and runs stay valid.

## Risk

- A false refusal of a command Claude Code allows without a rule: the day session rewrites the criterion with a listed
  command (D-036), which the night needs anyway.
- A dated entry in a pair ticket's `## Decisions` that is not Adrian's answer to the variants sheet passes the `Run`
  check; the variants sheet and his answer are the day session's step (D-054 (3)).

## Rollback

`git revert` of the commit `D-054: …`; `check.mjs` goes back to rejecting `ready` and night pair tickets.

## Decisions

- 2026-11-20 (main session): the decision entry of a ready ticket whose dependencies are not done is named in its
  status, `ready (D-NNN)`, so the link is checked by code and not found in prose; the module is named after its subject,
  the rules of ticket rows and ticket files (T-29, T-25).
- 2026-11-20 (main session, review round 1, `review.md`): all eight notes are fixed: (1) a pair ticket whose `Run` is
  `night` counts as a night ticket of its stage, so a pair ticket after it is `day-after`; (2) tests pin that a trailing
  ` *` needs a space (`git statusx` under `git status *`) and that `&` splits; (3) the doc comments of `check.mjs` sit
  above their functions; (4) `## State` is updated in the commit; (5) `## Problem` counts distinct refused calls;
  (6) an `ask` rule refuses as a deny rule does, since `dontAsk` mode refuses what it would ask, and a bare `Bash` rule
  means `Bash(*)`; (7) the three tests that combined mechanisms are split (T-29 (3)); (8) `review-verdict.mjs` takes a
  ticket's criterion IDs from `criteria()` (T-25 (2)), so `adrian-rebuild/tools/review-verdict.mjs` changes too.
- 2026-11-20 (main session, review round 2, the last round of fixes): (1) a criterion line without the template's
  colon (`- AC-2 …`) still opens a criterion, so its command is checked and `acceptanceIds` keeps requiring it, as
  before; a test; (2) `plan.md` → `## State` is in the diff of round 3; (3) the comment of `readPermissions` in
  `check.mjs` names the `ask` rules.
- 2026-11-20 (main session, review round 3, PASS): its one note is text of this file (`## Change` item 1 described the
  round-1 parser), fixed without a fourth review, as D-053 (2) closes a round whose fixes are text only.
