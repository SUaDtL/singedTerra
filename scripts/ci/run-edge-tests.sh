#!/usr/bin/env bash

set -u

readonly max_attempts=3
readonly retry_delay_seconds="${EDGE_TEST_RETRY_DELAY_SECONDS:-5}"

for attempt in 1 2 3; do
  if deno test --allow-env supabase/functions/; then
    exit 0
  fi

  if [ "$attempt" -eq "$max_attempts" ]; then
    exit 1
  fi

  sleep "$((attempt * retry_delay_seconds))"
done

exit 1
