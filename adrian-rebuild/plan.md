<!-- PL: Plan przebudowy Limena i punkt wznowienia każdej sesji: wizja, decyzje Adriana, etapy, tickety R-NNN, kroki
wdrożenia na seat, pomiary, definicje subagentów i sekcja State. Nowa sesja zaczyna od State i ostatnich wpisów
changes.md. Stan: decyzje z bramki 0 zapisane (D-001, D-002); sekcje planu wypełni etap 4, State opisuje etap 1. -->

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

Updated 2026-11-16, stage 1 (system map) in progress.

Done:
- Stage 0 closed at gate 0: Adrian accepted the test gate (D-001) and the commit identity (D-002). Evidence in
  `evidence/env.md` and `evidence/baseline.md`; push guard in `tools/pre-push` (installed, tested offline and live).

In progress (stage 1):
- Subagents write the component maps to `evidence/map/` (CLI and flow, runtime and integrations, agent context,
  tests and docs). The main session merges them into `audit.md` → `## Map`.
- `tools/` gets a spec index script and a context size script; their output goes to `evidence/`.

Next: stage 2 (audit), pass 1 without history.

Open questions for Adrian: none.

Notes for the next session:
- The Claude Code task list tool is not available in this session; progress lives in this section.
- After moving or re-cloning the repo, run `sh adrian-rebuild/tools/install-hooks.sh` again.
- Run the gate as `sh adrian-rebuild/tools/gate.sh` (D-001).
