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

### Docker compatibility gate

Harbor local execution is Docker-oriented. Check whether the current Harbor environment implementation can reach Podman through its expected API/CLI.

Do not assume `alias docker=podman` is sufficient.

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

Both wrappers call `scripts/installation.ts smoke` after the immutable installation snapshot.
Node.js 24+ and an already provisioned `docker.io/library/alpine:3.20` image are prerequisites;
the smoke refuses an implicit base pull. Each run uses unique prefixed names and the managed
label, records intended names before creation, and verifies cleanup. A failed smoke leaves
its manifest reservations for inspection and cleanup. It does not remove other managed runs.
This covers Podman primitives, not the full Docker compatibility/Harbor task gate above.
The shared implementation has offline fake-runner coverage; real host validation is pending.