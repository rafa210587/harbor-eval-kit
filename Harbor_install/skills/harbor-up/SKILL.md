---
name: harbor-up
description: Bring the already-installed services and GUI online after a reboot, idempotently. Use to start, boot or resume Harbor Eval Kit.
---

# Harbor Up

## Category

Operational (simple day-to-day use) — not install/lifecycle. See `harbor-bootstrap` for
actually installing Harbor/Podman from scratch; this skill assumes they're already installed
and just brings the running pieces online after e.g. a reboot.

## Trigger

Use when the user asks to start, boot, bring up, "subir", or resume Harbor Eval Kit services
and/or its GUI — with no mention of installing or diagnosing from scratch.

## Goal

Get from "machine just started, nothing running" to "GUI reachable at
http://127.0.0.1:4173" with the fewest, safest steps — idempotent, no destructive actions,
no smoke tests (that's `harbor-doctor`'s job).

## Procedure

1. Detect OS (`win32`/`darwin`/`linux`).
2. Confirm `harbor`, `podman`, and `node` are on PATH. If any is missing, stop and point at
   `Harbor_install/skills/harbor-bootstrap/SKILL.md` instead of trying to install anything
   here.
3. Check whether a Podman machine is needed and already running:
   - Windows/macOS: `podman machine list` — if the default machine's `LAST UP` doesn't say
     "Currently running", run `podman machine start`.
   - Linux rootless: usually no machine at all; confirm instead with `podman info`.
4. Check whether the GUI is already up before launching anything, to avoid a crash from a
   second process binding the same port: try `GET http://127.0.0.1:4173/api/status` (e.g.
   `curl -sf`). If it responds, report READY with the existing URL and stop — do not start a
   second instance.
5. If not already up, launch it in the **background** (do not block the calling shell/agent
   on a foreground process):
   - macOS/Linux: `nohup bash scripts/start-gui.sh > /tmp/harbor-eval-kit-gui.log 2>&1 &`
     (or the coding agent's own background-process facility if it has one).
   - Windows: `Start-Process -FilePath pwsh -ArgumentList '-File','scripts\start-gui.ps1' -WindowStyle Hidden`
     (or the coding agent's own background-process facility).
6. Poll `GET /api/status` (a few retries, short backoff) until it responds, then report:
   - the URL (http://127.0.0.1:4173)
   - Harbor/Podman versions and `dockerHost` from the response
   - the state dir path
7. If `podman info` still fails after step 3, or `/api/status` never comes up after step 6,
   stop and hand off to `Harbor_install/skills/harbor-doctor/SKILL.md` for full diagnosis —
   don't guess further here.

## Non-goals

- Does not run Harbor smoke tests (build/run/exec/mounts/network/labels) — that's
  `harbor-doctor`.
- Does not install anything — that's `harbor-bootstrap`.
- Does not touch containers/images/volumes.
