<!-- PL: Plan przebudowy Limena i punkt wznowienia każdej sesji: wizja, decyzje Adriana, etapy, tickety R-NNN, kroki
wdrożenia na seat, pomiary, definicje subagentów i sekcja State. Nowa sesja zaczyna od State i ostatnich wpisów
changes.md. Stan: bramki 0 i 2 zamknięte i przyjęte (D-001–D-005, decyzje w rewizji 3, w tym A-086: wiadomość
kontekstowa Limena zamiast system promptu; joby z bridge'em w trybie izolowanym), fakty o Pi 1.5.1 i bridge'u 5.0.3 w
Engine facts (E-1–E-15), czynności Adriana na seacie w Deployment; trwa etap 3 (taste). -->

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
- 2026-11-17 D-003 (gate 2, final form: revision 3 of Adrian's file): Adrian's decision on each of the 86 findings is
  the `Decision` field in `audit.md` (fix 76, rejected 9, rejected / fix 1; A-086 added in revision 2, A-008, A-009 and
  A-078 changed in revision 3). The cross-cutting decisions are in `audit.md` → `## Gate 2: decisions` → §2: G1 features
  and module switches (optional modules off by default), G2 isolation (T1 in code; owner channel B1″, egress allow-list
  and research account B2c on the seat), G3 land by conditions in code with no human gate, G4 review verdict parsed in
  code and required for every change outside `spec/`, S seat tooling in this repo, S1+ one `record.json` per job, the
  owner files, the registered coordinator, and the measurement method. They bind this plan; stage 4 copies §2 and its
  constraints into this section, and every `fix` gets a ticket.
- 2026-11-17 D-004 (gate 2, §8): corrections to the target environment of `input/prompt.md`; where the prompt and this
  entry disagree, this entry wins.
  - Pi on the seat is 1.5.1, not 1.2.0 (bridge `@vanillagreen/pi-claude-bridge` 5.0.3).
  - "`limen land` only after Adrian's 'land'" is replaced by G3 (A-012): conditions in code, no human gate.
  - "Only Adrian pushes `main` (pre-push hook)" is replaced by A-006 + B1″: automatic publication by the owner channel
    under the coverage rule; agents hold no write credential.
  - "Adrian overrides `.agents/limen/communication.md` so the coordinator answers in Polish" is untrue (gate 2 §1); the
    register override is cut (A-039). The coordinator keeps answering in Adrian's language through normal conversation.
  - "Only Adrian changes `docs/` of the projects" is replaced by the owner-files decision (gate 2 §2): tickets change
    `docs/`; review and a fixed judgment protect it.
  - Coordinator, worker and reviewer reasoning levels come from `routes.json` (A-030), set at `limen init`; the
    prompt's values are examples, not constraints.
- 2026-11-17 D-005 (gate 2 accepted): Adrian accepted gate 2 as applied in `037f791`. Clarification: jobs run the bridge
  in isolated mode, so the A-042 fallback applies to them: the project's `AGENTS.md`, if it exists, goes into the
  Limen context message; the job launcher passes the Claude Code executable path and the bridge settings explicitly
  (E-15).

## Engine facts

Answers to gate 2 §7 B, read on 2026-11-17 from the npm tarballs of Pi 1.5.1 (`@earendil-works/pi-coding-agent`, with
`pi-ai` and `pi-agent-core` 1.5.1) and `@vanillagreen/pi-claude-bridge` 5.0.3, as data, nothing executed. Detail, quotes
and source lines: `evidence/engine-sources/pi-1.5.1.md` and `evidence/engine-sources/bridge-5.0.3.md`. The bridge
inlines its own Agent SDK (0.3.261) and spawns the `claude` binary found at run time; what Claude Code itself decides is
not in these sources and is a seat check (`## Deployment` item 12). The main session checked E-1, E-3 and E-12 against
the sources itself.

| # | Question | Answer | Feeds | Settled |
|---|---|---|---|---|
| E-1 | How the bridge maps the system prompt and messages (Q9, cost 2) | One SDK `query()` per Pi prompt, continuing Claude Code's own session file with `resume`; when Pi's history diverges (compaction, a `system` entry after the cursor, an abort) the bridge rewrites that file from Pi's history. The system prompt is Claude Code's `claude_code` preset plus an append of exactly three parts: the nearest `AGENTS.override.md`/`AGENTS.md`/`AGENTS.MD` walking up from the cwd, Pi's skills block, and four opt-in blocks that are off by default. **Pi's system prompt is not forwarded**, so Limen's role preamble (`--append-system-prompt`, `src/runtime/engine.ts:248` at `rebuild-base`) and the hook's system block (`hook/communication.ts:104`) never reach the model on the `pi-claude` route. Pi custom messages (cue, task, wakes, reminders) arrive as `user` messages; Pi's `role: "system"` patch entries are dropped. | A-037, A-042, A-051, A-079, A-008, A-038, A-040, A-043, A-077; new finding (below) | yes (code and the bridge README); one raw request on the seat confirms |
| E-2 | Cache breakpoints and TTL (Q9, cost 2) | The bridge sets no `cache_control`, breakpoint, TTL or caching variable; Claude Code decides all three. It reports `cacheRead` and `cacheWrite` per Pi turn (summed over the child's API calls; cost 0, no 5m/1h split). Claude Code's auto-compaction is switched off (`DISABLE_AUTO_COMPACT=1`); Pi compaction forces a session rewrite. | A-037, A-078, A-079, Measurement | partly: TTL, breakpoints and the cache effect of a rewrite are seat checks |
| E-3 | What `--approve` enables (Q6, security 1) | Only project trust for the run: Pi then reads `<cwd>/.pi/settings.json` (which can install packages and change `npmCommand`, `shellPath`, `shellCommandPrefix`), `.pi/skills`, `.agents/skills` and `.pi/SYSTEM.md`, and the bridge reads `.pi/claude-bridge.json` (which can set the Claude Code executable path). Pi has no tool-call approvals and no `--auto-approve` (OMP had it). Without `--approve`, JSON mode resolves trust to "untrusted". | A-004, A-025, A-003 | yes |
| E-4 | What a job loads from its worktree (Q5) | Pi: context files (`AGENTS.override.md`, `AGENTS.md`, `CLAUDE.md`, case variants) from the cwd up to `/` and from `~/.pi/agent`, never trust-gated (off only with `--no-context-files`); under the bridge these sit in Pi's prompt and do not reach Claude. Bridge: the nearest `AGENTS*` file, re-read every query (none in isolated mode, E-15). Claude Code: `CLAUDE.md` and `.claude/settings*.json` per its default setting sources (E-7). `--no-extensions` keeps the project stub `.pi/extensions/limen.ts` out of jobs but does not stop settings-listed package installs (`--offline` does). Extensions given with `-e` go through jiti's transpile cache in the OS temp directory, shared by every process of the account (`JITI_FS_CACHE=0` or a private `TMPDIR` avoids it). The whole Pi environment is forwarded to Claude Code. | A-025, A-004 (T1), A-003 | partly: jiti cache path, `-e` module resolution and Node's compile cache are seat checks |
| E-5 | Tool restrictions and the subagent tool (A-081, A-029) | Claude Code's built-in tools are disabled; Pi's tools are served to it as `mcp__custom-tools__<name>` under `bypassPermissions`, so Pi's `--tools` allowlist (e.g. `read,grep,find,ls`) reaches Claude exactly. `Agent`, `Task`, `Skill`, `AskUserQuestion` and other Claude Code tools are always denied; Pi's `tool_call` event sees only Pi tool names. Exception: a session with zero Pi tools gets Claude Code's own Bash/Read/Write back, so no role may run with an empty tool list. | A-081, A-029 | yes for the bridge; whether the seat binary still lists deferred tools is a seat check |
| E-6 | Skills (Q10, H-11) | Pi lists every loaded skill (name, description, path) when `read` or `bash` is active; `disable-model-invocation: true` hides one; `--no-skills` plus `--skill <path>` restricts a session. The bridge forwards that block into Claude's append. | A-081 | yes |
| E-7 | Is `CLAUDE.md` loaded under the bridge (A-042) | The bridge passes no `settingSources`; the SDK documents that all sources (user, project, local, `CLAUDE.md`) then load. The bridge's own append reads only `AGENTS*`, not `CLAUDE.md`. | A-042 | partly: seat check (item 12) |
| E-8 | Context window (cost 8, A-034 thresholds) | Pi takes 1,000,000 input / 128,000 output for `claude-opus-5-5` from pi-ai's catalog; the bridge passes neither to Claude Code. Pi auto-compacts above window − 16,384 tokens and keeps a summary plus about the last 20,000 tokens. `ctx.getContextUsage()` = the last assistant usage plus a chars/4 estimate. Claude Code's real window on the Max login is unknown, and its own auto-compaction is off. | A-034, A-033 | partly: seat check (item 12) |
| E-9 | Limit errors (A-016) | A usage-limit result ends the Pi turn with `stopReason: "error"` and the Claude Code text in `errorMessage` (provider text, not model text). A structured reset time (`resetAtMs`, `rateLimitType`) appears only on Pi's event bus as `kendex:rate-limit`, and only if the binary sends a `rate_limit_event`. A 90 s silent stream ends the turn as `error` with `rateLimitType: "stream_idle"`. | A-016 | partly: whether the event fires for the 5-hour and weekly limits is a seat check |
| E-10 | Reasoning level (A-030) | Pi's level maps through the model's own table: for Opus 5.5 `high` → `--effort high`, `xhigh` → `--effort xhigh`; no level → Claude Code's default. | A-030 | yes |
| E-11 | Extension API Limen relies on | `before_agent_start` runs once per run (each prompt sent while idle), not per LLM turn; a returned `systemPrompt` applies to that run only. `sendMessage` custom messages reach the model as `user` (`display: false` hides them from the TUI only); `appendEntry` stays out of the context. `/new` and `ctx.newSession()` give a new session ID, re-run extension factories and keep the CLI options. | A-009, A-033, A-037, A-008 | yes |
| E-12 | `--append-system-prompt` text or path | Text, or the file's contents when the value names an existing file relative to the cwd. | (hosted mode, cut) | yes |
| E-13 | Pi compaction vs the resumed Claude Code session (§7 B, revision 2; A-086) | Every Pi compaction path writes the compaction entry, rebuilds Pi's context and awaits `session_compact` before the next model call; the bridge listens to the same event. With no bridge query running (before a prompt, after a run, overflow, manual `/compact`), the next query rewrites the Claude Code session in place; between turns of a run, the bridge kills the query and restarts it under a new session id, re-sending the pending request and a "history replaced" notice. The rewritten session holds Pi's summary as one user record plus the kept entries; system entries are dropped. The hook re-sends the context message on `session_compact`, but no single `sendMessage` option fits every trigger: the default (steer) lands in the next request except after a run, where it starts an extra turn; there `triggerTurn: false` is right (between `agent_end` and `agent_settled`, `willRetry` false). Keeping the message through compaction instead is not simpler (Pi keeps one contiguous range). Claude Code's own auto-compaction is off; whether settings can turn it back on is engine-side. | A-086, A-037, A-079 | partly: end-to-end order is a seat check |
| E-14 | Does each Pi user message reach the request intact (§7 B, revision 2; A-086) | Yes, as far as the bridge goes: no truncation, length cap, escaping or rewriting of user or custom text (its rewrites touch only the AGENTS text, the skills hint and tool names). When the session is reused, consecutive user messages are joined in order with a blank line into one prompt (text blocks of one message joined with a newline); on a rewrite each message is its own record, stored unchanged. The bridge has no size limit; a Claude Code limit on one prompt, and whether a leading `/` is parsed as a command, are engine-side. Until settled, the context message never starts with `/`. | A-086, A-051 | partly: size limit and verbatim delivery of a ~100 KB message are seat checks |
| E-15 | What `CLAUDE_BRIDGE_ISOLATED=1` turns off (Adrian, 2026-11-17; D-005) | In isolated mode the bridge forwards no `AGENTS*` file at all (`bridge@5.0.3/src/agents-md.ts#L75`), reads no project `.pi/` settings, no `.pi/claude-bridge.json` and no project `APPEND_SYSTEM.md`, and never searches `PATH` for `claude` (`bridge@5.0.3/src/claude-executable.ts#L25-L28`). Its only configuration is `claude-bridge.json` in the Pi agent directory (`bridge@5.0.3/src/config.ts#L322-L328`), plus an explicitly configured executable; with none, it falls back to the SDK's bundled default binary. It does not change Claude Code's own setting sources, so Claude Code is still expected to load `CLAUDE.md` (E-7). Consequences for jobs: the A-042 fallback applies (the project's `AGENTS.md`, if present, goes into the Limen context message), and the launcher passes the Claude Code path and the bridge settings explicitly, from a location the agents' account cannot write (A-025). | A-042, A-086, A-025 | yes for the bridge; `CLAUDE.md` in isolated mode is a seat check (item 12) |

**Consequences (main session, 2026-11-17).**
- **A-086 (critical, `fix`; Adrian, gate 2 revision 2):** E-1 means that on the seat's only route Limen's role
  prompts and coordinator manual are silently absent, while the fake-engine tests pass. Limen's standing instructions
  move to the **Limen context message**: one user-role message at session start, frozen for the session, saved in the
  job directory and re-sent after every compaction (E-13, E-14). Limen stops appending to Pi's system prompt. A-037,
  A-038, A-042, A-051 and A-079 changed with it.
- **Job text and the handoff note (Adrian, gate 2 revision 3):** every injected message arrives as `user`; only tool
  results have another role. So a wake carries only a header computed by Limen, and the coordinator fetches job
  content and the handoff note with a command, as a tool result (A-008, A-009, A-078).
- The stage 1 measurement of fixed context counts text that the seat's model never receives. Every before/after
  comparison of prompt-driven behaviour compares "no Limen prose" with "Limen prose delivered" (gate 2 §2, Measurement).
- Within decisions already taken (no new choice): jobs drop `--approve` and add `--offline`, `CLAUDE_BRIDGE_ISOLATED=1`
  (with its consequences in E-15 and D-005) and a private `TMPDIR` or `JITI_FS_CACHE=0` (A-025, E-3, E-4); the T1 allow-list is the only environment filter,
  because the bridge forwards everything (A-004, E-4); read-only roles get a non-empty Pi `--tools` allowlist (A-081,
  E-5); the reset time is taken from `kendex:rate-limit` when present, otherwise from `errorMessage` (A-016, E-9).

## Stages

Pending (stage 4).

## Tickets

Pending (stage 4).

## Deployment

Owner actions on the seat from gate 2 (§9 of Adrian's decisions). The rebuild writes the tooling (decision S); Adrian
runs it. Stage 4 sets the order, the exact commands and the steps after each stage.

1. Accounts: choose new, non-misleading names; set up the owner channel (B1″), the research account and queue scanner
   (B2c, only when G1.11 is enabled), the bell account (A-066), the domain allow-list and proxy for the agents' account
   (B2c); move the GitHub write token to the owner channel and give the agents' account a read-only token.
2. GitHub: ruleset on `main` of both projects (gate 2 §7 D1).
3. Root-owned installs: Pi 1.5.1 and the bridge (A-025), the coordinator start script (A-025, A-029, A-033); confirm the
   install path of Pi.
4. Coordinators start only through the start script (not by exporting `LIMEN_COORDINATOR` by hand).
5. `limen sweep --install` with lingering on (A-024); disable the old `limen-prune.*` units; remove `LIMEN_WORKER_MODEL`
   / `LIMEN_REVIEWER_MODEL` from the environment (A-030).
6. Remove old seat extensions from the Pi extensions directory after migration (A-025, A-047), and establish whether
   anything loads the extra Limen checkout found in the agents' home (gate 2 §1).
7. Check that `limen` and `node` resolve to root-owned paths in the coordinator pane and that `LIMEN_PACKAGE` is unset
   (A-025).
8. Check that the agents' account is not in `adm` or `systemd-journal`.
9. `limen init` answers per project: `maxJobs`, round limit, routes, project gate command, module switches (all off).
10. Migrate records (S1+) and rewrite open tickets' `## Acceptance` (A-031) at their next spawn.
11. Bell: first installation and the ntfy app on Adrian's phone (A-066, A-054).
12. Seat verification of the points §7 B could not settle from the package sources: the bridge's per-query CLI log
    (`CLAUDE_BRIDGE_DEBUG=1`) shows the Limen context message in the request, and a review job's final message starts
    with `PASS <sha>` or `FAIL <sha>` (A-086, A-051); a job quoting the first rule of `CLAUDE.md`'s "Real data" section
    and one quoting the project's `AGENTS.md` if it exists (A-042); the subagent tool name under the bridge (A-029);
    tool restrictions and the skills a job sees (A-081); `systemd-run --user --scope true` from a Herdr pane on the
    agents' account (A-029). Added from the source read (`## Engine facts`; procedures in `evidence/engine-sources/`):
    whether each turn reuses or rewrites the Claude Code session (E-1, E-2); Claude Code's cache TTL (`modelUsage` 5m vs
    1h) and its context window for `claude-opus-5-5` on the Max login (E-2, E-8); whether a `rate_limit_event` arrives
    for the 5-hour and weekly limits (E-9); the jiti cache path and `-e` module resolution (E-4); the Claude Code binary
    the launcher pins and its version (E-1, E-15); a job in isolated mode (`CLAUDE_BRIDGE_ISOLATED=1`) still sees
    `CLAUDE.md`: it quotes the first rule of the "Real data" section, and the per-query CLI log shows the file loaded
    (E-7, E-15, D-005); a Polish message to the coordinator gets a Polish answer, and a ticket written from that
    conversation is in English (T-13). The source already settles the subagent tool: always denied (E-5).
13. Reboot test: Herdr restores the coordinator pane (A-033); jobs survive a Herdr restart (A-029, `systemd-cgls`).
14. Measurements "before" (gate 2 §2, Measurement): one raw request of a coordinator and of a job; cache tokens per
    landed ticket and in the turn after a land; the same-task baseline run.
15. A full `.limen/` snapshot before the first deployment and after each milestone (no periodic backup).

## Measurement

Pending (stage 4).

## Agents

Pending (stage 4).

## State

Updated 2026-11-17, gate 2 applied in its final form (revision 3), §7 B answered, gate 2 accepted (D-005); stage 3
(taste) in progress.

Done:
- Stage 0 closed at gate 0: test gate `sh adrian-rebuild/tools/gate.sh` (D-001), commit identity (D-002).
- Stage 1: `audit.md` → `## Map`; detail in `evidence/map/`; tools `spec-index.mjs`, `context-size.mjs` +
  `role-context.mjs`, `check.mjs`.
- Stage 2: 85 findings, 22 hypotheses, cold read (`evidence/audit-pass1/`, `evidence/audit-pass2/`).
- Gate 2 (2026-11-17): Adrian's decisions applied in revision 3 of his file. Every finding has `Decision` (fix 76,
  rejected 9, rejected / fix 1); A-086 added (revision 2); A-008, A-009, A-037, A-038, A-042, A-051, A-078, A-079
  changed. `audit.md` → `## Gate 2: decisions` holds §1, §2, §4–§7; §8 is D-004, §9 is `## Deployment`; D-003 binds the
  plan to them. `check.mjs` requires `Decision` and checks `fix (via X)` targets: `node adrian-rebuild/tools/check.mjs`
  → 86 findings (fix 76, rejected / fix 1, rejected 9), 937 references, 0 errors. Gate `sh adrian-rebuild/tools/gate.sh`
  → 83/83, exit 0 (run after the `check.mjs` change).
- Gate 2 §7 B: Pi 1.5.1 and bridge 5.0.3 sources read by two subagents, key claims checked by the main session;
  answers in `## Engine facts` (E-1–E-14), detail in `evidence/engine-sources/`; unsettled points in `## Deployment`
  item 12.
- Gate 2 accepted by Adrian (D-005), with the isolated-mode clarification for jobs (E-15) and a seat check that an
  isolated job still sees `CLAUDE.md` (`## Deployment` item 12).
- Stage 3 Part A done: two subagents inventoried the author's taste into `evidence/taste/part-a-prompts.md` (AU-101–140)
  and `evidence/taste/part-a-code-cli.md` (AU-201–240); 54 basename-only references expanded to full paths; merged
  into `taste.md` → Part A (80 items, 40 settled by gate 2, 40 open). `check.mjs` now also checks the references in
  `taste.md` (418, 0 errors).

Next: stage 3 interview with Adrian (AskUserQuestion, at most 4 questions per turn, one area per turn, highest priority
first; appearance questions with two variants on a real fragment; open questions on what slows him down and what he
enjoys), then Part B (`T-NN` with Rule, Why, Check). Planned rounds: (1) failure and refusal behaviour of the code
(AU-219, AU-209, AU-224, AU-205); (2) process determinism (AU-112, AU-115, AU-127, AU-126); (3) cost and size
budgets (AU-105, AU-139, AU-227, AU-214); (4) register and tone (AU-124, AU-125, AU-122, AU-123); (5) CLI and naming
(AU-206, AU-207, AU-211, AU-223); (6) ticket, board and code style (AU-129, AU-133, AU-216, AU-226); then the open
questions; the remaining open items go to Adrian as recommendations to accept or change. Answers are recorded in
`taste.md` → Part B as they come.

Open questions for Adrian: none.

Notes for the next session:
- The Claude Code task list tool is not available in this session; progress lives in this section.
- After moving or re-cloning the repo, run `sh adrian-rebuild/tools/install-hooks.sh` again.
- Run the gate as `sh adrian-rebuild/tools/gate.sh` (D-001). Run `node adrian-rebuild/tools/check.mjs` after editing
  `audit.md`.
- Tracked files must not carry home or scratchpad paths; experiments live in the session scratchpad only.
- Adrian's gate-2 file lives only in `input/` (not tracked); everything in it is now copied into tracked files.
