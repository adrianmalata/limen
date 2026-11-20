<!-- PL: Recenzje ticketu R-017 (jeden adapter API Pi ze strażnikami i kontrakt typów na prawdziwych typach Pi 1.5.1).
Runda 1: PASS z sześcioma uwagami; cztery idą do poprawek wznowionego implementera (strażnik tool_call tylko w grupie,
bo Pi rzuca dalej błąd handlera tool_call i blokuje narzędzie; testy strażników po jednym powodzie; część tekstowa
wymaga text; argument polecenia limen przez strażnika), dwie odrzucone z powodem. Runda 2: PASS z czterema uwagami:
dokładniejszy komentarz przy tool_call (implementer), dosłowne wyjście fails-before i D-059 w osobnym commicie (sesja
główna), jedna odrzucona. Runda 3: PASS bez uwag. Stan: zamknięta. -->

# R-017 review

## Round 1 (2026-11-20, day session `limen-rebuild-12`)

- Before: `review-guard.mjs compare --git` after the implementer → "the implementer's run is within its limits", exit
  0; the main session's `node adrian-rebuild/tools/gate.mjs` → exit 0, 366/366, skipped 0; `node
  adrian-rebuild/tools/fails-before.mjs` → exit 0 (six files "fail at HEAD (exit 1)"), recorded in `outcome.md`
  before the review.
- Reviewer: `rebuild-reviewer` with the ticket, `node_modules/.rebuild-review/R-017.diff` and `taste.md`. Its first
  reply was rejected by `review-verdict.mjs` (exit 1: AC-9 spread over five lines, so the tool read AC-1–AC-8 only);
  the same reviewer reissued it in the fixed format without rerunning anything; `review-verdict.mjs` → "consistent",
  exit 0; `review-guard.mjs compare` → "unchanged", exit 0.
- Verdict: **PASS**. AC-1–AC-9 met.

| # | Finding (short) | Decision |
|---|---|---|
| 1 | The `tool_call` guard of `hook/group-peer.ts` runs on every tool call of every session, before the group check; Pi 1.5.1 rethrows a `tool_call` handler's error and blocks the call (`runner.js` `emitToolCall` has no try/catch, `agent-session.js` `_beforeToolCall` rethrows), so one refusal would block every tool of every session | fix |
| 2 | Four guard tests assert more refusals than their names state, so each can fail for more than one reason (T-29 (3)) (`test/runtime/pi-api.test.ts`, the `tool_result`, `message_end`, context and settle tests) | fix |
| 3 | The Change 5 scan catches only types named `PiApi` or with an `on(event` member, so a Pi context type declared again under another name passes it | rejected |
| 4 | The message-part guard accepts a `type: "text"` part without `text`, although Pi's `TextContent` requires it (`src/runtime/pi-api.ts`) | fix |
| 5 | The `args` of the `limen` command is Pi data read without a guard (`hook/wake.ts`, `args.trim()`) | fix |
| 6 | `asHandedOver` passes a wrong shape to `piSettleEvent` through the `any` of `JSON.parse`, which the T-27 cast scan does not count (`test/runtime/pi-api.test.ts`) | rejected |

Fixes (for the resumed implementer, `ticket.md` → `## Decisions`): 1, 2, 4, 5.

Rejected, with reasons:
- 3: the scan is what `## Change` 5 and T-32 (1) define; a Pi context type under another name differs from a project
  type only by its fields, so finding it needs a heuristic over field names that would flag Limen's own types. The two
  known re-declarations are gone (AC-4, and `CoordinatorSession` is a `Pick` of the adapter's context, Change 6), and
  the contract compares only the adapter, so a second declaration would be unchecked code the review sees.
- 6: `piSettleEvent` takes Pi's typed payload by design (the implementer's deviation 4: the handler is generic in Pi's
  entry type, so it can pass Pi's entries back and cannot make one up), so a test can hand it a wrong shape only as
  untyped data. The helper does that the way Pi's runtime does, through JSON, and its doc comment says so; the
  alternatives are an `as unknown as` cast, which T-27 bans everywhere, or a counted cast over the test ratchet's
  baseline, or a weaker signature in `src/`, all worse than one documented test helper.

## Round 2 (2026-11-20, day session `limen-rebuild-12`)

- Before: `review-guard.mjs compare --git` after the resumed implementer (a new snapshot after the main session's
  edit of `ticket.md`, D-035) → "within its limits", exit 0; the main session's `gate.mjs` → exit 0, 377/377, skipped
  0; `fails-before.mjs` → exit 0 (eight files "fail at HEAD (exit 1)"), and each new hook test file alone fails at
  `HEAD`; recorded in `outcome.md` before the review.
- Reviewer: a fresh `rebuild-reviewer` with the same three paths; `review-verdict.mjs` → "consistent", exit 0;
  `review-guard.mjs compare` → "unchanged", exit 0.
- Verdict: **PASS**. AC-1–AC-9 met; round 1 fixes (1), (2), (4) and (5) hold.

| # | Finding (short) | Decision |
|---|---|---|
| 1 | `getArgumentCompletions(prefix)` in `hook/wake.ts` reads a Pi value without a guard; `outcome.md` → Open point 7 records it | rejected |
| 2 | The comment above the `tool_call` handler of `hook/group-peer.ts` says the guard runs where "this handler blocks a call anyway", but the handler blocks only `task`, while a refused payload inside a group blocks any tool call of the member (T-30) | fix |
| 3 | `outcome.md` → `## Fails before` paraphrases the tail of the second `fails-before.mjs` run instead of quoting it | fix (main session) |
| 4 | The diff's `plan.md` holds D-059, a protocol amendment unrelated to R-017, which R-017's rollback would revert | fix (main session) |

Fixes: 2 by the resumed implementer (a comment in code, so it gets a round, D-053 (2)); 3 and 4 by the main session:
`## Fails before` quotes the run's lines, and D-059 is its own commit `911f8ae`, so the diff of round 3 has no D-059.

Rejected, with reasons:
- 1: the callback is neither an event nor a context field, which AC-9 and Change 2 name; Pi's type for `prefix` is
  `string` and the contract checks the method against it; the caller lives in `pi-tui`, which is not vendored, so
  what a thrown error does there (a reported error or a broken terminal UI) is unknown, while `startsWith` on a
  non-string coerces it and at worst lists no completion. `outcome.md` → Open point 7 keeps it visible.

## Round 3 (2026-11-20, day session `limen-rebuild-12`)

- Before: `review-guard.mjs compare --git` after the resumed implementer (a new snapshot after the main session's
  edit of `ticket.md`) → "within its limits", exit 0; the main session's `gate.mjs` → exit 0, 377/377, skipped 0. The
  fix is a comment, so `fails-before.mjs` was not run again.
- Reviewer: the round 2 `rebuild-reviewer`, resumed with the new diff at the same path (D-059 is no longer in it);
  `review-verdict.mjs` → "consistent", exit 0; `review-guard.mjs compare` → "unchanged", exit 0.
- Verdict: **PASS**. AC-1–AC-9 met; round 2 findings 2 and 3 closed, 4 out of the diff. Findings: none.
