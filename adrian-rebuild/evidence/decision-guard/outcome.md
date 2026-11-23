<!-- PL: Wynik hooka tools/decision-guard.mjs (D-083, D-086): pytanie o decyzję (push z `Q-NN`, zapis
`.night/questions.md`) przechodzi tylko po przeszukaniu czterech źródeł od poprzedniego pytania. 63 testy; każda
wcześniejsza wersja narzędzia pada na swoich nowych testach, a każda z 42 mutacji na co najmniej jednym. Próba na
prawdziwym transkrypcie tej sesji: hook wskazał dokładnie źródła nieprzeszukane od ostatniego pytania. Stan:
zrealizowane i aktywne od 23.11: Adrian dopisał blok `hooks`, a próba na żywo potwierdziła blokadę i `is_error: true`
zablokowanego wywołania w transkrypcie. -->

# Outcome: decision guard `tools/decision-guard.mjs`

## Done

- `adrian-rebuild/tools/decision-guard.mjs` (new), a `PreToolUse` hook, exit 0 runs the call, exit 2 blocks it:
  - decision questions: a `PushNotification` whose message names `Q-NN`, a `Write` or `Edit` of
    `adrian-rebuild/.night/questions.md`; every other call passes without reading the transcript;
  - the transcript: the main session's `tool_use` blocks (`assistant` entries, no sidechain, first occurrence per id),
    each counted once its `tool_result` (`user` entry) is in and not an error; the part after the final newline is
    left out, any other non-blank line that is not a JSON object is a boundary like a question;
  - a search after the previous question: `Read` (`file_path`), `Grep` (`path`), or a Bash `grep`, `git grep`, `sed -n`
    (no `-i`, no `--in-place`) or `cat` with the source as a file argument; a small lexer (quotes, escapes, `;`, `|`,
    `&`, `(`, `)`, newlines, output redirection targets, a stop after `<<`) and an option table (grep's pattern and
    sed's script, options with an argument, `-e`/`-f`/long pattern options, `--`, long options without `=`);
  - fail closed through exit 2: an unreadable transcript, a hook input that is not JSON or lacks `tool_name` and
    `tool_input`, an internal error; block messages carry no path.
- `adrian-rebuild/tools/test-decision-guard.mjs` (new): 63 tests on fixture transcripts, the tool run as Claude Code
  runs it (stdin JSON, exit code, stderr); D-083's five cases first, then one test per mechanism.
- `plan.md`: D-086, the test in `## Commands`, the note in `## State`.

## Proof

| Criterion | Command | Exit | Result |
|---|---|---|---|
| AC-1 | `node --test adrian-rebuild/tools/test-decision-guard.mjs` | 0 | tests 63, pass 63, fail 0 |
| AC-2 | the first 24 tests, written before `decision-guard.mjs` existed | 1 | tests 24, pass 0, fail 24 |
| AC-2 | the 63 tests against the tool of review round 1 (rebuilt from `decision-guard.diff`) | 1 | pass 48, fail 15 |
| AC-2 | the 63 tests against the tool of review round 2 (`decision-guard-2.diff`) | 1 | pass 56, fail 7 |
| AC-2 | the 63 tests against the tool of review round 3 (`decision-guard-3.diff`) | 1 | pass 62, fail 1 (the long-option test) |
| AC-3 | `node adrian-rebuild/tools/check.mjs` | 0 | `… 0 errors` |
| AC-3 | `npx biome check --error-on-warnings adrian-rebuild` | 0 | `Checked 34 files … No fixes applied.` |

- Mutations: 42 one-at-a-time changes of the final tool (each mechanism of `## Change` removed or bent), each run
  against the test file: every one fails at least one test.
- Trial on this session's real transcript (Claude Code 2.1, one push `Q-36 i Q-37` asked mid-session): before that
  push the hook named the two sources the session had not read; after it, all four, since nothing was searched after
  the push. 40 transcripts of the project folder (53,393 lines) hold no line that is not a JSON object; runs on
  transcripts of 1.7–9 MB took 52–138 ms (review round 1).

## Deviations

- `## Change` grew in the three review rounds (lexer, option table, boundaries, input checks); each growth is in
  `ticket.md` → `## Decisions` with its test.
- Not checked here: that Claude Code marks a call blocked by a hook with `is_error: true` (no hook is installed yet).
  Without it a blocked question counts as asked, so the guard blocks more, never less. The first real block after
  Adrian adds the `hooks` block settles it.
- Settled on 2026-11-23 (`limen-rebuild-27`, after Adrian added the `hooks` block): a live push naming `Q-00`, sent
  after a search of `plan.md` and `input/gate-2-decisions.md` only, was blocked, the hook naming exactly `taste.md` and
  `input/zasady-budowy-harnessu.md` as not searched; the session transcript records its `tool_result` with
  `"is_error": true` and `permissionDecision` `{"decision": "reject", "source": "hook"}`, so a blocked question does
  not count as asked, as `decision-guard.mjs` reads it.

## Measurement

measured: the guard's mechanics, by the tests above. The memory rule's effect (questions the documents settle) is the
model's behaviour and is not measured here.
