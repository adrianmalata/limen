// The one registry of Limen's commands (T-19): each entry's name, what it acts on (T-18), its kind (T-04), its
// visibility, its summary, its schema of positionals and flags, the `ids` keys it may return (D-022), one example and
// its handler, a thin adapter over one domain operation (T-26). `src/main.ts` dispatches through it, `src/parser.ts`
// reads its words by it, and `src/help.ts` generates the help and the command sections of docs/commands.md from it.
import { abandonCommand } from "./commands/abandon.ts";
import { boardCommand } from "./commands/board-view.ts";
import { continueCommand } from "./commands/continue.ts";
import { diffCommand } from "./commands/diff.ts";
import {
	githubConnectCommand,
	githubDeliverCommand,
	githubDisconnectCommand,
	githubDoctorCommand,
	githubEnsureCommand,
	githubPollCommand,
	githubResolveCommand,
	githubReviewCommand,
	githubStatusCommand,
	githubWorkCommand,
} from "./commands/github.ts";
import {
	groupAdvanceCommand,
	groupCloseCommand,
	groupPublishCommand,
	groupStartCommand,
	groupStatusCommand,
	groupStopCommand,
} from "./commands/group.ts";
import { groupWaitCommand } from "./commands/group-wait.ts";
import { initCommand, workspaceInitCommand } from "./commands/init.ts";
import { keeperCommand } from "./commands/keeper.ts";
import { landCommand } from "./commands/land.ts";
import { migrateCommand } from "./commands/migrate.ts";
import { openCommand } from "./commands/open.ts";
import { pictureBuildCommand, pictureServeCommand } from "./commands/picture.ts";
import { ruleCommand, ruleEndCommand, ruleSetCommand, ruleTimerCommand } from "./commands/rule.ts";
import { seatQueueCommand } from "./commands/seat-queue.ts";
import { showCommand } from "./commands/show.ts";
import { spawnCommand } from "./commands/spawn.ts";
import { statsCommand } from "./commands/stats.ts";
import { statusCommand } from "./commands/status.ts";
import { steerCommand } from "./commands/steer.ts";
import { stopCommand } from "./commands/stop.ts";
import { seatSweepCommand } from "./commands/sweep.ts";
import { ticketCheckCommand, ticketDoneCommand, ticketNewCommand } from "./commands/ticket.ts";
import { unwatchCommand, watchCommand } from "./commands/watch.ts";
import type { CommandText, IdKey, Success } from "./outcome.ts";
import type { Command, Flag, Parsed, Positional } from "./parser.ts";

/** What a command acts on (T-18): one job, the owner's conversation, this project, or the group it belongs to. */
export type CommandObject =
	| "job"
	| "owner"
	| "project"
	| "ticket"
	| "seat"
	| "github"
	| "group"
	| "picture"
	| "workspace";
/**
 * A command reads its values, calls one domain operation and returns its result or throws (D-028, T-26 (1));
 * `undefined` is a success with `next` null. `out` takes the text the operation reports as it goes, which the shared
 * wrapper prints when the command ends (D-061 (3)).
 */
export type Handler = (values: Parsed, cwd: string, out: CommandText) => Promise<Success | undefined>;
/**
 * One command. An internal one names its `caller` and stays out of `limen --help`. `movedBy` names the ticket that
 * moves or cuts it (D-039, D-042); the help does not show it. `irreversible` marks a command whose change cannot be
 * undone or that moves data, which has tests of running it again and of losing nothing (T-28 (3)). `refuses` names the
 * codes of class refused and usage that the command's own path throws (T-28 (1), D-075): the codes every command can
 * end with are `SHARED_CODES` of src/operation.ts, and a command that runs another command's operation, as `github
 * work` runs spawn's, names only its own. test/registry.test.ts reads them against the code and the tests.
 */
export type Entry = Command & {
	readonly object: CommandObject;
	readonly kind: "read" | "change";
	readonly visibility: "public" | "internal";
	readonly caller?: string;
	readonly summary: string;
	readonly ids: readonly IdKey[];
	readonly refuses: readonly string[];
	readonly example: string;
	readonly movedBy?: string;
	readonly irreversible?: true;
	readonly handler: Handler;
};
/** A group of the general help: a header over its lines, or a module, one line with its summary under "Modules". */
export type Group =
	| { readonly object: CommandObject; readonly header: string }
	| { readonly object: CommandObject; readonly module: true; readonly summary: string };

export const GROUPS: readonly Group[] = [
	{
		object: "job",
		header: "Jobs: spawn starts a job; the others act on one job, or on several with --running or --all",
	},
	{ object: "project", header: "This project" },
	{ object: "ticket", header: "Tickets: files under spec/features/" },
	{ object: "seat", header: "Seat: all projects on this machine" },
	{ object: "github", module: true, summary: "answer @limen mentions on GitHub pull requests" },
	{ object: "group", module: true, summary: "several agents on one ticket" },
	{ object: "picture", module: true, summary: "the architecture map check and the job activity feed" },
	{
		object: "workspace",
		module: true,
		summary: "a folder outside Git that holds several Git repositories; each job works in one (--repo)",
	},
];
/** D-040: until module switches exist (R-044), the header says only what is true now. */
export const MODULES_HEADER = "Modules";

/** The codes of `groups`, each once, in order: an entry's `refuses` from the refusals of the functions its path calls. */
function refusals(...groups: ReadonlyArray<readonly string[]>): readonly string[] {
	return [...new Set(groups.flat())].sort();
}
/** `limenRoot` (src/project/git.ts): a folder outside every project, or a group member's incomplete context. */
const IN_PROJECT = ["GROUP_CONTEXT", "NOT_A_PROJECT"];
/** `resolveJob` for a read (src/job/reference.ts, T-20): a word that names no job exactly. */
const JOB_WORD = ["JOB_NOT_EXACT", "JOB_NOT_FOUND", "JOB_TOKEN_SHARED"];
/** `resolveJob` for control: a job word, and a group member that names another team's job. */
const OWN_JOB = [...JOB_WORD, "JOB_OTHER_TEAM"];
/** `readRun` of a group id a command line or a member's environment gives (src/job/group-cabinet.ts). */
const GROUP_RUN = ["BAD_GROUP_ID", "GROUP_NOT_FOUND", "GROUP_RECORD"];
/** `jobMembership`: the group a job's record names is gone, malformed, or no longer lists the job. */
const RECORDED_GROUP = ["GROUP_GONE", "GROUP_RECORD", "GROUP_ROSTER", "RECORD_GROUP_ID"];
/** `selectedGroup` (src/job/group-control.ts): the group a member belongs to, or the one its lead names. */
const SELECTED_GROUP = [...GROUP_RUN, ...IN_PROJECT, "GROUP_OTHER_LEAD", "GROUP_ROSTER", "NO_GROUP"];
/** `memberSlotProblem`: a group launch with no free slot of its team. */
const MEMBER_SLOT = ["GROUP_ALLOWANCE", "GROUP_CLOSED", "GROUP_NO_TIME", "GROUP_TEAM_UNKNOWN"];
/** `normalizeWorkerExtensions` and `readWorkerExtensions` (src/runtime/worker-extensions.ts). */
const EXTENSIONS = ["BAD_EXTENSION", "EXTENSION_GONE", "RECORD_EXTENSIONS"];
/** `assertUnprivileged`, `readBinding` and `originRepository` of the GitHub module (src/integrations/). */
const GITHUB_SEAT = ["GITHUB_BINDING", "GITHUB_ORIGIN", "GITHUB_PRIVILEGED"];
/** The checks of a claim's job before its handoff (`validateClaimJob`, src/integrations/github-claims.ts). */
const GITHUB_CLAIM = [
	...GITHUB_SEAT,
	"BAD_CLAIM",
	"BAD_ROOT",
	"GITHUB_CLAIM_MISMATCH",
	"GITHUB_CONFLICT",
	"GITHUB_DISCONNECTED",
	"GITHUB_HANDOFF_GATE",
	"GITHUB_NO_CLAIM",
	"GITHUB_NOT_COORDINATOR",
	"NOT_A_PROJECT",
];
/** `readDataset` and `mapFolder` of the map (src/picture/): a map path that is missing or no folder. */
const MAP_FOLDER = ["PICTURE_NO_MAP", "PICTURE_NOT_A_FOLDER"];

const JOB: Positional = { positional: "job", type: "job", about: "the job's full id or its 8-character token" };
const ROUTE_ABOUT = {
	engine: "the engine that runs the job; pi is the only one",
	provider: "the provider of the job's model",
	model: "the model the job runs",
	thinking: "the model's reasoning level, such as high",
} as const;
/** The four route flags that a new job requires (D-043). */
const ROUTE: readonly Flag[] = [
	{ flag: "engine", value: "engine", required: true, about: ROUTE_ABOUT.engine },
	{ flag: "provider", value: "provider", required: true, about: ROUTE_ABOUT.provider },
	{ flag: "model", value: "model", required: true, about: ROUTE_ABOUT.model },
	{ flag: "thinking", value: "level", required: true, about: ROUTE_ABOUT.thinking },
];
/** The route flags whose separate value may start with `--`, as spawn and the GitHub jobs have always read them. */
const DASHED_ROUTE: readonly Flag[] = ROUTE.map((flag) => ({ ...flag, dashValue: true }));
const DETACHED: Flag = { flag: "detached", about: "accepted, and changes nothing: every job runs detached" };
const EXTENSION: Flag = {
	flag: "extension",
	value: "path",
	repeatable: true,
	about: "a Pi extension file or package folder the job loads; repeat it for more",
};
const ROOT: Positional = { positional: "root", type: "path", about: "the registered project's repository root" };
const CLAIM: Positional = {
	positional: "claim",
	type: "word",
	shown: "claim-id",
	about: "the claim: the comment's id, or issue-<number> for an issue body",
};
const NONCE: Positional = {
	positional: "nonce",
	type: "word",
	shown: "handoff-nonce",
	about: "the nonce of the claim's prompt",
};
const GROUP_ID: Positional = {
	positional: "group",
	type: "word",
	optional: true,
	about: "the group's id; the lead gives it, a member leaves it out",
};
const GITHUB_PROMPT = "the coordinator, as the prompt of a GitHub claim says";

const SPAWN: Entry = {
	name: "spawn",
	object: "job",
	kind: "change",
	visibility: "public",
	summary: "start a job in its own worktree; the task points to its ticket",
	abbreviated: true,
	schema: [
		{
			positional: "task",
			type: "text",
			replacedBy: "task-file",
			dropsDashes: true,
			about: "what the job does: a short instruction that names its ticket",
		},
		...DASHED_ROUTE,
		{
			flag: "label",
			value: "label",
			dashValue: true,
			about: "the job's name in lists and tabs; default the task's first line",
		},
		{
			flag: "branch",
			value: "branch",
			dashValue: true,
			about: "work on this branch, not a new limen/<id>; a review reads it",
		},
		{ flag: "repo", value: "repo", dashValue: true, about: "the child repository a workspace job works in" },
		{
			flag: "role",
			value: "role",
			dashValue: true,
			about: "use .agents/limen/<role>.md, else templates/<role>.md of the package",
		},
		{ flag: "review", about: "start a reviewer job that reads --branch" },
		{ flag: "base", value: "commit", dashValue: true, about: "with --review: the commit the reviewed range starts at" },
		{
			flag: "head",
			value: "commit",
			dashValue: true,
			about: "with --review: where the range ends; refuses if the branch moved",
		},
		{
			flag: "timeout",
			value: "duration",
			dashValue: true,
			about: "end the job after this time, such as 20m; default 90m",
		},
		{
			flag: "task-file",
			value: "file",
			dashValue: true,
			about: "the task from this file, or stdin with -; the task words become the label",
		},
		{
			flag: "prepare",
			value: "command",
			dashValue: true,
			about: "a shell command the job runs before its engine starts",
		},
		{
			flag: "priority",
			choices: ["1", "2", "3"],
			dashValue: true,
			about: "the job's place in the seat's start queue; 1 is first, 2 the default",
		},
		EXTENSION,
		DETACHED,
		{ removed: "tab" },
	],
	ids: ["job"],
	// A spawn from a group member's environment launches into its group (`spawnGroup`), so the group's codes are its own.
	refuses: refusals(GROUP_RUN, MEMBER_SLOT, EXTENSIONS, [
		"BAD_BRANCH",
		"BAD_COMMIT",
		"BAD_DURATION",
		"BAD_ENGINE",
		"BAD_LABEL",
		"BAD_PRIORITY",
		"BAD_REPO",
		"BAD_ROLE",
		"BAD_TASK_FILE",
		"BRANCH_IN_PRIMARY",
		"BRANCH_LIVE_JOB",
		"BRANCH_MISSING",
		"GROUP_CONTEXT",
		"GROUP_EXTENSIONS",
		"GROUP_LAUNCH_FLAGS",
		"GROUP_NO_ROUTE",
		"GROUP_REVIEW_BRANCH",
		"GROUP_ROSTER",
		"GROUP_ROUTE",
		"GROUP_WORKER_SPAWN",
		"NO_COMMIT",
		"NO_TASK",
		"NOT_A_PROJECT",
		"PIN_WITHOUT_REVIEW",
		"REPO_OUTSIDE_WORKSPACE",
		"REPO_REQUIRED",
		"REVIEW_HEAD_MOVED",
		"REVIEW_NEEDS_BRANCH",
		"REVIEW_WITH_ROLE",
		"ROLE_UNKNOWN",
		"SPAWN_LEAD_ROLE",
		"TICKET_NOT_AT_BASE",
		"TITLE_TWICE",
		"UNLANDED_WORK",
	]),
	example:
		'limen spawn "Implement F012. Ticket: spec/features/active/F012-demo/ticket.md" --engine pi --provider pi-claude --model claude-opus-5-5 --thinking high',
	handler: spawnCommand,
};

const CONTINUE: Entry = {
	name: "continue",
	object: "job",
	kind: "change",
	visibility: "public",
	summary: "resume a finished job in its worktree",
	abbreviated: true,
	schema: [
		JOB,
		{ positional: "instruction", type: "text", about: "what the job does next, in the same session and worktree" },
		{
			flag: "label",
			value: "label",
			dashValue: true,
			about: "the new job's name; default the parent's label and · continue",
		},
		{ flag: "engine", value: "engine", dashValue: true, about: "the engine; it must be the parent's" },
		{ flag: "provider", value: "provider", dashValue: true, about: ROUTE_ABOUT.provider },
		{ flag: "model", value: "model", dashValue: true, about: ROUTE_ABOUT.model },
		{ flag: "thinking", value: "level", dashValue: true, about: ROUTE_ABOUT.thinking },
		{ flag: "timeout", value: "duration", dashValue: true, about: "end the job after this time, such as 20m" },
		{
			flag: "priority",
			choices: ["1", "2", "3"],
			dashValue: true,
			about: "the job's place in the start queue; default the parent's",
		},
		{ ...EXTENSION, about: "replaces the parent's list of Pi extensions; repeat it for more" },
		DETACHED,
		{ removed: "tab" },
		{ removed: "review" },
	],
	ids: ["job"],
	refuses: refusals(IN_PROJECT, OWN_JOB, GROUP_RUN, RECORDED_GROUP, MEMBER_SLOT, EXTENSIONS, [
		"BAD_DURATION",
		"BAD_ENGINE",
		"BAD_LABEL",
		"BAD_PRIORITY",
		"BAD_REPO",
		"ENGINE_MISMATCH",
		"ENGINE_UNKNOWN",
		"GROUP_EXTENSIONS",
		"GROUP_EXTENSIONS_PARENT",
		"GROUP_LAUNCH_FLAGS",
		"GROUP_NO_ROUTE",
		"GROUP_NOT_ALLOWED",
		"GROUP_OTHER_LEAD",
		"GROUP_ROUTE",
		"GROUP_TEAM_JOB",
		"JOB_NO_BRANCH",
		"JOB_NO_SESSION",
		"JOB_NO_WORKTREE",
		"JOB_NOT_FINISHED",
		"JOB_TREE_GONE",
		"LIVE_CONTINUATION",
		"NO_INSTRUCTION",
		"ROLE_UNKNOWN",
	]),
	example: 'limen continue a1b2c3d4 "Fix the test the review names, then commit"',
	handler: continueCommand,
};

const JOBS: readonly Entry[] = [
	SPAWN,
	CONTINUE,
	{
		name: "steer",
		object: "job",
		kind: "change",
		visibility: "public",
		summary: "send a correction to a running job",
		schema: [
			{ ...JOB, replacedBy: "running" },
			{ flag: "running", about: "every running job that wakes this coordinator" },
			{ positional: "text", type: "text", about: "the correction; the job reads it at its next turn" },
		],
		ids: [],
		// A group member is refused before its job is resolved, so no team or group context of a member reaches it.
		refuses: refusals(JOB_WORD, ["NOT_A_PROJECT"]),
		example: 'limen steer a1b2c3d4 "Leave docs/ alone; fix src/main.ts first"',
		handler: steerCommand,
	},
	{
		name: "stop",
		object: "job",
		kind: "change",
		visibility: "public",
		summary: "stop a running job",
		schema: [
			JOB,
			{
				positional: "reason",
				type: "text",
				optional: true,
				about: "why, kept in the record; a reason that starts with done: records it done",
			},
		],
		ids: [],
		refuses: refusals(IN_PROJECT, OWN_JOB, ["JOB_NO_PID"]),
		example: 'limen stop a1b2c3d4 "the ticket changed"',
		handler: stopCommand,
	},
	{
		name: "abandon",
		object: "job",
		kind: "change",
		visibility: "public",
		summary: "give up on a job and keep its work on a branch",
		schema: [JOB],
		ids: [],
		refuses: refusals(IN_PROJECT, OWN_JOB, [
			"ABANDON_BRANCH_LACKS_WORK",
			"JOB_CONTINUED",
			"JOB_IN_GROUP",
			"JOB_NOT_FINISHED",
			"NO_UNLANDED_WORK",
		]),
		example: "limen abandon a1b2c3d4",
		// It removes the job's worktree, and the ignored files there go with it.
		irreversible: true,
		handler: abandonCommand,
	},
	{
		name: "land",
		object: "job",
		kind: "change",
		visibility: "public",
		summary: "merge a done job onto this branch and close its ticket",
		schema: [
			JOB,
			{ flag: "onto", value: "branch", about: "refuse unless <branch> is the checked-out branch" },
			{ flag: "yes", about: "do not ask for confirmation in a terminal" },
			{ flag: "keep-open", about: "keep the ticket active, because more slices remain" },
		],
		ids: [],
		// A group member is refused before its job is resolved; the close of its tickets refuses before the merge, and a
		// close that fails after it ends the land with the close's class and `limen ticket done <codes>`, except a refusal
		// there, which is STATE_CHANGED, and CHECKOUT_BEHIND, whose `next` is null since its commit is on the branch
		// (R-037, Decision 18).
		refuses: refusals(JOB_WORD, [
			"BAD_REPO",
			"MERGE_FAILED",
			"NOT_A_PROJECT",
			"PICTURE_NOT_A_FOLDER",
			"TICKETS_UNCOMMITTED",
		]),
		example: "limen land a1b2c3d4",
		handler: landCommand,
	},
	{
		name: "diff",
		object: "job",
		kind: "read",
		visibility: "public",
		summary: "the change a job made against its base",
		schema: [JOB],
		ids: [],
		refuses: refusals(IN_PROJECT, JOB_WORD, ["BAD_REPO"]),
		example: "limen diff a1b2c3d4",
		handler: diffCommand,
	},
	{
		name: "show",
		object: "job",
		// A read since the seat sweep reaps dead jobs, and no read command does (T-04, R-032).
		kind: "read",
		visibility: "public",
		summary: "one job's record",
		schema: [JOB],
		ids: [],
		refuses: refusals(IN_PROJECT, JOB_WORD),
		example: "limen show a1b2c3d4",
		handler: showCommand,
	},
	{
		name: "open",
		object: "job",
		kind: "read",
		visibility: "public",
		summary: "open the job's log tab in Herdr",
		schema: [JOB],
		ids: [],
		refuses: refusals(IN_PROJECT, JOB_WORD),
		example: "limen open a1b2c3d4",
		handler: openCommand,
	},
	{
		name: "watch",
		object: "job",
		kind: "change",
		visibility: "public",
		summary: "wake this coordinator when the job ends",
		schema: [
			{ ...JOB, replacedBy: "running" },
			{ flag: "running", about: "every job of this project that runs now" },
		],
		ids: [],
		refuses: refusals(IN_PROJECT, OWN_JOB),
		example: "limen watch a1b2c3d4",
		handler: watchCommand,
	},
	{
		name: "unwatch",
		object: "job",
		kind: "change",
		visibility: "public",
		summary: "stop waking this coordinator for the job",
		schema: [
			{ ...JOB, replacedBy: "all" },
			{ flag: "all", about: "every job of this project" },
		],
		ids: [],
		refuses: refusals(IN_PROJECT, OWN_JOB),
		example: "limen unwatch a1b2c3d4",
		handler: unwatchCommand,
	},
];

const PROJECT: readonly Entry[] = [
	{
		name: "init",
		object: "project",
		kind: "change",
		visibility: "public",
		summary: "set up Limen here; --drop-leftovers deletes files Limen no longer reads",
		schema: [
			{
				flag: "drop-leftovers",
				about: "delete the files limen status lists under Leftover files, and old hook copies",
			},
		],
		ids: [],
		// Its refusals are untyped until R-082; it reads the project's root only after it checked that git knows one.
		refuses: [],
		example: "limen init",
		handler: initCommand,
	},
	{
		name: "status",
		object: "project",
		// A read since the seat sweep reaps dead jobs, and no read command does (T-04, R-032).
		kind: "read",
		visibility: "public",
		summary: "what runs, what landed, what waits for the owner; --all lists every job",
		schema: [{ flag: "all", about: "also the records older than 7 days, then one row for every job" }],
		ids: [],
		refuses: refusals(IN_PROJECT),
		example: "limen status --all",
		handler: statusCommand,
	},
	{
		name: "stats",
		object: "project",
		kind: "read",
		visibility: "public",
		summary: "jobs by route and role, tokens and lead time per land; --sessions adds coordinator turns",
		schema: [{ flag: "sessions", value: "dir", about: "the folder of the coordinator's Pi sessions, or a copy of it" }],
		ids: [],
		refuses: refusals(IN_PROJECT, ["SESSIONS_NOT_FOUND"]),
		example: "limen stats --sessions ../coordinator-sessions",
		handler: statsCommand,
	},
	{
		name: "board",
		object: "project",
		kind: "change",
		visibility: "public",
		summary: "the board with NOW and PROVEN; --write rewrites them in spec/build.md",
		schema: [{ flag: "write", about: "rewrite NOW and PROVEN in spec/build.md from the ticket folders" }],
		ids: [],
		refuses: refusals(IN_PROJECT, ["BAD_REPO"]),
		example: "limen board",
		handler: boardCommand,
	},
	{
		name: "migrate",
		object: "project",
		kind: "change",
		visibility: "public",
		summary: "move job records an older Limen wrote into record.json; --dry-run writes nothing",
		schema: [{ flag: "dry-run", about: "print the report of what the migration would do, and write nothing" }],
		ids: [],
		refuses: refusals(IN_PROJECT),
		example: "limen migrate --dry-run",
		irreversible: true,
		handler: migrateCommand,
	},
];

const TICKETS: readonly Entry[] = [
	{
		name: "ticket new",
		object: "ticket",
		kind: "change",
		visibility: "public",
		summary: "write a ticket with the next free number",
		schema: [
			{
				positional: "title",
				type: "text",
				shown: "what becomes true",
				about: "the title: what is true once it is done",
			},
			{ flag: "lane", choices: ["planned", "active"], about: "the folder the ticket starts in; default planned" },
			{ flag: "touches", value: "ids", about: "the map places it changes, as module ids joined by commas" },
		],
		ids: ["ticket"],
		// --touches reads the map its places come from.
		refuses: refusals(MAP_FOLDER, ["NOT_A_PROJECT"]),
		example: 'limen ticket new "Spawn names every missing route flag" --lane active',
		handler: ticketNewCommand,
	},
	{
		name: "ticket check",
		object: "ticket",
		kind: "read",
		visibility: "public",
		summary: "the ticket check land runs, for the tickets a branch changes",
		schema: [
			{
				positional: "branch",
				type: "branch",
				optional: true,
				about: "the branch to check; default the checked-out one",
			},
		],
		ids: [],
		// The map is read only where it exists, so a missing one gives no refusal.
		refuses: refusals(IN_PROJECT, ["PICTURE_NOT_A_FOLDER", "TICKET_CHECK_FAILED"]),
		example: "limen ticket check limen/2026-11-19-f012-a1b2c3d4",
		handler: ticketCheckCommand,
	},
	{
		name: "ticket done",
		object: "ticket",
		kind: "change",
		visibility: "public",
		summary: "close a ticket that landed without limen land",
		schema: [
			{ positional: "tickets", type: "ticket", repeated: true, about: "an active ticket's number; repeat for more" },
			{ flag: "on", value: "date", about: "the landed date, YYYY-MM-DD; default today" },
		],
		ids: [],
		refuses: refusals(IN_PROJECT, ["BAD_DATE", "NO_ACTIVE_TICKET", "TICKETS_UNCOMMITTED"]),
		example: "limen ticket done F012",
		handler: ticketDoneCommand,
	},
	{
		name: "keeper",
		object: "ticket",
		kind: "change",
		visibility: "public",
		summary: "a short job fixes the ticket, board and map links after the work",
		abbreviated: true,
		schema: [
			{
				positional: "ticket",
				type: "path",
				about: "the ticket file, spec/features/<lane>/FNNN-slug/ticket.md",
			},
			...ROUTE,
			{ flag: "job", value: "job", repeatable: true, about: "a finished job whose work it reads; repeat for more" },
			{ flag: "group", value: "group", about: "a group whose member jobs it reads" },
			{ flag: "candidate", value: "branch", about: "the branch it starts from; needed for several jobs" },
			{ flag: "timeout", value: "duration", about: "end the job after this time; default 20m" },
		],
		ids: ["job"],
		// It runs spawn's operation for its job, whose codes spawn declares; a group member is refused first.
		refuses: refusals(JOB_WORD, GROUP_RUN, ["BAD_REPO", "NOT_A_PROJECT", "PICTURE_NOT_A_FOLDER"]),
		example:
			"limen keeper spec/features/active/F012-demo/ticket.md --engine pi --provider pi-claude --model claude-opus-5-5 --thinking high --job a1b2c3d4",
		movedBy: "R-066",
		handler: keeperCommand,
	},
];

const RULE: Positional = {
	positional: "name",
	type: "word",
	about: "the rule's name: letters, digits, dot, dash or underscore",
};
const SEAT: readonly Entry[] = [
	{
		name: "seat queue",
		object: "seat",
		kind: "read",
		visibility: "public",
		summary: "the start queue and its CPU and memory reading",
		schema: [],
		ids: [],
		refuses: [],
		example: "limen seat queue",
		handler: seatQueueCommand,
	},
	{
		name: "seat sweep",
		object: "seat",
		kind: "change",
		visibility: "public",
		summary: "end dead jobs, resume quota jobs, prune and retire daily; --install runs it every minute",
		schema: [
			{ flag: "install", about: "install the user timer that runs the sweep every minute; needs lingering" },
			{ flag: "uninstall", about: "stop that timer and remove its units" },
			{ flag: "status", about: "say whether that timer runs, as limen status does" },
		],
		ids: [],
		// A refusal of a step after its first write is an internal error (src/operation.ts), so only the run's own.
		refuses: refusals(["SWEEP_FLAGS", "SWEEP_IN_JOB"]),
		example: "limen seat sweep --status",
		handler: seatSweepCommand,
	},
	{
		name: "rule",
		object: "seat",
		kind: "read",
		visibility: "public",
		summary: "the seat-wide rules that hold now",
		schema: [],
		ids: [],
		refuses: [],
		example: "limen rule",
		movedBy: "R-102",
		handler: ruleCommand,
	},
	{
		name: "rule set",
		object: "seat",
		kind: "change",
		visibility: "public",
		summary: "a rule for every coordinator on this machine",
		schema: [
			RULE,
			{
				flag: "until",
				value: "time",
				required: true,
				about: 'when it ends: 90m, 12h, 3d, "YYYY-MM-DD HH:MM" or an ISO time',
			},
			{
				flag: "start-priority",
				choices: ["1", "2", "3"],
				about: "while it holds, the start queue starts only jobs this urgent",
			},
			{ positional: "text", type: "text", about: "the rule; every coordinator sees it in its turn" },
		],
		ids: [],
		// Its refusals are untyped until R-102 cuts it.
		refuses: [],
		example: 'limen rule set claude-week --until 12h --start-priority 1 "Only urgent jobs until the reset"',
		movedBy: "R-102",
		handler: ruleSetCommand,
	},
	{
		name: "rule end",
		object: "seat",
		kind: "change",
		visibility: "public",
		summary: "end a rule now",
		schema: [
			RULE,
			{ positional: "reason", type: "text", optional: true, about: "why; each coordinator's end ping names it" },
		],
		ids: [],
		// Its refusals are untyped until R-102 cuts it.
		refuses: [],
		example: 'limen rule end claude-week "the limit reset"',
		movedBy: "R-102",
		handler: ruleEndCommand,
	},
	{
		name: "rule timer",
		object: "seat",
		kind: "change",
		visibility: "internal",
		caller: "the detached timer that rule set starts, or a later command when that timer died",
		summary: "end one version of a rule once, at its end time",
		schema: [
			{ positional: "folder", type: "path", about: "the rule's folder" },
			{ positional: "version", type: "word", about: "the version of the rule the timer ends" },
		],
		ids: [],
		refuses: [],
		example: "limen rule timer .limen/rules/claude-week 1763540000000-4242",
		movedBy: "R-102",
		handler: ruleTimerCommand,
	},
];

const GITHUB: readonly Entry[] = [
	{
		name: "github connect",
		object: "github",
		kind: "change",
		visibility: "public",
		summary: "bind this project's GitHub origin to this Herdr coordinator",
		schema: [],
		ids: [],
		refuses: refusals(GITHUB_SEAT, ["NOT_A_PROJECT"]),
		example: "limen github connect",
		handler: githubConnectCommand,
	},
	{
		name: "github disconnect",
		object: "github",
		kind: "change",
		visibility: "public",
		summary: "remove this project's GitHub binding; past claims stay",
		schema: [],
		ids: [],
		refuses: ["NOT_A_PROJECT"],
		example: "limen github disconnect",
		handler: githubDisconnectCommand,
	},
	{
		name: "github status",
		object: "github",
		kind: "read",
		visibility: "public",
		summary: "the binding and the newest local copy of a handoff",
		schema: [],
		ids: [],
		refuses: ["GITHUB_BINDING", "NOT_A_PROJECT"],
		example: "limen github status",
		handler: githubStatusCommand,
	},
	{
		name: "github doctor",
		object: "github",
		kind: "read",
		visibility: "public",
		summary: "check that this seat runs the GitHub module safely",
		schema: [],
		ids: [],
		// It reports a missing or wrong origin as a failed check, so only the binding itself refuses.
		refuses: ["GITHUB_BINDING", "NOT_A_PROJECT"],
		example: "limen github doctor",
		handler: githubDoctorCommand,
	},
	{
		name: "github ensure",
		object: "github",
		kind: "read",
		visibility: "internal",
		caller: "the GitHub poller",
		summary: "check that the registered Herdr coordinator is live and interactive",
		schema: [{ ...ROOT, optional: true, about: "the registered repository root; default this repository" }],
		ids: [],
		refuses: refusals(GITHUB_SEAT, ["NOT_A_PROJECT"]),
		example: "limen github ensure",
		handler: githubEnsureCommand,
	},
	{
		name: "github poll",
		object: "github",
		kind: "change",
		visibility: "internal",
		caller: "the GitHub poller's timer, as the isolated App user",
		summary: "run one polling pass over the registered projects",
		schema: [],
		ids: [],
		// A project's failure ends the pass with its class and code, as the worst of them (src/integrations/github-poller.ts).
		refuses: ["GITHUB_BINDING", "GITHUB_CONFLICT", "GITHUB_ORIGIN"],
		example: "limen github poll",
		handler: githubPollCommand,
	},
	{
		name: "github deliver",
		object: "github",
		kind: "change",
		visibility: "internal",
		caller: "the GitHub poller",
		summary: "hand one claim to the live coordinator of its project",
		schema: [ROOT, CLAIM, NONCE],
		ids: [],
		refuses: refusals(GITHUB_SEAT, ["GITHUB_CONFLICT", "NOT_A_PROJECT"]),
		example: "limen github deliver /srv/project 2468 0123456789abcdef0123456789abcdef",
		handler: githubDeliverCommand,
	},
	{
		name: "github review",
		object: "github",
		kind: "change",
		visibility: "internal",
		caller: GITHUB_PROMPT,
		summary: "start a review job for one pull request claim",
		abbreviated: true,
		schema: [ROOT, CLAIM, ...DASHED_ROUTE],
		ids: ["job"],
		// It runs spawn's operation, whose codes spawn declares; the review's pinned branch, which the spawn makes only for
		// it once the job's record names it, must not exist yet (BRANCH_EXISTS).
		refuses: refusals(GITHUB_CLAIM, ["BRANCH_EXISTS", "GITHUB_BASE_MOVED", "GITHUB_HEAD_MOVED", "GITHUB_ISSUE_REVIEW"]),
		example:
			"limen github review /srv/project 2468 --engine pi --provider pi-claude --model claude-opus-5-5 --thinking high",
		handler: githubReviewCommand,
	},
	{
		name: "github work",
		object: "github",
		kind: "change",
		visibility: "internal",
		caller: GITHUB_PROMPT,
		summary: "start a task job for one claim",
		abbreviated: true,
		schema: [
			ROOT,
			CLAIM,
			...DASHED_ROUTE,
			{ flag: "task", value: "instruction", required: true, dashValue: true, about: "what the job does" },
		],
		ids: ["job"],
		// It runs spawn's operation, whose codes spawn declares (D-075).
		refuses: refusals(GITHUB_CLAIM, ["NO_TASK"]),
		example:
			'limen github work /srv/project 2468 --engine pi --provider pi-claude --model claude-opus-5-5 --thinking high --task "Fix the typo"',
		handler: githubWorkCommand,
	},
	{
		name: "github resolve",
		object: "github",
		kind: "change",
		visibility: "internal",
		caller: GITHUB_PROMPT,
		summary: "answer one claim without a job; the poller posts the answer",
		schema: [ROOT, CLAIM, NONCE, { positional: "answer", type: "text", about: "the answer to post" }],
		ids: [],
		refuses: refusals(GITHUB_SEAT, ["GITHUB_CONFLICT", "NOT_A_PROJECT"]),
		example: 'limen github resolve /srv/project 2468 0123456789abcdef0123456789abcdef "Already fixed on main"',
		handler: githubResolveCommand,
	},
];

const GROUP: readonly Entry[] = [
	{
		name: "group start",
		object: "group",
		kind: "change",
		visibility: "public",
		summary: "start one agent per --team on one ticket; the lead gets the result once",
		abbreviated: true,
		schema: [
			{ positional: "folder", type: "path", about: "the ticket's folder, spec/features/active/FNNN-slug" },
			{
				flag: "team",
				value: "route",
				repeatable: true,
				required: true,
				about: "one team as ENGINE:PROVIDER/MODEL:THINKING; repeat it for each team",
			},
			{ flag: "rounds", value: "rounds", about: "the rounds in order, joined by commas; default draft" },
			{ flag: "workers", value: "n", about: "the workers each team may start; default 0" },
			{ flag: "timeout", value: "duration", about: "the group's time limit; default 90m" },
			{ ...EXTENSION, about: "a Pi extension every team loads; repeat it for more" },
			{
				flag: "team-extension",
				value: "team-N=path",
				repeatable: true,
				about: "a Pi extension one team loads; repeat it for more",
			},
			DETACHED,
			{ removed: "tab" },
		],
		ids: [],
		// It runs spawn's operation for each team's first job, whose codes spawn declares (D-075).
		refuses: refusals(GROUP_RUN, [
			"BAD_DURATION",
			"BAD_ENGINE",
			"BAD_EXTENSION",
			"BAD_FEATURE",
			"BAD_ROUND",
			"BAD_TEAM",
			"BAD_TEAM_EXTENSION",
			"BAD_WORKERS",
			"FINAL_NOT_LAST",
			"GROUP_LEAD_HOOK",
			"GROUP_LEAD_ONLY",
			"GROUP_NO_LEAD",
			"GROUP_NO_ROUTE",
			"GROUP_PACKET_MISSING",
			"GROUP_PACKET_UNCOMMITTED",
			"GROUP_RUN_LIVE",
			"GROUP_TIMEOUT_SHORT",
			"NO_TEAM",
			"NOT_A_PROJECT",
		]),
		example: "limen group start spec/features/active/F012-demo --team pi:pi-claude/claude-opus-5-5:high",
		handler: groupStartCommand,
	},
	{
		name: "group status",
		object: "group",
		kind: "change",
		visibility: "public",
		summary: "the group's round, deadline and each member's state; moves on a stuck round",
		schema: [GROUP_ID, { removed: "json" }],
		ids: [],
		refuses: refusals(SELECTED_GROUP),
		example: "limen group status 3f2a9c1e-7b4d-4e8a-9c0f-1a2b3c4d5e6f",
		handler: groupStatusCommand,
	},
	{
		name: "group publish",
		object: "group",
		kind: "change",
		visibility: "public",
		summary: "tell the other teams a finding, or one team with --team",
		schema: [
			GROUP_ID,
			{ flag: "team", value: "team", about: "the one team that gets it, such as team-2" },
			{ positional: "finding", type: "text", about: "the finding, its check and its evidence" },
		],
		ids: [],
		refuses: refusals(SELECTED_GROUP),
		example: 'limen group publish "Finding: stale revisions conflict. Check: npm test"',
		handler: groupPublishCommand,
	},
	{
		name: "group stop",
		object: "group",
		kind: "change",
		visibility: "public",
		summary: "stop every member job and start no more; the lead only",
		schema: [GROUP_ID],
		ids: [],
		refuses: refusals(SELECTED_GROUP, ["GROUP_LEAD_ONLY"]),
		example: "limen group stop 3f2a9c1e-7b4d-4e8a-9c0f-1a2b3c4d5e6f",
		handler: groupStopCommand,
	},
	{
		name: "group close",
		object: "group",
		kind: "change",
		visibility: "public",
		summary: "close a group whose members are over, so prune can remove their worktrees",
		schema: [GROUP_ID],
		ids: [],
		refuses: refusals(SELECTED_GROUP, ["GROUP_LEAD_ONLY"]),
		example: "limen group close 3f2a9c1e-7b4d-4e8a-9c0f-1a2b3c4d5e6f",
		handler: groupCloseCommand,
	},
	{
		name: "group wait",
		object: "group",
		kind: "change",
		visibility: "internal",
		caller: "team members with a worker allowance",
		summary: "keep a member's turn open: wait at most 20 s for the group's next events",
		schema: [
			{
				...GROUP_ID,
				about: "refused for every caller outside a team, given or not, and for a member who gives one",
			},
			{ flag: "timeout", value: "duration", about: "wait at most this long, such as 5s" },
		],
		ids: [],
		// Only a member waits, and a member's group comes from its own environment, never from the project's root.
		refuses: refusals(GROUP_RUN, ["BAD_DURATION", "GROUP_CONTEXT", "GROUP_ROSTER", "GROUP_WAIT_MEMBERS_ONLY"]),
		example: "limen group wait --timeout 5s",
		movedBy: "R-077",
		handler: groupWaitCommand,
	},
	{
		name: "group advance",
		object: "group",
		kind: "change",
		visibility: "internal",
		caller: "each team job that ends, and limen group status",
		summary: "start the group's next round once every team of this one has ended",
		schema: [{ positional: "group", type: "word", about: "the group's id" }],
		ids: [],
		// It runs continue's operation for each team's next job, whose codes continue declares (D-075).
		refuses: refusals(IN_PROJECT, GROUP_RUN, ["GROUP_NO_ROUTE"]),
		example: "limen group advance 3f2a9c1e-7b4d-4e8a-9c0f-1a2b3c4d5e6f",
		handler: groupAdvanceCommand,
	},
];

const PICTURE: readonly Entry[] = [
	{
		name: "picture build",
		object: "picture",
		// A change, by the rule of `board`: `--json <file>` writes a file.
		kind: "change",
		visibility: "public",
		summary: "check the map with its tickets and board offline; writes no page",
		schema: [
			{ flag: "dir", value: "dir", about: "the map's folder, or one with .limen/picture; default this repository" },
			{ flag: "json", value: "file", about: "write the map's model to this file" },
			{ flag: "strict", about: "refuse when the check finds an error" },
			{ removed: "out" },
		],
		ids: [],
		refuses: refusals(MAP_FOLDER, ["NOT_A_PROJECT", "PICTURE_INVALID"]),
		example: "limen picture build --strict",
		handler: pictureBuildCommand,
	},
	{
		name: "picture serve",
		object: "picture",
		kind: "read",
		visibility: "public",
		summary: "serve this project's job activity on 127.0.0.1 at /activity.json and /events",
		schema: [{ flag: "port", value: "port", about: "the port; default 4747" }, { removed: "dir" }],
		ids: [],
		refuses: ["NOT_A_PROJECT"],
		example: "limen picture serve --port 4747",
		handler: pictureServeCommand,
	},
];

const WORKSPACE: readonly Entry[] = [
	{
		name: "workspace init",
		object: "workspace",
		kind: "change",
		visibility: "public",
		summary: "set up this folder outside Git as a workspace of the Git repositories in it",
		schema: [],
		ids: [],
		// Its one refusal, a folder git knows, is untyped until R-082.
		refuses: [],
		example: "limen workspace init",
		handler: workspaceInitCommand,
	},
];

/** Every command, in the order of the help. */
export const REGISTRY: readonly Entry[] = [
	...JOBS,
	...PROJECT,
	...TICKETS,
	...SEAT,
	...GITHUB,
	...GROUP,
	...PICTURE,
	...WORKSPACE,
];
/** The registered command names; the table of old names (`src/old-names.ts`) holds none of them. */
export const COMMAND_NAMES: readonly string[] = REGISTRY.map((entry) => entry.name);
