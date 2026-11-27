<!-- PL: Wynik zmiany narzędzia `tools/changes-entries.mjs` według D-138: commit ticketu rozpoznawany po pierwszym słowie
tematu (jak dzieli `awk`), a linia Rollback w postaci z D-009, chyba że jej `--grep` trafia też w commit o innym temacie;
wtedy wymagana jest postać dokładna z `awk`, którą błąd `check.mjs` podaje. Nowe testy padały na module z `e645561`.
Stan: zrobione przez sesję główną `limen-rebuild-44`; recenzja: FAIL, potem PASS, w review.md. -->

# Outcome: a ticket's commit is found by its subject (D-138)

## Done

1. `adrian-rebuild/tools/changes-entries.mjs`: `commitsFor` counts the commits whose subject's first word is `<id>:`
   (the words split as `awk` splits them); `exactRollbackCommand` gives D-138's form; `expectedRollback` gives D-009's
   form while every commit its `--grep` finds is counted, else the exact one; `checkFields` requires it and names it in
   its error.
2. `adrian-rebuild/tools/test-changes-entries.mjs`: four tests of a second fixture ticket R-002 with a body line
   `R-002: …` in another commit: D-009's form is an error naming the exact form; the exact form passes before the
   commit; after the commit one commit is counted and the entry passes; the `awk` command selects only that commit.
3. `adrian-rebuild/changes.md`: R-045's entry names the exact form (its ID starts a body line of `b6365c8`).

## Proof

| Command | Exit | Result |
|---|---|---|
| `node --test adrian-rebuild/tools/test-changes-entries.mjs` (AC-1) | 0 | 9/9 |
| `node adrian-rebuild/tools/check.mjs` (AC-3), on the working tree with R-045's entry | 0 | "0 errors" |
| `npx biome check --error-on-warnings adrian-rebuild` (AC-4) | 0 | — |

## Fails before

The new test file run against the module of `e645561` with only `exactRollbackCommand` added (a copy in the session's
scratchpad, since without that export the file fails at import, which shows no mechanism): `tests 9`, `pass 6`,
`fail 3`; the three failures are the D-138 tests of the D-009 form's error, of the exact form before the commit and of
the count after it. The fourth D-138 test, the `awk` selection, passes there too: it checks the command string, which
the copy holds.

## Deviations from the ticket

- The fixture's ticket is R-002, not R-001 (fixed in `## Change`).

## Open points

1. A commit body that starts a line with the ID of an entry already in HEAD makes that entry's D-009 Rollback collide,
   and `check.mjs` then requires the exact form there; the main session's commit bodies start no line with `R-NNN:`
   (D-138).
2. Review round 2, note 1: no test tells `commitsFor`'s first-word match from a prefix match (a subject `R-NNN:x` or
   one with a leading blank); no such subject exists or is written.
3. Review round 2, note 2: `check.mjs` takes about 5.4 s instead of 1.8 s, since `commitsFor` reads the whole branch
   log twice per entry; one read per `checkEntries` run would remove it.
4. Review round 2, note 3: D-009's form is kept when the commits its `--grep` finds are among the counted ones, not
   the other way round; a subject with a leading blank would be counted but not found by `--grep`.

