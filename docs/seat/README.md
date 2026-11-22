# Seat bring-up

Operator checklist and the current setup steps. Limen does not run these. Copy the units, set the drop-ins, enable the timers.

The seat owns the project copy (the Git checkout), the worktrees, and the job files in `.limen/jobs/`. The laptop is only a window.

Units next to this file: `limen-prune.{service,timer}`, and the Pi extensions `coordinator-handoff.ts`, `quota-resume.ts` and `statusline.ts`. The alerts' units are written by `seat/alerts.ts` (below).

## Box

- Ubuntu LTS. 4 GB RAM minimum, 8 GB if you run browsers or Docker. 80 GB disk (worktrees are full copies on ext4).
- Public SSH only, key auth, no password. Everything else tailnet-only.
- Hostname you will type: the Tailscale MagicDNS name.

## On the box

1. `tailscale up`. Confirm you can `ssh you@that-name` from the Mac.
2. Node 24, Git, `gh`, and the engine, `pi`, on `PATH`. Install Herdr the same way you did on the Mac.
3. Clone limen, `npm install && npm link`. Clone **one** project. `limen init` there. This is the only project copy that runs jobs.
4. Model provider, `gh auth login`, and deploy tokens stay on the seat. The **GitHub App key** for the optional PR doorbell is different: it belongs only to the separate `limen-github` Unix user, never to the worker/coordinator account.
5. Disable automatic reboot under live jobs (`Unattended-Upgrade::Automatic-Reboot "false";`). Patch when you choose.
6. Start a persistent Herdr session (or `herdr server` under systemd) so attach works with the lid closed. Turn on lingering for the account (root: `loginctl enable-linger <account>`): every job runs in its own systemd user scope, so the account's user instance must run, and `systemd-run --user --scope true` must exit 0 from a Herdr pane. `limen init` checks it.
7. `herdr integration install pi`: Herdr's Pi integration serves the coordinator pane. First smoke job: `limen spawn --detached`.

## Alerts

The alerts send one line to the phone through the public ntfy relay for each failed job of every registered project: `<project folder's base name> failed:<kind> <job id>`, such as `synchronizer failed:quota 2026-11-16-f001-work-a-37c02ed6`, with no title. No path, label or job text leaves the seat; `limen status` over SSH gives the details. A job that ends `done` sends nothing. They are the only escalation path to the owner, so they belong to every seat, and `limen status` warns while their timer is not active or their last run failed.

They run every minute as `limen-alerts.service`, a system service on an account of their own: `/usr/bin/node /opt/limen/seat/alerts.ts run` reads the registries and the job records, and keeps the events it reported in its own state folder (`StateDirectory=limen-alerts`), so it writes no file of the agents' account. The topic reaches it only as the systemd credential `topic` (`LoadCredential=topic:/etc/limen/alerts-topic`). An event is reported only after ntfy took it, so a failed send comes again on the next run; a project or a record it cannot read is named in the journal, the run fails, and the other projects still alert. A run that reads no project at all fails too, naming why: a registry or a registered project it could not read (counted first, since root's own registry is always closed to it), registries that name no project, every registry in a home closed to it, or no registry.

Install, as root, once:

1. On the phone: the ntfy app, subscribed to a long random topic. From the laptop: `curl -d test https://ntfy.sh/$topic`; the phone must buzz.
2. Create the alerts account: `useradd --system --no-create-home --shell /usr/sbin/nologin <account>`; the name stays on the seat.
3. Write the topic into `/etc/limen/alerts-topic`, a file of root's with mode 0600 (`install -d -m 0755 /etc/limen && install -o root -g root -m 0600 /dev/null /etc/limen/alerts-topic`, then an editor).
4. `node /opt/limen/seat/alerts.ts install --account <account>`. It refuses unless it runs as root, the account exists and is the alerts' own (not uid 0, and its home holds no Limen registry, as an agents' account does), the topic file is root's with mode 0600, and a registry names a project; it needs `setfacl` (the package `acl`). It grants the account traverse rights (`--x`) by ACL on each folder above every registry and every registered project's `.limen/jobs`, read and traverse (`r-x`) on `.limen/jobs` and read on each registry; then it writes `limen-alerts.service` and `limen-alerts.timer` into `/etc/systemd/system/` where they differ, verifies them with `systemd-analyze verify` (a failure puts the earlier units back), reloads systemd every time (so a reload that failed before is done now) and enables the timer. Run again, it changes nothing that is in place.
5. The first run records the failures that are there already and sends nothing. `limen status` in a project prints no `Alerts not working` block, and a job that fails sends one line.

`limen init` in a new project rewrites the registry, which drops its ACL, and the new project has no rights yet: run the install again after it. `node /opt/limen/seat/deploy.ts <sha>` writes the units of the new release again for the account in their `User=`. To stop the alerts: `systemctl disable --now limen-alerts.timer`.

Moshi rings the phone when an agent needs you, through Herdr's agent hooks: pair `moshi-hook` on the box (`--store file` on Linux), `service install`, `loginctl enable-linger`.

## Pi extensions

`coordinator-handoff.ts`, `quota-resume.ts` and `statusline.ts` are the Pi extensions that this seat loads from `~/.pi/agent/extensions/` for every session, byte for byte as they run there. Limen does not install them. They change how a coordinator works, so a change of them belongs in a commit here.

- `coordinator-handoff.ts`: when a coordinator's context passes 30 % of the window, it asks for a handoff note and, after `.limen/coordinator-handoff.request`, opens a new session in the same pane with that note as its first message.
- `quota-resume.ts`: when a run of a session with `LIMEN_COORDINATOR=1` ends on a Claude quota limit, it sends the session one message a few minutes after the reset.
- `statusline.ts`: the model, the time, the cost, the context and the 5 h and 7 d limits of Claude in the status line, in Polish.

`herdr-agent-state.ts` lies beside them on the seat, but `herdr integration install pi` writes and updates it, so it is not kept here.

To use the copies of a checkout, link them: `ln -sf "$PWD"/docs/seat/{coordinator-handoff,quota-resume,statusline}.ts ~/.pi/agent/extensions/`. A copy that differs from the seat shows with `for f in coordinator-handoff quota-resume statusline; do diff docs/seat/$f.ts ~/.pi/agent/extensions/$f.ts; done`.

## Prune

Drop-in: `User`, `WorkingDirectory` = the project, `PATH` that includes `limen`. `systemctl enable --now limen-prune.timer`.

## From the Mac (window)

```bash
herdr --remote you@seat-name
# optional: --session <name> if the seat is not using the default session
```

The coordinator runs **on the seat**, on the board's engine. Do not `limen spawn` from a laptop clone of the same repo.

Preview: on the seat, bind the app to `127.0.0.1`, then `tailscale serve 3000`. Open the printed HTTPS URL. Do not `tailscale funnel` unless you mean the public internet.

## Prove, in this order

1. Detached job finishes with the lid closed; `limen show <id>` on the box says `done`. A detached job that fails sends one alert to the phone.
2. `herdr --remote` → `limen status` shows that same id.
3. Preview URL opens on the Mac. No `git pull`.

If 1 fails, do not move the coordinator. If 1–3 work, the laptop is a window from then on.

## Linux process identity

Limen reads process identity from `/proc/<pid>/stat`; `limen stop` uses it. Every job runs in its own systemd user scope, `limen-job-<id>.scope`, outside Herdr's cgroup: a restart of Herdr does not end a job, and the end of a job stops every process of its scope, a detached one included. A restart of the account's user manager ends every job. Job files are truth.

## GitHub doorbell

Use the checked-in [GitHub seat setup](github-setup.sh) and [remote operator trial](../remote.md#github-doorbell-opt-in-per-project). Run the installer and adjacent units only from a root-owned checkout of the pinned release, never from the worker checkout. It installs a root-owned release and `/usr/local/bin/limen` symlink, root-owned Node 24 and Herdr binaries, a private poller key/state, narrow sudo handoff, registry ACLs, and a stopped timer. In a fresh noninteractive SSH shell, `command -v limen` must resolve to that symlink. Do not put the App PEM in a checkout or worker home. Do not run `github poll` until all doctor findings except the stopped timer are repaired, enable the timer, then rerun doctor. A second registered repository uses the same seat App/timer and its own `github connect` in its persistent coordinator.

The historical Alice draft under `tmp/` is not a deployment source. Use a root-owned Node 24 binary source, not a symlink to `~overment/.nvm`; a worker-owned Node or Herdr binary is unsafe even at mode 0755. A poller can execute worker-owned code and expose its key.

## Not built

`LIMEN_SPAWN` and `LIMEN_NOTIFY` do not exist.

Pickup narrative and traps: [docs/remote.md](../remote.md).
