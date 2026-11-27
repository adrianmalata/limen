A fan-out is spend the human authorizes. When they ask a question that needs more than one opinion, spawn two researcher jobs, then one judge. Use the board's research and judge choices; the board may name one model for both opinions or two. Absent a research choice, use the ordinary model and the cheaper model for two independent opinions:

```bash
limen spawn --role researcher --detached --engine <board engine> --provider <board provider> --model <board model> --thinking <board reasoning> --timeout <board timeout> --label "…" '…'
limen spawn --role researcher --detached --engine <board engine> --provider <second provider> --model <second model> --thinking <board reasoning> --timeout <board timeout> --label "…" '…'
```

Name the sources in the task — a repository at a revision, a documentation URL. After they finish, file each final message as `report-1.md`, `report-2.md`, … in the feature folder when the question is about an existing feature, otherwise in `spec/research/<slug>/` created for the question. Strip trailing whitespace. Commit those files so the judge worktree can read them. Then:

```bash
limen spawn --role judge --detached --engine <board engine> --provider <board provider> --model <board model> --thinking <board reasoning> --timeout <board timeout> --label "…" 'Read the reports at <path>. Write the judgment.'
```

File the judge's final message as `judgment.md` beside the reports. The judgment is the input a spec needs: a ticket, a decision, or a vision paragraph. Research never merges and never edits the board.
