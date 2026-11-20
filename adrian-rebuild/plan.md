<!-- PL: Plan przebudowy Limena i punkt wznowienia każdej sesji: wizja, słownik, decyzje Adriana (kopia §2 bramki 2,
D-008–D-032 z bramki 4 i po niej: wdrożenie po SHA, format changes.md, narzędzia seata w TypeScript, praca nocna,
wznowienie projektów po a0.3.0 jako ryzyko z terminem 21.11.2026, limit tygodniowy, akceptacja planu i definicji,
uprawnienia w settings.local.json, Claude Code instalowany przez roota, zapis narzędzi przez --out, nocny przebieg
tools/night.mjs, odpowiedzi na nocne pytania Q-1–Q-7: kryteria tylko w zakresie ticketu, nocą subagenci tylko na
pierwszym planie, ticket R-088, kod wyjścia tylko we wspólnym opakowaniu i R-013 po cięciach; A-087 w R-019 i zakaz
ponownego uruchamiania testu, który raz padł), fakty o silniku,
wymagania systemowe, 9 etapów z kosztem i efektem, 88 ticketów R-NNN, wdrożenie, pomiary, protokół subagentów
i polecenia na allow-listę. Stan: etap 5 (przebudowa) w toku, etap planu 1; R-001–R-006, R-008, R-010,
R-011 i R-088 zamknięte, 19.11 także R-007 i (nocą) R-009, R-012 i R-013; 18.11 w dzień doszły decyzje D-025–D-035
(m.in. zasady komunikacji z Adrianem, wyjątek dla testu A-087, przekazywanie sesji, poprawka helpera testów A-088
w R-007 i nowy snapshot po edycji w trakcie BLOCKED); w etapie 1 został R-014 (pair, w dzień), a `## State` ma gotowe
podsumowanie bramki 5.1; Q-8 rozstrzygnięte (D-036: `seat/deploy.ts` poza allow-listą); 19.11 w dzień D-037–D-044
(pytania R-014: tryb, `status --all`, `movedBy`, nagłówek modułów, teksty helpu, `group wait`, wymagane flagi trasy
`spawn`, trzecia runda poprawek) i R-014 zamknięty, więc etap 1 jest kompletny; 19.11 po południu etap 1 zamknięty
(bramka 244/244, M-10 77,1 s, lokalny tag a0.1.0); decyzje bramki 5.1 to D-045 i D-046 (zmiany linii końcowej,
odmów, runnera, skryptu wdrożenia i `kind`; tickety R-089 w etapie 2 oraz poprawkowe R-090 i R-091 w etapie 1, po
których tag a0.1.1 jest pierwszym wdrożeniem); R-090 zamknięty 19.11 (lista sprawdzonych rejestrów, odmowa bez
projektu, test nazw liczy tylko pliki znane gitowi); R-091 zamknięty 19.11 (oznaczenia typów Pi, odmowa bez
oznaczenia, koniec przebiegu na agent_settled, definicja touchpoints); D-047: narzędzie przekazania sesji
tools/handover.mjs (start nowej sesji w tmux i zamykanie poprzednich sesji przebudowy); 19.11 wieczorem
limen-rebuild-8 zamknęła etap 1 ponownie (bramka 253/253, M-10 82,2 s, lokalny tag a0.1.1, pierwsze wdrożenie);
D-048: B.2 tego samego wieczoru zamiast nocy, etap 2 w dzień 20.11; D-049 i D-050: B.2 zamknięte z K = 2
(seat check R-011 zaliczony, dwie ważne próby F013 bez kandydata, dwie unieważnione, raport w evidence/);
D-051: koordynatory używają /opt/limen; a0.1.1 wdrożony 20.11 (1.0–1.3 i próbna trasa 0.6 na ledgerze:
F009 i F010, land bez „land”); projekty stoją do a0.3.0 (D-012); przekazanie do limen-rebuild-9, które zaczyna
etap 2 w dzień; 20.11 D-052 (wyjątki zmiennych LIMEN_* i miejsca ustawień) i R-015 zamknięty (jeden moduł
konfiguracji src/config.ts, bramka 277/277); R-016 zamknięty (moduł granicy src/boundary.ts, zapadki JSON.parse
i rzutowań, bramka 310/310); otwarte pytania o pracę pod nieobecność Adriana 21–23.11. -->




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
- **Max window**: the 5-hour and the weekly usage limits of that one subscription, shared by every session on the seat
  and by the rebuild's sessions on Adrian's laptop.
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
- 2026-11-17 D-011 (gate 4, Adrian's additions before he accepts the plan): no delegated ticket depends, directly or
  through other tickets, on a pair ticket of its own stage, so the delegated tickets of every stage can run in a night
  run without Adrian, and the pair tickets run by day, before or after it (`## Tickets` → `Run`, checked by
  `check.mjs`). To get there, R-013 and R-014 move to stage 1, and R-067, R-069, R-070 and R-071 to stage 7; no ticket
  changes its scope, and none is merged. The arrangement exposed two missing dependencies, now in the table: R-067 on
  R-069 (the label's round, T-24) and R-081 on R-082–R-086 (docs from the final code, A-084). The plan also states the cost and the effect of each stage, the earliest
  stage after which the projects can resume on the seat, and the commands each stage needs for the allow-list in the
  repo's `.claude/settings.json`. The night mode itself (questions in `adrian-rebuild/questions.md` instead of a stop,
  hard exits, resume after a limit) is Adrian's addition to the rebuild prompt before rebuild stage 5.
- 2026-11-17 D-012 (gate 4, Q4): the projects resume on the seat after a0.3.0. Until a0.5.0 the risks that stage 5
  closes stay open (the agents' account holds the GitHub token and has an open network; harness code loads from
  worker-writable places; GitHub text and worker-writable files reach the coordinator; A-006, A-007, A-009, A-025,
  A-028): `accepted-risk` with a deadline. If a0.5.0 is not deployed by 2026-11-21 (Adrian, gate 4), Adrian
  takes the decision again (z. 26). What narrows the risk: T1 of A-004 (the job environment as an allow-list;
  git and gh in a job without a credential) moves to stage 3 as R-087, split from R-048 without a change of scope;
  before the projects resume, a GitHub ruleset on `main` of both projects forbids force pushes and deletion (part of
  §7 D1, step 3.11); the seat's GitHub token is fine-grained, with Contents read and write on `synchronizer` and
  `ledger` only (Adrian, 2026-11-17).
- 2026-11-17 D-013 (gate 4, Q5): at the weekly limit, until a0.5.0 the projects yield, which shortens the risk window
  of D-012; from a0.5.0 the rebuild yields. The threshold is manual, at about 80 % of the weekly usage.
- 2026-11-17 D-014 (gate 4): Adrian accepts the plan after two corrections: `### Resuming the projects on the seat`
  states the land rule of stages 3–6, and files are deleted and moved with `git rm` and `git mv`, so the allow-list of
  `## Commands` does not change every night. He accepts the subagent definitions separately, after reading them in
  full.
- 2026-11-17 D-015 (gate 4): Adrian accepts the subagent definitions after these corrections, each guaranteed by a tool
  with a test (z. 14). Implementer: HEAD and refs stay unchanged, and the index holds only deletions and moves of the
  paths the ticket's `## Change` names (`review-guard.mjs compare --git`, which also compares git's config and hooks,
  `input/` and the reserved paths: `plan.md`, `changes.md`, `audit.md`, `taste.md`, every `ticket.md` and
  `review.md`, `.claude/agents/`, and `tools/` beyond the paths `## Change` names; a violation voids the work); it
  reads `taste.md` → Part B in full (A-085); network only as the stage's allow-list permits. Reviewer: the main
  session's `fails-before.mjs` shows that new and changed tests fail at HEAD (a copy of HEAD from `git archive` with
  the tests laid over it), and the reviewer judges only whether a test checks its mechanism and fails for one reason;
  it answers the reviewer questions in the `Check` of every rule the diff touches (A-085); `review-verdict.mjs`
  rejects a reply whose verdict is inconsistent, and the review runs again (AU-126); it runs single tests, never the
  full gate. The gate itself moves from `gate.sh` to `node adrian-rebuild/tools/gate.mjs` with the same behaviour
  (D-001's command changes; no shell where Node does, D-010). Checks: `tools/test-review-guard.mjs`,
  `tools/test-fails-before.mjs`, `tools/test-review-verdict.mjs`.
- 2026-11-17 D-016 (Adrian, after gate 4): the permissions of rebuild stage 5 live in `.claude/settings.local.json`,
  untracked and excluded in `.git/info/exclude`, not in `.claude/settings.json`: per the Claude Code docs, `claude -p`
  does not apply the allow rules of a project's `.claude/settings.json` in a folder without trust, but it applies the
  untracked `settings.local.json`. The file sets `disableBypassPermissionsMode` to `disable`; its allow rules follow
  `## Commands` → "Every stage" (a push only as `git push origin adrian-rebuild`), its deny rules the "never" list
  there, plus Edit on `.claude/**` and `adrian-rebuild/input/**`. Adrian writes the file and adds the commands of R-011
  and R-017 after their `outcome.md`, and the stage-2 commands at the start of stage 2. Requirements: (1)
  `tools/night.mjs` runs `claude -p` with `--permission-mode dontAsk`, so a command off the list is refused and a write
  to a protected path is denied, whatever the mode would otherwise do; (2) every part of a compound command (`&&`, `;`,
  `|`) must match a rule, so no `cd` and no uncovered command in a pipe; (3) a variable assignment before a command
  (e.g. `TMPDIR=… node …`) breaks the match of an allow rule, so the tools set their environment themselves. The file
  joins the implementer's reserved paths, and `review-guard.mjs` checks its digest in both modes (with
  `.git/info/`).
- 2026-11-17 D-017 (Adrian; extends A-025): today the bridge runs Claude Code from the agents' home directory, which the
  agents can write and which updates itself. Instead, root installs Claude Code in a root directory in a pinned
  version, and only the seat script updates it, after the type contract (T-32, AU-220) and the bridge contract (T-31,
  AU-225) pass (z. 18). The version is a system requirement (T-12, AU-214, `## System requirements`); a mismatch
  exits with code 4 at coordinator start and at spawn. The bridge gets the explicit path to that binary.
  `DISABLE_UPDATES=1` is set in the environment of the coordinator and of every job, but the boundary is the file's
  owner (z. 14). The copy in the agents' directory is removed after the migration. Tickets: R-049 (install, version,
  refusal), R-048 (explicit path), R-087 (`DISABLE_UPDATES` in the job allow-list), R-050 (the start script sets it for
  the coordinator); steps 3.10, 5.3, 5.9 and 5.20.
- 2026-11-17 D-018 (Adrian, Q7): the tools of `tools/` that wrote their result through `>` take `--out <file>` and
  write it atomically, as in A-022 (`atomic-write.mjs`: a temporary file, fsync, rename, fsync of the directory, the
  directory created); stdout stays for the result. Reason: per the Claude Code docs the target of a `>` is checked on
  its own against the Edit rules (with `Edit(/**)` a write to `node_modules/.rebuild-review/` would pass), but that
  analysis changes between versions, so the protocol must not rely on it; it uses no `>` in the guard's commands.
  `context-size.mjs` and `spec-index.mjs`, which write their files themselves, use the same atomic write. Checks: a
  scan in `check.mjs` (no `>` in a command of a `tools/` tool in `## Agents`, `## Commands` and the subagent
  definitions); the `--out` tests in `tools/test-review-guard.mjs`. The scan exposed that `check.mjs` read `## Agents`
  only up to the template's first `## ` line inside a code block; `section()` now skips headings inside code fences.
- 2026-11-17 D-019 (Adrian, before the first night run; the night mode of the rebuild prompt v6 and D-016 (1)): the
  night runner `tools/night.mjs` and a supplement to the night mode. Specification and review:
  `evidence/night-runner/`.
  - Adrian starts `node adrian-rebuild/tools/night.mjs --until HH:MM` in a terminal; no session runs it, and it is not
    on the allow-list. `--until` is local time: the end is the next HH:MM, and an HH:MM more than 18 hours ahead counts
    as passed (it was at most 6 hours ago; Adrian, 2026-11-17).
  - Before the first run it refuses with exit 1: no or a passed `--until`; `input/prompt.md` lacks the first message
    word for word (the constant `FIRST_MESSAGE` in `night.mjs`); the `claude` command is not an executable file; a
    live runner holds `.night/lock`. The lock holds the pid, the process start time and the boot id; any mismatch
    makes it abandoned, and it is taken over (A-017).
  - Each run: `claude -p "<first message> Tryb nocny do HH:MM." --permission-mode dontAsk --output-format json` from
    the repository root, stdin on `/dev/null`, stdout and stderr appended to `.night/<date>-run-<n>.log`, never
    `--dangerously-skip-permissions`.
  - The end is decided by one field (z. 2). Before it ends, a night session writes `adrian-rebuild/.night/status.json`
    with the Write tool as `{"reason": "<reason>"}`, the reason one of `done`, `no-ticket`, `failed-twice`, `end-time`
    and `dirty-tree`. The time of the status is the file's modification time, which the kernel sets: no session has a
    clock command (`date` is not on the allow-list), so a time written by the model would be a guess (z. 14). A known
    reason in a file modified after the run started ends the night with exit 0. Otherwise the runner retries after 30,
    then 60, then 120 minutes, at most 3 retries a night, and never starts a run at or after the end; a night that ends
    without a reason exits 3 with a line in the last run's log. A failure of the runner itself exits 4, so that a crash
    never reads as a refusal.
  - The runner runs no git command and writes nothing outside `adrian-rebuild/.night/`, which `.gitignore` excludes.
  - Supplement to the night mode (Adrian): a run resumed after an interruption in the middle of a ticket finds
    uncommitted changes. The session then continues the ticket that `## State` names, from the step where it stopped
    (the gate, the review), and never reverts work silently. When it cannot tell which ticket the changes belong to, it
    writes an entry in `.night/questions.md` and ends with the reason `dirty-tree`. The questions file is
    `adrian-rebuild/.night/questions.md`, as in the prompt; D-011's `adrian-rebuild/questions.md` names the same file.
  - Check: `node --test adrian-rebuild/tools/test-night.mjs` (a fake `claude` and an artificial clock, no real wait).
- 2026-11-18 D-020 (Adrian, night question Q-1): R-001 depends on R-010. The 3,500-line cap of `test/`, which R-010
  removes (T-11), left one line, so R-001's tests could not pass the gate before R-010. It is an exposed dependency,
  like R-067 on R-069 in D-011; no ticket changes its scope. R-010 is done, so R-001 runs as written.
- 2026-11-18 D-021 (Adrian, night question Q-2; changes R-011 and the same-task method of `## Measurement`): one
  same-task attempt is a whole coordinator session, not one worker job.
  - The runner starts the tested Limen's coordinator headless through Pi's RPC mode, sends one fixed owner message
    (Q-2's proposal: "Implement <ticket>; decide engineering questions yourself") and answers every question
    addressed to the owner with the fixed reply "Decide this yourself; I am not available." The attempt ends when the
    coordinator is idle with no running job, or at the time limit; the reference tests and the project gate then run
    on the tip of the newest `done` worker job, and M-05 is counted from the coordinator's session file.
  - (1) Every question addressed to the owner counts as a touchpoint (T-40, z. 37), also when it gets the fixed reply.
    In the "after" version an escalation is the final result `escalated`, which only the owner channel closes (T-05
    (3)).
  - (2) The time limit of an attempt is 1.5 times the candidate ticket's real time from the M1 records, at least 3
    hours, the same for both versions; Adrian gives the time from the records in step B.2.
  - (3) An attempt interrupted by the subscription limit is void and runs again; it does not count as a failure
    (`rebuild-base` has no resume after a limit; that mechanism has its own test, gate 2 §2).
  - (4) The attempt runs in a clean copy of the project without `origin` (at `rebuild-base` jobs hold the GitHub
    credential, A-004). The hidden tests of the merged M1 change stay out of the agents' reach and are laid over only
    after the attempt. The final state is evaluated by: the tests, landed or not, rounds, tokens by class, time, and
    owner touchpoints.
  - Plan changes: R-011 becomes size L with API `pi`, and B.2 starts with its seat check (the headless coordinator
    loads Limen's hooks and receives a wake).
- 2026-11-18 D-022 (Adrian, night question Q-3; taste, added to T-37): the final JSON line gets an optional field
  `ids` with the identifiers of what the command created or changed, and no data (AU-210 stays: the full data come
  from the records). `spawn` ends with `{"class":"ok","code":0,"next":"End your turn; Limen wakes you when the job
  ends.","ids":{"job":"<full id>"}}`; the token of AU-211 is the last 8 characters of the id, with no field of its
  own. Every command declares its `ids` keys in the registry (T-19): `job`, `ticket` (FNNN), `question` (Q-NNN). The
  poller and the other processes that call the CLI read `ids` only through the client function (AU-217); an id is not
  part of `next` or of a text line as a contract (z. 2). The text for people gives the label and the token. Check: a
  test of the client function that returns `ids.job` after `spawn`; a test that every command returns only the `ids`
  keys its registry entry declares, with values in the format of a job id, FNNN or Q-NNN; a golden test of `spawn`'s
  final line. R-013 builds the field with the final line; the declaration of the keys is part of the registry (R-014,
  T-19).
- 2026-11-18 D-023 (Adrian): R-008 leaves the LaunchAgent installer (`limen sweep --install`, `--uninstall`) to
  R-032, which replaces it with the systemd installer, as the night run proposed (R-008 → `ticket.md` →
  `## Decisions`).
- 2026-11-18 D-024 (Adrian; amends D-019): the main session may start the night runner when Adrian asks for it in the
  conversation, never on its own. Before the start it shows the runner's tests, the reviewer's verdict, the pushed SHA
  and a clean tree, and checks that a new `claude -p` session lists both subagent definitions. It runs `mkdir -p
  adrian-rebuild/.night` and `nohup node adrian-rebuild/tools/night.mjs --until HH:MM` with stdout and stderr to
  `adrian-rebuild/.night/launcher.log`, in the background; from then on it changes nothing in the repository until
  Adrian writes, and on "sprawdź" it only reads the runner's processes, logs and `status.json`. First used on
  2026-11-17 at 22:09.
- 2026-11-18 D-025 (Adrian, night question Q-4; the shape of acceptance criteria): a criterion checks only the
  ticket's scope; a global property is closed by the ticket that makes it true. R-001's AC-6 becomes `git grep -q
  '"templates/agents.md"' -- <the paths of R-001's ## Change>` → exit 1 (no match); the full check `git grep -q
  '"templates/agents.md"' -- src hook` → exit 1 joins R-040's criteria, because R-040 removes
  `hook/communication.ts:307`. The expected result is an exit code, with no `!` before the command (the rules of the
  allow-list, D-016). Rejected: excluding a file (it would hide a new reference) and expecting a given line (it moves
  with an edit). Every criterion of stage 1 is checked the same way: a global grep or scan that only a subsequent ticket
  makes true moves to that ticket (`## Tickets` → notes; the R-013 scan of D-028 is closed by R-013's dependency on
  the cuts). Check: `check.mjs` rejects a criterion whose command starts with `!`; when the main session writes
  `ticket.md` (protocol step 2), it runs every grep and scan criterion at HEAD and confines it to the paths of
  `## Change` unless every match it finds is one the ticket removes.
- 2026-11-18 D-026 (Adrian, night question Q-5; changes the night mode and `## Agents`): in a night run subagents run
  only in the foreground.
  - (1) `night.mjs` sets `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1` in the environment of `claude -p` (per the Claude
    Code docs, Claude then waits for every subagent; it also disables background commands, which a night run should
    not have). The variable is not in `.claude/settings.local.json`, so that by day background work runs as before.
  - (2) No resumption through `SendMessage` at night (a resumed subagent works in the background): a fix round is a
    fresh foreground `rebuild-implementer` with the paths of `ticket.md` and `review.md` (z. 19); by day `SendMessage`
    stays.
  - (3) No command stands in for waiting. When waiting is impossible, the session updates `## State` and ends with the
    reason `cannot-wait` in `status.json` (Adrian, a follow-up of the same day), which `night.mjs` accepts as a known
    reason.
  - (4) The morning summary gives the main session's tool calls per ticket. `night.mjs` counts them (Adrian, a
    follow-up of the same day): a run uses `--output-format stream-json --verbose`, and after the run the runner
    appends to its log one line per commit with the number of the main session's tool calls (events without a parent
    tool call) since the previous commit, and the commit's subject; calls after the last commit form one more line.
    The day session copies the lines into `## State`. The stream's format is the one of the Claude Code docs; the
    first night run with it confirms it.
  - Check: `tools/test-night.mjs` asserts that the environment of `claude -p` holds
    `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1`, that `.claude/settings.local.json` and `.claude/settings.json` do not,
    that `cannot-wait` ends the night with exit 0, and the count per commit on a fake stream.
- 2026-11-18 D-027 (Adrian, night question Q-6): the four round-3 notes of R-011's review get a fix ticket before B.2:
  R-088, stage 1, size S, by day: `pair`, so it runs in a day session and never in a night run; its `Run` is
  `day-after` because it depends on R-011, a `night` ticket of stage 1 that is done.
- 2026-11-18 D-028 (Adrian, night question Q-7; changes R-013 and adds to T-02): only the shared wrapper sets the exit
  code and prints the final line; a command returns its result or throws an error with its type and class (T-01, T-03,
  AU-209). `process.exitCode` and `process.exit` appear only in the wrapper and in the entry point `bin/limen` (a
  scan).
  - Classes: `ticket check` and `picture build --strict` with problems found are a refusal (1) with the list in the
    text and the fix in `next`; `github poll` by its cause (the network 3; a missing configuration or credential 4);
    `webhook test` is cut by R-002 before R-013, so R-013 leaves it alone.
  - `group wait`: in R-013 its time limit rejects the operation with a typed error through the wrapper, with no
    `process.exit` from a timer; the command itself is cut by the registry ticket (R-014; T-19 names `group start`,
    `status`, `stop` and `land`, and `wait` is rejected).
  - `ids.job` also for `github review` and `github work` (the rule of D-022). `docs/jobs.md:96` and
    `docs/seat/agent-setup.md:254` change in R-013 when they describe the output contract it changes.
  - Order (Adrian, a follow-up of the same day): R-013 depends on every cut of stage 1 (R-002–R-007, R-009), so it
    reworks no code that a cut removes (`webhook test` and `bin/tony-finish-ping.sh` in R-002, `picture tick` with
    `src/project/picture-tick.ts:134` in R-007, the hosted tests in R-005), and its `process.exit` scan holds over
    `src`, `hook` and `bin` at its own commit (D-025).
  - Check: the scan for `process.exitCode` and `process.exit` outside the wrapper and `bin/limen`; a refusal test for
    each reworked command (the code, the class and `next` in the final line); a test that `group wait`'s time limit
    gives exactly one final line with its code.
- 2026-11-18 D-029 (Adrian, after R-001's gate runs; adds A-087 and changes `## Agents`):
  - A-087 (`audit.md`): seat registrations vanish when processes take over an abandoned registry lock together; high,
    decision fix. The fix belongs to the ticket of the shared lock module (A-018), R-019, which is still open: the
    takeover renames the dead lock to a unique name (exactly one process wins), then creates the new lock with `wx`;
    the registry is a read, change and write under the lock through `atomicWrite` (A-022). A deterministic test uses
    an injection point in the lock module between "found dead" and "taken over", forces the interleaving of two
    processes and fails before the fix every time; `test/s9-housekeeping.test.ts:135` stays.
  - A test that failed even once without a change of the code it runs is a finding; nobody runs it again to get a
    green gate (z. 17). By day the main session asks Adrian; at night it writes a question in `.night/questions.md`
    and the ticket waits (`## Agents`, protocol step 4). The same rule goes into the definition of
    `rebuild-implementer`; the rebuild sessions cannot write `.claude/**`, so Adrian adds it there.
  - Check: the interleaving test (fails before, passes after); a registry test with 41 concurrent registrations and a
    dead lock owner → 41 entries; `check.mjs`: A-087 has every field and a ticket.
- 2026-11-18 D-030 (Adrian; how the day session talks to him, amends the rebuild prompt's use of `AskUserQuestion`):
  (1) a message that needs Adrian's action carries everything the action needs (the exact text, the file and the place
  in it, the command), never a pointer to an earlier message; (2) a decision is asked in a plain message (one matter,
  the options, the recommendation with its reason, what counts as a full answer), never through `AskUserQuestion`.
  Night runs keep their questions in `.night/questions.md`. Check: none.
- 2026-11-18 D-031 (Adrian; an exception to D-029 until R-019): when the gate fails only on the lock-contention test
  of A-087 (`test/s9-housekeeping.test.ts:135`), the main session records the failure in the ticket's `outcome.md` as
  an occurrence of A-087 (the gate's output line and the count it reports) and runs the gate once more; any other
  failure, or a second failure of that test in the same ticket, follows D-029. The failure already has a finding, a
  decision and a ticket, so the run hides nothing, and the records give R-019 the rate. R-019's commit removes the
  exception from `## Agents`. Check: none (the outcome records each occurrence).
- 2026-11-18 D-032 (Adrian): editor swap files (`.*.swp`) are ignored by `.gitignore`, so an open editor in
  `adrian-rebuild/` no longer fails `check.mjs` (which reads untracked files with `--exclude-standard`) or the review
  guard. Added in R-002's commit. Check: none.
- 2026-11-18 D-033 (Adrian; the handover of a day session): at a safe point (a ticket committed and pushed, no
  subagent running, a clean tree, `## State` current) and with the context window 30–50 % used, the day session hands
  over to a new interactive session in remote-control mode started with the first message of the rebuild prompt, and
  ends; 50 % is a hard limit, at which it hands over even mid-ticket (after a running subagent returns, with the
  active ticket and its step in `## State`). The new session's first act is a push notification to Adrian that it
  takes over. Facts behind it (the Claude Code docs, 2026-11-18): the model cannot read its context share by itself,
  so Adrian's status line script writes it to a file outside the repository that the session reads; a remote-control
  session needs a terminal, so it is started in `tmux`; a push reaches the phone only with Remote Control connected
  and "Push when Claude decides" on; the old session ends through EndConversation only when Adrian confirms at that
  moment, otherwise he closes it. Check: none.
- 2026-11-18 D-034 (Adrian, R-007's `BLOCKED`; adds A-088 and widens R-007): `test/s6-keeper.test.ts` ("keeper
  refuses a running job, then starts on a new branch at the candidate tip") failed once in R-007's implementer run
  before any source change; read from the code, `waitJob` (`test/plant.ts`, rewritten in R-006) returns at a terminal
  `state` while the wrapper still holds `pid` and `born`, and the keeper refuses a job whose owner is alive. A-088
  (`audit.md`), medium, decision fix in R-007, as an explicit addition to its scope (the main session's option c,
  recommended over a ticket of its own first, which would need R-007's tests set aside, and over the D-031 allowance):
  `waitJob` waits, with a bound, for a terminal `state` and for `pid` and `born` to be gone. Check: a test of the
  helper that fails before the fix every time; R-007's gate.
  - Corrected the same day (Adrian's second answer, option 1): the failure was not the race. The implementer had
    run the test outside the gate's environment, where the laptop's git 2.34.1 lacks `git worktree list --porcelain
    -z` and only the gate's shim supplies it (D-001); it fails so every time outside the gate, at `a5767dd` too, so
    D-029 did not apply. The window itself is in the code (`finalizeJob` writes `state` before it removes `pid`), so
    A-088 stays, low, with the evidence from the code, and `waitJob` waits for a terminal `state` and for `pid` alone
    to be gone: `recordBorn` reads `state` and then writes `born`, so a wait for `born` could hang until its bound.
    The lesson for the protocol: a test run outside `gate.mjs` on this laptop is not evidence of a failure.
- 2026-11-18 D-035 (Adrian, R-007; changes `## Agents`, step 3): `compare --git` voided R-007's implementer run
  because the main session had changed three reserved paths (`plan.md`, `audit.md`, R-007's `ticket.md`) while the
  implementer stood at `BLOCKED`, after the snapshot; HEAD, the refs, the index, git's config and hooks were
  unchanged, and the diffs of the two tracked files hold only the main session's entries. Adrian accepted the run.
  Rule: when the main session changes a reserved path while the implementer waits on `BLOCKED`, it takes a new
  `snapshot --git` before it resumes the implementer, so `compare --git` sees only the implementer's changes.
  Check: none (protocol).
- 2026-11-19 D-036 (Adrian, night question Q-8; changes `## Agents`, step 2): `node seat/deploy.ts <args>` stays off
  the allow-list. The script runs only as root on the seat, and a run with a real SHA would check out a commit in the
  laptop's own repository; on the laptop it is checked through `node --test` on fixtures, which is on the list. A
  ticket's criterion names only commands on the list of `## Commands`; the main session checks that when it writes
  `## Acceptance`. R-012's AC-6 stays judged by its test 11, which runs exactly that command (R-017, R-032 and R-056
  check their additions to the script the same way). Check: none (protocol).
- 2026-11-19 D-037 (Adrian, R-014 Q1; changes R-014's mode): R-014 is split by its nature. Its taste part (the golden
  help texts, the names, the parser's messages) is settled in `pair` and written into its `ticket.md`; the
  implementation, which is checkable by commands once those texts are fixed, is done by `rebuild-implementer` and
  reviewed as usual. The row keeps `pair` and `day-after`, because the ticket runs by day with Adrian. Check: none
  (protocol).
- 2026-11-19 D-038 (Adrian, R-014 Q2; taste, T-18 conflict (3)): `limen status --all` prints today's summary without
  the 7-day window and, under it, one row per job (the rows of today's `limen jobs`). Old forms exit with code 2:
  `limen jobs <ref>` names `limen show <ref>` in `next`, every other form of `limen jobs` names `limen status --all`.
  Check: R-014's migration tests.
- 2026-11-19 D-039 (Adrian, R-014 Q3; amends the accepted plan): a command that a subsequent ticket moves or cuts (`close`
  R-037, `keeper` R-066, `sweep` and `prune` R-032, `rule` R-034) stays under today's name in the help group of what it
  acts on now, with a line that can be copied and run. Its registry entry carries `movedBy: "R-0NN"`, which the help
  does not show. R-014's tests: a top-level command acts on `job`, `owner` or `project` unless its entry has `movedBy`,
  and the entries with `movedBy` are exactly those of this list (so `rule` is covered whichever group shows it). Each
  of R-032, R-034, R-037 and R-066 gets the criterion "the registry holds no entry with `movedBy` naming this ticket"
  (`## Tickets` → notes). The last of them, R-066 (it depends on the other three through R-065), removes the field
  and the exception, and the test becomes the plain rule: a top-level command acts only on `job`, `owner` or
  `project`. Check: R-014's registry tests; the four criteria.
- 2026-11-19 D-040 (Adrian, R-014 Q4; taste, until R-044): until module switches exist, the help's modules header says
  only what is true now: "Modules", with no state marker. R-044 gets the criterion: the modules header has the text of
  T-19 and each module line's `[on]` or `[off]` is built from that module's switch (`## Tickets` → notes). Check:
  R-014's golden help; R-044's criterion.
- 2026-11-19 D-041 (Adrian, R-014 Q5; taste, the texts of the help): variant A with corrections. (1) The help line
  about the final JSON line is built from the key list of `src/outcome.ts` that the wrapper uses, so it names `ids`.
  (2) The example of `limen land --help` is `limen land a1b2c3d4` (a suffix today, the token of AU-211 after R-022);
  every example in the registry goes through the real parser in a test. (3) R-014's `## Acceptance` has the judgment
  "every help line describes behaviour present in this commit". (4) A parser error carries the command's usage line
  from the registry in its message, and `next` stays `limen <command> --help`. (5) `--help` works for internal
  commands too; the internal section of `docs/commands.md` is generated from the registry, with the staleness test of
  A-084. (6) The kind is not shown by `limen <command> --help` until read commands write nothing (T-04, R-032):
  "(change)" was not named, and "read" would be false while `status` reaps. (7) The Jobs header does not say every
  command takes an id (`--running`, `--all`); the general line and `limen <command> --help` come from the same schema,
  so they show the same flags; `--drop-leftovers` is described by its files. The advice to the coordinator at the end
  of today's help goes (the `spawn` line says the same). Check: R-014's golden tests and its judgment.
- 2026-11-19 D-042 (Adrian, R-014's question on `group wait`; amends D-028 and D-039): `group wait` stays, as an
  internal command for team members with a worker allowance, because a member is itself a job, whose job ends with its
  turn, so it keeps its turn open with `group wait` while its workers run (`templates/group-member.md:5`,
  `docs/groups.md:69`); cutting it would break groups with `--workers N`. Its entry carries `movedBy: "R-077"`. It
  refuses a caller outside a team (the lead, with the group id) with a typed refusal and a message; this is a guard
  against mistakes, keyed on the job's environment, not a security boundary, and the code and `docs/groups.md` say so
  (A-029). R-077's criteria do not check only the removal: the cause stays after R-077, so they also check that a team
  member with a worker allowance gets its workers' results without `group wait` (`## Tickets` → notes). Consequence for
  D-039 (the main session's resolution, for Adrian to confirm): R-077 does not depend on R-066, so R-066 cannot be the
  last ticket with a `movedBy` entry; instead R-014's test fails once no entry has `movedBy` any more, with the message
  to remove the field and the exception, so whichever ticket removes the last entry also removes the field (Adrian
  confirmed this resolution on 2026-11-19). Check: R-014's registry and group tests; R-077's criteria.
- 2026-11-19 D-043 (Adrian, R-014's `BLOCKED` on two golden lines; changes R-014's golden text and `spawn`): (1)
  `spawn` requires `--engine`, `--provider`, `--model` and `--thinking`; a spawn without one of them exits 2, and the
  refusal names every missing flag. The basis is A-030 (a missing field refuses, and the fallback model is cut) and
  the author's intent #2 of gate 2 §5 ("never swap a model"), with Adrian's agreement. Today the engine falls back to
  `LIMEN_ENGINE` or `pi` (`src/runtime/engine.ts:48-54`) and the model to `defaultModel` (`src/commands/spawn.ts:169`);
  whether the coordinator on the seat passes all four is unknown, because its manual sits in the system prompt that
  does not reach the model under the bridge (A-086). `continue` keeps `model ?? defaultModel` until R-062. (2) The
  line of `ticket done` shows its flag: `limen ticket done <FNNN> … [--on <date>]`. Adrian accepts the implementer's
  technical choices listed in `R-014-command-registry/ticket.md` → `## Decisions`. Check: R-014's parser and help tests.
- 2026-11-19 D-044 (Adrian, R-014's review round 3; an exception to `## Agents`, step 6, for R-014 only): a third
  round of fixes for round 3's notes 2–5. Review round 4 checks only those notes and the absence of regressions; a new
  non-blocking note means the commit, and the note goes to the ticket that option (b) named (the refusal wording to
  gate 5.1, the docs to R-081, the scan of words outside the parser to R-023, the help to R-085); a new blocking note
  goes to Adrian; there is no fifth round. The fix of note 5 has a test that fails before it (the static scan stays
  in R-023). Note 1: the shared parser's strict rule stays (a value flag given twice exits 2), `continue --label`
  included, which closes note 2 without a "last wins" exception; `outcome.md` records it as a departure from Change 2.
  Check: R-014's parser and old-name tests.
- 2026-11-19 D-045 (Adrian, gate 5.1; amends D-022 and D-028): (1) Go on to stage 2, with no `a0.1.1`. (2) Every
  stderr line of a refusal stays as it is. A refusal with no successor has `"next": null` in its final line, and its
  sentence stays on stderr; the type of R-013 admits `null`, and the help line that shows the final line's shape
  follows the type. The `jobs` defect (R-014 review round 4, note 1) goes to R-023 by D-044, with the criterion "a
  flag present names `limen status --all`; only `limen jobs <ref>` names `limen show <ref>`" and one more: every
  non-empty `next` of a refusal passes the shared parser and is not itself a usage error. Adrian's "six refusals with
  no successor" took the main session's count, which was wrong: 16 of the 20 refusal lines carry a sentence or a
  placeholder in `next`, so which of them get `null` is open (asked in the gate reply of 2026-11-19). (3) R-011's
  choices are accepted with two additions, unless already done: (3.2) an RPC message outside the declared subset ends
  the attempt with an error and records the raw message instead of passing it on; (3.4) the attempt's report states
  the definition ("touchpoints = answered owner turns; questions asked while a job runs are not counted") and keeps
  the coordinator session's transcript. At `ed7f06e` 3.2 is not done (`adrian-rebuild/tools/pi-rpc.mjs` passes every
  other object on); of 3.4 the transcript is kept (Pi's session file in `<out>/session/`) and the definition is not
  stated. (4) R-012's choices are accepted with one condition, unless already true: zero registries found, or a home
  whose registry cannot be read, refuses instead of assuming that nothing runs, and the script prints the registries
  and projects it checked. At `ed7f06e` both refusals hold (exit 4, `seat/deploy.ts` → `registeredRoots`,
  `optionalText`); the listing does not. (5) R-013's codes, changed: (5.1) `next` is the command alone with concrete
  values (the branch, the group id), never a placeholder, and the prose ("fix the … listed above") goes to the stderr
  line; every non-empty `next` passes the parser. (5.2) `GITHUB_NETWORK`: `next` is the same command, because `limen
  github doctor` checks only local settings, which are fine on a 429 or a 5xx; the limit's reset time, when GitHub
  gives one, goes to stderr. (5.3) `group wait`'s time limit stays exit 0, an explicit `--timeout` included, and `next`
  is `limen group wait` in the form it was called: it is a team member's normal loop, kept until R-077 (amends D-028).
  (5.4) `UNTYPED` is class `refused`, exit 1, as today; `code` on success is `null` instead of `0` (amends D-022), so
  that the field has one type. (6) R-014's `kind`, changed: (6.1) `rule` is `change`, since its entry covers `set` and
  `end`, which write; (6.2) `status` and `show` are `change` while they reap dead jobs, and R-032 makes them `read`;
  (6.3) a test: every `read` command run on a test project leaves the project's files and `.limen/` unchanged, and
  after R-032 it passes for `status` and `show`. Open: the `null` list of (2) and the tickets that carry (2)–(6)
  (asked in the gate reply of 2026-11-19; settled by D-046). Check: the criteria of those tickets.
- 2026-11-19 D-046 (Adrian, the two open points of D-045; amends D-022 and D-045 (1)): (1) The `null` list, variant
  (a) of the gate reply: a refusal's `next` is a Limen command only when its successor is a fixed command or is built
  from identifiers of the call (a job, a branch, a group id); otherwise it is `null`, and the sentence stays on
  stderr. So `picture tick` names `limen picture build`, `picture watch` names `limen status`, `group status --json`
  names `limen group status` (with the group id when one was given), `queue` names `limen seat queue`, `jobs`
  follows D-045 (2) in R-023, and every other refusal of `src/old-names.ts` has `null`. (2) Every `next: ""` becomes
  `null`: a success with no next step, `UNTYPED`, `INTERNAL`. (3) The sentence of a successful `spawn` (D-022: "End
  your turn; Limen wakes you when the job ends.") moves to the text line before the final line, with `next: null`; its
  wording stays. So `next` is always a Limen command or `null`, and the parser test covers every `next`, not only
  those of failures. (4) The placement, with changes. R-089 (stage 2) carries D-045 (2) and (5) and items (1)–(3)
  here; R-023 the `jobs` defect and its criteria (D-045 (2)); R-025 D-045 (6.1)–(6.3); R-032 the criterion that
  `status` and `show` are `read` and pass the test of D-045 (6.3). R-090 and R-091 are fix tickets of stage 1
  (amends D-045 (1)), so the first deployment is the tag `a0.1.1` on their last commit, not `a0.1.0`. R-090 carries
  D-045 (4), and a registry that holds no project refuses too: that is the gap of §7 D3, and the condition is one
  line. R-091 carries D-045 (3): each event type of Pi 1.5.1's list (from the package sources of `## Commands`, stage
  2 row) is marked in the code as handled or skipped; a type on which Pi waits for an answer (such as an extension's
  request for one) is never skipped; a type with no mark ends the attempt with an error that records the raw event.
  B.2 runs with R-091's runner, and the deployment of `a0.1.1` waits for B.2 and R-090. (5) Confirmed for R-089:
  `group wait` past its limit, an explicit `--timeout` included, exits 0 with class `ok`, `code` `null` and `next`
  the `limen group wait` call as it was made, so the code `GROUP_WAIT_TIMEOUT` leaves the final line and the text line
  says that the limit passed; the code `TICKET_CHECK_FAILED` is already spelled so (`src/commands/ticket.ts:133`), and
  nothing changes there. Check: the criteria of R-089, R-090, R-091, R-023, R-025 and R-032.
- 2026-11-19 D-047 (Adrian, the handover; amends D-033): the handover closes the previous session by a tool, not by
  prose or by hand. `node adrian-rebuild/tools/handover.mjs start <n>` starts `limen-rebuild-<n>` in `tmux` with the
  first message of the rebuild prompt (`FIRST_MESSAGE` of `night.mjs`), without the variables Claude Code sets for
  its Bash tool, and checks that it still exists after 2 s; `node adrian-rebuild/tools/handover.mjs close-previous`,
  the new session's first command after its push notification, closes every older rebuild session: each `tmux`
  session `limen-rebuild-<digits>` in the repository whose panes all started before the caller's own session and
  none of which runs the caller, and each `claude` process in the repository that started before the caller's own
  session and is not its ancestor, so a process the session started, being younger, is kept (SIGTERM; a process
  alive 5 s after the signal is named, exit 1). Both refuse unless the branch is `adrian-rebuild`, the tree is
  clean and `HEAD` is `origin/adrian-rebuild`. The old session no longer ends itself: `EndConversation` ended `limen-rebuild-6`'s
  conversation but not its process, and a conversation resumed with `claude -r` while its first process lived ran in
  two processes (both on 2026-11-19). Any older `claude` in the repository counts as a previous session. Adrian put
  `Bash(node adrian-rebuild/tools/handover.mjs *)` on the allow-list. Spec, review and outcome:
  `evidence/handover/`. Check: `node --test adrian-rebuild/tools/test-handover.mjs`.
- 2026-11-19 D-048 (Adrian, after the close of a0.1.1): B.2 runs at once, on the evening of 2026-11-19, guided step
  by step by the main session, instead of a night run of stage 2, because the deployment of `a0.1.1` waits for B.2
  (D-046) and B.2 must not share the Max window with a rebuild run (a void attempt at a limit runs again, D-021 (3)).
  Stage 2 starts by day on 2026-11-20 in `limen-rebuild-9`. Check: `## State` → B.2.
- 2026-11-19 D-049 (Adrian, B.2's count; keeps D-021): an attempt with no job has no candidate, and an attempt with no
  candidate does not pass. In the rebuilt Limen a coordinator's own commit of code is not covered by the publication
  rule (A-006) and skips the Checks and the review (A-012, A-013, A-070), so inline work is no delivery. (1) The
  coordinator's own branch is evaluated as a diagnostic beside pass^k, not in it: `evaluate` takes its candidate only
  from `result.json` and its `evaluation.json` would enter the report, so the main session's procedure repeats its
  steps by hand in a separate clone (the hidden tests over the tip, `npm ci --silent`, `npm run verify`). (2) B.2's
  report states that at `rebuild-base` the coordinator does not delegate under the fixed input (A-086) and gives the
  number of void attempts. (3) The owner message stays as D-021 has it; C (a message that asks for delegation) is
  rejected, because it would move a rule of Limen into the test's input and hide the gap the rebuild closes. (4) The
  void attempt runs again, then B.2 closes and the deployment follows the plan. Check: `## State` → B.2.
- 2026-11-20 D-050 (Adrian, B.2's shortfall): B.2 closes with K = 2. Its report gives the missing third attempt, the
  two void attempts with their cause, and that the coordinator under the fixed input usually does not delegate
  (A-086); the diagnostic of the coordinators' branches says that the hidden tests failed at `tsc` on names of the
  reference, so the behaviour is not verified. Before 4.8 the main session proposes together a name-independent
  evaluator and a way to keep the attempts out of the production checkout. Every change of the task after B.2 leaves
  B.2's result unchanged (z. 40): a new evaluator does, because B.2 has no candidate; a change of the input, such as
  the project's notes, needs its own justification. At the start of the deployment the main session confirms the full
  snapshot of `.limen/` (gate 2 §9 item 15, step 0.1), that no job runs (§7 D3) and that the deployed commit holds
  R-090. Check: `evidence/b2-same-task.md`.
- 2026-11-20 D-051 (Adrian, at step 1.0; brings part of 5.6 forward): the coordinators use the deployed Limen from
  `a0.1.1` on. The agents' account's `limen` on `PATH` is a link of that account, which pointed at the extra checkout
  in its home (gate 2 §9 item 6), so `/opt/limen` reached no coordinator; the project stub, with `LIMEN_PACKAGE`
  unset, loads the hooks of the package that `limen` resolves to. The link now points at `/opt/limen/bin/limen`; the
  extra checkout stays untouched as the rollback (the link back to it) until 5.5 removes it, and 5.6 still makes the
  link and `node` root-owned. B.2's attempts had also registered their clones in the seat's project registry (the
  wake hook registers the root of every coordinator session, `hook/wake.ts:906` at `rebuild-base`); the six lines are
  removed by hand at 1.0, and the "after" runs give each attempt its own `LIMEN_HOME` (part of D-050's isolation
  proposal). Check: `readlink -f` of the link, and `limen --help` ends with the final line of R-013.
- 2026-11-20 D-052 (Adrian, R-015's three questions, answered "1. A", "3. A" and with the seat output of 2; amends
  the R-015 note of `## Tickets`): (1) Besides `LIMEN_WORKER_MODEL` (until R-062; `LIMEN_REVIEWER_MODEL` of the note
  has no read site), the environment stays readable for `LIMEN_COORDINATOR` (until R-050), the six `LIMEN_GITHUB_*`
  names of the poller (until R-059) and `LIMEN_PACKAGE` (until R-049); each is an exception with its end ticket in
  the registry of `src/config.ts`, and `limen status` names it. (2) The seat's agents' account sets no `LIMEN_*` name in
  `~/.bashrc` or `~/.profile`, and a login shell holds none; the Herdr pane's environment is left to step 2.4.
  (3) `prepare`, `toolStall` and the new `toolCalls` come from `limits.json` only, the start gate from the seat's
  `start-gate.json` only; `LIMEN_PREPARE`, `LIMEN_PREFLIGHT`, `LIMEN_VIEW`, `LIMEN_WAKE` and `LIMEN_PI` are no longer
  read; the three waits with no setter become constants; `LIMEN_HOME` and the six other knobs of the tests are test
  knobs. Check: R-015's criteria (`R-015-one-config-reader/ticket.md`).

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
| E-1 | How the bridge maps the system prompt and messages (Q9, cost 2) | One SDK `query()` per Pi prompt, continuing Claude Code's own session file with `resume`; when Pi's history diverges (compaction, a `system` entry after the cursor, an abort) the bridge rewrites that file from Pi's history. The system prompt is Claude Code's `claude_code` preset plus an append of exactly three parts: the nearest `AGENTS.override.md`/`AGENTS.md`/`AGENTS.MD` walking up from the cwd, Pi's skills block, and four opt-in blocks that are off by default. **Pi's system prompt is not forwarded**, so Limen's role preamble (`--append-system-prompt`, `src/runtime/engine.ts:248` at `rebuild-base`) and the hook's system block (`hook/communication.ts:104`) never reach the model on the `pi-claude` route. Pi user messages (the task, and at `rebuild-base` the wakes and steers sent with `pi.sendUserMessage`) and Pi custom messages (the per-turn cue, reminders) all arrive as `user`; Pi's `role: "system"` patch entries are dropped. So the per-turn cue, with its register lines, reaches the model every turn (gate 2 §1, revision 4). | A-037, A-042, A-051, A-079, A-008, A-038, A-040, A-043, A-077; new finding (below) | yes (code and the bridge README); seat B.1 (2026-11-17): a Pi turn resumes the same Claude Code session (turns 2 and 3), and a job starts in a new one |
| E-2 | Cache breakpoints and TTL (Q9, cost 2) | The bridge sets no `cache_control`, breakpoint, TTL or caching variable; Claude Code decides all three. It reports `cacheRead` and `cacheWrite` per Pi turn (summed over the child's API calls; cost 0, no 5m/1h split). Claude Code's auto-compaction is switched off (`DISABLE_AUTO_COMPACT=1`); Pi compaction forces a session rewrite. | A-037, A-078, A-079, Measurement | yes; seat B.1 (2026-11-17): cache TTL 1 h for the coordinator and for a job (`ephemeral_5m` = 0 everywhere); a Pi compaction rewrites the session (next turn: cache read 3,272, cache write 27,578 tokens) |
| E-3 | What `--approve` enables (Q6, security 1) | Only project trust for the run: Pi then reads `<cwd>/.pi/settings.json` (which can install packages and change `npmCommand`, `shellPath`, `shellCommandPrefix`), `.pi/skills`, `.agents/skills` and `.pi/SYSTEM.md`, and the bridge reads `.pi/claude-bridge.json` (which can set the Claude Code executable path). Pi has no tool-call approvals and no `--auto-approve` (OMP had it). Without `--approve`, JSON mode resolves trust to "untrusted". | A-004, A-025, A-003 | yes |
| E-4 | What a job loads from its worktree (Q5) | Pi: context files (`AGENTS.override.md`, `AGENTS.md`, `CLAUDE.md`, case variants) from the cwd up to `/` and from `~/.pi/agent`, never trust-gated (off only with `--no-context-files`); under the bridge these sit in Pi's prompt and do not reach Claude. Bridge: the nearest `AGENTS*` file, re-read every query (none in isolated mode, E-15). Claude Code: `CLAUDE.md` and `.claude/settings*.json` per its default setting sources (E-7). `--no-extensions` keeps the project stub `.pi/extensions/limen.ts` out of jobs but does not stop settings-listed package installs (`--offline` does). Extensions given with `-e` go through jiti's transpile cache in the OS temp directory, shared by every process of the account (`JITI_FS_CACHE=0` or a private `TMPDIR` avoids it). The whole Pi environment is forwarded to Claude Code. | A-025, A-004 (T1), A-003 | partly: jiti cache path, `-e` module resolution and Node's compile cache are seat checks |
| E-5 | Tool restrictions and the subagent tool (A-081, A-029) | Claude Code's built-in tools are disabled; Pi's tools are served to it as `mcp__custom-tools__<name>` under `bypassPermissions`, so Pi's `--tools` allowlist (e.g. `read,grep,find,ls`) reaches Claude exactly. `Agent`, `Task`, `Skill`, `AskUserQuestion` and other Claude Code tools are always denied; Pi's `tool_call` event sees only Pi tool names. Exception: a session with zero Pi tools gets Claude Code's own Bash/Read/Write back, so no role may run with an empty tool list. | A-081, A-029 | yes for the bridge; seat B.1 (2026-11-17): the coordinator has 4 tools and a job 5; tools loaded on demand: step 4.3 |
| E-6 | Skills (Q10, H-11) | Pi lists every loaded skill (name, description, path) when `read` or `bash` is active; `disable-model-invocation: true` hides one; `--no-skills` plus `--skill <path>` restricts a session. The bridge forwards that block into Claude's append. | A-081 | yes |
| E-7 | Is `CLAUDE.md` loaded under the bridge (A-042) | The bridge passes no `settingSources`; the SDK documents that all sources (user, project, local, `CLAUDE.md`) then load. The bridge's own append reads only `AGENTS*`, not `CLAUDE.md`. | A-042 | partly: seat check (item 12) |
| E-8 | Context window (cost 8, A-034 thresholds) | Pi takes 1,000,000 input / 128,000 output for `claude-opus-5-5` from pi-ai's catalog; the bridge passes neither to Claude Code. Pi auto-compacts above window − 16,384 tokens and keeps a summary plus about the last 20,000 tokens. `ctx.getContextUsage()` = the last assistant usage plus a chars/4 estimate. Claude Code's real window on the Max login is unknown, and its own auto-compaction is off. | A-034, A-033 | yes; seat B.1 (2026-11-17): the window of `claude-opus-5-5` on the Max login is 1,000,000 tokens |
| E-9 | Limit errors (A-016) | A usage-limit result ends the Pi turn with `stopReason: "error"` and the Claude Code text in `errorMessage` (provider text, not model text). A structured reset time (`resetAtMs`, `rateLimitType`) appears only on Pi's event bus as `kendex:rate-limit`, and only if the binary sends a `rate_limit_event`. A 90 s silent stream ends the turn as `error` with `rateLimitType: "stream_idle"`. | A-016 | partly: whether the event fires for the 5-hour and weekly limits is a seat check |
| E-10 | Reasoning level (A-030) | Pi's level maps through the model's own table: for Opus 5.5 `high` → `--effort high`, `xhigh` → `--effort xhigh`; no level → Claude Code's default. | A-030 | yes; seat B.1 (2026-11-17): `--thinking` reaches Claude Code as `effort` |
| E-11 | Extension API Limen relies on | `before_agent_start` runs once per run (each prompt sent while idle), not per LLM turn; a returned `systemPrompt` applies to that run only. `sendMessage` custom messages reach the model as `user` (`display: false` hides them from the TUI only); `appendEntry` stays out of the context. `/new` and `ctx.newSession()` give a new session ID, re-run extension factories and keep the CLI options. | A-009, A-033, A-037, A-008 | yes |
| E-12 | `--append-system-prompt` text or path | Text, or the file's contents when the value names an existing file relative to the cwd. | (hosted mode, cut) | yes |
| E-13 | Pi compaction vs the resumed Claude Code session (§7 B, revision 2; A-086) | Every Pi compaction path writes the compaction entry, rebuilds Pi's context and awaits `session_compact` before the next model call; the bridge listens to the same event. With no bridge query running (before a prompt, after a run, overflow, manual `/compact`), the next query rewrites the Claude Code session in place; between turns of a run, the bridge kills the query and restarts it under a new session id, re-sending the pending request and a "history replaced" notice. The rewritten session holds Pi's summary as one user record plus the kept entries; system entries are dropped. The hook re-sends the context message on `session_compact`, but no single `sendMessage` option fits every trigger: the default (steer) lands in the next request except after a run, where it starts an extra turn; there `triggerTurn: false` is right (between `agent_end` and `agent_settled`, `willRetry` false). Keeping the message through compaction instead is not simpler (Pi keeps one contiguous range). Claude Code's own auto-compaction is off; whether settings can turn it back on is engine-side. | A-086, A-037, A-079 | partly: end-to-end order is a seat check (4.2); seat B.1 (2026-11-17): a compaction is two requests without tools in new sessions (cache writes of about 4k and 24k tokens, TTL 1 h), and the next turn resumes a new transcript built from Pi's history |
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

**Seat measurement B.1 (Adrian, 2026-11-17, on `rebuild-base`; raw logs stay on the seat).** E-1, E-2, E-5, E-8, E-10
and E-13 above carry its results. Consequences: a Pi compaction rewrites the Claude Code session anyway, so sending the
Limen context message again after a compaction (A-086, E-13) costs only its own length; the thresholds of A-034 use
the window of 1,000,000 tokens; the reference for A-078 (M-03) is a coordinator cache read of about 297k–313k tokens
per request in the M1 transcripts.

## System requirements

What the seat must provide; R-020 declares it in the platform adapter (T-12), `limen init` and the coordinator start
check it, and a missing tool or another version exits with code 4 naming both versions (T-32 (3), D-017).

| Requirement | Version or check | Declared and checked by | Installed by |
|---|---|---|---|
| Node.js | ≥ 24 (root 24, agents' account 26 on the seat) | R-020 | the seat |
| git | supports `git worktree list --porcelain -z` (git ≥ 2.36), checked as a feature (note R-020) | R-020 | the seat |
| tar, ps and the other tools R-020 finds in use | present | R-020 | the seat |
| Pi (`@earendil-works/pi-coding-agent`) | 1.5.1 | R-020; another version refused at coordinator start and spawn by R-049 | root, seat script (5.3) |
| Claude bridge (`@vanillagreen/pi-claude-bridge`) | 5.0.3 | R-020; R-049 | root, seat script (5.3) |
| Claude Code | the version Adrian pins at installation (5.3), recorded here then; updated only by the seat script after the contracts pass | R-049 (D-017); the bridge gets its path (R-048) | root, in a root directory (5.3); the agents' copy removed (5.20) |
| systemd user instance with lingering | scopes and timers work (`systemd-run --user --scope true`) | R-026, R-032 | root enables lingering (3.1) |
| Herdr | 0.9.3 on the seat | R-020 (T-12: tools found in use) | the seat |

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

### Cost and effect per stage

Adrian's cost per stage: the pair tickets he works on by day, the decisions the plan already expects from him, and
the seat steps of `## Deployment`: the stage's own steps N.0–N.k, where N.0 is the deployment by 0.1–0.3, plus the
measurements before (B.1 and B.2 before a0.1.0, B.3 after a0.2.0). Delegated tickets may also stop with `BLOCKED`
questions; their number cannot be known in advance.

| Stage | Tag | Tickets: S / M / L | Pair (Run) | Expected decisions | Seat steps |
|---|---|---|---|---|---|
| 1 | a0.1.0 | 17: 6 / 4 / 7 | 2: R-014, R-088 (day-after) | 4: gate 5.1; the golden help of R-014 (the wording is set by T-19, Adrian confirms the output); the same-task ticket before B.2 (R-011); the leftover list before `--drop-leftovers` (1.1) | 4 (1.0 bootstrap), plus B.1 and B.2 before it |
| 2 | a0.2.0 | 12: 0 / 10 / 2 | 0 | 3: gate 5.2; id collisions in the record migration report (2.1); the `LIMEN_*` variables to remove (2.4) | 5, plus B.3 |
| 3 | a0.3.0 | 13: 0 / 9 / 4 | 0 | 3, plus one per unlanded job: gate 5.3; the account names (3.3); `continue` or `abandon` for each finished job with unlanded work (3.6) | 12 |
| 4 | a0.4.0 | 10: 2 / 6 / 2 | 2: R-041, R-046 (day-after) | 4: gate 5.4; the cue wording (R-041); the role prompt texts and their glossary of terms (T-14, R-046); the modules to switch on (4.9) | 10 |
| 5 | a0.5.0 | 13: 0 / 9 / 4 | 0 | 3: gate 5.5; the owner channel's key, forced command and tokens (5.1); the domains added to the egress list (5.16) | 21 |
| 6 | a0.6.0 | 7: 0 / 1 / 6 | 3: R-065, R-066, R-068 (day-after) | 5: gate 5.6; the refusal and message texts of the ticket commands (R-065); the board, and which old prose sections go to `docs/` (R-066, 6.4); the question blocks (R-068); the `limen init` values (6.1) | 5 |
| 7 | a0.7.0 | 9: 3 / 4 / 2 | 1: R-073 (day-after) | 2: gate 5.7; the footer wording (R-073) | 6 |
| 8 | a0.8.0 | 4: 1 / 1 / 2 | 0 | 2: gate 5.8; whether to switch on groups and research (8.1, 8.2) | 3 |
| 9 | a1.0.0 | 6: 2 / 3 / 1 | 2: R-081 (day-after), R-085 (day) | 3: gate 5.9; the docs and `SECURITY.md` text (R-081); the final help (R-085) | 2 |

What changes in daily work on the seat once the stage's tag is deployed:

| Stage | Change |
|---|---|
| 1 | Cut commands and flags refuse with a pointer (`--tab`, `highlight`, `ticket-author`, `wait`, `ticket series`, `continue --review`, webhooks, Devin, Linear, OMP, scout). Every command ends with a JSON line and exits with a failure-class code; `limen --help` is the grouped help; `limen jobs` is `limen status --all` and `limen show <id>`, `limen queue` is `limen seat queue`. Tags deploy through `seat/deploy.ts`. |
| 2 | Job records live in `record.json` (migrated once). A job is named by its full id or its final token of 8 hex characters, never by a label (T-20, R-022). `LIMEN_*` settings in the environment no longer apply, except the exceptions of D-052, which `limen status` names with the ticket that ends each (R-015). `limen stats` reports from the records. |
| 3 | Unlanded work is never pruned or retired: `limen abandon <id>` keeps it on a branch, and spawn refuses while such a job is unresolved. Reads never reap; `limen seat sweep` on a timer finalises dead jobs every minute (A-024, R-032). After a 5-hour limit, jobs resume by themselves 5 minutes after the reset, with no seat rule and no manual resume. Job failures and long start-queue waits ring the phone (escalations from stage 7). A `limen land` that stopped half-way continues when it runs again. Jobs see only allow-listed environment variables, and git and gh in a job hold no credential (T1, R-087). |
| 4 | The models get Limen's instructions for the first time (coordinator manual, role prompts), so their behaviour changes (measured by M-05). The turn cue no longer demands English: its audience line names the language (T-13). Jobs end without the task-note turn; a read-only role that writes fails; a `sleep` of 30 s or more is refused in the coordinator (T-34, R-047); modules are off unless switched on in `limits.json`. |
| 5 | Coordinators start only through the root start script. Jobs run the bridge isolated and reach only allow-listed domains. The owner channel publishes `main`, so Adrian stops pushing; owner files change only through the owner channel. Wakes carry a header, and the coordinator reads a result with `limen show <id> --result` (A-008, R-051); the handoff note goes through a tool; a hand commit on `main` is refused. |
| 6 | Tickets move through `limen ticket start`, `drop` and `commit`; the board is generated, with no hand edits; `limen ticket check` is strict. `maxJobs`, the routes and the gate command come from `limits.json` and `routes.json`; the round limit is stored there and used from stage 7. Limen runs every `Check` when a job ends; the review verdict is parsed; questions go through `limen ask` and `limen answer`. Land itself is as before. |
| 7 | `limen spawn <role> <FNNN>` (`FNNN`: the ticket's number) builds the task and the label (`--label` and free task text refuse). Review rounds are bounded and end in `limen escalate`; Limen files the review reports; land happens only when the conditions in code hold, with no "land" from Adrian. `limen decide` records his decisions; a footer follows every coordinator reply; `needs-adam` is gone. |
| 8 | Groups, research, the quality pass and the Picture data exist only when switched on. |
| 9 | The docs and `SECURITY.md` describe the code; old command names are unknown commands (exit code 2, with no pointer). |

### Stage 1 — Cut, then one error type and one command registry (a0.1.0)

Remove the features cut at gate 2 (G1, §6) and the author's working history (T-39) before any rewrite. The seat flow
(detached jobs, review, land, the GitHub module) works as before; cut commands refuse with a pointer, and `limen status`
lists the leftover files of cut features. The root deployment script (D-008) deploys every tag from a0.1.0 on. The
same-task runner can run the "before" measurement on `rebuild-base`. Then the two foundations the registry needs: one
error type with exit codes as failure classes and a final JSON line (R-013), and one command registry with the help in
groups (R-014, `pair`, by day after the night run of the cuts, D-011); R-013 comes after the cuts (D-028). R-088
fixes the same-task runner before B.2 (D-027). After gate 5.1, two fix tickets (D-046): R-091 marks every Pi event
type in the runner before B.2, and R-090 makes the deployment script name what it checked and refuse a registry
without a project; the first deployment is their tag `a0.1.1`. Tickets R-001–R-014, R-088, R-090 and R-091.

### Stage 2 — Foundations (a0.2.0)

The shared mechanisms every subsequent ticket builds on, next to the error type and the registry of stage 1: one
configuration reader, validated boundary data, one Pi API adapter, atomic writes, one lock
module, a Linux platform adapter, one `record.json` per job written only by the transition function, exact job
references, thin commands over domain operations, `limen stats`, and test coverage derived from the registry. The
records of both projects migrate; `limen stats` reads the migrated history. The final line's `code` and `next` take
`null` (R-089, D-045, D-046). Tickets R-015–R-025 and R-089.

### Stage 3 — Work is never lost (a0.3.0)

No unlanded work is deleted; every job runs in its own scope; every failure has a recorded kind; a seat timer finds and
finishes dead jobs; a quota limit ends in one automatic resume; land is a sequence of recorded, repeatable steps; the
owner gets alerts for failures and escalations only; jobs run with an allow-listed environment and no credential (T1,
moved here from stage 5 by D-012). Tickets R-026–R-037 and R-087.

### Stage 4 — Limen's instructions reach the model (a0.4.0)

Closes A-086: one Limen context message per session, frozen, saved and sent again after compaction, tested on a fake
engine that shows the model's view under the bridge; the turn cue keeps only variable parts; role texts come from the
package and are literal, sourced and budgeted per role. Tickets R-038–R-047.

### Stage 5 — The trust boundary (a0.5.0)

G2 in code and in seat tooling (T1 came in stage 3): jobs run the bridge isolated, only root-owned code for agents,
one registered coordinator, Limen's messages as custom messages and job or GitHub text only as tool results, the owner
files and the published copy, publication of `main` by the owner channel, egress allow-list templates, and seat code
under the same checks as the rest. Until R-071, land is decided as at `rebuild-base` (the coordinator lands after
Adrian's word, D-004); the owner channel publishes those lands under the coverage rule, which is no weaker than today,
where Adrian pushes them by hand without reviewing them (gate 2 §1). Tickets R-048–R-060.

### Stage 6 — The parts of land by conditions (a0.6.0)

The parts that G3 and G4 need: tickets and the board in a core spec module; owner settings in `limits.json` and
`routes.json`; typed acceptance that Limen runs; a parsed verdict on the exact tip; ticket commands and a generated
board; typed questions. Land itself stays as at `rebuild-base` until stage 7. Tickets R-061–R-066 and R-068.

### Stage 7 — Land by conditions and the owner's conversation (a0.7.0)

G3 and G4 complete: bounded review rounds with escalation, reports filed by Limen, the task and the label built by
code, and land only on code-checked conditions. Then owner decisions with a checked quote, the footer and `limen
status` from one renderer, the ticket that records an answered question in `docs/`, the migration of `needs-adam`, and
owner touchpoints in `limen stats`. Tickets R-067 and R-069–R-076.

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
- **Depends**: tickets that must be done first, of the same or an earlier stage; `check.mjs` rejects a cycle.
- **Size**: S (one module), M (a few modules), L (a subsystem).
- **Mode**: `delegated` (the `rebuild-implementer` subagent) or `pair` (the main session with Adrian), see
  `## Agents`.
- **Run**: `night` for a delegated ticket, which a night run can take without Adrian; `day-after` for a pair ticket
  that depends, directly or through other tickets, on a night ticket of its stage, so it runs by day after that night run; `day` for a pair ticket with no
  such dependency, by day before or after the night run. No delegated ticket depends on a pair ticket of its own stage
  (D-011); `check.mjs` checks the column against the dependencies.
- **Mig.**: `yes` when the ticket needs a migration path (`## Stages` → conventions).
- **API**: Pi, bridge, Herdr or systemd behaviour that the fake engine cannot prove.
- **Seat**: the `## Deployment` steps that verify it on the seat.
- **Status**: `planned`, `active`, `blocked` (a night run's question waits for Adrian in `.night/questions.md`, the
  night mode of the rebuild prompt v6; the day session resumes the ticket), `done`, or `dropped (<reason>)` by
  Adrian's decision.

| ID | Title | Stage | Sources | Depends | Size | Mode | Run | Mig. | API | Seat | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| R-001 | Leftover files of cut features are listed and can be dropped | 1 | A-042 | R-010 | S | delegated | night | — | — | — | done |
| R-002 | Cut finish webhooks, coordinator signals and the finish ping | 1 | G1.3, A-027, A-060, A-076 | R-001 | L | delegated | night | yes | — | — | done |
| R-003 | Cut Devin and the Linear mirror | 1 | G1.5, G1.6, A-049 | R-001 | M | delegated | night | yes | — | — | done |
| R-004 | Cut the OMP engine | 1 | G1.7, A-049 | R-001 | L | delegated | night | yes | — | — | done |
| R-005 | Cut hosted `--tab` jobs; the GitHub module and groups run detached | 1 | G1.8, A-023 | R-001 | L | delegated | night | yes | herdr | 1.2, 1.3 | done |
| R-006 | Cut private planning, `highlight`, `ticket-author`, `wait`, `ticket series`, `continue --review` and `group status --json` | 1 | G1.12, T-18, T-37, A-079 | R-001 | M | delegated | night | yes | — | — | done |
| R-007 | Cut the Picture viewer and the map jobs | 1 | G1.4, §6, A-048, A-088, D-034 | R-001 | L | delegated | night | yes | — | — | done |
| R-008 | Cut the macOS branches | 1 | A-083 | — | S | delegated | night | — | — | — | done |
| R-009 | Cut the scout role and the `jg` cue | 1 | T-33, T-36, A-081 | R-001 | S | delegated | night | yes | — | — | done |
| R-010 | The author's working history leaves the tree; Limen's own test-line cap goes | 1 | T-39, T-11, §6 | — | M | delegated | night | — | — | — | done |
| R-011 | The same-task runner and the gate-time tool | 1 | H-21, T-11, T-41, §2, D-021 | — | L | delegated | night | — | pi | B.2 | done |
| R-012 | A root deployment script for a pinned SHA | 1 | D-008, D-010, §7 | R-002 | M | delegated | night | — | — | 1.0 | done |
| R-013 | One error type, exit codes as failure classes, a final JSON line | 1 | T-01, T-02, D-022, D-028 | R-002, R-003, R-004, R-005, R-006, R-007, R-009 | L | delegated | night | yes | — | — | done |
| R-014 | One command registry, a shared parser and generated help | 1 | T-19, T-18, T-26, T-37, D-028, D-037, D-038, D-039, D-040, D-041, D-042, D-043, D-044 | R-002, R-003, R-004, R-005, R-006, R-007, R-009, R-013 | L | pair | day-after | yes | — | — | done |
| R-088 | The same-task runner leaves no job running after an attempt | 1 | D-027, D-021 | R-011 | S | pair | day-after | — | pi | B.2 | done |
| R-091 | The same-task runner refuses an unmarked Pi event and states its touchpoint definition | 1 | D-045, D-046, D-021, H-21 | R-011 | S | delegated | night | — | pi | B.2 | done |
| R-090 | The deployment script names what it checked; a registry without a project refuses | 1 | D-045, D-046, D-008, §7 | R-012 | S | delegated | night | — | — | 1.0 | done |
| R-089 | The final line's `code` and `next` are a value or `null`; `next` is always a command | 2 | T-37, T-02, D-045, D-046 | R-014 | M | delegated | night | — | — | — | planned |
| R-015 | One configuration reader; settings come only from owner files | 2 | T-03 | R-014 | M | delegated | night | yes | — | — | done |
| R-016 | One boundary parsing module with validators; the cast ratchet | 2 | T-27 | R-013 | M | delegated | night | — | — | — | done |
| R-017 | One Pi API adapter with type guards, checked against Pi's real types | 2 | T-32 | R-012, R-016 | M | delegated | night | — | pi | 2.2 | planned |
| R-018 | One atomic-write module | 2 | A-022, T-25 | R-013 | M | delegated | night | — | — | — | planned |
| R-019 | One lock module with process identity and a bounded wait | 2 | A-017, A-018, A-055, A-058, A-087, T-25, D-029 | R-018 | M | delegated | night | yes | — | — | planned |
| R-020 | A Linux platform adapter and declared system requirements | 2 | A-083, T-12, T-32 | R-013 | M | delegated | night | — | — | — | planned |
| R-021 | One `record.json` per job, written only by the transition function | 2 | S1+, A-019, A-053, A-056, T-20, T-25 | R-016, R-018, R-019 | L | delegated | night | yes | — | — | planned |
| R-022 | Exact job references through one resolver | 2 | T-20 | R-014, R-021 | M | delegated | night | yes | — | — | planned |
| R-023 | Commands are thin adapters over domain operations; a refusal leaves no trace | 2 | T-26, T-38, D-045, D-046 | R-014, R-021, R-089 | L | delegated | night | — | — | — | planned |
| R-024 | `limen stats` over records and transcripts | 2 | H-01, H-20, §2, T-33 | R-021, R-023 | M | delegated | night | — | pi | 2.3 | planned |
| R-025 | Test coverage derived from the command registry | 2 | T-28, T-29, D-045, D-046 | R-014, R-023 | M | delegated | night | — | — | — | planned |
| R-026 | Every job runs in its own systemd user scope | 3 | A-029, A-052, T-43 | R-020, R-021 | L | delegated | night | — | systemd | 3.2, 3.7, 3.8 | planned |
| R-027 | The reaper ends a job only after its process group is gone | 3 | A-005, A-056 | R-026 | M | delegated | night | — | — | — | planned |
| R-028 | SIGTERM reaches the engine; a signal without a stop request is a failure | 3 | A-020, A-052 | R-026 | M | delegated | night | — | — | — | planned |
| R-029 | One recorded failure cause per job | 3 | A-016, E-9, T-31 | R-017, R-021 | M | delegated | night | — | bridge | 3.4 | planned |
| R-030 | Unlanded work survives: `limen abandon`, a guarded prune, a refusing spawn | 3 | A-001 | R-023 | M | delegated | night | yes | — | — | planned |
| R-031 | `landed` and `abandoned` markers; retire moves records to the archive | 3 | A-002, §6 | R-030 | M | delegated | night | yes | — | — | planned |
| R-032 | `limen seat sweep` runs on a timer; read commands never write or wait | 3 | A-024, T-04, T-18, A-017, §6, D-045 | R-012, R-027, R-031 | L | delegated | night | yes | systemd | 3.1 | planned |
| R-033 | Alerts from their own account: failures and escalations only | 3 | A-066, A-054, T-18 | R-021 | M | delegated | night | yes | systemd | 3.3 | planned |
| R-034 | Resume after the quota limit in code; seat rules are cut | 3 | A-016, A-010, A-068, §6 | R-029, R-032, R-033 | L | delegated | night | yes | systemd | 3.4, 3.5 | planned |
| R-035 | Start-queue thresholds: a diagnosis at 30 min, a failure at 2 h | 3 | A-036 | R-026, R-033 | M | delegated | night | — | systemd | 3.8 | planned |
| R-036 | Stall is measured over the whole job scope | 3 | A-059 | R-026 | M | delegated | night | — | systemd | 3.8 | planned |
| R-037 | Land runs as recorded steps with an atomic closing commit | 3 | A-021, A-057, T-18, T-28 | R-023, R-031 | L | delegated | night | yes | herdr | 3.9 | planned |
| R-087 | The job environment is an allow-list; git and gh in a job hold no credential (T1) | 3 | A-004, A-061, E-4, D-017 | R-015, R-021, R-026 | M | delegated | night | — | pi, bridge | 3.10 | planned |
| R-038 | The fake engine shows the model's view under the bridge | 4 | T-31, A-051 | R-017 | M | delegated | night | — | bridge | 4.1 | planned |
| R-039 | The Limen context message: one per session, frozen, saved, sent again after compaction | 4 | A-086, A-037, A-079, A-051, T-36, E-13, E-16 | R-021, R-038 | L | delegated | night | yes | pi, bridge | 4.2 | planned |
| R-040 | Role texts come from the package, in three registers | 4 | A-038, A-039, A-042, D-005 | R-001, R-039 | M | delegated | night | yes | — | — | planned |
| R-041 | The turn cue holds only variable parts and the audience line | 4 | A-077, T-13 | R-039 | S | pair | day-after | — | pi | 4.4 | planned |
| R-042 | The task-note mechanism is cut | 4 | A-044, A-059 | R-039 | M | delegated | night | yes | — | — | planned |
| R-043 | Just-in-time reminders arrive in the triggering tool result | 4 | A-041, H-12 | R-039 | M | delegated | night | — | pi | 4.5 | planned |
| R-044 | Module switches; hooks load by role and module | 4 | G1.10, G1.1, G1.2, G1.9, A-082, A-040 | R-015, R-039 | M | delegated | night | yes | pi | 4.7, 4.9 | planned |
| R-045 | Tools and skills per role; a read-only role that writes fails | 4 | A-081, E-5 | R-044 | M | delegated | night | — | pi, bridge | 4.3 | planned |
| R-046 | Role prompts are literal, sourced and budgeted | 4 | T-09, T-14, T-15, T-08, T-10, T-21, A-043, A-085, A-040 | R-040, R-041, R-042, R-044 | L | pair | day-after | — | — | — | planned |
| R-047 | The coordinator never waits | 4 | T-34 | R-039 | S | delegated | night | — | pi | 4.6 | planned |
| R-048 | Jobs run the bridge isolated: no `--approve`, `--offline`, a private `TMPDIR`, an explicit Claude Code path | 5 | A-025, E-3, E-4, E-15, D-005, D-017 | R-040, R-087 | M | delegated | night | — | pi, bridge | 5.8, 5.9 | planned |
| R-049 | Agents run only root-owned code; Pi, bridge and Claude Code versions are declared | 5 | A-025, T-32, T-36, D-017 | R-017, R-020, R-048 | L | delegated | night | yes | pi | 5.3, 5.5, 5.6, 5.10, 5.20 | planned |
| R-050 | The registered coordinator and its start script | 5 | A-033, A-061, A-029, §2, D-017 | R-026, R-033, R-034, R-049 | L | delegated | night | yes | pi, herdr, systemd | 5.4, 5.11, 5.20 | planned |
| R-051 | Wakes carry a computed header; Limen's messages are custom messages | 5 | A-008, A-078, A-034, T-16, E-16 | R-039, R-050 | M | delegated | night | — | pi | 5.12 | planned |
| R-052 | The handoff note goes through a registered tool | 5 | A-009, A-034, A-047 | R-051 | M | delegated | night | yes | pi | 5.13 | planned |
| R-053 | Steer entries carry an envelope; only the coordinator steers | 5 | A-028 | R-050 | M | delegated | night | yes | pi | 5.14 | planned |
| R-054 | The published copy and the owner files | 5 | A-011, §2 | R-037, R-050 | L | delegated | night | yes | — | — | planned |
| R-055 | The owner channel publishes `main` by the coverage rule; `hold` and `replay` | 5 | A-006, T-22, §7 | R-031, R-054 | L | delegated | night | yes | systemd | 5.1, 5.2, 5.15 | planned |
| R-056 | Egress allow-list templates for the agents' account | 5 | G2, A-004 | R-012, R-048 | M | delegated | night | — | systemd | 5.16 | planned |
| R-057 | The GitHub poller keeps its own state and authorises fork pull requests | 5 | A-003, A-062, A-063, A-018 | R-005, R-019 | M | delegated | night | yes | systemd | 5.17 | planned |
| R-058 | GitHub text reaches the coordinator only as a tool result | 5 | A-007, A-026 | R-051, R-057 | M | delegated | night | — | — | — | planned |
| R-059 | Seat code is typed, linted and tested in `seat/`; one usage poller | 5 | A-047, A-016, A-067 | R-020, R-034 | M | delegated | night | yes | pi, systemd | 5.5, 5.18 | planned |
| R-060 | Agents create no timers; the sweep reports foreign timers and engines | 5 | T-42, A-029 | R-032, R-050 | M | delegated | night | — | pi, systemd | 5.19 | planned |
| R-061 | Tickets and the board are a core spec module with narrow parsers | 6 | A-048, T-12 | R-016, R-023 | L | delegated | night | yes | — | — | planned |
| R-062 | Owner settings in `limits.json` and `routes.json`; `limen init` asks for them | 6 | A-014, A-030, A-059, T-11, T-03 | R-015, R-054 | L | delegated | night | yes | — | — | planned |
| R-063 | Typed acceptance; Limen runs every `Check` at the tip | 6 | A-031, T-06, T-10 | R-061, R-062 | L | delegated | night | yes | — | — | planned |
| R-064 | The review verdict and findings are parsed from the reviewer's result | 6 | A-013, T-08, G4 | R-063 | M | delegated | night | — | bridge | 6.3 | planned |
| R-065 | Ticket commands: start, drop, commit, check; a generated outcome; survey tickets | 6 | A-070, A-072, T-22, T-34 | R-037, R-055, R-061 | L | pair | day-after | yes | — | — | planned |
| R-066 | The board is generated; `limen spec fix` replaces the keeper | 6 | T-23, A-045, A-072, T-18, §6 | R-065 | L | pair | day-after | yes | — | — | planned |
| R-067 | The job task and the job label are built by code | 7 | T-07, T-24, A-073, A-044 | R-063, R-065, R-069 | M | delegated | night | yes | herdr | 7.4 | planned |
| R-068 | `limen ask` and `limen answer`: typed questions in the record | 6 | T-05, T-15 | R-051, R-054, R-062 | L | pair | day-after | — | — | — | planned |
| R-069 | Review rounds per ticket and `limen escalate` | 7 | A-015, T-05 | R-055, R-064, R-068 | M | delegated | night | — | — | — | planned |
| R-070 | Limen files the review and research reports itself | 7 | A-035, A-046 | R-064, R-065 | M | delegated | night | — | — | — | planned |
| R-071 | `limen land` passes only on code-checked conditions | 7 | A-012, A-032, G3, T-40, §7 | R-063, R-064, R-069, R-070 | M | delegated | night | — | — | 7.5 | planned |
| R-072 | `limen decide`: owner decisions with a checked quote, a scope and a lifetime | 7 | A-034, T-05, T-42 | R-068 | L | delegated | night | — | pi | 7.3 | planned |
| R-073 | The footer and `limen status` share one renderer; question blocks are chat entries | 7 | T-15, T-16, T-10 | R-068, R-072 | L | pair | day-after | — | pi | 7.2 | planned |
| R-074 | An answered question opens the ticket that records it in `docs/` | 7 | T-05 | R-065, R-068 | S | delegated | night | — | — | — | planned |
| R-075 | `needs-adam` keys become open request records | 7 | T-21 | R-068 | S | delegated | night | yes | — | — | planned |
| R-076 | Owner touchpoints and questions in `limen stats` | 7 | T-40, T-05 | R-024, R-068 | S | delegated | night | — | — | — | planned |
| R-077 | Groups: state conditions, data batches, one final result, a model-free group land | 8 | G1.2, A-029, A-069, A-080, A-075, A-045, T-35 | R-044, R-071 | L | delegated | night | yes | pi | 8.1 | planned |
| R-078 | Research on its own account, with a queue scanner and quote-checked synthesis | 8 | G1.11, A-004, A-046, T-35, T-18, §6 | R-044, R-059, R-070 | L | delegated | night | — | systemd | 8.2 | planned |
| R-079 | The quality pass is a module triggered by code | 8 | G1.13, A-071 | R-044, R-071 | S | delegated | night | — | — | — | planned |
| R-080 | Picture serves record data only; `touches:` is optional | 8 | G1.4, A-048 | R-044, R-061 | M | delegated | night | yes | — | — | planned |
| R-081 | Docs from the code with generated sections; `SECURITY.md` names the boundaries and accepted risks | 9 | A-050, A-084, T-02, T-10, T-21, T-39 | R-080, R-082, R-083, R-084, R-085, R-086 | L | pair | day-after | — | — | — | planned |
| R-082 | Lint debt, casts and swallowed errors reach zero | 9 | T-27, T-01 | R-080 | M | delegated | night | — | — | — | planned |
| R-083 | Test files are named after their subject | 9 | T-29 | R-080 | M | delegated | night | — | — | — | planned |
| R-084 | Comments resolve and name no person | 9 | T-30, T-21 | R-080 | M | delegated | night | — | — | — | planned |
| R-085 | The table of old command names leaves; the final help | 9 | T-18, T-19 | R-080 | S | pair | day | yes | — | — | planned |
| R-086 | Context-message budgets from the final measurement | 9 | T-09 | R-046, R-080 | S | delegated | night | — | — | — | planned |

Taste rules with no ticket of their own:
- T-17: binds the rebuild files, not Limen; its check runs in `adrian-rebuild/tools/check.mjs` since rebuild stage 3.

Notes for the tickets (facts a ticket needs that its row cannot hold):
- R-062 (seat, 2026-11-20, trial route of `a0.1.1`): a `limen continue` started with the model `claude-opus-5-5` and
  no provider failed in 3 s with no tool call: the route counts as bridged only by its provider (`engineRoute`), so
  the job's Pi ran without the bridge and refused the model as ambiguous across providers. A continuation inherits no
  route from its parent; the same holds at `rebuild-base` (`LIMEN_PROVIDER: continuation.provider ?? ""` in both), so
  it is no regression of stage 1. Part of A-030: the routes of R-062 cover `continue`, which takes the parent's
  recorded route unless its flags name another.
- R-067, R-081: the job label carries the round from the counter of R-069 (T-24), so R-067 depends on R-069; the docs
  are written from the final code (A-084), so R-081 depends on R-082–R-086.
- R-014: it registers the commands that remain after the cuts, so it depends on the cut tickets of stage 1, and it gives
  them the names of T-18 where no other ticket's mechanism is needed: `limen jobs` becomes `limen status --all` and
  `limen show <id>`, and `limen queue` becomes `limen seat queue`.
- R-001: A-042's decision defines the mechanism ("`limen status` lists leftover template copies once; `limen init
  --drop-leftovers` removes them"); R-001 builds it once, and every cut ticket registers the leftover paths of its
  feature.
- R-010: the cap it removes is the 3,500-line cap on Limen's own `test/`, a sentence in Limen's `spec/vision.md` read by
  a test (T-11); the projects' optional `testLineCap` in `limits.json` is a different setting, built by R-062.
- R-011: the runner takes the project, the parent commit, the ticket file and the reference test paths as arguments;
  the rebuild session has no access to the projects, so Adrian picks the ticket before B.2 by the criterion of
  `## Measurement`. One attempt is a whole coordinator session, run headless through Pi's RPC mode (D-021).
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
  `catch {`, T-01 → Why). It depends on the cuts of stage 1 (D-028), so it reworks no code a cut removes and its
  `process.exit` scan holds over `src`, `hook` and `bin` at its own commit (D-025).
- R-014: it also cuts `group wait` (T-19 names `group start`, `status`, `stop` and `land`; `wait` is rejected), whose
  time limit R-013 turns into a typed error (D-028).
- R-040: its criteria include `git grep -q '"templates/agents.md"' -- src hook` → exit 1, the global check that R-001
  confines to its own paths, because R-040 removes the `AGENTS.md` fallback of `hook/communication.ts:307` (D-025).
- R-088: the four round-3 notes of R-011's review (`R-011-same-task-runner/review.md` → Round 3): wait for `pid` as
  well before the second stop, stop Pi before the job stops (or read the job list again after them), correct the
  comment on a queued job's `state`, and give the test of the second stop a short bound (D-027).
- R-015: from a0.2.0 the settings live in the project's `.agents/limen/limits.json`, which exists at `rebuild-base`
  with `prepare` and `toolStall` (`src/project/limits.ts:7`), and the environment no longer overrides them.
  `LIMEN_WORKER_MODEL` and `LIMEN_REVIEWER_MODEL` stay readable, as the only listed exceptions, until R-062 brings
  `routes.json`; dropping them first would make the silent fallback of A-030 the default.
- R-019: it also fixes A-087 (D-029): the takeover of a dead lock renames it to a unique name, then creates the new
  lock with `wx`, and the seat registry is written under the lock through `atomicWrite`; an injection point between
  "found dead" and "taken over" lets a test force the interleaving of two processes, which fails before the fix every
  time; `test/s9-housekeeping.test.ts:135` stays, and a registry test asserts 41 entries after 41 concurrent
  registrations with a dead lock owner.
- R-020: git is declared by the feature Limen needs (`git worktree list --porcelain -z`), not by a version number, so
  the gate's shim (D-001) satisfies it on the laptop's git 2.34.
- R-021 (R-016 review round 3, notes 1-3; R-021 moves the records onto `src/boundary.ts`): the comment above
  `RAW` in `src/boundary.ts` says what `JSON.stringify` escapes (C0 included; DEL, C1, U+2028 and U+2029 are left to
  `escaped`); the 40-character cut of a shown value never splits an escape or a surrogate pair; format characters
  (category Cf, such as U+202E) are escaped too, so a record value cannot change how a terminal shows a log line.
- R-024: `limen stats` of a0.2.0 over a migrated copy of the whole history of both projects is the "before" of M-03,
  M-04 and M-06–M-11 (`## Deployment` B.3).
- R-030: from R-068 on, a job in `needs-decision` does not block worker spawns for other tickets (T-05 (5)).
- R-039: `context-size.mjs` learns to measure the context message in this ticket (M-01).
- R-040, R-048: the project's `AGENTS.md` goes into the context message exactly when the job runs the bridge isolated
  (E-15, D-005); R-040 builds the rule from a launcher flag, and R-048 turns isolation on, so the file never arrives
  twice. Neither project has an `AGENTS.md` today (gate 2 §1).
- R-044: the switches go into the existing `limits.json`; its migration lists the modules each project uses (the
  GitHub module when connected, groups when a group record exists), and Adrian switches those on in step 4.9. Its
  criteria include (D-040): the modules header of `limen --help` has the text of T-19, and each module line's `[on]` or
  `[off]` is built from that module's switch (a golden test with one module on and the rest off).
- R-032, R-034, R-037, R-066 (D-039): each one's criteria include "the command registry holds no entry with `movedBy`
  naming this ticket" (R-032: `sweep`, `prune`; R-034: `rule`; R-037: `close`; R-066: `keeper`). The ticket that
  removes the last `movedBy` entry also removes the field and the exception of R-014's registry test, which fails until
  it does (D-042), so that a top-level command acts only on `job`, `owner` or `project`.
- R-023 (D-044, R-014's review round 4): the static scan that no command words are read outside `src/parser.ts`
  (R-014 moved the `--help` lookup and the `jobs` refusal's words into the parser); the test of `--help` as a flag's
  value (R-014's parser test) asserts the command's own exit 1, so a parser refusal no longer passes it; the
  import cycle between `src/parser.ts` and `src/old-names.ts` (R-014 → `outcome.md` → Open points).
- R-081 (D-044, R-014's review round 4): the caller list above the internal section of `docs/commands.md` names every
  caller the generated lines name (a rule command after its timer died, `limen group status`).
- R-077 (D-042): its criteria include "the command registry holds no entry with `movedBy` naming this ticket" (`group
  wait`) and a fake-engine test in which a team member with a worker allowance gets each worker's result although it
  no longer calls `group wait`, including a worker that ends after the member's turn would have ended.
- R-032 (D-041 (6)): once read commands write nothing (T-04), `limen <command> --help` shows the kind of T-19.
- R-023 (D-045 (2), D-046): the `jobs` refusal (R-014 review round 4, note 1): a flag present names `limen status
  --all`, and only `limen jobs <ref>` names `limen show <ref>` (D-038); a test that every non-empty `next` of a refusal,
  for the mixed forms `limen jobs --all a1b2c3d4` and `limen jobs -- --all` included, passes the shared parser and is
  not itself a usage error.
- R-025 (D-045 (6)): `rule` is `change` (its entry covers `set` and `end`); `status` and `show` are `change` while they
  reap dead jobs; a test that every `read` command, run on a test project, leaves the project's files and `.limen/`
  unchanged (the snapshot function of T-38 (4)).
- R-032 (D-045 (6.2)): `status` and `show` become `read`, and R-025's test of `read` commands passes for them.
- R-025 (R-090 → `outcome.md` → Open points 1): the other scans of `test/structure.test.ts` (`filesIn` for `seat/`,
  `bin/`, `src/`, `hook/`, and `sources`) still walk ignored files; they read only the files git knows, through R-090's
  `knownFiles`, so an ignored file (an editor's swap file) cannot change a scan.
- R-059: no shell scripts (D-010): `docs/seat/bell.sh` and `docs/seat/github-setup.sh` become TypeScript in `seat/`,
  and every unit calls `node /opt/limen/seat/<tool>.ts`.

## Deployment

Adrian's steps on the seat; the rebuild session runs none of them. `<project>` is a project's checkout, `<tag>` and
`<sha>` come from the gate summary of the stage. No step needs a secret from this repository.

Where the owner actions of gate 2 §9 (the 16 items recorded at gate 2) are placed:

| Item | Subject | Steps |
|---|---|---|
| 1 | Accounts: names, owner channel, research account, alerts account, egress allow-list, tokens | 3.3, 5.1, 5.16, 8.2 |
| 2 | GitHub ruleset on `main` of both projects (§7 D1) | 3.11, 5.2 |
| 3 | Root-owned installs of Pi 1.5.1, the bridge, Claude Code (D-017) and the coordinator start script | 5.3, 5.20 |
| 4 | Coordinators start only through the start script | 5.4 |
| 5 | `limen seat sweep --install`, old prune units off (done on 2026-11-17), route variables out of the environment | 3.1, 6.1 |
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

### Resuming the projects on the seat

The earliest point to resume `synchronizer` and `ledger` on the seat, with the rest of the rebuild running in
parallel, is after a0.3.0 is deployed:
- Until a0.3.0 the critical losses of A-001 and A-002 are live: prune deletes the uncommitted work of a finished job,
  `prune --retire` deletes the records of jobs that never landed, and the seat's daily `limen-prune` timer runs both.
- a0.3.0 brings what a running seat needs most: one automatic resume after the 5-hour limit (12 of the 18 failed jobs,
  gate 2 §1), a recorded cause for every failure, the sweep timer, and alerts to the phone.
- Until a0.5.0 the risks that stage 5 closes stay open: the agents' account holds the GitHub token and has an open
  network, harness code loads from worker-writable places, and GitHub text and worker-writable files reach the
  coordinator. Adrian accepts them with a deadline (D-012). Jobs already run with T1 from a0.3.0 (R-087); the seat's
  token is fine-grained, with Contents read and write on the two projects only; the ruleset of 3.11 forbids force
  pushes and deletion on `main`.
- Land in stages 3–6: today's rule stays until a0.7.0: the coordinator lands a job only after Adrian's "land". From
  a0.7.0 land happens only when the conditions in code hold (R-071), with no "land" from Adrian (D-004).
- From then on, every tag deploys onto live data the same way (0.1–0.7). Stage 4 changes how the models behave in the
  middle of the projects' work; that is the change M-05 measures, not a reason to wait.

Conditions:
1. Before the first deployment (`a0.1.1`, D-046): B.1 and B.2 run on `rebuild-base`, and the snapshot of 0.1 taken before that first
   deployment is kept as the "before" data of B.3, because resumed projects add jobs of several versions to the live
   records.
2. The old `limen-prune` timers stay disabled until a0.3.0 replaces them (A-001: they deleted the uncommitted work of
   finished jobs every day). Done on 2026-11-17; step 3.1 checks it.
3. Migrations on live data run after the snapshot of 0.1, with `--dry-run` first and the report checked before the real
   run: 2.1 (records), 3.6 (unlanded jobs, landed markers; before the first spawn), 6.2 (front matter, acceptance), 6.4
   (board), 7.1 (`needs-adam`).
4. Steps 3.1–3.3 (sweep timer, job scopes, alerts) are done before normal work resumes; the trial jobs of 0.6 and 3.2
   are the only spawns before them. 3.4 waits for a real limit.
5. Every deployment after the resumption needs a quiet window: the script refuses while a job runs (D-008), so Adrian
   stops spawning, lets the running jobs end (one per project with `maxJobs` 1, the seat's practice, A-014; each within
   its timeout), and deploys. A job that waits for its quota resume is not running (state `failed`, kind `quota`); its
   resume after the deployment runs on the new version, like a `continue`.
6. Step 3.11 (the ruleset on `main`) is done before the projects resume.
7. The "after" measurements of 9.1 count only jobs whose id date follows the a1.0.0 deployment (a job id starts with
   its date), so jobs of intermediate versions enter neither "before" nor "after".

One Max window for the laptop and the seat:
- The rebuild's sessions on the laptop (the main session and its subagents) and the seat's coordinators and jobs draw
  on the same 5-hour and weekly limits. After the resumption each slows the other, and a limit stops both.
- Split: by day, the projects and the rebuild's pair tickets, while Adrian is present; at night, the rebuild's
  delegated tickets. A job spawned in the evening takes from the night run's window.
- The weekly limit binds both sides (D-013): when about 80 % of it is used (Adrian's manual threshold), until a0.5.0 the
  projects yield, so that the risk window of D-012 stays short; from a0.5.0 the rebuild yields.
- After a0.3.0 a limit on the seat ends in one automatic resume 5 minutes after the reset (R-034); on the laptop, the
  night mode that Adrian adds to the rebuild prompt resumes after the limit.
- B.2 and the same-task runs of 4.8 and 9.1 (k = 3 whole tickets each) take a large share of a window; they run when
  neither the projects nor a night run need it.
- Revisit when: the 5-hour limit stops the seat's work or the night run on at least two days of one week (M-11, kind
  `quota`, on the seat; the night mode's record of its stops on the laptop); then the split changes, for example to
  whole days for one side.

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
  against the fake engine's model view of the same scenario. It runs at every tag and after any change of the Pi,
  bridge or Claude Code version; a version change lands only after the bridge and the type contract pass (D-017).
- **0.6** Trial route in one project: one small ticket through spawn, review and land; note the exit codes and the
  time. The stage's steps name what else to watch.
- **0.7** Rollback: copy the current `<project>/.limen/` of both projects aside, to be kept (z. 29); run
  `node /opt/limen/seat/deploy.ts <previous sha>`; when the stage changed an on-disk format, restore the snapshot of
  0.1. The work of jobs run since 0.1 stays in their branches and in the copy, so a rollback loses nothing.

### Measurements before

B.1 and B.2 run before the first deployment; B.3 runs after a0.2.0 is deployed, on the snapshot taken before the first
deployment (`### Resuming the projects on the seat`, condition 1). B.2 needs the same-task runner of R-011 but no
deployment: once R-091 is pushed (D-046), Adrian runs it on the seat as the agents' account from a separate checkout of that
commit, outside `/opt/limen`, and points it at the `rebuild-base` checkout in `/opt/limen` and at a scratch clone.


- **B.1** Done on 2026-11-17 (results in `## Engine facts`, seat measurement B.1). On `rebuild-base` (today's seat), with `CLAUDE_BRIDGE_DEBUG=1`: save the per-query CLI log of one coordinator
  turn and one job turn (M-02). From the same log: whether each turn reuses or rewrites the Claude Code session, the
  cache TTL (`modelUsage` 5m or 1h), the context window of `claude-opus-5-5` on the Max login, and the cache read of
  the turn after a manual `/compact`, which forces a rewrite (E-1, E-2, E-8).
- **B.2** Done on 2026-11-20 with K = 2 of 3, pass^k no, two attempts void (D-049, D-050; `evidence/b2-same-task.md`).
  The same-task baseline: the same-task runner of R-011, as R-088 and R-091 left it, with `rebuild-base`, k
  attempts (M-05); an attempt that meets a Pi event the runner has not marked ends at once with the raw event in its
  result (R-091). First the
  seat check of R-011 (D-021): the coordinator started headless through Pi's RPC mode loads Limen's hooks and
  receives a wake; Adrian gives the candidate ticket's real time from the M1 records, which sets the time limit.
  After every attempt, the runner's stderr names no job left running (R-088, D-027).
- **B.3** After a0.2.0 is deployed: `limen stats` of a0.2.0 over a migrated copy of each project's `.limen/` from the
  snapshot taken before the first deployment (R-024; M-03, M-04, M-06–M-11).

### After stage 1 (a0.1.0)

The stage's first deployment is its fix tag `a0.1.1` (D-046), which carries R-090 and R-091.

- **1.0** Bootstrap, once: `/opt/limen` at `rebuild-base` has no deployment script. Check by hand that no job runs
  (`limen status` in both projects) and take the snapshot of 0.1; then, as root, `git -C /opt/limen fetch origin
  adrian-rebuild`, `git -C /opt/limen merge-base --is-ancestor <sha> origin/adrian-rebuild` and `git -C /opt/limen
  checkout --detach <sha>` with the full SHA of `a0.1.1` (D-046: the first deployment carries R-090), and run
  `node /opt/limen/seat/deploy.ts <sha>`, whose output names every registry and project it checked (R-090); it repeats
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
  coordinator's environment. The variables it lists as read until a ticket stay (D-052): `LIMEN_WORKER_MODEL`
  until 6.1, `LIMEN_COORDINATOR` until R-050, `LIMEN_PACKAGE` until R-049, the poller's `LIMEN_GITHUB_*` until R-059.

### After stage 3 (a0.3.0)

- **3.0** Deploy a0.3.0 by 0.1–0.3: `node /opt/limen/seat/deploy.ts <sha>` with the full SHA from gate 5.3.
- **3.1** `limen seat sweep --install` on the agents' account, with lingering on (root runs `loginctl enable-linger` if
  the command says so). The old `limen-prune@ledger` and `limen-prune@synchronizer` timers were disabled on 2026-11-17
  (Adrian, `systemctl disable --now`; item 5, done); what remains is to check that `systemctl list-timers --all` shows
  no `limen-prune` (R-032).
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
- **3.10** A trial job reaches Claude with the allow-listed environment; inside it, `env` shows only the allow-listed
  names, `git config --get credential.helper` prints nothing, `gh auth status` reports no login, and
  `DISABLE_UPDATES` is `1` (R-087, D-017).
- **3.11** Before the projects resume: a GitHub ruleset on `main` of both projects that forbids force pushes and
  deletion (part of §7 D1; D-012). Step 5.2 adds the rest of D1.

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
  the stage). Before it, the main session proposes a name-independent evaluator and a way to keep the attempts out of
  the production checkout, each leaving B.2's result unchanged (D-050).
- **4.9** Switch on, in each project's `.agents/limen/limits.json`, the modules its migration report lists as in use;
  until a0.5.0 Adrian edits the file directly, from then on only through the owner channel (R-044).

### After stage 5 (a0.5.0)

- **5.0** Deploy a0.5.0 by 0.1–0.3: `node /opt/limen/seat/deploy.ts <sha>` with the full SHA from gate 5.5.
- **5.1** Accounts (item 1), with the names chosen in 3.3: create the owner channel account, which accepts only a
  separate key of Adrian's, kept on his own machines with no agent forwarding, and only with a forced command; move
  the GitHub write token to it; give the agents' account a read-only token (R-055).
- **5.2** Extend the ruleset of 3.11 on `main` of both projects: push only from the owner channel's identity (item 2;
  §7 D1; R-055).
- **5.3** Root-owned installs by the seat script: Pi 1.5.1, bridge 5.0.3 and Claude Code in a pinned version in a root
  directory (D-017; note the version in `## System requirements`), with Pi's install path confirmed, and the
  coordinator start script (item 3; R-049, R-050).
- **5.4** Coordinators start only through the start script, never by exporting `LIMEN_COORDINATOR`; a second start for
  the same project refuses and names the PID (item 4; R-050).
- **5.5** Remove the old seat extensions from the Pi extensions directory, and establish whether anything loads the
  extra Limen checkout in the agents' home (item 6; R-049, R-059).
- **5.6** In the coordinator pane, `limen` and `node` resolve to root-owned paths and `LIMEN_PACKAGE` is unset (item 7;
  R-049). Since 1.0 the agents' `limen` link already points at `/opt/limen/bin/limen` (D-051); what remains is that
  the link and `node` are root-owned.
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
- **5.20** After the migration: the coordinator and a job run the root-owned Claude Code (5.9), both environments
  have `DISABLE_UPDATES=1`, and the copy in the agents' home directory is removed (D-017; R-049, R-050).

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

### After stage 7 (a0.7.0)

- **7.0** Deploy a0.7.0 by 0.1–0.3: `node /opt/limen/seat/deploy.ts <sha>` with the full SHA from gate 5.7.
- **7.1** Before the migration of R-075, count the `needs-adam` keys in both projects; after it, the same number of open
  request records exists (item 10; T-21).
- **7.2** A footer entry does not reach the model: the next turn's input tokens do not grow by the footer's size (item
  12; T-15; R-073; M-12).
- **7.3** `limen decide --quote` accepts a quote from Adrian's last message and refuses one from a wake (R-072).
- **7.4** Job tabs in Herdr carry the label built by code (R-067).
- **7.5** A trial route through land by conditions, including one refusal (R-071).

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
input (commit and ticket file), the same model and reasoning level, a clean state. An attempt is a whole coordinator
session with a fixed owner message and a fixed reply to every owner question (D-021). An attempt passes when the job
reaches `done` and the test files of the merged reference change pass on the job's tip together with the project
gate. The result is pass^k (all k attempts pass), reported next to the number of passing attempts; k = 3 per version,
because every attempt is a whole ticket on the shared Max window (z. 17).

| ID | Metric | Source | Before | After | Tickets |
|---|---|---|---|---|---|
| M-01 | Fixed context per role, bytes and ≈tokens | `node adrian-rebuild/tools/context-size.mjs <ref>` on the laptop; `--project` on the seat | `rebuild-base` (`evidence/context-size-rebuild-base.md`): system-prompt text the bridge drops, plus the cue that reaches the model | at the close of every stage from stage 4: the context message and the cue | R-039–R-047, R-086 |
| M-02 | One raw request per role (coordinator turn, job turn) | per-query CLI log with `CLAUDE_BRIDGE_DEBUG=1` | B.1, done 2026-11-17 (`## Engine facts`) | 4.8, 9.1 | R-039 |
| M-03 | Coordinator cache-read tokens per landed ticket (A-078) | `limen stats` | B.3, M1 history; reference from B.1: about 297k–313k cache-read tokens per coordinator request | 9.1, the next ten landed tickets | R-051 |
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
  `ticket.md`, `taste.md` → Part B in full, the harness principles in `input/`, the plan's Decisions and Engine facts,
  and the findings the ticket names. Writes the failing test first, then the change; runs the gate, `check.mjs` and
  Biome; drafts `outcome.md`. Leaves HEAD and refs unchanged, stages only `git rm` and `git mv` of the paths that
  `## Change` names, and changes no reserved path (D-015). On a question it stops and replies `BLOCKED: <question>`
  with options and a recommendation; two failures of the same step also end in `BLOCKED`.
- **rebuild-reviewer**: tools `Read`, `Grep`, `Glob`, `Bash`; `disallowedTools`: `Write`, `Edit`, `Agent`. Gets only
  the paths of `ticket.md`, the diff file and `taste.md`; `ticket.md` quotes every decision and engine fact the change
  relies on, so the reviewer checks against them without other inputs. Replies with `PASS` or `FAIL` on line 1, one
  `<ID>: met | not met | unknown: <evidence>` line per criterion, findings as
  `blocking|note · proven|observed|guessed · <finding> · <evidence>` (T-08), and answers to the reviewer questions in
  the `Check` of every rule the diff touches. Verdict rule: `PASS` when every criterion is met and no finding is
  blocking, otherwise `FAIL`; a blocking finding is always `proven`, and a suspicion the reviewer cannot prove is a
  note. It runs single tests, never the full gate (D-015).

Mode criterion: `pair` when the ticket's substance is taste (CLI UX, names, messages, the tone of role prompts, the
shape of a ticket or the board) or when its acceptance cannot be checked by a command; `delegated` otherwise.

Template of `ticket.md` (`check.mjs` requires these headings in every ticket folder):

```
<!-- PL: <2–5 sentences in Polish> -->
# R-NNN <title>
## Problem
<what is wrong; the sources, quoting each finding's Decision and every plan decision and engine fact the change relies on>
## Change
<what changes; every path that is deleted or moved, and every file of adrian-rebuild/tools/ that changes, in backticks>
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
1. The next ticket is the lowest `planned` ID of the current stage whose dependencies are all `done`: in a night run
   only among the `night` tickets; by day among the `day` and `day-after` tickets as well (D-011).
2. The main session writes `adrian-rebuild/R-NNN-<slug>/ticket.md` and sets the ticket's status to `active`. A
   criterion checks only the ticket's scope, with its expected result as an exit code and no `!` before the command;
   the main session runs every grep and scan criterion at HEAD and confines it to the paths of `## Change` unless
   every match is one the ticket removes; a global property that a subsequent ticket makes true is that ticket's criterion
   (D-025). A criterion names only commands on the list of `## Commands`; a script that runs only on the seat is
   checked through its tests (D-036).
3. `delegated`: the main session runs `node adrian-rebuild/tools/review-guard.mjs snapshot --git --out
   node_modules/.rebuild-review/R-NNN.git`, starts
   `rebuild-implementer` by its name (not a fork) with the ticket folder's path, changes nothing in the working tree
   while it runs, and afterwards runs `node adrian-rebuild/tools/review-guard.mjs compare --git
   node_modules/.rebuild-review/R-NNN.git <ticket.md>`. It exits 1 when HEAD, a ref, git's config, hooks or
   `info/`, `.claude/settings.local.json`, a file in `input/` or a reserved path changed, or when the index holds anything but deletions and moves of the paths
   `## Change` names; that voids the run (z. 14), and Adrian decides. The allow-list cannot tell the two sessions
   apart, so this check is the guarantee. On `BLOCKED: …` the main session asks Adrian, adds the answer to `ticket.md`
   → `## Decisions`, takes a new `snapshot --git` with the same `--out` once it has changed a reserved path (D-035),
   and resumes the same agent with `SendMessage` to its ID. `pair`: the main session implements with
   Adrian.
4. The main session runs `node adrian-rebuild/tools/gate.mjs` itself; its run counts, not a subagent's report. For a
   change of mechanism it also runs `node adrian-rebuild/tools/fails-before.mjs`, which must exit 0 (the new and
   changed tests fail at HEAD), and puts its output into the draft `outcome.md` under `## Fails before`. When either
   fails after `DONE`, the main session resumes the implementer with the output; a second failure of the same step goes
   to Adrian (z. 1). The main session starts the gate only after the subagent's completion notification, not on its
   reply alone, so that no two gates run at once. A test that failed even once without a change of the code it runs
   is a finding: nobody runs it again to get a green gate (z. 17); by day the main session asks Adrian, at night it
   writes a question in `.night/questions.md` and the ticket waits (D-029). Until R-019, a gate that fails only on
   A-087's test (`test/s9-housekeeping.test.ts:135`) is recorded in `outcome.md` as an occurrence of A-087 and run
   once more; a second such failure in the same ticket follows D-029 (D-031).
5. Review: `node adrian-rebuild/tools/review-guard.mjs snapshot --out node_modules/.rebuild-review/R-NNN.before` and
   `node adrian-rebuild/tools/review-guard.mjs diff --out node_modules/.rebuild-review/R-NNN.diff` (an ignored
   directory, like the gate's helper, so the guard does not see the files; `--out` creates it and writes atomically,
   D-018), then `rebuild-reviewer` with the three paths, then `node adrian-rebuild/tools/review-guard.mjs compare
   node_modules/.rebuild-review/R-NNN.before`. Exit 1 voids the review: for each path the guard names, the main
   session runs `git restore --source=HEAD -- <path>` and `git apply --include=<path>
   node_modules/.rebuild-review/R-NNN.diff`; a file the reviewer created is removed by Adrian himself, because `rm` is
   denied to the sessions. Then `compare` must exit 0, and the review runs again. The guard compares HEAD,
   every ref, the index, `git status --porcelain` and a SHA-256 of every changed and untracked file, so a second edit
   of an already modified file is caught, which the status alone would miss (`tools/test-review-guard.mjs`). The main
   session saves the reviewer's reply to `node_modules/.rebuild-review/R-NNN.reply` and runs `node
   adrian-rebuild/tools/review-verdict.mjs node_modules/.rebuild-review/R-NNN.reply <ticket.md>`; exit 1 (an
   inconsistent verdict, AU-126) rejects the reply, and the review runs again; a second rejected reply goes to Adrian
   (z. 1).
6. The main session writes the round into `review.md`. It records why it rejects a finding, or adds the findings to fix
   to `ticket.md` → `## Decisions`; the fixes are made by the resumed implementer (`delegated`) or by the main session
   (`pair`), and the review runs again on the new diff. At most two rounds of fixes; then Adrian decides, and his
   decision goes to `ticket.md` → `## Decisions`.
7. `outcome.md`, the `changes.md` entry (D-009), the status `done` in `## Tickets` and `## State`; then `check.mjs`
   and Biome on `adrian-rebuild`; one commit `R-NNN: <title>` with all of it; `git push origin adrian-rebuild`.
- No `SendMessage` to other sessions, no `ListAgents`, no agent teams; state passes only through files.
- In a night run, every "Adrian decides" and "asks Adrian" of steps 3, 4 and 6 follows the night mode that Adrian adds
  to the rebuild prompt before rebuild stage 5; a ticket that stops waits for the day, and so do the tickets that depend
  on it. There is no night run before that addition.
- In a night run subagents run only in the foreground (D-026): `night.mjs` sets `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1`,
  and the main session never resumes a subagent with `SendMessage`. Where steps 4 and 6 resume the implementer, a night
  run starts a fresh `rebuild-implementer` by its name with the paths of `ticket.md` and `review.md` (and, in step 4,
  the failing output in `ticket.md` → `## Decisions`); by day `SendMessage` stays. No command stands in for waiting:
  when the session cannot wait for a subagent, it updates `## State` and ends with the reason `cannot-wait`.

## Commands

The Bash commands rebuild stage 5 runs, for the allow-list in `.claude/settings.local.json` (D-016; untracked, excluded
in `.git/info/exclude`; `disableBypassPermissionsMode` set to `disable`). The rules there apply to the main session and to both subagents alike: the reviewer's read-only
limit comes from its definition and from `review-guard.mjs` (a change voids the review), and the implementer's from
its definition and from `compare --git` (protocol step 3), not from the list; the rows below name who runs what, which
the definitions follow. Commands run from the repository root,
with relative paths, never through `cd`.

Rules of form (D-016):
- Every part of a compound command (`&&`, `;`, `|`) must match a rule, so the sessions run single commands, use no
  `cd`, and pipe only into commands on the list.
- No variable assignment before a command (`TMPDIR=… node …` breaks the match of an allow rule); a tool sets its own
  environment, as `gate.mjs` and `fails-before.mjs` do through `gate-env.mjs`.
- No redirection: a tool of `tools/` writes its file with `--out <file>`, atomically and creating the directory
  (`atomic-write.mjs`), and keeps stdout for its result; `check.mjs` rejects a `>` in their commands in this section,
  in `## Agents` and in the subagent definitions (D-018).
- Night runs go through `tools/night.mjs`, which runs `claude -p` with `--permission-mode dontAsk`: a command off the
  list is refused and a write to a protected path is denied. Adrian starts it in a terminal; it is not on the list, so
  no session starts a night run of its own (D-019).

Adrian writes `.claude/settings.local.json`; the rebuild session never changes its own permissions. He adds the
command strings of the gate-time tool (R-011) and of the contract script (R-017) after those tickets' `outcome.md`,
and the stage-2 rows at the start of stage 2.

Every stage:

| Who | Commands |
|---|---|
| everyone: reading | `git status`, `git diff`, `git log`, `git show`, `git ls-files`, `git rev-parse`, `git cat-file`, `git grep`, `git for-each-ref`, `ls`, `cat`, `head`, `tail`, `wc`, `grep`, `find` (without `-delete` and `-exec`), `sed -n`, `sort`, `uniq`, `cmp`, `diff`, `file`, `command -v` |
| reviewer: checks | `node --test <test file>`, `node bin/limen <args>` on a test fixture (never the full gate, D-015) |
| main session, implementer: checks | `node adrian-rebuild/tools/gate.mjs`, `npm run check`, `npm run typecheck`, `npx tsc --noEmit`, `npx biome check --error-on-warnings <path>`, `node --test <test file>`, `node adrian-rebuild/tools/check.mjs`, `node --test adrian-rebuild/tools/test-changes-entries.mjs`, `node --test adrian-rebuild/tools/test-review-guard.mjs`, `node --test adrian-rebuild/tools/test-fails-before.mjs`, `node --test adrian-rebuild/tools/test-review-verdict.mjs`, `node --test adrian-rebuild/tools/test-night.mjs`, `node --test adrian-rebuild/tools/test-tool-calls.mjs`, `node --test adrian-rebuild/tools/test-handover.mjs`, `sh adrian-rebuild/tools/test-pre-push.sh`, `node bin/limen <args>` on a test fixture |
| main session, implementer: changes | `npx biome format --write <path>`, `npm ci`; `git rm <path>`, `git rm -r <path>` and `git mv <old> <new>` on the paths a ticket's `## Change` names (the cuts of stage 1, R-042 and R-059 replace files, R-083 renames test files, and others); every deletion and move goes through them, so the list stays the same every night (D-014) |
| main session only | `node adrian-rebuild/tools/review-guard.mjs snapshot --out <file>`, `snapshot --git --out <file>`, `diff --out <file>`, `compare <file>` and `compare --git <file> <ticket.md>`; `node adrian-rebuild/tools/fails-before.mjs`; `node adrian-rebuild/tools/review-verdict.mjs <reply> <ticket.md>`; `git restore --source=HEAD -- <path>` and `git apply --include=<path> <diff>` (after a void review); `git add <paths>` (`git add -A -- <paths>` for deletions and renames), `git commit`, `git push origin adrian-rebuild`; `sh adrian-rebuild/tools/install-hooks.sh` (after a move or a new clone); `node adrian-rebuild/tools/handover.mjs start <n>` and `node adrian-rebuild/tools/handover.mjs close-previous` (by day, D-047); at the close of a stage `git tag <tag> <sha>` (local), the gate-time tool of R-011 (`node adrian-rebuild/tools/gate-time.mjs --out <file>`) and, from stage 4, `node adrian-rebuild/tools/context-size.mjs <ref>` |

In addition, per stage:

| Stage | Commands | For |
|---|---|---|
| 2 | `npm pack @earendil-works/pi-coding-agent@1.5.1 @earendil-works/pi-ai@1.5.1 @earendil-works/pi-agent-core@1.5.1 @vanillagreen/pi-claude-bridge@5.0.3 --pack-destination adrian-rebuild/input/vendor`, `mkdir -p adrian-rebuild/input/vendor/<package>`, `tar -xzf <tarball> -C adrian-rebuild/input/vendor/<package>`, and the contract script of R-017 on that copy; the only network access besides `npm ci` and `git push origin adrian-rebuild` | the type contract of R-017 (T-32 (2)) |
| 3 | none: scopes, units and timers are tested on fakes (T-28 (5)); `systemd-run`, `systemctl` and `loginctl` are seat steps | — |
| 4 | `node adrian-rebuild/tools/context-size.mjs <ref>` for the implementer too | R-039 |
| 5–8 | none: `nft`, `systemd-analyze`, `ssh` and account setup are seat steps | — |

Deny rules (never on the allow list): Edit and Write on `.claude/**` and `adrian-rebuild/input/**`; `git push` of any
other ref, `git push --force` or `-f`, `git push --delete`, `git reset --hard`, `git rebase`,
`git tag -d`, `git branch -d` or `-D`, `git checkout` or `git switch` of another branch, `git stash`, `git clean`,
`--no-verify`, `npm install` (only `npm ci`) and `npm install -g`, `sudo`, `curl`, `wget`, `ssh`, `python3`,
`systemctl`, and `rm` and `mv` (deletions and moves go through `git rm` and `git mv`).

## State

Updated 2026-11-19, day session `limen-rebuild-8`, rebuild stage 5 between plan stages 1 and 2: stage 1 is closed
again after its fix tickets R-090 and R-091 (the commit `Stage 1: close (a0.1.1)`, which the local tag `a0.1.1` names;
the first deployment, D-046). Gate 5.1 decided to go on to stage 2 (D-045 (1)); B.2 runs first, and stage 2 starts
by day on 2026-11-20 in a new session (D-048). The night of 2026-11-19 ended at 02:57 with `no-ticket`.

Handover of 2026-11-19 (D-033, at 37 % context, after the commit `R-014:`): `limen-rebuild-5` started
`limen-rebuild-6` in `tmux` in remote-control mode (14:10) and ended. WSL booted at 10:34 on 2026-11-19, after the
`.wslconfig` was written (2026-11-18 16:48), so no WSL window has to stay open. `limen-rebuild-6` took over (its push
notification was skipped as redundant: the terminal was active). The handover after it is `limen-rebuild-7`.

Handover of 2026-11-19 (D-033, at 30 % context): Adrian ends `limen-rebuild-4` himself (`/exit`) and starts the next
day session himself with the first message of the rebuild prompt; it starts R-014 with him. Two older sessions were
still alive at 10:09 and should be closed by Adrian, since either would work on the same tree if woken:
`limen-rebuild-3` in `tmux` (`tmux kill-session -t limen-rebuild-3`) and a `claude -c` started at 16:30:47 on
2026-11-18 in a WSL window, hung on a `git grep … | sort` (Esc, then `/exit`; the window stays open while the
`.wslconfig` is not applied).

Handover (D-033): `limen-rebuild-2`, started in `tmux` at 16:17, died at 16:22:59 together with its running
implementer of R-003, when WSL stopped the distro. `tmux` does not keep WSL alive: without a
`%UserProfile%\.wslconfig`, WSL stops a distro about 15 s after its last terminal window closes
(`instanceIdleTimeout`, default 15000) and the VM about 60 s after the distro (the previous boot's journal: "System is
powering down" with no command before it; Windows did not restart). At Adrian's request the main session wrote
`%UserProfile%\.wslconfig` with `[general] instanceIdleTimeout=-1` and `[wsl2] vmIdleTimeout=-1`; it applies from the
next WSL start, and Adrian declined a restart and keeps a WSL window open instead. A session Adrian started in the
repository took R-003 over at step 3, closed R-003 and R-004, and handed over at 31 % context to `limen-rebuild-3`,
started in `tmux` in remote-control mode with the first message of the rebuild prompt (20:35); it closed R-005 and R-006 and
handed over at 31 % context to `limen-rebuild-4`, started the same way. WSL booted at 16:30:17 and the `.wslconfig`
was written at 16:48:28, so it is not applied yet: a WSL window must stay open. Your first act as the next session: send Adrian a push notification (PushNotification, one line in
Polish) that your session takes over the rebuild at the first ticket of `Next`; then go on with `Next`. The next
handover is `limen-rebuild-5`, once a WSL window is open or WSL started after
the `.wslconfig` was written (`uptime -s`). Read your context share at every safe point with `cat
~/.claude/context/<session id>.json` (the session id is the UUID in your scratchpad path; `context_used_percentage`,
`five_hour_used_percentage`, `seven_day_used_percentage`); at 30–50 % hand over, at 50 % at once (D-033, and the
project memory note on the handover).

Done:
- Rebuild stages 0–3 with gates 0, 2 and 3 (D-001–D-007); rebuild stage 1 has no gate.
- Rebuild stage 4: `## Vision`; `## Terms`; `## Decisions` with the verbatim copy of gate 2 §2; `## Stages` (9 stages,
  tags a0.1.0–a1.0.0, the cost and the effect of each); `## Tickets` (R-001–R-087: every `fix` finding and every taste
  rule except T-17 is a source of a ticket; the `Run` column); the 16 gate-2 owner actions placed in `## Deployment`,
  with the resumption of the projects; `## Measurement` (M-01–M-13); `## Agents` with the two definitions in
  `.claude/agents/` and `tools/review-guard.mjs` with its test; `## Commands`. `check.mjs` checks the plan (stages,
  tickets, sources, the dependency graph, `Run`, seat steps, the deployment call per stage, the copy of §2), the Polish
  summaries and, from rebuild stage 5, the ticket folders and `changes.md` (`tools/changes-entries.mjs`, tested). Two
  cold reads by fresh subagents (35 and 22 remarks, resolved): `evidence/plan-cold-read.md`.
- Gate 4 (2026-11-17): Q1–Q3 → D-008–D-010 (the root deployment script R-012 in stage 1, which absorbs D3, so tickets
  R-012–R-059 of commit `cdf3e78` are R-013–R-060 now; the `changes.md` format; seat tools in TypeScript). Adrian's
  additions → D-011 (night runs: R-013 and R-014 in stage 1, R-067 and R-069–R-071 in stage 7, the `Run` column; the
  cost and effect per stage; the resumption; `## Commands`; two exposed dependencies: R-067 on R-069, R-081 on
  R-082–R-086). Q4 and Q5 → D-012 and D-013 (the projects resume after a0.3.0 as an accepted risk with a deadline; T1
  as R-087 in stage 3, split from R-048; step 3.11; the weekly limit). The plan accepted after two corrections → D-014
  (the land rule of stages 3–6; `git rm` and `git mv`). Q6 → the date 2026-11-21 in D-012. The definitions accepted
  after corrections → D-015 (`review-guard.mjs compare --git`, `fails-before.mjs`, `review-verdict.mjs`, `gate.mjs`,
  each with a test).
- The old `limen-prune` timers on the seat were disabled on 2026-11-17 (Adrian); step 3.1 checks it.
- The night mode is in the rebuild prompt (v6) and `.claude/settings.local.json` is written (D-016). `tools/night.mjs`
  (D-019) is done with its test and a review by `rebuild-reviewer`: `evidence/night-runner/` (ticket, review,
  outcome).

Night run of 2026-11-17 (until 07:00; commits `d51cc24`, `6968edf`, `e444106`):
- R-001 `blocked`, Q-1: the 3,500-line cap of `test/` left one line, so its three new test files could not pass the
  gate; R-010 removes the cap. Recommended: R-001 depends on R-010. Its `ticket.md` is written; nothing is implemented.
  R-002–R-007 and R-009 depend on R-001, and R-012 on R-002, so they wait for the answer.
- R-008 `done` (review PASS in one round). For Adrian to confirm: R-008 leaves the LaunchAgent installer (`limen sweep
  --install`, `--uninstall`) to R-032, which replaces it with the systemd installer, because R-008 has `Mig. —` and
  cutting the installer would change the CLI (R-008 → `ticket.md` → `## Decisions`).
- R-010 `done` (review PASS in one round): the author's `spec/` and the docs of gate 2 §6 left the tree, and the
  3,500-line cap of `test/` is gone, so Q-1's cause no longer exists; R-001 stays `blocked` until Adrian's answer.
- R-011 `blocked`, Q-2: whether a same-task attempt is a whole coordinator session (M-05, T-40 and T-41 count the
  coordinator's behaviour; it needs Pi's headless RPC mode, so the row's API `—` would become `pi`) or one worker job.
  Recommended: a coordinator session. No ticket folder yet.
- R-013 `blocked`, Q-3: where the final JSON line `{class, code, next}` carries the data of a successful command, above
  all the job id that `spawn` prints on its last line today. Recommended: an optional typed field (`id`). No ticket
  folder yet.
- `check.mjs` and the `Status` column accept `blocked` (the night mode of the rebuild prompt v6).
- No stage-1 `night` ticket could start after that (R-014 is `pair`, `day-after`), so the night ended with `no-ticket`
  (`.night/status.json`). Gate 5.1 is not due: stage 1 has 9 tickets left.

Day session of 2026-11-18 (Adrian's answers, moved from `adrian-rebuild/.night/questions.md`, whose entries are
marked resolved):
- Q-1 → D-020: R-001 depends on R-010 (done); R-001 `planned`, and its `ticket.md` → `## Decisions` holds the answer.
- Q-2 → D-021: one same-task attempt is a whole coordinator session through Pi's RPC mode, with Adrian's four
  additions (touchpoints, time limit, a void attempt at the subscription limit, a clean copy without `origin` and
  hidden tests); R-011 is size L with API `pi` and the seat check in B.2; R-011 `planned`, its `ticket.md` is written
  from D-021.
- Q-3 → D-022 and `taste.md` → T-37: an optional field `ids` in the final JSON line; R-013 `planned`, its
  `ticket.md` is written from D-022.
- The R-008 point → D-023: the LaunchAgent installer goes with R-032.
- D-024: the main session starts the night runner when Adrian asks for it in the conversation.

Night run of 2026-11-18 (until 07:00; the runner's log: 00:19:25–02:08:14; commits `40846ea`, `f688cb4`, `c733f0e`):
- R-001 `blocked`, Q-4: AC-6 (`git grep -n '"templates/agents.md"' -- src hook` → one line) fails at HEAD, because
  `hook/communication.ts:307` (the `AGENTS.md` fallback that R-040 cuts) matches besides the tracked list; the error is
  the ticket's. Recommended: narrow AC-6 to `src`. Nothing implemented; R-002–R-007, R-009 and R-012 wait with it.
- The day session's note that the `ticket.md` files of R-011 and R-013 were written was wrong: neither folder existed
  at `edaafe2`. The night run writes them from D-021 and D-022.
- R-011 `done`: the same-task runner (`tools/same-task.mjs` with `run`, `evaluate`, `report`; `pi-rpc.mjs` is the
  only module of Pi's RPC protocol, declared from Pi's documentation because the tarballs come only in stage 2, so
  B.2's seat check confirms it first) and the gate-time tool (`tools/gate-time.mjs`). Review FAIL in round 1 (one
  blocking finding), PASS in rounds 2 and 3 after two rounds of fixes; the four notes of round 3 are Q-6 (a fix ticket
  before B.2 or not). For Adrian: add `node adrian-rebuild/tools/gate-time.mjs --out <file>` to
  `.claude/settings.local.json` before the close of stage 1; the main session's choices in R-011 → `ticket.md` →
  `## Decisions` (the tools in `tools/`, the declared protocol, every owner turn answered and counted) are open to
  change at gate 5.1.
- Q-5 (no ticket blocked): a resumed subagent works in the background, so the main session kept its turn open by
  running `npx tsc --noEmit` about 150 times; two `grep` calls outside the repository, meant as a longer wait, were
  denied by the permissions and not worked around. Recommended: a `tools/wait.mjs <seconds>` on the list.
- Q-6 (no ticket blocked): whether R-011's round-3 notes get a fix ticket before B.2 (recommended: yes, S, `night`).
- R-013 `blocked`, Q-7: four commands fail by setting `process.exitCode = 1` and returning (`ticket check`, `picture
  build --strict`, `webhook test`, `github poll`), which the ticket did not list; making them throw breaks item 7's
  ratchet arithmetic. Recommended: a plain `Error` at the four sites and the ratchet "at most the parent's count".
  Its `ticket.md` is written (the main session's reading of `code`: an identifier on failure, `0` on success, for
  Adrian to confirm at gate 5.1); nothing is implemented.
- Ended at 02:08 with `no-ticket` (`.night/status.json` modified at 02:07:57, the run's end at 02:08:14 in
  `.night/launcher.log`; the session's own "02:10" was a guess, as D-019 expects): every other stage-1 `night`
  ticket depends on R-001, and R-014 is `pair`. Gate 5.1 is not due: stage 1 has 10 tickets left.

Start of the day session (checked 2026-11-18, 09:01): the night's last commit `c733f0e` is pushed (`HEAD` =
`origin/adrian-rebuild`), the tree is clean, no `night.mjs` runs and its lock is released. The day session starts from
the commit that records this, whose parent is `c733f0e`.

Day session of 2026-11-18, continued (Adrian's answers to Q-4–Q-7 in the conversation, written into
`.night/questions.md`, whose entries are marked resolved):
- Q-4 → D-025: a criterion checks only the ticket's scope, with an exit code and no `!`; R-001's AC-6 covers the
  paths of its `## Change`, the global check goes to R-040; `check.mjs` rejects a criterion that starts with `!`;
  protocol step 2 runs every grep and scan criterion at HEAD. R-001 `planned`.
- Q-5 → D-026: subagents only in the foreground at night (`CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1` from
  `night.mjs`), a fresh implementer per night fix round, the reason `cannot-wait`, tool calls per commit counted by
  `night.mjs`; the protocol in `## Agents` is amended. `night.mjs` is changed (commit `6c2cce7`), with the new module
  `tools/tool-calls.mjs` (the count, a side channel whose failure is a line in the log) and their tests
  (`evidence/night-runner-d026/`: review FAIL in round 1, PASS in rounds 2 and 3). Unmeasured until the first night
  with it: that the real `stream-json` has the fields the count reads, and that no subagent runs in the background.
- Q-6 → D-027: R-088 (`pair`, `day-after`, S) fixes R-011's round-3 notes before B.2.
- Q-7 → D-028 and `taste.md` → T-02: only the wrapper sets the exit code; R-013's `ticket.md` is rewritten from it,
  and R-013 depends on the cuts R-002–R-007 and R-009. R-014 also cuts `group wait`. R-013 `planned`.
- The stage-1 criteria were checked under D-025: R-001's AC-6 and R-013's AC-4 and AC-5 changed; no other written
  `ticket.md` of stage 1 has a criterion that a subsequent ticket makes true. Commit `e8c9a47`.
- R-001 `done` (a fresh `rebuild-implementer`; review PASS in rounds 1–3, two rounds of fixes: each `dropped` line
  right after its removal, an overlap rule for the registry, one reason per test, the docs of `status --all`, the
  rule's comment). `LEFTOVERS` is empty; every cut ticket registers its paths, and the registry test rejects an entry
  that overlaps another or a `TRACKED` path.
- The gate was not stable in R-001: the implementer saw the lock-contention test `test/s9-housekeeping.test.ts:135`
  fail alone once in four runs (39 of 41 registrations); one run of the main session failed 93/96 on that test and on
  two of `test/s2-hosted.test.ts` (`limen highlight …` timed out at 180 s, `hosted Pi stop …`), started while the
  implementer's process was still ending, with both gates on the same cache directory (the likely cause, guessed);
  the main session ran the same tree again and it passed 96/96, before D-029 forbade that. → D-029: A-087 (high, fix
  in R-019), and the protocol rule that a test that failed once is a finding and is never run again for a green gate;
  the main session starts the gate only after the subagent's completion notification. The two `s2-hosted` tests are
  cut with hosted jobs (R-005) and `highlight` (R-006). For Adrian: the same rule in the definition of
  `rebuild-implementer`, which the sessions cannot write (the text is in the day session's reply).

- R-088 `done` (pair): Pi is stopped before the jobs at the time limit and at exit 4, a job without `state` or
  `pid` is stopped again once it has both, the comments state when a job lacks them, and every test waits at most
  3 s. Review FAIL in rounds 1 and 2 (a false comment each), PASS in round 3; two comment fixes after it without a
  fourth review (Adrian). B.2 can run on the seat once a0.1.0's other prerequisites hold.
- D-030 (how the day session talks to Adrian; also in the project memory): a message that needs his action carries
  the full text, file, place and command; decisions are asked in plain messages, never through `AskUserQuestion`.
- Adrian pasted D-029's rule into `.claude/agents/rebuild-implementer.md` (commit `175d75a`).
- D-031: until R-019, a gate that fails only on A-087's test is recorded in the outcome as an occurrence and run once
  more (`## Agents`, step 4). D-032: `.gitignore` ignores `.*.swp` (an open editor had failed `check.mjs`).
- R-002 `done`: finish webhooks, coordinator signals and the finish ping are cut; the coordinator registration stays
  for `limen rule` (`src/integrations/coordinator-registration.ts`) until R-034; `src/old-names.ts` is the table of
  old command names (T-18), to which every cut ticket that removes a command adds its entry; `LEFTOVERS` holds four
  paths. Size L (was M). Review PASS in rounds 1 and 2; gate 92/92. The refusal wording is for Adrian at gate 5.1.
- Seat checks by Adrian (2026-11-18): the seat registry holds both projects, both have their `.limen/`, and no
  registry lock is held (A-087 has caused no loss there); the seat-level files of the removed webhook docs do not
  apply to the seat.
- The main session's estimate for a0.1.0 (2026-11-18): about 19–24 hours of work for the ten tickets left (now seven)
  and the close, so 2026-11-19 late or 2026-11-20. D-012's date of 2026-11-21 for a0.5.0 cannot hold (stages 2–5 are
  47 tickets); Adrian takes that decision again on that date (D-012).
- R-003 `done`: Devin (`src/runtime/devin.ts`, `--engine devin`) and the Linear mirror (`limen linear`,
  `templates/linear.md`) are cut. `src/old-names.ts` has the `linear` entry and a second list `OLD_ENGINES` with
  `removedEngine`, where R-004 adds `omp`; `engineProfile` and `resolveSpawnEngine` refuse a removed engine with its
  line, and `limen continue` checks the recorded engine before the transcript, because a Devin record has none (the
  implementer's deviation 1, which the review accepted). `LEFTOVERS` holds seven paths. Review PASS in rounds 1 and 2
  (round 1's first reply was rejected by `review-verdict.mjs` on its format and sent again); gate 95/95. For Adrian,
  outside the projects: the Devin CLI login and the `DEVIN_*` and `LIMEN_DEVIN*` variables, if the seat has them
  (outcome → Open points 1); both refusal wordings at gate 5.1.
- R-004 `done`: the OMP engine is cut: its profile, OMP's skill configuration (`omp config get`), its bridge route,
  the persistent-shell rule of the bash-call counter, OMP's multi-file edit, read selector and `session_stop` in the
  hooks, and the stub `limen init` copied into `.omp/extensions/limen.ts`, which is now a leftover file (`LEFTOVERS`
  holds eight paths). `OLD_ENGINES` has `omp`; the one engine is Pi. The seat runbook follows Adrian's variant (a):
  `pi --version` is checked, `herdr integration install pi`, `moshi-hook install` without `--target`, the coordinator
  starts with `pi`. The two hosted OMP tests of `test/s2-hosted.test.ts` went (R-005 cuts hosted jobs next). Size L
  (was M). Review FAIL in round 1 (two blocking findings in the docs and the manual, fixed with three notes), PASS in
  round 2 (a fresh reviewer, because the first one's reply was held back by the harness); gate 96/96. For Adrian on
  the seat, before a0.1.0: `grep -n LIMEN_ENGINE ~/.bashrc` on the worker account (remove `export LIMEN_ENGINE=omp` if
  it is there) and which target `moshi-hook` was installed with (`moshi-hook status`); the refusal wording at gate 5.1.
  Unverified in the repository: that Pi 1.5.1 fires no `session_stop` and sends no `paths` or `path:N-M` (B.2's seat
  check; the outcome's Risk).
- R-005 `done` (delegated): hosted jobs are cut: the hosted supervisor, the pane ownership proof and its
  uncertainty, `hook/hosted.ts` and every hosted branch of spawn, continue, stop, reap, recovery, the readers and the
  wake. The GitHub module runs a review or task as a detached job (90 min, 900 tool starts, the start queue) and
  matches its record by shape, without `hosted` or `started`; groups are detached, with a log tab per team
  coordinator. `--tab` on `spawn`, `continue` and `group start` refuses with a line of the new `OLD_FLAGS` table
  (`src/old-names.ts`); `--detached` is accepted and changes nothing until R-014. The running job's note is named
  `advisory` everywhere. No leftover files (hosted mode wrote only job folders). Review FAIL in round 1 (one blocking
  sentence in `docs/remote.md`, three notes fixed), PASS in round 2; gate 102/102. For Adrian: step 1.0 must show no
  running job (a hosted job would keep Pi in its pane); the main session's choices in `ticket.md` → `## Decisions`
  and the refusal wording at gate 5.1; `src/job/wake-text.ts:153` still says "open the tab and exit" in the advisory
  wake (outcome → Open points 2, for the wake rewrite of stage 5); `src/project/picture-tick.ts:19` still names
  `--tab` until R-007.
- R-006 `done` (delegated): private planning is cut (committed mode only; `.limen/planning-source` is a
  leftover file), and so are `limen planning`, `highlight`, `ticket-author`, `wait`, `ticket series`, `continue
  --review` and `group status --json`; each refuses with a line of `src/old-names.ts` (`ticket series` inside
  `ticket.ts`, `group status --json` through the new `refuseRemovedWords`), and `/limen <removed word>` in the wake
  hook notifies the refusal instead of toggling mute. The test helper `waitJob` watches the job's `state` in a child
  process instead of calling `limen wait`. Review PASS in round 1 (the first reply was rejected by
  `review-verdict.mjs` on its format and sent again); gate 108/108. For Adrian at gate 5.1: the refusal wordings; on
  the seat (optional): `$LIMEN_HOME/.limen/highlight` and `$LIMEN_HOME/.limen/series/` may be deleted.

- R-007 `done` (delegated, `limen-rebuild-4`): the Picture viewer (`picture/viewer/*`, the page `/`, `map.html`),
  `picture tick`, `picture watch` and the `picture` role are cut; `picture build` checks the map and writes the model
  only with `--json`; `picture serve` serves `/activity.json` and `/events` from the primary checkout's jobs, with no
  map. Refusals: two `OLD_NAMES`, two `OLD_FLAGS` and the new `OLD_ROLES` with `removedRole` (`resolvePreamble`
  refuses a removed role unless the project defines it), where R-009 adds `scout`. `LEFTOVERS` entries may carry a
  `marker` (counted only on a regular file that contains it, the folders on its path checked first, since `.git` is a
  file in a job worktree); the watch hook `.git/hooks/reference-transaction` is one, beside four `.limen` paths.
  A-088 and D-034 (with its correction): `waitJob` waits for `pid` to go; the keeper test's failure that raised it was
  environmental (git 2.34.1 without the gate's shim, outside `gate.mjs`), so a direct `node --test` of a test that
  runs `git worktree list` is no evidence on this laptop. D-035: a new `snapshot --git` after the main session edits
  a reserved path during `BLOCKED` (this run's `compare --git` was void for that reason; Adrian accepted it). Review
  PASS in round 1 (nine notes: one fixed in `outcome.md`, eight rejected with their tickets); gate 127/127. For Adrian
  at gate 5.1: the refusal wordings; outcome → Open points 5 (whether the seat still has a retired
  `limen-picture.timer`, which `docs/seat/README.md` no longer mentions); on the seat, step 1.1 now also lists a marked
  watch hook.

Night run of 2026-11-19 (until 07:00; `night.mjs` run 1 started at 00:08:19):
- R-009 `done` (delegated): the scout role (`templates/scout.md`, the manual's shape, table and escalation line, the
  scout wake) and the `jg` cue (the `jg --help` probe, `## Cue: Search`, `node:child_process` in the communication
  hook) are cut; `OLD_ROLES` has `scout`, so a spawn or continuation of the role refuses unless the project defines
  `.agents/limen/scout.md`. New `test/hook/communication.test.ts` (T-36's golden test: the same context with and
  without a `jg` on PATH, which never runs). Review PASS in round 1 (five notes: the main session renamed the new test
  file to mirror its module, T-29 (1), with `git add` and `git mv`, and added its own runs to the outcome) and round 2
  (one note, rejected); gate 133/133. For Adrian at gate 5.1: the refusal wording ("a survey job"; R-065 brings survey
  tickets). For R-039: the communication hook can still start `git` through `listDrift` (drift detection, not tool
  detection), which its T-36 scan meets (`R-009` → `ticket.md` → `## Decisions`).
- R-012 `done` (delegated): `seat/deploy.ts`, run as `node /opt/limen/seat/deploy.ts <sha>`, in D-008's order; the
  project registries are found through the homes of `/etc/passwd` (root has none; no registry at all is exit 4); the
  tag `deployed-<UTC time>` is created last, so a failed deployment leaves none; verifications run as processes from
  the new checkout (none at stage 1; R-017, R-032, R-056 add theirs); its output escapes control characters (text from
  job folders reaches root's terminal) and git runs without `GIT_DIR` and the other repository-location variables.
  Scans: no `.sh` in `seat/` and `bin/`, no dynamic `import(` in `src/` and `hook/`. Review PASS in round 1 (six notes:
  four fixed by a fresh implementer with tests 12–14, two rejected) and round 2 (one note, fixed in `ticket.md`); gate
  149/149. AC-6 (`node seat/deploy.ts` → exit 2) was refused by the permissions, so it is judged by test 11, which runs
  that command (Q-8). For Adrian at gate 5.1: the registry discovery through `/etc/passwd` and the tag name and place
  (`R-012` → `ticket.md` → `## Decisions`). For R-017: a signal handler, because an interrupt between the checkout and
  the tag leaves the new commit checked out (review round 1, finding 4).
- Q-8 (no ticket blocked): whether `node seat/deploy.ts <args>` goes on the allow-list (recommended: no). Answered
  by day on 2026-11-19 → D-036: it stays off; a criterion names only listed commands (`## Agents`, step 2).
- R-013 `done` (delegated; its `ticket.md` refreshed to `b8babe2` first): `src/outcome.ts` (`LimenError`, six classes
  with exit codes 0–5, `finalLine`, `failureOf`, the client `readOutcome`); `main` is the only place that sets the exit
  code and prints one final line per command process; flag errors and an unknown command exit 2; `ticket check`,
  `picture build --strict`, `github poll` (a rate-limited 403 is class 3) and `group wait` throw typed errors; `ids.job`
  for `spawn`, `continue`, `keeper`, `github review|work`, `ids.ticket` for `ticket new`; every test caller reads the
  final line. Review round 1: the first reply was rejected by `review-verdict.mjs` (one criterion over several lines)
  and a fresh reviewer ran again, PASS with nine notes, plus five from the rejected reply; ten fixed by a fresh
  implementer, five rejected; round 2 PASS (two notes: one accepted, one rejected). Gate 198/198. For R-014: removed
  names still exit 1 `UNTYPED` (the stage convention wants 2 and the new form in `next` after R-013; T-18), and the
  GitHub poller still reads `limen github deliver`'s text (T-26 (4)). For R-082: an App key that holds no usable PEM is
  likely not typed `GITHUB_CONFIG` (guessed). For Adrian at gate 5.1: the codes and `next` texts of R-013
  (`ticket.md` → `## Decisions`).

Day session of 2026-11-19 (`limen-rebuild-5`, started by Adrian; WSL booted at 10:34, after the `.wslconfig` of
2026-11-18 16:48, so the idle timeouts are off):
- R-014 `done` (D-037: the texts in `pair`, the implementation by `rebuild-implementer`): `src/registry.ts` (45
  entries), `src/parser.ts` (replaces `src/commands/flags.ts`), `src/help.ts` with Adrian's golden help, `status
  --all`, `show <job>`, `seat queue`, old names exit 2 `REMOVED`, `spawn` requires its four route flags (D-043),
  `group wait` member-only with `movedBy: "R-077"` (D-042). Decisions D-037–D-044 and T-19's dated addition; notes for
  R-023, R-032, R-034, R-037, R-044, R-066, R-077 and R-081 in `## Tickets`. One `BLOCKED` (two golden lines, D-043);
  reviews PASS in rounds 1–4 with three rounds of fixes, the third by Adrian's exception (D-044); round 4's three
  notes went to gate 5.1, R-023 and R-081. Gate 244/244.
- Adrian's standing request (2026-11-19, project memory): a push notification whenever a decision of his is needed,
  in any session.

Gate 5.1 summary (stage 1 is closed; the gate is by day, with Adrian):
- Close (2026-11-19, `limen-rebuild-6`, `## Stages` → Closing a stage): at `5c7ea31` the gate exits 0 with 244/244
  twice (once alone, once through the gate-time tool), `check.mjs` reports 0 errors and Biome is clean on
  `adrian-rebuild`; M-10: 77.1 s (`evidence/gate-time-a0.1.0.md`; baseline 79–88 s, `evidence/baseline.md`).
- Tickets: R-001–R-014 and R-088 done (15 of 15). Gate 244/244 at the last commit (198 after R-013, 127 after
  R-007).
- Findings addressed by stage 1 (each ticket's `## Problem` names how far): A-042 (R-001), A-027, A-060, A-076
  (R-002), A-049 (R-003, R-004), A-023 (R-005), A-079 (R-006), A-048 in part and A-088 (R-007), A-083 in part (R-008;
  the platform adapter is R-020), A-081 in part (R-009; the per-role lists are R-045); plus gate-2 items G1.3–G1.8,
  G1.12, §6, §7 D3 (R-012) and H-21 (R-011); taste rules T-18, T-19, T-26 (1), T-37 (`ids` declared) by R-014.
- Unmeasured: M-01 (the role texts R-002–R-009 and R-014 changed; from stage 4, E-1), M-05 (R-013's final line in
  every tool result; R-011's runner and R-088; R-014's required route flags and generated help), the seat steps B.2
  and 1.0–1.3.
- Fixed context before and after: not measured at stage 1 — `context-size.mjs` is on the list from stage 4, and the
  role texts stages 1–3 change sit in Pi's system prompt, which the bridge drops (E-1); the cue changed only by the
  `jg` cut, which never fired on the seat (T-36).
- Tag `a0.1.0`: local, on the commit `Stage 1: close` (its full SHA is in the gate reply and is the argument of
  `## Deployment` 0.2 and 1.0); a fix after the gate is a ticket of stage 1 and the tag `a0.1.1`.
- Seat steps: B.2 before the deployment; then `## Deployment` 1.0 (bootstrap of `seat/deploy.ts`), 1.1–1.3; plus the
  tickets' seat notes: the Devin login and `DEVIN_*` variables (R-003), `LIMEN_ENGINE=omp` in the worker's `~/.bashrc`
  and `moshi-hook status` (R-004), no running job at 1.0 (R-005), a retired `limen-picture.timer` (R-007), optional
  deletions under `$LIMEN_HOME/.limen/` (R-006).
- For Adrian's decision at the gate: the refusal wordings of R-002–R-009 and R-014 (with R-014's review round 4 note
  1: `limen jobs --all a1b2c3d4` and `limen jobs -- --all` name `limen show`, while D-038 says only `jobs <ref>` does;
  `R-014-command-registry/review.md` → Round 4); R-011's choices; R-012's registry discovery through `/etc/passwd`
  and the tag name and place; R-013's codes and `next` texts; R-014's `kind` calls (`outcome.md` → Open points). Q-8
  is settled (D-036).
- Seat note of R-014 for the deployment: a coordinator spawn without one of `--engine`, `--provider`, `--model`,
  `--thinking` now exits 2 and names the missing flags (D-043); `LIMEN_ENGINE` no longer chooses a spawn's engine.

Gate 5.1 decided (2026-11-19): D-045 and D-046; the dated addition to T-37 in `taste.md`; new rows R-089 (stage
2), R-090 and R-091 (stage 1) and notes for R-023, R-025 and R-032 in `## Tickets`; `## Deployment` 1.0 deploys
`a0.1.1`, and B.2 runs with R-091's runner.

Close of a0.1.1 (2026-11-19, `limen-rebuild-8`, `## Stages` → Closing a stage):
- At `74f62e2` the gate exits 0 with 253/253 twice (once alone, once through the gate-time tool), `check.mjs` reports
  0 errors and Biome is clean on `adrian-rebuild`; M-10: 82.2 s (`evidence/gate-time-a0.1.1.md`; 77.1 s at a0.1.0).
- Tickets since a0.1.0: R-090 and R-091 (done); D-047's handover tool, outside the ticket list.
- Findings and decisions closed: D-045 (3) and (4) (R-091, R-090); the gap of §7 D3 for a registry with no project
  (R-090).
- Unmeasured, besides a0.1.0's: R-090's listing against the seat's registries (step 1.0); R-091's marks against the
  real Pi in RPC mode (B.2; R-091 → `outcome.md` → Open points).
- Fixed context: not measured, as at a0.1.0 (`context-size.mjs` from stage 4).
- Tag `a0.1.1`: local, on the commit `Stage 1: close (a0.1.1)`; its full SHA is in the gate reply and is the argument
  of `## Deployment` 1.0.

B.2 on the seat (2026-11-19 evening, D-048; Adrian ran each step, the main session read the outputs; the files stay
in a scratch folder of the agents' account, outside the projects):
- Facts: `/opt/limen` is checked out at `f1e3a54` (upstream), whose code equals `rebuild-base` (`git diff --stat
  f1e3a54 rebuild-base` touches only five files of `docs/seat/`); the coordinators load Limen from the extra checkout
  in the agents' home (gate 2 §9 item 6, steps 5.5–5.6), which is at `rebuild-base` and clean; the agents' account
  has no `sudo`, and git refuses the root-owned `/opt/limen` unless `-c safe.directory=/opt/limen` is given for one
  command. The coordinator's route is `--provider pi-claude --model claude-opus-5-5 --thinking xhigh`, which Pi
  clamps to `high` (the session records `thinking high`; `pi-ai` → `clampThinkingLevel`).
- Engine fact found on the way (Pi 1.5.1 `docs/security.md`): in RPC, JSON and print mode Pi skips project-local
  extensions unless the run has `--approve`, a saved trust decision covers the folder, or `defaultProjectTrust` is
  `always`; the seat sets none, so every attempt passes `--approve` among the engine args. The runner adds no flag
  itself (R-011 item 3.3).
- The runner's checkout at `91cc2e4` passed its 57 tests on the seat's Node 26.
- Seat check of R-011 (D-021), passed by the second smoke attempt in a copy of the project with a one-line ticket
  that asks for a job: the headless coordinator loaded Limen's hooks (`limen-project-context` in its session), its
  worker ended `done` and the wake reached it as a user turn; no `protocol-error.json`, no extension error, `stops`
  empty (R-088, R-091). The first smoke attempt, whose ticket did not ask for a job, was done by the coordinator in its
  own session in 61 s. Both landed without an owner "land", the second while saying that this breaks the project's
  rule; the second slept once and read `status` four times (M-05 material).
- Candidate: F013 of synchronizer (one completed review that found issues, one fix, two failed reviewer jobs; 102 min
  from the first job's start to the last job's end, so `--time-limit 180`), from its start commit `1fe9df6` with the
  reference `948dfda` (the seven F013 commits only); the hidden tests are the four changed files under `test/`. The
  control runs: the reference with the hidden tests passes the project gate (9 checks, 116.8 s), and the start commit
  with them fails it (from `tsc` on, so the unit test binds to the reference's API: the absolute pass^k is
  pessimistic, the before/after comparison is not affected).
- Three attempts (k = 3): none started a job; each coordinator implemented F013 in its own session (44, 52 and 37 min,
  one touchpoint each), so no attempt has a candidate and `evaluate` refused all three. Attempt 1 is
  `void-contaminated`: a bash call of the coordinator read job evidence of F002 and F003 in the production checkout,
  whose absolute paths are written in committed notes of the project. The report: `passed 0 of 2; pass^2: no; void:
  1`. The loop's own log lines carry false exit codes (the main session's error: `$(date -Is)` resets `$?`); the
  report reads `result.json` and `evaluation.json`.
- By D-049 (2026-11-20): the diagnostic of the coordinators' own branches of attempts 2 and 3 (two and three commits
  on a branch of their own, nothing on `main`): each passes the project gate without the hidden tests (9 checks) and
  fails it with them from `tsc` on, because the hidden unit test imports two functions of the reference's API that
  neither branch has (`isNonce`, `parseProofAnswer`). Attempt 4, the rerun of attempt 1, started a worker job, so it
  had a candidate, which failed the gate with the hidden tests; it is `void-contaminated` too. The report over the four:
  `passed 0 of 2; pass^2: no; void: 2`. pass^3 is "no" whatever a third valid attempt gives, since two have failed.
- Open for the "after" runs (4.8, 9.1), not for B.2: the hidden unit test binds the evaluation to the reference's
  internal names, so a correct implementation under other names fails; B.2 is not affected, because neither valid
  attempt has a candidate. Whether the hidden tests become the integration test alone is decided before 4.8, after a
  control run of that variant.

- R-090 `done` (delegated, by day): `seat/deploy.ts` prints every registry and registry line it checked before any
  other line, and registries that hold no project refuse with exit 4 before the fetch. One `BLOCKED`: the gate failed
  on `test/structure.test.ts:24` because its whole-tree walk counted the 579 `.ts` files of the Pi sources in the
  ignored `adrian-rebuild/input/vendor/`; Adrian chose (a): the basename test counts only the files git knows that
  exist in the working tree. The implementer's first run was void by `compare --git` only through Adrian's own fetch
  of the sources during it, and Adrian accepted it. Review PASS in rounds 1 and 2 (one fix round: the ELOOP test, a
  split test, the listing without deleted index entries); gate 253/253. For R-025: the other scans of that test file
  still walk ignored files (`## Tickets` → notes).
- The Pi 1.5.1 sources are in `adrian-rebuild/input/vendor/` (Adrian, 2026-11-19, by `## Commands`, stage-2 row; the
  deny rule on `input/` refuses the sessions' `mkdir` there, so Adrian ran it). The `npm pack` lines are on the
  allow-list.

- R-091 `done` (delegated, by day, `limen-rebuild-7`): `pi-rpc.mjs` marks each of the 26 types Pi 1.5.1 writes in
  RPC mode `handled` or `skipped` (`MARKS`, from the package sources), extension requests by method and responses by
  command; a request Pi waits on, an unmarked type, method or command, an unknown disposition or a line that is not
  JSON ends the attempt with exit 4 and `<out>/protocol-error.json` holding the raw line; a run ends at
  `agent_settled`, a prompt answered `handled` waits for no run, and `result.json` carries `extensionErrors`,
  `touchpointsDefinition` and `transcript`. The implementer's run was void by `compare --git` only through Adrian's
  own edit of `.claude/settings.local.json` (the `handover.mjs` line), and he accepted it; AC-2 was the ticket's
  error (`fails-before.mjs` takes only `test/`), judged by the main session's before-run (57 tests, 15 failing at
  HEAD's runner). Review PASS in round 1 (four notes, rejected with reasons; two go to B.2 as open points in
  `outcome.md`); gate 253/253. B.2 can run with this runner.
- Handover incidents of 2026-11-19 (for the handover tool): `limen-rebuild-6` was still alive in `tmux` after its
  handover, idle with no child process, because `EndConversation` ends the conversation and not the `claude` process;
  the main session killed it at Adrian's request. Then Adrian resumed this conversation with `claude -r` in a WSL
  window while its first process still ran in `tmux` (`limen-rebuild-7`) with the implementer, so the conversation
  ran in two processes; the auto-mode classifier refused the main session's `tmux kill-session` of its own duplicate,
  and Adrian killed it; the implementer was resumed with `SendMessage` from its transcript (the tree was still clean).
  PR #2 (`adrian-rebuild` into `main`, opened by accident from Adrian's phone on 2026-11-18) was closed at his
  request, without deleting the branch.
- D-047 `done`: the handover tool `tools/handover.mjs` (`start <n>`, `close-previous`) with its test (21 tests, each
  failing before its change: 12 before the tool existed, 6 before review round 1's fixes, 3 before round 2's, 1
  before round 3's) and a review by `rebuild-reviewer` in three rounds, PASS each time; round 3's two code notes were
  fixed without a fourth review (Adrian, (a)) (`evidence/handover/`). The project memory note on the handover follows
  D-047.

Day session of 2026-11-20 (`limen-rebuild-9`; its `close-previous` printed `handover: stopped claude 822 (claude -r)`
and exited 0; after Adrian's `/remote-control` the session id, and so the context file, changed):
- D-052 (Adrian's answers to R-015's three questions): the exceptions besides `LIMEN_WORKER_MODEL`, the seat fact that
  no `LIMEN_*` is set in the agents' login shell, and the place of each setting.
- R-015 `done` (delegated): `src/config.ts` is the only reader of `process.env.LIMEN_*` in `src/`, `hook/`, `bin/` and
  `seat/`; its registry gives each of the 48 names a kind; `limits.json` alone sets `prepare`, `toolStall` and the new
  `toolCalls`, `start-gate.json` alone the start gate (also `"off"`); the environments of the wrapper, the engine and the
  group advance are built from the registry, which closes the leaks of `LIMEN_TIMEOUT_MS` and `LIMEN_CONTINUE` (both
  shown failing at HEAD); `limen status` names ignored settings and the exceptions with their tickets. Reviews PASS in
  rounds 1–3 with two rounds of fixes; round 3's three notes were text of `outcome.md` and `review.md`, fixed by the
  main session without a fourth review. Gate 277/277. The stage-2 row of `### Cost and effect per stage` and step 2.4
  now follow D-052 (review round 1, finding 6). For R-034: the `rule` timer still starts from the whole environment
  (`src/commands/rule.ts:136`); for R-054: a job can raise its own tool cap through the project root's `limits.json`,
  as it can its stall time (G2 accepted risk until then); for R-084: the person-naming comments of
  `src/runtime/start-queue.ts:16-17`. The implementer's scratch runners lie outside the repository in
  `/tmp/limen-r015-round2/` (Adrian removes them; `rm` is denied to the sessions).
- Cost of R-015 (the day session's readings of its context file): the weekly use went from 71 % to 75 %, the 5-hour
  window from 29 % to 54 %.
- R-016 `done` (delegated): `src/boundary.ts` parses data from outside with hand-written validators and returns the
  value or a typed `BAD_DATA` error (`LimenError`, class `environment`) that names the file, the field and the
  expectation, every control character and line terminator escaped; `limits.json`, `start-gate.json` and the client's
  final line go through it; ratchets in `test/structure.test.ts`: `JSON.parse` outside the module at most 41 − 3, casts
  at most 75 (runtime) and 7 (`test/`) by an AST count, `as unknown as` none, and a T-25 scan of the module's function
  names. Review round 1 FAIL on one blocking finding that was the main session's own omission (its `fails-before.mjs`
  output was not in `outcome.md` before the review; fixed), rounds 2 and 3 PASS; two rounds of fixes; round 3's three
  code notes go to R-021 (`## Tickets` → notes), as R-014's round 4 did by D-044. Gate 310/310. The implementer's
  scratch files lie in `/tmp/r016/` outside the repository. Cost: weekly 75 % → 77 %.

Active ticket: none.

Handover of 2026-11-19 (D-047, at 31 % context, after the commit `D-047:`): `limen-rebuild-7` (a `claude -r` in a
WSL window since 17:46, no `tmux`) started `limen-rebuild-8` with `node adrian-rebuild/tools/handover.mjs start 8`
(19:04:15, in `tmux`, with `--remote-control`) and ended its turn. `limen-rebuild-8`'s push notification was skipped
as redundant (the terminal was active); its `close-previous`, the tool's first real run, printed `handover: stopped
claude 613783 (claude -r)` and exited 0, and the process was gone afterwards (`evidence/handover/outcome.md` →
Measurement).

Handover of 2026-11-20 (D-047, at 38 % context, after B.2, the deployment of `a0.1.1` and the commit that records
them): `limen-rebuild-8` starts `limen-rebuild-9` with `node adrian-rebuild/tools/handover.mjs start 9` and ends its
turn. The next session's first acts: a push notification to Adrian that it takes over at stage 2; then `node
adrian-rebuild/tools/handover.mjs close-previous`, which should stop `limen-rebuild-8` (in `tmux`), and the session
reports its lines to Adrian; then `Next`. The handover after it is `limen-rebuild-10`, with `start 10`.

- B.2 closed on 2026-11-20 by D-050 (K = 2): `evidence/b2-same-task.md`. R-090 (`2be4b80`) and R-091 (`049097d`)
  are ancestors of `a0.1.1` (`91cc2e4`); the commits after it change only `plan.md` and `evidence/`.

Deployment of `a0.1.1` (2026-11-20, Adrian as root, guided step by step): D-050's three confirmations held (no
running job in either project; the snapshot of 0.1 holds as many entries as the source, 16397; R-090 and `a0.1.1` on
`origin/adrian-rebuild`); 1.0's bootstrap checkout and `seat/deploy.ts` exited 0 and tagged `deployed-2026-11-20-093125`,
listing one registry with eight projects, six of them B.2's clones (D-051). No coordinator was running, so 0.3 had
nothing to reload. D-051 done: the registry holds the two projects, the agents' `limen` resolves to
`/opt/limen/bin/limen`, and `limen --help` ends with R-013's final line.
- 1.1: the leftover list held `.limen/coordinator-events` (R-002) in synchronizer and `.omp/extensions/limen.ts`
  (R-004) in both projects; Adrian dropped all three. The OMP stub was tracked in both projects, so Adrian committed
  its removal on each `main` and pushed it (with `--no-verify`, past the projects' own `pre-push` hook: the agents'
  account holds the write credential and the hook is no barrier, A-006).
- 1.2, first half: `limen spawn --tab …` exits 2 with `REMOVED` and names its replacement (R-005, R-014); no job count
  was taken before it, so "no job made" rests on the test of R-005. The log tab half is checked by the trial route.
- 1.3: skipped, since the seat has no `limen-*` timer at all (no GitHub poller, no `limen-prune`, no retired
  `limen-picture.timer`).
- Tickets' seat notes: no `DEVIN_*` or `LIMEN_DEVIN*` variable and no `devin` (R-003); no `LIMEN_ENGINE` in the
  worker's `~/.bashrc`, and `moshi-hook` is not on the agents' `PATH` (R-004); no `highlight` or `series` under the
  seat folder (R-006).

- 0.6, the trial route (ledger, 2026-11-20 09:46–11:12 UTC): Adrian's usual "we continue the work" started F009,
  and the coordinator went on to F010 until he stopped it; both went through a worker, a review and repairs and were
  landed by the coordinator without his "land" (the rule is prose in the project, A-012, A-013; R-071 replaces it).
  Every one of the eight jobs recorded its Herdr tab (`herdr/mode` `watch`), so 1.2 holds; seven wakes reached the
  coordinator on their own, and it still slept six times and read `status` thirteen times (T-34, R-047). Final lines:
  19 `ok`; one `usage BAD_ARGUMENT` for `limen continue … --task-file`, a flag `continue` never had (refused at
  `rebuild-base` too); two `refused UNTYPED`, both right (`land` of a failed job, `land` with no commits; typed in
  stage 2). One repair failed in 3 s for want of a provider (`## Tickets` → notes → R-062), and one was stopped by the
  stall rule on a `sleep 360`. Times: F009 46 min from the first spawn to the last job, F010 31 min.
- D-012 holds (Adrian, 2026-11-20): both projects stay paused until `a0.3.0`; the trial ran two tickets because
  "continue the work" is the coordinator's standing instruction.
- The deployment of `a0.1.1` is complete (0.1–0.3, 0.6, 1.0–1.3). B.3 follows the deployment of `a0.2.0`.

Next: stage 2 by day, the lowest `planned` ticket whose dependencies are `done` (R-016, then R-017, R-018, …;
protocol step 1). A night run of stage 2 needs Adrian's word in the conversation and the checks of D-024.

Open questions for Adrian (asked 2026-11-20; he is away 2026-11-21 to 2026-11-23 with only his phone, no terminal and
no seat access, and wants the work to go on by day through Remote Control and push notifications and by night through
`night.mjs`):
1. When his weekly limit resets (Claude app → Settings → Usage): R-015 alone used about 4 points of the weekly limit,
   and stage 2 has 11 tickets left, so the limit, not the mechanism, bounds the three days.
2. A stop threshold, recommended (a): by day no new ticket at a weekly use of 90 % or more (finish the current one,
   push, notify), a night run only when the evening reading is below 80 % (a night run cannot read its use); (b) 95/85;
   (c) no night runs.
3. A cheaper review (a change of `## Agents` step 6), recommended yes: a PASS whose notes touch only docs or
   `outcome.md` is fixed by the main session without another review round; a fix of code or tests still gets a round.
4. A rehearsal on the night of 2026-11-20: Adrian asks for the night mode from his phone, the main session starts
   `night.mjs` through a permission prompt he approves there (D-024), and he answers in the morning from the phone.
   Before he leaves, at the laptop: sleep "Never" on mains power, the lid action "Do nothing", Windows Update paused,
   power and network kept; and whether the WSL start of 2026-11-20 06:14 was his own restart.
While he is away: the seat steps (2.0–2.4, B.3), edits of `.claude/settings.local.json` and `.claude/agents/*`, and a
void review that left a file the reviewer created (`rm` is denied) wait for his return; a ticket that waits on one
of them is `blocked`, and the session takes the next ticket that does not depend on it. R-017's contract check is
designed to run inside `node --test`, so that it needs no new allow-list line.

Notes for the next session:
- Start Claude Code in the repository root, so that it loads `.claude/agents/`.
- Progress lives in this section; the Claude Code task list mirrors the open steps when the tool is available.
- After moving or re-cloning the repo, run `sh adrian-rebuild/tools/install-hooks.sh` again.
- Run the gate as `node adrian-rebuild/tools/gate.mjs` (D-001, D-015). Before every commit run `node adrian-rebuild/tools/check.mjs`
  and `npx biome check --error-on-warnings adrian-rebuild`.
- Tracked files must not carry home or scratchpad paths; experiments live in the session scratchpad only.
- Adrian's gate-2 file lives only in `input/` (not tracked); everything in it is now copied into tracked files.
