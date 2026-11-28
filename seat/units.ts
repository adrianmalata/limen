/**
 * The alerts' systemd units as typed data (D-010, D-085): their service and timer, rendered by the one renderer of
 * src/platform/systemd-units.ts, which holds the unit model and the seat sweep's user units too (R-032).
 * `seat/alerts.ts install` writes these units, and `seat/deploy.ts` has the new version's `units` step write them
 * again at each deployment.
 */
import { renderUnit, type UnitDefinition } from "../src/platform/systemd-units.ts";

export const ALERTS_SERVICE = "limen-alerts.service";
export const ALERTS_TIMER = "limen-alerts.timer";
/** The root-owned file, mode 0600, whose text is the ntfy topic; the service gets it as the credential `topic`. */
export const TOPIC_FILE = "/etc/limen/alerts-topic";
/**
 * The root-owned folder, mode 0700, of the `main` watcher's entries (seat/main-watch.ts, D-117 (3)). The service loads
 * it as the credential `watch`, which systemd hands over as one credential per file, `watch_<file name>`.
 */
export const WATCH_FOLDER = "/etc/limen/watch";
export const WATCH_CREDENTIAL = "watch";
/** What the service runs, by absolute paths: root's Node and the deployed checkout (A-025, D-010, the D-080 note). */
const ALERTS_RUN = "/usr/bin/node /opt/limen/seat/alerts.ts run";
/** A system account's name as `useradd` takes it by default, so a unit's `User=` holds nothing else. */
const ACCOUNT = /^[a-z_][a-z0-9_-]{0,31}$/;
/** The first line of each alerts unit; at most 100 characters, as every line Limen generates (T-10). */
const HEADER = "# Written by /opt/limen/seat/alerts.ts install; seat/deploy.ts rewrites it at each deployment.";

/** Whether `name` has the form of a system account's name. */
export function accountName(name: string): boolean {
	return ACCOUNT.test(name);
}

/**
 * The alerts' service and timer for the account `account` (D-085): a oneshot run every minute from boot, on its own
 * account, with the topic and the `main` watcher's entries as credentials (D-117), its reported events and the
 * watcher's copies in its own state folder, and no write right anywhere else (`ProtectSystem=strict`,
 * `ProtectHome=read-only`).
 */
export function alertsUnits(account: string): readonly UnitDefinition[] {
	if (!accountName(account)) {
		throw new Error(`the alerts account ${JSON.stringify(account)} is not a system account name`);
	}
	return [
		{
			file: ALERTS_SERVICE,
			header: HEADER,
			sections: [
				{
					name: "Unit",
					directives: [["Description", "Limen alerts: one ntfy line for each failed job and long start-queue wait"]],
				},
				{
					name: "Service",
					directives: [
						["Type", "oneshot"],
						["User", account],
						["ExecStart", ALERTS_RUN],
						["LoadCredential", `topic:${TOPIC_FILE}`],
						["LoadCredential", `${WATCH_CREDENTIAL}:${WATCH_FOLDER}`],
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
			header: HEADER,
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

/** The alerts' units for `account` as the files systemd reads: each one's name and its rendered text. */
export function alertsUnitFiles(account: string): readonly { readonly file: string; readonly text: string }[] {
	return alertsUnits(account).map((unit) => ({ file: unit.file, text: renderUnit(unit) }));
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
