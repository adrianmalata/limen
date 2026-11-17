<!-- PL: Plan przebudowy Limena i punkt wznowienia każdej sesji: wizja, słownik, decyzje Adriana (z dosłowną kopią §2
bramki 2 i rozstrzygnięciami bramki 4: D-008 skrypt wdrożenia po SHA, D-009 format changes.md, D-010 narzędzia seata
w TypeScript), fakty o silniku, 9 etapów z tagami, 86 ticketów R-NNN, kroki wdrożenia na seat, pomiary M-01–M-13
i protokół subagentów. Nowa sesja zaczyna od sekcji State i ostatnich wpisów changes.md. Stan: etap 4 gotowy,
sprawdzony przez check.mjs i cold read; czeka na akceptację planu i definicji subagentów na bramce 4. -->

# Rebuild plan

## Vision

Derived from `taste.md` → Part B and the gate-2 decisions.

Limen after the rebuild is a harness in which code decides every transition and holds every guarantee, and prose is
left only for judgment (T-09, T-10, T-22). The owner talks to one coordinator session in his own language, that
session drives the whole workflow through Limen commands, and he is asked only for decisions and requests with options
and a recommendation, never for a permission that code can decide (T-05, T-13, T-40, T-41). No work is lost: nothing
that is not landed or abandoned is deleted, every failure has a recorded kind, and a limit, a timeout or a restart ends
in an automatic resume or a visible alert (A-001, A-002, A-016, T-01). A job lands when code-checked conditions hold on
the exact tip, namely Limen's own checks, a parsed review verdict, every judgment met and the round limit, and `main`
is published by a separate owner channel under a coverage rule (G3, G4, A-006). Agents run with an allow-listed
environment, no write credential and only root-owned code, and text written by a job or on GitHub reaches the
coordinator only as data in a tool result (G2, A-004, A-008, A-025). Every instruction Limen needs a model to read
arrives in one frozen context message per session, within a token budget per role, next to a turn cue of variable
parts only (A-086, A-037, A-077, T-09). The CLI is one registry of commands with plain names, exact job references,
exit codes as failure classes and a final JSON line for machines (T-02, T-18, T-19, T-20, T-37). Optional features are
modules, off by default, and what the seat does not use is cut (G1). Every change is a ticket with a test that failed
before it, one commit, a review and a recorded outcome, and every claim about model behaviour is measured on the seat
before and after by the same-task method (T-28, z. 40).

## Terms

Stage numbers. The rebuild prompt (`input/prompt.md`, local) has rebuild stages 0–6 with gates 0, 2, 3, 4 and 5.N;
rebuild stage 1 has no gate. Rebuild stage 5 carries out this plan's stages 1–9, and gate 5.N follows plan stage N.
`## Decisions`, `## Engine facts` and the copy of §2 were written in rebuild stages 0–3, so "stage N" there means
rebuild stage N; from `## Stages` on, "stage N" means plan stage N, and a rebuild stage is written "rebuild stage N".

- **seat**: the VPS that runs Limen for Adrian's two projects, `synchronizer` (Node, milestone M1 closed) and `ledger`
  (Java), with its accounts, timers and start queue.
- **Pi**, **bridge**, **Herdr**: the coding-agent engine (Pi 1.5.1); its provider `@vanillagreen/pi-claude-bridge`
  5.0.3, which runs Claude Code on the Claude Max subscription; the terminal multiplexer whose panes and tabs hold the
  coordinator and the job logs.
- **Max window**: the 5-hour and the weekly usage limits of that one subscription, shared by every session on the seat.
- **`rebuild-base`**: the local tag of the commit `3b5edd7` the rebuild starts from; every `path:line` reference in this
  file points there.
- **IDs**: A-NNN findings and the gate-2 items G1–G4, S1+, §N and H-NN (`audit.md`); T-NN taste rules (`taste.md`);
  AU-NNN items of `taste.md` → Part A (the author's taste); D-NNN decisions and E-N engine facts (this file); R-NNN
  tickets; M-NN metrics; "z. N" a rule of Adrian's harness
  principles (`input/zasady-budowy-harnessu.md`, local, Polish). "§7 D1" is item D1 of gate 2 §7; "A-030′" in the copy
  of §2 is the route part of A-030; "Q9", "cost 2" and "security 1" in `## Engine facts` are question numbers of
  `audit.md` → `## To verify`; the decision "rejected / fix" (A-046) rejects one part of a finding and fixes another.
- **T1**: the job environment as an allow-list (A-004).
- **owner**, **owner files**, **owner channel**, **published copy**, **coverage rule**: Adrian's role; the files that
  only the owner channel changes; the separate account that alone holds a GitHub write token and publishes `main`; the
  read-only copy of the published `main` that feeds prompts (A-011); the rule that publishes only covered commits
  (A-006). The copy of §2 and the findings named hold the details.
- **registers**: the three audiences of Limen's text: owner (the conversation with Adrian), agent (every role) and
  specs (tickets and the board) (A-038). The **audience line** of the turn cue names the register and its language
  (A-077, T-13).
- **fixed judgment**: a `Judgment` Limen adds to every ticket (A-031 (5)).
- **survey ticket**: a ticket whose deliverable is notes in its folder, for a question too long for the coordinator
  (T-34).
- **keeper**: the author's model job that fixed spec links and the board; `limen spec fix` replaces it (A-045).
- **`jg` cue**: the author's cue that recommends the `jg` search tool when it is on PATH; `jg` is not on the seat (T-36).
- **`needs-adam`**: the author's front-matter key for a ticket that waits for him (T-21).
- **alerts**: gate 2's "bell", notifications to Adrian's phone through ntfy, renamed by T-18; the **GitHub module** is
  gate 2's "doorbell".
- **`limen replay`** (T-22) puts held commits back on `main`; the **same-task runner** (R-011) is a measurement tool.

## Decisions

Adrian's decisions, dated. The hard constraints of `input/prompt.md` hold until a decision here changes them.

- 2026-11-16 D-001 (gate 0): the rebuild's test gate is `sh adrian-rebuild/tools/gate.sh` — `npm run check` with a
  private `TMPDIR`, plus the `git worktree list -z` shim only while the local git lacks that flag. A ticket's gate run
  must exit 0 with no new failure against `evidence/baseline.md` (83/83).
- 2026-11-16 D-002 (gate 0): commits on `adrian-rebuild` use the repo-local GitHub noreply identity of `2b8006f`, not the
  laptop's global identity.
- 2026-11-17 D-003 (gate 2, final form: revision 4 of Adrian's file): Adrian's decision on each of the 86 findings is
  the `Decision` field in `audit.md` (fix 76, rejected 9, rejected / fix 1; A-086 added in revision 2, A-008, A-009 and
  A-078 changed in revision 3, A-034, A-077 and A-086 in revision 4). The cross-cutting decisions are in `audit.md` → `## Gate 2: decisions` → §2: G1 features
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
- 2026-11-17 D-006 (stage 3; in force since gate 3, D-007): the taste rules T-01–T-43 in `taste.md` → Part B are
  Adrian's decisions from the interview; where they
  change a gate-2 decision, the list "Changes to gate 2 decisions made in stage 3" in `taste.md` names each one, and
  the rule holds over the gate-2 wording. Stage 4 builds the tickets from both.
- 2026-11-17 D-007 (gate 3): Adrian accepted `taste.md` (commit `5e3b97b`). From now on it is a rubric next to the
  harness principles in `input/`; new taste decisions are added to it with their date and source.
- 2026-11-17 D-008 (gate 4, Q1): tags stay local and the pre-push hook is unchanged. `/opt/limen` gets a stage's
  commit by its pinned full SHA, through a root deployment script that the rebuild writes as seat tooling with tests
  (S, §7 D3; R-012). The script (1) refuses, listing the running jobs, while any job runs (D3); (2) runs `git fetch
  origin adrian-rebuild`; (3) checks that the SHA is an ancestor of `origin/adrian-rebuild`; (4) checks it out
  detached and creates a local tag on the seat for readability; (5) compares `git rev-parse HEAD` with the SHA; (6)
  runs the Pi type contract (T-32, AU-220) and on a mismatch returns to the previous SHA and exits with code 4. Gate
  5.N gives the tag and its full SHA; each stage's part of `## Deployment` holds one call of the script, then
  `/reload` and the further steps (the bridge contract of T-31, AU-225; migrations). Reason: "push the tag" in the
  rebuild prompt assumed that Adrian pushes it, but the stage-0 hook lets only `adrian-rebuild` through; a SHA cannot
  change, so root runs exactly the commit that passed the gate (z. 14). Check: tests of the script on a fixture repo
  (refusal while a job runs, refusal of a SHA off the branch, a checkout whose `rev-parse HEAD` equals the SHA, return
  to the previous SHA when the contract fails); `check.mjs`: every stage in `## Deployment` calls the script with a
  SHA.
- 2026-11-17 D-009 (gate 4, Q2; changes the `changes.md` format of the rebuild prompt): a `changes.md` entry is keyed
  by the commit subject, not by a SHA. The entry and the ticket's status in `plan.md` go into the ticket's own commit,
  so one commit per ticket stays. Format: `- Commit: R-NNN` instead of `<sha>`, and `- Rollback: git revert $(git log
  --format=%H --grep='^R-NNN:' adrian-rebuild --)` (+ the reverse migration, if any). The final `--` is the main
  session's correction of Adrian's wording: `adrian-rebuild` is also a directory of the repo, so without it `git log`
  exits with 128 ("ambiguous argument 'adrian-rebuild': both revision and filename"), found by the fixture test. `check.mjs` checks that
  `adrian-rebuild` has exactly one commit with the subject `R-NNN:`; a fix after the push gets a new R number. The SHA
  is computed when it is read (z. 22). Rejected: a separate commit for the entry (two commits per ticket), the entry in
  the next ticket's commit (the last ticket would have none), git notes (one more mechanism). Check: every
  `changes.md` entry has `Commit: R-NNN` with an existing ticket folder and exactly one commit with the subject
  `R-NNN:`; a test of `check.mjs` on a fixture with zero, one and two such commits.
- 2026-11-17 D-010 (gate 4, Q3; changes A-047): the seat tools are TypeScript, not shell (S: the same checks, tsc,
  Biome and tests; KISS). Node on the seat runs `.ts` directly (`erasableSyntaxOnly`, `allowImportingTsExtensions`);
  systemd units, the owner channel's forced command and the deployment script of D-008 call `node
  /opt/limen/seat/<tool>.ts` by absolute path (A-025). No `.sh` files in `seat/` and `bin/`; the only exception is the
  stage-0 pre-push hook in `adrian-rebuild/tools/` with its own test. The condition "no shell scripts" replaces
  A-047's shellcheck requirement. Systemd units and nftables rules are generated from typed definitions, with golden
  tests in `npm run check`; the deployment script runs `systemd-analyze verify` and `nft -c -f` on the seat before it
  enables them, and on an error returns to the previous SHA with code 4 (no test is skipped silently when a tool is
  missing). Rejected: `shellcheck` from npm (a binary downloaded at install, a new dev dependency, AU-214) and
  `shellcheck` only on the seat. Check: a scan finds no `.sh` file in `seat/` and `bin/` beyond the exception list;
  golden tests of the generated units and nftables rules; a test of the deployment script: a failed verification
  returns to the previous SHA with code 4.

### Gate 2 §2, copied

A verbatim copy of `audit.md` → `## Gate 2: decisions` → `### §2 Cross-cutting decisions` (D-003); `check.mjs` fails
when the two differ. Where a rule of `taste.md` changes one of these decisions, the list "Changes to gate 2 decisions
made in stage 3" in `taste.md` names it, and the rule holds (D-006).

<!-- gate2-s2:begin -->
**G1 — features.**

| ID | Feature | Decision |
|---|---|---|
| G1.1 | GitHub doorbell | keep, as a module (G1.10) |
| G1.2 | Groups | keep, as a module (G1.10) |
| G1.3 | Finish webhooks, coordinator signals, `bin/tony-finish-ping.sh` | cut |
| G1.4 | Picture | cut the UI (viewer, `/`, `map.html`); keep `/activity.json`, `/events` and the data model for a future UI of mine; module (G1.10) |
| G1.5 | Linear mirror | cut |
| G1.6 | Devin | cut |
| G1.7 | OMP | cut |
| G1.8 | Hosted `--tab` | cut; the doorbell moves to detached jobs, groups are detached only |
| G1.9 | Non-Git workspace | keep, as a module (G1.10) |
| G1.10 | Module switches | optional modules (Picture, doorbell, groups, non-Git workspace, research, quality pass) have switches in a project file (e.g. `.agents/limen/limits.json`), **off by default**; a disabled module contributes no prompt text and no hook, and its commands refuse with a message |
| G1.11 | Research (researcher + judge) | module, off by default; the research account, queue and scanner (B2c) belong to it: the rebuild writes them, I install them only when I enable it |
| G1.12 | Private planning | cut; only `committed` stays |
| G1.13 | Quality pass | module, off by default; when on, triggered **by code** after N landings since the last findings file (N in `limits.json`, asked at `limen init`, default 10) and by `limen quality`; the prose trigger goes |
| — | `limen highlight` | cut |
| — | macOS branches | cut (A-083) |

**G2 — isolation (A-004).** In code: T1 (§3, A-004). On the seat, as separate accounts I set up with tooling the
rebuild writes (decision S):
- **B1″ owner channel:** a separate SSH key only on my own machines (no agent forwarding); a separate account accepts
  it only with a forced command. Its timer publishes `main` by the coverage rule (A-006) from its own clone (`git
  fetch` from the agents' repo as data, fast-forward only). It holds the only GitHub token with write access; the
  agents' account gets a read-only token. It does not start research.
- **B2c:** the agents' account has outbound traffic only to an allow-list of domains (nftables per UID + proxy:
  Claude and Anthropic, GitHub read, npm, Maven Central and whatever Claude Code under the bridge needs; the list is
  set by measurement). It does not talk to the DNS resolver; the proxy resolves names. A separate research account
  has an open network and its own Claude login, no access to the repos or the agents' home, and writes results to a
  results directory. Agents only queue a research request; a service outside the agents' account scans it (length
  limit; refusal on known token formats such as `github_pat_`, `sk-ant-`, OAuth tokens, and on high-entropy strings;
  the refusal goes to the coordinator with a reason) and starts the research job. No approval by me.
  `accepted-risk`: a token deliberately encoded by an attack written against Limen.
- **Bell:** runs on its own account, outside the agents' account (A-066).
- **Condition:** if a project managed by Limen becomes public, publishing `main` becomes an exit path and this decision
  must be revisited.
- **Accepted-risk (same account):** deliberate tampering by a job with Limen's own files on the agents' account
  (records, markers, another job's `result`, inbox, transcripts, cgroup moves, shell start-up files). Typical
  injections lose their point because there is no push credential and no open network; local damage is reversible
  (git, archive) and stopped by the land conditions and the publication rule.
- Account names used today are misleading; new names are chosen before the seat changes.

**S — seat tooling lives in the Limen repo.** Owner channel, research launcher and queue scanner, network-rule and
proxy templates, bell, coordinator start script, Pi extensions of the seat: all under the same checks (tsc, biome,
tests). The rebuild writes them; I deploy them. No secrets in tracked files.

**S1+ — one structured record per job.** `record.json` with a schema version: state, transitions, verdict, judgments,
check results, rounds, markers `landed`/`abandoned`, failure kind and detail, quota reset time, owed wakes,
`doneBy`, route, process identity, land steps, `filed`. Writes only through the transition function (A-019): temporary
file + `rename`, a `wx` claim at the terminal transition. Content (result, transcripts, logs) stays in separate files.
Migration of existing records by a script with a fixture test. Earlier wording such as "the `verdict` file" means a
field of `record.json`. Not SQLite: it would not cover the git step of land and adds migrations, harder rollback and
WAL reads across accounts.

**Owner files (final form, replaces the list in A-011 and A-006).** `.agents/limen/**` (`limits.json`,
`routes.json`, `styleguide.md`), `CLAUDE.md`, `AGENTS.md`, `spec/vision.md`. Changed only by `limen land --owner`,
accepted **only through the owner channel**. `land` refuses a job branch that touches them or `spec/build.md`.
`docs/**` is **not** an owner file: tickets change it (41 of 49 such commits in synchronizer M1), review covers it, and
a second fixed judgment checks it (A-031). Reason for the owner channel: a coordinator able to run `land --owner` could
raise its own limits and change its own routes and rules (z. 16).

**Registered coordinator.** One function, "the caller is the registered coordinator", used by every coordinator-only
command (`limen steer`, `limen decide`, `limen github resolve`, `limen github work`, and others): the caller's process
is in no job's systemd scope (`/proc/self/cgroup`) and descends from the PID of the registered coordinator (A-033).
Environment variables (`LIMEN_JOB`, `LIMEN_COORDINATOR`, `HERDR_PANE_ID`) no longer decide. `land --owner` is not
a coordinator command.

**Measurement (for `plan.md` → `## Measurement`).**
- Baseline caveat (A-086): today's seat runs without Limen's system-prompt prose but with the per-turn cue (§1), so a
  before/after comparison of prompt-driven behaviour compares "cue only" with "Limen context message plus the A-077
  cue"; record this in every such measurement.
- Method (z. 40, z. 41): compare Limen before and after the rebuild on the **same task** (identical input: commit and
  task file; same model and reasoning; clean state), several attempts (z. 17), result as pass^k. Candidate: a closed
  synchronizer M1 ticket that went through several review rounds, replayed from its parent commit, the merged change
  as the reference solution. Mechanisms (resume after limit, stall, queue) get their own mechanism tests.
- `limen stats` (S1+) over all records including the archive: verdict, judgments per ID, check results and times,
  rounds, failure kind, `doneBy`, number and origin of steers, route, queue time, and tokens by class (input, cache
  write, cache read, output) from the transcript, per job and per coordinator turn; grouped by route (A-030′).
- Named seat measurements: coordinator cache-read tokens per landed ticket (A-078); cache-write tokens in the turn
  after a land (A-037); fixed context per role, before and after (stage 1 script and one raw request on the seat).
<!-- gate2-s2:end -->

## Engine facts

Answers to gate 2 §7 B, read on 2026-11-17 from the npm tarballs of Pi 1.5.1 (`@earendil-works/pi-coding-agent`, with
`pi-ai` and `pi-agent-core` 1.5.1) and `@vanillagreen/pi-claude-bridge` 5.0.3, as data, nothing executed. Detail, quotes
and source lines: `evidence/engine-sources/pi-1.5.1.md` and `evidence/engine-sources/bridge-5.0.3.md`. The bridge
inlines its own Agent SDK (0.3.261) and spawns the `claude` binary found at run time; what Claude Code itself decides is
not in these sources and is a seat check (`## Deployment` item 12). The main session checked E-1, E-3 and E-12 against
the sources itself.

| # | Question | Answer | Feeds | Settled |
|---|---|---|---|---|
| E-1 | How the bridge maps the system prompt and messages (Q9, cost 2) | One SDK `query()` per Pi prompt, continuing Claude Code's own session file with `resume`; when Pi's history diverges (compaction, a `system` entry after the cursor, an abort) the bridge rewrites that file from Pi's history. The system prompt is Claude Code's `claude_code` preset plus an append of exactly three parts: the nearest `AGENTS.override.md`/`AGENTS.md`/`AGENTS.MD` walking up from the cwd, Pi's skills block, and four opt-in blocks that are off by default. **Pi's system prompt is not forwarded**, so Limen's role preamble (`--append-system-prompt`, `src/runtime/engine.ts:248` at `rebuild-base`) and the hook's system block (`hook/communication.ts:104`) never reach the model on the `pi-claude` route. Pi user messages (the task, and at `rebuild-base` the wakes and steers sent with `pi.sendUserMessage`) and Pi custom messages (the per-turn cue, reminders) all arrive as `user`; Pi's `role: "system"` patch entries are dropped. So the per-turn cue, with its register lines, reaches the model every turn (gate 2 §1, revision 4). | A-037, A-042, A-051, A-079, A-008, A-038, A-040, A-043, A-077; new finding (below) | yes (code and the bridge README); one raw request on the seat confirms |
| E-2 | Cache breakpoints and TTL (Q9, cost 2) | The bridge sets no `cache_control`, breakpoint, TTL or caching variable; Claude Code decides all three. It reports `cacheRead` and `cacheWrite` per Pi turn (summed over the child's API calls; cost 0, no 5m/1h split). Claude Code's auto-compaction is switched off (`DISABLE_AUTO_COMPACT=1`); Pi compaction forces a session rewrite. | A-037, A-078, A-079, Measurement | partly: TTL, breakpoints and the cache effect of a rewrite are seat checks |
| E-3 | What `--approve` enables (Q6, security 1) | Only project trust for the run: Pi then reads `<cwd>/.pi/settings.json` (which can install packages and change `npmCommand`, `shellPath`, `shellCommandPrefix`), `.pi/skills`, `.agents/skills` and `.pi/SYSTEM.md`, and the bridge reads `.pi/claude-bridge.json` (which can set the Claude Code executable path). Pi has no tool-call approvals and no `--auto-approve` (OMP had it). Without `--approve`, JSON mode resolves trust to "untrusted". | A-004, A-025, A-003 | yes |
| E-4 | What a job loads from its worktree (Q5) | Pi: context files (`AGENTS.override.md`, `AGENTS.md`, `CLAUDE.md`, case variants) from the cwd up to `/` and from `~/.pi/agent`, never trust-gated (off only with `--no-context-files`); under the bridge these sit in Pi's prompt and do not reach Claude. Bridge: the nearest `AGENTS*` file, re-read every query (none in isolated mode, E-15). Claude Code: `CLAUDE.md` and `.claude/settings*.json` per its default setting sources (E-7). `--no-extensions` keeps the project stub `.pi/extensions/limen.ts` out of jobs but does not stop settings-listed package installs (`--offline` does). Extensions given with `-e` go through jiti's transpile cache in the OS temp directory, shared by every process of the account (`JITI_FS_CACHE=0` or a private `TMPDIR` avoids it). The whole Pi environment is forwarded to Claude Code. | A-025, A-004 (T1), A-003 | partly: jiti cache path, `-e` module resolution and Node's compile cache are seat checks |
| E-5 | Tool restrictions and the subagent tool (A-081, A-029) | Claude Code's built-in tools are disabled; Pi's tools are served to it as `mcp__custom-tools__<name>` under `bypassPermissions`, so Pi's `--tools` allowlist (e.g. `read,grep,find,ls`) reaches Claude exactly. `Agent`, `Task`, `Skill`, `AskUserQuestion` and other Claude Code tools are always denied; Pi's `tool_call` event sees only Pi tool names. Exception: a session with zero Pi tools gets Claude Code's own Bash/Read/Write back, so no role may run with an empty tool list. | A-081, A-029 | yes for the bridge; whether the seat binary still lists tools it loads on demand is a seat check |
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
| E-16 | How a Limen custom message reaches the coordinator (A-034, revision 4) | `pi.sendMessage(msg, { deliverAs: "followUp", triggerTurn: true })`: when the session is idle, Pi starts a new run with the message (`pi-coding-agent@1.5.1/dist/core/agent-session.js#L1946-L1972`, `sendCustomMessage` → `_startRun`; held until `agent_settled` has been emitted when it arrives during that event); when a run is active, the message goes to the follow-up queue (`agent.followUp`) and enters only when the agent would otherwise stop, i.e. after the current turn's tool calls and steers (`pi-agent-core@1.5.1/dist/agent-loop.js#L196-L202`), in the same run. This matches today's wake semantics (`hook/wake.ts:442-446`: `sendUserMessage` when idle, `deliverAs: "followUp"` when busy) and the pattern of `hook/group-peer.ts:132-135`. The message is stored with role `custom`, so the session's `user` entries stay Adrian's own. | A-034, T-16, T-05 | yes (code) |

**Consequences (main session, 2026-11-17).**
- **A-086 (critical, `fix`; Adrian, gate 2 revision 2):** E-1 means that on the seat's only route Limen's role
  prompts and coordinator manual are silently absent, while the fake-engine tests pass. Limen's standing instructions
  move to the **Limen context message**: one user-role message at session start, frozen for the session, saved in the
  job directory and re-sent after every compaction (E-13, E-14). Limen stops appending to Pi's system prompt. A-037,
  A-038, A-042, A-051 and A-079 changed with it.
- **Job text and the handoff note (Adrian, gate 2 revision 3):** every injected message arrives as `user`; only tool
  results have another role. So a wake carries only a header computed by Limen, and the coordinator fetches job
  content and the handoff note with a command, as a tool result (A-008, A-009, A-078).
- The stage 1 measurement of fixed context counts system-prompt text that the seat's model never receives; the
  per-turn cue (E-1) does reach it. Today's baseline is "no system-prompt prose, per-turn cue": every before/after
  comparison of prompt-driven behaviour compares it with "Limen context message plus the A-077 cue" and says so (gate
  2 §2, Measurement; revision 4).
- **Owner messages (Adrian, gate 2 revision 4):** every message Limen injects into the coordinator's session (wakes,
  the context message, digests, notices) is a Pi custom message (`limen-*` type, `followUp`, `triggerTurn`, E-16),
  never `sendUserMessage`; an owner message is a Pi session entry with role `user`, decided by one function for A-034,
  T-05 and T-16.
- Within decisions already taken (no new choice): jobs drop `--approve` and add `--offline`, `CLAUDE_BRIDGE_ISOLATED=1`
  (with its consequences in E-15 and D-005) and a private `TMPDIR` or `JITI_FS_CACHE=0` (A-025, E-3, E-4); the T1 allow-list is the only environment filter,
  because the bridge forwards everything (A-004, E-4); read-only roles get a non-empty Pi `--tools` allowlist (A-081,
  E-5); the reset time is taken from `kendex:rate-limit` when present, otherwise from `errorMessage` (A-016, E-9).

## Stages

Nine stages. Each ends with a working Limen and a local tag `aMAJOR.MINOR.PATCH`: the main session closes the stage
(below) and creates the tag in its clone; Adrian deploys it by `## Deployment`, where root tags the same commit in
`/opt/limen`. A fix after gate 5.N is a PATCH tag of the same stage. The order follows the priorities and the
dependencies:
- what the seat does not use goes first (G1), so that no ticket rebuilds code that is then cut;
- the foundations every subsequent ticket uses (errors, the command registry, the record);
- priority 1 by harm: loss of work (stage 3), instructions that never reach the model (stage 4, A-086), the trust
  boundary (stage 5);
- determinism (stage 6), autonomy (stage 7), the optional modules (stage 8), the cross-cutting cleanup (stage 9).

Stage 4 comes after stage 3 because it changes prompt-driven behaviour, which is measured on the seat (M-05) against
today's baseline "no system-prompt prose, per-turn cue". Stages 1–3 change no standing instruction that reaches the
model on the seat: the `jg` cue that R-009 cuts never fired there (no `jg` on the seat, T-36), and their edits of role
texts sit in Pi's system prompt, which the bridge drops (E-1). The wake and refusal texts they add are outputs of
mechanisms and are checked by the mechanisms' tests.

Conventions for every ticket:
- One commit `R-NNN: <title>` per ticket on `adrian-rebuild`, pushed at once; it also holds the ticket's `changes.md`
  entry and its status `done` (D-009). A fix after the push is a new ticket with a new number.
- A change of mechanism starts with a test that fails before it (T-28 (4)).
- `Mig. yes`: an on-disk change (`spec/`, `.limen/`, file names, hooks loaded by projects) comes with a script and a
  test on a fixture; a CLI change makes the old form exit with code 2 and name the new form in `next`, tested on a
  fixture (T-18; before R-013, a non-zero exit with the replacement in the message). The rollback of a format change is
  the snapshot of `## Deployment` 0.1, not a reverse script.
- From R-021, `record.json` changes additively: a new field is optional for older records; only a breaking change
  raises the schema version, and then the migration upgrades every older version (one fixture per version).
- A scan that cannot hold at once over the author's code (`catch`, casts, `biome-ignore`, test file names) starts as a
  ratchet: a baseline count in the repo that may only fall; R-082 and R-083 bring the counts to zero (T-27).
- Tests removed together with a cut feature are named in the outcome; the gate condition is "no new failure", not a
  fixed test count.
- Role prompt text changes in the ticket whose mechanism it describes (A-085: one copy of each fact); R-046 sets the
  shape, and the tickets after it keep that shape.
- A ticket whose `API` column is not `—` has a step in `## Deployment` that names it (T-28 (5)).

### Closing a stage

When every ticket of the stage is `done` or `dropped`, the main session:
1. runs the gate (D-001) and `check.mjs` on the last commit; both exit 0;
2. records M-10 (the gate's run time) and, from stage 4 on, M-01 (fixed context per role) in `evidence/`;
3. updates `## State`, commits `Stage N: close` and pushes;
4. creates the local tag (`a0.N.0`, `a1.0.0` for stage 9) on that commit;
5. writes the gate summary in its reply to Adrian: the verdict, the decisions he has to take, the tickets, the findings
   closed, the changes marked `unmeasured`, the fixed context before and after, the tag with its full SHA (the argument of `## Deployment` 0.2), and
   the deployment steps of the stage.

Adrian decides: go on, a fix, or a change of the plan. A fix is a ticket in the same stage and a PATCH tag. The seat
steps and the seat measurements are Adrian's; the next stage does not wait for them unless he says so. When a seat
step fails, Adrian chooses the rollback of 0.7 or a fix. The next stage starts in a new session.

### Stage 1 — Cut what the seat does not use (a0.1.0)

Remove the features cut at gate 2 (G1, §6) and the author's working history (T-39) before any rewrite. The seat flow
(detached jobs, review, land, the GitHub module) works as before; cut commands refuse with a pointer, and `limen status`
lists the leftover files of cut features. The root deployment script (D-008) deploys every tag from a0.1.0 on. The same-task runner can run the "before" measurement on `rebuild-base`.
Tickets R-001–R-012.

### Stage 2 — Foundations (a0.2.0)

The shared mechanisms every subsequent ticket builds on: one error type and exit codes as failure classes, one command
registry and parser, one configuration reader, validated boundary data, one Pi API adapter, atomic writes, one lock
module, a Linux platform adapter, one `record.json` per job written only by the transition function, exact job
references, thin commands over domain operations, `limen stats`, and test coverage derived from the registry. The
records of both projects migrate; `limen stats` reads the migrated history. Tickets R-013–R-025.

### Stage 3 — Work is never lost (a0.3.0)

No unlanded work is deleted; every job runs in its own scope; every failure has a recorded kind; a seat timer finds and
finishes dead jobs; a quota limit ends in one automatic resume; land is a sequence of recorded, repeatable steps; the
owner gets alerts for failures and escalations only. Tickets R-026–R-037.

### Stage 4 — Limen's instructions reach the model (a0.4.0)

Closes A-086: one Limen context message per session, frozen, saved and sent again after compaction, tested on a fake
engine that shows the model's view under the bridge; the turn cue keeps only variable parts; role texts come from the
package and are literal, sourced and budgeted per role. Tickets R-038–R-047.

### Stage 5 — The trust boundary (a0.5.0)

G2 in code and in seat tooling: an allow-listed job environment with no credential, only root-owned code for agents,
one registered coordinator, Limen's messages as custom messages and job or GitHub text only as tool results, the owner
files and the published copy, publication of `main` by the owner channel, egress allow-list templates, and seat code
under the same checks as the rest. Until R-071, land is decided as at `rebuild-base` (the coordinator lands after
Adrian's word, D-004); the owner channel publishes those lands under the coverage rule, which is no weaker than today,
where Adrian pushes them by hand without reviewing them (gate 2 §1). Tickets R-048–R-060.

### Stage 6 — Land by conditions (a0.6.0)

G3 and G4: tickets and the board in a core spec module; owner settings in `limits.json` and `routes.json`; typed
acceptance that Limen runs; a parsed verdict on the exact tip; ticket commands and a generated board; the task and the
label built by code; typed questions; bounded rounds with escalation; reports filed by Limen; land only on
code-checked conditions. Tickets R-061–R-071.

### Stage 7 — The owner's conversation (a0.7.0)

Owner decisions with a checked quote, the footer and `limen status` from one renderer, the ticket that records an
answered question in `docs/`, the migration of `needs-adam`, and owner touchpoints in `limen stats`. Tickets
R-072–R-076.

### Stage 8 — Optional modules (a0.8.0)

Groups, research, the quality pass and the Picture data, each with its gate-2 changes, off by default. Tickets
R-077–R-080.

### Stage 9 — Names, docs and debt (a1.0.0)

Docs and `SECURITY.md` written from the code, the ratchets at zero, test files named after their subject, comments that
resolve, the table of old command names removed, and the context-message budgets set by the final measurement. a1.0.0
is the tag of the finished rebuild (stage 6 of the rebuild prompt). Tickets R-081–R-086.

## Tickets

Columns:
- **Stage**: the stage of `## Stages`.
- **Sources**: findings (A-NNN), taste rules (T-NN), gate-2 items (G1.N, G2–G4, §N, S1+, H-NN), engine facts (E-N) and
  decisions (D-NNN).
- **Depends**: tickets that must be done first; always an earlier ID.
- **Size**: S (one module), M (a few modules), L (a subsystem).
- **Mode**: `delegated` (the `rebuild-implementer` subagent) or `pair` (the main session with Adrian), see
  `## Agents`.
- **Mig.**: `yes` when the ticket needs a migration path (`## Stages` → conventions).
- **API**: Pi, bridge, Herdr or systemd behaviour that the fake engine cannot prove.
- **Seat**: the `## Deployment` steps that verify it on the seat.
- **Status**: `planned`, `active`, `done`, or `dropped (<reason>)` by Adrian's decision.

| ID | Title | Stage | Sources | Depends | Size | Mode | Mig. | API | Seat | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| R-001 | Leftover files of cut features are listed and can be dropped | 1 | A-042 | — | S | delegated | — | — | — | planned |
| R-002 | Cut finish webhooks, coordinator signals and the finish ping | 1 | G1.3, A-027, A-060, A-076 | R-001 | M | delegated | yes | — | — | planned |
| R-003 | Cut Devin and the Linear mirror | 1 | G1.5, G1.6, A-049 | R-001 | M | delegated | yes | — | — | planned |
| R-004 | Cut the OMP engine | 1 | G1.7, A-049 | R-001 | M | delegated | yes | — | — | planned |
| R-005 | Cut hosted `--tab` jobs; the GitHub module and groups run detached | 1 | G1.8, A-023 | R-001 | L | delegated | yes | herdr | 1.2, 1.3 | planned |
| R-006 | Cut private planning, `highlight`, `ticket-author`, `wait`, `ticket series`, `continue --review` and `group status --json` | 1 | G1.12, T-18, T-37, A-079 | R-001 | M | delegated | yes | — | — | planned |
| R-007 | Cut the Picture viewer and the map jobs | 1 | G1.4, §6, A-048 | R-001 | L | delegated | yes | — | — | planned |
| R-008 | Cut the macOS branches | 1 | A-083 | — | S | delegated | — | — | — | planned |
| R-009 | Cut the scout role and the `jg` cue | 1 | T-33, T-36, A-081 | R-001 | S | delegated | yes | — | — | planned |
| R-010 | The author's working history leaves the tree; Limen's own test-line cap goes | 1 | T-39, T-11, §6 | — | M | delegated | — | — | — | planned |
| R-011 | The same-task runner and the gate-time tool | 1 | H-21, T-11, T-41, §2 | — | M | delegated | — | — | — | planned |
| R-012 | A root deployment script for a pinned SHA | 1 | D-008, D-010, §7 | R-002 | M | delegated | — | — | 1.0 | planned |
| R-013 | One error type, exit codes as failure classes, a final JSON line | 2 | T-01, T-02 | — | L | delegated | yes | — | — | planned |
| R-014 | One command registry, a shared parser and generated help | 2 | T-19, T-18, T-26, T-37 | R-013 | L | pair | yes | — | — | planned |
| R-015 | One configuration reader; settings come only from owner files | 2 | T-03 | R-014 | M | delegated | yes | — | — | planned |
| R-016 | One boundary parsing module with validators; the cast ratchet | 2 | T-27 | R-013 | M | delegated | — | — | — | planned |
| R-017 | One Pi API adapter with type guards, checked against Pi's real types | 2 | T-32 | R-012, R-016 | M | delegated | — | pi | 2.2 | planned |
| R-018 | One atomic-write module | 2 | A-022, T-25 | R-013 | M | delegated | — | — | — | planned |
| R-019 | One lock module with process identity and a bounded wait | 2 | A-017, A-018, A-055, A-058, T-25 | R-018 | M | delegated | yes | — | — | planned |
| R-020 | A Linux platform adapter and declared system requirements | 2 | A-083, T-12, T-32 | R-013 | M | delegated | — | — | — | planned |
| R-021 | One `record.json` per job, written only by the transition function | 2 | S1+, A-019, A-053, A-056, T-20, T-25 | R-016, R-018, R-019 | L | delegated | yes | — | — | planned |
| R-022 | Exact job references through one resolver | 2 | T-20 | R-014, R-021 | M | delegated | yes | — | — | planned |
| R-023 | Commands are thin adapters over domain operations; a refusal leaves no trace | 2 | T-26, T-38 | R-014, R-021 | L | delegated | — | — | — | planned |
| R-024 | `limen stats` over records and transcripts | 2 | H-01, H-20, §2, T-33 | R-021, R-023 | M | delegated | — | pi | 2.3 | planned |
| R-025 | Test coverage derived from the command registry | 2 | T-28, T-29 | R-014, R-023 | M | delegated | — | — | — | planned |
| R-026 | Every job runs in its own systemd user scope | 3 | A-029, A-052, T-43 | R-020, R-021 | L | delegated | — | systemd | 3.2, 3.7, 3.8 | planned |
| R-027 | The reaper ends a job only after its process group is gone | 3 | A-005, A-056 | R-026 | M | delegated | — | — | — | planned |
| R-028 | SIGTERM reaches the engine; a signal without a stop request is a failure | 3 | A-020, A-052 | R-026 | M | delegated | — | — | — | planned |
| R-029 | One recorded failure cause per job | 3 | A-016, E-9, T-31 | R-017, R-021 | M | delegated | — | bridge | 3.4 | planned |
| R-030 | Unlanded work survives: `limen abandon`, a guarded prune, a refusing spawn | 3 | A-001 | R-023 | M | delegated | yes | — | — | planned |
| R-031 | `landed` and `abandoned` markers; retire moves records to the archive | 3 | A-002, §6 | R-030 | M | delegated | yes | — | — | planned |
| R-032 | `limen seat sweep` runs on a timer; read commands never write or wait | 3 | A-024, T-04, T-18, A-017, §6 | R-012, R-027, R-031 | L | delegated | yes | systemd | 3.1 | planned |
| R-033 | Alerts from their own account: failures and escalations only | 3 | A-066, A-054, T-18 | R-021 | M | delegated | yes | systemd | 3.3 | planned |
| R-034 | Resume after the quota limit in code; seat rules are cut | 3 | A-016, A-010, A-068, §6 | R-029, R-032, R-033 | L | delegated | yes | systemd | 3.4, 3.5 | planned |
| R-035 | Start-queue thresholds: a diagnosis at 30 min, a failure at 2 h | 3 | A-036 | R-026, R-033 | M | delegated | — | systemd | 3.8 | planned |
| R-036 | Stall is measured over the whole job scope | 3 | A-059 | R-026 | M | delegated | — | systemd | 3.8 | planned |
| R-037 | Land runs as recorded steps with an atomic closing commit | 3 | A-021, A-057, T-18, T-28 | R-023, R-031 | L | delegated | yes | herdr | 3.9 | planned |
| R-038 | The fake engine shows the model's view under the bridge | 4 | T-31, A-051 | R-017 | M | delegated | — | bridge | 4.1 | planned |
| R-039 | The Limen context message: one per session, frozen, saved, sent again after compaction | 4 | A-086, A-037, A-079, A-051, T-36, E-13, E-16 | R-021, R-038 | L | delegated | yes | pi, bridge | 4.2 | planned |
| R-040 | Role texts come from the package, in three registers | 4 | A-038, A-039, A-042, D-005 | R-001, R-039 | M | delegated | yes | — | — | planned |
| R-041 | The turn cue holds only variable parts and the audience line | 4 | A-077, T-13 | R-039 | S | pair | — | pi | 4.4 | planned |
| R-042 | The task-note mechanism is cut | 4 | A-044, A-059 | R-039 | M | delegated | yes | — | — | planned |
| R-043 | Just-in-time reminders arrive in the triggering tool result | 4 | A-041, H-12 | R-039 | M | delegated | — | pi | 4.5 | planned |
| R-044 | Module switches; hooks load by role and module | 4 | G1.10, G1.1, G1.2, G1.9, A-082, A-040 | R-015, R-039 | M | delegated | yes | pi | 4.7, 4.9 | planned |
| R-045 | Tools and skills per role; a read-only role that writes fails | 4 | A-081, E-5 | R-044 | M | delegated | — | pi, bridge | 4.3 | planned |
| R-046 | Role prompts are literal, sourced and budgeted | 4 | T-09, T-14, T-15, T-08, T-10, T-21, A-043, A-085, A-040 | R-040, R-041, R-042, R-044 | L | pair | — | — | — | planned |
| R-047 | The coordinator never waits | 4 | T-34 | R-039 | S | delegated | — | pi | 4.6 | planned |
| R-048 | The job environment is an allow-list; jobs run the bridge isolated | 5 | A-004, A-061, E-3, E-4, E-15, D-005 | R-021, R-040 | M | delegated | — | pi, bridge | 5.8, 5.9 | planned |
| R-049 | Agents run only root-owned code; Pi and bridge versions are declared | 5 | A-025, T-32, T-36 | R-017, R-020, R-048 | L | delegated | yes | pi | 5.3, 5.5, 5.6, 5.10 | planned |
| R-050 | The registered coordinator and its start script | 5 | A-033, A-061, A-029, §2 | R-026, R-033, R-034, R-049 | L | delegated | yes | pi, herdr, systemd | 5.4, 5.11 | planned |
| R-051 | Wakes carry a computed header; Limen's messages are custom messages | 5 | A-008, A-078, A-034, T-16, E-16 | R-039, R-050 | M | delegated | — | pi | 5.12 | planned |
| R-052 | The handoff note goes through a registered tool | 5 | A-009, A-034, A-047 | R-051 | M | delegated | yes | pi | 5.13 | planned |
| R-053 | Steer entries carry an envelope; only the coordinator steers | 5 | A-028 | R-050 | M | delegated | yes | pi | 5.14 | planned |
| R-054 | The published copy and the owner files | 5 | A-011, §2 | R-037, R-050 | L | delegated | yes | — | — | planned |
| R-055 | The owner channel publishes `main` by the coverage rule; `hold` and `replay` | 5 | A-006, T-22, §7 | R-031, R-054 | L | delegated | yes | systemd | 5.1, 5.2, 5.15 | planned |
| R-056 | Egress allow-list templates for the agents' account | 5 | G2, A-004 | R-012, R-048 | M | delegated | — | systemd | 5.16 | planned |
| R-057 | The GitHub poller keeps its own state and authorises fork pull requests | 5 | A-003, A-062, A-063, A-018 | R-005, R-019 | M | delegated | yes | systemd | 5.17 | planned |
| R-058 | GitHub text reaches the coordinator only as a tool result | 5 | A-007, A-026 | R-051, R-057 | M | delegated | — | — | — | planned |
| R-059 | Seat code is typed, linted and tested in `seat/`; one usage poller | 5 | A-047, A-016, A-067 | R-020, R-034 | M | delegated | yes | pi, systemd | 5.5, 5.18 | planned |
| R-060 | Agents create no timers; the sweep reports foreign timers and engines | 5 | T-42, A-029 | R-032, R-050 | M | delegated | — | pi, systemd | 5.19 | planned |
| R-061 | Tickets and the board are a core spec module with narrow parsers | 6 | A-048, T-12 | R-016, R-023 | L | delegated | yes | — | — | planned |
| R-062 | Owner settings in `limits.json` and `routes.json`; `limen init` asks for them | 6 | A-014, A-030, A-059, T-11, T-03 | R-015, R-054 | L | delegated | yes | — | — | planned |
| R-063 | Typed acceptance; Limen runs every `Check` at the tip | 6 | A-031, T-06, T-10 | R-061, R-062 | L | delegated | yes | — | — | planned |
| R-064 | The review verdict and findings are parsed from the reviewer's result | 6 | A-013, T-08, G4 | R-063 | M | delegated | — | bridge | 6.3 | planned |
| R-065 | Ticket commands: start, drop, commit, check; a generated outcome; survey tickets | 6 | A-070, A-072, T-22, T-34 | R-037, R-055, R-061 | L | pair | yes | — | — | planned |
| R-066 | The board is generated; `limen spec fix` replaces the keeper | 6 | T-23, A-045, A-072, T-18, §6 | R-065 | L | pair | yes | — | — | planned |
| R-067 | The job task and the job label are built by code | 6 | T-07, T-24, A-073, A-044 | R-063, R-065 | M | delegated | yes | herdr | 6.5 | planned |
| R-068 | `limen ask` and `limen answer`: typed questions in the record | 6 | T-05, T-15 | R-051, R-054, R-062 | L | pair | — | — | — | planned |
| R-069 | Review rounds per ticket and `limen escalate` | 6 | A-015, T-05 | R-055, R-064, R-068 | M | delegated | — | — | — | planned |
| R-070 | Limen files the review and research reports itself | 6 | A-035, A-046 | R-064, R-065 | M | delegated | — | — | — | planned |
| R-071 | `limen land` passes only on code-checked conditions | 6 | A-012, A-032, G3, T-40, §7 | R-063, R-064, R-069, R-070 | M | delegated | — | — | — | planned |
| R-072 | `limen decide`: owner decisions with a checked quote, a scope and a lifetime | 7 | A-034, T-05, T-42 | R-068 | L | delegated | — | pi | 7.3 | planned |
| R-073 | The footer and `limen status` share one renderer; question blocks are chat entries | 7 | T-15, T-16, T-10 | R-068, R-072 | L | pair | — | pi | 7.2 | planned |
| R-074 | An answered question opens the ticket that records it in `docs/` | 7 | T-05 | R-065, R-068 | S | delegated | — | — | — | planned |
| R-075 | `needs-adam` keys become open request records | 7 | T-21 | R-068 | S | delegated | yes | — | — | planned |
| R-076 | Owner touchpoints and questions in `limen stats` | 7 | T-40, T-05 | R-024, R-068 | S | delegated | — | — | — | planned |
| R-077 | Groups: state conditions, data batches, one final result, a model-free group land | 8 | G1.2, A-029, A-069, A-080, A-075, A-045, T-35 | R-044, R-071 | L | delegated | yes | pi | 8.1 | planned |
| R-078 | Research on its own account, with a queue scanner and quote-checked synthesis | 8 | G1.11, A-004, A-046, T-35, T-18, §6 | R-044, R-059, R-070 | L | delegated | — | systemd | 8.2 | planned |
| R-079 | The quality pass is a module triggered by code | 8 | G1.13, A-071 | R-044, R-071 | S | delegated | — | — | — | planned |
| R-080 | Picture serves record data only; `touches:` is optional | 8 | G1.4, A-048 | R-044, R-061 | M | delegated | yes | — | — | planned |
| R-081 | Docs from the code with generated sections; `SECURITY.md` names the boundaries and accepted risks | 9 | A-050, A-084, T-02, T-10, T-21, T-39 | R-080 | L | pair | — | — | — | planned |
| R-082 | Lint debt, casts and swallowed errors reach zero | 9 | T-27, T-01 | R-080 | M | delegated | — | — | — | planned |
| R-083 | Test files are named after their subject | 9 | T-29 | R-080 | M | delegated | — | — | — | planned |
| R-084 | Comments resolve and name no person | 9 | T-30, T-21 | R-080 | M | delegated | — | — | — | planned |
| R-085 | The table of old command names leaves; the final help | 9 | T-18, T-19 | R-080 | S | pair | yes | — | — | planned |
| R-086 | Context-message budgets from the final measurement | 9 | T-09 | R-046, R-080 | S | delegated | — | — | — | planned |

Taste rules with no ticket of their own:
- T-17: binds the rebuild files, not Limen; its check runs in `adrian-rebuild/tools/check.mjs` since rebuild stage 3.

Notes for the tickets (facts a ticket needs that its row cannot hold):
- R-001: A-042's decision defines the mechanism ("`limen status` lists leftover template copies once; `limen init
  --drop-leftovers` removes them"); R-001 builds it once, and every cut ticket registers the leftover paths of its
  feature.
- R-010: the cap it removes is the 3,500-line cap on Limen's own `test/`, a sentence in Limen's `spec/vision.md` read by
  a test (T-11); the projects' optional `testLineCap` in `limits.json` is a different setting, built by R-062.
- R-011: the runner takes the project, the parent commit, the ticket file and the reference test paths as arguments;
  the rebuild session has no access to the projects, so Adrian picks the ticket before B.2 by the criterion of
  `## Measurement`.
- R-005: the GitHub module's review today reads the job's `hosted` file and gives up without it
  (`src/integrations/github-review.ts:146`); hosted jobs: 0 in both projects (gate 2 §1).
- R-012: the script is `seat/deploy.ts` (TypeScript, D-010), which also puts `seat/` under `tsconfig.json` and
  the scan for `.sh` files in `seat/` and `bin/`; it reads job state through the record module once R-021 exists.
  R-017, R-032 and R-056 add the type contract, the unit verification and the nftables check to it. The D3 test that
  `src/` and `hook/` have no dynamic `import(` on the job-finalize path lives here (none at `rebuild-base`).
- R-009, R-046: under the bridge Claude Code's subagent tool is always denied (E-5), so the condition of T-33 for a
  subagent in the coordinator's session does not hold; the manual recommends no subagent. A short question is the
  coordinator's own, a long one is a survey ticket (T-34).
- R-013: until R-082, the `catch` scan of T-01 is a ratchet over the author's 148 sites (40 `.catch(() => {})`, 108
  `catch {`, T-01 → Why).
- R-015: from a0.2.0 the settings live in the project's `.agents/limen/limits.json`, which exists at `rebuild-base`
  with `prepare` and `toolStall` (`src/project/limits.ts:7`), and the environment no longer overrides them.
  `LIMEN_WORKER_MODEL` and `LIMEN_REVIEWER_MODEL` stay readable, as the only listed exceptions, until R-062 brings
  `routes.json`; dropping them first would make the silent fallback of A-030 the default.
- R-020: git is declared by the feature Limen needs (`git worktree list --porcelain -z`), not by a version number, so
  the gate's shim (D-001) satisfies it on the laptop's git 2.34.
- R-024: `limen stats` of a0.2.0 over a migrated copy of the whole history of both projects is the "before" of M-03,
  M-04 and M-06–M-11 (`## Deployment` B.3).
- R-030: from R-068 on, a job in `needs-decision` does not block worker spawns for other tickets (T-05 (5)).
- R-039: `context-size.mjs` learns to measure the context message in this ticket (M-01).
- R-040, R-048: the project's `AGENTS.md` goes into the context message exactly when the job runs the bridge isolated
  (E-15, D-005); R-040 builds the rule from a launcher flag, and R-048 turns isolation on, so the file never arrives
  twice. Neither project has an `AGENTS.md` today (gate 2 §1).
- R-044: the switches go into the existing `limits.json`; its migration lists the modules each project uses (the
  GitHub module when connected, groups when a group record exists), and Adrian switches those on in step 4.9.
- R-059: no shell scripts (D-010): `docs/seat/bell.sh` and `docs/seat/github-setup.sh` become TypeScript in `seat/`,
  and every unit calls `node /opt/limen/seat/<tool>.ts`.

## Deployment

Adrian's steps on the seat; the rebuild session runs none of them. `<project>` is a project's checkout, `<tag>` and
`<sha>` come from the gate summary of the stage. No step needs a secret from this repository.

Where the owner actions of gate 2 §9 (the 16 items recorded at gate 2) are placed:

| Item | Subject | Steps |
|---|---|---|
| 1 | Accounts: names, owner channel, research account, alerts account, egress allow-list, tokens | 3.3, 5.1, 5.16, 8.2 |
| 2 | GitHub ruleset on `main` of both projects (§7 D1) | 5.2 |
| 3 | Root-owned installs of Pi 1.5.1, the bridge and the coordinator start script | 5.3 |
| 4 | Coordinators start only through the start script | 5.4 |
| 5 | `limen seat sweep --install`, old prune units off, route variables out of the environment | 3.1, 6.1 |
| 6 | Old seat extensions removed; the extra Limen checkout in the agents' home | 5.5 |
| 7 | `limen` and `node` resolve to root-owned paths; `LIMEN_PACKAGE` unset | 5.6 |
| 8 | The agents' account is not in `adm` or `systemd-journal` | 5.7 |
| 9 | `limen init` answers per project | 6.1 |
| 10 | Migration of records and of ticket acceptance; the `needs-adam` count | 2.1, 6.2, 7.1 |
| 11 | Alerts: first installation and the phone app | 3.3 |
| 12 | Seat verification of what the package sources could not settle | B.1, 3.2, 3.4, 4.2, 4.3, 4.4, 5.8, 5.9, 5.10, 6.3, 7.2 |
| 13 | Reboot test | 3.7, 5.11 |
| 14 | Measurements "before" | B.1, B.2, B.3 |
| 15 | `.limen/` snapshot before each deployment | 0.1 |
| 16 | Bridge and type contracts at every tag and after a version change | 0.2, 0.5, 2.2, 4.1 |

Item 12 also asked for the subagent tool's name under the bridge: settled by the sources (always denied, E-5).

### Every tag

The deployment script (D-008, R-012) is the only way a commit reaches `/opt/limen`; gate 5.N gives the tag and its
full SHA.

- **0.1** Snapshot `<project>/.limen/` of both projects and the seat state directory to a place the agents' account
  cannot write; keep it until the next tag has run a trial route.
- **0.2** As root: `node /opt/limen/seat/deploy.ts <sha>` with the full SHA. The script refuses, listing the running
  jobs, while any job runs (§7 D3); fetches `origin adrian-rebuild`; refuses a SHA that is not an ancestor of
  `origin/adrian-rebuild`; checks it out detached and tags it locally; compares `git rev-parse HEAD` with the SHA;
  from a0.2.0 runs the Pi type contract (T-32, R-017), from a0.3.0 verifies the generated systemd units with
  `systemd-analyze verify` (R-032), and from a0.5.0 the nftables rules with `nft -c -f` (R-056). On any failure after
  the checkout it returns to the previous SHA and exits with code 4 (D-010).
- **0.3** Reload every coordinator session with `/reload` (from a0.5.0: restart it through the start script, R-050).
- **0.4** The stage's steps below, in order; a migration runs first with `--dry-run` where the step says so.
- **0.5** From a0.4.0: the bridge contract of R-038 (T-31), the bridge log of one coordinator turn and one job turn
  against the fake engine's model view of the same scenario. It runs at every tag and after any change of the Pi or
  bridge version; a version change lands only after the bridge and the type contract pass.
- **0.6** Trial route in one project: one small ticket through spawn, review and land; note the exit codes and the
  time. The stage's steps name what else to watch.
- **0.7** Rollback: `node /opt/limen/seat/deploy.ts <previous sha>`, then restore the snapshot of 0.1.

### Measurements before

B.1 and B.2 run before the first deployment; B.3 runs after a0.2.0 is deployed.


- **B.1** On `rebuild-base` (today's seat), with `CLAUDE_BRIDGE_DEBUG=1`: save the per-query CLI log of one coordinator
  turn and one job turn (M-02). From the same log: whether each turn reuses or rewrites the Claude Code session, the
  cache TTL (`modelUsage` 5m or 1h), the context window of `claude-opus-5-5` on the Max login, and the cache read of
  the turn after a manual `/compact`, which forces a rewrite (E-1, E-2, E-8).
- **B.2** The same-task baseline: the same-task runner of R-011 with `rebuild-base`, k attempts (M-05).
- **B.3** After a0.2.0 is tagged: `limen stats` of a0.2.0 over a migrated copy of each project's `.limen/` from the
  snapshot of 0.1 (R-024; M-03, M-04, M-06–M-11).

### After stage 1 (a0.1.0)

- **1.0** Bootstrap, once: `/opt/limen` at `rebuild-base` has no deployment script. Check by hand that no job runs
  (`limen status` in both projects) and take the snapshot of 0.1; then, as root, `git -C /opt/limen fetch origin
  adrian-rebuild`, `git -C /opt/limen merge-base --is-ancestor <sha> origin/adrian-rebuild` and `git -C /opt/limen
  checkout --detach <sha>` with the full SHA of a0.1.0, and run `node /opt/limen/seat/deploy.ts <sha>`, which repeats
  every check and tags the commit (R-012). From a0.2.0 on, only 0.2 deploys.
- **1.1** In each project, `limen status` lists the leftover files of cut features (R-001–R-007, R-009); check the list, then
  run `limen init --drop-leftovers`.
- **1.2** A detached job still opens its log tab in Herdr, and `limen spawn --tab` refuses with the reason (R-005).
- **1.3** The GitHub module, only if it is connected: one `@limen` mention runs as a detached job (R-005).

### After stage 2 (a0.2.0)

- **2.0** Deploy a0.2.0 by 0.1–0.3: `node /opt/limen/seat/deploy.ts <sha>` with the full SHA from gate 5.2.
- **2.1** The record migration of R-021 with `--dry-run`, then for real, in each project; the report lists every job
  and every id collision (item 10).
- **2.2** The deployment script ran the type contract of R-017 against the installed Pi 1.5.1 types and exited 0
  (item 16).
- **2.3** `limen stats` over the migrated history of both projects matches the counts known from gate 2: 142 jobs (84
  worker, 58 reviewer; T-33) and 18 failed (12 limit, 3 timeout, 2 stall, 1 exit; `audit.md` gate 2 §1, Q1) (R-024;
  B.3).
- **2.4** `limen status` lists the `LIMEN_*` settings variables it finds in the environment (R-015); remove them from the
  coordinator's environment, except the two route variables, which stay until 6.1.

### After stage 3 (a0.3.0)

- **3.0** Deploy a0.3.0 by 0.1–0.3: `node /opt/limen/seat/deploy.ts <sha>` with the full SHA from gate 5.3.
- **3.1** `limen seat sweep --install` on the agents' account, with lingering on (root runs `loginctl enable-linger` if
  the command says so); then disable and remove the old `limen-prune.*` units (item 5; R-032).
- **3.2** From a Herdr pane on the agents' account, `systemd-run --user --scope true` exits 0 (item 12); during a trial
  job, `systemd-cgls` shows the engine and its tools in the job's scope (R-026).
- **3.3** Alerts: choose the new account names for every account of item 1 (the alerts account is the first), and
  create the alerts account (item 1); install its unit with the ntfy
  topic as a credential (mode 0600); install the ntfy app on the phone and subscribe (item 11); the first run sends
  nothing for old jobs (R-033).
- **3.4** At the next real 5-hour limit, whenever it comes (nothing waits for it; the fake engine's tests cover the
  mechanism): the job's record has kind `quota` and a reset time, exactly one resume runs 5 minutes after the reset
  (A-010, A-016), and the record shows whether a `rate_limit_event` arrived (`kendex:rate-limit`) for the 5-hour and
  the weekly limit (item 12; E-9; R-029, R-034).
- **3.5** `limen rule` refuses and names its replacement; the old seat rules file appears as a leftover (R-034).
- **3.6** `limen status` lists finished jobs with unlanded work; resolve each with `limen continue <id>` or
  `limen abandon <id>` before the next spawn (R-030); the marker migration of R-031 reports which landed jobs it marked
  and which it left without a marker.
- **3.7** Reboot test: jobs survive a Herdr restart (`systemd-cgls` before and after) (item 13; R-026).
- **3.8** A trial job's record holds the peak memory and CPU of its scope, and a job that runs only `sleep 300` ends
  with kind `stall` (R-026, R-035, R-036).
- **3.9** Land closes the job's Herdr tab in its `cleaned` step (R-037).

### After stage 4 (a0.4.0)

- **4.0** Deploy a0.4.0 by 0.1–0.3: `node /opt/limen/seat/deploy.ts <sha>` with the full SHA from gate 5.4.
- **4.1** The bridge contract (T-31): the bridge log of one coordinator turn and one job turn against the fake engine's
  model view of the same scenario (R-038; item 16).
- **4.2** The per-query CLI log shows the Limen context message in the request, whole and first, also for the largest
  role, and it does not start with `/` (E-14); after a manual `/compact` it is sent again (item 12; R-039).
- **4.3** A review job sees only its declared tools and skills, and the seat's Claude Code lists no tool it would load
  on demand (item 12; E-5; R-045).
- **4.4** A Polish message to the coordinator gets a Polish answer, and a ticket written from that conversation is in
  English (item 12; T-13; R-041).
- **4.5** An edit of a ticket in `spec/features/planned/` brings the vision reminder inside that tool result (R-043).
- **4.6** In the coordinator's Bash, `sleep 240` is refused with the wake sentence (R-047).
- **4.7** With every module off, the coordinator session loads no group hook (R-044).
- **4.8** Measurements after stage 4: M-02 and M-05 with a0.4.0 (M-01 is recorded by the main session at the close of
  the stage).
- **4.9** Switch on, in each project's `.agents/limen/limits.json`, the modules its migration report lists as in use;
  until a0.5.0 Adrian edits the file directly, from then on only through the owner channel (R-044).

### After stage 5 (a0.5.0)

- **5.0** Deploy a0.5.0 by 0.1–0.3: `node /opt/limen/seat/deploy.ts <sha>` with the full SHA from gate 5.5.
- **5.1** Accounts (item 1), with the names chosen in 3.3: create the owner channel account, which accepts only a
  separate key of Adrian's, kept on his own machines with no agent forwarding, and only with a forced command; move
  the GitHub write token to it; give the agents' account a read-only token (R-055).
- **5.2** A GitHub ruleset on `main` of both projects: push only from the owner channel's identity, no force push, no
  deletion (item 2; §7 D1; R-055).
- **5.3** Root-owned installs by the seat script: Pi 1.5.1 and bridge 5.0.3, with Pi's install path confirmed, and the
  coordinator start script (item 3; R-049, R-050).
- **5.4** Coordinators start only through the start script, never by exporting `LIMEN_COORDINATOR`; a second start for
  the same project refuses and names the PID (item 4; R-050).
- **5.5** Remove the old seat extensions from the Pi extensions directory, and establish whether anything loads the
  extra Limen checkout in the agents' home (item 6; R-049, R-059).
- **5.6** In the coordinator pane, `limen` and `node` resolve to root-owned paths and `LIMEN_PACKAGE` is unset (item 7;
  R-049).
- **5.7** The agents' account is not in `adm` or `systemd-journal` (item 8).
- **5.8** A job in isolated mode quotes the first rule of the "Real data" section of `CLAUDE.md`, and the per-query log
  shows the file loaded; a job quotes the project's `AGENTS.md` if one exists (item 12; E-7, E-15, D-005; R-048).
- **5.9** The per-query log shows the Claude Code binary the launcher pins, and its version (item 12; E-1, E-15; R-048).
- **5.10** The jiti cache path, Node's compile cache and the `-e` module resolution of a job (item 12; E-4; R-049).
- **5.11** Reboot test: Herdr restores the coordinator pane, and the start script registers it again (item 13; R-050).
- **5.12** An idle coordinator wakes when a job ends, a busy one gets the wake after its current turn, and its session
  shows the wake as a custom entry, not as a user message (E-16; R-051).
- **5.13** The coordinator calls the handoff tool at a threshold; the new session's first message is a pointer, and
  `limen handoff show` prints the note (R-052).
- **5.14** A steer reaches a worker with its origin prefix; a steer to a review job refuses (R-053).
- **5.15** The owner channel's timer publishes `main` after a land; a hand commit on `main` is refused by the hook; in
  a scratch project, a deliberate uncovered commit brings the `uncovered-commit` alert and `hold` recovers it (R-055).
- **5.16** Install the nftables rule and the proxy for the agents' account from the templates; the domain list starts
  from the template and grows only by measurement: run one job and one coordinator turn, read the proxy log, add the
  domains Claude Code under the bridge needs (B2c; R-056).
- **5.17** The GitHub module, only if it is connected: `limen github doctor` reports the new private state and no
  abandoned lock (R-057).
- **5.18** The status line loads from `seat/` in coordinators only, and the shared usage poller makes at most one
  request per 2 minutes, the endpoint's limit per account (A-047; R-059).
- **5.19** In a coordinator and in a job, `crontab -e` is refused; a timer Adrian creates by hand on the agents' account
  appears in the next sweep report and stays untouched (R-060).

### After stage 6 (a0.6.0)

- **6.0** Deploy a0.6.0 by 0.1–0.3: `node /opt/limen/seat/deploy.ts <sha>` with the full SHA from gate 5.6.
- **6.1** `limen init` in each project: `maxJobs`, the round limit, the routes with reasoning levels, the project gate
  command, the module switches (all off) and the test-line cap (item 9; D-004; R-062); then remove
  `LIMEN_WORKER_MODEL` and `LIMEN_REVIEWER_MODEL` from the environment (item 5).
- **6.2** The front-matter migration of R-061 with `--dry-run`, then for real; open tickets get a typed
  `## Acceptance` at their next spawn (item 10; R-063).
- **6.3** A review job's final message starts with `PASS <sha>` or `FAIL <sha>`, and its record holds the verdict and
  one answer per criterion (item 12; A-086, A-051; R-064).
- **6.4** The board migration of R-066 prints the old prose sections; what should stay goes into the milestone plan in
  `docs/` through a normal ticket.
- **6.5** Job tabs in Herdr carry the label built by code (R-067).
- **6.6** A trial route through land by conditions, including one refusal (R-071).

### After stage 7 (a0.7.0)

- **7.0** Deploy a0.7.0 by 0.1–0.3: `node /opt/limen/seat/deploy.ts <sha>` with the full SHA from gate 5.7.
- **7.1** Before the migration of R-075, count the `needs-adam` keys in both projects; after it, the same number of open
  request records exists (item 10; T-21).
- **7.2** A footer entry does not reach the model: the next turn's input tokens do not grow by the footer's size (item
  12; T-15; R-073; M-12).
- **7.3** `limen decide --quote` accepts a quote from Adrian's last message and refuses one from a wake (R-072).

### After stage 8 (a0.8.0)

- **8.0** Deploy a0.8.0 by 0.1–0.3: `node /opt/limen/seat/deploy.ts <sha>` with the full SHA from gate 5.8.
- **8.1** Groups, only when switched on: a trial group of two teams runs detached and lands through `limen group land`
  (R-077).
- **8.2** Research, only when G1.11 is switched on: create the research account with its own Claude login and an open
  network, install the queue scanner, submit one question (item 1; B2c; R-078).

### After stage 9 (a1.0.0)

- **9.0** Deploy a1.0.0 by 0.1–0.3: `node /opt/limen/seat/deploy.ts <sha>` with the full SHA from gate 5.9.
- **9.1** Measurements after the rebuild on the seat, by the same method as before: M-02–M-09 and M-11.

## Measurement

M-01, M-10 and M-13 are measured on the laptop by the main session when it closes a stage; every metric of model
behaviour or of the seat is measured on the seat, before and after, by Adrian (z. 40). Every before/after comparison of prompt-driven behaviour states its baseline:
"before" is today's seat, which runs with no system-prompt prose and with the per-turn cue (gate 2 §1–§2, revision 4);
"after" is the Limen context message plus the A-077 cue.

Same-task method (gate 2 §2, H-21; the same-task runner of R-011): a closed synchronizer M1 ticket that went through
several review rounds, run again from its parent commit in a scratch clone outside the projects' `.limen/`, never landed; identical
input (commit and ticket file), the same model and reasoning level, a clean state. An attempt passes when the job
reaches `done` and the test files of the merged reference change pass on the job's tip together with the project
gate. The result is pass^k (all k attempts pass), reported next to the number of passing attempts; k = 3 per version,
because every attempt is a whole ticket on the shared Max window (z. 17).

| ID | Metric | Source | Before | After | Tickets |
|---|---|---|---|---|---|
| M-01 | Fixed context per role, bytes and ≈tokens | `node adrian-rebuild/tools/context-size.mjs <ref>` on the laptop; `--project` on the seat | `rebuild-base` (`evidence/context-size-rebuild-base.md`): system-prompt text the bridge drops, plus the cue that reaches the model | at the close of every stage from stage 4: the context message and the cue | R-039–R-047, R-086 |
| M-02 | One raw request per role (coordinator turn, job turn) | per-query CLI log with `CLAUDE_BRIDGE_DEBUG=1` | B.1 | 4.8, 9.1 | R-039 |
| M-03 | Coordinator cache-read tokens per landed ticket (A-078) | `limen stats` | B.3, M1 history | 9.1, the next ten landed tickets | R-051 |
| M-04 | Coordinator cache-write tokens in the turn after a land (A-037) | `limen stats` | B.3 | 9.1 | R-039 |
| M-05 | Same-task pass^k, with per run: owner commands outside owner-channel actions (T-41, target 0), `sleep` calls and repeated `status` reads by the coordinator (T-34), share of model replies with their own Done / In progress / Waiting for you lines (T-15, target 0 from a0.7.0), reply language equal to the owner's (T-13), metaphors from the T-14 list in replies | same-task runner (R-011) and its transcript counts | B.2, `rebuild-base` | 4.8 (a0.4.0), 9.1 (a1.0.0) | R-011, R-039–R-047, R-067, R-073 |
| M-06 | Lead time per ticket, split into queue, job runs, checks, review and waiting for the owner | `limen stats` | B.3 | 9.1 | R-024, R-076 |
| M-07 | Tokens per landed ticket by class (input, cache write, cache read, output) | `limen stats` | B.3 | 9.1 | R-024 |
| M-08 | Owner touchpoints per landed ticket, by kind and cause (T-40) | `limen stats`; before: owner messages per ticket in the coordinator transcripts | B.3 | 9.1 | R-076 |
| M-09 | Peak CPU and memory per job scope; time two projects could not both run a job (T-43) | record fields of R-026; start-queue waits | B.3; queue waits only (22 waits, longest 48 min, gate 2 §1) | 9.1 | R-026, R-035 |
| M-10 | Run time of the gate at every stage tag (T-11) | gate-time tool (R-011), laptop | 79–88 s (`evidence/baseline.md`) | at the close of every stage, recorded in `evidence/` | every stage |
| M-11 | Failure kinds and rounds per ticket (A-016, A-015) | `limen stats` | B.3; gate 2 §1: 18 failed jobs (12 limit, 3 timeout, 2 stall, 1 exit) | 9.1 | R-029, R-069 |
| M-12 | A footer entry stays outside the model's context (T-15) | seat step 7.2 | — | 7.2 | R-073 |
| M-13 | Token budget of each role's context message (T-09) | the budget test of R-046, laptop | the size at the close of stage 4 | set by R-086 to the size measured then + 10 % (T-09) | R-046, R-086 |

A ticket whose change cannot be measured here marks it `unmeasured` in its outcome with the M-NN above.

## Agents

Definitions: `.claude/agents/rebuild-implementer.md` and `.claude/agents/rebuild-reviewer.md` (tracked). The Polish
summary of each is a YAML comment inside the front matter, because Claude Code reads the front matter from the file's
first line; `check.mjs` accepts that form for these two files.

- **rebuild-implementer**: tools `Read`, `Grep`, `Glob`, `Edit`, `Write`, `Bash`; `disallowedTools`: `Agent`. Reads
  `ticket.md`, `taste.md`, the harness principles in `input/`, the plan's Decisions and Engine facts, and the findings
  the ticket names. Writes the failing test first, then the change; runs the gate, `check.mjs` and Biome; drafts
  `outcome.md`. Changes no git state, edits none of the main session's files and none of the checks that judge it. On
  a question it stops and replies `BLOCKED: <question>` with options and a recommendation; two failures of the same
  step also end in `BLOCKED`.
- **rebuild-reviewer**: tools `Read`, `Grep`, `Glob`, `Bash`; `disallowedTools`: `Write`, `Edit`, `Agent`. Gets only
  the paths of `ticket.md`, the diff file and `taste.md`; `ticket.md` quotes every decision and engine fact the change
  relies on, so the reviewer checks against them without other inputs. Replies with `PASS` or `FAIL` on line 1, one
  `<ID>: met | not met | unknown: <evidence>` line per criterion, findings as
  `blocking|note · proven|observed|guessed · <finding> · <evidence>` (T-08), and answers to the per-ticket taste
  questions (T-40, T-41, T-13, T-14, T-19, T-30). Verdict rule: `PASS` when every criterion is met and no finding is
  blocking, otherwise `FAIL`; a blocking finding is always `proven`, and a suspicion the reviewer cannot prove is a
  note.

Mode criterion: `pair` when the ticket's substance is taste (CLI UX, names, messages, the tone of role prompts, the
shape of a ticket or the board) or when its acceptance cannot be checked by a command; `delegated` otherwise.

Template of `ticket.md` (`check.mjs` requires these headings in every ticket folder):

```
<!-- PL: <2–5 sentences in Polish> -->
# R-NNN <title>
## Problem
<what is wrong; the sources, quoting each finding's Decision and every plan decision and engine fact the change relies on>
## Change
## Out of scope
## Acceptance
- AC-1: `<command>` → <expected result>
- AC-2 (judgment): <a criterion the reviewer judges, only where no command can check it>
## Migration
<the script and its fixture test, the refusal of an old CLI form, or "none">
## Risk
## Rollback
## Decisions
<answers to BLOCKED questions, review findings to fix, and Adrian's decisions, each dated>
```

Protocol per ticket (rebuild stage 5):
1. The next ticket is the lowest `planned` ID of the current stage whose dependencies are all `done`.
2. The main session writes `adrian-rebuild/R-NNN-<slug>/ticket.md` and sets the ticket's status to `active`.
3. `delegated`: the main session starts `rebuild-implementer` by its name (not a fork) with the ticket folder's path
   and changes nothing in the working tree while it runs. On `BLOCKED: …` it asks Adrian, adds the answer to
   `ticket.md` → `## Decisions`, and resumes the same agent with `SendMessage` to its ID. `pair`: the main session
   implements with Adrian.
4. The main session runs `sh adrian-rebuild/tools/gate.sh` itself; its run counts, not a subagent's report. When it
   fails after `DONE`, the main session resumes the implementer with the output; a second failure of the same step
   goes to Adrian (z. 1).
5. Review: `node adrian-rebuild/tools/review-guard.mjs snapshot > <scratch>/R-NNN.before` and
   `node adrian-rebuild/tools/review-guard.mjs diff > <scratch>/R-NNN.diff` (both files outside the repository), then
   `rebuild-reviewer` with the three paths, then `node adrian-rebuild/tools/review-guard.mjs compare
   <scratch>/R-NNN.before`. Exit 1 voids the review. The guard compares HEAD, every ref, `git status --porcelain` and a
   SHA-256 of every changed and untracked file, so a second edit of an already modified file is caught, which the
   status alone would miss (`tools/test-review-guard.sh`).
6. The main session writes the round into `review.md`. It records why it rejects a finding, or adds the findings to fix
   to `ticket.md` → `## Decisions`; the fixes are made by the resumed implementer (`delegated`) or by the main session
   (`pair`), and the review runs again on the new diff. At most two rounds of fixes; then Adrian decides, and his
   decision goes to `ticket.md` → `## Decisions`.
7. `outcome.md`, the `changes.md` entry (D-009), the status `done` in `## Tickets` and `## State`; then `check.mjs`
   and Biome on `adrian-rebuild`; one commit `R-NNN: <title>` with all of it; `git push origin adrian-rebuild`.
- No `SendMessage` to other sessions, no `ListAgents`, no agent teams; state passes only through files.

## State

Updated 2026-11-17, rebuild stage 4 (plan) done; gate 4 waits for Adrian.

Done:
- Rebuild stages 0–3 with gates 0, 2 and 3 (D-001–D-007); rebuild stage 1 has no gate.
- Rebuild stage 4: `## Vision`; `## Decisions` with the verbatim copy of gate 2 §2; `## Stages` (9 stages, tags a0.1.0–a1.0.0);
  `## Tickets` (R-001–R-086: every `fix` finding and every taste rule except T-17 is a source of a ticket); the
  16 gate-2 owner actions placed in `## Deployment`; `## Measurement` (M-01–M-13); `## Agents` with the two definitions
  in `.claude/agents/` and `tools/review-guard.mjs` with its test. `check.mjs` checks the plan (stages, tickets,
  sources, dependencies, seat steps, the copy of §2), the Polish summaries and, from stage 5, the ticket folders and
  `changes.md`. Cold read of the plan by a fresh subagent: `evidence/plan-cold-read.md`.

Gate 4: Adrian answered Q1–Q3 on 2026-11-17 (D-008–D-010, applied: the root deployment script R-012 in stage 1, which
absorbs D3; tickets R-012–R-059 of commit `cdf3e78` are R-013–R-060 now; the `changes.md` format; seat tools in
TypeScript). Acceptance of the plan and of the subagent definitions is pending.

Next: after Adrian accepts the plan and the definitions, rebuild stage 5 starts with plan stage 1 ("Cut") in a new
session, with R-001.

Open questions for Adrian: none beyond the acceptance of gate 4.

Notes for the next session:
- Start Claude Code in the repository root, so that it loads `.claude/agents/`.
- Progress lives in this section; the Claude Code task list mirrors the open steps when the tool is available.
- After moving or re-cloning the repo, run `sh adrian-rebuild/tools/install-hooks.sh` again.
- Run the gate as `sh adrian-rebuild/tools/gate.sh` (D-001). Before every commit run `node adrian-rebuild/tools/check.mjs`
  and `npx biome check --error-on-warnings adrian-rebuild`.
- Tracked files must not carry home or scratchpad paths; experiments live in the session scratchpad only.
- Adrian's gate-2 file lives only in `input/` (not tracked); everything in it is now copied into tracked files.
