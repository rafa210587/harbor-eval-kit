---
name: harbor-doctor
description: Full health check of host, Podman, the Podman-Harbor compatibility gate and toolchains, reporting READY/DEGRADED/BLOCKED. Use for preflight, troubleshooting or a deep diagnosis.
---

# Harbor Doctor

## Trigger

Use for preflight, health checks, status or troubleshooting.

## Checks

### Host
- OS
- WSL detection
- shell
- architecture

### Podman
- version
- info
- socket/service
- build
- run
- exec
- bind mount
- named volume
- user-defined network
- labels
- cleanup

### Podman API and Compose gate

Run `node scripts/installation.ts gate <manifest>`. It selects the effective Podman
machine/connection, validates it with the Podman CLI, checks that the resolved API endpoint
identifies itself as Podman, and checks the configured `podman compose` provider plus the
`--wait`/`--pull` flags used by Harbor. Do not install Docker Engine and do not rely on
`alias docker=podman`. A preexisting Docker Compose CLI plugin is permitted as Podman's
provider; `podman-compose` versions without the required flags are blocked.

The connection name must exactly match the running machine or `<machine>-root`. If a custom
connection has no such match, configure a default connection with a matching name. Refuse
collisions instead of choosing one by prefix or list order.

Verify the exact operations Harbor performs by running a minimal Harbor task.

This gate is **OS-dependent** — the failure mode and the fix differ per platform, so report
which one applies rather than a generic "Docker not reachable".

**→ `Harbor_install/references/docker-host-por-so.md`** — the exact command and value per OS.

Report BLOCKED with the exact platform, the exact resolved (or unresolved) endpoint, and the
exact failing command — not just "Docker compatibility gate failed".

### Toolchains

Report but do not automatically mutate during doctor:
- Python
- uv
- Java
- javac
- Maven
- Gradle
- Node
- npm
- npx
- Harbor

## Output states

- READY
- DEGRADED
- BLOCKED

Every BLOCKED item must include the exact failing command and safe remediation.

## Current wrapper implementation

Both wrappers call `scripts/installation.ts gate` and then `smoke` after the immutable
installation snapshot.
Node.js 24+ and an already provisioned `docker.io/library/alpine:3.20` image are prerequisites;
the smoke refuses an implicit base pull. Each run uses unique prefixed names and the managed
label; its build sets `--pull=never --layers=false --force-rm`. It records intended names before
creation and verifies cleanup. A failed smoke leaves
its manifest reservations for inspection and cleanup. It does not remove other managed runs.
This covers Podman primitives including env and bind I/O, not the final Harbor task gate.
The resolver/API/Compose gate was exercised on Windows with Podman 6.0.2 on 2026-09-07;
macOS and Linux branches remain logic-tested only.
