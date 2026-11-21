# Seat bring-up

Operator checklist and the current setup steps. Limen does not run these. Copy the units, set the drop-ins, enable the timers.

The seat owns the project copy (the Git checkout), the worktrees, and the job files in `.limen/jobs/`. The laptop is only a window.

Units next to this file: `bell.sh`, `limen-bell.{service,timer}`, `limen-prune.{service,timer}`, and the Pi extensions `coordinator-handoff.ts`, `quota-resume.ts` and `statusline.ts`.

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
6. Start a persistent Herdr session (or `herdr server` under systemd) so attach works with the lid closed.
7. `herdr integration install pi`: Herdr's Pi integration serves the coordinator pane. First smoke job: `limen spawn --detached`.

## Bell

Prefer **Moshi** if the phone already gets Herdr pings: pair `moshi-hook` on the box (`--store file` on Linux), `service install`, `loginctl enable-linger`.

ntfy is the fallback when Moshi is not in play:

1. On the phone: ntfy app, subscribe to a long random topic. From the Mac: `curl -d test https://ntfy.sh/$topic` — phone must buzz **before** you move the coordinator.
2. Use `bell.sh` in the Limen checkout on the box, not a copy: it runs `bell.ts` beside it with `node`, which reads the job records through Limen's record module, so `node` must be on the service's `PATH`.
3. Drop-in for `limen-bell.service`: `User`, `LIMEN_ROOT` (the project that contains `.limen`), `NTFY_TOPIC`, `ExecStart` → that script.
4. `systemctl enable --now limen-bell.timer`
5. `limen spawn --detached --engine pi --provider <provider> --model <model> --thinking <level> "echo seat-smoke && exit"` from the project. Close the SSH session. Phone should ring. `cat .limen/jobs/<id>/notify/bell` exists. Re-run the script: no second ping.

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

1. Detached job finishes with the lid closed; phone rings; `limen show <id>` on the box says `done`.
2. `herdr --remote` → `limen status` shows that same id.
3. Preview URL opens on the Mac. No `git pull`.

If 1 fails, do not move the coordinator. If 1–3 work, the laptop is a window from then on.

## Linux process identity

Limen reads process identity from `/proc/<pid>/stat`; `limen stop` and process containment use it. Job files are truth.

## GitHub doorbell

Use the checked-in [GitHub seat setup](github-setup.sh) and [remote operator trial](../remote.md#github-doorbell-opt-in-per-project). Run the installer and adjacent units only from a root-owned checkout of the pinned release, never from the worker checkout. It installs a root-owned release and `/usr/local/bin/limen` symlink, root-owned Node 24 and Herdr binaries, a private poller key/state, narrow sudo handoff, registry ACLs, and a stopped timer. In a fresh noninteractive SSH shell, `command -v limen` must resolve to that symlink. Do not put the App PEM in a checkout or worker home. Do not run `github poll` until all doctor findings except the stopped timer are repaired, enable the timer, then rerun doctor. A second registered repository uses the same seat App/timer and its own `github connect` in its persistent coordinator.

The historical Alice draft under `tmp/` is not a deployment source. Use a root-owned Node 24 binary source, not a symlink to `~overment/.nvm`; a worker-owned Node or Herdr binary is unsafe even at mode 0755. A poller can execute worker-owned code and expose its key.

## Not built

`LIMEN_SPAWN` and `LIMEN_NOTIFY` do not exist.

Pickup narrative and traps: [docs/remote.md](../remote.md).
