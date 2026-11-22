/**
 * Systemd units as typed data, and the one renderer of the text systemd reads (D-010): each unit is a list of sections,
 * each section a list of directives, and a value that would start a line of its own is refused. The alerts' service
 * and timer (D-085) come first; the sweep's units (R-032) reuse the renderer. `seat/alerts.ts install` writes these
 * units, and `seat/deploy.ts` has the new version's `units` step write them again at each deployment.
 */

/** One `Key=value` line of a section. */
export type Directive = readonly [key: string, value: string];
export type UnitSection = {
	readonly name: "Unit" | "Service" | "Timer" | "Install";
	readonly directives: readonly Directive[];
};
/** A unit file: its name under the unit folder, and its sections in order. */
export type UnitDefinition = { readonly file: string; readonly sections: readonly UnitSection[] };

export const ALERTS_SERVICE = "limen-alerts.service";
export const ALERTS_TIMER = "limen-alerts.timer";
/** The root-owned file, mode 0600, whose text is the ntfy topic; the service gets it as the credential `topic`. */
export const TOPIC_FILE = "/etc/limen/alerts-topic";
/** What the service runs, by absolute paths: root's Node and the deployed checkout (A-025, D-010, the D-080 note). */
const ALERTS_RUN = "/usr/bin/node /opt/limen/seat/alerts.ts run";
/** A system account's name as `useradd` takes it by default, so a unit's `User=` holds nothing else. */
const ACCOUNT = /^[a-z_][a-z0-9_-]{0,31}$/;
const KEY = /^[A-Z][A-Za-z]*$/;
/** The first line of every unit; at most 100 characters, as every line Limen generates (T-10). */
const HEADER = "# Written by /opt/limen/seat/alerts.ts install; seat/deploy.ts rewrites it at each deployment.";

/** Whether `name` has the form of a system account's name. */
export function accountName(name: string): boolean {
	return ACCOUNT.test(name);
}

/**
 * The alerts' service and timer for the account `account` (D-085): a oneshot run every minute from boot, on its own
 * account, with the topic as a credential, its reported events in its own state folder, and no write right anywhere
 * else (`ProtectSystem=strict`, `ProtectHome=read-only`).
 */
export function alertsUnits(account: string): readonly UnitDefinition[] {
	if (!accountName(account)) {
		throw new Error(`the alerts account ${JSON.stringify(account)} is not a system account name`);
	}
	return [
		{
			file: ALERTS_SERVICE,
			sections: [
				{
					name: "Unit",
					directives: [["Description", "Limen alerts: one ntfy line for each failed job of the registered projects"]],
				},
				{
					name: "Service",
					directives: [
						["Type", "oneshot"],
						["User", account],
						["ExecStart", ALERTS_RUN],
						["LoadCredential", `topic:${TOPIC_FILE}`],
						["StateDirectory", "limen-alerts"],
						["StateDirectoryMode", "0700"],
						["TimeoutStartSec", "120"],
						["NoNewPrivileges", "yes"],
						["ProtectSystem", "strict"],
						["ProtectHome", "read-only"],
						["PrivateTmp", "yes"],
					],
				},
			],
		},
		{
			file: ALERTS_TIMER,
			sections: [
				{ name: "Unit", directives: [["Description", "Run the Limen alerts every minute"]] },
				{
					name: "Timer",
					directives: [
						["OnBootSec", "1min"],
						["OnUnitActiveSec", "1min"],
						["AccuracySec", "1s"],
						["Unit", ALERTS_SERVICE],
					],
				},
				{ name: "Install", directives: [["WantedBy", "timers.target"]] },
			],
		},
	];
}

/** The text of `unit`: the header line, then each section with its directives, sections apart by one empty line. */
export function renderUnit(unit: UnitDefinition): string {
	const sections = unit.sections.map(({ name, directives }) =>
		[`[${name}]`, ...directives.map((directive) => directiveLine(unit.file, directive))].join("\n"),
	);
	return `${HEADER}\n${sections.join("\n\n")}\n`;
}

/** `Key=value`; a key of another form, an empty value or a control character in it would change what systemd reads. */
function directiveLine(file: string, [key, value]: Directive): string {
	if (!KEY.test(key) || value === "" || /\p{Cc}/u.test(value)) {
		throw new Error(`${file}: the directive ${JSON.stringify(key)}=${JSON.stringify(value)} cannot be written`);
	}
	return `${key}=${value}`;
}

/** The account the unit text `text` runs as: the last `User=` of its `[Service]` section, as systemd reads it. */
export function unitUser(text: string): string | undefined {
	let section = "";
	let user: string | undefined;
	for (const line of text.split("\n").map((each) => each.trim())) {
		if (line.startsWith("[") && line.endsWith("]")) {
			section = line;
		} else if (section === "[Service]" && line.startsWith("User=")) {
			user = line.slice("User=".length).trim();
		}
	}
	return user;
}
