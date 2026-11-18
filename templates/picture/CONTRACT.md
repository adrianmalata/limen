# Picture contract

The picture is a map a cold reader takes in at one sitting: the places a project is made of, how they connect, and later which features and journeys cross them. This file is the contract between whoever writes the dataset and `limen picture build`, which reads and checks it.

The dataset is a local, gitignored artifact. It is never committed or merged. The map is not a live feature list: the board owns state. The map itself does not gate land; ticket errors on changed tickets can refuse a land.

Schema: `architecture-map/1`. It is the schema of the first dataset (Alice, 2026-10-02) plus the fields marked **new**.

## Dataset directory

One dataset is one directory. Default: `<project root>/.limen/picture/`, which `/.limen/` already ignores. A plant may choose another gitignored directory with `--dir`.

| Path | Role |
| --- | --- |
| `nodes/*.md` | Places: the plant root and its modules. Flat files only. |
| `edges/*.md` | Directed connections between places. Flat files only. |
| `features/*.md` | Overlay: product features. Read from the overlay slice on. |
| `journeys/*.md` | Overlay: ordered user journeys. Read from the overlay slice on. |
| `README.md` | Optional survey for humans and the writer of the dataset. Not a graph file. |
| `map.json` | Optional model dump (`limen picture build --json`). Disposable. |

The generator reads only `*.md` directly inside the graph directories. It ignores subdirectories and every other file. The file name is the id plus `.md`; dots stay in the name (`nodes/alice.runtime.md`). A missing file is a gap. Nothing invents it.

## Front matter

Each graph file starts with YAML between two `---` lines; the first line of the file is `---`. Scalars, `null`, and block lists (`- item`) only. No block scalars (`|`, `>`).

Common required fields: `schema` (`architecture-map/1`), `kind`, `id`, `project`, `title`, `status`. Optional: `sources`, a list of paths relative to the project root. Cite every project file that the body names: `limen picture build` checks each cited path (`source.missing`), so a place whose code moved shows. Unknown keys are kept as metadata.

| Kind | Directory | Required beyond common | Notes |
| --- | --- | --- | --- |
| `plant` | `nodes/` | `parent: null` | Exactly one per project. Optional **new** `revision`. |
| `module` | `nodes/` | `parent` | A code or host boundary. Parent is a place id in the same project. |
| `edge` | `edges/` | `from`, `to`, `relation` | Directed. Never a `contains` edge: `parent` stores containment. |
| `feature` | `features/` | **new** `touches` | Overlay. Not a place and not a block. No `parent`; one is kept as metadata only. |
| `journey` | `journeys/` | **new** `steps` | Overlay. Not a place and not a block. No `parent`; one is kept as metadata only. |

**`revision`** (plant, new): the full 40-hex commit the dataset describes. Write it last, after the dataset is consistent at that commit.

**`touches`** (feature, new): a block list of at least one module id. It is the only way a feature names places. A missing list, a non-list, or an item that is not a valid id is an error (`feature.bad-field`); an id that names no module is a warning and is dropped (`feature.unknown-touch`). Never derive `touches` from Git history, branch diffs, or commit messages; it is written from the feature's own sources and the code it names.

**`steps`** (journey, new): an ordered block list of at least two place ids (modules or the plant), read as "the action crosses these places in this order". Order and repeats are kept. Malformed lists are `journey.bad-field` errors; an id that names no place is dropped with `journey.unknown-step`. The body says what happens at each step. Steps do not create edges.

An edge with a feature or journey at either end is dropped with a warning (`edge.feature`, `edge.journey`). Overlays never become blocks or edges.

`status` is `ready` (matches the cited sources), `partial` (true but incomplete; the body names the gap), or `stub` (id reserved; the body claims no behavior). Do not mark `ready` when a cited source was not read.

A trailing body line `owner: <name>`, alone on its line, is metadata, not prose.

## Ticket front matter

Create tickets with `limen ticket new "what becomes true" [--lane planned|active] [--touches id,id]`. It picks an F number that no lane, archive row, `limen/*` branch or job label uses, and writes a ticket that passes `limen picture build --strict` with no edit. The lane folder is the status. The board reports it.

Example front matter, with a known map place:

```yaml
---
touches:
  - limen.picture.build
opened: 2026-10-06
---
```

Replace the date with the creation date. Omit `touches` when no place is known; never invent an id. An active ticket without touches warns. Optional one-line `needs-adam` with `needs-adam-on`, or `wrong` with `wrong-on`, needs a real `YYYY-MM-DD` date; remove both fields when resolved. A done ticket may have `landed: YYYY-MM-DD` when the landing date is known.

Run `limen picture build --strict` at the plant root, or add `--dir <plant>/.limen/picture` in a job worktree. Each `ticket.*` diagnostic names the ticket path, line and `fix:` action. An active ticket without front matter is `ticket.no-front-matter` (error). Bad fields or pairs are `ticket.bad-field` (error), and an unknown `touches` id is `ticket.unknown-touch` (error). A duplicate F number is `ticket.duplicate-id` (warning); the second folder is left out of the model. `limen land` and `limen ticket check` refuse a branch that adds a ticket with a used number.

## Identifiers and relations

Ids are lowercase ASCII, start with a letter, and use `.` between segments of letters, digits, or `-` (no leading `-`). Unique inside one project. A rename is a new id plus removal of the old file; never keep two ids for one thing.

| Relation | Meaning |
| --- | --- |
| `depends-on` | Build or import dependency. |
| `hosts` | A host process starts or holds the target. |
| `calls` | A request, IPC call, or HTTP call. |
| `implements` | The source fulfills a target seam. |
| `generates` | A generator writes a consumer artifact. |
| `reads` | The source reads data it does not own. |
| `writes` | The source writes data the target owns. |
| `composes` | The source wires the target and does not own it. |

A negative fact stays in prose ("The runtime does not depend on the adapter crate"). A feature gate stays in the edge body. Dependency arrows and runtime-call arrows are different relations; do not merge them.

## Wording

Present tense, active voice, one idea per sentence, under 25 words. No contractions, no marketing words, one name for one thing. Name the owner of each authority and what a place does not own when the source says so. Never describe a wish as a fact: a landed design, a planned edge, or a rejected transport is prose with its status, not a solid edge. Cite `spec/` for intent and code for behavior. The body is the description; do not repeat the title or copy the edge list into a node.

## `limen picture build`

Deterministic and offline. Never calls a model. Reads the dataset, tickets, and board and checks them; writes no HTML, and without `--json` writes nothing. `--json F` writes the model `architecture-map-model/3` to `F`: the map fields `project`, `nodes`, `edges`, `features` (common fields plus `touches`), `journeys` (common fields plus `steps`), and `diagnostics`, plus `work` (ticket and board facts), `pins` (dated items from `landed`, `wrong`, and `needs-adam`), and `days` (dated ticket events). Each diagnostic (dangling edge, unknown parent, bad id, unknown touch or step, and ticket errors) is one line on stderr; one line on stdout then counts the places and edges. `--strict` exits 1 on any error diagnostic. Each `sources` path that does not exist in the project root is a `source.missing` warning; it does not fail `--strict`.
