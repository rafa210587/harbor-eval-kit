#!/usr/bin/env bash
# Stops the Harbor Eval Kit GUI server started by start-gui.sh, by finding whichever process
# is listening on its port and asking it to exit -- does not touch podman/harbor/containers.
# Safe to re-run: reports "not running" instead of failing if nothing is listening.
set -euo pipefail

PORT="${1:-4173}"
have(){ command -v "$1" >/dev/null 2>&1; }

find_pid() {
  local pid=""
  if have lsof; then
    pid="$(lsof -ti tcp:"$PORT" -sTCP:LISTEN 2>/dev/null || true)"
  elif have fuser; then
    pid="$(fuser -n tcp "$PORT" 2>/dev/null | tr -d ' ' || true)"
  elif have netstat; then
    # Git Bash / MSYS on Windows has neither lsof nor fuser -- fall back to netstat, which is
    # present both there (Windows' own netstat.exe, PID as the bare last column with `-ano`)
    # and on Linux (`-tlnp`, PID as "PID/name" in the last column -- strip after the "/").
    local line last
    line="$(netstat -ano 2>/dev/null | grep -E "[:.]$PORT[[:space:]]" | grep -i LISTEN | head -n1)"
    if [ -n "$line" ]; then
      last="$(echo "$line" | awk '{print $NF}')"
      pid="${last%%/*}"
    fi
  fi
  echo "$pid"
}

pid="$(find_pid)"
if [ -z "$pid" ]; then
  echo "Harbor Eval Kit GUI does not appear to be running on port $PORT."
  exit 0
fi

echo "Stopping Harbor Eval Kit GUI (pid $pid, port $PORT)..."
if have taskkill; then
  # Git Bash/MSYS's own `kill`/`kill -0` operate on MSYS's process table, which does not
  # reliably see or signal a plain Windows PID discovered via netstat (confirmed: `kill <pid>`
  # returned success while the process kept listening) -- taskkill is the real mechanism here.
  taskkill //PID "$pid" //F >/dev/null 2>&1 || true
else
  kill "$pid" 2>/dev/null || true
  sleep 1
  if kill -0 "$pid" 2>/dev/null; then
    kill -9 "$pid" 2>/dev/null || true
  fi
fi

sleep 1
if [ -n "$(find_pid)" ]; then
  echo "Process $pid did not exit; inspect manually (still bound to port $PORT)." >&2
  exit 1
fi
echo "Stopped."
