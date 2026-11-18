import { boardCommand } from "./commands/board-view.ts";
import { closeCommand } from "./commands/close.ts";
import { continueCommand } from "./commands/continue.ts";
import { diffCommand } from "./commands/diff.ts";
import { githubCommand } from "./commands/github.ts";
import { groupCommand } from "./commands/group.ts";
import { initCommand, workspaceCommand } from "./commands/init.ts";
import { jobsCommand } from "./commands/jobs.ts";
import { keeperCommand } from "./commands/keeper.ts";
import { landCommand } from "./commands/land.ts";
import { openCommand } from "./commands/open.ts";
import { pictureCommand } from "./commands/picture.ts";
import { pruneCommand } from "./commands/prune.ts";
import { queueCommand } from "./commands/queue.ts";
import { endDueRules, ruleCommand } from "./commands/rule.ts";
import { spawnCommand } from "./commands/spawn.ts";
import { statusCommand } from "./commands/status.ts";
import { steerCommand } from "./commands/steer.ts";
import { stopCommand } from "./commands/stop.ts";
import { sweepCommand } from "./commands/sweep.ts";
import { ticketCommand } from "./commands/ticket.ts";
import { unwatchCommand, watchCommand } from "./commands/watch.ts";
import { removedCommand } from "./old-names.ts";
import { failInternalJob, runInternalJob } from "./runtime/wrapper.ts";

type Command = (args: readonly string[], cwd: string) => Promise<void>;
const COMMANDS = {
	init: initCommand,
	workspace: workspaceCommand,
	github: githubCommand,
	group: groupCommand,
	spawn: spawnCommand,
	continue: continueCommand,
	diff: diffCommand,
	steer: steerCommand,
	stop: stopCommand,
	land: landCommand,
	board: boardCommand,
	keeper: keeperCommand,
	jobs: jobsCommand,
	status: statusCommand,
	prune: pruneCommand,
	queue: queueCommand,
	rule: ruleCommand,
	watch: watchCommand,
	unwatch: unwatchCommand,
	open: openCommand,
	picture: pictureCommand,
	close: closeCommand,
	sweep: sweepCommand,
	ticket: ticketCommand,
} as const satisfies Record<
	| "init"
	| "workspace"
	| "spawn"
	| "continue"
	| "github"
	| "group"
	| "diff"
	| "steer"
	| "stop"
	| "land"
	| "board"
	| "keeper"
	| "jobs"
	| "status"
	| "prune"
	| "queue"
	| "rule"
	| "watch"
	| "unwatch"
	| "open"
	| "picture"
	| "close"
	| "sweep"
	| "ticket",
	Command
>;
/** The registered command names; the table of old names (`src/old-names.ts`) must not hold any of them. */
export const COMMAND_NAMES: readonly string[] = Object.keys(COMMANDS);
const HELP = `limen — isolated coding jobs with files and git
usage:
  limen init
  limen init --drop-leftovers
  limen workspace init
  limen group start FEATURE --team ENGINE:PROVIDER/MODEL:THINKING [--team …] [--rounds draft,critique,revise,final; default draft] [--workers N; default 0] [--timeout D; default 90m] [--extension PATH ...] [--team-extension team-N=PATH ...] [--detached]
                                  # one agent per --team on its own route; Limen runs the rounds and tells the lead the result once
  limen group status [GROUP-ID]  # the rounds and the roster with each member's state
  limen group publish [GROUP-ID] [--team team-N] "finding"  # members inherit verified membership; lead supplies ID
  limen group wait [GROUP-ID] [--timeout D]
  limen group stop|close [GROUP-ID]
  limen spawn --engine <engine> --provider <provider> --model <model> --thinking <level> "Implement FNNN: <outcome>. Start by writing <slice>. Ticket: spec/features/active/FNNN-slug/ticket.md" [--label L] [--branch B] [--role NAME] [--timeout 20m; default 90m] [--task-file F|-] [--prepare CMD] [--priority 1|2|3; default 2] [--extension PATH ...]
                                  # detached: waits in the seat's start queue while CPU or memory is short, then starts and tells you
  limen spawn --engine <engine> --provider <provider> --model <model> --thinking <level> "Short title" --task-file F|-  # the file is the task; the positional words become the label
  limen spawn --engine <engine> --provider <provider> --model <model> --thinking <level> "…" [--label L]  # selected engine's flags; detached, also in Herdr (log-tail tab)
  limen spawn --engine <engine> --provider <provider> --model <model> --thinking <level> --detached "…"  # --detached is accepted and changes nothing: every job is detached
  limen spawn --engine <engine> --provider <provider> --model <model> --thinking <level> --repo R "Implement FNNN: <outcome>. Ticket: spec/features/active/FNNN-slug/ticket.md" [--label L]
  limen spawn --engine <engine> --provider <provider> --model <model> --thinking <level> --review --detached --branch B --label L [--base SHA] [--head SHA] "Review the FNNN candidate against spec/features/active/FNNN-slug/ticket.md"
  limen continue <id|suffix|label> "follow-up instruction" [--label L] [--engine pi] [--provider P] [--model X] [--thinking T] [--detached] [--priority 1|2|3; default the parent's] [--extension PATH ...; replaces ordinary Pi list, group list stays fixed]
                                  # resume a finished job in its own engine session — full context, same worktree; detached, also in Herdr
  limen steer <id|suffix|label> | --running "correction"
  limen diff <id|suffix|label>
  limen land <id|suffix|label> [--onto BRANCH] [--yes] [--keep-open]  # merge a done job onto the current branch and close its active ticket; --keep-open when more slices remain
  limen keeper <ticket-path> (--job ID [--job ID ...] | --group GROUP-ID) [--candidate BRANCH] --engine E --provider P --model M --thinking T [--timeout D]  # after the work: a short job fixes ticket, board and map links on its own branch
  limen stop <id|suffix|label> [reason]
  limen jobs [--running|--active|--all|--label PREFIX|<id|suffix|label>]
  limen status [--all]                          # plant inbox: running, candidates to inspect, needs a decision (last 7 days), coordinator tabs
  limen queue                                   # the seat's start queue in start order, and the CPU and memory reading against the gate
  limen prune [--retire [--dry-run]]           # --retire deletes finished, failed, or stopped job records whose branch is landed (ancestor or cherry-pick) or deleted
  limen rule                                    # the seat-wide rules that hold now
  limen rule set NAME --until 90m|12h|3d|"YYYY-MM-DD HH:MM"|ISO [--start-priority 1|2|3] "text"  # one rule for every coordinator; a set or change pings each live coordinator tab once
  limen rule end NAME [reason]                  # end it now; each live coordinator tab gets one end ping, as at its end time
  limen rule timer <rule-folder> <version>      # internal: end one version of a rule once, at its end time
  limen watch <id|suffix|label> | --running
  limen unwatch <id|suffix|label> | --all
  limen open <id|suffix|label>
  limen close <FNNN>
  limen ticket new "what becomes true" [--lane planned|active] [--touches id,id]  # next unused F number across lanes, archive.tsv, limen/* branches and job labels
  limen ticket check [BRANCH]                    # land gate on demand: tickets BRANCH adds or changes; run before a hand git merge
  limen ticket done FNNN [FNNN ...]             # landed without limen land: active ticket moves to done/ with a landed date
  limen board [--write]                          # the board with NOW and PROVEN from the lanes and each ticket's jobs; --write rewrites them in spec/build.md
  limen sweep [--install|--uninstall]
  limen github connect|disconnect|status|doctor  # bind projects and diagnose seat safety
  limen github ensure [registered-root]       # require a live registered Herdr coordinator
  limen github poll                           # run one polling pass as the isolated App user
  limen github deliver <root> <claim-id> <handoff-nonce>  # poller only: hand one claim to the live coordinator
  limen github review <root> <claim-id> --engine E --provider P --model M --thinking T  # a review job for one doorbell claim
  limen github work <root> <claim-id> --engine E --provider P --model M --thinking T --task "…"  # a task job for one doorbell claim
  limen github resolve <root> <claim-id> <handoff-nonce> "answer"  # explicit no-job answer for one doorbell claim
  limen picture build [--dir D] [--json F] [--strict]  # check the map, its tickets and board offline; no page; --json F writes the model
  limen picture serve [--port N]  # this project's job activity at 127.0.0.1 (default port 4747): /activity.json and /events
Pass a short coordinator instruction, not $(cat ticket.md). The ticket is a pointer, not the prompt.`;
export async function main(args: readonly string[], cwd = process.cwd()): Promise<void> {
	try {
		if (process.env.LIMEN_INTERNAL_RUN === "1") {
			await runInternalJob();
			return;
		}
		const [name, ...rest] = args;
		if (!name || name === "--help" || name === "-h" || name === "help") {
			console.log(HELP);
			return;
		}
		if (!(name in COMMANDS)) {
			throw new Error(removedCommand(name) ?? `unknown command ${JSON.stringify(name)}\n\n${HELP}`);
		}
		const flags = rest.slice(0, rest.includes("--") ? rest.indexOf("--") : undefined);
		if (flags.includes("--help") || flags.includes("-h")) {
			console.log(commandHelp(name));
			return;
		}
		// A rule whose timer died still ends once; this only starts a detached timer.
		try {
			endDueRules(args);
		} catch {
			// A rule record is a side channel too.
		}
		await COMMANDS[name as keyof typeof COMMANDS](rest, cwd);
	} catch (error) {
		if (process.env.LIMEN_INTERNAL_RUN === "1") {
			await failInternalJob(error);
		}
		console.error(error instanceof Error ? error.message : String(error));
		process.exitCode = 1;
	}
}

// One command's usage: its `limen <command>` lines from HELP, with their indented comment lines.
function commandHelp(name: string): string {
	const lines = ["usage:"];
	let inside = false;
	for (const line of HELP.split("\n")) {
		if (line.startsWith("  limen ")) {
			inside = line === `  limen ${name}` || line.startsWith(`  limen ${name} `);
		} else if (!/^\s+#/.test(line)) {
			inside = false;
		}
		if (inside) {
			lines.push(line);
		}
	}
	return lines.join("\n");
}
