---
name: harbor-status
description: Fast read-only check of whether Podman, the GUI and Harbor are up, plus any run in progress. Use for a quick status, not a full diagnosis.
---

# Harbor Status

## Category

Operational (simple day-to-day use) — a fast, read-only check. See `harbor-doctor` for the
full battery (build/run/exec/mounts/network/labels smoke tests); this skill never mutates
anything and never runs a container.

## Trigger

Use when the user asks for a quick status, health check, or "tá tudo de pé?" without asking
for a full diagnosis or troubleshooting.

## Procedure

Report each of these as up/down/unknown, cheaply, with no side effects:

1. **Podman machine** (Windows/macOS only): `podman machine list` — is the default machine's
   `LAST UP` "Currently running"? On Linux rootless, check `podman info` succeeds instead
   (no machine concept there).
2. **GUI**: `GET http://127.0.0.1:4173/api/status` — if it responds, surface its own payload
   verbatim (`harbor.version`, `podman.version`, `podman.infoOk`, `podman.dockerHost`,
   `platform`, `stateDir`) instead of re-deriving those facts yourself. If it doesn't respond,
   report the GUI as down (not an error) — that's a normal "not started yet" state.
3. **Harbor CLI**: `harbor --version` (already covered by the GUI's own `/api/status` if the
   GUI is up — only shell out to it directly if the GUI is down).
4. **Runs in progress**: `GET /api/logs/jobs?jobsDir=jobs` lists the job directories with a
   `running` flag read from each job's own `result.json` (`finished_at: null`). Use it to
   answer "is an eval running right now?" without starting anything. `GET /api/logs/files` and
   `GET /api/logs/tail` (byte-offset incremental) read the logs themselves if the user asks
   what a running job is doing — the GUI's own **Logs** tab uses these same three routes.
5. Do **not** run `harbor run`/`harbor init --task`/any smoke test, and do not start or stop
   anything — this is read-only. If something is down, hand off to `harbor-up` to bring it up
   or `harbor-doctor` to actually diagnose why, rather than fixing it inline here.

## Output

One line per check: `Podman machine: running`, `GUI: up @ http://127.0.0.1:4173`, `Harbor:
0.22.0`, etc. Only expand into detail (versions, dockerHost, stateDir) if the user asks or if
something is down and the "why" is immediately obvious from the same data already fetched.
