<!-- PL: Plan przebudowy Limena i punkt wznowienia każdej sesji: wizja, decyzje Adriana, etapy, tickety R-NNN, kroki
wdrożenia na seat, pomiary, definicje subagentów i sekcja State. Nowa sesja zaczyna od State i ostatnich wpisów
changes.md. Stan: decyzje z bramki 0 zapisane (D-001, D-002); sekcje planu wypełni etap 4; etap 1 zamknięty; w etapie 2 przejście 1 audytu zakończone, następne przejście 2. -->

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

Updated 2026-11-16, stage 2 (audit): pass 1 done; pass 2 (with history) next.

Done:
- Stage 0 closed at gate 0: test gate `sh adrian-rebuild/tools/gate.sh` (D-001), commit identity (D-002).
- Stage 1: `audit.md` → `## Map`; detail in `evidence/map/`; tools `spec-index.mjs`, `context-size.mjs` +
  `role-context.mjs`, `check.mjs`.
- Stage 2 pass 1: 96 candidates from four subagents in `evidence/audit-pass1/` merged into 85 findings in `audit.md`
  (critical 4, high 12, medium 35, low 34), plus `## Tables` and `## To verify`. `node adrian-rebuild/tools/check.mjs`
  → 85 findings, 778 references, 0 errors. Evidence of every critical and high finding checked by hand at
  `rebuild-base`.

Next:
1. Pass 2: read `input/petla-uczenia-2026-11-15.md`, `spec/research/limen-ops-retro-2026-09-10.md` and F952, F954,
   F957, F958, F959; mark each hypothesis `confirmed` / `refuted` / `partial` with evidence; give every finding
   `- Status: new | known (<source>)`; record the author's intents as material for stage 3.
2. Cold read of `audit.md` by a fresh subagent; fix or move each remark to `## To verify`.
3. Gate 2: verdict in 5 sentences and the critical/high table; Adrian decides fix / accepted-risk / rejected per
   finding; record `- Decision:` in `audit.md`.

Open questions for Adrian: none yet (gate 2 will bring them).

Notes for the next session:
- The Claude Code task list tool is not available in this session; progress lives in this section.
- After moving or re-cloning the repo, run `sh adrian-rebuild/tools/install-hooks.sh` again.
- Run the gate as `sh adrian-rebuild/tools/gate.sh` (D-001). Run `node adrian-rebuild/tools/check.mjs` after editing
  `audit.md`.
- Tracked files must not carry home or scratchpad paths; experiments live in the session scratchpad only.
