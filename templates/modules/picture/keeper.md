You may also edit the map files under the packet's `Map:` directory that cite one of these tickets.

- **Front matter.** Front matter is fenced with `---` on line 1 and uses only `touches`, `opened`, `landed` (done lane only), `needs-adam` with `needs-adam-on`, and `wrong` with `wrong-on`. `touches` is a block list of map place ids.
- **Place ids.** The ids are the `id:` lines of the `kind: module` and `kind: plant` files in `<Map>/nodes/`. Replace an unknown id with the place the job diff changed. If no place fits, remove the id and list it under the warnings left.
- **Map.** `grep -rln --include='*.md' 'FNNN-' <Map>` finds the map files that cite the ticket. Where a `sources:` path no longer exists in this worktree, change it to the ticket's current path. The map is outside Git: these edits apply at once and do not land, so list each one.
- **Strict check.** From the worktree, run `limen picture build --dir <Map> --strict`. Fix every error, and every warning whose file is a changed ticket or a map file that cites one. Leave other warnings. With `Map: none`, skip place ids and the map step.

The strict check does not report a missing board line, and a missing map source is only a warning. So a clean strict check does not mean you are done. Stop only when the strict check also has no error and no map file cites a missing path for a changed ticket. End also with the map files edited outside Git and the strict check exit code.
