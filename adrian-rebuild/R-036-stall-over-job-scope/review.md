<!-- PL: Recenzja ticketu R-036 (zawieszenie narzędzia mierzone na całym scope'ie joba, szczyt CPU, źródło advisory).
Runda 1 (24.11, w dzień): odpowiedź przyjęta przez `review-verdict.mjs` za pierwszym razem (pierwsza po D-101), PASS
z czterema uwagami; dwie idą do poprawki F1–F3 (`ticket.md` → `## Decisions`): cicha utrata odczytu CPU przy końcu
silnika (T-01) i zdanie w `docs/jobs.md` podające nie zmierzony próg jako fakt; jedna odrzucona z powodem, jedna trafia
do otwartych punktów `outcome.md`. Runda 2: PASS z trzema uwagami; minimalny odstęp próbek szczytu CPU i podział testu
idą do ostatniej rundy poprawek G1–G2, a długi `runInternalJob` zostaje dla zapadki R-082. Runda 3: PASS z jedną uwagą (nieobsłużony zapis logu przy
końcu silnika), która po wyczerpaniu rund trafia do notatek R-082 (D-092). Stan: recenzja zamknięta. -->

# R-036 review

## Round 1 (2026-11-24, by day, `limen-rebuild-30`)

- Before: the implementer's run → `review-guard.mjs compare --git` exit 1 for `.claude/agents/rebuild-reviewer.md`
  alone (Adrian's edit of D-101, blob `0426fed`), so the run counts (D-101 (2)); after the commit `D-101:` a new
  `snapshot --git`; the main session's `gate.mjs` → 1086 tests, 1086 pass, 0 fail (253.6 s, its exit code hidden by a
  pipe), and again → exit 0, the same counts (259.6 s); `fails-before.mjs` → exit 0 at `HEAD` `7332de2` (eleven files).
- Reply: `rebuild-reviewer` with the ticket, `node_modules/.rebuild-review/R-036.diff` and `taste.md`;
  `review-guard.mjs compare` → "unchanged", exit 0; `review-verdict.mjs` → "consistent", exit 0 (the first reply after
  D-101's form rule, accepted at once).
- Verdict: **PASS**. AC-1–AC-6 met (run in the review or read from `outcome.md`), AC-7 and AC-8 on the records, AC-9
  judged; no blocking finding, four notes.

| # | Finding (short) | Decision |
|---|---|---|
| 1 | note · observed · T-01: a failed read of the scope's CPU time in the sample at the engine's end is dropped silently: `last()` discards `sample()`'s `unread`, neither logged nor noted (`src/runtime/wrapper.ts:629-631`) | fix (F1): T-01 holds for every read, so the end's failed read is logged once as a tick's is, with a test |
| 2 | note · observed: `docs/jobs.md:209` states as a fact that the idle CPU of the wrapper, Pi and the bridge's `claude` "stays below the 2 %", which the ticket's Risk and seat step 3.8 leave to the seat | fix (F2): the sentence names 2 % as the design threshold and says what happens above it (the rule never ends the job; its timeout does), until step 3.8 records the value |
| 3 | note · observed · T-29: the D-092 hook test fails at `HEAD` because the record's validator refuses `advisory.source`, not on the one receipt per job (`outcome.md:143-153`) | rejected: `HEAD` cannot hold a note that names its source, so no form of that end-to-end test can fail at `HEAD` on the receipt alone; the receipt's own failure at `HEAD` is shown by `test/job/wake-delivery.test.ts:29` and `:52` and `test/cli/sweep.test.ts:459`, as the note says; the test checks one mechanism (T-29 (3)) |
| 4 | note · guessed: without `hadChild` (Decision 2) a pending tool with no child process (an in-process tool waiting on the network) can stall, which `HEAD` never ended; seat step 3.8 checks only `sleep 300` and a detached busy loop (`adrian-rebuild/plan.md:2217-2221`) | no code change: the ticket accepts it (Risk 2, A-059's Decision: a tool idle in the whole scope with no progress ends the job); fix (F3): `outcome.md` → `## Open points` names it for gate 5.3, with step 3.8's trial records as the place to see a `stall` end of a tool other than `bash` |

Taste questions: T-18, T-29, T-30, T-40 and T-41 answered with no finding beyond note 3.

## Round 2 (2026-11-24, by day, `limen-rebuild-30`)

- Before: the implementer's fixes F1–F3 → `review-guard.mjs compare --git` → "within its limits", exit 0; the main
  session's `gate.mjs` → exit 0, 1087 tests, 1087 pass, 0 fail (249.9 s); `fails-before.mjs` → exit 0 (the same eleven
  files at `HEAD` `7332de2`).
- Reply: a fresh `rebuild-reviewer` with the same three paths; `compare` → "unchanged", exit 0; `review-verdict.mjs` →
  "consistent", exit 0.
- Verdict: **PASS**. AC-1–AC-6 met, AC-7 and AC-8 on the records, AC-9 judged; no blocking finding, three notes.

| # | Finding (short) | Decision |
|---|---|---|
| 1 | note · guessed: the peak's last interval has no lower bound: the end's sample can lie a few milliseconds after the last tick, where the timing of two reads, not the scope's work, sets the rate, up to the cap (`src/runtime/wrapper.ts:354`, `:595-596`, `:637`; `src/runtime/stalled-tool.ts:21`, `:83-87`) | fix (G1): M-09 is this ticket's measure, and a rate over a short interval measures the reads; a pair of samples closer than half a tick gives no rate |
| 2 | note · observed · T-27 (1): `runInternalJob` changes but keeps its two "split pending" suppressions (`src/runtime/wrapper.ts:45-46`; `outcome.md` → Open point 1) | rejected for this ticket: left to R-082's ratchet, as in R-020, R-028 and R-035 (`plan.md` → `## State`, R-100's night entry); the change made the function shorter, and Biome's `--error-on-warnings` still needs both, so removing them is a split of the function, not of this ticket |
| 3 | note · observed · T-29 (3): one test checks two behaviours of `peakAfter`, no rate from one sample and the cap at the whole machine (`test/runtime/stalled-tool.test.ts:103-109`) | fix (G2): two tests |

Taste questions: T-18, T-29, T-30, T-40 and T-41 answered with no finding beyond note 3. G1–G2 are the last round of
fixes (`## Agents`, step 6): a further non-blocking note that needs code or tests goes to a later ticket's notes or to
`outcome.md` → `## Open points` (D-092).

## Round 3 (2026-11-24, by day, `limen-rebuild-30`)

- Before: the implementer's fixes G1–G2 → `review-guard.mjs compare --git` → "within its limits", exit 0; the main
  session's `gate.mjs` → exit 0, 1090 tests, 1090 pass, 0 fail (249.0 s); `fails-before.mjs` → exit 0 (the same eleven
  files at `HEAD` `7332de2`).
- Reply: a fresh `rebuild-reviewer` with the same three paths; `compare` → "unchanged", exit 0; `review-verdict.mjs` →
  "consistent", exit 0.
- Verdict: **PASS**. AC-1–AC-6 met, AC-7 and AC-8 on the records, AC-9 judged; no blocking finding, one note.

| # | Finding (short) | Decision |
|---|---|---|
| 1 | note · proven · T-01: the end's sample awaits `logOnce` with no catch (`src/runtime/wrapper.ts:640-645`), so a failed `cpu.stat` read and a failed log append at once reject `runInternalJob` and end a job whose engine exited 0 `failed`, kind `internal` (`src/main.ts:72-79`); a tick sends the same failure to `failLog` (`:629-630`) | the rounds are spent and the note is not blocking, so it goes to R-082's notes in `plan.md` → `## Tickets` (swallowed and side-channel errors reach zero, T-01), and to `outcome.md` → Open point 4 (D-092) |

Taste questions: T-18, T-29 (the two remarks are rounds 1 and 2's settled points), T-30, T-40 and T-41 answered with
no further finding.
