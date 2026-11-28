// seat/units.ts: the alerts' units as golden texts, the refusal of an account that is no system account name, and the
// User= reader. The renderer itself is src/platform/systemd-units.ts's (test/platform/systemd-units.test.ts).
import assert from "node:assert/strict";
import test from "node:test";
import { ALERTS_SERVICE, ALERTS_TIMER, alertsUnitFiles, alertsUnits, unitUser } from "../../seat/units.ts";

const ACCOUNT = "alerts-test";

/** The text of the alerts unit `name` for `ACCOUNT`. */
function rendered(name: string): string {
	const unit = alertsUnitFiles(ACCOUNT).find((each) => each.file === name);
	assert.ok(unit, `no unit ${name}`);
	return unit.text;
}

// D-117 (3): the `main` watcher's entries reach the service as a credential, loaded from root's folder.
test("limen-alerts.service renders as its golden text: a oneshot run of /usr/bin/node on the alerts account", () => {
	assert.equal(
		rendered(ALERTS_SERVICE),
		[
			"# Written by /opt/limen/seat/alerts.ts install; seat/deploy.ts rewrites it at each deployment.",
			"[Unit]",
			"Description=Limen alerts: one ntfy line for each failed job and long start-queue wait",
			"",
			"[Service]",
			"Type=oneshot",
			"User=alerts-test",
			"ExecStart=/usr/bin/node /opt/limen/seat/alerts.ts run",
			"LoadCredential=topic:/etc/limen/alerts-topic",
			"LoadCredential=watch:/etc/limen/watch",
			"StateDirectory=limen-alerts",
			"StateDirectoryMode=0700",
			"TimeoutStartSec=120",
			"NoNewPrivileges=yes",
			"ProtectSystem=strict",
			"ProtectHome=read-only",
			"PrivateTmp=yes",
			"",
		].join("\n"),
	);
});

test("limen-alerts.timer renders as its golden text: every minute, from boot", () => {
	assert.equal(
		rendered(ALERTS_TIMER),
		[
			"# Written by /opt/limen/seat/alerts.ts install; seat/deploy.ts rewrites it at each deployment.",
			"[Unit]",
			"Description=Run the Limen alerts every minute",
			"",
			"[Timer]",
			"OnBootSec=1min",
			"OnUnitActiveSec=1min",
			"AccuracySec=1s",
			"Unit=limen-alerts.service",
			"",
			"[Install]",
			"WantedBy=timers.target",
			"",
		].join("\n"),
	);
});

// Review round 1, F6: the header line was 103 characters.
test("T-10: every line of both alerts units is at most 100 characters", () => {
	const wide = [ALERTS_SERVICE, ALERTS_TIMER]
		.flatMap((name) => rendered(name).split("\n"))
		.filter((line) => [...line].length > 100);
	assert.deepEqual(wide, []);
});

test("an account name that is not a system account name is refused before a unit holds it", () => {
	assert.throws(() => alertsUnits("Alerts Test"), /account/);
});

test("unitUser reads the account from the last User= of the [Service] section and nothing from another section", () => {
	assert.equal(unitUser("[Unit]\nUser=other\n\n[Service]\nUser=first\nUser=alerts-test\n"), ACCOUNT);
	assert.equal(unitUser("[Unit]\nUser=other\n\n[Service]\nType=oneshot\n"), undefined);
	assert.equal(unitUser(rendered(ALERTS_SERVICE)), ACCOUNT);
});
