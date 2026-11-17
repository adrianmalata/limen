/* PL: Szkic rejestru poleceń Limena po przebudowie (T-18, T-19) z generatorem `limen --help`, przygotowany w wywiadzie
   etapu 3, żeby Adrian ocenił prawdziwy wynik generatora, a nie makietę. Każdy wpis ma obiekt (job, owner, project
   albo grupę), rodzaj (read albo change), widoczność i opis jako kryterium użycia; linie modułów pokazują stan [on] lub
   [off] z limits.json projektu (tu z flag --on). Stan: zaakceptowany z poprawkami; docelowy rejestr powstanie w kodzie
   Limena w etapie 5, w trybie pair. */
// Usage: node adrian-rebuild/evidence/taste/help-registry.mjs [--on MODULE ...]
//   prints limen --help as a project whose limits.json switches on the named modules; exits 1 when a line is too wide

const WIDTH = 100;
const USAGE_CAP = 35;
const SUMMARY_INDENT = 6;

const GROUPS = [
	["job", "Jobs: one job; spawn creates it, every other command takes its id"],
	["owner", "Owner conversation: questions, answers and decisions that involve the owner"],
	["project", "This project"],
	["ticket", "Tickets: files under spec/features/"],
	["spec", "Spec: files that code derives"],
	["handoff", "Handoff: the note between coordinator sessions"],
	["seat", "Seat: all projects on this machine"],
	["module", "Modules: off by default; the owner switches them on (limen init, or limits.json via owner channel)"],
];

/** One entry per command: object, kind (read | change), visibility, usage, summary (a usage criterion), module. */
const COMMANDS = [
	[
		"job",
		"change",
		"public",
		"spawn <role> <FNNN> [--seam P] [--note T]",
		"start a job; its task comes from the ticket",
	],
	["job", "change", "public", "continue <job> [--note T]", "resume a finished job in its worktree"],
	["job", "change", "public", 'steer <job> "text"', "send a correction to a running job"],
	["job", "change", "public", 'stop <job> [--done "reason"]', 'stop a running job; --done "reason" to declare it done'],
	["job", "change", "public", "abandon <job>", "give up on a job and keep its work on a branch"],
	["job", "change", "public", "land <job>", "merge a finished job; refuses until its conditions hold"],
	["job", "read", "public", "diff <job>", "the change a job made against its base"],
	["job", "read", "public", "show <job> [--result]", "one job's record; --result prints its final message"],
	["job", "read", "public", "open <job>", "open the job's log tab in Herdr"],
	["owner", "change", "public", "ask --kind decision|request …", "put a decision or a request to the owner"],
	[
		"owner",
		"change",
		"public",
		"answer <Q-NNN> --source P:L --quote T",
		"close a question with a quote from a file on main",
	],
	["owner", "change", "public", "decide --quote T DECISION [--answers Q-NNN] …", "record a decision the owner gave"],
	[
		"owner",
		"change",
		"public",
		"escalate <FNNN> …",
		"report a ticket that used all its review rounds, in four checked parts",
	],
	["project", "change", "public", "init", "set up Limen here; asks for limits, routes and modules"],
	["project", "read", "public", "status [--all] [--ticket FNNN]", "what runs, what landed, what waits for the owner"],
	["project", "read", "public", "stats", "verdicts, rounds, failures and tokens per job and route"],
	["project", "read", "public", "board", "the board, with NOW and NEXT from the ticket folders"],
	[
		"ticket",
		"change",
		"public",
		'ticket new "what becomes true" [--survey]',
		"write a planned ticket with the next free number",
	],
	["ticket", "change", "public", "ticket start <FNNN>", "move a planned ticket to active, in one commit"],
	["ticket", "change", "public", "ticket drop <FNNN>", "move a ticket to dropped, in one commit"],
	["ticket", "read", "public", "ticket check [<branch>]", "the land checks for the tickets a branch changes"],
	["ticket", "change", "public", "ticket done <FNNN>", "close a ticket that landed without limen land"],
	["ticket", "change", "public", "ticket renumber <FNNN> <new>", "give a ticket a free number after a collision"],
	["spec", "change", "public", "spec fix", "rewrite the board lines and front matter code derives"],
	["handoff", "read", "public", "handoff show", "the previous coordinator session's note, as data"],
	["seat", "read", "public", "seat queue", "the start queue and its CPU and memory reading"],
	["seat", "change", "public", "seat sweep [--install|--uninstall|--status]", "reap, resume, prune and retire"],
	[
		"module",
		"change",
		"public",
		"github connect|disconnect|status|show …",
		"answer @limen mentions on GitHub pull requests",
		"github",
	],
	["module", "change", "public", "group start|status|stop|land …", "several agents on one ticket", "groups"],
	["module", "read", "public", "picture build|serve", "the architecture map data and the activity feed", "picture"],
	["module", "change", "public", "workspace init", "a project folder outside Git", "workspace"],
	[
		"module",
		"change",
		"public",
		'research submit "<question>"',
		"queue a question for the research account",
		"research",
	],
	["module", "change", "public", "quality", "run the quality pass now", "quality"],
	["owner", "change", "internal", "land --owner <branch>", "owner channel only: land owner files"],
	["seat", "change", "internal", "resume --quota", "timer only: resume jobs stopped by the usage limit"],
	["module", "change", "internal", "github poll|deliver …", "poller only", "github"],
];

const EXIT = [
	"Exit codes: 0 ok · 1 refused · 2 usage · 3 transient · 4 environment · 5 internal.",
	"The last output line is JSON {class, code, next}.",
];

/** The modules a project's limits.json switches on; this draft takes them from `--on MODULE` flags. */
function modulesOn(args) {
	return new Set(args.flatMap((arg, index) => (args[index - 1] === "--on" ? [arg] : [])));
}

/** One entry: usage and summary on one line; a long usage, then a long summary, each move the summary down. */
function entryLines(head, summary, column) {
	if (column + summary.length > WIDTH) {
		return [head, `${" ".repeat(SUMMARY_INDENT)}${summary}`];
	}
	return head.length + 2 > column ? [head, " ".repeat(column) + summary] : [head.padEnd(column) + summary];
}

function render(on) {
	const visible = COMMANDS.filter(([, , visibility]) => visibility === "public");
	const lines = ["limen: coding jobs in isolated worktrees, with checks and review in code", ""];
	for (const [object, header] of GROUPS) {
		const entries = visible.filter(([entry]) => entry === object);
		// Each group aligns its own summary column, capped so that one long usage does not squeeze every summary;
		// a usage over the cap puts its summary on the next line, at the same column.
		const widest = Math.max(...entries.map(([, , , usage]) => usage.length));
		const column = Math.min(widest, USAGE_CAP) + "  limen ".length + 2;
		lines.push(header);
		for (const [, , , usage, text, module] of entries) {
			const summary = module ? `[${on.has(module) ? "on" : "off"}] ${text}` : text;
			lines.push(...entryLines(`  limen ${usage}`, summary, column));
		}
		lines.push("");
	}
	lines.push(...EXIT);
	return lines;
}

const lines = render(modulesOn(process.argv.slice(2)));
console.log(lines.join("\n"));
const wide = lines.filter((line) => line.length > WIDTH);
for (const line of wide) {
	console.error(`wider than ${WIDTH}: ${line.length}: ${line}`);
}
process.exitCode = wide.length === 0 ? 0 : 1;
