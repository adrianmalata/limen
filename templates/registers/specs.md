## Specs

A ticket is read once each by two strangers: a worker who will implement it in a cold worktree, and the owner deciding whether it is worth doing. Every line serves one of them or goes. Nothing repeats what the folder lane, the board, Git, or the vision already say.

An ordinary ticket is about three hundred words and fits on one screen; a hard one may reach five hundred. Past that it is two tickets, or a survey job whose deliverable is a notes file.

- **Title.** `FNNN · what becomes true`, the same plain clause the human register uses to name a feature. The folder carries the slug and the lane carries the status, so the title carries neither. No date, no author tag, no emoji, no keyword badges.
- **Outcome.** Two to four sentences: what a user or operator can do or see afterwards that they could not before, and why now if the board does not say. Product terms, no mechanism.
- **Scope.** Three to six one-line bullets: the boundary of this feature and the seam the worker starts at, offered as a lead. Not the edit list. The worker maps dependencies by editing; a scope that enumerates files and functions is stale before the first commit and takes the worker's judgment with it.
- **Out of scope.** Two to four bullets naming only the nearby work someone would plausibly do by mistake.
- **Acceptance.** Three to six bullets, each one observable behavior or check a reviewer can verify with a command or a look. Not scope restated, not "tests pass". A line holding several checks is several lines. A line a reviewer cannot cite whole is two lines.
- **Notes.** Optional. Decisions and open questions only.
- **Front matter.** The picture fields only, before the title: `touches`, `opened`, a dated `needs-adam` ask, a dated `wrong` problem, and `landed`. The picture contract (`templates/picture/CONTRACT.md`) defines them. They feed the owner's picture; they are not a status line.

What never goes in a ticket:

- A status line, date, or author tag in the body. State lives in the lane and the board; a ticket that says ACTIVE lies the moment the folder moves.
- Tag lines or keyword badges. If a vision principle governs this feature, say so in one plain clause inside the outcome.
- Another feature by number alone. *Consumes F373's landed vocabulary* means nothing to a stranger; *builds on the shared transcript renderer that landed earlier (F373)* does. Mention another feature only when it gates or bounds this one, and say what it is.
- Prerequisites, delivery paths, phases, or landed / remaining markers in the body. Progress lives in commits and the board; the end lives in `outcome.md`. A ticket body is never edited to track its own progress; only the picture front matter changes when an ask is answered, a problem is fixed, or the work lands.
- Implementation shape, branch names, diagrams of internals, or an essay on the rationale. A diagram that is itself the decision earns four lines; everything else belongs in the worker's notes file.
- Anything the worker will learn faster by editing than by reading.

The same rules govern the rest of the folder. An outcome file is three to six sentences: what landed in product terms, the merge commit, what the next reader must know, or why the work was dropped. A notes file is a map for the next worker: seams, decisions, open questions, no narrative. A review is the reviewer's verdict verbatim. Board lines are one clause each.
