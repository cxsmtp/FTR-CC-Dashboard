#!/usr/bin/env bash
# Benchmark: an organisation of 202 people (8 regions × 24 SEs), 1,000 accounts and 3,000 reports, and USERS of them
# working at once for SECONDS, over HTTPS. The server can be pinned to some CPUs and the load generator to others.
#
#   loadtest/run.sh [USERS=200] [SECONDS=120]
#   SERVER_CPUS=0-1 GEN_CPUS=2-3 THINK_MS=1500 loadtest/run.sh 200 120     (THINK_MS=0: a stress test)
set -euo pipefail
cd "$(dirname "$0")/.."
USERS=${1:-200}
SECS=${2:-120}
DATA=$(mktemp -d)
# One password for every simulated person, made for this run and kept only in this shell (never written down).
export BENCH_PASSWORD=${BENCH_PASSWORD:-$(node -e "process.stdout.write(require('node:crypto').randomBytes(18).toString('base64url'))")}
trap 'kill $SERVER 2>/dev/null; wait 2>/dev/null; rm -rf "$DATA"' EXIT
pin() { if [ -n "${1:-}" ] && command -v taskset >/dev/null; then echo "taskset -c $1"; fi; }
DATA_DIR=$DATA node loadtest/seed.mjs
# The sign-in limit per address is raised: every simulated person signs in from this one machine.
DATA_DIR=$DATA PORT=${PORT:-7443} HTTPS=on SIGNIN_PER_MINUTE=100000 $(pin "${SERVER_CPUS:-}") node server/index.js > "$DATA/server.log" 2>&1 &
SERVER=$!
for _ in $(seq 1 30); do curl -sk "https://127.0.0.1:${PORT:-7443}/healthz" >/dev/null && break; sleep 0.5; done
DATA_DIR=$DATA BASE="https://127.0.0.1:${PORT:-7443}" USERS=$USERS SECONDS=$SECS SERVER_PID=$SERVER $(pin "${GEN_CPUS:-}") node loadtest/load.mjs
echo "data folder after the run: $(du -sh "$DATA" | cut -f1)"
