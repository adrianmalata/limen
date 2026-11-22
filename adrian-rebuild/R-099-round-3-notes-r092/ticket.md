<!-- PL: Ticket R-099 (D-077): poprawki czterech uwag rundy 3 recenzji R-092. Ponowne uruchomienie `github review`
i `github work` pod blokadą jobów usuwa bramkę przekazania, którą zostawił crash bez rekordu joba; `GROUP_STOP_INCOMPLETE`
dostaje klasę przyczyny; szablon kontraktu mapy mówi, że odmowa `--strict` nie zapisuje pliku; `git()` migawki testów
zgłasza błąd gita. Stan: napisany 22.11 w nocy przy `50212ef`; gotowy (ready). -->

# R-099 The round-3 notes of R-092: a stale handoff gate, the class of an incomplete stop, the snapshot's git

## Problem

Adrian's decision, quoted from `plan.md` → `## Decisions`:

- D-077 (Q-26, option 1): "a new fix ticket R-099 (S, stage 2, delegated, night, after R-092) for R-092's round-3
  notes 1, 2, 6 and the template line of note 3: a rerun under the jobs lock removes a GitHub handoff gate with no job
  record; `GROUP_STOP_INCOMPLETE` takes its cause's class (T-02); the template's sentence on a refused `--strict`
  build; the snapshot's `git()` reports a git failure except `symbolic-ref` on a detached HEAD; each with a test that
  fails before."

The notes, quoted from `adrian-rebuild/R-092-refusal-leaves-no-trace/review.md` → Round 3:
1. "A crash, as opposed to a thrown failure, between the handoff gate and the job record leaves
   `.limen/github/inflight/<claim>` with no job. A rerun then refuses `GITHUB_HANDOFF_GATE` with `next: limen status
   --all`, which shows no job, so that case still needs manual recovery. The gate and the record are written under
   the same jobs lock, so a rerun holding that lock could tell a stale gate from a live handoff."
2. "`GROUP_STOP_INCOMPLETE` is class `transient` even when its cause is permanent. A running member with no pid makes
   every rerun end the same way, and timers retry exit 3 as safe."
3. "Two docs still say `--json F` writes the model without saying that a build `--strict` refuses writes no file."
   (`docs/picture.md` was fixed with R-092; `templates/picture/CONTRACT.md:91` is left.)
6. "The shared snapshot's `git()` returns \"\" on any git failure. A snapshot taken where git cannot run would compare
   \"\" with \"\" and miss a new branch or worktree. Only `symbolic-ref -q HEAD` on a detached HEAD needs that
   tolerance."

T-38 (3), quoted from `taste.md`: "Failures after the first write (exit codes 3, 4, 5): a single effect is atomic
(A-022); several effects are steps in the record, continued when the command runs again (the pattern of A-021)." T-02:
"3 transient failure: a lock after its wait limit, the network, a rate limit; safe to retry; 4 environment failure:
git, the file system, permissions, a missing tool; 5 internal error […] Timers retry 3 at their next run and ring only
after several in a row; 2, 4 and 5 ring at once".

Facts at `50212ef` (the main session read each at `f541f37` and again at `50212ef`):
1. `src/integrations/github-claims.ts`: `validate` refuses `GITHUB_HANDOFF_GATE` when `handoffGate(root, claim)`
   exists and `matchedGithubJob` finds no job (`:286-296`); the gate is spawn's `firstWrite` (`:315`), entered by
   `enter` (`:359-366`), which ends with `STATE_CHANGED` when the gate exists already.
2. `src/job/group-control.ts:541-549`: any failure of `stopMembers` (`:556-571`, each member's `stopMemberJob`) ends
   with `GROUP_STOP_INCOMPLETE`, class `transient`, `next: limen group stop <id>`; `test/cli/group.test.ts:423`
   asserts that a rerun ends the same way.
3. `templates/picture/CONTRACT.md:91`: "`--strict` exits 1 on any error diagnostic", with no word on the file of
   `--json F`; `docs/picture.md:17` says it since R-092.
4. `test/snapshot.ts:86-96`: `git(root, args)` returns "" on any failure of git.

## Change

(a) `github review` and `github work`: a gate of the claim that no job answers is stale when the jobs lock is held and
still no job record answers the claim, since a live handoff enters the gate and writes its record under that lock; the
rerun then removes the stale gate in its `apply`, under the lock, and enters it again, so a crash between the gate and
the record needs no manual recovery. A gate whose job exists keeps today's behaviour. `docs/remote.md`, where it names
the gate, says so.

(b) `GROUP_STOP_INCOMPLETE`: a member a rerun can still stop keeps class `transient`; a failure no rerun can change (a
running member with no pid) takes the class T-02 gives its cause, with its own code or the same code under that
class (the implementer's choice, named in `outcome.md`), and a `next` that names what the owner can do.

(c) `templates/picture/CONTRACT.md:91` says that a build `--strict` refuses writes no file, `F` included, as
`docs/picture.md:17` does; a history line where the templates' convention keeps one (A-085).

(d) `test/snapshot.ts`: `git()` throws on a failure of git, except the one call that may fail by design
(`symbolic-ref -q HEAD` on a detached HEAD, read as ""); `test/snapshot.test.ts` gets a case where git cannot run and
the snapshot fails.

Each mechanism with a test that fails before its change; the refusal and rerun tests with the shared snapshot.

## Out of scope

- The rest of `github` (R-057 and the commands on the T-38 ratchet); groups beyond `group stop`'s class.

## Acceptance

- AC-1: `node --test test/cli/github.test.ts` → exit 0.
- AC-2: `node --test test/cli/group.test.ts` → exit 0.
- AC-3: `node --test test/snapshot.test.ts` → exit 0.
- AC-4: `node adrian-rebuild/tools/fails-before.mjs` → exit 0, its output in `outcome.md` → `## Fails before`.
- AC-5: `node adrian-rebuild/tools/gate.mjs` → exit 0.
- AC-6: `npx biome check --error-on-warnings .` → exit 0; `node adrian-rebuild/tools/check.mjs` → exit 0.
- AC-7 (judgment): a stale gate is removed only under the jobs lock with no job record of the claim, so a live handoff
  is never taken over.

## Migration

None: a stale gate on the seat is removed by the first rerun of its claim.

## Risk

- Removing a live handoff's gate would start a second job for one claim; AC-7 and a test of a gate whose job exists
  hold it.

## Rollback

`git revert $(git log --format=%H --grep='^R-099:' adrian-rebuild --)`.

## Decisions

- 2026-11-22 D-077 (Adrian): quoted in `## Problem`.
