import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { atomicWrite } from "../atomic-write.ts";
import { transport } from "../config.ts";
import { type LiveCoordinator, liveCoordinators } from "../integrations/coordinator-registration.ts";
import { promptPane } from "../integrations/coordinator-wake.ts";
import { herdrBinary } from "../integrations/herdr.ts";
import { spawnerLine } from "../job/publication.ts";
import { textFile } from "../job/record.ts";
import type { Parsed } from "../parser.ts";
import { registeredProjects } from "../project/seat.ts";
import {
	activeRules,
	claimRuleEnd,
	localTime,
	openRules,
	RULE_NAME,
	readRule,
	ruleEnded,
	ruleFolder,
	ruleLine,
	type SeatRule,
	writeRule,
} from "../project/seat-rules.ts";
import { startLimen } from "../runtime/launcher.ts";

const UNITS = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 } as const;
const PING_MS = 20_000;
type Kind = "set" | "change" | "end";
type Tab = LiveCoordinator & { readonly root: string };

/**
 * Seat-wide rules for every coordinator. A set, a change and an end each ping every live coordinator tab once; a
 * detached timer ends the rule at its end time. `limen rule` lists the rules that hold now.
 */
export async function ruleCommand(): Promise<undefined> {
	const rules = activeRules();
	console.log(
		rules.length
			? rules.map((rule) => `${ruleLine(rule)}\n  set by ${rule.setBy}, ${localTime(rule.setAt)}`).join("\n")
			: "no active rules",
	);
}

/** `limen rule timer` (internal): the detached timer of one version of a rule. */
export async function ruleTimerCommand(values: Parsed): Promise<undefined> {
	await ruleTimer(values.get("folder") ?? "", values.get("version") ?? "");
}

/**
 * The fallback for a timer that died: every `limen` command, by its registry name, run where Herdr is reachable
 * starts a fresh timer for a rule whose end time passed. The end claim keeps its end ping to one per tab.
 */
export function endDueRules(command: string): void {
	if (transport("LIMEN_JOB") === "1" || command === "rule timer" || !herdrBinary()) {
		return;
	}
	for (const rule of openRules()) {
		if (rule.due) {
			startTimer(rule);
		}
	}
}

/** `limen rule set`: sets or changes a rule for every coordinator on the seat until its end time. */
export async function ruleSetCommand(values: Parsed): Promise<undefined> {
	const name = values.get("name") ?? "";
	const text = (values.get("text") ?? "").replace(/\s+/g, " ").trim();
	const until = values.get("until") ?? "";
	if (!RULE_NAME.test(name) || !text) {
		throw new Error("rule set needs a name of letters, digits, dot, dash or underscore, and a text");
	}
	const priority = values.get("start-priority");
	const before = readRule(ruleFolder(name));
	const change = before !== undefined && !ruleEnded(before) && Date.parse(before.until) > Date.now();
	const rule: SeatRule = {
		name,
		text,
		until: parseUntil(until),
		setBy: spawnerLine(),
		setAt: new Date().toISOString(),
		...(priority ? { startPriority: Number(priority) } : {}),
		version: `${Date.now()}-${process.pid}`,
	};
	writeRule(rule);
	startTimer(rule);
	console.log(`rule ${name} ${change ? "changed" : "set"} until ${localTime(rule.until)}`);
	const kind = change ? "change" : "set";
	for (const line of await broadcast(rule, kind, ruleText(rule, kind))) {
		console.log(line);
	}
}

/** `limen rule end`: ends a rule now and pings every live coordinator tab once. */
export async function ruleEndCommand(values: Parsed): Promise<undefined> {
	const name = values.get("name") ?? "";
	const rule = openRules().find((open) => open.name === name && !open.due);
	if (!rule) {
		throw new Error(`no active rule ${JSON.stringify(name)}; limen rule lists them`);
	}
	const reason = (values.get("reason") ?? "").replace(/\s+/g, " ").trim();
	const lines = await endRule(rule, `by limen rule end${reason ? `: ${reason}` : ""}`);
	console.log(lines ? [`rule ${name} ended`, ...lines].join("\n") : `rule ${name} had already ended`);
}

/** Ends this version of the rule once, at its end time, unless a change or an end replaced it first. */
async function ruleTimer(folder: string, version: string): Promise<void> {
	while (true) {
		const rule = readRule(folder);
		if (rule?.version !== version || ruleEnded(rule)) {
			return;
		}
		const left = Date.parse(rule.until) - Date.now();
		if (left <= 0) {
			await endRule(rule, "its end time passed");
			return;
		}
		// Short sleeps follow the wall clock across a laptop sleep.
		await delay(Math.min(left, 60_000));
	}
}

async function endRule(rule: SeatRule, why: string): Promise<readonly string[] | undefined> {
	if (!claimRuleEnd(rule, why)) {
		return;
	}
	return broadcast(rule, "end", ruleText(rule, "end", why));
}

/**
 * Starts the rule's timer in a systemd user scope of its own. A rule serves no job, so a timer that cannot start is
 * one line on this command's stderr; the next command that finds the rule past its end starts a timer again.
 */
function startTimer(rule: SeatRule): void {
	void startLimen(["rule", "timer", ruleFolder(rule.name), rule.version], {
		env: { ...process.env, LIMEN_INTERNAL_RUN: undefined },
	}).catch((error: unknown) =>
		console.error(
			`rule ${rule.name}: its timer could not start: ${error instanceof Error ? error.message : String(error)}`,
		),
	);
}

/**
 * One ping per live coordinator pane, to the newest live registration on it, across the seat's projects. The pane that
 * ran this command is pinged too. Each pane's receipt is claimed before the prompt, so no process sends the same text
 * to a pane twice.
 */
async function broadcast(rule: SeatRule, kind: Kind, text: string): Promise<readonly string[]> {
	const tabs = await liveTabs();
	const herdr = herdrBinary();
	if (!herdr) {
		return tabs.length ? [`no Herdr binary on PATH; ${tabs.length} coordinator tabs not pinged`] : [];
	}
	const dir = join(ruleFolder(rule.name), "pings", `${rule.version}.${kind}`);
	await mkdir(dir, { recursive: true });
	return Promise.all(tabs.map((tab) => pingTab(herdr, join(dir, tab.pane.replace(/[^\w.:-]/g, "_")), tab, text)));
}

async function pingTab(herdr: string, receipt: string, tab: Tab, text: string): Promise<string> {
	try {
		const claim = `attempting ${tab.pane}, ${tab.root} session ${tab.session} ${new Date().toISOString()}\n`;
		await atomicWrite(receipt, claim, { exclusive: true });
	} catch {
		return `${tab.pane}: pinged already`;
	}
	await promptPane(herdr, tab.pane, text, Date.now() + PING_MS, receipt);
	return `${tab.pane}: ${(await textFile(receipt)).split("\n").at(-1)}`;
}

async function liveTabs(): Promise<readonly Tab[]> {
	const newest = new Map<string, Tab>();
	for (const root of registeredProjects()) {
		for (const tab of await liveCoordinators(root)) {
			const seen = newest.get(tab.pane);
			if (!seen || tab.startedAt > seen.startedAt) {
				newest.set(tab.pane, { ...tab, root });
			}
		}
	}
	return [...newest.values()];
}

function ruleText(rule: SeatRule, kind: Kind, why = ""): string {
	const said = /[.!?]$/.test(rule.text) ? rule.text : `${rule.text}.`;
	const priority = rule.startPriority ? ` Start priority: ${rule.startPriority}.` : "";
	if (kind === "end") {
		return `Limen rule ${rule.name} for every coordinator ended ${localTime(new Date().toISOString())} (${why}). It held: ${said}${priority} Stop following it. It is off the board; do not record it in spec/build.md.`;
	}
	const head = kind === "set" ? "for every coordinator, until" : "for every coordinator changed; it now holds until";
	return `Limen rule ${rule.name} ${head} ${localTime(rule.until)}: ${said}${priority} Follow it until it ends. It is on the board (limen rule, limen board, your turn context); do not copy it into spec/build.md. Limen tells you when it changes or ends.`;
}

/** A duration such as 90m, 12h or 3d; a local date and time; or an ISO time with a zone. Only a future time. */
function parseUntil(value: string, now = Date.now()): string {
	const span = /^(\d+)([smhd])$/.exec(value);
	const local = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);
	let at = Number.NaN;
	if (span) {
		at = now + Number(span[1]) * UNITS[span[2] as keyof typeof UNITS];
	} else if (local) {
		const [year, month, day, hour, minute, second] = local.slice(1).map((part) => Number(part ?? 0));
		const date = new Date(year ?? 0, (month ?? 0) - 1, day, hour, minute, second);
		at = date.getMonth() === (month ?? 0) - 1 && date.getDate() === day ? date.getTime() : Number.NaN;
	} else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
		at = Date.parse(value);
	}
	if (!Number.isFinite(at)) {
		throw new Error(
			`--until takes a duration such as 90m, 12h or 3d, a local time such as "2026-10-27 18:00", or an ISO time such as 2026-10-27T16:00Z; got ${JSON.stringify(value)}`,
		);
	}
	if (at <= now) {
		throw new Error(`--until ${value} is not in the future`);
	}
	return new Date(at).toISOString();
}
