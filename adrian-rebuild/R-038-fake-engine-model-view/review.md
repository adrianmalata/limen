<!-- PL: Recenzja ticketu R-038 (fake engine pokazuje widok modelu pod mostem; jedna deklaracja mapowania mostu
`src/runtime/bridge-view.ts`, kontrakt na seacie `seat/bridge-contract.ts`). Runda 1 (26.11, w dzień): PASS przy
wszystkich kryteriach spełnionych, z dziewięcioma uwagami; siedem idzie do jednej rundy poprawek F1–F7 (`ticket.md` →
`## Decisions` 11), jedna bez zmian z powodem, jedna do otwartych punktów `outcome.md`. Runda 2: PASS z trzema uwagami,
wszystkie do ostatniej rundy poprawek G1–G3 (`## Decisions` 12). Runda 3: PASS z pięcioma uwagami; cztery do otwartych
punktów `outcome.md` (D-092), jedną poprawia sesja główna. Stan: recenzja zamknięta. -->

# R-038 review

## Round 1 (2026-11-26, by day, `limen-rebuild-40`)

- Before: the implementer's run (after its `BLOCKED`, answered by D-127, Decision 10) → `review-guard.mjs compare
  --git` → "within its limits", exit 0; the main session's `gate.mjs` → exit 0, 1271 tests, 1271 pass (326.1 s);
  `fails-before.mjs` on the four files of AC-5 → exit 0.
- Reply: `rebuild-reviewer` with the ticket, `node_modules/.rebuild-review/R-038.diff` and `taste.md`;
  `review-guard.mjs compare` → "unchanged", exit 0; `review-verdict.mjs` → "consistent", exit 0.
- Verdict: **PASS**. AC-1–AC-12 met (AC-7 and AC-8's second half with `git grep --untracked`, the files being new);
  nine notes, no blocking finding.

| # | Finding (short) | Decision |
|---|---|---|
| 1 | note · observed: `fails-before.mjs` shows `test/cli/spawn.test.ts` failing at HEAD on its load (HEAD's `test/plant.ts` has no `engineViews`), not on its A-086 assertion | no change: `outcome.md` → `## Fails before` says so, and the fake-engine tests, which read the fake's records directly, reach HEAD's fake (D-069's explicit paths) |
| 2 | note · observed: the E-13 reference in `serve` is `#L645-L661` with no file (the evidence puts it in `src/index.ts`); `fresh`, `toolRecord`, the summary record and `PRESET` name their E-n but no bridge line (`src/runtime/bridge-view.ts:196`, `:13`, `:217`, `:362`, `:399`) | fix (F1): AC-12 asks every rule for its E-n and bridge line |
| 3 | note · observed: `PiCallMessage` and `PiCallPart` declare Pi's message shape beside the adapter's `PiMessage` and `PiMessagePart` (`src/runtime/pi-api.ts:25-32`) | to `outcome.md` → `## Open points` for gate 5.4: whether the bridge view's input is the adapter's type or Pi's transcript form is not settled by the diff, and T-32's scan passes |
| 4 | note · observed: the fake decides the bridge's "query running" state itself (`queryWaits`, `running = reserved && queryWaits`; `test/fake-engine.mjs:185`, `:426`, `:688`) | fix (F2): a bridge rule outside the one declaration departs from AC-12 ("the fake applies no mapping of its own") and T-25 (1) |
| 5 | note · observed: `transcript()` takes the last `.jsonl` by name, so `--continue` after `new` reopens the first session (`test/fake-engine.mjs:78-89`) | fix (F3): R-039's tests use `reload`, `new` and continuations on this fake |
| 6 | note · observed: `reload` and `new` run while a run is active, where Pi refuses `/reload` while streaming (`agent-session.js:3095-3097`) | fix (F4): the fake follows Pi 1.5.1 (item 2) |
| 7 | note · observed: an empty custom message shows `[empty]` where the declared array rule gives `[image]` (Pi hands the bridge custom content as text blocks, `messages.js:89-96`); E-5's exception (zero Pi tools gives Claude Code's own tools back) is not in `tools` | fix (F5): both are rules of the declaration (E-5, item 1) |
| 8 | note · guessed: `agentsPath` walks from the fake's cwd up to `/`, so an `AGENTS.md` above a test's folder would change every view's `system.append` | fix (F6): the walk cites the Pi or bridge line it follows and stops where that one stops |
| 9 | note · observed: the opening comment of `test/cli/spawn.test.ts` grows from four lines to five; T-29 (5) asks for one | fix (F7): one line |

Taste questions: T-29 (the fake-engine tests that depend on a second run started at the first settle; the A-086 spawn
test asserts the prompt shape and the absence of system text together, as item 6 prescribes: accepted), T-30, T-40 and
T-41 answered with no further finding.

## Round 2 (2026-11-26, by day, `limen-rebuild-40`)

- Before: the implementer's fixes F1–F7 → `review-guard.mjs compare --git` → "within its limits", exit 0; the main
  session's `gate.mjs` → exit 0, 1278 tests, 1278 pass (312.2 s); `fails-before.mjs` on the four files of AC-5 → exit 0.
- Reply: a fresh `rebuild-reviewer` with the same three paths and the whole diff; `compare` → "unchanged", exit 0;
  `review-verdict.mjs` → "consistent", exit 0.
- Verdict: **PASS**. AC-1–AC-12 met; three notes, no blocking finding.

| # | Finding (short) | Decision |
|---|---|---|
| 1 | note · proven: the `compact` word lets an active run finish for every reason, where Pi's manual compaction aborts the active run first (`agent-session.js:2321-2327`, `:2073-2084`) and its threshold compaction runs before the next assistant response or between `agent_end` and `agent_settled` (`:477-486`, `:1623`); the comment's "waits for idle" is wrong (`test/fake-engine.mjs:706-713`, `:562-566`) | fix (G1): R-039's re-send after a compaction (E-13) is tested on this word |
| 2 | note · observed: the in-place compaction during the task's run has no ordering against the run's next model call, so a call can pair the messages from before it with a `restart` cursor (`test/fake-engine.mjs:403`, `:412-413`, `:424`, `:711-716`) | fix (G2): Pi compacts inside the next request's preparation, before its context is built |
| 3 | note · observed: `test/fake-engine.test.ts` runs the fake with only `PATH`, so the `AGENTS*` walk can read the account's own `~/.pi/agent/AGENTS.md` and the home folder (`test/fake-engine.test.ts:38`, `test/fake-engine.mjs:415-416`) | fix (G3): the tests set the agent directory (and the home) to their own folder |

This is the last round of fixes (protocol step 6); a note of round 3 that needs code or tests goes to R-039's notes or
to `outcome.md` → `## Open points` (D-092).

## Round 3 (2026-11-26, by day, `limen-rebuild-40`)

- Before: the implementer's fixes G1–G3 → `review-guard.mjs compare --git` → "within its limits", exit 0; one hang of
  `test/s3-finish-wake.test.ts` run alone, settled by D-128 (A-089, R-111; a read-only diagnosis guarded by
  `review-guard.mjs compare` → "unchanged"); the main session's `gate.mjs` → exit 0, 1282 tests, 1282 pass (328.8 s);
  `fails-before.mjs` on the four files of AC-5 → exit 0.
- Reply: a fresh `rebuild-reviewer` with the same three paths and the whole diff; `compare` → "unchanged", exit 0;
  `review-verdict.mjs` → "consistent", exit 0.
- Verdict: **PASS**. AC-1–AC-12 met; five notes, no blocking finding. The rounds of fixes are spent, so a note that
  needs code or tests goes to `outcome.md` → `## Open points` (D-092), and a note on `outcome.md` alone is the main
  session's fix (D-053 (2)).

| # | Finding (short) | Decision |
|---|---|---|
| 1 | note · observed: an image block in a Pi first call makes `bridgeView` throw `BRIDGE_UNMAPPED`, so the contract exits 5, not 4 (`src/runtime/bridge-view.ts:386`, `seat/bridge-contract.ts:82`) | to `outcome.md` → `## Open points` 5: no ticket rewrites the contract; it never passes |
| 2 | note · observed: the contract's exit-4 lines lack the code name `BAD_DATA`; its Pi-file exit 4 and a record whose content is neither a string nor an array have no test (`seat/bridge-contract.ts:73-80`, `:93-99`) | to `outcome.md` → `## Open points` 6; step 4.1 runs the contract first (D-119) |
| 3 | note · observed: `agentsPath` walks above a test's folder before Pi's agent directory, so an `AGENTS*` file in `~/.cache` or `~` would enter the fake's views (`src/runtime/bridge-view.ts:173-180`) | to `outcome.md` → `## Open points` 7; none exists on this laptop |
| 4 | note · observed: `test/fake-engine.test.ts`'s `lines` and `views` repeat `test/plant.ts`'s readers (T-25 (2)) | to `outcome.md` → `## Open points` 8 |
| 5 | note · proven: `outcome.md` item 6 counts 16 new fake-engine tests; there are 20 | fixed by the main session in `outcome.md` (D-053 (2)) |

Taste questions: T-29, T-30, T-40 and T-41 answered with no further finding. The review is closed.
