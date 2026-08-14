#!/usr/bin/env bash
# Supervisor for a long import.
#
# import-from-scrape.js is idempotent — a book whose ISBN or slug already exists
# is skipped — so re-running it resumes rather than duplicating. What it is not
# is crash-proof: a single `read ECONNRESET` from Cloudinary or a provider takes
# the whole process down, and a 1,400-book run is long enough that this happens.
# One crash after 452 books is what prompted this.
#
# So: restart it until the file is exhausted, stopping if a pass creates nothing
# (which means the failure is not transient and looping would just repeat it).
#
#   bash scripts/run-import.sh <jsonl> [extra args...]
set -u

JSONL=${1:?usage: run-import.sh <jsonl> [args...]}
shift || true
LOG=${LOG:-/d/daraz-scraper/import-supervised.log}
MAX_PASSES=12

count_created() { grep -oE '"created"' "$LOG" 2>/dev/null | wc -l | tr -d ' '; }

for pass in $(seq 1 "$MAX_PASSES"); do
  before=$(count_created)
  echo "$(date +%H:%M:%S) import supervisor: pass $pass (created so far: $before)"
  npm run import-from-scrape -- "$JSONL" "$@" >> "$LOG" 2>&1
  status=$?
  after=$(count_created)
  echo "$(date +%H:%M:%S) import supervisor: pass $pass exit=$status, added $((after - before))"

  if grep -q "Import complete" "$LOG" && [ "$status" -eq 0 ]; then
    echo "$(date +%H:%M:%S) import supervisor: finished cleanly"
    break
  fi
  if [ "$after" -le "$before" ]; then
    echo "$(date +%H:%M:%S) import supervisor: a pass created nothing — stopping rather than looping on a real error"
    break
  fi
  sleep 5
done
