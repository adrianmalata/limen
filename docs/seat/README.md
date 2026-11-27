# Seat bring-up

Operator checklist and the current setup steps. Limen does not run these. Copy the units, set the drop-ins, enable the timers.

The seat owns the project copy (the Git checkout), the worktrees, and the job files in `.limen/jobs/`. The laptop is only a window.

Files next to this file: the Pi extensions `coordinator-handoff.ts` and `statusline.ts`. The alerts' units are written by `seat/alerts.ts`, and the sweep's by `limen seat sweep --install` (both below); the sweep prunes and retires once a day, so no prune unit is left.

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

The alerts send one line to the phone through the public ntfy relay for each failed job of every registered project, `<project folder's base name> failed:<kind> <job id>`, such as `synchronizer failed:quota 2026-11-16-f001-work-a-37c02ed6`, and for each job whose wait in the start queue got its diagnosis ([Start queue](../jobs.md#start-queue)), `<project folder's base name> queue <job id>`, with no title. No path, label or job text leaves the seat; `limen status` over SSH gives the details, and the diagnosis is in the job's record. A job that ends `done` sends nothing. A job the subscription limit stopped sends `failed:quota` at once only when no reset time was read: with a known reset the sweep resumes it (below), and it sends `failed:quota` only once that resume is 15 minutes overdue with no continuation, or `failed:quota-exhausted` when its third resume stops on the limit again. They are the only escalation path to the owner, so they belong to every seat, and `limen status` warns while their timer is not active or their last run failed.

They run every minute as `limen-alerts.service`, a system service on an account of their own: `/usr/bin/node /opt/limen/seat/alerts.ts run` reads the registries and the job records, and keeps the events it reported and the projects it has read in its own state folder (`StateDirectory=limen-alerts`, the files `reported` and `projects`), so it writes no file of the agents' account. The topic reaches it only as the systemd credential `topic` (`LoadCredential=topic:/etc/limen/alerts-topic`). An event is reported only after ntfy took it, so a failed send comes again on the next run; a project or a record it cannot read is named in the journal, the run fails, and the other projects still alert. A run that reads no project at all fails too, naming why: a registry or a registered project it could not read (counted first, since root's own registry is always closed to it, and each root once, however many registries list it), registries that name no project, every registry in a home closed to it, or no registry.

Install, as root, once:

1. On the phone: the ntfy app, subscribed to a long random topic. From the laptop: `curl -d test https://ntfy.sh/$topic`; the phone must buzz.
2. Create the alerts account: `useradd --system --no-create-home --shell /usr/sbin/nologin <account>`; the name stays on the seat.
3. Write the topic into `/etc/limen/alerts-topic`, a file of root's with mode 0600 (`install -d -m 0755 /etc/limen && install -o root -g root -m 0600 /dev/null /etc/limen/alerts-topic`, then an editor).
4. `node /opt/limen/seat/alerts.ts install --account <account>`. It refuses unless it runs as root, the account exists and is the alerts' own (not uid 0, and its home holds no Limen registry, as an agents' account does), the topic file is root's with mode 0600, and a registry names a project; it needs `setfacl` (the package `acl`). It grants the account traverse rights (`--x`) by ACL on each folder above every registry and every registered project's `.limen/jobs`, read and traverse (`r-x`) on `.limen/jobs` and read on each registry; then it writes `limen-alerts.service` and `limen-alerts.timer` into `/etc/systemd/system/` where they differ, verifies them with `systemd-analyze verify` (a failure puts the earlier units back), reloads systemd every time (so a reload that failed before is done now) and enables the timer. Run again, it changes nothing that is in place.
5. The first run records the events that are there already and sends nothing. `limen status` in a project prints no `Alerts not working` block, and a job that fails sends one line.

A project the alerts read for the first time, on their first run or later, has its events recorded as reported the same way, and none is sent; then it alerts as the others do. `limen init` in a new project rewrites the registry, which drops its ACL, and the new project has no rights yet: run the install again after it, and the next run reads the new project first, so its old events send nothing. `node /opt/limen/seat/deploy.ts <sha>` writes the units of the new release again for the account in their `User=`. To stop the alerts: `systemctl disable --now limen-alerts.timer`.

Moshi rings the phone when an agent needs you, through Herdr's agent hooks: pair `moshi-hook` on the box (`--store file` on Linux), `service install`, `loginctl enable-linger`.

## Sweep

`limen seat sweep` is the seat's one reaper: every minute its user timer ends each running job whose wrapper is dead, in every registered project, ends the scope a finished job left with processes in it, resumes each job the subscription limit stopped 5 minutes after the reset (at most 3 times) and releases the coordinator wakes the limit held, removes the refusal files of coordinator processes that are gone and dead start-queue entries, and rings Herdr for an end nobody heard of; once a day per project it prunes the worktrees of finished jobs, retires landed and abandoned jobs to the job archive and closes the leftover Herdr tabs of closed features, deleting nothing that Git does not hold elsewhere ([Seat sweep](../commands.md#seat-sweep), [Subscription limit](../jobs.md#subscription-limit)). `limen status` and `limen show` only show a dead job (`wrapper dead; limen-sweep will finalize`), so without the timer no dead job is finalized, and `limen status` warns under `Sweep not working` while the timer is not active or the service's last run failed. A job whose processes it cannot end three runs in a row is listed under `Jobs the sweep cannot end` and sends the alert `<project folder's base name> stuck <job id>`.

It runs as `limen-sweep.service`, a user service of the agents' account (no root), with `/usr/bin/node /opt/limen/bin/limen seat sweep` and the PATH of the shell that installed it, stopped after 300 s; a job it resumes finds `pi`, `node` and `herdr` on that PATH. Install, on the agents' account, from its login shell, once lingering is on:

1. `limen seat sweep --install`. Without lingering it exits 4 and names the command for root, `loginctl enable-linger <account>`; then run it again. It writes `limen-sweep.service`, with the shell's PATH (`Environment="PATH=…"`), and `limen-sweep.timer` into `~/.config/systemd/user/` where they differ, verifies them with `systemd-analyze --user verify` (a failure puts the earlier units back), reloads the user manager and enables the timer. Run again from the same PATH, it changes nothing that is in place; from another PATH it rewrites the service, so run it again after `pi`, `node` or `herdr` moves. Without a PATH it exits 4 with `NO_PATH`.
2. `limen seat sweep --status` prints `limen-sweep.timer is active`, and after the first minute `journalctl --user -u limen-sweep.service` ends with a final line of class `ok`.

`node /opt/limen/seat/deploy.ts <sha>` verifies the units of the new release with `systemd-analyze verify` in a temporary folder and writes no home, so a release that changes them needs the install again. To stop the sweep: `limen seat sweep --uninstall`.

## Pi extensions

`coordinator-handoff.ts` and `statusline.ts` are the Pi extensions that this seat loads from `~/.pi/agent/extensions/` for every session, byte for byte as they run there. Limen does not install them. They change how a coordinator works, so a change of them belongs in a commit here.

- `coordinator-handoff.ts`: when a coordinator's context passes 30 % of the window, it asks for a handoff note and, after `.limen/coordinator-handoff.request`, opens a new session in the same pane with that note as its first message.
- `statusline.ts`: the model, the time, the cost, the context and the 5 h and 7 d limits of Claude in the status line, in Polish.

`herdr-agent-state.ts` lies beside them on the seat, but `herdr integration install pi` writes and updates it, so it is not kept here.

To use the copies of a checkout, link them: `ln -sf "$PWD"/docs/seat/{coordinator-handoff,statusline}.ts ~/.pi/agent/extensions/`. A copy that differs from the seat shows with `for f in coordinator-handoff statusline; do diff docs/seat/$f.ts ~/.pi/agent/extensions/$f.ts; done`.

The extension `quota-resume.ts`, which typed a message into the coordinator after a limit, is cut: `limen seat sweep` resumes the jobs itself. A seat that still links it removes the link: `rm ~/.pi/agent/extensions/quota-resume.ts`.

## Prune

The old `limen-prune.{service,timer}` units are cut: `limen prune` exits 2 and names `limen seat sweep`, whose timer prunes and retires once a day. A seat that still has them disables them as root: `systemctl disable --now limen-prune.timer`, then removes both units from `/etc/systemd/system/` with the drop-in folder `limen-prune.service.d/`.

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

Limen reads process identity from `/proc/<pid>/stat`; `limen stop` uses it. Every job runs in its own systemd user scope, `limen-job-<id>.scope`, outside Herdr's cgroup: a restart of Herdr does not end a job, and the end of a job stops every process of its scope, a detached one included. A restart of the account's user manager ends every running job `failed`, kind `signal`, since its TERM comes with no stop request, and the alerts send one line for each. Job files are truth.

## GitHub doorbell

Use the checked-in [GitHub seat setup](github-setup.sh) and [remote operator trial](../remote.md#github-doorbell-opt-in-per-project). Run the installer and adjacent units only from a root-owned checkout of the pinned release, never from the worker checkout. It installs a root-owned release and `/usr/local/bin/limen` symlink, root-owned Node 24 and Herdr binaries, a private poller key/state, narrow sudo handoff, registry ACLs, and a stopped timer. In a fresh noninteractive SSH shell, `command -v limen` must resolve to that symlink. Do not put the App PEM in a checkout or worker home. Do not run `github poll` until all doctor findings except the stopped timer are repaired, enable the timer, then rerun doctor. Each registered repository switches the `github` module on in its `.agents/limen/limits.json` (`"modules": {"github": true}`) before its `github connect`; the poller skips a registered repository whose switch is off. A second registered repository uses the same seat App/timer and its own `github connect` in its persistent coordinator.

The historical Alice draft under `tmp/` is not a deployment source. Use a root-owned Node 24 binary source, not a symlink to `~overment/.nvm`; a worker-owned Node or Herdr binary is unsafe even at mode 0755. A poller can execute worker-owned code and expose its key.

## Not built

`LIMEN_SPAWN` and `LIMEN_NOTIFY` do not exist.

Pickup narrative and traps: [docs/remote.md](../remote.md).
