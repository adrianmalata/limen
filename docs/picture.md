# Picture

[README](../README.md) · [Command reference](commands.md)

Picture keeps a project's code structure, and the places its specified features and journeys name, as data: a Markdown dataset, the model that `limen picture build` reads from it, and the job activity that `limen picture serve` serves. It draws no page.

## The dataset

The architecture map is a Markdown dataset that Git ignores (default `.limen/picture/`).

- **Not in Git:** The dataset is not in Git. Nobody commits or lands it. A new clone has no map.
- **Rules:** [templates/picture/CONTRACT.md](../templates/picture/CONTRACT.md) has the dataset rules.
- **Not the live work list:** Map features show where specified features cross the code, not their state. The board (`spec/build.md`) owns feature state.

## Check the map and the tickets

`limen picture build` reads the dataset with the project's tickets and board, and checks them. **Build never calls a model, and it writes no page.** Each diagnostic is one line on stderr; then one line on stdout counts the places and edges. `--json F` writes the model to `F`; without it, build writes nothing, and a build that `--strict` refuses (`PICTURE_INVALID`) writes no file, `F` included.

- **Source check:** Build warns (`source.missing`) for each cited source path that does not exist in the project root.
- **Strict:** `--strict` exits 1 when a diagnostic is an error.

Make a ticket with `limen ticket new "what becomes true" [--lane planned|active] [--touches id,id]`. It takes an F number that no lane (month folders and `cancelled/` included), no row of `spec/features/archive.tsv`, no local `limen/*` branch and no job label uses ([ticket numbers](commands.md#tickets-and-the-board)). It writes the ticket under `spec/features/<lane>/` and prints its path. The default lane is planned. Only pass `--touches` for module or plant ids you verified in the map's `nodes/` files; omit it when no place is known.

The scaffold writes `opened` and a valid front matter block. For later dated decisions, use `needs-adam` with `needs-adam-on` or `wrong` with `wrong-on`; remove each pair when resolved. Add `landed` to done tickets with a known date. The [ticket contract](../templates/picture/CONTRACT.md#ticket-front-matter) has an example. A missing front matter block on an active ticket, a bad date, an incomplete pair, or an unknown place id is an error. A missing `touches` list on an active ticket or a duplicate F number warns. Every `ticket.*` message names the path, line and `fix:` action.

In a job worktree, the map is not in the branch. It stays in the project root. Check the worktree's tickets against that map:

```sh
limen picture build --dir "$LIMEN_CONTEXT_ROOT/.limen/picture" --strict
```

The strict check exits 1 for ticket errors. It warns, but does not guess a link, when an active ticket has no known `touches`.

`--dir` names the map folder, or a folder that holds one in `.limen/picture`, such as a project root. A folder with neither stops build with an error that names both paths. The tickets and board come from the repository that holds the map. A checkout of that repository, a job worktree too, keeps its own, so the check above reads the branch's tickets.

## Job activity

`limen picture serve` serves the job activity of the project it runs in, on `http://127.0.0.1:4747/` (`--port` picks another port). Once a second it reads the job folders in `.limen/jobs/` of the repository's primary checkout, so it serves the same jobs from a job worktree. It never reads the map and never changes a job. It listens only on 127.0.0.1 and answers 403 to a request with another `Host`. Ctrl-C stops it.

| Path | Answer |
|---|---|
| `GET /activity.json` | The current snapshot as JSON: the time, the jobs, and the group runs that have a member among them. |
| `GET /events` | Server-Sent Events: first an `activity` event with the snapshot, then one more each time a job or a group changes, and a `ping` event every 15 seconds. |
| any other path | 404 |

Each job in the snapshot names its id, label, engine and model, role, state, and what it does now: thinking, editing files, reading code, running tests and checks, running a command, running helpers, or waiting.

- **Model:** the model comes from the `model_change` entry of the job's session file.
- **Feature link:** a job belongs to each F number in its label or job id; a group member also belongs to its group's feature.
- **Never a false running:** a job whose record says running but whose owner process is gone reads `dead`. A job with no event for five minutes (fifteen while it runs tests or checks) reads `quiet`, with its last action.
- **Finished jobs:** done, failed, and stopped jobs stay for one hour after they end.
