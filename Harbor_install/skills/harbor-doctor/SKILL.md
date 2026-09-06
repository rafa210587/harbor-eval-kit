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

This gate is **OS-dependent** — the failure mode and the fix are different per platform, so
report which one applies rather than a generic "Docker not reachable":

- **Windows**: the Docker CLI/SDK's own default targets Docker Desktop's pipe even when it's
  stopped, so `harbor run --env docker` fails with something like "Docker daemon is not
  running" even though Podman is fine. Fix: `DOCKER_HOST=npipe:////./pipe/docker_engine`,
  scoped to the one command being tested.
- **macOS**: no Docker Desktop pipe to collide with, but Podman still runs inside a VM whose
  Docker-compatible socket path is machine-name-dependent. Fix: resolve it with
  `podman machine inspect --format '{{.ConnectionInfo.PodmanSocket.Path}}'` and set
  `DOCKER_HOST=unix://<that path>` for the one command.
- **Linux**: rootless Podman's own API socket (`podman info --format '{{.Host.RemoteSocket.Path}}'`)
  usually already speaks the Docker-compatible dialect with no fix needed — but check it
  actually reports something (an empty result, or a Podman machine active instead of native
  rootless Podman, means the same per-machine-socket fix as macOS applies).

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
