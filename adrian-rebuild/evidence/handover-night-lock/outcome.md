<!-- PL: Wynik strażnika blokady nocy (D-102 (5)): `night.mjs` eksportuje `liveOwner(root)`, jedną regułę żywej
blokady, której używa też jego przejmowanie porzuconej blokady, a `handover.mjs start` i `close-previous` odmawiają
kodem 1 z właścicielem blokady, zanim cokolwiek wywołają w tmux albo wyślą sygnał. Dowód: testy handover 24/24 (przed
zmianą 22/24), testy night 29/29, Biome i check.mjs z kodem 0; recenzja PASS w rundzie 1. Stan: zamknięte commitem
`Tools: …` 24.11 przed nocą do 08:00. -->

# Outcome: handover refuses while a night holds its lock (D-102 (5))

## Done

- `adrian-rebuild/tools/night.mjs`: `liveOwnerOf(text)` is the one liveness rule (pid, start time and boot id of a
  running process); the new export `liveOwner(root)` reads `<root>/adrian-rebuild/.night/lock` through it, and the
  takeover `removeAbandoned` uses it too. The takeover's line still names the abandoned owner's pid (`parseOwner`),
  which `test-night.mjs:408` checks.
- `adrian-rebuild/tools/handover.mjs`: `requireNoNight(repo)` is the first check of `start` and `close-previous`; a
  live owner ends the command with exit 1: `handover: a night run holds adrian-rebuild/.night/lock (night.mjs pid
  <pid>, started <started>); a day session only reads until it ends (D-102)`.
- `adrian-rebuild/tools/test-handover.mjs`: three tests (9–11): `start` refuses and makes no tmux call; `close-previous`
  refuses, makes no tmux call and leaves an older claude alive; an owner gone, a start or boot id that differs, and a
  text that is no owner record refuse neither command.

## Proof

- Tests first, code unchanged: `node --test adrian-rebuild/tools/test-handover.mjs` → 22 of 24 pass; `not ok 9 - start
  refuses while a live night.mjs holds .night/lock, names its owner and opens nothing` and `not ok 10 - close-previous
  refuses while a live night.mjs holds .night/lock, and closes or stops nothing` (each `0 !== 1`); test 11 passes, a
  guard of a fact already true (no lock refused anything before).
- After the change: `node --test adrian-rebuild/tools/test-handover.mjs` → exit 0, 24/24; `node --test
  adrian-rebuild/tools/test-night.mjs` → exit 0, 29/29; `npx biome check --error-on-warnings adrian-rebuild` → exit 0;
  `node adrian-rebuild/tools/check.mjs` → exit 0.
- Review: `review.md` → Round 1, PASS.

## Deviations

- None from `ticket.md`. Test 11 passes before the change: it guards the not-live branch, as the ticket's AC-4 asks,
  and is no test of the new mechanism.

## Open points

1. A zombie `night.mjs` counts as live for its exit's moment (review note 3); the takeover's rule, kept as the one rule.
2. D-102 (1) stays prose for every other write of a day session during a night (`ticket.md` → Out of scope).

## Measurement

Unmeasured here: the guard meets a real night only at the next handover during a night; none is planned.
