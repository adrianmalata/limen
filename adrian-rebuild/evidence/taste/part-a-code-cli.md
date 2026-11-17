<!-- PL: Inwentarz opinii (gustu) autora Limena w obszarze kodu, CLI, testów, dokumentacji i ustawień domyślnych, odczytany z kodu przy tagu rebuild-base. Każda pozycja AU-2NN ma opinię, odwołania plik:linia sprawdzone na tagu, zyski, koszty, ocenę względem zasad Adriana (z. N) i status względem decyzji z bramki 2. Pozycje otwarte mają pytanie z wariantami do wywiadu z Adrianem w etapie 3. Stan: kompletny dla przydzielonego zakresu; prompty ról, ceremonie i rejestry opisuje osobny plik part-a-prompts.md. -->

# Author's taste, part A: code, CLI, tests, docs and defaults

- Axes: (1) what code decides vs prose, (2) naming and CLI UX, (3) code style, (4) tests, (5) docs, (6) defaults vs optional.
- Items: 40 (AU-201 to AU-240); per axis 5, 8, 11, 5, 3, 8.
- Gate 2 status: 18 settled by a decision, 22 open; every open item ends with a `Question` for the interview.
- Every `path:line` points at tag `rebuild-base` and was checked with `git show rebuild-base:<path>`; help text comes from `node bin/limen … --help`.
- Out of scope here: role prompts, process ceremony and communication registers (sibling file `part-a-prompts.md`).

## 1. What code decides vs what prose decides

### AU-201 Inform, do not gate
- Opinion: Code refuses only what is mechanically impossible; everything else becomes information that the coordinator judges in prose.
- Where: `CONTRIBUTING.md:28`, `CONTRIBUTING.md:31`, `.agents/limen/styleguide.md:16`, `spec/vision.md:10-11`, `src/job/record.ts:46-50`, `src/commands/spawn.ts:385-387`, `docs/commands.md:67`, `src/commands/linear.ts:6`
- Evidence: "Only impossible mechanics should error. Everything else informs." (`CONTRIBUTING.md:31`); "Behavior incidents should normally change templates, not add guards" (`CONTRIBUTING.md:28`).
- Gives: A small mechanism. A new behaviour costs a prompt edit, not code. The coordinator keeps its freedom: it may land with open checks, start a second job, or accept a served model that differs from the requested one.
- Costs: Every guarantee that matters (review before land, one job at a time, acceptance met) is probabilistic. `finalizeJob` writes `open-checks`, and `land` never reads it. Under the bridge the prose never reached the model (A-086), so on the seat nothing enforced these rules.
- Fit: conflicts with z. 14 (guarantees in code, not in the prompt); partial with z. 1 (success needs a deterministic criterion); A-012, A-013, A-014, A-031, A-086.
- Gate 2: settled by §5 #1 and G3: change (code decides land; the coordinator only calls it).

### AU-202 Land gates are mechanical and name the fix
- Opinion: `land` refuses on facts a script can check (state, index, overlapping dirty files, ticket syntax, the test-line cap), prints the command that fixes the refusal, and asks a person only at a terminal.
- Where: `src/commands/land.ts:94-96`, `src/commands/land.ts:124-127`, `src/commands/land.ts:150-151`, `src/commands/land.ts:171-172`, `src/commands/land.ts:252-254`, `src/commands/land.ts:38-40`, `test/s5-land.test.ts:46-52`
- Evidence: `fix: limen keeper ${bad} --job ${job} --engine <engine> …` (`src/commands/land.ts:253`); the confirm runs only `if (!parsed.yes && process.stdin.isTTY === true …` (`src/commands/land.ts:38`).
- Gives: A refusal leaves `main` where it was (asserted in `test/s5-land.test.ts:46-52`) and tells the caller what to run next. The cap is read from the target branch, so a branch cannot raise its own cap.
- Costs: The gates check form, not outcome: no review verdict, no acceptance check. The TTY-only confirm makes `land` behave one way for a person and another way for an agent.
- Fit: partial with z. 1 (deterministic but incomplete criterion); compliant with z. 11 and z. 12; A-012, A-013, A-021.
- Gate 2: settled by G3: keep the mechanical gates and extend them (PASS on the exact tip, checks, judgments, round limit); D2: cut the TTY confirm.

### AU-203 Role guards read environment variables
- Opinion: Whether a caller may run a command is decided by environment variables its process carries (`LIMEN_GROUP_ID`, `LIMEN_COORDINATOR`, `LIMEN_JOB`).
- Where: `src/commands/land.ts:27-29`, `src/commands/steer.ts:11-13`, `src/commands/keeper.ts:47-51`, `src/commands/wait.ts:14-18`, `src/commands/planning-source.ts:15-17`
- Evidence: `if (process.env.LIMEN_GROUP_ID) {` then "group members cannot land; the owner-facing lead owns landing" (`src/commands/land.ts:27-28`).
- Gives: Cheap checks with clear messages and no process inspection. The author chose this on purpose: "The switch alone decides who counts as a coordinator" (F958, quoted in `evidence/audit-pass2/history.md`).
- Costs: A job's own shell can set or unset the variable. `LIMEN_COORDINATOR` is inherited by every job (A-061). The guard stops mistakes, not a job that tries.
- Fit: conflicts with z. 14 (the guarded process controls the guard); A-029, A-061.
- Gate 2: settled by §2 "Registered coordinator" and A-029: change (process ancestry and record state decide; env checks stay only as mistake guards).

### AU-204 Control data travels inside free text
- Opinion: What a command does can depend on prose the model writes: a `done:` prefix in a stop reason, a `Ticket:` pointer in the task, an F-number in a label or a commit subject.
- Where: `src/job/record.ts:34-35`, `src/job/job.ts:204-209`, `src/commands/spawn.ts:365-371`, `src/main.ts:161`
- Evidence: `reason.startsWith("done:") ? "done" : "stopped"` (`src/job/record.ts:35`); `land` closes the tickets that the label, id or `Ticket:` pointers name, else the F-number that starts the commit subjects (`src/job/job.ts:204-209`).
- Gives: No extra flags or fields. The model writes one natural sentence and Limen reads what it needs.
- Costs: A second F-number in a label changes which tickets `land` closes. `limen stop <id> "done: …"` turns a stop into a landable `done` with no flag and no help line (A-032). Each free-text parser grows edge cases.
- Fit: conflicts with z. 2 (state decided by text content, not by a typed element); A-032, A-070, A-073.
- Gate 2: settled by A-032 (`stop --done "<reason>"`) and A-073, A-070 (exactly one required `Ticket:` pointer): change.

### AU-205 Maintenance rides on every command
- Opinion: No daemon runs Limen; each `limen` call first does seat housekeeping, and read commands may finalize dead jobs.
- Where: `src/main.ts:185-194`, `src/commands/jobs.ts:36`, `src/runtime/reap.ts:154-166`, `src/runtime/start-queue.ts:15-16`
- Evidence: `await resendNearbyPings(cwd).catch(() => {});` (`src/main.ts:187`); "no daemon runs it" (`src/runtime/start-queue.ts:16`).
- Gives: Nothing to install or keep alive. Recovery happens wherever someone works.
- Costs: `limen jobs` and `limen status` are not read-only, and they can wait 10 s to confirm a dead job (`src/runtime/reap.ts:160-165`). A dead job stays `running` while nobody runs a command (A-024). Any command can start a detached rule timer.
- Fit: partial with z. 1 (a hard failure is seen only when someone looks); A-005, A-024.
- Gate 2: open (A-024 adds a seat timer for the reaper and G1.3 cuts webhook resends; whether read commands stay free of side effects is not decided).
- Question: Should `jobs` and `status` be pure reads? (a) yes, only the `limen-sweep` timer reaps; (b) they may reap, but never wait; (c) keep maintenance on every command as a second path.

## 2. Naming and CLI UX

### AU-206 Flat verbs and a private vocabulary
- Opinion: One flat table of 30 commands, named with the author's metaphors: plant (project), seat (machine), land, keeper, pulse, wake, cabinet, doorbell, bell.
- Where: `src/main.ts:34-64`, `src/main.ts:128`, `src/main.ts:138-139`, `src/commands/close.ts:7`, `spec/vision.md:17`, `.agents/limen/styleguide.md:14`
- Evidence: "Exact names already used in the repo: job, worktree, pulse, wake, ticket, board." (`.agents/limen/styleguide.md:14`); `git grep -wic` over `src` and `hook` counts 119 lines with "plant" and 124 with "seat".
- Gives: Short names. One word per concept, used the same way in code, docs and prompts.
- Costs: A newcomer learns the vocabulary first. Some names mislead: `close FNNN` closes Herdr tabs, while `ticket done` closes a ticket; `ticket-author` is a top-level verb beside the `ticket` group; `jobs` and `status` overlap.
- Fit: partial with z. 13 (names and help are what the model chooses by); A-084.
- Gate 2: open.
- Question: Keep the vocabulary? (a) keep every name; (b) keep the verbs (`land`, `steer`, `prune`), use plain nouns in output (project, machine, job state) and fold `close` and `ticket-author` into groups; (c) rename to Git-like terms (`merge`, `start`).
- Example:
```text
  limen status [--all]                          # plant inbox: running, candidates to inspect, needs a decision (last 7 days), coordinator tabs

  limen close <FNNN>
  limen ticket-author <ticket-path>                 # creation-commit author, following Git renames

  limen ticket series [NAME PLANT [PLANT ...]]  # plants on this seat that share one F-number series; no arguments: this plant's series
```

### AU-207 One help string, written for the agent
- Opinion: All usage lives in one string of wide lines with defaults in brackets and a `#` comment; `limen <cmd> --help` is cut from it; it lists internal commands and ends with advice to the coordinator.
- Where: `src/main.ts:98-161`, `src/main.ts:205-220`, `src/main.ts:134`, `src/main.ts:153`, `src/commands/flags.ts:20-21`
- Evidence: `node bin/limen --help` prints 64 lines, the widest 356 characters; it ends "Pass a short coordinator instruction, not $(cat ticket.md). The ticket is a pointer, not the prompt."
- Gives: One source for usage, so the two help views cannot disagree. Defaults are visible in place. The model learns the intended use from help.
- Costs: Lines are too wide for a terminal. Internal commands (`rule timer`, `webhook deliver`, `github deliver`) sit beside user commands. Help and `docs/commands.md` still drift (`ticket done --on` is only in the docs, A-084). One strict parser exists (`flags.ts`), but 21 of the 31 files in `src/commands` read `args` by hand, so rules and wording differ by command.
- Fit: partial with z. 13 (help is a selection criterion, and some semantics, such as `stop "done: …"`, are missing); A-032, A-084.
- Gate 2: open (A-084 generates facts into docs; the help format is not decided).
- Question: Help format? (a) keep one wide string; (b) one structured spec per command (flags, defaults, one example) that drives parsing, `--help` and `docs/commands.md`; (c) short usage plus a pointer to the docs; in each case, hide internal commands or not.
- Example:
```text
usage:
  limen land <id|suffix|label> [--onto BRANCH] [--yes] [--keep-open]  # merge a done job onto the current branch and close its active ticket; --keep-open when more slices remain

Pass a short coordinator instruction, not $(cat ticket.md). The ticket is a pointer, not the prompt.
```

### AU-208 Messages: cause, then the next step
- Opinion: A refusal is one lowercase line: what is wrong, a semicolon, what to do. Diagnostics use a compiler format with `fix:`. Info lines carry a prefix (`land:`, `note:`, `warning:`, `next:`).
- Where: `src/commands/land.ts:124-127`, `src/commands/land.ts:136-138`, `src/commands/keeper.ts:78`, `src/commands/spawn.ts:257`, `src/commands/init.ts:35`, `src/picture/tickets.ts:126`, `src/commands/wait.ts:16`, `src/commands/spawn.ts:639`
- Evidence: "hosted spawn requires Herdr (HERDR_ENV=1); use --detached for an ordinary job" (`src/commands/spawn.ts:257`); `` message: `${problem}; fix: ${fix}` `` (`src/picture/tickets.ts:126`).
- Gives: The model acts on a refusal without reading docs. Messages are easy to grep.
- Costs: Some refusals become paragraphs (`src/commands/spawn.ts:639` is one sentence of about 400 characters). Messages name the author's tools (Herdr) where the cause is generic.
- Fit: compliant with z. 11 and z. 12; A-021.
- Gate 2: settled by G3 and A-021 ("refuses with an actionable reason", "a message and the exact next command"): keep.
- Example:
```ts
	if (dirty.staged.length) {
		throw new Error(
			`target ${target} has staged changes, and a merge would refuse or sweep them in: ${dirty.staged.join(", ")}; commit or unstage them first`,
		);

		throw new Error(
			`target ${target} has uncommitted changes in files this land would change: ${overlap.join(", ")}; commit or move them first`,
		);

		throw new Error(`keeper branch ${keeperBranch} already exists; land or delete it first`);
```

### AU-209 Two exit codes
- Opinion: A command exits 0 or 1. Every failure, refusal and usage error is 1; a no-op on an ended job is 0.
- Where: `src/main.ts:196-202`, `src/commands/stop.ts:21-24`, `src/commands/steer.ts:20-23`, `src/commands/ticket.ts:175-176`, `bin/limen:4-6`
- Evidence: `console.error(error instanceof Error ? error.message : String(error));` then `process.exitCode = 1;` (`src/main.ts:200-201`); `stop` on an ended job prints "`<id> is already <state>`" and exits 0 (`src/commands/stop.ts:21-23`).
- Gives: Simple scripting. `stop` is idempotent.
- Costs: A caller cannot tell "refused by a gate" from "crashed" or "bad flag" without parsing text. `steer --running` that reached no job exits 0.
- Fit: partial with z. 12 (the message is actionable, the code is not) and with z. 2 (the caller must read text to know the outcome); A-021.
- Gate 2: open.
- Question: Exit codes? (a) keep 0 and 1; (b) 1 failure, 2 usage error, 3 refused by a condition, with the condition on the first stderr line; (c) 0 and 1 plus a stable first line such as `refused: <reason>`.
- Example:
```ts
	} catch (error) {
		if (process.env.LIMEN_INTERNAL_RUN === "1" || process.env.LIMEN_INTERNAL_HOSTED === "1") {
			await failInternalJob(error);
		}
		console.error(error instanceof Error ? error.message : String(error));
		process.exitCode = 1;
	}
```

### AU-210 Plain text for both readers
- Opinion: Output is plain text lines for the model and the person alike; only `jobs` switches to an aligned table on a terminal; spawn prints the job id as soon as the record exists and again as its last line.
- Where: `src/commands/jobs.ts:31-33`, `src/job/view.ts:50-58`, `src/commands/spawn.ts:350-351`, `src/commands/spawn.ts:522-523`, `src/commands/spawn.ts:385-392`, `src/project/picture-tick.ts:134`, `src/commands/status.ts:110-127`, `docs/commands.md:63`
- Evidence: "In a terminal, `jobs` shows an aligned table for people. Through a pipe, it prints the compact format that tools read." (`docs/commands.md:63`); `picture tick` takes the last stdout line of `limen spawn` as the id (`src/project/picture-tick.ts:134`).
- Gives: No second format to maintain. Sections with counts and `none` read well in a wake or a tool result. `NO_COLOR`, `TERM=dumb` and `LIMEN_VIEW` are respected.
- Costs: Warnings (`note:`, `warning:`) go to stdout too, so a script must know which line holds the id. Only `group status` and `picture build` offer JSON. Internal callers parse prose.
- Fit: partial with z. 6 (`wait` and wakes print the whole final message); compliant with z. 11 (`status` names the next command); A-008, A-078.
- Gate 2: open (A-008 moves job text out of wakes into a fetch command; the format of read commands is not decided).
- Question: Machine output? (a) text only, as now; (b) `--json` on `jobs`, `status`, `land` and `spawn`, text for people; (c) text with a fixed first line per command (`id`, `state`) that tools read.
- Example:
```ts
			`Plant ${root}`,
			...(refused
				? [`Finish webhook rejects: invalid key (${refused}); fix the key, then run limen webhook test`]
				: []),
			`Running (${scan.running.length}):`,
			...(scan.running.length ? scan.running : ["  none"]),
			`Candidates to inspect (${ready.length}):`,
			...(ready.length ? ready : ["  none"]),
			`Needs a decision (${decide.length}):`,
			...(decide.length ? decide : ["  none"]),
```

### AU-211 Jobs by id, suffix or label
- Opinion: Every job command takes the full id, a unique id suffix, an exact label, or a unique label prefix of 3 or more characters; an id reads as date, feature, slug and random hex.
- Where: `src/job/job.ts:99-126`, `src/job/job.ts:127-137`, `docs/commands.md:7`
- Evidence: `` (id.endsWith(needle) || id.endsWith(`-${needle}`) || label.toLowerCase().startsWith(needle.toLowerCase()))) `` (`src/job/job.ts:116`); an ambiguous query refuses and lists the matches (`src/job/job.ts:125`).
- Gives: Little typing for a person; ids that sort by date and name the feature.
- Costs: A label prefix can match another job once new jobs exist, and it works the same for `land` and `stop` as for `jobs`. The id hoists the first F-number it finds in the label.
- Fit: none applies directly; an ambiguous match refuses, which fits z. 12.
- Gate 2: open.
- Question: Fuzzy references? (a) keep them for every command; (b) fuzzy for read commands only, full id or exact label for `land`, `stop` and `continue`; (c) full id only.
- Example:
```ts
	return `${new Date().toISOString().slice(0, 10)}-${slug}-${randomBytes(4).toString("hex")}`;
```
```text
  limen stop <id|suffix|label> [reason]

Where the reference shows them, IDs, unique suffixes, and unique labels work the same.
```

### AU-212 Refuse before the first write
- Opinion: Spawn checks everything before it creates anything; once the record exists it prints the id; a later failure marks the job `failed` instead of leaving debris.
- Where: `src/commands/spawn.ts:350-351`, `src/commands/spawn.ts:360-363`, `src/commands/init.ts:39-50`, `test/s1-spawn.test.ts:37-62`
- Evidence: test name "each spawn refusal exits 1, names its cause and leaves no job, worktree or branch" (`test/s1-spawn.test.ts:37`).
- Gives: A refused command can be retried as it is. A killed caller still names its job.
- Costs: The preflight grows with every engine and mode (12 refusal cases in one test). Not every command follows it: land's ticket close renames folders before its commit and keeps them on failure (A-021).
- Fit: compliant with z. 12, and with z. 29 in spirit (no half-done state); A-021, A-057.
- Gate 2: open (A-021 applies the idea to `land`; a rule for every command is not decided).
- Question: (a) keep it as a property of spawn; (b) make "a refusal leaves no trace" a rule for every state-changing command, each with a table test like `s1`; (c) only for spawn and land.
- Example:
```ts
	for (const [args, cause, env] of refusals) {
		const run = limen(p, ["spawn", ...args], env ? { env } : {});
		assert.equal(run.status, 1, args.join(" "));
		assert.ok(run.stderr.includes(cause), `${args.join(" ")}: ${run.stderr}`);
	}
	assert.deepEqual(traces(), clean);
```

### AU-213 init is idempotent and asks nothing
- Opinion: `limen init` never overwrites a file, prints `created` or `kept` for each, refuses legacy paths, ends with one `next:` line, and asks no questions.
- Where: `src/commands/init.ts:82-89`, `src/commands/init.ts:39-50`, `src/commands/init.ts:52-57`, `docs/commands.md:175`
- Evidence: `await copyFile(source, target, constants.COPYFILE_EXCL);` (`src/commands/init.ts:86`).
- Gives: Safe to rerun after an upgrade. Project files belong to the project.
- Costs: The settings that matter (job limit, routes, modules) have no place at init; they come from env vars or from later edits.
- Fit: partial with z. 16 (init sets nothing about what agents may change); A-014, A-030.
- Gate 2: settled by A-014 and A-030: change (init asks for `maxJobs`, module switches, round limit, routes and the gate command; without a terminal it requires flags).
- Example:
```ts
	if (!hasCommit(root)) {
		console.log(NO_COMMIT);
	}
	console.log(
		"next: write spec/vision.md and .agents/limen/styleguide.md, commit, then open a coordinator in this folder (docs/setup.md)",
	);
```

## 3. Code style

### AU-214 Zero runtime dependencies, no build step
- Opinion: The package has no runtime dependency and no build: Node 24 runs the TypeScript sources by type stripping, as ESM with `.ts` imports, and system tools (git, tar, ps, Ruby on macOS) fill the gaps.
- Where: `package.json:5`, `package.json:30`, `package.json:51`, `bin/limen:9`, `bin/limen:21`, `tsconfig.json:15-17`, `test/structure.test.ts:28`, `src/commands/land.ts:314`, `src/runtime/contain.ts:223`
- Evidence: `"dependencies": {},` (`package.json:51`), asserted by `assert.deepEqual(pkg.dependencies, {});` (`test/structure.test.ts:28`).
- Gives: Nothing to audit or update from npm. The source is the release. `npm ci` takes seconds.
- Costs: Hand-written parsers instead of libraries: front matter (`src/picture/frontmatter.ts`, 399 lines), Markdown (`src/picture/markdown.ts`, 316 lines), flag rules. Hidden system needs: git 2.36 or later for `worktree list -z` (`evidence/baseline.md`), `tar`, `ps`; nothing declares or checks them.
- Fit: none applies; gate 2 named it the author's taste (H-15).
- Gate 2: open (gate 2 §4, H-15).
- Question: (a) keep zero runtime dependencies; (b) allow a short vetted list (for example a YAML parser, a schema validator for `record.json`); (c) zero in the core, allowed in optional modules; in each case, declare and check the system tools (git version).
- Example:
```js
// Limen runs its TypeScript sources by Node's type stripping. Drop only that one warning; others still print.

const { main } = await import("../src/main.ts");
await main(process.argv.slice(2));
```

### AU-215 Lint rules with reasons, debt kept visible
- Opinion: Biome's recommended rules plus a few named rules, each with a one-line reason in the config; tabs and 120 columns; any warning fails; functions stay under cognitive complexity 25 and 70 lines; a stricter "target style" binds one sample file; code over a limit carries a `biome-ignore` that says so.
- Where: `biome.jsonc:10-12`, `biome.jsonc:14-15`, `biome.jsonc:28-30`, `biome.jsonc:34-37`, `biome.jsonc:68-84`, `CONTRIBUTING.md:35`, `src/runtime/wrapper.ts:62-63`, `.agents/limen/styleguide.md:25`
- Evidence: "Wide lines hide a second idea at the end of the first." (`biome.jsonc:11`); 40 of the 41 `biome-ignore` comments in `src`, `hook`, `bin`, `test` and `picture` say "split pending" or "same split".
- Gives: Each rule is argued, so Adrian can keep or drop it one by one. The suppressions form a searchable debt list.
- Costs: Practice lags the rules. CONTRIBUTING says a suppression marks "a site where the code is right and the rule is wrong" (`CONTRIBUTING.md:35`), yet 40 mark pending splits. The styleguide says "never a cast" (`.agents/limen/styleguide.md:25`), yet about 80 `as` casts remain, 18 of them `JSON.parse(…) as T` with no validation. At least 253 lines in `src` and `hook` are wider than 120 characters, because long strings are never split.
- Fit: compliant with z. 21 (checkable style lives in a tool); A-047.
- Gate 2: open.
- Question: (a) keep the config and the suppressions as a debt list; (b) the rebuild clears every "split pending" and replaces casts of parsed JSON with a validator; (c) apply the target style (complexity 20, no nested ternary) to all new code.
- Example:
```jsonc
		"indentStyle": "tab",
		// Wide lines hide a second idea at the end of the first. Long string literals stay wide; the formatter does not split them.
		"lineWidth": 120

				// A function the reader cannot hold at once. Split it into named steps. 25 is the low end of the 25 to 40 range Adam set.
				// Each function over the limit carries a `biome-ignore` with its reason; search for `biome-ignore lint/complexity` to list them.
				"noExcessiveCognitiveComplexity": { "level": "error", "options": { "maxAllowedComplexity": 25 } },
```
```ts
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: split pending: internal job runner
// biome-ignore lint/complexity/noExcessiveLinesPerFunction: same split as the line above
```

### AU-216 Small plain modules, no shared helpers
- Opinion: Plain functions, union types, early returns and `readonly`; no classes, enums, barrels, `index.ts`, `types.ts` or `utils.ts`; unique TypeScript basenames across the tree; a short helper is copied, not shared.
- Where: `CONTRIBUTING.md:15`, `.agents/limen/styleguide.md:8-9`, `.agents/limen/styleguide.md:36`, `test/structure.test.ts:29-30`, `src/commands/land.ts:389-394`, `src/commands/stop.ts:103-108`, `src/job/record.ts:14-27`, `src/project/series.ts:229-236`, `src/project/seat-rules.ts:36-46`, `src/job/group-cabinet.ts:101-105`
- Evidence: "Duplicating a short function is cheaper than a helper bag." (`.agents/limen/styleguide.md:36`); 19 files define their own `text(path)` reader; at least six modules write their own temp file plus `rename`.
- Gives: Each file reads on its own; no web of imports around a helper module. Strict compiler options (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`) and no `any` (0 hits) keep types honest; 0 classes and 0 enums.
- Costs: Copies drift: `atomicWrite` calls `fsync` (`src/job/record.ts:19`), the copies in `series.ts` and `seat-rules.ts` do not. The two lock implementations differ (AU-222). A fix must be found in every copy.
- Fit: none applies directly; A-018, A-022, A-085.
- Gate 2: open (A-018 already requires one lock module and A-022 one `atomicWrite` for every write in `spec/` and job files; the general rule is not decided).
- Question: (a) keep "copy, do not share", except where A-018 and A-022 require one module; (b) allow one small file-system module (read, atomic write, lock) that every file uses; (c) share any helper that appears three times.
- Example:
```ts
function text(path: string): Promise<string> {
	return readFile(path, "utf8").then(
		(value) => value.trim(),
		() => "",
	);
}
```

### AU-217 Layout by concern; commands call commands
- Opinion: `src/` splits by concern (commands, job, runtime, project, integrations, picture) with one file per CLI verb; `hook/` stays where engines load it; one command reuses another by passing it an argv array, and the last stdout line is an internal contract.
- Where: `CONTRIBUTING.md:17-24`, `src/commands/keeper.ts:109-116`, `src/project/picture-tick.ts:122-134`, `hook/finish.ts:3`
- Evidence: keeper builds `["--role", "keeper", "--detached", "--branch", keeperBranch, …]` and calls `spawnCommand` (`src/commands/keeper.ts:109-116`).
- Gives: Every internal path goes through the same flag checks a person meets. Fewer internal APIs.
- Costs: Internal calls depend on flag spelling and on text output. Commands import each other (`keeper` imports `land` and `spawn`, `land` imports `prune`, `spawn` imports `diff`), so `src/commands` is also a library. `hook/` imports from `src/`, so each engine session loads part of the CLI. Files are large: `hook/wake.ts` 1 336 lines, `src/commands/spawn.ts` 864.
- Fit: none applies directly; A-082.
- Gate 2: open.
- Question: (a) keep argv reuse; (b) typed functions in `src/job` and `src/runtime` that commands call, argv only at the CLI edge; (c) keep argv, but internal callers get a structured result instead of parsing stdout.
- Example:
```ts
		await spawnCommand(
			[
				...options.route,
				...["--role", "keeper", "--detached", "--branch", keeperBranch, "--timeout", options.timeout],
				...["--label", label, "--task-file", packetFile, ...repo],
			],
			cwd,
		);
```

### AU-218 Comments say why, and cite the decision
- Opinion: Comments explain why, in full sentences; a one-line JSDoc states a function's contract; config files argue each setting; comments and test names cite the ticket, decision or commit behind them.
- Where: `src/job/record.ts:12-13`, `src/commands/land.ts:171-172`, `src/main.ts:189`, `src/runtime/start-queue.ts:15-16`, `src/job/task-note.ts:8`, `test/s2-hosted.test.ts:121`, `.agents/limen/styleguide.md:39`
- Evidence: "The cap is read from the target's vision, the owner's copy, so a branch cannot raise its own cap." (`src/commands/land.ts:171`); "Adam's decision 85 (a) set 25% and 20%." (`src/runtime/start-queue.ts:16`).
- Gives: The reason sits at the line that needs it. No `TODO` or `FIXME` in `src` and `hook` (0 hits) and no banners.
- Costs: Rationale is split between comments and 199 ticket folders; a cited decision ("decision 85", "F950") has no index in the repo. About 1 100 comment lines in about 24 400 lines of `src` and `hook`.
- Fit: partial with z. 36 (the code links to a decision, but there is no decision index with status); A-085.
- Gate 2: open.
- Question: (a) keep why-comments with ticket and decision references; (b) why-comments only, rationale in numbered decision records that the code links to; (c) fewer comments, rationale only in tickets.
- Example:
```ts
// The job record is a directory of plain files. `state` is the commit point observers key on;
// everything a reader needs must be durable before it flips to a terminal value.

// The cap is read from the target's vision, the owner's copy, so a branch cannot raise its own cap.
// Only a branch that adds test lines and leaves test/ over the cap is refused; deletions always land.

// The machine is shared by every plant, so one queue and one gate serve the whole seat. A detached job's own wrapper
// waits in it after its handshake and before setup; no daemon runs it. Adam's decision 85 (a) set 25% and 20%.
```

### AU-219 One catch at the top; side channels swallow
- Opinion: Code throws a plain `Error` with a finished message; `main` prints only the message and exits 1; anything called a side channel (webhooks, rules, wakes, logs) swallows its own errors.
- Where: `src/main.ts:185-202`, `src/job/record.ts:45`, `src/job/record.ts:57`, `hook/finish.ts:75-77`, `src/commands/land.ts:76-78`
- Evidence: "A webhook is a side channel: a bad queue entry never stops the command the human asked for." (`src/main.ts:185`); 40 `.catch(() => {})` and 108 `catch {` blocks in `src` and `hook`.
- Gives: The requested command finishes when an optional part fails. Users see no stack traces.
- Costs: Failures vanish: when the close commit fails, `land` prints "land: tickets stay active: …" and exits 0 (A-021). There are no error kinds, so a caller cannot react to a class of failure. Debugging needs the job log, and some paths fail to write it too.
- Fit: partial with z. 12; conflicts with z. 1 where a swallowed error ends in a false success; A-021, A-052.
- Gate 2: open (S1+ adds a failure kind to the record and A-021 requires exit ≠ 0 for land; the general rule is not decided).
- Question: (a) keep; (b) every swallowed error writes one line to the job log or to `limen status`, and every command failure has a kind; (c) no swallowing outside the webhook path.
- Example:
```ts
		// A webhook is a side channel: a bad queue entry never stops the command the human asked for.
		if (!(name === "webhook" && rest[0] === "deliver")) {
			await resendNearbyPings(cwd).catch(() => {});
		}
		// A rule whose timer died still ends once; this only starts a detached timer.
		try {
			endDueRules(args);
		} catch {
			// A rule record is a side channel too.
		}
```

### AU-220 Engine APIs typed by hand in each hook
- Opinion: Each hook declares only the parts of the Pi API it uses as local types; the project stub takes `pi: unknown`; Limen never depends on Pi's packages.
- Where: `hook/finish.ts:9-25`, `templates/limen-extension.ts:6`, `tsconfig.json:21`, `biome.jsonc:106-115`
- Evidence: `type PiApi = {` … `on(event: "agent_before_settle", handler: (event: SettleEvent) => object | undefined): void;` (`hook/finish.ts:9-23`).
- Gives: Zero dependencies hold; hooks typecheck without Pi; one hook serves Pi and OMP.
- Costs: The local types can drift from Pi with no failing check; an engine change (Pi 1.2.0 to 1.5.1, the bridge) shows only on the seat. The seat's own Pi extensions are outside every check (`biome.jsonc:106-115`, `tsconfig.json:21`).
- Fit: partial with z. 18 (an engine change needs the same tests again, and none runs against the real API); A-047, A-086.
- Gate 2: open.
- Question: (a) keep local types; (b) Pi's types as a pinned dev dependency, hooks typechecked against Pi 1.5.1; (c) a contract test that loads each hook in the real Pi version on the seat.
- Example:
```ts
type PiApi = {
	registerTool?(tool: {
		readonly name: string;

	on(event: "agent_before_settle", handler: (event: SettleEvent) => object | undefined): void;
	on(event: "session_stop", handler: (event: StopEvent) => object | undefined): void;
};
```

### AU-221 A job is a folder of one-value files
- Opinion: A job record is a directory of small text files, one fact per file with a trailing newline; `state` is the commit point; the record is built in a hidden folder and published by one rename; a person may repair it by editing a file.
- Where: `src/job/record.ts:12-13`, `src/job/publication.ts:103-123`, `src/job/publication.ts:170-172`, `src/job/publication.ts:185`, `docs/jobs.md:234`
- Evidence: "The job record is a directory of plain files. `state` is the commit point observers key on;" (`src/job/record.ts:12`); recovery step "Correct the plain `state` file. Then resume." (`docs/jobs.md:234`).
- Gives: `cat` and `ls` are the debugger. Each writer touches only its file. Publication is atomic (A-057).
- Costs: About 60 file names per job (`evidence/map/cli-flow.md` §2a), written by many modules, some atomically and some not (A-022). No schema and no version. JSON parts are read with a cast and no validation (AU-215). State changes race (A-019).
- Fit: compliant with z. 22 (plain text as the source of truth); A-019, A-022, A-053, A-057.
- Gate 2: settled by S1+: change (one `record.json` with a schema version, written only by the transition function; content files stay separate; publication by rename stays, A-057).

### AU-222 The file system is the lock service
- Opinion: Locks and claims are file-system primitives: `mkdir` with an owner pid file, exclusive `wx` creates and `rename`; waiting is polling.
- Where: `src/job/group-cabinet.ts:110-125`, `src/project/seat.ts:58-78`, `src/job/publication.ts:185`
- Evidence: `const deadline = mode === "wait" ? Infinity : Date.now() + (mode === "skip" ? 0 : 10_000);` (`src/job/group-cabinet.ts:117`); the seat lock busy-waits with `Atomics.wait(…, 10)` (`src/project/seat.ts:78`).
- Gives: No lock server; it works across processes and accounts that share a disk.
- Costs: Two implementations with different rules (10 s limit vs no deadline). A reused pid keeps a dead lock alive forever (A-017). A stale `poll.lock` disables the doorbell (A-018).
- Fit: conflicts with z. 1 (a wait with no limit and no escalation); A-017, A-018, A-036.
- Gate 2: settled by A-017 and A-018: change (one lock module; owner identity with start time and boot id; waits bounded to 60 s).

### AU-223 The owner is named in the product
- Opinion: Limen is written for one owner, and the code names him: refusals, tests, the board and the viewer say "Adam".
- Where: `src/commands/land.ts:204`, `test/structure.test.ts:55`, `src/project/lanes.ts:21`, `src/picture/tickets.ts:293`, `picture/viewer/viewer.js:8`, `spec/vision.md:13`, `src/runtime/start-queue.ts:16`
- Evidence: "… or ask Adam to raise the cap." (`src/commands/land.ts:204`); the ticket front matter key `needs-adam` (`src/picture/tickets.ts:293`).
- Gives: Concrete messages for the one person who runs the seat.
- Costs: Wrong for any other owner: on Adrian's seat a model that reads "ask Adam" gets a false instruction. The ticket schema carries the name.
- Fit: none applies; A-084.
- Gate 2: open.
- Question: (a) say "the owner" everywhere; (b) read an owner name from a project file; (c) keep the names.
- Example:
```ts
		refuse: `test/ would hold ${lines} lines; spec/vision.md caps it at ${cap}. Remove ${Math.min(lines - cap, added - removed)} test lines in this branch, or ask Adam to raise the cap.`,

			const ask = ticket.needsAdam ? `; needs Adam since ${ticket.needsAdam.on}: ${ticket.needsAdam.ask}` : "";

		["needs", "Needs Adam", "Decide here first"],
```

### AU-224 Config: env var, then file, then constant
- Opinion: A setting comes from an environment variable first, then a tracked JSON file, then a constant; files are read again at each use; a bad entry is ignored and named in the log, not refused.
- Where: `src/project/limits.ts:5-6`, `src/project/limits.ts:12-19`, `src/project/limits.ts:38-48`, `src/runtime/start-queue.ts:46-49`, `src/runtime/engine.ts:87-90`, `docs/jobs.md:161`
- Evidence: "Milliseconds for one limit: a positive env var wins, then the plant's file, then `fallback`." (`src/project/limits.ts:12`); `git grep -ohE 'LIMEN_[A-Z0-9_]+' rebuild-base -- src hook bin | sort -u` lists 84 names.
- Gives: Tests and one-off runs override anything without editing files. An edit reaches running jobs.
- Costs: The 84 names mix three kinds with one prefix: transport between Limen's own processes (`LIMEN_JOB_DIR`, `LIMEN_INTERNAL_RUN`), test knobs (`LIMEN_REAP_CONFIRM_MS`, `LIMEN_START_POLL_MS`) and user settings (`LIMEN_ENGINE`, `LIMEN_WORKER_MODEL`); no list exists. An env var in a job's environment beats the owner's file. A typo in a file stays silent until someone reads the log.
- Fit: conflicts with z. 16 (an env var bypasses the file that bounds what agents may change); A-011, A-030.
- Gate 2: open (A-030 cuts the model env vars and refuses missing route fields; G1.10 puts module switches in `limits.json`; the env-over-file order is not decided).
- Question: (a) keep env > file > constant; (b) owner files only, env vars only for tests under a `LIMEN_TEST_` prefix, unknown keys refuse; (c) an env var may lower a limit but never raise it.
- Example:
```ts
/** Milliseconds for one limit: a positive env var wins, then the plant's file, then `fallback`. */
export function limitMs(limit: Limit, fallback: number, root = process.env.LIMEN_CONTEXT_ROOT): number {
	const configured = Number(process.env[VARIABLES[limit]]);
	if (Number.isFinite(configured) && configured > 0) {
		return configured;
	}
	return (root ? plantLimits(root).limits[limit] : undefined) ?? fallback;
}
```

## 4. Tests

### AU-225 Scenarios through the real binary, with a scripted fake engine
- Opinion: Tests run the real `bin/limen` on a throwaway "plant" repo with real Git and real processes; one fake engine plays `pi` and `omp` from a script in the task text and loads the real hooks; a fetch sink records every request; tests wait on files and FIFOs, not on sleeps.
- Where: `test/plant.ts:1-3`, `test/plant.ts:53-76`, `test/fake-engine.mjs:2-8`, `test/s8-groups.test.ts:129-130`
- Evidence: "Scenarios wait on `limen wait`, file events and FIFOs; nothing here sleeps." (`test/plant.ts:3`); script verbs "commit · fail <code> · error … · say <text> · tool <command> · block · orphan · finish" (`test/fake-engine.mjs:4`).
- Gives: Tests prove what a user sees, across process boundaries, with no model and no network. The full gate runs in about 80 s on Adrian's laptop (`evidence/baseline.md`).
- Costs: A fake engine cannot show what a real engine or the bridge does with Limen's text (A-086 went unseen). Tests depend on the platform (git 2.36 or later, a private `TMPDIR`; `evidence/baseline.md`). One real 12 s hold remains (`test/s8-groups.test.ts:130`).
- Fit: compliant with z. 40 (mechanism tests); partial with z. 41 (no end-to-end task with a model and a grader); A-051, A-086.
- Gate 2: open (A-051 adds golden prompt tests and a seat check, §2 Measurement adds same-task runs; the fake-engine suite itself is not decided).
- Question: (a) keep the scenario suite and the fake engine as the gate; (b) add a replay engine that plays recorded bridge sessions; (c) move part of the suite to unit tests to save lines.

### AU-226 Numbered files, sentence names
- Opinion: Test files are numbered `sN-` (scenario through the CLI) or `uN-` (unit) and open with a one-paragraph claim; each test name is a full behaviour sentence, often with the commit or ticket that broke it; few tests carry many assertions.
- Where: `test/s5-land.test.ts:1-2`, `test/s2-hosted.test.ts:121`, `test/s3-finish-wake.test.ts:115`, `test/u3-turn-signal.test.ts:40`
- Evidence: 25 test files and 83 tests (`evidence/baseline.md`) for about 24 400 lines of `src` and `hook`; the numbers have gaps (no `u8`, no `u12`), and `u3` still makes a `u12-` temp folder (`test/u3-turn-signal.test.ts:40`).
- Gives: A failing test reads as a broken promise. The commit reference leads to the original bug.
- Costs: The numbers carry no meaning and go stale. A long test fails as one unit; its first failed assertion hides the rest. A name with several clauses tests several mechanisms at once.
- Fit: none applies.
- Gate 2: open.
- Question: (a) keep; (b) files named by mechanism (`land.test.ts`), one behaviour per test; (c) keep sentence names, drop the numbers and commit references.
- Example:
```ts
// S5 · Land. One plant whose main already holds more test lines than its cap. Every refusal must exit 1 and leave main
// where it was; the candidates that pass land by fast-forward and by merge beside another session's uncommitted file.

test("a live OMP job stays running while Herdr reports done, then after Herdr loses its agent row (88fd5ac)", async () => {

test("stop, timeout, the tool cap and a stalled tool each end a job once and wake its session once; 80% of a timeout steers once; the plant's limits file yields to an env var", async () => {
```

### AU-227 A hard cap on test lines
- Opinion: `test/` may hold at most 3,500 lines; the number is a sentence in `spec/vision.md` that only the owner changes; a test and `land` enforce it; new tests replace old ones.
- Where: `spec/vision.md:13`, `test/structure.test.ts:48-56`, `src/commands/land.ts:165-169`, `src/commands/land.ts:171-205`
- Evidence: "The test folder `test/` holds at most 3,500 lines. Only Adam changes this number." (`spec/vision.md:13`); `test/` holds 3,499 lines at the tag.
- Gives: The suite cannot grow without a choice, and tests stay dense. A branch cannot raise its own cap.
- Costs: The suite is one line under the cap, while gate 2 adds tests (A-005, A-022, A-031, A-048, A-051, D3, §6). The pressure produces long tests with many claims (AU-226). The cap is read from prose by a regex.
- Fit: compliant with z. 31 (a complexity budget), but in tension with z. 31's fixed regression suite; A-051.
- Gate 2: open (G3 keeps the test-line cap among the land conditions; the number and its home are not decided).
- Question: (a) keep 3,500; (b) set a new number at the start of the rebuild and store it in `limits.json` (an owner file) instead of prose; (c) cap `src/` and `hook/` instead of tests.

### AU-228 One gate command; repo rules are tests
- Opinion: `npm run check` is the one gate: typecheck, Biome with warnings as errors, the whole suite; repository rules (no dependencies, unique basenames, template history) are tests, not review items.
- Where: `package.json:24`, `package.json:27`, `test/structure.test.ts:24-46`, `.github/workflows/check.yml:10-13`, `CONTRIBUTING.md:11`
- Evidence: `"check": "tsc --noEmit && biome check --error-on-warnings . && node --test …"` (`package.json:27`).
- Gives: One command for a person, CI and an agent. A rule a reviewer would forget fails by itself.
- Costs: Docs drift: "Each test has a 30s timeout" (`CONTRIBUTING.md:11`) against `--test-timeout=180000` (`package.json:24`). The basename scan walks the whole tree, `spec/` included. CI runs on Linux and macOS.
- Fit: compliant with z. 21 and z. 31; A-084.
- Gate 2: settled by D-001, A-022, A-048, D3, A-085 and A-047: keep and extend (more structural tests, `shellcheck`, `systemd-analyze`); A-083 drops macOS.

### AU-229 Tests follow incidents, not the command list
- Opinion: A test exists where a mechanism broke; a command without an incident has no test.
- Where: `src/commands/diff.ts:8`, `src/commands/open.ts:6`, `src/commands/planning-source.ts:7`, `src/commands/linear.ts:7`, `src/commands/board-view.ts:37`, `src/commands/land.ts:61`, `src/commands/prune.ts:22`
- Evidence: `git grep` over `test/` finds no run of `limen diff`, `open`, `planning`, `linear`, `picture serve|tick|watch`, `ticket done`, `board --write`, `land --keep-open` or `prune --dry-run` (`evidence/map/tests-docs.md` §2).
- Gives: Every test pays for itself, and the cap (AU-227) holds.
- Costs: Untested paths include ones that commit or delete (`ticket done` commits; `prune --retire` deletes, A-002). No test checks the assembled prompt (A-051).
- Fit: compliant with z. 38 (structure earned by a second occurrence); partial with z. 31; A-002, A-051.
- Gate 2: open (§6 and A-051 add named tests; there is no coverage rule).
- Question: (a) keep testing by incident; (b) every command and flag that survives the rebuild has at least one scenario; (c) every mechanism has a mechanism test, and every module that is off by default has a "refuses when off" test.

## 5. Docs

### AU-230 Plain technical English, by role, mechanism last
- Opinion: Docs use short plain sentences in second person, split the reader by role (coordinator, operator), put "How it works" last, and the repo keeps the author's design history next to the product.
- Where: `docs/setup.md:18`, `docs/commands.md:5`, `docs/jobs.md:11-17`, `docs/jobs.md:237-239`, `spec/features/active/F952-agents-learn-adam-s-principles-from-work-and-decisions/ticket.md:32`
- Evidence: "You do not need these mechanics to run jobs. They explain the notes and records above." (`docs/jobs.md:239`); the author asks for "Plain technical English (about 80% ASD-STE100)" (F952 ticket, line 32).
- Gives: Readable by a non-native reader and by a model. A user meets the steps first.
- Costs: Short sentences make long documents: `docs/finish-webhooks.md` has 752 lines for a feature gate 2 cuts. The repo also ships the author's working history: 865 files under `spec/` and dated research under `docs/reviews/`.
- Fit: none applies directly; A-084.
- Gate 2: open (§6 cuts `docs/reviews/*`, `docs/vps.md` and the diagram; the register and the `spec/` history are not decided).
- Question: (a) keep the register and the layout; (b) keep the register, with shorter task pages and a generated reference (A-084); (c) and for `spec/`: keep the author's history, move it to an archive branch, or drop it.
- Example:
```md
1. Tell the coordinator the outcome that you want.
2. The coordinator writes or moves the ticket. When the work lands, `limen land` moves the ticket to `done/` and regenerates NOW and PROVEN on `spec/build.md`.
3. The coordinator commits the ticket, so that the worker can see it.
4. The coordinator starts a job.
5. Stay in that conversation. A wake comes when a job ends.

Speak only when something looks wrong, or when the coordinator asks you. The coordinator asks about product ambiguity, a real tradeoff, credentials, or a merge.
```

### AU-231 Docs restate code facts
- Opinion: Docs repeat exact constants and edge cases from the code (limits, byte sizes, tool versions), and the README holds a dated experiment protocol.
- Where: `docs/jobs.md:33`, `docs/jobs.md:166-173`, `CONTRIBUTING.md:11`, `CONTRIBUTING.md:24`, `SECURITY.md:9`, `docs/commands.md:110`, `src/main.ts:142`, `README.md:84`, `docs/jobs.md:44`
- Evidence: "A wake up to 96 KiB goes as one `herdr agent prompt` argument" … "Herdr 0.9.5 reads at most 1 MiB in one request" (`docs/jobs.md:33`); "A failed job keeps its worktree and transcript." (`docs/jobs.md:44`), while prune removes it (A-001).
- Gives: A reader gets exact numbers without reading code.
- Costs: Each fact has two copies, and they drift: the test timeout (`CONTRIBUTING.md:11`), the hook list (`CONTRIBUTING.md:24`), Linux containment (`SECURITY.md:9`), `ticket done --on` (`docs/commands.md:110` vs `src/main.ts:142`), failed worktrees (`docs/jobs.md:44`).
- Fit: conflicts with z. 22 (one source of truth, views generated from it); A-001, A-050, A-084.
- Gate 2: settled by A-084 and A-050: change (docs rewritten from the code; constants generated into marked sections with a staleness test; `SECURITY.md` rewritten).

### AU-232 Seat operations are a copy-by-hand checklist
- Opinion: Seat setup (systemd units, shell scripts, Pi extensions) lives in `docs/seat/` as files an operator copies; Limen neither installs nor runs them; the Pi extensions are kept byte for byte and outside every check.
- Where: `docs/seat/README.md:3`, `docs/seat/README.md:39`, `docs/seat/bell.sh:2-3`, `biome.jsonc:106-115`
- Evidence: "Operator checklist and the current setup steps. Limen does not run these." (`docs/seat/README.md:3`).
- Gives: The seat stays the operator's, and the repo records what runs there.
- Costs: Code that runs in every coordinator has no typecheck, lint or test (A-047). Units cover one project each (A-054). The shell scripts follow their own style (`set -eu`, marker files).
- Fit: conflicts with z. 21 (repeatable, checkable steps belong in a script); A-024, A-047, A-054.
- Gate 2: settled by S, A-047 and A-024: change (seat tooling in the repo under the same checks; `limen sweep --install` writes systemd user units).

## 6. Defaults vs optional

### AU-233 Several engines and two launch modes
- Opinion: Pi is the default engine; OMP and Devin sit behind a table of capability flags; detached runs are the default, `--tab` hosts a job in a Herdr pane, and a group under Herdr defaults to hosted.
- Where: `src/runtime/engine.ts:32-67`, `src/runtime/engine.ts:74-80`, `src/commands/spawn.ts:247-260`, `README.md:23-25`, `docs/setup.md:125`
- Evidence: `const raw = (flag ?? process.env.LIMEN_ENGINE)?.trim() || "pi";` (`src/runtime/engine.ts:75`); "One wrapper and one stream parser serve both engines." (`docs/setup.md:125`).
- Gives: An engine choice per job; a person can type into a hosted job.
- Costs: Each engine and mode adds branches, flags and refusals (12 refusal cases in `s1`). Hosted jobs have no time or tool bound (A-023). Hosted jobs had no seat use (gate 2 §1), and OMP and Devin had none known (A-049).
- Fit: partial with z. 18 (each engine multiplies the acceptance runs); A-023, A-049.
- Gate 2: settled by G1.6, G1.7 and G1.8: cut (Devin, OMP and hosted `--tab`; groups run detached only).

### AU-234 A built-in model when no route is given
- Opinion: A spawn without `--model` runs a package default (`openai-codex/gpt-6-astra:high`) or a model from `LIMEN_WORKER_MODEL` or `LIMEN_REVIEWER_MODEL`, although help and docs show the four route flags as required.
- Where: `src/runtime/engine.ts:87-90`, `src/commands/spawn.ts:179`, `src/main.ts:110`, `docs/setup.md:102`, `src/commands/keeper.ts:139-143`
- Evidence: `|| "openai-codex/gpt-6-astra:high"` (`src/runtime/engine.ts:89`); `keeper` refuses a missing route flag (`src/commands/keeper.ts:142`), while `spawn` falls back.
- Gives: A spawn always starts.
- Costs: A silent model swap, against the author's own intent that launch settings are recorded configuration and a model is never swapped (gate 2 §5 #2). Two commands treat the same flags differently.
- Fit: conflicts with z. 18 (another model runs without the same tests); A-030.
- Gate 2: settled by A-030: cut (routes from `.agents/limen/routes.json`; the fallback and the env vars go; route flags are refused).

### AU-235 Optional features switched by files
- Opinion: Each optional feature has its own switch, and the switch is a file: `spec/linear.md` vs `.off`, a webhook env file, `github connect`, `picture watch on`, `highlight on`, `planning private`; a toggle command with no argument shows the state.
- Where: `src/commands/linear.ts:6`, `src/commands/linear.ts:13-14`, `src/main.ts:103`, `src/main.ts:146`, `src/main.ts:160`, `src/commands/highlight.ts:7-13`, `README.md:59`
- Evidence: "The Linear mirror toggle is one file: spec/linear.md on, spec/linear.md.off parked." (`src/commands/linear.ts:6`).
- Gives: Most features are off by default, and `ls` shows the state.
- Costs: Every feature has its own switch and its own place. A switch file in the checkout is writable by any job (A-011). A feature that is off still ships its prompt text and hooks (A-040, A-082).
- Fit: partial with z. 16 (agents can flip their own switches); A-011, A-040, A-082.
- Gate 2: settled by G1.10, G1.12 and G1.5: change (one switch file, modules off by default, a disabled module adds no prompt text and no hook; private planning and Linear cut).

### AU-236 Optional tools are found on PATH
- Opinion: Helper tools (Herdr, hunk, Jevgrep `jg`, the engines) are used when found on `PATH`; `LIMEN_X=<path>` names one and `LIMEN_X=0` turns it off; versions are recorded, never required.
- Where: `src/integrations/herdr.ts:774-787`, `src/integrations/herdr.ts:56-58`, `src/commands/diff.ts:56-57`, `hook/communication.ts:196-205`, `docs/setup.md:12`
- Evidence: "The one rule for the Herdr binary: `LIMEN_HERDR=0` turns Herdr off; another value must exist; otherwise `herdr` on PATH." (`src/integrations/herdr.ts:774`).
- Gives: No setup; a feature appears when its tool is installed.
- Costs: Behaviour depends on the caller's `PATH` and environment (`HERDR_ENV=1`): installing `jg` adds a search rule to every prompt (`hook/communication.ts:174`). A tool found in a writable directory runs in every job (A-025). Only the `versions` file records what a run used.
- Fit: partial with z. 38 (an environment-dependent tool is an adapter, not core) and with z. 14; A-025.
- Gate 2: open (A-025 requires absolute paths for `limen` and `jg` in hooks; discovery of optional tools is not decided).
- Question: (a) keep discovery on `PATH`; (b) declare optional tools with absolute paths in a seat file and refuse when one is missing; (c) discovery on `PATH` outside jobs, absolute paths inside them.

### AU-237 Parallel by default, held back by machine load
- Opinion: Any number of jobs may run; spawn only notes how many already run; a seat-wide start queue holds detached jobs while CPU idle is under 25 % or free memory under 20 %.
- Where: `src/commands/spawn.ts:385-387`, `src/runtime/start-queue.ts:38`, `docs/jobs.md:159`, `docs/jobs.md:164`
- Evidence: `` console.log(`note: ${running} job${running === 1 ? "" : "s"} already running; starting another`); `` (`src/commands/spawn.ts:386`); `{ cpuIdle: 25, memoryFree: 20, settleMs: 60_000 }` (`src/runtime/start-queue.ts:38`).
- Gives: Throughput on a big machine; load, not policy, sets the limit.
- Costs: On one subscription and one seat, parallel jobs compete for quota. Waits have no limit and no escalation (A-036; the longest seat wait was 48 min, gate 2 §1).
- Fit: none applies directly; A-014, A-036.
- Gate 2: settled by A-014 and A-036: change (`maxJobs` default 1; a queued job escalates after 30 min and fails after 2 h).

### AU-238 macOS and Linux as equals
- Opinion: Limen supports macOS and Linux: CI on both, `os: darwin, linux`, macOS-only parts (a LaunchAgent sweep, a Ruby process-identity helper) and Linux-only parts (hosted pane binding) side by side in core files.
- Where: `package.json:32-35`, `.github/workflows/check.yml:13`, `src/project/seat.ts:41`, `src/runtime/contain.ts:190`, `src/runtime/contain.ts:223`, `src/runtime/hosted-binding.ts:26`, `docs/setup.md:9`
- Evidence: `limen sweep --install` writes only a `Library/LaunchAgents/limen-sweep.plist` (`src/project/seat.ts:41`).
- Gives: The author's laptop and the seat run the same code.
- Costs: Platform branches inside core files. The seat-level reaper exists only on macOS (A-024).
- Fit: partial with z. 38 (platform code belongs in an adapter); A-024, A-083.
- Gate 2: settled by A-083 and A-024: change (one platform interface with a Linux implementation only; macOS later as a new implementation).

### AU-239 The release is a live clone
- Opinion: Limen installs as a Git clone with `npm link`; projects never copy hooks or templates; hooks find the package through `limen` on `PATH`; an update is `git pull` and `/reload`.
- Where: `README.md:31-38`, `README.md:61-62`, `docs/setup.md:34`, `templates/limen-extension.ts:7`, `templates/limen-extension.ts:14-25`
- Evidence: "To update Limen, pull the package clone and use `/reload` in the agent session. All projects on that computer use the same installed package." (`README.md:61-62`).
- Gives: One update reaches every project; projects cannot drift apart in version.
- Costs: A job that can write the clone, or put another `limen` first on `PATH`, changes code that later sessions load (A-025). No version is pinned per project, and a pull during a job mixes versions (D3).
- Fit: conflicts with z. 14 (code loaded from a place agents can write); A-025.
- Gate 2: settled by A-025 and D3: change (root-owned release directories, absolute paths, deployment waits until no job runs).

### AU-240 Not a sandbox, said plainly
- Opinion: A job runs as the caller, with the caller's whole environment and tool approval on; Limen isolates by worktree only and says so in the docs.
- Where: `src/runtime/engine.ts:232-237`, `src/runtime/wrapper.ts:50`, `SECURITY.md:3`, `SECURITY.md:5`, `README.md:73-74`
- Evidence: "This tool is process/worktree isolation, not a hostile-code sandbox." (`SECURITY.md:3`).
- Gives: No setup; a job can do anything the owner can, including `gh` and pushes.
- Costs: Every job holds every credential of the account (A-004, A-006); the docs are the only protection.
- Fit: conflicts with z. 9 (model-written code needs a sandbox) and z. 14; A-004, A-006.
- Gate 2: settled by A-004 and G2: change (environment allow-list T1; owner channel, egress allow-list and research account on the seat).

## Unverified

- The author meant Limen to be installed only from a Git clone, never from the npm registry. `package.json` has a `files` list, which suggests packing; the README shows only clone and `npm link`.
- The docs follow the same ~80 % ASD-STE100 register: the F952 quote names this register for one output page; applying it to all docs is my reading of their style.
- Tests inside one `sN` file depend on their order through shared state (for example the `job` object at `test/s5-land.test.ts:12`); not checked for every file.
- The author reviews prompts and CLI behaviour daily or weekly (the owner's relay in `evidence/audit-pass2/history.md`); no repo evidence.
