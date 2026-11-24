import { DEAD_WRAPPER, formatDuration, type Job, type Pulse } from "./job.ts";

/** A job as `limen status` and `limen show` show it, built from its record (src/job/record.ts) and its content files. */
export type ShownJob = {
	readonly id: string;
	readonly invalid?: string;
	readonly job?: Job;
	readonly pulse?: Pulse;
	/** For a job in the start queue: its wait and the reason. */
	readonly queue?: string;
	readonly toolCalls?: number;
	readonly producedNothing?: boolean;
	readonly lastTool?: string;
	readonly reason?: string;
	readonly elapsedMs?: number;
	readonly silentMs?: number;
	readonly ageMs?: number;
	readonly commitCount?: number;
	readonly repo?: string;
	readonly parent?: string;
	/** Detail only: who ran the spawn, from the record's `spawner`, else `job <id>` from its `spawnedBy`. */
	readonly spawnedBy?: string;
	readonly candidate?: string;
	readonly advisory?: string;
	readonly stopReason?: string;
	readonly versions?: string;
	readonly commits?: string;
	readonly result?: string;
	/** The open items of the final "Note check" of a done job, one per line. */
	readonly openChecks?: string;
	/** The side channels of the job's end that failed (T-01), one `<channel>: <message>` per line. */
	readonly sideFailures?: string;
	readonly model?: string;
	readonly tokens?: string;
	/** Detail only: a failed job's failure kind, and for quota its reset time (A-016 (1)). */
	readonly failure?: string;
	/**
	 * Detail only: the memory peak, CPU time with its peak share and OOM kills of a finished job's systemd user scope
	 * (M-09).
	 */
	readonly scope?: string;
	readonly cleanup?: string;
	readonly herdrWake?: string;
	readonly diffstat?: string;
	readonly logTail?: string;
};
export type Paint = (style: "dim" | "bold" | "red" | "green" | "yellow", text: string) => string;

export function colorWanted(tty: boolean, noColor: string | undefined, term: string | undefined): boolean {
	return tty && !noColor && term !== "dumb";
}
export function paintWhen(color: boolean): Paint {
	const codes = { dim: "2", bold: "1", red: "31", green: "32", yellow: "33" } as const;
	return color ? (style, text) => `\u001b[${codes[style]}m${text}\u001b[0m` : (_style, text) => text;
}
export function formatAge(milliseconds: number): string {
	const minutes = Math.floor(Math.max(0, milliseconds) / 60_000);
	if (minutes < 1) {
		return "just now";
	}
	if (minutes < 60) {
		return `${minutes}m ago`;
	}
	const hours = Math.floor(minutes / 60);
	if (hours < 48) {
		return `${hours}h ago`;
	}
	return `${Math.floor(hours / 24)}d ago`;
}
export function humanDetail(record: ShownJob, paint: Paint): string {
	const job = record.job;
	if (record.invalid || !job) {
		const tail = record.logTail ? `\n${indented(record.logTail, paint)}` : "";
		return `${paint("red", "!")} ${record.id}  ${paint("red", record.invalid ?? "unreadable")}${tail}`;
	}
	const lines = [
		[
			`${glyph(record, paint)} ${paint("bold", job.label)}`,
			record.openChecks ? "done with open checks" : job.phase,
			...flags(record),
		].join(paint("dim", " · ")),
	];
	const put = (key: string, value: string | undefined) => {
		if (value) {
			lines.push(...keyed(key, value, paint));
		}
	};
	put("id", emphasizeSuffix(record.id, paint));
	put("branch", job.branch);
	put("repo", record.repo);
	put("parent", record.parent);
	put("spawned-by", record.spawnedBy);
	put("candidate", record.candidate);
	put("model", record.model);
	put("tokens", record.tokens);
	put("failure", record.failure);
	put("scope", record.scope);
	if (job.phase === "running") {
		put("up", runningFacts(record, paint).join(" · "));
		if (job.pid !== undefined) {
			put("pid", `${job.pid}`);
		}
		put("advisory", record.advisory);
	} else {
		put("ran", terminalRanLine(record, paint));
		// The header already says "done with open checks", and `open-checks` lists them.
		put("reason", record.openChecks ? undefined : record.reason);
	}
	put("versions", record.versions);
	put("commits", record.commits);
	put("stop-reason", record.stopReason);
	put("open-checks", record.openChecks);
	put("side-failures", record.sideFailures);
	put("result", record.result);
	put("diff", record.diffstat);
	put("cleanup", record.cleanup);
	put("herdr-wake", record.herdrWake);
	put("log", renderLogTail(record.logTail ?? "", paint));
	return lines.join("\n");
}
export function renderLogTail(tail: string, paint: Paint): string {
	const kept: string[] = [];
	for (const line of tail.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed || trimmed === "…") {
			continue;
		}
		const event = /^\[limen ([^\]]+)\] (.*)$/.exec(trimmed);
		if (event) {
			kept.push(`${paint("dim", clock(event[1] ?? ""))} ${event[2] ?? ""}`);
		} else if (!/^[a-z][a-z0-9_-]{0,19}$/.test(trimmed)) {
			kept.push(paint("dim", trimmed));
		}
	}
	return kept.join("\n");
}
function glyph(record: ShownJob, paint: Paint): string {
	if (record.invalid || !record.job) {
		return paint("red", "!");
	}
	if (record.job.phase === "running") {
		return paint(record.pulse === "dead" ? "red" : "green", "●");
	}
	if (record.job.phase === "done") {
		return paint(record.openChecks ? "yellow" : "green", "✓");
	}
	if (record.job.phase === "failed") {
		return paint("red", "✗");
	}
	return paint("yellow", "■");
}
function runningFacts(record: ShownJob, paint: Paint): string[] {
	const facts = [formatDuration(record.elapsedMs ?? 0)];
	const pulse = record.pulse ?? "think";
	if (pulse === "dead") {
		facts.push(paint("red", DEAD_WRAPPER));
	} else if (pulse === "unknown") {
		facts.push(paint("yellow", "owner unknown"));
	} else if (pulse === "starting") {
		facts.push(paint("dim", "starting"));
	} else if (pulse === "queued") {
		// A queued job has no engine yet, so its silence is no warning.
		return [...facts, paint("dim", `queued · ${record.queue ?? "waiting"}`)];
	} else {
		facts.push(pulse === "tool" && record.lastTool ? clip(record.lastTool, 24) : pulse);
	}
	if (record.toolCalls !== undefined) {
		facts.push(`${record.toolCalls} tools`);
	}
	const silent = record.silentMs ?? 0;
	if (silent >= 300_000) {
		facts.push(paint("red", `silent ${formatDuration(silent)}`));
	} else if (silent >= 90_000) {
		facts.push(paint("yellow", `silent ${formatDuration(silent)}`));
	}
	return facts;
}
function terminalRanLine(record: ShownJob, paint: Paint): string {
	const facts = [formatDuration(record.elapsedMs ?? 0), ...workFacts(record, paint)];
	if (record.ageMs !== undefined) {
		facts.push(`finished ${formatAge(record.ageMs)}`);
	}
	return facts.join(" · ");
}
function workFacts(record: ShownJob, paint: Paint): string[] {
	if (record.producedNothing) {
		return [paint("red", "nothing")];
	}
	const facts =
		record.toolCalls === undefined ? [] : [`${record.toolCalls} ${record.toolCalls === 1 ? "tool" : "tools"}`];
	if (record.commitCount) {
		facts.push(`${record.commitCount} ${record.commitCount === 1 ? "commit" : "commits"}`);
	}
	return facts;
}
function flags(record: ShownJob): string[] {
	const out: string[] = [];
	if (record.candidate) {
		out.push("review");
	}
	if (record.parent) {
		out.push("continue");
	}
	if (record.repo) {
		out.push(`repo ${record.repo}`);
	}
	return out;
}
function keyed(key: string, value: string, paint: Paint): string[] {
	const [first = "", ...rest] = value.split("\n");
	return [`  ${paint("dim", key.padEnd(11))} ${first}`, ...rest.map((line) => `  ${" ".repeat(11)} ${line}`)];
}
function emphasizeSuffix(id: string, paint: Paint): string {
	const cut = id.lastIndexOf("-") + 1;
	return cut > 0 && cut < id.length ? `${paint("dim", id.slice(0, cut))}${id.slice(cut)}` : id;
}
function indented(block: string, paint: Paint): string {
	return block
		.split("\n")
		.map((line) => `  ${paint("dim", line)}`)
		.join("\n");
}
function clock(iso: string): string {
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) {
		return iso;
	}
	const pad = (part: number) => `${part}`.padStart(2, "0");
	return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}
function clip(text: string, max: number): string {
	const points = [...text];
	return points.length > max ? `${points.slice(0, max - 1).join("")}…` : text;
}
