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
   - Windows/macOS: let `scripts/start-gui.*` select the machine tied to Podman's configured
     connection. It invokes `podman machine start <exact-name>` only when `podman info` fails.
   - Linux rootless: usually no machine at all; confirm instead with `podman info`.
4. Launch the platform wrapper. Its Node lifecycle preflight validates the Harbor Eval Kit
   shape returned by `GET /api/status`; a valid existing instance makes the command return
   successfully without starting a second process.
5. Launch it in the **background** (do not block the calling shell/agent
   on a foreground process):
   - macOS/Linux: `nohup bash scripts/start-gui.sh > /tmp/harbor-eval-kit-gui.log 2>&1 &`
     (or the coding agent's own background-process facility if it has one).
   - Windows: `Start-Process -FilePath pwsh -ArgumentList '-File','scripts\start-gui.ps1' -WindowStyle Hidden`
     (or the coding agent's own background-process facility).
6. Poll `GET /api/status` (a few retries, short backoff) until it responds, then report:
   - the URL (http://127.0.0.1:4173)
   - Harbor/Podman versions and `dockerHost` from the response
   - the state dir path
7. If selected-connection `podman info` still fails after step 3, or `/api/status` never comes up after step 6,
   stop and hand off to `Harbor_install/skills/harbor-doctor/SKILL.md` for full diagnosis —
   don't guess further here.

## Non-goals

- Does not run Harbor smoke tests (build/run/exec/mounts/network/labels) — that's
  `harbor-doctor`.
- Does not install anything — that's `harbor-bootstrap`.
- Does not touch containers/images/volumes.
