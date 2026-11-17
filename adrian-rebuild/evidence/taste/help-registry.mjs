/* PL: Szkic rejestru poleceń Limena po przebudowie (T-18, T-19) z generatorem `limen --help`, przygotowany w wywiadzie
   etapu 3, żeby Adrian ocenił prawdziwy wynik generatora, a nie makietę. Każdy wpis ma obiekt (job, owner, project
   albo grupę), rodzaj (read, change, wait), widoczność i opis jako kryterium użycia. Stan: szkic do akceptacji;
   docelowy rejestr powstanie w kodzie Limena w etapie 5, w trybie pair. */
// Usage: node adrian-rebuild/evidence/taste/help-registry.mjs   (prints limen --help; exits 1 when a line is too wide)

const WIDTH = 100;
const USAGE_CAP = 35;

const GROUPS = [
	["job", "Jobs: one job; spawn creates it, every other command takes its id"],
	["owner", "Owner conversation: questions, answers and decisions that involve the owner"],
	["project", "This project"],
	["ticket", "Tickets: files under spec/features/"],
	["spec", "Spec: files that code derives"],
	["handoff", "Handoff: the note between coordinator sessions"],
	["seat", "Seat: all projects on this machine"],
	["module", "Modules: off by default; switch on in .agents/limen/limits.json"],
];

/** One entry per command: object, kind (read | change | wait), visibility, usage, summary (a usage criterion). */
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
	["job", "wait", "public", "wait <job>", "block until a job ends; refused to the coordinator"],
	["job", "read", "public", "diff <job>", "the change a job made against its base"],
	["job", "read", "public", "show <job> [--result]", "one job's record; --result prints its final message"],
	["job", "read", "public", "open <job>", "open the job's place in Herdr"],
	["owner", "change", "public", "ask --kind decision|request …", "put a decision or a request to the owner"],
	["owner", "change", "public", "answer <Q-NNN> --source P:L --quote T", "answer a question from a file on main"],
	["owner", "change", "public", "decide --quote T DECISION …", "record a decision the owner gave"],
	["owner", "change", "public", "escalate <FNNN> …", "report a ticket out of rounds, in four checked parts"],
	["project", "change", "public", "init", "set up Limen here; asks for limits, routes and modules"],
	["project", "read", "public", "status [--all] [--label FNNN]", "what runs, what landed, what waits for the owner"],
	["project", "read", "public", "stats", "verdicts, rounds, failures and tokens per job and route"],
	["project", "read", "public", "board", "the board, with NOW and NEXT from the lanes"],
	["ticket", "change", "public", 'ticket new "what becomes true"', "write a planned ticket with the next free number"],
	["ticket", "change", "public", "ticket start <FNNN>", "move a planned ticket to active, in one commit"],
	["ticket", "change", "public", "ticket drop <FNNN>", "move a ticket to dropped, in one commit"],
	["ticket", "read", "public", "ticket check [<branch>]", "the land checks for the tickets a branch changes"],
	["ticket", "change", "public", "ticket done <FNNN>", "close a ticket that landed without limen land"],
	["ticket", "change", "public", "ticket renumber <FNNN> <new>", "give a ticket a free number after a collision"],
	["ticket", "read", "public", "ticket series [NAME PROJECT …]", "projects on this seat that share one number series"],
	["spec", "change", "public", "spec fix", "rewrite the board lines and front matter code derives"],
	["handoff", "read", "public", "handoff show", "the previous coordinator session's note, as data"],
	["seat", "read", "public", "seat queue", "the start queue and its CPU and memory reading"],
	["seat", "change", "public", "seat sweep [--install|--uninstall|--status]", "reap, resume, prune and retire"],
	["module", "change", "public", "github connect|disconnect|status|show …", "the GitHub doorbell"],
	["module", "change", "public", "group start|status|stop|land …", "several agents on one ticket"],
	["module", "read", "public", "picture build|serve", "the architecture map data and the activity feed"],
	["module", "change", "public", "workspace init", "a project folder outside Git"],
	["module", "change", "public", "quality", "run the quality pass now"],
	["owner", "change", "internal", "land --owner <branch>", "owner channel only: land owner files"],
	["seat", "change", "internal", "resume --quota", "timer only: resume jobs stopped by the usage limit"],
	["module", "change", "internal", "github poll|deliver …", "poller only"],
];

const EXIT = [
	"Exit codes: 0 ok · 1 refused · 2 usage · 3 transient · 4 environment · 5 internal.",
	"The last output line is JSON {class, code, next}.",
];

function render() {
	const visible = COMMANDS.filter(([, , visibility]) => visibility === "public");
	const lines = ["limen: coding jobs in isolated worktrees, with checks and review in code", ""];
	for (const [object, header] of GROUPS) {
		const entries = visible.filter(([entry]) => entry === object);
		// Each group aligns its own summary column, capped so that one long usage does not squeeze every summary;
		// a usage over the cap puts its summary on the next line, at the same column.
		const widest = Math.max(...entries.map(([, , , usage]) => usage.length));
		const column = Math.min(widest, USAGE_CAP) + "  limen ".length + 2;
		lines.push(header);
		for (const [, , , usage, summary] of entries) {
			const head = `  limen ${usage}`;
			lines.push(
				...(head.length + 2 > column ? [head, " ".repeat(column) + summary] : [head.padEnd(column) + summary]),
			);
		}
		lines.push("");
	}
	lines.push(...EXIT);
	return lines;
}

const lines = render();
console.log(lines.join("\n"));
const wide = lines.filter((line) => line.length > WIDTH);
for (const line of wide) {
	console.error(`wider than ${WIDTH}: ${line.length}: ${line}`);
}
process.exitCode = wide.length === 0 ? 0 : 1;
