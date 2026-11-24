<!-- PL: Specyfikacja strażnika blokady nocy według D-102 (5), w kształcie ticket.md dla recenzji rebuild-reviewer; zmiana
nie ma numeru R-NNN, bo dotyczy narzędzi przebudowy, jak D-026. `night.mjs` eksportuje sprawdzenie, czy `.night/lock`
trzyma żywy biegacz (pid, czas startu i boot id, jak przy przejmowaniu porzuconej blokady), a `handover.mjs start`
i `close-previous` odmawiają kodem 1 z właścicielem blokady, póki ta jest żywa. Stan: napisany 24.11 przez sesję
główną `limen-rebuild-31` przed nocą do 08:00; przebieg recenzji w review.md, wynik w outcome.md. -->

# Handover refuses while a night holds its lock (D-102 (5))

## Problem

`handover.mjs close-previous` stops every `claude` process in the repository that started before the caller's own
session (`adrian-rebuild/tools/handover.mjs`, `closePrevious`). A night's `claude -p` runs in the repository and is older
than any day session started during the night, and between its commits the tree is clean and pushed, so the safe point
holds: a day session that takes over by D-047 during a night would stop the night's run. `start` would open a second
main session beside the night's. Nothing in code prevents either; D-102 (1) is prose.

Relied on (quoted):
- D-102 (1): "while `adrian-rebuild/.night/lock` is held by a live `night.mjs` (the owner's pid, start time and boot id
  match a running process), a day session only reads, whatever Adrian writes, and changes nothing in the repository".
- D-102 (5): "`night.mjs` exports the liveness check of `.night/lock` (as its takeover of an abandoned lock reads it; a
  lock whose text is no owner record is not live), and `handover.mjs start` and `close-previous` refuse with exit 1
  and the lock's owner while it is live".
- D-047: `handover.mjs` exits 0 done, 1 refused or not done (the reason on stderr), 2 usage, 4 tool failure.
- D-019: `night.mjs` writes nothing outside `adrian-rebuild/.night/` and runs no git command.
- T-25 (1): one rule has one definition; T-29 (3): one test, one mechanism; T-01: no silent failure.

## Change

- `adrian-rebuild/tools/night.mjs`: a new export `liveOwner(root)`, the owner record of `<root>/adrian-rebuild/.night/lock`
  when its pid, start time and boot id match a running process, otherwise `undefined` (no lock, a text that is no owner
  record, an owner gone or a mismatch). The runner's takeover (`removeAbandoned`) uses the same check, so one rule
  decides liveness. Nothing else of the runner changes.
- `adrian-rebuild/tools/handover.mjs`: `start` and `close-previous` first check `liveOwner(repo)`; a live owner ends the
  command with exit 1 and `handover: a night run holds adrian-rebuild/.night/lock (night.mjs pid <pid>, started
  <started>); a day session only reads until it ends (D-102)`, before any tmux call or signal.
- `adrian-rebuild/tools/test-handover.mjs`: tests of both refusals and of the locks that do not refuse.
- `adrian-rebuild/plan.md` → `## State`, `adrian-rebuild/evidence/handover-night-lock/` (this folder).

## Out of scope

- A guard for any other write of a day session during a night (D-102 (1) stays prose for those, as D-024 was).
- The runner's own behaviour, its retries and its log.

## Acceptance

- AC-1: `node --test adrian-rebuild/tools/test-handover.mjs` → exit 0.
- AC-2: `node --test adrian-rebuild/tools/test-night.mjs` → exit 0.
- AC-3: `npx biome check --error-on-warnings adrian-rebuild` → exit 0; `node adrian-rebuild/tools/check.mjs` → exit 0.
- AC-4 (judgment): one liveness rule for the night lock, defined in `night.mjs` and used by the runner's takeover and by
  both handover commands; both commands refuse with exit 1, naming the lock's owner, before any tmux call or signal; a
  lock whose owner is gone, whose start time differs, or whose text is no owner record does not refuse.

## Migration

None: no format on disk changes.

## Risk

1. A pid reused by another process with the same start time and boot id is impossible on Linux; a lock left by a runner
   killed with SIGKILL is not live, so it does not block a handover (the runner itself takes such a lock over).
2. A night started from another clone holds its own lock and is not seen; the rebuild has one clone.

## Rollback

`git revert` of the commit `Tools: …` of this change.

## Decisions
