<!-- PL: Recenzja ticketu R-014 przez rebuild-reviewer. Runda 1 (19.11, w dzień): PASS, kryteria AC-1–AC-11
spełnione, dwanaście uwag bez znalezisk blokujących. Sesja główna kieruje jedenaście poprawek do wznowionego
implementera (m.in. procedury seata i teksty, które nadal spawnują bez flag trasy albo obiecują zapasowy model,
martwe funkcje widoku, podział zbiorczego testu REMOVED, wielokropek tylko przy ukrytej fladze) i odrzuca jedną z
powodem (T-38 to R-023). Runda 2: PASS z trzema uwagami (nieaktualne zdanie o domyślnym silniku, regresja `rule
--help`, niewymagane `--team`), poprawione w drugiej rundzie poprawek. Runda 3: PASS z pięcioma uwagami; Adrian
zgodził się na trzecią rundę poprawek (D-044). Runda 4 (zawężona): PASS, trzy nowe uwagi nieblokujące przeszły do
bramki 5.1, R-023 i R-081. Stan: zamknięty. -->

# Review: R-014 One command registry, a shared parser and generated help

## Round 1 (2026-11-19, day session)

- Inputs: `adrian-rebuild/R-014-command-registry/ticket.md`, the diff from `review-guard.mjs diff --out
  node_modules/.rebuild-review/R-014.diff` (6,184 lines), `adrian-rebuild/taste.md`.
- Main session before the review: `review-guard.mjs compare --git node_modules/.rebuild-review/R-014.git <ticket.md>`
  → "within its limits", exit 0; `node adrian-rebuild/tools/gate.mjs` → exit 0, 234/234; `fails-before.mjs` → exit 0
  (13 new or changed test files fail at `HEAD`).
- After the review: `review-guard.mjs compare node_modules/.rebuild-review/R-014.before` → `unchanged`, exit 0;
  `review-verdict.mjs node_modules/.rebuild-review/R-014.reply <ticket.md>` → `consistent`, exit 0.
- Verdict: PASS. AC-1 to AC-11 met (AC-9 and AC-10 judged); twelve notes, none blocking.

| # | Finding | Kind | Decision |
|---|---|---|---|
| 1 | The parser error of `spawn` and `keeper` takes three lines, because their usage line passes 100 characters with `usage: `; the outcome names only `github review` and `github work` as wrapping | note · proven | fix: the outcome's deviation names every entry whose usage line wraps (the wrap itself follows the width limit of T-19) |
| 2 | `docs/seat/README.md:35` and `docs/seat/agent-setup.md:200` (with `$MODEL_FLAGS`, `:35`) spawn without the route flags that D-043 requires | note · proven | fix: both name all four flags |
| 3 | `templates/agents.md:86`, `:166` and `docs/setup.md:94-98` promise the spawn model fallback that D-043 cut | note · proven | fix: they say spawn requires the four flags and that only `continue` falls back until R-062; a `defaultModel` branch or variable that no caller reaches any more goes |
| 4 | `docs/jobs.md:48` names the cut form `jobs <id>` | note · proven | fix: `limen show <id>` |
| 5 | The comment of `Parsed.get` says a repeatable flag gives the last value; the code joins them | note · proven | fix: the comment says what the code does |
| 6 | `--role` says "run with .agents/limen/<role>.md", but without it the package's `templates/<role>.md` is used | note · proven | fix: the description names both |
| 7 | `picture build` is `read` although `--json <file>` writes, while `board` is `change` for `--write` | note · observed | fix: `picture build` is `change`, by the same rule as `board` |
| 8 | `github review` and `github work` end with ` …` although they hide no flag | note · observed | fix: an abbreviated line ends with ` …` only when it hides a flag (Change 3's intent: the line shows every flag unless it says it does not) |
| 9 | The `<group>` text of `group wait` is partial: the lead is refused without an id too, and a member who gives a word is refused | note · observed | fix: the description says both |
| 10 | The aggregated `REMOVED` test covers four mechanisms and asserts the class, not the exit status (T-29 (3)) | note · observed | fix: one test per mechanism (removed command or subcommand, flag, engine value, role), each asserting the exit status and the code |
| 11 | The `GROUP_WAIT_MEMBERS_ONLY` test takes no snapshot of `.limen/` before and after (T-38 (4)) | note · observed | rejected: T-38 ("a refusal leaves no trace, by construction") is built by R-023, whose check covers every refusal; here the refusal runs before any read (`src/commands/group.ts:432-440`) |
| 12 | `humanSnapshot`, `tallyStates` and `humanRow` in `src/job/view.ts` lost their last caller with `limen jobs` | note · observed | fix: this ticket removed their caller, so it removes them |

Taste questions (T-14, T-18, T-19, T-29, T-30): answered yes, with the exceptions that findings 6, 8, 9 (T-19), 10
(T-29) and 5 (T-30) name.

## Round 2 (2026-11-19, day session)

- Fix round 1 by the resumed implementer: `compare --git` → "within its limits", exit 0; `node
  adrian-rebuild/tools/gate.mjs` → exit 0, 238/238; `fails-before.mjs` → exit 0 (13 files fail at `HEAD`).
- A fresh `rebuild-reviewer` with the same three inputs (the new diff, 6,447 lines). After it: `compare` →
  `unchanged`, exit 0; `review-verdict.mjs` → `consistent`, exit 0.
- Verdict: PASS. AC-1 to AC-11 met; three notes, none blocking.

| # | Finding | Kind | Decision |
|---|---|---|---|
| 1 | `templates/agents.md:88` still calls `--engine pi` "the only engine and the default", though spawn requires `--engine` (D-043) | note · proven | fix: the line says the flag is required |
| 2 | `limen rule --help` prints only the bare `rule` entry; at `HEAD` it printed `rule set` and `rule end` too, because a registered command never reaches the group help | note · proven | fix (a regression): `--help` of an entry whose name is also the first words of other entries lists those entries' lines after its own, with a test |
| 3 | `group start` cannot run without `--team`, but the schema does not mark it required, so its help hides it and a missing `--team` exits 1 untyped | note · observed | fix: `--team` is required in the schema, so a missing one exits 2 with the usage line (not a regression, but the rule of Change 2) |

Taste questions: yes, with finding 1 (T-14), findings 2 and 3 (T-19) and one combined assertion in
`test/help.test.ts:103` (T-29), which is accepted: the golden help and its final line are one output.

## Round 3 (2026-11-19, day session)

- Fix round 2 by the resumed implementer: `compare --git` → "within its limits", exit 0; `node
  adrian-rebuild/tools/gate.mjs` → exit 0, 240/240; `fails-before.mjs` → exit 0 (13 files fail at `HEAD`). The
  implementer's choice that a repeatable flag carries no ` …` in a usage line (outcome deviation 8) was accepted by
  Adrian.
- A fresh `rebuild-reviewer` with the same three inputs (the new diff, 6,534 lines). After it: `compare` →
  `unchanged`, exit 0; `review-verdict.mjs` → `consistent`, exit 0.
- Verdict: PASS. AC-1 to AC-11 met; five notes, none blocking. Both rounds of fixes are used, so Adrian decides what
  happens to them (`## Agents`, step 6).

| # | Finding | Kind | Decision |
|---|---|---|---|
| 1 | A value flag given twice now exits 2 on every command; at `HEAD` `continue`, `keeper` and `rule set` let the last use win, and Change 2 does not list this | note · proven | Adrian (D-044): the strict rule stays; a departure from Change 2 in `outcome.md` |
| 2 | The comment of `usageTerms` says a repeatable flag says so in its description, but `continue --label` (repeatable, the last one wins) does not | note · proven | Adrian (D-044): fix: `--label` is an ordinary value flag, a second one exits 2 |
| 3 | The refusal lines of `queue` and `jobs` say something else was removed ("with the seat group", "with the job list in status and show"); their `next` is right | note · proven | Adrian (D-044): fix in fix round 3 |
| 4 | `docs/commands.md:94` says Limen's processes and team members run the internal commands, but the coordinator runs `github review`, `work` and `resolve` (their declared caller) | note · observed | Adrian (D-044): fix in fix round 3 |
| 5 | Words are still read outside `src/parser.ts`: the `--help` lookup in `src/main.ts:58-61` and the `jobs` refusal's `next` (`src/old-names.ts:86`); the T-19 scan covers only `process.argv` and `Command(args` | note · observed | Adrian (D-044): fix in fix round 3, with tests that fail before it; the static scan stays in R-023 |

## Round 4 (2026-11-19, day session; scope of D-044)

- Fix round 3 by the resumed implementer: `compare --git` → "within its limits", exit 0; `node
  adrian-rebuild/tools/gate.mjs` → exit 0, 244/244; `fails-before.mjs` → exit 0 (13 files fail at `HEAD`).
- A fresh `rebuild-reviewer` with the same three inputs (the new diff, 6,733 lines), told to check only round 3's notes
  and regressions (D-044). After it: `compare` → `unchanged`, exit 0; `review-verdict.mjs` → `consistent`, exit 0.
- Verdict: PASS. AC-1 to AC-11 met; round 3's notes 1–5 resolved; three new notes, none blocking. By D-044 the ticket
  is committed and each note goes to the ticket it names.

| # | Finding | Kind | Decision |
|---|---|---|---|
| 1 | The old-words schema of `jobs` takes the job word and the flags as independent parts, so `limen jobs --all a1b2c3d4` names `limen show a1b2c3d4` and `limen jobs -- --all` names `limen show --all`, which itself exits 2; D-038 and `docs/commands.md:187` say only `jobs <ref>` names `show` | note · proven | D-044: gate 5.1, with the refusal wordings |
| 2 | The test of `--help` as a flag's value asserts only "no success, no help", so a parser refusal (exit 2) would pass it too | note · proven | D-044: R-023 |
| 3 | The caller list above the internal section of `docs/commands.md:94` omits "a later command when that timer died" and `limen group status`, which the generated lines name | note · proven | D-044: R-081 |
