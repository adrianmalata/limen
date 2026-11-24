# Reading Herdr and Limen status

A pane can be ready for your next message while its Limen jobs are still
`RUNNING`. Herdr describes the conversation; `limen status` and `limen show <id>`,
which read the job's record, describe the job. Neither tells you that a candidate landed.

`limen status` is the plant inbox for the owner. `Running` lists every
RUNNING job record (including workers in another Herdr workspace) with its tab,
minutes since start, activity, and last tool. `Candidates to inspect` lists
`done` jobs whose branch still has commits outside the checked-out branch; a
clean exit is not approval, so inspect each one before you land it. `Needs a
decision` lists `failed` or `stopped` jobs in the same position. A commit counts
as landed when it is an ancestor of the checked-out branch or a patch-equivalent
copy of one there (cherry-pick, or through an integration branch).
`limen prune --retire` moves each finished, failed, or stopped job that its record
marks `landed` or `abandoned` to the job archive, never judged from the branch, and skips a job whose worktree or
branch still holds unlanded work (it prints a `kept` line for its worktree). Jobs with no unlanded commits appear
under no heading. Both lists cover the last seven days; `Older: N records` counts the
rest, and `limen status --all` lists them under the same headings.
Open groups appear once with their member-branch count and `limen group status <id>`;
the lead decides what lands. Closed groups leave the inbox.
The status command also lists agent tabs whose working directory is the plant or one of its
repositories. If global Herdr agent discovery fails, `status` checks recent
recorded origin tabs directly and labels them incomplete: a visible tab is not
proof of its coordinator role, and other tabs may be missing. If neither query
works, coordinator status is unknown. A missing repository leaves landing
status unconfirmed. A `done` Herdr tab does not prove a merge. `status` does
not judge review acceptance or choose the next lane.

## Role spaces belong to a project root

Job log views and diff views share role spaces labeled
`repo workers · /canonical/path/to/repo` (or the corresponding role). The full
canonical root distinguishes projects with the same directory name; symlink
aliases reuse the same space. An adjacent repository can supply the tab's cwd
without changing the requested role-space root.

An unqualified legacy label such as `repo workers` does not establish project
identity. Limen leaves that space alone and creates a qualified one; it does not
rename, move, or close human spaces. Existing job records still focus their
recorded tabs. If several spaces have the same qualified label, Limen logs an
`ambiguous Herdr role space` advisory instead of selecting one.

## Pane readiness is not job completion

| Herdr state | What it means |
| --- | --- |
| `working` | Herdr sees the agent working. This is not a count of Limen jobs. |
| `idle` | The agent is ready for input and its tab has been seen in the focused UI. |
| `done` | The same underlying idle state after unseen background work finishes. Seeing the tab changes it to `idle`, not the job state. |
| `blocked` | Herdr recognized an approval or question UI. Inspect that evidence. |
| `unknown` | Herdr cannot confidently classify the agent. It does not prove completion. |

Limen adds labels to native `idle` and `done`, without changing Herdr's lifecycle.
For example, `2 RUNNING · 1 watched · 1 unwatched` means there are two unfinished
job records visible here even though the coordinator can take input. The job
names and activity follow, with useful words before the feature number:
`team-2 coordinator · F773 tool`, or `session repair · F012 done`.
Legacy feature-first group labels use the same word order in the display.
Details stop after three jobs in each group, but counts include all RUNNING jobs.
The footer shows the same job line. A warning such as `1 of 14 needs attention`
counts only dead jobs, not every running job.

The footer, `limen status`, and the reaper use the wrapper's PID, start time and
boot id to judge its owner. When the owner is gone, the footer and `limen status`
show it and change nothing; the reaper of `limen seat sweep`, which its timer runs
every minute, ends the job's scope before it records the job as failed.

A finished job stays on the job line until it lands or closes. It lands when
its recorded commits are in the checked-out branch, by the same test as
`limen status`. It closes when its feature folder moves to `done/` or
`dropped/`, or when `limen prune --retire` moves its record to the job archive. A job without
commits cannot land, so it stays until it closes. Limen checks lands and closes
after each coordinator turn and every 30 seconds. When no running or finished
job remains, the overlay clears. That is not a merge verdict.

**Watched** means this session is subscribed to the job's wakes. **Unwatched**
means the job is visible but this session is not subscribed; another session may
be watching it. Visibility neither claims ownership nor adds a subscription.
The tab's suffix counts only jobs spawned from that tab, so it need not match the
pane's project-wide count or this session's watched count. `· 2 running` counts
live jobs. `· 1 finished` counts finished jobs that have not landed or closed and
that finished after the owner's last message. A Limen wake message does not
reset it.

A job tab's label ends in `· running` while the job runs. The tab follows the
job's log; the job runs detached, so nobody types into it.

When a job finishes, Limen closes its tab. The job log records the result:
`herdr tab close <tab>: closed`, `already closed`, or the refusal. Limen retries a
refused close once. If the retry also fails, the log says
`failed after one retry`, and the tab label changes to the final state, for
example `· done`. `limen open <job>` opens a log view again.

## Activity is evidence, not a human blocker

`think` is the last recorded thinking activity, not proof that tokens are arriving
now. `think · unwatched` can persist through a long silent turn: the job
remains RUNNING and this session is not watching it. `tool` names tool activity;
`wait` records a turn boundary or waiting activity. Neither silence nor `wait`
says the owner needs to answer a question.

`dead` means the job's wrapper is gone (its PID, start time or boot no longer
match) while the job record still says RUNNING; the job's scope may still hold
its engine until the seat sweep ends it, within a minute on its timer. Keep that
warning separate from waiting; inspect the job and its wrapper rather than
treating it as successful completion. Likewise, preserve a real Herdr `blocked`
prompt instead of replacing it with a generic idle label.

## Candidate awaiting the owner is not landed work

A job marked `DONE` ended; it may have produced a candidate, partial work, or
nothing. Read its handoff, commits, diff, and exact check results. A candidate
awaiting the owner's review is still awaiting review, even if its tests passed. If a
human decision is needed, name the question; do not infer one from `wait`.

“Merge-ready” is a judgment supported by review and evidence, not a pane state
or an automatic consequence of `DONE`. “Landed” requires the accepted change in
the target branch, with its landing commit named. Limen does not derive either
judgment from activity or introduce a merge-readiness state machine.

## A wake is separate evidence

A completion toast or queued message is not a confirmed coordinator response.
The local wake hook records delivery only after its injected message enters a
turn, gets an assistant answer without error/abort, and Pi settles. The records
under a job's `notify/claims/` and `notify/delivered/` distinguish pending from
confirmed delivery. Confirmation is not the owner's review or proof that a separate
recipient observed a notification.
