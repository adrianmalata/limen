<!-- PL: Recenzja ticketu R-091 (runner same-task oznacza każdy typ obiektu Pi 1.5.1 i podaje definicję
touchpoints). Runda 1: PASS, wszystkie kryteria spełnione, cztery uwagi bez blokujących; sesja główna odrzuca
wszystkie cztery z powodem (podtabele metod i komend chronią regułę „metoda, na którą Pi czeka, nie jest
pomijana”; testy padają z jednego powodu; dwie luki sprzed zmiany są poza zakresem i trafiają do B.2). Stan:
zamknięta, bez rundy poprawek. -->

# R-091 review

## Round 1 (2026-11-19, day session)

- Before: the implementer's run → `review-guard.mjs compare --git` void only through `.claude/settings.local.json`,
  which Adrian changed himself during the run; he accepted the run (`ticket.md` → `## Decisions`). The main session's
  `node adrian-rebuild/tools/gate.mjs` → exit 0, 253/253, fail 0 (90.8 s). The main session's before-run (AC-2, as
  `ticket.md` → `## Decisions` replaces the command): `git archive HEAD` unpacked, the new `test-same-task.mjs` and
  `fake-pi-rpc.mjs` copied in → `node --test adrian-rebuild/tools/test-same-task.mjs` → exit 1, tests 57, pass 42,
  fail 15.
- Inputs: `adrian-rebuild/R-091-same-task-event-marks/ticket.md`, the diff from `review-guard.mjs diff --out
  node_modules/.rebuild-review/R-091.diff`, `adrian-rebuild/taste.md`; the Pi 1.5.1 sources in
  `adrian-rebuild/input/vendor/` as data.
- Guard: `review-guard.mjs compare node_modules/.rebuild-review/R-091.before` → `unchanged`, exit 0.
- Parser: `review-verdict.mjs node_modules/.rebuild-review/R-091.reply <ticket.md>` → `consistent`, exit 0.
- Verdict: PASS. AC-1–AC-5 met: the reviewer ran the runner's tests (57/57), `check.mjs` and Biome (exit 0), compared
  `Object.keys(MARKS)` with the ticket's list (26 of 26, nothing missing or extra) and checked the header's source
  lines against the package sources, including that only `select`, `confirm`, `input` and `editor` put an entry in
  Pi's pending extension requests. Taste questions: T-29 yes (each test fails at HEAD for one reason), T-30 yes,
  T-40 no wait for the owner added.

| # | Finding | Kind | Decision |
|---|---|---|---|
| 1 | The `handled` marks of `response` and `extension_ui_request` in `MARKS` are never read, because `markOf` takes the `RESPONSES` or `UI_METHODS` value for those two types first (`pi-rpc.mjs:53-54`, `:113-120`) | note · proven | rejected: the entries record that the runner reads both types, which AC-5 asks of `MARKS`; letting the type's entry decide first would make the rule that no waiting method is skipped depend on that entry, while today only the method's own row in `UI_METHODS` can skip it |
| 2 | Two new tests check more than one effect (`test-same-task.mjs:325`, `:679`) | note · observed | rejected: the first follows the ticket's test name (exit code and the file it names), the second checks the two fields of one write in one `deepEqual`; each fails at HEAD for one reason (`outcome.md` → Fails before) |
| 3 | A run that writes no `agent_start` leaves `awaitingStart` true, so the attempt waits until its time limit; the sources allow a `started` response followed by `agent_settled` with no `agent_start` when `agent.prompt` throws first (`same-task.mjs:216-224`, `:272`) | note · guessed | rejected for this ticket: the gap is at HEAD too, the ticket does not ask for it, and what the runner should do then (reply again or end) is a decision B.2's evidence should inform; recorded in `outcome.md` → Open points for B.2 |
| 4 | On exit 4, `result.json` is not written, so `extensionErrors` and the turns gathered before a protocol error are lost; `protocol-error.json` and `<out>/session` stay (`same-task.mjs:563-578`) | note · observed | rejected: as before this change for every failure; the ticket asks for `protocol-error.json` and the transcript, which stay; recorded in `outcome.md` → Open points |
