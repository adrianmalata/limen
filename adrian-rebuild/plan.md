<!-- PL: Plan przebudowy Limena i punkt wznowienia każdej sesji: wizja, decyzje Adriana, etapy, tickety R-NNN, kroki
wdrożenia na seat, pomiary, definicje subagentów i sekcja State. Nowa sesja zaczyna od State i ostatnich wpisów
changes.md. Stan: decyzje z bramki 0 zapisane (D-001, D-002); sekcje planu wypełni etap 4; etap 1 zamknięty, trwa etap 2 (audyt). -->

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

Updated 2026-11-16, stage 2 (audit) pass 1 in progress.

Done:
- Stage 0 closed at gate 0: test gate `sh adrian-rebuild/tools/gate.sh` (D-001), commit identity (D-002).
- Stage 1: `audit.md` → `## Map` (components, processes, ticket flow with code/model deciders, sizes). Detail in
  `evidence/map/` (four subagent maps, `file:line` evidence, each with "Observations for the audit"). Tools:
  `tools/spec-index.mjs` → `evidence/spec-index.md`; `tools/context-size.mjs` + `tools/role-context.mjs` →
  `evidence/context-size-rebuild-base.md` (role context per request, per prompt, once per session; lines per module);
  `tools/check.mjs` validates `audit.md` references and finding fields (stage 2 format: `### A-NNN <title>` with
  `- Area/Severity/Location/Evidence/Rule/Verdict/Direction`, later `Status`, `Decision`, `Final`).

In progress (stage 2, pass 1): four subagents write candidate findings to `evidence/audit-pass1/` (reliability,
security, determinism-autonomy, cost-crosscut). The main session verifies every critical/high candidate against the code,
merges them into `audit.md` as `A-NNN`, runs `tools/check.mjs`, then pass 2 and the cold read.

Next after pass 1: stage 2, pass 2 with history: `input/petla-uczenia…`, `spec/research/limen-ops-retro-2026-09-10.md`, F952,
F954, F957, F958, F959. Pass 1 must not read `spec/` or `input/petla-uczenia…`.

Open questions for Adrian: none.

Notes for the next session:
- The Claude Code task list tool is not available in this session; progress lives in this section.
- After moving or re-cloning the repo, run `sh adrian-rebuild/tools/install-hooks.sh` again.
- Run the gate as `sh adrian-rebuild/tools/gate.sh` (D-001). Run `node adrian-rebuild/tools/check.mjs` after editing
  `audit.md`.
