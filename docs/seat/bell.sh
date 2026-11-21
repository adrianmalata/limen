#!/bin/sh
# Ring ntfy once for each terminal job record of one project; bell.ts beside this file does the work through Limen's
# record module. This path stays, so a drop-in that starts it needs no change. Operator-owned: not called by limen.
#
#   LIMEN_ROOT=/home/you/project NTFY_TOPIC=your-secret-topic ./bell.sh
#
set -eu

exec node "$(dirname "$0")/bell.ts" "${LIMEN_ROOT:?set LIMEN_ROOT to the repo (the directory that contains .limen)}"
