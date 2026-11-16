<!-- PL: Plan przebudowy Limena i punkt wznowienia każdej sesji: wizja, decyzje Adriana, etapy, tickety R-NNN, kroki
wdrożenia na seat, pomiary, definicje subagentów i sekcja State. Nowa sesja zaczyna od State i ostatnich wpisów
changes.md. Stan: decyzje z bramki 0 zapisane (D-001, D-002); sekcje planu wypełni etap 4; etap 1 zamknięty; etap 2 (audyt) zakończony, czeka bramka 2. -->

# Rebuild plan

## Vision

Pending (stage 4, derived from `taste.md`).

## Decisions

Adrian's decisions, dated. The hard constraints of `input/prompt.md` hold until a decision here changes them.

- 2026-11-16 D-001 (gate 0): the rebuild's test gate is `sh adrian-rebuild/tools/gate.sh` — `npm run check` with a
  private `TMPDIR`, plus the `git worktree list -z` shim only while the local git lacks that flag. A ticket's gate run
  must exit 0 with no new failure against `evidence/baseline.md` (83/83).
- 2026-11-16 D-002 (gate 0): commits on `adrian-rebuild` use the repo-local GitHub noreply identity of `2b8006f`, not the
  laptop's global identity.

## Stages

Pending (stage 4).

## Tickets

Pending (stage 4).

## Deployment

Pending (stage 4).

## Measurement

Pending (stage 4).

## Agents

Pending (stage 4).

## State

Updated 2026-11-16, stage 2 (audit) done; waiting at gate 2.

Done:
- Stage 0 closed at gate 0: test gate `sh adrian-rebuild/tools/gate.sh` (D-001), commit identity (D-002).
- Stage 1: `audit.md` → `## Map`; detail in `evidence/map/`; tools `spec-index.mjs`, `context-size.mjs` +
  `role-context.mjs`, `check.mjs`.
- Stage 2 pass 1: 96 candidates from four subagents in `evidence/audit-pass1/` merged into 85 findings in `audit.md`
  (critical 4, high 12, medium 35, low 34), plus `## Tables` and `## To verify`. `node adrian-rebuild/tools/check.mjs`
  → 85 findings, 778 references, 0 errors. Evidence of every critical and high finding checked by hand at
  `rebuild-base`.

- Stage 2 pass 2: 22 hypotheses from the owner's analysis marked in `audit.md` → "Pass 2: hypotheses"; every finding
  has `Status` (57 new, 28 known; 14 marked DELIBERATE by the author, 2 CONFLICT) and `History`; author's intents in
  `evidence/audit-pass2/history.md` and summarised in `audit.md` (material for stage 3).

- Stage 2 cold read: 41 remarks in `evidence/audit-pass2/cold-read.md`, each fixed in `audit.md` or moved to the
  merged questions Q1–Q11 in `## To verify` (disposition table at the end of the cold-read file).
- Gate 2 prepared: `audit.md` → "Gate 2: recommended decisions" (fix 73, accepted-risk 2, rejected 10; decisions
  G1–G4).

Next: Adrian decides at gate 2; record `- Decision:` in every finding of `audit.md`, then stage 3 (taste).

Open questions for Adrian (gate 2):
- G1 which features run on the seat; G2 job isolation (a/b); G3 land gate; G4 review gate;
- accept the remaining recommendations as a block, or name exceptions.

Notes for the next session:
- The Claude Code task list tool is not available in this session; progress lives in this section.
- After moving or re-cloning the repo, run `sh adrian-rebuild/tools/install-hooks.sh` again.
- Run the gate as `sh adrian-rebuild/tools/gate.sh` (D-001). Run `node adrian-rebuild/tools/check.mjs` after editing
  `audit.md`.
- Tracked files must not carry home or scratchpad paths; experiments live in the session scratchpad only.
