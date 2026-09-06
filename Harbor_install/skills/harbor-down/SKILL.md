---
name: harbor-down
description: Stop the GUI (and optionally the Podman machine) without deleting anything. Use to stop or shut down Harbor Eval Kit.
---

# Harbor Down

## Category

Operational (simple day-to-day use) — not uninstall. See `harbor-cleanup` for actually
removing managed containers/images/volumes/dependencies; this skill only stops running
processes so they stop consuming a port/CPU, it deletes nothing.

## Trigger

Use when the user asks to stop, shut down, "derrubar", or pause the Harbor Eval Kit GUI
and/or the Podman machine — with no mention of uninstalling or deleting resources.

## Procedure

1. Stop the GUI server:
   - macOS/Linux: `bash scripts/stop-gui.sh` (default port 4173; pass a port as `$1` if the
     GUI was started with `--port` overridden).
   - Windows: `pwsh scripts/stop-gui.ps1` (same `-Port` override if needed).
   - This finds the process bound to the GUI's port and asks it to exit (SIGTERM /
     `Stop-Process` without `-Force`) — it does not touch any other process, and does not
     search by process name (avoids accidentally killing an unrelated `node`).
2. Stop the Podman machine **only if the user explicitly asked for that too** — it's a shared
   resource other tools/terminals may also be using:
   - Ask first if it wasn't explicit in the request.
   - If confirmed: `podman machine stop` (Windows/macOS only; rootless Linux has no machine to
     stop).
3. Never run any `podman rm`/`rmi`/`volume rm`/`network rm`/`system prune` here, even if asked
   in the same breath — redirect that to `harbor-cleanup`, which has the manifest-based
   ownership checks this skill deliberately doesn't do.
4. Report what was actually stopped (GUI pid, whether the Podman machine was also stopped or
   left running) so the user knows the exact resulting state.

## Non-goals

- Does not delete containers, images, volumes, networks, or the installation manifest.
- Does not uninstall Harbor, Podman, or any host dependency.
- Does not stop the Podman machine unless explicitly requested — it may be shared with other
  work outside this kit.
